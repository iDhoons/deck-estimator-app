import type {
  Plan,
  Product,
  Ruleset,
  Quantities,
  FasteningMode,
  Polygon,
  Point,
  LengthBreakdown,
  SteelPipeSpec,
  SubstructureDetail,
  FoundationType,
} from "./types.js";
import {
  degToRad,
  rotatePolygon,
  polygonAreaMm2,
  bbox,
  polygonSpanAtY,
  getClippedGridLines,
  rotatePoint,
  pointToSegmentDistance,
  generateOpeningFraming,
} from "./geometry.js";
import { calculateStairs } from "./calculateStairs.js";

// ============================================================
// 하부구조 상세 계산 헬퍼 함수들
// ============================================================

/**
 * 기본 아연도각관 규격 (Ruleset에 설정이 없을 때 사용)
 */
const DEFAULT_BEARER_SPEC: SteelPipeSpec = {
  id: "100x100x1.6T",
  name: "아연도각관 100×100×1.6T",
  widthMm: 100,
  heightMm: 100,
  thicknessMm: 1.6,
  stockLengthMm: 6000,
};

const DEFAULT_JOIST_SPEC: SteelPipeSpec = {
  id: "50x50x1.6T",
  name: "아연도각관 50×50×1.6T",
  widthMm: 50,
  heightMm: 50,
  thicknessMm: 1.6,
  stockLengthMm: 6000,
};

const DEFAULT_POST_SPEC: SteelPipeSpec = {
  id: "100x100x1.6T",
  name: "아연도각관 100×100×1.6T",
  widthMm: 100,
  heightMm: 100,
  thicknessMm: 1.6,
  stockLengthMm: 6000,
};

/**
 * 선분 길이 계산 (mm)
 */
function segmentLengthMm(seg: { x1: number; y1: number; x2: number; y2: number }): number {
  return Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
}

/**
 * 선분 배열의 길이별 내역 그룹화 (100mm 단위 반올림)
 */
function groupByLength(
  segments: { x1: number; y1: number; x2: number; y2: number }[],
): LengthBreakdown[] {
  const map = new Map<number, number>();

  for (const seg of segments) {
    const len = segmentLengthMm(seg);
    // 100mm 단위로 반올림 (예: 1234 → 1200, 1256 → 1300)
    const roundedLen = Math.round(len / 100) * 100;
    if (roundedLen > 0) {
      map.set(roundedLen, (map.get(roundedLen) ?? 0) + 1);
    }
  }

  return Array.from(map.entries())
    .map(([lengthMm, qty]) => ({ lengthMm, qty }))
    .sort((a, b) => b.lengthMm - a.lengthMm); // 긴 것부터
}

/**
 * 필요 원자재 수량 계산 (커팅 로스 포함)
 * - 1D 빈 패킹 근사: 총 길이 / 원자재 길이 + 로스율
 */
function calculateStockPieces(
  totalLengthMm: number,
  stockLengthMm: number,
  lossRate: number = 0.05,
): number {
  if (totalLengthMm <= 0 || stockLengthMm <= 0) return 0;
  const rawPieces = totalLengthMm / stockLengthMm;
  return Math.ceil(rawPieces * (1 + lossRate));
}

/**
 * Ruleset에서 SteelPipeSpec 생성
 */
function createSpecFromConfig(
  config: { widthMm: number; heightMm: number; thicknessMm: number; stockLengthMm: number },
  stockLengthOverride?: number,
): SteelPipeSpec {
  const stockLen = stockLengthOverride ?? config.stockLengthMm;
  return {
    id: `${config.widthMm}x${config.heightMm}x${config.thicknessMm}T`,
    name: `아연도각관 ${config.widthMm}×${config.heightMm}×${config.thicknessMm}T`,
    widthMm: config.widthMm,
    heightMm: config.heightMm,
    thicknessMm: config.thicknessMm,
    stockLengthMm: stockLen,
  };
}

/**
 * 기초 타입별 규격 설명
 */
