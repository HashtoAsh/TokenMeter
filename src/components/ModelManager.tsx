import { useCallback, useEffect, useState } from 'react';
import { MODEL_TEMPLATES, type ModelConfig } from '../types';
import { invoke } from '@tauri-apps/api/tauri';
import { emit } from '@tauri-apps/api/event';
import { getCurrent } from '@tauri-apps/api/window';
import { currencySymbol } from '../utils/money';
import { ADD_WINDOW, notifyAddModelWindowClosed } from '../lib/addModelWindow';

const generateId = () => 'model-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

/**
 * 添加/编辑模型表单。本组件只作为独立窗口（?add=1 / ?edit=<id>）渲染。
 *
 * 窗口形态：无边框 + 透明（见 lib/addModelWindow.ts），页面自己画一层圆角面板。
 * 这样窗口上只有"一层框"——之前 decorations:true 的系统标题栏 + 页面里的标题栏
 * 叠在一起，就是用户看到的"大窗套小窗"。
 */
export default function ModelManager() {
  // ?edit=<id>：编辑既有模型（复用同一表单，保存走 update_model）
  const editId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('edit') ?? null
      : null;

  // 关闭：通知主窗口解除"保持展开"，再关掉自身窗口
  const closeWindow = useCallback(async () => {
    await notifyAddModelWindowClosed();
    try {
      await getCurrent().close();
    } catch {
      /* ignore */
    }
  }, []);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [form, setForm] = useState<ModelConfig>({
    id: generateId(),
    name: '',
    provider: '',
    apiEndpoint: '',
    apiKey: '',
    inputPrice: 0,
    outputPrice: 0,
    currency: 'CNY',
    responsePath: {
      inputTokens: 'usage.prompt_tokens',
      outputTokens: 'usage.completion_tokens',
      totalTokens: 'usage.total_tokens',
    },
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  // 编辑模式：加载既有模型配置并预填表单
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await invoke<ModelConfig[]>('get_models');
        const found = list.find(m => m.id === editId);
        if (!found) {
          if (!cancelled) setTestResult({ success: false, message: '未找到该模型（可能已被删除）' });
          return;
        }
        if (!cancelled) setForm(found);
      } catch (e) {
        if (!cancelled) setTestResult({ success: false, message: String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [editId]);

  // Esc 关闭（无边框窗口没有系统关闭按钮，键盘退出必须有）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void closeWindow();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeWindow]);

  // 兜底：窗口被系统/任务栏直接关闭时也通知一次主窗口
  useEffect(() => {
    const notify = () => { void emit('add-model-window-closed'); };
    window.addEventListener('beforeunload', notify);
    window.addEventListener('pagehide', notify);
    return () => {
      window.removeEventListener('beforeunload', notify);
      window.removeEventListener('pagehide', notify);
    };
  }, []);

  // 无边框窗口自己实现拖动：标题栏空白处按下即交给系统拖动
  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
    void getCurrent().startDragging().catch(() => { /* ignore */ });
  };

  // 选择模板
  const selectTemplate = (template: typeof MODEL_TEMPLATES[0]) => {
    setForm(prev => ({
      ...prev,
      name: template.name,
      provider: template.provider,
      apiEndpoint: template.apiEndpoint,
      inputPrice: template.inputPrice,
      outputPrice: template.outputPrice,
      currency: template.currency,
    }));
  };

  // 测试连接
  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await invoke<string>('test_connection', { config: form });
      setTestResult({ success: true, message: result });
    } catch (e) {
      setTestResult({ success: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  // 保存
  const handleSave = async () => {
    if (!form.name || !form.apiEndpoint || !form.apiKey) {
      setTestResult({ success: false, message: '请填写必要字段' });
      return;
    }
    try {
      if (editId) {
        await invoke('update_model', { model: form });
      } else {
        await invoke('add_model', { model: form });
      }
      await emit('models-changed');
      await closeWindow();
    } catch (e) {
      setTestResult({ success: false, message: String(e) });
    }
  };

  const inputCls =
    'w-full mt-1 px-3 py-2 bg-gray-800 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500';

  return (
    <div className="h-screen w-full bg-transparent" style={{ padding: ADD_WINDOW.shellPadding }}>
      {/* 唯一的一层窗口外框：圆角面板（四周透明边留给投影） */}
      <div className="h-full w-full flex flex-col overflow-hidden rounded-xl border border-gray-700/60 bg-gray-900/95 text-white backdrop-blur-md shadow-2xl">
        {/* 标题栏：整条可拖动 */}
        <header
          onPointerDown={startDrag}
          className="flex items-center justify-between px-4 py-3 border-b border-gray-700/60 cursor-move select-none"
        >
          <h3 className="text-sm font-medium">{editId ? '编辑模型' : '添加模型'}</h3>
          <button
            onClick={() => { void closeWindow(); }}
            title="关闭 (Esc)"
            className="w-6 h-6 rounded leading-none text-gray-400 hover:text-white hover:bg-gray-700/60"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* 模板选择 */}
          <div className="p-4 border-b border-gray-700/60">
            <div className="text-xs text-gray-400 mb-2">快速选择模板</div>
            <div className="flex gap-2 flex-wrap">
              {MODEL_TEMPLATES.map(template => (
                <button
                  key={template.name}
                  onClick={() => selectTemplate(template)}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>

          {/* 表单 */}
          <div className="p-4 space-y-3">
            <div>
              <label className="text-xs text-gray-400">模型名称 *</label>
              <input
                type="text"
                autoFocus
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="如：DeepSeek V3"
                className={inputCls}
              />
            </div>

            <div>
              <label className="text-xs text-gray-400">模型ID（model）*</label>
              <input
                type="text"
                value={form.provider}
                onChange={e => setForm(prev => ({ ...prev, provider: e.target.value }))}
                placeholder="如：deepseek-chat、gpt-4o"
                className={inputCls}
              />
            </div>

            <div>
              <label className="text-xs text-gray-400">API 地址 *</label>
              <input
                type="text"
                value={form.apiEndpoint}
                onChange={e => setForm(prev => ({ ...prev, apiEndpoint: e.target.value }))}
                placeholder="https://api.deepseek.com/v1/chat/completions"
                className={inputCls}
              />
            </div>

            <div>
              <label className="text-xs text-gray-400">API Key *</label>
              <input
                type="password"
                value={form.apiKey}
                onChange={e => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="sk-..."
                className={inputCls}
              />
            </div>

            {/* 定价 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400">输入价格 ({currencySymbol(form.currency)}/千 tokens)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={form.inputPrice}
                  onChange={e => setForm(prev => ({ ...prev, inputPrice: parseFloat(e.target.value) || 0 }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="text-xs text-gray-400">输出价格 ({currencySymbol(form.currency)}/千 tokens)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={form.outputPrice}
                  onChange={e => setForm(prev => ({ ...prev, outputPrice: parseFloat(e.target.value) || 0 }))}
                  className={inputCls}
                />
              </div>
            </div>

            {/* 币种 */}
            <div>
              <label className="text-xs text-gray-400">币种</label>
              <select
                value={form.currency}
                onChange={e => setForm(prev => ({ ...prev, currency: e.target.value }))}
                className={inputCls}
              >
                <option value="CNY">CNY（¥）</option>
                <option value="USD">USD（$）</option>
                <option value="EUR">EUR（€）</option>
                <option value="GBP">GBP（£）</option>
                <option value="JPY">JPY（¥）</option>
                <option value="HKD">HKD（HK$）</option>
              </select>
            </div>

            {/* 高级设置 */}
            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {showAdvanced ? '▼' : '▶'} 高级设置（响应解析路径）
              </button>

              {showAdvanced && (
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="text-xs text-gray-400">输入 Tokens 路径</label>
                    <input
                      type="text"
                      value={form.responsePath.inputTokens}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        responsePath: { ...prev.responsePath, inputTokens: e.target.value }
                      }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">输出 Tokens 路径</label>
                    <input
                      type="text"
                      value={form.responsePath.outputTokens}
                      onChange={e => setForm(prev => ({
                        ...prev,
                        responsePath: { ...prev.responsePath, outputTokens: e.target.value }
                      }))}
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 测试结果 */}
            {testResult && (
              <div
                className={
                  'p-2 rounded text-sm ' +
                  (testResult.success
                    ? 'bg-green-900/50 text-green-300'
                    : 'bg-red-900/50 text-red-300')
                }
              >
                {testResult.message}
              </div>
            )}
          </div>
        </div>

        {/* 按钮固定在底部，滚动时始终可见 */}
        <footer className="flex gap-2 p-4 border-t border-gray-700/60">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex-1 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
          >
            {testing ? '测试中...' : '测试连接'}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded"
          >
            保存
          </button>
          <button
            onClick={() => { void closeWindow(); }}
            className="flex-1 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded"
          >
            取消
          </button>
        </footer>
      </div>
    </div>
  );
}
