import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const SOURCE_IMAGE_PATH = resolve(ROOT, 'public/assets/source/trial-by-combat-production-atlas-2048.png');
const SOURCE_METADATA_PATH = resolve(ROOT, 'public/assets/source/trial-by-combat-production-atlas-2048.json');
const ATLAS_PATH = resolve(ROOT, 'public/assets/trial-by-combat-sprite-sheet.png');
const METADATA_PATH = resolve(ROOT, 'public/assets/trial-by-combat-sprite-sheet.meta.json');
const RUNTIME_PATH = resolve(ROOT, 'public/assets/sprite-atlas.js');
const VERSION = 'production-atlas-2048-v1';

const metadata = JSON.parse(await readFile(SOURCE_METADATA_PATH, 'utf8'));
validateMetadata(metadata);

await mkdir(dirname(ATLAS_PATH), { recursive: true });
await copyFile(SOURCE_IMAGE_PATH, ATLAS_PATH);
await writeFile(METADATA_PATH, `${JSON.stringify(buildRuntimeMetadata(metadata), null, 2)}\n`);
await writeFile(RUNTIME_PATH, buildRuntime(metadata));

function validateMetadata(source) {
  if (source.atlas.width !== 2048 || source.atlas.height !== 2048) {
    throw new Error('Production atlas must be 2048x2048');
  }
  if (source.atlas.cellSize !== 64 || source.atlas.columns !== 32 || source.atlas.rows !== 32) {
    throw new Error('Production atlas must use 64px cells in a 32x32 grid');
  }
  for (const [id, sprite] of Object.entries(source.sprites)) {
    if (sprite.id !== id) throw new Error(`Sprite key/id mismatch for ${id}`);
    if (sprite.w !== 64 || sprite.h !== 64) throw new Error(`Sprite ${id} is not a 64x64 cell`);
    if (sprite.x !== sprite.col * 64 || sprite.y !== sprite.row * 64) {
      throw new Error(`Sprite ${id} coordinates do not match row/column metadata`);
    }
  }
}

function buildRuntimeMetadata(source) {
  return {
    atlas: {
      image: 'trial-by-combat-sprite-sheet.png',
      width: source.atlas.width,
      height: source.atlas.height,
      cellSize: source.atlas.cellSize,
      columns: source.atlas.columns,
      rows: source.atlas.rows,
      background: source.atlas.background,
      source: 'public/assets/source/trial-by-combat-production-atlas-2048.png',
      sourceMetadata: 'public/assets/source/trial-by-combat-production-atlas-2048.json',
      generator: 'scripts/build-sprite-atlas.mjs',
      version: VERSION,
      recommendedImport: {
        filterMode: 'Point/Nearest',
        compression: 'None or lossless',
        mipmaps: false,
        wrapMode: 'Clamp',
      },
    },
    bitmask: source.bitmask,
    terrainAutotiles: source.terrainAutotiles,
    sprites: source.sprites,
    animations: source.animations,
  };
}

function buildRuntime(source) {
  return `export const TRIAL_BY_COMBAT_ATLAS = Object.freeze({
  image: '/assets/trial-by-combat-sprite-sheet.png?v=${VERSION}',
  width: ${source.atlas.width},
  height: ${source.atlas.height},
  cellSize: ${source.atlas.cellSize},
  columns: ${source.atlas.columns},
  rows: ${source.atlas.rows},
  settings: Object.freeze({
    filterMode: 'nearest',
    compression: 'lossless',
    mipmaps: false,
    wrapMode: 'clamp',
  }),
  bitmask: Object.freeze(${JSON.stringify(source.bitmask)}),
  terrainAutotiles: deepFreeze(${JSON.stringify(source.terrainAutotiles, null, 2)}),
  frames: Object.freeze({
${Object.values(source.sprites)
  .map((sprite) => `    ${sprite.id}: f(${sprite.x}, ${sprite.y}, ${sprite.w}, ${sprite.h}),`)
  .join('\n')}
  }),
  animations: deepFreeze(${JSON.stringify(source.animations, null, 2)}),
});

function f(x, y, w, h) {
  return Object.freeze({ x, y, w, h });
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
`;
}
