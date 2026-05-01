import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { WebSocketServer } from 'ws';

import { RULES } from '../public/rules.js';
import {
  ACTIONS,
  BOARD_SIZE,
  createSeries,
  getLegalActions,
  getPlayerView,
  getSpectatorView,
  resolveTurn,
  validateAction,
} from './engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const matchLogFile = process.env.TBC_MATCH_LOG_FILE || path.join(__dirname, '..', 'match-log.jsonl');
const matchLogEnabled = process.env.TBC_MATCH_LOG !== '0';

function appendMatchLog(matchId, entry) {
  if (!matchLogEnabled || !matchId) return;
  try {
    fs.appendFileSync(matchLogFile, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch (err) {
    console.error('match log write failed:', err.message);
  }
}
const HEARTBEAT_INTERVAL_MS = 15000;
const DEFAULT_WAIT_MS = 30000;
const MAX_WAIT_MS = 30000;
const SPECTATE_ROLE = 'spectate';
const ADMIN_ROLE = 'admin';

export function createAppServer({ turnSeconds = 300 } = {}) {
  const expressApp = express();
  const server = http.createServer(expressApp);
  const wss = new WebSocketServer({ noServer: true });
  const state = createRuntimeState(turnSeconds);

  expressApp.use(express.json({ limit: '8kb' }));
  expressApp.use((err, _req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      res.status(400).type('text/plain').send('Malformed JSON request body.');
      return;
    }
    next(err);
  });
  expressApp.use('/assets', express.static(path.join(publicDir, 'assets')));
  expressApp.use('/client', express.static(publicDir));

  expressApp.get('/', (req, res) => {
    const role = normalizeBrowserRole(req.query.player);
    if (!role) {
      res.status(404).type('text/plain').send('Not found.');
      return;
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  expressApp.get('/:slot', async (req, res) => {
    const slotName = parseSlotPath(req.params.slot);
    if (!slotName) {
      res.status(404).type('text/plain').send('Not found.');
      return;
    }
    await handleGetPlayer(state, slotName, req, res);
  });

  expressApp.post('/:slot/:action', (req, res) => {
    const slotName = parseSlotPath(req.params.slot);
    if (!slotName) {
      res.status(404).type('text/plain').send('Not found.');
      return;
    }
    const action = req.params.action;
    if (action === 'join') return handlePostJoin(state, slotName, req, res);
    if (action === 'ready') return handlePostReady(state, slotName, req, res);
    if (action === 'action') return handlePostAction(state, slotName, req, res);
    if (action === 'leave') return handlePostLeave(state, slotName, req, res);
    res.status(404).type('text/plain').send('Not found.');
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const role = normalizeBrowserRole(url.searchParams.get('player'));
    if (!role) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, { role });
    });
  });

  wss.on('connection', (ws, client) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.clientRole = client.role;
    if (client.role === SPECTATE_ROLE) state.spectators.add(ws);
    else if (client.role === ADMIN_ROLE) state.admins.add(ws);
    state.clients.add(ws);
    ws.on('message', (raw) => {
      try {
        handleWsMessage(state, ws, JSON.parse(raw.toString()));
      } catch (error) {
        send(ws, { type: 'error', error: error.message });
      }
    });
    ws.on('close', () => {
      state.spectators.delete(ws);
      state.admins.delete(ws);
      state.clients.delete(ws);
    });
    setTimeout(() => pushStateTo(ws, state), 10);
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
        send(ws, { type: 'heartbeat', t: Date.now() });
      } catch {}
    }
  }, HEARTBEAT_INTERVAL_MS);

  return {
    app: expressApp,
    server,
    state,
    get port() {
      return server.address()?.port;
    },
    listen(port = Number(process.env.PORT || 4178)) {
      return new Promise((resolve) => {
        server.listen(port, () => resolve(this));
      });
    },
    close() {
      clearInterval(heartbeat);
      stopTurnTimer(state);
      cancelNextRound(state);
      state.emitter.emit('change');
      for (const ws of state.clients) ws.close();
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function createRuntimeState(turnSeconds) {
  const series = createSeries();
  return {
    turnSeconds,
    phase: 'pre_lobby',
    bestOf: 1,
    series,
    slots: {
      player_1: { name: null, ready: false, briefingShown: false },
      player_2: { name: null, ready: false, briefingShown: false },
    },
    spectators: new Set(),
    admins: new Set(),
    clients: new Set(),
    pendingActions: new Map(),
    lastActionThoughts: { blue: null, red: null },
    invalidAttemptsThisTurn: { blue: 0, red: 0 },
    timedOutLastTurn: { blue: false, red: false },
    paused: false,
    turnStartedAt: null,
    pausedAt: null,
    remainingWhenPaused: turnSeconds,
    timer: null,
    trashTalk: { player_1: null, player_2: null },
    nextRoundAt: null,
    nextRoundTimer: null,
    emitter: new EventEmitter(),
  };
}

const NEXT_ROUND_DELAY_MS = 10000;
const TRASH_TALK_MAX = 200;

const SLOT_PATH_TO_NAME = { player1: 'player_1', player2: 'player_2' };

function parseSlotPath(slot) {
  return SLOT_PATH_TO_NAME[slot] ?? null;
}

function slotPath(slotName) {
  return slotName === 'player_1' ? 'player1' : 'player2';
}

function sideFor(state, slotName) {
  return state.series.currentGame.slotSides[slotName];
}

function notifyChange(state) {
  state.emitter.emit('change');
  for (const ws of state.clients) {
    if (ws.readyState === ws.OPEN) pushStateTo(ws, state);
  }
}

function waitForChange(state, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const onChange = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      state.emitter.off('change', onChange);
      resolve();
    };
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      state.emitter.off('change', onChange);
      resolve();
    }, timeoutMs);
    state.emitter.on('change', onChange);
  });
}

