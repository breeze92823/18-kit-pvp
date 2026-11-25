// Voxel world: block registry, sparse storage, a face-culled mesher with
// per-vertex ambient occlusion and greedy-merged Rapier colliders.
//
// Z-fighting: the mesher never emits two coplanar faces that can both be
// seen. A face is dropped when the neighbour on that side is a full opaque
// cube; partial shapes (slabs, stairs, fences) are built from boxes whose
// touching faces are skipped explicitly, and plants are crossed quads that
// only intersect along a line. Every material gets one geometry group, so
// the whole lobby is a handful of draw calls.
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshStandardMaterial, Uint32BufferAttribute } from 'three'
import { blockTexture } from './blocktex.js'
import { RAPIER, addFixed } from '../physics.js'

// --- Registry ----------------------------------------------------------------------
// shape: cube | slab | slab_top | stair | cross | fence
// tex: one name, or { top, bottom, side }
// kind: opaque | cutout (alpha-tested leaves) | plant (double-sided cross quads)
const DEFS = [
  null, // 0 = air
  { name: 'grass', tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, randomTop: true, sound: 'grass' },
  { name: 'dirt', tex: 'dirt', randomTop: true, sound: 'dirt' },
  { name: 'coarse_dirt', tex: 'coarse_dirt', randomTop: true, sound: 'dirt' },
  { name: 'coarse_dirt_b', tex: 'coarse_dirt_b', randomTop: true, sound: 'dirt' },
  { name: 'rooted_dirt', tex: 'rooted_dirt', randomTop: true, sound: 'dirt' },
  { name: 'path', tex: { top: 'path_top', bottom: 'dirt', side: 'dirt' }, randomTop: true, sound: 'gravel' },
  { name: 'podzol', tex: { top: 'podzol_top', bottom: 'dirt', side: 'dirt' }, randomTop: true, sound: 'grass' },
  { name: 'stone', tex: 'stone', sound: 'stone' },
  { name: 'deep_stone', tex: 'deep_stone', sound: 'stone' },
  { name: 'andesite', tex: 'andesite', randomTop: true, sound: 'stone' },
  { name: 'smooth_stone', tex: 'smooth_stone', sound: 'stone' },
  { name: 'cobblestone', tex: 'cobblestone', sound: 'stone' },
  { name: 'mossy_cobblestone', tex: 'mossy_cobblestone', sound: 'stone' },
  { name: 'gravel', tex: 'gravel', randomTop: true, sound: 'gravel' },
  { name: 'stone_bricks', tex: 'stone_bricks', sound: 'stone' },
  { name: 'oak_planks', tex: 'oak_planks', sound: 'wood' },
  { name: 'spruce_planks', tex: 'spruce_planks', sound: 'wood' },
  { name: 'dark_planks', tex: 'dark_planks', sound: 'wood' },
  { name: 'oak_log', tex: { top: 'oak_log_top', bottom: 'oak_log_top', side: 'oak_log' }, sound: 'wood' },
  { name: 'spruce_log', tex: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log' }, sound: 'wood' },
  { name: 'dark_log', tex: { top: 'dark_log_top', bottom: 'dark_log_top', side: 'dark_log' }, sound: 'wood' },
  { name: 'oak_leaves', tex: 'oak_leaves', kind: 'cutout', sound: 'leaves' },
  { name: 'dark_leaves', tex: 'dark_leaves', kind: 'cutout', sound: 'leaves' },
  { name: 'bush', tex: 'bush_leaves', kind: 'cutout', sound: 'leaves' },
  { name: 'white_wool', tex: 'white_wool', sound: 'wool' },
  { name: 'packed_ice', tex: 'packed_ice', roughness: 0.25, sound: 'glass' },
  { name: 'obsidian', tex: 'obsidian', roughness: 0.3, sound: 'stone' },
  { name: 'barrel', tex: { top: 'barrel_top', bottom: 'barrel_top', side: 'barrel_side' }, sound: 'wood' },
  { name: 'hay', tex: { top: 'hay_top', bottom: 'hay_top', side: 'hay_side' }, sound: 'grass' },
  { name: 'bookshelf', tex: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' }, sound: 'wood' },
  // partial shapes
  { name: 'spruce_slab', tex: 'spruce_planks', shape: 'slab', sound: 'wood' },
  { name: 'spruce_slab_top', tex: 'spruce_planks', shape: 'slab_top', sound: 'wood' },
  { name: 'dark_slab', tex: 'dark_planks', shape: 'slab', sound: 'wood' },
  { name: 'dark_slab_top', tex: 'dark_planks', shape: 'slab_top', sound: 'wood' },
  { name: 'oak_slab', tex: 'oak_planks', shape: 'slab', sound: 'wood' },
  { name: 'oak_slab_top', tex: 'oak_planks', shape: 'slab_top', sound: 'wood' },
  { name: 'andesite_slab', tex: 'andesite', shape: 'slab', sound: 'stone' },
  { name: 'stone_slab', tex: 'smooth_stone', shape: 'slab', sound: 'stone' },
  { name: 'cobble_slab', tex: 'cobblestone', shape: 'slab', sound: 'stone' },
  { name: 'cobble_slab_top', tex: 'cobblestone', shape: 'slab_top', sound: 'stone' },
  { name: 'white_slab', tex: 'white_wool', shape: 'slab', sound: 'wool' },
  { name: 'spruce_stairs', tex: 'spruce_planks', shape: 'stair', sound: 'wood' },
  { name: 'dark_stairs', tex: 'dark_planks', shape: 'stair', sound: 'wood' },
  { name: 'oak_stairs', tex: 'oak_planks', shape: 'stair', sound: 'wood' },
  { name: 'andesite_stairs', tex: 'andesite', shape: 'stair', sound: 'stone' },
  { name: 'cobble_stairs', tex: 'cobblestone', shape: 'stair', sound: 'stone' },
  { name: 'stone_brick_stairs', tex: 'stone_bricks', shape: 'stair', sound: 'stone' },
  { name: 'oak_fence', tex: 'oak_planks', shape: 'fence', sound: 'wood' },
  { name: 'dark_fence', tex: 'dark_planks', shape: 'fence', sound: 'wood' },
  { name: 'spruce_fence', tex: 'spruce_planks', shape: 'fence', sound: 'wood' },
  // plants
  { name: 'tall_grass', tex: 'tall_grass', shape: 'cross', kind: 'plant' },
  { name: 'fern', tex: 'fern', shape: 'cross', kind: 'plant' },
  { name: 'poppy', tex: 'poppy', shape: 'cross', kind: 'plant' },
  { name: 'cornflower', tex: 'cornflower', shape: 'cross', kind: 'plant' },
  { name: 'dandelion', tex: 'dandelion', shape: 'cross', kind: 'plant' },
  { name: 'daisy', tex: 'daisy', shape: 'cross', kind: 'plant' },
  { name: 'allium', tex: 'allium', shape: 'cross', kind: 'plant' },
  { name: 'sapling', tex: 'sapling', shape: 'cross', kind: 'plant' },

  // --- arena: frost ---
  { name: 'snow', tex: 'snow', randomTop: true, sound: 'snow' },
  { name: 'snowy_dirt', tex: { top: 'snow', bottom: 'dirt', side: 'snowy_dirt_side' }, randomTop: true, sound: 'snow' },
  { name: 'frost_ice', tex: 'frost_ice', roughness: 0.22, sound: 'glass' },
  { name: 'snowy_ice', tex: { top: 'snow', bottom: 'frost_ice', side: 'snowy_ice_side' }, randomTop: true, roughness: 0.3, sound: 'snow' },
  { name: 'ice', tex: 'ice', roughness: 0.08, sound: 'glass' },
  { name: 'snow_slab', tex: 'snow', shape: 'slab', sound: 'snow' },
  // --- arena: nether ---
  { name: 'netherrack', tex: 'netherrack', randomTop: true, sound: 'nether' },
  { name: 'netherrack_b', tex: 'netherrack_b', randomTop: true, sound: 'nether' },
  { name: 'nether_bricks', tex: 'nether_bricks', sound: 'stone' },
  { name: 'nether_brick_slab', tex: 'nether_bricks', shape: 'slab', sound: 'stone' },
  { name: 'nether_brick_stairs', tex: 'nether_bricks', shape: 'stair', sound: 'stone' },
  { name: 'nether_brick_fence', tex: 'nether_bricks', shape: 'fence', sound: 'stone' },
  { name: 'glowstone', tex: 'glowstone', emissive: 2.1, light: ['#ffd27a', 15], roughness: 0.6, sound: 'glass' },
  { name: 'magma', tex: 'magma', emissive: 1.4, light: ['#ff5a14', 8], sound: 'stone' },
  { name: 'lava', tex: 'lava', shape: 'liquid', liquid: 'lava', emissive: 2.0, light: ['#ff6a1a', 15], solid: false, roughness: 0.7 },
  { name: 'crimson_roots', tex: 'crimson_roots', shape: 'cross', kind: 'plant' },
  // --- arena: spring isles (end stone + purpur) ---
  { name: 'end_stone', tex: 'end_stone', randomTop: true, sound: 'stone' },
  { name: 'end_stone_bricks', tex: 'end_stone_bricks', sound: 'stone' },
  { name: 'end_brick_slab', tex: 'end_stone_bricks', shape: 'slab', sound: 'stone' },
  { name: 'purpur_block', tex: 'purpur_block', sound: 'stone' },
  { name: 'purpur_pillar', tex: { top: 'purpur_pillar_top', bottom: 'purpur_pillar_top', side: 'purpur_pillar' }, sound: 'stone' },
  { name: 'purpur_slab', tex: 'purpur_block', shape: 'slab', sound: 'stone' },
  { name: 'purpur_stairs', tex: 'purpur_block', shape: 'stair', sound: 'stone' },
  { name: 'chorus_plant', tex: 'chorus_plant', sound: 'wood' },
  { name: 'chorus_flower', tex: 'chorus_flower', emissive: 0.5, light: ['#d9a6ff', 7], sound: 'wood' },
  { name: 'end_gem', tex: 'end_gem', emissive: 1.6, light: ['#4dffa0', 9], roughness: 0.3, sound: 'glass' },
  // --- arena: central plaza ---
  { name: 'mud_bricks', tex: 'mud_bricks', sound: 'stone' },
  { name: 'packed_mud', tex: 'packed_mud', randomTop: true, sound: 'stone' },
  { name: 'brown_cobble', tex: 'brown_cobble', sound: 'stone' },
  { name: 'mud_brick_slab', tex: 'mud_bricks', shape: 'slab', sound: 'stone' },
  { name: 'mud_brick_stairs', tex: 'mud_bricks', shape: 'stair', sound: 'stone' },
  // --- arena: summer valley ---
  { name: 'sand', tex: 'sand', randomTop: true, sound: 'sand' },
  { name: 'clay', tex: 'clay', randomTop: true, sound: 'dirt' },
  { name: 'azalea_leaves', tex: 'azalea_leaves', kind: 'cutout', sound: 'leaves' },
  { name: 'flowering_azalea', tex: 'flowering_azalea', kind: 'cutout', sound: 'leaves' },
  { name: 'oak_log_x', tex: { top: 'oak_log_h', bottom: 'oak_log_h', side: 'oak_log_h', px: 'oak_log_top', nx: 'oak_log_top' }, sound: 'wood' },
  { name: 'water', tex: 'water', shape: 'liquid', liquid: 'water', kind: 'water', solid: false, roughness: 0.1, sound: 'wade' },
  { name: 'orange_tulip', tex: 'orange_tulip', shape: 'cross', kind: 'plant' },
  { name: 'pink_tulip', tex: 'pink_tulip', shape: 'cross', kind: 'plant' },
  { name: 'sugar_cane', tex: 'sugar_cane', shape: 'cross', kind: 'plant' },
  // waterlogged: drawn together with a water cell
  { name: 'seagrass', tex: 'seagrass', shape: 'cross', kind: 'plant', waterlogged: true },
  { name: 'lily_pad', tex: 'lily_pad', shape: 'pad', kind: 'plant', waterlogged: true },
  // a ladder on the wall of its cell (meta = the side the wall is on, like FACING)
  { name: 'ladder', tex: 'ladder', shape: 'ladder', kind: 'cutout', solid: false, sound: 'wood' },
]

export const BLOCK = {} // name -> id
const INFO = [] // id -> normalised def
DEFS.forEach((d, id) => {
  if (!d) {
    INFO[id] = null
    return
  }
  const tex = typeof d.tex === 'string' ? { top: d.tex, bottom: d.tex, side: d.tex } : { ...d.tex }
  const shape = d.shape ?? 'cube'
  const kind = d.kind ?? 'opaque'
  INFO[id] = {
    ...d,
    id,
    tex,
    shape,
    kind,
    occludes: shape === 'cube' && kind === 'opaque', // hides neighbour faces, casts AO
    aoCaster: shape === 'cube', // leaves darken corners too
    solid: d.solid ?? kind !== 'plant',
    liquid: d.liquid ?? (d.waterlogged ? 'water' : null),
  }
  BLOCK[d.name] = id
})
export const blockInfo = (id) => INFO[id]
const WATER = INFO[BLOCK.water]
const liquidOf = (info) => (info ? info.liquid : null)

// Stair facing (meta): where the tall back half is. 0 = north (-Z), 1 = east (+X), 2 = south (+Z), 3 = west (-X).
export const FACING = { north: 0, east: 1, south: 2, west: 3 }

// --- Storage -----------------------------------------------------------------------
const OFF = 256
const key = (x, y, z) => (x + OFF) + (y + OFF) * 512 + (z + OFF) * 262144
const LIQUID_H = 14 / 16 // a liquid's surface sits 2 px below the top of its cell
const ZERO = [0, 0, 0]

export class VoxelWorld {
  constructor() {
    this.cells = new Map() // key -> id | meta << 8
    this.min = { x: 1e9, y: 1e9, z: 1e9 }
    this.max = { x: -1e9, y: -1e9, z: -1e9 }
  }

  set(x, y, z, name, meta = 0) {
    if (name === null || name === 'air') {
      this.cells.delete(key(x, y, z))
      return
    }
    const id = BLOCK[name]
    if (id === undefined) throw new Error(`unknown block ${name}`)
    this.cells.set(key(x, y, z), id | (meta << 8))
    if (x < this.min.x) this.min.x = x
    if (y < this.min.y) this.min.y = y
    if (z < this.min.z) this.min.z = z
    if (x > this.max.x) this.max.x = x
    if (y > this.max.y) this.max.y = y
    if (z > this.max.z) this.max.z = z
  }
  fill(x0, y0, z0, x1, y1, z1, name, meta = 0) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) this.set(x, y, z, name, meta)
  }
  raw(x, y, z) {
    return this.cells.get(key(x, y, z)) ?? 0
  }
  id(x, y, z) {
    return this.raw(x, y, z) & 255
  }
  name(x, y, z) {
    const i = INFO[this.id(x, y, z)]
    return i ? i.name : null
  }
  info(x, y, z) {
    return INFO[this.id(x, y, z)]
  }
  occludes(x, y, z) {
    const i = INFO[this.id(x, y, z)]
    return !!i && i.occludes
  }
  aoAt(x, y, z) {
    const i = INFO[this.id(x, y, z)]
    return i && i.aoCaster ? 1 : 0
  }
  solid(x, y, z) {
    const i = INFO[this.id(x, y, z)]
    return !!i && i.solid
  }
  // Highest solid block's top at or below y in column (x, z); null when there is none down to minY.
  groundY(x, z, fromY = 40) {
    for (let y = Math.floor(fromY); y >= this.min.y; y--) {
      const i = this.info(x, y, z)
      if (i && i.solid) return y + (i.shape === 'slab' ? 0.5 : 1)
    }
    return null
  }

  // --- Block light ----------------------------------------------------------------------
  // Minecraft-style flood fill from emissive blocks (lava, glowstone, ...): a level
  // drops by one per block through anything that is not a full opaque cube. Stored
  // per cell as a linear RGB multiplier the voxel shader adds as emission, so blocks
  // near lava glow red-orange in the dark. `extra` = [{ x, y, z, color, level }].
  bakeLight(extra = [], gain = 1.35) {
    const level = new Map()
    const color = new Map()
    const qx = []
    const qy = []
    const qz = []
    const colors = new Map()
    const col = (hex) => {
      let c = colors.get(hex)
      if (!c) colors.set(hex, (c = new Color(hex)))
      return c
    }
    const seed = (x, y, z, c, l) => {
      const k = key(x, y, z)
      if ((level.get(k) ?? 0) >= l) return
      level.set(k, l)
      color.set(k, c)
      qx.push(x)
      qy.push(y)
      qz.push(z)
    }
    for (const [k, v] of this.cells) {
      const info = INFO[v & 255]
      if (!info.light) continue
      seed((k % 512) - OFF, (Math.floor(k / 512) % 512) - OFF, Math.floor(k / 262144) - OFF, col(info.light[0]), info.light[1])
    }
    for (const e of extra) seed(e.x, e.y, e.z, col(e.color), e.level)
    const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
    for (let h = 0; h < qx.length; h++) {
      const x = qx[h]
      const y = qy[h]
      const z = qz[h]
      const k = key(x, y, z)
      const l = level.get(k) - 1
      if (l <= 0) continue
      const c = color.get(k)
      for (const [dx, dy, dz] of N6) {
        const nx = x + dx
        const ny = y + dy
        const nz = z + dz
        if (this.occludes(nx, ny, nz)) continue
        const nk = key(nx, ny, nz)
        if ((level.get(nk) ?? 0) >= l) continue
        level.set(nk, l)
        color.set(nk, c)
        qx.push(nx)
        qy.push(ny)
        qz.push(nz)
      }
    }
    this.light = new Map()
    for (const [k, l] of level) {
      const f = Math.pow(l / 15, 3) * gain
      const c = color.get(k)
      this.light.set(k, [c.r * f, c.g * f, c.b * f])
    }
    return this.light.size
  }
  lightAt(x, y, z) {
    return this.light?.get(key(x, y, z)) ?? ZERO
  }

  // --- Mesh -------------------------------------------------------------------------
  buildMesh() {
    const lit = !!this.light
    const buckets = new Map() // material key -> { pos, nor, uv, col, bl, idx, ... }
    const bucket = (tex, kind, rough, emissive = 0) => {
      const k = `${tex}|${kind}|${rough}|${emissive}|${lit}`
      let b = buckets.get(k)
      if (!b) {
        b = { pos: [], nor: [], uv: [], col: [], bl: lit ? [] : null, idx: [], tex, kind, rough, emissive, lit }
        buckets.set(k, b)
      }
      return b
    }

    for (const [k, v] of this.cells) {
      const x = (k % 512) - OFF
      const y = (Math.floor(k / 512) % 512) - OFF
      const z = Math.floor(k / 262144) - OFF
      const info = INFO[v & 255]
      const meta = v >> 8
      if (info.shape === 'cube') this.meshCube(x, y, z, info, bucket)
      else if (info.shape === 'slab') this.meshBox(x, y, z, info, bucket, 0, 0, 0, 1, 0.5, 1, { skipTop: false })
      else if (info.shape === 'slab_top') this.meshBox(x, y, z, info, bucket, 0, 0.5, 0, 1, 1, 1, {})
      else if (info.shape === 'stair') this.meshStair(x, y, z, info, meta, bucket)
      else if (info.shape === 'fence') this.meshFence(x, y, z, info, bucket)
      else if (info.shape === 'cross') this.meshCross(x, y, z, info, bucket)
      else if (info.shape === 'liquid') this.meshLiquid(x, y, z, info, bucket)
      else if (info.shape === 'ladder') this.meshLadder(x, y, z, info, meta, bucket)
      else if (info.shape === 'pad') this.meshPad(x, y, z, info, bucket)
      if (info.waterlogged) this.meshLiquid(x, y, z, WATER, bucket)
    }

    const geo = new BufferGeometry()
    const pos = []
    const nor = []
    const uv = []
    const col = []
    const bl = []
    const idx = []
    const materials = []
    let start = 0
    // see-through water last (it is drawn in the transparent pass anyway)
    const list = [...buckets.values()].sort((a, b) => (a.kind === 'water') - (b.kind === 'water'))
    for (const b of list) {
      const base = pos.length / 3
      for (let i = 0; i < b.pos.length; i++) pos.push(b.pos[i])
      for (let i = 0; i < b.nor.length; i++) nor.push(b.nor[i])
      for (let i = 0; i < b.uv.length; i++) uv.push(b.uv[i])
      for (let i = 0; i < b.col.length; i++) col.push(b.col[i])
      if (lit) for (let i = 0; i < b.bl.length; i++) bl.push(b.bl[i])
      for (const i of b.idx) idx.push(i + base)
      geo.addGroup(start, b.idx.length, materials.length)
      start += b.idx.length
      materials.push(makeMaterial(b))
    }
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new Float32BufferAttribute(nor, 3))
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    geo.setAttribute('color', new Float32BufferAttribute(col, 3))
    if (lit) geo.setAttribute('blight', new Float32BufferAttribute(bl, 3))
    geo.setIndex(new Uint32BufferAttribute(idx, 1))
    geo.computeBoundingSphere()
    const mesh = new Mesh(geo, materials)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = 'voxels'
    return mesh
  }

  // Full cube: 6 faces, each culled by an occluding neighbour, with AO.
  meshCube(x, y, z, info, bucket) {
    for (const f of FACES) {
      const nx = x + f.n[0]
      const ny = y + f.n[1]
      const nz = z + f.n[2]
      const nInfo = this.info(nx, ny, nz)
      if (nInfo) {
        if (nInfo.occludes) continue
        // same see-through cube (ice next to ice): the shared face is hidden from both sides
        if (nInfo.id === info.id && info.kind === 'opaque') continue
      }
      const tex = f.n[1] > 0 ? info.tex.top : f.n[1] < 0 ? info.tex.bottom : info.tex[f.id] ?? info.tex.side
      const b = bucket(tex, info.kind, info.roughness ?? 0.92, info.emissive)
      const rot = info.randomTop && f.n[1] > 0 ? hash(x, y, z) & 3 : 0
      emitFace(b, x, y, z, f, 0, 0, 0, 1, 1, 1, this, rot)
    }
  }

  // Axis-aligned box inside the block; faces on the block boundary are culled
  // by occluding neighbours, `skip` names faces to drop (shared with a sibling box).
  meshBox(x, y, z, info, bucket, x0, y0, z0, x1, y1, z1, skip = {}) {
    const flat = this.light ? this.lightAt(x, y, z) : null
    for (const f of FACES) {
      if (skip[f.id]) continue
      const onEdge = (f.n[0] > 0 && x1 === 1) || (f.n[0] < 0 && x0 === 0) || (f.n[1] > 0 && y1 === 1) || (f.n[1] < 0 && y0 === 0) || (f.n[2] > 0 && z1 === 1) || (f.n[2] < 0 && z0 === 0)
      if (onEdge && this.occludes(x + f.n[0], y + f.n[1], z + f.n[2])) continue
      const tex = f.n[1] > 0 ? info.tex.top : f.n[1] < 0 ? info.tex.bottom : info.tex[f.id] ?? info.tex.side
      emitFace(bucket(tex, info.kind, info.roughness ?? 0.92, info.emissive), x, y, z, f, x0, y0, z0, x1, y1, z1, null, 0, flat)
    }
  }

  meshStair(x, y, z, info, facing, bucket) {
    // lower half: full footprint; its top only where the upper half is absent
    this.meshBox(x, y, z, info, bucket, 0, 0, 0, 1, 0.5, 1, { py: true })
    // back half (tall side), and the front half of the lower box's top
    const back = [
      [0, 0.5, 0, 1, 1, 0.5], // north
      [0.5, 0.5, 0, 1, 1, 1], // east
      [0, 0.5, 0.5, 1, 1, 1], // south
      [0, 0.5, 0, 0.5, 1, 1], // west
    ][facing]
    const front = [
      [0, 0.5, 0.5, 1, 0.5, 1],
      [0, 0.5, 0, 0.5, 0.5, 1],
      [0, 0.5, 0, 1, 0.5, 0.5],
      [0.5, 0.5, 0, 1, 0.5, 1],
    ][facing]
    this.meshBox(x, y, z, info, bucket, ...back, { ny: true })
    // the exposed tread: a single up-facing quad
    const tex = info.tex.top
    emitFace(bucket(tex, info.kind, info.roughness ?? 0.92, info.emissive), x, y, z, FACE_BY_ID.py, front[0], 0, front[2], front[3], 0.5, front[5], null, 0, this.light ? this.lightAt(x, y, z) : null)
  }

  meshFence(x, y, z, info, bucket) {
    const p0 = 6 / 16
    const p1 = 10 / 16
    this.meshBox(x, y, z, info, bucket, p0, 0, p0, p1, 1, p1, {})
    const links = [
      [0, 0, -1, 'nz', 'pz'],
      [1, 0, 0, 'px', 'nx'],
      [0, 0, 1, 'pz', 'nz'],
      [-1, 0, 0, 'nx', 'px'],
    ]
    for (const [dx, , dz, outFace, inFace] of links) {
      const n = this.info(x + dx, y, z + dz)
      if (!n || !(n.shape === 'fence' || n.occludes)) continue
      for (const [ry0, ry1] of [
        [6 / 16, 9 / 16],
        [12 / 16, 15 / 16],
      ]) {
        const r0 = 7 / 16
        const r1 = 9 / 16
        let box
        if (dx === 1) box = [p1, ry0, r0, 1, ry1, r1]
        else if (dx === -1) box = [0, ry0, r0, p0, ry1, r1]
        else if (dz === 1) box = [r0, ry0, p1, r1, ry1, 1]
        else box = [r0, ry0, 0, r1, ry1, p0]
        this.meshBox(x, y, z, info, bucket, ...box, { [inFace]: true, [outFace]: n.shape === 'fence' })
      }
    }
  }

  meshCross(x, y, z, info, bucket) {
    const b = bucket(info.tex.side, 'plant', 1)
    const h = hash(x, y, z)
    const ox = ((h & 15) / 15 - 0.5) * 0.3
    const oz = (((h >> 4) & 15) / 15 - 0.5) * 0.3
    const hgt = 0.78 + (((h >> 8) & 15) / 15) * 0.3
    const cx = x + 0.5 + ox
    const cz = z + 0.5 + oz
    const r = 0.45
    const quads = [
      [cx - r, cz - r, cx + r, cz + r],
      [cx - r, cz + r, cx + r, cz - r],
    ]
    const L = this.light ? this.lightAt(x, y, z) : null
    for (const [ax, az, bx, bz] of quads) {
      const base = b.pos.length / 3
      b.pos.push(ax, y, az, bx, y, bz, bx, y + hgt, bz, ax, y + hgt, az)
      // Upward normals: plants light like the ground they stand on, no dark back side.
      for (let i = 0; i < 4; i++) b.nor.push(0, 1, 0)
      b.uv.push(0, 0, 1, 0, 1, hgt, 0, hgt)
      const dark = this.aoAt(x, y - 1, z) ? 0.78 : 0.7
      b.col.push(dark, dark, dark, dark, dark, dark, 1, 1, 1, 1, 1, 1)
      if (b.bl) for (let i = 0; i < 4; i++) b.bl.push(L[0], L[1], L[2])
      b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  // Lava / water: the surface sits at 14/16 unless the same liquid is above (a fall
  // column). Sides are drawn only toward cells that are neither solid nor the same
  // liquid, so a liquid face never shares a plane with a block face (no Z-fighting).
  meshLiquid(x, y, z, info, bucket) {
    const L = info.liquid
    const above = this.info(x, y + 1, z)
    const fullAbove = liquidOf(above) === L
    const h = fullAbove ? 1 : LIQUID_H
    const b = bucket(info.tex.side, info.kind, info.roughness ?? 0.92, info.emissive)
    const flat = this.light ? this.lightAt(x, y, z) : null
    if (!fullAbove && !(above && above.occludes)) emitFace(b, x, y, z, FACE_BY_ID.py, 0, 0, 0, 1, h, 1, null, 0, flat)
    for (const f of SIDE_FACES) {
      const n = this.info(x + f.n[0], y, z + f.n[2])
      if (n && (n.solid || liquidOf(n) === L)) continue
      emitFace(b, x, y, z, f, 0, 0, 0, 1, h, 1, null, 0, flat)
    }
    const below = this.info(x, y - 1, z)
    if (!(below && (below.solid || liquidOf(below) === L))) emitFace(b, x, y, z, FACE_BY_ID.ny, 0, 0, 0, 1, h, 1, null, 0, flat)
  }

  // A ladder: one quad 1/16 off its wall (front and back faces, never in the wall's plane).
  meshLadder(x, y, z, info, side, bucket) {
    const b = bucket(info.tex.side, 'cutout', 0.9)
    const d = 1 / 16
    const flat = this.light ? this.lightAt(x, y, z) : null
    const planes = [
      ['pz', 'nz', [0, 0, d, 1, 1, d]], // wall on -Z
      ['nx', 'px', [1 - d, 0, 0, 1 - d, 1, 1]], // wall on +X
      ['nz', 'pz', [0, 0, 1 - d, 1, 1, 1 - d]], // wall on +Z
      ['px', 'nx', [d, 0, 0, d, 1, 1]], // wall on -X
    ][side]
    emitFace(b, x, y, z, FACE_BY_ID[planes[0]], ...planes[2], null, 0, flat)
    emitFace(b, x, y, z, FACE_BY_ID[planes[1]], ...planes[2], null, 0, flat)
  }

  // A lily pad floating just above the water surface of its (waterlogged) cell.
  meshPad(x, y, z, info, bucket) {
    const b = bucket(info.tex.side, 'plant', 1)
    const flat = this.light ? this.lightAt(x, y + 1, z) : null
    emitFace(b, x, y, z, FACE_BY_ID.py, 0.02, 0, 0.02, 0.98, LIQUID_H + 0.045, 0.98, null, hash(x, y, z) & 3, flat)
  }

  // --- Colliders ----------------------------------------------------------------------
  // Full cubes are merged into as few cuboids as possible (2D greedy per layer,
  // then identical rectangles stacked across layers); partial shapes get their own boxes.
  buildColliders() {
    const layers = new Map() // y -> Set of "x,z"
    const extras = []
    for (const [k, v] of this.cells) {
      const x = (k % 512) - OFF
      const y = (Math.floor(k / 512) % 512) - OFF
      const z = Math.floor(k / 262144) - OFF
      const info = INFO[v & 255]
      if (!info.solid) continue
      if (info.shape === 'cube') {
        let s = layers.get(y)
        if (!s) layers.set(y, (s = new Set()))
        s.add(x * 1024 + z)
      } else if (info.shape === 'slab') extras.push([x, y, z, 1, 0.5, 1, 0.5, 0.25, 0.5])
      else if (info.shape === 'slab_top') extras.push([x, y, z, 1, 0.5, 1, 0.5, 0.75, 0.5])
      else if (info.shape === 'stair') {
        extras.push([x, y, z, 1, 0.5, 1, 0.5, 0.25, 0.5])
        const f = v >> 8
        const bx = [0.5, 0.75, 0.5, 0.25][f]
        const bz = [0.25, 0.5, 0.75, 0.5][f]
        const sx = f % 2 ? 0.5 : 1
        const sz = f % 2 ? 1 : 0.5
        extras.push([x, y, z, sx, 0.5, sz, bx, 0.75, bz])
      } else if (info.shape === 'fence') extras.push([x, y, z, 0.25, 1.5, 0.25, 0.5, 0.75, 0.5])
    }

    const rects = new Map() // "x0,z0,x1,z1" -> { y0, y1 } open stack
    const boxes = []
    const ys = [...layers.keys()].sort((a, b) => a - b)
    for (const y of ys) {
      const set = layers.get(y)
      const seen = new Set()
      const list = [...set].map((c) => {
        const x = Math.round(c / 1024)
        return [x, c - x * 1024]
      })
      list.sort((a, b) => a[1] - b[1] || a[0] - b[0])
      const layerRects = []
      for (const [x, z] of list) {
        const id = x * 1024 + z
        if (seen.has(id)) continue
        let x1 = x
        while (set.has((x1 + 1) * 1024 + z) && !seen.has((x1 + 1) * 1024 + z)) x1++
        let z1 = z
        outer: for (;;) {
          for (let xi = x; xi <= x1; xi++) {
            const c = xi * 1024 + z1 + 1
            if (!set.has(c) || seen.has(c)) break outer
          }
          z1++
        }
        for (let xi = x; xi <= x1; xi++) for (let zi = z; zi <= z1; zi++) seen.add(xi * 1024 + zi)
        layerRects.push(`${x},${z},${x1},${z1}`)
      }
      const still = new Set()
      for (const r of layerRects) {
        const open = rects.get(r)
        if (open && open.y1 === y - 1) open.y1 = y
        else {
          if (open) boxes.push([r, open.y0, open.y1])
          rects.set(r, { y0: y, y1: y })
        }
        still.add(r)
      }
      for (const [r, open] of rects) {
        if (!still.has(r) && open.y1 < y) {
          boxes.push([r, open.y0, open.y1])
          rects.delete(r)
        }
      }
    }
    for (const [r, open] of rects) boxes.push([r, open.y0, open.y1])

    for (const [r, y0, y1] of boxes) {
      const [x0, z0, x1, z1] = r.split(',').map(Number)
      const hx = (x1 - x0 + 1) / 2
      const hy = (y1 - y0 + 1) / 2
      const hz = (z1 - z0 + 1) / 2
      addFixed(RAPIER.ColliderDesc.cuboid(hx, hy, hz), { x: x0 + hx, y: y0 + hy, z: z0 + hz }, null, { friction: 0.9 })
    }
    for (const [x, y, z, sx, sy, sz, cx, cy, cz] of extras) {
      addFixed(RAPIER.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2), { x: x + cx, y: y + cy, z: z + cz }, null, { friction: 0.9 })
    }
    return boxes.length + extras.length
  }
}

