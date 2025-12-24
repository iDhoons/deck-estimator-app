import React from "react";
import type { PlanPoint } from "../../types";

interface DeckHolesProps {
    holes: PlanPoint[][];
    selectedHoleIndex: number | null;
    hoverHoleIndex: number | null;
    isSubView: boolean;
    isEditable: boolean;
    isHoleMoving: boolean;

    onHoleDown: (index: number, e: React.PointerEvent) => void;
    onHoleEnter: (index: number) => void;
    onHoleLeave: (index: number) => void;
}

export const DeckHoles = React.memo(function DeckHoles({
    holes,
    selectedHoleIndex,
    hoverHoleIndex,
    isSubView,
    isEditable,
    isHoleMoving,
    onHoleDown,
    onHoleEnter,
    onHoleLeave,
}: DeckHolesProps) {
    if (!holes || holes.length === 0) return null;

    return (
        <g>
            {holes.map((hole, holeIndex) => {
                const isSelected = selectedHoleIndex === holeIndex;
                const isHovered = hoverHoleIndex === holeIndex;

                // Dynamic cursor style
                let cursor = "default";
                if (isEditable) {
                    if (isHoleMoving && isSelected) cursor = "grabbing";
                    else if (isHovered || isSelected) cursor = "move";
                }

                return (
                    <polygon
                        key={`hole-${holeIndex}`}
                        points={hole.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
                        fill="#fafafa"
                        stroke={isSelected ? "#c52222" : "#ff6b6b"}
                        strokeWidth={isSelected ? 4 : 3}
                        opacity={isSubView ? 0.5 : 1}
                        pointerEvents="all"
                        onPointerEnter={() => onHoleEnter(holeIndex)}
                        onPointerLeave={() => onHoleLeave(holeIndex)}
                        onPointerDown={(e) => onHoleDown(holeIndex, e)}
                        style={{ cursor }}
                    />
                );
            })}
        </g>
    );
});
