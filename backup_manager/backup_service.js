/**
 * Antigravity Companion: Backup Controller Service
 * Управляет состоянием бэкапов, вызовом планировщика, ручным запуском и просмотром логов/директорий
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { loadConfig, saveConfig, getConfigDir } = require('../config/companion_config');
const { detectAvailableClouds } = require('./cloud_detector');
const scheduler = require('./scheduler');

/**
 * Получить путь к файлу статуса последнего бэкапа
 * @returns {string}
 */
function getBackupStatusPath() {
  return path.join(getConfigDir(), 'backup_status.json');
}

/**
 * Получить путь к лог-файлу бэкапа
 * @returns {string}
 */
function getBackupLogPath() {
  return path.join(getConfigDir(), 'backup.log');
}

/**
 * Прочитать статус последнего бэкапа
 * @returns {object|null}
 */
function getLastBackupStatus() {
  const statusFile = getBackupStatusPath();
  if (fs.existsSync(statusFile)) {
    try {
      const raw = fs.readFileSync(statusFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.status === 'running' && !isBackupRunning()) {
        parsed.status = (parsed.errors && parsed.errors.length > 0) ? 'error' : 'interrupted';
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Прочитать последние N строк из файла backup.log
 * @param {number} maxLines
 * @returns {string[]}
 */
function getRecentLogs(maxLines = 25) {
  const logFile = getBackupLogPath();
  if (fs.existsSync(logFile)) {
    try {
      const content = fs.readFileSync(logFile, 'utf8');
      const lines = content.split(/\r?\n/).filter(line => line.length > 0);
      return lines.slice(-maxLines);
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Разрешить целевую директорию для бэкапов
 * @param {string} [customPath]
 * @returns {string}
 */
function resolveDestinationPath(customPath) {
  if (customPath && typeof customPath === 'string' && customPath.trim().length > 0) {
    return path.resolve(customPath.trim());
  }

  const conf = loadConfig();
  const backupConf = (conf && conf.backup) ? conf.backup : {};

  if (backupConf.customPath && backupConf.customPath.trim().length > 0) {
    return path.resolve(backupConf.customPath.trim());
  }

  const clouds = detectAvailableClouds();
  if (backupConf.cloudProvider && backupConf.cloudProvider !== 'auto') {
    const matched = clouds.find(c => c.id === backupConf.cloudProvider);
    if (matched) return path.resolve(matched.path);
  }

  const availableCloud = clouds.find(c => c.available && c.id !== 'local');
  if (availableCloud) {
    return path.resolve(availableCloud.path);
  }

  const localCloud = clouds.find(c => c.id === 'local');
  if (localCloud) {
    return path.resolve(localCloud.path);
  }

  const userProfile = process.env.USERPROFILE || process.env.HOME || (process.platform === 'win32' ? 'C:\\Users\\Default' : '/tmp');
  return path.resolve(path.join(userProfile, 'Backups', 'Antigravity'));
}

let manualRunInitiatedAt = 0;

/**
 * Проверить, запущен ли в данный момент процесс бэкапа
 * @returns {boolean}
 */
function isBackupRunning() {
  const now = Date.now();
  const tmpDir = process.env.TEMP || process.env.TMP || os.tmpdir();
  const lockFile = path.join(tmpDir, 'antigravity_companion_backup.lock');

  if (fs.existsSync(lockFile)) {
    try {
      const rawPid = fs.readFileSync(lockFile, 'utf8').trim();
      const pid = parseInt(rawPid, 10);
      if (pid && !isNaN(pid)) {
        try {
          process.kill(pid, 0);
          return true;
        } catch (e) {
          // PID больше не существует в системе, очищаем устаревший лок
          try { fs.unlinkSync(lockFile); } catch (_) {}
        }
      }
    } catch (e) {}
  }

  // Льготный период 4 сек после ручного вызова (пока wscript -> powershell стартует и создает лок)
  if (now - manualRunInitiatedAt < 4000) {
    return true;
  }

  return false;
}

/**
 * Получить общий агрегированный статус подсистемы бэкапов
 * @returns {Promise<{ config: object, clouds: Array, scheduler: object, lastBackup: object|null, recentLogs: string[], isRunning: boolean }>}
 */
async function getStatus() {
  const conf = loadConfig();
  const clouds = await Promise.resolve(detectAvailableClouds());
  const schedStatus = scheduler.getTaskStatus();
  const lastBackup = getLastBackupStatus();
  const recentLogs = getRecentLogs(25);
  const isRunning = isBackupRunning();

  return {
    config: conf.backup,
    clouds,
    scheduler: schedStatus,
    lastBackup,
    recentLogs,
    isRunning
  };
}

/**
 * Сохранить настройки бэкапа и синхронизировать Task Scheduler
 * @param {object} newBackupSettings
 * @returns {Promise<object>}
 */
async function saveSettings(newBackupSettings = {}) {
  const currentConfig = loadConfig();
  const mergedBackup = {
    ...currentConfig.backup,
    ...newBackupSettings
  };

  saveConfig({ backup: mergedBackup });

  if (mergedBackup.enabled === true) {
    scheduler.registerDailyTask(mergedBackup.backupTime || '22:00');
  } else if (mergedBackup.enabled === false) {
    scheduler.unregisterDailyTask();
  }

  return await getStatus();
}

/**
 * Запустить ручной бэкап в фоне без блокировки
 * @returns {{ ok: boolean, message: string, running?: boolean }}
 */
function runManual() {
  if (isBackupRunning()) {
    return { ok: true, running: true, message: 'Backup is already running' };
  }

  if (process.platform !== 'win32') {
    return { ok: true, message: 'Backup started in background' };
  }

  const vbsPath = path.resolve(__dirname, 'engine', 'silent_runner.vbs');
  try {
    manualRunInitiatedAt = Date.now();
    const destination = resolveDestinationPath();
    const conf = loadConfig();
    const b = (conf && conf.backup) ? conf.backup : {};
    const args = [
      vbsPath,
      '-BackupDestination', destination,
      '-RetentionDays', String(b.retentionDays || 7)
    ];
    if (b.neverDeleteInactiveLastVersions) {
      args.push('-NeverDeleteInactiveLastVersions');
    }
    const child = spawn('wscript.exe', args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.on('error', () => {});
    child.unref();
    return { ok: true, message: 'Backup started in background', destination };
  } catch (err) {
    manualRunInitiatedAt = 0;
    return { ok: false, message: err.message };
  }
}

/**
 * Открыть папку с бэкапами в проводнике Windows
 * @param {string} [customPath]
 * @returns {{ ok: boolean, path: string }}
 */
function openFolder(customPath) {
  const resolvedPath = resolveDestinationPath(customPath);
  if (process.platform !== 'win32') {
    return { ok: true, path: resolvedPath };
  }

  try {
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
    const child = spawn('explorer.exe', [resolvedPath], {
      detached: true,
      stdio: 'ignore'
    });
    child.on('error', () => {});
    child.unref();
    return { ok: true, path: resolvedPath };
  } catch (err) {
    return { ok: false, path: resolvedPath, error: err.message };
  }
}

/**
 * Открыть лог-файл в Блокноте (Notepad)
 * @returns {{ ok: boolean, error?: string }}
 */
function openLog() {
  const logPath = getBackupLogPath();
  if (process.platform !== 'win32') {
    return { ok: true };
  }

  try {
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    if (!fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '', 'utf8');
    }
    const child = spawn('notepad.exe', [logPath], {
      detached: true,
      stdio: 'ignore'
    });
    child.on('error', () => {});
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  detectAvailableClouds,
  getStatus,
  saveSettings,
  runManual,
  isBackupRunning,
  openFolder,
  openLog,
  getBackupStatusPath,
  getBackupLogPath,
  getLastBackupStatus,
  getRecentLogs,
  resolveDestinationPath
};
