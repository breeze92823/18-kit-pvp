// Progress on the server (backend KitRoom `save` / `progress`, kitStore.ts). A signed-in
// player's save lives in the game server's database: on joining, the server sends `progress`
// (their save replaces the in-memory progress) or `noProgress` (new account: the progress made so
// far this page is uploaded as its first save; guest: it lives in memory for the page only; error:
// nothing is overwritten). The browser keeps no copy (no localStorage): the server's database is the
// only save. Every change is sent (debounced); guests' saves only feed the live leaderboards.
import { net, on, send } from './net.js'
import { changed, hydrate, onChange, snapshot, state } from './state.js'
import * as sfx from './audio.js'

export function initSync({ toast } = {}) {
  let ready = false // the server answered for this connection: saves may go
  let timer = 0
  const push = () => {
    clearTimeout(timer)
    timer = setTimeout(() => ready && net.connected && send('save', snapshot()), 1500)
  }
  on('progress', (m) => {
    if (m?.save) {
      hydrate(m.save)
      // the account's volumes (saved server-side with the rest of the progress)
      sfx.setVolume('sfx', state.settings.sfx)
      sfx.setVolume('ambience', state.settings.ambience)
      toast?.('Progress loaded from your account', 'good')
    }
    ready = true
    push()
  })
  on('noProgress', (m) => {
    if (m?.reason === 'error') {
      ready = false // the save could not be read: never overwrite it
      return
    }
    ready = true
    push()
  })
  on('disconnect', () => {
    ready = false
  })
  onChange(() => push())
  // playtime etc. tick without a change event: send now and then anyway
  setInterval(() => ready && net.connected && send('save', snapshot()), 30000)
  window.addEventListener('pagehide', () => ready && net.connected && send('save', snapshot()))
  return { flush: () => ready && net.connected && send('save', snapshot()), state, changed }
}
