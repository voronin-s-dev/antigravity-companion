[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "Удаление Antigravity Companion"

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "                УДАЛЕНИЕ ANTIGRAVITY COMPANION                       " -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Остановка процессов
Write-Host "[*] Остановка фоновой службы..." -ForegroundColor Cyan
$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { 
    ($_.Name -like "*node*") -and (
        $_.CommandLine -like '*antigravity_companion*' -or 
        $_.CommandLine -like '*limits_daemon*'
    )
}
if ($procs) {
    $procs | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "[+] Остановлен процесс PID: $($_.ProcessId)" -ForegroundColor Green
    }
} else {
    Write-Host "[-] Активных процессов службы не обнаружено." -ForegroundColor Gray
}

# 2. Удаление из автозапуска
$startupFolder = [System.Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupFolder "AntigravityCompanion.lnk"

if (Test-Path $shortcutPath) {
    Remove-Item -Path $shortcutPath -Force -ErrorAction SilentlyContinue
    Write-Host "[+] Автозапуск Windows успешно удален." -ForegroundColor Green
} else {
    Write-Host "[-] Ярлык автозапуска не был найден." -ForegroundColor Gray
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "                 УДАЛЕНИЕ УСПЕШНО ЗАВЕРШЕНО                          " -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Green
Write-Host "Служба остановлена и больше не будет запускаться при старте Windows." -ForegroundColor White
Write-Host "Вы можете просто переместить эту папку в Корзину при необходимости." -ForegroundColor Gray
Write-Host ""
Read-Host "Нажмите Enter для завершения..."
