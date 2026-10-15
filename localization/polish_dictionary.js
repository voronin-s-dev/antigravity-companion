#!/usr/bin/env node
/**
 * Antigravity Companion: Nature-Style Dictionary Polish & Quality Auditor
 * Выполняет комплексный аудит существующего словаря dictionary_ru.json
 * по академическим стандартам Nature-Polishing и UI Microcopy:
 *  - Устранение машинных калек, сленга и буквализмов (шеринг, дефолтный, инстанс, хэндлер и др.)
 *  - Нормализация регистра (Sentence case вместо неестественного Title Case)
 *  - Устранение заиканий/повторов (stuttering) от калек
 *  - Стандартизация глаголов на кнопках (инфинитив вместо повелительного наклонения)
 *  - Проверка согласованности пунктуации (кнопки без точки, предложения с точкой)
 */

const fs = require('fs');
const path = require('path');

const dictPath = path.resolve(__dirname, 'dictionary_ru.json');
const toMergePath = path.resolve(__dirname, 'translations_to_merge.json');

function cyr(patStr, flags = 'gi') {
  return new RegExp(`(?<![а-яёА-ЯЁa-zA-Z0-9])${patStr}(?![а-яёА-ЯЁa-zA-Z0-9])`, flags);
}

// Словарь известных недопустимых калек и их замен по стандартам Nature-Polishing / Microcopy
const KNOWN_CALQUES = [
  // Разделы вместо секций
  { pattern: cyr('(настроить|пользовательские|все)\\s+секций'), replacement: '$1 разделов' },
  { pattern: cyr('(настроить|пользовательские|все)\\s+секции'), replacement: '$1 разделы' },
  { pattern: cyr('(настроить|пользовательская)\\s+секция'), replacement: '$1 раздел' },

  // Выполнение процессов
  { pattern: cyr('бег\\s+процессов'), replacement: 'выполнение процессов' },
  { pattern: cyr('бежит'), replacement: 'выполняется' },

  // Настройки по умолчанию
  { pattern: cyr('заводские\\s+настройки'), replacement: 'настройки по умолчанию' },
  { pattern: cyr('заводской'), replacement: 'по умолчанию' },
  { pattern: cyr('по\\s+дефолту'), replacement: 'по умолчанию' },
  { pattern: cyr('дефолтн(ый|ого|ому|ым|ом)'), replacement: 'по умолчанию' },
  { pattern: cyr('дефолтн(ая|ой|ую)'), replacement: 'по умолчанию' },
  { pattern: cyr('дефолтн(ое|ого|ому|ым)'), replacement: 'по умолчанию' },
  { pattern: cyr('дефолтн(ые|ых|ым|ыми)'), replacement: 'по умолчанию' },

  // Очередь и отправка
  { pattern: cyr('отправляет\\s+после'), replacement: 'будет отправлено после' },
  { pattern: cyr('входные\\s+данные\\s+пользователя'), replacement: 'запрос пользователя' },

  // Шеринг / доступ
  { pattern: cyr('расшарить'), replacement: 'предоставить доступ' },
  { pattern: cyr('расшаривани(е|я|ю|ем|и)'), replacement: 'совместный доступ' },
  { pattern: cyr('шеринг(а|у|ом|е)?'), replacement: 'совместный доступ' },
  { pattern: cyr('расшаренн(ый|ая|ое|ые|ого|ую|ых|ым|ыми)'), replacement: 'с общим доступом' },

  // Инстанс -> экземпляр
  { pattern: cyr('инстанс(а)?'), replacement: (m) => m.endsWith('а') || m.endsWith('А') ? 'экземпляра' : 'экземпляр' },
  { pattern: cyr('инстансу'), replacement: 'экземпляру' },
  { pattern: cyr('инстансом'), replacement: 'экземпляром' },
  { pattern: cyr('инстансе'), replacement: 'экземпляре' },
  { pattern: cyr('инстансы'), replacement: 'экземпляры' },
  { pattern: cyr('инстансов'), replacement: 'экземпляров' },
  { pattern: cyr('инстансам(и)?'), replacement: (m) => m.endsWith('и') ? 'экземплярами' : 'экземплярам' },
  { pattern: cyr('инстансах'), replacement: 'экземплярах' },

  // Хэндлер -> обработчик
  { pattern: cyr('хэндлер(а)?'), replacement: (m) => m.endsWith('а') || m.endsWith('А') ? 'обработчика' : 'обработчик' },
  { pattern: cyr('хэндлеру'), replacement: 'обработчику' },
  { pattern: cyr('хэндлером'), replacement: 'обработчиком' },
  { pattern: cyr('хэндлере'), replacement: 'обработчике' },
  { pattern: cyr('хэндлеры'), replacement: 'обработчики' },
  { pattern: cyr('хэндлеров'), replacement: 'обработчиков' },
  { pattern: cyr('хэндлерам(и)?'), replacement: (m) => m.endsWith('и') ? 'обработчиками' : 'обработчикам' },
  { pattern: cyr('хэндлерах'), replacement: 'обработчиках' },

  // Сабмит -> отправка
  { pattern: cyr('сабмит(а)?'), replacement: (m) => m.endsWith('а') || m.endsWith('А') ? 'отправки' : 'отправка' },
  { pattern: cyr('сабмитить'), replacement: 'отправлять' },
  { pattern: cyr('засабмитить'), replacement: 'отправить' },

  // Парсить -> разбирать
  { pattern: cyr('(с|рас)?парсить'), replacement: 'разобрать' },
  { pattern: cyr('парсинг(а|у|ом|е)?'), replacement: 'разбор' },
  { pattern: cyr('парсит'), replacement: 'разбирает' },
  { pattern: cyr('парсится'), replacement: 'разбирается' },

  // Свитч -> переключение
  { pattern: cyr('свитч(а)?'), replacement: (m) => m.endsWith('а') || m.endsWith('А') ? 'переключения' : 'переключение' },
  { pattern: cyr('свитчить'), replacement: 'переключать' },

  // Кастомный -> пользовательский / настраиваемый
  { pattern: cyr('кастомн(ый|ого|ому|ым|ом)'), replacement: 'пользовательский' },
  { pattern: cyr('кастомн(ая|ой|ую)'), replacement: 'пользовательская' },
  { pattern: cyr('кастомн(ое|ого|ому|ым)'), replacement: 'пользовательское' },
  { pattern: cyr('кастомн(ые|ых|ым|ыми)'), replacement: 'пользовательские' },

  // Коннект -> подключение
  { pattern: cyr('коннект(а)?'), replacement: (m) => m.endsWith('а') || m.endsWith('А') ? 'подключения' : 'подключение' },
  { pattern: cyr('коннектиться'), replacement: 'подключаться' },
  { pattern: cyr('законнектиться'), replacement: 'подключиться' },

  // Мердж -> слияние / объединение
  { pattern: cyr('мердж(а)?'), replacement: (m) => m.endsWith('а') || m.endsWith('А') ? 'слияния' : 'слияние' },
  { pattern: cyr('мерджить'), replacement: 'объединять' },
  { pattern: cyr('(с|за)мерджить'), replacement: 'объединить' },

  // Ререндер -> повторный рендеринг
  { pattern: cyr('ререндер(а|у|ом|е|инг)?'), replacement: 'повторный рендеринг' },

  // Заикания и повторы слов (Stuttering)
  { pattern: cyr('документов\\s+Документов'), replacement: 'документов' },
  { pattern: cyr('документы\\s+Документы'), replacement: 'документы' },
  { pattern: cyr('таблицами\\s+Google\\s+Таблиц'), replacement: 'таблицами Google Sheets' },
  { pattern: cyr('таблицы\\s+Google\\s+Таблиц'), replacement: 'таблицы Google Sheets' },
  { pattern: cyr('Диска\\s+Диск'), replacement: 'Диска' },
  { pattern: cyr('диск\\s+Диск'), replacement: 'Диск' }
];

