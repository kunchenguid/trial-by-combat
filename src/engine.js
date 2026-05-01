export const ACTIONS = Object.freeze({
  MOVE_NORTH: 'MOVE_NORTH',
  MOVE_SOUTH: 'MOVE_SOUTH',
  MOVE_EAST: 'MOVE_EAST',
  MOVE_WEST: 'MOVE_WEST',
  DASH_NORTH: 'DASH_NORTH',
  DASH_SOUTH: 'DASH_SOUTH',
  DASH_EAST: 'DASH_EAST',
  DASH_WEST: 'DASH_WEST',
  ATTACK: 'ATTACK',
  GUARD: 'GUARD',
  HEAL: 'HEAL',
  SCAN: 'SCAN',
  PLACE_WALL: 'PLACE_WALL',
  PLACE_TRAP: 'PLACE_TRAP',
  DROP_RELIC: 'DROP_RELIC',
  WAIT: 'WAIT',
});

export const SIDES = ['blue', 'red'];
export const SLOTS = ['player_1', 'player_2'];
export const RULESET_VERSION = 'capture-relic-2.6';
export const TURN_CAP = 100;
export const BOARD_SIZE = 9;
export const MAX_INVENTORY_PER_ITEM = 5;

export const BUFF_TYPES = Object.freeze({
  DASH_PACK: 'dash_pack',
  BIG_HEAL: 'big_heal',
});

const BUFF_TYPE_VALUES = new Set(Object.values(BUFF_TYPES));
const DASH_PACK_AMOUNT = 3;

const DIRS = Object.freeze({
  NORTH: [0, -1],
  SOUTH: [0, 1],
  EAST: [1, 0],
  WEST: [-1, 0],
});

const MOVE_DIR_BY_ACTION = Object.freeze({
  [ACTIONS.MOVE_NORTH]: 'NORTH',
  [ACTIONS.MOVE_SOUTH]: 'SOUTH',
  [ACTIONS.MOVE_EAST]: 'EAST',
  [ACTIONS.MOVE_WEST]: 'WEST',
  [ACTIONS.DASH_NORTH]: 'NORTH',
  [ACTIONS.DASH_SOUTH]: 'SOUTH',
  [ACTIONS.DASH_EAST]: 'EAST',
  [ACTIONS.DASH_WEST]: 'WEST',
});

export const CENTER_CHOKE = Object.freeze({
  id: 'center_choke',
  bases: {
    blue: ['A4', 'A5', 'A6'],
    red: ['I4', 'I5', 'I6'],
  },
  relicStart: 'E5',
  starts: {
    blue: 'A5',
    red: 'I5',
  },
  walls: ['D6', 'D7', 'F2', 'F3', 'B4', 'C4', 'G4', 'H4'],
  bushes: ['B2', 'C2', 'C3', 'C5', 'C7', 'E3', 'G5', 'G6', 'G7', 'H2', 'H3', 'I2'],
  fire: ['D2', 'F6'],
});

export const DEFAULT_MAP = Object.freeze({
  id: 'default-v1',
  bases: {
    blue: ['A4', 'A5', 'A6'],
    red: ['I4', 'I5', 'I6'],
  },
  relicStart: 'E5',
  starts: {
    blue: 'A5',
    red: 'I5',
  },
  walls: ['D4', 'D6', 'F4', 'F6', 'B5', 'H5'],
  bushes: ['D5', 'F5', 'E4', 'E6', 'C5', 'G5', 'C3', 'C7', 'G3', 'G7', 'D3', 'D7', 'F3', 'F7'],
  fire: [],
  buffs: [
    { coord: 'D5', type: 'dash_pack' },
    { coord: 'F5', type: 'dash_pack' },
    { coord: 'E4', type: 'big_heal' },
    { coord: 'E6', type: 'big_heal' },
  ],
});

export const DEFAULT_STARTING_INVENTORY = Object.freeze({
  wall: 2,
  trap: 2,
  scan: 1,
  dash: 1,
  heal: 1,
});

export const INVENTORY_KEYS = Object.freeze(['wall', 'trap', 'scan', 'dash', 'heal']);

function parseBuffs(rawBuffs) {
  const buffs = new Map();
  if (!rawBuffs) return buffs;
  for (const entry of rawBuffs) {
    if (!entry?.coord || !entry.type) {
      throw new Error('Buff entries require coord and type.');
    }
    if (!BUFF_TYPE_VALUES.has(entry.type)) {
      throw new Error(`Unknown buff type: ${entry.type}`);
    }
    const coord = String(entry.coord).toUpperCase();
    if (!coordToPoint(coord)) throw new Error(`Buff coord ${entry.coord} is not on the board.`);
    if (buffs.has(coord)) throw new Error(`Duplicate buff at ${coord}.`);
    buffs.set(coord, { type: entry.type });
  }
  return buffs;
}

function resolveStartingInventory(mapDef) {
  const override = mapDef?.inventory;
  if (!override) return { ...DEFAULT_STARTING_INVENTORY };
  const out = { ...DEFAULT_STARTING_INVENTORY };
  for (const k of INVENTORY_KEYS) {
    if (Object.hasOwn(override, k)) out[k] = override[k];
  }
  return out;
}

