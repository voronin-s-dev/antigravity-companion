[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Центр обновлений Antigravity Companion"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "          ЦЕНТР ОБНОВЛЕНИЙ ANTIGRAVITY COMPANION                     " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }

$lockFile = Join-Path $baseDir ".lock_updates"
$isLocked = Test-Path $lockFile

if ($isLocked) {
    Write-Host "[СТАТУС] Обновления: ЗАМОРОЖЕНЫ (Полный оффлайн-режим)" -ForegroundColor Yellow
} else {
    Write-Host "[СТАТУС] Обновления: РАЗРЕШЕНЫ (По требованию)" -ForegroundColor Green
}
Write-Host ""

Write-Host "[1] Сканировать открытое окно Antigravity на новые английские фразы (Harvester)" -ForegroundColor White
Write-Host "[2] Перезагрузить перевод в работающем Antigravity на лету (Hot-Reload)" -ForegroundColor White
Write-Host "[3] Загрузить свежий словарь перевода из GitHub репозитория" -ForegroundColor White
if ($isLocked) {
    Write-Host "[4] Разморозить обновления (включить возможность загрузки)" -ForegroundColor Green
} else {
    Write-Host "[4] Заморозить обновления (заблокировать любые сетевые загрузки)" -ForegroundColor Yellow
}
Write-Host ""

$choice = Read-Host "Выберите действие (1-4, по умолчанию 1)"
if (-not $choice) { $choice = "1" }

if ($choice -eq "1") {
    Write-Host ""
    Write-Host "[*] Сканирование интерфейса Antigravity на новые фразы..." -ForegroundColor Cyan
    $script = Join-Path $baseDir "localization\strings_harvester.js"
    & node "$script"
    Write-Host ""
    Write-Host "[+] Сканирование завершено. Найденные новые фразы сохранены в localization\untranslated_queue.json" -ForegroundColor Green
}

if ($choice -eq "2") {
    Write-Host ""
    Write-Host "[*] Горячая перезагрузка перевода в окне Antigravity..." -ForegroundColor Cyan
    $script = Join-Path $baseDir "localization\inject_translator.js"
    & node "$script"
    Write-Host "[+] Перевод успешно обновлен без перезапуска приложения!" -ForegroundColor Green
}

if ($choice -eq "3") {
    if ($isLocked) {
        Write-Host ""
        Write-Host "[!] Обновления заблокированы пользователем (.lock_updates активен)." -ForegroundColor Yellow
        Write-Host "    Сначала выберите пункт [4], чтобы разморозить обновления." -ForegroundColor Gray
    } else {
        Write-Host ""
        Write-Host "[*] Загрузка актуального словаря с GitHub..." -ForegroundColor Cyan
        $defaultUrl = "https://raw.githubusercontent.com/voronin-s-dev/antigravity-companion/main/localization/dictionary_ru.json"
        $customUrl = Read-Host "Введите URL словаря (нажмите Enter для официального: $defaultUrl)"
        if (-not $customUrl) { $customUrl = $defaultUrl }

        $dictFile = Join-Path $baseDir "localization\dictionary_ru.json"
        $backupFile = Join-Path $baseDir "localization\dictionary_ru.json.bak"

        try {
            Write-Host "    Подключение к $customUrl..." -ForegroundColor Gray
            $webData = Invoke-RestMethod -Uri $customUrl -TimeoutSec 10 -ErrorAction Stop
            
            # Создаем бэкап текущего словаря
            if (Test-Path $dictFile) {
                Copy-Item -Path $dictFile -Destination $backupFile -Force
                Write-Host "    [+] Создана резервная копия словаря (dictionary_ru.json.bak)" -ForegroundColor Gray
            }

            # Сохраняем новый словарь
            $jsonText = $webData | ConvertTo-Json -Depth 10
            [System.IO.File]::WriteAllText($dictFile, $jsonText, [System.Text.Encoding]::UTF8)
            Write-Host "[+] Новый словарь успешно загружен и сохранен!" -ForegroundColor Green

            # Горячее обновление
            Write-Host "[*] Применение нового словаря в Antigravity..." -ForegroundColor Cyan
            $script = Join-Path $baseDir "localization\inject_translator.js"
            & node "$script"
            Write-Host "[+] Перевод в Antigravity обновлен на лету!" -ForegroundColor Green
        } catch {
            Write-Host "[X] Не удалось загрузить словарь: $_" -ForegroundColor Red
            Write-Host "    Текущий словарь остался без изменений." -ForegroundColor Gray
        }
    }
}

if ($choice -eq "4") {
    Write-Host ""
    if ($isLocked) {
        Remove-Item -Path $lockFile -Force -ErrorAction SilentlyContinue
        Write-Host "[+] Обновления РАЗМОРОЖЕНЫ. Теперь вы можете загружать обновления словаря." -ForegroundColor Green
    } else {
        New-Item -ItemType File -Path $lockFile -Force | Out-Null
        Write-Host "[+] Обновления ЗАМОРОЖЕНЫ. Создан файл .lock_updates." -ForegroundColor Yellow
        Write-Host "    Служба работает в 100% автономном режиме без сетевых запросов." -ForegroundColor Gray
    }
}

Write-Host ""
Read-Host "Нажмите Enter для завершения..."
