import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  calculateQuantities,
  buildCutPlan,
  type FasteningMode,
  type Plan,
  type Polygon,
  type Product,
  type Ruleset,
} from "@deck/core";
import { t } from "./i18n";
import { DeckCanvas, type ViewMode } from "./components/DeckCanvas";
import { ControlsPanel, type CutoutShape } from "./components/ControlsPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { isPointInsidePolygon, polygonCentroid } from "./geometry/polygon";
import { EDGE_LENGTH_STEP_MM, getEdgeList, MIN_EDGE_SPAN_MM, updateEdgeLength } from "./geometry/edges";
import { useHistory } from "./hooks/useHistory";
import { persistence, type ProjectState } from "./utils/persistence";

type Mode = "consumer" | "pro";
export type ShapeType = "rectangle" | "lShape" | "tShape" | "circle" | "free";

const VIEWBOX_SIZE = { width: 2000, height: 1200 };
const VIEWBOX_CENTER = { x: VIEWBOX_SIZE.width / 2, y: VIEWBOX_SIZE.height / 2 };

export type CutoutMeta = {
  shape: CutoutShape;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
};

function holeShapeFromPoints(pts: { xMm: number; yMm: number }[]): CutoutShape {
  if (pts.length === 4) return "rectangle";
  if (pts.length >= 16) return "circle";
  return "free";
}

function bboxFromPoints(pts: { xMm: number; yMm: number }[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.xMm);
    maxX = Math.max(maxX, p.xMm);
    minY = Math.min(minY, p.yMm);
    maxY = Math.max(maxY, p.yMm);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = Math.max(0, maxX - minX);
  const h = Math.max(0, maxY - minY);
  return { minX, maxX, minY, maxY, cx, cy, w, h };
}

function metaFromHolePoints(pts: { xMm: number; yMm: number }[], shape?: CutoutShape): CutoutMeta {
  const b = bboxFromPoints(pts);
  const detected = shape ?? holeShapeFromPoints(pts);
  return { shape: detected, xMm: b.cx, yMm: b.cy, widthMm: Math.round(b.w), heightMm: Math.round(b.h) };
}

const product: Product = {
  id: "DN34",
  name: "DN34",
  stockLengthMm: 3000,
  widthOptionsMm: [95, 120, 140, 150],
  thicknessMm: 25,
  gapMm: 5,
  fasteningModes: ["clip", "screw"],
};

const basePlan: Plan = {
  unit: "mm",
  polygon: {
    outer: [
      { xMm: 0, yMm: 0 },
      { xMm: 2000, yMm: 0 },
      { xMm: 2000, yMm: 1000 },
      { xMm: 0, yMm: 1000 },
    ],
  },
  boardWidthMm: 140,
  deckingDirectionDeg: 0,
  attachedEdgeIndices: [],
  substructureOverrides: {},
  stairs: {
    enabled: true,
    items: [],
    stringerMaterialOverrides: {},
  },
};

const baseRules: Omit<Ruleset, "mode"> = {
  gapMm: 5,
  secondarySpacingMm: 400,
  primarySpacingMm: 600,
  anchorSpacingMm: 1000,
  footingSpacingMm: 1000,
  consumerLoss: { base: 0.03, vertexFactor: 0.003, cutoutFactor: 0.005, cap: 0.06 },
  screwPerIntersection: 2,
  showAdvancedOverrides: false,
  enableCutPlan: false,
};

type ShapePreset = {
  label: string;
  getPoints: () => { xMm: number; yMm: number }[];
};

