const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { containsSecret, detectSecretType, scanDataStructure } = require('../localization/secret_guard.js');

function testSecretGuard() {
  // 1. Проверка обнаружения всех критических типов секретов
  const testSecrets = [
    { type: 'Telegram Bot Token', value: ['8950259669', 'AAEfNpsiRpmFmUGiuy5gaLO2vcp5x8r3Re0'].join(':') },
    { type: 'Telegram Bot Token', value: ['123456789', 'ABCdefGHIjklMNOpqrsTUVwxyz012345678'].join(':') },
    { type: 'Google API Key', value: ['AIzaSyD', '1234567890abcdef1234567890abcde'].join('-') },
    { type: 'OpenAI API Key', value: ['sk', 'abcdefghijklmnopqrstuvwxyz1234567890'].join('-') },
    { type: 'OpenAI API Key', value: ['sk', 'proj', 'abcdefghijklmnopqrstuvwxyz1234567890'].join('-') },
    { type: 'Anthropic API Key', value: ['sk', 'ant', 'api03-abcdefghijklmnopqrstuvwxyz12345678'].join('-') },
    { type: 'GitHub Token', value: ['ghp', 'abcdefghijklmnopqrstuvwxyz1234567890'].join('_') },
    { type: 'GitHub Token', value: ['github', 'pat', '11AAAAAAA0123456789abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopq'].join('_') },
    { type: 'AWS Access Key', value: ['AKIA', 'IOSFODNN7EXAMPLE'].join('') },
    { type: 'Slack Token', value: ['xoxb', '123456789012', '1234567890123', 'abcdefghijklmnopqrstuvwx'].join('-') },
    { type: 'Stripe Secret Key', value: ['sk', 'live', '51Abcdefghijklmnopqrstuvw012345'].join('_') },
    { type: 'Private Key', value: ['-----BEGIN RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEA0...'].join('\n') },
    { type: 'JWT Token', value: ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'dozG4B1s'].join('.') }
  ];

  for (const s of testSecrets) {
    assert.strictEqual(
      containsSecret(s.value),
      true,
      `Secret Guard не смог обнаружить ${s.type}: "${s.value.slice(0, 15)}..."`
    );
  }

  // 2. Проверка, что обычные UI-строки НЕ вызывают ложных срабатываний
  const legitimateStrings = [
    'Add Folder',
    'Delete Folder',
    'Terminal',
    'New Window',
    'Select a folder.',
    'Agents created by this automation run in a dedicated project with its own permissions.',
    'Exploring files, editing file',
    'Accept Step',
    'Translation Verification And Review',
    'Open Settings (Ctrl+,)',
    '15 seconds'
  ];

  for (const str of legitimateStrings) {
    assert.strictEqual(
      containsSecret(str),
      false,
      `Secret Guard ошибочно заблокировал легитимную строку интерфейса: "${str}"`
    );
  }

  // 3. Полное сканирование файлов словаря и очереди репозитория на нулевую утечку (Zero-Leak Audit)
  const repoRoot = path.resolve(__dirname, '..');
  const dictPath = path.join(repoRoot, 'localization', 'dictionary_ru.json');
  const queuePath = path.join(repoRoot, 'localization', 'untranslated_queue.json');

  if (fs.existsSync(dictPath)) {
    const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    const dictViolations = scanDataStructure(dict, 'dictionary_ru.json');
    assert.strictEqual(
      dictViolations.length,
      0,
      `В dictionary_ru.json обнаружены секреты (${dictViolations.length}): ${JSON.stringify(dictViolations)}`
    );
  }

  if (fs.existsSync(queuePath)) {
    const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    const queueViolations = scanDataStructure(queue, 'untranslated_queue.json');
    assert.strictEqual(
      queueViolations.length,
      0,
      `В untranslated_queue.json обнаружены секреты (${queueViolations.length}): ${JSON.stringify(queueViolations)}`
    );
  }
}

if (require.main === module) {
  testSecretGuard();
  console.log('✓ [Secret Guard] Тесты предотвращения утечек успешно пройдены!');
}

module.exports = { testSecretGuard };
