# TokenMeter 用量表 — 架构说明

[English](architecture.md) | **中文**

## 1. 定位与边界

Windows 桌面悬浮窗应用：每 `pollingInterval`（默认 10 分钟）向每个已配置的模型发一次最小的
`chat/completions` 请求，读取响应 `usage` 记一条用量与费用，贴边常驻显示今日统计。

**明确不做**：不拦截/代理其他程序的请求；无预算告警与通知开关；无周/月维度统计（只有"今日"与"某日历史"）；
无全局快捷键、多语言、云同步。窗口权限最小化：`allowlist` 只声明实际用到的能力，`security.csp` 非空。

## 2. 数据流

    ┌──────────────────── 前端（React 18 + WebView2）────────────────────┐
    │  FloatingBar(docked) ──hover──▶ QuickInfo(hovering) ──click──▶ DetailPanel(expanded)
    │  窗口几何：lib/windowGeometry.ts(纯函数) + lib/windowTauri.ts(执行/动画)
    │  独立子窗口：ModelManager（?add=1 / ?edit=<id>，由 lib/addModelWindow.ts 管理）
    └────────────▲───────────────────────────────┬──────────────────────┘
                 │ invoke(Tauri 命令)             │ listen(事件)
                 │                                ▼
                 │              usage-updated / models-changed / poll-status / add-model-window-closed
    ┌────────────┴──────────────── Rust 主进程（Tauri 1.5）──────────────┐
    │  commands.rs  模型增删改查、今日统计、历史查询、CSV 导出、日志、自启动
    │  poller.rs    reqwest(rustls) ──POST <apiEndpoint>──▶ 大模型 API
    │  storage.rs   SQLite：usage_records（用量）+ debug_logs（调试日志）
    │  main.rs      单实例守卫、托盘、启动轮询、注册命令
    └───────────────────────────────────────────────────────────────────┘

## 3. 目录结构

关键路径：`src/lib/`（窗口几何与子窗口）、`src/hooks/useWindowDrag.ts`（拖动吸附）、
`src/components/`（10 个组件，职责见 §5.3）、`src-tauri/src/`（main/commands/poller/storage/models）、
`tools/`（build.ps1、registry-proxy.mjs、gen-icon.mjs、test-window-geometry.cjs）。
完整目录树见仓库根 [README.ZH.md](../README.ZH.md)。

## 4. 后端

### 4.1 数据模型（models.rs）

| 结构 | 字段要点 |
|---|---|
| `ModelConfig` | id、name、provider（**实际作为请求体的 model**）、apiEndpoint、apiKey、inputPrice、outputPrice、currency、responsePath |
| `ResponsePath` | inputTokens / outputTokens / totalTokens 的点路径，默认 `usage.prompt_tokens` 等 |
| `UsageRecord` | timestamp(epoch 秒)、inputTokens、outputTokens、totalTokens、cost |
| `DailyStats` | 上述四项 + requestCount、totalCost |
| `AppConfig` | models、pollingInterval（默认 600000） |
| `AppState` | config、storage(SQLite)、config_path（启动时解析一次，读写共用） |

字段均以 **camelCase** 序列化。

### 4.2 入口（main.rs）

1. **单实例守卫**：命名互斥体 `TokenMeter.SingleInstance`；已有实例时触发命名事件 `TokenMeter.ActivateWindow`
   唤起对方主窗口后本进程退出（保证一个托盘、一份轮询，避免重复计费）；
2. `env_logger` 默认 info；`load_config()` 解析配置路径：**工作目录存在 config.json 就用它，否则用 exe 所在目录**；
   解析失败先备份 `config.json.bak.<时间戳>` 再重置；
3. 初始化 SQLite（DB 与配置同目录的 `usage_data.db`），构造 `AppState` 注入 `manage()`；
4. 系统托盘：显示主窗口 / 隐藏主窗口 / 退出（`app.exit(0)` 优雅退出）；
5. `setup` 启动轮询线程 + 等待"重复启动"信号的线程；
6. `invoke_handler` 注册全部命令（清单见 [api-design.ZH.md](api-design.ZH.md)）。

### 4.3 命令层（commands.rs）

- 模型增删改先改内存再写盘，写盘共用 `AppState.config_path`；
- 今日统计直接查 SQLite 当天记录并聚合（`compute_stats` 单一实现，避免多处求和逻辑分叉）；
- 历史查询/导出/清理/日志/自启动分别薄封装到 `storage.rs` 与 Win32 注册表；
- 自启动键：`HKCU\Software\Microsoft\Windows\CurrentVersion\Run\TokenMeter` = exe 路径。

### 4.4 轮询器（poller.rs）

- `http_client()`：全局唯一 `reqwest::Client`（`OnceLock`，30s 超时），复用连接；
- `send_chat_request` 为轮询与"测试连接"共用；成功后按 `responsePath` 取数（支持 `choices[0].xxx` 下标），
  totalTokens 缺失时回退为输入+输出；三项全 0 记 warn（提示解析路径可能不对）；
- 费用 = 输入÷1000×inputPrice + 输出÷1000×outputPrice（单价为"每 1K tokens"）；
- 记录写入 SQLite（`insert_record`）后 `emit_all("usage-updated")`；
- 轮询/失败状态**变化**时推 `poll-status`（含失败原因），不每轮重复推送；
- 节奏固定：以"本轮开始"计时，睡眠 = interval − 本轮耗时（下限 1s），请求耗时不会拉长周期。

### 4.5 存储（storage.rs，SQLite）

| 表 | 关键列 |
|---|---|
| `usage_records` | id、model_id、provider、api_key_mask、timestamp、input/output/total_tokens、cost、ignored |
| `debug_logs` | id、timestamp、level、module、message、detail、user_id |

