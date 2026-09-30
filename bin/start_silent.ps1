$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }
$companionPath = Join-Path $baseDir "antigravity_companion.js"

# 1. Clean up any obsolete/rogue processes (e.g., old limits_daemon or processes from other folders)
$allRelated = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { 
    ($_.Name -like "*node*") -and (
        $_.CommandLine -like "*antigravity_companion*" -or 
        $_.CommandLine -like "*limits_daemon*"
    )
}

if ($allRelated) {
    # If any process is running the old limits_daemon or is outside our current baseDir, terminate it immediately
    $legacy = $allRelated | Where-Object { 
        $_.CommandLine -like "*limits_daemon*" -or 
        ($_.CommandLine -notlike "*$companionPath*")
    }
    if ($legacy) {
        $legacy | ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host "[!] Завершен устаревший процесс Companion (PID: $($_.ProcessId))." -ForegroundColor Yellow
        }
    }

    # Now re-check if current version is already running
    $currentRunning = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { 
        ($_.Name -like "*node*") -and ($_.CommandLine -like "*$companionPath*")
    }
    if ($currentRunning) {
        $pids = ($currentRunning | ForEach-Object { $_.ProcessId }) -join ', '
        Write-Host "[i] Antigravity Companion is already running in background (PID: $pids)." -ForegroundColor Yellow
        exit 0
    }
}

# 2. Locate node.exe
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

# 3. Launch via WMI with explicit hidden window (ShowWindow = 0, no console/terminal popup)
try {
    $startup = [wmiclass]"Win32_ProcessStartup"
    $startupInfo = $startup.CreateInstance()
    $startupInfo.ShowWindow = 0

    $proc = [wmiclass]"Win32_Process"
    $res = $proc.Create("`"$nodePath`" `"antigravity_companion.js`"", $baseDir, $startupInfo)
    if ($res.ReturnValue -eq 0) {
        Start-Sleep -Milliseconds 500
        Write-Host "[+] Antigravity Companion background service started successfully (PID: $($res.ProcessId))!" -ForegroundColor Green
    } else {
        throw "WMI process creation failed with code $($res.ReturnValue)"
    }
} catch {
    Write-Host "[X] Service launch error: $_" -ForegroundColor Red
    exit 1
}
