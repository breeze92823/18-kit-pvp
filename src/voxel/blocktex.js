// 16x16 pixel-art block textures, painted procedurally (no image files).
// Every painter gets a fresh 16x16 canvas context and a seeded PRNG, so the
// same name always paints the same tile. Magnified with NearestFilter (crisp
// pixels up close) and mip-mapped when minified (no shimmer far away).
import { CanvasTexture, LinearMipmapLinearFilter, NearestFilter, RepeatWrapping, SRGBColorSpace } from 'three'
import { mulberry32 } from '../textures.js'

export const TILE = 16

// --- colour helpers ---------------------------------------------------------------
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function shade(hex, k) {
  // k > 0 lightens toward white, k < 0 darkens toward black
  const [r, g, b] = hexToRgb(hex)
  const f = (c) => Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))
  return `rgb(${f(r)},${f(g)},${f(b)})`
}
function pick(rand, list) {
  return list[Math.floor(rand() * list.length)]
}
// Weighted palette: [[color, weight], ...]
function weighted(rand, pal) {
  let total = 0
  for (const [, w] of pal) total += w
  let r = rand() * total
  for (const [c, w] of pal) {
    r -= w
    if (r <= 0) return c
  }
  return pal[0][0]
}

function makeCtx() {
  const c = document.createElement('canvas')
  c.width = c.height = TILE
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = false
  return { c, ctx }
}
const px = (ctx, x, y, color) => {
  ctx.fillStyle = color
  ctx.fillRect(((x % TILE) + TILE) % TILE, ((y % TILE) + TILE) % TILE, 1, 1)
}
function noiseFill(ctx, rand, pal) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) px(ctx, x, y, weighted(rand, pal))
}
// Small clusters (2-4 px) of a colour, wrapping at the edges so tiles stay seamless.
function speckle(ctx, rand, color, count, size = 2) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * TILE)
    const y = Math.floor(rand() * TILE)
    px(ctx, x, y, color)
    for (let k = 1; k < size; k++) px(ctx, x + (rand() < 0.5 ? 1 : 0), y + (rand() < 0.5 ? 1 : 0), color)
  }
}

// --- painters ------------------------------------------------------------------------
const P = {}

const DIRT = [['#86593b', 5], ['#7a5034', 4], ['#946645', 3], ['#6a4429', 2], ['#5c3a23', 1]]
function dirt(ctx, rand) {
  noiseFill(ctx, rand, DIRT)
  speckle(ctx, rand, '#a77a55', 5, 2)
  speckle(ctx, rand, '#4e301c', 5, 2)
}
P.dirt = dirt

// The lobby floor: reddish coarse dirt with pale pebbles and dark clods.
P.coarse_dirt = (ctx, rand) => {
  noiseFill(ctx, rand, [['#6c4636', 6], ['#623f30', 4], ['#76503e', 4], ['#563628', 2]])
  speckle(ctx, rand, '#94776a', 5, 3)
  speckle(ctx, rand, '#a88c7f', 2, 2)
  speckle(ctx, rand, '#42281c', 5, 2)
  speckle(ctx, rand, '#80584a', 4, 2)
}
P.coarse_dirt_b = (ctx, rand) => {
  noiseFill(ctx, rand, [['#674234', 6], ['#5d3b2d', 4], ['#714b3b', 4], ['#513224', 2]])
  speckle(ctx, rand, '#8e7266', 6, 3)
  speckle(ctx, rand, '#3e2519', 6, 2)
}
P.rooted_dirt = (ctx, rand) => {
  noiseFill(ctx, rand, [['#8b5e40', 5], ['#7d5236', 4], ['#996a49', 3]])
  for (let i = 0; i < 4; i++) {
    let x = Math.floor(rand() * TILE)
    let y = Math.floor(rand() * TILE)
    for (let k = 0; k < 6; k++) {
      px(ctx, x, y, k % 2 ? '#c49a6c' : '#b08457')
      x += rand() < 0.5 ? 1 : 0
      y += 1
    }
  }
}
P.path_top = (ctx, rand) => {
  noiseFill(ctx, rand, [['#9a7744', 5], ['#8c6a3b', 4], ['#a8854f', 3], ['#7d5d33', 2]])
  speckle(ctx, rand, '#b6955f', 5, 2)
}
P.podzol_top = (ctx, rand) => {
  noiseFill(ctx, rand, [['#6b4a26', 5], ['#7c5530', 4], ['#5a3d1d', 3], ['#8c6234', 2]])
  speckle(ctx, rand, '#4a6b2a', 4, 2)
  speckle(ctx, rand, '#a2733d', 4, 2)
}

