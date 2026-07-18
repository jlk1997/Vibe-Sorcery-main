param(
    [string]$Root = (Split-Path $PSScriptRoot -Parent),
    [string]$CondaEnvName = "vibe-sorcery-py311"
)

. (Join-Path $PSScriptRoot "_bootstrap.ps1") -Root $Root -CondaEnvName $CondaEnvName

Write-Host "Starting Celery worker (Windows pool=solo, queues=celery+priority+post_process) ..." -ForegroundColor Cyan
Write-Host "Note: on Windows run .\scripts\run-beat.ps1 in a separate terminal for scheduled tasks." -ForegroundColor DarkGray
Invoke-VibePython -PythonArgs @(
    "-m", "celery", "-A", "app.celery_app.celery_app", "worker",
    "--loglevel=info", "--pool=solo",
    "-Q", "celery,priority,post_process"
)
