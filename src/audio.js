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
  master.gain.value = 0.9
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
export function swing() {
  if (!ready()) return
  burst({ type: 'bandpass', freq: rnd(2600, 3200), sweepTo: 500, q: 1.2, dur: 0.16, gain: 0.16, buf: pinkBuf, attack: 0.02, wet: 0.05 })
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
    if (!ready()) return
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

// --- Positional loops ---------------------------------------------------------------------------------
// kind: 'fire' (crackle + roar), 'beam' (soft shimmering hum), 'shaft' (deep wind)
export function addLoop(kind, x, y, z, range = 12, level = 1) {
  const L = { kind, x, y, z, range, level, gain: null }
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
      if (!ready()) return setTimeout(crack, 500)
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
    L.gain.gain.setTargetAtTime(k * k, t, 0.15)
    // right vector of the camera = (cos yaw, -sin yaw)
    const p = d > 0.01 ? (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d : 0
    L.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, p)), t, 0.1)
  }
}
