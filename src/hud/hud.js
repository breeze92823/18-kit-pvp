// The HUD: left menu buttons (kits / shop / looks / reward / opts with key
// badges and "!" alerts), the right-hand scoreboard, armor / health / level /
// hunger bars, the XP bar and hotbar, crosshair, interaction prompt, the event
// feed, toasts, the reward pop-up, the arena fade and every menu window.
// It owns the menus' rules (buying with Gold, equipping, the daily streak)
// through state.js; world effects go through the `ctx` callbacks.
import './hud.css'
import { CRATES, DAILY_REWARD, KITS, LOOKS, SHOP_ITEMS, xpForLevel } from '../config.js'
import { artCanvas, artURL } from '../lobby/pixelart.js'
import { lootPreview } from '../crates.js'
import { changed, claimDaily, dailyStatus, giveItem, onChange, spend, state } from '../state.js'
import * as sfx from '../audio.js'

const ICONS = {
  kits: '<svg viewBox="0 0 64 64"><path d="M14 10h10l8 6 8-6h10l8 12-8 6v26H14V28l-8-6z" fill="#7fd8f6" stroke="#2a7aa8" stroke-width="4" stroke-linejoin="round"/><path d="M24 22v26M40 22v26" stroke="#3f9ac8" stroke-width="3"/><path d="M18 14l6 2M46 14l-6 2" stroke="#d8f6ff" stroke-width="3" stroke-linecap="round"/></svg>',
  shop: '<svg viewBox="0 0 64 64"><rect x="12" y="28" width="40" height="28" rx="3" fill="#f6e6c8" stroke="#8a5a2a" stroke-width="4"/><path d="M6 30 32 8l26 22z" fill="#e8463a" stroke="#9a2a1e" stroke-width="4" stroke-linejoin="round"/><rect x="26" y="38" width="12" height="18" fill="#8a5a2a"/><path d="M18 24l8-7M30 15l8 7" stroke="#ff8a7a" stroke-width="3" stroke-linecap="round"/></svg>',
  looks: '<svg viewBox="0 0 64 64"><path d="M32 6C16 6 6 18 6 31c0 14 12 25 25 25 5 0 7-3 5-7-2-5 1-8 6-8h7c8 0 12-5 12-11C61 16 49 6 32 6z" fill="#e8b878" stroke="#8a5a2a" stroke-width="4"/><circle cx="20" cy="26" r="5" fill="#e8463a"/><circle cx="32" cy="18" r="5" fill="#3fa0ff"/><circle cx="45" cy="24" r="5" fill="#5ac83a"/><circle cx="20" cy="40" r="5" fill="#ffcf3a"/></svg>',
  reward: '<svg viewBox="0 0 64 64"><path d="M8 20l12 12 12-20 12 20 12-12-4 30H12z" fill="#ffcf3a" stroke="#b07a10" stroke-width="4" stroke-linejoin="round"/><rect x="12" y="46" width="40" height="8" rx="2" fill="#f0b020" stroke="#b07a10" stroke-width="4"/><circle cx="32" cy="36" r="4" fill="#e8463a"/><circle cx="20" cy="40" r="3" fill="#3fa0ff"/><circle cx="44" cy="40" r="3" fill="#5ac83a"/></svg>',
  opts: '<svg viewBox="0 0 64 64"><path d="M28 4h8l2 8 6 3 7-4 6 6-4 7 3 6 8 2v8l-8 2-3 6 4 7-6 6-7-4-6 3-2 8h-8l-2-8-6-3-7 4-6-6 4-7-3-6-8-2v-8l8-2 3-6-4-7 6-6 7 4 6-3z" fill="#8a8a92" stroke="#4a4a52" stroke-width="3" stroke-linejoin="round"/><circle cx="32" cy="32" r="9" fill="#d8d8de" stroke="#4a4a52" stroke-width="3"/></svg>',
}
const BTN = [
  { id: 'kits', key: 'K', label: 'kits', c: '#f4a0b8', d: '#d9708e', t: '#c95a7e' },
  { id: 'shop', key: 'B', label: 'shop', c: '#ffd96a', d: '#e0ae2a', t: '#d0962a' },
  { id: 'looks', key: 'M', label: 'looks', c: '#e3a6f0', d: '#b872cc', t: '#a85cbc' },
  { id: 'reward', key: 'L', label: 'reward', c: '#a8e88a', d: '#6cbc4a', t: '#4a9c2e' },
  { id: 'opts', key: 'O', label: 'opts', c: '#e8e8ea', d: '#b4b4ba', t: '#9a9aa2' },
]
const PANEL_COLORS = {
  kits: ['#f4a0b8', '#d9708e'],
  shop: ['#ffcf4a', '#d9a020'],
  looks: ['#d896ec', '#a85cbc'],
  reward: ['#8fdc6a', '#5aa83a'],
  opts: ['#a6a6b0', '#74747e'],
  crate: ['#ffb31a', '#c98400'],
  ranked: ['#d36bff', '#8a2ab8'],
  duels: ['#4a8aff', '#2a5ac0'],
}

