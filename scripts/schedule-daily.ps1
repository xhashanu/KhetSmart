$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-daily-ingest.ps1`""

$trigger = New-ScheduledTaskTrigger -Daily -At 6:00AM

Register-ScheduledTask -TaskName "KhetSmart-DailyMandi" -Action $action -Trigger $trigger -Force
Write-Host "Scheduled KhetSmart-DailyMandi at 6:00 AM daily."
