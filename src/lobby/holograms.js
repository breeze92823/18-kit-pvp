// Floating text: the welcome hologram over the pit (camera-facing lines, each
// on a translucent strip), the three leaderboards in front of the board house
// (fixed panels a hand's width proud of the wall, so they never z-fight it),
// and coloured labels over the crates.
import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'
import { fontReady } from '../propkit.js'
import { mulberry32 } from '../textures.js'

const FONT = (size, weight = 700) => `${weight} ${size}px Fredoka, "Arial Rounded MT Bold", sans-serif`

// One line of mixed-colour text: segments [[text, color], ...].
function drawSegments(ctx, segs, x, y, size, shadow = true) {
  ctx.font = FONT(size)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  for (const [text, color] of segs) {
    if (shadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)'
      ctx.fillText(text, x + size * 0.07, y + size * 0.07)
    }
    ctx.fillStyle = color
    ctx.fillText(text, x, y)
    x += ctx.measureText(text).width
  }
  return x
}
function segWidth(ctx, segs, size) {
  ctx.font = FONT(size)
  return segs.reduce((w, [t]) => w + ctx.measureText(t).width, 0)
}

// A camera-facing line of text on a translucent strip.
export function holoLine(segs, height = 0.5, bg = 'rgba(32,52,96,0.42)') {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }))
  const size = 64
  const draw = () => {
    const w = segWidth(ctx, segs, size)
    c.width = Math.ceil(w + size * 0.6)
    c.height = Math.ceil(size * 1.3)
    if (bg) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, c.width, c.height)
    }
    drawSegments(ctx, segs, size * 0.3, c.height / 2 + 2, size)
    tex.needsUpdate = true
    sprite.scale.set((height * c.width) / c.height, height, 1)
  }
  draw()
  fontReady.then(draw)
  sprite.renderOrder = 6
  return sprite
}

export function buildWelcome(anchor) {
  const g = new Group()
  const Y = '#ffd84a'
  const O = '#ffa21a'
  const W = '#ffffff'
  const C = '#3fe0ff'
  const R = '#ff3a3a'
  const G = '#ffc21a'
  const lines = [
    [['Welcome to ', Y], ['Kit PvP', O]],
    [['Pick a kit at the ', W], ['Kit NPC', C]],
    [['Drop down into the ', W], ['arena', R], [' to fight', W]],
    [['Kills earn ', W], ['gold', G], [' and ', W], ['XP', C]],
  ]
  lines.forEach((segs, i) => {
    const s = holoLine(segs, 0.95)
    s.position.set(0, (lines.length - 1 - i) * 1.1, 0)
    g.add(s)
  })
  g.position.set(anchor.x, anchor.y, anchor.z)
  return g
}

// --- Leaderboards ---------------------------------------------------------------------------
const FIRST = ['Pixel', 'Nova', 'Mossy', 'Zephyr', 'Ember', 'Quiet', 'Rune', 'Tide', 'Kestrel', 'Frost', 'Blocky', 'Lumen', 'Cinder', 'Onyx', 'Sable', 'Vexa', 'Juniper', 'Orbit', 'Grim', 'Sunny', 'Basalt', 'Comet', 'Drift', 'Echo']
const LAST = ['Paladin', 'Strike', 'Ace', 'Kai', 'Lynx', 'Quartz', 'Wolf', 'caller', 'X', 'Bite', 'Bard', 'Fox', 'Rook', 'Viper', 'Mage', 'Hawk', 'Golem', 'Blade', 'Spark', 'Owl']
export function fakeName(rand) {
  const a = FIRST[Math.floor(rand() * FIRST.length)]
  const b = LAST[Math.floor(rand() * LAST.length)]
  const sep = rand() < 0.4 ? '_' : ''
  const num = rand() < 0.35 ? String(Math.floor(rand() * 99)) : ''
  return a + sep + b + num
}

