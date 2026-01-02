import { useEffect } from "react";
import { CutPlanView } from "./CutPlanView";
import type { Quantities, CutPlan, FoundationType } from "@deck/core";

type Mode = "consumer" | "pro";

/** 기초 타입 한글명 */
function getFoundationTypeName(type: FoundationType): string {
  switch (type) {
    case "concrete_block":
      return "기초석";
    case "anchor_bolt":
      return "앙카볼트";
    case "rubber_pad":
      return "고무패드";
    case "screw_pile":
      return "스크류파일";
    default:
      return "기초";
  }
}

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
                <b>{cutPlan ? cutPlan.stats.totalStockPieces : out.boards.pieces} 장</b>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  color: "#666",
                }}
              >
                <span>총 사용 길이</span>
                <span>{Math.round(out.boards.usedLengthMm / 1000)} m</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  color: "#666",
                }}
              >
                <span>적용 로스율</span>
                <span>
                  {cutPlan
                    ? `${(cutPlan.stats.lossRate * 100).toFixed(1)}% (실측)`
                    : `${((out.boards.lossRateApplied ?? 0) * 100).toFixed(1)}% (설정값)`}
                </span>
              </div>
            </div>
          </div>

          {/* 하부 구조 - 상세 */}
          <div style={{ background: "#f9f9f9", padding: 12, borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: "#333" }}>
              하부 구조물 (아연도각관)
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {/* 멍에 (Bearer) */}
              {out.substructureDetail ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>
                      멍에 ({out.substructureDetail.bearer.spec.widthMm}×
                      {out.substructureDetail.bearer.spec.heightMm}×
                      {out.substructureDetail.bearer.spec.thicknessMm}T)
                    </span>
                    <b>{out.substructureDetail.bearer.pieces} 개</b>
                  </div>
                  {(out.substructureDetail.bearer.innerPieces !== undefined ||
                    out.substructureDetail.bearer.rimPieces !== undefined) && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          color: "#666",
                          paddingLeft: 8,
                        }}
                      >
                        <span>└ 내부 멍에</span>
                        <span>{out.substructureDetail.bearer.innerPieces ?? 0} 개</span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          color: "#666",
                          paddingLeft: 8,
                        }}
                      >
                        <span>└ 외곽 멍에 (Rim)</span>
                        <span>{out.substructureDetail.bearer.rimPieces ?? 0} 개</span>
                      </div>
                    </>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      color: "#666",
                      paddingLeft: 8,
                    }}
                  >
                    <span>└ 총 길이</span>
                    <span>{out.substructureDetail.bearer.totalLengthM} m</span>
                  </div>
                  {out.substructureDetail.bearer.breakdown &&
                    out.substructureDetail.bearer.breakdown.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          color: "#666",
                          paddingLeft: 8,
                        }}
                      >
                        <span>└ 길이별</span>
                        <span>
                          {out.substructureDetail.bearer.breakdown.map((b, i) => (
                            <span key={i}>
                              {i > 0 ? ", " : ""}
                              {b.lengthMm}mm×{b.qty}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      color: "#666",
                      paddingLeft: 8,
                    }}
                  >
                    <span>└ 원자재 ({out.substructureDetail.bearer.spec.stockLengthMm}mm)</span>
                    <span>{out.substructureDetail.bearer.stockPieces} 본</span>
                  </div>

                  {/* 장선 (Joist) */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 14,
                      marginTop: 4,
                    }}
                  >
                    <span>
                      장선 ({out.substructureDetail.joist.spec.widthMm}×
                      {out.substructureDetail.joist.spec.heightMm}×
                      {out.substructureDetail.joist.spec.thicknessMm}T)
                    </span>
                    <b>{out.substructureDetail.joist.pieces} 개</b>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      color: "#666",
                      paddingLeft: 8,
                    }}
                  >
                    <span>└ 내부 장선</span>
                    <span>{out.substructureDetail.joist.innerPieces} 개</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      color: "#666",
                      paddingLeft: 8,
                    }}
                  >
                    <span>└ 외곽 장선 (Rim)</span>
                    <span>{out.substructureDetail.joist.rimPieces} 개</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      color: "#666",
                      paddingLeft: 8,
                    }}
                  >
                    <span>└ 총 길이</span>
                    <span>{out.substructureDetail.joist.totalLengthM} m</span>
                  </div>
                  {out.substructureDetail.joist.breakdown &&
                    out.substructureDetail.joist.breakdown.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          color: "#666",
                          paddingLeft: 8,
                        }}
                      >
                        <span>└ 길이별</span>
                        <span>
                          {out.substructureDetail.joist.breakdown.map((b, i) => (
                            <span key={i}>
                              {i > 0 ? ", " : ""}
                              {b.lengthMm}mm×{b.qty}
                            </span>
                          ))}
                        </span>
                      </div>
                    )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      color: "#666",
                      paddingLeft: 8,
                    }}
                  >
                    <span>└ 원자재 ({out.substructureDetail.joist.spec.stockLengthMm}mm)</span>
                    <span>{out.substructureDetail.joist.stockPieces} 본</span>
                  </div>

                  {/* 기초 */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 14,
                      marginTop: 4,
                    }}
                  >
                    <span>
                      {getFoundationTypeName(out.substructureDetail.foundation.type)} (
                      {out.substructureDetail.foundation.specDescription})
                    </span>
                    <b>{out.substructureDetail.foundation.qty} 개</b>
                  </div>

                  {/* 포스트 */}
                  {out.substructureDetail.post && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 14,
                          marginTop: 4,
                        }}
                      >
                        <span>
                          포스트 ({out.substructureDetail.post.spec.widthMm}×
                          {out.substructureDetail.post.spec.heightMm}×
                          {out.substructureDetail.post.spec.thicknessMm}T)
                        </span>
                        <b>{out.substructureDetail.post.qty} 개</b>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          color: "#666",
                          paddingLeft: 8,
                        }}
                      >
                        <span>└ 개별 길이</span>
                        <span>{out.substructureDetail.post.eachLengthMm} mm</span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          color: "#666",
                          paddingLeft: 8,
                        }}
                      >
                        <span>└ 총 길이</span>
                        <span>{out.substructureDetail.post.totalLengthM} m</span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          color: "#666",
                          paddingLeft: 8,
                        }}
                      >
                        <span>└ 원자재 ({out.substructureDetail.post.spec.stockLengthMm}mm)</span>
                        <span>{out.substructureDetail.post.stockPieces} 본</span>
                      </div>
                    </>
                  )}

                  {/* 레저 (벽체 고정) */}
                  {out.ledger && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 14,
                          marginTop: 4,
                        }}
                      >
                        <span>벽체 고정 (레저)</span>
                        <b>{out.ledger.lengthM} m</b>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: 13,
                          color: "#666",
                          paddingLeft: 8,
                        }}
                      >
                        <span>└ 앙카볼트</span>
                        <span>{out.ledger.anchorBoltsQty} 개</span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                /* 기존 간단 표시 (substructureDetail 없을 때 fallback) */
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>멍에 (Bearer) 총 길이</span>
                    <b>{out.substructure.primaryLenM} m</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>장선 (Joist) 총 길이</span>
                    <b>{out.substructure.secondaryLenM} m</b>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>기초석/파일</span>
                    <b>{out.footings.qty} 개</b>
                  </div>
                  {out.ledger && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>벽체 고정(레저) 길이</span>
                      <b>{out.ledger.lengthM} m</b>
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
                </>
              )}
            </div>
          </div>

          {/* 부속자재 (철물) - 상세 */}
          {out.substructureDetail?.hardware && (
            <div style={{ background: "#f9f9f9", padding: 12, borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: "#333" }}>하부구조 철물</div>
              <div style={{ display: "grid", gap: 6 }}>
                {out.substructureDetail.hardware.anchorBolts && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>앙카볼트 ({out.substructureDetail.hardware.anchorBolts.spec})</span>
                    <b>{out.substructureDetail.hardware.anchorBolts.qty} 개</b>
                  </div>
                )}
                {out.substructureDetail.hardware.angleBrackets && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>앵글 브라켓 ({out.substructureDetail.hardware.angleBrackets.spec})</span>
                    <b>{out.substructureDetail.hardware.angleBrackets.qty} 개</b>
                  </div>
                )}
                {out.substructureDetail.hardware.basePlates && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>베이스 플레이트 ({out.substructureDetail.hardware.basePlates.spec})</span>
                    <b>{out.substructureDetail.hardware.basePlates.qty} 개</b>
                  </div>
                )}
                {out.substructureDetail.hardware.postCaps && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>포스트 캡 ({out.substructureDetail.hardware.postCaps.spec})</span>
                    <b>{out.substructureDetail.hardware.postCaps.qty} 개</b>
                  </div>
                )}
                {out.substructureDetail.hardware.joistHangers && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>장선 행거 ({out.substructureDetail.hardware.joistHangers.spec})</span>
                    <b>{out.substructureDetail.hardware.joistHangers.qty} 개</b>
                  </div>
                )}
                {out.substructureDetail.hardware.selfDrillingScrew && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>
                      셀프 드릴링 스크류 ({out.substructureDetail.hardware.selfDrillingScrew.spec})
                    </span>
                    <b>{out.substructureDetail.hardware.selfDrillingScrew.qty} 개</b>
                  </div>
                )}
              </div>
            </div>
          )}

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
                  <span>디딤판(상판) 면적</span>
                  <b>{out.stairs.treadAreaM2.toFixed(2)} ㎡</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span>높이판(라이저) 면적</span>
                  <b>{out.stairs.riserAreaM2.toFixed(2)} ㎡</b>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 14,
                    borderTop: "1px solid #ddd",
                    paddingTop: 6,
                    marginTop: 2,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>총 면적</span>
                  <b>{out.stairs.totalAreaM2.toFixed(2)} ㎡</b>
                </div>
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
