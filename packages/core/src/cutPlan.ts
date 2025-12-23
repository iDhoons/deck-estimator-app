import type { Plan, Product, Ruleset, CutPlan, CutRow, CutPiece } from "./types";
import { degToRad, rotatePolygon, bbox, polygonSpanAtY } from "./geometry";

export function buildCutPlan(plan: Plan, product: Product, rules: Ruleset): CutPlan | null {
  if (rules.mode !== "pro") return null;

  // 1. 회전 및 기본 설정
  // 보드 방향을 X축으로 맞추기 위해 -deg 회전
  const rad = degToRad(-plan.deckingDirectionDeg);
  const poly = rotatePolygon(plan.polygon, rad);

  const boardWidth = plan.boardWidthMm ?? product.widthOptionsMm?.[0] ?? 140;
  const gap = rules.gapMm ?? product.gapMm ?? 5;
  const pitchMm = boardWidth + gap;
  const stockLen = product.stockLengthMm;
  const kerf = rules.kerfMm ?? 0;

  // 2. Y축 스캔 범위
  const bb = bbox(poly.outer);
  const minY = bb.minY;
  const maxY = bb.maxY;
  
  const cutRows: CutRow[] = [];
  const offcuts: number[] = []; // 가용 오프컷 풀 (mm)
  
  let groupSeq = 1;
  const newGroup = () => `G${groupSeq++}`;

  // 안전하게 0.5mm 정도 안쪽에서 시작
  const eps = 0.5;
  let y = minY + eps;
  let rowIndex = 0;

  while (y <= maxY - eps) {
    // 3. 현재 줄의 필요 길이 계산
    const requiredLenMm = polygonSpanAtY(poly, y);
    
    if (requiredLenMm > 0) {
        let remaining = requiredLenMm;
        const pieces: CutPiece[] = [];
        let rowOffcut = 0; // 이 줄에서 발생한 자투리 (시각화용)
        
        // 4. 자재 할당 (Bin Packing - Best Fit Strategy)
        while (remaining > 0) {
            // 한 번에 사용할 최대 길이는 원장 길이
            let chunk = remaining;
            if (chunk > stockLen) {
                chunk = stockLen;
            }
            
            // Best Fit: chunk 이상인 오프컷 중 가장 작은 것 찾기
            offcuts.sort((a, b) => a - b);
            let bestOffcutIdx = -1;
            
            for (let i = 0; i < offcuts.length; i++) {
                if (offcuts[i] >= chunk) {
                    bestOffcutIdx = i;
                    break; // 오름차순이므로 찾자마자 Best Fit
                }
            }
            
            if (bestOffcutIdx !== -1) {
                // 오프컷 재사용
                const sourceLen = offcuts[bestOffcutIdx];
                const usedLen = chunk;
                offcuts.splice(bestOffcutIdx, 1);
                
                pieces.push({
                    id: `R${rowIndex}-P${pieces.length}-OFF`,
                    source: "offcut",
                    colorGroup: "OFFCUT",
                    lengthMm: usedLen
                });
                
                remaining -= usedLen;
                
                // 남은 자투리 반환
                const leftOver = sourceLen - usedLen - kerf;
                if (leftOver > 50) { // 50mm 미만은 폐기
                    offcuts.push(leftOver);
                    // 마지막 조각이었다면 이 줄의 offcut으로 기록 (선택적)
                    if (remaining <= 0) rowOffcut = leftOver;
                }
            } else {
                // 새 보드 사용
                const group = newGroup();
                const usedLen = chunk;
                
                pieces.push({
                    id: `R${rowIndex}-P${pieces.length}-NEW`,
                    source: "stock",
                    colorGroup: group,
                    lengthMm: usedLen
                });
                
                remaining -= usedLen;
                
                const leftOver = stockLen - usedLen - kerf;
                if (leftOver > 50) {
                    offcuts.push(leftOver);
                    if (remaining <= 0) rowOffcut = leftOver;
                }
            }
        }
        
        cutRows.push({
            rowIndex,
            requiredLenMm,
            pieces,
            offcutMm: rowOffcut
        });
    }
    
    y += pitchMm;
    rowIndex++;
  }

  return {
    stockLengthMm: stockLen,
    totalRows: rowIndex,
    rows: cutRows,
    offcutsPoolMm: offcuts
  };
}
