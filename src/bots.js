import {
  ACTIONS,
  adjacent,
  cloneGame,
  getLegalActions,
  manhattan,
  resolveTurn,
  stepCoord,
  validateAction,
} from './engine.js';

const DIRECTIONS = ['NORTH', 'SOUTH', 'EAST', 'WEST'];

export function randomBot(game, side, rng) {
  const legal = getLegalActions(game, side);
  if (legal.length === 0) return { action_type: ACTIONS.WAIT };
  return legal[Math.floor(rng() * legal.length)];
}

export function greedyBot(game, side, rng, opts = {}) {
  const epsilon = opts.epsilon ?? 0;
  const player = game.players[side];
  if (player.stunned) return { action_type: ACTIONS.WAIT };

  if (epsilon > 0 && rng && rng() < epsilon) {
    return randomBot(game, side, rng);
  }

  const opp = game.players[opponentOf(side)];

  // Heal when low and we have it.
  if (player.health <= 4 && player.inventory.heal > 0 && player.health < player.maxHealth) {
    return { action_type: ACTIONS.HEAL };
  }

  // Attack opponent if adjacent and not stunned.
  if (!opp.stunned && adjacent(player.position, opp.position)) {
    return { action_type: ACTIONS.ATTACK };
  }

  // Pick goal tiles.
  let goals;
  if (player.carryingRelic) {
    goals = game.map.bases[side].slice();
  } else if (game.relic.position) {
    goals = [game.relic.position];
  } else {
    // Opponent carries relic - chase opponent.
    goals = [opp.position];
  }

  const knownTraps = collectKnownEnemyTraps(game, side);

  // First try: avoid fire AND known traps.
  let path = bfsPath(game, player.position, goals, { avoid: union(game.map.fire, knownTraps) });
  if (!path) path = bfsPath(game, player.position, goals, { avoid: knownTraps });
  if (!path) path = bfsPath(game, player.position, goals, { avoid: new Set() });

  if (path && path.length >= 2) {
    const dir = directionTo(path[0], path[1]);
    if (dir) {
      // Try DASH if not carrying, dash inv available, and path supports two consecutive same-direction steps.
      if (!player.carryingRelic && player.inventory.dash > 0 && path.length >= 3) {
        const dir2 = directionTo(path[1], path[2]);
        if (dir2 === dir) {
          const dashAction = { action_type: ACTIONS[`DASH_${dir}`] };
          if (validateAction(game, side, dashAction).valid) return dashAction;
        }
      }
      const moveAction = { action_type: ACTIONS[`MOVE_${dir}`] };
      if (validateAction(game, side, moveAction).valid) return moveAction;
    }
  }

  // Defensive fallback: GUARD if expecting damage soon, else WAIT.
  if (!opp.stunned && manhattan(player.position, opp.position) <= 2 && player.health <= 5) {
    return { action_type: ACTIONS.GUARD };
  }
  return { action_type: ACTIONS.WAIT };
}

export function mctsBot(game, side, rng, opts = {}) {
  const iters = opts.iters ?? 100;
  const rolloutDepth = opts.rolloutDepth ?? 30;
  const c = opts.c ?? 1.4;
  const rolloutEpsilon = opts.rolloutEpsilon ?? 0.08;

  if (game.players[side].stunned) return { action_type: ACTIONS.WAIT };

  const root = makeNode(game);
  if (root.terminal || root.actions[side].length === 0) {
    return { action_type: ACTIONS.WAIT };
  }

  for (let i = 0; i < iters; i += 1) {
    runIteration(root, rolloutDepth, c, rolloutEpsilon, rng);
  }

  return selectActionFromRoot(root, side, iters, rng, opts, game);
}

