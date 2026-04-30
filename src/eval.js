import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { greedyBot, mctsBot } from './bots.js';
import { createGame, getLegalActions, resolveTurn } from './engine.js';
import { makeRng, simulate } from './sim.js';

const DEFAULTS = {
  mctsLowIters: 100,
  mctsMidIters: 250,
  mctsHighIters: 500,
  mctsRolloutDepth: 18,
  ladderGamesPerPair: 20,
  fairnessGames: 20,
  divergenceSamples: 24,
  seed: 1,
  turnCap: 100,
  workerPoolSize: 8,
};

const LADDER_RUNGS = ['greedy', 'mcts-low', 'mcts-mid', 'mcts-high'];
const ITEM_TYPES = ['wall', 'trap', 'scan', 'dash', 'heal'];
const LEVER_TYPES = [
  'DASH',
  'HEAL',
  'SCAN',
  'PLACE_WALL',
  'PLACE_TRAP',
  'ATTACK',
  'GUARD',
  'DROP_RELIC',
  'BUFF_DASH_PACK',
  'BUFF_BIG_HEAL',
];

// Score-tuning constants. TARGET_ELO sets the soft "this gap is meaningful"
// scale: a weighted-mean adjacent gap of TARGET_ELO maps to ~0.63 separation,
// 2*TARGET_ELO to ~0.86, 3*TARGET_ELO to ~0.95. Asymptote is 1, so the metric
// can't hard-saturate.
const LADDER_TARGET_ELO = 200;
const LADDER_GAP_WEIGHTS = { greedyToLow: 1, lowToMid: 2, midToHigh: 3 };

export async function evaluateMap(map, opts = {}) {
  const config = { ...DEFAULTS, ...opts };
  const t0 = Date.now();

  const pool = config.workerPoolSize > 1 ? new WorkerPool(config.workerPoolSize) : null;
  try {
    const ladder = await evalLadder(map, config, pool);
    const fairness = await evalFairness(map, config, pool);
    const horizon = evalHorizon(map, config);
    const guardrails = aggregateGuardrails(ladder, fairness);
    const corpusItemUsage = aggregateItemUsage(ladder, fairness);
    const itemUsage = itemUsageFromTypes(fairness.itemTypesUsed, {
      scoreCondition: 'mcts-high-vs-mcts-high',
      corpus: corpusItemUsage,
    });
    const leverUsage = aggregateLeverUsage(ladder, fairness);
    const buffUsage = aggregateBuffUsage(ladder, fairness);

    const score = computeScore({
      ladderEloGaps: ladder.gaps,
      mctsMirrorWinrate: fairness.blueWinrate,
      meanT15Divergence: horizon.meanT15,
      turnCapRate: guardrails.turnCapRate,
      medianGameLength: guardrails.medianGameLength,
      leverTypesUsedCount: leverUsage.typesUsedCount,
    });

    return {
      map_id: map.id,
      timestamp: new Date().toISOString(),
      config,
      score: score.score,
      score_components: score,
      ladder,
      fairness,
      horizon,
      guardrails,
      item_usage: itemUsage,
      lever_usage: leverUsage,
      buff_usage: buffUsage,
      runtime_ms: Date.now() - t0,
    };
  } finally {
    if (pool) await pool.terminate();
  }
}

export function computeScore({
  ladderEloGaps,
  mctsMirrorWinrate,
  meanT15Divergence,
  turnCapRate,
  medianGameLength,
  leverTypesUsedCount = LEVER_TYPES.length,
}) {
  const g1 = Math.max(0, ladderEloGaps.greedyToLow);
  const g2 = Math.max(0, ladderEloGaps.lowToMid);
  const g3 = Math.max(0, ladderEloGaps.midToHigh);
  const w = LADDER_GAP_WEIGHTS;
  const wsum = w.greedyToLow + w.lowToMid + w.midToHigh;
  const weighted_elo_gap = (w.greedyToLow * g1 + w.lowToMid * g2 + w.midToHigh * g3) / wsum;
  const ladder_separation = 1 - Math.exp(-weighted_elo_gap / LADDER_TARGET_ELO);

  const horizon = clamp(meanT15Divergence / 0.3, 0, 1);
  const side_fairness = 1 - clamp((Math.abs(mctsMirrorWinrate - 0.5) - 0.1) / 0.3, 0, 1);
  const turn_cap_penalty = 1 - clamp((turnCapRate - 0.1) / 0.3, 0, 1);
  const length_penalty = medianGameLength >= 12 ? 1 : medianGameLength / 12;
  const lever_variety = clamp(leverTypesUsedCount / LEVER_TYPES.length, 0, 1);
  const score = 100 * ladder_separation * horizon * side_fairness * turn_cap_penalty * length_penalty * lever_variety;
  return {
    score,
    ladder_separation,
    weighted_elo_gap,
    horizon,
    side_fairness,
    turn_cap_penalty,
    length_penalty,
    lever_variety,
  };
}

