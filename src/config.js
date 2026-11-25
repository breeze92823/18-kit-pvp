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
  floorY: -115,
  half: 46, // quadrant size in blocks (the void seams between quadrants are 2 wide)
  plazaR: 15.5,
  voidY: -160, // fell off: dead
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
// Plaza power-ups (arena/pickups.js) and the arena's event text. Local per client.
export const ARENA_EVENTS = {
  powerups: {
    radius: 1.3, // m from a glowstone tile
    respawn: 25, // s until a taken power-up is back (as a random kind)
    kinds: {
      speed: { color: '#6ad8ff', label: 'Speed boost', s: 12 },
      heal: { color: '#ff5a6a', label: 'Health', hp: 8 },
      regen: { color: '#7dff7a', label: 'Regeneration', hp: 10, s: 6 },
    },
  },
  // text only: "<biome> is about to collapse", nothing changes in the world
  biome: { first: [50, 90], every: [90, 150], warn: 10, biomes: ['spring', 'summer', 'frost', 'fire'] },
}
// The arena's sky: a black starry void (both moods, so N does not change it).
export const ARENA_SKY = {
  zenith: '#010103',
  horizon: '#030308',
  sunColor: '#eef2ff',
  sunIntensity: 2.3,
  sunElevation: 62,
  sunAzimuth: 35,
  hemiSky: '#c8d0ee',
  hemiGround: '#4a3a40',
  hemiIntensity: 1.5,
  envIntensity: 0.2,
  lampIntensity: 0,
  stars: 1,
  exposure: 1.05,
  fogNear: 110,
  fogFar: 360,
}

// Prices in Gold (earned in the arena). Never premium currency (CLAUDE.md).
export const CRATES = {
  normal: { name: 'Normal Crate', price: 250, color: '#ffc21a' },
  ranked: { name: 'Ranked Crate', price: 900, color: '#e04bff' },
}
export const DAILY_REWARD = [100, 150, 200, 250, 300, 400, 600] // gold per streak day
// What a brand-new save starts with (state.js fresh()): some Gold and golden apples in the hotbar.
export const STARTER = { gold: 150, apples: 2 }

