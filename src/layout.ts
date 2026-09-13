// 各状态下窗口的固定尺寸（逻辑像素）与贴边/吸附参数
export const WINDOW_SIZES = {
  docked: { width: 22, height: 130 },
  hovering: { width: 320, height: 400 },
  expanded: { width: 400, height: 640 },
} as const;

export type WindowState = keyof typeof WINDOW_SIZES;

// 拖到离屏幕边缘多近(逻辑px)时触发贴边吸附
export const SNAP_MARGIN = 32;

// 判定“窗口当前是否已贴在屏幕边缘”的容差(逻辑px)
export const EDGE_TOLERANCE = 8;

// 鼠标移出窗口后，多久自动回到贴边隐藏态(ms)
export const HOVER_HIDE_DELAY = 260;

// 刚收起（贴边）后的一段冷却时间(ms)：此期间不响应鼠标移入，
// 避免“点收起时鼠标刚好还在边缘 → 窗口立刻又弹开”的来回抖动
export const HOVER_COOLDOWN = 420;

// 贴边/展开的状态切换动画时长(ms)，0 表示不做动画（直接定位）
export const SLIDE_DURATION = 140;

// 拖动过程中窗口位置连续静止多久，判定为“已松手”(ms)
// 说明：系统拖动(startDragging)期间 WebView 收不到 pointerup，只能靠静止判定；
// 取值太短会在“拖动中途停顿”时被误判为松手，故取 400ms。
export const DRAG_SETTLE_MS = 400;
