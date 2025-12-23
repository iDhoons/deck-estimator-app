export type Mode = "consumer" | "pro";
export type FasteningMode = "clip" | "screw";

export type Point = { xMm: number; yMm: number };

export type Polygon = {
  outer: Point[];
  holes?: Point[][];
};

export type LineSegment = { x1: number; y1: number; x2: number; y2: number };

export type Plan = {
  unit: "mm";
  polygon: Polygon;

  /** ✅ 사용자가 선택한 보드 폭 */
  boardWidthMm: number;

  /** ✅ 사용자가 선택한 시공 방향(0=가로, 90=세로 같은 UX 가능) */
  deckingDirectionDeg: number;

  /** 데크 상단 마감 높이(지면 기준). 기둥(Post) 길이 산출에 사용 */
  deckHeightMm?: number;

  /** 벽체 고정(ledger) 여부. MVP: true면 최상단(최소 y) 변을 벽체로 가정 */
  attachedToWall?: boolean;

  stairs?: {
    enabled: boolean;

    /** 계단 평면 면적을 “총면적에 포함”시키기 위한 옵션(Consumer v1용) */
    footprintPolygon?: Polygon;

    /** 옵션 표기용 */
    widthMm?: number;
    totalRiseMm?: number;
    /** 옆면/챌판 마감(막힘형). false면 오픈형으로 간주 */
    closedRisers?: boolean;

    /** 계단 최하단 랜딩 */
    landingType?: "pad" | "post";

    /** (legacy) */
    sideCladding?: boolean;
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

  /** 계단 자재 내역(하부구조 포함) */
  stairs?: {
    enabled: boolean;
    stepCount: number;
    unitRiseMm: number;
    unitRunMm: number;
    widthMm: number;
    stringers: {
      qty: number;
      lengthMm: number;
      stockLengthMm: number;
      pieces: number;
    };
    treads: {
      boardsPerStep: number;
      usedLengthMm: number;
      pieces: number;
    };
    risers?: {
      boardsPerStep: number;
      usedLengthMm: number;
      pieces: number;
    };
    landing?: {
      type: "pad" | "post";
      padsQty?: number;
      pilesQty?: number;
    };
    fasteners?: {
      mode: FasteningMode;
      screws?: number;
      clips?: number;
    };
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
