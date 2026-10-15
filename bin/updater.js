/**
 * Antigravity Companion: OTA (Over-The-Air) Silent Updater
 * Обеспечивает автономную фоновую проверку и доставку обновлений словаря с GitHub
 * как для Git-установок, так и для standalone ZIP-пользователей.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DICT_URL = 'https://raw.githubusercontent.com/voronin-s-dev/antigravity-companion/main/localization/dictionary_ru.json';
const PKG_URL = 'https://raw.githubusercontent.com/voronin-s-dev/antigravity-companion/main/package.json';
const REPO_ZIP_URL = 'https://github.com/voronin-s-dev/antigravity-companion/archive/refs/heads/main.zip';

function isNewerVersion(remote, local) {
  if (!remote || !local) return false;
  const parse = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const r = parse(remote);
  const l = parse(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rNum = r[i] || 0;
    const lNum = l[i] || 0;
    if (rNum > lNum) return true;
    if (rNum < lNum) return false;
  }
  return false;
}

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
      remoteVersion: pkg.version,
      hasAppUpdate: false,
      hasDictUpdate: false,
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

  // Проверка актуальной версии приложения на GitHub
  let remoteVersion = pkg.version;
  let hasAppUpdate = false;
  try {
    const pkgResp = await fetch(PKG_URL, {
      signal: AbortSignal.timeout(6000)
    });
    if (pkgResp.ok) {
      const remotePkg = await pkgResp.json();
      if (remotePkg && remotePkg.version) {
        remoteVersion = remotePkg.version;
        hasAppUpdate = isNewerVersion(remoteVersion, pkg.version);
      }
    }
  } catch (e) {}

  if (hasGitUpdate) {
    hasAppUpdate = true;
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

  const hasUpdate = hasAppUpdate || hasDictUpdate;

  return {
    ok: true,
    locked: false,
    currentVersion: pkg.version,
    remoteVersion,
    hasAppUpdate,
    hasDictUpdate,
    hasUpdate,
    localTerms,
    remoteTerms,
    diffTerms: Math.max(0, remoteTerms - localTerms),
    hasGit,
    behindCommits: gitBehind,
    updateMode: hasGit ? (hasGitUpdate ? 'git' : (hasDictUpdate ? 'http_dict' : 'none')) : (hasAppUpdate ? 'zip_app' : (hasDictUpdate ? 'http_dict' : 'none'))
  };
}

let isSyncInProgress = false;

function mergeDictionaries(baseDict, incomingDict) {
  const b = baseDict || {};
  const inc = incomingDict || {};
  const mergedExact = { ...(b.exact || {}), ...(inc.exact || {}) };
  const PROTECTED_COMMANDS = new Set(['goal', 'btw', 'self', 'compact']);
  const FORBIDDEN_FRAGMENTS = new Set(['fi', 'pd', 'ig', 'wa', 'ys', 'ser', 'bro', 'ork', 'ork.', 'xes', 'fin', 'les.', 'lows', 'veri', 'g path.', 'ails.']);
  for (const k of Object.keys(mergedExact)) {
    if (/^\d+$/.test(k.trim())) delete mergedExact[k];
    if (PROTECTED_COMMANDS.has(k)) delete mergedExact[k];
    if (FORBIDDEN_FRAGMENTS.has(k)) delete mergedExact[k];
    if (/^[a-z0-9]+-$/i.test(k) || /^-[a-z0-9]+/i.test(k)) delete mergedExact[k];
  }
  const merged = {
    version: inc.version || b.version || '1.6.2',
    exact: mergedExact,
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
 * Полное обновление приложения (скриптов, виджета, словаря, конфигурации):
 * - Для Git-пользователей: синхронизация ветки origin/main через git pull
 * - Для Standalone ZIP-пользователей: скачивание архива с GitHub, распаковка и обновление файлов
 */
