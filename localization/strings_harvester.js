const fs = require('fs');
const path = require('path');
const { isInjectableTarget } = require('./inject_translator.js');
const { isStrictUiString } = require('./sanitize_queue.js');

const HARVEST_EXPR = `(() => {
  const hardExcluded = [
    'head', 'script', 'style', 'noscript', 'pre', 'code',
    '.monaco-editor', '.xterm', 'textarea', 'input',
    '[contenteditable="true"]', '[data-lexical-editor]',
    '#agy-limits-floating-panel', '.font-mono',
    '[data-testid="conversation-row-sidebar"]', '[data-testid*="conversation-title"]', '[data-testid*="conversation-item"]', '[data-testid*="thread"]', '[data-testid*="session"]',
    '[data-testid*="user-input"]', '[data-testid$="-step"]', '[data-testid="step-plan-item"]',
    '[data-testid="project-header"]', '[data-project-card]', '[data-project-label]', '[data-project-name]',
    '[data-testid="project-selector-item"]', '[data-testid="project-selector-trigger"]', '[data-testid="breadcrumb-segment"]',
    '[data-testid*="project-name"]', '[data-testid*="project-title"]', '[data-testid*="workspace-name"]', '[data-testid*="workspace-title"]',
    '[data-testid*="file-tree"]', '[data-testid*="file-node"]', '[data-testid*="explorer-item"]', '[data-testid*="tab-label"]',
    '[role="region"][aria-label="Explorer"]', '[role="region"][aria-label="Просмотр файлов"]', '.monaco-list-row',
    '.chat-message', '.user-message', '.agent-message', '[data-testid="planner-response-text"]', '[data-testid="user-message-bubble"]',
    '[data-quotable="true"]', '.thread-item', '.conversation-item', '.conversation-title',
    '#typeahead-menu', '[id^="typeahead-item"]', '[data-testid^="menu-option-"]', '[data-testid="hover-card-title"]', '[data-mention-menu]'
  ].join(', ');
  const markdownExcluded = [
    '.prose', '.markdown', '[role="log"]', '.select-text', '[data-testid*="message"]', '.animate-markdown', '.markdown-alert'
  ].join(', ');
  const overlayAllowed = '[data-testid="toast-notification"], [data-testid="toast-permission"], .toast-viewport, .compact-tooltip, [role="tooltip"], [role="dialog"], [role="alertdialog"], [data-base-ui-portal], [data-radix-popper-content-wrapper]';

  function isHarvestExcluded(p) {
    if (!p) return true;
    if (p.matches(hardExcluded) || p.closest(hardExcluded)) return true;
    const inOverlay = !!p.closest(overlayAllowed);
    if (!inOverlay && (p.matches(markdownExcluded) || p.closest(markdownExcluded))) return true;
    return false;
  }

  const items = new Set();
  const SECRET_RE = /\\b\\d{8,11}:[A-Za-z0-9_-]{35}\\b|\\bAIza[0-9A-Za-z-_]{35}\\b|\\bsk-(proj-)?[a-zA-Z0-9_-]{20,}\\b|\\bsk-ant-[a-zA-Z0-9_-]{20,}\\b|\\b(ghp_|github_pat_|AKIA|ASIA|xox[baprs]-|sk_live_)[a-zA-Z0-9_-]{10,}\\b|\\b[a-f0-9]{32,64}\\b/i;

  function collectFromRoot(root) {
    if (!root) return;
    const walker = (root.ownerDocument || document).createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (!p || isHarvestExcluded(p)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let curr;
    while (curr = walker.nextNode()) {
      const val = curr.__agy_orig !== undefined ? curr.__agy_orig.trim() : curr.nodeValue.trim();
      if (val.length > 1 && /[A-Za-z]/.test(val) && !SECRET_RE.test(val)) {
        items.add(val);
      }
    }

    if (root.querySelectorAll) {
      root.querySelectorAll('[placeholder], [title], [aria-label], [aria-description], [data-tooltip-content], [data-tooltip], [alt]').forEach(el => {
        if (el.matches(hardExcluded) || el.closest(hardExcluded)) return;
        ['placeholder', 'title', 'aria-label', 'aria-description', 'data-tooltip-content', 'data-tooltip', 'alt'].forEach(attr => {
          const orig = el['__agy_orig_' + attr] || el.getAttribute(attr);
          if (orig && orig.trim().length > 1 && /[A-Za-z]/.test(orig) && !SECRET_RE.test(orig)) {
            items.add(orig.trim());
          }
        });
      });

      root.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot) collectFromRoot(el.shadowRoot);
      });
    }
  }

  collectFromRoot(document.documentElement || document.body);

  // Check ALL React Tooltip Registries & standalone tooltip props
  try {
    function extractNodeStrings(node) {
      if (!node) return;
      if (typeof node === 'string') {
        const tr = node.trim();
        if (tr.length > 1 && /[A-Za-z]/.test(tr) && !SECRET_RE.test(tr) && !/^[0-9+\\-.,:;!?()\\/\\s]+$/.test(tr) && !/^(Enter|Shift|Ctrl|Alt|Cmd|Esc|Space)$/i.test(tr)) {
          items.add(tr);
        }
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(extractNodeStrings);
        return;
      }
      if (typeof node === 'object' && node.props) {
        extractNodeStrings(node.props.children);
      }
    }

    const triggers = document.querySelectorAll('[data-tooltip-id]');
    const visitedFibers = new WeakSet();
    const visitedRegistries = new WeakSet();
    for (const trigger of triggers) {
      const fKey = Object.getOwnPropertyNames(trigger).find(k => k.startsWith('__reactFiber'));
      let fiber = fKey ? trigger[fKey] : null;
      while (fiber && !visitedFibers.has(fiber)) {
        visitedFibers.add(fiber);
        if (fiber.memoizedProps) {
          if (fiber.memoizedProps.body != null) extractNodeStrings(fiber.memoizedProps.body);
          if (typeof fiber.memoizedProps.content === 'string') extractNodeStrings(fiber.memoizedProps.content);
        }
        let h = fiber.memoizedState;
        while (h) {
          if (h.memoizedState && typeof h.memoizedState === 'object' && 'current' in h.memoizedState) {
            const cur = h.memoizedState.current;
            if (cur && typeof cur === 'object' && !Array.isArray(cur) && !visitedRegistries.has(cur)) {
              const vals = Object.values(cur);
              if (vals.some(v => v && typeof v === 'object' && 'body' in v)) {
                visitedRegistries.add(cur);
                for (const val of vals) {
                  if (val && val.body) extractNodeStrings(val.body);
                }
              }
            }
          }
          h = h.next;
        }
        fiber = fiber.return;
      }
    }
  } catch (e) {}

  return Array.from(items);
})()`;

