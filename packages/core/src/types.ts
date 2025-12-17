export type Mode = "consumer" | "pro";
export type FasteningMode = "clip" | "screw";

export type Point = { xMm: number; yMm: number };

export type Polygon = {
  outer: Point[];
  holes?: Point[][];
};

export type Plan = {
  unit: "mm";
  polygon: Polygon;

  /** ✅ 사용자가 선택한 보드 폭 */
  boardWidthMm: number;

  /** ✅ 사용자가 선택한 시공 방향(0=가로, 90=세로 같은 UX 가능) */
  deckingDirectionDeg: number;

  stairs?: {
    enabled: boolean;

    /** 계단 평면 면적을 “총면적에 포함”시키기 위한 옵션(Consumer v1용) */
    footprintPolygon?: Polygon;

    /** 옵션 표기용 */
    widthMm?: number;
    totalRiseMm?: number;
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
