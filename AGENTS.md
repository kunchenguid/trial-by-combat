# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Project

Trial by Combat is a turn-based deterministic 1v1 LLM duel, livestream-ready. The current (and only) mode is **Capture the Relic** on a 9x9 grid. Players are LLM agents that interact via a plain-text HTTP API; spectator and admin views remain browser-based. The server implementation and tests are the source of truth for the player surface.

## Commands

```sh
npm install
npm start                  # node src/server.js, default PORT=4178
npm test                   # node --test, runs all test/*.test.js
npm run test:engine        # engine tests only
node --test test/server.test.js   # single file
node --test --test-name-pattern="creates Center Choke" test/engine.test.js   # single test
npm run build:atlas        # regenerate sprite atlas (see "Sprite atlas" below)
```

There is no bundler, transpiler, linter, or TypeScript. Pure ESM Node + vanilla browser JS.

## URL routes

Browser (spectator and admin only):

- `/?player=spectate` - spectator view
- `/?player=admin` - admin (series length, pause/resume, restart, next game)
- `/?player=1` and `/?player=2` return 404 (player slots are API-only)

WebSocket endpoint `/ws` is for spectator and admin only; a player WS upgrade is rejected.

Player HTTP API:

- `GET /player1` and `GET /player2` - long-poll text view + briefing + DO NEXT block
- `POST /player1/{join,ready,action,leave}` (and `/player2/...`) - JSON bodies, plain-text replies

## Architecture

Two-process boundary: a pure synchronous **game engine** and a thin **HTTP + WebSocket harness** that drives it.

### `src/engine.js` - pure game logic

- Exports: `createGame`, `createSeries`, `resolveTurn`, `validateAction`, `getLegalActions`, `getPlayerView`, `getSpectatorView`, plus `ACTIONS`, `SIDES`, `BOARD_SIZE`, `RULESET_VERSION`.
- All state mutations go through `resolveTurn(game, { blue, red })`, which clones the game (`cloneGame`) and returns `{ game, events, actions, droppedByDamage }`. Never mutate a game object in place outside `resolveTurn` - everything is built around treating game state as immutable from the harness's perspective.
- Resolution order in `resolveTurn` matters and is tested: invalid-action coercion to WAIT → respawn stunned → HEAL → SCAN → dash inventory decrement → 2-step movement (with collision detection between sides) → ATTACK → damage application (GUARD reduces by 2) → forced relic drops on >=3 damage → voluntary DROP_RELIC → knockouts → placement (PLACE_WALL/PLACE_TRAP) → auto pickup → win check → turn cap.
- Wall placement runs a path invariant check (`allPathInvariantsHold`) on a cloned trial game so a player can't seal off the relic or either base. BFS via `shortestPath`.
- Series sides swap each game (`slotSidesForGame`): odd game = `player_1: blue`, even = `player_1: red`. Slots (`player_1`/`player_2`) are stable; sides (`blue`/`red`) flip.
- Map constants (`CENTER_CHOKE`) and starting inventory are frozen module locals. To add a new map, parameterize `createGame` rather than mutating these.

### `src/server.js` - HTTP + WebSocket harness

- `createAppServer({ turnSeconds })` returns `{ app, server, listen, close, port }`. Tests use this with a randomly-assigned port and short `turnSeconds`.
- Holds a single in-memory `state` (no DB, no persistence). Phases: `pre_lobby` → `lobby` → `match` → (`game_end` | `series_end`).
- Player slots are HTTP-only. State stores `{ name, ready }` per slot - no socket. The slot is "held" while a name is set; `POST /playerN/leave` clears it (and pauses an active match).
- Long-polling for `GET /playerN` is driven by a per-state `EventEmitter` - `notifyChange(state)` both wakes the long-pollers and broadcasts to spectator/admin WS.
- Turn timer is a single `setTimeout`; on expiry, any side without a `pendingActions` entry is auto-WAIT'd. Pause/resume preserves remaining seconds in `remainingWhenPaused`.
- Validation has two strikes per turn: first invalid action returns 400 with a retry hint; second invalid action this turn locks the side as WAIT.
- Action body translation: HTTP uses uniform `{action, target, intent}`. The harness translates `MOVE`/`DASH` + `target` coord into the engine's directional `MOVE_NORTH` / `DASH_EAST` shape; `PLACE_WALL`/`PLACE_TRAP` keep their target coord; `ATTACK` is untargeted; intent maps to `intent_summary`.
- Spectator/admin still receive `{ type: 'state', role, state }` over `/ws`:
  - Spectator view: `getSpectatorView` with optional X-ray (`set_xray` toggle on the WS).
  - Admin view: full payload + spectator view forced to xray.
- Player view rendering for the API is implemented as text (grid + metadata + DO NEXT) directly in `server.js`.

### `public/` - browser client

- No build step. `index.html` loads Pixi.js from CDN and `app.js` as a module. Asset modules are imported with `?v=...` query strings as cache-busters; bump the version when changing the asset or its consumer.
- `app.js` connects to `/ws`, dedupes incoming state with a fingerprint that strips the timer fields, then renders one of two roles (spectator/admin). Player rendering is gone - those slots are API-only.
- Visuals use the sprite atlas at `public/assets/trial-by-combat-sprite-sheet.png` plus the generated `sprite-atlas.js` runtime metadata.

### Sprite atlas

`scripts/build-sprite-atlas.mjs` reads the source PNG + JSON in `public/assets/source/`, validates strict invariants (2048x2048, 64px cells, 32x32 grid), then writes:

- `public/assets/trial-by-combat-sprite-sheet.png` (copied)
- `public/assets/trial-by-combat-sprite-sheet.meta.json` (runtime metadata)
- `public/assets/sprite-atlas.js` (runtime ESM module)

Re-run `npm run build:atlas` after editing any source asset. The atlas version (`production-atlas-2048-v1`) is hard-coded in the script and must match the `?v=` cache-buster used by `app.js`.

## Conventions to keep

- Coordinates are letter+digit strings (`A1`-`I9`); use `coordToPoint` / `pointToCoord` / `stepCoord` rather than parsing inline.
- Engine functions take a side (`'blue'`/`'red'`) at the boundary; convert from slot via `game.slotSides` / `game.sideSlots`.
- Events have `visibility: 'public' | 'private_blue' | 'private_red'`. Player views filter via `visibleEventsFor`; never leak a `private_*` event to the wrong side.
- Tests use the built-in `node:test` runner (no Jest, no Mocha). API tests in `test/api.test.js` spin up `createAppServer` on port 0 and use real `fetch`; spectator/admin WS coverage lives in `test/server.test.js`.
- When changing rules, also bump `RULESET_VERSION` in `engine.js` and update server tests if the player surface is affected.