function parseWaitMs(value) {
  if (value == null) return DEFAULT_WAIT_MS;
  const m = String(value)
    .trim()
    .match(/^(\d+)\s*(ms|s)?$/i);
  if (!m) return DEFAULT_WAIT_MS;
  const n = Number(m[1]);
  const unit = (m[2] ?? 's').toLowerCase();
  const ms = unit === 'ms' ? n : n * 1000;
  return Math.max(0, Math.min(MAX_WAIT_MS, ms));
}

function shouldBlockGet(state, slotName) {
  const slot = state.slots[slotName];
  if (!slot.name) return false;
  if (state.phase === 'pre_lobby' || state.phase === 'lobby') {
    if (!slot.ready) return false;
    return true;
  }
  if (state.phase === 'match') {
    if (state.paused) return true;
    const side = sideFor(state, slotName);
    if (state.pendingActions.has(side)) return true;
    return false;
  }
  if (state.phase === 'game_end') {
    if (slot.ready) return true;
    return false;
  }
  return false;
}

async function handleGetPlayer(state, slotName, req, res) {
  const nowait = String(req.query.nowait ?? '').toLowerCase() === 'true';
  const totalWait = nowait ? 0 : parseWaitMs(req.query.wait);
  const start = Date.now();
  while (true) {
    if (!shouldBlockGet(state, slotName)) break;
    const elapsed = Date.now() - start;
    if (elapsed >= totalWait) break;
    await waitForChange(state, totalWait - elapsed);
  }
  const text = renderForSlot(state, slotName, baseUrlFromReq(req));
  res.status(200).type('text/plain').send(text);
}

function baseUrlFromReq(req) {
  const proto = req.protocol || 'http';
  const host = req.headers.host || `localhost:${process.env.PORT || 4178}`;
  return `${proto}://${host}`;
}

function handlePostJoin(state, slotName, req, res) {
  const name = String(req.body?.name ?? '').trim();
  if (!name) {
    res.status(400).type('text/plain').send('A name is required to join. Provide {"name":"..."}.');
    return;
  }
  const slot = state.slots[slotName];
  if (slot.name && slot.name !== name) {
    res
      .status(409)
      .type('text/plain')
      .send(
        `Slot ${slotPath(slotName)} is already held by "${slot.name}". Try the other slot or POST /${slotPath(slotName)}/leave first.`,
      );
    return;
  }
  if (!slot.name) {
    slot.name = name;
    slot.ready = false;
    slot.briefingShown = false;
    state.series.playerNames[slotName] = name;
    state.series.currentGame.playerNames[slotName] = name;
    if (state.phase === 'pre_lobby') state.phase = 'lobby';
    notifyChange(state);
  }
  res
    .status(200)
    .type('text/plain')
    .send(`Joined ${slotPath(slotName)} as "${name}". GET /${slotPath(slotName)} for state.`);
}

function handlePostReady(state, slotName, req, res) {
  const slot = state.slots[slotName];
  if (!slot.name) {
    res
      .status(409)
      .type('text/plain')
      .send(`You haven't joined ${slotPath(slotName)} yet. POST /${slotPath(slotName)}/join first.`);
    return;
  }
  if (state.phase === 'game_end' && slot.ready) {
    res
      .status(409)
      .type('text/plain')
      .send(
        `You are already ready for the next game. Keep polling GET /${slotPath(slotName)} until the other player is ready and the next game starts.`,
      );
    return;
  }
  const trash = req.body?.trash_talk;
  const cleanedTrash = typeof trash === 'string' ? trash.replace(/\s+/g, ' ').trim().slice(0, TRASH_TALK_MAX) : '';
  if (state.phase === 'game_end' && !cleanedTrash) {
    res
      .status(400)
      .type('text/plain')
      .send(
        `trash_talk is required between games. Re-POST with body {"trash_talk":"<a one-liner spoken DIRECTLY to your opponent (second person) - meme-able, quotable, hilarious>"} (max ${TRASH_TALK_MAX} chars).`,
      );
    return;
  }
  slot.ready = true;
  if (cleanedTrash) {
    state.trashTalk[slotName] = cleanedTrash;
  }
  if (state.slots.player_1.ready && state.slots.player_2.ready) {
    if (state.phase === 'game_end') {
      scheduleNextRound(state);
    } else if (state.phase === 'pre_lobby' || state.phase === 'lobby') {
      beginNextMatch(state);
    }
  }
  notifyChange(state);
  res
    .status(200)
    .type('text/plain')
    .send(`Ready. GET /${slotPath(slotName)} to wait for the match to start.`);
}

function scheduleNextRound(state) {
  if (state.nextRoundTimer) clearTimeout(state.nextRoundTimer);
  state.nextRoundAt = Date.now() + NEXT_ROUND_DELAY_MS;
  state.nextRoundTimer = setTimeout(() => {
    state.nextRoundTimer = null;
    state.nextRoundAt = null;
    if (state.phase === 'game_end' && state.slots.player_1.ready && state.slots.player_2.ready) {
      beginNextMatch(state);
      notifyChange(state);
    }
  }, NEXT_ROUND_DELAY_MS);
}

function cancelNextRound(state) {
  if (state.nextRoundTimer) clearTimeout(state.nextRoundTimer);
  state.nextRoundTimer = null;
  state.nextRoundAt = null;
}

