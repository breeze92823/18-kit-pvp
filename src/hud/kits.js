// The full-screen Kits screen (K / the kits button / the Kit NPC):
//  - left: the "Kits" list panel (pink title bar, Sort by dropdown, a scrolling
//    column of kit buttons; locked kits show a padlock, the level they need and
//    their Gold price),
//  - centre/right: a live 3D duel wearing the previewed kit (kitpreview.js,
//    drawn by main.js through `render`),
//  - top right: "Exit" + the X button, with your level and Gold under it,
//  - bottom: the info box (name, description, armor) with the Equip / Buy button.
// Clicking a row previews that kit; the info box button equips or buys it.
// Kits need the player level AND Gold. Never premium currency (CLAUDE.md).
// Borrowing (KIT_TRIAL): a kit you do not own can be played for one arena life, free once a day
// for the Kit of the Day (the strip above the list), else rented for Gold. Owned kits show their
// mastery medal (MASTERY) and the info box its progress toward the next tier.
import './kits.css'
import { KITS, KIT_POWERS, MASTERY, ULTIMATE, kitOfTheDay, masteryTier, rentPrice, utcDay } from '../config.js'
import { ART, artURL } from '../lobby/pixelart.js'
import { borrowKit, changed, returnBorrowed, spend, state, trialAvailable } from '../state.js'
import * as sfx from '../audio.js'
import { createKitPreview } from './kitpreview.js'
import { abilityInfo } from '../arena/abilities.js'
import { weaponFor } from '../arena/weapons.js'

const SORTS = [
  ['default', 'Default'],
  ['name', 'Name'],
  ['price', 'Price'],
  ['owned', 'Owned'],
]
const fmt = (n) => n.toLocaleString('en-US')
const darken = (hex, k) => {
  const n = parseInt(hex.slice(1), 16)
  const f = (v) => Math.round(v * k)
  return `#${((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1)}`
}
// a padlock tinted with the kit's colour (locked rows)
function lockIcon(kit) {
  const name = `lock_${kit.id}`
  if (!ART[name]) ART[name] = { rows: ART.lock.rows, pal: { ...ART.lock.pal, k: kit.color, K: darken(kit.color, 0.5) } }
  return artURL(name, 4)
}

