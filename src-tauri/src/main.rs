#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod commands;
mod poller;
mod storage;
mod crypto;

use models::AppState;
use storage::Storage;
use single_instance::SingleInstance;
use std::sync::{Arc, Mutex};
use tauri::Manager;
// autostart plugin removed - using manual Windows registry implementation

#[cfg(target_os = "windows")]
mod win32 {
    pub type Handle = *mut std::ffi::c_void;

    pub const EVENT_MODIFY_STATE: u32 = 0x0002;
    pub const INFINITE: u32 = 0xFFFFFFFF;

    #[link(name = "kernel32")]
    extern "system" {
        pub fn CreateEventW(
            lp_event_attributes: *mut std::ffi::c_void,
            b_manual_reset: i32,
            b_initial_state: i32,
            lp_name: *const u16,
        ) -> Handle;
        pub fn OpenEventW(dw_desired_access: u32, b_inherit_handle: i32, lp_name: *const u16) -> Handle;
        pub fn SetEvent(h_event: Handle) -> i32;
        pub fn WaitForSingleObject(h_handle: Handle, dw_milliseconds: u32) -> u32;
        pub fn CloseHandle(h_object: Handle) -> i32;
    }
}

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

/// 单实例守卫：同一时刻只允许一个 TokenMeter 进程（否则会出现多个托盘图标 /
/// 多个轮询任务同时计费）。已有实例在运行时，本进程把它的主窗口唤到前台后立即退出。
///
/// 返回值: Some(instance) 表示首次启动（调用方必须持有 instance 直到进程退出）;
///         None 表示已有实例在运行（调用方应唤起对方窗口后退出）。
fn ensure_single_instance() -> Option<SingleInstance> {
    let instance = SingleInstance::new("TokenMeter.SingleInstance")
        .expect("创建单实例锁失败");
    if instance.is_single() {
        Some(instance)
    } else {
        notify_existing_instance();
        None
    }
}

#[cfg(target_os = "windows")]
fn notify_existing_instance() {
    use std::os::windows::ffi::OsStrExt;

    let name: Vec<u16> = std::ffi::OsStr::new("TokenMeter.ActivateWindow")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        use win32::*;

        // 已有实例的后台线程在等这个事件；转发一次即唤起其主窗口
        let event = OpenEventW(EVENT_MODIFY_STATE, 0, name.as_ptr());
        if !event.is_null() {
            SetEvent(event);
            CloseHandle(event);
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn notify_existing_instance() {}

/// 等待"再次启动"信号，收到后把主窗口显示并置前
fn spawn_activation_listener(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::ffi::OsStrExt;

            let name: Vec<u16> = std::ffi::OsStr::new("TokenMeter.ActivateWindow")
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();

            unsafe {
                use win32::*;

                let event = CreateEventW(std::ptr::null_mut(), 0, 0, name.as_ptr());
                if event.is_null() {
                    log::warn!("创建唤起事件失败，重复启动将不会自动聚焦主窗口");
                    return;
                }
                loop {
                    // 阻塞等待，几乎不占 CPU
                    let _ = WaitForSingleObject(event, INFINITE);
                    if let Some(window) = app_handle.get_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.unminimize();
                    }
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = app_handle;
        }
    });
}

fn main() {
    // 单实例：第二次双击不再产生新进程 / 新托盘图标，而是聚焦已有窗口。
    // _instance 必须活到 main 结束——它持有互斥体句柄，一旦释放锁就失效。
    let _instance = match ensure_single_instance() {
        Some(inst) => {
            log::info!("单实例检查通过，首次启动");
            inst
        }
        None => {
            log::info!("检测到已有实例运行，已通知其显示窗口");
            return;
        }
    };

    // 无 RUST_LOG 时默认输出 info 级日志，便于看到启动/轮询信息
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    log::info!("TokenMeter 启动中...");
    
    let (config, config_path) = commands::load_config();
    log::info!("加载配置: {} 个模型 (路径: {})", config.models.len(), config_path.display());
    
    // 初始化 SQLite 存储
    let db_path = config_path.parent().unwrap_or(&config_path).join("usage_data.db");
    log::info!("数据库路径: {}", db_path.display());
    
    let storage = match Storage::new(db_path) {
        Ok(s) => {
            log::info!("数据库初始化成功");
            s
        }
        Err(e) => {
            log::error!("数据库初始化失败: {}", e);
            eprintln!("TokenMeter 数据库初始化失败: {}", e);
            eprintln!("请检查数据库文件权限或磁盘空间。");
            std::process::exit(1);
        }
    };
    
    let state = Arc::new(Mutex::new(AppState {
        config,
        storage,
        config_path,
    }));
    
    log::info!("正在初始化自启动插件...");
    
    tauri::Builder::default()
// autostart plugin removed - using manual Windows registry implementation
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
                        // 优雅退出（清理托盘等资源），而非直接终止进程
                        app.exit(0);
                    }
                    _ => {}
                },
                _ => {}
            }
        })
        .setup(move |app| {
            // 启动轮询
            let app_handle = app.handle();
            poller::start_polling(app_handle.clone(), state.clone());
            // 监听"重复启动"信号：把主窗口唤到前台
            spawn_activation_listener(app_handle);
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
            // 新增的历史查询命令
            commands::query_usage_detail,
            commands::get_daily_costs,
            commands::get_api_key_list,
            commands::get_daily_records,
            commands::ignore_record,
            commands::unignore_record,
            // 日志相关命令
            commands::get_recent_logs,
            commands::get_logs_by_level,
            commands::get_log_stats,
            // 数据清理
            commands::get_cleanup_stats,
            commands::export_month_csv,
            commands::cleanup_old_data,
            // 自启动控制
            commands::is_autostart_enabled,
            commands::enable_autostart,
            commands::disable_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}