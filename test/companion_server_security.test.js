const assert = require('assert');
const { isAllowedHost, isAllowedOrigin } = require('../bin/companion_server.js');

function testSecurityGuards(verbose = false) {
  if (verbose) console.log('--- [Security Audit: Companion Server] ---');

  // 1. DNS Rebinding / Host Header validation
  assert.strictEqual(isAllowedHost('127.0.0.1:9229'), true, 'Should allow 127.0.0.1:9229');
  assert.strictEqual(isAllowedHost('localhost:9229'), true, 'Should allow localhost:9229');
  assert.strictEqual(isAllowedHost('127.0.0.1'), true, 'Should allow 127.0.0.1');
  assert.strictEqual(isAllowedHost('localhost'), true, 'Should allow localhost');
  assert.strictEqual(isAllowedHost(undefined), true, 'Should allow omitted Host header from local tools');

  assert.strictEqual(isAllowedHost('evil.com:9229'), false, 'Must reject malicious Host');
  assert.strictEqual(isAllowedHost('rebind.attacker.org'), false, 'Must reject DNS rebinding Host');
  assert.strictEqual(isAllowedHost('localhost.evil.com:9229'), false, 'Must reject spoofed prefix Host');

  // 2. CSRF / Cross-Origin validation
  assert.strictEqual(isAllowedOrigin(undefined), true, 'Should allow local scripts without Origin header');
  assert.strictEqual(isAllowedOrigin(null), true, 'Should allow null origin (e.g. sandboxed local/file context)');
  assert.strictEqual(isAllowedOrigin('https://127.0.0.1:49389'), true, 'Should allow Antigravity loopback origin');
  assert.strictEqual(isAllowedOrigin('http://127.0.0.1:9000'), true, 'Should allow loopback port');
  assert.strictEqual(isAllowedOrigin('http://localhost:5173'), true, 'Should allow localhost origin');
  assert.strictEqual(isAllowedOrigin('vscode-file://vscode-app'), true, 'Should allow vscode-file origin');

  assert.strictEqual(isAllowedOrigin('https://evil-website.com'), false, 'Must reject external website Origin');
  assert.strictEqual(isAllowedOrigin('http://attacker.org:9229'), false, 'Must reject external attacker Origin');
  assert.strictEqual(isAllowedOrigin('https://127.0.0.1.attacker.com'), false, 'Must reject subdomain masquerade Origin');

  if (verbose) console.log('✓ DNS Rebinding & Cross-Origin guards: PASSED');
}

if (require.main === module) {
  testSecurityGuards(true);
}

module.exports = { testSecurityGuards };