function itemUsageFromTypes(types = [], extra = {}) {
  const used = new Set(types);
  return {
    ...extra,
    typesUsedCount: used.size,
    typesAvailable: ITEM_TYPES.length,
    typesUsed: [...used].sort(),
  };
}

function aggregateLeverUsage(ladder, fairness) {
  const corpus = new Set([...(ladder.leverTypesUsed ?? []), ...(fairness.leverTypesUsed ?? [])]);
  const scored = new Set(fairness.leverTypesUsed ?? []);
  return {
    scoreCondition: 'mcts-high-vs-mcts-high',
    typesAvailable: LEVER_TYPES.length,
    typesUsedCount: scored.size,
    typesUsed: [...scored].sort(),
    corpus: {
      typesAvailable: LEVER_TYPES.length,
      typesUsedCount: corpus.size,
      typesUsed: [...corpus].sort(),
    },
  };
}

function aggregateBuffUsage(ladder, fairness) {
  const corpus = {};
  for (const src of [ladder.buffsPickedUpByType ?? {}, fairness.buffsPickedUpByType ?? {}]) {
    for (const [type, count] of Object.entries(src)) {
      corpus[type] = (corpus[type] ?? 0) + count;
    }
  }
  return {
    scoreCondition: 'mcts-high-vs-mcts-high',
    scored: { ...(fairness.buffsPickedUpByType ?? {}) },
    corpus,
  };
}

function aggregateItemUsage(ladder, fairness) {
  const used = new Set();
  const sources = [...(ladder.itemTypesUsed ?? []), ...(fairness.itemTypesUsed ?? [])];
  for (const t of sources) used.add(t);
  return itemUsageFromTypes(used);
}

function itersForSpec(spec, config) {
  if (spec === 'greedy') return 0;
  if (spec === 'mcts-low') return config.mctsLowIters;
  if (spec === 'mcts-mid') return config.mctsMidIters;
  if (spec === 'mcts-high') return config.mctsHighIters;
  throw new Error(`unknown spec: ${spec}`);
}

async function evalLadder(map, config, pool) {
  const pairs = [];
  for (let i = 0; i < LADDER_RUNGS.length; i += 1) {
    for (let j = i + 1; j < LADDER_RUNGS.length; j += 1) {
      pairs.push([LADDER_RUNGS[i], LADDER_RUNGS[j]]);
    }
  }

  const tasks = [];
  for (let p = 0; p < pairs.length; p += 1) {
    const [a, b] = pairs[p];
    for (let i = 0; i < config.ladderGamesPerPair; i += 1) {
      const aIsBlue = i % 2 === 0;
      const blueSpec = aIsBlue ? a : b;
      const redSpec = aIsBlue ? b : a;
      tasks.push({
        pairIdx: p,
        a,
        b,
        aIsBlue,
        seed: config.seed + 1000 + p * 1000 + i,
        blueSpec,
        redSpec,
        blueIters: itersForSpec(blueSpec, config),
        redIters: itersForSpec(redSpec, config),
      });
    }
  }

  const results = await runSimTasks(tasks, map, config, pool);

  const pairwise = {};
  for (const [a, b] of pairs) {
    pairwise[`${a}__vs__${b}`] = { a, b, gamesPlayed: 0, aWins: 0, bWins: 0, draws: 0 };
  }

  const games = [];
  const ladderItemsUsed = new Set();
  const ladderLeversUsed = new Set();
  const ladderBuffPickups = {};
  for (let i = 0; i < tasks.length; i += 1) {
    const t = tasks[i];
    const r = results[i];
    if (r.itemTypesUsed) for (const x of r.itemTypesUsed) ladderItemsUsed.add(x);
    if (r.leverTypesUsed) for (const x of r.leverTypesUsed) ladderLeversUsed.add(x);
    if (r.buffsPickedUpByType) {
      for (const [type, count] of Object.entries(r.buffsPickedUpByType)) {
        ladderBuffPickups[type] = (ladderBuffPickups[type] ?? 0) + count;
      }
    }
    const stats = pairwise[`${t.a}__vs__${t.b}`];
    stats.gamesPlayed += 1;
    let winnerSpec;
    if (r.replayRequired || !r.winner) {
      stats.draws += 1;
      winnerSpec = null;
    } else {
      const aWon = (r.winner === 'blue') === t.aIsBlue;
      winnerSpec = aWon ? t.a : t.b;
      if (aWon) stats.aWins += 1;
      else stats.bWins += 1;
    }
    games.push({
      seed: t.seed,
      a: t.a,
      b: t.b,
      aIsBlue: t.aIsBlue,
      winner: r.winner,
      winnerSpec,
      turns: r.turns,
      replayRequired: r.replayRequired,
    });
  }

  const elo = computeLadderElo(LADDER_RUNGS, pairwise);
  const gaps = {
    greedyToLow: elo['mcts-low'] - elo.greedy,
    lowToMid: elo['mcts-mid'] - elo['mcts-low'],
    midToHigh: elo['mcts-high'] - elo['mcts-mid'],
  };

  return {
    rungs: LADDER_RUNGS,
    gamesPerPair: config.ladderGamesPerPair,
    elo,
    gaps,
    pairwise,
    games,
    itemTypesUsed: [...ladderItemsUsed],
    leverTypesUsed: [...ladderLeversUsed],
    buffsPickedUpByType: ladderBuffPickups,
  };
}

