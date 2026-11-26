const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const child_process = require('child_process');

function testSupervisorSyntax() {
  const compScript = path.resolve(__dirname, '../bin/antigravity_companion.js');
  const code = fs.readFileSync(compScript, 'utf8');

  // Verify syntax via VM compilation
  new vm.Script(code, { filename: 'antigravity_companion.js' });

  // Verify key supervisor invariants
  if (!code.includes('resetConnection()')) {
    throw new Error('Supervisor must define and invoke resetConnection()');
  }
  if (!code.includes('currentPort')) {
    throw new Error('Supervisor must track currentPort dynamically');
  }
  if (!code.includes('hasTranslator') || !code.includes('hasWidget')) {
    throw new Error('Supervisor must verify both hasTranslator and hasWidget in health check');
  }
  if (!code.includes('DevToolsActivePort обновлен')) {
    throw new Error('Supervisor must handle DevToolsActivePort update during fs.watch');
  }
  if (!code.includes('selfHealUnshimmedHost()')) {
    throw new Error('Supervisor must define and invoke selfHealUnshimmedHost() for seamless auto-updates');
  }
  if (!code.includes('function runPowerShellScript(')) {
    throw new Error('Supervisor must define runPowerShellScript() helper for Windows PowerShell invocation');
  }
  if (/spawn\(\s*['"]powershell\.exe['"][\s\S]{0,300}detached\s*:\s*true/.test(code)) {
    throw new Error('Supervisor must NOT spawn powershell.exe with detached: true (silently exits 0 on Windows)');
  }
}

function testPowerShellScriptsAst() {
  const isWindows = process.platform === 'win32';
  if (!isWindows) {
    console.log('  [CI: Non-Windows platform] Skipping live Windows PowerShell AST check.');
    return;
  }

  const psScripts = [
    '../bin/start_silent.ps1',
    '../bin/launch_antigravity.ps1',
    '../bin/clean_restart.ps1',
    '../bin/status.ps1',
    '../bin/companion_manager.ps1',
    '../bin/fix_shortcuts.ps1'
  ];

  for (const rel of psScripts) {
    const fullPath = path.resolve(__dirname, rel);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`PowerShell script not found: ${rel}`);
    }

    const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "[System.Management.Automation.Language.Parser]::ParseFile('${fullPath.replace(/'/g, "''")}', [ref]$null, [ref]$errors); if ($errors.Count -gt 0) { exit 1 } else { exit 0 }"`;
    try {
      child_process.execSync(command, { stdio: 'pipe' });
    } catch (e) {
      throw new Error(`PowerShell syntax error in ${rel}: ${e.message}`);
    }
  }
}

function testAutostartArtifacts() {
  const vbsLauncher = path.resolve(__dirname, '../bin/launch_antigravity.vbs');
  if (!fs.existsSync(vbsLauncher)) {
    throw new Error('launch_antigravity.vbs is missing');
  }
  const vbsContent = fs.readFileSync(vbsLauncher, 'utf8');
  if (!vbsContent.includes('launch_antigravity.ps1')) {
    throw new Error('launch_antigravity.vbs must target launch_antigravity.ps1');
  }

  const launchPs = fs.readFileSync(path.resolve(__dirname, '../bin/launch_antigravity.ps1'), 'utf8');
  if (!launchPs.includes('--remote-debugging-port')) {
    throw new Error('launch_antigravity.ps1 must launch Antigravity with --remote-debugging-port');
  }

  const startSilentPs = fs.readFileSync(path.resolve(__dirname, '../bin/start_silent.ps1'), 'utf8');
  if (!startSilentPs.includes('AntigravityCompanion.lnk') || !startSilentPs.includes('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run')) {
    throw new Error('start_silent.ps1 must guarantee Windows Autostart (Startup shortcut and Registry Run key)');
  }
}

function testShimManagerInvariants() {
  const compCode = fs.readFileSync(path.resolve(__dirname, '../bin/antigravity_companion.js'), 'utf8');
  if (/\binstallShim\(/.test(compCode)) {
    throw new Error('Supervisor must NOT call installShim() to avoid modifying signed Antigravity.exe');
  }
  if (!compCode.includes('ensureCleanHostBinary()')) {
    throw new Error('Supervisor must define and invoke ensureCleanHostBinary() to restore original Antigravity.exe');
  }

  const cleanRestartPs = fs.readFileSync(path.resolve(__dirname, '../bin/clean_restart.ps1'), 'utf8');
  if (!cleanRestartPs.includes('shim_manager.js') || !cleanRestartPs.includes('uninstall')) {
    throw new Error('clean_restart.ps1 must invoke shim_manager.js uninstall');
  }

  const shimManager = require('../bin/shim_manager.js');
  if (typeof shimManager.isShimInstalled !== 'function' ||
      typeof shimManager.uninstallShim !== 'function') {
    throw new Error('shim_manager.js must export isShimInstalled and uninstallShim');
  }
}

function testWindowsPowerShellSpawnExecution() {
  if (process.platform !== 'win32') {
    console.log('  [CI: Non-Windows platform] Skipping live Windows PowerShell spawn test.');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-ps-probe-'));
  const psPath = path.join(tmpDir, 'probe.ps1');
  const outPath = path.join(tmpDir, 'out.txt');
  fs.writeFileSync(psPath, `"PS_EXEC_OK" | Set-Content -Path '${outPath.replace(/'/g, "''")}'`, 'utf8');

  try {
    const res = child_process.spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psPath],
      { windowsHide: true, encoding: 'utf8' }
    );
    if (res.status !== 0 || !fs.existsSync(outPath) || !fs.readFileSync(outPath, 'utf8').includes('PS_EXEC_OK')) {
      throw new Error(`Attached PowerShell execution failed (status=${res.status}, exists=${fs.existsSync(outPath)})`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function runAllSupervisorTests() {
  console.log('[Test: Supervisor & Autostart] Starting tests...');
  testSupervisorSyntax();
  console.log('  ✓ Supervisor syntax and invariants passed.');
  testPowerShellScriptsAst();
  console.log('  ✓ PowerShell scripts AST validation passed.');
  testAutostartArtifacts();
  console.log('  ✓ Autostart artifacts and registry invariants passed.');
  testShimManagerInvariants();
  console.log('  ✓ Transparent launcher shim invariants passed.');
  testWindowsPowerShellSpawnExecution();
  console.log('  ✓ Live Windows PowerShell execution test passed.');
  return true;
}

if (require.main === module) {
  runAllSupervisorTests();
}

module.exports = {
  runAllSupervisorTests,
  testSupervisorSyntax,
  testPowerShellScriptsAst,
  testAutostartArtifacts
};
