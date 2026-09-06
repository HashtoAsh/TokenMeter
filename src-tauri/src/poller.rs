use crate::models::*;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;

/// 从JSON中按路径获取值
fn get_value_by_path(value: &Value, path: &str) -> Option<u64> {
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = value;
    
    for part in parts {
        current = current.get(part)?;
    }
    
    current.as_u64()
}

/// 测试模型连接
pub async fn test_model_connection(config: &ModelConfig) -> Result<String, String> {
    let client = reqwest::Client::new();
    
    let body = serde_json::json!({
        "model": config.provider,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5
    });
    
    let response = client
        .post(&config.api_endpoint)
        .header("api-key", &config.api_key)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("网络错误: {}", e))?;
    
    if response.status().is_success() {
        Ok("连接成功".to_string())
    } else {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        Err(format!("请求失败 {}: {}", status, text))
    }
}

/// 向指定模型发送测试请求并获取用量
pub async fn poll_model_usage(config: &ModelConfig) -> Result<UsageRecord, String> {
    let client = reqwest::Client::new();
    
    let body = serde_json::json!({
        "model": config.provider,
        "messages": [{"role": "user", "content": "count tokens"}],
        "max_tokens": 10
    });
    
    let response = client
        .post(&config.api_endpoint)
        .header("api-key", &config.api_key)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("网络错误: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("请求失败: {}", response.status()));
    }
    
    let json: Value = response.json().await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    let input_tokens = get_value_by_path(&json, &config.response_path.input_tokens)
        .unwrap_or(0);
    let output_tokens = get_value_by_path(&json, &config.response_path.output_tokens)
        .unwrap_or(0);
    let total_tokens = get_value_by_path(&json, &config.response_path.total_tokens)
        .unwrap_or(input_tokens + output_tokens);
    
    let cost = (input_tokens as f64 / 1000.0 * config.input_price) 
             + (output_tokens as f64 / 1000.0 * config.output_price);
    
    Ok(UsageRecord {
        timestamp: chrono::Utc::now().timestamp(),
        input_tokens,
        output_tokens,
        total_tokens,
        cost,
    })
}

/// 启动轮询任务
pub fn start_polling(app_handle: tauri::AppHandle, state: Arc<Mutex<AppState>>) {
    let state_clone = state.clone();
    let app_handle_clone = app_handle.clone();
    
    tauri::async_runtime::spawn(async move {
        loop {
            let (models, interval) = {
                let state = state_clone.lock().unwrap();
                (state.config.models.clone(), state.config.polling_interval)
            };
            
            for model in &models {
                match poll_model_usage(model).await {
                    Ok(record) => {
                        let mut state = state_clone.lock().unwrap();
                        let records = state.usage_data.entry(model.id.clone()).or_insert_with(Vec::new);
                        records.push(record);
                        
                        // 只保留今天的记录
                        let today_start = chrono::Utc::now()
                            .date_naive()
                            .and_hms_opt(0, 0, 0)
                            .unwrap()
                            .and_utc()
                            .timestamp();
                        records.retain(|r| r.timestamp >= today_start);
                        
                        // 通知前端更新
                        let _ = app_handle_clone.emit_all("usage-updated", &model.id);
                    }
                    Err(e) => {
                        log::error!("轮询模型 {} 失败: {}", model.name, e);
                    }
                }
            }
            
            tokio::time::sleep(Duration::from_millis(interval)).await;
        }
    });
}
