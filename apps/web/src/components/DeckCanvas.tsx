import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useCanvasViewport } from "../hooks/useCanvasViewport";
import { useDeckGeometry } from "../hooks/useDeckGeometry";
import { useUndoRedo } from "../hooks/useUndoRedo";
import type { Polygon, StructureLayout, CutPlan } from "@deck/core";
import {
  collectEdgeHandles,
  computeEdgeLimits,
  EDGE_LENGTH_STEP_MM,
  MIN_EDGE_SPAN_MM,
  type EdgeHandle,
} from "../geometry/edges";
import { isPointInsidePolygon, polygonCentroid } from "../geometry/polygon";
import { circleSegmentsForSagitta } from "../geometry/shapes";
import type { CutoutMeta } from "../geometry/cutouts";

import { DeckPolygon } from "./deck-canvas/DeckPolygon";
import { DeckVertexHandles } from "./deck-canvas/DeckVertexHandles";
import { DeckEdgeControls } from "./deck-canvas/DeckEdgeControls";
import { DeckHoles } from "./deck-canvas/DeckHoles";
import { DeckHoleEdgeHandles } from "./deck-canvas/DeckHoleEdgeHandles";
import { DeckBoardPattern } from "./deck-canvas/DeckBoardPattern";
import {
  CanvasControlsCenter,
  CanvasControlsTopLeft,
  CanvasControlsBottomLeft,
  CanvasControlsBottomRight,
  CANVAS_CONTROLS_STYLE,
} from "./CanvasControls";

import type { ShapeType, CutoutShape } from "../types";
import { buildLengthLegend } from "../utils/cutPlanViz";

export type ViewMode = "deck" | "substructure" | "cutPlan";
type PlanPoint = { xMm: number; yMm: number };

type CutoutMode = { enabled: boolean; shape: CutoutShape };

const VIEWBOX = { width: 2000, height: 1200 };
const EPS = 1e-3;
const EDGE_DRAG_SPEED_FACTOR = 0.5; // 변 드래그 속도 조절 (1.0 = 원래 속도, 0.5 = 50% 속도)

// 모든 도형의 시각적 설정을 한 곳에서 관리 (직사각형 기준)
const POLYGON_STYLE = {
  stroke: "#000",
  strokeWidth: { normal: 2, hover: 4, subView: 2 },
  strokeLinejoin: "miter" as const,
  strokeLinecap: "square" as const,
  fill: {
    normal: "rgba(80,160,255,0.12)",
    dragging: "#ffffff",
    subView: "none",
  },
  opacity: { normal: 1, subView: 0.2 },
} as const;

// polygon의 점 개수와 패턴으로 도형 타입 판단

