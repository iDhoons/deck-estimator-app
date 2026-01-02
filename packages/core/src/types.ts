export type Mode = "consumer" | "pro";
export type FasteningMode = "clip" | "screw";

export type Point = { xMm: number; yMm: number };

// ============================================================
// 하부구조(Substructure) 관련 타입
// ============================================================

/**
 * 아연도각관 규격
 * - 일반적인 규격: 50×50, 50×30, 100×100, 100×50
 * - 두께: 1.6T, 2.0T, 2.3T
 */
export type SteelPipeSpec = {
  /** 규격 ID (예: "50x50x1.6T") */
  id: string;
  /** 표시명 */
  name: string;
  /** 폭 (mm) */
  widthMm: number;
  /** 높이 (mm) */
  heightMm: number;
  /** 두께 (mm) */
  thicknessMm: number;
  /** 원자재 길이 (mm) - 일반적으로 3000, 4000, 6000 */
  stockLengthMm: number;
};

/**
 * 기초 타입
 */
export type FoundationType =
  | "concrete_block" // 기초석 (콘크리트 블록) 200×200×200
  | "anchor_bolt" // 앙카볼트 (콘크리트 바닥용) M12
  | "rubber_pad" // 고무패드 (방수층용) 200×200×6T
  | "screw_pile"; // 스크류파일 (연약지반용)

/**
 * 길이별 수량 내역
 */
export type LengthBreakdown = {
  /** 길이 (mm) - 100mm 단위로 반올림 */
  lengthMm: number;
  /** 해당 길이의 수량 */
  qty: number;
};

/**
 * 멍에(Bearer) 상세 정보
 */
export type BearerDetail = {
  /** 아연도각관 규격 */
  spec: SteelPipeSpec;
  /** 총 길이 (m) */
  totalLengthM: number;
  /** 총 개수 */
  pieces: number;
  /** 내부 멍에 개수 */
  innerPieces?: number;
  /** 외곽 멍에(Rim Bearer) 개수 */
  rimPieces?: number;
  /** 길이별 내역 (선택) */
  breakdown?: LengthBreakdown[];
  /** 필요 원자재 수량 (커팅 로스 포함) */
  stockPieces?: number;
};

/**
 * 장선(Joist) 상세 정보
 */
export type JoistDetail = {
  /** 아연도각관 규격 */
  spec: SteelPipeSpec;
  /** 총 길이 (m) */
  totalLengthM: number;
  /** 총 개수 (내부 장선 + 외곽 Rim Joist) */
  pieces: number;
  /** 내부 장선 개수 */
  innerPieces?: number;
  /** 외곽 장선(Rim Joist) 개수 */
  rimPieces?: number;
  /** 길이별 내역 (선택) */
  breakdown?: LengthBreakdown[];
  /** 필요 원자재 수량 (커팅 로스 포함) */
  stockPieces?: number;
};

/**
 * 기초 상세 정보
 */
export type FoundationDetail = {
  /** 기초 타입 */
  type: FoundationType;
  /** 규격 설명 (예: "200×200×200mm") */
  specDescription?: string;
  /** 총 수량 */
  qty: number;
};

/**
 * 포스트(기둥) 상세 정보
 */
export type PostDetail = {
  /** 아연도각관 규격 */
  spec: SteelPipeSpec;
  /** 총 수량 */
  qty: number;
  /** 개별 길이 (mm) */
  eachLengthMm: number;
  /** 총 길이 (m) */
  totalLengthM: number;
  /** 필요 원자재 수량 */
  stockPieces?: number;
};

/**
 * 하부구조 부속자재 (철물)
 */
