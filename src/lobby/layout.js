// The lobby, block by block: a floating sky island of coarse dirt ringed with
// grass, the sunken pit in the middle with the open shaft down to the arena,
// the white-canopy stall, the log cabin, the crate pedestals, the leaderboard
// house, a cobblestone arch, a campfire corner and trees all round.
// Returns anchor points the props, NPCs and effects are placed at.
import { LOBBY } from '../config.js'
import { mulberry32 } from '../textures.js'
import { FACING } from '../voxel/voxels.js'

// Smooth 2D value noise (deterministic).
export function makeNoise(seed) {
  const rand = mulberry32(seed)
  const perm = new Float32Array(1024)
  for (let i = 0; i < perm.length; i++) perm[i] = rand()
  const at = (ix, iz) => perm[(((ix * 31 + iz * 57) % 1024) + 1024) % 1024]
  const s = (t) => t * t * (3 - 2 * t)
  return (x, z) => {
    const ix = Math.floor(x)
    const iz = Math.floor(z)
    const tx = s(x - ix)
    const tz = s(z - iz)
    const a = at(ix, iz)
    const b = at(ix + 1, iz)
    const c = at(ix, iz + 1)
    const d = at(ix + 1, iz + 1)
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz
  }
}

export function buildLobby(W) {
  const rand = mulberry32(1337)
  const n1 = makeNoise(11)
  const n2 = makeNoise(23)
  const n3 = makeNoise(37)
  const CX = 0
  const CZ = -4
  const R = LOBBY.radius
  const { pit } = LOBBY

  const anchors = { lanterns: [], torches: [], trees: [], flowers: [], floatingRocks: [] }

  // --- Island body ------------------------------------------------------------------
  const edgeR = (x, z) => {
    const a = Math.atan2(z - CZ, x - CX)
    return R + (n1(Math.cos(a) * 3 + 5, Math.sin(a) * 3 + 5) - 0.5) * 9 + (n2(Math.cos(a) * 7 + 9, Math.sin(a) * 7 + 9) - 0.5) * 3
  }
  const columnTop = new Map()
  for (let x = -R - 8; x <= R + 8; x++) {
    for (let z = CZ - R - 8; z <= CZ + R + 8; z++) {
      const d = Math.hypot(x + 0.5 - CX, z + 0.5 - CZ)
      const e = edgeR(x, z) - d // blocks from the edge, inward
      if (e < 0) continue
      const depth = Math.min(19, 2 + Math.floor(e * 0.62 + n3(x * 0.15, z * 0.15) * 5))
      const grass = e < LOBBY.grassRing + (n2(x * 0.18, z * 0.18) - 0.5) * 5
      let topY = -1
      // gentle grassy hummocks near the rim
      if (grass && e > 1.5 && e < 6 && n3(x * 0.22 + 40, z * 0.22) > 0.62) topY = 0
      for (let y = -depth; y <= topY; y++) {
        let b
        if (y === topY) {
          if (grass) b = 'grass'
          else {
            const v = n2(x * 0.3 + 100, z * 0.3)
            b = v > 0.72 ? 'coarse_dirt_b' : v < 0.2 ? 'rooted_dirt' : 'coarse_dirt'
            if (n3(x * 0.25 - 60, z * 0.25) > 0.78) b = 'podzol'
          }
        } else if (y > topY - 3) b = 'dirt'
        else if (y < -depth + 2) b = rand() < 0.5 ? 'deep_stone' : 'stone'
        else b = rand() < 0.08 ? 'gravel' : rand() < 0.06 ? 'andesite' : 'stone'
        W.set(x, y, z, b)
      }
      columnTop.set(`${x},${z}`, { topY, grass, e })
    }
  }
  const isGrass = (x, z) => columnTop.get(`${x},${z}`)?.grass
  const edgeOf = (x, z) => columnTop.get(`${x},${z}`)?.e ?? -1
  // Flatten under everything we build (structures sit on y = -1 tops).
  const flatten = (x0, z0, x1, z1, top = 'coarse_dirt') => {
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        W.set(x, 0, z, null)
        W.set(x, -1, z, top)
        W.set(x, -2, z, 'dirt')
      }
  }

  // --- The pit: a stepped funnel. Dark-wood rim (stairs stepping down), then light
  // stone terraces dropping one block per ring to the open shaft into the arena.
  // Rings are measured on an ellipse with a little noise so the outline is blocky
  // and irregular, like a hand-built crater.
  const pitQ = (x, z) => {
    const dx = (x + 0.5 - pit.cx) / pit.rx
    const dz = (z + 0.5 - pit.cz) / pit.rz
    const q = Math.hypot(dx, dz)
    return q + (n3(x * 0.55 + 7, z * 0.55 - 3) - 0.5) * (q > 0.75 ? 0.035 : 0.1)
  }
  const outward = (x, z) => {
    const dx = (x + 0.5 - pit.cx) / pit.rx
    const dz = (z + 0.5 - pit.cz) / pit.rz
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? FACING.east : FACING.west
    return dz > 0 ? FACING.south : FACING.north
  }
  const stone = (x, z) => {
    const v = n2(x * 0.5 + 20, z * 0.5 + 20)
    return v > 0.86 ? 'cobblestone' : v < 0.14 ? 'smooth_stone' : 'andesite'
  }
  const T = pit.terraces // [qMax, top block y] from the stone rim inward
  for (let x = Math.floor(pit.cx - pit.rx - 2); x <= Math.ceil(pit.cx + pit.rx + 2); x++) {
    for (let z = Math.floor(pit.cz - pit.rz - 2); z <= Math.ceil(pit.cz + pit.rz + 2); z++) {
      const q = pitQ(x, z)
      if (q > 1) continue
      for (let y = 1; y >= -4; y--) W.set(x, y, z, null)
      if (q > 0.9) {
        W.set(x, -1, z, 'spruce_stairs', outward(x, z))
        W.set(x, -2, z, 'spruce_planks')
      } else if (q > 0.8) {
        W.set(x, -2, z, 'spruce_stairs', outward(x, z))
        W.set(x, -3, z, 'spruce_planks')
      } else if (q > 0.72) {
        W.set(x, -2, z, 'spruce_slab')
        W.set(x, -3, z, 'spruce_planks')
      } else {
        let top = null
        for (const [qMax, y] of T) if (q <= qMax) top = y
        if (q <= pit.holeQ) {
          for (let y = -1; y >= -34; y--) W.set(x, y, z, null) // the open shaft
          continue
        }
        for (let y = top; y >= top - 3; y--) W.set(x, y, z, y === top ? stone(x, z) : rand() < 0.75 ? 'andesite' : 'stone')
      }
    }
  }
  // shaft walls: light stone near the top, mossy cobble and stone further down
  const cx0 = Math.floor(pit.cx - pit.rx)
  const cz0 = Math.floor(pit.cz - pit.rz)
  for (let x = cx0; x <= Math.ceil(pit.cx + pit.rx); x++)
    for (let z = cz0; z <= Math.ceil(pit.cz + pit.rz); z++) {
      if (pitQ(x, z) <= pit.holeQ) continue
      const nearHole = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dz]) => pitQ(x + dx, z + dz) <= pit.holeQ)
      if (!nearHole) continue
      for (let y = -7; y >= -16; y--) if (W.solid(x, y, z)) W.set(x, y, z, y > -10 ? (rand() < 0.6 ? 'andesite' : 'cobblestone') : rand() < 0.35 ? 'mossy_cobblestone' : 'stone')
    }
  const inPit = (x, z) => pitQ(x, z) <= 1.05
  anchors.pit = { x: pit.cx, y: 0, z: pit.cz, rx: pit.rx, rz: pit.rz }
  anchors.hole = { x: pit.cx, y: -6, z: pit.cz, r: Math.max(pit.rx, pit.rz) * pit.holeQ }
  anchors.welcome = { x: pit.cx + 0.5, y: 3.2, z: pit.cz - pit.rz * 0.45 }

  // --- Pavilion / stall (white canopy on dark posts) -----------------------------------
  {
    const x0 = -18
    const x1 = -12
    const z0 = 3
    const z1 = 10
    flatten(x0 - 2, z0 - 2, x1 + 2, z1 + 2)
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) W.set(x, -1, z, 'spruce_planks')
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) W.fill(px, 0, pz, px, 3, pz, 'dark_log')
    // beams under the canopy
    for (let x = x0 + 1; x < x1; x++) {
      W.set(x, 3, z0, 'dark_planks')
      W.set(x, 3, z1, 'dark_planks')
    }
    for (let z = z0 + 1; z < z1; z++) {
      W.set(x0, 3, z, 'dark_planks')
      W.set(x1, 3, z, 'dark_planks')
    }
    // canopy: overhanging wool, stepped to a ridge, with slab trim
    W.fill(x0 - 1, 4, z0 - 1, x1 + 1, 4, z1 + 1, 'white_wool')
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      W.set(x, 4, z0 - 2, 'white_slab')
      W.set(x, 4, z1 + 2, 'white_slab')
    }
    for (let z = z0 - 1; z <= z1 + 1; z++) {
      W.set(x0 - 2, 4, z, 'white_slab')
      W.set(x1 + 2, 4, z, 'white_slab')
    }
    W.fill(x0, 5, z0, x1, 5, z1, 'white_wool')
    W.fill(x0 + 1, 6, z0 + 1, x1 - 1, 6, z1 - 1, 'white_slab')
    // counter facing east (toward the pit) and side counters
    for (let z = z0 + 1; z <= z1 - 1; z++) {
      W.set(x1 - 1, 0, z, z === z0 + 1 || z === z1 - 1 ? 'dark_planks' : 'dark_stairs', FACING.west)
    }
    W.set(x0 + 1, 0, z0 + 1, 'barrel')
    W.set(x0 + 1, 0, z0 + 2, 'barrel')
    W.set(x0 + 1, 1, z0 + 1, 'barrel')
    W.set(x0 + 1, 0, z1 - 1, 'hay')
    W.set(x0 + 2, 0, z1 - 1, 'bookshelf')
    W.set(x0 + 1, 0, z1 - 2, 'barrel')
    anchors.shopNpc = { x: x0 + 3.5, y: 0, z: (z0 + z1 + 1) / 2, facing: Math.PI / 2 }
    anchors.stallChest = { x: x1 - 1 + 0.5, y: 1, z: z0 + 1.5, facing: Math.PI / 2 }
    anchors.lanterns.push({ x: (x0 + x1 + 1) / 2, y: 3.0, z: z0 + 0.5, hang: true }, { x: (x0 + x1 + 1) / 2, y: 3.0, z: z1 + 0.5, hang: true })
  }

  // --- Cabin behind the pit (spruce walls, dark log frame, gable roof) ------------------
  function house({ x0, x1, z0, z1, wall, frame, roof, floor, doorX, windows = [], height = 4 }) {
    flatten(x0 - 2, z0 - 2, x1 + 2, z1 + 3)
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) W.set(x, -1, z, floor)
    for (let y = 0; y < height; y++) {
      for (let x = x0; x <= x1; x++) {
        W.set(x, y, z0, wall)
        W.set(x, y, z1, wall)
      }
      for (let z = z0; z <= z1; z++) {
        W.set(x0, y, z, wall)
        W.set(x1, y, z, wall)
      }
    }
    for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) W.fill(px, 0, pz, px, height - 1, pz, frame)
    for (let x = x0; x <= x1; x++) {
      W.set(x, height - 1, z1, frame)
      W.set(x, height - 1, z0, frame)
    }
    // door (2 high) on the south wall
    W.set(doorX, 0, z1, null)
    W.set(doorX, 1, z1, null)
    for (const [wx, wz] of windows) W.set(wx, 1, wz, null)
    // gable roof along X: south slope faces north (tall side toward the ridge)
    const depth = z1 - z0 + 3 // with overhang
    const rows = Math.ceil(depth / 2)
    for (let i = 0; i < rows; i++) {
      const y = height + i
      const zs = z1 + 1 - i
      const zn = z0 - 1 + i
      for (let x = x0 - 1; x <= x1 + 1; x++) {
        if (zs > zn) {
          W.set(x, y, zs, roof, FACING.north)
          W.set(x, y, zn, roof, FACING.south)
        } else W.set(x, y, zs, roof.replace('stairs', 'slab'))
      }
      // gable ends
      for (let z = zn + 1; z < zs; z++) {
        W.set(x0, y, z, wall)
        W.set(x1, y, z, wall)
      }
    }
    return { roofTop: height + rows }
  }

  house({ x0: -5, x1: 5, z0: -27, z1: -20, wall: 'spruce_planks', frame: 'dark_log', roof: 'dark_stairs', floor: 'oak_planks', doorX: 0, windows: [[-3, -20], [3, -20], [-5, -24], [5, -24]] })
  // porch: slab step + fences + lanterns
  for (let x = -2; x <= 2; x++) W.set(x, -1, -19, 'spruce_planks')
  W.set(-2, 0, -19, 'spruce_fence')
  W.set(2, 0, -19, 'spruce_fence')
  anchors.lanterns.push({ x: -1.5, y: 2.6, z: -18.5, wall: true }, { x: 2.5, y: 2.6, z: -18.5, wall: true })
  W.set(-4, 0, -26, 'bookshelf')
  W.set(-3, 0, -26, 'bookshelf')
  W.set(4, 0, -26, 'barrel')
  W.set(4, 0, -21, 'barrel')

  // --- Crate plaza: two pedestals in front of a storage shed -----------------------------
  house({ x0: 9, x1: 18, z0: -30, z1: -25, wall: 'oak_planks', frame: 'spruce_log', roof: 'spruce_stairs', floor: 'spruce_planks', doorX: 13, windows: [[11, -25], [16, -25]] })
  flatten(7, -24, 20, -15)
  function pedestal(cx, cz) {
    W.set(cx, 0, cz, 'smooth_stone')
    W.set(cx, 0, cz - 1, 'andesite_stairs', FACING.south)
    W.set(cx, 0, cz + 1, 'andesite_stairs', FACING.north)
    W.set(cx - 1, 0, cz, 'andesite_stairs', FACING.east)
    W.set(cx + 1, 0, cz, 'andesite_stairs', FACING.west)
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) W.set(cx + dx, 0, cz + dz, 'andesite_slab')
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2) W.set(cx + dx, -1, cz + dz, rand() < 0.5 ? 'andesite' : 'gravel')
    return { x: cx + 0.5, y: 1, z: cz + 0.5 }
  }
  anchors.crates = { normal: pedestal(10, -19), ranked: pedestal(16, -19) }

  // --- Leaderboard house (oak, west-north) with the ice path in front -------------------
  house({ x0: -26, x1: -12, z0: -29, z1: -23, wall: 'oak_planks', frame: 'oak_log', roof: 'oak_stairs', floor: 'oak_planks', doorX: -14, windows: [[-26, -26], [-12, -26]], height: 5 })
  W.set(-14, 0, -23, 'oak_planks') // the board wall stays closed
  W.set(-14, 1, -23, 'oak_planks')
  for (let x = -25; x <= -13; x++) {
    W.set(x, -1, -21, 'packed_ice')
    W.set(x, -1, -20, 'packed_ice')
  }
  anchors.leaderboard = { x: -18.5, y: 3.4, z: -21.6 }
  anchors.duelsNpc = { x: -28.5, y: 0, z: -19.5, facing: Math.PI / 5 }
  flatten(-31, -23, -27, -16)

  // --- Cobblestone arch (west) ---------------------------------------------------------
  {
    const ax = -26
    flatten(ax - 3, -12, ax + 3, -1)
    for (const z of [-10, -9, -3, -2]) {
      for (let y = 0; y <= 4; y++) W.set(ax, y, z, rand() < 0.25 ? 'mossy_cobblestone' : 'cobblestone')
      W.set(ax - 1, 0, z, 'cobble_stairs', FACING.east)
      W.set(ax + 1, 0, z, 'cobble_stairs', FACING.west)
    }
    for (let z = -11; z <= -1; z++) {
      W.set(ax, 5, z, z === -11 || z === -1 ? 'cobble_slab' : 'cobblestone')
      if (z > -11 && z < -1) {
        W.set(ax - 1, 5, z, 'cobble_stairs', FACING.east)
        W.set(ax + 1, 5, z, 'cobble_stairs', FACING.west)
      }
    }
    for (let z = -9; z <= -3; z++) W.set(ax, 6, z, z % 2 ? 'cobble_slab' : 'cobblestone')
    for (let z = -8; z <= -4; z++) W.set(ax, 4, z, 'spruce_slab_top')
    for (let z = -8; z <= -4; z++) for (let x = ax - 2; x <= ax + 2; x++) W.set(x, -1, z, 'gravel')
    anchors.lanterns.push({ x: ax + 0.5, y: 3.5, z: -5.5, hang: true })
    anchors.arch = { x: ax + 0.5, y: 0, z: -5.5 }
  }

  // --- Campfire corner (east) ------------------------------------------------------------
  {
    const fx = 19
    const fz = 3
    flatten(fx - 4, fz - 4, fx + 4, fz + 4)
    for (let x = fx - 1; x <= fx + 1; x++) for (let z = fz - 1; z <= fz + 1; z++) W.set(x, -1, z, 'cobblestone')
    for (let x = fx - 2; x <= fx + 2; x++) {
      W.set(x, 0, fz - 3, 'spruce_slab')
      W.set(x, 0, fz + 3, 'spruce_slab')
    }
    W.set(fx + 3, 0, fz - 1, 'hay')
    W.set(fx + 3, 0, fz, 'hay')
    W.set(fx + 3, 1, fz, 'hay')
    anchors.campfire = { x: fx + 0.5, y: 0, z: fz + 0.5 }
  }

  // --- Kit NPC spot: west lip of the pit -------------------------------------------------
  const kx = Math.floor(pit.cx - pit.rx) - 2
  anchors.kitNpc = { x: kx + 0.5, y: 0, z: pit.cz + 3.5, facing: Math.PI / 2 + 0.5 }
  flatten(kx - 1, Math.floor(pit.cz) + 1, kx + 1, Math.floor(pit.cz) + 5)
  W.set(kx, -1, Math.floor(pit.cz) + 3, 'smooth_stone')
  W.set(kx, -1, Math.floor(pit.cz) + 4, 'smooth_stone')

  // --- Lamp posts along the walkway from spawn ------------------------------------------
  for (const [lx, lz] of [[-5, 6], [6, 6], [-12, -16], [11, -10], [-7, -16], [22, -12]]) {
    W.fill(lx, 0, lz, lx, 2, lz, 'dark_fence')
    W.set(lx, -1, lz, 'cobblestone')
    anchors.lanterns.push({ x: lx + 0.5, y: 3, z: lz + 0.5, post: true })
  }

  // --- Trees -----------------------------------------------------------------------------
  const occupied = (x, z, r) => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let y = 0; y <= 6; y++) if (W.solid(x + dx, y, z + dz)) return true
    return false
  }
  function oak(x, z, h = 5) {
    const y0 = W.groundY(x, z, 2)
    if (y0 === null) return
    for (let y = y0; y < y0 + h; y++) W.set(x, y, z, 'oak_log')
    const top = y0 + h
    for (let y = top - 2; y <= top + 1; y++) {
      const r = y >= top ? 1 : 2
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          const corner = Math.abs(dx) === r && Math.abs(dz) === r
          if (corner && (y === top + 1 || rand() < 0.55)) continue
          if (dx === 0 && dz === 0 && y < top) continue
          if (!W.solid(x + dx, y, z + dz)) W.set(x + dx, y, z + dz, 'oak_leaves')
        }
    }
    anchors.trees.push({ x: x + 0.5, y: top, z: z + 0.5, r: 2.5 })
  }
  function darkOak(x, z, h = 7) {
    const y0 = W.groundY(x, z, 2)
    if (y0 === null) return
    for (let y = y0; y < y0 + h; y++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) W.set(x + dx, y, z + dz, 'dark_log')
    // a couple of side branches
    W.set(x - 1, y0 + h - 2, z, 'dark_log')
    W.set(x + 2, y0 + h - 3, z + 1, 'dark_log')
    const top = y0 + h
    for (let y = top - 3; y <= top + 1; y++) {
      const r = y === top + 1 ? 2 : y === top - 3 ? 2 : 3
      for (let dx = -r; dx <= r + 1; dx++)
        for (let dz = -r; dz <= r + 1; dz++) {
          const ex = Math.max(Math.abs(dx - 0.5) - r + 0.5, 0)
          const ez = Math.max(Math.abs(dz - 0.5) - r + 0.5, 0)
          if (ex + ez > 0 && rand() < 0.6) continue
          if (Math.abs(dx - 0.5) + Math.abs(dz - 0.5) > r * 1.6 + 0.6) continue
          if (!W.solid(x + dx, y, z + dz)) W.set(x + dx, y, z + dz, 'dark_leaves')
        }
    }
    anchors.trees.push({ x: x + 1, y: top, z: z + 1, r: 3.5 })
  }
  // big trees behind the buildings and around the rim
  const treeSpots = [
    ['dark', -10, -33], ['dark', 3, -36], ['oak', -2, -33], ['dark', 22, -32], ['oak', 25, -26], ['dark', 28, -18],
    ['oak', 30, -8], ['dark', 29, 4], ['oak', 26, 14], ['dark', 16, 22], ['oak', 6, 26], ['dark', -9, 25],
    ['oak', -22, 20], ['dark', -30, 12], ['oak', -33, 0], ['dark', -36, -12], ['oak', -26, -36], ['oak', -14, -35],
    ['oak', 12, -36], ['oak', 33, -15], ['oak', -18, 26], ['oak', 20, -5], ['oak', -6, 20], ['dark', -24, 4],
  ]
  for (const [type, x, z] of treeSpots) {
    if (edgeOf(x, z) < 1.5) continue
    if (occupied(x, z, 1)) continue
    if (type === 'dark') darkOak(x, z, 6 + Math.floor(rand() * 3))
    else oak(x, z, 4 + Math.floor(rand() * 3))
  }

  // --- Flora: tall grass, flowers, bushes on grass; a few tufts on the dirt edge -------
  const flowerKinds = ['poppy', 'cornflower', 'dandelion', 'daisy', 'allium', 'cornflower', 'poppy']
  for (const [k, v] of columnTop) {
    const [x, z] = k.split(',').map(Number)
    const topY = v.topY
    if (inPit(x, z)) continue
    const top = W.name(x, topY, z)
    if (W.id(x, topY + 1, z)) continue
    if (top === 'grass') {
      const r = rand()
      if (r < 0.22) W.set(x, topY + 1, z, rand() < 0.85 ? 'tall_grass' : 'fern')
      else if (r < 0.28) {
        const f = flowerKinds[Math.floor(n1(x * 0.2, z * 0.2) * flowerKinds.length * 0.999)]
        W.set(x, topY + 1, z, f)
        anchors.flowers.push({ x: x + 0.5, y: topY + 1.6, z: z + 0.5 })
      } else if (r < 0.295 && v.e > 2) {
        W.set(x, topY + 1, z, 'bush')
        if (rand() < 0.4 && !W.id(x + 1, topY + 1, z)) W.set(x + 1, topY + 1, z, 'bush')
      } else if (r < 0.3) W.set(x, topY + 1, z, 'sapling')
    } else if ((top === 'podzol' || top === 'coarse_dirt') && v.e < 12 && rand() < 0.05) {
      W.set(x, topY + 1, z, 'tall_grass')
    }
  }

  // --- Floating rocks around the island (bobbed by fx.js) -----------------------------
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2
    const dist = R + 4 + rand() * 26
    anchors.floatingRocks.push({
      x: CX + Math.cos(a) * dist,
      y: -4 + rand() * 24,
      z: CZ + Math.sin(a) * dist,
      size: rand() < 0.3 ? 2 : 1,
      tex: rand() < 0.6 ? 'stone' : rand() < 0.5 ? 'coarse_dirt' : 'cobblestone',
    })
  }

  anchors.isGrass = isGrass
  anchors.center = { x: CX, z: CZ, r: R }
  return anchors
}
