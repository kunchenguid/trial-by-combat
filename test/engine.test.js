import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIONS,
  CENTER_CHOKE,
  createGame,
  createSeries,
  getLegalActions,
  getPlayerView,
  getSpectatorView,
  resolveTurn,
  setCell,
  validateAction,
} from '../src/engine.js';

const wait = { action_type: ACTIONS.WAIT };

function gameWith(overrides = {}) {
  return createGame({
    playerNames: { player_1: 'Ada', player_2: 'Turing' },
    gameNumber: 1,
    slotSides: { player_1: 'blue', player_2: 'red' },
    map: CENTER_CHOKE,
    ...overrides,
  });
}

test('creates Center Choke with mirrored starts, bases, walls, bushes, and equal relic distance', () => {
  const game = gameWith();

  assert.equal(game.players.blue.position, 'A5');
  assert.equal(game.players.red.position, 'I5');
  assert.equal(game.relic.position, 'E5');
  assert.deepEqual(game.map.bases.blue, ['A4', 'A5', 'A6']);
  assert.deepEqual(game.map.bases.red, ['I4', 'I5', 'I6']);
  assert.equal(game.map.walls.has('D6'), true);
  assert.equal(game.map.walls.has('H4'), true);
  assert.equal(game.map.bushes.has('C5'), true);
  assert.equal(game.map.bushes.has('G5'), true);
  assert.equal(game.map.bushes.has('B2'), true);
  assert.equal(game.map.bushes.has('C2'), true);
  assert.equal(game.map.bushes.has('H2'), true);
  assert.equal(game.map.fire.has('D2'), true);
  assert.equal(game.map.fire.has('F6'), true);
  assert.equal(game.metrics.shortestPathToRelic.blue, game.metrics.shortestPathToRelic.red);
});

test('fire tiles are visible passable hazards that damage shortcut movement', () => {
  const game = gameWith();
  game.players.blue.position = 'D1';

  const result = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_SOUTH },
    red: wait,
  });

  assert.equal(result.game.players.blue.position, 'D2');
  assert.equal(result.game.players.blue.health, 8);
  assert.equal(result.events.some((event) => event.event_type === 'fire_damage' && event.summary.includes('D2')), true);
  assert.deepEqual(getSpectatorView(result.game).full_board_state.fire, ['D2', 'F6']);
});

test('movement blocks off-board, walls, occupied tiles, swaps, and same-tile collisions', () => {
  let game = gameWith();
  assert.equal(validateAction(game, 'blue', { action_type: ACTIONS.MOVE_WEST }).valid, false);
  assert.equal(validateAction(game, 'blue', { action_type: ACTIONS.MOVE_EAST }).valid, true);

  game.players.blue.position = 'C5';
  let next = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_NORTH },
    red: wait,
  }).game;
  assert.equal(next.players.blue.position, 'C5');

  game = gameWith();
  game.players.blue.position = 'D5';
  game.players.red.position = 'F5';
  next = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_EAST },
    red: { action_type: ACTIONS.MOVE_WEST },
  }).game;
  assert.equal(next.players.blue.position, 'D5');
  assert.equal(next.players.red.position, 'F5');

  game.players.blue.position = 'E5';
  game.players.red.position = 'F5';
  next = resolveTurn(game, {
    blue: { action_type: ACTIONS.MOVE_EAST },
    red: { action_type: ACTIONS.MOVE_WEST },
  }).game;
  assert.equal(next.players.blue.position, 'E5');
  assert.equal(next.players.red.position, 'F5');
});

test('dash moves up to two tiles, consumes dash, stops on trap, and cannot be used while carrying relic', () => {
  const game = gameWith();
  game.players.blue.position = 'B5';
  game.players.red.position = 'I5';
  game.traps.set('D5', { owner: 'red', armed: true, revealedTo: new Set() });

  const result = resolveTurn(game, {
    blue: { action_type: ACTIONS.DASH_EAST },
    red: wait,
  });

  assert.equal(result.game.players.blue.position, 'D5');
  assert.equal(result.game.players.blue.health, 7);
  assert.equal(result.game.players.blue.inventory.dash, 0);
  assert.equal(result.game.traps.has('D5'), false);

  result.game.players.blue.carryingRelic = true;
  assert.equal(validateAction(result.game, 'blue', { action_type: ACTIONS.DASH_WEST }).valid, false);
});

