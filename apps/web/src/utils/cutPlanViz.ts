import type { CutPlan } from "@deck/core";

export const SMALL_LENGTH_THRESHOLD_MM = 1000;
export const SMALL_LENGTH_KEY = `≤${SMALL_LENGTH_THRESHOLD_MM.toLocaleString()}` as const;

export type LengthKey = string;

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function hashHue(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) % 360;
  }
  return h;
}

export function lengthKey(lengthMm: number, thresholdMm = SMALL_LENGTH_THRESHOLD_MM): LengthKey {
  const len = Math.max(0, Math.round(lengthMm));
  if (len <= thresholdMm) return `≤${thresholdMm.toLocaleString()}`;
  return String(len);
}

export function lengthKeyLabel(key: LengthKey): string {
  if (key.startsWith("≤")) return `${key}mm`;
  const n = Number(key);
  if (!Number.isFinite(n)) return key;
  return `${n.toLocaleString()}mm`;
}

export function colorForLengthKey(key: LengthKey): string {
  // Keep the “small pieces” bucket visually consistent.
  if (key.startsWith("≤")) return "hsl(205, 65%, 65%)";

  const n = Number(key);
  if (Number.isFinite(n)) {
    // Deterministic gradient-ish mapping by length, but still spaced out.
    // Range assumes common stock lengths (<= 6000mm).
    const t = clamp01(n / 6000);
    const hue = 120 - t * 120; // green(120) -> red(0)
    return `hsl(${Math.round(hue)}, 60%, 62%)`;
  }

  // Fallback: stable hash color.
  return `hsl(${hashHue(key)}, 55%, 60%)`;
}

export type LengthLegendItem = {
  key: LengthKey;
  label: string;
  color: string;
  count: number; // number of pieces
};

export type LengthLegendData = {
  items: LengthLegendItem[];
  totalPieces: number;
  totalLengthMm: number;
  stockLengthMm: number;
  boardsApprox: number; // ceil(totalLengthMm / stockLengthMm)
};

export function buildLengthLegend(
  cutPlan: CutPlan,
  thresholdMm = SMALL_LENGTH_THRESHOLD_MM,
): LengthLegendData {
  const counts = new Map<LengthKey, number>();
  let totalPieces = 0;
  let totalLengthMm = 0;

  for (const row of cutPlan.rows ?? []) {
    for (const p of row.pieces ?? []) {
      const k = lengthKey(p.lengthMm, thresholdMm);
      counts.set(k, (counts.get(k) ?? 0) + 1);
      totalPieces += 1;
      totalLengthMm += p.lengthMm;
    }
  }

  const keys = Array.from(counts.keys()).sort((a, b) => {
    // small bucket first
    const aSmall = a.startsWith("≤");
    const bSmall = b.startsWith("≤");
    if (aSmall && !bSmall) return -1;
    if (!aSmall && bSmall) return 1;

    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.localeCompare(b);
  });

  const items: LengthLegendItem[] = keys.map((k) => ({
    key: k,
    label: lengthKeyLabel(k),
    color: colorForLengthKey(k),
    count: counts.get(k) ?? 0,
  }));

  const stockLengthMm = cutPlan.stockLengthMm || 3000;
  const boardsApprox = stockLengthMm > 0 ? Math.ceil(totalLengthMm / stockLengthMm) : 0;

  return { items, totalPieces, totalLengthMm, stockLengthMm, boardsApprox };
}
