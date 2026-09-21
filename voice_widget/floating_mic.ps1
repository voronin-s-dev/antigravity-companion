#Requires -Version 5.1

$CsharpSource = @"
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using System.Runtime.InteropServices;

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

$Form = [FloatingMicForm]::new()
$Form.Text = "Antigravity Voice Dictation"
$Form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$Form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$Form.Size = [System.Drawing.Size]::new(46, 46)
$Form.TopMost = $true
$Form.ShowInTaskbar = $false
$Form.BackColor = [System.Drawing.Color]::FromArgb(32, 30, 26)

# Position in bottom-right corner by default
$Screen = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$PosFile = Join-Path ($env:APPDATA) "AntigravityCompanion\voice_widget_pos.json"
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

# Rounded region
$path = [System.Drawing.Drawing2D.GraphicsPath]::new()
$path.AddEllipse(0, 0, 46, 46)
$Form.Region = [System.Drawing.Region]::new($path)

# Colors and state
$Script:IsRecording = $false
$Script:IsPasting = $false
$Script:LastForegroundHwnd = [IntPtr]::Zero

$Script:IdleColor = [System.Drawing.Color]::FromArgb(32, 30, 26)
$Script:HoverColor = [System.Drawing.Color]::FromArgb(50, 47, 42)
$Script:RecColor = [System.Drawing.Color]::FromArgb(211, 47, 47)
$Script:PasteColor = [System.Drawing.Color]::FromArgb(46, 125, 50)
$Script:CurrentBg = $Script:IdleColor

# Paint Event: Icon and Border
$Form.add_Paint({
    param($sender, $e)
    $g = $e.Graphics
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    # Background
    $bgBrush = [System.Drawing.SolidBrush]::new($Script:CurrentBg)
    $g.FillEllipse($bgBrush, 1, 1, 44, 44)
    $bgBrush.Dispose()

    # Border
    $borderColor = if ($Script:IsRecording) { [System.Drawing.Color]::FromArgb(255, 255, 255) } elseif ($Script:IsPasting) { [System.Drawing.Color]::LightGreen } else { [System.Drawing.Color]::FromArgb(80, 255, 255, 255) }
    $pen = [System.Drawing.Pen]::new($borderColor, 1.5)
    $g.DrawEllipse($pen, 1, 1, 44, 44)
    $pen.Dispose()

    # Center Icon
    if ($Script:IsRecording) {
        # Pulsing dot
        $dotBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
        $g.FillEllipse($dotBrush, 16, 16, 14, 14)
        $dotBrush.Dispose()
    } elseif ($Script:IsPasting) {
        $font = [System.Drawing.Font]::new("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
        $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
        $g.DrawString([char]0x2713, $font, $brush, 13, 10)
        $font.Dispose()
        $brush.Dispose()
    } else {
        # Mic symbol
        $brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(235, 235, 235))
        $g.FillRectangle($brush, 20, 12, 6, 12)
        $g.FillEllipse($brush, 20, 9, 6, 6)
        $g.FillEllipse($brush, 20, 21, 6, 6)
        $standPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(200, 200, 200), 2)
        $g.DrawArc($standPen, 17, 14, 12, 14, 0, 180)
        $g.DrawLine($standPen, 23, 28, 23, 33)
        $g.DrawLine($standPen, 18, 33, 28, 33)
        $standPen.Dispose()
        $brush.Dispose()
    }
})

# Drag & Drop handling without activating window
$Form.add_MouseDown({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        [FloatingMicForm]::ReleaseCapture()
        [FloatingMicForm]::SendMessage($Form.Handle, [FloatingMicForm]::WM_NCLBUTTONDOWN, [FloatingMicForm]::HTCAPTION, 0)
        try {
            $dir = Split-Path $PosFile
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            @{ X = $Form.Location.X; Y = $Form.Location.Y } | ConvertTo-Json | Set-Content $PosFile -Force
        } catch {}
    }
})

