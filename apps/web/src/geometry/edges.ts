import { indexToLabel, normalize, type PlanPoint } from "./polygon";

const EPS = 1e-3;
export const MIN_EDGE_SPAN_MM = 100;
export const EDGE_LENGTH_STEP_MM = 10;
const MIN_EDGE_LENGTH_MM = MIN_EDGE_SPAN_MM;

export type EdgeHandle = {
  id: string;
  orientation: "horizontal" | "vertical";
  startIndex: number;
  endIndex: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  vertexIndices: number[];
};

export type EdgeInfo = {
  id: string;
  fromLabel: string;
  toLabel: string;
  lengthMm: number;
  startIndex: number;
  endIndex: number;
};

export function collectEdgeHandles(points: PlanPoint[]) {
  const handles: EdgeHandle[] = [];
  if (points.length < 2) return handles;
  for (let i = 0; i < points.length; i++) {
    const nextIndex = (i + 1) % points.length;
    const start = points[i];
    const end = points[nextIndex];
    const dx = end.xMm - start.xMm;
    const dy = end.yMm - start.yMm;
    
    if (Math.abs(dx) < EPS && Math.abs(dy) >= EPS) {
      // 수직 변
      const minY = Math.min(start.yMm, end.yMm) - EPS;
      const maxY = Math.max(start.yMm, end.yMm) + EPS;
      const vertexIndices: number[] = [];
      for (let k = 0; k < points.length; k++) {
        const pt = points[k];
        if (Math.abs(pt.xMm - start.xMm) < EPS && pt.yMm >= minY && pt.yMm <= maxY) {
          vertexIndices.push(k);
        }
      }
      handles.push({
        id: `edge-${i}`,
        orientation: "vertical",
        startIndex: i,
        endIndex: nextIndex,
        start: { x: start.xMm, y: start.yMm },
        end: { x: end.xMm, y: end.yMm },
        vertexIndices,
      });
    } else if (Math.abs(dy) < EPS && Math.abs(dx) >= EPS) {
      // 수평 변
      const minX = Math.min(start.xMm, end.xMm) - EPS;
      const maxX = Math.max(start.xMm, end.xMm) + EPS;
      const vertexIndices: number[] = [];
      for (let k = 0; k < points.length; k++) {
        const pt = points[k];
        if (Math.abs(pt.yMm - start.yMm) < EPS && pt.xMm >= minX && pt.xMm <= maxX) {
          vertexIndices.push(k);
        }
      }
      handles.push({
        id: `edge-${i}`,
        orientation: "horizontal",
        startIndex: i,
        endIndex: nextIndex,
        start: { x: start.xMm, y: start.yMm },
        end: { x: end.xMm, y: end.yMm },
        vertexIndices,
      });
    } else {
      // 대각선 변 (수직/수평이 아닌 변) - 이제 핸들 생성
      const length = Math.hypot(dx, dy);
      if (length < EPS) continue;
      
      // 대각선 변의 경우 startIndex와 endIndex만 포함
      handles.push({
        id: `edge-${i}`,
        orientation: "horizontal", // 기존 타입 유지 (드래그 로직 호환)
        startIndex: i,
        endIndex: nextIndex,
        start: { x: start.xMm, y: start.yMm },
        end: { x: end.xMm, y: end.yMm },
        vertexIndices: [i, nextIndex], // 대각선 변은 두 꼭짓점만
      });
    }
  }
  return handles;
}

export function computeEdgeLimits(
  points: PlanPoint[],
  vertexIndices: number[],
  orientation: "horizontal" | "vertical"
) {
  const vertexSet = new Set(vertexIndices);
  const n = points.length;
  let minDelta = -Infinity;
  let maxDelta = Infinity;

  for (const idx of vertexIndices) {
    const prevIndex = (idx - 1 + n) % n;
    const nextIndex = (idx + 1) % n;
    const neighbors: PlanPoint[] = [];
    if (!vertexSet.has(prevIndex)) neighbors.push(points[prevIndex]);
    if (!vertexSet.has(nextIndex)) neighbors.push(points[nextIndex]);
    for (const neighbor of neighbors) {
      if (orientation === "vertical") {
        const dist = neighbor.xMm - points[idx].xMm;
        if (dist >= 0) {
          maxDelta = Math.min(maxDelta, dist - MIN_EDGE_SPAN_MM);
        } else {
          minDelta = Math.max(minDelta, dist + MIN_EDGE_SPAN_MM);
        }
      } else {
        const dist = neighbor.yMm - points[idx].yMm;
        if (dist >= 0) {
          maxDelta = Math.min(maxDelta, dist - MIN_EDGE_SPAN_MM);
        } else {
          minDelta = Math.max(minDelta, dist + MIN_EDGE_SPAN_MM);
        }
      }
    }
  }

  if (!Number.isFinite(minDelta)) minDelta = -Infinity;
  if (!Number.isFinite(maxDelta)) maxDelta = Infinity;
  return { minDelta, maxDelta };
}

export function getEdgeList(points: PlanPoint[]): EdgeInfo[] {
  if (points.length < 2) return [];
  const edges: EdgeInfo[] = [];
  for (let i = 0; i < points.length; i++) {
    const next = (i + 1) % points.length;
    const from = points[i];
    const to = points[next];
    const dx = to.xMm - from.xMm;
    const dy = to.yMm - from.yMm;
    edges.push({
      id: `${i}-${next}`,
      fromLabel: indexToLabel(i),
      toLabel: indexToLabel(next),
      lengthMm: Math.sqrt(dx * dx + dy * dy),
      startIndex: i,
      endIndex: next,
    });
  }
  return edges;
}

export function updateEdgeLength(
  points: PlanPoint[],
  startIndex: number,
  targetLengthMm: number,
  options?: { minLengthMm?: number }
) {
  const n = points.length;
  const minLength = options?.minLengthMm ?? MIN_EDGE_LENGTH_MM;
  if (n < 2) return null;
  if (!Number.isFinite(targetLengthMm) || targetLengthMm <= 0 || targetLengthMm < minLength) {
    return null;
  }

  const endIndex = (startIndex + 1) % n;
  const start = points[startIndex];
  const end = points[endIndex];
  const vec = { x: end.xMm - start.xMm, y: end.yMm - start.yMm };
  const currentLength = Math.hypot(vec.x, vec.y);
  if (currentLength < EPS) return null;

  const direction = { x: vec.x / currentLength, y: vec.y / currentLength };
  
  // 변의 중점을 기준으로 양쪽으로 확장/축소
  // 목표 길이의 절반만큼 양쪽으로 이동
  const halfDelta = {
    x: direction.x * (targetLengthMm - currentLength) / 2,
    y: direction.y * (targetLengthMm - currentLength) / 2,
  };
  
  // 시작점과 끝점만 이동 (중점 기준으로 양쪽으로 확장)
  const updated = points.map((pt, idx) => {
    if (idx === startIndex) {
      return { xMm: pt.xMm - halfDelta.x, yMm: pt.yMm - halfDelta.y };
    } else if (idx === endIndex) {
      return { xMm: pt.xMm + halfDelta.x, yMm: pt.yMm + halfDelta.y };
    }
    return pt;
  });
  
  // 유효성 검사
  const isValid = (pts: PlanPoint[]) => {
    for (let i = 0; i < pts.length; i++) {
      const next = (i + 1) % pts.length;
      const dx = pts[next].xMm - pts[i].xMm;
      const dy = pts[next].yMm - pts[i].yMm;
      if (Math.hypot(dx, dy) < minLength) return false;
    }
    return true;
  };
  
  if (isValid(updated)) return updated;
  return null;
}

export { normalize };
