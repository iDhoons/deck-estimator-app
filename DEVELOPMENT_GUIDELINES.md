# 🔧 데크 견적기 개발 지침서

## 목차

1. [프로젝트 구조](#프로젝트-구조)
2. [빌드 순서](#빌드-순서)
3. [자주 발생하는 버그 패턴](#자주-발생하는-버그-패턴)
4. [리팩토링 체크리스트](#리팩토링-체크리스트)
5. [디버깅 가이드](#디버깅-가이드)
6. [코드 컨벤션](#코드-컨벤션)

---

## 프로젝트 구조

```
deck-estimator-app/
├── apps/
│   └── web/              # React 프론트엔드 (Vite)
│       └── src/
│           ├── components/   # UI 컴포넌트
│           ├── hooks/        # React 커스텀 훅
│           ├── geometry/     # 클라이언트 지오메트리 유틸
│           ├── constants/    # 기본값, 프리셋
│           └── i18n/         # 다국어 지원
├── packages/
│   └── core/             # 순수 TypeScript 로직 (@deck/core)
│       └── src/
│           ├── calculateQuantities.ts  # 수량 계산
│           ├── calculateStairs.ts      # 계단 계산
│           ├── cutPlan.ts              # 재단 계획
│           ├── geometry.ts             # 기하학 유틸
│           ├── types.ts                # 타입 정의
│           └── index.ts                # 📌 모든 export 관리
├── products.json         # 제품 데이터
├── ruleset.consumer.json # 일반 모드 규칙
└── ruleset.pro.json      # 전문가 모드 규칙
```

---

## 빌드 순서

### ⚠️ 중요: 반드시 순서 지키기!

```bash
# 1. 먼저 core 패키지 빌드 (필수!)
cd packages/core
npm run build

# 2. 그 다음 web 앱 실행
cd apps/web
npm run dev
```

### 왜 중요한가?

- `apps/web`은 `@deck/core`를 import합니다
- core 패키지가 빌드되지 않으면 **빈 화면**이 표시됩니다
- 브라우저 콘솔에 `does not provide an export named 'XXX'` 에러가 나타납니다

### 빌드 확인 방법

```bash
# dist 폴더에 파일이 있는지 확인
ls packages/core/dist/
```

예상 출력:

```
calculateQuantities.d.ts    geometry.d.ts
calculateQuantities.js      geometry.js
cutPlan.d.ts                index.d.ts
cutPlan.js                  index.js
types.d.ts                  types.js
```

---

## 자주 발생하는 버그 패턴

### 1. 🔴 함수 return 누락

**증상**: 함수가 `undefined`를 반환, 타입 오류 없이 런타임 에러 발생

```typescript
// ❌ 잘못된 예
export function buildCirclePoints(...) {
    const pts = [];
    // ... 로직 ...
    // return 누락!
}

// ✅ 올바른 예
export function buildCirclePoints(...) {
    const pts = [];
    // ... 로직 ...
    return pts;  // 반드시 반환!
}
```

**예방법**:

- 함수 작성 시 return 타입을 명시: `function foo(): ReturnType { ... }`
- 타입이 명시되면 TypeScript가 return 누락 시 경고

### 2. 🔴 Import 누락

**증상**: `ReferenceError: XXX is not defined` 또는 빌드 오류

```typescript
// ❌ 잘못된 예 - 함수 사용하지만 import 안 함
const segments = circleSegmentsForSagitta(radius, sagitta);

// ✅ 올바른 예
import { circleSegmentsForSagitta, buildCirclePoints } from "../geometry/shapes";
```

**예방법**:

- 새 함수 사용 시 import 문 먼저 추가
- IDE 자동 import 기능 활용
- `npm run lint` 실행하여 미사용/누락 import 확인

### 3. 🔴 패키지 Export 누락 (모노레포)

**증상**: 브라우저 콘솔에 `does not provide an export named 'XXX'`

```typescript
// packages/core/src/index.ts

// ❌ 잘못된 예 - geometry.js export 누락
export * from "./calculateQuantities.js";
export * from "./types.js";
// geometry.js가 빠짐!

// ✅ 올바른 예
export * from "./calculateQuantities.js";
export * from "./types.js";
export * from "./geometry.js"; // 추가!
```

**예방법**:

- 새 파일 생성 시 `index.ts`에 export 추가
- core 패키지 수정 후 반드시 `npm run build`
- Vite 캐시 삭제: `rm -rf apps/web/node_modules/.vite`

### 4. 🔴 Vite 캐시 문제

**증상**: 코드 수정했는데 브라우저에 반영 안 됨

**해결책**:

```bash
# 1. Vite 캐시 삭제
rm -rf apps/web/node_modules/.vite

# 2. 개발 서버 재시작
pkill -f vite
cd apps/web && npm run dev
```

---

## 리팩토링 체크리스트

코드 리팩토링 전/후에 반드시 확인하세요:

### 📋 파일 이동/이름 변경 시

- [ ] 모든 import 경로 업데이트
- [ ] index.ts export 업데이트 (core 패키지)
- [ ] 상대 경로 → 절대 경로 일관성 유지

### 📋 함수 추가/수정 시

- [ ] return 타입 명시
- [ ] return 문 존재 확인
- [ ] 필요한 곳에서 import 되어 있는지 확인
- [ ] export 되어야 하면 index.ts에 추가

### 📋 Core 패키지 수정 시

- [ ] `npm run build` 실행
- [ ] dist 폴더 파일 생성 확인
- [ ] Vite 캐시 삭제 (`rm -rf apps/web/node_modules/.vite`)
- [ ] 개발 서버 재시작

### 📋 최종 검증

- [ ] `npm run lint` 오류 없음
- [ ] 브라우저 콘솔 에러 없음
- [ ] 게이트 화면 정상 표시
- [ ] 일반/전문가 모드 진입 가능
- [ ] 주요 기능 동작 확인

---

## 디버깅 가이드

### 빈 화면이 나올 때

1. **브라우저 콘솔 확인** (F12 → Console)

   ```
   does not provide an export named 'XXX'
   → core 패키지 빌드 필요 또는 export 누락

   ReferenceError: XXX is not defined
   → import 누락

   Cannot read properties of undefined
   → return 누락 또는 데이터 미초기화
   ```

2. **React 마운트 확인**

   ```javascript
   // 브라우저 콘솔에서 실행
   document.getElementById("root").innerHTML;
   // 빈 문자열이면 React가 마운트 안 됨
   ```

3. **체계적 디버깅 순서**
   ```
   1. 콘솔 에러 확인
   2. core 패키지 빌드 상태 확인
   3. Vite 캐시 삭제 후 재시작
   4. import/export 확인
   ```

### 개발 서버 시작 안 될 때

```bash
# 포트 충돌 확인
lsof -i :5173

# 기존 프로세스 종료
pkill -f vite

# 의존성 재설치
npm install

# 서버 재시작
npm run dev
```

---

## 코드 컨벤션

### TypeScript

```typescript
// 함수 return 타입 명시 (권장)
export function calculateArea(points: Point[]): number {
  // ...
  return area;
}

// 타입 가드 사용
if (data && Array.isArray(data.holes)) {
  // 안전하게 접근
}
```

### Import 순서

```typescript
// 1. 외부 라이브러리
import React from "react";

// 2. @deck/core 패키지
import { calculateQuantities, Plan } from "@deck/core";

// 3. 로컬 컴포넌트/유틸
import { DeckCanvas } from "./components/DeckCanvas";
import { INITIAL_PLAN } from "./constants/defaults";

// 4. 타입 (type-only)
import type { Mode, Point } from "@deck/core";
```

### 파일 구조

```
컴포넌트 파일: PascalCase (DeckCanvas.tsx)
유틸 파일: camelCase (geometry.ts)
타입 파일: types.ts 또는 컴포넌트와 함께
상수 파일: defaults.ts, constants.ts
```

---

## 빠른 참조

### 명령어 모음

```bash
# 전체 빌드
cd packages/core && npm run build && cd ../../apps/web && npm run dev

# 린트 검사
npm run lint

# 캐시 완전 초기화
rm -rf apps/web/node_modules/.vite
rm -rf packages/core/dist

# 전체 재빌드
cd packages/core && npm run build
cd ../../apps/web && npm run dev
```

### 문제 해결 플로우

```
빈 화면 → 콘솔 확인 → export 에러? → core 빌드
                    → import 에러? → import 추가
                    → undefined? → return 확인
```

---

## PR/리팩토링 운영 가이드 (재발 방지)

### 권장 개발 흐름

- **작게 나눠서 변경**: 한 PR에 한 가지 목적(버그 수정/리팩토링/기능 추가)
- **영향 범위가 큰 변경은 2단계로**:
  - 1. 타입/인터페이스 변경 PR
  - 2. 호출부/동작 변경 PR

### 커밋/PR 전에 반드시 통과해야 하는 체크(자동 알람)

- **pre-commit 훅**(로컬):
  - export 누락 검증
  - 타입체크
  - 스냅샷 테스트
- **CI(GitHub Actions)**(원격):
  - `npm run check:exports`
  - `npm run typecheck`
  - `npm test` (스냅샷 포함)
  - `npm run build`

### 스냅샷 변경 원칙

- 스냅샷이 바뀌면 **“의도된 결과 변화인지”** 먼저 판단합니다.
- 의도된 변화라면 PR에 아래를 반드시 기록합니다:
  - **무엇이** 왜 바뀌었는지
  - 사용자/견적 결과에 미치는 영향
  - (가능하면) 변경 전/후 수치 비교

### 브랜치 보호(권장 설정)

> GitHub 웹 설정에서 적용합니다. (레포 설정 → Branch protection rules)

- PR 없이 `main`(또는 기본 브랜치) 직접 push 금지
- CI 체크 통과 후에만 merge 허용
- 최소 1명 리뷰 승인 필요(가능하면 Code Owners 포함)

---

## 변경 이력

| 날짜       | 버전 | 변경 내용      |
| ---------- | ---- | -------------- |
| 2026-01-02 | 1.0  | 초기 버전 작성 |

---

> 💡 **팁**: 이 문서는 새로운 버그 패턴이 발견될 때마다 업데이트하세요!
