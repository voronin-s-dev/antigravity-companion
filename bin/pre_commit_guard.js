#!/usr/bin/env node
/**
 * Antigravity Companion: Git Pre-Commit & Pre-Push Secret Guard
 * 
 * Перехватывает любые попытки закоммитить или отправить в Git секреты,
 * токены ботов, API-ключи или приватные токены.
 * При обнаружении немедленно блокирует операцию Git с ненулевым кодом выхода.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { detectSecretType } = require('../localization/secret_guard.js');

function runGuard() {
  const repoRoot = path.resolve(__dirname, '..');
  let stagedFiles = [];
  try {
    const raw = execSync('git diff --cached --name-only', { cwd: repoRoot, encoding: 'utf8' }).trim();
    stagedFiles = raw ? raw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  } catch (e) {
    // Если git diff недоступен, выходим без ошибки
    return;
  }

  if (stagedFiles.length === 0) return;

  const violations = [];

  for (const relFile of stagedFiles) {
    // Пропускаем тесты самого guard-модуля, файлы документации/примеров и lock-файлы с хешами целостности
    if (relFile.startsWith('test/') || relFile.endsWith('.example') || relFile === 'localization/secret_guard.js' || relFile.endsWith('-lock.json') || relFile.endsWith('.lock')) {
      continue;
    }

    try {
      // Проверяем именно добавленные строки в staged diff (чтобы не блокировать удаление)
      const diff = execSync(`git diff --cached -U0 -- "${relFile}"`, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));

      for (const line of addedLines) {
        const text = line.slice(1).trim();
        const type = detectSecretType(text);
        if (type) {
          violations.push({
            file: relFile,
            type,
            sample: text.slice(0, 10) + '...'
          });
        }
      }
    } catch (err) {
      console.warn(`[Secret Guard Warning] Не удалось проверить ${relFile}: ${err.message}`);
    }
  }

  if (violations.length > 0) {
    console.error('\n\x1b[41m\x1b[37m====================================================================\x1b[0m');
    console.error('\x1b[31m[CRITICAL SECURITY ALERT] КОММИТ ЗАБЛОКИРОВАН: ОБНАРУЖЕНЫ СЕКРЕТЫ!\x1b[0m');
    console.error('\x1b[41m\x1b[37m====================================================================\x1b[0m\n');
    violations.forEach(v => {
      console.error(`  ❌ Файл: \x1b[33m${v.file}\x1b[0m`);
      console.error(`     Тип:  \x1b[31m${v.type}\x1b[0m (фрагмент: "${v.sample}")`);
    });
    console.error('\nУдалите указанные секреты перед коммитом или используйте переменные окружения (.env).\n');
    process.exit(1);
  }
}

if (require.main === module) {
  runGuard();
}

module.exports = { runGuard };
