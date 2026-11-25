// Which weapon a kit fights with (phase 1: the kit's main weapon only; kit abilities
// come later). Stats live in COMBAT.weapons (config.js); `item` is the pixel-art piece
// held in the hand and shown on the hotbar.
import { COMBAT, KITS } from '../config.js'

export function weaponFor(kitOrId) {
  const kit = typeof kitOrId === 'string' ? KITS.find((k) => k.id === kitOrId) : kitOrId
  const icon = kit?.icon ?? 'sword'
  let type = 'sword'
  let item = 'sword'
  if (kit?.id === 'monk') {
    type = 'fist'
    item = null
  } else if (kit?.id === 'bouncer') {
    type = 'stick'
    item = 'wand'
  } else if (/^bow/.test(icon)) {
    type = 'bow'
    item = icon
  } else if (/^(axe|mace)/.test(icon)) {
    type = 'axe'
    item = icon
  } else if (/^(sword|trident|pickaxe)/.test(icon)) item = icon
  return { type, item, ...COMBAT.weapons[type] }
}

// Damage left after armor: each armor point blocks a few percent, capped.
export const armorCut = (armor) => Math.min(COMBAT.maxArmorCut, (armor ?? 0) * COMBAT.armorPerPoint)
