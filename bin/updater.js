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

let isSyncInProgress = false;

function mergeDictionaries(baseDict, incomingDict) {
  const b = baseDict || {};
  const inc = incomingDict || {};
  const merged = {
    version: inc.version || b.version || '1.6.0',
    exact: { ...(b.exact || {}), ...(inc.exact || {}) },
    attributes: { ...(b.attributes || {}), ...(inc.attributes || {}) },
    patterns: [...(b.patterns || [])]
  };
  for (const p of (inc.patterns || [])) {
    if (p && p.regex && !merged.patterns.some(x => x.regex === p.regex)) {
      merged.patterns.push(p);
    }
  }
  return merged;
}

async function applyUpdates() {
  const repoRoot = path.resolve(__dirname, '..');
  const lockFile = path.resolve(repoRoot, '.lock_updates');
  if (fs.existsSync(lockFile)) {
    throw new Error('Обновления заморожены (.lock_updates)');
  }

  const dictPath = path.resolve(repoRoot, 'localization/dictionary_ru.json');
  const queuePath = path.resolve(repoRoot, 'localization/untranslated_queue.json');
  const backupPath = path.resolve(repoRoot, 'localization/dictionary_ru.json.bak');
  const { isStrictUiString } = require('../localization/sanitize_queue.js');

  // 1. Сохраняем текущее локальное состояние в память до любых Git-операций (Zero-Loss Guarantee)
  let localDict = { exact: {}, attributes: {}, patterns: [] };
  let localQueue = [];
  try {
    if (fs.existsSync(dictPath)) localDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  } catch (e) {}
  try {
    if (fs.existsSync(queuePath)) localQueue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  } catch (e) {}
  if (!Array.isArray(localQueue)) localQueue = [];

  const beforeTermsCount = Object.keys(localDict.exact || {}).length;
  const gitDir = path.resolve(repoRoot, '.git');
  const hasGit = fs.existsSync(gitDir);
  let updatedVia = 'dict';

  let remoteDict = null;
  let remoteQueue = [];

  if (hasGit) {
    try {
      execSync('git fetch origin main', { cwd: repoRoot, timeout: 10000, stdio: 'ignore' });
      const rawRemoteDict = execSync('git show origin/main:localization/dictionary_ru.json', { cwd: repoRoot, timeout: 5000, maxBuffer: 10 * 1024 * 1024 }).toString('utf8');
      remoteDict = JSON.parse(rawRemoteDict);
    } catch (e) {}
    try {
      const rawRemoteQueue = execSync('git show origin/main:localization/untranslated_queue.json', { cwd: repoRoot, timeout: 5000, maxBuffer: 10 * 1024 * 1024 }).toString('utf8');
      remoteQueue = JSON.parse(rawRemoteQueue);
      if (!Array.isArray(remoteQueue)) remoteQueue = [];
    } catch (e) {}
  }

  if (!remoteDict) {
    const resp = await fetch(DICT_URL, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} при загрузке словаря с GitHub`);
    remoteDict = await resp.json();
    if (!remoteDict || !remoteDict.exact) throw new Error('Некорректная структура словаря');
  }

  // 2. Бесконфликтное объединение (Union Merge): сохраняем 100% переводов и из облака, и локальных
  const mergedDict = mergeDictionaries(remoteDict, localDict);
  // Если в облаке появились более свежие переводы тех же ключей, отдаем приоритет валидному объединению
  Object.assign(mergedDict.exact, remoteDict.exact || {});

  // 3. Объединение очередей: локальные свежие строки помещаются строго В КОНЕЦ (для приоритета LIFO)
  const localValidTail = localQueue.filter(s => isStrictUiString(s, mergedDict));
  const tailSet = new Set(localValidTail);
  const remoteValidHead = remoteQueue.filter(s => !tailSet.has(s) && isStrictUiString(s, mergedDict));
  const mergedQueue = Array.from(new Set([...remoteValidHead, ...localValidTail]));

  // 4. Если это Git-репозиторий и есть новые коммиты в origin/main, синхронизируем историю без конфликтов
  if (hasGit) {
    try {
      const behind = parseInt(execSync('git rev-list HEAD..origin/main --count', { cwd: repoRoot, timeout: 4000 }).toString().trim(), 10) || 0;
      if (behind > 0) {
        try {
          execSync('git checkout HEAD -- localization/dictionary_ru.json localization/untranslated_queue.json', { cwd: repoRoot, timeout: 4000, stdio: 'ignore' });
          execSync('git pull --ff-only origin main', { cwd: repoRoot, timeout: 12000, stdio: 'ignore' });
          updatedVia = 'git';
        } catch (ffErr) {
          try {
            execSync('git merge --no-commit -X ours origin/main', { cwd: repoRoot, timeout: 8000, stdio: 'ignore' });
          } catch (mErr) {}
          fs.writeFileSync(dictPath, JSON.stringify(mergedDict, null, 2) + '\n', 'utf8');
          fs.writeFileSync(queuePath, JSON.stringify(mergedQueue, null, 2) + '\n', 'utf8');
          try {
            execSync('git add localization/dictionary_ru.json localization/untranslated_queue.json', { cwd: repoRoot, timeout: 4000, stdio: 'ignore' });
            execSync('git commit -m "merge: auto-sync remote dictionary with local queue [skip ci]"', { cwd: repoRoot, timeout: 5000, stdio: 'ignore' });
          } catch (cErr) {}
          updatedVia = 'git';
        }
      }
    } catch (e) {}
  }

  // 5. Записываем объединенные без потерь словарь и очередь на диск
  if (fs.existsSync(dictPath)) {
    try { fs.copyFileSync(dictPath, backupPath); } catch (e) {}
  }
  fs.writeFileSync(dictPath, JSON.stringify(mergedDict, null, 2) + '\n', 'utf8');
  fs.writeFileSync(queuePath, JSON.stringify(mergedQueue, null, 2) + '\n', 'utf8');

  const termsCount = Object.keys(mergedDict.exact).length;

  // 6. Hot-reload в активное окно Antigravity, если словарь обновился
  if (termsCount >= beforeTermsCount) {
    try {
      const { injectTranslator } = require('../localization/inject_translator.js');
      await injectTranslator();
    } catch (e) {}
  }

  return {
    ok: true,
    updatedVia,
    terms: termsCount,
    queueSize: mergedQueue.length,
    message: `Успешно синхронизировано (${updatedVia === 'git' ? 'Git' : 'HTTP'}). Терминов: ${termsCount}, в очереди: ${mergedQueue.length}.`
  };
}

/**
 * Двусторонняя фоновая синхронизация без потерь:
 * 1) Подтягивает свежие переводы с GitHub и применяет их на лету (OTA Pull).
 * 2) Автоматически очищает и отправляет (git push) новые захваченные с экрана строки в GitHub (Queue Push),
 *    чтобы при выключенном ноутбуке ночной GitHub Actions перевел именно свежие строки пользователя.
 */
async function runSilentOtaCheck(logger) {
  if (isSyncInProgress) return false;
  isSyncInProgress = true;
  const log = typeof logger === 'function' ? logger : console.log;
  const repoRoot = path.resolve(__dirname, '..');

  try {
    const lockFile = path.resolve(repoRoot, '.lock_updates');
    if (fs.existsSync(lockFile)) return false;

    const status = await checkForUpdates();
    if (status.hasUpdate) {
      log(`[OTA Update] Обнаружена новая версия словаря на GitHub (+${status.diffTerms} терминов). Выполняю безопасное слияние...`);
    }

    // Всегда выполняем безопасное объединение памяти/диска и санитайзинг
    const result = await applyUpdates();
    if (status.hasUpdate) {
      log(`[OTA Update] ✓ ${result.message} Изменения применены в интерфейсе на лету.`);
    }

    // Проверяем, есть ли локально захваченные строки очереди или переводы для отправки в GitHub
    const gitDir = path.resolve(repoRoot, '.git');
    if (fs.existsSync(gitDir)) {
      try {
        const { scanDataStructure } = require('../localization/secret_guard.js');
        let violations = [];
        try {
          if (fs.existsSync(queuePath)) violations.push(...scanDataStructure(JSON.parse(fs.readFileSync(queuePath, 'utf8'))));
          if (fs.existsSync(dictPath)) violations.push(...scanDataStructure(JSON.parse(fs.readFileSync(dictPath, 'utf8'))));
        } catch (e) {}
        if (violations.length > 0) {
          log(`[SECURITY] Автосинхронизация заблокирована: обнаружены секреты (${violations.length})!`);
          return false;
        }

        const diffOut = execSync('git status --porcelain localization/untranslated_queue.json localization/dictionary_ru.json', { cwd: repoRoot, timeout: 4000 }).toString().trim();
        if (diffOut) {
          execSync('git add localization/untranslated_queue.json localization/dictionary_ru.json', { cwd: repoRoot, timeout: 4000, stdio: 'ignore' });
          execSync('git commit -m "chore(i18n): auto-sync captured UI queue [skip ci]"', { cwd: repoRoot, timeout: 5000, stdio: 'ignore' });
        }
        const ahead = parseInt(execSync('git rev-list origin/main..HEAD --count', { cwd: repoRoot, timeout: 4000 }).toString().trim(), 10) || 0;
        if (ahead > 0) {
          execSync('git push origin main', { cwd: repoRoot, timeout: 15000, stdio: 'ignore' });
          log(`[OTA Sync] ✓ Очередь непереведенных строк (${result.queueSize} шт.) автоматически сохранена в GitHub.`);
        }
      } catch (pushErr) {
        log(`[OTA Sync] Отправка очереди отложена (нет сети или занят Git, данные надежно сохранены на диске): ${pushErr.message}`);
      }
    }

    return status.hasUpdate;
  } catch (err) {
    log(`[OTA Update] Ошибка при проверке/синхронизации: ${err.message}`);
    return false;
  } finally {
    isSyncInProgress = false;
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--apply')) {
    applyUpdates().then(r => console.log('✓', r.message)).catch(e => console.error('✗', e.message));
  } else if (args.includes('--sync')) {
    runSilentOtaCheck(console.log).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  } else {
    checkForUpdates().then(r => console.log(JSON.stringify(r, null, 2))).catch(e => console.error(e));
  }
}

module.exports = { checkForUpdates, applyUpdates, runSilentOtaCheck, getLocalTermsCount, mergeDictionaries };

