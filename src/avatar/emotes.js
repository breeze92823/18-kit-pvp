// Boxity emotes. Boxity draws the picker and sends only the catalogue id of the pick; the game
// fetches the catalogue once ({apiUrl}/v1/avatar/emotes) and plays the clip on the standard rig
// (player.glb): values are DEGREES, deltas over the bind pose, euler XYZ right-multiplied onto the
// bone's bind quaternion, smoothstep between keys, clamped outside the key range, looping with
// time % len. Bone names the rig lacks are ignored; an unknown emote id is ignored too.
import { Euler, Quaternion } from 'three'
import { BONE_NAMES } from './rig.js'

const DEG = Math.PI / 180
const BLEND = 0.1 // s to blend into / out of an emote instead of snapping
const ANIMATED = new Set(BONE_NAMES) // the locomotion animator rewrites these every frame
// The standard Boxity rig: the only bone names an emote clip can address.
const RIG_BONES = ['Rig1', 'Spine1', 'Spine2', 'ArmR_Offset', 'ArmR1', 'ArmR2', 'ArmL_Offset', 'ArmL1', 'ArmL2', 'Neck_Offset', 'Neck1', 'LegR_Offset', 'LegR1', 'LegR2', 'LegL_Offset', 'LegL1', 'LegL2']

// --- Catalogue ------------------------------------------------------------------------------
const catalogue = new Map() // id -> { id, name, clip }
let loading = null

export function loadEmotes(apiUrl) {
  loading ??= fetch(`${apiUrl}/v1/avatar/emotes`)
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => {
      const list = Array.isArray(body) ? body : body?.emotes
      if (!Array.isArray(list)) return
      for (const e of list) if (e && typeof e.id === 'string' && e.clip?.tracks) catalogue.set(e.id, e)
    })
    .catch(() => {
      loading = null // try again on the next pick
    })
  return loading
}
export const emoteById = (id) => catalogue.get(id) ?? null

// How a blocky (non-rig) character should act an emote out: wave | dance | cheer. By name only,
// since the catalogue grows without a game release.
export function emoteKind(emote) {
  const n = String(emote?.name ?? '').toLowerCase()
  if (/dance|party|disco|shuffle|twist|floss|groove|jig/.test(n)) return 'dance'
  if (/cheer|victory|win|celebr|flex|hooray|yay|jump|clap/.test(n)) return 'cheer'
  return 'wave'
}
// How long a remote copy of an emote shows (looping clips are capped; the sender's own client
// stops on movement and the remote one stops when the sender moves).
export const remoteSeconds = (emote) => (emote?.clip?.loop ? 4 : Math.max(1, Math.min(6, emote?.clip?.len ?? 2)))

// --- Playback -------------------------------------------------------------------------------
const smooth = (s) => s * s * (3 - 2 * s)
// [x, y, z] degrees of a track at time t (docs: sampleTrack)
function sampleTrack(keys, t) {
  if (!Array.isArray(keys) || !keys.length) return null
  if (t <= keys[0][0]) return keys[0].slice(1)
  const last = keys[keys.length - 1]
  if (t >= last[0]) return last.slice(1)
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    if (t >= a[0] && t <= b[0]) {
      const s = smooth((t - a[0]) / (b[0] - a[0] || 1))
      return [1, 2, 3].map((j) => a[j] + (b[j] - a[j]) * s)
    }
  }
  return null
}

export class EmotePlayer {
  constructor() {
    this.bones = [] // { name, bone, bind }
    this.clip = null
    this.id = ''
    this.time = 0
    this.weight = 0 // 0..1 blend toward the clip
    this.active = false // false = blending out / idle
    this.dirty = new Set() // non-animated bones we moved and must put back
    this.q = new Quaternion()
    this.e = new Euler(0, 0, 0, 'XYZ')
  }

  // Bind to a freshly built avatar (still in its bind pose). Drops whatever was playing.
  bind(root) {
    this.stop(true)
    this.bones = []
    const nodes = root?.nodes
    if (!nodes) return
    for (const name of RIG_BONES) if (nodes[name]) this.bones.push({ name, bone: nodes[name], bind: nodes[name].quaternion.clone() })
  }

  // Plays an emote from the catalogue. false for an id we do not know (ignored quietly).
  play(id) {
    const emote = emoteById(id)
    if (!emote || !this.bones.length) return false
    this.clip = emote.clip
    this.id = id
    this.time = 0
    this.active = true
    return true
  }

  stop(now = false) {
    this.active = false
    if (now) {
      this.weight = 0
      this.restore()
    }
  }
  isPlaying() {
    return this.active
  }

  restore() {
    for (const b of this.bones) if (this.dirty.has(b.name)) b.bone.quaternion.copy(b.bind)
    this.dirty.clear()
  }

  // After the animator has written its pose this frame.
  update(dt) {
    if (!this.clip) return
    const clip = this.clip
    if (this.active) {
      this.time += dt
      if (!clip.loop && this.time >= clip.len) this.active = false
    }
    this.weight = this.active ? Math.min(1, this.weight + dt / BLEND) : Math.max(0, this.weight - dt / BLEND)
    if (this.weight <= 0 && !this.active) {
      this.restore()
      this.clip = null
      return
    }
    const t = clip.loop && clip.len > 0 ? this.time % clip.len : Math.min(this.time, clip.len)
    for (const b of this.bones) {
      const v = sampleTrack(clip.tracks[b.name], t)
      if (!v) continue
      this.e.set(v[0] * DEG, v[1] * DEG, v[2] * DEG, 'XYZ')
      this.q.setFromEuler(this.e)
      const target = b.bind.clone().multiply(this.q)
      if (ANIMATED.has(b.name)) b.bone.quaternion.slerp(target, this.weight)
      else {
        b.bone.quaternion.copy(b.bind).slerp(target, this.weight)
        this.dirty.add(b.name)
      }
    }
  }
}
