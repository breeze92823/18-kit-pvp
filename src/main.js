import { ACESFilmicToneMapping, Clock, Group, PCFSoftShadowMap, PerspectiveCamera, Ray, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer } from 'three'
import { ARENA, CAMERA, COARSE_POINTER, graphicsPreset, KITS, LOBBY, PHYSICS, RENDER, SPAWN, SPAWN_FACING } from './config.js'
import * as bloxity from './bloxity.js'
import { inputState, install as installInput, isLocked, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { getYaw, setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { getMode, isFirstPerson, onModeChanged, setMode, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createLobby } from './lobby/index.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { createHud } from './hud/hud.js'
import { createViewmodel } from './viewmodel.js'
import { addXp, addGold, changed, dailyStatus, giveItem, state } from './state.js'
import { roll } from './crates.js'
import * as sfx from './audio.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> lobby + sky + lighting,
// player body -> HUD -> avatar (async, swaps in when ready) -> loop. The SDK is optional at every step.
let lighting = null
let renderer = null
let postfx = null

// Settings come from the portal's settings menu (or their defaults offline).
function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
let hud = null
// Esc closes an open menu first, then opens the portal menu.
installInput(() => {
  if (!hud?.closePanel()) bloxity.showMenu()
}, renderer.domElement)

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
scene.add(camera) // the held item is a child of the camera
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + lobby + sky ----------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
bloxity.loadingStep('Building the lobby')
const lobby = createLobby(scene, lighting, {
  onEvent: (msg, color = '#ffe04a') => hud?.feed(`<span style="color:${color}">${msg}</span>`),
})
createPlayerBody()
syncYawToPlayer()

// positional ambience: campfire, the crate beams, wind in the shaft
{
  const A = lobby.anchors
  sfx.addLoop('fire', A.campfire.x, 0.6, A.campfire.z, 14)
  sfx.addLoop('beam', A.crates.normal.x, 1.5, A.crates.normal.z, 9, 1)
  sfx.addLoop('beam', A.crates.ranked.x, 1.5, A.crates.ranked.z, 9, 0.75)
  sfx.addLoop('shaft', A.hole.x, -4, A.hole.z, 16)
}
sfx.setVolume('sfx', state.settings.sfx)
sfx.setVolume('ambience', state.settings.ambience)
const unlockAudio = () => sfx.unlock()
window.addEventListener('pointerdown', unlockAudio, { capture: true })
window.addEventListener('keydown', unlockAudio, { capture: true })

// --- Player avatar ----------------------------------------------------------
// The Bloxity base rig (player.glb; procedural fallback if it fails), dressed
// with the signed-in player's equipped cosmetics and body proportions. It
// rebuilds on customizer edits and sign-in/out.
const playerGroup = new Group()
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  animator = makeAnimator(avatar)
}

setAvatar(buildDefaultCharacter()) // visible immediately; replaced once the rig loads

async function loadAvatar() {
  // The SDK fires twice per change (optimistic + confirmed); only the newest load may land.
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar() // also runs once at start to swap in the real rig
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))
bloxity.onRespawnRequest(respawn)

// --- HUD + held item --------------------------------------------------------------
const viewmodel = createViewmodel(camera)
let lastCrateAt = 0
hud = createHud({
  onReservedAreas: bloxity.onReservedAreas,
  getMode,
  setMode,
  isNight: () => lighting.isNight(),
  toggleDay: () => lighting.toggleDayNight(),
  respawn: () => respawn(),
  canCustomize: bloxity.canCustomize,
  customize: bloxity.toggleCustomizer,
  onSlot: (icon) => viewmodel.setItem(icon),
  openCrate,
})
{
  const sel = state.hotbar[state.selected]
  viewmodel.setItem(sel ? hud.itemIcon(sel.id) : null)
}

// Crate opening: roll, pay out, animate the chest, then pop the reward.
function openCrate(kind) {
  const r = roll(kind)
  lastCrateAt = performance.now()
  lobby.openCrate(kind, r.icon)
  sfx.crateOpen(kind === 'ranked')
  setTimeout(() => {
    let ups = 0
    if (r.type === 'gold') addGold(r.amount)
    else if (r.type === 'xp') ups = addXp(r.amount)
    else if (r.type === 'item') {
      if (!giveItem(r.id)) addGold(100)
    } else if (r.type === 'kit') {
      state.kits.push(r.id)
      changed()
    } else if (r.type === 'look') {
      state.looks.push(r.id)
      changed()
    }
    sfx.reward()
    hud.showReward(r, kind === 'ranked' ? 'Ranked Crate' : 'Normal Crate')
    hud.feed(`<span style="color:#3fd6ff">You opened a ${kind === 'ranked' ? 'Ranked' : 'Normal'} Crate and got </span><span style="color:${r.color}">${r.title}</span>`)
    if (ups) levelUp()
  }, 650)
}
function levelUp() {
  sfx.levelUp()
  hud.feed(`<span style="color:#3fd6ff">CONGRATS!</span> You reached level <span style="color:#ffe04a">[${state.level}★]</span>!`)
  hud.toast(`Level up! [${state.level}★]`, 'good')
}

