const fs = require('fs');
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
}

function testPowerShellScriptsAst() {
  const psScripts = [
    '../bin/start_silent.ps1',
    '../bin/launch_antigravity.ps1',
    '../bin/status.ps1',
    '../bin/companion_manager.ps1'
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

  const startSilentPs = fs.readFileSync(path.resolve(__dirname, '../bin/start_silent.ps1'), 'utf8');
  if (!startSilentPs.includes('AntigravityCompanion.lnk') || !startSilentPs.includes('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run')) {
    throw new Error('start_silent.ps1 must guarantee Windows Autostart (Startup shortcut and Registry Run key)');
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
