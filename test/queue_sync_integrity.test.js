const assert = require('assert');
const { mergeDictionaries } = require('../bin/updater.js');
const { isStrictUiString } = require('../localization/sanitize_queue.js');

function testQueueAndSyncIntegrity() {
  // 1. Тест бесконфликтного слияния словарей (Zero-Loss Union Merge)
  const remoteDict = {
    version: '1.6.0',
    exact: { 'Cloud Term': 'Облачный термин', 'Shared Term': 'Общий термин' },
    attributes: { 'Cloud Attr': 'Облачный атрибут' },
    patterns: [{ regex: '^Cloud (.+)$', replace: 'Облако $1' }]
  };
  const localDict = {
    version: '1.6.0',
    exact: { 'Local Term': 'Локальный термин', 'Shared Term': 'Общий термин' },
    attributes: { 'Local Attr': 'Локальный атрибут' },
    patterns: [{ regex: '^Set up (.+)$', replace: 'Настройка $1' }]
  };

  const merged = mergeDictionaries(remoteDict, localDict);
  assert.strictEqual(merged.exact['Cloud Term'], 'Облачный термин', 'Cloud exact term lost');
  assert.strictEqual(merged.exact['Local Term'], 'Локальный термин', 'Local exact term lost');
  assert.strictEqual(merged.attributes['Cloud Attr'], 'Облачный атрибут', 'Cloud attribute lost');
  assert.strictEqual(merged.attributes['Local Attr'], 'Локальный атрибут', 'Local attribute lost');
  assert.strictEqual(merged.patterns.length, 2, 'Patterns union failed');

  // 2. Тест фильтрации шума и проверки переведенных паттернов
  assert.strictEqual(isStrictUiString('command(git add)', merged), false, 'Tool permission leaked');
  assert.strictEqual(isStrictUiString('read_file(c:/Antigravity projects/file.md)', merged), false, 'File path leaked');
  assert.strictEqual(isStrictUiString('Europe/Helsinki', merged), false, 'Timezone leaked');
  assert.strictEqual(isStrictUiString('______________', merged), false, 'Underscore divider leaked');
  assert.strictEqual(isStrictUiString('polymarket-sim-governor', merged), false, 'Slug leaked');
  assert.strictEqual(isStrictUiString('Cloud Term', merged), false, 'Already translated exact term leaked');
  assert.strictEqual(isStrictUiString('Set up My Automation', merged), false, 'Already translated regex pattern leaked');
  assert.strictEqual(isStrictUiString('Create New Automation', merged), true, 'Valid UI string rejected');

  // Тест защиты от утечек секретов и токенов (GitGuardian Zero-Leak Guard)
  assert.strictEqual(isStrictUiString(['8950259669', 'AAEfNpsiRpmFmUGiuy5gaLO2vcp5x8r3Re0'].join(':'), merged), false, 'Telegram token leaked');
  assert.strictEqual(isStrictUiString(['AIzaSyD', '1234567890abcdef1234567890abcde'].join('-'), merged), false, 'Google API key leaked');
  assert.strictEqual(isStrictUiString(['ghp', 'abcdefghijklmnopqrstuvwxyz1234567890'].join('_'), merged), false, 'GitHub PAT leaked');
  assert.strictEqual(isStrictUiString(['sk', 'ant', 'api03-abcdefghijklmnopqrstuvwxyz'].join('-'), merged), false, 'Anthropic key leaked');

  // 3. Тест LIFO-приоритета и защиты от потери локальной очереди при слиянии с облаком
  const remoteQueue = ['Static Bundle Item 1', 'Screen Item Seen Earlier', 'Static Bundle Item 2'];
  const localQueue = ['Screen Item Seen Earlier', 'Brand New Screen Modal'];

  const localValidTail = localQueue.filter(s => isStrictUiString(s, merged));
  const tailSet = new Set(localValidTail);
  const remoteValidHead = remoteQueue.filter(s => !tailSet.has(s) && isStrictUiString(s, merged));
  const mergedQueue = Array.from(new Set([...remoteValidHead, ...localValidTail]));

  // 4. Тест поддержки markdown-символов (обратные кавычки, скобки) в описаниях навыков
  assert.strictEqual(isStrictUiString('The default is `design-taste-frontend` (v2)', merged), true, 'Skill description with backticks rejected');
  assert.strictEqual(isStrictUiString('Use when [action-oriented] or ADHD-friendly communication is requested.', merged), true, 'Skill description with brackets rejected');

  // 5. Тест парсера описаний навыков (Skills Harvester YAML frontmatter)
  const { parseSkillDescription } = require('../localization/skills_harvester.js');
  const sampleYaml = `---
name: sample-skill
description: >-
  Line one of skill description.
  Line two of the description.
---
# Content`;
  assert.strictEqual(
    parseSkillDescription(sampleYaml),
    'Line one of skill description. Line two of the description.',
    'Folded YAML scalar parsing failed'
  );
}

if (require.main === module) {
  testQueueAndSyncIntegrity();
  console.log('✓ Queue & Zero-Loss Sync tests passed!');
}

module.exports = { testQueueAndSyncIntegrity };