const GRASS = [['#5d9e36', 6], ['#529230', 4], ['#68ab3e', 4], ['#4a8429', 2], ['#74b746', 1]]
P.grass_top = (ctx, rand) => {
  noiseFill(ctx, rand, GRASS)
  speckle(ctx, rand, '#7cc24c', 5, 2)
  speckle(ctx, rand, '#3f7623', 4, 2)
}
P.grass_side = (ctx, rand) => {
  dirt(ctx, rand)
  for (let x = 0; x < TILE; x++) {
    const drip = 2 + Math.floor(rand() * 2.4) + (rand() < 0.18 ? 2 : 0)
    for (let y = 0; y < drip; y++) px(ctx, x, y, weighted(rand, GRASS))
    if (rand() < 0.5) px(ctx, x, drip, '#3f7623')
  }
}

P.stone = (ctx, rand) => {
  noiseFill(ctx, rand, [['#7f7f7f', 6], ['#777777', 4], ['#868686', 4], ['#6e6e6e', 2]])
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rand() * TILE)
    const y = Math.floor(rand() * TILE)
    const len = 2 + Math.floor(rand() * 4)
    for (let k = 0; k < len; k++) px(ctx, x + k, y, '#666666')
    px(ctx, x, y - 1, '#949494')
  }
}
P.deep_stone = (ctx, rand) => {
  noiseFill(ctx, rand, [['#4f4f55', 6], ['#46464c', 4], ['#58585e', 3], ['#3c3c42', 2]])
  for (let y = 1; y < TILE; y += 4) for (let x = 0; x < TILE; x++) if (rand() < 0.4) px(ctx, x, y, '#38383d')
}
// Light stone used for the pit terraces (smooth, mottled).
P.andesite = (ctx, rand) => {
  noiseFill(ctx, rand, [['#a3a3a3', 6], ['#9a9a9a', 4], ['#acacac', 3], ['#919191', 2]])
  speckle(ctx, rand, '#b9b9b9', 5, 3)
  speckle(ctx, rand, '#7e7e7e', 7, 3)
  speckle(ctx, rand, '#8a8a8a', 6, 2)
}
P.smooth_stone = (ctx, rand) => {
  noiseFill(ctx, rand, [['#a2a2a2', 6], ['#9a9a9a', 4], ['#aaaaaa', 3]])
  for (let x = 0; x < TILE; x++) {
    px(ctx, x, 0, '#b8b8b8')
    px(ctx, x, 15, '#7c7c7c')
  }
  for (let y = 0; y < TILE; y++) {
    px(ctx, 0, y, '#b0b0b0')
    px(ctx, 15, y, '#808080')
  }
}

// Voronoi stones with dark mortar between them (seamless: distances wrap).
function cobbleLike(ctx, rand, stones, pal, mortar, highlight) {
  const pts = []
  for (let i = 0; i < stones; i++) pts.push([rand() * TILE, rand() * TILE, weighted(rand, pal)])
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      let d1 = 1e9
      let d2 = 1e9
      let best = 0
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(x + 0.5 - pts[i][0])
        let dy = Math.abs(y + 0.5 - pts[i][1])
        dx = Math.min(dx, TILE - dx)
        dy = Math.min(dy, TILE - dy)
        const d = Math.hypot(dx, dy)
        if (d < d1) {
          d2 = d1
          d1 = d
          best = i
        } else if (d < d2) d2 = d
      }
      let col = pts[best][2]
      if (d2 - d1 < 1.1) col = mortar
      else if (d1 < 1.6 && highlight) col = highlight
      else if (rand() < 0.15) col = shade(col, -0.1)
      px(ctx, x, y, col)
    }
  }
}
P.cobblestone = (ctx, rand) => cobbleLike(ctx, rand, 9, [['#8c8c8c', 3], ['#7a7a7a', 3], ['#9b9b9b', 2], ['#6c6c6c', 1]], '#4a4a4a', '#a8a8a8')
P.mossy_cobblestone = (ctx, rand) => {
  cobbleLike(ctx, rand, 9, [['#8c8c8c', 3], ['#7a7a7a', 3], ['#9b9b9b', 2]], '#4a4a4a', '#a8a8a8')
  speckle(ctx, rand, '#5f8a3a', 10, 3)
  speckle(ctx, rand, '#4d7430', 6, 2)
}
P.gravel = (ctx, rand) => cobbleLike(ctx, rand, 22, [['#8f8580', 3], ['#7a716d', 3], ['#a59c96', 2], ['#6a625e', 2], ['#9b8a7c', 1]], '#5a524f', null)

P.stone_bricks = (ctx, rand) => {
  noiseFill(ctx, rand, [['#7e7e7e', 5], ['#767676', 4], ['#868686', 3]])
  for (let x = 0; x < TILE; x++) {
    px(ctx, x, 7, '#545454')
    px(ctx, x, 15, '#545454')
    px(ctx, x, 0, '#939393')
    px(ctx, x, 8, '#939393')
  }
  for (let y = 0; y < 8; y++) px(ctx, 15, y, '#545454')
  for (let y = 8; y < 16; y++) px(ctx, 7, y, '#545454')
  speckle(ctx, rand, '#6a6a6a', 5, 2)
}

