# TokenMeter 用量表 — 架构说明

## 1. 项目概述

TokenMeter 是一个 **Windows 桌面悬浮窗应用**：监控大模型（OpenAI 兼容的 `chat/completions` API）的 token 用量与费用。应用自身每隔 **10 分钟**向每个已配置模型的最小聊天请求端点轮询一次，从响应的 `usage` 字段读取 token 数并按单价折算费用，以贴边悬浮窗形式常驻屏幕边缘展示。

设计上刻意保持轻量，**明确不在范围内**的功能包括：

- 无数据库（仅内存缓存 + 一份 JSON 配置文件）
- 无预算告警、预算/用量提醒或通知开关
- 无“周/月”等时间维度，只有**今日统计**（按自然日，自**本地时区**零点起）
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
├── config.example.json            # 配置模板（示例，复制为 config.json 填写）
├── THIRD_PARTY_LICENSES.md        # 第三方组件许可汇总
├── package.json / pnpm-lock.yaml  # 前端依赖（pnpm）
├── index.html / vite.config.ts / tsconfig*.json
├── tailwind.config.js / postcss.config.js
├── tools/
│   ├── gen-icon.mjs               # 由源图生成全套应用图标
│   ├── registry-proxy.mjs         # 可选：本地 crates 镜像代理（受限网络用）
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
| `AppConfig` | `models, pollingInterval(u64 毫秒)` | 默认 `pollingInterval: 600000`（10 分钟） |

全部字段经 serde 以 **camelCase** 命名输出/输入（Rust 侧 snake_case + `#[serde(rename)]`），结构体均实现 `Default`。

### 4.2 入口（`main.rs`）

1. `env_logger` 初始化日志（默认 info 级，`RUST_LOG` 可调）；
2. `commands::load_config()` 解析配置：优先**工作目录**、其次 **exe 所在目录**的 `config.json`；
   缺失用默认值；**损坏时先备份为 `config.json.bak.<时间戳>` 再重置**；返回 (配置, 路径) 并存入
   `AppState.config_path`，此后所有读写共用同一路径；
3. 构造 `Arc<Mutex<AppState>>` 并 `manage()` 注入；
4. 创建系统托盘：**显示主窗口 / 隐藏主窗口 / 退出**，点击对应窗口 `main` 的 show/hide 或退出进程；
5. `setup` 中调用 `poller::start_polling(app_handle, state)` 启动后台轮询；
6. `invoke_handler` 注册全部命令（见 api-design.md）。

### 4.3 命令层（`commands.rs`）

- 配置文件路径 = 启动时解析一次并存入 `AppState.config_path`：优先工作目录、其次 exe 所在目录的
  `config.json`（非 `%APPDATA%`），所有读/写共用同一路径，避免 cwd 漂移；
- 模型增删改命令都会先改内存状态再 `save_config` 落盘；`delete_model` 同时清掉该模型的用量缓存；
- 统计命令对内存 `usage_data` 即时聚合，不查库。

### 4.4 轮询器（`poller.rs`）

- `send_chat_request`：连接测试与轮询共用的请求核心（发请求并校验状态码后返回响应）；
- `poll_model_usage`：POST 到 `apiEndpoint`（请求体见 api-design.md），成功后按 `responsePath` 取数——
  支持点号与数组下标（如 `choices[0].usage.total_tokens`），`totalTokens` 取不到时回退为 输入+输出；
  三项全为 0 时记 warn（提示解析路径可能配置错误）；
- 费用 = 输入 tokens ÷ 1000 × `inputPrice` + 输出 tokens ÷ 1000 × `outputPrice`；
- `append_and_prune`（自动轮询与手动 `trigger_poll` 共用）：推入记录后只保留**本地时区当天**
  的记录（东八区零点即切日），再 `emit_all("usage-updated", …)` 通知前端；
- 状态可见性：自动/手动轮询在**成功↔失败状态变化**时推送 `poll-status` 事件（含失败原因），
  前端据此展示"最近轮询失败"提示；单模型失败不影响其他模型与下一轮循环（默认间隔 10 分钟）。

## 5. 前端（React）设计

### 5.1 三种窗口状态（`edgeState`，定义在 `types.ts`）

