// Arena combat: the player's weapon (melee with an attack-charge meter, critical hits
// while falling, the bow's hold-to-draw), arrows in flight, damage with armor, shields,
// i-frames and knockback, spawn protection, kit powers (passives, on-hit effects and
// abilities: abilities.js + effects.js), status effects (slow, freeze, root, invisible,
// marked, speed, regeneration), shop items used in the arena, hunger, fall damage, kill
// credit (the last hitter within COMBAT.creditWindow gets the kill, also for void / lava /
// fall deaths; a summon's kills count for its owner), assists, the kill feed, streaks and
// Gold / XP rewards. Bots live in bots.js; main.js owns the player's health and death
// screen and talks to this module through `hooks`.
import { BoxGeometry, BufferAttribute, Color, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Ray, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ARENA, ARENA_EVENTS, COARSE_POINTER as COARSE, COMBAT, FALL, HUNGER, KITS, SHOP_ITEMS, SHOP_USE } from '../config.js'
import { createPickups } from './pickups.js'
import { player, playerEnv } from '../player.js'
import { inputState } from '../input.js'
import { segmentClear } from '../physics.js'
import { Particles, TEX } from '../lobby/fx.js'
import { addGold, addXp, changed, onChange, state } from '../state.js'
import * as sfx from '../audio.js'
import { createArenaBots } from './bots.js'
import { armorCut, weaponFor } from './weapons.js'
import { createEffects, THROWN } from './effects.js'
import { ABILITY_INFO, createAbilities, potionLabel } from './abilities.js'
import { createCombatHud } from '../hud/combatHud.js'
import { DUEL, NET } from '../config.js'
import { net, on as onNet, send, simulatesBots } from '../net.js'

const EYE = 1.62
const MAX_ARROWS = 96
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const BLOCKABLE = new Set(['melee', 'arrow', 'projectile'])
const USABLE = new Set(['apple', 'potion', 'orb', 'steak', 'boost'])
const THROWN_KINDS = new Set(Object.keys(THROWN))

