// The other players in the room (net.js roster): blocky fighters wearing their kit's armor and
// holding what they hold, with a name tag + health, a walk cycle, swings, bow draws, raised
// shields, invisibility and flames. Each one is also a combat entity (`isRemote`) that combat.js
// can hit: hits are relayed to that player's own client, which applies them (KitRoom.ts).
// Drawn only when they are in the same place as you (lobby vs the arena below it).
import { Group } from 'three'
import { ARENA, KITS } from './config.js'
import { RAPIER, world as physicsWorld } from './physics.js'
import { buildCharacter, randomSkin } from './lobby/characters.js'
import { itemMesh } from './lobby/models.js'
import { net, roster } from './net.js'
import { powerOf } from './arena/abilities.js'
import { weaponFor } from './arena/weapons.js'
import * as sfx from './audio.js'
import { attachBubble } from './bloxity.js'

// pose flag bits (also sent by main.js for the local player)
export const FLAG = { grounded: 1, drawing: 2, blocking: 4, invisible: 8, frozen: 16, burning: 32, protected: 64, sprint: 128 }
// where a roster player is: 'lobby', 'arena' (also dropping / dead) or 'duel:<id>'
export const areaOf = (p) => (p.zone === 'lobby' ? 'lobby' : p.zone === 'duel' ? `duel:${p.duel}` : 'arena')
const angLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k

// A Boxity emote on a blocky fighter (it has no rig, so the clip is mapped by kind): arms and
// body only, played over the walk cycle for a few seconds, cut short when they move or fight.
function actEmote(r, kind, s) {
  const P = r.ch.parts
  if (kind === 'cheer') {
    P.armR.rotation.set(-2.9, 0, -0.35)
    P.armL.rotation.set(-2.9, 0, 0.35)
    r.holder.position.y += Math.abs(Math.sin(s * 7)) * 0.18
  } else if (kind === 'dance') {
    P.armR.rotation.set(-1.2 + Math.sin(s * 8) * 0.9, 0, -0.3)
    P.armL.rotation.set(-1.2 - Math.sin(s * 8) * 0.9, 0, 0.3)
    r.holder.rotation.y += Math.sin(s * 4) * 0.35
    r.holder.position.y += Math.abs(Math.sin(s * 8)) * 0.1
  } else P.armR.rotation.set(-2.75, 0, -0.25 + Math.sin(s * 9) * 0.3) // wave
}

export function createRemotePlayers(scene, { fire } = {}) {
  const group = new Group()
  group.name = 'remote-players'
  scene.add(group)
  const players = new Map() // sessionId -> remote
  const list = [] // combat entities in the arena
  let now = 0 // the loop's clock (update's t), for emote timing

  function look(r, p) {
    const kit = KITS.find((k) => k.id === p.kit) ?? KITS[0]
    const key = `${kit.id}|${p.item}|${p.name}`
    if (r.lookKey === key) return
    r.lookKey = key
    if (r.ch) {
      r.holder.remove(r.ch.root)
      r.ch.tag?.material.map?.dispose()
    }
    r.kit = kit
    r.power = powerOf(kit.id)
    r.weapon = weaponFor(kit)
    r.armor = kit.armor
    r.ch = buildCharacter({
      skin: randomSkin(p.seed),
      armor: kit.armorSet,
      item: p.item || null,
      tag: tagLines(p.name, p.hp),
      tagHeight: 0.46,
    })
    if (r.power.shield) {
      const sh = itemMesh(kit.icon.startsWith('shield') ? kit.icon : 'shield', 0.62, 1)
      sh.position.set(0.04, -0.42, 0.14)
      sh.rotation.set(0, Math.PI / 2, 0)
      r.ch.parts.armL.add(sh)
    }
    r.holder.add(r.ch.root)
    r.shownHp = Math.ceil(p.hp)
  }
  const tagLines = (name, hp) => [
    { text: name, size: 34, color: '#7fd8ff', bg: 'rgba(0,0,0,0.38)', weight: 600 },
    { text: String(Math.max(0, Math.ceil(hp))), size: 34, color: '#ffffff', heart: true },
  ]

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
      ch: null,
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
      streak: 0,
      kills: 0,
      peakY: p.y,
    }
    look(r, p)
    players.set(id, r)
    return r
  }
  function remove(id) {
    const r = players.get(id)
    if (!r) return
    group.remove(r.holder)
    r.bubble?.remove?.()
    r.ch?.tag?.material.map?.dispose()
    physicsWorld.removeRigidBody(r.body)
    players.delete(id)
  }

  return {
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
        r.bubble = attachBubble(r.holder, text, { height: 2.95 })
        return !!r.bubble
      }
      return false
    },
    // A Boxity emote another player picked (relayed by the server): { kind, seconds } from emotes.js
    emote(sessionId, kind, seconds) {
      const r = players.get(sessionId)
      if (r) r.emote = { kind, seconds, t0: now }
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
      const R = roster()
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
            r.ch.swing()
            const d = Math.hypot(r.pos.x - (myPos?.x ?? 0), r.pos.z - (myPos?.z ?? 0))
            if (d < 24) sfx.swing(1 - d / 24)
          }
          r.ch.animate(dt, r.grounded ? r.speed : 0, { yaw: 0, pitch: r.pitch })
          const parts = r.ch.parts
          if (r.drawT !== null) {
            parts.armR.rotation.set(-Math.PI / 2 + r.pitch, -0.15, 0)
            parts.armL.rotation.set(-Math.PI / 2 + r.pitch, 0.35, 0)
          }
          if (r.blocking) parts.armL.rotation.set(-1.25, 0.55, 0)
          if (!r.grounded) {
            parts.legR.rotation.x *= 0.5
            parts.legL.rotation.x *= 0.5
          }
          if (r.emote) {
            const e = r.emote
            if (t - e.t0 > e.seconds || r.speed > 1 || r.drawT !== null || r.blocking) r.emote = null
            else actEmote(r, e.kind, t - e.t0)
          }
          const hp = Math.max(0, Math.ceil(p.hp))
          if (hp !== r.shownHp) {
            r.shownHp = hp
            r.ch.tag?.userData.redraw(tagLines(p.name, hp))
          }
          if (f & FLAG.burning && Math.random() < dt * 10) fire?.(r.pos.x, r.pos.y, r.pos.z)
        })
      }
      for (const id of [...players.keys()]) if (!seen.has(id)) remove(id)
    },
  }
}
let myPos = null
export function setListenerPos(p) {
  myPos = p
}