export function createGame({
  playerNames = { player_1: 'Player 1', player_2: 'Player 2' },
  gameNumber = 1,
  slotSides = { player_1: 'blue', player_2: 'red' },
  matchId = `match_${Date.now()}`,
  map: mapDef = DEFAULT_MAP,
} = {}) {
  const sideSlots = invertSlotSides(slotSides);
  const startingInventory = resolveStartingInventory(mapDef);
  const map = {
    id: mapDef.id,
    bases: structuredClone(mapDef.bases),
    starts: { ...mapDef.starts },
    relicStart: mapDef.relicStart,
    walls: new Set(mapDef.walls ?? []),
    bushes: new Set(mapDef.bushes ?? []),
    fire: new Set(mapDef.fire ?? []),
    buffs: parseBuffs(mapDef.buffs),
    startingInventory,
  };
  const game = {
    rulesetVersion: RULESET_VERSION,
    matchId,
    gameNumber,
    turn: 0,
    phase: 'awaiting_action',
    winner: null,
    winningSlot: null,
    replayRequired: false,
    slotSides: { ...slotSides },
    sideSlots,
    playerNames: { ...playerNames },
    map,
    players: {
      blue: createPlayer('blue', sideSlots.blue, mapDef.starts.blue, startingInventory),
      red: createPlayer('red', sideSlots.red, mapDef.starts.red, startingInventory),
    },
    relic: {
      position: mapDef.relicStart,
      carriedBy: null,
      lastKnownPosition: mapDef.relicStart,
      pickupBlockedTurn: null,
    },
    traps: new Map(),
    eventLog: [],
    invalidAttempts: { blue: 0, red: 0 },
    lastActions: { blue: null, red: null },
    lastActionLatencyMs: { blue: null, red: null },
    submittedActions: [],
    metrics: {},
  };
  game.metrics = computeMapMetrics(game);
  return game;
}

function createPlayer(side, slot, position, startingInventory = DEFAULT_STARTING_INVENTORY) {
  return {
    side,
    slot,
    position,
    health: 10,
    maxHealth: 10,
    carryingRelic: false,
    inventory: { ...startingInventory },
    stunned: false,
    skipNextTurn: false,
    knownEnemyTraps: new Set(),
    scanRevealedOpponent: false,
  };
}

export function createSeries({ bestOf = 1, playerNames = { player_1: 'Player 1', player_2: 'Player 2' } } = {}) {
  if (![1, 3, 5, 7].includes(bestOf)) {
    throw new Error('Series length must be BO1, BO3, BO5, or BO7.');
  }
  const series = {
    bestOf,
    format: `BO${bestOf}`,
    gameNumber: 1,
    score: { player_1: 0, player_2: 0 },
    playerNames: { ...playerNames },
    decided: false,
    seriesWinner: null,
    currentGame: null,
    recordGame(slot) {
      if (!SLOTS.includes(slot)) throw new Error(`Unknown slot ${slot}`);
      this.score[slot] += 1;
      if (this.score[slot] > this.bestOf / 2) {
        this.decided = true;
        this.seriesWinner = slot;
      }
    },
    startNextGame() {
      if (this.decided) return null;
      this.gameNumber += 1;
      this.currentGame = createGame({
        playerNames: this.playerNames,
        gameNumber: this.gameNumber,
        slotSides: slotSidesForGame(this.gameNumber),
      });
      return this.currentGame;
    },
    restartCurrentGame() {
      this.currentGame = createGame({
        playerNames: this.playerNames,
        gameNumber: this.gameNumber,
        slotSides: slotSidesForGame(this.gameNumber),
      });
      return this.currentGame;
    },
  };
  series.currentGame = createGame({
    playerNames,
    gameNumber: 1,
    slotSides: slotSidesForGame(1),
  });
  return series;
}

export function slotSidesForGame(_gameNumber) {
  return { player_1: 'blue', player_2: 'red' };
}

function invertSlotSides(slotSides) {
  return Object.fromEntries(Object.entries(slotSides).map(([slot, side]) => [side, slot]));
}

export function cloneGame(game) {
  return {
    ...game,
    slotSides: { ...game.slotSides },
    sideSlots: { ...game.sideSlots },
    playerNames: { ...game.playerNames },
    map: {
      ...game.map,
      bases: structuredClone(game.map.bases),
      starts: { ...game.map.starts },
      walls: new Set(game.map.walls),
      bushes: new Set(game.map.bushes),
      fire: new Set(game.map.fire),
      buffs: new Map([...game.map.buffs.entries()].map(([coord, buff]) => [coord, { ...buff }])),
    },
    players: Object.fromEntries(
      SIDES.map((side) => [
        side,
        {
          ...game.players[side],
          inventory: { ...game.players[side].inventory },
          knownEnemyTraps: new Set(game.players[side].knownEnemyTraps),
        },
      ]),
    ),
    relic: { ...game.relic },
    traps: new Map(
      [...game.traps.entries()].map(([coord, trap]) => [
        coord,
        { ...trap, revealedTo: new Set(trap.revealedTo ?? []) },
      ]),
    ),
    eventLog: game.eventLog.map((event) => ({ ...event })),
    invalidAttempts: { ...game.invalidAttempts },
    lastActions: { ...game.lastActions },
    lastActionLatencyMs: { ...game.lastActionLatencyMs },
    submittedActions: game.submittedActions.map((entry) => ({ ...entry, action: { ...entry.action } })),
    metrics: structuredClone(game.metrics),
  };
}

