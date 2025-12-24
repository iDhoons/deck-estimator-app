import { useEffect } from "react";
import { CutPlanView } from "./CutPlanView";
import type { Quantities, CutPlan } from "@deck/core";

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
  out: Quantities;
  cutPlan: CutPlan | null;
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
          maxHeight: "85vh",
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
          <h2 style={{ margin: 0 }}>견적 결과</h2>
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

        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
            <span style={{ color: "#555" }}>전체 면적</span>
            <b>{out.area.totalM2.toFixed(2)} ㎡</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <span style={{ color: "#777", paddingLeft: 8 }}>└ 데크</span>
            <span>{out.area.deckM2.toFixed(2)} ㎡</span>
          </div>
          {out.area.stairsM2 > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: "#777", paddingLeft: 8 }}>└ 계단</span>
              <span>{out.area.stairsM2.toFixed(2)} ㎡</span>
            </div>
          )}
        </div>

        <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid #eee" }} />

        <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>자재 내역 (BOM)</h3>
        
        <div style={{ display: "grid", gap: 10 }}>
            {/* 데크재 */}
            <div style={{ background: "#f9f9f9", padding: 12, borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: "#333" }}>데크 상판</div>
                <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span>필요 수량 ({out.boards.stockLengthMm}mm)</span>
                        <b>{out.boards.pieces} 장</b>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666" }}>
                        <span>총 사용 길이</span>
                        <span>{Math.round(out.boards.usedLengthMm / 1000)} m</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666" }}>
                        <span>적용 로스율</span>
                        <span>{(out.boards.lossRateApplied ?? 0 * 100).toFixed(1)}%</span>
                    </div>
                </div>
            </div>

            {/* 하부 구조 */}
            <div style={{ background: "#f9f9f9", padding: 12, borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: "#333" }}>하부 구조물</div>
                <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span>멍에 (Bearer) 총 길이</span>
                        <b>{out.substructure.primaryLenM} m</b>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span>장선 (Joist) 총 길이</span>
                        <b>{out.substructure.secondaryLenM} m</b>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span>기초석/파일 (Piles)</span>
                        <b>{out.footings.qty} 개</b>
                    </div>
                    {out.ledger && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span>벽체 고정(레저) 길이</span>
                        <b>{out.ledger.lengthM} m</b>
                      </div>
                    )}
                    {out.ledger && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span>레저 앙카볼트</span>
                        <b>{out.ledger.anchorBoltsQty} 개</b>
                      </div>
                    )}
                    {out.posts && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                        <span>포스트</span>
                        <b>
                          {out.posts.qty} 개 × {out.posts.eachLengthMm}mm
                        </b>
                      </div>
                    )}
                </div>
            </div>

            {/* 계단 */}
            {out.stairs?.enabled && out.stairs.items.length > 0 && (
              <div style={{ background: "#f9f9f9", padding: 12, borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: "#333" }}>계단</div>
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>계단 개수</span>
                    <b>{out.stairs.items.length} 개</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>총 단수</span>
                    <b>{out.stairs.items.reduce((sum, it) => sum + it.stepCount, 0)} 단</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>디딤판(상판) 필요 수량</span>
                    <b>{out.stairs.treads.pieces} 장</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>측판(스트링거)</span>
                    <b>{out.stairs.stringers.totalQty} 개</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#666" }}>
                    <span>측판 총 길이</span>
                    <span>{out.stairs.stringers.totalLengthMm} mm</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>측판 자재({out.stairs.stringers.stockLengthMm}mm) 필요 수량</span>
                    <b>{out.stairs.stringers.pieces} 장</b>
                  </div>
                  {out.stairs.risers && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>챌판(막힘형) 필요 수량</span>
                      <b>{out.stairs.risers.pieces} 장</b>
                    </div>
                  )}
                  {out.stairs.landing?.padsQty && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>하단 패드(판석)</span>
                      <b>{out.stairs.landing.padsQty} 개</b>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 부자재 */}
            <div style={{ background: "#f9f9f9", padding: 12, borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: "#333" }}>체결 자재</div>
                <div style={{ display: "grid", gap: 6 }}>
                    {out.fasteners.mode === "screw" ? (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                            <span>나사 (Screws)</span>
                            <b>{Math.ceil(out.fasteners.screws ?? 0)} 개</b>
                        </div>
                    ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                            <span>클립 (Clips)</span>
                            <b>{Math.ceil(out.fasteners.clips ?? 0)} 개</b>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {effectiveMode === "pro" && cutPlan && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>절단 계획 (Cut Plan)</h3>
            <CutPlanView cutPlan={cutPlan} />
          </div>
        )}
      </div>
    </div>
  );
}