// Bradley-Terry ratings via MM iteration, anchored so greedy = 0 Elo.
// Adds one virtual half-half draw to every actually-played pair so 100%/0%
// sweeps don't blow up to infinite Elo.
function computeLadderElo(rungs, pairwise) {
  const wins = new Map(rungs.map((r) => [r, 0]));
  const games = new Map(rungs.map((r) => [r, new Map(rungs.map((s) => [s, 0]))]));

  for (const key of Object.keys(pairwise)) {
    const { a, b, gamesPlayed, aWins, bWins, draws } = pairwise[key];
    if (gamesPlayed === 0) continue;
    const aScore = aWins + draws * 0.5;
    const bScore = bWins + draws * 0.5;
    wins.set(a, wins.get(a) + aScore + 0.5);
    wins.set(b, wins.get(b) + bScore + 0.5);
    games.get(a).set(b, gamesPlayed + 1);
    games.get(b).set(a, gamesPlayed + 1);
  }

  const r = new Map(rungs.map((s) => [s, 1]));
  for (let iter = 0; iter < 500; iter += 1) {
    const next = new Map();
    for (const i of rungs) {
      let denom = 0;
      for (const j of rungs) {
        if (i === j) continue;
        const nij = games.get(i).get(j);
        if (nij === 0) continue;
        denom += nij / (r.get(i) + r.get(j));
      }
      next.set(i, denom > 0 ? wins.get(i) / denom : r.get(i));
    }
    const logSum = rungs.reduce((s, k) => s + Math.log(next.get(k)), 0);
    const norm = Math.exp(logSum / rungs.length);
    let maxDelta = 0;
    for (const k of rungs) {
      const v = next.get(k) / norm;
      maxDelta = Math.max(maxDelta, Math.abs(Math.log(v) - Math.log(r.get(k))));
      r.set(k, v);
    }
    if (maxDelta < 1e-7) break;
  }

  const greedy = r.get('greedy');
  const elo = {};
  for (const k of rungs) elo[k] = 400 * Math.log10(r.get(k) / greedy);
  return elo;
}

