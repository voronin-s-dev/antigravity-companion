/**
 * Antigravity Companion: Local Configuration & Sync Server
 * Предоставляет локальный HTTP API на порту 9229 для надёжного сохранения настроек в %APPDATA%
 */

const http = require('http');
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

  server = http.createServer((req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url || '';

    if (url === '/api/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', time: Date.now() }));
      return;
    }

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
