import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useCanvasViewport } from "../hooks/useCanvasViewport";
import {
  CanvasControlsCenter,
  CanvasControlsTopLeft,
  CanvasControlsBottomLeft,
  CanvasControlsBottomRight,
} from "./CanvasControls";
import type { ViewMode } from "./DeckCanvas";
import type { Point } from "@deck/core";
import { polygonAreaAbs } from "@deck/core";

const VIEWBOX = { width: 2000, height: 1200 };
const GRID_SIZE = 10; // 10mm grid
const CLOSE_RADIUS = 50; // 50mm close threshold (increased from 20mm)
const VERTEX_RADIUS = 8; // Vertex handle size
const ORTHO_SNAP_ANGLE = 1; // degrees - auto-snap to horizontal/vertical within ±1°

// 폴리곤 스타일 상수
const POLYGON_STYLE = {
  stroke: "#000",
  strokeWidth: { normal: 2, hover: 4 },
  fill: "rgba(80,160,255,0.12)",
} as const;

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

// Auto-snap to orthogonal (horizontal/vertical) if within threshold angle
// Uses smooth interpolation to avoid abrupt snapping
function applyOrthoSnap(
  x: number,
  y: number,
  referencePoint: Point,
  angleDegrees: number,
): { x: number; y: number } {
  const dx = x - referencePoint.xMm;
  const dy = y - referencePoint.yMm;

  // Calculate angle from reference point
  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;

  // Normalize angle to -180 to 180
  const normalizedAngle = ((angleDeg + 180) % 360) - 180;

  // Helper to calculate smooth interpolation factor (0 = no snap, 1 = full snap)
  const getSnapStrength = (deviation: number): number => {
    if (deviation >= angleDegrees) return 0;
    // Smooth cubic ease-in interpolation
    const t = 1 - deviation / angleDegrees;
    return t * t * t;
  };

  // Check if close to horizontal (0° or ±180°)
  const horizontalDeviation = Math.min(
    Math.abs(normalizedAngle),
    Math.abs(Math.abs(normalizedAngle) - 180),
  );
  if (horizontalDeviation <= angleDegrees) {
    const snapStrength = getSnapStrength(horizontalDeviation);
    return { x, y: y * (1 - snapStrength) + referencePoint.yMm * snapStrength };
  }

  // Check if close to vertical (90° or -90°)
  const verticalDeviation = Math.min(
    Math.abs(normalizedAngle - 90),
    Math.abs(normalizedAngle + 90),
  );
  if (verticalDeviation <= angleDegrees) {
    const snapStrength = getSnapStrength(verticalDeviation);
    return { x: x * (1 - snapStrength) + referencePoint.xMm * snapStrength, y };
  }

  return { x, y }; // No snap
}

// Calculate angle between three points (in degrees)
function calculateAngle(p1: Point, vertex: Point, p2: Point): number {
  const v1x = p1.xMm - vertex.xMm;
  const v1y = p1.yMm - vertex.yMm;
  const v2x = p2.xMm - vertex.xMm;
  const v2y = p2.yMm - vertex.yMm;

  const dot = v1x * v2x + v1y * v2y;
  const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
  const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = dot / (mag1 * mag2);
  const angleRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  return (angleRad * 180) / Math.PI;
}

