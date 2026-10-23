# ==============================================================================
# Antigravity Companion - Core Backup Engine
# ==============================================================================
[CmdletBinding()]
param(
    [string]$ProjectsRoot = "",
    [string]$ScratchRoot = "",
    [string]$BackupDestination = "",
    [int]$RetentionDays = 7,
    [int]$MinBackupsToKeep = 7,
    [switch]$NeverDeleteInactiveLastVersions = $true,
    [switch]$ForceArchive = $false,
    [double]$MinFreeSpaceGB = 1.0,
    [string]$GeminiConfigDir = ""
)

$ErrorActionPreference = "Continue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$dateStr = Get-Date -Format "yyyy-MM-dd"
$errors = [System.Collections.Generic.List[string]]::new()
$projectsProcessed = 0
$archivesCreated = 0
$archivesSkipped = 0
$totalSizeBytes = 0
$freeSpaceGB = 0.0

# 1. Resolve ProjectsRoot
if ([string]::IsNullOrWhiteSpace($ProjectsRoot)) {
    if (Test-Path "C:\Antigravity projects") {
        $ProjectsRoot = "C:\Antigravity projects"
    } else {
        $ProjectsRoot = Join-Path $env:USERPROFILE "Antigravity projects"
    }
}

# 2. Resolve ScratchRoot
if ([string]::IsNullOrWhiteSpace($ScratchRoot)) {
    if (Test-Path "C:\Antigravity Scratch") {
        $ScratchRoot = "C:\Antigravity Scratch"
    } else {
        $ScratchRoot = Join-Path $env:USERPROFILE "Antigravity Scratch"
    }
}

# 3. Resolve BackupDestination
if ([string]::IsNullOrWhiteSpace($BackupDestination)) {
    if (Test-Path "G:\") {
        $gDriveDir = Get-ChildItem -Path "G:\" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($gDriveDir) {
            $BackupDestination = Join-Path $gDriveDir.FullName "Backups\Projects"
        }
    }
    if ([string]::IsNullOrWhiteSpace($BackupDestination) -and $env:OneDrive -and (Test-Path $env:OneDrive)) {
        $BackupDestination = Join-Path $env:OneDrive "AntigravityBackups\Projects"
    }
    if ([string]::IsNullOrWhiteSpace($BackupDestination) -and $env:OneDriveConsumer -and (Test-Path $env:OneDriveConsumer)) {
        $BackupDestination = Join-Path $env:OneDriveConsumer "AntigravityBackups\Projects"
    }
    if ([string]::IsNullOrWhiteSpace($BackupDestination)) {
        $BackupDestination = Join-Path $env:USERPROFILE "Antigravity Backups\Projects"
    }
}

# 4. AppData, logs, status file, and GeminiConfigDir
if ([string]::IsNullOrWhiteSpace($GeminiConfigDir) -and (-not $PSBoundParameters.ContainsKey('GeminiConfigDir'))) {
    $GeminiConfigDir = Join-Path $env:USERPROFILE ".gemini\config\projects"
}

$appDataCompanion = Join-Path $env:APPDATA "AntigravityCompanion"
if (-not (Test-Path -LiteralPath $appDataCompanion)) {
    try {
        New-Item -ItemType Directory -Path $appDataCompanion -Force | Out-Null
    } catch {}
}

$localLog = Join-Path $appDataCompanion "backup.log"
$statusFile = Join-Path $appDataCompanion "backup_status.json"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$now] [$Level] $Message"
    Write-Host $line
    try { Add-Content -Path $localLog -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
}

function Save-Status {
    param([string]$StatusState)
    try {
        $statusObj = [PSCustomObject]@{
            lastRunTime       = (Get-Date -Format "o")
            status            = $StatusState
            projectsProcessed = $projectsProcessed
            archivesCreated   = $archivesCreated
            archivesSkipped   = $archivesSkipped
            totalSizeBytes    = $totalSizeBytes
            destination       = $BackupDestination
            freeSpaceGB       = $freeSpaceGB
            errors            = @($errors)
        }
        $json = $statusObj | ConvertTo-Json -Depth 5
        $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
        [System.IO.File]::WriteAllText($statusFile, $json, $utf8NoBom)
    } catch {
        Write-Log "Failed to write status file: $($_.Exception.Message)" "WARNING"
    }
}

function Get-DestinationFreeSpaceGB {
    param([string]$Path)
    try {
        $fullPath = [System.IO.Path]::GetFullPath($Path)
        $root = [System.IO.Path]::GetPathRoot($fullPath)
        $drive = [System.IO.DriveInfo]::new($root)
        return [math]::Round($drive.AvailableFreeSpace / 1GB, 2)
    } catch {
        return 0.0
    }
}

