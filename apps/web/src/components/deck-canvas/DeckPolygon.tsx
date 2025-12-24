import React from "react";
import type { PlanPoint } from "../../types";
import type { Polygon } from "@deck/core";
import type { ShapeType } from "../../types";

interface DeckPolygonProps {
    polygon: Polygon;
    shapeType?: ShapeType;
    shapeInfo: { isFree: boolean; isClosed: boolean };
    isCircle: boolean;
    circleCenter?: { x: number; y: number } | null;
    circleRadius?: number | null;
    styles: {
        fill: string;
        stroke: string;
        strokeWidth: number;
        strokeLinejoin: "miter" | "round" | "bevel";
        strokeLinecap: "butt" | "round" | "square";
        opacity: number;
        cutoutFill: string;
        cutoutStroke: string;
    };
    // Circle specific interaction
    onCircleOutlineEnter?: () => void;
    onCircleOutlineLeave?: () => void;
    onCircleOutlineDown?: (e: React.PointerEvent) => void;
}

export const DeckPolygon = React.memo(function DeckPolygon({
    polygon,
    shapeInfo,
    isCircle,
    circleCenter,
    circleRadius,
    styles,
    onCircleOutlineEnter,
    onCircleOutlineLeave,
    onCircleOutlineDown,
}: DeckPolygonProps) {
    // Helper to format point string for SVG
    const pointsToString = (pts: PlanPoint[]) =>
        pts.map((p) => `${p.xMm},${p.yMm}`).join(" ");

    // 1. Free mode (Open Polyline)
    if (shapeInfo.isFree && !shapeInfo.isClosed) {
        return (
            <polyline
                points={pointsToString(polygon.outer)}
                fill="none"
                stroke={styles.stroke}
                strokeWidth={styles.strokeWidth}
                strokeLinejoin={styles.strokeLinejoin}
                strokeLinecap={styles.strokeLinecap}
                opacity={styles.opacity}
                pointerEvents="all"
            />
        );
    }

    // 2. Circle Mode (Render as perfect circle)
    if (isCircle && circleCenter && typeof circleRadius === 'number') {
        // Circle interaction is handled by a transparent "hit" circle and a visible circle
        // Logic copied from original DeckCanvas
        const baseStrokeWidth = styles.strokeWidth;
        const radius = circleRadius; // Type-narrowed value

        return (
            <>
                {/* hit circle (transparent, thick stroke) */}
                <circle
                    cx={circleCenter.x}
                    cy={circleCenter.y}
                    r={radius}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={Math.max(24, baseStrokeWidth * 6)}
                    pointerEvents="stroke"
                    style={{ cursor: "ew-resize" }}
                    onPointerEnter={onCircleOutlineEnter}
                    onPointerLeave={onCircleOutlineLeave}
                    onPointerDown={onCircleOutlineDown}
                />
                {/* visible circle */}
                <circle
                    cx={circleCenter.x}
                    cy={circleCenter.y}
                    r={radius}
                    stroke={styles.stroke}
                    strokeWidth={styles.strokeWidth}
                    strokeLinejoin={styles.strokeLinejoin}
                    strokeLinecap={styles.strokeLinecap}
                    fill={styles.fill}
                    opacity={styles.opacity}
                    pointerEvents="none"
                />
                <line
                    x1={circleCenter.x}
                    y1={circleCenter.y}
                    x2={circleCenter.x + radius}
                    y2={circleCenter.y}
                    stroke="#2463ff"
                    strokeWidth={2}
                    opacity={0.6}
                    pointerEvents="none"
                />
                <text
                    x={circleCenter.x + radius * 0.5}
                    y={circleCenter.y - 12}
                    fontSize={14}
                    fill="#2463ff"
                    fontWeight={700}
                    textAnchor="middle"
                    pointerEvents="none"
                    stroke="#ffffff"
                    strokeWidth={3}
                    paintOrder="stroke"
                >
                    {`${Math.round(radius).toLocaleString()}mm`}
                </text>
            </>
        );
    }

    // 3. Standard Polygon
    return (
        <g>
            {/* Main Shape */}
            <polygon
                points={pointsToString(polygon.outer)}
                fill={styles.fill}
                stroke={styles.stroke}
                strokeWidth={styles.strokeWidth}
                strokeLinejoin={styles.strokeLinejoin}
                strokeLinecap={styles.strokeLinecap}
                opacity={styles.opacity}
                pointerEvents="all"
            />

            {/* Holes / Cutouts */}
            {/* Note: In original code, holes were rendered separately after the main polygon loop. 
          But semantically they belong to the deck. 
          However, the original code attaches specific event handlers (drag/select) to holes.
          We should probably keep holes separate or pass hole handlers to this component.
          
          For now, let's keep holes OUT of DeckPolygon if we want to mimic the original structure EXACTLY,
          or include them if we want to encapsulate.
          The implementation plan said "Renders main polygon shape and its holes".
          I will render holes here BUT without the complex drag logic for now, 
          OR I should update the plan to handle hole interaction.
          
          Actually, the original code loop for holes is quite complex (selection, hover, drag).
          It might be better to have a `DeckHoles` component.
      */}
        </g>
    );
});
