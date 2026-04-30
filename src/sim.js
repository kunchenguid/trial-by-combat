import { ACTIONS, createGame, resolveTurn, TURN_CAP } from './engine.js';

export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ITEM_TYPES = ['wall', 'trap', 'scan', 'dash', 'heal'];
const ITEM_TO_LEVER = {
  wall: 'PLACE_WALL',
  trap: 'PLACE_TRAP',
  scan: 'SCAN',
  dash: 'DASH',
  heal: 'HEAL',
};
const ACTION_LEVERS = new Set(['ATTACK', 'GUARD', 'DROP_RELIC']);
const BUFF_TYPE_TO_LEVER = {
  dash_pack: 'BUFF_DASH_PACK',
  big_heal: 'BUFF_BIG_HEAL',
};

export function simulate(map, agentBlue, agentRed, { seed = 1, turnCap = TURN_CAP, matchId = 'sim' } = {}) {
  let game = createGame({ map, matchId });
  const blueRng = makeRng(seed ^ 0x9e3779b1);
  const redRng = makeRng(seed ^ 0x85ebca6b);
  const events = [];
  const itemTypesUsed = new Set();
  const leverTypesUsed = new Set();
  const buffsPickedUpByType = {};

  while (!game.winner && !game.replayRequired && game.turn < turnCap) {
    const blueAction = safeAgent(agentBlue, game, 'blue', blueRng);
    const redAction = safeAgent(agentRed, game, 'red', redRng);
    const blueBefore = { ...game.players.blue.inventory };
    const redBefore = { ...game.players.red.inventory };
    const result = resolveTurn(game, { blue: blueAction, red: redAction });
    const newGame = result.game;
    for (const item of ITEM_TYPES) {
      if (newGame.players.blue.inventory[item] < blueBefore[item]) {
        itemTypesUsed.add(item);
        leverTypesUsed.add(ITEM_TO_LEVER[item]);
      }
      if (newGame.players.red.inventory[item] < redBefore[item]) {
        itemTypesUsed.add(item);
        leverTypesUsed.add(ITEM_TO_LEVER[item]);
      }
    }
    for (const side of ['blue', 'red']) {
      const t = result.actions[side]?.action_type;
      if (t && ACTION_LEVERS.has(t)) leverTypesUsed.add(t);
    }
    for (const ev of result.events) {
      if (ev.event_type === 'buff_picked_up') {
        const match = /\b(dash pack|big heal)\b/.exec(ev.summary);
        const type = match ? match[1].replace(' ', '_') : null;
        if (type) {
          buffsPickedUpByType[type] = (buffsPickedUpByType[type] ?? 0) + 1;
          leverTypesUsed.add(BUFF_TYPE_TO_LEVER[type]);
        }
      }
    }
    game = newGame;
    if (result.events.length > 0) events.push(...result.events);
    if (game.turn >= turnCap && !game.winner && !game.replayRequired) {
      // resolveTurn enforces TURN_CAP internally; for shorter turnCaps we set replay manually.
      game.replayRequired = true;
      break;
    }
  }

  return {
    winner: game.winner,
    winningSlot: game.winningSlot,
    replayRequired: game.replayRequired,
    turns: game.turn,
    events,
    finalGame: game,
    itemTypesUsed: [...itemTypesUsed],
    leverTypesUsed: [...leverTypesUsed],
    buffsPickedUpByType,
  };
}

function safeAgent(agent, game, side, rng) {
  try {
    const action = agent(game, side, rng);
    if (action && typeof action === 'object' && action.action_type) return action;
  } catch (_err) {
    // Fall through to WAIT.
  }
  return { action_type: ACTIONS.WAIT };
}