// --- Interaction: crosshair ray / proximity / taps -----------------------------------
const ray = new Ray()
const hit = new Vector3()
const tmp = new Vector3()
let target = null
const box = { min: new Vector3(), max: new Vector3() }
function rayHit(r, it) {
  box.min.set(it.x - it.hx, it.y - it.hy, it.z - it.hz)
  box.max.set(it.x + it.hx, it.y + it.hy, it.z + it.hz)
  return r.intersectBox(box, hit) ? hit.distanceTo(r.origin) : Infinity
}
function pickAlong(r, maxDist) {
  let best = null
  let bestD = maxDist
  for (const it of lobby.interactables) {
    const d = rayHit(r, it)
    if (d < bestD) {
      best = it
      bestD = d
    }
  }
  return best
}
const near = (it, range) => Math.hypot(it.x - player.position.x, it.z - player.position.z) < range && Math.abs(it.y - player.position.y) < 3
function findTarget() {
  camera.getWorldPosition(ray.origin)
  camera.getWorldDirection(ray.direction)
  const reach = LOBBY.interactRange + (isFirstPerson() ? 0 : camera.position.distanceTo(tmp.set(player.renderPosition.x, player.renderPosition.y + 1.5, player.renderPosition.z)))
  const aimed = pickAlong(ray, reach)
  if (aimed && near(aimed, LOBBY.interactRange + 0.8)) return aimed
  // nothing under the crosshair: the closest thing within arm's reach (E key / touch prompt)
  let best = null
  let bestD = 2.6
  for (const it of lobby.interactables) {
    const d = Math.hypot(it.x - player.position.x, it.z - player.position.z)
    if (d < bestD && Math.abs(it.y - player.position.y) < 2.5) {
      best = it
      bestD = d
    }
  }
  return best
}
function interact(it) {
  if (!it || hud.isOpen()) return
  if (it.npc) {
    sfx.npcTalk(it.action === 'duels' ? 0.8 : it.action === 'kits' ? 1.25 : 1)
    it.npc.ch.swing()
  }
  if (it.action.startsWith('crate:')) {
    const kind = it.action.slice(6)
    if (performance.now() - lastCrateAt < 3600) return hud.toast('The crate is still opening…')
    sfx.uiClick()
    hud.openPanel('crate', kind)
  } else hud.openPanel(it.action)
}
onKey('KeyE', () => interact(target))
const raycaster = new Raycaster()
const ndc = new Vector2()
function interactAtScreen(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  const it = pickAlong(raycaster.ray, 60)
  if (it && near(it, LOBBY.interactRange + 3)) interact(it)
  else if (it) hud.toast('Walk closer to interact')
  return !!it
}
window.addEventListener('pointerdown', (e) => {
  if (hud.isOpen()) return
  if (e.pointerType !== 'mouse') return
  if (e.button === 0 && isLocked()) {
    viewmodel.swing()
    sfx.swing()
  }
  if (e.button === 2) {
    if (isLocked()) interact(target)
    else if (e.target === renderer.domElement) interactAtScreen(e.clientX, e.clientY)
  }
})
// touch: a quick tap on the world talks to whatever is under the finger
const taps = new Map()
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse') taps.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() })
})
window.addEventListener('pointerup', (e) => {
  const t = taps.get(e.pointerId)
  taps.delete(e.pointerId)
  if (!t || hud.isOpen()) return
  if (performance.now() - t.t > 260 || Math.hypot(e.clientX - t.x, e.clientY - t.y) > 12) return
  if (!(e.target instanceof Element) || !e.target.closest('.touch-zone')) return
  interactAtScreen(e.clientX, e.clientY)
})

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player' // first person: you are the camera
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', respawn)
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn })
const syncTouch = () => hud.setTouch(document.body.classList.contains('touch-ui'))
new MutationObserver(syncTouch).observe(document.body, { attributes: true, attributeFilter: ['class'] })
syncTouch()

// --- Welcome feed --------------------------------------------------------------
hud.feed('<span style="color:#ffe04a">Welcome to Kit PvP!</span> Pick a kit, then drop into the arena.')
if (dailyStatus().ready) setTimeout(() => hud.feed('<span style="color:#7cff4a">Your daily reward is ready!</span> Press <b>L</b> to claim it.'), 2500)
const BIOMES = ['Desert', 'Snow', 'Nether', 'End', 'Jungle', 'Mushroom', 'Badlands']
let biome = 2
let eventTimer = 18
function arenaEvent() {
  const next = (biome + 1 + Math.floor(Math.random() * (BIOMES.length - 1))) % BIOMES.length
  hud.feed(`<span style="color:#ffb31a">[EVENT] The ${BIOMES[biome]} biome collapses in 10 seconds! Get off it before it falls. The new biome is ${BIOMES[next]}.</span>`)
  biome = next
  sfx.notify()
}

