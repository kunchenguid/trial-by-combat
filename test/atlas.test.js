import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inflateSync } from 'node:zlib';

import { AGENT_DUEL_ATLAS } from '../public/assets/sprite-atlas.js';

test('atlas follows the production 2048 usage guide', async () => {
  const png = decodePng(await readFile(new URL('../public/assets/agent-duel-sprite-sheet.png', import.meta.url)), {
    decodePixels: true,
  });

  assert.equal(png.width, 2048);
  assert.equal(png.height, 2048);
  assert.equal(AGENT_DUEL_ATLAS.width, 2048);
  assert.equal(AGENT_DUEL_ATLAS.height, 2048);
  assert.equal(AGENT_DUEL_ATLAS.cellSize, 64);
  assert.equal(AGENT_DUEL_ATLAS.columns, 32);
  assert.equal(AGENT_DUEL_ATLAS.rows, 32);
  assert.deepEqual(AGENT_DUEL_ATLAS.settings, {
    filterMode: 'nearest',
    compression: 'lossless',
    mipmaps: false,
    wrapMode: 'clamp',
  });
  assert.deepEqual(AGENT_DUEL_ATLAS.bitmask, { N: 1, E: 2, S: 4, W: 8 });

  const frames = Object.values(AGENT_DUEL_ATLAS.frames);
  assert.equal(frames.length, 153);
  assert.ok(
    frames.every((frame) => frame.w === 64 && frame.h === 64),
    'every production sprite is one 64x64 cell',
  );
  assertNoMagentaKeyPixels(png);
});

test('atlas metadata is generated from the production metadata used by runtime frames', async () => {
  const metadata = JSON.parse(
    await readFile(new URL('../public/assets/agent-duel-sprite-sheet.meta.json', import.meta.url), 'utf8'),
  );

  assert.equal(metadata.atlas.image, 'agent-duel-sprite-sheet.png');
  assert.equal(metadata.atlas.width, AGENT_DUEL_ATLAS.width);
  assert.equal(metadata.atlas.height, AGENT_DUEL_ATLAS.height);
  assert.equal(metadata.atlas.cellSize, AGENT_DUEL_ATLAS.cellSize);
  assert.equal(Object.keys(metadata.sprites).length, 153);

  for (const sprite of Object.values(metadata.sprites)) {
    assert.deepEqual(AGENT_DUEL_ATLAS.frames[sprite.id], {
      x: sprite.x,
      y: sprite.y,
      w: sprite.w,
      h: sprite.h,
    });
    assert.equal(sprite.x, sprite.col * metadata.atlas.cellSize);
    assert.equal(sprite.y, sprite.row * metadata.atlas.cellSize);
  }
});

test('core production sprite rects match the art package', () => {
  assert.deepEqual(AGENT_DUEL_ATLAS.frames.agent_blue_idle_0, { x: 0, y: 0, w: 64, h: 64 });
  assert.deepEqual(AGENT_DUEL_ATLAS.frames.agent_blue_carry_walk_3, { x: 832, y: 0, w: 64, h: 64 });
  assert.deepEqual(AGENT_DUEL_ATLAS.frames.agent_red_idle_0, { x: 0, y: 64, w: 64, h: 64 });
  assert.deepEqual(AGENT_DUEL_ATLAS.frames.relic_0, { x: 0, y: 128, w: 64, h: 64 });
  assert.deepEqual(AGENT_DUEL_ATLAS.frames.base_blue_0, { x: 256, y: 128, w: 64, h: 64 });
  assert.deepEqual(AGENT_DUEL_ATLAS.frames.floor_3, { x: 192, y: 192, w: 64, h: 64 });
  assert.deepEqual(AGENT_DUEL_ATLAS.frames.trap_hidden, { x: 512, y: 192, w: 64, h: 64 });
  assert.deepEqual(AGENT_DUEL_ATLAS.frames.wall_15, { x: 960, y: 256, w: 64, h: 64 });
  assert.deepEqual(AGENT_DUEL_ATLAS.frames.bush_15, { x: 960, y: 320, w: 64, h: 64 });
  assert.deepEqual(AGENT_DUEL_ATLAS.frames.fx_dash_red_3, { x: 960, y: 512, w: 64, h: 64 });

  assert.equal('blue_idle_1' in AGENT_DUEL_ATLAS.frames, false);
  assert.equal('blue_base_1' in AGENT_DUEL_ATLAS.frames, false);
  assert.equal('floor_variant' in AGENT_DUEL_ATLAS.frames, false);
});