function boardRows(kind, rand) {
  const rows = []
  let v = kind === 'kills' ? 16000 : kind === 'time' ? 345 * 60 : 64000
  for (let i = 0; i < 10; i++) {
    v = Math.floor(v * (0.78 + rand() * 0.2))
    const lvl = 30 + Math.floor(rand() * 290)
    rows.push({ name: fakeName(rand), lvl, elite: rand() < 0.45, v })
  }
  return rows.map((r, i) => {
    let value
    if (kind === 'kills') value = `${r.v.toLocaleString('en-US')} kills`
    else if (kind === 'time') value = `${Math.floor(r.v / 60)}h ${r.v % 60}m`
    else value = `${r.v.toLocaleString('en-US')} Gold`
    return { ...r, rank: i + 1, value }
  })
}

function leaderboardTexture(title, rows, valueColor) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  const draw = () => {
    c.width = 1024
    c.height = 760
    const C = '#3fd6ff'
    ctx.clearRect(0, 0, c.width, c.height)
    const center = (segs, y, size) => {
      const w = segWidth(ctx, segs, size)
      const x = (c.width - w) / 2
      ctx.fillStyle = 'rgba(120,170,230,0.22)'
      ctx.fillRect(x - 12, y - size * 0.62, w + 24, size * 1.24)
      drawSegments(ctx, segs, x, y, size)
    }
    center([[title, C]], 50, 64)
    center([['All Time', '#e8eef6']], 116, 40)
    rows.forEach((r, i) => {
      const segs = [
        [`${r.rank}. `, '#ffffff'],
        [`[${r.lvl}★] `, '#d0d8e2'],
        ...(r.elite ? [['[ELITE] ', C]] : []),
        [r.name, r.elite ? C : '#ffffff'],
        [' - ', '#ffffff'],
        [r.value, valueColor],
      ]
      center(segs, 182 + i * 58, 42)
    })
    tex.needsUpdate = true
  }
  draw()
  fontReady.then(draw)
  return tex
}

export function buildLeaderboards(anchor) {
  const g = new Group()
  const rand = mulberry32(4242)
  const boards = [
    ['TOP KILLS', boardRows('kills', rand), '#3fd6ff', -4.6, 3.6],
    ['TOP PLAYTIME', boardRows('time', rand), '#3fd6ff', 0, 4],
    ['TOP GOLD', boardRows('gold', rand), '#ffd23a', 4.8, 4.6],
  ]
  for (const [title, rows, color, dx, w] of boards) {
    const mat = new MeshBasicMaterial({ map: leaderboardTexture(title, rows, color), transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide })
    const plane = new Mesh(new PlaneGeometry(w, (w * 760) / 1024), mat)
    plane.position.set(dx, 0, 0)
    plane.renderOrder = 4
    g.add(plane)
  }
  g.position.set(anchor.x, anchor.y, anchor.z)
  return g
}

// Crate / NPC header: a big outlined title with an optional second line.
export function headerLabel(title, color, sub = null, subColor = '#ffe04a', height = 0.5) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }))
  const draw = () => {
    const size = 72
    ctx.font = FONT(size)
    const w1 = ctx.measureText(title).width
    ctx.font = FONT(size * 0.6)
    const w2 = sub ? ctx.measureText(sub).width : 0
    c.width = Math.ceil(Math.max(w1, w2) + 40)
    c.height = Math.ceil(size * (sub ? 2.05 : 1.35))
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.font = FONT(size)
    ctx.lineWidth = 10
    ctx.strokeStyle = 'rgba(20,10,30,0.75)'
    ctx.strokeText(title, c.width / 2, size * 0.68)
    ctx.fillStyle = color
    ctx.fillText(title, c.width / 2, size * 0.68)
    if (sub) {
      ctx.font = FONT(size * 0.6)
      ctx.lineWidth = 7
      ctx.strokeText(sub, c.width / 2, size * 1.58)
      ctx.fillStyle = subColor
      ctx.fillText(sub, c.width / 2, size * 1.58)
    }
    tex.needsUpdate = true
    sprite.scale.set((height * c.width) / (size * 1.35), (height * c.height) / (size * 1.35), 1)
  }
  draw()
  fontReady.then(draw)
  sprite.renderOrder = 6
  return sprite
}
