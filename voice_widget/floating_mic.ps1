#Requires -Version 5.1

$CsharpSource = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using System.Threading;

public class FloatingMicForm : Form {
    public const int WS_EX_NOACTIVATE = 0x08000000;
    public const int WS_EX_TOPMOST     = 0x00000008;
    public const int WS_EX_TOOLWINDOW  = 0x00000080;
    public const int WM_HOTKEY        = 0x0312;
    public const int WM_NCLBUTTONDOWN = 0x00A1;
    public const int HTCAPTION        = 0x0002;

    public const uint MOD_ALT      = 0x0001;
    public const uint MOD_CONTROL  = 0x0002;
    public const uint MOD_SHIFT    = 0x0004;
    public const uint MOD_WIN      = 0x0008;
    public const uint MOD_NOREPEAT = 0x4000;

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    [DllImport("user32.dll")]
    public static extern int SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

    [DllImport("user32.dll")]
    public static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    public const int KEYEVENTF_KEYUP = 0x0002;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_V = 0x56;

    public static void SimulateCtrlV() {
        keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
        keybd_event(VK_V, 0, 0, UIntPtr.Zero);
        keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }

    public static GraphicsPath CreateCapsulePath(int width, int height) {
        GraphicsPath path = new GraphicsPath();
        int radius = height / 2;
        int d = radius * 2;
        if (width <= height) {
            path.AddEllipse(0, 0, height, height);
        } else {
            path.AddArc(0, 0, d, d, 90, 180);
            path.AddArc(width - d, 0, d, d, 270, 180);
            path.CloseFigure();
        }
        return path;
    }

    public static void PlaySoundAsync(int soundType) {
        ThreadPool.QueueUserWorkItem(_ => {
            try {
                if (soundType == 1) { // Start recording
                    Console.Beep(659, 60);
                    Console.Beep(880, 80);
                } else if (soundType == 2) { // Stop recording
                    Console.Beep(784, 70);
                    Console.Beep(523, 90);
                } else if (soundType == 3) { // Success Paste
                    Console.Beep(1046, 120);
                }
            } catch {}
        });
    }

    public event Action HotkeyPressed;

    protected override CreateParams CreateParams {
        get {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= WS_EX_NOACTIVATE | WS_EX_TOPMOST | WS_EX_TOOLWINDOW;
            return cp;
        }
    }

    protected override void WndProc(ref Message m) {
        if (m.Msg == WM_HOTKEY && m.WParam.ToInt32() == 9228) {
            if (HotkeyPressed != null) HotkeyPressed();
        }
        base.WndProc(ref m);
    }
}
"@

Add-Type -TypeDefinition $CsharpSource -ReferencedAssemblies "System.Windows.Forms", "System.Drawing"

# --- Load Configuration ---
$AppDataDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData)
$CompanionDir = Join-Path $AppDataDir "AntigravityCompanion"
$ConfigFile = Join-Path $CompanionDir "config.json"
$PosFile = Join-Path $CompanionDir "voice_widget_pos.json"

function Get-CompanionConfig {
    $cfg = @{
        voice = @{
            hotkey = "Win+Shift+V"
            mode = "toggle"
            smartPauseSeconds = 2.0
            smartPunctuation = $true
            autoCapitalize = $true
            audioFeedback = $true
        }
    }
    if (Test-Path $ConfigFile) {
        try {
            $raw = Get-Content $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($raw.voice) {
                if ($raw.voice.hotkey) { $cfg.voice.hotkey = $raw.voice.hotkey }
                if ($raw.voice.mode) { $cfg.voice.mode = $raw.voice.mode }
                if ($raw.voice.smartPauseSeconds) { $cfg.voice.smartPauseSeconds = [double]$raw.voice.smartPauseSeconds }
                if ($null -ne $raw.voice.audioFeedback) { $cfg.voice.audioFeedback = [bool]$raw.voice.audioFeedback }
            }
        } catch {}
    }
    return $cfg
}

$Script:Config = Get-CompanionConfig

$Form = [FloatingMicForm]::new()
$Form.Text = "Antigravity Voice Dictation"
$Form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$Form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$Form.Size = [System.Drawing.Size]::new(46, 46)
$Form.TopMost = $true
$Form.ShowInTaskbar = $false
$Form.BackColor = [System.Drawing.Color]::FromArgb(30, 30, 30)

