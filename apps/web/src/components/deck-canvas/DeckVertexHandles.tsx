import React from "react";
import type { PlanPoint } from "../../types";

interface DeckVertexHandlesProps {
  outerPoints: PlanPoint[];
  holes?: PlanPoint[][];
  selectedHoleIndex: number | null;
  activeTool: string | null;
  isEditable: boolean;
  isCircle?: boolean; // Hide labels for circle shapes

  // Handlers
  onVertexDown: (index: number, e: React.PointerEvent) => void;
  onHoleVertexDown: (holeIndex: number, vertexIndex: number, e: React.PointerEvent) => void;
}

export const DeckVertexHandles = React.memo(function DeckVertexHandles({
  outerPoints,
  holes = [],
  selectedHoleIndex,
  activeTool,
  isEditable,
  isCircle = false,
  onVertexDown,
  onHoleVertexDown,
}: DeckVertexHandlesProps) {
  const isDeleteMode = activeTool === "delete";

  // Only show vertex handles in add or delete mode
  const showVertexHandles = activeTool === "add" || activeTool === "delete";

  // Hide labels for circles
  const showLabels = !isCircle;

  return (
    <g>
      {/* Outer Vertices */}
      {outerPoints.map((point, idx) => {
        const canDrag = isEditable && activeTool === "add";

        // Styling
        const fill = isDeleteMode ? "#ffe6e6" : "#fff";
        const stroke = isDeleteMode ? "#c52222" : "#2463ff";
        const cursor = isDeleteMode ? "not-allowed" : canDrag ? "pointer" : "default";
        const pointerEvents = canDrag || isDeleteMode ? "auto" : "none";

        const label = String.fromCharCode(65 + (idx % 26)); // A, B, C, ...

        // Calculate label position (opposite diagonal direction from edges)
        const prevIdx = (idx - 1 + outerPoints.length) % outerPoints.length;
        const nextIdx = (idx + 1) % outerPoints.length;
        const prevPoint = outerPoints[prevIdx];
        const nextPoint = outerPoints[nextIdx];

        // Calculate vectors from current point to neighbors
        const toPrev = { x: prevPoint.xMm - point.xMm, y: prevPoint.yMm - point.yMm };
        const toNext = { x: nextPoint.xMm - point.xMm, y: nextPoint.yMm - point.yMm };

        // Calculate average direction of edges
        const avgDir = { x: toPrev.x + toNext.x, y: toPrev.y + toNext.y };
        const len = Math.sqrt(avgDir.x * avgDir.x + avgDir.y * avgDir.y);

        // Position label in opposite direction (away from polygon interior)
        const labelDistance = 20;
        const labelOffset =
          len > 0
            ? { x: -(avgDir.x / len) * labelDistance, y: -(avgDir.y / len) * labelDistance }
            : { x: 0, y: -labelDistance }; // fallback: above

        return (
          <g key={`vertex-${idx}`}>
            {/* Only show vertex handle circle in add/delete mode */}
            {showVertexHandles && (
              <circle
                cx={point.xMm}
                cy={point.yMm}
                r={8}
                fill={fill}
                stroke={stroke}
                strokeWidth={2}
                style={{ cursor, pointerEvents }}
                onPointerDown={(e) => onVertexDown(idx, e)}
              />
            )}
            {showLabels && (
              <text
                x={point.xMm + labelOffset.x}
                y={point.yMm + labelOffset.y}
                fontSize={16}
                fill="#0b2540"
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
                pointerEvents="none"
              >
                {label}
              </text>
            )}
          </g>
        );
      })}

      {/* Hole Vertices (Only if selected) */}
      {isEditable &&
        selectedHoleIndex !== null &&
        holes[selectedHoleIndex] &&
        holes[selectedHoleIndex].map((pt, vi) => (
          <circle
            key={`hole-vertex-${selectedHoleIndex}-${vi}`}
            cx={pt.xMm}
            cy={pt.yMm}
            r={7}
            fill="#fff"
            stroke="#c52222"
            strokeWidth={2}
            style={{ cursor: "pointer" }}
            onPointerDown={(e) => onHoleVertexDown(selectedHoleIndex, vi, e)}
          />
        ))}
    </g>
  );
});
