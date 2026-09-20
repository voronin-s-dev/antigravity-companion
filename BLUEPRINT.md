# System Blueprint: Antigravity Companion

## 1. Executive Summary & Goal
**Antigravity Companion** — автономный модуль расширения для Google Antigravity Desktop App (Electron), добавляющий:
1. Полную, естественную русификацию интерфейса приложения без модификации исходных файлов `app.asar`.
2. Настраиваемый плавающий виджет мониторинга квот моделей Gemini и Claude с живым обратным отсчетом секунд до сброса лимитов.
3. Интерактивный центр обновления словаря с поддержкой оффлайн-заморозки и синхронизации с GitHub.

---

## 2. Invariants & Core Rules
1. **Неинвазивность к ядру Antigravity**: исходные файлы приложения (`app.asar`) никогда не модифицируются. Всё взаимодействие происходит исключительно через Chrome DevTools Protocol (CDP, порты 9222 / 9000).
2. **Изоляция стилей и DOM**: все элементы виджета обязаны иметь префиксы `#agy-limits-` или `.agy-` для исключения конфликтов с нативным CSS Antigravity.
3. **Безопасность кода пользователя**: движок перевода никогда не затрагивает теги `<code>`, `<pre>`, редакторы кода, терминал и пользовательский ввод (`[contenteditable]`, `<input>`, `<textarea>`).
4. **Token Economy (Экономия токенов)**:
   - Файл `localization/dictionary_ru.json` (>66 КБ) запрещено считывать целиком в контекст LLM.
   - Поиск только через `grep_search` или точечный `view_file` (до 50-100 строк).
   - Все изменения вносятся точечно через `replace_file_content`.

---

## 3. Architecture Topology & Component Boundaries

```text
[Google Antigravity Desktop (CDP :9222/:9000)]
         ▲
         │ (WebSocket CDP Evaluation)
         ▼
[bin/antigravity_companion.js (Background Daemon)]
   ├── Injects -> [limits_widget/inject_panel.js]
   └── Injects -> [localization/translation_engine.js]
                      ▲
                      │ (Reads dictionary)
                  [localization/dictionary_ru.json]
```

- **`localization/`**:
  - `dictionary_ru.json` — единая база переводов: `exact` (точные совпадения), `attributes` (плейсхолдеры, ARIA, тултипы), `patterns` (регулярные выражения для динамических чисел/дат).
  - `translation_engine.js` — обход DOM через `MutationObserver` + динамический парсер времени (`formatTimeTokens`).
  - `inject_translator.js` — горячее применение словаря в работающем окне без перезапуска.
  - `strings_harvester.js` — инструмент сбора новых непереведенных строк.
- **`limits_widget/`**:
  - `inject_panel.js` — плавающий draggable виджет, компактный режим «пилюли», тикающий тултип с обратным отсчетом (`#agy-limits-tooltip`), экранная пипетка цвета (`EyeDropper API`).
- **`bin/`**:
  - `antigravity_companion.js` — фоновый наблюдатель, проверяющий активность порта CDP и наличие актуального виджета (`hasModernWidget`).
  - `start_silent.vbs` — запуск без консольного окна Windows.
  - `status.bat` / `stop.bat` — диагностика и остановка.

---

## 4. Architectural Decision Records (ADRs)

| ID | Решение | Обоснование | Альтернативы отвергнуты |
|---|---|---|---|
| **ADR-001** | Инъекция через CDP вместо патчинга `app.asar` | Патчинг ломается при каждом официальном обновлении Antigravity. CDP работает стабильно и не требует прав администратора. | Модификация `app.asar` |
| **ADR-002** | Оффлайн-режим по умолчанию (`.lock_updates`) | Пользователи должны иметь полный контроль над своей приватностью. Никаких скрытых сетевых запросов без ведома пользователя. | Автоматический pull словаря |
| **ADR-003** | Консольный GitHub CLI (`gh`) вместо GitHub MCP | Официальный MCP-сервер добавляет 25–30 инструментов в системный промпт, сжигая 3 000–5 000 токенов на каждом шаге. `gh` бесплатен по токенам. | GitHub MCP Server |
| **ADR-004** | Отдельный живой тултип вместо перерисовки всей плашки | Посекундное обновление счетчика в развернутом виде вызывает мерцание DOM. Отдельный `#agy-limits-tooltip` обновляет только текст подсказки. | Полный ре-рендер виджета |
