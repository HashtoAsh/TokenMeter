# TokenMeter API 设计文档

## 1. 概述

本文档描述了 TokenMeter 与各大模型 API 的交互方式，以及内部 Tauri 命令接口设计。

## 2. 大模型 API 适配

### 2.1 统一适配器模式

为了支持多个大模型服务，我们采用适配器模式，为每个模型提供商实现统一的接口。

```typescript
// src/types/adapter.ts
export interface ModelAdapter {
  /**
   * 解析 API 响应中的 Token 使用信息
   */
  parseUsage(response: any): UsageInfo;
  
  /**
   * 构建监控请求（如果需要主动查询用量）
   */
  buildUsageRequest(config: ModelConfig): RequestConfig;
  
  /**
   * 验证 API 连接和密钥有效性
   */
  validateConnection(config: ModelConfig): Promise<ValidationResult>;
  
  /**
   * 获取模型定价信息
   */
  getPricingInfo(): PricingInfo;
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  model: string;
  requestId?: string;
}

export interface ValidationResult {
  isValid: boolean;
  message: string;
  models?: string[];  // 可用的模型列表
}

export interface PricingInfo {
  inputTokenPrice: number;   // 每 1K tokens 的价格
  outputTokenPrice: number;
  currency: string;
}
```

### 2.2 DeepSeek API 适配器

```typescript
// src/services/adapters/deepseek.ts
import { ModelAdapter, UsageInfo, ValidationResult, PricingInfo } from '../../types/adapter';

export class DeepSeekAdapter implements ModelAdapter {
  private readonly baseUrl = 'https://api.deepseek.com';
  
  parseUsage(response: any): UsageInfo {
    // DeepSeek 响应格式
    // {
    //   "usage": {
    //     "prompt_tokens": 100,
    //     "completion_tokens": 50,
    //     "total_tokens": 150
    //   }
    // }
    
    const usage = response.usage;
    return {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      model: response.model,
      requestId: response.id,
    };
  }
  
  buildUsageRequest(config: ModelConfig) {
    // DeepSeek 目前没有独立的用量查询 API
    // 需要在每次 API 调用时从响应中获取用量
    return {
      url: `${this.baseUrl}/v1/chat/completions`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }
  
  async validateConnection(config: ModelConfig): Promise<ValidationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        return {
          isValid: true,
          message: '连接成功',
          models: data.data?.map((m: any) => m.id) || [],
        };
      } else {
        return {
          isValid: false,
          message: `连接失败: ${response.status}`,
        };
      }
    } catch (error) {
      return {
        isValid: false,
        message: `连接错误: ${(error as Error).message}`,
      };
    }
  }
  
  getPricingInfo(): PricingInfo {
    // DeepSeek V3 定价 (2024年)
    return {
      inputTokenPrice: 0.001,   // ¥0.001 / 1K tokens
      outputTokenPrice: 0.002,  // ¥0.002 / 1K tokens
      currency: 'CNY',
    };
  }
}
```

### 2.3 MiMo API 适配器

```typescript
// src/services/adapters/mimo.ts
import { ModelAdapter, UsageInfo, ValidationResult, PricingInfo } from '../../types/adapter';

export class MiMoAdapter implements ModelAdapter {
  private readonly baseUrl = 'https://api.mimo.com';
  
  parseUsage(response: any): UsageInfo {
    // MiMo 响应格式（示例）
    // {
    //   "usage": {
    //     "prompt_tokens": 100,
    //     "completion_tokens": 50,
    //     "total_tokens": 150
    //   }
    // }
    
    const usage = response.usage;
    return {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      model: response.model,
      requestId: response.id,
    };
  }
  
  buildUsageRequest(config: ModelConfig) {
    return {
      url: `${this.baseUrl}/v1/chat/completions`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }
  
  async validateConnection(config: ModelConfig): Promise<ValidationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        return {
          isValid: true,
          message: '连接成功',
          models: data.data?.map((m: any) => m.id) || [],
        };
      } else {
        return {
          isValid: false,
          message: `连接失败: ${response.status}`,
        };
      }
    } catch (error) {
      return {
        isValid: false,
        message: `连接错误: ${(error as Error).message}`,
      };
    }
  }
  
  getPricingInfo(): PricingInfo {
    // MiMo 定价 (示例)
    return {
      inputTokenPrice: 0.0008,
      outputTokenPrice: 0.0016,
      currency: 'CNY',
    };
  }
}
```

