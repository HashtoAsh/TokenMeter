import { useCallback } from 'react';
import { getCurrent, type WebviewWindow } from '@tauri-apps/api/window';
import { DRAG_SETTLE_MS, SNAP_MARGIN } from '../layout';
import { clampRect, nearestSideWithin, sameRect, sideByCenter, type Rect, type WorkArea } from '../lib/windowGeometry';
import { applyRect, getWorkArea, readRect } from '../lib/windowTauri';
import { useStore } from '../stores/useStore';

/**
 * 窗口拖动：原生系统拖动(丝滑无残影) + 松手后屏幕边缘吸附。
 *
 * - 按住移动超过阈值 → 调起系统拖动(OS 接管，跟手)；
 * - 系统拖动期间 WebView 收不到 pointerup，因此以 60ms 轮询窗口位置：
 *   位置连续静止 DRAG_SETTLE_MS(400ms) 视为松手；若期间收到过 pointerup，
 *   判定阈值降到 150ms（响应更快）。
 *   阈值取 400ms 是为了避免"拖动中途停顿"被误判成松手而提前吸附。
 * - 松手落位：
 *   · 距屏幕左/右边缘 < SNAP_MARGIN → 吸附贴边（收起为竖条）；
 *   · 否则停在原地，只做工作区钳制；若此时还处于 docked 小条状态，
 *     则恢复成正常悬浮尺寸（修复"小条被拖离边缘后永远是个小条"）。
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
    let pointerReleased = false;
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

    const finish = async () => {
      if (done) return;
      done = true;
      stopWatchdog();
      useStore.getState().setDragging(false);
      const rect = await readRect(app).catch(() => null);
      if (rect) await settleAfterDrag(app, rect);
    };

    const move = (ev: PointerEvent) => {
      if (armed) return; // 系统拖动已接管
      if (Math.hypot(ev.clientX - startClientX, ev.clientY - startClientY) > threshold) {
        armed = true;
        ev.preventDefault();
        useStore.getState().setDragging(true);
        (async () => {
          await app.startDragging().catch(() => {
            done = true; // 系统拖动失败则放弃（位置未动，无需吸附）
            useStore.getState().setDragging(false);
          });
          if (done) return;
          // 拖动结束后位置会稳定下来 → 触发吸附检测
          watchdog = setInterval(async () => {
            const pos = await app.outerPosition().catch(() => null);
            if (!pos) return;
            const now = Date.now();
            const required = pointerReleased ? 150 : DRAG_SETTLE_MS;
            if (lastPos && Math.abs(pos.x - lastPos.x) <= 1 && Math.abs(pos.y - lastPos.y) <= 1) {
              if (!stableSince) stableSince = now;
              if (now - stableSince >= required) void finish();
            } else {
              stableSince = 0;
            }
            lastPos = { x: pos.x, y: pos.y };
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
      // 收到真实 pointerup：把"静止判定"阈值降到 150ms
      pointerReleased = true;
      // 兜底：即便轮询被节流，也要在合理时间内收尾
      setTimeout(() => {
        if (!done) void finish();
      }, DRAG_SETTLE_MS + 150);
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

/** 松手后的落位：够近就贴边隐藏；不够近就停在原地（并做工作区钳制） */
async function settleAfterDrag(app: WebviewWindow, rect: Rect) {
  const store = useStore.getState();
  const area = await getWorkArea(app).catch(() => null);
  if (!area) return;

  const side = nearestSideWithin(rect, area, SNAP_MARGIN);
  if (side) {
    store.setDockSide(side);
    store.setEdgeState('docked');
    // 静止判定可能早于真实松手：稍后再确认一次，避免"贴边贴了一半又被系统拖走"
    setTimeout(() => {
      void recheckSnap(app, area);
    }, DRAG_SETTLE_MS + 120);
    return;
  }

  store.setDockSide(sideByCenter(rect, area));
  const clamped = clampRect(rect, area);
  if (!sameRect(clamped, rect)) await applyRect(app, clamped);
  // 22px 竖条被拖到屏幕中间：恢复成正常悬浮尺寸，否则会一直是个看不见内容的小条
  if (store.edgeState === 'docked') store.setEdgeState('hovering');
}

/** 贴边自检：窗口若因系统拖动尚未结束而偏离目标，重新贴一次（只做一次，不循环） */
async function recheckSnap(app: WebviewWindow, area: WorkArea) {
  const store = useStore.getState();
  const now = await readRect(app).catch(() => null);
  if (!now) return;
  const side = nearestSideWithin(now, area, SNAP_MARGIN);
  if (!side) return;
  store.setDockSide(side);
  if (store.edgeState !== 'docked') {
    store.setEdgeState('docked');
    return;
  }
  // 状态已是 docked 但窗口没贴在边上 → 直接补一次贴边
  const targetX = side === 'right' ? area.x + area.width - now.width : area.x;
  if (Math.abs(now.x - targetX) > 1) await applyRect(app, { ...now, x: targetX });
}
