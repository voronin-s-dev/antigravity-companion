const fs = require('fs');
const path = require('path');

// Safe background logging (captures logs to %APPDATA%\AntigravityCompanion\companion.log and prevents crashes in headless mode)
const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
const compDir = path.join(appData, 'AntigravityCompanion');
const origOut = process.stdout.write ? process.stdout.write.bind(process.stdout) : null;
const origErr = process.stderr.write ? process.stderr.write.bind(process.stderr) : null;

try {
  if (!fs.existsSync(compDir)) fs.mkdirSync(compDir, { recursive: true });
} catch (e) {}

const logSync = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(path.join(compDir, 'companion.log'), line);
  } catch (e) {}
  if (process.stdout.isTTY && origOut) {
    try {
      origOut(line);
    } catch (e) {}
  }
};

// Self-healing Windows Autostart: ensure Startup shortcut & Registry key exist without manual intervention
function ensureAutostart() {
  if (process.platform !== 'win32') return;
  try {
    const startupDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const shortcutPath = path.join(startupDir, 'AntigravityCompanion.lnk');
    const baseDir = path.resolve(__dirname);
    const startPs = path.join(baseDir, 'start_silent.ps1');

    if (!fs.existsSync(shortcutPath) && fs.existsSync(startPs)) {
      const { spawn } = require('child_process');
      const cp = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', startPs], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      cp.unref();
    }
  } catch (_) {}
}

// Self-healing Antigravity shortcuts: ensures --remote-debugging-port=0 is present (persists through IDE auto-updates)
function ensureAntigravityShortcuts() {
  if (process.platform !== 'win32') return;
  try {
    const baseDir = path.resolve(__dirname);
    const fixScript = path.join(baseDir, 'fix_shortcuts.ps1');
    if (fs.existsSync(fixScript)) {
      const { spawn } = require('child_process');
      const cp = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fixScript], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      cp.unref();
    }
  } catch (_) {}
}

let shimManager = null;
try {
  shimManager = require('./shim_manager.js');
} catch (_) {}

let lastAutoHealAttempt = 0;
let unshimmedRunningCount = 0;

function selfHealUnshimmedHost() {
  if (process.platform !== 'win32' || !shimManager) return;
  // Guard: Only fire if Antigravity is actively running without an active CDP connection
  if (!shimManager.isAntigravityRunning() || isConnected || isConnecting) {
    unshimmedRunningCount = 0;
    return;
  }

  unshimmedRunningCount++;
  // Wait at least 3 checks (~15 seconds) so normal shortcut launches have time to open DevToolsActivePort
  if (unshimmedRunningCount < 3) return;

  // Circuit breaker: max 1 auto-restart per 10 minutes to prevent loops
  const now = Date.now();
  if (now - lastAutoHealAttempt < 600000) return;
  lastAutoHealAttempt = now;
  unshimmedRunningCount = 0;

  logSync('[Companion Auto-Heal] Обнаружен запуск Antigravity без порта отладки (например, после обновления IDE). Выполняется чистый перезапуск...');

  try {
    const baseDir = path.resolve(__dirname);
    const restartScript = path.join(baseDir, 'clean_restart.ps1');
    if (fs.existsSync(restartScript)) {
      const { spawn } = require('child_process');
      const cp = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', restartScript], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      cp.unref();
    }
  } catch (e) {
    logSync(`[Companion Auto-Heal Error] ${e.message}`);
  }
}

function ensureCleanHostBinary() {
  if (process.platform !== 'win32' || !shimManager) return;
  try {
    if (shimManager.isShimInstalled() && !shimManager.isAntigravityRunning()) {
      const res = shimManager.uninstallShim();
      if (res && res.restored) {
        logSync('[Companion] Удален лаунчер-шим: восстановлен оригинальный Antigravity.exe.');
      }
    }
  } catch (_) {}
}