### 2.4 通用 OpenAI 兼容适配器

```typescript
// src/services/adapters/openai-compatible.ts
import { ModelAdapter, UsageInfo, ValidationResult, PricingInfo } from '../../types/adapter';

export class OpenAICompatibleAdapter implements ModelAdapter {
  constructor(
    private baseUrl: string,
    private pricing: PricingInfo
  ) {}
  
  parseUsage(response: any): UsageInfo {
    const usage = response.usage;
    return {
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      model: response.model,
      requestId: response.id,
    };
  }
  
  buildUsageRequest(config: ModelConfig) {
    return {
      url: `${this.baseUrl}/v1/chat/completions`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  }
  
  async validateConnection(config: ModelConfig): Promise<ValidationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        return {
          isValid: true,
          message: '连接成功',
          models: data.data?.map((m: any) => m.id) || [],
        };
      } else {
        return {
          isValid: false,
          message: `连接失败: ${response.status}`,
        };
      }
    } catch (error) {
      return {
        isValid: false,
        message: `连接错误: ${(error as Error).message}`,
      };
    }
  }
  
  getPricingInfo(): PricingInfo {
    return this.pricing;
  }
}
```

## 3. 适配器工厂

```typescript
// src/services/adapterFactory.ts
import { ModelAdapter } from '../types/adapter';
import { DeepSeekAdapter } from './adapters/deepseek';
import { MiMoAdapter } from './adapters/mimo';
import { OpenAICompatibleAdapter } from './adapters/openai-compatible';

export class AdapterFactory {
  private static adapters: Map<string, () => ModelAdapter> = new Map([
    ['deepseek', () => new DeepSeekAdapter()],
    ['mimo', () => new MiMoAdapter()],
    ['openai', () => new OpenAICompatibleAdapter(
      'https://api.openai.com',
      { inputTokenPrice: 0.01, outputTokenPrice: 0.03, currency: 'USD' }
    )],
  ]);
  
  static registerAdapter(provider: string, factory: () => ModelAdapter): void {
    this.adapters.set(provider.toLowerCase(), factory);
  }
  
  static getAdapter(provider: string): ModelAdapter {
    const factory = this.adapters.get(provider.toLowerCase());
    if (!factory) {
      throw new Error(`未找到适配器: ${provider}`);
    }
    return factory();
  }
  
  static getSupportedProviders(): string[] {
    return Array.from(this.adapters.keys());
  }
}
```

## 4. Tauri 命令接口

### 4.1 模型管理命令

```rust
// src-tauri/src/commands/model.rs
use tauri::command;
use crate::db::Database;
use crate::models::ModelConfig;

#[command]
pub async fn get_models(db: tauri::State<'_, Database>) -> Result<Vec<ModelConfig>, String> {
    db.get_all_models().map_err(|e| e.to_string())
}

#[command]
pub async fn add_model(
    db: tauri::State<'_, Database>,
    model: ModelConfig,
) -> Result<ModelConfig, String> {
    db.insert_model(&model).map_err(|e| e.to_string())?;
    Ok(model)
}

#[command]
pub async fn update_model(
    db: tauri::State<'_, Database>,
    id: String,
    updates: serde_json::Value,
) -> Result<ModelConfig, String> {
    db.update_model(&id, &updates).map_err(|e| e.to_string())
}

#[command]
pub async fn delete_model(
    db: tauri::State<'_, Database>,
    id: String,
) -> Result<(), String> {
    db.delete_model(&id).map_err(|e| e.to_string())
}

#[command]
pub async fn test_model_connection(
    provider: String,
    api_endpoint: String,
    api_key: String,
) -> Result<ValidationResult, String> {
    // 调用对应的适配器进行连接测试
    let adapter = AdapterFactory::get_adapter(&provider);
    let config = ModelConfig {
        api_endpoint,
        api_key,
        ..Default::default()
    };
    
    adapter.validate_connection(&config).await.map_err(|e| e.to_string())
}
```

