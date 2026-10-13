#!/usr/bin/env node
/**
 * Автоматическая установка локальных Git-хуков для защиты от утечек секретов
 */
const fs = require('fs');
const path = require('path');

function installHooks() {
  const repoRoot = path.resolve(__dirname, '..');
  const hooksDir = path.join(repoRoot, '.git', 'hooks');

  if (!fs.existsSync(hooksDir)) {
    console.log('[Git Hooks] Каталог .git/hooks не найден. Пропуск.');
    return;
  }

  const hookContent = `#!/bin/sh
node bin/pre_commit_guard.js
if [ $? -ne 0 ]; then
  exit 1
fi
`;

  const preCommitPath = path.join(hooksDir, 'pre-commit');
  const prePushPath = path.join(hooksDir, 'pre-push');

  fs.writeFileSync(preCommitPath, hookContent, { encoding: 'utf8', mode: 0o755 });
  fs.writeFileSync(prePushPath, hookContent, { encoding: 'utf8', mode: 0o755 });

  console.log('✓ [Git Hooks] Хуки безопасности pre-commit и pre-push успешно установлены в .git/hooks!');
}

if (require.main === module) {
  installHooks();
}

module.exports = { installHooks };
