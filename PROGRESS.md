# TokenMeter 改进进度

> 每轮记录"问题 → 根因 → 修法 → 验证"。窗口/贴边的实现细节见 [docs/architecture.md](docs/architecture.md) §5。

## 需求清单（历史）

| # | 需求 | 状态 | 要点 |
|---|---|---|---|
| 1 | SQLite 持久化 | ✅ | `storage.rs`：`usage_records`（用量）+ `debug_logs`（日志），数据不再随退出清空 |
| 2 | 贴边隐藏 | ⚠️ 重做 | 见下"窗口体验修复"（旧实现只改了一半） |
| 3 | 开机自启动 | ✅ | 直接写注册表 `HKCU\…\Run\TokenMeter`（`tauri-plugin-autostart` 已从 crates.io 下架） |
| 4 | 历史查询 | ✅ | `HistoryPanel/DatePicker/DailyDetailCard/CostChart`；按 API Key / 模型 / 总计查某日明细 + 近 7 天趋势 |
| 5 | 忽略记录 | ✅ | `ignored` 标记，不计入统计，可取消 |
| 6 | 轮询异常提示 | ✅ | `poll-status` 事件 + `PollErrorAlert`（状态变化时才推送） |
| 7 | 数据保留与清理 | ✅ | 默认 3 个月；启动提示导出月度 CSV 或清理 |
| 8 | 调试日志 | ✅ | 记录网络失败/权限拒绝/数据库锁定等，并提供查询与统计命令 |
| 9 | "添加模型"窗口双框 | ⚠️ 重做 | 旧改动未进产物，见下 |

## 2026-09-13 窗口体验修复

### 问题 1：添加窗口"大窗套小窗"

- **现象**：展开态点"+ 添加"，弹出的窗口是一个大灰框里套着深色小面板。
- **根因（实测取证）**：该窗口当时渲染的 `ModelManager` 根节点是
  `fixed inset-0 bg-black/50`（整页 50% 黑遮罩）+ 居中 `w-96 max-h-[90vh]` 面板；
  再叠一层 `decorations: true` 的系统标题栏。
  对正在运行的产物用 `PrintWindow` 抓图逐像素扫描：客户区 480×660，内容只有 384×594，
  四周恰好是 **左右 48px / 上下 33px 的纯 `127,127,127`** —— 与"50% 黑叠白底=127.5"、
  `w-96`=384、`max-h-[90vh]`=594 完全吻合。
- **另一个陷阱**：源码 13:38 才去掉遮罩，而当时在跑的产物是 11:30 打的 —— **修复根本没进产物**，
  所以看起来"一直没解决"。另外 `WebviewWindow.getByLabel()` 读的是页面加载时的窗口快照，
  旧代码"已存在就先关闭再重建"从未生效（重复点"+ 添加"实际无反应）。
- **修法**：新增 `src/lib/addModelWindow.ts` 统一管理子窗口 —— 无边框 + 透明 + 置顶 + 不进任务栏，
  尺寸 500×690（四周 10px 透明边留给投影），打开时贴在主窗口旁的**空位**（左侧优先 → 右侧 → 居中），
  钳制在工作区内；同一模型复用（show + setFocus），换模型先关旧窗、等 200ms 再建。
  `ModelManager` 只保留**一层**外框（圆角面板 + 自绘标题栏：可拖动、✕/Esc 关闭，按钮固定底部）。
  子窗口打开期间主窗口保持展开。
- **验证**：打包产物实跑点开"添加"→ 子窗口 500×690 出现在主窗左侧 12px；
  抓图逐像素扫描：只有 10px 透明留白 + 480px 面板，**`127,127,127` 像素数 = 0**。

### 问题 2：贴边隐藏

| # | 缺陷 | 后果 |
|---|---|---|
| 1 | `docked` 只在"当前位置已贴边"时才贴边 | 竖条被拖离边缘后永久变成漂在屏幕中间的小条 |
| 2 | 展开只改尺寸、不按工作区钳制 | 贴边位置偏下时 400×640 被任务栏/屏幕底部截断 |
| 3 | `setPosition`/`setSize` 分两次异步下发（展开分支甚至没 await） | 状态切换"先跳位再缩放"，两段式抖动 |
| 4 | 收起后无冷却、也不要求鼠标先离开 | 点"收起"时鼠标还在条上 → 立刻又弹开 |
| 5 | 吸附靠"静止 250ms"近似松手，且只判一次 | 拖动中途停顿被误判为松手；吸附后可能被继续拖走 |

