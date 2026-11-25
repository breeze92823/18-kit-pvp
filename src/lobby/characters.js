// Blocky humanoids for NPCs and lobby players: 32 px tall (1.8 m), a 64x64
// skin painted per pixel (face, hair, clothes with shading), an optional
// outer layer (hair volume / jacket), optional armor (iron or dark), a held
// item, a pulsing outline highlight, name tags, and procedural animation
// (walk cycle, idle sway, head tracking, sword swing).
//
// Z-fighting: every layer is a separate, strictly larger box (outer layer
// +0.5 px per side, armor +1 px), so no two visible faces share a plane.
import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three'
import { mulberry32 } from '../textures.js'
import { itemMesh } from './models.js'
import { fontReady } from '../propkit.js'

const PX = 1.8 / 32
const S = 64 // skin texture size

// MC-style unfolded box layout: [right][front][left][back] with top/bottom above.
function regions(u, v, w, h, d) {
  return {
    top: [u + d, v, w, d],
    bottom: [u + d + w, v, w, d],
    right: [u, v + d, d, h], // -X side (the character's right when facing +Z)
    front: [u + d, v + d, w, h],
    left: [u + d + w, v + d, d, h], // +X side
    back: [u + d + w + d, v + d, w, h],
  }
}
const PARTS = {
  head: { uv: [0, 0], size: [8, 8, 8], over: [32, 0] },
  body: { uv: [16, 16], size: [8, 12, 4], over: [16, 32] },
  armR: { uv: [40, 16], size: [4, 12, 4], over: [40, 32] },
  armL: { uv: [32, 48], size: [4, 12, 4], over: [48, 48] },
  legR: { uv: [0, 16], size: [4, 12, 4], over: [0, 32] },
  legL: { uv: [16, 48], size: [4, 12, 4], over: [0, 48] },
}

// BoxGeometry with UVs remapped to skin regions. Face order: +X, -X, +Y, -Y, +Z, -Z.
function skinBox(w, h, d, inflate, uv, texSize = S, texH = S) {
  const g = new BoxGeometry((w + inflate * 2) * PX, (h + inflate * 2) * PX, (d + inflate * 2) * PX)
  const r = regions(uv[0], uv[1], w, h, d)
  const order = [r.left, r.right, r.top, r.bottom, r.front, r.back]
  const a = g.attributes.uv
  for (let f = 0; f < 6; f++) {
    const [rx, ry, rw, rh] = order[f]
    for (let k = 0; k < 4; k++) {
      const ix = k % 2
      const iy = Math.floor(k / 2)
      a.setXY(f * 4 + k, (rx + ix * rw) / texSize, 1 - (ry + iy * rh) / texH)
    }
  }
  return g
}

