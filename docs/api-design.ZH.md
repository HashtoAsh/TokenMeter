# TokenMeter 用量表 — 接口与协议

[English](api-design.md) | **中文**

TokenMeter 没有独立服务端，也不拦截其他程序的请求。本文覆盖两类接口：
① 应用对大模型 API 的 HTTP 调用；② 前端（WebView）与 Rust 主进程之间的 Tauri IPC。

## 1. 对大模型 API 的 HTTP 调用

| 项 | 说明 |
|---|---|
| 端点 | `ModelConfig.apiEndpoint`，即**完整**的 `…/chat/completions` 地址 |
| 方法/体 | `POST`，请求体最小化以省 token（见下） |
| 鉴权 | 同时带 `api-key: <key>` 与 `Authorization: Bearer <key>`，兼容各家网关 |
| 超时 | 30s（全局复用的 `reqwest::Client`）；非 2xx 视为失败 |
| 请求头 | `Content-Type: application/json` |

    // 定时轮询（poller.rs）
    { "model": "<ModelConfig.provider>", "messages": [{ "role": "user", "content": "count tokens" }], "max_tokens": 10 }
    // 测试连接（同一函数，仅文案与 max_tokens 不同）
    { "model": "<ModelConfig.provider>", "messages": [{ "role": "user", "content": "hi" }], "max_tokens": 5 }

**响应解析与费用**

- 按 `responsePath` 的点路径取值（支持数组下标，如 `choices[0].usage.total_tokens`），默认即 OpenAI 兼容格式：

      "responsePath": {
        "inputTokens":  "usage.prompt_tokens",
        "outputTokens": "usage.completion_tokens",
        "totalTokens":  "usage.total_tokens"   // 缺失时回退为 input + output
      }

- 费用 = 输入 tokens ÷ 1000 × `inputPrice` + 输出 tokens ÷ 1000 × `outputPrice`（单价为"每 1K tokens"；`currency` 仅作展示单位）；
- 解析不到 usage 时记 0 并继续，不中断轮询；三项全 0 会在日志中 warn（提示解析路径可能配错）。

## 2. Tauri 命令（IPC）

全部在 `main.rs` 的 `invoke_handler` 注册、`commands.rs` 实现，参数/返回值 camelCase，
状态经 `State<Arc<Mutex<AppState>>>` 访问。

**模型管理**

| 命令 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `get_models` | — | `ModelConfig[]` | 内存中的模型列表 |
| `add_model` | `model` | `ModelConfig[]` | 追加并写盘；ID 重复报"模型ID已存在" |
| `update_model` | `model` | `ModelConfig[]` | 按 `id` 覆盖并写盘；不存在则报错 |
| `delete_model` | `id` | `ModelConfig[]` | 移除模型并写盘 |
| `test_connection` | `config` | `string` | 用**未保存**的配置发一次最小请求，返回"连接成功"或错误描述 |

**今日统计与轮询**

| 命令 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `get_daily_stats` | `modelId` | `DailyStats` | 该模型当天聚合 |
| `get_all_daily_stats` | — | `Record<modelId, DailyStats>` | 所有模型当天聚合 |
| `trigger_poll` | — | — | **手动轮询**：逐模型真实发请求，成功则入库并 `emit("usage-updated")` |

> `DailyStats = { inputTokens, outputTokens, totalTokens, requestCount, totalCost }`；统计口径只有"今日"（本地时区零点起）。

**历史查询与导出**

| 命令 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `query_usage_detail` | `params: { dimension, filter?, date }` | `DailyDetail` | `dimension` = `api` / `model` / `total`；`date` 为 `YYYY-MM-DD` |
| `get_daily_costs` | `dimension, filter?, days` | `DailyCost[]` | 近 N 天费用趋势（历史页图表） |
| `get_api_key_list` | — | `{ apiKeyMask, provider }[]` | 供"按 Key"筛选 |
| `get_daily_records` | `dimension, filter?, date, showIgnored` | `RecordItem[]` | 某日请求记录明细 |
| `ignore_record` / `unignore_record` | `recordId` | — | 标记/取消标记，不计入统计 |
| `get_cleanup_stats` | — | `CleanupStats` | 超出保留期（默认 3 个月）的数据统计 |
| `export_month_csv` | `year, month` | `string` | 导出该月 CSV，返回文件路径 |
| `cleanup_old_data` | — | `number` | 删除保留期前的记录，返回删除条数 |

