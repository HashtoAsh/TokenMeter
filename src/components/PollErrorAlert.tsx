import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';

interface PollError {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
}

export default function PollErrorAlert() {
  const [errors, setErrors] = useState<PollError[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unlisten = listen<PollError>('poll-status', (event) => {
      const payload = event.payload;
      if (payload && !payload.ok && payload.error) {
        // 只显示新错误，已忽略的不显示
        const errorKey = `${payload.id}-${payload.error}`;
        if (!dismissed.has(errorKey)) {
          setErrors(prev => {
            // 避免重复添加
            if (prev.some(e => e.id === payload.id && e.error === payload.error)) {
              return prev;
            }
            return [...prev, payload];
          });
        }
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [dismissed]);

  const handleDismiss = (error: PollError) => {
    const errorKey = `${error.id}-${error.error}`;
    setDismissed(prev => new Set([...prev, errorKey]));
    setErrors(prev => prev.filter(e => e !== error));
  };

  const handleDismissAll = () => {
    setErrors([]);
  };

  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {errors.map((error, index) => (
        <div
          key={`${error.id}-${index}`}
          className="bg-red-900/90 backdrop-blur-sm border border-red-700 rounded-lg p-4 shadow-lg animate-slide-in"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <div>
                <div className="text-sm font-medium text-red-200">轮询异常</div>
                <div className="text-xs text-red-300 mt-1">
                  模型：{error.name}
                </div>
              </div>
            </div>
            <button
              onClick={() => handleDismiss(error)}
              className="text-red-400 hover:text-red-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="mt-2 text-xs text-red-200 bg-red-800/50 rounded p-2">
            {error.error}
          </div>
          
          <div className="mt-3 text-[10px] text-red-300">
            请检查：<br />
            1. API Key 是否有效<br />
            2. 账户余额是否充足<br />
            3. 网络连接是否正常
          </div>
          
          <button
            onClick={() => handleDismiss(error)}
            className="mt-2 w-full px-3 py-1.5 text-xs bg-red-700 hover:bg-red-600 rounded text-red-100"
          >
            知道了
          </button>
        </div>
      ))}
      
      {errors.length > 1 && (
        <button
          onClick={handleDismissAll}
          className="w-full px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
        >
          全部忽略
        </button>
      )}
    </div>
  );
}