// --- Skin painter ---------------------------------------------------------------------------
// spec: { skin, hair, hairStyle: short|long|bun|cap|none, eyes, shirt, shirt2, stripes, pants, shoes,
//         jacket, belt, mouth, beard, seed }
function paintSkin(spec) {
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')
  const rand = mulberry32(spec.seed ?? 7)
  const px = (x, y, col) => {
    ctx.fillStyle = col
    ctx.fillRect(x, y, 1, 1)
  }
  const rect = (r, col, jitter = 0.06) => {
    const [x, y, w, h] = r
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) px(x + i, y + j, jitter ? vary(col, (rand() - 0.5) * jitter) : col)
  }
  const all = (part, col, layer = 'uv', jitter) => {
    const p = PARTS[part]
    const [u, v] = p[layer]
    const r = regions(u, v, ...p.size)
    for (const k of Object.keys(r)) rect(r[k], col, jitter)
    return r
  }
  // base layer: skin everywhere, then clothes
  for (const p of Object.keys(PARTS)) all(p, spec.skin, 'uv', 0.04)
  // shirt on body and the top of the arms (sleeves)
  const body = all('body', spec.shirt, 'uv', 0.08)
  for (const arm of ['armR', 'armL']) {
    const r = regions(...PARTS[arm].uv, ...PARTS[arm].size)
    for (const k of ['front', 'back', 'left', 'right']) rect([r[k][0], r[k][1], r[k][2], spec.sleeve ?? 5], spec.shirt, 0.08)
    rect(r.top, spec.shirt, 0.08)
    if (spec.gloves) for (const k of ['front', 'back', 'left', 'right']) rect([r[k][0], r[k][1] + 10, r[k][2], 2], spec.gloves, 0.06)
  }
  if (spec.stripes) {
    for (const k of ['front', 'back', 'left', 'right']) {
      const [x, y, w, h] = body[k]
      for (let j = 1; j < h; j += 3) rect([x, y + j, w, 1], spec.stripes, 0.05)
    }
  }
  if (spec.shirt2) {
    // open jacket / vest panel down the front middle
    const [x, y] = body.front
    rect([x + 3, y, 2, 12], spec.shirt2, 0.05)
  }
  // collar shadow + belt
  rect([body.front[0], body.front[1], 8, 1], vary(spec.shirt, -0.25), 0)
  if (spec.belt) for (const k of ['front', 'back', 'left', 'right']) rect([body[k][0], body[k][1] + 10, body[k][2], 1], spec.belt, 0.04)
  // legs: pants + shoes
  for (const leg of ['legR', 'legL']) {
    const r = all(leg, spec.pants, 'uv', 0.08)
    for (const k of ['front', 'back', 'left', 'right']) rect([r[k][0], r[k][1] + 9, r[k][2], 3], spec.shoes, 0.06)
    rect(r.bottom, spec.shoes, 0.04)
  }
  // head: hair on top / back / sides, face on the front
  const head = regions(...PARTS.head.uv, ...PARTS.head.size)
  const hair = spec.hair
  rect(head.top, hair, 0.12)
  rect(head.back, hair, 0.12)
  rect([head.right[0], head.right[1], 8, spec.hairStyle === 'long' ? 8 : 3], hair, 0.12)
  rect([head.left[0], head.left[1], 8, spec.hairStyle === 'long' ? 8 : 3], hair, 0.12)
  const [fx, fy] = head.front
  rect([fx, fy, 8, spec.hairStyle === 'none' ? 1 : 2], hair, 0.12) // fringe
  if (spec.hairStyle === 'long' || spec.hairStyle === 'bangs') {
    px(fx, fy + 2, hair)
    px(fx + 7, fy + 2, hair)
    px(fx, fy + 3, hair)
    px(fx + 7, fy + 3, hair)
    px(fx + 1, fy + 2, vary(hair, -0.1))
  }
  // eyes (white + iris), brows, nose shading, mouth
  px(fx + 1, fy + 4, '#ffffff')
  px(fx + 2, fy + 4, spec.eyes)
  px(fx + 5, fy + 4, spec.eyes)
  px(fx + 6, fy + 4, '#ffffff')
  px(fx + 1, fy + 3, vary(hair, -0.2))
  px(fx + 2, fy + 3, vary(hair, -0.2))
  px(fx + 5, fy + 3, vary(hair, -0.2))
  px(fx + 6, fy + 3, vary(hair, -0.2))
  px(fx + 3, fy + 5, vary(spec.skin, -0.12))
  px(fx + 4, fy + 5, vary(spec.skin, -0.12))
  const mouth = spec.mouth ?? vary(spec.skin, -0.35)
  px(fx + 3, fy + 6, mouth)
  px(fx + 4, fy + 6, mouth)
  if (spec.beard) rect([fx + 1, fy + 6, 6, 2], spec.beard, 0.1)
  if (spec.blush) {
    px(fx + 1, fy + 5, spec.blush)
    px(fx + 6, fy + 5, spec.blush)
  }

  // outer layer (alpha): long hair volume, hood or jacket
  const over = (part, fn) => {
    const p = PARTS[part]
    fn(regions(p.over[0], p.over[1], ...p.size))
  }
  if (spec.hairStyle === 'long' || spec.hairStyle === 'bun') {
    over('head', (r) => {
      rect(r.top, hair, 0.14)
      rect(r.back, hair, 0.14)
      rect([r.right[0], r.right[1], 8, 7], hair, 0.14)
      rect([r.left[0], r.left[1], 8, 7], hair, 0.14)
      rect([r.front[0], r.front[1], 8, 1], hair, 0.14)
    })
  }
  if (spec.hairStyle === 'cap') {
    over('head', (r) => {
      rect(r.top, spec.capColor, 0.06)
      for (const k of ['front', 'back', 'left', 'right']) rect([r[k][0], r[k][1], r[k][2], 2], spec.capColor, 0.06)
    })
  }
  if (spec.jacket) {
    over('body', (r) => {
      for (const k of ['back', 'left', 'right']) rect(r[k], spec.jacket, 0.08)
      rect([r.front[0], r.front[1], 3, 12], spec.jacket, 0.08)
      rect([r.front[0] + 5, r.front[1], 3, 12], spec.jacket, 0.08)
      rect(r.top, spec.jacket, 0.08)
    })
    for (const arm of ['armR', 'armL'])
      over(arm, (r) => {
        for (const k of ['front', 'back', 'left', 'right']) rect([r[k][0], r[k][1], r[k][2], 10], spec.jacket, 0.08)
        rect(r.top, spec.jacket, 0.08)
      })
  }
  return c
}
function vary(hex, k) {
  const n = parseInt(hex.slice(1), 16)
  const f = (c) => Math.max(0, Math.min(255, Math.round(k >= 0 ? c + (255 - c) * k : c * (1 + k))))
  const r = f((n >> 16) & 255)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

// --- Armor textures (64 x 32 like the classic armor sheet) -------------------------------------
const ARMOR = {
  iron: { base: '#d4d4d4', light: '#f4f4f4', dark: '#9a9a9a', edge: '#6a6a6a', trim: '#bcbcbc' },
  dark: { base: '#3b3638', light: '#5a5457', dark: '#262224', edge: '#141213', trim: '#7a4fb0' },
  gold: { base: '#f0c832', light: '#fff09a', dark: '#c89614', edge: '#8a6408', trim: '#fff6c8' },
  leather: { base: '#8a5a32', light: '#a8744a', dark: '#6a4224', edge: '#3a2412', trim: '#c89a6a' },
  chain: { base: '#8e9298', light: '#c4c8cc', dark: '#5a5e64', edge: '#34363a', trim: '#2a2c30' },
  diamond: { base: '#4ad8d0', light: '#a8fff6', dark: '#2a9a98', edge: '#14585a', trim: '#e0fffa' },
  emerald: { base: '#3ac06a', light: '#8af0a8', dark: '#1e8a44', edge: '#0e4a22', trim: '#d0ffd8' },
  ruby: { base: '#d8302a', light: '#ff8a7a', dark: '#9a1a14', edge: '#4a0806', trim: '#ffd0a0' },
  frost: { base: '#d8f0ff', light: '#ffffff', dark: '#9cc4f6', edge: '#4a7ab0', trim: '#8ad8ff' },
}
const ARMOR_PARTS = {
  head: { uv: [0, 0], size: [8, 8, 8] },
  body: { uv: [16, 16], size: [8, 12, 4] },
  arm: { uv: [40, 16], size: [4, 12, 4] },
  leg: { uv: [0, 16], size: [4, 12, 4] },
}
function paintArmor(kind) {
  const P = ARMOR[kind]
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 32
  const ctx = c.getContext('2d')
  const rand = mulberry32(kind.length * 13)
  const px = (x, y, col) => {
    ctx.fillStyle = col
    ctx.fillRect(x, y, 1, 1)
  }
  const plate = ([x, y, w, h], skip) => {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (skip && skip(i, j, w, h)) continue
        const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1
        let col = rand() < 0.15 ? P.light : rand() < 0.2 ? P.dark : P.base
        if (edge) col = P.edge
        else if (j === 1) col = P.light
        px(x + i, y + j, col)
      }
  }
  // helmet: everything but the face opening
  const h = regions(...ARMOR_PARTS.head.uv, ...ARMOR_PARTS.head.size)
  plate(h.top)
  plate(h.back)
  plate(h.left, (i, j) => j > 5 && i < 3)
  plate(h.right, (i, j) => j > 5 && i > 4)
  plate(h.front, (i, j) => j >= 3 && j <= 6 && i >= 1 && i <= 6)
  // chestplate: torso + upper arms
  const b = regions(...ARMOR_PARTS.body.uv, ...ARMOR_PARTS.body.size)
  for (const k of ['front', 'back', 'left', 'right', 'top']) plate(b[k], (i, j) => j > 9)
  for (let j = 2; j < 9; j++) px(b.front[0] + 3, b.front[1] + j, P.dark), px(b.front[0] + 4, b.front[1] + j, P.trim)
  const a = regions(...ARMOR_PARTS.arm.uv, ...ARMOR_PARTS.arm.size)
  for (const k of ['front', 'back', 'left', 'right', 'top']) plate(a[k], (i, j) => k !== 'top' && j > 4)
  // leggings top + boots bottom on the leg sheet
  const l = regions(...ARMOR_PARTS.leg.uv, ...ARMOR_PARTS.leg.size)
  for (const k of ['front', 'back', 'left', 'right']) plate(l[k], (i, j) => j > 6 && j < 9)
  plate(l.top)
  plate(l.bottom)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.magFilter = t.minFilter = NearestFilter
  t.generateMipmaps = false
  return t
}
const armorTexCache = {}
const armorMat = (kind) => {
  armorTexCache[kind] ||= new MeshStandardMaterial({ map: paintArmor(kind), alphaTest: 0.5, roughness: kind === 'leather' ? 0.85 : kind === 'dark' ? 0.45 : 0.32, metalness: kind === 'leather' ? 0.05 : kind === 'frost' ? 0.3 : 0.75 })
  return armorTexCache[kind]
}