const SHAPE_PRESETS: Record<Exclude<ShapeType, "free">, ShapePreset> = {
  rectangle: {
    label: "직사각형",
    getPoints: () => [
      { xMm: 0, yMm: 0 },
      { xMm: 1000, yMm: 0 },
      { xMm: 1000, yMm: 1000 },
      { xMm: 0, yMm: 1000 },
    ],
  },
  lShape: {
    label: "ㄱ자형",
    getPoints: () => [
      { xMm: 0, yMm: 0 },
      { xMm: 1000, yMm: 0 },
      { xMm: 1000, yMm: 200 },
      { xMm: 700, yMm: 200 },
      { xMm: 700, yMm: 1200 },
      { xMm: 0, yMm: 1200 },
    ],
  },
  tShape: {
    label: "T자형",
    getPoints: () => [
      { xMm: 600, yMm: 0 },
      { xMm: 1600, yMm: 0 },
      { xMm: 1600, yMm: 200 },
      { xMm: 1000, yMm: 200 },
      { xMm: 1000, yMm: 1200 },
      { xMm: 800, yMm: 1200 },
      { xMm: 800, yMm: 200 },
      { xMm: 600, yMm: 200 },
    ],
  },
  circle: {
    label: "원형",
    getPoints: () => {
      const radius = 500;
      const segments = 16;
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        pts.push({
          xMm: radius + Math.cos(angle) * radius,
          yMm: radius + Math.sin(angle) * radius,
        });
      }
      return pts;
    },
  },
};

// 프리셋 도형의 실제 mm(치수)를 유지해야 하므로, 스케일 없이 '중앙으로 평행이동'만 수행
const centerShapeToCanvasNoScale = (points: { xMm: number; yMm: number }[]) => {
  if (points.length === 0) return points;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.xMm);
    maxX = Math.max(maxX, p.xMm);
    minY = Math.min(minY, p.yMm);
    maxY = Math.max(maxY, p.yMm);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const dx = VIEWBOX_CENTER.x - cx;
  const dy = VIEWBOX_CENTER.y - cy;
  return points.map((p) => ({ xMm: p.xMm + dx, yMm: p.yMm + dy }));
};

function circleSegmentsForSagitta(radiusMm: number, targetSagittaMm: number) {
  const r = Math.max(radiusMm, 0);
  const s = Math.max(0.001, targetSagittaMm);
  if (r <= s) return 16;
  const x = 1 - s / r;
  const clamped = Math.min(0.999999, Math.max(-0.999999, x));
  const n = Math.ceil(Math.PI / Math.acos(clamped));
  return Math.min(256, Math.max(16, n));
}

function buildCirclePoints(center: { xMm: number; yMm: number }, radiusMm: number, segments: number) {
  const pts: { xMm: number; yMm: number }[] = [];
  const r = Math.max(radiusMm, 0);
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ xMm: center.xMm + Math.cos(a) * r, yMm: center.yMm + Math.sin(a) * r });
  }
  return pts;
}

const initialPlan: Plan = {
  ...basePlan,
  polygon: {
    ...basePlan.polygon,
    outer: centerShapeToCanvasNoScale(SHAPE_PRESETS.rectangle.getPoints()),
  },
};

const initialCutoutsMeta = (initialPlan.polygon.holes ?? []).map((h) => metaFromHolePoints(h));

const initialProjectState: ProjectState = {
  plan: initialPlan,
  cutoutsMeta: initialCutoutsMeta,
  shapeType: "rectangle",
};

