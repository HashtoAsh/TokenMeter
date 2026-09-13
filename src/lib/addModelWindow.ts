// “添加/编辑模型”子窗口的生命周期与摆放。
//
// 修复的两个历史问题：
// 1. 窗口曾经用 decorations:true（系统标题栏）+ 页面里再画一层自己的标题栏，
//    视觉上就是“大窗套小窗”。现在统一为无边框 + 透明窗口，只保留页面内的一层圆角面板；
// 2. 主窗口是 alwaysOnTop，子窗口原来 alwaysOnTop:false，重叠时会被主窗口盖住
//    （看起来像“小窗被套在大窗里”）。现在子窗口也置顶，并默认摆在主窗口旁边不重叠。
import { emit } from '@tauri-apps/api/event';
import { getCurrent, LogicalPosition, WebviewWindow } from '@tauri-apps/api/window';
import { clamp } from './windowGeometry';
import { getWorkArea, readRect } from './windowTauri';
import { useStore } from '../stores/useStore';

/** 子窗口尺寸（逻辑像素）：四周留 SHELL_PADDING 透明边，用于页面内画投影 */
export const ADD_WINDOW = {
  width: 500,
  height: 690,
  shellPadding: 10,
  gap: 12,
} as const;

let current: { win: WebviewWindow; key: string } | null = null;

/** 子窗口关闭：解除主窗口“保持展开”的锁定 */
export function markAddModelWindowClosed() {
  current = null;
  useStore.getState().setChildWindowOpen(false);
}

export function isAddModelWindowOpen(): boolean {
  return current !== null;
}

/** 打开（或复用）添加/编辑模型窗口 */
export async function openAddModelWindow(modelId?: string): Promise<void> {
  const key = modelId ?? '';

  if (current) {
    const prev = current;
    current = null;
    if (prev.key === key) {
      // 同一个目标：把已开的窗口唤到前面即可（避免重复建同名窗口导致创建失败）
      try {
        await prev.win.show();
        await prev.win.setFocus();
        useStore.getState().setChildWindowOpen(true);
        current = prev;
        return;
      } catch {
        /* 窗口已不存在，继续走重建流程 */
      }
    } else {
      try {
        await prev.win.close();
      } catch {
        /* ignore */
      }
      // 等 Rust 侧真正销毁，否则同名 label 会创建失败
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  const url = modelId
    ? `index.html?add=1&edit=${encodeURIComponent(modelId)}`
    : 'index.html?add=1';

  const win = new WebviewWindow('add-model', {
    title: modelId ? '编辑模型' : '添加模型',
    url,
    width: ADD_WINDOW.width,
    height: ADD_WINDOW.height,
    resizable: false,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    center: false,
    focus: true,
  });

  current = { win, key };
  useStore.getState().setChildWindowOpen(true);

  // 子窗口关闭（保存/取消/ESC/系统关闭）→ 解除主窗口的“保持展开”
  const release = () => {
    if (current?.win === win) markAddModelWindowClosed();
  };
  win.once('tauri://destroyed', release);
  win.once('tauri://close-requested', release);
  win.once('tauri://error', (e) => {
    console.error('打开添加模型窗口失败:', e);
    release();
  });

  // 摆位：窗口创建完成后设一次（主路径），并立即再设一次兜底
  // （once() 只是注册监听、不会等待事件，所以不能靠它来同步创建完成）
  const pos = await computeAddWindowPosition();
  if (pos) {
    const place = () => {
      void win.setPosition(new LogicalPosition(pos.x, pos.y)).catch(() => {
        /* 窗口还没就绪时忽略，created 事件里会再设一次 */
      });
    };
    win.once('tauri://created', place);
    place();
  }
  await win.setFocus().catch(() => {});
}

/** 主窗口旁边的空位；两侧都放不下时居中。返回逻辑像素坐标。 */
async function computeAddWindowPosition(): Promise<{ x: number; y: number } | null> {
  const main = getCurrent();
  const [area, mainRect] = await Promise.all([getWorkArea(main), readRect(main)]);
  if (!mainRect) return null;

  const { width, height, gap } = ADD_WINDOW;
  const right = area.x + area.width;

  // 默认贴主窗口左侧（主窗口通常贴在屏幕右侧）；左侧不够就换右侧；两侧都不够则居中
  let x = mainRect.x - width - gap;
  if (x < area.x) x = mainRect.x + mainRect.width + gap;
  if (x + width > right) x = area.x + (area.width - width) / 2;

  return {
    x: Math.round(clamp(x, area.x, Math.max(area.x, right - width))),
    y: Math.round(clamp(mainRect.y, area.y, Math.max(area.y, area.y + area.height - height))),
  };
}

/** 让子窗口在关闭前主动通知主窗口（beforeunload 等路径下的兜底见 ModelManager） */
export async function notifyAddModelWindowClosed() {
  try {
    await emit('add-model-window-closed');
  } catch {
    /* ignore */
  }
  markAddModelWindowClosed();
}
