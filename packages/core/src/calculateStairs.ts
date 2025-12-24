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

  const items: NonNullable<Quantities["stairs"]>["items"] = [];

  let totalStringerQty = 0;
  let totalStringerLengthMm = 0;
  let totalStringerPieces = 0;

  let totalTreadUsedMm = 0;
  let totalTreadPieces = 0;

  let totalRiserUsedMm = 0;
  let totalRiserPieces = 0;

  let totalLandingPads = 0;
  let totalLandingPiles = 0;

  let totalScrews = 0;
  let totalClips = 0;

  const stairItems = plan.stairs.items || [];

  const stringerMaterial: StringerMaterial = {
    thicknessMm: plan.stairs.stringerMaterialOverrides?.thicknessMm ?? product.thicknessMm,
    widthMm: plan.stairs.stringerMaterialOverrides?.widthMm ?? plan.boardWidthMm,
    stockLengthMm: plan.stairs.stringerMaterialOverrides?.stockLengthMm ?? product.stockLengthMm,
  };

  const treadPitchMm = plan.boardWidthMm + rules.gapMm;

  for (const config of stairItems) {
    const { widthMm, stepCount, stepDepthMm, stepHeightMm, closedRisers } = config;

    if (stepCount <= 0 || widthMm <= 0) continue;

    // Unit Run/Rise
    const unitRunMm = stepDepthMm;
    const unitRiseMm = stepHeightMm;
    const totalRiseMm = stepCount * unitRiseMm;
    const totalRunMm = stepCount * unitRunMm;

    // Stringers
    const stringerLenMm = Math.hypot(totalRiseMm, totalRunMm);
    const stringerSpacingMm = 400;
    const stringerQty = Math.max(2, Math.ceil(widthMm / stringerSpacingMm) + 1);

    const stringerPieces = Math.ceil((stringerQty * stringerLenMm) / stringerMaterial.stockLengthMm);

    totalStringerQty += stringerQty;
    totalStringerLengthMm += stringerQty * stringerLenMm;
    totalStringerPieces += stringerPieces;

    // Treads
    const boardsPerStep = Math.max(1, Math.ceil(unitRunMm / treadPitchMm));
    const treadsUsedLengthMm = stepCount * boardsPerStep * widthMm;
    const treadsPieces = Math.ceil(treadsUsedLengthMm / product.stockLengthMm);

    totalTreadUsedMm += treadsUsedLengthMm;
    totalTreadPieces += treadsPieces;

    // Risers
    if (closedRisers) {
      const riserBoardsPerStep = Math.max(1, Math.ceil(unitRiseMm / treadPitchMm));
      const risersUsedLengthMm = stepCount * riserBoardsPerStep * widthMm;
      const risersPieces = Math.ceil(risersUsedLengthMm / product.stockLengthMm);

      totalRiserUsedMm += risersUsedLengthMm;
      totalRiserPieces += risersPieces;
    }

    // Landing (Assuming PAD by default as per previous logic for now)
    const padsQty = Math.max(1, Math.ceil(stringerQty / 2));
    totalLandingPads += padsQty;

    // Fasteners
    const treadIntersections = stepCount * boardsPerStep * stringerQty;
    if (fasteningMode === "screw") {
      totalScrews += treadIntersections * 2;
    } else if (fasteningMode === "clip") {
      totalClips += treadIntersections;
    }

    items.push({
      id: config.id,
      stepCount,
      unitRiseMm: Math.round(unitRiseMm * 10) / 10,
      unitRunMm,
      widthMm,
    });
  }

  return {
    enabled: true,
    items,
    stringers: {
      totalQty: totalStringerQty,
      totalLengthMm: Math.round(totalStringerLengthMm),
      stockLengthMm: stringerMaterial.stockLengthMm,
      pieces: totalStringerPieces,
    },
    treads: {
      totalUsedLengthMm: Math.round(totalTreadUsedMm),
      pieces: totalTreadPieces,
    },
    risers: totalRiserUsedMm > 0 ? {
      totalUsedLengthMm: Math.round(totalRiserUsedMm),
      pieces: totalRiserPieces,
    } : undefined,
    landing: {
      padsQty: totalLandingPads,
      pilesQty: totalLandingPiles,
    },
    fasteners: {
      mode: fasteningMode,
      screws: totalScrews > 0 ? totalScrews : undefined,
      clips: totalClips > 0 ? totalClips : undefined,
    },
  };
}
