# Project Backup Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the automatic, silent project backup subsystem in Antigravity Companion with cloud auto-detection, Windows Task Scheduler integration, smart change detection, zero-loss retention, and a native UI tab in the Companion settings flyout.

**Architecture:** A modular backend inside `backup_manager/` (PowerShell engine for native `tar.exe` compression, VBS launcher for 0-window silent execution, Node.js modules for cloud detection and Windows Task Scheduler management) exposed via `companion_server.js` REST endpoints (port 9229) and rendered in a tabbed Settings view within `limits_widget/inject_panel.js`.

**Tech Stack:** Node.js (v18+), PowerShell 5.1/7+, Windows Script Host (`wscript.exe` / VBScript), Windows Task Scheduler, native `tar.exe`, HTML5/CSS/Vanilla JS (Web Components/Tactile UI).

**Spec:** [C:\Antigravity Scratch\task_step140.md](file:///C:/Antigravity%20Scratch/task_step140.md)

---

## Global Constraints

- **No Hardcoded User Paths:** All paths must use dynamic environment variables (`$env:USERPROFILE`, `process.env.APPDATA`, `PSScriptRoot`, etc.).
- **Zero-Flicker Execution:** Scheduled and background runs must execute with WindowStyle 0 / Hidden (no cmd/powershell flash on screen).
- **No Admin Privilege Escalation:** Must run entirely within current user context without triggering Windows UAC prompts.
- **Microcopy & Nature-Polishing Compliance:** All UI strings must follow Sentence case, infinitive button verbs ("Сделать бэкап сейчас", "Открыть папку"), and maintain dual RU/EN support.
- **Zero-Context Dictionary Rule:** No direct modifications of `localization/dictionary_ru.json` without `npm run merge`.
- **Test Integrity:** All additions must pass `test/run_all.js` (unit tests + syntax + security + dictionary integrity).

## Review Focus

1. **Cloud Drive Unmounted / Offline:** Behavior when Google Drive `G:\` or OneDrive is disconnected — must safely log warning, skip without crash, and notify UI via status JSON.
2. **Low Target Disk Space:** Behavior when target backup drive has < 1 GB free — must abort archive creation early with `DISK_SPACE_LOW` status to prevent drive exhaustion.
3. **Smart Skip Edge Cases:** Project modified time detection must ignore excluded dirs (`node_modules`, `.venv`, `.next`, `dist`) so npm install doesn't trigger unneeded archives.
4. **Zero-Loss Retention Invariant:** Projects not touched for > retentionDays must NEVER have all backups purged; at least `minBackupsToKeep` (up to 7) must remain indefinitely.
5. **Concurrent Manual & Scheduled Runs:** File lock or mutex check in `run_backup.ps1` to prevent two backup runs from overlapping and corrupting archives.

---

## Plan Structure & Decomposition

```text
antigravity-companion/
├── backup_manager/
│   ├── engine/
│   │   ├── run_backup.ps1         # Core archiving, change detection, space check & retention
│   │   └── silent_runner.vbs       # 0-window hidden launcher for Windows Task Scheduler
│   ├── cloud_detector.js          # Detection of OneDrive, Google Drive, Yandex.Disk, Dropbox
│   ├── scheduler.js               # Windows Task Scheduler registration/unregistration
│   └── backup_service.js          # IPC controller, status aggregation, manual trigger, logs
├── config/
│   └── companion_config.js        # Extended with default backup settings schema
├── bin/
│   └── companion_server.js        # Extended with /api/backup/* endpoints
├── limits_widget/
│   └── inject_panel.js            # Settings flyout tabbed navigation & backup UI panel
└── test/
    ├── backup_manager.test.js      # Unit and integration tests for engine, detector & scheduler
    └── run_all.js                 # Integration into primary test suite
```

---

### Task 1: Configuration Schema & Cloud Storage Detector

**Files:**
- Modify: `config/companion_config.js:9-67`
- Create: `backup_manager/cloud_detector.js`
- Test: `test/backup_manager.test.js`

**Interfaces:**
- Produces:
  - `loadConfig().backup`: default backup config schema
  - `cloud_detector.detectAvailableClouds()`: `Promise<Array<{ id: string, name: string, path: string, available: boolean, freeSpaceGB: number, defaultSubpath: string }>>`
  - `cloud_detector.getVolumeFreeSpaceGB(targetPath)`: `number`

- [ ] **Step 1: Write test for config schema and cloud detector**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `backup` config section in `config/companion_config.js`**
- [ ] **Step 4: Implement `cloud_detector.js` with detection for OneDrive, Google Drive, Yandex.Disk, Dropbox, and Local Fallback**
- [ ] **Step 5: Run test to verify it passes**
- [ ] **Step 6: Commit**

---

### Task 2: Core PowerShell Backup Engine & Silent Runner

**Files:**
- Create: `backup_manager/engine/run_backup.ps1`
- Create: `backup_manager/engine/silent_runner.vbs`
- Test: `test/backup_manager.test.js`

**Interfaces:**
- Consumes: Target backup path, retention days, min backups to keep from arguments
- Produces:
  - Compressed `.zip` archives created via native `tar.exe`
  - Exclusion list: `node_modules`, `.venv`, `venv`, `env`, `__pycache__`, `.next`, `.nuxt`, `dist`, `build`, `.turbo`, `.cache`, `*.tmp`, `*.log`
  - Skip files > 100 MB with log note
  - Change detection (Smart Skip) comparing project source file `LastWriteTime` against existing latest archive
  - Zero-Loss Retention (retaining up to `MinBackupsToKeep = 7` regardless of age)
  - Status JSON at `%APPDATA%\AntigravityCompanion\backup_status.json`
  - Log output to `%APPDATA%\AntigravityCompanion\backup.log` and target cloud folder

- [ ] **Step 1: Write test for backup engine execution, exclusions, smart skip, and retention**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `run_backup.ps1` with lock protection, free space checks, and status reporting**
- [ ] **Step 4: Implement `silent_runner.vbs` for 0-window execution**
- [ ] **Step 5: Run test to verify it passes**
- [ ] **Step 6: Commit**

---

### Task 3: Task Scheduler Integration & Backup Controller Service

**Files:**
- Create: `backup_manager/scheduler.js`
- Create: `backup_manager/backup_service.js`
- Test: `test/backup_manager.test.js`

**Interfaces:**
- Produces:
  - `scheduler.registerDailyTask(timeStr)`: registers `AntigravityCompanionBackup` in Windows Task Scheduler
  - `scheduler.unregisterDailyTask()`: removes task from scheduler
  - `scheduler.getTaskStatus()`: `{ exists: boolean, nextRunTime: string, state: string }`
  - `backup_service.getStatus()`: combined config, cloud list, schedule status, last backup info, and recent log lines
  - `backup_service.runManual()`: triggers asynchronous background backup
  - `backup_service.saveSettings(settings)`: saves config and updates scheduler
  - `backup_service.openFolder(folderPath)`: launches Windows Explorer
  - `backup_service.openLog()`: opens log file or returns contents

- [ ] **Step 1: Write test for scheduler and backup service interfaces**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `scheduler.js` using PowerShell ScheduledTasks cmdlets**
- [ ] **Step 4: Implement `backup_service.js` integrating detector, config, scheduler, and status logging**
- [ ] **Step 5: Run test to verify it passes**
- [ ] **Step 6: Commit**

---

### Task 4: Server API Endpoints in Companion Server

**Files:**
- Modify: `bin/companion_server.js:80-250`
- Test: `test/backup_manager.test.js`

**Interfaces:**
- Produces REST endpoints on port 9229:
  - `GET /api/backup/detect`
  - `GET /api/backup/status`
  - `POST /api/backup/save`
  - `POST /api/backup/run`
  - `POST /api/backup/open-folder`
  - `GET /api/backup/log`

- [ ] **Step 1: Write tests for `/api/backup/*` endpoints in test suite**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Wire up endpoints in `bin/companion_server.js` with CSRF/Origin validation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 5: Settings Flyout UI: Tabs & Backup Manager Panel

**Files:**
- Modify: `limits_widget/inject_panel.js`
- Test: `test/syntax_injection.test.js`

**Interfaces:**
- Produces:
  - Tabbed header in Settings flyout: `[Параметры виджета]` and `[Резервное копирование]`
  - Backup Tab View:
    - Auto-Backup Toggle (On/Off)
    - Cloud Storage Selector (dynamic radio/dropdown with icons and free space) + Custom Path selector
    - Scheduled Time selector (`22:00` default)
    - Retention period selector (7 / 14 / 30 days)
    - Zero-Loss Retention Checkbox ("Всегда хранить последние копии неактивных проектов")
    - Real-time Status Card (Last backup date/status, total projects, total archive size, next run)
    - Action Buttons: `[Сделать бэкап сейчас]`, `[Открыть папку]`, `[Посмотреть лог]`
  - Real-time polling / websocket update on manual run trigger

- [ ] **Step 1: Add syntax test verifying tab navigation and backup UI elements in `test/syntax_injection.test.js`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement tabbed layout and Backup Panel in `limits_widget/inject_panel.js`**
- [ ] **Step 4: Run syntax & injection tests to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 6: Nature-Polishing, Localization Dictionary & Suite Verification

**Files:**
- Modify: `localization/translations_to_merge.json`
- Modify: `test/run_all.js`
- Test: `npm test`

**Interfaces:**
- Produces:
  - Clean bilingual translation keys for all backup UI terms
  - `npm run merge` execution to update `localization/dictionary_ru.json`
  - 100% passing test suite across all 7 test suites

- [ ] **Step 1: Prepare `localization/translations_to_merge.json` with Microcopy/Nature-Polishing compliant terms**
- [ ] **Step 2: Run `npm run merge` to integrate dictionary terms**
- [ ] **Step 3: Add `backup_manager.test.js` as Suite 7 in `test/run_all.js`**
- [ ] **Step 4: Run full `npm test` and verify all suites pass**
- [ ] **Step 5: Test CDP hot-reload into Antigravity IDE**
- [ ] **Step 6: Update `ACTIVE_STATE.md` with Milestone 61 documentation and commit**
