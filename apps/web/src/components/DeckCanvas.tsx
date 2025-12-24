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
import type { Polygon, StructureLayout } from "@deck/core";
import {
  collectEdgeHandles,
  computeEdgeLimits,
  EDGE_LENGTH_STEP_MM,
  MIN_EDGE_SPAN_MM,
  type EdgeHandle,
} from "../geometry/edges";
import {
  isPointInsidePolygon,
  polygonCentroid,
} from "../geometry/polygon";
import { circleSegmentsForSagitta } from "../geometry/shapes";

import { DeckGrid } from "./deck-canvas/DeckGrid";
import { DeckPolygon } from "./deck-canvas/DeckPolygon";
import { DeckVertexHandles } from "./deck-canvas/DeckVertexHandles";
import { DeckEdgeControls } from "./deck-canvas/DeckEdgeControls";
import { DeckHoles } from "./deck-canvas/DeckHoles";

import type { ShapeType, CutoutShape } from "../types";

export type ViewMode = "deck" | "substructure";
type PlanPoint = { xMm: number; yMm: number };

type CutoutMode = { enabled: boolean; shape: CutoutShape };

const VIEWBOX = { width: 2000, height: 1200 };
const EPS = 1e-3;
const EDGE_DRAG_SPEED_FACTOR = 0.5; // 변 드래그 속도 조절 (1.0 = 원래 속도, 0.5 = 50% 속도)

