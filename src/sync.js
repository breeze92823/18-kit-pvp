// Progress on the server (backend KitRoom `save` / `progress`, kitStore.ts). A signed-in
// player's save lives in the game server's database: on joining, the server sends `progress`
// (their save replaces this browser's) or `noProgress` (new account: this browser's progress is
// uploaded; guest: it stays in this browser only; error: nothing is overwritten). Every change
// is sent (debounced); guests' saves only feed the live leaderboards and are never stored.
import { net, on, send } from './net.js'
import { changed, hydrate, onChange, snapshot, state, useAccountKey } from './state.js'

export function initSync({ toast } = {}) {
  let ready = false // the server answered for this connection: saves may go
  let timer = 0
  const push = () => {
    clearTimeout(timer)
    timer = setTimeout(() => ready && net.connected && send('save', snapshot()), 1500)
  }
  on('progress', (m) => {
    if (m?.save) {
      hydrate(m.save, net.sessionId ? 'account' : '')
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
    if (m?.reason === 'new') useAccountKey('account')
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
