---
name: antigravity-companion
description: >-
  Manages the Antigravity Russian translation dictionary, UI localization engine,
  and model limits widget. Use when translating new UI strings, managing updates,
  or configuring companion widget parameters.
---

# Antigravity Companion: Russian UI & Limits Widget

This skill allows the Antigravity AI assistant to inspect, update, and manage the Antigravity Companion module.

## Core Capabilities

1. **Dictionary Management**:
   - Primary translation dictionary: `localization/dictionary_ru.json`.
   - Adding exact match entries: `dict.exact[englishString] = russianString`.
   - Adding attribute translations (tooltips, ARIA labels, placeholders): `dict.attributes[english] = russian`.
   - Adding regex pattern rules: `dict.patterns.push({ regex: "^Pattern (\\d+)$", replacement: "Шаблон $1" })`.

2. **Hot-Reloading Translation**:
   - Run `node localization/inject_translator.js` to immediately apply newly added dictionary entries to the live Antigravity window without application restart.

3. **String Harvesting**:
   - Run `node localization/strings_harvester.js` to scan the active DOM for newly introduced English strings that need translation.

4. **Widget Customization**:
   - Widget implementation is located in `limits_widget/inject_panel.js`.
   - Supports 5h and weekly quotas for Gemini and Claude models.
   - Includes live second-level ticking tooltip countdowns.
   - Configurable color tint and eye-dropper integration.