// Planks: 4 boards, dark seams, offset end joints, grain streaks.
function planks(ctx, rand, base, dark, light) {
  for (let b = 0; b < 4; b++) {
    const joint = Math.floor(rand() * 12) + 2
    for (let y = b * 4; y < b * 4 + 4; y++) {
      for (let x = 0; x < TILE; x++) {
        let c = rand() < 0.5 ? base : shade(base, rand() < 0.5 ? -0.06 : 0.05)
        if (y === b * 4 + 3) c = dark
        else if (y === b * 4) c = shade(base, 0.08)
        if (x === joint && y !== b * 4 + 3) c = dark
        px(ctx, x, y, c)
      }
    }
    // grain
    for (let k = 0; k < 2; k++) {
      const gx = Math.floor(rand() * TILE)
      const gy = b * 4 + 1 + Math.floor(rand() * 2)
      for (let i = 0; i < 4; i++) px(ctx, gx + i, gy, light)
    }
    if (rand() < 0.6) px(ctx, (joint + 2) % TILE, b * 4 + 1, shade(dark, -0.2)) // nail
  }
}
P.oak_planks = (ctx, rand) => planks(ctx, rand, '#b18a52', '#6e5230', '#c49c62')
P.spruce_planks = (ctx, rand) => planks(ctx, rand, '#6f4d2c', '#3d2915', '#7f5a35')
P.dark_planks = (ctx, rand) => planks(ctx, rand, '#4d3219', '#2a1a0b', '#5c3d20')

// Log side: vertical bark ridges.
function logSide(ctx, rand, pal, crack) {
  for (let x = 0; x < TILE; x++) {
    const col = weighted(rand, pal)
    for (let y = 0; y < TILE; y++) px(ctx, x, y, rand() < 0.2 ? shade(col, rand() < 0.5 ? -0.12 : 0.08) : col)
  }
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rand() * TILE)
    const y = Math.floor(rand() * TILE)
    const len = 3 + Math.floor(rand() * 6)
    for (let k = 0; k < len; k++) px(ctx, x, y + k, crack)
  }
}
function logTop(ctx, rand, bark, rings) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15
      const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
      const c = edge ? bark : rings[Math.floor(r) % 2 === 0 ? 0 : 1]
      px(ctx, x, y, rand() < 0.12 ? shade(c, -0.08) : c)
    }
  }
}
P.oak_log = (ctx, rand) => logSide(ctx, rand, [['#6b5333', 3], ['#5d482b', 3], ['#7a5f3b', 2], ['#4c3a22', 1]], '#3f301b')
P.oak_log_top = (ctx, rand) => logTop(ctx, rand, '#6b5333', ['#b69259', '#a07e49'])
P.spruce_log = (ctx, rand) => logSide(ctx, rand, [['#3e2a17', 3], ['#4a3320', 3], ['#35230f', 2]], '#26180a')
P.spruce_log_top = (ctx, rand) => logTop(ctx, rand, '#3e2a17', ['#7a5833', '#694a2a'])
P.dark_log = (ctx, rand) => logSide(ctx, rand, [['#3b2c1c', 3], ['#2f2316', 3], ['#45341f', 2]], '#1d150c')
P.dark_log_top = (ctx, rand) => logTop(ctx, rand, '#3b2c1c', ['#5b3c1f', '#4b3118'])

// Leaves: cut-out holes (alpha), light tips and dark depths.
function leaves(ctx, rand, pal, hole = 0.16) {
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      if (rand() < hole) continue
      px(ctx, x, y, weighted(rand, pal))
    }
  }
}
P.oak_leaves = (ctx, rand) => leaves(ctx, rand, [['#3f8a2a', 5], ['#357a22', 4], ['#4c9c33', 3], ['#2a641a', 2], ['#5aad3c', 1]])
P.dark_leaves = (ctx, rand) => leaves(ctx, rand, [['#2f6e1f', 5], ['#285e1a', 4], ['#367d24', 3], ['#1f4d14', 2]], 0.12)
P.bush_leaves = (ctx, rand) => leaves(ctx, rand, [['#4b9a30', 5], ['#3e8628', 4], ['#58ab3a', 3], ['#2f6a1e', 2]], 0.1)

