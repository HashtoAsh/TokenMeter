// 窗口几何计算：纯函数、零依赖（不 import Tauri / DOM），
// 便于用 tools/test-window-geometry.mjs 直接跑真实用例回归。
//
// 坐标系：与 Tauri 的 LogicalPosition / LogicalSize 一致（逻辑像素，
// 原点是主显示器左上角）。
import { EDGE_TOLERANCE, WINDOW_SIZES } from '../layout';
import type { DockSide, EdgeState } from '../types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 显示器工作区（已扣除任务栏），逻辑像素 */
export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export function clamp(value: number, lo: number, hi: number): number {
  if (hi < lo) return lo;
  return Math.min(Math.max(value, lo), hi);
}

export function sameRect(a: Rect, b: Rect, tolerance = 0.5): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

/** 把矩形整体钳制进工作区：尺寸不超过工作区，位置保证完整可见 */
export function clampRect(rect: Rect, area: WorkArea): Rect {
  const width = Math.min(rect.width, area.width);
  const height = Math.min(rect.height, area.height);
  return {
    x: Math.round(clamp(rect.x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(rect.y, area.y, area.y + area.height - height)),
    width,
    height,
  };
}

/** 窗口当前是否已贴在屏幕左/右边缘 */
export function detectDockSide(
  rect: Rect,
  area: WorkArea,
  tolerance: number = EDGE_TOLERANCE,
): DockSide | null {
  if (Math.abs(rect.x - area.x) <= tolerance) return 'left';
  const right = area.x + area.width;
  if (Math.abs(rect.x + rect.width - right) <= tolerance) return 'right';
  return null;
}

/** 松手位置离哪条边够近（< margin）→ 该方向；否则 null（不吸附） */
export function nearestSideWithin(rect: Rect, area: WorkArea, margin: number): DockSide | null {
  const dLeft = Math.abs(rect.x - area.x);
  const dRight = Math.abs(rect.x + rect.width - (area.x + area.width));
  const min = Math.min(dLeft, dRight);
  if (min > margin) return null;
  return dLeft <= dRight ? 'left' : 'right';
}

/** 窗口中心更靠近哪半边屏幕（拖动后据此记录贴边方向） */
export function sideByCenter(rect: Rect, area: WorkArea): DockSide {
  return rect.x + rect.width / 2 < area.x + area.width / 2 ? 'left' : 'right';
}

/**
 * 计算目标矩形：
 * - docked：**一定**贴到 side 对应的边缘（修复“小条被拖离边缘后漂在屏幕中间、
 *   既回不到边缘又一直只有 22px 宽”的问题），纵向位置钳制进工作区；
 * - hovering / expanded：当前窗口已贴边时以该边为锚向内展开（右侧贴边 → 向左展开），
 *   否则保持当前位置（只做工作区钳制）——避免“拖到哪里就被强行吸回边缘”。
 *
 * 展开时窗口高度可能小于/大于原高度，一律钳制，保证底部按钮不会被屏幕/任务栏截断。
 */
export function computeTargetRect(
  state: EdgeState,
  side: DockSide,
  current: Rect,
  area: WorkArea,
): Rect {
  const size = WINDOW_SIZES[state];
  const width = Math.min(size.width, area.width);
  const height = Math.min(size.height, area.height);

  if (state === 'docked') {
    const x = side === 'right' ? area.x + area.width - width : area.x;
    return clampRect({ x, y: current.y, width, height }, area);
  }

  const anchored = detectDockSide(current, area) !== null;
  const x = anchored ? (side === 'right' ? area.x + area.width - width : area.x) : current.x;
  return clampRect({ x, y: current.y, width, height }, area);
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function lerpRect(from: Rect, to: Rect, t: number): Rect {
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    width: mix(from.width, to.width),
    height: mix(from.height, to.height),
  };
}

/**
 * 贴边/展开时的目标矩形序列（不含起点），用于滑动动画。
 * 只改宽度/高度会带来“先跳位再缩放”的两段式抖动，这里统一返回插值矩形。
 */
export function slideSteps(from: Rect, to: Rect, steps: number): Rect[] {
  if (steps <= 0) return [to];
  const out: Rect[] = [];
  for (let i = 1; i <= steps; i++) {
    out.push(lerpRect(from, to, easeOutCubic(i / steps)));
  }
  return out;
}
