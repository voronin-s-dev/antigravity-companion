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

  function getTranslation(rawText) {
    if (!rawText || !window.__agyDictRu) return null;
    const trimmed = rawText.trim();
    if (!trimmed || trimmed.length < 2) return null;

    const dict = window.__agyDictRu;

    // 1. Exact match
    if (dict.exact && dict.exact[trimmed]) {
      const match = dict.exact[trimmed];
      const leading = /^[.,;:!?]/.test(match) ? '' : rawText.match(/^\s*/)[0];
      const trailing = rawText.match(/\s*$/)[0];
      return leading + match + trailing;
    }

    // 2. Pattern match
    if (dict.patterns && dict.patterns.length) {
      for (const p of dict.patterns) {
        if (!p._compiled) p._compiled = new RegExp(p.regex);
        if (p._compiled.test(trimmed)) {
          const replacement = p.replace !== undefined ? p.replace : p.replacement;
          if (replacement === undefined) continue;
          let replaced = trimmed.replace(p._compiled, replacement);
          replaced = formatTimeTokens(replaced);
          const leading = /^[.,;:!?]/.test(replaced) ? '' : rawText.match(/^\s*/)[0];
          const trailing = rawText.match(/\s*$/)[0];
          return leading + replaced + trailing;
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
      const tr = getTranslation(node.__agy_orig);
      if (tr && tr !== node.nodeValue) {
        try {
          isInternalMutating = true;
          if (/^[.,;:!?]/.test(tr)) {
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
      }
    } else {
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

  // Initial translation run
  translateReactTooltipRegistry();
  walkAndTranslate(document.body, currentLang);
  console.log(`[Antigravity Translator] Engine initialized successfully. Active: ${currentLang.toUpperCase()}`);
})();
