export function buildTerrainSprites(coords, kind) {
  const coordSet = new Set(coords);
  return [...coordSet].sort(compareCoords).map((coord) => {
    const { x, y } = coordPoint(coord);
    const mask = terrainMask(coordSet, coord);
    return {
      kind,
      coord,
      frame: `${kind}_${mask}`,
      mask,
      footprint: { width: 1, height: 1 },
      depth: y * 10 + x + (kind === 'wall' ? 0.18 : 0.12),
    };
  });
}

export function terrainMask(coords, coord) {
  const coordSet = coords instanceof Set ? coords : new Set(coords);
  const point = coordPoint(coord);
  return (
    (coordSet.has(pointToCoord({ x: point.x, y: point.y - 1 })) ? 1 : 0) |
    (coordSet.has(pointToCoord({ x: point.x + 1, y: point.y })) ? 2 : 0) |
    (coordSet.has(pointToCoord({ x: point.x, y: point.y + 1 })) ? 4 : 0) |
    (coordSet.has(pointToCoord({ x: point.x - 1, y: point.y })) ? 8 : 0)
  );
}

function coordPoint(coord) {
  return { x: coord.charCodeAt(0) - 65, y: Number(coord.slice(1)) - 1 };
}

function pointToCoord({ x, y }) {
  if (x < 0 || x >= 9 || y < 0 || y >= 9) return null;
  return `${String.fromCharCode(65 + x)}${y + 1}`;
}

function compareCoords(a, b) {
  const pa = coordPoint(a);
  const pb = coordPoint(b);
  return pa.y - pb.y || pa.x - pb.x;
}
