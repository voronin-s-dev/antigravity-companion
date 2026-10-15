#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dictPath = path.join(__dirname, 'dictionary_ru.json');
const mergeSourcePath = path.join(__dirname, 'translations_to_merge.json');
const queuePath = path.join(__dirname, 'untranslated_queue.json');

function main() {
  if (!fs.existsSync(mergeSourcePath)) {
    console.log('\x1b[33m[Merge] Файл localization/translations_to_merge.json не найден.\x1b[0m');
    console.log('Создайте translations_to_merge.json в формате:');
    console.log(JSON.stringify({ "English string": "Русский перевод" }, null, 2));
    process.exit(0);
  }

  let newItems;
  try {
    newItems = JSON.parse(fs.readFileSync(mergeSourcePath, 'utf8'));
  } catch (err) {
    console.error(`\x1b[31m[Merge Error] Ошибка парсинга translations_to_merge.json: ${err.message}\x1b[0m`);
    process.exit(1);
  }

  if (typeof newItems !== 'object' || newItems === null) {
    console.error('\x1b[31m[Merge Error] Содержимое translations_to_merge.json должно быть объектом { "en": "ru" }\x1b[0m');
    process.exit(1);
  }

  // Zero-Leak Secret Guard: полная проверка входящих переводов на утечки токенов/ключей
  const { containsSecret, scanDataStructure } = require('./secret_guard.js');
  const violations = scanDataStructure(newItems);
  if (violations.length > 0) {
    console.error(`\x1b[31m[SECURITY ALERT] Слияние заблокировано: в переводах обнаружены секреты (${violations.length})!\x1b[0m`);
    violations.forEach(v => console.error(`  - ${v.type} в ${v.path}: ${v.sample}`));
    process.exit(1);
  }

  // Load dictionary locally (Node.js does this instantly without wasting LLM tokens)
  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  dict.exact = dict.exact || {};
  dict.attributes = dict.attributes || {};
  dict.patterns = dict.patterns || [];

  let addedExact = 0;
  let addedAttributes = 0;
  let addedPatterns = 0;

  const PROTECTED_COMMANDS = new Set(['goal', 'btw', 'self', 'compact']);
  const isInvalidKey = (k) => {
    if (/^\d+$/.test(k.trim())) return true;
    if (PROTECTED_COMMANDS.has(k)) return true;
    if (/^[a-z0-9]+-$/i.test(k) || /^-[a-z0-9]+/i.test(k)) return true;
    if (k.length <= 3 && !/^[A-Z0-9]+$/.test(k)) return true;
    return false;
  };

  // Check if structure has explicit sections or flat
  if (newItems.exact || newItems.attributes || newItems.patterns) {
    if (newItems.exact) {
      for (const [k, v] of Object.entries(newItems.exact)) {
        if (isInvalidKey(k)) continue;
        if (dict.exact[k] !== v) {
          dict.exact[k] = v;
          addedExact++;
        }
      }
    }
    if (newItems.attributes) {
      for (const [k, v] of Object.entries(newItems.attributes)) {
        if (dict.attributes[k] !== v) {
          dict.attributes[k] = v;
          addedAttributes++;
        }
      }
    }
    if (Array.isArray(newItems.patterns)) {
      for (const p of newItems.patterns) {
        const repl = p.replace !== undefined ? p.replace : p.replacement;
        if (p.regex && repl !== undefined) {
          const rule = { regex: p.regex, replace: repl };
          if (p.flags) rule.flags = p.flags;
          const existingIdx = dict.patterns.findIndex(existing => existing.regex === p.regex);
          if (existingIdx >= 0) {
            dict.patterns[existingIdx] = rule;
          } else {
            dict.patterns.push(rule);
            addedPatterns++;
          }
        }
      }
    }
  } else {
    // Flat key-value pairs default to exact
    for (const [k, v] of Object.entries(newItems)) {
      if (isInvalidKey(k)) continue;
      if (typeof v === 'string' && dict.exact[k] !== v) {
        dict.exact[k] = v;
        addedExact++;
      }
    }
  }

  // Write updated dictionary formatted
  fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2), 'utf8');
  console.log(`\x1b[32m[Merge] Успешно добавлено: ${addedExact} точных терминов, ${addedAttributes} атрибутов, ${addedPatterns} шаблонов.\x1b[0m`);
  console.log(`[Merge] Всего в словаре: ${Object.keys(dict.exact).length} точных, ${Object.keys(dict.attributes).length} атрибутов, ${dict.patterns.length} шаблонов.`);

  // Clean queue if present (removes translated exact, attributes, patterns, and noise)
  if (fs.existsSync(queuePath)) {
    try {
      const { sanitizeQueue } = require('./sanitize_queue.js');
      const res = sanitizeQueue();
      console.log(`[Merge] Очередь непереведенных строк обновлена (осталось: ${res.afterCount}).`);
    } catch {}
  }

  // Remove the temporary merge file so it is not processed twice
  try {
    fs.unlinkSync(mergeSourcePath);
  } catch {}

  // Run quick test
  console.log('[Merge] Валидация словаря...');
  try {
    execSync('npm test', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (err) {
    console.error('\x1b[31m[Merge Error] Тесты словаря провалены!\x1b[0m');
    process.exit(1);
  }

  // Hot reload
  console.log('[Merge] Применение перевода на лету (hot reload)...');
  try {
    execSync('node localization/inject_translator.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch (err) {
    console.log('\x1b[33m[Merge] Горячее применение пропущено (Antigravity не запущен или недоступен).\x1b[0m');
  }

  console.log('\x1b[32m✓ Слияние завершено успешно!\x1b[0m\n');
}

main();
