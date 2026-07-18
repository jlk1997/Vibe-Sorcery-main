$Root = Split-Path $PSScriptRoot -Parent

Write-Host "=== Vibe Sorcery Dev Commands (Windows) ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "0) Conda env (recommended, once):" -ForegroundColor Yellow
Write-Host "   cd $Root"
Write-Host "   .\scripts\setup-conda.ps1"
Write-Host "   # creates: vibe-sorcery-py311  (same style as dog-yolo-py311)"
Write-Host "   conda activate vibe-sorcery-py311"
Write-Host ""
Write-Host "1) Or venv (once):" -ForegroundColor Yellow
Write-Host "   cd $Root"
Write-Host "   python -m venv .venv"
Write-Host "   .\.venv\Scripts\Activate.ps1"
Write-Host "   pip install -r backend\requirements.txt"
Write-Host ""
Write-Host "2) Terminal A - API:" -ForegroundColor Yellow
Write-Host @"
   cd $Root
   .\.venv\Scripts\Activate.ps1
   `$env:PYTHONPATH = "`$PWD;`$PWD\backend"
   `$env:DATABASE_URL = "postgresql://vibe:vibe@localhost:5433/vibe_sorcery"
   `$env:CELERY_BROKER_URL = "redis://localhost:6379/1"
   `$env:CELERY_RESULT_BACKEND = "redis://localhost:6379/2"
   `$env:S3_ENDPOINT = "http://localhost:9000"
   `$env:DEV_MOCK_GENERATION = "true"
   cd backend
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"@
Write-Host ""
Write-Host "3) Terminal B - Celery Worker:" -ForegroundColor Yellow
Write-Host @"
   cd $Root
   .\.venv\Scripts\Activate.ps1
   `$env:PYTHONPATH = "`$PWD;`$PWD\backend"
   `$env:DATABASE_URL = "postgresql://vibe:vibe@localhost:5433/vibe_sorcery"
   `$env:CELERY_BROKER_URL = "redis://localhost:6379/1"
   `$env:CELERY_RESULT_BACKEND = "redis://localhost:6379/2"
   `$env:S3_ENDPOINT = "http://localhost:9000"
   `$env:DEV_MOCK_GENERATION = "true"
   cd backend
   celery -A app.celery_app.celery_app worker --loglevel=info --pool=solo
"@
Write-Host ""
Write-Host "4) Terminal C - Web (Taro H5):" -ForegroundColor Yellow
Write-Host @"
   cd $Root
   npm install
   npm run dev:web
"@
Write-Host ""
Write-Host "5) Terminal D - WeChat mini-program (optional):" -ForegroundColor Yellow
Write-Host @"
   cd $Root
   npm run dev:mp
   # Import apps/client/dist in WeChat DevTools
"@
Write-Host ""
Write-Host "Web H5: http://localhost:10086  |  API: http://localhost:8000/docs" -ForegroundColor Green
