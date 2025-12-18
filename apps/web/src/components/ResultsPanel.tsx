import { useEffect } from "react";
import { CutPlanView } from "./CutPlanView";

type Mode = "consumer" | "pro";

export function ResultsPanel({
  show,
  onClose,
  effectiveMode,
  out,
  cutPlan,
}: {
  show: boolean;
  onClose: () => void;
  effectiveMode: Mode;
  out: any;
  cutPlan: any | null;
}) {
  // show가 true일 때만: Esc로 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!show) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
      }}
    >
      {/* 배경(오버레이) */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
        }}
      />

      {/* 드로어 본체 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          background: "#fff",
          color: "#111",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          borderTop: "1px solid #ddd",
          padding: 16,
          maxHeight: "75vh",
          overflow: "auto",
        }}
      >
        {/* 핸들바 */}
        <div
          style={{
            width: 48,
            height: 5,
            borderRadius: 999,
            background: "#ddd",
            margin: "0 auto 12px",
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0 }}>결과</h2>
          <button
            onClick={onClose}
            style={{
              border: "1px solid #333",
              background: "#fff",
              borderRadius: 8,
              padding: "8px 12px",
              cursor: "pointer",
              color: "#111",
              fontWeight: 700,
            }}
          >
            닫기
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
          <div>
            전체 면적: <b>{out.area.totalM2.toFixed(2)} ㎡</b>
          </div>
          <div>
            데크 면적: <b>{out.area.deckM2.toFixed(2)} ㎡</b>
          </div>
          <div>
            계단 면적: <b>{out.area.stairsM2.toFixed(2)} ㎡</b>
          </div>
          <div>
            필요 장수: <b>{out.boards.pieces}</b>
          </div>
          <div>
            로스율: <b>{(out.boards.lossRateApplied ?? 0).toFixed(3)}</b>
          </div>
        </div>

        {effectiveMode === "pro" && cutPlan && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ margin: "0 0 8px" }}>전문가 상세(임시)</h3>
            <CutPlanView cutPlan={cutPlan} />
          </div>
        )}
      </div>
    </div>
  );
}