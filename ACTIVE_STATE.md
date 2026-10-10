# Active State: Antigravity Companion

> **Единый компактный срез состояния проекта**: Агент читает только этот файл для быстрого входа в контекст без лишнего сканирования репозитория. Полная история прошлых вех (1–36) вынесена в холодный архив [docs/MILESTONES_HISTORY.md](file:///c:/Antigravity%20projects/antigravity-companion/docs/MILESTONES_HISTORY.md).

---

## 1. Метаданные репозитория
- **Версия**: `v1.6.0`
- **Ветка**: `main`
- **GitHub**: [https://github.com/voronin-s-dev/antigravity-companion](https://github.com/voronin-s-dev/antigravity-companion)
- **CI/CD**: `.github/workflows/release.yml` (автотесты + автосборка ZIP при тегах `v*`)
- **Архитектурный устав**: [AGENTS.md](file:///c:/Antigravity%20projects/antigravity-companion/AGENTS.md) (Оркестратор, субагенты, квоты)

---

## 2. Архитектурный базис
- **Словарь**: `localization/dictionary_ru.json` — **1473 точных термина**, **155 атрибутов**, **259 шаблонов** (всего 1887 правил).
- **Zero-Context Dictionary**: чтение словаря напрямую запрещено; пополнение через `localization/translations_to_merge.json` и `npm run merge`.
- **Служба Companion**: фоновый процесс Node.js с реактивным супервизором v2.0 (постоянный WebSocket, перехват `DevToolsActivePort`, мгновенная инъекция при перезагрузке, 0% CPU в ожидании).
- **Виджет лимитов**: встроен в сайдбар Antigravity (`#agy-limits-pill`) и разворачивается во флайаут/настройки без оверлеев. Поддержка звуковых оповещений (Web Audio / кастомные MP3), счетчик шагов сессии (`Шаг X/40`), Pre-flight Paste Guard и точный расчет ETA восстановления квот.
- **Сохранение настроек**: локальный сервер `companion_server.js` (порт 9229) синхронизирует состояние в `%APPDATA%\AntigravityCompanion\config.json`.

---

## 3. Последние вехи и текущий статус

### Веха 41: Локализация процессов и сворачиваемых шагов агента
- Переведены одиночные и составные заголовки действий агента: `Exploring files`, `Exploring files, editing file`, `Editing file(s)`, `Reading file(s)`, `Running command(s)`, `Searching web` и их вариации.
- Добавлено 72 точных термина и 39 гибких regex-шаблонов для комбинаций действий через запятую.

### Веха 42: Исчерпывающая локализация шагов агента (Грамматика pqb + Tool Action Registry)
- **Реверс-инжиниринг бандла Antigravity (main.js)**: исследованы алгоритмы `pqb()` и `GY()`, генерирующие заголовки процессов и плашки инструментов.
- **Детерминированный парсер pqb в translation_engine.js**: реализован синтаксический разбор всех сочетаний действий (`Exploring`, `Explored`, `Running`, `Ran`, `Editing`, `Edited`, `Working`, `Done` с файлами, командами, артефактами и их цепочками через запятую). Одиночный `Exploring` теперь корректно переводится как «Изучение».
- **Реестр инструментов и динамические паттерны**: добавлены 65 точных терминов и 20 regex-шаблонов для всех встроенных `toolSummary` и `toolAction` (`Web search`, `Searching the web`, `Directory analysis`, `Git status check`, `Test execution`, `Code search` и др.) плюс универсальные префиксные паттерны (`Searching...`, `Analyzing...`, `Checking...`).
- **Тесты и хот-релоад**: 100% покрытие грамматики тестами, общее число правил выросло до 1862, хот-релоад применен на лету.

### Веха 43: Аудит безопасности и защита Companion Server (CSRF / DNS Rebinding Guard)
- **Комплексный аудит поверхностей атаки**:
  - Секреты и токены: 0 утечек в кодовой базе и репозитории.
  - DOM-инъекции: подтверждена безопасность `translation_engine.js` (модификации производятся строго через `nodeValue`, без `innerHTML`).
  - Буфер обмена: Pre-flight Paste Guard проверяет только размер и строки, не отправляет и не сохраняет данные.
- **Устранение вектора CSRF & DNS Rebinding в `companion_server.js` (порт 9229)**:
  - Убран небезопасный wildcard CORS `*`.
  - Добавлена валидация заголовка `Host` (блокировка DNS Rebinding через внешние домены).
  - Добавлена валидация заголовка `Origin` (разрешены только loopback-источники Antigravity/Electron и локальный CLI; внешние сайты получают 403 Forbidden).
- **Тесты**: создан юнит-тест `test/companion_server_security.test.js`, включен в общий сьют `npm test`.

### Веха 44: Сквозная автоматизация сбора строк (Runtime Miss Collector + Static Bundle Harvester)
- **Тихий Runtime Collector в `translation_engine.js`**: непереведённые английские фразы при отображении автоматически буферизуются и передаются на фоновый сервер Companion без лагов и без необходимости делать скриншоты.
- **Эндпоинт `/api/collect-untranslated` в `companion_server.js`**: валидирует входящие строки, фильтрует технический шум и пути, сверяет со словарём и сохраняет новые термины в `localization/untranslated_queue.json`.
- **Статический экстрактор бандла `localization/bundle_harvester.js`**: сканирует 9.6 МБ React-бандл `main.js` напрямую из language server, извлекая 4300+ UI-литералов компонентов сразу для всех экранов IDE до их открытия пользователем.
- **Команды CLI**: добавлены `npm run harvest:bundle` и обновлен общий пайплайн `npm run harvest`.

### Веха 45: Автономный конвейер перевода (AI Auto-Translate, GitHub Actions CI/CD и Silent OTA Updates)
- **Модуль OTA-обновлений `bin/updater.js`**: автономная проверка и скачивание свежего словаря с GitHub для Git-репозиториев и standalone ZIP-клиентов.
- **Фоновый OTA-таймер в `bin/antigravity_companion.js`**: служба Companion раз в час (и при старте) тихо сверяет словарь с GitHub и при наличии обновлений мгновенно применяет их на лету через CDP прямо в открытое окно.
- **Модуль автоперевода `localization/auto_translate.js`**: пакетная обработка очереди `untranslated_queue.json` через Gemini Flash API (поддержка `.env` и секретов), автоматическое слияние в словарь и валидация через `npm test`.
### Веха 46: Защита приватности очереди и запуск автономного AI-перевода в GitHub Actions
- **Селекторная защита приватности**: внедрена фильтрация пользовательского контента в `translation_engine.js` (исключение `.chat-message`, `.conversation-item`, `pre`, `code` и текстовых инпутов). В очередь попадают строго UI-литералы приложения.
- **Санитайзер очереди `localization/sanitize_queue.js`**: фильтрует технический шум, горячие клавиши и названия диалогов. Очередь очищена до 4100+ чистых системных фраз Antigravity.
- **Подключение секретов и запуск в CI/CD**: в репозиторий добавлен секрет `GEMINI_API_KEY`, workflow переведён на `gemini-3.5-flash`.
- **Первый успешный запуск в облаке**: GitHub Actions перевёл 25 терминов (`Accept Step`, `Open Launchpad`, `New Window`, `Close Tab` и др.), автоматически прогнал `npm test` и закоммитил изменения в `main`. Хот-релоад применён локально.

---

## 4. Следующие шаги и бэклог
1. Собрать обратную связь пользователя по переводу детальных страниц плагинов и кастомизаций.
2. Поддержание актуальности словаря при обновлениях Antigravity через команду `npm run harvest` и слияние через субагента-переводчика.
3. Мониторинг новых секций UI Antigravity.

---

## 5. Памятка агенту (Правила Токен-Экономики)
- **Роль Оркестратора**: не выполняй тяжелые поиски, длинные тесты и парсинг напрямую в основном чате. Делегируй их субагентам через `invoke_subagent`.
- **Сессионный потолок 30–35 шагов**: при приближении к 30 шагам зафиксируй прогресс в `ACTIVE_STATE.md` и рекомендуй `/handoff`.
- **НЕ читай `dictionary_ru.json` целиком** (он весит 70+ КБ).
- Для добавления переводов используй `npm run merge` через временный `translations_to_merge.json`.
- Для проверки DOM окна Antigravity используй `npm run doctor:cdp` или `node bin/cdp_doctor.js --eval "..."`.