function selectActionFromRoot(root, side, iters, rng, opts, game) {
  // Decoupled UCT in simultaneous-move games doesn't converge to minimax, so we pick
  // by mean reward (with a minimum visit count) and break ties toward greedy's choice.
  // Falls back to greedy if MCTS hasn't gathered enough samples to be confident.
  const minVisits = Math.max(2, Math.floor(iters / Math.max(8, root.actions[side].length)));
  const candidates = root.actions[side].map((action) => {
    const stat = root.stats[side].get(actionKey(action));
    return { action, visits: stat?.visits ?? 0, mean: stat ? stat.total / stat.visits : 0 };
  }).filter((c) => c.visits >= minVisits);

  if (candidates.length === 0) return greedyBot(game, side, rng);

  const greedyChoice = greedyBot(game, side, rng);
  const greedyKey = actionKey(greedyChoice);
  candidates.sort((a, b) => b.mean - a.mean);
  const top = candidates[0];
  const greedyCandidate = candidates.find((c) => actionKey(c.action) === greedyKey);
  const margin = opts.deviationMargin ?? 0.05;
  if (greedyCandidate && top.mean - greedyCandidate.mean < margin) {
    return greedyChoice;
  }
  return top.action;
}


// ---- helpers ----

function opponentOf(side) {
  return side === 'blue' ? 'red' : 'blue';
}

function directionTo(from, to) {
  for (const dir of DIRECTIONS) {
    if (stepCoord(from, dir) === to) return dir;
  }
  return null;
}

function collectKnownEnemyTraps(game, side) {
  const known = new Set(game.players[side].knownEnemyTraps);
  for (const [coord, trap] of game.traps) {
    if (trap.owner !== side && trap.revealedTo.has(side)) known.add(coord);
  }
  return known;
}

function union(...sets) {
  const out = new Set();
  for (const s of sets) for (const v of s) out.add(v);
  return out;
}

