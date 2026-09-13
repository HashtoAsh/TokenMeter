// 与 Tauri 窗口 API 打交道的薄封装：几何计算在 windowGeometry.ts（纯函数），
// 这里只负责“读/写/动画”，保持可测与可替换。
import {
  currentMonitor,
  getCurrent,
  LogicalPosition,
  LogicalSize,
  type WebviewWindow,
} from '@tauri-apps/api/window';
import { SLIDE_DURATION } from '../layout';
import { clampRect, sameRect, slideSteps, type Rect, type WorkArea } from './windowGeometry';

/** 读取窗口当前矩形（逻辑像素）。读不到时返回 null，让调用方走“只改尺寸”的兜底分支。 */
export async function readRect(win: WebviewWindow = getCurrent()): Promise<Rect | null> {
  const [scale, pos, size] = await Promise.all([
    win.scaleFactor().catch(() => 1),
    win.outerPosition().catch(() => null),
    win.innerSize().catch(() => null),
  ]);
  if (!pos || !size) return null;
  const s = scale || 1;
  return {
    x: pos.x / s,
    y: pos.y / s,
    width: size.width / s,
    height: size.height / s,
  };
}

/** 一次性写入目标矩形：尺寸与位置同帧下发，避免“先跳位再缩放”的两段式抖动 */
export async function applyRect(win: WebviewWindow, rect: Rect): Promise<void> {
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  await Promise.all([
    win.setSize(new LogicalSize(width, height)).catch(() => {}),
    win.setPosition(new LogicalPosition(x, y)).catch(() => {}),
  ]);
}

/**
 * 带滑动动画地移动到目标矩形。
 * - isCancelled() 返回 true（状态又变了 / 组件卸载）时立即停止，不再下发后续帧；
 * - duration <= 0 或起点终点相同 → 直接一次到位；
 * - 末帧强制对齐目标值，避免插值取整导致差 1px。
 */
export async function animateToRect(
  win: WebviewWindow,
  from: Rect,
  to: Rect,
  isCancelled: () => boolean = () => false,
  duration: number = SLIDE_DURATION,
): Promise<Rect> {
  if (duration <= 0 || sameRect(from, to)) {
    await applyRect(win, to);
    return to;
  }
  const steps = Math.max(1, Math.round(duration / 16));
  for (const rect of slideSteps(from, to, steps)) {
    if (isCancelled()) return to;
    await applyRect(win, rect);
  }
  if (!isCancelled()) await applyRect(win, to);
  return to;
}

/**
 * 当前窗口所在显示器的工作区（逻辑像素，已扣除任务栏）。
 *
 * 显示器范围取自 Tauri 的 currentMonitor（与 setPosition 同一坐标系）；
 * 任务栏占用的边距取自 Chromium 的 screen.avail*（availHeight/Width 已扣除任务栏，
 * 且会跟随窗口所在的显示器变化），两者相减即得工作区。
 */
export async function getWorkArea(win: WebviewWindow = getCurrent()): Promise<WorkArea> {
  const [scale, mon] = await Promise.all([
    win.scaleFactor().catch(() => 1),
    currentMonitor().catch(() => null),
  ]);
  const s = scale || 1;
  const sc = window.screen as Screen & { availLeft?: number; availTop?: number };
  const availWidth = sc.availWidth || sc.width;
  const availHeight = sc.availHeight || sc.height;
  const availLeft = typeof sc.availLeft === 'number' ? sc.availLeft : 0;
  const availTop = typeof sc.availTop === 'number' ? sc.availTop : 0;

  if (!mon) {
    return { x: availLeft, y: availTop, width: availWidth, height: availHeight, scale: s };
  }

  const monRect: Rect = {
    x: mon.position.x / s,
    y: mon.position.y / s,
    width: mon.size.width / s,
    height: mon.size.height / s,
  };

  // 任务栏可能在上/下/左/右，按 Chromium 给出的可用区反推四边保留量（只取正值）
  const insetLeft = Math.max(0, availLeft - monRect.x);
  const insetTop = Math.max(0, availTop - monRect.y);
  const insetRight = Math.max(0, monRect.x + monRect.width - (availLeft + availWidth));
  const insetBottom = Math.max(0, monRect.y + monRect.height - (availTop + availHeight));

  const area: WorkArea = {
    x: monRect.x + insetLeft,
    y: monRect.y + insetTop,
    width: Math.max(120, monRect.width - insetLeft - insetRight),
    height: Math.max(120, monRect.height - insetTop - insetBottom),
    scale: s,
  };
  return area;
}

/** 供调用方按需钳制（例如拖动结束后把窗口拉回可见区域） */
export async function clampIntoWorkArea(win: WebviewWindow, rect: Rect): Promise<Rect> {
  const area = await getWorkArea(win);
  const target = clampRect(rect, area);
  if (!sameRect(target, rect)) await applyRect(win, target);
  return target;
}
