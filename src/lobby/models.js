// Detailed prop models built from pixel-exact boxes: extruded pixel items
// (the sword in your hand, bots' swords), the two crates (chest with a hinged
// lid; the ranked one with a glowing seam and gem), lanterns and the campfire.
//
// Z-fighting: attachments (latches, bands, caps) always overlap their parent
// by a fraction of a pixel or sit proud of it, so no visible faces are coplanar.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three'
import { ART } from './pixelart.js'
import { blockTexture } from '../voxel/blocktex.js'
import { neon } from '../propkit.js'
import { mulberry32 } from '../textures.js'

const PX = 1 / 16

// --- Extruded pixel item -------------------------------------------------------------
// One cube per opaque pixel; side faces only where the neighbour pixel is empty.
// `size` = world length of the 16 px edge; `depth` = thickness in pixels.
const itemCache = new Map()
export function itemGeometry(name, size = 1, depth = 1) {
  const k = `${name}|${size}|${depth}`
  if (itemCache.has(k)) return itemCache.get(k)
  const a = ART[name]
  const h = a.rows.length
  const w = a.rows[0].length
  const s = size / w
  const t = depth * s
  const on = (x, y) => x >= 0 && y >= 0 && x < w && y < h && a.rows[y][x] !== '.'
  const pos = []
  const nor = []
  const col = []
  const c = new Color()
  const quad = (p, n, color, shadeK) => {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      pos.push(...p[i])
      nor.push(...n)
      col.push(color.r * shadeK, color.g * shadeK, color.b * shadeK)
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue
      c.set(a.pal[a.rows[y][x]])
      const x0 = (x - w / 2) * s
      const x1 = x0 + s
      const y1 = (h / 2 - y) * s
      const y0 = y1 - s
      const z0 = -t / 2
      const z1 = t / 2
      quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], c, 1)
      quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], c, 0.8)
      if (!on(x + 1, y)) quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], c, 0.7)
      if (!on(x - 1, y)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], c, 0.7)
      if (!on(x, y - 1)) quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], c, 0.9)
      if (!on(x, y + 1)) quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], c, 0.6)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.computeBoundingSphere()
  itemCache.set(k, g)
  return g
}
const itemMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 })
export function itemMesh(name, size = 1, depth = 1, material = itemMat) {
  const m = new Mesh(itemGeometry(name, size, depth), material)
  m.castShadow = true
  return m
}

// --- Canvas helpers ---------------------------------------------------------------------
function pixTex(w, h, paint) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  paint(ctx, w, h)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.magFilter = NearestFilter
  t.generateMipmaps = false
  t.minFilter = NearestFilter
  return t
}
function fillNoise(ctx, w, h, colors, rand) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = colors[Math.floor(rand() * colors.length)]
      ctx.fillRect(x, y, 1, 1)
    }
}

