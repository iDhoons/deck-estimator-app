import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { Polygon, StructureLayout } from "@deck/core";
import {
  collectEdgeHandles,
  computeEdgeLimits,
  EDGE_LENGTH_STEP_MM,
  MIN_EDGE_SPAN_MM,
  updateEdgeLength,
  type EdgeHandle,
} from "../geometry/edges";
import {
  distanceSquared,
  indexToLabel,
  isPointInsidePolygon,
  normalize,
  polygonCentroid,
  polygonSignedArea,
} from "../geometry/polygon";

export type ViewMode = "deck" | "substructure";
type PlanPoint = { xMm: number; yMm: number };

type ShapeType = "rectangle" | "lShape" | "tShape" | "circle" | "free";

const VIEWBOX = { width: 2000, height: 1200 };
const EPS = 1e-3;
const GRID_SIZE = 100; // 100mm grid for free drawing snap
const GRID_DISPLAY_SIZE = 10; // 10mm grid for visual display
const EDGE_DRAG_SPEED_FACTOR = 0.5; // 변 드래그 속도 조절 (1.0 = 원래 속도, 0.5 = 50% 속도)
const DIAGONALS = [
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
];

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
function detectShapeInfo(points: PlanPoint[], isClosed: boolean, shapeType?: ShapeType): {
  isFree: boolean; // 자유형 (미완성 또는 점 개수가 특정 패턴이 아님)
  isClosed: boolean; // 완성된 폴리곤인지
  hasEdgeControls: boolean; // 엣지 컨트롤 사용 가능 (직사각형, L자형, T자형, 자유형)
} {
  // If shapeType is explicitly "free", trust it.
  // Unless it's closed via logic (isClosed=true), it's Open.
  // But wait, if it's "free" and closed, is it "isFree: true" or false?
  // The renderer uses isFree to decide between Polyline (open) and Polygon (closed).
  // If we return isFree: true, isClosed: true -> Polygon.
  // If we return isFree: true, isClosed: false -> Polyline.
  
  if (shapeType === "free") {
    return {
      isFree: true,
      isClosed: isClosed,
      hasEdgeControls: true,
    };
  }

  if (points.length === 0) {
    return { isFree: true, isClosed: false, hasEdgeControls: false };
  }
  
  const pointCount = points.length;
  const isPresetPattern = pointCount === 4 || pointCount === 6 || pointCount === 8;
  
  // 프리셋 형태(직사각형, L자형, T자형)는 항상 완성된 것으로 간주
  if (isPresetPattern) {
    return {
      isFree: false,
      isClosed: true,
      hasEdgeControls: true,
    };
  }
  
  // 원형(16개 점)도 완성된 것으로 간주, 하지만 변 드래그 불가
  if (pointCount === 16) {
    return {
      isFree: false,
      isClosed: true,
      hasEdgeControls: false,
    };
  }
  
  // 자유형: 점 개수가 프리셋 패턴이 아님
  // 자유형에서도 변 드래그 가능하므로 hasEdgeControls: true
  if (!isClosed) {
    return { isFree: true, isClosed: false, hasEdgeControls: true };
  }
  
  return {
    isFree: true,
    isClosed: true,
    hasEdgeControls: true, // 자유형에서도 변 드래그 가능
  };
}

function snapToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

function projectPointToSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const abLenSq = ab.x * ab.x + ab.y * ab.y;
  if (abLenSq < EPS) return a;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * ab.x + (point.y - a.y) * ab.y) / abLenSq));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

