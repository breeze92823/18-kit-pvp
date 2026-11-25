// Floating text: the welcome hologram over the pit (camera-facing lines, each
// on a translucent strip), the three leaderboards in front of the board house
// (fixed panels a hand's width proud of the wall, so they never z-fight it),
// and coloured labels over the crates.
import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'
import { fontReady } from '../propkit.js'

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


function leaderboardTexture(title, rows, valueColor, sub = 'All Time') {
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
    center([[sub, '#e8eef6']], 116, 40)
    if (!rows.length) center([['No players yet. Be the first!', '#d0d8e2']], 182, 40)
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
  tex.userData.setRows = (next, nextSub = sub) => {
    rows = next
    sub = nextSub
    draw()
  }
  return tex
}
// server rows { name, level, value } -> drawn rows
const fmtValue = (stat, v) => (stat === 'kills' ? `${v.toLocaleString('en-US')} kills` : stat === 'playtime' ? `${Math.floor(v / 3600)}h ${Math.floor((v % 3600) / 60)}m` : `${v.toLocaleString('en-US')} Gold`)
const toRows = (stat, list) => (list ?? []).slice(0, 10).map((r, i) => ({ rank: i + 1, lvl: r.level ?? 1, name: String(r.name ?? '?').slice(0, 20), elite: (r.level ?? 1) >= 50, value: fmtValue(stat, r.value ?? 0) }))

// The three lobby boards. They start empty; setBoards({ kills, playtime, gold }) draws the real
// ones (the game server's leaderboard, or just you when playing offline).
export function buildLeaderboards(anchor) {
  const g = new Group()
  const boards = [
    ['kills', 'TOP KILLS', '#3fd6ff', -4.6, 3.6],
    ['playtime', 'TOP PLAYTIME', '#3fd6ff', 0, 4],
    ['gold', 'TOP GOLD', '#ffd23a', 4.8, 4.6],
  ]
  const textures = {}
  for (const [stat, title, color, dx, w] of boards) {
    const tex = leaderboardTexture(title, [], color, 'Connecting…')
    textures[stat] = tex
    const mat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide })
    const plane = new Mesh(new PlaneGeometry(w, (w * 760) / 1024), mat)
    plane.position.set(dx, 0, 0)
    plane.renderOrder = 4
    g.add(plane)
  }
  g.position.set(anchor.x, anchor.y, anchor.z)
  // Redraw (1024x760 canvas + texture upload + mipmaps) only the boards whose visible text
  // changed: raw values like playtime seconds change every tick but show as "Xh Ym".
  const shown = {}
  g.userData.setBoards = (data, sub = 'All Time') => {
    for (const stat of Object.keys(textures)) {
      const rows = toRows(stat, data?.[stat])
      const key = JSON.stringify(rows) + sub
      if (shown[stat] === key) continue
      shown[stat] = key
      textures[stat].userData.setRows(rows, sub)
    }
  }
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
