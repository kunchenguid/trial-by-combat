import { ACTIONS, createGame, resolveTurn, TURN_CAP } from './engine.js';

export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(map, agentBlue, agentRed, { seed = 1, turnCap = TURN_CAP, matchId = 'sim' } = {}) {
  let game = createGame({ map, matchId });
  const blueRng = makeRng(seed ^ 0x9e3779b1);
  const redRng = makeRng(seed ^ 0x85ebca6b);
  const events = [];

  while (!game.winner && !game.replayRequired && game.turn < turnCap) {
    const blueAction = safeAgent(agentBlue, game, 'blue', blueRng);
    const redAction = safeAgent(agentRed, game, 'red', redRng);
    const result = resolveTurn(game, { blue: blueAction, red: redAction });
    game = result.game;
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
  };
}

function safeAgent(agent, game, side, rng) {
  try {
    const action = agent(game, side, rng);
    if (action && typeof action === 'object' && action.action_type) return action;
  } catch (err) {
    // Fall through to WAIT.
  }
  return { action_type: ACTIONS.WAIT };
}
