import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { Point } from "@deck/core";

const VIEWBOX = { width: 2000, height: 1200 };
const GRID_SIZE = 100; // 100mm grid
const CLOSE_RADIUS = 20; // 20mm close threshold

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function FreeDrawCanvas({
  onPolygonComplete,
}: {
  onPolygonComplete?: (points: Point[]) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: VIEWBOX.width, h: VIEWBOX.height });
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPanning, setIsPanning] = useState(false);

  const panPointerIdRef = useRef<number | null>(null);
  const panStartClientRef = useRef<{ x: number; y: number } | null>(null);
  const panStartViewBoxRef = useRef<{ x: number; y: number } | null>(null);
  const panScaleRef = useRef<{ x: number; y: number } | null>(null);

  // Draft state: points being drawn
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);

  // Final shapes: completed polygons
  const [finalShapes, setFinalShapes] = useState<Point[][]>([]);
  const drawingLocked = finalShapes.length > 0;

  const centerX = useMemo(() => viewBox.x + viewBox.w / 2, [viewBox]);
  const centerY = useMemo(() => viewBox.y + viewBox.h / 2, [viewBox]);
  const transformGroup = useMemo(
    () =>
      `translate(${centerX} ${centerY}) rotate(${rotation}) scale(${scale}) translate(${-centerX} ${-centerY})`,
    [centerX, centerY, rotation, scale]
  );

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

  const toWorldCoords = useCallback(
    (clientX: number, clientY: number) => {
      const coords = toSvgCoords(clientX, clientY);
      if (!coords) return null;
      const x0 = coords.x - centerX;
      const y0 = coords.y - centerY;
      const invScale = scale === 0 ? 1 : 1 / scale;
      const x1 = x0 * invScale;
      const y1 = y0 * invScale;
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const x2 = x1 * cos + y1 * sin;
      const y2 = -x1 * sin + y1 * cos;
      return { x: x2 + centerX, y: y2 + centerY };
    },
    [centerX, centerY, rotation, scale, toSvgCoords]
  );

  const centerView = useCallback(() => {
    setViewBox({ x: 0, y: 0, w: VIEWBOX.width, h: VIEWBOX.height });
    setScale(1);
    setRotation(0);
  }, []);

  const controls = [
    { key: "rotate", label: "회전", onClick: () => setRotation((prev) => (prev + 15) % 360) },
    { key: "center", label: "중앙 맞추기", onClick: centerView },
    { key: "zoom-out", label: "축소", onClick: () => setScale((prev) => Math.max(0.2, prev * 0.9)) },
    { key: "zoom-in", label: "확대", onClick: () => setScale((prev) => Math.min(5, prev * 1.1)) },
    {
      key: "clear",
      label: "지우기",
      onClick: () => {
        setDraftPoints([]);
        setFinalShapes([]);
      },
    },
  ];

  const handleCanvasClick = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (drawingLocked) return;
      if (isPanning) return;
      if (panPointerIdRef.current !== null) return;

      const world = toWorldCoords(event.clientX, event.clientY);
      if (!world) return;

      // Snap to grid
      const snappedPoint: Point = {
        xMm: snapToGrid(world.x, GRID_SIZE),
        yMm: snapToGrid(world.y, GRID_SIZE),
      };

      // Check if we're closing the polygon
      if (draftPoints.length >= 2) {
        const first = draftPoints[0];
        const dx = snappedPoint.xMm - first.xMm;
        const dy = snappedPoint.yMm - first.yMm;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= CLOSE_RADIUS) {
          // Close the polygon
          const completedShape = [...draftPoints];
          setFinalShapes((prev) => [...prev, completedShape]);
          if (onPolygonComplete) {
            onPolygonComplete(completedShape);
          }
          setDraftPoints([]);
          return;
        }
      }

      // Add point to draft
      setDraftPoints((prev) => [...prev, snappedPoint]);
    },
    [draftPoints, drawingLocked, isPanning, onPolygonComplete, toWorldCoords]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (
        panPointerIdRef.current !== null &&
        panStartClientRef.current &&
        panStartViewBoxRef.current &&
        panScaleRef.current
      ) {
        const start = panStartClientRef.current;
        const vb0 = panStartViewBoxRef.current;
        const scaleFactors = panScaleRef.current;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        setViewBox({
          x: vb0.x - dx * scaleFactors.x,
          y: vb0.y - dy * scaleFactors.y,
          w: viewBox.w,
          h: viewBox.h,
        });
      }
    },
    [viewBox.h, viewBox.w]
  );

  const startPan = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Only pan on right-click or middle-click
      if (event.button !== 2 && event.button !== 1) return;

      event.preventDefault();
      const svg = svgRef.current;
      if (!svg) return;

      panPointerIdRef.current = event.pointerId;
      svg.setPointerCapture?.(event.pointerId);

      panStartClientRef.current = { x: event.clientX, y: event.clientY };
      panStartViewBoxRef.current = { x: viewBox.x, y: viewBox.y };
      const rect = svg.getBoundingClientRect();
      panScaleRef.current = {
        x: viewBox.w / rect.width,
        y: viewBox.h / rect.height,
      };
      setIsPanning(true);
    },
    [viewBox.x, viewBox.y, viewBox.w, viewBox.h]
  );

  const handlePointerUp = useCallback(() => {
    const svg = svgRef.current;

    if (panPointerIdRef.current !== null) {
      if (svg && svg.hasPointerCapture?.(panPointerIdRef.current)) {
        svg.releasePointerCapture(panPointerIdRef.current);
      }
      panPointerIdRef.current = null;
      panStartClientRef.current = null;
      panStartViewBoxRef.current = null;
      panScaleRef.current = null;
      setIsPanning(false);
    }
  }, []);

  const handleWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    setScale((prev) => Math.min(5, Math.max(0.2, prev * factor)));
  }, []);

  // Generate grid lines
  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const minX = Math.floor(viewBox.x / GRID_SIZE) * GRID_SIZE;
    const maxX = Math.ceil((viewBox.x + viewBox.w) / GRID_SIZE) * GRID_SIZE;
    const minY = Math.floor(viewBox.y / GRID_SIZE) * GRID_SIZE;
    const maxY = Math.ceil((viewBox.y + viewBox.h) / GRID_SIZE) * GRID_SIZE;

    // Vertical lines
    for (let x = minX; x <= maxX; x += GRID_SIZE) {
      lines.push({ x1: x, y1: viewBox.y, x2: x, y2: viewBox.y + viewBox.h });
    }

    // Horizontal lines
    for (let y = minY; y <= maxY; y += GRID_SIZE) {
      lines.push({ x1: viewBox.x, y1: y, x2: viewBox.x + viewBox.w, y2: y });
    }

    return lines;
  }, [viewBox]);

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      style={{
        border: "1px solid #ddd",
        background: "#fafafa",
        display: "block",
        cursor: isPanning ? "grabbing" : drawingLocked ? "not-allowed" : "crosshair",
      }}
      onPointerDown={(e) => {
        if (e.button === 0) {
          handleCanvasClick(e);
        } else {
          startPan(e);
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Grid layer */}
      <g pointerEvents="none">
        {gridLines.map((line, i) => (
          <line
            key={i}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="#ddd"
            strokeWidth={1}
          />
        ))}
      </g>

      <g transform={transformGroup}>
        {/* Final shapes layer */}
        {finalShapes.map((shape, shapeIdx) => (
          <polygon
            key={`shape-${shapeIdx}`}
            points={shape.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
            fill="rgba(80,160,255,0.2)"
            stroke="#5af"
            strokeWidth={4}
            pointerEvents="none"
          />
        ))}

        {/* Draft layer */}
        {draftPoints.length === 1 && (
          <circle
            cx={draftPoints[0].xMm}
            cy={draftPoints[0].yMm}
            r={6}
            fill="#2463ff"
            pointerEvents="none"
          />
        )}

        {draftPoints.length === 2 && (
          <>
            <polyline
              points={draftPoints.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
              fill="none"
              stroke="#2463ff"
              strokeWidth={3}
              strokeDasharray="8,4"
              pointerEvents="none"
            />
            {draftPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.xMm}
                cy={p.yMm}
                r={6}
                fill="#2463ff"
                pointerEvents="none"
              />
            ))}
          </>
        )}

        {draftPoints.length >= 3 && (
          <>
            <polygon
              points={draftPoints.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
              fill="rgba(36,99,255,0.15)"
              stroke="#2463ff"
              strokeWidth={3}
              strokeDasharray="8,4"
              pointerEvents="none"
            />
            {draftPoints.map((p, i) => (
              <circle
                key={i}
                cx={p.xMm}
                cy={p.yMm}
                r={6}
                fill="#2463ff"
                stroke="#fff"
                strokeWidth={2}
                pointerEvents="none"
              />
            ))}
            {/* Show close indicator on first point */}
            <circle
              cx={draftPoints[0].xMm}
              cy={draftPoints[0].yMm}
              r={CLOSE_RADIUS}
              fill="none"
              stroke="#2463ff"
              strokeWidth={1}
              strokeDasharray="4,4"
              opacity={0.5}
              pointerEvents="none"
            />
          </>
        )}
      </g>

      {/* Controls */}
      <g
        pointerEvents="auto"
        transform={`translate(${viewBox.x + viewBox.w / 2} ${viewBox.y + viewBox.h - 16})`}
      >
        <g transform={`translate(-${(controls.length * 110 + (controls.length - 1) * 8) / 2} 0)`}>
          {controls.map((control, idx) => {
            const x = idx * (110 + 8);
            return (
              <g
                key={control.key}
                transform={`translate(${x} 0)`}
                style={{ cursor: "pointer" }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
                onPointerUp={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  control.onClick();
                }}
              >
                <rect width={110} height={32} rx={6} fill="#fff" stroke="#ccc" />
                <text
                  x={55}
                  y={20}
                  fontSize={14}
                  fill="#333"
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {control.label}
                </text>
              </g>
            );
          })}
        </g>
      </g>

      {/* Instructions */}
      <text
        x={viewBox.x + 20}
        y={viewBox.y + 30}
        fill="#555"
        fontSize={16}
        pointerEvents="none"
      >
        왼쪽 클릭: 점 추가 | 첫 점 근처 클릭: 도형 완성 | 오른쪽 클릭: 이동
      </text>

      {draftPoints.length > 0 && (
        <text
          x={viewBox.x + 20}
          y={viewBox.y + 55}
          fill="#2463ff"
          fontSize={14}
          pointerEvents="none"
        >
          점 개수: {draftPoints.length}
        </text>
      )}

      {drawingLocked && (
        <text
          x={viewBox.x + 20}
          y={viewBox.y + 80}
          fill="#c00"
          fontSize={14}
          pointerEvents="none"
        >
          도형이 완성되었습니다. 새로 그리려면 지우기를 눌러주세요.
        </text>
      )}
    </svg>
  );
}
