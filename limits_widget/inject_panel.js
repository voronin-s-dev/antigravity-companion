const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../config/companion_config.js');

async function injectWidget() {
  let pkgVersion = '1.4.0';
  try {
    delete require.cache[require.resolve('../package.json')];
    pkgVersion = require('../package.json').version;
  } catch (e) {}
  const diskConfig = loadConfig().limits;
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(activePortFile)) {
    console.error('Antigravity is not running or DevToolsActivePort not found.');
    return;
  }
  const lines = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
  const port = lines[0].trim();

  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
  const page = tabs.find(t => t.type === 'page' && typeof t.url === 'string' && (t.url.includes('127.0.0.1') || t.url.includes('localhost')) && !t.url.startsWith('data:'))
    || tabs.find(t => t.type === 'page' && typeof t.url === 'string' && !t.url.startsWith('data:') && !t.url.startsWith('devtools:') && !t.url.startsWith('chrome:') && !t.url.startsWith('about:'));
  if (!page) {
    console.error('Antigravity page not found');
    return;
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);

  return new Promise((resolve, reject) => {
    ws.onopen = () => {
    const injectionCode = `(() => {
      const diskConfig = ${JSON.stringify(diskConfig)};
      const COMPANION_VERSION = ${JSON.stringify('v' + pkgVersion)};
      let ls = null;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.getItem('__agy_test__');
          ls = window.localStorage;
        }
      } catch (e) {}
      if (!ls) {
        const mem = {};
        ls = {
          getItem: (k) => (k in mem ? mem[k] : null),
          setItem: (k, v) => { mem[k] = String(v); },
          removeItem: (k) => { delete mem[k]; }
        };
      }
      const localStorage = ls;

      if (window.__agyLimitsCleanup) {
        try { window.__agyLimitsCleanup(); } catch (e) {}
      }
      const existing = document.getElementById('agy-limits-floating-panel');
      if (existing) existing.remove();
      const existingTooltip = document.getElementById('agy-limits-tooltip');
      if (existingTooltip) existingTooltip.remove();
      const existingReportModal = document.getElementById('agy-report-modal');
      if (existingReportModal) existingReportModal.remove();
      const existingSettingsModal = document.getElementById('agy-settings-modal-backdrop');
      if (existingSettingsModal) existingSettingsModal.remove();

      // Translations Dictionary
      const I18N = {
        ru: {
          title: 'Лимиты моделей',
          geminiGroup: 'Модели Gemini',
          claudeGroup: 'Модели Claude и GPT',
          weeklyLimit: 'Недельный лимит',
          fiveHourLimit: '5-часовой лимит',
          resetsIn: (d, h, m) => {
            if (d > 0) return \`Сброс через \${d}д \${h}ч\`;
            if (h > 0) return \`Сброс через \${h}ч \${m}м\`;
            return \`Сброс через \${m}м\`;
          },
          resetsInLive: (d, h, m, s) => {
            if (d > 0) return \`Сброс через \${d}д \${h}ч \${m}м \${s}с\`;
            if (h > 0) return \`Сброс через \${h}ч \${m}м \${s}с\`;
            return \`Сброс через \${m}м \${s}с\`;
          },
          resetsNow: 'Сброс прямо сейчас',
          intervalTitle: 'ПЕРИОД АВТООБНОВЛЕНИЯ',
          colorTitle: 'ОТТЕНОК И ЦВЕТ',
          langTitle: 'ЯЗЫК / LANGUAGE',
          placementTitle: 'РЕЖИМ ОТОБРАЖЕНИЯ',
          placementSidebar: 'В боковой панели',
          placementFloating: 'Плавающий виджет',
          pillItemsTitle: 'ЭЛЕМЕНТЫ В МИНИАТЮРЕ',
          gemini5h: 'Gemini (5ч)',
          geminiWeekly: 'Gemini (нед)',
          claude5h: 'Claude (5ч)',
          claudeWeekly: 'Claude (нед)',
          badge5h: '5ч',
          badgeWeekly: 'нед',
          noItemsSelected: 'Ничего не выбрано',
          resetDefault: 'сброс',
          eyedropper: 'Пипетка',
          m1: '1 мин',
          m5: '5 мин',
          m15: '15 мин',
          off: 'Выкл',
          native: 'РОДНОЙ',
          serviceErr: 'Сервис недоступен',
          scaleTitle: 'МАСШТАБ ВИДЖЕТА',
          scaleCompact: 'Мини',
          scaleNormal: 'Обычный',
          scaleLarge: 'Крупный',
          reportBtnTitle: 'Сообщить о непереведенном элементе (Ctrl+V)',
          reportModalTitle: 'Сообщить о непереведенном элементе',
          reportModalDesc: 'Вставьте скриншот по Ctrl+V и кратко опишите проблему',
          reportPastePrompt: 'Нажмите Ctrl+V для вставки скриншота или кликните для выбора файла',
          reportCommentPlaceholder: 'Что не переведено или где это находится (например, в настройках кастомизаций)...',
          reportSendBtn: 'Создать Issue на GitHub',
          reportCancelBtn: 'Отмена',
          reportCopiedNotice: 'Скриншот скопирован в буфер обмена! Вставьте его через Ctrl+V в открывшемся GitHub Issue.',
          reportRemoveImg: 'Удалить снимок',
          soundTitle: 'ЗВУКОВЫЕ СИГНАЛЫ СБРОСА',
          sound5hLabel: '5-часовой лимит',
          soundWeeklyLabel: 'Недельный лимит',
          soundTest: 'Тест',
          soundDefaultSynth: 'По умолчанию (синтез)',
          soundUpload: 'Свой звук',
          soundChange: 'Сменить',
          soundReset: 'Сбросить на стандартный',
          soundTooBig: 'Файл слишком большой (максимум 2 МБ)',
          settingsModalTitle: 'Настройки виджета лимитов',
          settingsSaveBtn: 'Сохранить',
          settingsSavedNotice: '✓ Сохранено',
          settingsCancelBtn: 'Отмена',
          previewTitle: 'ПРЕДПРОСМОТР ВИДЖЕТА',
          themeTitle: 'ТЕМА И ОФОРМЛЕНИЕ',
          themeNative: 'Нативный',
          themeGraphite: 'Графит',
          themeBlue: 'Сапфир',
          themeEmerald: 'Изумруд',
          themePurple: 'Аметист',
          themeAmber: 'Янтарь',
          themeCustom: 'Свой цвет'
        },
        en: {
          title: 'Model Limits',
          geminiGroup: 'Gemini Models',
          claudeGroup: 'Claude and GPT models',
          weeklyLimit: 'Weekly Limit Remaining',
          fiveHourLimit: 'Five Hour Limit Remaining',
          resetsIn: (d, h, m) => {
            if (d > 0) return \`Resets in \${d}d \${h}h\`;
            if (h > 0) return \`Resets in \${h}h \${m}m\`;
            return \`Resets in \${m}m\`;
          },
          resetsInLive: (d, h, m, s) => {
            if (d > 0) return \`Resets in \${d}d \${h}h \${m}m \${s}s\`;
            if (h > 0) return \`Resets in \${h}h \${m}m \${s}s\`;
            return \`Resets in \${m}m \${s}s\`;
          },
          resetsNow: 'Resets right now',
          intervalTitle: 'REFRESH INTERVAL',
          colorTitle: 'TINT & COLOR',
          langTitle: 'LANGUAGE',
          placementTitle: 'DISPLAY MODE',
          placementSidebar: 'In Sidebar (docked)',
          placementFloating: 'Floating Widget',
          pillItemsTitle: 'MINIATURE ITEMS',
          gemini5h: 'Gemini (5h)',
          geminiWeekly: 'Gemini (wk)',
          claude5h: 'Claude (5h)',
          claudeWeekly: 'Claude (wk)',
          badge5h: '5h',
          badgeWeekly: 'wk',
          noItemsSelected: 'No items selected',
          resetDefault: 'native',
          eyedropper: 'Eyedropper',
          m1: '1m',
          m5: '5m',
          m15: '15m',
          off: 'Off',
          native: 'NATIVE',
          serviceErr: 'Service unavailable',
          scaleTitle: 'WIDGET SCALE',
          scaleCompact: 'Mini',
          scaleNormal: 'Normal',
          scaleLarge: 'Large',
          reportBtnTitle: 'Report untranslated element (Ctrl+V)',
          reportModalTitle: 'Report untranslated element',
          reportModalDesc: 'Paste screenshot via Ctrl+V and describe the issue',
          reportPastePrompt: 'Press Ctrl+V to paste screenshot or click to choose file',
          reportCommentPlaceholder: 'What is untranslated or where is it located...',
          reportSendBtn: 'Create Issue on GitHub',
          reportCancelBtn: 'Cancel',
          reportCopiedNotice: 'Screenshot copied to clipboard! Paste it via Ctrl+V into the GitHub Issue description.',
          reportRemoveImg: 'Remove image',
          soundTitle: 'RESET SOUND ALERTS',
          sound5hLabel: '5-hour limit reset alert',
          soundWeeklyLabel: 'Weekly limit reset alert',
          soundTest: 'Test',
          soundDefaultSynth: 'Default (synthesizer)',
          soundUpload: 'Custom sound',
          soundChange: 'Change',
          soundReset: 'Reset to default',
          soundTooBig: 'File is too large (max 2 MB)',
          settingsModalTitle: 'Model Limits Settings',
          settingsSaveBtn: 'Save',
          settingsSavedNotice: '✓ Saved',
          settingsCancelBtn: 'Cancel',
          previewTitle: 'WIDGET PREVIEW',
          themeTitle: 'THEME & COLOR',
          themeNative: 'Native',
          themeGraphite: 'Graphite',
          themeBlue: 'Sapphire',
          themeEmerald: 'Emerald',
          themePurple: 'Amethyst',
          themeAmber: 'Amber',
          themeCustom: 'Custom'
        }
      };

      let currentLang = (diskConfig && diskConfig.lang) || localStorage.getItem('agy_lang') || localStorage.getItem('agy_limits_lang') || 'ru';
      localStorage.setItem('agy_lang', currentLang);

      function t(key, ...args) {
        const dict = I18N[currentLang] || I18N.ru;
        const val = dict[key] || I18N.en[key] || key;
        return typeof val === 'function' ? val(...args) : val;
      }

      function getQuotaService() {
        const root = document.querySelector('#root') || document.body;
        const key = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer'));
        if (!key) return null;
        let queue = [root[key]];
        while (queue.length > 0) {
          let node = queue.shift();
          if (!node) continue;
          if (node.memoizedProps && node.memoizedProps.value) {
            const val = node.memoizedProps.value;
            if (val.retrieveUserQuotaSummary) return val;
            if (val.core?.cloudCodeService?.retrieveUserQuotaSummary) return val.core.cloudCodeService;
          }
          if (node.child) queue.push(node.child);
          if (node.sibling) queue.push(node.sibling);
        }
        return null;
      }

      function formatReset(seconds) {
        if (!seconds) return '';
        const now = Math.floor(Date.now() / 1000);
        const diff = Math.max(0, parseInt(seconds) - now);
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        return t('resetsIn', days, hours, mins);
      }

      function formatResetLive(seconds) {
        if (!seconds) return '';
        const now = Math.floor(Date.now() / 1000);
        const diff = Math.max(0, parseInt(seconds) - now);
        if (diff === 0) return t('resetsNow');
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const mins = Math.floor((diff % 3600) / 60);
        const secs = diff % 60;
        return t('resetsInLive', days, hours, mins, secs);
      }

      function getColor(fraction) {
        if (fraction < 0.10) return '#ef4444';
        if (fraction < 0.25) return '#eab308';
        return '#22c55e';
      }

      function hexToRgb(hex) {
        let clean = hex.replace('#', '');
        if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
        const num = parseInt(clean, 16);
        return {
          r: (num >> 16) & 255,
          g: (num >> 8) & 255,
          b: num & 255
        };
      }

      // Live Tooltip element
      const tooltip = document.createElement('div');
      tooltip.id = 'agy-limits-tooltip';
      tooltip.style.cssText = \`
        position: fixed;
        display: none;
        opacity: 0;
        pointer-events: none;
        z-index: 10000000;
        background: rgb(32, 30, 26);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
        border-radius: 7px;
        padding: 6px 9px;
        font-family: var(--vscode-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        color: #f4f4f5;
        font-size: 11px;
        user-select: none;
        white-space: nowrap;
        transition: opacity 0.12s cubic-bezier(0.16, 1, 0.3, 1), transform 0.12s cubic-bezier(0.16, 1, 0.3, 1);
        transform: translateY(2px);
      \`;
      document.body.appendChild(tooltip);

      let tooltipTimer = null;
      let activeBadge = null;

      function updateActiveTooltip() {
        if (!activeBadge) return;
        const resetSec = activeBadge.dataset.reset;
        const title = activeBadge.dataset.title;
        const liveText = formatResetLive(resetSec);

        let etaText = '';
        if (resetSec) {
          const resetMs = parseInt(resetSec, 10) * 1000;
          if (resetMs > Date.now()) {
            const date = new Date(resetMs);
            const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const isToday = date.toDateString() === new Date().toDateString();
            if (isToday) {
              etaText = currentLang === 'ru' ? \`в \${timeStr}\` : \`at \${timeStr}\`;
            } else {
              const dayStr = date.toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US', { weekday: 'short' });
              etaText = currentLang === 'ru' ? \`\${dayStr}, в \${timeStr}\` : \`\${dayStr}, at \${timeStr}\`;
            }
          }
        }

        const fullTimeStr = liveText ? (liveText + (etaText ? \` (\${etaText})\` : '')) : t('resetsNow');

        tooltip.innerHTML = \`
          <div style="font-weight: 600; font-size: 11px; color: #f4f4f5; margin-bottom: 2px;">\${title}</div>
          <div style="font-size: 10px; color: #a1a1aa; display: flex; align-items: center; gap: 4px;">
            <span style="color: #22c55e;">⏱</span>
            <span>\${fullTimeStr}</span>
          </div>
        \`;
      }

      function showBadgeTooltip(badge) {
        activeBadge = badge;
        updateActiveTooltip();

        tooltip.style.display = 'block';
        badge.style.background = 'rgba(255, 255, 255, 0.12)';
        badge.style.borderColor = 'rgba(255, 255, 255, 0.2)';

        const badgeRect = badge.getBoundingClientRect();
        const tipRect = tooltip.getBoundingClientRect();

        let top = badgeRect.top - tipRect.height - 7;
        if (top < 10) {
          top = badgeRect.bottom + 7;
          tooltip.style.transform = 'translateY(-2px)';
        } else {
          tooltip.style.transform = 'translateY(0px)';
        }

        let left = badgeRect.left + (badgeRect.width - tipRect.width) / 2;
        left = Math.max(10, Math.min(window.innerWidth - tipRect.width - 10, left));

        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        tooltip.style.opacity = '1';

        if (tooltipTimer) clearInterval(tooltipTimer);
        tooltipTimer = setInterval(updateActiveTooltip, 1000);
      }

      function hideBadgeTooltip() {
        if (activeBadge) {
          activeBadge.style.background = 'rgba(255, 255, 255, 0.06)';
          activeBadge.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          activeBadge = null;
        }
        if (tooltipTimer) {
          clearInterval(tooltipTimer);
          tooltipTimer = null;
        }
        tooltip.style.opacity = '0';
        setTimeout(() => {
          if (!activeBadge) tooltip.style.display = 'none';
        }, 150);
      }

      const container = document.createElement('div');
      container.id = 'agy-limits-floating-panel';

      const THEME_PRESETS = {
        native: {
          key: 'native',
          nameRu: 'Нативный',
          nameEn: 'Native',
          bg: '#18181c',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
          accent: '#BD9574',
          badgeBg: 'rgba(255, 255, 255, 0.06)'
        },
        graphite: {
          key: 'graphite',
          nameRu: 'Графит',
          nameEn: 'Graphite',
          bg: '#202124',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
          accent: '#9aa0a6',
          badgeBg: 'rgba(255, 255, 255, 0.08)'
        },
        blue: {
          key: 'blue',
          nameRu: 'Сапфир',
          nameEn: 'Sapphire',
          bg: 'linear-gradient(145deg, #0b1329 0%, #172554 100%)',
          border: '1px solid rgba(59, 130, 246, 0.45)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
          accent: '#60a5fa',
          badgeBg: 'rgba(59, 130, 246, 0.15)'
        },
        emerald: {
          key: 'emerald',
          nameRu: 'Изумруд',
          nameEn: 'Emerald',
          bg: 'linear-gradient(145deg, #041f17 0%, #064e3b 100%)',
          border: '1px solid rgba(16, 185, 129, 0.45)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
          accent: '#34d399',
          badgeBg: 'rgba(16, 185, 129, 0.15)'
        },
        purple: {
          key: 'purple',
          nameRu: 'Аметист',
          nameEn: 'Amethyst',
          bg: 'linear-gradient(145deg, #180b2c 0%, #4c1d95 100%)',
          border: '1px solid rgba(139, 92, 246, 0.45)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
          accent: '#a78bfa',
          badgeBg: 'rgba(139, 92, 246, 0.15)'
        },
        amber: {
          key: 'amber',
          nameRu: 'Янтарь',
          nameEn: 'Amber',
          bg: 'linear-gradient(145deg, #241403 0%, #78350f 100%)',
          border: '1px solid rgba(245, 158, 11, 0.45)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
          accent: '#fbbf24',
          badgeBg: 'rgba(245, 158, 11, 0.15)'
        }
      };

      function getThemeStyle(keyOrHex) {
        if (THEME_PRESETS[keyOrHex]) return THEME_PRESETS[keyOrHex];
        const hex = (keyOrHex && keyOrHex.startsWith('#')) ? keyOrHex : '#BD9574';
        const { r, g, b } = hexToRgb(hex);
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const isLight = lum > 0.6;
        return {
          key: 'custom',
          nameRu: 'Свой цвет',
          nameEn: 'Custom',
          bg: hex,
          border: isLight ? '1px solid rgba(0, 0, 0, 0.2)' : '1px solid rgba(255, 255, 255, 0.14)',
          boxShadow: isLight ? '0 4px 12px rgba(0, 0, 0, 0.15)' : '0 4px 12px rgba(0, 0, 0, 0.35)',
          accent: hex,
          color: isLight ? '#18181b' : '#f4f4f5'
        };
      }

      let currentPlacement = (diskConfig && diskConfig.placement) || localStorage.getItem('agy_limits_placement') || 'sidebar';
      let currentTint = (diskConfig && diskConfig.tint) || localStorage.getItem('agy_limits_tint') || 'native';
      let currentScale = (diskConfig && diskConfig.scale) || localStorage.getItem('agy_limits_scale') || 'normal';
      let currentIntervalMs = (diskConfig && diskConfig.intervalMs) || parseInt(localStorage.getItem('agy_limits_interval') || '300000', 10);
      let sound5hEnabled = (diskConfig && typeof diskConfig.sound5h === 'boolean') ? diskConfig.sound5h : (localStorage.getItem('agy_sound_5h') !== 'false');
      let soundWeeklyEnabled = (diskConfig && typeof diskConfig.soundWeekly === 'boolean') ? diskConfig.soundWeekly : (localStorage.getItem('agy_sound_weekly') !== 'false');
      let sound5hCustom = (diskConfig && diskConfig.sound5hCustom) || localStorage.getItem('agy_sound_5h_custom') || null;
      let sound5hCustomName = (diskConfig && diskConfig.sound5hCustomName) || localStorage.getItem('agy_sound_5h_custom_name') || '';
      let soundWeeklyCustom = (diskConfig && diskConfig.soundWeeklyCustom) || localStorage.getItem('agy_sound_weekly_custom') || null;
      let soundWeeklyCustomName = (diskConfig && diskConfig.soundWeeklyCustomName) || localStorage.getItem('agy_sound_weekly_custom_name') || '';
      let prevBucketFractions = null;

      function applyThemeColor(val, commit = true) {
        const tint = val || 'native';
        if (commit) currentTint = tint;
        const st = getThemeStyle(tint);
        container.style.background = st.bg;
        container.style.border = st.border;
        container.style.boxShadow = st.boxShadow;
        container.style.color = st.color || '#f4f4f5';
      }

      async function saveAllSettingsToDisk(cfg) {
        try {
          localStorage.setItem('agy_limits_placement', currentPlacement);
          localStorage.setItem('agy_limits_tint', currentTint);
          localStorage.setItem('agy_limits_pill_items', JSON.stringify(pillItems));
          localStorage.setItem('agy_limits_scale', currentScale);
          localStorage.setItem('agy_limits_interval', String(currentIntervalMs));
          localStorage.setItem('agy_sound_5h', sound5hEnabled ? 'true' : 'false');
          localStorage.setItem('agy_sound_weekly', soundWeeklyEnabled ? 'true' : 'false');
          if (sound5hCustom) localStorage.setItem('agy_sound_5h_custom', sound5hCustom);
          else localStorage.removeItem('agy_sound_5h_custom');
          localStorage.setItem('agy_sound_5h_custom_name', sound5hCustomName || '');
          if (soundWeeklyCustom) localStorage.setItem('agy_sound_weekly_custom', soundWeeklyCustom);
          else localStorage.removeItem('agy_sound_weekly_custom');
          localStorage.setItem('agy_sound_weekly_custom_name', soundWeeklyCustomName || '');
          localStorage.setItem('agy_limits_lang', currentLang);
          localStorage.setItem('agy_lang', currentLang);
        } catch (e) {}

        const payload = {
          placement: currentPlacement,
          tint: currentTint,
          pillItems,
          scale: currentScale,
          intervalMs: currentIntervalMs,
          sound5h: sound5hEnabled,
          soundWeekly: soundWeeklyEnabled,
          sound5hCustom,
          sound5hCustomName,
          soundWeeklyCustom,
          soundWeeklyCustomName,
          lang: currentLang,
          position: (function() {
            try { return JSON.parse(localStorage.getItem('agy_limits_pos')); } catch(e){ return null; }
          })()
        };

        try {
          await fetch('http://127.0.0.1:9229/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (e) {
          console.warn('[Companion Sync] HTTP server unreachable, cached in localStorage:', e.message);
        }
      }

      container.style.cssText = \`
        position: fixed;
        width: 270px;
        border-radius: 10px;
        padding: 10px 12px;
        color: #f4f4f5;
        font-family: var(--vscode-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
        font-size: 12px;
        z-index: 9999999;
        user-select: none;
        box-sizing: border-box;
        transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1), padding 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s cubic-bezier(0.16, 1, 0.3, 1), background 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      \`;

      let isCollapsed = localStorage.getItem('agy_limits_collapsed') === 'true';

      // Web Audio API Sound Synthesizer (100% offline fallback)
      function playSynthesizedSound(type) {
        try {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (!AudioContextClass) return;
          const ctx = new AudioContextClass();

          if (type === '5h') {
            // Pleasant ascending 2-tone chime: D5 (587.33 Hz) -> A5 (880 Hz)
            const notes = [
              { freq: 587.33, start: 0, duration: 0.15 },
              { freq: 880.00, start: 0.12, duration: 0.35 }
            ];
            notes.forEach(n => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'sine';
              osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.start);
              gain.gain.setValueAtTime(0.001, ctx.currentTime + n.start);
              gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + n.start + 0.02);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.start + n.duration);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start(ctx.currentTime + n.start);
              osc.stop(ctx.currentTime + n.start + n.duration);
            });
          } else if (type === 'weekly') {
            // Triumphant 4-note major chord arpeggio: C5 -> E5 -> G5 -> C6
            const notes = [
              { freq: 523.25, start: 0, duration: 0.2 },
              { freq: 659.25, start: 0.1, duration: 0.25 },
              { freq: 783.99, start: 0.2, duration: 0.3 },
              { freq: 1046.50, start: 0.3, duration: 0.5 }
            ];
            notes.forEach(n => {
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = 'triangle';
              osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.start);
              gain.gain.setValueAtTime(0.001, ctx.currentTime + n.start);
              gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + n.start + 0.03);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.start + n.duration);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start(ctx.currentTime + n.start);
              osc.stop(ctx.currentTime + n.start + n.duration);
            });
          }
        } catch (e) {
          console.warn('[Antigravity Sound Error]', e);
        }
      }

      // Play alert: uses custom user sound if configured, otherwise synthesizer
      function playResetSound(type) {
        try {
          const customData = (type === '5h')
            ? localStorage.getItem('agy_sound_5h_custom')
            : localStorage.getItem('agy_sound_weekly_custom');

          if (customData) {
            const audio = new Audio(customData);
            audio.volume = 0.85;
            audio.play().catch(err => {
              console.warn('[Antigravity Custom Audio Error, falling back to synth]', err);
              playSynthesizedSound(type);
            });
            return;
          }
        } catch (e) {
          console.warn('[Antigravity Audio Error]', e);
        }
        playSynthesizedSound(type);
      }

      function handleSoundUpload(type, file) {
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
          alert(t('soundTooBig'));
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const dataUrl = evt.target.result;
            if (type === '5h') {
              localStorage.setItem('agy_sound_5h_custom', dataUrl);
              localStorage.setItem('agy_sound_5h_custom_name', file.name);
            } else {
              localStorage.setItem('agy_sound_weekly_custom', dataUrl);
              localStorage.setItem('agy_sound_weekly_custom_name', file.name);
            }
            renderSettingsContent();
            updateSettingsButtons();
            playResetSound(type);
          } catch (err) {
            console.error('[Antigravity Sound Storage Error]', err);
            alert('Ошибка сохранения звука: возможно, превышен лимит localStorage.');
          }
        };
        reader.readAsDataURL(file);
      }

      function resetSoundToDefault(type) {
        if (type === '5h') {
          localStorage.removeItem('agy_sound_5h_custom');
          localStorage.removeItem('agy_sound_5h_custom_name');
        } else {
          localStorage.removeItem('agy_sound_weekly_custom');
          localStorage.removeItem('agy_sound_weekly_custom_name');
        }
        renderSettingsContent();
        updateSettingsButtons();
        playResetSound(type);
      }

      // Official Brand SVGs
      const GEMINI_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display: inline-block; vertical-align: middle; flex-shrink: 0;" title="Google Gemini"><path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" fill="#9d7fe6"/></svg>';
      const CLAUDE_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#D97757" style="display: inline-block; vertical-align: middle; flex-shrink: 0;" title="Claude (Anthropic)"><path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"/></svg>';

      // Miniature Pill items preferences
      const DEFAULT_PILL_ITEMS = ['gemini_5h', 'gemini_weekly', 'claude_5h', 'claude_weekly'];
      let pillItems;
      if (diskConfig && Array.isArray(diskConfig.pillItems) && diskConfig.pillItems.length > 0) {
        pillItems = diskConfig.pillItems;
      } else {
        try {
          pillItems = JSON.parse(localStorage.getItem('agy_limits_pill_items') || 'null');
          if (!Array.isArray(pillItems) || pillItems.length === 0) pillItems = DEFAULT_PILL_ITEMS;
        } catch (e) {
          pillItems = DEFAULT_PILL_ITEMS;
        }
      }

      function keyToI18n(key) {
        switch (key) {
          case 'gemini_5h': return 'gemini5h';
          case 'gemini_weekly': return 'geminiWeekly';
          case 'claude_5h': return 'claude5h';
          case 'claude_weekly': return 'claudeWeekly';
        }
        return key;
      }

      // Header
      const header = document.createElement('div');
      header.id = 'agy-panel-header';
      header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 7px; margin-bottom: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.07); cursor: move;';
      header.innerHTML = \`
        <div style="display: flex; align-items: center; gap: 6px;">
          <svg style="width: 14px; height: 14px; color: #a1a1aa;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <span id="agy-title-text" style="font-weight: 500; font-size: 12px; color: #f4f4f5;">\${t('title')}</span>
          <span id="agy-header-step-count" style="display: none; font-size: 9.5px; font-weight: 600; padding: 1px 4px; border-radius: 3px; background: rgba(255, 255, 255, 0.08); margin-left: 2px;"></span>
        </div>
        <div style="display: flex; gap: 2px; align-items: center;">
          <button id="agy-report-btn" title="\${t('reportBtnTitle')}" style="background: none; border: none; color: #85858b; cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 11px; line-height: 1; transition: background 0.12s, color 0.12s; display: flex; align-items: center; justify-content: center;">
            <svg style="width: 13px; height: 13px; pointer-events: none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path>
              <circle cx="12" cy="13" r="3"></circle>
            </svg>
          </button>
          <button id="agy-gear-btn" title="Настройки" style="background: none; border: none; color: #85858b; cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 11px; line-height: 1; transition: background 0.12s, color 0.12s; display: flex; align-items: center; justify-content: center;">
            <svg style="width: 13px; height: 13px; pointer-events: none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
          <button id="agy-refresh-btn" title="Обновить" style="background: none; border: none; color: #85858b; cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 11px; line-height: 1; transition: background 0.12s, color 0.12s; display: flex; align-items: center; justify-content: center;">
            <svg style="width: 13px; height: 13px; pointer-events: none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
          </button>
          <button id="agy-collapse-btn" title="Свернуть / Развернуть" style="background: none; border: none; color: #85858b; cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 12px; line-height: 1; transition: background 0.12s, color 0.12s;">─</button>
          <button id="agy-close-btn" title="\${currentLang === 'ru' ? 'Скрыть (Alt+L)' : 'Hide (Alt+L)'}" style="background: none; border: none; color: #6b6b72; cursor: pointer; padding: 4px 6px; border-radius: 4px; font-size: 13px; line-height: 1; transition: background 0.12s, color 0.12s;">×</button>
        </div>
      \`;

      // ==========================================
      // In-Widget Settings Panel (Compact & Neat)
      // ==========================================
      const oldModalBackdrop = document.getElementById('agy-settings-modal-backdrop');
      if (oldModalBackdrop) oldModalBackdrop.remove();

      let isSettingsOpen = false;
      let wasCollapsedBeforeSettings = false;
      let draftSettings = null;

      function switchLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('agy_limits_lang', lang);
        localStorage.setItem('agy_lang', lang);
        window.dispatchEvent(new CustomEvent('agy-language-change', { detail: { lang } }));
        header.querySelector('#agy-title-text').textContent = isSettingsOpen ? t('settingsModalTitle') : t('title');
        const cBtn = header.querySelector('#agy-close-btn');
        if (cBtn) cBtn.title = lang === 'ru' ? 'Скрыть (Alt+L)' : 'Hide (Alt+L)';
        updateSidebarButtonState(isVisible);
        updateLimits();
      }

      const settingsPanel = document.createElement('div');
      settingsPanel.id = 'agy-panel-settings';
      settingsPanel.style.cssText = \`
        display: none;
        flex-direction: column;
        gap: 8px;
        max-height: 380px;
        overflow-y: auto;
        overflow-x: hidden;
        padding-right: 2px;
        font-size: 11px;
        box-sizing: border-box;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
      \`;

      function renderSettingsContent() {
        if (!draftSettings) return;
        const d = draftSettings;

        settingsPanel.innerHTML = \`
          <!-- Section 1: Themes & Colors -->
          <div>
            <div style="color: #a1a1aa; font-size: 9.5px; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 5px;">\${t('themeTitle')}</div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin-bottom: 6px;">
              \${Object.values(THEME_PRESETS).map(p => {
                const isSel = d.tint === p.key;
                return \`
                  <button class="agy-theme-preset-btn" data-key="\${p.key}" style="padding: 4px 6px; border-radius: 5px; font-size: 10px; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; background: \${isSel ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)'}; border: 1px solid \${isSel ? (p.accent || '#fff') : 'rgba(255,255,255,0.08)'}; color: \${isSel ? '#fff' : '#a1a1aa'}; transition: all 0.12s;">
                    <span style="display: flex; align-items: center; gap: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      <span style="width: 8px; height: 8px; border-radius: 50%; background: \${p.accent}; display: inline-block; flex-shrink: 0;"></span>
                      <span>\${currentLang === 'ru' ? p.nameRu : p.nameEn}</span>
                    </span>
                    \${isSel ? '<span style="color: #22c55e; font-weight: 700; font-size: 10px;">✓</span>' : ''}
                  </button>
                \`;
              }).join('')}
            </div>

            <!-- Custom Color / Eyedropper -->
            <div id="agy-settings-custom-color-row" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; background: \${d.tint.startsWith('#') ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)'}; border: 1px solid \${d.tint.startsWith('#') ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'}; border-radius: 5px; transition: all 0.12s;">
              <span style="color: \${d.tint.startsWith('#') ? '#fff' : '#71717a'}; font-size: 10px; display: flex; align-items: center; gap: 4px;">
                <span>\${t('themeCustom')}:</span>
                \${d.tint.startsWith('#') ? '<span style="color: #22c55e; font-weight: 700; font-size: 10px;">✓</span>' : ''}
              </span>
              <div style="display: flex; align-items: center; gap: 5px;">
                <div style="position: relative; width: 18px; height: 18px; border-radius: 3px; overflow: hidden; border: 1px solid \${d.tint.startsWith('#') ? d.tint : 'rgba(255,255,255,0.2)'}; cursor: pointer;">
                  <input type="color" id="agy-settings-color-picker" value="\${d.tint.startsWith('#') ? d.tint : '#BD9574'}" style="position: absolute; top: -6px; left: -6px; width: 32px; height: 32px; cursor: pointer; border: none; background: transparent;">
                </div>
                <button id="agy-settings-eyedropper-btn" style="display: flex; align-items: center; gap: 3px; padding: 2px 5px; border-radius: 3px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); color: #d4d4d8; font-size: 9.5px; cursor: pointer;">
                  <svg style="width: 10px; height: 10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m2 22 1-1h3l9-9"></path><path d="M3 21v-3l9-9"></path><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1 3 3l-3.8 3.8a2.1 2.1 0 1 1-3-3l.4-.4"></path></svg>
                  <span>\${t('eyedropper')}</span>
                </button>
                <span id="agy-settings-hex-label" style="font-family: monospace; font-size: 9.5px; font-weight: \${d.tint.startsWith('#') ? '600' : '400'}; color: \${d.tint.startsWith('#') ? '#fff' : '#a1a1aa'};">\${d.tint.startsWith('#') ? d.tint.toUpperCase() : (currentLang === 'ru' ? 'Пресет' : 'Preset')}</span>
              </div>
            </div>
          </div>

          <!-- Section: Placement -->
          <div>
            <div style="color: #a1a1aa; font-size: 9.5px; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 5px;">\${t('placementTitle')}</div>
            <div style="display: flex; gap: 4px;">
              <button class="agy-settings-placement-btn" data-placement="sidebar" style="flex: 1; padding: 4px 6px; border-radius: 4px; font-size: 10px; cursor: pointer; text-align: center; background: \${(d.placement || 'sidebar') === 'sidebar' ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.02)'}; border: 1px solid \${(d.placement || 'sidebar') === 'sidebar' ? '#2563eb' : 'rgba(255,255,255,0.06)'}; color: \${(d.placement || 'sidebar') === 'sidebar' ? '#93c5fd' : '#a1a1aa'}; transition: all 0.12s;">
                \${t('placementSidebar')}
              </button>
              <button class="agy-settings-placement-btn" data-placement="floating" style="flex: 1; padding: 4px 6px; border-radius: 4px; font-size: 10px; cursor: pointer; text-align: center; background: \${d.placement === 'floating' ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.02)'}; border: 1px solid \${d.placement === 'floating' ? '#2563eb' : 'rgba(255,255,255,0.06)'}; color: \${d.placement === 'floating' ? '#93c5fd' : '#a1a1aa'}; transition: all 0.12s;">
                \${t('placementFloating')}
              </button>
            </div>
          </div>

          <!-- Section 2: Pill Items Selection -->
          <div>
            <div style="color: #a1a1aa; font-size: 9.5px; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 5px;">\${t('pillItemsTitle')}</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
              \${['gemini_5h', 'gemini_weekly', 'claude_5h', 'claude_weekly'].map(key => {
                const isSel = d.pillItems.includes(key);
                const label = t(keyToI18n(key));
                return \`
                  <button class="agy-settings-pill-btn" data-key="\${key}" style="padding: 4px 6px; border-radius: 4px; font-size: 10px; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; background: \${isSel ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.02)'}; border: 1px solid \${isSel ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.06)'}; color: \${isSel ? '#fff' : '#71717a'}; transition: all 0.12s;">
                    <span>\${label}</span>
                    <span style="color: \${isSel ? '#22c55e' : '#52525b'}; font-weight: 700; font-size: 10px;">\${isSel ? '✓' : '+'}</span>
                  </button>
                \`;
              }).join('')}
            </div>
          </div>

          <!-- Section 3: Refresh Interval -->
          <div>
            <div style="color: #a1a1aa; font-size: 9.5px; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 5px;">\${t('intervalTitle')}</div>
            <div style="display: flex; gap: 3px;">
              \${[{ ms: 60000, l: t('m1') }, { ms: 300000, l: t('m5') }, { ms: 900000, l: t('m15') }, { ms: 0, l: t('off') }].map(item => {
                const isSel = d.intervalMs === item.ms;
                return \`<button class="agy-settings-int-btn" data-ms="\${item.ms}" style="flex: 1; padding: 4px 2px; border-radius: 4px; font-size: 9.5px; cursor: pointer; background: \${isSel ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.03)'}; border: 1px solid \${isSel ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.06)'}; color: \${isSel ? '#fff' : '#85858b'}; font-weight: \${isSel ? '600' : '400'};">\${item.l}</button>\`;
              }).join('')}
            </div>
          </div>

          <!-- Section 4: Sound Alerts -->
          <div>
            <div style="color: #a1a1aa; font-size: 9.5px; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 5px;">\${t('soundTitle')}</div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
              <!-- 5h limit sound -->
              <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 5px; padding: 5px 7px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
                  <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 10.5px; color: #d4d4d8;">
                    <input type="checkbox" id="agy-settings-sound-5h" \${d.sound5h ? 'checked' : ''} style="cursor: pointer; accent-color: #22c55e;">
                    <span style="font-weight: 500;">\${t('sound5hLabel')}</span>
                  </label>
                  <button id="agy-settings-sound-5h-test" title="\${t('soundTest')}" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #e4e4e7; border-radius: 4px; padding: 1px 6px; font-size: 9.5px; cursor: pointer; display: flex; align-items: center; gap: 3px;">
                    <span>🔔</span><span>\${t('soundTest')}</span>
                  </button>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9px; padding-left: 17px;">
                  <input type="file" id="agy-settings-sound-5h-file" accept="audio/*" style="display: none;">
                  <span title="\${d.sound5hCustomName || t('soundDefaultSynth')}" style="color: #8a8784; max-width: 140px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                    \${d.sound5hCustomName ? '🎵 ' + d.sound5hCustomName : '🎹 ' + t('soundDefaultSynth')}
                  </span>
                  <div style="display: flex; align-items: center; gap: 3px;">
                    <button id="agy-settings-sound-5h-upload-btn" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: #a1a1aa; border-radius: 3px; padding: 1px 5px; font-size: 9px; cursor: pointer;">
                      \${d.sound5hCustomName ? t('soundChange') : t('soundUpload')}
                    </button>
                    \${d.sound5hCustomName ? '<button id="agy-settings-sound-5h-reset-btn" title="' + t('soundReset') + '" style="background: none; border: none; color: #f87171; font-size: 10px; cursor: pointer; padding: 0 2px;">✕</button>' : ''}
                  </div>
                </div>
              </div>

              <!-- Weekly limit sound -->
              <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 5px; padding: 5px 7px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 3px;">
                  <label style="display: flex; align-items: center; gap: 5px; cursor: pointer; font-size: 10.5px; color: #d4d4d8;">
                    <input type="checkbox" id="agy-settings-sound-weekly" \${d.soundWeekly ? 'checked' : ''} style="cursor: pointer; accent-color: #22c55e;">
                    <span style="font-weight: 500;">\${t('soundWeeklyLabel')}</span>
                  </label>
                  <button id="agy-settings-sound-weekly-test" title="\${t('soundTest')}" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #e4e4e7; border-radius: 4px; padding: 1px 6px; font-size: 9.5px; cursor: pointer; display: flex; align-items: center; gap: 3px;">
                    <span>🎉</span><span>\${t('soundTest')}</span>
                  </button>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9px; padding-left: 17px;">
                  <input type="file" id="agy-settings-sound-weekly-file" accept="audio/*" style="display: none;">
                  <span title="\${d.soundWeeklyCustomName || t('soundDefaultSynth')}" style="color: #8a8784; max-width: 140px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                    \${d.soundWeeklyCustomName ? '🎵 ' + d.soundWeeklyCustomName : '🎹 ' + t('soundDefaultSynth')}
                  </span>
                  <div style="display: flex; align-items: center; gap: 3px;">
                    <button id="agy-settings-sound-weekly-upload-btn" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: #a1a1aa; border-radius: 3px; padding: 1px 5px; font-size: 9px; cursor: pointer;">
                      \${d.soundWeeklyCustomName ? t('soundChange') : t('soundUpload')}
                    </button>
                    \${d.soundWeeklyCustomName ? '<button id="agy-settings-sound-weekly-reset-btn" title="' + t('soundReset') + '" style="background: none; border: none; color: #f87171; font-size: 10px; cursor: pointer; padding: 0 2px;">✕</button>' : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 5: Language Switcher -->
          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.06);">
            <span style="color: #a1a1aa; font-size: 9.5px; font-weight: 600; letter-spacing: 0.5px;">\${t('langTitle')}</span>
            <div style="display: flex; gap: 2px;">
              <button id="agy-settings-lang-ru" style="padding: 2px 7px; border-radius: 3px; font-size: 9.5px; font-weight: \${d.lang === 'ru' ? '600' : '400'}; background: \${d.lang === 'ru' ? 'rgba(255,255,255,0.14)' : 'transparent'}; border: 1px solid \${d.lang === 'ru' ? 'rgba(255,255,255,0.2)' : 'transparent'}; color: \${d.lang === 'ru' ? '#fff' : '#85858b'}; cursor: pointer;">RU</button>
              <button id="agy-settings-lang-en" style="padding: 2px 7px; border-radius: 3px; font-size: 9.5px; font-weight: \${d.lang === 'en' ? '600' : '400'}; background: \${d.lang === 'en' ? 'rgba(255,255,255,0.14)' : 'transparent'}; border: 1px solid \${d.lang === 'en' ? 'rgba(255,255,255,0.2)' : 'transparent'}; color: \${d.lang === 'en' ? '#fff' : '#85858b'}; cursor: pointer;">EN</button>
            </div>
          </div>

          <!-- Section 6: Service Controls & Updates -->
          <div style="padding-top: 5px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 4px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="color: #a1a1aa; font-size: 9.5px; font-weight: 600; letter-spacing: 0.5px;">\${currentLang === 'ru' ? 'Управление и обновления' : 'Controls & Updates'}</span>
              <span style="font-size: 9px; color: #22c55e;">● \${COMPANION_VERSION}</span>
            </div>
            <div style="display: flex; gap: 4px;">
              <button id="agy-settings-reload-btn" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 3px 6px; border-radius: 4px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); color: #d4d4d8; font-size: 9.5px; cursor: pointer; transition: all 0.12s;">
                <span>🔄</span>
                <span>\${currentLang === 'ru' ? 'Перезагрузить UI' : 'Hot Reload'}</span>
              </button>
              <button id="agy-settings-check-update-btn" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 3px 6px; border-radius: 4px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); color: #d4d4d8; font-size: 9.5px; cursor: pointer; transition: all 0.12s;">
                <span>🌐</span>
                <span>\${currentLang === 'ru' ? 'Обновления' : 'Updates'}</span>
              </button>
            </div>
            <div id="agy-settings-update-msg" style="display: none; font-size: 9.5px; padding: 2px 4px; border-radius: 3px; margin-top: 1px; text-align: center;"></div>
          </div>

          <!-- Footer Actions -->
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.08); margin-top: 2px;">
            <button id="agy-settings-cancel-btn" style="padding: 4px 10px; border-radius: 5px; font-size: 10.5px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #a1a1aa; cursor: pointer; transition: all 0.12s;">
              \${t('settingsCancelBtn')}
            </button>
            <button id="agy-settings-save-btn" style="padding: 4px 14px; border-radius: 5px; font-size: 10.5px; font-weight: 600; background: #2563eb; border: 1px solid rgba(255,255,255,0.2); color: #ffffff; cursor: pointer; display: flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2); transition: all 0.15s;">
              <span id="agy-settings-save-icon">💾</span>
              <span id="agy-settings-save-text">\${t('settingsSaveBtn')}</span>
            </button>
          </div>
        \`;

        // Bind event listeners inside settingsPanel:
        const cancelBtn = settingsPanel.querySelector('#agy-settings-cancel-btn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => closeSettings(true));
        }

        const saveBtn = settingsPanel.querySelector('#agy-settings-save-btn');
        if (saveBtn) {
          saveBtn.addEventListener('click', async () => {
            currentPlacement = d.placement || currentPlacement;
            currentTint = d.tint;
            pillItems = [...d.pillItems];
            currentScale = d.scale;
            currentIntervalMs = d.intervalMs;
            sound5hEnabled = d.sound5h;
            soundWeeklyEnabled = d.soundWeekly;
            sound5hCustom = d.sound5hCustom;
            sound5hCustomName = d.sound5hCustomName;
            soundWeeklyCustom = d.soundWeeklyCustom;
            soundWeeklyCustomName = d.soundWeeklyCustomName;

            if (d.lang !== currentLang) {
              switchLanguage(d.lang);
            }

            applyThemeColor(currentTint);
            setupInterval(currentIntervalMs);
            updateLimits();
            applyCollapseState();
            renderSidebarButtonContent();

            saveBtn.style.background = '#16a34a';
            saveBtn.querySelector('#agy-settings-save-icon').textContent = '✓';
            saveBtn.querySelector('#agy-settings-save-text').textContent = t('settingsSavedNotice');

            await saveAllSettingsToDisk(d);

            setTimeout(() => {
              closeSettings(false);
            }, 350);
          });
        }

        // Placement mode buttons
        settingsPanel.querySelectorAll('.agy-settings-placement-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            d.placement = btn.dataset.placement;
            renderSettingsContent();
          });
        });

        // Theme presets
        settingsPanel.querySelectorAll('.agy-theme-preset-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            d.tint = btn.dataset.key;
            applyThemeColor(d.tint, false);
            renderSettingsContent();
          });
        });

        // Color picker
        const colorPicker = settingsPanel.querySelector('#agy-settings-color-picker');
        if (colorPicker) {
          colorPicker.addEventListener('input', (e) => {
            d.tint = e.target.value;
            applyThemeColor(d.tint, false);
            const hexLbl = settingsPanel.querySelector('#agy-settings-hex-label');
            if (hexLbl) hexLbl.textContent = d.tint.toUpperCase();
          });
          colorPicker.addEventListener('change', () => {
            renderSettingsContent();
          });
        }

        // Eyedropper
        const eyedropperBtn = settingsPanel.querySelector('#agy-settings-eyedropper-btn');
        if (eyedropperBtn) {
          eyedropperBtn.addEventListener('click', async () => {
            if ('EyeDropper' in window) {
              try {
                const ed = new window.EyeDropper();
                const res = await ed.open();
                if (res && res.sRGBHex) {
                  d.tint = res.sRGBHex;
                  applyThemeColor(d.tint, false);
                  renderSettingsContent();
                }
              } catch (e) {}
            } else if (colorPicker) {
              colorPicker.click();
            }
          });
        }

        // Pill items
        settingsPanel.querySelectorAll('.agy-settings-pill-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const idx = d.pillItems.indexOf(key);
            if (idx >= 0) {
              if (d.pillItems.length > 1) d.pillItems.splice(idx, 1);
            } else {
              d.pillItems.push(key);
            }
            renderSettingsContent();
          });
        });



        // Interval
        settingsPanel.querySelectorAll('.agy-settings-int-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            d.intervalMs = parseInt(btn.dataset.ms, 10);
            renderSettingsContent();
          });
        });

        // Sound toggles
        const s5hCb = settingsPanel.querySelector('#agy-settings-sound-5h');
        if (s5hCb) s5hCb.addEventListener('change', (e) => { d.sound5h = e.target.checked; });
        const sWkCb = settingsPanel.querySelector('#agy-settings-sound-weekly');
        if (sWkCb) sWkCb.addEventListener('change', (e) => { d.soundWeekly = e.target.checked; });

        // Sound tests
        const s5hTest = settingsPanel.querySelector('#agy-settings-sound-5h-test');
        if (s5hTest) {
          s5hTest.addEventListener('click', (e) => {
            e.stopPropagation();
            playResetSound('5h', d.sound5hCustom);
          });
        }
        const sWkTest = settingsPanel.querySelector('#agy-settings-sound-weekly-test');
        if (sWkTest) {
          sWkTest.addEventListener('click', (e) => {
            e.stopPropagation();
            playResetSound('weekly', d.soundWeeklyCustom);
          });
        }

        // Sound upload 5h
        const s5hUpBtn = settingsPanel.querySelector('#agy-settings-sound-5h-upload-btn');
        const s5hFile = settingsPanel.querySelector('#agy-settings-sound-5h-file');
        if (s5hUpBtn && s5hFile) {
          s5hUpBtn.addEventListener('click', () => s5hFile.click());
          s5hFile.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) {
              if (file.size > 2 * 1024 * 1024) {
                alert(t('soundTooBig'));
                return;
              }
              const reader = new FileReader();
              reader.onload = (evt) => {
                d.sound5hCustom = evt.target.result;
                d.sound5hCustomName = file.name;
                renderSettingsContent();
                playResetSound('5h', d.sound5hCustom);
              };
              reader.readAsDataURL(file);
            }
          });
        }

        // Sound reset 5h
        const s5hResetBtn = settingsPanel.querySelector('#agy-settings-sound-5h-reset-btn');
        if (s5hResetBtn) {
          s5hResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            d.sound5hCustom = null;
            d.sound5hCustomName = '';
            renderSettingsContent();
            playResetSound('5h', null);
          });
        }

        // Sound upload weekly
        const sWkUpBtn = settingsPanel.querySelector('#agy-settings-sound-weekly-upload-btn');
        const sWkFile = settingsPanel.querySelector('#agy-settings-sound-weekly-file');
        if (sWkUpBtn && sWkFile) {
          sWkUpBtn.addEventListener('click', () => sWkFile.click());
          sWkFile.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) {
              if (file.size > 2 * 1024 * 1024) {
                alert(t('soundTooBig'));
                return;
              }
              const reader = new FileReader();
              reader.onload = (evt) => {
                d.soundWeeklyCustom = evt.target.result;
                d.soundWeeklyCustomName = file.name;
                renderSettingsContent();
                playResetSound('weekly', d.soundWeeklyCustom);
              };
              reader.readAsDataURL(file);
            }
          });
        }

        // Sound reset weekly
        const sWkResetBtn = settingsPanel.querySelector('#agy-settings-sound-weekly-reset-btn');
        if (sWkResetBtn) {
          sWkResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            d.soundWeeklyCustom = null;
            d.soundWeeklyCustomName = '';
            renderSettingsContent();
            playResetSound('weekly', null);
          });
        }

        // Language buttons
        const ruBtn = settingsPanel.querySelector('#agy-settings-lang-ru');
        const enBtn = settingsPanel.querySelector('#agy-settings-lang-en');
        if (ruBtn) {
          ruBtn.addEventListener('click', () => {
            d.lang = 'ru';
            currentLang = 'ru';
            renderSettingsContent();
          });
        }
        if (enBtn) {
          enBtn.addEventListener('click', () => {
            d.lang = 'en';
            currentLang = 'en';
            renderSettingsContent();
          });
        }

        // Section 6: Hot-Reload and Update buttons
        const reloadBtn = settingsPanel.querySelector('#agy-settings-reload-btn');
        const updateMsg = settingsPanel.querySelector('#agy-settings-update-msg');
        if (reloadBtn) {
          reloadBtn.addEventListener('click', async () => {
            reloadBtn.style.opacity = '0.5';
            if (updateMsg) {
              updateMsg.style.display = 'block';
              updateMsg.style.background = 'rgba(59, 130, 246, 0.15)';
              updateMsg.style.color = '#93c5fd';
              updateMsg.textContent = currentLang === 'ru' ? 'Перезагрузка...' : 'Reloading...';
            }
            try {
              const res = await fetch('http://127.0.0.1:9229/api/reload', { method: 'POST', signal: AbortSignal.timeout(3000) });
              const data = await res.json();
              if (updateMsg) {
                updateMsg.style.background = 'rgba(34, 197, 94, 0.15)';
                updateMsg.style.color = '#86efac';
                updateMsg.textContent = currentLang === 'ru' ? '✓ UI обновлен!' : '✓ UI reloaded!';
              }
            } catch (err) {
              if (updateMsg) {
                updateMsg.style.background = 'rgba(239, 68, 68, 0.15)';
                updateMsg.style.color = '#fca5a5';
                updateMsg.textContent = currentLang === 'ru' ? 'Служба офлайн' : 'Service offline';
              }
            } finally {
              reloadBtn.style.opacity = '1';
              setTimeout(() => { if (updateMsg) updateMsg.style.display = 'none'; }, 2500);
            }
          });
        }

        const checkUpdateBtn = settingsPanel.querySelector('#agy-settings-check-update-btn');
        if (checkUpdateBtn) {
          checkUpdateBtn.addEventListener('click', async () => {
            checkUpdateBtn.style.opacity = '0.5';
            if (updateMsg) {
              updateMsg.style.display = 'block';
              updateMsg.style.background = 'rgba(59, 130, 246, 0.15)';
              updateMsg.style.color = '#93c5fd';
              updateMsg.textContent = currentLang === 'ru' ? 'Проверка GitHub...' : 'Checking GitHub...';
            }
            try {
              const res = await fetch('http://127.0.0.1:9229/api/check-update', { method: 'POST', signal: AbortSignal.timeout(8000) });
              const data = await res.json();
              if (data.locked) {
                if (updateMsg) {
                  updateMsg.style.background = 'rgba(234, 179, 8, 0.15)';
                  updateMsg.style.color = '#fde047';
                  updateMsg.textContent = currentLang === 'ru' ? 'Заморожено (.lock_updates)' : 'Frozen (.lock_updates)';
                }
              } else if (data.hasUpdate) {
                if (updateMsg) {
                  updateMsg.style.background = 'rgba(59, 130, 246, 0.15)';
                  updateMsg.style.color = '#93c5fd';
                  updateMsg.textContent = currentLang === 'ru' ? 'Загрузка с GitHub...' : 'Downloading update...';
                }
                const applyRes = await fetch('http://127.0.0.1:9229/api/apply-update', { method: 'POST', signal: AbortSignal.timeout(15000) });
                const applyData = await applyRes.json();
                if (updateMsg) {
                  if (applyData.ok) {
                    updateMsg.style.background = 'rgba(34, 197, 94, 0.15)';
                    updateMsg.style.color = '#86efac';
                    const words = applyData.terms || data.remoteTerms || data.localTerms;
                    updateMsg.textContent = currentLang === 'ru' ? \`✓ Обновлено (\${words} сл.)\` : \`✓ Updated (\${words} terms)\`;
                  } else {
                    updateMsg.style.background = 'rgba(239, 68, 68, 0.15)';
                    updateMsg.style.color = '#fca5a5';
                    updateMsg.textContent = applyData.error || (currentLang === 'ru' ? 'Ошибка обновления' : 'Update failed');
                  }
                }
              } else {
                if (updateMsg) {
                  updateMsg.style.background = 'rgba(34, 197, 94, 0.15)';
                  updateMsg.style.color = '#86efac';
                  updateMsg.textContent = currentLang === 'ru' ? \`✓ Актуально (\${data.localTerms} сл.)\` : \`✓ Up to date (\${data.localTerms} terms)\`;
                }
              }
            } catch (err) {
              if (updateMsg) {
                updateMsg.style.background = 'rgba(239, 68, 68, 0.15)';
                updateMsg.style.color = '#fca5a5';
                updateMsg.textContent = currentLang === 'ru' ? 'Служба офлайн' : 'Service offline';
              }
            } finally {
              checkUpdateBtn.style.opacity = '1';
              setTimeout(() => { if (updateMsg) updateMsg.style.display = 'none'; }, 3500);
            }
          });
        }
      }

      function openSettings() {
        if (isSettingsOpen) {
          closeSettings(true);
          return;
        }
        wasCollapsedBeforeSettings = isCollapsed;
        isCollapsed = false;
        isSettingsOpen = true;

        draftSettings = {
          placement: currentPlacement,
          tint: currentTint,
          pillItems: [...pillItems],
          scale: currentScale,
          intervalMs: currentIntervalMs,
          sound5h: sound5hEnabled,
          soundWeekly: soundWeeklyEnabled,
          sound5hCustom: sound5hCustom,
          sound5hCustomName: sound5hCustomName,
          soundWeeklyCustom: soundWeeklyCustom,
          soundWeeklyCustomName: soundWeeklyCustomName,
          lang: currentLang
        };

        renderSettingsContent();
        applyCollapseState();

        const gearBtn = header.querySelector('#agy-gear-btn');
        if (gearBtn) {
          gearBtn.style.color = '#fff';
          gearBtn.style.background = 'rgba(255, 255, 255, 0.15)';
        }
        const titleText = header.querySelector('#agy-title-text');
        if (titleText) {
          titleText.textContent = t('settingsModalTitle');
        }
        const reportBtn = header.querySelector('#agy-report-btn');
        if (reportBtn) reportBtn.style.display = 'none';
        const refreshBtn = header.querySelector('#agy-refresh-btn');
        if (refreshBtn) refreshBtn.style.display = 'none';
      }

      function closeSettings(shouldRevert = true) {
        if (!isSettingsOpen) return;
        isSettingsOpen = false;

        if (shouldRevert) {
          applyThemeColor(currentTint, true);
        }

        const gearBtn = header.querySelector('#agy-gear-btn');
        if (gearBtn) {
          gearBtn.style.color = '#85858b';
          gearBtn.style.background = 'none';
        }
        const titleText = header.querySelector('#agy-title-text');
        if (titleText) {
          titleText.textContent = t('title');
        }
        const reportBtn = header.querySelector('#agy-report-btn');
        if (reportBtn) reportBtn.style.display = 'flex';
        const refreshBtn = header.querySelector('#agy-refresh-btn');
        if (refreshBtn) refreshBtn.style.display = 'flex';

        if (wasCollapsedBeforeSettings) {
          isCollapsed = true;
        }
        applyCollapseState();
      }

      const content = document.createElement('div');
      content.id = 'agy-panel-content';

      const pillSummary = document.createElement('div');
      pillSummary.id = 'agy-panel-pill';
      pillSummary.style.cssText = 'display: none; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; padding: 2px 0;';

      container.appendChild(header);
      container.appendChild(content);
      container.appendChild(settingsPanel);
      container.appendChild(pillSummary);
      document.body.appendChild(container);

      // Apply initial theme
      applyThemeColor(currentTint);

      // Responsive Anchored Positioning System
      function getViewportBounds() {
        const winW = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        const winH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        return {
          winW: Math.max(200, Math.round(winW || window.innerWidth || 1000)),
          winH: Math.max(150, Math.round(winH || window.innerHeight || 700))
        };
      }

      function applySavedPosition() {
        let saved = null;
        if (diskConfig && diskConfig.position) {
          saved = diskConfig.position;
        } else {
          try {
            saved = JSON.parse(localStorage.getItem('agy_limits_pos') || 'null');
          } catch (e) {}
        }

        const { winW, winH } = getViewportBounds();

        if (!saved) {
          container.style.left = 'auto';
          container.style.right = '28px';
          container.style.top = 'auto';
          container.style.bottom = '45px';
          return;
        }

        // Migrate legacy { left, top }
        if (saved.anchorX === undefined && saved.left !== undefined) {
          const isRight = saved.left > (winW / 2);
          const approxW = container.offsetWidth || (isCollapsed ? 175 : 270);
          const approxH = container.offsetHeight || (isCollapsed ? 32 : 200);

          saved = {
            anchorX: isRight ? 'right' : 'left',
            distX: isRight ? Math.max(6, winW - saved.left - approxW) : Math.max(6, saved.left),
            anchorY: (saved.top > winH / 2) ? 'bottom' : 'top',
            distY: (saved.top > winH / 2) ? Math.max(6, winH - saved.top - approxH) : Math.max(6, saved.top)
          };
          try {
            localStorage.setItem('agy_limits_pos', JSON.stringify(saved));
          } catch (e) {}
        }

        const approxW = container.offsetWidth || (isCollapsed ? 175 : 270);
        const approxH = container.offsetHeight || (isCollapsed ? 32 : 200);

        const maxDistX = Math.max(6, winW - approxW - 6);
        const maxDistY = Math.max(6, winH - approxH - 6);

        const distX = Math.min(Math.max(6, saved.distX !== undefined ? saved.distX : 28), maxDistX);
        const distY = Math.min(Math.max(6, saved.distY !== undefined ? saved.distY : 45), maxDistY);

        container.style.left = saved.anchorX === 'left' ? (distX + 'px') : 'auto';
        container.style.right = saved.anchorX === 'right' ? (distX + 'px') : 'auto';
        container.style.top = saved.anchorY === 'top' ? (distY + 'px') : 'auto';
        container.style.bottom = saved.anchorY === 'bottom' ? (distY + 'px') : 'auto';
      }

      function clampToViewport() {
        if (isDragging) return;
        const { winW, winH } = getViewportBounds();
        const rect = container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const pad = 6;
        let left = rect.left;
        let top = rect.top;
        let adjusted = false;

        if (rect.right > winW - pad) {
          left = Math.max(pad, winW - rect.width - pad);
          adjusted = true;
        }
        if (left < pad) {
          left = pad;
          adjusted = true;
        }
        if (rect.bottom > winH - pad) {
          top = Math.max(pad, winH - rect.height - pad);
          adjusted = true;
        }
        if (top < pad) {
          top = pad;
          adjusted = true;
        }

        if (adjusted) {
          const isRight = (left + rect.width / 2) > (winW / 2);
          const isBottom = (top + rect.height / 2) > (winH / 2);

          if (isRight) {
            container.style.right = Math.max(pad, Math.round(winW - left - rect.width)) + 'px';
            container.style.left = 'auto';
          } else {
            container.style.left = Math.round(left) + 'px';
            container.style.right = 'auto';
          }

          if (isBottom) {
            container.style.bottom = Math.max(pad, Math.round(winH - top - rect.height)) + 'px';
            container.style.top = 'auto';
          } else {
            container.style.top = Math.round(top) + 'px';
            container.style.bottom = 'auto';
          }

          saveCurrentPosition();
        }
      }

      function saveCurrentPosition() {
        const { winW, winH } = getViewportBounds();
        const rect = container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const isRight = (rect.left + rect.width / 2) > (winW / 2);
        const anchorX = isRight ? 'right' : 'left';
        const distX = isRight
          ? Math.max(6, Math.min(winW - rect.width - 6, Math.round(winW - rect.right)))
          : Math.max(6, Math.min(winW - rect.width - 6, Math.round(rect.left)));

        const isBottom = (rect.top + rect.height / 2) > (winH / 2);
        const anchorY = isBottom ? 'bottom' : 'top';
        const distY = isBottom
          ? Math.max(6, Math.min(winH - rect.height - 6, Math.round(winH - rect.bottom)))
          : Math.max(6, Math.min(winH - rect.height - 6, Math.round(rect.top)));

        const pos = { anchorX, distX, anchorY, distY };
        try {
          localStorage.setItem('agy_limits_pos', JSON.stringify(pos));
          fetch('http://127.0.0.1:9229/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ position: pos })
          }).catch(() => {});
        } catch (e) {}

        container.style.left = anchorX === 'left' ? (distX + 'px') : 'auto';
        container.style.right = anchorX === 'right' ? (distX + 'px') : 'auto';
        container.style.top = anchorY === 'top' ? (distY + 'px') : 'auto';
        container.style.bottom = anchorY === 'bottom' ? (distY + 'px') : 'auto';
      }

      // Drag logic
      let isDragging = false;
      let hasDragged = false;
      let startX, startY, startLeft, startTop;

      function handleDragStart(e) {
        if (e.target.closest('button') || e.target.closest('input')) return;
        isDragging = true;
        hasDragged = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = container.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        container.style.bottom = 'auto';
        container.style.right = 'auto';
        container.style.left = startLeft + 'px';
        container.style.top = startTop + 'px';
      }

      header.addEventListener('mousedown', handleDragStart);
      pillSummary.addEventListener('mousedown', handleDragStart);

      function handleMouseMove(e) {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          hasDragged = true;
        }
        const { winW, winH } = getViewportBounds();
        const maxLeft = Math.max(6, winW - container.offsetWidth - 6);
        const maxTop = Math.max(6, winH - container.offsetHeight - 6);
        const newLeft = Math.max(6, Math.min(maxLeft, startLeft + dx));
        const newTop = Math.max(6, Math.min(maxTop, startTop + dy));
        container.style.left = newLeft + 'px';
        container.style.top = newTop + 'px';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
      }

      function handleMouseUp() {
        if (isDragging) {
          isDragging = false;
          saveCurrentPosition();
        }
      }

      function onViewportResize() {
        hideBadgeTooltip();
        applySavedPosition();
        clampToViewport();
      }

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('resize', onViewportResize);
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', onViewportResize);
      }

      // Visibility and Sidebar Integration
      let isVisible = localStorage.getItem('agy_limits_visible') !== 'false';
      let lastGeminiPillItems = [];
      let lastClaudePillItems = [];

      function toggleLimitsWidget(forceState) {
        isVisible = forceState !== undefined ? forceState : !isVisible;
        try {
          localStorage.setItem('agy_limits_visible', isVisible ? 'true' : 'false');
        } catch (e) {}

        if (isVisible) {
          container.style.display = isCollapsed ? 'flex' : 'block';
          applyCollapseState();
          clampToViewport();
          container.style.opacity = '1';
        } else {
          if (isSettingsOpen) {
            closeSettings(true);
          }
          hideBadgeTooltip();
          container.style.opacity = '0';
          setTimeout(() => {
            if (!isVisible) {
              container.style.display = 'none';
            }
          }, 150);
        }

        updateSidebarButtonState(isVisible);
      }

      function renderSidebarButtonContent() {
        const btn = document.getElementById('agy-sidebar-limits-btn');
        if (!btn) return;

        if (currentPlacement === 'floating') {
          btn.style.height = '';
          btn.style.minHeight = '';
          btn.style.padding = '';
          btn.title = currentLang === 'ru' ? 'Лимиты моделей (Alt+L)' : 'Model Limits (Alt+L)';
          const label = currentLang === 'ru' ? 'Лимиты моделей' : 'Model Limits';
          const iconColor = isVisible ? '#22c55e' : '#71717a';
          const dotColor = isVisible ? '#22c55e' : '#52525b';
          btn.innerHTML = '<span class="shrink-0 flex items-center agy-sidebar-icon" style="color: ' + iconColor + '; transition: color 0.15s ease;">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="m12 14 4-4"/>' +
              '<path d="M3.34 19a10 10 0 1 1 17.32 0"/>' +
            '</svg>' +
          '</span>' +
          '<span class="truncate text-sm agy-sidebar-text" style="flex: 1; text-align: left;">' + label + '</span>' +
          '<span class="agy-sidebar-dot" style="width: 5px; height: 5px; border-radius: 50%; background: ' + dotColor + '; margin-right: 2px; transition: all 0.2s ease;"></span>' +
          '<span style="font-size: 10px; color: #71717a; padding: 1px 4px; border-radius: 3px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.07); line-height: 1;">Alt+L</span>';
          return;
        }

        // Docked Sidebar Placement Mode
        btn.title = currentLang === 'ru' ? 'Лимиты моделей (нажмите для подробностей)' : 'Model Limits (click for details)';

        const hasGemini = lastGeminiPillItems && lastGeminiPillItems.length > 0;
        const hasClaude = lastClaudePillItems && lastClaudePillItems.length > 0;
        const isTwoLines = hasGemini && hasClaude;

        if (isTwoLines) {
          btn.style.height = 'auto';
          btn.style.minHeight = '42px';
          btn.style.padding = '4px 8px';

          btn.innerHTML = '<div style="display: flex; align-items: center; justify-content: space-between; width: 100%; min-width: 0; gap: 6px;">' +
            '<div style="display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0;">' +
              '<div style="display: flex; align-items: center; gap: 6px; min-width: 0;">' +
                '<span style="display: inline-flex; align-items: center; justify-content: center; width: 14px; flex-shrink: 0;">' + GEMINI_ICON_SVG + '</span>' +
                '<div style="display: flex; align-items: center; gap: 3px; flex: 1; min-width: 0;">' +
                  lastGeminiPillItems.join('') +
                '</div>' +
              '</div>' +
              '<div style="display: flex; align-items: center; gap: 6px; min-width: 0;">' +
                '<span style="display: inline-flex; align-items: center; justify-content: center; width: 14px; flex-shrink: 0;">' + CLAUDE_ICON_SVG + '</span>' +
                '<div style="display: flex; align-items: center; gap: 3px; flex: 1; min-width: 0;">' +
                  lastClaudePillItems.join('') +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display: flex; align-items: center; justify-content: center; flex-shrink: 0; gap: 4px;">' +
              '<span class="agy-sidebar-steps" style="font-size: 9px; font-weight: 600; padding: 1px 3px; border-radius: 3px; background: rgba(255,255,255,0.06); line-height: 1.2;"></span>' +
              '<span class="agy-sidebar-gear-btn" title="' + (t('settingsModalTitle') || 'Настройки') + '" style="cursor: pointer; opacity: 0.55; font-size: 11px; padding: 3px 4px; border-radius: 4px; display: inline-flex; align-items: center; transition: opacity 0.15s, background 0.15s;">⚙️</span>' +
            '</div>' +
          '</div>';
        } else {
          btn.style.height = '';
          btn.style.minHeight = '';
          btn.style.padding = '';

          let singleHtml = '';
          if (hasGemini) {
            singleHtml = '<div style="display: inline-flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">' +
              '<span style="display: inline-flex; align-items: center; justify-content: center; width: 14px; flex-shrink: 0;">' + GEMINI_ICON_SVG + '</span>' +
              '<div style="display: inline-flex; align-items: center; gap: 3px;">' +
                lastGeminiPillItems.join('') +
              '</div>' +
            '</div>';
          } else if (hasClaude) {
            singleHtml = '<div style="display: inline-flex; align-items: center; gap: 6px; flex: 1; min-width: 0;">' +
              '<span style="display: inline-flex; align-items: center; justify-content: center; width: 14px; flex-shrink: 0;">' + CLAUDE_ICON_SVG + '</span>' +
              '<div style="display: inline-flex; align-items: center; gap: 3px;">' +
                lastClaudePillItems.join('') +
              '</div>' +
            '</div>';
          } else {
            singleHtml = '<span style="font-size: 11px; color: #71717a;">' + t('title') + '</span>';
          }

          btn.innerHTML = '<div style="display: flex; align-items: center; justify-content: space-between; width: 100%; min-width: 0; gap: 6px;">' +
            '<div class="agy-sidebar-metrics-area" style="display: flex; align-items: center; min-width: 0; overflow: hidden; flex: 1;">' +
              singleHtml +
            '</div>' +
            '<div style="display: flex; align-items: center; flex-shrink: 0; gap: 4px;">' +
              '<span class="agy-sidebar-steps" style="font-size: 9px; font-weight: 600; padding: 1px 3px; border-radius: 3px; background: rgba(255,255,255,0.06); line-height: 1.2;"></span>' +
              '<span class="agy-sidebar-gear-btn" title="' + (t('settingsModalTitle') || 'Настройки') + '" style="cursor: pointer; opacity: 0.55; font-size: 11px; padding: 2px 4px; border-radius: 4px; display: inline-flex; align-items: center; transition: opacity 0.15s, background 0.15s;">⚙️</span>' +
            '</div>' +
          '</div>';
        }

        const gear = btn.querySelector('.agy-sidebar-gear-btn');
        if (gear) {
          gear.addEventListener('mouseenter', () => { gear.style.opacity = '1'; gear.style.background = 'rgba(255,255,255,0.12)'; });
          gear.addEventListener('mouseleave', () => { gear.style.opacity = '0.55'; gear.style.background = 'transparent'; });
          gear.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            openSettings();
          });
        }

        btn.querySelectorAll('.agy-pill-badge').forEach(badge => {
          badge.addEventListener('mouseenter', (e) => {
            e.stopPropagation();
            showBadgeTooltip(badge);
          });
          badge.addEventListener('mouseleave', (e) => {
            e.stopPropagation();
            hideBadgeTooltip();
          });
        });
      }

      function updateSidebarButtonState(visible) {
        if (currentPlacement === 'sidebar') {
          renderSidebarButtonContent();
          return;
        }
        const btn = document.getElementById('agy-sidebar-limits-btn');
        if (!btn) return;
        const iconSpan = btn.querySelector('.agy-sidebar-icon');
        const dotSpan = btn.querySelector('.agy-sidebar-dot');
        const textSpan = btn.querySelector('.agy-sidebar-text');

        const expectedText = currentLang === 'ru' ? 'Лимиты моделей' : 'Model Limits';
        if (textSpan && textSpan.textContent !== expectedText) {
          textSpan.textContent = expectedText;
        }

        const expectedColor = visible ? '#22c55e' : '#71717a';
        if (iconSpan && iconSpan.style.color !== expectedColor) {
          iconSpan.style.color = expectedColor;
        }

        const expectedDotBg = visible ? '#22c55e' : '#52525b';
        if (dotSpan && dotSpan.style.background !== expectedDotBg) {
          dotSpan.style.background = expectedDotBg;
          dotSpan.style.boxShadow = visible ? '0 0 6px rgba(34, 197, 94, 0.5)' : 'none';
        }
      }

      function ensureSidebarButton() {
        const settingsBtn = document.querySelector('[data-testid="settings-button"]');
        if (!settingsBtn || !settingsBtn.parentElement) return;

        let btn = document.getElementById('agy-sidebar-limits-btn');
        if (btn && btn.parentElement === settingsBtn.parentElement) {
          return;
        }
        if (btn) btn.remove();

        btn = document.createElement('button');
        btn.id = 'agy-sidebar-limits-btn';
        btn.className = settingsBtn.className;
        btn.style.position = 'relative';

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (currentPlacement === 'sidebar') {
            if (isSettingsOpen) {
              closeSettings(true);
              return;
            }
            if (container.style.display !== 'none' && !isCollapsed) {
              container.style.display = 'none';
              isCollapsed = true;
            } else {
              isCollapsed = false;
              applyCollapseState();
              updateLimits();
            }
          } else {
            toggleLimitsWidget();
          }
        });

        settingsBtn.parentElement.insertBefore(btn, settingsBtn);
        renderSidebarButtonContent();
      }

      const sidebarInterval = setInterval(ensureSidebarButton, 2000);

      function handleKeyDown(e) {
        if (e.key === 'Escape' && isSettingsOpen) {
          e.preventDefault();
          e.stopPropagation();
          closeSettings(true);
          return;
        }
        if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyL' || e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д')) {
          e.preventDefault();
          e.stopPropagation();
          if (currentPlacement === 'sidebar') {
            if (container.style.display !== 'none' && !isCollapsed) {
              if (isSettingsOpen) closeSettings(true);
              isCollapsed = true;
              container.style.display = 'none';
            } else {
              isCollapsed = false;
              applyCollapseState();
              updateLimits();
            }
          } else {
            toggleLimitsWidget();
          }
        }
      }
      window.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('keydown', handleKeyDown, true);

      function handleOutsideClick(e) {
        if (currentPlacement === 'sidebar' && container.style.display !== 'none') {
          const sbBtn = document.getElementById('agy-sidebar-limits-btn');
          if (container.contains(e.target) || (sbBtn && sbBtn.contains(e.target))) {
            return;
          }
          const rm = document.getElementById('agy-report-modal');
          if (rm && rm.contains(e.target)) return;

          if (isSettingsOpen) {
            closeSettings(true);
          }
          isCollapsed = true;
          container.style.display = 'none';
        }
      }
      document.addEventListener('mousedown', handleOutsideClick);

      applySavedPosition();
      clampToViewport();
      if (!isVisible) {
        container.style.display = 'none';
        container.style.opacity = '0';
      } else {
        container.style.opacity = '1';
      }
      ensureSidebarButton();

      // Header button hovers
      header.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('mouseenter', () => {
          btn.style.color = '#fff';
          btn.style.background = 'rgba(255,255,255,0.07)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.color = btn.id === 'agy-close-btn' ? '#6b6b72' : '#85858b';
          btn.style.background = 'none';
        });
      });

      // Feedback & Bug Reporting Modal
      const reportModal = document.createElement('div');
      reportModal.id = 'agy-report-modal';
      reportModal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.72); backdrop-filter: blur(5px); display: none; align-items: center; justify-content: center; z-index: 10000002; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;';

      let reportPastedImage = null;

      function renderReportModal() {
        reportModal.innerHTML = \`
          <div style="background: rgb(28, 26, 23); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; width: 440px; max-width: 92vw; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45); color: #f4f4f5; padding: 16px 18px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px;">
            <!-- Header -->
            <div style="display: flex; align-items: flex-start; justify-content: space-between;">
              <div>
                <div style="font-weight: 600; font-size: 13px; color: #f4f4f5; display: flex; align-items: center; gap: 6px;">
                  <span style="color: #60a5fa;">📸</span>
                  <span>\${t('reportModalTitle')}</span>
                </div>
                <div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">\${t('reportModalDesc')}</div>
              </div>
              <button id="agy-report-close-btn" style="background: none; border: none; color: #71717a; cursor: pointer; font-size: 16px; padding: 0 4px; line-height: 1; border-radius: 4px;">✕</button>
            </div>

            <!-- Paste / Drop Area -->
            <div id="agy-paste-dropzone" style="border: 1.5px dashed rgba(255, 255, 255, 0.18); border-radius: 8px; padding: 12px; text-align: center; background: rgba(255, 255, 255, 0.02); cursor: pointer; transition: all 0.15s ease; position: relative;">
              <input type="file" id="agy-report-file-input" accept="image/*" style="display: none;">
              <div id="agy-paste-prompt" style="display: \${reportPastedImage ? 'none' : 'flex'}; flex-direction: column; align-items: center; gap: 6px;">
                <svg style="width: 24px; height: 24px; color: #71717a;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect>
                  <circle cx="9" cy="9" r="2"></circle>
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
                </svg>
                <div style="font-size: 11px; color: #d4d4d8; font-weight: 500;">\${t('reportPastePrompt')}</div>
                <div style="font-size: 10px; color: #71717a;">Win + Shift + S → Ctrl + V</div>
              </div>
              <div id="agy-preview-container" style="display: \${reportPastedImage ? 'flex' : 'none'}; flex-direction: column; align-items: center; gap: 8px;">
                <img id="agy-report-preview-img" src="\${reportPastedImage || ''}" style="max-height: 150px; max-width: 100%; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1); object-fit: contain; background: #18181b;">
                <button id="agy-remove-img-btn" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #f87171; border-radius: 4px; padding: 2px 8px; font-size: 10px; cursor: pointer;">\${t('reportRemoveImg')}</button>
              </div>
            </div>

            <!-- Comment Input -->
            <div>
              <div style="font-size: 10px; color: #a1a1aa; margin-bottom: 4px; font-weight: 500;">КОММЕНТАРИЙ / COMMENT</div>
              <textarea id="agy-report-comment" placeholder="\${t('reportCommentPlaceholder')}" style="width: 100%; height: 60px; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: #f4f4f5; font-size: 11px; padding: 7px 9px; box-sizing: border-box; resize: none; font-family: inherit;"></textarea>
            </div>

            <!-- Toast / Status info -->
            <div id="agy-report-status" style="display: none; font-size: 10.5px; padding: 6px 9px; border-radius: 6px; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.25); color: #4ade80;"></div>

            <!-- Buttons -->
            <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 2px;">
              <button id="agy-report-cancel-btn" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); color: #a1a1aa; border-radius: 6px; padding: 6px 12px; font-size: 11px; cursor: pointer;">\${t('reportCancelBtn')}</button>
              <button id="agy-report-submit-btn" style="background: #238636; border: 1px solid rgba(255, 255, 255, 0.15); color: #fff; border-radius: 6px; padding: 6px 14px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <span>\${t('reportSendBtn')}</span>
                <span style="opacity: 0.7;">↗</span>
              </button>
            </div>
          </div>
        \`;

        const closeBtn = reportModal.querySelector('#agy-report-close-btn');
        const cancelBtn = reportModal.querySelector('#agy-report-cancel-btn');
        const submitBtn = reportModal.querySelector('#agy-report-submit-btn');
        const dropzone = reportModal.querySelector('#agy-paste-dropzone');
        const fileInput = reportModal.querySelector('#agy-report-file-input');
        const removeImgBtn = reportModal.querySelector('#agy-remove-img-btn');

        closeBtn.addEventListener('click', closeReportModal);
        cancelBtn.addEventListener('click', closeReportModal);

        dropzone.addEventListener('click', (e) => {
          if (e.target !== removeImgBtn && !reportPastedImage) {
            fileInput.click();
          }
        });

        fileInput.addEventListener('change', (e) => {
          const file = e.target.files && e.target.files[0];
          if (file) handleImageFile(file);
        });

        if (removeImgBtn) {
          removeImgBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            reportPastedImage = null;
            renderReportModal();
          });
        }

        submitBtn.addEventListener('click', handleReportSubmit);
      }

      function handleImageFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          reportPastedImage = evt.target.result;
          renderReportModal();
        };
        reader.readAsDataURL(file);
      }

      function handleGlobalPaste(e) {
        if (reportModal.style.display !== 'flex') return;
        const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.indexOf('image') !== -1) {
            const blob = items[i].getAsFile();
            handleImageFile(blob);
            break;
          }
        }
      }

      window.addEventListener('paste', handleGlobalPaste);

      function handleReportSubmit() {
        const commentInput = reportModal.querySelector('#agy-report-comment');
        const statusDiv = reportModal.querySelector('#agy-report-status');
        const comment = commentInput ? commentInput.value.trim() : '';

        const title = '[i18n] ' + (currentLang === 'ru' ? 'Непереведенный элемент: ' : 'Untranslated element: ') + (comment ? comment.slice(0, 45) : 'Antigravity UI');
        const bodyLines = [
          '### ' + (currentLang === 'ru' ? 'Описание непереведенного элемента' : 'Description of untranslated element'),
          comment || (currentLang === 'ru' ? 'Обнаружен непереведенный элемент в интерфейсе Antigravity.' : 'Untranslated element detected in Antigravity UI.'),
          '',
          '### ' + (currentLang === 'ru' ? 'Скриншот' : 'Screenshot'),
          reportPastedImage ? '*(Вставьте скриншот из буфера обмена через Ctrl+V ниже / Paste screenshot below)*' : '*(Скриншот не прикреплен / No screenshot attached)*',
          '',
          '### ' + (currentLang === 'ru' ? 'Окружение' : 'Environment'),
          '- Antigravity Companion: ' + COMPANION_VERSION,
          '- ' + (currentLang === 'ru' ? 'Язык' : 'Language') + ': ' + currentLang.toUpperCase(),
          '- ' + (currentLang === 'ru' ? 'Разрешение экрана' : 'Screen resolution') + ': ' + window.innerWidth + 'x' + window.innerHeight,
          '- ' + (currentLang === 'ru' ? 'Время' : 'Date') + ': ' + new Date().toLocaleString()
        ];

        const issueUrl = 'https://github.com/voronin-s-dev/antigravity-companion/issues/new?title=' +
          encodeURIComponent(title) +
          '&body=' + encodeURIComponent(bodyLines.join(String.fromCharCode(10)));

        if (statusDiv) {
          statusDiv.style.display = 'block';
          statusDiv.textContent = t('reportCopiedNotice');
        }

        window.open(issueUrl, '_blank');

        setTimeout(() => {
          closeReportModal();
        }, 2200);
      }

      function openReportModal() {
        renderReportModal();
        reportModal.style.display = 'flex';
      }

      function closeReportModal() {
        reportModal.style.display = 'none';
        reportPastedImage = null;
      }

      reportModal.addEventListener('click', (e) => {
        if (e.target === reportModal) closeReportModal();
      });

      document.body.appendChild(reportModal);

      const reportBtn = header.querySelector('#agy-report-btn');
      const gearBtn = header.querySelector('#agy-gear-btn');
      const refreshBtn = header.querySelector('#agy-refresh-btn');
      const collapseBtn = header.querySelector('#agy-collapse-btn');
      const closeBtn = header.querySelector('#agy-close-btn');

      if (reportBtn) {
        reportBtn.addEventListener('click', () => {
          openReportModal();
        });
      }

      gearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isSettingsOpen) {
          closeSettings(true);
        } else {
          openSettings();
        }
      });

      function applyCollapseState() {
        hideBadgeTooltip();

        if (currentPlacement === 'sidebar') {
          pillSummary.style.display = 'none';

          if (isSettingsOpen) {
            header.style.display = 'flex';
            content.style.display = 'none';
            settingsPanel.style.display = 'flex';
            container.style.position = 'fixed';
            container.style.left = '12px';
            container.style.bottom = '52px';
            container.style.top = 'auto';
            container.style.right = 'auto';
            container.style.zIndex = '10000001';
            container.style.width = '285px';
            container.style.padding = '10px 12px';
            container.style.display = 'block';
            container.style.cursor = 'default';
          } else if (!isCollapsed && isVisible) {
            header.style.display = 'flex';
            content.style.display = 'block';
            settingsPanel.style.display = 'none';
            container.style.position = 'fixed';
            container.style.left = '12px';
            container.style.bottom = '52px';
            container.style.top = 'auto';
            container.style.right = 'auto';
            container.style.zIndex = '10000001';
            container.style.width = '270px';
            container.style.padding = '10px 12px';
            container.style.display = 'block';
            container.style.cursor = 'default';
          } else {
            container.style.display = 'none';
          }
          return;
        }

        if (!isVisible) {
          container.style.display = 'none';
          return;
        }
        applySavedPosition();

        if (isSettingsOpen) {
          header.style.display = 'flex';
          content.style.display = 'none';
          settingsPanel.style.display = 'flex';
          pillSummary.style.display = 'none';

          container.style.width = '265px';
          container.style.padding = '8px 10px';
          container.style.fontSize = '11px';

          container.style.cursor = 'default';
          container.style.display = 'block';
        } else if (isCollapsed) {
          header.style.display = 'none';
          content.style.display = 'none';
          settingsPanel.style.display = 'none';
          pillSummary.style.display = 'flex';
          container.style.width = 'auto';

          container.style.padding = '3px 7px';
          container.style.fontSize = '10.5px';
          pillSummary.style.gap = '4px';

          container.style.cursor = 'move';
          container.style.display = 'flex';
        } else {
          header.style.display = 'flex';
          content.style.display = 'block';
          settingsPanel.style.display = 'none';
          pillSummary.style.display = 'none';

          container.style.width = '240px';
          container.style.padding = '8px 10px';
          container.style.fontSize = '11px';

          container.style.cursor = 'default';
          container.style.display = 'block';
        }
        localStorage.setItem('agy_limits_collapsed', isCollapsed ? 'true' : 'false');
        requestAnimationFrame(() => {
          clampToViewport();
        });
      }

      collapseBtn.addEventListener('click', () => {
        if (isSettingsOpen) closeSettings(true);
        isCollapsed = true;
        applyCollapseState();
      });

      pillSummary.addEventListener('click', (e) => {
        if (hasDragged) return;
        if (e.target.closest('.agy-pill-gear-btn')) return;
        isCollapsed = false;
        applyCollapseState();
      });

      closeBtn.addEventListener('click', () => {
        if (isSettingsOpen) closeSettings(true);
        if (currentPlacement === 'sidebar') {
          isCollapsed = true;
          applyCollapseState();
        } else {
          toggleLimitsWidget(false);
        }
      });

      function setupInterval(ms) {
        if (window.__agyLimitsInterval) clearInterval(window.__agyLimitsInterval);
        if (ms > 0) {
          window.__agyLimitsInterval = setInterval(updateLimits, ms);
        }
      }

      function renderCircleRing(fraction, color) {
        const r = 9;
        const circ = 2 * Math.PI * r;
        const offset = Math.max(0, circ - fraction * circ);
        return \`
          <div style="position: relative; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <svg viewBox="0 0 24 24" style="width: 100%; height: 100%; transform: rotate(-90deg);">
              <circle cx="12" cy="12" r="\${r}" fill="transparent" stroke="rgba(255,255,255,0.12)" stroke-width="2.8"></circle>
              <circle cx="12" cy="12" r="\${r}" fill="transparent" stroke="\${color}" stroke-width="2.8" stroke-dasharray="\${circ.toFixed(2)}" stroke-dashoffset="\${offset.toFixed(2)}" stroke-linecap="round" style="transition: stroke-dashoffset 0.3s ease;"></circle>
            </svg>
          </div>
        \`;
      }

      async function updateLimits() {
        // Spin ONLY the SVG inside refresh button (hover box remains stationary)
        const refreshSvg = refreshBtn.querySelector('svg');
        if (refreshSvg) {
          refreshSvg.style.transformOrigin = 'center center';
          refreshSvg.style.transition = 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)';
          refreshSvg.style.transform = 'rotate(360deg)';
          setTimeout(() => {
            refreshSvg.style.transition = 'none';
            refreshSvg.style.transform = 'rotate(0deg)';
          }, 450);
        }

        try {
          const service = getQuotaService();
          if (!service) {
            content.innerHTML = \`<div style="color: #ef4444; padding: 4px;">\${t('serviceErr')}</div>\`;
            return;
          }

          const res = await service.retrieveUserQuotaSummary();
          const groups = res?.response?.groups || [];

          let html = '';
          const geminiPillItems = [];
          const claudePillItems = [];
          const currentFractions = {};

          for (let i = 0; i < groups.length; i++) {
            const grp = groups[i];
            const isGemini = grp.displayName?.toLowerCase().includes('gemini');
            const grpTitle = currentLang === 'ru' 
              ? (isGemini ? t('geminiGroup') : t('claudeGroup'))
              : (grp.displayName || (isGemini ? t('geminiGroup') : t('claudeGroup')));

            if (i > 0) {
              html += '<div style="height: 1px; background: rgba(255, 255, 255, 0.06); margin: 6px 0;"></div>';
            }

            const grpIcon = isGemini ? GEMINI_ICON_SVG : CLAUDE_ICON_SVG;
            html += \`<div style="margin-bottom: 2px;">
              <div style="padding: 2px 2px 4px 2px; font-size: 11px; font-weight: 500; color: #a1a1aa; letter-spacing: 0.1px; display: flex; align-items: center; gap: 5px;">
                \${grpIcon}
                <span>\${grpTitle}</span>
              </div>\`;

            for (const b of (grp.buckets || [])) {
              const fraction = b.remaining?.value ?? (typeof b.remainingFraction === 'number' ? b.remainingFraction : 1);
              const pct = Math.round(fraction * 100);
              const reset = formatReset(b.resetTime?.seconds);
              const color = getColor(fraction);
              const is5h = b.bucketId?.includes('5h') || b.displayName?.toLowerCase().includes('five');
              
              const label = currentLang === 'ru'
                ? (is5h ? t('fiveHourLimit') : t('weeklyLimit'))
                : (b.displayName || (is5h ? t('fiveHourLimit') : t('weeklyLimit')));

              const itemKey = (isGemini ? 'gemini_' : 'claude_') + (is5h ? '5h' : 'weekly');
              currentFractions[itemKey] = fraction;
              if (pillItems.includes(itemKey)) {
                const badgeLabel = is5h ? t('badge5h') : t('badgeWeekly');
                const groupShort = isGemini ? 'Gemini' : 'Claude';
                const fullMetricTitle = \`\${groupShort}: \${label}\`;
                const resetSec = b.resetTime?.seconds || '';

                const badgeItem = \`
                  <span class="agy-pill-badge" data-reset="\${resetSec}" data-title="\${fullMetricTitle}" style="display: inline-flex; align-items: baseline; justify-content: center; gap: 2px; padding: 1px 4px; min-width: 44px; border-radius: 3px; cursor: pointer; background: rgba(255, 255, 255, 0.05); transition: background 0.12s;">
                    <b style="color: \${color}; font-weight: 600; font-size: 11px; pointer-events: none;">\${pct}%</b>
                    <span style="font-size: 8.5px; color: #8a8784; font-weight: 500; pointer-events: none;">\${badgeLabel}</span>
                  </span>
                \`;
                if (isGemini) geminiPillItems.push(badgeItem);
                else claudePillItems.push(badgeItem);
              }

              html += \`
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 3px 2px; border-radius: 4px; transition: background 0.1s;">
                  <div style="line-height: 1.25;">
                    <div style="font-size: 11.5px; color: #ffffff; font-weight: 400;">\${label}</div>
                    \${reset ? \`<div style="font-size: 10px; color: #8a8784; margin-top: 1px;">\${reset}</div>\` : ''}
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <span style="font-weight: 600; font-size: 12px; color: #ffffff; min-width: 32px; text-align: right;">\${pct}%</span>
                    \${renderCircleRing(fraction, color)}
                  </div>
                </div>
              \`;
            }
            html += '</div>';
          }

          // Detect limit resets (transition from < 100% to 100%)
          let shouldPlay5h = false;
          let shouldPlayWeekly = false;
          if (prevBucketFractions !== null) {
            for (const [key, prevFrac] of Object.entries(prevBucketFractions)) {
              const newFrac = currentFractions[key];
              if (newFrac !== undefined && prevFrac < 0.999 && newFrac >= 0.999) {
                if (key.endsWith('5h') && sound5hEnabled) shouldPlay5h = true;
                if (key.endsWith('weekly') && soundWeeklyEnabled) shouldPlayWeekly = true;
              }
            }
          }
          prevBucketFractions = currentFractions;

          if (shouldPlayWeekly) {
            playResetSound('weekly');
          } else if (shouldPlay5h) {
            playResetSound('5h');
          }

          let pillHtml = '';
          if (geminiPillItems.length > 0 && claudePillItems.length > 0) {
            pillHtml += \`
              <div style="display: flex; flex-direction: column; gap: 2.5px;">
                <div style="display: flex; align-items: center; gap: 5px;">
                  <span style="display: inline-flex; align-items: center; justify-content: center; width: 14px; flex-shrink: 0;">\${GEMINI_ICON_SVG}</span>
                  <div style="display: flex; align-items: center; gap: 2.5px;">
                    \${geminiPillItems.join('')}
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 5px;">
                  <span style="display: inline-flex; align-items: center; justify-content: center; width: 14px; flex-shrink: 0;">\${CLAUDE_ICON_SVG}</span>
                  <div style="display: flex; align-items: center; gap: 2.5px;">
                    \${claudePillItems.join('')}
                  </div>
                </div>
              </div>
            \`;
          } else if (geminiPillItems.length > 0) {
            pillHtml += \`
              <div style="display: inline-flex; align-items: center; gap: 5px;">
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 14px; flex-shrink: 0;">\${GEMINI_ICON_SVG}</span>
                <div style="display: flex; align-items: center; gap: 2.5px;">
                  \${geminiPillItems.join('')}
                </div>
              </div>
            \`;
          } else if (claudePillItems.length > 0) {
            pillHtml += \`
              <div style="display: inline-flex; align-items: center; gap: 5px;">
                <span style="display: inline-flex; align-items: center; justify-content: center; width: 14px; flex-shrink: 0;">\${CLAUDE_ICON_SVG}</span>
                <div style="display: inline-flex; align-items: center; gap: 2.5px;">
                  \${claudePillItems.join('')}
                </div>
              </div>
            \`;
          }
          if (!pillHtml) {
            pillHtml = \`<span style="color: #8a8784; font-size: 10.5px;">\${t('noItemsSelected')}</span>\`;
          }

          content.innerHTML = html;
          pillSummary.innerHTML = pillHtml + \`
            <span class="agy-pill-steps" style="font-size: 9px; font-weight: 600; padding: 1px 3px; border-radius: 3px; background: rgba(255,255,255,0.06); margin-left: 4px; display: inline-flex; align-items: center;"></span>
            <span class="agy-pill-gear-btn" title="\${t('settingsModalTitle') || 'Настройки'}" style="cursor: pointer; opacity: 0.65; font-size: 11px; margin-left: 4px; padding: 1px 4px; border-radius: 4px; background: rgba(255,255,255,0.06); display: inline-flex; align-items: center; transition: opacity 0.15s, background 0.15s;">⚙️</span>
            <span title="Развернуть" style="color: #8a8784; font-size: 9.5px; margin-left: 4px; padding: 1px 3px; border-radius: 3px; background: rgba(255,255,255,0.05); display: inline-flex; align-items: center;">▲</span>
          \`;

          lastGeminiPillItems = geminiPillItems;
          lastClaudePillItems = claudePillItems;
          renderSidebarButtonContent();
          updateSessionStepDisplays();

          const pGear = pillSummary.querySelector('.agy-pill-gear-btn');
          if (pGear) {
            pGear.addEventListener('mouseenter', () => { pGear.style.opacity = '1'; pGear.style.background = 'rgba(255,255,255,0.15)'; });
            pGear.addEventListener('mouseleave', () => { pGear.style.opacity = '0.65'; pGear.style.background = 'rgba(255,255,255,0.06)'; });
            pGear.addEventListener('click', (e) => {
              e.stopPropagation();
              openSettings();
            });
          }

          // Bind live tooltips for each badge
          pillSummary.querySelectorAll('.agy-pill-badge').forEach(badge => {
            badge.addEventListener('mouseenter', (e) => {
              e.stopPropagation();
              showBadgeTooltip(badge);
            });
            badge.addEventListener('mouseleave', (e) => {
              e.stopPropagation();
              hideBadgeTooltip();
            });
          });

          applyCollapseState();
        } catch (e) {
          content.innerHTML = \`<div style="color: #ef4444; font-size: 10px; padding: 4px;">\${t('serviceErr')}: \${e.message}</div>\`;
        }
      }

      function getSessionStepCount() {
        const btns = Array.from(document.querySelectorAll('button'));
        for (const b of btns) {
          const l = b.getAttribute('aria-label') || '';
          const m = l.match(/(\\d+)\\s*(?:из|of)\\s*(\\d+)/i);
          if (m) {
            const totalMessages = parseInt(m[2], 10);
            return Math.max(1, Math.ceil(totalMessages / 2));
          }
        }
        const userSteps = document.querySelectorAll('[data-testid="user-input-step"]').length;
        if (userSteps > 0) return userSteps;
        return 1;
      }

      function updateSessionStepDisplays() {
        const steps = getSessionStepCount();
        const color = steps >= 35 ? '#ef4444' : (steps >= 25 ? '#f59e0b' : '#9ca3af');
        const text = \`\${currentLang === 'ru' ? 'Шаг' : 'Step'} \${steps}/40\`;
        const tipTitle = currentLang === 'ru'
          ? \`Текущая сессия: \${steps} шагов из 40 рекомендованных. При приближении к 35-40 шагам рекомендуется зафиксировать срез в ACTIVE_STATE и начать новый диалог для экономии токенов.\`
          : \`Current session: \${steps} of 40 recommended turns. At 35-40 turns, consider saving a checkpoint and starting a fresh chat to save tokens.\`;

        const headerSteps = header.querySelector('#agy-header-step-count');
        if (headerSteps) {
          headerSteps.textContent = text;
          headerSteps.style.color = color;
          headerSteps.style.display = 'inline-block';
          headerSteps.title = tipTitle;
        }

        const sbSteps = document.querySelector('.agy-sidebar-steps');
        if (sbSteps) {
          sbSteps.textContent = text;
          sbSteps.style.color = color;
          sbSteps.title = tipTitle;
        }

        const pillSteps = pillSummary.querySelector('.agy-pill-steps');
        if (pillSteps) {
          pillSteps.textContent = text;
          pillSteps.style.color = color;
          pillSteps.title = tipTitle;
        }
      }

      const sessionStepInterval = setInterval(updateSessionStepDisplays, 3000);

      // Pre-flight Paste Guard (Clipboard Bloat Check)
      let pasteToastTimer = null;
      function showPasteGuardToast(lines, tokens) {
        let toast = document.getElementById('agy-paste-guard-toast');
        if (!toast) {
          toast = document.createElement('div');
          toast.id = 'agy-paste-guard-toast';
          toast.style.cssText = \`
            position: fixed;
            z-index: 10000000;
            background: rgb(28, 25, 20);
            border: 1px solid rgba(245, 158, 11, 0.45);
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
            border-radius: 8px;
            padding: 6px 11px;
            color: #fbbf24;
            font-size: 11px;
            font-family: var(--vscode-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
            display: flex;
            align-items: center;
            gap: 8px;
            opacity: 0;
            transform: translateY(4px);
            transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: auto;
            max-width: 90vw;
          \`;
          document.body.appendChild(toast);
        }

        const box = document.querySelector('[data-testid="agent-input-box"]');
        if (box) {
          const r = box.getBoundingClientRect();
          const bottom = Math.max(10, Math.round(window.innerHeight - r.top + 8));
          const left = Math.round(r.left + r.width / 2);
          toast.style.bottom = bottom + 'px';
          toast.style.left = left + 'px';
          toast.style.transform = 'translateX(-50%) translateY(0px)';
        } else {
          toast.style.bottom = '80px';
          toast.style.left = '50%';
          toast.style.transform = 'translateX(-50%) translateY(0px)';
        }

        const msgText = currentLang === 'ru'
          ? \`⚠️ Вставка \${lines} строк (~ \${tokens.toLocaleString()} токенов). Экономнее сохранить текст в файл и дать агенту ссылку.\`
          : \`⚠️ Pasting \${lines} lines (~ \${tokens.toLocaleString()} tokens). Consider saving to a file to preserve context.\`;

        toast.innerHTML = \`
          <span>\${msgText}</span>
          <button id="agy-toast-close" style="background: none; border: none; color: #a1a1aa; cursor: pointer; font-size: 13px; padding: 0 3px; line-height: 1; border-radius: 3px;">✕</button>
        \`;

        const closeBtn = toast.querySelector('#agy-toast-close');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            toast.style.opacity = '0';
            setTimeout(() => { if (toast.parentElement) toast.remove(); }, 200);
          });
        }

        toast.style.display = 'flex';
        requestAnimationFrame(() => {
          toast.style.opacity = '1';
          toast.style.transform = 'translateX(-50%) translateY(0px)';
        });

        if (pasteToastTimer) clearTimeout(pasteToastTimer);
        pasteToastTimer = setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => { if (toast.parentElement) toast.remove(); }, 200);
        }, 7000);
      }

      function handleInputPaste(e) {
        const box = document.querySelector('[data-testid="agent-input-box"]');
        if (!box) return;
        const active = document.activeElement;
        if (!box.contains(active) && active !== box) return;

        const clip = e.clipboardData || window.clipboardData;
        const clipText = clip ? (clip.getData('text/plain') || clip.getData('text')) : '';
        if (!clipText) return;

        const lines = clipText.split(String.fromCharCode(10)).length;
        const chars = clipText.length;
        if (chars > 1200 || lines > 35) {
          const estTokens = Math.round(chars / 3.5);
          showPasteGuardToast(lines, estTokens);
        }
      }
      window.addEventListener('paste', handleInputPaste, true);

      refreshBtn.addEventListener('click', () => updateLimits());

      updateLimits();
      setupInterval(currentIntervalMs);

      window.__agyLimitsCleanup = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('resize', onViewportResize);
        window.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('mousedown', handleOutsideClick);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', onViewportResize);
        }
        if (sidebarInterval) clearInterval(sidebarInterval);
        const sbBtn = document.getElementById('agy-sidebar-limits-btn');
        if (sbBtn) sbBtn.remove();
        if (tooltipTimer) clearInterval(tooltipTimer);
        if (window.__agyLimitsInterval) clearInterval(window.__agyLimitsInterval);
        if (sessionStepInterval) clearInterval(sessionStepInterval);
        window.removeEventListener('paste', handleInputPaste, true);
        const pgt = document.getElementById('agy-paste-guard-toast');
        if (pgt) pgt.remove();
        const p = document.getElementById('agy-limits-floating-panel');
        if (p) p.remove();
        const t = document.getElementById('agy-limits-tooltip');
        if (t) t.remove();
        const smb = document.getElementById('agy-settings-modal-backdrop');
        if (smb) smb.remove();
        const sp = document.getElementById('agy-panel-settings');
        if (sp) sp.remove();
        window.removeEventListener('paste', handleGlobalPaste);
        const rm = document.getElementById('agy-report-modal');
        if (rm) rm.remove();
      };

      return { status: 'responsive_positioning_and_cleanup_ready' };
    })()`;

    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: injectionCode, returnByValue: true }
    }));
  };

  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.id === 1) {
      if (msg.result?.exceptionDetails) {
        console.error('[Antigravity Limits Widget] Evaluation Error:', msg.result.exceptionDetails);
        ws.close();
        reject(new Error(msg.result.exceptionDetails.text || 'CDP Evaluation Error'));
      } else {
        console.log('[Antigravity Limits Widget] Injected successfully:', msg.result?.result?.value);
        ws.close();
        resolve(msg.result?.result?.value);
      }
    }
  };

  ws.onerror = (err) => {
    reject(err);
  };
});
}

module.exports = { injectWidget };

if (require.main === module) {
  injectWidget().catch(console.error);
}
