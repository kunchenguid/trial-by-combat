#!/usr/bin/env node
import { evaluateMap } from '../src/eval.js';
import { loadMap, saveEval, validateMapDefinition } from '../src/storage.js';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run map:evaluate -- <id>');
  process.exit(2);
}

let map;
try {
  map = loadMap(id);
} catch (err) {
  console.error(`Could not read runs/maps/${id}.json: ${err.message}`);
  process.exit(2);
}

const validation = validateMapDefinition(map);
if (!validation.valid) {
  console.error(`Refusing to evaluate invalid map ${id}:`);
  for (const err of validation.errors) console.error(`  - ${err}`);
  process.exit(1);
}

const opts = {};
if (process.env.MCTS_LOW_ITERS) opts.mctsLowIters = Number(process.env.MCTS_LOW_ITERS);
if (process.env.MCTS_MID_ITERS) opts.mctsMidIters = Number(process.env.MCTS_MID_ITERS);
if (process.env.MCTS_HIGH_ITERS) opts.mctsHighIters = Number(process.env.MCTS_HIGH_ITERS);
if (process.env.LADDER_GAMES_PER_PAIR) opts.ladderGamesPerPair = Number(process.env.LADDER_GAMES_PER_PAIR);
if (process.env.FAIRNESS_GAMES) opts.fairnessGames = Number(process.env.FAIRNESS_GAMES);
if (process.env.DIVERGENCE_SAMPLES) opts.divergenceSamples = Number(process.env.DIVERGENCE_SAMPLES);
if (process.env.EVAL_SEED) opts.seed = Number(process.env.EVAL_SEED);

console.log(`map:evaluate ${id}`);
console.log(`  config: ${JSON.stringify(opts)}`);

const t0 = Date.now();
const result = await evaluateMap(map, opts);
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

saveEval(id, result);

const elo = result.ladder.elo;
const gaps = result.ladder.gaps;
console.log(`  score:              ${result.score.toFixed(2)}`);
console.log(
  `  ladder_separation:  ${result.score_components.ladder_separation.toFixed(3)}  (weighted Elo gap ${result.score_components.weighted_elo_gap.toFixed(0)})`,
);
console.log(
  `  ladder Elo:         greedy=${elo.greedy.toFixed(0)}  low=${elo['mcts-low'].toFixed(0)}  mid=${elo['mcts-mid'].toFixed(0)}  high=${elo['mcts-high'].toFixed(0)}`,
);
console.log(
  `  adjacent gaps:      g->low=${gaps.greedyToLow.toFixed(0)}  low->mid=${gaps.lowToMid.toFixed(0)}  mid->high=${gaps.midToHigh.toFixed(0)}`,
);
console.log(
  `  horizon:            ${result.score_components.horizon.toFixed(3)}  (mean T+15 divergence ${result.horizon.meanT15.toFixed(3)})`,
);
console.log(
  `  side_fairness:      ${result.score_components.side_fairness.toFixed(3)}  (blue mirror winrate ${result.fairness.blueWinrate.toFixed(3)})`,
);
console.log(
  `  turn_cap_penalty:   ${result.score_components.turn_cap_penalty.toFixed(3)}  (turn-cap rate ${result.guardrails.turnCapRate.toFixed(3)})`,
);
console.log(
  `  length_penalty:     ${result.score_components.length_penalty.toFixed(3)}  (median length ${result.guardrails.medianGameLength})`,
);
console.log(`  ran ${result.ladder.games.length + result.fairness.games.length} games in ${elapsed}s`);
console.log(`  wrote runs/evals/${id}.json`);
