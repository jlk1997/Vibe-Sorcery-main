# 一次性创建 Conda 环境（命名风格与 dog-yolo-py311 一致）
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$EnvName = "vibe-sorcery-py311"

Set-Location $Root

Write-Host "Creating conda env: $EnvName (Python 3.11)..." -ForegroundColor Cyan
conda create -n $EnvName python=3.11 -y

Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
conda run -n $EnvName pip install -r backend\requirements.txt

Write-Host ""
Write-Host "Done. Activate with:" -ForegroundColor Green
Write-Host "  conda activate $EnvName" -ForegroundColor Yellow
Write-Host ""
Write-Host "Then start the stack:" -ForegroundColor Green
Write-Host "  .\scripts\start-infra.ps1" -ForegroundColor Yellow
Write-Host "  .\scripts\start-all.ps1" -ForegroundColor Yellow
