# TokenMeter 用量表 — 文档索引

TokenMeter 是一个 **Windows 桌面悬浮窗应用**：监控 OpenAI 兼容大模型 API 的 token 用量与费用。
本目录为其工程文档，项目总览见仓库根 [README.md](../README.md)。

## 文档列表

| 文档 | 内容 |
|---|---|
| [quick-start.md](quick-start.md) | 环境要求、构建/打包、使用说明、常见问题 |
| [architecture.md](architecture.md) | 整体架构：模块划分、数据流、前后端设计、打包形态 |
| [api-design.md](api-design.md) | 接口协议：Tauri 命令与事件、轮询/测试请求与解析、配置 schema |
| [tech-stack.md](tech-stack.md) | 技术栈：真实依赖清单与工程配置 |

## 仓库根目录相关文件

- `LICENSE`：MIT 许可证。
- `THIRD_PARTY_LICENSES.md`：汇总引用（含内嵌分发）的第三方组件许可证，发布前请对照核对。
- `config.example.json`：配置模板（示例）；复制为 `config.json` 填写即可，字段见 [api-design.md](api-design.md)。
- `tools/`：`build.ps1`（Windows 一键构建，网络受限时自动回退本地镜像）、
  `registry-proxy.mjs`（可选的本地 crates 镜像代理）、`gen-icon.mjs`（图标源图生成）。

## 项目速览

- 桌面框架：Tauri 1.x（Rust），仅 Windows（WebView2）；窗口透明、无边框、置顶、skipTaskbar。
- 前端：React 18 + TypeScript + Vite 4 + Tailwind CSS 3 + Zustand 4。
- 后端：Rust（tauri / reqwest(rustls) / tokio / serde / chrono / log），`main.rs` 内 `mod` 组织，无 lib.rs。
- 存储：仅一份 JSON 配置文件（无数据库、无历史落盘），今日用量存内存、次日自动清零。
- 功能：10 分钟轮询一次，今日 token 用量与费用统计（本地时区切日、按币种显示）；
  悬浮条 → hover 概览 → 点击详情；独立窗口添加/编辑模型（内置模板）。
- 安装包：`src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`。
