// Combat overlay (arena): the attack-charge / bow-draw meter under the crosshair, a
// hit marker (gold on a critical hit, grey when a shield stopped it), a status pill
// (spawn protection, frozen, rooted, invisible, in combat...), the kit ability widget
// (desktop: bottom right with its F key; touch draws its own button in touch.js) and
// the kill / assist banner. Lives inside #hud so it hides with it.
import './combat.css'
import { artURL } from '../lobby/pixelart.js'

const el = (tag, cls, html = '') => {
  const e = document.createElement(tag)
  e.className = cls
  e.innerHTML = html
  return e
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// The scoreboard's "Status:" line (hud.js draws it; this module keeps it current).
const BOARD_CLS = { fight: 'r', safe: 'c', ice: 'c', nature: 'g', ghost: 'c' }
export const boardStatus = { text: 'Not in combat', cls: 'g' }
function setBoardStatus(text, cls) {
  boardStatus.text = text || 'Not in combat'
  boardStatus.cls = text ? BOARD_CLS[cls] ?? 'y' : 'g'
  const e = document.querySelector('.hud-board .bs')
  if (e) {
    e.textContent = boardStatus.text
    e.className = `bs ${boardStatus.cls}`
  }
}

export function createCombatHud() {
  const root = el('div', 'cb-root')
  ;(document.getElementById('hud') ?? document.body).appendChild(root)
  const meter = el('div', 'cb-charge', '<i></i>')
  const hit = el('div', 'cb-hit')
  const status = el('div', 'cb-status')
  const kill = el('div', 'cb-kill hud-outline', '<div class="t"></div><div class="n"></div><div class="g"></div>')
  const ab = el('div', 'cb-ability', '<div class="ic"><img alt=""><div class="cd"></div><span class="cnt"></span><kbd>F</kbd></div><div class="nm hud-outline"></div>')
  const ultEl = el('div', 'cb-ult', '<div class="ic"><div class="fill"></div><img alt=""><kbd>Q</kbd></div><div class="nm hud-outline"></div>')
  const crit = el('div', 'cb-crit')
  root.append(meter, hit, status, kill, ab, ultEl, crit)
  const ultFill = ultEl.querySelector('.fill')
  const ultImg = ultEl.querySelector('img')
  const ultName = ultEl.querySelector('.nm')
  let shownUlt = ''
  const bar = meter.firstChild
  const abImg = ab.querySelector('img')
  const abCd = ab.querySelector('.cd')
  const abCnt = ab.querySelector('.cnt')
  const abName = ab.querySelector('.nm')

  let shownK = -1
  let shownStatus = ''
  let killTimer = 0
  let shownAb = ''
  return {
    // k 0..1; shown while recharging or drawing, hidden when ready
    charge(k, drawing) {
      const q = Math.round(k * 40) / 40
      const show = drawing || k < 1
      meter.classList.toggle('on', show)
      meter.classList.toggle('full', drawing && k >= 1)
      if (q === shownK) return
      shownK = q
      bar.style.width = `${q * 100}%`
    },
    hitMarker(crit, blocked = false) {
      hit.classList.remove('on', 'crit', 'blocked')
      void hit.offsetWidth
      hit.classList.add('on')
      hit.classList.toggle('crit', !!crit)
      hit.classList.toggle('blocked', !!blocked)
    },
    // text + style class (safe | fight | ice | nature | ghost), '' hides it
    status(text, cls = '') {
      const key = `${text}|${cls}`
      if (key === shownStatus) return
      shownStatus = key
      setBoardStatus(text, cls)
      status.textContent = text
      status.className = `cb-status ${cls} ${text ? 'on' : ''}`
    },
    protectedFor() {
      shownStatus = ''
    },
    // view: { icon, name, cd 0..1 (remaining), count (null = no ammo), active } or null
    ability(view) {
      if (!view) {
        if (shownAb) {
          ab.classList.remove('on')
          shownAb = ''
        }
        return
      }
      const cd = Math.round(view.cd * 30) / 30
      const key = `${view.icon}|${view.name}|${cd}|${view.count}|${view.active}`
      if (key === shownAb) return
      shownAb = key
      ab.classList.add('on')
      if (abImg.dataset.icon !== view.icon) {
        abImg.dataset.icon = view.icon
        abImg.src = artURL(view.icon, 4)
      }
      abCd.style.height = `${cd * 100}%`
      abCnt.textContent = view.count === null || view.count === undefined ? '' : String(view.count)
      abName.textContent = view.name
      ab.classList.toggle('ready', cd <= 0 && view.count !== 0)
      ab.classList.toggle('active', !!view.active)
    },
    // view: { k 0..1, ready, name, icon, color } or null (combat.js)
    ult(view) {
      const key = view ? `${Math.round(view.k * 40)}|${view.ready}|${view.name}|${view.icon}|${view.color}` : ''
      if (key === shownUlt) return
      shownUlt = key
      ultEl.classList.toggle('on', !!view)
      if (!view) return
      ultEl.style.setProperty('--ult', view.color)
      ultFill.style.height = `${Math.round(view.k * 100)}%`
      if (ultImg.dataset.icon !== view.icon) {
        ultImg.dataset.icon = view.icon
        ultImg.src = artURL(view.icon, 4)
      }
      ultName.textContent = view.ready ? `${view.name}!` : view.name
      ultEl.classList.toggle('ready', view.ready)
    },
    critFlash() {
      crit.classList.remove('on')
      void crit.offsetWidth
      crit.classList.add('on')
    },
    killBanner(title, name, sub, streak = 0) {
      kill.querySelector('.t').textContent = streak >= 2 ? `${title} ×${streak}` : title
      kill.querySelector('.n').innerHTML = esc(name)
      kill.querySelector('.g').textContent = sub
      kill.classList.toggle('assist', title !== 'KILL')
      kill.classList.remove('on')
      void kill.offsetWidth
      kill.classList.add('on')
      clearTimeout(killTimer)
      killTimer = setTimeout(() => kill.classList.remove('on'), 2300)
    },
    clear() {
      meter.classList.remove('on')
      kill.classList.remove('on')
      this.status('')
      this.ability(null)
      this.ult(null)
    },
  }
}