export function coordToPoint(coord) {
  const match = /^([A-I])([1-9])$/.exec(String(coord).toUpperCase());
  if (!match) return null;
  return {
    x: match[1].charCodeAt(0) - 65,
    y: Number(match[2]) - 1,
  };
}

export function pointToCoord({ x, y }) {
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return null;
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

export function manhattan(a, b) {
  const pa = coordToPoint(a);
  const pb = coordToPoint(b);
  if (!pa || !pb) return Infinity;
  return Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
}

export function adjacent(a, b) {
  return manhattan(a, b) === 1;
}

export function placementAdjacent(a, b) {
  const pa = coordToPoint(a);
  const pb = coordToPoint(b);
  if (!pa || !pb) return false;
  const dx = Math.abs(pa.x - pb.x);
  const dy = Math.abs(pa.y - pb.y);
  return (dx | dy) !== 0 && dx <= 1 && dy <= 1;
}

export function placementAdjacentCoords(coord) {
  const point = coordToPoint(coord);
  if (!point) return [];
  const out = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const c = pointToCoord({ x: point.x + dx, y: point.y + dy });
      if (c) out.push(c);
    }
  }
  return out;
}

export function stepCoord(coord, direction) {
  const point = coordToPoint(coord);
  const delta = DIRS[direction];
  if (!point || !delta) return null;
  return pointToCoord({ x: point.x + delta[0], y: point.y + delta[1] });
}

export function allCoords() {
  const coords = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      coords.push(pointToCoord({ x, y }));
    }
  }
  return coords;
}

export function setCell(game, coord, kind) {
  if (kind === 'wall') {
    game.map.walls.add(coord);
  } else if (kind === 'floor') {
    game.map.walls.delete(coord);
    game.map.bushes.delete(coord);
    game.map.fire.delete(coord);
    game.traps.delete(coord);
  } else if (kind === 'bush') {
    game.map.bushes.add(coord);
  } else if (kind === 'fire') {
    game.map.fire.add(coord);
  } else {
    throw new Error(`Unsupported cell kind ${kind}`);
  }
}

export function validateAction(game, side, action, options = {}) {
  const player = game.players[side];
  if (!player) return invalid('Unknown player side.');
  if (!action || !Object.values(ACTIONS).includes(action.action_type)) return invalid('Unknown action.');
  if (game.winner || game.replayRequired) return invalid('Game is over.');
  if (player.stunned && action.action_type !== ACTIONS.WAIT)
    return invalid('You are stunned and must skip this action.');
  if (player.skipNextTurn && action.action_type !== ACTIONS.WAIT)
    return invalid('You are stunned by a trap and must skip this turn.');

  const type = action.action_type;
  if (type === ACTIONS.WAIT) return valid();
  if (type === ACTIONS.GUARD) return valid();
  if (type === ACTIONS.ATTACK) return valid();
  if (type === ACTIONS.DROP_RELIC) return player.carryingRelic ? valid() : invalid('You are not carrying the relic.');
  if (type === ACTIONS.HEAL) {
    if (player.inventory.heal <= 0) return invalid('No heal remaining.');
    if (player.health >= player.maxHealth) return invalid('Health is already full.');
    return valid();
  }
  if (type === ACTIONS.SCAN) {
    if (player.inventory.scan <= 0) return invalid('No scan remaining.');
    return valid();
  }
  if (type.startsWith('MOVE_')) {
    const target = stepCoord(player.position, MOVE_DIR_BY_ACTION[type]);
    if (!target) return invalid('Move would leave the board.');
    if (game.map.walls.has(target)) return invalid('Move is blocked by a wall.');
    if (occupiedBy(game, target)) return invalid('Move is blocked by an occupied tile.');
    return valid();
  }
  if (type.startsWith('DASH_')) {
    if (player.inventory.dash <= 0) return invalid('No dash remaining.');
    if (player.carryingRelic) return invalid('Cannot dash while carrying the relic.');
    const first = stepCoord(player.position, MOVE_DIR_BY_ACTION[type]);
    if (!first) return invalid('Dash would leave the board.');
    if (game.map.walls.has(first)) return invalid('Dash is blocked by a wall.');
    if (occupiedBy(game, first)) return invalid('Dash is blocked by an occupied tile.');
    return valid();
  }
  if (type === ACTIONS.PLACE_WALL || type === ACTIONS.PLACE_TRAP) {
    const item = type === ACTIONS.PLACE_WALL ? 'wall' : 'trap';
    if (player.inventory[item] <= 0) return invalid(`No ${item} remaining.`);
    return validatePlacement(game, side, action.target, item, options);
  }
  return invalid('Unsupported action.');
}

function validatePlacement(game, side, target, item, options = {}) {
  const coord = String(target ?? '').toUpperCase();
  if (!coordToPoint(coord)) return invalid('Target must be a board coordinate.');
  const player = game.players[side];
  if (!placementAdjacent(player.position, coord)) return invalid('Target must be adjacent (including diagonal).');
  if (!isEmptyForPlacement(game, coord, side, options)) return invalid('Target must be empty.');
  if (item === 'wall') {
    const trial = cloneGame(game);
    trial.map.walls.add(coord);
    if (!allPathInvariantsHold(trial)) return invalid('Wall would block a required path.');
  }
  return valid();
}

function valid() {
  return { valid: true, error: null };
}

function invalid(error) {
  return { valid: false, error };
}

