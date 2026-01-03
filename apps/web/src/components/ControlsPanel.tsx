import { useCallback, useState, memo } from "react";
import { EDGE_LENGTH_STEP_MM, MIN_EDGE_SPAN_MM, type EdgeInfo } from "../geometry/edges";
import type { CutoutShape } from "../types";
import type { FoundationType, SubstructureConfig } from "@deck/core";

// Toggle Switch Component - extracted outside to prevent recreation on each render
const ToggleSwitch = memo(function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 13 }}>{label}</span>
      <div
        style={{
          width: 40,
          height: 20,
          borderRadius: 10,
          background: checked ? "#4CAF50" : "#ccc",
          position: "relative",
          transition: "background 0.2s",
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            position: "absolute",
            top: 2,
            left: checked ? 22 : 2,
            transition: "left 0.2s",
          }}
        />
      </div>
    </div>
  );
});

type ShapeOption = {
  id: string;
  label: string;
};

type DimensionItem = {
  id: string;
  label: string;
  lengthMm: number;
  startIndex: number;
  endIndex: number;
};

type StairConfig = {
  id: string;
  sideIndex: number;
  startMm: number;
  widthMm: number;
  stepCount: number;
  stepDepthMm: number;
  stepHeightMm: number;
  closedRisers?: boolean;
  foundation?: {
    padsQty?: number;
    pilesQty?: number;
  };
};

