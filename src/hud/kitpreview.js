// The Kits screen's live preview: two blocky fighters duelling on a strip of
// grass in front of a pale sky. Drawn with the main renderer (main.js skips the
// game render while the Kits screen is open), so it costs no second WebGL
// context. The left fighter wears the previewed kit (armor set + held item);
// the right one is a plain iron swordsman. Characters are cached per kit.
import {
  CanvasTexture,
  CircleGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector2,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildCharacter, randomSkin } from '../lobby/characters.js'
import { blockTexture } from '../voxel/blocktex.js'

const FRONT = 2.5 // z of the grass strip's front face
const BACK = -5 // its far edge: the sky shows right behind the fighters
const FACE = Math.PI / 2 - 0.38 // fighters turn a little toward the camera
const CYCLE = 2.6 // seconds per exchange of blows

function skyTexture() {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#a9cfdf')
  g.addColorStop(0.55, '#d4e2e8')
  g.addColorStop(1, '#eceff0')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 256)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
function tiled(name, rx, ry) {
  const t = blockTexture(name).clone()
  t.repeat.set(rx, ry)
  t.needsUpdate = true
  return t
}

export function createKitPreview(renderer) {
  const scene = new Scene()
  scene.background = skyTexture()
  const pm = new PMREMGenerator(renderer)
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.55
  pm.dispose()

  scene.add(new HemisphereLight('#ffffff', '#7a6a48', 1.6))
  const sun = new DirectionalLight('#fff6e8', 2.2)
  sun.position.set(4, 8, 9)
  scene.add(sun)

  // ground: a strip of grass (top + side) over dirt, facing the camera
  const depth = FRONT - BACK
  const top = new Mesh(new PlaneGeometry(120, depth), new MeshLambertMaterial({ map: tiled('grass_top', 120, depth) }))
  top.rotation.x = -Math.PI / 2
  top.position.set(0, 0, (FRONT + BACK) / 2)
  const side = new Mesh(new PlaneGeometry(120, 1), new MeshLambertMaterial({ map: tiled('grass_side', 120, 1) }))
  side.position.set(0, -0.5, FRONT)
  const dirt = new Mesh(new PlaneGeometry(120, 14), new MeshLambertMaterial({ map: tiled('dirt', 120, 14) }))
  dirt.position.set(0, -8, FRONT)
  scene.add(top, side, dirt)

  const blobGeo = new CircleGeometry(0.42, 20)
  const blobMat = new MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false })
  const blob = () => {
    const m = new Mesh(blobGeo, blobMat)
    m.rotation.x = -Math.PI / 2
    m.position.y = 0.012
    scene.add(m)
    return m
  }

  const camera = new PerspectiveCamera(30, 1, 0.1, 200)
  camera.position.set(0, 1.75, 12)
  camera.lookAt(0, 0.9, 0)
  const dist = camera.position.distanceTo({ x: 0, y: 0.9, z: 0 })

  // --- fighters ---
  const cache = new Map()
  const mine = (kit) => {
    if (!cache.has(kit.id)) {
      const skin = { ...randomSkin(7), shirt: kit.color, hairStyle: 'short' }
      cache.set(kit.id, buildCharacter({ skin, armor: kit.armorSet, item: kit.icon }))
    }
    return cache.get(kit.id)
  }
  const foe = buildCharacter({ skin: { ...randomSkin(21), hairStyle: 'short' }, armor: 'iron', item: 'sword' })
  const holder = new Group()
  scene.add(holder, foe.root)
  const blobs = [blob(), blob()]

  // A = previewed kit (left), B = foe (right)
  const F = [
    { ch: null, x: -1.5, kb: 0, y: 0, vy: 0, lastX: -1.5, swung: false, hit: false },
    { ch: foe, x: 1.5, kb: 0, y: 0, vy: 0, lastX: 1.5, swung: false, hit: false },
  ]
  let t = 0
  let kitId = null

  function setKit(kit) {
    if (kit.id === kitId) return
    kitId = kit.id
    holder.clear()
    F[0].ch = mine(kit)
    holder.add(F[0].ch.root)
  }

  function step(dt) {
    t += dt
    const ph = t % CYCLE
    const gap = 2.35 + Math.sin(t * 1.9) * 0.45
    for (let i = 0; i < 2; i++) {
      const f = F[i]
      const o = F[1 - i]
      const dir = i === 0 ? -1 : 1 // side of the arena (left / right)
      // this fighter swings at its moment in the cycle; the blow lands a bit later
      const at = i === 0 ? 0.35 : 0.35 + CYCLE / 2
      const since = ph - at
      if (since >= 0 && since < 0.1 && !f.swung) {
        f.swung = true
        f.ch.swing()
      }
      if (since >= 0.18 && f.swung && !f.hit) {
        f.hit = true
        o.kb += 1.1 // knock the other one back and up
        o.vy = 3.2
      }
      if (since < 0 || since > 1) f.swung = f.hit = false
      // physics: hop + knockback that eases back toward the centre
      f.vy -= 14 * dt
      f.y = Math.max(0, f.y + f.vy * dt)
      if (f.y === 0) f.vy = Math.max(0, f.vy)
      f.kb *= Math.exp(-2.2 * dt)
      f.x = dir * (gap / 2 + f.kb)
      const speed = Math.min(4, Math.abs(f.x - f.lastX) / Math.max(dt, 1e-4)) + 1.6
      f.lastX = f.x
      const r = f.ch.root
      r.position.set(f.x, f.y, 0)
      r.rotation.y = i === 0 ? FACE : -FACE
      f.ch.animate(dt, f.y > 0 ? 0.4 : speed, { yaw: 0, pitch: 0.05 })
      blobs[i].position.x = f.x
      blobs[i].scale.setScalar(1 - Math.min(0.5, f.y * 0.6))
    }
  }

  const size = new Vector2()
  // view: { cx, cy, pw, ph } in CSS px; the fighters are centred on (cx, cy)
  // and scaled to fit a pw x ph box.
  function render(dt, view) {
    step(Math.min(dt, 0.05))
    renderer.getSize(size)
    const W = size.x
    const H = size.y
    const s = Math.max(20, Math.min(view.pw / 7.2, view.ph / 3.3)) // px per metre
    camera.fov = (2 * Math.atan(H / s / 2 / dist) * 180) / Math.PI
    camera.aspect = W / H
    camera.setViewOffset(W, H, W / 2 - view.cx, H / 2 - view.cy, W, H)
    camera.updateProjectionMatrix()
    renderer.setRenderTarget(null)
    renderer.render(scene, camera)
  }

  return { setKit, render }
}
