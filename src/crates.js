// Crate loot: what each crate can give and the roll itself. Prices live in
// CRATES (config.js) and are paid in Gold only.
import { KITS, LOOKS, SHOP_ITEMS } from './config.js'
import { state } from './state.js'

const LOOT = {
  normal: [
    { w: 46, type: 'gold', min: 80, max: 380, icon: 'coin', title: 'Gold' },
    { w: 26, type: 'xp', min: 16, max: 48, icon: 'star', title: 'XP' },
    { w: 18, type: 'item', pool: ['apple', 'potion', 'steak', 'orb'], title: 'Item' },
    { w: 10, type: 'kit', maxPrice: 1000, title: 'Kit' },
  ],
  ranked: [
    { w: 34, type: 'gold', min: 500, max: 1600, icon: 'coin', title: 'Gold' },
    { w: 16, type: 'xp', min: 60, max: 140, icon: 'star', title: 'XP' },
    { w: 26, type: 'kit', maxPrice: 99999, title: 'Kit' },
    { w: 24, type: 'look', title: 'Trail' },
  ],
}

// Preview list for the crate window: [{ icon, text }]
export function lootPreview(kind) {
  return LOOT[kind].map((l) => {
    const pct = Math.round((l.w / LOOT[kind].reduce((s, x) => s + x.w, 0)) * 100)
    if (l.type === 'gold') return { icon: 'coin', text: `${l.min}-${l.max} Gold`, pct }
    if (l.type === 'xp') return { icon: 'star', text: `${l.min}-${l.max} XP`, pct }
    if (l.type === 'item') return { icon: 'apple', text: 'Shop item', pct }
    if (l.type === 'kit') return { icon: 'sword', text: 'Kit unlock', pct }
    return { icon: 'flame', text: 'Trail unlock', pct }
  })
}

const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1))

// Rolls a reward; returns { type, amount?, id?, icon, title, sub, color }.
// Duplicate kit/trail rolls turn into Gold so a roll is never wasted.
export function roll(kind) {
  const table = LOOT[kind]
  let r = Math.random() * table.reduce((s, x) => s + x.w, 0)
  let pick = table[0]
  for (const l of table) {
    r -= l.w
    if (r <= 0) {
      pick = l
      break
    }
  }
  const gold = (n) => ({ type: 'gold', amount: n, icon: 'coin', title: `+${n.toLocaleString('en-US')} Gold`, color: '#ffd84a' })
  if (pick.type === 'gold') return gold(rint(pick.min, pick.max))
  if (pick.type === 'xp') {
    const n = rint(pick.min, pick.max)
    return { type: 'xp', amount: n, icon: 'star', title: `+${n} XP`, color: '#7cff4a' }
  }
  if (pick.type === 'item') {
    const id = pick.pool[Math.floor(Math.random() * pick.pool.length)]
    const it = SHOP_ITEMS.find((s) => s.id === id)
    return { type: 'item', id, icon: it.icon, title: it.name, color: '#3fd6ff' }
  }
  if (pick.type === 'kit') {
    const options = KITS.filter((k) => k.price > 0 && k.price <= pick.maxPrice && !state.kits.includes(k.id))
    if (!options.length) return gold(kind === 'ranked' ? 1200 : 300)
    const k = options[Math.floor(Math.random() * options.length)]
    return { type: 'kit', id: k.id, icon: k.icon, title: `${k.name} Kit!`, color: '#ff8fe0' }
  }
  const options = LOOKS.filter((l) => l.price > 0 && !state.looks.includes(l.id))
  if (!options.length) return gold(1400)
  const l = options[Math.floor(Math.random() * options.length)]
  return { type: 'look', id: l.id, icon: 'flame', title: `${l.name} Trail!`, color: l.color }
}
