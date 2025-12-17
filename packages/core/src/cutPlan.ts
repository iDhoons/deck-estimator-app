import type { Plan, Product, Ruleset, CutPlan, CutRow, CutPiece, Polygon, Point } from "./types";

// --- tiny local geometry helpers (MVP) ---
function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function rotatePoint(p: Point, rad: number): Point {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { xMm: p.xMm * c - p.yMm * s, yMm: p.xMm * s + p.yMm * c };
}

function rotatePolygon(poly: Polygon, deg: number): Polygon {
  const rad = toRad(deg);
  return {
    outer: poly.outer.map((p) => rotatePoint(p, rad)),
    holes: poly.holes ? poly.holes.map((h) => h.map((p) => rotatePoint(p, rad))) : undefined
  };
}

function spanLengthMm(poly: Polygon, axis: "x" | "y"): number {
  const pts: Point[] = [...poly.outer, ...(poly.holes ? poly.holes.flat() : [])];
  if (pts.length === 0) return 0;
  const vals = pts.map((p) => (axis === "x" ? p.xMm : p.yMm));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return max - min;
}

/**
 * Pro-mode MVP cut plan:
 * - row count: based on (boardWidth + gap) pitch across Y-span
 * - required length per row: uses X-span (rough, but stable)
 * - offcut reuse: greedy (use largest offcut that fits)
 * - returns colorGroup for future canvas coloring
 */
export function buildCutPlan(plan: Plan, product: Product, rules: Ruleset): CutPlan | null {
  if (rules.mode !== "pro") return null;

  // rotate polygon so board direction ~ X axis (MVP)
  const poly = rotatePolygon(plan.polygon, -plan.deckingDirectionDeg);

  const boardWidth = plan.boardWidthMm ?? product.widthOptionsMm?.[0] ?? 140;
  const gap = rules.gapMm ?? product.gapMm ?? 5;
  const pitchMm = boardWidth + gap;

  const ySpan = spanLengthMm(poly, "y");
  const rows = Math.max(1, Math.ceil(ySpan / pitchMm));

  const xSpan = spanLengthMm(poly, "x");
  const requiredLenMm = Math.max(0, Math.round(xSpan));

  const stockLen = product.stockLengthMm;
  const offcuts: number[] = [];
  const cutRows: CutRow[] = [];

  let groupSeq = 1;
  const newGroup = () => `G${groupSeq++}`;

  for (let r = 0; r < rows; r++) {
    let remaining = requiredLenMm;
    const pieces: CutPiece[] = [];

    // 큰 오프컷부터 쓰기
    offcuts.sort((a, b) => b - a);

    for (let i = 0; i < offcuts.length && remaining > 0; ) {
      const oc = offcuts[i];
      if (oc <= 0) { offcuts.splice(i, 1); continue; }

      if (oc <= remaining) {
        pieces.push({
          id: `R${r}-O${i}`,
          source: "offcut",
          colorGroup: "OFFCUT",
          lengthMm: oc
        });
        remaining -= oc;
        offcuts.splice(i, 1);
      } else {
        i++;
      }
    }

    // 새 보드로 채우기
    while (remaining > 0) {
      const group = newGroup();
      const take = Math.min(stockLen, remaining);
      pieces.push({
        id: `R${r}-S${pieces.length}`,
        source: "stock",
        colorGroup: group,
        lengthMm: take
      });
      remaining -= take;

      const off = stockLen - take;
      if (off > 0) offcuts.push(off);
    }

    const last = pieces[pieces.length - 1];
    const offcutMm = last?.source === "stock" ? Math.max(0, stockLen - last.lengthMm) : 0;

    cutRows.push({
      rowIndex: r,
      requiredLenMm,
      pieces,
      offcutMm
    });
  }

  return {
    stockLengthMm: stockLen,
    totalRows: rows,
    rows: cutRows,
    offcutsPoolMm: offcuts
  };
}
