#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { processVoiceText } = require('./voice_text_processor');
const { loadConfig, saveConfig } = require('../config/companion_config');

const PORT = 9228;

async function getCDPEndpoint() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(activePortFile)) {
    throw new Error('DevToolsActivePort не найден. Antigravity не запущен.');
  }

  const lines = fs.readFileSync(activePortFile, 'utf8').trim().split(/\r?\n/);
  const port = lines[0].trim();
  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
  const page = tabs.find(t => t.type === 'page' && typeof t.url === 'string' && (t.url.includes('127.0.0.1') || t.url.includes('localhost')) && !t.url.startsWith('data:'))
    || tabs.find(t => t.type === 'page' && typeof t.url === 'string' && !t.url.startsWith('data:') && !t.url.startsWith('devtools:') && !t.url.startsWith('chrome:') && !t.url.startsWith('about:'));
  if (!page) {
    throw new Error(`Страница Antigravity не найдена на порту ${port}`);
  }

  return { port, wsUrl: page.webSocketDebuggerUrl };
}

function evaluate(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('CDP таймаут (5 сек)'));
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
        ws.close();
        if (data.result?.exceptionDetails) {
          reject(new Error(data.result.exceptionDetails.text || 'Ошибка выполнения в CDP'));
        } else {
          resolve(data.result?.result?.value);
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

// Check if Antigravity is currently recording
async function isRecording() {
  const { wsUrl } = await getCDPEndpoint();
  return await evaluate(wsUrl, `(() => {
    const btn = document.querySelector('[data-tooltip-id="input-send-button-record-tooltip"]');
    if (!btn) return false;
    const aria = btn.getAttribute('aria-label') || '';
    const cls = btn.className || '';
    return cls.includes('bg-red-500') || /stop/i.test(aria) || /останов/i.test(aria);
  })()`);
}

// Start voice recording
async function startVoice() {
  const { wsUrl } = await getCDPEndpoint();
  return await evaluate(wsUrl, `(() => {
    const btn = document.querySelector('[data-tooltip-id="input-send-button-record-tooltip"]');
    if (!btn) throw new Error('Кнопка микрофона не найдена в интерфейсе');
    const aria = btn.getAttribute('aria-label') || '';
    const cls = btn.className || '';
    const isRec = cls.includes('bg-red-500') || /stop/i.test(aria) || /останов/i.test(aria);
    if (!isRec) {
      btn.click();
    }
    return { status: 'recording' };
  })()`);
}

// Stop voice recording and extract transcribed text
async function stopVoice() {
  const { wsUrl } = await getCDPEndpoint();
  const rawResult = await evaluate(wsUrl, `(async () => {
    const btn = document.querySelector('[data-tooltip-id="input-send-button-record-tooltip"]');
    if (!btn) throw new Error('Кнопка микрофона не найдена');

    const aria = btn.getAttribute('aria-label') || '';
    const cls = btn.className || '';
    const isRec = cls.includes('bg-red-500') || /stop/i.test(aria) || /останов/i.test(aria);

    if (isRec) {
      btn.click();
    }

    // Wait for transcription to finalize (up to 3.5 seconds)
    const editor = document.querySelector('[contenteditable="true"]');
    let text = '';
    const start = Date.now();

    while (Date.now() - start < 3500) {
      await new Promise(r => setTimeout(r, 150));
      if (editor) {
        text = editor.innerText.trim();
        if (text) break;
      }
      const curCls = btn.className || '';
      const curAria = btn.getAttribute('aria-label') || '';
      const stillRec = curCls.includes('bg-red-500') || /stop/i.test(curAria) || /останов/i.test(curAria);
      if (!stillRec && text) break;
    }

    // Clear editor so chat remains empty
    if (editor && editor.__lexicalEditor) {
      try {
        editor.__lexicalEditor.update(() => {
          const state = editor.__lexicalEditor._pendingEditorState || editor.__lexicalEditor._editorState;
          const root = state?._nodeMap?.get('root');
          if (root) root.clear();
        });
      } catch (e) {
        editor.innerText = '';
      }
    } else if (editor) {
      editor.innerText = '';
    }

    return { status: 'completed', text: text || '' };
  })()`);

  const config = loadConfig();
  const rawText = rawResult?.text || '';
  const formattedText = processVoiceText(rawText, {
    smartPunctuation: config.voice?.smartPunctuation !== false,
    autoCapitalize: config.voice?.autoCapitalize !== false
  });

  return {
    status: rawResult?.status || 'completed',
    text: formattedText,
    rawText: rawText
  };
}

// Toggle voice recording
async function toggleVoice() {
  const recording = await isRecording();
  if (recording) {
    const res = await stopVoice();
    return { action: 'stopped', text: res.text, rawText: res.rawText };
  } else {
    await startVoice();
    return { action: 'started', text: '' };
  }
}

// Start HTTP bridge server
function startServer() {
  const server = http.createServer(async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
      if (url.pathname === '/voice/start') {
        const result = await startVoice();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      } else if (url.pathname === '/voice/stop') {
        const result = await stopVoice();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      } else if (url.pathname === '/voice/toggle') {
        const result = await toggleVoice();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result }));
      } else if (url.pathname === '/voice/status') {
        const recording = await isRecording();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, isRecording: recording }));
      } else if (url.pathname === '/settings/open') {
        const psFile = path.join(__dirname, 'settings_window.ps1');
        spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-File', psFile], {
          detached: true,
          stdio: 'ignore'
        }).unref();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Settings window opened' }));
      } else if (url.pathname === '/config') {
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, config: loadConfig() }));
        } else if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);
              const saved = saveConfig(parsed);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, config: saved }));
            } catch (e) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: e.message }));
            }
          });
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint not found' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Voice Bridge] Сервер запущен: http://127.0.0.1:${PORT}`);
  });

  return server;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    console.log('Тестирование голосового моста CDP...');
    console.log('[1/3] Проверка статуса записи:');
    const rec = await isRecording();
    console.log('Текущий статус записи:', rec ? 'ИДЕТ' : 'ВЫКЛЮЧЕНА');

    console.log('[2/3] Тестовый старт записи...');
    await startVoice();
    console.log('Запись успешно запущена (красный микрофон).');

    console.log('[3/3] Ожидание 1 сек и остановка записи...');
    await new Promise(r => setTimeout(r, 1000));
    const stopped = await stopVoice();
    console.log('Запись успешно остановлена. Результат:', JSON.stringify(stopped));
    console.log('✓ Тест голосового моста успешно пройден!');
    process.exit(0);
  }

  startServer();
}

if (require.main === module) {
  main().catch(err => {
    console.error('[Voice Bridge Error]', err.message);
    process.exit(1);
  });
}

module.exports = { startVoice, stopVoice, toggleVoice, isRecording, startServer };
