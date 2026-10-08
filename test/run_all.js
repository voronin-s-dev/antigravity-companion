const { testDictionaryIntegrity } = require('./dictionary_integrity.test.js');
const { testInjectionCodeExtraction } = require('./syntax_injection.test.js');

console.log('--- [Antigravity Companion: Тестирование] ---');
let hasErrors = false;

try {
  process.stdout.write('1. Проверка целостности словаря и regex... ');
  const dictStats = testDictionaryIntegrity();
  console.log(`✓ УСПЕШНО`);
  console.log(`   Правил всего: ${dictStats.totalRules} (терминов: ${dictStats.exactCount}, атрибутов: ${dictStats.attrCount}, шаблонов: ${dictStats.patternsCount})`);
} catch (e) {
  console.log(`✗ ОШИБКА: ${e.message}`);
  hasErrors = true;
}

try {
  process.stdout.write('2. Проверка синтаксиса модулей и инъекций CDP... ');
  testInjectionCodeExtraction();
  console.log(`✓ УСПЕШНО`);
  console.log(`   Все JS-скрипты, службы и браузерные пейлоады синтаксически валидны.`);
} catch (e) {
  console.log(`✗ ОШИБКА: ${e.message}`);
  hasErrors = true;
}

try {
  process.stdout.write('3. Проверка безопасности Companion Server (Host/Origin/CORS)... ');
  const { testSecurityGuards } = require('./companion_server_security.test.js');
  testSecurityGuards(false);
  console.log(`✓ УСПЕШНО`);
} catch (e) {
  console.log(`✗ ОШИБКА: ${e.message}`);
  hasErrors = true;
}

console.log('---------------------------------------------');
if (hasErrors) {
  console.error('✗ Обнаружены критические ошибки при тестировании.');
  process.exit(1);
} else {
  console.log('✓ Все тесты пройдены успешно!');
  process.exit(0);
}
