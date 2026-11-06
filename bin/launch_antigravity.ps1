[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }

# 1. Запуск фоновой службы Компаньона
& (Join-Path $baseDir "start_silent.ps1")

# 2. Поиск исполняемого файла Antigravity
$agyExe = $null
$possiblePaths = @(
    "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe",
    "$env:ProgramFiles\Antigravity\Antigravity.exe",
    "${env:ProgramFiles(x86)}\Antigravity\Antigravity.exe",
    "$env:LOCALAPPDATA\antigravity\Antigravity.exe"
)

foreach ($p in $possiblePaths) {
    if (Test-Path $p) {
        $agyExe = $p
        break
    }
}

# 3. Запуск самого Antigravity (если процесс еще не запущен)
if ($agyExe) {
    $existing = Get-Process Antigravity -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $existing) {
        Start-Process -FilePath $agyExe
    }
}
