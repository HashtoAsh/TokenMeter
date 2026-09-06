import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrent, LogicalPosition, LogicalSize, currentMonitor } from '@tauri-apps/api/window';
import { useStore } from './stores/useStore';
import { WINDOW_SIZES } from './layout';
import FloatingBar from './components/FloatingBar';
import QuickInfo from './components/QuickInfo';
import DetailPanel from './components/DetailPanel';
import ModelManager from './components/ModelManager';

// 独立“添加模型”窗口（?add=1）：只渲染表单，完成后自动关闭
const isAddModelWindow = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('add') === '1';

function App() {
  const { fetchModels, fetchAllStats, edgeState } = useStore();
  const standaloneAdd = isAddModelWindow();

  // 数据初始化 + 事件监听（仅主窗口）
  useEffect(() => {
    if (standaloneAdd) return;
    fetchModels();
    fetchAllStats();
    const interval = setInterval(fetchAllStats, 5 * 60 * 1000);
    const unlistenUsage = listen('usage-updated', () => fetchAllStats());
    const unlistenModels = listen('models-changed', () => {
      fetchModels();
      fetchAllStats();
    });
    const unlistenStatus = listen<{ id?: string; ok?: boolean; error?: string }>(
      'poll-status',
      (e) => {
        const p = e.payload;
        if (p?.id) {
          useStore.getState().setPollStatus(p.id, { ok: !!p.ok, error: p.error });
        }
      },
    );
    return () => {
      clearInterval(interval);
      unlistenUsage.then((fn) => fn());
      unlistenModels.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
    };
  }, []);

  // 状态切换时固定窗口尺寸；若窗口贴右缘，则向左展开，避免超出屏幕
  useEffect(() => {
    if (standaloneAdd) return;
    const app = getCurrent();
    const size = WINDOW_SIZES[edgeState] || WINDOW_SIZES.docked;
    (async () => {
      const [scale, pos, cur, mon] = await Promise.all([
        app.scaleFactor().catch(() => 1),
        app.outerPosition().catch(() => null),
        app.innerSize().catch(() => null),
        currentMonitor().catch(() => null),
      ]);
      if (!pos || !cur || !mon) {
        app.setSize(new LogicalSize(size.width, size.height)).catch(() => {});
        return;
      }
      await app.setSize(new LogicalSize(size.width, size.height)).catch(() => {});
      const curW = cur.width / scale;
      const mRight = mon.position.x / scale + mon.size.width / scale;
      const anchoredRight = Math.abs(pos.x / scale + curW - mRight) < 8;
      if (anchoredRight) {
        const nx = mRight - size.width;
        if (Math.abs(nx - pos.x / scale) > 1) {
          app
            .setPosition(new LogicalPosition(Math.round(nx), Math.round(pos.y / scale)))
            .catch(() => {});
        }
      }
    })();
  }, [edgeState, standaloneAdd]);

  if (standaloneAdd) {
    return <ModelManager standalone />;
  }

  return (
    <div className="w-full h-screen bg-transparent">
      {/* 贴边悬浮条 */}
      {edgeState === 'docked' && <FloatingBar />}

      {/* Hover 显示简单信息 */}
      {edgeState === 'hovering' && <QuickInfo />}

      {/* 点击展开详情 */}
      {edgeState === 'expanded' && <DetailPanel />}
    </div>
  );
}

export default App;
