// Every sound is synthesised with WebAudio at runtime (no audio files):
// filtered noise for natural textures (footsteps per surface, wind, leaves,
// fire crackle, whooshes), resonant bodies for wood knocks and creaks, and
// soft bell / pluck tones for UI and rewards. A light reverb send gives the
// lobby some air. Positional loops (campfire, crate beams, the shaft wind)
// fade with distance from the listener.
//
// The context starts suspended until the first user gesture (browser policy);
// unlock() is wired to pointerdown/keydown in main.js.

let ctx = null
let master = null
let sfxBus = null
let ambBus = null
let reverb = null
let noiseBuf = null
let pinkBuf = null
let brownBuf = null
const vol = { sfx: 0.8, ambience: 0.6 }
const loops = [] // positional loops { gain, x, y, z, range, level }

function ensure() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 4
  master = ctx.createGain()
  master.gain.value = muted ? 0 : 0.9
  master.connect(comp).connect(ctx.destination)
  sfxBus = ctx.createGain()
  sfxBus.gain.value = vol.sfx
  ambBus = ctx.createGain()
  ambBus.gain.value = vol.ambience
  sfxBus.connect(master)
  ambBus.connect(master)
  // short room reverb from decaying noise
  reverb = ctx.createConvolver()
  const len = Math.floor(ctx.sampleRate * 1.4)
  const ir = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2)
  }
  reverb.buffer = ir
  const wet = ctx.createGain()
  wet.gain.value = 0.18
  reverb.connect(wet).connect(master)
  // noise buffers
  const n = ctx.sampleRate * 2
  noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate)
  pinkBuf = ctx.createBuffer(1, n, ctx.sampleRate)
  brownBuf = ctx.createBuffer(1, n, ctx.sampleRate)
  const w = noiseBuf.getChannelData(0)
  const p = pinkBuf.getChannelData(0)
  const b = brownBuf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1
    w[i] = white
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.969 * b2 + white * 0.153852
    b3 = 0.8665 * b3 + white * 0.3104856
    b4 = 0.55 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.016898
    p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
    b6 = white * 0.115926
    last = (last + 0.02 * white) / 1.02
    b[i] = last * 3.5
  }
  return ctx
}

export function unlock() {
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  if (!ambienceStarted) startAmbience()
}

export function setVolume(kind, v) {
  vol[kind] = v
  if (kind === 'sfx' && sfxBus) sfxBus.gain.value = v
  if (kind === 'ambience' && ambBus) ambBus.gain.value = v
}
export const getVolume = (kind) => vol[kind]

// Mutes everything (an ad break covers the game; Boxity requires audio off meanwhile). The master
// gain is the one place every bus ends up at.
let muted = false
export function setMuted(on) {
  muted = !!on
  if (master) master.gain.value = muted ? 0 : 0.9
}

const ready = () => ctx && ctx.state === 'running'
const now = () => ctx.currentTime
const rnd = (a, b) => a + Math.random() * (b - a)

// --- building blocks -------------------------------------------------------------------------
function out(gain = 1, { wet = 0, pan = 0, bus = sfxBus } = {}) {
  const g = ctx.createGain()
  g.gain.value = gain
  let node = g
  if (pan) {
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    g.connect(p)
    node = p
  }
  node.connect(bus)
  if (wet) {
    const s = ctx.createGain()
    s.gain.value = wet
    node.connect(s).connect(reverb)
  }
  return g
}
function noise(buf = noiseBuf, rate = 1) {
  const s = ctx.createBufferSource()
  s.buffer = buf
  s.loop = true
  s.playbackRate.value = rate
  return s
}
function filter(type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  return f
}
function env(g, t, a, peak, d, sustain = 0.0001) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + a)
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d)
}
// a noise burst through a filter chain
function burst({ t = now(), type = 'bandpass', freq = 1000, q = 1, dur = 0.08, gain = 0.4, attack = 0.004, buf = noiseBuf, sweepTo = null, wet = 0.05, pan = 0, offset = Math.random() * 1.5 }) {
  const src = noise(buf)
  const f = filter(type, freq, q)
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur)
  const g = ctx.createGain()
  env(g, t, attack, gain, dur)
  src.connect(f).connect(g).connect(out(1, { wet, pan }))
  src.start(t, offset)
  src.stop(t + attack + dur + 0.05)
}
// a short decaying oscillator (knocks, plucks, chimes)
function tone({ t = now(), type = 'sine', freq = 440, to = null, dur = 0.2, gain = 0.2, attack = 0.005, wet = 0.15, pan = 0, detune = 0 }) {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  o.detune.value = detune
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = ctx.createGain()
  env(g, t, attack, gain, dur)
  o.connect(g).connect(out(1, { wet, pan }))
  o.start(t)
  o.stop(t + attack + dur + 0.05)
}

