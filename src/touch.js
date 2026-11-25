// Touch controls, shown on coarse-pointer devices (and whenever a finger touches
// the screen; a mouse click hides them again, so hybrid devices get whichever
// they are using). Laid out like the touch controls of block-building games:
// translucent square buttons, movement bottom-left, actions bottom-right, a small
// utility row at the top. Everything feeds inputState via input.js:
//   left zone   - floating joystick (appears under the thumb) -> move, analog;
//                 or a D-pad (arrows, diagonals while forward is held) when chosen
//   right zone  - one-finger drag -> look, two-finger pinch -> zoom, a quick tap
//                 = hit / talk (main.js)
//   buttons     - jump (corner), attack, sprint (toggle), kit ability; top row:
//                 camera, day-night, respawn
import './touch.css'
import { COARSE_POINTER, TOUCH } from './config.js'
import { inputState, isLookFrozen, requestLock, setTouchJumpHeld, setTouchMove, setTouchSprint } from './input.js'

const ICONS = {
  day: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  respawn: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v5h5"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.6"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M12 4v15M5 11l7-7 7 7"/></svg>',
  run: '<svg viewBox="0 0 24 24"><path d="M5 6l6 6-6 6M12 6l6 6-6 6"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7-7 7 7"/></svg>',
  sword: '<svg viewBox="0 0 24 24"><path d="M20 4l-9.5 9.5M20 4h-4.5M20 4v4.5"/><path d="M7 14l3 3M5.5 15.5l3 3"/><path d="M8.5 15.5 4 20"/></svg>',
}

function el(tag, className, html = '') {
  const e = document.createElement(tag)
  e.className = className
  e.innerHTML = html
  return e
}

// A pointerdown that fires `fn` (no click delay, no focus, no emulated mouse).
function button(className, html, fn) {
  const b = el('button', `touch-btn ${className}`, html)
  b.type = 'button'
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    fn(b)
  })
  return b
}

const isFinger = (e) => e.pointerType === 'touch' || e.pointerType === 'pen'

// Keeps a finger's moves on its zone even when it slides off. Throws if the
// pointer is already gone; the zone still works without capture.
function capture(zone, id) {
  try {
    zone.setPointerCapture(id)
  } catch {
    // Ignore.
  }
}

function setVisible(on) {
  document.body.classList.toggle('touch-ui', on)
  if (!on) setTouchMove(0, 0)
}

