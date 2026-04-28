export const palette = Object.freeze({
  background: 0x05080d,
  floorA: 0x30343b,
  floorB: 0x3a3d45,
  floorC: 0x242932,
  grout: 0x111722,
  blue: 0x38a8ff,
  blueDark: 0x166aa6,
  blueLight: 0x8fd2ff,
  red: 0xff725c,
  redDark: 0xa84032,
  redLight: 0xffb199,
  gold: 0xffd166,
  goldDark: 0xb98120,
  goldLight: 0xfff0a8,
  bush: 0x4fd18b,
  bushDark: 0x24784d,
  bushLight: 0x97e66a,
  wall: 0xb9c0cc,
  wallDark: 0x737d8d,
  wallShadow: 0x3d424b,
  trap: 0x26303f,
  trapSpike: 0xd7dde8,
  baseBlue: 0x1d5d91,
  baseRed: 0x8e3a32,
  highlight: 0xf9e58a,
  text: 0xf8fafc,
  black: 0x0b111a,
});

export function drawDetailedFloor(g, x, y, size, variant = 0) {
  const base = variant % 2 === 0 ? palette.floorA : palette.floorB;
  rect(g, x, y, size, size, base);
  rect(g, x, y + size - 3, size, 3, 0x171c24);
  rect(g, x + size - 3, y, 3, size, 0x171c24);
  rect(g, x + 3, y + 3, size - 8, 2, 0x4a4f58);
  rect(g, x + 3, y + 3, 2, size - 8, 0x4a4f58);
  rect(g, x, y, size, 2, 0x656a73);
  rect(g, x, y, 2, size, 0x656a73);

  const cracks = [
    [
      [0.15, 0.26],
      [0.35, 0.36],
      [0.42, 0.58],
    ],
    [
      [0.62, 0.12],
      [0.55, 0.3],
      [0.74, 0.48],
      [0.68, 0.8],
    ],
    [
      [0.18, 0.72],
      [0.36, 0.6],
      [0.58, 0.66],
    ],
    [
      [0.12, 0.18],
      [0.28, 0.16],
      [0.48, 0.28],
      [0.78, 0.24],
    ],
  ][variant % 4];
  for (let i = 0; i < cracks.length - 1; i += 1) {
    const a = cracks[i];
    const b = cracks[i + 1];
    line(g, x + a[0] * size, y + a[1] * size, x + b[0] * size, y + b[1] * size, 0x1d222a, Math.max(1, size * 0.025));
    line(
      g,
      x + a[0] * size,
      y + a[1] * size - 1,
      x + b[0] * size,
      y + b[1] * size - 1,
      0x4d535d,
      Math.max(1, size * 0.012),
    );
  }

  const speckles = [
    [0.2, 0.2],
    [0.78, 0.16],
    [0.42, 0.82],
    [0.68, 0.62],
    [0.18, 0.55],
  ];
  for (const [sx, sy] of speckles.slice(0, 3 + (variant % 3))) {
    rect(
      g,
      x + sx * size,
      y + sy * size,
      Math.max(2, size * 0.035),
      Math.max(2, size * 0.035),
      variant % 2 ? 0x454a53 : 0x252b34,
    );
  }
}

export function drawBaseBanner(g, x, y, size, side) {
  const color = side === 'blue' ? palette.blue : palette.red;
  const dark = side === 'blue' ? palette.blueDark : palette.redDark;
  const light = side === 'blue' ? palette.blueLight : palette.redLight;
  rect(g, x + size * 0.18, y + size * 0.1, size * 0.64, size * 0.72, dark);
  rect(g, x + size * 0.23, y + size * 0.16, size * 0.54, size * 0.52, color);
  rect(g, x + size * 0.23, y + size * 0.68, size * 0.18, size * 0.18, color);
  rect(g, x + size * 0.59, y + size * 0.68, size * 0.18, size * 0.18, color);
  rect(g, x + size * 0.3, y + size * 0.26, size * 0.4, size * 0.09, light);
  rect(g, x + size * 0.34, y + size * 0.35, size * 0.1, size * 0.28, dark);
  rect(g, x + size * 0.56, y + size * 0.35, size * 0.1, size * 0.28, dark);
  rect(g, x + size * 0.28, y + size * 0.12, size * 0.08, size * 0.12, light);
  rect(g, x + size * 0.64, y + size * 0.12, size * 0.08, size * 0.12, light);
}

