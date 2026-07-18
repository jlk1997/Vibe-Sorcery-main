# One-click Windows dev launcher — supports conda (vibe-sorcery-py311) or .venv
$Root = Split-Path $PSScriptRoot -Parent
$CondaEnvName = "vibe-sorcery-py311"
$VenvActivate = Join-Path $Root ".venv\Scripts\Activate.ps1"

function Test-CondaEnv([string]$Name) {
    if ($env:CONDA_DEFAULT_ENV -eq $Name) { return $true }
    try {
        $out = conda env list 2>$null | Out-String
        if ($out -match "(?m)^$([regex]::Escape($Name))\s") { return $true }
        $json = conda env list --json 2>$null | ConvertFrom-Json
        foreach ($path in $json.envs) {
            if ($path -replace '\\', '/' -match "/$Name$") { return $true }
        }
    } catch { }
    return $false
}

$UseConda = Test-CondaEnv $CondaEnvName
$UseVenv = (Test-Path $VenvActivate)

if (-not $UseConda -and -not $UseVenv) {
    Write-Host "No Python env found." -ForegroundColor Red
    Write-Host "Conda (recommended): .\scripts\setup-conda.ps1" -ForegroundColor Yellow
    Write-Host "Or venv: python -m venv .venv && pip install -r backend\requirements.txt" -ForegroundColor Yellow
    exit 1
}

$condaArg = if ($UseConda) { $CondaEnvName } else { "" }

if ($UseConda) {
    Write-Host "Using conda env: $CondaEnvName" -ForegroundColor Cyan
} else {
    Write-Host "Using venv: .venv" -ForegroundColor Cyan
}

Write-Host "Starting Vibe Sorcery (API + Celery worker + beat + Frontend)..." -ForegroundColor Cyan

Start-Process powershell -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $PSScriptRoot "run-api.ps1"),
    "-Root", $Root, "-CondaEnvName", $condaArg
)
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $PSScriptRoot "run-worker.ps1"),
    "-Root", $Root, "-CondaEnvName", $condaArg
)
Start-Sleep -Seconds 1
Start-Process powershell -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $PSScriptRoot "run-beat.ps1"),
    "-Root", $Root, "-CondaEnvName", $condaArg
)
Start-Sleep -Seconds 1
Start-Process powershell -ArgumentList @(
    "-NoExit", "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $PSScriptRoot "run-frontend.ps1"),
    "-Root", $Root
)

Write-Host ""
Write-Host "Web H5:  http://localhost:10086" -ForegroundColor Green
Write-Host "API:  http://localhost:8000/docs" -ForegroundColor Green
Write-Host "Ensure Docker infra is running: .\scripts\start-infra.ps1  (only postgres + redis + minio)" -ForegroundColor Yellow
Write-Host "API / Celery worker / beat / frontend run locally in separate windows — no Docker worker needed." -ForegroundColor DarkGray
Write-Host "IMPORTANT: If generation stays on 'queued' or times out, confirm the Celery worker window is running (run-worker.ps1)." -ForegroundColor Yellow
Write-Host "Worker must listen to queues: celery,priority,post_process (Windows solo dev)" -ForegroundColor DarkGray
Write-Host "Docker/Linux: split generation (celery,priority) and post_process workers for better throughput." -ForegroundColor DarkGray
Write-Host "Windows: worker + beat are separate windows (Celery does not support -B on Windows)." -ForegroundColor DarkGray
