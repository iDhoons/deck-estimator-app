import React, { useMemo } from "react";
import type { Polygon, CutPlan } from "@deck/core";
import { rotatePolygon, rotatePoint, degToRad, bbox } from "@deck/core";
import { colorForLengthKey, lengthKey } from "../../utils/cutPlanViz";

type BoardPieceVisual = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  fill: string;
};

interface DeckBoardPatternProps {
  polygon: Polygon;
  cutPlan: CutPlan;
  boardWidthMm: number;
  gapMm: number;
  deckingDirectionDeg: number;
  opacity?: number;
}

/**
 * Y=const 스캔라인에서 폴리곤과의 교차 X좌표를 구해 정렬
 */
function intersectionsWithHorizontalScan(
  ring: { xMm: number; yMm: number }[],
  y: number,
): number[] {
  const xs: number[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];

    if (a.yMm === b.yMm) continue;

    const yMin = Math.min(a.yMm, b.yMm);
    const yMax = Math.max(a.yMm, b.yMm);

    if (y < yMin || y >= yMax) continue;

    const t = (y - a.yMm) / (b.yMm - a.yMm);
    const x = a.xMm + t * (b.xMm - a.xMm);
    xs.push(x);
  }
  xs.sort((p, q) => p - q);
  return xs;
}

export const DeckBoardPattern = React.memo(function DeckBoardPattern({
  polygon,
  cutPlan,
  boardWidthMm,
  gapMm,
  deckingDirectionDeg,
  opacity = 0.7,
}: DeckBoardPatternProps) {
  const patternData = useMemo(() => {
    if (!cutPlan || !cutPlan.rows || cutPlan.rows.length === 0) return null;
    if (polygon.outer.length < 3) return null;

    const pitchMm = boardWidthMm + gapMm;
    const rad = degToRad(-deckingDirectionDeg);

    // 폴리곤을 회전하여 보드 방향을 X축에 정렬
    const rotatedPoly = rotatePolygon(polygon, rad);
    const bb = bbox(rotatedPoly.outer);

    const pieces: BoardPieceVisual[] = [];

    // 각 행 처리
    for (const row of cutPlan.rows) {
      // 해당 행의 Y 위치 계산 (bb.minY부터 시작)
      const y = bb.minY + 0.5 + row.rowIndex * pitchMm + boardWidthMm / 2;

      // 해당 Y에서 폴리곤과의 교차점 계산
      const intersections = intersectionsWithHorizontalScan(rotatedPoly.outer, y);

      // 홀 처리: 홀과의 교차점도 계산하여 제외
      let segments: { start: number; end: number }[] = [];
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        segments.push({ start: intersections[i], end: intersections[i + 1] });
      }

      // 홀 영역 제외
      if (polygon.holes) {
        for (const hole of polygon.holes) {
          if (!hole || hole.length < 3) continue;
          const rotatedHole = hole.map((p) => rotatePoint(p, rad));
          const holeIntersections = intersectionsWithHorizontalScan(rotatedHole, y);

          for (let h = 0; h + 1 < holeIntersections.length; h += 2) {
            const hStart = holeIntersections[h];
            const hEnd = holeIntersections[h + 1];

            const newSegments: { start: number; end: number }[] = [];
            for (const seg of segments) {
              if (seg.end <= hStart || seg.start >= hEnd) {
                newSegments.push(seg);
              } else {
                if (seg.start < hStart) newSegments.push({ start: seg.start, end: hStart });
                if (seg.end > hEnd) newSegments.push({ start: hEnd, end: seg.end });
              }
            }
            segments = newSegments;
          }
        }
      }

      if (segments.length === 0) continue;

      // 각 세그먼트 내에서 pieces 배치
      let segmentIndex = 0;
      let xCursor = segments[0]?.start ?? 0;

      for (let pieceIdx = 0; pieceIdx < row.pieces.length; pieceIdx++) {
        const piece = row.pieces[pieceIdx];

        // 현재 세그먼트 확인
        while (segmentIndex < segments.length && xCursor >= segments[segmentIndex].end) {
          segmentIndex++;
          if (segmentIndex < segments.length) {
            xCursor = segments[segmentIndex].start;
          }
        }

        if (segmentIndex >= segments.length) break;

        const segment = segments[segmentIndex];
        const x1 = Math.max(xCursor, segment.start);
        let x2 = x1 + piece.lengthMm;

        // 세그먼트 끝을 넘어가면 자르기
        if (x2 > segment.end) {
          x2 = segment.end;
        }

        const y1 = y - boardWidthMm / 2;
        const y2 = y + boardWidthMm / 2;

        // 길이(정확값) 기준 색상: ≤1000mm는 하나로 묶고, 그 외는 길이별로 고유색
        const k = lengthKey(piece.lengthMm);
        const fill = colorForLengthKey(k);

        pieces.push({
          id: `${row.rowIndex}-${pieceIdx}`,
          x1,
          y1,
          x2,
          y2,
          width: boardWidthMm,
          fill,
        });

        xCursor = x2;
      }
    }

    // 원래 좌표계로 역회전
    const invRad = degToRad(deckingDirectionDeg);
    const transformedPieces = pieces.map((p) => {
      const p1 = rotatePoint({ xMm: p.x1, yMm: p.y1 }, invRad);
      const p2 = rotatePoint({ xMm: p.x2, yMm: p.y1 }, invRad);
      const p3 = rotatePoint({ xMm: p.x2, yMm: p.y2 }, invRad);
      const p4 = rotatePoint({ xMm: p.x1, yMm: p.y2 }, invRad);

      return {
        ...p,
        points: `${p1.xMm},${p1.yMm} ${p2.xMm},${p2.yMm} ${p3.xMm},${p3.yMm} ${p4.xMm},${p4.yMm}`,
      };
    });

    return {
      pieces: transformedPieces,
      clipId: `board-pattern-clip-${Date.now()}`,
    };
  }, [polygon, cutPlan, boardWidthMm, gapMm, deckingDirectionDeg]);

  if (!patternData || patternData.pieces.length === 0) return null;

  // 폴리곤 포인트 문자열
  const outerPointsStr = polygon.outer.map((p) => `${p.xMm},${p.yMm}`).join(" ");

  return (
    <g className="deck-board-pattern" opacity={opacity}>
      {/* ClipPath 정의 */}
      <defs>
        <clipPath id={patternData.clipId}>
          <polygon points={outerPointsStr} clipRule="evenodd" />
        </clipPath>
      </defs>

      {/* 보드 패턴 렌더링 */}
      <g clipPath={`url(#${patternData.clipId})`}>
        {patternData.pieces.map((piece) => (
          <polygon
            key={piece.id}
            points={piece.points}
            fill={piece.fill}
            stroke="#444"
            strokeWidth={0.8}
            pointerEvents="none"
          />
        ))}
      </g>
    </g>
  );
});