// Kits (K): the full-screen Kits screen. Level 1 kits are free; every other kit
// needs the player level AND costs Gold (never premium currency, CLAUDE.md).
// [id, name, icon art (lobby/pixelart.js), accent colour, level, armor points /20, armor set, description]
// armor sets: leather | chain | iron | gold | diamond | dark | emerald | ruby | frost (lobby/characters.js)
const KIT_TABLE = [
  ['swordsman', 'Swordsman', 'sword', '#9a9aa0', 1, 15, 'iron', 'An iron sword and a full set of iron armor. Simple and reliable.'],
  ['archer', 'Archer', 'bow', '#b07a3e', 1, 9, 'leather', 'A bow with 32 arrows and light leather armor. Hit them from afar.'],
  ['bouncer', 'Bouncer', 'wand', '#9a6ad0', 1, 11, 'chain', 'A knockback stick that sends enemies flying off the edge.'],
  ['glider', 'Glider', 'feather', '#cfd6dc', 2, 9, 'leather', 'Hold jump in the air to glide slowly across the void.'],
  ['spring', 'Spring', 'spring', '#3aa02a', 4, 10, 'chain', 'Spring boots: jump three blocks high and take no fall damage.'],
  ['tnt', 'TNT', 'tnt', '#d8302a', 6, 10, 'leather', 'Throws lit TNT that blasts blocks and players apart.'],
  ['snowman', 'Snowman', 'snow', '#9cc4f6', 8, 11, 'frost', 'Snowballs that slow enemies down on every hit.'],
  ['grappler', 'Grappler', 'hook', '#7a7a84', 10, 10, 'chain', 'A grappling hook that pulls you to any block it hits.'],
  ['tank', 'Tank', 'shield', '#2f5fb8', 12, 20, 'iron', 'Shield and heavy armor. Slow but almost impossible to knock back.'],
  ['medic', 'Medic', 'heal', '#e83a3a', 14, 11, 'leather', 'Heals nearby allies and starts with 3 golden apples.'],
  ['pyro', 'Pyro', 'flame', '#e0401a', 16, 12, 'ruby', 'Fire sword: every hit sets the target alight.'],
  ['warper', 'Warper', 'orb', '#1f9a8a', 18, 10, 'chain', 'Three warp orbs to blink across the arena.'],
  ['miner', 'Miner', 'pickaxe_iron', '#8a8a8a', 20, 12, 'iron', 'Mines through blocks fast and places walls for cover.'],
  ['frost', 'Frost', 'sword_ice', '#3a9ad0', 23, 13, 'frost', 'An ice blade that freezes enemies for half a second.'],
  ['ninja', 'Ninja', 'star', '#e0a010', 26, 8, 'dark', 'Throwing stars and a double jump. Fast and fragile.'],
  ['viking', 'Viking', 'axe', '#8a5a2b', 29, 14, 'iron', 'A heavy axe that breaks shields on hit.'],
  ['alchemist', 'Alchemist', 'potion', '#e0507a', 32, 9, 'leather', 'Splash potions of harm, slowness and healing.'],
  ['ranger', 'Ranger', 'bow_gold', '#f0c832', 35, 11, 'chain', 'Golden bow: arrows fly faster and pierce shields.'],
  ['druid', 'Druid', 'wand_nature', '#3a7a2a', 38, 10, 'emerald', 'Grows vines that root enemies to the ground.'],
  ['pirate', 'Pirate', 'sword_gold', '#c89614', 42, 13, 'gold', 'A golden cutlass. Every kill drops extra Gold.'],
  ['bomber', 'Bomber', 'orb_fire', '#d84a1a', 46, 10, 'ruby', 'Fire bombs that leave burning ground behind.'],
  ['crusader', 'Crusader', 'shield_red', '#c82a2a', 50, 18, 'iron', 'Sword and a red tower shield that blocks arrows.'],
  ['poseidon', 'Poseidon', 'trident', '#3ad0d0', 54, 13, 'diamond', 'A trident you can throw. Faster in water.'],
  ['reaper', 'Reaper', 'axe_dark', '#4a4a5a', 58, 11, 'dark', 'Every kill restores 3 hearts.'],
  ['vampire', 'Vampire', 'sword_red', '#a01c1c', 62, 12, 'dark', 'Steals a bit of health with every hit.'],
  ['stormcaller', 'Stormcaller', 'wand_ice', '#8ad8ff', 66, 11, 'diamond', 'Calls lightning on the enemy you hit three times in a row.'],
  ['engineer', 'Engineer', 'pickaxe', '#3aa0a8', 70, 13, 'iron', 'Builds a turret that shoots arrows at enemies.'],
  ['necromancer', 'Necromancer', 'wand_dark', '#ff3a5a', 74, 10, 'dark', 'Raises two zombies to fight for you.'],
  ['hunter', 'Hunter', 'bow_dark', '#6a4a8a', 78, 11, 'leather', 'Marks targets: they glow through walls for 5 seconds.'],
  ['samurai', 'Samurai', 'sword_jade', '#1a7a3a', 82, 13, 'emerald', 'A quick katana with a dash strike.'],
  ['beekeeper', 'Beekeeper', 'apple', '#f0c020', 86, 10, 'gold', 'Releases a swarm of bees that chase enemies.'],
  ['ghost', 'Ghost', 'orb_ghost', '#c8d8e8', 90, 8, 'chain', 'Turns invisible for 4 seconds after taking damage.'],
  ['golem', 'Golem', 'shield_gold', '#e0a010', 94, 20, 'gold', 'Huge health and a ground slam that knocks everyone back.'],
  ['assassin', 'Assassin', 'sword_dark', '#5a4a70', 98, 9, 'dark', 'Hits from behind deal double damage.'],
  ['blaze', 'Blaze', 'flame_blue', '#3a8aff', 102, 12, 'diamond', 'Blue fireballs that burn twice as hot.'],
  ['gladiator', 'Gladiator', 'trident_gold', '#f0c832', 106, 16, 'gold', 'A golden spear. Each kill gives a stacking damage buff.'],
  ['plague', 'Plague Bringer', 'potion_green', '#5ad04a', 110, 10, 'leather', 'Poison clouds that linger around the arena.'],
  ['warden', 'Warden', 'orb_void', '#5a2a9a', 114, 17, 'dark', 'A sonic boom that goes through walls.'],
  ['berserker', 'Berserker', 'axe_gold', '#f0c832', 118, 8, 'gold', 'Hits harder the lower your health is.'],
  ['monk', 'Monk', 'heal_green', '#4ad04a', 121, 9, 'leather', 'Fists only, but every punch heals you a little.'],
  ['chronomancer', 'Chronomancer', 'clock', '#ffd23a', 125, 11, 'gold', 'Rewinds you to where you were 3 seconds ago.'],
  ['crusher', 'Crusher', 'mace', '#5a5a68', 128, 15, 'iron', 'A mace that hits harder the further you fell.'],
  ['phoenix', 'Phoenix', 'wand_fire', '#e07a20', 132, 12, 'ruby', 'Comes back to life once per round in a burst of fire.'],
  ['mystic', 'Mystic', 'potion_purple', '#a05ae0', 136, 10, 'dark', 'Swaps places with the enemy you hit.'],
  ['champion', 'Champion', 'mace_gold', '#f0c832', 140, 17, 'gold', 'A golden mace and golden armor. The ultimate kit.'],
]
// Gold price grows with the level requirement (rounded to 25).
const kitPrice = (level) => (level <= 1 ? 0 : Math.round((6 * level ** 1.75 + 40) / 25) * 25)
export const KITS = KIT_TABLE.map(([id, name, icon, color, level, armor, armorSet, desc]) => ({ id, name, icon, color, level, armor, armorSet, desc, price: kitPrice(level) }))

