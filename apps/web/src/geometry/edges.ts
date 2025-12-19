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
  const nextVec = { x: direction.x * targetLengthMm, y: direction.y * targetLengthMm };
  const delta = { x: nextVec.x - vec.x, y: nextVec.y - vec.y };
  if (Math.hypot(delta.x, delta.y) < EPS) return points;

  const forwardIndices: number[] = [];
  for (let idx = endIndex; idx !== startIndex; idx = (idx + 1) % n) {
    forwardIndices.push(idx);
  }

  const backwardIndices: number[] = [];
  for (let idx = startIndex; idx !== endIndex; idx = (idx + 1) % n) {
    backwardIndices.push(idx);
  }

  const candidates = [
    { indices: forwardIndices, delta },
    { indices: backwardIndices, delta: { x: -delta.x, y: -delta.y } },
  ].sort((a, b) => a.indices.length - b.indices.length);

  const isValid = (pts: PlanPoint[]) => {
    for (let i = 0; i < pts.length; i++) {
      const next = (i + 1) % pts.length;
      const dx = pts[next].xMm - pts[i].xMm;
      const dy = pts[next].yMm - pts[i].yMm;
      if (Math.hypot(dx, dy) < minLength) return false;
    }
    return true;
  };

  for (const candidate of candidates) {
    const set = new Set(candidate.indices);
    const updated = points.map((pt, idx) =>
      set.has(idx) ? { xMm: pt.xMm + candidate.delta.x, yMm: pt.yMm + candidate.delta.y } : pt
    );
    if (isValid(updated)) return updated;
  }

  return null;
}

export { normalize };