// --- Name tags -----------------------------------------------------------------------------------
// lines: [{ text, color, size, bg }] drawn top to bottom; returns a Sprite sized in metres.
export function nameTag(lines, height = 0.5) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  const draw = () => {
    const font = (l) => `${l.weight ?? 700} ${l.size ?? 40}px Fredoka, "Arial Rounded MT Bold", sans-serif`
    let w = 0
    let hTot = 0
    for (const l of lines) {
      ctx.font = font(l)
      l._w = ctx.measureText(l.text).width + (l.heart ? (l.size ?? 40) * 1.1 : 0)
      l._h = (l.size ?? 40) * 1.28
      w = Math.max(w, l._w)
      hTot += l._h
    }
    c.width = Math.ceil(w + 28)
    c.height = Math.ceil(hTot + 12)
    let y = 6
    for (const l of lines) {
      ctx.font = font(l)
      if (l.bg) {
        ctx.fillStyle = l.bg
        ctx.fillRect((c.width - l._w) / 2 - 10, y, l._w + 20, l._h)
      }
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      const x0 = (c.width - l._w) / 2
      ctx.lineJoin = 'round'
      if (l.outline !== false) {
        ctx.lineWidth = Math.max(3, (l.size ?? 40) * 0.14)
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'
        ctx.strokeText(l.text, x0, y + l._h / 2 + 2)
      }
      ctx.fillStyle = l.color ?? '#fff'
      ctx.fillText(l.text, x0, y + l._h / 2 + 2)
      if (l.heart) {
        const s = l.size ?? 40
        heartPath(ctx, x0 + ctx.measureText(l.text).width + s * 0.2, y + l._h / 2 - s * 0.38, s * 0.8)
      }
      y += l._h
    }
    tex.needsUpdate = true
    sprite.scale.set((height * c.width) / c.height, height, 1)
  }
  draw()
  fontReady.then(draw)
  sprite.userData.redraw = (next) => {
    lines = next
    draw()
  }
  sprite.renderOrder = 5
  return sprite
}
function heartPath(ctx, x, y, s) {
  ctx.fillStyle = '#ff2b3a'
  ctx.beginPath()
  ctx.moveTo(x + s / 2, y + s * 0.95)
  ctx.bezierCurveTo(x - s * 0.15, y + s * 0.45, x + s * 0.05, y - s * 0.05, x + s / 2, y + s * 0.28)
  ctx.bezierCurveTo(x + s * 0.95, y - s * 0.05, x + s * 1.15, y + s * 0.45, x + s / 2, y + s * 0.95)
  ctx.fill()
}

