import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIONS, CENTER_CHOKE, createGame, resolveTurn } from '../src/engine.js';

const wait = { action_type: ACTIONS.WAIT };

test('createGame accepts a custom map definition', () => {
  const customMap = {
    id: 'tiny-test-map',
    bases: { blue: ['A1'], red: ['I9'] },
    starts: { blue: 'A1', red: 'I9' },
    relicStart: 'E5',
    walls: ['E4'],
    bushes: ['B1'],
    fire: ['C5'],
  };
  const game = createGame({ map: customMap });

  assert.equal(game.map.id, 'tiny-test-map');
  assert.deepEqual(game.map.bases.blue, ['A1']);
  assert.deepEqual(game.map.bases.red, ['I9']);
  assert.equal(game.players.blue.position, 'A1');
  assert.equal(game.players.red.position, 'I9');
  assert.equal(game.relic.position, 'E5');
  assert.equal(game.relic.lastKnownPosition, 'E5');
  assert.equal(game.map.walls.has('E4'), true);
  assert.equal(game.map.bushes.has('B1'), true);
  assert.equal(game.map.fire.has('C5'), true);
});

test('createGame defaults to braided-split-home-tolls-v1 when map is omitted', () => {
  const game = createGame();
  assert.equal(game.map.id, 'braided-split-home-tolls-v1');
  assert.equal(game.players.blue.position, 'A5');
  assert.equal(game.players.red.position, 'I5');
  assert.equal(game.relic.position, 'E5');
});

test('createGame supports asymmetric base sizes and relic placement', () => {
  const asym = {
    id: 'asym-test',
    bases: { blue: ['A4', 'A5', 'A6', 'A7'], red: ['I5'] },
    starts: { blue: 'A5', red: 'I5' },
    relicStart: 'F3',
    walls: [],
    bushes: [],
    fire: [],
  };
  const game = createGame({ map: asym });
  assert.deepEqual(game.map.bases.blue, ['A4', 'A5', 'A6', 'A7']);
  assert.deepEqual(game.map.bases.red, ['I5']);
  assert.equal(game.relic.position, 'F3');
  assert.notEqual(game.metrics.shortestPathToRelic.blue, game.metrics.shortestPathToRelic.red);
});

test('shortestPathToRelic uses the supplied map starts, not hardcoded ones', () => {
  const map = {
    id: 'starts-test',
    bases: { blue: ['A1'], red: ['I9'] },
    starts: { blue: 'A1', red: 'I9' },
    relicStart: 'E5',
    walls: [],
    bushes: [],
    fire: [],
  };
  const game = createGame({ map });
  // From A1 to E5: 4+4 = 8. Same for I9 to E5.
  assert.equal(game.metrics.shortestPathToRelic.blue, 8);
  assert.equal(game.metrics.shortestPathToRelic.red, 8);
});

test('resolveTurn works on a parameterized map', () => {
  const map = {
    id: 'resolve-test',
    bases: { blue: ['A5'], red: ['I5'] },
    starts: { blue: 'B5', red: 'H5' },
    relicStart: 'E5',
    walls: [],
    bushes: [],
    fire: [],
  };
  const game = createGame({ map });
  const result = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_EAST },
    red: wait,
  });
  assert.equal(result.game.players.blue.position, 'C5');
  assert.equal(result.game.players.red.position, 'H5');
});

test('CENTER_CHOKE is exported and usable as a map definition', () => {
  const game = createGame({ map: CENTER_CHOKE });
  assert.equal(game.map.id, 'center_choke');
  assert.equal(game.players.blue.position, 'A5');
});
