param(
    [string]$Root = (Split-Path $PSScriptRoot -Parent),
    [string]$CondaEnvName = "vibe-sorcery-py311"
)

. (Join-Path $PSScriptRoot "_bootstrap.ps1") -Root $Root -CondaEnvName $CondaEnvName

Write-Host "Running database migrations (Alembic)..." -ForegroundColor Cyan
Invoke-VibePython -PythonArgs @("-m", "alembic", "upgrade", "head")
if ($LASTEXITCODE -ne 0) {
    Write-Host "Alembic upgrade failed — fix migrations before starting API." -ForegroundColor Red
    exit $LASTEXITCODE
}
$env:RUN_ALEMBIC_ON_STARTUP = "false"

Write-Host "Starting API on http://localhost:8000 ..." -ForegroundColor Cyan
Invoke-VibePython -PythonArgs @("-m", "uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000")
