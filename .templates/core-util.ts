/**
 * Core 유틸리티 함수 템플릿
 *
 * 사용법:
 * 1. 이 파일의 내용을 packages/core/src/에 추가
 * 2. 함수명을 camelCase로 변경
 * 3. packages/core/src/index.ts에 export 추가 (중요!)
 * 4. npm run build:core 실행
 *
 * ⚠️ 주의사항:
 * - React/DOM 의존성 금지 (순수 TypeScript만)
 * - 반드시 return 타입 명시
 * - index.ts에 export 추가 잊지 말 것!
 */

import type { Point, Polygon } from "./types.js";

// === 타입 정의 ===

/** 함수 입력 타입 */
type FunctionNameInput = {
  /** 폴리곤 */
  polygon: Polygon;
  /** 옵션값 */
  optionMm?: number;
};

/** 함수 출력 타입 */
type FunctionNameResult = {
  /** 결과 값 */
  valueMm: number;
  /** 추가 정보 */
  details: {
    count: number;
    items: Point[];
  };
};

// === 메인 함수 ===

/**
 * 함수 설명을 여기에 작성
 *
 * @param input - 입력 데이터
 * @returns 계산 결과
 *
 * @example
 * ```typescript
 * const result = functionName({
 *   polygon: { outer: [...], holes: [] },
 *   optionMm: 100
 * });
 * console.log(result.valueMm);
 * ```
 */
export function functionName(input: FunctionNameInput): FunctionNameResult {
  const { polygon, optionMm = 0 } = input;

  // TODO: 계산 로직 구현
  const points = polygon.outer;
  const valueMm = points.length * optionMm;

  return {
    valueMm,
    details: {
      count: points.length,
      items: points,
    },
  };
}

// === 헬퍼 함수 (필요시) ===

/**
 * 내부 헬퍼 함수 (export하지 않음)
 */
function helperFunction(value: number): number {
  return value * 2;
}

// === 상수 (필요시) ===

/** 기본값 상수 */
const DEFAULT_VALUE_MM = 100;
