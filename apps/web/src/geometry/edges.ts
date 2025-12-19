import { indexToLabel, normalize, type PlanPoint } from "./polygon";

const EPS = 1e-3;
const MIN_EDGE_SPAN_MM = 100;

export type EdgeHandle = {
  id: string;
  orientation: "horizontal" | "vertical";
  startIndex: number;
  endIndex: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  vertexIndices: number[];
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

export function getEdgeList(points: PlanPoint[]) {
  if (points.length < 2) return [];
  const edges = [];
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
    });
  }
  return edges;
}

export { normalize };
