import { useCallback, useRef, useState } from "react";
import type { Polygon } from "@deck/core";

export type ViewMode = "deck" | "substructure";

const VIEWBOX = { width: 2000, height: 1200 };

function clamp(value: number, min: number, max: number) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function DeckCanvas({
  polygon,
  viewMode,
  onChangePolygon,
}: {
  polygon: Polygon;
  viewMode: ViewMode;
  onChangePolygon?: (polygon: Polygon) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const isEditable = typeof onChangePolygon === "function";
  const isSubView = viewMode === "substructure";

  const toSvgCoords = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const { x, y } = point.matrixTransform(matrix.inverse());
    return { x, y };
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const activeIndex = dragIndexRef.current;
      if (activeIndex === null || !onChangePolygon) return;
      const coords = toSvgCoords(event.clientX, event.clientY);
      if (!coords) return;
      if (!Number.isFinite(coords.x) || !Number.isFinite(coords.y)) return;
      const x = clamp(coords.x, 0, VIEWBOX.width);
      const y = clamp(coords.y, 0, VIEWBOX.height);
      const updatedOuter = polygon.outer.map((pt, idx) =>
        idx === activeIndex ? { xMm: x, yMm: y } : pt
      );
      onChangePolygon({ ...polygon, outer: updatedOuter });
    },
    [onChangePolygon, polygon, toSvgCoords]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      if (dragIndexRef.current === null) return;
      event.preventDefault();
      const svg = svgRef.current;
      if (svg && pointerIdRef.current !== null && svg.hasPointerCapture?.(pointerIdRef.current)) {
        svg.releasePointerCapture(pointerIdRef.current);
      }
      pointerIdRef.current = null;
      setDragIndex(null);
      dragIndexRef.current = null;
    },
    []
  );

  const startDrag = useCallback(
    (idx: number) => (event: React.PointerEvent<SVGCircleElement>) => {
      if (!isEditable) return;
      if (dragIndexRef.current !== null) return;
      event.preventDefault();
      event.stopPropagation();
      pointerIdRef.current = event.pointerId;
      svgRef.current?.setPointerCapture?.(event.pointerId);
      setDragIndex(idx);
      dragIndexRef.current = idx;
    },
    [isEditable]
  );

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="360"
      viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
      style={{ border: "1px solid #ddd", background: "#fafafa" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <polygon
        points={polygon.outer.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
        fill={isSubView ? "none" : "rgba(80,160,255,0.12)"}
        stroke="#5af"
        strokeWidth={isSubView ? 4 : 8}
        opacity={isSubView ? 0.2 : 1}
      />

      {polygon.outer.map((point, idx) => (
        <circle
          key={`${point.xMm}-${point.yMm}-${idx}`}
          cx={point.xMm}
          cy={point.yMm}
          r={24}
          fill="#fff"
          stroke="#2463ff"
          strokeWidth={4}
          style={{
            cursor: isEditable ? "pointer" : "default",
            pointerEvents: isEditable ? "auto" : "none",
          }}
          onPointerDown={startDrag(idx)}
        />
      ))}

      <text x={20} y={30} fill="#555" fontSize={20}>
        {isSubView ? "하부 구조 보기" : "데크 보기"}
      </text>
    </svg>
  );
}
