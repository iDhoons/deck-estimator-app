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
import { CutPlanView } from "./components/CutPlanView";
import { DeckCanvas, type ViewMode } from "./components/DeckCanvas";
import { ControlsPanel } from "./components/ControlSpanel";
import { ResultsPanel } from "./components/ResultsPanel";

type Mode = "consumer" | "pro";

const product: Product = {
  id: "DN34",
  name: "DN34",
  stockLengthMm: 3000,
  widthOptionsMm: [95, 120, 140, 150],
  thicknessMm: 25,
  gapMm: 5,
  fasteningModes: ["clip", "screw"],
};

const initialPlan: Plan = {
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

export default function App() {
  // --- State
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [mode, setMode] = useState<Mode | null>(null);
  const effectiveMode: Mode = mode ?? "consumer";
  const [fastening, setFastening] = useState<FasteningMode>("clip");
  const [proViewMode, setProViewMode] = useState<ViewMode>("deck");
  const [showResults, setShowResults] = useState(false);

  // --- Handlers
  const handlePolygonChange = useCallback(
    (updatedPolygon: Polygon) => {
      setPlan((prev) => ({ ...prev, polygon: updatedPolygon }));
    },
    []
  );

  // --- Derived
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

  const viewMode: ViewMode = effectiveMode === "pro" ? proViewMode : "deck";

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
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ color: "red", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        RENDER TEST (보이면 CSS/렌더 OK)
      </div>

      <h1 style={{ margin: "0 0 12px" }}>{t.appTitle}</h1>

      <ControlsPanel
        effectiveMode={effectiveMode}
        fastening={fastening}
        setFastening={setFastening}
        proViewMode={proViewMode}
        setProViewMode={setProViewMode}
        t={t}
      />

      <div style={{ marginBottom: 16 }}>
        <DeckCanvas
          polygon={plan.polygon}
          viewMode={viewMode}
          onChangePolygon={handlePolygonChange}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowResults((v) => !v)}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #333",
            background: "#fff",
            color: "#111",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {showResults ? "결과 닫기" : "결과 보기"}
        </button>
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