# Toggle Dictation Function
function ToggleDictation {
    $targetHwnd = [FloatingMicForm]::GetForegroundWindow()
    if ($targetHwnd -ne [IntPtr]::Zero -and $targetHwnd -ne $Form.Handle) {
        $Script:LastForegroundHwnd = $targetHwnd
    }

    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:9228/voice/toggle" -Method Post -TimeoutSec 10 -ErrorAction Stop
        if ($res.ok -and $res.result.action -eq "started") {
            $Script:IsRecording = $true
            $Script:CurrentBg = $Script:RecColor
            $Form.Invalidate()
        } elseif ($res.ok -and $res.result.action -eq "stopped") {
            $Script:IsRecording = $false
            $transcribed = $res.result.text

            if (-not [string]::IsNullOrWhiteSpace($transcribed)) {
                $Script:IsPasting = $true
                $Script:CurrentBg = $Script:PasteColor
                $Form.Invalidate()

                if ($Script:LastForegroundHwnd -ne [IntPtr]::Zero) {
                    [FloatingMicForm]::SetForegroundWindow($Script:LastForegroundHwnd)
                    Start-Sleep -Milliseconds 60
                }

                $prevClip = $null
                try { $prevClip = [System.Windows.Forms.Clipboard]::GetText() } catch {}
                
                [System.Windows.Forms.Clipboard]::SetText($transcribed)
                Start-Sleep -Milliseconds 40
                [FloatingMicForm]::SimulateCtrlV()

                Start-Sleep -Milliseconds 400
                if (-not [string]::IsNullOrEmpty($prevClip)) {
                    try { [System.Windows.Forms.Clipboard]::SetText($prevClip) } catch {}
                }

                $Script:IsPasting = $false
            }

            $Script:CurrentBg = $Script:IdleColor
            $Form.Invalidate()
        }
    } catch {
        $Script:IsRecording = $false
        $Script:IsPasting = $false
        $Script:CurrentBg = $Script:IdleColor
        $Form.Invalidate()
    }
}

# Click Event
$Form.add_MouseClick({
    param($sender, $e)
    if ($e.Button -eq [System.Windows.Forms.MouseButtons]::Left) {
        ToggleDictation
    }
})

# Context Menu
$ContextMenu = [System.Windows.Forms.ContextMenuStrip]::new()
$ItemTitle = $ContextMenu.Items.Add("Antigravity Voice Dictation")
$ItemTitle.Enabled = $false
$ItemHotkey = $ContextMenu.Items.Add("Hotkey: Win + Shift + V")
$ItemHotkey.Enabled = $false
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

# Register Global Hotkey Win+Shift+V (ID = 9228)
$HOTKEY_ID = 9228
$MODIFIERS = [FloatingMicForm]::MOD_WIN -bor [FloatingMicForm]::MOD_SHIFT -bor [FloatingMicForm]::MOD_NOREPEAT
$VK_V = 0x56

$Form.add_Shown({
    $regOk = [FloatingMicForm]::RegisterHotKey($Form.Handle, $HOTKEY_ID, $MODIFIERS, $VK_V)
    if (-not $regOk) {
        $MODIFIERS_FALLBACK = [FloatingMicForm]::MOD_CONTROL -bor [FloatingMicForm]::MOD_ALT -bor [FloatingMicForm]::MOD_NOREPEAT
        [FloatingMicForm]::RegisterHotKey($Form.Handle, $HOTKEY_ID, $MODIFIERS_FALLBACK, $VK_V) | Out-Null
    }
})

$Form.add_FormClosing({
    [FloatingMicForm]::UnregisterHotKey($Form.Handle, $HOTKEY_ID)
})

# Connect HotkeyPressed event directly
$Form.add_HotkeyPressed({
    ToggleDictation
})

# Run Application Loop
[System.Windows.Forms.Application]::Run($Form)