P.white_wool = (ctx, rand) => {
  noiseFill(ctx, rand, [['#eceeee', 6], ['#e2e5e5', 4], ['#f5f7f7', 3], ['#d6dada', 1]])
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rand() * TILE)
    const y = Math.floor(rand() * TILE)
    px(ctx, x, y, '#d0d4d4')
    px(ctx, x + 1, y + 1, '#d0d4d4')
  }
}
P.packed_ice = (ctx, rand) => {
  noiseFill(ctx, rand, [['#8fb9f2', 5], ['#9cc4f6', 4], ['#83ade8', 3], ['#a9cdfa', 2]])
  for (let i = 0; i < 3; i++) {
    let x = Math.floor(rand() * TILE)
    let y = Math.floor(rand() * TILE)
    for (let k = 0; k < 7; k++) {
      px(ctx, x, y, '#d8ebff')
      x += rand() < 0.6 ? 1 : 0
      y += rand() < 0.6 ? 1 : -1
    }
  }
}
P.obsidian = (ctx, rand) => {
  noiseFill(ctx, rand, [['#140d1e', 6], ['#1b1229', 4], ['#0e0915', 3], ['#2a1a3d', 1]])
  speckle(ctx, rand, '#3c2556', 5, 2)
  speckle(ctx, rand, '#5a3a82', 2, 1)
}
P.barrel_side = (ctx, rand) => {
  planks(ctx, rand, '#7d5a32', '#4f381d', '#8c683d')
  // rotate look: vertical staves via columns + two iron bands
  for (let x = 0; x < TILE; x += 4) for (let y = 0; y < TILE; y++) px(ctx, x, y, '#5a4024')
  for (const by of [2, 13]) for (let x = 0; x < TILE; x++) px(ctx, x, by, x % 4 === 1 ? '#7a7a7a' : '#5a5a5a')
}
P.barrel_top = (ctx, rand) => {
  noiseFill(ctx, rand, [['#8c683d', 4], ['#7d5a32', 4]])
  for (let i = 0; i < TILE; i++) {
    px(ctx, i, 0, '#5a5a5a')
    px(ctx, i, 15, '#5a5a5a')
    px(ctx, 0, i, '#5a5a5a')
    px(ctx, 15, i, '#5a5a5a')
  }
  for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) px(ctx, x, y, '#4f381d')
}
P.hay_side = (ctx, rand) => {
  for (let x = 0; x < TILE; x++) for (let y = 0; y < TILE; y++) px(ctx, x, y, weighted(rand, [['#c9a533', 4], ['#b8942a', 3], ['#d8b844', 2]]))
  for (const by of [3, 12]) for (let x = 0; x < TILE; x++) px(ctx, x, by, '#8a2d1d')
}
P.hay_top = (ctx, rand) => {
  noiseFill(ctx, rand, [['#c9a533', 4], ['#b8942a', 3], ['#d8b844', 2], ['#a68324', 1]])
}
P.bookshelf = (ctx, rand) => {
  planks(ctx, rand, '#b18a52', '#6e5230', '#c49c62')
  const books = ['#9e2a2a', '#2a5a9e', '#2f7d3a', '#c59a2a', '#6a2a8a', '#8a5a2a']
  for (const row of [2, 10]) {
    for (let x = 1; x < 15; x++) {
      const c = pick(rand, books)
      const h = 4 + Math.floor(rand() * 2)
      for (let y = row + (5 - h); y < row + 5; y++) px(ctx, x, y, c)
    }
  }
}

// --- plants (cross-quads, alpha) ------------------------------------------------------
function stems(ctx, rand, n, pal, tall = 1) {
  for (let i = 0; i < n; i++) {
    let x = 1 + Math.floor(rand() * 14)
    const h = Math.floor((6 + rand() * 8) * tall)
    for (let k = 0; k < h; k++) {
      px(ctx, x, 15 - k, weighted(rand, pal))
      if (rand() < 0.25) x += rand() < 0.5 ? 1 : -1
      x = Math.max(0, Math.min(15, x))
    }
  }
}
const BLADE = [['#5aa236', 4], ['#4a8f2c', 3], ['#6bb543', 2], ['#3c7a22', 2]]
P.tall_grass = (ctx, rand) => stems(ctx, rand, 9, BLADE)
P.fern = (ctx, rand) => {
  for (let i = 0; i < 4; i++) {
    const cx = 3 + Math.floor(rand() * 10)
    for (let k = 0; k < 11; k++) {
      px(ctx, cx + Math.round((k - 5) * 0.2 * (i % 2 ? 1 : -1)), 15 - k, '#3f7c26')
      if (k % 2 === 0 && k > 1) {
        px(ctx, cx - 1, 15 - k, '#56963a')
        px(ctx, cx + 1, 15 - k, '#56963a')
      }
    }
  }
}
function flower(ctx, rand, petal, center, petalDark) {
  stems(ctx, rand, 2, BLADE, 0.6)
  for (let y = 7; y < 16; y++) px(ctx, 7, y, '#3d7a24')
  px(ctx, 6, 11, '#4f9530')
  px(ctx, 8, 12, '#4f9530')
  px(ctx, 5, 10, '#4f9530')
  const cx = 7
  const cy = 5
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]]) px(ctx, cx + dx, cy + dy, (dx + dy) % 2 ? petal : petalDark)
  px(ctx, cx, cy, center)
  px(ctx, cx - 2, cy, petal)
  px(ctx, cx + 2, cy, petal)
  px(ctx, cx, cy - 2, petal)
}
P.poppy = (ctx, rand) => flower(ctx, rand, '#e0262b', '#3a1a0a', '#b71c20')
P.cornflower = (ctx, rand) => flower(ctx, rand, '#4a6ae8', '#2a3a9a', '#3550c8')
P.dandelion = (ctx, rand) => flower(ctx, rand, '#f6d330', '#d9a31a', '#e8bc1e')
P.daisy = (ctx, rand) => flower(ctx, rand, '#f4f4f4', '#f2c21a', '#dcdcdc')
P.allium = (ctx, rand) => flower(ctx, rand, '#c56be8', '#8a3ab8', '#a74fd0')
P.sapling = (ctx, rand) => {
  for (let y = 9; y < 16; y++) px(ctx, 7, y, '#5d4426')
  leaves(ctx, rand, [['#3f8a2a', 3], ['#4c9c33', 2]], 0)
  ctx.clearRect(0, 9, 7, 7)
  ctx.clearRect(8, 9, 8, 7)
  ctx.clearRect(0, 0, 16, 2)
  for (let y = 2; y < 9; y++) {
    ctx.clearRect(0, y, 3 + Math.abs(5 - y) / 2, 1)
    ctx.clearRect(13 - Math.abs(5 - y) / 2, y, 4, 1)
  }
}

