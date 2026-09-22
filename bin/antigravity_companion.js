const fs = require('fs');
const path = require('path');

// Safe background logging (captures logs to %APPDATA%\AntigravityCompanion\companion.log and prevents EPIPE/crashes when running headless)
const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
const compDir = path.join(appData, 'AntigravityCompanion');
try {
  if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
  const logStream = fs.createWriteStream(path.join(compDir, 'companion.log'), { flags: 'a' });
  const safeWrite = (orig, chunk, enc, cb) => {
    try { logStream.write(chunk, enc, cb); } catch (e) {}
    try { if (orig) orig(chunk, enc, cb); } catch (e) {}
  };
  const origOut = process.stdout.write ? process.stdout.write.bind(process.stdout) : null;
  const origErr = process.stderr.write ? process.stderr.write.bind(process.stderr) : null;
  process.stdout.write = (chunk, enc, cb) => safeWrite(origOut, chunk, enc, cb);
  process.stderr.write = (chunk, enc, cb) => safeWrite(origErr, chunk, enc, cb);
} catch (e) {}

const { injectWidget } = require('../limits_widget/inject_panel.js');
const { injectTranslator } = require('../localization/inject_translator.js');

// Dynamically locate DevToolsActivePort in current user's AppData
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

const logSync = (msg) => {
  try {
    fs.appendFileSync(path.join(compDir, 'companion.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {}
};

process.on('uncaughtException', (err) => {
  logSync(`[Companion Fatal] Uncaught Exception: ${err.stack || err}`);
});
process.on('unhandledRejection', (reason) => {
  logSync(`[Companion Fatal] Unhandled Rejection: ${reason?.stack || reason}`);
});
process.on('exit', (code) => {
  logSync(`[Companion Exit] Process exiting with code: ${code}`);
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
