export type CutoutShape = "rectangle" | "free" | "circle";

export type ShapeType = "rectangle" | "lShape" | "tShape" | "free" | "circle";

export type PlanPoint = { xMm: number; yMm: number };

// Re-export Plan from core package for convenience
export type { Plan } from "@deck/core";
