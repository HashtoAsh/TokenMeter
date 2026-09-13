# TokenMeter — Improvement Progress

**English** | [中文](PROGRESS.ZH.md)

> Each round records "problem → root cause → fix → verification". For implementation details of the window/edge docking, see [docs/architecture.md](docs/architecture.md) §5.

## Requirements checklist (historical)

| # | Requirement | Status | Key points |
|---|---|---|---|
| 1 | SQLite persistence | ✅ | `storage.rs`: `usage_records` (usage) + `debug_logs` (logs); data is no longer cleared on exit |
| 2 | Edge-docked hiding | ⚠️ Redone | See "Window experience fixes" below (the old implementation only changed half of it) |
| 3 | Launch at startup (autostart) | ✅ | Writes the registry key `HKCU\…\Run\TokenMeter` directly (`tauri-plugin-autostart` has been removed from crates.io) |
| 4 | History query | ✅ | `HistoryPanel/DatePicker/DailyDetailCard/CostChart`; query a day's details by API Key / model / total + the 7-day trend |
| 5 | Ignored records | ✅ | `ignored` flag; not counted in the statistics, and can be un-ignored |
| 6 | Polling error notifications | ✅ | `poll-status` event + `PollErrorAlert` (only pushed when the state changes) |
| 7 | Data retention and cleanup | ✅ | 3 months by default; at startup prompts to export a monthly CSV or clean up |
| 8 | Debug log | ✅ | Records network failures/permission denials/database locks, etc., and provides query and statistics commands |
| 9 | "Add model" window double frame | ⚠️ Redone | The old change never made it into the artifact, see below |

## 2026-09-13 Window experience fixes

### Problem 1: the Add window "a big window framing a small window"

- **Symptom**: clicking "+ Add" in the expanded state pops up a window that is a dark small panel inside a large gray frame.
- **Root cause (measured evidence)**: at the time, that window rendered `ModelManager` with a root node of
  `fixed inset-0 bg-black/50` (a full-page 50% black overlay) + a centered `w-96 max-h-[90vh]` panel;
  on top of that came another layer, the `decorations: true` system title bar.
  Capturing the running artifact with `PrintWindow` and scanning it pixel by pixel: the client area was 480×660 and the content only 384×594,
  with exactly a **solid `127,127,127` of 48px left/right / 33px top/bottom** around it — matching "50% black over white = 127.5",
  `w-96`=384, and `max-h-[90vh]`=594 exactly.
- **Another trap**: the source only removed the overlay at 13:38, while the artifact running at the time had been built at 11:30 — **the fix never made it into the artifact at all**,
  which is why it looked like it "was never solved". Also, `WebviewWindow.getByLabel()` reads a snapshot of the windows taken when the page loaded,
  so the old code's "close the existing one first, then rebuild" never took effect (clicking "+ Add" repeatedly actually did nothing).
- **Fix**: added `src/lib/addModelWindow.ts` to manage child windows centrally — borderless + transparent + always on top + not in the taskbar,
  size 500×690 (a 10px transparent margin on all sides reserved for the drop shadow); when opened it is placed in an **empty slot** beside the main window (left side first → right side → centered),
  clamped within the work area; the same model reuses the window (show + setFocus), and switching models closes the old window first and waits 200ms before creating a new one.
  `ModelManager` keeps only **one** outer frame (rounded panel + custom-drawn title bar: draggable, closed with ✕/Esc, buttons pinned to the bottom).
  The main window stays expanded while the child window is open.
- **Verification**: on the packaged artifact, clicking "Add" in a real run → the 500×690 child window appears 12px to the left of the main window;
  scanning the screenshot pixel by pixel: only a 10px transparent margin + a 480px panel, **number of `127,127,127` pixels = 0**.

### Problem 2: Edge-docked hiding

| # | Defect | Consequence |
|---|---|---|
| 1 | `docked` only docks when "the current position is already at the edge" | After the bar is dragged away from the edge it permanently becomes a small bar floating in the middle of the screen |
| 2 | Expanding only changes the size and does not clamp to the work area | When the docked position is too low, the 400×640 window is cut off by the taskbar/screen bottom |
| 3 | `setPosition`/`setSize` are dispatched as two separate async calls (the expand branch does not even await them) | The state switch "jumps position first, then resizes", causing two-stage jitter |
| 4 | No cooldown after collapsing, and the pointer is not required to leave first | When you click "Collapse" the pointer is still on the bar → it immediately pops open again |
| 5 | Snapping approximates release with "stationary for 250ms" and only checks once | A pause in the middle of a drag is misread as release; after snapping it can still be dragged away |

