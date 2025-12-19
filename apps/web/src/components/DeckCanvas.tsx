import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { Polygon } from "@deck/core";
import {
  collectEdgeHandles,
  computeEdgeLimits,
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
type ShapeType = "rectangle" | "lShape" | "tShape" | "circle" | "free";

type RoundedPoint = { x: number; y: number };

const VIEWBOX = { width: 2000, height: 1200 };
const EPS = 1e-3;
const GRID_SIZE = 100; // 100mm grid for free drawing mode
const DIAGONALS = [
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
];

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

function buildRoundedPath(points: { xMm: number; yMm: number }[], radius: number) {
  if (points.length < 2) return "";
  const trimmed = points.map((point, i) => {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const toPrev = { x: prev.xMm - point.xMm, y: prev.yMm - point.yMm };
    const toNext = { x: next.xMm - point.xMm, y: next.yMm - point.yMm };
    const distPrev = Math.hypot(toPrev.x, toPrev.y) || 1;
    const distNext = Math.hypot(toNext.x, toNext.y) || 1;
    const cornerR = Math.min(radius, distPrev / 2, distNext / 2);
    const inPoint: RoundedPoint = {
      x: point.xMm + (toPrev.x / distPrev) * cornerR,
      y: point.yMm + (toPrev.y / distPrev) * cornerR,
    };
    const outPoint: RoundedPoint = {
      x: point.xMm + (toNext.x / distNext) * cornerR,
      y: point.yMm + (toNext.y / distNext) * cornerR,
    };
    return { corner: point, inPoint, outPoint };
  });

  let path = `M ${trimmed[0].outPoint.x} ${trimmed[0].outPoint.y}`;
  for (let i = 0; i < trimmed.length; i++) {
    const next = (i + 1) % trimmed.length;
    path += ` L ${trimmed[next].inPoint.x} ${trimmed[next].inPoint.y}`;
    path += ` Q ${trimmed[next].corner.xMm} ${trimmed[next].corner.yMm} ${trimmed[next].outPoint.x} ${trimmed[next].outPoint.y}`;
  }
  path += " Z";
  return path;
}
export function DeckCanvas({
  polygon,
  viewMode,
  onChangePolygon,
  isRoundedEnabled = false,
  cornerRadiusMm = 0,
  shapeType = "free",
}: {
  polygon: Polygon;
  viewMode: ViewMode;
  onChangePolygon?: (polygon: Polygon) => void;
  isRoundedEnabled?: boolean;
  cornerRadiusMm?: number;
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

  // Reset closed state only when shape type changes
  const prevShapeTypeRef = useRef(shapeType);
  if (prevShapeTypeRef.current !== shapeType) {
    prevShapeTypeRef.current = shapeType;
    if (isFreePolygonClosed) {
      setIsFreePolygonClosed(false);
    }
  }
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

  const isEditable = typeof onChangePolygon === "function";
  const isSubView = viewMode === "substructure";

  const enableEdgeControls =
    isEditable && (shapeType === "rectangle" || shapeType === "lShape" || shapeType === "tShape");

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

  const edgeHandles = useMemo(() => {
    if (!enableEdgeControls) return [];
    return collectEdgeHandles(polygon.outer);
  }, [enableEdgeControls, polygon.outer]);

  // Calculate angle between edge and horizontal for active edge
  const activeEdgeAngle = useMemo(() => {
    if (!activeEdgeId || !isEdgeDragging) return null;
    const handle = edgeHandles.find((h) => h.id === activeEdgeId);
    if (!handle) return null;

    const dx = handle.end.x - handle.start.x;
    const dy = handle.end.y - handle.start.y;
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = (angleRad * 180) / Math.PI;

    return {
      angle: angleDeg,
      midpoint: {
        x: (handle.start.x + handle.end.x) / 2,
        y: (handle.start.y + handle.end.y) / 2,
      },
    };
  }, [activeEdgeId, isEdgeDragging, edgeHandles]);

  const roundedPath = useMemo(() => {
    if (!isRoundedEnabled || cornerRadiusMm <= 0) return null;
    const d = buildRoundedPath(polygon.outer, cornerRadiusMm);
    return d || null;
  }, [cornerRadiusMm, isRoundedEnabled, polygon.outer]);

  const addHandles = useMemo(() => {
    if (!isEditable || activeTool !== "add") return [];
    if (hoverAddEdgeIndex === null || !hoverAddPoint) return [];
    const pts = polygon.outer;
    if (pts.length < 2) return [];
    const i = hoverAddEdgeIndex % pts.length;
    const nextIndex = (i + 1) % pts.length;
    return [{ id: `add-handle-${i}`, insertIndex: nextIndex, position: hoverAddPoint }];
  }, [activeTool, hoverAddEdgeIndex, hoverAddPoint, isEditable, polygon.outer]);

  const geometry = useMemo(() => {
    const pts = polygon.outer;
    const vertexLabels: { label: string; position: { x: number; y: number } }[] = [];
    const edgeLabels: { id: string; text: string; position: { x: number; y: number } }[] = [];
    const summary: { id: string; text: string }[] = [];
    if (pts.length < 2) {
      return { vertexLabels, edgeLabels, summary };
    }

    const signedArea = polygonSignedArea(pts);
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
      labelPos = {
        x: Math.min(Math.max(labelPos.x, viewBox.x + 10), viewBox.x + viewBox.w - 10),
        y: Math.min(Math.max(labelPos.y, viewBox.y + 10), viewBox.y + viewBox.h - 10),
      };
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
      const bounds = {
        minX: viewBox.x + 10,
        maxX: viewBox.x + viewBox.w - 10,
        minY: viewBox.y + 10,
        maxY: viewBox.y + viewBox.h - 10,
      };
      const adjustPosition = () => ({
        x: midpoint.x + offsetDir.x * offset,
        y: midpoint.y + offsetDir.y * offset,
      });
      let labelPos = adjustPosition();
      const outsideBounds = (pos: { x: number; y: number }) =>
        pos.x < bounds.minX || pos.x > bounds.maxX || pos.y < bounds.minY || pos.y > bounds.maxY;

      if (!isPointInsidePolygon(labelPos, pts) || outsideBounds(labelPos)) {
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
      });
      summary.push({
        id: `${i}-${nextIndex}`,
        text: `${indexToLabel(i)}-${indexToLabel(nextIndex)}: ${lengthInt} mm`,
      });
    }

    return { vertexLabels, edgeLabels, summary };
  }, [polygon.outer, viewBox]);

  const { vertexLabels, edgeLabels, summary } = geometry;

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Update cursor position for free mode preview
      if (shapeType === "free" && !isFreePolygonClosed && polygon.outer.length > 0) {
        const world = toWorldCoords(event.clientX, event.clientY);
        if (world) {
          setCursorPosition({
            x: snapToGrid(world.x, GRID_SIZE),
            y: snapToGrid(world.y, GRID_SIZE),
          });
        }
      }

      if (circleDragActiveRef.current) {
        console.assert(shapeType === "circle", "Circle drag must remain in circle mode (move)");
      }
      if (edgeDragRef.current && onChangePolygon) {
        const drag = edgeDragRef.current;
        if (event.pointerId !== drag.pointerId) return;
        const world = toWorldCoords(event.clientX, event.clientY);
        if (!world) return;
        const rawDelta =
          drag.orientation === "vertical"
            ? world.x - drag.startWorld.x
            : world.y - drag.startWorld.y;
        const clampedDelta = Math.min(
          Math.max(rawDelta, drag.limits.minDelta),
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
        const updatedOuter = polygon.outer.map((pt, idx) =>
          idx === dragIndex ? { xMm: world.x, yMm: world.y } : pt
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
    [shapeType, isFreePolygonClosed, polygon, toWorldCoords, dragIndex, onChangePolygon, viewBox.h, viewBox.w]
  );

  const handlePointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    const svg = svgRef.current;
    if (circleDragActiveRef.current) {
      console.assert(shapeType === "circle", "Circle drag must remain in circle mode (end)");
      circleDragActiveRef.current = false;
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

  const startDrag = useCallback(
    (idx: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
      if (!isEditable) return;
      const allowVertexDrag = !enableEdgeControls || activeTool === "add";

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

      // In free mode, if clicking on first vertex with 3+ points, close the polygon instead of dragging
      if (shapeType === "free" && idx === 0 && polygon.outer.length >= 3) {
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
      if (shapeType === "circle") {
        circleDragActiveRef.current = true;
        console.assert(shapeType === "circle", "Circle drag must remain in circle mode (start)");
      }
    },
    [activeTool, enableEdgeControls, isEditable, isFreePolygonClosed, onChangePolygon, polygon, shapeType]
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

  const handleAddHandleClick = useCallback(
    (insertIndex: number, position: { x: number; y: number }) =>
      (event: ReactPointerEvent<SVGCircleElement>) => {
        if (!isEditable || !onChangePolygon) return;
        event.preventDefault();
        event.stopPropagation();
        const newPoint = { xMm: position.x, yMm: position.y };
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

  const handleCanvasClick = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // Only handle clicks in free mode
      if (shapeType !== "free") return;
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
      const snappedPoint = {
        xMm: snapToGrid(world.x, GRID_SIZE),
        yMm: snapToGrid(world.y, GRID_SIZE),
      };

      // Check if we're closing the polygon (clicking on or near first point)
      if (polygon.outer.length >= 3) {
        const firstPoint = polygon.outer[0];
        const dx = snappedPoint.xMm - firstPoint.xMm;
        const dy = snappedPoint.yMm - firstPoint.yMm;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const CLOSE_THRESHOLD = 50; // 50mm threshold for closing

        // Close if clicking exactly on first point or within threshold
        if (distance === 0 || distance <= CLOSE_THRESHOLD) {
          // Close the polygon - don't add new point, just mark as closed
          setIsFreePolygonClosed(true);
          return;
        }
      }

      // Add new vertex to polygon
      const newOuter = [...polygon.outer, snappedPoint];
      onChangePolygon({ ...polygon, outer: newOuter });
    },
    [shapeType, isFreePolygonClosed, isEditable, onChangePolygon, isPanning, dragIndex, toWorldCoords, polygon]
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

  // Auto-center view when polygon changes (on mount or shape type change)
  useEffect(() => {
    if (polygon.outer.length > 0) {
      centerView();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapeType]); // Only trigger on shape type change

  // ESC key handler to exit edit mode
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && activeTool !== null) {
        setActiveTool(null);
        setHoverAddEdgeIndex(null);
        setHoverAddPoint(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTool]);

  const handleSvgPointerDown = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      // In delete mode, clicking the canvas should not add points; let drag handlers handle deletions.
      if (activeTool === "add" && shapeType === "free" && !isFreePolygonClosed && event.button === 0) {
        handleCanvasClick(event);
      }
      // Always try to start pan (will be filtered in startPan)
      startPan(event);
    },
    [activeTool, shapeType, isFreePolygonClosed, handleCanvasClick, startPan]
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
                          : shapeType === "free"
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
        <g transform={transformGroup}>
          {roundedPath ? (
            <path
              d={roundedPath}
              fill={isSubView ? "none" : (isEdgeDragging || activeTool !== null) ? "#ffffff" : "rgba(80,160,255,0.12)"}
              stroke="#5af"
              strokeWidth={isSubView ? 2 : 4}
              strokeLinejoin="miter"
              strokeLinecap="square"
              opacity={isSubView ? 0.2 : 1}
              pointerEvents="all"
            />
          ) : shapeType === "free" && !isFreePolygonClosed ? (
            // Free mode: render as polyline until closed
            <polyline
              points={polygon.outer.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
              fill="none"
              stroke="#5af"
              strokeWidth={4}
              strokeLinejoin="miter"
              strokeLinecap="square"
              opacity={1}
              pointerEvents="all"
            />
          ) : (
            // All other shapes or closed free polygon: render as filled polygon
            <polygon
              points={polygon.outer.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
              fill={isSubView ? "none" : (isEdgeDragging || activeTool !== null) ? "#ffffff" : "rgba(80,160,255,0.12)"}
              stroke="#5af"
              strokeWidth={isSubView ? 2 : 4}
              strokeLinejoin="miter"
              strokeLinecap="square"
              opacity={isSubView ? 0.2 : 1}
              pointerEvents="all"
            />
          )}

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

          {/* Vertex handles - always show for all shapes */}
          {polygon.outer.map((point, idx) => (
            <circle
              key={`vertex-${point.xMm}-${point.yMm}-${idx}`}
              cx={point.xMm}
              cy={point.yMm}
              r={8}
              fill="#fff"
              stroke="#2463ff"
              strokeWidth={2}
              style={{
                cursor: isEditable && (!enableEdgeControls || activeTool === "add") ? "pointer" : "default",
                pointerEvents: isEditable && (!enableEdgeControls || activeTool === "add") ? "auto" : "none",
              }}
              onPointerDown={startDrag(idx)}
            />
          ))}

          {/* Free mode: preview line from last point to cursor (only when not closed) */}
          {shapeType === "free" && !isFreePolygonClosed && polygon.outer.length > 0 && cursorPosition && (
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
              {/* Show close indicator when near first point */}
              {polygon.outer.length >= 3 && (() => {
                const firstPoint = polygon.outer[0];
                const dx = cursorPosition.x - firstPoint.xMm;
                const dy = cursorPosition.y - firstPoint.yMm;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const CLOSE_THRESHOLD = 50;
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

          {vertexLabels.map((vertex) => (
            <text
              key={`corner-${vertex.label}`}
              x={vertex.position.x}
              y={vertex.position.y}
              fontSize={18}
              fill="#0b2540"
              fontWeight={600}
              pointerEvents="none"
              textAnchor="middle"
            >
              {vertex.label}
            </text>
          ))}

          {edgeLabels.map((edge) => (
            <text
              key={`edge-label-${edge.id}`}
              x={edge.position.x}
              y={edge.position.y}
              fontSize={25}
              fill="#0b2540"
              textAnchor="middle"
              pointerEvents="none"
            >
              {edge.text}
            </text>
          ))}

          {/* Angle display during edge dragging */}
          {activeEdgeAngle && (
            <g>
              <rect
                x={activeEdgeAngle.midpoint.x - 50}
                y={activeEdgeAngle.midpoint.y - 20}
                width={100}
                height={40}
                fill="rgba(255, 255, 255, 0.95)"
                stroke="#2463ff"
                strokeWidth={2}
                rx={6}
                pointerEvents="none"
              />
              <text
                x={activeEdgeAngle.midpoint.x}
                y={activeEdgeAngle.midpoint.y + 6}
                fontSize={18}
                fill="#2463ff"
                fontWeight={700}
                textAnchor="middle"
                pointerEvents="none"
              >
                {Math.abs(activeEdgeAngle.angle).toFixed(1)}°
              </text>
            </g>
          )}
        </g>

        {isSubView && (
          <text x={viewBox.x + 20} y={viewBox.y + 30} fill="#555" fontSize={20}>
            하부 구조 보기
          </text>
        )}

        {shapeType === "free" && isEditable && (
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

      {summary.length > 0 && (
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
          {summary.map((edge) => (
            <div key={`summary-${edge.id}`}>{edge.text}</div>
          ))}
        </div>
      )}

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