test('runtime animations map production frames onto game animation names', () => {
  assert.deepEqual(
    AGENT_DUEL_ATLAS.animations.agent_blue_idle,
    animation(['agent_blue_idle_0', 'agent_blue_idle_1', 'agent_blue_idle_2', 'agent_blue_idle_3'], 4, true),
  );
  assert.deepEqual(
    AGENT_DUEL_ATLAS.animations.agent_blue_carry_idle,
    animation(['agent_blue_carry_idle_0', 'agent_blue_carry_idle_1'], 3, true),
  );
  assert.deepEqual(
    AGENT_DUEL_ATLAS.animations.agent_red_attack,
    animation(['agent_red_attack_0', 'agent_red_attack_1'], 8, false),
  );
  assert.deepEqual(
    AGENT_DUEL_ATLAS.animations.trap_trigger,
    animation(['trap_trigger_0', 'trap_trigger_1', 'trap_trigger_2', 'trap_trigger_3'], 10, false),
  );
  assert.deepEqual(
    AGENT_DUEL_ATLAS.animations.fx_dash_blue,
    animation(['fx_dash_blue_0', 'fx_dash_blue_1', 'fx_dash_blue_2', 'fx_dash_blue_3'], 12, false),
  );
});

function animation(frames, fps, loop) {
  return { frames, fps, loop };
}

function assertNoMagentaKeyPixels(png) {
  for (let index = 0; index < png.pixels.length; index += 4) {
    const alpha = png.pixels[index + 3];
    if (alpha === 0) continue;

    const red = png.pixels[index];
    const green = png.pixels[index + 1];
    const blue = png.pixels[index + 2];
    assert.ok(!(red > 245 && green < 30 && blue > 245), 'opaque magenta chroma-key pixels must not remain');
  }
}

function decodePng(buffer, options = {}) {
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.toString('ascii', offset, offset + 4);
    offset += 4;
    const data = buffer.subarray(offset, offset + length);
    offset += length + 4;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'atlas PNG must be 8-bit');
      colorType = data[9];
      assert.equal(colorType, 6, 'atlas PNG must be RGBA');
      assert.equal(data[12], 0, 'interlaced PNGs are not supported by this test');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const inflated = inflateSync(Buffer.concat(idat));
  if (!options.decodePixels) return { width, height };

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(width * height * 4);
  const previous = Buffer.alloc(stride);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const scanline = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    unfilterScanline(scanline, previous, filter, bytesPerPixel);

    for (let x = 0; x < width; x += 1) {
      const source = x * bytesPerPixel;
      const target = (y * width + x) * 4;
      pixels[target] = scanline[source];
      pixels[target + 1] = scanline[source + 1];
      pixels[target + 2] = scanline[source + 2];
      pixels[target + 3] = bytesPerPixel === 4 ? scanline[source + 3] : 255;
    }

    previous.set(scanline);
  }

  return { width, height, pixels };
}

function unfilterScanline(scanline, previous, filter, bytesPerPixel) {
  for (let index = 0; index < scanline.length; index += 1) {
    const left = index >= bytesPerPixel ? scanline[index - bytesPerPixel] : 0;
    const up = previous[index] ?? 0;
    const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0;

    if (filter === 1) scanline[index] = (scanline[index] + left) & 0xff;
    else if (filter === 2) scanline[index] = (scanline[index] + up) & 0xff;
    else if (filter === 3) scanline[index] = (scanline[index] + Math.floor((left + up) / 2)) & 0xff;
    else if (filter === 4) scanline[index] = (scanline[index] + paeth(left, up, upperLeft)) & 0xff;
    else assert.equal(filter, 0, `unsupported PNG filter ${filter}`);
  }
}

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}
