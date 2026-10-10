#!/usr/bin/env node
/**
 * Antigravity Companion: Queue Privacy & Noise Sanitizer
 * Удаляет из очереди приватные названия проектов, диалогов, код, хоткеи
 * и оставляет строго системные UI-строки интерфейса Antigravity IDE.
 */

const fs = require('fs');
const path = require('path');

const queuePath = path.join(__dirname, 'untranslated_queue.json');
const dictPath = path.join(__dirname, 'dictionary_ru.json');

if (!fs.existsSync(queuePath)) {
  console.log('[Sanitizer] untranslated_queue.json не найден.');
  process.exit(0);
}

let queue = [];
try {
  queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
} catch (e) {
  console.error('[Sanitizer Error]', e.message);
  process.exit(1);
}

let dict = { exact: {}, attributes: {}, patterns: [] };
try {
  dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
} catch (e) {}

const isStrictUiString = (s) => {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();

  // Длина UI-строк: от 2 до 80 символов (все что длиннее — промпты, логи, фразы диалогов)
  if (t.length < 2 || t.length > 80) return false;

  // Исключить любую кириллицу (названия пользовательских проектов на русском)
  if (/[а-яА-ЯёЁ]/.test(t)) return false;

  // Исключить пути, URL и файлы
  if (/^(https?:\/\/|file:\/\/|\/|[A-Za-z]:\\)/i.test(t)) return false;
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|ts|tsx|jsx|json|md|py|sh|ps1|exe|dll)$/i.test(t)) return false;

  // Исключить клавиатурные шорткаты и коды клавиш
  if (/^(Ctrl|Alt|Shift|Cmd|Meta|Enter|Esc|Space|Tab|\+)/i.test(t)) return false;
  if (/^(Key[A-Z0-9]|Digit[0-9]|Arrow[A-Za-z]+|Backquote|Backspace)$/i.test(t)) return false;

  // Исключить внутренние типы Protobuf / JS / ошибки
  if (/(Error|Proto|Descriptor|Options|Field|Feature|Enum|Syntax|Config|Schema|Type|Array)$/i.test(t)) return false;

  // Исключить служебные названия проекта и репозитория
  if (['antigravity-companion', 'ACTIVE_STATE.md', 'FM', 'DNB'].includes(t)) return false;

  // Исключить числа и спецсимволы
  if (/^[0-9+\-.,:;!?()\/\\%\s]+$/.test(t)) return false;
  if (/^#?[0-9a-fA-F]{3,8}$/.test(t)) return false;

  // Должны быть английские буквы
  if (!/[A-Za-z]/.test(t)) return false;

  // Должно быть допустимо для UI
  if (!/^[A-Za-z0-9\s:_\-.,!?()'"/%]+$/.test(t)) return false;

  // Проверка по уже переведенному словарю
  if (dict.exact && dict.exact[t]) return false;
  if (dict.attributes && dict.attributes[t]) return false;
  if (dict.patterns && dict.patterns.length) {
    for (const p of dict.patterns) {
      try {
        if (new RegExp(p.regex).test(t)) return false;
      } catch (e) {}
    }
  }

  return true;
};

const beforeCount = queue.length;
const sanitizedQueue = Array.from(new Set(queue.filter(isStrictUiString)));

fs.writeFileSync(queuePath, JSON.stringify(sanitizedQueue, null, 2), 'utf8');

console.log(`[Sanitizer] Очередь очищена: было ${beforeCount}, осталось ${sanitizedQueue.length} системных UI-строк.`);
console.log('[Sanitizer] Первые 10 проверенных системных строк:', sanitizedQueue.slice(0, 10));
