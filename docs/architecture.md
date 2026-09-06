# TokenMeter 用量表 — 架构说明

## 1. 项目概述

TokenMeter 是一个 **Windows 桌面悬浮窗应用**：监控大模型（OpenAI 兼容的 `chat/completions` API）的 token 用量与费用。应用自身每隔 **5 分钟**向每个已配置模型的最小聊天请求端点轮询一次，从响应的 `usage` 字段读取 token 数并按单价折算费用，以贴边悬浮窗形式常驻屏幕边缘展示。

设计上刻意保持轻量，**明确不在范围内**的功能包括：

- 无数据库（仅内存缓存 + 一份 JSON 配置文件）
- 无预算告警、预算/用量提醒或通知开关
- 无“周/月”等时间维度，只有**今日统计**（按自然日，自当天 UTC 0 点起）
- 无全局快捷键、自动启动、主题/语言切换、通用“设置”面板
- 无 JSON/CSV 数据导出、无图表库
- 不拦截/代理其他程序的 API 请求，只监控自身发起的轮询
- 仅 Windows（Tauri 1.5 + WebView2）上开发与打包，不支持 macOS / Linux

## 2. 整体结构与数据流

```
┌─────────────────────────── 前端（React 18 + WebView2）──────────────────────────┐
│  FloatingBar(docked) ──hover──▶ QuickInfo(hovering) ──click──▶ DetailPanel(expanded) │
│  ModelManager：独立窗口 add-model（index.html?add=1）                            │
└───────────────▲────────────────────────────────────┬──────────────────────────────┘
                │ invoke(Tauri 命令)                  │ listen(事件)
                ▼                                    │ usage-updated / models-changed
┌────────────────────────────── Rust 主进程（tauri 1.5）───────────────────────────┐
│  commands.rs  get/add/update/delete_model、get_*_daily_stats、window/polling、trigger_poll │
│  poller.rs    reqwest(rustls) ──POST apiEndpoint/chat/completions──▶ 大模型 API       │
│  main.rs      系统托盘(显示主窗口/隐藏主窗口/退出)、setup 启动轮询、注册命令          │
│  状态          AppState{ config, usage_data: HashMap<modelId, Vec<UsageRecord>> }   │
│  持久化        config.json（运行目录，UTF-8 JSON，无数据库）                        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- 主窗口：`tauri.conf.json` 中 label 为 `main`，透明、无边框、置顶、`skipTaskbar`，初始 300×160，运行期由前端按状态 `setSize`。
- 轮询产生的记录只保存在内存 `usage_data`，进程退出即丢弃；`config.json` 只保存模型与偏好配置，不存历史用量。

## 3. 目录结构（真实）

```
TokenMeter用量表/
├── .gitignore                     # 忽略 config.json、dist、target、.cargo 等
├── LICENSE                        # MIT
├── config.example.json            # 配置脱敏示例（config.json 参考）
├── THIRD_PARTY_LICENSES.md        # 第三方组件许可汇总
├── package.json / pnpm-lock.yaml  # 前端依赖（pnpm）
├── index.html / vite.config.ts / tsconfig*.json
├── tailwind.config.js / postcss.config.js
├── tools/
│   ├── gen-icon.mjs               # 由源图生成全套应用图标
│   ├── registry-proxy.mjs         # 本地 crates.io 稀疏镜像代理（绕 schannel TLS 故障）
│   └── build.ps1                  # Rust 后端一键构建脚本
├── src/                           # 前端源码（React）
│   ├── main.tsx / App.tsx / styles.css / layout.ts / types.ts
│   ├── stores/useStore.ts         # Zustand：models/stats/edgeState + invoke 封装
│   ├── hooks/useWindowDrag.ts     # 窗口拖动 + 屏幕边缘吸附
│   └── components/
│       ├── FloatingBar.tsx        # 贴边竖条
│       ├── QuickInfo.tsx          # hover 信息面板
│       ├── DetailPanel.tsx        # 详情面板（列表/今日统计/添加/轮询/收起）
│       └── ModelManager.tsx       # 添加/编辑模型表单（可 standalone）
├── src-tauri/
│   ├── Cargo.toml / build.rs / tauri.conf.json
│   ├── .cargo/config.toml         # 本机私有（已 gitignore）：crates-io → 127.0.0.1:8765
│   ├── icons/                     # tauri icon 生成的全套图标
│   └── src/                       # Rust 后端（无 lib.rs，main.rs 内 mod）
│       ├── main.rs                # 入口：托盘、setup 启动轮询、注册命令
│       ├── models.rs              # ModelConfig/UsageRecord/DailyStats/AppConfig…
│       ├── commands.rs            # Tauri 命令实现 + config.json 读写
│       └── poller.rs              # 定时轮询、连接测试、用量解析与费用计算
└── docs/                          # 本文档所在目录
```

> 注意：后端没有 `lib.rs`、没有 `commands/ models/ services/ db/` 等子目录模块；代码以 `mod` 声明组织在 `main.rs` 同级文件中。

## 4. 后端（Rust）设计

### 4.1 数据模型（`models.rs`）

| 结构体 | 字段 | 说明 |
|---|---|---|
| `ModelConfig` | `id, name, provider, apiEndpoint, apiKey, inputPrice, outputPrice, currency, responsePath` | `provider` 实际作为请求体里的 `model` 字段；`responsePath` 为响应中取 token 数的点路径 |
| `ResponsePath` | `inputTokens, outputTokens, totalTokens` | 默认 `usage.prompt_tokens / usage.completion_tokens / usage.total_tokens` |
| `UsageRecord` | `timestamp(i64), inputTokens, outputTokens, totalTokens, cost` | 一次成功轮询的结果 |
| `DailyStats` | `inputTokens, outputTokens, totalTokens, requestCount, totalCost` | 对某模型当日记录的聚合 |
| `AppConfig` | `models, pollingInterval(u64 毫秒), window` | 默认 `pollingInterval: 300000`（5 分钟） |
| `WindowConfig` | `edgePosition, opacity` | 默认 `edgePosition: "right"`, `opacity: 0.9` |

全部字段经 serde 以 **camelCase** 命名输出/输入（Rust 侧 snake_case + `#[serde(rename)]`），结构体均实现 `Default`。