// --- Movement sounds, the arena drop ------------------------------------------
let stepDist = 0
let wasGrounded = true
let fallSpeed = 0
let lastPos = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }
let dropping = false
let lookDx = 0
let lookDy = 0

function enterArena() {
  // The arena is not built yet: fade out, tell the player, come back to spawn.
  // Later: load the arena here and teleport the player into its drop zone.
  dropping = true
  sfx.whoosh()
  sfx.fallWind(0)
  hud.fade(true, 'Entering the arena…', '')
  setTimeout(() => hud.fade(true, 'Arena coming soon', 'The arena is still being built. You have been sent back to the lobby.'), 1100)
  setTimeout(() => {
    resetPlayer(SPAWN, SPAWN_FACING)
    syncYawToPlayer()
    hud.fade(false)
    dropping = false
  }, 3200)
}

function movementAudio(dt) {
  const p = player.position
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  const surface = lobby.surfaceAt(p.x, p.y, p.z)
  const sound = surface?.sound ?? 'dirt'
  if (player.grounded && wasGrounded && speed > 0.5) {
    stepDist += speed * dt
    const stride = inputState.sprint ? 2.5 : 2.0
    if (stepDist > stride) {
      stepDist = 0
      sfx.footstep(sound, inputState.sprint ? 1.1 : 0.85)
      if (inputState.sprint || Math.random() < 0.3) lobby.kickDust(p.x, p.y, p.z, surface, inputState.sprint ? 3 : 1, 0.6)
    }
  }
  if (wasGrounded && !player.grounded && player.velocity.y > 3) sfx.jump(sound)
  if (!wasGrounded && player.grounded) {
    if (fallSpeed > 5) {
      sfx.land(sound, Math.min(1.5, (fallSpeed - 5) / 8))
      lobby.kickDust(p.x, p.y, p.z, surface, Math.round(4 + fallSpeed * 0.6), 1 + fallSpeed / 20)
    } else if (fallSpeed > 2) sfx.footstep(sound, 0.7)
    stepDist = 0
  }
  if (!player.grounded) fallSpeed = Math.max(0, -player.velocity.y)
  // rushing wind while falling fast (into the shaft or off the edge)
  sfx.fallWind(!player.grounded && player.velocity.y < -9 ? Math.min(1, (-player.velocity.y - 9) / 20) : 0)
  wasGrounded = player.grounded

  const h = lobby.anchors.hole
  if (!dropping && p.y < ARENA.enterY && Math.hypot(p.x - h.x, p.z - h.z) < h.r + 3) enterArena()
  // fell off the island edge: player.js respawned us; make it read as a reset
  if (Math.hypot(p.x - lastPos.x, p.z - lastPos.z) > 15 && lastPos.y < PHYSICS.killY + 5) sfx.whoosh()
  lastPos = { x: p.x, y: p.y, z: p.z }
}

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0
let wasNight = false

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1) // clamp huge frames (tab switch, breakpoint)
  const elapsed = clock.elapsedTime

  lookDx = inputState.look.dx
  lookDy = inputState.look.dy
  stepPhysics(dt) // runs the player controller + world at the fixed rate, interpolates bodies
  interpolatePlayer()

  const p = player.renderPosition
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  animator?.update(dt, {
    grounded: player.grounded,
    speed,
    verticalVelocity: player.velocity.y,
    turn: 0,
  })

  updateCamera(camera, dt)
  viewmodel.update(dt, { speed, grounded: player.grounded, lookDx, lookDy, visible: isFirstPerson() })
  lobby.update(dt, elapsed, camera, player.renderPosition, renderer.domElement.height, { speed, look: state.look, facing: player.facing })
  lighting.update(dt, playerGroup.position)
  movementAudio(dt)
  sfx.updateListener(camera.position.x, camera.position.y, camera.position.z, getYaw())
  const night = lighting.isNight()
  if (night !== wasNight) {
    wasNight = night
    sfx.setNight(night)
  }

  target = hud.isOpen() || dropping ? null : findTarget()
  hud.setPrompt(target ? target.label : null, () => interact(target))
  hud.update(dt)
  eventTimer -= dt
  if (eventTimer <= 0) {
    eventTimer = 50 + Math.random() * 40
    arenaEvent()
  }
  postfx.render()

  // Loading ends once the scene has drawn and the avatar has had its chance (max ~5 s).
  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
})

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  window.__game = { player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, setMode, teleport, lobby, hud, state, viewmodel, openCrate, sfx, kits: KITS, coarse: COARSE_POINTER }
}
