// 各状态下窗口的固定尺寸（逻辑像素）与吸附参数
export const WINDOW_SIZES = {
  docked: { width: 22, height: 130 },
  hovering: { width: 320, height: 400 },
  expanded: { width: 400, height: 640 },
} as const;

export type WindowState = keyof typeof WINDOW_SIZES;

// 拖到离屏幕边缘多近(逻辑px)时触发贴边吸附
export const SNAP_MARGIN = 32;
