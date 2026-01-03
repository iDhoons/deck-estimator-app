# 측면도(Side View) 시각화 구현 계획

## 개요

데크의 특정 변(edge)을 클릭하면 해당 변의 측면도를 팝업/드로어로 보여주는 기능 구현

## 현재 상태 분석

### 이미 있는 것
- `fasciaEdgeIndices`: 측면 마감재 적용할 변 선택 (types.ts:212)
- `deckHeightMm`: 데크 높이 (types.ts:206) - 현재 UI 미연결
- `ResultsPanel`: 드로어 패턴 (하단 슬라이드 업)
- `activeTool === "wall"`: 변 클릭 모드 예시 (DeckCanvas.tsx:1031)
- `structureLayout.piles`: 기둥 위치 데이터

### 없는 것
- 측면도 시각화 컴포넌트
- 변 클릭 → 측면도 표시 로직
- `deckHeightMm` 입력 UI
- Fascia 보드 규격/수량 계산

---

## 구현 단계

### Phase 1: 기본 인프라 (우선)

#### 1.1 데크 높이 입력 UI 추가
**위치**: `ControlsPanel.tsx`

```typescript
// 하부구조 섹션에 추가
deckHeightMm: number  // 지면 ~ 데크 상판 높이
```

**UI**: 숫자 입력 필드 (기본값: 400mm)

#### 1.2 측면도 표시 트리거
**위치**: `DeckCanvas.tsx`

새로운 activeTool 추가: `"sideView"`
- 변 클릭 시 해당 변의 index를 저장
- 측면도 팝업 열기

```typescript
// 상태 추가
const [sideViewEdgeIndex, setSideViewEdgeIndex] = useState<number | null>(null);
```

#### 1.3 SideViewPanel 컴포넌트 생성
**위치**: `apps/web/src/components/SideViewPanel.tsx`

ResultsPanel과 유사한 드로어 형태

---

### Phase 2: 측면도 SVG 렌더링

#### 2.1 측면도 데이터 계산
**필요 정보**:
```typescript
type SideViewData = {
  edgeIndex: number;
  edgeLengthMm: number;      // 변 길이
  deckHeightMm: number;       // 데크 높이

  // 층별 높이 (위에서 아래로)
  boardThicknessMm: number;   // 상판 두께 (20~25mm)
  joistHeightMm: number;      // 장선 높이 (50mm)
  bearerHeightMm: number;     // 멍에 높이 (100mm)
  postHeightMm: number;       // 기둥 높이 (나머지)

  // 해당 변의 기둥 위치들
  postPositions: number[];    // 변 시작점 기준 mm 오프셋

  // Fascia 적용 여부
  hasFascia: boolean;
  fasciaHeightMm?: number;    // Fascia 높이 (장선 + 상판?)
};
```

#### 2.2 측면도 SVG 렌더링
```
측면도 구조 (정면에서 본 모습):

┌─────────────────────────────────┐ ← 상판 (boardThicknessMm)
│ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ │   (보드 단면 패턴)
├─────────────────────────────────┤
│▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← Fascia (선택 시)
├─────────────────────────────────┤
│═════════════════════════════════│ ← Rim Bearer/Joist
├───┬─────────┬─────────┬─────────┤
│   │         │         │         │
│   │         │         │         │ ← 기둥 (postHeightMm)
│   │         │         │         │
└───┴─────────┴─────────┴─────────┘
    ▲         ▲         ▲
   기초      기초      기초

← ─────── edgeLengthMm ─────── →
```

#### 2.3 SVG 컴포넌트 구현
**위치**: `apps/web/src/components/deck-canvas/DeckSideView.tsx`

```typescript
export function DeckSideView({
  data,
  width,   // SVG 뷰박스 너비
  height,  // SVG 뷰박스 높이
}: {
  data: SideViewData;
  width?: number;
  height?: number;
}) {
  // 스케일 계산: 변 길이 → SVG 너비
  const scale = (width ?? 600) / data.edgeLengthMm;

  return (
    <svg viewBox={...}>
      {/* 상판 보드 단면 */}
      {/* Fascia (선택 시) */}
      {/* Rim Bearer */}
      {/* 기둥들 */}
      {/* 기초 */}
      {/* 치수선 */}
    </svg>
  );
}
```

