const fs = require('fs');
const path = require('path');

function isInjectableTarget(t) {
  if (!t || !t.webSocketDebuggerUrl) return false;
  if (t.type !== 'page' && t.type !== 'iframe' && t.type !== 'webview') return false;
  const u = typeof t.url === 'string' ? t.url : '';
  if (!u || /^(data:|devtools:|chrome:|chrome-extension:|about:|blob:)/i.test(u)) return false;
  return true;
}

function injectIntoTarget(target, dictContent, engineContent) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch (e) {}
        reject(new Error(`Timeout injecting target ${target.type}:${target.id}`));
      }
    }, 5000);

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
          return { status: 'translator_injected', type: '${target.type}', url: location.href, lang: localStorage.getItem('agy_lang') || 'ru' };
        })()
      `;

      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: code, returnByValue: true }
      }));
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id === 1 && !settled) {
          settled = true;
          clearTimeout(timer);
          try { ws.close(); } catch (e) {}
          resolve(msg.result?.result?.value || { status: 'translator_injected', type: target.type });
        }
      } catch (e) {}
    };

    ws.onerror = (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err);
      }
    };
  });
}

async function injectTranslator(onlyTargetId = null) {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(activePortFile)) {
    console.error('Antigravity is not running or DevToolsActivePort not found.');
    return;
  }
  const lines = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
  const port = lines[0].trim();

  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
  let targets = tabs.filter(isInjectableTarget);
  if (onlyTargetId) {
    targets = targets.filter(t => t.id === onlyTargetId);
  } else {
    // Sort primary localhost page first
    targets.sort((a, b) => {
      const aPri = a.type === 'page' && (a.url.includes('127.0.0.1') || a.url.includes('localhost')) ? 0 : 1;
      const bPri = b.type === 'page' && (b.url.includes('127.0.0.1') || b.url.includes('localhost')) ? 0 : 1;
      return aPri - bPri;
    });
  }

  if (targets.length === 0) {
    console.error('Antigravity page not found');
    return;
  }

  const dictPath = path.join(__dirname, 'dictionary_ru.json');
  const enginePath = path.join(__dirname, 'translation_engine.js');

  const dictContent = fs.readFileSync(dictPath, 'utf8');
  const engineContent = fs.readFileSync(enginePath, 'utf8');

  const results = await Promise.allSettled(targets.map(t => injectIntoTarget(t, dictContent, engineContent)));
  const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value);
  console.log(`[Antigravity Translator] Injected successfully into ${ok.length}/${targets.length} target(s):`, ok[0] || {});
  return ok.length === 1 ? ok[0] : { status: 'translator_injected', targets: ok };
}

if (require.main === module) {
  injectTranslator().catch(console.error);
}

module.exports = { injectTranslator, isInjectableTarget, injectIntoTarget };