function installJoystick(zone) {
  const base = el('div', 'joy-base')
  const knob = el('div', 'joy-knob')
  base.appendChild(knob)
  zone.appendChild(base)

  let id = null
  let cx = 0
  let cy = 0
  let radius = 1

  const release = () => {
    id = null
    base.classList.remove('active')
    base.style.left = base.style.top = '' // back to its resting spot
    knob.style.transform = ''
    setTouchMove(0, 0)
  }

  zone.addEventListener('pointerdown', (e) => {
    if (!isFinger(e)) return requestLock()
    if (id !== null) return
    e.preventDefault()
    id = e.pointerId
    capture(zone, id)
    const zr = zone.getBoundingClientRect()
    radius = base.offsetWidth / 2
    cx = e.clientX
    cy = e.clientY
    base.style.left = `${cx - zr.left}px`
    base.style.top = `${cy - zr.top}px`
    base.classList.add('active')
  })
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return
    let dx = e.clientX - cx
    let dy = e.clientY - cy
    const len = Math.hypot(dx, dy)
    if (len > radius) {
      dx *= radius / len
      dy *= radius / len
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`
    const mag = Math.min(len / radius, 1)
    const live = mag < TOUCH.deadZone ? 0 : (mag - TOUCH.deadZone) / (1 - TOUCH.deadZone)
    const k = len > 0 ? live / Math.min(len, radius) : 0
    setTouchMove(dx * k, -dy * k)
  })
  zone.addEventListener('pointerup', (e) => e.pointerId === id && release())
  zone.addEventListener('pointercancel', (e) => e.pointerId === id && release())
}

function installLook(zone) {
  const fingers = new Map() // pointerId -> { x, y }
  let pinch = 0 // finger spread last frame, 0 = not pinching

  const spread = () => {
    const [a, b] = fingers.values()
    return Math.hypot(a.x - b.x, a.y - b.y)
  }
  const lift = (e) => {
    fingers.delete(e.pointerId)
    pinch = fingers.size >= 2 ? spread() : 0
  }

  zone.addEventListener('pointerdown', (e) => {
    if (!isFinger(e)) return requestLock()
    e.preventDefault()
    capture(zone, e.pointerId)
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (fingers.size >= 2) pinch = spread()
  })
  zone.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId)
    if (!f) return
    const dx = e.clientX - f.x
    const dy = e.clientY - f.y
    f.x = e.clientX
    f.y = e.clientY
    if (isLookFrozen()) return // dead: the camera stays put
    if (fingers.size === 1) {
      inputState.look.dx += dx * TOUCH.lookScale
      inputState.look.dy += dy * TOUCH.lookScale
    } else {
      // Fingers apart = zoom in (negative notches), together = out.
      const now = spread()
      inputState.zoom -= (now - pinch) / TOUCH.pinchPixelsPerNotch
      pinch = now
    }
  })
  zone.addEventListener('pointerup', lift)
  zone.addEventListener('pointercancel', lift)
}

// The attack button: press = swing (or start drawing the bow), release = shoot.
// Dragging the finger while holding it also aims, so you can fight with one thumb.
function attackButton(actions) {
  const b = el('button', 'touch-btn attack', ICONS.sword)
  b.type = 'button'
  let id = null
  let x = 0
  let y = 0
  const end = (e) => {
    if (e.pointerId !== id) return
    id = null
    b.classList.remove('on')
    actions.attackUp?.()
  }
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (id !== null) return
    id = e.pointerId
    x = e.clientX
    y = e.clientY
    capture(b, id)
    b.classList.add('on')
    actions.attackDown?.()
  })
  b.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return
    if (!isLookFrozen()) {
      inputState.look.dx += (e.clientX - x) * TOUCH.lookScale
      inputState.look.dy += (e.clientY - y) * TOUCH.lookScale
    }
    x = e.clientX
    y = e.clientY
  })
  b.addEventListener('pointerup', end)
  b.addEventListener('pointercancel', end)
  return b
}

// actions: { mode, day, respawn, attackDown, attackUp, abilityDown, abilityUp } callbacks
// (the menu is Boxity's toolbar).
export function installTouch(actions) {
  const root = el('div', 'touch-root')
  const left = el('div', 'touch-zone touch-left')
  const right = el('div', 'touch-zone touch-right')
  installJoystick(left)
  const dpad = installDpad(root)
  installLook(right)

  const top = el('div', 'touch-top')
  top.append(
    button('small cam', ICONS.cam, actions.mode),
    button('small', ICONS.day, actions.day),
    button('small', ICONS.respawn, actions.respawn),
  )

  let sprinting = false
  const cluster = el('div', 'touch-cluster')
  cluster.append(
    button('sprint', `${ICONS.run}<span>RUN</span>`, (b) => {
      sprinting = !sprinting
      b.classList.toggle('on', sprinting)
      setTouchSprint(sprinting)
    }),
    jumpButton(),
    attackButton(actions),
  )
  const ability = abilityButton(actions)
  cluster.appendChild(ability.el)
  const ult = ultButton(actions)
  cluster.appendChild(ult.el)

  root.append(left, right, top, cluster)
  document.body.appendChild(root)

  setVisible(COARSE_POINTER)
  // Whatever the player last used decides which controls are on screen.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (isFinger(e)) setVisible(true)
      else if (e.pointerType === 'mouse') setVisible(false)
    },
    { capture: true },
  )
  // 'stick' (floating joystick) or 'dpad' (arrow buttons)
  const setMoveStyle = (style) => {
    const pad = style === 'dpad'
    if (pad === root.classList.contains('dpad')) return
    root.classList.toggle('dpad', pad)
    left.style.display = pad ? 'none' : ''
    dpad.reset()
    setTouchMove(0, 0)
  }
  return { setAbility: ability.set, setUlt: ult.set, setMoveStyle }
}

// The ultimate: a round button left of the ability that fills in the kit colour and pulses when
// ready. Hidden outside a fight.
function ultButton(actions) {
  const b = el('button', 'touch-btn ult', '<i class="fill"></i><img alt=""><span>ULT</span>')
  b.type = 'button'
  const fill = b.querySelector('.fill')
  const img = b.querySelector('img')
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    b.classList.add('on')
    actions.ultimate?.()
  })
  const end = () => b.classList.remove('on')
  b.addEventListener('pointerup', end)
  b.addEventListener('pointercancel', end)
  let shown = ''
  // view: { iconUrl, k 0..1, ready, color } | null
  const set = (view) => {
    const key = view ? `${view.iconUrl}|${Math.round(view.k * 30)}|${view.ready}|${view.color}` : ''
    if (key === shown) return
    shown = key
    b.classList.toggle('shown', !!view)
    if (!view) return
    if (img.src !== view.iconUrl) img.src = view.iconUrl
    b.style.setProperty('--ult', view.color)
    fill.style.height = `${Math.round(view.k * 100)}%`
    b.classList.toggle('ready', !!view.ready)
  }
  return { el: b, set }
}

// D-pad: a 3x3 grid of arrow buttons. One finger slides between them (the pad
// captures it and reads the cell under it); the forward diagonals only show while
// forward is held, the middle cell does nothing.
function installDpad(root) {
  const pad = el('div', 'touch-dpad')
  const DIRS = {
    0: [-0.7071, 0.7071, 'diag ul'],
    1: [0, 1, 'up'],
    2: [0.7071, 0.7071, 'diag ur'],
    3: [-1, 0, 'left'],
    5: [1, 0, 'right'],
    7: [0, -1, 'down'],
  }
  const cells = []
  for (let i = 0; i < 9; i++) {
    const d = DIRS[i]
    const c = el('div', d ? `dpad-cell ${d[2]}` : 'dpad-cell mid', d ? ICONS.arrow : '')
    cells.push(c)
    pad.appendChild(c)
  }
  root.appendChild(pad)

  let id = null
  let active = -1
  const set = (i) => {
    if (i === active) return
    if (active >= 0) cells[active].classList.remove('on')
    active = i
    const d = DIRS[i]
    if (d) cells[i].classList.add('on')
    // diagonals are reachable while forward (or a diagonal) is held
    pad.classList.toggle('fwd', i === 0 || i === 1 || i === 2)
    setTouchMove(d ? d[0] : 0, d ? d[1] : 0)
  }
  const cellAt = (e) => {
    const r = pad.getBoundingClientRect()
    const cx = Math.floor(((e.clientX - r.left) / r.width) * 3)
    const cy = Math.floor(((e.clientY - r.top) / r.height) * 3)
    if (cx < 0 || cx > 2 || cy < 0 || cy > 2) return -1
    const i = cy * 3 + cx
    // diagonals only count while they are showing
    if ((i === 0 || i === 2) && !pad.classList.contains('fwd')) return -1
    return DIRS[i] ? i : -1
  }
  const reset = () => {
    id = null
    set(-1)
  }
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (id !== null) return
    id = e.pointerId
    capture(pad, id)
    set(cellAt(e))
  })
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return
    const i = cellAt(e)
    // sliding off the pad keeps the last direction (like holding the arrow)
    if (i >= 0) set(i)
  })
  pad.addEventListener('pointerup', (e) => e.pointerId === id && reset())
  pad.addEventListener('pointercancel', (e) => e.pointerId === id && reset())
  return { reset }
}

// Jump: a tap jumps; holding it keeps jumpHeld on (the glider kit glides).
function jumpButton() {
  const b = el('button', 'touch-btn jump', ICONS.jump)
  b.type = 'button'
  let id = null
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    id = e.pointerId
    capture(b, id)
    inputState.jump = true
    setTouchJumpHeld(true)
  })
  const end = (e) => {
    if (e.pointerId !== id) return
    id = null
    setTouchJumpHeld(false)
  }
  b.addEventListener('pointerup', end)
  b.addEventListener('pointercancel', end)
  return b
}

// The kit ability: the kit's art, a cooldown shade and the ammo left; hidden when the
// kit has none. Press = use (shield kits: hold to block).
function abilityButton(actions) {
  const b = el('button', 'touch-btn ability', '<img alt=""><i class="cd"></i><span class="cnt"></span>')
  b.type = 'button'
  const img = b.querySelector('img')
  const cd = b.querySelector('.cd')
  const cnt = b.querySelector('.cnt')
  let id = null
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (id !== null) return
    id = e.pointerId
    capture(b, id)
    b.classList.add('on')
    actions.abilityDown?.()
  })
  const end = (e) => {
    if (e.pointerId !== id) return
    id = null
    b.classList.remove('on')
    actions.abilityUp?.()
  }
  b.addEventListener('pointerup', end)
  b.addEventListener('pointercancel', end)
  let shown = ''
  // view: { iconUrl, cd 0..1, count, active } | null
  const set = (view) => {
    const key = view ? `${view.iconUrl}|${Math.round(view.cd * 30)}|${view.count}|${view.active}` : ''
    if (key === shown) return
    shown = key
    b.classList.toggle('shown', !!view)
    if (!view) return
    if (img.src !== view.iconUrl) img.src = view.iconUrl
    cd.style.height = `${Math.round(view.cd * 100)}%`
    cnt.textContent = view.count === null || view.count === undefined ? '' : String(view.count)
    b.classList.toggle('ready', view.cd <= 0 && view.count !== 0)
    b.classList.toggle('active', !!view.active)
  }
  return { el: b, set }
}
