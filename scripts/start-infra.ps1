# Start PostgreSQL, Redis, MinIO via Docker
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Starting infrastructure (postgres, redis, minio)..." -ForegroundColor Cyan
docker compose up -d postgres redis minio

Write-Host "Waiting for health checks..." -ForegroundColor Yellow
Start-Sleep -Seconds 15
docker compose ps postgres redis minio

Write-Host ""
Write-Host "Infrastructure ready." -ForegroundColor Green
Write-Host "Next: run .\scripts\start-dev.ps1 for backend/frontend commands"
