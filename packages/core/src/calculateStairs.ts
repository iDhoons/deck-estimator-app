import type { Plan, Quantities } from "./types.js";

export function calculateStairs(
  plan: Plan,
  _product: unknown,
  _rules: unknown,
  _fasteningMode: unknown,
): Quantities["stairs"] | undefined {
  if (!plan.stairs?.enabled) return undefined;

  const items: NonNullable<Quantities["stairs"]>["items"] = [];

  let totalTreadAreaM2 = 0;
  let totalRiserAreaM2 = 0;

  const stairItems = plan.stairs.items || [];

  for (const config of stairItems) {
    const { widthMm, stepCount, stepDepthMm, stepHeightMm } = config;

    if (stepCount <= 0 || widthMm <= 0) continue;

    const unitRunMm = stepDepthMm;
    const unitRiseMm = stepHeightMm;

    // 각 계단의 상판(디딤판) 면적 계산 (단수 × 폭 × 깊이)
    const treadAreaM2 = (stepCount * widthMm * unitRunMm) / 1_000_000;
    totalTreadAreaM2 += treadAreaM2;

    // 각 계단의 높이판(라이저) 면적 계산 (단수 × 폭 × 높이)
    const riserAreaM2 = (stepCount * widthMm * unitRiseMm) / 1_000_000;
    totalRiserAreaM2 += riserAreaM2;

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
    treadAreaM2: Math.round(totalTreadAreaM2 * 100) / 100,
    riserAreaM2: Math.round(totalRiserAreaM2 * 100) / 100,
    totalAreaM2: Math.round((totalTreadAreaM2 + totalRiserAreaM2) * 100) / 100,
  };
}
