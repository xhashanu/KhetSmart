Set-Location "$PSScriptRoot\..\backend"

$port = 8000
$listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

if ($listener) {
    $procId = $listener.OwningProcess | Select-Object -First 1
    Write-Host "Port $port is already in use (PID $procId). Stopping old process..."
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
}

Write-Host "Starting KhetSmart API on http://127.0.0.1:$port"
& .\.venv\Scripts\uvicorn.exe main:app --reload --host 127.0.0.1 --port $port
