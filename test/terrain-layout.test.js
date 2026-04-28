import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTerrainSprites, terrainMask } from '../public/assets/terrain-layout.js';

test('terrain masks follow the production atlas N/E/S/W bit convention', () => {
  const coords = new Set(['D4', 'E4', 'F4', 'E3', 'E5']);

  assert.equal(terrainMask(coords, 'E4'), 15);
  assert.equal(terrainMask(coords, 'D4'), 2);
  assert.equal(terrainMask(coords, 'F4'), 8);
  assert.equal(terrainMask(coords, 'E3'), 4);
  assert.equal(terrainMask(coords, 'E5'), 1);
});

test('wall terrain renders one autotile sprite per logical cell', () => {
  const sprites = buildTerrainSprites(['D4', 'E4', 'F4'], 'wall');

  assert.deepEqual(
    sprites.map((sprite) => sprite.coord),
    ['D4', 'E4', 'F4'],
  );
  assert.deepEqual(
    sprites.map((sprite) => sprite.frame),
    ['wall_2', 'wall_10', 'wall_8'],
  );
  assert.ok(sprites.every((sprite) => sprite.footprint.width === 1 && sprite.footprint.height === 1));
});

test('bush terrain renders one autotile sprite per logical cell', () => {
  const sprites = buildTerrainSprites(['B2', 'C2', 'B3', 'C3'], 'bush');

  assert.deepEqual(
    sprites.map(({ coord, frame }) => [coord, frame]),
    [
      ['B2', 'bush_6'],
      ['C2', 'bush_12'],
      ['B3', 'bush_3'],
      ['C3', 'bush_9'],
    ],
  );
});