export function FreeDrawCanvas({
  initialPoints = [],
  onPolygonComplete,
  onPolygonChange,
  viewMode = "deck",
  onToggleViewMode,
}: {
  initialPoints?: Point[];
  onPolygonComplete?: (points: Point[]) => void;
  onPolygonChange?: (points: Point[]) => void;
  viewMode?: ViewMode;
  onToggleViewMode?: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const {
    viewBox,
    setScale,
    setRotation,
    isPanning,
    transformGroup,
    toWorldCoords,
    centerView: baseCenterView,
    startPan,
    onPanMove,
    onPanEnd,
    handleWheel,
  } = useCanvasViewport(svgRef, {
    initialViewBox: { x: 0, y: 0, w: VIEWBOX.width, h: VIEWBOX.height },
  });

  const initialIsClosed = initialPoints.length >= 3;

  // Drawing state: points being drawn or edited
  const [points, setPoints] = useState<Point[]>(() => initialPoints);
  const [isClosed, setIsClosed] = useState<boolean>(() => initialIsClosed);

  // History for undo/redo (최소 구현)
  const [history, setHistory] = useState<{ points: Point[]; isClosed: boolean }[]>(() => [
    { points: initialPoints, isClosed: initialIsClosed },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Editing state
  const [dragVertexIndex, setDragVertexIndex] = useState<number | null>(null);
  const [hoverVertexIndex, setHoverVertexIndex] = useState<number | null>(null);
  const [isHoveringStartPoint, setIsHoveringStartPoint] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [activeTool, setActiveTool] = useState<"add" | "delete" | null>(null);
  const [isPolygonHovered, setIsPolygonHovered] = useState(false);

  // Guide lines state
  const [guideLines, setGuideLines] = useState<
    Array<{ x1: number; y1: number; x2: number; y2: number }>
  >([]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    const prevState = history[historyIndex - 1];
    setPoints(prevState.points);
    setIsClosed(prevState.isClosed);
    setHistoryIndex((prev) => prev - 1);
    if (onPolygonChange) onPolygonChange(prevState.points);
  }, [canUndo, history, historyIndex, onPolygonChange]);

  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    const nextState = history[historyIndex + 1];
    setPoints(nextState.points);
    setIsClosed(nextState.isClosed);
    setHistoryIndex((prev) => prev + 1);
    if (onPolygonChange) onPolygonChange(nextState.points);
  }, [canRedo, history, historyIndex, onPolygonChange]);

  const pushHistory = useCallback(
    (nextPoints: Point[], nextIsClosed: boolean) => {
      setHistory((prev) => {
        const base = prev.slice(0, historyIndex + 1);
        base.push({ points: nextPoints, isClosed: nextIsClosed });
        return base.slice(-50);
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 49));
    },
    [historyIndex],
  );

  const centerView = useCallback(() => {
    baseCenterView({ x: 0, y: 0, w: VIEWBOX.width, h: VIEWBOX.height });
  }, [baseCenterView]);

  // Keyboard shortcuts: ESC to exit edit mode, Ctrl+Z/Ctrl+Shift+Z for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ESC to exit edit mode
      if (event.key === "Escape") {
        if (activeTool !== null) {
          setActiveTool(null);
          return;
        }
      }

      // Ctrl+Z for undo, Ctrl+Shift+Z for redo
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTool, handleUndo, handleRedo]);

  const handleClear = useCallback(() => {
    setPoints([]);
    setIsClosed(false);
    setDragVertexIndex(null);
    setHoverVertexIndex(null);
    setIsHoveringStartPoint(false);
    if (onPolygonChange) {
      onPolygonChange([]);
    }
    pushHistory([], false);
  }, [onPolygonChange, pushHistory]);

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
      pushHistory(newPoints, isClosed);
    },
    [points, handleClear, onPolygonChange, pushHistory, isClosed],
  );

  // 하단 중앙 컨트롤 (프리셋과 동일)
  const centerControls = useMemo(
    () => [
      { key: "rotate", label: "회전", onClick: () => setRotation((prev) => (prev + 90) % 360) },
      { key: "center", label: "중앙 맞추기", onClick: centerView },
      {
        key: "zoom-out",
        label: "축소",
        onClick: () => setScale((prev) => Math.max(0.2, prev * 0.9)),
      },
      { key: "zoom-in", label: "확대", onClick: () => setScale((prev) => Math.min(5, prev * 1.1)) },
    ],
    [centerView, setRotation, setScale],
  );

  // 좌측 상단 컨트롤 (편집 도구)
  const topLeftControls = useMemo(() => {
    const controls = [
      {
        key: "add",
        label: "추가",
        onClick: () => setActiveTool((prev) => (prev === "add" ? null : "add")),
        active: activeTool === "add",
        activeColor: "#2463ff",
        activeBg: "#e6f0ff",
      },
      {
        key: "delete",
        label: "삭제",
        onClick: () => setActiveTool((prev) => (prev === "delete" ? null : "delete")),
        active: activeTool === "delete",
        activeColor: "#c52222",
        activeBg: "#ffe6e6",
      },
      {
        key: "clear",
        label: "지우기",
        onClick: handleClear,
      },
    ];

    if (isClosed) {
      controls.push({
        key: "reopen",
        label: "다시 그리기",
        onClick: () => setIsClosed(false),
      });
    }

    return controls;
  }, [activeTool, handleClear, isClosed]);

  // 좌측 하단 컨트롤 (실행취소/다시실행)
  const bottomLeftControls = useMemo(
    () => [
      { key: "undo", label: "실행취소", onClick: handleUndo, disabled: !canUndo },
      { key: "redo", label: "다시실행", onClick: handleRedo, disabled: !canRedo },
    ],
    [handleUndo, handleRedo, canUndo, canRedo],
  );

  // 우측 하단 컨트롤 (뷰 모드 토글)
  const bottomRightControls = useMemo(
    () => [
      {
        key: "view-mode",
        label:
          viewMode === "deck"
            ? "하부 구조로 전환"
            : viewMode === "substructure"
              ? "재단 계획으로 전환"
              : "데크 보기로 전환",
        onClick: () => onToggleViewMode?.(),
        disabled: !onToggleViewMode,
      },
    ],
    [viewMode, onToggleViewMode],
  );

  // 면적 계산 (닫힌 폴리곤일 때만)
  const areaM2 = useMemo(() => {
    if (!isClosed || points.length < 3) return 0;
    const areaMm2 = polygonAreaAbs(points);
    return areaMm2 / 1_000_000; // mm² → m²
  }, [isClosed, points]);

  const handleCanvasClick = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (isClosed) return; // No adding points when closed
      if (isPanning) return;
      if (dragVertexIndex !== null) return;

      const world = toWorldCoords(event.clientX, event.clientY);
      if (!world) return;

      // Snap to grid
      let snappedX = snapToGrid(world.x, GRID_SIZE);
      let snappedY = snapToGrid(world.y, GRID_SIZE);

      // Auto-snap to orthogonal or manual Shift mode
      if (points.length > 0) {
        const lastPoint = points[points.length - 1];

        if (event.shiftKey) {
          // Manual orthogonal mode (Shift key) - stronger snap
          const dx = Math.abs(snappedX - lastPoint.xMm);
          const dy = Math.abs(snappedY - lastPoint.yMm);
          if (dx > dy) {
            snappedY = lastPoint.yMm; // Lock horizontal
          } else {
            snappedX = lastPoint.xMm; // Lock vertical
          }
        } else {
          // Auto-snap to orthogonal if within angle threshold
          const orthoSnapped = applyOrthoSnap(snappedX, snappedY, lastPoint, ORTHO_SNAP_ANGLE);
          snappedX = orthoSnapped.x;
          snappedY = orthoSnapped.y;
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
      pushHistory(newPoints, false);
    },
    [
      points,
      isClosed,
      isPanning,
      dragVertexIndex,
      onPolygonComplete,
      onPolygonChange,
      pushHistory,
      toWorldCoords,
    ],
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
    [isClosed, points, onPolygonComplete],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Handle panning
      onPanMove(event);
      if (isPanning) return;

      // Update cursor position for preview line
      const world = toWorldCoords(event.clientX, event.clientY);
      if (world && !isClosed && points.length > 0 && dragVertexIndex === null) {
        let snappedX = snapToGrid(world.x, GRID_SIZE);
        let snappedY = snapToGrid(world.y, GRID_SIZE);
        let isSnappedToStart = false;

        // Check if close to first point for closing the polygon
        if (points.length >= 3) {
          const firstPoint = points[0];
          const distToFirst = Math.sqrt(
            Math.pow(snappedX - firstPoint.xMm, 2) + Math.pow(snappedY - firstPoint.yMm, 2),
          );

          // Snap to first point if within CLOSE_RADIUS
          if (distToFirst <= CLOSE_RADIUS) {
            snappedX = firstPoint.xMm;
            snappedY = firstPoint.yMm;
            isSnappedToStart = true;
            setIsHoveringStartPoint(true);
          } else {
            setIsHoveringStartPoint(false);
          }
        }

        // Auto-snap cursor position to orthogonal (only if not snapped to first point)
        if (!isSnappedToStart) {
          const lastPoint = points[points.length - 1];

          if (event.shiftKey) {
            // Manual orthogonal mode (Shift key) - stronger snap
            const dx = Math.abs(snappedX - lastPoint.xMm);
            const dy = Math.abs(snappedY - lastPoint.yMm);
            if (dx > dy) {
              snappedY = lastPoint.yMm; // Lock horizontal
            } else {
              snappedX = lastPoint.xMm; // Lock vertical
            }
          } else {
            // Auto-snap to orthogonal if within angle threshold
            const orthoSnapped = applyOrthoSnap(snappedX, snappedY, lastPoint, ORTHO_SNAP_ANGLE);
            snappedX = orthoSnapped.x;
            snappedY = orthoSnapped.y;
          }
        }

        setCursorPosition({ x: snappedX, y: snappedY });

        // Calculate guide lines when snapped to horizontal or vertical
        const newGuideLines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

        // Only show guide lines if not snapped to start point
        if (!isSnappedToStart) {
          const lastPoint = points[points.length - 1];

          // If snapped horizontally, draw vertical guide from other points
          if (snappedY === lastPoint.yMm && points.length >= 2) {
            for (let i = 0; i < points.length - 1; i++) {
              const p = points[i];
              // Draw vertical guide line from this point
              newGuideLines.push({
                x1: p.xMm,
                y1: p.yMm,
                x2: p.xMm,
                y2: snappedY,
              });
            }
          }

          // If snapped vertically, draw horizontal guide from other points
          if (snappedX === lastPoint.xMm && points.length >= 2) {
            for (let i = 0; i < points.length - 1; i++) {
              const p = points[i];
              // Draw horizontal guide line from this point
              newGuideLines.push({
                x1: p.xMm,
                y1: p.yMm,
                x2: snappedX,
                y2: p.yMm,
              });
            }
          }
        }

        setGuideLines(newGuideLines);
      } else {
        setCursorPosition(null);
        setGuideLines([]);
      }

      // Handle vertex dragging
      if (dragVertexIndex !== null) {
        if (!world) return;

        let snappedX = snapToGrid(world.x, GRID_SIZE);
        let snappedY = snapToGrid(world.y, GRID_SIZE);

        // Auto-snap or manual Shift mode
        if (points.length > 1) {
          const prevIndex = dragVertexIndex === 0 ? points.length - 1 : dragVertexIndex - 1;
          const prevPoint = points[prevIndex];

          if (event.shiftKey) {
            // Manual orthogonal mode (Shift key)
            const dx = Math.abs(snappedX - prevPoint.xMm);
            const dy = Math.abs(snappedY - prevPoint.yMm);
            if (dx > dy) {
              snappedY = prevPoint.yMm;
            } else {
              snappedX = prevPoint.xMm;
            }
          } else {
            // Auto-snap to orthogonal if within angle threshold
            const orthoSnapped = applyOrthoSnap(snappedX, snappedY, prevPoint, ORTHO_SNAP_ANGLE);
            snappedX = orthoSnapped.x;
            snappedY = orthoSnapped.y;
          }
        }

        const newPoints = points.map((p, i) =>
          i === dragVertexIndex ? { xMm: snappedX, yMm: snappedY } : p,
        );
        setPoints(newPoints);
        if (onPolygonChange) {
          onPolygonChange(newPoints);
        }
        return;
      }

      // Check if hovering near start point (for closing indicator)
      if (!isClosed && points.length >= 3) {
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
    [isPanning, toWorldCoords, isClosed, points, dragVertexIndex, onPanMove, onPolygonChange],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      onPanEnd(event);

      if (dragVertexIndex !== null) {
        setDragVertexIndex(null);
      }
    },
    [dragVertexIndex, onPanEnd],
  );

  const getCursor = useCallback(() => {
    if (isPanning) return "grabbing";
    if (dragVertexIndex !== null) return "grabbing";
    if (isClosed) return "default";
    if (isHoveringStartPoint) return "pointer";
    return "crosshair";
  }, [isPanning, dragVertexIndex, isClosed, isHoveringStartPoint]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
        <g transform={transformGroup}>
          {/* Polygon or polyline */}
          {points.length >= 2 && (
            <>
              {isClosed ? (
                <polygon
                  points={points.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
                  fill={POLYGON_STYLE.fill}
                  stroke={POLYGON_STYLE.stroke}
                  strokeWidth={
                    isPolygonHovered
                      ? POLYGON_STYLE.strokeWidth.hover
                      : POLYGON_STYLE.strokeWidth.normal
                  }
                  strokeLinejoin="miter"
                  strokeLinecap="square"
                  pointerEvents="all"
                  onPointerEnter={() => setIsPolygonHovered(true)}
                  onPointerLeave={() => setIsPolygonHovered(false)}
                />
              ) : (
                <polyline
                  points={points.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
                  fill="none"
                  stroke={POLYGON_STYLE.stroke}
                  strokeWidth={
                    isPolygonHovered
                      ? POLYGON_STYLE.strokeWidth.hover
                      : POLYGON_STYLE.strokeWidth.normal
                  }
                  strokeDasharray="8,4"
                  pointerEvents="all"
                  onPointerEnter={() => setIsPolygonHovered(true)}
                  onPointerLeave={() => setIsPolygonHovered(false)}
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

          {/* Guide lines */}
          {guideLines.map((line, idx) => (
            <line
              key={`guide-${idx}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#00cc88"
              strokeWidth={1}
              strokeDasharray="6,3"
              opacity={0.5}
              pointerEvents="none"
            />
          ))}

          {/* Preview line from last point to cursor */}
          {!isClosed &&
            points.length > 0 &&
            cursorPosition &&
            (() => {
              const lastPoint = points[points.length - 1];
              const dx = cursorPosition.x - lastPoint.xMm;
              const dy = cursorPosition.y - lastPoint.yMm;
              const distance = Math.sqrt(dx * dx + dy * dy);
              const midX = (lastPoint.xMm + cursorPosition.x) / 2;
              const midY = (lastPoint.yMm + cursorPosition.y) / 2;

              // Calculate angle if we have a previous point
              let angle: number | null = null;
              if (points.length >= 2) {
                const prevPoint = points[points.length - 2];
                angle = calculateAngle(prevPoint, lastPoint, {
                  xMm: cursorPosition.x,
                  yMm: cursorPosition.y,
                });
              }

              return (
                <>
                  <line
                    x1={lastPoint.xMm}
                    y1={lastPoint.yMm}
                    x2={cursorPosition.x}
                    y2={cursorPosition.y}
                    stroke="#2463ff"
                    strokeWidth={2}
                    strokeDasharray="4,4"
                    opacity={0.6}
                    pointerEvents="none"
                  />
                  {distance > 0 && (
                    <text
                      x={midX}
                      y={midY - 10}
                      fontSize={16}
                      fill="#2463ff"
                      fontWeight="bold"
                      textAnchor="middle"
                      pointerEvents="none"
                      stroke="#ffffff"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {Math.round(distance).toLocaleString()}mm
                    </text>
                  )}
                  {/* Angle indicator at last vertex */}
                  {angle !== null &&
                    (() => {
                      const radius = 40;
                      const prevPoint = points[points.length - 2];
                      const angle1 = Math.atan2(
                        prevPoint.yMm - lastPoint.yMm,
                        prevPoint.xMm - lastPoint.xMm,
                      );
                      const angle2 = Math.atan2(
                        cursorPosition.y - lastPoint.yMm,
                        cursorPosition.x - lastPoint.xMm,
                      );

                      const startX = lastPoint.xMm + radius * Math.cos(angle1);
                      const startY = lastPoint.yMm + radius * Math.sin(angle1);
                      const endX = lastPoint.xMm + radius * Math.cos(angle2);
                      const endY = lastPoint.yMm + radius * Math.sin(angle2);

                      const largeArc = angle > 180 ? 1 : 0;

                      // Calculate bisector angle for text position (inside the angle)
                      const bisectorAngle = (angle1 + angle2) / 2;
                      const textRadius = 30;
                      const textX = lastPoint.xMm + textRadius * Math.cos(bisectorAngle);
                      const textY = lastPoint.yMm + textRadius * Math.sin(bisectorAngle);

                      return (
                        <>
                          {/* Angle arc background */}
                          <path
                            d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`}
                            fill="none"
                            stroke="#88ee88"
                            strokeWidth={2}
                            opacity={0.6}
                            pointerEvents="none"
                          />
                          {/* Angle text */}
                          <text
                            x={textX}
                            y={textY}
                            fontSize={16}
                            fill="#00aa44"
                            fontWeight="bold"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            pointerEvents="none"
                            stroke="#ffffff"
                            strokeWidth={3}
                            paintOrder="stroke"
                          >
                            {Math.round(angle)}°
                          </text>
                        </>
                      );
                    })()}
                </>
              );
            })()}

          {/* Vertex handles */}
          {points.map((p, i) => {
            const isFirst = i === 0;
            const isHovered = hoverVertexIndex === i;
            const showCloseIndicator = !isClosed && isFirst && points.length >= 3;
            const label = String.fromCharCode(65 + (i % 26)); // A, B, C, ...

            // Calculate label position (opposite diagonal direction from edges)
            let labelOffset = { x: 0, y: -20 }; // default: above
            if (points.length > 1) {
              const prevIdx = (i - 1 + points.length) % points.length;
              const nextIdx = (i + 1) % points.length;
              const prevPoint = points[prevIdx];
              const nextPoint = points[nextIdx];

              // Calculate vectors from current point to neighbors
              const toPrev = { x: prevPoint.xMm - p.xMm, y: prevPoint.yMm - p.yMm };
              const toNext = { x: nextPoint.xMm - p.xMm, y: nextPoint.yMm - p.yMm };

              // Calculate average direction of edges
              const avgDir = { x: toPrev.x + toNext.x, y: toPrev.y + toNext.y };
              const len = Math.sqrt(avgDir.x * avgDir.x + avgDir.y * avgDir.y);

              // Position label in opposite direction (away from polygon interior)
              const labelDistance = 20;
              if (len > 0) {
                labelOffset = {
                  x: -(avgDir.x / len) * labelDistance,
                  y: -(avgDir.y / len) * labelDistance,
                };
              }
            }

            // Calculate angle at this vertex when dragging
            let vertexAngle: number | null = null;
            if (dragVertexIndex !== null && points.length >= 3) {
              // Show angle for all vertices when any vertex is being dragged
              const prevIdx = (i - 1 + points.length) % points.length;
              const nextIdx = (i + 1) % points.length;
              const prevPoint = points[prevIdx];
              const nextPoint = points[nextIdx];
              vertexAngle = calculateAngle(prevPoint, p, nextPoint);
            }

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

                {/* Angle indicator when dragging vertex */}
                {vertexAngle !== null &&
                  (() => {
                    const radius = 40;
                    const prevIdx = (i - 1 + points.length) % points.length;
                    const nextIdx = (i + 1) % points.length;
                    const prevPoint = points[prevIdx];
                    const nextPoint = points[nextIdx];

                    const angle1 = Math.atan2(prevPoint.yMm - p.yMm, prevPoint.xMm - p.xMm);
                    const angle2 = Math.atan2(nextPoint.yMm - p.yMm, nextPoint.xMm - p.xMm);

                    const startX = p.xMm + radius * Math.cos(angle1);
                    const startY = p.yMm + radius * Math.sin(angle1);
                    const endX = p.xMm + radius * Math.cos(angle2);
                    const endY = p.yMm + radius * Math.sin(angle2);

                    const largeArc = vertexAngle > 180 ? 1 : 0;

                    // Calculate bisector angle for text position (inside the angle)
                    const bisectorAngle = (angle1 + angle2) / 2;
                    const textRadius = 30;
                    const textX = p.xMm + textRadius * Math.cos(bisectorAngle);
                    const textY = p.yMm + textRadius * Math.sin(bisectorAngle);

                    return (
                      <>
                        {/* Angle arc */}
                        <path
                          d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`}
                          fill="none"
                          stroke="#88ee88"
                          strokeWidth={2}
                          opacity={0.6}
                          pointerEvents="none"
                        />
                        {/* Angle text */}
                        <text
                          x={textX}
                          y={textY}
                          fontSize={16}
                          fill="#00aa44"
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          pointerEvents="none"
                          stroke="#ffffff"
                          strokeWidth={3}
                          paintOrder="stroke"
                        >
                          {Math.round(vertexAngle)}°
                        </text>
                      </>
                    );
                  })()}

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

                {/* Vertex label */}
                <text
                  x={p.xMm + labelOffset.x}
                  y={p.yMm + labelOffset.y}
                  fontSize={16}
                  fill="#0b2540"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  pointerEvents="none"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>

        {/* Instructions */}
        <text x={viewBox.x + 20} y={viewBox.y + 30} fill="#555" fontSize={16} pointerEvents="none">
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

      {/* Exit edit mode button - shown only when in edit mode */}
      {activeTool !== null && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 16,
            transform: "translateX(-50%)",
            pointerEvents: "auto",
            zIndex: 2,
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTool(null)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "2px solid #2463ff",
              background: "#fff",
              color: "#2463ff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            편집 모드 닫기 (esc)
          </button>
        </div>
      )}

      {/* Controls - HTML 버튼 (프리셋과 동일한 레이아웃) */}
      <CanvasControlsTopLeft controls={topLeftControls} />
      <CanvasControlsBottomLeft controls={bottomLeftControls} />
      <CanvasControlsBottomRight controls={bottomRightControls} />
      <CanvasControlsCenter controls={centerControls} />

      {/* 면적 표시 (우측 상단) */}
      {isClosed && points.length >= 3 && areaM2 > 0 && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            textAlign: "left",
            color: "#0b2540",
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.2,
            padding: "10px 12px",
            background: "rgba(255,255,255,0.9)",
            borderRadius: 10,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          면적: {areaM2.toFixed(2)} m²
        </div>
      )}
    </div>
  );
}