// --- footsteps per surface ------------------------------------------------------------------------
// Each step is 2 layers: a body (low thump / knock) and a texture (crunch / scuff / tick),
// randomised in pitch and level so no two steps sound alike.
export function footstep(surface = 'dirt', loud = 1) {
  if (!ready()) return
  const t = now()
  const v = rnd(0.75, 1) * loud
  switch (surface) {
    case 'grass':
    case 'leaves':
      burst({ t, type: 'bandpass', freq: rnd(2200, 3400), q: 0.8, dur: rnd(0.07, 0.11), gain: 0.16 * v, buf: pinkBuf })
      burst({ t: t + 0.012, type: 'highpass', freq: 4000, q: 0.5, dur: 0.05, gain: 0.06 * v })
      burst({ t, type: 'lowpass', freq: 380, q: 0.7, dur: 0.06, gain: 0.18 * v, buf: brownBuf })
      break
    case 'gravel':
      for (let i = 0; i < 3; i++) burst({ t: t + i * rnd(0.008, 0.02), type: 'bandpass', freq: rnd(1500, 3200), q: 2, dur: 0.035, gain: 0.13 * v })
      burst({ t, type: 'lowpass', freq: 500, dur: 0.07, gain: 0.16 * v, buf: brownBuf })
      break
    case 'wood':
      tone({ t, type: 'triangle', freq: rnd(150, 190), to: rnd(95, 115), dur: 0.09, gain: 0.22 * v, wet: 0.1 })
      burst({ t, type: 'bandpass', freq: rnd(700, 950), q: 3, dur: 0.06, gain: 0.16 * v, wet: 0.12 })
      burst({ t, type: 'highpass', freq: 2500, dur: 0.02, gain: 0.05 * v })
      break
    case 'stone':
      burst({ t, type: 'highpass', freq: rnd(1800, 2600), q: 0.8, dur: 0.035, gain: 0.14 * v, wet: 0.12 })
      burst({ t, type: 'bandpass', freq: rnd(400, 600), q: 1.5, dur: 0.06, gain: 0.15 * v, wet: 0.1 })
      tone({ t, type: 'sine', freq: rnd(110, 140), to: 70, dur: 0.05, gain: 0.12 * v, wet: 0 })
      break
    case 'glass':
      tone({ t, type: 'sine', freq: rnd(2200, 2800), dur: 0.08, gain: 0.04 * v, wet: 0.25 })
      burst({ t, type: 'highpass', freq: 3000, dur: 0.03, gain: 0.1 * v, wet: 0.15 })
      burst({ t, type: 'lowpass', freq: 400, dur: 0.05, gain: 0.12 * v, buf: brownBuf })
      break
    case 'wool':
      burst({ t, type: 'lowpass', freq: 900, q: 0.5, dur: 0.1, gain: 0.12 * v, buf: pinkBuf })
      break
    case 'snow':
      // soft compressed crunch: a few tiny crackles over a muffled thump
      for (let i = 0; i < 4; i++) burst({ t: t + i * rnd(0.012, 0.025), type: 'bandpass', freq: rnd(1400, 2600), q: 1.4, dur: rnd(0.02, 0.04), gain: 0.07 * v, buf: pinkBuf })
      burst({ t, type: 'lowpass', freq: 600, q: 0.6, dur: 0.11, gain: 0.16 * v, buf: pinkBuf })
      burst({ t, type: 'lowpass', freq: 220, dur: 0.06, gain: 0.14 * v, buf: brownBuf })
      break
    case 'sand':
      burst({ t, type: 'bandpass', freq: rnd(1700, 2400), q: 0.6, dur: rnd(0.09, 0.13), gain: 0.11 * v, buf: pinkBuf, attack: 0.01 })
      burst({ t, type: 'lowpass', freq: 300, dur: 0.07, gain: 0.14 * v, buf: brownBuf })
      break
    case 'nether':
      // brittle, gritty rock
      burst({ t, type: 'bandpass', freq: rnd(800, 1100), q: 2.2, dur: 0.05, gain: 0.15 * v, wet: 0.08 })
      for (let i = 0; i < 2; i++) burst({ t: t + i * 0.014, type: 'highpass', freq: rnd(3000, 4200), dur: 0.018, gain: 0.07 * v })
      tone({ t, type: 'sine', freq: rnd(95, 120), to: 60, dur: 0.05, gain: 0.1 * v, wet: 0 })
      break
    case 'wade':
      burst({ t, type: 'bandpass', freq: rnd(900, 1300), sweepTo: 420, q: 0.9, dur: 0.16, gain: 0.14 * v, buf: pinkBuf, wet: 0.1 })
      tone({ t: t + 0.03, type: 'sine', freq: rnd(500, 800), to: rnd(1000, 1500), dur: 0.05, gain: 0.025 * v, wet: 0.1 })
      break
    default: // dirt
      burst({ t, type: 'bandpass', freq: rnd(900, 1400), q: 0.9, dur: rnd(0.06, 0.09), gain: 0.15 * v, buf: pinkBuf })
      burst({ t: t + 0.01, type: 'bandpass', freq: rnd(2400, 3200), q: 1.5, dur: 0.03, gain: 0.05 * v })
      burst({ t, type: 'lowpass', freq: 320, dur: 0.07, gain: 0.22 * v, buf: brownBuf })
  }
}

export function jump(surface) {
  if (!ready()) return
  footstep(surface, 0.7)
  burst({ type: 'bandpass', freq: 600, sweepTo: 1400, q: 0.6, dur: 0.16, gain: 0.05, buf: pinkBuf })
}
export function land(surface, impact = 1) {
  if (!ready()) return
  const k = Math.min(1.6, 0.6 + impact * 0.6)
  footstep(surface, k)
  footstep(surface, k * 0.6)
  tone({ type: 'sine', freq: 80, to: 45, dur: 0.12, gain: 0.25 * k, wet: 0 })
}

// --- UI -------------------------------------------------------------------------------------------
export function uiHover() {
  if (!ready()) return
  tone({ type: 'sine', freq: 1900, dur: 0.03, gain: 0.025, wet: 0 })
}
export function uiClick() {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'sine', freq: 1250, to: 820, dur: 0.06, gain: 0.12, wet: 0.05 })
  burst({ t, type: 'highpass', freq: 3500, dur: 0.012, gain: 0.08, wet: 0 })
}
export function uiOpen() {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'bandpass', freq: 500, sweepTo: 2200, q: 0.8, dur: 0.14, gain: 0.07, buf: pinkBuf, wet: 0.1 })
  tone({ t: t + 0.03, type: 'triangle', freq: 523, dur: 0.12, gain: 0.08 })
  tone({ t: t + 0.09, type: 'triangle', freq: 784, dur: 0.16, gain: 0.08 })
}
export function uiClose() {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'bandpass', freq: 1800, sweepTo: 500, q: 0.8, dur: 0.12, gain: 0.06, buf: pinkBuf, wet: 0.08 })
  tone({ t, type: 'triangle', freq: 659, dur: 0.1, gain: 0.06 })
  tone({ t: t + 0.06, type: 'triangle', freq: 440, dur: 0.14, gain: 0.06 })
}
export function uiTab() {
  if (!ready()) return
  burst({ type: 'bandpass', freq: 2200, q: 2, dur: 0.025, gain: 0.08, wet: 0 })
  tone({ type: 'sine', freq: 990, dur: 0.05, gain: 0.05, wet: 0 })
}
// coins clinking: a few bright metallic partials, staggered
export function coins(n = 4) {
  if (!ready()) return
  const t = now()
  for (let i = 0; i < n; i++) {
    const at = t + i * rnd(0.05, 0.09)
    const f = rnd(2400, 3600)
    tone({ t: at, type: 'sine', freq: f, dur: 0.18, gain: 0.05, wet: 0.2 })
    tone({ t: at, type: 'sine', freq: f * 1.51, dur: 0.12, gain: 0.03, wet: 0.2 })
    burst({ t: at, type: 'highpass', freq: 5000, dur: 0.015, gain: 0.06, wet: 0.1 })
  }
}
export function purchase() {
  if (!ready()) return
  coins(5)
  const t = now()
  ;[659, 880, 1175].forEach((f, i) => tone({ t: t + 0.08 + i * 0.07, type: 'triangle', freq: f, dur: 0.22, gain: 0.08, wet: 0.25 }))
}
export function deny() {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'square', freq: 196, dur: 0.09, gain: 0.05, wet: 0 })
  tone({ t: t + 0.11, type: 'square', freq: 165, dur: 0.14, gain: 0.05, wet: 0 })
  burst({ t, type: 'lowpass', freq: 400, dur: 0.1, gain: 0.08, buf: brownBuf })
}
export function equip() {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'bandpass', freq: 3200, q: 4, dur: 0.05, gain: 0.08, wet: 0.1 }) // metal slide
  tone({ t, type: 'triangle', freq: 1568, dur: 0.25, gain: 0.05, wet: 0.3 })
  tone({ t: t + 0.04, type: 'sine', freq: 2349, dur: 0.3, gain: 0.03, wet: 0.3 })
}
export function notify() {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'sine', freq: 1046, dur: 0.12, gain: 0.05, wet: 0.2 })
  tone({ t: t + 0.07, type: 'sine', freq: 1568, dur: 0.2, gain: 0.05, wet: 0.2 })
}
export function hotbar() {
  if (!ready()) return
  burst({ type: 'bandpass', freq: 1800, q: 3, dur: 0.02, gain: 0.07, wet: 0 })
}

