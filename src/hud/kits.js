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
import './kits.css'
import { KITS } from '../config.js'
import { ART, artURL } from '../lobby/pixelart.js'
import { changed, spend, state } from '../state.js'
import * as sfx from '../audio.js'
import { createKitPreview } from './kitpreview.js'

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
      <div class="kits-list"></div>
    </div>
    <div class="kits-exit"><button class="kits-word" type="button">Exit</button><button class="kits-x" type="button" aria-label="Close"><span></span></button></div>
    <div class="kits-wallet"></div>
    <div class="kits-info"><h3></h3><p></p><div class="meta"></div><button class="kits-btn" type="button"></button></div>`
  root.appendChild(scr)
  const panel = scr.querySelector('.kits-panel')
  const list = scr.querySelector('.kits-list')
  const select = scr.querySelector('select')
  const info = scr.querySelector('.kits-info')
  const wallet = scr.querySelector('.kits-wallet')
  const btn = scr.querySelector('.kits-btn')

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

  function renderList() {
    const keep = list.scrollTop
    list.innerHTML = ''
    rows.clear()
    for (const k of sorted()) {
      const owned = state.kits.includes(k.id)
      const r = el('button', `kit-row ${owned ? 'owned' : 'locked'}`)
      r.type = 'button'
      const lvOk = state.level >= k.level
      const goldOk = state.gold >= k.price
      r.innerHTML = owned
        ? `<img class="ic" src="${artURL(k.icon, 4)}" alt=""><span class="tx"><span class="nm">${k.name}</span></span>`
        : `<img class="ic" src="${lockIcon(k)}" alt=""><span class="tx"><span class="nm">${k.name}</span><span class="req"><span class="lv ${lvOk ? 'ok' : 'no'}">Level ${k.level}</span><img src="${artURL('coin', 4)}" alt=""><span class="pr ${goldOk ? 'ok' : 'no'}">${fmt(k.price)}</span></span></span>`
      r.classList.toggle('equipped', state.kit === k.id)
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
    btn.className = 'kits-btn'
    if (state.kit === k.id) {
      btn.textContent = 'Equipped'
      btn.classList.add('on')
    } else if (owned) {
      btn.textContent = 'Equip'
      btn.classList.add('go')
    } else if (state.level < k.level) {
      btn.textContent = `Reach Level ${k.level}`
      btn.classList.add('off')
    } else {
      btn.innerHTML = `Buy <img src="${artURL('coin', 4)}" alt="">${fmt(k.price)}`
      btn.classList.add('buy')
      if (state.gold < k.price) btn.classList.add('poor')
    }
    wallet.innerHTML = `<span class="lv">Level ${state.level}</span><span class="g"><img src="${artURL('coin', 4)}" alt="">${fmt(state.gold)}</span>`
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
    if (state.kit === k.id) return sfx.uiClick()
    if (state.kits.includes(k.id)) {
      state.kit = k.id
      changed()
      sfx.equip()
      toast(`${k.name} kit equipped`, 'good')
    } else if (state.level < k.level) {
      sfx.deny()
      return toast(`The ${k.name} kit unlocks at Level ${k.level}. You are Level ${state.level}.`, 'bad')
    } else if (spend(k.price)) {
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
    viewing = state.kit
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
      const sig = `${state.gold}|${state.level}|${state.kit}|${state.kits.length}`
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
