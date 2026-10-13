#!/usr/bin/env node
/**
 * Antigravity Companion: Autonomous AI Translator & Publisher
 * Автоматически читает накопленную очередь untranslated_queue.json,
 * переводит пакет строк через Gemini API, валидирует слияние и тесты,
 * и при необходимости автоматически публикует изменения в GitHub.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

function loadEnvFile() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnvFile();

const queuePath = path.resolve(__dirname, 'untranslated_queue.json');
const mergeSourcePath = path.resolve(__dirname, 'translations_to_merge.json');
const dictPath = path.resolve(__dirname, 'dictionary_ru.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function callGemini(apiKey, prompt, model = 'gemini-3.5-flash') {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 65000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`Gemini API HTTP ${res.statusCode}: ${data}`));
        }
        try {
          const json = JSON.parse(data);
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!text) return reject(new Error('Пустой ответ от Gemini API'));
          resolve(JSON.parse(text));
        } catch (e) {
          reject(new Error(`Ошибка парсинга ответа Gemini: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Таймаут запроса к Gemini API')); });
    req.write(payload);
    req.end();
  });
}

async function translateChunkWithRetry(apiKey, prompt) {
  const models = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
  let lastErr = null;
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await callGemini(apiKey, prompt, model);
      } catch (err) {
        lastErr = err;
        const isRateLimit = /HTTP 429|RESOURCE_EXHAUSTED/i.test(err.message);
        if (isRateLimit && attempt === 1) {
          console.warn(`[Auto-Translate] Лимит запросов на ${model}, ожидание 15 сек и повтор...`);
          await sleep(15000);
          continue;
        }
        console.warn(`[Auto-Translate] Переключение с ${model} (${err.message.slice(0, 120)})...`);
        break;
      }
    }
  }
  throw lastErr || new Error('Все модели Gemini недоступны');
}

async function autoTranslate({ max = 10000, batchSize = 150, publish = false, dryRun = false } = {}) {
  if (!fs.existsSync(queuePath)) {
    console.log('[Auto-Translate] Очередь untranslated_queue.json не найдена.');
    return { translatedCount: 0 };
  }

  let queue = [];
  try {
    const { sanitizeQueue } = require('./sanitize_queue.js');
    const sanitized = sanitizeQueue();
    queue = sanitized.queue;
  } catch (e) {
    try {
      queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    } catch (err) {
      console.error('[Auto-Translate] Ошибка чтения untranslated_queue.json:', err.message);
      return { translatedCount: 0 };
    }
  }

  if (!Array.isArray(queue) || queue.length === 0) {
    console.log('[Auto-Translate] Очередь непереведенных строк пуста!');
    return { translatedCount: 0 };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('\x1b[33m[Auto-Translate] Внимание: переменная GEMINI_API_KEY не задана!\x1b[0m');
    console.log('Создайте файл .env с ключом (GEMINI_API_KEY=AIzaSy...) для полностью автономного перевода.');
    console.log('Бесплатный ключ доступен на https://aistudio.google.com/');
    return { translatedCount: 0, missingApiKey: true };
  }

  // Переводим ВСЮ очередь целиком без дробления по дням, начиная с самых свежих строк с экрана (хвост), затем весь остальной массив
  const prioritized = Array.from(new Set([...queue.slice(-200).reverse(), ...queue]));
  const itemsToProcess = max > 0 ? prioritized.slice(0, max) : prioritized;
  const totalBatches = Math.ceil(itemsToProcess.length / batchSize);
  console.log(`[Auto-Translate] Всего в очереди: ${queue.length} строк. Перевод ${itemsToProcess.length} строк за один прогон (${totalBatches} батчей по ${batchSize})...`);
  const totalTranslations = {};

  for (let i = 0; i < itemsToProcess.length; i += batchSize) {
    const batchNum = Math.floor(i / batchSize) + 1;
    const chunk = itemsToProcess.slice(i, i + batchSize);
    console.log(`[Auto-Translate] Перевод батча ${batchNum}/${totalBatches} (${chunk.length} строк)...`);

    const prompt = `You are a professional software localization translator for Google Antigravity IDE (VS Code / Electron based AI coding tool).
Translate the following array of English UI strings into clean, accurate Russian:
${JSON.stringify(chunk, null, 2)}

Rules:
1. Technical precision: use established developer terminology (e.g. "Terminal" -> "Терминал", "Code Search" -> "Поиск по коду", "New Tab" -> "Новая вкладка").
2. Preserve placeholders ({0}, %s, etc.), symbols, and punctuation.
3. Return ONLY a JSON object mapping each English string to its Russian translation.
Format: { "English": "Русский" }`;

    try {
      const result = await translateChunkWithRetry(apiKey, prompt);
      if (typeof result === 'object' && result !== null) {
        for (const [k, v] of Object.entries(result)) {
          if (typeof v === 'string' && v.trim()) {
            totalTranslations[k] = v.trim();
          }
        }
      }
      // Пауза 4 сек между батчами для соблюдения RPM бесплатного тарифа Gemini API
      if (i + batchSize < itemsToProcess.length) {
        await sleep(4000);
      }
    } catch (err) {
      console.error(`[Auto-Translate] Остановка на батче ${batchNum} (${err.message}). Все успешно переведенные батчи (${Object.keys(totalTranslations).length} строк) будут сохранены!`);
      break;
    }
  }

  const translatedCount = Object.keys(totalTranslations).length;
  if (translatedCount === 0) {
    console.log('[Auto-Translate] Ни одной строки не было переведено.');
    return { translatedCount: 0 };
  }

  console.log(`[Auto-Translate] Успешно переведено: ${translatedCount} строк.`);

  if (dryRun) {
    console.log('[Auto-Translate: Dry-Run] Результат перевода:', JSON.stringify(totalTranslations, null, 2));
    return { translatedCount, dryRun: true };
  }

  // Записываем translations_to_merge.json
  fs.writeFileSync(mergeSourcePath, JSON.stringify(totalTranslations, null, 2), 'utf8');

  // Запускаем штатный слиятель и тесты
  console.log('[Auto-Translate] Слияние и валидация через npm run merge...');
  execSync('npm run merge', { stdio: 'inherit' });

  // Публикация в Git при флаге --publish
  if (publish) {
    publishToGit(translatedCount);
  }

  return { translatedCount, published: publish };
}

function publishToGit(count) {
  try {
    const gitStatus = execSync('git status --porcelain localization/dictionary_ru.json', { timeout: 4000 }).toString().trim();
    if (!gitStatus) {
      console.log('[Auto-Publish] Нет изменений в словаре для коммита.');
      return;
    }

    console.log('[Auto-Publish] Формирование Git-коммита и отправка в origin main...');
    execSync('git add localization/dictionary_ru.json localization/untranslated_queue.json ACTIVE_STATE.md', { stdio: 'inherit' });
    execSync(`git commit -m "feat(i18n): auto-translated ${count} terms from queue [skip ci]"`, { stdio: 'inherit' });
    execSync('git push origin main', { stdio: 'inherit' });
    console.log('✓ [Auto-Publish] Успешно опубликовано в GitHub! Пользователи получат обновление через OTA.');
  } catch (err) {
    console.error('✗ [Auto-Publish Error] Не удалось опубликовать в Git:', err.message);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const publish = args.includes('--publish');
  const dryRun = args.includes('--dry-run');
  const maxIdx = args.indexOf('--max');
  const max = maxIdx !== -1 && args[maxIdx + 1] ? parseInt(args[maxIdx + 1], 10) : 10000;

  autoTranslate({ max, publish, dryRun }).catch(err => {
    console.error('Fatal Auto-Translate Error:', err.message);
    process.exit(1);
  });
}

module.exports = { autoTranslate };
