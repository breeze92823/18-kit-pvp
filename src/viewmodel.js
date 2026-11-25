// First-person held item: the extruded pixel item for the selected hotbar
// slot (or a bare arm), with walk bob, look sway, an equip dip when you switch
// slots and a sword swing. It is a child of the camera and drawn last after a
// depth clear, so it never pokes into walls you stand against.
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three'
import { itemGeometry } from './lobby/models.js'

export function createViewmodel(camera) {
  const holder = new Group()
  camera.add(holder)

  // clears the depth buffer right before the held item is drawn
  const clearer = new Mesh(new PlaneGeometry(0.01, 0.01), new MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true }))
  clearer.position.z = -0.2
  clearer.renderOrder = 999
  clearer.frustumCulled = false
  clearer.onBeforeRender = (renderer) => renderer.clearDepth()
  holder.add(clearer)

  const pivot = new Group() // swing / bob transforms
  holder.add(pivot)
  const itemMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2, transparent: true, opacity: 1 })
  const armMat = new MeshStandardMaterial({ color: '#e8b48a', roughness: 0.8, transparent: true, opacity: 1 })
  const sleeveMat = new MeshStandardMaterial({ color: '#3a6ad0', roughness: 0.85, transparent: true, opacity: 1 })
  const item = new Mesh(itemGeometry('sword', 0.85, 1), itemMat)
  const arm = new Group()
  const hand = new Mesh(new BoxGeometry(0.11, 0.11, 0.3), armMat)
  const sleeve = new Mesh(new BoxGeometry(0.125, 0.125, 0.3), sleeveMat)
  sleeve.position.z = 0.29
  arm.add(hand, sleeve)
  for (const m of [item, hand, sleeve]) {
    m.renderOrder = 1000
    m.frustumCulled = false
  }
  pivot.add(item, arm)
  arm.visible = false

  // rest poses (camera space: -Z forward, +X right, +Y up)
  const ITEM_POS = [0.5, -0.44, -0.8]
  const ITEM_ROT = [-0.05, -1.12, 1.62] // blade up and to the left, flat side half toward you
  const ARM_POS = [0.3, -0.3, -0.42]
  const BOW_POS = [0.34, -0.32, -0.8] // the bow is held upright, facing you, closer to the middle
  const BOW_ROT = [0, -0.25, 0.8]
  item.rotation.order = 'YXZ'

  let current = 'sword'
  let bow = false
  let swingT = 0
  let equipT = 0
  let phase = 0
  let walk = 0
  const sway = { x: 0, y: 0 }

  function setItem(icon) {
    if (icon === current) return
    current = icon
    equipT = 1
    bow = !!icon && icon.startsWith('bow')
    if (icon) {
      item.geometry = itemGeometry(icon, bow ? 0.56 :/^(sword|axe|mace|trident|wand|pickaxe)/.test(icon) ? 0.85 : 0.55, 1)
      item.visible = true
      arm.visible = false
    } else {
      item.visible = false
      arm.visible = true
    }
  }

  let draw = 0 // 0..1 bow draw: pulls the item back and in, shaking at full draw
  // shield in the left hand, raised while blocking
  const shield = new Mesh(itemGeometry('shield', 0.7, 1), itemMat)
  shield.renderOrder = 1000
  shield.frustumCulled = false
  shield.visible = false
  holder.add(shield)
  let shieldIcon = 'shield'
  let block = 0
  let blocking = false
  return {
    holder,
    setItem,
    swing() {
      if (swingT <= 0.35) swingT = 1
    },
    setDraw(k) {
      draw = k
    },
    setBlock(on, icon = 'shield') {
      blocking = on
      if (icon !== shieldIcon) {
        shieldIcon = icon
        shield.geometry = itemGeometry(icon, 0.7, 1)
      }
    },
    update(dt, { speed = 0, grounded = true, lookDx = 0, lookDy = 0, visible = true }) {
      holder.visible = visible
      if (!visible) return
      walk += ((grounded ? Math.min(1, speed / 6) : 0) - walk) * Math.min(1, dt * 8)
      phase += dt * (4 + speed * 1.1)
      sway.x += (Math.max(-0.06, Math.min(0.06, -lookDx * 0.0009)) - sway.x) * Math.min(1, dt * 10)
      sway.y += (Math.max(-0.05, Math.min(0.05, lookDy * 0.0009)) - sway.y) * Math.min(1, dt * 10)
      swingT = Math.max(0, swingT - dt * 3.6)
      equipT = Math.max(0, equipT - dt * 4)
      const s = Math.sin((1 - swingT) * Math.PI) * (swingT > 0 ? 1 : 0)
      const e = Math.sin(equipT * Math.PI * 0.5)
      const bobX = Math.cos(phase) * 0.018 * walk
      const bobY = -Math.abs(Math.sin(phase)) * 0.026 * walk
      const shake = draw >= 1 ? Math.sin(phase * 9) * 0.003 : 0
      pivot.position.set(bobX + sway.x - s * 0.22 - draw * 0.12 + shake, bobY + sway.y - e * 0.35 + s * 0.05 + draw * 0.05, -s * 0.08 + draw * 0.1)
      pivot.rotation.set(-s * 0.9, s * 0.5, s * 0.35)
      // keep the item on screen on narrow (portrait) views
      const halfW = Math.tan((camera.fov * Math.PI) / 360) * -ITEM_POS[2] * camera.aspect
      const P = bow ? BOW_POS : ITEM_POS
      const Rt = bow ? BOW_ROT : ITEM_ROT
      // tall portrait screens: a smaller held item, tucked into the corner, so it blocks less
      const k = camera.aspect < 0.75 ? Math.max(0.62, camera.aspect / 0.75) : 1
      item.scale.setScalar(k)
      item.position.set(Math.min(P[0], halfW * 0.62), P[1] - (1 - k) * 0.2, P[2])
      item.rotation.set(Rt[0], Rt[1], Rt[2] + (bow ? draw * 0.12 : 0))
      arm.position.set(...ARM_POS)
      arm.rotation.set(0.25, -0.35, 0)
      // the shield slides up in front of you while blocking
      block += ((blocking ? 1 : 0) - block) * Math.min(1, dt * 14)
      shield.visible = block > 0.02
      shield.position.set(-0.3 + block * 0.12 + bobX, -0.75 + block * 0.42 + bobY, -0.62)
      shield.rotation.set(0, 0.35 - block * 0.25, 0)
    },
  }
}