const { injectWidget } = require('../limits_widget/inject_panel.js');
const { injectTranslator } = require('../localization/inject_translator.js');

// Dynamically locate DevToolsActivePort in current user's AppData
const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');

const exitOnClose = process.argv.includes('--exit-on-close') || process.env.AGY_EXIT_ON_CLOSE === 'true';

let currentWs = null;
let currentPort = null;
let primaryTargetId = null;
let isConnecting = false;
let isConnected = false;
let isInjecting = false;
let fileWatcher = null;
let recheckDebounce = null;
let lastHealthStateOk = false;
let missingPortWarned = false;

function resetConnection() {
  if (currentWs) {
    try { currentWs.close(); } catch (e) {}
    currentWs = null;
  }
  isConnected = false;
  isConnecting = false;
  currentPort = null;
  primaryTargetId = null;
  lastHealthStateOk = false;
}

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
      hasWidget: !!document.getElementById('agy-sidebar-limits-btn') || (!!document.getElementById('agy-limits-tooltip') && !!document.getElementById('agy-limits-floating-panel')),
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
      if (!lastHealthStateOk) {
        logSync('[Companion] Компоненты активны: Русификатор [OK], Виджет лимитов [OK].');
        lastHealthStateOk = true;
      }
    } else {
      lastHealthStateOk = false;
    }

    // Ensure secondary windows, webviews, and plugin iframes (e.g., Swarm Board) are also translated
    await ensureSecondaryTargetsTranslated();
  } catch (err) {
    logSync(`[Companion] Ошибка проверки внедрения: ${err.message}`);
    resetConnection();
  } finally {
    isInjecting = false;
  }
}

async function ensureSecondaryTargetsTranslated() {
  if (!currentPort) return;
  try {
    const res = await fetch(`http://127.0.0.1:${currentPort}/json`, { signal: AbortSignal.timeout(1200) });
    const tabs = await res.json();
    const { isInjectableTarget } = require('../localization/inject_translator.js');
    const secondary = tabs.filter(t => isInjectableTarget(t) && t.id !== primaryTargetId);
    for (const target of secondary) {
      let hasTranslator = false;
      try {
        hasTranslator = await new Promise((resolve) => {
          const ws = new WebSocket(target.webSocketDebuggerUrl);
          const tm = setTimeout(() => { try { ws.close(); } catch (_) {} resolve(true); }, 1200);
          ws.onopen = () => {
            ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '!!window.__agyTranslatorActive', returnByValue: true } }));
          };
          ws.onmessage = (evt) => {
            try {
              const msg = JSON.parse(evt.data);
              if (msg.id === 1) {
                clearTimeout(tm);
                try { ws.close(); } catch (_) {}
                resolve(Boolean(msg.result?.result?.value));
              }
            } catch (_) {}
          };
          ws.onerror = () => { clearTimeout(tm); resolve(true); };
        });
      } catch (_) {
        hasTranslator = true;
      }

      if (!hasTranslator) {
        logSync(`[Companion] Обнаружена вторичная цель (${target.type}): ${target.url.slice(0, 80)}. Внедрение русификатора...`);
        try { delete require.cache[require.resolve('../localization/inject_translator.js')]; } catch (_) {}
        const { injectTranslator: freshInjectTranslator } = require('../localization/inject_translator.js');
        await freshInjectTranslator(target.id);
      }
    }
  } catch (_) {}
}

