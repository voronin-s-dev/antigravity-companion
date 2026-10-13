/**
 * Antigravity Companion: Zero-Leak Secret & Token Guard
 * 
 * Централизованный модуль обнаружения и фильтрации любых секретов,
 * API-ключей, токенов ботов и чувствительных данных.
 * Используется сборщиками строк, санитайзером, сервером, тестами и Git-хуками.
 */

const SECRET_PATTERNS = [
  // 1. Telegram Bot Token: 1234567890:AAEfNpsiRpmFmUGiuy5gaLO2vcp5x8r3Re0
  { name: 'Telegram Bot Token', regex: /\b\d{8,11}:[A-Za-z0-9_-]{35}\b/ },

  // 2. Google Cloud / Gemini API Key: AIzaSy...
  { name: 'Google API Key', regex: /\bAIza[0-9A-Za-z-_]{35}\b/ },

  // 3. OpenAI API Keys (legacy sk-... and project sk-proj-...)
  { name: 'OpenAI API Key', regex: /\bsk-(proj-)?[a-zA-Z0-9_-]{20,}\b/ },

  // 4. Anthropic API Key: sk-ant-api03-...
  { name: 'Anthropic API Key', regex: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/ },

  // 5. GitHub Personal Access Tokens & OAuth tokens
  { name: 'GitHub Token', regex: /\b(gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,})\b/ },

  // 6. AWS Access Key IDs & Secret Keys
  { name: 'AWS Access Key', regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/ },

  // 7. Slack API Tokens (Bot, User, App)
  { name: 'Slack Token', regex: /\bxox[baprs]-[0-9a-zA-Z-]{10,72}\b/ },

  // 8. Stripe Live & Restricted Keys
  { name: 'Stripe Secret Key', regex: /\b(sk_live_|rk_live_)[0-9a-zA-Z]{24,}\b/ },

  // 9. Discord Bot Tokens
  { name: 'Discord Bot Token', regex: /\b[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}\b/ },

  // 10. Private Encryption Keys (RSA, DSA, EC, OPENSSH, PGP)
  { name: 'Private Key', regex: /-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----/ },

  // 11. JSON Web Tokens (JWT) & Bearer Headers
  { name: 'JWT Token', regex: /\beyJ[A-Za-z0-9-_=]+\.eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_.+/=]+\b/ },
  { name: 'Bearer Token', regex: /\bBearer\s+[A-Za-z0-9_\-\.]{25,}\b/i },

  // 12. HuggingFace / Cohere / Replicate Tokens
  { name: 'HuggingFace Token', regex: /\bhf_[a-zA-Z0-9]{20,}\b/ },
  { name: 'Cohere / Replicate Token', regex: /\br8_[a-zA-Z0-9]{25,}\b/ },

  // 13. Универсальные высокоэнтропийные секреты (hex-хеши 32/40/64 символов)
  { name: 'High-Entropy Hex Secret', regex: /\b[a-f0-9]{32}\b|\b[a-f0-9]{40}\b|\b[a-f0-9]{64}\b/i }
];

/**
 * Проверяет, содержит ли переданная строка любой секрет или токен.
 * @param {string} text - Проверяемый текст
 * @returns {boolean} true, если обнаружен секрет
 */
function containsSecret(text) {
  if (!text || typeof text !== 'string') return false;
  const str = text.trim();
  for (const item of SECRET_PATTERNS) {
    if (item.regex.test(str)) {
      return true;
    }
  }
  return false;
}

/**
 * Детальная диагностика: возвращает имя обнаруженного типа секрета или null.
 * @param {string} text
 * @returns {string|null}
 */
function detectSecretType(text) {
  if (!text || typeof text !== 'string') return null;
  const str = text.trim();
  for (const item of SECRET_PATTERNS) {
    if (item.regex.test(str)) {
      return item.name;
    }
  }
  return null;
}

/**
 * Рекурсивное сканирование структуры (объекта, массива, строки) на утечки секретов.
 * Возвращает массив найденных нарушений: [{ path, type, sample }]
 */
function scanDataStructure(data, currentPath = '') {
  const violations = [];
  if (!data) return violations;

  if (typeof data === 'string') {
    const type = detectSecretType(data);
    if (type) {
      violations.push({
        path: currentPath || 'root',
        type,
        sample: data.slice(0, 8) + '...'
      });
    }
  } else if (Array.isArray(data)) {
    data.forEach((item, idx) => {
      violations.push(...scanDataStructure(item, `${currentPath}[${idx}]`));
    });
  } else if (typeof data === 'object') {
    for (const [key, val] of Object.entries(data)) {
      const keyType = detectSecretType(key);
      if (keyType) {
        violations.push({
          path: `${currentPath}.${key} (key)`,
          type: keyType,
          sample: key.slice(0, 8) + '...'
        });
      }
      violations.push(...scanDataStructure(val, currentPath ? `${currentPath}.${key}` : key));
    }
  }

  return violations;
}

module.exports = {
  SECRET_PATTERNS,
  containsSecret,
  detectSecretType,
  scanDataStructure
};
