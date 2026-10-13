const assert = require('assert');
const { isNewerVersion, mergeDictionaries, checkForUpdates } = require('../bin/updater.js');

async function testUpdater(verbose = false) {
  if (verbose) console.log('--- [Тестирование: OTA Updater & Version Guard] ---');

  // 1. Semver comparison
  assert.strictEqual(isNewerVersion('1.6.0', '1.3.0'), true, '1.6.0 must be newer than 1.3.0');
  assert.strictEqual(isNewerVersion('1.3.0', '1.6.0'), false, '1.3.0 must not be newer than 1.6.0');
  assert.strictEqual(isNewerVersion('1.6.0', '1.6.0'), false, 'Equal versions must return false');
  assert.strictEqual(isNewerVersion('2.0.0', '1.6.0'), true, '2.0.0 must be newer than 1.6.0');
  assert.strictEqual(isNewerVersion('1.6.1', '1.6.0'), true, 'Patch release must be newer');
  assert.strictEqual(isNewerVersion('v1.6.0', 'v1.4.0'), true, 'Prefixed v must compare correctly');

  // 2. Dictionary merge logic
  const local = { version: '1.3.0', exact: { 'Hello': 'Привет', 'LocalOnly': 'Только локально' }, patterns: [] };
  const incoming = { version: '1.6.0', exact: { 'Hello': 'Здравствуйте', 'RemoteOnly': 'Только удаленно' }, patterns: [] };
  const merged = mergeDictionaries(incoming, local);
  assert.strictEqual(merged.exact['LocalOnly'], 'Только локально');
  assert.strictEqual(merged.exact['RemoteOnly'], 'Только удаленно');

  // 3. Check for updates payload structure
  const status = await checkForUpdates();
  assert.strictEqual(typeof status.ok, 'boolean');
  assert.strictEqual(typeof status.currentVersion, 'string');
  assert.strictEqual(typeof status.remoteVersion, 'string');
  assert.strictEqual(typeof status.hasAppUpdate, 'boolean');
  assert.strictEqual(typeof status.hasDictUpdate, 'boolean');
  assert.strictEqual(typeof status.hasUpdate, 'boolean');

  if (verbose) console.log('✓ OTA Updater tests PASSED');
}

if (require.main === module) {
  testUpdater(true).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { testUpdater };
