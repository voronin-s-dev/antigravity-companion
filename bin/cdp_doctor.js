#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

async function getCDPEndpoint() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(activePortFile)) {
    throw new Error('Файл DevToolsActivePort не найден. Убедитесь, что Antigravity запущен с --remote-debugging-port.');
  }

  const lines = fs.readFileSync(activePortFile, 'utf8').trim().split(/\r?\n/);
  const port = lines[0].trim();
  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
  const page = tabs.find(t => t.type === 'page' && typeof t.url === 'string' && (t.url.includes('127.0.0.1') || t.url.includes('localhost')) && !t.url.startsWith('data:'))
    || tabs.find(t => t.type === 'page' && typeof t.url === 'string' && !t.url.startsWith('data:') && !t.url.startsWith('devtools:') && !t.url.startsWith('chrome:') && !t.url.startsWith('about:'));
  if (!page) {
    throw new Error(`Страница Antigravity не найдена на порту ${port}. Доступные таргеты: ${tabs.map(t => t.type).join(', ')}`);
  }

  return { port, pageUrl: page.webSocketDebuggerUrl };
}

function evaluateInPage(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Таймаут выполнения CDP (5 сек)'));
    }, 5000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression,
          returnByValue: true,
          awaitPromise: true
        }
      }));
    };

    ws.onmessage = (evt) => {
      clearTimeout(timer);
      try {
        const data = JSON.parse(evt.data);
        if (data.id === 1) {
          ws.close();
          if (data.result?.exceptionDetails) {
            reject(new Error(data.result.exceptionDetails.text || 'Ошибка выполнения скрипта'));
          } else {
            resolve(data.result?.result?.value);
          }
        }
      } catch (err) {
        ws.close();
        reject(err);
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timer);
      reject(err);
    };
  });
}

async function main() {
  const args = process.argv.slice(2);

  // Режим выполнения произвольного JS в окне: node bin/cdp_doctor.js --eval "document.title"
  const evalIdx = args.indexOf('--eval');
  if (evalIdx !== -1 && args[evalIdx + 1]) {
    const expr = args[evalIdx + 1];
    try {
      const { pageUrl } = await getCDPEndpoint();
      const res = await evaluateInPage(pageUrl, expr);
      console.log(typeof res === 'object' ? JSON.stringify(res, null, 2) : res);
      process.exit(0);
    } catch (err) {
      console.error(`[CDP Error] ${err.message}`);
      process.exit(1);
    }
  }

  console.log('\x1b[36m=====================================================================\x1b[0m');
  console.log('\x1b[36m          ANTIGRAVITY COMPANION: ДИАГНОСТИКА CDP И UI               \x1b[0m');
  console.log('\x1b[36m=====================================================================\x1b[0m\n');

  try {
    process.stdout.write('[1/3] Поиск порта DevTools и таргета Electron: ');
    const { port, pageUrl } = await getCDPEndpoint();
    console.log(`\x1b[32mOK (порт: ${port})\x1b[0m`);

    process.stdout.write('[2/3] Запрос состояния DOM и компонентов: ');
    const checkScript = `({
      translatorInjected: typeof window.__agyDictRu !== 'undefined' || typeof window.__agyTranslatorRefresh !== 'undefined',
      panelInjected: !!document.getElementById('agy-limits-floating-panel'),
      panelDisplay: document.getElementById('agy-limits-floating-panel')?.style.display || 'none',
      sidebarButton: !!document.getElementById('agy-sidebar-limits-btn'),
      settingsButton: !!document.querySelector('[data-testid="settings-button"]'),
      bodyChildrenCount: document.body?.children?.length || 0,
      documentTitle: document.title
    })`;

    const state = await evaluateInPage(pageUrl, checkScript);
    console.log('\x1b[32mOK\x1b[0m\n');

    console.log('[3/3] Срез статуса компонентов UI:');
    console.log(`  • Заголовок окна:     \x1b[33m"${state.documentTitle}"\x1b[0m`);
    console.log(`  • Русификатор:        ${state.translatorInjected ? '\x1b[32mАКТИВЕН (window.__agy_translator_injected)\x1b[0m' : '\x1b[31mНЕ ВНЕДРЕН\x1b[0m'}`);
    console.log(`  • Виджет лимитов:     ${state.panelInjected ? `\x1b[32mВНЕДРЕН (видимость: ${state.panelDisplay !== 'none' ? 'ВИДИМ' : 'СКРЫТ'})\x1b[0m` : '\x1b[31mНЕ НАЙДЕН В DOM\x1b[0m'}`);
    console.log(`  • Кнопка в сайдбаре:  ${state.sidebarButton ? '\x1b[32mВНЕДРЕНА (#agy-sidebar-limits-btn)\x1b[0m' : '\x1b[31mОТСУТСТВУЕТ\x1b[0m'}`);
    console.log(`  • Кнопка настроек:    ${state.settingsButton ? '\x1b[32mНАЙДЕНА\x1b[0m' : '\x1b[33mНЕ НАЙДЕНА\x1b[0m'}`);

    console.log('\n\x1b[36m=====================================================================\x1b[0m');
    const allComponentsOk = state.translatorInjected && state.panelInjected && state.sidebarButton;
    if (allComponentsOk) {
      console.log('\x1b[32m✓ Все модули Companion успешно внедрены и работают в UI!\x1b[0m');
    } else {
      console.log('\x1b[33m! Некоторые компоненты не активны. Для горячей перезагрузки запустите: npm run reload\x1b[0m');
    }
    console.log('\x1b[36m=====================================================================\x1b[0m\n');
  } catch (err) {
    console.log(`\x1b[31mОШИБКА: ${err.message}\x1b[0m\n`);
    console.log('\x1b[33mПодсказка: Antigravity должен быть запущен с флагом отладки, например через start.bat или bin/start_silent.ps1\x1b[0m\n');
    process.exit(1);
  }
}

main().catch(console.error);