function beginNextMatch(state) {
  const previousPhase = state.phase;
  const replayRequired = state.series.currentGame.replayRequired;
  cancelNextRound(state);
  state.trashTalk = { player_1: null, player_2: null };
  state.phase = 'match';
  state.series.bestOf = state.bestOf;
  state.series.format = `BO${state.bestOf}`;
  state.series.playerNames = {
    player_1: state.slots.player_1.name,
    player_2: state.slots.player_2.name,
  };
  if (previousPhase === 'game_end' && !replayRequired) {
    state.series.startNextGame();
  } else {
    state.series.restartCurrentGame();
  }
  state.pendingActions.clear();
  state.lastActionThoughts = { blue: null, red: null };
  state.timedOutLastTurn = { blue: false, red: false };
  const game = state.series.currentGame;
  appendMatchLog(game.matchId, {
    type: 'game_start',
    match_id: game.matchId,
    game_number: game.gameNumber,
    best_of: state.bestOf,
    player_names: { ...game.playerNames },
    slot_sides: { ...game.slotSides },
    map_id: game.map.id,
    ruleset_version: game.rulesetVersion,
  });
  startTurnTimer(state);
}

function handlePostAction(state, slotName, req, res) {
  const slot = state.slots[slotName];
  if (!slot.name) {
    res
      .status(409)
      .type('text/plain')
      .send(`You haven't joined ${slotPath(slotName)} yet.`);
    return;
  }
  if (state.paused) {
    res.status(423).type('text/plain').send('Match is paused.');
    return;
  }
  if (state.phase !== 'match') {
    res.status(409).type('text/plain').send(`Match is not running (phase=${state.phase}).`);
    return;
  }

  const side = sideFor(state, slotName);
  if (state.timedOutLastTurn[side]) {
    state.timedOutLastTurn[side] = false;
    const view = renderForSlot(state, slotName, baseUrlFromReq(req));
    res
      .status(409)
      .type('text/plain')
      .send(
        `You missed your previous turn (turn timer expired) - the server applied WAIT for you. Your incoming action has been discarded; review the latest state below and re-submit a fresh action for the current turn.\n\n----- LATEST STATE -----\n${view}`,
      );
    return;
  }

  const body = req.body ?? {};
  const intent = capWords(String(body.intent ?? '').trim(), 20);
  if (!intent) {
    res
      .status(400)
      .type('text/plain')
      .send(
        'intent is required. Provide a one-line spectator commentary (max 20 words) that names the action, is addressed to the SPECTATOR (third person about your opponent, NOT to them), and aims meme-able / quotable / hilarious. Example body: {"action":"...","intent":"<your spectator quip>"}.',
      );
    return;
  }
  const game = state.series.currentGame;
  const existing = state.pendingActions.get(side);
  let translated;
  try {
    translated = translateAction(game, side, body, intent);
  } catch (error) {
    if (existing) {
      res
        .status(409)
        .type('text/plain')
        .send(`A different action is already pending this turn: ${describeAction(existing)}. Wait for the next turn.`);
      return;
    }
    handleInvalidAction(state, side, { action_type: ACTIONS.WAIT, intent_summary: intent }, error.message, res);
    return;
  }

  if (existing) {
    if (sameAction(existing, translated)) {
      res
        .status(200)
        .type('text/plain')
        .send(`Action already submitted: ${describeAction(existing)}.`);
      return;
    }
    res
      .status(409)
      .type('text/plain')
      .send(`A different action is already pending this turn: ${describeAction(existing)}. Wait for the next turn.`);
    return;
  }

  const validation = validateAction(game, side, translated, { playerVisible: true });
  if (!validation.valid) {
    handleInvalidAction(state, side, translated, validation.error, res);
    return;
  }

  state.pendingActions.set(side, translated);
  if (translated.intent_summary) state.lastActionThoughts[side] = translated.intent_summary;
  maybeResolveTurn(state);
  notifyChange(state);
  res
    .status(200)
    .type('text/plain')
    .send(`Action accepted: ${describeAction(translated)}.`);
}

function handleInvalidAction(state, side, action, error, res) {
  state.invalidAttemptsThisTurn[side] += 1;
  if (state.invalidAttemptsThisTurn[side] >= 2) {
    const wait = { action_type: ACTIONS.WAIT, intent_summary: action.intent_summary };
    state.pendingActions.set(side, wait);
    maybeResolveTurn(state);
    notifyChange(state);
    res
      .status(200)
      .type('text/plain')
      .send(`Second invalid action this turn (${error}). You are locked as WAIT for the turn.`);
    return;
  }
  res
    .status(400)
    .type('text/plain')
    .send(`Invalid action: ${error}. You may retry once more this turn before being locked as WAIT.`);
}

function handlePostLeave(state, slotName, _req, res) {
  const slot = state.slots[slotName];
  if (!slot.name) {
    res.status(200).type('text/plain').send('Slot is already empty.');
    return;
  }
  const side = sideFor(state, slotName);
  slot.name = null;
  slot.ready = false;
  slot.briefingShown = false;
  if (side) state.timedOutLastTurn[side] = false;
  if (state.phase === 'match') pause(state);
  cancelNextRound(state);
  state.series.playerNames[slotName] = `Player ${slotName === 'player_1' ? '1' : '2'}`;
  state.series.currentGame.playerNames[slotName] = state.series.playerNames[slotName];
  notifyChange(state);
  res
    .status(200)
    .type('text/plain')
    .send(`Slot ${slotPath(slotName)} released.`);
}

// ---- action translation ------------------------------------------------------

