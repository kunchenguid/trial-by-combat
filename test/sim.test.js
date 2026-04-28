import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIONS, CENTER_CHOKE } from '../src/engine.js';
import { makeRng, simulate } from '../src/sim.js';

const wait = () => ({ action_type: ACTIONS.WAIT });

test('makeRng is deterministic for the same seed', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 8; i += 1) {
    assert.equal(a(), b());
  }
});

test('makeRng emits floats in [0, 1)', () => {
  const rng = makeRng(7);
  for (let i = 0; i < 100; i += 1) {
    const v = rng();
    assert.equal(v >= 0 && v < 1, true);
  }
});

test('simulate returns turn cap when both sides WAIT', () => {
  const result = simulate(CENTER_CHOKE, wait, wait, { seed: 1 });
  assert.equal(result.winner, null);
  assert.equal(result.replayRequired, true);
  assert.equal(result.turns, 100);
  assert.equal(typeof result.finalGame, 'object');
});

test('simulate produces a winner when one side captures the relic', () => {
  // Tiny map: blue starts on relic, just needs to walk one tile west to A5 base.
  const map = {
    id: 'walk-to-base',
    bases: { blue: ['A5'], red: ['I5'] },
    starts: { blue: 'B5', red: 'I5' },
    relicStart: 'B5',
    walls: [],
    bushes: [],
    fire: [],
  };
  // Blue picks up relic on turn 1 (auto-pickup), then walks west on turn 2.
  let turn = 0;
  const blueAgent = () => {
    turn += 1;
    return turn === 1 ? { action_type: ACTIONS.WAIT } : { action_type: ACTIONS.MOVE_WEST };
  };
  const result = simulate(map, blueAgent, wait, { seed: 1, turnCap: 10 });
  assert.equal(result.winner, 'blue');
  assert.equal(result.replayRequired, false);
  assert.equal(result.turns >= 2, true);
});

test('simulate is deterministic given the same seed and agents', () => {
  const map = CENTER_CHOKE;
  const randAgent = (_game, _side, rng) => {
    const choices = [ACTIONS.MOVE_NORTH, ACTIONS.MOVE_SOUTH, ACTIONS.MOVE_EAST, ACTIONS.MOVE_WEST, ACTIONS.WAIT];
    return { action_type: choices[Math.floor(rng() * choices.length)] };
  };
  const a = simulate(map, randAgent, randAgent, { seed: 99, turnCap: 20 });
  const b = simulate(map, randAgent, randAgent, { seed: 99, turnCap: 20 });
  assert.equal(a.winner, b.winner);
  assert.equal(a.turns, b.turns);
  assert.equal(a.replayRequired, b.replayRequired);
});

test('simulate respects custom turnCap', () => {
  const result = simulate(CENTER_CHOKE, wait, wait, { seed: 1, turnCap: 5 });
  assert.equal(result.replayRequired, true);
  assert.equal(result.turns, 5);
});

test('simulate passes a side-scoped rng to agents and exposes it as 3rd arg', () => {
  const seen = { blue: [], red: [] };
  const agent = (_side) => (_game, s, rng) => {
    seen[s].push(rng());
    return { action_type: ACTIONS.WAIT };
  };
  simulate(CENTER_CHOKE, agent('blue'), agent('red'), { seed: 1, turnCap: 3 });
  assert.equal(seen.blue.length, 3);
  assert.equal(seen.red.length, 3);
  // RNG draws are floats in [0,1).
  for (const v of [...seen.blue, ...seen.red]) {
    assert.equal(v >= 0 && v < 1, true);
  }
});
