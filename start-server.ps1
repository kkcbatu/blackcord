$ErrorActionPreference = "Stop"

Write-Host "Black Cord sunucusu baslatiliyor..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js bulunamadi. Once https://nodejs.org adresinden LTS surumu kur." -ForegroundColor Red
  exit 1
}

node "$PSScriptRoot\server.js"
