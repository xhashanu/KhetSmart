# Official cold-storage registry: fetch data.gov.in -> convert -> import DB
Set-Location "$PSScriptRoot\..\backend"
& .\.venv\Scripts\python.exe -m ingest.sync_registry_ogd @args
