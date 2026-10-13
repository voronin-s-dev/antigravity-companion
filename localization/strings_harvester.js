const fs = require('fs');
const path = require('path');

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
  const page = tabs.find(t => t.type === 'page');
  if (!page) {
    console.error('Antigravity page not found');
    return;
  }

  const dictPath = path.join(__dirname, 'dictionary_ru.json');
  const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.onopen = () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const excluded = [
            'script', 'style', 'noscript', 'pre', 'code',
            '.monaco-editor', '.xterm', 'textarea', 'input',
            '[contenteditable="true"]', '[data-lexical-editor]',
            '.prose', '.markdown', '[role="log"]', '#agy-limits-floating-panel', '.font-mono',
            '[data-testid*="conversation"]', '[data-testid*="thread"]', '[data-testid*="session"]',
            '[data-testid*="user-input"]', '[data-testid*="message"]', '[data-testid$="-step"]',
            '.chat-message', '.user-message', '.agent-message', '.select-text', '[data-quotable="true"]',
            '.thread-item', '.conversation-item', '.conversation-title'
          ].join(', ');
          const items = new Set();
          const SECRET_RE = /\\b\\d{8,11}:[A-Za-z0-9_-]{35}\\b|\\bAIza[0-9A-Za-z-_]{35}\\b|\\bsk-(proj-)?[a-zA-Z0-9_-]{20,}\\b|\\bsk-ant-[a-zA-Z0-9_-]{20,}\\b|\\b(ghp_|github_pat_|AKIA|ASIA|xox[baprs]-|sk_live_)[a-zA-Z0-9_-]{10,}\\b|\\b[a-f0-9]{32,64}\\b/i;

          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const p = node.parentElement;
                if (!p || p.matches(excluded) || p.closest(excluded)) return NodeFilter.FILTER_REJECT;
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

          // Check attributes
          document.querySelectorAll('[placeholder], [title], [aria-label]').forEach(el => {
            if (el.matches(excluded) || el.closest(excluded)) return;
            ['placeholder', 'title', 'aria-label'].forEach(attr => {
              const orig = el['__agy_orig_' + attr] || el.getAttribute(attr);
              if (orig && orig.trim().length > 1 && /[A-Za-z]/.test(orig) && !SECRET_RE.test(orig)) {
                items.add(orig.trim());
              }
            });
          });

          // Check React Tooltip Registry
          try {
            function extractNodeStrings(node) {
              if (!node) return;
              if (typeof node === 'string') {
                const tr = node.trim();
                if (tr.length > 1 && /[A-Za-z]/.test(tr) && !/^[0-9+\\-.,:;!?()\\/\\s]+$/.test(tr) && !/^(Enter|Shift|Ctrl|Alt|Cmd|Esc|Space)$/i.test(tr)) {
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

            const trigger = document.querySelector('[data-tooltip-id]');
            if (trigger) {
              const fKey = Object.getOwnPropertyNames(trigger).find(k => k.startsWith('__reactFiber'));
              let fiber = trigger[fKey];
              while (fiber) {
                let h = fiber.memoizedState;
                while (h) {
                  if (h.memoizedState && typeof h.memoizedState === 'object' && 'current' in h.memoizedState) {
                    const cur = h.memoizedState.current;
                    if (cur && typeof cur === 'object' && Object.keys(cur).some(k => k.includes('tooltip') || k.startsWith(':r'))) {
                      for (const val of Object.values(cur)) {
                        if (val && val.body) extractNodeStrings(val.body);
                      }
                      break;
                    }
                  }
                  h = h.next;
                }
                fiber = fiber.return;
              }
            }
          } catch (e) {}

          return Array.from(items);
        })()`,
        returnByValue: true
      }
    }));
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id === 1) {
      const candidates = data.result?.result?.value || [];
      const untranslated = candidates.filter(str => {
        if (dict.exact && dict.exact[str]) return false;
        if (dict.attributes && dict.attributes[str]) return false;
        if (dict.patterns) {
          for (const p of dict.patterns) {
            if (new RegExp(p.regex).test(str)) return false;
          }
        }
        return true;
      });

      const queuePath = path.join(__dirname, 'untranslated_queue.json');
      fs.writeFileSync(queuePath, JSON.stringify(untranslated, null, 2), 'utf8');
      console.log(`[Strings Harvester] Found ${candidates.length} total UI strings, ${untranslated.length} untranslated. Saved to untranslated_queue.json`);
      ws.close();
    }
  };
}

if (require.main === module) {
  harvestMissingStrings().catch(console.error);
}

module.exports = { harvestMissingStrings };
