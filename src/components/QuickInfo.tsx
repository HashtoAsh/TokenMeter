import { useStore } from '../stores/useStore';
import { useWindowDrag } from '../hooks/useWindowDrag';
import { formatMoney, formatTokens } from '../utils/money';

interface QuickInfoProps {
  onClick?: () => void;
}

export default function QuickInfo({ onClick }: QuickInfoProps) {
  const { models, stats, pollStatus, selectedModelId } = useStore();
  const dragProps = useWindowDrag();
  
  const selectedModel = models.find(m => m.id === selectedModelId) || models[0];
  const currentStats = selectedModel ? stats[selectedModel.id] : null;
  const currentStatus = selectedModel ? pollStatus[selectedModel.id] : undefined;

  return (
    <div
      onPointerDown={dragProps}
      className="h-screen w-full bg-gray-800/95 backdrop-blur-md text-white p-4
                 animate-slide-in cursor-pointer"
      onClick={onClick}
    >
      {/* 标题 */}
      <div className="flex items-center justify-between mb-4 cursor-move">
        <h3 className="text-sm font-medium text-gray-300">TokenMeter</h3>
        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
      </div>

      {/* 当前模型 */}
      {selectedModel ? (
        <div className="space-y-3">
          <div>
            <div className="text-xs text-gray-400">当前模型</div>
            <div className="text-sm font-medium truncate">{selectedModel.name}</div>
          </div>

          {/* 今日统计 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-700/50 rounded p-2">
              <div className="text-xs text-blue-400">输入</div>
              <div className="text-lg font-mono">
                {formatTokens(currentStats?.inputTokens || 0)}
              </div>
            </div>
            <div className="bg-gray-700/50 rounded p-2">
              <div className="text-xs text-green-400">输出</div>
              <div className="text-lg font-mono">
                {formatTokens(currentStats?.outputTokens || 0)}
              </div>
            </div>
          </div>

          {/* 费用 */}
          <div className="bg-gray-700/50 rounded p-2">
            <div className="text-xs text-gray-400">今日费用</div>
            <div className="text-xl font-mono text-yellow-400">
              {formatMoney(currentStats?.totalCost ?? 0, selectedModel.currency)}
            </div>
          </div>

          <div className="text-[10px] text-gray-500">仅统计本应用轮询请求的用量</div>

          {/* 最近一次轮询失败提示 */}
          {currentStatus && !currentStatus.ok && (
            <div className="text-[11px] text-red-400 truncate" title={currentStatus.error}>
              ⚠ 最近轮询失败：{currentStatus.error}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center text-gray-500 text-sm mt-8">
          暂无模型，点击添加
        </div>
      )}

      {/* 提示 */}
      <div className="absolute bottom-4 left-4 right-4 text-xs text-gray-500 text-center">
        点击查看详情
      </div>
    </div>
  );
}
