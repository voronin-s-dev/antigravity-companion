@echo off
setlocal
cd /d "%~dp0"
title Antigravity Companion Dictionary Updater

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update_dictionary.ps1"
endlocal
