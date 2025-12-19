import { useCallback, useMemo, useState } from "react";
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
import { ControlsPanel } from "./components/ControlsPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { fitPointsToViewport } from "./geometry/polygon";
import { EDGE_LENGTH_STEP_MM, getEdgeList, MIN_EDGE_SPAN_MM, updateEdgeLength } from "./geometry/edges";

type Mode = "consumer" | "pro";
type ShapeType = "rectangle" | "lShape" | "tShape" | "circle" | "free";

const VIEWBOX_SIZE = { width: 2000, height: 1200 };
const VIEWBOX_CENTER = { x: VIEWBOX_SIZE.width / 2, y: VIEWBOX_SIZE.height / 2 };

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
  stairs: {
    enabled: true,
    footprintPolygon: {
      outer: [
        { xMm: 0, yMm: 1000 },
        { xMm: 1000, yMm: 1000 },
        { xMm: 1000, yMm: 1300 },
        { xMm: 0, yMm: 1300 },
      ],
    },
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
      { xMm: 1000, yMm: 600 },
      { xMm: 0, yMm: 600 },
    ],
  },
  lShape: {
    label: "ㄱ자형",
    getPoints: () => [
      { xMm: 0, yMm: 0 },
      { xMm: 1800, yMm: 0 },
      { xMm: 1800, yMm: 500 },
      { xMm: 700, yMm: 500 },
      { xMm: 700, yMm: 1400 },
      { xMm: 0, yMm: 1400 },
    ],
  },
  tShape: {
    label: "T자형",
    getPoints: () => [
      { xMm: 600, yMm: 0 },
      { xMm: 2200, yMm: 0 },
      { xMm: 2200, yMm: 400 },
      { xMm: 1600, yMm: 400 },
      { xMm: 1600, yMm: 1400 },
      { xMm: 1200, yMm: 1400 },
      { xMm: 1200, yMm: 400 },
      { xMm: 600, yMm: 400 },
    ],
  },
  circle: {
    label: "원형",
    getPoints: () => {
      const radius = 550;
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

const fitShapeToCanvas = (points: { xMm: number; yMm: number }[]) =>
  fitPointsToViewport(points, VIEWBOX_SIZE, VIEWBOX_CENTER, 0.5);

const initialPlan: Plan = {
  ...basePlan,
  polygon: {
    ...basePlan.polygon,
    outer: fitShapeToCanvas(basePlan.polygon.outer),
  },
};

export default function App() {
  // --- State
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [mode, setMode] = useState<Mode | null>(null);
  const fastening: FasteningMode = "clip";
  const [viewMode] = useState<ViewMode>("deck");
  const [showResults, setShowResults] = useState(false);
  const [shapeType, setShapeType] = useState<ShapeType>("rectangle");
  const [isRoundedEnabled, setIsRoundedEnabled] = useState(false);
  const [cornerRadiusMm, setCornerRadiusMm] = useState(40);

  // --- Handlers
  const handlePolygonChange = useCallback((updatedPolygon: Polygon) => {
    setPlan((prev) => ({ ...prev, polygon: updatedPolygon }));
  }, []);

  const applyPresetShape = useCallback(
    (nextShape: ShapeType) => {
      if (nextShape === shapeType) return;

      setShapeType(nextShape);
      if (nextShape === "free") {
        // Free drawing mode: start with empty canvas
        setPlan((prev) => ({
          ...prev,
          polygon: {
            ...prev.polygon,
            outer: [],
          },
        }));
        return;
      }
      const preset = SHAPE_PRESETS[nextShape];
      const centered = fitShapeToCanvas(preset.getPoints());
      setPlan((prev) => ({
        ...prev,
        polygon: {
          ...prev.polygon,
          outer: centered,
        },
      }));
    },
    [shapeType]
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
    () =>
      edgeList.map((edge) => ({
        id: edge.id,
        label: `${edge.fromLabel}–${edge.toLabel}`,
        lengthMm: edge.lengthMm,
        startIndex: edge.startIndex,
        endIndex: edge.endIndex,
      })),
    [edgeList]
  );

  const handleEdgeLengthChange = useCallback((startIndex: number, nextLengthMm: number) => {
    const targetLength = Math.round(nextLengthMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
    let didUpdate = false;
    setPlan((prev) => {
      const updatedOuter = updateEdgeLength(prev.polygon.outer, startIndex, targetLength, {
        minLengthMm: MIN_EDGE_SPAN_MM,
      });
      if (!updatedOuter) return prev;
      didUpdate = true;
      return { ...prev, polygon: { ...prev.polygon, outer: updatedOuter } };
    });
    return didUpdate;
  }, []);

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
      <header className="app-header">
        <h1>{t.appTitle}</h1>
        <div style={{ fontSize: 14, color: "#555" }}>
          모드: {effectiveMode === "pro" ? "전문가" : "일반"}
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
        isRoundedEnabled={isRoundedEnabled}
        cornerRadiusMm={cornerRadiusMm}
        onRadiusChange={setCornerRadiusMm}
        onToggleRounding={() => setIsRoundedEnabled((v) => !v)}
        onToggleResults={() => setShowResults((v) => !v)}
          showResults={showResults}
        />

        <section className="canvas-pane">
          <header>데크 캔버스</header>
          <div className="canvas-surface">
            <div style={{ flex: 1, display: "flex" }}>
              <DeckCanvas
                polygon={plan.polygon}
                viewMode={viewMode}
                onChangePolygon={handlePolygonChange}
                isRoundedEnabled={isRoundedEnabled}
                cornerRadiusMm={cornerRadiusMm}
                shapeType={shapeType}
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
