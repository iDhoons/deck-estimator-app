export function circleSegmentsForSagitta(radiusMm: number, sagittaMm: number) {
  if (radiusMm <= 0) return 3;
  const th = Math.acos(1 - sagittaMm / radiusMm); // half angle
  const step = 2 * th;
  return Math.ceil((2 * Math.PI) / step);
}
