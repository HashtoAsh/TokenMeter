use crate::models::*;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;

/// 拆分形如 `choices[0]` / `choices` 的路径段：返回 (键名, 数组下标)
fn split_segment(seg: &str) -> (&str, Option<usize>) {
    if let Some(open) = seg.find('[') {
        if seg.ends_with(']') {
            let name = &seg[..open];
            let inner = &seg[open + 1..seg.len() - 1];
            if let Ok(i) = inner.parse::<usize>() {
                return (name, Some(i));
            }
        }
    }
    (seg, None)
}

/// 从JSON中按路径获取值；支持点号 + 数组下标，如 `choices[0].message.usage`、`usage.prompt_tokens`
fn get_value_by_path(value: &Value, path: &str) -> Option<u64> {
    let mut current = value;

    for raw in path.split('.') {
        let seg = raw.trim();
        if seg.is_empty() {
            return None;
        }
        let (name, idx) = split_segment(seg);
        if !name.is_empty() {
            current = current.get(name)?;
        }
        if let Some(i) = idx {
            current = current.get(i)?;
        }
    }

    current.as_u64()
}

/// 本地时区“今日 00:00”的时间戳（用于按天裁剪记录，避免按 UTC 零点切日在东八区错位到早上 8 点）
pub fn today_start_local() -> i64 {
    let now = chrono::Local::now();
    let midnight = now
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .expect("valid midnight")
        .and_local_timezone(chrono::Local)
        .earliest()
        .expect("valid local midnight");
    midnight.timestamp()
}

/// 追加一条用量记录，并只保留“今天（本地时区）”的数据
pub fn append_and_prune(state: &mut AppState, model_id: &str, record: UsageRecord) {
    let records = state.usage_data.entry(model_id.to_string()).or_default();
    records.push(record);
    let start = today_start_local();
    records.retain(|r| r.timestamp >= start);
}

/// 发送一条 chat 请求并校验状态码（test / poll 共用核心，P2-4）
async fn send_chat_request(config: &ModelConfig, content: &str, max_tokens: u32) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": config.provider,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": max_tokens
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
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("请求失败 {}: {}", status, text));
    }
    Ok(response)
}

/// 测试模型连接
pub async fn test_model_connection(config: &ModelConfig) -> Result<String, String> {
    send_chat_request(config, "hi", 5).await?;
    Ok("连接成功".to_string())
}

/// 向指定模型发送测试请求并获取用量
pub async fn poll_model_usage(config: &ModelConfig) -> Result<UsageRecord, String> {
    let response = send_chat_request(config, "count tokens", 10).await?;

    let json: Value = response.json().await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let input_tokens = get_value_by_path(&json, &config.response_path.input_tokens)
        .unwrap_or(0);
    let output_tokens = get_value_by_path(&json, &config.response_path.output_tokens)
        .unwrap_or(0);
    let total_tokens = get_value_by_path(&json, &config.response_path.total_tokens)
        .unwrap_or(input_tokens + output_tokens);

    if input_tokens == 0 && output_tokens == 0 && total_tokens == 0 {
        // P3-5B：解析不到用量时明确告警，避免“假 0”记账误导用户
        log::warn!(
            "模型 {} 的响应中未解析到 usage（配置路径 input={} output={} total={}，请检查是否正确）",
            config.name,
            config.response_path.input_tokens,
            config.response_path.output_tokens,
            config.response_path.total_tokens
        );
    }

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
        // 记录每个模型上次的失败信息：只在“状态变化”时推送，避免每周期重复刷屏
        let mut last_error: std::collections::HashMap<String, String> = std::collections::HashMap::new();

        loop {
            let (models, interval) = {
                let state = state_clone.lock().unwrap();
                (state.config.models.clone(), state.config.polling_interval)
            };

            for model in &models {
                match poll_model_usage(model).await {
                    Ok(record) => {
                        {
                            let mut state = state_clone.lock().unwrap();
                            append_and_prune(&mut *state, &model.id, record);
                        }
                        // 通知前端更新用量
                        let _ = app_handle_clone.emit_all("usage-updated", &model.id);
                        // 由失败恢复为成功 → 推送一次状态恢复
                        if last_error.remove(&model.id).is_some() {
                            let _ = app_handle_clone.emit_all(
                                "poll-status",
                                serde_json::json!({ "id": model.id, "name": model.name, "ok": true }),
                            );
                        }
                    }
                    Err(e) => {
                        log::error!("轮询模型 {} 失败: {}", model.name, e);
                        let changed = match last_error.get(&model.id) {
                            Some(prev) => *prev != e,
                            None => true,
                        };
                        if changed {
                            last_error.insert(model.id.clone(), e.clone());
                            let _ = app_handle_clone.emit_all(
                                "poll-status",
                                serde_json::json!({ "id": model.id, "name": model.name, "ok": false, "error": e }),
                            );
                        }
                    }
                }
            }

            tokio::time::sleep(Duration::from_millis(interval)).await;
        }
    });
}