export function getLegalActions(game, side, options = {}) {
  const player = game.players[side];
  if (!player || game.winner || game.replayRequired) return [];
  if (player.stunned || player.skipNextTurn) return [{ action_type: ACTIONS.WAIT }];
  const actions = [{ action_type: ACTIONS.WAIT }, { action_type: ACTIONS.GUARD }, { action_type: ACTIONS.ATTACK }];
  for (const action_type of [
    ACTIONS.MOVE_NORTH,
    ACTIONS.MOVE_SOUTH,
    ACTIONS.MOVE_EAST,
    ACTIONS.MOVE_WEST,
    ACTIONS.DASH_NORTH,
    ACTIONS.DASH_SOUTH,
    ACTIONS.DASH_EAST,
    ACTIONS.DASH_WEST,
    ACTIONS.HEAL,
    ACTIONS.SCAN,
    ACTIONS.DROP_RELIC,
  ]) {
    const action = { action_type };
    if (validateAction(game, side, action, options).valid) actions.push(action);
  }
  for (const target of placementAdjacentCoords(player.position)) {
    for (const action_type of [ACTIONS.PLACE_WALL, ACTIONS.PLACE_TRAP]) {
      const action = { action_type, target };
      if (validateAction(game, side, action, options).valid) actions.push(action);
    }
  }
  return actions;
}

export function resolveTurn(inputGame, actionsBySide) {
  const game = cloneGame(inputGame);
  const events = [];
  const preTurn = cloneGame(game);
  const normalized = {};
  const startedInBush = {};
  const guarded = {};
  const damage = { blue: 0, red: 0 };
  const damagedForRelicDrop = new Set();
  const droppedByDamage = new Set();
  const movementIntents = {};

  for (const side of SIDES) {
    const action = normalizeAction(actionsBySide[side]);
    const validation = validateAction(game, side, action);
    normalized[side] = validation.valid ? action : { action_type: ACTIONS.WAIT };
    startedInBush[side] = game.map.bushes.has(game.players[side].position);
    guarded[side] = normalized[side].action_type === ACTIONS.GUARD;
    if (action.timed_out) {
      events.push(publicEvent(game, 'turn_timeout', side, `${label(side)} missed the turn (timer expired).`));
    }
    if (!validation.valid) {
      game.invalidAttempts[side] += 1;
      events.push(
        publicEvent(game, 'invalid_action', side, `${label(side)} invalid action became WAIT: ${validation.error}`),
      );
    }
  }

  for (const side of SIDES) {
    const player = game.players[side];
    if (player.stunned) {
      normalized[side] = { action_type: ACTIONS.WAIT };
      respawnPlayer(game, side);
      events.push(publicEvent(game, 'respawn', side, `${label(side)} skipped a turn and respawned.`));
    } else if (player.skipNextTurn) {
      normalized[side] = { action_type: ACTIONS.WAIT };
      player.skipNextTurn = false;
      events.push(publicEvent(game, 'trap_stun', side, `${label(side)} is stunned by a trap and skipped a turn.`));
    }
  }

  for (const side of SIDES) {
    if (normalized[side].action_type === ACTIONS.HEAL) {
      const player = game.players[side];
      player.inventory.heal -= 1;
      player.health = Math.min(player.maxHealth, player.health + 3);
      events.push(publicEvent(game, 'heal', side, `${label(side)} healed to ${player.health}/${player.maxHealth}.`));
    }
  }

  for (const side of SIDES) {
    if (normalized[side].action_type === ACTIONS.SCAN) {
      applyScan(game, side, events);
    }
  }

  for (const side of SIDES) {
    if (normalized[side].action_type.startsWith('DASH_')) {
      game.players[side].inventory.dash -= 1;
    }
  }

  // Traps are placed BEFORE movement so an opponent stepping into the target
  // this same turn triggers the trap. Walls are still placed after movement
  // (further down) so a wall can't retroactively block an in-flight move.
  for (const side of SIDES) {
    const action = normalized[side];
    if (action.action_type !== ACTIONS.PLACE_TRAP) continue;
    const validation = validatePlacement(game, side, action.target, 'trap');
    if (!validation.valid) {
      events.push(
        publicEvent(game, 'placement_failed', side, `${label(side)} could not place trap: ${validation.error}`),
      );
      continue;
    }
    game.players[side].inventory.trap -= 1;
    game.traps.set(action.target, { owner: side, armed: true, revealedTo: new Set() });
    events.push(privateEvent(game, side, 'trap_placed', `${label(side)} placed a trap at ${action.target}.`));
  }

  for (let step = 1; step <= 2; step += 1) {
    for (const side of SIDES) {
      const type = normalized[side].action_type;
      if (!type.startsWith('MOVE_') && !type.startsWith('DASH_')) continue;
      if (type.startsWith('MOVE_') && step > 1) continue;
      const current = game.players[side].position;
      const target = stepCoord(current, MOVE_DIR_BY_ACTION[type]);
      movementIntents[side] = { from: current, target, step };
    }
    resolveMovementStep(game, normalized, movementIntents, step, damage, damagedForRelicDrop, events);
    movementIntents.blue = null;
    movementIntents.red = null;
  }

  // Pick up a free relic right after movement so a same-turn attack from an
  // adjacent opponent can land on the new carrier and force-drop it via the
  // damage-application step below.
  autoPickupRelic(game, events);

  for (const side of SIDES) {
    if (normalized[side].action_type === ACTIONS.ATTACK) {
      const other = opponentOf(side);
      if (adjacent(game.players[side].position, game.players[other].position)) {
        let amount = startedInBush[side] ? 5 : 2;
        if (game.players[other].carryingRelic) amount += 1;
        damage[other] += amount;
        events.push({
          ...publicEvent(game, 'attack', side, `${label(side)} attacked ${label(other)} for ${amount} damage.`),
          meta: { target: game.players[other].position },
        });
      } else {
        events.push(publicEvent(game, 'attack_miss', side, `${label(side)} attacked, but no opponent was adjacent.`));
      }
    }
  }

  for (const side of SIDES) {
    const reduced = guarded[side] ? Math.max(0, damage[side] - 2) : damage[side];
    if (reduced > 0) {
      game.players[side].health = Math.max(0, game.players[side].health - reduced);
      if (reduced >= 3) damagedForRelicDrop.add(side);
      events.push(publicEvent(game, 'damage', side, `${label(side)} took ${reduced} damage.`));
    }
  }

  for (const side of SIDES) {
    if (damagedForRelicDrop.has(side) && game.players[side].carryingRelic) {
      dropRelic(game, side, true);
      droppedByDamage.add(side);
      events.push(publicEvent(game, 'relic_dropped', side, `${label(side)} dropped the relic after heavy damage.`));
    }
  }

  for (const side of SIDES) {
    if (normalized[side].action_type === ACTIONS.DROP_RELIC && game.players[side].carryingRelic) {
      dropRelic(game, side, true);
      events.push(publicEvent(game, 'relic_dropped', side, `${label(side)} dropped the relic.`));
    }
  }

  for (const side of SIDES) {
    if (game.players[side].health <= 0 && !game.players[side].stunned) {
      if (game.players[side].carryingRelic) {
        dropRelic(game, side, true);
        droppedByDamage.add(side);
      }
      game.players[side].stunned = true;
      game.players[side].health = 0;
      events.push(publicEvent(game, 'knockout', side, `${label(side)} was knocked out.`));
    }
  }

  for (const side of SIDES) {
    const action = normalized[side];
    if (action.action_type !== ACTIONS.PLACE_WALL) continue;
    const validation = validatePlacement(game, side, action.target, 'wall');
    if (!validation.valid) {
      events.push(
        publicEvent(game, 'placement_failed', side, `${label(side)} could not place wall: ${validation.error}`),
      );
      continue;
    }
    game.players[side].inventory.wall -= 1;
    game.map.walls.add(action.target);
    events.push(publicEvent(game, 'wall_placed', side, `${label(side)} placed a wall at ${action.target}.`));
  }

  resolveBuffPickups(game, events);
  autoPickupRelic(game, events);
  checkWin(game, events);

  game.turn += 1;
  if (!game.winner && game.turn >= TURN_CAP) {
    game.replayRequired = true;
    events.push(publicEvent(game, 'turn_cap', null, 'Turn cap reached. This game is replayed and does not count.'));
  }

  game.lastActions = Object.fromEntries(SIDES.map((side) => [side, normalized[side]]));
  game.submittedActions.push({
    turn: preTurn.turn,
    actions: Object.fromEntries(SIDES.map((side) => [side, normalized[side]])),
  });
  let nextSeq = game.eventLog.length;
  for (const event of events) event.seq = nextSeq++;
  game.eventLog.push(...events);
  game.metrics = computeMapMetrics(game);

  return { game, events, actions: normalized, droppedByDamage: [...droppedByDamage] };
}

