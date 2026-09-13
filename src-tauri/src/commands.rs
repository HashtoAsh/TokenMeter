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
    log::info!("尝试加载配置文件: {}", path.display());
    
    if !path.exists() {
        log::warn!("配置文件不存在，使用默认配置: {}", path.display());
        return (AppConfig::default(), path);
    }
    
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => {
            log::info!("配置文件读取成功，大小: {} bytes", c.len());
            c
        }
        Err(e) => {
            log::error!("读取配置文件失败 ({}): {}", path.display(), e);
            // 记录可能的权限问题
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                log::error!("权限被拒绝，请检查文件权限或杀毒软件拦截");
            }
            return (AppConfig::default(), path);
        }
    };
    
    match serde_json::from_str::<AppConfig>(&content) {
        Ok(cfg) => {
            log::info!("配置解析成功，模型数量: {}", cfg.models.len());
            (cfg, path)
        }
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
    // usage_data removed - using SQLite storage
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
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    
    let detail = state.storage.query_daily_detail("model", Some(&model_id), &today)?;
    
    Ok(DailyStats {
        input_tokens: detail.input_tokens,
        output_tokens: detail.output_tokens,
        total_tokens: detail.total_tokens,
        request_count: detail.request_count,
        total_cost: detail.total_cost,
    })
}

