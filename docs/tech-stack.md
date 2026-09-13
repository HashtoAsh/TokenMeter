# TokenMeter — Tech Stack

**English** | [中文](tech-stack.ZH.md)

## 1. Overview

| Layer | Technology | Version (per the manifest files) |
|---|---|---|
| Desktop framework | Tauri (Rust) | `tauri` 1.5 / `tauri-build` 1.5 |
| Frontend | React + TypeScript | ^18.2 / ^5.2 |
| Build | Vite | ^4.5 (Tailwind ^3.4 + postcss/autoprefixer) |
| State management | Zustand | ^4.4 |
| Tauri JS API / CLI | `@tauri-apps/api` / `@tauri-apps/cli` | ^1.5 / ^1.6 |
| Storage | SQLite (`rusqlite`, bundled) | 0.31 |
| Platform | Windows only (WebView2) | — |

## 2. Frontend dependencies (`package.json`)

| Package | Version | Purpose |
|---|---|---|
| `react` / `react-dom` | ^18.2 | UI |
| `zustand` | ^4.4 | Global state (models/stats/dock state) |
| `@tauri-apps/api` | ^1.5 | `invoke` / events / window API |
| Dev dependencies | — | `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `autoprefixer`, `postcss`, `@tauri-apps/cli`, `@types/react(-dom)` |

Scripts: `dev`=`vite`, `build`=`tsc && vite build`, `preview`, `tauri`, `test:geometry`=`node tools/test-window-geometry.cjs`.

**Deliberately not introduced**: component libraries (shadcn/ui and the like), chart libraries (the trend chart is hand-written SVG), routing, ESLint/Prettier.

## 3. Rust dependencies (`src-tauri/Cargo.toml`)

| crate | Version | Purpose |
|---|---|---|
| `tauri` | 1.5 | Runtime; features enable only `system-tray` + 9 fine-grained `window-*` |
| `tauri-build` | 1.5 | Build-time validation + asset embedding |
| `reqwest` | 0.11 | Polling/test requests, with only `json`+`rustls-tls` (not the system schannel) |
| `tokio` | 1.x | Async runtime (full) |
| `serde` / `serde_json` | 1.0 | Config and IPC serialization |
| `chrono` | 0.4 | Local-timezone day rollover, timestamps |
| `rusqlite` | 0.31 (bundled) | SQLite persistence (ships its own SQLite source, no system library needed) |
| `log` + `env_logger` | 0.4 / 0.10 | Logging (info by default) |
| `single-instance` | 0.3 | Single-instance mutex |
| `winreg` | 0.52 | Launch-at-startup registry entry |
| `dirs` / `hostname` / `uuid` | 5.0 / 0.3 / 1.0 | User identity for the debug log (machine name + random segment) |

Key points:

- `features = { custom-protocol = ["tauri/custom-protocol"] }` decides whether the frontend `dist` is embedded;
- **Cargo's `tauri` features must correspond one-to-one with `allowlist.window` in `tauri.conf.json`**,
  and `tauri-build` validates this at build time, so changing one place requires updating the other;
- Unused capabilities (`http-all` / `notification-all` / `shell-open` / `window-all`) are never enabled.

## 4. Key project configuration

**`tauri.conf.json`**

| Item | Value / key points |
|---|---|
| Main window | `label: main`, 22×130 (the first frame is already the edge-docked vertical bar), `transparent`, `decorations: false`, `alwaysOnTop`, `skipTaskbar`, `resizable: false` |
| allowlist | `all: false`; window enables only create/show/hide/close/setFocus/unminimize/setSize/setPosition/startDragging |
| CSP | Non-empty conservative policy (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`, etc.) |
| Packaging | `targets: nsis`, `identifier: com.tokenmeter.app`, icons icons/* |
| Build | `beforeDevCommand: pnpm dev`, `beforeBuildCommand: pnpm build`, `devPath: http://localhost:1420`, `distDir: ../dist` |

**`vite.config.ts`**: port fixed at 1420 (strictPort), `envPrefix: ['VITE_','TAURI_']`, Windows build target chrome105.

**Optional local cargo source replacement**: on restricted networks you can point `src-tauri/.cargo/config.toml` at a local mirror
(`tools/registry-proxy.mjs`, default `http://127.0.0.1:8765/`); that directory is machine-private configuration and must not be committed.

## 5. Platform and runtime

- Windows only: transparent/always-on-top/skipTaskbar/tray windows are all Windows semantics; depends on the system WebView2;
- Environment: Rust stable (MSVC), Node ≥ 22.2 + pnpm, WebView2 Runtime.

## 6. Icons

`tools/gen-icon.mjs` generates a 1024² source image → `pnpm tauri icon <source image>` produces the full set in `src-tauri/icons/` (ico/icns/png at every size).

## 7. Storage and configuration

- `config.json`: model list + `pollingInterval` (working directory first, otherwise the exe directory);
- `usage_data.db`: SQLite, two tables `usage_records` (usage, including the `ignored` flag) and `debug_logs` (debug log);
- No cloud, no telemetry; nothing is written to user directories besides those two files.

For details see [architecture.md](architecture.md); for fields and commands see [api-design.md](api-design.md).
