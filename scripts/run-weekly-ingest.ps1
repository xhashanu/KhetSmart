Set-Location "$PSScriptRoot\..\backend"
& .\.venv\Scripts\python.exe -m ingest.run_weekly
