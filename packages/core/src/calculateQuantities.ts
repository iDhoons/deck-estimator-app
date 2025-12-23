import type { Plan, Product, Ruleset, Quantities, FasteningMode, Polygon, Point } from "./types.js";
import {
  degToRad,
  rotatePolygon,
  polygonAreaMm2,
  bbox,
  polygonSpanAtY,
  getClippedGridLines,
  isPointInPolygon,
  rotatePoint
} from "./geometry.js";
import { calculateStairs } from "./calculateStairs.js";

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

  const attachedEdgeIndices = plan.attachedEdgeIndices ?? [];

  const pitchMm = plan.boardWidthMm + rules.gapMm;

  // 3) 보드 총 사용 길이
  const { usedLengthMm, boardLines } = totalDeckBoardUsedLengthMm(rotDeck, pitchMm);

  const lossRate = rules.mode === "consumer" ? consumerLossRate(plan, rules) : 0;
  const pieces = Math.ceil((usedLengthMm / product.stockLengthMm) * (1 + lossRate));

  // Ledger(벽체 고정) 길이/볼트 산출: 선택된 변들의 길이 합
  const ledgerLenMm = (() => {
    if (attachedEdgeIndices.length === 0) return 0;
    const pts = plan.polygon.outer;
    if (pts.length < 2) return 0;
    let sum = 0;
    for (const i of attachedEdgeIndices) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (!a || !b) continue;
      sum += Math.hypot(b.xMm - a.xMm, b.yMm - a.yMm);
    }
    return sum;
  })();
  const ledgerAnchorSpacingMm = rules.anchorSpacingMm || 600;
  const ledgerAnchorBoltsQty =
    ledgerLenMm > 0 ? Math.max(2, Math.ceil(ledgerLenMm / ledgerAnchorSpacingMm) + 1) : 0;

  // 4) 하부 구조물 (정밀 계산 & 레이아웃)
  // 내부 장선 & 멍에
  const innerJoists = getClippedGridLines(rotDeck, rules.secondarySpacingMm, "x");
  let bearers = getClippedGridLines(rotDeck, rules.primarySpacingMm, "y");

  // 외곽 장선 (Rim Joist) 생성
  const rimJoists: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const outer = rotDeck.outer;
  for (let i = 0; i < outer.length; i++) {
    const p1 = outer[i];
    const p2 = outer[(i + 1) % outer.length];
    // 벽체(ledger)로 선택된 변은 rim으로 처리하지 않음(ledger가 대체)
    if (attachedEdgeIndices.includes(i)) continue;
    rimJoists.push({ x1: p1.xMm, y1: p1.yMm, x2: p2.xMm, y2: p2.yMm });
  }

  // 모든 장선 합치기 (내부 + 외곽)
  const allJoists = [...innerJoists, ...rimJoists];

  // 벽체(ledger) 선택 변(복수)을 rotDeck 좌표계 선분으로 구성
  const wallEdgesRot = (() => {
    if (attachedEdgeIndices.length === 0) return [];
    const pts = rotDeck.outer;
    const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const i of attachedEdgeIndices) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (!a || !b) continue;
      segs.push({ x1: a.xMm, y1: a.yMm, x2: b.xMm, y2: b.yMm });
    }
    return segs;
  })();

  function pointToSegDistMm(px: number, py: number, s: { x1: number; y1: number; x2: number; y2: number }): number {
    const vx = s.x2 - s.x1;
    const vy = s.y2 - s.y1;
    const wx = px - s.x1;
    const wy = py - s.y1;
    const vv = vx * vx + vy * vy;
    if (vv <= 1e-9) return Math.hypot(px - s.x1, py - s.y1);
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
    const cx = s.x1 + t * vx;
    const cy = s.y1 + t * vy;
    return Math.hypot(px - cx, py - cy);
  }

  // 벽체 변에 "딱 붙은" bearer(거의 동일선)만 제거(과도 삭제 방지)
  if (wallEdgesRot.length > 0) {
    const epsMm = 5;
    bearers = bearers.filter((b) => {
      const mx = (b.x1 + b.x2) / 2;
      const my = (b.y1 + b.y2) / 2;
      for (const s of wallEdgesRot) {
        if (pointToSegDistMm(mx, my, s) <= epsMm) return false;
      }
      return true;
    });
  }

  // 길이 합산
  const secondaryLenMm = allJoists.reduce((acc, j) => acc + Math.hypot(j.x2 - j.x1, j.y2 - j.y1), 0);
  const primaryLenMm = bearers.reduce((acc, b) => acc + Math.hypot(b.x2 - b.x1, b.y2 - b.y1), 0);

  // 5) 기초(Pile) 위치 계산
  // - 요구사항: (1) 벽체(ledger) 선택 변에는 기초 0개, (2) 나머지 테두리는 일정 간격으로 기초,
  //           (3) 내부 기초도 동일 간격(footingSpacingMm)으로 멍에(bearer) 라인을 따라 배치
  const spacingMm = rules.footingSpacingMm;

  function samplePointsOnSegment(
    s: { x1: number; y1: number; x2: number; y2: number },
    stepMm: number
  ): Point[] {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [];
    const ux = dx / len;
    const uy = dy / len;
    const pts: Point[] = [];
    // 시작점 포함
    pts.push({ xMm: s.x1, yMm: s.y1 });
    if (stepMm > 0) {
      for (let d = stepMm; d < len - 1e-6; d += stepMm) {
        pts.push({ xMm: s.x1 + ux * d, yMm: s.y1 + uy * d });
      }
    }
    // 끝점 포함
    pts.push({ xMm: s.x2, yMm: s.y2 });
    return pts;
  }

  const pileCandidates: Point[] = [];

  // (A) 테두리 기초: 벽체 선택 변 제외한 외곽 변을 따라 배치
  for (let i = 0; i < outer.length; i++) {
    if (attachedEdgeIndices.includes(i)) continue;
    const p1 = outer[i];
    const p2 = outer[(i + 1) % outer.length];
    pileCandidates.push(
      ...samplePointsOnSegment({ x1: p1.xMm, y1: p1.yMm, x2: p2.xMm, y2: p2.yMm }, spacingMm)
    );
  }

  // (B) 내부 기초: 멍에(bearer) 선분을 따라 배치
  for (const b of bearers) {
    pileCandidates.push(...samplePointsOnSegment(b, spacingMm));
  }

  // 중복 제거(코너/겹침)
  const uniq = new Map<string, Point>();
  for (const p of pileCandidates) {
    // 1mm 정밀도로 키 생성
    const kx = Math.round(p.xMm);
    const ky = Math.round(p.yMm);
    const key = `${kx}:${ky}`;
    if (!uniq.has(key)) uniq.set(key, { xMm: kx, yMm: ky });
  }

  // 벽체(ledger) 변의 양 끝 코너 기초도 제외
  const wallCornerKeys = (() => {
    if (attachedEdgeIndices.length === 0) return new Set<string>();
    const keys = new Set<string>();
    const pts = rotDeck.outer;
    for (const i of attachedEdgeIndices) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (!a || !b) continue;
      keys.add(`${Math.round(a.xMm)}:${Math.round(a.yMm)}`);
      keys.add(`${Math.round(b.xMm)}:${Math.round(b.yMm)}`);
    }
    return keys;
  })();

  // 최종 piles
  const filteredPiles = Array.from(uniq.entries())
    .filter(([key]) => !wallCornerKeys.has(key))
    .map(([, p]) => p);

  const footingQty = filteredPiles.length;
  const anchorQty = footingQty;

  const stairs = calculateStairs(plan, product, rules, fasteningMode);

  // 5.5) 포스트(Post) 산출: 지면 → 데크 상판 표면 높이(deckHeightMm)를 그대로 사용
  const deckHeightMm = plan.deckHeightMm ?? 0;
  const postQty = footingQty;
  const postEachLengthMm = deckHeightMm;
  const postTotalLengthM =
    deckHeightMm > 0 ? Math.round(((postQty * postEachLengthMm) / 1000) * 1000) / 1000 : 0;

  // 6) 패스너
  // 내부 장선 라인 수만 고려 (단순화)
  const uniqueJoistXs = new Set(innerJoists.map(j => Math.round(j.x1 * 10) / 10)).size;
  const intersections = boardLines * uniqueJoistXs;
  const screws = fasteningMode === "screw" ? intersections * rules.screwPerIntersection : undefined;
  const clips = fasteningMode === "clip" ? intersections : undefined;

  // 7) 레이아웃 좌표 복원 (원래 각도로 회전)
  const invRad = degToRad(plan.deckingDirectionDeg);
  
  const finalPiles = filteredPiles.map(p => rotatePoint(p, invRad));
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
      primaryLenM:
        Math.round((((plan.substructureOverrides?.primaryLenMm ?? primaryLenMm) / 1000) * 1000)) / 1000,
      secondaryLenM:
        Math.round((((plan.substructureOverrides?.secondaryLenMm ?? secondaryLenMm) / 1000) * 1000)) / 1000
    },
    anchors: { qty: anchorQty },
    footings: { qty: footingQty },
    fasteners: {
      mode: fasteningMode,
      ...(screws !== undefined ? { screws } : {}),
      ...(clips !== undefined ? { clips } : {}),
    },
    ...(stairs ? { stairs } : {}),
    ...(deckHeightMm > 0
      ? {
          posts: {
            qty: postQty,
            eachLengthMm: Math.round(postEachLengthMm),
            totalLengthM: postTotalLengthM,
          },
        }
      : {}),
    ...(ledgerLenMm > 0
      ? {
          ledger: {
            lengthM: Math.round((ledgerLenMm / 1000) * 1000) / 1000,
            anchorBoltsQty: ledgerAnchorBoltsQty,
          },
        }
      : {}),
    structureLayout: {
       piles: finalPiles,
       bearers: finalBearers,
       joists: finalJoists
    }
  };
}
