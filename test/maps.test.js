import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CENTER_CHOKE } from '../src/engine.js';
import { appendIndexEntry, loadMap, RUNS_DIR, saveEval, saveMap, validateMapDefinition } from '../src/storage.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-duel-test-'));
}

test('validateMapDefinition accepts Center Choke', () => {
  const result = validateMapDefinition({ ...CENTER_CHOKE, id: 'test-cc' });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('validateMapDefinition rejects out-of-range coordinates', () => {
  const map = {
    id: 'bad-coord',
    bases: { blue: ['Z9'], red: ['I9'] },
    starts: { blue: 'Z9', red: 'I9' },
    relicStart: 'E5',
    walls: [],
    bushes: [],
    fire: [],
  };
  const result = validateMapDefinition(map);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.includes('Z9')),
    JSON.stringify(result.errors),
  );
});

test('validateMapDefinition rejects overlap between walls/bushes/fire/bases', () => {
  const map = {
    id: 'overlap',
    bases: { blue: ['A5'], red: ['I5'] },
    starts: { blue: 'A5', red: 'I5' },
    relicStart: 'E5',
    walls: ['B5'],
    bushes: ['B5'],
    fire: [],
  };
  const result = validateMapDefinition(map);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.toLowerCase().includes('b5')));
});

test('validateMapDefinition rejects empty base for a side', () => {
  const map = {
    id: 'no-base',
    bases: { blue: [], red: ['I5'] },
    starts: { blue: 'A5', red: 'I5' },
    relicStart: 'E5',
    walls: [],
    bushes: [],
    fire: [],
  };
  const result = validateMapDefinition(map);
  assert.equal(result.valid, false);
});

test('validateMapDefinition rejects starts that are walls', () => {
  const map = {
    id: 'wall-start',
    bases: { blue: ['A5'], red: ['I5'] },
    starts: { blue: 'A5', red: 'I5' },
    relicStart: 'E5',
    walls: ['A5'],
    bushes: [],
    fire: [],
  };
  const result = validateMapDefinition(map);
  assert.equal(result.valid, false);
});

test('validateMapDefinition rejects relicStart unreachable from a base', () => {
  // Build a wall ring around the relic so no path exists.
  const map = {
    id: 'unreachable-relic',
    bases: { blue: ['A5'], red: ['I5'] },
    starts: { blue: 'A5', red: 'I5' },
    relicStart: 'E5',
    walls: ['D5', 'F5', 'E4', 'E6'],
    bushes: [],
    fire: [],
  };
  const result = validateMapDefinition(map);
  assert.equal(result.valid, false);
});

test('validateMapDefinition rejects start not in or adjacent to its own base', () => {
  const map = {
    id: 'far-start',
    bases: { blue: ['A5'], red: ['I5'] },
    starts: { blue: 'C5', red: 'I5' }, // C5 is 2 tiles from A5
    relicStart: 'E5',
    walls: [],
    bushes: [],
    fire: [],
  };
  const result = validateMapDefinition(map);
  assert.equal(result.valid, false);
});

test('saveMap and loadMap round-trip', () => {
  const dir = tmpDir();
  const map = { ...CENTER_CHOKE, id: 'roundtrip', notes: 'hi', conclusion: null };
  saveMap(map, { runsDir: dir });
  const loaded = loadMap('roundtrip', { runsDir: dir });
  assert.equal(loaded.id, 'roundtrip');
  assert.equal(loaded.notes, 'hi');
});

test('saveEval writes JSON to runs/evals/<id>.json', () => {
  const dir = tmpDir();
  saveEval('e1', { score: 42, foo: 'bar' }, { runsDir: dir });
  const filePath = path.join(dir, 'evals', 'e1.json');
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(content.score, 42);
});

test('appendIndexEntry appends one line to runs/index.jsonl', () => {
  const dir = tmpDir();
  appendIndexEntry({ id: 'a', score: 10 }, { runsDir: dir });
  appendIndexEntry({ id: 'b', score: 20 }, { runsDir: dir });
  const content = fs.readFileSync(path.join(dir, 'index.jsonl'), 'utf8');
  const lines = content.trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).id, 'a');
  assert.equal(JSON.parse(lines[1]).id, 'b');
});

test('RUNS_DIR points to a directory under the project root', () => {
  assert.ok(RUNS_DIR.endsWith('runs'));
});