function normalizeAction(action) {
  const normalized = { ...(action ?? { action_type: ACTIONS.WAIT }) };
  normalized.action_type ??= ACTIONS.WAIT;
  if (normalized.target) normalized.target = String(normalized.target).toUpperCase();
  if (normalized.intent_summary) {
    normalized.intent_summary = normalized.intent_summary.split(/\s+/).slice(0, 20).join(' ');
  }
  return normalized;
}

function resolveMovementStep(game, actions, intents, step, damage, damagedForRelicDrop, events) {
  const active = SIDES.filter((side) => {
    const intent = intents[side];
    const type = actions[side].action_type;
    return intent && intent.step === step && (type.startsWith('MOVE_') || type.startsWith('DASH_'));
  });
  if (active.length === 0) return;
  const blocked = new Set();
  const [blueIntent, redIntent] = [intents.blue, intents.red];

  for (const side of active) {
    const intent = intents[side];
    const other = opponentOf(side);
    if (!intent.target || game.map.walls.has(intent.target)) {
      blocked.add(side);
    } else if (intent.target === game.players[other].position && !intents[other]) {
      blocked.add(side);
    }
  }

  if (blueIntent && redIntent) {
    if (blueIntent.target === redIntent.target) {
      blocked.add('blue');
      blocked.add('red');
    }
    if (blueIntent.target === game.players.red.position && redIntent.target === game.players.blue.position) {
      blocked.add('blue');
      blocked.add('red');
    }
  }

  for (const side of active) {
    if (blocked.has(side)) {
      events.push(publicEvent(game, 'move_blocked', side, `${label(side)} was blocked while moving.`));
      if (actions[side].action_type.startsWith('DASH_')) {
        actions[side] = { action_type: ACTIONS.WAIT };
      }
      continue;
    }
    const intent = intents[side];
    const from = game.players[side].position;
    game.players[side].position = intent.target;
    const moveEvent = publicEvent(game, 'move', side, `${label(side)} moved from ${from} to ${intent.target}.`);
    moveEvent.meta = { from, to: intent.target, dashed: actions[side].action_type.startsWith('DASH_'), step };
    events.push(moveEvent);
    if (game.map.fire.has(intent.target)) {
      damage[side] += 2;
      events.push(publicEvent(game, 'fire_damage', side, `${label(side)} crossed fire at ${intent.target}.`));
    }
    const trap = game.traps.get(intent.target);
    if (trap && trap.owner !== side && trap.armed) {
      damage[side] += 5;
      damagedForRelicDrop.add(side);
      game.players[side].skipNextTurn = true;
      events.push(publicEvent(game, 'trap_triggered', side, `${label(side)} triggered a trap at ${intent.target}.`));
      actions[side] = { action_type: ACTIONS.WAIT };
    }
  }
}