function translateAction(game, side, body, intent) {
  const action = String(body.action ?? '').toUpperCase();
  if (!action) throw new Error('action is required');
  const intent_summary = intent;
  if (action === 'WAIT') return { action_type: ACTIONS.WAIT, intent_summary };
  if (action === 'GUARD') return { action_type: ACTIONS.GUARD, intent_summary };
  if (action === 'HEAL') return { action_type: ACTIONS.HEAL, intent_summary };
  if (action === 'SCAN') return { action_type: ACTIONS.SCAN, intent_summary };
  if (action === 'DROP_RELIC') return { action_type: ACTIONS.DROP_RELIC, intent_summary };
  if (action === 'ATTACK') {
    return { action_type: ACTIONS.ATTACK, intent_summary };
  }
  if (action === 'PLACE_WALL' || action === 'PLACE_TRAP') {
    const target = upperCoord(body.target);
    return { action_type: action, target, intent_summary };
  }
  if (action === 'MOVE' || action === 'DASH') {
    const target = upperCoord(body.target);
    const player = game.players[side];
    const dir = directionBetween(player.position, target, action === 'DASH' ? 2 : 1);
    return { action_type: `${action}_${dir}`, intent_summary };
  }
  throw new Error(`unknown action "${body.action}"`);
}

function capWords(value, maxWords) {
  return value.replace(/\s+/g, ' ').split(' ').filter(Boolean).slice(0, maxWords).join(' ');
}

function upperCoord(value) {
  if (value == null) throw new Error('target coordinate is required');
  const s = String(value).trim().toUpperCase();
  if (!/^[A-I][1-9]$/.test(s)) throw new Error(`bad coordinate "${value}"`);
  return s;
}

function directionBetween(from, to, steps) {
  const fc = from.charCodeAt(0);
  const fr = Number(from[1]);
  const tc = to.charCodeAt(0);
  const tr = Number(to[1]);
  const dc = tc - fc;
  const dr = tr - fr;
  if (dc !== 0 && dr !== 0) throw new Error(`target ${to} is not in a cardinal direction from ${from}`);
  if (dc === 0 && dr === 0) throw new Error(`target ${to} is the same tile as ${from}`);
  if (dc === 0) {
    if (Math.abs(dr) !== steps) throw new Error(`target ${to} is not ${steps} tile(s) away from ${from}`);
    return dr < 0 ? 'NORTH' : 'SOUTH';
  }
  if (Math.abs(dc) !== steps) throw new Error(`target ${to} is not ${steps} tile(s) away from ${from}`);
  return dc < 0 ? 'WEST' : 'EAST';
}

function sameAction(a, b) {
  return a.action_type === b.action_type && (a.target ?? null) === (b.target ?? null);
}

function describeAction(a) {
  if (a.target) return `${a.action_type} ${a.target}`;
  return a.action_type;
}

// ---- text rendering ----------------------------------------------------------

