// The lobby: voxel island + props + NPCs + effects. createLobby(scene, lighting)
// builds everything and returns the per-frame update, the interactables the
// crosshair / E key can use, crate animations and footstep surface lookups.
import { Color, Group, PointLight, Sprite, SpriteMaterial, CanvasTexture, SRGBColorSpace } from 'three'
import { COARSE_POINTER, CRATES, LOBBY } from '../config.js'
import { VoxelWorld, blockInfo } from '../voxel/voxels.js'
import { tilePalette } from '../voxel/blocktex.js'
import { buildLobby } from './layout.js'
import { buildCampfire, buildChest, buildLantern } from './models.js'
import { buildCharacter, SKINS } from './characters.js'
import { buildLeaderboards, buildWelcome, headerLabel } from './holograms.js'
import { buildBeam, buildClouds, buildFloatingRocks, Particles, TEX } from './fx.js'
import { createBots } from './bots.js'
import { artCanvas } from './pixelart.js'
import { solidBox } from '../propkit.js'

const CLICK = COARSE_POINTER ? 'TAP' : 'RIGHT CLICK'

export function createLobby(scene, lighting, { onEvent } = {}) {
  const voxels = new VoxelWorld()
  const A = buildLobby(voxels)
  const mesh = voxels.buildMesh()
  scene.add(mesh)
  const colliders = voxels.buildColliders()
  if (import.meta.env.DEV) console.info(`[lobby] ${voxels.cells.size} blocks, ${mesh.geometry.groups.length} materials, ${colliders} colliders`)

  const props = new Group()
  scene.add(props)
  const interactables = []

  // --- particles ---
  const sparkles = new Particles(700, { texture: TEX.star(), additive: true, hdr: 2.2 })
  const glows = new Particles(500, { texture: TEX.soft(), additive: true, hdr: 1.8 })
  const smoke = new Particles(160, { texture: TEX.soft(), additive: false })
  const chips = new Particles(500, { texture: TEX.square(), additive: false })
  scene.add(sparkles.points, glows.points, smoke.points, chips.points)

  // --- NPCs ---
  const npcs = []
  function npc(anchor, opts, action, label) {
    const ch = buildCharacter(opts)
    ch.root.position.set(anchor.x, anchor.y, anchor.z)
    ch.root.rotation.y = anchor.facing ?? 0
    props.add(ch.root)
    solidBox(0.32, 0.9, 0.32, anchor.x, anchor.y + 0.9, anchor.z)
    const entry = { ch, anchor, facing: anchor.facing ?? 0 }
    npcs.push(entry)
    interactables.push({ action, label, x: anchor.x, y: anchor.y + 0.95, z: anchor.z, hx: 0.45, hy: 0.95, hz: 0.45, npc: entry })
    return entry
  }
  const kitNpc = npc(
    A.kitNpc,
    {
      skin: SKINS.kitMaster,
      outline: '#ffe23a',
      tag: [
        { text: 'Kits', size: 40, color: '#3fe0ff' },
        { text: CLICK, size: 34, color: '#ffe04a' },
      ],
      tagHeight: 0.52,
    },
    'kits',
    'Choose a kit',
  )
  const duels = npc(
    A.duelsNpc,
    {
      skin: SKINS.duelist,
      armor: 'dark',
      item: 'sword',
      tag: [
        { text: '74 playing', size: 30, color: '#ffffff', weight: 600 },
        { text: 'Duels', size: 40, color: '#3fe0ff' },
        { text: CLICK, size: 34, color: '#ffe04a' },
      ],
      tagHeight: 0.66,
    },
    'duels',
    'Duels',
  )
  npc(
    A.shopNpc,
    {
      skin: SKINS.merchant,
      tag: [
        { text: 'Shop', size: 40, color: '#3fe0ff' },
        { text: CLICK, size: 34, color: '#ffe04a' },
      ],
      tagHeight: 0.52,
    },
    'shop',
    'Open the shop',
  )
  let duelsCount = 74

  // --- Crates on their pedestals, with beams and labels ---
  const crates = {}
  for (const kind of ['normal', 'ranked']) {
    const a = A.crates[kind]
    const chest = buildChest(kind)
    chest.root.position.set(a.x, a.y, a.z)
    props.add(chest.root)
    const color = kind === 'normal' ? '#ffcf3a' : '#e04bff'
    const beam = buildBeam(color)
    beam.root.position.set(a.x, a.y + 0.6, a.z)
    props.add(beam.root)
    const lbl = headerLabel(kind === 'normal' ? 'NORMAL CRATE' : 'RANKED CRATE', kind === 'normal' ? '#ffb31a' : '#ff4be0', CLICK, '#ffe04a', 0.42)
    lbl.position.set(a.x, a.y + 2.05, a.z)
    props.add(lbl)
    solidBox(0.45, 0.32, 0.45, a.x, a.y + 0.32, a.z)
    crates[kind] = { chest, beam, a, color: new Color(color), open: 0, openTarget: 0, timer: 0, reward: null, boost: 0, label: lbl }
    interactables.push({ action: `crate:${kind}`, label: `Open ${CRATES[kind].name}`, x: a.x, y: a.y + 0.4, z: a.z, hx: 0.55, hy: 0.55, hz: 0.55 })
  }
  // the stall's display chest
  {
    const c = buildChest('normal')
    c.root.position.set(A.stallChest.x, A.stallChest.y, A.stallChest.z)
    c.root.rotation.y = A.stallChest.facing
    props.add(c.root)
  }

  // --- Lanterns (the first few get real lights at night) ---
  let lit = 0
  for (const l of A.lanterns) {
    const lan = buildLantern({ hang: !!l.hang })
    lan.position.set(l.x, l.y - (l.hang ? 0.62 : 0), l.z)
    props.add(lan)
    if (lighting && l.post && lit < 2) {
      lighting.addLamp(l.x, l.y - 0.2, l.z, lan.userData.bulb)
      lit++
    }
  }

  // --- Campfire ---
  const fire = buildCampfire()
  fire.root.position.set(A.campfire.x, 0, A.campfire.z)
  props.add(fire.root)
  solidBox(0.5, 0.2, 0.5, A.campfire.x, 0.2, A.campfire.z)
  const fireLight = new PointLight('#ff9a3a', 6, 11, 2)
  fireLight.position.set(A.campfire.x, 1.1, A.campfire.z)
  props.add(fireLight)

  // --- Holograms + leaderboards ---
  props.add(buildWelcome(A.welcome))
  props.add(buildLeaderboards(A.leaderboard))

  // --- Sky dressing ---
  const clouds = buildClouds()
  scene.add(clouds.root)
  const rocks = buildFloatingRocks(A.floatingRocks)
  scene.add(rocks.root)

  // --- Bots ---
  const bots = createBots(scene, voxels, A, LOBBY.bots, onEvent)

  // --- Reward icon that floats out of an opened crate ---
  function rewardSprite(icon) {
    const tex = new CanvasTexture(artCanvas(icon, 8))
    tex.colorSpace = SRGBColorSpace
    const s = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
    s.scale.set(0.8, 0.8, 1)
    s.renderOrder = 7
    return s
  }

  // --- Emitter timers ---
  const acc = { trail: 0, beam: 0, glint: 0, ember: 0, smoke: 0, mote: 0, leaf: 0, air: 0, fly: 0 }
  const leafCols = [new Color('#3f8a2a'), new Color('#4c9c33'), new Color('#2f6e1f'), new Color('#5aad3c')]
  const EMBER = new Color('#ff8a2a')
  const SMOKE = new Color('#6a6a6a')
  const MOTE = new Color('#bfe8ff')
  const POLLEN = new Color('#fff2b0')
  const FLY = new Color('#d6ff6a')
  const GOLD = new Color('#ffd84a')
  const FROST = new Color('#bff0ff')
  const VOID = new Color('#c46bff')
  const tmpC = new Color()
  const every = (key, rate, dt, fn) => {
    acc[key] += dt * rate
    while (acc[key] >= 1) {
      acc[key] -= 1
      fn()
    }
  }
  const R = Math.random

  return {
    world: voxels,
    anchors: A,
    mesh,
    interactables,
    crates,

    // Block underfoot: { name, sound } for footsteps and landing chips.
    surfaceAt(x, y, z) {
      for (const dy of [-0.05, -0.55]) {
        const id = voxels.id(Math.floor(x), Math.floor(y + dy), Math.floor(z))
        const info = blockInfo(id)
        if (info && info.solid) return info
      }
      return null
    },

    // Little block chips kicked up by a footstep / landing.
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
    },

    // Plays the crate opening: lid opens, beam flares, sparkles burst, the reward icon rises.
    openCrate(kind, icon) {
      const c = crates[kind]
      c.openTarget = 1
      c.timer = 3.6
      c.boost = 1
      if (c.reward) props.remove(c.reward)
      c.reward = rewardSprite(icon)
      c.reward.position.set(c.a.x, c.a.y + 0.6, c.a.z)
      c.rewardT = 0
      props.add(c.reward)
      for (let i = 0; i < 70; i++) {
        const a = R() * Math.PI * 2
        const s = 1.5 + R() * 3.5
        sparkles.emit({ x: c.a.x, y: c.a.y + 0.7, z: c.a.z, vx: Math.cos(a) * s, vy: 2 + R() * 5, vz: Math.sin(a) * s, gravity: -6, drag: 1.5, life: 1.2 + R() * 1.2, size: 0.25 + R() * 0.3, sizeEnd: 0.05, color: R() < 0.3 ? GOLD : c.color, twinkle: 14 })
      }
      for (let i = 0; i < 20; i++) glows.emit({ x: c.a.x + (R() - 0.5) * 0.6, y: c.a.y + 0.7, z: c.a.z + (R() - 0.5) * 0.6, vy: 1 + R() * 2, life: 1, size: 0.8, sizeEnd: 0.1, color: c.color, alpha: 0.6 })
    },

    update(dt, t, camera, playerPos, viewportH, me = {}) {
      const night = lighting?.isNight?.() ?? false
      // NPCs look at the player when close
      for (const n of npcs) {
        const dx = playerPos.x - n.anchor.x
        const dz = playerPos.z - n.anchor.z
        const d = Math.hypot(dx, dz)
        let look = null
        if (d < 9) {
          const yaw = Math.atan2(Math.sin(Math.atan2(dx, dz) - n.facing), Math.cos(Math.atan2(dx, dz) - n.facing))
          look = { yaw, pitch: -Math.atan2(playerPos.y + 1.55 - (n.anchor.y + 1.6), d) * 0.8 }
        }
        n.ch.animate(dt, 0, look)
      }
      if (R() < dt * 0.1) {
        duelsCount = Math.max(52, Math.min(96, duelsCount + (R() < 0.5 ? -1 : 1) * Math.ceil(R() * 3)))
        duels.ch.tag?.userData.redraw([
          { text: `${duelsCount} playing`, size: 30, color: '#ffffff', weight: 600 },
          { text: 'Duels', size: 40, color: '#3fe0ff' },
          { text: CLICK, size: 34, color: '#ffe04a' },
        ])
      }

      // crates: lid easing, beam flare, rising sparkles, reward icon
      for (const kind in crates) {
        const c = crates[kind]
        if (c.timer > 0) {
          c.timer -= dt
          if (c.timer <= 0) c.openTarget = 0
        }
        c.open += (c.openTarget - c.open) * Math.min(1, dt * (c.openTarget ? 7 : 4))
        const e = c.open < 0.5 ? 2 * c.open * c.open : 1 - Math.pow(-2 * c.open + 2, 2) / 2
        c.chest.setOpen(e)
        c.boost = Math.max(0, c.boost - dt * 0.5)
        c.beam.update(t, c.boost)
        if (c.reward) {
          c.rewardT += dt
          const k = Math.min(1, c.rewardT / 0.8)
          c.reward.position.y = c.a.y + 0.6 + (1 - Math.pow(1 - k, 3)) * 1.1 + Math.sin(c.rewardT * 3) * 0.05
          c.reward.material.rotation = Math.sin(c.rewardT * 2) * 0.15
          c.reward.material.opacity = c.timer > 0.6 ? 1 : Math.max(0, c.timer / 0.6)
          if (c.timer <= 0) {
            props.remove(c.reward)
            c.reward = null
          }
        }
        every('beam', 7, dt / 2, () => {
          const a = R() * Math.PI * 2
          const r = 0.15 + R() * 0.45
          sparkles.emit({ x: c.a.x + Math.cos(a) * r, y: c.a.y + 0.8 + R() * 1.5, z: c.a.z + Math.sin(a) * r, vy: 1.2 + R() * 2.2, life: 1.8 + R() * 1.6, size: 0.12 + R() * 0.16, color: c.color, twinkle: 9, fadeIn: 0.3 })
        })
        if (kind === 'ranked')
          every('glint', 1.6, dt, () => {
            sparkles.emit({ x: c.a.x + (R() - 0.5) * 2.2, y: c.a.y + 2.4 + R() * 0.6, z: c.a.z + (R() - 0.5) * 0.4, vy: 0.2, life: 1.4, size: 0.3, sizeEnd: 0.05, color: c.color, twinkle: 7, fadeIn: 0.4 })
          })
      }

      // kit NPC outline glints
      if (R() < dt * 2.2) {
        const p = kitNpc.anchor
        sparkles.emit({ x: p.x + (R() - 0.5) * 0.7, y: p.y + 0.2 + R() * 1.7, z: p.z + (R() - 0.5) * 0.7, vy: 0.3, life: 0.9, size: 0.18, sizeEnd: 0.02, color: GOLD, twinkle: 12, fadeIn: 0.3 })
      }

      // campfire: embers + smoke; flickering light
      fire.update(t)
      fireLight.intensity = (night ? 14 : 6) * (0.85 + Math.sin(t * 13) * 0.06 + Math.sin(t * 7.3) * 0.08 + R() * 0.04)
      const cf = A.campfire
      every('ember', 9, dt, () => glows.emit({ x: cf.x + (R() - 0.5) * 0.4, y: 0.5, z: cf.z + (R() - 0.5) * 0.4, vy: 1.4 + R() * 1.6, sway: 0.8, life: 0.9 + R() * 0.9, size: 0.06 + R() * 0.05, color: EMBER, fadeIn: 0.05 }))
      every('smoke', 3.2, dt, () => smoke.emit({ x: cf.x + (R() - 0.5) * 0.3, y: 1.1, z: cf.z + (R() - 0.5) * 0.3, vy: 0.7 + R() * 0.4, vx: 0.15, sway: 0.4, life: 4 + R() * 2, size: 0.4, sizeEnd: 1.9, color: SMOKE, alpha: 0.32, fadeIn: 0.15 }))

      // motes drifting up out of the shaft (the drop into the arena)
      const h = A.hole
      every('mote', 9, dt, () => {
        const a = R() * Math.PI * 2
        const r = R() * h.r * 0.9
        glows.emit({ x: h.x + Math.cos(a) * r, y: -14 + R() * 6, z: h.z + Math.sin(a) * r, vy: 2.5 + R() * 2.5, sway: 0.5, life: 3 + R() * 2, size: 0.08 + R() * 0.08, color: MOTE, alpha: 0.85, fadeIn: 0.25 })
      })

      // falling leaves from trees near the player
      every('leaf', 2.2, dt, () => {
        const tree = A.trees[Math.floor(R() * A.trees.length)]
        if (!tree) return
        if (Math.hypot(tree.x - playerPos.x, tree.z - playerPos.z) > 45) return
        chips.emit({ x: tree.x + (R() - 0.5) * tree.r * 2, y: tree.y - 1 + R(), z: tree.z + (R() - 0.5) * tree.r * 2, vy: -0.6, vx: 0.2, sway: 1.1, gravity: -0.15, drag: 0.6, life: 6 + R() * 3, size: 0.1, color: leafCols[Math.floor(R() * 4)], fadeIn: 0.1 })
      })
      // pollen in the day, fireflies at night, around the player
      if (!night)
        every('air', 4, dt, () => glows.emit({ x: playerPos.x + (R() - 0.5) * 24, y: 0.5 + R() * 4, z: playerPos.z + (R() - 0.5) * 24, vx: 0.2, vy: 0.05, sway: 0.4, life: 5 + R() * 3, size: 0.05, color: POLLEN, alpha: 0.7, fadeIn: 0.3 }))
      else
        every('fly', 6, dt, () => glows.emit({ x: playerPos.x + (R() - 0.5) * 30, y: 0.3 + R() * 2.5, z: playerPos.z + (R() - 0.5) * 30, sway: 1.2, life: 4 + R() * 3, size: 0.1, color: FLY, twinkle: 5, fadeIn: 0.3 }))

      // the player's trail (Looks)
      if (me.look && me.look !== 'none' && me.speed > 0.8) {
        every('trail', 10 + me.speed * 2, dt, () => {
          const bx = playerPos.x - Math.sin(me.facing) * 0.35 + (R() - 0.5) * 0.35
          const bz = playerPos.z - Math.cos(me.facing) * 0.35 + (R() - 0.5) * 0.35
          const y = playerPos.y + 0.1 + R() * 0.5
          if (me.look === 'sparkle') sparkles.emit({ x: bx, y, z: bz, vy: 0.6, life: 0.9, size: 0.18, sizeEnd: 0.02, color: GOLD, twinkle: 12 })
          else if (me.look === 'ember') glows.emit({ x: bx, y, z: bz, vy: 1.2, sway: 0.6, life: 0.8, size: 0.12, sizeEnd: 0.02, color: EMBER, fadeIn: 0.02 })
          else if (me.look === 'frost') glows.emit({ x: bx, y: y + 0.3, z: bz, vy: -0.4, sway: 0.5, life: 1.2, size: 0.1, color: FROST, fadeIn: 0.05 })
          else if (me.look === 'void') sparkles.emit({ x: bx, y, z: bz, vy: 0.3, life: 1, size: 0.22, sizeEnd: 0.03, color: VOID, twinkle: 6 })
          else if (me.look === 'rainbow') {
            tmpC.setHSL((t * 0.4 + R() * 0.1) % 1, 0.9, 0.6)
            glows.emit({ x: bx, y, z: bz, vy: 0.4, life: 1, size: 0.14, sizeEnd: 0.03, color: tmpC, fadeIn: 0.02 })
          }
        })
      }
      bots.update(dt, playerPos)
      clouds.update(dt, playerPos)
      rocks.update(t, dt)
      sparkles.update(dt, camera, viewportH)
      glows.update(dt, camera, viewportH)
      smoke.update(dt, camera, viewportH)
      chips.update(dt, camera, viewportH)
    },
  }
}
