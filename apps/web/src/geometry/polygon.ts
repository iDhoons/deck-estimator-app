export type PlanPoint = { xMm: number; yMm: number };

const EPS = 1e-3;

export function fitPointsToViewport(
  points: PlanPoint[],
  viewport: { width: number; height: number },
  center: { x: number; y: number },
  fraction = 0.5
) {
  if (points.length === 0) return points;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.xMm);
    maxX = Math.max(maxX, p.xMm);
    minY = Math.min(minY, p.yMm);
    maxY = Math.max(maxY, p.yMm);
  }
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const targetWidth = viewport.width * fraction;
  const targetHeight = viewport.height * fraction;
  const scale = Math.min(targetWidth / width, targetHeight / height);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map((p) => ({
    xMm: (p.xMm - cx) * scale + center.x,
    yMm: (p.yMm - cy) * scale + center.y,
  }));
}

export function normalize(vec: { x: number; y: number }) {
  const len = Math.hypot(vec.x, vec.y);
  if (len < EPS) return { x: 0, y: 0 };
  return { x: vec.x / len, y: vec.y / len };
}

export function polygonSignedArea(points: PlanPoint[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.xMm * next.yMm - next.xMm * current.yMm;
  }
  return sum / 2;
}

export function polygonCentroid(points: PlanPoint[]) {
  const area = polygonSignedArea(points);
  if (Math.abs(area) < EPS) {
    return points[0] ?? { xMm: 0, yMm: 0 };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    const cross = current.xMm * next.yMm - next.xMm * current.yMm;
    cx += (current.xMm + next.xMm) * cross;
    cy += (current.yMm + next.yMm) * cross;
  }
  const factor = 1 / (6 * area);
  return { xMm: cx * factor, yMm: cy * factor };
}

export function isPointInsidePolygon(point: { x: number; y: number }, poly: PlanPoint[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].xMm;
    const yi = poly[i].yMm;
    const xj = poly[j].xMm;
    const yj = poly[j].yMm;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + EPS) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distanceSquared(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function indexToLabel(index: number) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let n = index;
  let label = "";
  do {
    label = letters[n % 26] + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}
