// The arena, block by block. A square floating in a starry void, split into four
// quadrants by 2-block void seams, with a round brick plaza bridging them in the
// middle (four glowstone tiles set into its floor):
//   NW  Spring Isles   end-stone islets over the void (fall = death), two purpur
//                      towers and a giant twisted chorus plant
//   NE  Summer Valley  terraced grassy hills, a river with lily pads and seagrass
//                      that pours off two edges as waterfalls, oaks, azalea bushes
//   SW  Frost Peaks    snow, a frozen lake, giant snow-capped ice spikes, floating
//                      ice chunks and a wooden camp by the seam
//   SE  Fire Lands     netherrack with lava pools and a lava fall, red mounds,
//                      and a nether-brick castle with glowstone windows and a ladder
// Local cell coords (x, z) are relative to ARENA.cx / cz; y is relative to the
// plaza floor surface (top block of the floor at y = -1). Returns anchors in world
// coordinates for props, effects and sounds.
import { ARENA } from '../config.js'
import { mulberry32 } from '../textures.js'
import { FACING } from '../voxel/voxels.js'
import { makeNoise } from '../lobby/layout.js'

export function buildArena(W) {
  const CX = ARENA.cx
  const CZ = ARENA.cz
  const FY = ARENA.floorY
  const Q = ARENA.half // quadrant cells: +side 1..Q, -side -Q-1..-2
  const PR = ARENA.plazaR
  const rand = mulberry32(4242)
  const R = rand
  const n1 = makeNoise(101)
  const n2 = makeNoise(202)
  const n3 = makeNoise(303)
  const n4 = makeNoise(404)

  const set = (x, y, z, name, meta = 0) => W.set(x + CX, y + FY, z + CZ, name, meta)
  const clear = (x, y, z) => W.set(x + CX, y + FY, z + CZ, null)
  const nameAt = (x, y, z) => W.name(x + CX, y + FY, z + CZ)
  const solidAt = (x, y, z) => W.solid(x + CX, y + FY, z + CZ)
  const empty = (x, y, z) => !W.id(x + CX, y + FY, z + CZ)
  // world point: cell centre in x/z, y = the given local height
  const wp = (x, y, z) => ({ x: x + CX + 0.5, y: y + FY, z: z + CZ + 0.5 })
  const topOf = (x, z, from = 46) => {
    for (let y = from; y >= -30; y--) if (solidAt(x, y, z)) return y
    return null
  }

  const A = {
    center: { x: CX, y: FY, z: CZ },
    lava: [], // lava surface cells (world) for pops and embers
    lavaLoops: [],
    fires: [],
    falls: [], // waterfalls { x, z, top, bottom } (world)
    lavaFalls: [],
    river: [], // river centreline samples (world)
    spikes: [],
    iceChunks: [],
    trees: [],
    endRods: [],
    islets: [],
    chorusTips: [],
    glowTiles: [],
    lightExtra: [],
    camp: null,
    castle: null,
  }

  // --- regions ------------------------------------------------------------------------
  const side = (v) => (v >= 1 ? 1 : v <= -2 ? -1 : 0)
  const plazaD = (x, z) => Math.hypot(x + 0.5, z + 0.5)
  const inSquare = (x, z) => x >= -Q - 1 && x <= Q && z >= -Q - 1 && z <= Q
  const quadrant = (x, z) => {
    const sx = side(x)
    const sz = side(z)
    if (!sx || !sz || !inSquare(x, z)) return null
    return sx < 0 ? (sz < 0 ? 'spring' : 'frost') : sz < 0 ? 'summer' : 'fire'
  }
  // blocks from the nearest outer edge or seam (how thick the island hangs below)
  const edgeDist = (x, z) => Math.min(Q - x, x + Q + 1, Q - z, z + Q + 1, Math.abs(x + 0.5) - 1.5, Math.abs(z + 0.5) - 1.5)
  const thickness = (x, z) => {
    const e = Math.max(0, edgeDist(x, z))
    let t = 3 + Math.min(13, e * 0.5) + (n3(x * 0.15, z * 0.15) - 0.5) * 5
    if (n4(x * 0.3 + 9, z * 0.3) > 0.72) t += 3 // hanging lumps
    return Math.max(2, Math.floor(t))
  }

  // --- river (summer) ---------------------------------------------------------------
  const RIVER = [[8, -49], [13, -36], [18, -27], [27, -20], [36, -15], [49, -10]]
  const rSamples = []
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i]
    const [bx, bz] = RIVER[i + 1]
    const steps = 12
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      // a little Catmull-Rom-ish bend by nudging toward the next point
      rSamples.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
  }
  rSamples.push(RIVER[RIVER.length - 1])
  const riverInfo = (x, z) => {
    let best = 1e9
    let bi = 0
    const px = x + 0.5
    const pz = z + 0.5
    for (let i = 0; i < rSamples.length - 1; i++) {
      const [ax, az] = rSamples[i]
      const [bx, bz] = rSamples[i + 1]
      const dx = bx - ax
      const dz = bz - az
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)))
      const d = Math.hypot(px - ax - dx * t, pz - az - dz * t)
      if (d < best) {
        best = d
        bi = i + t
      }
    }
    const s = bi / (rSamples.length - 1)
    return { d: best, w: 2.4 + 0.8 * Math.sin(s * 11) + (n2(x * 0.2, z * 0.2) - 0.5) * 0.8, s }
  }
  for (let i = 0; i < rSamples.length; i += 6) A.river.push(wp(rSamples[i][0], -1, rSamples[i][1]))

  // --- castle footprint (fire) -------------------------------------------------------
  const C = { x0: 18, x1: 29, z0: 15, z1: 27, door: 21 }
  const nearCastle = (x, z, m = 2) => x >= C.x0 - m && x <= C.x1 + m && z >= C.z0 - m && z <= C.z1 + m
  // path from the plaza to the castle door: no lava, no mounds
  const onPath = (x, z) => {
    const ax = 10
    const az = 11
    const bx = C.x0 - 1
    const bz = C.door
    const dx = bx - ax
    const dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    return Math.hypot(x - ax - dx * t, z - az - dz * t) < 1.8
  }
  const CAMP = { x0: -12, x1: -5, z0: 36, z1: 42 }
  const nearCamp = (x, z, m = 3) => x >= CAMP.x0 - m && x <= CAMP.x1 + m && z >= CAMP.z0 - m - 4 && z <= CAMP.z1 + m

  // --- quadrant ground -----------------------------------------------------------------
  const tops = new Map() // "x,z" -> top block y (for decoration)
  const k2 = (x, z) => `${x},${z}`
  for (let x = -Q - 1; x <= Q; x++) {
    for (let z = -Q - 1; z <= Q; z++) {
      const q = quadrant(x, z)
      if (!q || q === 'spring') continue
      const bottom = -thickness(x, z)
      const mix = R()
      if (q === 'frost') {
        let top = -1
        const lake = n2(x * 0.07 + 3, z * 0.07 + 9) + ((-x + z) / (2 * Q)) * 0.32
        const isLake = lake > 0.86 && !nearCamp(x, z)
        if (!isLake) {
          const drift = n1(x * 0.13, z * 0.13)
          if (drift > 0.7) top = 0
          if (drift > 0.82) top = 1
        }
        const icePatch = isLake || n3(x * 0.32 + 5, z * 0.32) > 0.8
        for (let y = bottom; y <= top; y++) {
          let b
          if (y === top) b = icePatch && top === -1 ? 'ice' : 'snow'
          else if (y >= top - 2) b = icePatch ? (y === top - 1 ? 'ice' : 'frost_ice') : 'snow'
          else if (y >= top - 4) b = 'dirt'
          else b = R() < 0.12 ? 'frost_ice' : R() < 0.5 ? 'stone' : 'deep_stone'
          set(x, y, z, b)
        }
        tops.set(k2(x, z), { top, ice: icePatch })
      } else if (q === 'fire') {
        let top = -1
        const lv = n2(x * 0.17 + 71, z * 0.17 + 13)
        const blocked = nearCastle(x, z) || onPath(x, z) || plazaD(x, z) < PR + 1.5
        const lava = lv > 0.58 && !blocked
        const m = n1(x * 0.11 + 40, z * 0.11)
        if (!lava && !blocked && m > 0.63) top = -1 + Math.floor((m - 0.63) * 18)
        for (let y = bottom; y <= top; y++) {
          let b = n4(x * 0.25 + y * 0.3, z * 0.25) > 0.55 ? 'netherrack_b' : 'netherrack'
          if (y === top && !lava && lv > 0.52 && lv <= 0.58 && mix < 0.4 && top === -1) b = 'magma'
          set(x, y, z, b)
        }
        if (lava) {
          set(x, -1, z, 'lava')
          if (lv > 0.7) set(x, -2, z, 'lava')
          A.lava.push(wp(x, -1 + 14 / 16, z))
        }
        tops.set(k2(x, z), { top, lava, path: onPath(x, z) })
      } else if (q === 'summer') {
        const r = riverInfo(x, z)
        const far = Math.max(0, Math.min(1, (plazaD(x, z) - 19) / 26))
        let hh = far * 4.4 + (n1(x * 0.09 + 5, z * 0.09 - 7) - 0.5) * 3.6 * far + (n3(x * 0.2, z * 0.2) - 0.5) * far
        // banks flatten toward the river
        const bank = r.d - r.w
        if (bank < 2.5) hh = 0
        else hh = Math.min(hh, (bank - 2.5) / 2.2)
        let top = -1 + Math.max(0, Math.floor(hh))
        const river = r.d < r.w
        let waterTop = null
        if (river) {
          const deep = r.d < r.w * 0.55
          waterTop = -1
          top = deep ? -3 : -2
        }
        for (let y = bottom; y <= top; y++) {
          let b
          if (y === top) {
            if (river) b = n4(x * 0.4, z * 0.4) > 0.62 ? 'clay' : n4(x * 0.4 + 30, z * 0.4) < 0.3 ? 'gravel' : 'sand'
            else if (bank < 1.3) b = n2(x * 0.5, z * 0.5) > 0.55 ? 'grass' : 'sand'
            else b = 'grass'
          } else if (y >= top - 2) b = river || bank < 1.3 ? 'sand' : 'dirt'
          else b = R() < 0.08 ? 'gravel' : R() < 0.06 ? 'andesite' : 'stone'
          set(x, y, z, b)
        }
        if (river) {
          for (let y = top + 1; y <= waterTop; y++) set(x, y, z, 'water')
          // seagrass on the bed, lily pads on the surface
          if (R() < (top === -3 ? 0.32 : 0.14)) set(x, top + 1, z, 'seagrass')
          else if (R() < 0.07 && nameAt(x, -1, z) === 'water') set(x, -1, z, 'lily_pad')
        }
        tops.set(k2(x, z), { top, river, bank })
      }
    }
  }

  // --- waterfalls where the river runs off the edges --------------------------------------
  for (let x = -Q - 1; x <= Q; x++)
    for (let z = -Q - 1; z <= Q; z++) {
      const t = tops.get(k2(x, z))
      if (!t?.river) continue
      const out = []
      if (z === -Q - 1) out.push([x, z - 1])
      if (x === Q) out.push([x + 1, z])
      for (const [fx, fz] of out) {
        const len = 8 + Math.floor(R() * 7)
        for (let y = -1; y >= -1 - len; y--) set(fx, y, fz, 'water')
        A.falls.push({ ...wp(fx, -1, fz), bottom: -1 - len + FY })
      }
    }

  // --- the fire quadrant's lava fall off the south edge -------------------------------------
  {
    const fx = 36
    for (let z = 39; z <= Q; z++)
      for (let x = fx - 1; x <= fx + 1; x++) {
        for (let y = 0; y <= 4; y++) clear(x, y, z)
        set(x, -1, z, 'lava')
        if (Math.abs(x - fx) < 1) set(x, -2, z, 'lava')
        A.lava.push(wp(x, -1 + 14 / 16, z))
      }
    for (let x = fx - 1; x <= fx; x++) {
      const len = 12
      for (let y = -1; y >= -1 - len; y--) set(x, y, Q + 1, 'lava')
      A.lavaFalls.push({ ...wp(x, -1, Q + 1), bottom: -1 - len + FY })
    }
  }

  // --- Spring Isles: islets over the void --------------------------------------------
  const ISLETS = [
    { x: -14, z: -14, r: 6.2, h: -1 },
    { x: -28, z: -10, r: 7.2, h: -1, tower: 20 },
    { x: -11, z: -29, r: 7.0, h: -1, tower: 17 },
    { x: -26, z: -26, r: 5.8, h: 0, chorus: true },
    { x: -40, z: -21, r: 6.4, h: -1 },
    { x: -21, z: -40, r: 6.0, h: 0 },
    { x: -38, z: -38, r: 7.4, h: 1 },
    { x: -42, z: -6, r: 4.0, h: 0 },
    { x: -5, z: -42, r: 4.0, h: 0 },
    { x: -20, z: -20, r: 1.9, h: -1 },
    { x: -31.5, z: -32, r: 1.8, h: 0 },
    { x: -14, z: -36, r: 1.6, h: -1 },
    { x: -35, z: -14, r: 1.6, h: -1 },
    { x: -45, z: -31, r: 2.2, h: 0 },
  ]
  for (const I of ISLETS) {
    const span = Math.ceil(I.r + 2)
    const flatR = I.tower ? 4.6 : I.chorus ? 3 : 0
    for (let x = Math.floor(I.x - span); x <= Math.ceil(I.x + span); x++)
      for (let z = Math.floor(I.z - span); z <= Math.ceil(I.z + span); z++) {
        if (quadrant(x, z) !== 'spring' && plazaD(x, z) >= PR) continue
        const a = Math.atan2(z + 0.5 - I.z, x + 0.5 - I.x)
        const rr = I.r + (n3(Math.cos(a) * 2 + I.x, Math.sin(a) * 2 + I.z) - 0.5) * (I.r > 3 ? 2.4 : 0.8)
        const d = Math.hypot(x + 0.5 - I.x, z + 0.5 - I.z)
        if (d > rr) continue
        const k = 1 - d / rr
        let top = I.h + Math.floor((1 - (d / rr) ** 2) * (I.r > 3 ? 2.7 : 1.2))
        if (d < flatR) top = I.h + 2
        const depth = Math.max(1, Math.floor(rr * 1.2 * Math.pow(k, 0.6) + (n4(x * 0.3, z * 0.3) - 0.5) * 3))
        for (let y = top - depth; y <= top; y++) set(x, y, z, 'end_stone')
        tops.set(k2(x, z), { top, islet: true })
      }
    A.islets.push({ ...wp(I.x - 0.5, I.h, I.z - 0.5), r: I.r })
  }

  // purpur towers
  function tower(cx, cz, base, H, front) {
    const top = base + H
    for (let dx = -3; dx <= 3; dx++)
      for (let dz = -3; dz <= 3; dz++) {
        const x = cx + dx
        const z = cz + dz
        const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3
        const corner = Math.abs(dx) === 3 && Math.abs(dz) === 3
        set(x, base - 1, z, 'purpur_block')
        for (let y = base; y <= top + 1; y++) {
          const lvl = y - base
          if (corner) {
            set(x, y, z, 'purpur_pillar')
            continue
          }
          if (y === top) {
            set(x, y, z, 'purpur_block')
            continue
          }
          if (y === top + 1) {
            if (edge) set(x, y, z, (dx + dz) % 2 === 0 ? 'purpur_block' : 'purpur_slab')
            continue
          }
          if (edge) {
            const along = Math.abs(dx) === 3 ? dz : dx
            const window = Math.abs(along) <= 0 && lvl % 6 >= 2 && lvl % 6 <= 3 && lvl > 1
            set(x, y, z, window ? null : lvl % 6 === 5 ? 'purpur_block' : 'end_stone_bricks')
          } else if (lvl % 6 === 5) set(x, y, z, 'purpur_block')
          else clear(x, y, z)
        }
      }
    // door toward the plaza
    const [fx, fz] = front
    for (let y = base; y <= base + 1; y++) clear(cx + fx * 3, y, cz + fz * 3)
    // balconies on the two sides
    const bal = base + 11
    if (bal < top - 2) {
      for (const s of [-1, 1]) {
        const ox = fz ? s : 0
        const oz = fx ? s : 0
        for (let a = -2; a <= 2; a++)
          for (let o = 4; o <= 5; o++) {
            const x = cx + ox * o + (fz ? 0 : a)
            const z = cz + oz * o + (fx ? 0 : a)
            set(x, bal, z, 'end_stone_bricks')
            if (o === 5 || Math.abs(a) === 2) set(x, bal + 1, z, Math.abs(a) === 2 && o === 5 ? 'purpur_block' : 'purpur_slab')
          }
        // a green gem on each balcony
        const gx = cx + ox * 5
        const gz = cz + oz * 5
        set(gx, bal + 1, gz, 'end_gem')
      }
    }
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) A.endRods.push(wp(cx + dx, top + 2, cz + dz))
  }
  for (const I of ISLETS) {
    if (!I.tower) continue
    const cx = Math.round(I.x - 0.5)
    const cz = Math.round(I.z - 0.5)
    const toPlaza = Math.abs(I.x) > Math.abs(I.z) ? [1, 0] : [0, 1]
    tower(cx, cz, I.h + 3, I.tower, toPlaza)
  }

  // the giant twisted chorus plant
  {
    const I = ISLETS.find((i) => i.chorus)
    const base = I.h + 3
    const H = 32
    const fill = (px, py, pz, r, name = 'chorus_plant') => {
      for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++)
        for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++)
          for (let z = Math.floor(pz - r); z <= Math.ceil(pz + r); z++)
            if (Math.hypot(x + 0.5 - px, y + 0.5 - py, z + 0.5 - pz) <= r) set(x, y, z, name)
    }
    let tipX = I.x
    let tipZ = I.z
    for (let t = 0; t <= 1; t += 0.006) {
      const px = I.x + Math.sin(t * 3.4 + 0.4) * 5.2 * t - 0.5
      const pz = I.z + Math.cos(t * 2.8) * 4.2 * t - 3.6 * t - 0.5
      const py = base + t * H
      const r = 0.9 + 2.5 * Math.exp(-(((t - 0.34) / 0.2) ** 2)) + 0.7 * (1 - t)
      fill(px, py, pz, r)
      tipX = px
      tipZ = pz
    }
    fill(tipX, base + H + 0.8, tipZ, 1.2, 'chorus_flower')
    A.chorusTips.push({ x: tipX + CX, y: base + H + 1 + FY, z: tipZ + CZ })
    // side arms ending in flowers
    const arms = [[0.5, 1, 0], [0.62, 0, -1], [0.74, -1, 0], [0.86, 0, 1]]
    for (const [t, ax, az] of arms) {
      let px = Math.round(I.x + Math.sin(t * 3.4 + 0.4) * 5.2 * t - 0.5)
      let pz = Math.round(I.z + Math.cos(t * 2.8) * 4.2 * t - 3.6 * t - 0.5)
      let py = Math.round(base + t * H)
      const out = 3 + Math.floor(R() * 2)
      for (let i = 1; i <= out + 2; i++) set(px + ax * i, py, pz + az * i, 'chorus_plant')
      px += ax * (out + 2)
      pz += az * (out + 2)
      for (let i = 1; i <= 3; i++) set(px, py + i, pz, 'chorus_plant')
      set(px, py + 4, pz, 'chorus_flower')
      A.chorusTips.push(wp(px, py + 5, pz))
    }
  }
  // small chorus plants on the other islets
  function chorus(x, z, y) {
    const h = 3 + Math.floor(R() * 4)
    for (let i = 0; i < h; i++) set(x, y + i, z, 'chorus_plant')
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    for (let b = 0; b < 2; b++) {
      const [dx, dz] = dirs[Math.floor(R() * 4)]
      const by = y + 1 + Math.floor(R() * (h - 1))
      set(x + dx, by, z + dz, 'chorus_plant')
      set(x + dx, by + 1, z + dz, 'chorus_flower')
    }
    set(x, y + h, z, 'chorus_flower')
    A.chorusTips.push(wp(x, y + h + 1, z))
  }
  for (const I of ISLETS) {
    if (I.tower || I.chorus || I.r < 3.5) continue
    const x = Math.round(I.x - 0.5 + (R() - 0.5) * 2)
    const z = Math.round(I.z - 0.5 + (R() - 0.5) * 2)
    const t = topOf(x, z)
    if (t !== null && plazaD(x, z) > PR + 2) chorus(x, z, t + 1)
  }
  // end rods on a few islets: little lamps
  for (const I of ISLETS) {
    if (I.r < 5 || I.tower || I.chorus) continue
    const x = Math.round(I.x - 0.5 + 2)
    const z = Math.round(I.z - 0.5 - 2)
    const t = topOf(x, z)
    if (t !== null && empty(x, t + 1, z)) A.endRods.push(wp(x, t + 1, z))
  }

  // --- Frost Peaks: giant ice spikes ------------------------------------------------------
  const SPIKES = [
    { x: -28, z: 27, r: 5.6, H: 37, tx: 0.06, tz: -0.04 },
    { x: -37, z: 35, r: 4.3, H: 29, tx: -0.06, tz: 0.05 },
    { x: -19, z: 36, r: 4.0, H: 24, tx: 0.08, tz: 0.06 },
    { x: -38, z: 17, r: 3.7, H: 22, tx: -0.07, tz: -0.06 },
    { x: -18, z: 21, r: 2.9, H: 15, tx: 0.05, tz: -0.07 },
    { x: -29, z: 41, r: 3.1, H: 16, tx: 0.0, tz: 0.08 },
    { x: -43, z: 26, r: 2.6, H: 13, tx: -0.06, tz: 0.0 },
  ]
  for (let i = 0; i < 12; i++) {
    const x = -6 - Math.floor(R() * 40)
    const z = 4 + Math.floor(R() * 40)
    if (plazaD(x, z) < PR + 5 || nearCamp(x, z, 4)) continue
    if (SPIKES.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 4)) continue
    SPIKES.push({ x, z, r: 1 + R() * 0.9, H: 4 + Math.floor(R() * 6), tx: (R() - 0.5) * 0.15, tz: (R() - 0.5) * 0.15, small: true })
  }
  const spikeCells = []
  for (const S of SPIKES) {
    const span = Math.ceil(S.r + 2 + Math.max(Math.abs(S.tx), Math.abs(S.tz)) * S.H)
    for (let y = -1; y <= S.H; y++) {
      const t = Math.max(0, y) / S.H
      const r = S.r * Math.pow(1 - t, 0.8) + (y < 2 ? 0.6 : 0)
      if (r < 0.35) continue
      const ox = S.x + S.tx * y + Math.sin(y * 0.35 + S.x) * 0.5
      const oz = S.z + S.tz * y + Math.cos(y * 0.3 + S.z) * 0.5
      for (let x = Math.floor(S.x - span); x <= Math.ceil(S.x + span); x++)
        for (let z = Math.floor(S.z - span); z <= Math.ceil(S.z + span); z++) {
          if (quadrant(x, z) !== 'frost') continue
          const d = Math.hypot(x + 0.5 - ox, z + 0.5 - oz)
          if (d > r + (n1(x * 0.5 + y * 0.31, z * 0.5 - y * 0.27) - 0.5) * 1.6) continue
          // carved windows and arches through the big spikes
          if (!S.small && y > 3 && y < S.H - 4 && r > 2.2 && n4(x * 0.28 + y * 0.19, z * 0.28 - y * 0.23) > 0.74) continue
          set(x, y, z, 'frost_ice')
          spikeCells.push([x, y, z])
        }
    }
    A.spikes.push({ ...wp(S.x, 0, S.z), r: S.r, H: S.H })
  }
  // floating ice chunks around the big spikes
  for (const S of SPIKES.slice(0, 4)) {
    for (let c = 0; c < 3; c++) {
      const a = R() * Math.PI * 2
      const d = S.r + 3 + R() * 4
      const cx = Math.round(S.x + Math.cos(a) * d)
      const cz = Math.round(S.z + Math.sin(a) * d)
      const cy = 10 + Math.floor(R() * (S.H - 14))
      if (quadrant(cx, cz) !== 'frost') continue
      const n = 2 + Math.floor(R() * 4)
      for (let i = 0; i < n; i++) {
        const x = cx + Math.floor(R() * 2)
        const y = cy - Math.floor(R() * 2)
        const z = cz + Math.floor(R() * 2)
        set(x, y, z, 'frost_ice')
        spikeCells.push([x, y, z])
      }
      A.iceChunks.push(wp(cx, cy, cz))
    }
  }
  // snow settles on every exposed ice step
  for (const [x, y, z] of spikeCells) if (nameAt(x, y, z) === 'frost_ice' && empty(x, y + 1, z)) set(x, y, z, 'snowy_ice')

  // --- Frost camp: a spruce deck with a gable roof and a campfire --------------------------
  {
    const { x0, x1, z0, z1 } = CAMP
    for (let x = x0 - 1; x <= x1 + 1; x++) for (let z = z0 - 4; z <= z1 + 1; z++) for (let y = 0; y <= 9; y++) clear(x, y, z)
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        set(x, -1, z, 'snow')
        set(x, 0, z, 'spruce_planks')
      }
    for (let x = x0 + 2; x <= x1 - 2; x++) set(x, 0, z0 - 1, 'spruce_stairs', FACING.south)
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) for (let y = 1; y <= 4; y++) set(x, y, z, 'spruce_log')
    for (let x = x0 + 1; x < x1; x++) {
      set(x, 1, z1, 'spruce_fence')
      if (x < x0 + 2 || x > x1 - 2) set(x, 1, z0, 'spruce_fence')
    }
    for (let z = z0 + 1; z < z1; z++) {
      set(x0, 1, z, 'spruce_fence')
      set(x1, 1, z, 'spruce_fence')
    }
    const zc = (z0 + z1) / 2
    for (let x = x0 - 1; x <= x1 + 1; x++)
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        const dz = Math.abs(z - zc)
        const y = 4 + Math.round(4 - dz)
        if (dz < 0.6) set(x, y, z, 'spruce_planks')
        else set(x, y, z, 'spruce_stairs', z < zc ? FACING.south : FACING.north)
      }
    // gable ends: planks under the roof slopes
    for (const x of [x0, x1])
      for (let z = z0 + 1; z < z1; z++) {
        const dz = Math.abs(z - zc)
        for (let y = 4; y < 4 + Math.round(4 - dz); y++) set(x, y, z, 'spruce_planks')
      }
    set(x0 + 1, 1, z1 - 1, 'barrel')
    set(x0 + 2, 1, z1 - 1, 'barrel')
    set(x1 - 1, 1, z1 - 1, 'hay')
    set(x1 - 1, 2, z1 - 1, 'hay')
    set(x1 - 1, 1, z1 - 2, 'hay')
    const fire = wp(Math.round((x0 + x1) / 2), 0, z0 - 4)
    A.camp = { fire, x: fire.x, z: fire.z }
    A.lightExtra.push({ x: Math.round((x0 + x1) / 2) + CX, y: FY, z: z0 - 4 + CZ, color: '#ff9a3a', level: 14 })
    // logs to sit on around the fire
    set(Math.round((x0 + x1) / 2) - 2, 0, z0 - 4, 'spruce_slab')
    set(Math.round((x0 + x1) / 2) + 2, 0, z0 - 4, 'spruce_slab')
  }

  // --- Fire Lands: the nether-brick castle -----------------------------------------------
  {
    const { x0, x1, z0, z1, door } = C
    for (let x = x0 - 1; x <= x1 + 1; x++)
      for (let z = z0 - 1; z <= z1 + 1; z++) {
        for (let y = 0; y <= 16; y++) clear(x, y, z)
        set(x, -1, z, x >= x0 && x <= x1 && z >= z0 && z <= z1 ? 'nether_bricks' : 'netherrack')
        set(x, -2, z, 'netherrack')
      }
    const tower = (x, z) => (x <= x0 + 2 || x >= x1 - 2) && (z <= z0 + 2 || z >= z1 - 2)
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const wall = x === x0 || x === x1 || z === z0 || z === z1
        if (tower(x, z)) {
          for (let y = 0; y <= 10; y++) set(x, y, z, 'nether_bricks')
          const cornerOfTower = (x === x0 || x === x0 + 2 || x === x1 || x === x1 - 2) && (z === z0 || z === z0 + 2 || z === z1 || z === z1 - 2)
          if (cornerOfTower) set(x, 11, z, 'nether_bricks')
          continue
        }
        if (wall) for (let y = 0; y <= 6; y++) set(x, y, z, 'nether_bricks')
        set(x, 7, z, 'nether_bricks') // roof
        if (wall && (x + z) % 2 === 0) set(x, 8, z, 'nether_bricks') // parapet
        else if (wall) set(x, 8, z, 'nether_brick_slab')
      }
    // the keep over the gate: taller front with three spires
    for (let z = door - 2; z <= door + 2; z++) {
      for (let x = x0; x <= x0 + 1; x++) for (let y = 0; y <= 10; y++) set(x, y, z, 'nether_bricks')
    }
    set(x0, 11, door - 2, 'nether_bricks')
    set(x0, 12, door - 2, 'nether_bricks')
    set(x0, 11, door + 2, 'nether_bricks')
    set(x0, 12, door + 2, 'nether_bricks')
    for (let y = 11; y <= 13; y++) set(x0, y, door, 'nether_bricks')
    set(x0 + 1, 11, door, 'nether_brick_fence')
    // gate (a dark doorway) and the big glowing window above it
    for (let x = x0; x <= x0 + 1; x++) for (let y = 0; y <= 2; y++) clear(x, y, door)
    for (let z = door - 1; z <= door + 1; z++) for (let y = 5; y <= 6; y++) set(x0, y, z, 'glowstone')
    // side and back windows
    for (const z of [z0, z1]) for (const x of [x0 + 5, x0 + 6]) for (let y = 3; y <= 4; y++) set(x, y, z, 'glowstone')
    for (const z of [door - 3, door + 3]) for (let y = 3; y <= 4; y++) set(x1, y, z, 'glowstone')
    for (const z of [door - 3, door + 3]) set(x0 + 6, 8, z, 'glowstone') // roof lamps
    // interior: hollow hall, glowstone in the ceiling, a lava basin
    for (let x = x0 + 2; x <= x1 - 1; x++)
      for (let z = z0 + 1; z <= z1 - 1; z++) {
        if (tower(x, z)) continue
        for (let y = 0; y <= 6; y++) clear(x, y, z)
      }
    set(x0 + 5, 6, door, 'glowstone')
    set(x1 - 3, 6, door, 'glowstone')
    set(x1 - 3, -1, door - 1, 'lava')
    set(x1 - 3, -1, door, 'lava')
    set(x1 - 3, -1, door + 1, 'lava')
    for (let z = door - 2; z <= door + 2; z++) {
      set(x1 - 4, 0, z, 'nether_brick_slab')
      set(x1 - 2, 0, z, 'nether_brick_slab')
    }
    // ladder up the front wall to the roof (gap in the parapet above it)
    const lz = z0 + 3
    for (let y = 0; y <= 8; y++) set(x0 - 1, y, lz, 'ladder', FACING.east)
    clear(x0, 8, lz)
    set(x0, 7, lz, 'nether_bricks')
    // fires on the front towers
    for (const z of [z0 + 1, z1 - 1]) {
      set(x0 + 1, 11, z, 'netherrack')
      A.fires.push(wp(x0 + 1, 12, z))
      A.lightExtra.push({ x: x0 + 1 + CX, y: 12 + FY, z: z + CZ, color: '#ff8a2a', level: 12 })
    }
    A.castle = { door: wp(x0 - 1, 0, door), center: wp((x0 + x1) / 2, 0, (z0 + z1) / 2) }
  }

  // --- Summer: trees, bushes, flowers, sugar cane, boulders -----------------------------
  const summerTop = (x, z) => {
    const t = tops.get(k2(x, z))
    return t && !t.river ? t.top : null
  }
  function leafBall(cx, cy, cz, rx, ry, name, holes = 0.08) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rx); z <= Math.ceil(cz + rx); z++) {
          const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 + ((z + 0.5 - cz) / rx) ** 2
          if (d > 1 + (R() - 0.5) * 0.35) continue
          if (d > 0.7 && R() < holes) continue
          if (empty(x, y, z)) set(x, y, z, typeof name === 'function' ? name() : name)
        }
  }
  const treeSpots = []
  for (let tries = 0; tries < 160 && treeSpots.length < 13; tries++) {
    const x = 4 + Math.floor(R() * (Q - 7))
    const z = -Q + 3 + Math.floor(R() * (Q - 7))
    if (plazaD(x, z) < 20) continue
    const rv = riverInfo(x, z)
    if (rv.d < rv.w + 3.5) continue
    if (treeSpots.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 8)) continue
    const top = summerTop(x, z)
    if (top === null) continue
    treeSpots.push([x, z, top])
  }
  treeSpots.forEach(([x, z, top], i) => {
    const kind = i % 3 === 0 ? 'big' : i % 3 === 1 ? 'oak' : 'azalea'
    if (kind === 'big') {
      const H = 7 + Math.floor(R() * 3)
      for (let y = top + 1; y <= top + H; y++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(x + dx, y, z + dz, 'dark_log')
      // stubby branches
      set(x - 1, top + H - 2, z, 'dark_log')
      set(x + 2, top + H - 3, z + 1, 'dark_log')
      leafBall(x + 1, top + H + 0.5, z + 1, 4.6, 2.6, 'dark_leaves')
      leafBall(x + 1, top + H + 2.2, z + 1, 3, 1.8, 'dark_leaves')
      A.trees.push({ ...wp(x + 0.5, top + H + 1 , z + 0.5), r: 4.5 })
    } else if (kind === 'oak') {
      const H = 5 + Math.floor(R() * 2)
      for (let y = top + 1; y <= top + H; y++) set(x, y, z, 'oak_log')
      leafBall(x + 0.5, top + H - 0.5, z + 0.5, 2.8, 2.2, 'oak_leaves')
      A.trees.push({ ...wp(x, top + H, z), r: 2.8 })
    } else {
      const H = 3 + Math.floor(R() * 2)
      for (let y = top + 1; y <= top + H; y++) set(x, y, z, 'oak_log')
      leafBall(x + 0.5, top + H + 0.2, z + 0.5, 2.4, 1.6, () => (R() < 0.45 ? 'flowering_azalea' : 'azalea_leaves'))
      A.trees.push({ ...wp(x, top + H, z), r: 2.4 })
    }
  })
  // azalea bushes, many along the river
  for (let i = 0; i < 26; i++) {
    const x = 3 + Math.floor(R() * (Q - 4))
    const z = -Q + 1 + Math.floor(R() * (Q - 4))
    if (plazaD(x, z) < 18) continue
    const rv = riverInfo(x, z)
    if (rv.d < rv.w + 0.8 || (rv.d > rv.w + 7 && R() < 0.5)) continue
    const top = summerTop(x, z)
    if (top === null) continue
    leafBall(x + 0.5, top + 1.2, z + 0.5, 1.2 + R() * 0.8, 1.1, () => (R() < 0.5 ? 'flowering_azalea' : 'azalea_leaves'), 0.05)
  }
  // a fallen log lying across the river
  {
    const [lx, lz] = rSamples[Math.floor(rSamples.length * 0.46)]
    const z = Math.round(lz)
    for (let x = Math.round(lx) - 4; x <= Math.round(lx) + 3; x++) {
      const t = tops.get(k2(x, z))
      if (!t) continue
      if (t.river) set(x, -1, z, 'oak_log_x')
      else if (t.top === -1 && empty(x, 0, z)) set(x, 0, z, 'oak_log_x')
    }
  }
  // mossy boulders
  for (let i = 0; i < 5; i++) {
    const x = 8 + Math.floor(R() * (Q - 12))
    const z = -Q + 4 + Math.floor(R() * (Q - 12))
    const rv = riverInfo(x, z)
    const top = summerTop(x, z)
    if (top === null || plazaD(x, z) < 19 || rv.d < rv.w + 2) continue
    for (const [dx, dy, dz] of [[0, 1, 0], [1, 1, 0], [0, 1, 1], [0, 2, 0], [1, 1, 1]]) if (R() < 0.85 || dy === 1) set(x + dx, top + dy, z + dz, R() < 0.6 ? 'mossy_cobblestone' : 'cobblestone')
  }
  // grass, ferns and flowers on every open grass top; sugar cane at the water's edge
  const FLOWERS = [['dandelion', 4], ['orange_tulip', 4], ['cornflower', 2], ['poppy', 2], ['daisy', 2], ['allium', 1], ['pink_tulip', 1]]
  const pickFlower = () => {
    let r = R() * 16
    for (const [n, w] of FLOWERS) if ((r -= w) <= 0) return n
    return 'dandelion'
  }
  for (const [kk, t] of tops) {
    const [x, z] = kk.split(',').map(Number)
    if (quadrant(x, z) !== 'summer' || t.river || plazaD(x, z) < PR + 0.5) continue
    if (nameAt(x, t.top, z) !== 'grass' && nameAt(x, t.top, z) !== 'sand') continue
    if (!empty(x, t.top + 1, z)) continue
    const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => tops.get(k2(x + dx, z + dz))?.river)
    if (nearWater && t.top === -1 && R() < 0.2) {
      const h = 2 + Math.floor(R() * 2)
      for (let y = 0; y < h; y++) set(x, t.top + 1 + y, z, 'sugar_cane')
      continue
    }
    if (nameAt(x, t.top, z) !== 'grass') continue
    const r = R()
    if (r < 0.2) set(x, t.top + 1, z, 'tall_grass')
    else if (r < 0.25) set(x, t.top + 1, z, 'fern')
    else if (r < 0.35) set(x, t.top + 1, z, pickFlower())
  }

  // --- Fire Lands: mound tops, roots and fires ------------------------------------------------
  for (const [kk, t] of tops) {
    const [x, z] = kk.split(',').map(Number)
    if (quadrant(x, z) !== 'fire' || t.lava || nearCastle(x, z, 1)) continue
    if (!empty(x, t.top + 1, z) || !/^netherrack/.test(nameAt(x, t.top, z) ?? '')) continue
    if (R() < 0.035) set(x, t.top + 1, z, 'crimson_roots')
  }
  for (let i = 0, made = 0; i < 80 && made < 9; i++) {
    const x = 4 + Math.floor(R() * (Q - 6))
    const z = 4 + Math.floor(R() * (Q - 6))
    const t = tops.get(k2(x, z))
    if (!t || t.lava || t.path || nearCastle(x, z, 2) || plazaD(x, z) < PR + 3) continue
    if (!empty(x, t.top + 1, z)) continue
    if (A.fires.some((f) => Math.hypot(f.x - (x + CX), f.z - (z + CZ)) < 6)) continue
    A.fires.push(wp(x, t.top + 1, z))
    A.lightExtra.push({ x: x + CX, y: t.top + 1 + FY, z: z + CZ, color: '#ff8a2a', level: 12 })
    made++
  }

  // --- Frost: little snow piles --------------------------------------------------------
  for (const [kk, t] of tops) {
    const [x, z] = kk.split(',').map(Number)
    if (quadrant(x, z) !== 'frost' || t.ice || nearCamp(x, z, 1)) continue
    if (nameAt(x, t.top, z) === 'snow' && empty(x, t.top + 1, z) && R() < 0.035) set(x, t.top + 1, z, 'snow_slab')
  }

  // --- The plaza: a round brick floor over the seams, hanging stone cone below ------------
  const P = Math.ceil(PR)
  for (let x = -P - 1; x <= P; x++)
    for (let z = -P - 1; z <= P; z++) {
      const d = plazaD(x, z)
      if (d >= PR) continue
      for (let y = 0; y <= 14; y++) clear(x, y, z)
      let b = 'mud_bricks'
      if (d < 2.6) b = 'brown_cobble'
      else if ((d > 5.3 && d < 6.2) || (d > 10.2 && d < 11.1)) b = 'packed_mud'
      else if (d >= 14) b = 'brown_cobble'
      set(x, -1, z, b)
      set(x, -2, z, 'mud_bricks')
      set(x, -3, z, 'mud_bricks')
      const depth = 4 + Math.floor((PR - d) * 0.8 + (n3(x * 0.3 + 50, z * 0.3) - 0.5) * 4)
      for (let y = -4; y >= -depth; y--) {
        if (W.id(x + CX, y + FY, z + CZ)) continue
        set(x, y, z, R() < 0.2 ? 'brown_cobble' : R() < 0.5 ? 'andesite' : R() < 0.7 ? 'deep_stone' : 'stone')
      }
      // a low half-height rim, open toward the four quadrants
      if (d >= 14.2) {
        const a = Math.atan2(z + 0.5, x + 0.5)
        const toDiag = Math.abs(((a - Math.PI / 4 + Math.PI * 2) % (Math.PI / 2)) - Math.PI / 4)
        if (Math.PI / 4 - toDiag > 0.2) set(x, 0, z, 'mud_brick_slab')
      }
    }
  for (const [x, z] of [[5, 5], [-6, 5], [5, -6], [-6, -6]]) {
    set(x, -1, z, 'glowstone')
    A.glowTiles.push(wp(x, 0, z))
  }

  // --- sound anchors: lava clusters --------------------------------------------------------
  const cells = new Map()
  for (const p of A.lava) {
    const k = `${Math.floor(p.x / 10)},${Math.floor(p.z / 10)}`
    const c = cells.get(k) ?? { x: 0, y: 0, z: 0, n: 0 }
    c.x += p.x
    c.y += p.y
    c.z += p.z
    c.n++
    cells.set(k, c)
  }
  for (const c of cells.values()) if (c.n >= 5) A.lavaLoops.push({ x: c.x / c.n, y: c.y / c.n, z: c.z / c.n, n: c.n })

  return A
}
