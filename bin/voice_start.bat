@echo off
setlocal
cd /d "%~dp0\.."

echo [Antigravity Voice] Zapusk golosovogo mosta i vidzheta...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0\voice_start.ps1"
exit /b 0
