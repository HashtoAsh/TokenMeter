# TokenMeter — Improvement Progress

> **English** · [中文](#中文说明)
>
> Each round records "problem → root cause → fix → verification". For implementation details of the window/edge docking, see [architecture.md](architecture.md) §5.

## Requirements checklist (historical)

| # | Requirement | Status | Key points |
|---|---|---|---|
| 1 | SQLite persistence | ✅ | `storage.rs`: `usage_records` (usage) + `debug_logs` (logs); data is no longer cleared on exit |
| 2 | Edge-docked hiding | ✅ | `computeTargetRect()` → `animateToRect()` single path; work-area clamping; 140ms slide |
| 3 | Launch at startup (autostart) | ✅ | Writes the registry key `HKCU\…\Run\TokenMeter` directly |
| 4 | History query | ✅ | `HistoryPanel/DatePicker/DailyDetailCard/CostChart`; by API Key / model / total + 7-day trend |
| 5 | Ignored records | ✅ | `ignored` flag; not counted in the statistics, and can be un-ignored |
| 6 | Polling error notifications | ✅ | `poll-status` event + `PollErrorAlert` (only pushed when the state changes) |
| 7 | Data retention and cleanup | ✅ | 3 months by default; at startup prompts to export a monthly CSV or clean up |
| 8 | Debug log | ✅ | Records network failures/permission denials/database locks, etc. |
| 9 | "Add model" window double frame | ✅ | Borderless + transparent + always-on-top child window, single self-drawn frame |
| 10 | API Key encryption | ✅ | XOR + hex encryption in config.json, auto-migration from plaintext |
| 11 | Multi-provider support | ✅ | 8 templates: DeepSeek / MiMo / Qwen / Kimi / GLM / MiniMax / ChatGPT / OpenRouter |

## 2026-09-13 Window experience fixes

### Problem 1: the Add window "a big window framing a small window"

- **Symptom**: clicking "+ Add" in the expanded state pops up a window that is a dark small panel inside a large gray frame.
- **Root cause**: the window rendered `ModelManager` with `fixed inset-0 bg-black/50` (50% black overlay) + centered panel + system title bar.
- **Fix**: added `src/lib/addModelWindow.ts` — borderless + transparent + always on top, 500×690, opens beside the main window.

### Problem 2: Edge-docked hiding

| # | Defect | Fix |
|---|---|---|
| 1 | `docked` only docks when already at edge | Always snaps to screen edge |
| 2 | Expanding not clamped to work area | All rectangles clamped within work area |
| 3 | `setPosition`/`setSize` dispatched separately | Same-frame dispatch + 140ms slide |
| 4 | No cooldown after collapsing | 420ms cooldown + pointer must leave first |
| 5 | Snapping approximates with 250ms stationary | `DRAG_SETTLE_MS`=400ms + self-check |

## Known limitations

- Polling is really billed: one minimal request per model per cycle; the default 10-minute interval is meant to control cost;
- The statistics scope only covers TokenMeter's own requests and does not represent the account's total consumption;
- Windows only; data is retained for 3 months, and data older than that must be exported/cleaned up manually.

---

# 中文说明

> 每轮记录"问题 → 根因 → 修法 → 验证"。窗口/贴边的实现细节见 [architecture.md](architecture.md) §5。

## 需求清单（历史）

| # | 需求 | 状态 | 要点 |
|---|---|---|---|
| 1 | SQLite 持久化 | ✅ | `storage.rs`：`usage_records`（用量）+ `debug_logs`（日志），数据不再随退出清空 |
| 2 | 贴边隐藏 | ✅ | `computeTargetRect()` → `animateToRect()` 单路径；工作区钳制；140ms 滑动 |
| 3 | 开机自启动 | ✅ | 直接写注册表 `HKCU\…\Run\TokenMeter` |
| 4 | 历史查询 | ✅ | `HistoryPanel/DatePicker/DailyDetailCard/CostChart`；按 Key / 模型 / 总计 + 近 7 天趋势 |
| 5 | 忽略记录 | ✅ | `ignored` 标记，不计入统计，可取消 |
| 6 | 轮询异常提示 | ✅ | `poll-status` 事件 + `PollErrorAlert`（状态变化时才推送） |
| 7 | 数据保留与清理 | ✅ | 默认 3 个月；启动提示导出月度 CSV 或清理 |
| 8 | 调试日志 | ✅ | 记录网络失败/权限拒绝/数据库锁定等 |
| 9 | "添加模型"窗口双框 | ✅ | 无边框 + 透明 + 置顶子窗口，单层自绘外框 |
| 10 | API Key 加密 | ✅ | config.json 中 XOR + hex 加密，明文自动迁移 |
| 11 | 多 Provider 支持 | ✅ | 8 个模板：DeepSeek / MiMo / 千问 / Kimi / 智谱GLM / MiniMax / ChatGPT / OpenRouter |

## 2026-09-13 窗口体验修复

### 问题 1：添加窗口"大窗套小窗"

- **现象**：展开态点"+ 添加"，弹出的窗口是一个大灰框里套着深色小面板。
- **根因**：`fixed inset-0 bg-black/50`（50% 黑遮罩）+ 居中面板 + 系统标题栏。
- **修法**：新增 `src/lib/addModelWindow.ts` —— 无边框 + 透明 + 置顶，500×690，打开时贴在主窗口旁。

### 问题 2：贴边隐藏

| # | 缺陷 | 修法 |
|---|---|---|
| 1 | `docked` 只在已贴边时才贴边 | 一定贴到屏幕边缘 |
| 2 | 展开不按工作区钳制 | 所有矩形钳制在工作区内 |
| 3 | `setPosition`/`setSize` 分两次下发 | 同帧下发 + 140ms 滑动 |
| 4 | 收起后无冷却 | 420ms 冷却 + 鼠标需先离开 |
| 5 | 吸附靠 250ms 近似 | `DRAG_SETTLE_MS`=400ms + 自检 |

## 已知限制

- 轮询会真实计费：每模型每周期一次最小请求，默认间隔 10 分钟是为控制成本；
- 统计口径只含 TokenMeter 自身请求，不代表账号全部消耗；
- 仅 Windows；数据保留 3 个月，超期数据需手动导出/清理。