// 모든 도형의 시각적 설정을 한 곳에서 관리 (직사각형 기준)
const POLYGON_STYLE = {
  stroke: "#5af",
  strokeWidth: { normal: 4, subView: 2 },
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
  attachedEdgeIndices,
  onChangeAttachedEdgeIndices,
  onToggleViewMode,
  cutoutMode,
  onChangeCutoutMode,
}: {
  polygon: Polygon;
  viewMode: ViewMode;
  onChangePolygon?: (polygon: Polygon) => void;
  onSelectShape?: (shapeId: string) => void;
  structureLayout?: StructureLayout;
  shapeType?: ShapeType;
  attachedEdgeIndices?: number[];
  onChangeAttachedEdgeIndices?: (next: number[]) => void;
  onToggleViewMode?: () => void;
  cutoutMode?: CutoutMode;
  onChangeCutoutMode?: (next: CutoutMode) => void;
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
  }); const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [isEdgeDragging, setIsEdgeDragging] = useState(false);
  const [activeTool, setActiveTool] = useState<"add" | "delete" | "wall" | "cutout" | null>(null);
  const [hoverAddEdgeIndex, setHoverAddEdgeIndex] = useState<number | null>(null);
  const [hoverAddPoint, setHoverAddPoint] = useState<{ x: number; y: number } | null>(null);
  const [svgPxSize, setSvgPxSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [cutoutShape, setCutoutShape] = useState<CutoutShape>("rectangle");
  const [selectedHoleIndex, setSelectedHoleIndex] = useState<number | null>(null);
  const [hoverHoleIndex, setHoverHoleIndex] = useState<number | null>(null);
  const [isHoleMoving, setIsHoleMoving] = useState(false);
  const holeVertexDragRef = useRef<{ pointerId: number; holeIndex: number; vertexIndex: number } | null>(null);
  const holeMoveDragRef = useRef<{
    pointerId: number;
    holeIndex: number;
    startWorld: { x: number; y: number };
    startHole: PlanPoint[];
  } | null>(null);
  const cutoutDragRef = useRef<{ pointerId: number; shape: Exclude<CutoutShape, "free">; startWorld: { x: number; y: number } } | null>(null);
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
  const { undo: handleUndo, redo: handleRedo, canUndo, canRedo } = useUndoRedo(
    polygon,
    onChangePolygon ?? (() => { }),
    { isEqual: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );

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
  const [isCircleOutlineHovered, setIsCircleOutlineHovered] = useState(false);
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

  const [hoverVertexIndex, setHoverVertexIndex] = useState<number | null>(null);

  // Utility: polygon의 점 개수와 패턴으로 도형 타입 판단
  const detectShapeInfo = (points: { xMm: number; yMm: number }[], _isClosed: boolean, shapeType?: ShapeType) => {
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
    b: { x: number; y: number }
  ) => {
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const abLenSq = ab.x * ab.x + ab.y * ab.y;
    if (abLenSq < EPS) return a;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / abLenSq));
    return { x: a.x + ab.x * t, y: a.y + ab.y * t };
  };

  const isEditable = typeof onChangePolygon === "function";
  const isSubView = viewMode === "substructure";

  // polygon 기반으로 도형 정보 판단
  const shapeInfo = useMemo(() => {
    const info = detectShapeInfo(polygon.outer, true, shapeType);
    return info;
  }, [polygon.outer, shapeType]);

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

  const controls = [
    { key: "rotate", label: "회전", onClick: () => setRotation((prev) => (prev + 15) % 360) },
    { key: "center", label: "중앙 맞추기", onClick: centerView },
    { key: "zoom-out", label: "축소", onClick: () => setScale((prev) => Math.max(0.2, prev * 0.9)) },
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
  const suggestedEdgeFontUser = useMemo(() => 20 / pixelsPerUnit, [pixelsPerUnit]);



  const isCircle = useMemo(() => shapeType === "circle" && polygon.outer.length >= 3, [shapeType, polygon.outer.length]);
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
    const sum = pts.reduce((acc, p) => acc + Math.hypot(p.xMm - circleCenter.x, p.yMm - circleCenter.y), 0);
    return sum / pts.length;
  }, [isCircle, circleCenter, polygon.outer]);

  // 원 반지름 드래그 속도 계수 (커서 이동 대비 반지름 변화 비율). 값이 작을수록 천천히 변함.
  const CIRCLE_RADIUS_DRAG_SPEED = 0.35;

  const buildCirclePolygon = useCallback((center: { x: number; y: number }, radiusMm: number, segments = 16) => {
    const pts: { xMm: number; yMm: number }[] = [];
    const r = Math.max(radiusMm, 0);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ xMm: center.x + Math.cos(a) * r, yMm: center.y + Math.sin(a) * r });
    }
    return pts;
  }, []);

  const isPointInsideOuter = useCallback(
    (p: PlanPoint) => {
      if (polygon.outer.length < 3) return false;
      return isPointInsidePolygon({ x: p.xMm, y: p.yMm }, polygon.outer);
    },
    [polygon.outer]
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
    [isPointInsideOuter, onChangePolygon, polygon]
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
    [isPointInsideOuter, onChangePolygon, polygon]
  );

  const edgeHandles = useMemo(() => {
    if (!enableEdgeControls) return [];
    return collectEdgeHandles(polygon.outer);
  }, [enableEdgeControls, polygon.outer]);



  const addHandles = useMemo(() => {
    if (!isEditable || activeTool !== "add") return [];
    if (hoverAddEdgeIndex === null || !hoverAddPoint) return [];
    const pts = polygon.outer;
    if (pts.length < 2) return [];
    const i = hoverAddEdgeIndex % pts.length;
    const nextIndex = (i + 1) % pts.length;
    // 새 점은 i번째 점과 nextIndex번째 점 사이에 삽입
    // nextIndex가 0이면 마지막 점과 첫 점 사이이므로 배열 끝에 추가
    // 그렇지 않으면 nextIndex 위치에 삽입
    const insertIndex = nextIndex === 0 ? pts.length : nextIndex;
    return [{ id: `add-handle-${i}`, insertIndex, position: hoverAddPoint }];
  }, [activeTool, hoverAddEdgeIndex, hoverAddPoint, isEditable, polygon.outer]);

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

      // Hole move drag (drag inside cutout to move whole hole)
      if (holeMoveDragRef.current && onChangePolygon) {
        const drag = holeMoveDragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;

        const dx = world.x - drag.startWorld.x;
        const dy = world.y - drag.startWorld.y;
        const moved = drag.startHole.map((p) => ({ xMm: p.xMm + dx, yMm: p.yMm + dy }));
        if (!moved.every(isPointInsideOuter)) return;

        const holes = polygon.holes ?? [];
        const nextHoles = holes.map((h, i) => (i === drag.holeIndex ? moved : h));
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
          drag.limits.maxDelta
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
          idx === dragIndex ? { xMm: snappedX, yMm: snappedY } : pt
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
    ]
  );

  const handlePointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    const svg = svgRef.current;
    if (circleDragActiveRef.current) {
      circleDragActiveRef.current = false;
    }
    if (circleRadiusDragRef.current && event.pointerId === circleRadiusDragRef.current.pointerId) {
      // 요구사항:
      // - 드래그 중에는 캔버스 밖으로 커져도 OK (반지름/면적 변경)
      // - 드래그를 놓는 순간에는 반지름은 고정(종료 스냅만), 화면(viewBox/줌)만 원에 맞게 재조정
      if (onChangePolygon) {
        const drag = circleRadiusDragRef.current;
        // 1) 현재 반지름을 확정 (종료 시에만 10mm 스냅)
        const pts = polygon.outer;
        const currentRadius =
          pts.length > 0
            ? pts.reduce((acc, p) => acc + Math.hypot(p.xMm - drag.center.x, p.yMm - drag.center.y), 0) / pts.length
            : drag.startRadius;
        const snappedRadius = Math.max(
          MIN_EDGE_SPAN_MM,
          Math.round(currentRadius / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM
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
    }

    if (holeVertexDragRef.current && event.pointerId === holeVertexDragRef.current.pointerId) {
      if (svg && svg.hasPointerCapture?.(holeVertexDragRef.current.pointerId)) {
        svg.releasePointerCapture(holeVertexDragRef.current.pointerId);
      }
      holeVertexDragRef.current = null;
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
    }

    onPanEnd(event);

  }, [buildCirclePolygon, dragIndex, onChangePolygon, polygon, appendHole, draftCutoutPoints]);

  const startDrag = useCallback(
    (idx: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
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
        return;
      }

      if (!allowVertexDrag) return;

      event.preventDefault();
      event.stopPropagation();
      pointerIdRef.current = event.pointerId;
      svgRef.current?.setPointerCapture?.(event.pointerId);
      setDragIndex(idx);
      // 원형 드래그는 더 이상 특별 처리하지 않음
    },
    [activeTool, isEditable, onChangePolygon, polygon, shapeInfo]
  );

  const startEdgeDrag = useCallback(
    (handle: EdgeHandle) => (event: ReactPointerEvent<SVGLineElement>) => {
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
      svgRef.current?.setPointerCapture?.(event.pointerId);
    },
    [activeTool, attachedEdgeIndices, enableEdgeControls, isEditable, onChangeAttachedEdgeIndices, onChangePolygon, polygon.outer, toWorldCoords]
  );

  const updateHoverAddHandle = useCallback(
    (edgeIndex: number, clientX: number, clientY: number) => {
      if (activeTool !== "add") return;
      const world = toWorldCoords(clientX, clientY);
      if (!world) return;
      const pts = polygon.outer;
      const start = pts[edgeIndex];
      const end = pts[(edgeIndex + 1) % pts.length];
      const projected = projectPointToSegment(world, { x: start.xMm, y: start.yMm }, { x: end.xMm, y: end.yMm });
      setHoverAddEdgeIndex(edgeIndex);
      setHoverAddPoint(projected);
    },
    [activeTool, polygon.outer, toWorldCoords]
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
        pointerIdRef.current = event.pointerId;
        svgRef.current?.setPointerCapture?.(event.pointerId);
        setDragIndex(insertIndex);
      },
    [isEditable, onChangePolygon, polygon]
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
          cutoutDragRef.current = { pointerId: event.pointerId, shape: cutoutShape, startWorld: world };
          svgRef.current?.setPointerCapture?.(event.pointerId);
          setDraftCutoutPoints(null);
        }
        return;
      }

      // Always try to start pan (will be filtered in startPan)
      startPan(event);
    },
    [
      activeTool,
      appendHole,
      cutoutShape,
      isEditable,
      onChangePolygon,
      startPan,
      toWorldCoords,
    ]
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
          <DeckGrid viewBox={viewBox} />
          {/* Substructure Rendering */}
          {isSubView && structureLayout && (
            <g pointerEvents="none">
              {/* Bearers (Primary) - 굵은 선, 갈색 */}
              {structureLayout.bearers.map((b, i) => (
                <line
                  key={`bearer-${i}`}
                  x1={b.x1}
                  y1={b.y1}
                  x2={b.x2}
                  y2={b.y2}
                  stroke="#8B4513"
                  strokeWidth={10}
                  strokeOpacity={0.8}
                  strokeLinecap="square"
                />
              ))}
              {/* Joists (Secondary) - 얇은 선, 회색 */}
              {structureLayout.joists.map((j, i) => (
                <line
                  key={`joist-${i}`}
                  x1={j.x1}
                  y1={j.y1}
                  x2={j.x2}
                  y2={j.y2}
                  stroke="#666"
                  strokeWidth={4}
                  strokeOpacity={0.9}
                />
              ))}
              {/* Piles - 원형, 검정 */}
              {structureLayout.piles.map((p, i) => (
                <circle
                  key={`pile-${i}`}
                  cx={p.xMm}
                  cy={p.yMm}
                  r={15}
                  fill="#333"
                  stroke="none"
                  opacity={0.8}
                />
              ))}
            </g>
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
                  : POLYGON_STYLE.fill.normal,
              stroke: POLYGON_STYLE.stroke,
              strokeWidth: isSubView ? POLYGON_STYLE.strokeWidth.subView : POLYGON_STYLE.strokeWidth.normal,
              strokeLinejoin: POLYGON_STYLE.strokeLinejoin,
              strokeLinecap: POLYGON_STYLE.strokeLinecap,
              opacity: isSubView ? POLYGON_STYLE.opacity.subView : POLYGON_STYLE.opacity.normal,
              cutoutFill: "#fafafa",
              cutoutStroke: "#ff6b6b",
            }}
            onCircleOutlineEnter={() => setIsCircleOutlineHovered(true)}
            onCircleOutlineLeave={() => setIsCircleOutlineHovered(false)}
            onCircleOutlineDown={(e) => {
              if (!onChangePolygon) return;
              const world = toWorldCoords(e.clientX, e.clientY);
              if (!world) return;
              e.preventDefault();
              e.stopPropagation();
              circleDragActiveRef.current = true;
              const startRawRadius = Math.hypot(
                world.x - (circleCenter?.x || 0),
                world.y - (circleCenter?.y || 0)
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
              holeMoveDragRef.current = {
                pointerId: e.pointerId,
                holeIndex,
                startWorld: world,
                startHole: (polygon.holes?.[holeIndex] ?? []).map((p) => ({ ...p })),
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

          <DeckVertexHandles
            outerPoints={polygon.outer}
            holes={polygon.holes}
            hoverVertexIndex={hoverVertexIndex}
            dragVertexIndex={dragIndex}
            hoverHoleIndex={hoverHoleIndex}
            selectedHoleIndex={selectedHoleIndex}
            activeTool={activeTool}
            isEditable={isEditable}
            onVertexDown={(i: number, e: React.PointerEvent) => startDrag(i)(e as any)}
            onVertexEnter={() => { }}
            onVertexLeave={() => { }}
            onHoleVertexDown={(hIdx, vIdx, e) => {
              e.preventDefault();
              e.stopPropagation();
              holeVertexDragRef.current = { pointerId: e.pointerId, holeIndex: hIdx, vertexIndex: vIdx };
              svgRef.current?.setPointerCapture?.(e.pointerId);
            }}
            onHoleVertexEnter={(hIdx) => setHoverHoleIndex(hIdx)}
            onHoleVertexLeave={(hIdx) => setHoverHoleIndex((prev) => (prev === hIdx ? null : prev))}
          />

          {enableEdgeControls && (
            <DeckEdgeControls
              edgeHandles={edgeHandles}
              attachedEdgeIndices={attachedEdgeIndices}
              activeTool={activeTool}
              hoverEdgeId={hoverEdgeId}
              activeEdgeId={activeEdgeId}
              isEdgeDragging={isEdgeDragging}
              onEdgeDown={(handle: EdgeHandle, e: React.PointerEvent) => startEdgeDrag(handle)(e as any)}
              onEdgeEnter={(id: string) => setHoverEdgeId(id)}
              onEdgeLeave={(id: string) => {
                if (!isEdgeDragging || activeEdgeId !== id) {
                  setHoverEdgeId((current) => (current === id ? null : current));
                }
              }}
              showAddHelpers={activeTool === "add"}
              polygonOuter={polygon.outer}
              onUpdateHoverAdd={(idx: number, x: number, y: number) => updateHoverAddHandle(idx, x, y)}
              onLeaveHoverAdd={() => {
                setHoverAddEdgeIndex((current: number | null) => (current !== null ? null : current));
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
              onAddHandleClick={(idx: number, pos: { x: number, y: number }, e: React.PointerEvent) => {
                if (handleAddHandleClick) handleAddHandleClick(idx, pos)(e as any);
              }}
            />
          )}

          {/* Circle radius handle removed: resize by dragging the outline */}

        </g>

        {/* 텍스트 라벨들 - 꼭지점 알파벳 라벨은 표시하지 않음 */}

        {!isCircle && edgeLabels.map((edge) => {
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


      <div
        style={{
          position: "absolute",
          left: 16,
          top: 16,
          display: "flex",
          gap: 8,
          background: "rgba(255,255,255,0.92)",
          padding: "8px 10px",
          borderRadius: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          pointerEvents: "auto",
          zIndex: 2,
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveTool((prev) => (prev === "add" ? null : "add"));
            setHoverAddEdgeIndex(null);
            setHoverAddPoint(null);
          }}
          style={{
            minWidth: 72,
            height: 28,
            padding: "6px 10px",
            borderRadius: 6,
            border: activeTool === "add" ? "2px solid #2463ff" : "1px solid #ccc",
            background: activeTool === "add" ? "#e6f0ff" : "#fff",
            color: activeTool === "add" ? "#2463ff" : "#111",
            fontSize: 12,
            fontWeight: activeTool === "add" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          추가
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTool((prev) => (prev === "delete" ? null : "delete"));
            setHoverAddEdgeIndex(null);
            setHoverAddPoint(null);
          }}
          style={{
            minWidth: 72,
            height: 28,
            padding: "6px 10px",
            borderRadius: 6,
            border: activeTool === "delete" ? "2px solid #c52222" : "1px solid #ccc",
            background: activeTool === "delete" ? "#ffe6e6" : "#fff",
            color: "#c52222",
            fontSize: 12,
            fontWeight: activeTool === "delete" ? 600 : 400,
            cursor: "pointer",
          }}
        >
          삭제
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTool((prev) => (prev === "wall" ? null : "wall"));
            setHoverAddEdgeIndex(null);
            setHoverAddPoint(null);
          }}
          style={{
            minWidth: 72,
            height: 28,
            padding: "6px 10px",
            borderRadius: 6,
            border: activeTool === "wall" ? "2px solid #444" : "1px solid #ccc",
            background: activeTool === "wall" ? "#eee" : "#fff",
            color: "#111",
            fontSize: 12,
            fontWeight: activeTool === "wall" ? 700 : 400,
            cursor: "pointer",
          }}
          title="벽체(ledger)로 고정할 변을 클릭해서 선택/해제"
        >
          벽체
        </button>

        <button
          type="button"
          onClick={() => {
            const nextEnabled = activeTool !== "cutout";
            setActiveTool(nextEnabled ? "cutout" : null);
            setHoverAddEdgeIndex(null);
            setHoverAddPoint(null);
            setDraftCutoutPoints(null);
            onChangeCutoutMode?.({ enabled: nextEnabled, shape: cutoutShape });
          }}
          style={{
            minWidth: 72,
            height: 28,
            padding: "6px 10px",
            borderRadius: 6,
            border: activeTool === "cutout" ? "2px solid #ff6b6b" : "1px solid #ccc",
            background: activeTool === "cutout" ? "#fff1f1" : "#fff",
            color: activeTool === "cutout" ? "#ff6b6b" : "#111",
            fontSize: 12,
            fontWeight: activeTool === "cutout" ? 800 : 500,
            cursor: "pointer",
          }}
          title="컷아웃 추가 모드(사각형/원형)는 왼쪽 패널에서 선택"
        >
          컷아웃
        </button>
      </div>

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

      {/* Undo/Redo buttons - bottom left */}
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 16,
          display: "flex",
          gap: 8,
          padding: "8px 10px",
          background: "rgba(255,255,255,0.92)",
          borderRadius: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          pointerEvents: "auto",
          zIndex: 2,
        }}
      >
        <button
          type="button"
          onClick={handleUndo}
          disabled={!canUndo}
          title="실행 취소 (Ctrl+Z)"
          style={{
            minWidth: 72,
            height: 28,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #ccc",
            background: canUndo ? "#fff" : "#f5f5f5",
            color: canUndo ? "#111" : "#999",
            fontSize: 12,
            fontWeight: 400,
            cursor: canUndo ? "pointer" : "not-allowed",
          }}
        >
          실행취소
        </button>
        <button
          type="button"
          onClick={handleRedo}
          disabled={!canRedo}
          title="다시 실행 (Ctrl+Shift+Z)"
          style={{
            minWidth: 72,
            height: 28,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #ccc",
            background: canRedo ? "#fff" : "#f5f5f5",
            color: canRedo ? "#111" : "#999",
            fontSize: 12,
            fontWeight: 400,
            cursor: canRedo ? "pointer" : "not-allowed",
          }}
        >
          다시실행
        </button>
      </div>

      {/* View mode toggle - bottom right */}
      <div
        style={{
          position: "absolute",
          right: 16,
          bottom: 16,
          display: "flex",
          gap: 8,
          padding: "8px 10px",
          background: "rgba(255,255,255,0.92)",
          borderRadius: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          pointerEvents: "auto",
          zIndex: 2,
        }}
      >
        <button
          type="button"
          onClick={onToggleViewMode}
          disabled={!onToggleViewMode}
          style={{
            minWidth: 92,
            height: 28,
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #ccc",
            background: onToggleViewMode ? "#fff" : "#f5f5f5",
            color: "#333",
            fontSize: 12,
            fontWeight: 600,
            cursor: onToggleViewMode ? "pointer" : "not-allowed",
          }}
          title="상판/하부 구조 보기 전환"
        >
          {viewMode === "deck" ? "하부 보기" : "상판 보기"}
        </button>
      </div>

      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 16,
          transform: "translateX(-50%)",
          display: "flex",
          gap: 8,
          flexWrap: "nowrap",
          justifyContent: "center",
          padding: "8px 10px",
          background: "rgba(255,255,255,0.9)",
          borderRadius: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          pointerEvents: "auto",
          maxWidth: "calc(100% - 24px)",
          overflowX: "auto",
          zIndex: 2,
        }}
      >
        {controls.map((control) => (
          <button
            key={control.key}
            onClick={control.onClick}
            style={{
              minWidth: 82,
              height: 27,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: "#fff",
              color: "#333",
              fontSize: 12,
              cursor: "pointer",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)",
            }}
          >
            {control.label}
          </button>
        ))}
      </div>
    </div>
  );
}