// Shop (B): consumables that go to the hotbar, priced in Gold.
export const SHOP_ITEMS = [
  { id: 'apple', name: 'Golden Apple', icon: 'apple', price: 80, desc: 'Restores 4 hearts over a few seconds.' },
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

// Arena combat (src/arena/combat.js, bots.js, weapons.js). Health is ARENA.maxHp (20 =
// 10 hearts). Damage is cut by armor (armorPerPoint per kit armor point, capped at
// maxArmorCut); a melee hit scales with the attack charge (0.2 + 0.8 * charge^2) and a
// fully charged hit while falling is a critical (critMul). Kill credit goes to the last
// hitter within creditWindow s, also when the victim then falls into the void or lava.
export const COMBAT = {
  reach: 3.2, // m from the eyes
  iframes: 0.45, // s a target cannot be hurt again after a hit
  knockback: 6.2, // m/s pushed away per hit (times the weapon's kb)
  knockUp: 5.4, // m/s lift
  sprintKnock: 1.45, // sprint hits push harder
  arrowKnock: 0.45,
  critMul: 1.5,
  armorPerPoint: 0.03,
  maxArmorCut: 0.6,
  creditWindow: 8,
  assistWindow: 10,
  combatTag: 8, // s after hitting or being hit: "in combat" (R cannot leave)
  spawnProtect: 6, // s after landing; attacking ends it
  // New players (below `level`): bots deal `botDmg` of their damage to you and at most `maxBots`
  // bots (their zombies included) chase you at once.
  rookie: { level: 5, botDmg: 0.65, maxBots: 1 },
  touchAssistDeg: 12, // touch aim assist cone
  weapons: {
    sword: { name: 'Sword', dmg: 6, cooldown: 0.6, kb: 1 },
    axe: { name: 'Axe', dmg: 8, cooldown: 0.95, kb: 1.1 },
    stick: { name: 'Knockback Stick', dmg: 2, cooldown: 0.5, kb: 2.3 },
    fist: { name: 'Fists', dmg: 2, cooldown: 0.3, kb: 0.7 },
    bow: { name: 'Bow', dmg: 2, dmgMax: 9, draw: 1, speed: 14, speedMax: 46, gravity: -18, arrows: 32, cooldown: 0.3, kb: 1 },
  },
  rewards: {
    killGold: 25,
    killXp: 20,
    assistGold: 10,
    assistXp: 6,
    streaks: { 3: 25, 5: 50, 10: 100, 15: 150, 20: 200 }, // extra Gold on reaching these streaks
    shutdownAt: 5, // ending someone's streak this long pays shutdownGold
    shutdownGold: 50,
    repeatMul: 0.5, // killing the same player twice in a row pays this share of the Gold + XP
    // Gold per hp of damage you deal (so a life without a kill still earns something), at most
    // one full health bar per target every dmgGoldWindow s (no farming a regenerating friend)
    dmgGold: 0.5,
    dmgGoldWindow: 30,
  },
  bots: {
    count: 7, // in the arena at once
    countTouch: 5, // on phones / tablets
    respawn: [4, 9], // s until a dead bot is replaced
    maxKitLevel: 140, // bots pick kits up to this level (the cheaper ones more often)...
    kitLevelAhead: 10, // ...and at most this far above the lowest level among the players in the arena
    archerShare: 0.25,
    sight: 24, // m
    maxOnPlayer: 2, // at most this many bots (zombies included) chase one player at once
    playerBias: 0.85, // < 1: they prefer you a little over each other
    hitChance: 0.72,
    cooldown: [0.7, 1.05], // s between swings (scaled by the weapon's cooldown)
    aimError: 0.05, // rad, archers
    walkSpeed: 4.6,
    runSpeed: 7.2,
    strafeSpeed: 3.2,
    critJumps: 0.9, // per second chance to jump in for a crit when close
    fleeChance: 0.5, // below 3 hearts they may run for a bit
  },
}

// Kit powers (src/arena/abilities.js + effects.js), by kit id. Passives:
//   speed (move multiplier), jumpMul, airJumps, glide, noFall, swimFast, kbResist (0..1 of
//   knockback ignored), dmgTaken, dmg (dealt), regen (hp/s, always), shield (hold right click /
//   the ability button to block hits from the front; tower = wider arc), lifesteal, punchHeal,
//   backstab (x from behind), lowHpDmg (up to +x at 0 hp), fallDmg (+per m fallen), killHeal,
//   killGold (extra Gold per kill), killStack (+dmg per kill this life, maxStacks), revive (hp,
//   once per life), ghost { invis, cooldown }, bowSpeed, pierce (arrows through shields),
//   cooldownMul (weapon swing time).
// onHit (the kit weapon): ignite s, freeze s, slow s, mark s, breakShield s, lightning (every
//   nth hit in a row on the same target), swap (cooldown s).
// ability (F / right click with nothing to use / the touch ability button): type + numbers;
//   `ammo` = uses per life (refilled on each drop) instead of a cooldown-only power.
export const KIT_POWERS = {
  swordsman: {},
  archer: {},
  bouncer: {},
  glider: { glide: true, noFall: true },
  spring: { jumpMul: 1.48, noFall: true },
  tnt: { ability: { type: 'tnt', cooldown: 6, damage: 10, radius: 4.2, fuse: 1.6 } },
  snowman: { ability: { type: 'snowball', ammo: 16, cooldown: 0.3, damage: 1, slow: 2.2 } },
  grappler: { noFall: true, ability: { type: 'hook', cooldown: 4, range: 32 } },
  tank: { shield: true, speed: 0.88, kbResist: 0.7 },
  medic: { regen: 0.5, ability: { type: 'apple', ammo: 3, cooldown: 1 } },
  pyro: { onHit: { ignite: 3 } },
  warper: { ability: { type: 'orb', ammo: 3, cooldown: 1 } },
  miner: { ability: { type: 'wall', cooldown: 10, life: 10 } },
  frost: { onHit: { freeze: 0.6 } },
  ninja: { speed: 1.15, airJumps: 1, noFall: true, ability: { type: 'star', ammo: 8, cooldown: 0.35, damage: 3 } },
  viking: { onHit: { breakShield: 5 } },
  alchemist: { ability: { type: 'potion', cooldown: 3, damage: 5, slow: 3, heal: 7, radius: 3 } },
  ranger: { bowSpeed: 1.35, pierce: true },
  druid: { ability: { type: 'vines', cooldown: 7, root: 2.2, damage: 2 } },
  pirate: { killGold: 15 },
  bomber: { ability: { type: 'firebomb', cooldown: 6, damage: 4, radius: 2.6, life: 4 } },
  crusader: { shield: true, tower: true, kbResist: 0.4 },
  poseidon: { swimFast: true, ability: { type: 'trident', cooldown: 4, damage: 8 } },
  reaper: { killHeal: 6 },
  vampire: { lifesteal: 0.3 },
  stormcaller: { onHit: { lightning: 3 } },
  engineer: { ability: { type: 'turret', cooldown: 25, life: 20, range: 18, every: 1.2, damage: 4 } },
  necromancer: { ability: { type: 'zombies', cooldown: 30, count: 2, life: 25, hp: 10 } },
  hunter: { onHit: { mark: 5 } },
  samurai: { cooldownMul: 0.75, ability: { type: 'dash', cooldown: 5, damage: 6, speed: 20 } },
  beekeeper: { ability: { type: 'bees', cooldown: 18, count: 4, life: 10, damage: 1 } },
  ghost: { ghost: { invis: 4, cooldown: 12 } },
  golem: { dmgTaken: 0.67, kbResist: 0.5, ability: { type: 'slam', cooldown: 9, radius: 5, damage: 4 } },
  assassin: { backstab: 2 },
  blaze: { ability: { type: 'fireball', cooldown: 2.5, damage: 6, burn: 4 } },
  gladiator: { killStack: 0.1, maxStacks: 5 },
  plague: { ability: { type: 'poison', cooldown: 12, radius: 3.2, life: 6, dps: 1.5 } },
  warden: { ability: { type: 'boom', cooldown: 10, damage: 7, range: 16 } },
  berserker: { lowHpDmg: 0.8 },
  monk: { punchHeal: 1 },
  chronomancer: { ability: { type: 'rewind', cooldown: 15, seconds: 3 } },
  crusher: { fallDmg: 1.5 },
  phoenix: { revive: 10 },
  mystic: { onHit: { swap: 8 } },
  champion: { dmg: 1.15 },
}

// Online play (src/net.js, remotePlayers.js, backend KitRoom.ts). On Bloxity the SDK resolves
// the game server; in dev the client tries SERVER_URL (run the backend with `npm start`) and
// plays offline (local bots only) when nothing answers.
export const SERVER_URL = import.meta.env.DEV ? import.meta.env.VITE_SERVER_URL_DEV || 'ws://localhost:2567' : ''
export const NET = {
  room: 'kitpvp',
  poseHz: 15, // own pose sent at most this often
  botsHz: 10, // host: bot snapshots per second
  interp: 0.12, // s of delay the others are drawn at (smooth between snapshots)
  retry: 2, // s before the first reconnect; doubles after each failed try...
  retryMax: 30, // ...up to this
  rejoin: 1, // s before resolving again after the room closed
  minBots: 2, // bots kept in the arena however many players are in it
}

// Duels (src/duel/): 1v1 on floating platforms far from the arena, first to `wins` rounds. The
// server (KitRoom.ts) matches players, keeps the score and the ranked rating; practice against
// a bot runs on this client only (the last platform). Rewards: [Gold, XP] per result; practice
// pays XP only so it can't be farmed for Gold.
export const DUEL = {
  slots: 4, // online platforms (backend KIT.duel.slots)
  practiceSlot: 4,
  // platform centres: `cols` per row along x from x0 every dx, rows at z0 + n * dz. VoxelWorld
  // keys only hold -256..255 per axis, so everything stays inside that (and past minX, which is
  // how combat.js tells the duel platforms from the arena)
  cols: 3,
  x0: 150,
  dx: 45,
  z0: -60,
  dz: 120,
  minX: 120,
  y: -40, // platform floor surface
  radius: 10, // platform radius in blocks
  spawnDx: 6.5, // spawns this far either side of the centre
  killBelow: 22, // m under the floor = fell off (round lost)
  wins: 3,
  countdown: 3, // s frozen before each round (server: KIT.duel.countdownMs)
  rewards: {
    casual: { win: [100, 60], loss: [20, 15] },
    ranked: { win: [150, 80], loss: [25, 20] },
    practice: { win: [0, 25], loss: [0, 5] },
  },
}

// --- Bloxity platform features (src/bloxity.js, src/boxity.js) --------------------------------
// Leaderboards: declared once with Legion.SDK.leaderboard.define(); the SERVER submits the scores
// from state it owns (backend src/boxity/boards.ts). The ids and settings here must match it.
export const BOARDS = [
  { id: 'kills', label: 'Player kills', order: 'desc', mode: 'sum', format: 'number', reset: 'weekly' },
  { id: 'streak', label: 'Best killstreak', order: 'desc', mode: 'best', format: 'number', reset: 'weekly' },
  { id: 'duels', label: 'Duels won', order: 'desc', mode: 'sum', format: 'number', reset: 'none' },
  { id: 'rating', label: 'Duel rating', order: 'desc', mode: 'best', format: 'number', reset: 'none' },
]
// Rewarded ad: watch one, get Gold (never a premium currency). The server verifies the reward token
// and answers with the amount (backend KIT.adRewardGold); `gold` here is only the label until then.
export const AD_REWARD = { placement: 'bonus-gold', gold: 150, cooldown: 60 }
// Screen ads: the screens the game has (declared once). Gameplay banners stay off (no `show`).
// Panels keep the right edge, the other edges hold the game's own windows.
export const AD_SCREENS = {
  panel: { slots: [{ position: 'middle-right', sizes: ['160x600', '300x250'] }] },
  results: {},
  gameplay: {},
}

// Shop items used in the arena (right click / tap the selected hotbar slot again).
export const SHOP_USE = {
  apple: { heal: 8, over: 4 }, // hp over s
  potion: { speed: 1.3, time: 20 },
  orb: {}, // thrown warp orb
  steak: { food: 8 },
  shield: { durability: 10 }, // blocks before it breaks (hold right click / hold the slot)
  boost: { kills: 10 }, // double XP for this many kills
}
// Hunger (arena only): drains while you fight; below `low` there is no natural
// regeneration and no sprinting. Steak refills it.
export const HUNGER = { max: 20, drain: 1 / 25, sprintDrain: 1 / 9, low: 6 }
// Fall damage (arena only): 1 hp per m fallen beyond `safe` (kits with noFall skip it).
export const FALL = { safe: 3.5, perM: 1 }