**修法**：窗口几何收敛为一条路径 —— `computeTargetRect()`（纯函数）→ `animateToRect()`（执行层）：

- `docked` 一定贴到屏幕边缘（纵向也钳制）；`hovering/expanded` 原本贴边则以该边为锚向内展开，
  否则保持原位（拖到中间不会被吸回）；所有矩形钳制在**工作区**内
  （`currentMonitor()` 的显示器范围 减 由 Chromium `screen.avail*` 反推的任务栏边距）；
- 尺寸与位置同帧下发 + 140ms `easeOutCubic` 滑动过渡；启动首次定位不做动画；
- 收起加 420ms 冷却 + "鼠标需先离开贴边条"；拖动/子窗口打开期间不自动收起；
- 拖动松手阈值 250ms → `DRAG_SETTLE_MS`=400ms（收到真实 `pointerup` 时降到 150ms）；
  不吸附时钳制回工作区，且**原本是 22px 竖条就恢复为正常悬浮尺寸**；吸附后 520ms 自检一次。

### 改动文件

| 文件 | 说明 |
|---|---|
| `src/lib/windowGeometry.ts` / `windowTauri.ts` / `addModelWindow.ts` | 新增：纯几何 / 执行层 / 子窗口生命周期 |
| `src/App.tsx` | 贴边状态 → 窗口几何唯一入口；防回弹冷却；子窗口锁 |
| `src/hooks/useWindowDrag.ts` | 松手判定、落位策略、贴边自检 |
| `src/components/DetailPanel.tsx` / `ModelManager.tsx` / `FloatingBar.tsx` | 改调新窗口模块；子窗口单框化；移除重复 hover 逻辑 |
| `src/stores/useStore.ts` / `layout.ts` / `types.ts` | `dockSide/dragging/childWindowOpen`；贴边参数；`DockSide` |
| `tools/test-window-geometry.cjs` + `package.json` | 几何回归测试（`pnpm test:geometry`，22 项断言，直接加载真实源码） |

### 验证

- `tsc --noEmit` exit 0；`pnpm test:geometry` 22 项全绿（含旧缺陷的回归用例）；
- 无头渲染 + 打包产物实跑抓图逐像素（见上）；
- 真机复核中还发现并修掉一个自引入缺陷：启动后**首次**鼠标移入贴边条无反应
  （首次定位被误判为"用户收起"而解除了 hover）→ 用 `prevEdgeStateRef` 区分，重打包后复测通过。

### 未做（需改 Rust 并重新编译）

- `GetAsyncKeyState` 精确判断拖动是否松手（现为"静止 400ms"近似）；
- `GetMonitorInfoW` 直接取工作区（现为 Chromium `screen.avail*` 反推，数值等价但多一层依赖）。

## 出包与真机验证（2026-09-13）

| 产物 | 大小 | 说明 |
|---|---|---|
| `output/TokenMeter_0.1.0_x64-setup.exe` | 3.5 MB | NSIS 安装包 |
| `output/portable/TokenMeter.exe` | 11.2 MB | 便携版（免安装） |

实测（直接运行便携版，Win32 枚举窗口矩形 + 模拟鼠标）：

| 操作 | 实测 | 期望 |
|---|---|---|
| 启动 | 22×130 @x=2538 | 右贴边（2560−22） |
| 首次移入 | 320×400（右缘 2560） | 以贴边为锚向左展开 |
| 点击 | 400×640，3s 内稳定 | expanded |
| 点 "+ 添加" | 新增 500×690 @主窗左侧 12px | 子窗口不重叠、不被置顶主窗盖住 |

打包命令见 [docs/quick-start.md](docs/quick-start.md) §3；本机 cargo 缓存/镜像等环境细节见 `.local/local-build-notes.md`。

## 已知限制

- 轮询会真实计费：每模型每周期一次最小请求，默认间隔 10 分钟是为控制成本；
- 统计口径只含 TokenMeter 自身请求，不代表账号全部消耗；
- 仅 Windows；数据保留 3 个月，超期数据需手动导出/清理。
