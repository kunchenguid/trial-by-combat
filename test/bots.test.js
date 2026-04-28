import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIONS, CENTER_CHOKE, createGame, resolveTurn, validateAction } from '../src/engine.js';
import { randomBot, greedyBot, mctsBot } from '../src/bots.js';
import { simulate, makeRng } from '../src/sim.js';

test('randomBot returns a legal action', () => {
  const game = createGame({ map: CENTER_CHOKE });
  const rng = makeRng(1);
  for (let i = 0; i < 10; i += 1) {
    const action = randomBot(game, 'blue', rng);
    assert.equal(validateAction(game, 'blue', action).valid, true);
  }
});

test('randomBot is deterministic given the same RNG', () => {
  const game = createGame({ map: CENTER_CHOKE });
  const a = randomBot(game, 'blue', makeRng(7));
  const b = randomBot(game, 'blue', makeRng(7));
  assert.deepEqual(a, b);
});

test('greedyBot attacks when opponent is adjacent', () => {
  const game = createGame({ map: CENTER_CHOKE });
  game.players.blue.position = 'D5';
  game.players.red.position = 'E5';
  const action = greedyBot(game, 'blue', makeRng(1));
  assert.equal(action.action_type, ACTIONS.ATTACK);
});

test('greedyBot heals when health is low and heal is available', () => {
  const game = createGame({ map: CENTER_CHOKE });
  game.players.blue.health = 3;
  // Make sure no opponent adjacency triggers attack-first rule.
  game.players.red.position = 'I5';
  const action = greedyBot(game, 'blue', makeRng(1));
  assert.equal(action.action_type, ACTIONS.HEAL);
});

test('greedyBot moves toward the relic when free and not carrying', () => {
  const game = createGame({ map: CENTER_CHOKE });
  // Blue at A5, relic at E5 → blue should move east.
  const action = greedyBot(game, 'blue', makeRng(1));
  assert.equal(action.action_type === ACTIONS.MOVE_EAST || action.action_type === ACTIONS.DASH_EAST, true);
});

test('greedyBot moves toward own base when carrying the relic', () => {
  const game = createGame({ map: CENTER_CHOKE });
  game.players.blue.position = 'E5';
  game.players.blue.carryingRelic = true;
  game.relic.carriedBy = 'blue';
  game.relic.position = null;
  const action = greedyBot(game, 'blue', makeRng(1));
  // Blue base is on the west side; greedy should not dash (carrying), so MOVE_WEST.
  assert.equal(action.action_type, ACTIONS.MOVE_WEST);
});

test('greedyBot avoids stepping into a known fire tile when there is an alternative', () => {
  // Place blue right next to fire D2 with relic east of fire so the direct path crosses fire.
  const map = {
    id: 'fire-test',
    bases: { blue: ['A5'], red: ['I5'] },
    starts: { blue: 'C2', red: 'I5' },
    relicStart: 'E2',
    walls: [],
    bushes: [],
    fire: ['D2'],
  };
  const game = createGame({ map });
  // From C2 toward E2: direct east goes through D2 fire. Greedy should go around (south/north).
  const action = greedyBot(game, 'blue', makeRng(1));
  assert.notEqual(action.action_type, ACTIONS.MOVE_EAST);
  assert.notEqual(action.action_type, ACTIONS.DASH_EAST);
});

test('mctsBot returns a legal action', () => {
  const game = createGame({ map: CENTER_CHOKE });
  const rng = makeRng(1);
  const action = mctsBot(game, 'blue', rng, { iters: 20 });
  assert.equal(validateAction(game, 'blue', action).valid, true);
});

test('mctsBot is deterministic for the same seed and iters', () => {
  const game = createGame({ map: CENTER_CHOKE });
  const a = mctsBot(game, 'blue', makeRng(42), { iters: 30 });
  const b = mctsBot(game, 'blue', makeRng(42), { iters: 30 });
  assert.deepEqual(a, b);
});

test('greedy beats random over a series of mirrored games on Center Choke', () => {
  const games = 20;
  let greedyWins = 0;
  let randomWins = 0;
  for (let i = 0; i < games; i += 1) {
    const blueIsGreedy = i % 2 === 0;
    const blueAgent = blueIsGreedy ? greedyBot : randomBot;
    const redAgent = blueIsGreedy ? randomBot : greedyBot;
    const result = simulate(CENTER_CHOKE, blueAgent, redAgent, { seed: i + 1, turnCap: 40 });
    if (result.winner === 'blue') {
      if (blueIsGreedy) greedyWins += 1; else randomWins += 1;
    } else if (result.winner === 'red') {
      if (blueIsGreedy) randomWins += 1; else greedyWins += 1;
    }
  }
  // Greedy should clearly outperform random.
  assert.equal(greedyWins > randomWins, true, `greedy=${greedyWins} random=${randomWins}`);
});
