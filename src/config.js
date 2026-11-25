// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'kit-pvp' // slug registered on bloxity.io
export const GAME_TITLE = 'Kit PvP'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The ground (world.js): one convex slab of land in a sea. The shoreline sweeps from
// the front edge (-Z) back toward +Z on both wings.
export const BEACH = {
  front: -46, // z of the shoreline at the front edge
  back: 90, // z of the back edge
  halfWidth: 75, // x extent of the wings
  wingZ: 24, // z of the shoreline at the far left/right ends
  gateEdge: 21.5, // half-width of the straight shoreline at the front edge
  depth: 4, // slab thickness above the sea floor
  tile: 18, // m per sand texture tile
  fenceHeight: 3, // invisible wall around the sand so nobody walks into the sea
}
export const WATER = { level: -0.6, size: 1400, color: '#12a9e6', shallow: '#7ff0ff' }
export const SPAWN = { x: 0.5, y: 0.05, z: 13.5 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'player' // first person, like the reference

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 5.6, // m/s
  sprintSpeed: 8.4, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.4, // m/s (clears one 1 m block)
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.55, // m autostep (slabs and stairs are 0.5 m)
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -40, // fell off the island this far: respawn
}
export const PLAYER_DIMS = { radius: 0.36, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 90, far: 420 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#1a63e8',
    horizon: '#8fd2ff',
    sunColor: '#fff4de',
    // Sun + hemi + env together keep the pale sand (#eed39c) near its own tan;
    // much more and ACES washes it (and the props) out to grey-white.
    sunIntensity: 2.4,
    sunElevation: 55, // degrees above the horizon
    sunAzimuth: 28, // degrees, 0 = from +Z
    hemiSky: '#e4f2ff',
    hemiGround: '#8a6a4e',
    hemiIntensity: 0.8,
    envIntensity: 0.45,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 46, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.14, // radians above the horizon (low chase cam)
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 6.5, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 8, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// --- Lobby (src/lobby/) --------------------------------------------------------
// World grid: block (x, y, z) fills [x, x+1] x [y, y+1] x [z, z+1]; the lobby floor
// is the top of the y = -1 layer (y = 0 m). +X east, +Z south, the pit is north of spawn.
export const LOBBY = {
  radius: 38, // island radius in blocks (noisy edge)
  grassRing: 6, // grass band along the island edge
  // the sunken funnel: an ellipse (blocks) measured from its centre; rim rings at q > 0.72, then
  // stone terraces [qMax, top block y] stepping down one block each, the open shaft below holeQ
  pit: { cx: -0.5, cz: -6.5, rx: 10.5, rz: 8.8, terraces: [[0.72, -3], [0.61, -4], [0.5, -5], [0.4, -6]], holeQ: 0.3 },
  bots: 6, // wandering lobby players
  interactRange: 5.5, // m from the crosshair ray / E key
}

// The arena (src/arena/): a floating voxel arena in a starry void, straight below the
// lobby's shaft. Falling through the hole below enterY starts the drop; you keep
// falling (capped at maxFall, slowed to softSpeed for the last softHeight m) and land
// on the central plaza. Below voidY you are dead. Grid: centre cell boundary at
// (cx, cz), plaza floor surface at floorY, quadrants `half` blocks out from the centre.
export const ARENA = {
  enterY: -16,
  fadeTime: 0.6,
  cx: 0,
  cz: -7,
  floorY: -150,
  half: 46, // quadrant size in blocks (the void seams between quadrants are 2 wide)
  plazaR: 15.5,
  voidY: -195, // fell off: dead
  maxFall: 34, // m/s terminal speed for the drop
  softHeight: 24, // m above the landing spot the drop starts easing
  softSpeed: 11, // m/s at touchdown
  skyFrom: -28, // below this y (while dropping) the sky turns to the arena's void
  maxHp: 20,
  lavaDps: 6, // hp per second standing in lava
  burnTime: 3.5, // s you keep burning after leaving lava
  burnDps: 1.2,
  regenDelay: 5, // s without damage before health regenerates
  regenRate: 0.7, // hp per second
}
// The four quadrants around the plaza (names shown on entry), in the same order as the
// reference: Spring Isles NW, Summer Valley NE, Frost Peaks SW, Fire Lands SE.
export const BIOMES = {
  plaza: { name: 'Arena Plaza', color: '#ffd27a' },
  spring: { name: 'Spring Isles', color: '#e0a6ff' },
  summer: { name: 'Summer Valley', color: '#8fe36a' },
  frost: { name: 'Frost Peaks', color: '#9fe6ff' },
  fire: { name: 'Fire Lands', color: '#ff7a3a' },
}
// The arena's sky: a black starry void (both moods, so N does not change it).
export const ARENA_SKY = {
  zenith: '#010103',
  horizon: '#030308',
  sunColor: '#e6ecff',
  sunIntensity: 1.7,
  sunElevation: 62,
  sunAzimuth: 35,
  hemiSky: '#a4b0d8',
  hemiGround: '#3a2a30',
  hemiIntensity: 1.05,
  envIntensity: 0.2,
  lampIntensity: 0,
  stars: 1,
  exposure: 1.0,
  fogNear: 110,
  fogFar: 360,
}

// Prices in Gold (earned in the arena). Never premium currency (CLAUDE.md).
export const CRATES = {
  normal: { name: 'Normal Crate', price: 250, color: '#ffc21a' },
  ranked: { name: 'Ranked Crate', price: 900, color: '#e04bff' },
}
export const DAILY_REWARD = [100, 150, 200, 250, 300, 400, 600] // gold per streak day

// Kits picked at the Kit NPC (K). Free ones are owned from the start; the rest cost Gold.
// armor = armor points out of 20 shown on the HUD bar when the kit is selected.
export const KITS = [
  { id: 'knight', name: 'Knight', icon: 'sword', price: 0, armor: 15, desc: 'Iron sword and a full set of iron armor.' },
  { id: 'archer', name: 'Archer', icon: 'bow', price: 0, armor: 9, desc: 'Bow with 32 arrows and light leather armor.' },
  { id: 'tank', name: 'Tank', icon: 'shield', price: 600, armor: 20, desc: 'Shield and heavy armor. Slow but sturdy.' },
  { id: 'medic', name: 'Medic', icon: 'heal', price: 800, armor: 11, desc: 'Heals nearby allies and starts with 3 apples.' },
  { id: 'warper', name: 'Warper', icon: 'orb', price: 1000, armor: 10, desc: 'Three warp orbs to blink across the arena.' },
  { id: 'pyro', name: 'Pyro', icon: 'flame', price: 1200, armor: 12, desc: 'Fire sword: every hit sets the target alight.' },
  { id: 'frost', name: 'Frost', icon: 'snow', price: 1500, armor: 12, desc: 'Snowballs slow enemies down on hit.' },
  { id: 'berserker', name: 'Berserker', icon: 'axe', price: 2000, armor: 8, desc: 'Heavy axe. Hits harder the lower your health.' },
]

// Shop (B): consumables that go to the hotbar, priced in Gold.
export const SHOP_ITEMS = [
  { id: 'apple', name: 'Golden Apple', icon: 'apple', price: 120, desc: 'Restores 4 hearts over a few seconds.' },
  { id: 'potion', name: 'Speed Potion', icon: 'potion', price: 150, desc: '+30% move speed for 20 seconds.' },
  { id: 'orb', name: 'Warp Orb', icon: 'orb', price: 200, desc: 'Throw it and teleport where it lands.' },
  { id: 'steak', name: 'Steak', icon: 'steak', price: 40, desc: 'Fills your hunger bar.' },
  { id: 'shield', name: 'Shield', icon: 'shield', price: 300, desc: 'Blocks arrows and sword hits from the front.' },
  { id: 'boost', name: 'XP Booster', icon: 'star', price: 400, desc: 'Double XP for your next 10 kills.' },
]

// Looks (M): trails that follow you around, priced in Gold.
export const LOOKS = [
  { id: 'none', name: 'No Trail', price: 0, color: '#9aa4b0' },
  { id: 'sparkle', name: 'Gold Sparkle', price: 700, color: '#ffd84a' },
  { id: 'ember', name: 'Ember', price: 900, color: '#ff7a2a' },
  { id: 'frost', name: 'Frost', price: 900, color: '#9fe6ff' },
  { id: 'void', name: 'Void', price: 1200, color: '#c46bff' },
  { id: 'rainbow', name: 'Rainbow', price: 1800, color: '#ff5fa8' },
]

// XP needed to go from `level` to the next.
export const xpForLevel = (level) => 32 + (level - 1) * 16
