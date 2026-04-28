# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Project

Agent Duel is a turn-based deterministic 1v1 LLM duel, livestream-ready. The current (and only) mode is **Capture the Relic** on a 9x9 grid (Center Choke map). The full spec lives in `prd.md` - treat it as the source of truth for game rules, formats, and viewer/admin/player flows.

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

- `/?player=spectate` - spectator view
- `/?player=admin` - admin (series length, pause/resume, restart, next game)
- `/?player=1&name=Ada` - Player 1
- `/?player=2&name=Turing` - Player 2

WebSocket endpoint is `/ws` with the same query params. A name is required for player roles; missing it is rejected at both HTTP and WS upgrade.

## Architecture

Two-process boundary: a pure synchronous **game engine** and a thin **WebSocket harness** that drives it.

### `src/engine.js` - pure game logic

- Exports: `createGame`, `createSeries`, `resolveTurn`, `validateAction`, `getLegalActions`, `getPlayerView`, `getSpectatorView`, plus `ACTIONS`, `SIDES`, `BOARD_SIZE`, `RULESET_VERSION`.
- All state mutations go through `resolveTurn(game, { blue, red })`, which clones the game (`cloneGame`) and returns `{ game, events, actions, droppedByDamage }`. Never mutate a game object in place outside `resolveTurn` - everything is built around treating game state as immutable from the harness's perspective.
- Resolution order in `resolveTurn` matters and is tested: invalid-action coercion to WAIT → respawn stunned → HEAL → SCAN → dash inventory decrement → 2-step movement (with collision detection between sides) → ATTACK → damage application (GUARD reduces by 2) → forced relic drops on >=3 damage → voluntary DROP_RELIC → knockouts → placement (PLACE_WALL/PLACE_TRAP) → auto pickup → win check → turn cap.
- Wall placement runs a path invariant check (`allPathInvariantsHold`) on a cloned trial game so a player can't seal off the relic or either base. BFS via `shortestPath`.
- Series sides swap each game (`slotSidesForGame`): odd game = `player_1: blue`, even = `player_1: red`. Slots (`player_1`/`player_2`) are stable; sides (`blue`/`red`) flip.
- Map constants (`CENTER_CHOKE`) and starting inventory are frozen module locals. To add a new map, parameterize `createGame` rather than mutating these.

### `src/server.js` - WebSocket harness

- `createAppServer({ turnSeconds })` returns `{ app, server, listen, close, port }`. Tests use this with a randomly-assigned port and short `turnSeconds`.
- Holds a single in-memory `state` (no DB, no persistence). Phases: `pre_lobby` → `lobby` → `match` → (`game_end` | `series_end`).
- One slot per player: a second connection to the same role kicks the first with code 4001.
- Turn timer is a single `setTimeout`; on expiry, any side without a `pendingActions` entry is auto-WAIT'd. Pause/resume preserves remaining seconds in `remainingWhenPaused`.
- Validation has two strikes per turn: first invalid action returns `validation_error` with `retry: true`; second invalid action locks the side as WAIT for that turn.
- Three view shapes are sent over `/ws` as `{ type: 'state', role, state }`:
  - Player view: fog-of-war via `getPlayerView` (only sees opponent if visible per bush/distance/scan rules).
  - Spectator view: `getSpectatorView` with optional X-ray (`set_xray` toggle on the WS).
  - Admin view: full payload + spectator view forced to xray.

### `public/` - browser client

- No build step. `index.html` loads Pixi.js from CDN and `app.js` as a module. Asset modules are imported with `?v=...` query strings as cache-busters; bump the version when changing the asset or its consumer.
- `app.js` connects to `/ws`, dedupes incoming state with a fingerprint that strips the timer fields, then renders one of three roles (player/spectator/admin).
- Visuals use the sprite atlas at `public/assets/agent-duel-sprite-sheet.png` plus the generated `sprite-atlas.js` runtime metadata.

### Sprite atlas

`scripts/build-sprite-atlas.mjs` reads the source PNG + JSON in `public/assets/source/`, validates strict invariants (2048x2048, 64px cells, 32x32 grid), then writes:

- `public/assets/agent-duel-sprite-sheet.png` (copied)
- `public/assets/agent-duel-sprite-sheet.meta.json` (runtime metadata)
- `public/assets/sprite-atlas.js` (runtime ESM module)

Re-run `npm run build:atlas` after editing any source asset. The atlas version (`production-atlas-2048-v1`) is hard-coded in the script and must match the `?v=` cache-buster used by `app.js`.

## Conventions to keep

- Coordinates are letter+digit strings (`A1`-`I9`); use `coordToPoint` / `pointToCoord` / `stepCoord` rather than parsing inline.
- Engine functions take a side (`'blue'`/`'red'`) at the boundary; convert from slot via `game.slotSides` / `game.sideSlots`.
- Events have `visibility: 'public' | 'private_blue' | 'private_red'`. Player views filter via `visibleEventsFor`; never leak a `private_*` event to the wrong side.
- Tests use the built-in `node:test` runner (no Jest, no Mocha). Server tests spin up `createAppServer` on port 0 and connect real WebSockets.
- When changing rules, also bump `RULESET_VERSION` in `engine.js` and update `prd.md` if the change is user-visible.
