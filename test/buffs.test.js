import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIONS,
  BUFF_TYPES,
  cloneGame,
  createGame,
  getPlayerView,
  getSpectatorView,
  MAX_INVENTORY_PER_ITEM,
  RULESET_VERSION,
  resolveTurn,
  validateAction,
} from '../src/engine.js';

const wait = { action_type: ACTIONS.WAIT };

function buffMap(buffs, overrides = {}) {
  return {
    id: 'buff-test-map',
    bases: { blue: ['A4', 'A5', 'A6'], red: ['I4', 'I5', 'I6'] },
    starts: { blue: 'A5', red: 'I5' },
    relicStart: 'E5',
    walls: [],
    bushes: [],
    fire: [],
    buffs,
    ...overrides,
  };
}

test('ruleset version is current', () => {
  assert.equal(RULESET_VERSION, 'capture-relic-2.6');
});

test('createGame parses buffs from map JSON and exposes them on game.map.buffs', () => {
  const game = createGame({
    map: buffMap([
      { coord: 'C5', type: BUFF_TYPES.DASH_PACK },
      { coord: 'G5', type: BUFF_TYPES.BIG_HEAL },
    ]),
  });

  assert.equal(game.map.buffs.size, 2);
  assert.equal(game.map.buffs.get('C5').type, BUFF_TYPES.DASH_PACK);
  assert.equal(game.map.buffs.get('G5').type, BUFF_TYPES.BIG_HEAL);
});

test('createGame works with map that omits the buffs field (back-compat)', () => {
  const game = createGame({
    map: {
      id: 'no-buff',
      bases: { blue: ['A1'], red: ['I9'] },
      starts: { blue: 'A1', red: 'I9' },
      relicStart: 'E5',
      walls: [],
      bushes: [],
      fire: [],
    },
  });
  assert.equal(game.map.buffs.size, 0);
});

test('createGame rejects unknown buff types', () => {
  assert.throws(() => createGame({ map: buffMap([{ coord: 'C5', type: 'mystery' }]) }), /Unknown buff type/);
});

test('cloneGame deep-clones the buffs map so mutations do not leak', () => {
  const game = createGame({ map: buffMap([{ coord: 'C5', type: BUFF_TYPES.DASH_PACK }]) });
  const clone = cloneGame(game);
  clone.map.buffs.delete('C5');
  assert.equal(game.map.buffs.has('C5'), true);
  assert.equal(clone.map.buffs.has('C5'), false);
});

test('moving onto a dash_pack adds 3 dash charges (capped) and consumes the buff', () => {
  const game = createGame({ map: buffMap([{ coord: 'B5', type: BUFF_TYPES.DASH_PACK }]) });
  const startingDash = game.players.blue.inventory.dash;

  const result = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_EAST },
    red: wait,
  });

  assert.equal(result.game.players.blue.position, 'B5');
  assert.equal(result.game.players.blue.inventory.dash, Math.min(MAX_INVENTORY_PER_ITEM, startingDash + 3));
  assert.equal(result.game.map.buffs.has('B5'), false);
  assert.equal(
    result.events.some(
      (event) => event.event_type === 'buff_picked_up' && event.actor === 'blue' && event.summary.includes('B5'),
    ),
    true,
  );
});

test('dash_pack pickup respects MAX_INVENTORY_PER_ITEM cap', () => {
  const game = createGame({ map: buffMap([{ coord: 'B5', type: BUFF_TYPES.DASH_PACK }]) });
  game.players.blue.inventory.dash = MAX_INVENTORY_PER_ITEM - 1;

  const result = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_EAST },
    red: wait,
  });
  assert.equal(result.game.players.blue.inventory.dash, MAX_INVENTORY_PER_ITEM);
});

test('moving onto a big_heal restores HP to max and consumes the buff', () => {
  const game = createGame({ map: buffMap([{ coord: 'B5', type: BUFF_TYPES.BIG_HEAL }]) });
  game.players.blue.health = 2;

  const result = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_EAST },
    red: wait,
  });

  assert.equal(result.game.players.blue.health, result.game.players.blue.maxHealth);
  assert.equal(result.game.map.buffs.has('B5'), false);
});

test('big_heal is consumed even when picker is already at full health', () => {
  const game = createGame({ map: buffMap([{ coord: 'B5', type: BUFF_TYPES.BIG_HEAL }]) });
  assert.equal(game.players.blue.health, game.players.blue.maxHealth);

  const result = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_EAST },
    red: wait,
  });
  assert.equal(result.game.map.buffs.has('B5'), false);
});

test('contested buff pickup: both players landing on the same buff lands neither and the buff persists', () => {
  // Both players walk into D5 from C5 / E5 in one step. Use a flat map, place both adjacent.
  const game = createGame({ map: buffMap([{ coord: 'D5', type: BUFF_TYPES.DASH_PACK }]) });
  game.players.blue.position = 'C5';
  game.players.red.position = 'E5';
  game.relic.position = 'A1'; // move relic out of the way

  const result = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_EAST },
    red: { action_type: ACTIONS.MOVE_WEST },
  });

  // Both blocked by same-target collision, so neither lands on D5; buff still active.
  assert.equal(result.game.map.buffs.has('D5'), true);
  assert.notEqual(result.game.players.blue.position, 'D5');
  assert.notEqual(result.game.players.red.position, 'D5');
});

test('placement is rejected on a buff tile (wall and trap)', () => {
  const game = createGame({ map: buffMap([{ coord: 'B5', type: BUFF_TYPES.DASH_PACK }]) });
  // Blue is at A5, B5 is adjacent.
  const wallCheck = validateAction(game, 'blue', { action_type: ACTIONS.PLACE_WALL, target: 'B5' });
  assert.equal(wallCheck.valid, false);
  const trapCheck = validateAction(game, 'blue', { action_type: ACTIONS.PLACE_TRAP, target: 'B5' });
  assert.equal(trapCheck.valid, false);
});

test('spectator view exposes active buffs as coord+type pairs and drops consumed ones', () => {
  const game = createGame({
    map: buffMap([
      { coord: 'B5', type: BUFF_TYPES.DASH_PACK },
      { coord: 'H5', type: BUFF_TYPES.BIG_HEAL },
    ]),
  });
  const before = getSpectatorView(game).full_board_state.buffs;
  assert.deepEqual(
    before.sort((a, b) => a.coord.localeCompare(b.coord)),
    [
      { coord: 'B5', type: BUFF_TYPES.DASH_PACK },
      { coord: 'H5', type: BUFF_TYPES.BIG_HEAL },
    ],
  );

  const after = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_EAST },
    red: wait,
  }).game;
  assert.deepEqual(getSpectatorView(after).full_board_state.buffs, [{ coord: 'H5', type: BUFF_TYPES.BIG_HEAL }]);
});

test('player view exposes active buffs under known_tiles', () => {
  const game = createGame({ map: buffMap([{ coord: 'B5', type: BUFF_TYPES.DASH_PACK }]) });
  const view = getPlayerView(game, 'blue');
  assert.deepEqual(view.known_tiles.buffs, [{ coord: 'B5', type: BUFF_TYPES.DASH_PACK }]);
});
