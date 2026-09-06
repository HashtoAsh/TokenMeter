use crate::models::*;
use crate::poller;
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

/// 解析配置文件路径：
/// 1) 工作目录下 config.json（开发模式：config 放项目根，便于编辑）；
/// 2) exe 所在目录（安装版：跟随可执行文件，不受启动 cwd 影响）。
fn resolve_config_path() -> std::path::PathBuf {
    if let Ok(cwd) = std::env::current_dir() {
        let p = cwd.join("config.json");
        if p.exists() {
            return p;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            return dir.join("config.json");
        }
    }
    std::path::PathBuf::from("config.json")
}

/// 加载配置；返回 (配置, 实际使用的配置文件路径)
pub fn load_config() -> (AppConfig, std::path::PathBuf) {
    let path = resolve_config_path();
    if !path.exists() {
        return (AppConfig::default(), path);
    }
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) => {
            log::error!("读取配置文件失败 ({}): {}", path.display(), e);
            return (AppConfig::default(), path);
        }
    };
    match serde_json::from_str(&content) {
        Ok(cfg) => (cfg, path),
        Err(e) => {
            // 配置损坏：先备份再重置，避免下一次保存用空配置覆盖原文件（数据丢失）
            let bak = std::path::PathBuf::from(format!(
                "{}.bak.{}",
                path.display(),
                chrono::Utc::now().format("%Y%m%d%H%M%S")
            ));
            log::error!("配置解析失败 ({}): {}，已备份为 {}", path.display(), e, bak.display());
            if std::fs::rename(&path, &bak).is_err() {
                log::error!("备份损坏配置失败: {}", path.display());
            }
            (AppConfig::default(), path)
        }
    }
}

/// 保存配置到指定路径
pub fn save_config(config: &AppConfig, path: &std::path::Path) -> Result<(), String> {
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("序列化配置失败: {}", e))?;
    std::fs::write(path, content)
        .map_err(|e| format!("写入配置文件失败 ({}): {}", path.display(), e))?;
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
    save_config(&state.config, &state.config_path)?;
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
        save_config(&state.config, &state.config_path)?;
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
    save_config(&state.config, &state.config_path)?;
    Ok(state.config.models.clone())
}

/// 测试模型连接
#[tauri::command]
pub async fn test_connection(config: ModelConfig) -> Result<String, String> {
    poller::test_model_connection(&config).await
}

/// 汇总一组用量记录为统计值（两个 stats 命令共用，P2-4）
fn compute_stats(records: &[UsageRecord]) -> DailyStats {
    DailyStats {
        input_tokens: records.iter().map(|r| r.input_tokens).sum(),
        output_tokens: records.iter().map(|r| r.output_tokens).sum(),
        total_tokens: records.iter().map(|r| r.total_tokens).sum(),
        request_count: records.len() as u32,
        total_cost: records.iter().map(|r| r.cost).sum(),
    }
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

    Ok(compute_stats(&records))
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
        result.insert(model.id.clone(), compute_stats(&records));
    }

    Ok(result)
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
                // 与自动轮询共用“追加 + 今日裁剪”，保持口径一致
                poller::append_and_prune(&mut *s, &model.id, record);
                drop(s);
                let _ = app.emit_all(
                    "poll-status",
                    serde_json::json!({ "id": model.id, "name": model.name, "ok": true }),
                );
            }
            Err(e) => {
                log::error!("手动轮询模型 {} 失败: {}", model.name, e);
                let _ = app.emit_all(
                    "poll-status",
                    serde_json::json!({ "id": model.id, "name": model.name, "ok": false, "error": e }),
                );
            }
        }
    }

    let _ = app.emit_all("usage-updated", ());
    Ok(())
}
