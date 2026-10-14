#!/usr/bin/env node
/**
 * Antigravity Companion: Nature-Style Dictionary Polish & Quality Auditor
 * Выполняет комплексный аудит существующего словаря dictionary_ru.json
 * по академическим стандартам Nature-Polishing:
 *  - Устранение неестественных машинных калек и буквализмов
 *  - Нормализация регистра (Sentence case вместо Title Case в русском тексте)
 *  - Проверка согласованности пунктуации и пробелов
 *  - Соблюдение терминологических границ IDE и AI
 */

const fs = require('fs');
const path = require('path');

const dictPath = path.resolve(__dirname, 'dictionary_ru.json');
const toMergePath = path.resolve(__dirname, 'translations_to_merge.json');

// Словарь известных недопустимых калек и их академических замен в UI
const KNOWN_CALQUES = [
  { pattern: /\b(настроить|пользовательские|все)\s+секций\b/gi, replacement: '$1 разделов' },
  { pattern: /\b(настроить|пользовательские|все)\s+секции\b/gi, replacement: '$1 разделы' },
  { pattern: /\b(настроить|пользовательская)\s+секция\b/gi, replacement: '$1 раздел' },
  { pattern: /\bбег\s+процессов\b/gi, replacement: 'выполнение процессов' },
  { pattern: /\bбежит\b/gi, replacement: 'выполняется' },
  { pattern: /\bзаводские\s+настройки\b/gi, replacement: 'настройки по умолчанию' },
  { pattern: /\bзаводской\b/gi, replacement: 'по умолчанию' },
  { pattern: /\bотправляет\s+после\b/gi, replacement: 'будет отправлено после' },
  { pattern: /\bвходные\s+данные\s+пользователя\b/gi, replacement: 'запрос пользователя' }
];

// Исключения, которые должны сохранять заглавные буквы (имена собственные, аббревиатуры)
const PROPER_NOUNS = new Set([
  'Google', 'Antigravity', 'Gemini', 'Claude', 'Sonnet', 'Opus', 'Flash', 'Pro', 'Thinking', 'Ultra',
  'VS', 'Code', 'Electron', 'JavaScript', 'TypeScript', 'Python', 'Node.js', 'GitHub', 'DevTools',
  'MCP', 'CDP', 'JSON', 'CSS', 'HTML', 'API', 'URL', 'URI', 'ID', 'LLM', 'AI', 'UI', 'IDE', 'OS',
  'WSL', 'Linux', 'macOS', 'Windows', 'Карпатого', 'Карпати',
  'Коффмана', 'Грэма', 'Идса', 'Фрухтермана', 'Рейнгольда',
  'Документы', 'Документами', 'Таблицы', 'Таблицами', 'Диск', 'Диска', 'Календарь', 'Календаря',
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
  'Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'
]);

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
    trailingPeriodMismatches: []
  };

  const fixes = {};

  for (const [en, ru] of Object.entries(exact)) {
    if (typeof ru !== 'string' || !ru.trim()) continue;

    // 1. Проверка двойных пробелов
    if (/\s{2,}/.test(ru)) {
      const fixedRu = ru.replace(/\s{2,}/g, ' ');
      findings.doubleSpaces.push({ en, original: ru, suggested: fixedRu });
      if (fix) fixes[en] = fixedRu;
    }

    // 2. Проверка известных калек
    for (const calque of KNOWN_CALQUES) {
      if (calque.pattern.test(ru)) {
        const fixedRu = ru.replace(calque.pattern, calque.replacement);
        findings.knownCalques.push({ en, original: ru, suggested: fixedRu });
        if (fix) fixes[en] = fixedRu;
      }
    }

    // 3. Проверка Title Case в русском тексте (заглавные буквы у обычных слов внутри фразы)
    // Например: "Настроить Новые Разделы" вместо "Настроить новые разделы"
    const words = ru.split(/\s+/);
    if (words.length >= 3 && !ru.includes('\n')) {
      let isUnnaturalTitleCase = false;
      const lowerCandidateWords = words.map((w, idx) => {
        // Первое слово всегда с заглавной
        if (idx === 0) return w;
        const prevWord = words[idx - 1];
        // Если предыдущее слово заканчивалось на точку, восклицательный или вопросительный знак, двоеточие — это начало нового предложения
        if (/[.!?:]$/.test(prevWord)) return w;
        // Если предыдущее слово — символ списка или математический оператор (+, -, *, —, –), то текущее слово начинает фразу
        if (/^[\+\-\*—–•]$/.test(prevWord)) return w;
        // Если слово в кавычках или скобках (например «Правка», «Чат», (Мышление)), это название функции или кнопки — сохраняем
        if (/^[«"'(\[]/.test(w) || /\)$/.test(prevWord)) return w;
        // Очищаем от знаков препинания для проверки
        const clean = w.replace(/^[«"'(]+|[»"')!?,.:;]+$/g, '');
        if (PROPER_NOUNS.has(clean) || /^[A-Z0-9]+$/.test(clean)) return w;
        if (/^[А-ЯЁ][а-яё]{2,}$/.test(clean)) {
          isUnnaturalTitleCase = true;
          // Преобразуем первую букву в строчную
          return w.charAt(0).toLowerCase() + w.slice(1);
        }
        return w;
      });

      if (isUnnaturalTitleCase) {
        const suggested = lowerCandidateWords.join(' ');
        findings.titleCase.push({ en, original: ru, suggested });
        if (fix && !fixes[en]) fixes[en] = suggested;
      }
    }

    // 4. Проверка несоответствия точки на конце коротких строк (кнопки/метки меню)
    const enTrimmed = en.trim();
    const ruTrimmed = ru.trim();
    if (enTrimmed.length < 35 && !enTrimmed.includes('. ') && !enTrimmed.endsWith('.')) {
      if (ruTrimmed.endsWith('.') && !ruTrimmed.endsWith('...') && !ruTrimmed.endsWith(' г.')) {
        const suggested = ruTrimmed.slice(0, -1);
        findings.trailingPeriodMismatches.push({ en, original: ru, suggested });
        if (fix && !fixes[en]) fixes[en] = suggested;
      }
    }
  }

  const issuesCount = findings.doubleSpaces.length +
    findings.titleCase.length +
    findings.knownCalques.length +
    findings.trailingPeriodMismatches.length;

  console.log(`\n--- [Nature-Polishing Quality Audit] ---`);
  console.log(`Проверено терминов в словаре: ${total}`);
  console.log(`Найдено замечаний по качеству: ${issuesCount}`);
  console.log(` - Двойные пробелы: ${findings.doubleSpaces.length}`);
  console.log(` - Title Case в русском тексте: ${findings.titleCase.length}`);
  console.log(` - Известные машинные кальки: ${findings.knownCalques.length}`);
  console.log(` - Лишние завершающие точки: ${findings.trailingPeriodMismatches.length}`);

  if (findings.knownCalques.length > 0) {
    console.log(`\nПримеры обнаруженных калек:`);
    findings.knownCalques.slice(0, 5).forEach(f => {
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

module.exports = { auditDictionary, KNOWN_CALQUES };
