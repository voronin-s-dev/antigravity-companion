@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\clean_restart.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [X] Произошла ошибка при выполнении clean_restart.ps1
    echo Нажмите любую клавишу для закрытия...
    pause >nul
)
