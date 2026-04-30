import assert from 'node:assert/strict';
import test from 'node:test';

import { CENTER_CHOKE } from '../src/engine.js';
import { computeScore, evaluateMap } from '../src/eval.js';

test('computeScore produces a positive score on a healthy ladder', () => {
  const r = computeScore({
    ladderEloGaps: { greedyToLow: 200, lowToMid: 200, midToHigh: 200 },
    mctsMirrorWinrate: 0.55,
    meanT15Divergence: 0.3,
    turnCapRate: 0.1,
    medianGameLength: 20,
  });
  // weighted_elo_gap = (1*200 + 2*200 + 3*200) / 6 = 200
  // ladder_separation = 1 - exp(-1) ~= 0.632
  // horizon = 1, side_fairness = 1, turn_cap_penalty = 1, length_penalty = 1
  // score = 100 * 0.632
  assert.ok(Math.abs(r.weighted_elo_gap - 200) < 1e-9);
  assert.ok(Math.abs(r.ladder_separation - (1 - Math.exp(-1))) < 1e-9);
  assert.equal(r.horizon, 1);
  assert.equal(r.side_fairness, 1);
  assert.equal(r.turn_cap_penalty, 1);
  assert.equal(r.length_penalty, 1);
  assert.ok(r.score > 60 && r.score < 65);
});

