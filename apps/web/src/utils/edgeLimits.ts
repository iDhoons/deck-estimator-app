import type { PlanPoint } from "../types";

export function computeEdgeLimits(
  _originalPoints: PlanPoint[],
  _vertexIndices: number[],
  _orientation: "horizontal" | "vertical",
) {
  // TODO: Implement real logic - currently placeholder
  // For now, return "no limit" to allow compilation
  return { minDelta: -Infinity, maxDelta: Infinity };
}