// --- Crates (chests) -----------------------------------------------------------------------
// kind 'normal': oak chest, iron latch. kind 'ranked': obsidian chest, glowing violet seam + gem.
export function buildChest(kind = 'normal') {
  const rand = mulberry32(kind === 'normal' ? 5 : 9)
  const ranked = kind === 'ranked'
  const wood = ranked ? ['#1b1229', '#140d1e', '#22163a', '#2a1a3d'] : ['#a8783a', '#9a6c32', '#b38343', '#8f6330']
  const rim = ranked ? '#3c2556' : '#5a3a18'
  const rimDark = ranked ? '#0e0915' : '#3e2810'
  const trim = ranked ? '#9b4dff' : '#7a5226'

  const face = (w, h, opts = {}) =>
    pixTex(w, h, (ctx) => {
      fillNoise(ctx, w, h, wood, rand)
      if (!ranked) {
        // plank seams
        for (let y = 3; y < h; y += 4) {
          ctx.fillStyle = '#7a5226'
          ctx.fillRect(1, y, w - 2, 1)
        }
      } else {
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = '#5a3a82'
          ctx.fillRect(Math.floor(rand() * w), Math.floor(rand() * h), 1, 1)
        }
      }
      ctx.fillStyle = rim
      ctx.fillRect(0, 0, w, 1)
      ctx.fillRect(0, h - 1, w, 1)
      ctx.fillRect(0, 0, 1, h)
      ctx.fillRect(w - 1, 0, 1, h)
      ctx.fillStyle = rimDark
      if (opts.bottomDark) ctx.fillRect(0, h - 1, w, 1)
      if (opts.topTrim) {
        ctx.fillStyle = trim
        ctx.fillRect(1, h - 2, w - 2, 1)
      }
    })
  const mat = (t, extra) => new MeshStandardMaterial({ map: t, roughness: ranked ? 0.35 : 0.8, metalness: ranked ? 0.2 : 0, ...extra })

  const root = new Group()
  // base: 14 x 10 x 14 px
  const baseSide = mat(face(14, 10, { bottomDark: true }))
  const baseTop = mat(face(14, 14))
  const base = new Mesh(new BoxGeometry(14 * PX, 10 * PX, 14 * PX), [baseSide, baseSide, baseTop, baseTop, baseSide, baseSide])
  base.position.y = 5 * PX
  base.castShadow = base.receiveShadow = true
  root.add(base)

  // lid: 14 x 5 x 14 px hinged at the back top edge
  const lidPivot = new Group()
  lidPivot.position.set(0, 10 * PX, -7 * PX)
  const lidSide = mat(face(14, 5, { topTrim: false }))
  const lidTop = mat(face(14, 14))
  const lid = new Mesh(new BoxGeometry(14 * PX, 5 * PX, 14 * PX), [lidSide, lidSide, lidTop, lidTop, lidSide, lidSide])
  lid.position.set(0, 2.5 * PX, 7 * PX)
  lid.castShadow = lid.receiveShadow = true
  lidPivot.add(lid)
  root.add(lidPivot)

  // latch: 2 x 4 x 1 px on the front, half on the lid; sinks 0.25 px into the lid so its back face is hidden
  const latchMat = ranked ? neon('#d36bff', 3.2) : new MeshStandardMaterial({ color: '#c8c8c8', roughness: 0.35, metalness: 0.8 })
  const latch = new Mesh(new BoxGeometry(2 * PX, 4 * PX, 1.25 * PX), latchMat)
  latch.position.set(0, 1 * PX, 14 * PX + 0.5 * PX)
  lidPivot.add(latch)

  // inside glow (seen when the lid opens): an unlit plane just below the base top... the base top
  // is solid, so the glow sits 0.5 px ABOVE it and is hidden by the closed lid.
  const innerGlow = new Mesh(new PlaneGeometry(12 * PX, 12 * PX), neon(ranked ? '#e070ff' : '#ffd35a', 2.6, { transparent: true, opacity: 0 }))
  innerGlow.rotation.x = -Math.PI / 2
  innerGlow.position.y = 10.5 * PX
  root.add(innerGlow)

  let band = null
  if (ranked) {
    // glowing seam: a ring 0.4 px proud of the chest sides, 1 px tall, around the lid line
    band = new Mesh(new BoxGeometry(14.8 * PX, 1 * PX, 14.8 * PX), neon('#b44dff', 3))
    band.position.y = 10 * PX
    root.add(band)
    // gold corner clasps on the lid
    const claspMat = new MeshStandardMaterial({ color: '#e8b830', roughness: 0.3, metalness: 0.9 })
    for (const sx of [-1, 1]) {
      const clasp = new Mesh(new BoxGeometry(2.2 * PX, 5.4 * PX, 2.2 * PX), claspMat)
      clasp.position.set(sx * 6.1 * PX, 2.5 * PX, 13.1 * PX)
      lidPivot.add(clasp)
    }
  }

  return {
    root,
    lidPivot,
    band,
    latch,
    innerGlow,
    setOpen(t) {
      // t: 0 closed .. 1 open (eased by the caller)
      lidPivot.rotation.x = -t * 1.75
      innerGlow.material.opacity = Math.min(1, t * 1.4)
      if (band) band.visible = t < 0.05
    },
  }
}

