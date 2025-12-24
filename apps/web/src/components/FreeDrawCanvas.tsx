import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { Point } from "@deck/core";

const VIEWBOX = { width: 2000, height: 1200 };
const GRID_SIZE = 100; // 100mm grid
const CLOSE_RADIUS = 50; // 50mm close threshold (increased from 20mm)
const VERTEX_RADIUS = 8; // Vertex handle size

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function FreeDrawCanvas({
  initialPoints = [],
  onPolygonComplete,
  onPolygonChange,
}: {
  initialPoints?: Point[];
  onPolygonComplete?: (points: Point[]) => void;
  onPolygonChange?: (points: Point[]) => void;
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

  // Drawing state: points being drawn or edited
  const [points, setPoints] = useState<Point[]>(initialPoints);
  const [isClosed, setIsClosed] = useState(initialPoints.length >= 3);

  // Editing state
  const [dragVertexIndex, setDragVertexIndex] = useState<number | null>(null);
  const [hoverVertexIndex, setHoverVertexIndex] = useState<number | null>(null);
  const [isHoveringStartPoint, setIsHoveringStartPoint] = useState(false);

  // Sync with external initialPoints changes
  useEffect(() => {
    if (initialPoints.length > 0 && points.length === 0) {
      setPoints(initialPoints);
      setIsClosed(initialPoints.length >= 3);
    }
  }, [initialPoints, points.length]);

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

  const handleClear = useCallback(() => {
    setPoints([]);
    setIsClosed(false);
    setDragVertexIndex(null);
    setHoverVertexIndex(null);
    setIsHoveringStartPoint(false);
    if (onPolygonChange) {
      onPolygonChange([]);
    }
  }, [onPolygonChange]);

  const handleDeleteVertex = useCallback(
    (index: number) => {
      if (points.length <= 3) {
        // Can't delete if we'd have less than 3 points
        handleClear();
        return;
      }
      const newPoints = points.filter((_, i) => i !== index);
      setPoints(newPoints);
      if (onPolygonChange) {
        onPolygonChange(newPoints);
      }
    },
    [points, handleClear, onPolygonChange]
  );

  const controls = useMemo(() => {
    const baseControls = [
      { key: "rotate", label: "회전", onClick: () => setRotation((prev) => (prev + 15) % 360) },
      { key: "center", label: "중앙 맞추기", onClick: centerView },
      { key: "zoom-out", label: "축소", onClick: () => setScale((prev) => Math.max(0.2, prev * 0.9)) },
      { key: "zoom-in", label: "확대", onClick: () => setScale((prev) => Math.min(5, prev * 1.1)) },
      { key: "clear", label: "지우기", onClick: handleClear },
    ];

    if (isClosed) {
      baseControls.push({
        key: "reopen",
        label: "다시 그리기",
        onClick: () => {
          setIsClosed(false);
        },
      });
    }

    return baseControls;
  }, [centerView, handleClear, isClosed]);

  const handleCanvasClick = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (isClosed) return; // No adding points when closed
      if (isPanning) return;
      if (panPointerIdRef.current !== null) return;
      if (dragVertexIndex !== null) return;

      const world = toWorldCoords(event.clientX, event.clientY);
      if (!world) return;

      // Snap to grid
      let snappedX = snapToGrid(world.x, GRID_SIZE);
      let snappedY = snapToGrid(world.y, GRID_SIZE);

      // Orthogonal mode (Shift key)
      if (event.shiftKey && points.length > 0) {
        const lastPoint = points[points.length - 1];
        const dx = Math.abs(snappedX - lastPoint.xMm);
        const dy = Math.abs(snappedY - lastPoint.yMm);
        if (dx > dy) {
          snappedY = lastPoint.yMm; // Lock horizontal
        } else {
          snappedX = lastPoint.xMm; // Lock vertical
        }
      }

      const snappedPoint: Point = {
        xMm: snappedX,
        yMm: snappedY,
      };

      // Check if we're closing the polygon (near first point)
      if (points.length >= 3) {
        const first = points[0];
        const dx = snappedPoint.xMm - first.xMm;
        const dy = snappedPoint.yMm - first.yMm;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= CLOSE_RADIUS) {
          // Close the polygon
          setIsClosed(true);
          if (onPolygonComplete) {
            onPolygonComplete(points);
          }
          return;
        }
      }

      // Add point
      const newPoints = [...points, snappedPoint];
      setPoints(newPoints);
      if (onPolygonChange) {
        onPolygonChange(newPoints);
      }
    },
    [points, isClosed, isPanning, dragVertexIndex, onPolygonComplete, onPolygonChange, toWorldCoords]
  );

  const handleVertexPointerDown = useCallback(
    (index: number, event: ReactPointerEvent<SVGCircleElement>) => {
      event.stopPropagation();

      // Check for close action on first vertex when drawing
      if (!isClosed && index === 0 && points.length >= 3) {
        setIsClosed(true);
        if (onPolygonComplete) {
          onPolygonComplete(points);
        }
        return;
      }

      // Start dragging vertex
      if (isClosed || points.length >= 3) {
        event.preventDefault();
        setDragVertexIndex(index);
        svgRef.current?.setPointerCapture?.(event.pointerId);
      }
    },
    [isClosed, points, onPolygonComplete]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Handle panning
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
        return;
      }

      // Handle vertex dragging
      if (dragVertexIndex !== null) {
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;

        let snappedX = snapToGrid(world.x, GRID_SIZE);
        let snappedY = snapToGrid(world.y, GRID_SIZE);

        // Orthogonal mode (Shift key)
        if (event.shiftKey && points.length > 1) {
          const prevIndex = dragVertexIndex === 0 ? points.length - 1 : dragVertexIndex - 1;
          const prevPoint = points[prevIndex];
          const dx = Math.abs(snappedX - prevPoint.xMm);
          const dy = Math.abs(snappedY - prevPoint.yMm);
          if (dx > dy) {
            snappedY = prevPoint.yMm;
          } else {
            snappedX = prevPoint.xMm;
          }
        }

        const newPoints = points.map((p, i) =>
          i === dragVertexIndex ? { xMm: snappedX, yMm: snappedY } : p
        );
        setPoints(newPoints);
        if (onPolygonChange) {
          onPolygonChange(newPoints);
        }
        return;
      }

      // Check if hovering near start point (for closing indicator)
      if (!isClosed && points.length >= 3) {
        const world = toWorldCoords(event.clientX, event.clientY);
        if (world) {
          const snappedX = snapToGrid(world.x, GRID_SIZE);
          const snappedY = snapToGrid(world.y, GRID_SIZE);
          const first = points[0];
          const dx = snappedX - first.xMm;
          const dy = snappedY - first.yMm;
          const dist = Math.sqrt(dx * dx + dy * dy);
          setIsHoveringStartPoint(dist <= CLOSE_RADIUS);
        }
      } else {
        setIsHoveringStartPoint(false);
      }
    },
    [viewBox.h, viewBox.w, dragVertexIndex, points, isClosed, toWorldCoords, onPolygonChange]
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

    if (dragVertexIndex !== null) {
      setDragVertexIndex(null);
    }
  }, [dragVertexIndex]);

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

  const getCursor = useCallback(() => {
    if (isPanning) return "grabbing";
    if (dragVertexIndex !== null) return "grabbing";
    if (isClosed) return "default";
    if (isHoveringStartPoint) return "pointer";
    return "crosshair";
  }, [isPanning, dragVertexIndex, isClosed, isHoveringStartPoint]);

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
        cursor: getCursor(),
      }}
      onPointerDown={(e) => {
        if (e.button === 0 && dragVertexIndex === null) {
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
        {/* Polygon or polyline */}
        {points.length >= 2 && (
          <>
            {isClosed ? (
              <polygon
                points={points.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
                fill="rgba(80,160,255,0.12)"
                stroke="#5af"
                strokeWidth={4}
                strokeLinejoin="miter"
                strokeLinecap="square"
                pointerEvents="none"
              />
            ) : (
              <polyline
                points={points.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
                fill="none"
                stroke="#2463ff"
                strokeWidth={3}
                strokeDasharray="8,4"
                pointerEvents="none"
              />
            )}
          </>
        )}

        {/* Single point */}
        {points.length === 1 && (
          <circle
            cx={points[0].xMm}
            cy={points[0].yMm}
            r={6}
            fill="#2463ff"
            pointerEvents="none"
          />
        )}

        {/* Vertex handles */}
        {points.map((p, i) => {
          const isFirst = i === 0;
          const isHovered = hoverVertexIndex === i;
          const showCloseIndicator = !isClosed && isFirst && points.length >= 3;

          return (
            <g key={i}>
              {/* Close indicator circle on first vertex */}
              {showCloseIndicator && (
                <circle
                  cx={p.xMm}
                  cy={p.yMm}
                  r={CLOSE_RADIUS}
                  fill="none"
                  stroke="#2463ff"
                  strokeWidth={1}
                  strokeDasharray="4,4"
                  opacity={0.5}
                  pointerEvents="none"
                />
              )}

              {/* Vertex handle */}
              <circle
                cx={p.xMm}
                cy={p.yMm}
                r={VERTEX_RADIUS}
                fill={isHovered ? "#2463ff" : "#fff"}
                stroke="#2463ff"
                strokeWidth={2}
                style={{ cursor: isClosed || points.length >= 3 ? "pointer" : "default" }}
                onPointerEnter={() => setHoverVertexIndex(i)}
                onPointerLeave={() => setHoverVertexIndex(null)}
                onPointerDown={(e) => handleVertexPointerDown(i, e)}
                onContextMenu={(e) => {
                  if (isClosed) {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDeleteVertex(i);
                  }
                }}
              />
            </g>
          );
        })}
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
        {isClosed
          ? "완성됨 | 꼭지점 드래그: 이동 | 우클릭: 삭제 | 오른쪽/중간 버튼: 캔버스 이동"
          : points.length >= 3
            ? "클릭: 점 추가 | 첫 점 클릭/근처 클릭: 완성 | Shift: 직교 모드"
            : "클릭: 점 추가 | Shift: 직교 모드 | 오른쪽/중간 버튼: 캔버스 이동"}
      </text>

      {points.length > 0 && (
        <text
          x={viewBox.x + 20}
          y={viewBox.y + 55}
          fill="#2463ff"
          fontSize={14}
          pointerEvents="none"
        >
          점 개수: {points.length}
        </text>
      )}
    </svg>
  );
}
