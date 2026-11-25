// Effects: a small CPU particle engine drawn as GPU points (sparkles, soft
// glows, smoke, pixel chips), light beams over the crates, blocky clouds,
// bobbing floating rocks, and the ambient emitters (falling leaves, pollen,
// fireflies at night, campfire embers and smoke, motes rising out of the shaft).
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  NormalBlending,
  Points,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three'
import { mulberry32 } from '../textures.js'
import { VoxelWorld } from '../voxel/voxels.js'

// --- Point textures -------------------------------------------------------------------------
function texFrom(draw, size = 64) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  draw(c.getContext('2d'), size)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
const softTex = () =>
  texFrom((ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  })
// four-point star with a hot centre, like a glint
const starTex = () =>
  texFrom((ctx, s) => {
    const m = s / 2
    const g = ctx.createRadialGradient(m, m, 0, m, m, m * 0.5)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(m, 0)
    ctx.quadraticCurveTo(m, m, s, m)
    ctx.quadraticCurveTo(m, m, m, s)
    ctx.quadraticCurveTo(m, m, 0, m)
    ctx.quadraticCurveTo(m, m, m, 0)
    ctx.fill()
  })
const squareTex = () =>
  texFrom((ctx, s) => {
    ctx.fillStyle = '#fff'
    ctx.fillRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(s * 0.1, s * 0.6, s * 0.8, s * 0.3)
  }, 16)

// --- Particle system -----------------------------------------------------------------------------
const vert = /* glsl */ `
  attribute float size; attribute vec4 tint;
  uniform float scale;
  varying vec4 vTint;
  void main() {
    vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`
const frag = /* glsl */ `
  uniform sampler2D map; uniform float hdr;
  varying vec4 vTint;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    float a = t.a * vTint.a;
    if (a < 0.01) discard;
    gl_FragColor = vec4(t.rgb * vTint.rgb * hdr, a);
  }`

export class Particles {
  constructor(max, { texture, additive = true, hdr = 1, depthTest = true }) {
    this.max = max
    this.n = 0
    this.p = [] // pool of particle records
    for (let i = 0; i < max; i++) this.p.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 0, sway: 0, ph: 0, fadeIn: 0.1 })
    this.pos = new Float32Array(max * 3)
    this.size = new Float32Array(max)
    this.tint = new Float32Array(max * 4)
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(this.pos, 3))
    geo.setAttribute('size', new BufferAttribute(this.size, 1))
    geo.setAttribute('tint', new BufferAttribute(this.tint, 4))
    geo.setDrawRange(0, 0)
    this.material = new ShaderMaterial({
      uniforms: { map: { value: texture }, scale: { value: 600 }, hdr: { value: hdr } },
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      depthTest,
      blending: additive ? AdditiveBlending : NormalBlending,
    })
    this.points = new Points(geo, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
    this.geo = geo
  }
  emit(o) {
    if (this.n >= this.max) return null
    const q = this.p[this.n++]
    q.x = o.x
    q.y = o.y
    q.z = o.z
    q.vx = o.vx ?? 0
    q.vy = o.vy ?? 0
    q.vz = o.vz ?? 0
    q.life = 0
    q.max = o.life ?? 1
    q.s0 = o.size ?? 0.2
    q.s1 = o.sizeEnd ?? q.s0
    const c = o.color
    q.r = c ? c.r : 1
    q.g = c ? c.g : 1
    q.b = c ? c.b : 1
    q.a = o.alpha ?? 1
    q.grav = o.gravity ?? 0
    q.drag = o.drag ?? 0
    q.sway = o.sway ?? 0
    q.ph = Math.random() * 6.28
    q.fadeIn = o.fadeIn ?? 0.12
    q.twinkle = o.twinkle ?? 0
    return q
  }
  update(dt, camera, viewportH) {
    this.material.uniforms.scale.value = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360))
    let i = 0
    while (i < this.n) {
      const q = this.p[i]
      q.life += dt
      if (q.life >= q.max) {
        // swap-remove
        this.n--
        this.p[i] = this.p[this.n]
        this.p[this.n] = q
        continue
      }
      q.vy += q.grav * dt
      const d = Math.exp(-q.drag * dt)
      q.vx *= d
      q.vy *= d
      q.vz *= d
      q.x += q.vx * dt + (q.sway ? Math.sin(q.life * 2.2 + q.ph) * q.sway * dt : 0)
      q.y += q.vy * dt
      q.z += q.vz * dt + (q.sway ? Math.cos(q.life * 1.7 + q.ph) * q.sway * dt : 0)
      const t = q.life / q.max
      const fade = Math.min(1, t / q.fadeIn) * Math.min(1, (1 - t) / 0.3)
      const tw = q.twinkle ? 0.55 + 0.45 * Math.sin(q.life * q.twinkle + q.ph) : 1
      this.pos[i * 3] = q.x
      this.pos[i * 3 + 1] = q.y
      this.pos[i * 3 + 2] = q.z
      this.size[i] = q.s0 + (q.s1 - q.s0) * t
      this.tint[i * 4] = q.r
      this.tint[i * 4 + 1] = q.g
      this.tint[i * 4 + 2] = q.b
      this.tint[i * 4 + 3] = q.a * fade * tw
      i++
    }
    this.geo.setDrawRange(0, this.n)
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.size.needsUpdate = true
    this.geo.attributes.tint.needsUpdate = true
  }
}

