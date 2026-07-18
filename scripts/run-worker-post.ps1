param(
    [string]$Root = (Split-Path $PSScriptRoot -Parent),
    [string]$CondaEnvName = "vibe-sorcery-py311"
)

. (Join-Path $PSScriptRoot "_bootstrap.ps1") -Root $Root -CondaEnvName $CondaEnvName

Write-Host "Starting Celery post-process worker (queues=post_process) ..." -ForegroundColor Cyan
Write-Host "Use with run-worker.ps1 on Linux/Docker; Windows dev can keep one solo worker with all queues." -ForegroundColor DarkGray
Invoke-VibePython -PythonArgs @(
    "-m", "celery", "-A", "app.celery_app.celery_app", "worker",
    "--loglevel=info", "--pool=solo",
    "-Q", "post_process"
)
