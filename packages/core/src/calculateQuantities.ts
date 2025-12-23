import type { Plan, Product, Ruleset, Quantities, FasteningMode, Polygon, Point } from "./types";
import {
  degToRad,
  rotatePolygon,
  polygonAreaMm2,
  bbox,
  polygonSpanAtY,
  getClippedGridLines,
  isPointInPolygon,
  rotatePoint
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

  // 4) 하부 구조물 (정밀 계산 & 레이아웃)
  // 내부 장선 & 멍에
  const innerJoists = getClippedGridLines(rotDeck, rules.secondarySpacingMm, "x");
  const bearers = getClippedGridLines(rotDeck, rules.primarySpacingMm, "y");

  // 외곽 장선 (Rim Joist) 생성
  const rimJoists: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const outer = rotDeck.outer;
  for (let i = 0; i < outer.length; i++) {
    const p1 = outer[i];
    const p2 = outer[(i + 1) % outer.length];
    rimJoists.push({ x1: p1.xMm, y1: p1.yMm, x2: p2.xMm, y2: p2.yMm });
  }

  // 모든 장선 합치기 (내부 + 외곽)
  const allJoists = [...innerJoists, ...rimJoists];

  // 길이 합산
  const secondaryLenMm = allJoists.reduce((acc, j) => acc + Math.hypot(j.x2 - j.x1, j.y2 - j.y1), 0);
  const primaryLenMm = bearers.reduce((acc, b) => acc + Math.hypot(b.x2 - b.x1, b.y2 - b.y1), 0);

  // 5) 기초(Pile) 위치 계산 (장선-멍에 교차점 중 다각형 내부)
  const piles: Point[] = [];
  
  for (const j of allJoists) {
    // 수평선(Bearer)과 임의의 선분(Joist)의 교차점 구하기
    // Bearer: y = b.y1 (b.y1 == b.y2), x in [min(bx), max(bx)]
    // Joist: (x1, y1) to (x2, y2)

    const jyMin = Math.min(j.y1, j.y2);
    const jyMax = Math.max(j.y1, j.y2);

    for (const b of bearers) { 
       const by = b.y1;
       const bxMin = Math.min(b.x1, b.x2);
       const bxMax = Math.max(b.x1, b.x2);

       // Y 범위 체크 (교차 가능성)
       // 오차 허용 (eps)
       if (by < jyMin - 0.1 || by > jyMax + 0.1) continue;

       let intersectX: number;
        
       if (Math.abs(j.y2 - j.y1) < 1e-9) {
           // Joist가 수평선인 경우 (Bearer와 평행) -> 교차점 없음 (혹은 무수히 많음)
           continue; 
       } else {
           const t = (by - j.y1) / (j.y2 - j.y1);
           intersectX = j.x1 + t * (j.x2 - j.x1);
       }

       // Bearer 구간 체크
       if (intersectX >= bxMin - 0.1 && intersectX <= bxMax + 0.1) {
          const p = { xMm: intersectX, yMm: by };
          // 이미 클리핑된 선분들의 교차점이므로 대부분 내부이나, 구멍 등으로 인해 한번 더 체크
          if (isPointInPolygon(p, rotDeck)) {
             piles.push(p);
          }
       }
    }
  }

  const footingQty = piles.length;
  const anchorQty = footingQty;

  // 6) 패스너
  // 내부 장선 라인 수만 고려 (단순화)
  const uniqueJoistXs = new Set(innerJoists.map(j => Math.round(j.x1 * 10) / 10)).size;
  const intersections = boardLines * uniqueJoistXs;
  const screws = fasteningMode === "screw" ? intersections * rules.screwPerIntersection : undefined;
  const clips = fasteningMode === "clip" ? intersections : undefined;

  // 7) 레이아웃 좌표 복원 (원래 각도로 회전)
  const invRad = degToRad(plan.deckingDirectionDeg);
  
  const finalPiles = piles.map(p => rotatePoint(p, invRad));
  const finalJoists = allJoists.map(j => {
     const p1 = rotatePoint({ xMm: j.x1, yMm: j.y1 }, invRad);
     const p2 = rotatePoint({ xMm: j.x2, yMm: j.y2 }, invRad);
     return { x1: p1.xMm, y1: p1.yMm, x2: p2.xMm, y2: p2.yMm };
  });
  const finalBearers = bearers.map(b => {
     const p1 = rotatePoint({ xMm: b.x1, yMm: b.y1 }, invRad);
     const p2 = rotatePoint({ xMm: b.x2, yMm: b.y2 }, invRad);
     return { x1: p1.xMm, y1: p1.yMm, x2: p2.xMm, y2: p2.yMm };
  });

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
      primaryLenM: Math.round((primaryLenMm / 1000) * 1000) / 1000,
      secondaryLenM: Math.round((secondaryLenMm / 1000) * 1000) / 1000
    },
    anchors: { qty: anchorQty },
    footings: { qty: footingQty },
    fasteners: { mode: fasteningMode, screws, clips },
    structureLayout: {
       piles: finalPiles,
       bearers: finalBearers,
       joists: finalJoists
    }
  };
}
