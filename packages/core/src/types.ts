export type Mode = "consumer" | "pro";
export type FasteningMode = "clip" | "screw";

export type Point = { xMm: number; yMm: number };

export type Polygon = {
  outer: Point[];
  holes?: Point[][];
};

export type LineSegment = { x1: number; y1: number; x2: number; y2: number };

export type StairConfig = {
  id: string;
  sideIndex: number;
  startMm: number;
  widthMm: number;
  stepCount: number;
  stepDepthMm: number;
  stepHeightMm: number;
  closedRisers?: boolean;

  /** 기초 설정 (수동 입력) */
  foundation?: {
    /** 패드 수량 */
    padsQty?: number;
    /** 파일 수량 */
    pilesQty?: number;
  };
};

export type Plan = {
  unit: "mm";
  polygon: Polygon;

  /** ✅ 사용자가 선택한 보드 폭 */
  boardWidthMm: number;

  /** ✅ 사용자가 선택한 시공 방향(0=가로, 90=세로 같은 UX 가능) */
  deckingDirectionDeg: number;

  /** 데크 상단 마감 높이(지면 기준). 기둥(Post) 길이 산출에 사용 */
  deckHeightMm?: number;

  /** 벽체(ledger)로 선택된 외곽 변의 startIndex 목록 (복수 선택 가능) */
  attachedEdgeIndices?: number[];

  /** Fascia(클래딩)로 선택된 외곽 변의 startIndex 목록 (복수 선택 가능) */
  fasciaEdgeIndices?: number[];

  /** 하부구조 길이 수동 오버라이드 (기본값=자동 계산) */
  substructureOverrides?: {
    /** 멍에(Bearer) 총 길이 */
    primaryLenMm?: number;
    /** 장선(Joist) 총 길이 */
    secondaryLenMm?: number;
  };

  /** (legacy) 벽체 고정 여부. true면 기본 벽 변을 추정해서 처리(이후 제거 예정) */
  attachedToWall?: boolean;

  stairs?: {
    enabled: boolean;
    items: StairConfig[];

    /** 측판(스트링거) 자재 오버라이드: 미기재 시 메인데크 제품과 동일한 값 사용 */
    stringerMaterialOverrides?: {
      thicknessMm?: number;
      widthMm?: number;
      stockLengthMm?: number;
    };
  };
};

export type Product = {
  id: string;
  name: string;
  stockLengthMm: number;         // ✅ 제품마다 1개 고정
  widthOptionsMm: number[];
  thicknessMm: number;
  gapMm: number;                 // ✅ consumer/pro 모두 5 고정
  fasteningModes: FasteningMode[];
};

export type ConsumerLossRule = {
  base: number;
  vertexFactor: number;
  cutoutFactor: number;
  cap: number;
};

export type Ruleset = {
  mode: Mode;
  gapMm: number;
  primarySpacingMm: number;
  secondarySpacingMm: number;
  anchorSpacingMm: number;
  footingSpacingMm: number;
  screwPerIntersection: number;
  consumerLoss?: ConsumerLossRule;
  kerfMm?: number; // pro only (optional)
  showAdvancedOverrides: boolean;
  enableCutPlan: boolean;
};

export type StructureLayout = {
  piles: Point[];
  bearers: LineSegment[];
  joists: LineSegment[];
};

export type Quantities = {
  area: { totalM2: number; deckM2: number; stairsM2: number };

  boards: {
    pieces: number;
    usedLengthMm: number;
    stockLengthMm: number;
    lossRateApplied?: number;
  };

  substructure: { primaryLenM: number; secondaryLenM: number };

  /** 💭 v1: 단순 그리드(멍에×장선 교차점)로 추정 */
  anchors: { qty: number };

  /** 💭 v1: 단순 그리드(멍에×장선 교차점)로 추정 */
  footings: { qty: number };

  fasteners: { mode: FasteningMode; clips?: number; screws?: number };

  /** 벽체 고정(ledger) 산출 */
  ledger?: {
    lengthM: number;
    anchorBoltsQty: number;
  };

  /** 기둥(Post) 산출 */
  posts?: {
    qty: number;
    eachLengthMm: number;
    totalLengthM: number;
  };

  /** 구조 철물(추정치) */
  hardware?: {
    joistHangersQty?: number;
    stringerHangersQty?: number;
    postAnchorsQty?: number;
  };

  /** 계단 자재 내역 (상판 + 높이판 면적 계산) */
  stairs?: {
    enabled: boolean;

    items: {
      id: string;
      stepCount: number;
      unitRiseMm: number;
      unitRunMm: number;
      widthMm: number;
    }[];

    /** 디딤판(상판) 총 면적 (㎡) */
    treadAreaM2: number;
    /** 높이판(라이저) 총 면적 (㎡) */
    riserAreaM2: number;
    /** 계단 총 면적 (상판 + 높이판) (㎡) */
    totalAreaM2: number;
  };

  structureLayout?: StructureLayout;
};

export type CutPiece = {
  id: string;
  source: "stock" | "offcut";
  colorGroup: string; // 같은 원자재(또는 계열) 묶음 → 색상 키
  lengthMm: number;
};

export type CutRow = {
  rowIndex: number;
  requiredLenMm: number;
  pieces: CutPiece[];
  offcutMm: number;
};

export type CutPlan = {
  stockLengthMm: number;
  totalRows: number;
  rows: CutRow[];
  offcutsPoolMm: number[];
};
