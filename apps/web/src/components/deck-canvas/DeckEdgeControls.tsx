import React from "react";
import type { EdgeHandle } from "../../geometry/edges";

interface DeckEdgeControlsProps {
    edgeHandles: EdgeHandle[];
    attachedEdgeIndices?: number[];
    activeTool: string | null;
    hoverEdgeId: string | null;
    activeEdgeId: string | null;
    isEdgeDragging: boolean;

    // Handlers
    onEdgeDown: (handle: EdgeHandle, event: React.PointerEvent) => void;
    onEdgeEnter: (id: string) => void;
    onEdgeLeave: (id: string) => void;

    // Add Tool Handles
    hoverAddHandle?: { id: string; position: { x: number; y: number }; insertIndex: number } | null;
    // Add Tool "Line" hit areas
    showAddHelpers?: boolean;
    polygonOuter?: { xMm: number; yMm: number }[];
    onUpdateHoverAdd?: (idx: number, x: number, y: number) => void;
    onLeaveHoverAdd?: (idx: number) => void;

    onAddHandleClick?: (index: number, pos: { x: number, y: number }, e: React.PointerEvent) => void;
}

export const DeckEdgeControls = React.memo(function DeckEdgeControls({
    edgeHandles,
    attachedEdgeIndices = [],
    activeTool,
    hoverEdgeId,
    onEdgeDown,
    onEdgeEnter,
    onEdgeLeave,

    // Add tool
    hoverAddHandle,
    showAddHelpers,
    polygonOuter,
    onUpdateHoverAdd,
    onLeaveHoverAdd,
    onAddHandleClick,
}: DeckEdgeControlsProps) {

    return (
        <g>
            {/* Edge Resize Handles */}
            {(activeTool === null || activeTool === 'wall' || activeTool === 'edit') &&
                edgeHandles.map((handle) => {
                    const isHovered = hoverEdgeId === handle.id;
                    const isWallEdge = attachedEdgeIndices.includes(handle.startIndex);

                    // Style logic from original
                    const strokeColor = isWallEdge
                        ? "#444"
                        : isHovered
                            ? "#2463ff"
                            : "rgba(169, 212, 255, 1)";

                    const strokeWidth = isWallEdge ? 16 : 14;
                    const dashArray = isWallEdge ? "10,6" : undefined;

                    // Cursor logic
                    let cursor = "move"; // default for diagonal
                    if (activeTool === "wall") cursor = "pointer";
                    else if (handle.orientation === "vertical") cursor = "ew-resize";
                    else if (handle.orientation === "horizontal") cursor = "ns-resize";

                    return (
                        <g key={handle.id}>
                            {/* Visible Line */}
                            <line
                                x1={handle.start.x}
                                y1={handle.start.y}
                                x2={handle.end.x}
                                y2={handle.end.y}
                                stroke={strokeColor}
                                strokeWidth={strokeWidth}
                                strokeDasharray={dashArray}
                                pointerEvents="none"
                                opacity={isWallEdge ? 1 : 0.6}
                            />
                            {/* Hit Area */}
                            <line
                                x1={handle.start.x}
                                y1={handle.start.y}
                                x2={handle.end.x}
                                y2={handle.end.y}
                                stroke="transparent"
                                strokeWidth={28}
                                pointerEvents="stroke"
                                data-edge-hit="true"
                                style={{ cursor }}
                                onPointerEnter={() => onEdgeEnter(handle.id)}
                                onPointerLeave={() => onEdgeLeave(handle.id)}
                                onPointerDown={(e) => onEdgeDown(handle, e)}
                            />
                        </g>
                    );
                })}

            {/* Add Tool Helpers (Lines between points to detect hover) */}
            {showAddHelpers && polygonOuter && polygonOuter.map((point, idx) => {
                const nextIndex = (idx + 1) % polygonOuter.length;
                const nextPoint = polygonOuter[nextIndex];
                return (
                    <line
                        key={`add-hit-${idx}`}
                        x1={point.xMm}
                        y1={point.yMm}
                        x2={nextPoint.xMm}
                        y2={nextPoint.yMm}
                        stroke="transparent"
                        strokeWidth={28}
                        pointerEvents="stroke"
                        onPointerEnter={(e) => onUpdateHoverAdd?.(idx, e.clientX, e.clientY)}
                        onPointerMove={(e) => onUpdateHoverAdd?.(idx, e.clientX, e.clientY)}
                        onPointerLeave={() => onLeaveHoverAdd?.(idx)}
                    />
                );
            })}

            {/* Add Tool Handle (The circle that appears) */}
            {hoverAddHandle && activeTool === "add" && (
                <circle
                    cx={hoverAddHandle.position.x}
                    cy={hoverAddHandle.position.y}
                    r={10}
                    fill="#fff"
                    stroke="#2463ff"
                    strokeWidth={2}
                    style={{ cursor: "copy" }}
                    onPointerDown={(e) => onAddHandleClick?.(hoverAddHandle.insertIndex, hoverAddHandle.position, e)}
                />
            )}
        </g>
    );
});