// Исключения, которые должны сохранять заглавные буквы (имена собственные, аббревиатуры)
const PROPER_NOUNS = new Set([
  'Google', 'Antigravity', 'Gemini', 'Claude', 'Sonnet', 'Opus', 'Flash', 'Pro', 'Thinking', 'Ultra',
  'VS', 'Code', 'Electron', 'JavaScript', 'TypeScript', 'Python', 'Node.js', 'GitHub', 'DevTools',
  'MCP', 'CDP', 'JSON', 'CSS', 'HTML', 'API', 'URL', 'URI', 'ID', 'LLM', 'AI', 'UI', 'IDE', 'OS',
  'WSL', 'Linux', 'macOS', 'Windows', 'Карпатого', 'Карпати',
  'Коффмана', 'Грэма', 'Идса', 'Фрухтермана', 'Рейнгольда',
  'Пэн', 'Брайля', 'Канси', 'Делоне', 'Питер', 'Луи',
  'Документы', 'Документами', 'Документов', 'Таблицы', 'Таблицами', 'Таблиц', 'Диск', 'Диска', 'Календарь', 'Календаря',
  'Sheets', 'Docs', 'Drive', 'Calendar', 'Chrome', 'Playwright', 'Jest', 'Pytest', 'Git', 'npm', 'CLI', 'OTA',
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
  'Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'
]);

