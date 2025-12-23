import type { FasteningMode, Plan, Product, Quantities, Ruleset } from "./types.js";

type StringerMaterial = {
  thicknessMm: number;
  widthMm: number;
  stockLengthMm: number;
};

export function calculateStairs(
  plan: Plan,
  product: Product,
  rules: Ruleset,
  fasteningMode: FasteningMode
): Quantities["stairs"] | undefined {
  if (!plan.stairs?.enabled) return undefined;

  const totalRiseMm = plan.stairs.totalRiseMm ?? plan.deckHeightMm ?? 0;
  const widthMm = plan.stairs.widthMm ?? 0;
  if (totalRiseMm <= 0 || widthMm <= 0) {
    return {
      enabled: true,
      stepCount: 0,
      unitRiseMm: 0,
      unitRunMm: 0,
      widthMm: Math.max(0, widthMm),
      stringers: { qty: 0, lengthMm: 0, stockLengthMm: 0, pieces: 0 },
      treads: { boardsPerStep: 0, usedLengthMm: 0, pieces: 0 },
      landing: { type: plan.stairs.landingType ?? "pad", padsQty: 0 },
      fasteners: { mode: fasteningMode },
    };
  }

  const unitRiseTargetMm = 175;
  const unitRunMm = 260;
  const stepCount = Math.max(1, Math.ceil(totalRiseMm / unitRiseTargetMm));
  const unitRiseMm = totalRiseMm / stepCount;
  const totalRunMm = stepCount * unitRunMm;
  const stringerLenMm = Math.hypot(totalRiseMm, totalRunMm);

  const stringerSpacingMm = 400;
  const stringerQty = Math.max(2, Math.ceil(widthMm / stringerSpacingMm) + 1);

  const stringerMaterial: StringerMaterial = {
    thicknessMm: plan.stairs.stringerMaterialOverrides?.thicknessMm ?? product.thicknessMm,
    widthMm: plan.stairs.stringerMaterialOverrides?.widthMm ?? plan.boardWidthMm,
    stockLengthMm: plan.stairs.stringerMaterialOverrides?.stockLengthMm ?? product.stockLengthMm,
  };

  const stringerPieces = Math.ceil((stringerQty * stringerLenMm) / stringerMaterial.stockLengthMm);

  // 디딤판(계단 상판)은 메인데크 자재와 동일
  const treadPitchMm = plan.boardWidthMm + rules.gapMm;
  const boardsPerStep = Math.max(1, Math.ceil(unitRunMm / treadPitchMm));
  const treadsUsedLengthMm = stepCount * boardsPerStep * widthMm;
  const treadsPieces = Math.ceil(treadsUsedLengthMm / product.stockLengthMm);

  // 챌판(막힘형) 산출: 단순히 높이 방향을 보드 폭으로 채운다고 가정
  const closedRisers = plan.stairs.closedRisers ?? plan.stairs.sideCladding ?? false;
  const risers = (() => {
    if (!closedRisers) return undefined;
    const riserBoardsPerStep = Math.max(1, Math.ceil(unitRiseMm / treadPitchMm));
    const risersUsedLengthMm = stepCount * riserBoardsPerStep * widthMm;
    const risersPieces = Math.ceil(risersUsedLengthMm / product.stockLengthMm);
    return {
      boardsPerStep: riserBoardsPerStep,
      usedLengthMm: Math.round(risersUsedLengthMm),
      pieces: risersPieces,
    };
  })();

  // 하단 패드(콘크리트 판석): 스트링거 2개당 1개 기본
  const landingType = plan.stairs.landingType ?? "pad";
  const landing =
    landingType === "pad"
      ? { type: "pad" as const, padsQty: Math.max(1, Math.ceil(stringerQty / 2)) }
      : { type: "post" as const, pilesQty: stringerQty };

  // 체결재(대략): 디딤판 보드 × 스트링거 접점 개수 기반
  const treadIntersections = stepCount * boardsPerStep * stringerQty;
  const stairsScrews = fasteningMode === "screw" ? treadIntersections * 2 : undefined;
  const stairsClips = fasteningMode === "clip" ? treadIntersections : undefined;

  return {
    enabled: true,
    stepCount,
    unitRiseMm: Math.round(unitRiseMm * 10) / 10,
    unitRunMm,
    widthMm,
    stringers: {
      qty: stringerQty,
      lengthMm: Math.round(stringerLenMm),
      stockLengthMm: stringerMaterial.stockLengthMm,
      pieces: stringerPieces,
    },
    treads: {
      boardsPerStep,
      usedLengthMm: Math.round(treadsUsedLengthMm),
      pieces: treadsPieces,
    },
    ...(risers ? { risers } : {}),
    landing,
    fasteners: {
      mode: fasteningMode,
      ...(stairsScrews !== undefined ? { screws: stairsScrews } : {}),
      ...(stairsClips !== undefined ? { clips: stairsClips } : {}),
    },
  };
}


