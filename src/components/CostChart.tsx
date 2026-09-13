interface DailyCost {
  date: string;
  cost: number;
}

interface CostChartProps {
  data: DailyCost[];
}

export default function CostChart({ data }: CostChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">花费趋势</h3>
        <div className="text-center text-gray-500 text-sm py-4">
          暂无数据
        </div>
      </div>
    );
  }

  // 计算最大值用于归一化
  const maxCost = Math.max(...data.map(d => d.cost), 0.01);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">近7天花费趋势</h3>
      
      <div className="flex items-end justify-between h-24 gap-1">
        {data.map((item, index) => {
          const height = Math.max((item.cost / maxCost) * 100, 4); // 最小4%高度
          
          return (
            <div
              key={index}
              className="flex flex-col items-center flex-1"
            >
              <div className="text-[10px] text-gray-400 mb-1">
                ¥{item.cost.toFixed(2)}
              </div>
              <div
                className="w-full bg-blue-500 rounded-t"
                style={{ height: `${height}%` }}
              />
              <div className="text-[10px] text-gray-500 mt-1">
                {item.date}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
