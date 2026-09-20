@echo off
setlocal
cd /d "%~dp0"
title Antigravity Companion Uninstaller

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1"
endlocal
