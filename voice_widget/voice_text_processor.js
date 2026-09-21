/**
 * Antigravity Companion: Voice Text Processor
 * Оффлайн модуль мгновенной умной пунктуации, голосовых команд и форматирования текста (0 мс, 0 токенов).
 */

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeBoundaryRegex(phrase) {
  // Unicode-safe word boundary for both Cyrillic and Latin
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${phrase})(?![\\p{L}\\p{N}])`, 'giu');
}

const RAW_RULES_RU = [
  { pattern: 'новый абзац|абзац', replace: '\n\n' },
  { pattern: 'с новой строки|новая строка|перенос строки', replace: '\n' },
  { pattern: 'восклицательный знак', replace: '! ' },
  { pattern: 'вопросительный знак', replace: '? ' },
  { pattern: 'точка с запятой', replace: '; ' },
  { pattern: 'многоточие', replace: '... ' },
  { pattern: 'двоеточие', replace: ': ' },
  { pattern: 'точка|точку', replace: '. ' },
  { pattern: 'запятая|запятую', replace: ', ' },
  { pattern: 'тире|дефис', replace: ' — ' },
  { pattern: 'открыть кавычки|открываем кавычки', replace: ' «' },
  { pattern: 'закрыть кавычки|закрываем кавычки', replace: '» ' },
  { pattern: 'смайлик|улыбка', replace: ' 🙂 ' },
  { pattern: 'грустный смайлик', replace: ' 🙁 ' }
];

const RAW_RULES_EN = [
  { pattern: 'new paragraph', replace: '\n\n' },
  { pattern: 'new line', replace: '\n' },
  { pattern: 'exclamation mark|exclamation point', replace: '! ' },
  { pattern: 'question mark', replace: '? ' },
  { pattern: 'semicolon', replace: '; ' },
  { pattern: 'colon', replace: ': ' },
  { pattern: 'period|full stop', replace: '. ' },
  { pattern: 'comma', replace: ', ' },
  { pattern: 'open quote|open quotes', replace: ' "' },
  { pattern: 'close quote|close quotes', replace: '" ' }
];

const COMPILED_RULES = [
  ...RAW_RULES_RU.map(r => ({ regex: makeBoundaryRegex(r.pattern), replace: r.replace })),
  ...RAW_RULES_EN.map(r => ({ regex: makeBoundaryRegex(r.pattern), replace: r.replace }))
];

/**
 * Преобразует голосовой текст в аккуратно пунктуированный и отформатированный текст.
 * @param {string} text Исходный сырой текст из распознавания речи
 * @param {object} options Опции обработки
 * @param {boolean} options.smartPunctuation Заменять голосовые команды знаков препинания (default true)
 * @param {boolean} options.autoCapitalize Делать заглавными первые буквы предложений (default true)
 * @returns {string} Отформатированный текст
 */
function processVoiceText(text, options = {}) {
  if (!text || typeof text !== 'string') return '';

  const smartPunctuation = options.smartPunctuation !== false;
  const autoCapitalize = options.autoCapitalize !== false;

  let result = text.trim();
  if (!result) return '';

  if (smartPunctuation) {
    // 1. Применяем замены голосовых команд
    for (const rule of COMPILED_RULES) {
      result = result.replace(rule.regex, rule.replace);
    }

    // 2. Убираем лишние пробелы перед знаками препинания: "слово , слово" -> "слово, слово"
    result = result.replace(/\s+([.,!?:;»])/gu, '$1');

    // 3. Убираем лишние пробелы после открывающих кавычек: "« слово" -> "«слово"
    result = result.replace(/([«"])\s+/gu, '$1');

    // 4. Гарантируем пробел после знака препинания, если следом идет буква
    result = result.replace(/([.,!?:;])([\p{L}\p{N}])/gu, '$1 $2');

    // 5. Очищаем пробелы вокруг переносов строк
    result = result.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');

    // 6. Схлопываем множественные пробелы (кроме переводов строк)
    result = result.replace(/[ \t]{2,}/g, ' ');
  }

  if (autoCapitalize) {
    // Первая буква всего текста
    result = result.replace(/^([\p{L}])/u, (m) => m.toUpperCase());

    // Первая буква после точки, восклицательного/вопросительного знака или новой строки
    result = result.replace(/([.!?\n]\s*)([\p{L}])/gu, (match, prefix, char) => {
      return prefix + char.toUpperCase();
    });
  }

  return result.trim();
}

module.exports = {
  processVoiceText,
  RAW_RULES_RU,
  RAW_RULES_EN
};
