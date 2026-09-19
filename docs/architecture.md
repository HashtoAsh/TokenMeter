# TokenMeter — Architecture

## 1. Scope and boundaries

A Windows desktop floating-window application: every `pollingInterval` (10 minutes by default) it sends one minimal
`chat/completions` request to each configured model, reads the response `usage` to record one usage and cost entry, and
stays docked to the screen edge displaying today's stats.

**Explicitly not done**: it does not intercept or proxy requests from other programs; no budget alerts or notification
toggles; no weekly/monthly statistics (only "today" and "history for a given day");
no global hotkeys, i18n, or cloud sync. Window permissions are minimized: `allowlist` declares only the capabilities
actually used, and `security.csp` is non-empty.

## 2. Data flow

    ┌────────────────── Frontend (React 18 + WebView2) ──────────────────┐
    │  FloatingBar(docked) ──hover──▶ QuickInfo(hovering) ──click──▶ DetailPanel(expanded)
    │  Window geometry: lib/windowGeometry.ts (pure functions) + lib/windowTauri.ts (apply/animate)
    │  Separate child window: ModelManager (?add=1 / ?edit=<id>, managed by lib/addModelWindow.ts)
    └────────────▲───────────────────────────────┬───────────────────────┘
                 │ invoke(Tauri commands)        │ listen(events)
                 │                               ▼
                 │              usage-updated / models-changed / poll-status / add-model-window-closed
    ┌────────────┴──────────────── Rust main process (Tauri 1.5) ────────┐
    │  commands.rs  model CRUD, today's stats, history query, CSV export, logs, autostart
    │  poller.rs    reqwest(rustls) ──POST <apiEndpoint>──▶ LLM API
    │  storage.rs   SQLite: usage_records (usage) + debug_logs (debug log)
    │  main.rs      single-instance guard, tray, startup polling, command registration
    └────────────────────────────────────────────────────────────────────┘

## 3. Directory structure

Key paths: `src/lib/` (window geometry and child windows), `src/hooks/useWindowDrag.ts` (drag and snap),
`src/components/` (10 components, responsibilities in §5.3), `src-tauri/src/` (main/commands/poller/storage/models),
`tools/` (build.ps1, registry-proxy.mjs, gen-icon.mjs, test-window-geometry.cjs).
For the complete directory tree see the repository root [README.md](../README.md).

## 4. Backend

### 4.1 Data model (models.rs)

