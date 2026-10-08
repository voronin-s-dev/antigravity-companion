const fs = require('fs');
const path = require('path');

// Safe background logging (captures logs to %APPDATA%\AntigravityCompanion\companion.log and prevents crashes in headless mode)
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

const logSync = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(path.join(compDir, 'companion.log'), line);
  } catch (e) {}
  try {
    process.stdout.write(line);
  } catch (e) {}
};

const { injectWidget } = require('../limits_widget/inject_panel.js');
const { injectTranslator } = require('../localization/inject_translator.js');

// Dynamically locate DevToolsActivePort in current user's AppData
const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');

const exitOnClose = process.argv.includes('--exit-on-close') || process.env.AGY_EXIT_ON_CLOSE === 'true';

let currentWs = null;
let isConnecting = false;
let isConnected = false;
let isInjecting = false;
let fileWatcher = null;
let recheckDebounce = null;

function cdpEvaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== 1 /* OPEN */) {
      return reject(new Error('WebSocket is not open'));
    }
    const id = Math.floor(Math.random() * 1000000) + 1000;
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error('CDP Evaluate timeout (4000ms)'));
    }, 4000);

    const onMessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) {
          clearTimeout(timeout);
          ws.removeEventListener('message', onMessage);
          resolve(msg.result && msg.result.result ? msg.result.result.value : null);
        }
      } catch (e) {}
    };

    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true }
    }));
  });
}

async function ensureInjected() {
  if (isInjecting || !currentWs || !isConnected) return;
  isInjecting = true;

  try {
    const checkExpr = `({
      hasWidget: !!document.getElementById('agy-limits-tooltip') && !!document.getElementById('agy-limits-floating-panel'),
      hasTranslator: !!window.__agyTranslatorActive
    })`;

    const state = (await cdpEvaluate(currentWs, checkExpr)) || {};

    if (!state.hasTranslator) {
      logSync('[Companion] Внедрение русификатора UI...');
      try { delete require.cache[require.resolve('../localization/inject_translator.js')]; } catch (e) {}
      const { injectTranslator: freshInjectTranslator } = require('../localization/inject_translator.js');
      await freshInjectTranslator();
    }

    if (!state.hasWidget) {
      logSync('[Companion] Внедрение виджета лимитов...');
      try { delete require.cache[require.resolve('../limits_widget/inject_panel.js')]; } catch (e) {}
      const { injectWidget: freshInjectWidget } = require('../limits_widget/inject_panel.js');
      await freshInjectWidget();
    }

    if (state.hasTranslator && state.hasWidget) {
      logSync('[Companion] Компоненты активны: Русификатор [OK], Виджет лимитов [OK].');
    }
  } catch (err) {
    logSync(`[Companion] Ошибка проверки внедрения: ${err.message}`);
  } finally {
    isInjecting = false;
  }
}

