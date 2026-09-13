import { useStore } from '../stores/useStore';
import { useWindowDrag } from '../hooks/useWindowDrag';
import type { DockSide } from '../types';

interface FloatingBarProps {
  edge: DockSide;
}

export default function FloatingBar({ edge }: FloatingBarProps) {
  const { models } = useStore();
  const dragProps = useWindowDrag();

  // 说明：这里不再自行 setEdgeState('hovering')。
  // 展开/收起判定统一收敛到 App.tsx 的 mouseenter/mouseleave（含防回弹冷却），
  // 否则“点收起时鼠标仍停在贴边条上”会在同一次移入事件里把窗口立刻重新弹开。
  return (
    <div
      onPointerDown={dragProps}
      className="h-screen w-full bg-transparent cursor-move relative"
    >
      {/* 窄条指示器：根据贴边方向显示 */}
      <div
        className={`
          absolute top-0 h-full w-[22px]
          bg-gray-800/90 backdrop-blur-sm
          flex flex-col items-center justify-center gap-2
          hover:bg-gray-700/90 transition-colors
          ${edge === 'right' ? 'right-0' : 'left-0'}`}
      >
        {/* 指示器 */}
        <div className="w-1 h-6 bg-blue-400 rounded-full" />
        <div className="w-1 h-6 bg-green-400 rounded-full opacity-60" />

        {/* 模型数量指示 */}
        {models.length > 0 && (
          <div className="absolute bottom-2 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[10px] text-white">
            {models.length}
          </div>
        )}
      </div>
    </div>
  );
}
