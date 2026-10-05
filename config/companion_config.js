/**
 * Antigravity Companion: Configuration Manager
 * Управляет общим файлом настроек %APPDATA%\AntigravityCompanion\config.json
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  limits: {
    placement: 'sidebar', // 'sidebar' | 'floating'
    tint: 'native', // 'native' | 'graphite' | 'blue' | 'emerald' | 'purple' | 'amber' | hex (#rrggbb)
    pillItems: ['gemini_5h', 'gemini_weekly', 'claude_5h', 'claude_weekly'],
    scale: 'compact', // mini / compact
    intervalMs: 300000,
    sound5h: true,
    soundWeekly: true,
    sound5hCustom: null,
    sound5hCustomName: '',
    soundWeeklyCustom: null,
    soundWeeklyCustomName: '',
    lang: 'ru',
    position: null // { anchorX, anchorY, distX, distY }
  }
};

function getConfigDir() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const dir = path.join(appData, 'AntigravityCompanion');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function loadConfig() {
  const file = getConfigPath();
  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        limits: { ...DEFAULT_CONFIG.limits, ...(parsed.limits || {}) }
      };
    } catch (e) {
      console.error('[Config] Ошибка чтения config.json, используются параметры по умолчанию:', e.message);
    }
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function saveConfig(newConfig) {
  const file = getConfigPath();
  const current = loadConfig();
  const merged = {
    limits: {
      ...current.limits,
      ...(newConfig.limits || newConfig)
    }
  };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = {
  DEFAULT_CONFIG,
  getConfigDir,
  getConfigPath,
  loadConfig,
  saveConfig
};
