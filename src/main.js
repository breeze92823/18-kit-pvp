import { ACESFilmicToneMapping, Clock, Group, PCFSoftShadowMap, PerspectiveCamera, Ray, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer } from 'three'
import { AD_REWARD, ARENA, BIOMES, CAMERA, COARSE_POINTER, DUEL, graphicsPreset, KITS, LOBBY, PHYSICS, RENDER, SPAWN, SPAWN_FACING, lobbySpawn } from './config.js'
import * as bloxity from './bloxity.js'
import { inputState, install as installInput, isLocked, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, knockback, player, playerEnv, resetPlayer, respawn, setSpawnPicker } from './player.js'
import { getPitch, getYaw, setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { getMode, isFirstPerson, onModeChanged, setMode, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createLobby } from './lobby/index.js'
import { createArena } from './arena/index.js'
import { createCombat } from './arena/combat.js'
import { initNet, net as netState, on as onNet, send as netSend } from './net.js'
import { initSync } from './sync.js'
import { createDuelWorld, spawnOf } from './duel/world.js'
import { createDuels } from './duel/duels.js'
import { createRemotePlayers, setListenerPos } from './remotePlayers.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { EmotePlayer, emoteById, loadEmotes } from './avatar/emotes.js'
import { createHud } from './hud/hud.js'
import { createViewmodel } from './viewmodel.js'
import { addXp, addGold, changed, dailyStatus, giveItem, state } from './state.js'
import { roll } from './crates.js'
import { artURL } from './lobby/pixelart.js'
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
bloxity.loadingStep('Building the arena')
const arena = createArena(scene)
createPlayerBody()
// Every lobby spawn is a random clear spot near SPAWN, so players never stack on one point.
const pickLobbySpawn = () => lobbySpawn((x, z) => lobby.spawnClear(x, z))
setSpawnPicker(pickLobbySpawn)
resetPlayer(pickLobbySpawn(), SPAWN_FACING)
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
const unlockAudio = () => {
  sfx.unlock()
  sfx.flushBiome()
}
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
const emotePlayer = new EmotePlayer() // Boxity emotes, played over the rig after the animator

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  animator = makeAnimator(avatar)
  emotePlayer.bind(avatar) // still in its bind pose: remembers each bone's rest rotation
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
// Boxity's "Reset Character" stays instant, even on the death screen.
bloxity.onRespawnRequest(() => {
  if (zone === 'dead' && death) {
    bloxity.hideDeathScreen()
    return finishDeath()
  }
  respawnKey()
})

// --- Boxity platform features: emotes, chat bubbles, ads, badges ---------------------------------
// Emotes: Boxity draws the picker and sends the catalogue id; the clip plays on the player's rig
// (visible in third person, so first person switches over while it plays) and is relayed to the
// others through the server. It stops as soon as the player moves.
const emotesReady = bloxity.sdk() ? loadEmotes(bloxity.apiUrl()) : Promise.resolve()
let emoteRestoreMode = null
async function playEmote(id) {
  try {
    await emotesReady
    if (zone !== 'lobby' && zone !== 'arena' && zone !== 'duel') return
    if (!emotePlayer.play(id)) return // unknown id: ignored quietly
    if (isFirstPerson()) {
      emoteRestoreMode = 'player'
      setMode('character')
    }
    netSend('emote', { id })
  } catch {
    // Cosmetic: never break a frame.
  }
}
function stopEmote() {
  emotePlayer.stop()
  if (emoteRestoreMode) {
    if (getMode() === 'character') setMode(emoteRestoreMode)
    emoteRestoreMode = null
  }
}
bloxity.onEmote(playEmote)
// the others' emotes (relayed by the server) on their blocky characters
onNet('emote', (m) => {
  try {
    const show = () => {
      const e = emoteById(m?.id)
      if (e) remote.emote(m.from, m.id)
    }
    if (emoteById(m?.id)) show()
    else emotesReady.then(show)
  } catch {
    // Cosmetic.
  }
})

// Chat bubbles: Boxity draws the chat UI; each message goes over its sender's head for 4 s.
bloxity.onChat((m) => {
  try {
    if (!m || m.isGif) return
    const text = bloxity.bubbleText(m)
    if (!text) return
    if (m.isLocalPlayer) {
      if (!isFirstPerson()) bloxity.attachBubble(playerGroup, text, { height: 2.5 }) // you can't see your own head in first person
    } else remote.bubble(m.userId, text)
  } catch {
    // Cosmetic.
  }
})

// Ads: Boxity runs every ad itself. During a break the game freezes and goes silent.
let adPaused = false
bloxity.onAdBreak((on) => {
  adPaused = on
  sfx.setMuted(on)
})
// Rewarded ad -> Gold. The server verifies Boxity's reward token and says how much to grant.
const adState = { busy: false, last: -1e9, waiter: null }
onNet('adRewardResult', (m) => {
  adState.waiter?.(m)
  adState.waiter = null
})
const askAdReward = (token) =>
  new Promise((resolve) => {
    adState.waiter = resolve
    netSend('adReward', { placement: AD_REWARD.placement, token })
    setTimeout(() => {
      if (adState.waiter === resolve) {
        adState.waiter = null
        resolve(null)
      }
    }, 10000)
  })
const AD_MESSAGES = { guest: 'Sign in to Boxity to claim ad rewards.', cooldown: 'Wait a moment before the next ad.' }
const ads = {
  gold: AD_REWARD.gold,
  available: () => bloxity.adsAvailable(),
  busy: () => adState.busy,
  cooldownLeft: () => Math.max(0, AD_REWARD.cooldown - (performance.now() - adState.last) / 1000),
  // -> { ok, gold } or { ok: false, message }
  async watch() {
    adState.busy = true
    try {
      const r = await bloxity.showRewardedAd(AD_REWARD.placement)
      if (r.status !== 'completed') return { ok: false, message: r.status === 'skipped' ? 'Watch the whole ad to get the Gold.' : 'No ad right now. Try again in a bit.' }
      adState.last = performance.now()
      let gold = AD_REWARD.gold
      if (netState.connected) {
        // the game has a server: it checks the token with Boxity and grants only on its say-so
        const res = r.rewardToken ? await askAdReward(r.rewardToken) : null
        if (!res?.ok) return { ok: false, message: AD_MESSAGES[res?.reason] ?? 'The ad reward could not be verified.' }
        gold = res.gold
      }
      addGold(gold)
      return { ok: true, gold }
    } finally {
      adState.busy = false
    }
  },
}
// Screen ads: tell Boxity which of the game's screens is showing so banners go around it.
let adScreenKey = ''
let resultsUntil = 0
function updateAdScreen(t) {
  if (zone === 'dead') return // the death screen draws its own banners; they return after the respawn
  const key = t < resultsUntil ? 'results' : hud.isOpen() ? 'panel' : 'gameplay'
  if (key === adScreenKey) return
  adScreenKey = key
  // the windows keep their Exit button top right and the Kits list left
  bloxity.adScreen(key, key === 'panel' ? { skip: ['top-right', 'middle-left', 'top-left'] } : undefined)
}
// Badges are awarded by the server and Boxity draws the popup; the game adds a feed line + chime.
bloxity.onBadgeEarned((b) => {
  hud.feed(`<span style="color:#ffd84a">Badge earned:</span> ${b?.icon && b.icon.length <= 4 ? b.icon + ' ' : ''}${String(b?.name ?? '').replace(/[<>&]/g, '')}`)
  sfx.notify()
})

// --- HUD + held item --------------------------------------------------------------
const viewmodel = createViewmodel(camera)
let lastCrateAt = 0
hud = createHud({
  onReservedAreas: bloxity.onReservedAreas,
  getMode,
  setMode,
  isNight: () => lighting.isNight(),
  toggleDay: () => lighting.toggleDayNight(),
  respawn: () => respawnKey(),
  canCustomize: bloxity.canCustomize,
  customize: bloxity.toggleCustomizer,
  onSlot: (icon) => viewmodel.setItem(icon),
  onSlotUse: (down) => (down ? combat.slotDown() : combat.slotUp()),
  openCrate,
  duels: () => duels,
  boards: () => boardData,
  ads,
})
{
  const sel = state.hotbar[state.selected]
  viewmodel.setItem(sel ? hud.itemIcon(sel.id) : null)
}

// --- Arena combat: bots, weapons, arrows, kill credit and rewards (arena/combat.js) ---
let touchControls = null
// the other players online (net.js roster), drawn and fightable
const remote = createRemotePlayers(scene, { fire: (x, y, z) => combat.effects.fx.fire(x, y, z, 1) })
// the duel platforms far out along +x (duel/world.js)
const duelWorld = createDuelWorld(scene)
const combat = createCombat(scene, arena, camera, {
  remote,
  duelWorld,
  zone: () => zone,
  hurtPlayer: (n, source, kind) => damage(n, kind, source),
  healPlayer: (n) => {
    if (zone !== 'arena' || hp >= ARENA.maxHp) return
    hp = Math.min(ARENA.maxHp, hp + n)
    hud.setHealth(hp)
  },
  ignitePlayer: (s, mul = 1) => {
    if (zone !== 'arena' || inLiquid === 'water') return
    burnT = Math.max(burnT, s)
    burnMul = Math.max(burnMul, mul)
  },
  teleportPlayer: (x, y, z) => {
    resetPlayer({ x, y, z }, player.facing)
    syncYawToPlayer()
  },
  knockPlayer: (vx, vy, vz) => knockback(vx, vy, vz),
  playerHp: () => hp,
  setFood: (n) => hud.setFood?.(n),
  levelUp: () => levelUp(),
  isTouch: () => document.body.classList.contains('touch-ui'),
  playerName: () => (bloxity.authState.user || bloxity.authState.guest ? bloxity.displayName() : 'You'),
  feed: (html) => hud.feed(html),
  toast: (text, kind) => hud.toast(text, kind),
  viewmodel,
  touch: { setAbility: (v) => touchControls?.setAbility(v ? { ...v, iconUrl: artURL(v.icon, 4) } : null) },
})

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
  if (e.button === 0 && isLocked()) combat.press() // swing, or start drawing the bow
  if (e.button === 2) {
    // arena: block with a shield, use the item in hand, else the kit ability
    if (zone === 'arena') combat.rightDown()
    else if (isLocked()) interact(target)
    else if (e.target === renderer.domElement) interactAtScreen(e.clientX, e.clientY)
  }
})
window.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'mouse') return
  if (e.button === 0) combat.release() // let the arrow fly
  if (e.button === 2) combat.rightUp()
})
window.addEventListener('blur', () => {
  combat.release()
  combat.rightUp()
  combat.abilityUp()
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
onKey('KeyR', () => respawnKey())
touchControls = installTouch({
  mode: toggleMode,
  day: () => lighting.toggleDayNight(),
  respawn: () => respawnKey(),
  attackDown: () => !hud.isOpen() && combat.press(),
  attackUp: () => combat.release(),
  abilityDown: () => !hud.isOpen() && combat.abilityDown(),
  abilityUp: () => combat.abilityUp(),
})
const syncTouch = () => hud.setTouch(document.body.classList.contains('touch-ui'))
new MutationObserver(syncTouch).observe(document.body, { attributes: true, attributeFilter: ['class'] })
syncTouch()

// --- Welcome feed --------------------------------------------------------------
hud.feed('<span style="color:#ffe04a">Welcome to Kit PvP!</span> Pick a kit, then drop into the arena.')
if (dailyStatus().ready) setTimeout(() => hud.feed('<span style="color:#7cff4a">Your daily reward is ready!</span> Press <b>L</b> to claim it.'), 2500)
const EVENT_BIOMES = ['fire', 'frost', 'summer', 'spring'].map((k) => BIOMES[k].name)
let eventBiome = 0
let eventTimer = 18
function arenaEvent() {
  const next = (eventBiome + 1 + Math.floor(Math.random() * (EVENT_BIOMES.length - 1))) % EVENT_BIOMES.length
  hud.feed(`<span style="color:#ffb31a">[EVENT] The ${EVENT_BIOMES[eventBiome]} biome collapses in 10 seconds! Get off it before it falls. The new biome is ${EVENT_BIOMES[next]}.</span>`)
  eventBiome = next
  sfx.notify()
}

// --- Movement sounds, the arena drop ------------------------------------------
let stepDist = 0
let wasGrounded = true
let fallSpeed = 0
let lastPos = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }
let lookDx = 0
let lookDy = 0

// Where the player is: 'lobby' -> (through the hole) 'drop' -> (touchdown) 'arena';
// 'dead' while the death / return fade plays.
let zone = 'lobby'
let hp = ARENA.maxHp
let lastHurt = -99
let hurtTick = 0
let burnT = 0
let burnMul = 1 // blue fire burns twice as hot
let inLiquid = null
let biome = null
let swimT = 0

// Falling through the shaft: keep falling (capped) into the arena below.
function startDrop() {
  zone = 'drop'
  sfx.whoosh()
  playerEnv.killY = ARENA.voidY
  playerEnv.onVoid = () => die('void')
  playerEnv.maxFall = ARENA.maxFall
  hp = ARENA.maxHp
  hud.setHealth(hp)
  combat.onDrop()
  hud.feed('<span style="color:#ffe04a">Dropping into the arena…</span>')
}

function land(p, surface) {
  zone = 'arena'
  playerEnv.maxFall = 0
  lobby.setActive(false)
  lighting.setVoid(true)
  arena.landingBurst(p.x, p.y, p.z, surface)
  sfx.arenaLand()
  sfx.setLobbyAmbience(0)
  biome = arena.biomeAt(p.x, p.z)
  const B = BIOMES[biome] ?? BIOMES.plaza
  hud.biome('KIT PVP ARENA', '#ffd27a', B.name)
  sfx.setBiome(biome ?? 'plaza')
  combat.onLand()
  const how = document.body.classList.contains('touch-ui') ? 'the <b>sword button</b>' : '<b>left click</b> (hold it to draw a bow)'
  hud.feed(`<span style="color:#3fd6ff">You landed in the arena.</span> Fight with ${how}, knock enemies into the <span style="color:#c46bff">void</span> and the <span style="color:#ff7a3a">lava</span>!`)
}

// n half-hearts; source = the bot that hit you (combat.js already applied your armor)
function damage(n, cause) {
  if (zone !== 'arena' && zone !== 'duel') return
  hp -= n
  lastHurt = clock.elapsedTime
  hud.setHealth(hp)
  hud.hurt()
  sfx.hurt()
  if (hp <= 0) {
    const back = combat.cheatDeath() // phoenix: once per life
    if (back) {
      hp = back
      burnT = 0
      hud.setHealth(hp)
      hud.toast('You rose from the ashes!', 'good')
    } else die(cause)
  }
}

const DEATHS = {
  void: ['You fell into the void!', 'The islands are small: mind your step.'],
  lava: ['You tried to swim in lava!', 'Lava burns fast. Jump out quickly next time.'],
  fire: ['You burned to death!', 'Jump into water to put the flames out.'],
  melee: ['You died!', 'Swing when your charge bar is full for full damage.'],
  arrow: ['You were shot!', 'Keep moving: archers lead their shots.'],
}
const KILLED_BY = {
  void: (k) => `${k} knocked you into the void!`,
  lava: (k) => `${k} pushed you into the lava!`,
  fire: (k) => `You burned while fighting ${k}!`,
  arrow: (k) => `You were shot by ${k}!`,
  melee: (k) => `You were slain by ${k}!`,
}
function die(cause) {
  if (zone === 'dead') return
  // a duel round lost: stay up there for the next round (duels.js / the server decide)
  if (zone === 'duel') {
    if (hp <= -999) return
    hp = -1000 // dead until the next round's spawn
    sfx.death()
    sfx.fallWind(0)
    hud.setBurning(false)
    burnT = 0
    playerEnv.maxFall = 6
    playerEnv.onVoid = () => {}
    combat.playerDied(cause)
    hud.setHealth(0)
    duels.onPlayerDied()
    return
  }
  const fought = zone === 'arena'
  zone = 'dead'
  const p = player.position
  if (cause === 'void') arena.voidFx(p.x, Math.max(p.y, ARENA.voidY + 2), p.z)
  sfx.death()
  sfx.fallWind(0)
  hud.setBurning(false)
  playerEnv.maxFall = 6 // hang in place while the screen goes red
  playerEnv.onVoid = () => {}
  // combat.js credits whoever finished you and posts the kill-feed line
  const { killer, life } = combat.playerDied(cause)
  let [big, small] = DEATHS[cause] ?? DEATHS.void
  if (killer) big = (KILLED_BY[cause] ?? KILLED_BY.melee)(killer)
  if (life.kills || life.gold) small = `This life: ${life.kills} kill${life.kills === 1 ? '' : 's'}, +${life.gold} Gold. Kill streak lost.`
  hud.fade(true, big, small, 'death')
  if (!fought) hud.feed(`<span style="color:#ff5a5a">${big}</span>`)
  stopEmote()
  beginDeathScreen()
}

// The Boxity death screen: while the player is dead Boxity shows ads along the edges and runs a
// countdown (4 s or more). The game keeps its own death overlay and Respawn button (hud.js), in the
// centre; the button shows the countdown and only works once death.respawn() answers true. There is
// no timer of our own: outside Boxity the countdown is 0 at once, so the same code respawns.
let death = null
let deathShownAt = 0
function beginDeathScreen() {
  const d = bloxity.showDeathScreen()
  death = d
  deathShownAt = performance.now()
  let left = null // seconds left; null until Boxity (or the offline stub) has answered
  const render = () => {
    if (death !== d) return
    const waited = performance.now() - deathShownAt >= 1200 // let the death read first
    hud.setRespawn({ label: left === null ? '…' : left > 0 ? String(left) : 'RESPAWN', enabled: left === 0 && waited, onClick: tryRespawn })
  }
  d.onCountdown((n) => {
    left = Math.max(0, Math.ceil(Number(n) || 0))
    render()
  })
  render()
  setTimeout(render, 1250)
}
function tryRespawn() {
  if (zone !== 'dead' || !death || performance.now() - deathShownAt < 1200) return
  if (death.respawn()) finishDeath()
}
function finishDeath() {
  death = null
  hud.setRespawn(null)
  goLobby()
}

// Back to the lobby spawn (after a death, or R in the arena).
function goLobby() {
  death = null
  bloxity.hideDeathScreen()
  const spawnAt = pickLobbySpawn()
  resetPlayer(spawnAt, SPAWN_FACING)
  syncYawToPlayer()
  Object.assign(playerEnv, { swim: 0, speedMul: 1, climb: false, maxFall: 0, killY: PHYSICS.killY, onVoid: null })
  zone = 'lobby'
  hp = ARENA.maxHp
  burnT = 0
  inLiquid = null
  biome = null
  hud.setHealth(hp)
  hud.setBurning(false)
  lighting.setVoid(false, true)
  lobby.setActive(true)
  sfx.setBiome(null)
  sfx.setLobbyAmbience(1)
  combat.onLobby()
  lastPos = { x: spawnAt.x, y: spawnAt.y, z: spawnAt.z }
  setTimeout(() => hud.fade(false), 250)
}
function respawnKey() {
  if (zone === 'lobby') {
    resetPlayer(pickLobbySpawn(), SPAWN_FACING)
    return syncYawToPlayer()
  }
  if (zone === 'dead') return tryRespawn() // R = the Respawn button (once its countdown is over)
  if (zone === 'duel') {
    hud.toast('You left the duel', 'bad')
    return duels.leave() // a forfeit
  }
  if (zone === 'arena' && combat.inCombat()) {
    sfx.deny()
    return hud.toast(`You can't leave while in combat! (${Math.ceil(combat.combatLeft())}s)`, 'bad')
  }
  zone = 'dead'
  combat.onLobby()
  hud.fade(true, 'Back to the lobby…', '')
  setTimeout(goLobby, 650)
}

// --- Duels (duel/duels.js): to the platforms and back ------------------------------------------
const duels = createDuels({
  combat,
  // a duel starts: up to the platforms (the starry void sky, no lobby)
  enter() {
    zone = 'duel'
    lobby.setActive(false)
    lighting.setVoid(true)
    sfx.setLobbyAmbience(0)
    sfx.setBiome('plaza')
    hud.closePanel()
    hud.fade(false)
  },
  // every round: on your spawn pad, full health
  spawn(slot, side) {
    const s = spawnOf(slot, side)
    resetPlayer({ x: s.x, y: s.y + 0.05, z: s.z }, s.facing)
    syncYawToPlayer()
    Object.assign(playerEnv, { swim: 0, speedMul: 1, climb: false, maxFall: 0, killY: DUEL.y - DUEL.killBelow, onVoid: () => die('void') })
    zone = 'duel'
    hp = ARENA.maxHp
    burnT = 0
    inLiquid = null
    hud.setHealth(hp)
    hud.setBurning(false)
  },
  exit: () => {
    if (zone === 'duel') goLobby()
  },
  feed: (html) => hud.feed(html),
  toast: (text, kind) => hud.toast(text, kind),
  levelUp: () => levelUp(),
  changed: () => hud.refresh('duels'),
  playerName: () => combat.you.name || 'You',
})

// Per-frame arena state: the drop, liquids, burning, health, biome changes.
function arenaTick(dt, t) {
  const p = player.position
  if (zone === 'drop') {
    if (p.y < ARENA.skyFrom) {
      lighting.setVoid(true)
      sfx.setLobbyAmbience(0)
    }
    // ease the fall over the last few metres so the touchdown is a thump, not a splat
    const g = arena.groundBelow(p.x, p.y + 0.5, p.z)
    if (g !== null && p.y < ARENA.floorY + 60) {
      const h = p.y - g
      playerEnv.maxFall = h < ARENA.softHeight ? ARENA.softSpeed + (ARENA.maxFall - ARENA.softSpeed) * Math.max(0, h / ARENA.softHeight) ** 1.5 : ARENA.maxFall
    } else playerEnv.maxFall = ARENA.maxFall
    if (player.grounded && p.y < ARENA.floorY + 60) land(p, arena.surfaceAt(p.x, p.y, p.z))
    else if (arena.liquidAt(p.x, p.y + 0.4, p.z) && p.y < ARENA.floorY + 60) land(p, null)
    return
  }
  if (zone !== 'arena' && zone !== 'duel') return

  // liquids: feet, body, head
  const feet = arena.liquidAt(p.x, p.y + 0.15, p.z)
  const body = arena.liquidAt(p.x, p.y + 0.9, p.z)
  const liq = body || feet
  playerEnv.swim = body ? 1 : feet ? 0.35 : 0
  playerEnv.speedMul = liq === 'lava' ? 0.6 : 1
  playerEnv.climb = arena.ladderAt(p.x, p.y + 0.4, p.z) || arena.ladderAt(p.x, p.y + 1.3, p.z)
  if (liq !== inLiquid) {
    if (liq === 'water' && !inLiquid) {
      const big = Math.min(1.6, 0.5 + fallSpeed / 9)
      sfx.splash(big)
      arena.splash(p.x, Math.floor(p.y + 0.2) + 14 / 16, p.z, big)
    }
    if (liq === 'lava') {
      sfx.sizzle()
      hud.toast('You are burning! Get out of the lava!', 'bad')
    }
    if (!liq && inLiquid === 'water') sfx.swim()
    inLiquid = liq
  }
  if (liq === 'water' && burnT > 0) {
    burnT = 0
    sfx.sizzle()
    arena.steam(p.x, p.y + 0.6, p.z)
  }
  if (body === 'water' && Math.hypot(player.velocity.x, player.velocity.z) > 1) {
    swimT -= dt
    if (swimT <= 0) {
      swimT = 0.55
      sfx.swim()
    }
  }

  // lava hurts fast and sets you alight; burning keeps hurting for a while
  hurtTick -= dt
  if (liq === 'lava') {
    burnT = ARENA.burnTime
    if (hurtTick <= 0) {
      hurtTick = 0.5
      damage(ARENA.lavaDps * 0.5, 'lava')
    }
  } else if (burnT > 0) {
    burnT -= dt
    if (hurtTick <= 0) {
      hurtTick = 0.8
      damage(ARENA.burnDps * 0.8 * burnMul, 'fire')
    }
  } else burnMul = 1
  if ((zone !== 'arena' && zone !== 'duel') || hp <= 0) return
  hud.setBurning(burnT > 0)
  if (burnT > 0) arena.burnFx(p.x, p.y, p.z)
  if (hp < ARENA.maxHp && burnT <= 0 && t - lastHurt > ARENA.regenDelay && combat.canRegen()) {
    hp = Math.min(ARENA.maxHp, hp + ARENA.regenRate * dt)
    hud.setHealth(hp)
  }

  // biome banners + ambience beds
  const b = arena.biomeAt(p.x, p.z)
  if (b && b !== biome) {
    biome = b
    hud.biome(BIOMES[b].name, BIOMES[b].color)
    sfx.setBiome(b)
    sfx.biomeChime(b)
  }
}

function movementAudio(dt) {
  const p = player.position
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  const W = zone === 'lobby' ? lobby : zone === 'duel' ? { surfaceAt: duelWorld.surfaceAt, kickDust: () => {} } : arena
  const surface = W.surfaceAt(p.x, p.y, p.z)
  const wading = zone === 'arena' && inLiquid === 'water'
  const sound = wading ? 'wade' : surface?.sound ?? 'dirt'
  if (player.grounded && wasGrounded && speed > 0.5) {
    stepDist += speed * dt
    const stride = inputState.sprint ? 2.5 : 2.0
    if (stepDist > stride) {
      stepDist = 0
      sfx.footstep(sound, inputState.sprint ? 1.1 : 0.85)
      if (!wading && (inputState.sprint || Math.random() < 0.3)) W.kickDust(p.x, p.y, p.z, surface, inputState.sprint ? 3 : 1, 0.6)
    }
  }
  if (wasGrounded && !player.grounded && player.velocity.y > 3) sfx.jump(sound)
  if (!wasGrounded && player.grounded) {
    if (fallSpeed > 5) {
      sfx.land(sound, Math.min(1.5, (fallSpeed - 5) / 8))
      W.kickDust(p.x, p.y, p.z, surface, Math.round(4 + fallSpeed * 0.6), 1 + fallSpeed / 20)
    } else if (fallSpeed > 2) sfx.footstep(sound, 0.7)
    stepDist = 0
  }
  if (!player.grounded) fallSpeed = Math.max(0, -player.velocity.y)
  // rushing wind while falling fast (into the shaft, down to the arena, or off an edge)
  sfx.fallWind(zone !== 'dead' && !player.grounded && player.velocity.y < -9 ? Math.min(1, (-player.velocity.y - 9) / 20) : 0)
  wasGrounded = player.grounded

  const h = lobby.anchors.hole
  if (zone === 'lobby' && p.y < ARENA.enterY && Math.hypot(p.x - h.x, p.z - h.z) < h.r + 3) startDrop()
  // fell off the island edge: player.js respawned us; make it read as a reset
  if (zone === 'lobby' && Math.hypot(p.x - lastPos.x, p.z - lastPos.z) > 15 && lastPos.y < PHYSICS.killY + 5) sfx.whoosh()
  lastPos = { x: p.x, y: p.y, z: p.z }
}

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0
let wasNight = false

renderer.setAnimationLoop(() => {
  // An ad break covers the game: freeze it (and don't let the clock run on, or every timer would
  // expire during the break).
  if (adPaused) {
    clock.elapsedTime -= clock.getDelta()
    return
  }
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
  emotePlayer.update(dt)
  // an emote stops as soon as the player moves, jumps, or is no longer free to stand around
  if (emotePlayer.isPlaying()) {
    if (Math.hypot(inputState.move.x, inputState.move.z) > 0.1 || speed > 1.5 || player.velocity.y > 2 || (zone !== 'lobby' && zone !== 'arena' && zone !== 'duel')) stopEmote()
  } else if (emoteRestoreMode) stopEmote()

  updateCamera(camera, dt)
  viewmodel.update(dt, { speed, grounded: player.grounded, lookDx, lookDy, visible: isFirstPerson() })
  if (lobby.isActive()) lobby.update(dt, elapsed, camera, player.renderPosition, renderer.domElement.height, { speed, look: state.look, facing: player.facing })
  arena.update(dt, elapsed, camera, player.renderPosition, renderer.domElement.height, zone !== 'lobby' || player.position.y < -60)
  arenaTick(dt, elapsed)
  remote.update(dt, elapsed, zone === 'lobby' ? 'lobby' : zone === 'duel' ? `duel:${duels.id()}` : 'arena')
  setListenerPos(player.position)
  combat.update(dt, elapsed, renderer.domElement.height, zone !== 'lobby' || player.position.y < -60)
  lighting.update(dt, playerGroup.position)
  movementAudio(dt)
  sfx.updateListener(camera.position.x, camera.position.y, camera.position.z, getYaw())
  const night = lighting.isNight()
  if (night !== wasNight) {
    wasNight = night
    sfx.setNight(night)
  }

  target = hud.isOpen() || zone !== 'lobby' ? null : findTarget()
  hud.setPrompt(target ? target.label : null, () => interact(target))
  hud.update(dt)
  updateAdScreen(elapsed)
  eventTimer -= dt
  if (eventTimer <= 0) {
    eventTimer = 50 + Math.random() * 40
    arenaEvent()
  }
  // the full-screen Kits screen draws its own duel preview instead of the world
  if (hud.kitsOpen()) hud.renderKits(renderer, dt)
  else postfx.render()

  // Loading ends once the scene has drawn and the avatar has had its chance (max ~5 s).
  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
})

// --- Online: our pose for the others (net.js -> backend KitRoom roster) -----------------------
const r2 = (v) => Math.round(v * 100) / 100
const netPose = () => {
  const p = player.position
  const v = player.velocity
  return {
    x: r2(p.x),
    y: r2(p.y),
    z: r2(p.z),
    yaw: r2(player.facing),
    pitch: r2(getPitch()),
    speed: r2(Math.hypot(v.x, v.z)),
    vx: r2(v.x),
    vy: r2(v.y),
    vz: r2(v.z),
    hp: r2(Math.max(0, hp)),
    zone,
    ...combat.netPose(burnT > 0),
  }
}
initNet({ pose: netPose, join: () => ({ kit: state.kit, pose: netPose() }) })
initSync({ toast: (text, kind) => hud.toast(text, kind) })

// A duel is over: the results screen (Boxity puts its banners around it for a few seconds).
onNet('duelEnd', () => {
  resultsUntil = clock.elapsedTime + 8
})

// Leaderboards: the server's (saved players + this room), or just you while offline.
let boardData = null
onNet('leaderboard', (m) => {
  boardData = m?.boards ?? null
  if (boardData) lobby.setBoards(boardData)
  hud.refresh('duels')
})
setInterval(() => {
  lobby.setDuelsCount(duels.playing())
  if (boardData) return
  const me = { name: combat.you.name === 'You' ? 'You' : combat.you.name, level: state.level }
  lobby.setBoards({ kills: state.kills ? [{ ...me, value: state.kills }] : [], playtime: state.playtime >= 60 ? [{ ...me, value: state.playtime }] : [], gold: state.gold ? [{ ...me, value: state.gold }] : [] }, 'Offline: your stats')
}, 2000)

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  // e.g. __game.toArena('fire') drops you onto a biome; __game.look(Math.PI, 0.2) aims the view
  const look = (yaw, pitch = getPitch()) => {
    inputState.look.dx += (getYaw() - yaw) / CAMERA.lookSensitivity
    inputState.look.dy += (pitch - getPitch()) / CAMERA.lookSensitivity
  }
  const toArena = (b = 'plaza', high = false) => {
    const off = { plaza: [0, 0], spring: [-39, -20], summer: [30, -34], frost: [-24, 24], fire: [12, 34] }[b] ?? [0, 0]
    teleport(ARENA.cx + off[0], high ? -6 : ARENA.floorY + 12, ARENA.cz + off[1])
    startDrop()
  }
  window.__game = { player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, setMode, teleport, lobby, arena, lighting, hud, state, viewmodel, openCrate, sfx, kits: KITS, coarse: COARSE_POINTER, toArena, zone: () => zone, playerEnv, look, combat, hp: () => hp, duels, duelWorld, emotePlayer, playEmote, ads }
}
