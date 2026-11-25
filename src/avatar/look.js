// A player's Bloxity look as it travels to the others: JSON { e: equipped ids, p: proportions }.
// The server never parses it (backend `setAvatar` / roster `avatar`, only length-capped), so every
// receiving client validates it here before anything is loaded: only known id fields, ids shaped
// like the ones the avatar CDN uses (an ObjectId hex or a short number, '-1' = nothing), and
// proportions clamped to the SDK's ranges. An id that fails the check is dropped, so nothing
// unvalidated ever ends up in a URL (avatar/cdn.js builds those from these ids).
import { PROPORTIONS } from '../config.js'

// Every slot SDK.avatar.getEquipped() can carry (characterId is a custom character: not drawn).
export const LOOK_FIELDS = [
  'hatId',
  'backId',
  'skinId',
  'headId',
  'armLId',
  'armRId',
  'legLId',
  'legRId',
  'torsoId',
  'hairId',
  'maskId',
  'neckId',
  'chestId',
  'waistId',
  'handId',
  'shoesId',
  'faceId',
  'pantsId',
  'shirtId',
]
const ID = /^(?:-1|[0-9]{1,8}|[0-9a-fA-F]{24})$/
const MAX_LEN = 3000 // the server's AVATAR_MAX_LEN

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// -> the JSON string to send, '' when there is nothing to show (guest / stock rig).
export function serializeLook(equipped, proportions) {
  const e = {}
  if (equipped && typeof equipped === 'object') {
    for (const key of LOOK_FIELDS) {
      const v = equipped[key]
      if (v == null) continue
      const s = String(v)
      if (ID.test(s) && s !== '-1') e[key] = s
    }
  }
  const p = {}
  if (proportions && typeof proportions === 'object') {
    for (const key of Object.keys(PROPORTIONS)) {
      const n = Number(proportions[key])
      if (Number.isFinite(n) && n !== PROPORTIONS[key].def) p[key] = Math.round(clamp(n, PROPORTIONS[key].min, PROPORTIONS[key].max) * 1000) / 1000
    }
  }
  if (!Object.keys(e).length && !Object.keys(p).length) return ''
  const out = JSON.stringify({ e, p })
  return out.length <= MAX_LEN ? out : ''
}

// -> { e, p, key } validated, or null for '' / garbage (= the stock rig). `key` is canonical, so
// two looks that draw the same compare equal.
export function parseLook(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_LEN) return null
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const e = {}
  if (data.e && typeof data.e === 'object') {
    for (const key of LOOK_FIELDS) {
      const v = data.e[key]
      if (typeof v !== 'string' && typeof v !== 'number') continue
      const s = String(v)
      if (ID.test(s) && s !== '-1') e[key] = s
    }
  }
  const p = {}
  if (data.p && typeof data.p === 'object') {
    for (const key of Object.keys(PROPORTIONS)) {
      const n = Number(data.p[key])
      if (Number.isFinite(n)) p[key] = clamp(n, PROPORTIONS[key].min, PROPORTIONS[key].max)
    }
  }
  if (!Object.keys(e).length && !Object.keys(p).length) return null
  return { e, p, key: JSON.stringify([LOOK_FIELDS.map((k) => e[k] ?? ''), Object.keys(PROPORTIONS).map((k) => p[k] ?? PROPORTIONS[k].def)]) }
}