// --- Combat / interaction ------------------------------------------------------------------------
export function swing(k = 1) {
  if (!ready()) return
  burst({ type: 'bandpass', freq: rnd(2600, 3200), sweepTo: 500, q: 1.2, dur: 0.16, gain: 0.16 * k, buf: pinkBuf, attack: 0.02, wet: 0.05 })
}
// --- Arena combat (k = loudness from distance, 0..1) ----------------------------------------------
// a weapon landing: a dull thwack plus a crunchy crack; a crit adds a bright ring
export function hit(crit = false, k = 1) {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'lowpass', freq: rnd(700, 900), sweepTo: 180, dur: 0.12, gain: 0.45 * k, buf: brownBuf, wet: 0.05 })
  burst({ t, type: 'bandpass', freq: rnd(1500, 2200), q: 1.5, dur: 0.06, gain: 0.2 * k, wet: 0.05 })
  tone({ t, type: 'triangle', freq: rnd(150, 180), to: 70, dur: 0.12, gain: 0.18 * k, wet: 0.05 })
  if (crit) {
    tone({ t: t + 0.01, type: 'square', freq: 1760, to: 1320, dur: 0.12, gain: 0.04 * k, wet: 0.3 })
    burst({ t, type: 'highpass', freq: 4500, dur: 0.18, gain: 0.12 * k, wet: 0.2 })
  }
}
// bowstring creak while drawing
export function bowDraw() {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'bandpass', freq: 900, sweepTo: 1600, q: 6, dur: 0.5, attack: 0.15, gain: 0.08, buf: pinkBuf, wet: 0.05 })
  tone({ t, type: 'sawtooth', freq: 70, to: 95, dur: 0.45, gain: 0.025, wet: 0.05 })
}
// string twang + whoosh, louder with more draw
export function bowShoot(charge = 1, k = 1) {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'triangle', freq: 210 + charge * 90, to: 120, dur: 0.18, gain: 0.16 * k, wet: 0.1 })
  burst({ t, type: 'bandpass', freq: 2400, sweepTo: 700, q: 0.9, dur: 0.22, attack: 0.01, gain: (0.08 + charge * 0.1) * k, buf: pinkBuf, wet: 0.1 })
}
// arrow thunking into a block
export function arrowHit(k = 1) {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'lowpass', freq: 1200, sweepTo: 300, dur: 0.08, gain: 0.3 * k, buf: brownBuf, wet: 0.1 })
  tone({ t, type: 'triangle', freq: rnd(330, 380), to: 300, dur: 0.15, gain: 0.05 * k, wet: 0.1 })
}
// you got a kill: a bright two-note ding
export function killDing() {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'triangle', freq: 880, dur: 0.14, gain: 0.09, wet: 0.25 })
  tone({ t: t + 0.08, type: 'triangle', freq: 1318, dur: 0.3, gain: 0.09, wet: 0.35 })
  tone({ t: t + 0.08, type: 'sine', freq: 2636, dur: 0.25, gain: 0.02, wet: 0.35 })
}
// --- Kit abilities -------------------------------------------------------------------------------
// slime ball / slime landing: a wet blob
export function squelch(k = 1) {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'sine', freq: 260, to: 90, dur: 0.18, gain: 0.14 * k, wet: 0.15 })
  burst({ t, type: 'lowpass', freq: 900, sweepTo: 200, dur: 0.16, gain: 0.18 * k, wet: 0.1 })
}
// firework shell: whistle up, crackle
export function firework(k = 1) {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'sine', freq: 600, to: 2400, dur: 0.35, gain: 0.05 * k, wet: 0.4 })
  burst({ t: t + 0.3, type: 'lowpass', freq: 2200, sweepTo: 300, dur: 0.5, gain: 0.3 * k, buf: brownBuf, wet: 0.5 })
  for (let i = 0; i < 6; i++) burst({ t: t + 0.42 + i * 0.05 + rnd(0, 0.03), type: 'highpass', freq: 3000, dur: 0.04, gain: 0.1 * k, wet: 0.4 })
}
// zap / spark: a short electric crack
export function zap(k = 1) {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'bandpass', freq: 4200, sweepTo: 1200, q: 1.4, dur: 0.18, gain: 0.25 * k, wet: 0.3 })
  tone({ t, type: 'sawtooth', freq: 1800, to: 300, dur: 0.12, gain: 0.04 * k, wet: 0.3 })
}
// the ultimate meter filled
export function ultReady() {
  if (!ready()) return
  const t = now()
  for (const [i, f] of [523, 659, 784, 1046].entries()) tone({ t: t + i * 0.06, type: 'triangle', freq: f, dur: 0.22, gain: 0.06, wet: 0.45 })
}
// the ultimate fires: a rising roar
export function ultimate(k = 1) {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'sawtooth', freq: 110, to: 440, dur: 0.5, gain: 0.08 * k, wet: 0.4 })
  tone({ t, type: 'triangle', freq: 220, to: 880, dur: 0.6, gain: 0.07 * k, wet: 0.5 })
  burst({ t, type: 'bandpass', freq: 600, sweepTo: 3200, q: 0.8, dur: 0.6, gain: 0.22 * k, wet: 0.4 })
}
export function explosion(k = 1) {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'sine', freq: 70, to: 28, dur: 0.9, gain: 0.55 * k, wet: 0.3 })
  burst({ t, type: 'lowpass', freq: 1400, sweepTo: 120, dur: 1.1, attack: 0.005, gain: 0.6 * k, buf: brownBuf, wet: 0.4 })
  burst({ t, type: 'bandpass', freq: 2500, sweepTo: 400, q: 0.6, dur: 0.5, gain: 0.25 * k, wet: 0.3 })
}
export function block(k = 1) {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'lowpass', freq: 900, sweepTo: 300, dur: 0.1, gain: 0.4 * k, buf: brownBuf, wet: 0.05 })
  tone({ t, type: 'square', freq: 260, to: 200, dur: 0.08, gain: 0.05 * k, wet: 0.1 })
}
export function shieldBreak(k = 1) {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'bandpass', freq: 1800, sweepTo: 400, q: 1.2, dur: 0.35, gain: 0.35 * k, wet: 0.2 })
  for (let i = 0; i < 5; i++) burst({ t: t + i * 0.04, type: 'lowpass', freq: rnd(500, 900), dur: 0.06, gain: 0.25 * k, buf: brownBuf })
}
export function warp(k = 1) {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'sine', freq: 300, to: 1200, dur: 0.35, gain: 0.08 * k, wet: 0.5 })
  tone({ t: t + 0.05, type: 'triangle', freq: 900, to: 220, dur: 0.4, gain: 0.05 * k, wet: 0.5 })
  burst({ t, type: 'bandpass', freq: 3000, sweepTo: 800, q: 2, dur: 0.4, gain: 0.08 * k, wet: 0.4 })
}
export function glass(k = 1) {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'highpass', freq: 3500, dur: 0.25, gain: 0.2 * k, wet: 0.2 })
  for (let i = 0; i < 4; i++) tone({ t: t + i * 0.03, type: 'sine', freq: rnd(2500, 4200), dur: 0.12, gain: 0.03 * k, wet: 0.3 })
}
export function fireWhoosh(k = 1) {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'bandpass', freq: 500, sweepTo: 1500, q: 0.7, dur: 0.45, attack: 0.05, gain: 0.3 * k, buf: pinkBuf, wet: 0.2 })
  burst({ t, type: 'lowpass', freq: 400, dur: 0.3, gain: 0.25 * k, buf: brownBuf, wet: 0.1 })
}
export function thunder(k = 1) {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'highpass', freq: 2500, dur: 0.12, gain: 0.35 * k, wet: 0.2 })
  burst({ t: t + 0.05, type: 'lowpass', freq: 600, sweepTo: 80, dur: 1.4, attack: 0.02, gain: 0.5 * k, buf: brownBuf, wet: 0.6 })
}
export function sonicBoom(k = 1) {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'sawtooth', freq: 55, to: 35, dur: 0.6, gain: 0.18 * k, wet: 0.4 })
  tone({ t, type: 'sine', freq: 110, to: 60, dur: 0.6, gain: 0.3 * k, wet: 0.4 })
  burst({ t, type: 'bandpass', freq: 300, q: 1, dur: 0.5, gain: 0.3 * k, buf: brownBuf, wet: 0.4 })
}
export function buzz(k = 1) {
  if (!ready()) return
  const t = now()
  for (let i = 0; i < 3; i++) tone({ t: t + i * 0.12, type: 'sawtooth', freq: rnd(210, 260), to: rnd(230, 280), dur: 0.4, gain: 0.025 * k, wet: 0.1 })
}
export function eat(k = 1) {
  if (!ready()) return
  const t = now()
  for (let i = 0; i < 4; i++) burst({ t: t + i * 0.13, type: 'bandpass', freq: rnd(700, 1100), q: 2, dur: 0.07, gain: 0.18 * k, buf: brownBuf, wet: 0.05 })
}
export function drink(k = 1) {
  if (!ready()) return
  const t = now()
  for (let i = 0; i < 4; i++) tone({ t: t + i * 0.12, type: 'sine', freq: rnd(320, 420), to: rnd(500, 640), dur: 0.09, gain: 0.08 * k, wet: 0.1 })
}

