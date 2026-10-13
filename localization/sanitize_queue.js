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

const isStrictUiString = (s, dictRef) => {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  const activeDict = dictRef;

  // Длина UI-строк: от 2 символов (лимит увеличен до 2000, чтобы не отсекать длинные описания настроек, баннеров и тултипов)
  if (t.length < 2 || t.length > 2000) return false;

  // Исключить любую кириллицу (названия пользовательских проектов на русском)
  if (/[а-яА-ЯёЁ]/.test(t)) return false;

  // Исключить пути, URL и файлы (включая пути внутри скобок или строк)
  if (/^(https?:\/\/|file:\/\/|\/|[A-Za-z]:\\)/i.test(t)) return false;
  if (/[A-Za-z]:[/\\]/.test(t)) return false;
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|ts|tsx|jsx|json|md|py|sh|ps1|exe|dll|yml|yaml|toml|lock)$/i.test(t)) return false;

  // Исключить токены, ключи API и секреты через централизованный Zero-Leak Secret Guard
  const { containsSecret } = require('./secret_guard.js');
  if (containsSecret(t)) return false;

  // Исключить сигнатуры разрешений инструментов: command(...), read_file(...), write_file(...)
  if (/^[a-z_]+\(.+\)$/i.test(t)) return false;

  // Исключить разделители из подчеркиваний/дефисов и технические слоги (kebab-case из 2+ дефисов)
  if (/^[_=-]{2,}$/.test(t)) return false;
  if (/^[a-z0-9]+(-[a-z0-9]+){2,}$/.test(t)) return false;

  // Исключить таймзоны вида Europe/Helsinki, America/New_York
  if (/^(Europe|America|Asia|Africa|Pacific|Australia|Atlantic|Indian|Etc)\/[A-Za-z_]+$/.test(t)) return false;

  // Исключить клавиатурные шорткаты и коды клавиш
  if (/^(Ctrl|Alt|Shift|Cmd|Meta|Enter|Esc|Space|Tab|\+)+/i.test(t)) return false;
  if (/^(Key[A-Z0-9]|Digit[0-9]|Arrow[A-Za-z]+|Backquote|Backspace)$/i.test(t)) return false;

  // Исключить внутренние типы Protobuf / JS / ошибки без пробелов
  if (!/\s/.test(t) && /(Error|Proto|Descriptor|Options|Field|Feature|Enum|Syntax|Config|Schema|Type|Array|Dockerfile)$/i.test(t)) return false;

  // Исключить служебные названия проекта и репозитория
  if (['antigravity-companion', 'ACTIVE_STATE.md', 'FM', 'DNB', 'Polymarket-Sim'].includes(t)) return false;

  // Исключить числа и спецсимволы
  if (/^[0-9+\-.,:;!?()\/\\%\s]+$/.test(t)) return false;
  if (/^#?[0-9a-fA-F]{3,8}$/.test(t)) return false;

  // Должны быть английские буквы
  if (!/[A-Za-z]/.test(t)) return false;

  // Должно быть допустимо для UI
  if (!/^[A-Za-z0-9\s:_\-.,!?()'"/%\`\[\]]+$/.test(t)) return false;

  // Проверка по уже переведенному словарю
  if (activeDict) {
    if (activeDict.exact && activeDict.exact[t]) return false;
    if (activeDict.attributes && activeDict.attributes[t]) return false;
    if (activeDict.patterns && activeDict.patterns.length) {
      for (const p of activeDict.patterns) {
        try {
          if (new RegExp(p.regex, p.flags || '').test(t)) return false;
        } catch (e) {}
      }
    }
  }

  return true;
};

function sanitizeQueue() {
  if (!fs.existsSync(queuePath)) return { beforeCount: 0, afterCount: 0, queue: [] };
  let currentQueue = [];
  try {
    currentQueue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  } catch (e) {
    return { beforeCount: 0, afterCount: 0, queue: [] };
  }
  let currentDict = { exact: {}, attributes: {}, patterns: [] };
  try {
    currentDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  } catch (e) {}

  const beforeCount = currentQueue.length;
  const sanitized = Array.from(new Set(currentQueue.filter(s => isStrictUiString(s, currentDict))));
  if (sanitized.length !== beforeCount) {
    fs.writeFileSync(queuePath, JSON.stringify(sanitized, null, 2), 'utf8');
  }
  return { beforeCount, afterCount: sanitized.length, queue: sanitized };
}

if (require.main === module) {
  const res = sanitizeQueue();
  console.log(`[Sanitizer] Очередь очищена: было ${res.beforeCount}, осталось ${res.afterCount} системных UI-строк.`);
  console.log('[Sanitizer] Последние 10 свежих системных строк:', res.queue.slice(-10));
}

module.exports = { isStrictUiString, sanitizeQueue };
