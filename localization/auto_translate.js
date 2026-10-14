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

    const prompt = `You are an elite software localization specialist and technical editor adhering to the Nature-Polishing academic translation standard for Google Antigravity IDE (VS Code / Electron based AI coding tool).

Translate the following array of English UI strings into pristine, idiomatic, and technically accurate Russian:
${JSON.stringify(chunk, null, 2)}

Strict "Nature-Polishing" Translation Standards:
1. No Literal Calques (Устранение буквализмов):
   - Never translate word-for-word if it creates awkward Russian phrasing. Translate the intended meaning into natural developer language.
   - Example: "Message queued. Sends after agent finishes working." -> "Сообщение добавлено в очередь. Будет отправлено после завершения работы агента." (NOT "отправляет после того как").
   - Example: "Customize Sections" -> "Настроить разделы" (NOT "Секции").
2. Contextual Grammar & Morphology:
   - Action buttons / Menu items: Use standard Russian UI infinitive ("Сохранить", "Создать", "Отправить", "Очистить").
   - Completed statuses: Use past passive participles / perfective verbs ("Файл сохранён", "Удалено", "Успешно обновлено").
   - Ongoing operations: Use verbal nouns or clear process terms ("Поиск по кодовой базе", "Анализ файлов", "Выполнение команды").
   - Empty / Unavailable states: "Нет доступных плагинов", "Нет активных задач".
3. Terminological Rigor & Boundaries:
   - Keep standard AI / Developer terms intact or translate with official conventions: "Sidebar" -> "Сайдбар", "Workspace" -> "Рабочая область", "Branch" -> "Ветка", "Commit" -> "Коммит", "Artifact" -> "Артефакт", "Subagent" -> "Субагент", "Prompt" -> "Промпт".
   - Do NOT translate established brand or protocol names: "Google Antigravity", "Gemini", "Model Context Protocol (MCP)", "GitHub", "DevTools", "VS Code", "Electron", "Python", "Node.js".
4. Capitalization & Punctuation:
   - Russian UI titles use sentence case, NOT English Title Case (e.g. "Manage Permissions" -> "Управление разрешениями", NOT "Управление Разрешениями").
   - Do not add trailing periods to button labels or menu headers. Preserve trailing periods in full sentences and tooltips.
   - Exactly preserve all placeholders ({0}, %s, $1), quotes, punctuation, and markdown code formatting.
5. Output Format:
   - Return strictly a valid JSON object mapping each original English key to its Russian translation.
   - Do NOT output arrays or numeric keys.
Format: { "English": "Русский" }`;

    try {
      const result = await translateChunkWithRetry(apiKey, prompt);
      if (typeof result === 'object' && result !== null) {
        if (Array.isArray(result)) {
          result.forEach((v, idx) => {
            if (chunk[idx] && typeof v === 'string' && v.trim()) {
              totalTranslations[chunk[idx]] = v.trim();
            }
          });
        } else {
          for (const [k, v] of Object.entries(result)) {
            if (typeof v === 'string' && v.trim() && !/^\d+$/.test(k.trim())) {
              totalTranslations[k] = v.trim();
            }
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

    const { scanDataStructure } = require('./secret_guard.js');
    const queueData = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    const dictData = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    const violations = [...scanDataStructure(queueData), ...scanDataStructure(dictData)];
    if (violations.length > 0) {
      console.error(`\x1b[31m[CRITICAL SECURITY] Публикация в Git отменена: обнаружены секреты (${violations.length})!\x1b[0m`);
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