// kill streak fanfare
export function streak() {
  if (!ready()) return
  const t = now()
  ;[523, 659, 784, 1046, 1318].forEach((f, i) => tone({ t: t + 0.18 + i * 0.07, type: 'square', freq: f, dur: 0.22, gain: 0.035, wet: 0.4 }))
}
// a villager-ish "hrm?": a buzzy voice through two formant filters, pitch bending
export function npcTalk(pitch = 1) {
  if (!ready()) return
  const t = now()
  const syll = 2 + Math.floor(Math.random() * 2)
  for (let s = 0; s < syll; s++) {
    const at = t + s * 0.13
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    const f0 = rnd(150, 190) * pitch
    o.frequency.setValueAtTime(f0, at)
    o.frequency.linearRampToValueAtTime(f0 * (s === syll - 1 ? 1.25 : 0.9), at + 0.11)
    const g = ctx.createGain()
    env(g, at, 0.015, 0.12, 0.11)
    const f1 = filter('bandpass', rnd(500, 750), 6)
    const f2 = filter('bandpass', rnd(1100, 1500), 8)
    const sum = ctx.createGain()
    o.connect(f1).connect(sum)
    o.connect(f2).connect(sum)
    sum.connect(g).connect(out(1, { wet: 0.1 }))
    o.start(at)
    o.stop(at + 0.2)
  }
}
// wooden chest creak + latch + magic shimmer + reward arpeggio
export function crateOpen(ranked = false) {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'highpass', freq: 2500, dur: 0.02, gain: 0.12 }) // latch click
  tone({ t, type: 'square', freq: 900, dur: 0.02, gain: 0.04, wet: 0 })
  // creak: a slow sawtooth through a narrow resonant filter with wobble
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(rnd(48, 60), t + 0.04)
  o.frequency.linearRampToValueAtTime(rnd(70, 90), t + 0.5)
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 23
  const lfoG = ctx.createGain()
  lfoG.gain.value = 10
  lfo.connect(lfoG).connect(o.frequency)
  const f = filter('bandpass', 700, 9)
  f.frequency.linearRampToValueAtTime(1100, t + 0.5)
  const g = ctx.createGain()
  env(g, t + 0.04, 0.05, 0.22, 0.45)
  o.connect(f).connect(g).connect(out(1, { wet: 0.15 }))
  o.start(t + 0.04)
  lfo.start(t + 0.04)
  o.stop(t + 0.6)
  lfo.stop(t + 0.6)
  tone({ t: t + 0.52, type: 'triangle', freq: 110, to: 70, dur: 0.15, gain: 0.25, wet: 0.1 }) // lid thunk
  // shimmer + arpeggio
  burst({ t: t + 0.45, type: 'highpass', freq: 6000, dur: 0.8, attack: 0.2, gain: 0.05, wet: 0.4 })
  const notes = ranked ? [440, 554, 659, 880, 1109, 1319] : [523, 659, 784, 1046, 1318]
  notes.forEach((fr, i) => {
    tone({ t: t + 0.5 + i * 0.07, type: 'triangle', freq: fr, dur: 0.4, gain: 0.07, wet: 0.35 })
    tone({ t: t + 0.5 + i * 0.07, type: 'sine', freq: fr * 2, dur: 0.3, gain: 0.025, wet: 0.35 })
  })
  if (ranked) {
    // deep magical swell
    const s = ctx.createOscillator()
    s.type = 'sine'
    s.frequency.setValueAtTime(55, t + 0.3)
    s.frequency.exponentialRampToValueAtTime(110, t + 1.4)
    const sg = ctx.createGain()
    env(sg, t + 0.3, 0.3, 0.2, 1)
    s.connect(sg).connect(out(1, { wet: 0.4 }))
    s.start(t + 0.3)
    s.stop(t + 1.8)
  }
}
export function reward() {
  if (!ready()) return
  const t = now()
  ;[784, 988, 1175, 1568].forEach((f, i) => tone({ t: t + i * 0.09, type: 'triangle', freq: f, dur: 0.35, gain: 0.08, wet: 0.35 }))
  coins(3)
}
export function levelUp() {
  if (!ready()) return
  const t = now()
  ;[523, 659, 784, 1046].forEach((f, i) => {
    tone({ t: t + i * 0.1, type: 'square', freq: f, dur: 0.18, gain: 0.03, wet: 0.2 })
    tone({ t: t + i * 0.1, type: 'triangle', freq: f, dur: 0.3, gain: 0.07, wet: 0.3 })
  })
}
// wind rushing past while falling (k: 0..1 speed), and the drop transition
let fallNode = null
export function fallWind(k) {
  if (!ready()) return
  if (!fallNode) {
    const src = noise(pinkBuf)
    const f = filter('bandpass', 400, 0.6)
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f).connect(g).connect(sfxBus)
    src.start()
    fallNode = { src, f, g }
  }
  const t = now()
  fallNode.g.gain.setTargetAtTime(k * 0.35, t, 0.08)
  fallNode.f.frequency.setTargetAtTime(300 + k * 1400, t, 0.1)
}
export function whoosh() {
  if (!ready()) return
  burst({ type: 'bandpass', freq: 300, sweepTo: 2400, q: 0.7, dur: 0.6, attack: 0.25, gain: 0.25, buf: pinkBuf, wet: 0.3 })
  tone({ type: 'sine', freq: 70, to: 40, dur: 0.8, gain: 0.2, wet: 0.2 })
}

