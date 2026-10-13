# Antigravity Companion App Updater
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Обновление Antigravity Companion"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "          ОБНОВЛЕНИЕ ANTIGRAVITY COMPANION ДО СВЕЖЕЙ ВЕРСИИ          " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }

$lockFile = Join-Path $baseDir ".lock_updates"
if (Test-Path $lockFile) {
    Write-Host "[!] Обновления заблокированы (.lock_updates активен)." -ForegroundColor Yellow
    Write-Host "    Удалите файл .lock_updates или разморозьте через update_dictionary.bat." -ForegroundColor Gray
    Read-Host "Нажмите Enter для выхода..."
    exit 1
}

Write-Host "[1/3] Проверка и загрузка свежей версии с GitHub..." -ForegroundColor Cyan
$updaterScript = Join-Path $baseDir "bin\updater.js"

try {
    & node "$updaterScript" --app
} catch {
    Write-Host "[X] Ошибка при обновлении: $_" -ForegroundColor Red
    Read-Host "Нажмите Enter для выхода..."
    exit 1
}

Write-Host ""
Write-Host "[2/3] Перезапуск фоновой службы Companion..." -ForegroundColor Cyan
try {
    $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { 
        ($_.Name -like "*node*") -and (
            $_.CommandLine -like '*antigravity_companion*' -or 
            $_.CommandLine -like '*limits_daemon*'
        )
    }
    if ($procs) {
        $procs | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }

    $startVbs = Join-Path $baseDir "bin\start_silent.vbs"
    $wscriptExe = "$env:SystemRoot\System32\wscript.exe"
    Start-Process -FilePath $wscriptExe -ArgumentList "`"$startVbs`"" -WorkingDirectory (Join-Path $baseDir "bin")
    Write-Host "[+] Фоновая служба успешно перезапущена!" -ForegroundColor Green
} catch {
    Write-Host "[!] Предупреждение при перезапуске службы: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[3/3] Горячая перезагрузка интерфейса в Antigravity..." -ForegroundColor Cyan
try {
    $reloadScript = Join-Path $baseDir "localization\inject_translator.js"
    $widgetScript = Join-Path $baseDir "limits_widget\inject_panel.js"
    & node "$reloadScript"
    & node "$widgetScript"
    Write-Host "[+] Виджет и перевод успешно обновлены в активном окне!" -ForegroundColor Green
} catch {
    Write-Host "[i] Окно Antigravity не открыто. Обновления применятся при следующем запуске." -ForegroundColor Gray
}

# Читаем актуальную версию из package.json
$pkgPath = Join-Path $baseDir "package.json"
$ver = "актуальная"
try {
    $pkgJson = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $ver = "v" + $pkgJson.version
} catch {}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "           ОБНОВЛЕНИЕ УСПЕШНО ЗАВЕРШЕНО: $ver                        " -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host ""
Read-Host "Нажмите Enter для завершения..."
