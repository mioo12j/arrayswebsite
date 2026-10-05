# ARRAYS INGENIERIA — ERP local launcher
# Starts the app server (if not already running) and opens it in a clean,
# app-style browser window so it feels like a desktop application.

$ErrorActionPreference = 'SilentlyContinue'
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$server = Join-Path $root 'server'
$url    = 'http://localhost:4000'

# Make sure Node is on PATH (it is installed machine-wide).
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
            [Environment]::GetEnvironmentVariable('Path','User')

# First-time safety: if dependencies or the built web app are missing (a fresh
# clone, or right after a code update), install + build before starting so the
# operator never sees a blank page.
if (-not (Test-Path (Join-Path $server 'node_modules'))) {
  Start-Process -FilePath 'npm' -ArgumentList 'install','--no-audit','--no-fund' -WorkingDirectory $server -Wait -WindowStyle Hidden
}
if (-not (Test-Path (Join-Path $root 'client\node_modules'))) {
  Start-Process -FilePath 'npm' -ArgumentList 'install','--no-audit','--no-fund' -WorkingDirectory (Join-Path $root 'client') -Wait -WindowStyle Hidden
}
if (-not (Test-Path (Join-Path $root 'client\dist\index.html'))) {
  Start-Process -FilePath 'npm' -ArgumentList 'run','build' -WorkingDirectory (Join-Path $root 'client') -Wait -WindowStyle Hidden
}

# Start the server only if nothing is already listening on port 4000.
$listening = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Start-Process -FilePath 'node' -ArgumentList 'src/index.js' `
                -WorkingDirectory $server -WindowStyle Hidden
}

# Wait until the app answers (up to ~30 seconds on a cold start).
for ($i = 0; $i -lt 40; $i++) {
  try {
    if ((Invoke-WebRequest "$url/api/health" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200) { break }
  } catch { }
  Start-Sleep -Milliseconds 800
}

# Prefer Chrome, fall back to Edge (always present on Windows 10/11),
# finally the default browser.
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$edge = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if     ($chrome) { Start-Process $chrome "--app=$url --window-size=1280,860" }
elseif ($edge)   { Start-Process $edge   "--app=$url --window-size=1280,860" }
else             { Start-Process $url }
