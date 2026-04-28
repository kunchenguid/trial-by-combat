#!/usr/bin/env node
import { appendIndexEntry, loadEval } from '../src/storage.js';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run map:record -- <id>');
  process.exit(2);
}

let result;
try {
  result = loadEval(id);
} catch (err) {
  console.error(`Could not read runs/evals/${id}.json: ${err.message}`);
  console.error('Did you run map:evaluate first?');
  process.exit(2);
}

const entry = {
  id,
  score: round3(result.score),
  ladder_separation: round3(result.score_components.ladder_separation),
  weighted_elo_gap: Math.round(result.score_components.weighted_elo_gap),
  horizon: round3(result.score_components.horizon),
  side_fairness: round3(result.score_components.side_fairness),
  ts: result.timestamp ?? new Date().toISOString(),
};

appendIndexEntry(entry);
console.log(`map:record ${id}  score=${entry.score}  appended to runs/index.jsonl`);

function round3(v) {
  return Math.round(v * 1000) / 1000;
}
