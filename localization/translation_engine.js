/**
 * Antigravity High-Fidelity UI Translation Engine (Safe Edition)
 * 
 * - React-safe Virtual DOM protection (no node replacement, only textValue)
 * - Strict content isolation: never touches user chat (.prose), code blocks, or terminal
 * - Full self-mutation guard: isInternalMutating prevents any observer recursion
 * - childList-only subtree observation with requestAnimationFrame debounce
 * - Bidirectional translation dictionary with reverse map for instant zero-reload RU <-> EN switching
 */

(function() {
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

  let currentLang = localStorage.getItem('agy_lang') || 'ru';
  let isInternalMutating = false;

  const EXCLUDED_SELECTORS = [
    'script',
    'style',
    'noscript',
    'pre',
    'code',
    '.monaco-editor',
    '.xterm',
    'textarea',
    '[contenteditable="true"]',
    '[data-lexical-editor]',
    '.prose',
    '[role="log"]',
    '#agy-limits-floating-panel',
    '.font-mono',
    '[data-testid="conversation-row-sidebar"] span.truncate'
  ].join(', ');

  const EXCLUDED_ATTR_SELECTORS = [
    'script',
    'style',
    'noscript',
    '#agy-limits-floating-panel',
    '.monaco-editor',
    '.xterm'
  ].join(', ');

  function isExcluded(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    try {
      if (node.matches(EXCLUDED_SELECTORS)) return true;
      if (node.closest(EXCLUDED_SELECTORS)) return true;
    } catch (e) {}
    return false;
  }

  function isAttrExcluded(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return true;
    try {
      if (node.matches(EXCLUDED_ATTR_SELECTORS)) return true;
      if (node.closest(EXCLUDED_ATTR_SELECTORS)) return true;
    } catch (e) {}
    return false;
  }

  let cachedRev = null;
  function getReverseMap() {
    if (cachedRev) return cachedRev;
    const dict = window.__agyDictRu;
    if (!dict) return {};
    cachedRev = {};
    if (dict.exact) {
      for (const [en, ru] of Object.entries(dict.exact)) {
        cachedRev[ru] = en;
      }
    }
    if (dict.attributes) {
      for (const [en, ru] of Object.entries(dict.attributes)) {
        cachedRev[ru] = en;
      }
    }
    return cachedRev;
  }

  function formatTimeTokens(str) {
    if (!str || typeof str !== 'string') return str;
    return str
      .replace(/(\d+)\s*days?/gi, '$1 дн.')
      .replace(/(\d+)\s*hours?/gi, '$1 ч.')
      .replace(/(\d+)\s*minutes?/gi, '$1 мин.')
      .replace(/(\d+)\s*seconds?/gi, '$1 сек.');
  }

  function translateTrajectorySummary(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    if (trimmed === 'Working') return 'В работе';
    if (trimmed === 'Done') return 'Готово';
    if (trimmed === 'Exploring') return 'Изучение';
    if (trimmed === 'Explored') return 'Изучено';

    const parts = trimmed.split(',').map(s => s.trim());
    const translatedParts = [];

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFirst = (i === 0);
      let trans = null;

      // 1. Exploring / Explored clauses
      if (/^exploring$/i.test(part)) {
        trans = isFirst ? 'Изучение' : 'изучение';
      } else if (/^explored$/i.test(part)) {
        trans = isFirst ? 'Изучено' : 'изучено';
      } else if (/^exploring\s+files?$/i.test(part)) {
        trans = isFirst ? 'Изучение файлов' : 'изучение файлов';
      } else if (/^explored\s+file$/i.test(part)) {
        trans = isFirst ? 'Изучен файл' : 'изучен файл';
      } else if (/^explored\s+files$/i.test(part)) {
        trans = isFirst ? 'Изучены файлы' : 'изучены файлы';
      } else if (/^exploring\s+artifacts?$/i.test(part)) {
        trans = isFirst ? 'Изучение артефактов' : 'изучение артефактов';
      } else if (/^explored\s+artifact$/i.test(part)) {
        trans = isFirst ? 'Изучен артефакт' : 'изучен артефакт';
      } else if (/^explored\s+artifacts$/i.test(part)) {
        trans = isFirst ? 'Изучены артефакты' : 'изучены артефакты';
      } else if (/^exploring\s+(\d+)\s+files?$/i.test(part)) {
        const n = part.match(/\d+/)[0];
        trans = isFirst ? `Изучение файлов (${n})` : `изучение файлов (${n})`;
      } else if (/^explored\s+(\d+)\s+files?$/i.test(part)) {
        const n = part.match(/\d+/)[0];
        trans = isFirst ? `Изучено файлов: ${n}` : `изучено файлов: ${n}`;
      } else if (/^(\d+)\s+files?$/i.test(part)) {
        const n = part.match(/\d+/)[0];
        trans = n === '1' ? '1 файл' : `файлов: ${n}`;
      } else if (/^(\d+)\s+folders?$/i.test(part)) {
        const n = part.match(/\d+/)[0];
        trans = n === '1' ? '1 папка' : `папок: ${n}`;
      } else if (/^(\d+)\s+tasks?$/i.test(part)) {
        const n = part.match(/\d+/)[0];
        trans = n === '1' ? '1 задача' : `задач: ${n}`;
      } else if (/^(\d+)\s+searches?$/i.test(part)) {
        const n = part.match(/\d+/)[0];
        trans = n === '1' ? '1 поиск' : `поисков: ${n}`;
      } else if (/^(\d+)\s+pages?$/i.test(part)) {
        const n = part.match(/\d+/)[0];
        trans = n === '1' ? '1 страница' : `страниц: ${n}`;
      } else if (/^(\d+)\s+artifacts?$/i.test(part)) {
        const n = part.match(/\d+/)[0];
        trans = n === '1' ? '1 артефакт' : `артефактов: ${n}`;

      // 2. Running / Ran clauses
      } else if (/^running\s+command$/i.test(part)) {
        trans = isFirst ? 'Запуск команды' : 'запуск команды';
      } else if (/^running\s+commands$/i.test(part)) {
        trans = isFirst ? 'Запуск команд' : 'запуск команд';
      } else if (/^ran\s+command$/i.test(part)) {
        trans = isFirst ? 'Выполнена команда' : 'выполнена команда';
      } else if (/^ran\s+commands$/i.test(part)) {
        trans = isFirst ? 'Выполнены команды' : 'выполнены команды';
      } else if (/^(running|ran)\s+(\d+)\s+commands?$/i.test(part)) {
        const mCmd = part.match(/^(running|ran)\s+(\d+)\s+commands?$/i);
        const isPast = mCmd[1].toLowerCase() === 'ran';
        const n = mCmd[2];
        trans = isPast
          ? (isFirst ? `Выполнено команд: ${n}` : `выполнено команд: ${n}`)
          : (isFirst ? `Запуск команд (${n})` : `запуск команд (${n})`);
      } else if (/^running\s+(.+)$/i.test(part)) {
        const cmdName = part.match(/^running\s+(.+)$/i)[1];
        trans = isFirst ? `Запуск: ${cmdName}` : `запуск: ${cmdName}`;
      } else if (/^ran\s+(.+)$/i.test(part)) {
        const cmdName = part.match(/^ran\s+(.+)$/i)[1];
        trans = isFirst ? `Выполнено: ${cmdName}` : `выполнено: ${cmdName}`;

      // 3. Editing / Edited clauses
      } else if (/^editing\s+files?$/i.test(part)) {
        trans = isFirst ? 'Редактирование файла' : 'редактирование файла';
      } else if (/^edited\s+file$/i.test(part)) {
        trans = isFirst ? 'Отредактирован файл' : 'отредактирован файл';
      } else if (/^edited\s+files$/i.test(part)) {
        trans = isFirst ? 'Отредактированы файлы' : 'отредактированы файлы';
      } else if (/^editing\s+artifacts?$/i.test(part)) {
        trans = isFirst ? 'Редактирование артефакта' : 'редактирование артефакта';
      } else if (/^edited\s+artifact$/i.test(part)) {
        trans = isFirst ? 'Отредактирован артефакт' : 'отредактирован артефакт';
      } else if (/^edited\s+artifacts$/i.test(part)) {
        trans = isFirst ? 'Отредактированы артефакты' : 'отредактированы артефакты';
      } else if (/^editing\s+(\d+)\s+files?$/i.test(part)) {
        const n = part.match(/\d+/)[0];
        trans = isFirst ? `Редактирование файлов (${n})` : `редактирование файлов (${n})`;
      } else if (/^edited\s+(\d+)\s+files?$/i.test(part)) {
        const n = part.match(/\d+/)[0];
        trans = isFirst ? `Отредактировано файлов: ${n}` : `отредактировано файлов: ${n}`;
      }

      if (trans) {
        translatedParts.push(trans);
      } else {
        return null;
      }
    }

    if (translatedParts.length === 0) return null;
    return translatedParts.join(', ');
  }

  // Runtime Miss Collector: тихо буферизует и отправляет пропущенные английские фразы на companion_server
  const unhandledBuffer = new Set();
  let unhandledFlushTimer = null;

  function isPrivateContainer(domNode) {
    if (!domNode) return false;
    const el = domNode.nodeType === 1 ? domNode : domNode.parentElement;
    if (!el) return false;
    if (el.closest('textarea, input, pre, code, .monaco-editor, [contenteditable="true"]')) return true;
    if (el.closest('.chat-message, .conversation-item, .conversation-title, .user-message, .agent-message, .prose, .markdown, .thread-item, [data-testid*="conversation"], [data-testid*="message"], [data-testid*="sidebar"]')) return true;
    return false;
  }

  function reportUntranslatedString(raw, domNode) {
    if (domNode && isPrivateContainer(domNode)) return;
    if (!raw || typeof raw !== 'string') return;
    const str = raw.trim();
    if (str.length < 2 || str.length > 80) return;
    if (/[а-яА-ЯёЁ]/.test(str)) return;
    if (!/^[A-Za-z0-9\s:_\-.,!?()'"/%]+$/.test(str)) return;
    if (/^(https?:\/\/|file:\/\/|\/|[A-Za-z]:\\)/i.test(str)) return;
    if (/^[0-9+\-.,:;!?()\/\\%\s]+$/.test(str)) return;
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|ts|tsx|jsx|json|md|py|sh|ps1|exe|dll)$/i.test(str)) return;
    if (/^(Ctrl|Alt|Shift|Cmd|Meta|Enter|Esc|Space|Tab|\+)+/i.test(str)) return;
    if (/^#[0-9a-fA-F]{3,8}$/.test(str)) return;
    if (/(Error|Proto|Descriptor|Options|Field|Feature|Enum)$/i.test(str)) return;

    unhandledBuffer.add(str);

    if (!unhandledFlushTimer) {
      unhandledFlushTimer = setTimeout(flushUnhandledStrings, 4000);
    }
  }

  function flushUnhandledStrings() {
    unhandledFlushTimer = null;
    if (unhandledBuffer.size === 0) return;

    const list = Array.from(unhandledBuffer);
    unhandledBuffer.clear();

    try {
      fetch('http://127.0.0.1:9229/api/collect-untranslated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strings: list }),
        keepalive: true
      }).catch(() => {});
    } catch (e) {}
  }

  function getTranslation(rawText) {
    if (!rawText || !window.__agyDictRu) return null;
    const trimmed = rawText.trim();
    if (!trimmed || trimmed.length < 2) return null;

    const dict = window.__agyDictRu;

    // 1. Exact match
    if (dict.exact && dict.exact[trimmed]) {
      const match = dict.exact[trimmed];
      const leading = /^[.,;:!?)]/.test(match) ? '' : rawText.match(/^\s*/)[0];
      const trailing = rawText.match(/\s*$/)[0];
      return leading + match + trailing;
    }

    // 2. Trajectory summary special handler
    const trajTr = translateTrajectorySummary(trimmed);
    if (trajTr) {
      const leading = rawText.match(/^\s*/)[0];
      const trailing = rawText.match(/\s*$/)[0];
      return leading + trajTr + trailing;
    }

    // 3. Pattern match (Safe compilation guard)
    if (dict.patterns && dict.patterns.length) {
      for (const p of dict.patterns) {
        if (p._invalid) continue;
        if (!p._compiled) {
          try {
            p._compiled = new RegExp(p.regex);
          } catch (e) {
            p._invalid = true;
            continue;
          }
        }
        try {
          if (p._compiled.test(trimmed)) {
            const replacement = p.replace !== undefined ? p.replace : p.replacement;
            if (replacement === undefined) continue;
            let replaced = trimmed.replace(p._compiled, replacement);
            replaced = formatTimeTokens(replaced);
            const leading = /^[.,;:!?)]/.test(replaced) ? '' : rawText.match(/^\s*/)[0];
            const trailing = rawText.match(/\s*$/)[0];
            return leading + replaced + trailing;
          }
        } catch (e) {
          p._invalid = true;
        }
      }
    }

    return null;
  }

  function translateTextNode(node, lang) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent || isExcluded(parent)) return;

    const rev = getReverseMap();
    const trimmedVal = node.nodeValue.trim();

    if (rev[trimmedVal]) {
      const leading = node.nodeValue.match(/^\s*/)[0];
      const trailing = node.nodeValue.match(/\s*$/)[0];
      node.__agy_orig = leading + rev[trimmedVal] + trailing;
    } else if (node.__agy_orig === undefined || (node.nodeValue !== node.__agy_last_translated && !rev[trimmedVal])) {
      node.__agy_orig = node.nodeValue;
    }

    if (lang === 'ru') {
      // Special handler for React Fragment: ["Thinking for ", number, "s"]
      if (trimmedVal === 'Thinking for') {
        const next = node.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) {
          const nextNext = next.nextSibling;
          if (nextNext && nextNext.nodeType === Node.TEXT_NODE && nextNext.nodeValue.trim() === 's') {
            try {
              isInternalMutating = true;
              node.nodeValue = 'Размышление (';
              node.__agy_last_translated = node.nodeValue;
              nextNext.nodeValue = ' с)';
              nextNext.__agy_last_translated = nextNext.nodeValue;
              return;
            } finally {
              isInternalMutating = false;
            }
          }
        }
      }

      // Special handler for NUX callout paragraphs with inline SVGs
      if (trimmedVal === 'Search conversations with') {
        const nextSvg = node.nextSibling;
        if (nextSvg && nextSvg.nodeType === Node.ELEMENT_NODE) {
          const nextText = nextSvg.nextSibling;
          if (nextText && nextText.nodeType === Node.TEXT_NODE && nextText.nodeValue.includes('in the top left.')) {
            try {
              isInternalMutating = true;
              node.nodeValue = 'Поиск по диалогам через ';
              node.__agy_last_translated = node.nodeValue;
              nextText.nodeValue = ' вверху слева.';
              nextText.__agy_last_translated = nextText.nodeValue;
              return;
            } finally {
              isInternalMutating = false;
            }
          }
        }
      }

      if (trimmedVal === 'View archived in the sidebar (') {
        const nextSvg = node.nextSibling;
        if (nextSvg && nextSvg.nodeType === Node.ELEMENT_NODE) {
          const nextText = nextSvg.nextSibling;
          if (nextText && nextText.nodeType === Node.TEXT_NODE && nextText.nodeValue.includes('menu).')) {
            try {
              isInternalMutating = true;
              node.nodeValue = 'Просмотр архива в боковой панели (меню ';
              node.__agy_last_translated = node.nodeValue;
              nextText.nodeValue = ').';
              nextText.__agy_last_translated = nextText.nodeValue;
              return;
            } finally {
              isInternalMutating = false;
            }
          }
        }
      }

      const tr = getTranslation(node.__agy_orig);
      if (tr && tr !== node.nodeValue) {
        try {
          isInternalMutating = true;
          if (/^[.,;:!?)]/.test(tr)) {
            const prev = node.previousSibling;
            if (prev && prev.nodeType === Node.TEXT_NODE && /^\s+$/.test(prev.nodeValue)) {
              if (prev.__agy_orig === undefined) prev.__agy_orig = prev.nodeValue;
              prev.nodeValue = '';
            }
          }
          node.nodeValue = tr;
          node.__agy_last_translated = tr;
        } finally {
          isInternalMutating = false;
        }
      } else if (!tr && node.__agy_orig) {
        reportUntranslatedString(node.__agy_orig, node);
      }
    } else {
      if (trimmedVal === 'Размышление (') {
        const next = node.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE) {
          const nextNext = next.nextSibling;
          if (nextNext && nextNext.nodeType === Node.TEXT_NODE && nextNext.nodeValue.trim() === 'с)') {
            try {
              isInternalMutating = true;
              node.nodeValue = 'Thinking for ';
              node.__agy_last_translated = node.nodeValue;
              nextNext.nodeValue = 's';
              nextNext.__agy_last_translated = nextNext.nodeValue;
              return;
            } finally {
              isInternalMutating = false;
            }
          }
        }
      }

      if (trimmedVal === 'Поиск по диалогам через') {
        const nextSvg = node.nextSibling;
        if (nextSvg && nextSvg.nodeType === Node.ELEMENT_NODE) {
          const nextText = nextSvg.nextSibling;
          if (nextText && nextText.nodeType === Node.TEXT_NODE && nextText.nodeValue.includes('вверху слева.')) {
            try {
              isInternalMutating = true;
              node.nodeValue = 'Search conversations with ';
              node.__agy_last_translated = node.nodeValue;
              nextText.nodeValue = ' in the top left.';
              nextText.__agy_last_translated = nextText.nodeValue;
              return;
            } finally {
              isInternalMutating = false;
            }
          }
        }
      }

      if (trimmedVal === 'Просмотр архива в боковой панели (меню') {
        const nextSvg = node.nextSibling;
        if (nextSvg && nextSvg.nodeType === Node.ELEMENT_NODE) {
          const nextText = nextSvg.nextSibling;
          if (nextText && nextText.nodeType === Node.TEXT_NODE && nextText.nodeValue.includes(').')) {
            try {
              isInternalMutating = true;
              node.nodeValue = 'View archived in the sidebar (';
              node.__agy_last_translated = node.nodeValue;
              nextText.nodeValue = ' menu).';
              nextText.__agy_last_translated = nextText.nodeValue;
              return;
            } finally {
              isInternalMutating = false;
            }
          }
        }
      }

      if (node.__agy_orig !== undefined && node.nodeValue !== node.__agy_orig) {
        try {
          isInternalMutating = true;
          const prev = node.previousSibling;
          if (prev && prev.nodeType === Node.TEXT_NODE && prev.__agy_orig !== undefined) {
            prev.nodeValue = prev.__agy_orig;
          }
          node.nodeValue = node.__agy_orig;
          node.__agy_last_translated = node.__agy_orig;
        } finally {
          isInternalMutating = false;
        }
      }
    }
  }

  function translateAttributes(el, lang) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE || isAttrExcluded(el)) return;

    const attrs = ['placeholder', 'title', 'aria-label'];
    const dict = window.__agyDictRu || {};
    const rev = getReverseMap();

    for (const attr of attrs) {
      const val = el.getAttribute(attr);
      if (!val) continue;

      const cacheProp = '__agy_orig_' + attr;
      const trimmedVal = val.trim();
      if (rev[trimmedVal]) {
        el[cacheProp] = rev[trimmedVal];
      } else if (el[cacheProp] === undefined) {
        el[cacheProp] = val;
      }

      if (lang === 'ru') {
        let tr = (dict.attributes && dict.attributes[el[cacheProp]]) ||
                 (dict.exact && dict.exact[el[cacheProp]]) ||
                 getTranslation(el[cacheProp]);
        if (tr && tr !== val) {
          try {
            isInternalMutating = true;
            el.setAttribute(attr, tr);
          } finally {
            isInternalMutating = false;
          }
        } else if (!tr && el[cacheProp]) {
          reportUntranslatedString(el[cacheProp], el);
        }
      } else {
        if (el[cacheProp] !== undefined && val !== el[cacheProp]) {
          try {
            isInternalMutating = true;
            el.setAttribute(attr, el[cacheProp]);
          } finally {
            isInternalMutating = false;
          }
        }
      }
    }
  }

  function translateReactTooltipRegistry() {
    if (currentLang !== 'ru' || !window.__agyDictRu) return;
    try {
      const trigger = document.querySelector('[data-tooltip-id]');
      if (!trigger) return;
      const fKey = Object.getOwnPropertyNames(trigger).find(k => k.startsWith('__reactFiber'));
      if (!fKey) return;
      let fiber = trigger[fKey];

      function walkProps(n) {
        if (!n) return;
        if (Array.isArray(n)) {
          for (let i = 0; i < n.length; i++) {
            if (typeof n[i] === 'string') {
              const rep = getTranslation(n[i]);
              if (rep) n[i] = rep;
            } else if (n[i] && typeof n[i] === 'object') {
              walkProps(n[i]);
            }
          }
        } else if (typeof n === 'object') {
          if (n.props && n.props.children) {
            if (typeof n.props.children === 'string') {
              const rep = getTranslation(n.props.children);
              if (rep) n.props.children = rep;
            } else {
              walkProps(n.props.children);
            }
          }
        }
      }

      while (fiber) {
        let h = fiber.memoizedState;
        while (h) {
          if (h.memoizedState && typeof h.memoizedState === 'object' && 'current' in h.memoizedState) {
            const cur = h.memoizedState.current;
            if (cur && typeof cur === 'object') {
              for (const [k, v] of Object.entries(cur)) {
                if (v && v.body) {
                  if (typeof v.body === 'string') {
                    const rep = getTranslation(v.body);
                    if (rep) v.body = rep;
                  } else {
                    walkProps(v.body);
                  }
                }
              }
            }
          }
          h = h.next;
        }
        fiber = fiber.return;
      }
    } catch (e) {}
  }

  function walkAndTranslate(root, lang) {
    if (!root || !root.ownerDocument) return;

    if (root.nodeType === Node.TEXT_NODE) {
      const p = root.parentElement;
      if (!p || !isExcluded(p)) {
        translateTextNode(root, lang);
      }
      return;
    }

    if (root.nodeType === Node.ELEMENT_NODE) {
      if (!isAttrExcluded(root)) {
        translateAttributes(root, lang);
      }
      if (isExcluded(root)) return;
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (!p || isExcluded(p)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let curr;
    while (curr = walker.nextNode()) {
      translateTextNode(curr, lang);
    }

    if (root.querySelectorAll) {
      const elementsWithAttrs = root.querySelectorAll('[placeholder], [title], [aria-label]');
      for (let i = 0; i < elementsWithAttrs.length; i++) {
        if (!isAttrExcluded(elementsWithAttrs[i])) {
          translateAttributes(elementsWithAttrs[i], lang);
        }
      }
    }
  }

  // Batch queue for MutationObserver
  let scheduledNodes = new Set();
  let rafId = null;

  function processBatch() {
    rafId = null;
    const nodes = Array.from(scheduledNodes);
    scheduledNodes.clear();

    for (const node of nodes) {
      if (document.body.contains(node)) {
        walkAndTranslate(node, currentLang);
      }
    }
  }

  function queueNode(node) {
    scheduledNodes.add(node);
    if (!rafId) {
      rafId = requestAnimationFrame(processBatch);
    }
  }

  if (window.__agyTranslatorObserver) {
    window.__agyTranslatorObserver.disconnect();
  }

  const observer = new MutationObserver((mutations) => {
    if (isInternalMutating) return;

    for (const mut of mutations) {
      if (mut.type === 'childList') {
        for (let i = 0; i < mut.addedNodes.length; i++) {
          const added = mut.addedNodes[i];
          if (added.nodeType === Node.ELEMENT_NODE) {
            queueNode(added);
          } else if (added.nodeType === Node.TEXT_NODE) {
            queueNode(added.parentElement || document.body);
          }
        }
      } else if (mut.type === 'characterData') {
        if (mut.target && mut.target.nodeType === Node.TEXT_NODE) {
          queueNode(mut.target.parentElement || document.body);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.__agyTranslatorObserver = observer;
  window.__agyTranslatorActive = true;

  // Global Language Switcher API
  window.setAgyLanguage = function(lang) {
    if (lang !== 'ru' && lang !== 'en') return;
    currentLang = lang;
    localStorage.setItem('agy_lang', lang);
    localStorage.setItem('agy_limits_lang', lang);
    console.log(`[Antigravity Translator] Language switched to: ${lang.toUpperCase()}`);
    translateReactTooltipRegistry();
    walkAndTranslate(document.body, currentLang);
  };

  window.__agyTranslatorRefresh = function() {
    cachedRev = null;
    translateReactTooltipRegistry();
    walkAndTranslate(document.body, currentLang);
  };

  window.addEventListener('agy-language-change', (e) => {
    if (e.detail && e.detail.lang) {
      window.setAgyLanguage(e.detail.lang);
    }
  });

  // Dynamic Tooltip Interceptor
  document.addEventListener('pointerenter', (e) => {
    if (e.target && e.target.nodeType === Node.ELEMENT_NODE) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-tooltip-id')) {
        translateReactTooltipRegistry();
      }
    }
  }, true);

  document.addEventListener('mouseover', (e) => {
    if (e.target && e.target.nodeType === Node.ELEMENT_NODE) {
      if (e.target.closest && (e.target.closest('[data-tooltip-id]') || e.target.closest('.compact-tooltip, [role="tooltip"]'))) {
        translateReactTooltipRegistry();
        const tip = e.target.closest('.compact-tooltip, [role="tooltip"]');
        if (tip) walkAndTranslate(tip, currentLang);
      }
    }
  }, true);

  // Native & Custom Context Menu Interceptor (Capture Phase)
  function getTranslatedLabel(label) {
    if (!label || typeof label !== 'string') return label;
    const trimmed = label.trim();
    if (!trimmed) return label;
    const dict = window.__agyDictRu;
    if (!dict) return label;
    if (dict.exact && dict.exact[trimmed]) return dict.exact[trimmed];
    if (dict.attributes && dict.attributes[trimmed]) return dict.attributes[trimmed];
    const tr = getTranslation(trimmed);
    if (tr) return tr;
    return label;
  }

  function buildNativeMenuTemplate(items, clickMap, prefix = 'cmi') {
    if (!Array.isArray(items)) return [];
    return items.filter(Boolean).map((item, idx) => {
      const id = item.id || `${prefix}-${idx}`;
      const onClick = item.onClick || item.click;
      if (onClick) {
        clickMap.set(id, onClick);
      }
      const entry = {
        id,
        label: getTranslatedLabel(item.label),
        type: item.type === 'separator' ? 'separator' : (item.type === 'submenu' || (item.items && item.items.length > 0)) ? 'submenu' : 'normal',
        disabled: item.type === 'label' ? true : (item.disabled ?? (item.enabled !== undefined ? !item.enabled : false)),
        accelerator: item.accelerator
      };
      if (item.items && item.items.length > 0) {
        entry.submenu = buildNativeMenuTemplate(item.items, clickMap, `${id}-sub`);
      }
      return entry;
    });
  }

  if (window.__agyContextMenuHandler) {
    window.removeEventListener('contextmenu', window.__agyContextMenuHandler, true);
  }

  window.__agyContextMenuHandler = function(event) {
    if (currentLang !== 'ru' || !window.__agyDictRu) return;
    if (event.defaultPrevented) return;

    const targetEl = event.target;
    if (!targetEl || typeof targetEl.closest !== 'function') return;

    // Skip input fields, textareas, and code editors that manage their own context menus
    if (targetEl.closest('input, textarea, .monaco-editor, .xterm')) return;

    let el = targetEl;
    let foundItems = null;

    while (el && el !== document.body && el !== document.documentElement) {
      const fKey = Object.getOwnPropertyNames(el).find(k => k.startsWith('__reactFiber'));
      if (fKey) {
        let curr = el[fKey];
        while (curr) {
          if (curr.memoizedProps && curr.memoizedProps.items) {
            try {
              const raw = typeof curr.memoizedProps.items === 'function'
                ? curr.memoizedProps.items()
                : curr.memoizedProps.items;
              if (Array.isArray(raw) && raw.length > 0) {
                foundItems = raw;
                break;
              }
            } catch (e) {}
          }
          curr = curr.return;
        }
      }
      if (foundItems) break;
      el = el.parentElement;
    }

    if (!foundItems || !window.electronNative?.showContextMenu) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const clickMap = new Map();
    const template = buildNativeMenuTemplate(foundItems, clickMap);

    window.electronNative.showContextMenu(template).then(clickedId => {
      if (clickedId && clickMap.has(clickedId)) {
        try {
          clickMap.get(clickedId)();
        } catch (err) {
          console.error('[Companion] Error in context menu click handler:', err);
        }
      }
    }).catch(err => {
      console.warn('[Companion] Failed to display native context menu:', err);
    });
  };

  window.addEventListener('contextmenu', window.__agyContextMenuHandler, true);

  // Initial translation run
  translateReactTooltipRegistry();
  walkAndTranslate(document.body, currentLang);
  console.log(`[Antigravity Translator] Engine initialized successfully. Active: ${currentLang.toUpperCase()}`);
})();