# Position
$Screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
if (Test-Path $PosFile) {
    try {
        $pos = Get-Content $PosFile -Raw | ConvertFrom-Json
        $Form.Location = [System.Drawing.Point]::new([int]$pos.X, [int]$pos.Y)
    } catch {
        $Form.Location = [System.Drawing.Point]::new($Screen.Right - 70, $Screen.Bottom - 120)
    }
} else {
    $Form.Location = [System.Drawing.Point]::new($Screen.Right - 70, $Screen.Bottom - 120)
}

# Initial Region
$path = [FloatingMicForm]::CreateCapsulePath(46, 46)
$Form.Region = [System.Drawing.Region]::new($path)

# Colors and states
$Script:IsRecording = $false
$Script:IsPasting = $false
$Script:LastForegroundHwnd = [IntPtr]::Zero
$Script:RecordStartTick = 0
$Script:RecordElapsedSec = 0
$Script:WaveTick = 0

$Script:IdleColor = [System.Drawing.Color]::FromArgb(32, 32, 34)
$Script:HoverColor = [System.Drawing.Color]::FromArgb(48, 48, 52)
$Script:RecColor = [System.Drawing.Color]::FromArgb(190, 35, 35)
$Script:PasteColor = [System.Drawing.Color]::FromArgb(38, 135, 50)
$Script:CurrentBg = $Script:IdleColor

# Function to resize widget capsule smoothly
function UpdateWidgetShape {
    param([int]$width)
    $Form.Width = $width
    $newPath = [FloatingMicForm]::CreateCapsulePath($width, 46)
    $Form.Region = [System.Drawing.Region]::new($newPath)
    $Form.Invalidate()
}

# Animation Timer for Recording (Ticks every 100ms)
$AnimTimer = New-Object System.Windows.Forms.Timer
$AnimTimer.Interval = 100
$AnimTimer.add_Tick({
    if ($Script:IsRecording) {
        $elapsedMs = [Environment]::TickCount - $Script:RecordStartTick
        $Script:RecordElapsedSec = [Math]::Floor($elapsedMs / 1000)
        $Script:WaveTick = ($Script:WaveTick + 1) % 100
        $Form.Invalidate()
    }
})

# Paint Event: Icon, Timer, Waveform, and Borders
$Form.add_Paint({
    param($sender, $e)
    $g = $e.Graphics
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $w = $Form.Width

    # Background Capsule
    $bgBrush = [System.Drawing.SolidBrush]::new($Script:CurrentBg)
    $capsulePath = [FloatingMicForm]::CreateCapsulePath($w, 46)
    $g.FillPath($bgBrush, $capsulePath)
    $bgBrush.Dispose()

    # Border
    $borderColor = if ($Script:IsRecording) { [System.Drawing.Color]::FromArgb(255, 120, 120) } elseif ($Script:IsPasting) { [System.Drawing.Color]::FromArgb(120, 255, 120) } else { [System.Drawing.Color]::FromArgb(80, 255, 255, 255) }
    $pen = [System.Drawing.Pen]::new($borderColor, 1.5)
    $g.DrawPath($pen, $capsulePath)
    $pen.Dispose()

    if ($Script:IsRecording) {
        # 1. Pulsing red dot
        $dotBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
        $g.FillEllipse($dotBrush, 14, 16, 12, 12)
        $dotBrush.Dispose()

        # 2. Timer mm:ss
        $min = [Math]::Floor($Script:RecordElapsedSec / 60)
        $sec = $Script:RecordElapsedSec % 60
        $timeStr = "{0:D2}:{1:D2}" -f [int]$min, [int]$sec
        $fTimer = New-Object System.Drawing.Font("Segoe UI", 9.0, [System.Drawing.FontStyle]::Bold)
        $bText = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.DrawString($timeStr, $fTimer, $bText, 32, 14)
        $fTimer.Dispose()
        $bText.Dispose()

        # 3. Animated waveform bars
        $bWave = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 220, 220))
        $t = $Script:WaveTick
        $h1 = 6 + (($t * 3) % 10)
        $h2 = 8 + (($t * 5) % 14)
        $h3 = 10 + (($t * 2) % 12)
        $h4 = 5 + (($t * 4) % 8)

        $g.FillRectangle($bWave, 78, [int](23 - $h1 / 2), 3, $h1)
        $g.FillRectangle($bWave, 84, [int](23 - $h2 / 2), 3, $h2)
        $g.FillRectangle($bWave, 90, [int](23 - $h3 / 2), 3, $h3)
        $g.FillRectangle($bWave, 96, [int](23 - $h4 / 2), 3, $h4)
        $bWave.Dispose()

    } elseif ($Script:IsPasting) {
        # Green checkmark and "Pasted"
        $fCheck = New-Object System.Drawing.Font("Segoe UI", 11.0, [System.Drawing.FontStyle]::Bold)
        $bText = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
        $g.DrawString([char]0x2713, $fCheck, $bText, 14, 11)

        $fDone = New-Object System.Drawing.Font("Segoe UI", 9.0, [System.Drawing.FontStyle]::Bold)
        $g.DrawString("Готово", $fDone, $bText, 36, 14)
        $fCheck.Dispose()
        $fDone.Dispose()
        $bText.Dispose()

    } else {
        # Standby: Microphone Icon
        $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(240, 240, 240))
        $g.FillRectangle($brush, 20, 12, 6, 12)
        $g.FillEllipse($brush, 20, 9, 6, 6)
        $g.FillEllipse($brush, 20, 21, 6, 6)
        $standPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(210, 210, 210), 2)
        $g.DrawArc($standPen, 17, 14, 12, 14, 0, 180)
        $g.DrawLine($standPen, 23, 28, 23, 33)
        $g.DrawLine($standPen, 18, 33, 28, 33)
        $standPen.Dispose()
        $brush.Dispose()
    }
})

