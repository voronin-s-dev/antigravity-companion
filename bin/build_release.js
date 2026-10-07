const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function buildRelease() {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const version = pkg.version || '1.0.0';
  const distDir = path.resolve(__dirname, '../dist');

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const archiveName = `antigravity-companion-v${version}.zip`;
  const archivePath = path.join(distDir, archiveName);

  if (fs.existsSync(archivePath)) {
    fs.unlinkSync(archivePath);
  }

  console.log(`[Сборка дистрибутива] Версия: v${version}`);
  console.log(`[Архивация] Формирование ${archiveName}...`);

  const filesToInclude = [
    'bin',
    'config',
    'limits_widget',
    'localization',
    'skills',
    'test',
    'companion.bat',
    'install.bat',
    'install.ps1',
    'launch_antigravity.bat',
    'start.bat',
    'uninstall.bat',
    'uninstall.ps1',
    'update_dictionary.bat',
    'update_dictionary.ps1',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    '.gitignore',
    'package.json'
  ];

  const existingFiles = filesToInclude.filter(f => fs.existsSync(path.resolve(__dirname, '..', f)));
  const psFilesList = existingFiles.map(f => `'${f}'`).join(', ');

  const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path ${psFilesList} -DestinationPath '${archivePath}' -Force"`;
  execSync(psCmd, { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' });

  const stats = fs.statSync(archivePath);
  const sizeKb = (stats.size / 1024).toFixed(1);
  console.log(`✓ Архив успешно создан: dist/${archiveName} (${sizeKb} КБ)`);
}

if (require.main === module) {
  try {
    buildRelease();
  } catch (err) {
    console.error('✗ Ошибка сборки релиза:', err.message);
    process.exit(1);
  }
}

module.exports = { buildRelease };
