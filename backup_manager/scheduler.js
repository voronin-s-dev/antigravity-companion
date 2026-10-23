/**
 * Antigravity Companion: Task Scheduler Integration
 * Управляет ежедневным фоновым заданием через Windows Task Scheduler (PowerShell cmdlets)
 */

const path = require('path');
const { execSync } = require('child_process');

const TASK_NAME = 'AntigravityCompanionBackup';

/**
 * Выполнить PowerShell-скрипт через Base64 EncodedCommand
 * @param {string} script 
 * @returns {string} Вывод команды
 */
function runPowerShell(script) {
  const b64 = Buffer.from(script, 'utf16le').toString('base64');
  return execSync(`powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${b64}`, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

/**
 * Зарегистрировать ежедневную задачу в Windows Task Scheduler
 * @param {string} timeStr - Время в формате HH:mm (например, '22:00')
 * @returns {{ ok: boolean, taskName: string, time: string, error?: string }}
 */
function registerDailyTask(timeStr) {
  let validTime = '22:00';
  if (typeof timeStr === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr.trim())) {
    validTime = timeStr.trim();
  }

  const vbsPath = path.resolve(__dirname, 'engine', 'silent_runner.vbs');
  const escapedVbs = vbsPath.replace(/'/g, "''");

  const psScript = `
$vbs = '${escapedVbs}'
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "\`"$vbs\`""
$trigger = New-ScheduledTaskTrigger -Daily -At '${validTime}'
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $action -Trigger $trigger -Settings $settings -Description 'Antigravity Companion Daily Project Backup' -Force
`;

  try {
    runPowerShell(psScript);
    return { ok: true, taskName: TASK_NAME, time: validTime };
  } catch (err) {
    return { ok: false, taskName: TASK_NAME, time: validTime, error: err.message };
  }
}

/**
 * Удалить ежедневную задачу из Windows Task Scheduler
 * @returns {{ ok: boolean, error?: string }}
 */
function unregisterDailyTask() {
  const psScript = `Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue`;
  try {
    runPowerShell(psScript);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Получить текущий статус задачи в Task Scheduler
 * @returns {{ exists: boolean, state?: string|null, nextRunTime?: string|null, lastRunTime?: string|null, lastTaskResult?: number|null }}
 */
function getTaskStatus() {
  const psScript = `
$task = Get-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction SilentlyContinue
if ($null -eq $task) {
    Write-Output '{"exists":false}'
} else {
    $info = Get-ScheduledTaskInfo -TaskName '${TASK_NAME}' -ErrorAction SilentlyContinue
    $next = if ($info -and $info.NextRunTime -and $info.NextRunTime.Year -gt 2000) { $info.NextRunTime.ToString("o") } else { $null }
    $last = if ($info -and $info.LastRunTime -and $info.LastRunTime.Year -gt 2000) { $info.LastRunTime.ToString("o") } else { $null }
    $resCode = if ($info -and $null -ne $info.LastTaskResult) { [int]$info.LastTaskResult } else { $null }
    @{
        exists = $true
        state = [string]$task.State
        nextRunTime = $next
        lastRunTime = $last
        lastTaskResult = $resCode
    } | ConvertTo-Json -Compress
}
`;

  try {
    const output = runPowerShell(psScript).trim();
    if (!output) {
      return { exists: false };
    }
    const data = JSON.parse(output);
    return {
      exists: Boolean(data.exists),
      state: data.state || null,
      nextRunTime: data.nextRunTime || null,
      lastRunTime: data.lastRunTime || null,
      lastTaskResult: data.lastTaskResult !== undefined ? data.lastTaskResult : null
    };
  } catch (e) {
    return { exists: false };
  }
}

module.exports = {
  registerDailyTask,
  unregisterDailyTask,
  getTaskStatus,
  TASK_NAME
};
