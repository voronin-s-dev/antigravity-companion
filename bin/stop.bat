@echo off
chcp 65001 >nul
echo [Antigravity Companion] Остановка службы...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
echo.
pause