function getFoundationSpecDescription(type: FoundationType): string {
  switch (type) {
    case "concrete_block":
      return "200×200×200mm";
    case "anchor_bolt":
      return "M12×100";
    case "rubber_pad":
      return "200×200×6T";
    case "screw_pile":
      return "Φ76×1200";
    default:
      return "";
  }
}

function consumerLossRate(plan: Plan, rules: Ruleset): number {
  const r = rules.consumerLoss;
  if (!r) return 0;

  const vertices = plan.polygon.outer.length;
  const cutouts = (plan.polygon.holes ?? []).length;

  const extraV = Math.max(0, vertices - 4);
  const rate = r.base + extraV * r.vertexFactor + cutouts * r.cutoutFactor;
  return Math.min(r.cap, Math.max(0, rate));
}

function totalDeckBoardUsedLengthMm(
  rot: Polygon,
  pitchMm: number,
): { usedLengthMm: number; boardLines: number } {
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
  fasteningMode: FasteningMode,
): Quantities {
  // 1) 면적 (mm^2 → m^2)
  const deckAreaMm2 = polygonAreaMm2(plan.polygon);
  let stairsAreaMm2 = 0;
  if (plan.stairs?.enabled && plan.stairs.items) {
    for (const item of plan.stairs.items) {
      // 단순 직사각형 면적 합산 (폭 x (단수 x 단깊이))
      stairsAreaMm2 += item.widthMm * (item.stepCount * item.stepDepthMm);
    }
  }

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
  // 내부 장선 & 멍에 (startFromEdge: true로 외곽 멍에 기준 배치)
  const innerJoists = getClippedGridLines(rotDeck, rules.secondarySpacingMm, "x");
  let innerBearers = getClippedGridLines(rotDeck, rules.primarySpacingMm, "y", true);

  const outer = rotDeck.outer;

  // 외곽 멍에 (Rim Bearer) 생성 - 모든 외곽 테두리에 멍에 추가
  // 데크 테두리 전체를 멍에로 둘러싸서 프레임 역할
  const rimBearers: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < outer.length; i++) {
    const p1 = outer[i];
    const p2 = outer[(i + 1) % outer.length];
    // 벽체(ledger)로 선택된 변은 제외 (ledger가 멍에 역할을 대체)
    if (attachedEdgeIndices.includes(i)) continue;

    // 모든 외곽 변을 멍에로 추가
    rimBearers.push({ x1: p1.xMm, y1: p1.yMm, x2: p2.xMm, y2: p2.yMm });
  }

  // 외곽 장선 (Rim Joist)은 별도로 생성하지 않음
  // 모든 외곽이 멍에이므로, 장선은 내부 장선만 사용
  const rimJoists: { x1: number; y1: number; x2: number; y2: number }[] = [];

  // 개구부(홀) 프레이밍 생성 - Header/Trimmer
  const openingHeaders: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const openingTrimmers: { x1: number; y1: number; x2: number; y2: number }[] = [];

  if (rotDeck.holes && rotDeck.holes.length > 0) {
    for (const hole of rotDeck.holes) {
      if (!hole || hole.length < 3) continue;
      // 장선이 X축 방향이므로 joistAxis = 'x'
      const { headers, trimmers } = generateOpeningFraming(hole, "x");
      openingHeaders.push(...headers);
      openingTrimmers.push(...trimmers);
    }
  }

  // 모든 멍에 합치기 (내부 + 외곽 + 개구부 Header)
  // Header는 장선 방향에 수직이므로 멍에(Bearer)와 같은 방향
  let bearers = [...innerBearers, ...rimBearers, ...openingHeaders];

  // 모든 장선 합치기 (내부 + 외곽 + 개구부 Trimmer)
  // Trimmer는 장선 방향과 평행하므로 장선(Joist)으로 추가
  const allJoists = [...innerJoists, ...rimJoists, ...openingTrimmers];

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

  // 벽체 변에 "딱 붙은" bearer(거의 동일선)만 제거(과도 삭제 방지)
  if (wallEdgesRot.length > 0) {
    const epsMm = 5;
    bearers = bearers.filter((b) => {
      const mx = (b.x1 + b.x2) / 2;
      const my = (b.y1 + b.y2) / 2;
      for (const s of wallEdgesRot) {
        if (pointToSegmentDistance(mx, my, s) <= epsMm) return false;
      }
      return true;
    });
  }

  // 길이 합산
  const secondaryLenMm = allJoists.reduce(
    (acc, j) => acc + Math.hypot(j.x2 - j.x1, j.y2 - j.y1),
    0,
  );
  const primaryLenMm = bearers.reduce((acc, b) => acc + Math.hypot(b.x2 - b.x1, b.y2 - b.y1), 0);

  // 5) 기초(Pile) 위치 계산
  // - 요구사항: (1) 벽체(ledger) 선택 변에는 기초 0개, (2) 나머지 테두리는 일정 간격으로 기초,
  //           (3) 내부 기초도 동일 간격(footingSpacingMm)으로 멍에(bearer) 라인을 따라 배치
  const spacingMm = rules.footingSpacingMm;

  function samplePointsOnSegment(
    s: { x1: number; y1: number; x2: number; y2: number },
    maxStepMm: number,
  ): Point[] {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [];

    // 균등 분할: 최소 구간 수 계산
    const segments = Math.max(1, Math.ceil(len / maxStepMm));
    const stepX = dx / segments;
    const stepY = dy / segments;

    const pts: Point[] = [];
    // 시작점 포함
    pts.push({ xMm: s.x1, yMm: s.y1 });

    // 중간점들 추가
    for (let i = 1; i < segments; i++) {
      pts.push({ xMm: s.x1 + stepX * i, yMm: s.y1 + stepY * i });
    }

    // 끝점 포함
    pts.push({ xMm: s.x2, yMm: s.y2 });
    return pts;
  }

  const pileCandidates: Point[] = [];

  // Helper: Check if a point is near a line segment
  function isPointNearSegment(
    p: Point,
    seg: { x1: number; y1: number; x2: number; y2: number },
    toleranceMm = 10,
  ): boolean {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-9) return Math.hypot(p.xMm - seg.x1, p.yMm - seg.y1) <= toleranceMm;

    const t = Math.max(0, Math.min(1, ((p.xMm - seg.x1) * dx + (p.yMm - seg.y1) * dy) / lenSq));
    const projX = seg.x1 + t * dx;
    const projY = seg.y1 + t * dy;
    return Math.hypot(p.xMm - projX, p.yMm - projY) <= toleranceMm;
  }

  // (B) 멍에 라인을 따라 footingSpacingMm 간격으로 기초 배치
  for (const b of bearers) {
    const segment = { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
    pileCandidates.push(...samplePointsOnSegment(segment, spacingMm));
  }

  // (A) 외곽 변 중 멍에가 교차하지 않는 변에는 멍에 간격으로 기초 배치
  for (let i = 0; i < outer.length; i++) {
    if (attachedEdgeIndices.includes(i)) continue;

    const p1 = outer[i];
    const p2 = outer[(i + 1) % outer.length];
    const edgeSeg = { x1: p1.xMm, y1: p1.yMm, x2: p2.xMm, y2: p2.yMm };

    // Check if any bearer crosses this edge
    let hasBearerCrossing = false;
    for (const b of bearers) {
      // Check if bearer endpoints are near this edge
      if (
        isPointNearSegment({ xMm: b.x1, yMm: b.y1 }, edgeSeg) ||
        isPointNearSegment({ xMm: b.x2, yMm: b.y2 }, edgeSeg)
      ) {
        hasBearerCrossing = true;
        break;
      }
    }

    // If no bearer crosses this edge, add piles at bearer spacing
    if (!hasBearerCrossing) {
      pileCandidates.push(...samplePointsOnSegment(edgeSeg, spacingMm));
    }
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
  // 스냅샷/디버깅 안정화를 위해 순서를 결정적으로 정렬
  filteredPiles.sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);

  const footingQty = filteredPiles.length;
  const anchorQty = footingQty;

  const stairs = calculateStairs(plan, product, rules, fasteningMode);

  // 5.5) 포스트(Post) 산출: 지면 → 데크 상판 표면 높이(deckHeightMm)를 그대로 사용
  const deckHeightMm = plan.deckHeightMm ?? 0;
  const postQty = footingQty;
  const postEachLengthMm = deckHeightMm;
  const postTotalLengthM =
    deckHeightMm > 0 ? Math.round(((postQty * postEachLengthMm) / 1000) * 1000) / 1000 : 0;

  // ============================================================
  // 5.6) 하부구조 상세 계산 (SubstructureDetail)
  // ============================================================
  const subConfig = rules.substructure;
  const subLossRate = subConfig?.lossRate ?? 0.05;
  const subStockLengthMm = subConfig?.stockLengthMm ?? 6000;

  // 멍에(Bearer) 규격
  const bearerSpec: SteelPipeSpec = subConfig?.bearerSpec
    ? createSpecFromConfig(subConfig.bearerSpec, subStockLengthMm)
    : DEFAULT_BEARER_SPEC;

  // 장선(Joist) 규격
  const joistSpec: SteelPipeSpec = subConfig?.joistSpec
    ? createSpecFromConfig(subConfig.joistSpec, subStockLengthMm)
    : DEFAULT_JOIST_SPEC;

  // 포스트 규격
  const postSpec: SteelPipeSpec = subConfig?.postSpec
    ? createSpecFromConfig(subConfig.postSpec, subStockLengthMm)
    : DEFAULT_POST_SPEC;

  // 기초 타입
  const foundationType: FoundationType = subConfig?.foundationType ?? "concrete_block";

  // 멍에 상세 계산 (내부 + 외곽 구분)
  const bearerTotalLengthMm = bearers.reduce((acc, b) => acc + segmentLengthMm(b), 0);
  const bearerPieces = bearers.length;
  const innerBearerPieces = innerBearers.length;
  const rimBearerPieces = rimBearers.length;
  const bearerBreakdown = groupByLength(bearers);
  const bearerStockPieces = calculateStockPieces(
    bearerTotalLengthMm,
    bearerSpec.stockLengthMm,
    subLossRate,
  );

  // 장선 상세 계산 (내부 + 외곽 구분)
  const joistTotalLengthMm = allJoists.reduce((acc, j) => acc + segmentLengthMm(j), 0);
  const joistPieces = allJoists.length;
  const innerJoistPieces = innerJoists.length;
  const rimJoistPieces = rimJoists.length;
  const joistBreakdown = groupByLength(allJoists);
  const joistStockPieces = calculateStockPieces(
    joistTotalLengthMm,
    joistSpec.stockLengthMm,
    subLossRate,
  );

  // 포스트 상세 계산
  const postTotalLengthMm = postQty * postEachLengthMm;
  const postStockPieces =
    deckHeightMm > 0
      ? calculateStockPieces(postTotalLengthMm, postSpec.stockLengthMm, subLossRate)
      : 0;

  // 부속자재(철물) 계산
  // - 앙카볼트: 기초당 4개
  // - 앵글 브라켓: 멍에-장선 연결부 (멍에 끝점 × 2 + 장선-멍에 교차점)
  // - 베이스 플레이트: 포스트 수량과 동일
  // - 셀프 드릴링 스크류: 연결부당 4개
  const anchorBoltsQty = footingQty * 4;
  const angleBracketsQty = bearerPieces * 2 + joistPieces * 2; // 각 연결부에 2개
  const basePlatesQty = deckHeightMm > 0 ? postQty : 0;
  const postCapsQty = deckHeightMm > 0 ? postQty : 0;
  const joistHangersQty = innerJoistPieces; // 내부 장선에만 행거 사용
  const selfDrillingScrewQty = (bearerPieces * 2 + joistPieces * 2) * 4; // 연결부당 4개

  // SubstructureDetail 구성
  const substructureDetail: SubstructureDetail = {
    bearer: {
      spec: bearerSpec,
      totalLengthM: Math.round((bearerTotalLengthMm / 1000) * 1000) / 1000,
      pieces: bearerPieces,
      innerPieces: innerBearerPieces,
      rimPieces: rimBearerPieces,
      breakdown: bearerBreakdown,
      stockPieces: bearerStockPieces,
    },
    joist: {
      spec: joistSpec,
      totalLengthM: Math.round((joistTotalLengthMm / 1000) * 1000) / 1000,
      pieces: joistPieces,
      innerPieces: innerJoistPieces,
      rimPieces: rimJoistPieces,
      breakdown: joistBreakdown,
      stockPieces: joistStockPieces,
    },
    foundation: {
      type: foundationType,
      specDescription: getFoundationSpecDescription(foundationType),
      qty: footingQty,
    },
    ...(deckHeightMm > 0
      ? {
          post: {
            spec: postSpec,
            qty: postQty,
            eachLengthMm: Math.round(postEachLengthMm),
            totalLengthM: Math.round((postTotalLengthMm / 1000) * 1000) / 1000,
            stockPieces: postStockPieces,
          },
        }
      : {}),
    hardware: {
      anchorBolts: {
        spec: "M12×100",
        qty: anchorBoltsQty,
      },
      angleBrackets: {
        spec: "50×50×5T",
        qty: angleBracketsQty,
      },
      ...(deckHeightMm > 0
        ? {
            basePlates: {
              spec: "100×100×3T",
              qty: basePlatesQty,
            },
            postCaps: {
              spec: "100×100",
              qty: postCapsQty,
            },
          }
        : {}),
      joistHangers: {
        spec: `${joistSpec.widthMm}×${joistSpec.heightMm}`,
        qty: joistHangersQty,
      },
      selfDrillingScrew: {
        spec: "M5×19",
        qty: selfDrillingScrewQty,
      },
    },
  };

  // 6) 패스너
  // 내부 장선 라인 수만 고려 (단순화)
  const uniqueJoistXs = new Set(innerJoists.map((j) => Math.round(j.x1 * 10) / 10)).size;
  const intersections = boardLines * uniqueJoistXs;
  const screws = fasteningMode === "screw" ? intersections * rules.screwPerIntersection : undefined;
  const clips = fasteningMode === "clip" ? intersections : undefined;

  // 7) 레이아웃 좌표 복원 (원래 각도로 회전)
  const invRad = degToRad(plan.deckingDirectionDeg);

  const finalPiles = filteredPiles.map((p) => rotatePoint(p, invRad));
  const finalJoists = allJoists.map((j) => {
    const p1 = rotatePoint({ xMm: j.x1, yMm: j.y1 }, invRad);
    const p2 = rotatePoint({ xMm: j.x2, yMm: j.y2 }, invRad);
    return { x1: p1.xMm, y1: p1.yMm, x2: p2.xMm, y2: p2.yMm };
  });
  const finalBearers = bearers.map((b) => {
    const p1 = rotatePoint({ xMm: b.x1, yMm: b.y1 }, invRad);
    const p2 = rotatePoint({ xMm: b.x2, yMm: b.y2 }, invRad);
    return { x1: p1.xMm, y1: p1.yMm, x2: p2.xMm, y2: p2.yMm };
  });

  return {
    area: {
      totalM2: totalAreaMm2 / 1_000_000,
      deckM2: deckAreaMm2 / 1_000_000,
      stairsM2: stairsAreaMm2 / 1_000_000,
    },
    boards: {
      pieces,
      usedLengthMm: Math.round(usedLengthMm),
      stockLengthMm: product.stockLengthMm,
      lossRateApplied: lossRate,
    },
    substructure: {
      primaryLenM:
        Math.round(((plan.substructureOverrides?.primaryLenMm ?? primaryLenMm) / 1000) * 1000) /
        1000,
      secondaryLenM:
        Math.round(((plan.substructureOverrides?.secondaryLenMm ?? secondaryLenMm) / 1000) * 1000) /
        1000,
    },
    substructureDetail,
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
      joists: finalJoists,
    },
  };
}
