@echo off
setlocal
cd /d "%~dp0"
title Antigravity Companion Installer

echo =====================================================================
echo       Starting Antigravity Companion Installer...
echo =====================================================================
echo Logging output to: install.log
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set EXITCODE=%errorlevel%

if %EXITCODE% neq 0 (
    echo.
    echo =====================================================================
    echo [ERROR] Installation did not finish cleanly. Exit code: %EXITCODE%
    echo Please check install.log for details.
    echo =====================================================================
    echo.
    pause
)

endlocal