export function DeckCanvas({
  polygon,
  viewMode,
  onChangePolygon,
  onSelectShape: _onSelectShape,
  structureLayout,
  shapeType,
}: {
  polygon: Polygon;
  viewMode: ViewMode;
  onChangePolygon?: (polygon: Polygon) => void;
  onSelectShape?: (shapeId: string) => void;
  structureLayout?: StructureLayout;
  shapeType?: ShapeType;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, w: VIEWBOX.width, h: VIEWBOX.height });
  const panPointerIdRef = useRef<number | null>(null);
  const panStartClientRef = useRef<{ x: number; y: number } | null>(null);
  const panStartViewBoxRef = useRef<{ x: number; y: number } | null>(null);
  const panScaleRef = useRef<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [isEdgeDragging, setIsEdgeDragging] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<{ x: number; y: number } | null>(null);
  const [isFreePolygonClosed, setIsFreePolygonClosed] = useState(false);
  const [activeTool, setActiveTool] = useState<"add" | "delete" | null>(null);
  const [hoverAddEdgeIndex, setHoverAddEdgeIndex] = useState<number | null>(null);
  const [hoverAddPoint, setHoverAddPoint] = useState<{ x: number; y: number } | null>(null);
  const [svgPxSize, setSvgPxSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [typedLength, setTypedLength] = useState("");

  // Undo/Redo history management
  const [history, setHistory] = useState<Polygon[]>([polygon]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoAction = useRef(false);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // Update history when polygon changes (except during undo/redo)
  useEffect(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    // Check if polygon actually changed
    const currentPolygon = history[historyIndex];
    const isSame =
      currentPolygon.outer.length === polygon.outer.length &&
      currentPolygon.outer.every(
        (pt, i) => pt.xMm === polygon.outer[i].xMm && pt.yMm === polygon.outer[i].yMm
      );
    if (isSame) return;

    // Add new state to history, truncate any redo states
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(polygon);
    // Limit history to 50 states
    if (newHistory.length > 50) {
      newHistory.shift();
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    } else {
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [polygon, history, historyIndex]);

  const handleUndo = useCallback(() => {
    if (!canUndo || !onChangePolygon) return;
    isUndoRedoAction.current = true;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    onChangePolygon(history[newIndex]);
  }, [canUndo, historyIndex, history, onChangePolygon]);

  const handleRedo = useCallback(() => {
    if (!canRedo || !onChangePolygon) return;
    isUndoRedoAction.current = true;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    onChangePolygon(history[newIndex]);
  }, [canRedo, historyIndex, history, onChangePolygon]);

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
  } | null>(null);

  const isEditable = typeof onChangePolygon === "function";
  const isSubView = viewMode === "substructure";

  // polygon 기반으로 도형 정보 판단
  const shapeInfo = useMemo(() => {
    const info = detectShapeInfo(polygon.outer, isFreePolygonClosed, shapeType);
    return info;
  }, [polygon.outer, isFreePolygonClosed, shapeType]);

  // 프리셋 도형과 자유형 모두에서 변 드래그 가능
  const enableEdgeControls = isEditable && (shapeInfo.hasEdgeControls || shapeInfo.isFree);

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

  const centerView = useCallback(() => {
    // Calculate polygon bounding box
    if (polygon.outer.length === 0) {
      setViewBox({ x: 0, y: 0, w: VIEWBOX.width, h: VIEWBOX.height });
      setScale(1);
      setRotation(0);
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

    setViewBox({
      x: polygonCenterX - newWidth / 2,
      y: polygonCenterY - newHeight / 2,
      w: newWidth,
      h: newHeight,
    });
    setScale(1);
    setRotation(0);
  }, [polygon.outer]);

  const controls = [
    { key: "rotate", label: "회전", onClick: () => setRotation((prev) => (prev + 15) % 360) },
    { key: "center", label: "중앙 맞추기", onClick: centerView },
    { key: "zoom-out", label: "축소", onClick: () => setScale((prev) => Math.max(0.2, prev * 0.9)) },
    { key: "zoom-in", label: "확대", onClick: () => setScale((prev) => Math.min(5, prev * 1.1)) },
  ];

  const centerX = useMemo(() => viewBox.x + viewBox.w / 2, [viewBox]);
  const centerY = useMemo(() => viewBox.y + viewBox.h / 2, [viewBox]);
  const transformGroup = useMemo(
    () =>
      `translate(${centerX} ${centerY}) rotate(${rotation}) scale(${scale}) translate(${-centerX} ${-centerY})`,
    [centerX, centerY, rotation, scale]
  );

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
  const suggestedVertexFontUser = useMemo(() => 20 / pixelsPerUnit, [pixelsPerUnit]);
  const suggestedEdgeFontUser = useMemo(() => 20 / pixelsPerUnit, [pixelsPerUnit]);
  const edgeLabelBoxUser = useMemo(() => {
    // 화면에서 대략 120x30px 클릭 영역을 유지하도록 user unit로 환산
    return {
      padX: 60 / pixelsPerUnit,
      padY: 20 / pixelsPerUnit,
      w: 120 / pixelsPerUnit,
      h: 30 / pixelsPerUnit,
    };
  }, [pixelsPerUnit]);

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

  const isCircle = useMemo(() => shapeType === "circle" && polygon.outer.length === 16, [shapeType, polygon.outer.length]);
  const circleCenter = useMemo(() => {
    if (!isCircle) return null;
    const c = polygonCentroid(polygon.outer as any);
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

  const buildCirclePolygon = useCallback((center: { x: number; y: number }, radiusMm: number, segments = 16) => {
    const pts: { xMm: number; yMm: number }[] = [];
    const r = Math.max(radiusMm, 0);
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pts.push({ xMm: center.x + Math.cos(a) * r, yMm: center.y + Math.sin(a) * r });
    }
    return pts;
  }, []);

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

  const geometry = useMemo(() => {
    const pts = polygon.outer;
    const vertexLabels: { label: string; position: { x: number; y: number } }[] = [];
    const edgeLabels: { id: string; text: string; position: { x: number; y: number }; startIdx: number; endIdx: number; lengthInt: number }[] = [];
    let areaM2 = 0;
    if (pts.length < 2) {
      return { vertexLabels, edgeLabels, areaM2 };
    }

    const signedArea = polygonSignedArea(pts);
    // 면적 계산: mm²를 m²로 변환 (1m² = 1,000,000mm²)
    const areaMm2 = Math.abs(signedArea);
    areaM2 = areaMm2 / 1000000;
    
    const orientation = signedArea >= 0 ? 1 : -1;
    const centroid = polygonCentroid(pts);
    const vertexPositions: { x: number; y: number }[] = [];

    for (let i = 0; i < pts.length; i++) {
      const current = pts[i];
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const edgePrev = normalize({ x: current.xMm - prev.xMm, y: current.yMm - prev.yMm });
      const edgeNext = normalize({ x: next.xMm - current.xMm, y: next.yMm - current.yMm });
      const normalPrev =
        orientation >= 0
          ? { x: edgePrev.y, y: -edgePrev.x }
          : { x: -edgePrev.y, y: edgePrev.x };
      const normalNext =
        orientation >= 0
          ? { x: edgeNext.y, y: -edgeNext.x }
          : { x: -edgeNext.y, y: edgeNext.x };
      let outward = normalize({ x: normalPrev.x + normalNext.x, y: normalPrev.y + normalNext.y });
      if (Math.abs(outward.x) < EPS && Math.abs(outward.y) < EPS) {
        outward = normalize({
          x: current.xMm - centroid.xMm,
          y: current.yMm - centroid.yMm,
        });
      }
      let bestDiag = DIAGONALS[0];
      let bestDot = -Infinity;
      for (const diag of DIAGONALS) {
        const dot = outward.x * diag.x + outward.y * diag.y;
        if (dot > bestDot) {
          bestDot = dot;
          bestDiag = diag;
        }
      }
      let radius = 40;
      let labelPos = {
        x: current.xMm + bestDiag.x * radius,
        y: current.yMm + bestDiag.y * radius,
      };
      for (let attempt = 0; attempt < 4 && isPointInsidePolygon(labelPos, pts); attempt++) {
        radius += 20;
        labelPos = {
          x: current.xMm + bestDiag.x * radius,
          y: current.yMm + bestDiag.y * radius,
        };
      }
      // Don't clamp to viewBox - let labels be positioned freely relative to vertices
      vertexPositions.push(labelPos);
      vertexLabels.push({ label: indexToLabel(i), position: labelPos });
    }

    const usedEdgePositions: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const nextIndex = (i + 1) % pts.length;
      const start = pts[i];
      const end = pts[nextIndex];
      const dx = end.xMm - start.xMm;
      const dy = end.yMm - start.yMm;
      const lengthInt = Math.round(Math.hypot(dx, dy));
      const midpoint = {
        x: (start.xMm + end.xMm) / 2,
        y: (start.yMm + end.yMm) / 2,
      };
      let normal =
        orientation >= 0 ? normalize({ x: -dy, y: dx }) : normalize({ x: dy, y: -dx });
      if (Math.abs(normal.x) < EPS && Math.abs(normal.y) < EPS) {
        normal = { x: 0, y: -1 };
      }
      const horizontalish = Math.abs(dx) >= Math.abs(dy);
      let offsetDir: { x: number; y: number };
      if (horizontalish) {
        const sign = normal.y >= 0 ? 1 : -1;
        offsetDir = { x: 0, y: sign || 1 };
      } else {
        const sign = normal.x >= 0 ? 1 : -1;
        offsetDir = { x: sign || 1, y: 0 };
      }
      const baseOffset = 36;
      let offset = baseOffset;
      const adjustPosition = () => ({
        x: midpoint.x + offsetDir.x * offset,
        y: midpoint.y + offsetDir.y * offset,
      });
      let labelPos = adjustPosition();

      // If label is inside polygon, flip direction to place it outside
      if (isPointInsidePolygon(labelPos, pts)) {
        offsetDir = { x: -offsetDir.x, y: -offsetDir.y };
        labelPos = adjustPosition();
      }

      let attempts = 0;
      const needsMoreSpace = () =>
        vertexPositions.some((vp) => distanceSquared(vp, labelPos) < 1600) ||
        usedEdgePositions.some((ep) => distanceSquared(ep, labelPos) < 1600);
      while (needsMoreSpace() && attempts < 4) {
        offset += 20;
        labelPos = adjustPosition();
        attempts++;
      }

      usedEdgePositions.push(labelPos);
      edgeLabels.push({
        id: `${i}-${nextIndex}`,
        text: `${lengthInt} mm`,
        position: labelPos,
        startIdx: i,
        endIdx: nextIndex,
        lengthInt,
      });
    }

    return { vertexLabels, edgeLabels, areaM2 };
  }, [polygon.outer]);

  const { vertexLabels, edgeLabels, areaM2 } = geometry;

  // 텍스트 위치를 transformGroup과 동일하게 변환하는 함수
  const transformPoint = useCallback(
    (x: number, y: number) => {
      // 1. translate to center
      let tx = x - centerX;
      let ty = y - centerY;
      // 2. rotate
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rx = tx * cos - ty * sin;
      const ry = tx * sin + ty * cos;
      // 3. scale
      const sx = rx * scale;
      const sy = ry * scale;
      // 4. translate back
      return { x: sx + centerX, y: sy + centerY };
    },
    [centerX, centerY, rotation, scale]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Circle radius drag (works even in non-edit mode; uses onChangePolygon if provided)
      if (circleRadiusDragRef.current && onChangePolygon) {
        const drag = circleRadiusDragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;
        const rawRadius = Math.hypot(world.x - drag.center.x, world.y - drag.center.y);
        const snappedRadius = Math.max(
          MIN_EDGE_SPAN_MM,
          Math.round(rawRadius / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM
        );

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/879cd1c0-0440-4b15-a553-b8dff9f73345',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DeckCanvas.tsx:handlePointerMove(circle)',message:'circle radius drag move',data:{rawRadiusMm:rawRadius,snappedRadiusMm:snappedRadius,segments:drag.segments},timestamp:Date.now(),sessionId:'debug-session',runId:'circle-radius',hypothesisId:'C1'})}).catch(()=>{});
        // #endregion

        const newOuter = buildCirclePolygon(drag.center, snappedRadius, drag.segments);
        onChangePolygon({ ...polygon, outer: newOuter });
        return;
      }

      // Update cursor position for free mode preview (only when drawing from scratch, not when converted from preset)
      if (shapeInfo.isFree && !shapeInfo.isClosed && !isFreePolygonClosed && polygon.outer.length > 0) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/879cd1c0-0440-4b15-a553-b8dff9f73345',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DeckCanvas.tsx:529',message:'Pointer move in free mode',data:{points:polygon.outer.length,isClosed:shapeInfo.isClosed,isFreePolygonClosed},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H2'})}).catch(()=>{});
        // #endregion
        const world = toWorldCoords(event.clientX, event.clientY);
        if (world) {
          let x = snapToGrid(world.x, GRID_SIZE);
          let y = snapToGrid(world.y, GRID_SIZE);

          // 직교 모드 (Shift 키)
          if (event.shiftKey) {
            const lastPoint = polygon.outer[polygon.outer.length - 1];
            const dx = Math.abs(x - lastPoint.xMm);
            const dy = Math.abs(y - lastPoint.yMm);
            if (dx > dy) {
              y = lastPoint.yMm; // 수평 고정
            } else {
              x = lastPoint.xMm; // 수직 고정
            }
          }

          setCursorPosition({ x, y });
        }
      } else {
        // 도형이 완성되거나 프리셋에서 전환된 경우 커서 위치 초기화
        setCursorPosition(null);
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
    [
      buildCirclePolygon,
      shapeInfo.isFree,
      shapeInfo.isClosed,
      isFreePolygonClosed,
      polygon,
      toWorldCoords,
      dragIndex,
      onChangePolygon,
      viewBox.h,
      viewBox.w,
      activeTool,
    ]
  );

  const handlePointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    const svg = svgRef.current;
    if (circleDragActiveRef.current) {
      circleDragActiveRef.current = false;
    }
    if (circleRadiusDragRef.current && event.pointerId === circleRadiusDragRef.current.pointerId) {
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

    if (dragIndex !== null) {
      if (svg && pointerIdRef.current !== null && svg.hasPointerCapture?.(pointerIdRef.current)) {
        svg.releasePointerCapture(pointerIdRef.current);
      }
      pointerIdRef.current = null;
      setDragIndex(null);
    }

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
  }, [dragIndex]);

  const startCircleRadiusDrag = useCallback(
    (event: ReactPointerEvent<SVGCircleElement>) => {
      if (!onChangePolygon) return;
      if (!isCircle || !circleCenter) return;
      event.preventDefault();
      event.stopPropagation();
      circleDragActiveRef.current = true;
      circleRadiusDragRef.current = { pointerId: event.pointerId, center: circleCenter, segments: 16 };
      svgRef.current?.setPointerCapture?.(event.pointerId);

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/879cd1c0-0440-4b15-a553-b8dff9f73345',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DeckCanvas.tsx:startCircleRadiusDrag',message:'circle radius drag start',data:{center:circleCenter,points:polygon.outer.length},timestamp:Date.now(),sessionId:'debug-session',runId:'circle-radius',hypothesisId:'C1'})}).catch(()=>{});
      // #endregion
    },
    [circleCenter, isCircle, onChangePolygon, polygon.outer.length]
  );

  const startDrag = useCallback(
    (idx: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
      if (!isEditable) return;
      // Allow vertex drag for:
      // 1. Free shapes - always allow (unless in delete mode)
      // 2. Preset shapes (직사각형, ㄱ자형, T형, 원형) - only in "add" mode
      const allowVertexDrag = shapeInfo.isFree || activeTool === "add";

      if (activeTool === "delete") {
        event.preventDefault();
        event.stopPropagation();
        if (!onChangePolygon) return;
        const nextOuter = polygon.outer.filter((_, i) => i !== idx);
        setIsFreePolygonClosed(nextOuter.length >= 3 && isFreePolygonClosed);
        onChangePolygon({ ...polygon, outer: nextOuter });
        return;
      }

      if (!allowVertexDrag) return;

      // In free mode, if clicking on first vertex with 3+ points and polygon is not closed yet, close it
      if (shapeInfo.isFree && idx === 0 && polygon.outer.length >= 3 && !isFreePolygonClosed) {
        event.preventDefault();
        event.stopPropagation();
        setIsFreePolygonClosed(true);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      pointerIdRef.current = event.pointerId;
      svgRef.current?.setPointerCapture?.(event.pointerId);
      setDragIndex(idx);
      // 원형 드래그는 더 이상 특별 처리하지 않음
    },
    [activeTool, isEditable, isFreePolygonClosed, onChangePolygon, polygon, shapeInfo]
  );

  const startEdgeDrag = useCallback(
    (handle: EdgeHandle) => (event: ReactPointerEvent<SVGLineElement>) => {
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
    [enableEdgeControls, isEditable, onChangePolygon, polygon.outer, toWorldCoords]
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

  const handleEdgeLabelClick = useCallback(
    (startIndex: number, lengthMm: number) =>
      (event: ReactPointerEvent<SVGElement>) => {
        if (!isEditable || !onChangePolygon) return;
        event.preventDefault();
        event.stopPropagation();
        const defaultValue = Math.round(lengthMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
        const input = window.prompt("변 길이(mm)를 입력하세요", defaultValue.toLocaleString("ko-KR"));
        if (input === null) return;
        const parsed = Number((input ?? "").toString().replace(/,/g, "").trim());
        const snapped = Math.round(parsed / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
        if (!Number.isFinite(parsed) || snapped <= 0 || snapped < MIN_EDGE_SPAN_MM) return;
        const updatedOuter = updateEdgeLength(polygon.outer, startIndex, snapped, {
          minLengthMm: MIN_EDGE_SPAN_MM,
        });
        if (!updatedOuter) return;
        onChangePolygon({ ...polygon, outer: updatedOuter });
      },
    [isEditable, onChangePolygon, polygon]
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

        // 프리셋 도형에서 꼭지점을 추가하면 자유형으로 전환되므로, isFreePolygonClosed를 true로 설정
        // (점선이 나타나지 않도록 하기 위함)
        if (!shapeInfo.isFree) {
          setIsFreePolygonClosed(true);
        }
        
        // 프리셋 도형에서 꼭지점을 추가하면 자유형으로 전환되므로, isFreePolygonClosed를 true로 설정
        // (점선이 나타나지 않도록 하기 위함)
        if (!shapeInfo.isFree) {
          setIsFreePolygonClosed(true);
        }
        
        onChangePolygon({ ...polygon, outer: newOuter });
        pointerIdRef.current = event.pointerId;
        svgRef.current?.setPointerCapture?.(event.pointerId);
        setDragIndex(insertIndex);
      },
    [isEditable, onChangePolygon, polygon, shapeInfo.isFree]
  );

  const handleCanvasClick = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Only handle clicks in free mode
      if (!shapeInfo.isFree) return;
      if (isFreePolygonClosed) return;
      if (!isEditable || !onChangePolygon) return;

      // Ignore if clicking on edge controls
      const target = event.target as SVGElement | null;
      if (target?.getAttribute?.("data-edge-hit") === "true") return;

      // Ignore if panning or dragging
      if (isPanning || dragIndex !== null || edgeDragRef.current) return;

      const world = toWorldCoords(event.clientX, event.clientY);
      if (!world) return;

      // Snap to grid
      let snappedX = snapToGrid(world.x, GRID_SIZE);
      let snappedY = snapToGrid(world.y, GRID_SIZE);

      // 직교 모드 (Shift 키)
      if (event.shiftKey && polygon.outer.length > 0) {
        const lastPoint = polygon.outer[polygon.outer.length - 1];
        const dx = Math.abs(snappedX - lastPoint.xMm);
        const dy = Math.abs(snappedY - lastPoint.yMm);
        if (dx > dy) {
          snappedY = lastPoint.yMm; // 수평 고정
        } else {
          snappedX = lastPoint.xMm; // 수직 고정
        }
      }

      const snappedPoint = {
        xMm: snappedX,
        yMm: snappedY,
      };

        // Check if we're closing the polygon (clicking on or near first point)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/879cd1c0-0440-4b15-a553-b8dff9f73345',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DeckCanvas.tsx:885',message:'Checking close condition',data:{points:polygon.outer.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        if (polygon.outer.length >= 3) {
          const firstPoint = polygon.outer[0];
          const dx = snappedPoint.xMm - firstPoint.xMm;
          const dy = snappedPoint.yMm - firstPoint.yMm;
          const distance = Math.sqrt(dx * dx + dy * dy);

          const CLOSE_THRESHOLD = 20; // 20mm threshold for closing
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/879cd1c0-0440-4b15-a553-b8dff9f73345',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DeckCanvas.tsx:894',message:'Close distance check',data:{distance,threshold:CLOSE_THRESHOLD},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H4'})}).catch(()=>{});
          // #endregion

          // Close if clicking exactly on first point or within threshold
          if (distance <= CLOSE_THRESHOLD) {
            // Close the polygon - don't add new point, just mark as closed
            setIsFreePolygonClosed(true);
            return;
          }
        }

      // Add new vertex to polygon
      const newOuter = [...polygon.outer, snappedPoint];
      onChangePolygon({ ...polygon, outer: newOuter });
    },
    [shapeInfo.isFree, isFreePolygonClosed, isEditable, onChangePolygon, isPanning, dragIndex, toWorldCoords, polygon]
  );

  const startPan = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (dragIndex !== null) return;
      if (edgeDragRef.current) return;
      if ((event.target as SVGElement | null)?.getAttribute?.("data-edge-hit") === "true") return;

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
    [dragIndex, viewBox.x, viewBox.y, viewBox.w, viewBox.h]
  );

  const handleWheel = useCallback((event: ReactWheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 0.9;
    setScale((prev) => Math.min(5, Math.max(0.2, prev * factor)));
  }, []);

  // Auto-center view when polygon changes (but not during dragging)
  useEffect(() => {
    // 드래그 중이거나 변 드래그 중이면 centerView 호출하지 않음
    if (dragIndex !== null || isEdgeDragging) return;
    
    // 자유형 그리기 도중(isFree && !isClosed)에는 자동 중앙 정렬 방지 (첫 점 찍을 때 줌인/이동 되는 문제 해결)
    if (shapeInfo.isFree && !shapeInfo.isClosed) return;

    if (polygon.outer.length > 0) {
      centerView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polygon.outer, dragIndex, isEdgeDragging, shapeInfo.isFree, shapeInfo.isClosed]); // 의존성 추가

  // Keyboard shortcuts: ESC to exit edit mode, Ctrl+Z/Ctrl+Shift+Z for undo/redo, Numeric input
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 숫자 입력 처리 (자유형 그리기 중일 때)
      if (activeTool === "add" && shapeInfo.isFree && !isFreePolygonClosed && polygon.outer.length > 0) {
        if (/^[0-9.]$/.test(event.key)) {
          if (event.key === "." && typedLength.includes(".")) return;
          setTypedLength((prev) => prev + event.key);
          return;
        }
        if (event.key === "Backspace") {
          setTypedLength((prev) => prev.slice(0, -1));
          return;
        }
        if (event.key === "Enter" && typedLength) {
          const len = parseFloat(typedLength);
          if (len > 0 && cursorPosition) {
            const lastPoint = polygon.outer[polygon.outer.length - 1];
            const dx = cursorPosition.x - lastPoint.xMm;
            const dy = cursorPosition.y - lastPoint.yMm;
            const currentDist = Math.hypot(dx, dy);
            
            if (currentDist > EPS) {
              const nx = lastPoint.xMm + (dx / currentDist) * len;
              const ny = lastPoint.yMm + (dy / currentDist) * len;
              
              const newOuter = [...polygon.outer, { xMm: nx, yMm: ny }];
              onChangePolygon?.({ ...polygon, outer: newOuter });
              setTypedLength("");
            }
          }
          return;
        }
      }

      // ESC to exit edit mode
      if (event.key === "Escape") {
        if (typedLength) {
          setTypedLength("");
          return;
        }
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
  }, [activeTool, handleUndo, handleRedo, typedLength, shapeInfo.isFree, isFreePolygonClosed, polygon.outer, cursorPosition, onChangePolygon]);

  // When switching to free mode, default to add tool so first click drops a point
  useEffect(() => {
    if (shapeInfo.isFree && !shapeInfo.isClosed) {
      setActiveTool("add");
    }
  }, [shapeInfo.isFree, shapeInfo.isClosed]);

  // When polygon is cleared (e.g. switching to free mode), reset closed state
  useEffect(() => {
    if (polygon.outer.length === 0) {
      setIsFreePolygonClosed(false);
    }
  }, [polygon.outer.length]);

  const handleSvgPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // In delete mode, clicking the canvas should not add points; let drag handlers handle deletions.
      if (activeTool === "add" && shapeInfo.isFree && !isFreePolygonClosed && event.button === 0) {
        handleCanvasClick(event);
      }
      // Always try to start pan (will be filtered in startPan)
      startPan(event);
    },
    [activeTool, shapeInfo.isFree, isFreePolygonClosed, handleCanvasClick, startPan]
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
                    isPanning || isEdgeDragging
                      ? "grabbing"
                      : activeTool === "delete"
                        ? "not-allowed"
                        : activeTool === "add"
                          ? "copy"
                          : shapeInfo.isFree
                            ? isFreePolygonClosed
                              ? "grab"
                              : "crosshair"
                            : "grab",
          overflow: "visible",
        }}
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        {/* Grid pattern for free mode */}
        <defs>
          <pattern
            id="grid-pattern"
            width={GRID_DISPLAY_SIZE}
            height={GRID_DISPLAY_SIZE}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${GRID_DISPLAY_SIZE} 0 L 0 0 0 ${GRID_DISPLAY_SIZE}`}
              fill="none"
              stroke="rgba(0, 120, 255, 0.15)"
              strokeWidth={1}
            />
          </pattern>
        </defs>

        {/* Grid background for free mode (when not closed OR in edit mode) */}
        {shapeInfo.isFree && (!isFreePolygonClosed || activeTool !== null) && (
          <rect
            x={viewBox.x - GRID_DISPLAY_SIZE}
            y={viewBox.y - GRID_DISPLAY_SIZE}
            width={viewBox.w + GRID_DISPLAY_SIZE * 2}
            height={viewBox.h + GRID_DISPLAY_SIZE * 2}
            fill="url(#grid-pattern)"
            pointerEvents="none"
          />
        )}

        <g transform={transformGroup}>
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
          {(() => {
            const style = {
              stroke: POLYGON_STYLE.stroke,
              strokeWidth: isSubView ? POLYGON_STYLE.strokeWidth.subView : POLYGON_STYLE.strokeWidth.normal,
              strokeLinejoin: POLYGON_STYLE.strokeLinejoin,
              strokeLinecap: POLYGON_STYLE.strokeLinecap,
              fill: isSubView 
                ? POLYGON_STYLE.fill.subView 
                : (isEdgeDragging || activeTool !== null) 
                  ? POLYGON_STYLE.fill.dragging 
                  : POLYGON_STYLE.fill.normal,
              opacity: isSubView ? POLYGON_STYLE.opacity.subView : POLYGON_STYLE.opacity.normal,
            };

            if (shapeInfo.isFree && !shapeInfo.isClosed) {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/879cd1c0-0440-4b15-a553-b8dff9f73345',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DeckCanvas.tsx:1181',message:'Rendering polyline',data:{points:polygon.outer.length,isClosed:shapeInfo.isClosed,isFreePolygonClosed,shapeType},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
              // #endregion
              // Free mode: render as polyline until closed
              return (
                <polyline
                  points={polygon.outer.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
                  {...style}
                  fill="none"
                  pointerEvents="all"
                />
              );
            } else {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/879cd1c0-0440-4b15-a553-b8dff9f73345',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DeckCanvas.tsx:1191',message:'Rendering polygon',data:{points:polygon.outer.length,isClosed:shapeInfo.isClosed,isFreePolygonClosed,shapeType},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'H1'})}).catch(()=>{});
              // #endregion
              // 모든 형태 (rectangle, lShape, tShape, circle, free closed): 직사각형과 완전히 동일한 설정
              return (
                <polygon
                  points={polygon.outer.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
                  {...style}
                  pointerEvents="all"
                />
              );
            }
          })()}

          {enableEdgeControls &&
            edgeHandles.map((handle) => {
              const isHovered = hoverEdgeId === handle.id;
              return (
                <g key={handle.id}>
                  <line
                    x1={handle.start.x}
                    y1={handle.start.y}
                    x2={handle.end.x}
                    y2={handle.end.y}
                    stroke={isHovered ? "#2463ff" : "rgba(169, 212, 255, 1)"}
                    strokeWidth={14}
                    pointerEvents="none"
                  />
                  <line
                    x1={handle.start.x}
                    y1={handle.start.y}
                    x2={handle.end.x}
                    y2={handle.end.y}
                    stroke="transparent"
                    strokeWidth={28}
                    pointerEvents="stroke"
                    data-edge-hit="true"
                    style={{
                      cursor:
                        handle.orientation === "vertical"
                          ? "ew-resize" // 수직: 좌우 화살표 (반대로)
                          : handle.orientation === "horizontal"
                            ? "ns-resize" // 수평: 상하 화살표 (반대로)
                            : "move", // 대각선: 이동 커서
                    }}
                    onPointerEnter={() => setHoverEdgeId(handle.id)}
                    onPointerLeave={() => {
                      if (!isEdgeDragging || activeEdgeId !== handle.id) {
                        setHoverEdgeId((current) => (current === handle.id ? null : current));
                      }
                    }}
                    onPointerDown={startEdgeDrag(handle)}
                  />
                </g>
              );
            })}

          {activeTool === "add" &&
            polygon.outer.map((point, idx) => {
              const nextIndex = (idx + 1) % polygon.outer.length;
              return (
                <line
                  key={`add-hit-${idx}`}
                  x1={point.xMm}
                  y1={point.yMm}
                  x2={polygon.outer[nextIndex].xMm}
                  y2={polygon.outer[nextIndex].yMm}
                  stroke="transparent"
                  strokeWidth={28}
                  pointerEvents="stroke"
                  onPointerEnter={(e) => updateHoverAddHandle(idx, e.clientX, e.clientY)}
                  onPointerMove={(e) => updateHoverAddHandle(idx, e.clientX, e.clientY)}
                  onPointerLeave={() => {
                    setHoverAddEdgeIndex((current) => (current === idx ? null : current));
                    setHoverAddPoint(null);
                  }}
                />
              );
            })}

          {addHandles.map((handle) => (
            <circle
              key={handle.id}
              cx={handle.position.x}
              cy={handle.position.y}
              r={10}
              fill="#fff"
              stroke="#2463ff"
              strokeWidth={2}
              onPointerDown={handleAddHandleClick(handle.insertIndex, handle.position)}
              style={{ cursor: "copy" }}
            />
          ))}

          {/* Vertex handles - hidden for circle (circle uses radius handle only) */}
          {!isCircle &&
            polygon.outer.map((point, idx) => {
              // Enable vertex dragging for:
              // 1. Free shapes (always editable)
              // 2. Preset shapes (직사각형, ㄱ자형, T형, 원형) - only in "add" mode
              const canDrag = isEditable && (shapeInfo.isFree || activeTool === "add");
              const isDeleteMode = activeTool === "delete";

              return (
                <circle
                  key={`vertex-${point.xMm}-${point.yMm}-${idx}`}
                  cx={point.xMm}
                  cy={point.yMm}
                  r={8}
                  fill={isDeleteMode ? "#ffe6e6" : "#fff"}
                  stroke={isDeleteMode ? "#c52222" : "#2463ff"}
                  strokeWidth={2}
                  style={{
                    cursor: isDeleteMode ? "not-allowed" : canDrag ? "pointer" : "default",
                    pointerEvents: canDrag || isDeleteMode ? "auto" : "none",
                  }}
                  onPointerDown={startDrag(idx)}
                />
              );
            })}

          {/* Circle radius handle - always visible & draggable (center fixed, 10mm snap) */}
          {isCircle && circleCenter && circleRadius !== null && (
            <>
              <line
                x1={circleCenter.x}
                y1={circleCenter.y}
                x2={circleCenter.x + circleRadius}
                y2={circleCenter.y}
                stroke="#2463ff"
                strokeWidth={2}
                opacity={0.4}
                pointerEvents="none"
              />
              <circle
                cx={circleCenter.x + circleRadius}
                cy={circleCenter.y}
                r={10}
                fill="#ffffff"
                stroke="#2463ff"
                strokeWidth={3}
                style={{ cursor: "ew-resize" }}
                onPointerDown={startCircleRadiusDrag}
              />
            </>
          )}

          {/* Free mode: preview line from last point to cursor (only when drawing from scratch, not when converted from preset) */}
          {shapeInfo.isFree && !shapeInfo.isClosed && !isFreePolygonClosed && polygon.outer.length > 0 && cursorPosition && (
            <>
              <line
                x1={polygon.outer[polygon.outer.length - 1].xMm}
                y1={polygon.outer[polygon.outer.length - 1].yMm}
                x2={cursorPosition.x}
                y2={cursorPosition.y}
                stroke="#2463ff"
                strokeWidth={2}
                strokeDasharray="6,4"
                pointerEvents="none"
                opacity={0.6}
              />
              {/* Live Dimension / Typed Input Display */}
              {(() => {
                const lastPoint = polygon.outer[polygon.outer.length - 1];
                const dist = Math.hypot(cursorPosition.x - lastPoint.xMm, cursorPosition.y - lastPoint.yMm);
                const midX = (lastPoint.xMm + cursorPosition.x) / 2;
                const midY = (lastPoint.yMm + cursorPosition.y) / 2;
                const offset = 15 / (pixelsPerUnit * scale);

                const displayText = typedLength ? `${typedLength}mm` : `${Math.round(dist).toLocaleString()}mm`;
                const fillColor = typedLength ? "#000" : "#2463ff";

                return (
                  <text
                    x={midX}
                    y={midY - offset}
                    fill={fillColor}
                    fontSize={suggestedEdgeFontUser / scale}
                    fontWeight={600}
                    textAnchor="middle"
                    pointerEvents="none"
                    stroke="#ffffff"
                    strokeWidth={3 / scale}
                    paintOrder="stroke"
                    transform={`rotate(${-rotation}, ${midX}, ${midY})`}
                  >
                    {displayText}
                  </text>
                );
              })()}
              {/* Show close indicator when near first point */}
              {polygon.outer.length >= 3 && (() => {
                const firstPoint = polygon.outer[0];
                const dx = cursorPosition.x - firstPoint.xMm;
                const dy = cursorPosition.y - firstPoint.yMm;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const CLOSE_THRESHOLD = 20;
                if (distance <= CLOSE_THRESHOLD) {
                  return (
                    <circle
                      cx={firstPoint.xMm}
                      cy={firstPoint.yMm}
                      r={CLOSE_THRESHOLD}
                      fill="none"
                      stroke="#2463ff"
                      strokeWidth={2}
                      strokeDasharray="8,4"
                      pointerEvents="none"
                      opacity={0.4}
                    />
                  );
                }
                return null;
              })()}
            </>
          )}

        </g>

        {/* 텍스트 라벨들 - transformGroup 밖에서 렌더링하여 scale 영향 받지 않음 */}
        {vertexLabels.map((vertex) => {
          const pos = transformPoint(vertex.position.x, vertex.position.y);
          return (
            <text
              key={`corner-${vertex.label}`}
              x={pos.x}
              y={pos.y}
              fontSize={suggestedVertexFontUser}
              fill="#0b2540"
              fontWeight={600}
              pointerEvents="none"
              textAnchor="middle"
            >
              {vertex.label}
            </text>
          );
        })}

        {!isCircle && edgeLabels.map((edge) => {
          const canEdit = isEditable && onChangePolygon !== undefined;
          const onPointerDown = canEdit ? handleEdgeLabelClick(edge.startIdx, edge.lengthInt) : undefined;
          const pos = transformPoint(edge.position.x, edge.position.y);
          return (
            <g key={`edge-label-${edge.id}`} style={{ cursor: canEdit ? "text" : "default" }}>
              {/* Background for better clickability */}
              <rect
                x={pos.x - edgeLabelBoxUser.padX}
                y={pos.y - edgeLabelBoxUser.padY}
                width={edgeLabelBoxUser.w}
                height={edgeLabelBoxUser.h}
                fill="transparent"
                pointerEvents={canEdit ? "auto" : "none"}
                onPointerDown={onPointerDown}
              />
              <text
                x={pos.x}
                y={pos.y}
                fontSize={suggestedEdgeFontUser}
                fill="#0b2540"
                textAnchor="middle"
                pointerEvents={canEdit ? "auto" : "none"}
                onPointerDown={onPointerDown}
                style={{ cursor: canEdit ? "text" : "default" }}
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

        {shapeInfo.isFree && isEditable && (
          <text x={viewBox.x + 20} y={viewBox.y + 30} fill="#2463ff" fontSize={16} pointerEvents="none">
            {isFreePolygonClosed
              ? `면 완성됨 | 점 개수: ${polygon.outer.length} | 점을 추가하려면 초기화하세요`
              : polygon.outer.length >= 3
                ? `클릭하여 점 추가 | 첫 점 근처 클릭으로 면 완성 | 점 개수: ${polygon.outer.length}`
                : `클릭하여 점 추가 | 점 개수: ${polygon.outer.length}`}
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
