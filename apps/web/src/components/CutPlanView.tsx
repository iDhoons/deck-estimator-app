import { useMemo, useState } from "react";
import type { CutPlan } from "@deck/core";
import { t } from "../i18n";
import { fmtInt } from "../i18n/format";

function hashColor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 50%)`;
}

export function CutPlanView({ cutPlan, width = 900 }: { cutPlan: CutPlan; width?: number }) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  const rowHeight = 22;
  const rowGap = 10;
  const pad = 12;
  const labelW = 180;

  const contentW = Math.max(200, width - pad * 2 - labelW);
  const stock = cutPlan.stockLengthMm;
  const svgH = pad * 2 + cutPlan.rows.length * (rowHeight + rowGap) + 44;

  const groups = useMemo(() => {
    const s = new Set<string>();
    for (const r of cutPlan.rows) for (const p of r.pieces) if (p.source === "stock") s.add(p.colorGroup);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [cutPlan]);

  return (
    <div style={{ border: "1px solid #333", borderRadius: 10, padding: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 800 }}>
        {t.section.cutPlan} · {t.label.stockLen}: {fmtInt(stock)}mm
      </div>

      {/* legend / controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          클릭: 동일 그룹 강조 · 다시 클릭: 해제
        </div>
        <button
          onClick={() => setActiveGroup(null)}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #444",
            background: "#111",
            color: "#ddd",
            cursor: "pointer"
          }}
        >
          강조 해제
        </button>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px dashed #bbb",
              color: "#ddd",
              fontSize: 12
            }}
            title="오프컷(재사용)"
          >
            <span style={{ width: 10, height: 10, background: "#777", display: "inline-block" }} />
            {t.label.offcut}
          </span>

          {groups.slice(0, 12).map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup((cur) => (cur === g ? null : g))}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 8px",
                borderRadius: 999,
                border: activeGroup === g ? "1px solid #fff" : "1px solid #333",
                background: "#0b0b0b",
                color: "#ddd",
                fontSize: 12,
                cursor: "pointer",
                opacity: activeGroup && activeGroup !== g ? 0.35 : 1
              }}
              title={`그룹 ${g}`}
            >
              <span style={{ width: 10, height: 10, background: hashColor(g), display: "inline-block" }} />
              {g}
            </button>
          ))}
        </div>
      </div>

      <svg width={width} height={svgH} style={{ display: "block", background: "#0b0b0b", borderRadius: 8 }}>
        {cutPlan.rows.map((row, idx) => {
          const y = pad + idx * (rowHeight + rowGap) + 10;
          let xCursor = pad + labelW;

          const req = row.requiredLenMm;
          const scale = contentW / stock;

          return (
            <g key={row.rowIndex}>
              <text x={pad} y={y + 15} fontSize={12} fill="#ddd">
                {t.label.row} {row.rowIndex + 1} · {t.label.required}: {fmtInt(req)}mm
              </text>

              <rect
                x={pad + labelW}
                y={y}
                width={contentW}
                height={rowHeight}
                fill="#141414"
                stroke="#2a2a2a"
              />

              {row.pieces.map((p) => {
                const w = Math.max(1, Math.round(p.lengthMm * scale));
                const isOffcut = p.source === "offcut";

                const isActive =
                  activeGroup === null ? true : isOffcut ? true : p.colorGroup === activeGroup;

                const fill = isOffcut ? "#777" : hashColor(p.colorGroup);

                const stroke = isOffcut ? "#ddd" : "#0b0b0b";
                const dash = isOffcut ? "4 3" : undefined;

                const opacity = isActive ? 1 : 0.15;

                const onClick = () => {
                  if (isOffcut) return; // offcut은 그룹 토글 대상 아님
                  setActiveGroup((cur) => (cur === p.colorGroup ? null : p.colorGroup));
                };

                const rect = (
                  <rect
                    key={p.id}
                    x={xCursor}
                    y={y}
                    width={w}
                    height={rowHeight}
                    fill={fill}
                    stroke={stroke}
                    strokeDasharray={dash}
                    opacity={opacity}
                    style={{ cursor: isOffcut ? "default" : "pointer" }}
                    onClick={onClick}
                  >
                    <title>
                      {(isOffcut ? "OFFCUT" : p.colorGroup) + " · " + fmtInt(p.lengthMm) + "mm"}
                    </title>
                  </rect>
                );

                xCursor += w;
                return rect;
              })}
            </g>
          );
        })}
      </svg>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
        ※ 현재는 행별 필요 길이를 직사각형 스팬으로 근사합니다. (다음 단계: 폴리곤 슬라이스 기반 정확 길이)
      </div>
    </div>
  );
}
