import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';

import { createAppServer } from '../src/server.js';

function waitForMessage(ws, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for websocket message')), 1500);
    ws.on('message', function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(message);
    });
  });
}

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

test('server rejects unnamed player pages and accepts spectator page', async () => {
  const app = createAppServer();
  await app.listen(0);
  try {
    const base = `http://127.0.0.1:${app.port}`;
    const unnamed = await fetch(`${base}/?player=1`);
    assert.equal(unnamed.status, 400);
    const unnamedText = await unnamed.text();
    assert.match(unnamedText, /Agent Duel/);
    assert.match(unnamedText, /name is required/i);

    const spectator = await fetch(`${base}/?player=spectate`);
    assert.equal(spectator.status, 200);
    assert.match(await spectator.text(), /Agent Duel/);
  } finally {
    await app.close();
  }
});

test('server sends one initial state frame to a new spectator', async () => {
  const app = createAppServer();
  await app.listen(0);
  try {
    const ws = await openWs(`ws://127.0.0.1:${app.port}/ws?player=spectate`);
    let stateFrames = 0;
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      if (message.type === 'state') stateFrames += 1;
    });

    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(stateFrames, 1);
    ws.close();
  } finally {
    await app.close();
  }
});

test('server starts match after both slots ready and resolves submitted actions', async () => {
  const app = createAppServer({ turnSeconds: 60 });
  await app.listen(0);
  try {
    const base = `ws://127.0.0.1:${app.port}`;
    const p1 = await openWs(`${base}/ws?player=1&name=Ada`);
    const p2 = await openWs(`${base}/ws?player=2&name=Turing`);

    await waitForMessage(p1, (message) => message.type === 'state');
    await waitForMessage(p2, (message) => message.type === 'state');

    p1.send(JSON.stringify({ type: 'ready' }));
    p2.send(JSON.stringify({ type: 'ready' }));

    const started = await waitForMessage(p1, (message) => message.type === 'state' && message.state.phase === 'awaiting_action');
    assert.equal(started.state.turn, 0);
    assert.equal(started.state.you.position, 'A5');

    p1.send(JSON.stringify({ type: 'submit_action', action: { action_type: 'MOVE_NORTH', intent_summary: 'stepping out of the start tile' } }));
    p2.send(JSON.stringify({ type: 'submit_action', action: { action_type: 'WAIT', intent_summary: 'holding position for now' } }));

    const resolved = await waitForMessage(p1, (message) => message.type === 'state' && message.state.turn === 1);
    assert.equal(resolved.state.you.position, 'A4');
    assert.equal(resolved.state.phase, 'awaiting_action');

    p1.close();
    p2.close();
  } finally {
    await app.close();
  }
});

test('server requires thinking text before accepting a submitted action', async () => {
  const app = createAppServer({ turnSeconds: 60 });
  await app.listen(0);
  try {
    const base = `ws://127.0.0.1:${app.port}`;
    const p1 = await openWs(`${base}/ws?player=1&name=Ada`);
    const p2 = await openWs(`${base}/ws?player=2&name=Turing`);

    await waitForMessage(p1, (message) => message.type === 'state');
    await waitForMessage(p2, (message) => message.type === 'state');

    p1.send(JSON.stringify({ type: 'ready' }));
    p2.send(JSON.stringify({ type: 'ready' }));
    await waitForMessage(p1, (message) => message.type === 'state' && message.state.phase === 'awaiting_action');

    p1.send(JSON.stringify({ type: 'submit_action', action: { action_type: 'WAIT' } }));
    const rejected = await waitForMessage(p1, (message) => message.type === 'validation_error');
    assert.match(rejected.error, /thinking/i);

    p1.send(JSON.stringify({ type: 'submit_action', action: { action_type: 'WAIT', intent_summary: 'watching the center lane' } }));
    const accepted = await waitForMessage(p1, (message) => message.type === 'action_locked');
    assert.equal(accepted.action.intent_summary, 'watching the center lane');

    p1.close();
    p2.close();
  } finally {
    await app.close();
  }
});

test('spectator state reports thinking or ready for each player during a turn', async () => {
  const app = createAppServer({ turnSeconds: 60 });
  await app.listen(0);
  try {
    const base = `ws://127.0.0.1:${app.port}`;
    const p1 = await openWs(`${base}/ws?player=1&name=Ada`);
    const p2 = await openWs(`${base}/ws?player=2&name=Turing`);
    const spectator = await openWs(`${base}/ws?player=spectate`);

    await waitForMessage(p1, (message) => message.type === 'state');
    await waitForMessage(p2, (message) => message.type === 'state');
    await waitForMessage(spectator, (message) => message.type === 'state');

    p1.send(JSON.stringify({ type: 'ready' }));
    p2.send(JSON.stringify({ type: 'ready' }));
    const started = await waitForMessage(spectator, (message) => (
      message.type === 'state' &&
      message.state.phase === 'match' &&
      message.state.full_board_state.players.blue.action_status === 'thinking' &&
      message.state.full_board_state.players.red.action_status === 'thinking'
    ));
    assert.equal(started.state.full_board_state.players.blue.action_status, 'thinking');
    assert.equal(started.state.full_board_state.players.red.action_status, 'thinking');
    assert.equal(started.state.full_board_state.players.blue.action_thought, null);
    assert.equal(started.state.full_board_state.players.red.action_thought, null);

    p1.send(JSON.stringify({ type: 'submit_action', action: { action_type: 'WAIT', intent_summary: 'waiting to see red move' } }));
    const updated = await waitForMessage(spectator, (message) => (
      message.type === 'state' &&
      message.state.full_board_state.players.blue.action_status === 'ready'
    ));
    assert.equal(updated.state.full_board_state.players.blue.action_status, 'ready');
    assert.equal(updated.state.full_board_state.players.red.action_status, 'thinking');
    assert.equal(updated.state.full_board_state.players.blue.action_thought, 'waiting to see red move');
    assert.equal(updated.state.full_board_state.players.red.action_thought, null);

    p1.close();
    p2.close();
    spectator.close();
  } finally {
    await app.close();
  }
});

test('connecting a second websocket to a player slot replaces the old connection', async () => {
  const app = createAppServer();
  await app.listen(0);
  try {
    const base = `ws://127.0.0.1:${app.port}`;
    const first = await openWs(`${base}/ws?player=1&name=Ada`);
    await waitForMessage(first, (message) => message.type === 'state');

    const closed = new Promise((resolve) => first.once('close', resolve));
    const second = await openWs(`${base}/ws?player=1&name=Ada`);
    await closed;
    const state = await waitForMessage(second, (message) => message.type === 'state');
    assert.equal(state.role, 'player_1');

    second.close();
  } finally {
    await app.close();
  }
});
