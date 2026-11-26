# Ведомость разбора (AAR): Сбой авто-перезапуска Компаньона после перезагрузки Windows

- **Дата**: 2026-11-26
- **Режим**: Режим 2 (мета — ошибку нашёл пользователь)
- **Симптом**: После перезагрузки Windows пользователь запустил Antigravity, и Компаньон не подключился к окну.

## Ход разбора (шаги 1–8)

1. **Шаг 1 (Было ли уже)**:
   - В `C:\Users\voron\.gemini\antigravity\aar-log.md` по проекту `antigravity-companion` и направлению `H` уже есть 3 записи (`2026-11-18` ×2, `2026-11-20` ×1), включая способ `у детектора не проверен второй конец` и `доказательство подменено правдоподобием`.
   - По способу `механика берётся по имени` уже есть 4+ записи в других проектах (`2026-11-01`, `2026-11-04`, `2026-11-06`, `2026-11-11`).
2. **Шаг 2 (Факты)**:
   - **Что сдано**: в коммите `82fc89c` удалена подмена `Antigravity.exe` и заявлено, что если IDE запустится без `--remote-debugging-port=0`, `selfHealUnshimmedHost()` в [bin/antigravity_companion.js](file:///c:/Antigravity%20projects/antigravity-companion/bin/antigravity_companion.js) автоматически перезапустит её через `clean_restart.ps1`.
   - **Что оказалось на деле**: сам сервис Компаньона (`PID 26396`) запустился при старте Windows (`13:29:02`), удалил шим (`11:29:04Z`) и в `11:55:33Z` (`13:55:33`) действительно вызвал `selfHealUnshimmedHost()`, но процесс `Antigravity.exe` (`PID 18944`, стартовавший в `13:55:21` из `explorer.exe` без `--remote-debugging-port=0`) **не был перезапущен**, и `DevToolsActivePort` остался `MISSING`.
   - **Где именно**: [bin/antigravity_companion.js](file:///c:/Antigravity%20projects/antigravity-companion/bin/antigravity_companion.js) (`ensureAutostart`, `ensureAntigravityShortcuts`, `selfHealUnshimmedHost`), где `spawn('powershell.exe', ..., { detached: true, stdio: 'ignore', windowsHide: true })` на Windows молча завершался с кодом `0`, не выполняя `.ps1`-скрипт (подтверждено контрольным прогоном из headless WMI: `DETACHED EXIT=0` без создания файла vs `ATTACHED EXIT=0` с выполнением скрипта).
3. **Шаг 3 (Чего не хватило)**:
   - Организационная категория: **Вида проверки нет** (и **Проверка не обязана запускаться** для реального исполнения дочерних `powershell.exe` из фонового Node). `test/supervisor_lifecycle.test.js` проверял только `vm.Script`, `includes('selfHealUnshimmedHost()')` и AST `.ps1`-файлов, но ни разу не проверял, что `spawn('powershell.exe', ...)` из Node реально исполняет скрипт на Windows.
   - Уверенность без основания: в прошлом ответе было заявлено, что авто-перезапуск сработает после удаления шима, на основании чтения кода, а не прогона реального вызова `powershell.exe` в headless-режиме.
4. **Шаг 4 (Класс или единичный случай)**:
   - **Класс**: любой консольный бинарник Windows (`powershell.exe`, `cmd.exe`), запускаемый из Node.js с `detached: true` + `windowsHide: true` (или `stdio: 'ignore'`), может молча завершиться с кодом `0` без выполнения полезной работы и без ошибки. Та же ошибка сразу нашлась в трёх функциях [bin/antigravity_companion.js](file:///c:/Antigravity%20projects/antigravity-companion/bin/antigravity_companion.js): `ensureAutostart`, `ensureAntigravityShortcuts` и `selfHealUnshimmedHost`.
5. **Шаг 5 (Способ работы)**:
   - Допущение: *механика чужого системного вызова (`spawn(..., { detached: true, windowsHide: true })`) берётся по его названию без пробного вызова в целевом окружении*, а доказательство работоспособности подменяется чтением кода.
   - Повтор в журнале: `2026-11-01 | Harmonious-Thinker-Media` (строка 29), `2026-11-04 | antigravity-skill-manager` (строка 58), `2026-11-06 | antigravity-companion` (строка 70), `2026-11-11 | Harmonious-Thinker-Media` (строка 94).
6. **Шаг 6 (Направление проверки)**:
   - Направление `H` (`Запуск и аргументы хоста Antigravity`) в [checks-map.md](file:///c:/Antigravity%20projects/antigravity-companion/.claude/aar/checks-map.md) существует и требовало запуска при правке лаунчеров, но содержало только статические инварианты и AST PowerShell (плюс устаревшее упоминание шима), не проверяя реальный запуск дочернего `powershell.exe` из Node. Плюс в `H` уже 3 записи в журнале — системная слабость направления (статические проверки вместо проверки живого запуска).
7. **Шаг 7 (Ступень исправлений)**:
   - **Ступень 1 (Автоматика)** + **обновление направления `H` в карте проверок**:
     1. В [bin/antigravity_companion.js](file:///c:/Antigravity%20projects/antigravity-companion/bin/antigravity_companion.js) вынесен единый хелпер `runPowerShellScript(scriptPath, label)` с `detached: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true` и логированием ошибок в `companion.log`.
     2. В [test/supervisor_lifecycle.test.js](file:///c:/Antigravity%20projects/antigravity-companion/test/supervisor_lifecycle.test.js) добавлены: (а) статический запрет на `spawn('powershell.exe', ... detached: true)` в `antigravity_companion.js`; (б) живой тест `testWindowsPowerShellSpawnExecution()`, который на Windows реально исполняет временный `.ps1` через `powershell.exe` с `windowsHide: true` и проверяет побочный эффект (создание файла).
     3. В [.claude/aar/checks-map.md](file:///c:/Antigravity%20projects/antigravity-companion/.claude/aar/checks-map.md) актуализировано направление `H`.
8. **Шаг 8 (Журнал)**:
   - Записана строка в `C:\Users\voron\.gemini\antigravity\aar-log.md`.
