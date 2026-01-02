import { type Plan, type Product, type Ruleset } from "@deck/core";
import { type ShapeType } from "../types";
import { centerShapeToCanvasNoScale } from "../geometry/shapes";

// Note: VIEWBOX constants are primarily for Canvas config,
// but often needed for centering logic.
export const VIEWBOX_SIZE = { width: 2000, height: 1200 };
export const VIEWBOX_CENTER = { x: VIEWBOX_SIZE.width / 2, y: VIEWBOX_SIZE.height / 2 };

export const PRODUCT_DEFAULTS: Product = {
  id: "DN34",
  name: "DN34",
  stockLengthMm: 3000,
  widthOptionsMm: [95, 120, 140, 150],
  thicknessMm: 25,
  gapMm: 5,
  fasteningModes: ["clip", "screw"],
};

export const BASE_RULES: Omit<Ruleset, "mode"> = {
  gapMm: 5,
  secondarySpacingMm: 400,
  primarySpacingMm: 600,
  anchorSpacingMm: 1000,
  footingSpacingMm: 1800,
  consumerLoss: { base: 0.03, vertexFactor: 0.003, cutoutFactor: 0.005, cap: 0.06 },
  screwPerIntersection: 2,
  showAdvancedOverrides: false,
  enableCutPlan: false,
};

type ShapePreset = {
  label: string;
  getPoints: () => { xMm: number; yMm: number }[];
};

export const SHAPE_PRESETS: Record<Exclude<ShapeType, "free">, ShapePreset> = {
  rectangle: {
    label: "직사각형",
    getPoints: () => [
      { xMm: 0, yMm: 0 },
      { xMm: 1000, yMm: 0 },
      { xMm: 1000, yMm: 1000 },
      { xMm: 0, yMm: 1000 },
    ],
  },
  lShape: {
    label: "ㄱ자형",
    getPoints: () => [
      { xMm: 0, yMm: 0 },
      { xMm: 1000, yMm: 0 },
      { xMm: 1000, yMm: 200 },
      { xMm: 700, yMm: 200 },
      { xMm: 700, yMm: 1200 },
      { xMm: 0, yMm: 1200 },
    ],
  },
  tShape: {
    label: "T자형",
    getPoints: () => [
      { xMm: 600, yMm: 0 },
      { xMm: 1600, yMm: 0 },
      { xMm: 1600, yMm: 200 },
      { xMm: 1000, yMm: 200 },
      { xMm: 1000, yMm: 1200 },
      { xMm: 800, yMm: 1200 },
      { xMm: 800, yMm: 200 },
      { xMm: 600, yMm: 200 },
    ],
  },
  circle: {
    label: "원형",
    getPoints: () => {
      const radius = 500;
      const segments = 16;
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        pts.push({
          xMm: radius + Math.cos(angle) * radius,
          yMm: radius + Math.sin(angle) * radius,
        });
      }
      return pts;
    },
  },
};

export const BASE_PLAN: Plan = {
  unit: "mm",
  polygon: {
    outer: [
      { xMm: 0, yMm: 0 },
      { xMm: 2000, yMm: 0 },
      { xMm: 2000, yMm: 1000 },
      { xMm: 0, yMm: 1000 },
    ],
  },
  boardWidthMm: 140,
  deckingDirectionDeg: 0,
  attachedEdgeIndices: [],
  substructureOverrides: {},
  stairs: {
    enabled: true,
    items: [],
    stringerMaterialOverrides: {},
  },
};

export const INITIAL_PLAN: Plan = {
  ...BASE_PLAN,
  polygon: {
    ...BASE_PLAN.polygon,
    outer: centerShapeToCanvasNoScale(SHAPE_PRESETS.rectangle.getPoints(), VIEWBOX_CENTER),
  },
};
