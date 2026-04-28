import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppServer } from '../src/server.js';

async function withServer(turnSeconds, fn) {
  const app = createAppServer({ turnSeconds });
  await app.listen(0);
  const base = `http://127.0.0.1:${app.port}`;
  try {
    await fn(base, app);
  } finally {
    await app.close();
  }
}

async function getText(url, init) {
  const res = await fetch(url, init);
  const body = await res.text();
  return { status: res.status, body, headers: res.headers };
}

async function postJson(url, body, init = {}) {
  return getText(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: body == null ? undefined : JSON.stringify(body),
    ...init,
  });
}

async function bothReady(base) {
  await postJson(`${base}/player1/join`, { name: 'Ada' });
  await postJson(`${base}/player2/join`, { name: 'Turing' });
  await postJson(`${base}/player1/ready`);
  await postJson(`${base}/player2/ready`);
}

test('GET /player1 before joining returns the briefing and join instruction', async () => {
  await withServer(60, async (base) => {
    const res = await getText(`${base}/player1?nowait=true`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/plain/);
    assert.match(res.body, /Phase: pre_lobby/);
    assert.match(res.body, /GAME RULES/);
    assert.match(res.body, /\/player1\/join/);
  });
});

test('POST /player1/join claims the slot with a name', async () => {
  await withServer(60, async (base) => {
    const res = await postJson(`${base}/player1/join`, { name: 'Ada' });
    assert.equal(res.status, 200);
    const view = await getText(`${base}/player1?nowait=true`);
    assert.match(view.body, /Phase: lobby/);
    assert.match(view.body, /\/player1\/ready/);
  });
});

test('POST /player1/join is idempotent for the same name', async () => {
  await withServer(60, async (base) => {
    const first = await postJson(`${base}/player1/join`, { name: 'Ada' });
    assert.equal(first.status, 200);
    const second = await postJson(`${base}/player1/join`, { name: 'Ada' });
    assert.equal(second.status, 200);
  });
});

test('POST /player1/join conflicts when slot is held by a different name', async () => {
  await withServer(60, async (base) => {
    await postJson(`${base}/player1/join`, { name: 'Ada' });
    const conflict = await postJson(`${base}/player1/join`, { name: 'Other' });
    assert.equal(conflict.status, 409);
  });
});

test('POST /player1/ready before joining returns 409', async () => {
  await withServer(60, async (base) => {
    const res = await postJson(`${base}/player1/ready`);
    assert.equal(res.status, 409);
  });
});

test('match starts after both sides ready and the GET response shows the grid', async () => {
  await withServer(60, async (base) => {
    await bothReady(base);
    const res = await getText(`${base}/player1?nowait=true`);
    assert.equal(res.status, 200);
    assert.match(res.body, /Phase: match/);
    assert.match(res.body, /BOARD:/);
    // 9x9 grid frame and axis labels
    assert.match(res.body, /A B C D E F G H I/);
    assert.match(res.body, /^\s*1 \|/m);
    assert.match(res.body, /^\s*9 \|/m);
    // Blue player at A5 on the default map
    assert.match(res.body, /^\s*5 \| B /m);
    // Bases lowercase (default map has multi-tile bases)
    assert.match(res.body, /Bases: blue=/);
    // DO NEXT block has the action curl
    assert.match(res.body, /\/player1\/action/);
  });
});

test('POST /player1/action with valid action returns 200 ack and turn resolves when opponent submits', async () => {
  await withServer(60, async (base) => {
    await bothReady(base);
    const sub = await postJson(`${base}/player1/action`, {
      action: 'MOVE',
      target: 'A4',
      intent: 'stepping out',
    });
    assert.equal(sub.status, 200);

    const opp = await postJson(`${base}/player2/action`, {
      action: 'WAIT',
      intent: 'holding position',
    });
    assert.equal(opp.status, 200);

    const view = await getText(`${base}/player1?nowait=true`);
    assert.match(view.body, /Turn 1/);
    // Blue moved to A4
    assert.match(view.body, /^\s*4 \| B /m);
  });
});