function applyScan(game, side, events) {
  const player = game.players[side];
  player.inventory.scan -= 1;
  for (const [coord, trap] of game.traps) {
    if (trap.owner !== side && manhattan(player.position, coord) <= 2) {
      player.knownEnemyTraps.add(coord);
      trap.revealedTo.add(side);
      events.push(publicEvent(game, 'scan_trap', side, `${label(side)} scanned and revealed a trap at ${coord}.`));
    }
  }
  const other = opponentOf(side);
  if (manhattan(player.position, game.players[other].position) <= 2) {
    player.scanRevealedOpponent = true;
    events.push(publicEvent(game, 'scan_opponent', side, `${label(side)} scanned and located ${label(other)}.`));
  } else {
    events.push(publicEvent(game, 'scan', side, `${label(side)} scanned nearby tiles.`));
  }
}

function resolveBuffPickups(game, events) {
  if (game.map.buffs.size === 0) return;
  for (const [coord, buff] of [...game.map.buffs.entries()]) {
    const occupants = SIDES.filter((side) => game.players[side].position === coord && !game.players[side].stunned);
    if (occupants.length !== 1) continue;
    const side = occupants[0];
    applyBuffEffect(game, side, buff, events, coord);
    game.map.buffs.delete(coord);
  }
}

function applyBuffEffect(game, side, buff, events, coord) {
  const player = game.players[side];
  if (buff.type === BUFF_TYPES.DASH_PACK) {
    const before = player.inventory.dash;
    player.inventory.dash = Math.min(MAX_INVENTORY_PER_ITEM, before + DASH_PACK_AMOUNT);
    const gained = player.inventory.dash - before;
    events.push(
      publicEvent(game, 'buff_picked_up', side, `${label(side)} picked up a dash pack at ${coord} (+${gained} dash).`),
    );
  } else if (buff.type === BUFF_TYPES.BIG_HEAL) {
    player.health = player.maxHealth;
    events.push(
      publicEvent(game, 'buff_picked_up', side, `${label(side)} picked up a big heal at ${coord} (full HP).`),
    );
  }
}

function autoPickupRelic(game, events) {
  if (game.relic.carriedBy || !game.relic.position) return;
  if (game.relic.pickupBlockedTurn === game.turn) return;
  const occupants = SIDES.filter(
    (side) => game.players[side].position === game.relic.position && !game.players[side].stunned,
  );
  if (occupants.length === 1) {
    const side = occupants[0];
    game.players[side].carryingRelic = true;
    game.relic.carriedBy = side;
    game.relic.position = null;
    game.relic.lastKnownPosition = game.players[side].position;
    events.push(publicEvent(game, 'relic_picked_up', side, `${label(side)} picked up the relic.`));
  }
}

function dropRelic(game, side, causedByDamage) {
  const player = game.players[side];
  player.carryingRelic = false;
  game.relic.carriedBy = null;
  game.relic.position = player.position;
  game.relic.lastKnownPosition = player.position;
  game.relic.pickupBlockedTurn = causedByDamage ? game.turn : null;
}

function checkWin(game, events) {
  for (const side of SIDES) {
    const player = game.players[side];
    if (player.carryingRelic && game.map.bases[side].includes(player.position)) {
      game.winner = side;
      game.winningSlot = player.slot;
      game.phase = 'game_over';
      events.push(publicEvent(game, 'win', side, `${label(side)} captured the relic at ${player.position}.`));
    }
  }
}

function respawnPlayer(game, side) {
  const player = game.players[side];
  player.stunned = false;
  player.skipNextTurn = false;
  player.health = 5;
  player.position = nearestRespawnTile(game, side);
}

function nearestRespawnTile(game, side) {
  const baseTiles = game.map.bases[side];
  const preferredBaseTiles = [baseTiles[1], baseTiles[0], baseTiles[2]];
  for (const coord of preferredBaseTiles) {
    if (!occupiedBy(game, coord, side) && !game.map.walls.has(coord)) return coord;
  }
  const candidates = new Set();
  for (const base of baseTiles) {
    for (const coord of adjacentCoords(base)) candidates.add(coord);
  }
  return (
    [...candidates]
      .filter((coord) => !occupiedBy(game, coord, side) && !game.map.walls.has(coord))
      .sort((a, b) => manhattan(a, baseTiles[1]) - manhattan(b, baseTiles[1]) || a.localeCompare(b))[0] ?? baseTiles[1]
  );
}