# Drag & Drop handling without activating window
$Script:MouseDownPos = [System.Drawing.Point]::Empty
$Script:IsDragging = $false

$Form.add_MouseDown({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        $Script:MouseDownPos = [System.Windows.Forms.Cursor]::Position
        $Script:IsDragging = $false

        # Push-to-Talk via mouse support
        $Script:Config = Get-CompanionConfig
        if ($Script:Config.voice.mode -eq "push_to_talk" -and -not $Script:IsRecording) {
            StartDictation
        }
    }
})

$Form.add_MouseMove({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left -and -not $Script:IsDragging) {
        $cur = [System.Windows.Forms.Cursor]::Position
        $dx = [Math]::Abs($cur.X - $Script:MouseDownPos.X)
        $dy = [Math]::Abs($cur.Y - $Script:MouseDownPos.Y)
        if ($dx -gt 4 -or $dy -gt 4) {
            $Script:IsDragging = $true
            [FloatingMicForm]::ReleaseCapture()
            [FloatingMicForm]::SendMessage($Form.Handle, [FloatingMicForm]::WM_NCLBUTTONDOWN, [FloatingMicForm]::HTCAPTION, 0)
            try {
                if (-not (Test-Path $CompanionDir)) { New-Item -ItemType Directory -Path $CompanionDir -Force | Out-Null }
                @{ X = $Form.Location.X; Y = $Form.Location.Y } | ConvertTo-Json | Set-Content $PosFile -Force
            } catch {}
        }
    }
})

$Form.add_MouseUp({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        $Script:Config = Get-CompanionConfig
        if ($Script:Config.voice.mode -eq "push_to_talk" -and $Script:IsRecording) {
            StopAndPasteDictation
        } elseif (-not $Script:IsDragging -and $Script:Config.voice.mode -ne "push_to_talk") {
            ToggleDictation
        }
        $Script:IsDragging = $false
    }
})

# Dictation Functions
function StartDictation {
    $targetHwnd = [FloatingMicForm]::GetForegroundWindow()
    if ($targetHwnd -ne [IntPtr]::Zero -and $targetHwnd -ne $Form.Handle) {
        $Script:LastForegroundHwnd = $targetHwnd
    }

    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:9228/voice/start" -Method Post -TimeoutSec 5 -ErrorAction Stop
        if ($res.ok) {
            $Script:IsRecording = $true
            $Script:RecordStartTick = [Environment]::TickCount
            $Script:RecordElapsedSec = 0
            $Script:CurrentBg = $Script:RecColor
            UpdateWidgetShape 112
            $AnimTimer.Start()

            if ($Script:Config.voice.audioFeedback) {
                [FloatingMicForm]::PlaySoundAsync(1)
            }
        }
    } catch {}
}

