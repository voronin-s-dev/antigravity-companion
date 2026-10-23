const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { DEFAULT_CONFIG, loadConfig, saveConfig, getConfigPath } = require('../config/companion_config');
const { detectAvailableClouds, getVolumeFreeSpaceGB } = require('../backup_manager/cloud_detector');
const scheduler = require('../backup_manager/scheduler');
const backup_service = require('../backup_manager/backup_service');

async function testBackupManager() {
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

  // 4. Test Core PowerShell Engine & Silent Runner
  const engineDir = path.join(__dirname, '..', 'backup_manager', 'engine');
  const psPath = path.join(engineDir, 'run_backup.ps1');
  const vbsPath = path.join(engineDir, 'silent_runner.vbs');

  assert(fs.existsSync(psPath), 'run_backup.ps1 must exist');
  assert(fs.existsSync(vbsPath), 'silent_runner.vbs must exist');

  // 4.1 Validate PowerShell syntax using AST parser
  const psSyntaxCmd = `powershell.exe -NoProfile -Command "$errors = $null; [System.Management.Automation.Language.Parser]::ParseFile('${psPath.replace(/\\/g, '\\\\')}', [ref]$null, [ref]$errors); if ($errors.Count -gt 0) { throw ($errors | Out-String) }"`;
  execSync(psSyntaxCmd, { stdio: 'pipe' });
  console.log('  ✓ PowerShell AST syntax check passed for run_backup.ps1');

  // 4.2 Integration Test: End-to-end backup, exclusions, smart skip, status persistence
  const mockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-mock-backup-'));
  const mockProjects = path.join(mockRoot, 'Projects');
  const mockScratch = path.join(mockRoot, 'Scratch');
  const mockDest = path.join(mockRoot, 'Destination');
  const mockAppData = path.join(mockRoot, 'AppData');
  const mockGemini = path.join(mockRoot, 'Gemini');

  try {
    fs.mkdirSync(mockProjects, { recursive: true });
    fs.mkdirSync(mockScratch, { recursive: true });
    fs.mkdirSync(mockDest, { recursive: true });
    fs.mkdirSync(mockAppData, { recursive: true });
    fs.mkdirSync(mockGemini, { recursive: true });

    // Create a mock project
    const projAlpha = path.join(mockProjects, 'AlphaApp');
    const projAlphaModules = path.join(projAlpha, 'node_modules', 'some-lib');
    fs.mkdirSync(projAlphaModules, { recursive: true });
    fs.writeFileSync(path.join(projAlpha, 'index.js'), 'console.log("Alpha App");', 'utf8');
    fs.writeFileSync(path.join(projAlphaModules, 'lib.js'), 'module.exports = {};', 'utf8');

    // Run 1: First backup run
    const run1Cmd = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${psPath}" -ProjectsRoot "${mockProjects}" -ScratchRoot "${mockScratch}" -BackupDestination "${mockDest}" -GeminiConfigDir "${mockGemini}"`;
    execSync(run1Cmd, { env: { ...process.env, APPDATA: mockAppData }, stdio: 'pipe' });

    // Verify zip was created
    const archives1 = fs.readdirSync(mockDest).filter(f => f.startsWith('AlphaApp_') && f.endsWith('.zip'));
    assert.strictEqual(archives1.length, 1, 'Should create exactly 1 archive for AlphaApp');
    const zipPath = path.join(mockDest, archives1[0]);

    // Verify exclusions via tar.exe -tf
    const archiveListing = execSync(`tar.exe -tf "${zipPath}"`, { encoding: 'utf8' });
    assert(archiveListing.includes('index.js'), 'Archive must contain index.js');
    assert(!archiveListing.includes('node_modules'), 'Archive must NOT contain node_modules');
    assert(!archiveListing.includes('some-lib'), 'Archive must NOT contain excluded dependencies');

    // Verify backup_status.json was created
    const statusFile = path.join(mockAppData, 'AntigravityCompanion', 'backup_status.json');
    assert(fs.existsSync(statusFile), 'backup_status.json must be created');
    const readStatusJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));

    const status1 = readStatusJson(statusFile);
    assert.strictEqual(status1.status, 'success', 'Status should be success');
    assert.strictEqual(status1.projectsProcessed, 1);
    assert.strictEqual(status1.archivesCreated, 1);
    assert.strictEqual(status1.archivesSkipped, 0);
    assert(status1.totalSizeBytes > 0, 'totalSizeBytes should be > 0');

    // Run 2: Second backup run without ForceArchive -> Smart Skip
    execSync(run1Cmd, { env: { ...process.env, APPDATA: mockAppData }, stdio: 'pipe' });
    const status2 = readStatusJson(statusFile);
    assert.strictEqual(status2.status, 'success');
    assert.strictEqual(status2.projectsProcessed, 1);
    assert.strictEqual(status2.archivesCreated, 0, 'No new archives should be created on unchanged run');
    assert.strictEqual(status2.archivesSkipped, 1, 'Smart skip should count 1 skipped project');

    // Run 3: Run via silent_runner.vbs with -ForceArchive
    const vbsCmd = `cscript.exe //nologo "${vbsPath}" -ProjectsRoot "${mockProjects}" -ScratchRoot "${mockScratch}" -BackupDestination "${mockDest}" -GeminiConfigDir "${mockGemini}" -ForceArchive`;
    execSync(vbsCmd, { env: { ...process.env, APPDATA: mockAppData }, stdio: 'pipe' });
    const status3 = readStatusJson(statusFile);
    assert.strictEqual(status3.status, 'success');
    assert.strictEqual(status3.archivesCreated, 1, 'ForceArchive must create an archive even without changes');

    console.log('  ✓ Integration Test: Backup creation, tar exclusion, Smart Skip & silent_runner.vbs passed.');
  } finally {
    try {
      fs.rmSync(mockRoot, { recursive: true, force: true });
    } catch (e) {}
  }

  // 5. Test Scheduler Integration & Backup Controller Service
  const tempAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-companion-service-test-'));
  const prevAppData = process.env.APPDATA;
  process.env.APPDATA = tempAppData;

  try {
    // 5.1 Test scheduler.getTaskStatus structure
    const initialTaskStatus = scheduler.getTaskStatus();
    assert(typeof initialTaskStatus.exists === 'boolean', 'scheduler.getTaskStatus must return exists boolean');

    // Test register & unregister roundtrip
    const regResult = scheduler.registerDailyTask('04:30');
    assert.strictEqual(regResult.ok, true, 'registerDailyTask should succeed');
    assert.strictEqual(regResult.time, '04:30');

    const regStatus = scheduler.getTaskStatus();
    assert.strictEqual(regStatus.exists, true, 'Task should exist after registration');
    assert.strictEqual(regStatus.state, 'Ready');

    const unregResult = scheduler.unregisterDailyTask();
    assert.strictEqual(unregResult.ok, true, 'unregisterDailyTask should succeed');
    const afterUnregStatus = scheduler.getTaskStatus();
    assert.strictEqual(afterUnregStatus.exists, false, 'Task should not exist after unregister');

    // 5.2 Test backup_service.getStatus()
    const svcStatus = await backup_service.getStatus();
    assert(svcStatus.config, 'getStatus must return config');
    assert.strictEqual(typeof svcStatus.config.enabled, 'boolean');
    assert(Array.isArray(svcStatus.clouds), 'getStatus must return clouds array');
    assert(svcStatus.scheduler, 'getStatus must return scheduler status');
    assert(typeof svcStatus.scheduler.exists === 'boolean');
    assert.strictEqual(svcStatus.lastBackup, null, 'No last backup initially in fresh dir');
    assert(Array.isArray(svcStatus.recentLogs), 'recentLogs must be array');

    // 5.3 Test backup_service.saveSettings()
    const updatedStatus = await backup_service.saveSettings({
      retentionDays: 14,
      cloudProvider: 'onedrive',
      backupTime: '02:15'
    });
    assert.strictEqual(updatedStatus.config.retentionDays, 14);
    assert.strictEqual(updatedStatus.config.cloudProvider, 'onedrive');
    assert.strictEqual(updatedStatus.config.backupTime, '02:15');

    const verifiedConfig = loadConfig();
    assert.strictEqual(verifiedConfig.backup.retentionDays, 14);
    assert.strictEqual(verifiedConfig.backup.cloudProvider, 'onedrive');

    // 5.4 Test resolveDestinationPath
    const resolvedCustom = backup_service.resolveDestinationPath('D:\\MyCustomBackups');
    assert.strictEqual(resolvedCustom, path.resolve('D:\\MyCustomBackups'));

    console.log('  ✓ Scheduler Integration & Backup Controller Service unit tests passed.');
  } finally {
    process.env.APPDATA = prevAppData;
    scheduler.unregisterDailyTask();
    try {
      fs.rmSync(tempAppData, { recursive: true, force: true });
    } catch (e) {}
  }
}

if (require.main === module) {
  testBackupManager()
    .then(() => {
      console.log('✓ backup_manager.test.js: All tests passed successfully!');
    })
    .catch((err) => {
      console.error('✗ backup_manager.test.js failed:', err);
      process.exit(1);
    });
}

module.exports = {
  testBackupManager
};