# 5. Concurrency Lock
$lockFile = Join-Path $env:TEMP "antigravity_companion_backup.lock"
if (Test-Path -LiteralPath $lockFile) {
    try {
        $lockItem = Get-Item -LiteralPath $lockFile -ErrorAction SilentlyContinue
        if ($lockItem -and ((Get-Date) - $lockItem.LastWriteTime).TotalMinutes -lt 30) {
            Write-Host "WARNING: Backup is already running (locked by $lockFile). Exiting." -ForegroundColor Yellow
            exit 0
        }
    } catch {}
}

try {
    Set-Content -LiteralPath $lockFile -Value ([System.Diagnostics.Process]::GetCurrentProcess().Id) -Force -ErrorAction SilentlyContinue
} catch {}

try {
    Write-Log "=========================================================="
    Write-Log "Starting Antigravity backup run"
    Write-Log "Projects Root : $ProjectsRoot"
    Write-Log "Scratch Root  : $ScratchRoot"
    Write-Log "Destination   : $BackupDestination"

    # Ensure destination exists
    if (-not (Test-Path -LiteralPath $BackupDestination)) {
        try {
            New-Item -ItemType Directory -Path $BackupDestination -Force | Out-Null
            Write-Log "Created backup destination directory: $BackupDestination"
        } catch {
            $errMsg = "Cannot access or create destination '$BackupDestination': $($_.Exception.Message)"
            Write-Log $errMsg "ERROR"
            $errors.Add($errMsg)
            Save-Status "error"
            exit 1
        }
    }

    # Free space check
    $freeSpaceGB = Get-DestinationFreeSpaceGB $BackupDestination
    if ($freeSpaceGB -lt $MinFreeSpaceGB) {
        $errMsg = "Insufficient disk space on destination ($freeSpaceGB GB free, required at least $MinFreeSpaceGB GB)."
        Write-Log $errMsg "ERROR"
        $errors.Add($errMsg)
        Save-Status "error"
        exit 1
    }

    # Tar exclusion arguments
    $excludeArgs = @(
        '--exclude=node_modules',
        '--exclude=.venv',
        '--exclude=venv',
        '--exclude=env',
        '--exclude=__pycache__',
        '--exclude=.next',
        '--exclude=.nuxt',
        '--exclude=dist',
        '--exclude=build',
        '--exclude=.turbo',
        '--exclude=.cache',
        '--exclude=*.tmp',
        '--exclude=*.log'
    )

    # Project discovery
    $targets = [System.Collections.Generic.Dictionary[string, string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $registeredPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

    # Subdirectories of ProjectsRoot
    if (Test-Path -LiteralPath $ProjectsRoot) {
        Get-ChildItem -LiteralPath $ProjectsRoot -Directory -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -notlike ".*" -and $_.Name -notlike "_*"
        } | ForEach-Object {
            $normPath = [System.IO.Path]::GetFullPath($_.FullName)
            if ($registeredPaths.Add($normPath)) {
                $targets[$_.Name] = $_.FullName
            }
        }
    }

    # Subdirectories of ScratchRoot
    if (Test-Path -LiteralPath $ScratchRoot) {
        Get-ChildItem -LiteralPath $ScratchRoot -Directory -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -notlike ".*" -and $_.Name -notlike "_*"
        } | ForEach-Object {
            $normPath = [System.IO.Path]::GetFullPath($_.FullName)
            if ($registeredPaths.Add($normPath)) {
                $targetKey = if ($targets.ContainsKey($_.Name)) { "Scratch_$($_.Name)" } else { $_.Name }
                $targets[$targetKey] = $_.FullName
            }
        }
    }

    # Gemini config external projects
    $geminiProjectsDir = $GeminiConfigDir
    if (-not [string]::IsNullOrWhiteSpace($geminiProjectsDir) -and (Test-Path -LiteralPath $geminiProjectsDir)) {
        Get-ChildItem -LiteralPath $geminiProjectsDir -Filter "*.json" -ErrorAction SilentlyContinue | ForEach-Object {
            try {
                $json = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                $uri = $null
                if ($json.projectResources -and $json.projectResources.resources) {
                    if ($json.projectResources.resources.gitFolder -and $json.projectResources.resources.gitFolder.folderUri) {
                        $uri = $json.projectResources.resources.gitFolder.folderUri
                    } elseif ($json.projectResources.resources.folderUri) {
                        $uri = $json.projectResources.resources.folderUri
                    }
                }
                if ($uri -and $uri.StartsWith("file:///")) {
                    $rawPath = $uri.Substring(8)
                    $decodedPath = [System.Uri]::UnescapeDataString($rawPath).Replace('/', '\')
                    if ($decodedPath -match '^[a-zA-Z]:' -and (Test-Path -LiteralPath $decodedPath)) {
                        $normPath = [System.IO.Path]::GetFullPath($decodedPath)
                        $alreadyCovered = $false
                        foreach ($p in $registeredPaths) {
                            if ($normPath -eq $p -or $normPath.StartsWith($p + "\") -or $normPath.StartsWith($p + "/")) {
                                $alreadyCovered = $true
                                break
                            }
                        }
                        if (-not $alreadyCovered) {
                            $projName = if ($json.name) { $json.name } else { [System.IO.Path]::GetFileName($decodedPath) }
                            if ($targets.ContainsKey($projName)) {
                                $projName = $projName + "_" + [System.IO.Path]::GetFileName($decodedPath)
                            }
                            $targets[$projName] = $decodedPath
                            $registeredPaths.Add($normPath) | Out-Null
                        }
                    }
                }
            } catch {}
        }
    }

    $projectsProcessed = $targets.Count
    Write-Log "Found $projectsProcessed project(s) to backup."

    # Process each project
    foreach ($entry in $targets.GetEnumerator()) {
        $name = $entry.Key
        $sourcePath = $entry.Value
        $archiveName = "${name}_${dateStr}.zip"
        $targetArchive = Join-Path $BackupDestination $archiveName

        $existingArchives = Get-ChildItem -LiteralPath $BackupDestination -Filter "${name}_*.zip" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
        $latestArchive = $existingArchives | Select-Object -First 1

        $needsArchive = $true

        if ($latestArchive -and (-not $ForceArchive)) {
            $lastArchiveTime = $latestArchive.LastWriteTime
            $hasChanges = Get-ChildItem -LiteralPath $sourcePath -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
                $_.FullName -notmatch '[\\/](node_modules|\.venv|venv|env|__pycache__|\.next|\.nuxt|dist|build|\.turbo|\.cache)[\\/]' -and
                $_.LastWriteTime -gt $lastArchiveTime
            } | Select-Object -First 1

            if (-not $hasChanges) {
                $needsArchive = $false
                $archivesSkipped++
                Write-Log "[$name] No changes detected since last backup ($($latestArchive.Name)). Skipping." "INFO"
            }
        }

        if ($needsArchive) {
            Write-Log "[$name] Creating archive: $archiveName ..." "INFO"
            $tempArchive = Join-Path $env:TEMP ("agy_bkp_" + [System.Guid]::NewGuid().ToString("N") + ".zip")
            if (Test-Path -LiteralPath $tempArchive) { Remove-Item -LiteralPath $tempArchive -Force -ErrorAction SilentlyContinue }

            try {
                & tar.exe -a -c -f $tempArchive $excludeArgs -C $sourcePath .
                if (Test-Path -LiteralPath $tempArchive) {
                    $fileItem = Get-Item -LiteralPath $tempArchive
                    $sizeMB = [math]::Round($fileItem.Length / 1MB, 2)
                    Move-Item -LiteralPath $tempArchive -Destination $targetArchive -Force
                    $archivesCreated++
                    $totalSizeBytes += $fileItem.Length
                    Write-Log "[$name] Backup completed successfully: $archiveName ($sizeMB MB)" "SUCCESS"
                } else {
                    $errMsg = "[$name] Failed to create archive via tar.exe."
                    Write-Log $errMsg "ERROR"
                    $errors.Add($errMsg)
                }
            } catch {
                $errMsg = "[$name] Exception during archiving: $($_.Exception.Message)"
                Write-Log $errMsg "ERROR"
                $errors.Add($errMsg)
            } finally {
                if (Test-Path -LiteralPath $tempArchive) {
                    Remove-Item -LiteralPath $tempArchive -Force -ErrorAction SilentlyContinue
                }
            }
        }

        # Zero-loss retention
        $allProjectArchives = Get-ChildItem -LiteralPath $BackupDestination -Filter "${name}_*.zip" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
        if ($allProjectArchives.Count -gt $MinBackupsToKeep) {
            $olderCandidates = $allProjectArchives | Select-Object -Skip $MinBackupsToKeep
            $cutoffDate = (Get-Date).AddDays(-$RetentionDays)

            foreach ($oldArch in $olderCandidates) {
                if ($oldArch.LastWriteTime -lt $cutoffDate) {
                    Write-Log "[$name] Purging expired archive: '$($oldArch.Name)' (> $RetentionDays days old)" "RETENTION"
                    Remove-Item -LiteralPath $oldArch.FullName -Force -ErrorAction SilentlyContinue
                }
            }
        } else {
            Write-Log "[$name] Total backups: $($allProjectArchives.Count)/$MinBackupsToKeep. All preserved." "RETENTION"
        }
    }

    $finalStatus = if ($errors.Count -eq 0) { "success" } elseif ($archivesCreated -gt 0 -or $archivesSkipped -gt 0) { "warning" } else { "error" }
    Save-Status $finalStatus
    Write-Log "Backup run completed with status: $finalStatus (Created: $archivesCreated, Skipped: $archivesSkipped, Errors: $($errors.Count))."
    Write-Log "=========================================================="
} finally {
    Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
}
