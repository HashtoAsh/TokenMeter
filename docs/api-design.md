# TokenMeter — Interfaces and Protocols

**English** | [中文](api-design.ZH.md)

TokenMeter has no separate server and does not intercept other programs' requests. This document covers two kinds of
interface: ① the HTTP calls the app makes to LLM APIs; ② the Tauri IPC between the frontend (WebView) and the Rust
main process.

## 1. HTTP calls to LLM APIs

| Item | Description |
|---|---|
| Endpoint | `ModelConfig.apiEndpoint`, i.e. the **full** `…/chat/completions` URL |
| Method / body | `POST`, with a minimal request body to save tokens (see below) |
| Auth | sends both `api-key: <key>` and `Authorization: Bearer <key>`, for compatibility with various gateways |
| Timeout | 30s (a single globally reused `reqwest::Client`); anything other than 2xx counts as a failure |
| Request headers | `Content-Type: application/json` |

    // scheduled poll (poller.rs)
    { "model": "<ModelConfig.provider>", "messages": [{ "role": "user", "content": "count tokens" }], "max_tokens": 10 }
    // test connection (same function, different wording and max_tokens)
    { "model": "<ModelConfig.provider>", "messages": [{ "role": "user", "content": "hi" }], "max_tokens": 5 }

**Response parsing and cost**

- Values are read through the `responsePath` dot paths (array indexes are supported, e.g. `choices[0].usage.total_tokens`);
  the defaults are already the OpenAI-compatible format:

      "responsePath": {
        "inputTokens":  "usage.prompt_tokens",
        "outputTokens": "usage.completion_tokens",
        "totalTokens":  "usage.total_tokens"   // falls back to input + output when missing
      }

- Cost = input tokens ÷ 1000 × `inputPrice` + output tokens ÷ 1000 × `outputPrice` (prices are per 1K tokens; `currency` is a display unit only);
- If usage cannot be parsed, the request records 0 and polling continues; when all three values are 0 a warning is written to the log
  (a hint that the response path may be misconfigured).

## 2. Tauri commands (IPC)

All of them are registered in `invoke_handler` in `main.rs` and implemented in `commands.rs`; arguments and return
values are camelCase, and state is reached through `State<Arc<Mutex<AppState>>>`.

**Model management**

| Command | Arguments | Returns | Description |
|---|---|---|---|
| `get_models` | — | `ModelConfig[]` | the model list held in memory |
| `add_model` | `model` | `ModelConfig[]` | appends and writes to disk; a duplicate ID reports "model ID already exists" |
| `update_model` | `model` | `ModelConfig[]` | overwrites by `id` and writes to disk; errors if it does not exist |
| `delete_model` | `id` | `ModelConfig[]` | removes the model and writes to disk |
| `test_connection` | `config` | `string` | sends one minimal request with the **unsaved** configuration and returns "connection succeeded" or an error description |

**Today's stats and polling**

| Command | Arguments | Returns | Description |
|---|---|---|---|
| `get_daily_stats` | `modelId` | `DailyStats` | today's aggregate for that model |
| `get_all_daily_stats` | — | `Record<modelId, DailyStats>` | today's aggregate for every model |
| `trigger_poll` | — | — | **manual poll**: sends a real request per model, stores successful ones and emits `usage-updated` |

> `DailyStats = { inputTokens, outputTokens, totalTokens, requestCount, totalCost }`; the only statistical window is
> "today" (since midnight in the local timezone).

**History and export**

| Command | Arguments | Returns | Description |
|---|---|---|---|
| `query_usage_detail` | `params: { dimension, filter?, date }` | `DailyDetail` | `dimension` = `api` / `model` / `total`; `date` is `YYYY-MM-DD` |
| `get_daily_costs` | `dimension, filter?, days` | `DailyCost[]` | cost trend over the last N days (history chart) |
| `get_api_key_list` | — | `{ apiKeyMask, provider }[]` | feeds the "by key" filter |
| `get_daily_records` | `dimension, filter?, date, showIgnored` | `RecordItem[]` | request records for a given day |
| `ignore_record` / `unignore_record` | `recordId` | — | mark or unmark a record so it is excluded from the statistics |
| `get_cleanup_stats` | — | `CleanupStats` | counts of data older than the retention period (3 months by default) |
| `export_month_csv` | `year, month` | `string` | exports that month to CSV and returns the file path |
| `cleanup_old_data` | — | `number` | deletes records older than the retention period and returns the number deleted |

