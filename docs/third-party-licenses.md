# TokenMeter — Third-Party Dependency Licenses

> **English** · [中文](#中文说明)

This application's build depends on a large number of open-source third-party libraries. The table below lists only **direct dependencies** and their licenses (for quick review);
the complete license text of each dependency package is distributed with the package (it can be found in `node_modules/` and in the local Cargo cache),
and the installer artifacts likewise comply with their license requirements.

> The complete, precise list (including all transitive dependencies) can be generated automatically with tools, for example:
> - Rust: `cargo install cargo-license && cargo license` (run under `src-tauri/`)
> - Frontend: `npx license-checker --production` or `pnpm licenses list`

## Frontend runtime dependencies

| Dependency | Version | License | Purpose |
|------|------|--------|------|
| @tauri-apps/api | 1.6.0 | MIT / Apache-2.0 | Tauri frontend API (invoke/window/event) |
| react | 18.3.1 | MIT | UI framework |
| react-dom | 18.3.1 | MIT | React DOM rendering |
| zustand | 4.5.7 | MIT | State management |

## Frontend build/development dependencies

| Dependency | Version | License | Purpose |
|------|------|--------|------|
| vite | 4.5.14 | MIT | Build tool |
| typescript | 5.9.3 | Apache-2.0 | Type system |
| tailwindcss | 3.4.19 | MIT | Styling |
| postcss | 8.5.28 | MIT | CSS processing |
| autoprefixer | 10.5.5 | MIT | CSS vendor prefixes |
| @vitejs/plugin-react | 4.7.0 | MIT | React plugin |
| @tauri-apps/cli | 1.6.3 | MIT / Apache-2.0 | tauri packaging/icon commands |
| @types/react / @types/react-dom | 18.x | MIT | Type definitions |

## Rust backend direct dependencies

| Dependency | Version | License | Purpose |
|------|------|--------|------|
| tauri | 1.8.3 | MIT / Apache-2.0 | Desktop application framework |
| tauri-build | 1.5.6 | MIT / Apache-2.0 | Build script |
| serde / serde_json | 1.0.x | MIT / Apache-2.0 | Serialization/deserialization |
| reqwest | 0.11.27 | MIT / Apache-2.0 | HTTP client (rustls-tls) |
| tokio | 1.53.1 | MIT | Async runtime |
| chrono | 0.4.45 | MIT / Apache-2.0 | Time handling |
| log | 0.4.34 | MIT / Apache-2.0 | Logging facade |
| env_logger | 0.10.2 | MIT / Apache-2.0 | Log output |
| rusqlite | 0.31 (bundled) | MIT | Local SQLite persistence |
| single-instance | 0.3 | MIT | Single-instance mutex |
| winreg | 0.52 | MIT | Launch-at-startup registry key |
| dirs / hostname / uuid | 5.0 / 0.3 / 1.x | MIT / Apache-2.0 | Debug-log user identifier |

## Packaging-related

| Component | License | Notes |
|------|--------|------|
| NSIS (packaging tool, downloaded at build time) | zlib License | Generates the Windows installer |
| WebView2 Runtime (target-machine runtime) | Microsoft proprietary (redistributable) | Installed as a dependency by the Tauri application |
| SQLite (bundled source) | Public Domain | Compiled into the artifact by rusqlite's bundled feature |

## Notes

- The project icon is generated originally by `tools/gen-icon.mjs` (MIT, see `LICENSE`) and does not involve any third-party assets.
- If you distribute this application as a binary, please also include this file together with the complete license texts of the affected dependencies.

---

# 中文说明

本应用构建依赖大量开源第三方库。下表仅列出**直接依赖**及其许可证（便于快速核查）；
每个依赖包的完整许可证文本随包分发（`node_modules/` 与 Cargo 本地缓存中可找到），
随安装包产物一并遵循其许可要求。

> 完整精确清单（含全部传递依赖）可用工具自动生成，例如：
> - Rust：`cargo install cargo-license && cargo license`（在 `src-tauri/` 下执行）
> - 前端：`npx license-checker --production` 或 `pnpm licenses list`

## 前端运行时依赖

| 依赖 | 版本 | 许可证 | 用途 |
|------|------|--------|------|
| @tauri-apps/api | 1.6.0 | MIT / Apache-2.0 | Tauri 前端 API（invoke/window/event） |
| react | 18.3.1 | MIT | UI 框架 |
| react-dom | 18.3.1 | MIT | React DOM 渲染 |
| zustand | 4.5.7 | MIT | 状态管理 |

## 前端构建/开发依赖

| 依赖 | 版本 | 许可证 | 用途 |
|------|------|--------|------|
| vite | 4.5.14 | MIT | 构建工具 |
| typescript | 5.9.3 | Apache-2.0 | 类型系统 |
| tailwindcss | 3.4.19 | MIT | 样式 |
| postcss | 8.5.28 | MIT | CSS 处理 |
| autoprefixer | 10.5.5 | MIT | CSS 兼容前缀 |
| @vitejs/plugin-react | 4.7.0 | MIT | React 插件 |
| @tauri-apps/cli | 1.6.3 | MIT / Apache-2.0 | tauri 打包/图标命令 |
| @types/react / @types/react-dom | 18.x | MIT | 类型定义 |

## Rust 后端直接依赖

| 依赖 | 版本 | 许可证 | 用途 |
|------|------|--------|------|
| tauri | 1.8.3 | MIT / Apache-2.0 | 桌面应用框架 |
| tauri-build | 1.5.6 | MIT / Apache-2.0 | 构建脚本 |
| serde / serde_json | 1.0.x | MIT / Apache-2.0 | 序列化/反序列化 |
| reqwest | 0.11.27 | MIT / Apache-2.0 | HTTP 客户端（rustls-tls） |
| tokio | 1.53.1 | MIT | 异步运行时 |
| chrono | 0.4.45 | MIT / Apache-2.0 | 时间处理 |
| log | 0.4.34 | MIT / Apache-2.0 | 日志门面 |
| env_logger | 0.10.2 | MIT / Apache-2.0 | 日志输出 |
| rusqlite | 0.31（bundled） | MIT | 本地 SQLite 持久化 |
| single-instance | 0.3 | MIT | 单实例互斥体 |
| winreg | 0.52 | MIT | 开机自启动注册表项 |
| dirs / hostname / uuid | 5.0 / 0.3 / 1.x | MIT / Apache-2.0 | 调试日志的用户标识 |

## 打包相关

| 组件 | 许可证 | 说明 |
|------|--------|------|
| NSIS（打包工具，构建期下载） | zlib License | 生成 Windows 安装器 |
| WebView2 Runtime（目标机运行时） | Microsoft 专有（可再发行） | 由 Tauri 应用作为依赖安装 |
| SQLite（bundled 源码） | Public Domain | 由 rusqlite 的 bundled 特性编译进产物 |

## 备注

- 本项目图标由 `tools/gen-icon.mjs` 原创生成（MIT，见 `LICENSE`），不涉及第三方素材。
- 若以二进制分发本应用，请同时附上本文件与受影响依赖的完整许可证文本。
