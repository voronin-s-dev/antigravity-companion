const fs = require('fs');
const path = require('path');
const { injectWidget } = require('../limits_widget/inject_panel.js');
const { injectTranslator } = require('../localization/inject_translator.js');

// Dynamically locate DevToolsActivePort in current user's AppData
const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');

let isChecking = false;

async function checkAndInject() {
  if (isChecking) return;
  isChecking = true;

  try {
    if (!fs.existsSync(activePortFile)) {
      return;
    }

    const lines = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
    const port = lines[0].trim();
    if (!port || isNaN(port)) return;

    const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(2000) });
    const tabs = await res.json();
    const page = tabs.find(t => t.type === 'page' && typeof t.url === 'string' && (t.url.includes('127.0.0.1') || t.url.includes('localhost')) && !t.url.startsWith('data:'))
      || tabs.find(t => t.type === 'page' && typeof t.url === 'string' && !t.url.startsWith('data:') && !t.url.startsWith('devtools:') && !t.url.startsWith('chrome:') && !t.url.startsWith('about:'));
    if (!page || !page.webSocketDebuggerUrl) return;

    const ws = new WebSocket(page.webSocketDebuggerUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `({
            hasModernWidget: !!document.getElementById('agy-limits-tooltip') && !!document.getElementById('agy-limits-floating-panel'),
            hasTranslator: !!window.__agyTranslatorActive
          })`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id === 1) {
          const state = msg.result?.result?.value || {};
          ws.close();

          if (!state.hasModernWidget) {
            console.log('[Companion] Injecting Modern Limits Widget...');
            await injectWidget();
          }

          if (!state.hasTranslator) {
            console.log('[Companion] Injecting Russian Translation Engine...');
            await injectTranslator();
          }
        }
      } catch(e) {
        ws.close();
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  } catch (e) {
    // Antigravity not ready or loading
  } finally {
    isChecking = false;
  }
}

process.on('uncaughtException', (err) => {
  console.error('[Companion Fatal] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Companion Fatal] Unhandled Rejection:', reason);
});
process.on('exit', (code) => {
  console.log('[Companion Exit] Process exiting with code:', code);
});

const { startServer: startConfigServer } = require('./companion_server.js');
try {
  startConfigServer();
} catch (e) {
  console.log('[Config Server] Note:', e.message);
}

console.log('[Antigravity Companion Service] Активен. Фоновый мониторинг (виджет + русский перевод)...');
setInterval(checkAndInject, 3500);
checkAndInject();

module.exports = { checkAndInject };
