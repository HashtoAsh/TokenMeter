import { useState } from 'react';
import { useStore } from '../stores/useStore';
import { MODEL_TEMPLATES, type ModelConfig } from '../types';
import { invoke } from '@tauri-apps/api/tauri';
import { emit } from '@tauri-apps/api/event';
import { getCurrent } from '@tauri-apps/api/window';

const generateId = () => 'model-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

export default function ModelManager({ standalone = false }: { standalone?: boolean }) {
  const { setShowAddModel, addModel } = useStore();
  // 独立“添加模型”窗口时使用本窗口自己的保存/关闭流程
  const isStandalone =
    standalone ||
    (typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('add') === '1');

  const closeWindow = async () => {
    if (isStandalone) {
      try { await getCurrent().close(); } catch { /* ignore */ }
    } else {
      setShowAddModel(false);
    }
  };

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
      if (isStandalone) {
        await invoke('add_model', { model: form });
        await emit('models-changed');
        await closeWindow();
      } else {
        await addModel(form);
      }
    } catch (e) {
      setTestResult({ success: false, message: String(e) });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center animate-fade-in no-drag">
      <div className="bg-gray-900 rounded-lg w-96 max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-white font-medium">添加模型</h3>
          <button
            onClick={closeWindow}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* 模板选择 */}
        <div className="p-4 border-b border-gray-700">
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
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="如：DeepSeek V3"
              className="w-full mt-1 px-3 py-2 bg-gray-800 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">模型ID（model）*</label>
            <input
              type="text"
              value={form.provider}
              onChange={e => setForm(prev => ({ ...prev, provider: e.target.value }))}
              placeholder="如：deepseek-chat、gpt-4o"
              className="w-full mt-1 px-3 py-2 bg-gray-800 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">API 地址 *</label>
            <input
              type="text"
              value={form.apiEndpoint}
              onChange={e => setForm(prev => ({ ...prev, apiEndpoint: e.target.value }))}
              placeholder="https://api.deepseek.com/v1/chat/completions"
              className="w-full mt-1 px-3 py-2 bg-gray-800 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400">API Key *</label>
            <input
              type="password"
              value={form.apiKey}
              onChange={e => setForm(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="sk-..."
              className="w-full mt-1 px-3 py-2 bg-gray-800 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* 定价 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">输入价格 (元/千tokens)</label>
              <input
                type="number"
                step="0.0001"
                value={form.inputPrice}
                onChange={e => setForm(prev => ({ ...prev, inputPrice: parseFloat(e.target.value) || 0 }))}
                className="w-full mt-1 px-3 py-2 bg-gray-800 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">输出价格 (元/千tokens)</label>
              <input
                type="number"
                step="0.0001"
                value={form.outputPrice}
                onChange={e => setForm(prev => ({ ...prev, outputPrice: parseFloat(e.target.value) || 0 }))}
                className="w-full mt-1 px-3 py-2 bg-gray-800 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
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
                    className="w-full mt-1 px-3 py-2 bg-gray-800 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    className="w-full mt-1 px-3 py-2 bg-gray-800 text-white rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div className={`p-2 rounded text-sm ${
              testResult.success ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
            }`}>
              {testResult.message}
            </div>
          )}
        </div>

        {/* 按钮 */}
        <div className="flex gap-2 p-4 border-t border-gray-700">
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
            onClick={closeWindow}
            className="flex-1 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