function isEmptyForPlacement(game, coord, side = null, options = {}) {
  if (game.map.walls.has(coord)) return false;
  if (game.traps.has(coord)) {
    const trap = game.traps.get(coord);
    const hiddenEnemyTrap =
      side && trap.owner !== side && !trap.revealedTo.has(side) && !game.players[side].knownEnemyTraps.has(coord);
    if (!(options.playerVisible && hiddenEnemyTrap)) return false;
  }
  if (game.relic.position === coord) return false;
  if (game.map.buffs.has(coord)) return false;
  if (Object.values(game.map.bases).some((bases) => bases.includes(coord))) return false;
  if (occupiedBy(game, coord)) return false;
  return true;
}

function occupiedBy(game, coord, exceptSide = null) {
  return (
    SIDES.find((side) => side !== exceptSide && game.players[side].position === coord && !game.players[side].stunned) ??
    null
  );
}

function adjacentCoords(coord) {
  return Object.keys(DIRS)
    .map((direction) => stepCoord(coord, direction))
    .filter(Boolean);
}

function opponentOf(side) {
  return side === 'blue' ? 'red' : 'blue';
}

function label(side) {
  if (!side) return 'System';
  return side === 'blue' ? 'Blue' : 'Red';
}

function publicEvent(game, eventType, actor, summary) {
  return {
    turn: game.turn,
    phase: 'resolution',
    visibility: 'public',
    event_type: eventType,
    actor,
    summary,
  };
}

function privateEvent(game, side, eventType, summary) {
  return {
    turn: game.turn,
    phase: 'resolution',
    visibility: `private_${side}`,
    event_type: eventType,
    actor: side,
    summary,
  };
}

export function getPlayerView(game, side, timerSecondsRemaining = null) {
  const player = game.players[side];
  const otherSide = opponentOf(side);
  const opponent = game.players[otherSide];
  const opponentVisible = isOpponentVisible(game, side);
  const sideSlot = player.slot;
  const opponentSlot = opponent.slot;
  const knownEnemyTraps = [...game.traps.entries()]
    .filter(([, trap]) => trap.owner !== side && (trap.revealedTo.has(side) || player.knownEnemyTraps.has(trap.coord)))
    .map(([coord]) => coord)
    .sort();
  const ownTraps = [...game.traps.entries()]
    .filter(([, trap]) => trap.owner === side)
    .map(([coord]) => coord)
    .sort();
  const relicStatus = relicStatusFor(game, side, opponentVisible);
  return {
    match_id: game.matchId,
    game_number: game.gameNumber,
    turn: game.turn,
    side,
    slot: sideSlot,
    player_name: game.playerNames[sideSlot],
    phase: game.phase,
    you: {
      position: player.position,
      health: player.health,
      max_health: player.maxHealth,
      carrying_relic: player.carryingRelic,
      stunned: player.stunned,
      stun_skip_next_turn: player.skipNextTurn,
      inventory: { ...player.inventory },
    },
    opponent: {
      name: game.playerNames[opponentSlot],
      visible: opponentVisible,
      position: opponentVisible ? opponent.position : null,
      last_known_position: opponentVisible ? opponent.position : null,
      health: opponentVisible ? opponent.health : null,
      carrying_relic: opponentVisible ? opponent.carryingRelic : false,
      known_inventory: { ...opponent.inventory },
    },
    relic: relicStatus,
    known_tiles: {
      walls: [...game.map.walls].sort(),
      bushes: [...game.map.bushes].sort(),
      fire: [...game.map.fire].sort(),
      buffs: serializeBuffs(game),
      known_enemy_traps: knownEnemyTraps,
      own_traps: ownTraps,
    },
    legal_actions: getLegalActions(game, side, { playerVisible: true }),
    last_events_visible_to_you: visibleEventsFor(game, side)
      .slice(-6)
      .map((event) => `Turn ${event.turn}: ${event.summary}`),
    turn_timer_seconds_remaining: timerSecondsRemaining,
    winner: game.winner,
    replay_required: game.replayRequired,
  };
}

function isOpponentVisible(game, viewerSide) {
  const player = game.players[viewerSide];
  const opponent = game.players[opponentOf(viewerSide)];
  if (opponent.carryingRelic) return true;
  if (!game.map.bushes.has(opponent.position)) return true;
  if (manhattan(player.position, opponent.position) <= 2) return true;
  if (player.scanRevealedOpponent) return true;
  return false;
}

function relicStatusFor(game, side, opponentVisible) {
  if (game.relic.carriedBy === side) {
    return { status: 'carried_by_you', position: null, last_known_position: game.relic.lastKnownPosition };
  }
  if (game.relic.carriedBy === opponentOf(side)) {
    return {
      status: opponentVisible ? 'carried_by_opponent' : 'unknown',
      position: null,
      last_known_position: game.relic.lastKnownPosition,
    };
  }
  return { status: 'free', position: game.relic.position, last_known_position: game.relic.lastKnownPosition };
}

function serializeBuffs(game) {
  return [...game.map.buffs.entries()]
    .map(([coord, buff]) => ({ coord, type: buff.type }))
    .sort((a, b) => a.coord.localeCompare(b.coord));
}

function visibleEventsFor(game, side) {
  return game.eventLog.filter((event) => event.visibility === 'public' || event.visibility === `private_${side}`);
}

