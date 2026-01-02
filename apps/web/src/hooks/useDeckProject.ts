import { useCallback, useEffect } from "react";
import { type Plan, type Polygon } from "@deck/core";
import { type ShapeType } from "../types";
import { type CutoutMeta } from "../geometry/cutouts";
import { type ProjectState, persistence } from "../utils/persistence";
import { useHistory } from "./useHistory";
import { INITIAL_PLAN, SHAPE_PRESETS, VIEWBOX_CENTER } from "../constants/defaults";
import { metaFromHolePoints } from "../geometry/cutouts";
import {
  centerShapeToCanvasNoScale,
  circleSegmentsForSagitta,
  buildCirclePoints,
} from "../geometry/shapes";
import { isPointInsidePolygon, polygonCentroid } from "../geometry/polygon";
import { MIN_EDGE_SPAN_MM, updateEdgeLength, EDGE_LENGTH_STEP_MM } from "../geometry/edges";

// Helper to deduce shape type from polygon points
function detectShapeType(pointCount: number): "free" | ShapeType {
  if (pointCount === 0) return "free";
  if (pointCount === 4) return "rectangle";
  if (pointCount === 6) return "lShape";
  if (pointCount === 8) return "tShape";
  return "free";
}

const initialCutoutsMeta = (INITIAL_PLAN.polygon.holes ?? []).map((h) => metaFromHolePoints(h));
const initialProjectState: ProjectState = {
  plan: INITIAL_PLAN,
  cutoutsMeta: initialCutoutsMeta,
  shapeType: "rectangle",
};

