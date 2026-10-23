/**
 * Antigravity Companion: Cloud Storage Detector
 * Автоматическое обнаружение облачных провайдеров (OneDrive, Google Drive, Yandex.Disk, Dropbox)
 * и локального хранилища на Windows.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Получить свободное место на диске в гигабайтах для указанного пути
 * @param {string} targetPath 
 * @returns {number} Свободное место в ГБ с округлением до 1 десятичного знака
 */
function getVolumeFreeSpaceGB(targetPath) {
  try {
    if (!targetPath || typeof targetPath !== 'string') return 0;
    // On POSIX (e.g. Linux CI runner), Windows drive paths like Z:\ are not native and must return 0
    if (process.platform !== 'win32' && /^[a-zA-Z]:[\\/]/.test(targetPath)) {
      return 0;
    }
    let checkPath = path.resolve(targetPath);
    const parsed = path.parse(checkPath);
    if (!parsed.root || !fs.existsSync(parsed.root)) {
      return 0;
    }
    while (checkPath && !fs.existsSync(checkPath)) {
      const parent = path.dirname(checkPath);
      if (parent === checkPath) break;
      checkPath = parent;
    }
    if (checkPath && fs.existsSync(checkPath) && typeof fs.statfsSync === 'function') {
      const stats = fs.statfsSync(checkPath);
      const bavail = Number(stats.bavail);
      const bsize = Number(stats.bsize);
      return Math.round((bavail * bsize) / (1024 * 1024 * 1024) * 10) / 10;
    }
  } catch (e) {}
  return 0;
}

/**
 * Обнаружить доступные облачные хранилища и локальную папку
 * @returns {Array<{id: string, name: string, path: string, available: boolean, freeSpaceGB: number}>}
 */
