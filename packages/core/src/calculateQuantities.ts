import type { Plan, Product, Ruleset, Quantities, FasteningMode, Polygon } from "./types";
import {
  degToRad,
  rotatePolygon,
  polygonAreaMm2,
  bbox,
  polygonSpanAtY,
  polygonSpanAtX
} from "./geometry";

function consumerLossRate(plan: Plan, rules: Ruleset): number {
  const r = rules.consumerLoss;
  if (!r) return 0;

  const vertices = plan.polygon.outer.length;
  const cutouts = (plan.polygon.holes ?? []).length;

  const extraV = Math.max(0, vertices - 4);
  const rate = r.base + extraV * r.vertexFactor + cutouts * r.cutoutFactor;
  return Math.min(r.cap, Math.max(0, rate));
}

function totalDeckBoardUsedLengthMm(rot: Polygon, pitchMm: number): { usedLengthMm: number; boardLines: number } {
  const bb = bbox(rot.outer);
  const minY = bb.minY;
  const maxY = bb.maxY;

  // 안전하게 0.5mm 정도 안쪽에서 시작(경계 교차 불안정 완화)
  const eps = 0.5;
  let y = minY + eps;

  let used = 0;
  let lines = 0;

  while (y <= maxY - eps) {
    const span = polygonSpanAtY(rot, y);
    if (span > 0) {
      used += span;
      lines += 1;
    }
    y += pitchMm;
  }

  return { usedLengthMm: used, boardLines: lines };
}

function totalLineLengthAlongX(rot: Polygon, spacingMm: number): { lenMm: number; lines: number } {
  const bb = bbox(rot.outer);
  const minX = bb.minX;
  const maxX = bb.maxX;
  const eps = 0.5;

  let x = minX + eps;
  let len = 0;
  let lines = 0;

  while (x <= maxX - eps) {
    const span = polygonSpanAtX(rot, x);
    if (span > 0) {
      len += span;
      lines += 1;
    }
    x += spacingMm;
  }
  return { lenMm: len, lines };
}

function totalLineLengthAlongY(rot: Polygon, spacingMm: number): { lenMm: number; lines: number } {
  const bb = bbox(rot.outer);
  const minY = bb.minY;
  const maxY = bb.maxY;
  const eps = 0.5;

  let y = minY + eps;
  let len = 0;
  let lines = 0;

  while (y <= maxY - eps) {
    const span = polygonSpanAtY(rot, y);
    if (span > 0) {
      len += span;
      lines += 1;
    }
    y += spacingMm;
  }
  return { lenMm: len, lines };
}

export function calculateQuantities(
  plan: Plan,
  product: Product,
  rules: Ruleset,
  fasteningMode: FasteningMode
): Quantities {
  // 1) 면적 (mm^2 → m^2)
  const deckAreaMm2 = polygonAreaMm2(plan.polygon);
  const stairsAreaMm2 =
    plan.stairs?.enabled && plan.stairs.footprintPolygon ? polygonAreaMm2(plan.stairs.footprintPolygon) : 0;

  const totalAreaMm2 = deckAreaMm2 + stairsAreaMm2;

  // 2) 방향 정규화: 보드 방향을 X축으로 맞추기 위해 -deg 회전
  const rad = degToRad(-plan.deckingDirectionDeg);
  const rotDeck = rotatePolygon(plan.polygon, rad);

  const pitchMm = plan.boardWidthMm + rules.gapMm;

  // 3) 보드 총 사용 길이
  const { usedLengthMm, boardLines } = totalDeckBoardUsedLengthMm(rotDeck, pitchMm);

  const lossRate = rules.mode === "consumer" ? consumerLossRate(plan, rules) : 0;
  const pieces = Math.ceil((usedLengthMm / product.stockLengthMm) * (1 + lossRate));

  // 4) 하부 길이 (단순 v1)
  // - 2차(장선): 보드에 수직 => X축 방향에 spacing으로 라인 생성(= x=const 라인 길이 합)
  const secondary = totalLineLengthAlongX(rotDeck, rules.secondarySpacingMm);

  // - 1차(멍에): 2차에 수직 => y=const 라인 길이 합
  const primary = totalLineLengthAlongY(rotDeck, rules.primarySpacingMm);

  // 5) 패스너(단순 v1)
  const intersections = boardLines * secondary.lines;
  const screws = fasteningMode === "screw" ? intersections * rules.screwPerIntersection : undefined;
  const clips = fasteningMode === "clip" ? intersections : undefined;

  // 6) 동바리/앙카(단순 v1)
  // 💭 멍에×장선 교차점 개수로 추정 (나중에 현장 규칙 반영 가능)
  const footingQty = primary.lines * secondary.lines;
  const anchorQty = footingQty;

  return {
    area: {
      totalM2: totalAreaMm2 / 1_000_000,
      deckM2: deckAreaMm2 / 1_000_000,
      stairsM2: stairsAreaMm2 / 1_000_000
    },
    boards: {
      pieces,
      usedLengthMm: Math.round(usedLengthMm),
      stockLengthMm: product.stockLengthMm,
      lossRateApplied: lossRate
    },
    substructure: {
      primaryLenM: Math.round((primary.lenMm / 1000) * 1000) / 1000,
      secondaryLenM: Math.round((secondary.lenMm / 1000) * 1000) / 1000
    },
    anchors: { qty: anchorQty },
    footings: { qty: footingQty },
    fasteners: { mode: fasteningMode, screws, clips }
  };
}
