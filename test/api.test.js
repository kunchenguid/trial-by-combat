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

test('player text view renders active buff tiles and lists them with effects', async () => {
  await withServer(60, async (base, app) => {
    await bothReady(base);
    const game = app.state.series.currentGame;
    game.map.buffs.set('C2', { type: 'dash_pack' });
    game.map.buffs.set('G2', { type: 'big_heal' });
    const res = await getText(`${base}/player1?nowait=true`);
    assert.equal(res.status, 200);
    assert.match(res.body, /BUFFS:/);
    assert.match(res.body, /C2\s+dash_pack/);
    assert.match(res.body, /G2\s+big_heal/);
    // row 2: C2 is the dash buff (D), G2 is the big heal (+)
    assert.match(res.body, /^\s*2 \| \. \. D \. \. \. \+ \. \. \|/m);
    // legend mentions the buff glyphs
    assert.match(res.body, /D dash-pack/);
    assert.match(res.body, /\+ big-heal/);
  });
});

test('briefing mentions buff tiles and effects', async () => {
  await withServer(60, async (base) => {
    const res = await getText(`${base}/player1?nowait=true`);
    assert.match(res.body, /Dash Pack/);
    assert.match(res.body, /Big Heal/);
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

test('malformed follow-up action cannot replace an already pending action', async () => {
  await withServer(60, async (base, app) => {
    await bothReady(base);
    const side = app.state.series.currentGame.slotSides.player_1;

    const first = await postJson(`${base}/player1/action`, { action: 'GUARD', intent: 'hold ground' });
    const bad = await postJson(`${base}/player1/action`, {
      action: 'MOVE',
      target: 'not-a-coord',
      intent: 'bad follow up',
    });

    assert.equal(first.status, 200);
    assert.equal(bad.status, 409);
    assert.equal(app.state.pendingActions.get(side).action_type, 'GUARD');
    assert.equal(app.state.invalidAttemptsThisTurn[side], 0);
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

test('POST /playerN/ready at game_end requires trash_talk', async () => {
  await withServer(60, async (base, app) => {
    await bothReady(base);
    app.state.series.recordGame('player_1');
    app.state.phase = 'game_end';
    app.state.series.currentGame.phase = 'game_end';
    app.state.series.currentGame.winner = 'blue';
    app.state.slots.player_1.ready = false;
    app.state.slots.player_2.ready = false;

    const noTrash = await postJson(`${base}/player1/ready`);
    assert.equal(noTrash.status, 400);
    assert.match(noTrash.body, /trash_talk is required/);
    assert.equal(app.state.slots.player_1.ready, false);

    const blank = await postJson(`${base}/player1/ready`, { trash_talk: '   ' });
    assert.equal(blank.status, 400);
    assert.equal(app.state.slots.player_1.ready, false);

    const ok = await postJson(`${base}/player1/ready`, { trash_talk: 'gg' });
    assert.equal(ok.status, 200);
    assert.equal(app.state.slots.player_1.ready, true);
    assert.equal(app.state.trashTalk.player_1, 'gg');
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

      await postJson(`${base}/player1/ready`, { trash_talk: 'rematch incoming' });
      await postJson(`${base}/player2/ready`, { trash_talk: 'bring it' });
      await new Promise((resolve) => originalSetTimeout(resolve, 20));

      assert.equal(app.state.phase, 'match');
      assert.equal(app.state.series.gameNumber, 2);
      assert.deepEqual(app.state.series.currentGame.slotSides, { player_1: 'blue', player_2: 'red' });
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

  await postJson(`${base}/player1/ready`, { trash_talk: 'next' });
  await postJson(`${base}/player2/ready`, { trash_talk: 'next' });
  assert.notEqual(app.state.nextRoundTimer, null);

  await app.close();

  assert.equal(app.state.nextRoundTimer, null);
});

test('leaving during next-round countdown cancels the countdown', async () => {
  await withServer(60, async (base, app) => {
    await bothReady(base);
    app.state.bestOf = 3;
    app.state.series.bestOf = 3;
    app.state.series.recordGame('player_1');
    app.state.phase = 'game_end';
    app.state.slots.player_1.ready = false;
    app.state.slots.player_2.ready = false;

    await postJson(`${base}/player1/ready`, { trash_talk: 'next' });
    await postJson(`${base}/player2/ready`, { trash_talk: 'next' });
    assert.notEqual(app.state.nextRoundTimer, null);

    const leave = await postJson(`${base}/player1/leave`);

    assert.equal(leave.status, 200);
    assert.equal(app.state.nextRoundTimer, null);
    assert.equal(app.state.nextRoundAt, null);
  });
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

test('briefing describes ATTACK as an untargeted action and lists every action on equal footing', async () => {
  await withServer(60, async (base) => {
    const res = await getText(`${base}/player1?nowait=true`);

    assert.equal(res.status, 200);
    // ATTACK appears as its own bullet with no "target" field.
    assert.match(res.body, /\{"action":"ATTACK","intent":"\.\.\."\}/);
    assert.doesNotMatch(res.body, /"action":"ATTACK","target":/);
    // PLACE_WALL and PLACE_TRAP are first-class bullets, not buried in a parenthetical.
    assert.match(
      res.body,
      /\{"action":"PLACE_WALL","target":"<adjacent empty tile, orthogonal or diagonal>","intent":"\.\.\."\}/,
    );
    assert.match(
      res.body,
      /\{"action":"PLACE_TRAP","target":"<adjacent empty tile, orthogonal or diagonal>","intent":"\.\.\."\}/,
    );
    // Strategic-use emphasis on the inventory line.
    assert.match(res.body, /Use these items strategically to your advantage\./);
    // Trap gotcha is reframed offensively (deployer POV), not from the victim's POV.
    assert.match(res.body, /trap you placed deals 5 damage/i);
    assert.doesNotMatch(res.body, /Trap step converts the rest of your turn/);
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

test('intent prompt asks for action-naming, spectator-addressed, meme-worthy commentary', async () => {
  await withServer(60, async (base) => {
    // Briefing (pre-lobby) carries the guidance.
    const briefing = await getText(`${base}/player1?nowait=true`);
    assert.equal(briefing.status, 200);
    assert.match(briefing.body, /intent: a one-line spectator commentary/i);
    assert.match(briefing.body, /names the action/i);
    assert.match(briefing.body, /addressed to the SPECTATOR/i);
    assert.match(briefing.body, /NOT to the opponent/i);
    assert.match(briefing.body, /meme-able, quotable, hilarious/i);

    // In-match DO NEXT block carries the same guidance and the placeholder is no longer "why you chose this".
    await postJson(`${base}/player1/join`, { name: 'Ada' });
    await postJson(`${base}/player2/join`, { name: 'Turing' });
    await postJson(`${base}/player1/ready`);
    await postJson(`${base}/player2/ready`);
    const view = await getText(`${base}/player1?nowait=true`);
    assert.match(view.body, /Phase: match/);
    assert.match(view.body, /<your spectator quip>/);
    assert.doesNotMatch(view.body, /"intent":"why you chose this"/);
    assert.match(view.body, /intent: a one-line spectator commentary/i);
    assert.match(view.body, /addressed to the SPECTATOR/i);
    assert.match(view.body, /meme-able, quotable, hilarious/i);

    // Missing-intent error includes the same guidance.
    const missing = await postJson(`${base}/player1/action`, { action: 'WAIT' });
    assert.equal(missing.status, 400);
    assert.match(missing.body, /intent is required/i);
    assert.match(missing.body, /addressed to the SPECTATOR/i);
    assert.match(missing.body, /meme-able/i);
  });
});

test('briefing and game_end DO NEXT block prompt LLMs to address opponent in second person with meme-worthy lines', async () => {
  await withServer(60, async (base, app) => {
    // Briefing (pre-lobby)
    const briefing = await getText(`${base}/player1?nowait=true`);
    assert.equal(briefing.status, 200);
    assert.match(briefing.body, /Speak DIRECTLY to your opponent/i);
    assert.match(briefing.body, /second person/i);
    assert.match(briefing.body, /meme-able, quotable, hilarious/i);

    // game_end DO NEXT block
    await bothReady(base);
    app.state.series.recordGame('player_1');
    app.state.phase = 'game_end';
    app.state.series.currentGame.phase = 'game_end';
    app.state.series.currentGame.winner = 'blue';
    app.state.slots.player_1.ready = false;
    app.state.slots.player_2.ready = false;

    const view = await getText(`${base}/player1?nowait=true`);
    assert.equal(view.status, 200);
    assert.match(view.body, /Phase: game_end/);
    assert.match(view.body, /Speak DIRECTLY to your opponent/i);
    assert.match(view.body, /meme-able, quotable, hilarious/i);
    // Stale "one-line jab shown to spectators" placeholder is gone
    assert.doesNotMatch(view.body, /one-line jab shown to spectators/);

    // Missing-trash-talk error message also encourages the right tone.
    const noTrash = await postJson(`${base}/player1/ready`);
    assert.equal(noTrash.status, 400);
    assert.match(noTrash.body, /spoken DIRECTLY to your opponent/i);
    assert.match(noTrash.body, /meme-able, quotable, hilarious/i);
  });
});

test('duplicate ready at game_end is rejected with 409 and tells player to keep polling', async () => {
  await withServer(60, async (base, app) => {
    await bothReady(base);
    app.state.series.recordGame('player_1');
    app.state.phase = 'game_end';
    app.state.series.currentGame.phase = 'game_end';
    app.state.series.currentGame.winner = 'blue';
    app.state.slots.player_1.ready = false;
    app.state.slots.player_2.ready = false;

    const first = await postJson(`${base}/player1/ready`, { trash_talk: 'gg' });
    assert.equal(first.status, 200);
    assert.equal(app.state.slots.player_1.ready, true);

    const dup = await postJson(`${base}/player1/ready`, { trash_talk: 'gg again' });
    assert.equal(dup.status, 409);
    assert.match(dup.body, /already ready/i);
    assert.match(dup.body, /poll/i);
    // trash_talk for the duplicate must NOT overwrite the original
    assert.equal(app.state.trashTalk.player_1, 'gg');
  });
});

test('turn timer fires onTurnTimeout and flags missing sides as timed_out_last_turn', async () => {
  await withServer(0.05, async (base, app) => {
    await bothReady(base);
    const turnBefore = app.state.series.currentGame.turn;
    await new Promise((resolve) => setTimeout(resolve, 90));
    // Stop the cycling timer so the assertions don't race with another fire.
    if (app.state.timer) clearTimeout(app.state.timer);
    app.state.timer = null;
    const turnAfter = app.state.series.currentGame.turn;
    assert.ok(turnAfter > turnBefore, 'turn should have advanced after timeout');
    assert.equal(app.state.timedOutLastTurn.blue, true);
    assert.equal(app.state.timedOutLastTurn.red, true);
  });
});

test('player whose turn timed out is told on next /action and given latest state', async () => {
  await withServer(60, async (base, app) => {
    await bothReady(base);
    const side = app.state.series.currentGame.slotSides.player_1;
    app.state.timedOutLastTurn[side] = true;

    const res = await postJson(`${base}/player1/action`, { action: 'WAIT', intent: 'just submit' });
    assert.equal(res.status, 409);
    assert.match(res.body, /missed your previous turn/i);
    assert.match(res.body, /timer expired/i);
    assert.match(res.body, /LATEST STATE/);
    assert.match(res.body, /Phase: match/);
    assert.match(res.body, /BOARD:/);

    assert.equal(app.state.timedOutLastTurn[side], false);
    // The discarded action must NOT have been recorded as pending
    assert.equal(app.state.pendingActions.has(side), false);

    // A follow-up action on the same turn now lands normally
    const followup = await postJson(`${base}/player1/action`, { action: 'WAIT', intent: 'second try' });
    assert.equal(followup.status, 200);
    assert.equal(app.state.pendingActions.get(side)?.action_type, 'WAIT');
  });
});
