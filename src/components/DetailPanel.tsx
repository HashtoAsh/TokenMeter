import { useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useStore } from '../stores/useStore';
import { useWindowDrag } from '../hooks/useWindowDrag';
import { formatMoney, formatTokens } from '../utils/money';
// 独立"添加/编辑模型"窗口：生命周期与摆放见 lib/addModelWindow.ts
import { openAddModelWindow } from '../lib/addModelWindow';
import HistoryPanel from './HistoryPanel';

type TabType = 'today' | 'history' | 'settings';

export default function DetailPanel() {
  const { 
    models, 
    stats, 
    pollStatus,
    selectedModelId, 
    setSelectedModel,
    setEdgeState, 
    deleteModel 
  } = useStore();
  const dragProps = useWindowDrag();
  
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [autoStart, setAutoStart] = useState<boolean | null>(null);

  const selectedModel = models.find(m => m.id === selectedModelId) || models[0];
  const currentStats = selectedModel ? stats[selectedModel.id] : null;

  // 检查自启动状态
  useState(() => {
    invoke<boolean>('is_autostart_enabled').then(setAutoStart).catch(() => setAutoStart(false));
  });

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

  // 切换自启动
  const toggleAutoStart = async () => {
    try {
      if (autoStart) {
        await invoke('disable_autostart');
      } else {
        await invoke('enable_autostart');
      }
      setAutoStart(!autoStart);
    } catch (e) {
      console.error('切换自启动失败:', e);
    }
  };

  return (
    <div onPointerDown={dragProps} className="h-screen w-full bg-gray-900/95 backdrop-blur-md text-white flex flex-col animate-slide-in">
      {/* 头部 */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700/50 cursor-move">
        <h2 className="text-sm font-medium">TokenMeter</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { void openAddModelWindow(); }}
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

      {/* 标签页 */}
      <div className="flex border-b border-gray-700/50">
        <button
          onClick={() => setActiveTab('today')}
          className={`flex-1 py-2 text-sm font-medium ${
            activeTab === 'today'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          今日
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex-1 py-2 text-sm font-medium ${
            activeTab === 'history'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          历史
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 py-2 text-sm font-medium ${
            activeTab === 'settings'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          设置
        </button>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'today' && (
          <div className="h-full overflow-y-auto p-2 space-y-1">
            {/* 模型列表 */}
            {models.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                暂无模型，点击上方添加
              </div>
            ) : (
              models.map((model) => {
                const modelStats = stats[model.id];
                const status = pollStatus[model.id];
                const isSelected = model.id === selectedModelId;

                return (
                  <div
                    key={model.id}
                    onClick={() => setSelectedModel(model.id)}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-gray-700/80 border border-blue-500/50'
                        : 'bg-gray-800/50 hover:bg-gray-700/50 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          status?.ok === false ? 'bg-red-500' : 'bg-green-500'
                        }`} />
                        <span className="text-sm font-medium truncate">{model.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void openAddModelWindow(model.id);
                          }}
                          className="px-1.5 py-0.5 text-[10px] bg-gray-600 hover:bg-gray-500 rounded"
                        >
                          编辑
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowConfirmDelete(model.id);
                          }}
                          className="px-1.5 py-0.5 text-[10px] bg-red-600/80 hover:bg-red-500 rounded"
                        >
                          删除
                        </button>
                      </div>
                    </div>

                    {/* 统计信息 */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-400">输入: </span>
                        <span className="text-blue-400">{formatTokens(modelStats?.inputTokens || 0)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">输出: </span>
                        <span className="text-green-400">{formatTokens(modelStats?.outputTokens || 0)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">费用: </span>
                        <span className="text-yellow-400">{formatMoney(modelStats?.totalCost || 0, model.currency)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">请求: </span>
                        <span>{modelStats?.requestCount || 0}</span>
                      </div>
                    </div>

                    {/* 错误提示 */}
                    {status && !status.ok && (
                      <div className="mt-2 text-[10px] text-red-400 truncate">
                        ⚠ {status.error}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* 删除确认 */}
            {showConfirmDelete && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-gray-800 rounded-lg p-4 max-w-xs">
                  <p className="text-sm mb-4">确定删除此模型？</p>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowConfirmDelete(null)}
                      className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleDelete(showConfirmDelete)}
                      className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 rounded"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 统计口径说明 */}
            {selectedModel && currentStats && (
              <div className="mt-2 bg-gray-800 rounded p-3">
                <div className="text-gray-400 text-xs mb-2">今日统计</div>
                <div className="grid grid-cols-2 gap-2">
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
                  <div className="text-2xl font-mono text-yellow-400">{formatMoney(currentStats.totalCost, selectedModel.currency)}</div>
                </div>
                {/* 统计口径就地说明：避免被误读为账号全部消耗 */}
                <div className="mt-1.5 text-[10px] leading-4 text-gray-500 text-center">
                  仅统计 TokenMeter 自身轮询请求的用量（响应 usage 为单次请求口径），非该账号的全部消耗
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <HistoryPanel />
        )}

        {activeTab === 'settings' && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">通用设置</h3>
              
              {/* 自启动开关 */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm">开机自启动</div>
                  <div className="text-xs text-gray-400">启动系统时自动运行 TokenMeter</div>
                </div>
                <button
                  onClick={toggleAutoStart}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    autoStart ? 'bg-blue-600' : 'bg-gray-600'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    autoStart ? 'translate-x-7' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-300 mb-3">关于</h3>
              <div className="text-xs text-gray-400 space-y-2">
                <p>TokenMeter v0.1.0</p>
                <p>监控 AI 模型 Token 用量</p>
                <p>数据存储在本地 SQLite 数据库</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
