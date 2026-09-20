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
          const excluded = 'script, style, noscript, pre, code, .monaco-editor, .xterm, textarea, [contenteditable="true"], [data-lexical-editor], .prose, [role="log"], #agy-limits-floating-panel, .font-mono, [data-testid="conversation-row-sidebar"] span.truncate';
          const items = new Set();

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
            // Check if looks like English and not purely numbers or single symbols
            if (val.length > 1 && /[A-Za-z]/.test(val)) {
              items.add(val);
            }
          }

          // Check attributes
          document.querySelectorAll('[placeholder], [title], [aria-label]').forEach(el => {
            if (el.matches(excluded) || el.closest(excluded)) return;
            ['placeholder', 'title', 'aria-label'].forEach(attr => {
              const orig = el['__agy_orig_' + attr] || el.getAttribute(attr);
              if (orig && orig.trim().length > 1 && /[A-Za-z]/.test(orig)) {
                items.add(orig.trim());
              }
            });
          });

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
