const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const companionScript = path.join(__dirname, 'antigravity_companion.js');

// Spawn detached background process
const child = spawn(process.execPath, [companionScript], {
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
  cwd: __dirname
});

child.unref();

console.log('[+] Antigravity Companion успешно запущен в фоновом режиме (PID: ' + child.pid + ')');
process.exit(0);
