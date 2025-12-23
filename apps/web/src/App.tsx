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
export type ShapeType = "rectangle" | "lShape" | "tShape" | "circle" | "free";

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
    outer: fitShapeToCanvas(SHAPE_PRESETS.rectangle.getPoints()),
  },
};

export default function App() {
  // --- State
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [mode, setMode] = useState<Mode | null>(null);
  const fastening: FasteningMode = "clip";
  const [viewMode, setViewMode] = useState<ViewMode>("deck");
  const [showResults, setShowResults] = useState(false);
  const [shapeType, setShapeType] = useState<ShapeType>("rectangle");

  // --- Handlers
  const handlePolygonChange = useCallback((updatedPolygon: Polygon) => {
    setPlan((prev) => ({ ...prev, polygon: updatedPolygon }));
    
    // polygon이 변경될 때 shapeType 자동 감지 (현재 자유형 모드가 아닐 때만)
    if (shapeType !== "free") {
      const pointCount = updatedPolygon.outer.length;
      let detectedShape: ShapeType = "free";
      
      if (pointCount === 0) {
        detectedShape = "free";
      } else if (pointCount === 4) {
        detectedShape = "rectangle";
      } else if (pointCount === 6) {
        detectedShape = "lShape";
      } else if (pointCount === 8) {
        detectedShape = "tShape";
      } else if (pointCount === 16) {
        detectedShape = "circle";
      } else {
        detectedShape = "free";
      }
      
      if (detectedShape !== "free") {
        setShapeType(detectedShape);
      }
    }
  }, [shapeType]);

  const applyPresetShape = useCallback(
    (nextShape: ShapeType) => {
      // Free drawing mode: 캔버스 초기화하여 새로 그리기 시작
      if (nextShape === "free") {
        setShapeType("free");
        setPlan((prev) => ({
          ...prev,
          polygon: {
            ...prev.polygon,
            outer: [], // 빈 배열로 초기화
          },
        }));
        return;
      }

      setShapeType(nextShape);
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
    []
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

      // 원형은 변 길이 입력 자체를 없앰 (반지름 핸들만 사용)
      if (shapeType === "circle" && allItems.length === 16) {
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

  const handleEdgeLengthChange = useCallback((startIndex: number, nextLengthMm: number) => {
    const targetLength = Math.round(nextLengthMm / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
    let didUpdate = false;
    setPlan((prev) => {
      const points = prev.polygon.outer;
      const isRectangle = shapeType === "rectangle" && points.length === 4;
      
      if (isRectangle) {
        // 직사각형 전용 로직: 평행한 변이 함께 움직여 직사각형 형태 유지
        const [A, B, C, D] = points;
        let newPoints: typeof points;
        
        if (startIndex === 0) {
          // A-B (가로) 수정: A,D는 왼쪽으로, B,C는 오른쪽으로
          const currentLength = Math.hypot(B.xMm - A.xMm, B.yMm - A.yMm);
          if (currentLength < 1) return prev;
          const delta = (targetLength - currentLength) / 2;
          const dirX = (B.xMm - A.xMm) / currentLength;
          const dirY = (B.yMm - A.yMm) / currentLength;
          
          newPoints = [
            { xMm: A.xMm - dirX * delta, yMm: A.yMm - dirY * delta },
            { xMm: B.xMm + dirX * delta, yMm: B.yMm + dirY * delta },
            { xMm: C.xMm + dirX * delta, yMm: C.yMm + dirY * delta },
            { xMm: D.xMm - dirX * delta, yMm: D.yMm - dirY * delta },
          ];
        } else if (startIndex === 1) {
          // B-C (세로) 수정: A,B는 위로, D,C는 아래로
          const currentLength = Math.hypot(C.xMm - B.xMm, C.yMm - B.yMm);
          if (currentLength < 1) return prev;
          const delta = (targetLength - currentLength) / 2;
          const dirX = (C.xMm - B.xMm) / currentLength;
          const dirY = (C.yMm - B.yMm) / currentLength;
          
          newPoints = [
            { xMm: A.xMm - dirX * delta, yMm: A.yMm - dirY * delta },
            { xMm: B.xMm - dirX * delta, yMm: B.yMm - dirY * delta },
            { xMm: C.xMm + dirX * delta, yMm: C.yMm + dirY * delta },
            { xMm: D.xMm + dirX * delta, yMm: D.yMm + dirY * delta },
          ];
        } else {
          return prev;
        }
        
        didUpdate = true;
        return { ...prev, polygon: { ...prev.polygon, outer: newPoints } };
      }
      
      // 직사각형이 아닌 경우 기존 로직
      const updatedOuter = updateEdgeLength(points, startIndex, targetLength, {
        minLengthMm: MIN_EDGE_SPAN_MM,
      });
      if (!updatedOuter) return prev;
      didUpdate = true;
      return { ...prev, polygon: { ...prev.polygon, outer: updatedOuter } };
    });
    return didUpdate;
  }, [shapeType]);


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
        onToggleResults={() => setShowResults((v) => !v)}
          showResults={showResults}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
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
