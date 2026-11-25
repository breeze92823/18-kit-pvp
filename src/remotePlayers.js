// The other players in the room (net.js roster), drawn with THEIR Bloxity look: the player.glb rig
// dressed in the cosmetics + body proportions they sent (roster `avatar`, validated by avatar/look.js),
// exactly like the local avatar (avatar/loader.js). A plain rig shows at once and the dressed one
// swaps in when its assets are in; a player without a Bloxity look (guest) keeps the stock rig.
// Kit armor is not drawn: only what the kit puts in the hand (weapon) and the shield on the left
// arm. Walk / run / jump come from the same procedural animator as the local player; swings, bow
// draws and blocks are arm poses laid over it, and a Boxity emote plays its REAL clip on the rig
// (avatar/emotes.js). Plus a name tag + health, invisibility and flames. Each one is also a combat
// entity (`isRemote`) that combat.js can hit: hits are relayed to that player's own client, which
// applies them (KitRoom.ts). Drawn only when they are in the same place as you (lobby vs arena).
import { Group, Quaternion } from 'three'
import { ARENA, KITS, PLAYER_DIMS, RIG_HEIGHT } from './config.js'
import { RAPIER, world as physicsWorld } from './physics.js'
import { nameTag } from './lobby/characters.js'
import { itemMesh } from './lobby/models.js'
import { net, roster } from './net.js'
import { powerOf } from './arena/abilities.js'
import { weaponFor } from './arena/weapons.js'
import * as sfx from './audio.js'
import { apiUrl, attachBubble, reportPlayer } from './bloxity.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { EmotePlayer, emoteById, loadEmotes } from './avatar/emotes.js'
import { parseLook } from './avatar/look.js'

// pose flag bits (also sent by main.js for the local player)
export const FLAG = { grounded: 1, drawing: 2, blocking: 4, invisible: 8, frozen: 16, burning: 32, protected: 64, sprint: 128 }
// where a roster player is: 'lobby', 'arena' (also dropping / dead) or 'duel:<id>'
export const areaOf = (p) => (p.zone === 'lobby' ? 'lobby' : p.zone === 'duel' ? `duel:${p.duel}` : 'arena')
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k

const UNIT = PLAYER_DIMS.height / RIG_HEIGHT // rig units -> metres
const PX = PLAYER_DIMS.height / 32 // the old blocky character's pixel, kept for the hand offsets
const FAR = 80 // m: beyond this a remote's pose is not animated (it is a dot anyway)
const _q = new Quaternion()
const _r = new Quaternion()

// --- Rig lifecycle -------------------------------------------------------------------------------
// Everything a freshly loaded rig shares with the cached player.glb (geometries, materials,
// textures) or with the other characters built from the same cache: never disposed with the rig;
// only what this player's own load added is.
function captureShared(root) {
  const shared = new Set()
  root.traverse((o) => {
    if (o.geometry) shared.add(o.geometry)
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      shared.add(m)
      if (m.map) shared.add(m.map)
    }
  })
  return shared
}
function disposeRig(root, shared) {
  if (!root) return
  root.traverse((o) => {
    if (o.geometry && !shared?.has(o.geometry)) o.geometry.dispose()
    for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
      if (shared?.has(m)) continue
      if (m.map && !shared.has(m.map)) m.map.dispose()
      m.dispose()
    }
  })
}
// How each arm's bone is oriented in the character's own space at bind pose (the real rig's limb
// frames are twisted), so a gear anchor can cancel it and sit upright in character space.
function captureBasis(rig) {
  rig.updateMatrixWorld(true)
  rig.getWorldQuaternion(_r).invert()
  const basis = {}
  for (const name of ['ArmR1', 'ArmL1']) {
    const bone = rig.nodes?.[name]
    if (!bone) continue
    bone.getWorldQuaternion(_q)
    basis[name] = _r.clone().multiply(_q).invert()
  }
  return basis
}

