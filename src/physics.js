// Rapier physics world. Steps at a fixed rate (PHYSICS.fixedStep) from an
// accumulator; every dynamic body bound to a mesh keeps its previous and
// current transform so rendering interpolates between ticks (smooth at any
// refresh rate). Static geometry registers fixed colliders through the add*
// helpers (mirrored into a never-stepped query world, see below); the player's
// kinematic capsule lives in player.js.
import RAPIER from '@dimforge/rapier3d-compat'
import { Quaternion, Vector3 } from 'three'
import { PHYSICS } from './config.js'

export { RAPIER }
export let world = null

const synced = [] // { body, mesh, prev: {p, q}, curr: {p, q} }
const tickListeners = []
let accumulator = 0
export let alpha = 0 // 0..1 of the way from the last tick to the next one

// --- Static colliders: queried everywhere, simulated only near the player ------
// Rapier's step (broad phase + query-pipeline rebuild) costs time for every
// enabled collider, even ones that never move: the lobby + arena voxels are
// ~6.5k cuboids, which made each 60 Hz tick cost 3-4 ms. So each fixed collider
// exists twice: in `staticWorld`, which is never stepped and answers the
// static-only ray casts from anywhere (camera, bot line of sight, aiming), and
// in `world`, where it is enabled only within NEAR_CELLS cells of the focus
// (the player's capsule: the only body that touches static geometry; the bots
// are kinematic and walk the voxels themselves).
const CELL = 8 // m
const NEAR_CELLS = 1 // enabled: the focus cell and its neighbours (>= 8 m of margin; a tick moves < 1.5 m)
let staticWorld = null
let staticDirty = false // staticWorld's query pipeline needs a rebuild
const fixed = new Set() // { main, stat, c0, c1, on, always }
let focus = null // { x, y, z } cell of the focus

export async function initPhysics() {
  await RAPIER.init()
  world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 })
  world.timestep = PHYSICS.fixedStep
  staticWorld = new RAPIER.World({ x: 0, y: 0, z: 0 })
  return world
}

const nearFocus = (r) =>
  r.always ||
  (!!focus &&
    r.c1[0] >= focus.x - NEAR_CELLS && r.c0[0] <= focus.x + NEAR_CELLS &&
    r.c1[1] >= focus.y - NEAR_CELLS && r.c0[1] <= focus.y + NEAR_CELLS &&
    r.c1[2] >= focus.z - NEAR_CELLS && r.c0[2] <= focus.z + NEAR_CELLS)

// Call before moving the player's controller, with its position. Cheap unless
// the focus enters a new cell; then colliders are switched on/off and the
// stepped world's query pipeline is refreshed so the controller sees them at once.
export function setStaticFocus(x, y, z) {
  const cx = Math.floor(x / CELL)
  const cy = Math.floor(y / CELL)
  const cz = Math.floor(z / CELL)
  if (focus && focus.x === cx && focus.y === cy && focus.z === cz) return
  focus = { x: cx, y: cy, z: cz }
  let changed = false
  for (const r of fixed) {
    const want = nearFocus(r)
    if (want === r.on) continue
    r.main.setEnabled(want)
    r.on = want
    changed = true
  }
  if (changed) world.queryPipeline.update(world.colliders)
}

// fn(dt) runs before every physics tick (the player controller moves here).
export function onTick(fn) {
  tickListeners.push(fn)
}

// Advances the simulation by real frame time; returns the number of ticks run.
export function stepPhysics(frameDt) {
  accumulator = Math.min(accumulator + frameDt, PHYSICS.fixedStep * PHYSICS.maxSubSteps)
  let ticks = 0
  while (accumulator >= PHYSICS.fixedStep) {
    for (const s of synced) {
      s.prev.p.copy(s.curr.p)
      s.prev.q.copy(s.curr.q)
    }
    for (const fn of tickListeners) fn(PHYSICS.fixedStep)
    world.step()
    for (const s of synced) readBody(s.body, s.curr)
    accumulator -= PHYSICS.fixedStep
    ticks++
  }
  alpha = accumulator / PHYSICS.fixedStep
  for (const s of synced) {
    s.mesh.position.lerpVectors(s.prev.p, s.curr.p, alpha)
    s.mesh.quaternion.slerpQuaternions(s.prev.q, s.curr.q, alpha)
  }
  return ticks
}

function readBody(body, out) {
  const t = body.translation()
  const r = body.rotation()
  out.p.set(t.x, t.y, t.z)
  out.q.set(r.x, r.y, r.z, r.w)
}