test('wall placement requires adjacency, empty non-base target, and preserves all relic paths', () => {
  const game = gameWith();
  game.players.blue.position = 'B5';

  assert.equal(validateAction(game, 'blue', { action_type: ACTIONS.PLACE_WALL, target: 'B4' }).valid, false);
  assert.equal(validateAction(game, 'blue', { action_type: ACTIONS.PLACE_WALL, target: 'C5' }).valid, true);

  setCell(game, 'D5', 'wall');
  setCell(game, 'E4', 'wall');
  setCell(game, 'E6', 'wall');
  game.players.blue.position = 'F5';
  assert.equal(validateAction(game, 'blue', { action_type: ACTIONS.PLACE_WALL, target: 'E5' }).valid, false);
});

test('traps are hidden, arm after placement, trigger on opponent movement, and scan reveals them', () => {
  let game = gameWith();
  game.players.blue.position = 'B5';
  game = resolveTurn(game, {
    blue: { action_type: ACTIONS.PLACE_TRAP, target: 'C5' },
    red: wait,
  }).game;

  assert.equal(game.traps.get('C5').armed, true);
  assert.equal(getPlayerView(game, 'red').known_tiles.known_enemy_traps.length, 0);

  game.players.red.position = 'E5';
  let scanResult = resolveTurn(game, {
    blue: wait,
    red: { action_type: ACTIONS.SCAN },
  });
  assert.deepEqual(getPlayerView(scanResult.game, 'red').known_tiles.known_enemy_traps, ['C5']);

  const triggered = resolveTurn(scanResult.game, {
    blue: wait,
    red: { action_type: ACTIONS.MOVE_WEST },
  }).game;
  assert.equal(triggered.players.red.position, 'D5');
  assert.equal(triggered.players.red.health, 10);

  const triggeredSecondStep = resolveTurn(triggered, {
    blue: wait,
    red: { action_type: ACTIONS.MOVE_WEST },
  }).game;
  assert.equal(triggeredSecondStep.players.red.position, 'C5');
  assert.equal(triggeredSecondStep.players.red.health, 7);
  assert.equal(triggeredSecondStep.traps.has('C5'), false);
});

test('bush stealth hides non-carriers outside radius two and scan records hidden opponent visibility', () => {
  const game = gameWith();
  game.players.blue.position = 'A1';
  game.players.red.position = 'G5';

  assert.equal(getPlayerView(game, 'blue').opponent.visible, false);
  assert.equal(getSpectatorView(game).full_board_state.players.red.hidden_in_bush, true);

  game.players.blue.position = 'E5';
  assert.equal(getPlayerView(game, 'blue').opponent.visible, true);

  game.players.blue.position = 'A1';
  game.players.red.carryingRelic = true;
  assert.equal(getPlayerView(game, 'blue').opponent.visible, true);
  assert.equal(getSpectatorView(game).full_board_state.players.red.hidden_in_bush, false);
});

test('combat applies bush and carrier bonuses, guard reduction, heal cap, damage relic drop, knockout stun, and respawn skip', () => {
  let game = gameWith();
  game.players.blue.position = 'C5';
  game.players.red.position = 'D5';
  game.players.red.carryingRelic = true;
  game.relic.carriedBy = 'red';

  game = resolveTurn(game, {
    blue: { action_type: ACTIONS.ATTACK },
    red: wait,
  }).game;
  assert.equal(game.players.red.health, 6);
  assert.equal(game.players.red.carryingRelic, false);
  assert.equal(game.relic.position, 'D5');
  assert.equal(game.relic.pickupBlockedTurn, 0);

  game.players.red.health = 2;
  game.players.red.carryingRelic = true;
  game.relic.carriedBy = 'red';
  game.relic.position = null;
  game = resolveTurn(game, {
    blue: { action_type: ACTIONS.ATTACK },
    red: { action_type: ACTIONS.HEAL },
  }).game;
  assert.equal(game.players.red.health, 1);

  const guarded = gameWith();
  guarded.players.blue.position = 'C5';
  guarded.players.red.position = 'D5';
  const guardedResult = resolveTurn(guarded, {
    blue: { action_type: ACTIONS.ATTACK },
    red: { action_type: ACTIONS.GUARD },
  }).game;
  assert.equal(guardedResult.players.red.health, 9);

  game = resolveTurn(game, {
    blue: { action_type: ACTIONS.ATTACK },
    red: wait,
  }).game;
  assert.equal(game.players.red.stunned, true);
  assert.equal(game.players.red.health, 0);

  game = resolveTurn(game, {
    blue: wait,
    red: { action_type: ACTIONS.MOVE_NORTH },
  }).game;
  assert.equal(game.players.red.stunned, false);
  assert.equal(game.players.red.position, 'I5');
  assert.equal(game.players.red.health, 5);
});

