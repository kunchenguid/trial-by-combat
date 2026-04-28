<h1 align="center">Agent Duel</h1>
<p align="center">
  <a href="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=flat-square"><img alt="Platform" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=flat-square" /></a>
  <a href="https://x.com/kunchenguid"><img alt="X" src="https://img.shields.io/badge/X-@kunchenguid-black?style=flat-square" /></a>
  <a href="https://discord.gg/Wsy2NpnZDu"><img alt="Discord" src="https://img.shields.io/discord/1439901831038763092?style=flat-square&label=discord" /></a>
</p>

<h3 align="center">Two LLMs walk into a 9x9 grid. One walks out with the relic.</h3>

LLM benchmarks are saturated and boring to watch.
You want to actually see models think - pick a fight, set a trap, get baited, recover.
Something where the strategy is legible in five seconds and the matches read on a stream.

Agent Duel is a turn-based deterministic 1v1 duel for LLMs. Two agents play **Capture the Relic** on a 9x9 grid: simultaneous turns, hidden information from player choices only, no in-match randomness, BO1/3/5/7 series with sides swapping each game.

- **Deterministic** - no RNG inside a match. Same actions, same outcome. Replays are exact.
- **Livestream-ready** - spectator and admin browser views, no setup, no DB.
- **Agent-native API** - players are LLM agents that join over plain-text HTTP. Every response includes the briefing, current grid, and the exact curl to run next.
- **Real hidden information** - fog of war from bushes, scans, and traps. Vision is earned, not given.

## Quick Start

```sh
$ npm install                           # install deps
$ npm start                             # serve on http://localhost:4178

# open these in a browser (spectator + operator views)
http://localhost:4178/?player=admin     # admin controls
http://localhost:4178/?player=spectate  # spectator view
```

Players are LLM agents that talk to the server over HTTP. Tell each agent:

```
Play Agent Duel at `curl http://localhost:4178/player1` as "GPT 5.5".
Play Agent Duel at `curl http://localhost:4178/player2` as "OPUS 4.7".
```

That's it. The first response includes the full briefing and tells the agent exactly what to call next; every subsequent response does the same. The full HTTP contract is in `api-spec.md`. Admin can set series length (BO1/3/5/7) before lock and can pause/resume/restart.

## Run From Source

**From source**

```sh
git clone https://github.com/kunchenguid/agent-duel.git
cd agent-duel
npm install
npm start
```

Set `PORT` to override the default `4178`. Node 18+ recommended (uses the built-in `node:test` runner and `fetch`).

## How It Works

```
┌──────────────┐  POST /player1/action  ┌──────────────────┐
│  Player 1    │ ─────────────────────► │                  │
│  (LLM agent) │   GET /player1         │   server.js      │
└──────────────┘ ◄───────────────────── │  (HTTP API for   │
                       text view        │  players, WS for │
┌──────────────┐                        │  spectator/admin)│
│  Player 2    │ ─────────────────────► │                  │
│  (LLM agent) │ ◄───────────────────── └────────┬─────────┘
└──────────────┘       text view                 │
                                   resolveTurn   │ pure
                                   (blue, red)   ▼
                                          ┌──────────────┐
┌──────────────┐                          │              │
│  Spectator   │ ◄─────────────────────── │  engine.js   │
│   + Admin    │   broadcast state        │  (immutable, │
└──────────────┘   over WebSocket         │   tested)    │
                                          └──────────────┘
```

## Development

```sh
npm start                               # run the server
npm test                                # run all tests (node --test)
npm run test:engine                     # engine tests only
node --test test/server.test.js         # single test file
npm run build:atlas                     # rebuild sprite atlas from source assets
```
