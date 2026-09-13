use rusqlite::{Connection, params};
use crate::models::*;
use std::path::PathBuf;
use chrono::{Local, NaiveDate, Datelike};

pub struct Storage {
    conn: Connection,
}

impl Storage {
    /// 打开或创建数据库
    pub fn new(db_path: PathBuf) -> Result<Self, String> {
        log::info!("正在打开数据库: {}", db_path.display());
        
        let conn = Connection::open(&db_path)
            .map_err(|e| {
                let error_msg = format!("打开数据库失败: {}", e);
                log::error!("{}", error_msg);
                
                // 分析数据库错误
                if e.to_string().contains("permission") || e.to_string().contains("access") {
                    log::error!("可能原因: 数据库文件权限被拒绝");
                    log::error!("  1. 检查文件是否被其他程序占用");
                    log::error!("  2. 检查杀毒软件是否拦截");
                    log::error!("  3. 检查目录写入权限");
                } else if e.to_string().contains("locked") {
                    log::error!("可能原因: 数据库文件被锁定");
                    log::error!("  1. 关闭其他可能使用该数据库的程序");
                    log::error!("  2. 重启应用程序");
                } else if e.to_string().contains("corrupt") {
                    log::error!("可能原因: 数据库文件损坏");
                    log::error!("  1. 删除数据库文件重新创建");
                }
                
                error_msg
            })?;
        
        log::info!("数据库打开成功，正在初始化表结构...");
        
        // 初始化表结构
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS usage_records (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                model_id      TEXT NOT NULL,
                provider      TEXT NOT NULL DEFAULT '',
                api_key_mask  TEXT NOT NULL DEFAULT '',
                timestamp     INTEGER NOT NULL,
                input_tokens  INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens  INTEGER NOT NULL DEFAULT 0,
                cost          REAL NOT NULL DEFAULT 0.0,
                ignored       INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_model_ts ON usage_records(model_id, timestamp);
            CREATE INDEX IF NOT EXISTS idx_provider_ts ON usage_records(provider, timestamp);
            CREATE INDEX IF NOT EXISTS idx_date ON usage_records(timestamp);

            CREATE TABLE IF NOT EXISTS debug_logs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp   INTEGER NOT NULL,
                level       TEXT NOT NULL DEFAULT 'ERROR',
                module      TEXT NOT NULL DEFAULT '',
                message     TEXT NOT NULL,
                detail      TEXT DEFAULT '',
                user_id     TEXT NOT NULL DEFAULT 'default'
            );
            CREATE INDEX IF NOT EXISTS idx_log_ts ON debug_logs(timestamp);
            CREATE INDEX IF NOT EXISTS idx_log_level ON debug_logs(level);
        ").map_err(|e| {
            let error_msg = format!("初始化数据库表结构失败: {}", e);
            log::error!("{}", error_msg);
            error_msg
        })?;
        
        log::info!("数据库表结构初始化完成");
        Ok(Self { conn })
    }

    /// 插入一条用量记录
    pub fn insert_record(&self, model_id: &str, provider: &str, api_key: &str, record: &UsageRecord) -> Result<(), String> {
        // 对 API Key 做掩码处理：只保留前6位和后4位
        let masked_key = mask_api_key(api_key);
        
        self.conn.execute(
            "INSERT INTO usage_records (model_id, provider, api_key_mask, timestamp, input_tokens, output_tokens, total_tokens, cost, ignored)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)",
            params![model_id, provider, masked_key, record.timestamp, record.input_tokens, record.output_tokens, record.total_tokens, record.cost],
        ).map_err(|e| {
            let error_msg = format!("插入记录失败: {}", e);
            log::error!("{}", error_msg);
            log::error!("模型: {}, Provider: {}, 时间: {}", model_id, provider, record.timestamp);
            
            // 分析数据库错误
            if e.to_string().contains("disk") || e.to_string().contains("full") {
                log::error!("可能原因: 磁盘空间不足");
                log::error!("  1. 清理磁盘空间");
                log::error!("  2. 删除旧的数据库文件");
            } else if e.to_string().contains("locked") || e.to_string().contains("busy") {
                log::error!("可能原因: 数据库被锁定");
                log::error!("  1. 关闭其他可能使用该数据库的程序");
                log::error!("  2. 重启应用程序");
            } else if e.to_string().contains("constraint") {
                log::error!("可能原因: 数据约束冲突");
                log::error!("  1. 检查数据是否重复");
                log::error!("  2. 检查字段是否为空");
            }
            
            error_msg
        })?;
        
        Ok(())
    }

    /// 查询指定日期的汇总（按维度）
    pub fn query_daily_detail(&self, dimension: &str, filter: Option<&str>, date: &str) -> Result<DailyDetail, String> {
        // 解析日期为时间戳范围
        let (start_ts, end_ts) = parse_date_range(date)?;
        
        let sql = match dimension {
            "api" => {
                // 按 API Key 查询
                let api_key_mask = filter.unwrap_or("");
                "SELECT COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0), 
                        COALESCE(SUM(total_tokens), 0), COUNT(*), COALESCE(SUM(cost), 0.0)
                 FROM usage_records 
                 WHERE api_key_mask = ?1 AND timestamp >= ?2 AND timestamp < ?3 AND ignored = 0"
            }
            "model" => {
                // 按模型查询
                let model_id = filter.unwrap_or("");
                "SELECT COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0), 
                        COALESCE(SUM(total_tokens), 0), COUNT(*), COALESCE(SUM(cost), 0.0)
                 FROM usage_records 
                 WHERE model_id = ?1 AND timestamp >= ?2 AND timestamp < ?3 AND ignored = 0"
            }
            "total" => {
                // 总计
                "SELECT COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0), 
                        COALESCE(SUM(total_tokens), 0), COUNT(*), COALESCE(SUM(cost), 0.0)
                 FROM usage_records 
                 WHERE timestamp >= ?1 AND timestamp < ?2 AND ignored = 0"
            }
            _ => return Err("无效的查询维度".to_string()),
        };

        let result = if dimension == "total" {
            self.conn.query_row(sql, params![start_ts, end_ts], |row| {
                Ok(DailyDetail {
                    date: date.to_string(),
                    input_tokens: row.get(0)?,
                    output_tokens: row.get(1)?,
                    total_tokens: row.get(2)?,
                    request_count: row.get(3)?,
                    total_cost: row.get(4)?,
                })
            })
        } else {
            self.conn.query_row(sql, params![filter.unwrap_or(""), start_ts, end_ts], |row| {
                Ok(DailyDetail {
                    date: date.to_string(),
                    input_tokens: row.get(0)?,
                    output_tokens: row.get(1)?,
                    total_tokens: row.get(2)?,
                    request_count: row.get(3)?,
                    total_cost: row.get(4)?,
                })
            })
        };

        result.map_err(|e| format!("查询失败: {}", e))
    }

    /// 获取近N天的每日花费
    pub fn get_daily_costs(&self, dimension: &str, filter: Option<&str>, days: u32) -> Result<Vec<DailyCost>, String> {
        let today = Local::now().date_naive();
        let mut costs = Vec::new();
        
        for i in 0..days {
            let date = today - chrono::Duration::days(i as i64);
            let date_str = date.format("%Y-%m-%d").to_string();
            
            if let Ok(detail) = self.query_daily_detail(dimension, filter, &date_str) {
                costs.push(DailyCost {
                    date: date.format("%m-%d").to_string(),
                    cost: detail.total_cost,
                });
            }
        }
        
        costs.reverse(); // 按日期正序
        Ok(costs)
    }

    /// 获取所有 API Key 列表（用于下拉选择）
    pub fn get_api_key_list(&self) -> Result<Vec<ApiKeyInfo>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT api_key_mask, provider FROM usage_records ORDER BY provider, api_key_mask"
        ).map_err(|e| format!("准备查询失败: {}", e))?;
        
        let rows = stmt.query_map([], |row| {
            Ok(ApiKeyInfo {
                api_key_mask: row.get(0)?,
                provider: row.get(1)?,
            })
        }).map_err(|e| format!("查询失败: {}", e))?;
        
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| format!("读取行失败: {}", e))?);
        }
        
        Ok(result)
    }

    /// 标记记录为忽略
    pub fn ignore_record(&self, record_id: i64) -> Result<(), String> {
        self.conn.execute(
            "UPDATE usage_records SET ignored = 1 WHERE id = ?1",
            params![record_id],
        ).map_err(|e| format!("忽略记录失败: {}", e))?;
        Ok(())
    }

    /// 取消忽略
    pub fn unignore_record(&self, record_id: i64) -> Result<(), String> {
        self.conn.execute(
            "UPDATE usage_records SET ignored = 0 WHERE id = ?1",
            params![record_id],
        ).map_err(|e| format!("取消忽略失败: {}", e))?;
        Ok(())
    }

    /// 获取指定日期的请求列表（用于显示和忽略操作）
    pub fn get_daily_records(&self, dimension: &str, filter: Option<&str>, date: &str, show_ignored: bool) -> Result<Vec<RecordItem>, String> {
        let (start_ts, end_ts) = parse_date_range(date)?;
        
        let ignored_filter = if show_ignored { "" } else { "AND ignored = 0" };
        
        let sql = match dimension {
            "api" => {
                format!(
                    "SELECT id, timestamp, input_tokens, output_tokens, total_tokens, cost, ignored
                     FROM usage_records 
                     WHERE api_key_mask = ?1 AND timestamp >= ?2 AND timestamp < ?3 {}
                     ORDER BY timestamp DESC",
                    ignored_filter
                )
            }
            "model" => {
                format!(
                    "SELECT id, timestamp, input_tokens, output_tokens, total_tokens, cost, ignored
                     FROM usage_records 
                     WHERE model_id = ?1 AND timestamp >= ?2 AND timestamp < ?3 {}
                     ORDER BY timestamp DESC",
                    ignored_filter
                )
            }
            "total" => {
                format!(
                    "SELECT id, timestamp, input_tokens, output_tokens, total_tokens, cost, ignored
                     FROM usage_records 
                     WHERE timestamp >= ?1 AND timestamp < ?2 {}
                     ORDER BY timestamp DESC",
                    ignored_filter
                )
            }
            _ => return Err("无效的查询维度".to_string()),
        };

        let mut stmt = self.conn.prepare(&sql).map_err(|e| format!("准备查询失败: {}", e))?;
        
        // Build query parameters based on dimension
        let query_params: Vec<Box<dyn rusqlite::types::ToSql>> = if dimension == "total" {
            vec![Box::new(start_ts), Box::new(end_ts)]
        } else {
            vec![Box::new(filter.unwrap_or("").to_string()), Box::new(start_ts), Box::new(end_ts)]
        };
        
        let rows = stmt.query_map(rusqlite::params_from_iter(query_params.iter()), |row| {
            Ok(RecordItem {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                input_tokens: row.get(2)?,
                output_tokens: row.get(3)?,
                total_tokens: row.get(4)?,
                cost: row.get(5)?,
                ignored: row.get::<_, i32>(6)? == 1,
            })
        }).map_err(|e| format!("查询失败: {}", e))?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| format!("读取行失败: {}", e))?);
        }
        
        Ok(result)
    }

    /// 导出指定月份的数据为 CSV
    pub fn export_month_csv(&self, year: i32, month: u32) -> Result<String, String> {
        let start_date = NaiveDate::from_ymd_opt(year, month, 1)
            .ok_or("无效日期")?;
        let end_date = if month == 12 {
            NaiveDate::from_ymd_opt(year + 1, 1, 1).ok_or("无效日期")?
        } else {
            NaiveDate::from_ymd_opt(year, month + 1, 1).ok_or("无效日期")?
        };
        
        let start_ts = start_date.and_hms_opt(0, 0, 0).unwrap().and_local_timezone(Local).unwrap().timestamp();
        let end_ts = end_date.and_hms_opt(0, 0, 0).unwrap().and_local_timezone(Local).unwrap().timestamp();
        
        let mut stmt = self.conn.prepare(
            "SELECT model_id, provider, api_key_mask, timestamp, input_tokens, output_tokens, total_tokens, cost, ignored
             FROM usage_records 
             WHERE timestamp >= ?1 AND timestamp < ?2
             ORDER BY timestamp"
        ).map_err(|e| format!("准备查询失败: {}", e))?;
        
        let rows = stmt.query_map(params![start_ts, end_ts], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, u64>(4)?,
                row.get::<_, u64>(5)?,
                row.get::<_, u64>(6)?,
                row.get::<_, f64>(7)?,
                row.get::<_, i32>(8)? == 1,
            ))
        }).map_err(|e| format!("查询失败: {}", e))?;
        
        let mut csv = String::from("模型ID,Provider,API Key,时间,输入Token,输出Token,总Token,花费,已忽略
");
        
        for row in rows {
            let (model_id, provider, api_key, ts, input, output, total, cost, ignored) = 
                row.map_err(|e| format!("读取行失败: {}", e))?;
            
            let datetime = chrono::DateTime::from_timestamp(ts, 0)
                .map(|dt| dt.with_timezone(&Local).format("%Y-%m-%d %H:%M:%S").to_string())
                .unwrap_or_default();
            
            csv.push_str(&format!(
                "{},{},{},{},{},{},{},{},{}
",
                model_id, provider, api_key, datetime, input, output, total, cost,
                if ignored { "是" } else { "否" }
            ));
        }
        
        Ok(csv)
    }

    /// 清理指定日期之前的数据
    pub fn cleanup_before(&self, before_date: &str) -> Result<usize, String> {
        let (start_ts, _) = parse_date_range(before_date)?;
        let count = self.conn.execute(
            "DELETE FROM usage_records WHERE timestamp < ?1",
            params![start_ts],
        ).map_err(|e| format!("清理数据失败: {}", e))?;
        Ok(count)
    }

    /// 获取需要清理的数据统计
    pub fn get_cleanup_stats(&self, months_to_keep: u32) -> Result<CleanupStats, String> {
        let today = Local::now().date_naive();
        let cutoff_date = today - chrono::Duration::days((months_to_keep * 30) as i64);
        let cutoff_ts = cutoff_date.and_hms_opt(0, 0, 0).unwrap().and_local_timezone(Local).unwrap().timestamp();
        
        let (record_count, total_cost) = self.conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(cost), 0.0) FROM usage_records WHERE timestamp < ?1",
            params![cutoff_ts],
            |row| Ok((row.get::<_, i32>(0)?, row.get::<_, f64>(1)?)),
        ).map_err(|e| format!("查询统计失败: {}", e))?;
        
        Ok(CleanupStats {
            record_count: record_count as u32,
            total_cost,
            cutoff_date: cutoff_date.format("%Y-%m-%d").to_string(),
        })
    }

    // ========== 日志功能 ==========

    /// 记录错误日志
    pub fn log_error(&self, module: &str, message: &str, detail: &str) -> Result<(), String> {
        self.insert_log("ERROR", module, message, detail)
    }

    /// 记录警告日志
    pub fn log_warn(&self, module: &str, message: &str, detail: &str) -> Result<(), String> {
        self.insert_log("WARN", module, message, detail)
    }

    /// 记录信息日志
    pub fn log_info(&self, module: &str, message: &str, detail: &str) -> Result<(), String> {
        self.insert_log("INFO", module, message, detail)
    }

    /// 插入日志记录
    fn insert_log(&self, level: &str, module: &str, message: &str, detail: &str) -> Result<(), String> {
        let timestamp = Local::now().timestamp();
        let user_id = get_user_id();
        
        self.conn.execute(
            "INSERT INTO debug_logs (timestamp, level, module, message, detail, user_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![timestamp, level, module, message, detail, user_id],
        ).map_err(|e| format!("记录日志失败: {}", e))?;
        
        Ok(())
    }

    /// 查询日志（最近N条）
    pub fn get_recent_logs(&self, limit: u32) -> Result<Vec<DebugLog>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, level, module, message, detail, user_id
             FROM debug_logs 
             ORDER BY timestamp DESC 
             LIMIT ?1"
        ).map_err(|e| format!("准备查询失败: {}", e))?;
        
        let rows = stmt.query_map(params![limit], |row| {
            Ok(DebugLog {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                level: row.get(2)?,
                module: row.get(3)?,
                message: row.get(4)?,
                detail: row.get(5)?,
                user_id: row.get(6)?,
            })
        }).map_err(|e| format!("查询失败: {}", e))?;
        
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| format!("读取行失败: {}", e))?);
        }
        
        Ok(result)
    }

    /// 按级别过滤日志
    pub fn get_logs_by_level(&self, level: &str, limit: u32) -> Result<Vec<DebugLog>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, timestamp, level, module, message, detail, user_id
             FROM debug_logs 
             WHERE level = ?1
             ORDER BY timestamp DESC 
             LIMIT ?2"
        ).map_err(|e| format!("准备查询失败: {}", e))?;
        
        let rows = stmt.query_map(params![level, limit], |row| {
            Ok(DebugLog {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                level: row.get(2)?,
                module: row.get(3)?,
                message: row.get(4)?,
                detail: row.get(5)?,
                user_id: row.get(6)?,
            })
        }).map_err(|e| format!("查询失败: {}", e))?;
        
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| format!("读取行失败: {}", e))?);
        }
        
        Ok(result)
    }

    /// 清理N天前的日志
    pub fn cleanup_old_logs(&self, days: u32) -> Result<usize, String> {
        let cutoff_ts = (Local::now() - chrono::Duration::days(days as i64)).timestamp();
        let count = self.conn.execute(
            "DELETE FROM debug_logs WHERE timestamp < ?1",
            params![cutoff_ts],
        ).map_err(|e| format!("清理日志失败: {}", e))?;
        Ok(count)
    }

    /// 获取日志统计
    pub fn get_log_stats(&self) -> Result<LogStats, String> {
        let stats = self.conn.query_row(
            "SELECT 
                COUNT(*),
                SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END),
                SUM(CASE WHEN level = 'WARN' THEN 1 ELSE 0 END),
                SUM(CASE WHEN level = 'INFO' THEN 1 ELSE 0 END)
             FROM debug_logs",
            [],
            |row| Ok(LogStats {
                total: row.get::<_, i32>(0)? as u32,
                errors: row.get::<_, i32>(1)? as u32,
                warnings: row.get::<_, i32>(2)? as u32,
                info: row.get::<_, i32>(3)? as u32,
            }),
        ).map_err(|e| format!("查询统计失败: {}", e))?;
        
        Ok(stats)
    }
}

