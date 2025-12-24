/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { EDGE_LENGTH_STEP_MM, MIN_EDGE_SPAN_MM } from "../geometry/edges";

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

import { type CutoutShape } from "../types";

type StairConfig = {
  id: string;
  sideIndex: number;
  startMm: number;
  widthMm: number;
  stepCount: number;
  stepDepthMm: number;
  stepHeightMm: number;
  closedRisers?: boolean;
};

export function ControlsPanel({
  shapeOptions,
  selectedShapeId,
  onSelectShape,
  dimensions,
  onChangeDimensionLength,
  circleRadiusMm,
  onChangeCircleRadiusMm,
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
}: {
  shapeOptions: ShapeOption[];
  selectedShapeId: string;
  onSelectShape: (id: string) => void;
  dimensions: DimensionItem[];
  onChangeDimensionLength: (edgeId: string, nextLengthMm: number) => boolean;
  circleRadiusMm?: number | null;
  onChangeCircleRadiusMm?: (nextRadiusMm: number) => boolean;
  onToggleResults: () => void;
  showResults: boolean;
  substructureAuto?: { primaryLenM: number; secondaryLenM: number };
  substructureOverridesMm?: { primaryLenMm?: number; secondaryLenMm?: number };
  onChangeSubstructureOverridesMm?: (next: { primaryLenMm?: number; secondaryLenMm?: number }) => void;
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
  cutoutsMeta?: { shape: CutoutShape; xMm: number; yMm: number; widthMm: number; heightMm: number }[];
  onAddCutout?: () => void;
  onDeleteCutout?: (index: number) => void;
  onChangeCutout?: (
    index: number,
    next: { shape: CutoutShape; xMm: number; yMm: number; widthMm: number; heightMm: number }
  ) => void;
}) {
  const sectionIds = ["floor", "cutout", "steps", "decking", "edging", "laying", "substructure"] as const;
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const id of sectionIds) initial[id] = id === "floor";
    return initial;
  });
  const [dimensionInputs, setDimensionInputs] = useState<Record<string, string>>({});
  const [circleRadiusInput, setCircleRadiusInput] = useState<string>("");
  const [cutoutOpenMap, setCutoutOpenMap] = useState<Record<number, boolean>>({});
  const [cutoutInputs, setCutoutInputs] = useState<Record<string, string>>({});

  // Stairs local state
  const [stairOpenMap, setStairOpenMap] = useState<Record<string, boolean>>({});
  const [stairInputs, setStairInputs] = useState<Record<string, string>>({});

  const quickSummary = (text: string) => (
    <p style={{ fontSize: 13, color: "#555", margin: 0 }}>{text}</p>
  );

  const formatLength = useMemo(
    () => (lengthMm: number) => Math.round(lengthMm).toLocaleString("ko-KR"),
    []
  );

  useEffect(() => {
    const nextInputs: Record<string, string> = {};
    for (const dim of dimensions) {
      nextInputs[dim.id] = formatLength(dim.lengthMm);
    }
    setDimensionInputs(nextInputs);
  }, [dimensions, formatLength]);

  useEffect(() => {
    if (selectedShapeId !== "circle") return;
    if (circleRadiusMm == null) {
      setCircleRadiusInput("");
      return;
    }
    setCircleRadiusInput(formatLength(circleRadiusMm));
  }, [circleRadiusMm, formatLength, selectedShapeId]);

  useEffect(() => {
    const count = cutouts?.length ?? 0;
    if (count <= 0) {
      setCutoutOpenMap({});
      return;
    }
    // 단일 오픈: 새로 추가되면 마지막 개구부만 펼치고 나머지는 접음
    setCutoutOpenMap(() => ({ [count - 1]: true }));
  }, [cutouts?.length]);

  useEffect(() => {
    const holes = cutouts ?? [];
    const metas = cutoutsMeta ?? [];
    const next: Record<string, string> = {};
    for (let i = 0; i < holes.length; i++) {
      const m = metas[i];
      if (!m) continue;
      next[`${i}-x`] = String(Math.round(m.xMm));
      next[`${i}-y`] = String(Math.round(m.yMm));
      next[`${i}-w`] = String(Math.round(m.widthMm));
      next[`${i}-h`] = String(Math.round(m.heightMm));
    }
    setCutoutInputs(next);
  }, [cutouts, cutoutsMeta]);

  // Sync stair inputs
  useEffect(() => {
    const items = stairs?.items ?? [];
    const next: Record<string, string> = {};
    for (const item of items) {
      next[`${item.id}-start`] = String(Math.round(item.startMm));
      next[`${item.id}-width`] = String(Math.round(item.widthMm));
      next[`${item.id}-depth`] = String(Math.round(item.stepDepthMm));
      next[`${item.id}-height`] = String(Math.round(item.stepHeightMm));
    }

    // Stringer overrides
    const overrides = stairs?.stringerMaterialOverrides;
    if (overrides) {
      if (overrides.thicknessMm) next["str-thk"] = String(Math.round(overrides.thicknessMm));
      if (overrides.widthMm) next["str-wid"] = String(Math.round(overrides.widthMm));
      if (overrides.stockLengthMm) next["str-len"] = String(Math.round(overrides.stockLengthMm));
    }

    setStairInputs((prev) => ({ ...prev, ...next }));
  }, [stairs]);

  const toggleSection = (id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
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
        {selectedShapeId === "circle" ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>반지름</div>
            <div className="dimension-list">
              <div className="dimension-item">
                <span>R</span>
                <div className="dimension-input-row">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={circleRadiusInput}
                    onChange={(e) => setCircleRadiusInput(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => {
                      const raw = (circleRadiusInput ?? "").trim();
                      const parsed = Number(raw.replace(/,/g, ""));
                      const snapped = Math.round(parsed / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
                      if (!Number.isFinite(parsed) || snapped <= 0 || snapped < MIN_EDGE_SPAN_MM) {
                        if (circleRadiusMm != null) setCircleRadiusInput(formatLength(circleRadiusMm));
                        return;
                      }
                      const ok = onChangeCircleRadiusMm?.(snapped) ?? false;
                      if (!ok) {
                        if (circleRadiusMm != null) setCircleRadiusInput(formatLength(circleRadiusMm));
                        return;
                      }
                      setCircleRadiusInput(formatLength(snapped));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") {
                        if (circleRadiusMm != null) setCircleRadiusInput(formatLength(circleRadiusMm));
                        e.currentTarget.blur();
                      }
                    }}
                    className="dimension-input"
                  />
                  <span className="dimension-unit">mm</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>변 길이</div>
            {dimensions.length > 0 ? (
              <div className="dimension-list">
                {dimensions.map((item) => (
                  <div key={item.id} className="dimension-item">
                    <span>{item.label}</span>
                    <div className="dimension-input-row">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={dimensionInputs[item.id] ?? ""}
                        onChange={(e) =>
                          setDimensionInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onFocus={(e) => e.currentTarget.select()}
                        onBlur={() => {
                          const raw = (dimensionInputs[item.id] ?? "").trim();
                          const parsed = Number(raw.replace(/,/g, ""));
                          const snapped = Math.round(parsed / EDGE_LENGTH_STEP_MM) * EDGE_LENGTH_STEP_MM;
                          if (!Number.isFinite(parsed) || snapped <= 0 || snapped < MIN_EDGE_SPAN_MM) {
                            setDimensionInputs((prev) => ({
                              ...prev,
                              [item.id]: formatLength(item.lengthMm),
                            }));
                            return;
                          }
                          const ok = onChangeDimensionLength(item.id, snapped);
                          if (!ok) {
                            setDimensionInputs((prev) => ({
                              ...prev,
                              [item.id]: formatLength(item.lengthMm),
                            }));
                            return;
                          }
                          setDimensionInputs((prev) => ({
                            ...prev,
                            [item.id]: formatLength(snapped),
                          }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            setDimensionInputs((prev) => ({
                              ...prev,
                              [item.id]: formatLength(item.lengthMm),
                            }));
                            e.currentTarget.blur();
                          }
                        }}
                        className="dimension-input"
                      />
                      <span className="dimension-unit">mm</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#777" }}>변 정보를 찾을 수 없습니다.</div>
            )}
          </>
        )}
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
          onAddCutout?.();
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
              partial: Partial<{ shape: CutoutShape; xMm: number; yMm: number; widthMm: number; heightMm: number }>
            ) => {
              if (!meta || !onChangeCutout) return;
              onChangeCutout(idx, { ...meta, ...partial });
            };

            const field = (key: "x" | "y" | "w" | "h") => cutoutInputs[`${idx}-${key}`] ?? "";
            const setField = (key: "x" | "y" | "w" | "h", v: string) =>
              setCutoutInputs((prev) => ({ ...prev, [`${idx}-${key}`]: v }));

            const revertField = (key: "x" | "y" | "w" | "h") => {
              if (!meta) return;
              const v =
                key === "x"
                  ? meta.xMm
                  : key === "y"
                    ? meta.yMm
                    : key === "w"
                      ? meta.widthMm
                      : meta.heightMm;
              setField(key, String(Math.round(v)));
            };

            const commitNumber = (key: "x" | "y" | "w" | "h") => {
              if (!meta || !onChangeCutout) return;
              const raw = (field(key) ?? "").trim();
              const parsed = Number(raw.replace(/,/g, ""));
              if (!Number.isFinite(parsed)) {
                revertField(key);
                return;
              }
              if (key === "x") update({ xMm: parsed });
              else if (key === "y") update({ yMm: parsed });
              else if (key === "w") {
                const nextW = Math.max(1, parsed);
                if (shape === "circle") update({ widthMm: nextW, heightMm: nextW });
                else update({ widthMm: nextW });
              } else {
                const nextH = Math.max(1, parsed);
                if (shape === "circle") update({ widthMm: nextH, heightMm: nextH });
                else update({ heightMm: nextH });
              }
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
                          { id: "circle" as const, label: "○" },
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
                            value={field("x")}
                            onChange={(e) => setField("x", e.target.value)}
                            onBlur={() => commitNumber("x")}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Y (mm)</div>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={field("y")}
                            onChange={(e) => setField("y", e.target.value)}
                            onBlur={() => commitNumber("y")}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>영역 치수</div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>길이 (mm)</div>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={field("w")}
                            onChange={(e) => setField("w", e.target.value)}
                            onBlur={() => commitNumber("w")}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>너비 (mm)</div>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={field("h")}
                            onChange={(e) => setField("h", e.target.value)}
                            onBlur={() => commitNumber("h")}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #ccc" }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: 12, color: "#777" }}>점 {pts.length}개</div>
                      <button
                        type="button"
                        onClick={() => onDeleteCutout?.(idx)}
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
            closedRisers: false
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
              const nextItems = stairs.items.map((it) => (it.id === item.id ? { ...it, ...partial } : it));
              onChangeStairs({ ...stairs, items: nextItems });
            };

            const getField = (key: string) => stairInputs[`${item.id}-${key}`] ?? "";
            const setField = (key: string, v: string) => setStairInputs((prev) => ({ ...prev, [`${item.id}-${key}`]: v }));

            const commitField = (key: "start" | "width" | "depth" | "height") => {
              const raw = getField(key);
              const val = Number(raw.replace(/,/g, ""));
              if (!Number.isFinite(val) || val < 0) {
                // revert
                setField(key, String(Math.round(key === "start" ? item.startMm : key === "width" ? item.widthMm : key === "depth" ? item.stepDepthMm : item.stepHeightMm)));
                return;
              }

              if (key === "start") updateItem({ startMm: val });
              else if (key === "width") updateItem({ widthMm: Math.max(100, val) });
              else if (key === "depth") updateItem({ stepDepthMm: Math.max(10, val) });
              else if (key === "height") updateItem({ stepHeightMm: Math.max(10, val) });
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
                <div style={{ display: "flex", alignItems: "center", borderBottom: isOpen ? "1px solid #eee" : "none" }}>
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
                      textAlign: "left"
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "#555" }}>설치 변</span>
                      <select
                        value={item.sideIndex}
                        onChange={(e) => updateItem({ sideIndex: Number(e.target.value) })}
                        style={{ padding: "4px 8px", borderRadius: 6, borderColor: "#ccc" }}
                      >
                        {dimensions.map((dim) => (
                          <option key={dim.id} value={dim.startIndex}>{dim.label}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "#555" }}>시작 위치(mm)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={getField("start")}
                        onChange={(e) => setField("start", e.target.value)}
                        onBlur={() => commitField("start")}
                        style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "#555" }}>계단 폭(mm)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={getField("width")}
                        onChange={(e) => setField("width", e.target.value)}
                        onBlur={() => commitField("width")}
                        style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
                      />
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, color: "#555" }}>단 수</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => updateItem({ stepCount: Math.max(1, item.stepCount - 1) })}
                          style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid #ccc", background: "#f0f0f0" }}
                        >−</button>
                        <span style={{ fontWeight: 700 }}>{item.stepCount}</span>
                        <button
                          type="button"
                          onClick={() => updateItem({ stepCount: Math.min(30, item.stepCount + 1) })}
                          style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid #ccc", background: "#f0f0f0" }}
                        >+</button>
                      </div>
                    </div>

                    <div style={{ fontWeight: 600, color: "#333", marginTop: 4 }}>단 치수</div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>깊이 (mm)</div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getField("depth")}
                          onChange={(e) => setField("depth", e.target.value)}
                          onBlur={() => commitField("depth")}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>높이 (mm)</div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={getField("height")}
                          onChange={(e) => setField("height", e.target.value)}
                          onBlur={() => commitField("height")}
                          style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
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

                    <div style={{ fontSize: 12, color: "#888", background: "#f9f9f9", padding: 8, borderRadius: 6 }}>
                      전체 치수: {Math.round(item.widthMm)} x {Math.round(totalD)} x {Math.round(totalH)} mm
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
          <div style={{ fontWeight: 700, color: "#333", marginBottom: 8 }}>측판(스트링거) 자재 공통 설정</div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#555" }}>두께(mm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="자동"
                value={stairInputs["str-thk"] ?? ""}
                onChange={(e) => setStairInputs((p) => ({ ...p, "str-thk": e.target.value }))}
                onBlur={() => {
                  if (!stairs || !onChangeStairs) return;
                  const val = Number((stairInputs["str-thk"] ?? "").replace(/,/g, ""));
                  onChangeStairs({
                    ...stairs,
                    stringerMaterialOverrides: {
                      ...stairs.stringerMaterialOverrides,
                      thicknessMm: (val > 0) ? val : undefined
                    }
                  });
                }}
                style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#555" }}>폭(mm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="자동"
                value={stairInputs["str-wid"] ?? ""}
                onChange={(e) => setStairInputs((p) => ({ ...p, "str-wid": e.target.value }))}
                onBlur={() => {
                  if (!stairs || !onChangeStairs) return;
                  const val = Number((stairInputs["str-wid"] ?? "").replace(/,/g, ""));
                  onChangeStairs({
                    ...stairs,
                    stringerMaterialOverrides: {
                      ...stairs.stringerMaterialOverrides,
                      widthMm: (val > 0) ? val : undefined
                    }
                  });
                }}
                style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#555" }}>길이(mm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="자동"
                value={stairInputs["str-len"] ?? ""}
                onChange={(e) => setStairInputs((p) => ({ ...p, "str-len": e.target.value }))}
                onBlur={() => {
                  if (!stairs || !onChangeStairs) return;
                  const val = Number((stairInputs["str-len"] ?? "").replace(/,/g, ""));
                  onChangeStairs({
                    ...stairs,
                    stringerMaterialOverrides: {
                      ...stairs.stringerMaterialOverrides,
                      stockLengthMm: (val > 0) ? val : undefined
                    }
                  });
                }}
                style={{ width: 100, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
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
                fontSize: 13
              }}
            >
              초기화
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const [subInputs, setSubInputs] = useState<{ primary: string; secondary: string }>({ primary: "", secondary: "" });
  useEffect(() => {
    const p = substructureOverridesMm?.primaryLenMm;
    const s = substructureOverridesMm?.secondaryLenMm;
    setSubInputs({
      primary: p !== undefined ? String(Math.round(p)) : "",
      secondary: s !== undefined ? String(Math.round(s)) : "",
    });
  }, [substructureOverridesMm?.primaryLenMm, substructureOverridesMm?.secondaryLenMm]);

  const applySubOverride = (key: "primary" | "secondary") => {
    if (!onChangeSubstructureOverridesMm) return;
    const raw = (key === "primary" ? subInputs.primary : subInputs.secondary).trim();
    const parsed = raw === "" ? undefined : Number(raw.replace(/,/g, ""));
    if (parsed !== undefined && (!Number.isFinite(parsed) || parsed <= 0)) return;
    const next = { ...(substructureOverridesMm ?? {}) };
    if (key === "primary") next.primaryLenMm = parsed;
    else next.secondaryLenMm = parsed;
    onChangeSubstructureOverridesMm(next);
  };

  const sections = [
    { id: "floor", title: "평면도", content: floorPlanContent },
    { id: "cutout", title: "개구부", content: cutoutContent },
    { id: "steps", title: "계단 및 측면", content: stairsContent },
    {
      id: "decking",
      title: "데크재",
      content: (
        <div style={{ display: "grid", gap: 12 }}>
          {quickSummary("선호하는 데크재 형태와 마감을 선택하세요.")}
          <button className="controls-action-button" type="button" onClick={onToggleResults}>
            {showResults ? "결과 숨기기" : "결과 보기"}
          </button>
        </div>
      ),
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
        <div style={{ display: "grid", gap: 10 }}>
          {quickSummary("기본값은 자동 계산이며, 필요 시 총 길이를 수동으로 수정할 수 있습니다.")}

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 600, color: "#333" }}>총 길이 오버라이드</div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#555" }}>멍에 총 길이(mm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder={substructureAuto ? `자동: ${Math.round(substructureAuto.primaryLenM * 1000)}` : "자동"}
                value={subInputs.primary}
                onChange={(e) => setSubInputs((p) => ({ ...p, primary: e.target.value }))}
                onBlur={() => applySubOverride("primary")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setSubInputs((p) => ({ ...p, primary: substructureOverridesMm?.primaryLenMm ? String(Math.round(substructureOverridesMm.primaryLenMm)) : "" }));
                    e.currentTarget.blur();
                  }
                }}
                style={{ width: 140, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#555" }}>장선 총 길이(mm)</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder={substructureAuto ? `자동: ${Math.round(substructureAuto.secondaryLenM * 1000)}` : "자동"}
                value={subInputs.secondary}
                onChange={(e) => setSubInputs((p) => ({ ...p, secondary: e.target.value }))}
                onBlur={() => applySubOverride("secondary")}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    setSubInputs((p) => ({ ...p, secondary: substructureOverridesMm?.secondaryLenMm ? String(Math.round(substructureOverridesMm.secondaryLenMm)) : "" }));
                    e.currentTarget.blur();
                  }
                }}
                style={{ width: 140, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
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
    </aside>
  );
}
