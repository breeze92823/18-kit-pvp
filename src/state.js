// The player's progress: gold, level/XP, stats, owned kits/looks, hotbar items and the
// daily-reward streak. It is NEVER kept in the browser: the game server's database is the only
// save (sync.js sends every change; the server's `progress` replaces this state on joining). A
// guest, or a session the server could not reach, keeps its progress in memory for the page only.
// Change listeners drive the HUD.
import { DAILY_REWARD, KITS, STARTER, kitOfTheDay, rentPrice, utcDay, xpForLevel } from './config.js'

const DAY = 24 * 3600 * 1000

// A brand-new save starts with STARTER Gold + golden apples (hydrate() lays a real save over it).
const fresh = () => ({
  gold: STARTER.gold,
  level: 1,
  xp: 0,
  kills: 0,
  killstreak: 0,
  playtime: 0, // seconds
  kits: KITS.filter((k) => k.price === 0).map((k) => k.id),
  kit: 'swordsman',
  looks: ['none'],
  look: 'none',
  hotbar: [{ id: 'sword', count: 1 }, STARTER.apples ? { id: 'apple', count: STARTER.apples } : null, null, null, null, null, null, null, null],
  selected: 0,
  daily: { last: 0, streak: 0 },
  seen: { shop: false },
  settings: { sfx: 0.8, ambience: 0.6, scoreboard: true },
  mastery: {}, // kit id -> kills with it (config MASTERY)
  // a kit you do not own, for your next arena life: { id, kind: 'trial' | 'rent', paid } (KIT_TRIAL)
  borrow: null,
  trialDay: 0, // the UTC day you last used the Kit of the Day trial
})

export const state = fresh()
const listeners = new Set()
// Old saves: the first free kit was 'knight' (now 'swordsman'); drop kits that no
// longer exist and always own the free ones.
function migrate(s) {
  const ids = new Set(KITS.map((k) => k.id))
  s.kits = s.kits.map((id) => (id === 'knight' ? 'swordsman' : id)).filter((id) => ids.has(id))
  for (const k of KITS) if (k.price === 0 && !s.kits.includes(k.id)) s.kits.push(k.id)
  s.kits = [...new Set(s.kits)]
  if (s.kit === 'knight' || !s.kits.includes(s.kit)) s.kit = 'swordsman'
  if (!s.mastery || typeof s.mastery !== 'object') s.mastery = {}
  if (s.borrow && (!ids.has(s.borrow.id) || s.kits.includes(s.borrow.id))) s.borrow = null
  return s
}

// --- the kit you fight with: a borrowed one (Kit of the Day / rental) beats your equipped kit ---
export const activeKitId = () => state.borrow?.id ?? state.kit
export const activeKit = () => KITS.find((k) => k.id === activeKitId()) ?? KITS[0]
export const trialAvailable = (now = Date.now()) => state.trialDay !== utcDay(now)
// Borrow `id` for your next arena life. kind 'trial' = today's free Kit of the Day, 'rent' = pay
// rentPrice. Returns '' when done, else why not ('owned' | 'busy' | 'used' | 'gold').
export function borrowKit(id, kind) {
  const k = KITS.find((x) => x.id === id)
  if (!k || state.kits.includes(id)) return 'owned'
  if (state.borrow?.used) return 'busy'
  returnBorrowed()
  if (kind === 'trial') {
    if (kitOfTheDay().id !== id || !trialAvailable()) return 'used'
    state.trialDay = utcDay()
    state.borrow = { id, kind, paid: 0 }
  } else {
    const price = rentPrice(k)
    if (state.gold < price) return 'gold'
    state.gold -= price
    state.borrow = { id, kind: 'rent', paid: price }
  }
  changed()
  return ''
}
// Give a borrowed kit back before using it (a rental is refunded, a trial comes back for today).
export function returnBorrowed() {
  const b = state.borrow
  if (!b) return
  if (b.used) return // already fighting with it: it lasts until that life ends
  if (b.kind === 'rent') state.gold += b.paid ?? 0
  else if (b.kind === 'trial' && state.trialDay === utcDay()) state.trialDay = 0
  state.borrow = null
  changed()
}
// The life with the borrowed kit is over (death in the arena, or back to the lobby after landing).
export function endBorrow() {
  if (!state.borrow) return null
  const b = state.borrow
  state.borrow = null
  changed()
  return b
}
export function addMastery(kitId) {
  state.mastery[kitId] = (state.mastery[kitId] ?? 0) + 1
}

// --- server saves (sync.js) ----------------------------------------------------------------
// What travels to the server (backend kitStore.ts sanitizeKitSave): the progress and the
// player's settings (volumes, scoreboard), all of it saved server-side.
export function snapshot() {
  return JSON.parse(JSON.stringify(state))
}
// The account's save replaces the in-memory progress (settings missing from an old save keep
// their current values).
export function hydrate(save) {
  const keep = state.settings
  const next = migrate({ ...fresh(), ...save })
  for (const k of Object.keys(state)) delete state[k]
  Object.assign(state, next, { settings: { ...keep, ...(save.settings ?? {}) } })
  changed()
}

export function onChange(fn) {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}
export function changed() {
  for (const fn of listeners) fn(state)
}

export function spend(amount) {
  if (state.gold < amount) return false
  state.gold -= amount
  changed()
  return true
}
export function addGold(n) {
  state.gold += n
  changed()
}
// Returns how many levels were gained.
export function addXp(n) {
  state.xp += n
  let ups = 0
  while (state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level)
    state.level++
    ups++
  }
  changed()
  return ups
}

// Puts an item in the first stack of the same id, else the first empty slot. false = full.
export function giveItem(id, count = 1) {
  const slots = state.hotbar
  const stack = slots.find((s) => s && s.id === id)
  if (stack) stack.count += count
  else {
    const i = slots.findIndex((s) => !s)
    if (i < 0) return false
    slots[i] = { id, count }
  }
  changed()
  return true
}

// Daily reward: one claim per 20 h; the streak resets after 48 h without one.
export function dailyStatus(now = Date.now()) {
  const { last, streak } = state.daily
  const since = now - last
  const ready = !last || since >= DAY * (20 / 24)
  const broken = last && since > DAY * 2
  const day = broken ? 0 : ready ? streak % DAILY_REWARD.length : (streak - 1 + DAILY_REWARD.length) % DAILY_REWARD.length
  return { ready, day, wait: ready ? 0 : DAY * (20 / 24) - since, amount: DAILY_REWARD[day] }
}
export function claimDaily() {
  const s = dailyStatus()
  if (!s.ready) return 0
  state.daily = { last: Date.now(), streak: s.day + 1 }
  state.gold += s.amount
  changed()
  return s.amount
}
