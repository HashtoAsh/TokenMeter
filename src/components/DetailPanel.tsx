import { useState } from 'react';
import { WebviewWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/tauri';
import { useStore } from '../stores/useStore';
import { useWindowDrag } from '../hooks/useWindowDrag';

// 打开独立的“添加模型”窗口（不占用贴边主窗口）
async function openAddModelWindow() {
  const existing = WebviewWindow.getByLabel('add-model');
  if (existing) {
    try { await existing.show(); await existing.setFocus(); } catch { /* ignore */ }
    return;
  }
  const win = new WebviewWindow('add-model', {
    title: '添加模型',
    url: 'index.html?add=1',
    width: 480,
    height: 660,
    resizable: false,
    decorations: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    center: true,
  });
  win.once('tauri://error', (e) => console.error('打开添加模型窗口失败:', e));
}

export default function DetailPanel() {
  const { 
    models, 
    stats, 
    selectedModelId, 
    setSelectedModel,
    setEdgeState, 
    deleteModel 
  } = useStore();
  const dragProps = useWindowDrag();
  
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const selectedModel = models.find(m => m.id === selectedModelId) || models[0];
  const currentStats = selectedModel ? stats[selectedModel.id] : null;

  // 手动轮询
  const handlePoll = async () => {
    setPolling(true);
    try { await invoke('trigger_poll'); } catch { /* ignore */ }
    setPolling(false);
  };

  // 关闭详情
  const handleClose = () => {
    setEdgeState('docked');
  };

  // 删除模型
  const handleDelete = async (id: string) => {
    await deleteModel(id);
    setShowConfirmDelete(null);
  };

  return (
    <div onPointerDown={dragProps} className="h-screen w-full bg-gray-900/95 backdrop-blur-md text-white flex flex-col animate-slide-in">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700/50 cursor-move">
        <h2 className="text-sm font-medium">TokenMeter</h2>
        <div className="flex gap-2">
          <button
            onClick={openAddModelWindow}
            className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded"
          >
            + 添加
          </button>
          <button
            onClick={handlePoll}
            disabled={polling}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
          >
            {polling ? '轮询中…' : '↻ 轮询'}
          </button>
          <button
            onClick={handleClose}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
          >
            收起
          </button>
        </div>
      </div>

      {/* 模型列表 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {models.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            暂无模型，点击上方添加
          </div>
        ) : (
          models.map(model => (
            <div
              key={model.id}
              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                selectedModel?.id === model.id
                  ? 'bg-blue-600/30 border border-blue-500/50'
                  : 'bg-gray-800/50 hover:bg-gray-700/50'
              }`}
              onClick={() => setSelectedModel(model.id)}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{model.name}</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowConfirmDelete(model.id);
                  }}
                  className="text-xs text-gray-500 hover:text-red-400 no-drag"
                >
                  删除
                </button>
              </div>
              <div className="text-xs text-gray-400 mt-1">{model.provider}</div>
              
              {/* 统计数据 */}
              {stats[model.id] && (
                <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                  <div>
                    <div className="text-gray-500">输入</div>
                    <div className="text-blue-400">{formatTokens(stats[model.id].inputTokens)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">输出</div>
                    <div className="text-green-400">{formatTokens(stats[model.id].outputTokens)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">费用</div>
                    <div className="text-yellow-400">¥{stats[model.id].totalCost.toFixed(4)}</div>
                  </div>
                </div>
              )}
              
              {/* 删除确认 */}
              {showConfirmDelete === model.id && (
                <div className="mt-2 flex gap-2 no-drag">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(model.id);
                    }}
                    className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 rounded"
                  >
                    确认删除
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowConfirmDelete(null);
                    }}
                    className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 rounded"
                  >
                    取消
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* 详细统计 */}
      {selectedModel && currentStats && (
        <div className="p-4 border-t border-gray-700/50">
          <h3 className="text-sm font-medium mb-2">{selectedModel.name} - 今日统计</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-gray-800 rounded p-2">
              <div className="text-gray-400 text-xs">请求次数</div>
              <div className="text-lg font-mono">{currentStats.requestCount}</div>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <div className="text-gray-400 text-xs">总 Tokens</div>
              <div className="text-lg font-mono">{formatTokens(currentStats.totalTokens)}</div>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <div className="text-gray-400 text-xs">输入 Tokens</div>
              <div className="text-lg font-mono text-blue-400">{formatTokens(currentStats.inputTokens)}</div>
            </div>
            <div className="bg-gray-800 rounded p-2">
              <div className="text-gray-400 text-xs">输出 Tokens</div>
              <div className="text-lg font-mono text-green-400">{formatTokens(currentStats.outputTokens)}</div>
            </div>
          </div>
          <div className="mt-2 bg-gray-800 rounded p-2 text-center">
            <div className="text-gray-400 text-xs">今日总费用</div>
            <div className="text-2xl font-mono text-yellow-400">¥{currentStats.totalCost.toFixed(4)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
  if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K';
  return tokens.toString();
}
