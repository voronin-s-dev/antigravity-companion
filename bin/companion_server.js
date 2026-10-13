/**
 * Antigravity Companion: Local Configuration & Control Server
 * Предоставляет локальный HTTP API на порту 9229 для:
 * - надёжного сохранения настроек в %APPDATA%
 * - горячей перезагрузки UI (Hot-Reload)
 * - проверки и применения обновлений словаря и приложения
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { loadConfig, saveConfig } = require('../config/companion_config.js');

const PORT = 9229;
const HOST = '127.0.0.1';

let server = null;

function isAllowedHost(host) {
  if (!host) return true;
  const cleanHost = host.toLowerCase().trim();
  return (
    cleanHost === `127.0.0.1:${PORT}` ||
    cleanHost === `localhost:${PORT}` ||
    cleanHost === '127.0.0.1' ||
    cleanHost === 'localhost'
  );
}

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost') return true;
    if (url.protocol === 'vscode-file:' || url.protocol === 'vscode-webview:') return true;
  } catch (e) {
    return false;
  }
  return false;
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function startServer() {
  if (server) return server;

  server = http.createServer(async (req, res) => {
    // DNS Rebinding protection
    if (!isAllowedHost(req.headers.host)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Forbidden: Invalid Host header (DNS Rebinding protection)' }));
      return;
    }

    // CSRF / Cross-Origin protection
    if (!isAllowedOrigin(req.headers.origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Forbidden: Untrusted Origin' }));
      return;
    }

    setCorsHeaders(req, res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || '';

    // Health
    if (url === '/api/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
      return;
    }

    // Status
    if (url === '/api/status' && req.method === 'GET') {
      try {
        const pkg = require('../package.json');
        const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
        const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
        const isAgyRunning = fs.existsSync(activePortFile);
        let cdpPort = null;
        if (isAgyRunning) {
          try {
            cdpPort = fs.readFileSync(activePortFile, 'utf8').trim().split('\n')[0].trim();
          } catch (e) {}
        }

        const dictPath = path.join(__dirname, '..', 'localization', 'dictionary_ru.json');
        let termsCount = 0;
        try {
          const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
          termsCount = Object.keys(dict.exact || {}).length;
        } catch (e) {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          version: pkg.version,
          termsCount,
          antigravityRunning: isAgyRunning,
          cdpPort,
          companionPid: process.pid
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // Config GET / POST
    if (url === '/api/config') {
      if (req.method === 'GET') {
        const conf = loadConfig();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, config: conf.limits }));
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
          if (body.length > 10 * 1024 * 1024) { // limit 10MB (for custom audio data URLs)
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
            req.destroy();
          }
        });

        req.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const saved = saveConfig(parsed);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, config: saved.limits }));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
        });
        return;
      }
    }

    // Collect Untranslated Strings from Runtime
    if (url === '/api/collect-untranslated' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 2 * 1024 * 1024) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Payload too large' }));
          req.destroy();
        }
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const incoming = Array.isArray(parsed.strings) ? parsed.strings : [];
          if (!incoming.length) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, added: 0 }));
            return;
          }

          const dictPath = path.join(__dirname, '..', 'localization', 'dictionary_ru.json');
          const queuePath = path.join(__dirname, '..', 'localization', 'untranslated_queue.json');
          const { isStrictUiString } = require('../localization/sanitize_queue.js');

          let dict = { exact: {}, attributes: {}, patterns: [] };
          try {
            dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
          } catch (e) {}

          let currentQueue = [];
          try {
            if (fs.existsSync(queuePath)) {
              currentQueue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
            }
          } catch (e) {}
          if (!Array.isArray(currentQueue)) currentQueue = [];

          const queueSet = new Set(currentQueue);
          let addedCount = 0;
          let changedQueue = false;

          for (const item of incoming) {
            const clean = typeof item === 'string' ? item.trim() : '';
            if (!isStrictUiString(clean, dict)) continue;

            if (!queueSet.has(clean)) {
              queueSet.add(clean);
              currentQueue.push(clean);
              addedCount++;
              changedQueue = true;
            } else {
              // Продвигаем реально встреченную на экране строку в конец очереди (приоритет LIFO),
              // если она ранее лежала в глубине статического бандла
              const idx = currentQueue.indexOf(clean);
              if (idx !== -1 && idx < currentQueue.length - 50) {
                currentQueue.splice(idx, 1);
                currentQueue.push(clean);
                changedQueue = true;
              }
            }
          }

          if (changedQueue) {
            // 1. Мгновенная синхронная запись на диск (0 мс потерь при внезапном выключении ПК)
            fs.writeFileSync(queuePath, JSON.stringify(currentQueue, null, 2) + '\n', 'utf8');
            // 2. Реактивная отправка очереди в GitHub через 25 секунд тишины
            if (global.__agyQueueSyncTimer) clearTimeout(global.__agyQueueSyncTimer);
            global.__agyQueueSyncTimer = setTimeout(() => {
              try {
                const { runSilentOtaCheck } = require('./updater.js');
                runSilentOtaCheck().catch(() => {});
              } catch (e) {}
            }, 25000);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            added: addedCount,
            totalQueue: currentQueue.length
          }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // Hot Reload
    if (url === '/api/reload' && req.method === 'POST') {
      try {
        const { injectTranslator } = require('../localization/inject_translator.js');
        const { injectWidget } = require('../limits_widget/inject_panel.js');
        await injectTranslator();
        await injectWidget();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'UI Antigravity успешно перезагружен на лету!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // Check updates (both dictionary and full app)
    if (url === '/api/check-update' && (req.method === 'GET' || req.method === 'POST')) {
      try {
        const { checkForUpdates } = require('./updater.js');
        const result = await checkForUpdates();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // Apply updates (auto-detects app update vs dictionary update)
    if (url === '/api/apply-update' && req.method === 'POST') {
      try {
        const { checkForUpdates, applyUpdates, applyAppUpdate } = require('./updater.js');
        const status = await checkForUpdates();
        let result;
        if (status.hasAppUpdate) {
          result = await applyAppUpdate();
        } else {
          result = await applyUpdates();
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        const status = err.message && err.message.includes('заморожены') ? 403 : 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // Explicit App Update endpoint
    if (url === '/api/apply-app-update' && req.method === 'POST') {
      try {
        const { applyAppUpdate } = require('./updater.js');
        const result = await applyAppUpdate();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        const status = err.message && err.message.includes('заморожены') ? 403 : 500;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Config Server] Порт ${PORT} уже используется другим процессом Companion.`);
    } else {
      console.warn('[Config Server Error]', err.message);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[Config Server] HTTP API запущен на http://${HOST}:${PORT}`);
  });

  return server;
}

function stopServer() {
  if (server) {
    server.close();
    server = null;
  }
}

module.exports = {
  startServer,
  stopServer,
  PORT,
  isAllowedHost,
  isAllowedOrigin
};