function StopAndPasteDictation {
    $AnimTimer.Stop()
    $Script:IsRecording = $false

    if ($Script:Config.voice.audioFeedback) {
        [FloatingMicForm]::PlaySoundAsync(2)
    }

    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:9228/voice/stop" -Method Post -TimeoutSec 10 -ErrorAction Stop
        $transcribed = if ($res.ok) { $res.result.text } else { "" }

        if (-not [string]::IsNullOrWhiteSpace($transcribed)) {
            $Script:IsPasting = $true
            $Script:CurrentBg = $Script:PasteColor
            UpdateWidgetShape 100

            if ($Script:Config.voice.audioFeedback) {
                [FloatingMicForm]::PlaySoundAsync(3)
            }

            if ($Script:LastForegroundHwnd -ne [IntPtr]::Zero) {
                [FloatingMicForm]::SetForegroundWindow($Script:LastForegroundHwnd)
                Start-Sleep -Milliseconds 60
            }

            $prevClip = $null
            try { $prevClip = [System.Windows.Forms.Clipboard]::GetText() } catch {}

            [System.Windows.Forms.Clipboard]::SetText($transcribed)
            Start-Sleep -Milliseconds 40
            [FloatingMicForm]::SimulateCtrlV()

            Start-Sleep -Milliseconds 600
            if (-not [string]::IsNullOrEmpty($prevClip)) {
                try { [System.Windows.Forms.Clipboard]::SetText($prevClip) } catch {}
            }
        }
    } catch {}

    $Script:IsPasting = $false
    $Script:CurrentBg = $Script:IdleColor
    UpdateWidgetShape 46
}

function ToggleDictation {
    if ($Script:IsRecording) {
        StopAndPasteDictation
    } else {
        StartDictation
    }
}

# Context Menu
$ContextMenu = [System.Windows.Forms.ContextMenuStrip]::new()
$ItemTitle = $ContextMenu.Items.Add("Antigravity Voice Dictation")
$ItemTitle.Enabled = $false

$ItemSettings = $ContextMenu.Items.Add("⚙️ Settings...")
$ItemSettings.add_Click({
    $settingsScript = Join-Path $PSScriptRoot "settings_window.ps1"
    Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -NoProfile -File `"$settingsScript`""
})

$ContextMenu.Items.Add("-") | Out-Null
$ItemToggle = $ContextMenu.Items.Add("Record (Toggle)")
$ItemToggle.add_Click({ ToggleDictation })

$ContextMenu.Items.Add("-") | Out-Null
$ItemExit = $ContextMenu.Items.Add("Close Widget")
$ItemExit.add_Click({ $Form.Close() })
$Form.ContextMenuStrip = $ContextMenu

# Hover effects
$Form.add_MouseEnter({
    if (-not $Script:IsRecording -and -not $Script:IsPasting) {
        $Script:CurrentBg = $Script:HoverColor
        $Form.Invalidate()
    }
})
$Form.add_MouseLeave({
    if (-not $Script:IsRecording -and -not $Script:IsPasting) {
        $Script:CurrentBg = $Script:IdleColor
        $Form.Invalidate()
    }
})

# Hotkey Parser and Registration
function RegisterConfiguredHotkey {
    $Script:Config = Get-CompanionConfig
    $hk = $Script:Config.voice.hotkey

    $mod = [FloatingMicForm]::MOD_NOREPEAT
    $vk = 0x56 # V

    switch -Regex ($hk) {
        "Win\+Shift\+V" {
            $mod = $mod -bor [FloatingMicForm]::MOD_WIN -bor [FloatingMicForm]::MOD_SHIFT
            $vk = 0x56
        }
        "Ctrl\+Alt\+V" {
            $mod = $mod -bor [FloatingMicForm]::MOD_CONTROL -bor [FloatingMicForm]::MOD_ALT
            $vk = 0x56
        }
        "Ctrl\+Shift\+Space" {
            $mod = $mod -bor [FloatingMicForm]::MOD_CONTROL -bor [FloatingMicForm]::MOD_SHIFT
            $vk = 0x20
        }
        "F8" {
            $vk = 0x77
        }
        "F9" {
            $vk = 0x78
        }
        default {
            $mod = $mod -bor [FloatingMicForm]::MOD_WIN -bor [FloatingMicForm]::MOD_SHIFT
            $vk = 0x56
        }
    }

    $HOTKEY_ID = 9228
    $regOk = [FloatingMicForm]::RegisterHotKey($Form.Handle, $HOTKEY_ID, $mod, $vk)
    if (-not $regOk) {
        # Fallback to Ctrl+Alt+V
        $modFall = [FloatingMicForm]::MOD_CONTROL -bor [FloatingMicForm]::MOD_ALT -bor [FloatingMicForm]::MOD_NOREPEAT
        [FloatingMicForm]::RegisterHotKey($Form.Handle, $HOTKEY_ID, $modFall, 0x56) | Out-Null
    }
}

$Form.add_Shown({
    RegisterConfiguredHotkey
})

$Form.add_FormClosing({
    [FloatingMicForm]::UnregisterHotKey($Form.Handle, 9228)
})

# Connect HotkeyPressed event directly
$Form.add_HotkeyPressed({
    ToggleDictation
})

# Run Application Loop
[System.Windows.Forms.Application]::Run($Form)
