import { useMemo } from "react";
import type { Polygon } from "@deck/core";
import {
  indexToLabel,
  isPointInsidePolygon,
  normalize,
  polygonCentroid,
  polygonSignedArea,
} from "../geometry/polygon";

const EPS = 1e-3;
const DIAGONALS = [
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
];

export function useDeckGeometry(polygon: Polygon) {
  return useMemo(() => {
    const pts = polygon.outer;
    const vertexLabels: { label: string; position: { x: number; y: number } }[] = [];
    const edgeLabels: {
      id: string;
      text: string;
      position: { x: number; y: number };
      startIdx: number;
      endIdx: number;
      lengthInt: number;
      rotationDeg: number;
    }[] = [];
    let areaM2 = 0;

    if (pts.length < 2) {
      return { vertexLabels, edgeLabels, areaM2 };
    }

    const signedArea = polygonSignedArea(pts);
    // 면적 계산: mm²를 m²로 변환 (1m² = 1,000,000mm²)
    const areaMm2 = Math.abs(signedArea);
    areaM2 = areaMm2 / 1000000;

    const orientation = signedArea >= 0 ? 1 : -1;
    const centroid = polygonCentroid(pts);

    // Calculate vertex labels
    for (let i = 0; i < pts.length; i++) {
      const current = pts[i];
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const edgePrev = normalize({ x: current.xMm - prev.xMm, y: current.yMm - prev.yMm });
      const edgeNext = normalize({ x: next.xMm - current.xMm, y: next.yMm - current.yMm });

      const normalPrev =
        orientation >= 0 ? { x: edgePrev.y, y: -edgePrev.x } : { x: -edgePrev.y, y: edgePrev.x };
      const normalNext =
        orientation >= 0 ? { x: edgeNext.y, y: -edgeNext.x } : { x: -edgeNext.y, y: edgeNext.x };

      let outward = normalize({ x: normalPrev.x + normalNext.x, y: normalPrev.y + normalNext.y });
      if (Math.abs(outward.x) < EPS && Math.abs(outward.y) < EPS) {
        outward = normalize({
          x: current.xMm - centroid.xMm,
          y: current.yMm - centroid.yMm,
        });
      }

      let bestDiag = DIAGONALS[0];
      let bestDot = -Infinity;
      for (const diag of DIAGONALS) {
        const dot = outward.x * diag.x + outward.y * diag.y;
        if (dot > bestDot) {
          bestDot = dot;
          bestDiag = diag;
        }
      }

      let radius = 40;
      let labelPos = {
        x: current.xMm + bestDiag.x * radius,
        y: current.yMm + bestDiag.y * radius,
      };

      // Avoid placing label inside the polygon
      for (let attempt = 0; attempt < 4 && isPointInsidePolygon(labelPos, pts); attempt++) {
        radius += 20;
        labelPos = {
          x: current.xMm + bestDiag.x * radius,
          y: current.yMm + bestDiag.y * radius,
        };
      }
      vertexLabels.push({ label: indexToLabel(i), position: labelPos });
    }

    // Calculate edge labels
    for (let i = 0; i < pts.length; i++) {
      const nextIndex = (i + 1) % pts.length;
      const start = pts[i];
      const end = pts[nextIndex];
      const dx = end.xMm - start.xMm;
      const dy = end.yMm - start.yMm;
      const lengthInt = Math.round(Math.hypot(dx, dy));
      const midpoint = {
        x: (start.xMm + end.xMm) / 2,
        y: (start.yMm + end.yMm) / 2,
      };

      let normal = orientation >= 0 ? normalize({ x: -dy, y: dx }) : normalize({ x: dy, y: -dx });
      if (Math.abs(normal.x) < EPS && Math.abs(normal.y) < EPS) {
        normal = { x: 0, y: -1 };
      }

      const horizontalish = Math.abs(dx) >= Math.abs(dy);
      let offsetDir: { x: number; y: number };

      if (horizontalish) {
        const sign = normal.y >= 0 ? 1 : -1;
        offsetDir = { x: 0, y: sign || 1 };
      } else {
        const sign = normal.x >= 0 ? 1 : -1;
        offsetDir = { x: sign || 1, y: 0 };
      }

      const baseOffset = 36;
      const adjustPosition = () => ({
        x: midpoint.x + offsetDir.x * baseOffset,
        y: midpoint.y + offsetDir.y * baseOffset,
      });
      let labelPos = adjustPosition();

      // If label is outside polygon, flip direction to place it inside (or vice versa? logic seems to check if it's inside then flip?)
      // Original logic: "If label is outside polygon, flip direction" -> Wait.
      // Original:
      // if (!isPointInsidePolygon(labelPos, pts)) {
      //   offsetDir = { x: -offsetDir.x, y: -offsetDir.y };
      //   labelPos = adjustPosition();
      // }
      // The intention seems to be ensuring it's INSIDE? OR OUTSIDE?
      // Usually edge labels are outside.
      // isPointInsidePolygon returns true if inside.
      // So if (!inside) -> flip.
      // This implies it WANTS to be inside? Or it wants to be where it is valid?
      // Let's keep logic exactly as original.
      if (!isPointInsidePolygon(labelPos, pts)) {
        offsetDir = { x: -offsetDir.x, y: -offsetDir.y };
        labelPos = adjustPosition();
      }

      const rotationDeg = horizontalish ? 0 : 90;
      edgeLabels.push({
        id: `${i}-${nextIndex}`,
        text: `${lengthInt} mm`,
        position: labelPos,
        startIdx: i,
        endIdx: nextIndex,
        lengthInt,
        rotationDeg,
      });
    }

    return { vertexLabels, edgeLabels, areaM2 };
  }, [polygon]);
}
