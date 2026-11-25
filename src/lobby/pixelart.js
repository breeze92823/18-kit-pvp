// Hand-authored pixel art for items (16x16) and HUD icons (9x9), as strings.
// One char per pixel, '.' = transparent; the palette maps chars to colours.
// Used for the 3D extruded items (models.js), hotbar/kit icons and the HUD bars.

export const ART = {
  sword: {
    pal: { o: '#262626', w: '#f2f2f2', g: '#c6c6c6', d: '#8a8a8a', c: '#5a5a5a', C: '#7c7c7c', h: '#6b4423', b: '#3f2612' },
    rows: [
      '.............ooo',
      '............owwo',
      '...........owwgo',
      '..........owwgo.',
      '.........owwgo..',
      '........owwgo...',
      '.......owwgo....',
      '......owwgo.....',
      '.oo..owwgo......',
      '.oCo.owgo.......',
      '..oCowgo........',
      '...oCCo.........',
      '...bhoCo........',
      '..bhb.oCo.......',
      '.bhb...oo.......',
      'obo.............',
    ],
  },
  bow: {
    pal: { o: '#2b1a0c', w: '#8a5a2b', l: '#b07a3e', s: '#e8e8e8' },
    rows: [
      '.........oooo...',
      '.......oowlwo...',
      '......owlo.s....',
      '.....owlo.s.....',
      '....owo..s......',
      '....oo..s.......',
      '...owo.s........',
      '...owos.........',
      '...ows..........',
      '...os...........',
      '..ows...........',
      '..olo...........',
      '.olwo...........',
      '.owo............',
      'oo..............',
      '................',
    ],
  },
  apple: {
    pal: { o: '#3a1a08', r: '#f0c020', R: '#c99010', h: '#fff4a0', s: '#5a3a1a', l: '#3f9a2a' },
    rows: [
      '................',
      '.......s........',
      '......osll......',
      '...oooso.ll.....',
      '..orrrsrro......',
      '.orhhrrrrro.....',
      '.orhrrrrrro.....',
      'orhrrrrrrrRo....',
      'orrrrrrrrrRo....',
      'orrrrrrrrRRo....',
      'orrrrrrrRRRo....',
      '.orrrrrRRRo.....',
      '.oRRRRRRRRo.....',
      '..oRRoRRRo......',
      '...ooo.oo.......',
      '................',
    ],
  },
  potion: {
    pal: { o: '#1e1e2a', g: '#cfe6ff', p: '#e0507a', P: '#b0305a', h: '#ffd0e0', c: '#8a5a2b' },
    rows: [
      '................',
      '......oooo......',
      '......occo......',
      '.......oo.......',
      '......oggo......',
      '......oggo......',
      '.....oggggo.....',
      '....oggggggo....',
      '...ophppppppo...',
      '...ohpppppppo...',
      '...oppppppPPo...',
      '...opppppPPPo...',
      '...oPpppPPPPo...',
      '....oPPPPPPo....',
      '.....oooooo.....',
      '................',
    ],
  },
  shield: {
    pal: { o: '#1e1e1e', w: '#8a6a3e', W: '#a8844e', i: '#bdbdbd', I: '#8a8a8a', b: '#2f5fb8' },
    rows: [
      '................',
      '..oooooooooooo..',
      '..oiiiiiiiiiio..',
      '..oiWWWbbWWWIo..',
      '..oiWWWbbWWWIo..',
      '..oiwwwbbwwwIo..',
      '..oibbbbbbbbIo..',
      '..oibbbbbbbbIo..',
      '..oiwwwbbwwwIo..',
      '..oiWWWbbWWWIo..',
      '...oiWWbbWWIo...',
      '...oiwwbbwwIo...',
      '....oiWbbWIo....',
      '.....oIIIIo.....',
      '......oooo......',
      '................',
    ],
  },
  orb: {
    pal: { o: '#0c2a2a', d: '#0f5a5a', m: '#1f9a8a', l: '#5ae0c8', w: '#d8fff6' },
    rows: [
      '................',
      '................',
      '.....oooooo.....',
      '....oddmmddo....',
      '...odmmllmmdo...',
      '..odmlwwllmmdo..',
      '..odmlwllllmdo..',
      '..odmllllllmdo..',
      '..odmmllllmmdo..',
      '..oddmmmmmmddo..',
      '...oddmmmmddo...',
      '....oddddddo....',
      '.....oooooo.....',
      '................',
      '................',
      '................',
    ],
  },
  steak: {
    pal: { o: '#2a1206', m: '#9a4a24', M: '#7a3418', f: '#e8d0b0', b: '#f2ece0' },
    rows: [
      '................',
      '................',
      '.......oooo.....',
      '.....oommmmo....',
      '....ommmMmmmo...',
      '...omMmmmmMmmo..',
      '...ommmmMmmmmo..',
      '...omMmmmmmMmo..',
      '...offmmmMmmmo..',
      '....offfmmmmo...',
      '....ob.offfo....',
      '...obbo.ooo.....',
      '..obbo..........',
      '..ooo...........',
      '................',
      '................',
    ],
  },
  axe: {
    pal: { o: '#262626', w: '#f2f2f2', g: '#c6c6c6', d: '#8a8a8a', h: '#6b4423', b: '#3f2612' },
    rows: [
      '................',
      '.......ooo......',
      '......owwgo.....',
      '.....owwggo.....',
      '.....owgggdo....',
      '......oggdbo....',
      '.......odbho....',
      '........obho....',
      '.......obho.....',
      '......obho......',
      '.....obho.......',
      '....obho........',
      '...obho.........',
      '..obho..........',
      '..obo...........',
      '..oo............',
    ],
  },
  flame: {
    pal: { o: '#5a1a00', r: '#e0401a', y: '#ffd23a', w: '#fff6c8', R: '#a02808' },
    rows: [
      '........o.......',
      '.......oro......',
      '......orro......',
      '.....orryro.....',
      '....orryyro.o...',
      '...orryyyrooro..',
      '...oryywyyrrro..',
      '..orryywwyyrro..',
      '..oryywwwyyro...',
      '..oryywwwwyro...',
      '..orryywwyyro...',
      '...oRryyyyrro...',
      '...oRRrrrrRo....',
      '....ooRRRRoo....',
      '......oooo......',
      '................',
    ],
  },
  snow: {
    pal: { o: '#2a4a7a', w: '#ffffff', b: '#cfe6ff', B: '#9cc4f6' },
    rows: [
      '................',
      '.......o........',
      '...o..owo..o....',
      '....owwwwwo.....',
      '....owbbbwo.....',
      '..oowbwwwbwoo...',
      '.owwwbwBwbwwwo..',
      '..oowbwwwbwoo...',
      '....owbbbwo.....',
      '....owwwwwo.....',
      '...o..owo..o....',
      '.......o........',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  star: {
    pal: { o: '#5a3a00', y: '#ffd23a', w: '#fff6c8', Y: '#e0a010' },
    rows: [
      '................',
      '.......oo.......',
      '......oyyo......',
      '......oywo......',
      '.ooooooywoooooo.',
      '.oyyyyyywyyyyyo.',
      '..oYyyywwyyyYo..',
      '...oYyywwyyYo...',
      '....oyyyyyyo....',
      '...oyyyYYyyyo...',
      '...oyyYooYyyo...',
      '..oyYYo..oYYyo..',
      '..oYoo....ooYo..',
      '..oo........oo..',
      '................',
      '................',
    ],
  },
  heal: {
    pal: { o: '#3a0a0a', r: '#e83a3a', w: '#ffffff', R: '#b01c1c' },
    rows: [
      '................',
      '................',
      '.....oooooo.....',
      '.....owwwwo.....',
      '.....owrrwo.....',
      '..ooooworwoooo..',
      '..owwwwrrwwwwo..',
      '..owrrrrrrrrwo..',
      '..owrrrrrrrRwo..',
      '..owwwwrRwwwwo..',
      '..ooooowRwoooo..',
      '.....owRRwo.....',
      '.....owwwwo.....',
      '.....oooooo.....',
      '................',
      '................',
    ],
  },
  chest: {
    pal: { o: '#2a1a0a', w: '#a8783a', W: '#8a5e28', d: '#5a3a18', i: '#d8d8d8', I: '#8a8a8a' },
    rows: [
      '................',
      '................',
      '..oooooooooooo..',
      '..owwwwwwwwwwo..',
      '..oWWWWWWWWWWo..',
      '..owwwwwwwwwwo..',
      '..oddddiiddddo..',
      '..oooooIIooooo..',
      '..owwwwiiwwwwo..',
      '..oWWWWWWWWWWo..',
      '..owwwwwwwwwwo..',
      '..oWWWWWWWWWWo..',
      '..odddddddddddo.',
      '..oooooooooooo..',
      '................',
      '................',
    ],
  },
  // --- HUD icons (9x9) ---
  heart: {
    pal: { o: '#1a0000', r: '#e81c1c', R: '#a00c0c', w: '#ffb0b0' },
    rows: ['.oo...oo.', 'owwr.rrro', 'owrrrrrRo', 'orrrrrrRo', '.orrrrRo.', '..orrRo..', '...oRo...', '....o....', '.........'],
  },
  heart_empty: {
    pal: { o: '#1a0000', e: '#3a2a2a' },
    rows: ['.oo...oo.', 'oeeo.oeeo', 'oeeeeeeeo', 'oeeeeeeeo', '.oeeeeeo.', '..oeeeo..', '...oeo...', '....o....', '.........'],
  },
  armor: {
    pal: { o: '#1a1a1a', w: '#f0f0f0', g: '#c0c0c0', d: '#8a8a8a' },
    rows: ['.oo...oo.', 'owwoooggo', 'owwwgggdo', '.owwggdo.', '.owgggdo.', '.owgggdo.', '.ogggddo.', '.oooooooo', '.........'],
  },
  armor_empty: {
    pal: { o: '#1a1a1a', e: '#3a3a3a' },
    rows: ['.oo...oo.', 'oeeoooeeo', 'oeeeeeeeo', '.oeeeeeo.', '.oeeeeeo.', '.oeeeeeo.', '.oeeeeeo.', '.oooooooo', '.........'],
  },
  food: {
    pal: { o: '#2a1206', m: '#b85a2a', M: '#8a3a14', b: '#f2ece0', h: '#e08a5a' },
    rows: ['....ooo..', '...ommmo.', '..omhmmMo', '..ommmMMo', '..oMmMMo.', '.obooMo..', 'obbo.o...', '.oo......', '.........'],
  },
  food_empty: {
    pal: { o: '#2a1206', e: '#3a2a20' },
    rows: ['....ooo..', '...oeeeo.', '..oeeeeeo', '..oeeeeeo', '..oeeeeo.', '.oeooeo..', 'oeeo.o...', '.oo......', '.........'],
  },
  coin: {
    pal: { o: '#5a3a00', y: '#ffd23a', Y: '#e0a010', w: '#fff6c8' },
    rows: ['..ooooo..', '.oyyyyYo.', 'oywyyyyYo', 'oywyYyyYo', 'oyyyYyyYo', 'oyyyYyyYo', 'oyyyyyYYo', '.oYYYYYo.', '..ooooo..'],
  },
}

// Canvas of an art piece (each pixel `scale` px).
export function artCanvas(name, scale = 1) {
  const a = ART[name]
  const h = a.rows.length
  const w = a.rows[0].length
  const c = document.createElement('canvas')
  c.width = w * scale
  c.height = h * scale
  const ctx = c.getContext('2d')
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const ch = a.rows[y][x]
      if (ch === '.' || ch === ' ') continue
      ctx.fillStyle = a.pal[ch] ?? '#ff00ff'
      ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  return c
}

const urlCache = new Map()
export function artURL(name, scale = 4) {
  const k = `${name}@${scale}`
  if (!urlCache.has(k)) urlCache.set(k, artCanvas(name, scale).toDataURL())
  return urlCache.get(k)
}
