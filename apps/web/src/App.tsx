import { useRef, useMemo, useState } from "react";
import {
  calculateQuantities,
  buildCutPlan,
  type FasteningMode,
  type Ruleset,
} from "@deck/core";
import { t } from "./i18n";
import { DeckCanvas, type ViewMode } from "./components/DeckCanvas";
import { FreeDrawCanvas } from "./components/FreeDrawCanvas";
import { ControlsPanel } from "./components/ControlsPanel";
import { ResultsPanel } from "./components/ResultsPanel";
import { getEdgeList } from "./geometry/edges";
import { polygonCentroid } from "./geometry/polygon";
import { useDeckProject } from "./hooks/useDeckProject";
import { persistence } from "./utils/persistence";
import { BASE_RULES, SHAPE_PRESETS, PRODUCT_DEFAULTS } from "./constants/defaults";
import { type ShapeType } from "./types";

type Mode = "consumer" | "pro";

export default function App() {
  // --- Hooks
  const { project, actions, resetHistory } = useDeckProject();
  const { plan, cutoutsMeta, shapeType } = project;

  // --- Local State (UI only)
  const [mode, setMode] = useState<Mode | null>(null);
  const fastening: FasteningMode = "clip";
  const [viewMode, setViewMode] = useState<ViewMode>("deck");
  const [showResults, setShowResults] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track if free-form polygon is closed (completed)
  const [isFreeFormClosed, setIsFreeFormClosed] = useState(false);

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
      alert("프로젝트를 불러왔습니다.");
    } catch (err) {
      console.error(err);
      alert("파일을 불러오는데 실패했습니다.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // --- Derived
  const effectiveMode: Mode = mode ?? "consumer";

  const rules: Ruleset = useMemo(
    () => ({ ...BASE_RULES, mode: effectiveMode }),
    [effectiveMode]
  );

  const out = useMemo(() => {
    return calculateQuantities(plan, PRODUCT_DEFAULTS, rules, fastening);
  }, [plan, rules, fastening]);

  const cutPlan = useMemo(() => {
    if (effectiveMode !== "pro") return null;
    return buildCutPlan(plan, PRODUCT_DEFAULTS, rules);
  }, [effectiveMode, plan, rules]);

  const edgeList = useMemo(() => getEdgeList(plan.polygon.outer), [plan.polygon.outer]);

  const shapeOptions = useMemo(
    () => [
      { id: "rectangle", label: SHAPE_PRESETS.rectangle.label },
      { id: "lShape", label: SHAPE_PRESETS.lShape.label },
      { id: "tShape", label: SHAPE_PRESETS.tShape.label },
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

      if (shapeType === "rectangle" && allItems.length === 4) {
        return allItems.slice(0, 2);
      }

      if (shapeType === "lShape" && allItems.length === 6) {
        return allItems.filter((_, idx) => idx !== 0 && idx !== 5);
      }

      if (shapeType === "tShape" && allItems.length === 8) {
        return allItems.filter((_, idx) => idx !== 0 && idx !== 7);
      }

      return allItems;
    },
    [edgeList, shapeType]
  );



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

  // --- Handlers from hook
  const {
    applyPresetShape,
    changeEdgeLength,
    setPlan: setPlanAction,
    updatePolygon,
    addCutout,
    deleteCutout,
    changeCutout
  } = actions;

  // --- Free Drawing Condition
  // Show FreeDrawCanvas only when:
  // 1. shapeType is 'free' AND
  // 2. polygon is not closed yet (user hasn't clicked on first vertex to complete)
  // Once the polygon is closed, use DeckCanvas for consistent editing experience
  const isFreeShape = shapeType === "free";
  const showFreeDraw = isFreeShape && !isFreeFormClosed;

  // DEBUG
  console.log('[DEBUG App] shapeType:', shapeType, 'isFreeFormClosed:', isFreeFormClosed, 'showFreeDraw:', showFreeDraw, 'outer.length:', plan.polygon.outer.length, 'edgeList.length:', edgeList.length);

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
        {/* Controls Panel - Hide most controls when in Free Draw creation mode */}
        <ControlsPanel
          shapeOptions={shapeOptions}
          selectedShapeId={shapeType}
          onSelectShape={(shapeId) => {
            applyPresetShape(shapeId as ShapeType);
            // Reset free-form closed state when switching shapes
            if (shapeId === "free") {
              setIsFreeFormClosed(false);
            } else {
              // For presets, mark as closed since they're complete shapes
              setIsFreeFormClosed(true);
            }
          }}
          dimensions={showFreeDraw ? [] : dimensionItems}
          onChangeDimensionLength={(edgeId, lengthMm) => {
            const target = dimensionItems.find((edge) => edge.id === edgeId);
            if (!target) return false;
            return changeEdgeLength(target.startIndex, lengthMm);
          }}
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
            setPlanAction((prev) => ({ ...prev, substructureOverrides: next }))
          }
          stairs={plan.stairs}
          onChangeStairs={(next) => setPlanAction((prev) => ({ ...prev, stairs: next }))}
          cutouts={plan.polygon.holes ?? []}
          onAddCutout={addCutout}
          onDeleteCutout={deleteCutout}
          cutoutsMeta={cutoutsMeta}
          onChangeCutout={changeCutout}
          attachedEdgeIndices={plan.attachedEdgeIndices}
          onChangeAttachedEdgeIndices={(indices) => {
            console.log('[DEBUG App] onChangeAttachedEdgeIndices called with:', indices);
            setPlanAction((prev) => ({ ...prev, attachedEdgeIndices: indices }));
          }}
          fasciaEdgeIndices={plan.fasciaEdgeIndices}
          onChangeFasciaEdgeIndices={(indices) => {
            console.log('[DEBUG App] onChangeFasciaEdgeIndices called with:', indices);
            setPlanAction((prev) => ({ ...prev, fasciaEdgeIndices: indices }));
          }}
          allEdges={edgeList}
        />

        <section className="canvas-pane">
          <header>데크 캔버스</header>
          <div className="canvas-surface">
            <div style={{ flex: 1, display: "flex" }}>
              {showFreeDraw ? (
                <FreeDrawCanvas
                  initialPoints={plan.polygon.outer}
                  onPolygonComplete={(points) => {
                    updatePolygon({ outer: points });
                    setIsFreeFormClosed(true);
                  }}
                  onPolygonChange={(points) => {
                    updatePolygon({ outer: points });
                  }}
                />
              ) : (
                <DeckCanvas
                  polygon={plan.polygon}
                  viewMode={viewMode}
                  onChangePolygon={updatePolygon}
                  structureLayout={out.structureLayout}
                  shapeType={shapeType}
                  attachedEdgeIndices={plan.attachedEdgeIndices ?? []}
                  onChangeAttachedEdgeIndices={(next) =>
                    setPlanAction((prev) => ({ ...prev, attachedEdgeIndices: next }))
                  }
                  fasciaEdgeIndices={plan.fasciaEdgeIndices ?? []}
                  onToggleViewMode={() =>
                    setViewMode((prev) => (prev === "deck" ? "substructure" : "deck"))
                  }
                  cutoutsMeta={cutoutsMeta}
                  onChangeCutout={changeCutout}
                />
              )}
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
