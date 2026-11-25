import { inputState } from './input.js'
import { getYaw, syncYawToPlayer } from './camera.js'
import { isFirstPerson } from './modes.js'
import { RAPIER, alpha, onTick, setStaticFocus, world } from './physics.js'
import { PHYSICS, PLAYER_DIMS, SPAWN, SPAWN_FACING } from './config.js'

// The local player singleton, mutated in place. A kinematic Rapier capsule
// driven by Rapier's KinematicCharacterController: it slides along walls,
// autosteps small ledges, climbs slopes up to PHYSICS.maxSlope, snaps down
// steps and shoves dynamic bodies (crates, balls) with PHYSICS.pushMass.
// Gravity, jumping (with coyote time and a jump buffer) and acceleration are
// ours; collision resolution is Rapier's. Stepped once per physics tick.
export const player = {
  position: { x: 0, y: 0, z: 0 }, // capsule base (feet), at the latest tick
  renderPosition: { x: 0, y: 0, z: 0 }, // feet, interpolated for this frame
  velocity: { x: 0, y: 0, z: 0 },
  grounded: true,
  facing: SPAWN_FACING, // yaw the character model faces, radians
  dims: { ...PLAYER_DIMS },
}

// What the player is moving through, set every frame by main.js (the arena's liquids,
// ladders and the drop). killY / onVoid replace the plain respawn when you fall out.
export const playerEnv = {
  swim: 0, // 0 = air, 1 = fully in a liquid (water / lava): slow, floaty, jump = swim up
  speedMul: 1,
  climb: false, // on a ladder: forward climbs, otherwise slide down slowly
  maxFall: 0, // m/s cap on falling speed (0 = none)
  killY: PHYSICS.killY,
  onVoid: null,
  // kit movement powers + statuses (set every frame by combat.js in the arena)
  jumpMul: 1, // spring boots
  airJumps: 0, // ninja double jump
  glide: false, // glider: hold jump while falling
  noJump: false, // rooted / frozen
  noSprint: false, // hungry / blocking
  swimFast: false, // poseidon: no water slowdown
}
let airJumpsLeft = 0

const HALF = PLAYER_DIMS.height / 2 // capsule centre above the feet
const prev = { x: 0, y: 0, z: 0 }
let body = null
let collider = null
let controller = null
let sinceGrounded = 0
let jumpQueued = 0 // s left on a buffered jump

export function createPlayerBody() {
  const r = PLAYER_DIMS.radius
  body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(SPAWN.x, SPAWN.y + HALF, SPAWN.z))
  collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF - r, r).setFriction(0), body)

  controller = world.createCharacterController(0.02)
  controller.setUp({ x: 0, y: 1, z: 0 })
  controller.enableAutostep(PHYSICS.stepHeight, 0.15, false)
  controller.enableSnapToGround(PHYSICS.snapToGround)
  controller.setMaxSlopeClimbAngle((PHYSICS.maxSlope * Math.PI) / 180)
  controller.setMinSlopeSlideAngle(((PHYSICS.maxSlope + 5) * Math.PI) / 180)
  controller.setApplyImpulsesToDynamicBodies(true)
  controller.setCharacterMass(PHYSICS.pushMass)

  resetPlayer()
  onTick(step)
}

export function resetPlayer(spawn = SPAWN, facing = SPAWN_FACING) {
  player.position.x = prev.x = player.renderPosition.x = spawn.x
  player.position.y = prev.y = player.renderPosition.y = spawn.y
  player.position.z = prev.z = player.renderPosition.z = spawn.z
  player.velocity.x = player.velocity.y = player.velocity.z = 0
  player.grounded = true
  player.facing = facing
  body?.setTranslation({ x: spawn.x, y: spawn.y + HALF, z: spawn.z }, true)
  body?.setNextKinematicTranslation({ x: spawn.x, y: spawn.y + HALF, z: spawn.z })
}

// A hit's knockback (combat.js): added to the velocity on the next tick, which also
// lifts you off the ground so the shove carries through the air.
const kick = { x: 0, y: 0, z: 0, on: false }
export function knockback(vx, vy, vz) {
  kick.x += vx
  kick.z += vz
  kick.y = Math.max(kick.y, vy)
  kick.on = true
}

export function respawn() {
  resetPlayer()
  syncYawToPlayer()
}

const TAU = Math.PI * 2
// Turns angle `from` toward `to` by at most maxDelta, the short way round.
function rotateTowards(from, to, maxDelta) {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  if (Math.abs(diff) <= maxDelta) return to
  return (from + Math.sign(diff) * maxDelta) % TAU
}

// Moves the (x, z) velocity toward the target as one 2D vector so it curves
// straight instead of warping axis-by-axis.
function approach2D(v, targetX, targetZ, maxDelta) {
  const dx = targetX - v.x
  const dz = targetZ - v.z
  const dist = Math.hypot(dx, dz)
  if (dist <= maxDelta || dist === 0) {
    v.x = targetX
    v.z = targetZ
  } else {
    v.x += (dx / dist) * maxDelta
    v.z += (dz / dist) * maxDelta
  }
}

