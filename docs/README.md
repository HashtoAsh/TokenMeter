# TokenMeter 用量表 — 文档索引

本目录是 TokenMeter（Windows 桌面悬浮窗应用，监控 OpenAI 兼容大模型 API 的 token 用量与费用）的工程文档。

## 文档列表

| 文档 | 内容 |
|---|---|
| [architecture.md](architecture.md) | 整体架构：模块划分、数据流、前后端设计、真实目录结构、打包形态 |
| [tech-stack.md](tech-stack.md) | 技术栈：真实依赖清单（Tauri 1.5 / React 18 / Vite 4 / Tailwind 3 / Zustand 4）、工程配置、平台约束 |
| [api-design.md](api-design.md) | 接口协议：Tauri 命令与事件、HTTP 轮询/测试请求与响应解析、config.json schema |
| [quick-start.md](quick-start.md) | 快速上手：环境要求、构建/打包（Windows）、使用说明、常见问题 |

## 仓库根目录相关文件

- `THIRD_PARTY_LICENSES.md`：汇总本仓库引用（含内嵌分发）的第三方组件及其许可证，发布前请对照核对。
- `LICENSE`：MIT 许可证。
- `config.example.json`：`config.json` 的脱敏示例（`config.json` 含真实 API Key，已 gitignore、不入库）。
- `tools/`：`build.ps1`（Rust 一键构建）、`registry-proxy.mjs`（本地 crates 镜像代理，绕 schannel TLS 故障）、`gen-icon.mjs`（图标生成）。

## 项目速览

- 桌面框架：Tauri 1.5（Rust），仅 Windows（WebView2）；窗口透明、无边框、置顶、skipTaskbar。
- 前端：React 18 + TypeScript + Vite 4 + Tailwind CSS 3 + Zustand 4。
- 后端：Rust（tauri / serde / reqwest(rustls) / tokio / chrono / uuid / log），`main.rs` 内 `mod` 组织，无 lib.rs。
- 存储：运行目录 `config.json`（UTF-8 JSON），**无数据库**。
- 功能：5 分钟轮询一次，今日 token 用量与费用统计；悬浮条 → hover 信息面板 → 点击详情；独立窗口添加模型（支持模板）。
- 安装包：`src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`。

> 项目说明与根目录总览见仓库根 `README.md`。
