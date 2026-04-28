import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { WebSocketServer } from 'ws';

import { ACTIONS, createSeries, getPlayerView, getSpectatorView, resolveTurn, validateAction } from './engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const VALID_PLAYERS = new Set(['1', '2', 'spectate', 'admin']);

export function createAppServer({ turnSeconds = 60 } = {}) {
  const expressApp = express();
  const server = http.createServer(expressApp);
  const wss = new WebSocketServer({ noServer: true });
  const state = createRuntimeState(turnSeconds);

  expressApp.use('/assets', express.static(path.join(publicDir, 'assets')));
  expressApp.use('/client', express.static(publicDir));
  expressApp.get('/', (req, res) => {
    const role = normalizeHttpRole(req.query.player);
    if (!role) {
      res.status(400).type('html').send(errorPage('Unknown player route.'));
      return;
    }
    if ((role === 'player_1' || role === 'player_2') && !String(req.query.name ?? '').trim()) {
      res.status(400).type('html').send(errorPage('A name is required for player routes.'));
      return;
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const role = normalizeHttpRole(url.searchParams.get('player'));
    const name = String(url.searchParams.get('name') ?? '').trim();
    if (!role || ((role === 'player_1' || role === 'player_2') && !name)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, { role, name });
    });
  });

  wss.on('connection', (ws, client) => {
    registerClient(state, ws, client);
    ws.on('message', (raw) => {
      try {
        handleMessage(state, ws, JSON.parse(raw.toString()));
      } catch (error) {
        send(ws, { type: 'error', error: error.message });
      }
    });
    ws.on('close', () => unregisterClient(state, ws));
  });

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
      stopTurnTimer(state);
      for (const client of state.clients) client.ws.close();
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
      player_1: { ws: null, name: null, ready: false, connected: false },
      player_2: { ws: null, name: null, ready: false, connected: false },
    },
    spectators: new Set(),
    admins: new Set(),
    clients: new Set(),
    pendingActions: new Map(),
    invalidAttemptsThisTurn: { blue: 0, red: 0 },
    paused: false,
    turnStartedAt: null,
    pausedAt: null,
    remainingWhenPaused: turnSeconds,
    timer: null,
  };
}

function registerClient(state, ws, { role, name }) {
  const client = { ws, role, name };
  ws.clientRole = role;
  state.clients.add(client);
  if (role === 'player_1' || role === 'player_2') {
    const slot = state.slots[role];
    if (slot.ws && slot.ws.readyState === slot.ws.OPEN) {
      slot.ws.close(4001, 'Slot replaced by a new connection.');
    }
    slot.ws = ws;
    slot.name = name;
    slot.connected = true;
    if (state.phase === 'pre_lobby') state.phase = 'lobby';
    state.series.playerNames[role] = name;
    state.series.currentGame.playerNames[role] = name;
  } else if (role === 'spectate') {
    state.spectators.add(ws);
  } else if (role === 'admin') {
    state.admins.add(ws);
  }
  setTimeout(() => broadcastState(state), 10);
}

function unregisterClient(state, ws) {
  for (const client of state.clients) {
    if (client.ws === ws) state.clients.delete(client);
  }
  for (const slotName of ['player_1', 'player_2']) {
    const slot = state.slots[slotName];
    if (slot.ws === ws) {
      slot.ws = null;
      slot.connected = false;
    }
  }
  state.spectators.delete(ws);
  state.admins.delete(ws);
  broadcastState(state);
}

function handleMessage(state, ws, message) {
  if (!message || typeof message.type !== 'string') throw new Error('Message type is required.');
  if (message.type === 'ready') {
    handleReady(state, ws);
  } else if (message.type === 'submit_action') {
    handleSubmitAction(state, ws, message.action ?? {});
  } else if (message.type === 'admin') {
    handleAdmin(state, ws, message.action, message);
  } else if (message.type === 'set_xray') {
    ws.xray = Boolean(message.xray);
    pushStateTo(ws, state);
  } else {
    throw new Error(`Unknown message type ${message.type}`);
  }
}

function handleReady(state, ws) {
  const slotName = playerSlotForWs(state, ws);
  if (!slotName) throw new Error('Only players can ready.');
  state.slots[slotName].ready = true;
  if (state.slots.player_1.ready && state.slots.player_2.ready && state.phase !== 'match') {
    state.phase = 'match';
    state.series.bestOf = state.bestOf;
    state.series.format = `BO${state.bestOf}`;
    state.series.playerNames = {
      player_1: state.slots.player_1.name ?? 'Player 1',
      player_2: state.slots.player_2.name ?? 'Player 2',
    };
    state.series.restartCurrentGame();
    state.pendingActions.clear();
    startTurnTimer(state);
  }
  broadcastState(state);
}