export function ControlsPanel({
  shapeOptions,
  selectedShapeId,
  onSelectShape,
  dimensions,
  onChangeDimensionLength,
  onToggleResults,
  showResults,
  substructureAuto,
  substructureOverridesMm,
  onChangeSubstructureOverridesMm,
  stairs,
  onChangeStairs,
  cutouts,
  onAddCutout,
  onDeleteCutout,
  cutoutsMeta,
  onChangeCutout,
  attachedEdgeIndices,
  onChangeAttachedEdgeIndices,
  fasciaEdgeIndices,
  onChangeFasciaEdgeIndices,
  allEdges,
  substructureConfig,
  onChangeSubstructureConfig,
  deckThicknessMm,
}: {
  shapeOptions: ShapeOption[];
  selectedShapeId: string;
  onSelectShape: (id: string) => void;
  dimensions: DimensionItem[];
  onChangeDimensionLength: (edgeId: string, nextLengthMm: number) => boolean;
  onToggleResults: () => void;
  showResults: boolean;
  substructureAuto?: { primaryLenM: number; secondaryLenM: number };
  substructureOverridesMm?: { primaryLenMm?: number; secondaryLenMm?: number };
  onChangeSubstructureOverridesMm?: (next: {
    primaryLenMm?: number;
    secondaryLenMm?: number;
  }) => void;
  stairs?: {
    enabled: boolean;
    items: StairConfig[];
    stringerMaterialOverrides?: { thicknessMm?: number; widthMm?: number; stockLengthMm?: number };
  };
  onChangeStairs?: (next: {
    enabled: boolean;
    items: StairConfig[];
    stringerMaterialOverrides?: { thicknessMm?: number; widthMm?: number; stockLengthMm?: number };
  }) => void;
  cutouts?: { xMm: number; yMm: number }[][];
  cutoutsMeta?: {
    shape: CutoutShape;
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
  }[];
  onAddCutout?: () => void;
  onDeleteCutout?: (index: number) => void;
  onChangeCutout?: (
    index: number,
    next: { shape: CutoutShape; xMm: number; yMm: number; widthMm: number; heightMm: number },
  ) => void;
  attachedEdgeIndices?: number[];
  onChangeAttachedEdgeIndices?: (indices: number[]) => void;
  fasciaEdgeIndices?: number[];
  onChangeFasciaEdgeIndices?: (indices: number[]) => void;
  allEdges?: EdgeInfo[];
  substructureConfig?: SubstructureConfig;
  onChangeSubstructureConfig?: (config: SubstructureConfig) => void;
  deckThicknessMm?: number;
}) {
  const sectionIds = [
    "floor",
    "cutout",
    "steps",
    "sides",
    "decking",
    "edging",
    "laying",
    "substructure",
  ] as const;
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const id of sectionIds) initial[id] = id === "floor";
    return initial;
  });

  // Track which inputs are being actively edited (to prevent overwriting user input)
  const [editingInputs, setEditingInputs] = useState<Record<string, string>>({});
  const [cutoutOpenMap, setCutoutOpenMap] = useState<Record<number, boolean>>({});

  // Stairs local state
  const [stairOpenMap, setStairOpenMap] = useState<Record<string, boolean>>({});

  // Decking spec local state
  const [deckingSpec, setDeckingSpec] = useState({
    thicknessMm: 25,
    widthMm: 140,
    lengthMm: 3000,
  });
  const [deckingCustomInput, setDeckingCustomInput] = useState({
    thickness: "",
    width: "",
    length: "",
  });
  // Applied decking spec (shown after clicking apply button)
  const [appliedDeckingSpec, setAppliedDeckingSpec] = useState<{
    thicknessMm: number;
    widthMm: number;
    lengthMm: number;
  } | null>(null);

  const currentCutoutsLength = cutouts?.length ?? 0;

  const quickSummary = (text: string) => (
    <p style={{ fontSize: 13, color: "#555", margin: 0 }}>{text}</p>
  );

  const formatLength = useCallback(
    (lengthMm: number) => Math.round(lengthMm).toLocaleString("ko-KR"),
    [],
  );

  // Helper to get input value - returns editing value if being edited, otherwise derived from props
  const getInputValue = useCallback(
    (key: string, defaultValue: string) => {
      return editingInputs[key] !== undefined ? editingInputs[key] : defaultValue;
    },
    [editingInputs],
  );

  // Helper to start editing an input
  const startEditing = useCallback((key: string, value: string) => {
    setEditingInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Helper to finish editing an input
  const finishEditing = useCallback((key: string) => {
    setEditingInputs((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const toggleSection = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const updateSubConfig = (updates: Partial<SubstructureConfig>) => {
    if (!substructureConfig || !onChangeSubstructureConfig) return;
    onChangeSubstructureConfig({ ...substructureConfig, ...updates });
  };

  const floorPlanContent = (
    <>
      <div className="shape-grid">
        {shapeOptions.map((shape) => (
          <button
            key={shape.id}
            className={`shape-button${selectedShapeId === shape.id ? " is-active" : ""}`}
            onClick={() => onSelectShape(shape.id)}
            type="button"
          >
            {shape.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>변 길이</div>
          {dimensions.length > 0 ? (
            <div className="dimension-list">
              {dimensions.map((item) => {
                const inputKey = `dim-${item.id}`;
                const displayValue = getInputValue(inputKey, formatLength(item.lengthMm));
                return (
                  <div key={item.id} className="dimension-item">
                    <span>{item.label}</span>
                    <div className="dimension-input-row">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={displayValue}
                        onChange={(e) => startEditing(inputKey, e.target.value)}
                        onFocus={(e) => {
                          startEditing(inputKey, formatLength(item.lengthMm));
                          e.currentTarget.select();
                        }}
                        onBlur={() => {
                          const raw = (editingInputs[inputKey] ?? "").trim();
                          const parsed = Number(raw.replace(/,/g, ""));
                          const snapped =
                            Math.round(parsed / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
                          if (
                            !Number.isFinite(parsed) ||
                            snapped <= 0 ||
                            snapped < MIN_EDGE_SPAN_MM
                          ) {
                            finishEditing(inputKey);
                            return;
                          }
                          onChangeDimensionLength(item.id, snapped);
                          finishEditing(inputKey);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            finishEditing(inputKey);
                            e.currentTarget.blur();
                          }
                        }}
                        className="dimension-input"
                      />
                      <span className="dimension-unit">mm</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#777" }}>변 정보를 찾을 수 없습니다.</div>
          )}
        </>
      </div>
    </>
  );

  const cutoutContent = (
    <div style={{ display: "grid", gap: 12 }}>
      {quickSummary("데크 내부의 설치되지 않는 영역(개구부)을 추가합니다.")}

      <button
        type="button"
        className="controls-action-button"
        onClick={() => {
          const nextIndex = currentCutoutsLength;
          onAddCutout?.();
          // setState-in-effect 규칙 준수를 위해 이벤트 핸들러에서만 자동 오픈 처리
          setCutoutOpenMap({ [nextIndex]: true });
        }}
        onKeyDown={(e) => {
          // 스페이스바로 버튼이 클릭되는 것 방지
          if (e.key === " ") {
            e.preventDefault();
          }
        }}
        style={{
          borderColor: "#ff6b6b",
          color: "#ff6b6b",
        }}
      >
        개구부 추가
      </button>

      <div style={{ fontSize: 13, color: "#555" }}>
        현재 개구부: <b>{cutouts?.length ?? 0}</b>개
      </div>

      {(cutouts?.length ?? 0) > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {(cutouts ?? []).map((pts, idx) => {
            const meta = (cutoutsMeta ?? [])[idx];
            const isOpen = !!cutoutOpenMap[idx];
            const title = `개구부 A${idx + 1}`;
            const shape = meta?.shape ?? "rectangle";

            const update = (
              partial: Partial<{
                shape: CutoutShape;
                xMm: number;
                yMm: number;
                widthMm: number;
                heightMm: number;
              }>,
            ) => {
              if (!meta || !onChangeCutout) return;
              onChangeCutout(idx, { ...meta, ...partial });
            };

            const getFieldValue = (key: "x" | "y" | "w" | "h") => {
              const inputKey = `cutout-${idx}-${key}`;
              if (editingInputs[inputKey] !== undefined) return editingInputs[inputKey];
              if (!meta) return "";
              const v =
                key === "x"
                  ? meta.xMm
                  : key === "y"
                    ? meta.yMm
                    : key === "w"
                      ? meta.widthMm
                      : meta.heightMm;
              return String(Math.round(v));
            };

            const onFieldChange = (key: "x" | "y" | "w" | "h", value: string) => {
              startEditing(`cutout-${idx}-${key}`, value);
            };

            const commitNumber = (key: "x" | "y" | "w" | "h") => {
              const inputKey = `cutout-${idx}-${key}`;
              if (!meta || !onChangeCutout) {
                finishEditing(inputKey);
                return;
              }
              const raw = (editingInputs[inputKey] ?? "").trim();
              const parsed = Number(raw.replace(/,/g, ""));
              if (!Number.isFinite(parsed)) {
                finishEditing(inputKey);
                return;
              }
              if (key === "x") update({ xMm: parsed });
              else if (key === "y") update({ yMm: parsed });
              else if (key === "w") {
                const nextW = Math.max(1, parsed);
                update({ widthMm: nextW });
              } else {
                const nextH = Math.max(1, parsed);
                update({ heightMm: nextH });
              }
              finishEditing(inputKey);
            };

            return (
              <div
                key={`cutout-${idx}`}
                style={{
                  borderRadius: 10,
                  border: "1px solid #eee",
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCutoutOpenMap((prev) => {
                      const currentlyOpen = !!prev[idx];
                      // 이미 열려있으면 모두 닫기, 닫혀있으면 해당 것만 열기
                      return currentlyOpen ? {} : { [idx]: true };
                    })
                  }
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 12px",
                    background: "#fafafa",
                    border: "none",
                    cursor: "pointer",
                    fontWeight: 800,
                    color: "#333",
                  }}
                >
                  <span>{title}</span>
                  <span style={{ fontWeight: 900 }}>{isOpen ? "▴" : "▾"}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: 12, display: "grid", gap: 12 }}>
                    <div style={{ fontSize: 13, color: "#666" }}>영역 형태를 선택하세요</div>

                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      {(
                        [
                          { id: "rectangle" as const, label: "□" },
                          { id: "free" as const, label: "✎" },
                        ] as const
                      ).map((s) => {
                        const active = shape === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => update({ shape: s.id })}
                            style={{
                              width: 46,
                              height: 46,
                              borderRadius: 10,
                              border: active ? "2px solid #ff6b6b" : "1px solid #ccc",
                              background: "#fff",
                              fontSize: 22,
                              fontWeight: 900,
                              color: active ? "#ff6b6b" : "#333",
                              cursor: meta && onChangeCutout ? "pointer" : "not-allowed",
                            }}
                            aria-label={s.id}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>좌표</div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>X (mm)</div>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={getFieldValue("x")}
                            onChange={(e) => onFieldChange("x", e.target.value)}
                            onBlur={() => commitNumber("x")}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #ccc",
                            }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Y (mm)</div>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={getFieldValue("y")}
                            onChange={(e) => onFieldChange("y", e.target.value)}
                            onBlur={() => commitNumber("y")}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #ccc",
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>영역 치수</div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                            길이 (mm)
                          </div>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={getFieldValue("w")}
                            onChange={(e) => onFieldChange("w", e.target.value)}
                            onBlur={() => commitNumber("w")}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #ccc",
                            }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                            너비 (mm)
                          </div>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={getFieldValue("h")}
                            onChange={(e) => onFieldChange("h", e.target.value)}
                            onBlur={() => commitNumber("h")}
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #ccc",
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: 12, color: "#777" }}>점 {pts.length}개</div>
                      <button
                        type="button"
                        onClick={() => {
                          onDeleteCutout?.(idx);
                          // 삭제 후 선택 상태 정리(기본값: 모두 닫기)
                          setCutoutOpenMap((prev) => {
                            const next = { ...prev };
                            delete next[idx];
                            return next;
                          });
                        }}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #ffb4b4",
                          background: "#fff1f1",
                          color: "#c52222",
                          cursor: onDeleteCutout ? "pointer" : "not-allowed",
                          fontWeight: 800,
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const stairsContent = (
    <div style={{ display: "grid", gap: 12 }}>
      {quickSummary("어느 변에 계단이 필요한가요?")}

      <button
        type="button"
        className="controls-action-button"
        onClick={() => {
          if (!stairs || !onChangeStairs) return;
          const newItem: StairConfig = {
            id: Math.random().toString(36).substr(2, 9),
            sideIndex: 0,
            startMm: 0,
            widthMm: 1000,
            stepCount: 3,
            stepDepthMm: 300,
            stepHeightMm: 156,
            closedRisers: false,
          };
          onChangeStairs({ ...stairs, items: [...(stairs.items ?? []), newItem] });
          // Open the new item
          setStairOpenMap((prev) => ({ ...prev, [newItem.id]: true }));
        }}
        style={{ borderColor: "#444", color: "#333" }}
        disabled={!stairs?.enabled}
      >
        계단 추가
      </button>

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={stairs?.enabled ?? false}
          onChange={(e) => {
            if (!stairs || !onChangeStairs) return;
            onChangeStairs({ ...stairs, enabled: e.target.checked });
          }}
        />
        <span style={{ fontWeight: 700 }}>계단 사용 활성화</span>
      </label>

      {stairs?.enabled && (stairs.items ?? []).length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {(stairs?.items ?? []).map((item, index) => {
            const isOpen = !!stairOpenMap[item.id];

            const updateItem = (partial: Partial<StairConfig>) => {
              if (!stairs || !onChangeStairs) return;
              const nextItems = stairs.items.map((it) =>
                it.id === item.id ? { ...it, ...partial } : it,
              );
              onChangeStairs({ ...stairs, items: nextItems });
            };

            const getStairField = (key: string) => {
              const inputKey = `stair-${item.id}-${key}`;
              if (editingInputs[inputKey] !== undefined) return editingInputs[inputKey];
              if (key === "start") return String(Math.round(item.startMm));
              if (key === "width") return String(Math.round(item.widthMm));
              if (key === "depth") return String(Math.round(item.stepDepthMm));
              if (key === "height") return String(Math.round(item.stepHeightMm));
              if (key === "pads")
                return item.foundation?.padsQty !== undefined
                  ? String(item.foundation.padsQty)
                  : "";
              if (key === "piles")
                return item.foundation?.pilesQty !== undefined
                  ? String(item.foundation.pilesQty)
                  : "";
              return "";
            };

            const setStairField = (key: string, v: string) => {
              startEditing(`stair-${item.id}-${key}`, v);
            };

            const commitField = (key: "start" | "width" | "depth" | "height") => {
              const inputKey = `stair-${item.id}-${key}`;
              const raw = editingInputs[inputKey] ?? "";
              const val = Number(raw.replace(/,/g, ""));
              if (!Number.isFinite(val) || val < 0) {
                finishEditing(inputKey);
                return;
              }

              if (key === "start") updateItem({ startMm: val });
              else if (key === "width") updateItem({ widthMm: Math.max(100, val) });
              else if (key === "depth") updateItem({ stepDepthMm: Math.max(10, val) });
              else if (key === "height") updateItem({ stepHeightMm: Math.max(10, val) });
              finishEditing(inputKey);
            };

            const totalH = item.stepCount * item.stepHeightMm;
            const totalD = item.stepCount * item.stepDepthMm;

            return (
              <div
                key={item.id}
                style={{
                  borderRadius: 10,
                  border: "1px solid #eee",
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    borderBottom: isOpen ? "1px solid #eee" : "none",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setStairOpenMap((p) => ({ ...p, [item.id]: !p[item.id] }))}
                    style={{
                      flex: 1,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      background: "#fafafa",
                      border: "none",
                      cursor: "pointer",
                      fontWeight: 700,
                      color: "#333",
                      textAlign: "left",
                    }}
                  >
                    <span>계단 {index + 1}</span>
                    <span style={{ fontWeight: 900 }}>{isOpen ? "▴" : "▾"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!stairs || !onChangeStairs) return;
                      const nextItems = stairs.items.filter((it) => it.id !== item.id);
                      onChangeStairs({ ...stairs, items: nextItems });
                    }}
                    style={{
                      padding: "10px 12px",
                      background: "#fff1f1",
                      border: "none",
                      borderLeft: "1px solid #eee",
                      cursor: "pointer",
                      fontWeight: 700,
                      color: "#c52222",
                    }}
                  >
                    ×
                  </button>
                </div>

                {isOpen && (
                  <div style={{ padding: 12, display: "grid", gap: 10 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 13, color: "#555" }}>설치 변</span>
                      <select
                        value={item.sideIndex}
                        onChange={(e) => updateItem({ sideIndex: Number(e.target.value) })}
                        style={{ padding: "4px 8px", borderRadius: 6, borderColor: "#ccc" }}
                      >
                        {(allEdges || dimensions).map((dim) => (
                          <option key={dim.id} value={dim.startIndex}>
                            {dim.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 13, color: "#555" }}>시작 위치(mm)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={getStairField("start")}
                        onChange={(e) => setStairField("start", e.target.value)}
                        onBlur={() => commitField("start")}
                        style={{
                          width: 100,
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #ccc",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 13, color: "#555" }}>계단 폭(mm)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={getStairField("width")}
                        onChange={(e) => setStairField("width", e.target.value)}
                        onBlur={() => commitField("width")}
                        style={{
                          width: 100,
                          padding: "6px 8px",
                          borderRadius: 6,
                          border: "1px solid #ccc",
                        }}
                      />
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 13, color: "#555" }}>단 수</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => updateItem({ stepCount: Math.max(1, item.stepCount - 1) })}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 4,
                            border: "1px solid #ccc",
                            background: "#f0f0f0",
                          }}
                        >
                          −
                        </button>
                        <span style={{ fontWeight: 700 }}>{item.stepCount}</span>
                        <button
                          type="button"
                          onClick={() =>
                            updateItem({ stepCount: Math.min(30, item.stepCount + 1) })
                          }
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 4,
                            border: "1px solid #ccc",
                            background: "#f0f0f0",
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div style={{ fontWeight: 600, color: "#333", marginTop: 4 }}>단 치수</div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                          깊이 (mm)
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getStairField("depth")}
                          onChange={(e) => setStairField("depth", e.target.value)}
                          onBlur={() => commitField("depth")}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #ccc",
                          }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                          높이 (mm)
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getStairField("height")}
                          onChange={(e) => setStairField("height", e.target.value)}
                          onBlur={() => commitField("height")}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #ccc",
                          }}
                        />
                      </div>
                    </div>

                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={item.closedRisers ?? false}
                        onChange={(e) => updateItem({ closedRisers: e.target.checked })}
                      />
                      <span style={{ fontSize: 13, color: "#555" }}>막힘형 (챌판 적용)</span>
                    </label>

                    <div style={{ fontWeight: 600, color: "#333", marginTop: 8 }}>기초 설정</div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                          패드 수량
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getStairField("pads")}
                          onChange={(e) => setStairField("pads", e.target.value)}
                          onBlur={() => {
                            const inputKey = `stair-${item.id}-pads`;
                            const raw = editingInputs[inputKey] ?? "";
                            const val = Number(raw.replace(/,/g, ""));
                            if (raw === "" || !Number.isFinite(val) || val < 0) {
                              updateItem({
                                foundation: { ...item.foundation, padsQty: undefined },
                              });
                            } else {
                              updateItem({
                                foundation: { ...item.foundation, padsQty: Math.floor(val) },
                              });
                            }
                            finishEditing(inputKey);
                          }}
                          placeholder="0"
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #ccc",
                          }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
                          파일 수량
                        </div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getStairField("piles")}
                          onChange={(e) => setStairField("piles", e.target.value)}
                          onBlur={() => {
                            const inputKey = `stair-${item.id}-piles`;
                            const raw = editingInputs[inputKey] ?? "";
                            const val = Number(raw.replace(/,/g, ""));
                            if (raw === "" || !Number.isFinite(val) || val < 0) {
                              updateItem({
                                foundation: { ...item.foundation, pilesQty: undefined },
                              });
                            } else {
                              updateItem({
                                foundation: { ...item.foundation, pilesQty: Math.floor(val) },
                              });
                            }
                            finishEditing(inputKey);
                          }}
                          placeholder="0"
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            borderRadius: 6,
                            border: "1px solid #ccc",
                          }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 12,
                        color: "#888",
                        background: "#f9f9f9",
                        padding: 8,
                        borderRadius: 6,
                      }}
                    >
                      전체 치수: {Math.round(item.widthMm)} x {Math.round(totalD)} x{" "}
                      {Math.round(totalH)} mm
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {stairs?.enabled && (
        <div style={{ borderTop: "1px solid #eee", paddingTop: 12, marginTop: 4 }}>
          <div style={{ fontWeight: 700, color: "#333", marginBottom: 8 }}>
            측판(스트링거) 자재 공통 설정
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, color: "#555" }}>두께(mm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="자동"
                value={getInputValue(
                  "str-thk",
                  stairs.stringerMaterialOverrides?.thicknessMm
                    ? String(Math.round(stairs.stringerMaterialOverrides.thicknessMm))
                    : "",
                )}
                onChange={(e) => startEditing("str-thk", e.target.value)}
                onBlur={() => {
                  if (!onChangeStairs) return;
                  const val = Number((editingInputs["str-thk"] ?? "").replace(/,/g, ""));
                  onChangeStairs({
                    ...stairs,
                    stringerMaterialOverrides: {
                      ...stairs.stringerMaterialOverrides,
                      thicknessMm: val > 0 ? val : undefined,
                    },
                  });
                  finishEditing("str-thk");
                }}
                style={{
                  width: 100,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, color: "#555" }}>폭(mm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="자동"
                value={getInputValue(
                  "str-wid",
                  stairs.stringerMaterialOverrides?.widthMm
                    ? String(Math.round(stairs.stringerMaterialOverrides.widthMm))
                    : "",
                )}
                onChange={(e) => startEditing("str-wid", e.target.value)}
                onBlur={() => {
                  if (!onChangeStairs) return;
                  const val = Number((editingInputs["str-wid"] ?? "").replace(/,/g, ""));
                  onChangeStairs({
                    ...stairs,
                    stringerMaterialOverrides: {
                      ...stairs.stringerMaterialOverrides,
                      widthMm: val > 0 ? val : undefined,
                    },
                  });
                  finishEditing("str-wid");
                }}
                style={{
                  width: 100,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 13, color: "#555" }}>길이(mm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="자동"
                value={getInputValue(
                  "str-len",
                  stairs.stringerMaterialOverrides?.stockLengthMm
                    ? String(Math.round(stairs.stringerMaterialOverrides.stockLengthMm))
                    : "",
                )}
                onChange={(e) => startEditing("str-len", e.target.value)}
                onBlur={() => {
                  if (!onChangeStairs) return;
                  const val = Number((editingInputs["str-len"] ?? "").replace(/,/g, ""));
                  onChangeStairs({
                    ...stairs,
                    stringerMaterialOverrides: {
                      ...stairs.stringerMaterialOverrides,
                      stockLengthMm: val > 0 ? val : undefined,
                    },
                  });
                  finishEditing("str-len");
                }}
                style={{
                  width: 100,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                if (!stairs || !onChangeStairs) return;
                onChangeStairs({ ...stairs, stringerMaterialOverrides: {} });
              }}
              style={{
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              초기화
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const edgesForSides = allEdges && allEdges.length > 0 ? allEdges : dimensions;
  const hasEdges = edgesForSides.length > 0;

  // DEBUG
  console.log(
    "[DEBUG ControlsPanel] allEdges:",
    allEdges?.length,
    "dimensions:",
    dimensions.length,
    "edgesForSides:",
    edgesForSides.length,
    "hasEdges:",
    hasEdges,
    "attachedEdgeIndices:",
    attachedEdgeIndices,
  );

  const sidesContent = (
    <div style={{ display: "grid", gap: 12 }}>
      {!hasEdges ? (
        <div style={{ fontSize: 13, color: "#999", padding: "12px 0" }}>
          도형을 먼저 완성해주세요.
        </div>
      ) : (
        <>
          {/* Attached Edges (Ledger) Section */}
          <div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
              어떤 면이 벽이나 건물에 붙어있나요?
            </div>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
              (회색으로 표시됩니다)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {edgesForSides.map((dim) => {
                const isAttached = (attachedEdgeIndices ?? []).includes(dim.startIndex);
                const edgeLabel = dim.label;
                return (
                  <ToggleSwitch
                    key={dim.id}
                    label={edgeLabel}
                    checked={isAttached}
                    onChange={(checked) => {
                      console.log(
                        "[DEBUG Toggle] Attached onChange called:",
                        edgeLabel,
                        "checked:",
                        checked,
                        "onChangeAttachedEdgeIndices:",
                        !!onChangeAttachedEdgeIndices,
                      );
                      if (!onChangeAttachedEdgeIndices) return;
                      const current = new Set(attachedEdgeIndices ?? []);
                      if (checked) current.add(dim.startIndex);
                      else current.delete(dim.startIndex);
                      const newIndices = Array.from(current).sort((a, b) => a - b);
                      console.log(
                        "[DEBUG Toggle] Calling onChangeAttachedEdgeIndices with:",
                        newIndices,
                      );
                      onChangeAttachedEdgeIndices(newIndices);
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Fascia Section */}
          <div>
            <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>
              어떤 면에 측면 마감을 하나요?
            </div>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
              (빨간색으로 표시됩니다)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {edgesForSides.map((dim) => {
                const hasFascia = (fasciaEdgeIndices ?? []).includes(dim.startIndex);
                const edgeLabel = dim.label;
                return (
                  <ToggleSwitch
                    key={dim.id}
                    label={edgeLabel}
                    checked={hasFascia}
                    onChange={(checked) => {
                      if (!onChangeFasciaEdgeIndices) return;
                      const current = new Set(fasciaEdgeIndices ?? []);
                      if (checked) current.add(dim.startIndex);
                      else current.delete(dim.startIndex);
                      onChangeFasciaEdgeIndices(Array.from(current).sort((a, b) => a - b));
                    }}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const getSubValue = (key: "primary" | "secondary") => {
    const inputKey = `sub-${key}`;
    if (editingInputs[inputKey] !== undefined) return editingInputs[inputKey];
    const val =
      key === "primary"
        ? substructureOverridesMm?.primaryLenMm
        : substructureOverridesMm?.secondaryLenMm;
    return val !== undefined ? String(Math.round(val)) : "";
  };

  const applySubOverride = (key: "primary" | "secondary") => {
    const inputKey = `sub-${key}`;
    if (!onChangeSubstructureOverridesMm) {
      finishEditing(inputKey);
      return;
    }
    const raw = (editingInputs[inputKey] ?? "").trim();
    const parsed = raw === "" ? undefined : Number(raw.replace(/,/g, ""));
    if (parsed !== undefined && (!Number.isFinite(parsed) || parsed <= 0)) {
      finishEditing(inputKey);
      return;
    }
    const next = { ...(substructureOverridesMm ?? {}) };
    if (key === "primary") next.primaryLenMm = parsed;
    else next.secondaryLenMm = parsed;
    onChangeSubstructureOverridesMm(next);
    finishEditing(inputKey);
  };

  const sections = [
    { id: "floor", title: "평면도", content: floorPlanContent },
    { id: "cutout", title: "개구부", content: cutoutContent },
    { id: "steps", title: "계단", content: stairsContent },
    { id: "sides", title: "측면", content: sidesContent },
    {
      id: "decking",
      title: "데크재",
      content: (() => {
        const isThicknessCustom =
          ![19, 20, 25].includes(deckingSpec.thicknessMm) || deckingCustomInput.thickness !== "";
        const isWidthCustom =
          ![95, 120, 140, 150].includes(deckingSpec.widthMm) || deckingCustomInput.width !== "";
        const isLengthCustom =
          ![2000, 2400, 2800, 3000].includes(deckingSpec.lengthMm) ||
          deckingCustomInput.length !== "";

        return (
          <div style={{ display: "grid", gap: 12 }}>
            {quickSummary("데크재 사양을 선택하세요.")}

            {/* 가로 배열: 두께, 폭, 길이 */}
            <div style={{ display: "flex", gap: 8 }}>
              {/* 두께 */}
              <div style={{ flex: 1, display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>두께</div>
                {isThicknessCustom ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="두께"
                    value={deckingCustomInput.thickness || String(deckingSpec.thicknessMm)}
                    onChange={(e) =>
                      setDeckingCustomInput((prev) => ({ ...prev, thickness: e.target.value }))
                    }
                    onBlur={() => {
                      const val = Number(deckingCustomInput.thickness.replace(/,/g, ""));
                      if (Number.isFinite(val) && val > 0) {
                        setDeckingSpec((prev) => ({ ...prev, thicknessMm: val }));
                      }
                      // 프리셋 값이면 드롭다운으로 복귀
                      if ([19, 20, 25].includes(val)) {
                        setDeckingCustomInput((prev) => ({ ...prev, thickness: "" }));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        // ESC로 드롭다운 모드로 복귀
                        setDeckingCustomInput((prev) => ({ ...prev, thickness: "" }));
                        if (![19, 20, 25].includes(deckingSpec.thicknessMm)) {
                          setDeckingSpec((prev) => ({ ...prev, thicknessMm: 25 }));
                        }
                      }
                    }}
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "8px 6px",
                      borderRadius: 8,
                      border: "1px solid #ccc",
                      fontSize: 13,
                    }}
                  />
                ) : (
                  <select
                    value={deckingSpec.thicknessMm}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "custom") {
                        setDeckingCustomInput((prev) => ({
                          ...prev,
                          thickness: String(deckingSpec.thicknessMm),
                        }));
                      } else {
                        setDeckingSpec((prev) => ({ ...prev, thicknessMm: Number(val) }));
                      }
                    }}
                    className="decking-select"
                  >
                    <option value={19}>19</option>
                    <option value={20}>20</option>
                    <option value={25}>25</option>
                    <option value="custom">직접</option>
                  </select>
                )}
              </div>

              {/* 폭 */}
              <div style={{ flex: 1, display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>폭</div>
                {isWidthCustom ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="폭"
                    value={deckingCustomInput.width || String(deckingSpec.widthMm)}
                    onChange={(e) =>
                      setDeckingCustomInput((prev) => ({ ...prev, width: e.target.value }))
                    }
                    onBlur={() => {
                      const val = Number(deckingCustomInput.width.replace(/,/g, ""));
                      if (Number.isFinite(val) && val > 0) {
                        setDeckingSpec((prev) => ({ ...prev, widthMm: val }));
                      }
                      // 프리셋 값이면 드롭다운으로 복귀
                      if ([95, 120, 140, 150].includes(val)) {
                        setDeckingCustomInput((prev) => ({ ...prev, width: "" }));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setDeckingCustomInput((prev) => ({ ...prev, width: "" }));
                        if (![95, 120, 140, 150].includes(deckingSpec.widthMm)) {
                          setDeckingSpec((prev) => ({ ...prev, widthMm: 140 }));
                        }
                      }
                    }}
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "8px 6px",
                      borderRadius: 8,
                      border: "1px solid #ccc",
                      fontSize: 13,
                    }}
                  />
                ) : (
                  <select
                    value={deckingSpec.widthMm}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "custom") {
                        setDeckingCustomInput((prev) => ({
                          ...prev,
                          width: String(deckingSpec.widthMm),
                        }));
                      } else {
                        setDeckingSpec((prev) => ({ ...prev, widthMm: Number(val) }));
                      }
                    }}
                    className="decking-select"
                  >
                    <option value={95}>95</option>
                    <option value={120}>120</option>
                    <option value={140}>140</option>
                    <option value={150}>150</option>
                    <option value="custom">직접</option>
                  </select>
                )}
              </div>

              {/* 길이 */}
              <div style={{ flex: 1, display: "grid", gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>길이</div>
                {isLengthCustom ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="길이"
                    value={deckingCustomInput.length || String(deckingSpec.lengthMm)}
                    onChange={(e) =>
                      setDeckingCustomInput((prev) => ({ ...prev, length: e.target.value }))
                    }
                    onBlur={() => {
                      const val = Number(deckingCustomInput.length.replace(/,/g, ""));
                      if (Number.isFinite(val) && val > 0) {
                        setDeckingSpec((prev) => ({ ...prev, lengthMm: val }));
                      }
                      // 프리셋 값이면 드롭다운으로 복귀
                      if ([2000, 2400, 2800, 3000].includes(val)) {
                        setDeckingCustomInput((prev) => ({ ...prev, length: "" }));
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setDeckingCustomInput((prev) => ({ ...prev, length: "" }));
                        if (![2000, 2400, 2800, 3000].includes(deckingSpec.lengthMm)) {
                          setDeckingSpec((prev) => ({ ...prev, lengthMm: 3000 }));
                        }
                      }
                    }}
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "8px 6px",
                      borderRadius: 8,
                      border: "1px solid #ccc",
                      fontSize: 13,
                    }}
                  />
                ) : (
                  <select
                    value={deckingSpec.lengthMm}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "custom") {
                        setDeckingCustomInput((prev) => ({
                          ...prev,
                          length: String(deckingSpec.lengthMm),
                        }));
                      } else {
                        setDeckingSpec((prev) => ({ ...prev, lengthMm: Number(val) }));
                      }
                    }}
                    className="decking-select"
                  >
                    <option value={2000}>2000</option>
                    <option value={2400}>2400</option>
                    <option value={2800}>2800</option>
                    <option value={3000}>3000</option>
                    <option value="custom">직접</option>
                  </select>
                )}
              </div>
            </div>

            {/* 적용 버튼 */}
            <button
              type="button"
              onClick={() => setAppliedDeckingSpec({ ...deckingSpec })}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: 8,
                border: "none",
                background: "#4CAF50",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "#43a047")}
              onMouseOut={(e) => (e.currentTarget.style.background = "#4CAF50")}
            >
              적용
            </button>

            {/* 적용된 규격 요약 */}
            {appliedDeckingSpec && (
              <div
                style={{
                  background: "linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)",
                  borderRadius: 10,
                  padding: 14,
                  display: "grid",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>✓</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#2e7d32" }}>
                    적용된 제품 규격
                  </span>
                </div>

                <div
                  style={{
                    background: "#fff",
                    borderRadius: 8,
                    padding: 12,
                    display: "grid",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "#666" }}>두께</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>
                      {appliedDeckingSpec.thicknessMm} mm
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "#666" }}>폭</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>
                      {appliedDeckingSpec.widthMm} mm
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "#666" }}>길이</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#333" }}>
                      {appliedDeckingSpec.lengthMm.toLocaleString()} mm
                    </span>
                  </div>
                  <div
                    style={{
                      borderTop: "1px solid #eee",
                      paddingTop: 8,
                      marginTop: 4,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#333" }}>규격</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#2e7d32" }}>
                        {appliedDeckingSpec.thicknessMm} × {appliedDeckingSpec.widthMm} ×{" "}
                        {appliedDeckingSpec.lengthMm.toLocaleString()} mm
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })(),
    },
    {
      id: "edging",
      title: "엣징",
      content: quickSummary("노출된 측면을 마감할 페이시아 보드를 추가하세요."),
    },
    {
      id: "laying",
      title: "시공 옵션",
      content: quickSummary("현장에 맞게 시공 각도와 방향을 조정하세요."),
    },
    {
      id: "substructure",
      title: "하부 구조",
      content: (
        <div style={{ display: "grid", gap: 16 }}>
          {quickSummary("하부 구조의 규격과 간격을 설정합니다.")}

          {/* 1. Bearer Settings */}
          {substructureConfig && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 600, color: "#333", fontSize: 13 }}>멍에 (Bearer)</div>
              <div style={{ display: "flex", gap: 8 }}>
                {/* Width x Height Selector */}
                <select
                  style={{
                    flex: 1,
                    padding: "6px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontSize: 13,
                  }}
                  value={`${substructureConfig.bearerSpec.widthMm}x${substructureConfig.bearerSpec.heightMm}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split("x").map(Number);
                    updateSubConfig({
                      bearerSpec: { ...substructureConfig.bearerSpec, widthMm: w, heightMm: h },
                    });
                  }}
                >
                  <option value="75x75">75×75</option>
                  <option value="100x100">100×100</option>
                  <option value="125x125">125×125</option>
                </select>

                {/* Thickness Selector */}
                <select
                  style={{
                    width: 80,
                    padding: "6px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontSize: 13,
                  }}
                  value={substructureConfig.bearerSpec.thicknessMm}
                  onChange={(e) =>
                    updateSubConfig({
                      bearerSpec: {
                        ...substructureConfig.bearerSpec,
                        thicknessMm: Number(e.target.value),
                      },
                    })
                  }
                >
                  <option value={1.6}>1.6T</option>
                  <option value={2.0}>2.0T</option>
                  <option value={2.3}>2.3T</option>
                  <option value={3.0}>3.0T</option>
                </select>
              </div>

              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 13, color: "#555" }}>최대 간격</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number"
                    value={substructureConfig.bearerSpacingMm ?? 600}
                    onChange={(e) => updateSubConfig({ bearerSpacingMm: Number(e.target.value) })}
                    style={{
                      width: 60,
                      padding: "4px",
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      textAlign: "right",
                      fontSize: 13,
                    }}
                  />
                  <span style={{ fontSize: 13, color: "#777" }}>mm</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ height: 1, background: "#eee" }} />

          {/* 2. Joist Settings */}
          {substructureConfig && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 600, color: "#333", fontSize: 13 }}>장선 (Joist)</div>
              <div style={{ display: "flex", gap: 8 }}>
                {/* Width x Height Selector */}
                <select
                  style={{
                    flex: 1,
                    padding: "6px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontSize: 13,
                  }}
                  value={`${substructureConfig.joistSpec.widthMm}x${substructureConfig.joistSpec.heightMm}`}
                  onChange={(e) => {
                    const [w, h] = e.target.value.split("x").map(Number);
                    updateSubConfig({
                      joistSpec: { ...substructureConfig.joistSpec, widthMm: w, heightMm: h },
                    });
                  }}
                >
                  <option value="50x50">50×50</option>
                  <option value="75x75">75×75</option>
                </select>

                {/* Thickness Selector */}
                <select
                  style={{
                    width: 80,
                    padding: "6px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontSize: 13,
                  }}
                  value={substructureConfig.joistSpec.thicknessMm}
                  onChange={(e) =>
                    updateSubConfig({
                      joistSpec: {
                        ...substructureConfig.joistSpec,
                        thicknessMm: Number(e.target.value),
                      },
                    })
                  }
                >
                  <option value={1.6}>1.6T</option>
                  <option value={2.0}>2.0T</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <span style={{ fontSize: 13, color: "#555" }}>간격 모드</span>
                  <div
                    style={{
                      display: "flex",
                      gap: 2,
                      background: "#eee",
                      padding: 2,
                      borderRadius: 6,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => updateSubConfig({ joistSpacingMode: "auto" })}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        border: "none",
                        fontSize: 12,
                        cursor: "pointer",
                        background:
                          !substructureConfig.joistSpacingMode ||
                          substructureConfig.joistSpacingMode === "auto"
                            ? "#fff"
                            : "transparent",
                        boxShadow:
                          !substructureConfig.joistSpacingMode ||
                          substructureConfig.joistSpacingMode === "auto"
                            ? "0 1px 2px rgba(0,0,0,0.1)"
                            : "none",
                      }}
                    >
                      자동
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSubConfig({ joistSpacingMode: "manual" })}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 4,
                        border: "none",
                        fontSize: 12,
                        cursor: "pointer",
                        background:
                          substructureConfig.joistSpacingMode === "manual" ? "#fff" : "transparent",
                        boxShadow:
                          substructureConfig.joistSpacingMode === "manual"
                            ? "0 1px 2px rgba(0,0,0,0.1)"
                            : "none",
                      }}
                    >
                      수동
                    </button>
                  </div>
                </div>

                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <span style={{ fontSize: 13, color: "#555" }}>장선 간격</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      type="number"
                      value={substructureConfig.joistSpacingMm ?? 400}
                      disabled={
                        !substructureConfig.joistSpacingMode ||
                        substructureConfig.joistSpacingMode === "auto"
                      }
                      onChange={(e) => updateSubConfig({ joistSpacingMm: Number(e.target.value) })}
                      style={{
                        width: 60,
                        padding: "4px",
                        borderRadius: 4,
                        border: "1px solid #ccc",
                        textAlign: "right",
                        fontSize: 13,
                        background:
                          !substructureConfig.joistSpacingMode ||
                          substructureConfig.joistSpacingMode === "auto"
                            ? "#f5f5f5"
                            : "#fff",
                        color:
                          !substructureConfig.joistSpacingMode ||
                          substructureConfig.joistSpacingMode === "auto"
                            ? "#999"
                            : "#000",
                      }}
                    />
                    <span style={{ fontSize: 13, color: "#777" }}>mm</span>
                  </div>
                </div>
                {(!substructureConfig.joistSpacingMode ||
                  substructureConfig.joistSpacingMode === "auto") &&
                  deckThicknessMm && (
                    <div style={{ fontSize: 11, color: "#2e7d32", textAlign: "right" }}>
                      * 데크 {deckThicknessMm}T 기준 자동 계산됨
                    </div>
                  )}
              </div>
            </div>
          )}

          <div style={{ height: 1, background: "#eee" }} />

          {/* 3. Foundation Settings */}
          {substructureConfig && (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 600, color: "#333", fontSize: 13 }}>기초 (Foundation)</div>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  style={{
                    flex: 1,
                    padding: "6px",
                    borderRadius: 6,
                    border: "1px solid #ccc",
                    fontSize: 13,
                  }}
                  value={substructureConfig.foundationType}
                  onChange={(e) =>
                    updateSubConfig({ foundationType: e.target.value as FoundationType })
                  }
                >
                  <option value="concrete_block">기초석 (Concrete Block)</option>
                  <option value="anchor_bolt">앙카볼트 (Anchor Bolt)</option>
                  <option value="rubber_pad">고무패드 (Rubber Pad)</option>
                  <option value="screw_pile">스크류파일 (Screw Pile)</option>
                </select>
              </div>

              <div
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
              >
                <span style={{ fontSize: 13, color: "#555" }}>기초 간격</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    type="number"
                    value={substructureConfig.footingSpacingMm ?? 1000}
                    onChange={(e) => updateSubConfig({ footingSpacingMm: Number(e.target.value) })}
                    style={{
                      width: 60,
                      padding: "4px",
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      textAlign: "right",
                      fontSize: 13,
                    }}
                  />
                  <span style={{ fontSize: 13, color: "#777" }}>mm</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ height: 1, background: "#eee" }} />

          {/* 4. Overrides (Existing) */}
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 600, color: "#333", fontSize: 13 }}>
              총 길이 오버라이드 (고급)
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, color: "#555" }}>멍에 총 길이(mm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder={
                  substructureAuto
                    ? `자동: ${Math.round(substructureAuto.primaryLenM * 1000)}`
                    : "자동"
                }
                value={getSubValue("primary")}
                onChange={(e) => startEditing("sub-primary", e.target.value)}
                onBlur={() => applySubOverride("primary")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    finishEditing("sub-primary");
                    e.currentTarget.blur();
                  }
                }}
                style={{
                  width: 140,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 13, color: "#555" }}>장선 총 길이(mm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder={
                  substructureAuto
                    ? `자동: ${Math.round(substructureAuto.secondaryLenM * 1000)}`
                    : "자동"
                }
                value={getSubValue("secondary")}
                onChange={(e) => startEditing("sub-secondary", e.target.value)}
                onBlur={() => applySubOverride("secondary")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    finishEditing("sub-secondary");
                    e.currentTarget.blur();
                  }
                }}
                style={{
                  width: 140,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #ccc",
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => onChangeSubstructureOverridesMm?.({})}
              style={{
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              자동값으로 되돌리기
            </button>
          </div>
        </div>
      ),
    },
  ];

  return (
    <aside className="controls-pane left-layout">
      <div className="controls-pane-inner">
        {sections.map((section) => {
          const isOpen = openMap[section.id];
          return (
            <div key={section.id} className="accordion-section">
              <div className="accordion-header" onClick={() => toggleSection(section.id)}>
                <h3>{section.title}</h3>
                <span>{isOpen ? "−" : "+"}</span>
              </div>
              {isOpen && <div className="accordion-content">{section.content}</div>}
            </div>
          );
        })}
      </div>
      <div style={{ padding: "12px 16px", borderTop: "1px solid #eee" }}>
        <button
          className="controls-action-button"
          type="button"
          onClick={onToggleResults}
          style={{ width: "100%" }}
        >
          {showResults ? "결과 숨기기" : "결과 보기"}
        </button>
      </div>
    </aside>
  );
}
