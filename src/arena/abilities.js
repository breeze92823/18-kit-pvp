// Kit abilities: what pressing F (right click with nothing to use, the touch ability
// button) does for each kit, the per-life ammo / cooldowns, and when a bot decides to
// use its kit's ability. The numbers live in KIT_POWERS (config.js); the world effects
// in effects.js. Works the same for the player and for bots (any combat entity).
import { KIT_POWERS } from '../config.js'
import { THROWN } from './effects.js'

const THROWS = new Set(Object.keys(THROWN))
// HUD label + icon art per ability type
export const ABILITY_INFO = {
  tnt: ['Throw TNT', 'tnt'],
  snowball: ['Snowball', 'snow'],
  star: ['Throwing Star', 'star'],
  orb: ['Warp Orb', 'orb'],
  potion: ['Splash Potion', 'potion'],
  firebomb: ['Fire Bomb', 'orb_fire'],
  fireball: ['Blue Fireball', 'flame_blue'],
  trident: ['Throw Trident', 'trident'],
  vines: ['Vines', 'wand_nature'],
  poison: ['Poison Cloud', 'potion_green'],
  hook: ['Grappling Hook', 'hook'],
  apple: ['Golden Apple', 'apple'],
  wall: ['Build Wall', 'pickaxe_iron'],
  turret: ['Build Turret', 'pickaxe'],
  zombies: ['Raise Zombies', 'wand_dark'],
  bees: ['Bee Swarm', 'apple'],
  dash: ['Dash Strike', 'sword_jade'],
  slam: ['Ground Slam', 'shield_gold'],
  boom: ['Sonic Boom', 'orb_void'],
  rewind: ['Rewind', 'clock'],
}
const POTIONS = ['harm', 'slow', 'heal']
export const potionLabel = (i) => ['Potion of Harming', 'Potion of Slowness', 'Potion of Healing'][i % 3]

export const powerOf = (kitId) => KIT_POWERS[kitId] ?? {}

export function createAbilities(effects, api) {
  // fresh life: ammo refilled, cooldowns cleared, once-per-life powers rearmed
  function reset(e) {
    e.power = powerOf(e.kit?.id)
    const a = e.power.ability
    e.ammo = a?.ammo ?? null
    e.abilityReady = 0
    e.revived = false
    e.stacks = 0
    e.hitChain = null
    e.swapReady = 0
    e.ghostReady = 0
    e.potionNext = 0
    e.status = {}
  }
  function ready(e, t) {
    const a = e.power?.ability
    if (!a || t < e.abilityReady) return false
    return e.ammo === null || e.ammo > 0
  }
  // aim: { from: {x,y,z}, dir: {x,y,z} (unit) }
  function use(e, aim, t, opts = {}) {
    const a = e.power?.ability
    if (!a || !ready(e, t) || !e.alive) return false
    let ok = true
    if (THROWS.has(a.type)) {
      const o = { ...a }
      if (a.type === 'potion') {
        o.effect = opts.potion ?? POTIONS[e.potionNext % 3]
        if (!opts.potion) e.potionNext++
      }
      effects.throwItem(a.type, e, aim.from, aim.dir, o)
    } else {
      switch (a.type) {
        case 'apple':
          api.regen(e, 8, 4)
          break
        case 'wall':
          ok = effects.wall(e, aim.dir.x, aim.dir.z, a.life ?? 10)
          break
        case 'turret':
          ok = effects.turret(e, a)
          break
        case 'zombies':
          ok = api.spawnMinions(e, a)
          break
        case 'bees':
          ok = effects.addBees(e, a)
          break
        case 'dash':
          ok = effects.dash(e, aim.dir.x, aim.dir.z, a)
          break
        case 'slam':
          ok = effects.slam(e, a)
          break
        case 'boom':
          ok = effects.boom(e, aim.from, aim.dir, a)
          break
        case 'rewind':
          ok = effects.rewind(e, a)
          break
        default:
          ok = false
      }
    }
    if (!ok) return false
    // bots never spam cheap ammo throws
    const cd = e.isBot ? Math.max(a.cooldown, a.ammo ? 1.4 : a.cooldown) : a.cooldown
    e.abilityReady = t + cd
    if (e.ammo !== null) e.ammo--
    return true
  }

  // A bot decides whether its ability fits the moment; returns true when it used it.
  function botUse(b, tg, d, los, t) {
    const a = b.power?.ability
    if (!a || !ready(b, t) || !tg) return false
    let want = false
    let potion = null
    switch (a.type) {
      case 'tnt':
      case 'firebomb':
      case 'poison':
        want = los && d > 3.5 && d < 14
        break
      case 'snowball':
      case 'star':
      case 'trident':
      case 'fireball':
      case 'vines':
        want = los && d > 2 && d < 22
        break
      case 'potion':
        if (b.hp < 8) {
          want = true
          potion = 'heal'
        } else {
          want = los && d > 2.5 && d < 12
          potion = Math.random() < 0.6 ? 'harm' : 'slow'
        }
        break
      case 'orb':
        want = los && d > 12 && d < 26
        break
      case 'apple':
        want = b.hp < 9
        break
      case 'wall':
        want = tg.weapon?.type === 'bow' && los && d > 6 && d < 20
        break
      case 'turret':
      case 'zombies':
      case 'bees':
        want = d < 16
        break
      case 'dash':
        want = los && d > 2.5 && d < 7
        break
      case 'slam':
        want = d < 3.6
        break
      case 'boom':
        want = d < 14
        break
      case 'rewind':
        want = b.hp < 6
        break
    }
    if (!want) return false
    const from = { x: b.pos.x, y: b.pos.y + 1.5, z: b.pos.z }
    let dir
    if (potion === 'heal') dir = { x: 0, y: -1, z: 0 }
    else {
      const dx = tg.pos.x - from.x
      const dz = tg.pos.z - from.z
      let dy = tg.pos.y + 1.1 - from.y
      const h = Math.hypot(dx, dz) || 0.001
      const S = THROWN[a.type]
      if (S && S.gravity) {
        const tt = h / S.speed
        dy += 0.5 * -S.gravity * tt * tt
      }
      const len = Math.hypot(dx, dy, dz) || 1
      dir = { x: dx / len, y: dy / len, z: dz / len }
    }
    return use(b, { from: { x: from.x + dir.x * 0.4, y: from.y, z: from.z + dir.z * 0.4 }, dir }, t, { potion })
  }

  return { reset, ready, use, botUse }
}
