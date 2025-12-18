import type { Polygon } from "@deck/core";

export type ViewMode = "deck" | "substructure";

export function DeckCanvas({
  polygon,
  viewMode,
}: {
  polygon: Polygon;
  viewMode: ViewMode;
}) {
  const isSubView = viewMode === "substructure";

  return (
    <svg
      width="100%"
      height="360"
      viewBox="0 0 2000 1200"
      style={{ border: "1px solid #ddd", background: "#fafafa" }}
    >
      <polygon
        points={polygon.outer.map((p) => `${p.xMm},${p.yMm}`).join(" ")}
        fill={isSubView ? "none" : "rgba(80,160,255,0.12)"}
        stroke="#5af"
        strokeWidth={isSubView ? 4 : 8}
        opacity={isSubView ? 0.2 : 1}
      />

      <text x={20} y={30} fill="#555" fontSize={20}>
        {isSubView ? "하부 구조 보기" : "데크 보기"}
      </text>
    </svg>
  );
}