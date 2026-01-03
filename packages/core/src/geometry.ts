import type { Point, Polygon, LineSegment } from "./types";

/**
 * Calculate distance from a point to a line segment
 * @param px - X coordinate of the point
 * @param py - Y coordinate of the point
 * @param seg - Line segment with x1, y1, x2, y2
 * @returns Distance in mm
 */
export function pointToSegmentDistance(
  px: number,
  py: number,
  seg: { x1: number; y1: number; x2: number; y2: number },
): number {
  const vx = seg.x2 - seg.x1;
  const vy = seg.y2 - seg.y1;
  const wx = px - seg.x1;
  const wy = py - seg.y1;
  const vv = vx * vx + vy * vy;
  if (vv <= 1e-9) return Math.hypot(px - seg.x1, py - seg.y1);
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
  const cx = seg.x1 + t * vx;
  const cy = seg.y1 + t * vy;
  return Math.hypot(px - cx, py - cy);
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function rotatePoint(p: Point, rad: number): Point {
  const c = Math.cos(rad),
    s = Math.sin(rad);
  return { xMm: p.xMm * c - p.yMm * s, yMm: p.xMm * s + p.yMm * c };
}

export function rotatePolygon(poly: Polygon, rad: number): Polygon {
  return {
    outer: poly.outer.map((p) => rotatePoint(p, rad)),
    holes: poly.holes
      ?.filter((h): h is Point[] => h != null && Array.isArray(h) && h.length > 0)
      .map((h) => h.map((p) => rotatePoint(p, rad))),
  };
}

/** Signed area (mm^2). */
export function polygonAreaSigned(points: Point[]): number {
  if (!points || !Array.isArray(points)) return 0;
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
  const holes = (poly.holes ?? [])
    .filter((h): h is Point[] => h != null && Array.isArray(h) && h.length > 0)
    .reduce((acc, h) => acc + polygonAreaAbs(h), 0);
  return Math.max(0, outer - holes);
}

export function bbox(points: Point[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
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

/** y=const에서 Polygon(outer - holes)의 "교차 길이 합(mm)" */
export function polygonSpanAtY(poly: Polygon, y: number): number {
  const outerXs = intersectionsWithHorizontalScan(poly.outer, y);
  const outerLen = segmentsLengthFromIntersections(outerXs);

  const holeLens = (poly.holes ?? [])
    .filter((h): h is Point[] => h != null && Array.isArray(h) && h.length > 0)
    .reduce((acc, h) => {
      const xs = intersectionsWithHorizontalScan(h, y);
      return acc + segmentsLengthFromIntersections(xs);
    }, 0);

  return Math.max(0, outerLen - holeLens);
}

/** x=const에서 Polygon span(mm) : 계산 편의상 x/y를 스왑해 reuse */
export function polygonSpanAtX(poly: Polygon, x: number): number {
  const swap = (ring: Point[]) => ring.map((p) => ({ xMm: p.yMm, yMm: p.xMm }));
  const swapped: Polygon = {
    outer: swap(poly.outer),
    holes: poly.holes
      ?.filter((h): h is Point[] => h != null && Array.isArray(h) && h.length > 0)
      .map(swap),
  };
  return polygonSpanAtY(swapped, x);
}

// --- Point in Polygon & Grid Generation ---

function isPointInRing(p: Point, ring: Point[]): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = ring[i];
    const pj = ring[j];

    const intersect =
      pi.yMm > p.yMm !== pj.yMm > p.yMm &&
      p.xMm < ((pj.xMm - pi.xMm) * (p.yMm - pi.yMm)) / (pj.yMm - pi.yMm) + pi.xMm;

    if (intersect) inside = !inside;
  }
  return inside;
}

export function isPointInPolygon(p: Point, poly: Polygon): boolean {
  if (!isPointInRing(p, poly.outer)) return false;
  if (poly.holes) {
    for (const h of poly.holes) {
      if (h != null && Array.isArray(h) && h.length > 0 && isPointInRing(p, h)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * 개구부(홀) 주변을 감싸는 프레이밍(Header/Trimmer) 생성
 * - Header: 개구부 상/하단에 가로로 배치 (장선 방향에 수직)
 * - Trimmer: 개구부 좌/우측에 세로로 배치 (장선 방향과 평행)
 *
 * @param hole - 개구부 꼭짓점 배열
 * @param joistAxis - 장선 방향 ('x': 수직선, 'y': 수평선)
 * @returns headers와 trimmers 선분 배열
 */
export function generateOpeningFraming(
  hole: Point[],
  joistAxis: "x" | "y",
): { headers: LineSegment[]; trimmers: LineSegment[] } {
  if (!hole || hole.length < 3) {
    return { headers: [], trimmers: [] };
  }

  const bb = bbox(hole);
  const headers: LineSegment[] = [];
  const trimmers: LineSegment[] = [];

  if (joistAxis === "x") {
    // 장선이 X축(수직선) → Header는 수평선(상/하단), Trimmer는 수직선(좌/우측)
    // Header: 개구부 상단과 하단
    headers.push(
      { x1: bb.minX, y1: bb.minY, x2: bb.maxX, y2: bb.minY }, // 상단
      { x1: bb.minX, y1: bb.maxY, x2: bb.maxX, y2: bb.maxY }, // 하단
    );
    // Trimmer: 개구부 좌측과 우측
    trimmers.push(
      { x1: bb.minX, y1: bb.minY, x2: bb.minX, y2: bb.maxY }, // 좌측
      { x1: bb.maxX, y1: bb.minY, x2: bb.maxX, y2: bb.maxY }, // 우측
    );
  } else {
    // 장선이 Y축(수평선) → Header는 수직선(좌/우측), Trimmer는 수평선(상/하단)
    // Header: 개구부 좌측과 우측
    headers.push(
      { x1: bb.minX, y1: bb.minY, x2: bb.minX, y2: bb.maxY }, // 좌측
      { x1: bb.maxX, y1: bb.minY, x2: bb.maxX, y2: bb.maxY }, // 우측
    );
    // Trimmer: 개구부 상단과 하단
    trimmers.push(
      { x1: bb.minX, y1: bb.minY, x2: bb.maxX, y2: bb.minY }, // 상단
      { x1: bb.minX, y1: bb.maxY, x2: bb.maxX, y2: bb.maxY }, // 하단
    );
  }

  return { headers, trimmers };
}

/**
 * 특정 간격으로 그리드 라인을 생성하고, 다각형 내부에 포함된 선분들만 반환
 * axis: 'x' -> 수직선 (x=const), 'y' -> 수평선 (y=const)
 * startFromEdge: true이면 최대 간격 기반 균등 배치 (외곽 멍에가 있을 때 사용)
 *   - spacingMm을 최대 허용 간격으로 사용
 *   - 양쪽 외곽 사이를 균등 분할하여 내부 멍에를 대칭 배치
 */
export function getClippedGridLines(
  poly: Polygon,
  spacingMm: number,
  axis: "x" | "y",
  startFromEdge: boolean = false,
): LineSegment[] {
  const bb = bbox(poly.outer);
  const min = axis === "x" ? bb.minX : bb.minY;
  const max = axis === "x" ? bb.maxX : bb.maxY;

  const eps = 0.5;
  const range = max - min;

  let pos: number;
  let stepSize: number;
  let endCondition: (p: number) => boolean;

  if (startFromEdge) {
    // 최대 간격 기반 균등 배치:
    // - spacingMm을 최대 허용 간격으로 사용
    // - 양쪽 외곽 사이 거리를 균등 분할하여 대칭 배치
    const numSpans = Math.ceil(range / spacingMm); // 최소 필요 구간 수
    const actualSpacing = range / numSpans; // 실제 균등 간격
    pos = min + actualSpacing; // 첫 번째 내부 위치
    stepSize = actualSpacing;
    endCondition = (p) => p < max - actualSpacing * 0.5; // 외곽 근처 제외
  } else {
    // 기존 로직: 중앙 기준 대칭 배치
    const center = (min + max) / 2;
    const numLines = Math.floor(range / spacingMm);
    const totalSpan = numLines * spacingMm;
    pos = center - totalSpan / 2 + eps;
    stepSize = spacingMm;
    endCondition = (p) => p <= max - eps;
  }

  const segments: LineSegment[] = [];

  while (endCondition(pos)) {
    let intersectionPoints: number[] = [];

    if (axis === "y") {
      // 수평선 (y=const)
      intersectionPoints = intersectionsWithHorizontalScan(poly.outer, pos);
    } else {
      // 수직선 (x=const) -> Y좌표 교차점 구하기 위해 스왑
      const swap = (ring: Point[]) => ring.map((p) => ({ xMm: p.yMm, yMm: p.xMm }));
      const swappedOuter = swap(poly.outer);
      intersectionPoints = intersectionsWithHorizontalScan(swappedOuter, pos);
    }

    // 구간별 Hole 처리
    for (let i = 0; i + 1 < intersectionPoints.length; i += 2) {
      const start = intersectionPoints[i];
      const end = intersectionPoints[i + 1];

      let currentSegments = [{ s: start, e: end }];

      if (poly.holes && poly.holes.length > 0) {
        for (const hole of poly.holes) {
          if (!hole || !Array.isArray(hole) || hole.length === 0) continue;
          const holeRing = axis === "x" ? hole.map((p) => ({ xMm: p.yMm, yMm: p.xMm })) : hole;
          const holeIntersections = intersectionsWithHorizontalScan(holeRing, pos);

          for (let h = 0; h + 1 < holeIntersections.length; h += 2) {
            const hStart = holeIntersections[h];
            const hEnd = holeIntersections[h + 1];

            const nextSegments: { s: number; e: number }[] = [];
            for (const seg of currentSegments) {
              // seg: [s, e], hole: [hs, he]
              if (seg.e <= hStart || seg.s >= hEnd) {
                nextSegments.push(seg);
              } else {
                if (seg.s < hStart) nextSegments.push({ s: seg.s, e: hStart });
                if (seg.e > hEnd) nextSegments.push({ s: hEnd, e: seg.e });
              }
            }
            currentSegments = nextSegments;
          }
        }
      }

      for (const seg of currentSegments) {
        if (axis === "y") {
          segments.push({ x1: seg.s, y1: pos, x2: seg.e, y2: pos });
        } else {
          segments.push({ x1: pos, y1: seg.s, x2: pos, y2: seg.e });
        }
      }
    }

    pos += stepSize;
  }

  return segments;
}
