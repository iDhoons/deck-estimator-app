import type { Point, Polygon } from "./types";

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function rotatePoint(p: Point, rad: number): Point {
  const c = Math.cos(rad), s = Math.sin(rad);
  return { xMm: p.xMm * c - p.yMm * s, yMm: p.xMm * s + p.yMm * c };
}

export function rotatePolygon(poly: Polygon, rad: number): Polygon {
  return {
    outer: poly.outer.map(p => rotatePoint(p, rad)),
    holes: poly.holes?.map(h => h.map(p => rotatePoint(p, rad)))
  };
}

/** Signed area (mm^2). */
export function polygonAreaSigned(points: Point[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    sum += a.xMm * b.yMm - b.xMm * a.yMm;
  }
  return sum / 2;
}

export function polygonAreaAbs(points: Point[]): number {
  return Math.abs(polygonAreaSigned(points));
}

export function polygonAreaMm2(poly: Polygon): number {
  const outer = polygonAreaAbs(poly.outer);
  const holes = (poly.holes ?? []).reduce((acc, h) => acc + polygonAreaAbs(h), 0);
  return Math.max(0, outer - holes);
}

export function bbox(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.xMm < minX) minX = p.xMm;
    if (p.yMm < minY) minY = p.yMm;
    if (p.xMm > maxX) maxX = p.xMm;
    if (p.yMm > maxY) maxY = p.yMm;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * y=const 스캔라인에서 poly(단일 ring)과의 교차 x좌표를 구해 정렬
 * - 수평 에지 중복 교차를 피하기 위해 상단 포인트 포함 규칙을 쓴다.
 */
function intersectionsWithHorizontalScan(ring: Point[], y: number): number[] {
  const xs: number[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];

    // a.y == b.y (수평 에지)는 스킵
    if (a.yMm === b.yMm) continue;

    const yMin = Math.min(a.yMm, b.yMm);
    const yMax = Math.max(a.yMm, b.yMm);

    // 반열림 구간 [yMin, yMax) 로 처리해 꼭짓점 중복 교차 방지
    if (y < yMin || y >= yMax) continue;

    const t = (y - a.yMm) / (b.yMm - a.yMm);
    const x = a.xMm + t * (b.xMm - a.xMm);
    xs.push(x);
  }
  xs.sort((p, q) => p - q);
  return xs;
}

function segmentsLengthFromIntersections(xs: number[]): number {
  // 짝수개가 정상. (0,1) (2,3) ...
  let len = 0;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    len += Math.max(0, xs[i + 1] - xs[i]);
  }
  return len;
}

/** y=const에서 Polygon(outer - holes)의 “교차 길이 합(mm)” */
export function polygonSpanAtY(poly: Polygon, y: number): number {
  const outerXs = intersectionsWithHorizontalScan(poly.outer, y);
  const outerLen = segmentsLengthFromIntersections(outerXs);

  const holeLens = (poly.holes ?? []).reduce((acc, h) => {
    const xs = intersectionsWithHorizontalScan(h, y);
    return acc + segmentsLengthFromIntersections(xs);
  }, 0);

  return Math.max(0, outerLen - holeLens);
}

/** x=const에서 Polygon span(mm) : 계산 편의상 x/y를 스왑해 reuse */
export function polygonSpanAtX(poly: Polygon, x: number): number {
  const swap = (ring: Point[]) => ring.map(p => ({ xMm: p.yMm, yMm: p.xMm }));
  const swapped: Polygon = {
    outer: swap(poly.outer),
    holes: poly.holes?.map(swap)
  };
  return polygonSpanAtY(swapped, x);
}
