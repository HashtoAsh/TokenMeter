import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900/95 text-white">
          <div className="text-center max-w-md p-6">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-lg font-medium mb-2">应用出现错误</h2>
            <p className="text-sm text-gray-400 mb-4">
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <button
              onClick={this.handleReload}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm"
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}