async function evalFairness(map, config, pool) {
  const tasks = [];
  for (let i = 0; i < config.fairnessGames; i += 1) {
    tasks.push({
      seed: config.seed + 500 + i,
      blueSpec: 'mcts-high',
      redSpec: 'mcts-high',
      blueIters: config.mctsHighIters,
      redIters: config.mctsHighIters,
    });
  }
  const results = await runSimTasks(tasks, map, config, pool);

  const games = [];
  const fairnessItemsUsed = new Set();
  const fairnessLeversUsed = new Set();
  const fairnessBuffPickups = {};
  let blueScore = 0;
  let decisive = 0;
  for (let i = 0; i < tasks.length; i += 1) {
    const { seed } = tasks[i];
    const result = results[i];
    if (result.itemTypesUsed) for (const x of result.itemTypesUsed) fairnessItemsUsed.add(x);
    if (result.leverTypesUsed) for (const x of result.leverTypesUsed) fairnessLeversUsed.add(x);
    if (result.buffsPickedUpByType) {
      for (const [type, count] of Object.entries(result.buffsPickedUpByType)) {
        fairnessBuffPickups[type] = (fairnessBuffPickups[type] ?? 0) + count;
      }
    }
    let blueResult;
    if (result.replayRequired || !result.winner) blueResult = 0.5;
    else blueResult = result.winner === 'blue' ? 1 : 0;
    blueScore += blueResult;
    if (blueResult !== 0.5) decisive += 1;
    games.push({
      seed,
      winner: result.winner,
      turns: result.turns,
      replayRequired: result.replayRequired,
    });
  }
  return {
    blueWinrate: blueScore / config.fairnessGames,
    decisiveGames: decisive,
    games,
    itemTypesUsed: [...fairnessItemsUsed],
    leverTypesUsed: [...fairnessLeversUsed],
    buffsPickedUpByType: fairnessBuffPickups,
  };
}

async function runSimTasks(tasks, map, config, pool) {
  if (pool) {
    return Promise.all(
      tasks.map((t) =>
        pool.runSim({
          map,
          seed: t.seed,
          turnCap: config.turnCap,
          blueSpec: t.blueSpec,
          redSpec: t.redSpec,
          blueIters: t.blueIters,
          redIters: t.redIters,
          rolloutDepth: config.mctsRolloutDepth,
        }),
      ),
    );
  }
  return tasks.map((t) => {
    const blueAgent = makeAgent(t.blueSpec, t.blueIters, config.mctsRolloutDepth);
    const redAgent = makeAgent(t.redSpec, t.redIters, config.mctsRolloutDepth);
    const r = simulate(map, blueAgent, redAgent, { seed: t.seed, turnCap: config.turnCap });
    return {
      winner: r.winner,
      turns: r.turns,
      replayRequired: r.replayRequired,
      itemTypesUsed: r.itemTypesUsed,
      leverTypesUsed: r.leverTypesUsed,
      buffsPickedUpByType: r.buffsPickedUpByType,
    };
  });
}

function makeAgent(spec, iters, rolloutDepth) {
  if (spec === 'greedy') return greedyBot;
  if (spec === 'mcts-low' || spec === 'mcts-mid' || spec === 'mcts-high') {
    return (game, side, rng) => mctsBot(game, side, rng, { iters, rolloutDepth });
  }
  throw new Error(`unknown agent: ${spec}`);
}

function evalHorizon(map, config) {
  const samples = [];
  let totalT15 = 0;
  let totalT8 = 0;
  let totalT3 = 0;
  let n = 0;

  for (let s = 0; s < config.divergenceSamples; s += 1) {
    const sampleSeed = config.seed + 7000 + s;
    const T = 3 + (s % Math.max(1, Math.min(20, config.turnCap - 5)));
    const sample = sampleDivergence(map, T, sampleSeed, config);
    if (!sample) continue;
    samples.push(sample);
    totalT3 += sample.deltaT3;
    totalT8 += sample.deltaT8;
    totalT15 += sample.deltaT15;
    n += 1;
  }
  return {
    meanT15: n > 0 ? totalT15 / n : 0,
    meanT8: n > 0 ? totalT8 / n : 0,
    meanT3: n > 0 ? totalT3 / n : 0,
    samples,
    sampleCount: n,
  };
}

