use crate::models::*;
use serde_json::Value;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::Manager;

/// 复用同一个 HTTP 客户端：保持连接池与 TLS 会话，避免每次请求重建（P3-4）
fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

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
pub fn append_to_storage(state: &AppState, model: &ModelConfig, record: UsageRecord) {
    if let Err(e) = state.storage.insert_record(
        &model.id,
        &model.provider,
        &model.api_key,
        &record,
    ) {
        log::error!("保存用量记录失败: {}", e);
        let _ = state.storage.log_error("poller", "保存用量记录失败", &e);
    }
}

/// 发送一条 chat 请求并校验状态码（test / poll 共用核心，P2-4）
async fn send_chat_request(config: &ModelConfig, content: &str, max_tokens: u32) -> Result<reqwest::Response, String> {
    let client = http_client();

    let body = serde_json::json!({
        "model": config.provider,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": max_tokens
    });

    log::debug!("发送请求到: {} (模型: {})", config.api_endpoint, config.name);
    
    let response = client
        .post(&config.api_endpoint)
        .header("api-key", &config.api_key)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let error_msg = format!("网络错误: {}", e);
            log::error!("请求失败 [{}]: {}", config.name, error_msg);
            
            // 分析错误类型
            if e.is_timeout() {
                log::error!("可能原因: 网络超时，请检查网络连接");
            } else if e.is_connect() {
                log::error!("可能原因: 无法连接到服务器，请检查:");
                log::error!("  1. API 地址是否正确: {}", config.api_endpoint);
                log::error!("  2. 网络连接是否正常");
                log::error!("  3. 防火墙是否拦截了出站连接");
                log::error!("  4. 代理设置是否正确");
            } else if e.is_request() {
                log::error!("可能原因: 请求构建失败，可能是配置问题");
            }
            
            error_msg
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let error_msg = format!("请求失败 {}: {}", status, text);
        log::error!("API 返回错误 [{}]: {}", config.name, error_msg);
        
        // 分析 HTTP 状态码
        match status.as_u16() {
            401 => log::error!("API Key 无效或已过期"),
            403 => log::error!("访问被拒绝，请检查 API Key 权限"),
            429 => log::error!("请求过于频繁，已触发限流"),
            500..=599 => log::error!("服务器内部错误，请稍后重试"),
            _ => {}
        }
        
        return Err(error_msg);
    }
    
    log::debug!("请求成功 [{}]: {}", config.name, config.api_endpoint);
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
            // 固定节奏：以本轮开始时刻计时，稍后扣除本轮耗时，
            // 避免请求耗时把实际周期越拉越长（P3-1）
            let cycle_start = tokio::time::Instant::now();

            for model in &models {
                match poll_model_usage(model).await {
                    Ok(record) => {
                        {
                            let state = state_clone.lock().unwrap();
                            append_to_storage(&*state, model, record);
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
                        // 记录到数据库
                        {
                            let state = state_clone.lock().unwrap();
                            let _ = state.storage.log_error("poller", &format!("轮询模型 {} 失败", model.name), &e);
                        }
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

            // 周期 = 固定间隔 - 本轮耗时；下限 1s 兜底，避免间隔配置为 0 时空转
            let interval = Duration::from_millis(interval.max(1000));
            tokio::time::sleep(interval.saturating_sub(cycle_start.elapsed())).await;
        }
    });
}
