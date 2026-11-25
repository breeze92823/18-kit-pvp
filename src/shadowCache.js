// Static shadow cache for the sun.
//
// The voxel worlds (lobby, arena, duel platforms: ~170k triangles) never move, yet three.js
// redrew all of them into the sun's shadow map every frame, which was ~30 % of the GPU frame
// on integrated graphics. Here the shadow pass is split in two:
//   - static: the worlds tagged `userData.staticShadow` are drawn into the shadow map only
//     when something invalidates it (the shadow box moved, the sun turned, the map was
//     recreated, a world was shown or hidden), then the map (packed depth colour + depth
//     buffer) is copied into a cache target;
//   - dynamic: every other frame starts by copying the cache back (one blit) and then draws
//     only the moving casters (players, NPCs, chests, walls...) on top, depth-tested against
//     the static depth.
// The result is the same shadow map three.js would have drawn (same depth materials, same
// camera, same filtering), so shadows look identical. lighting.js keeps the shadow box still
// until the player drifts a little and snaps it to whole shadow texels, so the cache stays
// valid while you walk around and static shadow edges no longer shimmer.
//
// It hooks renderer.shadowMap.render (WebGLRenderer.render calls it by property every frame),
// so the passes run inside three's own render state. Anything it cannot handle (other shadow
// casting lights, VSM, another scene) falls back to the stock pass.
import { Group, NearestFilter, VSMShadowMap, WebGLRenderTarget } from 'three'

export function installShadowCache(renderer, scene, sun) {
  const sm = renderer.shadowMap
  const baseRender = sm.render
  const gl = renderer.getContext()
  const state = renderer.state
  const props = renderer.properties
  const noop = () => {}

  let statics = [] // scene objects tagged userData.staticShadow
  let scannedKids = -1
  const staticRoot = new Group() // traversal root for the static pass (children = statics, not re-parented)
  let cache = null
  let dirty = true
  let lastMap = null
  let lastType = -1
  let lastVis = ''
  const lastPos = sun.position.clone()
  const lastTarget = sun.target.position.clone()
  const lastCam = [0, 0, 0, 0, 0, 0]

  function scan() {
    statics = []
    scene.traverse((o) => {
      if (o.userData.staticShadow) statics.push(o)
    })
    scannedKids = scene.children.length
  }
  // visible all the way up to the scene (the lobby root is hidden in the arena, etc.)
  function shown(o) {
    for (let p = o; p; p = p.parent) if (!p.visible) return false
    return true
  }
  function framebuffer(rt) {
    return props.get(rt).__webglFramebuffer
  }
  function blit(from, to) {
    const w = to.width
    const h = to.height
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, framebuffer(from))
    state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer(to))
    state.setScissorTest(false)
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST)
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
  }
  function checkDirty() {
    const shadow = sun.shadow
    const cam = shadow.camera
    if (shadow.map !== lastMap || sm.type !== lastType) dirty = true
    if (!sun.position.equals(lastPos) || !sun.target.position.equals(lastTarget)) dirty = true
    if (cam.left !== lastCam[0] || cam.right !== lastCam[1] || cam.top !== lastCam[2] || cam.bottom !== lastCam[3] || cam.near !== lastCam[4] || cam.far !== lastCam[5]) dirty = true
    let vis = ''
    for (const o of statics) vis += shown(o) ? '1' : '0'
    if (vis !== lastVis) dirty = true
    lastVis = vis
  }

  const api = {
    enabled: true, // false = the stock pass (A/B checks from the console: __game.lighting.shadowCache)
    // force a full redraw (e.g. after changing a static world)
    invalidate() {
      dirty = true
      scannedKids = -1
    },
  }

  sm.render = function (lights, sceneArg, camera) {
    if (!api.enabled) dirty = true
    // only our scene's sun, PCF shadows, and only when three would draw shadows at all
    if (!api.enabled || sceneArg !== scene || lights.length !== 1 || lights[0] !== sun || sm.type === VSMShadowMap || !sm.enabled || (sm.autoUpdate === false && sm.needsUpdate === false)) {
      return baseRender.call(this, lights, sceneArg, camera)
    }
    if (scene.children.length !== scannedKids) scan()
    if (!statics.length) return baseRender.call(this, lights, sceneArg, camera)
    const forced = sm.needsUpdate
    checkDirty()
    const shadow = sun.shadow
    if (cache && !framebuffer(cache)) dirty = true // context restored: targets are gone

    if (dirty || !shadow.map) {
      // static pass: only the tagged worlds that are currently shown (three clears the map first)
      staticRoot.children = statics.filter(shown)
      sm.needsUpdate = forced
      baseRender.call(this, lights, staticRoot, camera)
      staticRoot.children = []
      const map = shadow.map
      if (!cache || cache.width !== map.width || cache.height !== map.height) {
        cache?.dispose()
        cache = new WebGLRenderTarget(map.width, map.height, { minFilter: NearestFilter, magFilter: NearestFilter })
        renderer.initRenderTarget(cache)
      }
      blit(map, cache)
      dirty = false
      lastMap = map
      lastType = sm.type
      lastPos.copy(sun.position)
      lastTarget.copy(sun.target.position)
      const cam = shadow.camera
      lastCam[0] = cam.left
      lastCam[1] = cam.right
      lastCam[2] = cam.top
      lastCam[3] = cam.bottom
      lastCam[4] = cam.near
      lastCam[5] = cam.far
    } else {
      blit(cache, shadow.map)
    }

    // dynamic pass: everything else, drawn over the static depth (no clear)
    const hidden = []
    for (const o of statics) {
      if (o.visible) {
        o.visible = false
        hidden.push(o)
      }
    }
    const clear = renderer.clear
    renderer.clear = noop
    try {
      sm.needsUpdate = forced
      baseRender.call(this, lights, sceneArg, camera)
    } finally {
      renderer.clear = clear
      for (const o of hidden) o.visible = true
    }
  }

  return api
}
