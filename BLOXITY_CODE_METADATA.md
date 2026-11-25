---
canDie: true
hasScore: true
rewards: true
badges: true
notApplicable:
  gameStore: Nothing in Kit PvP is sold for Gems. Every shop item, kit and look is bought with Gold earned in the arena, from crates and from the daily reward (and the rewarded ad pays Gold too).
---

# Boxity integration decisions

- **canDie: true.** Dying in the arena (void, lava, fire, a fight) shows Boxity's death screen; the game's own Respawn button waits for its countdown. A duel round lost is not a death (the next round respawns you on the server's clock).
- **hasScore: true.** Boards (declared in `src/config.js` `BOARDS`, submitted by the server from state it owns, see the backend's `src/boxity/boards.ts`): `kills` (player kills, weekly, sum), `streak` (best killstreak, weekly), `duels` (ranked duels won, sum), `rating` (ranked duel rating).
- **rewards: true.** One rewarded ad, `bonus-gold`: +150 Gold from the Shop window. The server verifies Boxity's reward token and answers with the amount.
- **badges: true.** 11 badges (emoji icons), awarded by the server from its own counters (`src/boxity/badges.ts` in the backend).
- **Screen ads.** Declared screens: `panel` (every full-screen window: Kits, Shop, ...), `results` (a duel just ended) and `gameplay`. Gameplay banners are off (no `show: true`): the game is a fast PvP fight.
- **Stats** ("Only in this game"): Player Kills, Best Killstreak, Duels Won, Duels Lost, Duel Rating, reported by the server every 60 s.
- **Emotes, overhead chat bubbles, party play, Play with friends, Open Rooms:** supported. Hosted on Boxity with the matchmaker, so parties and Play with friends are automatic (the room's `maxClients` is 20).