// --- arena blocks ----------------------------------------------------------------------
// Bricks: rows of `rowH` px, bricks `w` px wide, every other row offset by half a brick.
function bricks(ctx, rand, pal, mortar, hi, w = 8, rowH = 4) {
  noiseFill(ctx, rand, pal)
  for (let r = 0; r < TILE / rowH; r++) {
    const y0 = r * rowH
    for (let x = 0; x < TILE; x++) {
      px(ctx, x, y0 + rowH - 1, mortar)
      if (hi && rand() < 0.7) px(ctx, x, y0, hi)
    }
    const off = r % 2 ? w / 2 : 0
    for (let bx = off; bx < TILE + w; bx += w) for (let y = y0; y < y0 + rowH - 1; y++) px(ctx, bx - 1, y, mortar)
  }
}

// Frost
P.snow = (ctx, rand) => {
  noiseFill(ctx, rand, [['#f4f8fb', 6], ['#eaf1f6', 4], ['#fbfdff', 4], ['#dde7ef', 1]])
  speckle(ctx, rand, '#d2dfe9', 6, 2)
  speckle(ctx, rand, '#ffffff', 5, 2)
}
const ICE = [['#86cfe9', 5], ['#93d8ef', 4], ['#78c2e0', 3], ['#a6e2f5', 2], ['#6cb5d6', 1]]
function iceStreaks(ctx, rand, n) {
  for (let i = 0; i < n; i++) {
    let x = Math.floor(rand() * TILE)
    let y = Math.floor(rand() * TILE)
    for (let k = 0; k < 6; k++) {
      px(ctx, x, y, k % 3 ? '#d6f4ff' : '#bfeaff')
      x += 1
      y += rand() < 0.5 ? 1 : 0
    }
  }
}
P.frost_ice = (ctx, rand) => {
  noiseFill(ctx, rand, ICE)
  iceStreaks(ctx, rand, 3)
  speckle(ctx, rand, '#5fa6c9', 3, 2)
}
// snow drifting over the top edge of an ice block
P.snowy_ice_side = (ctx, rand) => {
  P.frost_ice(ctx, rand)
  for (let x = 0; x < TILE; x++) {
    const drip = 2 + Math.floor(rand() * 2.5) + (rand() < 0.15 ? 2 : 0)
    for (let y = 0; y < drip; y++) px(ctx, x, y, weighted(rand, [['#f4f8fb', 4], ['#e4edf3', 2], ['#ffffff', 2]]))
    if (rand() < 0.4) px(ctx, x, drip, '#cfe6f1')
  }
}
P.ice = (ctx, rand) => {
  noiseFill(ctx, rand, [['#9fd6f2', 5], ['#aadcf5', 4], ['#93cdee', 3], ['#bfe6fa', 2]])
  iceStreaks(ctx, rand, 4)
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(rand() * TILE)
    const y = Math.floor(rand() * TILE)
    px(ctx, x, y, '#ffffff')
    px(ctx, x + 1, y, '#e8f8ff')
  }
}
P.snowy_dirt_side = (ctx, rand) => {
  dirt(ctx, rand)
  for (let x = 0; x < TILE; x++) {
    const drip = 3 + Math.floor(rand() * 2) + (rand() < 0.2 ? 2 : 0)
    for (let y = 0; y < drip; y++) px(ctx, x, y, weighted(rand, [['#f4f8fb', 4], ['#e4edf3', 2]]))
  }
}

