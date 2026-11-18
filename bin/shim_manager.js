const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

function getAntigravityExePath() {
  const localApp = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const candidates = [
    path.join(localApp, 'Programs', 'antigravity', 'Antigravity.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Antigravity', 'Antigravity.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Antigravity', 'Antigravity.exe'),
    path.join(localApp, 'antigravity', 'Antigravity.exe')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
    const orig = path.join(path.dirname(c), 'Antigravity_orig.exe');
    if (fs.existsSync(orig)) return c;
  }
  return null;
}

function getCscPath() {
  const windir = process.env.SystemRoot || 'C:\\Windows';
  const csc64 = path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (fs.existsSync(csc64)) return csc64;
  const csc32 = path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe');
  if (fs.existsSync(csc32)) return csc32;
  return null;
}

function compileShim(outputExePath = null) {
  if (process.platform !== 'win32') return null;

  const csc = getCscPath();
  if (!csc) return null;

  const baseDir = __dirname;
  const src = path.join(baseDir, 'AntigravityShim.cs');
  if (!fs.existsSync(src)) return null;

  const targetOut = outputExePath || path.join(baseDir, 'AntigravityShim.exe');
  const icoPath = path.join(baseDir, 'antigravity.ico');

  // Extract icon if missing
  if (!fs.existsSync(icoPath)) {
    const agyExe = getAntigravityExePath();
    const sourceExe = agyExe && fs.existsSync(agyExe)
      ? agyExe
      : (agyExe && fs.existsSync(path.join(path.dirname(agyExe), 'Antigravity_orig.exe'))
        ? path.join(path.dirname(agyExe), 'Antigravity_orig.exe')
        : null);

    if (sourceExe) {
      try {
        const psScript = `
          Add-Type -AssemblyName System.Drawing
          $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${sourceExe.replace(/'/g, "''")}')
          $fs = New-Object System.IO.FileStream('${icoPath.replace(/'/g, "''")}', [System.IO.FileMode]::Create)
          $icon.Save($fs)
          $fs.Close()
        `;
        execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], { stdio: 'ignore' });
      } catch (_) {}
    }
  }

  const args = ['/target:winexe', `/out:${targetOut}`];
  if (fs.existsSync(icoPath)) {
    args.push(`/win32icon:${icoPath}`);
  }
  args.push(src);

  try {
    execFileSync(csc, args, { stdio: 'ignore' });
    if (fs.existsSync(targetOut)) {
      return targetOut;
    }
  } catch (err) {
    // Compilation failed
  }
  return null;
}

function isShimInstalled() {
  const agyExe = getAntigravityExePath();
  if (!agyExe) return false;
  const agyDir = path.dirname(agyExe);
  const origExe = path.join(agyDir, 'Antigravity_orig.exe');
  if (!fs.existsSync(origExe) || !fs.existsSync(agyExe)) return false;

  // Check if Antigravity.exe is small (shim is ~5-15 KB, real Electron is 200+ MB)
  try {
    const stat = fs.statSync(agyExe);
    return stat.size < 500000; // Under 500 KB means it's our compiled shim
  } catch (_) {
    return false;
  }
}

function isAntigravityRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const res = spawnSync('tasklist.exe', ['/FI', 'IMAGENAME eq Antigravity.exe', '/NH'], { encoding: 'utf8' });
    if (res.stdout && res.stdout.includes('Antigravity.exe')) return true;
    const resOrig = spawnSync('tasklist.exe', ['/FI', 'IMAGENAME eq Antigravity_orig.exe', '/NH'], { encoding: 'utf8' });
    if (resOrig.stdout && resOrig.stdout.includes('Antigravity_orig.exe')) return true;
  } catch (_) {}
  return false;
}

function installShim() {
  if (process.platform !== 'win32') return { success: false, reason: 'unsupported_platform' };

  const agyExe = getAntigravityExePath();
  if (!agyExe) return { success: false, reason: 'antigravity_not_found' };

  if (isShimInstalled()) {
    return { success: true, alreadyInstalled: true };
  }

  if (isAntigravityRunning()) {
    return { success: false, reason: 'process_running', note: 'Antigravity must be closed before installing launcher shim' };
  }

  const compiledShim = compileShim();
  if (!compiledShim || !fs.existsSync(compiledShim)) {
    return { success: false, reason: 'compile_failed' };
  }

  const agyDir = path.dirname(agyExe);
  const origExe = path.join(agyDir, 'Antigravity_orig.exe');

  try {
    // Rename original Antigravity.exe -> Antigravity_orig.exe
    if (!fs.existsSync(origExe)) {
      fs.renameSync(agyExe, origExe);
    }
    // Copy compiled shim -> Antigravity.exe
    fs.copyFileSync(compiledShim, agyExe);
    return { success: true, installed: true };
  } catch (err) {
    // Attempt rollback if rename succeeded but copy failed
    if (fs.existsSync(origExe) && !fs.existsSync(agyExe)) {
      try { fs.renameSync(origExe, agyExe); } catch (_) {}
    }
    return { success: false, reason: err.message };
  }
}

function uninstallShim() {
  if (process.platform !== 'win32') return { success: false };

  const agyExe = getAntigravityExePath();
  if (!agyExe) return { success: false, reason: 'not_found' };

  const agyDir = path.dirname(agyExe);
  const origExe = path.join(agyDir, 'Antigravity_orig.exe');

  if (!fs.existsSync(origExe)) {
    return { success: true, note: 'no_shim_to_remove' };
  }

  if (isAntigravityRunning()) {
    return { success: false, reason: 'process_running' };
  }

  try {
    fs.unlinkSync(agyExe);
    fs.renameSync(origExe, agyExe);
    return { success: true, restored: true };
  } catch (err) {
    return { success: false, reason: err.message };
  }
}

module.exports = {
  getAntigravityExePath,
  compileShim,
  isShimInstalled,
  isAntigravityRunning,
  installShim,
  uninstallShim
};
