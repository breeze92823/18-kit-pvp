// Plaza power-ups and arena event text.
//  - Power-ups: a floating gem over each of the plaza's four glowstone tiles. Walk into one to
//    take it (speed boost, instant heal or regeneration); it comes back after
//    `ARENA_EVENTS.powerups.respawn` s as a random kind. Local to each client (nothing is relayed).
//  - Biome event text: now and then the arena warns that a biome is about to collapse. It is
//    only an announcement (feed line + toast), nothing in the world changes.
import { Color, Group, Mesh, MeshBasicMaterial, OctahedronGeometry, RingGeometry, DoubleSide } from 'three'
import { ARENA_EVENTS, BIOMES } from '../config.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// api: { collect(kind), feed(html), toast(text, kind) }
export function createPickups(scene, tiles, api) {
  const P = ARENA_EVENTS.powerups
  const kinds = Object.keys(P.kinds)
  const geo = new OctahedronGeometry(0.34)
  const ringGeo = new RingGeometry(0.5, 0.62, 28)
  const group = new Group()
  group.visible = false
  scene.add(group)

  const items = tiles.map((t, i) => {
    const mat = new MeshBasicMaterial({ color: 0xffffff })
    const gem = new Mesh(geo, mat)
    const ringMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, side: DoubleSide, depthWrite: false })
    const ring = new Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    group.add(gem, ring)
    const it = { x: t.x, y: t.y, z: t.z, gem, ring, mat, ringMat, kind: '', back: 0, phase: i * 1.7 }
    setKind(it, pick(kinds))
    return it
  })
  function setKind(it, kind) {
    it.kind = kind
    const c = new Color(P.kinds[kind].color)
    it.mat.color.copy(c)
    it.ringMat.color.copy(c)
  }

  // --- biome event text ---
  const E = ARENA_EVENTS.biome
  let nextEvent = rnd(E.first[0], E.first[1])
  let pending = null // { biome, at }

  let wasActive = false
  return {
    // t = clock s, active = in the arena and alive
    update(dt, t, active, pos) {
      group.visible = active
      if (!active) {
        if (wasActive) {
          // leaving: the next event starts a fresh wait
          pending = null
          nextEvent = t + rnd(E.first[0], E.first[1])
        }
        wasActive = false
        return
      }
      if (!wasActive) nextEvent = Math.max(nextEvent, t + rnd(E.first[0], E.first[1]))
      wasActive = true

      for (const it of items) {
        const gone = t < it.back
        it.gem.visible = it.ring.visible = !gone
        if (gone) continue
        const bob = Math.sin(t * 2 + it.phase) * 0.12
        it.gem.position.set(it.x, it.y + 1.15 + bob, it.z)
        it.gem.rotation.y = t * 1.8 + it.phase
        it.ring.position.set(it.x, it.y + 0.06, it.z)
        const s = 1 + Math.sin(t * 3 + it.phase) * 0.06
        it.ring.scale.set(s, s, 1)
        if (Math.abs(pos.y - it.y) < 2.2 && Math.hypot(pos.x - it.x, pos.z - it.z) < P.radius) {
          const k = it.kind
          it.back = t + P.respawn
          setKind(it, pick(kinds))
          api.collect(k)
        }
      }

      if (pending) {
        if (t >= pending.at) {
          const b = BIOMES[pending.biome]
          api.feed(`<span style="color:${b.color}">[EVENT]</span> <span style="color:#ffb31a">${b.name} shudders, but holds.</span>`)
          pending = null
          nextEvent = t + rnd(E.every[0], E.every[1])
        }
      } else if (t >= nextEvent) {
        const biome = pick(E.biomes)
        const b = BIOMES[biome]
        pending = { biome, at: t + E.warn }
        api.feed(`<span style="color:${b.color}">[EVENT]</span> <span style="color:#ffb31a">${b.name} is about to collapse in ${E.warn}s!</span>`)
        api.toast(`${b.name} is about to collapse!`, 'bad')
      }
    },
  }
}
