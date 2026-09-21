const fs = require('fs');
const path = require('path');

async function injectTranslator() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(activePortFile)) {
    console.error('Antigravity is not running or DevToolsActivePort not found.');
    return;
  }
  const lines = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
  const port = lines[0].trim();

  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
  const page = tabs.find(t => t.type === 'page' && typeof t.url === 'string' && (t.url.includes('127.0.0.1') || t.url.includes('localhost')) && !t.url.startsWith('data:'))
    || tabs.find(t => t.type === 'page' && typeof t.url === 'string' && !t.url.startsWith('data:') && !t.url.startsWith('devtools:') && !t.url.startsWith('chrome:') && !t.url.startsWith('about:'));
  if (!page) {
    console.error('Antigravity page not found');
    return;
  }

  const dictPath = path.join(__dirname, 'dictionary_ru.json');
  const enginePath = path.join(__dirname, 'translation_engine.js');

  const dictContent = fs.readFileSync(dictPath, 'utf8');
  const engineContent = fs.readFileSync(enginePath, 'utf8');

  const ws = new WebSocket(page.webSocketDebuggerUrl);

  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      const code = `
        (() => {
          let ls = null;
          try {
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.getItem('__agy_test__');
              ls = window.localStorage;
            }
          } catch (e) {}
          const localStorage = ls || { getItem: () => 'ru', setItem: () => {} };
          window.__agyDictRu = ${dictContent};
          ${engineContent}
          if (window.__agyTranslatorRefresh) window.__agyTranslatorRefresh();
          return { status: 'translator_injected', lang: localStorage.getItem('agy_lang') || 'ru' };
        })()
      `;

      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: code, returnByValue: true }
      }));
    };

    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === 1) {
        console.log('[Antigravity Translator] Injected successfully:', msg.result?.result?.value);
        ws.close();
        resolve(msg.result?.result?.value);
      }
    };

    ws.onerror = (err) => {
      reject(err);
    };
  });
}

if (require.main === module) {
  injectTranslator().catch(console.error);
}

module.exports = { injectTranslator };
