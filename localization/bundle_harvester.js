#!/usr/bin/env node
/**
 * Antigravity Companion: Static Bundle Harvester
 * Сканирует веб-бандл Antigravity (main.js) напрямую из Language Server
 * и извлекает все строковые UI-литералы React-компонентов для опережающего перевода.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

async function getBundleUrl() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(activePortFile)) {
    throw new Error('Antigravity не запущен или DevToolsActivePort не найден.');
  }

  const lines = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
  const port = lines[0].trim();

  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
  const page = tabs.find(t => t.type === 'page' && typeof t.url === 'string' && (t.url.includes('127.0.0.1') || t.url.includes('localhost')) && !t.url.startsWith('data:'))
    || tabs.find(t => t.type === 'page' && typeof t.url === 'string' && !t.url.startsWith('data:') && !t.url.startsWith('devtools:') && !t.url.startsWith('chrome:') && !t.url.startsWith('about:'));

  if (!page) {
    throw new Error('Страница Antigravity не найдена в списке CDP-вкладок.');
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  return new Promise((resolve, reject) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: 'Array.from(document.scripts).map(s => s.src).find(s => s.includes("/main.js"))',
          returnByValue: true
        }
      }));
    };
    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === 1) {
        ws.close();
        const url = data.result?.result?.value;
        if (!url) reject(new Error('URL main.js не найден в document.scripts'));
        else resolve(url);
      }
    };
    ws.onerror = reject;
  });
}

function downloadBundle(url) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https:');
    const client = isHttps ? https : http;
    const req = client.get(url, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} при скачивании ${url}`));
        return;
      }
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
  });
}

function isUIStringCandidate(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  if (s.length < 3 || s.length > 120) return false;
  // Должен содержать латиницу и буквы
  if (!/[A-Za-z]/.test(s)) return false;
  // Исключаем чисто технический мусор
  if (/^(https?:\/\/|file:\/\/|\/|[A-Za-z]:\\)/i.test(s)) return false;
  if (/^[a-f0-9]{32,64}$/i.test(s)) return false;
  if (/^(Ctrl|Alt|Shift|Cmd|Meta|Enter|Esc|Space|Tab|\+)+/i.test(s)) return false;
  if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|ts|tsx|jsx|json|md|py|sh|ps1|exe|dll)$/i.test(s)) return false;
  if (/^#?[0-9a-fA-F]{3,8}$/.test(s)) return false;
  if (/^[0-9+\-.,:;!?()\/\\%\s]+$/.test(s)) return false;
  if (/^(rgb|rgba|hsl|hsla|calc|var)\(/i.test(s)) return false;
  if (/^(px|rem|em|vh|vw|%|s|ms)$/i.test(s)) return false;
  if (/^(use[A-Z]|get[A-Z]|set[A-Z]|is[A-Z]|has[A-Z])/i.test(s)) return false;
  if (/^[a-z]+([A-Z][a-z0-9]+)+$/.test(s)) return false; // camelCase идентификаторы
  if (/^[A-Z_0-9]{3,}$/.test(s)) return false; // CONSTANTS_UPPERCASE
  if (/[{}[\]<>=`$\\]/.test(s)) return false; // фрагменты кода и синтаксиса
  if (/^(function|return|typeof|instanceof|import|export|class|const|let|var|switch|case|default|break|continue|throw|catch|finally|async|await|package|interface)$/.test(s)) return false;

  // Должен выглядеть как человекочитаемый текст:
  // Содержит хотя бы один пробел, либо начинается с заглавной буквы
  const hasSpace = /\s/.test(s);
  const startsWithUpper = /^[A-Z]/.test(s);
  return hasSpace || (startsWithUpper && s.length >= 4);
}

async function harvestBundle() {
  console.log('[Bundle Harvester] Поиск активного бандла Antigravity...');
  const bundleUrl = await getBundleUrl();
  console.log(`[Bundle Harvester] Загрузка бандла: ${bundleUrl}`);

  const bundleCode = await downloadBundle(bundleUrl);
  console.log(`[Bundle Harvester] Загружено ${(bundleCode.length / 1024 / 1024).toFixed(2)} МБ кода. Анализ литералов...`);

  // Загружаем текущий словарь
  const dictPath = path.resolve(__dirname, 'dictionary_ru.json');
  const queuePath = path.resolve(__dirname, 'untranslated_queue.json');
  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

  let currentQueue = [];
  if (fs.existsSync(queuePath)) {
    try {
      currentQueue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    } catch (e) {}
  }
  const queueSet = new Set(currentQueue);

  // Регулярные выражения для поиска UI-литералов в JSX / свойствах объектов
  const candidates = new Set();

  // 1. Свойства типа title: "...", label: "...", placeholder: "...", tooltip: "...", ariaLabel: "..."
  const propRegex = /(?:title|label|placeholder|tooltip|header|heading|aria-label|ariaLabel|buttonText|description|message|hint|emptyText|fallback)\s*:\s*(["'])(.+?)\1/g;
  let match;
  while ((match = propRegex.exec(bundleCode)) !== null) {
    const val = match[2];
    if (isUIStringCandidate(val)) candidates.add(val.trim());
  }

  // 2. JSX строковые дети и литералы в одинарных/двойных кавычках с человекочитаемыми фразами
  const stringLiteralRegex = /"(?:[A-Z][a-zA-Z0-9' -]{3,60})"/g;
  while ((match = stringLiteralRegex.exec(bundleCode)) !== null) {
    const val = match[0].slice(1, -1);
    if (isUIStringCandidate(val)) candidates.add(val.trim());
  }

  console.log(`[Bundle Harvester] Найдено ${candidates.size} потенциальных UI-строк в бандле.`);

  let newUntranslated = 0;
  for (const str of candidates) {
    if (dict.exact && dict.exact[str]) continue;
    if (dict.attributes && dict.attributes[str]) continue;
    if (dict.patterns && dict.patterns.length) {
      let matched = false;
      for (const p of dict.patterns) {
        try {
          if (new RegExp(p.regex).test(str)) { matched = true; break; }
        } catch (e) {}
      }
      if (matched) continue;
    }

    if (!queueSet.has(str)) {
      queueSet.add(str);
      currentQueue.push(str);
      newUntranslated++;
    }
  }

  if (newUntranslated > 0) {
    fs.writeFileSync(queuePath, JSON.stringify(currentQueue, null, 2), 'utf8');
    console.log(`✓ [Bundle Harvester] Добавлено ${newUntranslated} новых строк в untranslated_queue.json (Всего в очереди: ${currentQueue.length})`);
  } else {
    console.log(`✓ [Bundle Harvester] Все строки из бандла уже присутствуют в словаре или очереди!`);
  }
}

if (require.main === module) {
  harvestBundle().catch(err => {
    console.error('✗ Ошибка сканирования бандла:', err.message);
    process.exit(1);
  });
}

module.exports = { harvestBundle };