### 4.2 入口（`main.rs`）

1. `env_logger::init()` 初始化日志；
2. `commands::load_config()` 读取运行目录 `config.json`（缺失/损坏则用默认配置）；
3. 构造 `Arc<Mutex<AppState>>` 并 `manage()` 注入；
4. 创建系统托盘：菜单为 **显示主窗口 / 隐藏主窗口 / 退出**（无“设置”项），点击对应窗口 `main` 的 show/hide 或 `std::process::exit`；
5. `setup` 中调用 `poller::start_polling(app_handle, state)` 启动后台轮询；
6. `invoke_handler` 注册全部命令（见 api-design.md）。

### 4.3 命令层（`commands.rs`）

- 配置文件路径 = `std::env::current_dir() + "config.json"`（**运行目录**，非 `%APPDATA%`）；
- 模型增删改命令都会先改内存状态再 `save_config` 落盘；`delete_model` 同时清掉该模型的用量缓存；
- 统计命令对内存 `usage_data` 即时聚合，不查库。

### 4.4 轮询器（`poller.rs`）

- `start_polling`：`tauri::async_runtime::spawn` 一个循环——取当前模型快照与轮询间隔 → 逐模型 `poll_model_usage` → `sleep(pollingInterval)`；
- `poll_model_usage`：POST 到 `apiEndpoint`（请求体见 api-design.md），成功后按 `responsePath` 从 JSON 逐层取数（点号分段 `get`），`totalTokens` 取不到时回退为 输入+输出；
- 费用 = 输入 tokens ÷ 1000 × `inputPrice` + 输出 tokens ÷ 1000 × `outputPrice`；
- 新记录推入 `usage_data[model.id]` 后裁剪，只保留当天（自 UTC 0 点起）的记录，然后 `emit_all("usage-updated", &model.id)` 通知前端；
- 失败只记 `log::error!`，不影响其他模型与下一轮循环。

