[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$rootDir = Split-Path -Parent $PSScriptRoot
if (-not $rootDir) { $rootDir = Get-Location }

$widgetFile = Join-Path $rootDir "voice_widget\floating_mic.ps1"
$compScript = Join-Path $rootDir "bin\antigravity_companion.js"

function Find-NodeExecutable {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $paths = @(
        "$env:LOCALAPPDATA\hermes\node\node.exe",
        "$env:LOCALAPPDATA\Programs\node\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    return "node.exe"
}

# 1. Проверяем и запускаем голосовой мост (Voice Bridge), если еще не запущен
$bridgeRunning = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:9228/voice/status" -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($res.ok) { $bridgeRunning = $true }
} catch {}

if (-not $bridgeRunning) {
    Write-Host "[1/2] Запуск фонового сервиса (CDP + Voice Bridge)..." -ForegroundColor Cyan
    $nodeExe = Find-NodeExecutable
    Start-Process -FilePath $nodeExe -ArgumentList "`"$compScript`"" -WorkingDirectory $rootDir -WindowStyle Hidden
    Start-Sleep -Milliseconds 800
} else {
    Write-Host "[1/2] Голосовой мост уже активен." -ForegroundColor Green
}

# 2. Проверяем и запускаем плавающий микрофон (Floating Mic Widget)
$widgetRunning = $false
try {
    $testMutex = [System.Threading.Mutex]::OpenExisting("AntigravityCompanion_FloatingMic_Mutex")
    if ($testMutex) {
        $widgetRunning = $true
        $testMutex.Dispose()
    }
} catch {
    $widgetRunning = $false
}

if ($widgetRunning) {
    Write-Host "[2/2] Плавающий микрофон уже запущен поверх окон!" -ForegroundColor Green
} else {
    Write-Host "[2/2] Запуск плавающего микрофона поверх окон..." -ForegroundColor Cyan
    Start-Process -FilePath "powershell.exe" -ArgumentList "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -Command `\"& { & '$widgetFile' }`\"" -WorkingDirectory $rootDir -WindowStyle Hidden
    Start-Sleep -Milliseconds 600
    Write-Host "[✓] Плавающий микрофон успешно появился на экране!" -ForegroundColor Green
    Write-Host "    - Горячая клавиша: Win + Shift + V (или клик по капсуле)" -ForegroundColor Gray
    Write-Host "    - Правый клик по микрофону: Настройки и режимы" -ForegroundColor Gray
}
