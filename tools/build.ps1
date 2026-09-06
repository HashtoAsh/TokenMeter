# TokenMeter Rust backend build helper.
#
# Why this exists: in some restricted Windows environments (sandbox/CI) cargo's
# schannel TLS backend fails (SEC_E_NO_CREDENTIALS) while Node/OpenSSL works.
# This script falls back to a local Node sparse-registry proxy
# (tools/registry-proxy.mjs) for downloading dependencies.
#
# Usage (from the project root):
#   powershell -ExecutionPolicy Bypass -File tools\build.ps1
#
# Behavior:
#   1) Tries a plain `cargo fetch` using src-tauri\.cargo\config.toml (USTC mirror).
#   2) On failure starts the local proxy, points CARGO_HOME at
#      %TEMP%\tokenmeter-cargo-home (avoids ~/.cargo write-permission issues),
#      and runs `cargo build` through the proxy.
#   First proxy run downloads ~430 crates (1-3 min); later runs use the cache.

$ErrorActionPreference = 'Continue'
$root  = Split-Path -Parent $PSScriptRoot
$tauri = Join-Path $root 'src-tauri'
$proxy = Join-Path $root 'tools\registry-proxy.mjs'

Write-Host '==> [1/3] plain mode: cargo fetch (USTC mirror)'
Push-Location $tauri
cargo fetch 2>$null
$plain = $LASTEXITCODE -eq 0
Pop-Location

if ($plain) {
    Write-Host 'Plain mode OK. Running cargo build (custom-protocol) ...' -ForegroundColor Green
    Push-Location $tauri
    cargo build --features custom-protocol
    $code = $LASTEXITCODE
    Pop-Location
    Write-Host "Done. exit code: $code"
    exit $code
}

Write-Host 'Plain mode failed (schannel TLS). Switching to local proxy 127.0.0.1:8765 ...' -ForegroundColor Yellow

$cfg = Join-Path $env:TEMP 'tm-cargo-proxy.toml'
@'
[http]
multiplexing = false

[source.crates-io]
replace-with = "local"

[source.local]
registry = "sparse+http://127.0.0.1:8765/"
'@ | Set-Content -Path $cfg -Encoding ascii

node -e "fetch('http://127.0.0.1:8765/config.json',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Starting registry-proxy ...' -ForegroundColor Cyan
    Start-Process -FilePath 'node' -ArgumentList "`"$proxy`"" -WindowStyle Hidden | Out-Null
    Start-Sleep -Seconds 2
    node -e "fetch('http://127.0.0.1:8765/config.json',{signal:AbortSignal.timeout(5000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'Proxy not ready. Run manually: node tools\registry-proxy.mjs'
        exit 1
    }
}

# Pick a writable CARGO_HOME, preferring an existing partial cache so reruns
# resume instead of re-downloading everything.
if (Test-Path (Join-Path $env:TEMP 'tokenmeter-cargo-home\registry')) {
    $cargoHome = Join-Path $env:TEMP 'tokenmeter-cargo-home'
} elseif (Test-Path (Join-Path $env:USERPROFILE 'registry\cache')) {
    $cargoHome = $env:USERPROFILE
} else {
    $cargoHome = Join-Path $env:USERPROFILE '.cargo'
}
Write-Host "==> [3/3] cargo build via proxy (CARGO_HOME=$cargoHome)"
$env:CARGO_HOME = $cargoHome
$env:CARGO_NET_RETRY = '10'
$env:CARGO_HTTP_TIMEOUT = '300'
Push-Location $tauri
cargo build --config $cfg --features custom-protocol
$code = $LASTEXITCODE
Pop-Location
Write-Host "Done. exit code: $code   (cargo cache: $cargoHome)"
exit $code