export function DeckCanvas({
  polygon,
  viewMode,
  onChangePolygon,
  structureLayout,
  shapeType,
  onChangeShapeType,
  attachedEdgeIndices,
  onChangeAttachedEdgeIndices,
  fasciaEdgeIndices,
  onToggleViewMode,
  cutoutMode,
  cutoutsMeta,
  onChangeCutout,
  cutPlan,
  boardWidthMm = 140,
  gapMm = 5,
  deckingDirectionDeg = 0,
}: {
  polygon: Polygon;
  viewMode: ViewMode;
  onChangePolygon?: (polygon: Polygon) => void;
  structureLayout?: StructureLayout;
  shapeType?: ShapeType;
  onChangeShapeType?: (shapeType: ShapeType) => void;
  attachedEdgeIndices?: number[];
  onChangeAttachedEdgeIndices?: (next: number[]) => void;
  fasciaEdgeIndices?: number[];
  onToggleViewMode?: () => void;
  cutoutMode?: CutoutMode;
  onChangeCutoutMode?: (next: CutoutMode) => void;
  cutoutsMeta?: CutoutMeta[];
  onChangeCutout?: (index: number, meta: CutoutMeta) => void;
  cutPlan?: CutPlan | null;
  boardWidthMm?: number;
  gapMm?: number;
  deckingDirectionDeg?: number;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const {
    viewBox,
    setViewBox,
    setScale,
    setRotation,
    isPanning,
    transformGroup,
    transformPoint,
    toWorldCoords,
    centerView: baseCenterView,
    startPan,
    onPanMove,
    onPanEnd,
    handleWheel,
  } = useCanvasViewport(svgRef, {
    initialViewBox: { x: 0, y: 0, w: VIEWBOX.width, h: VIEWBOX.height },
  });
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [isEdgeDragging, setIsEdgeDragging] = useState(false);
  const [isPolygonHovered, setIsPolygonHovered] = useState(false);
  const [activeTool, setActiveTool] = useState<"add" | "delete" | "wall" | "cutout" | null>(null);
  const [hoverAddEdgeIndex, setHoverAddEdgeIndex] = useState<number | null>(null);
  const [hoverAddPoint, setHoverAddPoint] = useState<{ x: number; y: number } | null>(null);
  const [svgPxSize, setSvgPxSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [cutoutShape, setCutoutShape] = useState<CutoutShape>("rectangle");
  const [selectedHoleIndex, setSelectedHoleIndex] = useState<number | null>(null);
  const [hoverHoleIndex, setHoverHoleIndex] = useState<number | null>(null);
  const [isHoleMoving, setIsHoleMoving] = useState(false);
  const holeVertexDragRef = useRef<{
    pointerId: number;
    holeIndex: number;
    vertexIndex: number;
  } | null>(null);
  const holeMoveDragRef = useRef<{
    pointerId: number;
    holeIndex: number;
    startWorld: { x: number; y: number };
    startHole: PlanPoint[];
    startMeta?: CutoutMeta; // 개구부 메타데이터의 시작 상태
    lastValidHole: PlanPoint[]; // 마지막으로 유효했던 hole 위치
    lastValidMeta?: CutoutMeta; // 마지막으로 유효했던 meta
  } | null>(null);
  const holeCornerDragRef = useRef<{
    pointerId: number;
    holeIndex: number;
    corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    startWorld: { x: number; y: number };
    startMeta: { xMm: number; yMm: number; widthMm: number; heightMm: number; shape: CutoutShape };
    fixedCorner: { x: number; y: number }; // 반대쪽 고정된 모서리
  } | null>(null);
  const holeEdgeDragRef = useRef<{
    pointerId: number;
    holeIndex: number;
    edge: "top" | "right" | "bottom" | "left";
    startWorld: { x: number; y: number };
    startMeta: { xMm: number; yMm: number; widthMm: number; heightMm: number; shape: CutoutShape };
  } | null>(null);
  const cutoutDragRef = useRef<{
    pointerId: number;
    shape: Exclude<CutoutShape, "free">;
    startWorld: { x: number; y: number };
  } | null>(null);
  const [draftCutoutPoints, setDraftCutoutPoints] = useState<PlanPoint[] | null>(null);

  // Sync cutout mode from parent (ControlsPanel/App)
  useEffect(() => {
    if (!cutoutMode) return;
    setCutoutShape(cutoutMode.shape);
    if (cutoutMode.enabled) {
      setActiveTool("cutout");
    } else {
      setActiveTool((prev) => (prev === "cutout" ? null : prev));
      setDraftCutoutPoints(null);
    }
  }, [cutoutMode, cutoutMode?.enabled, cutoutMode?.shape]);

  // Undo/Redo history management
  const {
    undo: handleUndo,
    redo: handleRedo,
    canUndo,
    canRedo,
    pause: pauseHistory,
    commit: commitHistory,
  } = useUndoRedo(polygon, onChangePolygon ?? (() => {}), {
    isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  // Replaced manual history logic with useUndoRedo

  const edgeDragRef = useRef<{
    pointerId: number;
    handleId: string;
    orientation: "horizontal" | "vertical";
    originalPoints: { xMm: number; yMm: number }[];
    startWorld: { x: number; y: number };
    vertexIndices: number[];
    limits: { minDelta: number; maxDelta: number };
  } | null>(null);
  const circleDragActiveRef = useRef(false);
  const circleRadiusDragRef = useRef<{
    pointerId: number;
    center: { x: number; y: number };
    segments: number;
    startRadius: number;
    startRawRadius: number;
    lastTs: number;
    lastSnappedRadius?: number;
    startWorld: { x: number; y: number };
    radialUnit: { x: number; y: number };
    startProj: number;
  } | null>(null);

  // Utility: polygon의 점 개수와 패턴으로 도형 타입 판단
  const detectShapeInfo = (
    points: { xMm: number; yMm: number }[],
    _isClosed: boolean,
    shapeType?: ShapeType,
  ) => {
    if (shapeType === "circle") {
      return { isFree: false, isClosed: true, hasEdgeControls: false };
    }
    if (points.length === 0) {
      return { isFree: false, isClosed: false, hasEdgeControls: false };
    }
    const pointCount = points.length;
    const isPresetPattern = pointCount === 4 || pointCount === 6 || pointCount === 8;
    if (isPresetPattern) {
      return { isFree: false, isClosed: true, hasEdgeControls: true };
    }
    return { isFree: true, isClosed: true, hasEdgeControls: false };
  };

  // Utility: Project point to line segment
  const projectPointToSegment = (
    point: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const abLenSq = ab.x * ab.x + ab.y * ab.y;
    if (abLenSq < EPS) return a;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / abLenSq));
    return { x: a.x + ab.x * t, y: a.y + ab.y * t };
  };

  const isEditable = typeof onChangePolygon === "function";
  const isSubView = viewMode === "substructure";
  const isCutPlanView = viewMode === "cutPlan";

  const nextViewMode: ViewMode =
    viewMode === "deck" ? "substructure" : viewMode === "substructure" ? "cutPlan" : "deck";
  const viewModeLabel: Record<ViewMode, string> = {
    deck: "데크 보기",
    substructure: "하부 구조",
    cutPlan: "재단 계획",
  };

  // polygon 기반으로 도형 정보 판단
  const shapeInfo = useMemo(() => {
    const info = detectShapeInfo(polygon.outer, true, shapeType);
    return info;
  }, [polygon.outer, shapeType]);

  const cutPlanLegend = useMemo(() => {
    if (!isCutPlanView || !cutPlan) return null;
    return buildLengthLegend(cutPlan, 1000);
  }, [cutPlan, isCutPlanView]);

  // 프리셋 도형에서만 변 드래그 가능
  const enableEdgeControls = isEditable && shapeInfo.hasEdgeControls;

  const centerView = useCallback(() => {
    // Calculate polygon bounding box
    if (polygon.outer.length === 0) {
      baseCenterView();
      return;
    }

    const xs = polygon.outer.map((p) => p.xMm);
    const ys = polygon.outer.map((p) => p.yMm);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const polygonWidth = maxX - minX;
    const polygonHeight = maxY - minY;
    const polygonCenterX = (minX + maxX) / 2;
    const polygonCenterY = (minY + maxY) / 2;

    // Add padding (20% on each side)
    const padding = 1.4;
    const newWidth = Math.max(polygonWidth * padding, 400);
    const newHeight = Math.max(polygonHeight * padding, 400);

    baseCenterView({
      x: polygonCenterX - newWidth / 2,
      y: polygonCenterY - newHeight / 2,
      w: newWidth,
      h: newHeight,
    });
  }, [polygon.outer, baseCenterView]);

  const handleClear = useCallback(() => {
    if (!onChangePolygon) return;
    onChangePolygon({ outer: [], holes: [] });
    setActiveTool(null);
  }, [onChangePolygon]);

  const controls = [
    { key: "rotate", label: "회전", onClick: () => setRotation((prev) => (prev + 90) % 360) },
    { key: "center", label: "중앙 맞추기", onClick: centerView },
    {
      key: "zoom-out",
      label: "축소",
      onClick: () => setScale((prev) => Math.max(0.2, prev * 0.9)),
    },
    { key: "zoom-in", label: "확대", onClick: () => setScale((prev) => Math.min(5, prev * 1.1)) },
  ];

  // SVG 실제 픽셀 크기 추적 (텍스트 픽셀 고정의 원인 파악/계산용)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setSvgPxSize({ w: r.width, h: r.height });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // viewBox(user units) -> 화면 픽셀 변환 비율 (preserveAspectRatio 기본 meet 기준)
  const pixelsPerUnit = useMemo(() => {
    const pxW = svgPxSize.w;
    const pxH = svgPxSize.h;
    if (!pxW || !pxH || viewBox.w <= 0 || viewBox.h <= 0) return 1;
    const ppuX = pxW / viewBox.w;
    const ppuY = pxH / viewBox.h;
    return Math.min(ppuX, ppuY);
  }, [svgPxSize.w, svgPxSize.h, viewBox.w, viewBox.h]);

  // 현재 상태에서 "픽셀 고정"을 하려면 fontSize(user unit)가 얼마여야 하는지 (진단용)
  const suggestedEdgeFontUser = useMemo(() => 24 / pixelsPerUnit, [pixelsPerUnit]);

  const isCircle = useMemo(
    () => shapeType === "circle" && polygon.outer.length >= 3,
    [shapeType, polygon.outer.length],
  );
  const circleCenter = useMemo(() => {
    if (!isCircle) return null;
    const c = polygonCentroid(polygon.outer);
    return { x: c.xMm, y: c.yMm };
  }, [isCircle, polygon.outer]);

  const circleRadius = useMemo(() => {
    if (!isCircle || !circleCenter) return null;
    const pts = polygon.outer;
    if (pts.length === 0) return null;
    // 평균 반지름(노이즈에 조금 더 강함)
    const sum = pts.reduce(
      (acc, p) => acc + Math.hypot(p.xMm - circleCenter.x, p.yMm - circleCenter.y),
      0,
    );
    return sum / pts.length;
  }, [isCircle, circleCenter, polygon.outer]);

  // 원 반지름 드래그 속도 계수 (커서 이동 대비 반지름 변화 비율). 값이 작을수록 천천히 변함.
  const CIRCLE_RADIUS_DRAG_SPEED = 0.35;

  const buildCirclePolygon = useCallback(
    (center: { x: number; y: number }, radiusMm: number, segments = 16) => {
      const pts: { xMm: number; yMm: number }[] = [];
      const r = Math.max(radiusMm, 0);
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push({ xMm: center.x + Math.cos(a) * r, yMm: center.y + Math.sin(a) * r });
      }
      return pts;
    },
    [],
  );

  const isPointInsideOuter = useCallback(
    (p: PlanPoint) => {
      if (polygon.outer.length < 3) return false;
      return isPointInsidePolygon({ x: p.xMm, y: p.yMm }, polygon.outer);
    },
    [polygon.outer],
  );

  const appendHole = useCallback(
    (hole: PlanPoint[]) => {
      if (!onChangePolygon) return;
      if (hole.length < 3) return;
      // basic validation: all points inside outer
      if (!hole.every(isPointInsideOuter)) return;
      const nextHoles = [...(polygon.holes ?? []), hole];
      onChangePolygon({ ...polygon, holes: nextHoles });
      setSelectedHoleIndex(nextHoles.length - 1);
    },
    [isPointInsideOuter, onChangePolygon, polygon],
  );

  const updateHolePoint = useCallback(
    (holeIndex: number, vertexIndex: number, next: PlanPoint) => {
      if (!onChangePolygon) return;
      const holes = polygon.holes ?? [];
      const hole = holes[holeIndex];
      if (!hole) return;
      if (vertexIndex < 0 || vertexIndex >= hole.length) return;
      if (!isPointInsideOuter(next)) return;
      const nextHole = hole.map((pt, i) => (i === vertexIndex ? next : pt));
      const nextHoles = holes.map((h, i) => (i === holeIndex ? nextHole : h));
      onChangePolygon({ ...polygon, holes: nextHoles });
    },
    [isPointInsideOuter, onChangePolygon, polygon],
  );

  const edgeHandles = useMemo(() => {
    if (!enableEdgeControls) return [];
    return collectEdgeHandles(polygon.outer);
  }, [enableEdgeControls, polygon.outer]);

  const { edgeLabels, areaM2 } = useDeckGeometry(polygon);

  // 텍스트 위치를 transformGroup과 동일하게 변환하는 함수

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Circle radius drag (works even in non-edit mode; uses onChangePolygon if provided)
      if (circleRadiusDragRef.current && onChangePolygon) {
        const drag = circleRadiusDragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;
        // NOTE: 반지름은 '방사 방향 투영(projection)' 기반으로 계산 (일정한 체감 속도)

        // 일정한 속도를 위해: 드래그 시작 시점 대비 '선형'으로 반지름을 변경한다.
        // (드래그 중 스냅을 걸면 계단식으로 멈춤/점프가 발생하므로, 스냅은 pointerUp에서만 적용)
        const vx = world.x - drag.center.x;
        const vy = world.y - drag.center.y;
        const proj = vx * drag.radialUnit.x + vy * drag.radialUnit.y; // 방사 방향으로 투영된 길이
        const linearRadius = drag.startRadius + (proj - drag.startProj) * CIRCLE_RADIUS_DRAG_SPEED;
        const appliedRadius = Math.max(MIN_EDGE_SPAN_MM, linearRadius);

        drag.lastTs = Date.now();
        drag.lastSnappedRadius = appliedRadius;

        const seg = circleSegmentsForSagitta(appliedRadius, 10);
        const newOuter = buildCirclePolygon(drag.center, appliedRadius, seg);
        onChangePolygon({ ...polygon, outer: newOuter });
        return;
      }

      // Hole vertex drag
      if (holeVertexDragRef.current && onChangePolygon) {
        const drag = holeVertexDragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;
        const snappedX = Math.round(world.x / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
        const snappedY = Math.round(world.y / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
        updateHolePoint(drag.holeIndex, drag.vertexIndex, { xMm: snappedX, yMm: snappedY });
        return;
      }

      // Hole corner drag (resize rectangle/circle cutouts by dragging corners)
      if (holeCornerDragRef.current && onChangeCutout) {
        const drag = holeCornerDragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;

        const { fixedCorner } = drag;

        // Snap current position to grid
        const snappedX = Math.round(world.x / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
        const snappedY = Math.round(world.y / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;

        // Calculate new dimensions based on fixed corner and current position
        const newWidthMm = Math.abs(snappedX - fixedCorner.x);
        const newHeightMm = Math.abs(snappedY - fixedCorner.y);

        // Ensure minimum size
        const finalWidthMm = Math.max(MIN_EDGE_SPAN_MM, newWidthMm);
        const finalHeightMm = Math.max(MIN_EDGE_SPAN_MM, newHeightMm);

        // Calculate new center position (midpoint between fixed corner and current position)
        const newXMm = (fixedCorner.x + snappedX) / 2;
        const newYMm = (fixedCorner.y + snappedY) / 2;

        // For circle, keep width and height equal (use the larger dimension)
        let finalW = finalWidthMm;
        let finalH = finalHeightMm;
        if (drag.startMeta.shape === "circle") {
          const maxDim = Math.max(finalWidthMm, finalHeightMm);
          finalW = maxDim;
          finalH = maxDim;
        }

        // Check if all 4 corners of the resized cutout are inside the outer polygon
        const halfW = finalW / 2;
        const halfH = finalH / 2;
        const corners = [
          { x: newXMm - halfW, y: newYMm - halfH },
          { x: newXMm + halfW, y: newYMm - halfH },
          { x: newXMm - halfW, y: newYMm + halfH },
          { x: newXMm + halfW, y: newYMm + halfH },
        ];

        const allCornersInside = corners.every((corner) =>
          isPointInsidePolygon(corner, polygon.outer),
        );

        // Only apply the change if all corners are inside
        if (allCornersInside) {
          onChangeCutout(drag.holeIndex, {
            ...drag.startMeta,
            xMm: newXMm,
            yMm: newYMm,
            widthMm: finalW,
            heightMm: finalH,
          });
        }
        return;
      }

      // Hole edge drag (resize rectangle/circle cutouts by dragging edges)
      if (holeEdgeDragRef.current && onChangeCutout) {
        const drag = holeEdgeDragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;

        const { edge, startWorld, startMeta } = drag;
        const dx = world.x - startWorld.x;
        const dy = world.y - startWorld.y;

        let newWidthMm = startMeta.widthMm;
        let newHeightMm = startMeta.heightMm;
        let newXMm = startMeta.xMm;
        let newYMm = startMeta.yMm;

        // 변을 드래그하면 해당 변만 움직이고 반대쪽 변은 고정
        if (edge === "left") {
          const halfW = startMeta.widthMm / 2;
          const leftEdge = startMeta.xMm - halfW;
          const rightEdge = startMeta.xMm + halfW; // 고정
          const newLeftEdge = leftEdge + dx;
          newWidthMm = Math.max(MIN_EDGE_SPAN_MM, rightEdge - newLeftEdge);
          newXMm = rightEdge - newWidthMm / 2;
        } else if (edge === "right") {
          const halfW = startMeta.widthMm / 2;
          const leftEdge = startMeta.xMm - halfW; // 고정
          const rightEdge = startMeta.xMm + halfW;
          const newRightEdge = rightEdge + dx;
          newWidthMm = Math.max(MIN_EDGE_SPAN_MM, newRightEdge - leftEdge);
          newXMm = leftEdge + newWidthMm / 2;
        } else if (edge === "top") {
          const halfH = startMeta.heightMm / 2;
          const topEdge = startMeta.yMm - halfH;
          const bottomEdge = startMeta.yMm + halfH; // 고정
          const newTopEdge = topEdge + dy;
          newHeightMm = Math.max(MIN_EDGE_SPAN_MM, bottomEdge - newTopEdge);
          newYMm = bottomEdge - newHeightMm / 2;
        } else if (edge === "bottom") {
          const halfH = startMeta.heightMm / 2;
          const topEdge = startMeta.yMm - halfH; // 고정
          const bottomEdge = startMeta.yMm + halfH;
          const newBottomEdge = bottomEdge + dy;
          newHeightMm = Math.max(MIN_EDGE_SPAN_MM, newBottomEdge - topEdge);
          newYMm = topEdge + newHeightMm / 2;
        }

        // For circle, keep width and height equal (use the larger dimension)
        if (startMeta.shape === "circle") {
          const maxDim = Math.max(newWidthMm, newHeightMm);
          newWidthMm = maxDim;
          newHeightMm = maxDim;
        }

        // Round to grid
        const finalWidthMm = Math.round(newWidthMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
        const finalHeightMm = Math.round(newHeightMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;

        // Check if all 4 corners of the resized cutout are inside the outer polygon
        const halfW = finalWidthMm / 2;
        const halfH = finalHeightMm / 2;
        const corners = [
          { x: newXMm - halfW, y: newYMm - halfH },
          { x: newXMm + halfW, y: newYMm - halfH },
          { x: newXMm - halfW, y: newYMm + halfH },
          { x: newXMm + halfW, y: newYMm + halfH },
        ];

        const allCornersInside = corners.every((corner) =>
          isPointInsidePolygon(corner, polygon.outer),
        );

        // Only apply the change if all corners are inside
        if (allCornersInside) {
          onChangeCutout(drag.holeIndex, {
            ...startMeta,
            xMm: newXMm,
            yMm: newYMm,
            widthMm: finalWidthMm,
            heightMm: finalHeightMm,
          });
        }
        return;
      }

      // Hole move drag (drag inside cutout to move whole hole)
      if (holeMoveDragRef.current && onChangePolygon) {
        const drag = holeMoveDragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;

        // Safety check: ensure we have valid hole data
        if (
          !drag.lastValidHole ||
          drag.lastValidHole.length === 0 ||
          !drag.startHole ||
          drag.startHole.length === 0
        ) {
          return;
        }

        // Calculate total movement from start
        const totalDx = world.x - drag.startWorld.x;
        const totalDy = world.y - drag.startWorld.y;

        // Calculate movement from last valid position
        const currentDx = totalDx - (drag.lastValidHole[0].xMm - drag.startHole[0].xMm);
        const currentDy = totalDy - (drag.lastValidHole[0].yMm - drag.startHole[0].yMm);

        // Try to move from the last valid position
        const movedHole = drag.lastValidHole.map((p) => ({
          xMm: p.xMm + currentDx,
          yMm: p.yMm + currentDy,
        }));

        // Check if all points are inside
        const allInside = movedHole.every((p) =>
          isPointInsidePolygon({ x: p.xMm, y: p.yMm }, polygon.outer),
        );

        let finalHole = drag.lastValidHole;
        let finalMeta = drag.lastValidMeta;

        if (allInside) {
          // Full movement is valid - update last valid position
          finalHole = movedHole;
          if (drag.lastValidMeta && onChangeCutout) {
            finalMeta = {
              ...drag.lastValidMeta,
              xMm: drag.lastValidMeta.xMm + currentDx,
              yMm: drag.lastValidMeta.yMm + currentDy,
            };
          }
          drag.lastValidHole = finalHole;
          drag.lastValidMeta = finalMeta;
        } else {
          // Try moving X only from last valid position
          const movedX = drag.lastValidHole.map((p) => ({ xMm: p.xMm + currentDx, yMm: p.yMm }));
          const xValid = movedX.every((p) =>
            isPointInsidePolygon({ x: p.xMm, y: p.yMm }, polygon.outer),
          );

          // Try moving Y only from last valid position
          const movedY = drag.lastValidHole.map((p) => ({ xMm: p.xMm, yMm: p.yMm + currentDy }));
          const yValid = movedY.every((p) =>
            isPointInsidePolygon({ x: p.xMm, y: p.yMm }, polygon.outer),
          );

          if (xValid && !yValid) {
            // Only X movement is valid
            finalHole = movedX;
            if (drag.lastValidMeta && onChangeCutout) {
              finalMeta = {
                ...drag.lastValidMeta,
                xMm: drag.lastValidMeta.xMm + currentDx,
                yMm: drag.lastValidMeta.yMm,
              };
            }
            drag.lastValidHole = finalHole;
            drag.lastValidMeta = finalMeta;
          } else if (yValid && !xValid) {
            // Only Y movement is valid
            finalHole = movedY;
            if (drag.lastValidMeta && onChangeCutout) {
              finalMeta = {
                ...drag.lastValidMeta,
                xMm: drag.lastValidMeta.xMm,
                yMm: drag.lastValidMeta.yMm + currentDy,
              };
            }
            drag.lastValidHole = finalHole;
            drag.lastValidMeta = finalMeta;
          }
          // If neither direction is valid, keep last valid position
        }

        // Update polygon with the final position
        const holes = polygon.holes ?? [];
        const nextHoles = holes.map((h, i) => (i === drag.holeIndex ? finalHole : h));

        if (finalMeta && onChangeCutout) {
          onChangeCutout(drag.holeIndex, finalMeta);
        }

        onChangePolygon({ ...polygon, holes: nextHoles });
        return;
      }

      // Cutout drag-create (rectangle/circle)
      if (cutoutDragRef.current && onChangePolygon) {
        const drag = cutoutDragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;
        const sx = drag.startWorld.x;
        const sy = drag.startWorld.y;
        const cx = world.x;
        const cy = world.y;
        if (drag.shape === "rectangle") {
          const minX = Math.min(sx, cx);
          const maxX = Math.max(sx, cx);
          const minY = Math.min(sy, cy);
          const maxY = Math.max(sy, cy);
          const pts: PlanPoint[] = [
            { xMm: minX, yMm: minY },
            { xMm: maxX, yMm: minY },
            { xMm: maxX, yMm: maxY },
            { xMm: minX, yMm: maxY },
          ].map((p) => ({
            xMm: Math.round(p.xMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM,
            yMm: Math.round(p.yMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM,
          }));
          setDraftCutoutPoints(pts);
        } else {
          const r = Math.hypot(cx - sx, cy - sy);
          const snappedR = Math.round(r / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
          const pts = buildCirclePolygon({ x: sx, y: sy }, snappedR, 16);
          setDraftCutoutPoints(pts);
        }
        return;
      }

      if (edgeDragRef.current && onChangePolygon) {
        const drag = edgeDragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;
        const rawDelta =
          drag.orientation === "vertical"
            ? (world.x - drag.startWorld.x) * EDGE_DRAG_SPEED_FACTOR
            : (world.y - drag.startWorld.y) * EDGE_DRAG_SPEED_FACTOR;

        // 10mm 단위로 스냅
        const snappedDelta = Math.round(rawDelta / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;

        const clampedDelta = Math.min(
          Math.max(snappedDelta, drag.limits.minDelta),
          drag.limits.maxDelta,
        );

        const updatedOuter = drag.originalPoints.map((pt, idx) => {
          if (!drag.vertexIndices.includes(idx)) return pt;
          if (drag.orientation === "vertical") {
            return { xMm: pt.xMm + clampedDelta, yMm: pt.yMm };
          }
          return { xMm: pt.xMm, yMm: pt.yMm + clampedDelta };
        });
        onChangePolygon({ ...polygon, outer: updatedOuter });
        return;
      }

      if (dragIndex !== null && onChangePolygon) {
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;

        let snappedX = world.x;
        let snappedY = world.y;

        // 편집 모드에서 꼭지점 드래그 시 10mm 단위로 스냅 (모든 도형에 적용)
        if (activeTool !== null) {
          snappedX = Math.round(snappedX / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
          snappedY = Math.round(snappedY / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
        }

        // Right-angle snapping for free-form shapes (10mm 단위로 조정)
        if (shapeInfo.isFree && polygon.outer.length >= 2) {
          const SNAP_THRESHOLD = 30; // tighter snap range
          const softSnap = (value: number, target: number) => {
            const d = Math.abs(value - target);
            if (d > SNAP_THRESHOLD) return value;
            // Smoothly attract toward target as we get closer
            const t = (SNAP_THRESHOLD - d) / SNAP_THRESHOLD; // 0..1
            const eased = t * t * (3 - 2 * t); // smoothstep
            const snapped = value + (target - value) * eased;
            // 10mm 단위로 스냅
            return Math.round(snapped / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
          };
          const n = polygon.outer.length;

          // Get previous and next vertex indices
          const prevIdx = (dragIndex - 1 + n) % n;
          const nextIdx = (dragIndex + 1) % n;
          const prevPt = polygon.outer[prevIdx];
          const nextPt = polygon.outer[nextIdx];

          // Snap to vertical alignment with previous vertex (10mm 단위)
          snappedX = softSnap(snappedX, prevPt.xMm);
          // Snap to horizontal alignment with previous vertex (10mm 단위)
          snappedY = softSnap(snappedY, prevPt.yMm);

          // Snap to vertical alignment with next vertex (if not same as prev) (10mm 단위)
          if (nextIdx !== prevIdx) {
            snappedX = softSnap(snappedX, nextPt.xMm);
            // Snap to horizontal alignment with next vertex (10mm 단위)
            snappedY = softSnap(snappedY, nextPt.yMm);
          }
        }

        const updatedOuter = polygon.outer.map((pt, idx) =>
          idx === dragIndex ? { xMm: snappedX, yMm: snappedY } : pt,
        );
        onChangePolygon({ ...polygon, outer: updatedOuter });
        return;
      }

      onPanMove(event);
    },
    [
      buildCirclePolygon,
      shapeInfo.isFree,
      polygon,
      toWorldCoords,
      dragIndex,
      onChangePolygon,
      activeTool,
      updateHolePoint,
      isPointInsideOuter,
      viewBox.h,
      viewBox.w,
    ],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      event.preventDefault();
      const svg = svgRef.current;
      if (circleDragActiveRef.current) {
        circleDragActiveRef.current = false;
      }
      if (
        circleRadiusDragRef.current &&
        event.pointerId === circleRadiusDragRef.current.pointerId
      ) {
        // 요구사항:
        // - 드래그 중에는 캔버스 밖으로 커져도 OK (반지름/면적 변경)
        // - 드래그를 놓는 순간에는 반지름은 고정(종료 스냅만), 화면(viewBox/줌)만 원에 맞게 재조정
        if (onChangePolygon) {
          const drag = circleRadiusDragRef.current;
          // 1) 현재 반지름을 확정 (종료 시에만 10mm 스냅)
          const pts = polygon.outer;
          const currentRadius =
            pts.length > 0
              ? pts.reduce(
                  (acc, p) => acc + Math.hypot(p.xMm - drag.center.x, p.yMm - drag.center.y),
                  0,
                ) / pts.length
              : drag.startRadius;
          const snappedRadius = Math.max(
            MIN_EDGE_SPAN_MM,
            Math.round(currentRadius / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM,
          );

          const seg = circleSegmentsForSagitta(snappedRadius, 10);
          const newOuter = buildCirclePolygon(drag.center, snappedRadius, seg);
          onChangePolygon({ ...polygon, outer: newOuter });

          // 2) 화면(viewBox)만 원에 맞게 재조정 (너무 꽉 차지 않게 약간 여유)
          const VIEW_FIT_PADDING = 1.15;
          const diameter = snappedRadius * 2;
          const newW = Math.max(diameter * VIEW_FIT_PADDING, 400);
          const newH = Math.max(diameter * VIEW_FIT_PADDING, 400);
          const nextViewBox = {
            x: drag.center.x - newW / 2,
            y: drag.center.y - newH / 2,
            w: newW,
            h: newH,
          };

          setViewBox(nextViewBox);
          setScale(1);
        }

        if (svg && svg.hasPointerCapture?.(circleRadiusDragRef.current.pointerId)) {
          svg.releasePointerCapture(circleRadiusDragRef.current.pointerId);
        }
        circleRadiusDragRef.current = null;
      }

      if (edgeDragRef.current && event.pointerId === edgeDragRef.current.pointerId) {
        if (svg && svg.hasPointerCapture?.(edgeDragRef.current.pointerId)) {
          svg.releasePointerCapture(edgeDragRef.current.pointerId);
        }
        edgeDragRef.current = null;
        setIsEdgeDragging(false);
        setActiveEdgeId(null);
        setHoverEdgeId(null);
        commitHistory(); // Commit history after edge drag ends
      }

      if (holeVertexDragRef.current && event.pointerId === holeVertexDragRef.current.pointerId) {
        if (svg && svg.hasPointerCapture?.(holeVertexDragRef.current.pointerId)) {
          svg.releasePointerCapture(holeVertexDragRef.current.pointerId);
        }
        holeVertexDragRef.current = null;
      }

      if (holeCornerDragRef.current && event.pointerId === holeCornerDragRef.current.pointerId) {
        if (svg && svg.hasPointerCapture?.(holeCornerDragRef.current.pointerId)) {
          svg.releasePointerCapture(holeCornerDragRef.current.pointerId);
        }
        holeCornerDragRef.current = null;
      }

      if (holeEdgeDragRef.current && event.pointerId === holeEdgeDragRef.current.pointerId) {
        if (svg && svg.hasPointerCapture?.(holeEdgeDragRef.current.pointerId)) {
          svg.releasePointerCapture(holeEdgeDragRef.current.pointerId);
        }
        holeEdgeDragRef.current = null;
      }

      if (holeMoveDragRef.current && event.pointerId === holeMoveDragRef.current.pointerId) {
        if (svg && svg.hasPointerCapture?.(holeMoveDragRef.current.pointerId)) {
          svg.releasePointerCapture(holeMoveDragRef.current.pointerId);
        }
        holeMoveDragRef.current = null;
        setIsHoleMoving(false);
      }

      if (cutoutDragRef.current && event.pointerId === cutoutDragRef.current.pointerId) {
        if (svg && svg.hasPointerCapture?.(cutoutDragRef.current.pointerId)) {
          svg.releasePointerCapture(cutoutDragRef.current.pointerId);
        }
        // Commit draft cutout if valid
        if (draftCutoutPoints && draftCutoutPoints.length >= 3) {
          appendHole(draftCutoutPoints);
        }
        setDraftCutoutPoints(null);
        cutoutDragRef.current = null;
      }

      if (dragIndex !== null) {
        if (svg && pointerIdRef.current !== null && svg.hasPointerCapture?.(pointerIdRef.current)) {
          svg.releasePointerCapture(pointerIdRef.current);
        }
        pointerIdRef.current = null;
        setDragIndex(null);
        commitHistory(); // Commit history after vertex drag ends
      }

      onPanEnd(event);
    },
    [
      buildCirclePolygon,
      dragIndex,
      onChangePolygon,
      polygon,
      appendHole,
      draftCutoutPoints,
      commitHistory,
    ],
  );

  const startDrag = useCallback(
    (idx: number) => (event: ReactPointerEvent) => {
      if (!isEditable) return;
      // Allow vertex drag always (user request: drag/move possible in normal mode)
      // Exception: activeTool === "delete" handled below
      const allowVertexDrag = true;

      if (activeTool === "delete") {
        event.preventDefault();
        event.stopPropagation();
        if (!onChangePolygon) return;
        const nextOuter = polygon.outer.filter((_, i) => i !== idx);
        onChangePolygon({ ...polygon, outer: nextOuter });
        onChangeShapeType?.("free"); // 꼭지점 삭제 시 자유형으로 변경
        return;
      }

      if (!allowVertexDrag) return;

      event.preventDefault();
      event.stopPropagation();
      pauseHistory(); // Pause history during drag
      pointerIdRef.current = event.pointerId;
      svgRef.current?.setPointerCapture?.(event.pointerId);
      setDragIndex(idx);
      // 원형 드래그는 더 이상 특별 처리하지 않음
    },
    [activeTool, isEditable, onChangePolygon, onChangeShapeType, polygon, shapeInfo, pauseHistory],
  );

  const startEdgeDrag = useCallback(
    (handle: EdgeHandle) => (event: ReactPointerEvent) => {
      // Wall(ledger) selection mode: toggle edge index instead of dragging
      if (activeTool === "wall" && onChangeAttachedEdgeIndices) {
        event.preventDefault();
        event.stopPropagation();
        const current = new Set(attachedEdgeIndices ?? []);
        if (current.has(handle.startIndex)) current.delete(handle.startIndex);
        else current.add(handle.startIndex);
        onChangeAttachedEdgeIndices(Array.from(current).sort((a, b) => a - b));
        return;
      }
      if (!enableEdgeControls || !isEditable || !onChangePolygon) return;
      event.preventDefault();
      event.stopPropagation();
      const world = toWorldCoords(event.clientX, event.clientY);
      if (!world) return;
      const originalPoints = polygon.outer.map((pt) => ({ ...pt }));
      const limits = computeEdgeLimits(originalPoints, handle.vertexIndices, handle.orientation);
      edgeDragRef.current = {
        pointerId: event.pointerId,
        handleId: handle.id,
        orientation: handle.orientation,
        originalPoints,
        startWorld: world,
        vertexIndices: handle.vertexIndices,
        limits,
      };
      setActiveEdgeId(handle.id);
      setIsEdgeDragging(true);
      pauseHistory(); // Pause history during edge drag
      svgRef.current?.setPointerCapture?.(event.pointerId);
    },
    [
      activeTool,
      attachedEdgeIndices,
      enableEdgeControls,
      isEditable,
      onChangeAttachedEdgeIndices,
      onChangePolygon,
      polygon.outer,
      toWorldCoords,
      pauseHistory,
    ],
  );

  const updateHoverAddHandle = useCallback(
    (edgeIndex: number, clientX: number, clientY: number) => {
      if (activeTool !== "add") return;
      const world = toWorldCoords(clientX, clientY);
      if (!world) return;
      const pts = polygon.outer;
      const start = pts[edgeIndex];
      const end = pts[(edgeIndex + 1) % pts.length];
      const projected = projectPointToSegment(
        world,
        { x: start.xMm, y: start.yMm },
        { x: end.xMm, y: end.yMm },
      );
      setHoverAddEdgeIndex(edgeIndex);
      setHoverAddPoint(projected);
    },
    [activeTool, polygon.outer, toWorldCoords],
  );

  const handleAddHandleClick = useCallback(
    (insertIndex: number, position: { x: number; y: number }) =>
      (event: ReactPointerEvent<SVGCircleElement>) => {
        if (!isEditable || !onChangePolygon) return;
        event.preventDefault();
        event.stopPropagation();

        // 꼭지점 추가: insertIndex 위치에 새 점 삽입
        // insertIndex는 이미 올바르게 계산됨 (nextIndex가 0이면 배열 끝, 아니면 nextIndex 위치)
        const newPoint = { xMm: position.x, yMm: position.y };

        // 점 삽입: insertIndex는 항상 유효한 범위 내에 있음
        const newOuter = [
          ...polygon.outer.slice(0, insertIndex),
          newPoint,
          ...polygon.outer.slice(insertIndex),
        ];

        onChangePolygon({ ...polygon, outer: newOuter });
        onChangeShapeType?.("free"); // 꼭지점 추가 시 자유형으로 변경
        pointerIdRef.current = event.pointerId;
        svgRef.current?.setPointerCapture?.(event.pointerId);
        setDragIndex(insertIndex);
      },
    [isEditable, onChangePolygon, onChangeShapeType, polygon],
  );

  // Auto-center view when polygon changes (but not during dragging)
  useEffect(() => {
    const isCircleDragging = circleRadiusDragRef.current !== null || circleDragActiveRef.current;

    // 원형은 반지름 드래그/자동맞춤으로 polygon이 자주 바뀌므로 auto-center 자체를 비활성화
    if (isCircle) return;

    // 드래그 중이거나 변 드래그 중이면 centerView 호출하지 않음
    if (dragIndex !== null || isEdgeDragging) return;

    // 원형 반지름 드래그 중에는 viewBox를 바꾸지 않음 (드래그 속도/감각이 들쭉날쭉해지는 원인)
    if (isCircleDragging) return;

    if (polygon.outer.length > 0) {
      centerView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygon.outer, dragIndex, isEdgeDragging, isCircle]);

  // Keyboard shortcuts: ESC to exit edit mode, Ctrl+Z/Ctrl+Shift+Z for undo/redo
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // ESC to exit edit mode
      if (event.key === "Escape") {
        if (activeTool !== null) {
          setActiveTool(null);
          setHoverAddEdgeIndex(null);
          setHoverAddPoint(null);
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

  const handleSvgPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Cutout mode interactions (left button only)
      if (activeTool === "cutout" && event.button === 0) {
        if (!isEditable || !onChangePolygon) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;
        event.preventDefault();
        event.stopPropagation();

        // Clear selection when starting a new draft
        setSelectedHoleIndex(null);

        // rectangle/circle drag create (free cutout removed)
        if (cutoutShape !== "free") {
          cutoutDragRef.current = {
            pointerId: event.pointerId,
            shape: cutoutShape,
            startWorld: world,
          };
          svgRef.current?.setPointerCapture?.(event.pointerId);
          setDraftCutoutPoints(null);
        }
        return;
      }

      // Always try to start pan (will be filtered in startPan)
      startPan(event);
    },
    [activeTool, appendHole, cutoutShape, isEditable, onChangePolygon, startPan, toWorldCoords],
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Dim overlay when in edit mode - HTML overlay to cover entire viewport */}
      {activeTool !== null && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.15)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        style={{
          border: "1px solid #ddd",
          background: "#fafafa",
          display: "block",
          cursor:
            isPanning || isEdgeDragging || isHoleMoving
              ? "grabbing"
              : activeTool === "delete"
                ? "not-allowed"
                : activeTool === "add"
                  ? "copy"
                  : "grab",
          overflow: "visible",
          touchAction: "none", // Prevent scroll/zoom gestures on canvas
          WebkitTouchCallout: "none", // Prevent long-press menu
        }}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        <g transform={transformGroup}>
          {/* Substructure Rendering - Improved Technical Style */}
          {isSubView && structureLayout && (
            <g pointerEvents="none">
              {/* 1. Bearers (멍에) - 하단 지지 구조, 묵직한 느낌 */}
              {structureLayout.bearers.map((b, i) => (
                <g key={`bearer-${i}`}>
                  {/* 외곽선으로 그림자/두께감 표현 */}
                  <line
                    x1={b.x1}
                    y1={b.y1}
                    x2={b.x2}
                    y2={b.y2}
                    stroke="#455A64"
                    strokeWidth={100}
                    strokeLinecap="square"
                    opacity={0.8}
                  />
                  {/* 내부 색상 */}
                  <line
                    x1={b.x1}
                    y1={b.y1}
                    x2={b.x2}
                    y2={b.y2}
                    stroke="#607D8B"
                    strokeWidth={92}
                    strokeLinecap="square"
                  />
                </g>
              ))}

              {/* 2. Joists (장선) - 상단 지지 구조, 밝은 느낌 */}
              {structureLayout.joists.map((j, i) => (
                <g key={`joist-${i}`}>
                  {/* 외곽선 */}
                  <line
                    x1={j.x1}
                    y1={j.y1}
                    x2={j.x2}
                    y2={j.y2}
                    stroke="#546E7A"
                    strokeWidth={50}
                    strokeLinecap="square"
                    opacity={0.9}
                  />
                  {/* 내부 색상 - 밝게 처리하여 위에 있음을 강조 */}
                  <line
                    x1={j.x1}
                    y1={j.y1}
                    x2={j.x2}
                    y2={j.y2}
                    stroke="#CFD8DC"
                    strokeWidth={46}
                    strokeLinecap="square"
                  />
                </g>
              ))}

              {/* 3. Piles (기초) - 도면 심볼 스타일 */}
              {structureLayout.piles.map((p, i) => (
                <g key={`pile-${i}`} transform={`translate(${p.xMm}, ${p.yMm})`}>
                  {/* 기초 콘크리트 패드 (사각형) */}
                  <rect
                    x={-150}
                    y={-150}
                    width={300}
                    height={300}
                    fill="#F5F5F5"
                    stroke="#B0BEC5"
                    strokeWidth={1}
                    rx={4}
                    opacity={0.9}
                  />
                  {/* 주춧돌 (원형) */}
                  <circle r={100} fill="#ECEFF1" stroke="#78909C" strokeWidth={2} />
                  {/* 중심점 (십자선) - 정밀 포인트 */}
                  <line x1={-15} y1={0} x2={15} y2={0} stroke="#EF5350" strokeWidth={2} />
                  <line x1={0} y1={-15} x2={0} y2={15} stroke="#EF5350" strokeWidth={2} />
                </g>
              ))}
            </g>
          )}

          {/* 데크 보드 패턴 (재단 계획 보기에서만 표시) */}
          {isCutPlanView && cutPlan && !isCircle && (
            <DeckBoardPattern
              polygon={polygon}
              cutPlan={cutPlan}
              boardWidthMm={boardWidthMm}
              gapMm={gapMm}
              deckingDirectionDeg={deckingDirectionDeg}
              opacity={0.7}
            />
          )}

          {/* 모든 형태를 직사각형과 동일한 설정으로 렌더링 (POLYGON_STYLE 사용) */}
          <DeckPolygon
            polygon={polygon}
            shapeType={shapeType}
            shapeInfo={shapeInfo}
            isCircle={isCircle}
            circleCenter={circleCenter}
            circleRadius={circleRadius}
            styles={{
              fill: isSubView
                ? POLYGON_STYLE.fill.subView
                : isEdgeDragging || activeTool !== null
                  ? POLYGON_STYLE.fill.dragging
                  : isCutPlanView && cutPlan && !isCircle
                    ? "transparent"
                    : POLYGON_STYLE.fill.normal,
              stroke: POLYGON_STYLE.stroke,
              strokeWidth: isSubView
                ? POLYGON_STYLE.strokeWidth.subView
                : isPolygonHovered
                  ? POLYGON_STYLE.strokeWidth.hover
                  : POLYGON_STYLE.strokeWidth.normal,
              strokeLinejoin: POLYGON_STYLE.strokeLinejoin,
              strokeLinecap: POLYGON_STYLE.strokeLinecap,
              opacity: isSubView ? POLYGON_STYLE.opacity.subView : POLYGON_STYLE.opacity.normal,
              cutoutFill: "#fafafa",
              cutoutStroke: "#ff6b6b",
            }}
            onPolygonEnter={() => setIsPolygonHovered(true)}
            onPolygonLeave={() => setIsPolygonHovered(false)}
            onCircleOutlineDown={(e) => {
              if (!onChangePolygon) return;
              const world = toWorldCoords(e.clientX, e.clientY);
              if (!world) return;
              e.preventDefault();
              e.stopPropagation();
              circleDragActiveRef.current = true;
              const startRawRadius = Math.hypot(
                world.x - (circleCenter?.x || 0),
                world.y - (circleCenter?.y || 0),
              );
              if (!circleCenter) return;
              const startWorld = world;
              const rvx = startWorld.x - circleCenter.x;
              const rvy = startWorld.y - circleCenter.y;
              const rlen = Math.hypot(rvx, rvy);
              const radialUnit = rlen > EPS ? { x: rvx / rlen, y: rvy / rlen } : { x: 1, y: 0 };
              const startProj = rvx * radialUnit.x + rvy * radialUnit.y;
              circleRadiusDragRef.current = {
                pointerId: e.pointerId,
                center: circleCenter,
                segments: 16,
                startRadius: circleRadius || 0,
                startRawRadius,
                lastTs: Date.now(),
                lastSnappedRadius: undefined,
                startWorld,
                radialUnit,
                startProj,
              };
              svgRef.current?.setPointerCapture?.(e.pointerId);
            }}
          />

          {/* Holes (cutouts): draw as filled polygons to “punch out” the deck fill */}
          <DeckHoles
            holes={polygon.holes ?? []}
            selectedHoleIndex={selectedHoleIndex}
            hoverHoleIndex={hoverHoleIndex}
            isSubView={isSubView}
            isEditable={isEditable}
            isHoleMoving={isHoleMoving}
            onHoleEnter={setHoverHoleIndex}
            onHoleLeave={(idx) => setHoverHoleIndex((prev) => (prev === idx ? null : prev))}
            onHoleDown={(holeIndex, e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedHoleIndex(holeIndex);
              if (!isEditable || !onChangePolygon) return;
              if (activeTool === "delete") return;
              if (e.button !== 0) return;
              const world = toWorldCoords(e.clientX, e.clientY);
              if (!world) return;
              const currentHole = (polygon.holes?.[holeIndex] ?? []).map((p) => ({ ...p }));
              holeMoveDragRef.current = {
                pointerId: e.pointerId,
                holeIndex,
                startWorld: world,
                startHole: currentHole,
                startMeta: cutoutsMeta?.[holeIndex] ? { ...cutoutsMeta[holeIndex] } : undefined,
                lastValidHole: currentHole,
                lastValidMeta: cutoutsMeta?.[holeIndex] ? { ...cutoutsMeta[holeIndex] } : undefined,
              };
              setIsHoleMoving(true);
              svgRef.current?.setPointerCapture?.(e.pointerId);
            }}
          />

          {/* Draft cutout (rectangle/circle drag) */}
          {draftCutoutPoints && draftCutoutPoints.length >= 2 && (
            <polygon
              points={draftCutoutPoints.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
              fill="rgba(255,107,107,0.12)"
              stroke="#ff6b6b"
              strokeWidth={3}
              strokeDasharray="8,6"
              pointerEvents="none"
            />
          )}

          <DeckHoleEdgeHandles
            holes={polygon.holes ?? []}
            cutoutsMeta={cutoutsMeta ?? []}
            selectedHoleIndex={selectedHoleIndex}
            isEditable={isEditable && activeTool !== "cutout"}
            onCornerDown={(holeIndex, corner, e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!cutoutsMeta || !cutoutsMeta[holeIndex]) return;
              const world = toWorldCoords(e.clientX, e.clientY);
              if (!world) return;
              const meta = cutoutsMeta[holeIndex];

              // Calculate the fixed corner (opposite corner)
              const halfW = meta.widthMm / 2;
              const halfH = meta.heightMm / 2;
              let fixedCorner: { x: number; y: number };

              if (corner === "top-left") {
                fixedCorner = { x: meta.xMm + halfW, y: meta.yMm + halfH };
              } else if (corner === "top-right") {
                fixedCorner = { x: meta.xMm - halfW, y: meta.yMm + halfH };
              } else if (corner === "bottom-left") {
                fixedCorner = { x: meta.xMm + halfW, y: meta.yMm - halfH };
              } else {
                // bottom-right
                fixedCorner = { x: meta.xMm - halfW, y: meta.yMm - halfH };
              }

              holeCornerDragRef.current = {
                pointerId: e.pointerId,
                holeIndex,
                corner,
                startWorld: world,
                startMeta: { ...meta },
                fixedCorner,
              };
              svgRef.current?.setPointerCapture?.(e.pointerId);
            }}
            onEdgeDown={(holeIndex, edge, e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!cutoutsMeta || !cutoutsMeta[holeIndex]) return;
              const world = toWorldCoords(e.clientX, e.clientY);
              if (!world) return;
              const meta = cutoutsMeta[holeIndex];

              holeEdgeDragRef.current = {
                pointerId: e.pointerId,
                holeIndex,
                edge,
                startWorld: world,
                startMeta: { ...meta },
              };
              svgRef.current?.setPointerCapture?.(e.pointerId);
            }}
          />

          <DeckVertexHandles
            outerPoints={polygon.outer}
            holes={polygon.holes}
            selectedHoleIndex={selectedHoleIndex}
            activeTool={activeTool}
            isEditable={isEditable}
            isCircle={isCircle}
            onVertexDown={(i: number, e: React.PointerEvent) => startDrag(i)(e)}
            onHoleVertexDown={(hIdx, vIdx, e) => {
              e.preventDefault();
              e.stopPropagation();
              holeVertexDragRef.current = {
                pointerId: e.pointerId,
                holeIndex: hIdx,
                vertexIndex: vIdx,
              };
              svgRef.current?.setPointerCapture?.(e.pointerId);
            }}
          />

          {enableEdgeControls && (
            <DeckEdgeControls
              edgeHandles={edgeHandles}
              attachedEdgeIndices={attachedEdgeIndices}
              fasciaEdgeIndices={fasciaEdgeIndices}
              activeTool={activeTool}
              hoverEdgeId={hoverEdgeId}
              activeEdgeId={activeEdgeId}
              isEdgeDragging={isEdgeDragging}
              onEdgeDown={(handle: EdgeHandle, e: React.PointerEvent) => startEdgeDrag(handle)(e)}
              onEdgeEnter={(id: string) => setHoverEdgeId(id)}
              onEdgeLeave={(id: string) => {
                if (!isEdgeDragging || activeEdgeId !== id) {
                  setHoverEdgeId((current) => (current === id ? null : current));
                }
              }}
              showAddHelpers={activeTool === "add"}
              polygonOuter={polygon.outer}
              onUpdateHoverAdd={(idx: number, x: number, y: number) =>
                updateHoverAddHandle(idx, x, y)
              }
              onLeaveHoverAdd={() => {
                setHoverAddEdgeIndex((current: number | null) =>
                  current !== null ? null : current,
                );
                setHoverAddPoint(null);
              }}
              hoverAddHandle={
                activeTool === "add" && hoverAddEdgeIndex !== null && hoverAddPoint
                  ? {
                      id: `add-${hoverAddEdgeIndex}`,
                      position: hoverAddPoint,
                      insertIndex: hoverAddEdgeIndex + 1,
                    }
                  : null
              }
              onAddHandleClick={(
                idx: number,
                pos: { x: number; y: number },
                e: React.PointerEvent,
              ) => {
                if (handleAddHandleClick) handleAddHandleClick(idx, pos)(e);
              }}
            />
          )}

          {/* Circle radius handle removed: resize by dragging the outline */}
        </g>

        {/* 텍스트 라벨들 - 꼭지점 알파벳 라벨은 표시하지 않음 */}

        {!isCircle &&
          edgeLabels.map((edge) => {
            const pos = transformPoint(edge.position.x, edge.position.y);
            return (
              <g key={`edge-label-${edge.id}`} style={{ cursor: "default" }}>
                <text
                  x={pos.x}
                  y={pos.y}
                  fontSize={suggestedEdgeFontUser}
                  fill="#0b2540"
                  textAnchor="middle"
                  pointerEvents="none"
                  style={{ cursor: "default" }}
                  transform={`rotate(${edge.rotationDeg}, ${pos.x}, ${pos.y})`}
                >
                  {edge.text}
                </text>
              </g>
            );
          })}

        {isSubView && (
          <text x={viewBox.x + 20} y={viewBox.y + 30} fill="#555" fontSize={20}>
            하부 구조 보기
          </text>
        )}
        {isCutPlanView && (
          <text x={viewBox.x + 20} y={viewBox.y + 30} fill="#555" fontSize={20}>
            재단 계획 보기
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
            onClick={() => {
              setActiveTool(null);
              setHoverAddEdgeIndex(null);
              setHoverAddPoint(null);
            }}
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

      <CanvasControlsTopLeft
        controls={[
          {
            key: "add",
            label: "추가",
            onClick: () => {
              setActiveTool((prev) => (prev === "add" ? null : "add"));
              setHoverAddEdgeIndex(null);
              setHoverAddPoint(null);
            },
            active: activeTool === "add",
            activeColor: "#2463ff",
            activeBg: "#e6f0ff",
          },
          {
            key: "delete",
            label: "삭제",
            onClick: () => {
              setActiveTool((prev) => (prev === "delete" ? null : "delete"));
              setHoverAddEdgeIndex(null);
              setHoverAddPoint(null);
            },
            active: activeTool === "delete",
            activeColor: "#c52222",
            activeBg: "#ffe6e6",
          },
          {
            key: "clear",
            label: "지우기",
            onClick: handleClear,
          },
        ]}
      />

      {polygon.outer.length >= 3 && areaM2 > 0 && (
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

      <CanvasControlsBottomLeft
        controls={[
          {
            key: "undo",
            label: "실행취소",
            onClick: handleUndo,
            disabled: !canUndo,
          },
          {
            key: "redo",
            label: "다시실행",
            onClick: handleRedo,
            disabled: !canRedo,
          },
        ]}
      />

      {/* 재단 계획 범례 (좌측 하단) */}
      {isCutPlanView && cutPlanLegend && cutPlanLegend.items.length > 0 && (
        <div
          style={{
            position: "absolute",
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
            padding: CANVAS_CONTROLS_STYLE.container.padding,
            background: CANVAS_CONTROLS_STYLE.container.background,
            borderRadius: CANVAS_CONTROLS_STYLE.container.borderRadius,
            boxShadow: CANVAS_CONTROLS_STYLE.container.boxShadow,
            pointerEvents: "none",
            zIndex: 2,
            minWidth: 220,
            maxWidth: 260,
            maxHeight: 240,
            overflow: "hidden",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#333", marginBottom: 6 }}>
            재단 계획 · 길이별 개수
          </div>

          <div style={{ display: "grid", gap: 4, maxHeight: 180, overflowY: "auto" }}>
            {cutPlanLegend.items.map((it) => (
              <div
                key={it.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 14,
                      height: 10,
                      background: it.color,
                      border: "1px solid rgba(0,0,0,0.25)",
                      borderRadius: 2,
                      flex: "0 0 auto",
                    }}
                  />
                  <span style={{ fontSize: 12, color: "#333" }}>{it.label}</span>
                </div>
                <span style={{ fontSize: 12, color: "#111", fontWeight: 700 }}>{it.count}개</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 8, borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 6 }}>
            <div style={{ fontSize: 12, color: "#444" }}>
              합계: <b>{cutPlanLegend.totalPieces.toLocaleString()}</b>개
            </div>
            <div style={{ fontSize: 12, color: "#444" }}>
              보드수(대략): <b>{cutPlanLegend.boardsApprox.toLocaleString()}장</b>{" "}
              <span style={{ opacity: 0.8 }}>
                (총 {Math.round(cutPlanLegend.totalLengthMm).toLocaleString()}mm ÷{" "}
                {cutPlanLegend.stockLengthMm.toLocaleString()}mm)
              </span>
            </div>
          </div>
        </div>
      )}

      <CanvasControlsBottomRight
        controls={[
          {
            key: "view-mode-toggle",
            label: `${viewModeLabel[nextViewMode]}로 전환`,
            onClick: onToggleViewMode || (() => {}),
            disabled: !onToggleViewMode,
          },
        ]}
      />

      <CanvasControlsCenter controls={controls} />
    </div>
  );
}