// Стандартизация глаголов действий на кнопках (Microcopy: инфинитив)
const IMPERATIVE_ACTION_RULES = [
  { pattern: /^Скопируйте\b/i, replacement: 'Копировать' },
  { pattern: /^Сохраните\b/i, replacement: 'Сохранить' },
  { pattern: /^Перезагрузите\b/i, replacement: 'Перезагрузить' },
  { pattern: /^Удалите\b/i, replacement: 'Удалить' },
  { pattern: /^Обновите\b/i, replacement: 'Обновить' },
  { pattern: /^Отмените\b/i, replacement: 'Отменить' },
  { pattern: /^Выберите\b/i, replacement: 'Выбрать' },
  { pattern: /^Закройте\b/i, replacement: 'Закрыть' },
  { pattern: /^Примените\b/i, replacement: 'Применить' },
  { pattern: /^Попробуйте\s+(снова|еще\s+раз)\b/i, replacement: 'Повторить попытку' },
  { pattern: /^Очистите\b/i, replacement: 'Очистить' },
  { pattern: /^Добавьте\b/i, replacement: 'Добавить' },
  { pattern: /^Создайте\b/i, replacement: 'Создать' },
  { pattern: /^Запустите\b/i, replacement: 'Запустить' },
  { pattern: /^Остановите\b/i, replacement: 'Остановить' },
  { pattern: /^Включите\b/i, replacement: 'Включить' },
  { pattern: /^Выключите\b/i, replacement: 'Выключить' },
  { pattern: /^Экспортируйте\b/i, replacement: 'Экспортировать' },
  { pattern: /^Импортируйте\b/i, replacement: 'Импортировать' },
  { pattern: /^Скачайте\b/i, replacement: 'Скачать' },
  { pattern: /^Загрузите\b/i, replacement: 'Загрузить' },
  { pattern: /^Вставьте\b/i, replacement: 'Вставить' },
  { pattern: /^Вырежьте\b/i, replacement: 'Вырезать' },
];

function applyCalqueReplacement(text, pattern, replacement) {
  if (typeof replacement === 'string' && replacement.includes('$')) {
    return text.replace(pattern, replacement);
  }
  return text.replace(pattern, (match) => {
    if (/^[А-ЯЁ]/.test(match) && typeof replacement === 'string' && replacement.length > 0) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    }
    return replacement;
  });
}

