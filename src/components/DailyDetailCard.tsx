import { formatMoney, formatTokens } from '../utils/money';

interface DailyDetail {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  totalCost: number;
}

interface DailyDetailCardProps {
  detail: DailyDetail | null;
}

export default function DailyDetailCard({ detail }: DailyDetailCardProps) {
  if (!detail) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-center text-gray-500 text-sm py-4">
          暂无数据
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">每日详情</h3>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-700/50 rounded p-3">
          <div className="text-xs text-gray-400">总花费</div>
          <div className="text-xl font-mono text-yellow-400">
            {formatMoney(detail.totalCost, 'CNY')}
          </div>
        </div>

        <div className="bg-gray-700/50 rounded p-3">
          <div className="text-xs text-gray-400">请求次数</div>
          <div className="text-xl font-mono text-blue-400">
            {detail.requestCount.toLocaleString()}
          </div>
        </div>

        <div className="bg-gray-700/50 rounded p-3">
          <div className="text-xs text-gray-400">输入 Token</div>
          <div className="text-lg font-mono text-green-400">
            {formatTokens(detail.inputTokens)}
          </div>
        </div>

        <div className="bg-gray-700/50 rounded p-3">
          <div className="text-xs text-gray-400">输出 Token</div>
          <div className="text-lg font-mono text-purple-400">
            {formatTokens(detail.outputTokens)}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-gray-700">
        <div className="flex justify-between text-xs text-gray-400">
          <span>总 Token</span>
          <span className="font-mono">{detail.totalTokens.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
