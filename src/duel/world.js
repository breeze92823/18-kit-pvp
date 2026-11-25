// Duel platforms: DUEL.slots platforms, floating in two rows
// out past the arena along +x (inside the VoxelWorld key range, see DUEL in config.js). Each is a round stone-brick island
// with two cover pillars topped with glowstone, spawn pads at either end and an open edge: a
// knockback off it loses the round. Built as one VoxelWorld (mesh + colliders) with the same
// lookups the arena offers (liquidAt, surfaceAt, groundBelow...), so bots and effects work on it.
import { Group } from 'three'
import { DUEL } from '../config.js'
import { VoxelWorld, blockInfo } from '../voxel/voxels.js'
import { mulberry32 } from '../textures.js'

const THEMES = [
  { floor: 'stone_bricks', edge: 'mossy_cobblestone', under: ['cobblestone', 'andesite', 'stone'], pillar: 'cobblestone', pad: 'end_stone' },
  { floor: 'mud_bricks', edge: 'brown_cobble', under: ['packed_mud', 'brown_cobble', 'stone'], pillar: 'mud_bricks', pad: 'sand' },
  { floor: 'nether_bricks', edge: 'netherrack', under: ['netherrack', 'netherrack_b', 'deep_stone'], pillar: 'nether_bricks', pad: 'magma' },
  { floor: 'end_stone_bricks', edge: 'end_stone', under: ['end_stone', 'end_stone', 'deep_stone'], pillar: 'purpur_pillar', pad: 'purpur_block' },
  { floor: 'smooth_stone', edge: 'stone_bricks', under: ['andesite', 'stone', 'deep_stone'], pillar: 'stone_bricks', pad: 'packed_ice' },
]

export const slotCenter = (slot) => ({ x: DUEL.x0 + (slot % DUEL.cols) * DUEL.dx, y: DUEL.y, z: DUEL.z0 + Math.floor(slot / DUEL.cols) * DUEL.dz })
// spawn for side 0 / 1: on the pads, facing the other side
export function spawnOf(slot, side) {
  const c = slotCenter(slot)
  const s = side === 0 ? -1 : 1
  return { x: c.x + s * DUEL.spawnDx + 0.5, y: c.y, z: c.z + 0.5, facing: s < 0 ? Math.PI / 2 : -Math.PI / 2 }
}

export function createDuelWorld(scene) {
  const W = new VoxelWorld()
  const R = DUEL.radius
  for (let slot = 0; slot < DUEL.slots; slot++) {
    const T = THEMES[slot % THEMES.length]
    const c = slotCenter(slot)
    const rand = mulberry32(77 + slot)
    const set = (x, y, z, n) => W.set(c.x + x, c.y + y, c.z + z, n)
    for (let x = -R; x <= R; x++)
      for (let z = -R; z <= R; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5)
        if (d > R) continue
        set(x, -1, z, d > R - 1.2 ? T.edge : rand() < 0.1 ? T.edge : T.floor)
        // a tapered rock underneath
        const depth = 2 + Math.floor((R - d) * 0.9 + rand() * 2)
        for (let y = -2; y >= -1 - depth; y--) set(x, y, z, T.under[Math.min(T.under.length - 1, Math.floor((-y - 2) / 2))])
      }
    // spawn pads (3x3) at either end
    for (const s of [-1, 1])
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++) set(s * Math.round(DUEL.spawnDx) + x, -1, z, T.pad)
    // two cover pillars (3 high, glowstone on top) and low walls between them
    for (const s of [-1, 1]) {
      for (let y = 0; y < 3; y++) set(0, y, s * 4, T.pillar)
      set(0, 3, s * 4, 'glowstone')
      set(-2, 0, s * 6, T.edge)
      set(2, 0, s * 6, T.edge)
    }
  }
  const mesh = W.buildMesh()
  mesh.userData.staticShadow = true // never moves: its sun shadow is cached (shadowCache.js)
  const root = new Group()
  root.name = 'duel-platforms'
  root.add(mesh)
  scene.add(root)
  W.buildColliders()
  const cellInfo = (x, y, z) => blockInfo(W.id(Math.floor(x), Math.floor(y), Math.floor(z)))
  return {
    world: W,
    root,
    anchors: { center: slotCenter(0) },
    // arena-like lookups (no liquids, ladders or biomes up here)
    liquidAt: () => null,
    ladderAt: () => false,
    biomeAt: () => null,
    surfaceAt(x, y, z) {
      for (const dy of [-0.05, -0.55]) {
        const info = cellInfo(x, y + dy, z)
        if (info && info.solid) return info
      }
      return null
    },
    groundBelow: (x, y, z) => W.groundY(Math.floor(x), Math.floor(z), y),
  }
}