// --- Ambience ---------------------------------------------------------------------------------------
let ambienceStarted = false
let windGain = null
let birdsTimer = null
let isNight = false
function startAmbience() {
  ambienceStarted = true
  // high-altitude wind: brown noise, slowly breathing
  const src = noise(brownBuf, 1)
  const f = filter('lowpass', 420, 0.4)
  windGain = ctx.createGain()
  windGain.gain.value = 0.12
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.07
  const lg = ctx.createGain()
  lg.gain.value = 0.06
  lfo.connect(lg).connect(windGain.gain)
  const lfo2 = ctx.createOscillator()
  lfo2.frequency.value = 0.13
  const lg2 = ctx.createGain()
  lg2.gain.value = 160
  lfo2.connect(lg2).connect(f.frequency)
  src.connect(f).connect(windGain).connect(ambBus)
  src.start()
  lfo.start()
  lfo2.start()
  // leaves rustling in gusts
  const leaves = noise(pinkBuf)
  const lf = filter('bandpass', 2600, 0.5)
  const lgn = ctx.createGain()
  lgn.gain.value = 0.0
  const gust = ctx.createOscillator()
  gust.frequency.value = 0.11
  const gg = ctx.createGain()
  gg.gain.value = 0.025
  gust.connect(gg).connect(lgn.gain)
  leaves.connect(lf).connect(lgn).connect(ambBus)
  leaves.start()
  gust.start()
  scheduleCritters()
}
// birds in the day (two-note chirps and trills), crickets at night
function scheduleCritters() {
  const next = () => {
    birdsTimer = setTimeout(next, isNight ? rnd(300, 900) : rnd(1500, 5000))
    if (!ready() || lobbyAmb < 0.5) return
    const pan = rnd(-0.8, 0.8)
    const t = now()
    if (isNight) {
      const f = rnd(4200, 4800)
      for (let i = 0; i < 3; i++) tone({ t: t + i * 0.06, type: 'sine', freq: f, dur: 0.03, gain: 0.012, wet: 0.2, pan })
      return
    }
    const kind = Math.random()
    const base = rnd(2400, 3800)
    if (kind < 0.45) {
      tone({ t, type: 'sine', freq: base, to: base * 1.3, dur: 0.08, gain: 0.03, wet: 0.35, pan })
      tone({ t: t + 0.12, type: 'sine', freq: base * 1.2, to: base * 0.9, dur: 0.1, gain: 0.03, wet: 0.35, pan })
    } else if (kind < 0.8) {
      const n = 4 + Math.floor(Math.random() * 5)
      for (let i = 0; i < n; i++) tone({ t: t + i * 0.055, type: 'sine', freq: base * (1 + (i % 2) * 0.12), dur: 0.04, gain: 0.022, wet: 0.35, pan })
    } else {
      tone({ t, type: 'sine', freq: base * 0.8, to: base * 1.5, dur: 0.22, gain: 0.025, wet: 0.4, pan })
    }
  }
  next()
}
export function setNight(n) {
  isNight = n
}
// The lobby's sky-island ambience (wind, leaves, birds) fades out in the arena.
let lobbyAmb = 1
export function setLobbyAmbience(k) {
  lobbyAmb = k
  if (windGain && ready()) windGain.gain.setTargetAtTime(0.12 * Math.max(0.15, k), now(), 0.6)
}

