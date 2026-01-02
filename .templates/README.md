# 📝 코드 템플릿

새 코드 작성 시 이 템플릿들을 사용하세요. 일관된 코드 스타일과 버그 방지에 도움이 됩니다.

## 템플릿 목록

| 파일            | 용도           | 복사 위치                  |
| --------------- | -------------- | -------------------------- |
| `component.tsx` | React 컴포넌트 | `apps/web/src/components/` |
| `hook.ts`       | 커스텀 훅      | `apps/web/src/hooks/`      |
| `core-util.ts`  | Core 유틸 함수 | `packages/core/src/`       |

## 사용 방법

### 1. 컴포넌트 생성

```bash
# 템플릿 복사
cp .templates/component.tsx apps/web/src/components/MyComponent.tsx

# 수정할 내용:
# - ComponentName → MyComponent (파일 내 모든 곳)
# - Props 타입 정의
# - TODO 주석 구현
```

### 2. 커스텀 훅 생성

```bash
# 템플릿 복사
cp .templates/hook.ts apps/web/src/hooks/useMyHook.ts

# 수정할 내용:
# - useHookName → useMyHook (파일 내 모든 곳)
# - 옵션/반환 타입 정의
# - TODO 주석 구현
```

### 3. Core 유틸 함수 생성

```bash
# 템플릿 복사
cp .templates/core-util.ts packages/core/src/myUtil.ts

# 수정할 내용:
# - functionName → myFunction (파일 내 모든 곳)
# - 입력/출력 타입 정의
# - TODO 주석 구현

# ⚠️ 중요: index.ts에 export 추가!
echo 'export * from "./myUtil.js";' >> packages/core/src/index.ts

# 빌드
npm run build:core
```

## 체크리스트

### 컴포넌트 생성 시

- [ ] 파일명/컴포넌트명 PascalCase
- [ ] Props 타입 명시
- [ ] memo() 적용 (필요시)
- [ ] JSDoc 주석 추가

### 훅 생성 시

- [ ] 파일명 `use` prefix
- [ ] 반환 타입 명시
- [ ] 의존성 배열 정확히 설정
- [ ] JSDoc 주석 추가

### Core 함수 생성 시

- [ ] 파일명 camelCase
- [ ] 반환 타입 명시 (noImplicitReturns!)
- [ ] **index.ts에 export 추가**
- [ ] **npm run build:core 실행**
- [ ] npm run check:exports로 검증

## 주의사항

1. **Core 패키지에서 React/DOM 사용 금지**
   - 순수 TypeScript만 사용
   - 브라우저 API 사용 금지

2. **반드시 return 타입 명시**
   - TypeScript strict 모드에서 return 누락 감지

3. **index.ts export 잊지 말 것**
   - 새 파일 추가 후 export 누락 시 런타임 에러 발생
   - `npm run check:exports`로 검증 가능