test('POST /player1/action without intent returns 400', async () => {
  await withServer(60, async (base) => {
    await bothReady(base);
    const res = await postJson(`${base}/player1/action`, {
      action: 'WAIT',
    });
    assert.equal(res.status, 400);
    assert.match(res.body, /intent/i);
  });
});

test('POST /player1/action with the same body twice this turn is idempotent', async () => {
  await withServer(60, async (base) => {
    await bothReady(base);
    const body = { action: 'WAIT', intent: 'hold' };
    const first = await postJson(`${base}/player1/action`, body);
    assert.equal(first.status, 200);
    const second = await postJson(`${base}/player1/action`, body);
    assert.equal(second.status, 200);
  });
});

test('POST /player1/action with a different body after one is pending returns 409', async () => {
  await withServer(60, async (base) => {
    await bothReady(base);
    await postJson(`${base}/player1/action`, { action: 'WAIT', intent: 'hold' });
    const conflict = await postJson(`${base}/player1/action`, { action: 'GUARD', intent: 'switch' });
    assert.equal(conflict.status, 409);
  });
});

test('GET /player1?wait=2s long-polls and returns when the turn changes', async () => {
  await withServer(60, async (base) => {
    await bothReady(base);
    await postJson(`${base}/player1/action`, { action: 'WAIT', intent: 'hold' });

    const t0 = Date.now();
    const longPoll = getText(`${base}/player1?wait=2s`);
    // Opponent submits after a short delay - long-poll should wake.
    setTimeout(() => {
      postJson(`${base}/player2/action`, { action: 'WAIT', intent: 'hold' });
    }, 50);
    const res = await longPoll;
    const elapsed = Date.now() - t0;
    assert.equal(res.status, 200);
    assert.ok(elapsed < 1500, `expected long-poll to wake within 1.5s, took ${elapsed}ms`);
    assert.match(res.body, /Turn 1/);
  });
});

test('POST /player1/leave releases the slot and pauses an active match', async () => {
  await withServer(60, async (base) => {
    await bothReady(base);
    const leave = await postJson(`${base}/player1/leave`);
    assert.equal(leave.status, 200);

    // Slot is free again.
    const rejoin = await postJson(`${base}/player1/join`, { name: 'Ada2' });
    assert.equal(rejoin.status, 200);

    // Match should be paused.
    const view = await getText(`${base}/player2?nowait=true`);
    assert.match(view.body, /PAUSED|paused/);
  });
});

test('POST /playerN/ready accepts optional trash_talk and lobby transition is immediate', async () => {
  await withServer(60, async (base) => {
    await postJson(`${base}/player1/join`, { name: 'Ada' });
    await postJson(`${base}/player2/join`, { name: 'Turing' });
    const r1 = await postJson(`${base}/player1/ready`, { trash_talk: 'come at me' });
    const r2 = await postJson(`${base}/player2/ready`, { trash_talk: 'easy' });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    const view = await getText(`${base}/player1?nowait=true`);
    assert.match(view.body, /Phase: match/);
  });
});

