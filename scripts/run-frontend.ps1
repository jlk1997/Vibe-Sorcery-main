param(
    [string]$Root = (Split-Path $PSScriptRoot -Parent)
)

Set-Location (Join-Path $Root "apps\client")
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing client dependencies..." -ForegroundColor Yellow
    npm install
}
$env:TARO_APP_API_URL = "http://localhost:8000/api/v1"
Write-Host "Starting Taro H5 on http://localhost:10086 ..." -ForegroundColor Cyan
npm run dev:h5
