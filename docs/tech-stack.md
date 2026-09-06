# TokenMeter 用量表 — 技术栈说明

## 1. 技术栈总览

| 层 | 技术 | 版本（以清单文件为准） |
|---|---|---|
| 桌面框架 | Tauri（Rust） | `tauri` crate **1.5**；`tauri-build` 1.5 |
| 前端 | React + TypeScript | React ^18.2、TypeScript ^5.2 |
| 构建 | Vite | ^4.5 |
| 样式 | Tailwind CSS | ^3.3（postcss/autoprefixer） |
| 状态管理 | Zustand | ^4.4 |
| Tauri JS API | `@tauri-apps/api` | ^1.5 |
| Tauri CLI | `@tauri-apps/cli` | ^1.6.x |
| 包管理 | pnpm | — |
| 平台 | **仅 Windows**（WebView2） | — |

**明确不包含**：shadcn/ui、Recharts 或其他图表库、SQLite/rusqlite、keyring、任何数据库；无 ESLint/Prettier 相关脚本与依赖（package.json 中不存在）。

## 2. 前端依赖（package.json，真实）

```jsonc
{
  "name": "token-meter",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@tauri-apps/api": "^1.5.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^1.6.3",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.3.0",
    "typescript": "^5.2.0",
    "vite": "^4.5.0"
  }
}
```

- 运行时依赖极简：只有 React、Zustand 与 Tauri JS API——悬浮窗 UI 不需要组件库/图表/路由。
- `pnpm build` = `tsc && vite build`，输出到 `dist/`（被 Rust 以 custom-protocol 内嵌）。
- `pnpm tauri <...>` 直接透传 `@tauri-apps/cli`。

## 3. Rust 依赖（src-tauri/Cargo.toml，真实）

```toml
[package]
name = "token-meter"
version = "0.1.0"
edition = "2021"

[features]
custom-protocol = ["tauri/custom-protocol"]   # 生产构建内嵌前端 dist

[build-dependencies]
tauri-build = { version = "1.5", features = [] }

[dependencies]
tauri = { version = "1.5", features = ["http-all", "notification-all", "shell-open", "system-tray", "window-all"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
reqwest = { version = "0.11", features = ["json", "rustls-tls"], default-features = false }
tokio = { version = "1.0", features = ["full"] }
chrono = { version = "0.4", features = ["serde"] }
uuid = { version = "1.0", features = ["v4"] }
log = "0.4"
env_logger = "0.10"
```

要点：

- **无 rusqlite / SQLite**，无 keyring、无 tauri-plugin 类数据库依赖；
- `reqwest 0.11` 仅启用 `json` + `rustls-tls`（关闭默认特性，不使用系统 schannel），用于轮询请求与连接测试；
- `tauri` 特性：`window-all`（setSize/setPosition/startDragging 等窗口能力）、`system-tray`、`shell-open`、`notification-all`（仅开启权限，当前无通知功能）、`http-all`；
- `custom-protocol` feature 控制是否内嵌前端 `dist`。

## 4. 关键工程配置

### 4.1 tauri.conf.json（要点）

```jsonc
{
  "build": {
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build",
    "devPath": "http://localhost:1420",   // debug 模式加载的前端地址
    "distDir": "../dist"
  },
  "package": { "productName": "TokenMeter", "version": "0.1.0" },
  "tauri": {
    "allowlist": { /* window-* 全开；shell 仅 open；http/notification 全开 */ },
    "windows": [{
      "label": "main", "width": 300, "height": 160,
      "resizable": false, "transparent": true,
      "decorations": false, "alwaysOnTop": true, "skipTaskbar": true
    }],
    "systemTray": { "iconPath": "icons/icon.png", "iconAsTemplate": true },
    "security": { "csp": null },
    "bundle": { "targets": "nsis", "identifier": "com.tokenmeter.app" }
  }
}
```

- 主窗口初始 300×160，透明/无边框/置顶/skipTaskbar；运行时前端按 docked/hovering/expanded 状态 `setSize`（22×130 / 320×400 / 400×640）。
- 打包目标固定 **NSIS**（x64 安装包），不产出 macOS/Linux 包。

### 4.2 vite.config.ts

端口固定 **1420**（strictPort），`envPrefix: ['VITE_', 'TAURI_']`，构建目标随 `TAURI_PLATFORM` 取 chrome105（Windows）。

### 4.3 本机 cargo 配置（src-tauri/.cargo/config.toml）

该目录已被 `.gitignore` 忽略，是本机私有配置：把 `crates-io` 替换为本地稀疏镜像 `sparse+http://127.0.0.1:8765/`（`http.multiplexing = false`），用于绕开本机 cargo/.NET schannel TLS 的 `SEC_E_NO_CREDENTIALS` 故障。因此在 src-tauri 下直接执行 `cargo build` 前需先启动代理 `node tools\registry-proxy.mjs`，或直接使用一键脚本 `tools\build.ps1`。

## 5. 平台与运行时

- **仅 Windows**：依赖系统 WebView2（Windows 10 1803+ 自带）；窗口能力（透明、置顶、skipTaskbar、系统托盘）均为 Windows 语义。无 macOS/Linux 安装说明。
- 环境要求：
  - Rust stable（MSVC toolchain，`rustup` 安装）
  - Node.js 18+ 与 pnpm
  - WebView2 Runtime

## 6. 图标与资源

- 图标源：`tools/icon-source.png`；
- 生成：`tools/gen-icon.mjs` 产出源图 → `@tauri-apps/cli` 的 `tauri icon` 生成 `src-tauri/icons/` 全套（含 icon.ico、icon.icns、32x32.png、128x128.png、128x128@2x.png 及 Windows 商店尺寸等）。

## 7. 存储与配置

- 唯一持久化文件：**运行目录下的 `config.json`**（UTF-8 JSON），无数据库、无 %APPDATA% 数据目录、无历史用量落盘；
- 历史用量仅存内存（当天裁剪），退出即清空；
- API Key 以明文存放在 `config.json`，该文件已被 `.gitignore` 忽略、不入库；仓库提供脱敏示例 `config.example.json`。

详细结构见 [architecture.md](architecture.md)，配置文件字段与命令接口见 [api-design.md](api-design.md)。
