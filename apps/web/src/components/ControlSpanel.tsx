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

export type CutoutShape = "rectangle" | "circle" | "free";
export type CutoutMode = { enabled: boolean; shape: CutoutShape };

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
  cutoutMode,
  onChangeCutoutMode,
  onDeleteCutout,
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
    totalRiseMm?: number;
    widthMm?: number;
    closedRisers?: boolean;
    landingType?: "pad" | "post";
    stringerMaterialOverrides?: { thicknessMm?: number; widthMm?: number; stockLengthMm?: number };
  };
  onChangeStairs?: (next: {
    enabled: boolean;
    totalRiseMm?: number;
    widthMm?: number;
    closedRisers?: boolean;
    landingType?: "pad" | "post";
    stringerMaterialOverrides?: { thicknessMm?: number; widthMm?: number; stockLengthMm?: number };
  }) => void;
  cutouts?: { xMm: number; yMm: number }[][];
  cutoutMode?: CutoutMode;
  onChangeCutoutMode?: (next: CutoutMode) => void;
  onDeleteCutout?: (index: number) => void;
}) {
  const sectionIds = ["floor", "cutout", "steps", "decking", "edging", "laying", "substructure"] as const;
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const id of sectionIds) initial[id] = id === "floor";
    return initial;
  });
  const [dimensionInputs, setDimensionInputs] = useState<Record<string, string>>({});
  const [circleRadiusInput, setCircleRadiusInput] = useState<string>("");

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
                        // revert
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
      {quickSummary("데크 내부의 설치되지 않는 영역(컷아웃)을 추가합니다.")}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["rectangle", "circle", "free"] as const).map((s) => {
          const active = cutoutMode?.shape === s;
          const label = s === "rectangle" ? "사각형" : s === "circle" ? "원형" : "자유형";
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                if (!onChangeCutoutMode) return;
                onChangeCutoutMode({ enabled: cutoutMode?.enabled ?? false, shape: s });
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: active ? "2px solid #ff6b6b" : "1px solid #ccc",
                background: active ? "#fff1f1" : "#fff",
                cursor: onChangeCutoutMode ? "pointer" : "not-allowed",
                fontWeight: active ? 700 : 500,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="controls-action-button"
        onClick={() => {
          if (!onChangeCutoutMode) return;
          const enabled = !(cutoutMode?.enabled ?? false);
          onChangeCutoutMode({ enabled, shape: cutoutMode?.shape ?? "rectangle" });
        }}
        style={{
          borderColor: cutoutMode?.enabled ? "#ff6b6b" : undefined,
          color: cutoutMode?.enabled ? "#ff6b6b" : undefined,
        }}
      >
        {cutoutMode?.enabled ? "컷아웃 추가 모드 종료" : "컷아웃 추가 모드 시작"}
      </button>

      <div style={{ fontSize: 13, color: "#555" }}>
        현재 컷아웃: <b>{cutouts?.length ?? 0}</b>개
      </div>

      {(cutouts?.length ?? 0) > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {(cutouts ?? []).map((pts, idx) => (
            <div
              key={`cutout-${idx}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #eee",
                background: "#fff",
              }}
            >
              <div style={{ display: "grid", gap: 2 }}>
                <div style={{ fontWeight: 700, color: "#333" }}>컷아웃 #{idx + 1}</div>
                <div style={{ fontSize: 12, color: "#777" }}>점 {pts.length}개</div>
              </div>
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
                  fontWeight: 700,
                }}
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const [stairsInputs, setStairsInputs] = useState<{
    totalRise: string;
    width: string;
    closedRisers: boolean;
    stringerThickness: string;
    stringerWidth: string;
    stringerLength: string;
  }>(() => ({
    totalRise: stairs?.totalRiseMm ? String(Math.round(stairs.totalRiseMm)) : "",
    width: stairs?.widthMm ? String(Math.round(stairs.widthMm)) : "",
    closedRisers: stairs?.closedRisers ?? false,
    stringerThickness: stairs?.stringerMaterialOverrides?.thicknessMm
      ? String(Math.round(stairs.stringerMaterialOverrides.thicknessMm))
      : "",
    stringerWidth: stairs?.stringerMaterialOverrides?.widthMm
      ? String(Math.round(stairs.stringerMaterialOverrides.widthMm))
      : "",
    stringerLength: stairs?.stringerMaterialOverrides?.stockLengthMm
      ? String(Math.round(stairs.stringerMaterialOverrides.stockLengthMm))
      : "",
  }));

  useEffect(() => {
    setStairsInputs({
      totalRise: stairs?.totalRiseMm ? String(Math.round(stairs.totalRiseMm)) : "",
      width: stairs?.widthMm ? String(Math.round(stairs.widthMm)) : "",
      closedRisers: stairs?.closedRisers ?? false,
      stringerThickness: stairs?.stringerMaterialOverrides?.thicknessMm
        ? String(Math.round(stairs.stringerMaterialOverrides.thicknessMm))
        : "",
      stringerWidth: stairs?.stringerMaterialOverrides?.widthMm
        ? String(Math.round(stairs.stringerMaterialOverrides.widthMm))
        : "",
      stringerLength: stairs?.stringerMaterialOverrides?.stockLengthMm
        ? String(Math.round(stairs.stringerMaterialOverrides.stockLengthMm))
        : "",
    });
  }, [
    stairs?.enabled,
    stairs?.totalRiseMm,
    stairs?.widthMm,
    stairs?.closedRisers,
    stairs?.stringerMaterialOverrides?.thicknessMm,
    stairs?.stringerMaterialOverrides?.widthMm,
    stairs?.stringerMaterialOverrides?.stockLengthMm,
  ]);

  const parseMaybeNumber = (raw: string): number | undefined => {
    const v = raw.trim();
    if (v === "") return undefined;
    const n = Number(v.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return n;
  };

  const stairsContent = (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={stairs?.enabled ?? false}
          onChange={(e) => {
            if (!stairs || !onChangeStairs) return;
            onChangeStairs({ ...stairs, enabled: e.target.checked });
          }}
        />
        <span style={{ fontWeight: 700 }}>계단 사용</span>
      </label>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#555" }}>총 높이(mm)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="예: 900"
            value={stairsInputs.totalRise}
            onChange={(e) => setStairsInputs((p) => ({ ...p, totalRise: e.target.value }))}
            onBlur={() => {
              if (!stairs || !onChangeStairs) return;
              onChangeStairs({ ...stairs, totalRiseMm: parseMaybeNumber(stairsInputs.totalRise) });
            }}
            style={{ width: 140, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
            disabled={!stairs?.enabled}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#555" }}>폭(mm)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="예: 900"
            value={stairsInputs.width}
            onChange={(e) => setStairsInputs((p) => ({ ...p, width: e.target.value }))}
            onBlur={() => {
              if (!stairs || !onChangeStairs) return;
              onChangeStairs({ ...stairs, widthMm: parseMaybeNumber(stairsInputs.width) });
            }}
            style={{ width: 140, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
            disabled={!stairs?.enabled}
          />
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={stairsInputs.closedRisers}
            onChange={(e) => {
              setStairsInputs((p) => ({ ...p, closedRisers: e.target.checked }));
              if (!stairs || !onChangeStairs) return;
              onChangeStairs({ ...stairs, closedRisers: e.target.checked });
            }}
            disabled={!stairs?.enabled}
          />
          <span style={{ fontSize: 13, color: "#555" }}>막힘형(챌판 포함)</span>
        </label>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontWeight: 700, color: "#333" }}>측판(스트링거) 자재</div>
        <div style={{ fontSize: 12, color: "#777" }}>
          입력하지 않으면 메인데크 자재와 동일한 값으로 계산합니다.
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#555" }}>두께(mm)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="자동"
            value={stairsInputs.stringerThickness}
            onChange={(e) => setStairsInputs((p) => ({ ...p, stringerThickness: e.target.value }))}
            onBlur={() => {
              if (!stairs || !onChangeStairs) return;
              onChangeStairs({
                ...stairs,
                stringerMaterialOverrides: {
                  ...(stairs.stringerMaterialOverrides ?? {}),
                  thicknessMm: parseMaybeNumber(stairsInputs.stringerThickness),
                },
              });
            }}
            style={{ width: 140, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
            disabled={!stairs?.enabled}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#555" }}>폭(mm)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="자동"
            value={stairsInputs.stringerWidth}
            onChange={(e) => setStairsInputs((p) => ({ ...p, stringerWidth: e.target.value }))}
            onBlur={() => {
              if (!stairs || !onChangeStairs) return;
              onChangeStairs({
                ...stairs,
                stringerMaterialOverrides: {
                  ...(stairs.stringerMaterialOverrides ?? {}),
                  widthMm: parseMaybeNumber(stairsInputs.stringerWidth),
                },
              });
            }}
            style={{ width: 140, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
            disabled={!stairs?.enabled}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#555" }}>길이(mm)</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="자동"
            value={stairsInputs.stringerLength}
            onChange={(e) => setStairsInputs((p) => ({ ...p, stringerLength: e.target.value }))}
            onBlur={() => {
              if (!stairs || !onChangeStairs) return;
              onChangeStairs({
                ...stairs,
                stringerMaterialOverrides: {
                  ...(stairs.stringerMaterialOverrides ?? {}),
                  stockLengthMm: parseMaybeNumber(stairsInputs.stringerLength),
                },
              });
            }}
            style={{ width: 140, padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc" }}
            disabled={!stairs?.enabled}
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
          }}
          disabled={!stairs?.enabled}
        >
          측판 오버라이드 초기화
        </button>
      </div>
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

  const sections = useMemo(
    () => [
      { id: "floor", title: "평면도", content: floorPlanContent },
      { id: "cutout", title: "컷아웃", content: cutoutContent },
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
    ],
    [
      cutoutContent,
      floorPlanContent,
      onToggleResults,
      showResults,
      stairsContent,
      subInputs.primary,
      subInputs.secondary,
      substructureAuto,
      substructureOverridesMm,
    ]
  );

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