// --- Face emission ---------------------------------------------------------------------
// Each face: outward normal n, in-plane axes u, v with u x v = n.
const FACES = [
  { id: 'px', n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { id: 'nx', n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { id: 'py', n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { id: 'ny', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { id: 'pz', n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { id: 'nz', n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
]
const FACE_BY_ID = Object.fromEntries(FACES.map((f) => [f.id, f]))
const SIDE_FACES = FACES.filter((f) => f.n[1] === 0)
const AO_LEVEL = [0.52, 0.7, 0.85, 1]

function hash(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

// Box-local start of a face along a signed unit axis, as a 0..1 texture coordinate.
const along = (axis, lo, hi) => {
  const i = axis[0] ? 0 : axis[1] ? 1 : 2
  const s = axis[i]
  return s > 0 ? [lo[i], hi[i] - lo[i]] : [1 - hi[i], hi[i] - lo[i]]
}

function emitFace(b, x, y, z, f, x0, y0, z0, x1, y1, z1, world, rot, flat = null) {
  const lo = [x0, y0, z0]
  const hi = [x1, y1, z1]
  // origin corner: the min side along u and v, the face side along n
  const o = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    if (f.n[i] > 0) o[i] = hi[i]
    else if (f.n[i] < 0) o[i] = lo[i]
    else if (f.u[i] > 0 || f.v[i] > 0) o[i] = lo[i]
    else o[i] = hi[i]
  }
  const U = f.u.map((c, i) => c * (hi[i] - lo[i]) * Math.abs(c))
  const V = f.v.map((c, i) => c * (hi[i] - lo[i]) * Math.abs(c))
  const corners = [o, add(o, U), add(add(o, U), V), add(o, V)]
  const [u0, ul] = along(f.u, lo, hi)
  const [v0, vl] = along(f.v, lo, hi)
  let uvs = [
    [u0, v0],
    [u0 + ul, v0],
    [u0 + ul, v0 + vl],
    [u0, v0 + vl],
  ]
  if (rot) {
    // quarter turns of the full tile (anti-tiling on ground tops)
    uvs = uvs.map(([u, v]) => {
      for (let r = 0; r < rot; r++) [u, v] = [1 - v, u]
      return [u, v]
    })
  }

  // Ambient occlusion from the three neighbours around each corner, outside the face.
  // With block light, each corner also averages the light of the same cells.
  const ao = [3, 3, 3, 3]
  const lc = b.bl ? cornerLight : null
  if (lc) for (let c = 0; c < 4; c++) lc[c] = flat ?? ZERO
  if (world) {
    const bx = x + f.n[0]
    const by = y + f.n[1]
    const bz = z + f.n[2]
    const su = [-1, 1, 1, -1]
    const sv = [-1, -1, 1, 1]
    for (let c = 0; c < 4; c++) {
      const ux = f.u[0] * su[c]
      const uy = f.u[1] * su[c]
      const uz = f.u[2] * su[c]
      const vx = f.v[0] * sv[c]
      const vy = f.v[1] * sv[c]
      const vz = f.v[2] * sv[c]
      const s1 = world.aoAt(bx + ux, by + uy, bz + uz)
      const s2 = world.aoAt(bx + vx, by + vy, bz + vz)
      const cr = world.aoAt(bx + ux + vx, by + uy + vy, bz + uz + vz)
      ao[c] = s1 && s2 ? 0 : 3 - (s1 + s2 + cr)
      if (lc && world.light) {
        let r = 0
        let g = 0
        let bb = 0
        let n = 0
        const cells = [[bx, by, bz], [bx + ux, by + uy, bz + uz], [bx + vx, by + vy, bz + vz], [bx + ux + vx, by + uy + vy, bz + uz + vz]]
        for (let i = 0; i < 4; i++) {
          const [cx, cy, cz] = cells[i]
          if (i && world.occludes(cx, cy, cz)) continue
          const L = world.lightAt(cx, cy, cz)
          r += L[0]
          g += L[1]
          bb += L[2]
          n++
        }
        lc[c] = [r / n, g / n, bb / n]
      }
    }
  }

  const base = b.pos.length / 3
  for (let c = 0; c < 4; c++) {
    const p = corners[c]
    b.pos.push(x + p[0], y + p[1], z + p[2])
    b.nor.push(f.n[0], f.n[1], f.n[2])
    b.uv.push(uvs[c][0], uvs[c][1])
    const l = AO_LEVEL[ao[c]]
    b.col.push(l, l, l)
    if (lc) b.bl.push(lc[c][0], lc[c][1], lc[c][2])
  }
  // flip the diagonal so AO interpolates evenly
  if (ao[0] + ao[2] < ao[1] + ao[3]) b.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base)
  else b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const cornerLight = [ZERO, ZERO, ZERO, ZERO]

const matCache = new Map()
// Block light: the baked per-vertex colour is added as emission, tinted by the
// surface's own (AO-shaded) albedo, so lit blocks keep their texture.
function patchBlockLight(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 blight;\nvarying vec3 vBlight;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlight = blight;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBlight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vBlight;')
  }
  m.customProgramCacheKey = () => 'voxel-blocklight'
}
function makeMaterial(b) {
  const k = `${b.tex}|${b.kind}|${b.rough}|${b.emissive}|${b.lit}`
  if (matCache.has(k)) return matCache.get(k)
  const map = blockTexture(b.tex)
  const water = b.kind === 'water'
  const m = new MeshStandardMaterial({
    map,
    vertexColors: true,
    roughness: b.rough,
    metalness: 0,
    alphaTest: b.kind === 'opaque' || water ? 0 : 0.5,
    side: b.kind === 'plant' || water ? DoubleSide : undefined,
    transparent: water,
    opacity: water ? 0.8 : 1,
    depthWrite: !water,
  })
  if (b.emissive) {
    m.emissive = new Color('#ffffff')
    m.emissiveMap = map
    m.emissiveIntensity = b.emissive
  }
  if (b.lit) patchBlockLight(m)
  m.name = b.tex
  matCache.set(k, m)
  return m
}
// Every material built for a texture (the arena pulses lava's glow through this).
export const materialsFor = (tex) => [...matCache.values()].filter((m) => m.name === tex)