/// 获取所有模型的今日统计
#[tauri::command]
pub fn get_all_daily_stats(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<std::collections::HashMap<String, DailyStats>, String> {
    let state = state.lock().unwrap();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut result = std::collections::HashMap::new();

    for model in &state.config.models {
        if let Ok(detail) = state.storage.query_daily_detail("model", Some(&model.id), &today) {
            result.insert(model.id.clone(), DailyStats {
                input_tokens: detail.input_tokens,
                output_tokens: detail.output_tokens,
                total_tokens: detail.total_tokens,
                request_count: detail.request_count,
                total_cost: detail.total_cost,
            });
        }
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
                let s = state.lock().unwrap();
                // 与自动轮询共用“追加 + 今日裁剪”，保持口径一致
                poller::append_to_storage(&*s, model, record);
                drop(s);
                let _ = app.emit_all(
                    "poll-status",
                    serde_json::json!({ "id": model.id, "name": model.name, "ok": true }),
                );
            }
            Err(e) => {
                log::error!("手动轮询模型 {} 失败: {}", model.name, e);
                // 记录到数据库
                {
                    let s = state.lock().unwrap();
                    let _ = s.storage.log_error("commands", &format!("手动轮询模型 {} 失败", model.name), &e);
                }
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

// ========== 历史查询命令 ==========

/// 查询用量详情（按维度）
#[tauri::command]
pub fn query_usage_detail(
    state: State<'_, Arc<Mutex<AppState>>>,
    params: QueryParams,
) -> Result<DailyDetail, String> {
    let state = state.lock().unwrap();
    state.storage.query_daily_detail(
        &params.dimension,
        params.filter.as_deref(),
        &params.date,
    )
}

/// 获取近N天的每日花费
#[tauri::command]
pub fn get_daily_costs(
    state: State<'_, Arc<Mutex<AppState>>>,
    dimension: String,
    filter: Option<String>,
    days: u32,
) -> Result<Vec<DailyCost>, String> {
    let state = state.lock().unwrap();
    state.storage.get_daily_costs(&dimension, filter.as_deref(), days)
}

/// 获取 API Key 列表
#[tauri::command]
pub fn get_api_key_list(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<Vec<ApiKeyInfo>, String> {
    let state = state.lock().unwrap();
    state.storage.get_api_key_list()
}

/// 获取指定日期的请求记录列表
#[tauri::command]
pub fn get_daily_records(
    state: State<'_, Arc<Mutex<AppState>>>,
    dimension: String,
    filter: Option<String>,
    date: String,
    show_ignored: bool,
) -> Result<Vec<RecordItem>, String> {
    let state = state.lock().unwrap();
    state.storage.get_daily_records(&dimension, filter.as_deref(), &date, show_ignored)
}

/// 忽略记录
#[tauri::command]
pub fn ignore_record(
    state: State<'_, Arc<Mutex<AppState>>>,
    record_id: i64,
) -> Result<(), String> {
    let state = state.lock().unwrap();
    state.storage.ignore_record(record_id)
}

/// 取消忽略记录
#[tauri::command]
pub fn unignore_record(
    state: State<'_, Arc<Mutex<AppState>>>,
    record_id: i64,
) -> Result<(), String> {
    let state = state.lock().unwrap();
    state.storage.unignore_record(record_id)
}

// ========== 日志相关命令 ==========

/// 获取最近的日志
#[tauri::command]
pub fn get_recent_logs(
    state: State<'_, Arc<Mutex<AppState>>>,
    limit: u32,
) -> Result<Vec<DebugLog>, String> {
    let state = state.lock().unwrap();
    state.storage.get_recent_logs(limit)
}

/// 按级别获取日志
#[tauri::command]
pub fn get_logs_by_level(
    state: State<'_, Arc<Mutex<AppState>>>,
    level: String,
    limit: u32,
) -> Result<Vec<DebugLog>, String> {
    let state = state.lock().unwrap();
    state.storage.get_logs_by_level(&level, limit)
}

/// 获取日志统计
#[tauri::command]
pub fn get_log_stats(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<LogStats, String> {
    let state = state.lock().unwrap();
    state.storage.get_log_stats()
}

// ========== 自启动控制命令 ==========

// Manual autostart implementation using Windows Registry
// Registry key: HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run
const AUTOSTART_REG_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const AUTOSTART_APP_NAME: &str = "TokenMeter";

/// Get the path to the current executable
fn get_exe_path() -> Result<String, String> {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("获取程序路径失败: {}", e))
}

/// 检查自启动状态（Windows Registry）
#[tauri::command]
pub fn is_autostart_enabled() -> Result<bool, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu.open_subkey_with_flags(AUTOSTART_REG_KEY, KEY_READ)
        .map_err(|e| format!("打开注册表失败: {}", e))?;
    
    match run_key.get_value::<String, _>(AUTOSTART_APP_NAME) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// 启用自启动（添加到 Windows Registry）
#[tauri::command]
pub fn enable_autostart() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let exe_path = get_exe_path()?;
    
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (run_key, _) = hkcu.create_subkey(AUTOSTART_REG_KEY)
        .map_err(|e| format!("打开注册表失败: {}", e))?;
    
    run_key.set_value(AUTOSTART_APP_NAME, &exe_path)
        .map_err(|e| {
            let error_msg = format!("写入注册表失败: {}", e);
            log::error!("{}", error_msg);
            
            if e.to_string().contains("permission") || e.to_string().contains("access") {
                log::error!("可能原因: 注册表写入权限被拒绝");
                log::error!("  1. 以管理员身份运行程序");
                log::error!("  2. 检查杀毒软件是否拦截注册表修改");
            }
            
            error_msg
        })?;
    
    log::info!("已启用自启动: {}", exe_path);
    Ok(())
}

/// 禁用自启动（从 Windows Registry 删除）
#[tauri::command]
pub fn disable_autostart() -> Result<(), String> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let run_key = hkcu.open_subkey_with_flags(AUTOSTART_REG_KEY, KEY_WRITE)
        .map_err(|e| format!("打开注册表失败: {}", e))?;
    
    match run_key.delete_value(AUTOSTART_APP_NAME) {
        Ok(_) => {
            log::info!("已禁用自启动");
            Ok(())
        }
        Err(e) => {
            // If the key doesn't exist, that's fine
            if e.to_string().contains("not found") || e.to_string().contains("找不到") {
                log::info!("自启动未启用，无需禁用");
                Ok(())
            } else {
                let error_msg = format!("删除注册表项失败: {}", e);
                log::error!("{}", error_msg);
                Err(error_msg)
            }
        }
    }
}

// ========== 数据清理命令 ==========

/// 获取清理统计
#[tauri::command]
pub fn get_cleanup_stats(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<CleanupStats, String> {
    let state = state.lock().unwrap();
    state.storage.get_cleanup_stats(3) // 保留3个月
}

/// 导出指定月份的 CSV
#[tauri::command]
pub fn export_month_csv(
    state: State<'_, Arc<Mutex<AppState>>>,
    year: i32,
    month: u32,
) -> Result<String, String> {
    let state = state.lock().unwrap();
    state.storage.export_month_csv(year, month)
}

/// 清理旧数据
#[tauri::command]
pub fn cleanup_old_data(
    state: State<'_, Arc<Mutex<AppState>>>,
) -> Result<usize, String> {
    let state = state.lock().unwrap();
    let stats = state.storage.get_cleanup_stats(3)?;
    state.storage.cleanup_before(&stats.cutoff_date)
}