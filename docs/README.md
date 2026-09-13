# TokenMeter 文档索引

TokenMeter 是一个 **Windows 桌面悬浮窗应用**：定时探测 OpenAI 兼容大模型 API 的 token 用量与费用。
项目总览见仓库根 [README.md](../README.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [quick-start.md](quick-start.md) | 环境、构建与打包、使用说明、常见问题 |
| [architecture.md](architecture.md) | 模块划分、数据流、窗口状态机、SQLite 存储、打包形态 |
| [api-design.md](api-design.md) | Tauri 命令与事件、config schema、轮询请求与解析 |
| [tech-stack.md](tech-stack.md) | 真实依赖清单与关键工程配置 |

## 项目速览

- 桌面框架：Tauri 1.x（Rust），仅 Windows（WebView2）；主窗口透明、无边框、置顶、skipTaskbar
- 前端：React 18 + TypeScript + Vite 4 + Tailwind CSS 3 + Zustand 4
- 后端：Rust（tauri / reqwest(rustls) / tokio / serde / chrono / rusqlite / log）；`main.rs` 内 `mod` 组织，无 lib.rs
- 持久化：SQLite（`usage_data.db`，用量记录 + 调试日志）+ 一份 JSON 配置（`config.json`）
- 交互：贴边竖条 → hover 概览 → 点击详情；独立窗口添加/编辑模型；历史查询与 CSV 导出

仓库根的其他文件：`config.example.json`（配置模板）、`PROGRESS.md`（改进历史）、
`output/`（发布产物）、`tools/`（构建与图标脚本、几何回归测试）。
