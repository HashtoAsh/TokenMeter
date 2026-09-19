# TokenMeter — Documentation

> **English** · [中文](#文档说明)

TokenMeter is a **Windows desktop overlay** that periodically probes the token usage and cost of OpenAI-compatible
LLM APIs. For an overview of the project see the repository root [README.md](../README.md).

## Documents

| Document | Contents |
|---|---|
| [quick-start.md](quick-start.md) | environment, build and packaging, usage, FAQ |
| [architecture.md](architecture.md) | module breakdown, data flow, window state machine, SQLite storage |
| [api-design.md](api-design.md) | Tauri commands and events, config schema, polling requests and parsing |
| [tech-stack.md](tech-stack.md) | the actual dependency list and key engineering configuration |
| [progress.md](progress.md) | change history and root-cause notes |
| [third-party-licenses.md](third-party-licenses.md) | third-party dependency licenses |
| [config.example.json](config.example.json) | configuration template |

## Project at a glance

- Desktop framework: Tauri 1.x (Rust), Windows only (WebView2); the main window is transparent, borderless,
  always-on-top and skipped in the taskbar
- Frontend: React 18 + TypeScript + Vite 4 + Tailwind CSS 3 + Zustand 4
- Backend: Rust (tauri / reqwest(rustls) / tokio / serde / chrono / rusqlite / log)
- Persistence: SQLite (`usage_data.db`, usage records + debug logs) plus one JSON config (`config.json`)
- Interaction: edge-docked bar → hover overview → click for details; a separate window adds/edits models;
  history queries and CSV export
- Providers: 8 built-in templates (DeepSeek / MiMo / Qwen / Kimi / GLM / MiniMax / ChatGPT / OpenRouter)

---

# 文档说明

TokenMeter 是一个 **Windows 桌面悬浮窗**，定期探测 OpenAI 兼容大模型 API 的 token 用量和费用。
项目概览见仓库根目录 [README.md](../README.md)。

## 文档列表

| 文档 | 内容 |
|---|---|
| [quick-start.md](quick-start.md) | 环境、构建与打包、使用说明、FAQ |
| [architecture.md](architecture.md) | 模块划分、数据流、窗口状态机、SQLite 存储 |
| [api-design.md](api-design.md) | Tauri 命令与事件、config schema、轮询请求与解析 |
| [tech-stack.md](tech-stack.md) | 真实依赖清单与关键工程配置 |
| [progress.md](progress.md) | 改进历史与问题根因记录 |
| [third-party-licenses.md](third-party-licenses.md) | 第三方依赖许可证 |
| [config.example.json](config.example.json) | 配置模板 |

## 项目概览

- 桌面框架：Tauri 1.x (Rust)，仅 Windows（WebView2）；主窗口透明、无边框、置顶、不进任务栏
- 前端：React 18 + TypeScript + Vite 4 + Tailwind CSS 3 + Zustand 4
- 后端：Rust（tauri / reqwest(rustls) / tokio / serde / chrono / rusqlite / log）
- 持久化：SQLite（`usage_data.db`，用量记录 + 调试日志）+ JSON 配置（`config.json`）
- 交互：贴边竖条 → hover 概览 → 点击详情；独立窗口添加/编辑模型；历史查询与 CSV 导出
- Provider：8 个内置模板（DeepSeek / MiMo / 千问 / Kimi / 智谱GLM / MiniMax / ChatGPT / OpenRouter）
