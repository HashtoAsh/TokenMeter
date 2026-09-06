import { useStore } from '../stores/useStore';
import { useWindowDrag } from '../hooks/useWindowDrag';

export default function FloatingBar() {
  const { setEdgeState, models } = useStore();
  const dragProps = useWindowDrag();

  // 鼠标进入时展开
  const handleMouseEnter = () => {
    setEdgeState('hovering');
  };

  return (
    <div
      onPointerDown={dragProps}
      onMouseEnter={handleMouseEnter}
      className="h-screen w-full bg-gray-800/90 backdrop-blur-sm cursor-move
                 flex flex-col items-center justify-center gap-2
                 hover:bg-gray-700/90 transition-colors"
    >
      {/* 指示器 */}
      <div className="w-1 h-6 bg-blue-400 rounded-full" />
      <div className="w-1 h-6 bg-green-400 rounded-full opacity-60" />

      {/* 模型数量指示 */}
      {models.length > 0 && (
        <div className="absolute bottom-2 w-4 h-4 bg-blue-500 rounded-full 
                        flex items-center justify-center text-[10px] text-white">
          {models.length}
        </div>
      )}
    </div>
  );
}
