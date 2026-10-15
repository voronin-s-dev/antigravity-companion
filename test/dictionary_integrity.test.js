const fs = require('fs');
const path = require('path');

function testDictionaryIntegrity() {
  const dictPath = path.resolve(__dirname, '../localization/dictionary_ru.json');
  if (!fs.existsSync(dictPath)) {
    throw new Error(`Словарь не найден по пути: ${dictPath}`);
  }

  const raw = fs.readFileSync(dictPath, 'utf8');
  let dict;
  try {
    dict = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Ошибка синтаксиса JSON в словаре: ${err.message}`);
  }

  const exactCount = dict.exact ? Object.keys(dict.exact).length : 0;
  const attrCount = dict.attributes ? Object.keys(dict.attributes).length : 0;
  const patternList = Array.isArray(dict.patterns) ? dict.patterns : [];

  if (exactCount === 0) throw new Error('Секция exact пуста!');
  if (attrCount === 0) throw new Error('Секция attributes пуста!');
  if (patternList.length === 0) throw new Error('Секция patterns пуста!');

  // 1. Проверка синтаксиса всех регулярных выражений в patterns
  const invalidRegex = [];
  patternList.forEach((p, idx) => {
    if (!p.regex) {
      invalidRegex.push(`Индекс ${idx}: отсутствует поле regex`);
      return;
    }
    try {
      new RegExp(p.regex);
    } catch (e) {
      invalidRegex.push(`Индекс ${idx} (${p.regex}): ${e.message}`);
    }
  });

  if (invalidRegex.length > 0) {
    throw new Error(`Обнаружены невалидные regex в patterns:\n${invalidRegex.join('\n')}`);
  }

  // 2. Проверка точных совпадений на пустые ключи или аномальные пробелы
  let emptyExactKeys = 0;
  for (const [k, v] of Object.entries(dict.exact)) {
    if (!k || !k.trim()) emptyExactKeys++;
    if (typeof v !== 'string') {
      throw new Error(`Значение для exact["${k}"] не является строкой!`);
    }
  }
  if (emptyExactKeys > 0) {
    throw new Error(`Обнаружено ${emptyExactKeys} пустых ключей в секции exact`);
  }

  // 3. Защита от мусорных числовых ключей (остатки от парсинга массивов вместо объектов)
  const numericExactKeys = Object.keys(dict.exact).filter(k => /^\d+$/.test(k.trim()));
  if (numericExactKeys.length > 0) {
    throw new Error(`Обнаружено ${numericExactKeys.length} числовых ключей в секции exact (индексы массивов): ${numericExactKeys.slice(0, 10).join(', ')}`);
  }

  // 4. Защита от системных слэш-команд (они должны оставаться английскими командами)
  const forbiddenCommands = ['goal', 'btw', 'self', 'compact'];
  const violatedCommands = forbiddenCommands.filter(c => dict.exact[c] && dict.exact[c] !== c);
  if (violatedCommands.length > 0) {
    throw new Error(`Обнаружены переводы системных слэш-команд в exact: ${violatedCommands.join(', ')}`);
  }

  // 5. Защита от битых фрагментов слов и висячих дефисов (остатки подсветки поиска)
  const forbiddenFragments = ['fi', 'pd', 'ig', 'wa', 'ys', 'ser', 'bro', 'ork', 'ork.', 'xes', 'fin', 'les.', 'lows', 'veri', 'g path.', 'ails.', 'agentmemory-con', 'nd-skills'];
  const presentFragments = forbiddenFragments.filter(f => dict.exact[f]);
  if (presentFragments.length > 0) {
    throw new Error(`Обнаружены мусорные фрагменты слов в exact: ${presentFragments.join(', ')}`);
  }

  const hyphenKeys = Object.keys(dict.exact).filter(k => (/^[a-z0-9]+-$/i.test(k) || /^-[a-z0-9]+/i.test(k)) && k !== '-');
  if (hyphenKeys.length > 0) {
    throw new Error(`Обнаружены ключи с висячими дефисами в exact: ${hyphenKeys.join(', ')}`);
  }

  return {
    exactCount,
    attrCount,
    patternsCount: patternList.length,
    totalRules: exactCount + attrCount + patternList.length
  };
}

module.exports = { testDictionaryIntegrity };

if (require.main === module) {
  try {
    const res = testDictionaryIntegrity();
    console.log(`✓ Словарь валиден! Точных: ${res.exactCount}, Атрибутов: ${res.attrCount}, Шаблонов: ${res.patternsCount} (Всего: ${res.totalRules})`);
  } catch (e) {
    console.error(`✗ Ошибка проверки целостности словаря:`, e.message);
    process.exit(1);
  }
}
