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
- **Livestream-ready** - three views (player, spectator, admin) over WebSocket, no setup, no DB.
- **Real hidden information** - fog of war from bushes, scans, and traps. Vision is earned, not given.

## Quick Start

```sh
$ npm install                           # install deps
$ npm start                             # serve on http://localhost:4178
Agent Duel listening on http://localhost:4178

# open these in separate browser tabs
http://localhost:4178/?player=spectate
http://localhost:4178/?player=admin
http://localhost:4178/?player=1&name=GPT
http://localhost:4178/?player=2&name=CLAUDE
```

Spectator and admin can be opened first; the match starts once both players ready up. Admin sets series length (BO1/3/5/7) before lock and can pause/resume/restart.

## Install

**From source**

```sh
git clone https://github.com/kunchenguid/agent-duel.git
cd agent-duel
npm install
npm start
```

Set `PORT` to override the default `4178`. Node 18+ recommended (uses the built-in `node:test` runner and `WebSocket`).

## How It Works

```
┌──────────────┐     submit_action      ┌──────────────────┐
│  Player 1    │ ─────────────────────► │                  │
│  (LLM/human) │                        │   server.js      │
└──────────────┘ ◄───────────────────── │   (WebSocket     │
                       state            │   harness, turn  │
┌──────────────┐                        │   timer, lobby)  │
│  Player 2    │ ─────────────────────► │                  │
│  (LLM/human) │ ◄───────────────────── └────────┬─────────┘
└──────────────┘       state                     │
                                   resolveTurn   │ pure
                                   (blue, red)   ▼
                                          ┌──────────────┐
┌──────────────┐                          │              │
│  Spectator   │ ◄─────────────────────── │  engine.js   │
│   + Admin    │   broadcast state +      │  (immutable, │
└──────────────┘   public events          │   tested)    │
                                          └──────────────┘
```

- **Pure engine** - `resolveTurn(game, { blue, red })` clones the game and returns the next state plus an event log. No I/O, no time, no globals.
- **Two-strike validation** - first invalid action gets a retry prompt; second invalid action locks the side as `WAIT` for the turn. Keeps griefing and prompt-confusion bounded.
- **Path invariants** - wall placement runs a BFS check on a trial clone, so no player can seal off the relic or either base.
- **Sides swap each game** - slot identity (`player_1`/`player_2`) is stable across the series; sides (`blue`/`red`) flip on odd/even games to neutralize map asymmetry.

## URLs

| URL                      | Role                                            |
| ------------------------ | ----------------------------------------------- |
| `/?player=spectate`      | Read-only board view, optional X-ray            |
| `/?player=admin`         | Series length, pause/resume, restart, next game |
| `/?player=1&name=GPT`    | Player 1 (name required)                        |
| `/?player=2&name=CLAUDE` | Player 2 (name required)                        |

## Development

```sh
npm start                               # run the server
npm test                                # run all tests (node --test)
npm run test:engine                     # engine tests only
node --test test/server.test.js         # single test file
npm run build:atlas                     # rebuild sprite atlas from source assets
```
