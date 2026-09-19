// 模型配置
export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  apiEndpoint: string;
  apiKey: string;
  inputPrice: number;
  outputPrice: number;
  currency: string;
  responsePath: {
    inputTokens: string;
    outputTokens: string;
    totalTokens: string;
  };
}

// 今日统计
export interface DailyStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  totalCost: number;
}

// 贴边状态
export type EdgeState = 'docked' | 'hovering' | 'expanded';

// 贴边方向（窗口靠在屏幕哪一侧）
export type DockSide = 'left' | 'right';

// 预设模板
export interface ModelTemplate {
  name: string;
  provider: string;
  apiEndpoint: string;
  inputPrice: number;
  outputPrice: number;
  currency: string;
}

// 预设模板列表
export const MODEL_TEMPLATES: ModelTemplate[] = [
  // ── 国内 ──
  {
    name: 'DeepSeek',
    provider: 'deepseek-chat',
    apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
    inputPrice: 0.001,
    outputPrice: 0.002,
    currency: 'CNY',
  },
  {
    name: 'MiMo',
    provider: 'mimo-v2.5-pro',
    apiEndpoint: 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions',
    inputPrice: 0,
    outputPrice: 0,
    currency: 'CNY',
  },
  {
    name: '通义千问',
    provider: 'qwen-plus',
    apiEndpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    inputPrice: 0.0008,
    outputPrice: 0.002,
    currency: 'CNY',
  },
  {
    name: 'Kimi (Moonshot)',
    provider: 'moonshot-v1-8k',
    apiEndpoint: 'https://api.moonshot.cn/v1/chat/completions',
    inputPrice: 0.000012,
    outputPrice: 0.000012,
    currency: 'CNY',
  },
  {
    name: '智谱 GLM',
    provider: 'glm-4-flash',
    apiEndpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    inputPrice: 0.001,
    outputPrice: 0.001,
    currency: 'CNY',
  },
  {
    name: 'MiniMax',
    provider: 'MiniMax-Text-01',
    apiEndpoint: 'https://api.minimax.chat/v1/chat/completions',
    inputPrice: 0.001,
    outputPrice: 0.001,
    currency: 'CNY',
  },
  // ── 海外 ──
  {
    name: 'ChatGPT',
    provider: 'gpt-4o',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    inputPrice: 0.005,
    outputPrice: 0.015,
    currency: 'USD',
  },
  {
    name: 'OpenRouter',
    provider: 'openai/gpt-4o-mini',
    apiEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    inputPrice: 0.00015,
    outputPrice: 0.0006,
    currency: 'USD',
  },
];