function renderForSlot(state, slotName, baseUrl = `http://localhost:${process.env.PORT || 4178}`) {
  const slot = state.slots[slotName];
  const opponentSlot = slotName === 'player_1' ? 'player_2' : 'player_1';
  const sideUpper = (
    state.series.currentGame.slotSides[slotName] ?? (slotName === 'player_1' ? 'blue' : 'red')
  ).toUpperCase();
  const lines = [];
  lines.push(`=== TRIAL BY COMBAT - ${slotPath(slotName)} (${sideUpper}) ===`);

  if (!slot.name) {
    lines.push('Phase: pre_lobby');
    lines.push('');
    lines.push(renderBriefing());
    lines.push('');
    lines.push('DO NEXT:');
    lines.push(`  curl -X POST ${baseUrl}/${slotPath(slotName)}/join \\`);
    lines.push(`       -H 'Content-Type: application/json' \\`);
    lines.push(`       -d '{"name":"YOUR NAME"}'`);
    return lines.join('\n');
  }

  if (state.phase === 'pre_lobby' || state.phase === 'lobby') {
    const oppSlot = state.slots[opponentSlot];
    lines.push(
      `Phase: lobby - opponent ${oppSlot.name ? `joined as "${oppSlot.name}"` : 'not joined'}, ready=${oppSlot.ready}`,
    );
    lines.push('');
    lines.push('DO NEXT:');
    if (!slot.ready) {
      lines.push(`  curl -X POST ${baseUrl}/${slotPath(slotName)}/ready`);
    } else {
      lines.push(`  curl ${baseUrl}/${slotPath(slotName)}`);
      lines.push('  (re-poll; returns when the match starts)');
    }
    return lines.join('\n');
  }

  if (state.phase === 'series_end') {
    lines.push(
      `Phase: series_end - BO${state.bestOf} final ${state.series.score.player_1}-${state.series.score.player_2}`,
    );
    const winnerSlot = state.series.seriesWinner;
    lines.push(
      `Series winner: ${winnerSlot ? `${slotPath(winnerSlot)} ("${state.series.playerNames[winnerSlot]}")` : 'tie/undecided'}.`,
    );
    lines.push('');
    lines.push('DO NEXT:');
    lines.push('  (series is over; ask the operator to restart from the admin console, then re-join.)');
    return lines.join('\n');
  }

  if (state.phase === 'game_end') {
    const game = state.series.currentGame;
    lines.push(`Phase: game_end - Game ${state.series.gameNumber} of BO${state.bestOf}`);
    if (game.winner) {
      lines.push(`Result: ${game.winner.toUpperCase()} wins.`);
    } else if (game.replayRequired) {
      lines.push('Result: turn cap reached - game replays without counting toward the series.');
    }
    lines.push(`Series: ${state.series.score.player_1}-${state.series.score.player_2}`);
    lines.push('');
    lines.push('DO NEXT:');
    if (slot.ready) {
      const oppReady = state.slots[opponentSlot]?.ready;
      lines.push(`  You are READY for game ${state.series.gameNumber + 1}. Opponent ready=${oppReady ? 'yes' : 'no'}.`);
      lines.push(`  curl ${baseUrl}/${slotPath(slotName)}`);
      lines.push('  (re-poll; returns when the next game starts. KEEP POLLING until the series ends.)');
    } else {
      lines.push(`  curl -X POST ${baseUrl}/${slotPath(slotName)}/ready \\`);
      lines.push(`       -H 'Content-Type: application/json' \\`);
      lines.push(`       -d '{"trash_talk":"<your one-liner here>"}'`);
      lines.push(`  trash_talk is REQUIRED (max ${TRASH_TALK_MAX} chars).`);
      lines.push(`  Speak DIRECTLY to your opponent in second person ("you", not "they").`);
      lines.push(`  Aim for meme-able, quotable, hilarious one-liners that spectators will want to screenshot.`);
    }
    return lines.join('\n');
  }

  // Match phase
  const side = sideFor(state, slotName);
  const game = state.series.currentGame;
  const view = getPlayerView(game, side, getTimerSecondsRemaining(state));
  const timerStr = view.turn_timer_seconds_remaining != null ? `${view.turn_timer_seconds_remaining}s` : '-';
  lines.push(
    `Phase: match - Game ${state.series.gameNumber} of BO${state.bestOf} - Turn ${view.turn} - Timer ${timerStr}`,
  );

  if (state.paused) {
    lines.push('Status: PAUSED by operator.');
    lines.push('');
    lines.push('DO NEXT:');
    lines.push(`  curl ${baseUrl}/${slotPath(slotName)}`);
    lines.push('  (re-poll; returns when the match resumes)');
    return lines.join('\n');
  }

  // YOU
  const inv = view.you.inventory;
  const yourName = state.series.playerNames[slotName] ?? slot.name ?? slotPath(slotName);
  const oppName = state.series.playerNames[opponentSlot] ?? state.slots[opponentSlot]?.name ?? slotPath(opponentSlot);
  lines.push(
    `YOU ("${yourName}", ${side.toUpperCase()}):    ${view.you.position}  HP ${view.you.health}/${view.you.max_health}  carrying_relic=${view.you.carrying_relic ? 'yes' : 'no'}  stunned=${view.you.stunned ? 'yes' : 'no'}${view.you.stun_skip_next_turn ? '  trap_stun=yes (must WAIT)' : ''}`,
  );
  lines.push(
    `                inv: walls=${inv.wall} traps=${inv.trap} scans=${inv.scan} dashes=${inv.dash} heals=${inv.heal}`,
  );
  // OPPONENT
  if (view.opponent.visible) {
    lines.push(
      `OPPONENT ("${oppName}", ${oppSide(side).toUpperCase()}): ${view.opponent.position}  HP ${view.opponent.health ?? '?'}/10  carrying_relic=${view.opponent.carrying_relic ? 'yes' : 'no'}`,
    );
  } else {
    lines.push(`OPPONENT ("${oppName}", ${oppSide(side).toUpperCase()}): hidden`);
  }
  lines.push(`RELIC: ${describeRelic(view.relic)}`);
  lines.push(`SERIES: ${state.series.score.player_1}-${state.series.score.player_2}`);
  lines.push('');

  // BOARD
  lines.push('BOARD:');
  lines.push(...drawGrid(game, side, view).map((l) => `  ${l}`));
  lines.push('Legend: . floor  X wall  # bush  ^ fire  * relic-on-ground');
  lines.push('        B blue  R red  b blue base  r red base');
  lines.push('        T your trap  t scanned enemy trap');
  lines.push('        D dash-pack buff  + big-heal buff');
  lines.push(`Bases: blue=${game.map.bases.blue.join(',')}  red=${game.map.bases.red.join(',')}`);
  if (view.known_tiles.buffs?.length) {
    lines.push('BUFFS:');
    for (const b of view.known_tiles.buffs) {
      const effect = b.type === 'dash_pack' ? '+3 dash charges (cap 5)' : 'restore HP to full';
      lines.push(`  ${b.coord}  ${b.type}  - ${effect}`);
    }
  }
  lines.push('');

  // RECENT EVENTS
  const events = view.last_events_visible_to_you ?? [];
  if (events.length) {
    lines.push(`RECENT EVENTS (last ${events.length}):`);
    for (const event of events) lines.push(`  ${event}`);
    lines.push('');
  }

  if (state.pendingActions.has(side)) {
    const submitted = state.pendingActions.get(side);
    lines.push(`Status: waiting for ${oppSide(side).toUpperCase()}.`);
    lines.push(`You submitted ${describeAction(submitted)} ("${submitted.intent_summary ?? ''}") at T${view.turn}.`);
    lines.push('');
    lines.push('DO NEXT:');
    lines.push(`  curl ${baseUrl}/${slotPath(slotName)}`);
    lines.push('  (re-poll; returns when it is your turn again or the game ends)');
    return lines.join('\n');
  }

  // LEGAL ACTIONS
  lines.push('LEGAL ACTIONS:');
  lines.push(...legalActionLines(game, side));
  lines.push('');

  lines.push('DO NEXT:');
  lines.push(
    `  Before choosing, predict "${oppName}"'s most likely action this turn (movement is simultaneous, not reactive) and pick the response that beats it.`,
  );
  lines.push(`  curl -X POST ${baseUrl}/${slotPath(slotName)}/action \\`);
  lines.push(`       -H 'Content-Type: application/json' \\`);
  lines.push(`       -d '{"action":"WAIT","intent":"<your spectator quip>"}'`);
  lines.push('  intent: a one-line spectator commentary (max 20 words) that');
  lines.push('    - explicitly names the action you are submitting this turn,');
  lines.push('    - is addressed to the SPECTATOR (third person about your opponent), NOT to the opponent,');
  lines.push(`    - refers to players by NAME ("${yourName}" / "${oppName}"), not by side ("blue" / "red"),`);
  lines.push('    - aims for meme-able, quotable, hilarious lines spectators will want to screenshot.');
  return lines.join('\n');
}

function oppSide(side) {
  return side === 'blue' ? 'red' : 'blue';
}

