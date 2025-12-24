// 프리셋 도형의 실제 mm(치수)를 유지해야 하므로, 스케일 없이 '중앙으로 평행이동'만 수행
export const centerShapeToCanvasNoScale = (points: { xMm: number; yMm: number }[], viewBoxCenter: { x: number; y: number }) => {
    if (points.length === 0) return points;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.xMm);
        maxX = Math.max(maxX, p.xMm);
        minY = Math.min(minY, p.yMm);
        maxY = Math.max(maxY, p.yMm);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const dx = viewBoxCenter.x - cx;
    const dy = viewBoxCenter.y - cy;
    return points.map((p) => ({ xMm: p.xMm + dx, yMm: p.yMm + dy }));
};

export function circleSegmentsForSagitta(radiusMm: number, targetSagittaMm: number) {
    const r = Math.max(radiusMm, 0);
    const s = Math.max(0.001, targetSagittaMm);
    if (r <= s) return 16;
    const x = 1 - s / r;
    const clamped = Math.min(0.999999, Math.max(-0.999999, x));
    const n = Math.ceil(Math.PI / Math.acos(clamped));
    return Math.min(256, Math.max(16, n));
}

export function buildCirclePoints(center: { xMm: number; yMm: number }, radiusMm: number, segments: number) {
    const pts: { xMm: number; yMm: number }[] = [];
    const r = Math.max(radiusMm, 0);
    for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push({ xMm: center.xMm + Math.cos(a) * r, yMm: center.yMm + Math.sin(a) * r });
    }
    return pts;
}
