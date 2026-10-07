const fs = require('fs');
const path = require('path');
const vm = require('vm');

function testFileSyntax(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  try {
    new vm.Script(code, { filename: path.basename(filePath) });
  } catch (err) {
    throw new Error(`Синтаксическая ошибка в ${filePath}: ${err.message}`);
  }
}

function testInjectionCodeExtraction() {
  // 1. Проверяем код инъекции translation_engine.js
  const enginePath = path.resolve(__dirname, '../localization/translation_engine.js');
  testFileSyntax(enginePath);

  // 2. Проверяем ключевые модули сервиса
  const criticalFiles = [
    '../bin/antigravity_companion.js',
    '../bin/companion_server.js',
    '../bin/cdp_doctor.js',
    '../bin/doctor.js',
    '../config/companion_config.js',
    '../localization/inject_translator.js',
    '../limits_widget/inject_panel.js'
  ];

  for (const rel of criticalFiles) {
    const fullPath = path.resolve(__dirname, rel);
    if (fs.existsSync(fullPath)) {
      testFileSyntax(fullPath);
    }
  }

  // 3. Извлекаем и компилируем точный браузерный пейлоад inject_panel.js
  const injectPanelPath = path.resolve(__dirname, '../limits_widget/inject_panel.js');
  const panelSource = fs.readFileSync(injectPanelPath, 'utf8');
  
  const startMarker = 'const injectionCode = `';
  const endMarker = '})()`';
  const startIdx = panelSource.indexOf(startMarker);
  const endIdx = panelSource.indexOf(endMarker, startIdx);

  if (startIdx !== -1 && endIdx !== -1) {
    const templateExpr = panelSource.substring(
      startIdx + 'const injectionCode = '.length,
      endIdx + endMarker.length
    );
    try {
      // Вычисляем шаблонную строку так же, как это делает Node.js в рантайме
      const evaluatedPayload = vm.runInNewContext(templateExpr, {
        diskConfig: { intervalMs: 60000, tint: 'native' },
        pkgVersion: '1.4.0'
      });
      // Проверяем полученный JavaScript-код на синтаксические ошибки в браузере
      new vm.Script(evaluatedPayload, { filename: 'browser_limits_injected.js' });
    } catch (e) {
      throw new Error(`Синтаксическая ошибка в браузере (inject_panel): ${e.message}`);
    }
  } else {
    throw new Error('Не удалось обнаружить границы injectionCode в inject_panel.js');
  }
}

module.exports = { testFileSyntax, testInjectionCodeExtraction };

if (require.main === module) {
  try {
    testInjectionCodeExtraction();
    console.log('✓ Синтаксис всех скриптов и инъекций корректен!');
  } catch (e) {
    console.error('✗ Ошибка синтаксиса:', e.message);
    process.exit(1);
  }
}