test('relic auto-pickup, voluntary drop, blocked same-turn re-pickup, and win on own base', () => {
  let game = gameWith();
  game.players.blue.position = 'E5';
  game.players.red.position = 'I5';

  game = resolveTurn(game, { blue: wait, red: wait }).game;
  assert.equal(game.players.blue.carryingRelic, true);
  assert.equal(game.relic.carriedBy, 'blue');

  game = resolveTurn(game, {
    blue: { action_type: ACTIONS.DROP_RELIC },
    red: wait,
  }).game;
  assert.equal(game.players.blue.carryingRelic, false);
  assert.equal(game.relic.position, 'E5');

  game.players.blue.position = 'A5';
  game.players.blue.carryingRelic = true;
  game.relic = { position: null, carriedBy: 'blue', lastKnownPosition: 'A5', pickupBlockedTurn: null };
  game = resolveTurn(game, { blue: wait, red: wait }).game;
  assert.equal(game.winner, 'blue');
});

test('legal actions expose only currently valid actions and target coordinates', () => {
  const game = gameWith();
  game.players.blue.position = 'B5';
  const legal = getLegalActions(game, 'blue');
  const names = legal.map((action) => action.action_type);

  assert.equal(names.includes(ACTIONS.MOVE_EAST), true);
  assert.equal(names.includes(ACTIONS.MOVE_WEST), true);
  assert.equal(names.includes(ACTIONS.DASH_EAST), true);
  assert.equal(legal.some((action) => action.action_type === ACTIONS.PLACE_WALL && action.target === 'C5'), true);
  assert.equal(legal.some((action) => action.action_type === ACTIONS.PLACE_TRAP && action.target === 'A5'), false);
});

test('player-visible legal actions do not leak unrevealed adjacent enemy traps', () => {
  const game = gameWith();
  game.players.blue.position = 'B5';
  game.traps.set('C5', { owner: 'red', armed: true, revealedTo: new Set() });

  assert.equal(getLegalActions(game, 'blue').some((action) => action.action_type === ACTIONS.PLACE_WALL && action.target === 'C5'), false);
  assert.equal(getPlayerView(game, 'blue').legal_actions.some((action) => action.action_type === ACTIONS.PLACE_WALL && action.target === 'C5'), true);
});

test('series swaps sides, ignores turn-cap replays, and decides odd-N formats', () => {
  let series = createSeries({ bestOf: 3, playerNames: { player_1: 'Ada', player_2: 'Turing' } });

  assert.equal(series.currentGame.slotSides.player_1, 'blue');
  assert.equal(series.currentGame.slotSides.player_2, 'red');

  series.currentGame.turn = 100;
  const capped = resolveTurn(series.currentGame, { blue: wait, red: wait }).game;
  assert.equal(capped.replayRequired, true);

  series.recordGame('player_1');
  series.startNextGame();
  assert.equal(series.score.player_1, 1);
  assert.equal(series.currentGame.slotSides.player_1, 'red');
  assert.equal(series.currentGame.slotSides.player_2, 'blue');

  series.recordGame('player_1');
  assert.equal(series.decided, true);
  assert.equal(series.seriesWinner, 'player_1');
});
