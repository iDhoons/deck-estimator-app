type ControlButton = {
  key: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean; // 토글 버튼용 (추가/삭제/벽체/컷아웃 등)
  activeColor?: string; // active 상태의 테두리/텍스트 색상
  activeBg?: string; // active 상태의 배경색
};

/**
 * Canvas controls styling configuration
 * 모든 캔버스의 버튼 위치와 스타일을 한 곳에서 관리
 */
/**
 * 공통 컨테이너 스타일
 */
const CONTAINER_BASE = {
  padding: "8px 10px",
  background: "rgba(255,255,255,0.92)",
  borderRadius: 10,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  gap: 8,
} as const;

/**
 * 공통 버튼 스타일
 */
const BUTTON_BASE = {
  minWidth: 72,
  height: 28,
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
  color: "#333",
  fontSize: 12,
  fontWeight: 400,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)",
} as const;

export const CANVAS_CONTROLS_STYLE = {
  container: CONTAINER_BASE,
  button: BUTTON_BASE,
  // 위치별 position 설정
  positions: {
    centerBottom: {
      left: "50%",
      bottom: 16,
      transform: "translateX(-50%)",
    },
    topLeft: {
      left: 16,
      top: 16,
    },
    bottomLeft: {
      left: 16,
      bottom: 16,
    },
    bottomRight: {
      right: 16,
      bottom: 16,
    },
  },
} as const;

/**
 * 공통 버튼 렌더링 함수
 */
function renderButton(control: ControlButton) {
  const { button } = CANVAS_CONTROLS_STYLE;

  // active 상태 스타일 계산
  const isActive = control.active;
  const activeColor = control.activeColor || "#2463ff";
  const activeBg = control.activeBg || "#e6f0ff";

  return (
    <button
      key={control.key}
      type="button"
      onClick={control.onClick}
      disabled={control.disabled}
      style={{
        minWidth: button.minWidth,
        height: button.height,
        padding: button.padding,
        borderRadius: button.borderRadius,
        border: isActive ? `2px solid ${activeColor}` : button.border,
        background: control.disabled ? "#f5f5f5" : isActive ? activeBg : button.background,
        color: isActive ? activeColor : button.color,
        fontSize: button.fontSize,
        fontWeight: isActive ? 600 : button.fontWeight,
        cursor: control.disabled ? "not-allowed" : "pointer",
        boxShadow: button.boxShadow,
      }}
    >
      {control.label}
    </button>
  );
}

/**
 * 하단 중앙 컨트롤 (회전, 중앙 맞추기, 축소, 확대)
 */
export function CanvasControlsCenter({ controls }: { controls: ControlButton[] }) {
  const { container, positions } = CANVAS_CONTROLS_STYLE;
  return (
    <div
      style={{
        position: "absolute",
        ...positions.centerBottom,
        display: "flex",
        gap: container.gap,
        flexWrap: "nowrap",
        justifyContent: "center",
        padding: container.padding,
        background: container.background,
        borderRadius: container.borderRadius,
        boxShadow: container.boxShadow,
        pointerEvents: "auto",
        maxWidth: "calc(100% - 24px)",
        overflowX: "auto",
        zIndex: 2,
      }}
    >
      {controls.map(renderButton)}
    </div>
  );
}

/**
 * 좌측 상단 컨트롤 (편집 도구: 추가, 삭제, 벽체, 컷아웃)
 */
export function CanvasControlsTopLeft({ controls }: { controls: ControlButton[] }) {
  const { container, positions } = CANVAS_CONTROLS_STYLE;
  return (
    <div
      style={{
        position: "absolute",
        ...positions.topLeft,
        display: "flex",
        gap: container.gap,
        padding: container.padding,
        background: container.background,
        borderRadius: container.borderRadius,
        boxShadow: container.boxShadow,
        pointerEvents: "auto",
        zIndex: 2,
      }}
    >
      {controls.map(renderButton)}
    </div>
  );
}

/**
 * 좌측 하단 컨트롤 (실행취소, 다시실행)
 */
export function CanvasControlsBottomLeft({ controls }: { controls: ControlButton[] }) {
  const { container, positions } = CANVAS_CONTROLS_STYLE;
  return (
    <div
      style={{
        position: "absolute",
        ...positions.bottomLeft,
        display: "flex",
        gap: container.gap,
        padding: container.padding,
        background: container.background,
        borderRadius: container.borderRadius,
        boxShadow: container.boxShadow,
        pointerEvents: "auto",
        zIndex: 2,
      }}
    >
      {controls.map(renderButton)}
    </div>
  );
}

/**
 * 우측 하단 컨트롤 (뷰 토글)
 */
export function CanvasControlsBottomRight({ controls }: { controls: ControlButton[] }) {
  const { container, positions } = CANVAS_CONTROLS_STYLE;
  return (
    <div
      style={{
        position: "absolute",
        ...positions.bottomRight,
        display: "flex",
        gap: container.gap,
        padding: container.padding,
        background: container.background,
        borderRadius: container.borderRadius,
        boxShadow: container.boxShadow,
        pointerEvents: "auto",
        zIndex: 2,
      }}
    >
      {controls.map(renderButton)}
    </div>
  );
}

// 기존 이름 유지 (호환성)
export const HtmlCanvasControls = CanvasControlsCenter;
export const HtmlRightBottomControls = CanvasControlsBottomRight;