function describeRelic(relic) {
  if (relic.status === 'carried_by_you') return 'carried by you';
  if (relic.status === 'carried_by_opponent') return 'carried by opponent';
  if (relic.status === 'free') return `at ${relic.position}`;
  if (relic.status === 'unknown') {
    return relic.last_known_position ? `unknown (last seen at ${relic.last_known_position})` : 'unknown';
  }
  return relic.status;
}

function drawGrid(game, side, view) {
  const lines = [];
  lines.push('     A B C D E F G H I');
  lines.push('   +-------------------+');
  for (let row = 1; row <= BOARD_SIZE; row += 1) {
    const cells = [];
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const coord = `${String.fromCharCode(65 + col)}${row}`;
      cells.push(cellSymbol(coord, game, side, view));
    }
    lines.push(` ${row} | ${cells.join(' ')} |`);
  }
  lines.push('   +-------------------+');
  return lines;
}

function cellSymbol(coord, game, side, view) {
  const oppSideName = oppSide(side);
  if (view.you.position === coord) return side === 'blue' ? 'B' : 'R';
  if (view.opponent.visible && view.opponent.position === coord) return oppSideName === 'blue' ? 'B' : 'R';
  if (view.relic.status === 'free' && view.relic.position === coord) return '*';
  if (view.known_tiles.own_traps.includes(coord)) return 'T';
  if (view.known_tiles.known_enemy_traps.includes(coord)) return 't';
  if (view.known_tiles.walls.includes(coord)) return 'X';
  if (view.known_tiles.bushes.includes(coord)) return '#';
  if (view.known_tiles.fire.includes(coord)) return '^';
  const buff = view.known_tiles.buffs?.find((b) => b.coord === coord);
  if (buff) return buff.type === 'dash_pack' ? 'D' : '+';
  if (game.map.bases.blue.includes(coord)) return 'b';
  if (game.map.bases.red.includes(coord)) return 'r';
  return '.';
}

function legalActionLines(game, side) {
  const legal = getLegalActions(game, side, { playerVisible: true });
  const groups = { simple: [], moves: [], dashes: [], attacks: [], placeWall: [], placeTrap: [] };
  for (const action of legal) {
    const t = action.action_type;
    if (
      t === ACTIONS.WAIT ||
      t === ACTIONS.GUARD ||
      t === ACTIONS.HEAL ||
      t === ACTIONS.SCAN ||
      t === ACTIONS.DROP_RELIC
    ) {
      groups.simple.push(t);
    } else if (t.startsWith('MOVE_')) {
      groups.moves.push(moveTarget(game.players[side].position, t, 1));
    } else if (t.startsWith('DASH_')) {
      groups.dashes.push(moveTarget(game.players[side].position, t, 2));
    } else if (t === ACTIONS.ATTACK) {
      groups.attacks.push('ATTACK');
    } else if (t === ACTIONS.PLACE_WALL) {
      groups.placeWall.push(action.target);
    } else if (t === ACTIONS.PLACE_TRAP) {
      groups.placeTrap.push(action.target);
    }
  }
  const out = [];
  if (groups.simple.length) out.push(`  ${groups.simple.join('  ')}`);
  if (groups.moves.length) out.push(`  ${groups.moves.map((c) => `MOVE ${c}`).join(' | ')}`);
  if (groups.dashes.length) out.push(`  ${groups.dashes.map((c) => `DASH ${c}`).join(' | ')}`);
  if (groups.attacks.length) out.push(`  ${groups.attacks.join(' | ')}`);
  if (groups.placeWall.length) out.push(`  ${groups.placeWall.map((c) => `PLACE_WALL ${c}`).join(' | ')}`);
  if (groups.placeTrap.length) out.push(`  ${groups.placeTrap.map((c) => `PLACE_TRAP ${c}`).join(' | ')}`);
  return out;
}

function moveTarget(from, actionType, steps) {
  const dir = actionType.split('_')[1];
  const fc = from.charCodeAt(0);
  const fr = Number(from[1]);
  const dc = dir === 'EAST' ? steps : dir === 'WEST' ? -steps : 0;
  const dr = dir === 'SOUTH' ? steps : dir === 'NORTH' ? -steps : 0;
  return `${String.fromCharCode(fc + dc)}${fr + dr}`;
}