| 状态 | 尺寸（逻辑像素，`layout.ts` WINDOW_SIZES） | 内容 |
|---|---|---|
| `docked` | 22 × 130 | `FloatingBar`：贴边竖条，整条可拖 |
| `hovering` | 320 × 400 | `QuickInfo`：简单用量信息，整块可拖，点击展开 |
| `expanded` | 400 × 640 | `DetailPanel`：详情，整块可拖 |

- `App.tsx` 按 `edgeState` 渲染对应组件，并监听事件 `usage-updated`、`models-changed`、`poll-status`
  刷新数据/状态；另每 5 分钟 `fetchAllStats` 兜底刷新；
- 状态切换时用 `getCurrent().setSize` 固定窗口尺寸；窗口贴**右缘**时向左展开，避免超出屏幕（`layout.ts` `SNAP_MARGIN = 32` 用于吸附判定）；
- URL 带 `?add=1` 时独立渲染 `<ModelManager standalone />`：`?edit=<id>` 进入编辑模式并预填表单；
  独立窗口（480×660）由详情面板“+ 添加 / 编辑”打开；若已存在则先关闭再重建，避免陈旧表单。

### 5.2 拖动与吸附（`hooks/useWindowDrag.ts`）

- 指针按下（左键、且目标不是 `button/a/input/textarea/select/[data-no-drag]`）后捕获指针；移动超过阈值(5px)则调用 `getCurrent().startDragging()` 交给系统拖动；
- 拖动结束后以 60ms 轮询窗口位置，位置稳定 250ms 判定“松手”；距屏幕任一 边缘 < `SNAP_MARGIN`(32px) 则吸附：窗口缩为 docked 尺寸并贴到该边缘，`edgeState → docked`；
- 未触发拖动阈值的原地点击正常分发（不干扰按钮点击）。

### 5.3 组件职责

- `FloatingBar.tsx`：贴边竖条，显示当前模型与费用的极简信息，整条可拖、hover 展开；
- `QuickInfo.tsx`：hover 信息面板，显示模型与今日 token/费用概要，点击进入 `expanded`；
- `DetailPanel.tsx`：模型列表（切换、**编辑**、删除带二次确认）、每个模型行内今日统计与总费用、
  头部“+ 添加 / ↻ 轮询(调 `trigger_poll`) / 收起(回 docked)”；轮询失败时行内与底部统计区展示原因；
- `ModelManager.tsx`：表单（模板选择、名称、模型ID(即请求体 model，字段名 provider)、API 地址、
  API Key、单价与币种、高级设置响应解析路径、测试连接、保存）；standalone 下（`?add=1` / `?edit=<id>`）
  保存调用 `add_model`/`update_model` 后 `emit("models-changed")` 并关闭自身窗口。

## 6. 状态管理与数据获取

- `stores/useStore.ts`（Zustand）：封装 `invoke` 调用后端命令，维护 `models`、`stats`
  （`Record<modelId, DailyStats>`）、`pollStatus`（最近一次轮询成败）、`selectedModelId`、`edgeState` 等；
- 初始化/事件触发 → `fetchModels()` + `fetchAllStats()`；删除当前选中模型后自动选第一个。

## 7. 打包与运行形态

- 主窗口透明、无边框、置顶、`skipTaskbar`（tauri.conf.json）；
- 前端 `pnpm build` 产物进 `dist/`，由 Rust 端以 `custom-protocol` feature 内嵌；独立 exe 需 `cargo build --features custom-protocol`（否则 debug 会去加载 `devPath: http://localhost:1420`）；
- 正式安装包：`pnpm tauri build --features custom-protocol` → `src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`（`custom-protocol` feature 内嵌前端，缺失会导致白屏；bundle.targets = `nsis`，identifier `com.tokenmeter.app`）；
- 图标：`tools/gen-icon.mjs` 生成源图，再由 `@tauri-apps/cli` 的 `tauri icon` 生成 `src-tauri/icons/` 全套。

详细技术栈、命令接口与上手步骤分别见 [tech-stack.md](tech-stack.md)、[api-design.md](api-design.md)、[quick-start.md](quick-start.md)。
