@echo off
setlocal
cd /d "%~dp0\.."

echo [Antigravity Voice] Zapusk golosovogo mosta i vidzheta...
start "" powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -Command "$rootDir = (Get-Location).Path; $bridge = Join-Path $rootDir 'voice_widget\voice_bridge.js'; $widget = Join-Path $rootDir 'voice_widget\floating_mic.ps1'; try { $res = Invoke-RestMethod 'http://127.0.0.1:9228/voice/status' -TimeoutSec 1 } catch {}; if (-not $res.ok) { Start-Process 'node' -ArgumentList @($bridge) -WorkingDirectory $rootDir -WindowStyle Hidden; Start-Sleep -Milliseconds 600 }; Start-Process 'powershell' -ArgumentList @('-ExecutionPolicy', 'Bypass', '-NoProfile', '-WindowStyle', 'Hidden', '-File', $widget) -WorkingDirectory $rootDir -WindowStyle Hidden"

echo [Antigravity Voice] Gotovo! Goryachaya klavisha: Win + Shift + V (ili Ctrl + Alt + V)
exit /b 0
