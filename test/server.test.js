import assert from 'node:assert/strict';
import test from 'node:test';
import WebSocket from 'ws';

import { createAppServer } from '../src/server.js';

function openWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

async function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

test('spectator HTTP page is served and player browser routes 404', async () => {
  const app = createAppServer();
  await app.listen(0);
  try {
    const base = `http://127.0.0.1:${app.port}`;

    const player = await fetch(`${base}/?player=1`);
    assert.equal(player.status, 404);

    const spectator = await fetch(`${base}/?player=spectate`);
    assert.equal(spectator.status, 200);
    assert.match(await spectator.text(), /Trial by Combat/);
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

test('spectator WS state reports thinking or ready as players submit via HTTP', async () => {
  const app = createAppServer({ turnSeconds: 60 });
  await app.listen(0);
  try {
    const httpBase = `http://127.0.0.1:${app.port}`;
    const wsBase = `ws://127.0.0.1:${app.port}`;
    const spectator = await openWs(`${wsBase}/ws?player=spectate`);

    const messages = [];
    spectator.on('message', (raw) => messages.push(JSON.parse(raw.toString())));

    const findMatching = async (predicate) => {
      const deadline = Date.now() + 1500;
      while (Date.now() < deadline) {
        const found = messages.find(predicate);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error('Timed out waiting for predicate');
    };

    await postJson(`${httpBase}/player1/join`, { name: 'Ada' });
    await postJson(`${httpBase}/player2/join`, { name: 'Turing' });
    await postJson(`${httpBase}/player1/ready`);
    await postJson(`${httpBase}/player2/ready`);

    const started = await findMatching(
      (message) =>
        message.type === 'state' &&
        message.state.phase === 'match' &&
        message.state.full_board_state.players.blue.action_status === 'thinking' &&
        message.state.full_board_state.players.red.action_status === 'thinking',
    );
    assert.equal(started.state.full_board_state.players.blue.action_thought, null);
    assert.equal(started.state.full_board_state.players.red.action_thought, null);

    messages.length = 0;
    await postJson(`${httpBase}/player1/action`, {
      action: 'WAIT',
      intent: 'waiting to see red move',
    });
    const updated = await findMatching(
      (message) => message.type === 'state' && message.state.full_board_state.players.blue.action_status === 'ready',
    );
    assert.equal(updated.state.full_board_state.players.red.action_status, 'thinking');
    assert.equal(updated.state.full_board_state.players.blue.action_thought, 'waiting to see red move');
    assert.equal(updated.state.full_board_state.players.red.action_thought, null);

    spectator.close();
  } finally {
    await app.close();
  }
});

test('player WebSocket upgrade is rejected (API-only slots)', async () => {
  const app = createAppServer();
  await app.listen(0);
  try {
    const url = `ws://127.0.0.1:${app.port}/ws?player=1&name=Ada`;
    const ws = new WebSocket(url);
    const result = await new Promise((resolve) => {
      ws.once('open', () => resolve('open'));
      ws.once('error', () => resolve('error'));
      ws.once('close', () => resolve('close'));
    });
    assert.notEqual(result, 'open');
  } finally {
    await app.close();
  }
});
