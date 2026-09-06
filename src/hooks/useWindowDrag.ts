import { useCallback } from 'react';
import { getCurrent, LogicalPosition, LogicalSize, currentMonitor } from '@tauri-apps/api/window';
import { WINDOW_SIZES, SNAP_MARGIN } from '../layout';
import { useStore } from '../stores/useStore';

/**
 * 窗口拖动：原生系统拖动(丝滑无残影) + 松手后屏幕边缘吸附。
 * - 按住移动超过阈值 → 调起系统拖动(OS 接管，跟手)。
 * - 拖动期间以 60ms 轮询窗口位置，位置连续稳定 250ms 视为松手；
 *   松手位置贴近屏幕边缘(<SNAP_MARGIN) → 吸附贴边并收起为竖条。
 * - 原地点击正常；button/a/input 等交互元素上按下不触发。
 */
export function useWindowDrag(threshold = 5) {
  return useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [data-no-drag]')) return;

    const el = e.currentTarget as HTMLElement;
    const app = getCurrent();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    let armed = false;
    let scale = 1;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    let lastPos: { x: number; y: number } | null = null;
    let stableSince = 0;
    let done = false;

    const stopWatchdog = () => {
      if (watchdog) {
        clearInterval(watchdog);
        watchdog = null;
      }
    };

    const finish = () => {
      if (done) return;
      done = true;
      stopWatchdog();
      if (lastPos) snapIfNearEdge(lastPos.x / scale, lastPos.y / scale, scale);
    };

    const move = (ev: PointerEvent) => {
      if (armed) return; // 系统拖动已接管
      if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) > threshold) {
        armed = true;
        ev.preventDefault();
        (async () => {
          scale = await app.scaleFactor().catch(() => 1);
          await app.startDragging().catch(() => {
            done = true; // 系统拖动失败则放弃
          });
          if (done) return;
          // 拖动结束后位置会稳定下来 → 触发吸附检测
          watchdog = setInterval(async () => {
            const pos = await app.outerPosition().catch(() => null);
            if (!pos) return;
            const now = Date.now();
            const x = pos.x;
            const y = pos.y;
            if (lastPos && Math.abs(x - lastPos.x) <= 1 && Math.abs(y - lastPos.y) <= 1) {
              if (!stableSince) stableSince = now;
              if (now - stableSince >= 250) finish();
            } else {
              stableSince = 0;
            }
            lastPos = { x, y };
          }, 60);
        })();
      }
    };

    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (!armed) return; // 未触发拖动 → 正常点击
      // 若 watchdog 已结束则由它收尾；这里兜底延迟检查一次
      setTimeout(() => {
        if (!done) finish();
      }, 400);
    };

    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }, []);
}

/** 松手位置贴近屏幕边缘则吸附贴边并收起为竖条 */
async function snapIfNearEdge(fx: number, fy: number, scale: number) {
  const app = getCurrent();
  const monitor = await currentMonitor().catch(() => null);
  const winSize = await app.innerSize().catch(() => null);
  if (!monitor || !winSize) return;

  const mw = monitor.size.width / scale;
  const mh = monitor.size.height / scale;
  const mx = monitor.position.x / scale;
  const my = monitor.position.y / scale;
  const w = winSize.width / scale;
  const h = winSize.height / scale;

  const dLeft = Math.abs(fx - mx);
  const dRight = Math.abs(fx + w - (mx + mw));
  const dTop = Math.abs(fy - my);
  const dBottom = Math.abs(fy + h - (my + mh));
  const min = Math.min(dLeft, dRight, dTop, dBottom);
  if (min > SNAP_MARGIN) return; // 未贴边，留在原地

  const dock = WINDOW_SIZES.docked;
  let nx = fx;
  let ny = fy;
  if (min === dLeft) nx = mx;
  else if (min === dRight) nx = mx + mw - dock.width;
  if (min === dTop) ny = my;
  else if (min === dBottom) ny = my + mh - dock.height;

  await app.setSize(new LogicalSize(dock.width, dock.height)).catch(() => {});
  await app.setPosition(new LogicalPosition(Math.round(nx), Math.round(ny))).catch(() => {});
  useStore.getState().setEdgeState('docked');
}
