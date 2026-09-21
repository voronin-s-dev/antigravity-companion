# Antigravity Companion: Native Dark Settings Window
[CmdletBinding()]
param()

[System.Reflection.Assembly]::LoadWithPartialName("System.Windows.Forms") | Out-Null
[System.Reflection.Assembly]::LoadWithPartialName("System.Drawing") | Out-Null

$appData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData)
$configDir = Join-Path $appData "AntigravityCompanion"
$configFile = Join-Path $configDir "config.json"

if (!(Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

$defaultConfig = @{
    voice = @{
        hotkey = "Win+Shift+V"
        mode = "toggle"
        smartPauseSeconds = 2.0
        smartPunctuation = $true
        autoCapitalize = $true
        audioFeedback = $true
    }
    limits = @{
        showClaude = $true
        showFlash = $true
        showPro = $true
        sound5h = $true
        soundWeekly = $true
    }
}

$config = $defaultConfig
if (Test-Path $configFile) {
    try {
        $raw = Get-Content $configFile -Raw -Encoding UTF8
        $parsed = ConvertFrom-Json $raw
        if ($parsed.voice) {
            if ($parsed.voice.hotkey) { $config.voice.hotkey = $parsed.voice.hotkey }
            if ($parsed.voice.mode) { $config.voice.mode = $parsed.voice.mode }
            if ($parsed.voice.smartPauseSeconds) { $config.voice.smartPauseSeconds = [double]$parsed.voice.smartPauseSeconds }
            if ($null -ne $parsed.voice.smartPunctuation) { $config.voice.smartPunctuation = [bool]$parsed.voice.smartPunctuation }
            if ($null -ne $parsed.voice.autoCapitalize) { $config.voice.autoCapitalize = [bool]$parsed.voice.autoCapitalize }
            if ($null -ne $parsed.voice.audioFeedback) { $config.voice.audioFeedback = [bool]$parsed.voice.audioFeedback }
        }
        if ($parsed.limits) {
            if ($null -ne $parsed.limits.showClaude) { $config.limits.showClaude = [bool]$parsed.limits.showClaude }
            if ($null -ne $parsed.limits.showFlash) { $config.limits.showFlash = [bool]$parsed.limits.showFlash }
            if ($null -ne $parsed.limits.showPro) { $config.limits.showPro = [bool]$parsed.limits.showPro }
            if ($null -ne $parsed.limits.sound5h) { $config.limits.sound5h = [bool]$parsed.limits.sound5h }
            if ($null -ne $parsed.limits.soundWeekly) { $config.limits.soundWeekly = [bool]$parsed.limits.soundWeekly }
        }
    } catch {}
}

# --- Цветовая палитра Dark Fluent ---
$cBg = [System.Drawing.Color]::FromArgb(30, 30, 30)
$cSurface = [System.Drawing.Color]::FromArgb(40, 40, 40)
$cBorder = [System.Drawing.Color]::FromArgb(60, 60, 60)
$cText = [System.Drawing.Color]::FromArgb(240, 240, 240)
$cDim = [System.Drawing.Color]::FromArgb(160, 160, 160)
$cAccent = [System.Drawing.Color]::FromArgb(0, 122, 212)
$cAccentHover = [System.Drawing.Color]::FromArgb(16, 137, 230)
$cSuccess = [System.Drawing.Color]::FromArgb(46, 160, 67)

$fMain = New-Object System.Drawing.Font("Segoe UI", 9.5)
$fBold = New-Object System.Drawing.Font("Segoe UI", 9.5, [System.Drawing.FontStyle]::Bold)
$fTitle = New-Object System.Drawing.Font("Segoe UI", 12.0, [System.Drawing.FontStyle]::Bold)

$form = New-Object System.Windows.Forms.Form
$form.Text = "Antigravity Companion — Настройки"
$form.Size = New-Object System.Drawing.Size(530, 500)
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedDialog
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.BackColor = $cBg
$form.ForeColor = $cText
$form.Font = $fMain

# Верхний заголовок
$lblHeader = New-Object System.Windows.Forms.Label
$lblHeader.Text = "Настройки Antigravity Companion"
$lblHeader.Font = $fTitle
$lblHeader.ForeColor = $cText
$lblHeader.Location = New-Object System.Drawing.Point(20, 14)
$lblHeader.Size = New-Object System.Drawing.Size(480, 28)
$form.Controls.Add($lblHeader)

# Таб-контрол
$tabs = New-Object System.Windows.Forms.TabControl
$tabs.Location = New-Object System.Drawing.Point(15, 50)
$tabs.Size = New-Object System.Drawing.Size(485, 360)
$tabs.Font = $fMain

# --- Вкладка 1: Голосовой ввод ---
$tabVoice = New-Object System.Windows.Forms.TabPage
$tabVoice.Text = "Голосовой ввод"
$tabVoice.BackColor = $cSurface
$tabVoice.ForeColor = $cText

# 1. Горячая клавиша
$lblHotkey = New-Object System.Windows.Forms.Label
$lblHotkey.Text = "Глобальная горячая клавиша (хоткей):"
$lblHotkey.Location = New-Object System.Drawing.Point(15, 15)
$lblHotkey.Size = New-Object System.Drawing.Size(260, 20)
$lblHotkey.ForeColor = $cText
$tabVoice.Controls.Add($lblHotkey)

$cmbHotkey = New-Object System.Windows.Forms.ComboBox
$cmbHotkey.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
$cmbHotkey.Location = New-Object System.Drawing.Point(280, 12)
$cmbHotkey.Size = New-Object System.Drawing.Size(175, 25)
$cmbHotkey.BackColor = $cBg
$cmbHotkey.ForeColor = $cText
$null = $cmbHotkey.Items.Add("Win+Shift+V")
$null = $cmbHotkey.Items.Add("Ctrl+Alt+V")
$null = $cmbHotkey.Items.Add("Ctrl+Shift+Space")
$null = $cmbHotkey.Items.Add("F8")
$null = $cmbHotkey.Items.Add("F9")
$cmbHotkey.SelectedItem = if ($cmbHotkey.Items.Contains($config.voice.hotkey)) { $config.voice.hotkey } else { "Win+Shift+V" }
$tabVoice.Controls.Add($cmbHotkey)

# 2. Режим управления записью
$grpMode = New-Object System.Windows.Forms.GroupBox
$grpMode.Text = "Режим управления записью"
$grpMode.Location = New-Object System.Drawing.Point(15, 45)
$grpMode.Size = New-Object System.Drawing.Size(445, 110)
$grpMode.ForeColor = $cDim
$grpMode.Font = $fMain

$rbToggle = New-Object System.Windows.Forms.RadioButton
$rbToggle.Text = "Переключатель: Нажал старт — надиктовал — нажал стоп"
$rbToggle.Location = New-Object System.Drawing.Point(15, 22)
$rbToggle.Size = New-Object System.Drawing.Size(415, 22)
$rbToggle.ForeColor = $cText
$rbToggle.Checked = ($config.voice.mode -eq "toggle")
$grpMode.Controls.Add($rbToggle)

$rbPush = New-Object System.Windows.Forms.RadioButton
$rbPush.Text = "Удержание (Push-to-Talk): Говорить, пока зажата клавиша/мышь"
$rbPush.Location = New-Object System.Drawing.Point(15, 47)
$rbPush.Size = New-Object System.Drawing.Size(415, 22)
$rbPush.ForeColor = $cText
$rbPush.Checked = ($config.voice.mode -eq "push_to_talk")
$grpMode.Controls.Add($rbPush)

$rbPause = New-Object System.Windows.Forms.RadioButton
$rbPause.Text = "Умная пауза: Авто-остановка при тишине (сек):"
$rbPause.Location = New-Object System.Drawing.Point(15, 72)
$rbPause.Size = New-Object System.Drawing.Size(305, 22)
$rbPause.ForeColor = $cText
$rbPause.Checked = ($config.voice.mode -eq "smart_pause")
$grpMode.Controls.Add($rbPause)

$cmbPause = New-Object System.Windows.Forms.ComboBox
$cmbPause.DropDownStyle = [System.Windows.Forms.ComboBoxStyle]::DropDownList
$cmbPause.Location = New-Object System.Drawing.Point(325, 71)
$cmbPause.Size = New-Object System.Drawing.Size(100, 24)
$cmbPause.BackColor = $cBg
$cmbPause.ForeColor = $cText
$null = $cmbPause.Items.Add("1.5")
$null = $cmbPause.Items.Add("2.0")
$null = $cmbPause.Items.Add("2.5")
$null = $cmbPause.Items.Add("3.0")
$pauseStr = [string]$config.voice.smartPauseSeconds
$cmbPause.SelectedItem = if ($cmbPause.Items.Contains($pauseStr)) { $pauseStr } else { "2.0" }
$grpMode.Controls.Add($cmbPause)

$tabVoice.Controls.Add($grpMode)

# 3. Обработка текста
$grpText = New-Object System.Windows.Forms.GroupBox
$grpText.Text = "Обработка текста и пунктуация"
$grpText.Location = New-Object System.Drawing.Point(15, 165)
$grpText.Size = New-Object System.Drawing.Size(445, 90)
$grpText.ForeColor = $cDim
$grpText.Font = $fMain

$chkPunct = New-Object System.Windows.Forms.CheckBox
$chkPunct.Text = "Умная пунктуация («точка», «запятая», «новая строка» -> знаки)"
$chkPunct.Location = New-Object System.Drawing.Point(15, 22)
$chkPunct.Size = New-Object System.Drawing.Size(415, 24)
$chkPunct.ForeColor = $cText
$chkPunct.Checked = [bool]$config.voice.smartPunctuation
$grpText.Controls.Add($chkPunct)

$chkCap = New-Object System.Windows.Forms.CheckBox
$chkCap.Text = "Автоматическая заглавная буква в начале предложений"
$chkCap.Location = New-Object System.Drawing.Point(15, 52)
$chkCap.Size = New-Object System.Drawing.Size(415, 24)
$chkCap.ForeColor = $cText
$chkCap.Checked = [bool]$config.voice.autoCapitalize
$grpText.Controls.Add($chkCap)

$tabVoice.Controls.Add($grpText)

# 4. Обратная связь
$chkAudio = New-Object System.Windows.Forms.CheckBox
$chkAudio.Text = "Звуковые сигналы (старт записи, стоп, успешная вставка)"
$chkAudio.Location = New-Object System.Drawing.Point(20, 270)
$chkAudio.Size = New-Object System.Drawing.Size(430, 24)
$chkAudio.ForeColor = $cText
$chkAudio.Checked = [bool]$config.voice.audioFeedback
$tabVoice.Controls.Add($chkAudio)

$tabs.TabPages.Add($tabVoice)

# --- Вкладка 2: Лимиты моделей ---
$tabLimits = New-Object System.Windows.Forms.TabPage
$tabLimits.Text = "Лимиты и виджет"
$tabLimits.BackColor = $cSurface
$tabLimits.ForeColor = $cText

$lblLimitsDesc = New-Object System.Windows.Forms.Label
$lblLimitsDesc.Text = "Настройка отображения моделей в компактном виджете Antigravity:"
$lblLimitsDesc.Location = New-Object System.Drawing.Point(15, 15)
$lblLimitsDesc.Size = New-Object System.Drawing.Size(450, 24)
$lblLimitsDesc.ForeColor = $cDim
$tabLimits.Controls.Add($lblLimitsDesc)

$chkClaude = New-Object System.Windows.Forms.CheckBox
$chkClaude.Text = "Показывать квоты Claude (Sonnet 3.7 / 3.5)"
$chkClaude.Location = New-Object System.Drawing.Point(25, 50)
$chkClaude.Size = New-Object System.Drawing.Size(350, 24)
$chkClaude.ForeColor = $cText
$chkClaude.Checked = [bool]$config.limits.showClaude
$tabLimits.Controls.Add($chkClaude)

$chkFlash = New-Object System.Windows.Forms.CheckBox
$chkFlash.Text = "Показывать квоты Gemini Flash (2.5 / 2.0)"
$chkFlash.Location = New-Object System.Drawing.Point(25, 85)
$chkFlash.Size = New-Object System.Drawing.Size(350, 24)
$chkFlash.ForeColor = $cText
$chkFlash.Checked = [bool]$config.limits.showFlash
$tabLimits.Controls.Add($chkFlash)

$chkPro = New-Object System.Windows.Forms.CheckBox
$chkPro.Text = "Показывать квоты Gemini Pro (2.5 / 1.5)"
$chkPro.Location = New-Object System.Drawing.Point(25, 120)
$chkPro.Size = New-Object System.Drawing.Size(350, 24)
$chkPro.ForeColor = $cText
$chkPro.Checked = [bool]$config.limits.showPro
$tabLimits.Controls.Add($chkPro)

$tabs.TabPages.Add($tabLimits)

# --- Вкладка 3: Звуки и уведомления ---
$tabSounds = New-Object System.Windows.Forms.TabPage
$tabSounds.Text = "Звуки сброса"
$tabSounds.BackColor = $cSurface
$tabSounds.ForeColor = $cText

$lblSoundsDesc = New-Object System.Windows.Forms.Label
$lblSoundsDesc.Text = "Оповещения при восстановлении лимитов до 100%:"
$lblSoundsDesc.Location = New-Object System.Drawing.Point(15, 15)
$lblSoundsDesc.Size = New-Object System.Drawing.Size(450, 24)
$lblSoundsDesc.ForeColor = $cDim
$tabSounds.Controls.Add($lblSoundsDesc)

$chkSound5h = New-Object System.Windows.Forms.CheckBox
$chkSound5h.Text = "Звуковой сигнал при сбросе 5-часовых лимитов"
$chkSound5h.Location = New-Object System.Drawing.Point(25, 50)
$chkSound5h.Size = New-Object System.Drawing.Size(320, 24)
$chkSound5h.ForeColor = $cText
$chkSound5h.Checked = [bool]$config.limits.sound5h
$tabSounds.Controls.Add($chkSound5h)

$btnTest5h = New-Object System.Windows.Forms.Button
$btnTest5h.Text = "🔔 Проверить"
$btnTest5h.Location = New-Object System.Drawing.Point(350, 48)
$btnTest5h.Size = New-Object System.Drawing.Size(105, 28)
$btnTest5h.BackColor = $cBg
$btnTest5h.ForeColor = $cText
$btnTest5h.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnTest5h.Add_Click({
    [System.Console]::Beep(587, 100) # D5
    [System.Console]::Beep(880, 200) # A5
})
$tabSounds.Controls.Add($btnTest5h)

$chkSoundW = New-Object System.Windows.Forms.CheckBox
$chkSoundW.Text = "Звуковой сигнал при сбросе недельных лимитов"
$chkSoundW.Location = New-Object System.Drawing.Point(25, 95)
$chkSoundW.Size = New-Object System.Drawing.Size(320, 24)
$chkSoundW.ForeColor = $cText
$chkSoundW.Checked = [bool]$config.limits.soundWeekly
$tabSounds.Controls.Add($chkSoundW)

$btnTestW = New-Object System.Windows.Forms.Button
$btnTestW.Text = "🎉 Проверить"
$btnTestW.Location = New-Object System.Drawing.Point(350, 93)
$btnTestW.Size = New-Object System.Drawing.Size(105, 28)
$btnTestW.BackColor = $cBg
$btnTestW.ForeColor = $cText
$btnTestW.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnTestW.Add_Click({
    [System.Console]::Beep(523, 80) # C5
    [System.Console]::Beep(659, 80) # E5
    [System.Console]::Beep(784, 80) # G5
    [System.Console]::Beep(1046, 200) # C6
})
$tabSounds.Controls.Add($btnTestW)

$tabs.TabPages.Add($tabSounds)
$form.Controls.Add($tabs)

# --- Нижняя панель действий ---
$btnSave = New-Object System.Windows.Forms.Button
$btnSave.Text = "Сохранить"
$btnSave.Location = New-Object System.Drawing.Point(280, 420)
$btnSave.Size = New-Object System.Drawing.Size(110, 32)
$btnSave.BackColor = $cAccent
$btnSave.ForeColor = [System.Drawing.Color]::White
$btnSave.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
$btnSave.Font = $fBold

$btnCancel = New-Object System.Windows.Forms.Button
$btnCancel.Text = "Отмена"
$btnCancel.Location = New-Object System.Drawing.Point(400, 420)
$btnCancel.Size = New-Object System.Drawing.Size(100, 32)
$btnCancel.BackColor = $cSurface
$btnCancel.ForeColor = $cText
$btnCancel.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat

$btnSave.Add_Click({
    $selectedMode = "toggle"
    if ($rbPush.Checked) { $selectedMode = "push_to_talk" }
    elseif ($rbPause.Checked) { $selectedMode = "smart_pause" }

    $newConfig = @{
        voice = @{
            hotkey = [string]$cmbHotkey.SelectedItem
            mode = $selectedMode
            smartPauseSeconds = [double]$cmbPause.SelectedItem
            smartPunctuation = [bool]$chkPunct.Checked
            autoCapitalize = [bool]$chkCap.Checked
            audioFeedback = [bool]$chkAudio.Checked
        }
        limits = @{
            showClaude = [bool]$chkClaude.Checked
            showFlash = [bool]$chkFlash.Checked
            showPro = [bool]$chkPro.Checked
            sound5h = [bool]$chkSound5h.Checked
            soundWeekly = [bool]$chkSoundW.Checked
        }
    }

    $json = ConvertTo-Json $newConfig -Depth 4
    [System.IO.File]::WriteAllText($configFile, $json, [System.Text.Encoding]::UTF8)

    # Сигнал звукового подтверждения сохранения
    if ($chkAudio.Checked) {
        [System.Console]::Beep(880, 80)
        [System.Console]::Beep(1174, 120)
    }

    $form.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Close()
})

$btnCancel.Add_Click({
    $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Close()
})

$form.Controls.Add($btnSave)
$form.Controls.Add($btnCancel)

# Показываем форму диалогом
[void]$form.ShowDialog()