- 统计只算 `ignored = 0` 的记录；忽略/取消忽略即改该标记；
- 默认保留 3 个月：启动时由前端询问"导出 CSV 还是清理"，`cleanup_before` 按日期删除；
- 日志表供"调试日志"排查（网络失败、权限被拒、数据库锁定等）。

## 5. 前端

### 5.1 窗口三态与几何规则

| 状态 | 尺寸（逻辑像素） | 内容 |
|---|---|---|
| `docked` | 22×130 | FloatingBar：贴边竖条，整条可拖 |
| `hovering` | 320×400 | QuickInfo：用量概览，点击进详情 |
| `expanded` | 400×640 | DetailPanel：今日 / 历史 / 设置 三个标签页 |

窗口几何**只有一条路径**：`edgeState`/`dockSide` 变化 → `computeTargetRect()`（纯函数）→ `animateToRect()`。

1. `docked` 一定贴到屏幕左/右边缘（纵向也钳制，竖条不会跑出屏幕）；
2. `hovering/expanded` 若原本贴边则以该边为锚向内展开（右贴边 → 向左展开）；否则保持原地，只做钳制；
3. 所有矩形都钳制在**显示器工作区**内：工作区 = `currentMonitor()` 的显示器范围 减去 由 Chromium `screen.avail*`
   反推出的任务栏边距，因此展开的面板不会被任务栏/屏幕底部截断；
4. 尺寸与位置同帧下发 + 140ms `easeOutCubic` 滑动过渡（`SLIDE_DURATION`）；启动首次定位不做动画；
5. 鼠标移出 `HOVER_HIDE_DELAY`(260ms) 后收起；刚收起时 `HOVER_COOLDOWN`(420ms) 内不响应移入，
   且要求鼠标先离开过贴边条，避免"点收起时鼠标还在条上 → 立刻又弹开"；
6. 拖动中、或添加/编辑子窗口打开期间不自动收起（`dragging` / `childWindowOpen`）。

### 5.2 拖动与吸附（hooks/useWindowDrag.ts）

- 左键按下（目标不是 `button/a/input/textarea/select/[data-no-drag]`）后捕获指针，移动超过 5px 调 `startDragging()`
  交给系统拖动（跟手、无残影）；
- 系统拖动期间 WebView 收不到 `pointerup`，故以 60ms 轮询位置：连续静止 `DRAG_SETTLE_MS`(400ms) 判定松手，
  收到真实 `pointerup` 时阈值降到 150ms（避免"拖动中途停顿"被误判为松手）；
- 松手落位：距屏幕左/右边缘 < `SNAP_MARGIN`(32px) → 吸附贴边（记 `dockSide`，`edgeState → docked`）；
  否则停在原地并钳制回工作区，**若当前还是 22px 竖条则恢复为正常悬浮尺寸**（不会卡成小条）；
  吸附后 520ms 再自检一次，防止系统拖动未结束时"贴了又被拖走"。

### 5.3 组件职责

- `FloatingBar`：贴边竖条（贴边方向决定靠哪一侧），整条可拖；hover 展开由 App 统一判定；
- `QuickInfo`：概览（输入/输出/今日费用 + 最近一次轮询失败原因），点击进详情；
- `DetailPanel`：模型列表（选中/编辑/删除带二次确认）、行内今日统计、头部"+ 添加 / ↻ 轮询 / 收起"、
  今日 / 历史 / 设置三个标签页；设置页含"开机自启动"开关与版本信息；
- `HistoryPanel` + `DatePicker` + `DailyDetailCard` + `CostChart`：按 Key/模型/总计查询某日明细、
  近 7 天费用趋势、记录列表与忽略操作；
- `ModelManager`：添加/编辑表单（模板、名称、模型ID、端点、Key、单价与币种、响应解析路径、测试连接、保存）；
  **只作为独立窗口渲染**：无边框 + 透明，页面自绘一层圆角面板（标题栏可拖动、✕/Esc 关闭，按钮固定底部），
  打开时贴在主窗口旁的空位，关闭前通知主窗口解除"保持展开"；
- `PollErrorAlert` / `DataCleanupDialog`：轮询失败弹窗；数据保留到期时询问导出或清理。

### 5.4 状态管理（stores/useStore.ts）

- 运行态：`models`、`stats`（按模型今日统计）、`pollStatus`、`selectedModelId`、`edgeState`、
  `dockSide`、`dragging`、`childWindowOpen`；
- 历史查询态：`queryDimension` / `queryFilter` / `selectedDate` / `dailyDetail` / `dailyCosts` /
  `apiKeyList` / `dailyRecords` / `showIgnored`；
- 所有后端交互都封装成 action（`invoke`），组件不直接调 Tauri。

## 6. 打包与运行形态

- 主窗口透明/无边框/置顶/skipTaskbar；首帧即 docked 尺寸（22×130），避免开机闪出大窗口；
- 前端 `pnpm build` → `dist/`，由 Rust 以 `--features custom-protocol` 内嵌；缺失会白屏；
- 安装包：`pnpm tauri build --features custom-protocol` → `src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`；
- 受限网络下 `tools/build.ps1` 会先试普通 `cargo fetch`，失败则起 `tools/registry-proxy.mjs` 本地镜像代理再构建。

## 7. 已知限制

- 仅 Windows；依赖系统 WebView2；
- 轮询会真实计费（每模型每周期一次最小请求），默认 10 分钟是为控制成本而非技术上限；
- 工作区推导依赖 Chromium 的 `screen.avail*`（多显示器 + 任务栏停靠某侧时已按边距处理，但非 ±1px 级精确）；
- 拖动松手仍以"位置静止 400ms"近似（系统拖动期间拿不到 pointerup），未引入 Win32 `GetAsyncKeyState`。