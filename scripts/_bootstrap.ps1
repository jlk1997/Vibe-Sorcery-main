param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [string]$CondaEnvName = ""
)

Set-Location $Root
$backendPath = Join-Path $Root "backend"
$env:PYTHONPATH = "$Root;$backendPath"

if (Test-Path (Join-Path $Root ".env")) {
    Get-Content (Join-Path $Root ".env") | ForEach-Object {
        if ($_ -match '^([^#=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            # .env 优先于 shell 中残留的旧变量（避免 MINIMAX_API_KEY=test 等覆盖真实配置）
            Set-Item -Path "env:$name" -Value $value -Force
        }
    }
}

if (-not $env:DATABASE_URL) { $env:DATABASE_URL = "postgresql://vibe:vibe@localhost:5433/vibe_sorcery" }
if (-not $env:CELERY_BROKER_URL) { $env:CELERY_BROKER_URL = "redis://localhost:6379/1" }
if (-not $env:CELERY_RESULT_BACKEND) { $env:CELERY_RESULT_BACKEND = "redis://localhost:6379/2" }
if (-not $env:S3_ENDPOINT) { $env:S3_ENDPOINT = "http://localhost:9000" }

Set-Location $backendPath

function Get-VibePythonExe {
    param([string]$CondaEnvName)

    # Prefer the already-active conda env (avoids flaky `conda run` on Windows).
    if ($CondaEnvName -and $env:CONDA_DEFAULT_ENV -eq $CondaEnvName) {
        $active = Get-Command python -ErrorAction SilentlyContinue
        if ($active) { return $active.Source }
    }

    if ($CondaEnvName) {
        if ($env:CONDA_PREFIX -and (Split-Path $env:CONDA_PREFIX -Leaf) -eq $CondaEnvName) {
            $py = Join-Path $env:CONDA_PREFIX "python.exe"
            if (Test-Path $py) { return $py }
        }
        try {
            $json = conda env list --json 2>$null | ConvertFrom-Json
            foreach ($envPath in $json.envs) {
                if ($envPath -replace '\\', '/' -match "/$([regex]::Escape($CondaEnvName))$") {
                    $py = Join-Path $envPath "python.exe"
                    if (Test-Path $py) { return $py }
                }
            }
        } catch { }
    }

    $venvPy = Join-Path $Root ".venv\Scripts\python.exe"
    if (Test-Path $venvPy) { return $venvPy }

    $fallback = Get-Command python -ErrorAction SilentlyContinue
    if ($fallback) { return $fallback.Source }

    return $null
}

function Invoke-VibePython {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PythonArgs)

    $pythonExe = Get-VibePythonExe -CondaEnvName $CondaEnvName
    if (-not $pythonExe) {
        Write-Host "Python not found. Activate '$CondaEnvName' or create .venv under the repo root." -ForegroundColor Red
        exit 1
    }

    & $pythonExe @PythonArgs
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
