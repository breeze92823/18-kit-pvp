// The player's progress: gold, level/XP, stats, owned kits/looks, hotbar items and the
// daily-reward streak. It is NEVER kept in the browser: the game server's database is the only
// save (sync.js sends every change; the server's `progress` replaces this state on joining). A
// guest, or a session the server could not reach, keeps its progress in memory for the page only.
// Change listeners drive the HUD.
import { DAILY_REWARD, KITS, STARTER, xpForLevel } from './config.js'

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
  return s
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