**日志与自启动**

| 命令 | 参数 | 返回 | 说明 |
|---|---|---|---|
| `get_recent_logs` | `limit` | `DebugLog[]` | 最近日志 |
| `get_logs_by_level` | `level, limit` | `DebugLog[]` | 按级别筛选 |
| `get_log_stats` | — | `LogStats` | 各级别条数统计 |
| `is_autostart_enabled` | — | `bool` | 注册表项是否存在 |
| `enable_autostart` / `disable_autostart` | — | — | 写/删 `HKCU\…\CurrentVersion\Run\TokenMeter` |

## 3. 事件

| 事件 | 触发方 | payload | 前端行为 |
|---|---|---|---|
| `usage-updated` | `poller.rs` 每轮成功入库后；`trigger_poll` 结束 | — | 刷新今日统计 |
| `poll-status` | `poller.rs` / `commands.rs`（**状态变化**时） | `{ id, name, ok, error? }` | 更新 `pollStatus`，概览/详情展示失败原因 |
| `models-changed` | 添加/编辑子窗口保存后 | — | 主窗口重新拉模型 + 统计 |
| `add-model-window-closed` | 子窗口关闭前（保存/取消/Esc/卸载兜底） | — | 主窗口解除"保持展开"锁定 |

## 4. 配置文件（`config.json` / `config.example.json`）

路径：**工作目录存在则用之，否则用 exe 所在目录**（启动时解析一次，此后读写共用）。UTF-8 JSON，字段 camelCase：

    {
      "models": [
        {
          "id": "model-example",                 // 前端生成：model-<时间戳>-<随机串>
          "name": "示例模型",
          "provider": "deepseek-chat",           // 请求体里的 model 字段
          "apiEndpoint": "https://api.deepseek.com/v1/chat/completions",
          "apiKey": "请填入你的 API Key",
          "inputPrice": 0.001,                   // 每 1K 输入 tokens
          "outputPrice": 0.002,                  // 每 1K 输出 tokens
          "currency": "CNY",
          "responsePath": {
            "inputTokens": "usage.prompt_tokens",
            "outputTokens": "usage.completion_tokens",
            "totalTokens": "usage.total_tokens"
          }
        }
      ],
      "pollingInterval": 600000                  // 毫秒，默认 10 分钟
    }

内置模板（`src/types.ts` `MODEL_TEMPLATES`）：DeepSeek `deepseek-chat`（CNY 0.001/0.002）、
MiMo `mimo-v2.5-pro`（`token-plan-cn.xiaomimimo.com` 端点，价格填 0——按订阅计费，只统计 token）、
ChatGPT `gpt-4o`（USD 0.005/0.015）。

## 5. 存储与统计口径

- SQLite 文件与配置同目录：`usage_data.db`
  - `usage_records`：id、model_id、provider、api_key_mask、timestamp、input/output/total_tokens、cost、ignored
  - `debug_logs`：id、timestamp、level、module、message、detail、user_id
- "今日"= 本地时区当天（`chrono::Local`）；统计一律排除 `ignored = 1` 的记录（金额只作估算，按模型币种展示）；
- 默认保留 3 个月，启动时若发现更早的数据会弹窗询问"导出 CSV / 清理"。

## 6. 约定与错误处理

- 命令失败返回 `Result::Err(String)`，前端 catch 后直接展示文案（如表单的"测试连接"结果区）；
- 单个模型轮询失败不影响其他模型与下一轮；失败→恢复的状态变化通过 `poll-status` 通知界面；
- 命令名 snake_case（Tauri 默认），事件名 kebab-case。

窗口与拖拽细节见 [architecture.ZH.md](architecture.ZH.md)，构建与排障见 [quick-start.ZH.md](quick-start.ZH.md)。