// --- Arena: biome ambience beds -------------------------------------------------------------------
// One bed per biome, crossfaded as you walk between them. Each bed also schedules its
// own random details (ice creaks, lava blorps, crickets, frogs and owls, chimes) while on.
const beds = {}
let bedName = null
function bed(name) {
  if (beds[name]) return beds[name]
  const g = ctx.createGain()
  g.gain.value = 0
  g.connect(ambBus)
  const B = { g, on: false, name }
  beds[name] = B
  const loopNoise = (buf, type, freq, q, gain, rate = 1) => {
    const s = noise(buf, rate)
    const f = filter(type, freq, q)
    const sg = ctx.createGain()
    sg.gain.value = gain
    s.connect(f).connect(sg).connect(g)
    s.start()
    return { f, sg }
  }
  const lfo = (param, freq, depth) => {
    const o = ctx.createOscillator()
    o.frequency.value = freq
    const og = ctx.createGain()
    og.gain.value = depth
    o.connect(og).connect(param)
    o.start()
  }
  const details = (fn, min, max) => {
    const tick = () => {
      setTimeout(tick, rnd(min, max))
      if (ready() && B.on) fn(now())
    }
    tick()
  }
  if (name === 'frost') {
    const howl = loopNoise(pinkBuf, 'bandpass', 520, 5, 0.55)
    lfo(howl.f.frequency, 0.06, 260)
    lfo(howl.sg.gain, 0.11, 0.25)
    const low = loopNoise(brownBuf, 'lowpass', 300, 0.5, 0.35)
    lfo(low.sg.gain, 0.08, 0.15)
    details((t) => {
      if (Math.random() < 0.5) {
        // ice creaking under the cold
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(rnd(60, 90), t)
        o.frequency.linearRampToValueAtTime(rnd(110, 160), t + 0.4)
        const f = filter('bandpass', rnd(900, 1500), 12)
        const cg = ctx.createGain()
        env(cg, t, 0.05, 0.05, 0.4)
        o.connect(f).connect(cg).connect(g)
        o.start(t)
        o.stop(t + 0.5)
      } else for (let i = 0; i < 3; i++) tone({ t: t + i * rnd(0.05, 0.12), type: 'sine', freq: rnd(3500, 5200), dur: 0.25, gain: 0.012, wet: 0.5, pan: rnd(-0.7, 0.7) })
    }, 2500, 7000)
  } else if (name === 'fire') {
    const rum = loopNoise(brownBuf, 'lowpass', 140, 0.7, 0.75)
    lfo(rum.sg.gain, 0.13, 0.2)
    const roar = loopNoise(pinkBuf, 'bandpass', 320, 0.8, 0.12)
    lfo(roar.f.frequency, 0.05, 90)
    details((t) => {
      // a distant deep blorp and a spray of crackles
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(rnd(45, 70), t)
      o.frequency.exponentialRampToValueAtTime(rnd(90, 130), t + 0.18)
      const og = ctx.createGain()
      env(og, t, 0.04, 0.12, 0.2)
      o.connect(og).connect(g)
      o.start(t)
      o.stop(t + 0.3)
      for (let i = 0; i < 5; i++) burst({ t: t + 0.1 + Math.random() * 0.4, type: 'bandpass', freq: rnd(1500, 5000), q: 3, dur: 0.012, gain: rnd(0.02, 0.06), pan: rnd(-0.8, 0.8) })
    }, 1200, 3500)
  } else if (name === 'summer') {
    const breeze = loopNoise(pinkBuf, 'bandpass', 1800, 0.5, 0.08)
    lfo(breeze.sg.gain, 0.1, 0.05)
    details((t) => {
      const pan = rnd(-0.8, 0.8)
      const r = Math.random()
      if (r < 0.7) {
        // crickets
        const f = rnd(4200, 4900)
        const n = 3 + Math.floor(Math.random() * 3)
        for (let i = 0; i < n; i++) tone({ t: t + i * 0.055, type: 'sine', freq: f, dur: 0.03, gain: 0.014, wet: 0.2, pan })
      } else if (r < 0.85) {
        // a frog: a buzzy croak through a formant
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.setValueAtTime(rnd(90, 120), t)
        o.frequency.linearRampToValueAtTime(rnd(70, 85), t + 0.16)
        const f = filter('bandpass', rnd(500, 700), 5)
        const og = ctx.createGain()
        env(og, t, 0.02, 0.06, 0.15)
        o.connect(f).connect(og).connect(out(1, { pan, bus: ambBus, wet: 0.2 }))
        o.start(t)
        o.stop(t + 0.2)
      } else {
        // an owl, far off
        tone({ t, type: 'sine', freq: 392, to: 370, dur: 0.28, gain: 0.03, wet: 0.5, pan, attack: 0.05 })
        tone({ t: t + 0.42, type: 'sine', freq: 370, to: 330, dur: 0.5, gain: 0.03, wet: 0.5, pan, attack: 0.06 })
      }
    }, 250, 900)
  } else if (name === 'spring') {
    for (const [fr, a] of [[55, 0.07], [82.4, 0.04], [55.4, 0.06]]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = fr
      const og = ctx.createGain()
      og.gain.value = a
      o.connect(og).connect(g)
      o.start()
    }
    const air = loopNoise(pinkBuf, 'bandpass', 2400, 2, 0.04)
    lfo(air.sg.gain, 0.07, 0.03)
    details((t) => {
      // slow glassy chimes from a pentatonic set
      const set = [659, 784, 880, 1047, 1175, 1319]
      const n = 1 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) {
        const f = set[Math.floor(Math.random() * set.length)]
        const at = t + i * rnd(0.15, 0.35)
        tone({ t: at, type: 'sine', freq: f, dur: 1.4, gain: 0.025, wet: 0.7, pan: rnd(-0.6, 0.6), attack: 0.01 })
        tone({ t: at, type: 'sine', freq: f * 2.01, dur: 0.8, gain: 0.008, wet: 0.7 })
      }
    }, 2500, 6000)
  } else if (name === 'plaza') {
    const low = loopNoise(brownBuf, 'lowpass', 350, 0.5, 0.12)
    lfo(low.sg.gain, 0.07, 0.05)
  }
  return B
}
// name: 'frost' | 'fire' | 'summer' | 'spring' | 'plaza' | null (the lobby)
let pendingBed
export function setBiome(name) {
  if (!ready()) {
    pendingBed = name
    return
  }
  pendingBed = undefined
  if (name === bedName) return
  const t = now()
  const old = bedName && beds[bedName]
  if (old) {
    old.g.gain.setTargetAtTime(0, t, 0.8)
    setTimeout(() => {
      if (bedName !== old.name) old.on = false
    }, 3000)
  }
  bedName = name
  if (name) {
    const B = bed(name)
    B.on = true
    B.g.gain.setTargetAtTime(name === 'plaza' ? 0.6 : 1, t, 0.8)
  }
}
// a bed chosen before the first gesture starts once audio is unlocked
export function flushBiome() {
  if (pendingBed !== undefined && ready()) setBiome(pendingBed)
}