async function applyAppUpdate() {
  const repoRoot = path.resolve(__dirname, '..');
  const lockFile = path.resolve(repoRoot, '.lock_updates');
  if (fs.existsSync(lockFile)) {
    throw new Error('Обновления заморожены (.lock_updates)');
  }

  const gitDir = path.resolve(repoRoot, '.git');
  const hasGit = fs.existsSync(gitDir);
  let updatedVia = 'zip';
  const pkg = require('../package.json');
  let targetVersion = pkg.version;

  // Проверка актуальной версии на GitHub
  try {
    const pResp = await fetch(PKG_URL, { signal: AbortSignal.timeout(6000) });
    if (pResp.ok) {
      const pData = await pResp.json();
      if (pData && pData.version) targetVersion = pData.version;
    }
  } catch (e) {}

  if (hasGit) {
    try {
      execSync('git checkout HEAD -- localization/dictionary_ru.json localization/untranslated_queue.json', { cwd: repoRoot, timeout: 5000, stdio: 'ignore' });
      execSync('git pull --ff-only origin main', { cwd: repoRoot, timeout: 15000, stdio: 'ignore' });
      updatedVia = 'git';
    } catch (gitErr) {
      // При конфликте или ошибке git pull переключаемся на безопасную загрузку архива
      updatedVia = 'zip';
    }
  }

  if (updatedVia === 'zip') {
    const tempZip = path.resolve(repoRoot, '_temp_update.zip');
    const tempExtract = path.resolve(repoRoot, '_temp_extract');

    try {
      // 1. Попытка загрузить официальный релизный ZIP, затем запасной архив ветки main
      const releaseZipUrl = `https://github.com/voronin-s-dev/antigravity-companion/releases/download/v${targetVersion}/antigravity-companion-v${targetVersion}.zip`;
      let zipResp = null;
      try {
        zipResp = await fetch(releaseZipUrl, { signal: AbortSignal.timeout(15000) });
      } catch (e) {}

      if (!zipResp || !zipResp.ok) {
        zipResp = await fetch(REPO_ZIP_URL, { signal: AbortSignal.timeout(30000) });
      }
      if (!zipResp || !zipResp.ok) {
        throw new Error(`Не удалось загрузить архив обновления с GitHub (HTTP ${zipResp ? zipResp.status : 'ERR'})`);
      }

      const buffer = Buffer.from(await zipResp.arrayBuffer());
      fs.writeFileSync(tempZip, buffer);

      if (fs.existsSync(tempExtract)) {
        fs.rmSync(tempExtract, { recursive: true, force: true });
      }
      fs.mkdirSync(tempExtract, { recursive: true });

      // Распаковка через встроенный PowerShell Expand-Archive
      execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '${tempZip}' -DestinationPath '${tempExtract}' -Force"`, { cwd: repoRoot, timeout: 45000, stdio: 'ignore' });

      // Определение корня распакованных файлов (ветка main распаковывается в подпапку antigravity-companion-main)
      let srcRoot = tempExtract;
      const entries = fs.readdirSync(tempExtract);
      if (entries.length === 1 && fs.statSync(path.join(tempExtract, entries[0])).isDirectory()) {
        srcRoot = path.join(tempExtract, entries[0]);
      }

      // Сохраняем локальные данные пользователя
      let localQueue = [];
      const qPath = path.resolve(repoRoot, 'localization/untranslated_queue.json');
      if (fs.existsSync(qPath)) {
        try { localQueue = JSON.parse(fs.readFileSync(qPath, 'utf8')); } catch (e) {}
      }

      const filesToUpdate = [
        'bin', 'limits_widget', 'localization', 'skills', 'config',
        'package.json', 'install.bat', 'install.ps1', 'start.bat',
        'companion.bat', 'launch_antigravity.bat', 'uninstall.bat', 'uninstall.ps1',
        'update_dictionary.bat', 'update_dictionary.ps1', 'README.md', 'CHANGELOG.md'
      ];

      for (const item of filesToUpdate) {
        const srcItem = path.join(srcRoot, item);
        const destItem = path.join(repoRoot, item);
        if (fs.existsSync(srcItem)) {
          fs.cpSync(srcItem, destItem, { recursive: true, force: true });
        }
      }

      // Восстанавливаем и объединяем очередь непереведённых строк
      if (Array.isArray(localQueue) && localQueue.length > 0 && fs.existsSync(qPath)) {
        try {
          const newQ = JSON.parse(fs.readFileSync(qPath, 'utf8'));
          const mergedQ = Array.from(new Set([...(Array.isArray(newQ) ? newQ : []), ...localQueue]));
          fs.writeFileSync(qPath, JSON.stringify(mergedQ, null, 2) + '\n', 'utf8');
        } catch (e) {}
      }
    } finally {
      // Удаляем временные файлы
      try { if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip); } catch (e) {}
      try { if (fs.existsSync(tempExtract)) fs.rmSync(tempExtract, { recursive: true, force: true }); } catch (e) {}
    }
  }

  // Очистка кэша require
  try {
    delete require.cache[require.resolve('../package.json')];
    delete require.cache[require.resolve('../limits_widget/inject_panel.js')];
    delete require.cache[require.resolve('../localization/inject_translator.js')];
  } catch (e) {}

  // Горячее применение обновленного виджета и словаря
  try {
    const { injectTranslator } = require('../localization/inject_translator.js');
    const { injectWidget } = require('../limits_widget/inject_panel.js');
    await injectTranslator();
    await injectWidget();
  } catch (e) {}

  return {
    ok: true,
    updatedVia,
    newVersion: targetVersion,
    message: `Компаньон успешно обновлён до версии v${targetVersion} (${updatedVia === 'git' ? 'Git' : 'ZIP'})!`
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
  const queuePath = path.resolve(repoRoot, 'localization/untranslated_queue.json');
  const dictPath = path.resolve(repoRoot, 'localization/dictionary_ru.json');

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
  } else if (args.includes('--app')) {
    applyAppUpdate().then(r => console.log('✓', r.message)).catch(e => console.error('✗', e.message));
  } else if (args.includes('--sync')) {
    runSilentOtaCheck(console.log).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
  } else {
    checkForUpdates().then(r => console.log(JSON.stringify(r, null, 2))).catch(e => console.error(e));
  }
}

module.exports = { checkForUpdates, applyUpdates, applyAppUpdate, isNewerVersion, runSilentOtaCheck, getLocalTermsCount, mergeDictionaries };


