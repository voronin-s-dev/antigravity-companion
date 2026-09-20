#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\x1b[36m=====================================================================\x1b[0m');
console.log('\x1b[36m        ДИАГНОСТИКА ОКРУЖЕНИЯ (ANTIGRAVITY COMPANION DOCTOR)         \x1b[0m');
console.log('\x1b[36m=====================================================================\x1b[0m\n');

let allOk = true;

// 1. Node.js
process.stdout.write('[1/6] Среда Node.js: ');
try {
  const nodeVer = process.version;
  console.log(`\x1b[32mOK (${nodeVer})\x1b[0m`);
} catch {
  console.log('\x1b[31mНЕ НАЙДЕН\x1b[0m');
  allOk = false;
}

// 2. Git
process.stdout.write('[2/6] Контроль версий Git: ');
try {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  console.log(`\x1b[32mOK (ветка: ${branch}, коммит: ${commit})\x1b[0m`);
} catch {
  console.log('\x1b[31mНЕ НАЙДЕН / НЕ РЕПОЗИТОРИЙ\x1b[0m');
  allOk = false;
}

// 3. GitHub CLI
process.stdout.write('[3/6] GitHub CLI (gh): ');
try {
  const ghCmd = fs.existsSync('C:\\Program Files\\GitHub CLI\\gh.exe') ? '"C:\\Program Files\\GitHub CLI\\gh.exe"' : 'gh';
  const authOut = execSync(`${ghCmd} auth status`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const match = authOut.match(/Logged in to github\.com account ([\w-]+)/);
  if (match) {
    console.log(`\x1b[32mOK (авторизован как ${match[1]})\x1b[0m`);
  } else {
    console.log('\x1b[33mУстановлен, но требуется вход (gh auth login)\x1b[0m');
  }
} catch {
  console.log('\x1b[33mНе установлен / не авторизован (опционально)\x1b[0m');
}

// 4. Словарь
process.stdout.write('[4/6] Словарь (localization/dictionary_ru.json): ');
try {
  const dictPath = path.join(__dirname, '..', 'localization', 'dictionary_ru.json');
  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  const exact = Object.keys(dict.exact || {}).length;
  const attr = Object.keys(dict.attributes || {}).length;
  const patterns = (dict.patterns || []).length;
  console.log(`\x1b[32mOK (${exact} точных, ${attr} атрибутов, ${patterns} шаблонов)\x1b[0m`);
} catch (err) {
  console.log(`\x1b[31mОШИБКА: ${err.message}\x1b[0m`);
  allOk = false;
}

// 5. Процесс Antigravity и порт CDP
process.stdout.write('[5/6] Antigravity и порт CDP: ');
try {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  const portFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
  if (fs.existsSync(portFile)) {
    const port = fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0].trim();
    console.log(`\x1b[32mЗапущен (порт CDP: ${port})\x1b[0m`);
  } else {
    console.log('\x1b[33mФайл порта не найден (запустите Antigravity)\x1b[0m');
  }
} catch {
  console.log('\x1b[33mНе удалось прочитать порт\x1b[0m');
}

// 6. Фоновая служба Companion
process.stdout.write('[6/6] Служба Companion и автозапуск: ');
try {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  const startupLnk = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'AntigravityCompanion.lnk');
  const autostart = fs.existsSync(startupLnk);

  const statusOut = execSync('powershell -NoProfile -ExecutionPolicy Bypass -File bin/status.ps1', { encoding: 'utf8' });
  const isRunning = statusOut.includes('АКТИВНА');

  if (isRunning) {
    console.log(`\x1b[32mАктивна (Автозапуск: ${autostart ? 'ВКЛ' : 'ВЫКЛ'})\x1b[0m`);
  } else {
    console.log(`\x1b[33mНе активна в данный момент (Автозапуск: ${autostart ? 'ВКЛ' : 'ВЫКЛ'}). Запуск: node bin/antigravity_companion.js\x1b[0m`);
  }
} catch (err) {
  console.log('\x1b[33mСтатус службы не определен\x1b[0m');
}

console.log('\n\x1b[36m=====================================================================\x1b[0m');
if (allOk) {
  console.log('\x1b[32m✓ Окружение полностью готово к разработке и поддержке!\x1b[0m');
} else {
  console.log('\x1b[33m! Обнаружены замечания, требующие внимания.\x1b[0m');
}
console.log('\x1b[36m=====================================================================\x1b[0m\n');
