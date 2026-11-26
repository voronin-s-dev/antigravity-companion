# Fix & Harden Antigravity shortcuts to guarantee --remote-debugging-port=0
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }

$appData = [System.Environment]::GetFolderPath('ApplicationData')
$userProfile = [System.Environment]::GetFolderPath('UserProfile')
$desktop = [System.Environment]::GetFolderPath('Desktop')

$sh = New-Object -ComObject WScript.Shell

# 1. Clean up legacy / unwanted custom companion shortcuts on Desktop
$customLnk = Join-Path $desktop "Antigravity (с Компаньоном).lnk"
if (Test-Path $customLnk) {
    try {
        Remove-Item $customLnk -Force -ErrorAction SilentlyContinue
    } catch {}
}

# 2. Ensure native Antigravity shortcuts in Start Menu and Desktop pass --remote-debugging-port=0
$shortcutPaths = @(
    (Join-Path $appData "Microsoft\Windows\Start Menu\Programs\Antigravity.lnk"),
    (Join-Path $desktop "Antigravity.lnk"),
    (Join-Path $userProfile "Documents\AI\Antigravity.lnk")
)

$agyExe = "$env:LOCALAPPDATA\Programs\antigravity\Antigravity.exe"
if (-not (Test-Path $agyExe)) {
    $common = @(
        "$env:ProgramFiles\Antigravity\Antigravity.exe",
        "${env:ProgramFiles(x86)}\Antigravity\Antigravity.exe",
        "$env:LOCALAPPDATA\antigravity\Antigravity.exe"
    )
    foreach ($p in $common) {
        if (Test-Path $p) { $agyExe = $p; break }
    }
}

foreach ($path in $shortcutPaths) {
    if (Test-Path $path) {
        try {
            $sc = $sh.CreateShortcut($path)
            if ($sc.TargetPath -like "*Antigravity.exe*" -or $sc.TargetPath -like "*Antigravity_orig.exe*") {
                $changed = $false
                if ($sc.TargetPath -like "*Antigravity_orig.exe*" -and (Test-Path $agyExe)) {
                    $sc.TargetPath = $agyExe
                    $changed = $true
                }
                if ($sc.Arguments -notlike "*--remote-debugging-port*") {
                    $newArgs = if ($sc.Arguments) { "$($sc.Arguments) --remote-debugging-port=0".Trim() } else { "--remote-debugging-port=0" }
                    $sc.Arguments = $newArgs
                    $changed = $true
                }
                if ($changed) {
                    $sc.Save()
                    Write-Host "[+] Ярлык обновлен с флагом отладки: $path" -ForegroundColor Green
                }
            }
        } catch {}
    }
}