export type SubstructureHardware = {
  /** 앙카볼트 (기초 고정용) */
  anchorBolts?: {
    spec: string; // 예: "M12×100"
    qty: number;
  };
  /** 앵글 브라켓 (멍에-장선 연결용) */
  angleBrackets?: {
    spec: string; // 예: "50×50×5T"
    qty: number;
  };
  /** 베이스 플레이트 (포스트 하단 고정용) */
  basePlates?: {
    spec: string; // 예: "100×100×3T"
    qty: number;
  };
  /** 포스트 캡 (포스트-멍에 연결용) */
  postCaps?: {
    spec: string;
    qty: number;
  };
  /** 장선 행거 (장선-멍에 연결용) */
  joistHangers?: {
    spec: string;
    qty: number;
  };
  /** 셀프 드릴링 스크류 (각관 연결용) */
  selfDrillingScrew?: {
    spec: string; // 예: "M5×19"
    qty: number;
  };
};

/**
 * 하부구조 상세 정보 (확장)
 */
export type SubstructureDetail = {
  /** 멍에(Bearer) 상세 */
  bearer: BearerDetail;
  /** 장선(Joist) 상세 */
  joist: JoistDetail;
  /** 기초 상세 */
  foundation: FoundationDetail;
  /** 포스트 상세 (높이가 있을 때만) */
  post?: PostDetail;
  /** 부속자재(철물) */
  hardware?: SubstructureHardware;
};

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
  stockLengthMm: number; // ✅ 제품마다 1개 고정
  widthOptionsMm: number[];
  thicknessMm: number;
  gapMm: number; // ✅ consumer/pro 모두 5 고정
  fasteningModes: FasteningMode[];
};

export type ConsumerLossRule = {
  base: number;
  vertexFactor: number;
  cutoutFactor: number;
  cap: number;
};

/**
 * 하부구조 설정 (Ruleset에서 사용)
 */
export type SubstructureConfig = {
  /** 멍에(Bearer) 규격 */
  bearerSpec: Omit<SteelPipeSpec, "id" | "name">;
  /** 장선(Joist) 규격 */
  joistSpec: Omit<SteelPipeSpec, "id" | "name">;
  /** 포스트(기둥) 규격 */
  postSpec?: Omit<SteelPipeSpec, "id" | "name">;
  /** 기초 타입 */
  foundationType: FoundationType;
  /** 아연도각관 원자재 길이 (mm) */
  stockLengthMm: number;
  /** 커팅 로스율 (기본 0.05 = 5%) */
  lossRate?: number;

  /** 멍에(Bearer) 최대 간격 (mm) - 기본 600 */
  bearerSpacingMm?: number;

  /** 장선(Joist) 간격 (mm) - 기본 400 (수동 모드 또는 자동 계산 fallback) */
  joistSpacingMm?: number;

  /** 장선 간격 모드: 'auto' (데크 두께 기준) | 'manual' (고정값) - 기본 'auto' */
  joistSpacingMode?: "auto" | "manual";

  /** 기초(Footing) 간격 (mm) - 기본 1000 */
  footingSpacingMm?: number;
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

  /** 하부구조 설정 (선택) */
  substructure?: SubstructureConfig;
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

  /** 하부구조 요약 (기존 호환성 유지) */
  substructure: { primaryLenM: number; secondaryLenM: number };

  /**
   * 하부구조 상세 정보 (v2 확장)
   * - 멍에/장선/기초/포스트 개수 및 규격
   * - 부속자재(철물) 수량
   */
  substructureDetail?: SubstructureDetail;

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

  /** 기둥(Post) 산출 - @deprecated substructureDetail.post 사용 권장 */
  posts?: {
    qty: number;
    eachLengthMm: number;
    totalLengthM: number;
  };

  /** 구조 철물(추정치) - @deprecated substructureDetail.hardware 사용 권장 */
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

export type CutPlanStats = {
  /** 총 소요 원자재 수량 (장) */
  totalStockPieces: number;
  /** 총 투입 원자재 길이 (mm) */
  totalStockLengthMm: number;
  /** 실제 데크에 사용된 총 길이 (mm) */
  totalUsedLengthMm: number;
  /** 버려지는 자투리 총 길이 (mm) */
  wasteLengthMm: number;
  /** 계산된 로스율 (0.0 ~ 1.0) */
  lossRate: number;
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
  stats: CutPlanStats;
};