function step(dt) {
  prev.x = player.position.x
  prev.y = player.position.y
  prev.z = player.position.z

  // Camera-relative ground basis.
  const yaw = getYaw()
  const fwdX = -Math.sin(yaw)
  const fwdZ = -Math.cos(yaw)
  const rightX = Math.cos(yaw)
  const rightZ = -Math.sin(yaw)
  const mv = inputState.move
  const len = Math.hypot(mv.x, mv.z)
  const scale = len > 1 ? 1 / len : 1
  const wishX = (fwdX * mv.z + rightX * mv.x) * scale
  const wishZ = (fwdZ * mv.z + rightZ * mv.x) * scale
  const env = playerEnv
  const sprint = inputState.sprint && !env.noSprint
  const speed = (sprint ? PHYSICS.sprintSpeed : PHYSICS.walkSpeed) * env.speedMul * (1 - env.swim * (env.swimFast ? 0 : 0.45))
  const gliding = env.glide && inputState.jumpHeld && !player.grounded && env.swim < 0.3 && player.velocity.y < 0

  const rate = gliding ? PHYSICS.airAccel * 1.6 : !player.grounded ? PHYSICS.airAccel : len > 0.01 ? PHYSICS.accel : PHYSICS.decel
  approach2D(player.velocity, wishX * speed, wishZ * speed, rate * dt)

  // Jump: buffered a little before landing, and allowed a little after leaving a ledge.
  if (inputState.jump) {
    jumpQueued = PHYSICS.jumpBuffer
    inputState.jump = false
  }
  sinceGrounded = player.grounded ? 0 : sinceGrounded + dt
  if (player.grounded || env.swim > 0.3) airJumpsLeft = env.airJumps
  if (env.noJump) jumpQueued = 0
  let jumped = false
  if (jumpQueued > 0 && env.swim > 0.3 && !player.grounded) {
    // a swim stroke upward (tap jump to rise, enough to climb out over a bank)
    player.velocity.y = Math.max(player.velocity.y, 5.6)
    jumpQueued = 0
    jumped = true
  } else if (jumpQueued > 0 && sinceGrounded <= PHYSICS.coyoteTime) {
    player.velocity.y = PHYSICS.jumpSpeed * (env.swim > 0.3 ? 1.05 : env.jumpMul)
    jumpQueued = 0
    sinceGrounded = PHYSICS.coyoteTime + 1
    jumped = true
  } else if (jumpQueued > 0 && airJumpsLeft > 0 && !player.grounded && sinceGrounded > 0.15) {
    // double jump
    player.velocity.y = PHYSICS.jumpSpeed * 0.95
    airJumpsLeft--
    jumpQueued = 0
    jumped = true
  }
  jumpQueued = Math.max(0, jumpQueued - dt)
  if (kick.on) {
    player.velocity.x += kick.x
    player.velocity.z += kick.z
    player.velocity.y = Math.max(player.velocity.y, kick.y)
    kick.x = kick.y = kick.z = 0
    kick.on = false
    jumped = true
  }

  player.velocity.y += PHYSICS.gravity * dt * (1 - env.swim * 0.7)
  if (env.swim > 0.3) {
    player.velocity.y *= Math.exp(-2.2 * dt) // water drag
    if (player.velocity.y < -3) player.velocity.y = -3
  }
  if (env.climb) {
    if (mv.z > 0.2 || mv.x * mv.x > 0.04) player.velocity.y = 3.4
    else if (player.velocity.y < -1.6) player.velocity.y = -1.6
  }
  if (env.maxFall && player.velocity.y < -env.maxFall) player.velocity.y = -env.maxFall
  if (gliding && player.velocity.y < -2.4) player.velocity.y = -2.4
  if (player.grounded && !jumped && player.velocity.y < -2) player.velocity.y = -2 // stay pressed to slopes

  const desired = { x: player.velocity.x * dt, y: player.velocity.y * dt, z: player.velocity.z * dt }
  const at = body.translation()
  setStaticFocus(at.x, at.y, at.z) // simulate the static colliders around us (physics.js)
  controller.computeColliderMovement(collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
  const moved = controller.computedMovement()
  player.grounded = !jumped && controller.computedGrounded()

  // Blocked vertically: a ceiling stops the rise, the floor stops the fall.
  if (player.velocity.y > 0 && moved.y < desired.y * 0.5) player.velocity.y = 0
  if (player.grounded && player.velocity.y < 0) player.velocity.y = Math.max(player.velocity.y, -2)
  // Horizontal velocity is left alone: the controller already slides along walls,
  // and scaling it by moved/desired would also bleed speed on every ramp and step.

  const t = at
  const next = { x: t.x + moved.x, y: t.y + moved.y, z: t.z + moved.z }
  body.setNextKinematicTranslation(next)
  player.position.x = next.x
  player.position.y = next.y - HALF
  player.position.z = next.z

  if (player.position.y < env.killY) {
    if (env.onVoid) env.onVoid()
    else respawn()
    return
  }

  // The body turns toward its heading; in first person it always faces the view.
  if (isFirstPerson()) player.facing = yaw + Math.PI
  else if (Math.hypot(wishX, wishZ) > 0.05) {
    player.facing = rotateTowards(player.facing, Math.atan2(wishX, wishZ), PHYSICS.turnSpeed * dt)
  }
}

// Called once per frame after the physics ticks: interpolated feet position.
export function interpolate() {
  const p = player.position
  const r = player.renderPosition
  r.x = prev.x + (p.x - prev.x) * alpha
  r.y = prev.y + (p.y - prev.y) * alpha
  r.z = prev.z + (p.z - prev.z) * alpha
}
