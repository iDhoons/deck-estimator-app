import { SegmentedToggle } from "./SegmentedToggle";
import type { FasteningMode } from "@deck/core";
import type { ViewMode } from "./DeckCanvas";

type Mode = "consumer" | "pro";

export function ControlsPanel({
  effectiveMode,
  fastening,
  setFastening,
  proViewMode,
  setProViewMode,
  t,
}: {
  effectiveMode: Mode;
  fastening: FasteningMode;
  setFastening: (v: FasteningMode) => void;
  proViewMode: ViewMode;
  setProViewMode: (v: ViewMode) => void;
  t: any;
}) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      {/* 체결 방식 */}
      <div style={{ padding: 12, border: "1px solid #333", borderRadius: 10 }}>
        <SegmentedToggle
          label={t.fastening}
          value={fastening}
          onChange={setFastening}
          options={[
            { value: "clip", label: t.clip },
            { value: "screw", label: t.screw },
          ]}
        />
      </div>

      {/* 전문가 뷰 모드 */}
      {effectiveMode === "pro" && (
        <div style={{ padding: 12, border: "1px solid #333", borderRadius: 10 }}>
          <SegmentedToggle
            label="뷰 모드(전문가)"
            value={proViewMode}
            onChange={setProViewMode}
            options={[
              { value: "deck", label: "데크" },
              { value: "substructure", label: "하부구조" },
            ]}
          />
        </div>
      )}
    </div>
  );
}