// --- Builders ----------------------------------------------------------------

// Binds a mesh to a body so the mesh follows it (interpolated).
export function bindMesh(body, mesh) {
  const s = { body, mesh, prev: { p: new Vector3(), q: new Quaternion() }, curr: { p: new Vector3(), q: new Quaternion() } }
  readBody(body, s.curr)
  s.prev.p.copy(s.curr.p)
  s.prev.q.copy(s.curr.q)
  mesh.position.copy(s.curr.p)
  mesh.quaternion.copy(s.curr.q)
  synced.push(s)
  return s
}

export function unbindMesh(mesh) {
  const i = synced.findIndex((s) => s.mesh === mesh)
  if (i >= 0) synced.splice(i, 1)
}

// Dynamic body + collider for a mesh, placed where the mesh currently is.
// `shape` is a Rapier ColliderDesc; material props tune feel per object.
export function addDynamic(mesh, shape, { density = 1, friction = 0.6, restitution = 0.1, linearDamping = 0.05, angularDamping = 0.1, ccd = false } = {}) {
  const q = mesh.quaternion
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
    .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
    .setLinearDamping(linearDamping)
    .setAngularDamping(angularDamping)
    .setCcdEnabled(ccd)
  const body = world.createRigidBody(desc)
  world.createCollider(shape.setDensity(density).setFriction(friction).setRestitution(restitution), body)
  bindMesh(body, mesh)
  return body
}

// Fixed collider at a world transform (no body needed for static geometry).
// Returns a handle for removeFixed.
export function addFixed(shape, position, rotation = null, { friction = 0.8, restitution = 0 } = {}) {
  shape.setTranslation(position.x, position.y, position.z).setFriction(friction).setRestitution(restitution)
  if (rotation) shape.setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w })
  const r = { main: world.createCollider(shape), stat: staticWorld.createCollider(shape), on: true, always: false }
  // cell range from the shape's bounds: an exact box when unrotated, else a bounding sphere
  const s = shape.shape
  let he = null
  if (s.halfExtents && !rotation) he = s.halfExtents
  else {
    const rad = s.halfExtents ? Math.hypot(s.halfExtents.x, s.halfExtents.y, s.halfExtents.z) : s.radius !== undefined ? Math.hypot(s.radius, s.halfHeight ?? 0) : null
    if (rad === null) r.always = true // unknown shape: keep it simulated everywhere
    else he = { x: rad, y: rad, z: rad }
  }
  if (he) {
    r.c0 = [Math.floor((position.x - he.x) / CELL), Math.floor((position.y - he.y) / CELL), Math.floor((position.z - he.z) / CELL)]
    r.c1 = [Math.floor((position.x + he.x) / CELL), Math.floor((position.y + he.y) / CELL), Math.floor((position.z + he.z) / CELL)]
  }
  if (!nearFocus(r)) {
    r.main.setEnabled(false)
    r.on = false
  }
  fixed.add(r)
  staticDirty = true
  return r
}

export function removeFixed(r) {
  if (!fixed.delete(r)) return
  world.removeCollider(r.main, false)
  staticWorld.removeCollider(r.stat, false)
  staticDirty = true
}

// Fixed box matching a BoxGeometry mesh (uses the mesh's world position/rotation and geometry size).
export function addFixedBoxFor(mesh, opts) {
  const p = mesh.geometry.parameters
  const s = mesh.scale
  return addFixed(RAPIER.ColliderDesc.cuboid((p.width * s.x) / 2, (p.height * s.y) / 2, (p.depth * s.z) / 2), mesh.position, mesh.quaternion, opts)
}

export function removeBody(body) {
  world.removeRigidBody(body)
}

// First fixed collider hit between two points, as a 0..1 fraction of the
// segment (1 = clear). Crates, balls and the player never block it.
const STATIC_ONLY = () => RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS
export function segmentClear(ax, ay, az, bx, by, bz) {
  if (!world) return 1
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.hypot(dx, dy, dz)
  if (len < 1e-4) return 1
  if (staticDirty) {
    staticWorld.queryPipeline.update(staticWorld.colliders)
    staticDirty = false
  }
  const r = new RAPIER.Ray({ x: ax, y: ay, z: az }, { x: dx / len, y: dy / len, z: dz / len })
  const hit = staticWorld.castRay(r, len, true, STATIC_ONLY())
  if (!hit) return 1
  return (hit.timeOfImpact ?? hit.toi) / len
}

export const bodyCount = () => (world ? world.bodies.len() : 0)