function detectAvailableClouds() {
  const userProfile = process.env.USERPROFILE || process.env.HOME || (process.platform === 'win32' ? 'C:\\Users\\Default' : '/tmp');
  const clouds = [];

  // 1. OneDrive
  const oneDriveRoot = process.env.OneDrive ||
                       process.env.OneDriveConsumer ||
                       process.env.OneDriveCommercial ||
                       (fs.existsSync(path.join(userProfile, 'OneDrive')) ? path.join(userProfile, 'OneDrive') : null);
  const oneDriveAvailable = Boolean(oneDriveRoot && fs.existsSync(oneDriveRoot));
  const oneDrivePath = oneDriveRoot
    ? path.join(oneDriveRoot, 'Backups', 'Antigravity')
    : path.join(userProfile, 'OneDrive', 'Backups', 'Antigravity');
  clouds.push({
    id: 'onedrive',
    name: 'Microsoft OneDrive',
    path: oneDrivePath,
    available: oneDriveAvailable,
    freeSpaceGB: oneDriveAvailable ? getVolumeFreeSpaceGB(oneDriveRoot) : 0
  });

  // 2. Google Drive
  let gdriveRoot = null;
  const driveCandidates = ['G:\\', 'H:\\', 'I:\\', 'F:\\'];
  for (const drive of driveCandidates) {
    if (fs.existsSync(drive)) {
      const myDriveRu = path.join(drive, 'Мой диск');
      const myDriveEn = path.join(drive, 'My Drive');
      if (fs.existsSync(myDriveRu)) {
        gdriveRoot = myDriveRu;
        break;
      } else if (fs.existsSync(myDriveEn)) {
        gdriveRoot = myDriveEn;
        break;
      } else {
        gdriveRoot = drive;
        break;
      }
    }
  }
  if (!gdriveRoot) {
    const localGDrive = path.join(userProfile, 'Google Drive');
    const localGDriveRu = path.join(userProfile, 'Google Диск');
    if (fs.existsSync(localGDrive)) {
      gdriveRoot = localGDrive;
    } else if (fs.existsSync(localGDriveRu)) {
      gdriveRoot = localGDriveRu;
    }
  }
  const gdriveAvailable = Boolean(gdriveRoot && fs.existsSync(gdriveRoot));
  const gdrivePath = gdriveRoot
    ? path.join(gdriveRoot, 'Backups', 'Projects')
    : path.join('G:\\', 'My Drive', 'Backups', 'Projects');
  clouds.push({
    id: 'gdrive',
    name: 'Google Drive',
    path: gdrivePath,
    available: gdriveAvailable,
    freeSpaceGB: gdriveAvailable ? getVolumeFreeSpaceGB(gdriveRoot) : 0
  });

  // 3. Yandex.Disk
  let yandexRoot = null;
  if (process.platform === 'win32') {
    try {
      const regOutput = execSync('reg query "HKCU\\Software\\Yandex\\Yandex.Disk\\Settings" /v SyncDirectory', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
        windowsHide: true
      });
      const match = regOutput.match(/SyncDirectory\s+REG_\w+\s+(.*)/i);
      if (match && match[1]) {
        yandexRoot = match[1].trim();
      }
    } catch (e) {}
  }

  if (!yandexRoot) {
    const fallbacks = [
      path.join(userProfile, 'YandexDisk'),
      path.join(userProfile, 'Yandex.Disk'),
      path.join(userProfile, 'Яндекс.Диск')
    ];
    for (const fb of fallbacks) {
      if (fs.existsSync(fb)) {
        yandexRoot = fb;
        break;
      }
    }
  }
  const yandexAvailable = Boolean(yandexRoot && fs.existsSync(yandexRoot));
  const yandexPath = yandexRoot
    ? path.join(yandexRoot, 'Backups', 'Antigravity')
    : path.join(userProfile, 'YandexDisk', 'Backups', 'Antigravity');
  clouds.push({
    id: 'yandex',
    name: 'Yandex.Disk',
    path: yandexPath,
    available: yandexAvailable,
    freeSpaceGB: yandexAvailable ? getVolumeFreeSpaceGB(yandexRoot) : 0
  });

  // 4. Dropbox
  let dropboxRoot = null;
  const dropboxInfoPaths = [
    path.join(process.env.LOCALAPPDATA || '', 'Dropbox', 'info.json'),
    path.join(process.env.APPDATA || '', 'Dropbox', 'info.json')
  ];
  for (const infoFile of dropboxInfoPaths) {
    if (infoFile && fs.existsSync(infoFile)) {
      try {
        const raw = fs.readFileSync(infoFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.personal && parsed.personal.path) {
          dropboxRoot = parsed.personal.path;
          break;
        } else if (parsed.business && parsed.business.path) {
          dropboxRoot = parsed.business.path;
          break;
        }
      } catch (e) {}
    }
  }
  if (!dropboxRoot) {
    const localDropbox = path.join(userProfile, 'Dropbox');
    if (fs.existsSync(localDropbox)) {
      dropboxRoot = localDropbox;
    }
  }
  const dropboxAvailable = Boolean(dropboxRoot && fs.existsSync(dropboxRoot));
  const dropboxPath = dropboxRoot
    ? path.join(dropboxRoot, 'Backups', 'Antigravity')
    : path.join(userProfile, 'Dropbox', 'Backups', 'Antigravity');
  clouds.push({
    id: 'dropbox',
    name: 'Dropbox',
    path: dropboxPath,
    available: dropboxAvailable,
    freeSpaceGB: dropboxAvailable ? getVolumeFreeSpaceGB(dropboxRoot) : 0
  });

  // 5. Local Fallback
  const localBackupRoot = path.join(userProfile, 'Antigravity Backups');
  clouds.push({
    id: 'local',
    name: 'Local Storage',
    path: localBackupRoot,
    available: true,
    freeSpaceGB: getVolumeFreeSpaceGB(userProfile)
  });

  return clouds;
}

module.exports = {
  detectAvailableClouds,
  getVolumeFreeSpaceGB
};
