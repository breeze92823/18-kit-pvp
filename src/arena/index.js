// The arena: builds the voxel world from layout.js (with baked block light), its
// props (nether fires, the frost camp's campfire, end rods), every ambient emitter
// (lava pops and embers, falling ash, snowfall, ice glints, fireflies and leaves,
// river sparkles, waterfall mist, portal motes over the void), the animated lava and
// water, and the positional sound sources. main.js asks it which biome / liquid /
// surface the player is in and calls its one-shot effects (splash, landing, burning).
import { BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, PlaneGeometry } from 'three'
import { ARENA, COARSE_POINTER } from '../config.js'
import { VoxelWorld, blockInfo, setBlockGlow } from '../voxel/voxels.js'
import { animateBlocks, tilePalette } from '../voxel/blocktex.js'
import { buildArena } from './layout.js'
import { Particles, TEX } from '../lobby/fx.js'
import { buildCampfire, flameMaterial } from '../lobby/models.js'
import * as sfx from '../audio.js'

const PX = 1 / 16

export function createArena(scene) {
  const t0 = performance.now()
  const W = new VoxelWorld()
  const A = buildArena(W)
  for (const r of A.endRods) A.lightExtra.push({ x: Math.floor(r.x), y: Math.floor(r.y), z: Math.floor(r.z), color: '#efe0ff', level: 11 })
  W.bakeLight(A.lightExtra)
  const mesh = W.buildMesh()
  mesh.userData.staticShadow = true // never moves: its sun shadow is cached (shadowCache.js)
  const root = new Group()
  root.name = 'arena'
  root.add(mesh)
  scene.add(root)
  const colliders = W.buildColliders()
  if (import.meta.env.DEV) console.info(`[arena] ${W.cells.size} blocks, ${mesh.children.length} chunks, ${colliders} colliders, ${W.light.size} lit cells, ${Math.round(performance.now() - t0)} ms`)


  // --- props -------------------------------------------------------------------------
  // nether fires: two crossed pixel-flame planes each (3 shared materials, offset in time)
  const flameMats = [flameMaterial(2.6), flameMaterial(2.6), flameMaterial(2.6)]
  const flameGeo = new PlaneGeometry(0.95, 1.2)
  A.fires.forEach((f, i) => {
    const g = new Group()
    for (let k = 0; k < 2; k++) {
      const m = new Mesh(flameGeo, flameMats[i % 3])
      m.position.y = 0.58
      m.rotation.y = k * (Math.PI / 2) + Math.PI / 4
      m.renderOrder = 2
      g.add(m)
    }
    g.position.set(f.x, f.y, f.z)
    root.add(g)
  })
  const camp = buildCampfire()
  camp.root.position.set(A.camp.fire.x, A.camp.fire.y, A.camp.fire.z)
  root.add(camp.root)
  // end rods: a white glowing stick on a small purpur base
  const rodMat = new MeshStandardMaterial({ color: '#f6eeff', emissive: '#f1e4ff', emissiveIntensity: 2.4, roughness: 0.4 })
  const rodBaseMat = new MeshStandardMaterial({ color: '#b48ab4', roughness: 0.6 })
  const rodGeo = new BoxGeometry(2 * PX, 14 * PX, 2 * PX)
  const baseGeo = new BoxGeometry(6 * PX, 1.5 * PX, 6 * PX)
  for (const r of A.endRods) {
    const base = new Mesh(baseGeo, rodBaseMat)
    base.position.set(r.x, r.y + 0.75 * PX + 0.008, r.z) // lifted 8 mm: never coplanar with the block top
    const rod = new Mesh(rodGeo, rodMat)
    rod.position.set(r.x, r.y + 1.5 * PX + 7 * PX + 0.012, r.z)
    root.add(base, rod)
  }

  // --- particles ------------------------------------------------------------------------
  const sparkles = new Particles(700, { texture: TEX.star(), additive: true, hdr: 2.2 })
  const glows = new Particles(1400, { texture: TEX.soft(), additive: true, hdr: 1.9, nearFade: 0.3 })
  const smoke = new Particles(260, { texture: TEX.soft(), additive: false, nearFade: 0.6 })
  const flakes = new Particles(900, { texture: TEX.soft(), additive: false, nearFade: 0.9 })
  const chips = new Particles(600, { texture: TEX.square(), additive: false })
  root.add(sparkles.points, glows.points, smoke.points, flakes.points, chips.points)

  const col = (hex) => new Color(hex)
  const C = {
    ember: col('#ff8a2a'),
    emberHot: col('#ffd25a'),
    lava: col('#ff5a10'),
    smoke: col('#3a2a28'),
    ash: col('#6a5c58'),
    ashRed: col('#a8442e'),
    snow: col('#ffffff'),
    frost: col('#bff0ff'),
    fly: col('#d6ff6a'),
    pollen: col('#fff2b0'),
    water: col('#9cc8ff'),
    mist: col('#dfeaff'),
    portal: col('#c46bff'),
    portalDeep: col('#7a2bd6'),
    lilac: col('#e3b8ff'),
    rod: col('#ffffff'),
    glow: col('#ffd27a'),
    gold: col('#ffd84a'),
    gem: col('#4dffa0'),
  }
  const leafCols = [col('#2f6e1f'), col('#3f8a2a'), col('#f08cc8'), col('#5f8f2a')]
  const tmpC = new Color()
  const R = Math.random
  const scale = COARSE_POINTER ? 0.6 : 1
  const acc = {}
  const every = (key, rate, dt, fn) => {
    acc[key] = (acc[key] ?? 0) + dt * rate * scale
    while (acc[key] >= 1) {
      acc[key] -= 1
      fn()
    }
  }
  const near = (p, q, d) => Math.abs(p.x - q.x) < d && Math.abs(p.z - q.z) < d && Math.abs(p.y - q.y) < d

  // --- sound sources ---------------------------------------------------------------------
  {
    const lava = [...A.lavaLoops].sort((a, b) => b.n - a.n).slice(0, 6)
    for (const l of lava) sfx.addLoop('lava', l.x, l.y, l.z, 16)
    if (A.lavaFalls.length) {
      const f = A.lavaFalls[0]
      sfx.addLoop('lava', f.x, f.y - 3, f.z, 18, 1.3)
    }
    A.river.forEach((p) => sfx.addLoop('river', p.x, p.y, p.z, 13))
    const groups = []
    for (const f of A.falls) {
      const g = groups.find((q) => Math.hypot(q.x - f.x, q.z - f.z) < 6)
      if (g) {
        g.n++
        g.x += (f.x - g.x) / g.n
        g.z += (f.z - g.z) / g.n
      } else groups.push({ x: f.x, y: f.y, z: f.z, n: 1 })
    }
    for (const g of groups) sfx.addLoop('waterfall', g.x, g.y - 4, g.z, 22)
    A.fires.slice(0, 6).forEach((f) => sfx.addLoop('fire', f.x, f.y + 0.4, f.z, 9, 0.8))
    sfx.addLoop('fire', A.camp.fire.x, A.camp.fire.y + 0.5, A.camp.fire.z, 13)
    if (A.chorusTips[0]) sfx.addLoop('chorus', A.chorusTips[0].x, A.chorusTips[0].y - 14, A.chorusTips[0].z, 26)
    for (const s of A.spikes.slice(0, 2)) sfx.addLoop('icewind', s.x, s.y + s.H * 0.6, s.z, 24)
  }

  // --- lookups ------------------------------------------------------------------------------
  const CX = ARENA.cx
  const CZ = ARENA.cz
  const Q = ARENA.half
  const side = (v) => (v >= 1 ? 1 : v <= -2 ? -1 : 0)
  function biomeAt(x, z) {
    const lx = Math.floor(x - CX)
    const lz = Math.floor(z - CZ)
    if (Math.hypot(lx + 0.5, lz + 0.5) < ARENA.plazaR) return 'plaza'
    if (lx < -Q - 3 || lx > Q + 2 || lz < -Q - 3 || lz > Q + 2) return null
    const sx = side(lx)
    const sz = side(lz)
    if (!sx || !sz) return null
    return sx < 0 ? (sz < 0 ? 'spring' : 'frost') : sz < 0 ? 'summer' : 'fire'
  }
  const cellInfo = (x, y, z) => blockInfo(W.id(Math.floor(x), Math.floor(y), Math.floor(z)))

  // --- one-shot effects -------------------------------------------------------------------------
  function burst(ps, n, o) {
    for (let i = 0; i < n; i++) ps.emit(o())
  }
  function lavaPop(p, loud) {
    burst(glows, 7 + Math.floor(R() * 5), () => {
      const a = R() * Math.PI * 2
      const s = 0.6 + R() * 1.6
      return { x: p.x + (R() - 0.5) * 0.6, y: p.y + 0.05, z: p.z + (R() - 0.5) * 0.6, vx: Math.cos(a) * s, vy: 3 + R() * 4, vz: Math.sin(a) * s, gravity: -15, life: 0.6 + R() * 0.7, size: 0.07 + R() * 0.08, sizeEnd: 0.03, color: R() < 0.4 ? C.emberHot : C.ember, fadeIn: 0.02 }
    })
    burst(chips, 3, () => ({ x: p.x, y: p.y + 0.05, z: p.z, vx: (R() - 0.5) * 2, vy: 2 + R() * 3, vz: (R() - 0.5) * 2, gravity: -16, life: 0.5, size: 0.08, color: C.lava, fadeIn: 0.01 }))
    smoke.emit({ x: p.x, y: p.y + 0.3, z: p.z, vy: 0.9, sway: 0.3, life: 2.5, size: 0.4, sizeEnd: 1.5, color: C.smoke, alpha: 0.28, fadeIn: 0.1 })
    if (loud > 0) sfx.lavaPop(loud)
  }
  return {
    root,
    world: W,
    anchors: A,
    mesh,
    biomeAt,
    // block underfoot: { name, sound } for footsteps and landing chips
    surfaceAt(x, y, z) {
      for (const dy of [-0.05, -0.55]) {
        const info = cellInfo(x, y + dy, z)
        if (info && info.solid) return info
      }
      return null
    },
    // 'water' | 'lava' | null for the cell at this height
    liquidAt(x, y, z) {
      const info = cellInfo(x, y, z)
      if (!info?.liquid) return null
      // the surface is 2 px below the cell top unless the column continues up
      const top = Math.floor(y) + (cellInfo(x, y + 1, z)?.liquid === info.liquid ? 1 : 14 / 16)
      return y < top ? info.liquid : null
    },
    ladderAt(x, y, z) {
      return cellInfo(x, y, z)?.shape === 'ladder'
    },
    groundBelow(x, y, z) {
      return W.groundY(Math.floor(x), Math.floor(z), y)
    },
    kickDust(x, y, z, info, amount = 4, force = 1) {
      if (!info) return
      const pal = tilePalette(info.tex.top, 6)
      for (let i = 0; i < amount; i++) {
        const c = pal[Math.floor(R() * pal.length)]
        tmpC.setRGB(c[0], c[1], c[2])
        const a = R() * Math.PI * 2
        const s = (0.6 + R() * 1.2) * force
        chips.emit({ x: x + Math.cos(a) * 0.2, y: y + 0.05, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * s, vy: 1.5 + R() * 2 * force, vz: Math.sin(a) * s, gravity: -14, life: 0.45 + R() * 0.3, size: 0.07 + R() * 0.05, color: tmpC, fadeIn: 0.01 })
      }
      if (info.sound === 'snow') burst(flakes, Math.ceil(amount * 0.6), () => ({ x: x + (R() - 0.5) * 0.5, y: y + 0.1, z: z + (R() - 0.5) * 0.5, vx: (R() - 0.5) * force, vy: 0.6 + R() * force, vz: (R() - 0.5) * force, gravity: -3, drag: 1.5, life: 0.9, size: 0.18, sizeEnd: 0.4, color: C.snow, alpha: 0.6 }))
    },
    // water splash: a crown of droplets and a ring of foam
    splash(x, y, z, big = 1) {
      burst(chips, Math.round(14 * big), () => {
        const a = R() * Math.PI * 2
        const s = (1 + R() * 2.2) * big
        return { x: x + Math.cos(a) * 0.3, y, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: 2.5 + R() * 3.5 * big, vz: Math.sin(a) * s, gravity: -16, life: 0.6 + R() * 0.4, size: 0.06 + R() * 0.05, color: C.water, fadeIn: 0.01 }
      })
      burst(flakes, Math.round(8 * big), () => {
        const a = R() * Math.PI * 2
        return { x: x + Math.cos(a) * 0.5, y: y + 0.05, z: z + Math.sin(a) * 0.5, vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2, drag: 2.5, life: 0.8, size: 0.35, sizeEnd: 0.9, color: C.mist, alpha: 0.45 }
      })
    },
    // landing on the plaza after the drop: a shock ring of dust and sparkles
    landingBurst(x, y, z, info) {
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2
        smoke.emit({ x: x + Math.cos(a) * 0.4, y: y + 0.15, z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * 5, vz: Math.sin(a) * 5, vy: 0.4, drag: 2.6, life: 1.4, size: 0.5, sizeEnd: 1.6, color: tmpC.set('#8a6a58'), alpha: 0.5, fadeIn: 0.02 })
        sparkles.emit({ x, y: y + 0.3, z, vx: Math.cos(a) * 6, vz: Math.sin(a) * 6, vy: 1.5 + R() * 2, gravity: -5, drag: 1.8, life: 1 + R() * 0.6, size: 0.25, sizeEnd: 0.04, color: R() < 0.5 ? C.gold : C.glow, twinkle: 12 })
      }
      this.kickDust(x, y, z, info, 16, 2.2)
    },
    // flames licking up around a burning player (and steam when it is put out)
    burnFx(x, y, z) {
      burst(glows, 3, () => ({ x: x + (R() - 0.5) * 0.7, y: y + R() * 1.6, z: z + (R() - 0.5) * 0.7, vy: 1.6 + R() * 1.5, sway: 0.5, life: 0.5 + R() * 0.4, size: 0.12 + R() * 0.1, sizeEnd: 0.02, color: R() < 0.5 ? C.emberHot : C.ember, fadeIn: 0.03 }))
      if (R() < 0.3) smoke.emit({ x, y: y + 1.6, z, vy: 1, sway: 0.3, life: 1.5, size: 0.3, sizeEnd: 1, color: C.smoke, alpha: 0.3 })
    },
    steam(x, y, z) {
      burst(flakes, 14, () => ({ x: x + (R() - 0.5) * 0.8, y: y + R() * 0.8, z: z + (R() - 0.5) * 0.8, vy: 1.2 + R() * 1.2, sway: 0.5, drag: 0.6, life: 1.4, size: 0.3, sizeEnd: 1.1, color: C.mist, alpha: 0.4 }))
    },
    voidFx(x, y, z) {
      burst(sparkles, 30, () => ({ x: x + (R() - 0.5) * 2, y: y + R() * 2, z: z + (R() - 0.5) * 2, vy: 1 + R() * 3, sway: 1, life: 1.5, size: 0.3, sizeEnd: 0.03, color: R() < 0.5 ? C.portal : C.portalDeep, twinkle: 8 }))
    },

    update(dt, t, camera, p, viewportH, active) {
      animateBlocks(dt, t)
      const pulse = 0.9 + Math.sin(t * 1.3) * 0.07 + Math.sin(t * 3.1) * 0.03
      setBlockGlow('lava', 1.35 * pulse)
      setBlockGlow('glowstone', 1.6 * (0.96 + Math.sin(t * 2.3) * 0.04))
      for (let i = 0; i < flameMats.length; i++) flameMats[i].uniforms.time.value = t + i * 2.3
      camp.update(t)

      if (active) {
        const biome = biomeAt(p.x, p.z)
        // --- Fire Lands ---
        if (A.lava.length) {
          every('pop', 16, dt, () => {
            for (let k = 0; k < 3; k++) {
              const q = A.lava[Math.floor(R() * A.lava.length)]
              if (!near(q, p, 34)) continue
              const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)
              lavaPop(q, d < 14 && R() < 0.5 ? (1 - d / 14) * 0.8 : 0)
              break
            }
          })
          every('ember', 26, dt, () => {
            for (let k = 0; k < 3; k++) {
              const q = A.lava[Math.floor(R() * A.lava.length)]
              if (!near(q, p, 40)) continue
              glows.emit({ x: q.x + (R() - 0.5), y: q.y + 0.1, z: q.z + (R() - 0.5), vy: 0.8 + R() * 1.8, vx: (R() - 0.5) * 0.4, sway: 0.7, life: 2 + R() * 2.5, size: 0.05 + R() * 0.05, color: R() < 0.3 ? C.emberHot : C.ember, fadeIn: 0.1 })
              break
            }
          })
        }
        for (const f of A.fires) {
          if (!near(f, p, 40)) continue
          every(`fire${f.x}`, 5, dt, () => glows.emit({ x: f.x + (R() - 0.5) * 0.4, y: f.y + 0.4, z: f.z + (R() - 0.5) * 0.4, vy: 1.6 + R() * 1.6, sway: 0.8, life: 0.8 + R() * 0.8, size: 0.06 + R() * 0.05, color: C.ember, fadeIn: 0.05 }))
          every(`fsmoke${f.x}`, 1.6, dt, () => smoke.emit({ x: f.x, y: f.y + 1.1, z: f.z, vy: 0.8, sway: 0.4, life: 3.5, size: 0.35, sizeEnd: 1.6, color: C.smoke, alpha: 0.3, fadeIn: 0.15 }))
        }
        for (const f of A.lavaFalls) {
          if (!near(f, p, 50)) continue
          every(`lf${f.x}`, 6, dt, () => glows.emit({ x: f.x + (R() - 0.5) * 1.2, y: f.y - R() * (f.y - f.bottom), z: f.z + (R() - 0.5) * 1.2, vy: -2 - R() * 3, life: 1.2, size: 0.1, color: C.ember, fadeIn: 0.05 }))
        }
        if (biome === 'fire')
          every('ash', 16, dt, () => {
            const a = R() * Math.PI * 2
            const r = 2 + R() * 16
            flakes.emit({ x: p.x + Math.cos(a) * r, y: p.y + 2 + R() * 9, z: p.z + Math.sin(a) * r, vy: -0.35 - R() * 0.3, vx: 0.2, sway: 0.7, life: 6 + R() * 4, size: 0.06 + R() * 0.05, color: R() < 0.3 ? C.ashRed : C.ash, alpha: 0.85, fadeIn: 0.2 })
          })

        // --- Frost Peaks ---
        if (biome === 'frost' || (biome === 'plaza' && p.x < CX && p.z > CZ))
          every('snow', biome === 'frost' ? 55 : 14, dt, () => {
            const a = R() * Math.PI * 2
            const r = Math.sqrt(R()) * 20
            flakes.emit({ x: p.x + Math.cos(a) * r, y: p.y + 6 + R() * 10, z: p.z + Math.sin(a) * r, vy: -1.3 - R() * 0.9, vx: 0.45, sway: 0.9, life: 7 + R() * 3, size: 0.07 + R() * 0.07, color: C.snow, alpha: 0.95, fadeIn: 0.15 })
          })
        for (const s of A.spikes) {
          if (!near(s, p, 60) || s.H < 10) continue
          every(`glint${s.x}`, 1.2 + s.H / 18, dt, () => {
            const h = R() * s.H * 0.85
            const r = s.r * Math.pow(1 - h / s.H, 0.8) + 0.4
            const a = R() * Math.PI * 2
            sparkles.emit({ x: s.x + Math.cos(a) * r, y: s.y + h, z: s.z + Math.sin(a) * r, life: 0.9, size: 0.3, sizeEnd: 0.03, color: C.frost, twinkle: 9, fadeIn: 0.3 })
          })
          every(`powder${s.x}`, 0.8, dt, () => flakes.emit({ x: s.x + (R() - 0.5) * 2, y: s.y + s.H * (0.7 + R() * 0.3), z: s.z + (R() - 0.5) * 2, vx: 1.6 + R(), vy: -0.3, sway: 0.6, drag: 0.2, life: 4, size: 0.25, sizeEnd: 0.9, color: C.snow, alpha: 0.35, fadeIn: 0.2 }))
        }
        if (near(A.camp.fire, p, 40)) {
          const f = A.camp.fire
          every('campEmber', 8, dt, () => glows.emit({ x: f.x + (R() - 0.5) * 0.4, y: f.y + 0.5, z: f.z + (R() - 0.5) * 0.4, vy: 1.4 + R() * 1.6, sway: 0.8, life: 0.9 + R() * 0.9, size: 0.06 + R() * 0.05, color: C.ember, fadeIn: 0.05 }))
          every('campSmoke', 3, dt, () => smoke.emit({ x: f.x + (R() - 0.5) * 0.3, y: f.y + 1.1, z: f.z + (R() - 0.5) * 0.3, vy: 0.7 + R() * 0.4, vx: 0.15, sway: 0.4, life: 4 + R() * 2, size: 0.4, sizeEnd: 1.9, color: tmpC.set('#6a6a6a'), alpha: 0.3, fadeIn: 0.15 }))
        }

        // --- Summer Valley ---
        if (biome === 'summer' || biome === 'plaza') {
          every('fly', biome === 'summer' ? 7 : 2, dt, () => {
            const a = R() * Math.PI * 2
            const r = 3 + R() * 20
            const x = p.x + Math.cos(a) * r
            const z = p.z + Math.sin(a) * r
            if (biomeAt(x, z) !== 'summer') return
            glows.emit({ x, y: p.y + 0.3 + R() * 2.8, z, sway: 1.3, life: 4 + R() * 3, size: 0.1, color: C.fly, twinkle: 5, fadeIn: 0.3 })
          })
          every('pollen', 4, dt, () => {
            const x = p.x + (R() - 0.5) * 24
            const z = p.z + (R() - 0.5) * 24
            if (biomeAt(x, z) === 'summer') glows.emit({ x, y: p.y + 0.5 + R() * 4, z, vx: 0.2, vy: 0.05, sway: 0.4, life: 5 + R() * 3, size: 0.05, color: C.pollen, alpha: 0.7, fadeIn: 0.3 })
          })
        }
        every('leaf', 3, dt, () => {
          const tr = A.trees[Math.floor(R() * A.trees.length)]
          if (!tr || !near(tr, p, 45)) return
          chips.emit({ x: tr.x + (R() - 0.5) * tr.r * 2, y: tr.y - 1 + R(), z: tr.z + (R() - 0.5) * tr.r * 2, vy: -0.6, vx: 0.2, sway: 1.1, gravity: -0.15, drag: 0.6, life: 6 + R() * 3, size: 0.1, color: leafCols[Math.floor(R() * 4)], fadeIn: 0.1 })
        })
        every('river', 7, dt, () => {
          const q = A.river[Math.floor(R() * A.river.length)]
          if (!q || !near(q, p, 36)) return
          sparkles.emit({ x: q.x + (R() - 0.5) * 4, y: q.y - 0.08, z: q.z + (R() - 0.5) * 4, life: 0.7, size: 0.16, sizeEnd: 0.02, color: C.water, twinkle: 10, fadeIn: 0.3 })
        })
        for (const f of A.falls) {
          if (!near(f, p, 60)) continue
          every(`mist${f.x},${f.z}`, 2.2, dt, () => flakes.emit({ x: f.x + (R() - 0.5), y: f.bottom + R() * 1.5, z: f.z + (R() - 0.5), vx: (R() - 0.5) * 1.5, vy: -0.4, vz: (R() - 0.5) * 1.5, drag: 0.5, life: 2.5, size: 0.8, sizeEnd: 2.4, color: C.mist, alpha: 0.28, fadeIn: 0.15 }))
          every(`drop${f.x},${f.z}`, 4, dt, () => chips.emit({ x: f.x + (R() - 0.5) * 1.1, y: f.y - R() * 2, z: f.z + (R() - 0.5) * 1.1, vy: -4 - R() * 3, vx: (R() - 0.5) * 0.6, gravity: -10, life: 1.4, size: 0.06, color: C.water, fadeIn: 0.02 }))
        }

        // --- Spring Isles ---
        if (biome === 'spring' || biome === 'plaza') {
          every('portal', biome === 'spring' ? 16 : 4, dt, () => {
            const a = R() * Math.PI * 2
            const r = 2 + R() * 22
            const x = p.x + Math.cos(a) * r
            const z = p.z + Math.sin(a) * r
            if (biomeAt(x, z) !== 'spring') return
            sparkles.emit({ x, y: p.y - 6 - R() * 10, z, vy: 1.4 + R() * 2.2, sway: 0.7, life: 4 + R() * 3, size: 0.14 + R() * 0.14, sizeEnd: 0.03, color: R() < 0.6 ? C.portal : C.portalDeep, twinkle: 6, fadeIn: 0.3 })
          })
        }
        for (const c of A.chorusTips) {
          if (!near(c, p, 50)) continue
          every(`ch${c.x},${c.z}`, 1.2, dt, () => glows.emit({ x: c.x + (R() - 0.5) * 1.5, y: c.y + (R() - 0.5), z: c.z + (R() - 0.5) * 1.5, vy: 0.4, sway: 0.5, life: 2.5, size: 0.14, color: C.lilac, fadeIn: 0.3 }))
        }
        for (const r of A.endRods) {
          if (!near(r, p, 45)) continue
          every(`rod${r.x},${r.y},${r.z}`, 1.4, dt, () => sparkles.emit({ x: r.x + (R() - 0.5) * 0.3, y: r.y + 0.6 + R() * 0.4, z: r.z + (R() - 0.5) * 0.3, vx: (R() - 0.5) * 0.5, vy: -0.25, vz: (R() - 0.5) * 0.5, drag: 0.3, life: 2.2, size: 0.12, sizeEnd: 0.02, color: C.rod, twinkle: 11, fadeIn: 0.1 }))
        }

        // --- plaza: warm motes over the glowstone tiles ---
        for (const g of A.glowTiles) {
          if (!near(g, p, 30)) continue
          every(`glow${g.x},${g.z}`, 1.3, dt, () => glows.emit({ x: g.x + (R() - 0.5) * 0.9, y: g.y + 0.05, z: g.z + (R() - 0.5) * 0.9, vy: 0.5 + R() * 0.5, sway: 0.3, life: 2.4, size: 0.08, color: C.glow, alpha: 0.9, fadeIn: 0.2 }))
        }
      }

      sparkles.update(dt, camera, viewportH)
      glows.update(dt, camera, viewportH)
      smoke.update(dt, camera, viewportH)
      flakes.update(dt, camera, viewportH)
      chips.update(dt, camera, viewportH)
    },
  }
}