function handleSubmitAction(state, ws, action) {
  if (state.paused) throw new Error('Game is paused.');
  if (state.phase !== 'match') throw new Error('Match is not running.');
  const slotName = playerSlotForWs(state, ws);
  if (!slotName) throw new Error('Only players can submit actions.');
  if (!String(action?.intent_summary ?? '').trim()) {
    send(ws, { type: 'validation_error', error: 'Thinking is required before submitting an action.', retry: true });
    return;
  }
  const side = state.series.currentGame.slotSides[slotName];
  const game = state.series.currentGame;
  const validation = validateAction(game, side, action, { playerVisible: true });
  if (!validation.valid) {
    state.invalidAttemptsThisTurn[side] += 1;
    if (state.invalidAttemptsThisTurn[side] >= 2) {
      state.pendingActions.set(side, { action_type: ACTIONS.WAIT });
      send(ws, { type: 'action_locked', action: { action_type: ACTIONS.WAIT }, reason: validation.error });
      maybeResolveTurn(state);
    } else {
      send(ws, { type: 'validation_error', error: validation.error, retry: true });
    }
    return;
  }
  state.pendingActions.set(side, sanitizeAction(action));
  send(ws, { type: 'action_locked', action: sanitizeAction(action) });
  maybeResolveTurn(state);
  broadcastState(state);
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
    state.series.restartCurrentGame();
    state.pendingActions.clear();
    startTurnTimer(state);
  } else if (action === 'restart_series') {
    restartSeries(state);
  } else if (action === 'next_game') {
    if (!state.series.decided) {
      state.series.startNextGame();
      state.slots.player_1.ready = false;
      state.slots.player_2.ready = false;
      state.phase = 'lobby';
      stopTurnTimer(state);
      state.pendingActions.clear();
    }
  } else {
    throw new Error(`Unknown admin action ${action}`);
  }
  broadcastState(state);
}

function maybeResolveTurn(state) {
  if (!state.pendingActions.has('blue') || !state.pendingActions.has('red')) return;
  stopTurnTimer(state);
  const { game } = resolveTurn(state.series.currentGame, {
    blue: state.pendingActions.get('blue'),
    red: state.pendingActions.get('red'),
  });
  state.series.currentGame = game;
  state.pendingActions.clear();
  state.invalidAttemptsThisTurn = { blue: 0, red: 0 };
  if (game.winningSlot) {
    state.series.recordGame(game.winningSlot);
  }
  if (game.winner || game.replayRequired || state.series.decided) {
    state.phase = state.series.decided ? 'series_end' : 'game_end';
    game.phase = state.phase;
  } else {
    startTurnTimer(state);
  }
}

function startTurnTimer(state) {
  stopTurnTimer(state);
  state.paused = false;
  state.turnStartedAt = Date.now();
  state.remainingWhenPaused = state.turnSeconds;
  state.timer = setTimeout(() => {
    for (const side of ['blue', 'red']) {
      if (!state.pendingActions.has(side)) state.pendingActions.set(side, { action_type: ACTIONS.WAIT });
    }
    maybeResolveTurn(state);
    broadcastState(state);
  }, state.turnSeconds * 1000);
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
  state.timer = setTimeout(() => {
    for (const side of ['blue', 'red']) {
      if (!state.pendingActions.has(side)) state.pendingActions.set(side, { action_type: ACTIONS.WAIT });
    }
    maybeResolveTurn(state);
    broadcastState(state);
  }, state.remainingWhenPaused * 1000);
}

function restartSeries(state) {
  stopTurnTimer(state);
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
  state.paused = false;
}

function pushStateTo(ws, state) {
  const role = ws.clientRole;
  const payload = baseRuntimePayload(state);
  if (role === 'player_1' || role === 'player_2') {
    const side = state.series.currentGame.slotSides[role];
    send(ws, {
      type: 'state',
      role,
      side,
      state: {
        ...getPlayerView(state.series.currentGame, side, getTimerSecondsRemaining(state)),
        phase: state.phase === 'match' ? state.series.currentGame.phase : state.phase,
        paused: state.paused,
        match: payload.match,
        lobby: payload.lobby,
        action_locked: state.pendingActions.has(side),
      },
    });
  } else if (role === 'spectate') {
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
      },
    });
  } else if (role === 'admin') {
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

function broadcastState(state) {
  for (const { ws } of state.clients) {
    if (ws.readyState === ws.OPEN) pushStateTo(ws, state);
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
        player_1: state.slots.player_1.connected,
        player_2: state.slots.player_2.connected,
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
    connected: slot.connected,
  };
}

function playerSlotForWs(state, ws) {
  if (state.slots.player_1.ws === ws) return 'player_1';
  if (state.slots.player_2.ws === ws) return 'player_2';
  return null;
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
    blue: state.pendingActions.get('blue')?.intent_summary ?? null,
    red: state.pendingActions.get('red')?.intent_summary ?? null,
  };
}

function sanitizeAction(action) {
  return {
    action_type: action.action_type,
    ...(action.target ? { target: String(action.target).toUpperCase() } : {}),
    ...(action.intent_summary
      ? { intent_summary: String(action.intent_summary).split(/\s+/).slice(0, 20).join(' ') }
      : {}),
  };
}

function normalizeHttpRole(player) {
  const raw = String(player ?? 'spectate');
  if (!VALID_PLAYERS.has(raw)) return null;
  if (raw === '1') return 'player_1';
  if (raw === '2') return 'player_2';
  return raw;
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function errorPage(message) {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Agent Duel</title></head>
  <body><h1>Agent Duel</h1><p>${escapeHtml(message)}</p></body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appServer = createAppServer();
  appServer.listen().then(() => {
    console.log(`Agent Duel listening on http://localhost:${appServer.port}`);
  });
}
