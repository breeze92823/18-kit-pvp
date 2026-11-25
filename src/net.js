// Online play: joins the Kit PvP room (backend KitRoom.ts) and keeps the connection alive.
// On Bloxity the SDK resolves a server pod (or the ?roomId= the page was opened with: Join
// buttons and friend invites); in dev it tries SERVER_URL. Nothing answering = offline play
// (local bots only), retried in the background with backoff.
//
// The roster (room.state.players, keyed by sessionId) carries everyone's pose / kit / hp / flags;
// remotePlayers.js draws it. Combat is relayed as messages (see KitRoom.ts for the list):
// combat.js sends hits / acts / fx / deaths and handles what the others send.
import { Client } from '@colyseus/sdk'
import { NET, SERVER_URL } from './config.js'
import { authState, canResolveServer, getEquippedAvatar, getProportions, getToken, launchRoomId, locateRoom, onAvatarChanged, onProportionsChanged, resolveServerEndpoint, subscribeAuth, updateRoom } from './bloxity.js'
import { serializeLook } from './avatar/look.js'

export const net = {
  room: null,
  connected: false,
  sessionId: '',
}
const handlers = new Map() // type -> Set(fn)
let poseFn = null // () => pose object (main.js)
let joinFn = null // () => { kit, pose } for the join options

// The signed-in player's Bloxity look as JSON for the others to draw ('' = the stock rig: guests).
// The server relays it as an opaque string; avatar/look.js validates it on the receiving side.
const lookJson = () => (authState.user ? serializeLook(getEquippedAvatar(), getProportions()) : '')

export const hasServer = () => !!SERVER_URL || canResolveServer()
export const roster = () => (net.connected ? net.room?.state?.players ?? null : null)
export const hostId = () => (net.connected ? net.room?.state?.host ?? '' : '')
// Simulates the arena bots: offline, the elected host, or nobody fighting yet.
export const simulatesBots = () => !net.connected || !hostId() || hostId() === net.sessionId
export const isHost = () => net.connected && hostId() === net.sessionId

export function send(type, msg) {
  if (!net.connected || !net.room) return
  try {
    net.room.send(type, msg)
  } catch {
    // dropped connection: the reconnect resends what matters
  }
}
// on(type, fn): fn(msg) for every server message of that type (kept across reconnects)
export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, new Set())
  handlers.get(type).add(fn)
}
const TYPES = ['hit', 'botHit', 'act', 'botAct', 'fx', 'bots', 'feed', 'kill', 'summon', 'progress', 'noProgress', 'leaderboard', 'duelStart', 'duelRound', 'duelScore', 'duelEnd', 'emote', 'adRewardResult']

function attach(room) {
  net.room = room
  net.connected = true
  net.sessionId = room.sessionId
  for (const type of TYPES) room.onMessage(type, (msg) => handlers.get(type)?.forEach((fn) => fn(msg)))
  room.onLeave(() => {
    if (net.room !== room) return
    net.room = null
    net.connected = false
    net.sessionId = ''
    updateRoom('')
    handlers.get('disconnect')?.forEach((fn) => fn())
    setTimeout(connect, NET.rejoin * 1000)
  })
  handlers.get('connect')?.forEach((fn) => fn())
}

let launchRoom = launchRoomId()
// "<relayRoomId>~<colyseusRoomId>" of the room we are in (what updateRoom() reported)
let currentRoomId = ''
async function joinLaunchRoom(options) {
  const id = launchRoom
  launchRoom = ''
  if (!id) return null
  try {
    if (SERVER_URL) return { room: await new Client(SERVER_URL).joinById(id.split('~').pop(), options), relay: '' }
    const at = await locateRoom(id)
    if (at) return { room: await new Client(at.endpoint).joinById(at.roomId, options), relay: at.relayRoomId }
  } catch (err) {
    console.info('[net] the invited room is gone or full; matchmaking instead', err?.message ?? err)
  }
  return null
}
async function joinAnyRoom(options) {
  if (SERVER_URL) return { room: await new Client(SERVER_URL).joinOrCreate(NET.room, options), relay: '' }
  const { endpoint, relayRoomId } = await resolveServerEndpoint()
  return { room: await new Client(endpoint).joinOrCreate(NET.room, options), relay: relayRoomId }
}

let sentLook = ''
let connecting = false
let retryIn = NET.retry
async function connect() {
  if (!hasServer() || connecting || net.connected) return
  connecting = true
  try {
    const options = { token: getToken(), avatar: lookJson(), ...(joinFn?.() ?? {}) }
    sentLook = options.avatar
    const { room, relay } = (await joinLaunchRoom(options)) ?? (await joinAnyRoom(options))
    retryIn = NET.retry
    attach(room)
    currentRoomId = relay ? `${relay}~${room.roomId}` : room.roomId
    updateRoom(currentRoomId)
    console.info(`[net] joined ${NET.room} ${room.roomId} as ${room.sessionId}`)
  } catch (err) {
    console.info(`[net] no game server (retrying in ${retryIn}s); playing offline`, err?.message ?? err)
    setTimeout(connect, retryIn * 1000)
    retryIn = Math.min(retryIn * 2, NET.retryMax)
  } finally {
    connecting = false
  }
}

// Own pose at most poseHz times a second (and at least once a second while nothing changes).
let lastPose = ''
let lastSent = 0
function sendPose() {
  if (!net.connected || !poseFn) return
  const p = poseFn()
  if (!p) return
  const key = JSON.stringify(p)
  const now = performance.now()
  if (key === lastPose && now - lastSent < 1000) return
  lastPose = key
  lastSent = now
  send('pose', p)
}

// pose(): { x, y, z, yaw, pitch, speed, vx, vy, vz, hp, flags, swing, zone, kit, item }
// join(): extra join options ({ kit, pose })
export function initNet({ pose, join } = {}) {
  poseFn = pose
  joinFn = join
  if (!hasServer()) return console.info('[net] no server configured; playing offline')
  setInterval(sendPose, 1000 / NET.poseHz)
  // a new look (customizer, body sliders, a sign-in settling): tell the room, debounced (the SDK fires
  // twice per change) and only when it really changed
  let lookTimer = 0
  const pushLook = () => {
    clearTimeout(lookTimer)
    lookTimer = setTimeout(() => {
      const look = lookJson()
      if (!net.connected || look === sentLook) return
      sentLook = look
      send('setAvatar', { avatar: look })
    }, 400)
  }
  onAvatarChanged(pushLook)
  onProportionsChanged(pushLook)
  // a sign-in mid-session: rejoin so the server verifies the new identity
  let signedIn = null
  subscribeAuth((s) => {
    if (!s.ready) return
    const now = !!s.user
    if (signedIn === null) {
      signedIn = now
      return void connect()
    }
    if (now === signedIn) return
    signedIn = now
    // Rejoin the SAME room by id (CrazyGames players often sign in mid-game and must stay with
    // their friends): joinLaunchRoom falls back to matchmaking only when that room is gone or full.
    if (net.connected) {
      launchRoom = currentRoomId
      net.room.leave(true)
    }
  })
  setTimeout(connect, 1500) // the SDK may never answer outside the portal
}