export function createKitsScreen({ root, icon, toast, onOpenChange }) {
  const el = (tag, cls, html) => {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (html !== undefined) e.innerHTML = html
    return e
  }
  const scr = el('div', 'kits-screen')
  scr.innerHTML = `
    <div class="kits-panel">
      <div class="kits-title">${icon}<span>Kits</span></div>
      <div class="kits-sort"><label for="kits-sort">Sort by:</label><div class="kits-select"><select id="kits-sort">${SORTS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select><span class="arr"></span></div></div>
      <button class="kits-today" type="button"></button>
      <div class="kits-list"></div>
    </div>
    <div class="kits-exit"><button class="kits-word" type="button">Exit</button><button class="kits-x" type="button" aria-label="Close"><span></span></button></div>
    <div class="kits-wallet"></div>
    <div class="kits-info"><h3></h3><p></p><div class="meta"></div><div class="powers"></div><div class="mastery"></div><div class="kits-btns"><button class="kits-btn main" type="button"></button><button class="kits-btn alt" type="button"></button></div></div>`
  root.appendChild(scr)
  const panel = scr.querySelector('.kits-panel')
  const list = scr.querySelector('.kits-list')
  const select = scr.querySelector('select')
  const info = scr.querySelector('.kits-info')
  const wallet = scr.querySelector('.kits-wallet')
  const btn = scr.querySelector('.kits-btn.main')
  const alt = scr.querySelector('.kits-btn.alt')
  const today = scr.querySelector('.kits-today')
  today.addEventListener('click', () => {
    sfx.uiClick()
    view(kitOfTheDay().id)
    rows.get(viewing)?.scrollIntoView({ block: 'nearest' })
  })
  alt.addEventListener('click', () => borrow())

  let isOpen = false
  let viewing = state.kit
  let preview = null
  let lastSig = ''
  const rows = new Map()

  // keep game input (pointer lock, camera zoom) off the screen
  scr.addEventListener('pointerdown', (e) => e.stopPropagation())
  scr.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })
  for (const b of scr.querySelectorAll('.kits-word, .kits-x')) {
    b.addEventListener('click', () => close())
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && sfx.uiHover())
  }
  select.addEventListener('change', () => {
    sfx.uiClick()
    renderList()
  })
  btn.addEventListener('click', () => act())

  const kitOf = (id) => KITS.find((k) => k.id === id) ?? KITS[0]

  function sorted() {
    const ks = [...KITS]
    const owned = (k) => state.kits.includes(k.id)
    switch (select.value) {
      case 'name':
        return ks.sort((a, b) => a.name.localeCompare(b.name))
      case 'price':
        return ks.sort((a, b) => b.price - a.price || b.level - a.level)
      case 'owned':
        return ks.sort((a, b) => owned(b) - owned(a))
      default:
        return ks
    }
  }

  const tierOf = (id) => masteryTier(state.mastery?.[id] ?? 0)
  const borrowedId = () => state.borrow?.id ?? null
  // the kit you would fight with now: a borrowed one, else the equipped one
  const fightingWith = (id) => (state.borrow ? state.borrow.id === id : state.kit === id)

  function renderToday() {
    const k = kitOfTheDay()
    const owned = state.kits.includes(k.id)
    const free = trialAvailable()
    const next = new Date((utcDay() + 1) * 86400000)
    const hours = Math.max(1, Math.ceil((next - Date.now()) / 3600000))
    const sub = owned ? 'You own it already!' : borrowedId() === k.id ? 'Borrowed for your next life' : free ? 'Free to try for one life today' : `Tried today: a new kit in ${hours}h`
    today.innerHTML = `<img src="${artURL(k.icon, 4)}" alt=""><span class="t"><span class="h">Kit of the Day</span><b>${k.name}</b><small>${sub}</small></span>`
    today.classList.toggle('free', free && !owned && borrowedId() !== k.id)
  }

  function renderList() {
    const keep = list.scrollTop
    list.innerHTML = ''
    rows.clear()
    const todayId = kitOfTheDay().id
    for (const k of sorted()) {
      const owned = state.kits.includes(k.id)
      const r = el('button', `kit-row ${owned ? 'owned' : 'locked'}`)
      r.type = 'button'
      const lvOk = state.level >= k.level
      const goldOk = state.gold >= k.price
      const tier = tierOf(k.id)
      const T = tier ? MASTERY.tiers[tier - 1] : null
      const medal = T ? `<span class="mst" style="--mc:${T.color}" title="${T.name} mastery">${'★'.repeat(tier)}</span>` : ''
      const badge = borrowedId() === k.id ? '<span class="badge borrow">BORROWED</span>' : k.id === todayId && !owned ? '<span class="badge today">TODAY</span>' : ''
      r.innerHTML = owned
        ? `<img class="ic" src="${artURL(k.icon, 4)}" alt=""><span class="tx"><span class="nm">${k.name}</span>${medal}</span>${badge}`
        : `<img class="ic" src="${lockIcon(k)}" alt=""><span class="tx"><span class="nm">${k.name}</span><span class="req"><span class="lv ${lvOk ? 'ok' : 'no'}">Level ${k.level}</span><img src="${artURL('coin', 4)}" alt=""><span class="pr ${goldOk ? 'ok' : 'no'}">${fmt(k.price)}</span></span></span>${badge}`
      r.classList.toggle('equipped', fightingWith(k.id))
      r.classList.toggle('viewing', viewing === k.id)
      r.addEventListener('click', () => view(k.id))
      r.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && sfx.uiHover())
      list.appendChild(r)
      rows.set(k.id, r)
    }
    list.scrollTop = keep
  }

  function renderInfo() {
    const k = kitOf(viewing)
    const owned = state.kits.includes(k.id)
    info.querySelector('h3').textContent = `${k.name} Kit`
    info.querySelector('p').textContent = k.desc
    info.querySelector('.meta').innerHTML = `<span><img src="${artURL('armor', 3)}" alt="">Armor ${k.armor}/20</span><span><img src="${artURL(k.icon, 2)}" alt="">${k.armorSet[0].toUpperCase()}${k.armorSet.slice(1)} set</span>`
    // what F and Q do with this kit
    const P = KIT_POWERS[k.id] ?? {}
    const w = weaponFor(k)
    const fKey = P.shield ? 'Shield (hold)' : P.ability ? abilityInfo(P.ability)[0] : null
    const U = ULTIMATE[w.type] ?? ULTIMATE.sword
    info.querySelector('.powers').innerHTML = `${fKey ? `<span><kbd>F</kbd>${fKey}</span>` : '<span class="pas">Passive kit</span>'}<span><kbd>Q</kbd>${U.name}</span>`
    // mastery: tier medal + kills toward the next tier
    const kills = state.mastery?.[k.id] ?? 0
    const tier = tierOf(k.id)
    const nextT = MASTERY.tiers[tier]
    const curT = tier ? MASTERY.tiers[tier - 1] : null
    const from = curT?.kills ?? 0
    const pct = nextT ? Math.min(100, ((kills - from) / (nextT.kills - from)) * 100) : 100
    const mEl = info.querySelector('.mastery')
    mEl.style.setProperty('--mc', (curT ?? nextT).color)
    mEl.innerHTML = `<span class="lbl">${curT ? `<b>${curT.name}</b> mastery` : 'Mastery'}</span><span class="bar"><i style="width:${pct}%"></i></span><span class="num">${nextT ? `${kills}/${nextT.kills} kills → ${nextT.name}: +${nextT.gold} Gold/kill, ${nextT.perk.toLowerCase()}` : `${kills} kills · max tier`}</span>`
    btn.className = 'kits-btn main'
    if (fightingWith(k.id) && owned) {
      btn.textContent = 'Equipped'
      btn.classList.add('on')
    } else if (owned) {
      btn.textContent = state.kit === k.id ? 'Use it' : 'Equip'
      btn.classList.add('go')
    } else if (state.level < k.level) {
      btn.textContent = `Reach Level ${k.level}`
      btn.classList.add('off')
    } else {
      btn.innerHTML = `Buy <img src="${artURL('coin', 4)}" alt="">${fmt(k.price)}`
      btn.classList.add('buy')
      if (state.gold < k.price) btn.classList.add('poor')
    }
    // borrow it for one life: today's kit is free (once a day), any other is rented for Gold
    alt.className = 'kits-btn alt'
    alt.style.display = owned ? 'none' : ''
    if (!owned) {
      const isToday = kitOfTheDay().id === k.id
      if (borrowedId() === k.id) {
        alt.textContent = state.borrow.used ? 'In use this life' : state.borrow.kind === 'rent' ? 'Rented · tap to refund' : 'Trial ready · tap to undo'
        alt.classList.add(state.borrow.used ? 'off' : 'on')
      } else if (isToday && trialAvailable()) {
        alt.textContent = 'Try free today'
        alt.classList.add('go', 'free')
      } else {
        const price = rentPrice(k)
        alt.innerHTML = `Rent 1 life <img src="${artURL('coin', 4)}" alt="">${fmt(price)}`
        alt.classList.add('rent')
        if (state.gold < price) alt.classList.add('poor')
      }
    }
    wallet.innerHTML = `<span class="lv">Level ${state.level}</span><span class="g"><img src="${artURL('coin', 4)}" alt="">${fmt(state.gold)}</span>`
    renderToday()
  }

  function borrow() {
    const k = kitOf(viewing)
    if (state.kits.includes(k.id)) return
    if (borrowedId() === k.id) {
      if (state.borrow.used) return sfx.deny()
      returnBorrowed()
      sfx.uiClick()
      toast(state.borrow ? '' : `${k.name}: ${kitOfTheDay().id === k.id ? 'trial undone' : 'rental refunded'}`, 'good')
    } else {
      const isToday = kitOfTheDay().id === k.id && trialAvailable()
      const why = borrowKit(k.id, isToday ? 'trial' : 'rent')
      if (why === 'gold') {
        sfx.deny()
        return toast(`Not enough Gold to rent the ${k.name} kit (${fmt(rentPrice(k))}).`, 'bad')
      }
      if (why === 'busy') {
        sfx.deny()
        return toast('You are still fighting with a borrowed kit. Finish that life first!', 'bad')
      }
      if (why) return sfx.deny()
      sfx.purchase()
      toast(`${k.name} kit ready for your next life in the arena!`, 'good')
    }
    renderList()
    renderInfo()
  }

  function view(id) {
    if (id !== viewing) sfx.uiTab()
    viewing = id
    for (const [kid, r] of rows) r.classList.toggle('viewing', kid === id)
    preview?.setKit(kitOf(id))
    renderInfo()
  }

  function act() {
    const k = kitOf(viewing)
    if (fightingWith(k.id) && state.kits.includes(k.id)) return sfx.uiClick()
    if (state.kits.includes(k.id)) {
      // picking one of your own kits gives back a borrowed kit you have not used yet
      if (state.borrow && !state.borrow.used) returnBorrowed()
      state.kit = k.id
      changed()
      sfx.equip()
      toast(state.borrow?.used ? `${k.name} kit equipped for your next life` : `${k.name} kit equipped`, 'good')
    } else if (state.level < k.level) {
      sfx.deny()
      return toast(`The ${k.name} kit unlocks at Level ${k.level}. You are Level ${state.level}.`, 'bad')
    } else if (spend(k.price)) {
      if (borrowedId() === k.id && !state.borrow.used) returnBorrowed() // bought what you had rented: refund it
      state.kits.push(k.id)
      state.kit = k.id
      changed()
      sfx.purchase()
      toast(`Unlocked the ${k.name} kit!`, 'good')
    } else {
      sfx.deny()
      return toast(`Not enough Gold — you need ${fmt(k.price - state.gold)} more. Earn Gold in the arena!`, 'bad')
    }
    renderList()
    renderInfo()
  }

  function open() {
    if (isOpen) return
    isOpen = true
    viewing = state.borrow?.id ?? state.kit
    renderList()
    renderInfo()
    preview?.setKit(kitOf(viewing))
    scr.classList.add('on')
    document.body.classList.add('kits-open')
    onOpenChange?.(true)
    requestAnimationFrame(() => rows.get(viewing)?.scrollIntoView({ block: 'nearest' }))
  }
  function close() {
    if (!isOpen) return false
    isOpen = false
    scr.classList.remove('on')
    document.body.classList.remove('kits-open')
    onOpenChange?.(false)
    return true
  }

  // Where the fighters go: centred in the free area right of the list (below
  // it in portrait) and above the info box.
  function viewRect() {
    const W = window.innerWidth
    const H = window.innerHeight
    const p = panel.getBoundingClientRect()
    const i = info.getBoundingClientRect()
    const portrait = H > W * 1.15
    const onRight = p.left > W / 2 // short landscape phones: list on the right
    const left = portrait || onRight ? 0 : p.right
    const right = onRight ? p.left : W
    const top = portrait || onRight ? 0 : Math.max(0, p.top)
    const bottom = Math.max(top + 80, portrait ? Math.min(i.top, p.top) : i.top)
    const pw = right - left
    const ph = bottom - top
    return { cx: left + pw / 2, cy: top + ph * (portrait || onRight ? 0.6 : 0.62), pw: pw * 0.92, ph }
  }

  return {
    open,
    close,
    isOpen: () => isOpen,
    // state changed: rebuild the rows only when something they show changed
    refresh() {
      if (!isOpen) return
      const sig = `${state.gold}|${state.level}|${state.kit}|${state.kits.length}|${state.borrow?.id ?? ''}|${state.borrow?.used ?? ''}|${state.trialDay}`
      if (sig !== lastSig) renderList()
      lastSig = sig
      renderInfo()
    },
    // called by main.js instead of the game render while open
    render(renderer, dt) {
      if (!preview) {
        preview = createKitPreview(renderer)
        preview.setKit(kitOf(viewing))
      }
      preview.render(dt, viewRect())
    },
  }
}
