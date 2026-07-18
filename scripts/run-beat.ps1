param(
    [string]$Root = (Split-Path $PSScriptRoot -Parent),
    [string]$CondaEnvName = "vibe-sorcery-py311"
)

. (Join-Path $PSScriptRoot "_bootstrap.ps1") -Root $Root -CondaEnvName $CondaEnvName

Write-Host "Starting Celery beat (subscription reminders, mock renewals) ..." -ForegroundColor Cyan
Write-Host "Run only ONE beat instance (Windows requires separate process from worker)." -ForegroundColor DarkGray
Invoke-VibePython -PythonArgs @(
    "-m", "celery", "-A", "app.celery_app.celery_app", "beat",
    "--loglevel=info"
)
