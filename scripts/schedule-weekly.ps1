$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\run-weekly-ingest.ps1`""

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 5:00AM

Register-ScheduledTask -TaskName "KhetSmart-WeeklyNDVI" -Action $action -Trigger $trigger -Force
Write-Host "Scheduled KhetSmart-WeeklyNDVI Sundays 5:00 AM."
