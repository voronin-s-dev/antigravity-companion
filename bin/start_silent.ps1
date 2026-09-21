[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }
$companionPath = Join-Path $baseDir "antigravity_companion.js"

# 1. Проверяем, не запущена ли уже служба
$running = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*antigravity_companion.js*' }
if ($running) {
    $pids = ($running | ForEach-Object { $_.ProcessId }) -join ', '
    Write-Host "[i] Antigravity Companion уже работает в фоне (PID: $pids)." -ForegroundColor Yellow
    exit 0
}

# 2. Находим исполняемый файл node.exe
function Find-NodeExecutable {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $commonPaths = @(
        "$env:LOCALAPPDATA\hermes\node\node.exe",
        "$env:LOCALAPPDATA\Programs\node\node.exe",
        "$env:LOCALAPPDATA\Programs\nodejs\node.exe",
        "$env:ProgramFiles\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "$env:APPDATA\npm\node.exe"
    )

    foreach ($p in $commonPaths) {
        if (Test-Path $p) {
            $folder = Split-Path -Parent $p
            $env:Path = "$folder;$env:Path"
            return $p
        }
    }
    return "node.exe"
}

$nodePath = Find-NodeExecutable

# 3. Запуск в фоновом режиме через WMI (полная изоляция от консоли)
try {
    try {
        Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "`"$nodePath`" `"antigravity_companion.js`""; CurrentDirectory = $baseDir } | Out-Null
    } catch {
        Start-Process -FilePath $nodePath -ArgumentList "antigravity_companion.js" -WorkingDirectory $baseDir -WindowStyle Hidden
    }
    Start-Sleep -Milliseconds 500

    $rootDir = Split-Path -Parent $baseDir
    $islandExe = Join-Path $rootDir "voice_widget\voice_island.exe"
    if (Test-Path $islandExe) {
        $islandRunning = $false
        try {
            $m = [System.Threading.Mutex]::OpenExisting("AntigravityCompanion_VoiceIsland_Mutex")
            if ($m) { $islandRunning = $true; $m.Dispose() }
        } catch {}

        if (-not $islandRunning) {
            try {
                Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "`"$islandExe`""; CurrentDirectory = $rootDir } | Out-Null
            } catch {
                Start-Process -FilePath $islandExe -WorkingDirectory $rootDir
            }
        }
    }

    Write-Host "[+] Фоновая служба Antigravity Companion успешно запущена!" -ForegroundColor Green
} catch {
    Write-Host "[X] Ошибка запуска службы: $_" -ForegroundColor Red
    exit 1
}