async function tryConnect() {
  if (isConnected || isConnecting) return;
  if (!fs.existsSync(activePortFile)) {
    return;
  }

  isConnecting = true;

  try {
    const lines = fs.readFileSync(activePortFile, 'utf8').trim().split(/\r?\n/);
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
      currentPort = port;
      primaryTargetId = page.id || null;
      missingPortWarned = false;
      logSync(`[Companion] Постоянный канал CDP активен (порт ${port}). Подписка на события жизненного цикла окна...`);

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

    ws.onerror = () => {
      // Socket error logged on close
    };

    ws.onclose = () => {
      lastHealthStateOk = false;
      logSync('[Companion] Окно Antigravity закрыто или перезапускается.');
      resetConnection();

      if (exitOnClose) {
        logSync('[Companion] Режим --exit-on-close активен. Завершение процесса службы.');
        process.exit(0);
      } else {
        logSync('[Companion] Переход в энергоэффективный режим ожидания (0% CPU, ожидание запуска Antigravity)...');
        setTimeout(ensureCleanHostBinary, 1200);
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
        if (!filename || filename === 'DevToolsActivePort') {
          let newPort = null;
          try {
            if (fs.existsSync(activePortFile)) {
              newPort = fs.readFileSync(activePortFile, 'utf8').trim().split(/\r?\n/)[0].trim();
            }
          } catch (e) {}

          if (newPort && currentPort && newPort !== currentPort) {
            logSync(`[Companion] DevToolsActivePort обновлен (${currentPort} -> ${newPort}). Переподключение...`);
            resetConnection();
            setTimeout(tryConnect, 250);
          } else if (!isConnected && !isConnecting) {
            setTimeout(tryConnect, 250);
          }
        }
      });

      fileWatcher.on('error', () => {
        try { fileWatcher.close(); } catch (_) {}
        fileWatcher = null;
        setTimeout(setupFileWatcher, 3000);
      });
    }
  } catch (e) {
    // Fallback timer handles it
  }
}

// Continuous health monitor: reconnects when disconnected, verifies port and UI when connected
let missingPortChecks = 0;
setInterval(() => {
  if (!isConnected && !isConnecting) {
    if (!fs.existsSync(activePortFile)) {
      missingPortChecks++;
      if (!missingPortWarned || missingPortChecks % 6 === 0) {
        ensureAntigravityShortcuts();
        missingPortWarned = true;
      }
    }
    // Restore original Antigravity.exe if a legacy shim is still present while IDE is closed
    if (shimManager && shimManager.isShimInstalled() && !shimManager.isAntigravityRunning()) {
      ensureCleanHostBinary();
    }
    // Self-heal: If Antigravity was launched without debug port (e.g. after IDE update), auto-restart cleanly
    if (shimManager && shimManager.isAntigravityRunning()) {
      selfHealUnshimmedHost();
    }
    tryConnect();
  } else if (isConnected && !isInjecting) {
    unshimmedRunningCount = 0;
    missingPortWarned = false;
    missingPortChecks = 0;
    let diskPort = null;
    try {
      if (fs.existsSync(activePortFile)) {
        diskPort = fs.readFileSync(activePortFile, 'utf8').trim().split(/\r?\n/)[0].trim();
      }
    } catch (e) {}

    if (diskPort && currentPort && diskPort !== currentPort) {
      logSync(`[Companion] Порт Antigravity изменился (${currentPort} -> ${diskPort}). Переподключение...`);
      resetConnection();
      tryConnect();
      return;
    }

    // Verify UI components are still alive and injected
    ensureInjected().catch((err) => {
      logSync(`[Companion] Ошибка верификации компонентов: ${err.message}. Сброс сокета...`);
      resetConnection();
    });
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

ensureAutostart();
ensureAntigravityShortcuts();
ensureCleanHostBinary();
setupFileWatcher();
tryConnect();

// OTA (Over-The-Air) Silent Background Auto-Updater & Queue Sync
const { runSilentOtaCheck } = require('./updater.js');
setTimeout(() => {
  runSilentOtaCheck(logSync).catch(() => {});
}, 10000);
setInterval(() => {
  runSilentOtaCheck(logSync).catch(() => {});
}, 1800000);

logSync('[Antigravity Companion Service v2.0] Реактивный супервизор и двусторонняя OTA-синхронизация активны.');

module.exports = { tryConnect, ensureInjected, checkAndInject: tryConnect };