export function drawPixelHero(g, x, y, size, side, options = {}) {
  const c = side === 'blue' ? palette.blue : palette.red;
  const d = side === 'blue' ? palette.blueDark : palette.redDark;
  const l = side === 'blue' ? palette.blueLight : palette.redLight;
  const unit = size / 24;
  g.ellipse(x + 12 * unit, y + 21 * unit, 8 * unit, 2.5 * unit).fill({ color: c, alpha: 0.35 });
  rect(g, x + 8 * unit, y + 2 * unit, 8 * unit, 3 * unit, d);
  rect(g, x + 7 * unit, y + 5 * unit, 10 * unit, 4 * unit, c);
  rect(g, x + 6 * unit, y + 8 * unit, 12 * unit, 8 * unit, c);
  rect(g, x + 8 * unit, y + 9 * unit, 8 * unit, 6 * unit, l);
  rect(g, x + 5 * unit, y + 9 * unit, 3 * unit, 8 * unit, d);
  rect(g, x + 16 * unit, y + 9 * unit, 3 * unit, 8 * unit, d);
  rect(g, x + 4 * unit, y + 12 * unit, 4 * unit, 5 * unit, c);
  rect(g, x + 16 * unit, y + 12 * unit, 4 * unit, 5 * unit, c);
  rect(g, x + 7 * unit, y + 16 * unit, 4 * unit, 5 * unit, d);
  rect(g, x + 13 * unit, y + 16 * unit, 4 * unit, 5 * unit, d);
  rect(g, x + 9 * unit, y + 7 * unit, 2 * unit, 2 * unit, palette.text);
  rect(g, x + 13 * unit, y + 7 * unit, 2 * unit, 2 * unit, palette.text);
  rect(g, x + 10 * unit, y + 11 * unit, 4 * unit, unit, palette.black);
  rect(g, x + 17 * unit, y + 7 * unit, 4 * unit, 12 * unit, 0x313946);
  rect(g, x + 18 * unit, y + 8 * unit, 2 * unit, 9 * unit, side === 'blue' ? 0x91d9ff : 0xffb08d);
  if (options.carrying) drawRelic(g, x + 15 * unit, y, 7 * unit);
  if (options.stunned) {
    rect(g, x + 3 * unit, y + unit, 3 * unit, unit, palette.gold);
    rect(g, x + 17 * unit, y + unit, 3 * unit, unit, palette.gold);
  }
}

export function drawTallHero(g, x, y, size, side, options = {}) {
  const c = side === 'blue' ? palette.blue : palette.red;
  const d = side === 'blue' ? palette.blueDark : palette.redDark;
  const l = side === 'blue' ? palette.blueLight : palette.redLight;
  const cape = side === 'blue' ? 0x0f3e74 : 0x7c261f;
  const u = size / 32;
  g.ellipse(x + 16 * u, y + 28 * u, 9 * u, 3 * u).fill({ color: 0x000000, alpha: 0.35 });
  rect(g, x + 8 * u, y + 10 * u, 16 * u, 14 * u, cape);
  rect(g, x + 10 * u, y + 5 * u, 12 * u, 4 * u, d);
  rect(g, x + 8 * u, y + 8 * u, 16 * u, 7 * u, c);
  rect(g, x + 11 * u, y + 10 * u, 10 * u, 5 * u, l);
  rect(g, x + 9 * u, y + 15 * u, 14 * u, 9 * u, c);
  rect(g, x + 11 * u, y + 16 * u, 10 * u, 6 * u, l);
  rect(g, x + 7 * u, y + 17 * u, 4 * u, 8 * u, d);
  rect(g, x + 21 * u, y + 17 * u, 4 * u, 8 * u, d);
  rect(g, x + 10 * u, y + 24 * u, 5 * u, 6 * u, d);
  rect(g, x + 17 * u, y + 24 * u, 5 * u, 6 * u, d);
  rect(g, x + 8 * u, y + 29 * u, 7 * u, 2 * u, palette.black);
  rect(g, x + 17 * u, y + 29 * u, 7 * u, 2 * u, palette.black);
  rect(g, x + 11 * u, y + 11 * u, 3 * u, 3 * u, palette.text);
  rect(g, x + 18 * u, y + 11 * u, 3 * u, 3 * u, palette.text);
  rect(g, x + 13 * u, y + 15 * u, 6 * u, u, palette.black);
  rect(g, x + 23 * u, y + 12 * u, 6 * u, 17 * u, 0x2c3440);
  rect(g, x + 24 * u, y + 13 * u, 4 * u, 13 * u, side === 'blue' ? 0x9edcff : 0xffb08d);
  rect(g, x + 3 * u, y + 15 * u, 4 * u, 13 * u, 0x414a5a);
  rect(g, x + 4 * u, y + 16 * u, 2 * u, 10 * u, side === 'blue' ? 0x7cc8ff : 0xff957d);
  if (options.carrying) {
    drawRelicGlow(g, x + 18 * u, y - 2 * u, 10 * u);
    drawRelic(g, x + 20 * u, y, 7 * u);
  }
  if (options.stunned) {
    rect(g, x + 7 * u, y + u, 5 * u, 2 * u, palette.gold);
    rect(g, x + 20 * u, y + u, 5 * u, 2 * u, palette.gold);
  }
}

