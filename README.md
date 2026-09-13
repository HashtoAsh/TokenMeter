# TokenMeter

**English** | [中文](README.ZH.md)

A lightweight Windows desktop overlay: at a fixed interval it sends one minimal request to each configured LLM API,
reads the token usage from the response and converts it into a cost, then stays docked to the edge of the screen so
you can glance at today's spend whenever you like.

> **What the numbers cover**: only the poll/test requests that TokenMeter **itself** sends (the `usage` field in a
> response covers a single request). They are not the account's total consumption in other tools.

## Features

| Capability | Description |
|---|---|
| Edge-docked overlay | Transparent, borderless, always-on-top, hidden from the taskbar; normally a 22×130 vertical bar |
| Three-state interaction + edge snapping | Bar → hover for the overview → click for details; drag near a screen edge (<32px) and release to dock and collapse automatically |
| Multi-model management | Built-in DeepSeek / MiMo / ChatGPT templates, plus add and edit; the form opens in its own window, and you "Test connection" before saving |
| Cost estimation | input/output tokens ÷ 1000 × unit price, displayed in the model's currency (¥ / $ / € …) |
| Today's stats | request count, input/output/total tokens and today's cost; the day rolls over at midnight in the **local timezone** |
| History | per-day details by API key / model / total, a 7-day cost trend, monthly CSV export, and anomalous records can be ignored |
| Scheduled polling | every 10 minutes by default (`pollingInterval`); the detail panel offers a ↻ manual poll; failures show their reason in the overview and the details |
| Data retention | local SQLite (`usage_data.db`: usage records + debug logs), 3 months by default; on startup it offers a CSV export or a cleanup |
| Desktop integration | system tray, launch at startup (writes the registry), single instance, minimal window permissions + conservative CSP |

## Quick start

Requirements: Windows 10/11 + WebView2 Runtime + Rust (MSVC) + Node.js ≥ 22.2 + pnpm.

    pnpm install
    pnpm tauri dev                                 # dev: Vite(1420) + debug backend, frontend hot reload
    pnpm tauri build --features custom-protocol    # package: NSIS installer
    node tools/test-window-geometry.cjs            # regression test for docking/expanding geometry (22 assertions)

Artifacts:

- Installer `src-tauri\target\release\bundle\nsis\TokenMeter_0.1.0_x64-setup.exe`
- Portable build `cargo build --release --features custom-protocol` → `src-tauri\target\release\TokenMeter.exe`

`--features custom-protocol` is required; without it the frontend `dist` is not embedded and the app shows a blank
screen at runtime. See [docs/quick-start.md](docs/quick-start.md) for details.

## First run

1. Tray/bar → detail panel → **+ Add** → pick a template or fill in the fields → **Test connection** → Save
2. Fields to provide: name, model ID (the request body's `model`), the full `…/chat/completions` URL, API key,
   input/output price per 1K tokens, and currency
3. For an existing model, click **Edit** to change the key / price / endpoint; **↻ Poll** refreshes today's usage once
4. The History tab queries a given day's details by "by key / by model / total" and exports them to CSV

## Configuration

At runtime the app reads and writes `config.json` in the **working directory** (dev) or the **directory of the exe**
(installed build), and generates the defaults on first launch:

    {
      "models": [ /* model list, see config.example.json for a sample */ ],
      "pollingInterval": 600000   // polling interval in milliseconds, 10 minutes by default
    }

- `models[].responsePath` accepts dot paths and array indexes, e.g. `usage.prompt_tokens`, `choices[0].usage.total_tokens`;
- A corrupt config (JSON parse failure) is first backed up to `config.json.bak.<timestamp>` and only then reset — it is never silently wiped;
- Fields and command interfaces are documented in [docs/api-design.md](docs/api-design.md).

## Project layout

    TokenMeter/
    ├── src/                      # frontend: React 18 + TS + Tailwind + Zustand
    │   ├── App.tsx               # the three states; the single entry point from dock state to window geometry
    │   ├── layout.ts             # per-state sizes, snapping/cooldown/animation parameters
    │   ├── lib/                  # windowGeometry (pure geometry) / windowTauri (execution layer) / addModelWindow (child window)
    │   ├── hooks/useWindowDrag.ts# drag + edge snapping
    │   ├── components/           # FloatingBar / QuickInfo / DetailPanel / ModelManager / HistoryPanel …
    │   └── stores/useStore.ts    # Zustand: models/stats/edgeState/dockSide + invoke wrappers
    ├── src-tauri/                # backend: Rust + Tauri 1.x
    │   ├── src/                  # main.rs / commands.rs / poller.rs / storage.rs / models.rs
    │   ├── tauri.conf.json       # window, allowlist, CSP, bundle targets
    │   └── Cargo.toml
    ├── tools/                    # build.ps1 / registry-proxy.mjs / gen-icon.mjs / test-window-geometry.cjs
    ├── docs/                     # architecture / API / quick start / tech stack
    ├── output/                   # release artifacts (installer + portable build)
    ├── PROGRESS.md               # change history and root-cause notes
    └── config.example.json       # configuration template

## Documentation

Documents are written in English first; translations carry a language suffix such as `.ZH.md`
(`.KR.md` and `.JP.md` are planned).

- [docs/quick-start.md](docs/quick-start.md) — environment, build and packaging, usage, troubleshooting
- [docs/architecture.md](docs/architecture.md) — module breakdown, data flow, window state machine, storage
- [docs/api-design.md](docs/api-design.md) — Tauri commands and events, config schema, HTTP request shape
- [docs/tech-stack.md](docs/tech-stack.md) — the actual dependency list and key engineering configuration
- [PROGRESS.md](PROGRESS.md) — each round of work as "problem → root cause → fix → verification"
- Chinese version: [README.ZH.md](README.ZH.md)

## Changelog

### Unreleased: window experience fixes

- **The "Add/Edit model" window is no longer a "window inside a window"**: the old implementation was a full-page 50% black scrim plus a centered 384×594 panel, with an extra system title bar on top;
  it is now a borderless, transparent, always-on-top 500×690 panel with a single self-drawn title bar (draggable, closed with ✕/Esc) that opens next to the main window by default.
- **Edge docking reworked**: collapsing always snaps to a screen edge; expanding is clamped to the monitor work area (so the taskbar or the bottom of the screen cannot cut it off);
  size and position are applied in the same frame with a 140ms slide transition; there is a cooldown after collapsing, so it no longer "pops back open right after collapsing"; and a bar dragged away from the edge returns to its normal floating size.
- New pure-geometry regression test `pnpm test:geometry`.

### v0.1.0

- Three-state overlay interaction, drag and edge snapping, system tray
- Model management (templates, add/edit, test connection, manual poll, failure notices)
- Automatic polling every 10 minutes; today's token/cost stats (local-timezone day boundary, per-currency display)
- SQLite persistence, history queries and monthly CSV export, record ignoring, retention policy, launch at startup
- Single instance; window permissions declared only where used + conservative CSP
- Tauri 1.x + single-file NSIS installer

## License

[MIT](LICENSE) (third-party components: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md))