test('readying after a scored game advances to the next game', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, delay, ...args) => originalSetTimeout(fn, delay === 10000 ? 0 : delay, ...args);
  try {
    await withServer(60, async (base, app) => {
      app.state.bestOf = 3;
      await bothReady(base);
      app.state.series.recordGame('player_1');
      app.state.phase = 'game_end';
      app.state.series.currentGame.phase = 'game_end';
      app.state.series.currentGame.winner = 'blue';
      app.state.slots.player_1.ready = false;
      app.state.slots.player_2.ready = false;

      await postJson(`${base}/player1/ready`);
      await postJson(`${base}/player2/ready`);
      await new Promise((resolve) => originalSetTimeout(resolve, 20));

      assert.equal(app.state.phase, 'match');
      assert.equal(app.state.series.gameNumber, 2);
      assert.deepEqual(app.state.series.currentGame.slotSides, { player_1: 'red', player_2: 'blue' });
    });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('readying at series_end does not restart a decided series', async () => {
  await withServer(60, async (base, app) => {
    await bothReady(base);
    app.state.series.recordGame('player_1');
    app.state.phase = 'series_end';
    app.state.series.currentGame.phase = 'series_end';

    const ready = await postJson(`${base}/player1/ready`);

    assert.equal(ready.status, 200);
    assert.equal(app.state.phase, 'series_end');
    assert.equal(app.state.series.decided, true);
    assert.equal(app.state.series.gameNumber, 1);
  });
});

test('closing during next-round countdown clears the pending timer', async () => {
  const app = createAppServer({ turnSeconds: 60 });
  await app.listen(0);
  const base = `http://127.0.0.1:${app.port}`;
  await bothReady(base);
  app.state.bestOf = 3;
  app.state.series.bestOf = 3;
  app.state.series.recordGame('player_1');
  app.state.phase = 'game_end';
  app.state.slots.player_1.ready = false;
  app.state.slots.player_2.ready = false;

  await postJson(`${base}/player1/ready`);
  await postJson(`${base}/player2/ready`);
  assert.notEqual(app.state.nextRoundTimer, null);

  await app.close();

  assert.equal(app.state.nextRoundTimer, null);
});

test('stored action intent is capped at 20 words', async () => {
  await withServer(60, async (base, app) => {
    await bothReady(base);
    const intent = Array.from({ length: 25 }, (_, i) => `word${i + 1}`).join(' ');

    const res = await postJson(`${base}/player1/action`, { action: 'WAIT', intent });

    assert.equal(res.status, 200);
    const side = app.state.series.currentGame.slotSides.player_1;
    assert.equal(app.state.pendingActions.get(side).intent_summary.split(/\s+/).length, 20);
  });
});

test('malformed translated actions count toward the invalid action limit', async () => {
  await withServer(60, async (base, app) => {
    await bothReady(base);

    const first = await postJson(`${base}/player1/action`, {
      action: 'MOVE',
      target: 'not-a-coord',
      intent: 'trying a bad move',
    });
    const second = await postJson(`${base}/player1/action`, {
      action: 'MOVE',
      target: 'also-bad',
      intent: 'trying another bad move',
    });

    assert.equal(first.status, 400);
    assert.equal(second.status, 200);
    assert.match(second.body, /locked as WAIT/);
    const side = app.state.series.currentGame.slotSides.player_1;
    assert.equal(app.state.pendingActions.get(side).action_type, 'WAIT');
  });
});

test('malformed JSON returns a plain-text 400 response', async () => {
  await withServer(60, async (base) => {
    const res = await getText(`${base}/player1/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    assert.equal(res.status, 400);
    assert.match(res.headers.get('content-type') ?? '', /text\/plain/);
    assert.match(res.body, /Malformed JSON request body\./);
    assert.doesNotMatch(res.body, /<html/i);
  });
});

test('briefing describes ATTACK as an untargeted action', async () => {
  await withServer(60, async (base) => {
    const res = await getText(`${base}/player1?nowait=true`);

    assert.equal(res.status, 200);
    assert.match(res.body, /Plain action: \{"action":"WAIT","intent":"why"\} \(also: ATTACK, GUARD, HEAL, SCAN, DROP_RELIC\)/);
    assert.doesNotMatch(res.body, /ATTACK target an adjacent tile/);
  });
});

test('GET /?player=1 returns 404 (browser player UI is gone)', async () => {
  await withServer(60, async (base) => {
    const res = await fetch(`${base}/?player=1`);
    assert.equal(res.status, 404);
  });
});

test('Unknown slot path returns 404', async () => {
  await withServer(60, async (base) => {
    const a = await getText(`${base}/player3?nowait=true`);
    assert.equal(a.status, 404);
    const b = await postJson(`${base}/player3/join`, { name: 'X' });
    assert.equal(b.status, 404);
  });
});