/// 获取用户标识（基于机器名或生成随机ID）
fn get_user_id() -> String {
    use std::fs;
    
    // 尝试读取已保存的用户ID
    let id_file = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("token-meter")
        .join("user_id.txt");
    
    if let Ok(id) = fs::read_to_string(&id_file) {
        return id.trim().to_string();
    }
    
    // 生成新的用户ID
    let machine = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    
    let id = format!("{}-{}", machine, &uuid::Uuid::new_v4().to_string()[..8]);
    
    // 保存到文件
    if let Some(parent) = id_file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(&id_file, &id);
    
    id
}

/// API Key 掩码处理
fn mask_api_key(key: &str) -> String {
    if key.len() <= 10 {
        return key.to_string();
    }
    format!("{}...{}", &key[..6], &key[key.len()-4..])
}

/// 解析日期为时间戳范围
fn parse_date_range(date: &str) -> Result<(i64, i64), String> {
    let naive_date = NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map_err(|e| format!("日期格式错误: {}", e))?;
    
    let start = naive_date.and_hms_opt(0, 0, 0)
        .ok_or("无效时间")?
        .and_local_timezone(Local)
        .earliest()
        .ok_or("时区转换失败")?
        .timestamp();
    
    let end_date = naive_date + chrono::Duration::days(1);
    let end = end_date.and_hms_opt(0, 0, 0)
        .ok_or("无效时间")?
        .and_local_timezone(Local)
        .earliest()
        .ok_or("时区转换失败")?
        .timestamp();
    
    Ok((start, end))
}