// --- Light beam over a crate ---------------------------------------------------------------------
function beamMaterial(color, k) {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { time: { value: 0 }, color: { value: new Color(color) }, k: { value: k } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying vec3 vCenter;
      void main() {
        vUv = uv;
        vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float time; uniform vec3 color; uniform float k;
      varying vec2 vUv; varying vec3 vN; varying vec3 vView; varying vec3 vCenter;
      void main() {
        // soft edges: brightest where the cylinder faces the camera
        float facing = abs(dot(normalize(vec3(vN.x, 0.0, vN.z)), normalize(vec3(vView.x, 0.0, vView.z))));
        float edge = pow(facing, 2.2);
        float h = vUv.y;
        float fade = pow(1.0 - h, 1.6) * smoothstep(0.0, 0.03, h);
        float streak = 0.75 + 0.25 * sin((h * 40.0 - time * 3.0) + sin(vUv.x * 18.0) * 1.5);
        float a = edge * fade * streak * smoothstep(0.6, 2.5, length(cameraPosition.xz - vCenter.xz));
        gl_FragColor = vec4(color * k * a, a);
      }`,
  })
}
export function buildBeam(color, height = 26) {
  const g = new Group()
  const outer = beamMaterial(color, 1.1)
  const inner = beamMaterial(color, 1.0)
  const o = new CylinderGeometry(0.34, 0.42, height, 20, 1, true)
  o.translate(0, height / 2, 0)
  const i = new CylinderGeometry(0.1, 0.14, height * 0.8, 12, 1, true)
  i.translate(0, height * 0.4, 0)
  const ma = new MeshHelper(o, outer)
  const mb = new MeshHelper(i, inner)
  g.add(ma, mb)
  return {
    root: g,
    update(t, boost = 0) {
      outer.uniforms.time.value = t
      inner.uniforms.time.value = t * 1.3
      outer.uniforms.k.value = 1.1 + boost * 2
      inner.uniforms.k.value = 1.0 + boost * 1.6
    },
  }
}
// Mesh with sane defaults for additive effects
class MeshHelper extends Mesh {
  constructor(geo, mat) {
    super(geo, mat)
    this.renderOrder = 2
    this.frustumCulled = false
  }
}

// --- Blocky clouds ------------------------------------------------------------------------------
export function buildClouds() {
  const rand = mulberry32(99)
  const cell = 12
  const grid = 40
  const cells = []
  // blobs of cells on a coarse grid
  for (let b = 0; b < 18; b++) {
    const cx = Math.floor(rand() * grid)
    const cz = Math.floor(rand() * grid)
    const w = 2 + Math.floor(rand() * 5)
    const d = 1 + Math.floor(rand() * 4)
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) if (rand() > 0.15) cells.push([cx + x, cz + z - Math.floor(x / 3)])
  }
  const uniq = [...new Set(cells.map((c) => c.join(',')))].map((s) => s.split(',').map(Number))
  const geo = new BoxGeometry(cell, 4, cell)
  const mat = new MeshLambertMaterial({ color: '#ffffff', emissive: '#e8f1ff', emissiveIntensity: 0.6, transparent: true, opacity: 0.72, depthWrite: false, fog: false })
  const inst = new InstancedMesh(geo, mat, uniq.length)
  const m = new Matrix4()
  uniq.forEach(([x, z], i) => {
    m.makeTranslation((x - grid / 2) * cell, 0, (z - grid / 2) * cell)
    inst.setMatrixAt(i, m)
  })
  inst.frustumCulled = false
  const g = new Group()
  g.add(inst)
  g.position.y = 96
  const span = grid * cell
  return {
    root: g,
    update(dt, focus) {
      inst.position.x += dt * 1.2
      if (inst.position.x > span / 2) inst.position.x -= span
      g.position.x = focus.x
      g.position.z = focus.z
    },
  }
}

// --- Floating rocks -----------------------------------------------------------------------------
export function buildFloatingRocks(list) {
  const g = new Group()
  const items = []
  const rand = mulberry32(77)
  for (const r of list) {
    const W = new VoxelWorld()
    const n = r.size === 2 ? 3 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 2)
    W.set(0, 0, 0, r.tex)
    for (let i = 1; i < n; i++) {
      const dir = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]][Math.floor(rand() * 5)]
      W.set(dir[0] * Math.ceil(i / 2), dir[1] * (i % 2), dir[2] * Math.ceil(i / 2), rand() < 0.6 ? r.tex : 'stone')
    }
    if (r.size === 2 && rand() < 0.5) W.set(0, 1, 0, 'grass')
    const mesh = W.buildMesh()
    mesh.castShadow = false
    mesh.position.set(r.x, r.y, r.z)
    mesh.rotation.y = rand() * Math.PI * 2
    g.add(mesh)
    items.push({ mesh, y: r.y, ph: rand() * 6.28, sp: 0.3 + rand() * 0.4, rot: (rand() - 0.5) * 0.08 })
  }
  return {
    root: g,
    update(t, dt) {
      for (const it of items) {
        it.mesh.position.y = it.y + Math.sin(t * it.sp + it.ph) * 0.45
        it.mesh.rotation.y += it.rot * dt
      }
    },
  }
}

export const TEX = { soft: softTex, star: starTex, square: squareTex }
