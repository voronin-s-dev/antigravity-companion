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

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function startServer() {
  if (server) return server;

  server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

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

    // Check updates
    if (url === '/api/check-update' && (req.method === 'GET' || req.method === 'POST')) {
      try {
        const pkg = require('../package.json');
        let gitBehind = 0;
        let hasGitUpdate = false;
        try {
          execSync('git fetch origin', { timeout: 6000, stdio: 'ignore' });
          const behind = execSync('git rev-list HEAD..origin/main --count', { timeout: 4000 }).toString().trim();
          gitBehind = parseInt(behind, 10) || 0;
          hasGitUpdate = gitBehind > 0;
        } catch (e) {}

        const dictPath = path.join(__dirname, '..', 'localization', 'dictionary_ru.json');
        let localTerms = 0;
        try {
          const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
          localTerms = Object.keys(dict.exact || {}).length;
        } catch (e) {}

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          currentVersion: pkg.version,
          localTerms,
          hasUpdate: hasGitUpdate,
          behindCommits: gitBehind
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }

    // Apply updates
    if (url === '/api/apply-update' && req.method === 'POST') {
      try {
        execSync('git pull --ff-only origin main', { timeout: 15000, stdio: 'ignore' });
        const { injectTranslator } = require('../localization/inject_translator.js');
        const { injectWidget } = require('../limits_widget/inject_panel.js');
        await injectTranslator();
        await injectWidget();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Обновления успешно установлены и применены на лету!' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
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
  PORT
};