function evalTarget(target) {
  return new Promise((resolve) => {
    let settled = false;
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch (_) {}
        resolve([]);
      }
    }, 4000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: HARVEST_EXPR, returnByValue: true }
      }));
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.id === 1 && !settled) {
          settled = true;
          clearTimeout(timer);
          try { ws.close(); } catch (_) {}
          resolve(data.result?.result?.value || []);
        }
      } catch (_) {}
    };

    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve([]);
      }
    };
  });
}

async function harvestMissingStrings() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
  const activePortFile = path.join(appData, 'Antigravity', 'DevToolsActivePort');
  if (!fs.existsSync(activePortFile)) {
    console.error('Antigravity is not running.');
    return;
  }
  const lines = fs.readFileSync(activePortFile, 'utf8').trim().split('\n');
  const port = lines[0].trim();
  const tabs = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
  const targets = tabs.filter(isInjectableTarget);
  if (targets.length === 0) {
    console.error('Antigravity page not found');
    return;
  }

  const dictPath = path.join(__dirname, 'dictionary_ru.json');
  const queuePath = path.join(__dirname, 'untranslated_queue.json');
  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

  const perTarget = await Promise.all(targets.map(evalTarget));
  const candidateSet = new Set();
  for (const list of perTarget) {
    for (const s of list) candidateSet.add(s);
  }
  const candidates = Array.from(candidateSet);

  let existingQueue = [];
  if (fs.existsSync(queuePath)) {
    try { existingQueue = JSON.parse(fs.readFileSync(queuePath, 'utf8')); } catch (_) {}
  }

  const freshUntranslated = candidates.filter(str => isStrictUiString(str, dict));
  const existingSet = new Set(existingQueue);
  const newOnes = freshUntranslated.filter(s => !existingSet.has(s));
  const mergedQueue = Array.from(new Set([
    ...existingQueue.filter(str => isStrictUiString(str, dict)),
    ...freshUntranslated
  ]));

  fs.writeFileSync(queuePath, JSON.stringify(mergedQueue, null, 2), 'utf8');
  console.log(`[Strings Harvester] Scanned ${targets.length} target(s): ${candidates.length} UI strings, +${newOnes.length} new (${mergedQueue.length} total in queue).`);
}

if (require.main === module) {
  harvestMissingStrings().catch(console.error);
}

module.exports = { harvestMissingStrings };