export function createRemotePlayers(scene, { fire } = {}) {
  const group = new Group()
  group.name = 'remote-players'
  scene.add(group)
  const players = new Map() // sessionId -> remote
  const list = [] // combat entities in the arena
  let now = 0 // the loop's clock (update's t), for emote timing
  let fakeRoster = null // dev: a pretend roster (window.__remote.fake)

  // the kit's look: held item + shield + name tag (rebuilt when the kit, the item or the name changes)
  function look(r, p) {
    const kit = KITS.find((k) => k.id === p.kit) ?? KITS[0]
    const key = `${kit.id}|${p.item}|${p.name}`
    if (r.lookKey === key) return
    r.lookKey = key
    r.kit = kit
    r.power = powerOf(kit.id)
    r.weapon = weaponFor(kit)
    r.armor = kit.armor
    r.itemId = p.item || null
    r.shieldIcon = r.power.shield ? (kit.icon.startsWith('shield') ? kit.icon : 'shield') : null
    mountGear(r)
    if (r.tag) {
      r.holder.remove(r.tag)
      r.tag.material.map?.dispose()
      r.tag.material.dispose()
    }
    r.tag = nameTag(tagLines(p.name, p.hp), 0.46)
    r.holder.add(r.tag)
    placeTag(r)
    r.shownHp = Math.ceil(p.hp)
  }
  const tagLines = (name, hp) => [
    { text: name, size: 34, color: '#7fd8ff', bg: 'rgba(0,0,0,0.38)', weight: 600 },
    { text: String(Math.max(0, Math.ceil(hp))), size: 34, color: '#ffffff', heart: true },
  ]
  // the tag floats over the head, which rises with the height proportion (and a big head)
  function placeTag(r) {
    r.tagY = PLAYER_DIMS.height * r.height + 0.35 + Math.max(0, r.headScale - 1) * 0.25
    if (r.tag) r.tag.position.y = r.tagY + 0.23
  }

  // Held item (right hand) and shield (left arm) hang on a gear anchor under each arm bone: the
  // anchor cancels the bone's bind orientation and the rig's unit/height scale, so the pixel-art
  // item keeps the sizes and offsets it had on the blocky character.
  function gearAnchor(r, boneName) {
    const bone = r.rig?.nodes?.[boneName]
    const q = r.basis?.[boneName]
    if (!bone || !q) return null
    const a = new Group()
    a.quaternion.copy(q)
    a.scale.set(1 / UNIT, 1 / (UNIT * r.height), 1 / UNIT)
    bone.add(a)
    r.gear.push(a)
    return a
  }
  function mountGear(r) {
    for (const a of r.gear) a.parent?.remove(a)
    r.gear.length = 0
    if (!r.rig) return
    const h = r.height
    if (r.itemId) {
      const a = gearAnchor(r, 'ArmR1')
      if (a) {
        const it = itemMesh(r.itemId, 0.72, 1)
        it.position.set(0, -10.5 * PX * h, 2.2 * PX)
        it.rotation.order = 'YXZ'
        it.rotation.set(0.2, -Math.PI / 2, Math.PI * 0.75)
        a.add(it)
      }
    }
    if (r.shieldIcon) {
      const a = gearAnchor(r, 'ArmL1')
      if (a) {
        const sh = itemMesh(r.shieldIcon, 0.62, 1)
        sh.position.set(0.04, -0.42 * h, 0.14)
        sh.rotation.set(0, Math.PI / 2, 0)
        a.add(sh)
      }
    }
  }

  function setRig(r, rig, shared, lk) {
    const old = r.rig
    const oldShared = r.shared
    if (old) {
      r.holder.remove(old)
      disposeAnimator(r.animator)
    }
    r.rig = rig
    r.shared = shared
    r.holder.add(rig)
    r.animator = makeAnimator(rig)
    r.emotes.bind(rig)
    r.basis = captureBasis(rig)
    r.height = lk?.p?.height ?? 1
    r.headScale = lk?.p?.headScale ?? 1
    if (old) disposeRig(old, oldShared)
    mountGear(r)
    placeTag(r)
  }
  // Loads the dressed rig for a look (null = the stock rig) and swaps it in. Only the newest request
  // for a player may land (their look can change while assets load).
  async function dress(r, lk) {
    const mine = ++r.gen
    try {
      const rig = await loadBaseCharacter()
      const shared = captureShared(rig)
      if (mine !== r.gen) return disposeRig(rig, shared)
      if (lk) await attachEquippedAccessories(rig, lk.e)
      if (mine !== r.gen) return disposeRig(rig, shared)
      applyProportions(rig, lk?.p)
      setRig(r, rig, shared, lk)
    } catch (err) {
      console.warn('[remote] could not dress a player', err)
    }
  }

  function add(id, p) {
    const holder = new Group()
    group.add(holder)
    const body = physicsWorld.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y + 0.9, p.z))
    physicsWorld.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.32), body)
    const r = {
      isRemote: true,
      sessionId: id,
      key: id,
      name: p.name,
      holder,
      body,
      rig: null,
      animator: null,
      emotes: new EmotePlayer(),
      emoteUntil: 0,
      basis: null,
      gear: [],
      gen: 0,
      height: 1,
      headScale: 1,
      tag: null,
      tagY: 2,
      itemId: null,
      shieldIcon: null,
      avatarRaw: null,
      lookId: null,
      lookKey: '',
      pos: { x: p.x, y: p.y, z: p.z },
      vel: { x: 0, y: 0, z: 0 },
      facing: p.yaw,
      pitch: 0,
      speed: 0,
      hp: p.hp,
      alive: false,
      status: {},
      protectedUntil: 0,
      invulnUntil: 0,
      blocking: false,
      invisible: false,
      drawT: null,
      swing: p.swing,
      swingT: 0,
      streak: 0,
      kills: 0,
      peakY: p.y,
      uid: p.uid || '',
    }
    const plain = buildDefaultCharacter() // visible at once; the real look swaps in below
    setRig(r, plain, captureShared(plain), null)
    look(r, p)
    players.set(id, r)
    reportPlayer(p.name, performance.now() - net.connectedAt < 3000) // friend join toasts
    return r
  }
  function remove(id) {
    const r = players.get(id)
    if (!r) return
    r.gen++ // a load still in flight must not land
    group.remove(r.holder)
    r.bubble?.remove?.()
    r.emotes.stop(true)
    disposeAnimator(r.animator)
    disposeRig(r.rig, r.shared)
    if (r.tag) {
      r.tag.material.map?.dispose()
      r.tag.material.dispose()
    }
    physicsWorld.removeRigidBody(r.body)
    players.delete(id)
  }

  // Arm poses over the locomotion (the animator already wrote its pose this frame): a bow draw, a
  // raised shield, a sword swing. Character-space rotations, -x raises an arm forward.
  function actPoses(r, dt) {
    const rig = r.animator?.rig
    if (!rig) return
    if (r.drawT !== null) {
      rig.poseBone('ArmR1', -Math.PI / 2 + r.pitch, -0.15, 0)
      rig.poseBone('ArmL1', -Math.PI / 2 + r.pitch, 0.35, 0)
    } else if (r.swingT > 0) {
      r.swingT = Math.max(0, r.swingT - dt * 3.2)
      const s = Math.sin((1 - r.swingT) * Math.PI)
      rig.poseBone('ArmR1', -(0.25 + s * 1.6), 0, s * 0.3)
    }
    if (r.blocking) rig.poseBone('ArmL1', -1.25, 0.55, 0)
  }

  const api = {
    // combat entities (other players fighting in the arena)
    entities: () => list,
    get: (id) => players.get(id) ?? null,
    count: () => players.size,
    // A chat message over its sender's head (Boxity user id = the roster's `uid`); false when that
    // player is not here. Above the name tag, replacing their previous bubble.
    bubble(uid, text) {
      if (!uid || !text) return false
      for (const r of players.values()) {
        if (r.uid !== uid || !r.holder.visible) continue
        r.bubble = attachBubble(r.holder, text, { height: r.tagY + 0.5 })
        return !!r.bubble
      }
      return false
    },
    // A Boxity emote another player picked (relayed by the server): the catalogue clip plays on
    // their rig; unknown ids are ignored quietly. Stops when they move or fight.
    async emote(sessionId, emoteId) {
      try {
        if (!emoteById(emoteId)) await loadEmotes(apiUrl())
        const r = players.get(sessionId)
        const e = emoteById(emoteId)
        if (!r || !e || !r.emotes.play(emoteId)) return
        r.emoteUntil = now + (e.clip.loop ? 4 : e.clip.len + 0.3)
      } catch {
        // Cosmetic.
      }
    },
    // players in the arena (others), for sizing the bot count
    inArena() {
      let n = 0
      roster()?.forEach?.((p, id) => {
        if (id !== net.sessionId && p.zone === 'arena') n++
      })
      return n
    },
    // myArea: 'lobby' | 'arena' | 'duel:<id>' (main.js): only players there are drawn / fought
    update(dt, t, myArea) {
      now = t
      const R = fakeRoster ?? roster()
      const seen = new Set()
      list.length = 0
      if (R) {
        R.forEach((p, id) => {
          if (id === net.sessionId) return
          seen.add(id)
          const r = players.get(id) ?? add(id, p)
          r.name = p.name
          r.uid = p.uid || '' // the verified Boxity account id (chat bubbles find players by it)
          look(r, p)
          // their Bloxity look: parsed once per change, then the dressed rig swaps in
          if (p.avatar !== r.avatarRaw) {
            r.avatarRaw = p.avatar
            const lk = parseLook(p.avatar)
            if ((lk?.key ?? '') !== r.lookId) {
              r.lookId = lk?.key ?? ''
              dress(r, lk)
            }
          }
          // smooth toward the latest pose; a big jump (respawn, teleport) snaps
          const far = Math.hypot(p.x - r.pos.x, p.y - r.pos.y, p.z - r.pos.z) > 8
          const k = far ? 1 : Math.min(1, dt * 14)
          r.pos.x += (p.x - r.pos.x) * k
          r.pos.y += (p.y - r.pos.y) * k
          r.pos.z += (p.z - r.pos.z) * k
          r.vel.x = p.vx
          r.vel.y = p.vy
          r.vel.z = p.vz
          r.facing = far ? p.yaw : angLerp(r.facing, p.yaw, k)
          r.pitch += (p.pitch - r.pitch) * k
          r.speed += (p.speed - r.speed) * Math.min(1, dt * 10)
          r.hp = p.hp
          r.zone = p.zone
          const f = p.flags
          r.blocking = !!(f & FLAG.blocking)
          r.invisible = !!(f & FLAG.invisible)
          r.drawT = f & FLAG.drawing ? (r.drawT ?? 0) + dt : null
          r.protectedUntil = f & FLAG.protected ? t + 1 : 0
          r.status.freeze = f & FLAG.frozen ? t + 0.2 : 0
          r.status.invis = r.invisible ? t + 0.2 : 0
          r.grounded = !!(f & FLAG.grounded)
          r.streak = p.streak
          r.level = p.level | 0 // the host's bots go easier on rookies and pick kits near it
          r.alive = (p.zone === 'arena' || p.zone === 'duel') && p.hp > 0
          r.peakY = r.grounded ? r.pos.y : Math.max(r.peakY, r.pos.y)
          const here = areaOf(p) === myArea
          if (r.alive && here && myArea !== 'lobby') list.push(r)
          // draw
          const visible = here && p.zone !== 'dead' && !r.invisible
          r.holder.visible = visible
          r.holder.position.set(r.pos.x, r.pos.y, r.pos.z)
          r.holder.rotation.y = r.facing
          r.body.setNextKinematicTranslation({ x: r.pos.x, y: (visible ? r.pos.y : ARENA.voidY - 50) + 0.9, z: r.pos.z })
          if (!visible) return
          if (p.swing !== r.swing) {
            r.swing = p.swing
            r.swingT = 1
            const d = Math.hypot(r.pos.x - (myPos?.x ?? 0), r.pos.z - (myPos?.z ?? 0))
            if (d < 24) sfx.swing(1 - d / 24)
          }
          const near = Math.hypot(r.pos.x - (myPos?.x ?? 0), r.pos.z - (myPos?.z ?? 0)) < FAR
          if (near) {
            r.animator?.update(dt, { grounded: r.grounded, speed: r.grounded ? r.speed : 0, verticalVelocity: r.vel.y, turn: 0 })
            actPoses(r, dt)
            // a Boxity emote plays over the pose until it ends, they move, or they fight
            if (r.emotes.isPlaying() && (t > r.emoteUntil || r.speed > 1 || r.drawT !== null || r.blocking || r.swingT > 0)) r.emotes.stop()
            r.emotes.update(dt)
          }
          const hp = Math.max(0, Math.ceil(p.hp))
          if (hp !== r.shownHp) {
            r.shownHp = hp
            r.tag?.userData.redraw(tagLines(p.name, hp))
          }
          if (f & FLAG.burning && Math.random() < dt * 10) fire?.(r.pos.x, r.pos.y, r.pos.z)
        })
      }
      for (const id of [...players.keys()]) if (!seen.has(id)) remove(id)
    },
  }
  // Dev only: window.__remote.fake([{ id, name, x, y, z, zone: 'lobby', avatar: '<json>', ... }]) draws
  // pretend roster players without a server; fake(null) clears them.
  if (import.meta.env.DEV) {
    window.__remote = {
      players,
      fake(entries) {
        if (!entries) return void (fakeRoster = null)
        const base = { name: 'Fake', zone: 'lobby', kit: 'swordsman', item: 'sword', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, speed: 0, vx: 0, vy: 0, vz: 0, hp: 20, flags: 1, swing: 0, streak: 0, level: 1, duel: '', avatar: '', uid: '' }
        fakeRoster = new Map(entries.map((e, i) => [e.id ?? `fake${i}`, { ...base, ...e }]))
      },
    }
  }
  return api
}
let myPos = null
export function setListenerPos(p) {
  myPos = p
}
