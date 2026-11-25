// World effects behind the kit abilities (abilities.js): thrown items (snowballs, stars,
// TNT, warp orbs, splash potions, fire bombs, fireballs, tridents, vine seeds, poison
// flasks, the grappling hook), explosions, lingering areas (burning ground, poison
// clouds), temporary cobblestone walls, turrets, bees, lightning, the warden's sonic
// boom, the golem's slam, the samurai's dash and the chronomancer's rewind.
// Everything that hurts goes through api.damage (combat.js), so armor, shields, kill
// credit and the feed work the same as for swords and arrows.
import { BoxGeometry, BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Line, LineBasicMaterial, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Ray, Vector3, AdditiveBlending } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ARENA } from '../config.js'
import { RAPIER, addFixed, removeFixed, segmentClear } from '../physics.js'
import { itemMesh } from '../lobby/models.js'
import { Particles, TEX } from '../lobby/fx.js'
import { blockTexture } from '../voxel/blocktex.js'
import * as sfx from '../audio.js'

const EYE = 1.62
const rr = Math.random
// Thrown things: art piece, size (m), launch speed, gravity, spin (rad/s), life (s)
export const THROWN = {
  snowball: { art: 'snow', size: 0.3, speed: 28, gravity: -16, spin: 10 },
  star: { art: 'star', size: 0.34, speed: 38, gravity: -5, spin: 26 },
  tnt: { art: 'tnt', size: 0.5, speed: 15, gravity: -20, spin: 5, rests: true },
  orb: { art: 'orb', size: 0.32, speed: 26, gravity: -18, spin: 8 },
  potion: { art: 'potion', size: 0.36, speed: 20, gravity: -18, spin: 9 },
  firebomb: { art: 'orb_fire', size: 0.38, speed: 22, gravity: -18, spin: 8 },
  fireball: { art: 'flame_blue', size: 0.55, speed: 30, gravity: 0, spin: 0, life: 2, face: true },
  trident: { art: 'trident', size: 0.85, speed: 34, gravity: -12, spin: 14 },
  vines: { art: 'wand_nature', size: 0.4, speed: 32, gravity: -6, spin: 12 },
  poison: { art: 'potion_green', size: 0.36, speed: 20, gravity: -18, spin: 9 },
  hook: { art: 'hook', size: 0.4, speed: 60, gravity: 0, spin: 0, life: 0.6, line: true },
  slimeball: { art: 'slime', size: 0.36, speed: 26, gravity: -16, spin: 7 },
}
const POTION_ART = { harm: 'potion', slow: 'potion_purple', heal: 'potion_green' }