// --- Character ------------------------------------------------------------------------------------
// opts: { skin: spec, armor: 'iron'|'dark'|'gold'|null, armorParts: {helmet,chest,legs},
//         item: 'sword'|..., outline: '#hex', tag: lines, tagHeight }
export function buildCharacter(opts) {
  const root = new Group()
  const skinTex = new CanvasTexture(paintSkin(opts.skin))
  skinTex.colorSpace = SRGBColorSpace
  skinTex.magFilter = skinTex.minFilter = NearestFilter
  skinTex.generateMipmaps = false
  const skinMat = new MeshStandardMaterial({ map: skinTex, roughness: 0.85 })
  const overMat = new MeshStandardMaterial({ map: skinTex, roughness: 0.85, alphaTest: 0.5 })
  const hasOver = opts.skin.hairStyle === 'long' || opts.skin.hairStyle === 'bun' || opts.skin.hairStyle === 'cap' || !!opts.skin.jacket

  const outlineMat = opts.outline ? new MeshBasicMaterial({ color: opts.outline, side: BackSide, transparent: true, opacity: 0.95 }) : null
  const meshes = []
  const add = (parent, geo, mat, x, y, z, shadow = false) => {
    const m = new Mesh(geo, mat)
    m.position.set(x, y, z)
    m.castShadow = shadow // only the base skin layer: overlays add draw calls, not visible shadow
    m.receiveShadow = false
    parent.add(m)
    meshes.push(m)
    return m
  }
  const parts = {}
  // pivots: head at the neck, arms at the shoulders, legs at the hips
  const mk = (name, px, py, pz) => {
    const g = new Group()
    g.position.set(px * PX, py * PX, pz * PX)
    root.add(g)
    parts[name] = g
    return g
  }
  const hips = 12
  const neck = 24
  const head = mk('head', 0, neck, 0)
  const body = mk('body', 0, hips, 0)
  const armR = mk('armR', -6, neck - 2, 0)
  const armL = mk('armL', 6, neck - 2, 0)
  const legR = mk('legR', -2, hips, 0)
  const legL = mk('legL', 2, hips, 0)

  const layer = (part, group, ox, oy, oz) => {
    const p = PARTS[part]
    add(group, skinBox(...p.size, 0, p.uv), skinMat, ox, oy, oz, true)
    if (hasOver) add(group, skinBox(...p.size, 0.5, p.over), overMat, ox, oy, oz)
    if (outlineMat) {
      const inflate = (hasOver ? 0.5 : 0) + 0.45
      const o = new Mesh(skinBox(...p.size, inflate, p.uv), outlineMat)
      o.position.set(ox, oy, oz)
      group.add(o)
    }
  }
  layer('head', head, 0, 4 * PX, 0)
  layer('body', body, 0, 6 * PX, 0)
  layer('armR', armR, 0, -4 * PX, 0)
  layer('armL', armL, 0, -4 * PX, 0)
  layer('legR', legR, 0, -6 * PX, 0)
  layer('legL', legL, 0, -6 * PX, 0)

  if (opts.armor) {
    const m = armorMat(opts.armor)
    const ap = opts.armorParts ?? { helmet: true, chest: true, legs: true }
    const a = (part, group, size, uv, inflate, ox, oy, oz) => {
      const g = skinBox(...size, inflate, uv, 64, 32)
      add(group, g, m, ox, oy, oz)
    }
    const inf = hasOver ? 1.1 : 1
    if (ap.helmet) a('head', head, [8, 8, 8], ARMOR_PARTS.head.uv, inf, 0, 4 * PX, 0)
    if (ap.chest) {
      a('body', body, [8, 12, 4], ARMOR_PARTS.body.uv, inf, 0, 6 * PX, 0)
      a('arm', armR, [4, 12, 4], ARMOR_PARTS.arm.uv, inf, 0, -4 * PX, 0)
      a('arm', armL, [4, 12, 4], ARMOR_PARTS.arm.uv, inf, 0, -4 * PX, 0)
    }
    if (ap.legs) {
      a('leg', legR, [4, 12, 4], ARMOR_PARTS.leg.uv, inf * 0.8, 0, -6 * PX, 0)
      a('leg', legL, [4, 12, 4], ARMOR_PARTS.leg.uv, inf * 0.8, 0, -6 * PX, 0)
    }
  }

  if (opts.item) {
    // held in the right hand, blade pointing forward
    const it = itemMesh(opts.item, 0.72, 1)
    it.position.set(0, -10.5 * PX, 2.2 * PX)
    it.rotation.set(-Math.PI / 2 + 0.25, Math.PI / 2, 0)
    it.rotation.order = 'YXZ'
    it.rotation.set(0.2, -Math.PI / 2, Math.PI * 0.75)
    armR.add(it)
    parts.item = it
  }

  let tag = null
  if (opts.tag) {
    tag = nameTag(opts.tag, opts.tagHeight ?? 0.42)
    tag.position.y = 32 * PX + (opts.armor ? 0.1 : 0) + (opts.tagHeight ?? 0.42) / 2 + 0.12
    root.add(tag)
  }

  // --- animation state ---
  const anim = { phase: 0, swing: 0, lookYaw: 0, lookPitch: 0, wantYaw: 0, wantPitch: 0, time: Math.random() * 10 }
  const api = {
    root,
    parts,
    tag,
    outlineMat,
    // speed m/s; look: optional { yaw, pitch } relative to the body
    animate(dt, speed = 0, look = null) {
      anim.time += dt
      const t = anim.time
      const walk = Math.min(1, speed / 4)
      anim.phase += dt * (3 + speed * 1.8)
      const sw = Math.sin(anim.phase) * 0.75 * walk
      parts.legR.rotation.x = sw
      parts.legL.rotation.x = -sw
      const idle = Math.sin(t * 1.3) * 0.04 * (1 - walk)
      parts.armR.rotation.x = -sw * 0.9 + idle
      parts.armL.rotation.x = sw * 0.9 - idle
      parts.armR.rotation.z = 0.05 + Math.sin(t * 1.1) * 0.02
      parts.armL.rotation.z = -0.05 - Math.sin(t * 1.1) * 0.02
      if (opts.item) parts.armR.rotation.x -= 0.25 // carry the sword a little forward
      // sword swing overlay
      if (anim.swing > 0) {
        anim.swing = Math.max(0, anim.swing - dt * 3.2)
        const s = Math.sin((1 - anim.swing) * Math.PI)
        parts.armR.rotation.x -= s * 1.6
        parts.armR.rotation.z += s * 0.3
        parts.body.rotation.y = s * 0.2
      } else parts.body.rotation.y *= 0.9
      // head look, eased
      anim.wantYaw = look ? Math.max(-1.1, Math.min(1.1, look.yaw)) : Math.sin(t * 0.37) * 0.25 * (1 - walk)
      anim.wantPitch = look ? Math.max(-0.5, Math.min(0.6, look.pitch)) : 0
      const k = 1 - Math.exp(-6 * dt)
      anim.lookYaw += (anim.wantYaw - anim.lookYaw) * k
      anim.lookPitch += (anim.wantPitch - anim.lookPitch) * k
      parts.head.rotation.y = anim.lookYaw
      parts.head.rotation.x = anim.lookPitch
      // bob
      root.children.forEach(() => {})
      parts.body.position.y = 12 * PX + Math.abs(Math.sin(anim.phase)) * 0.03 * walk
      if (outlineMat) outlineMat.opacity = 0.75 + Math.sin(t * 3) * 0.2
    },
    swing() {
      if (anim.swing <= 0) anim.swing = 1
    },
    setVisible(v) {
      root.visible = v
    },
  }
  return api
}

