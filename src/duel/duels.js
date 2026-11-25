// Duels: 1v1, first to DUEL.wins rounds, on the duel platforms (world.js).
//  - online (casual / ranked): the server (KitRoom.ts) matches two players, picks a platform and
//    a side each, runs the rounds (duelStart, duelRound, duelScore, duelEnd) and keeps the ranked
//    rating; each client reports its own death (duelDied) and quitting (duelLeave = forfeit).
// There are no bots: a duel is always against another player.
// main.js does the moving (enter / spawn / exit); combat.js locks you during the countdown.
// Rewards: DUEL.rewards (Gold + XP), paid here when a duel ends.
import './duel.css'
import { DUEL } from '../config.js'
import { addGold, addXp, changed, state } from '../state.js'
import { net, on as onNet, send } from '../net.js'
import * as sfx from '../audio.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// hooks: { combat, enter(slot, side), spawn(slot, side), exit(), feed(html), toast(text, kind),
//          levelUp(), changed() (the Duels window re-renders), playerName() }
export function createDuels(hooks) {
  const S = {
    phase: 'idle', // idle | queued | duel
    mode: 'casual', // casual | ranked
    id: '',
    slot: -1,
    side: 0,
    opponent: '',
    opponentId: '',
    opponentRating: 0,
    score: [0, 0],
    round: 0,
    rating: 1000,
    won: 0, // ranked record (server)
    lost: 0,
  }
  let roundTimer = 0

  // --- overlay: score bar + countdown ---
  const bar = document.createElement('div')
  bar.className = 'duel-bar hud-outline'
  const big = document.createElement('div')
  big.className = 'duel-big hud-outline'
  ;(document.getElementById('hud') ?? document.body).append(bar, big)
  function drawBar() {
    if (S.phase !== 'duel') {
      bar.classList.remove('on')
      return
    }
    const me = S.side
    const op = 1 - me
    const dots = (n) => [...Array(DUEL.wins)].map((_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')
    const label = S.mode === 'ranked' ? 'RANKED' : 'DUEL'
    bar.innerHTML = `<div class="side you"><b>${esc(hooks.playerName())}</b><span class="dots">${dots(S.score[me])}</span></div><div class="mid"><small>${label}</small>${S.score[me]} - ${S.score[op]}<small>Round ${S.round}</small></div><div class="side them"><span class="dots">${dots(S.score[op])}</span><b>${esc(S.opponent)}</b></div>`
    bar.classList.add('on')
  }
  let bigTimer = 0
  function flash(text, cls = '', ms = 900) {
    big.textContent = text
    big.className = `duel-big hud-outline on ${cls}`
    clearTimeout(bigTimer)
    bigTimer = setTimeout(() => big.classList.remove('on'), ms)
  }
  // 3, 2, 1, FIGHT!
  function countdown(sec) {
    for (let i = 0; i < sec; i++)
      setTimeout(() => {
        if (S.phase !== 'duel') return
        flash(String(sec - i), 'count', 800)
        sfx.hotbar()
      }, i * 1000)
    setTimeout(() => {
      if (S.phase !== 'duel') return
      flash('FIGHT!', 'go', 800)
      sfx.notify()
    }, sec * 1000)
  }

  function startRound(lockS) {
    clearTimeout(roundTimer)
    hooks.spawn(S.slot, S.side)
    hooks.combat.duel.round(lockS)
    drawBar()
    countdown(Math.round(lockS))
  }
  function enter() {
    S.phase = 'duel'
    S.score = [0, 0]
    S.round = 0
    hooks.enter(S.slot, S.side)
    hooks.changed()
  }
  function finish(won, forfeit, delta = 0) {
    clearTimeout(roundTimer)
    const mode = S.mode
    const [gold, xp] = DUEL.rewards[mode]?.[won ? 'win' : 'loss'] ?? [0, 0]
    if (gold) addGold(gold)
    const ups = xp ? addXp(xp) : 0
    state.duels = state.duels ?? { won: 0, lost: 0 }
    if (won) state.duels.won++
    else state.duels.lost++
    changed()
    const title = won ? 'VICTORY!' : 'DEFEAT'
    const parts = []
    if (forfeit) parts.push(won ? 'Your opponent left' : 'You left the duel')
    parts.push(`${S.score[S.side]} - ${S.score[1 - S.side]} vs ${S.opponent}`)
    if (gold || xp) parts.push(`+${gold} Gold  +${xp} XP`)
    if (mode === 'ranked') parts.push(`Rating ${S.rating} (${delta >= 0 ? '+' : ''}${delta})`)
    flash(title, won ? 'win' : 'lose', 2600)
    hooks.feed(`<span style="color:${won ? '#7cff4a' : '#ff8a7a'}">${title}</span> ${esc(parts.join(' · '))}`)
    if (won) sfx.streak()
    else sfx.death()
    if (ups) hooks.levelUp()
    S.phase = 'idle'
    S.id = ''
    drawBar()
    hooks.combat.duel.clear()
    setTimeout(() => hooks.exit(), 1800)
    hooks.changed()
  }

  // --- online ---
  onNet('duelStart', (m) => {
    Object.assign(S, { mode: m.mode, id: m.id, slot: m.slot, side: m.side, opponent: m.opponent, opponentId: m.opponentId, opponentRating: m.opponentRating, rating: m.rating })
    enter()
    hooks.toast(`Duel found: ${m.opponent}${m.mode === 'ranked' ? ` (${m.opponentRating})` : ''}`, 'good')
  })
  onNet('duelRound', (m) => {
    if (m.id !== S.id) return
    S.round = m.round
    S.score = m.score
    startRound((m.countdownMs ?? 3000) / 1000)
  })
  onNet('duelScore', (m) => {
    if (m.id !== S.id) return
    S.score = m.score
    drawBar()
    const iWon = m.roundWinner === S.side
    if (Math.max(...S.score) < DUEL.wins) flash(iWon ? 'Round won!' : 'Round lost', iWon ? 'win' : 'lose', 1400)
  })
  onNet('duelEnd', (m) => {
    if (m.id !== S.id) return
    S.score = m.score
    if (m.mode === 'ranked') {
      S.rating = m.rating
      if (m.won) S.won++
      else S.lost++
    }
    finish(!!m.won, !!m.forfeit, m.delta ?? 0)
  })
  onNet('progress', (m) => {
    S.won = m.duelsWon ?? 0
    S.lost = m.duelsLost ?? 0
    hooks.changed()
  })
  onNet('disconnect', () => {
    if (S.phase === 'queued') S.phase = 'idle'
    if (S.phase === 'duel') finish(false, true)
    hooks.changed()
  })

  return {
    state: S,
    id: () => (S.phase === 'duel' ? S.id : ''),
    inDuel: () => S.phase === 'duel',
    connected: () => net.connected,
    // the roster's rating for this player (live: ranked results update it)
    rating() {
      const me = net.connected ? net.room?.state?.players?.get(net.sessionId) : null
      return me?.rating ?? S.rating
    },
    queue(mode) {
      if (!net.connected) return hooks.toast('Online duels need a connection to the game server', 'bad')
      if (S.phase !== 'idle') return
      S.phase = 'queued'
      S.mode = mode
      send('duelQueue', { mode })
      sfx.uiClick()
      hooks.changed()
    },
    cancel() {
      if (S.phase !== 'queued') return
      send('duelCancel', {})
      S.phase = 'idle'
      hooks.changed()
    },
    // R / leave: a forfeit
    leave() {
      if (S.phase !== 'duel') return
      send('duelLeave', {})
    },
    // main.js: you died in a duel
    onPlayerDied() {
      if (S.phase !== 'duel') return
      send('duelDied', {})
    },
    // the Duels NPC count: players in duels or queued (roster)
    playing() {
      let n = 0
      net.room?.state?.players?.forEach?.((p) => {
        if (p.duel || p.queued) n++
      })
      return n
    },
  }
}