export function getSpectatorView(
  game,
  { xray = false, timerSecondsRemaining = null, actionStatuses = {}, actionThoughts = {} } = {},
) {
  return {
    turn: game.turn,
    phase: game.phase,
    match: {
      game_number: game.gameNumber,
    },
    full_board_state: serializeBoard(game, { actionStatuses, actionThoughts }),
    blue_private_state: xray ? privateState(game, 'blue') : null,
    red_private_state: xray ? privateState(game, 'red') : null,
    public_events: game.eventLog.slice(-32),
    advantage_breakdown: computeAdvantage(game),
    timer_seconds_remaining: timerSecondsRemaining,
    winner: game.winner,
    replay_required: game.replayRequired,
  };
}

function serializeBoard(game, { actionStatuses = {}, actionThoughts = {} } = {}) {
  return {
    size: BOARD_SIZE,
    bases: structuredClone(game.map.bases),
    walls: [...game.map.walls].sort(),
    bushes: [...game.map.bushes].sort(),
    fire: [...game.map.fire].sort(),
    buffs: serializeBuffs(game),
    traps: [...game.traps.entries()].map(([coord, trap]) => ({
      coord,
      owner: trap.owner,
      visible: true,
      armed: trap.armed,
    })),
    relic: { ...game.relic },
    players: Object.fromEntries(
      SIDES.map((side) => [side, publicPlayer(game, game.players[side], actionStatuses[side], actionThoughts[side])]),
    ),
  };
}

function publicPlayer(game, player, actionStatus, actionThought) {
  return {
    side: player.side,
    slot: player.slot,
    position: player.position,
    hidden_in_bush: game.map.bushes.has(player.position) && !player.carryingRelic,
    action_status: actionStatus ?? 'thinking',
    action_thought: actionThought ?? null,
    health: player.health,
    max_health: player.maxHealth,
    carrying_relic: player.carryingRelic,
    stunned: player.stunned || player.skipNextTurn,
    inventory: { ...player.inventory },
  };
}

function privateState(game, side) {
  return {
    known_enemy_traps: [...game.players[side].knownEnemyTraps].sort(),
    own_traps: [...game.traps.entries()]
      .filter(([, trap]) => trap.owner === side)
      .map(([coord]) => coord)
      .sort(),
  };
}

export function computeAdvantage(game) {
  let blue = 50;
  const factors = [];
  for (const side of SIDES) {
    const sign = side === 'blue' ? 1 : -1;
    const player = game.players[side];
    const other = game.players[opponentOf(side)];
    if (player.carryingRelic) {
      const dist = nearestDistance(player.position, game.map.bases[side]);
      blue += sign * (20 - Math.min(12, dist * 3));
      factors.push({ label: `${label(side)} carries relic`, supports: side });
      if (manhattan(player.position, other.position) <= 2) {
        blue -= sign * 8;
        factors.push({ label: `${label(opponentOf(side))} can intercept`, supports: opponentOf(side) });
      }
    }
  }
  const healthDiff = game.players.blue.health - game.players.red.health;
  if (healthDiff !== 0) {
    blue += healthDiff * 1.5;
    factors.push({
      label: `${healthDiff > 0 ? 'Blue' : 'Red'} is healthier`,
      supports: healthDiff > 0 ? 'blue' : 'red',
    });
  }
  const itemDiff = inventoryTotal(game.players.blue.inventory) - inventoryTotal(game.players.red.inventory);
  if (itemDiff !== 0) {
    blue += itemDiff * 2;
    factors.push({ label: `${itemDiff > 0 ? 'Blue' : 'Red'} has more items`, supports: itemDiff > 0 ? 'blue' : 'red' });
  }
  const blueScore = Math.max(5, Math.min(95, Math.round(blue)));
  const redScore = 100 - blueScore;
  if (factors.length === 0) factors.push({ label: 'Opening position is balanced', supports: 'neutral' });
  return {
    blue_score: blueScore,
    red_score: redScore,
    factors: factors.slice(0, 4),
  };
}

function inventoryTotal(inventory) {
  return Object.values(inventory).reduce((sum, count) => sum + count, 0);
}

function nearestDistance(coord, targets) {
  return Math.min(...targets.map((target) => manhattan(coord, target)));
}

function computeMapMetrics(game) {
  return {
    shortestPathToRelic: {
      blue: shortestPath(game, game.map.starts.blue, [game.relic.position ?? game.relic.lastKnownPosition]),
      red: shortestPath(game, game.map.starts.red, [game.relic.position ?? game.relic.lastKnownPosition]),
    },
  };
}

function allPathInvariantsHold(game) {
  const relicCoord = game.relic.position ?? game.relic.lastKnownPosition;
  return (
    shortestPath(game, game.players.blue.position, [relicCoord]) !== Infinity &&
    shortestPath(game, game.players.red.position, [relicCoord]) !== Infinity &&
    shortestPath(game, relicCoord, game.map.bases.blue) !== Infinity &&
    shortestPath(game, relicCoord, game.map.bases.red) !== Infinity
  );
}

function shortestPath(game, start, goals) {
  if (!start || goals.length === 0) return Infinity;
  const goalSet = new Set(goals);
  const queue = [[start, 0]];
  const visited = new Set([start]);
  while (queue.length > 0) {
    const [coord, dist] = queue.shift();
    if (goalSet.has(coord)) return dist;
    for (const next of adjacentCoords(coord)) {
      if (visited.has(next) || game.map.walls.has(next)) continue;
      visited.add(next);
      queue.push([next, dist + 1]);
    }
  }
  return Infinity;
}
