const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DEFAULT_CONFIG, loadConfig, saveConfig, getConfigPath } = require('../config/companion_config');
const { detectAvailableClouds, getVolumeFreeSpaceGB } = require('../backup_manager/cloud_detector');

function testBackupManager() {
  console.log('[Test: Backup Manager] Starting unit tests...');

  // 1. Test Config Schema & Persistence with temp APPDATA isolation
  const originalAppData = process.env.APPDATA;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-companion-test-'));
  process.env.APPDATA = tempDir;

  try {
    // 1.1 Verify DEFAULT_CONFIG schema
    assert(DEFAULT_CONFIG.backup, 'DEFAULT_CONFIG must contain backup section');
    assert.strictEqual(DEFAULT_CONFIG.backup.enabled, false);
    assert.strictEqual(DEFAULT_CONFIG.backup.cloudProvider, 'auto');
    assert.strictEqual(DEFAULT_CONFIG.backup.backupTime, '22:00');
    assert.strictEqual(DEFAULT_CONFIG.backup.retentionDays, 7);
    assert.strictEqual(DEFAULT_CONFIG.backup.neverDeleteInactiveLastVersions, true);

    // 1.2 Verify loadConfig with no file returns defaults
    const initialConfig = loadConfig();
    assert(initialConfig.backup, 'loadConfig must return backup property');
    assert.strictEqual(initialConfig.backup.enabled, false);
    assert.strictEqual(initialConfig.limits.placement, 'sidebar');

    // 1.3 Verify saveConfig updating backup section only
    saveConfig({
      backup: {
        enabled: true,
        cloudProvider: 'onedrive',
        backupTime: '23:30'
      }
    });

    let reloaded = loadConfig();
    assert.strictEqual(reloaded.backup.enabled, true, 'backup.enabled should be true');
    assert.strictEqual(reloaded.backup.cloudProvider, 'onedrive');
    assert.strictEqual(reloaded.backup.backupTime, '23:30');
    assert.strictEqual(reloaded.backup.retentionDays, 7, 'Default fields must be preserved');
    assert.strictEqual(reloaded.limits.placement, 'sidebar', 'Limits section must be preserved');

    // 1.4 Verify saveConfig updating limits section only
    saveConfig({
      limits: {
        placement: 'floating',
        tint: 'emerald'
      }
    });

    reloaded = loadConfig();
    assert.strictEqual(reloaded.limits.placement, 'floating');
    assert.strictEqual(reloaded.limits.tint, 'emerald');
    assert.strictEqual(reloaded.backup.enabled, true, 'Backup settings must be preserved when updating limits');
    assert.strictEqual(reloaded.backup.cloudProvider, 'onedrive');

    // 1.5 Verify saveConfig updating both sections
    saveConfig({
      limits: { tint: 'graphite' },
      backup: { retentionDays: 14 }
    });

    reloaded = loadConfig();
    assert.strictEqual(reloaded.limits.tint, 'graphite');
    assert.strictEqual(reloaded.limits.placement, 'floating');
    assert.strictEqual(reloaded.backup.retentionDays, 14);
    assert.strictEqual(reloaded.backup.backupTime, '23:30');

    // 1.6 Verify legacy flat saveConfig (passing direct limits payload without wrapper)
    saveConfig({ scale: 'mini' });
    reloaded = loadConfig();
    assert.strictEqual(reloaded.limits.scale, 'mini');
    assert.strictEqual(reloaded.backup.retentionDays, 14, 'Backup settings must be preserved on flat limits save');

    console.log('  ✓ Config Schema & load/save persistence passed.');
  } finally {
    process.env.APPDATA = originalAppData;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }

  // 2. Test detectAvailableClouds
  const clouds = detectAvailableClouds();
  assert(Array.isArray(clouds), 'detectAvailableClouds must return an array');
  assert(clouds.length >= 5, 'Must detect at least 5 providers (onedrive, gdrive, yandex, dropbox, local)');

  const expectedIds = ['onedrive', 'gdrive', 'yandex', 'dropbox', 'local'];
  for (const expectedId of expectedIds) {
    const provider = clouds.find(c => c.id === expectedId);
    assert(provider, `Provider ${expectedId} must be present in cloud list`);
    assert(typeof provider.id === 'string', 'provider.id must be string');
    assert(typeof provider.name === 'string', 'provider.name must be string');
    assert(typeof provider.path === 'string', 'provider.path must be string');
    assert(typeof provider.available === 'boolean', 'provider.available must be boolean');
    assert(typeof provider.freeSpaceGB === 'number', 'provider.freeSpaceGB must be number');
    assert(provider.freeSpaceGB >= 0, 'provider.freeSpaceGB must be non-negative');
  }

  const localProvider = clouds.find(c => c.id === 'local');
  assert.strictEqual(localProvider.available, true, 'Local storage fallback must always be available');
  assert(localProvider.freeSpaceGB > 0, 'Local drive should report free space > 0');

  console.log('  ✓ detectAvailableClouds passed: detected providers count = ' + clouds.length);

  // 3. Test getVolumeFreeSpaceGB
  const userProfile = process.env.USERPROFILE || 'C:\\';
  const freeGB = getVolumeFreeSpaceGB(userProfile);
  assert(typeof freeGB === 'number', 'getVolumeFreeSpaceGB must return number');
  assert(freeGB > 0, 'Free space for USERPROFILE should be > 0 GB');

  const zeroFree = getVolumeFreeSpaceGB('');
  assert.strictEqual(zeroFree, 0, 'Empty path must return 0 GB free space');

  const invalidFree = getVolumeFreeSpaceGB('Z:\\non_existent_drive_letter_12345');
  assert.strictEqual(invalidFree, 0, 'Non-existent path must return 0 GB');

  console.log('  ✓ getVolumeFreeSpaceGB passed: user drive free space = ' + freeGB + ' GB');
}

if (require.main === module) {
  testBackupManager();
  console.log('✓ backup_manager.test.js: All tests passed successfully!');
}

module.exports = {
  testBackupManager
};