test('computeScore lever_variety scales with leverTypesUsedCount over 10', () => {
  const full = computeScore({
    ladderEloGaps: { greedyToLow: 200, lowToMid: 200, midToHigh: 200 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.3,
    turnCapRate: 0,
    medianGameLength: 30,
    leverTypesUsedCount: 10,
  });
  assert.equal(full.lever_variety, 1);

  const partial = computeScore({
    ladderEloGaps: { greedyToLow: 200, lowToMid: 200, midToHigh: 200 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.3,
    turnCapRate: 0,
    medianGameLength: 30,
    leverTypesUsedCount: 8,
  });
  assert.equal(partial.lever_variety, 0.8);
  // partial.score should be exactly 80% of full.score because lever_variety is the only difference.
  assert.ok(Math.abs(partial.score - full.score * 0.8) < 1e-9);
});

test('computeScore reports lever_variety, not item_variety, as the rubric multiplier', () => {
  const r = computeScore({
    ladderEloGaps: { greedyToLow: 200, lowToMid: 200, midToHigh: 200 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.3,
    turnCapRate: 0,
    medianGameLength: 30,
    leverTypesUsedCount: 10,
  });
  assert.ok('lever_variety' in r);
  assert.ok(!('item_variety' in r));
});

test('computeScore weights the top adjacent gap most', () => {
  // Same total Elo (300) split three different ways. Putting it all at the top
  // gap should score higher than putting it all at the bottom gap.
  const top = computeScore({
    ladderEloGaps: { greedyToLow: 0, lowToMid: 0, midToHigh: 300 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.3,
    turnCapRate: 0,
    medianGameLength: 30,
  });
  const middle = computeScore({
    ladderEloGaps: { greedyToLow: 0, lowToMid: 300, midToHigh: 0 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.3,
    turnCapRate: 0,
    medianGameLength: 30,
  });
  const bottom = computeScore({
    ladderEloGaps: { greedyToLow: 300, lowToMid: 0, midToHigh: 0 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.3,
    turnCapRate: 0,
    medianGameLength: 30,
  });
  assert.ok(top.score > middle.score);
  assert.ok(middle.score > bottom.score);
});

test('computeScore clips negative ladder gaps (inversions earn no credit)', () => {
  // A ladder where the strongest rung loses to the weaker should score the
  // same as if that gap were 0 — flat or inverted spots contribute nothing.
  const inverted = computeScore({
    ladderEloGaps: { greedyToLow: 200, lowToMid: 200, midToHigh: -150 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.3,
    turnCapRate: 0,
    medianGameLength: 30,
  });
  const flat = computeScore({
    ladderEloGaps: { greedyToLow: 200, lowToMid: 200, midToHigh: 0 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.3,
    turnCapRate: 0,
    medianGameLength: 30,
  });
  assert.ok(Math.abs(inverted.score - flat.score) < 1e-9);
});

test('computeScore asymptotes toward 100 — never reaches it', () => {
  // Even at absurd Elo gaps, score should be < 100 (no hard ceiling).
  const huge = computeScore({
    ladderEloGaps: { greedyToLow: 2000, lowToMid: 2000, midToHigh: 2000 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.5,
    turnCapRate: 0,
    medianGameLength: 30,
  });
  assert.ok(huge.score < 100);
  assert.ok(huge.score > 99);
});

test('computeScore penalizes extreme side bias', () => {
  const r = computeScore({
    ladderEloGaps: { greedyToLow: 200, lowToMid: 200, midToHigh: 200 },
    mctsMirrorWinrate: 0.95,
    meanT15Divergence: 0.3,
    turnCapRate: 0.0,
    medianGameLength: 30,
  });
  // |0.95-0.5|=0.45; (0.45-0.10)/0.30 = 1.166 -> clamped to 1; side_fairness = 0
  assert.equal(r.side_fairness, 0);
  assert.equal(r.score, 0);
});

test('computeScore penalizes high turn-cap rate', () => {
  const r = computeScore({
    ladderEloGaps: { greedyToLow: 200, lowToMid: 200, midToHigh: 200 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.3,
    turnCapRate: 0.4,
    medianGameLength: 30,
  });
  assert.equal(r.turn_cap_penalty, 0);
  assert.equal(r.score, 0);
});

test('computeScore applies length penalty when games are too short', () => {
  const r = computeScore({
    ladderEloGaps: { greedyToLow: 200, lowToMid: 200, midToHigh: 200 },
    mctsMirrorWinrate: 0.5,
    meanT15Divergence: 0.3,
    turnCapRate: 0.0,
    medianGameLength: 6,
  });
  assert.equal(r.length_penalty, 0.5);
});

test('evaluateMap runs end-to-end on a tiny config and returns the documented shape', async () => {
  // Use a very small budget to keep this test fast. Skip the worker pool —
  // worker startup overhead would dominate at this size.
  const result = await evaluateMap(CENTER_CHOKE, {
    mctsLowIters: 5,
    mctsMidIters: 8,
    mctsHighIters: 10,
    mctsRolloutDepth: 6,
    ladderGamesPerPair: 2,
    fairnessGames: 2,
    divergenceSamples: 4,
    seed: 7,
    turnCap: 30,
    workerPoolSize: 0,
  });
  assert.equal(typeof result.score, 'number');
  assert.equal(result.map_id, CENTER_CHOKE.id);
  assert.equal(typeof result.timestamp, 'string');
  assert.ok(result.ladder && typeof result.ladder.elo === 'object');
  assert.deepEqual(result.ladder.rungs, ['greedy', 'mcts-low', 'mcts-mid', 'mcts-high']);
  assert.ok(typeof result.ladder.elo.greedy === 'number');
  assert.ok(typeof result.ladder.gaps.greedyToLow === 'number');
  assert.ok(typeof result.ladder.gaps.lowToMid === 'number');
  assert.ok(typeof result.ladder.gaps.midToHigh === 'number');
  assert.ok(Array.isArray(result.ladder.games));
  assert.equal(result.ladder.games.length, 6 * 2); // 6 pairs * 2 games
  assert.ok(result.fairness && typeof result.fairness.blueWinrate === 'number');
  assert.ok(result.horizon && typeof result.horizon.meanT15 === 'number');
  assert.ok(result.guardrails && typeof result.guardrails.turnCapRate === 'number');
  assert.equal(result.item_usage.scoreCondition, 'mcts-high-vs-mcts-high');
  assert.deepEqual(result.item_usage.typesUsed, [...result.fairness.itemTypesUsed].sort());
  assert.ok(result.item_usage.corpus && Array.isArray(result.item_usage.corpus.typesUsed));
});