export function useDeckProject() {
  const {
    state: project,
    set: setProject,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetHistory,
  } = useHistory<ProjectState>(initialProjectState);

  // Auto-save
  useEffect(() => {
    persistence.saveToLocal(project);
  }, [project]);

  // Load from local
  useEffect(() => {
    const saved = persistence.loadFromLocal();
    if (saved) {
      resetHistory(saved);
    }
  }, [resetHistory]);

  const updatePolygon = useCallback(
    (updatedPolygon: Polygon) => {
      setProject((prev) => {
        // 1. Calculate new plan & holes
        const nextAttached = (prev.plan.attachedEdgeIndices ?? []).filter(
          (i: number) => i >= 0 && i < updatedPolygon.outer.length,
        );
        const nextFascia = (prev.plan.fasciaEdgeIndices ?? []).filter(
          (i: number) => i >= 0 && i < updatedPolygon.outer.length,
        );
        const updatedHoles = updatedPolygon.holes ?? [];
        const nextHoles: { xMm: number; yMm: number }[][] = [];
        const nextMeta: CutoutMeta[] = [];

        // Process all holes from updatedPolygon
        for (let i = 0; i < updatedHoles.length; i++) {
          const hole = updatedHoles[i];
          const ok =
            hole.length >= 3 &&
            hole.every((p) => isPointInsidePolygon({ x: p.xMm, y: p.yMm }, updatedPolygon.outer));
          if (ok) {
            nextHoles.push(hole);
            // Try to find matching meta from previous state, otherwise generate new
            if (i < prev.cutoutsMeta.length) {
              nextMeta.push(prev.cutoutsMeta[i]);
            } else {
              // New hole - generate metadata
              nextMeta.push(metaFromHolePoints(hole));
            }
          }
        }

        // 4. Detect Shape Type
        let nextShapeType = prev.shapeType;
        if (prev.shapeType !== "free") {
          const detected = detectShapeType(updatedPolygon.outer.length);
          if (detected !== "free") {
            nextShapeType = detected;
          }
        }
        // Special case: if points become empty, it's free mode (cleared)
        if (updatedPolygon.outer.length === 0) {
          nextShapeType = "free";
        }

        return {
          ...prev,
          plan: {
            ...prev.plan,
            polygon: { ...updatedPolygon, holes: nextHoles.length > 0 ? nextHoles : undefined },
            attachedEdgeIndices: nextAttached,
            fasciaEdgeIndices: nextFascia,
          },
          cutoutsMeta: nextMeta,
          shapeType: nextShapeType,
        };
      });
    },
    [setProject],
  );

  const setPlan = useCallback(
    (updater: (prev: Plan) => Plan) => {
      setProject((prev) => ({ ...prev, plan: updater(prev.plan) }));
    },
    [setProject],
  );

  const setCutoutsMeta = useCallback(
    (updater: (prev: CutoutMeta[]) => CutoutMeta[]) => {
      setProject((prev) => ({ ...prev, cutoutsMeta: updater(prev.cutoutsMeta) }));
    },
    [setProject],
  );

  // Actions
  const actions = {
    setPlan,
    setCutoutsMeta,
    updatePolygon,
    undo,
    redo,
    resetHistory,

    applyPresetShape: (nextShape: ShapeType) => {
      setProject((prev) => {
        if (nextShape === "free") {
          return {
            ...prev,
            shapeType: "free",
            plan: {
              ...prev.plan,
              attachedEdgeIndices: [],
              substructureOverrides: {},
              polygon: { ...prev.plan.polygon, outer: [] },
            },
          };
        }
        const preset = SHAPE_PRESETS[nextShape as Exclude<ShapeType, "free">];
        // Use imported VIEWBOX_CENTER
        const centered = centerShapeToCanvasNoScale(preset.getPoints(), VIEWBOX_CENTER);
        return {
          ...prev,
          shapeType: nextShape,
          plan: {
            ...prev.plan,
            attachedEdgeIndices: [],
            substructureOverrides: {},
            polygon: { ...prev.plan.polygon, outer: centered },
          },
        };
      });
    },

    addCutout: () => {
      setProject((prev) => {
        const outer = prev.plan.polygon.outer;
        if (outer.length < 3) return prev;

        const inside = (xMm: number, yMm: number) =>
          isPointInsidePolygon({ x: xMm, y: yMm }, outer);

        const c = polygonCentroid(outer);
        let cx = c.xMm;
        let cy = c.yMm;
        if (!inside(cx, cy)) {
          const p0 = outer[0];
          cx = p0.xMm;
          cy = p0.yMm;
          for (let i = 1; i < outer.length; i++) {
            const pi = outer[i];
            const mx = (p0.xMm + pi.xMm) / 2;
            const my = (p0.yMm + pi.yMm) / 2;
            if (inside(mx, my)) {
              cx = mx;
              cy = my;
              break;
            }
          }
        }

        const makeRect = (w: number, h: number) => [
          { xMm: cx - w / 2, yMm: cy - h / 2 },
          { xMm: cx + w / 2, yMm: cy - h / 2 },
          { xMm: cx + w / 2, yMm: cy + h / 2 },
          { xMm: cx - w / 2, yMm: cy + h / 2 },
        ];

        let candidate: { xMm: number; yMm: number }[] = [];
        const w0 = 420;
        const h0 = 300;
        for (let k = 0; k < 8; k++) {
          const w = w0 * Math.pow(0.8, k);
          const h = h0 * Math.pow(0.8, k);
          const pts = makeRect(w, h);
          if (pts.every((p) => inside(p.xMm, p.yMm))) {
            candidate = pts;
            break;
          }
        }

        if (candidate.length < 3) return prev;

        const holes = [...(prev.plan.polygon.holes ?? []), candidate];
        const addedMeta = metaFromHolePoints(candidate, "rectangle");

        return {
          ...prev,
          plan: { ...prev.plan, polygon: { ...prev.plan.polygon, holes } },
          cutoutsMeta: [...prev.cutoutsMeta, addedMeta],
        };
      });
    },

    deleteCutout: (index: number) => {
      setProject((prev) => {
        const holes = prev.plan.polygon.holes ?? [];
        if (index < 0 || index >= holes.length) return prev;
        const nextHoles = holes.filter((_: unknown, i: number) => i !== index);
        return {
          ...prev,
          plan: {
            ...prev.plan,
            polygon: { ...prev.plan.polygon, holes: nextHoles.length > 0 ? nextHoles : undefined },
          },
          cutoutsMeta: prev.cutoutsMeta.filter((_, i) => i !== index),
        };
      });
    },

    changeCutout: (index: number, nextMeta: CutoutMeta) => {
      setProject((prev) => {
        const holes = prev.plan.polygon.holes ?? [];
        if (index < 0 || index >= holes.length) return prev;

        // Ensure newMetas has the correct length and includes the updated metadata
        const newMetas = [...prev.cutoutsMeta];
        // Extend array if needed
        while (newMetas.length <= index) {
          newMetas.push(metaFromHolePoints(holes[newMetas.length]));
        }
        newMetas[index] = nextMeta;

        const prevHole = holes[index];

        const safeW = Math.max(1, Math.round(nextMeta.widthMm));
        const safeH = Math.max(1, Math.round(nextMeta.heightMm));
        const safeMeta: CutoutMeta = { ...nextMeta, widthMm: safeW, heightMm: safeH };

        let nextHole: { xMm: number; yMm: number }[] = prevHole;
        if (safeMeta.shape === "rectangle") {
          const w = Math.max(MIN_EDGE_SPAN_MM, safeMeta.widthMm);
          const h = Math.max(MIN_EDGE_SPAN_MM, safeMeta.heightMm);
          const cx = safeMeta.xMm;
          const cy = safeMeta.yMm;
          nextHole = [
            { xMm: cx - w / 2, yMm: cy - h / 2 },
            { xMm: cx + w / 2, yMm: cy - h / 2 },
            { xMm: cx + w / 2, yMm: cy + h / 2 },
            { xMm: cx - w / 2, yMm: cy + h / 2 },
          ];
        } else {
          // Custom scaling logic for free shapes
          let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
          for (const p of prevHole) {
            minX = Math.min(minX, p.xMm);
            maxX = Math.max(maxX, p.xMm);
            minY = Math.min(minY, p.yMm);
            maxY = Math.max(maxY, p.yMm);
          }
          const oldW = maxX - minX;
          const oldH = maxY - minY;
          const oldCx = (minX + maxX) / 2;
          const oldCy = (minY + maxY) / 2;

          const sx = oldW > 0 ? safeMeta.widthMm / oldW : 1;
          const sy = oldH > 0 ? safeMeta.heightMm / oldH : 1;
          nextHole = prevHole.map((p: { xMm: number; yMm: number }) => ({
            xMm: safeMeta.xMm + (p.xMm - oldCx) * sx,
            yMm: safeMeta.yMm + (p.yMm - oldCy) * sy,
          }));
        }

        const nextHoles = holes.map((h: { xMm: number; yMm: number }[], i: number) =>
          i === index ? nextHole : h,
        );
        return {
          ...prev,
          plan: {
            ...prev.plan,
            polygon: { ...prev.plan.polygon, holes: nextHoles.length > 0 ? nextHoles : undefined },
          },
          cutoutsMeta: newMetas,
        };
      });
    },

    changeCircleRadius: (nextRadiusMm: number) => {
      const target = Math.round(nextRadiusMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
      let didUpdate = false;
      setProject((prev) => {
        const pts = prev.plan.polygon.outer;
        if (pts.length < 3) return prev;
        const c = polygonCentroid(pts);
        const radius = Math.max(MIN_EDGE_SPAN_MM, target);
        const seg = circleSegmentsForSagitta(radius, 10);
        const newOuter = buildCirclePoints(c, radius, seg);
        didUpdate = true;
        return {
          ...prev,
          plan: { ...prev.plan, polygon: { ...prev.plan.polygon, outer: newOuter } },
        };
      });
      return didUpdate;
    },

    changeEdgeLength: (startIndex: number, nextLengthMm: number) => {
      const targetLength = Math.round(nextLengthMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
      let didUpdate = false;
      setProject((prev) => {
        const points = prev.plan.polygon.outer;
        const isRectangle = prev.shapeType === "rectangle" && points.length === 4;
        let newOuter = points;

        if (isRectangle) {
          const [A, B, C, D] = points;
          if (startIndex === 0) {
            const currentLength = Math.hypot(B.xMm - A.xMm, B.yMm - A.yMm);
            if (currentLength < 1) return prev;
            const delta = (targetLength - currentLength) / 2;
            const dirX = (B.xMm - A.xMm) / currentLength;
            const dirY = (B.yMm - A.yMm) / currentLength;
            newOuter = [
              { xMm: A.xMm - dirX * delta, yMm: A.yMm - dirY * delta },
              { xMm: B.xMm + dirX * delta, yMm: B.yMm + dirY * delta },
              { xMm: C.xMm + dirX * delta, yMm: C.yMm + dirY * delta },
              { xMm: D.xMm - dirX * delta, yMm: D.yMm - dirY * delta },
            ];
          } else if (startIndex === 1) {
            const currentLength = Math.hypot(C.xMm - B.xMm, C.yMm - B.yMm);
            if (currentLength < 1) return prev;
            const delta = (targetLength - currentLength) / 2;
            const dirX = (C.xMm - B.xMm) / currentLength;
            const dirY = (C.yMm - B.yMm) / currentLength;
            newOuter = [
              { xMm: A.xMm - dirX * delta, yMm: A.yMm - dirY * delta },
              { xMm: B.xMm - dirX * delta, yMm: B.yMm - dirY * delta },
              { xMm: C.xMm + dirX * delta, yMm: C.yMm + dirY * delta },
              { xMm: D.xMm + dirX * delta, yMm: D.yMm + dirY * delta },
            ];
          } else {
            return prev;
          }
        } else {
          const updated = updateEdgeLength(points, startIndex, targetLength, {
            minLengthMm: MIN_EDGE_SPAN_MM,
          });
          if (!updated) return prev;
          newOuter = updated;
        }
        didUpdate = true;
        return {
          ...prev,
          plan: { ...prev.plan, polygon: { ...prev.plan.polygon, outer: newOuter } },
        };
      });
      return didUpdate;
    },
  };

  return {
    project,
    actions,
    canUndo,
    canRedo,
    resetHistory,
  };
}
