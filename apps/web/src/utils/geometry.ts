export function projectPointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  const atob = { x: b.x - a.x, y: b.y - a.y };
  const atop = { x: p.x - a.x, y: p.y - a.y };
  const len2 = atob.x * atob.x + atob.y * atob.y;
  let t = (atop.x * atob.x + atop.y * atob.y) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * atob.x, y: a.y + t * atob.y };
}
