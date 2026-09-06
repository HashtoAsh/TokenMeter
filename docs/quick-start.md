# TokenMeter 用量表 — 快速上手（Windows）

> TokenMeter 只在 Windows 上开发与打包。本文面向开发者：构建运行、打包安装与常见问题。
> 终端用户直接安装发布版 exe 即可，无需以下开发环境。

## 1. 安装包

正式安装包由 NSIS 打包产出：

```
src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe
```

## 2. 环境要求（Windows）

| 组件 | 说明 |
|---|---|
| Rust | stable，MSVC toolchain（`rustup toolchain install stable-x86_64-pc-windows-msvc`） |
| Node.js 18+ | 与 pnpm（`npm i -g pnpm`） |
| WebView2 Runtime | Windows 10 1803+ 通常已内置（应用依赖它渲染前端） |
| Visual C++ Build Tools | Rust MSVC 链接所需 |

无需 macOS/Linux 工具链。

## 3. 构建与运行

### 3.1 安装依赖

```powershell
pnpm install          # 前端依赖
```

Rust 依赖由 cargo 在构建时拉取（见下方网络注意事项）。

### 3.2 本地开发（前端热更新）

```powershell
pnpm tauri dev
```

等价于：先 `pnpm dev` 起 Vite（端口 **1420**），再在 `src-tauri` 下 debug 构建并运行——debug 模式会去加载 `devPath: http://localhost:1420`。

> 注意：`src-tauri\.cargo\config.toml`（本机私有、已 gitignore）把 crates-io 指向本地代理 `127.0.0.1:8765`。直接跑 cargo/tauri 前先启动代理：`node tools\registry-proxy.mjs`；推荐直接用下面的一键脚本。

### 3.3 一键构建 Rust 后端（推荐）

```powershell
powershell -ExecutionPolicy Bypass -File tools\build.ps1
```

脚本逻辑（`tools/build.ps1`）：

1. 先试普通 `cargo fetch`；
2. 失败（本机 cargo/.NET schannel TLS 报 `SEC_E_NO_CREDENTIALS`）→ 自动启动 `tools\registry-proxy.mjs`（本地 Node 稀疏镜像，`127.0.0.1:8765`，`http.multiplexing=false`）并配置 `CARGO_HOME` 指向可写缓存目录以**续传**已有下载；
3. 最终以 `cargo build --features custom-protocol` 构建。

首次代理拉取约 430 个 crate（1–3 分钟），之后走缓存。

### 3.4 前端产物与独立 exe

```powershell
pnpm build                          # tsc && vite build → dist/
# 前端 dist 由 Rust 以 custom-protocol feature 内嵌：
#   进入 src-tauri 后执行（确保代理可用）：
#     cargo build --features custom-protocol
#   否则 debug 构建会尝试加载 http://localhost:1420 而白屏
```

### 3.5 正式打包

```powershell
pnpm tauri build                    # 其 beforeBuildCommand 会先执行 pnpm build
```

产物：`src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`。

## 4. 使用说明

- **系统托盘**：右键图标 → 显示主窗口 / 隐藏主窗口 / 退出（无设置菜单）。
- **悬浮窗三态交互**：

```
docked 贴边竖条 (22×130) ──鼠标移入──▶ hovering 信息面板 (320×400)
   ▲                                       │ 点击
   │               收起 ◀───────────────────▼
   └────────────── expanded 详情面板 (400×640)
```

  - 竖条/信息面板/详情面板整块按住拖动；松手时窗口贴近屏幕任一边缘（<32px）会自动**吸附贴边**并收起为 docked 竖条。
  - 窗口默认贴右缘，展开时向左生长避免超出屏幕。
- **查看统计**：详情面板顶部“↻ 轮询”可手动触发一次全模型轮询（真实发请求）；底部为该模型的今日统计（请求次数 / 输入、输出、总 Tokens / 今日总费用，费用保留 4 位小数）。
- **添加模型**：详情面板“+ 添加”弹出独立窗口（`add-model`，480×660，`index.html?add=1`）。表单含：
  - 快速选择模板：DeepSeek（`deepseek-chat`）、MiMo（`mimo-v2.5-pro`，token-plan-cn 端点，价格 0——Token Plan 按 Credits 计费只统计 token）、ChatGPT（`gpt-4o`）；
  - 模型名称、模型ID（即请求体 `model`，如 `deepseek-chat`）、API 地址（**完整** chat/completions URL）、API Key（password 输入框）；
  - 输入/输出价格：**每 1K tokens** 单价；
  - 高级设置：响应解析路径（默认 `usage.prompt_tokens` / `usage.completion_tokens` / `usage.total_tokens`，按点路径取数）；
  - “测试连接”先验证（成功后显示“连接成功”），再“保存”——保存后自动关闭窗口，主窗口刷新列表与统计。
- **轮询机制**：应用启动后后台每 5 分钟（`pollingInterval`，默认 300000ms）向各模型发一次最小请求读取用量；今日用量仅存内存、当天数据次日自动清零。

## 5. 配置文件

- 运行时配置在 **运行目录的 `config.json`**（UTF-8 JSON；不读 %APPDATA%）。
  - 不存在时按默认值创建：`pollingInterval: 300000`、`window: { edgePosition: "right", opacity: 0.9 }`、`models: []`；
  - 模型、窗口配置、轮询间隔的修改都会即时写回该文件；
  - **该文件含真实 API Key（明文）**，已被 `.gitignore` 忽略，绝不能入库。
- 仓库根目录 `config.example.json` 是脱敏示例（占位 Key、含一个示例模型），字段说明见 [api-design.md](api-design.md) §5。

## 6. 常见问题

**Q1：cargo 拉取依赖失败 / 报 `SEC_E_NO_CREDENTIALS`（schannel TLS）？**
本机 cargo/.NET 的 schannel TLS 在受限环境下不可用。使用 `tools\build.ps1`（自动启用本地代理）构建；构建时建议关闭 DevSidecar 以免端口/代理互相干扰。

**Q2：应用启动白屏/WebView2 报“资源在使用中 / 0x800700AA”？**
删除 `%LOCALAPPDATA%\com.tokenmeter.app` 缓存目录后重启应用。

**Q3：`pnpm build` 后直接 `cargo run` 白屏？**
debug 构建默认加载 `http://localhost:1420`。要么保持 `pnpm dev` 运行，要么用 `cargo build --features custom-protocol` 构建内嵌前端的 exe。

**Q4：如何重生成图标？**
`node tools\gen-icon.mjs` 生成源图，再在 `src-tauri` 下执行 `npx tauri icon <源图路径>`（或 `pnpm tauri icon`）重生成 `icons/` 全套。

## 7. 相关文档

- [architecture.md](architecture.md)：整体架构、模块划分与数据流
- [tech-stack.md](tech-stack.md)：真实依赖与技术选型
- [api-design.md](api-design.md)：Tauri 命令、事件、HTTP 轮询协议与 config schema