### 4.2 用量统计命令

```rust
// src-tauri/src/commands/usage.rs
use tauri::command;
use crate::db::Database;
use crate::models::{UsageRecord, UsageStats};

#[command]
pub async fn get_usage_records(
    db: tauri::State<'_, Database>,
    model_id: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<UsageRecord>, String> {
    db.get_usage_records(model_id, start_date, end_date, limit)
        .map_err(|e| e.to_string())
}

#[command]
pub async fn get_usage_stats(
    db: tauri::State<'_, Database>,
    model_id: String,
    period: String,  // "day", "week", "month"
) -> Result<UsageStats, String> {
    db.get_usage_stats(&model_id, &period).map_err(|e| e.to_string())
}

#[command]
pub async fn get_total_cost(
    db: tauri::State<'_, Database>,
    start_date: String,
    end_date: String,
) -> Result<f64, String> {
    db.get_total_cost(&start_date, &end_date).map_err(|e| e.to_string())
}

#[command]
pub async fn record_usage(
    db: tauri::State<'_, Database>,
    record: UsageRecord,
) -> Result<(), String> {
    db.insert_usage_record(&record).map_err(|e| e.to_string())
}
```

### 4.3 配置命令

```rust
// src-tauri/src/commands/config.rs
use tauri::command;
use crate::models::AppConfig;

#[command]
pub async fn get_config() -> Result<AppConfig, String> {
    // 从配置文件读取
    AppConfig::load().map_err(|e| e.to_string())
}

#[command]
pub async fn update_config(config: AppConfig) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())
}

#[command]
pub async fn export_data(
    db: tauri::State<'_, Database>,
    format: String,  // "json", "csv"
    path: String,
) -> Result<(), String> {
    match format.as_str() {
        "json" => db.export_to_json(&path).map_err(|e| e.to_string()),
        "csv" => db.export_to_csv(&path).map_err(|e| e.to_string()),
        _ => Err("不支持的导出格式".to_string()),
    }
}
```

## 5. HTTP 请求拦截

### 5.1 系统代理拦截（推荐）

使用系统代理设置，拦截所有 HTTP 请求：

```rust
// src-tauri/src/proxy/mod.rs
use std::sync::Mutex;
use crate::db::Database;
use crate::services::AdapterFactory;

pub struct ProxyServer {
    db: Database,
    port: u16,
}

impl ProxyServer {
    pub fn new(db: Database, port: u16) -> Self {
        Self { db, port }
    }
    
    pub async fn start(&self) -> Result<(), Box<dyn std::error::Error>> {
        // 启动本地代理服务器
        // 拦截对已配置模型 API 的请求
        // 解析响应中的 usage 信息
        // 存储到数据库
        Ok(())
    }
    
    fn should_intercept(&self, url: &str) -> bool {
        // 检查 URL 是否匹配已配置的模型 API
        let models = self.db.get_active_models().unwrap_or_default();
        models.iter().any(|m| url.contains(&m.api_endpoint))
    }
    
    fn parse_response(&self, provider: &str, response: &str) -> Option<UsageInfo> {
        let adapter = AdapterFactory::get_adapter(provider).ok()?;
        let json: serde_json::Value = serde_json::from_str(response).ok()?;
        Some(adapter.parse_usage(&json))
    }
}
```

### 5.2 API 调用监听（替代方案）

通过监听特定端口或使用浏览器扩展来捕获 API 调用。

## 6. 数据格式

### 6.1 前端请求格式

```typescript
// 获取模型列表
const models = await invoke<ModelConfig[]>('get_models');

// 添加模型
const newModel = await invoke<ModelConfig>('add_model', {
  model: {
    name: 'DeepSeek V3',
    provider: 'deepseek',
    apiEndpoint: 'https://api.deepseek.com',
    apiKey: 'sk-...',
    pricing: {
      inputTokenPrice: 0.001,
      outputTokenPrice: 0.002,
      currency: 'CNY',
    },
    isActive: true,
  },
});

// 获取用量统计
const stats = await invoke<UsageStats>('get_usage_stats', {
  modelId: 'model-123',
  period: 'day',
});
```

