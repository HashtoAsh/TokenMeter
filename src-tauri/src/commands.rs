use crate::models::*;
use crate::poller;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

/// 获取配置文件路径
fn get_config_path() -> std::path::PathBuf {
    let mut path = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
    path.push("config.json");
    path
}

/// 加载配置
pub fn load_config() -> AppConfig {
    let path = get_config_path();
    if path.exists() {
        let content = std::fs::read_to_string(&path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        AppConfig::default()
    }
}

/// 保存配置
pub fn save_config(config: &AppConfig) -> Result<(), String> {
    let path = get_config_path();
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("写入配置文件失败: {}", e))?;
    Ok(())
}

/// 获取所有模型配置
#[tauri::command]
pub fn get_models(state: State<'_, Arc<Mutex<AppState>>>) -> Result<Vec<ModelConfig>, String> {
    let state = state.lock().unwrap();
    Ok(state.config.models.clone())
}

/// 添加模型
#[tauri::command]
pub fn add_model(
    state: State<'_, Arc<Mutex<AppState>>>,
    model: ModelConfig,
) -> Result<Vec<ModelConfig>, String> {
    let mut state = state.lock().unwrap();
    
    // 检查ID是否重复
    if state.config.models.iter().any(|m| m.id == model.id) {
        return Err("模型ID已存在".to_string());
    }
    
    state.config.models.push(model);
    save_config(&state.config)?;
    Ok(state.config.models.clone())
}

/// 更新模型
#[tauri::command]
pub fn update_model(
    state: State<'_, Arc<Mutex<AppState>>>,
    model: ModelConfig,
) -> Result<Vec<ModelConfig>, String> {
    let mut state = state.lock().unwrap();
    
    if let Some(index) = state.config.models.iter().position(|m| m.id == model.id) {
        state.config.models[index] = model;
        save_config(&state.config)?;
        Ok(state.config.models.clone())
    } else {
        Err("模型不存在".to_string())
    }
}

/// 删除模型
#[tauri::command]
pub fn delete_model(
    state: State<'_, Arc<Mutex<AppState>>>,
    id: String,
) -> Result<Vec<ModelConfig>, String> {
    let mut state = state.lock().unwrap();
    state.config.models.retain(|m| m.id != id);
    state.usage_data.remove(&id);
    save_config(&state.config)?;
    Ok(state.config.models.clone())
}

/// 测试模型连接
#[tauri::command]
pub async fn test_connection(config: ModelConfig) -> Result<String, String> {
    poller::test_model_connection(&config).await
}

/// 获取模型今日统计
#[tauri::command]
pub fn get_daily_stats(
    state: State<'_, Arc<Mutex<AppState>>>,
    model_id: String,
) -> Result<DailyStats, String> {
    let state = state.lock().unwrap();
    
    let records = state.usage_data.get(&model_id)
        .cloned()
        .unwrap_or_default();
    
    let stats = DailyStats {
        input_tokens: records.iter().map(|r| r.input_tokens).sum(),
        output_tokens: records.iter().map(|r| r.output_tokens).sum(),
        total_tokens: records.iter().map(|r| r.total_tokens).sum(),
        request_count: records.len() as u32,
        total_cost: records.iter().map(|r| r.cost).sum(),
    };
    
    Ok(stats)
}

/// 获取所有模型的今日统计
#[tauri::command]
pub fn get_all_daily_stats(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<std::collections::HashMap<String, DailyStats>, String> {
    let state = state.lock().unwrap();
    let mut result = std::collections::HashMap::new();
    
    for model in &state.config.models {
        let records = state.usage_data.get(&model.id)
            .cloned()
            .unwrap_or_default();
        
        let stats = DailyStats {
            input_tokens: records.iter().map(|r| r.input_tokens).sum(),
            output_tokens: records.iter().map(|r| r.output_tokens).sum(),
            total_tokens: records.iter().map(|r| r.total_tokens).sum(),
            request_count: records.len() as u32,
            total_cost: records.iter().map(|r| r.cost).sum(),
        };
        
        result.insert(model.id.clone(), stats);
    }
    
    Ok(result)
}

/// 获取窗口配置
#[tauri::command]
pub fn get_window_config(state: State<'_, Arc<Mutex<AppState>>>) -> Result<WindowConfig, String> {
    let state = state.lock().unwrap();
    Ok(state.config.window.clone())
}

/// 更新窗口配置
#[tauri::command]
pub fn update_window_config(
    state: State<'_, Arc<Mutex<AppState>>>,
    config: WindowConfig,
) -> Result<(), String> {
    let mut state = state.lock().unwrap();
    state.config.window = config;
    save_config(&state.config)?;
    Ok(())
}

/// 更新轮询间隔
#[tauri::command]
pub fn update_polling_interval(
    state: State<'_, Arc<Mutex<AppState>>>,
    interval: u64,
) -> Result<(), String> {
    let mut state = state.lock().unwrap();
    state.config.polling_interval = interval;
    save_config(&state.config)?;
    Ok(())
}

/// 手动触发轮询
#[tauri::command]
pub async fn trigger_poll(
    state: State<'_, Arc<Mutex<AppState>>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let models = {
        let s = state.lock().unwrap();
        s.config.models.clone()
    };

    for model in &models {
        match poller::poll_model_usage(model).await {
            Ok(record) => {
                let mut s = state.lock().unwrap();
                let records = s.usage_data.entry(model.id.clone()).or_default();
                records.push(record);
            }
            Err(e) => {
                log::error!("手动轮询模型 {} 失败: {}", model.name, e);
            }
        }
    }

    let _ = app.emit_all("usage-updated", ());
    Ok(())
}