// --- Lantern ------------------------------------------------------------------------------
// Iron cage with a warm glowing core, cap and handle; `hang` adds a chain above.
export function buildLantern({ hang = false } = {}) {
  const g = new Group()
  const iron = new MeshStandardMaterial({ color: '#2d2c33', roughness: 0.5, metalness: 0.7 })
  const glassTex = pixTex(6, 7, (ctx) => {
    ctx.fillStyle = '#2d2c33'
    ctx.fillRect(0, 0, 6, 7)
    ctx.fillStyle = '#ffb347'
    ctx.fillRect(1, 1, 4, 5)
    ctx.fillStyle = '#fff0b0'
    ctx.fillRect(2, 2, 2, 3)
  })
  const emissive = pixTex(6, 7, (ctx) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, 6, 7)
    ctx.fillStyle = '#ff9a2a'
    ctx.fillRect(1, 1, 4, 5)
    ctx.fillStyle = '#ffe9a0'
    ctx.fillRect(2, 2, 2, 3)
  })
  const bulb = new MeshStandardMaterial({ map: glassTex, emissiveMap: emissive, emissive: '#ffffff', emissiveIntensity: 1.4, roughness: 0.4 })
  const body = new Mesh(new BoxGeometry(6 * PX, 7 * PX, 6 * PX), bulb)
  body.position.y = 3.5 * PX
  const cap = new Mesh(new BoxGeometry(4 * PX, 2 * PX, 4 * PX), iron)
  cap.position.y = 7.9 * PX // overlaps the body top by 0.1 px
  const handle = new Mesh(new BoxGeometry(3 * PX, 1.2 * PX, 0.8 * PX), iron)
  handle.position.y = 9.4 * PX
  g.add(body, cap, handle)
  for (const m of [body, cap, handle]) m.castShadow = true
  if (hang) {
    const chain = new Mesh(new BoxGeometry(1 * PX, 8 * PX, 1 * PX), iron)
    chain.position.y = 13.5 * PX
    g.add(chain)
  }
  g.userData.bulb = bulb
  return g
}

// --- Flame shader (campfire, lanterns' sparks use particles) --------------------------------
export function flameMaterial(k = 2.4) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { time: { value: 0 }, k: { value: k } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float time; uniform float k; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main() {
        // pixelate to 16 px so the flame matches the blocky world
        vec2 uv = (floor(vUv * 16.0) + 0.5) / 16.0;
        float n = noise(vec2(uv.x * 5.0, uv.y * 3.0 - time * 3.2)) * 0.6 + noise(vec2(uv.x * 11.0, uv.y * 7.0 - time * 5.0)) * 0.4;
        float width = (1.0 - uv.y) * 0.55 + 0.05;
        float d = abs(uv.x - 0.5) / width;
        float body = smoothstep(1.0, 0.2, d + (n - 0.5) * 0.9 + uv.y * 0.35);
        float core = smoothstep(0.75, 0.0, d + uv.y * 0.9 - n * 0.3);
        vec3 col = mix(vec3(0.85, 0.18, 0.02), vec3(1.0, 0.62, 0.12), body);
        col = mix(col, vec3(1.0, 0.95, 0.6), core);
        float a = body * smoothstep(1.0, 0.55, uv.y);
        gl_FragColor = vec4(col * k * a, a);
      }`,
  })
}

// --- Campfire -----------------------------------------------------------------------------------
export function buildCampfire() {
  const g = new Group()
  const logMat = new MeshStandardMaterial({ map: blockTexture('spruce_log'), roughness: 0.95 })
  const charMat = new MeshStandardMaterial({ map: blockTexture('dark_log'), roughness: 1 })
  // two logs along X on the ground, two along Z resting on them (overlapping 0.5 px: no shared planes)
  for (const z of [-0.28, 0.28]) {
    const log = new Mesh(new BoxGeometry(1, 4 * PX, 4 * PX), logMat)
    log.position.set(0, 2 * PX, z)
    g.add(log)
  }
  for (const x of [-0.28, 0.28]) {
    const log = new Mesh(new BoxGeometry(4 * PX, 4 * PX, 1), charMat)
    log.position.set(x, 5.5 * PX, 0)
    g.add(log)
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true
  })
  // glowing embers bed between the logs
  const embers = new Mesh(new BoxGeometry(6 * PX, 1.5 * PX, 6 * PX), neon('#ff5a14', 2.2))
  embers.position.y = 0.9 * PX
  g.add(embers)
  // crossed flame planes
  const flames = []
  for (let i = 0; i < 2; i++) {
    const mat = flameMaterial(2.6)
    const plane = new Mesh(new PlaneGeometry(0.95, 1.15), mat)
    plane.position.y = 0.62
    plane.rotation.y = i * (Math.PI / 2) + Math.PI / 4
    plane.renderOrder = 2
    g.add(plane)
    flames.push(mat)
  }
  return {
    root: g,
    update(t) {
      for (let i = 0; i < flames.length; i++) flames[i].uniforms.time.value = t + i * 3.7
    },
  }
}

// Plain unlit additive material for glints.
export const glintMat = (color) => new MeshBasicMaterial({ color, transparent: true, blending: AdditiveBlending, depthWrite: false })
