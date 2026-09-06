# TokenMeter 用量表 — 接口与协议说明

## 1. 范围说明

TokenMeter 没有独立服务端，也不拦截其他程序的请求。本文档覆盖两类接口：

1. **对外 HTTP 协议**：应用向已配置的大模型 API（OpenAI 兼容 `chat/completions`）发出的轮询/测试请求及其响应解析；
2. **对内 IPC**：前端（WebView）与 Rust 主进程之间的 Tauri 命令与事件。

## 2. 与模型 API 的 HTTP 交互

### 2.1 请求构造

- 端点：`ModelConfig.apiEndpoint`，即**完整**的 `…/chat/completions` 地址（例如 `https://api.deepseek.com/v1/chat/completions`）；
- 方法：`POST`；请求体最小化以省 token：

```jsonc
// 定时轮询 poll_model_usage（poller.rs）
{ "model": "<config.provider>",           // 注意：provider 字段即请求体 model
  "messages": [{ "role": "user", "content": "count tokens" }],
  "max_tokens": 10 }

// 连接测试 test_model_connection（poller.rs）
{ "model": "<config.provider>",
  "messages": [{ "role": "user", "content": "hi" }],
  "max_tokens": 5 }
```

- 请求头同时携带两种鉴权形式，以兼容各家网关：

```
api-key: <apiKey>
Authorization: Bearer <apiKey>
Content-Type: application/json
```

- 超时：轮询 30s，连接测试 10s；非 2xx 视为失败（轮询记日志，测试返回带状态码与响应体的错误）。

### 2.2 响应解析与费用

- 成功响应按 `ModelConfig.responsePath` 中的**点路径**从 JSON 取值（实现按 `.` 分段逐层 `get`），默认值即 OpenAI 兼容格式：

```jsonc
"responsePath": {
  "inputTokens":  "usage.prompt_tokens",
  "outputTokens": "usage.completion_tokens",
  "totalTokens":  "usage.total_tokens"   // 缺失时回退为 input + output
}
```

- 费用 = 输入 tokens ÷ 1000 × `inputPrice` + 输出 tokens ÷ 1000 × `outputPrice`（单价为“每 1K tokens”；`currency` 仅作展示单位）。
- 解析不到 usage 字段时记为 0，不中断轮询。

## 3. Tauri 命令（IPC）

以下命令均在 `main.rs` 的 `invoke_handler` 注册，实现在 `commands.rs`；Rust 参数/返回值经 serde **camelCase** 编解码，前端用 `@tauri-apps/api` 的 `invoke` 调用。状态通过 `State<Arc<Mutex<AppState>>>` 访问。

### 3.1 模型管理

| 命令 | 参数 | 返回 | 行为 |
|---|---|---|---|
| `get_models` | — | `ModelConfig[]` | 返回内存中的模型列表 |
| `add_model` | `model: ModelConfig` | `ModelConfig[]` | 追加模型并写 `config.json`；ID 重复报错“模型ID已存在” |
| `update_model` | `model: ModelConfig` | `ModelConfig[]` | 按 `id` 覆盖并写盘；不存在报错“模型不存在” |
| `delete_model` | `id: string` | `ModelConfig[]` | 移除模型并清理其用量缓存，写盘 |
| `test_connection` | `config: ModelConfig` | `string` | 用传入配置（未保存）发一次最小请求，成功返回“连接成功”，失败返回错误描述 |

### 3.2 统计与窗口/轮询配置

| 命令 | 参数 | 返回 | 行为 |
|---|---|---|---|
| `get_daily_stats` | `modelId: string` | `DailyStats` | 聚合该模型当天内存记录 |
| `get_all_daily_stats` | — | `Record<modelId, DailyStats>` | 所有模型的今日统计 |
| `get_window_config` | — | `WindowConfig` | 返回 `{ edgePosition, opacity }` |
| `update_window_config` | `config: WindowConfig` | — | 更新并写盘 |
| `update_polling_interval` | `interval: number(毫秒)` | — | 更新轮询间隔（默认 300000）并写盘 |
| `trigger_poll` | — | — | **手动轮询**：遍历所有模型真实发请求，成功则写入 `usage_data`，最后 `emit_all("usage-updated", ())` |