// --- Wolf (the Wolf Tamer's summon) ------------------------------------------------------------------
// A blocky tamed wolf with a red collar. Same api as buildCharacter, so the bot code can drive it:
// parts.armR/armL are the front legs, legR/legL the back legs, `head` bites on swing().
const WOLF_MATS = {}
function wolfMat(hex) {
  return (WOLF_MATS[hex] ||= new MeshStandardMaterial({ color: hex, roughness: 0.9 }))
}
export function buildWolf(opts = {}) {
  const root = new Group()
  const box = (parent, w, h, d, x, y, z, hex, shadow = true) => {
    const m = new Mesh(new BoxGeometry(w * PX, h * PX, d * PX), wolfMat(hex))
    m.position.set(x * PX, y * PX, z * PX)
    m.castShadow = shadow
    parent.add(m)
    return m
  }
  const FUR = '#d6d6da'
  const FUR2 = '#a9a9b2'
  const parts = {}
  const mk = (name, x, y, z) => {
    const g = new Group()
    g.position.set(x * PX, y * PX, z * PX)
    root.add(g)
    parts[name] = g
    return g
  }
  const legY = 8
  const body = mk('body', 0, legY, 0)
  box(body, 6, 6, 10, 0, 3, -0.5, FUR)
  box(body, 7, 7, 5, 0, 3.5, 3.5, FUR2) // mane
  box(body, 7.2, 1.6, 1.4, 0, 6.2, 5.6, '#c82a2a', false) // collar
  const head = mk('head', 0, legY + 4, 6.5)
  box(head, 6, 6, 4, 0, 1, 2, FUR)
  box(head, 3, 3, 4, 0, -0.5, 5.5, FUR2) // snout
  box(head, 1.2, 1.2, 0.6, 0, 0.4, 7.6, '#2a2a30', false) // nose
  box(head, 2, 2, 1.6, -2, 4.5, 1.5, FUR2) // ears
  box(head, 2, 2, 1.6, 2, 4.5, 1.5, FUR2)
  box(head, 1, 1, 0.4, -1.6, 2, 4.1, '#1a1a1a', false) // eyes
  box(head, 1, 1, 0.4, 1.6, 2, 4.1, '#1a1a1a', false)
  const leg = (name, x, z) => {
    const g = mk(name, x, legY, z)
    box(g, 2, legY, 2, 0, -legY / 2, 0, FUR)
    return g
  }
  leg('armR', -2, 3.5)
  leg('armL', 2, 3.5)
  leg('legR', -2, -4.5)
  leg('legL', 2, -4.5)
  const tail = mk('tail', 0, legY + 4.5, -5.5)
  box(tail, 2, 2, 7, 0, 0, -3.2, FUR2)
  tail.rotation.x = 0.6

  let tag = null
  if (opts.tag) {
    tag = nameTag(opts.tag, opts.tagHeight ?? 0.42)
    tag.position.y = 1.05 + (opts.tagHeight ?? 0.42) / 2
    root.add(tag)
  }
  const anim = { phase: 0, bite: 0, time: Math.random() * 10, yaw: 0 }
  return {
    root,
    parts,
    tag,
    outlineMat: null,
    animate(dt, speed = 0, look = null) {
      anim.time += dt
      const walk = Math.min(1, speed / 4)
      anim.phase += dt * (5 + speed * 2.2)
      const sw = Math.sin(anim.phase) * 0.8 * walk
      parts.armR.rotation.x = sw
      parts.legL.rotation.x = sw
      parts.armL.rotation.x = -sw
      parts.legR.rotation.x = -sw
      tail.rotation.y = Math.sin(anim.time * (walk > 0.1 ? 14 : 6)) * 0.45
      body.position.y = legY * PX + Math.abs(Math.sin(anim.phase)) * 0.03 * walk
      anim.yaw += ((look ? Math.max(-0.8, Math.min(0.8, look.yaw)) : 0) - anim.yaw) * Math.min(1, dt * 6)
      head.rotation.y = anim.yaw
      if (anim.bite > 0) {
        anim.bite = Math.max(0, anim.bite - dt * 4)
        const s = Math.sin((1 - anim.bite) * Math.PI)
        head.rotation.x = s * 0.5
        head.position.z = (6.5 + s * 1.5) * PX
      } else head.rotation.x = look ? Math.max(-0.4, Math.min(0.4, look.pitch)) * 0.5 : 0
    },
    swing() {
      if (anim.bite <= 0) anim.bite = 1
    },
    setVisible(v) {
      root.visible = v
    },
  }
}

