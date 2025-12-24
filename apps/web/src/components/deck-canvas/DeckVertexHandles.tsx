import React from "react";
import type { PlanPoint } from "../../types";

interface DeckVertexHandlesProps {
    outerPoints: PlanPoint[];
    holes?: PlanPoint[][];

    // State
    hoverVertexIndex: number | null;
    dragVertexIndex: number | null;
    hoverHoleIndex: number | null;
    selectedHoleIndex: number | null;

    activeTool: string | null;
    isEditable: boolean;

    // Handlers
    onVertexDown: (index: number, e: React.PointerEvent) => void;
    onVertexEnter: (index: number) => void;
    onVertexLeave: (index: number) => void;

    onHoleVertexDown: (holeIndex: number, vertexIndex: number, e: React.PointerEvent) => void;
    onHoleVertexEnter: (holeIndex: number) => void;
    onHoleVertexLeave: (holeIndex: number) => void;
}

export const DeckVertexHandles = React.memo(function DeckVertexHandles({
    outerPoints,
    holes = [],
    selectedHoleIndex,
    activeTool,
    isEditable,
    onVertexDown,
    onHoleVertexDown,
}: DeckVertexHandlesProps) {

    const isDeleteMode = activeTool === "delete";

    return (
        <g>
            {/* Outer Vertices */}
            {outerPoints.map((point, idx) => {
                // Logic from original: 
                // Enable vertex dragging for preset shapes only in "add" mode? 
                // Actually original comment says: "Enable vertex dragging for preset shapes only in 'add' mode"
                // But generally "canDrag" depends on isEditable.
                // Assuming parent handles the "preset" check via `isEditable` or similar, 
                // OR we strictly follow the original logic specific to "add" mode if that was the constraint.
                // Original: const canDrag = isEditable && activeTool === "add"; 
                // Wait, really? Usually dragging works in default mode too? 
                // Ah, maybe presets are "locked" unless you are in "Add" mode (modifying shape)?
                // Let's stick to the original logic:
                const canDrag = isEditable && activeTool === "add";

                // Styling
                const fill = isDeleteMode ? "#ffe6e6" : "#fff";
                const stroke = isDeleteMode ? "#c52222" : "#2463ff";
                const cursor = isDeleteMode ? "not-allowed" : canDrag ? "pointer" : "default"; // "default" if not draggable?
                const pointerEvents = canDrag || isDeleteMode ? "auto" : "none";

                return (
                    <circle
                        key={`vertex-${idx}`}
                        cx={point.xMm}
                        cy={point.yMm}
                        r={8}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={2}
                        style={{ cursor, pointerEvents }}
                        onPointerDown={(e) => onVertexDown(idx, e)}
                    />
                );
            })}

            {/* Hole Vertices (Only if selected) */}
            {isEditable && selectedHoleIndex !== null && holes[selectedHoleIndex] &&
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