> `DailyStats = { inputTokens, outputTokens, totalTokens, requestCount, totalCost }`；`requestCount` 即当日记入的成功轮询次数。统计口径只有“今日”（自当天 UTC 0 点起），无周/月维度。

## 4. 事件（前端 listen）

| 事件 | 触发方 | payload | 前端行为 |
|---|---|---|---|
| `usage-updated` | `poller.rs`：每次轮询成功后；`commands.rs trigger_poll` 结束后 | 轮询时为 `model.id`；trigger_poll 为 `()` | `App.tsx` 收到后 `fetchAllStats()` 刷新今日统计 |
| `models-changed` | 独立“添加模型”窗口保存成功后 `emit`（ModelManager.tsx） | — | 主窗口收到后重新 `fetchModels()` + `fetchAllStats()` |

## 5. 配置文件 schema（config.json / config.example.json）

配置文件为运行目录下的 UTF-8 JSON，与 `AppConfig` 一一对应（字段 camelCase）：

```jsonc
{
  "models": [
    {
      "id": "model-example",                    // 前端生成：model-<时间戳>-<随机串>
      "name": "示例模型",                        // 显示名
      "provider": "deepseek-chat",              // 请求体 model 字段（DeepSeek/MiMo/ChatGPT 模板值见 src/types.ts MODEL_TEMPLATES）
      "apiEndpoint": "https://api.deepseek.com/v1/chat/completions",
      "apiKey": "请填入你的真实 API Key",         // 明文；config.example.json 中为占位符
      "inputPrice": 0.001,                      // 每 1K 输入 tokens
      "outputPrice": 0.002,                     // 每 1K 输出 tokens
      "currency": "CNY",
      "responsePath": {
        "inputTokens": "usage.prompt_tokens",
        "outputTokens": "usage.completion_tokens",
        "totalTokens": "usage.total_tokens"
      }
    }
  ],
  "pollingInterval": 300000,                    // 毫秒；默认 5 分钟
  "window": {
    "edgePosition": "right",                    // 贴边位置：left/right/top/bottom
    "opacity": 0.9
  }
}
```

- 内置模板（`src/types.ts` `MODEL_TEMPLATES`）：DeepSeek `deepseek-chat`（CNY 0.001/0.002）、MiMo `mimo-v2.5-pro`（`token-plan-cn.xiaomimimo.com` 端点，价格为 **0**——Token Plan 按 Credits 计费，此处只统计 token）、ChatGPT `gpt-4o`（USD 0.005/0.015）。
- `config.json` 含真实 API Key，已被 `.gitignore` 忽略；入库/分发请用脱敏的 `config.example.json`。

## 6. 内存模型与统计口径

```rust
// models.rs（示意）
pub struct AppState {
    pub config: AppConfig,
    pub usage_data: HashMap<String, Vec<UsageRecord>>, // modelId → 当天成功轮询记录
}
```

- `UsageRecord.timestamp` 为 epoch 秒（`chrono::Utc::now().timestamp()`）；
- 每次成功轮询 push 后裁剪 `retain(|r| r.timestamp >= today_start)`，`today_start` 为当天 UTC 0 点——因此内存中始终只有当天数据，跨天自动清零；
- 无持久化历史、无按日/周/月查询接口。

## 7. 约定与错误处理

- 命令失败返回 `Result::Err(String)`，前端 catch 后以文案展示（如表单“测试连接”结果区）；
- 轮询失败仅 `log::error!`，下一轮继续；不会因单个模型故障阻塞其他模型；
- IPC 命名风格统一 snake_case（Tauri 默认），事件名 kebab-case（`usage-updated` / `models-changed`）。

交互与窗口/拖拽细节见 [architecture.md](architecture.md)，构建与排障见 [quick-start.md](quick-start.md)。
