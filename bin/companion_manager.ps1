[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Antigravity Companion — Центр управления"

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $baseDir

function Get-CompanionStatus {
    $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { 
        ($_.Name -like "*node*") -and (
            $_.CommandLine -like '*antigravity_companion*' -or 
            $_.CommandLine -like '*limits_daemon*'
        )
    }
    return $procs
}

function Get-AntigravityStatus {
    $proc = Get-Process Antigravity -ErrorAction SilentlyContinue | Select-Object -First 1
    $appData = [System.Environment]::GetFolderPath('ApplicationData')
    $portFile = Join-Path $appData 'Antigravity\DevToolsActivePort'
    $port = $null
    if (Test-Path $portFile) {
        try { $port = (Get-Content $portFile)[0].Trim() } catch {}
    }
    return [PSCustomObject]@{
        Process = $proc
        Port = $port
    }
}

function Get-StartupStatus {
    $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $reg = Get-ItemProperty -Path $regPath -Name "AntigravityCompanion" -ErrorAction SilentlyContinue
    if ($reg) { return $true }
    $appData = [System.Environment]::GetFolderPath('ApplicationData')
    $lnk = Join-Path $appData 'Microsoft\Windows\Start Menu\Programs\Startup\AntigravityCompanion.lnk'
    return (Test-Path $lnk)
}

function Toggle-Startup {
    $regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    $regName = "AntigravityCompanion"
    $appData = [System.Environment]::GetFolderPath('ApplicationData')
    $startupFolder = Join-Path $appData 'Microsoft\Windows\Start Menu\Programs\Startup'
    $lnk = Join-Path $startupFolder 'AntigravityCompanion.lnk'
    
    $isConfigured = Get-StartupStatus
    if ($isConfigured) {
        Remove-ItemProperty -Path $regPath -Name $regName -Force -ErrorAction SilentlyContinue
        if (Test-Path $lnk) { Remove-Item $lnk -Force -ErrorAction SilentlyContinue }
        Write-Host "[+] Автозапуск Windows: ОТКЛЮЧЕН" -ForegroundColor Yellow
    } else {
        $startPs1 = Join-Path $baseDir "start_silent.ps1"
        try {
            $cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startPs1`""
            Set-ItemProperty -Path $regPath -Name $regName -Value $cmd -Force
            if (Test-Path $lnk) { Remove-Item $lnk -Force -ErrorAction SilentlyContinue }
            Write-Host "[+] Автозапуск Windows (HKCU Run): ВКЛЮЧЕН (Мгновенный старт без задержек)" -ForegroundColor Green
        } catch {
            Write-Host "[X] Ошибка настройки автозапуска в реестре: $_" -ForegroundColor Red
        }
    }
}

function Show-Header {
    Clear-Host
    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host "            ANTIGRAVITY COMPANION — ЦЕНТР УПРАВЛЕНИЯ                 " -ForegroundColor Cyan
    Write-Host "=====================================================================" -ForegroundColor Cyan

    # Status summary
    $agy = Get-AntigravityStatus
    $comp = Get-CompanionStatus
    $isStartup = Get-StartupStatus

    # Version & Terms
    $termsCount = 0
    $dictFile = Join-Path $rootDir "localization\dictionary_ru.json"
    if (Test-Path $dictFile) {
        try {
            $dict = Get-Content $dictFile -Raw -Encoding UTF8 | ConvertFrom-Json
            $termsCount = ($dict.exact | Get-Member -MemberType NoteProperty).Count
        } catch {}
    }

    Write-Host -NoNewline "  • Служба Компаньона: "
    if ($comp) {
        $pids = ($comp | ForEach-Object { $_.ProcessId }) -join ', '
        Write-Host "[● АКТИВНА (PID: $pids)]" -ForegroundColor Green
    } else {
        Write-Host "[○ ОСТАНОВЛЕНА]" -ForegroundColor Red
    }

    Write-Host -NoNewline "  • Antigravity:       "
    if ($agy.Process) {
        $portStr = if ($agy.Port) { " (порт $agy.Port)" } else { "" }
        Write-Host "[● ЗАПУЩЕН$portStr]" -ForegroundColor Green
    } else {
        Write-Host "[○ НЕ ЗАПУЩЕН]" -ForegroundColor Yellow
    }

    Write-Host -NoNewline "  • Словарь перевода:  "
    Write-Host "[$termsCount терминов, v1.1.0]" -ForegroundColor Gray

    Write-Host -NoNewline "  • Автозапуск Windows: "
    if ($isStartup) {
        Write-Host "[ВКЛЮЧЕН]" -ForegroundColor Green
    } else {
        Write-Host "[ОТКЛЮЧЕН]" -ForegroundColor DarkGray
    }

    Write-Host "=====================================================================" -ForegroundColor Cyan
    Write-Host ""
}

# Main Interactive Loop
while ($true) {
    Show-Header

    Write-Host "  [1] Запустить Antigravity + Компаньон" -ForegroundColor White
    Write-Host "  [2] Перезапустить службу Компаньона" -ForegroundColor White
    Write-Host "  [3] Остановить службу Компаньона" -ForegroundColor White
    Write-Host "  [4] Горячая перезагрузка UI (Hot-Reload)" -ForegroundColor White
    Write-Host "  [5] Проверить и применить обновления (GitHub)" -ForegroundColor White
    Write-Host "  [6] Переключить автозагрузку Windows" -ForegroundColor White
    Write-Host "  [7] Экспресс-диагностика (Doctor CDP)" -ForegroundColor White
    Write-Host "  [0] Выход" -ForegroundColor Gray
    Write-Host ""

    $choice = Read-Host "Выберите действие (0-7)"

    switch ($choice) {
        "1" {
            Write-Host ""
            Write-Host "[*] Запуск Antigravity и службы Компаньона..." -ForegroundColor Cyan
            & "$rootDir\launch_antigravity.bat"
            Start-Sleep -Seconds 2
        }
        "2" {
            Write-Host ""
            Write-Host "[*] Перезапуск службы Компаньона..." -ForegroundColor Cyan
            & "$baseDir\stop.ps1"
            Start-Sleep -Milliseconds 600
            & "$baseDir\start_silent.ps1"
            Start-Sleep -Seconds 1
        }
        "3" {
            Write-Host ""
            & "$baseDir\stop.ps1"
            Start-Sleep -Seconds 1
        }
        "4" {
            Write-Host ""
            Write-Host "[*] Горячая перезагрузка перевода и виджета в окне Antigravity..." -ForegroundColor Cyan
            try {
                $res = Invoke-RestMethod -Uri "http://127.0.0.1:9229/api/reload" -Method Post -TimeoutSec 3 -ErrorAction Stop
                Write-Host "[+] $($res.message)" -ForegroundColor Green
            } catch {
                # Fallback to direct node injection
                node "$rootDir\localization\inject_translator.js"
                node "$rootDir\limits_widget\inject_panel.js"
                Write-Host "[+] Успешно обновлено через прямой инжектор!" -ForegroundColor Green
            }
            Start-Sleep -Seconds 2
        }
        "5" {
            Write-Host ""
            Write-Host "[*] Проверка обновлений с GitHub..." -ForegroundColor Cyan
            try {
                & git fetch origin
                $behind = (& git rev-list HEAD..origin/main --count).Trim()
                if ($behind -and [int]$behind -gt 0) {
                    Write-Host "[+] Найдено новых коммитов на GitHub: $behind" -ForegroundColor Green
                    $pull = Read-Host "Установить обновления прямо сейчас? (Y/N, по умолчанию Y)"
                    if ($pull -ne 'n' -and $pull -ne 'N') {
                        & git pull --ff-only origin main
                        Write-Host "[+] Код обновлен. Перезагрузка UI..." -ForegroundColor Green
                        node "$rootDir\localization\inject_translator.js"
                        node "$rootDir\limits_widget\inject_panel.js"
                        Write-Host "[+] Обновление успешно применено!" -ForegroundColor Green
                    }
                } else {
                    Write-Host "[i] У вас установлена самая последняя версия репозитория!" -ForegroundColor Green
                }
            } catch {
                Write-Host "[!] Проверка через Git не удалась, проверяем словарь..." -ForegroundColor Yellow
                & "$rootDir\update_dictionary.ps1"
            }
            Write-Host ""
            Read-Host "Нажмите Enter для продолжения..."
        }
        "6" {
            Write-Host ""
            Toggle-Startup
            Start-Sleep -Seconds 1
        }
        "7" {
            Write-Host ""
            node "$rootDir\bin\cdp_doctor.js"
            Write-Host ""
            Read-Host "Нажмите Enter для продолжения..."
        }
        "0" {
            exit 0
        }
        default {
            # Loop
        }
    }
}
