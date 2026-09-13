interface DatePickerProps {
  date: string;
  onChange: (date: string) => void;
}

export default function DatePicker({ date, onChange }: DatePickerProps) {
  const handlePrevDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    onChange(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    const today = new Date();
    if (d <= today) {
      onChange(d.toISOString().split('T')[0]);
    }
  };

  const handleToday = () => {
    onChange(new Date().toISOString().split('T')[0]);
  };

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });
  };

  return (
    <div className="flex items-center justify-between">
      <button
        onClick={handlePrevDay}
        className="p-2 rounded hover:bg-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{formatDate(date)}</span>
        <button
          onClick={handleToday}
          className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-gray-700"
        >
          今天
        </button>
      </div>

      <button
        onClick={handleNextDay}
        className="p-2 rounded hover:bg-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
