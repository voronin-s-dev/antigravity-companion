@echo off
setlocal
cd /d "%~dp0"
title Antigravity Companion - App Updater

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
endlocal
