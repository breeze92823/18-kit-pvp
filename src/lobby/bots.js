// Lobby players: armored bots that wander the open floor along straight,
// pre-checked paths (never through walls, never into the pit), pause, look
// at you, swing their swords, hop now and then, and occasionally leave or
// join (reported through onEvent for the chat feed). Each has a kinematic
// capsule so the player bumps into them instead of walking through.
import { RAPIER, world as physicsWorld } from '../physics.js'
import { buildCharacter, randomSkin } from './characters.js'
import { fakeName } from './holograms.js'
import { mulberry32 } from '../textures.js'

const ARMORS = ['iron', 'iron', 'iron', 'gold', 'dark', null]

export function createBots(scene, voxels, anchors, count, onEvent) {
  const rand = mulberry32(2026)
  const bots = []

  const walkable = (x, z) => {
    for (const [ox, oz] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
      const bx = Math.floor(x + ox)
      const bz = Math.floor(z + oz)
      if (!voxels.solid(bx, -1, bz)) return false
      if (voxels.solid(bx, 0, bz) || voxels.solid(bx, 1, bz)) return false
      const i = voxels.info(bx, -1, bz)
      if (i.shape !== 'cube') return false // keeps them off the pit's stair rim
    }
    return true
  }
  const clear = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az)
    const steps = Math.ceil(len / 0.4)
    for (let i = 0; i <= steps; i++) if (!walkable(ax + ((bx - ax) * i) / steps, az + ((bz - az) * i) / steps)) return false
    return true
  }
  const c = anchors.center
  const randomSpot = () => {
    for (let i = 0; i < 60; i++) {
      const a = rand() * Math.PI * 2
      const r = 6 + rand() * (c.r - 10)
      const x = c.x + Math.cos(a) * r
      const z = c.z + Math.sin(a) * r
      if (walkable(x, z)) return { x, z }
    }
    return { x: 0.5, z: 12 }
  }

  function makeBot(seed) {
    const name = fakeName(mulberry32(seed))
    const armor = ARMORS[seed % ARMORS.length]
    const ch = buildCharacter({
      skin: randomSkin(seed),
      armor,
      armorParts: armor === 'gold' ? { helmet: true, chest: false, legs: true } : undefined,
      item: seed % 4 === 3 ? 'axe' : 'sword',
      tag: [
        { text: name, size: 34, color: '#ffffff', bg: 'rgba(0,0,0,0.32)', weight: 600 },
        { text: '20', size: 34, color: '#ffffff', heart: true },
      ],
      tagHeight: 0.46,
    })
    const spot = randomSpot()
    ch.root.position.set(spot.x, 0, spot.z)
    scene.add(ch.root)
    const body = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spot.x, 0.9, spot.z))
    physicsWorld.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.32), body)
    return { ch, name, body, x: spot.x, z: spot.z, facing: rand() * 6.28, target: null, wait: rand() * 3, speed: 0, hop: 0, hopV: 0, fade: 1, leaving: false, seed }
  }
  let seedNext = 100
  for (let i = 0; i < count; i++) bots.push(makeBot(seedNext++))

  let eventTimer = 25 + rand() * 20
  return {
    bots,
    update(dt, playerPos) {
      eventTimer -= dt
      if (eventTimer <= 0) {
        eventTimer = 35 + rand() * 40
        const b = bots[Math.floor(rand() * bots.length)]
        if (!b.leaving) b.leaving = true
      }
      for (let i = 0; i < bots.length; i++) {
        let b = bots[i]
        if (b.leaving) {
          b.fade -= dt * 1.5
          b.ch.root.scale.setScalar(Math.max(0.01, b.fade))
          if (b.fade <= 0) {
            scene.remove(b.ch.root)
            physicsWorld.removeRigidBody(b.body)
            onEvent?.(`${b.name} left the game`, '#ffe04a')
            const nb = makeBot(seedNext++)
            bots[i] = nb
            onEvent?.(`${nb.name} joined the game`, '#ffe04a')
            b = nb
          }
          continue
        }
        // brain
        if (!b.target) {
          b.wait -= dt
          if (b.wait <= 0) {
            for (let k = 0; k < 10; k++) {
              const a = rand() * Math.PI * 2
              const r = 3 + rand() * 11
              const tx = b.x + Math.cos(a) * r
              const tz = b.z + Math.sin(a) * r
              if (clear(b.x, b.z, tx, tz)) {
                b.target = { x: tx, z: tz }
                b.run = rand() < 0.2
                break
              }
            }
            if (!b.target) b.wait = 1
          } else if (rand() < dt * 0.25) b.ch.swing()
        }
        let speed = 0
        if (b.target) {
          const dx = b.target.x - b.x
          const dz = b.target.z - b.z
          const d = Math.hypot(dx, dz)
          const want = b.run ? 5 : 2.6
          if (d < 0.15) {
            b.target = null
            b.wait = 1 + rand() * 5
          } else {
            const step = Math.min(d, want * dt)
            b.x += (dx / d) * step
            b.z += (dz / d) * step
            speed = want
            const f = Math.atan2(dx, dz)
            const diff = Math.atan2(Math.sin(f - b.facing), Math.cos(f - b.facing))
            b.facing += diff * Math.min(1, dt * 8)
            if (b.hop <= 0 && rand() < dt * 0.12) b.hopV = 6.5
          }
        }
        // cosmetic hop
        if (b.hopV > 0 || b.hop > 0) {
          b.hop += b.hopV * dt
          b.hopV -= 22 * dt
          if (b.hop <= 0) {
            b.hop = 0
            b.hopV = 0
          }
        }
        b.speed += (speed - b.speed) * Math.min(1, dt * 10)
        b.ch.root.position.set(b.x, b.hop, b.z)
        b.ch.root.rotation.y = b.facing
        b.body.setNextKinematicTranslation({ x: b.x, y: 0.9 + b.hop, z: b.z })
        // look at the player when close and idle
        let look = null
        const px = playerPos.x - b.x
        const pz = playerPos.z - b.z
        const pd = Math.hypot(px, pz)
        if (pd < 7) {
          const yaw = Math.atan2(Math.sin(Math.atan2(px, pz) - b.facing), Math.cos(Math.atan2(px, pz) - b.facing))
          if (Math.abs(yaw) < 1.6) look = { yaw, pitch: -Math.atan2(playerPos.y + 1.5 - (b.hop + 1.6), pd) }
        }
        b.ch.animate(dt, b.speed, look)
      }
    },
  }
}
