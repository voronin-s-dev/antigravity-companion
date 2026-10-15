# Active State: Antigravity Companion

> **Единый компактный срез состояния проекта**: Агент читает только этот файл для быстрого входа в контекст без лишнего сканирования репозитория. Полная история прошлых вех (1–36) вынесена в холодный архив [docs/MILESTONES_HISTORY.md](file:///c:/Antigravity%20projects/antigravity-companion/docs/MILESTONES_HISTORY.md).

---

## 1. Метаданные репозитория
- **Версия**: `v1.6.1`
- **Ветка**: `main`
- **GitHub**: [https://github.com/voronin-s-dev/antigravity-companion](https://github.com/voronin-s-dev/antigravity-companion)
- **CI/CD**: `.github/workflows/release.yml` (автотесты + автосборка ZIP при тегах `v*`)
- **Архитектурный устав**: [AGENTS.md](file:///c:/Antigravity%20projects/antigravity-companion/AGENTS.md) (Оркестратор, субагенты, квоты)

---

## 2. Архитектурный базис
- **Словарь**: `localization/dictionary_ru.json` — **6022 точных термина**, **155 атрибутов**, **283 шаблона** (всего 6460 правил).
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

### Веха 47: Двусторонняя Zero-Loss синхронизация очереди, LIFO-приоритет и локализация мастера Автоматизаций
- **Трёхуровневая защита от потери захваченных строк при выключении ПК (`companion_server.js` + `updater.js`)**:
  1. Мгновенная синхронная запись (`fs.writeFileSync`) на диск в момент появления текста на экране (0 мс потерь).
  2. Реактивный дебаунс-таймер (25 сек): автоматическая очистка и отправка (`git push`) обновлённой очереди в GitHub сразу после открытия новых окон.
  3. Бесконфликтное слияние при старте ПК (через 10 сек после загрузки): `mergeDictionaries` и union-merge очереди объединяют ночные переводы из облака и локальные несинхронизированные строки без единого конфликта или перезаписи.
- **Приоритет LIFO в `auto_translate.js` и `companion_server.js`**: реально открытые на экране пользователя строки перемещаются в конец очереди и переводятся облачным ИИ в самую первую очередь (`queue.slice(-max).reverse()`).
- **Локализация мастера Автоматизаций и тостов**: добавлены 12 терминов и 4 regex-шаблона (`Set up ...`, `Review permissions for ...`, `Enabled "..."`, `Disabled "..."`).
### Веха 48: Снятие лимита длины фраз в коллекторах и перевод описаний разрешений автоматизаций
- **Снятие ограничения длины UI-строк (с 80–85 до 2000 символов)**:
  - В [`localization/sanitize_queue.js`](file:///c:/Antigravity%20projects/antigravity-companion/localization/sanitize_queue.js), [`localization/translation_engine.js`](file:///c:/Antigravity%20projects/antigravity-companion/localization/translation_engine.js) и [`localization/bundle_harvester.js`](file:///c:/Antigravity%20projects/antigravity-companion/localization/bundle_harvester.js) снят жёсткий лимит 80–120 символов, отсекавший длинные системные описания и тултипы. Порог поднят до 2000 символов с сохранением защиты от дампа кода/бинарников.
- **Локализация прав проектов автоматизаций**:
  - Добавлены 3 точных перевода для фраз управления проектами агентов (`Agents created by this automation run in a dedicated project with its own permissions...`).
  - Очищены обрезанные фрагменты с многоточием из очереди.
- **Массовый автоперевод очереди**: через Gemini Flash API переведено и добавлено 1532 термина (словарная база расширена до 5323 терминов и 5761 правила).
- **Тесты и хот-релоад**: `npm test` (4/4) пройден, хот-релоад успешно применён в активное окно Antigravity.

### Веха 49: Инцидент GitGuardian и эшелонированная защита Zero-Leak Defense-in-Depth
- **Удаление утёкшего секрета**:
  - Токен Telegram-бота (`8950259669:...`), попавший в словарь из сайдбара соседней беседы, полностью вычищен из `localization/dictionary_ru.json` и бэкапов. Пользователь отозвал токен через BotFather.
- **Архитектура 4-уровневой защиты от утечек секретов (Defense-in-Depth)**:
  1. *Карантин источников (DOM Scraper Isolation)*: в `strings_harvester.js` и `translation_engine.js` намертво заблокировано сканирование любых диалогов, сессий, тредов, инпутов, промптов и терминалов.
  2. *Централизованный модуль `localization/secret_guard.js`*: блокирует токены Telegram, Google API, OpenAI, Anthropic, GitHub PAT, AWS, Slack, Stripe, Discord, JWT, SSH/RSA приватные ключи и hex-секреты.
  3. *Входной и выходной контроль пайплайнов*: `sanitize_queue.js`, `merge_translations.js`, `updater.js` и `auto_translate.js` валидируют структуры и немедленно сбрасывают подозрительные строки.
  4. *Аппаратный Git-барьер (Pre-Commit & Pre-Push Hooks)*: скрипты `bin/pre_commit_guard.js` и `bin/install_git_hooks.js` перехватывают любые попытки коммита или пуша, физически прерывая операцию Git с кодом 1 при обнаружении секретов.
- **Тесты**: написан отдельный сьют `test/secret_guard.test.js`, включён в обязательный прогон `npm test` (5/5 сьютов успешно). Добавлена команда `npm run security:scan`.

### Веха 50: Локализация меню слэш-команд и статический харвестер навыков (Skills Harvester)
- **Причина пропуска строк (Диагностика через CDP)**:
  - Выпадающее меню автодополнения слэш-команд и навыков (`#typeahead-menu`, `typeahead-item-*`) монтируется внутри `[data-testid="conversation-view"]`.
  - Из-за маски `[data-testid*="conversation"]` функция `isPrivateContainer` в `translation_engine.js` ошибочно помечала меню как приватный контент чата и сбрасывала отправку непереведённых строк в фоновую очередь.
  - Навыки загружаются динамически из каталогов файловой системы (`~/.gemini/config/skills`, builtin, plugins), поэтому статический экстрактор React-бандла (`bundle_harvester.js`) их не видел.
- **Устранение ложных блокировок в runtime-коллекторе и DOM-скрейпере**:
  - В `localization/translation_engine.js` добавлен приоритетный пропуск: `#typeahead-menu`, `[id^="typeahead-item"]`, `[data-testid^="menu-option-"]`, `[role="listbox"]`, `[role="option"]`.
  - Уточнена маска бесед (вместо оверселектора `[data-testid*="conversation"]` используются точечные `[data-testid="conversation-row-sidebar"]`, `[data-testid*="conversation-title"]`, `[data-testid*="conversation-item"]`), предотвращая блокировку родительского `conversation-view`.
  - В `sanitize_queue.js` и `reportUntranslatedString` расширен regex-вайтлист символов для поддержки markdown-выделений в описаниях навыков (обратные кавычки `` ` `` и квадратные скобки `[]`).
- **Статический экстрактор навыков `localization/skills_harvester.js`**:
  - Разработан модуль `skills_harvester.js`, сканирующий все каталоги навыков (`~/.gemini/config/skills`, `~/.gemini/antigravity/builtin/skills`, `~/.gemini/config/plugins/*/skills`, `<workspace>/.agents/skills`).
  - Парсит YAML frontmatter файлов `SKILL.md`, разворачивает scalar-модификаторы (`>- `, `> `) и автоматически пополняет `untranslated_queue.json`.
  - Добавлена команда `npm run harvest:skills`, интегрирована в общий пайплайн `npm run harvest`.
- **Перевод всех навыков и хот-релоад**:
  - Добавлены переводы для всех выявленных навыков (`browser-testing-with-devtools`, `changelog-automation`, `design-taste-frontend-v1`, `find-skills`, `i18n`, `memory-leak-debugging`, `adhd`).
  - Словарь расширен до 5330 точных терминов (всего 5768 правил). Хот-релоад применен в открытом окне Antigravity.
- **Тесты**: расширен сьют `test/queue_sync_integrity.test.js` с проверкой парсинга YAML frontmatter и markdown-символов (5/5 сьютов успешно).
### Веха 51: Полноценное OTA-обновление приложения (Standalone ZIP App Updater, синхронизация версий и UI)
- **Проблема**: Кнопка «Обновления» в v1.3 обновляла только словарь `dictionary_ru.json`. Пользователи со standalone ZIP-установкой видели неизменную версию `v1.3` из-за отсутствия обновления кода приложения.
- **Двухуровневый OTA-апдейтер `bin/updater.js` & `bin/companion_server.js`**:
  - Реализовано определение semver (`isNewerVersion`) при проверке `package.json` на GitHub (`hasAppUpdate`).
  - Добавлена функция `applyAppUpdate()`: автоматическое скачивание официального ZIP-релиза или архива ветки `main`, распаковка через PowerShell `Expand-Archive`, безопасное замещение файлов приложения с сохранением локального `.env` и очередей, сброс кэша `require` и мгновенная ре-инъекция в окно Antigravity.
  - Добавлен эндпоинт `/api/apply-app-update` и авто-определение в `/api/apply-update`.
- **Индикация и обратная связь в UI виджета (`limits_widget/inject_panel.js`)**:
  - Добавлен динамический бейдж версии `#agy-settings-version-badge`.
  - При наличии обновления приложения виджет показывает точный статус скачивания (`Загрузка v1.6.0...`), обновляет бейдж на лету (`✓ Обновлено до v1.6.0! Перезапустите UI`) и четко отделяет обновление словаря от обновления программы.
- **Скрипты прямого обновления**:
  - Созданы `update.bat` и `update.ps1` для обновления Компаньона в один клик.
  - В `update_dictionary.ps1` добавлена опция `[5] Обновить Antigravity Companion целиком`.
- **Тесты и релизная сборка**:
  - Написан тест `test/updater.test.js`, включен в общий запуск `npm test` (6/6 сьютов успешно).
  - Скрипты `update.bat` и `update.ps1` добавлены в `bin/build_release.js` и `.github/workflows/release.yml`.
### Веха 52: Устранение дефекта контекстного меню на странице диалога (Context Menu False-Capture Fix)
- **Причина дефекта (Анализ по скриншоту и CDP-инспекция React Fiber)**:
  - При правом клике мыши в области диалога перехватчик `__agyContextMenuHandler` в `localization/translation_engine.js` поднимался по дереву React Fiber в поисках свойства `items`.
  - В контейнере диалога он натыкался на компонент `H6a`, содержащий реестр из 74 слэш-команд Antigravity (`WorkflowSpec: btw, task...`).
  - Из-за отсутствия проверки наличия `label` скрипт ошибочно принимал слэш-команды за пункты контекстного меню и вызывал `window.electronNative.showContextMenu` с 74 пустыми строками без текста.
  - В результате Windows/Electron рендерил черную полосу шириной 15px во всю высоту экрана со стрелками прокрутки `▲` и `▼`.
- **Исправление в `localization/translation_engine.js`**:
  - Внедрена строгая валидация элементов меню (`typeof item.label === 'string' && item.label.trim().length > 0` либо `type === 'separator'`). Списки без текстовых меток игнорируются.
  - Добавлена проверка активности пунктов (`hasActiveItem`). Если все элементы меню неактивны (например, disabled пункт `Copy` при клике на пустое место без выделенного текста), событие не перехватывается (`preventDefault` не вызывается).
  - В `buildNativeMenuTemplate` добавлена очистка невалидных пунктов.
- **Тесты и хот-релоад**: все 6 сьютов тестов пройдены, хот-релоад применен в открытом окне Antigravity, дефект полностью устранен.

---

### Веха 53: Устранение бага с «symbolNode» и числовыми ключами словаря (Chat Isolation & Numeric Artifact Fix)
- **Причина дефекта**:
  - В автопереводчике `auto_translate.js` при ответе от Gemini API массивом вместо объекта числовые индексы (`0`..`299`) ошибочно попали в секцию `exact` словаря. В частности, индекс `25` получил перевод технической ошибки KaTeX: `"25": "Ожидался symbolNode, но получено"`, а индекс `10`: `"10": "Действия с ветками"`.
  - В интерфейсе Antigravity параграфы ответов агента анимируются через компонент `ymb` пословным разбиением (`xmb` / `WordSpan`), оборачивающим каждое слово и число в отдельный `span` / текстовый узел.
  - Движок локализации `translation_engine.js` содержал устаревший селектор `.prose`, отсутствующий в DOM Antigravity, из-за чего обходил текст сообщений. Любые числа `25` и `10` в тексте ответов агента (например: *«ещё с 25 сентября, через 10 дней»*) на лету заменялись в DOM на *«Ожидался symbolNode, но получено»* и *«Действия с ветками»*.
- **Исправление**:
  - Из `dictionary_ru.json` вычищены все 300 мусорных числовых ключей `0`..`299`.
  - В `test/dictionary_integrity.test.js` добавлен строгий валидатор, исключающий появление числовых ключей в словаре.
  - В `auto_translate.js` и `merge_translations.js` добавлена корректная обработка массивов и фильтрация числовых ключей.
  - В `translation_engine.js` добавлен запрет на перевод чисто числовых токенов (`/^\d+$/`) и в `EXCLUDED_SELECTORS` добавлены реальные селекторы чата (`[data-testid="user-input-step"]`, `.leading-relaxed.select-text.break-words`, `.animate-markdown`, `.markdown-alert`).
- **Тесты и хот-релоад**: все 6 сьютов тестов пройдены успешно (5768 правил), хот-релоад применен на лету.

### Веха 54: Локализация контекстного меню по пустому месту и подбор навыков академического английского
- **Причина дефекта непереведённого пункта «Copy»**:
  - В Вехе 52 было введено условие `hasActiveItem`, которое отменяло перехват (`return`), если все элементы контекстного меню неактивны.
  - При клике ПКМ по пустому месту в окне чата текст не выделен, поэтому компонент React `qD` генерирует пункт `{ id: "copy", label: "Copy", enabled: false }`.
  - Из-за `enabled: false` условие `hasActiveItem` возвращало `false`, перехватчик отключался, и Antigravity отображал нативное меню с исходной строкой `Copy`.
- **Исправление**:
  - Условие `hasActiveItem` заменено на `hasRealItems` в [`localization/translation_engine.js`](file:///c:/Antigravity%20projects/antigravity-companion/localization/translation_engine.js): меню перехватывается всегда, когда содержит реальные пункты со строковыми метками `label`, независимо от их `disabled`/`enabled` статуса.
  - Пункт `Copy` переводится в `Копировать` с сохранением неактивного состояния.
  - В [`bin/updater.js`](file:///c:/Antigravity%20projects/antigravity-companion/bin/updater.js) добавлена фильтрация числовых ключей `/^\d+$/` в `mergeDictionaries`, исключающая их случайное восстановление из удалённого репозитория.
  - Вычищены 300 мусорных числовых ключей из [`localization/dictionary_ru.json`](file:///c:/Antigravity%20projects/antigravity-companion/localization/dictionary_ru.json).
- **Подбор навыков через `/find-skills`**:
  - Отобран золотой стандарт академического английского: `yuan1z0825/nature-skills@nature-polishing` (16.4K установок, 48K звёзд).
- **Тесты и хот-релоад**: все 6 сьютов тестов пройдены успешно, хот-релоад применен в активном окне Antigravity.

---

### Веха 55: Интеграция стандарта Nature-Polishing для существующих и будущих переводов
- **Внедрение стандарта в будущие переводы (`localization/auto_translate.js`)**:
  - В системный промпт модуля автоперевода внедрён исчерпывающий свод академических правил Nature-Polishing:
    1. *Anti-Calque*: категорический запрет на дословный машинный подстрочник и неестественные буквализмы.
    2. *Contextual Grammar*: инфинитив для кнопок, причастия прошедшего времени для статусов завершения, отглагольные существительные для процессов.
    3. *Terminological Rigor*: сохранение устоявшихся брендов и сущностей IDE (Google Antigravity, MCP, DevTools, Gemini) и профессиональных терминов (ветка, коммит, артефакт, субагент, промпт).
    4. *Capitalization & Punctuation*: Sentence case в русских заголовках и меню вместо Title Case, строгое сохранение плейсхолдеров и форматирования.
- **Аудит и полировка существующего словаря (`localization/polish_dictionary.js`)**:
  - Разработан модуль аудита качества `polish_dictionary.js` с поддержкой эвристического анализа калек, лишних завершающих точек, двойных пробелов и Title Case.
  - Проведён аудит всех 5337 терминов: исправлены нестыковки регистра и пунктуации (включая «в настройках», «откройте параметры», настройки Tab).
  - Сгенерирован и применён пакет улучшений через `npm run merge`.
  - Повторный аудит словаря показывает 0 замечаний: **100% терминов словаря соответствуют стандартам Nature-Polishing**.
- **Новые CLI-команды в `package.json`**:
  - `npm run audit:dictionary` — проверка качества существующего словаря без изменений.
  - `npm run polish` — автоматический аудит, генерация исправлений и слияние с хот-релоадом.

---

### Веха 56: Тотальная Nature-Polishing & Microcopy калибровка словаря и аудит Компаньона с новыми скиллами
- **Лингвистическая калибровка и перепроверка словаря (`localization/polish_dictionary.js`)**:
  - Расширен модуль аудита: внедрён реестр `KNOWN_CALQUES` (устранение калек вроде «шеринг» -> «совместный доступ», «инстанс» -> «экземпляр», «дефолтный» -> «по умолчанию», «секций» -> «разделов», «бег процессов» -> «выполнение процессов», тавтологий «документов Документов» и «таблицами Google Таблиц»).
  - Внедрена проверка `IMPERATIVE_ACTION_RULES` по скиллу Microcopy: строгий инфинитив для кнопок действий («Копировать», «Перезагрузить», «Сохранить»).
  - Перепроверены все 6024 термина: устранены 11 дефектов, текущий аудит показывает 0 замечаний (100% чистота).
- **Очистка очереди и перевод свежих строк**:
  - 23 строки из `untranslated_queue.json` (новые скиллы, копирайтинг, аудит) переведены по стандарту Nature-Polishing и слиты в словарь.
  - База расширена до 6024 точных терминов (6462 правила), очередь очищена до 0.
- **Стандартизация будущих переводов (`localization/auto_translate.js`)**:
  - В системный промпт модуля автоперевода навсегда зафиксирован строгий кодекс Nature-Polishing + Microcopy + Anti-Slop (с официальной терминологической матрицей, запретом на жаргонизмы и сохранением системных сущностей IDE).
- **Реализованные архитектурные улучшения**:
  - `memory-leak-debugging` ([`localization/translation_engine.js`](file:///c:/Antigravity%20projects/antigravity-companion/localization/translation_engine.js)): внедрён `window.__agyTranslatorCleanup()`, именованные глобальные обработчики (`__agyLangChangeHandler`, `__agyPointerEnterHandler`, `__agyMouseOverHandler`, `__agyContextMenuHandler`), очистка `requestAnimationFrame` и сброс `scheduledNodes` при горячей перезагрузке.
  - `token-budget-guard` ([`limits_widget/inject_panel.js`](file:///c:/Antigravity%20projects/antigravity-companion/limits_widget/inject_panel.js)): шкала счётчика сессий синхронизирована с `AGENTS.md` (35 шагов вместо 40, предупреждение на 22 шагах, критический пульсирующий бейдж на 30 шагах).
  - `microcopy` ([`limits_widget/inject_panel.js`](file:///c:/Antigravity%20projects/antigravity-companion/limits_widget/inject_panel.js)): заголовки секций переведены из кричащего ALL CAPS в естественный Sentence case («Оттенок и цвет», «Режим отображения», «Элементы в миниатюре», «Звуковые сигналы сброса», «Интервал обновления»).
  - `a11y-debugging` ([`limits_widget/inject_panel.js`](file:///c:/Antigravity%20projects/antigravity-companion/limits_widget/inject_panel.js)): добавлены атрибуты доступности (`role="dialog"`, `aria-modal="true"`, `aria-label`), бейджи лимитов получили `role="button"`, `tabindex="0"` и поддержку активации с клавиатуры (`Enter` / `Space`).
---

### Веха 57: Изоляция пользовательских проектов и устранение ошибочного перевода «Threads -> ветки»
- **Диагностика и расследование инцидента**:
  - Пользователь сообщил, что проект с названием `Threads` отображался как `ветки`.
  - При анализе кодовой базы выявлены две взаимосвязанные проблемы:
    1. *Словарная ошибка*: ранее из-за неконтролируемого сбора строк и автоперевода в словарь попало одиночное правило `"threads": "ветки"` (модель перепутала discussion threads / execution threads с git branches).
    2. *Отсутствие селекторной изоляции проектов в DOM*: в `EXCLUDED_SELECTORS` движка `translation_engine.js` отсутствовали селекторы заголовков проектов (`[data-testid="project-header"]`, `[data-project-card]`, `[data-project-label]`) и дерева файлов. Движок обходил сайдбар и переводил любые проекты, чьи названия совпадали с терминами словаря (`Threads` -> `ветки`, `social` -> `социальные сети`, `Analyzing` -> `Анализ`).
- **Устранение дефекта**:
  - Из `localization/dictionary_ru.json` вычищены мусорные одиночные ключи `"threads": "ветки"` и `"social": "социальные сети"`.
  - В `EXCLUDED_SELECTORS` и `isPrivateContainer` в `localization/translation_engine.js` внедрена исчерпывающая изоляция проектов и файлового дерева:
    `[data-testid="project-header"]`, `[data-project-card]`, `[data-project-label]`, `[data-testid*="project-name"]`, `[data-testid*="project-title"]`, `[data-testid*="workspace-name"]`, `[data-testid*="workspace-title"]`, `[data-testid*="file-tree"]`, `[data-testid*="file-node"]`, `[data-testid*="explorer-item"]`, `[data-testid*="tab-label"]`, `.monaco-list-row`.
  - Реализован механизм самовосстановления `restoreProjectHeaders()`: восстанавливает оригинальные названия проектов по атрибуту `data-project-label` или кэшу `__agy_orig` при инициализации и смене языка.
- **Тесты и верификация через CDP**:
  - В `test/syntax_injection.test.js` и общий сьют `npm test` добавлен юнит-тест `testProjectIsolationGuard()`. Все 6 сьютов пройдены успешно (6460 правил).
  - Через CDP подтверждено: в реальном окне Antigravity проект `social` и `Analyzing` мгновенно вернулись к исходным именам, а проект `Threads` гарантированно защищён от перевода.

---

## 4. Следующие шаги и бэклог
1. Собрать обратную связь пользователя по исправлению названий проектов.
2. Поддержание актуальности словаря при обновлениях Antigravity через команду `npm run harvest`.

---

## 5. Памятка агенту (Правила Токен-Экономики)
- **Роль Оркестратора**: не выполняй тяжелые поиски, длинные тесты и парсинг напрямую в основном чате. Делегируй их субагентам через `invoke_subagent`.
- **Сессионный потолок 30–35 шагов**: при приближении к 30 шагам зафиксируй прогресс в `ACTIVE_STATE.md` и рекомендуй `/handoff`.
- **НЕ читай `dictionary_ru.json` целиком** (он весит 70+ КБ).
- Для добавления переводов используй `npm run merge` через временный `translations_to_merge.json`.
- Для проверки DOM окна Antigravity используй `npm run doctor:cdp` или `node bin/cdp_doctor.js --eval "..."`.