**Fix**: the window geometry converges into a single path — `computeTargetRect()` (pure function) → `animateToRect()` (execution layer):

- `docked` always snaps to the screen edge (also clamped vertically); `hovering/expanded` that were originally docked expand inward anchored on that edge,
  otherwise they keep their current position (dragging to the middle will not be pulled back); all rectangles are clamped within the **work area**
  (the monitor bounds from `currentMonitor()` minus the taskbar margin derived from Chromium's `screen.avail*`);
- Size and position are dispatched in the same frame + a 140ms `easeOutCubic` slide transition; the first positioning at startup is not animated;
- Collapsing adds a 420ms cooldown + "the pointer must leave the edge-docked bar first"; auto-collapse is disabled while dragging or while a child window is open;
- The drag release threshold goes from 250ms to `DRAG_SETTLE_MS`=400ms (reduced to 150ms when a real `pointerup` is received);
  when not snapping, clamp back to the work area, and **if it was originally the 22px bar, restore it to the normal floating size**; after snapping, self-check once 520ms later.

### Changed files

| File | Description |
|---|---|
| `src/lib/windowGeometry.ts` / `windowTauri.ts` / `addModelWindow.ts` | New: pure geometry / execution layer / child-window lifecycle |
| `src/App.tsx` | Edge-docked state → the single entry point for window geometry; anti-bounce cooldown; child-window lock |
| `src/hooks/useWindowDrag.ts` | Release detection, placement strategy, edge-docking self-check |
| `src/components/DetailPanel.tsx` / `ModelManager.tsx` / `FloatingBar.tsx` | Switched to the new window module; child window reduced to a single frame; removed duplicate hover logic |
| `src/stores/useStore.ts` / `layout.ts` / `types.ts` | `dockSide/dragging/childWindowOpen`; edge-docking parameters; `DockSide` |
| `tools/test-window-geometry.cjs` + `package.json` | Geometry regression tests (`pnpm test:geometry`, 22 assertions, loads the real source directly) |

### Verification

- `tsc --noEmit` exit 0; `pnpm test:geometry` all 22 green (including regression cases for the old defects);
- Headless rendering + pixel-by-pixel screenshots from real runs of the packaged artifact (see above);
- During re-verification on the real machine, one self-introduced defect was also found and fixed: the **first** mouse entry into the edge-docked bar after startup had no effect
  (the first positioning was misread as "the user collapsed" and the hover was released) → distinguished with `prevEdgeStateRef`; re-tested after repackaging and passed.

### Not done (requires changing Rust and recompiling)

- `GetAsyncKeyState` to determine precisely whether a drag has been released (currently approximated by "stationary for 400ms");
- `GetMonitorInfoW` to read the work area directly (currently derived from Chromium's `screen.avail*`; numerically equivalent but adds one more dependency layer).

## Packaging and real-machine verification (2026-09-13)

| Artifact | Size | Description |
|---|---|---|
| `output/TokenMeter_0.1.0_x64-setup.exe` | 3.5 MB | NSIS installer |
| `output/portable/TokenMeter.exe` | 11.2 MB | Portable build (no installation required) |

Measured on the real build (running the portable build directly, Win32 window-rectangle enumeration + simulated mouse):

| Operation | Measured | Expected |
|---|---|---|
| Launch | 22×130 @x=2538 | docked to the right edge (2560−22) |
| First entry | 320×400 (right edge 2560) | expands leftward anchored on the docked edge |
| Click | 400×640, stable within 3s | expanded |
| Click "+ Add" | new 500×690 @12px to the left of the main window | child window does not overlap and is not covered by the always-on-top main window |

For packaging commands see [docs/quick-start.md](docs/quick-start.md) §3; for machine-local environment details such as the cargo cache/mirror, see `.local/local-build-notes.md`.

## Known limitations

- Polling is really billed: one minimal request per model per cycle; the default 10-minute interval is meant to control cost;
- The statistics scope only covers TokenMeter's own requests and does not represent the account's total consumption;
- Windows only; data is retained for 3 months, and data older than that must be exported/cleaned up manually.