**Logs and autostart**

| Command | Arguments | Returns | Description |
|---|---|---|---|
| `get_recent_logs` | `limit` | `DebugLog[]` | most recent logs |
| `get_logs_by_level` | `level, limit` | `DebugLog[]` | filters by level |
| `get_log_stats` | — | `LogStats` | entry counts per level |
| `is_autostart_enabled` | — | `bool` | whether the registry value exists |
| `enable_autostart` / `disable_autostart` | — | — | write / delete `HKCU\…\CurrentVersion\Run\TokenMeter` |

## 3. Events

| Event | Emitted by | payload | Frontend behaviour |
|---|---|---|---|
| `usage-updated` | `poller.rs` after each successful poll; when `trigger_poll` finishes | — | refresh today's stats |
| `poll-status` | `poller.rs` / `commands.rs` (on **state changes**) | `{ id, name, ok, error? }` | update `pollStatus`; the overview and details show the failure reason |
| `models-changed` | after the add/edit child window saves | — | the main window re-fetches models + stats |
| `add-model-window-closed` | before the child window closes (save / cancel / Esc / unload fallback) | — | the main window releases its "stay expanded" lock |

## 4. Configuration file (`config.json` / `config.example.json`)

Path: the **working directory if it contains one, otherwise the directory of the exe** (resolved once at startup and
then shared by every read and write). UTF-8 JSON, camelCase fields:

    {
      "models": [
        {
          "id": "model-example",                 // generated by the frontend: model-<timestamp>-<random string>
          "name": "Example model",
          "provider": "deepseek-chat",           // the model field of the request body
          "apiEndpoint": "https://api.deepseek.com/v1/chat/completions",
          "apiKey": "put your API key here",
          "inputPrice": 0.001,                   // per 1K input tokens
          "outputPrice": 0.002,                  // per 1K output tokens
          "currency": "CNY",
          "responsePath": {
            "inputTokens": "usage.prompt_tokens",
            "outputTokens": "usage.completion_tokens",
            "totalTokens": "usage.total_tokens"
          }
        }
      ],
      "pollingInterval": 600000                  // milliseconds, 10 minutes by default
    }

Built-in templates (`MODEL_TEMPLATES` in `src/types.ts`): DeepSeek `deepseek-chat` (CNY 0.001/0.002),
MiMo `mimo-v2.5-pro` (endpoint `token-plan-cn.xiaomimimo.com`, price 0 — billed as a subscription, so only tokens are
counted), ChatGPT `gpt-4o` (USD 0.005/0.015).

## 5. Storage and statistical scope

- The SQLite file lives next to the configuration: `usage_data.db`
  - `usage_records`: id, model_id, provider, api_key_mask, timestamp, input/output/total_tokens, cost, ignored
  - `debug_logs`: id, timestamp, level, module, message, detail, user_id
- "Today" means the local-timezone day (`chrono::Local`); all statistics exclude rows with `ignored = 1`
  (amounts are estimates, displayed in the model's currency);
- The default retention period is 3 months; on startup, if older data is found, a dialog asks whether to export a CSV
  or clean up.

## 6. Conventions and error handling

- A failed command returns `Result::Err(String)`, and the frontend displays the text directly after catching it
  (for example in the "test connection" result area of the form);
- A failure for one model does not affect the other models or the next round; the transition from failure back to
  success is reported to the UI through `poll-status`;
- Command names are snake_case (the Tauri default), event names are kebab-case.

Window and drag details are in [architecture.md](architecture.md); build and troubleshooting are in [quick-start.md](quick-start.md).
