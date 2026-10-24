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
        diskBackupConfig: { enabled: true, cloudProvider: 'auto', customPath: '', backupTime: '22:00', retentionDays: 7, neverDeleteInactiveLastVersions: true },
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

function testProjectIsolationGuard() {
  const engineSource = fs.readFileSync(path.resolve(__dirname, '../localization/translation_engine.js'), 'utf8');
  if (!engineSource.includes('[data-testid="project-header"]')) {
    throw new Error('Безопасность нарушена: project-header отсутствует в EXCLUDED_SELECTORS translation_engine.js!');
  }
  if (!engineSource.includes('[data-project-card]')) {
    throw new Error('Безопасность нарушена: data-project-card отсутствует в EXCLUDED_SELECTORS translation_engine.js!');
  }
  if (!engineSource.includes('restoreProjectHeaders')) {
    throw new Error('Отсутствует функция самовосстановления restoreProjectHeaders в translation_engine.js!');
  }
}

function testSkillCommandIsolationGuard() {
  const engineSource = fs.readFileSync(path.resolve(__dirname, '../localization/translation_engine.js'), 'utf8');
  if (!engineSource.includes('[data-testid="menu-option-label"]')) {
    throw new Error('Безопасность нарушена: menu-option-label отсутствует в EXCLUDED_SELECTORS translation_engine.js!');
  }
  if (!engineSource.includes('[data-testid="hover-card-title"]')) {
    throw new Error('Безопасность нарушена: hover-card-title отсутствует в EXCLUDED_SELECTORS translation_engine.js!');
  }
}

function testStartupRetryGuard() {
  const panelSource = fs.readFileSync(path.resolve(__dirname, '../limits_widget/inject_panel.js'), 'utf8');
  if (!panelSource.includes('scheduleInitRetry')) {
    throw new Error('Отсутствует механизм scheduleInitRetry в inject_panel.js!');
  }
  if (!panelSource.includes('hasLoadedQuota')) {
    throw new Error('Отсутствует флаг hasLoadedQuota в inject_panel.js!');
  }
  if (!panelSource.includes('serviceConnecting')) {
    throw new Error('Отсутствует статус serviceConnecting в inject_panel.js!');
  }
}

function testStepCounterIntegrity() {
  const panelSource = fs.readFileSync(path.resolve(__dirname, '../limits_widget/inject_panel.js'), 'utf8');
  if (panelSource.includes('Math.ceil(totalMessages / 2)')) {
    throw new Error('Обнаружен устаревший баг подсчета шагов: Math.ceil(totalMessages / 2) приводит к скачку до 100+ шагов!');
  }
  if (!panelSource.includes('p.turns') || !panelSource.includes('autoscroll-viewport')) {
    throw new Error('Отсутствует канонический подсчет ходов диалога через turns в React Fiber!');
  }
}

function testBackupPanelSyntaxGuard() {
  const panelSource = fs.readFileSync(path.resolve(__dirname, '../limits_widget/inject_panel.js'), 'utf8');
  if (!panelSource.includes('agy-tab-backup')) {
    throw new Error('Отсутствует селектор agy-tab-backup в inject_panel.js!');
  }
  if (!panelSource.includes('agy-backup-enable-toggle')) {
    throw new Error('Отсутствует селектор agy-backup-enable-toggle в inject_panel.js!');
  }
  if (!panelSource.includes('agy-backup-panel-tab-content')) {
    throw new Error('Отсутствует селектор agy-backup-panel-tab-content в inject_panel.js!');
  }
  if (!panelSource.includes('backupPollInterval')) {
    throw new Error('Отсутствует реактивный цикл поллинга статуса бэкапа (backupPollInterval) в inject_panel.js!');
  }
  if (!panelSource.includes('backupCompletedNotice')) {
    throw new Error('Отсутствует баннер обратной связи о завершении бэкапа (backupCompletedNotice) в inject_panel.js!');
  }
  if (!panelSource.includes("second: '2-digit'")) {
    throw new Error('Отсутствует отображение секунд в таймштампе бэкапа (second: 2-digit) в inject_panel.js!');
  }
}

module.exports = { testFileSyntax, testInjectionCodeExtraction, testProjectIsolationGuard, testSkillCommandIsolationGuard, testStartupRetryGuard, testStepCounterIntegrity, testBackupPanelSyntaxGuard };

if (require.main === module) {
  try {
    testInjectionCodeExtraction();
    testProjectIsolationGuard();
    testSkillCommandIsolationGuard();
    testStartupRetryGuard();
    testStepCounterIntegrity();
    testBackupPanelSyntaxGuard();
    console.log('✓ Синтаксис всех скриптов, изоляция проектов, команд скилов, авто-ретрай лимитов, счетчик шагов и панель бэкапа корректны!');
  } catch (e) {
    console.error('✗ Ошибка синтаксиса:', e.message);
    process.exit(1);
  }
}
