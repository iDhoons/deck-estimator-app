import React, { useState } from "react";
import type { PlanPoint } from "../../types";
import type { CutoutMeta } from "../../geometry/cutouts";

interface DeckHoleEdgeHandlesProps {
  holes: PlanPoint[][];
  cutoutsMeta: CutoutMeta[];
  selectedHoleIndex: number | null;
  isEditable: boolean;
  onCornerDown: (holeIndex: number, corner: "top-left" | "top-right" | "bottom-left" | "bottom-right", e: React.PointerEvent) => void;
  onEdgeDown: (holeIndex: number, edge: "top" | "right" | "bottom" | "left", e: React.PointerEvent) => void;
}

export const DeckHoleEdgeHandles = React.memo(function DeckHoleEdgeHandles({
  holes,
  cutoutsMeta,
  selectedHoleIndex,
  isEditable,
  onCornerDown,
  onEdgeDown,
}: DeckHoleEdgeHandlesProps) {
  const [hoverCorner, setHoverCorner] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  if (!isEditable || selectedHoleIndex === null) return null;

  const hole = holes[selectedHoleIndex];
  const meta = cutoutsMeta[selectedHoleIndex];

  if (!hole || !meta) return null;

  // Only show edge handles for rectangle and circle
  if (meta.shape !== "rectangle" && meta.shape !== "circle") return null;

  const { xMm, yMm, widthMm, heightMm } = meta;
  const halfW = widthMm / 2;
  const halfH = heightMm / 2;

  const handleSize = 12;
  const edgeHandleLength = 40; // 변 핸들의 길이
  const edgeHandleWidth = 8; // 변 핸들의 두께

  // Corner positions for rectangle
  const corners = [
    { name: "top-left" as const, x: xMm - halfW, y: yMm - halfH, cursor: "nwse-resize" },
    { name: "top-right" as const, x: xMm + halfW, y: yMm - halfH, cursor: "nesw-resize" },
    { name: "bottom-left" as const, x: xMm - halfW, y: yMm + halfH, cursor: "nesw-resize" },
    { name: "bottom-right" as const, x: xMm + halfW, y: yMm + halfH, cursor: "nwse-resize" },
  ];

  // Edge midpoints (변 중앙)
  const edges = [
    { name: "top" as const, x: xMm, y: yMm - halfH, cursor: "ns-resize", isHorizontal: true },
    { name: "right" as const, x: xMm + halfW, y: yMm, cursor: "ew-resize", isHorizontal: false },
    { name: "bottom" as const, x: xMm, y: yMm + halfH, cursor: "ns-resize", isHorizontal: true },
    { name: "left" as const, x: xMm - halfW, y: yMm, cursor: "ew-resize", isHorizontal: false },
  ];

  return (
    <g>
      {/* Edge handles (변 핸들) */}
      {edges.map((edge) => {
        const isHovered = hoverEdge === edge.name;
        return (
          <rect
            key={edge.name}
            x={edge.isHorizontal ? edge.x - edgeHandleLength / 2 : edge.x - edgeHandleWidth / 2}
            y={edge.isHorizontal ? edge.y - edgeHandleWidth / 2 : edge.y - edgeHandleLength / 2}
            width={edge.isHorizontal ? edgeHandleLength : edgeHandleWidth}
            height={edge.isHorizontal ? edgeHandleWidth : edgeHandleLength}
            rx={2}
            fill="#fff"
            stroke="#c52222"
            strokeWidth={isHovered ? 3 : 2}
            cursor={edge.cursor}
            pointerEvents="all"
            onPointerEnter={() => setHoverEdge(edge.name)}
            onPointerLeave={() => setHoverEdge(null)}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdgeDown(selectedHoleIndex, edge.name, e);
            }}
          />
        );
      })}

      {/* Corner handles (모서리 핸들) */}
      {corners.map((corner) => {
        const isHovered = hoverCorner === corner.name;
        return (
          <rect
            key={corner.name}
            x={corner.x - handleSize / 2}
            y={corner.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            rx={2}
            fill="#fff"
            stroke="#c52222"
            strokeWidth={isHovered ? 3 : 2}
            cursor={corner.cursor}
            pointerEvents="all"
            onPointerEnter={() => setHoverCorner(corner.name)}
            onPointerLeave={() => setHoverCorner(null)}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCornerDown(selectedHoleIndex, corner.name, e);
            }}
          />
        );
      })}
    </g>
  );
});