export function drawTallBush(g, x, y, size) {
  const u = size / 26;
  const bushTrunk = 0x5b3a1f;
  g.ellipse(x + 13 * u, y + 23 * u, 10 * u, 3 * u).fill({ color: 0x000000, alpha: 0.3 });
  rect(g, x + 10 * u, y + 13 * u, 5 * u, 10 * u, bushTrunk);
  rect(g, x + 13 * u, y + 15 * u, 5 * u, 8 * u, 0x3f2818);
  drawLeafCluster(g, x + 3 * u, y + 11 * u, 8 * u, palette.bushDark, palette.bush);
  drawLeafCluster(g, x + 7 * u, y + 6 * u, 9 * u, palette.bush, palette.bushLight);
  drawLeafCluster(g, x + 13 * u, y + 7 * u, 9 * u, 0x3fcf76, palette.bushLight);
  drawLeafCluster(g, x + 16 * u, y + 12 * u, 8 * u, palette.bushDark, palette.bush);
  drawLeafCluster(g, x + 6 * u, y + 15 * u, 10 * u, 0x238a51, 0x52db87);
  drawLeafCluster(g, x + 1 * u, y + 16 * u, 8 * u, 0x1c7f49, 0x40c977);
  drawLeafCluster(g, x + 18 * u, y + 17 * u, 7 * u, 0x1c7f49, 0x40c977);
}

function drawLeafCluster(g, x, y, size, dark, light) {
  const u = size / 8;
  rect(g, x + 2 * u, y, 4 * u, 2 * u, light);
  rect(g, x + u, y + 2 * u, 6 * u, 3 * u, dark);
  rect(g, x, y + 4 * u, 8 * u, 3 * u, dark);
  rect(g, x + 2 * u, y + 3 * u, 3 * u, 2 * u, light);
  rect(g, x + 5 * u, y + 5 * u, 2 * u, 2 * u, 0x143a26);
  rect(g, x + 3 * u, y + 7 * u, 3 * u, u, 0x143a26);
}

export function drawTallWall(g, x, y, size) {
  const u = size / 24;
  g.ellipse(x + 12 * u, y + 22 * u, 11 * u, 3 * u).fill({ color: 0x000000, alpha: 0.32 });
  rect(g, x + 3 * u, y + 5 * u, 18 * u, 17 * u, palette.wallShadow);
  const blocks = [
    [4, 3, 6, 4],
    [10, 3, 7, 4],
    [17, 4, 4, 4],
    [3, 7, 7, 4],
    [10, 7, 6, 4],
    [16, 8, 6, 4],
    [4, 11, 5, 4],
    [9, 11, 8, 4],
    [17, 12, 4, 4],
    [3, 15, 7, 4],
    [10, 15, 6, 4],
    [16, 16, 6, 4],
  ];
  for (const [bx, by, bw, bh] of blocks) {
    rect(g, x + bx * u, y + by * u, bw * u, bh * u, palette.wall);
    rect(g, x + bx * u, y + by * u, bw * u, u, 0xe7ebf1);
    rect(g, x + bx * u, y + (by + bh - 1) * u, bw * u, u, palette.wallDark);
    rect(g, x + (bx + bw - 1) * u, y + by * u, u, bh * u, 0x565f6d);
  }
}

export function drawRelicGlow(g, x, y, size) {
  g.circle(x + size / 2, y + size / 2, size * 0.56).fill({ color: palette.gold, alpha: 0.12 });
  g.circle(x + size / 2, y + size / 2, size * 0.36).fill({ color: palette.gold, alpha: 0.18 });
  g.circle(x + size / 2, y + size / 2, size * 0.18).fill({ color: palette.goldLight, alpha: 0.25 });
}

export function drawRelic(g, x, y, size) {
  const unit = size / 16;
  rect(g, x + 7 * unit, y, 2 * unit, 2 * unit, palette.goldLight);
  rect(g, x + 6 * unit, y + 2 * unit, 4 * unit, 2 * unit, palette.gold);
  rect(g, x + 5 * unit, y + 4 * unit, 6 * unit, 6 * unit, palette.gold);
  rect(g, x + 4 * unit, y + 6 * unit, 8 * unit, 4 * unit, palette.goldDark);
  rect(g, x + 6 * unit, y + 5 * unit, 2 * unit, 4 * unit, palette.goldLight);
  rect(g, x + 4 * unit, y + 11 * unit, 8 * unit, 2 * unit, 0x5b3b18);
  rect(g, x + 6 * unit, y + 13 * unit, 4 * unit, 2 * unit, 0xb87928);
  rect(g, x + 2 * unit, y + 15 * unit, 12 * unit, unit, 0x5b3b18);
}

