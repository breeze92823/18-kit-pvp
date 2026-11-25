// The local save: gold, level/XP, stats, owned kits/looks, hotbar items and
// the daily-reward streak. Kept in localStorage (wrapped: storage can be
// blocked) until the backend save is rebuilt. Change listeners drive the HUD.
import { DAILY_REWARD, KITS, xpForLevel } from './config.js'

const KEY = 'kitpvp-save-v1'
const DAY = 24 * 3600 * 1000

const fresh = () => ({
  gold: 0,
  level: 1,
  xp: 0,
  kills: 0,
  killstreak: 0,
  playtime: 0, // seconds
  kits: KITS.filter((k) => k.price === 0).map((k) => k.id),
  kit: 'knight',
  looks: ['none'],
  look: 'none',
  hotbar: [{ id: 'sword', count: 1 }, null, null, null, null, null, null, null, null],
  selected: 0,
  daily: { last: 0, streak: 0 },
  seen: { shop: false },
  settings: { sfx: 0.8, ambience: 0.6, scoreboard: true },
})

export const state = load()
const listeners = new Set()

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...fresh(), ...JSON.parse(raw) }
  } catch {
    // storage blocked: play with an in-memory save
  }
  return fresh()
}

let saveTimer = 0
export function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // ignore
    }
  }, 200)
}

export function onChange(fn) {
  listeners.add(fn)
  fn(state)
  return () => listeners.delete(fn)
}
export function changed() {
  for (const fn of listeners) fn(state)
  save()
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
