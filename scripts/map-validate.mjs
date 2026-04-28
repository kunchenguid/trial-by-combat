#!/usr/bin/env node
import { loadMap, validateMapDefinition } from '../src/storage.js';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run map:validate -- <id>');
  process.exit(2);
}

let map;
try {
  map = loadMap(id);
} catch (err) {
  console.error(`Could not read runs/maps/${id}.json: ${err.message}`);
  process.exit(2);
}

const result = validateMapDefinition(map);
if (result.valid) {
  console.log(`map:validate OK  ${id}`);
  process.exit(0);
}
console.error(`map:validate FAIL ${id}`);
for (const err of result.errors) console.error(`  - ${err}`);
process.exit(1);
