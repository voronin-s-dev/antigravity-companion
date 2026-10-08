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

function callGemini(apiKey, prompt, model = 'gemini-2.5-flash') {
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
      timeout: 25000
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

async function autoTranslate({ max = 50, batchSize = 25, publish = false, dryRun = false } = {}) {
  if (!fs.existsSync(queuePath)) {
    console.log('[Auto-Translate] Очередь untranslated_queue.json не найдена.');
    return { translatedCount: 0 };
  }

  let queue = [];
  try {
    queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  } catch (e) {
    console.error('[Auto-Translate] Ошибка чтения untranslated_queue.json:', e.message);
    return { translatedCount: 0 };
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

  console.log(`[Auto-Translate] Всего в очереди: ${queue.length} строк. Обработка до ${max} строк (батчами по ${batchSize})...`);
  const itemsToProcess = queue.slice(0, max);
  const totalTranslations = {};

  for (let i = 0; i < itemsToProcess.length; i += batchSize) {
    const chunk = itemsToProcess.slice(i, i + batchSize);
    console.log(`[Auto-Translate] Перевод батча ${Math.floor(i / batchSize) + 1} (${chunk.length} строк)...`);

    const prompt = `You are a professional software localization translator for Google Antigravity IDE (VS Code / Electron based AI coding tool).
Translate the following array of English UI strings into clean, accurate Russian:
${JSON.stringify(chunk, null, 2)}

Rules:
1. Technical precision: use established developer terminology (e.g. "Terminal" -> "Терминал", "Code Search" -> "Поиск по коду", "New Tab" -> "Новая вкладка").
2. Preserve placeholders ({0}, %s, etc.), symbols, and punctuation.
3. Return ONLY a JSON object mapping each English string to its Russian translation.
Format: { "English": "Русский" }`;

    try {
      let result;
      try {
        result = await callGemini(apiKey, prompt, 'gemini-2.5-flash');
      } catch (e) {
        console.warn(`[Auto-Translate] gemini-2.5-flash недоступен (${e.message}), пробую gemini-1.5-flash...`);
        result = await callGemini(apiKey, prompt, 'gemini-1.5-flash');
      }

      if (typeof result === 'object' && result !== null) {
        for (const [k, v] of Object.entries(result)) {
          if (typeof v === 'string' && v.trim()) {
            totalTranslations[k] = v.trim();
          }
        }
      }
    } catch (err) {
      console.error(`[Auto-Translate] Ошибка при переводе батча: ${err.message}`);
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
    execSync('git add localization/dictionary_ru.json ACTIVE_STATE.md', { stdio: 'inherit' });
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
  const max = maxIdx !== -1 && args[maxIdx + 1] ? parseInt(args[maxIdx + 1], 10) : 50;

  autoTranslate({ max, publish, dryRun }).catch(err => {
    console.error('Fatal Auto-Translate Error:', err.message);
    process.exit(1);
  });
}

module.exports = { autoTranslate };