// --- Skin presets ------------------------------------------------------------------------------------
export const SKINS = {
  kitMaster: { seed: 3, skin: '#f0c49a', hair: '#6b4426', hairStyle: 'long', eyes: '#3a7a3a', shirt: '#e0a21c', stripes: '#3a2410', pants: '#5a3a1e', shoes: '#3a2410', jacket: '#c98a14', belt: '#2a1a0a', blush: '#f0a090', sleeve: 12, gloves: '#3a2410' },
  duelist: { seed: 4, skin: '#c89070', hair: '#1a1a1a', hairStyle: 'short', eyes: '#c03030', shirt: '#2a2a30', pants: '#1e1e24', shoes: '#111114', belt: '#7a4fb0', beard: '#1a1a1a' },
  merchant: { seed: 5, skin: '#e8b48a', hair: '#8a5a2a', hairStyle: 'cap', capColor: '#2f6fd0', eyes: '#2a4a8a', shirt: '#f2f2f2', shirt2: '#2f6fd0', pants: '#4a3a2a', shoes: '#2a1a10', belt: '#5a3a1a', beard: '#8a5a2a' },
}
const HAIRS = ['#2a1a0e', '#6b4426', '#c8a050', '#1a1a1a', '#a0401e', '#e8e0d0', '#4a2a5a']
const SHIRTS = ['#2f6fd0', '#d03a3a', '#3a9a4a', '#e0a21c', '#8a4ad0', '#e05a9a', '#3ab0c0', '#f2f2f2']
const PANTS = ['#2a3a5a', '#3a2a1a', '#1e1e24', '#4a4a4a', '#2a4a2a']
const SKINTONES = ['#f0c49a', '#e8b48a', '#c89070', '#a06a48', '#7a4a30', '#f6d4b4']
export function randomSkin(seed) {
  const r = mulberry32(seed)
  const pick = (l) => l[Math.floor(r() * l.length)]
  const styles = ['short', 'short', 'long', 'bangs', 'cap', 'bun']
  return {
    seed,
    skin: pick(SKINTONES),
    hair: pick(HAIRS),
    hairStyle: pick(styles),
    capColor: pick(SHIRTS),
    eyes: pick(['#2a4a8a', '#3a7a3a', '#5a3a1a', '#2a2a2a']),
    shirt: pick(SHIRTS),
    shirt2: r() < 0.3 ? pick(SHIRTS) : null,
    stripes: r() < 0.2 ? '#ffffff' : null,
    pants: pick(PANTS),
    shoes: '#2a2018',
    belt: r() < 0.5 ? '#3a2410' : null,
    jacket: r() < 0.25 ? pick(['#5a3a1e', '#2a2a30', '#3a4a6a']) : null,
  }
}
