[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$rootDir = Split-Path -Parent $PSScriptRoot
if (-not $rootDir) { $rootDir = Get-Location }

$islandExe = Join-Path $rootDir "voice_widget\voice_island.exe"
$buildBat = Join-Path $rootDir "voice_widget\build_island.bat"
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
    try {
        Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "`"$nodeExe`" `"$compScript`""; CurrentDirectory = $rootDir } | Out-Null
    } catch {
        Start-Process -FilePath $nodeExe -ArgumentList "`"$compScript`"" -WorkingDirectory $rootDir -WindowStyle Hidden
    }
    Start-Sleep -Milliseconds 800
} else {
    Write-Host "[1/2] Голосовой мост уже активен (порт 9228)." -ForegroundColor Green
}

# 2. Проверяем наличие скомпилированного voice_island.exe
if (-not (Test-Path $islandExe)) {
    Write-Host "[*] Компиляция нативного Voice Island (WPF)..." -ForegroundColor Yellow
    & $buildBat
}

# 3. Проверяем запущенность Voice Island через Named Mutex
$islandRunning = $false
try {
    $testMutex = [System.Threading.Mutex]::OpenExisting("AntigravityCompanion_VoiceIsland_Mutex")
    if ($testMutex) {
        $islandRunning = $true
        $testMutex.Dispose()
    }
} catch {
    $islandRunning = $false
}

if ($islandRunning) {
    Write-Host "[2/2] Голосовой островок ChatGPT (Voice Island) уже запущен поверх окон!" -ForegroundColor Green
} else {
    Write-Host "[2/2] Запуск голосового островка поверх всех окон..." -ForegroundColor Cyan
    # Запуск полностью независимого процесса в интерактивной сессии
    try {
        Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "`"$islandExe`""; CurrentDirectory = $rootDir } | Out-Null
    } catch {
        Start-Process -FilePath $islandExe -WorkingDirectory $rootDir
    }
    Start-Sleep -Milliseconds 600
    Write-Host "[✓] Голосовой островок (Voice Island) успешно появился на экране!" -ForegroundColor Green
    Write-Host "    - Расположение: Вверху по центру экрана (можно свободно перетаскивать мышью)" -ForegroundColor Gray
    Write-Host "    - Горячая клавиша: Win + Shift + V (или клик по орбу слева)" -ForegroundColor Gray
    Write-Host "    - Завершение и вставка: Клик ✓ или клавиша Enter" -ForegroundColor Gray
    Write-Host "    - Отмена: Клик ✕ или клавиша Esc" -ForegroundColor Gray
    Write-Host "    - Настройки: Клик по шестерёнке ⚙" -ForegroundColor Gray
}
