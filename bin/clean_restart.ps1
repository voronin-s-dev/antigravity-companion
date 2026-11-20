[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "[*] Полное завершение всех фоновых процессов Antigravity..." -ForegroundColor Cyan

# 1. Завершить все процессы Antigravity и дождаться полного освобождения ресурсов
$procs = Get-Process Antigravity, Antigravity_orig -ErrorAction SilentlyContinue
if ($procs) {
    $procs | Stop-Process -Force -ErrorAction SilentlyContinue
    $timeout = 10
    $elapsed = 0
    while ((Get-Process Antigravity, Antigravity_orig -ErrorAction SilentlyContinue) -and ($elapsed -lt $timeout)) {
        Start-Sleep -Milliseconds 300
        $elapsed += 0.3
    }
}
Write-Host "[+] Все процессы Antigravity успешно завершены." -ForegroundColor Green

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }

# 2. Установка / обновление нативного лаунчер-шима (пока Antigravity закрыт)
try {
    $nodeExe = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $nodeExe) {
        $commonNodes = @(
            "$env:LOCALAPPDATA\hermes\node\node.exe",
            "$env:LOCALAPPDATA\Programs\node\node.exe",
            "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
            "$env:ProgramFiles\nodejs\node.exe",
            "${env:ProgramFiles(x86)}\nodejs\node.exe"
        )
        foreach ($np in $commonNodes) { if (Test-Path $np) { $nodeExe = $np; break } }
    }
    if ($nodeExe) {
        $shimScript = Join-Path $baseDir "shim_manager.js"
        if (Test-Path $shimScript) {
            Write-Host "[*] Установка нативного лаунчера для авто-отладки..." -ForegroundColor Cyan
            & $nodeExe $shimScript install | Out-Null
            Write-Host "[+] Нативный лаунчер проверен и установлен." -ForegroundColor Green
        }
    }
} catch {
    Write-Host "[!] Предупреждение установки шима: $_" -ForegroundColor Yellow
}

# 3. Обновление ярлыков с флагом отладки (включая меню Пуск и Рабочий стол)
try {
    $fixShortcutsScript = Join-Path $baseDir "fix_shortcuts.ps1"
    if (Test-Path $fixShortcutsScript) {
        & $fixShortcutsScript | Out-Null
        Write-Host "[+] Ярлыки Windows обновлены с флагом отладки." -ForegroundColor Green
    }
} catch {}

# 4. Убедиться, что фоновая служба Компаньона активна
& (Join-Path $baseDir "start_silent.ps1")

# 5. Запустить Antigravity с флагом отладки --remote-debugging-port=0
$agyExe = "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe"
if (-not (Test-Path $agyExe)) {
    $common = @(
        "$env:ProgramFiles\Antigravity\Antigravity.exe",
        "${env:ProgramFiles(x86)}\Antigravity\Antigravity.exe",
        "$env:LOCALAPPDATA\antigravity\Antigravity.exe"
    )
    foreach ($p in $common) {
        if (Test-Path $p) { $agyExe = $p; break }
    }
}

if ($agyExe) {
    Write-Host "[+] Чистый запуск Antigravity с портом отладки для Компаньона..." -ForegroundColor Green
    $agyDir = Split-Path -Parent $agyExe
    Start-Process -FilePath $agyExe -ArgumentList "--remote-debugging-port=0" -WorkingDirectory $agyDir
} else {
    Write-Host "[X] Ошибка: Antigravity.exe не найден." -ForegroundColor Red
}