| Struct | Key fields |
|---|---|
| `ModelConfig` | id, name, provider (**actually used as the request body's model**), apiEndpoint, apiKey, inputPrice, outputPrice, currency, responsePath |
| `ResponsePath` | dot paths for inputTokens / outputTokens / totalTokens, defaulting to `usage.prompt_tokens` and so on |
| `UsageRecord` | timestamp (epoch seconds), inputTokens, outputTokens, totalTokens, cost |
| `DailyStats` | the four fields above + requestCount, totalCost |
| `AppConfig` | models, pollingInterval (default 600000) |
| `AppState` | config, storage(SQLite), config_path (resolved once at startup, shared by reads and writes) |

All fields are serialized in **camelCase**.

### 4.2 Entry point (main.rs)

1. **Single-instance guard**: named mutex `TokenMeter.SingleInstance`; when an instance already exists, it fires the named event `TokenMeter.ActivateWindow`
   to bring the other instance's main window to the front and then this process exits (guaranteeing one tray and one polling loop, avoiding double billing);
2. `env_logger` defaults to info; `load_config()` resolves the config path: **if config.json exists in the working directory use it, otherwise use the directory containing the exe**;
   on a parse failure it first backs up `config.json.bak.<timestamp>` and then resets;
3. Initialize SQLite (`usage_data.db` in the same directory as the config), construct `AppState` and inject it with `manage()`;
4. System tray: show main window / hide main window / quit (`app.exit(0)` for a graceful exit);
5. `setup` starts the polling thread + a thread waiting for the "duplicate launch" signal;
6. `invoke_handler` registers all commands (for the list see [api-design.md](api-design.md)).

### 4.3 Command layer (commands.rs)

- Model create/update/delete modify memory first and then write to disk; disk writes share `AppState.config_path`;
- Today's stats query SQLite records for the current day directly and aggregate them (`compute_stats` is the single implementation, so summation logic does not diverge across call sites);
- History query/export/cleanup/logs/autostart are thin wrappers over `storage.rs` and the Win32 registry respectively;
- Autostart key: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\TokenMeter` = exe path.

### 4.4 Poller (poller.rs)

- `http_client()`: a single global `reqwest::Client` (`OnceLock`, 30s timeout) that reuses connections;
- `send_chat_request` is shared by polling and "Test connection"; on success it reads values by `responsePath` (supporting `choices[0].xxx` subscripts),
  and when totalTokens is missing it falls back to input + output; if all three are 0 it logs a warn (hinting that the response path may be wrong);
- Cost = input ÷ 1000 × inputPrice + output ÷ 1000 × outputPrice (the unit price is "per 1K tokens");
- After the record is written to SQLite (`insert_record`) it calls `emit_all("usage-updated")`;
- It pushes `poll-status` (including the failure reason) only when the polling/failure state **changes**, not on every round;
- Fixed cadence: it times from "the start of this round", sleep = interval − this round's duration (minimum 1s), so a slow request does not stretch the period.

### 4.5 Storage (storage.rs, SQLite)

| Table | Key columns |
|---|---|
| `usage_records` | id, model_id, provider, api_key_mask, timestamp, input/output/total_tokens, cost, ignored |
| `debug_logs` | id, timestamp, level, module, message, detail, user_id |

- Statistics count only records with `ignored = 0`; ignoring/unignoring simply flips that flag;
- The default retention period is 3 months: at startup the frontend asks "export CSV or clean up"; `cleanup_before` deletes by date;
- The log table supports "debug log" troubleshooting (network failures, denied permissions, database locks, and so on).

## 5. Frontend

### 5.1 Window three states and geometry rules

| State | Size (logical pixels) | Content |
|---|---|---|
| `docked` | 22×130 | FloatingBar: edge-docked vertical bar, the whole bar is draggable |
| `hovering` | 320×400 | QuickInfo: usage overview, click to open details |
| `expanded` | 400×640 | DetailPanel: Today / History / Settings tabs |

Window geometry has **only one path**: `edgeState`/`dockSide` change → `computeTargetRect()` (pure function) → `animateToRect()`.

1. `docked` always sticks to the left/right screen edge (vertically clamped too, so the vertical bar never runs off the screen);
2. If `hovering/expanded` was originally docked it expands inward with that edge as the anchor (right-docked → expands to the left); otherwise it stays where it is and is only clamped;
3. Every rectangle is clamped inside the **monitor work area**: work area = the display bounds from `currentMonitor()` minus the taskbar margin
   derived from Chromium's `screen.avail*`, so an expanded panel is never clipped by the taskbar or the bottom of the screen;
4. Size and position are applied in the same frame + a 140ms `easeOutCubic` slide transition (`SLIDE_DURATION`); the first positioning at startup is not animated;
5. It collapses `HOVER_HIDE_DELAY`(260ms) after the mouse leaves; right after collapsing it ignores mouse-enter for `HOVER_COOLDOWN`(420ms),
   and it requires the mouse to have left the edge bar first, avoiding the "pointer is still on the bar when collapse is clicked → it immediately pops open again" case;
6. It does not auto-collapse while dragging, or while the add/edit child window is open (`dragging` / `childWindowOpen`).

### 5.2 Drag and snap (hooks/useWindowDrag.ts)

- On left-button press (the target is not `button/a/input/textarea/select/[data-no-drag]`) it captures the pointer, and once the movement exceeds 5px it calls `startDragging()`
  to hand over to system dragging (follows the pointer, no ghosting);
- During system dragging the WebView receives no `pointerup`, so position is polled every 60ms: after being stationary for `DRAG_SETTLE_MS`(400ms) in a row it considers the pointer released,
  and when a real `pointerup` arrives the threshold drops to 150ms (so "a pause in the middle of a drag" is not mistaken for a release);
- Release placement: distance to the left/right screen edge < `SNAP_MARGIN`(32px) → snap and dock (record `dockSide`, `edgeState → docked`);
  otherwise it stays where it is and is clamped back into the work area, and **if it is still the 22px vertical bar it is restored to the normal floating size** (it never gets stuck as a small bar);
  520ms after snapping it re-checks once, preventing "it docked but was then dragged away again" when system dragging has not finished.

### 5.3 Component responsibilities

- `FloatingBar`: edge-docked vertical bar (the docking direction determines which side it hugs), the whole bar is draggable; hover expansion is decided centrally by App;
- `QuickInfo`: overview (input/output/today's cost + the reason for the most recent polling failure), click to open details;
- `DetailPanel`: model list (select/edit/delete with a confirmation prompt), inline today's stats, header "+ Add / ↻ Poll / Collapse",
  and the Today / History / Settings tabs; the Settings tab contains the "launch at startup" toggle and version info;
- `HistoryPanel` + `DatePicker` + `DailyDetailCard` + `CostChart`: query a given day's details by Key/model/total,
  the last 7 days' cost trend, the record list, and ignore actions;
- `ModelManager`: add/edit form (template, name, model ID, endpoint, Key, unit price and currency, response path, Test connection, save);
  **rendered only as a separate window**: borderless + transparent, the page draws its own rounded panel (draggable title bar, ✕/Esc to close, buttons pinned to the bottom),
  it opens next to the main window in an empty spot, and before closing it notifies the main window to release "stay expanded";
- `PollErrorAlert` / `DataCleanupDialog`: polling-failure alert; asks whether to export or clean up when the data retention period expires.

### 5.4 State management (stores/useStore.ts)

- Runtime state: `models`, `stats` (today's stats per model), `pollStatus`, `selectedModelId`, `edgeState`,
  `dockSide`, `dragging`, `childWindowOpen`;
- History query state: `queryDimension` / `queryFilter` / `selectedDate` / `dailyDetail` / `dailyCosts` /
  `apiKeyList` / `dailyRecords` / `showIgnored`;
- All backend interaction is wrapped in actions (`invoke`); components never call Tauri directly.

## 6. Packaging and runtime shape

- The main window is transparent/borderless/always-on-top/skipTaskbar; the first frame is already the docked size (22×130), avoiding a large window flashing at startup;
- Frontend `pnpm build` → `dist/`, embedded by Rust with `--features custom-protocol`; if it is missing the result is a blank screen;
- Installer: `pnpm tauri build --features custom-protocol` → `src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`;
- On restricted networks `tools/build.ps1` tries a normal `cargo fetch` first, and if that fails it starts the local mirror proxy `tools/registry-proxy.mjs` before building.

## 7. Known limitations

- Windows only; depends on the system WebView2;
- Polling incurs real charges (one minimal request per model per cycle); the 10-minute default is about controlling cost, not a technical ceiling;
- Work-area derivation relies on Chromium's `screen.avail*` (multi-monitor + a taskbar docked on one side is already handled via margins, but it is not ±1px accurate);
- Drag release is still approximated by "position stationary for 400ms" (no pointerup is available during system dragging), without adopting Win32 `GetAsyncKeyState`.
