# TokenMeter Rust backend build helper.
#
# Why this exists: in some restricted Windows environments (sandbox/CI) cargo's
# schannel TLS backend fails (SEC_E_NO_CREDENTIALS) while Node/OpenSSL works.
# This script falls back to a local Node sparse-registry proxy
# (tools/registry-proxy.mjs, 127.0.0.1:8765) for downloading dependencies.
#
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File tools\build.ps1
#
# Behavior:
#   1) Tries a plain `cargo fetch` first (if src-tauri\.cargo\config.toml points at
#      a local proxy/mirror it is used; without that file the default crates.io
#      source is used on healthy machines).
#   2) On failure, starts the local proxy if it is not already reachable,
#      points CARGO_HOME at a writable location with an existing cache when
#      possible, and runs `cargo build` through the proxy.
#   3) The proxy path always restores the touched environment variables,
#      deletes the temporary cargo config, and stops the proxy it started
#      (even when exiting early, via try/finally).
#
#   First proxy run downloads ~430 crates (1-3 min); later runs use the cache.

$ErrorActionPreference = 'Stop'   # unexpected errors abort; finally cleans up

$root     = Split-Path -Parent $PSScriptRoot
$tauri    = Join-Path $root 'src-tauri'
$manifest = Join-Path $tauri 'Cargo.toml'
$proxy    = Join-Path $root 'tools\registry-proxy.mjs'

# Remember original env so we can restore it (A9)
$origHome    = $env:CARGO_HOME
$origRetry   = $env:CARGO_NET_RETRY
$origTimeout = $env:CARGO_HTTP_TIMEOUT

$startedProxy = $null                 # proxy started by this script (stop on exit)
$cfg          = Join-Path $env:TEMP 'tm-cargo-proxy.toml'

function Restore-Env {
    if ($null -eq $origHome) { Remove-Item Env:CARGO_HOME -ErrorAction SilentlyContinue }
    else { $env:CARGO_HOME = $origHome }

    if ($null -eq $origRetry) { Remove-Item Env:CARGO_NET_RETRY -ErrorAction SilentlyContinue }
    else { $env:CARGO_NET_RETRY = $origRetry }

    if ($null -eq $origTimeout) { Remove-Item Env:CARGO_HTTP_TIMEOUT -ErrorAction SilentlyContinue }
    else { $env:CARGO_HTTP_TIMEOUT = $origTimeout }
}

function Test-ProxyReady {
    node -e "fetch('http://127.0.0.1:8765/config.json',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>$null
    return ($LASTEXITCODE -eq 0)
}

# ---------- [1/3] plain mode ----------
Write-Host '==> [1/3] plain mode: cargo fetch'
cargo fetch --manifest-path $manifest 2>$null
$plain = ($LASTEXITCODE -eq 0)

if ($plain) {
    Write-Host 'Plain mode OK. Running cargo build (custom-protocol) ...' -ForegroundColor Green
    cargo build --manifest-path $manifest --features custom-protocol
    $code = $LASTEXITCODE
    Write-Host "Done. exit code: $code"
    exit $code
}

Write-Host 'Plain mode failed (schannel TLS). Switching to local proxy 127.0.0.1:8765 ...' -ForegroundColor Yellow

# Node pre-check: clear error instead of a generic "proxy not ready" later
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: Node.js not found - the local registry proxy needs node (>=22.2). Please install Node.js first.' -ForegroundColor Red
    exit 1
}

try {
    # Generate the temporary cargo config pointing at the local proxy
    @'
[http]
multiplexing = false

[source.crates-io]
replace-with = "local"

[source.local]
registry = "sparse+http://127.0.0.1:8765/"
'@ | Set-Content -Path $cfg -Encoding ascii

    if (-not (Test-ProxyReady)) {
        Write-Host 'Starting registry-proxy ...' -ForegroundColor Cyan
        $startedProxy = Start-Process -FilePath 'node' -ArgumentList "`"$proxy`"" -WindowStyle Hidden -PassThru
        Start-Sleep -Seconds 2
        if (-not (Test-ProxyReady)) {
            Write-Host "ERROR: proxy not ready on 127.0.0.1:8765. Run it manually: node $proxy" -ForegroundColor Red
            exit 1
        }
    }

    # Pick a writable CARGO_HOME, preferring an existing partial cache so reruns
    # resume instead of re-downloading everything.
    if (Test-Path (Join-Path $env:TEMP 'tokenmeter-cargo-home\registry')) {
        $cargoHome = Join-Path $env:TEMP 'tokenmeter-cargo-home'
    }
    elseif (Test-Path (Join-Path $env:USERPROFILE '.cargo\registry\cache')) {
        $cargoHome = Join-Path $env:USERPROFILE '.cargo'
    }
    else {
        $cargoHome = Join-Path $env:USERPROFILE '.cargo'
    }

    Write-Host "==> [3/3] cargo build via proxy (CARGO_HOME=$cargoHome)"
    $env:CARGO_HOME = $cargoHome
    $env:CARGO_NET_RETRY = '10'
    $env:CARGO_HTTP_TIMEOUT = '300'

    cargo build --manifest-path $manifest --config $cfg --features custom-protocol
    $code = $LASTEXITCODE
    Write-Host "Done. exit code: $code   (cargo cache: $cargoHome)"
    exit $code
}
finally {
    # A9: restore env + remove the temporary config file
    Restore-Env
    if (Test-Path -LiteralPath $cfg) {
        Remove-Item -LiteralPath $cfg -Force -ErrorAction SilentlyContinue
    }
    # P3-9: stop the proxy started by this script (no orphan node process)
    if ($null -ne $startedProxy -and -not $startedProxy.HasExited) {
        Stop-Process -Id $startedProxy.Id -Force -ErrorAction SilentlyContinue
    }
}