// --- Arena one-shots --------------------------------------------------------------------------------
export function lavaPop(k = 1) {
  if (!ready()) return
  const t = now()
  const o = ctx.createOscillator()
  o.type = 'sine'
  const f0 = rnd(90, 170)
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.07)
  const g = ctx.createGain()
  env(g, t, 0.01, 0.22 * k, 0.08)
  o.connect(g).connect(out(1, { wet: 0.1, pan: rnd(-0.5, 0.5) }))
  o.start(t)
  o.stop(t + 0.12)
  burst({ t: t + 0.06, type: 'bandpass', freq: rnd(1200, 2600), q: 1.5, dur: 0.03, gain: 0.12 * k })
  for (let i = 0; i < 3; i++) burst({ t: t + 0.08 + Math.random() * 0.25, type: 'highpass', freq: 4000, dur: 0.008, gain: 0.05 * k })
}
export function splash(big = 1) {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'bandpass', freq: 2200, sweepTo: 500, q: 0.7, dur: 0.35 * big, gain: 0.28 * big, buf: pinkBuf, wet: 0.2, attack: 0.005 })
  burst({ t, type: 'lowpass', freq: 400, dur: 0.15, gain: 0.25 * big, buf: brownBuf })
  for (let i = 0; i < 6 * big; i++) {
    const f = rnd(700, 2200)
    tone({ t: t + 0.05 + Math.random() * 0.4, type: 'sine', freq: f, to: f * 1.6, dur: 0.05, gain: 0.03, wet: 0.2, pan: rnd(-0.5, 0.5) })
  }
}
export function swim() {
  if (!ready()) return
  burst({ type: 'bandpass', freq: rnd(700, 1000), sweepTo: 350, q: 0.8, dur: 0.25, gain: 0.1, buf: pinkBuf, attack: 0.04, wet: 0.15 })
}
export function sizzle() {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'highpass', freq: 3500, dur: 0.55, attack: 0.01, gain: 0.18, wet: 0.1 })
  for (let i = 0; i < 6; i++) burst({ t: t + Math.random() * 0.4, type: 'bandpass', freq: rnd(2000, 5000), q: 3, dur: 0.01, gain: 0.08 })
}
export function hurt() {
  if (!ready()) return
  const t = now()
  // a short grunt: buzzy source through two formants, pitch falling
  const o = ctx.createOscillator()
  o.type = 'sawtooth'
  o.frequency.setValueAtTime(rnd(190, 230), t)
  o.frequency.exponentialRampToValueAtTime(rnd(110, 130), t + 0.14)
  const g = ctx.createGain()
  env(g, t, 0.01, 0.16, 0.14)
  const f1 = filter('bandpass', 650, 5)
  const f2 = filter('bandpass', 1100, 6)
  const sum = ctx.createGain()
  o.connect(f1).connect(sum)
  o.connect(f2).connect(sum)
  sum.connect(g).connect(out(1, { wet: 0.05 }))
  o.start(t)
  o.stop(t + 0.2)
  burst({ t, type: 'lowpass', freq: 300, dur: 0.08, gain: 0.3, buf: brownBuf })
}
export function death() {
  if (!ready()) return
  const t = now()
  burst({ t, type: 'bandpass', freq: 1800, sweepTo: 120, q: 0.8, dur: 1.4, attack: 0.05, gain: 0.25, buf: pinkBuf, wet: 0.4 })
  tone({ t, type: 'sine', freq: 140, to: 40, dur: 1.2, gain: 0.3, wet: 0.3 })
  ;[392, 330, 262, 196].forEach((f, i) => tone({ t: t + 0.15 + i * 0.16, type: 'triangle', freq: f, dur: 0.4, gain: 0.06, wet: 0.5 }))
}
// touchdown on the arena plaza: a deep thump, a dust whoosh and a bright welcome chord
export function arenaLand() {
  if (!ready()) return
  const t = now()
  tone({ t, type: 'sine', freq: 90, to: 32, dur: 0.6, gain: 0.45, wet: 0.2 })
  burst({ t, type: 'lowpass', freq: 700, sweepTo: 200, dur: 0.5, gain: 0.35, buf: brownBuf, wet: 0.3 })
  burst({ t: t + 0.02, type: 'bandpass', freq: 1200, sweepTo: 3000, q: 0.6, dur: 0.6, attack: 0.08, gain: 0.08, buf: pinkBuf, wet: 0.4 })
  ;[523, 659, 784, 1046].forEach((f, i) => {
    tone({ t: t + 0.18 + i * 0.05, type: 'triangle', freq: f, dur: 0.9, gain: 0.05, wet: 0.5 })
    tone({ t: t + 0.18 + i * 0.05, type: 'sine', freq: f * 2, dur: 0.6, gain: 0.015, wet: 0.5 })
  })
}
// a short motif when you step into a biome
export function biomeChime(name) {
  if (!ready()) return
  const t = now()
  const motifs = {
    frost: [[1319, 'sine'], [1568, 'sine'], [1976, 'sine']],
    fire: [[196, 'triangle'], [233, 'triangle'], [294, 'triangle']],
    summer: [[523, 'triangle'], [659, 'triangle'], [784, 'triangle']],
    spring: [[740, 'sine'], [988, 'sine'], [1109, 'sine']],
    plaza: [[440, 'triangle'], [554, 'triangle'], [659, 'triangle']],
  }
  const m = motifs[name]
  if (!m) return
  m.forEach(([f, type], i) => tone({ t: t + i * 0.09, type, freq: f, dur: 0.5, gain: 0.05, wet: 0.45 }))
}