export default function App() {
  // --- State
  const {
    state: project,
    set: setProject,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetHistory
  } = useHistory<ProjectState>(initialProjectState);

  const plan = project.plan;
  const cutoutsMeta = project.cutoutsMeta;
  const shapeType = project.shapeType;

  // Convenience setters to mimic old API but routed through history
  const setPlan = useCallback((updater: (prev: Plan) => Plan) => {
    setProject((prev) => {
      const nextPlan = updater(prev.plan);
      if (nextPlan === prev.plan) return prev;
      return { ...prev, plan: nextPlan };
    });
  }, [setProject]);

  const setCutoutsMeta = useCallback((updater: (prev: CutoutMeta[]) => CutoutMeta[]) => {
    setProject((prev) => {
      const nextMeta = updater(prev.cutoutsMeta);
      if (nextMeta === prev.cutoutsMeta) return prev;
      return { ...prev, cutoutsMeta: nextMeta };
    });
  }, [setProject]);

  const setShapeType = useCallback((nextType: ShapeType) => {
    setProject((prev) => ({ ...prev, shapeType: nextType }));
  }, [setProject]);

  const [mode, setMode] = useState<Mode | null>(null);
  const fastening: FasteningMode = "clip";
  const [viewMode, setViewMode] = useState<ViewMode>("deck");
  const [showResults, setShowResults] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save logic
  useEffect(() => {
    persistence.saveToLocal(project);
  }, [project]);

  // Load auto-saved project on mount
  useEffect(() => {
    const saved = persistence.loadFromLocal();
    if (saved) {
      resetHistory(saved);
      // We might want to notify user or show a "Resumed from last session" toast
    }
  }, [resetHistory]);

  // holes(점 편집/추가/삭제) 변화에 맞춰 메타데이터를 동기화
  // Note: with unified state, we need to be careful not to cause infinite loops or duplicate history entries.
  // The original useEffect synchronized cutoutsMeta *when plan changed*. 
  // In the unified model, we should update both together ideally. 
  // However, for drag operations in DeckCanvas that only update Plan, we might need this syncing.
  // BUT: calling setProject inside useEffect that observes project will cause infinite loops or history spam.
  // SOLUTION: The 'handlePolygonChange' handler already handles syncing.
  // We can remove this effect if we ensure all plan updates also update meta if needed.
  // Let's look at handlePolygonChange. It does update meta.
  // But vertex dragging in DeckCanvas update `plan` directly. It does NOT update `cutoutsMeta`.
  // So validation/sync needs to happen.
  // A safer approach: Derive cutoutsMeta from plan.polygon.holes if possible, OR
  // Ensure that DeckCanvas calls a handler that updates BOTH plan and meta.
  // For now, let's KEEP the syncing logic but make it smart: only update if actually different and DO NOT create new history step for derived updates?
  // Actually, useHistory's `set` creates a new history step. We probably don't want a history step for automatic sync.
  // For simplicity in this iteration, let's assume handlePolygonChange covers most cases. 
  // If direct vertex edit happens, meta might get out of sync until next "proper" update.
  // Let's modify handlePolygonChange to be the single source of truth for polygon updates.

  // --- Keyboard Shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);


  // --- Persistence Handlers
  const handleSave = () => {
    persistence.saveToLocal(project);
    alert("프로젝트가 브라우저에 저장되었습니다.");
  };

  const handleExport = () => {
    persistence.exportToJson(project);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const loaded = await persistence.importFromJson(file);
      resetHistory(loaded);
      // If loaded state has specific mode or view settings, we might want to apply them too if we saved them.
      // For now, project state only includes Plan/Meta/ShapeType.
      alert("프로젝트를 불러왔습니다.");
    } catch (err) {
      console.error(err);
      alert("파일을 불러오는데 실패했습니다.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };


  // --- Handlers
  const handlePolygonChange = useCallback((updatedPolygon: Polygon) => {
    // This handler update Plan and CutoutsMeta atomically in one history step
    setProject((prev) => {
      // 1. Calculate new plan
      const nextAttached = (prev.plan.attachedEdgeIndices ?? []).filter((i: number) => i >= 0 && i < updatedPolygon.outer.length);
      const prevHoles = prev.plan.polygon.holes ?? [];
      const nextHoles: { xMm: number; yMm: number }[][] = [];
      const keptIndices: number[] = [];

      for (let i = 0; i < prevHoles.length; i++) {
        const hole = prevHoles[i];
        const ok =
          hole.length >= 3 &&
          hole.every((p) => isPointInsidePolygon({ x: p.xMm, y: p.yMm }, updatedPolygon.outer as any));
        if (ok) {
          nextHoles.push(hole);
          keptIndices.push(i);
        }
      }

      // 2. Calculate new cutoutsMeta
      const nextMeta = keptIndices.map(i => prev.cutoutsMeta[i]);

      // 3. Detect Shape Type
      let nextShapeType = prev.shapeType;
      // polygon이 변경될 때 shapeType 자동 감지 (현재 자유형 모드가 아닐 때만)
      if (prev.shapeType !== "free") {
        const pointCount = updatedPolygon.outer.length;
        let detectedShape: ShapeType = "free";
        if (pointCount === 0) detectedShape = "free";
        else if (pointCount === 4) detectedShape = "rectangle";
        else if (pointCount === 6) detectedShape = "lShape";
        else if (pointCount === 8) detectedShape = "tShape";
        else if (pointCount === 16) detectedShape = "circle";
        else detectedShape = "free";

        if (detectedShape !== "free") {
          nextShapeType = detectedShape;
        }
      }

      return {
        ...prev,
        plan: {
          ...prev.plan,
          polygon: { ...updatedPolygon, holes: nextHoles.length > 0 ? nextHoles : undefined },
          attachedEdgeIndices: nextAttached,
        },
        cutoutsMeta: nextMeta,
        shapeType: nextShapeType
      };
    });
  }, [setProject]);

  const handleDeleteCutout = useCallback((index: number) => {
    setProject((prev) => {
      // Update Holes
      const holes = prev.plan.polygon.holes ?? [];
      if (index < 0 || index >= holes.length) return prev;
      const nextHoles = holes.filter((_, i) => i !== index);
      const nextPlan = {
        ...prev.plan,
        polygon: { ...prev.plan.polygon, holes: nextHoles.length > 0 ? nextHoles : undefined }
      };

      // Update Meta
      const nextMeta = prev.cutoutsMeta.filter((_, i) => i !== index);

      return {
        ...prev,
        plan: nextPlan,
        cutoutsMeta: nextMeta
      };
    });
  }, [setProject]);

  const handleAddCutout = useCallback(() => {
    setProject((prev) => {
      const shape: CutoutShape = "rectangle";
      const outer = prev.plan.polygon.outer;
      if (outer.length < 3) return prev;

      const inside = (xMm: number, yMm: number) => isPointInsidePolygon({ x: xMm, y: yMm }, outer as any);

      // seed point
      const c = polygonCentroid(outer as any);
      let cx = c.xMm;
      let cy = c.yMm;
      if (!inside(cx, cy)) {
        const p0 = outer[0];
        cx = p0.xMm;
        cy = p0.yMm;
        for (let i = 1; i < outer.length; i++) {
          const pi = outer[i];
          const mx = (p0.xMm + pi.xMm) / 2;
          const my = (p0.yMm + pi.yMm) / 2;
          if (inside(mx, my)) {
            cx = mx;
            cy = my;
            break;
          }
        }
      }

      const makeRect = (w: number, h: number) => [
        { xMm: cx - w / 2, yMm: cy - h / 2 },
        { xMm: cx + w / 2, yMm: cy - h / 2 },
        { xMm: cx + w / 2, yMm: cy + h / 2 },
        { xMm: cx - w / 2, yMm: cy + h / 2 },
      ];

      let candidate: { xMm: number; yMm: number }[] = [];
      const w0 = 420;
      const h0 = 300;
      for (let k = 0; k < 8; k++) {
        const w = w0 * Math.pow(0.8, k);
        const h = h0 * Math.pow(0.8, k);
        const pts = makeRect(w, h);
        if (pts.every((p) => inside(p.xMm, p.yMm))) {
          candidate = pts;
          break;
        }
      }

      if (candidate.length < 3) return prev;

      const holes = [...(prev.plan.polygon.holes ?? []), candidate];
      const addedMeta = metaFromHolePoints(candidate, shape);

      return {
        ...prev,
        plan: { ...prev.plan, polygon: { ...prev.plan.polygon, holes } },
        cutoutsMeta: [...prev.cutoutsMeta, addedMeta]
      };
    });
  }, [setProject]);

  const handleChangeCutout = useCallback((index: number, nextMeta: CutoutMeta) => {
    setProject((prev) => {
      // Update Meta
      const newMetas = prev.cutoutsMeta.map((m, i) => (i === index ? nextMeta : m));

      // Update Plan Hole
      const holes = prev.plan.polygon.holes ?? [];
      if (index < 0 || index >= holes.length) return prev; // Should handle cleanly, but for now just return
      const prevHole = holes[index];

      const safeW = Math.max(1, Math.round(nextMeta.widthMm));
      const safeH = Math.max(1, Math.round(nextMeta.heightMm));
      const safeMeta: CutoutMeta = { ...nextMeta, widthMm: safeW, heightMm: safeH };

      let nextHole: { xMm: number; yMm: number }[] = prevHole;
      if (safeMeta.shape === "rectangle") {
        const w = Math.max(MIN_EDGE_SPAN_MM, safeMeta.widthMm);
        const h = Math.max(MIN_EDGE_SPAN_MM, safeMeta.heightMm);
        const cx = safeMeta.xMm;
        const cy = safeMeta.yMm;
        nextHole = [
          { xMm: cx - w / 2, yMm: cy - h / 2 },
          { xMm: cx + w / 2, yMm: cy - h / 2 },
          { xMm: cx + w / 2, yMm: cy + h / 2 },
          { xMm: cx - w / 2, yMm: cy + h / 2 },
        ];
      } else if (safeMeta.shape === "circle") {
        const d = Math.max(MIN_EDGE_SPAN_MM, Math.min(safeMeta.widthMm, safeMeta.heightMm));
        const r = d / 2;
        const seg = circleSegmentsForSagitta(r, 10);
        nextHole = buildCirclePoints({ xMm: safeMeta.xMm, yMm: safeMeta.yMm }, r, seg);
      } else {
        const b = bboxFromPoints(prevHole);
        const sx = b.w > 0 ? safeMeta.widthMm / b.w : 1;
        const sy = b.h > 0 ? safeMeta.heightMm / b.h : 1;
        nextHole = prevHole.map((p) => ({
          xMm: safeMeta.xMm + (p.xMm - b.cx) * sx,
          yMm: safeMeta.yMm + (p.yMm - b.cy) * sy,
        }));
      }

      const nextHoles = holes.map((h, i) => (i === index ? nextHole : h));

      return {
        ...prev,
        plan: { ...prev.plan, polygon: { ...prev.plan.polygon, holes: nextHoles.length > 0 ? nextHoles : undefined } },
        cutoutsMeta: newMetas
      };
    });
  }, [setProject]);

  const applyPresetShape = useCallback(
    (nextShape: ShapeType) => {
      setProject((prev) => {
        if (nextShape === "free") {
          return {
            ...prev,
            shapeType: "free",
            plan: {
              ...prev.plan,
              attachedEdgeIndices: [],
              substructureOverrides: {},
              polygon: { ...prev.plan.polygon, outer: [] }
            }
          };
        }

        const preset = SHAPE_PRESETS[nextShape];
        const centered = centerShapeToCanvasNoScale(preset.getPoints());
        return {
          ...prev,
          shapeType: nextShape,
          plan: {
            ...prev.plan,
            attachedEdgeIndices: [],
            substructureOverrides: {},
            polygon: { ...prev.plan.polygon, outer: centered }
          }
        };
      });
    },
    [setProject]
  );

  // --- Derived
  const effectiveMode: Mode = mode ?? "consumer";

  const rules: Ruleset = useMemo(
    () => ({ ...baseRules, mode: effectiveMode }),
    [effectiveMode]
  );

  const out = useMemo(() => {
    return calculateQuantities(plan, product, rules, fastening);
  }, [plan, rules, fastening]);

  const cutPlan = useMemo(() => {
    if (effectiveMode !== "pro") return null;
    return buildCutPlan(plan, product, rules);
  }, [effectiveMode, plan, rules]);

  const edgeList = useMemo(() => getEdgeList(plan.polygon.outer), [plan]);
  const shapeOptions = useMemo(
    () => [
      { id: "rectangle", label: SHAPE_PRESETS.rectangle.label },
      { id: "lShape", label: SHAPE_PRESETS.lShape.label },
      { id: "tShape", label: SHAPE_PRESETS.tShape.label },
      { id: "circle", label: SHAPE_PRESETS.circle.label },
      { id: "free", label: "자유형" },
    ],
    []
  );
  const dimensionItems = useMemo(
    () => {
      const allItems = edgeList.map((edge) => ({
        id: edge.id,
        label: `${edge.fromLabel}–${edge.toLabel}`,
        lengthMm: edge.lengthMm,
        startIndex: edge.startIndex,
        endIndex: edge.endIndex,
      }));

      // 원형은 변 길이 입력 자체를 없앰 (반지름으로만 조절)
      if (shapeType === "circle") {
        return [];
      }

      // 직사각형인 경우 처음 2개의 변만 표시 (A-B, B-C)
      // C-D, D-A는 A-B, B-C와 동일하므로 제거
      if (shapeType === "rectangle" && allItems.length === 4) {
        return allItems.slice(0, 2);
      }

      // ㄱ자형인 경우 A-B(인덱스 0)와 F-A(인덱스 5) 제외
      // A-B, F-A는 다른 변들의 조합으로 자동 계산됨
      if (shapeType === "lShape" && allItems.length === 6) {
        return allItems.filter((_, idx) => idx !== 0 && idx !== 5);
      }

      // T자형인 경우 A-B(인덱스 0)와 H-A(인덱스 7) 제외
      // A-B는 전체 상단 가로 (자동 계산), H-A는 B-C와 대칭
      if (shapeType === "tShape" && allItems.length === 8) {
        return allItems.filter((_, idx) => idx !== 0 && idx !== 7);
      }

      return allItems;
    },
    [edgeList, shapeType]
  );

  const circleRadiusMm = useMemo(() => {
    if (shapeType !== "circle") return null;
    const pts = plan.polygon.outer;
    if (pts.length < 3) return null;
    const c = polygonCentroid(pts);
    const sum = pts.reduce((acc, p) => acc + Math.hypot(p.xMm - c.xMm, p.yMm - c.yMm), 0);
    return sum / pts.length;
  }, [plan.polygon.outer, shapeType]);

  const handleCircleRadiusChange = useCallback((nextRadiusMm: number) => {
    const target = Math.round(nextRadiusMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
    // Update Plan directly
    setProject((prev) => {
      const pts = prev.plan.polygon.outer;
      if (pts.length < 3) return prev;
      const c = polygonCentroid(pts);
      const radius = Math.max(MIN_EDGE_SPAN_MM, target);
      const seg = circleSegmentsForSagitta(radius, 10);
      const newOuter = buildCirclePoints(c, radius, seg);
      return { ...prev, plan: { ...prev.plan, polygon: { ...prev.plan.polygon, outer: newOuter } } };
    });
    return true;
  }, [setProject]);

  const handleEdgeLengthChange = useCallback((startIndex: number, nextLengthMm: number) => {
    const targetLength = Math.round(nextLengthMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
    let didUpdate = false;
    setProject((prev) => {
      const points = prev.plan.polygon.outer;
      const isRectangle = prev.shapeType === "rectangle" && points.length === 4;

      let newOuter = points;

      if (isRectangle) {
        const [A, B, C, D] = points;

        if (startIndex === 0) {
          const currentLength = Math.hypot(B.xMm - A.xMm, B.yMm - A.yMm);
          if (currentLength < 1) return prev;
          const delta = (targetLength - currentLength) / 2;
          const dirX = (B.xMm - A.xMm) / currentLength;
          const dirY = (B.yMm - A.yMm) / currentLength;

          newOuter = [
            { xMm: A.xMm - dirX * delta, yMm: A.yMm - dirY * delta },
            { xMm: B.xMm + dirX * delta, yMm: B.yMm + dirY * delta },
            { xMm: C.xMm + dirX * delta, yMm: C.yMm + dirY * delta },
            { xMm: D.xMm - dirX * delta, yMm: D.yMm - dirY * delta },
          ];
        } else if (startIndex === 1) {
          const currentLength = Math.hypot(C.xMm - B.xMm, C.yMm - B.yMm);
          if (currentLength < 1) return prev;
          const delta = (targetLength - currentLength) / 2;
          const dirX = (C.xMm - B.xMm) / currentLength;
          const dirY = (C.yMm - B.yMm) / currentLength;

          newOuter = [
            { xMm: A.xMm - dirX * delta, yMm: A.yMm - dirY * delta },
            { xMm: B.xMm - dirX * delta, yMm: B.yMm - dirY * delta },
            { xMm: C.xMm + dirX * delta, yMm: C.yMm + dirY * delta },
            { xMm: D.xMm + dirX * delta, yMm: D.yMm + dirY * delta },
          ];
        } else {
          return prev;
        }
      } else {
        // 직사각형이 아닌 경우 
        const updated = updateEdgeLength(points, startIndex, targetLength, {
          minLengthMm: MIN_EDGE_SPAN_MM,
        });
        if (!updated) return prev;
        newOuter = updated;
      }

      didUpdate = true;
      return { ...prev, plan: { ...prev.plan, polygon: { ...prev.plan.polygon, outer: newOuter } } };
    });
    return didUpdate;
  }, [setProject]);


  // --- Gate screen
  if (mode === null) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ width: "100%", maxWidth: 720, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px" }}>{t.appTitle}</h1>
          <p style={{ margin: "0 0 16px", opacity: 0.8 }}>시작 모드를 선택하세요.</p>

          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => setMode("consumer")}
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "#fff",
                color: "#111",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              일반 모드로 시작
            </button>

            <button
              onClick={() => setMode("pro")}
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: "1px solid #333",
                background: "#fff",
                color: "#111",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              전문가 모드로 시작
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main screen
  return (
    <div className="app-shell">
      <header className="app-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1>{t.appTitle}</h1>
          <div style={{ fontSize: 14, color: "#555" }}>
            모드: {effectiveMode === "pro" ? "전문가" : "일반"}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={undo} disabled={!canUndo} title="실행 취소 (Cmd+Z)">
            ↩ Undo
          </button>
          <button onClick={redo} disabled={!canRedo} title="다시 실행 (Cmd+Shift+Z)">
            ↪ Redo
          </button>
          <div style={{ width: 1, background: '#ddd', margin: '0 4px' }} />
          <button onClick={handleSave} title="브라우저 저장">💾 저장</button>
          <button onClick={handleImportClick} title="JSON 불러오기">📂 열기</button>
          <button onClick={handleExport} title="JSON 내려받기">⬇ 내보내기</button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".json"
            onChange={handleFileChange}
          />
        </div>
      </header>

      <div className="app-body">
        <ControlsPanel
          shapeOptions={shapeOptions}
          selectedShapeId={shapeType}
          onSelectShape={(shapeId) => applyPresetShape(shapeId as ShapeType)}
          dimensions={dimensionItems}
          onChangeDimensionLength={(edgeId, lengthMm) => {
            const target = dimensionItems.find((edge) => edge.id === edgeId);
            if (!target) return false;
            return handleEdgeLengthChange(target.startIndex, lengthMm);
          }}
          circleRadiusMm={circleRadiusMm ?? undefined}
          onChangeCircleRadiusMm={(next) => handleCircleRadiusChange(next)}
          onToggleResults={() => setShowResults((v) => !v)}
          showResults={showResults}
          substructureAuto={{
            primaryLenM: out.substructure.primaryLenM,
            secondaryLenM: out.substructure.secondaryLenM,
          }}
          substructureOverridesMm={{
            primaryLenMm: plan.substructureOverrides?.primaryLenMm,
            secondaryLenMm: plan.substructureOverrides?.secondaryLenMm,
          }}
          onChangeSubstructureOverridesMm={(next) =>
            setPlan((prev) => ({ ...prev, substructureOverrides: next }))
          }
          stairs={plan.stairs}
          onChangeStairs={(next) => setPlan((prev) => ({ ...prev, stairs: next }))}
          cutouts={plan.polygon.holes ?? []}
          onAddCutout={handleAddCutout}
          onDeleteCutout={handleDeleteCutout}
          cutoutsMeta={cutoutsMeta}
          onChangeCutout={handleChangeCutout}
        />

        <section className="canvas-pane">
          <header>데크 캔버스</header>
          <div className="canvas-surface">
            <div style={{ flex: 1, display: "flex" }}>
              <DeckCanvas
                polygon={plan.polygon}
                viewMode={viewMode}
                onChangePolygon={handlePolygonChange}
                onSelectShape={(shapeId) => applyPresetShape(shapeId as ShapeType)}
                structureLayout={out.structureLayout}
                shapeType={shapeType}
                attachedEdgeIndices={plan.attachedEdgeIndices ?? []}
                onChangeAttachedEdgeIndices={(next) =>
                  setPlan((prev) => ({ ...prev, attachedEdgeIndices: next }))
                }
                onToggleViewMode={() =>
                  setViewMode((prev) => (prev === "deck" ? "substructure" : "deck"))
                }
              />
            </div>
          </div>
        </section>
      </div>

      <ResultsPanel
        show={showResults}
        onClose={() => setShowResults(false)}
        effectiveMode={effectiveMode}
        out={out}
        cutPlan={cutPlan}
      />
    </div>
  );
}
