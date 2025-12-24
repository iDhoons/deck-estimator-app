import React from "react";

interface DeckGridProps {
    viewBox: { x: number; y: number; w: number; h: number };
    gridSize?: number;
}

export const DeckGrid = React.memo(function DeckGrid({
    viewBox,
    gridSize = 100,
}: DeckGridProps) {
    // Generate grid lines
    const gridLines = React.useMemo(() => {
        const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
        const minX = Math.floor(viewBox.x / gridSize) * gridSize;
        const maxX = Math.ceil((viewBox.x + viewBox.w) / gridSize) * gridSize;
        const minY = Math.floor(viewBox.y / gridSize) * gridSize;
        const maxY = Math.ceil((viewBox.y + viewBox.h) / gridSize) * gridSize;

        // Vertical lines
        for (let x = minX; x <= maxX; x += gridSize) {
            lines.push({ x1: x, y1: viewBox.y, x2: x, y2: viewBox.y + viewBox.h });
        }

        // Horizontal lines
        for (let y = minY; y <= maxY; y += gridSize) {
            lines.push({ x1: viewBox.x, y1: y, x2: viewBox.x + viewBox.w, y2: y });
        }

        return lines;
    }, [viewBox, gridSize]);

    return (
        <g pointerEvents="none">
            {gridLines.map((line, i) => (
                <line
                    key={`grid-${i}`}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    stroke="#e0e0e0"
                    strokeWidth={1}
                />
            ))}
        </g>
    );
});
