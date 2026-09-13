# TokenMeter 用量表 — 技术栈

[English](tech-stack.md) | **中文**

## 1. 总览

| 层 | 技术 | 版本（以清单文件为准） |
|---|---|---|
| 桌面框架 | Tauri（Rust） | `tauri` 1.5 / `tauri-build` 1.5 |
| 前端 | React + TypeScript | ^18.2 / ^5.2 |
| 构建 | Vite | ^4.5（Tailwind ^3.4 + postcss/autoprefixer） |
| 状态管理 | Zustand | ^4.4 |
| Tauri JS API / CLI | `@tauri-apps/api` / `@tauri-apps/cli` | ^1.5 / ^1.6 |
| 存储 | SQLite（`rusqlite`，bundled） | 0.31 |
| 平台 | 仅 Windows（WebView2） | — |

## 2. 前端依赖（`package.json`）

| 包 | 版本 | 用途 |
|---|---|---|
| `react` / `react-dom` | ^18.2 | UI |
| `zustand` | ^4.4 | 全局状态（模型/统计/贴边状态） |
| `@tauri-apps/api` | ^1.5 | `invoke` / 事件 / 窗口 API |
| 开发依赖 | — | `typescript`、`vite`、`@vitejs/plugin-react`、`tailwindcss`、`autoprefixer`、`postcss`、`@tauri-apps/cli`、`@types/react(-dom)` |

脚本：`dev`=`vite`、`build`=`tsc && vite build`、`preview`、`tauri`、`test:geometry`=`node tools/test-window-geometry.cjs`。

**刻意不引入**：组件库（shadcn/ui 等）、图表库（趋势图是手写 SVG）、路由、ESLint/Prettier。

## 3. Rust 依赖（`src-tauri/Cargo.toml`）

| crate | 版本 | 用途 |
|---|---|---|
| `tauri` | 1.5 | 运行时；features 只开 `system-tray` + 9 个细粒度 `window-*` |
| `tauri-build` | 1.5 | 构建期校验 + 资源嵌入 |
| `reqwest` | 0.11 | 轮询/测试请求，仅 `json`+`rustls-tls`（不用系统 schannel） |
| `tokio` | 1.x | 异步运行时（full） |
| `serde` / `serde_json` | 1.0 | 配置与 IPC 序列化 |
| `chrono` | 0.4 | 本地时区切日、时间戳 |
| `rusqlite` | 0.31（bundled） | SQLite 持久化（自带 SQLite 源码，无需系统库） |
| `log` + `env_logger` | 0.4 / 0.10 | 日志（默认 info） |
| `single-instance` | 0.3 | 单实例互斥体 |
| `winreg` | 0.52 | 开机自启动注册表项 |
| `dirs` / `hostname` / `uuid` | 5.0 / 0.3 / 1.0 | 调试日志的用户标识（机器名 + 随机段） |

要点：

- `features = { custom-protocol = ["tauri/custom-protocol"] }` 决定是否内嵌前端 `dist`；
- **Cargo 的 `tauri` features 必须与 `tauri.conf.json` 的 `allowlist.window` 一一对应**，
  `tauri-build` 会在构建期校验，改一处必须同步另一处；
- 未使用的能力（`http-all` / `notification-all` / `shell-open` / `window-all`）一律不开。

## 4. 关键工程配置

**`tauri.conf.json`**

| 项 | 值/要点 |
|---|---|
| 主窗口 | `label: main`、22×130（首帧即贴边竖条）、`transparent`、`decorations: false`、`alwaysOnTop`、`skipTaskbar`、`resizable: false` |
| allowlist | `all: false`；window 只开 create/show/hide/close/setFocus/unminimize/setSize/setPosition/startDragging |
| CSP | 非空保守策略（`default-src 'self'`、`script-src 'self'`、`object-src 'none'` 等） |
| 打包 | `targets: nsis`、`identifier: com.tokenmeter.app`、图标 icons/* |
| 构建 | `beforeDevCommand: pnpm dev`、`beforeBuildCommand: pnpm build`、`devPath: http://localhost:1420`、`distDir: ../dist` |

**`vite.config.ts`**：端口固定 1420（strictPort）、`envPrefix: ['VITE_','TAURI_']`、Windows 构建目标 chrome105。

**可选本地 cargo 源替换**：受限网络下可在 `src-tauri/.cargo/config.toml` 指向本地镜像
（`tools/registry-proxy.mjs`，默认 `http://127.0.0.1:8765/`）；该目录属本机私有配置，勿提交。

## 5. 平台与运行时

- 仅 Windows：窗口透明/置顶/skipTaskbar/托盘均为 Windows 语义；依赖系统 WebView2；
- 环境：Rust stable（MSVC）、Node ≥ 22.2 + pnpm、WebView2 Runtime。

## 6. 图标

`tools/gen-icon.mjs` 生成 1024² 源图 → `pnpm tauri icon <源图>` 产出 `src-tauri/icons/` 全套（ico/icns/各尺寸 png）。

## 7. 存储与配置

- `config.json`：模型列表 + `pollingInterval`（工作目录优先，否则 exe 目录）；
- `usage_data.db`：SQLite，两张表 `usage_records`（用量，含 `ignored` 标记）与 `debug_logs`（调试日志）；
- 无云端、无遥测；除上述两个文件外不写任何用户目录。

细节见 [architecture.ZH.md](architecture.ZH.md)，字段与命令见 [api-design.ZH.md](api-design.ZH.md)。
