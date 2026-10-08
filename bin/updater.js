/**
 * Antigravity Companion: OTA (Over-The-Air) Silent Updater
 * Обеспечивает автономную фоновую проверку и доставку обновлений словаря с GitHub
 * как для Git-установок, так и для standalone ZIP-пользователей.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DICT_URL = 'https://raw.githubusercontent.com/voronin-s-dev/antigravity-companion/main/localization/dictionary_ru.json';

function getLocalTermsCount() {
  const dictPath = path.resolve(__dirname, '../localization/dictionary_ru.json');
  try {
    if (!fs.existsSync(dictPath)) return 0;
    const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    return Object.keys(dict.exact || {}).length;
  } catch (e) {
    return 0;
  }
}

async function checkForUpdates() {
  const lockFile = path.resolve(__dirname, '../.lock_updates');
  const isLocked = fs.existsSync(lockFile);
  const pkg = require('../package.json');
  const localTerms = getLocalTermsCount();

  if (isLocked) {
    return {
      ok: true,
      locked: true,
      currentVersion: pkg.version,
      localTerms,
      remoteTerms: localTerms,
      diffTerms: 0,
      hasUpdate: false,
      message: 'Обновления заморожены (.lock_updates)'
    };
  }

  const gitDir = path.resolve(__dirname, '../.git');
  const hasGit = fs.existsSync(gitDir);
  let gitBehind = 0;
  let hasGitUpdate = false;

  if (hasGit) {
    try {
      execSync('git fetch origin', { timeout: 6000, stdio: 'ignore' });
      const behind = execSync('git rev-list HEAD..origin/main --count', { timeout: 4000 }).toString().trim();
      gitBehind = parseInt(behind, 10) || 0;
      hasGitUpdate = gitBehind > 0;
    } catch (e) {}
  }

  let remoteTerms = localTerms;
  let hasDictUpdate = false;
  try {
    const dictResp = await fetch(DICT_URL, {
      signal: AbortSignal.timeout(6000)
    });
    if (dictResp.ok) {
      const remoteDict = await dictResp.json();
      if (remoteDict && remoteDict.exact) {
        remoteTerms = Object.keys(remoteDict.exact).length;
        if (remoteTerms > localTerms) {
          hasDictUpdate = true;
        }
      }
    }
  } catch (e) {}

  const hasUpdate = hasGitUpdate || hasDictUpdate;

  return {
    ok: true,
    locked: false,
    currentVersion: pkg.version,
    localTerms,
    remoteTerms,
    diffTerms: Math.max(0, remoteTerms - localTerms),
    hasUpdate,
    hasGit,
    behindCommits: gitBehind,
    updateMode: hasGit ? (hasGitUpdate ? 'git' : (hasDictUpdate ? 'http_dict' : 'none')) : (hasDictUpdate ? 'http_dict' : 'none')
  };
}

async function applyUpdates() {
  const check = await checkForUpdates();
  if (check.locked) {
    throw new Error('Обновления заморожены (.lock_updates)');
  }

  const gitDir = path.resolve(__dirname, '../.git');
  const hasGit = fs.existsSync(gitDir);
  let updatedVia = 'dict';
  let termsCount = 0;

  if (hasGit && check.behindCommits > 0) {
    try {
      execSync('git pull --ff-only origin main', { timeout: 15000, stdio: 'ignore' });
      updatedVia = 'git';
    } catch (gitErr) {
      // Fallback to direct HTTP download
    }
  }

  if (updatedVia !== 'git') {
    const resp = await fetch(DICT_URL, {
      signal: AbortSignal.timeout(12000)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} при загрузке словаря с GitHub`);
    const newDict = await resp.json();
    if (!newDict || !newDict.exact) throw new Error('Некорректная структура словаря');

    const dictPath = path.resolve(__dirname, '../localization/dictionary_ru.json');
    const backupPath = path.resolve(__dirname, '../localization/dictionary_ru.json.bak');

    if (fs.existsSync(dictPath)) {
      fs.copyFileSync(dictPath, backupPath);
    }
    fs.writeFileSync(dictPath, JSON.stringify(newDict, null, 2), 'utf8');
    termsCount = Object.keys(newDict.exact).length;
  } else {
    termsCount = getLocalTermsCount();
  }

  // Hot-reload into active window if available
  try {
    const { injectTranslator } = require('../localization/inject_translator.js');
    await injectTranslator();
  } catch (e) {}

  return {
    ok: true,
    updatedVia,
    terms: termsCount,
    message: `Успешно обновлено (${updatedVia === 'git' ? 'Git pull' : 'HTTP словарь'}). Терминов: ${termsCount}.`
  };
}

/**
 * Тихая фоновая проверка для службы Companion.
 * Вызывается по расписанию (раз в 1 час) и при старте.
 */
async function runSilentOtaCheck(logger) {
  const log = typeof logger === 'function' ? logger : console.log;
  try {
    const status = await checkForUpdates();
    if (status.hasUpdate) {
      log(`[OTA Update] Обнаружена новая версия словаря на GitHub (+${status.diffTerms} терминов). Выполняю тихое обновление...`);
      const result = await applyUpdates();
      log(`[OTA Update] ✓ ${result.message} Изменения применены в интерфейсе на лету.`);
      return true;
    }
  } catch (err) {
    log(`[OTA Update] Ошибка при проверке/применении: ${err.message}`);
  }
  return false;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--apply')) {
    applyUpdates().then(r => console.log('✓', r.message)).catch(e => console.error('✗', e.message));
  } else {
    checkForUpdates().then(r => console.log(JSON.stringify(r, null, 2))).catch(e => console.error(e));
  }
}

module.exports = { checkForUpdates, applyUpdates, runSilentOtaCheck, getLocalTermsCount };
