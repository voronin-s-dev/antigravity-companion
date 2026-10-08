---
name: antigravity-companion
description: >-
  Manages the Antigravity Russian translation dictionary, UI localization engine,
  model limits widget, and token-saving CDP workflows. Use when translating new UI strings,
  diagnosing runtime injection, managing updates, or configuring companion widget parameters.
---

# Antigravity Companion: Russian UI & Limits Widget

This skill allows the Antigravity AI assistant to inspect, update, and manage the Antigravity Companion module with maximum token efficiency using the Orchestrator + Subagent pattern.

## Core Capabilities & Fast Workflows

### 1. Zero-Context Dictionary Management (Token Economy)
- **Primary dictionary**: `localization/dictionary_ru.json` (>1300 terms, 70 KB).
- **Rule**: NEVER read the dictionary file into agent context.
- **Harvesting new strings**:
  ```bash
  npm run harvest
  ```
  Scans active DOM and writes untranslated strings to `localization/untranslated_queue.json`.
- **Merging translations**:
  Create `localization/translations_to_merge.json`:
  ```json
  {
    "English phrase": "Русская фраза"
  }
  ```
  Then run:
  ```bash
  npm run merge
  ```
  This automatically merges entries into the dictionary, validates syntax (`npm test`), and triggers hot-reload.

### 2. Orchestrator & Ephemeral Subagents Workflow (FM Pattern)
- Main chat operates as an **Orchestrator**. Heavy tasks are offloaded to ephemeral subagents via `invoke_subagent`:
  - **Translator Subagent**: Runs `npm run harvest`, checks `untranslated_queue.json`, prepares `translations_to_merge.json`, calls `npm run merge`, verifies `npm test`. Returns only 2–3 lines of summary.
  - **CDP Verifier Subagent**: Inspects live DOM elements and runs `cdp_doctor.js --eval` commands without polluting the main context.
  - **Widget Engineer Subagent**: Modifies `inject_panel.js` or `translation_engine.js` with surgical edits, runs tests.
- **Fail-Fast Tool Budget**: Maximum 10–12 tool calls per subagent. If unresolved, terminates with `BLOCKED`.

### 3. Express CDP & UI Diagnostics
- Instead of creating scratch WebSocket scripts, use the built-in diagnostic CLI:
  ```bash
  # Check overall status of translator, limits panel, sidebar button
  npm run doctor:cdp

  # Evaluate any DOM expression in the running Antigravity window in 1 second:
  node bin/cdp_doctor.js --eval "document.title"
  node bin/cdp_doctor.js --eval "document.getElementById('agy-limits-floating-panel')?.style.display"
  ```

### 4. Hot-Reloading Components
- Re-inject both translator and limits widget on the fly without restarting Antigravity:
  ```bash
  npm run reload
  ```

### 5. Session Ceiling & Handoff
- When a development session approaches 30–35 steps, summarize progress in `ACTIVE_STATE.md`, commit changes, and initiate `/handoff` to prevent token bloat.
