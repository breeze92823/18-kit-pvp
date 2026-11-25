// Arena bots: blocky fighters that drop into the arena with a random kit and fight
// everyone else (the player and each other, free-for-all). Each one walks on the
// arena's voxels with its own small physics (gravity, 0.55 m autostep, jumping up
// one block, swimming, knockback that can throw it into the void or lava, fall damage),
// avoids cliffs and lava, chases or circles its target, swings / shoots on a cooldown,
// raises its shield, and uses its kit's ability when the moment fits (abilities.js).
// Necromancer zombies are bots too (`minion`, with an `owner`). Damage, kill credit and
// rewards are combat.js's job: bots call ctx.damage, ctx.shoot and ctx.died.
// Tunables: COMBAT.bots in config.js.
import { CanvasTexture, Color, Group, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'
import { ARENA, COARSE_POINTER, COMBAT, FALL, KITS, PHYSICS } from '../config.js'
import { RAPIER, segmentClear, world as physicsWorld } from '../physics.js'
import { buildCharacter, randomSkin } from '../lobby/characters.js'
import { itemMesh } from '../lobby/models.js'
import { fakeName } from '../lobby/holograms.js'
import { mulberry32 } from '../textures.js'
import { weaponFor } from './weapons.js'

const R = 0.3 // body half-width
const H = 1.8 // body height
const STEP = 0.55 // autostep, like the player
const EYE = 1.62
const FOOT = [[0, 0], [R, R], [R, -R], [-R, R], [-R, -R]]
const BLOCKED = Infinity
const rnd = (a, b) => a + Math.random() * (b - a)
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const span = (info, cy) => (info.shape === 'slab' ? [cy, cy + 0.5] : info.shape === 'slab_top' ? [cy + 0.5, cy + 1] : [cy, cy + 1])
const FLASH = new Color(0.9, 0.05, 0.05)
const FROZEN = new Color(0.25, 0.55, 0.8)
const ZOMBIE_FISTS = { type: 'fist', item: null, name: 'Fists', dmg: 3, cooldown: 0.8, kb: 0.8 }

// a red "marked" arrow shown through walls over hunter-marked bots
let markTex = null
function markSprite() {
  if (!markTex) {
    const c = document.createElement('canvas')
    c.width = c.height = 32
    const g = c.getContext('2d')
    g.fillStyle = '#ff3a3a'
    g.strokeStyle = '#3a0000'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(4, 6)
    g.lineTo(28, 6)
    g.lineTo(16, 28)
    g.closePath()
    g.fill()
    g.stroke()
    markTex = new CanvasTexture(c)
    markTex.colorSpace = SRGBColorSpace
  }
  const s = new Sprite(new SpriteMaterial({ map: markTex, depthTest: false, transparent: true }))
  s.scale.set(0.45, 0.45, 1)
  s.renderOrder = 20
  return s
}

// ctx: { damage(target, amount, source, opts), shoot(source, from, dir, charge, weapon),
//        died(bot, cause), feed(html), swing(bot), entities(), allies(a, b), onSpawn(bot),
//        botAbility(bot, target, dist, los, t), moveMul(bot), on(e, status),
//        fx: { landing(x, y, z), poof(x, y, z), rebirth } }
// opts: { seedStart } (a second set, e.g. the duel practice bot, uses its own id range)
export function createArenaBots(scene, arena, ctx, opts = {}) {
  const W = arena.world
  const B = COMBAT.bots
  const C = arena.anchors.center
  const group = new Group()
  group.name = 'arena-bots'
  scene.add(group)
  const bots = []
  let seedNext = opts.seedStart ?? 900
  let self = null // the API object (every bot points back at it: b.mgr)

  // --- voxel collision -------------------------------------------------------------------
  // Highest step the body would stand on at (x, z) with feet at y, or BLOCKED if
  // something taller than the autostep is in the way.
  function probe(x, y, z) {
    let step = -Infinity
    const y0 = Math.floor(y)
    const y1 = Math.floor(y + H - 0.05)
    for (const [ox, oz] of FOOT) {
      const cx = Math.floor(x + ox)
      const cz = Math.floor(z + oz)
      for (let cy = y0; cy <= y1; cy++) {
        const info = W.info(cx, cy, cz)
        if (!info || !info.solid) continue
        const [lo, hi] = span(info, cy)
        if (hi <= y + 0.001 || lo >= y + H - 0.05) continue
        if (hi - y <= STEP && lo <= y + 0.05) step = Math.max(step, hi)
        else return BLOCKED
      }
    }
    return step
  }
  // Highest support under the footprint (at or below the autostep).
  function ground(x, y, z) {
    let g = -Infinity
    for (const [ox, oz] of FOOT) {
      const gy = W.groundY(Math.floor(x + ox), Math.floor(z + oz), y + STEP)
      if (gy !== null && gy > g) g = gy
    }
    return g
  }
  function headHit(x, y, z) {
    for (const [ox, oz] of FOOT) {
      const info = W.info(Math.floor(x + ox), Math.floor(y + H), Math.floor(z + oz))
      if (info && info.solid) return true
    }
    return false
  }
  // Walkable for the AI: there is ground no more than a short drop below, it is not
  // a wall taller than one jump, and it is not lava.
  function safe(y, x, z) {
    const g = W.groundY(Math.floor(x), Math.floor(z), y + 1.3)
    if (g === null || y - g > 3.2 || g - y > 1.3) return false
    return arena.liquidAt(x, g + 0.2, z) !== 'lava'
  }

  // --- spawning ---------------------------------------------------------------------------
  const pickKit = (rand) => {
    // kits near the newest fighter's level (ctx.kitCap), so a level 1 player never meets level 100 powers.
    // The pool shrinks but the number of rand() calls stays the same (names / skins follow the seed).
    const cap = Math.min(B.maxKitLevel, ctx.kitCap?.() ?? B.maxKitLevel)
    const pool = KITS.filter((k) => k.level <= cap)
    if (rand() < B.archerShare) {
      const bows = pool.filter((k) => weaponFor(k).type === 'bow')
      if (bows.length) return bows[Math.floor(rand() * bows.length)]
    }
    // favour the cheaper kits, like a real lobby
    return pool[Math.floor(rand() ** 1.6 * pool.length)]
  }
  function randomSpot() {
    const Q = ARENA.half
    for (let i = 0; i < 80; i++) {
      const x = C.x + rnd(-Q + 3, Q - 3)
      const z = C.z + rnd(-Q + 3, Q - 3)
      const g = W.groundY(Math.floor(x), Math.floor(z), C.y + 40)
      if (g === null || g < C.y - 12) continue
      if (!safe(g, x, z) || probe(x, g, z) === BLOCKED) continue
      return { x, y: g, z }
    }
    return { x: C.x + 0.5, y: C.y, z: C.z + 0.5 }
  }
  function tagLines(name, hp, color = '#ffffff') {
    return [
      { text: name, size: 34, color, bg: 'rgba(0,0,0,0.32)', weight: 600 },
      { text: String(Math.max(0, Math.ceil(hp))), size: 34, color: '#ffffff', heart: true },
    ]
  }

  // spawn: 'random' (already in the arena), 'drop' (falls in over the plaza) or a minion
  // { owner, at: {x,y,z}, hp, life }
  // fixedId: a puppet of the host's bot with that id (same seed = same name, kit and skin)
  // mode 'at' + at {x, y, z}: a fighter placed there (duel practice); kitId forces the kit
  function makeBot(t, mode, minion = null, fixedId = null, at = null, kitId = null) {
    const seed = fixedId ?? seedNext++
    if (fixedId !== null) seedNext = Math.max(seedNext, fixedId + 1)
    const rand = mulberry32(seed * 7 + 3)
    const picked = minion ? null : pickKit(rand)
    const kit = minion ? null : (kitId && KITS.find((k) => k.id === kitId)) || picked
    const weapon = minion ? ZOMBIE_FISTS : weaponFor(kit)
    const name = minion ? 'Zombie' : fakeName(rand)
    const maxHp = minion ? minion.hp ?? 10 : ARENA.maxHp
    const skin = randomSkin(seed)
    if (minion) Object.assign(skin, { skin: '#5f9a4e', hair: '#2f5a26', hairStyle: 'short', shirt: '#2f9aa0', shirt2: null, stripes: null, jacket: null, pants: '#3a3aa8', shoes: '#2a2a40', eyes: '#1a1a1a' })
    const ch = buildCharacter({
      skin,
      armor: kit?.armorSet ?? null,
      item: weapon.item,
      tag: tagLines(name, maxHp, minion ? '#9aff7a' : '#ffffff'),
      tagHeight: 0.46,
    })
    const holder = new Group()
    holder.add(ch.root)
    group.add(holder)
    let spot
    if (minion) spot = { ...minion.at }
    else if (mode === 'at') spot = { ...at }
    else if (mode === 'drop') {
      const a = Math.random() * Math.PI * 2
      const r = rnd(2, ARENA.plazaR - 3)
      spot = { x: C.x + 0.5 + Math.cos(a) * r, y: C.y + 34, z: C.z + 0.5 + Math.sin(a) * r }
    } else spot = randomSpot()
    const body = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spot.x, spot.y + 0.9, spot.z))
    physicsWorld.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.32), body)
    const dropIn = mode === 'drop'
    const b = {
      isBot: true,
      id: seed,
      name,
      kit,
      weapon,
      armor: kit?.armor ?? 0,
      key: `bot:${seed}`,
      minion: !!minion,
      owner: minion?.owner ?? null,
      ownerKey: minion ? minion.ownerKey ?? minion.owner?.key ?? '' : '',
      puppet: false, // drawn from the host's snapshots instead of simulated here
      net: null,
      swings: 0,
      until: minion ? t + (minion.life ?? 25) : Infinity,
      ch,
      holder,
      mats: [],
      body,
      pos: { x: spot.x, y: spot.y, z: spot.z },
      vel: { x: 0, y: dropIn ? -20 : 0, z: 0 },
      want: { x: 0, z: 0 },
      grounded: !dropIn,
      dropping: dropIn,
      peakY: spot.y,
      jump: false,
      bumped: false,
      liquid: null,
      facing: minion?.owner?.facing ?? Math.random() * Math.PI * 2,
      maxHp,
      hp: maxHp,
      shownHp: maxHp,
      alive: true,
      dying: 0,
      protectedUntil: dropIn ? Infinity : t + (minion ? 0.6 : 2),
      invulnUntil: 0,
      lastHurt: -99,
      lastHit: null,
      burnT: 0,
      burnMul: 1,
      hurtTick: 0,
      flash: 0,
      tint: null,
      target: null,
      los: false,
      thinkT: Math.random() * 0.3,
      nextAttack: t + rnd(0.5, 1.5),
      drawT: null,
      drawFor: 1,
      blocking: false,
      blockT: 0,
      strafe: Math.random() < 0.5 ? 1 : -1,
      strafeT: rnd(1, 2.5),
      fleeUntil: 0,
      roam: null,
      roamUntil: 0,
      detourUntil: 0,
      detourYaw: 0,
      lastCheck: { x: spot.x, z: spot.z, t },
      kills: 0,
      streak: 0,
      speed: 0,
      marker: null,
      invisible: false,
    }
    b.mgr = self
    ctx.onSpawn(b) // kit powers, ammo, statuses
    // count swings so the other players see them (snapshots)
    const swing = ch.swing
    ch.swing = () => {
      b.swings = (b.swings + 1) & 255
      swing()
    }
    b.swingQuiet = swing
    // own copies of the (shared) materials so the hurt flash tints only this bot
    if (b.power?.shield) {
      const sh = itemMesh(kit.icon.startsWith('shield') ? kit.icon : 'shield', 0.62, 1)
      sh.position.set(0.04, -0.42, 0.14)
      sh.rotation.set(0, Math.PI / 2, 0)
      ch.parts.armL.add(sh)
      ch.parts.shield = sh
    }
    const mats = new Map()
    ch.root.traverse((o) => {
      if (!o.isMesh || !o.material?.isMeshStandardMaterial) return
      if (!mats.has(o.material)) mats.set(o.material, o.material.clone())
      o.material = mats.get(o.material)
    })
    b.mats = [...mats.values()]
    holder.position.set(b.pos.x, b.pos.y, b.pos.z)
    return b
  }

  const respawnAt = [] // game times when a new bot drops in
  let started = false

  // --- physics ------------------------------------------------------------------------------
  function approach(v, tx, tz, max) {
    const dx = tx - v.x
    const dz = tz - v.z
    const d = Math.hypot(dx, dz)
    if (d <= max || d === 0) {
      v.x = tx
      v.z = tz
    } else {
      v.x += (dx / d) * max
      v.z += (dz / d) * max
    }
  }
  function physics(b, dt, t) {
    const p = b.pos
    const liq = arena.liquidAt(p.x, p.y + 0.9, p.z) || arena.liquidAt(p.x, p.y + 0.15, p.z)
    b.liquid = liq
    const swim = liq ? 1 : 0
    const slow = liq ? (liq === 'lava' ? 0.45 : b.power?.swimFast ? 1.1 : 0.6) : 1
    approach(b.vel, b.want.x * slow, b.want.z * slow, (b.grounded ? 45 : 9) * dt)
    if (b.jump && (b.grounded || (swim && b.vel.y < 2))) {
      b.vel.y = swim && !b.grounded ? 5.6 : PHYSICS.jumpSpeed * (b.power?.jumpMul ?? 1)
      b.grounded = false
    }
    b.jump = false
    b.vel.y += PHYSICS.gravity * dt * (swim ? 0.3 : 1)
    if (swim) {
      b.vel.y *= Math.exp(-2.2 * dt)
      if (b.vel.y < -3) b.vel.y = -3
    }
    if (b.power?.glide && !b.grounded && !swim && b.vel.y < -2.5) b.vel.y = -2.5
    if (b.vel.y < -ARENA.maxFall) b.vel.y = -ARENA.maxFall
    b.bumped = false
    const nx = p.x + b.vel.x * dt
    const sx = probe(nx, p.y, p.z)
    if (sx === BLOCKED) {
      b.vel.x = 0
      b.bumped = true
    } else {
      p.x = nx
      if (b.grounded && sx > p.y) p.y = sx
    }
    const nz = p.z + b.vel.z * dt
    const sz = probe(p.x, p.y, nz)
    if (sz === BLOCKED) {
      b.vel.z = 0
      b.bumped = true
    } else {
      p.z = nz
      if (b.grounded && sz > p.y) p.y = sz
    }
    const ny = p.y + b.vel.y * dt
    if (b.vel.y <= 0) {
      const g = ground(p.x, p.y, p.z)
      if (ny <= g) {
        if (!b.grounded) landed(b, t)
        p.y = g
        b.vel.y = 0
        b.grounded = true
      } else {
        p.y = ny
        b.grounded = false
      }
    } else {
      if (headHit(p.x, ny, p.z)) b.vel.y = 0
      else p.y = ny
      b.grounded = false
    }
    if (b.grounded || swim) b.peakY = p.y
    else b.peakY = Math.max(b.peakY, p.y)
  }
  function landed(b, t) {
    if (b.dropping) {
      b.dropping = false
      b.protectedUntil = t + 2
      b.peakY = b.pos.y
      ctx.fx.landing(b.pos.x, b.pos.y, b.pos.z)
      return
    }
    const h = b.peakY - b.pos.y
    if (h > FALL.safe && !b.power?.noFall && !b.liquid) ctx.damage(b, (h - FALL.safe) * FALL.perM, null, { kind: 'fall' })
  }

  // --- brain --------------------------------------------------------------------------------
  function think(b, t) {
    let best = null
    let bestScore = Infinity
    // how many bots (zombies included) already chase each player; capped per player, tighter on rookies
    const onIt = new Map()
    for (const o of bots) if (o !== b && o.alive && (o.target?.isPlayer || o.target?.isRemote)) onIt.set(o.target, (onIt.get(o.target) ?? 0) + 1)
    const RK = COMBAT.rookie
    for (const e of ctx.entities()) {
      if (e === b || !e.alive || e.protectedUntil > t || ctx.allies(e, b)) continue
      if (b.ignore?.e === e && t < b.ignore.until) continue
      const d = Math.hypot(e.pos.x - b.pos.x, e.pos.y - b.pos.y, e.pos.z - b.pos.z)
      if (d > B.sight || (e.invisible && d > 2)) continue
      if ((e.isPlayer || e.isRemote) && b.target !== e && (onIt.get(e) ?? 0) >= ((e.level || RK.level) < RK.level ? RK.maxBots : B.maxOnPlayer)) continue
      let score = d * (e.isPlayer ? B.playerBias : 1)
      if (b.target === e) score *= 0.6 // keep the current fight
      if (b.lastHit?.by === e && t - b.lastHit.t < 6) score *= 0.3 // hit back
      if (ctx.on(e, 'mark')) score *= 0.5 // hunters' marks draw everyone in
      if (b.minion && b.owner?.lastHit?.by === e) score *= 0.3 // defend the master
      if (score < bestScore) {
        bestScore = score
        best = e
      }
    }
    // a melee target we have not got any closer to in a few seconds is out of reach
    // (across the void, up a tower): leave it alone for a while
    if (best && b.weapon.type !== 'bow') {
      const d = Math.hypot(best.pos.x - b.pos.x, best.pos.z - b.pos.z)
      if (b.chase?.e !== best || d < b.chase.d - 1 || d < 3) b.chase = { e: best, d, t }
      else if (t - b.chase.t > 4) {
        b.ignore = { e: best, until: t + 8 }
        b.chase = null
        best = null
      }
    }
    b.target = best
    b.los = best ? segmentClear(b.pos.x, b.pos.y + EYE, b.pos.z, best.pos.x, best.pos.y + 1.2, best.pos.z) > 0.98 : false
  }

  // Moves along (dx, dz) at `speed`, turning away from cliffs, lava and tall walls.
  function steer(b, dx, dz, speed, t) {
    speed *= b.moveK
    if (!speed || (!dx && !dz)) {
      b.want.x = b.want.z = 0
      return
    }
    let base = Math.atan2(dx, dz)
    if (t < b.detourUntil) base = b.detourYaw
    const side = b.strafe
    for (const off of [0, 0.5, -0.5, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4]) {
      const a = base + off * side
      const sx = Math.sin(a)
      const sz = Math.cos(a)
      if (safe(b.pos.y, b.pos.x + sx * 1.1, b.pos.z + sz * 1.1) && safe(b.pos.y, b.pos.x + sx * 0.5, b.pos.z + sz * 0.5)) {
        b.want.x = sx * speed
        b.want.z = sz * speed
        return
      }
    }
    b.want.x = b.want.z = 0
  }

  function decide(b, dt, t) {
    const tg = b.target
    const p = b.pos
    let faceYaw = null
    b.moveK = ctx.moveMul(b)
    b.strafeT -= dt
    if (b.strafeT <= 0) {
      b.strafeT = rnd(0.8, 2.4)
      b.strafe = -b.strafe
    }
    if (tg) {
      const dx = tg.pos.x - p.x
      const dz = tg.pos.z - p.z
      const d = Math.hypot(dx, dz)
      faceYaw = Math.atan2(dx, dz)
      const nx = d > 0.01 ? dx / d : 0
      const nz = d > 0.01 ? dz / d : 0
      if (t < b.fleeUntil) {
        steer(b, -nx, -nz, B.runSpeed, t)
        faceYaw = Math.atan2(-dx, -dz)
      } else if (b.weapon.type === 'bow') {
        if (d < 7) steer(b, -nx + -nz * b.strafe * 0.6, -nz + nx * b.strafe * 0.6, B.walkSpeed, t)
        else if (d > 18 || !b.los) steer(b, nx, nz, B.walkSpeed, t)
        else steer(b, -nz * b.strafe, nx * b.strafe, B.strafeSpeed, t)
      } else if (d > 2.3) {
        steer(b, nx, nz, d > 6 ? B.runSpeed : B.walkSpeed, t)
        if (d < 4.5 && b.grounded && Math.random() < dt * B.critJumps) b.jump = true // jump in for a crit
      } else {
        // circle the target, backing off a little when too close
        const back = d < 1.5 ? -0.6 : 0
        steer(b, -nz * b.strafe + nx * back, nx * b.strafe + nz * back, B.strafeSpeed, t)
      }
    } else if (b.minion && b.owner?.alive) {
      // summons stay close to their master
      const dx = b.owner.pos.x - p.x
      const dz = b.owner.pos.z - p.z
      const d = Math.hypot(dx, dz)
      steer(b, dx, dz, d > 3 ? (d > 8 ? B.runSpeed : B.walkSpeed) : 0, t)
    } else {
      // roam: toward the plaza now and then, otherwise somewhere nearby
      if (!b.roam || t > b.roamUntil || Math.hypot(b.roam.x - p.x, b.roam.z - p.z) < 1.2) {
        b.roam = null
        for (let k = 0; k < 8 && !b.roam; k++) {
          const toPlaza = Math.random() < 0.35
          const a = Math.random() * Math.PI * 2
          const r = rnd(3, 12)
          const x = toPlaza ? C.x + Math.cos(a) * r : p.x + Math.cos(a) * r
          const z = toPlaza ? C.z + Math.sin(a) * r : p.z + Math.sin(a) * r
          const g = W.groundY(Math.floor(x), Math.floor(z), p.y + 8)
          if (g !== null && Math.abs(g - p.y) < 8 && arena.liquidAt(x, g + 0.2, z) !== 'lava') b.roam = { x, z }
        }
        b.roamUntil = t + rnd(5, 10)
      }
      if (b.roam) steer(b, b.roam.x - p.x, b.roam.z - p.z, B.walkSpeed * 0.8, t)
      else steer(b, 0, 0, 0, t)
    }
    // walls one block high: hop up; stuck for a second: take a detour
    const moving = Math.hypot(b.want.x, b.want.z) > 0.5
    if (b.moveK > 0) {
      if (moving && b.bumped && b.grounded) b.jump = true
      if (b.liquid === 'water' && moving && b.bumped) b.jump = true
    }
    if (t - b.lastCheck.t > 1) {
      if (moving && Math.hypot(p.x - b.lastCheck.x, p.z - b.lastCheck.z) < 0.4 && t > b.detourUntil) {
        b.detourUntil = t + rnd(0.8, 1.6)
        b.detourYaw = Math.random() * Math.PI * 2
      }
      b.lastCheck = { x: p.x, z: p.z, t }
    }
    // turn toward the target (or the way we walk); frozen bots stay put
    if (ctx.on(b, 'freeze')) return
    if (faceYaw === null && moving) faceYaw = Math.atan2(b.want.x, b.want.z)
    if (faceYaw !== null) {
      const diff = angDiff(b.facing, faceYaw)
      b.facing += Math.sign(diff) * Math.min(Math.abs(diff), dt * 10)
    }
  }

  function attack(b, dt, t) {
    const tg = b.target
    if (!tg || !tg.alive || t < b.protectedUntil || ctx.on(b, 'freeze')) {
      b.drawT = null
      b.blocking = false
      return
    }
    const ex = b.pos.x
    const ey = b.pos.y + EYE
    const ez = b.pos.z
    const dx = tg.pos.x - ex
    const dy = tg.pos.y + 1.1 - ey
    const dz = tg.pos.z - ez
    const d = Math.hypot(dx, dy, dz)
    const yawTo = Math.atan2(dx, dz)
    // the kit's ability when the moment fits
    if (ctx.botAbility(b, tg, d, b.los, t)) {
      b.ch.swing()
      b.drawT = null
      return
    }
    // shields: raise it in short windows when a fighter is close or an archer draws
    if (b.power?.shield) {
      b.blockT -= dt
      const threat = (d < 4.2 && tg.weapon?.type !== 'bow') || (tg.drawT != null && b.los && d < 30)
      if (ctx.on(b, 'shieldBroken') || !threat) b.blocking = false
      else if (b.blockT <= 0) {
        b.blocking = !b.blocking
        b.blockT = b.blocking ? rnd(0.5, 1.1) : rnd(0.6, 1.2)
      }
      if (b.blocking) return
    }
    if (b.weapon.type === 'bow') {
      if (!b.los || d > 32 || d < 2.5) {
        b.drawT = null
        return
      }
      if (b.drawT === null) {
        if (t < b.nextAttack) return
        b.drawT = 0
        b.drawFor = rnd(0.65, 1.05) * b.weapon.draw
      }
      b.drawT += dt
      if (b.drawT >= b.drawFor && Math.abs(angDiff(b.facing, yawTo)) < 0.3) {
        const charge = Math.min(1, b.drawT / b.weapon.draw)
        const speed = (b.weapon.speed + (b.weapon.speedMax - b.weapon.speed) * charge) * (b.power?.bowSpeed ?? 1)
        // lead a little and lift the aim for the arrow's drop
        const h = Math.hypot(dx, dz)
        const tt = h / speed
        const lead = 0.6
        const ax = dx + (tg.vel?.x ?? 0) * tt * lead
        const az = dz + (tg.vel?.z ?? 0) * tt * lead
        const ay = dy + 0.5 * -b.weapon.gravity * tt * tt
        const err = B.aimError * (1 + d / 18)
        const yaw = Math.atan2(ax, az) + rnd(-err, err)
        const pitch = Math.atan2(ay, Math.hypot(ax, az)) + rnd(-err, err) * 0.7
        const dir = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }
        ctx.shoot(b, { x: ex + dir.x * 0.4, y: ey - 0.1, z: ez + dir.z * 0.4 }, dir, charge, b.weapon)
        b.drawT = null
        b.nextAttack = t + rnd(0.4, 1.1)
      }
      return
    }
    if (t < b.nextAttack) return
    if (d > COMBAT.reach - 0.25 || Math.abs(angDiff(b.facing, yawTo)) > 0.7 || !b.los) return
    b.ch.swing()
    b.nextAttack = t + rnd(B.cooldown[0], B.cooldown[1]) * (b.weapon.cooldown / COMBAT.weapons.sword.cooldown) * (b.power?.cooldownMul ?? 1)
    if (Math.random() < B.hitChance) {
      const crit = !b.grounded && b.vel.y < -0.5
      ctx.damage(tg, b.weapon.dmg * rnd(0.8, 1) * (crit ? COMBAT.critMul : 1), b, { kind: 'melee', crit, kb: b.weapon.kb, weaponHit: true })
    } else ctx.swing(b)
  }

  // --- hazards / health ------------------------------------------------------------------------
  function hazards(b, dt, t) {
    b.hurtTick -= dt
    if (b.liquid === 'lava') {
      b.burnT = ARENA.burnTime
      if (b.hurtTick <= 0) {
        b.hurtTick = 0.5
        ctx.damage(b, ARENA.lavaDps * 0.5, null, { kind: 'lava' })
      }
    } else if (b.burnT > 0) {
      b.burnT -= dt
      if (b.liquid === 'water') b.burnT = 0
      if (b.hurtTick <= 0) {
        b.hurtTick = 0.8
        ctx.damage(b, ARENA.burnDps * 0.8 * b.burnMul, null, { kind: 'fire' })
      }
      if (Math.random() < dt * 8) ctx.fx.fireAt?.(b.pos.x, b.pos.y, b.pos.z)
    } else b.burnMul = 1
    if (!b.alive) return
    let heal = 0
    if (b.hp < b.maxHp && b.burnT <= 0 && t - b.lastHurt > ARENA.regenDelay) heal += ARENA.regenRate * dt
    if (b.power?.regen) heal += b.power.regen * dt
    if (b.regen && t < b.regen.until) heal += b.regen.rate * dt
    if (heal) setHp(b, Math.min(b.maxHp, b.hp + heal))
    if (b.pos.y < ARENA.voidY) ctx.died(b, 'void')
  }
  function setHp(b, hp) {
    b.hp = hp
    const v = Math.max(0, Math.ceil(b.hp))
    if (v === b.shownHp) return
    b.shownHp = v
    b.ch.tag?.userData.redraw(tagLines(b.name, v, b.minion ? '#9aff7a' : '#ffffff'))
  }

  // --- drawing -----------------------------------------------------------------------------------
  function pose(b, dt, t) {
    const p = b.pos
    b.invisible = ctx.on(b, 'invis')
    b.holder.visible = !b.invisible || !b.alive
    b.holder.position.set(p.x, p.y, p.z)
    b.holder.rotation.y = b.facing
    b.body?.setNextKinematicTranslation({ x: p.x, y: p.y + 0.9, z: p.z })
    const sp = Math.hypot(b.vel.x, b.vel.z)
    b.speed += (sp - b.speed) * Math.min(1, dt * 10)
    const frozen = ctx.on(b, 'freeze')
    let look = null
    const tg = b.target
    if (tg) {
      const dx = tg.pos.x - p.x
      const dz = tg.pos.z - p.z
      const yaw = angDiff(b.facing, Math.atan2(dx, dz))
      look = { yaw, pitch: -Math.atan2(tg.pos.y + 1.4 - (p.y + EYE), Math.hypot(dx, dz)) }
    }
    if (!frozen) b.ch.animate(dt, b.grounded ? b.speed : 0, look)
    const parts = b.ch.parts
    if (b.drawT !== null && b.alive) {
      // bow drawn: both arms forward along the aim
      const pitch = look ? -look.pitch : 0
      parts.armR.rotation.set(-Math.PI / 2 - pitch, -0.15, 0)
      parts.armL.rotation.set(-Math.PI / 2 - pitch, 0.5 - Math.min(1, b.drawT / b.weapon.draw) * 0.25, 0)
    }
    if (parts.shield) {
      // shield on the left arm, raised in front of the chest when blocking
      if (b.blocking) parts.armL.rotation.set(-1.25, 0.55, 0)
    }
    if (b.minion && !frozen) {
      parts.armR.rotation.x = -1.5 + Math.sin(t * 3 + b.id) * 0.08 // zombie arms
      parts.armL.rotation.x = -1.5 + Math.cos(t * 3 + b.id) * 0.08
    }
    if (!b.grounded && !b.liquid && !frozen) {
      parts.legR.rotation.x *= 0.5
      parts.legL.rotation.x *= 0.5
    }
    // red hurt flash / icy tint while frozen
    const want = b.flash > 0 || !b.alive ? 'hurt' : frozen ? 'ice' : null
    if (want || b.tint) {
      b.flash = Math.max(0, b.flash - dt)
      const k = want === 'hurt' ? (b.alive ? Math.min(1, b.flash / 0.3) : 1) : 1
      for (const m of b.mats) {
        if (want === 'hurt') m.emissive.copy(FLASH).multiplyScalar(k * 0.85)
        else if (want === 'ice') m.emissive.copy(FROZEN)
        else m.emissive.setRGB(0, 0, 0)
      }
      b.tint = want
    }
    // hunter's mark: an arrow overhead, visible through walls
    const marked = b.alive && ctx.on(b, 'mark')
    if (marked && !b.marker) {
      b.marker = markSprite()
      b.marker.position.y = 2.75
      b.holder.add(b.marker)
    }
    if (b.marker) b.marker.visible = marked
  }

  // --- online: the host simulates, everyone else draws its snapshots ----------------------------
  // snapshot flag bits
  const F = { grounded: 1, drawing: 2, blocking: 4, invis: 8, freeze: 16, burning: 32, dying: 64, mark: 128, dropping: 256, protect: 512 }
  let simulating = true
  const r2 = (v) => Math.round(v * 100) / 100
  // [id, kit, ownerKey, x, y, z, facing, hp, maxHp, flags, swings, speed] per bot
  function snapshot(t) {
    return bots.map((b) => {
      let f = 0
      if (b.grounded) f |= F.grounded
      if (b.drawT !== null) f |= F.drawing
      if (b.blocking) f |= F.blocking
      if (ctx.on(b, 'invis')) f |= F.invis
      if (ctx.on(b, 'freeze')) f |= F.freeze
      if (b.burnT > 0) f |= F.burning
      if (!b.alive) f |= F.dying
      if (ctx.on(b, 'mark')) f |= F.mark
      if (b.dropping) f |= F.dropping
      if (b.protectedUntil > t) f |= F.protect
      return [b.id, b.kit?.id ?? '', b.minion ? b.ownerKey || '?' : '', r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.facing), r2(b.hp), b.maxHp, f, b.swings, r2(b.speed)]
    })
  }
  function applySnapshot(list, t) {
    if (simulating || !Array.isArray(list)) return
    const seen = new Set()
    for (const s of list) {
      if (!Array.isArray(s) || s.length < 12) continue
      const [id, kitId, ownerKey, x, y, z, facing, hp, maxHp, f, swings, speed] = s
      if (!Number.isInteger(id)) continue
      seen.add(id)
      let b = bots.find((o) => o.id === id)
      if (!b) {
        // the host's kit (its pick depends on the players' levels there, not on the seed alone)
        b = makeBot(t, 'puppet', ownerKey ? { ownerKey, owner: null, at: { x, y, z }, hp: maxHp, life: 999 } : null, id, null, typeof kitId === 'string' && kitId ? kitId : null)
        b.pos.x = x
        b.pos.y = y
        b.pos.z = z
        b.puppet = true
        bots.push(b)
      }
      b.puppet = true
      b.net = { x, y, z, facing, hp, f, swings, speed }
    }
    // gone from the host (despawned): poof
    for (let i = bots.length - 1; i >= 0; i--) {
      const b = bots[i]
      if (seen.has(b.id) || !b.alive) continue
      ctx.fx.poof(b.pos.x, b.pos.y + 0.6, b.pos.z)
      remove(b)
      bots.splice(i, 1)
    }
  }
  function updatePuppets(dt, t) {
    for (let i = bots.length - 1; i >= 0; i--) {
      const b = bots[i]
      const n = b.net
      if (n) {
        const far = Math.hypot(n.x - b.pos.x, n.y - b.pos.y, n.z - b.pos.z) > 8
        const k = far ? 1 : Math.min(1, dt * 12)
        b.pos.x += (n.x - b.pos.x) * k
        b.pos.y += (n.y - b.pos.y) * k
        b.pos.z += (n.z - b.pos.z) * k
        b.facing += angDiff(b.facing, n.facing) * k
        b.vel.x = (n.x - b.pos.x) * 10
        b.vel.z = (n.z - b.pos.z) * 10
        b.speed = n.speed
        if (b.alive) setHp(b, n.hp)
        b.grounded = !!(n.f & F.grounded)
        b.blocking = !!(n.f & F.blocking)
        b.drawT = n.f & F.drawing ? (b.drawT ?? 0) + dt : null
        b.status.invis = n.f & F.invis ? t + 0.3 : 0
        b.status.freeze = n.f & F.freeze ? t + 0.3 : 0
        b.status.mark = n.f & F.mark ? t + 0.3 : 0
        b.burnT = n.f & F.burning ? 1 : 0
        b.protectedUntil = n.f & F.protect ? t + 0.3 : 0
        b.dropping = !!(n.f & F.dropping)
        if (n.swings !== b.swings) {
          b.swings = n.swings
          b.swingQuiet()
        }
        if (n.f & F.dying && b.alive) {
          b.alive = false
          b.dying = 0
          b.target = null
          b.drawT = null
          if (b.body) {
            physicsWorld.removeRigidBody(b.body)
            b.body = null
          }
        }
        if (b.burnT > 0 && Math.random() < dt * 8) ctx.fx.fireAt?.(b.pos.x, b.pos.y, b.pos.z)
      }
      if (!b.alive) {
        b.dying += dt
        b.ch.root.rotation.z = Math.min(1, b.dying / 0.45) * (Math.PI / 2)
        pose(b, dt, t)
        if (b.dying > 1.2) {
          ctx.fx.poof(b.pos.x, b.pos.y + 0.6, b.pos.z)
          remove(b)
          bots.splice(i, 1)
        }
        continue
      }
      pose(b, dt, t)
    }
  }
  // this client becomes the host: its puppets turn into simulated bots where they stand
  function takeOver(t) {
    for (let i = bots.length - 1; i >= 0; i--) {
      const b = bots[i]
      if (!b.puppet) continue
      b.puppet = false
      b.net = null
      b.vel.x = b.vel.y = b.vel.z = 0
      b.grounded = false
      b.dropping = false
      b.thinkT = 0
      b.peakY = b.pos.y
      b.lastCheck = { x: b.pos.x, z: b.pos.z, t }
      if (b.minion) {
        b.owner = ctx.resolveKey?.(b.ownerKey) ?? null
        b.until = t + 15
        if (!b.owner) {
          remove(b)
          bots.splice(i, 1)
        }
      }
    }
    if (bots.length) started = true
  }

  function remove(b) {
    group.remove(b.holder)
    if (b.body) physicsWorld.removeRigidBody(b.body)
    b.body = null
    b.ch.tag?.material.map?.dispose()
    b.marker?.material.dispose()
    for (const m of b.mats) m.dispose()
  }

  self = {
    bots,
    group,
    // a fighter at a spot (duel practice): faces `facing`, protected for `protect` s
    spawnFighter(t, at, kitId = null, facing = 0, protect = 0) {
      const b = makeBot(t, 'at', null, null, at, kitId)
      b.facing = facing
      b.protectedUntil = t + protect
      bots.push(b)
      started = true
      return b
    },
    // drop every bot of this set right away (no puff)
    clear() {
      for (const b of bots) remove(b)
      bots.length = 0
      respawnAt.length = 0
    },
    snapshot,
    applySnapshot,
    byId: (id) => bots.find((b) => b.id === id) ?? null,
    simulating: () => simulating,
    // a hit landed on this bot (combat.js already applied armor and i-frames)
    hurt(b, amount, kb, t) {
      setHp(b, b.hp - amount)
      b.lastHurt = t
      b.flash = 0.35
      if (kb) {
        b.vel.x += kb.x
        b.vel.z += kb.z
        b.vel.y = Math.max(b.vel.y, kb.y)
        b.grounded = false
      }
      if (b.alive && b.hp < 6 && b.weapon.type !== 'bow' && !b.minion && Math.random() < B.fleeChance) b.fleeUntil = t + rnd(1.5, 3)
    },
    heal(b, n) {
      setHp(b, Math.min(b.maxHp, b.hp + n))
    },
    setHp,
    ignite(b, s, mul = 1) {
      b.burnT = Math.max(b.burnT, s)
      b.burnMul = Math.max(b.burnMul, mul)
    },
    teleport(b, x, y, z) {
      b.pos.x = x
      b.pos.y = y
      b.pos.z = z
      b.vel.x = b.vel.y = b.vel.z = 0
      b.peakY = y
    },
    push(b, vx, vy, vz) {
      b.vel.x += vx
      b.vel.z += vz
      b.vel.y = Math.max(b.vel.y, vy)
      b.grounded = false
    },
    // necromancer: zombies rise around the owner
    spawnMinions(owner, a, t) {
      const n = a.count ?? 2
      for (let i = 0; i < n; i++) {
        const ang = (owner.facing ?? 0) + (i - (n - 1) / 2) * 1.1
        const x = owner.pos.x + Math.sin(ang) * 1.6
        const z = owner.pos.z + Math.cos(ang) * 1.6
        const g = W.groundY(Math.floor(x), Math.floor(z), owner.pos.y + 1.5)
        const at = g !== null && Math.abs(g - owner.pos.y) < 3 && probe(x, g, z) !== BLOCKED ? { x, y: g, z } : { x: owner.pos.x, y: owner.pos.y, z: owner.pos.z }
        const m = makeBot(t, 'minion', { owner, at, hp: a.hp, life: a.life })
        bots.push(m)
        ctx.fx.poof(at.x, at.y, at.z)
      }
      return true
    },
    // dead: tip over and fade, then a puff (combat.js has done the credit)
    kill(b) {
      b.alive = false
      b.dying = 0
      b.target = null
      b.drawT = null
      b.blocking = false
      b.want.x = b.want.z = 0
      if (b.body) {
        physicsWorld.removeRigidBody(b.body)
        b.body = null
      }
    },
    // opts: { simulate (this client runs the bots: offline or the host), target (bots wanted) }
    update(dt, t, active, opts = {}) {
      group.visible = active
      const simulate = opts.simulate ?? true
      const target = opts.target ?? 0 // no fake players: only summons (zombies) live here
      if (simulate && !simulating) takeOver(t)
      simulating = simulate
      if (!simulate) return updatePuppets(dt, t)
      if (!started) {
        started = true
        if (!bots.some((b) => !b.minion)) for (let i = 0; i < target; i++) bots.push(makeBot(t, 'random'))
      }
      // keep the arena at `target` fighters (fewer bots when real players are fighting)
      const fighters = bots.filter((b) => !b.minion && b.alive).length + respawnAt.length
      if (fighters < target) respawnAt.push(t + rnd(B.respawn[0], B.respawn[1]))
      else if (fighters > target && respawnAt.length) respawnAt.pop()
      // replace the dead
      for (let i = respawnAt.length - 1; i >= 0; i--) {
        if (t < respawnAt[i]) continue
        respawnAt.splice(i, 1)
        const nb = makeBot(t, 'drop')
        bots.push(nb)
        ctx.feed(`<span style="color:#ffe04a">${nb.name}</span> dropped into the arena <span style="color:#9aa4b0">(${nb.kit.name})</span>`)
      }
      // fixed substeps keep the voxel collision honest on long frames
      const n = Math.min(4, Math.ceil(dt / (1 / 60)))
      const h = dt / n
      for (let i = bots.length - 1; i >= 0; i--) {
        const b = bots[i]
        // summons crumble when their time is up or their master is gone
        if (b.minion && b.alive && (t > b.until || !b.owner?.alive)) {
          ctx.fx.poof(b.pos.x, b.pos.y + 0.6, b.pos.z)
          b.alive = false
          remove(b)
          bots.splice(i, 1)
          continue
        }
        if (!b.alive) {
          b.dying += dt
          b.ch.root.rotation.z = Math.min(1, b.dying / 0.45) * (Math.PI / 2)
          pose(b, dt, t)
          if (b.dying > 1) {
            ctx.fx.poof(b.pos.x, b.pos.y + 0.6, b.pos.z)
            remove(b)
            bots.splice(i, 1)
          }
          continue
        }
        b.thinkT -= dt
        if (b.thinkT <= 0) {
          b.thinkT = rnd(0.25, 0.4)
          if (!b.dropping) think(b, t)
        }
        if (!b.dropping) decide(b, dt, t)
        for (let k = 0; k < n; k++) physics(b, h, t)
        if (!b.dropping) attack(b, dt, t)
        hazards(b, dt, t)
        // bots never stand inside each other
        for (const o of bots) {
          if (o === b || !o.alive) continue
          const dx = b.pos.x - o.pos.x
          const dz = b.pos.z - o.pos.z
          const d = Math.hypot(dx, dz)
          if (d < 0.7 && d > 0.001 && Math.abs(b.pos.y - o.pos.y) < 1.5) {
            const push = (0.7 - d) * 0.5
            if (probe(b.pos.x + (dx / d) * push, b.pos.y, b.pos.z + (dz / d) * push) !== BLOCKED) {
              b.pos.x += (dx / d) * push
              b.pos.z += (dz / d) * push
            }
          }
        }
        if (b.alive) pose(b, dt, t)
      }
    },
    // dev: drop every bot and start over
    reset(t) {
      for (const b of bots) remove(b)
      bots.length = 0
      respawnAt.length = 0
      started = false
      this.update(0, t, group.visible)
    },
  }
  return self
}
