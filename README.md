# TokenMeter 用量表

> **English** · [中文](#中文说明)

A lightweight Windows desktop overlay: at a fixed interval it sends one minimal request to each configured LLM API,
reads the token usage from the response and converts it into a cost, then stays docked to the edge of the screen so
you can glance at today's spend whenever you like.

> **What the numbers cover**: only the poll/test requests that TokenMeter **itself** sends (the `usage` field in a
> response covers a single request). They are not the account's total consumption in other tools.

## Features

| Capability | Description |
|---|---|
| Edge-docked overlay | Transparent, borderless, always-on-top, hidden from the taskbar; normally a 22×130 vertical bar |
| Three-state interaction + edge snapping | Bar → hover for the overview → click for details; drag near a screen edge (<32px) and release to dock |
| Multi-model management | 8 built-in templates (DeepSeek / MiMo / Qwen / Kimi / GLM / MiniMax / ChatGPT / OpenRouter), add & edit |
| Cost estimation | input/output tokens ÷ 1000 × unit price, displayed in the model's currency (¥ / $ / € …) |
| Today's stats | request count, input/output/total tokens and today's cost; day rolls over at midnight in the **local timezone** |
| History | per-day details by API key / model / total, 7-day cost trend, monthly CSV export, anomalous records can be ignored |
| Scheduled polling | every 10 minutes by default (`pollingInterval`); manual poll available; failures shown in the overview |
| Data retention | local SQLite (`usage_data.db`), 3 months by default; on startup offers CSV export or cleanup |
| Desktop integration | system tray, launch at startup (registry), single instance, minimal window permissions + conservative CSP |
| Security | API Key encrypted in config (XOR + hex), auto-migration from plaintext; global ErrorBoundary |

## Quick start

Requirements: Windows 10/11 + WebView2 Runtime + Rust (MSVC) + Node.js ≥ 22.2 + pnpm.

    pnpm install
    pnpm tauri dev                                 # dev: Vite(1420) + debug backend, frontend hot reload
    pnpm tauri build --features custom-protocol    # package: NSIS installer
    node tools/test-window-geometry.cjs            # regression test for docking/expanding geometry (22 assertions)

Artifacts:

- Installer `src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`
- Portable build `cargo build --release --features custom-protocol` → `src-tauri\target\release\TokenMeter.exe`

`--features custom-protocol` is required; without it the frontend `dist` is not embedded and the app shows a blank
screen at runtime. See [docs/quick-start.md](docs/quick-start.md) for details.

## First run

1. Tray/bar → detail panel → **+ Add** → pick a template or fill in the fields → **Test connection** → Save
2. Fields: name, model ID (the request body's `model`), the full `…/chat/completions` URL, API key,
   input/output price per 1K tokens, and currency
3. For an existing model, click **Edit** to change the key / price / endpoint; **↻ Poll** refreshes today's usage
4. The History tab queries a given day's details by "by key / by model / total" and exports them to CSV

## Configuration

At runtime the app reads and writes `config.json` in the **working directory** (dev) or the **directory of the exe**
(installed build), and generates the defaults on first launch:

    {
      "models": [ /* model list, see docs/config.example.json for a sample */ ],
      "pollingInterval": 600000   // polling interval in milliseconds, 10 minutes by default
    }

- `models[].responsePath` accepts dot paths and array indexes, e.g. `usage.prompt_tokens`, `choices[0].usage.total_tokens`;
- A corrupt config (JSON parse failure) is first backed up to `config.json.bak.<timestamp>` and only then reset;
- Fields and command interfaces are documented in [docs/api-design.md](docs/api-design.md).

## Project layout

    TokenMeter/
    ├── src/                      # frontend: React 18 + TS + Tailwind + Zustand
    │   ├── App.tsx               # the three states; the single entry point from dock state to window geometry
    │   ├── layout.ts             # per-state sizes, snapping/cooldown/animation parameters
    │   ├── lib/                  # windowGeometry (pure geometry) / windowTauri (execution layer) / addModelWindow (child window)
    │   ├── hooks/useWindowDrag.ts# drag + edge snapping
    │   ├── components/           # FloatingBar / QuickInfo / DetailPanel / ModelManager / HistoryPanel …
    │   └── stores/useStore.ts    # Zustand: models/stats/edgeState/dockSide + invoke wrappers
    ├── src-tauri/                # backend: Rust + Tauri 1.x
    │   ├── src/                  # main.rs / commands.rs / poller.rs / storage.rs / models.rs / crypto.rs
    │   ├── tauri.conf.json       # window, allowlist, CSP, bundle targets
    │   └── Cargo.toml
    ├── tools/                    # build.ps1 / registry-proxy.mjs / gen-icon.mjs / test-window-geometry.cjs
    ├── docs/                     # architecture / API / quick start / tech stack / third-party licenses
    ├── output/                   # release artifacts (installer + portable build)
    └── LICENSE                   # MIT

## Documentation

- [docs/quick-start.md](docs/quick-start.md) — environment, build and packaging, usage, troubleshooting
- [docs/architecture.md](docs/architecture.md) — module breakdown, data flow, window state machine, storage
- [docs/api-design.md](docs/api-design.md) — Tauri commands and events, config schema, HTTP request shape
- [docs/tech-stack.md](docs/tech-stack.md) — the actual dependency list and key engineering configuration
- [docs/progress.md](docs/progress.md) — change history and root-cause notes
- [docs/third-party-licenses.md](docs/third-party-licenses.md) — third-party dependency licenses

## Changelog

### v0.1.0

- Three-state overlay interaction, drag and edge snapping, system tray
- Model management (8 templates including DeepSeek / MiMo / Qwen / Kimi / GLM / MiniMax / ChatGPT / OpenRouter)
- Automatic polling every 10 minutes; today's token/cost stats (local-timezone day boundary, per-currency display)
- SQLite persistence, history queries and monthly CSV export, record ignoring, retention policy, launch at startup
- Single instance; window permissions declared only where used + conservative CSP
- API Key encrypted in config; global ErrorBoundary; Mutex poison handling; graceful DB init failure
- Tauri 1.x + single-file NSIS installer

## License

[MIT](LICENSE) (third-party components: [docs/third-party-licenses.md](docs/third-party-licenses.md))

---

# 中文说明

轻量级 Windows 桌面悬浮窗：按固定间隔向已配置的大模型 API 发一次最小请求，读取响应中的 token 用量并折算费用，
贴边常驻屏幕边缘，随时瞄一眼今日消耗。

> **统计口径**：只统计 TokenMeter **自己发出的轮询/测试请求**（响应 `usage` 是单次请求口径），
> 不代表该账号在其它工具上的全部消耗。

## 特性

| 能力 | 说明 |
|---|---|
| 贴边悬浮窗 | 透明、无边框、置顶、不进任务栏；常态是一条 22×130 竖条 |
| 三态交互 + 边缘吸附 | 竖条 → 鼠标移入概览 → 点击详情；拖动贴近屏幕边缘（<32px）松手自动贴边 |
| 多模型管理 | 内置 8 个模板（DeepSeek / MiMo / 千问 / Kimi / 智谱GLM / MiniMax / ChatGPT / OpenRouter），可添加与编辑 |
| 费用估算 | 输入/输出 tokens ÷ 1000 × 单价，按模型币种（¥ / $ / € …）显示 |
| 今日统计 | 请求次数、输入/输出/总 tokens、今日费用；按**本地时区**零点切日 |
| 历史查询 | 按 API Key / 模型 / 总计查某日明细，近 7 天费用趋势，导出月度 CSV，可忽略异常记录 |
| 定时轮询 | 默认每 10 分钟一次（`pollingInterval`），详情面板可 ↻ 手动轮询；失败会在概览与详情中提示原因 |
| 数据留存 | 本地 SQLite（`usage_data.db`：用量记录 + 调试日志），默认保留 3 个月，启动时提示导出 CSV 或清理 |
| 桌面集成 | 系统托盘、开机自启动（写注册表）、单实例运行、窗口权限最小化 + 保守 CSP |
| 安全 | API Key 加密存储（XOR + hex），明文自动迁移；全局 ErrorBoundary |

## 快速开始

环境：Windows 10/11 + WebView2 Runtime + Rust（MSVC）+ Node.js ≥ 22.2 + pnpm。

    pnpm install
    pnpm tauri dev                                 # 开发：Vite(1420) + debug 后端，前端热更新
    pnpm tauri build --features custom-protocol    # 打包：NSIS 安装包
    node tools/test-window-geometry.cjs            # 贴边/展开几何的回归测试（22 项断言）

产物：

- 安装包 `src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`
- 便携版 `cargo build --release --features custom-protocol` → `src-tauri\target\release\TokenMeter.exe`

必须带 `--features custom-protocol`，否则前端 `dist` 不会被内嵌，运行时会白屏。详见 [docs/quick-start.md](docs/quick-start.md)。

## 首次使用

1. 托盘/悬浮条 → 详情面板 → **+ 添加** → 选模板或手填 → **测试连接** → 保存
2. 需要填写：名称、模型 ID（即请求体 `model`）、完整 `…/chat/completions` 地址、API Key、
   每 1K tokens 的输入/输出单价、币种
3. 既有模型可点 **编辑** 修改 Key / 价格 / 端点；**↻ 轮询** 手动刷新一次今日用量
4. 历史页可切"按 Key / 按模型 / 总计"查询某日明细并导出 CSV

## 配置

运行时在**工作目录**（开发）或 **exe 所在目录**（安装版）读写 `config.json`，首次启动自动生成默认值：

    {
      "models": [ /* 模型列表，示例见 docs/config.example.json */ ],
      "pollingInterval": 600000   // 轮询间隔（毫秒），默认 10 分钟
    }

- `models[].responsePath` 支持点号与数组下标，如 `usage.prompt_tokens`、`choices[0].usage.total_tokens`；
- 配置损坏（JSON 解析失败）会先备份为 `config.json.bak.<时间戳>` 再重置，不会静默清空；
- 字段与命令接口见 [docs/api-design.md](docs/api-design.md)。

## 许可证

[MIT](LICENSE)（第三方组件见 [docs/third-party-licenses.md](docs/third-party-licenses.md)）