// --- Positional loops ---------------------------------------------------------------------------------
// kind: 'fire' (crackle + roar), 'beam' (soft shimmering hum), 'shaft' (deep wind)
export function addLoop(kind, x, y, z, range = 12, level = 1) {
  const L = { kind, x, y, z, range, level, gain: null, k: 0 }
  loops.push(L)
  return L
}
function buildLoop(L) {
  const g = ctx.createGain()
  g.gain.value = 0
  const pan = ctx.createStereoPanner()
  g.connect(pan).connect(ambBus)
  L.gain = g
  L.pan = pan
  if (L.kind === 'fire') {
    const roar = noise(brownBuf)
    const rf = filter('lowpass', 500)
    const rg = ctx.createGain()
    rg.gain.value = 0.35
    roar.connect(rf).connect(rg).connect(g)
    roar.start()
    // crackles: random clicks scheduled in short batches
    const crack = () => {
      if (!ready() || L.k < 0.02) return setTimeout(crack, 500)
      const t = now()
      const n = 3 + Math.floor(Math.random() * 6)
      for (let i = 0; i < n; i++) {
        const at = t + Math.random() * 0.5
        const src = noise(noiseBuf)
        const f = filter('bandpass', rnd(1500, 5500), rnd(1, 4))
        const cg = ctx.createGain()
        env(cg, at, 0.001, rnd(0.08, 0.45), rnd(0.008, 0.03))
        src.connect(f).connect(cg).connect(g)
        src.start(at, Math.random())
        src.stop(at + 0.06)
      }
      setTimeout(crack, 450)
    }
    crack()
  } else if (L.kind === 'beam') {
    for (const [f, a] of [[220, 0.05], [330, 0.035], [440, 0.025]]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f * L.level
      const og = ctx.createGain()
      og.gain.value = a
      const trem = ctx.createOscillator()
      trem.frequency.value = rnd(0.3, 0.8)
      const tg = ctx.createGain()
      tg.gain.value = a * 0.6
      trem.connect(tg).connect(og.gain)
      o.connect(og).connect(g)
      o.start()
      trem.start()
    }
    const sh = noise(noiseBuf)
    const sf = filter('highpass', 7000)
    const sg = ctx.createGain()
    sg.gain.value = 0.02
    sh.connect(sf).connect(sg).connect(g)
    sh.start()
  } else if (L.kind === 'lava') {
    // a thick, slow rumble with bubbles that swell and blorp
    const src = noise(brownBuf, 0.7)
    const f = filter('lowpass', 240, 0.8)
    const lg = ctx.createGain()
    lg.gain.value = 0.55 * L.level
    src.connect(f).connect(lg).connect(g)
    src.start()
    const bubble = () => {
      setTimeout(bubble, rnd(120, 420))
      if (!ready() || L.k < 0.02) return
      const t = now()
      const o = ctx.createOscillator()
      o.type = 'sine'
      const f0 = rnd(70, 150)
      o.frequency.setValueAtTime(f0, t)
      o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.8, 2.8), t + 0.09)
      const bg = ctx.createGain()
      env(bg, t, 0.02, rnd(0.08, 0.2), 0.09)
      o.connect(bg).connect(g)
      o.start(t)
      o.stop(t + 0.15)
      if (Math.random() < 0.35) {
        const n = noise(noiseBuf)
        const nf = filter('bandpass', rnd(700, 1500), 2)
        const ng = ctx.createGain()
        env(ng, t + 0.08, 0.002, 0.12, 0.03)
        n.connect(nf).connect(ng).connect(g)
        n.start(t + 0.08, Math.random())
        n.stop(t + 0.14)
      }
    }
    bubble()
  } else if (L.kind === 'river') {
    // a broad wash plus babbling: short rising droplet tones
    const src = noise(pinkBuf, 0.9)
    const f = filter('bandpass', 750, 0.5)
    const sg = ctx.createGain()
    sg.gain.value = 0.32
    const lfo = ctx.createOscillator()
    lfo.frequency.value = rnd(0.15, 0.3)
    const lfg = ctx.createGain()
    lfg.gain.value = 0.08
    lfo.connect(lfg).connect(sg.gain)
    src.connect(f).connect(sg).connect(g)
    const hi = noise(noiseBuf)
    const hf = filter('highpass', 3200)
    const hg = ctx.createGain()
    hg.gain.value = 0.035
    hi.connect(hf).connect(hg).connect(g)
    src.start()
    hi.start()
    lfo.start()
    const babble = () => {
      setTimeout(babble, rnd(60, 220))
      if (!ready() || L.k < 0.02) return
      const t = now()
      const o = ctx.createOscillator()
      o.type = 'sine'
      const f0 = rnd(500, 1300)
      o.frequency.setValueAtTime(f0, t)
      o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.3, 1.9), t + 0.04)
      const bg = ctx.createGain()
      env(bg, t, 0.004, rnd(0.015, 0.045), 0.04)
      o.connect(bg).connect(g)
      o.start(t)
      o.stop(t + 0.07)
    }
    babble()
  } else if (L.kind === 'waterfall') {
    const a = noise(noiseBuf, 0.8)
    const af = filter('lowpass', 2600, 0.4)
    const ag = ctx.createGain()
    ag.gain.value = 0.35
    const b = noise(brownBuf)
    const bf = filter('lowpass', 500)
    const bg = ctx.createGain()
    bg.gain.value = 0.6
    a.connect(af).connect(ag).connect(g)
    b.connect(bf).connect(bg).connect(g)
    a.start()
    b.start()
  } else if (L.kind === 'chorus') {
    // an eerie, slowly beating drone with a glassy shimmer
    for (const [fr, a] of [[110, 0.05], [110.7, 0.05], [165, 0.025], [329.6, 0.012]]) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = fr
      const og = ctx.createGain()
      og.gain.value = a
      o.connect(og).connect(g)
      o.start()
    }
    const sh = noise(noiseBuf)
    const sf = filter('bandpass', 6200, 3)
    const sg = ctx.createGain()
    sg.gain.value = 0.02
    sh.connect(sf).connect(sg).connect(g)
    sh.start()
  } else if (L.kind === 'icewind') {
    // wind whistling through the ice spikes
    const src = noise(pinkBuf)
    const f = filter('bandpass', 900, 7)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.09
    const lg = ctx.createGain()
    lg.gain.value = 380
    lfo.connect(lg).connect(f.frequency)
    const sg = ctx.createGain()
    sg.gain.value = 0.5
    src.connect(f).connect(sg).connect(g)
    src.start()
    lfo.start()
  } else if (L.kind === 'shaft') {
    const src = noise(pinkBuf, 0.6)
    const f = filter('bandpass', 260, 1.2)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.2
    const lg = ctx.createGain()
    lg.gain.value = 90
    lfo.connect(lg).connect(f.frequency)
    const sg = ctx.createGain()
    sg.gain.value = 0.5
    src.connect(f).connect(sg).connect(g)
    src.start()
    lfo.start()
  }
}

// Listener: camera position + yaw; fades loops with distance and pans them.
export function updateListener(x, y, z, yaw) {
  if (!ready()) return
  const t = now()
  for (const L of loops) {
    if (!L.gain) buildLoop(L)
    const dx = L.x - x
    const dy = L.y - y
    const dz = L.z - z
    const d = Math.hypot(dx, dy, dz)
    const k = Math.max(0, 1 - d / L.range)
    L.k = k
    L.gain.gain.setTargetAtTime(k * k, t, 0.15)
    // right vector of the camera = (cos yaw, -sin yaw)
    const p = d > 0.01 ? (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d : 0
    L.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, p)), t, 0.1)
  }
}