export function drawBush(g, x, y, size) {
  const unit = size / 18;
  rect(g, x + 3 * unit, y + 9 * unit, 12 * unit, 6 * unit, 0x173b29);
  const leaves = [
    [4, 7, 5, 5, palette.bush],
    [8, 4, 5, 6, palette.bushLight],
    [11, 7, 5, 5, palette.bush],
    [6, 10, 6, 5, 0x2fa864],
    [2, 11, 5, 4, palette.bushDark],
    [12, 11, 5, 4, palette.bushDark],
  ];
  for (const [lx, ly, w, h, color] of leaves) rect(g, x + lx * unit, y + ly * unit, w * unit, h * unit, color);
  rect(g, x + 7 * unit, y + 7 * unit, 2 * unit, 2 * unit, 0xc7f58d);
  rect(g, x + 11 * unit, y + 9 * unit, 2 * unit, 2 * unit, 0xc7f58d);
}

export function drawWall(g, x, y, size) {
  const unit = size / 16;
  rect(g, x + 2 * unit, y + 3 * unit, 12 * unit, 10 * unit, palette.wallShadow);
  const rows = [
    [3, 2, 4, 3],
    [7, 2, 5, 3],
    [2, 5, 5, 3],
    [7, 5, 6, 3],
    [3, 8, 4, 3],
    [7, 8, 5, 3],
    [2, 11, 6, 3],
    [8, 11, 5, 3],
  ];
  for (const [rx, ry, rw, rh] of rows) {
    rect(g, x + rx * unit, y + ry * unit, rw * unit, rh * unit, palette.wall);
    rect(g, x + rx * unit, y + (ry + rh - 1) * unit, rw * unit, unit, palette.wallDark);
    rect(g, x + rx * unit, y + ry * unit, rw * unit, unit, 0xe4e8ef);
  }
}

export function drawTrap(g, x, y, size, hidden = false) {
  const unit = size / 12;
  const base = hidden ? 0x151c28 : palette.trap;
  rect(g, x + 2 * unit, y + 7 * unit, 8 * unit, 2 * unit, base);
  rect(g, x + 3 * unit, y + 4 * unit, 2 * unit, 3 * unit, hidden ? 0x334155 : palette.trapSpike);
  rect(g, x + 5.5 * unit, y + 3 * unit, 2 * unit, 4 * unit, hidden ? 0x334155 : palette.trapSpike);
  rect(g, x + 8 * unit, y + 4 * unit, 2 * unit, 3 * unit, hidden ? 0x334155 : palette.trapSpike);
}

export function drawIcon(g, x, y, size, kind) {
  if (kind === 'wall') drawWall(g, x, y, size);
  else if (kind === 'trap') drawTrap(g, x, y, size);
  else if (kind === 'scan') {
    g.circle(x + size / 2, y + size / 2, size * 0.32).stroke({ width: size * 0.08, color: palette.blue });
    g.circle(x + size / 2, y + size / 2, size * 0.14).fill(palette.blue);
  } else if (kind === 'dash') {
    rect(g, x + size * 0.18, y + size * 0.42, size * 0.46, size * 0.16, palette.gold);
    rect(g, x + size * 0.58, y + size * 0.28, size * 0.2, size * 0.44, palette.gold);
  } else if (kind === 'heal') {
    rect(g, x + size * 0.42, y + size * 0.18, size * 0.16, size * 0.64, 0x9bf2bd);
    rect(g, x + size * 0.18, y + size * 0.42, size * 0.64, size * 0.16, 0x9bf2bd);
  } else if (kind === 'guard') {
    rect(g, x + size * 0.25, y + size * 0.16, size * 0.5, size * 0.62, 0x92a4bd);
    rect(g, x + size * 0.35, y + size * 0.28, size * 0.3, size * 0.34, 0xcdd7e4);
  } else if (kind === 'attack') {
    rect(g, x + size * 0.2, y + size * 0.46, size * 0.6, size * 0.12, palette.red);
    rect(g, x + size * 0.62, y + size * 0.32, size * 0.16, size * 0.4, palette.gold);
  } else {
    drawRelic(g, x, y, size);
  }
}

function rect(g, x, y, w, h, color) {
  g.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).fill(color);
}

function line(g, x1, y1, x2, y2, color, width) {
  g.moveTo(Math.round(x1), Math.round(y1)).lineTo(Math.round(x2), Math.round(y2)).stroke({ color, width });
}
