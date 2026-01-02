/**
 * 커스텀 훅 템플릿
 *
 * 사용법:
 * 1. 이 파일을 복사해서 src/hooks/에 생성
 * 2. 파일명을 camelCase로 변경 (예: useMyHook.ts)
 * 3. TODO 주석을 실제 코드로 교체
 */

import { useState, useCallback, useMemo } from "react";

// 훅 옵션 타입 (선택사항)
type UseHookNameOptions = {
  /** 초기값 */
  initialValue?: string;
  /** 콜백 */
  onChange?: (value: string) => void;
};

// 훅 반환 타입 (명시적으로 정의 권장)
type UseHookNameReturn = {
  /** 현재 값 */
  value: string;
  /** 값 설정 함수 */
  setValue: (newValue: string) => void;
  /** 값 리셋 함수 */
  reset: () => void;
  /** 계산된 값 */
  computedValue: string;
};

/**
 * 훅 설명을 여기에 작성
 *
 * @param options - 훅 옵션
 * @returns 훅 반환값
 *
 * @example
 * ```tsx
 * const { value, setValue, reset } = useHookName({ initialValue: "hello" });
 * ```
 */
export function useHookName(options: UseHookNameOptions = {}): UseHookNameReturn {
  const { initialValue = "", onChange } = options;

  // === State ===
  const [value, setValueInternal] = useState<string>(initialValue);

  // === Callbacks ===
  const setValue = useCallback(
    (newValue: string) => {
      setValueInternal(newValue);
      onChange?.(newValue);
    },
    [onChange],
  );

  const reset = useCallback(() => {
    setValueInternal(initialValue);
    onChange?.(initialValue);
  }, [initialValue, onChange]);

  // === Computed Values ===
  const computedValue = useMemo(() => {
    // TODO: 계산 로직 구현
    return value.toUpperCase();
  }, [value]);

  // === Return ===
  return {
    value,
    setValue,
    reset,
    computedValue,
  };
}