// Nether
const RACK = [['#6f1f1f', 5], ['#7c2525', 4], ['#622020', 3], ['#8a2f2c', 2], ['#561616', 2]]
P.netherrack = (ctx, rand) => {
  noiseFill(ctx, rand, RACK)
  speckle(ctx, rand, '#9b3a36', 6, 3)
  speckle(ctx, rand, '#451010', 7, 2)
  speckle(ctx, rand, '#7f3a2e', 3, 2)
}
P.netherrack_b = (ctx, rand) => {
  noiseFill(ctx, rand, [['#672020', 5], ['#5a1a1a', 4], ['#742626', 3], ['#4c1414', 2]])
  speckle(ctx, rand, '#8d3232', 6, 3)
  speckle(ctx, rand, '#3d0d0d', 8, 2)
}
P.nether_bricks = (ctx, rand) => bricks(ctx, rand, [['#2f161a', 5], ['#37191e', 4], ['#28121a', 3], ['#3f1e23', 1]], '#160a0d', '#46222a')
P.glowstone = (ctx, rand) => {
  noiseFill(ctx, rand, [['#c88a3a', 3], ['#a06a2c', 2], ['#7d4f22', 1]])
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rand() * TILE)
    const y = Math.floor(rand() * TILE)
    const c = pick(rand, ['#ffe9a8', '#ffd76a', '#fbc85a', '#fff4cf'])
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]]) if (rand() < 0.85) px(ctx, x + dx, y + dy, c)
  }
  speckle(ctx, rand, '#6a3e18', 5, 1)
}
P.magma = (ctx, rand) => {
  noiseFill(ctx, rand, [['#3d1610', 5], ['#4a1b12', 4], ['#2e100b', 3]])
  for (let i = 0; i < 5; i++) {
    let x = Math.floor(rand() * TILE)
    let y = Math.floor(rand() * TILE)
    for (let k = 0; k < 7; k++) {
      px(ctx, x, y, k % 2 ? '#ff8a1e' : '#f05a0e')
      if (rand() < 0.5) x += rand() < 0.5 ? 1 : -1
      else y += rand() < 0.5 ? 1 : -1
    }
  }
  speckle(ctx, rand, '#ffd04a', 4, 1)
}
P.crimson_roots = (ctx, rand) => stems(ctx, rand, 7, [['#b3242d', 4], ['#8f1b24', 3], ['#d8414a', 2]], 0.8)

// Spring isles (end stone + purpur)
const ENDSTONE = [['#dcdc9f', 5], ['#d1d195', 4], ['#e5e6ad', 3], ['#c7c78a', 2]]
P.end_stone = (ctx, rand) => {
  noiseFill(ctx, rand, ENDSTONE)
  speckle(ctx, rand, '#b5b577', 8, 2)
  speckle(ctx, rand, '#eeefbe', 5, 2)
  for (let i = 0; i < 4; i++) px(ctx, Math.floor(rand() * TILE), Math.floor(rand() * TILE), '#a3a366')
}
P.end_stone_bricks = (ctx, rand) => bricks(ctx, rand, ENDSTONE, '#a9a86c', '#efefc2')
const PURPUR = [['#a97aa9', 5], ['#b285b2', 4], ['#9e6f9e', 3], ['#bb90bb', 1]]
P.purpur_block = (ctx, rand) => {
  noiseFill(ctx, rand, PURPUR)
  for (let i = 0; i < TILE; i++) {
    for (const k of [0, 8]) {
      px(ctx, i, k, '#c79fc7')
      px(ctx, k, i, '#c79fc7')
      px(ctx, i, k + 7, '#87598a')
      px(ctx, k + 7, i, '#87598a')
    }
  }
}
P.purpur_pillar = (ctx, rand) => {
  for (let x = 0; x < TILE; x++) {
    const c = x % 4 === 0 ? '#c79fc7' : x % 4 === 3 ? '#87598a' : weighted(rand, PURPUR)
    for (let y = 0; y < TILE; y++) px(ctx, x, y, rand() < 0.12 ? shade(c, -0.08) : c)
  }
}
P.purpur_pillar_top = (ctx, rand) => {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
      const c = Math.floor(r) % 3 === 0 ? '#c79fc7' : Math.floor(r) % 3 === 1 ? '#a97aa9' : '#93659a'
      px(ctx, x, y, rand() < 0.1 ? shade(c, -0.08) : c)
    }
}
P.chorus_plant = (ctx, rand) => {
  noiseFill(ctx, rand, [['#8a588a', 5], ['#7a4b7c', 4], ['#97659a', 3], ['#5f3762', 2]])
  speckle(ctx, rand, '#c08fc4', 6, 2)
  speckle(ctx, rand, '#4b2a4e', 5, 2)
}
P.chorus_flower = (ctx, rand) => {
  noiseFill(ctx, rand, [['#cfb0dc', 5], ['#bd9ccc', 4], ['#dfc6ea', 3]])
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(rand() * 12)
    const y = 2 + Math.floor(rand() * 12)
    px(ctx, x, y, '#f3e6fa')
    px(ctx, x + 1, y, '#9a74b0')
  }
  for (let i = 0; i < TILE; i++) {
    px(ctx, i, 0, '#8e6aa4')
    px(ctx, 0, i, '#8e6aa4')
  }
}
P.end_gem = (ctx, rand) => {
  noiseFill(ctx, rand, [['#22b36a', 4], ['#18995a', 3], ['#3fd88a', 2]])
  for (let i = 0; i < TILE; i++) {
    px(ctx, i, i, '#a8ffd0')
    px(ctx, 15 - i, i, '#7af0b0')
    px(ctx, i, 0, '#0e6a3a')
    px(ctx, 0, i, '#0e6a3a')
  }
}