function bfsPath(game, start, goals, { avoid = new Set() } = {}) {
  if (!start || !goals || goals.length === 0) return null;
  const goalSet = new Set(goals);
  if (goalSet.has(start)) return [start];
  const queue = [start];
  const came = new Map();
  came.set(start, null);
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const dir of DIRECTIONS) {
      const next = stepCoord(cur, dir);
      if (!next || came.has(next)) continue;
      if (game.map.walls.has(next)) continue;
      // Only treat avoid tiles as blocked when they are not the goal itself.
      if (avoid.has(next) && !goalSet.has(next)) continue;
      came.set(next, cur);
      if (goalSet.has(next)) {
        // Reconstruct.
        const path = [next];
        let n = cur;
        while (n !== null) {
          path.unshift(n);
          n = came.get(n);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

// ---- MCTS internals ----

function makeNode(game) {
  const terminal = !!(game.winner || game.replayRequired);
  return {
    game,
    visits: 0,
    terminal,
    actions: terminal
      ? { blue: [], red: [] }
      : {
          blue: prunedLegalActions(game, 'blue'),
          red: prunedLegalActions(game, 'red'),
        },
    stats: { blue: new Map(), red: new Map() },
    children: new Map(),
  };
}

function prunedLegalActions(game, side) {
  // For MCTS branching, keep a small candidate set focused on actions that actually
  // shift the game. Decoupled UCT at low iter counts converges poorly with branching
  // ≥ 16; this brings it down to ≤ 9 per side without removing any line that real
  // play would explore.
  const player = game.players[side];
  const legal = getLegalActions(game, side);
  if (legal.length === 0) return [];
  const wantTypes = new Set([
    ACTIONS.WAIT,
    ACTIONS.ATTACK,
    ACTIONS.MOVE_NORTH, ACTIONS.MOVE_SOUTH, ACTIONS.MOVE_EAST, ACTIONS.MOVE_WEST,
    ACTIONS.DASH_NORTH, ACTIONS.DASH_SOUTH, ACTIONS.DASH_EAST, ACTIONS.DASH_WEST,
    ACTIONS.DROP_RELIC,
  ]);
  if (player.health < player.maxHealth && player.inventory.heal > 0) wantTypes.add(ACTIONS.HEAL);
  if (player.health <= 6) wantTypes.add(ACTIONS.GUARD);

  return legal.filter((a) => wantTypes.has(a.action_type));
}

function runIteration(root, rolloutDepth, c, rolloutEpsilon, rng) {
  const path = [];
  let node = root;

  // Selection + single-step expansion.
  while (!node.terminal) {
    const blueAct = selectChildAction(node, 'blue', c, rng);
    const redAct = selectChildAction(node, 'red', c, rng);
    const key = jointKey(blueAct, redAct);
    path.push({ node, blueAct, redAct });
    if (!node.children.has(key)) {
      const next = resolveTurn(node.game, { blue: blueAct, red: redAct }).game;
      const child = makeNode(next);
      node.children.set(key, child);
      node = child;
      break;
    }
    node = node.children.get(key);
  }

  // Rollout.
  const reward = rollout(node.game, rolloutDepth, rolloutEpsilon, rng);

  // Backprop.
  for (const { node: n, blueAct, redAct } of path) {
    n.visits += 1;
    bump(n.stats.blue, actionKey(blueAct), reward);
    bump(n.stats.red, actionKey(redAct), 1 - reward);
  }
}

function selectChildAction(node, side, c, rng) {
  const acts = node.actions[side];
  if (acts.length === 0) return { action_type: ACTIONS.WAIT };
  // Try unexplored first (in order, so iteration is deterministic given stable legal-action ordering).
  for (const a of acts) {
    if (!node.stats[side].has(actionKey(a))) return a;
  }
  // UCB1.
  const lnN = Math.log(Math.max(1, node.visits));
  let best = acts[0];
  let bestScore = -Infinity;
  for (const a of acts) {
    const s = node.stats[side].get(actionKey(a));
    const exploit = s.total / s.visits;
    const explore = c * Math.sqrt(lnN / s.visits);
    const score = exploit + explore;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

function rollout(game, depth, epsilon, rng) {
  let g = game;
  let i = 0;
  while (!g.winner && !g.replayRequired && i < depth) {
    const blueA = greedyBot(g, 'blue', rng, { epsilon });
    const redA = greedyBot(g, 'red', rng, { epsilon });
    g = resolveTurn(g, { blue: blueA, red: redA }).game;
    i += 1;
  }
  if (g.winner === 'blue') return 1;
  if (g.winner === 'red') return 0;
  // No winner yet (depth cut or replay): use a heuristic potential function.
  return potentialReward(g);
}

function potentialReward(game) {
  // From blue's perspective. Considers relic carry, distance to base, and HP.
  let score = 0.5;
  if (game.relic.carriedBy === 'blue') score += 0.15;
  else if (game.relic.carriedBy === 'red') score -= 0.15;

  const blueDist = nearestBaseDistance(game, 'blue');
  const redDist = nearestBaseDistance(game, 'red');
  if (game.relic.carriedBy === 'blue') score += clamp((6 - blueDist) / 30, -0.1, 0.1);
  if (game.relic.carriedBy === 'red') score -= clamp((6 - redDist) / 30, -0.1, 0.1);

  const hpDiff = (game.players.blue.health - game.players.red.health) / 100;
  score += hpDiff;
  return clamp(score, 0, 1);
}

function nearestBaseDistance(game, side) {
  const pos = game.players[side].position;
  let best = Infinity;
  for (const t of game.map.bases[side]) {
    const d = manhattan(pos, t);
    if (d < best) best = d;
  }
  return best;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function actionKey(a) {
  return a.target ? `${a.action_type}:${a.target}` : a.action_type;
}

function jointKey(b, r) {
  return `${actionKey(b)}|${actionKey(r)}`;
}

function bump(map, key, reward) {
  const cur = map.get(key);
  if (cur) {
    cur.visits += 1;
    cur.total += reward;
  } else {
    map.set(key, { visits: 1, total: reward });
  }
}

// Re-export cloneGame in case downstream tooling wants it; harmless tree-shake.
export { cloneGame };
