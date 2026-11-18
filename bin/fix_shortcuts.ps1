# Fix & Harden Antigravity shortcuts to guarantee --remote-debugging-port=0
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $baseDir) { $baseDir = Get-Location }
$rootDir = Split-Path -Parent $baseDir

$appData = [System.Environment]::GetFolderPath('ApplicationData')
$userProfile = [System.Environment]::GetFolderPath('UserProfile')
$desktop = [System.Environment]::GetFolderPath('Desktop')

$sh = New-Object -ComObject WScript.Shell

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
            if ($sc.TargetPath -like "*Antigravity.exe*") {
                if ($sc.Arguments -notlike "*--remote-debugging-port*") {
                    $newArgs = if ($sc.Arguments) { "$($sc.Arguments) --remote-debugging-port=0".Trim() } else { "--remote-debugging-port=0" }
                    $sc.Arguments = $newArgs
                    $sc.Save()
                    Write-Host "[+] Ярлык обновлен с флагом отладки: $path" -ForegroundColor Green
                }
            }
        } catch {}
    }
}

# Ensure Desktop launcher 'Antigravity (с Компаньоном).lnk' exists and is valid
$companionLnk = Join-Path $desktop "Antigravity (с Компаньоном).lnk"
$launchBat = Join-Path $rootDir "launch_antigravity.bat"

if (Test-Path $launchBat) {
    try {
        $needCreate = $true
        if (Test-Path $companionLnk) {
            $existing = $sh.CreateShortcut($companionLnk)
            if ($existing.TargetPath -eq $launchBat) {
                $needCreate = $false
            }
        }
        if ($needCreate) {
            $sc = $sh.CreateShortcut($companionLnk)
            $sc.TargetPath = $launchBat
            $sc.WorkingDirectory = $rootDir
            $sc.Description = "Запуск Google Antigravity вместе со службой Companion"
            if (Test-Path $agyExe) {
                $sc.IconLocation = "$agyExe,0"
            }
            $sc.Save()
            Write-Host "[+] Создан надежный рабочий ярлык: $companionLnk" -ForegroundColor Green
        }
    } catch {}
}
