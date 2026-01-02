import type { PlanPoint } from "../types";
import { isRectangle } from "../geometry/shapes";

type ShapeType = "rectangle" | "circle" | "L-shape" | "free";

export function detectShapeInfo(pts: PlanPoint[], isEditable: boolean, shapeType?: ShapeType) {
  // If explicitly editing a circle or explicitly set to L-shape/free, trust shapeType if possible
  // But also check geometric properties
  const isRect = isRectangle(pts);
  const isFree = shapeType === "free" && !isRect; // Simplistic
  // hasEdgeControls: rectangular shapes usually allow sizing edges.
  // Circles or free shapes might not.
  const hasEdgeControls = isEditable && (isRect || shapeType === "L-shape");
  return { isRect, isFree, hasEdgeControls };
}