export function createEffects(scene, arena, camera, api) {
  const W = api.world ?? arena.world // the arena + the duel platforms (combat.js compositeWorld)
  const root = new Group()
  root.name = 'arena-effects'
  scene.add(root)

  // --- particles ------------------------------------------------------------------------------
  const glow = new Particles(500, { texture: TEX.soft(), additive: true, hdr: 2 })
  const puff = new Particles(420, { texture: TEX.soft(), additive: false, nearFade: 0.4 })
  const spark = new Particles(300, { texture: TEX.star(), additive: true, hdr: 2.2 })
  root.add(glow.points, puff.points, spark.points)
  const col = (h) => new Color(h)
  const C = {
    white: col('#f4f4f4'),
    smoke: col('#3a3a3a'),
    grey: col('#8a8a8a'),
    ember: col('#ff8a2a'),
    hot: col('#ffd25a'),
    blue: col('#5aa8ff'),
    portal: col('#c46bff'),
    green: col('#7ae05a'),
    poison: col('#5ad04a'),
    red: col('#e0402a'),
    purple: col('#a05ae0'),
    heal: col('#ff7ab0'),
    cyan: col('#3ad0e0'),
    gold: col('#ffd84a'),
    dust: col('#8a6a58'),
  }
  function burst(ps, n, f) {
    for (let i = 0; i < n; i++) ps.emit(f(i))
  }
  function ring(x, y, z, r, color, n = 24, speed = 3) {
    burst(puff, n, (i) => {
      const a = (i / n) * Math.PI * 2
      return { x: x + Math.cos(a) * r * 0.3, y: y + 0.15, z: z + Math.sin(a) * r * 0.3, vx: Math.cos(a) * speed, vz: Math.sin(a) * speed, vy: 0.4, drag: 2.4, life: 0.9, size: 0.45, sizeEnd: 1.3, color, alpha: 0.55, fadeIn: 0.02 }
    })
  }
  const fx = {
    portal(x, y, z) {
      burst(spark, 26, () => ({ x: x + (rr() - 0.5) * 1, y: y + rr() * 1.9, z: z + (rr() - 0.5) * 1, vy: 0.6 + rr() * 2, sway: 1, life: 0.9 + rr() * 0.5, size: 0.25, sizeEnd: 0.03, color: rr() < 0.5 ? C.portal : C.purple, twinkle: 8 }))
    },
    fire(x, y, z, n = 14) {
      burst(glow, n, () => ({ x: x + (rr() - 0.5) * 0.8, y: y + rr() * 1.6, z: z + (rr() - 0.5) * 0.8, vy: 1.5 + rr() * 2, sway: 0.6, life: 0.5 + rr() * 0.4, size: 0.14, sizeEnd: 0.02, color: rr() < 0.5 ? C.hot : C.ember, fadeIn: 0.02 }))
    },
    heal(x, y, z) {
      burst(spark, 14, () => ({ x: x + (rr() - 0.5) * 0.9, y: y + 0.3 + rr() * 1.5, z: z + (rr() - 0.5) * 0.9, vy: 0.8 + rr(), life: 0.9, size: 0.2, sizeEnd: 0.04, color: C.heal, twinkle: 6 }))
    },
    leaves(x, y, z) {
      burst(puff, 16, () => ({ x: x + (rr() - 0.5) * 0.9, y: y + rr() * 0.8, z: z + (rr() - 0.5) * 0.9, vy: 1 + rr() * 1.5, vx: (rr() - 0.5), vz: (rr() - 0.5), gravity: -3, life: 1.2, size: 0.16, color: C.green, alpha: 0.9 }))
    },
    snow(x, y, z) {
      burst(puff, 10, () => ({ x, y, z, vx: (rr() - 0.5) * 3, vy: rr() * 2.5, vz: (rr() - 0.5) * 3, gravity: -9, life: 0.5, size: 0.12, color: C.white, alpha: 0.95 }))
    },
    splash(x, y, z, color, r) {
      ring(x, y, z, r, color, 20, r * 1.4)
      burst(spark, 18, () => ({ x: x + (rr() - 0.5) * r, y: y + 0.2 + rr(), z: z + (rr() - 0.5) * r, vy: 1 + rr() * 2, life: 0.8, size: 0.22, sizeEnd: 0.03, color, twinkle: 5 }))
    },
    slime(x, y, z) {
      burst(puff, 14, () => ({ x, y, z, vx: (rr() - 0.5) * 4, vy: 0.5 + rr() * 3, vz: (rr() - 0.5) * 4, gravity: -12, life: 0.6, size: 0.16, sizeEnd: 0.05, color: C.green, alpha: 0.95 }))
      api.soundAt(x, y, z, (k) => sfx.squelch(k))
    },
    // a firework shell bursting: rings of coloured stars
    firework(x, y, z, scale = 1) {
      const cols = [C.heal, C.gold, C.cyan, C.green, C.purple]
      for (let ring = 0; ring < 2; ring++) {
        const c = cols[Math.floor(rr() * cols.length)]
        burst(spark, 26, (i) => {
          const a = (i / 26) * Math.PI * 2
          const e = (rr() - 0.5) * 1.2
          const s = (4 + ring * 2.5) * scale
          return { x, y, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 1, vz: Math.sin(a) * Math.cos(e) * s, gravity: -4, drag: 1.8, life: 0.9 + rr() * 0.4, size: 0.26, sizeEnd: 0.03, color: c, twinkle: 10 }
        })
      }
      api.soundAt(x, y, z, (k) => sfx.firework(k))
    },
    // a gust: puffs streaming along dir
    gust(x, y, z, dx, dz, len) {
      burst(puff, 26, () => {
        const s = 6 + rr() * 8
        const side = (rr() - 0.5) * 1.6
        return { x: x - dz * side, y: y - 0.4 + rr() * 1.2, z: z + dx * side, vx: dx * s, vy: rr() * 0.6, vz: dz * s, drag: 2.5, life: (len / s) * 1.4, size: 0.4, sizeEnd: 1.1, color: C.white, alpha: 0.55, fadeIn: 0.02 }
      })
      api.soundAt(x, y, z, (k) => sfx.swing(0.7 * k))
    },
    // a spin of sparks in `color` around (x, z)
    whirl(x, y, z, r, color) {
      burst(spark, 18, (i) => {
        const a = (i / 18) * Math.PI * 2 + rr() * 0.3
        return { x: x + Math.cos(a) * r * 0.8, y: y + 0.6 + rr() * 0.9, z: z + Math.sin(a) * r * 0.8, vx: -Math.sin(a) * 7, vy: 0.4, vz: Math.cos(a) * 7, drag: 3, life: 0.35, size: 0.28, sizeEnd: 0.04, color, twinkle: 0 }
      })
    },
    // somebody died at your hand: a burst + ring (in the kit's colour from Bronze mastery up)
    killBurst(x, y, z, color, big = false) {
      const c = color ?? C.gold
      burst(spark, big ? 46 : 26, () => {
        const a = rr() * Math.PI * 2
        const s = 2 + rr() * (big ? 6 : 4)
        return { x, y: y + 0.6 + rr() * 1.2, z, vx: Math.cos(a) * s, vy: 1 + rr() * 4, vz: Math.sin(a) * s, gravity: -6, drag: 1.6, life: 0.8 + rr() * 0.4, size: 0.3, sizeEnd: 0.04, color: c, twinkle: 8 }
      })
      ring(x, y, z, big ? 3 : 2, c, big ? 30 : 20, big ? 6 : 4)
    },
    explosion(x, y, z, r) {
      burst(glow, 30, () => {
        const a = rr() * Math.PI * 2
        const s = 2 + rr() * 6
        return { x, y: y + 0.4, z, vx: Math.cos(a) * s, vy: 1 + rr() * 5, vz: Math.sin(a) * s, drag: 2.2, life: 0.35 + rr() * 0.3, size: 0.5, sizeEnd: 0.1, color: rr() < 0.5 ? C.hot : C.ember }
      })
      burst(puff, 34, () => {
        const a = rr() * Math.PI * 2
        const s = rr() * r * 1.3
        return { x: x + Math.cos(a) * 0.4, y: y + 0.3 + rr(), z: z + Math.sin(a) * 0.4, vx: Math.cos(a) * s, vy: 0.5 + rr() * 2.5, vz: Math.sin(a) * s, drag: 1.8, life: 1.2 + rr() * 0.8, size: 0.6, sizeEnd: 2, color: rr() < 0.6 ? C.smoke : C.grey, alpha: 0.7, fadeIn: 0.02 }
      })
    },
  }

  // --- thrown items -------------------------------------------------------------------------------
  const projectiles = []
  const segRay = new Ray()
  const hitPt = new Vector3()
  const box = { min: new Vector3(), max: new Vector3() }
  const entityBox = (e, pad) => {
    box.min.set(e.pos.x - 0.33 - pad, e.pos.y - pad * 0.5, e.pos.z - 0.33 - pad)
    box.max.set(e.pos.x + 0.33 + pad, e.pos.y + 1.85 + pad * 0.5, e.pos.z + 0.33 + pad)
    return box
  }
  const hookLines = []
  const hookMat = new LineBasicMaterial({ color: '#3a3a3a' })

  // kind: a THROWN key; opts carry the ability's numbers (damage, radius, potion effect...)
  function throwItem(kind, owner, from, dir, opts = {}) {
    const S = THROWN[kind]
    const art = kind === 'potion' ? POTION_ART[opts.effect] ?? S.art : S.art
    const mesh = itemMesh(art, S.size, 1)
    mesh.castShadow = false
    mesh.position.set(from.x, from.y, from.z)
    root.add(mesh)
    const speed = (opts.speed ?? S.speed) * (opts.speedMul ?? 1)
    const p = { kind, S, owner, opts, x: from.x, y: from.y, z: from.z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, life: 0, mesh, resting: false, axis: new Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize() }
    if (S.line) {
      const geo = new BufferGeometry()
      geo.setAttribute('position', new BufferAttribute(new Float32Array(6), 3))
      p.line = new Line(geo, hookMat)
      p.line.frustumCulled = false
      root.add(p.line)
    }
    projectiles.push(p)
    api.soundAt(from.x, from.y, from.z, (k) => sfx.swing(0.8 * k))
    // everyone else replays it as a visual ("ghost": it hurts nobody on their side)
    if (!opts.ghost && api.local(owner)) api.emit({ t: 'throw', kind, owner: api.key(owner), from: r3(from), dir: r3(dir), o: { effect: opts.effect, speedMul: opts.speedMul, fuse: opts.fuse, radius: opts.radius, life: opts.life } })
    return p
  }
  const r3 = (v) => ({ x: Math.round(v.x * 100) / 100, y: Math.round(v.y * 100) / 100, z: Math.round(v.z * 100) / 100 })
  // a ghost landed: only what it looks and sounds like
  function ghostImpact(p, x, y, z) {
    const o = p.opts
    switch (p.kind) {
      case 'snowball':
        return fx.snow(x, y, z)
      case 'vines':
        return fx.leaves(x, y, z)
      case 'fireball':
        fx.fire(x, y - 0.6, z, 22)
        return api.soundAt(x, y, z, (k) => sfx.fireWhoosh(k))
      case 'orb':
        return fx.portal(x, y - 0.5, z)
      case 'potion':
        fx.splash(x, y, z, o.effect === 'heal' ? C.heal : o.effect === 'slow' ? C.purple : C.red, o.radius ?? 3)
        return api.soundAt(x, y, z, (k) => sfx.glass(k))
      case 'firebomb':
        explode(x, y, z, o.radius ?? 2.6, 0, p.owner, { ghost: true, small: true })
        return addArea('fire', x, y, z, o.radius ?? 2.6, o.life ?? 4, p.owner, { ghost: true })
      case 'poison':
        fx.splash(x, y, z, C.poison, 2)
        api.soundAt(x, y, z, (k) => sfx.glass(k))
        return addArea('poison', x, y, z, o.radius ?? 3.2, o.life ?? 6, p.owner, { ghost: true })
      case 'star':
      case 'trident':
        return api.soundAt(x, y, z, (k) => sfx.arrowHit(k * 0.8))
      case 'slimeball':
        return fx.slime(x, y, z)
    }
  }
  function removeProjectile(i) {
    const p = projectiles[i]
    root.remove(p.mesh)
    if (p.line) {
      hookLines.push({ line: p.line, until: api.now() + 0.15 })
    }
    projectiles.splice(i, 1)
  }

  // Something landed: what it does depends on the kind.
  function impact(p, x, y, z, target) {
    if (p.opts.ghost) return ghostImpact(p, x, y, z)
    const o = p.opts
    const own = p.owner
    switch (p.kind) {
      case 'snowball':
        fx.snow(x, y, z)
        if (target) {
          api.damage(target, o.damage ?? 1, own, { kind: 'projectile', kbScale: 0.5, dir: flatDir(p) })
          api.status(target, 'slow', o.slow ?? 2)
        }
        break
      case 'star':
        if (target) api.damage(target, o.damage ?? 3, own, { kind: 'projectile', kbScale: 0.4, dir: flatDir(p) })
        else api.soundAt(x, y, z, (k) => sfx.arrowHit(k * 0.7))
        break
      case 'trident':
        if (target) api.damage(target, o.damage ?? 8, own, { kind: 'projectile', kbScale: 0.9, dir: flatDir(p) })
        else api.soundAt(x, y, z, (k) => sfx.arrowHit(k))
        break
      case 'vines':
        fx.leaves(x, y, z)
        if (target) {
          api.damage(target, o.damage ?? 2, own, { kind: 'projectile', noKb: true })
          api.status(target, 'root', o.root ?? 2)
        }
        break
      case 'fireball':
        fx.fire(x, y - 0.6, z, 22)
        api.soundAt(x, y, z, (k) => sfx.fireWhoosh(k))
        if (target) {
          api.damage(target, o.damage ?? 6, own, { kind: 'fire', kbScale: 0.5, dir: flatDir(p) })
          api.ignite(target, o.burn ?? 4, 2)
        }
        break
      case 'orb': {
        // warp: land the owner on the ground just short of the impact
        fx.portal(x, y - 0.5, z)
        if (!own.alive) break
        const back = Math.hypot(p.vx, p.vy, p.vz) || 1
        const tx = x - (p.vx / back) * 0.7
        const tz = z - (p.vz / back) * 0.7
        const spot = standSpot(tx, y + 1, tz)
        if (spot) {
          fx.portal(own.pos.x, own.pos.y, own.pos.z)
          api.teleport(own, spot.x, spot.y, spot.z)
          api.soundAt(spot.x, spot.y, spot.z, (k) => sfx.warp(k))
        }
        break
      }
      case 'potion': {
        const r = o.radius ?? 3
        const effect = o.effect ?? 'harm'
        fx.splash(x, y, z, effect === 'heal' ? C.heal : effect === 'slow' ? C.purple : C.red, r)
        api.soundAt(x, y, z, (k) => sfx.glass(k))
        for (const e of api.entities()) {
          if (!e.alive || dist3(e.pos.x, e.pos.y + 0.9, e.pos.z, x, y, z) > r + 0.6) continue
          const friend = api.allies(e, own)
          if (effect === 'heal' && friend) api.heal(e, o.heal ?? 7)
          else if (effect === 'harm' && !friend) api.damage(e, o.damage ?? 5, own, { kind: 'magic', from: { x, z }, kbScale: 0.4 })
          else if (effect === 'slow' && !friend) api.status(e, 'slow', o.slow ?? 3)
        }
        break
      }
      case 'firebomb':
        explode(x, y, z, o.radius ?? 2.6, o.damage ?? 4, own, { ignite: 3, small: true })
        addArea('fire', x, y, z, o.radius ?? 2.6, o.life ?? 4, own, { dps: 1 })
        break
      case 'poison':
        fx.splash(x, y, z, C.poison, 2)
        api.soundAt(x, y, z, (k) => sfx.glass(k))
        addArea('poison', x, y, z, o.radius ?? 3.2, o.life ?? 6, own, { dps: o.dps ?? 1.5 })
        break
      case 'slimeball':
        fx.slime(x, y, z)
        if (target) {
          api.damage(target, o.damage ?? 2, own, { kind: 'projectile', kbScale: 1.3, upScale: 1.2, dir: flatDir(p) })
          api.status(target, 'slow', o.slow ?? 2.5)
        }
        break
      case 'hook': {
        if (target || !own.alive) break
        const dx = x - own.pos.x
        const dy = y - (own.pos.y + 1)
        const dz = z - own.pos.z
        const d = Math.hypot(dx, dy, dz) || 1
        const s = Math.min(24, 8 + d * 0.9)
        api.push(own, (dx / d) * s, Math.max(6, (dy / d) * s + 5), (dz / d) * s)
        api.soundAt(x, y, z, (k) => sfx.arrowHit(k))
        break
      }
    }
  }
  const flatDir = (p) => {
    const h = Math.hypot(p.vx, p.vz) || 1
    return { x: p.vx / h, z: p.vz / h }
  }
  const dist3 = (ax, ay, az, bx, by, bz) => Math.hypot(ax - bx, ay - by, az - bz)
  // a spot with ground under it and two free cells above, near (x, z)
  function standSpot(x, fromY, z) {
    for (const [ox, oz] of [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6]]) {
      const cx = Math.floor(x + ox)
      const cz = Math.floor(z + oz)
      const g = W.groundY(cx, cz, fromY)
      if (g === null || g < ARENA.voidY + 5) continue
      if (W.info(cx, Math.floor(g + 0.1), cz)?.solid || W.info(cx, Math.floor(g + 1.1), cz)?.solid) continue
      return { x: cx + 0.5, y: g, z: cz + 0.5 }
    }
    return null
  }

  function updateProjectiles(dt, t) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i]
      p.life += dt
      const S = p.S
      if (p.kind === 'tnt' && p.life >= (p.opts.fuse ?? 1.6)) {
        explode(p.x, p.y, p.z, p.opts.radius ?? 4.2, p.opts.damage ?? 10, p.owner, { selfPush: true, ghost: p.opts.ghost })
        removeProjectile(i)
        continue
      }
      if ((S.life && p.life > S.life) || p.y < ARENA.voidY) {
        removeProjectile(i)
        continue
      }
      if (!p.resting) {
        p.vy += S.gravity * dt
        const steps = Math.max(1, Math.ceil((Math.hypot(p.vx, p.vy, p.vz) * dt) / 0.3))
        let hit = false
        for (let s = 0; s < steps && !hit; s++) {
          const nx = p.x + (p.vx * dt) / steps
          const ny = p.y + (p.vy * dt) / steps
          const nz = p.z + (p.vz * dt) / steps
          if (p.kind !== 'tnt' && p.kind !== 'hook') {
            segRay.origin.set(p.x, p.y, p.z)
            segRay.direction.set(nx - p.x, ny - p.y, nz - p.z)
            const len = segRay.direction.length()
            segRay.direction.normalize()
            let best = null
            let bestD = len
            for (const e of api.entities()) {
              if (!e.alive || api.allies(e, p.owner) || e.invisible) continue
              if (segRay.intersectBox(entityBox(e, 0.12), hitPt)) {
                const d = hitPt.distanceTo(segRay.origin)
                if (d <= bestD) {
                  bestD = d
                  best = e
                }
              }
            }
            if (best) {
              impact(p, hitPt.x, hitPt.y, hitPt.z, best)
              removeProjectile(i)
              hit = true
              break
            }
          }
          const info = W.info(Math.floor(nx), Math.floor(ny), Math.floor(nz))
          if (info && info.solid) {
            if (S.rests) {
              p.resting = true // stays where it touched; settles onto the ground below
              p.vx = p.vy = p.vz = 0
            } else {
              impact(p, p.x, p.y, p.z, null)
              removeProjectile(i)
            }
            hit = true
            break
          }
          p.x = nx
          p.y = ny
          p.z = nz
        }
        if (hit && !p.resting) continue
      } else {
        // resting TNT settles onto the ground and pulses
        const g = W.groundY(Math.floor(p.x), Math.floor(p.z), p.y + 0.3)
        if (g !== null && p.y > g + 0.25) p.y = Math.max(g + 0.25, p.y - 6 * dt)
      }
      p.mesh.position.set(p.x, p.y, p.z)
      if (S.face) p.mesh.quaternion.copy(camera.quaternion)
      else if (S.spin) p.mesh.rotateOnAxis(p.axis, S.spin * dt)
      if (p.kind === 'tnt') {
        const k = 1 + Math.max(0, Math.sin(p.life * (6 + p.life * 10))) * 0.18
        p.mesh.scale.setScalar(k)
        if (rr() < dt * 12) spark.emit({ x: p.x, y: p.y + 0.3, z: p.z, vy: 1.5, life: 0.4, size: 0.12, color: C.hot, twinkle: 9 })
      }
      if (p.kind === 'fireball' && rr() < dt * 40) glow.emit({ x: p.x, y: p.y, z: p.z, vx: (rr() - 0.5), vy: (rr() - 0.5), vz: (rr() - 0.5), life: 0.4, size: 0.3, sizeEnd: 0.05, color: C.blue })
      if (p.line) setLine(p.line, p.owner, p.x, p.y, p.z)
    }
    for (let i = hookLines.length - 1; i >= 0; i--) {
      if (t < hookLines[i].until) continue
      root.remove(hookLines[i].line)
      hookLines[i].line.geometry.dispose()
      hookLines.splice(i, 1)
    }
  }
  function setLine(line, owner, x, y, z) {
    const a = line.geometry.attributes.position
    a.setXYZ(0, owner.pos.x, owner.pos.y + 1.2, owner.pos.z)
    a.setXYZ(1, x, y, z)
    a.needsUpdate = true
  }

  // --- explosions + areas ----------------------------------------------------------------------------
  function explode(x, y, z, r, dmg, owner, opts = {}) {
    fx.explosion(x, y, z, r)
    api.soundAt(x, y, z, (k) => sfx.explosion(opts.small ? 0.6 * k : k))
    if (opts.ghost) return
    for (const e of api.entities()) {
      if (!e.alive) continue
      const d = dist3(e.pos.x, e.pos.y + 0.9, e.pos.z, x, y, z)
      if (d > r) continue
      const k = 1 - d / r
      if (e === owner || api.allies(e, owner)) {
        if (opts.selfPush && e === owner) {
          const dx = e.pos.x - x
          const dz = e.pos.z - z
          const h = Math.hypot(dx, dz) || 1
          api.push(e, (dx / h) * 8 * k, 6 + 6 * k, (dz / h) * 8 * k) // TNT jump
        }
        continue
      }
      api.damage(e, Math.max(1, dmg * k), owner, { kind: 'explosion', from: { x, z }, kbScale: 1.2 + k, upScale: 1.3 })
      if (opts.ignite) api.ignite(e, opts.ignite)
    }
  }
  const areas = []
  function addArea(kind, x, y, z, r, life, owner, opts = {}) {
    areas.push({ kind, x, y, z, r, until: api.now() + life, owner, opts, tick: 0 })
  }
  function updateAreas(dt, t) {
    for (let i = areas.length - 1; i >= 0; i--) {
      const a = areas[i]
      if (t > a.until) {
        areas.splice(i, 1)
        continue
      }
      // visuals
      const n = a.kind === 'fire' ? 26 : 20
      for (let k = 0; k < n * dt * 4; k++) {
        const ang = rr() * Math.PI * 2
        const rad = Math.sqrt(rr()) * a.r
        const px = a.x + Math.cos(ang) * rad
        const pz = a.z + Math.sin(ang) * rad
        const g = W.groundY(Math.floor(px), Math.floor(pz), a.y + 1.5) ?? a.y
        if (a.kind === 'fire') glow.emit({ x: px, y: g + 0.05, z: pz, vy: 1.2 + rr() * 1.5, sway: 0.5, life: 0.5 + rr() * 0.5, size: 0.16, sizeEnd: 0.02, color: rr() < 0.5 ? C.hot : C.ember, fadeIn: 0.05 })
        else puff.emit({ x: px, y: g + 0.2 + rr() * 0.8, z: pz, vy: 0.2 + rr() * 0.3, sway: 0.4, life: 1.4, size: 0.5, sizeEnd: 1.2, color: C.poison, alpha: 0.35, fadeIn: 0.2 })
      }
      a.tick -= dt
      if (a.tick > 0 || a.opts.ghost) continue
      a.tick = 0.5
      for (const e of api.entities()) {
        if (!e.alive || (a.kind === 'poison' && api.allies(e, a.owner))) continue
        if (Math.hypot(e.pos.x - a.x, e.pos.z - a.z) > a.r || Math.abs(e.pos.y - a.y) > 2.2) continue
        if (a.kind === 'fire') {
          if (e === a.owner) continue
          api.ignite(e, 2)
          api.damage(e, a.opts.dps * 0.5, a.owner, { kind: 'fire', noKb: true, noFlinch: true })
        } else api.damage(e, a.opts.dps * 0.5, a.owner, { kind: 'poison', noKb: true, noFlinch: true })
      }
    }
  }

  // --- temporary walls (miner) ---------------------------------------------------------------------------
  const wallMat = new MeshStandardMaterial({ map: blockTexture('cobblestone'), roughness: 0.9 })
  const MAX_WALL = 72
  const wallMesh = new InstancedMesh(new BoxGeometry(1.002, 1.002, 1.002), wallMat, MAX_WALL)
  wallMesh.count = 0
  wallMesh.castShadow = true
  wallMesh.receiveShadow = true
  wallMesh.frustumCulled = false
  root.add(wallMesh)
  const walls = [] // { x, y, z, collider, until }
  const m4 = new Matrix4()
  function refreshWalls() {
    wallMesh.count = walls.length
    walls.forEach((w, i) => {
      m4.makeTranslation(w.x + 0.5, w.y + 0.5, w.z + 0.5)
      wallMesh.setMatrixAt(i, m4)
    })
    wallMesh.instanceMatrix.needsUpdate = true
  }
  function wall(owner, dirX, dirZ, life) {
    const h = Math.hypot(dirX, dirZ) || 1
    const fx0 = dirX / h
    const fz0 = dirZ / h
    const cx = owner.pos.x + fx0 * 2.2
    const cz = owner.pos.z + fz0 * 2.2
    const px = -fz0
    const pz = fx0
    const cells = []
    for (let i = -1; i <= 1; i++) {
      const x = Math.floor(cx + px * i * 1.0)
      const z = Math.floor(cz + pz * i * 1.0)
      const g = W.groundY(x, z, owner.pos.y + 1.5)
      if (g === null || Math.abs(g - owner.pos.y) > 2.5) continue
      for (let k = 0; k < 2; k++) {
        const y = Math.floor(g + 0.01) + k
        if (W.id(x, y, z)) continue
        // never wall someone in
        if (api.entities().some((e) => e.alive && Math.floor(e.pos.x) === x && Math.floor(e.pos.z) === z && Math.abs(e.pos.y - y) < 2)) continue
        cells.push([x, y, z])
      }
    }
    const placed = placeWall(cells, life)
    // the others place the same blocks (they collide for everyone)
    if (placed && api.local(owner)) api.emit({ t: 'wall', cells, life })
    return placed > 0
  }
  // cells: [[x, y, z]...] world cells; returns how many were placed
  function placeWall(cells, life) {
    let placed = 0
    let sx = 0
    let sy = 0
    let sz = 0
    for (const [x, y, z] of cells) {
      if (W.id(x, y, z) || walls.length >= MAX_WALL) continue
      W.set(x, y, z, 'cobblestone')
      const collider = addFixed(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), { x: x + 0.5, y: y + 0.5, z: z + 0.5 })
      walls.push({ x, y, z, collider, until: api.now() + life })
      placed++
      sx += x
      sy += y
      sz += z
    }
    if (placed) {
      refreshWalls()
      api.soundAt(sx / placed, sy / placed, sz / placed, (k) => sfx.land('stone', 1.2 * k))
      ring(sx / placed + 0.5, sy / placed - 0.5, sz / placed + 0.5, 1.5, C.dust, 14, 2)
    }
    return placed
  }
  function updateWalls(t) {
    let changed = false
    for (let i = walls.length - 1; i >= 0; i--) {
      const w = walls[i]
      if (t < w.until) continue
      W.set(w.x, w.y, w.z, null)
      removeFixed(w.collider)
      burst(puff, 5, () => ({ x: w.x + rr(), y: w.y + rr(), z: w.z + rr(), vy: 0.5, life: 0.7, size: 0.3, sizeEnd: 0.7, color: C.grey, alpha: 0.7 }))
      walls.splice(i, 1)
      changed = true
    }
    if (changed) refreshWalls()
  }

  // --- turrets (engineer) -------------------------------------------------------------------------------
  const turrets = []
  const turretBase = new MeshStandardMaterial({ map: blockTexture('cobblestone'), roughness: 0.9 })
  const turretHead = new MeshStandardMaterial({ color: '#3a3f48', roughness: 0.5, metalness: 0.6 })
  const turretGlow = new MeshStandardMaterial({ color: '#3aa0a8', emissive: '#3aa0a8', emissiveIntensity: 1.6 })
  // at: where (another player's turret, replayed: `ghost` = it never fires here)
  function turret(owner, opts, at = null, ghost = false) {
    // one per owner: a new one replaces the old
    for (let i = turrets.length - 1; i >= 0; i--) if (turrets[i].owner === owner || (owner.key && turrets[i].owner.key === owner.key)) removeTurret(i)
    const fx0 = Math.sin(owner.facing ?? 0)
    const fz0 = Math.cos(owner.facing ?? 0)
    const spot = at ?? standSpot(owner.pos.x + fx0 * 1.4, owner.pos.y + 1.2, owner.pos.z + fz0 * 1.4) ?? { x: owner.pos.x, y: owner.pos.y, z: owner.pos.z }
    if (!ghost && api.local(owner)) api.emit({ t: 'turret', owner: api.key(owner), at: r3(spot), life: opts.life })
    const g = new Group()
    const base = new Mesh(new BoxGeometry(0.7, 0.6, 0.7), turretBase)
    base.position.y = 0.3
    const head = new Group()
    head.position.y = 0.85
    const hb = new Mesh(new BoxGeometry(0.5, 0.42, 0.5), turretHead)
    const barrel = new Mesh(new BoxGeometry(0.12, 0.12, 0.55), turretHead)
    barrel.position.z = 0.38
    const eye = new Mesh(new BoxGeometry(0.3, 0.08, 0.02), turretGlow)
    eye.position.set(0, 0.08, 0.26)
    head.add(hb, barrel, eye)
    g.add(base, head)
    for (const m of [base, hb, barrel]) m.castShadow = true
    g.position.set(spot.x, spot.y + 0.004, spot.z)
    root.add(g)
    turrets.push({ owner, g, head, x: spot.x, y: spot.y, z: spot.z, until: api.now() + opts.life, cd: 0.6, opts, ghost })
    api.soundAt(spot.x, spot.y, spot.z, (k) => sfx.land('stone', k))
    return true
  }
  function removeTurret(i) {
    const tu = turrets[i]
    root.remove(tu.g)
    api.fx.poof(tu.x, tu.y + 0.4, tu.z)
    turrets.splice(i, 1)
  }
  const TURRET_BOW = { dmg: 4, dmgMax: 4, speed: 36, speedMax: 36, gravity: -12 }
  function updateTurrets(dt, t) {
    for (let i = turrets.length - 1; i >= 0; i--) {
      const tu = turrets[i]
      if (t > tu.until || (!tu.ghost && !tu.owner.alive)) {
        removeTurret(i)
        continue
      }
      let best = null
      let bestD = tu.opts.range ?? 18
      const ey = tu.y + 0.9
      for (const e of api.entities()) {
        if (!e.alive || e.invisible || api.allies(e, tu.owner) || e.protectedUntil > t) continue
        const d = dist3(e.pos.x, e.pos.y + 1.1, e.pos.z, tu.x, ey, tu.z)
        if (d < bestD) {
          bestD = d
          best = e
        }
      }
      if (best) {
        const yaw = Math.atan2(best.pos.x - tu.x, best.pos.z - tu.z)
        tu.head.rotation.y += Math.atan2(Math.sin(yaw - tu.head.rotation.y), Math.cos(yaw - tu.head.rotation.y)) * Math.min(1, dt * 8)
      }
      tu.cd -= dt
      if (!best || tu.cd > 0 || tu.ghost) continue
      if (segmentClear(tu.x, ey, tu.z, best.pos.x, best.pos.y + 1.1, best.pos.z) < 0.98) continue
      tu.cd = tu.opts.every ?? 1.2
      const dx = best.pos.x - tu.x
      const dz = best.pos.z - tu.z
      const h = Math.hypot(dx, dz)
      const tt = h / TURRET_BOW.speed
      const dy = best.pos.y + 1.1 - ey + 0.5 * -TURRET_BOW.gravity * tt * tt
      const len = Math.hypot(dx, dy, dz) || 1
      const dir = { x: dx / len, y: dy / len, z: dz / len }
      api.shoot(tu.owner, { x: tu.x + dir.x * 0.6, y: ey, z: tu.z + dir.z * 0.6 }, dir, 1, { ...TURRET_BOW, dmg: tu.opts.damage ?? 4, dmgMax: tu.opts.damage ?? 4 })
    }
  }

  // --- bees (beekeeper) ------------------------------------------------------------------------------------
  const beeGeo = (() => {
    const part = (w, h, d, x, y, z, hex) => {
      const g = new BoxGeometry(w, h, d).translate(x, y, z)
      const c = new Color(hex)
      const n = g.attributes.position.count
      const a = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3)
      g.setAttribute('color', new BufferAttribute(a, 3))
      return g
    }
    return mergeGeometries([
      part(0.16, 0.14, 0.24, 0, 0, 0, '#f0c020'),
      part(0.165, 0.145, 0.05, 0, 0, 0.02, '#1a1a1a'),
      part(0.165, 0.145, 0.04, 0, 0, -0.07, '#1a1a1a'),
      part(0.22, 0.01, 0.1, 0, 0.08, 0.02, '#e8f4ff'),
    ])
  })()
  const MAX_BEES = 32
  const beeMesh = new InstancedMesh(beeGeo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), MAX_BEES)
  beeMesh.count = 0
  beeMesh.frustumCulled = false
  root.add(beeMesh)
  const bees = []
  function addBees(owner, opts) {
    for (let i = 0; i < (opts.count ?? 4) && bees.length < MAX_BEES; i++) {
      bees.push({ owner, x: owner.pos.x + (rr() - 0.5), y: owner.pos.y + 1.6 + rr() * 0.5, z: owner.pos.z + (rr() - 0.5), vx: 0, vy: 0, vz: 0, until: api.now() + (opts.life ?? 10), cd: 0.4 + rr() * 0.4, target: null, look: 0, dmg: opts.damage ?? 1, ph: rr() * 6, ghost: !!opts.ghost })
    }
    api.soundAt(owner.pos.x, owner.pos.y, owner.pos.z, (k) => sfx.buzz(k))
    if (!opts.ghost && api.local(owner)) api.emit({ t: 'bees', owner: api.key(owner), count: opts.count ?? 4, life: opts.life ?? 10 })
    return true
  }
  const q = new Quaternion()
  const up = new Vector3(0, 1, 0)
  const sc = new Vector3(1, 1, 1)
  const pv = new Vector3()
  function updateBees(dt, t) {
    for (let i = bees.length - 1; i >= 0; i--) {
      const b = bees[i]
      if (t > b.until || (!b.ghost && !b.owner.alive)) {
        burst(puff, 3, () => ({ x: b.x, y: b.y, z: b.z, vy: 0.4, life: 0.5, size: 0.15, sizeEnd: 0.3, color: C.white, alpha: 0.7 }))
        bees.splice(i, 1)
        continue
      }
      // nearest enemy of the owner
      if (!b.target || !b.target.alive || b.target.invisible || rr() < dt) {
        let best = null
        let bestD = 20
        for (const e of api.entities()) {
          if (!e.alive || e.invisible || api.allies(e, b.owner) || e.protectedUntil > t) continue
          const d = dist3(e.pos.x, e.pos.y, e.pos.z, b.x, b.y, b.z)
          if (d < bestD) {
            bestD = d
            best = e
          }
        }
        b.target = best
      }
      b.ph += dt * 9
      const T = b.target ?? b.owner
      const tx = T.pos.x + Math.sin(b.ph) * (b.target ? 0.3 : 1.2)
      const ty = T.pos.y + (b.target ? 1.3 : 2.1) + Math.sin(b.ph * 1.7) * 0.25
      const tz = T.pos.z + Math.cos(b.ph) * (b.target ? 0.3 : 1.2)
      const dx = tx - b.x
      const dy = ty - b.y
      const dz = tz - b.z
      const d = Math.hypot(dx, dy, dz) || 1
      const sp = 9
      const k = Math.min(1, dt * 4)
      b.vx += ((dx / d) * sp - b.vx) * k
      b.vy += ((dy / d) * sp - b.vy) * k
      b.vz += ((dz / d) * sp - b.vz) * k
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.z += b.vz * dt
      b.cd -= dt
      if (b.target && !b.ghost && b.cd <= 0 && dist3(b.x, b.y, b.z, b.target.pos.x, b.target.pos.y + 1.2, b.target.pos.z) < 1) {
        b.cd = 1
        api.damage(b.target, b.dmg, b.owner, { kind: 'sting', noKb: true, ignoreIframes: true })
      }
    }
    beeMesh.count = bees.length
    for (let i = 0; i < bees.length; i++) {
      const b = bees[i]
      q.setFromAxisAngle(up, Math.atan2(b.vx, b.vz))
      m4.compose(pv.set(b.x, b.y, b.z), q, sc)
      beeMesh.setMatrixAt(i, m4)
    }
    beeMesh.instanceMatrix.needsUpdate = true
  }

  // --- lightning, sonic boom, slam ------------------------------------------------------------------------------
  const bolts = []
  const boltMat = new LineBasicMaterial({ color: '#e8f4ff', transparent: true, blending: AdditiveBlending })
  function lightning(target, source, dmg) {
    bolt(target.pos.x, target.pos.y, target.pos.z)
    api.emit({ t: 'bolt', at: r3(target.pos) })
    api.damage(target, dmg, source, { kind: 'lightning', kbScale: 0.6, ignoreIframes: true })
  }
  function bolt(tx, ty, tz) {
    const pts = []
    let x = tx + (rr() - 0.5) * 2
    let z = tz + (rr() - 0.5) * 2
    const top = ty + 16
    for (let i = 0; i <= 10; i++) {
      const y = top - (i / 10) * 16
      pts.push(x, y, z)
      x += (tx - x) * 0.35 + (rr() - 0.5) * 1.2
      z += (tz - z) * 0.35 + (rr() - 0.5) * 1.2
    }
    pts.push(tx, ty + 0.2, tz)
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    const line = new Line(geo, boltMat)
    line.frustumCulled = false
    root.add(line)
    bolts.push({ line, until: api.now() + 0.25 })
    burst(spark, 20, () => ({ x: tx, y: ty + 1, z: tz, vx: (rr() - 0.5) * 5, vy: rr() * 4, vz: (rr() - 0.5) * 5, gravity: -6, life: 0.5, size: 0.25, sizeEnd: 0.03, color: C.white, twinkle: 14 }))
    api.soundAt(tx, ty, tz, (k) => sfx.thunder(k))
  }
  const rayB = new Ray()
  function boom(owner, from, dir, opts) {
    rayB.origin.set(from.x, from.y, from.z)
    rayB.direction.set(dir.x, dir.y, dir.z).normalize()
    let best = null
    let bestD = opts.range ?? 16
    for (const e of api.entities()) {
      if (!e.alive || api.allies(e, owner)) continue
      if (rayB.intersectBox(entityBox(e, 0.35), hitPt)) {
        const d = hitPt.distanceTo(rayB.origin)
        if (d < bestD) {
          bestD = d
          best = e
        }
      }
    }
    boomRings(from, rayB.direction, bestD)
    if (api.local(owner)) api.emit({ t: 'boom', from: r3(from), dir: r3(rayB.direction), len: Math.round(bestD * 10) / 10 })
    if (best) api.damage(best, opts.damage ?? 7, owner, { kind: 'magic', kbScale: 1.8, dir: { x: rayB.direction.x, z: rayB.direction.z }, ignoreShield: true })
    return true
  }
  // rings along the beam (through walls)
  function boomRings(from, dir, len) {
    for (let s = 1; s < len; s += 1.2) {
      const cx = from.x + dir.x * s
      const cy = from.y + dir.y * s
      const cz = from.z + dir.z * s
      burst(spark, 6, (i) => {
        const a = (i / 6) * Math.PI * 2
        return { x: cx + Math.cos(a) * 0.5 * dir.z, y: cy + Math.sin(a) * 0.5, z: cz - Math.cos(a) * 0.5 * dir.x, life: 0.5, size: 0.3, sizeEnd: 0.6, color: C.cyan, twinkle: 0 }
      })
    }
    api.soundAt(from.x, from.y, from.z, (k) => sfx.sonicBoom(k))
  }
  function slamFx(x, y, z, r) {
    ring(x, y, z, r, C.dust, 32, r * 1.6)
    api.soundAt(x, y, z, (k) => sfx.explosion(0.7 * k))
  }
  function slam(owner, opts) {
    const r = opts.radius ?? 5
    slamFx(owner.pos.x, owner.pos.y, owner.pos.z, r)
    if (api.local(owner)) api.emit({ t: 'slam', at: r3(owner.pos), r })
    for (const e of api.entities()) {
      if (!e.alive || api.allies(e, owner)) continue
      const d = Math.hypot(e.pos.x - owner.pos.x, e.pos.z - owner.pos.z)
      if (d > r || Math.abs(e.pos.y - owner.pos.y) > 2.5) continue
      const k = 1 - d / r
      api.damage(e, (opts.damage ?? 4) * (0.5 + 0.5 * k), owner, { kind: 'melee', from: { x: owner.pos.x, z: owner.pos.z }, kbScale: (opts.kb ?? 1.6) + k, upScale: opts.up ?? 1.4, ignoreShield: true })
      if (opts.slow) api.status(e, 'slow', opts.slow)
    }
    return true
  }

  // --- dash (samurai) + rewind (chronomancer) ------------------------------------------------------------------------
  const dashes = []
  function dash(owner, dirX, dirZ, opts) {
    const h = Math.hypot(dirX, dirZ) || 1
    const s = opts.speed ?? 20
    api.push(owner, (dirX / h) * s, 3, (dirZ / h) * s)
    dashes.push({ owner, until: api.now() + 0.35, hit: new Set(), dmg: opts.damage ?? 6, dx: dirX / h, dz: dirZ / h })
    api.soundAt(owner.pos.x, owner.pos.y, owner.pos.z, (k) => sfx.swing(1.3 * k))
    return true
  }
  function updateDashes(t) {
    for (let i = dashes.length - 1; i >= 0; i--) {
      const d = dashes[i]
      if (t > d.until || !d.owner.alive) {
        dashes.splice(i, 1)
        continue
      }
      const o = d.owner
      burst(puff, 2, () => ({ x: o.pos.x, y: o.pos.y + 0.3 + rr(), z: o.pos.z, life: 0.4, size: 0.3, sizeEnd: 0.6, color: C.white, alpha: 0.4 }))
      for (const e of api.entities()) {
        if (!e.alive || d.hit.has(e) || api.allies(e, o)) continue
        if (dist3(e.pos.x, e.pos.y, e.pos.z, o.pos.x, o.pos.y, o.pos.z) > 1.7) continue
        d.hit.add(e)
        api.damage(e, d.dmg, o, { kind: 'melee', dir: { x: d.dx, z: d.dz }, kbScale: 1.2, ignoreIframes: true })
      }
    }
  }
  const history = new Map() // entity -> [{x,y,z,t}]
  function track(e, t, keep) {
    let h = history.get(e)
    if (!h) history.set(e, (h = []))
    if (!h.length || t - h[h.length - 1].t > 0.1) h.push({ x: e.pos.x, y: e.pos.y, z: e.pos.z, t })
    while (h.length && t - h[0].t > keep + 0.2) h.shift()
  }
  function rewind(e, opts) {
    const h = history.get(e)
    const t = api.now()
    const back = h?.find((p) => t - p.t <= (opts.seconds ?? 3))
    if (!back) return false
    fx.portal(e.pos.x, e.pos.y, e.pos.z)
    if (api.local(e)) api.emit({ t: 'portal', at: r3(e.pos), to: r3(back) })
    api.teleport(e, back.x, back.y, back.z)
    fx.portal(back.x, back.y, back.z)
    api.soundAt(back.x, back.y, back.z, (k) => sfx.warp(k))
    h.length = 0
    return true
  }

  // --- starter-kit abilities -----------------------------------------------------------------------------------
  // archer: a fan of arrows (they fly and are relayed like any arrow)
  function volley(owner, from, dir, opts) {
    const n = opts.arrows ?? 3
    const spread = opts.spread ?? 0.16
    const base = Math.atan2(dir.x, dir.z)
    const h = Math.hypot(dir.x, dir.z) || 1
    const bow = { dmg: opts.damage ?? 5, dmgMax: opts.damage ?? 5, speed: 38, speedMax: 38, gravity: -18 }
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread
      api.shoot(owner, from, { x: Math.sin(a) * h, y: dir.y, z: Math.cos(a) * h }, 1, bow)
    }
    return true
  }
  // glider: a cone of wind that blows everyone in front of you away
  function gust(owner, from, dir, opts) {
    const range = opts.range ?? 7
    const h = Math.hypot(dir.x, dir.z) || 1
    const dx = dir.x / h
    const dz = dir.z / h
    fx.gust(from.x, from.y, from.z, dx, dz, range)
    if (api.local(owner)) api.emit({ t: 'gust', from: r3(from), dir: { x: Math.round(dx * 1000) / 1000, z: Math.round(dz * 1000) / 1000 }, len: range })
    for (const e of api.entities()) {
      if (!e.alive || api.allies(e, owner)) continue
      const ex = e.pos.x - owner.pos.x
      const ez = e.pos.z - owner.pos.z
      const d = Math.hypot(ex, ez)
      if (d > range || d < 0.01 || Math.abs(e.pos.y - owner.pos.y) > 3) continue
      if ((ex * dx + ez * dz) / d < 0.6) continue // a ~53 degree cone
      const k = 1 - d / range
      api.damage(e, opts.damage ?? 1, owner, { kind: 'magic', dir: { x: dx, z: dz }, kbScale: (opts.kb ?? 2.6) * (0.6 + 0.4 * k), upScale: 1.1, ignoreShield: true })
    }
    return true
  }
  // spark: lightning on the enemy closest to where you look (nobody in range = nothing spent)
  function zap(owner, from, dir, opts) {
    let best = null
    let bestS = -Infinity
    for (const e of api.entities()) {
      if (!e.alive || e.invisible || api.allies(e, owner)) continue
      const ex = e.pos.x - from.x
      const ey = e.pos.y + 1 - from.y
      const ez = e.pos.z - from.z
      const d = Math.hypot(ex, ey, ez)
      if (d > (opts.range ?? 12) || d < 0.01) continue
      const facing = (ex * dir.x + ey * dir.y + ez * dir.z) / d
      if (facing < 0.5) continue
      if (segmentClear(from.x, from.y, from.z, e.pos.x, e.pos.y + 1, e.pos.z) < 0.97) continue
      const s = facing * 2 - d / 12
      if (s > bestS) {
        bestS = s
        best = e
      }
    }
    if (!best) return false
    lightning(best, owner, opts.damage ?? 3)
    api.soundAt(best.pos.x, best.pos.y, best.pos.z, (k) => sfx.zap(k))
    return true
  }
  // spring: a huge jump; landing slams the ground
  const leaps = []
  function leap(owner, dirX, dirZ, opts) {
    const h = Math.hypot(dirX, dirZ) || 1
    const f = opts.forward ?? 6
    api.push(owner, (dirX / h) * f, opts.up ?? 17, (dirZ / h) * f)
    for (let i = leaps.length - 1; i >= 0; i--) if (leaps[i].owner === owner) leaps.splice(i, 1)
    leaps.push({ owner, from: api.now(), opts })
    ring(owner.pos.x, owner.pos.y, owner.pos.z, 1.5, C.green, 16, 3)
    api.soundAt(owner.pos.x, owner.pos.y, owner.pos.z, (k) => sfx.swing(1.2 * k))
    return true
  }
  function updateLeaps(t) {
    for (let i = leaps.length - 1; i >= 0; i--) {
      const l = leaps[i]
      if (!l.owner.alive || t - l.from > 6) {
        leaps.splice(i, 1)
        continue
      }
      if (t - l.from < 0.3 || !l.owner.grounded) continue
      leaps.splice(i, 1)
      slam(l.owner, { radius: l.opts.radius ?? 3.6, damage: l.opts.damage ?? 3, kb: 1.2, up: 1.5 })
    }
  }
  // firework: rocket yourself up in a burst of stars that hurts whoever stands close
  function rocket(owner, opts) {
    const p = owner.pos
    fx.firework(p.x, p.y + 0.4, p.z)
    fx.explosion(p.x, p.y, p.z, 1.2)
    if (api.local(owner)) api.emit({ t: 'rocket', owner: api.key(owner), at: r3(p) })
    const r = opts.radius ?? 3.2
    for (const e of api.entities()) {
      if (!e.alive || api.allies(e, owner)) continue
      const d = dist3(e.pos.x, e.pos.y, e.pos.z, p.x, p.y, p.z)
      if (d > r) continue
      api.damage(e, (opts.damage ?? 4) * (0.5 + 0.5 * (1 - d / r)), owner, { kind: 'explosion', from: { x: p.x, z: p.z }, kbScale: 1.4, upScale: 1.4 })
    }
    api.push(owner, 0, opts.up ?? 19, 0)
    sparkTrails.push({ owner, until: api.now() + 1.1 })
    return true
  }
  const sparkTrails = []
  // blinker: a short teleport forward, never through a wall
  function blink(owner, dirX, dirZ, opts) {
    const h = Math.hypot(dirX, dirZ) || 1
    const dx = dirX / h
    const dz = dirZ / h
    const p = owner.pos
    const range = opts.range ?? 7
    // how far the way is clear at chest height
    const f = segmentClear(p.x, p.y + 1.1, p.z, p.x + dx * range, p.y + 1.1, p.z + dz * range)
    for (let d = Math.max(0, f * range - 0.6); d >= 1.5; d -= 0.5) {
      const spot = standSpot(p.x + dx * d, p.y + 1.6, p.z + dz * d)
      if (!spot || Math.abs(spot.y - p.y) > 2.2) continue
      fx.portal(p.x, p.y, p.z)
      if (api.local(owner)) api.emit({ t: 'portal', at: r3(p), to: r3(spot) })
      api.teleport(owner, spot.x, spot.y, spot.z)
      fx.portal(spot.x, spot.y, spot.z)
      api.soundAt(spot.x, spot.y, spot.z, (k) => sfx.warp(k))
      return true
    }
    return false
  }

  // --- ultimates (combat.js decides who and when; ULTIMATE in config.js) -----------------------------------------
  // sword: spin with the blade out, hitting everyone around you a few times
  const whirls = []
  function whirlwind(owner, opts, color) {
    whirls.push({ owner, until: api.now() + (opts.time ?? 1.4), next: 0, opts, color: col(color ?? '#ffffff'), ghost: !!opts.ghost })
    if (!opts.ghost && api.local(owner)) api.emit({ t: 'whirl', owner: api.key(owner), time: opts.time ?? 1.4, color })
    return true
  }
  function updateWhirls(t) {
    for (let i = whirls.length - 1; i >= 0; i--) {
      const w = whirls[i]
      const o = w.owner
      if (t > w.until || (!w.ghost && !o.alive)) {
        whirls.splice(i, 1)
        continue
      }
      const r = w.opts.radius ?? 3.8
      if (rr() < 0.7) fx.whirl(o.pos.x, o.pos.y, o.pos.z, r, w.color)
      if (t < w.next) continue
      w.next = t + (w.opts.every ?? 0.25)
      api.soundAt(o.pos.x, o.pos.y, o.pos.z, (k) => sfx.swing(1.4 * k))
      if (w.ghost) continue
      for (const e of api.entities()) {
        if (!e.alive || api.allies(e, o)) continue
        if (Math.hypot(e.pos.x - o.pos.x, e.pos.z - o.pos.z) > r || Math.abs(e.pos.y - o.pos.y) > 2.2) continue
        api.damage(e, w.opts.damage ?? 2.5, o, { kind: 'melee', from: { x: o.pos.x, z: o.pos.z }, kbScale: 0.7, upScale: 0.6, ignoreIframes: true })
      }
    }
  }
  // bow: arrows rain from the sky around a spot
  const rains = []
  function arrowRain(owner, at, opts) {
    const time = opts.time ?? 1.5
    rains.push({ owner, at, left: opts.arrows ?? 16, every: time / (opts.arrows ?? 16), next: 0, opts })
    ring(at.x, at.y, at.z, opts.radius ?? 4.2, C.red, 28, 3)
    return true
  }
  const RAIN_BOW = { dmg: 4, dmgMax: 4, speed: 30, speedMax: 30, gravity: -20 }
  function updateRains(t) {
    for (let i = rains.length - 1; i >= 0; i--) {
      const r = rains[i]
      if (!r.owner.alive || r.left <= 0) {
        rains.splice(i, 1)
        continue
      }
      if (t < r.next) continue
      r.next = t + r.every
      r.left--
      const a = rr() * Math.PI * 2
      const d = Math.sqrt(rr()) * (r.opts.radius ?? 4.2)
      const x = r.at.x + Math.cos(a) * d
      const z = r.at.z + Math.sin(a) * d
      const dmg = r.opts.damage ?? 4
      api.shoot(r.owner, { x: x + 0.6, y: r.at.y + 14, z: z - 0.3 }, { x: -0.04, y: -1, z: 0.02 }, 1, { ...RAIN_BOW, dmg, dmgMax: dmg })
    }
  }
  // fists: a flurry of punches on the closest enemy, each one healing you a little
  const flurries = []
  function flurry(owner, opts, color) {
    flurries.push({ owner, left: opts.hits ?? 8, every: (opts.time ?? 1) / (opts.hits ?? 8), next: 0, opts, color: col(color ?? '#ffffff') })
    return true
  }
  function updateFlurries(t) {
    for (let i = flurries.length - 1; i >= 0; i--) {
      const f = flurries[i]
      const o = f.owner
      if (!o.alive || f.left <= 0) {
        flurries.splice(i, 1)
        continue
      }
      if (t < f.next) continue
      f.next = t + f.every
      f.left--
      let best = null
      let bestD = f.opts.range ?? 4.5
      for (const e of api.entities()) {
        if (!e.alive || e.invisible || api.allies(e, o)) continue
        const d = dist3(e.pos.x, e.pos.y, e.pos.z, o.pos.x, o.pos.y, o.pos.z)
        if (d < bestD) {
          bestD = d
          best = e
        }
      }
      api.soundAt(o.pos.x, o.pos.y, o.pos.z, (k) => sfx.swing(1.6 * k))
      if (!best) continue
      fx.whirl(best.pos.x, best.pos.y, best.pos.z, 0.6, f.color)
      if (api.damage(best, f.opts.damage ?? 1.6, o, { kind: 'melee', from: { x: o.pos.x, z: o.pos.z }, kbScale: 0.35, ignoreIframes: true })) api.heal(o, f.opts.heal ?? 0.6)
    }
  }

  return {
    fx,
    turrets, // dev inspection
    // replays of other players' effects (combat.js 'fx' handler)
    placeWall,
    bolt,
    boomRings,
    slamFx,
    throwItem,
    explode,
    wall,
    turret,
    addBees,
    lightning,
    boom,
    slam,
    dash,
    track,
    rewind,
    volley,
    gust,
    zap,
    leap,
    rocket,
    blink,
    whirlwind,
    arrowRain,
    flurry,
    // a firework trail behind someone (replays of another player's rocket jump)
    trail(owner, s = 1.1) {
      sparkTrails.push({ owner, until: api.now() + s })
    },
    forget(e) {
      history.delete(e)
    },
    update(dt, t, viewportH) {
      updateProjectiles(dt, t)
      updateAreas(dt, t)
      updateWalls(t)
      updateTurrets(dt, t)
      updateBees(dt, t)
      updateDashes(t)
      updateLeaps(t)
      updateWhirls(t)
      updateRains(t)
      updateFlurries(t)
      for (let i = sparkTrails.length - 1; i >= 0; i--) {
        const s = sparkTrails[i]
        if (t > s.until) {
          sparkTrails.splice(i, 1)
          continue
        }
        const o = s.owner
        const c = [C.heal, C.gold, C.cyan][Math.floor(rr() * 3)]
        burst(spark, 2, () => ({ x: o.pos.x + (rr() - 0.5) * 0.4, y: o.pos.y + rr() * 0.4, z: o.pos.z + (rr() - 0.5) * 0.4, vy: -1.5, life: 0.6, size: 0.22, sizeEnd: 0.03, color: c, twinkle: 9 }))
      }
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i]
        b.line.material.opacity = Math.max(0, (b.until - t) / 0.25)
        if (t < b.until) continue
        root.remove(b.line)
        b.line.geometry.dispose()
        bolts.splice(i, 1)
      }
      glow.update(dt, camera, viewportH)
      puff.update(dt, camera, viewportH)
      spark.update(dt, camera, viewportH)
    },
  }
}
