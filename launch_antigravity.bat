@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ===================================================
echo        ЗАПУСК ANTIGRAVITY + COMPANION              
echo ===================================================

:: 1. Поиск Antigravity.exe
set "AGY_EXE="
if exist "%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe" set "AGY_EXE=%LOCALAPPDATA%\Programs\antigravity\Antigravity.exe"
if not defined AGY_EXE if exist "%ProgramFiles%\Antigravity\Antigravity.exe" set "AGY_EXE=%ProgramFiles%\Antigravity\Antigravity.exe"
if not defined AGY_EXE if exist "%LOCALAPPDATA%\antigravity\Antigravity.exe" set "AGY_EXE=%LOCALAPPDATA%\antigravity\Antigravity.exe"

:: 2. Запуск службы Companion (если еще не активна)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bin\start_silent.ps1"

:: 3. Запуск самого Antigravity
if defined AGY_EXE (
    echo [+] Запуск Antigravity: %AGY_EXE%
    start "" "%AGY_EXE%" %*
) else (
    echo [!] Antigravity.exe не найден в стандартных путях.
    echo     Запустите Antigravity обычным способом — служба Companion подхватит его автоматически.
)

exit /b 0
