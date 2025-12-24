import { type CutoutShape } from "../types";

export type CutoutMeta = {
    shape: CutoutShape;
    xMm: number;
    yMm: number;
    widthMm: number;
    heightMm: number;
};

export function holeShapeFromPoints(pts: { xMm: number; yMm: number }[]): CutoutShape {
    if (pts.length === 4) return "rectangle";
    if (pts.length >= 16) return "circle";
    return "free";
}

export function bboxFromPoints(pts: { xMm: number; yMm: number }[]) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
        minX = Math.min(minX, p.xMm);
        maxX = Math.max(maxX, p.xMm);
        minY = Math.min(minY, p.yMm);
        maxY = Math.max(maxY, p.yMm);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const w = Math.max(0, maxX - minX);
    const h = Math.max(0, maxY - minY);
    return { minX, maxX, minY, maxY, cx, cy, w, h };
}

export function metaFromHolePoints(pts: { xMm: number; yMm: number }[], shape?: CutoutShape): CutoutMeta {
    const b = bboxFromPoints(pts);
    const detected = shape ?? holeShapeFromPoints(pts);
    return { shape: detected, xMm: b.cx, yMm: b.cy, widthMm: Math.round(b.w), heightMm: Math.round(b.h) };
}
