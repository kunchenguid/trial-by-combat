import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adjacent, coordToPoint, stepCoord } from './engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const RUNS_DIR = path.join(PROJECT_ROOT, 'runs');

const VALID_COORD = /^[A-I][1-9]$/;

export function validateMapDefinition(map) {
  const errors = [];

  if (!map || typeof map !== 'object') {
    return { valid: false, errors: ['Map must be an object.'] };
  }
  if (typeof map.id !== 'string' || map.id.length === 0) {
    errors.push('Map id must be a non-empty string.');
  }
  if (!map.bases || !Array.isArray(map.bases.blue) || !Array.isArray(map.bases.red)) {
    return { valid: false, errors: errors.concat('Map must have bases.blue and bases.red arrays.') };
  }
  if (map.bases.blue.length === 0) errors.push('bases.blue must have ≥1 tile.');
  if (map.bases.red.length === 0) errors.push('bases.red must have ≥1 tile.');

  if (!map.starts || typeof map.starts.blue !== 'string' || typeof map.starts.red !== 'string') {
    return { valid: false, errors: errors.concat('Map must have starts.blue and starts.red strings.') };
  }
  if (typeof map.relicStart !== 'string') {
    return { valid: false, errors: errors.concat('Map must have relicStart string.') };
  }

  const walls = map.walls ?? [];
  const bushes = map.bushes ?? [];
  const fire = map.fire ?? [];

  // 1. All coords valid.
  const allCoords = [
    ...map.bases.blue,
    ...map.bases.red,
    map.starts.blue,
    map.starts.red,
    map.relicStart,
    ...walls,
    ...bushes,
    ...fire,
  ];
  for (const c of allCoords) {
    if (!VALID_COORD.test(c)) errors.push(`Invalid coordinate: ${c}`);
  }
  if (errors.length > 0) return { valid: false, errors };

  // 2. No tile in more than one set.
  const sets = {
    walls: new Set(walls),
    bushes: new Set(bushes),
    fire: new Set(fire),
    'bases.blue': new Set(map.bases.blue),
    'bases.red': new Set(map.bases.red),
  };
  const labels = Object.keys(sets);
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      for (const coord of sets[labels[i]]) {
        if (sets[labels[j]].has(coord)) {
          errors.push(`Tile ${coord} is in both ${labels[i]} and ${labels[j]}.`);
        }
      }
    }
  }

  // 4. Starts and relicStart not on walls.
  if (sets.walls.has(map.starts.blue)) errors.push(`Blue start ${map.starts.blue} is a wall.`);
  if (sets.walls.has(map.starts.red)) errors.push(`Red start ${map.starts.red} is a wall.`);
  if (sets.walls.has(map.relicStart)) errors.push(`relicStart ${map.relicStart} is a wall.`);

  // 7. starts in own base or adjacent.
  if (!isInOrAdjacentToBase(map.starts.blue, map.bases.blue)) {
    errors.push(`Blue start ${map.starts.blue} must be inside or 4-adjacent to a blue base tile.`);
  }
  if (!isInOrAdjacentToBase(map.starts.red, map.bases.red)) {
    errors.push(`Red start ${map.starts.red} must be inside or 4-adjacent to a red base tile.`);
  }

  // 5 + 6. Path checks (BFS through non-walls).
  const wallsSet = sets.walls;
  if (!hasPath(map.relicStart, map.bases.blue, wallsSet)) {
    errors.push('relicStart cannot reach any blue base tile through non-wall tiles.');
  }
  if (!hasPath(map.relicStart, map.bases.red, wallsSet)) {
    errors.push('relicStart cannot reach any red base tile through non-wall tiles.');
  }
  if (!hasPath(map.starts.blue, [map.relicStart], wallsSet)) {
    errors.push('Blue start cannot reach relicStart.');
  }
  if (!hasPath(map.starts.red, [map.relicStart], wallsSet)) {
    errors.push('Red start cannot reach relicStart.');
  }
  if (!hasPath(map.starts.blue, [map.starts.red], wallsSet)) {
    errors.push('Blue start cannot reach red start.');
  }

  return { valid: errors.length === 0, errors };
}

function isInOrAdjacentToBase(coord, base) {
  if (base.includes(coord)) return true;
  return base.some((b) => adjacent(coord, b));
}

function hasPath(start, goals, walls) {
  if (!coordToPoint(start)) return false;
  const goalSet = new Set(goals);
  if (goalSet.has(start)) return true;
  const queue = [start];
  const visited = new Set([start]);
  const dirs = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const d of dirs) {
      const next = stepCoord(cur, d);
      if (!next || visited.has(next) || walls.has(next)) continue;
      if (goalSet.has(next)) return true;
      visited.add(next);
      queue.push(next);
    }
  }
  return false;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveRunsDir(opts) {
  return opts?.runsDir ?? RUNS_DIR;
}

export function mapPath(id, opts = {}) {
  return path.join(resolveRunsDir(opts), 'maps', `${id}.json`);
}

export function evalPath(id, opts = {}) {
  return path.join(resolveRunsDir(opts), 'evals', `${id}.json`);
}

export function indexPath(opts = {}) {
  return path.join(resolveRunsDir(opts), 'index.jsonl');
}

export function saveMap(map, opts = {}) {
  const dir = path.join(resolveRunsDir(opts), 'maps');
  ensureDir(dir);
  fs.writeFileSync(mapPath(map.id, opts), `${JSON.stringify(map, null, 2)}\n`);
}

export function loadMap(id, opts = {}) {
  const raw = fs.readFileSync(mapPath(id, opts), 'utf8');
  return JSON.parse(raw);
}

export function saveEval(id, evalResult, opts = {}) {
  const dir = path.join(resolveRunsDir(opts), 'evals');
  ensureDir(dir);
  fs.writeFileSync(evalPath(id, opts), `${JSON.stringify(evalResult, null, 2)}\n`);
}

export function loadEval(id, opts = {}) {
  const raw = fs.readFileSync(evalPath(id, opts), 'utf8');
  return JSON.parse(raw);
}

export function appendIndexEntry(entry, opts = {}) {
  ensureDir(resolveRunsDir(opts));
  fs.appendFileSync(indexPath(opts), `${JSON.stringify(entry)}\n`);
}