async function tryConnect() {
  if (isConnected || isConnecting) return;
  if (!fs.existsSync(activePortFile)) {
    return;
  }

  isConnecting = true;

  try {
    const lines = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
    const port = lines[0].trim();
    if (!port || isNaN(port)) {
      isConnecting = false;
      return;
    }

    const res = await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(1500) });
    const tabs = await res.json();
    const page = tabs.find(t => t.type === 'page' && typeof t.url === 'string' && (t.url.includes('127.0.0.1') || t.url.includes('localhost')) && !t.url.startsWith('data:'))
      || tabs.find(t => t.type === 'page' && typeof t.url === 'string' && !t.url.startsWith('data:') && !t.url.startsWith('devtools:') && !t.url.startsWith('chrome:') && !t.url.startsWith('about:'));

    if (!page || !page.webSocketDebuggerUrl) {
      isConnecting = false;
      return;
    }

    logSync(`[Companion] Обнаружено окно Antigravity (порт ${port}). Подключение постоянного WebSocket...`);
    const ws = new WebSocket(page.webSocketDebuggerUrl);

    ws.onopen = async () => {
      isConnected = true;
      isConnecting = false;
      currentWs = ws;
      logSync(`[Companion] Постоянный канал CDP активен. Подписка на события жизненного цикла окна...`);

      // Subscribe to runtime and navigation events to catch window reloads (Ctrl+R) with 0ms latency
      try {
        ws.send(JSON.stringify({ id: 10, method: 'Runtime.enable' }));
        ws.send(JSON.stringify({ id: 11, method: 'Page.enable' }));
      } catch (e) {}

      // Initial injection check
      await ensureInjected();
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        // Detect page reloads, navigations, or context resets
        if (msg.method === 'Page.frameNavigated' && (!msg.params || !msg.params.frame || msg.params.frame.parentId === undefined)) {
          logSync('[Companion Event] Перезагрузка страницы/навигация. Мгновенная повторная инъекция...');
          if (recheckDebounce) clearTimeout(recheckDebounce);
          recheckDebounce = setTimeout(ensureInjected, 300);
        } else if (msg.method === 'Runtime.executionContextsCleared') {
          logSync('[Companion Event] Контекст очищен (Reload). Мгновенная повторная инъекция...');
          if (recheckDebounce) clearTimeout(recheckDebounce);
          recheckDebounce = setTimeout(ensureInjected, 300);
        }
      } catch (e) {}
    };

    ws.onerror = (err) => {
      // Socket error logged on close
    };

    ws.onclose = () => {
      logSync('[Companion] Окно Antigravity закрыто или перезапускается.');
      isConnected = false;
      isConnecting = false;
      currentWs = null;

      if (exitOnClose) {
        logSync('[Companion] Режим --exit-on-close активен. Завершение процесса службы.');
        process.exit(0);
      } else {
        logSync('[Companion] Переход в энергоэффективный режим ожидания (0% CPU, ожидание запуска Antigravity)...');
      }
    };
  } catch (e) {
    // Port not responding or Antigravity starting up
    isConnecting = false;
  }
}

// Watch filesystem for Antigravity launch (Instant reaction)
function setupFileWatcher() {
  try {
    const agyDir = path.dirname(activePortFile);
    if (!fs.existsSync(agyDir)) {
      try { fs.mkdirSync(agyDir, { recursive: true }); } catch (e) {}
    }
    if (fs.existsSync(agyDir) && !fileWatcher) {
      fileWatcher = fs.watch(agyDir, (eventType, filename) => {
        if (filename === 'DevToolsActivePort') {
          if (!isConnected && !isConnecting) {
            setTimeout(tryConnect, 250);
          }
        }
      });
    }
  } catch (e) {
    // Fallback timer handles it
  }
}

// Low-frequency safety poll (every 5 seconds ONLY when disconnected, zero poll when connected)
setInterval(() => {
  if (!isConnected && !isConnecting) {
    tryConnect();
  }
}, 5000);

process.on('uncaughtException', (err) => {
  logSync(`[Companion Fatal] Uncaught Exception: ${err.stack || err}`);
});
process.on('unhandledRejection', (reason) => {
  logSync(`[Companion Fatal] Unhandled Rejection: ${reason?.stack || reason}`);
});
process.on('exit', (code) => {
  logSync(`[Companion Exit] Process exiting with code: ${code}`);
});

// Start local HTTP configuration sync server (port 9229)
const { startServer: startConfigServer } = require('./companion_server.js');
try {
  startConfigServer();
} catch (e) {
  logSync(`[Config Server] Note: ${e.message}`);
}

setupFileWatcher();
tryConnect();

// OTA (Over-The-Air) Silent Background Auto-Updater
const { runSilentOtaCheck } = require('./updater.js');
setTimeout(() => {
  runSilentOtaCheck(logSync).catch(() => {});
}, 45000);
setInterval(() => {
  runSilentOtaCheck(logSync).catch(() => {});
}, 3600000);

logSync('[Antigravity Companion Service v2.0] Реактивный супервизор и фоновый OTA-автоапдейтер активны.');

module.exports = { tryConnect, ensureInjected, checkAndInject: tryConnect };
