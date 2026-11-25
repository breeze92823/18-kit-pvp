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

// --- Kit icons (the Kits screen) ---------------------------------------------------------------
Object.assign(ART, {
  wand: {
    pal: { o: '#1e0f2a', s: '#6a3fa0', S: '#9a6ad0', g: '#e0b0ff', w: '#ffffff' },
    rows: [
      '.............oo.',
      '............owgo',
      '...........ogggo',
      '..........osggo.',
      '.........osSoo..',
      '........osSo....',
      '.......osSo.....',
      '......osSo......',
      '.....osSo.......',
      '....osSo........',
      '...osSo.........',
      '..osSo..........',
      '.osSo...........',
      'osSo............',
      'oso.............',
      '.o..............',
    ],
  },
  tnt: {
    pal: { o: '#3a0a0a', r: '#d8302a', R: '#a01a14', w: '#f2f2f2', k: '#1a1a1a' },
    rows: [
      '................',
      '.oooooooooooooo.',
      '.orRrRrRrRrRrRo.',
      '.orRrRrRrRrRrRo.',
      '.owwwwwwwwwwwwo.',
      '.owkkkwkwkwkkko.',
      '.owwkwwkkkwwkwo.',
      '.owwkwwkkkwwkwo.',
      '.owwkwwkwkwwkwo.',
      '.owwkwwkwkwwkwo.',
      '.owwwwwwwwwwwwo.',
      '.orRrRrRrRrRrRo.',
      '.orRrRrRrRrRrRo.',
      '.orRrRrRrRrRrRo.',
      '.oooooooooooooo.',
      '................',
    ],
  },
  feather: {
    pal: { o: '#3a3a3a', w: '#ffffff', g: '#cfd6dc', s: '#8a6a4a' },
    rows: [
      '...........oooo.',
      '.........oowwwgo',
      '........owwwwgo.',
      '.......owwwwgo..',
      '......owwwwgo...',
      '.....owwwwgo....',
      '....owwwwgo.....',
      '...owwwwgo......',
      '...owwwgo.......',
      '..owwwgo........',
      '..owwgo.........',
      '..owgo..........',
      '.osoo...........',
      '.so.............',
      'os..............',
      'o...............',
    ],
  },
  spring: {
    pal: { o: '#1a3a1a', g: '#5ad04a', G: '#2a8a2a', m: '#9a9aa0' },
    rows: [
      '................',
      '...mmmmmmmmmm...',
      '...oooooooooo...',
      '....oggggggo....',
      '...oGGGGGGGGo...',
      '....oggggggo....',
      '...oGGGGGGGGo...',
      '....oggggggo....',
      '...oGGGGGGGGo...',
      '....oggggggo....',
      '...oGGGGGGGGo...',
      '....oggggggo....',
      '...oooooooooo...',
      '...mmmmmmmmmm...',
      '................',
      '................',
    ],
  },
  hook: {
    pal: { o: '#1e1e1e', m: '#b8b8c0', M: '#7a7a84' },
    rows: [
      '......oooo......',
      '......omMo......',
      '......oooo......',
      '.......omo......',
      '.......omo......',
      '.......omo......',
      '..oo...omo...oo.',
      '.omo...omo..omo.',
      '.omo...omo..omo.',
      '.omMo..omo.oMmo.',
      '..omMooomooMmo..',
      '...ommMMMMmmo...',
      '....oooooooo....',
      '................',
      '................',
      '................',
    ],
  },
  pickaxe: {
    pal: { o: '#1e1e1e', i: '#7adce0', I: '#3aa0a8', h: '#6b4423', b: '#3f2612' },
    rows: [
      '...oooooooooo...',
      '..oiiiiiiiiIIo..',
      '.oiIIooooooIIIo.',
      '.oIo..ohbo..oIo.',
      '.oo...ohbo...oo.',
      '......ohbo......',
      '......ohbo......',
      '......ohbo......',
      '......ohbo......',
      '......ohbo......',
      '......ohbo......',
      '......ohbo......',
      '......ohbo......',
      '......ohbo......',
      '......oooo......',
      '................',
    ],
  },
  trident: {
    pal: { o: '#0a2a3a', c: '#3ad0d0', C: '#1a8a9a', w: '#c0fff8' },
    rows: [
      '..o....o....o...',
      '.owo..owo..owo..',
      '.oco..oco..oco..',
      '.oco..oco..oco..',
      '.occcccccccco...',
      '.ooooocCcoooo...',
      '......oCo.......',
      '......oCo.......',
      '......oCo.......',
      '......oCo.......',
      '......oCo.......',
      '......oCo.......',
      '......oCo.......',
      '......oCo.......',
      '......oCo.......',
      '......ooo.......',
    ],
  },
  mace: {
    pal: { o: '#1a1a1a', m: '#9a9aa8', M: '#5a5a68', s: '#e0e0e8', h: '#6b4423' },
    rows: [
      '.......o........',
      '....o.oso.o.....',
      '.....ommmo......',
      '..oooMmmmMooo...',
      '.osMmmmmmmMso...',
      '..oooMmmmMooo...',
      '.....oMMMo......',
      '....o.oho.o.....',
      '......oho.......',
      '......oho.......',
      '......oho.......',
      '......oho.......',
      '......oho.......',
      '......oho.......',
      '......oho.......',
      '......ooo.......',
    ],
  },
  clock: {
    pal: { o: '#3a2a00', y: '#ffd23a', Y: '#c89a10', w: '#f8f4e0', k: '#222222' },
    rows: [
      '.....oooooo.....',
      '...ooyyyyyyoo...',
      '..oyywwwwwwyyo..',
      '.oywwwwkwwwwwyo.',
      'oywwwwwkwwwwwwyo',
      'oywwwwwkwwwwwwyo',
      'oywwwwwkwwwwwwyo',
      'oyYwwwwkkkkwwwyo',
      'oywwwwwwwwwwwwyo',
      'oywwwwwwwwwwwwyo',
      '.oywwwwwwwwwwyo.',
      '.oyywwwwwwwwyyo.',
      '..ooyyyyyyyyoo..',
      '....oooooooo....',
      '................',
      '................',
    ],
  },
  lock: {
    pal: { o: '#2a2a2a', s: '#b8b8b8', S: '#e8e8e8', w: '#f4f4f4', g: '#c8c8c8', k: '#7a4ab0', K: '#3a2a50' },
    rows: [
      '.....oooooo.....',
      '....osSSSSso....',
      '...osooooooso...',
      '...oso....oso...',
      '...oso....oso...',
      '..oooooooooooo..',
      '..okkkkkkkkkko..',
      '..owwwwwwwwwwo..',
      '..owwwwKKwwwwo..',
      '..owwwwKKwwwwo..',
      '..owwwwKKwwwwo..',
      '..owwwwkkwwwwo..',
      '..oggggggggggo..',
      '..oooooooooooo..',
      '................',
      '................',
    ],
  },
})
// Recoloured copies of a base piece.
const variant = (name, base, pal) => (ART[name] = { rows: ART[base].rows, pal: { ...ART[base].pal, ...pal } })
variant('wand_ice', 'wand', { o: '#0a2a4a', s: '#3a9ad0', S: '#8ad8ff', g: '#e8fbff' })
variant('wand_nature', 'wand', { o: '#12300a', s: '#3a7a2a', S: '#6ac04a', g: '#c8ff8a' })
variant('wand_dark', 'wand', { o: '#0a060c', s: '#2a2030', S: '#4a3a5a', g: '#ff3a5a', w: '#ffb0c0' })
variant('wand_fire', 'wand', { o: '#3a1004', s: '#a03a10', S: '#e07a20', g: '#ffe04a' })
variant('wand_gold', 'wand', { o: '#3a2a00', s: '#c89614', S: '#f0c832', g: '#fff6c8' })
variant('sword_gold', 'sword', { w: '#fff6c8', g: '#f0c832', d: '#c89614' })
variant('sword_dark', 'sword', { w: '#a89ac0', g: '#5a4a70', d: '#2a2030', h: '#7a1a2a', b: '#4a0a14' })
variant('sword_red', 'sword', { w: '#ffc0b0', g: '#e0402a', d: '#8a1a10' })
variant('sword_ice', 'sword', { w: '#e8fbff', g: '#8ad8ff', d: '#3a9ad0' })
variant('sword_jade', 'sword', { w: '#c8ffd8', g: '#3ac06a', d: '#1a7a3a' })
variant('axe_dark', 'axe', { w: '#8a8aa0', g: '#4a4a5a', d: '#2a2a34', h: '#2a1a10' })
variant('axe_gold', 'axe', { w: '#fff6c8', g: '#f0c832', d: '#c89614' })
variant('orb_ghost', 'orb', { d: '#7a8a9a', m: '#c8d8e8', l: '#eef6ff', w: '#ffffff', o: '#3a4a5a' })
variant('orb_void', 'orb', { d: '#2a0a4a', m: '#5a2a9a', l: '#9a5ae0', w: '#e0c0ff', o: '#12041e' })
variant('orb_fire', 'orb', { d: '#7a1a04', m: '#d84a1a', l: '#ffa03a', w: '#fff0a0', o: '#2a0800' })
variant('bow_gold', 'bow', { w: '#c89614', l: '#f0c832' })
variant('bow_dark', 'bow', { w: '#3a2a4a', l: '#6a4a8a', s: '#d0a0ff' })
variant('shield_red', 'shield', { b: '#c82a2a' })
variant('shield_gold', 'shield', { b: '#e0a010', i: '#fff0a0' })
variant('potion_green', 'potion', { p: '#5ad04a', P: '#2a8a2a', h: '#d0ffc0' })
variant('potion_purple', 'potion', { p: '#a05ae0', P: '#6a2aa0', h: '#ecd0ff' })
variant('star_blue', 'star', { y: '#8ad8ff', Y: '#3a9ad0', w: '#ffffff', o: '#0a2a4a' })
variant('heal_green', 'heal', { r: '#4ad04a', R: '#2a8a2a', o: '#0a3a0a' })
variant('flame_blue', 'flame', { r: '#3a8aff', R: '#1a4ab0', y: '#aaf0ff', o: '#0a1a4a' })
variant('mace_gold', 'mace', { m: '#f0c832', M: '#c89614', s: '#fff6c8' })
variant('pickaxe_iron', 'pickaxe', { i: '#d8d8d8', I: '#8a8a8a' })
variant('trident_gold', 'trident', { c: '#f0c832', C: '#c89614', w: '#fff6c8', o: '#3a2a00' })
variant('steak_raw', 'steak', { m: '#d84a4a', M: '#a02a2a' })
variant('chest_ender', 'chest', { w: '#2a3a3a', W: '#1a2a2a', d: '#0a1414', i: '#3ad0a0', I: '#1a8a6a' })

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
