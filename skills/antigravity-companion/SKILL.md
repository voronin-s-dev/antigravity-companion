---
name: antigravity-companion
description: >-
  Manages the Antigravity Russian translation dictionary, UI localization engine,
  model limits widget, and token-saving CDP workflows. Use when translating new UI strings,
  diagnosing runtime injection, managing updates, or configuring companion widget parameters.
---

# Antigravity Companion: Russian UI & Limits Widget

This skill allows the Antigravity AI assistant to inspect, update, and manage the Antigravity Companion module with maximum token efficiency.

## Core Capabilities & Fast Workflows

### 1. Zero-Context Dictionary Management (Token Economy)
- **Primary dictionary**: `localization/dictionary_ru.json` (>740 terms, 66 KB).
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

### 2. Express CDP & UI Diagnostics
- Instead of creating scratch WebSocket scripts, use the built-in diagnostic CLI:
  ```bash
  # Check overall status of translator, limits panel, sidebar button
  npm run doctor:cdp

  # Evaluate any DOM expression in the running Antigravity window in 1 second:
  node bin/cdp_doctor.js --eval "document.title"
  node bin/cdp_doctor.js --eval "document.getElementById('agy-limits-floating-panel')?.style.display"
  ```

### 3. Hot-Reloading Components
- Re-inject both translator and limits widget on the fly without restarting Antigravity:
  ```bash
  npm run reload
  ```

### 4. Widget Architecture
- Implementation: `limits_widget/inject_panel.js`.
- Features: 5h and weekly quota monitoring for Gemini & Claude, responsive edge anchoring, live second countdown tooltip (`#agy-limits-tooltip`), sidebar toggle button, and global hotkey `Alt + L`.

### 5. Session Ceiling & Handoff
- When a development session approaches 35–40 steps, summarize progress in `ACTIVE_STATE.md`, commit changes, and initiate `/handoff` to prevent token bloat.