function sampleDivergence(map, T, seed, _config) {
  // Walk forward T turns with greedy-vs-greedy from a seeded fresh game.
  const baseSeedB = seed ^ 0x11a;
  const baseSeedR = seed ^ 0x22b;
  const rngB = makeRng(baseSeedB);
  const rngR = makeRng(baseSeedR);
  let game = createGame({ map, matchId: `divergence_${seed}` });
  for (let i = 0; i < T; i += 1) {
    if (game.winner || game.replayRequired) return null;
    game = resolveTurn(game, {
      blue: greedyBot(game, 'blue', rngB),
      red: greedyBot(game, 'red', rngR),
    }).game;
  }
  if (game.winner || game.replayRequired) return null;

  // Pick which side to perturb deterministically: alternate.
  const perturbSide = (T + (seed & 1)) % 2 === 0 ? 'blue' : 'red';
  const perturbRng = makeRng(seed ^ 0x33c);
  const greedyChoice = greedyBot(game, perturbSide, perturbRng);
  const legal = getLegalActions(game, perturbSide);
  const others = legal.filter((a) => actionKey(a) !== actionKey(greedyChoice));
  if (others.length === 0) return null;
  const altIndex = Math.floor(perturbRng() * others.length);
  const altAction = others[altIndex];

  // Baseline branch: continue with both greedy.
  const baseline = stepForward(game, greedyChoice, otherAction(game, perturbSide, baseSeedR ^ baseSeedB), perturbSide);
  const divergent = stepForward(game, altAction, otherAction(game, perturbSide, baseSeedR ^ baseSeedB), perturbSide);

  // Continue both forward 15 turns, sampling outcomes at +3, +8, +15 ahead of T+1.
  const baselineOutcomes = continueForward(baseline, perturbSide, baseSeedB, baseSeedR);
  const divergentOutcomes = continueForward(divergent, perturbSide, baseSeedB, baseSeedR);

  return {
    T,
    perturbSide,
    deltaT3: Math.abs(baselineOutcomes.t3 - divergentOutcomes.t3),
    deltaT8: Math.abs(baselineOutcomes.t8 - divergentOutcomes.t8),
    deltaT15: Math.abs(baselineOutcomes.t15 - divergentOutcomes.t15),
  };
}

function otherAction(game, perturbSide, seed) {
  const otherSide = perturbSide === 'blue' ? 'red' : 'blue';
  return greedyBot(game, otherSide, makeRng(seed ^ 0xfeed));
}

function stepForward(game, perturbAction, otherSideAction, perturbSide) {
  const actions =
    perturbSide === 'blue'
      ? { blue: perturbAction, red: otherSideAction }
      : { blue: otherSideAction, red: perturbAction };
  return resolveTurn(game, actions).game;
}

function continueForward(game, _perturbSide, seedB, seedR) {
  const rngB = makeRng(seedB ^ 0x71e);
  const rngR = makeRng(seedR ^ 0x82f);
  let g = game;
  let t3 = null;
  let t8 = null;
  for (let i = 0; i < 15; i += 1) {
    if (i === 3) t3 = outcomeOf(g);
    if (i === 8) t8 = outcomeOf(g);
    if (g.winner || g.replayRequired) break;
    g = resolveTurn(g, {
      blue: greedyBot(g, 'blue', rngB),
      red: greedyBot(g, 'red', rngR),
    }).game;
  }
  if (t3 === null) t3 = outcomeOf(g);
  if (t8 === null) t8 = outcomeOf(g);
  return { t3, t8, t15: outcomeOf(g) };
}

function outcomeOf(game) {
  if (game.winner === 'blue') return 1;
  if (game.winner === 'red') return 0;
  return 0.5;
}

function aggregateGuardrails(ladder, fairness) {
  const allGames = [...ladder.games, ...fairness.games];
  const total = allGames.length;
  const turnCapped = allGames.filter((g) => g.replayRequired || !g.winner).length;
  const lengths = allGames.map((g) => g.turns).sort((a, b) => a - b);
  const median = lengths.length === 0 ? 0 : lengths[Math.floor(lengths.length / 2)];
  return {
    turnCapRate: total === 0 ? 0 : turnCapped / total,
    medianGameLength: median,
    totalGames: total,
    turnCappedGames: turnCapped,
    gameLengths: lengths,
  };
}

const WORKER_URL = new URL('./eval-worker.js', import.meta.url);

class WorkerPool {
  constructor(size) {
    this.workers = [];
    this.idle = [];
    this.queue = [];
    this.nextTaskId = 1;
    this.pending = new Map();
    for (let i = 0; i < size; i += 1) {
      const worker = new Worker(fileURLToPath(WORKER_URL));
      worker.on('message', (msg) => {
        const job = this.pending.get(msg.taskId);
        if (!job) return;
        this.pending.delete(msg.taskId);
        this.idle.push(worker);
        job.resolve(msg);
        this.dispatch();
      });
      worker.on('error', (err) => {
        for (const job of this.pending.values()) job.reject(err);
        this.pending.clear();
      });
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  runSim(payload) {
    return new Promise((resolve, reject) => {
      this.queue.push({ payload, resolve, reject });
      this.dispatch();
    });
  }

  dispatch() {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const worker = this.idle.pop();
      const job = this.queue.shift();
      const taskId = this.nextTaskId++;
      this.pending.set(taskId, job);
      worker.postMessage({ ...job.payload, taskId });
    }
  }

  async terminate() {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function actionKey(a) {
  return a.target ? `${a.action_type}:${a.target}` : a.action_type;
}
