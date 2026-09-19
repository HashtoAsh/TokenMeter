# TokenMeter — Quick Start (Windows)

> 本文档包含中英文双语内容。

## 1. Requirements

| Component | Notes |
|---|---|
| Rust | stable + MSVC toolchain |
| Node.js | **≥ 22.2** (`package.json` engines constraint; `tools/gen-icon.mjs` uses `zlib.crc32`) |
| pnpm | package manager |
| WebView2 Runtime | Usually already bundled with Windows 10 1803+ |
| Visual C++ Build Tools | Required for linking with Rust MSVC |

Windows only; no macOS/Linux toolchain is needed.

## 2. Development

    pnpm install
    pnpm tauri dev      # starts Vite(1420) + debug backend; debug mode loads http://localhost:1420

## 3. Build and package

    pnpm build                                     # frontend only: tsc && vite build → dist/
    node tools/test-window-geometry.cjs            # edge-docking/expand geometry regression test (22 assertions, no Tauri needed)

    # portable build (the feature is mandatory, otherwise the frontend is not embedded and the app shows a blank screen at runtime)
    cd src-tauri
    cargo build --release --features custom-protocol

    # installer (NSIS)
    pnpm tauri build --features custom-protocol

| Artifact | Path |
|---|---|
| Portable exe | `src-tauri\target\release\TokenMeter.exe` |
| Installer | `src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe` |
| Release directory (assembled by hand) | `output/TokenMeter_0.1.0_x64-setup.exe`, `output/portable/TokenMeter.exe` |

Notes:

- `--features custom-protocol` determines whether `dist` is embedded; it is required both for packaging and for "running the exe standalone";
- `beforeBuildCommand` runs `pnpm build` first; if the local pnpm wrapper does not understand the `&&` in the script,
  you can run `tsc --noEmit` and `vite build` separately first, then temporarily change that command to `cmd /c exit 0` (**remember to change it back after packaging**);
- When the network is restricted (cargo cannot fetch dependencies), use the one-shot script:
  `powershell -ExecutionPolicy Bypass -File tools\build.ps1` — it first tries a plain `cargo fetch`, and on failure automatically starts the local
  `tools/registry-proxy.mjs` mirror proxy before building, and guarantees that environment variables and temporary files are restored.

## 4. Packaged artifacts and measured verification (2026-09-13)

| File | Size |
|---|---|
| `output/TokenMeter_0.1.0_x64-setup.exe` | 3.5 MB |
| `output/portable/TokenMeter.exe` | 11.2 MB |

Window rectangles measured on the real build by running the portable build directly (Win32 enumeration + mouse simulation):

| Operation | Measured | Expected |
|---|---|---|
| Launch | 22×130 docked to the right edge (x=2538) | docked to the screen edge |
| First mouse entry | 320×400 (right edge still 2560) | expands inward anchored on the docked edge |
| Click | 400×640, stable, no jitter | expanded |
| Click "+ Add" | new 500×690 child window, 12px to the left of the main window | child window does not stack on or get covered by the main window |

Pixel-by-pixel scan of an Add-window screenshot: only a 10px transparent margin + a 480px rounded panel, **no `127,127,127` gray band**
(the old version had a solid 48px/33px gray band here, i.e. "a big window framing a small window"). The evidence images are stored at `.local/before-add-window.png` / `after-add-window.png`.

## 5. Usage

    docked edge-docked vertical bar (22×130) ──mouse enters──▶ hovering overview (320×400)
       ▲                                                     │ click
       │  collapse (leave for 260ms or click "Collapse")  ▼
       └──────────────────────────────────────────────── expanded detail (400×640)

- **Drag**: hold and drag anywhere on the window; on release, if the pointer is within <32px of the left/right screen edge it automatically snaps to the edge and collapses, otherwise it stays where it is (it will not be forcibly pulled back).
- **Tray**: Show main window / Hide main window / Quit.
- **Single instance**: launching again only brings the existing window to the foreground; to restart, quit from the tray first.
- **Model management**: the detail panel's **+ Add / Edit** opens a separate window — choose a template or fill in the fields by hand (name, model ID, full
  `…/chat/completions` URL, API Key, input/output unit price per 1K tokens, currency, response path), then **Test connection**; save once it passes; saving automatically closes the child window and refreshes the main window. The child window can be dragged by its title bar and closed with ✕ or Esc.
- **Stats**: the detail panel's **↻ Poll** manually triggers one polling pass over all models (real requests, billed);
  the Today tab shows the request count, input/output/total tokens and cost for the selected model; the History tab lets you query a day's details by Key/model/total,
  view the 7-day cost trend, export a monthly CSV, and ignore abnormal records.
- **Data retention**: 3 months by default; at startup, if older data is found, it asks whether to export a CSV or clean it up directly.
- **Launch at startup (autostart)**: a toggle in the Settings tab, written to `HKCU\…\CurrentVersion\Run`.

## 6. Configuration file

At runtime, `config.json` is read from and written to the **working directory** (used first if it exists) or the **directory containing the exe**; default values are generated automatically on first launch:

    { "models": [ /* see config.example.json */ ], "pollingInterval": 600000 }

- Model/interval changes are written back immediately; if the config is corrupt (JSON parse failure), it is first backed up as `config.json.bak.<timestamp>` and then reset, never silently cleared;
- Usage data is stored in the SQLite file `usage_data.db` in the same directory (usage records + debug logs);
- For field meanings, see [api-design.md](api-design.md).

## 7. FAQ

**Q1 Blank screen at runtime?** The build was missing `--features custom-protocol` (the frontend was not embedded).
In debug mode it instead tries to load `http://localhost:1420`, so `pnpm dev` must be kept running.

**Q2 The app exits immediately on launch and the log reports WebView2 `0x800700AA` (resource in use)?**
Delete the WebView2 profile cache `%LOCALAPPDATA%\com.tokenmeter.app` and restart.

**Q3 Double-clicking the icon does nothing?** Single-instance design: it only brings the existing window to the front. When the window is hidden, use "Show main window" from the tray.

**Q4 Can't find the edge-docked bar?** It only docks to the left/right screen edge; dragging it to the middle of the screen restores it to the normal floating size (it will not get stuck as a small bar).

**Q5 The cost does not match your account bill?** The statistics scope only covers TokenMeter's own polling requests; see the statistics-scope note in [README](../README.md).

**Q6 Regenerate the icon?** `node tools\gen-icon.mjs` (outputs to the script directory, requires Node ≥ 22.2) →
`pnpm tauri icon <source image path>` generates the full set in `src-tauri/icons/`.

## 8. Related documents

- [../README.md](../README.md): overview, features, configuration
- [architecture.md](architecture.md): architecture, window state machine, storage
- [api-design.md](api-design.md): commands, events, config schema
- [tech-stack.md](tech-stack.md): dependencies and technology choices
