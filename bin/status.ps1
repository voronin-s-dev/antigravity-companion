[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "          СТАТУС ANTIGRAVITY COMPANION             " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

$agy = Get-Process -Name Antigravity -ErrorAction SilentlyContinue
if ($agy) {
    Write-Host "[+] Antigravity: ЗАПУЩЕН" -ForegroundColor Green
} else {
    Write-Host "[-] Antigravity: НЕ ЗАПУЩЕН" -ForegroundColor Yellow
}

$appData = [System.Environment]::GetFolderPath('ApplicationData')
$portFile = Join-Path $appData 'Antigravity\DevToolsActivePort'
if (Test-Path $portFile) {
    $port = (Get-Content $portFile)[0].Trim()
    Write-Host "[+] Порт отладки Antigravity (CDP): $port" -ForegroundColor Green
} else {
    Write-Host "[-] Файл порта отладки пока не найден" -ForegroundColor Yellow
}

$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*antigravity_companion.js*' }
if ($procs) {
    $pids = ($procs | ForEach-Object { $_.ProcessId }) -join ', '
    Write-Host "[+] Служба мониторинга: АКТИВНА (PID: $pids)" -ForegroundColor Green
} else {
    Write-Host "[-] Служба мониторинга: НЕ ЗАПУЩЕНА" -ForegroundColor Red
}

$startupLnk = Join-Path $appData 'Microsoft\Windows\Start Menu\Programs\Startup\AntigravityCompanion.lnk'
if (Test-Path $startupLnk) {
    Write-Host "[+] Автозапуск Windows: ВКЛЮЧЕН" -ForegroundColor Green
} else {
    Write-Host "[-] Автозапуск Windows: НЕ НАСТРОЕН" -ForegroundColor Gray
}
Write-Host "===================================================" -ForegroundColor Cyan
