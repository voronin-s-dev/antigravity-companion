#!/usr/bin/env node
/**
 * Antigravity Companion: Static Skills Harvester
 * Автоматически сканирует все каталоги навыков Antigravity (пользовательские,
 * встроенные, плагины и рабочие пространства), извлекает описания из SKILL.md
 * и пополняет очередь непереведённых строк untranslated_queue.json.
 */

const fs = require('fs');
const path = require('path');
const { isStrictUiString } = require('./sanitize_queue.js');

const queuePath = path.join(__dirname, 'untranslated_queue.json');
const dictPath = path.join(__dirname, 'dictionary_ru.json');

function getSkillDirectories() {
  const userProfile = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\Default';
  const dirs = [
    path.join(userProfile, '.gemini', 'config', 'skills'),
    path.join(userProfile, '.gemini', 'antigravity', 'builtin', 'skills'),
    path.join(userProfile, '.gemini', 'config', 'plugins'),
    path.join(process.cwd(), '.agents', 'skills')
  ];
  return dirs.filter(d => fs.existsSync(d));
}

function findSkillFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const skillFile = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillFile)) {
          results.push(skillFile);
        } else {
          results.push(...findSkillFiles(fullPath));
        }
      }
    }
  } catch (err) {}
  return results;
}

function parseSkillDescription(content) {
  const frontmatterMatch = content.match(/^---\s*[\r\n]+([\s\S]*?)[\r\n]+---/);
  if (!frontmatterMatch) return null;

  const fm = frontmatterMatch[1];
  const descMatch = fm.match(/description:\s*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/);
  if (!descMatch) return null;

  let desc = descMatch[1].trim();

  // Удаляем YAML scalar-модификаторы: >-, >, |-, |
  desc = desc.replace(/^[>|]-?\s*/, '');
  // Сворачиваем многострочный текст в одну строку с одинарными пробелами
  desc = desc.replace(/\r?\n[ \t]*/g, ' ').trim();
  // Удаляем внешние кавычки
  desc = desc.replace(/^["']|["']$/g, '').trim();

  return desc || null;
}

function harvestSkills() {
  const skillDirs = getSkillDirectories();
  const allSkillFiles = [];
  for (const d of skillDirs) {
    allSkillFiles.push(...findSkillFiles(d));
  }

  let dict = { exact: {}, attributes: {}, patterns: [] };
  try {
    dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
  } catch (err) {}

  let queue = [];
  try {
    if (fs.existsSync(queuePath)) {
      queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    }
  } catch (err) {}

  const queueSet = new Set(queue);
  let added = 0;
  const harvestedDescriptions = [];

  for (const file of allSkillFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const desc = parseSkillDescription(content);
      if (!desc) continue;

      harvestedDescriptions.push({ file, desc });

      // Если уже переведено в словаре — пропускаем
      if (dict.exact && dict.exact[desc]) continue;

      // Валидируем через фильтр UI-строк
      if (!isStrictUiString(desc, dict)) continue;

      if (!queueSet.has(desc)) {
        queue.push(desc);
        queueSet.add(desc);
        added++;
      }
    } catch (err) {}
  }

  if (added > 0) {
    fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2), 'utf8');
  }

  console.log(`[Skills Harvester] Найдено файлов навыков: ${allSkillFiles.length}`);
  console.log(`[Skills Harvester] Извлечено описаний: ${harvestedDescriptions.length}`);
  console.log(`[Skills Harvester] Добавлено новых в очередь: ${added} (всего в очереди: ${queue.length})`);

  return { totalSkills: allSkillFiles.length, added, queueLength: queue.length, harvestedDescriptions };
}

if (require.main === module) {
  harvestSkills();
}

module.exports = { harvestSkills, parseSkillDescription, getSkillDirectories, findSkillFiles };