function auditDictionary({ fix = false } = {}) {
  if (!fs.existsSync(dictPath)) {
    console.error(`[Polish] Файл словаря ${dictPath} не найден.`);
    process.exit(1);
  }

  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  const exact = dict.exact || {};
  const total = Object.keys(exact).length;

  const findings = {
    doubleSpaces: [],
    titleCase: [],
    knownCalques: [],
    imperativeActions: [],
    trailingPeriodMismatches: []
  };

  const fixes = {};

  for (const [en, ru] of Object.entries(exact)) {
    if (typeof ru !== 'string' || !ru.trim()) continue;

    let fixedRu = ru;
    let modified = false;

    // 1. Проверка двойных пробелов
    if (/\s{2,}/.test(fixedRu)) {
      const suggested = fixedRu.replace(/\s{2,}/g, ' ');
      findings.doubleSpaces.push({ en, original: fixedRu, suggested });
      fixedRu = suggested;
      modified = true;
    }

    // 2. Проверка известных калек и заиканий
    for (const calque of KNOWN_CALQUES) {
      calque.pattern.lastIndex = 0;
      const suggested = applyCalqueReplacement(fixedRu, calque.pattern, calque.replacement);
      if (suggested !== fixedRu) {
        findings.knownCalques.push({ en, original: fixedRu, suggested });
        fixedRu = suggested;
        modified = true;
      }
    }

    // 3. Стандартизация глаголов действий на кнопках (Microcopy: инфинитив)
    const enTrimmed = en.trim();
    const isShortAction = (enTrimmed.length <= 40 && !enTrimmed.includes('. ') && !enTrimmed.endsWith('.')) ||
                          /^(Copy|Save|Reload|Delete|Update|Cancel|Select|Close|Apply|Retry|Clear|Add|Create|Run|Stop|Enable|Disable|Export|Import|Download|Upload|Paste|Cut)\b/i.test(enTrimmed);
    if (isShortAction) {
      for (const rule of IMPERATIVE_ACTION_RULES) {
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(fixedRu)) {
          const suggested = fixedRu.replace(rule.pattern, rule.replacement);
          if (suggested !== fixedRu) {
            findings.imperativeActions.push({ en, original: fixedRu, suggested });
            fixedRu = suggested;
            modified = true;
          }
        }
      }
    }

    // 4. Проверка Title Case в русском тексте (заглавные буквы у обычных слов внутри фразы)
    // Например: "Настроить Новые Разделы" вместо "Настроить новые разделы"
    const words = fixedRu.split(/\s+/);
    if (words.length >= 2 && !fixedRu.includes('\n')) {
      let isUnnaturalTitleCase = false;
      const lowerCandidateWords = words.map((w, idx) => {
        // Первое слово всегда сохраняет регистр
        if (idx === 0) return w;
        const prevWord = words[idx - 1];
        // Если предыдущее слово заканчивалось на точку, восклицательный/вопросительный знак, двоеточие
        if (/[.!?:]$/.test(prevWord)) return w;
        // Если предыдущее слово — символ списка (+, -, *, —, –)
        if (/^[\+\-\*—–•]$/.test(prevWord)) return w;
        // Если слово в кавычках или скобках
        if (/^[«"'(\[]/.test(w) || /\)$/.test(prevWord)) return w;
        // Очищаем от знаков препинания для проверки
        const clean = w.replace(/^[«"'(]+|[»"')!?,.:;]+$/g, '');
        if (PROPER_NOUNS.has(clean) || /^[A-Z0-9_-]+$/.test(clean)) return w;
        if (/^[А-ЯЁ][а-яё]{1,}$/.test(clean)) {
          isUnnaturalTitleCase = true;
          return w.charAt(0).toLowerCase() + w.slice(1);
        }
        return w;
      });

      if (isUnnaturalTitleCase) {
        const suggested = lowerCandidateWords.join(' ');
        findings.titleCase.push({ en, original: fixedRu, suggested });
        fixedRu = suggested;
        modified = true;
      }
    }

    // 5. Проверка пунктуации:
    // А) Короткие строки/кнопки без завершающей точки
    const ruTrimmed = fixedRu.trim();
    if (enTrimmed.length < 50 && !enTrimmed.includes('. ') && !enTrimmed.endsWith('.')) {
      if (ruTrimmed.endsWith('.') && !ruTrimmed.endsWith('...') && !ruTrimmed.endsWith(' г.')) {
        const suggested = ruTrimmed.slice(0, -1);
        findings.trailingPeriodMismatches.push({ en, original: fixedRu, suggested });
        fixedRu = suggested;
        modified = true;
      }
    }
    // Б) Предложения должны иметь завершающую точку, если оригинал заканчивается точкой
    if (enTrimmed.endsWith('.') && !/^(e\.g\.|i\.e\.)/i.test(enTrimmed) && ruTrimmed.length > 0 && !/[.!?…:;"')\]]$/.test(ruTrimmed)) {
      const suggested = ruTrimmed + '.';
      findings.trailingPeriodMismatches.push({ en, original: fixedRu, suggested });
      fixedRu = suggested;
      modified = true;
    }

    if (modified && fix) {
      fixes[en] = fixedRu;
    }
  }

  const issuesCount = findings.doubleSpaces.length +
    findings.titleCase.length +
    findings.knownCalques.length +
    findings.imperativeActions.length +
    findings.trailingPeriodMismatches.length;

  console.log(`\n--- [Nature-Polishing Quality Audit] ---`);
  console.log(`Проверено терминов в словаре: ${total}`);
  console.log(`Найдено замечаний по качеству: ${issuesCount}`);
  console.log(` - Двойные пробелы: ${findings.doubleSpaces.length}`);
  console.log(` - Title Case в русском тексте: ${findings.titleCase.length}`);
  console.log(` - Известные машинные кальки: ${findings.knownCalques.length}`);
  console.log(` - Неинфинитивные действия (Microcopy): ${findings.imperativeActions.length}`);
  console.log(` - Расхождения завершающей пунктуации: ${findings.trailingPeriodMismatches.length}`);

  if (findings.knownCalques.length > 0) {
    console.log(`\nПримеры обнаруженных калек:`);
    findings.knownCalques.slice(0, 5).forEach(f => {
      console.log(`  [EN] "${f.en}"`);
      console.log(`   └─ Было:  "${f.original}"`);
      console.log(`   └─ Стало: "${f.suggested}"`);
    });
  }

  if (findings.imperativeActions.length > 0) {
    console.log(`\nПримеры стандартизации действий (Microcopy):`);
    findings.imperativeActions.slice(0, 5).forEach(f => {
      console.log(`  [EN] "${f.en}"`);
      console.log(`   └─ Было:  "${f.original}"`);
      console.log(`   └─ Стало: "${f.suggested}"`);
    });
  }

  if (findings.titleCase.length > 0) {
    console.log(`\nПримеры исправлений регистра (Title Case -> Sentence case):`);
    findings.titleCase.slice(0, 5).forEach(f => {
      console.log(`  [EN] "${f.en}"`);
      console.log(`   └─ Было:  "${f.original}"`);
      console.log(`   └─ Стало: "${f.suggested}"`);
    });
  }

  if (fix) {
    const fixCount = Object.keys(fixes).length;
    if (fixCount > 0) {
      fs.writeFileSync(toMergePath, JSON.stringify({ exact: fixes }, null, 2), 'utf8');
      console.log(`\n✓ Сгенерирован ${toMergePath} (${fixCount} улучшений).`);
      console.log(`Запустите "npm run merge" для применения обновлений.`);
    } else {
      console.log(`\n✓ Все термины полностью соответствуют стандартам Nature-Polishing!`);
    }
  }

  console.log(`----------------------------------------\n`);
  return { total, issuesCount, findings, fixes };
}

if (require.main === module) {
  const isFix = process.argv.includes('--fix') || !process.argv.includes('--audit');
  auditDictionary({ fix: isFix });
}

module.exports = { auditDictionary, KNOWN_CALQUES, IMPERATIVE_ACTION_RULES };
