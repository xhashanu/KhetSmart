Set-Location "$PSScriptRoot\..\backend"
Write-Host "Importing cold_storages_registry.csv into database..."
& .\.venv\Scripts\python.exe -m ingest.import_registry --replace
Write-Host "Done. Check: curl http://127.0.0.1:8000/api/health"
