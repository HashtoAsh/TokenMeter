import { useEffect, useRef, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { getCurrent } from '@tauri-apps/api/window';
import { useStore } from './stores/useStore';
import { HOVER_COOLDOWN, HOVER_HIDE_DELAY, SLIDE_DURATION } from './layout';
import { computeTargetRect, detectDockSide } from './lib/windowGeometry';
import { animateToRect, getWorkArea, readRect } from './lib/windowTauri';
import { markAddModelWindowClosed } from './lib/addModelWindow';
import FloatingBar from './components/FloatingBar';
import QuickInfo from './components/QuickInfo';
import DetailPanel from './components/DetailPanel';
import ModelManager from './components/ModelManager';
import PollErrorAlert from './components/PollErrorAlert';
import DataCleanupDialog from './components/DataCleanupDialog';

// 独立"添加模型"窗口（?add=1）：只渲染表单，完成后自动关闭
const isAddModelWindow = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('add') === '1';

function App() {
  const { fetchModels, fetchAllStats, edgeState, setEdgeState, dockSide, setDockSide } = useStore();
  const standaloneAdd = isAddModelWindow();
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 刚贴边收起的时刻 / 鼠标是否已离开贴边条：用于避免"收起后立刻又弹开"
  const lastDockAtRef = useRef(0);
  const hoverArmedRef = useRef(true);
  // 上一次的贴边状态：用于区分"首次定位到贴边位"与"用户主动收起"，
  // 前者不能解除 hover（否则程序启动后第一次鼠标移入贴边条会没反应）
  const prevEdgeStateRef = useRef<typeof edgeState | null>(null);
  // 首次定位（启动时把窗口摆到贴边位）不做动画，避免"开机时窗口从屏幕中间滑过去"
  const firstApplyRef = useRef(true);

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
    // "添加/编辑模型"子窗口关闭 → 解除主窗口的"保持展开"
    const unlistenAddClosed = listen('add-model-window-closed', () => {
      markAddModelWindowClosed();
    });
    return () => {
      clearInterval(interval);
      unlistenUsage.then((fn) => fn());
      unlistenModels.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      unlistenAddClosed.then((fn) => fn());
    };
  }, []);

  /**
   * 贴边状态 → 窗口几何（唯一入口，避免多处 setSize/setPosition 互相打架）。
   *
   * 规则：
   * 1. docked：一定贴到屏幕左/右边缘（纵向也钳制，贴边条不会跑出屏幕）；
   * 2. hovering / expanded：窗口原本贴边 → 以该边为锚向内展开；否则保持原地（只做钳制）；
   * 3. 所有状态都钳制在显示器工作区内（扣除任务栏），展开时不会被屏幕底部截断；
   * 4. 尺寸与位置同帧下发 + 短滑动过渡，消除原来"先跳位、再缩放"的两段式跳动。
   */
  useEffect(() => {
    if (standaloneAdd) return;
    const app = getCurrent();
    let cancelled = false;
    (async () => {
      const from = await readRect(app);
      if (!from) return;
      const area = await getWorkArea(app);
      if (cancelled) return;

      const detected = detectDockSide(from, area);
      const side = detected ?? dockSide;
      if (detected && detected !== dockSide) setDockSide(detected);

      const isFirstApply = prevEdgeStateRef.current === null;
      prevEdgeStateRef.current = edgeState;
      if (edgeState === 'docked' && !isFirstApply) {
        // 用户主动收起：在鼠标离开贴边条之前不再响应移入
        lastDockAtRef.current = Date.now();
        hoverArmedRef.current = false;
      }

      const to = computeTargetRect(edgeState, side, from, area);
      const duration = firstApplyRef.current ? 0 : SLIDE_DURATION;
      firstApplyRef.current = false;
      await animateToRect(app, from, to, () => cancelled, duration);
    })();
    return () => {
      cancelled = true;
    };
  }, [edgeState, dockSide, standaloneAdd, setDockSide]);

  // 鼠标移入贴边条 → 展开
  const handleMouseEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    const st = useStore.getState();
    // 鼠标重新回到主窗口 → 解除"子窗口打开时保持展开"的锁定，
    // 这样即便子窗口是被系统（任务栏/Alt+F4）关掉、事件没送达，主窗口也不会一直不收起
    if (st.childWindowOpen) st.setChildWindowOpen(false);
    if (st.edgeState !== 'docked' || st.dragging) return;
    // 刚收起时鼠标可能还停在贴边条上：要它先离开再回来，且跳过冷却时间，才重新弹开
    if (!hoverArmedRef.current) return;
    if (Date.now() - lastDockAtRef.current < HOVER_COOLDOWN) return;
    setEdgeState('hovering');
  }, [setEdgeState]);

  // 鼠标移出窗口 → 延迟回到贴边隐藏态
  const handleMouseLeave = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    const st = useStore.getState();
    if (st.edgeState === 'docked') {
      // 鼠标确实离开了贴边条 → 下次移入可以展开
      hoverArmedRef.current = true;
      return;
    }
    leaveTimerRef.current = setTimeout(() => {
      const s = useStore.getState();
      // 正在拖动窗口、或"添加/编辑模型"子窗口还开着 → 保持当前展开状态
      if (s.dragging || s.childWindowOpen) return;
      s.setEdgeState('docked');
    }, HOVER_HIDE_DELAY);
  }, []);

  // 点击 hovering 状态时切换到 expanded
  const handleClick = useCallback(() => {
    const st = useStore.getState();
    if (st.edgeState === 'hovering') st.setEdgeState('expanded');
  }, []);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  if (standaloneAdd) {
    return <ModelManager />;
  }

  return (
    <>
      <div
        className="w-full h-screen bg-transparent"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* 贴边悬浮条 */}
        {edgeState === 'docked' && <FloatingBar edge={dockSide} />}

        {/* Hover 显示简单信息 */}
        {edgeState === 'hovering' && <QuickInfo onClick={handleClick} />}

        {/* 点击展开详情 */}
        {edgeState === 'expanded' && <DetailPanel />}
      </div>

      {/* 轮询异常弹窗 */}
      <PollErrorAlert />

      {/* 数据清理弹窗 */}
      <DataCleanupDialog />
    </>
  );
}

export default App;
