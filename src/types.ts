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
    name: 'ChatGPT',
    provider: 'gpt-4o',
    apiEndpoint: 'https://api.openai.com/v1/chat/completions',
    inputPrice: 0.005,
    outputPrice: 0.015,
    currency: 'USD',
  },
];