function renderBriefing() {
  const lines = [];
  lines.push('GAME RULES');
  lines.push('');
  lines.push(`Goal: ${RULES.goal}`);
  lines.push('');
  if (RULES.decisionTip) {
    lines.push(`How to think each turn: ${RULES.decisionTip}`);
    lines.push('');
  }
  lines.push('Each turn resolves in this order:');
  for (const [i, step] of RULES.resolutionOrder.entries()) {
    lines.push(`  ${i + 1}. ${step.label}: ${step.detail}`);
  }
  lines.push('');
  lines.push('Actions:');
  for (const group of RULES.actionGroups) {
    lines.push(`  ${group.title}:`);
    for (const item of group.items) {
      lines.push(`    ${item.name.toUpperCase().replace(/\s+/g, '_')}: ${item.effect}`);
    }
  }
  lines.push('');
  lines.push('Submitting actions (every action is a separate POST body; intent is required, capped at 20 words):');
  lines.push('  - {"action":"MOVE","target":"<adjacent tile>","intent":"..."}');
  lines.push('  - {"action":"DASH","target":"<two tiles away in one cardinal direction>","intent":"..."}');
  lines.push('  - {"action":"ATTACK","intent":"..."}');
  lines.push('  - {"action":"GUARD","intent":"..."}');
  lines.push('  - {"action":"HEAL","intent":"..."}');
  lines.push('  - {"action":"SCAN","intent":"..."}');
  lines.push('  - {"action":"DROP_RELIC","intent":"..."}');
  lines.push('  - {"action":"WAIT","intent":"..."}');
  lines.push('  - {"action":"PLACE_WALL","target":"<adjacent empty tile, orthogonal or diagonal>","intent":"..."}');
  lines.push('  - {"action":"PLACE_TRAP","target":"<adjacent empty tile, orthogonal or diagonal>","intent":"..."}');
  lines.push('  intent: a one-line spectator commentary (max 20 words) that');
  lines.push('    - explicitly names the action you are submitting this turn,');
  lines.push('    - is addressed to the SPECTATOR (third person about your opponent), NOT to the opponent,');
  lines.push(
    '    - refers to players by their NAMES, not by side ("blue" / "red") - sides are an internal color, names are what spectators see,',
  );
  lines.push('    - aims for meme-able, quotable, hilarious lines spectators will want to screenshot.');
  lines.push('');
  lines.push('Tiles:');
  for (const tile of RULES.tiles) lines.push(`  ${tile.name}: ${tile.effect}`);
  lines.push('');
  const inv = RULES.startingInventory.map((i) => `${i.count}x ${i.kind}`).join(', ');
  lines.push(`Starting inventory: ${inv}. Use these items strategically to your advantage.`);
  lines.push(RULES.health.summary);
  lines.push('');
  lines.push('Common mistakes:');
  for (const g of RULES.gotchas) lines.push(`  - ${g}`);
  lines.push('');
  lines.push(
    `Between games: when readying up after a game ends, trash_talk is REQUIRED (max ${TRASH_TALK_MAX} chars) and shown to spectators on the round-end screen. Speak DIRECTLY to your opponent in second person ("you", not "they") - aim for meme-able, quotable, hilarious one-liners that spectators will want to screenshot.`,
  );
  lines.push('');
  lines.push(
    `LOOP CONTRACT: Keep polling your GET endpoint until phase=series_end. After you ready up between games, the GET will long-poll and only return once the next game starts - do NOT stop your loop because there is no immediate action. "Already ready, waiting for opponent" is not a terminal state.`,
  );
  return lines.join('\n');
}

// ---- match lifecycle ---------------------------------------------------------

function maybeResolveTurn(state) {
  if (!state.pendingActions.has('blue') || !state.pendingActions.has('red')) return;
  stopTurnTimer(state);
  const submittedActions = {
    blue: state.pendingActions.get('blue'),
    red: state.pendingActions.get('red'),
  };
  const preTurn = state.series.currentGame.turn;
  const { game, events, actions: resolvedActions } = resolveTurn(state.series.currentGame, submittedActions);
  state.series.currentGame = game;
  state.pendingActions.clear();
  state.invalidAttemptsThisTurn = { blue: 0, red: 0 };
  appendMatchLog(game.matchId, {
    type: 'turn',
    match_id: game.matchId,
    game_number: game.gameNumber,
    turn: preTurn,
    submitted_actions: submittedActions,
    resolved_actions: resolvedActions,
    timed_out: { ...state.timedOutLastTurn },
    events: events.map((e) => ({
      seq: e.seq,
      event_type: e.event_type,
      visibility: e.visibility,
      actor: e.actor,
      summary: e.summary,
      meta: e.meta ?? null,
    })),
    health: { blue: game.players.blue.health, red: game.players.red.health },
    positions: { blue: game.players.blue.position, red: game.players.red.position },
    relic: { position: game.relic.position, carried_by: game.relic.carriedBy },
  });
  if (game.winningSlot) state.series.recordGame(game.winningSlot);
  if (game.winner || game.replayRequired || state.series.decided) {
    state.phase = state.series.decided ? 'series_end' : 'game_end';
    game.phase = state.phase;
    if (state.phase === 'game_end') {
      state.slots.player_1.ready = false;
      state.slots.player_2.ready = false;
      state.trashTalk = { player_1: null, player_2: null };
    }
    appendMatchLog(game.matchId, {
      type: 'game_end',
      match_id: game.matchId,
      game_number: game.gameNumber,
      winner_side: game.winner,
      winner_slot: game.winningSlot,
      replay_required: game.replayRequired,
      series_decided: state.series.decided,
      series_score: { ...state.series.score },
      total_turns: game.turn,
    });
  } else {
    startTurnTimer(state);
  }
}

function startTurnTimer(state) {
  stopTurnTimer(state);
  state.paused = false;
  state.turnStartedAt = Date.now();
  state.remainingWhenPaused = state.turnSeconds;
  state.timer = setTimeout(() => onTurnTimeout(state), state.turnSeconds * 1000);
}

function onTurnTimeout(state) {
  for (const side of ['blue', 'red']) {
    if (!state.pendingActions.has(side)) {
      state.pendingActions.set(side, { action_type: ACTIONS.WAIT, timed_out: true });
      state.timedOutLastTurn[side] = true;
    }
  }
  maybeResolveTurn(state);
  notifyChange(state);
}

