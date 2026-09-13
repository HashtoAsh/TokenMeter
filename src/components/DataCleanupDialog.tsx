import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

interface CleanupStats {
  recordCount: number;
  totalCost: number;
  cutoffDate: string;
}

export default function DataCleanupDialog() {
  const [stats, setStats] = useState<CleanupStats | null>(null);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    checkCleanupNeeded();
  }, []);

  const checkCleanupNeeded = async () => {
    try {
      const cleanupStats = await invoke<CleanupStats>('get_cleanup_stats');
      if (cleanupStats.recordCount > 0) {
        setStats(cleanupStats);
        setShow(true);
      }
    } catch (e) {
      console.error('检查清理状态失败:', e);
    }
  };

  const handleExport = async () => {
    if (!stats) return;
    
    setExporting(true);
    try {
      // 解析截止日期的年月
      const date = new Date(stats.cutoffDate);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      
      const csv = await invoke<string>('export_month_csv', { year, month });
      
      // 创建下载链接
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `token-meter-${year}${month.toString().padStart(2, '0')}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('导出失败:', e);
      alert('导出失败: ' + e);
    } finally {
      setExporting(false);
    }
  };

  const handleCleanup = async () => {
    setLoading(true);
    try {
      const deletedCount = await invoke<number>('cleanup_old_data');
      alert(`已清理 ${deletedCount} 条旧数据`);
      setShow(false);
    } catch (e) {
      console.error('清理失败:', e);
      alert('清理失败: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    setShow(false);
  };

  if (!show || !stats) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4">
        <div className="flex items-center gap-3 mb-4">
          <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <h3 className="text-lg font-semibold text-white">数据清理提醒</h3>
        </div>
        
        <div className="text-sm text-gray-300 space-y-2 mb-4">
          <p>
            检测到 <span className="text-yellow-400">{stats.cutoffDate}</span> 之前的用量数据：
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-400">
            <li>记录数量：<span className="text-white">{stats.recordCount.toLocaleString()}</span> 条</li>
            <li>总花费：<span className="text-white">¥{stats.totalCost.toFixed(2)}</span></li>
          </ul>
          <p className="text-xs text-gray-500 mt-2">
            TokenMeter 保留近 3 个月数据，旧数据将被清理以节省存储空间。
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-50"
          >
            {exporting ? '导出中...' : '导出 CSV 保存'}
          </button>
          
          <button
            onClick={handleCleanup}
            disabled={loading}
            className="w-full px-4 py-2 text-sm bg-red-600 hover:bg-red-500 rounded text-white disabled:opacity-50"
          >
            {loading ? '清理中...' : '直接清理'}
          </button>
          
          <button
            onClick={handleSkip}
            className="w-full px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
          >
            稍后提醒
          </button>
        </div>
      </div>
    </div>
  );
}