### 6.2 数据库记录格式

```json
{
  "id": "uuid-v4",
  "modelId": "model-123",
  "timestamp": "2026-09-06T12:00:00Z",
  "inputTokens": 150,
  "outputTokens": 80,
  "totalTokens": 230,
  "cost": 0.00031,
  "requestId": "req-abc123",
  "metadata": {
    "endpoint": "/v1/chat/completions",
    "model": "deepseek-v3",
    "latency": 1200
  }
}
```

## 7. 错误处理

### 7.1 错误类型定义

```typescript
// src/types/errors.ts
export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: any;
  timestamp: Date;
}
```

### 7.2 错误处理策略

```typescript
// src/utils/errorHandler.ts
export class ErrorHandler {
  static handle(error: AppError): void {
    console.error(`[${error.code}] ${error.message}`, error.details);
    
    switch (error.code) {
      case ErrorCode.AUTH_ERROR:
        // 通知用户检查 API 密钥
        this.notifyUser('API 认证失败，请检查密钥设置');
        break;
      case ErrorCode.RATE_LIMIT:
        // 实施退避策略
        this.implementBackoff();
        break;
      case ErrorCode.NETWORK_ERROR:
        // 重试或提示网络问题
        this.retryOrNotify(error);
        break;
      default:
        // 记录日志，继续运行
        break;
    }
  }
  
  private static notifyUser(message: string): void {
    // 发送系统通知
  }
  
  private static implementBackoff(): void {
    // 指数退避策略
  }
  
  private static retryOrNotify(error: AppError): void {
    // 重试逻辑
  }
}
```

## 8. 安全考虑

### 8.1 API 密钥存储

使用系统密钥链安全存储 API 密钥：

```rust
// src-tauri/src/security/keychain.rs
use keyring::Entry;

pub struct KeychainManager {
    service: String,
}

impl KeychainManager {
    pub fn new() -> Self {
        Self {
            service: "TokenMeter".to_string(),
        }
    }
    
    pub fn store_key(&self, model_id: &str, api_key: &str) -> Result<(), keyring::Error> {
        let entry = Entry::new(&self.service, model_id)?;
        entry.set_password(api_key)
    }
    
    pub fn get_key(&self, model_id: &str) -> Result<String, keyring::Error> {
        let entry = Entry::new(&self.service, model_id)?;
        entry.get_password()
    }
    
    pub fn delete_key(&self, model_id: &str) -> Result<(), keyring::Error> {
        let entry = Entry::new(&self.service, model_id)?;
        entry.delete_password()
    }
}
```

### 8.2 数据加密

敏感数据（如 API 密钥）在数据库中加密存储：

```rust
// src-tauri/src/security/encryption.rs
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};

pub struct EncryptionManager {
    cipher: Aes256Gcm,
}

impl EncryptionManager {
    pub fn new(key: &[u8; 32]) -> Self {
        let cipher = Aes256Gcm::new(key.into());
        Self { cipher }
    }
    
    pub fn encrypt(&self, plaintext: &str) -> Result<String, Box<dyn std::error::Error>> {
        let nonce = Nonce::from_slice(b"unique nonce"); // 12 bytes
        let ciphertext = self.cipher.encrypt(nonce, plaintext.as_bytes())?;
        Ok(base64::encode(&ciphertext))
    }
    
    pub fn decrypt(&self, ciphertext: &str) -> Result<String, Box<dyn std::error::Error>> {
        let nonce = Nonce::from_slice(b"unique nonce");
        let ciphertext_bytes = base64::decode(ciphertext)?;
        let plaintext = self.cipher.decrypt(nonce, ciphertext_bytes.as_ref())?;
        Ok(String::from_utf8(plaintext)?)
    }
}
```

---

**文档版本**：v1.0  
**创建日期**：2026年9月6日  
**最后更新**：2026年9月6日