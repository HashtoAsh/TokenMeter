use serde::{Deserialize, Serialize};

/// 模型配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub id: String,
    pub name: String,
    pub provider: String,
    #[serde(rename = "apiEndpoint")]
    pub api_endpoint: String,
    #[serde(rename = "apiKey")]
    pub api_key: String,
    #[serde(rename = "inputPrice")]
    pub input_price: f64,
    #[serde(rename = "outputPrice")]
    pub output_price: f64,
    pub currency: String,
    #[serde(rename = "responsePath")]
    pub response_path: ResponsePath,
}

/// 响应解析路径配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponsePath {
    #[serde(rename = "inputTokens")]
    pub input_tokens: String,
    #[serde(rename = "outputTokens")]
    pub output_tokens: String,
    #[serde(rename = "totalTokens")]
    pub total_tokens: String,
}

/// 用量记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsageRecord {
    pub timestamp: i64,
    #[serde(rename = "inputTokens")]
    pub input_tokens: u64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: u64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: u64,
    pub cost: f64,
}

/// 今日统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStats {
    #[serde(rename = "inputTokens")]
    pub input_tokens: u64,
    #[serde(rename = "outputTokens")]
    pub output_tokens: u64,
    #[serde(rename = "totalTokens")]
    pub total_tokens: u64,
    #[serde(rename = "requestCount")]
    pub request_count: u32,
    #[serde(rename = "totalCost")]
    pub total_cost: f64,
}

/// 完整配置文件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub models: Vec<ModelConfig>,
    #[serde(rename = "pollingInterval")]
    pub polling_interval: u64,
}

/// 应用状态
#[derive(Debug)]
pub struct AppState {
    pub config: AppConfig,
    pub usage_data: std::collections::HashMap<String, Vec<UsageRecord>>,
    /// 当前配置文件路径（启动时解析一次，读写共用同一路径）
    pub config_path: std::path::PathBuf,
}

impl Default for ResponsePath {
    fn default() -> Self {
        Self {
            input_tokens: "usage.prompt_tokens".to_string(),
            output_tokens: "usage.completion_tokens".to_string(),
            total_tokens: "usage.total_tokens".to_string(),
        }
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            models: Vec::new(),
            // 默认 10 分钟轮询一次（P0-1 语义确认为“本请求用量”，避免轮询过频）
            polling_interval: 600000,
        }
    }
}

impl Default for DailyStats {
    fn default() -> Self {
        Self {
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            request_count: 0,
            total_cost: 0.0,
        }
    }
}
