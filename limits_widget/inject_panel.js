const fs = require('fs');
const path = require('path');

async function injectWidget() {
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
          soundTooBig: 'Файл слишком большой (максимум 2 МБ)'
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
          soundTooBig: 'File is too large (max 2 MB)'
        }
      };

      let currentLang = localStorage.getItem('agy_lang') || localStorage.getItem('agy_limits_lang') || 'ru';
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
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7), 0 2px 6px rgba(0, 0, 0, 0.4);
        border-radius: 7px;
        padding: 6px 9px;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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

        tooltip.innerHTML = \`
          <div style="font-weight: 600; font-size: 11px; color: #f4f4f5; margin-bottom: 2px;">\${title}</div>
          <div style="font-size: 10px; color: #a1a1aa; display: flex; align-items: center; gap: 4px;">
            <span style="color: #22c55e;">⏱</span>
            <span>\${liveText || t('resetsNow')}</span>
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

      const DEFAULT_TINT = 'native';
      let currentTint = localStorage.getItem('agy_limits_tint') || DEFAULT_TINT;

      function applyThemeColor(val) {
        currentTint = val;
        localStorage.setItem('agy_limits_tint', val);

        if (!val || val === 'native') {
          container.style.background = 'rgb(28, 26, 23)';
          container.style.border = '1px solid rgba(255, 255, 255, 0.08)';
          container.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4)';
        } else {
          const { r, g, b } = hexToRgb(val);
          container.style.background = \`color-mix(in srgb, \${val} 8%, rgb(28, 26, 23))\`;
          container.style.border = \`1px solid rgba(\${r}, \${g}, \${b}, 0.25)\`;
          container.style.boxShadow = \`0 10px 32px rgba(0, 0, 0, 0.65), 0 0 16px -4px rgba(\${r}, \${g}, \${b}, 0.25)\`;
        }

        const picker = container.querySelector('#agy-color-picker');
        if (picker && val !== 'native') picker.value = val;

        const hexLabel = container.querySelector('#agy-hex-label');
        if (hexLabel) hexLabel.textContent = val === 'native' ? t('native') : val.toUpperCase();
      }

      container.style.cssText = \`
        position: fixed;
        width: 270px;
        border-radius: 10px;
        padding: 10px 12px;
        color: #f4f4f5;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12px;
        z-index: 9999999;
        user-select: none;
        box-sizing: border-box;
        transition: width 0.2s cubic-bezier(0.16, 1, 0.3, 1), padding 0.2s ease, opacity 0.15s ease, background 0.25s ease;
      \`;

      let isCollapsed = localStorage.getItem('agy_limits_collapsed') === 'true';
      let currentIntervalMs = parseInt(localStorage.getItem('agy_limits_interval') || '300000', 10);
      let currentScale = localStorage.getItem('agy_limits_scale') || 'normal';
      let sound5hEnabled = localStorage.getItem('agy_sound_5h') === 'true';
      let soundWeeklyEnabled = localStorage.getItem('agy_sound_weekly') === 'true';
      let prevBucketFractions = null;
      let isSettingsOpen = localStorage.getItem('agy_limits_settings_open') === 'true';

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

      // Miniature Pill items preferences
      const DEFAULT_PILL_ITEMS = ['gemini_5h', 'gemini_weekly', 'claude_5h', 'claude_weekly'];
      let pillItems;
      try {
        pillItems = JSON.parse(localStorage.getItem('agy_limits_pill_items') || 'null');
        if (!Array.isArray(pillItems) || pillItems.length === 0) pillItems = DEFAULT_PILL_ITEMS;
      } catch (e) {
        pillItems = DEFAULT_PILL_ITEMS;
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

      // Settings Panel
      const settingsPanel = document.createElement('div');
      settingsPanel.id = 'agy-settings-panel';
      settingsPanel.style.cssText = 'display: ' + (isSettingsOpen ? 'block' : 'none') + '; margin-bottom: 9px; padding: 8px 10px; border-radius: 8px; background: rgba(0,0,0,0.30); border: 1px solid rgba(255,255,255,0.06); font-size: 11px;';

      function renderSettingsContent() {
        const custom5hName = localStorage.getItem('agy_sound_5h_custom_name');
        const customWeeklyName = localStorage.getItem('agy_sound_weekly_custom_name');
        settingsPanel.innerHTML = \`
          <!-- Section 1: Language Switcher -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 7px; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <span id="agy-lang-label" style="color: #85858b; font-size: 10px; font-weight: 500;">\${t('langTitle')}</span>
            <div style="display: flex; gap: 3px;">
              <button id="agy-lang-ru" style="padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: \${currentLang === 'ru' ? '600' : '400'}; background: \${currentLang === 'ru' ? 'rgba(255,255,255,0.14)' : 'transparent'}; border: 1px solid \${currentLang === 'ru' ? 'rgba(255,255,255,0.2)' : 'transparent'}; color: \${currentLang === 'ru' ? '#fff' : '#85858b'}; cursor: pointer;">RU</button>
              <button id="agy-lang-en" style="padding: 2px 7px; border-radius: 4px; font-size: 10px; font-weight: \${currentLang === 'en' ? '600' : '400'}; background: \${currentLang === 'en' ? 'rgba(255,255,255,0.14)' : 'transparent'}; border: 1px solid \${currentLang === 'en' ? 'rgba(255,255,255,0.2)' : 'transparent'}; color: \${currentLang === 'en' ? '#fff' : '#85858b'}; cursor: pointer;">EN</button>
            </div>
          </div>

          <!-- Section 2: Miniature Pill Items Selection -->
          <div style="margin-bottom: 8px; padding-bottom: 7px; border-bottom: 1px solid rgba(255,255,255,0.06);">
            <div style="color: #85858b; font-size: 10px; font-weight: 500; margin-bottom: 5px;">\${t('pillItemsTitle')}</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px;">
              <button class="agy-pill-item-btn" data-key="gemini_5h" style="padding: 4px 6px; border-radius: 4px; font-size: 10px; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; transition: all 0.12s;"></button>
              <button class="agy-pill-item-btn" data-key="gemini_weekly" style="padding: 4px 6px; border-radius: 4px; font-size: 10px; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; transition: all 0.12s;"></button>
              <button class="agy-pill-item-btn" data-key="claude_5h" style="padding: 4px 6px; border-radius: 4px; font-size: 10px; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; transition: all 0.12s;"></button>
              <button class="agy-pill-item-btn" data-key="claude_weekly" style="padding: 4px 6px; border-radius: 4px; font-size: 10px; cursor: pointer; text-align: left; display: flex; align-items: center; justify-content: space-between; transition: all 0.12s;"></button>
            </div>
          </div>

          <!-- Section 3: Interval -->
          <div style="color: #85858b; font-size: 10px; font-weight: 500; margin-bottom: 6px;">\${t('intervalTitle')}</div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 9px;">
            <button class="agy-int-btn" data-ms="60000" style="padding: 3px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); color: #d4d4d8; font-size: 10px; cursor: pointer; text-align: center;">\${t('m1')}</button>
            <button class="agy-int-btn" data-ms="300000" style="padding: 3px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); color: #d4d4d8; font-size: 10px; cursor: pointer; text-align: center;">\${t('m5')}</button>
            <button class="agy-int-btn" data-ms="900000" style="padding: 3px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); color: #d4d4d8; font-size: 10px; cursor: pointer; text-align: center;">\${t('m15')}</button>
            <button class="agy-int-btn" data-ms="0" style="padding: 3px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); color: #d4d4d8; font-size: 10px; cursor: pointer; text-align: center;">\${t('off')}</button>
          </div>

          <!-- Section 4: Tint & Color -->
          <div style="padding-top: 7px; border-top: 1px solid rgba(255,255,255,0.06);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
              <span style="color: #85858b; font-size: 10px; font-weight: 500;">\${t('colorTitle')}</span>
              <button id="agy-reset-color-btn" style="background: none; border: none; color: #85858b; font-size: 10px; cursor: pointer; text-decoration: underline;">\${t('resetDefault')}</button>
            </div>

            <div style="display: flex; align-items: center; gap: 6px;">
              <div style="position: relative; width: 22px; height: 20px; border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; flex-shrink: 0;">
                <input type="color" id="agy-color-picker" value="\${currentTint === 'native' ? '#BD9574' : currentTint}" style="position: absolute; top: -8px; left: -8px; width: 40px; height: 38px; cursor: pointer; border: none; background: transparent;">
              </div>

              <button id="agy-pipette-btn" style="display: flex; align-items: center; gap: 4px; padding: 3px 6px; border-radius: 4px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: #d4d4d8; font-size: 10px; cursor: pointer;">
                <svg style="width: 11px; height: 11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m2 22 1-1h3l9-9"></path>
                  <path d="M3 21v-3l9-9"></path>
                  <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1 3 3l-3.8 3.8a2.1 2.1 0 1 1-3-3l.4-.4"></path>
                </svg>
                <span>\${t('eyedropper')}</span>
              </button>

              <span id="agy-hex-label" style="font-family: monospace; font-size: 9.5px; color: #85858b; margin-left: 2px;">\${currentTint === 'native' ? t('native') : currentTint.toUpperCase()}</span>
            </div>
          </div>

          <!-- Section 5: Widget Scale -->
          <div style="margin-top: 8px; padding-top: 7px; border-top: 1px solid rgba(255,255,255,0.06);">
            <div style="color: #85858b; font-size: 10px; font-weight: 500; margin-bottom: 5px;">\${t('scaleTitle')}</div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
              <button class="agy-scale-btn" data-scale="compact" style="padding: 3px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); color: #d4d4d8; font-size: 10px; cursor: pointer; text-align: center;">\${t('scaleCompact')}</button>
              <button class="agy-scale-btn" data-scale="normal" style="padding: 3px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); color: #d4d4d8; font-size: 10px; cursor: pointer; text-align: center;">\${t('scaleNormal')}</button>
              <button class="agy-scale-btn" data-scale="large" style="padding: 3px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.03); color: #d4d4d8; font-size: 10px; cursor: pointer; text-align: center;">\${t('scaleLarge')}</button>
            </div>
          </div>

          <!-- Section 6: Sound Alerts -->
          <div style="margin-top: 8px; padding-top: 7px; border-top: 1px solid rgba(255,255,255,0.06);">
            <div style="color: #85858b; font-size: 10px; font-weight: 500; margin-bottom: 6px;">\${t('soundTitle')}</div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <!-- 5-hour limit sound -->
              <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 7px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                  <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 10.5px; color: #d4d4d8;">
                    <input type="checkbox" id="agy-sound-5h" \${sound5hEnabled ? 'checked' : ''} style="cursor: pointer; accent-color: #22c55e;">
                    <span style="font-weight: 500;">\${t('sound5hLabel')}</span>
                  </label>
                  <button id="agy-sound-5h-test" title="\${t('soundTest')}" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #e4e4e7; border-radius: 4px; padding: 2px 7px; font-size: 10px; cursor: pointer; display: flex; align-items: center; gap: 3px;">
                    <span>🔔</span><span>\${t('soundTest')}</span>
                  </button>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9.5px; padding-left: 20px;">
                  <input type="file" id="agy-sound-5h-file" accept="audio/*" style="display: none;">
                  <span id="agy-sound-5h-name" title="\${custom5hName || t('soundDefaultSynth')}" style="color: #8a8784; max-width: 120px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                    \${custom5hName ? '🎵 ' + custom5hName : '🎹 ' + t('soundDefaultSynth')}
                  </span>
                  <div style="display: flex; align-items: center; gap: 3px;">
                    <button id="agy-sound-5h-upload-btn" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: #a1a1aa; border-radius: 3px; padding: 1px 5px; font-size: 9.5px; cursor: pointer;">
                      \${custom5hName ? t('soundChange') : t('soundUpload')}
                    </button>
                    \${custom5hName ? '<button id="agy-sound-5h-reset-btn" title="' + t('soundReset') + '" style="background: none; border: none; color: #f87171; font-size: 10px; cursor: pointer; padding: 1px 3px;">✕</button>' : ''}
                  </div>
                </div>
              </div>

              <!-- Weekly limit sound -->
              <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 7px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                  <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 10.5px; color: #d4d4d8;">
                    <input type="checkbox" id="agy-sound-weekly" \${soundWeeklyEnabled ? 'checked' : ''} style="cursor: pointer; accent-color: #22c55e;">
                    <span style="font-weight: 500;">\${t('soundWeeklyLabel')}</span>
                  </label>
                  <button id="agy-sound-weekly-test" title="\${t('soundTest')}" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #e4e4e7; border-radius: 4px; padding: 2px 7px; font-size: 10px; cursor: pointer; display: flex; align-items: center; gap: 3px;">
                    <span>🎉</span><span>\${t('soundTest')}</span>
                  </button>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 9.5px; padding-left: 20px;">
                  <input type="file" id="agy-sound-weekly-file" accept="audio/*" style="display: none;">
                  <span id="agy-sound-weekly-name" title="\${customWeeklyName || t('soundDefaultSynth')}" style="color: #8a8784; max-width: 120px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                    \${customWeeklyName ? '🎵 ' + customWeeklyName : '🎹 ' + t('soundDefaultSynth')}
                  </span>
                  <div style="display: flex; align-items: center; gap: 3px;">
                    <button id="agy-sound-weekly-upload-btn" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: #a1a1aa; border-radius: 3px; padding: 1px 5px; font-size: 9.5px; cursor: pointer;">
                      \${customWeeklyName ? t('soundChange') : t('soundUpload')}
                    </button>
                    \${customWeeklyName ? '<button id="agy-sound-weekly-reset-btn" title="' + t('soundReset') + '" style="background: none; border: none; color: #f87171; font-size: 10px; cursor: pointer; padding: 1px 3px;">✕</button>' : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>
        \`;

        // Bind scale buttons
        settingsPanel.querySelectorAll('.agy-scale-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            currentScale = btn.dataset.scale;
            localStorage.setItem('agy_limits_scale', currentScale);
            applyCollapseState();
            updateSettingsButtons();
            clampToViewport();
          });
        });

        // Bind sound notification toggles and test buttons
        const sound5hCb = settingsPanel.querySelector('#agy-sound-5h');
        const soundWeeklyCb = settingsPanel.querySelector('#agy-sound-weekly');
        const sound5hTestBtn = settingsPanel.querySelector('#agy-sound-5h-test');
        const soundWeeklyTestBtn = settingsPanel.querySelector('#agy-sound-weekly-test');
        const sound5hUploadBtn = settingsPanel.querySelector('#agy-sound-5h-upload-btn');
        const soundWeeklyUploadBtn = settingsPanel.querySelector('#agy-sound-weekly-upload-btn');
        const sound5hFile = settingsPanel.querySelector('#agy-sound-5h-file');
        const soundWeeklyFile = settingsPanel.querySelector('#agy-sound-weekly-file');
        const sound5hResetBtn = settingsPanel.querySelector('#agy-sound-5h-reset-btn');
        const soundWeeklyResetBtn = settingsPanel.querySelector('#agy-sound-weekly-reset-btn');

        if (sound5hCb) {
          sound5hCb.addEventListener('change', (e) => {
            sound5hEnabled = e.target.checked;
            localStorage.setItem('agy_sound_5h', sound5hEnabled ? 'true' : 'false');
          });
        }
        if (soundWeeklyCb) {
          soundWeeklyCb.addEventListener('change', (e) => {
            soundWeeklyEnabled = e.target.checked;
            localStorage.setItem('agy_sound_weekly', soundWeeklyEnabled ? 'true' : 'false');
          });
        }
        if (sound5hTestBtn) {
          sound5hTestBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playResetSound('5h');
          });
        }
        if (soundWeeklyTestBtn) {
          soundWeeklyTestBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            playResetSound('weekly');
          });
        }
        if (sound5hUploadBtn && sound5hFile) {
          sound5hUploadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sound5hFile.click();
          });
          sound5hFile.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleSoundUpload('5h', file);
          });
        }
        if (soundWeeklyUploadBtn && soundWeeklyFile) {
          soundWeeklyUploadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            soundWeeklyFile.click();
          });
          soundWeeklyFile.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) handleSoundUpload('weekly', file);
          });
        }
        if (sound5hResetBtn) {
          sound5hResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetSoundToDefault('5h');
          });
        }
        if (soundWeeklyResetBtn) {
          soundWeeklyResetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetSoundToDefault('weekly');
          });
        }

        // Bind language buttons
        const ruBtn = settingsPanel.querySelector('#agy-lang-ru');
        const enBtn = settingsPanel.querySelector('#agy-lang-en');
        ruBtn.addEventListener('click', () => switchLanguage('ru'));
        enBtn.addEventListener('click', () => switchLanguage('en'));

        // Bind pill items toggle buttons
        settingsPanel.querySelectorAll('.agy-pill-item-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const idx = pillItems.indexOf(key);
            if (idx >= 0) {
              if (pillItems.length > 1) {
                pillItems.splice(idx, 1);
              }
            } else {
              pillItems.push(key);
            }
            localStorage.setItem('agy_limits_pill_items', JSON.stringify(pillItems));
            updatePillItemButtons();
            updateLimits();
          });
        });

        // Bind interval buttons
        settingsPanel.querySelectorAll('.agy-int-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            currentIntervalMs = parseInt(btn.dataset.ms, 10);
            localStorage.setItem('agy_limits_interval', currentIntervalMs);
            setupInterval(currentIntervalMs);
            updateSettingsButtons();
          });
        });

        // Bind color picker
        const colorPicker = settingsPanel.querySelector('#agy-color-picker');
        colorPicker.addEventListener('input', (e) => {
          applyThemeColor(e.target.value);
        });

        // Bind eyedropper
        const pipetteBtn = settingsPanel.querySelector('#agy-pipette-btn');
        pipetteBtn.addEventListener('click', async () => {
          if ('EyeDropper' in window) {
            try {
              const eyeDropper = new window.EyeDropper();
              const result = await eyeDropper.open();
              if (result && result.sRGBHex) {
                applyThemeColor(result.sRGBHex);
              }
            } catch (e) {}
          } else {
            colorPicker.click();
          }
        });

        // Bind reset color
        const resetColorBtn = settingsPanel.querySelector('#agy-reset-color-btn');
        resetColorBtn.addEventListener('click', () => {
          applyThemeColor('native');
        });

        updateSettingsButtons();
      }

      function updatePillItemButtons() {
        settingsPanel.querySelectorAll('.agy-pill-item-btn').forEach(btn => {
          const key = btn.dataset.key;
          const isSelected = pillItems.includes(key);
          const label = t(keyToI18n(key));
          if (isSelected) {
            btn.style.background = 'rgba(255, 255, 255, 0.12)';
            btn.style.border = '1px solid rgba(255, 255, 255, 0.22)';
            btn.style.color = '#ffffff';
            btn.innerHTML = \`<span style="font-weight: 500;">\${label}</span><span style="color: #22c55e; font-weight: 700; font-size: 11px;">✓</span>\`;
          } else {
            btn.style.background = 'rgba(255, 255, 255, 0.02)';
            btn.style.border = '1px solid rgba(255, 255, 255, 0.06)';
            btn.style.color = '#71717a';
            btn.innerHTML = \`<span style="font-weight: 400;">\${label}</span><span style="opacity: 0.35; font-size: 11px;">+</span>\`;
          }
        });
      }

      function switchLanguage(lang) {
        currentLang = lang;
        localStorage.setItem('agy_limits_lang', lang);
        localStorage.setItem('agy_lang', lang);
        window.dispatchEvent(new CustomEvent('agy-language-change', { detail: { lang } }));
        header.querySelector('#agy-title-text').textContent = t('title');
        const cBtn = header.querySelector('#agy-close-btn');
        if (cBtn) cBtn.title = lang === 'ru' ? 'Скрыть (Alt+L)' : 'Hide (Alt+L)';
        updateSidebarButtonState(isVisible);
        renderSettingsContent();
        updateLimits();
      }

      const content = document.createElement('div');
      content.id = 'agy-panel-content';

      const pillSummary = document.createElement('div');
      pillSummary.id = 'agy-panel-pill';
      pillSummary.style.cssText = 'display: none; align-items: center; gap: 6px; font-size: 11px; cursor: pointer; padding: 2px 0;';

      container.appendChild(header);
      container.appendChild(settingsPanel);
      container.appendChild(content);
      container.appendChild(pillSummary);
      document.body.appendChild(container);

      // Render settings and apply initial theme
      renderSettingsContent();
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
        try {
          saved = JSON.parse(localStorage.getItem('agy_limits_pos') || 'null');
        } catch (e) {}

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

      function updateSidebarButtonState(visible) {
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
        btn.title = currentLang === 'ru' ? 'Лимиты моделей (Alt+L)' : 'Model Limits (Alt+L)';
        btn.style.position = 'relative';

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

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleLimitsWidget();
        });

        settingsBtn.parentElement.insertBefore(btn, settingsBtn);
        updateSidebarButtonState(isVisible);
      }

      const sidebarInterval = setInterval(ensureSidebarButton, 2000);

      function handleKeyDown(e) {
        if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyL' || e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д')) {
          e.preventDefault();
          e.stopPropagation();
          toggleLimitsWidget();
        }
      }
      window.addEventListener('keydown', handleKeyDown, true);
      document.addEventListener('keydown', handleKeyDown, true);

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
          <div style="background: rgb(28, 26, 23); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; width: 440px; max-width: 92vw; box-shadow: 0 16px 40px rgba(0,0,0,0.8); color: #f4f4f5; padding: 16px 18px; box-sizing: border-box; display: flex; flex-direction: column; gap: 12px;">
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
          '- Antigravity Companion: v1.1.0',
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

      gearBtn.addEventListener('click', () => {
        isSettingsOpen = !isSettingsOpen;
        localStorage.setItem('agy_limits_settings_open', isSettingsOpen ? 'true' : 'false');
        settingsPanel.style.display = isSettingsOpen ? 'block' : 'none';
        updateSettingsButtons();
      });

      function updateSettingsButtons() {
        settingsPanel.querySelectorAll('.agy-int-btn').forEach(btn => {
          const ms = parseInt(btn.dataset.ms, 10);
          if (ms === currentIntervalMs) {
            btn.style.background = 'rgba(255, 255, 255, 0.12)';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            btn.style.color = '#fff';
            btn.style.fontWeight = '500';
          } else {
            btn.style.background = 'rgba(255,255,255,0.03)';
            btn.style.borderColor = 'rgba(255,255,255,0.06)';
            btn.style.color = '#85858b';
            btn.style.fontWeight = '400';
          }
        });

        settingsPanel.querySelectorAll('.agy-scale-btn').forEach(btn => {
          const sc = btn.dataset.scale;
          if (sc === currentScale) {
            btn.style.background = 'rgba(255, 255, 255, 0.12)';
            btn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            btn.style.color = '#fff';
            btn.style.fontWeight = '500';
          } else {
            btn.style.background = 'rgba(255,255,255,0.03)';
            btn.style.borderColor = 'rgba(255,255,255,0.06)';
            btn.style.color = '#85858b';
            btn.style.fontWeight = '400';
          }
        });

        updatePillItemButtons();
      }

      function applyCollapseState() {
        hideBadgeTooltip();
        if (!isVisible) {
          container.style.display = 'none';
          return;
        }
        if (isCollapsed) {
          header.style.display = 'none';
          content.style.display = 'none';
          settingsPanel.style.display = 'none';
          pillSummary.style.display = 'flex';
          container.style.width = 'auto';

          if (currentScale === 'compact') {
            container.style.padding = '3px 7px';
            container.style.fontSize = '10.5px';
            pillSummary.style.gap = '4px';
          } else if (currentScale === 'large') {
            container.style.padding = '7px 12px';
            container.style.fontSize = '13.5px';
            pillSummary.style.gap = '8px';
          } else {
            container.style.padding = '5px 9px';
            container.style.fontSize = '12px';
            pillSummary.style.gap = '6px';
          }

          container.style.cursor = 'move';
          container.style.display = 'flex';
        } else {
          header.style.display = 'flex';
          content.style.display = 'block';
          settingsPanel.style.display = isSettingsOpen ? 'block' : 'none';
          pillSummary.style.display = 'none';

          if (currentScale === 'compact') {
            container.style.width = '240px';
            container.style.padding = '8px 10px';
            container.style.fontSize = '11px';
          } else if (currentScale === 'large') {
            container.style.width = '320px';
            container.style.padding = '12px 15px';
            container.style.fontSize = '13.5px';
          } else {
            container.style.width = '270px';
            container.style.padding = '10px 12px';
            container.style.fontSize = '12px';
          }

          container.style.cursor = 'default';
          container.style.display = 'block';
        }
        localStorage.setItem('agy_limits_collapsed', isCollapsed ? 'true' : 'false');
        requestAnimationFrame(() => {
          clampToViewport();
        });
      }

      collapseBtn.addEventListener('click', () => {
        isCollapsed = true;
        applyCollapseState();
      });

      pillSummary.addEventListener('click', (e) => {
        if (hasDragged) return;
        isCollapsed = false;
        applyCollapseState();
      });

      closeBtn.addEventListener('click', () => {
        toggleLimitsWidget(false);
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

            html += \`<div style="margin-bottom: 2px;">
              <div style="padding: 2px 2px 4px 2px; font-size: 11px; font-weight: 500; color: #8a8784; letter-spacing: 0.1px;">
                \${grpTitle}
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
                  <span class="agy-pill-badge" data-reset="\${resetSec}" data-title="\${fullMetricTitle}" style="display: inline-flex; align-items: baseline; gap: 2.5px; background: rgba(255, 255, 255, 0.06); padding: 1px 4px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.08); cursor: pointer; transition: all 0.12s;">
                    <b style="color: \${color}; font-weight: 600; font-size: 11px; pointer-events: none;">\${pct}%</b>
                    <span style="font-size: 9px; color: #8a8784; font-weight: 500; pointer-events: none;">\${badgeLabel}</span>
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
          if (geminiPillItems.length > 0) {
            pillHtml += \`
              <div style="display: inline-flex; align-items: center; gap: 3.5px;">
                <span style="color: #a1a1aa; font-weight: 500; font-size: 11px;">Gemini:</span>
                \${geminiPillItems.join('')}
              </div>
            \`;
          }
          if (geminiPillItems.length > 0 && claudePillItems.length > 0) {
            pillHtml += '<div style="width: 1px; height: 13px; background: rgba(255, 255, 255, 0.12); margin: 0 4px;"></div>';
          }
          if (claudePillItems.length > 0) {
            pillHtml += \`
              <div style="display: inline-flex; align-items: center; gap: 3.5px;">
                <span style="color: #a1a1aa; font-weight: 500; font-size: 11px;">Claude:</span>
                \${claudePillItems.join('')}
              </div>
            \`;
          }
          if (!pillHtml) {
            pillHtml = \`<span style="color: #8a8784; font-size: 10.5px;">\${t('noItemsSelected')}</span>\`;
          }

          content.innerHTML = html;
          pillSummary.innerHTML = pillHtml + \`
            <span title="Развернуть" style="color: #8a8784; font-size: 9.5px; margin-left: 5px; padding: 1px 3px; border-radius: 3px; background: rgba(255,255,255,0.05); display: inline-flex; align-items: center;">▲</span>
          \`;

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

      refreshBtn.addEventListener('click', () => updateLimits());

      updateLimits();
      setupInterval(currentIntervalMs);

      window.__agyLimitsCleanup = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('resize', onViewportResize);
        window.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keydown', handleKeyDown, true);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', onViewportResize);
        }
        if (sidebarInterval) clearInterval(sidebarInterval);
        const sbBtn = document.getElementById('agy-sidebar-limits-btn');
        if (sbBtn) sbBtn.remove();
        if (tooltipTimer) clearInterval(tooltipTimer);
        if (window.__agyLimitsInterval) clearInterval(window.__agyLimitsInterval);
        const p = document.getElementById('agy-limits-floating-panel');
        if (p) p.remove();
        const t = document.getElementById('agy-limits-tooltip');
        if (t) t.remove();
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
