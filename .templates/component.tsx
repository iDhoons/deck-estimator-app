/**
 * 컴포넌트 템플릿
 *
 * 사용법:
 * 1. 이 파일을 복사해서 src/components/에 생성
 * 2. 파일명과 컴포넌트명을 PascalCase로 변경 (예: MyComponent.tsx)
 * 3. TODO 주석을 실제 코드로 교체
 */

import { memo, useState, useCallback } from "react";

// Props 타입 정의 (필수)
type ComponentNameProps = {
  /** prop 설명 */
  value: string;
  /** 콜백 prop 설명 */
  onChange?: (newValue: string) => void;
};

/**
 * 컴포넌트 설명을 여기에 작성
 *
 * @example
 * ```tsx
 * <ComponentName value="example" onChange={handleChange} />
 * ```
 */
export const ComponentName = memo(function ComponentName({ value, onChange }: ComponentNameProps) {
  // === State ===
  const [localState, setLocalState] = useState<string>("");

  // === Callbacks ===
  const handleClick = useCallback(() => {
    // TODO: 클릭 핸들러 구현
    onChange?.(localState);
  }, [localState, onChange]);

  // === Render ===
  return (
    <div
      style={{
        // TODO: 스타일 정의
        padding: 12,
        borderRadius: 8,
      }}
    >
      <span>{value}</span>
      <button onClick={handleClick}>Click</button>
    </div>
  );
});

// 필요한 경우 서브컴포넌트 export
// export const ComponentNameItem = memo(function ComponentNameItem(...) { ... });
