/**
 * Antigravity Companion: Configuration Manager
 * Управляет общим файлом настроек %APPDATA%\AntigravityCompanion\config.json
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
  voice: {
    hotkey: 'Win+Shift+V',
    mode: 'toggle', // 'toggle' | 'push_to_talk' | 'smart_pause'
    smartPauseSeconds: 2.0,
    smartPunctuation: true,
    autoCapitalize: true,
    audioFeedback: true
  },
  limits: {
    showClaude: true,
    showFlash: true,
    showPro: true,
    sound5h: true,
    soundWeekly: true
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
        voice: { ...DEFAULT_CONFIG.voice, ...(parsed.voice || {}) },
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
    voice: { ...current.voice, ...(newConfig.voice || {}) },
    limits: { ...current.limits, ...(newConfig.limits || {}) }
  };
  fs.writeFileSync(file, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

module.exports = {
  DEFAULT_CONFIG,
  getConfigPath,
  loadConfig,
  saveConfig
};