// The central plaza
const MUD = [['#8b6651', 5], ['#80604b', 4], ['#977260', 3], ['#73533f', 2]]
P.mud_bricks = (ctx, rand) => bricks(ctx, rand, MUD, '#5e4333', '#a17b66')
P.packed_mud = (ctx, rand) => {
  noiseFill(ctx, rand, [['#8e6a54', 5], ['#84624d', 4], ['#99755f', 3], ['#7a5a46', 2]])
  speckle(ctx, rand, '#6d4f3c', 6, 2)
  speckle(ctx, rand, '#a8836c', 4, 2)
}
P.brown_cobble = (ctx, rand) => cobbleLike(ctx, rand, 9, [['#8a6a58', 3], ['#7a5c4b', 3], ['#9a7a66', 2], ['#6a4d3e', 1]], '#4a3328', '#a8897a')

// Summer valley
P.sand = (ctx, rand) => {
  noiseFill(ctx, rand, [['#dccf9c', 5], ['#d3c48e', 4], ['#e5d9a8', 3], ['#c9b983', 2]])
  speckle(ctx, rand, '#bcae7a', 6, 1)
}
P.clay = (ctx, rand) => {
  noiseFill(ctx, rand, [['#9aa0ae', 5], ['#a3a9b6', 4], ['#9097a5', 3]])
  speckle(ctx, rand, '#b4bac6', 4, 2)
}
const AZALEA = [['#5f8f2a', 5], ['#537f24', 4], ['#6d9e33', 3], ['#46701d', 2]]
P.azalea_leaves = (ctx, rand) => leaves(ctx, rand, AZALEA, 0.1)
P.flowering_azalea = (ctx, rand) => {
  leaves(ctx, rand, AZALEA, 0.1)
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rand() * TILE)
    const y = Math.floor(rand() * TILE)
    px(ctx, x, y, '#f08cc8')
    px(ctx, x + 1, y, '#d860a8')
    px(ctx, x, y + 1, '#d860a8')
    px(ctx, x + 1, y + 1, '#b8458a')
  }
}
P.lily_pad = (ctx, rand) => {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5)
      const notch = x > 7 && Math.abs(y - 7.5) < (x - 7) * 0.45
      if (d > 7.4 || notch) continue
      px(ctx, x, y, d > 6.2 ? '#2a6a1c' : weighted(rand, [['#3f8a2a', 4], ['#4c9c33', 3], ['#357a22', 2]]))
    }
  for (let i = 0; i < 5; i++) px(ctx, 7 - i, 7 + (i % 2), '#5aad3c')
}
P.seagrass = (ctx, rand) => stems(ctx, rand, 6, [['#2f8a46', 4], ['#3c9e52', 3], ['#23703a', 2]], 1.1)
P.sugar_cane = (ctx, rand) => {
  for (const sx of [3, 7, 12]) {
    for (let y = 0; y < TILE; y++) {
      const c = y % 5 === 0 ? '#5d9a3a' : weighted(rand, [['#8fd16a', 3], ['#7cc25a', 2], ['#a3e07a', 1]])
      px(ctx, sx, y, c)
      px(ctx, sx + 1, y, shade(c, -0.12))
    }
    px(ctx, sx + 2, 4 + sx, '#6fb34a')
  }
}
P.orange_tulip = (ctx, rand) => flower(ctx, rand, '#f08a1e', '#b85c10', '#d9701a')
P.pink_tulip = (ctx, rand) => flower(ctx, rand, '#f2a3c8', '#c86a98', '#e08ab4')
P.ladder = (ctx) => {
  for (const x of [2, 3, 12, 13]) for (let y = 0; y < TILE; y++) px(ctx, x, y, x % 2 ? '#6e5230' : '#8c6a3e')
  for (const y of [1, 5, 9, 13])
    for (let x = 2; x < 14; x++) {
      px(ctx, x, y, '#a07a48')
      px(ctx, x, y + 1, '#6e5230')
    }
}
// a log lying along X: the bark grain runs horizontally on its long faces
P.oak_log_h = (ctx, rand) => {
  P.oak_log(ctx, rand)
  const d = ctx.getImageData(0, 0, TILE, TILE)
  const o = ctx.createImageData(TILE, TILE)
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) for (let k = 0; k < 4; k++) o.data[(y * TILE + x) * 4 + k] = d.data[(x * TILE + (15 - y)) * 4 + k]
  ctx.putImageData(o, 0, 0)
}

