import { useMemo, useState } from "react";

type ShapeOption = {
  id: string;
  label: string;
};

type DimensionItem = {
  id: string;
  label: string;
  value: string;
};

export function ControlsPanel({
  shapeOptions,
  selectedShapeId,
  onSelectShape,
  dimensions,
  isRoundedEnabled,
  cornerRadiusMm,
  onRadiusChange,
  onToggleRounding,
  onToggleResults,
  showResults,
}: {
  shapeOptions: ShapeOption[];
  selectedShapeId: string;
  onSelectShape: (id: string) => void;
  dimensions: DimensionItem[];
  isRoundedEnabled: boolean;
  cornerRadiusMm: number;
  onRadiusChange: (value: number) => void;
  onToggleRounding: () => void;
  onToggleResults: () => void;
  showResults: boolean;
}) {
  const sectionIds = ["floor", "steps", "decking", "edging", "laying", "substructure"] as const;
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const id of sectionIds) initial[id] = id === "floor";
    return initial;
  });

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
        <div style={{ fontWeight: 600, marginBottom: 8 }}>변 길이</div>
        {dimensions.length > 0 ? (
          <div className="dimension-list">
            {dimensions.map((item) => (
              <div key={item.id} className="dimension-item">
                <span>{item.label}</span>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "#777" }}>변 정보를 찾을 수 없습니다.</div>
        )}
      </div>
    </>
  );

  const roundingContent = (
    <div className="rounding-controls">
      <div style={{ fontSize: 13, marginBottom: 12 }}>모서리를 둥글게 만들어 데크 윤곽을 부드럽게 합니다.</div>
      <input
        type="range"
        min={0}
        max={120}
        value={cornerRadiusMm}
        onChange={(e) => onRadiusChange(Number(e.target.value))}
      />
      <div style={{ fontSize: 13, margin: "8px 0 12px" }}>
        반경: <strong>{cornerRadiusMm}mm</strong>
      </div>
      <button
        className="controls-action-button"
        type="button"
        onClick={onToggleRounding}
        style={{ background: isRoundedEnabled ? "#111" : "#fff", color: isRoundedEnabled ? "#fff" : "#111" }}
      >
        {isRoundedEnabled ? "둥글림 해제" : "둥글림 적용"}
      </button>
    </div>
  );

  const quickSummary = (text: string) => (
    <p style={{ fontSize: 13, color: "#555", margin: 0 }}>{text}</p>
  );

  const sections = useMemo(
    () => [
      { id: "floor", title: "평면도", content: floorPlanContent },
      { id: "steps", title: "계단 및 측면", content: roundingContent },
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
        content: quickSummary("장선 간격, 기초 배치, 하드웨어를 설정하세요."),
      },
    ],
    [floorPlanContent, roundingContent, onToggleResults, showResults]
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
