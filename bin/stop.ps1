[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*antigravity_companion.js*' }
if ($procs) {
    $procs | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "[+] Остановлен процесс Companion (PID: $($_.ProcessId))" -ForegroundColor Green
    }
} else {
    Write-Host "[i] Активных процессов Companion не обнаружено." -ForegroundColor Yellow
}