const el = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html !== undefined) e.innerHTML = html
  return e
}
const fmt = (n) => n.toLocaleString('en-US')
// left half full armor, right half empty (odd armor points)
let halfURL = null
function halfArmor() {
  if (halfURL) return halfURL
  const c = document.createElement('canvas')
  c.width = c.height = 18
  const ctx = c.getContext('2d')
  const full = artCanvas('armor', 2)
  const empty = artCanvas('armor_empty', 2)
  ctx.drawImage(empty, 0, 0)
  ctx.drawImage(full, 0, 0, 10, 18, 0, 0, 10, 18)
  halfURL = c.toDataURL()
  return halfURL
}
const coinImg = () => `<img src="${artURL('coin', 4)}" alt="">`

export function createHud(ctx) {
  const root = el('div')
  root.id = 'hud'
  document.body.appendChild(root)

  // --- crosshair ---
  const cross = el('div', 'hud-cross')
  root.appendChild(cross)

  // --- menu buttons ---
  const menu = el('div', 'hud-menu')
  const btns = {}
  for (const b of BTN) {
    const e = el('button', `hud-btn ${b.id}`, `${ICONS[b.id]}<span class="lbl">${b.label}</span><span class="key">${b.key}</span><span class="alert">!</span>`)
    e.type = 'button'
    e.style.setProperty('--c', b.c)
    e.style.setProperty('--d', b.d)
    e.style.setProperty('--t', b.t)
    e.addEventListener('pointerdown', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      togglePanel(b.id)
    })
    e.addEventListener('pointerenter', (ev) => ev.pointerType === 'mouse' && sfx.uiHover())
    menu.appendChild(e)
    btns[b.id] = e
  }
  root.appendChild(menu)

  // --- scoreboard ---
  const board = el('div', 'hud-board hud-outline')
  root.appendChild(board)
  function renderBoard() {
    const need = xpForLevel(state.level)
    const filled = Math.round((state.xp / need) * 10)
    const bar = `<span class="c">${'■'.repeat(filled)}</span><span>${'■'.repeat(10 - filled)}</span>`
    const mins = Math.floor(state.playtime / 60)
    const play = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
    const rows = [
      [`<span class="y">Your Level:</span> [${state.level}★]`, 10],
      [`Progress: <span class="c">${state.xp}</span>/<span class="c">${need}</span>`, 9],
      [`[<span class="bar">${bar}</span>]`, 8],
      ['&nbsp;', 7],
      [`Gold: <span class="y">${fmt(state.gold)}g</span>`, 6],
      [`Kills: <span class="r">${state.kills}</span>`, 5],
      [`Killstreak: <span class="g">${state.killstreak}</span>`, 4],
      [`Playtime: <span class="y">${play}</span>`, 3],
      ['&nbsp;', 2],
      [`<span class="y">Status: </span><span class="g">Not in combat</span>`, 1],
    ]
    board.innerHTML = `<div class="title">Kit PvP</div>${rows.map(([h, n]) => `<div class="row"><span>${h}</span><span class="n">${n}</span></div>`).join('')}`
    board.classList.toggle('hidden', !state.settings.scoreboard)
  }

  // --- bottom: bars + hotbar ---
  const bottom = el('div', 'hud-bottom')
  const stats = el('div', 'hud-stats')
  const leftCol = el('div')
  const armor = el('div', 'hud-icons armor')
  const hearts = el('div', 'hud-icons hud-hearts')
  leftCol.append(armor, hearts)
  const level = el('div', 'hud-level', '1')
  const food = el('div', 'hud-icons right')
  stats.append(leftCol, level, food)
  const xpBar = el('div', 'hud-xp', '<div></div>')
  const hot = el('div', 'hud-hotbar')
  const itemName = el('div', 'hud-itemname hud-outline')
  bottom.append(stats, xpBar, hot, itemName)
  bottom.style.position = 'absolute'
  root.appendChild(bottom)

  const icon = (name, n) => `<i style="background-image:url(${artURL(name, 2)})"></i>`.repeat(n)
  for (let i = 0; i < 10; i++) hearts.insertAdjacentHTML('beforeend', icon('heart', 1))
  food.innerHTML = icon('food', 10)
  function renderBars() {
    const kit = KITS.find((k) => k.id === state.kit) ?? KITS[0]
    const full = Math.floor(kit.armor / 2)
    const half = kit.armor % 2
    let h = ''
    for (let i = 0; i < 10; i++) h += i < full ? icon('armor', 1) : i === full && half ? `<i style="background-image:url(${halfArmor()})"></i>` : icon('armor_empty', 1)
    armor.innerHTML = h
    level.textContent = state.level
    xpBar.firstChild.style.width = `${(state.xp / xpForLevel(state.level)) * 100}%`
  }
  const slots = []
  for (let i = 0; i < 9; i++) {
    const s = el('div', 'hud-slot')
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      selectSlot(i)
    })
    hot.appendChild(s)
    slots.push(s)
  }
  const itemIcon = (id) => (id === 'sword' ? 'sword' : SHOP_ITEMS.find((s) => s.id === id)?.icon ?? id)
  const itemTitle = (id) => (id === 'sword' ? 'Iron Sword' : SHOP_ITEMS.find((s) => s.id === id)?.name ?? id)
  function renderHotbar() {
    state.hotbar.forEach((it, i) => {
      slots[i].innerHTML = it ? `<img src="${artURL(itemIcon(it.id), 4)}" alt=""><span class="cnt hud-outline">${it.count > 1 ? it.count : ''}</span>` : ''
      slots[i].classList.toggle('sel', i === state.selected)
    })
  }
  let nameTimer = 0
  function selectSlot(i) {
    if (i === state.selected) return
    state.selected = i
    changed()
    sfx.hotbar()
    const it = state.hotbar[i]
    itemName.textContent = it ? itemTitle(it.id) : ''
    itemName.classList.add('show')
    clearTimeout(nameTimer)
    nameTimer = setTimeout(() => itemName.classList.remove('show'), 1400)
    ctx.onSlot?.(it ? itemIcon(it.id) : null)
  }

  // --- prompt ---
  const prompt = el('div', 'hud-prompt')
  root.appendChild(prompt)
  let promptTap = null
  prompt.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    promptTap?.()
  })
  let promptText = null
  function setPrompt(text, onTap) {
    promptTap = onTap
    if (text === promptText) return
    promptText = text
    if (text) {
      const touch = root.classList.contains('touch')
      prompt.innerHTML = touch ? `<kbd>TAP</kbd> ${text}` : `<kbd>E</kbd> ${text}`
    }
    prompt.classList.toggle('show', !!text)
    cross.classList.toggle('target', !!text)
  }

  // --- feed ---
  const feedEl = el('div', 'hud-feed hud-outline')
  root.appendChild(feedEl)
  function feed(html) {
    const line = el('div', '', html)
    feedEl.appendChild(line)
    while (feedEl.children.length > 5) feedEl.firstChild.remove()
    setTimeout(() => line.classList.add('old'), 9000)
    setTimeout(() => line.remove(), 10200)
  }

  // --- toasts / reward / fade ---
  const toasts = el('div', 'hud-toasts')
  root.appendChild(toasts)
  function toast(text, kind = '') {
    const t = el('div', `hud-toast hud-outline ${kind}`, text)
    toasts.appendChild(t)
    setTimeout(() => t.remove(), 2700)
  }
  const rewardEl = el('div', 'hud-reward hud-outline')
  root.appendChild(rewardEl)
  let rewardTimer = 0
  function showReward(r, from) {
    rewardEl.style.setProperty('--glow', r.color)
    rewardEl.innerHTML = `<div class="t1">${from}</div><img src="${artURL(r.icon, 8)}" alt=""><div class="t2">${r.title}</div>`
    rewardEl.classList.add('show')
    clearTimeout(rewardTimer)
    rewardTimer = setTimeout(() => rewardEl.classList.remove('show'), 2600)
  }
  const fadeEl = el('div', 'hud-fade hud-outline', '<div class="big"></div><div class="small"></div>')
  root.appendChild(fadeEl)
  function fade(on, big = '', small = '') {
    fadeEl.querySelector('.big').textContent = big
    fadeEl.querySelector('.small').textContent = small
    fadeEl.classList.toggle('on', on)
  }

  // --- panels ---
  const scrim = el('div', 'hud-scrim')
  root.appendChild(scrim)
  scrim.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    closePanel()
  })
  const panel = el('div', 'hud-panel')
  panel.innerHTML = '<header><h2></h2><div class="gold"></div><button class="hud-x" type="button">✕</button></header><div class="body"></div>'
  root.appendChild(panel)
  const pTitle = panel.querySelector('h2')
  const pGold = panel.querySelector('.gold')
  const pBody = panel.querySelector('.body')
  panel.querySelector('.hud-x').addEventListener('click', () => closePanel())
  panel.addEventListener('pointerdown', (e) => e.stopPropagation())
  panel.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })
  let open = null
  let openArg = null

  function togglePanel(name, arg) {
    if (open === name && openArg === arg) closePanel()
    else openPanel(name, arg)
  }
  function openPanel(name, arg) {
    const first = !open
    open = name
    openArg = arg
    const [c, d] = PANEL_COLORS[name === 'crate' && arg === 'ranked' ? 'ranked' : name]
    panel.style.setProperty('--pc', c)
    panel.style.setProperty('--pd', d)
    renderPanel()
    panel.classList.add('on')
    scrim.classList.add('on')
    if (first) sfx.uiOpen()
    else sfx.uiTab()
    document.exitPointerLock?.()
    if (name === 'shop' && !state.seen.shop) {
      state.seen.shop = true
      changed()
    }
  }
  function closePanel() {
    if (!open) return false
    open = null
    openArg = null
    panel.classList.remove('on')
    scrim.classList.remove('on')
    sfx.uiClose()
    return true
  }
  const button = (cls, html, fn) => {
    const b = el('button', cls, html)
    b.type = 'button'
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      fn(b)
    })
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && sfx.uiHover())
    return b
  }
  const notEnough = (price) => {
    sfx.deny()
    toast(`Not enough Gold — you need ${fmt(price - state.gold)}g more. Earn Gold in the arena!`, 'bad')
  }

  function renderPanel() {
    pGold.innerHTML = `${coinImg()}${fmt(state.gold)}`
    pBody.innerHTML = ''
    const R = PANELS[open]
    R?.(openArg)
  }

  const PANELS = {
    kits() {
      pTitle.textContent = 'Kits'
      const grid = el('div', 'hud-grid')
      for (const k of KITS) {
        const owned = state.kits.includes(k.id)
        const sel = state.kit === k.id
        const pill = sel ? '<span class="pill on">Selected</span>' : owned ? '<span class="pill own">Select</span>' : `<span class="pill ${state.gold < k.price ? 'no' : ''}">${coinImg()}${fmt(k.price)}</span>`
        const card = button(`hud-card ${sel ? 'sel' : ''}`, `<img class="icon" src="${artURL(k.icon, 4)}" alt=""><div class="nm">${k.name}</div><div class="armor">Armor ${k.armor}/20</div><div class="ds">${k.desc}</div>${pill}`, () => {
          if (owned) {
            if (!sel) {
              state.kit = k.id
              changed()
              sfx.equip()
              toast(`${k.name} kit selected`, 'good')
            }
          } else if (spend(k.price)) {
            state.kits.push(k.id)
            state.kit = k.id
            changed()
            sfx.purchase()
            toast(`Unlocked the ${k.name} kit!`, 'good')
          } else notEnough(k.price)
          renderPanel()
        })
        grid.appendChild(card)
      }
      pBody.appendChild(grid)
    },
    shop() {
      pTitle.textContent = 'Shop'
      const grid = el('div', 'hud-grid')
      for (const it of SHOP_ITEMS) {
        const card = button('hud-card', `<img class="icon" src="${artURL(it.icon, 4)}" alt=""><div class="nm">${it.name}</div><div class="ds">${it.desc}</div><span class="pill ${state.gold < it.price ? 'no' : ''}">${coinImg()}${fmt(it.price)}</span>`, () => {
          if (state.gold < it.price) return notEnough(it.price)
          if (!state.hotbar.some((s) => !s || s.id === it.id)) {
            sfx.deny()
            return toast('Your hotbar is full', 'bad')
          }
          spend(it.price)
          giveItem(it.id, it.id === 'steak' ? 4 : 1)
          sfx.purchase()
          toast(`Bought ${it.name}`, 'good')
          renderPanel()
        })
        grid.appendChild(card)
      }
      pBody.appendChild(grid)
    },
    looks() {
      pTitle.textContent = 'Looks'
      const grid = el('div', 'hud-grid')
      for (const l of LOOKS) {
        const owned = state.looks.includes(l.id)
        const sel = state.look === l.id
        const pill = sel ? '<span class="pill on">Equipped</span>' : owned ? '<span class="pill own">Equip</span>' : `<span class="pill ${state.gold < l.price ? 'no' : ''}">${coinImg()}${fmt(l.price)}</span>`
        const sw = l.id === 'rainbow' ? 'linear-gradient(135deg,#ff5a5a,#ffcf3a,#5ac83a,#3fa0ff,#c46bff)' : l.color
        const card = button(`hud-card ${sel ? 'sel' : ''}`, `<div class="swatch" style="background:${sw}"></div><div class="nm">${l.name}</div><div class="ds">${l.id === 'none' ? 'No particles behind you.' : 'A particle trail that follows you.'}</div>${pill}`, () => {
          if (owned) {
            state.look = l.id
            changed()
            sfx.equip()
          } else if (spend(l.price)) {
            state.looks.push(l.id)
            state.look = l.id
            changed()
            sfx.purchase()
            toast(`Unlocked the ${l.name} trail!`, 'good')
          } else notEnough(l.price)
          renderPanel()
        })
        grid.appendChild(card)
      }
      pBody.appendChild(grid)
      if (ctx.canCustomize?.()) {
        const c = el('div', 'hud-center')
        c.appendChild(button('hud-big-btn blue', 'Edit Avatar', () => {
          closePanel()
          ctx.customize()
        }))
        pBody.appendChild(c)
      }
    },
    reward() {
      pTitle.textContent = 'Daily Reward'
      const s = dailyStatus()
      const days = el('div', 'hud-days')
      DAILY_REWARD.forEach((amt, i) => {
        const cls = i < s.day ? 'done' : i === s.day && s.ready ? 'today' : ''
        days.appendChild(el('div', `hud-day ${cls}`, `Day ${i + 1}<img src="${artURL(i === 6 ? 'chest' : 'coin', 4)}" alt="">${amt}g`))
      })
      pBody.appendChild(days)
      const c = el('div', 'hud-center')
      if (s.ready) {
        c.appendChild(button('hud-big-btn', `${coinImg()} Claim ${s.amount} Gold`, () => {
          const n = claimDaily()
          if (n) {
            sfx.reward()
            showReward({ icon: 'coin', title: `+${n} Gold`, color: '#ffd84a' }, 'Daily Reward')
          }
          renderPanel()
        }))
        c.appendChild(el('p', '', 'Come back every day to keep your streak going.'))
      } else {
        const h = Math.floor(s.wait / 3600000)
        const m = Math.ceil((s.wait % 3600000) / 60000)
        c.appendChild(button('hud-big-btn gray', `Next reward in ${h}h ${m}m`, () => sfx.deny()))
        c.appendChild(el('p', '', 'You already claimed today’s reward.'))
      }
      pBody.appendChild(c)
    },
    opts() {
      pTitle.textContent = 'Options'
      const slider = (label, key) => {
        const row = el('div', 'hud-row', `<span>${label}</span>`)
        const r = el('input')
        r.type = 'range'
        r.min = 0
        r.max = 1
        r.step = 0.05
        r.value = state.settings[key]
        r.addEventListener('input', () => {
          state.settings[key] = Number(r.value)
          sfx.setVolume(key, Number(r.value))
          changed()
        })
        r.addEventListener('change', () => sfx.uiClick())
        row.appendChild(r)
        return row
      }
      const seg = (label, options, current, fn) => {
        const row = el('div', 'hud-row', `<span>${label}</span>`)
        const s = el('div', 'hud-seg')
        for (const [v, t] of options) {
          s.appendChild(button(v === current ? 'on' : '', t, () => {
            fn(v)
            sfx.uiClick()
            renderPanel()
          }))
        }
        row.appendChild(s)
        return row
      }
      pBody.append(
        slider('Sound effects', 'sfx'),
        slider('Ambience', 'ambience'),
        seg('Camera', [['player', 'First person'], ['character', 'Third person']], ctx.getMode(), (v) => ctx.setMode(v)),
        seg('Time of day', [[false, 'Day'], [true, 'Night']], ctx.isNight(), (v) => v !== ctx.isNight() && ctx.toggleDay()),
        seg('Scoreboard', [[true, 'Show'], [false, 'Hide']], state.settings.scoreboard, (v) => {
          state.settings.scoreboard = v
          changed()
        }),
      )
      const c = el('div', 'hud-center')
      c.appendChild(button('hud-big-btn gray', 'Back to spawn', () => {
        closePanel()
        ctx.respawn()
      }))
      pBody.appendChild(c)
      pBody.appendChild(
        el(
          'div',
          'hud-keys',
          '<kbd>WASD</kbd><span>Move</span><kbd>Space</kbd><span>Jump</span><kbd>Shift</kbd><span>Sprint</span><kbd>Mouse</kbd><span>Look (click the world to grab the cursor)</span><kbd>Right click / E</kbd><span>Talk to NPCs, open crates</span><kbd>Left click</kbd><span>Swing</span><kbd>1-9</kbd><span>Hotbar</span><kbd>V</kbd><span>First / third person</span><kbd>K B M L O</kbd><span>Kits, Shop, Looks, Reward, Options</span>',
        ),
      )
    },
    crate(kind) {
      const c = CRATES[kind]
      pTitle.textContent = c.name
      const wrap = el('div', 'hud-center')
      wrap.appendChild(el('p', '', kind === 'ranked' ? 'The best loot in the lobby: rare kits and trails.' : 'Gold, XP, items and the odd kit.'))
      const loot = el('div', 'hud-crate-loot')
      for (const l of lootPreview(kind)) loot.appendChild(el('div', '', `<img src="${artURL(l.icon, 4)}" alt="">${l.text}<span style="opacity:.6">${l.pct}%</span>`))
      wrap.appendChild(loot)
      wrap.appendChild(button(`hud-big-btn ${state.gold < c.price ? 'gray' : ''}`, `${coinImg()} Open for ${fmt(c.price)} Gold`, () => {
        if (!spend(c.price)) return notEnough(c.price)
        closePanel()
        ctx.openCrate(kind)
      }))
      pBody.appendChild(wrap)
    },
    duels() {
      pTitle.textContent = 'Duels'
      const wrap = el('div', 'hud-center')
      wrap.appendChild(el('img', '', ''))
      wrap.lastChild.src = artURL('sword', 8)
      wrap.lastChild.style.cssText = 'width:96px;height:96px;image-rendering:pixelated'
      wrap.appendChild(el('p', '', '1v1 duels with your selected kit. First to 3 rounds wins Gold and XP.'))
      wrap.appendChild(button('hud-big-btn gray', 'Opens with the arena', () => {
        sfx.deny()
        toast('Duels open together with the arena — coming soon!', 'bad')
      }))
      pBody.appendChild(wrap)
    },
  }

  // --- state -> HUD ---
  onChange(() => {
    renderBoard()
    renderBars()
    renderHotbar()
    btns.reward.classList.toggle('alerting', dailyStatus().ready)
    btns.shop.classList.toggle('alerting', !state.seen.shop)
    if (open) {
      pGold.innerHTML = `${coinImg()}${fmt(state.gold)}`
    }
  })

  // --- layout: reserved areas + compact / portrait / touch classes ---
  function layout(areas) {
    const w = window.innerWidth
    const h = window.innerHeight
    let bottomOfTop = 0
    for (const a of areas || []) if (a.left < w * 0.5) bottomOfTop = Math.max(bottomOfTop, a.top + a.height)
    root.style.setProperty('--top-safe', `${bottomOfTop}px`)
    root.classList.toggle('portrait', h > w * 1.15)
    root.classList.toggle('compact', !(h > w * 1.15) && (h <= 520 || w < 760))
  }
  let lastAreas = []
  window.addEventListener('resize', () => layout(lastAreas))
  ctx.onReservedAreas?.((a) => {
    lastAreas = a
    layout(a)
  })
  layout(lastAreas)

  // key shortcuts for the menus
  const KEYS = { KeyK: 'kits', KeyB: 'shop', KeyM: 'looks', KeyL: 'reward', KeyO: 'opts' }
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.target instanceof HTMLInputElement) return
    const p = KEYS[e.code]
    if (p) {
      btns[p].classList.add('down')
      setTimeout(() => btns[p].classList.remove('down'), 120)
      togglePanel(p)
    }
    if (/^Digit[1-9]$/.test(e.code)) selectSlot(Number(e.code.slice(5)) - 1)
  })

  let playAcc = 0
  return {
    root,
    setPrompt,
    feed,
    toast,
    showReward,
    fade,
    openPanel,
    closePanel,
    isOpen: () => !!open,
    setTouch(on) {
      root.classList.toggle('touch', on)
      promptText = null
    },
    setCrosshair(on) {
      cross.style.display = on ? '' : 'none'
    },
    heartBeat() {
      ;[...hearts.children].forEach((h, i) => {
        h.classList.remove('beat')
        void h.offsetWidth
        h.style.animationDelay = `${i * 0.03}s`
        h.classList.add('beat')
      })
    },
    update(dt) {
      playAcc += dt
      if (playAcc >= 1) {
        const before = Math.floor(state.playtime / 60)
        state.playtime += Math.floor(playAcc)
        playAcc -= Math.floor(playAcc)
        if (Math.floor(state.playtime / 60) !== before) changed()
        else if (state.playtime % 10 === 0) changed()
      }
    },
    itemIcon,
  }
}
