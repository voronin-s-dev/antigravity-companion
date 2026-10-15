---
name: microcopy
description: UI copy and microcopy guidelines for software and developer tools. Use for buttons, modals, toasts, status badges, error messages, empty states, tooltips, and interface terminology translation. For academic English and scholarly translation, see nature-polishing. For technical documentation, see writing-guidelines.
---

# UI Microcopy Guidelines

Guidelines for crafting crisp, accurate, user-centric interface text and microcopy in software and developer tooling.

## Core Rules

1. **Clarity First**: Short sentences, strong action verbs, minimal adjectives. Zero marketing fluff.
2. **Layered Information**:
   - Primary line: Direct outcome or status.
   - Secondary line (optional): Concise technical context or key shortcut.
3. **Consistent Action Verbs**:
   - `Create`, `Connect`, `Run`, `Pause`, `Retry`, `Reload`, `Save`, `Discard`, `View details`.
   - Avoid ambiguous labels like "OK" or "Continue" when a specific verb is possible (e.g. "Save changes", "Re-authenticate").
4. **Actionable Errors & Statuses**:
   Every error message must state:
   - What happened (plain, precise terms).
   - Why it happened (without blaming the user).
   - Concrete next step (e.g. `Retry`, `Open Settings`, `Check connection`).
5. **Space & Layout Constraints**:
   - Tooltips: 1–2 lines max, under 80 characters.
   - Button labels: 1–3 words.
   - Status bar pills: 1–2 words or icon + metric.

## Standard UI Terminology Mapping

| Context / Element | English Standard | Russian Standard |
| :--- | :--- | :--- |
| Workspace | Workspace | Рабочая область |
| Extension / Plugin | Extension / Plugin | Расширение / Плагин |
| Integration | Integration / Connector | Интеграция / Коннектор |
| Quota / Limits | Rate Limit / Quota | Лимит запросов / Квота |
| Countdown | Resets in [X] | Сброс через [X] |
| Remaining | Remaining | Осталось |
| Hotkey / Shortcut | Shortcut | Горячая клавиша |
| Reload / Refresh | Reload / Re-inject | Перезагрузить |
| Empty State | No items found | Ничего не найдено |
| Failed Request | Request failed | Ошибка запроса |

## Tone & Polish
- **80% Information, 20% Warmth**: Prioritize speed and clarity.
- Never use robotic machine translations that sound awkward or overly literal.
- Keep phrasing consistent across the entire interface and dictionary.
