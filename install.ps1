# Antigravity Companion Installer
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }

$logPath = Join-Path $baseDir "install.log"
try {
    Start-Transcript -Path $logPath -Force | Out-Null
} catch {}

try {
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host "      УСТАНОВКА ANTIGRAVITY COMPANION (РУСИФИКАТОР + ВИДЖЕТ)         " -ForegroundColor Cyan
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host ""

    # 1. Проверка Node.js
    Write-Host "[1/4] Проверка среды выполнения Node.js..." -ForegroundColor Cyan

    function Find-NodeExecutable {
        $cmd = Get-Command node -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }

        $commonPaths = @(
            "$env:ProgramFiles\nodejs\node.exe",
            "${env:ProgramFiles(x86)}\nodejs\node.exe",
            "$env:LOCALAPPDATA\Programs\node\node.exe",
            "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
            "$env:LOCALAPPDATA\hermes\node\node.exe",
            "$env:APPDATA\npm\node.exe"
        )

        foreach ($p in $commonPaths) {
            if (Test-Path $p) {
                $folder = Split-Path -Parent $p
                $env:Path = "$folder;$env:Path"
                return $p
            }
        }
        return $null
    }

    $nodePath = Find-NodeExecutable

    if (-not $nodePath) {
        Write-Host "[!] Node.js не найден в системе." -ForegroundColor Yellow
        Write-Host "    Для работы службы необходим Node.js (версии 18 или новее)." -ForegroundColor Gray
        Write-Host ""

        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            Write-Host "[*] Попытка автоматической установки Node.js через winget..." -ForegroundColor Cyan
            try {
                $p = Start-Process winget -ArgumentList "install OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements" -Wait -PassThru -NoNewWindow
                if ($p.ExitCode -eq 0) {
                    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
                    $nodePath = Find-NodeExecutable
                }
            } catch {
                Write-Host "    Не удалось выполнить установку через winget: $_" -ForegroundColor Yellow
            }
        }

        if (-not $nodePath) {
            Write-Host ""
            Write-Host "---------------------------------------------------------------------" -ForegroundColor Red
            Write-Host "ТРЕБУЕТСЯ УСТАНОВКА NODE.JS" -ForegroundColor Red
            Write-Host "1. Скачайте Node.js (рекомендуется версия LTS) с сайта: https://nodejs.org/" -ForegroundColor White
            Write-Host "2. Установите его со стандартными параметрами." -ForegroundColor White
            Write-Host "3. Запустите install.bat еще раз." -ForegroundColor White
            Write-Host "---------------------------------------------------------------------" -ForegroundColor Red
            Write-Host ""
            $openBrowser = Read-Host "Открыть сайт nodejs.org в браузере прямо сейчас? (Y/N, по умолчанию Y)"
            if ($openBrowser -ne 'n' -and $openBrowser -ne 'N') {
                Start-Process "https://nodejs.org/"
            }
            exit 1
        }
    }

    $nodeVer = & node -v
    Write-Host "[+] Node.js готов к работе: $nodeVer" -ForegroundColor Green

    # 2. Остановка старых копий
    Write-Host ""
    Write-Host "[2/4] Проверка запущенных копий службы..." -ForegroundColor Cyan
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
                Write-Host "    - Остановлен предыдущий процесс PID: $($_.ProcessId)" -ForegroundColor Gray
            }
        } else {
            Write-Host "    - Предыдущих процессов не обнаружено." -ForegroundColor Gray
        }
    } catch {
        Write-Host "    - Пропуск завершения процессов." -ForegroundColor Gray
    }

    # 3. Настройка мгновенного автозапуска в реестре Windows (без задержек Startup Delay)
    Write-Host ""
    Write-Host "[3/4] Настройка мгновенного фонового автозапуска в Windows (HKCU Run)..." -ForegroundColor Cyan
    $startPs1 = Join-Path $baseDir "bin\start_silent.ps1"
    $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $regName = "AntigravityCompanion"
    $cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startPs1`""

    try {
        Set-ItemProperty -Path $regPath -Name $regName -Value $cmd -Force
        # Удаление устаревшего ярлыка из папки Startup, если он существовал
        $startupFolder = [System.Environment]::GetFolderPath('Startup')
        $oldShortcut = Join-Path $startupFolder "AntigravityCompanion.lnk"
        if (Test-Path $oldShortcut) { Remove-Item -Path $oldShortcut -Force -ErrorAction SilentlyContinue }

        Write-Host "[+] Автозапуск успешно зарегистрирован в реестре Windows (HKCU\Run)!" -ForegroundColor Green
        Write-Host "    Служба будет моментально стартовать при входе в систему без задержек Windows Startup Delay." -ForegroundColor Gray
    } catch {
        Write-Host "[!] Предупреждение: Не удалось настроить запись в реестре: $_" -ForegroundColor Yellow
    }

    # 4. Немедленный запуск службы
    Write-Host ""
    Write-Host "[4/4] Запуск службы Antigravity Companion..." -ForegroundColor Cyan
    try {
        & "$startPs1"
    } catch {
        Write-Host "[X] Ошибка запуска службы: $_" -ForegroundColor Red
    }

    # Проверка Antigravity
    $agy = Get-Process -Name Antigravity -ErrorAction SilentlyContinue
    Write-Host ""
    if ($agy) {
        Write-Host "[+] Antigravity сейчас открыт — русский перевод и виджет активируются в течение нескольких секунд!" -ForegroundColor Green
    } else {
        Write-Host "[i] Antigravity сейчас закрыт. Перевод и виджет появятся сразу, как только вы его откроете." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host "                  УСТАНОВКА УСПЕШНО ЗАВЕРШЕНА!                       " -ForegroundColor Green
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Полезные команды:" -ForegroundColor White
    Write-Host "  - Проверить статус службы: bin\status.bat" -ForegroundColor Gray
    Write-Host "  - Обновить перевод / собрать новые строки: update_dictionary.bat" -ForegroundColor Gray
    Write-Host "  - Удалить из автозагрузки: uninstall.bat" -ForegroundColor Gray
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host ""
    Read-Host "Нажмите Enter для завершения..."
} finally {
    try {
        Stop-Transcript | Out-Null
    } catch {}
}
