@echo off
chcp 65001 >nul
echo [Antigravity Companion] Остановка службы...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*antigravity_companion.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host ('Остановлен процесс PID: ' + $_.ProcessId) }"
echo Служба остановлена.
pause