// hooks: { zone(), hurtPlayer(amount, source, kind), healPlayer(n), ignitePlayer(s, mul),
//          knockPlayer(vx, vy, vz), teleportPlayer(x, y, z), playerHp(), setFood(n),
//          levelUp(), isTouch(), playerName(), feed(html), toast(text, kind), viewmodel, touch }
export function createCombat(scene, arena, camera, hooks) {
  const R = COMBAT.rewards
  const hud = createCombatHud()
  let now = 0

  // --- the player as a combat entity --------------------------------------------------------
  const you = {
    isPlayer: true,
    name: 'You',
    get key() {
      return net.sessionId || 'me'
    },
    pos: player.position,
    vel: player.velocity,
    get facing() {
      return player.facing
    },
    get hp() {
      return hooks.playerHp()
    },
    get level() {
      return state.level // bots go easier on rookies (COMBAT.rookie)
    },
    kit: null,
    power: {},
    weapon: null,
    armor: 0,
    alive: false,
    protectedUntil: 0,
    invulnUntil: 0,
    lastHit: null,
    damagers: new Map(),
    status: {},
    kills: 0,
    streak: 0,
    blocking: false,
    invisible: false,
  }
  const life = { kills: 0, gold: 0, xp: 0 }
  let swingCount = 0 // sent in the pose so the others see you swing
  let lockedUntil = 0 // duel countdown: no moving or fighting until then
  const duelHooks = {}
  let snapAcc = 0
  let lastAttackAt = -99 // time of your last hit given / taken (combat tag)
  let lastSwing = -99
  let drawing = false
  let drawT = 0
  let arrowsLeft = 0
  let food = HUNGER.max
  let shieldHits = 0
  let fallPeak = 0
  let wasGrounded = true
  const held = { right: false, ability: false, slot: false }

  const kitOf = () => KITS.find((k) => k.id === state.kit) ?? KITS[0]
  const weapon = () => weaponFor(kitOf())
  // what your hand swings right now: the kit weapon in slot 1, fists otherwise
  function heldWeapon() {
    const w = weapon()
    if (state.selected !== 0) return weaponFor('monk')
    if (w.type === 'bow') return arrowsLeft > 0 ? w : { ...COMBAT.weapons.fist, type: 'fist', item: w.item }
    return w
  }
  const on = (e, key) => now < (e.status?.[key] ?? 0)
  // every combat entity has a key: your sessionId ('me' offline), another player's sessionId,
  // or 'bot:<id>'; summons carry their owner's key (ownerKey), so allies work across clients
  const keyOf = (e) => e?.key ?? (e?.isBot ? `bot:${e.id}` : '')
  const ownerKeyOf = (e) => e?.ownerKey || (e?.owner ? keyOf(e.owner) : '')
  const allies = (a, b) => {
    if (!a || !b) return false
    if (a === b) return true
    const ka = keyOf(a)
    const kb = keyOf(b)
    const oa = ownerKeyOf(a)
    const ob = ownerKeyOf(b)
    return ka === kb || (oa && oa === kb) || (ob && ob === ka) || (oa && oa === ob)
  }
  // simulated on this client (you, or a bot while you run the bots): its effects are real here
  const isLocal = (e) => !!e && (e.isPlayer || (e.isBot && !e.puppet))
  const resolveKey = (k) => {
    if (!k) return null
    if (k === you.key || k === 'me') return you
    if (k.startsWith('bot:')) return bots.byId(Number(k.slice(4))) ?? practice.byId(Number(k.slice(4)))
    return hooks.remote?.get(k) ?? null
  }
  // a stand-in when a sender is not drawn here (yet)
  const stub = (k) => ({ key: k, name: '?', pos: { ...player.position }, vel: { x: 0, y: 0, z: 0 }, power: {}, alive: true, status: {}, facing: 0 })

  // --- particles ------------------------------------------------------------------------------
  const sparks = new Particles(260, { texture: TEX.star(), additive: true, hdr: 2.2 })
  const chips = new Particles(260, { texture: TEX.square(), additive: false })
  const puffs = new Particles(200, { texture: TEX.soft(), additive: false, nearFade: 0.4 })
  scene.add(sparks.points, chips.points, puffs.points)
  const RED = new Color('#c81818')
  const CRIT = new Color('#fff2a0')
  const WHITE = new Color('#f4f4f4')
  const DUST = new Color('#8a6a58')
  const ICE = new Color('#bff0ff')
  const FIRE = new Color('#ff8a2a')
  const rr = Math.random
  const fx = {
    hit(x, y, z, crit) {
      for (let i = 0; i < 8; i++) chips.emit({ x: x + (rr() - 0.5) * 0.4, y: y + (rr() - 0.5) * 0.5, z: z + (rr() - 0.5) * 0.4, vx: (rr() - 0.5) * 3, vy: 1 + rr() * 2.5, vz: (rr() - 0.5) * 3, gravity: -14, life: 0.45 + rr() * 0.25, size: 0.06, color: RED, fadeIn: 0.01 })
      if (crit)
        for (let i = 0; i < 16; i++) {
          const a = rr() * Math.PI * 2
          sparks.emit({ x, y: y + (rr() - 0.3) * 0.6, z, vx: Math.cos(a) * (1.5 + rr() * 2), vy: 1 + rr() * 2.5, vz: Math.sin(a) * (1.5 + rr() * 2), gravity: -8, drag: 1.5, life: 0.6 + rr() * 0.3, size: 0.22, sizeEnd: 0.03, color: CRIT, twinkle: 12 })
        }
    },
    block(x, y, z) {
      for (let i = 0; i < 10; i++) sparks.emit({ x, y, z, vx: (rr() - 0.5) * 4, vy: rr() * 3, vz: (rr() - 0.5) * 4, gravity: -10, life: 0.35, size: 0.14, sizeEnd: 0.02, color: WHITE, twinkle: 0 })
    },
    ice(x, y, z) {
      for (let i = 0; i < 14; i++) sparks.emit({ x: x + (rr() - 0.5) * 0.8, y: y + rr() * 1.8, z: z + (rr() - 0.5) * 0.8, vy: 0.3, life: 0.8, size: 0.2, sizeEnd: 0.03, color: ICE, twinkle: 8 })
    },
    poof(x, y, z) {
      for (let i = 0; i < 16; i++) puffs.emit({ x: x + (rr() - 0.5) * 0.8, y: y + rr() * 1.2, z: z + (rr() - 0.5) * 0.8, vx: (rr() - 0.5) * 1.4, vy: 0.4 + rr() * 1.2, vz: (rr() - 0.5) * 1.4, drag: 1.4, life: 0.9 + rr() * 0.5, size: 0.35, sizeEnd: 0.9, color: WHITE, alpha: 0.85, fadeIn: 0.02 })
    },
    landing(x, y, z) {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2
        puffs.emit({ x: x + Math.cos(a) * 0.3, y: y + 0.12, z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * 3.5, vz: Math.sin(a) * 3.5, vy: 0.3, drag: 2.6, life: 1.1, size: 0.4, sizeEnd: 1.2, color: DUST, alpha: 0.45, fadeIn: 0.02 })
      }
      soundAt(x, y, z, (k) => sfx.land('stone', 0.6 * k))
    },
    rebirth(x, y, z) {
      for (let i = 0; i < 40; i++) {
        const a = rr() * Math.PI * 2
        sparks.emit({ x, y: y + 0.4 + rr() * 1.4, z, vx: Math.cos(a) * (2 + rr() * 4), vy: 1 + rr() * 4, vz: Math.sin(a) * (2 + rr() * 4), drag: 1.6, life: 0.8 + rr() * 0.5, size: 0.3, sizeEnd: 0.04, color: rr() < 0.5 ? FIRE : CRIT, twinkle: 6 })
      }
    },
  }
  // plays a one-shot scaled by distance from the player (silent past ~32 m)
  function soundAt(x, y, z, play) {
    const d = Math.hypot(x - player.position.x, y - player.position.y, z - player.position.z)
    const k = Math.max(0, 1 - d / 32)
    if (k > 0.03) play(k)
  }

  // --- arrows -----------------------------------------------------------------------------------
  const arrowGeo = (() => {
    const part = (w, h, d, x, y, z, hex) => {
      const g = new BoxGeometry(w, h, d).translate(x, y, z)
      const c = new Color(hex)
      const n = g.attributes.position.count
      const col = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
      g.setAttribute('color', new BufferAttribute(col, 3))
      return g
    }
    return mergeGeometries([
      part(0.035, 0.035, 0.62, 0, 0, 0, '#8a6a42'),
      part(0.08, 0.08, 0.1, 0, 0, 0.34, '#b8bcc4'),
      part(0.16, 0.008, 0.16, 0, 0, -0.24, '#f2f2f2'),
      part(0.008, 0.16, 0.16, 0, 0, -0.24, '#e04a3a'),
    ])
  })()
  const arrowMesh = new InstancedMesh(arrowGeo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), MAX_ARROWS)
  arrowMesh.count = 0
  arrowMesh.frustumCulled = false
  arrowMesh.castShadow = false
  scene.add(arrowMesh)
  const arrows = []
  const FWD = new Vector3(0, 0, 1)
  const tmpV = new Vector3()
  const tmpQ = new Quaternion()
  const tmpM = new Matrix4()
  const ONE = new Vector3(1, 1, 1)
  const segRay = new Ray()
  const hitPt = new Vector3()
  const box = { min: new Vector3(), max: new Vector3() }
  function entityBox(e, pad) {
    box.min.set(e.pos.x - 0.33 - pad, e.pos.y - pad * 0.5, e.pos.z - 0.33 - pad)
    box.max.set(e.pos.x + 0.33 + pad, e.pos.y + 1.85 + pad * 0.5, e.pos.z + 0.33 + pad)
    return box
  }

  // weapon: bow stats; kit = true when it is the shooter's kit bow (on-hit powers apply)
  function shoot(source, from, dir, charge, w, kit = false, ghost = false, speedOverride = 0) {
    if (arrows.length >= MAX_ARROWS) arrows.shift()
    const mul = kit ? source.power?.bowSpeed ?? 1 : 1
    const speed = speedOverride || (w.speed + (w.speedMax - w.speed) * charge) * mul
    const q = new Quaternion().setFromUnitVectors(FWD, tmpV.set(dir.x, dir.y, dir.z).normalize())
    arrows.push({ x: from.x, y: from.y, z: from.z, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, owner: source, charge, w, kit, pierce: kit && !!source.power?.pierce, stuck: false, life: 0, crit: charge >= 1 && Math.random() < 0.3, q, ghost })
    soundAt(from.x, from.y, from.z, (k) => sfx.bowShoot(charge, k))
    // the others see the arrow fly (it hurts nobody on their side: hits are relayed from here)
    if (!ghost && isLocal(source)) emit({ t: 'arrow', owner: keyOf(source), from: r3(from), dir: r3(dir), speed: Math.round(speed * 10) / 10, g: w.gravity })
  }
  const r3 = (v) => ({ x: Math.round(v.x * 100) / 100, y: Math.round(v.y * 100) / 100, z: Math.round(v.z * 100) / 100 })
  const emit = (msg) => send('fx', msg)
  function updateArrows(dt) {
    const W = world
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i]
      a.life += dt
      if (a.stuck) {
        if (a.life > 8) arrows.splice(i, 1)
        continue
      }
      a.vy += a.w.gravity * dt
      const len = Math.hypot(a.vx, a.vy, a.vz) * dt
      const steps = Math.max(1, Math.ceil(len / 0.3))
      let done = false
      for (let s = 0; s < steps && !done; s++) {
        const nx = a.x + (a.vx * dt) / steps
        const ny = a.y + (a.vy * dt) / steps
        const nz = a.z + (a.vz * dt) / steps
        segRay.origin.set(a.x, a.y, a.z)
        segRay.direction.set(nx - a.x, ny - a.y, nz - a.z)
        const segLen = segRay.direction.length()
        segRay.direction.normalize()
        let best = null
        let bestD = segLen
        for (const e of entities()) {
          if (!e.alive || allies(e, a.owner)) continue
          if (a.ghost && e.isRemote) continue // a ghost arrow stops on you or on bots only, like theirs
          if (segRay.intersectBox(entityBox(e, 0.05), hitPt)) {
            const d = hitPt.distanceTo(segRay.origin)
            if (d <= bestD) {
              bestD = d
              best = e
            }
          }
        }
        if (best) {
          const dmg = (a.w.dmg + (a.w.dmgMax - a.w.dmg) * a.charge) * (a.crit ? COMBAT.critMul : 1)
          const sp = Math.hypot(a.vx, a.vz) || 1
          if (!a.ghost) damage(best, dmg, a.owner, { kind: 'arrow', crit: a.crit, dir: { x: a.vx / sp, z: a.vz / sp }, weaponHit: a.kit, pierce: a.pierce })
          arrows.splice(i, 1)
          done = true
          break
        }
        const info = W.info(Math.floor(nx), Math.floor(ny), Math.floor(nz))
        if (info && info.solid) {
          a.stuck = true
          a.life = 0
          soundAt(nx, ny, nz, (k) => sfx.arrowHit(k))
          done = true
          break
        }
        a.x = nx
        a.y = ny
        a.z = nz
      }
      if (!done && a.y < ARENA.voidY) arrows.splice(i, 1)
    }
    arrowMesh.count = arrows.length
    for (let i = 0; i < arrows.length; i++) {
      const a = arrows[i]
      if (!a.stuck) a.q.setFromUnitVectors(FWD, tmpV.set(a.vx, a.vy, a.vz).normalize())
      tmpM.compose(tmpV.set(a.x, a.y, a.z), a.q, ONE)
      arrowMesh.setMatrixAt(i, tmpM)
    }
    arrowMesh.instanceMatrix.needsUpdate = true
  }

  // --- status effects / healing / movement helpers (shared by bots, effects, abilities) --------
  // an effect on someone simulated elsewhere: their client applies it (KitRoom `act`)
  function forwardAct(e, act) {
    if (e.isRemote) send('act', { to: e.sessionId, ...act })
    else if (e.isBot && e.puppet) send('act', { bot: e.id, ...act })
    else return false
    return true
  }
  function status(e, key, s) {
    if (forwardAct(e, { type: 'status', key, s })) return
    e.status ||= {}
    e.status[key] = Math.max(e.status[key] ?? 0, now + s)
    if (key === 'freeze') fx.ice(e.pos.x, e.pos.y, e.pos.z)
    if (key === 'freeze' || key === 'root') e.drawT = null
  }
  function heal(e, n) {
    if (!e.alive || n <= 0 || e.isRemote || e.puppet) return // heals stay with their own client
    if (e.isPlayer) hooks.healPlayer(n)
    else mgr(e).heal(e, n)
  }
  // heal `amount` over `over` seconds (golden apples)
  function regen(e, amount, over) {
    e.regen = { rate: amount / over, until: now + over }
    effects.fx.heal(e.pos.x, e.pos.y, e.pos.z)
    soundAt(e.pos.x, e.pos.y, e.pos.z, (k) => sfx.eat(k))
  }
  function ignite(e, s, mul = 1) {
    if (!e.alive || forwardAct(e, { type: 'ignite', s, mul })) return
    if (e.isPlayer) hooks.ignitePlayer(s, mul)
    else mgr(e).ignite(e, s, mul)
  }
  function teleport(e, x, y, z) {
    if (forwardAct(e, { type: 'teleport', x, y, z })) return
    if (e.isPlayer) hooks.teleportPlayer(x, y, z)
    else mgr(e).teleport(e, x, y, z)
  }
  function push(e, vx, vy, vz) {
    if (forwardAct(e, { type: 'push', x: vx, y: vy, z: vz })) return
    if (e.isPlayer) hooks.knockPlayer(vx, vy, vz)
    else mgr(e).push(e, vx, vy, vz)
  }
  const fwdOf = (e) => ({ x: Math.sin(e.facing ?? 0), z: Math.cos(e.facing ?? 0) })
  // is the hit coming from in front of the target (within its shield arc)?
  function fromFront(target, source, opts, arc) {
    const f = fwdOf(target)
    let dx
    let dz
    if (opts.dir) {
      dx = -opts.dir.x
      dz = -opts.dir.z
    } else {
      dx = source.pos.x - target.pos.x
      dz = source.pos.z - target.pos.z
    }
    const d = Math.hypot(dx, dz) || 1
    return (f.x * dx + f.z * dz) / d > arc
  }
  const fallHeight = (e) => (e.isPlayer ? Math.max(0, fallPeak - player.position.y) : Math.max(0, (e.peakY ?? e.pos.y) - e.pos.y))

  // --- effects + abilities ----------------------------------------------------------------------
  // block lookups for arrows and effects: the arena, or the duel platforms far out along +x
  const world = (() => {
    const a = arena.world
    const d = hooks.duelWorld?.world
    const pick = (x) => (d && x > DUEL.minX ? d : a)
    return {
      info: (x, y, z) => pick(x).info(x, y, z),
      id: (x, y, z) => pick(x).id(x, y, z),
      solid: (x, y, z) => pick(x).solid(x, y, z),
      name: (x, y, z) => pick(x).name(x, y, z),
      groundY: (x, z, fromY) => pick(x).groundY(x, z, fromY),
      set: (x, y, z, n, m) => pick(x).set(x, y, z, n, m),
    }
  })()
  const effects = createEffects(scene, arena, camera, {
    world,
    now: () => now,
    entities: () => entities(),
    allies,
    damage: (...a) => damage(...a),
    heal,
    ignite,
    status,
    teleport,
    push,
    soundAt,
    shoot: (src, from, dir, charge, w) => shoot(src, from, dir, charge, w, false),
    fx,
    local: isLocal,
    key: keyOf,
    emit,
  })
  const abilities = createAbilities(effects, {
    regen,
    // zombies are bots: whoever runs the bots raises them (the host, for a non-host player)
    spawnMinions: (owner, a) => {
      if (inDuel()) return practice.spawnMinions(owner, a, now) // practice: next to you up here
      if (bots.simulating()) return bots.spawnMinions(owner, a, now)
      send('summon', { a: { count: a.count, hp: a.hp, life: a.life } })
      return true
    },
  })

  // --- bots ---------------------------------------------------------------------------------------
  const botCtx = {
    // highest kit level a new bot may carry: near the lowest level among the players fighting here
    kitCap: () => {
      let lv = state.level
      for (const r of hooks.remote?.entities() ?? []) if (r.level > 0) lv = Math.min(lv, r.level)
      return Math.min(COMBAT.bots.maxKitLevel, lv + COMBAT.bots.kitLevelAhead)
    },
    damage: (...a) => damage(...a),
    shoot: (src, from, dir, charge, w) => shoot(src, from, dir, charge, w, true),
    died: (b, cause) => died(b, cause),
    feed: (html) => !inDuel() && hooks.feed(html), // the arena's news waits while you duel
    swing: (b) => soundAt(b.pos.x, b.pos.y, b.pos.z, (k) => sfx.swing(k)),
    entities: () => entities(),
    allies,
    resolveKey,
    onSpawn: (b) => abilities.reset(b),
    botAbility: (b, tg, d, los, t) => abilities.botUse(b, tg, d, los, t),
    moveMul: (b) => moveMul(b),
    on: (e, key) => on(e, key),
    fx: { ...fx, fireAt: (x, y, z) => effects.fx.fire(x, y, z, 1) },
  }
  const bots = createArenaBots(scene, arena, botCtx)
  // duel practice: its own bot set on the duel platforms, simulated here only
  const practice = hooks.duelWorld ? createArenaBots(scene, hooks.duelWorld, botCtx, { seedStart: 50000 }) : { bots: [], byId: () => null, update() {}, clear() {}, spawnMinions: () => false }
  const mgr = (b) => b.mgr ?? bots
  const inDuel = () => hooks.zone() === 'duel'
  const list = []
  function entities() {
    list.length = 0
    list.push(you)
    // in a duel only the duel is there: your opponent (a player or the practice bot)
    for (const b of inDuel() ? practice.bots : bots.bots) list.push(b)
    const others = hooks.remote?.entities()
    if (others) for (const r of others) list.push(r)
    return list
  }
  // speed factor from statuses, the kit and the shield (0 = cannot move)
  function moveMul(e) {
    if (on(e, 'freeze') || on(e, 'root') || (e.isPlayer && now < lockedUntil)) return 0
    let k = e.power?.speed ?? 1
    if (on(e, 'slow')) k *= 0.6
    if (on(e, 'speed')) k *= 1.3
    if (e.blocking) k *= 0.4
    return k
  }

  // --- damage / death -------------------------------------------------------------------------------
  // opts: kind, crit, kb (weapon), kbScale, upScale, sprint, dir {x,z} (push direction),
  //       from {x,z} (push away from a point), noKb, noFlinch (damage over time: no i-frames),
  //       ignoreIframes, ignoreShield, pierce, weaponHit (the kit weapon: on-hit powers apply)
  function damage(target, amount, source, opts = {}) {
    if (!target.alive) return false
    // simulated on another client (a player, or a bot while someone else runs the bots): relay
    // the raw hit; that client applies armor, shields and kit powers itself (KitRoom `hit`)
    if (target.isRemote || (target.isBot && target.puppet)) {
      if (!source || allies(target, source) || target.protectedUntil > now) return false
      if (target.isRemote) send('hit', { to: target.sessionId, amount, opts: netOpts(opts), ...(source.isBot && !source.puppet ? { bot: source.id } : {}) })
      else send('botHit', { bot: target.id, amount, opts: netOpts(opts) })
      if (source.protectedUntil > now) source.protectedUntil = 0
      if (source.isPlayer || source.owner === you) {
        // the other client applies it; pay on our estimate (armor + damage taken, capped at its hp)
        payDamage(target, Math.min(amount * (1 - armorCut(target.armor ?? 0)) * (target.power?.dmgTaken ?? 1), Math.max(0, target.hp)))
        hud.hitMarker(opts.crit)
        lastAttackAt = now
        if (!opts.noFlinch) {
          fx.hit(target.pos.x, target.pos.y + 1.15, target.pos.z, opts.crit)
          soundAt(target.pos.x, target.pos.y, target.pos.z, (k) => sfx.hit(opts.crit, k))
        }
      }
      return true
    }
    const env = !source
    const kind = opts.kind ?? 'melee'
    if (!env) {
      if (allies(target, source)) return false
      if (!opts.ignoreIframes && !opts.noFlinch && now < target.invulnUntil) return false
      if (target.protectedUntil > now) return false
      if (source.protectedUntil > now) source.protectedUntil = 0 // attacking ends your spawn protection
    }
    const sp = (!env && source.power) || {}
    const melee = kind === 'melee'
    // shields: hits from the front are stopped (a viking axe breaks them instead)
    if (!env && target.blocking && !opts.ignoreShield && BLOCKABLE.has(kind) && !opts.pierce && fromFront(target, source, opts, target.power?.tower ? -0.15 : 0.15)) {
      if (melee && opts.weaponHit && sp.onHit?.breakShield) {
        target.status.shieldBroken = now + sp.onHit.breakShield
        target.blocking = false
        soundAt(target.pos.x, target.pos.y, target.pos.z, (k) => sfx.shieldBreak(k))
        if (target.isPlayer) hooks.toast('Your shield was broken!', 'bad')
      } else {
        fx.block(target.pos.x, target.pos.y + 1.2, target.pos.z)
        soundAt(target.pos.x, target.pos.y, target.pos.z, (k) => sfx.block(k))
        target.invulnUntil = now + 0.25
        if (melee) push(target, ...kbFrom(target, source, opts, 0.25))
        if (target.isPlayer) {
          lastAttackAt = now
          wearShopShield()
        }
        if (source.isPlayer) hud.hitMarker(false, true)
        return false
      }
    }
    let n = amount
    let crit = opts.crit
    if (!env) {
      if (sp.dmg) n *= sp.dmg
      if (melee && sp.lowHpDmg) n *= 1 + sp.lowHpDmg * (1 - clamp01((source.hp ?? 20) / ARENA.maxHp))
      if (sp.killStack && source.stacks) n *= 1 + sp.killStack * source.stacks
      if (melee && sp.backstab && !fromFront(target, source, opts, -0.35)) {
        n *= sp.backstab
        crit = true
      }
      if (melee && sp.fallDmg) n += sp.fallDmg * fallHeight(source)
      n *= 1 - armorCut(target.armor)
    }
    if (target.power?.dmgTaken) n *= target.power.dmgTaken
    // rookies take less from bots (arrows, abilities and zombies too)
    if (target.isPlayer && !env && source.isBot && state.level < COMBAT.rookie.level) n *= COMBAT.rookie.botDmg
    // Gold for damage you (or your summons) deal, before hurt() lowers the target's hp
    if (!env && !target.isPlayer && (source.isPlayer || source.owner === you)) payDamage(target, Math.min(n, Math.max(0, target.hp)))
    let kb = null
    if (!env) {
      if (!opts.noFlinch) target.invulnUntil = now + COMBAT.iframes
      const credit = source.owner ?? (source.ownerKey ? resolveKey(source.ownerKey) : null) ?? source // a summon's hits count for its owner
      target.lastHit = { by: credit, t: now }
      ;(target.damagers ||= new Map()).set(credit, now)
      if (!opts.noKb) {
        const [x, y, z] = kbFrom(target, source, opts, 1)
        kb = { x, y, z }
      }
      if (!opts.noFlinch) {
        fx.hit(target.pos.x, target.pos.y + 1.15, target.pos.z, crit)
        if (!target.isPlayer) soundAt(target.pos.x, target.pos.y, target.pos.z, (k2) => sfx.hit(crit, k2))
      }
      if (source.isPlayer || source.owner === you) hud.hitMarker(crit)
      if (source.isPlayer || target.isPlayer || source.owner === you) lastAttackAt = now
    }
    if (target.isPlayer) {
      if (kb) hooks.knockPlayer(kb.x, kb.y, kb.z)
      hooks.hurtPlayer(n, source, kind, crit)
    } else {
      mgr(target).hurt(target, n, kb, now)
      if (target.hp <= 0) {
        if (target.power?.revive && !target.revived) rebirth(target)
        else died(target, kind)
      }
    }
    if (!env && opts.weaponHit && target.alive) onHit(source, target, n)
    // ghost: vanish for a few seconds after being hurt
    const gh = target.power?.ghost
    if (gh && target.alive && now >= (target.ghostReady ?? 0) && n > 0) {
      target.ghostReady = now + gh.cooldown
      status(target, 'invis', gh.invis)
      effects.fx.portal(target.pos.x, target.pos.y, target.pos.z)
      if (target.isPlayer) hooks.toast(`You turned invisible for ${gh.invis}s!`, 'good')
    }
    return true
  }
  // the parts of damage() opts that travel (bounded again by the server, kitRelay.ts)
  function netOpts(o) {
    const out = { kind: o.kind ?? 'melee' }
    for (const k of ['crit', 'sprint', 'noKb', 'noFlinch', 'ignoreIframes', 'ignoreShield', 'pierce', 'weaponHit']) if (o[k]) out[k] = true
    for (const k of ['kb', 'kbScale', 'upScale']) if (typeof o[k] === 'number') out[k] = Math.round(o[k] * 100) / 100
    if (o.dir) out.dir = { x: Math.round(o.dir.x * 1000) / 1000, z: Math.round(o.dir.z * 1000) / 1000 }
    if (o.from) out.from = { x: Math.round(o.from.x * 100) / 100, z: Math.round(o.from.z * 100) / 100 }
    return out
  }
  function kbFrom(target, source, opts, scale) {
    let dx
    let dz
    if (opts.dir) {
      dx = opts.dir.x
      dz = opts.dir.z
    } else {
      const o = opts.from ?? source.pos
      dx = target.pos.x - o.x
      dz = target.pos.z - o.z
      const d = Math.hypot(dx, dz) || 1
      dx /= d
      dz /= d
    }
    const arrow = opts.kind === 'arrow'
    const resist = 1 - (target.power?.kbResist ?? 0)
    const k = COMBAT.knockback * (opts.kb ?? 1) * (opts.kbScale ?? 1) * (opts.sprint ? COMBAT.sprintKnock : 1) * (arrow ? COMBAT.arrowKnock : 1) * resist * scale
    const up = COMBAT.knockUp * (arrow ? 0.6 : 1) * (opts.upScale ?? 1) * Math.min(1, 0.5 + (opts.kb ?? 1) * 0.5) * (1 - (target.power?.kbResist ?? 0) * 0.5) * Math.min(1, scale * 2)
    return [dx * k, up, dz * k]
  }

  // the kit weapon landed: its on-hit powers
  function onHit(source, target, n) {
    const p = source.power ?? {}
    const oh = p.onHit
    if (p.lifesteal) heal(source, n * p.lifesteal)
    if (p.punchHeal) heal(source, p.punchHeal)
    if (!oh) return
    if (oh.ignite) ignite(target, oh.ignite)
    if (oh.freeze) status(target, 'freeze', oh.freeze)
    if (oh.slow) status(target, 'slow', oh.slow)
    if (oh.mark) {
      status(target, 'mark', oh.mark)
      if (target.isPlayer) hooks.toast('You have been marked!', 'bad')
    }
    if (oh.lightning) {
      if (source.hitChain?.target === target) source.hitChain.n++
      else source.hitChain = { target, n: 1 }
      if (source.hitChain.n >= oh.lightning) {
        source.hitChain = null
        effects.lightning(target, source, 5)
      }
    }
    if (oh.swap && now >= (source.swapReady ?? 0)) {
      source.swapReady = now + oh.swap
      const a = { ...source.pos }
      const b = { ...target.pos }
      effects.fx.portal(a.x, a.y, a.z)
      effects.fx.portal(b.x, b.y, b.z)
      teleport(source, b.x, b.y, b.z)
      teleport(target, a.x, a.y, a.z)
      soundAt(a.x, a.y, a.z, (k) => sfx.warp(k))
    }
  }

  // phoenix: back from the ashes once per life
  function rebirth(e) {
    e.revived = true
    const hp = e.power.revive ?? 10
    if (e.isBot) mgr(e).setHp(e, hp)
    e.invulnUntil = now + 1
    e.burnT = 0
    fx.rebirth(e.pos.x, e.pos.y, e.pos.z)
    emit({ t: 'rebirth', at: r3(e.pos) })
    soundAt(e.pos.x, e.pos.y, e.pos.z, (k) => sfx.fireWhoosh(k * 1.3))
    for (const o of entities()) {
      if (!o.alive || allies(o, e)) continue
      if (Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) > 4) continue
      damage(o, 3, e, { kind: 'fire', from: e.pos, kbScale: 1.4, ignoreShield: true })
      ignite(o, 3)
    }
    hooks.feed(`${nameHtml(e)} <span style="color:#ffb31a">rose from the ashes!</span>`)
    return hp
  }

  const nameHtml = (e) => `<span style="color:${e.isPlayer ? '#ffe04a' : '#ffffff'}">${esc(e.name)}</span>`
  const VERBS = {
    void: ['knocked into the void by', 'fell into the void'],
    lava: ['tried to swim in lava to escape', 'tried to swim in lava'],
    fire: ['burned to death while fighting', 'burned to death'],
    fall: ['was knocked off a ledge by', 'fell from a high place'],
    arrow: ['shot by', 'was shot'],
    explosion: ['blown up by', 'blew up'],
    poison: ['poisoned by', 'was poisoned'],
    lightning: ['struck by lightning from', 'was struck by lightning'],
    magic: ['killed by magic from', 'was killed by magic'],
    sting: ['stung to death by', 'was stung to death'],
    projectile: ['hit by', 'died'],
    melee: ['slain by', 'died'],
  }
  const WITH_WAS = new Set(['void', 'arrow', 'explosion', 'poison', 'lightning', 'magic', 'sting', 'projectile', 'melee'])
  function deathLine(v, killer, cause) {
    const [by, alone] = VERBS[cause] ?? VERBS.melee
    const was = v.isPlayer && v.name === 'You' ? 'were' : 'was'
    const red = (s) => `<span style="color:#ff8a7a">${s}</span>`
    if (killer) return `${nameHtml(v)} ${red(`${WITH_WAS.has(cause) ? `${was} ` : ''}${by}`)} ${nameHtml(killer)}`
    return `${nameHtml(v)} ${red(alone.replace(/^was /, `${was} `))}`
  }
  // the death screen's headline when you die
  function deathTitle(killer, cause) {
    const k = killer?.name
    if (!k) return null
    const T = {
      void: `${k} knocked you into the void!`,
      lava: `${k} pushed you into the lava!`,
      fire: `You burned while fighting ${k}!`,
      fall: `${k} knocked you off a ledge!`,
      arrow: `You were shot by ${k}!`,
      explosion: `${k} blew you up!`,
      poison: `${k} poisoned you!`,
      lightning: `${k} struck you with lightning!`,
      magic: `${k} killed you with magic!`,
      sting: `${k}'s bees stung you to death!`,
      projectile: `${k} took you down from afar!`,
    }
    return T[cause] ?? `You were slain by ${k}!`
  }

  // Someone died: credit the last hitter, pay out, announce. Returns the killer (or null).
  function died(v, cause) {
    if (!v.alive) return null
    const hit = v.lastHit
    const killer = hit && now - hit.t < COMBAT.creditWindow && hit.by !== v ? hit.by : null
    if (v.isBot) mgr(v).kill(v)
    v.alive = false
    effects.forget(v)
    if (v.minion) return null // summons die quietly and pay nothing
    // duels (practice bot / you in a duel): the duel keeps the score; no kill rewards or feed
    if (v.mgr === practice) {
      duelHooks.botDied?.(v, killer, cause)
      return killer
    }
    if (v.isPlayer && inDuel()) return killer
    if (!inDuel()) hooks.feed(deathLine(v, killer, cause))
    const endedStreak = v.streak
    v.streak = 0
    // everyone else's kill feed; a remote killer is rewarded by the server's `kill`
    const report = { by: killer ? keyOf(killer) : '', byName: killer?.name ?? '', cause, streak: endedStreak }
    if (v.isPlayer) send('died', report)
    else if (v.isBot && !v.puppet) send('botDied', { name: v.name, id: v.id, ...report })
    if (killer) {
      killer.kills++
      killer.streak++
      const kp = killer.power ?? {}
      if (kp.killHeal && killer.alive) heal(killer, kp.killHeal)
      if (kp.killStack) killer.stacks = Math.min(kp.maxStacks ?? 5, (killer.stacks ?? 0) + 1)
      if (killer.isPlayer) rewardKill(v, endedStreak)
      else if (killer.streak === 5 || killer.streak === 10 || killer.streak === 15) hooks.feed(`<span style="color:#ffb31a">[STREAK]</span> ${nameHtml(killer)} <span style="color:#ffb31a">is on a ${killer.streak} kill streak!</span>`)
    }
    // assists: you hurt them recently but someone else finished them
    if (!v.isPlayer && killer !== you && v.damagers?.has(you) && now - v.damagers.get(you) < COMBAT.assistWindow) {
      addGold(R.assistGold)
      const ups = addXp(R.assistXp)
      life.gold += R.assistGold
      hud.killBanner('ASSIST', v.name, `+${R.assistGold} Gold  +${R.assistXp} XP`)
      sfx.coins(2)
      if (ups) hooks.levelUp()
    }
    v.damagers?.clear()
    v.lastHit = null
    return killer
  }

  // Killing the same player again straight away (nobody else in between) pays half.
  let lastVictim = ''
  function rewardKill(v, endedStreak) {
    life.kills++
    state.kills++
    state.killstreak++
    const who = v.isBot ? '' : String(v.name ?? '')
    const repeat = who !== '' && who === lastVictim
    lastVictim = who
    let gold = R.killGold + (you.power.killGold ?? 0)
    let xp = R.killXp
    if ((state.boostKills ?? 0) > 0) {
      xp *= 2
      state.boostKills--
    }
    if (repeat) {
      gold = Math.round(gold * R.repeatMul)
      xp = Math.round(xp * R.repeatMul)
    }
    const bonus = R.streaks[state.killstreak]
    if (bonus) {
      gold += bonus
      hooks.feed(`<span style="color:#ffb31a">[STREAK]</span> ${nameHtml(you)} <span style="color:#ffb31a">${you.name === 'You' ? 'are' : 'is'} on a ${state.killstreak} kill streak! +${bonus} Gold</span>`)
      sfx.streak()
    }
    if (endedStreak >= R.shutdownAt) {
      gold += R.shutdownGold
      hooks.feed(`<span style="color:#ffb31a">[SHUTDOWN]</span> ${nameHtml(you)} <span style="color:#ffb31a">ended ${esc(v.name)}'s ${endedStreak} kill streak! +${R.shutdownGold} Gold</span>`)
    }
    life.gold += gold
    life.xp += xp
    addGold(gold)
    const ups = addXp(xp)
    sfx.killDing()
    sfx.coins(4)
    hud.killBanner('KILL', v.name, `+${gold} Gold  +${xp} XP${repeat ? '  (repeat kill: half)' : ''}`, state.killstreak)
    if (ups) hooks.levelUp()
  }

  // --- plaza power-ups + arena event text (pickups.js) ---------------------------------------------
  const PU = ARENA_EVENTS.powerups.kinds
  const pickups = createPickups(scene, arena.anchors?.glowTiles ?? [], {
    feed: (html) => hooks.feed(html),
    toast: (text, kind) => hooks.toast(text, kind),
    collect(kind) {
      const k = PU[kind]
      if (kind === 'speed') status(you, 'speed', k.s)
      else if (kind === 'heal') heal(you, k.hp)
      else if (kind === 'regen') regen(you, k.hp, k.s)
      sfx.coins(2)
      hooks.toast(`${k.label}!`, 'good')
    },
  })

  // --- Gold for damage dealt (R.dmgGold per hp) ----------------------------------------------------
  // A life without a kill still earns a little. Each target pays for at most one health bar
  // (ARENA.maxHp) per R.dmgGoldWindow s, so hitting a regenerating friend is no Gold farm. Not in duels
  // (they pay their own rewards; practice pays no Gold at all).
  const dmgPaid = new Map() // target key -> { hp, until }
  let dmgBank = 0 // fractional Gold not paid yet
  function payDamage(target, hp) {
    if (!(hp > 0) || inDuel()) return
    const k = keyOf(target)
    if (!k) return
    let p = dmgPaid.get(k)
    if (!p || now > p.until) {
      if (dmgPaid.size > 64) for (const [key, v] of dmgPaid) if (now > v.until) dmgPaid.delete(key)
      dmgPaid.set(k, (p = { hp: 0, until: now + R.dmgGoldWindow }))
    }
    const pay = Math.min(hp, ARENA.maxHp - p.hp)
    if (pay <= 0) return
    p.hp += pay
    dmgBank += pay * R.dmgGold
    const g = Math.floor(dmgBank)
    if (!g) return
    dmgBank -= g
    life.gold += g
    addGold(g)
  }

  // --- the player's attacks ------------------------------------------------------------------------
  const ray = new Ray()
  const eye = new Vector3()
  const camPos = new Vector3()
  const toT = new Vector3()
  function pickTarget(reach) {
    camera.getWorldPosition(ray.origin)
    camera.getWorldDirection(ray.direction)
    eye.set(player.position.x, player.position.y + EYE, player.position.z)
    const touch = hooks.isTouch()
    let best = null
    let bestD = Infinity
    const targets = entities() // bots and other players (not you: allies)
    for (const b of targets) {
      if (!b.alive || allies(b, you)) continue
      if (!ray.intersectBox(entityBox(b, touch ? 0.22 : 0.08), hitPt)) continue
      const de = hitPt.distanceTo(eye)
      const dr = hitPt.distanceTo(ray.origin)
      if (de > reach || dr >= bestD) continue
      if (segmentClear(eye.x, eye.y, eye.z, hitPt.x, hitPt.y, hitPt.z) < 0.97) continue
      best = b
      bestD = dr
    }
    if (best || !touch) return best
    // touch aim assist: the enemy closest to the crosshair inside a small cone
    let bestA = (COMBAT.touchAssistDeg * Math.PI) / 180
    for (const b of targets) {
      if (!b.alive || allies(b, you) || b.invisible) continue
      toT.set(b.pos.x, b.pos.y + 1.1, b.pos.z)
      if (toT.distanceTo(eye) > reach + 0.4) continue
      const a = toT.clone().sub(ray.origin).angleTo(ray.direction)
      if (a < bestA && segmentClear(eye.x, eye.y, eye.z, toT.x, toT.y, toT.z) > 0.97) {
        bestA = a
        best = b
      }
    }
    return best
  }

  function melee(w) {
    const cd = w.cooldown * (you.power.cooldownMul ?? 1)
    const charge = Math.min(1, (now - lastSwing) / cd)
    lastSwing = now
    swingCount = (swingCount + 1) & 255
    hooks.viewmodel.swing()
    sfx.swing()
    const target = pickTarget(COMBAT.reach)
    if (!target) return
    const crit = charge > 0.9 && !player.grounded && player.velocity.y < 0
    const dmg = w.dmg * (0.2 + 0.8 * charge * charge) * (crit ? COMBAT.critMul : 1)
    damage(target, dmg, you, { kind: 'melee', crit, kb: w.kb * (0.4 + 0.6 * charge), sprint: inputState.sprint && charge > 0.9, weaponHit: state.selected === 0 || you.power.punchHeal })
  }

  // aim from the eyes toward where the crosshair meets the world
  function playerAim() {
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(ray.direction)
    const far = 140
    const f = segmentClear(camPos.x, camPos.y, camPos.z, camPos.x + ray.direction.x * far, camPos.y + ray.direction.y * far, camPos.z + ray.direction.z * far)
    const aim = camPos.clone().addScaledVector(ray.direction, Math.max(4, f * far))
    eye.set(player.position.x, player.position.y + EYE, player.position.z)
    const dir = aim.sub(eye).normalize()
    return { from: { x: eye.x + dir.x * 0.45, y: eye.y + dir.y * 0.45 - 0.08, z: eye.z + dir.z * 0.45 }, dir: { x: dir.x, y: dir.y, z: dir.z } }
  }
  function fireBow(w) {
    const charge = Math.min(1, drawT / w.draw)
    const aim = playerAim()
    shoot(you, aim.from, aim.dir, charge, w, true)
    swingCount = (swingCount + 1) & 255
    arrowsLeft--
    syncHotbar()
    lastAttackAt = now
    if (you.protectedUntil > now) you.protectedUntil = 0
  }

  // --- kit ability / shields / shop items -------------------------------------------------------------
  // fighting: in the arena or in a duel (most rules are the same up there)
  const inArena = () => hooks.zone() === 'arena' || hooks.zone() === 'duel'
  const selectedItem = () => (state.selected === 0 ? null : state.hotbar[state.selected])
  const hasKitShield = () => !!you.power.shield
  const shopShieldSelected = () => selectedItem()?.id === 'shield'
  function canBlock() {
    if (on(you, 'shieldBroken') || on(you, 'freeze')) return false
    return hasKitShield() || shopShieldSelected()
  }
  function wearShopShield() {
    if (hasKitShield() || !shopShieldSelected()) return
    shieldHits++
    if (shieldHits < SHOP_USE.shield.durability) return
    shieldHits = 0
    consume(state.selected)
    sfx.shieldBreak(1)
    hooks.toast('Your shield broke!', 'bad')
  }
  function consume(slot) {
    const it = state.hotbar[slot]
    if (!it) return
    it.count--
    if (it.count <= 0) state.hotbar[slot] = null
    changed()
    if (slot === state.selected) hooks.viewmodel.setItem(state.hotbar[slot] ? itemIcon(state.hotbar[slot].id) : null)
  }
  const itemIcon = (id) => SHOP_ITEMS.find((s) => s.id === id)?.icon ?? id
  function useAbility() {
    if (!inArena() || now < lockedUntil) return false
    if (on(you, 'freeze')) return false
    const a = you.power.ability
    if (!a) return false
    if (!abilities.ready(you, now)) {
      if (you.ammo === 0) hooks.toast(`No ${ABILITY_INFO[a.type][0]} left this life`, 'bad')
      else sfx.deny()
      return false
    }
    const ok = abilities.use(you, playerAim(), now)
    if (ok) {
      hooks.viewmodel.swing()
      swingCount = (swingCount + 1) & 255
      lastAttackAt = Math.max(lastAttackAt, now - COMBAT.combatTag + 2)
      if (you.protectedUntil > now && a.type !== 'apple' && a.type !== 'rewind') you.protectedUntil = 0
    } else sfx.deny()
    return ok
  }
  // right click / tap the selected slot again: use the shop item in your hand
  function useItem() {
    const it = selectedItem()
    if (!it || !USABLE.has(it.id) || !inArena() || now < lockedUntil) return false
    const U = SHOP_USE[it.id]
    switch (it.id) {
      case 'apple':
        regen(you, U.heal, U.over)
        break
      case 'potion':
        status(you, 'speed', U.time)
        soundAt(you.pos.x, you.pos.y, you.pos.z, (k) => sfx.drink(k))
        hooks.toast(`Speed for ${U.time}s!`, 'good')
        break
      case 'orb': {
        const aim = playerAim()
        effects.throwItem('orb', you, aim.from, aim.dir, {})
        break
      }
      case 'steak':
        if (food > HUNGER.max - 2) {
          hooks.toast("You're not hungry", 'bad')
          return false
        }
        food = Math.min(HUNGER.max, food + U.food)
        hooks.setFood(food)
        soundAt(you.pos.x, you.pos.y, you.pos.z, (k) => sfx.eat(k))
        break
      case 'boost':
        state.boostKills = (state.boostKills ?? 0) + U.kills
        hooks.toast(`Double XP for your next ${state.boostKills} kills!`, 'good')
        sfx.reward()
        break
    }
    hooks.viewmodel.swing()
    consume(state.selected)
    return true
  }
  // --- online: what the others send (net.js, backend KitRoom.ts) ----------------------------------
  const sourceOf = (k) => resolveKey(k) ?? stub(k)
  function applyAct(e, m) {
    if (!e || !e.alive) return
    if (m.type === 'status') status(e, m.key, m.s)
    else if (m.type === 'ignite') ignite(e, m.s, m.mul)
    else if (m.type === 'push') push(e, m.x, m.y, m.z)
    else if (m.type === 'teleport') teleport(e, m.x, m.y, m.z)
  }
  onNet('hit', (m) => {
    if (you.alive && inArena()) damage(you, m.amount, sourceOf(m.from), m.opts ?? {})
  })
  onNet('botHit', (m) => {
    const b = bots.simulating() ? bots.byId(m.bot) : null
    if (b?.alive) damage(b, m.amount, sourceOf(m.from), m.opts ?? {})
  })
  onNet('act', (m) => inArena() && applyAct(you, m))
  onNet('botAct', (m) => bots.simulating() && applyAct(bots.byId(m.bot), m))
  onNet('summon', (m) => {
    const owner = resolveKey(m.from)
    if (bots.simulating() && owner?.alive) bots.spawnMinions(owner, m.a, now)
  })
  onNet('kill', (m) => rewardKill({ name: String(m.victim ?? '?') }, m.streak | 0))
  onNet('feed', (m) => {
    if (inDuel()) return
    const v = { name: String(m.victim ?? '?'), isPlayer: false }
    const k = m.killer ? { name: String(m.killer), isPlayer: m.killerId === net.sessionId } : null
    hooks.feed(deathLine(v, k, m.cause))
  })
  onNet('bots', (m) => bots.applySnapshot(m?.list, now))
  // someone else's effect, replayed as a visual (their client decided what it hit)
  onNet('fx', (m) => {
    try {
      const owner = sourceOf(m.owner)
      switch (m.t) {
        case 'throw':
          if (THROWN_KINDS.has(m.kind)) effects.throwItem(m.kind, owner, m.from, m.dir, { ...(m.o ?? {}), ghost: true })
          break
        case 'arrow':
          shoot(owner, m.from, m.dir, 1, { gravity: m.g ?? -18, dmg: 0, dmgMax: 0, speed: m.speed, speedMax: m.speed }, false, true, m.speed)
          break
        case 'wall':
          if (Array.isArray(m.cells)) effects.placeWall(m.cells.slice(0, 12).filter((c) => Array.isArray(c) && c.every(Number.isInteger)), Math.min(30, m.life ?? 10))
          break
        case 'turret':
          effects.turret(owner, { life: Math.min(30, m.life ?? 20) }, m.at, true)
          break
        case 'bees':
          effects.addBees(owner, { count: Math.min(6, m.count ?? 4), life: Math.min(20, m.life ?? 10), ghost: true })
          break
        case 'bolt':
          effects.bolt(m.at.x, m.at.y, m.at.z)
          break
        case 'boom':
          effects.boomRings(m.from, m.dir, Math.min(24, m.len ?? 16))
          break
        case 'slam':
          effects.slamFx(m.at.x, m.at.y, m.at.z, Math.min(8, m.r ?? 5))
          break
        case 'portal':
          effects.fx.portal(m.at.x, m.at.y, m.at.z)
          if (m.to) effects.fx.portal(m.to.x, m.to.y, m.to.z)
          break
        case 'rebirth':
          fx.rebirth(m.at.x, m.at.y, m.at.z)
          break
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[fx] bad replay', m, err)
    }
  })

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat || e.target instanceof HTMLInputElement) return
    api.abilityDown()
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyF') api.abilityUp()
  })

  // the kit weapon lives in hotbar slot 1 (arrows as its count for bows)
  let equippedKit = null
  function syncHotbar() {
    const w = weapon()
    const slot = w.item ? { id: w.item, count: w.type === 'bow' ? Math.max(1, arrowsLeft) : 1 } : null
    const cur = state.hotbar[0]
    if (cur?.id !== slot?.id || cur?.count !== slot?.count) {
      state.hotbar[0] = slot
      changed()
    }
    if (state.selected === 0) hooks.viewmodel.setItem(w.item)
  }
  function equip() {
    const w = weapon()
    arrowsLeft = w.type === 'bow' ? w.arrows : 0
    equippedKit = state.kit
    you.kit = kitOf()
    you.armor = you.kit.armor
    abilities.reset(you)
    syncHotbar()
  }
  onChange(() => {
    if (state.kit !== equippedKit) queueMicrotask(equip)
  })

  // --- per-frame player state: statuses, movement powers, hunger, falls ---------------------------------
  function playerTick(dt) {
    const p = player.position
    const arenaNow = inArena()
    you.invisible = on(you, 'invis')
    you.weapon = heldWeapon()
    you.blocking = arenaNow && canBlock() && (held.right || held.slot || (held.ability && hasKitShield()))
    hooks.viewmodel.setBlock?.(you.blocking, hasKitShield() ? you.kit?.icon?.startsWith('shield') ? you.kit.icon : 'shield' : 'shield')
    if (!arenaNow) {
      Object.assign(playerEnv, { jumpMul: 1, airJumps: 0, glide: false, noJump: false, noSprint: false, swimFast: false })
      return
    }
    // movement powers (main.js already set speedMul for liquids this frame)
    const pw = you.power
    playerEnv.speedMul *= moveMul(you)
    playerEnv.jumpMul = pw.jumpMul ?? 1
    playerEnv.airJumps = pw.airJumps ?? 0
    playerEnv.glide = !!pw.glide
    playerEnv.swimFast = !!pw.swimFast
    playerEnv.noJump = on(you, 'freeze') || on(you, 'root') || now < lockedUntil
    playerEnv.noSprint = food < HUNGER.low || you.blocking
    // regeneration: golden apples, the medic's aura
    if (you.regen && now < you.regen.until) hooks.healPlayer(you.regen.rate * dt)
    if (pw.regen) hooks.healPlayer(pw.regen * dt)
    // hunger
    const before = Math.ceil(food)
    food = Math.max(0, food - dt * (HUNGER.drain + (inputState.sprint && Math.hypot(player.velocity.x, player.velocity.z) > 6 ? HUNGER.sprintDrain : 0)))
    if (Math.ceil(food) !== before) {
      hooks.setFood(food)
      if (Math.ceil(food) === HUNGER.low) hooks.toast('You are getting hungry: eat a steak to keep sprinting and healing', 'bad')
    }
    // fall damage
    if (playerEnv.swim > 0 || playerEnv.climb) fallPeak = p.y
    if (player.grounded) {
      if (!wasGrounded) {
        const h = fallPeak - p.y
        if (h > FALL.safe && !pw.noFall) hooks.hurtPlayer((h - FALL.safe) * FALL.perM, null, 'fall')
      }
      fallPeak = p.y
    } else fallPeak = Math.max(fallPeak, p.y)
    wasGrounded = player.grounded
    if (pw.ability?.type === 'rewind') effects.track(you, now, pw.ability.seconds ?? 3)
  }

  function statusText(t) {
    if (you.protectedUntil > t) return [`Spawn protection ${Math.ceil(you.protectedUntil - t)}s`, 'safe']
    if (on(you, 'freeze')) return ['Frozen!', 'ice']
    if (on(you, 'root')) return ['Rooted!', 'nature']
    if (on(you, 'invis')) return [`Invisible ${Math.ceil(you.status.invis - t)}s`, 'ghost']
    if (on(you, 'shieldBroken') && (hasKitShield() || shopShieldSelected())) return [`Shield broken ${Math.ceil(you.status.shieldBroken - t)}s`, 'fight']
    if (on(you, 'slow')) return ['Slowed', 'ice']
    const left = COMBAT.combatTag - (t - lastAttackAt)
    if (left > 0) return [`In combat ${Math.ceil(left)}s`, 'fight']
    if (on(you, 'speed')) return [`Speed ${Math.ceil(you.status.speed - t)}s`, 'safe']
    return ['', '']
  }
  function abilityView(t) {
    const a = you.power?.ability
    const k = you.kit
    if (!k) return null
    if (hasKitShield()) return { icon: k.icon, name: 'Shield (hold)', cd: on(you, 'shieldBroken') ? (you.status.shieldBroken - t) / 5 : 0, count: null, active: you.blocking }
    if (!a) return null
    const [name, icon] = ABILITY_INFO[a.type] ?? [k.name, k.icon]
    const cd = t < you.abilityReady ? (you.abilityReady - t) / a.cooldown : 0
    const label = a.type === 'potion' ? potionLabel(you.potionNext) : name
    return { icon: a.type === 'potion' ? ['potion', 'potion_purple', 'potion_green'][you.potionNext % 3] : icon, name: label, cd: Math.min(1, cd), count: you.ammo, active: false }
  }

  const api = {
    you,
    bots,
    effects,
    entities,
    inCombat: () => now - lastAttackAt < COMBAT.combatTag,
    combatLeft: () => Math.max(0, COMBAT.combatTag - (now - lastAttackAt)),
    canRegen: () => !inArena() || food >= HUNGER.low,
    // left mouse / attack button down (in the lobby it is just a swing)
    press() {
      if (!inArena()) {
        hooks.viewmodel.swing()
        sfx.swing()
        return
      }
      if (you.blocking || on(you, 'freeze') || now < lockedUntil) return
      const w = heldWeapon()
      if (w.type === 'bow') {
        if (!drawing) {
          drawing = true
          drawT = 0
          sfx.bowDraw()
        }
      } else if (now - lastSwing > 0.12) melee(w)
    },
    release() {
      if (!drawing) return
      drawing = false
      const w = heldWeapon()
      if (w.type === 'bow' && drawT > 0.12 && inArena() && !on(you, 'freeze')) fireBow(w)
      hooks.viewmodel.setDraw?.(0)
    },
    // right mouse in the arena: block (shield) > use the item in hand > the kit ability
    rightDown() {
      held.right = true
      if (canBlock()) return
      if (!useItem()) useAbility()
    },
    rightUp() {
      held.right = false
    },
    // F / the touch ability button (shield kits hold it to block)
    abilityDown() {
      if (hasKitShield()) held.ability = true
      else useAbility()
    },
    abilityUp() {
      held.ability = false
    },
    // touch: tapping the selected hotbar slot again uses it (hold for a shop shield)
    slotDown() {
      if (shopShieldSelected()) held.slot = true
      else useItem()
    },
    slotUp() {
      held.slot = false
    },
    // dropping in: fresh arrows and ammo, the kit's armor, full hunger, a clean slate
    onDrop() {
      equip()
      life.kills = life.gold = life.xp = 0
      you.name = hooks.playerName()
      you.damagers.clear()
      you.lastHit = null
      you.regen = null
      you.streak = state.killstreak
      food = HUNGER.max
      hooks.setFood(food)
      shieldHits = 0
    },
    onLand() {
      you.alive = true
      you.protectedUntil = now + COMBAT.spawnProtect
      you.invulnUntil = 0
      fallPeak = player.position.y
      wasGrounded = true
      hud.protectedFor(COMBAT.spawnProtect)
    },
    // main.js: your health hit 0. A phoenix comes back once: returns the hp to set, else 0.
    cheatDeath() {
      if (!you.alive || !you.power.revive || you.revived) return 0
      return rebirth(you)
    },
    // the player died (main.js): credit whoever finished you; returns { killer, life, big }
    playerDied(cause) {
      if (!you.alive) return { killer: null, life: { ...life }, big: null }
      drawing = false
      hooks.viewmodel.setDraw?.(0)
      const duel = inDuel()
      const killer = died(you, cause)
      if (!duel) {
        state.killstreak = 0
        changed()
      }
      return { killer: killer?.name ?? null, life: { ...life }, big: deathTitle(killer, cause) }
    },
    // --- duels (duel/duels.js drives these) ---
    duel: {
      // a fresh round: full kit, ammo, hunger; no spawn protection; frozen until `unlockAt`
      round(lockFor) {
        equip()
        food = HUNGER.max
        hooks.setFood(food)
        you.alive = true
        you.protectedUntil = 0
        you.invulnUntil = 0
        you.status = {}
        you.lastHit = null
        you.damagers.clear()
        you.regen = null
        lockedUntil = now + lockFor
        fallPeak = player.position.y
        wasGrounded = true
      },
      // practice: (re)place the bot on its spawn, rooted for the countdown
      practiceBot(at, facing, kitId, lockFor) {
        practice.clear()
        const b = practice.spawnFighter(now, at, kitId, facing, lockFor)
        b.status.root = now + lockFor
        b.target = you
        return b
      },
      clear() {
        practice.clear()
        lockedUntil = 0
      },
      locked: () => now < lockedUntil,
      lockLeft: () => Math.max(0, lockedUntil - now),
      onBotDied(fn) {
        duelHooks.botDied = fn
      },
    },
    onLobby() {
      you.alive = false
      drawing = false
      held.right = held.ability = held.slot = false
      you.blocking = false
      you.status = {}
      hooks.viewmodel.setDraw?.(0)
      hooks.viewmodel.setBlock?.(false)
      lastAttackAt = -99
      food = HUNGER.max
      hooks.setFood(food)
      hud.clear()
    },
    lifeStats: () => ({ ...life }),
    // what the others need to draw you (main.js adds position, zone and hp): flag bits as in
    // remotePlayers.js FLAG
    netPose(burning) {
      let f = 0
      if (player.grounded) f |= 1
      if (drawing) f |= 2
      if (you.blocking) f |= 4
      if (you.invisible) f |= 8
      if (on(you, 'freeze')) f |= 16
      if (burning) f |= 32
      if (you.protectedUntil > now) f |= 64
      if (inputState.sprint) f |= 128
      const sel = selectedItem()
      const item = state.selected === 0 ? weapon().item ?? '' : sel ? itemIcon(sel.id) : ''
      return { flags: f, swing: swingCount, kit: state.kit, item }
    },
    update(dt, t, viewportH, active) {
      now = t
      const arenaNow = inArena()
      playerTick(dt)
      you.drawT = drawing ? drawT : null
      // bots: run here offline or as the host (fewer when real players fight); else draw the host's
      const others = hooks.remote?.inArena() ?? 0
      const want = Math.max(NET.minBots, (COARSE ? COMBAT.bots.countTouch : COMBAT.bots.count) - others)
      const sim = simulatesBots()
      bots.update(dt, t, active, { simulate: sim, target: want })
      practice.update(dt, t, inDuel(), { simulate: true, target: 0 })
      if (sim && net.connected) {
        snapAcc += dt
        if (snapAcc >= 1 / NET.botsHz) {
          snapAcc = 0
          send('bots', { list: bots.snapshot(t) })
        }
      }
      for (const b of bots.bots) if (b.alive && b.power?.ability?.type === 'rewind') effects.track(b, t, b.power.ability.seconds ?? 3)
      effects.update(dt, t, viewportH)
      pickups.update(dt, t, hooks.zone() === 'arena' && you.alive, player.position)
      updateArrows(dt)
      // bow draw / melee charge meter
      if (drawing) {
        const w = heldWeapon()
        if (w.type !== 'bow') drawing = false
        else {
          drawT += dt
          const k = Math.min(1, drawT / w.draw)
          hooks.viewmodel.setDraw?.(k)
          hud.charge(k, true)
        }
      } else if (arenaNow) {
        const w = heldWeapon()
        hud.charge(w.type === 'bow' ? 1 : Math.min(1, (t - lastSwing) / (w.cooldown * (you.power.cooldownMul ?? 1))), false)
      } else hud.charge(1, false)
      const [text, cls] = arenaNow ? statusText(t) : ['', '']
      hud.status(text, cls)
      const view = arenaNow ? abilityView(t) : null
      hud.ability(view)
      hooks.touch?.setAbility(view)
      sparks.update(dt, camera, viewportH)
      chips.update(dt, camera, viewportH)
      puffs.update(dt, camera, viewportH)
    },
  }
  return api
}