function stopTurnTimer(state) {
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

function pause(state) {
  if (state.paused || state.phase !== 'match') return;
  const remaining = getTimerSecondsRemaining(state);
  stopTurnTimer(state);
  state.paused = true;
  state.pausedAt = Date.now();
  state.remainingWhenPaused = remaining;
}

function resume(state) {
  if (!state.paused) return;
  state.paused = false;
  state.turnStartedAt = Date.now() - (state.turnSeconds - state.remainingWhenPaused) * 1000;
  state.timer = setTimeout(() => onTurnTimeout(state), state.remainingWhenPaused * 1000);
}

function restartSeries(state) {
  stopTurnTimer(state);
  cancelNextRound(state);
  state.trashTalk = { player_1: null, player_2: null };
  state.phase = 'pre_lobby';
  state.series = createSeries({
    bestOf: state.bestOf,
    playerNames: {
      player_1: state.slots.player_1.name ?? 'Player 1',
      player_2: state.slots.player_2.name ?? 'Player 2',
    },
  });
  state.slots.player_1.ready = false;
  state.slots.player_2.ready = false;
  state.pendingActions.clear();
  state.lastActionThoughts = { blue: null, red: null };
  state.timedOutLastTurn = { blue: false, red: false };
  state.paused = false;
}

// ---- WS for spectator/admin --------------------------------------------------

function handleWsMessage(state, ws, message) {
  if (!message || typeof message.type !== 'string') throw new Error('Message type is required.');
  if (message.type === 'admin') {
    handleAdmin(state, ws, message.action, message);
  } else if (message.type === 'set_xray') {
    ws.xray = Boolean(message.xray);
    pushStateTo(ws, state);
  } else {
    throw new Error(`Unknown message type ${message.type}`);
  }
}

function handleAdmin(state, ws, action, message) {
  if (!state.admins.has(ws)) throw new Error('Only admin clients can use admin controls.');
  if (action === 'set_series_length') {
    const bestOf = Number(message.bestOf);
    if (![1, 3, 5, 7].includes(bestOf)) throw new Error('Series length must be 1, 3, 5, or 7.');
    if (state.slots.player_1.ready && state.slots.player_2.ready) throw new Error('Series length is locked.');
    state.bestOf = bestOf;
    state.series = createSeries({
      bestOf,
      playerNames: {
        player_1: state.slots.player_1.name ?? 'Player 1',
        player_2: state.slots.player_2.name ?? 'Player 2',
      },
    });
  } else if (action === 'pause') {
    pause(state);
  } else if (action === 'resume') {
    resume(state);
  } else if (action === 'restart_game') {
    cancelNextRound(state);
    state.trashTalk = { player_1: null, player_2: null };
    state.series.restartCurrentGame();
    state.pendingActions.clear();
    state.lastActionThoughts = { blue: null, red: null };
    state.timedOutLastTurn = { blue: false, red: false };
    startTurnTimer(state);
  } else if (action === 'restart_series') {
    restartSeries(state);
  } else if (action === 'next_game') {
    if (!state.series.decided) {
      cancelNextRound(state);
      state.trashTalk = { player_1: null, player_2: null };
      state.series.startNextGame();
      state.slots.player_1.ready = false;
      state.slots.player_2.ready = false;
      state.phase = 'lobby';
      stopTurnTimer(state);
      state.pendingActions.clear();
      state.lastActionThoughts = { blue: null, red: null };
      state.timedOutLastTurn = { blue: false, red: false };
    }
  } else {
    throw new Error(`Unknown admin action ${action}`);
  }
  notifyChange(state);
}

function pushStateTo(ws, state) {
  const role = ws.clientRole;
  const payload = baseRuntimePayload(state);
  if (role === SPECTATE_ROLE) {
    send(ws, {
      type: 'state',
      role,
      state: {
        ...getSpectatorView(state.series.currentGame, {
          xray: Boolean(ws.xray),
          timerSecondsRemaining: getTimerSecondsRemaining(state),
          actionStatuses: playerActionStatuses(state),
          actionThoughts: playerActionThoughts(state),
        }),
        phase: state.phase,
        paused: state.paused,
        match: payload.match,
        lobby: payload.lobby,
        trash_talk: { ...state.trashTalk },
        next_round_at: state.nextRoundAt,
      },
    });
  } else if (role === ADMIN_ROLE) {
    send(ws, {
      type: 'state',
      role,
      state: {
        ...payload,
        phase: state.phase,
        paused: state.paused,
        current_game: getSpectatorView(state.series.currentGame, {
          xray: true,
          timerSecondsRemaining: getTimerSecondsRemaining(state),
          actionStatuses: playerActionStatuses(state),
          actionThoughts: playerActionThoughts(state),
        }),
      },
    });
  }
}

function baseRuntimePayload(state) {
  return {
    match: {
      format: `BO${state.bestOf}`,
      best_of: state.bestOf,
      game_number: state.series.gameNumber,
      score: { ...state.series.score },
      decided: state.series.decided,
      series_winner: state.series.seriesWinner,
    },
    lobby: {
      slots: {
        player_1: publicSlot(state.slots.player_1),
        player_2: publicSlot(state.slots.player_2),
      },
      series_locked: state.slots.player_1.ready && state.slots.player_2.ready,
    },
    diagnostics: {
      pending_actions: [...state.pendingActions.keys()],
      invalid_attempts: { ...state.invalidAttemptsThisTurn },
      connections: {
        spectators: state.spectators.size,
        admins: state.admins.size,
      },
    },
  };
}

function publicSlot(slot) {
  return {
    name: slot.name,
    ready: slot.ready,
    connected: Boolean(slot.name),
  };
}

function getTimerSecondsRemaining(state) {
  if (state.phase !== 'match') return null;
  if (state.paused) return state.remainingWhenPaused;
  if (!state.turnStartedAt) return state.turnSeconds;
  return Math.max(0, Math.ceil(state.turnSeconds - (Date.now() - state.turnStartedAt) / 1000));
}

function playerActionStatuses(state) {
  return {
    blue: state.pendingActions.has('blue') ? 'ready' : 'thinking',
    red: state.pendingActions.has('red') ? 'ready' : 'thinking',
  };
}

function playerActionThoughts(state) {
  return {
    blue: state.pendingActions.get('blue')?.intent_summary ?? state.lastActionThoughts.blue ?? null,
    red: state.pendingActions.get('red')?.intent_summary ?? state.lastActionThoughts.red ?? null,
  };
}

function normalizeBrowserRole(player) {
  const raw = String(player ?? SPECTATE_ROLE);
  if (raw === SPECTATE_ROLE || raw === ADMIN_ROLE) return raw;
  return null;
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appServer = createAppServer();
  appServer.listen().then(() => {
    console.log(`Trial by Combat listening on http://localhost:${appServer.port}`);
  });
}
