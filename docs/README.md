# TokenMeter — Documentation

**English** | [中文](README.ZH.md)

TokenMeter is a **Windows desktop overlay** that periodically probes the token usage and cost of OpenAI-compatible
LLM APIs. For an overview of the project see the repository root [README.md](../README.md).

## Documents

| Document | Contents |
|---|---|
| [quick-start.md](quick-start.md) | environment, build and packaging, usage, FAQ |
| [architecture.md](architecture.md) | module breakdown, data flow, window state machine, SQLite storage, packaging forms |
| [api-design.md](api-design.md) | Tauri commands and events, config schema, polling requests and parsing |
| [tech-stack.md](tech-stack.md) | the actual dependency list and key engineering configuration |
| [../PROGRESS.md](../PROGRESS.md) | change history and root-cause notes (repository root) |

## Languages

English is the primary language of this documentation set. Translations are published next to the original with a
language suffix: `*.ZH.md` (Simplified Chinese) today, `*.KR.md` / `*.JP.md` planned.

## Project at a glance

- Desktop framework: Tauri 1.x (Rust), Windows only (WebView2); the main window is transparent, borderless,
  always-on-top and skipped in the taskbar
- Frontend: React 18 + TypeScript + Vite 4 + Tailwind CSS 3 + Zustand 4
- Backend: Rust (tauri / reqwest(rustls) / tokio / serde / chrono / rusqlite / log); organized with `mod`
  inside `main.rs`, no lib.rs
- Persistence: SQLite (`usage_data.db`, usage records + debug logs) plus one JSON config (`config.json`)
- Interaction: edge-docked bar → hover overview → click for details; a separate window adds/edits models;
  history queries and CSV export

Other files at the repository root: `config.example.json` (configuration template), `PROGRESS.md` (change history),
`output/` (release artifacts), `tools/` (build and icon scripts, geometry regression test).