---

### Phase 3: 상호작용 & 편집

#### 3.1 Fascia 토글
측면도에서 직접 Fascia ON/OFF 가능

#### 3.2 치수 표시
- 변 길이
- 데크 높이
- 기둥 간격
- Fascia 높이

#### 3.3 변 선택 하이라이트
DeckCanvas에서 현재 보고 있는 변을 다른 색으로 표시

---

### Phase 4: Fascia 수량 계산

#### 4.1 타입 확장
**위치**: `packages/core/src/types.ts`

```typescript
// Plan에 추가
fasciaConfig?: {
  boardWidthMm: number;      // Fascia 보드 폭 (예: 150mm)
  boardThicknessMm: number;  // 두께
  stockLengthMm: number;     // 원자재 길이
};

// Quantities에 추가
fascia?: {
  edges: { index: number; lengthMm: number }[];
  totalLengthM: number;
  heightMm: number;          // Fascia 높이
  areaM2: number;            // 총 면적
  boardPieces?: number;      // 보드 수량
  stockPieces?: number;      // 원자재 수량
};
```

#### 4.2 계산 로직
**위치**: `packages/core/src/calculateQuantities.ts`

```typescript
// fasciaEdgeIndices 기반 계산
const fasciaLenMm = fasciaEdgeIndices.reduce((sum, i) => {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  return sum + Math.hypot(b.xMm - a.xMm, b.yMm - a.yMm);
}, 0);

const fasciaHeightMm = joistHeightMm + boardThicknessMm; // 또는 별도 설정
const fasciaAreaMm2 = fasciaLenMm * fasciaHeightMm;
```

---

## 파일 구조

```
apps/web/src/
├── components/
│   ├── SideViewPanel.tsx          # 새로 생성 - 드로어 컨테이너
│   └── deck-canvas/
│       └── DeckSideView.tsx       # 새로 생성 - SVG 렌더링
├── utils/
│   └── sideViewData.ts            # 새로 생성 - 데이터 계산
└── types.ts                       # 수정 - SideViewData 타입

packages/core/src/
├── types.ts                       # 수정 - fasciaConfig, fascia 결과
└── calculateQuantities.ts         # 수정 - fascia 계산 추가
```

---

## UI 흐름

```
1. ControlsPanel에서 "데크 높이" 입력
   ↓
2. DeckCanvas 도구에서 "측면 보기" 선택
   ↓
3. 원하는 변 클릭
   ↓
4. SideViewPanel 드로어 열림 (하단에서 슬라이드 업)
   ↓
5. 해당 변의 측면도 SVG 표시
   - 상판, Fascia, 멍에, 기둥, 기초 시각화
   - Fascia ON/OFF 토글 가능
   - 치수 표시
   ↓
6. 다른 변 클릭 → 해당 변으로 전환
7. 배경 클릭 or ESC → 드로어 닫기
```

---

## 우선순위

| 순서 | 작업 | 예상 난이도 |
|------|------|------------|
| 1 | 데크 높이 입력 UI (ControlsPanel) | 낮음 |
| 2 | SideViewPanel 드로어 기본 틀 | 낮음 |
| 3 | 변 클릭 → 측면도 트리거 연결 | 중간 |
| 4 | DeckSideView SVG 기본 렌더링 | 중간 |
| 5 | 기둥 위치 계산 및 표시 | 중간 |
| 6 | Fascia 토글 연동 | 낮음 |
| 7 | 치수선 표시 | 낮음 |
| 8 | Fascia 수량 계산 (core) | 중간 |

---

## 질문/결정 필요

1. **Fascia 높이**:
   - 옵션 A: 상판 + 장선 높이 (약 70~80mm)
   - 옵션 B: 사용자 입력
   - 옵션 C: 상판 ~ 멍에 하단까지 전체

2. **측면도 트리거**:
   - 옵션 A: 새 도구 버튼 추가 ("측면 보기")
   - 옵션 B: 변 우클릭 메뉴
   - 옵션 C: 변 더블클릭

3. **드로어 위치**:
   - 옵션 A: 하단 (ResultsPanel처럼)
   - 옵션 B: 우측 사이드
   - 옵션 C: 모달 팝업
