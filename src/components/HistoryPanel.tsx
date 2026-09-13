import { useEffect } from 'react';
import { useStore } from '../stores/useStore';
import DatePicker from './DatePicker';
import DailyDetailCard from './DailyDetailCard';
import CostChart from './CostChart';

export default function HistoryPanel() {
  const {
    models,
    queryDimension,
    queryFilter,
    selectedDate,
    dailyDetail,
    dailyCosts,
    apiKeyList,
    dailyRecords,
    showIgnored,
    setQueryDimension,
    setQueryFilter,
    setSelectedDate,
    setShowIgnored,
    fetchDailyDetail,
    fetchDailyCosts,
    fetchApiKeyList,
    fetchDailyRecords,
    ignoreRecord,
    unignoreRecord,
  } = useStore();

  // 初始化数据
  useEffect(() => {
    fetchApiKeyList();
    fetchDailyDetail();
    fetchDailyCosts(7);
    fetchDailyRecords();
  }, []);

  // 日期变化时刷新数据
  useEffect(() => {
    fetchDailyDetail();
    fetchDailyRecords();
  }, [selectedDate, queryDimension, queryFilter]);

  // 格式化时间戳为时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* 标题 */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold">历史查询</h2>
      </div>

      {/* 查询维度选择 */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setQueryDimension('total')}
            className={`px-3 py-1 rounded text-sm ${
              queryDimension === 'total'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            总计
          </button>
          <button
            onClick={() => setQueryDimension('api')}
            className={`px-3 py-1 rounded text-sm ${
              queryDimension === 'api'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            按API Key
          </button>
          <button
            onClick={() => setQueryDimension('model')}
            className={`px-3 py-1 rounded text-sm ${
              queryDimension === 'model'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            按模型
          </button>
        </div>

        {/* API Key 选择 */}
        {queryDimension === 'api' && (
          <select
            value={queryFilter || ''}
            onChange={(e) => setQueryFilter(e.target.value || null)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm"
          >
            <option value="">选择 API Key</option>
            {apiKeyList.map((item) => (
              <option key={item.apiKeyMask} value={item.apiKeyMask}>
                {item.apiKeyMask} ({item.provider})
              </option>
            ))}
          </select>
        )}

        {/* 模型选择 */}
        {queryDimension === 'model' && (
          <select
            value={queryFilter || ''}
            onChange={(e) => setQueryFilter(e.target.value || null)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm"
          >
            <option value="">选择模型</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 日期选择 */}
      <div className="p-4 border-b border-gray-700">
        <DatePicker
          date={selectedDate}
          onChange={setSelectedDate}
        />
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 每日详情 */}
        <DailyDetailCard detail={dailyDetail} />

        {/* 花费趋势图 */}
        <CostChart data={dailyCosts} />

        {/* 请求记录 */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-300">请求记录</h3>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                checked={showIgnored}
                onChange={(e) => setShowIgnored(e.target.checked)}
                className="rounded"
              />
              显示已忽略
            </label>
          </div>

          {dailyRecords.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-4">
              暂无记录
            </div>
          ) : (
            <div className="space-y-2">
              {dailyRecords.map((record) => (
                <div
                  key={record.id}
                  className={`flex items-center justify-between p-2 rounded ${
                    record.ignored ? 'bg-gray-700/50 opacity-60' : 'bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-12">
                      {formatTime(record.timestamp)}
                    </span>
                    <span className="text-xs text-gray-400">
                      输入: {record.inputTokens.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-400">
                      输出: {record.outputTokens.toLocaleString()}
                    </span>
                    <span className="text-xs text-yellow-400">
                      ¥{record.cost.toFixed(4)}
                    </span>
                  </div>
                  <button
                    onClick={() => record.ignored ? unignoreRecord(record.id) : ignoreRecord(record.id)}
                    className={`text-xs px-2 py-1 rounded ${
                      record.ignored
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {record.ignored ? '取消忽略' : '忽略'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
