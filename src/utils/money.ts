// 金额符号与展示工具（按模型币种渲染，不再硬编码 ¥）
export const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
};

export function currencySymbol(currency?: string): string {
  if (!currency) return '¥';
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
}

export function formatMoney(cost: number, currency?: string): string {
  const n = Number.isFinite(cost) ? cost : 0;
  return `${currencySymbol(currency)}${n.toFixed(4)}`;
}

// 格式化 token 数量
export function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return (tokens / 1000000).toFixed(1) + 'M';
  }
  if (tokens >= 1000) {
    return (tokens / 1000).toFixed(1) + 'K';
  }
  return tokens.toString();
}
