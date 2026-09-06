#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod commands;
mod poller;

use models::AppState;
use std::sync::{Arc, Mutex};

fn create_system_tray() -> tauri::SystemTray {
    use tauri::{CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayMenuItem};
    
    let show = CustomMenuItem::new("show".to_string(), "显示主窗口");
    let hide = CustomMenuItem::new("hide".to_string(), "隐藏主窗口");
    let quit = CustomMenuItem::new("quit".to_string(), "退出");
    
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_item(hide)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(quit);
    
    SystemTray::new().with_menu(tray_menu)
}

fn main() {
    // 无 RUST_LOG 时默认输出 info 级日志，便于看到启动/轮询信息
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    
    let (config, config_path) = commands::load_config();
    log::info!("加载配置: {} 个模型 (路径: {})", config.models.len(), config_path.display());
    
    let state = Arc::new(Mutex::new(AppState {
        config,
        usage_data: std::collections::HashMap::new(),
        config_path,
    }));
    
    tauri::Builder::default()
        .manage(state.clone())
        .system_tray(create_system_tray())
        .on_system_tray_event(move |app, event| {
            use tauri::{Manager, SystemTrayEvent};
            
            match event {
                SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                    "show" => {
                        if let Some(window) = app.get_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                },
                _ => {}
            }
        })
        .setup(move |app| {
            // 启动轮询
            let app_handle = app.handle();
            poller::start_polling(app_handle, state.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_models,
            commands::add_model,
            commands::update_model,
            commands::delete_model,
            commands::test_connection,
            commands::get_daily_stats,
            commands::get_all_daily_stats,
            commands::trigger_poll,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}