## 5. 前端（React）设计

### 5.1 三种窗口状态（`edgeState`，定义在 `types.ts`）

| 状态 | 尺寸（逻辑像素，`layout.ts` WINDOW_SIZES） | 内容 |
|---|---|---|
| `docked` | 22 × 130 | `FloatingBar`：贴边竖条，整条可拖 |
| `hovering` | 320 × 400 | `QuickInfo`：简单用量信息，整块可拖，点击展开 |
| `expanded` | 400 × 640 | `DetailPanel`：详情，整块可拖 |

- `App.tsx` 按 `edgeState` 渲染对应组件，并监听事件 `usage-updated`、`models-changed` 刷新数据；另每 5 分钟 `fetchAllStats` 兜底刷新；
- 状态切换时用 `getCurrent().setSize` 固定窗口尺寸；窗口贴**右缘**时向左展开，避免超出屏幕（`layout.ts` `SNAP_MARGIN = 32` 用于吸附判定）；
- URL 带 `?add=1` 时单独渲染 `<ModelManager standalone />`（“添加模型”独立窗口 `WebviewWindow("add-model", url: "index.html?add=1")`，480×660，由 `DetailPanel` 的“+ 添加”按钮打开，已存在则复用并聚焦）。

### 5.2 拖动与吸附（`hooks/useWindowDrag.ts`）

- 指针按下（左键、且目标不是 `button/a/input/textarea/select/[data-no-drag]`）后捕获指针；移动超过阈值(5px)则调用 `getCurrent().startDragging()` 交给系统拖动；
- 拖动结束后以 60ms 轮询窗口位置，位置稳定 250ms 判定“松手”；距屏幕任一 边缘 < `SNAP_MARGIN`(32px) 则吸附：窗口缩为 docked 尺寸并贴到该边缘，`edgeState → docked`；
- 未触发拖动阈值的原地点击正常分发（不干扰按钮点击）。

### 5.3 组件职责

- `FloatingBar.tsx`：贴边竖条，显示当前模型与费用的极简信息，整条可拖、hover 展开；
- `QuickInfo.tsx`：hover 信息面板，显示模型与今日 token/费用概要，点击进入 `expanded`；
- `DetailPanel.tsx`：模型列表（切换、删除带二次确认）、每个模型的今日统计与总费用、头部“+ 添加 / ↻ 轮询(调 `trigger_poll`) / 收起(回 docked)”；
- `ModelManager.tsx`：表单（模板选择、模型名称、模型ID(即请求体 model，字段名 provider)、API 地址、API Key、输入/输出单价、高级设置响应解析路径、测试连接、保存）；standalone 模式下保存成功后 `emit("models-changed")` 并关闭自身窗口。

## 6. 状态管理与数据获取

- `stores/useStore.ts`（Zustand）：封装 `invoke` 调用后端命令，维护 `models`、`stats`（`Record<modelId, DailyStats>`）、`selectedModelId`、`edgeState`、`showAddModel/showDetail`；
- 初始化/事件触发 → `fetchModels()` + `fetchAllStats()`；删除当前选中模型后自动选第一个。

## 7. 打包与运行形态

- 主窗口透明、无边框、置顶、`skipTaskbar`（tauri.conf.json）；
- 前端 `pnpm build` 产物进 `dist/`，由 Rust 端以 `custom-protocol` feature 内嵌；独立 exe 需 `cargo build --features custom-protocol`（否则 debug 会去加载 `devPath: http://localhost:1420`）；
- 正式安装包：`pnpm tauri build` → `src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`（bundle.targets = `nsis`，identifier `com.tokenmeter.app`）；
- 图标：`tools/gen-icon.mjs` 生成源图，再由 `@tauri-apps/cli` 的 `tauri icon` 生成 `src-tauri/icons/` 全套。

详细技术栈、命令接口与上手步骤分别见 [tech-stack.md](tech-stack.md)、[api-design.md](api-design.md)、[quick-start.md](quick-start.md)。