// --- animated liquids ------------------------------------------------------------------
// Seamless moving patterns: integer wave numbers across the 16 px tile, so every
// frame tiles without seams. Repainted ~10x a second by animateBlocks().
const TAU = Math.PI * 2
const grain = new Float32Array(TILE * TILE).map((_, i) => (((i * 2654435761) >>> 0) % 1000) / 1000)
const LAVA_RAMP = ['#8f2205', '#b8340a', '#d9480f', '#ef6410', '#ff8a1c', '#ffb23a', '#ffd960']
const WATER_RAMP = ['#1d38b2', '#2442c4', '#2b4fd2', '#3459dc', '#4069e4', '#5a82ee', '#86a8f6']
function liquidFrame(ctx, t, ramp, speed, flow) {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const yy = y + t * flow
      let v = 0.5
      v += 0.22 * Math.sin((TAU * (x + 2 * yy)) / 16 + t * speed)
      v += 0.18 * Math.sin((TAU * (3 * x - yy)) / 16 - t * speed * 0.7)
      v += 0.12 * Math.sin((TAU * (2 * x + 3 * yy)) / 16 + t * speed * 1.6)
      v += (grain[y * TILE + x] - 0.5) * 0.22
      const i = Math.max(0, Math.min(ramp.length - 1, Math.floor(v * ramp.length)))
      ctx.fillStyle = ramp[i]
      ctx.fillRect(x, y, 1, 1)
    }
}
P.lava = (ctx) => liquidFrame(ctx, 0, LAVA_RAMP, 0.9, 0.6)
P.water = (ctx) => liquidFrame(ctx, 0, WATER_RAMP, 1.4, 2.2)
const animated = [
  { name: 'lava', ramp: LAVA_RAMP, speed: 0.9, flow: 0.6 },
  { name: 'water', ramp: WATER_RAMP, speed: 1.4, flow: 2.2 },
]
let animAcc = 0
export function animateBlocks(dt, t) {
  animAcc += dt
  if (animAcc < 0.1) return
  animAcc = 0
  for (const a of animated) {
    const tex = cache.get(a.name)
    if (!tex) continue
    liquidFrame(tex.image.getContext('2d'), t, a.ramp, a.speed, a.flow)
    tex.needsUpdate = true
  }
}

// --- texture cache -------------------------------------------------------------------
const cache = new Map()
let seedCounter = 1000

// Canvas for a painter (exported for UI icons and particles that need raw pixels).
export function paintBlock(name) {
  const painter = P[name]
  if (!painter) throw new Error(`no block texture "${name}"`)
  const { c, ctx } = makeCtx()
  let seed = 0
  for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) | 0
  painter(ctx, mulberry32(seed ^ 0x5bd1e995))
  return c
}

export function blockTexture(name) {
  let t = cache.get(name)
  if (t) return t
  t = new CanvasTexture(paintBlock(name))
  t.colorSpace = SRGBColorSpace
  t.magFilter = NearestFilter
  t.minFilter = LinearMipmapLinearFilter
  t.wrapS = t.wrapT = RepeatWrapping
  t.anisotropy = 8
  t.generateMipmaps = true
  cache.set(name, t)
  seedCounter++
  return t
}

// Average colour of a tile (for block-chip particles and the minimap-ish UI).
const avgCache = new Map()
export function averageColor(name) {
  if (avgCache.has(name)) return avgCache.get(name)
  const c = paintBlock(name)
  const d = c.getContext('2d').getImageData(0, 0, TILE, TILE).data
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue
    r += d[i]
    g += d[i + 1]
    b += d[i + 2]
    n++
  }
  const out = n ? [r / n / 255, g / n / 255, b / n / 255] : [0.5, 0.5, 0.5]
  avgCache.set(name, out)
  return out
}

// Random opaque pixel colours from a tile (for chip particles).
export function tilePalette(name, count = 6) {
  const c = paintBlock(name)
  const d = c.getContext('2d').getImageData(0, 0, TILE, TILE).data
  const out = []
  const rand = mulberry32(name.length * 77)
  for (let tries = 0; out.length < count && tries < 200; tries++) {
    const i = Math.floor(rand() * TILE * TILE) * 4
    if (d[i + 3] > 128) out.push([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255])
  }
  return out
}

export const PAINTERS = P
