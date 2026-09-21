using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Effects;
using System.Windows.Shapes;
using System.Windows.Threading;
using System.Windows.Interop;
using System.Runtime.InteropServices;

namespace AntigravityVoice {
    public class VoiceIslandWindow : Window {
        // --- Win32 Imports ---
        [DllImport("user32.dll")]
        public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);

        [DllImport("user32.dll")]
        public static extern bool UnregisterHotKey(IntPtr hWnd, int id);

        [DllImport("user32.dll")]
        public static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        public static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("kernel32.dll")]
        public static extern uint GetCurrentThreadId();

        [DllImport("user32.dll")]
        public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("user32.dll")]
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll")]
        public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        public const int GWL_EXSTYLE = -20;
        public const int WS_EX_TOOLWINDOW = 0x00000080;
        public const int WS_EX_NOACTIVATE = 0x08000000;

        public const uint MOD_ALT = 0x0001;
        public const uint MOD_CONTROL = 0x0002;
        public const uint MOD_SHIFT = 0x0004;
        public const uint MOD_WIN = 0x0008;
        public const uint MOD_NOREPEAT = 0x4000;

        public const int WM_HOTKEY = 0x0312;
        public const int HOTKEY_ID_CTRL_ALT_V  = 9230;
        public const int HOTKEY_ID_WIN_SHIFT_V = 9228;

        public const byte VK_CONTROL = 0x11;
        public const byte VK_V = 0x56;
        public const byte VK_MENU = 0x12; // Alt
        public const byte VK_SHIFT = 0x10;
        public const byte VK_LWIN = 0x5B;
        public const byte VK_RWIN = 0x5C;
        public const uint KEYEVENTF_KEYUP = 0x0002;

        // UI Controls
        private Border mainBorder;
        private DropShadowEffect mainShadow;
        private Grid contentGrid;

        // Idle elements
        private System.Windows.Shapes.Path micIcon;

        // Recording elements (identical to Antigravity)
        private StackPanel recPanel;
        private Rectangle bar1, bar2, bar3;
        private TextBlock timerText;

        // Success element
        private System.Windows.Shapes.Path checkIcon;

        // Timers & State
        private DispatcherTimer waveTimer;
        private DispatcherTimer recordTimer;
        private DateTime recordStartTime;
        private bool isRecording = false;
        private bool isProcessing = false;
        private IntPtr lastTargetWindow = IntPtr.Zero;
        private double wavePhase = 0.0;

        // Drag vs Click detection
        private Point mouseStartPos;
        private bool isDragging = false;

        private readonly string posFilePath;
        private readonly string rootDir;

        public VoiceIslandWindow() {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string compDir = System.IO.Path.Combine(appData, "AntigravityCompanion");
            if (!Directory.Exists(compDir)) Directory.CreateDirectory(compDir);
            posFilePath = System.IO.Path.Combine(compDir, "voice_island_pos.json");

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            rootDir = Directory.GetParent(baseDir.TrimEnd('\\', '/')).FullName;

            InitializeComponent();
            RestorePosition();
            SetupHotkeys();

            // Background check for companion bridge
            EnsureVoiceBridgeRunningAsync();
        }

        protected override void OnSourceInitialized(EventArgs e) {
            base.OnSourceInitialized(e);
            // Ensure 100% NO TASKBAR ICON and NO ALT+TAB PRESENCE
            IntPtr hwnd = new WindowInteropHelper(this).Handle;
            int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
            SetWindowLong(hwnd, GWL_EXSTYLE, exStyle | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE);
        }

        private void InitializeComponent() {
            Title = "Antigravity Voice";
            Width = 120;
            Height = 60;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ResizeMode = ResizeMode.NoResize;

            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
            TextOptions.SetTextRenderingMode(this, TextRenderingMode.ClearType);

            // Outer layout (centers capsule with room for shadow)
            Grid rootGrid = new Grid();
            rootGrid.HorizontalAlignment = HorizontalAlignment.Center;
            rootGrid.VerticalAlignment = VerticalAlignment.Center;

            // Main Floating Capsule
            mainShadow = new DropShadowEffect {
                Color = Colors.Black,
                Direction = 270,
                ShadowDepth = 3,
                BlurRadius = 12,
                Opacity = 0.65
            };

            mainBorder = new Border {
                Width = 38,
                Height = 38,
                CornerRadius = new CornerRadius(19),
                Background = new SolidColorBrush(Color.FromArgb(240, 24, 24, 28)), // #18181C
                BorderBrush = new SolidColorBrush(Color.FromArgb(50, 255, 255, 255)),
                BorderThickness = new Thickness(1.0),
                Effect = mainShadow,
                Cursor = Cursors.Hand,
                ToolTip = "Голосовой ввод Antigravity (Клик или Ctrl+Alt+V)"
            };

            // Mouse handling: drag vs click distinction
            mainBorder.MouseLeftButtonDown += (s, e) => {
                mouseStartPos = e.GetPosition(this);
                isDragging = false;
                CaptureTargetWindow();
                mainBorder.CaptureMouse();
            };

            mainBorder.MouseMove += (s, e) => {
                if (mainBorder.IsMouseCaptured && !isDragging) {
                    Point currentPos = e.GetPosition(this);
                    if (Math.Abs(currentPos.X - mouseStartPos.X) > 4 || Math.Abs(currentPos.Y - mouseStartPos.Y) > 4) {
                        isDragging = true;
                        mainBorder.ReleaseMouseCapture();
                        DragMove();
                        SavePosition();
                    }
                }
            };

            mainBorder.MouseLeftButtonUp += (s, e) => {
                if (mainBorder.IsMouseCaptured) {
                    mainBorder.ReleaseMouseCapture();
                }
                if (!isDragging) {
                    // It's a clean click -> toggle dictation identically to Antigravity!
                    ToggleDictation();
                }
                isDragging = false;
            };

            // Hover effect in idle
            mainBorder.MouseEnter += (s, e) => {
                if (!isRecording) {
                    mainBorder.BorderBrush = new SolidColorBrush(Color.FromArgb(120, 255, 255, 255));
                }
            };
            mainBorder.MouseLeave += (s, e) => {
                if (!isRecording) {
                    mainBorder.BorderBrush = new SolidColorBrush(Color.FromArgb(50, 255, 255, 255));
                }
            };

            contentGrid = new Grid();
            contentGrid.HorizontalAlignment = HorizontalAlignment.Center;
            contentGrid.VerticalAlignment = VerticalAlignment.Center;

            // 1. Idle Mic Icon (Antigravity exact SVG path)
            micIcon = new System.Windows.Shapes.Path {
                Fill = Brushes.White,
                Width = 15,
                Height = 15,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Data = Geometry.Parse("M12,2 A4,4 0 0,0 8,6 L8,12 A4,4 0 0,0 12,16 A4,4 0 0,0 16,12 L16,6 A4,4 0 0,0 12,2 Z M19,10 L19,12 A7,7 0 0,1 12,19 A7,7 0 0,1 5,12 L5,10 L3,10 L3,12 A9,9 0 0,0 11,20.92 L11,23 L13,23 L13,20.92 A9,9 0 0,0 21,12 L21,10 L19,10 Z")
            };
            contentGrid.Children.Add(micIcon);

            // 2. Recording Panel (Antigravity 3 animated bars + timer)
            recPanel = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Visibility = Visibility.Collapsed
            };

            // Sound visualizer container
            StackPanel barsPanel = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 6, 0)
            };

            bar1 = CreateWaveBar();
            bar2 = CreateWaveBar();
            bar3 = CreateWaveBar();

            barsPanel.Children.Add(bar1);
            barsPanel.Children.Add(bar2);
            barsPanel.Children.Add(bar3);
            recPanel.Children.Add(barsPanel);

            // Timer
            timerText = new TextBlock {
                Text = "00:00",
                FontFamily = new FontFamily("Segoe UI, Segoe UI Variable Text"),
                FontSize = 11,
                FontWeight = FontWeights.SemiBold,
                Foreground = Brushes.White,
                VerticalAlignment = VerticalAlignment.Center
            };
            recPanel.Children.Add(timerText);
            contentGrid.Children.Add(recPanel);

            // 3. Success Checkmark
            checkIcon = new System.Windows.Shapes.Path {
                Fill = Brushes.White,
                Width = 15,
                Height = 15,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Data = Geometry.Parse("M9,16.2 L4.8,12 L3.4,13.4 L9,19 L21,7 L19.6,5.6 Z"),
                Visibility = Visibility.Collapsed
            };
            contentGrid.Children.Add(checkIcon);

            mainBorder.Child = contentGrid;
            rootGrid.Children.Add(mainBorder);
            Content = rootGrid;

            // Context Menu (Right Click)
            ContextMenu ctx = new ContextMenu();
            MenuItem mnuToggle = new MenuItem { Header = "Запись (Старт / Стоп)" };
            mnuToggle.Click += (s, e) => ToggleDictation();

            MenuItem mnuReset = new MenuItem { Header = "Вернуть в правый верхний угол" };
            mnuReset.Click += (s, e) => {
                double screenW = SystemParameters.PrimaryScreenWidth;
                Left = screenW - Width - 30;
                Top = 30;
                SavePosition();
            };

            MenuItem mnuClose = new MenuItem { Header = "✕ Закрыть" };
            mnuClose.Click += (s, e) => this.Close();

            ctx.Items.Add(mnuToggle);
            ctx.Items.Add(new Separator());
            ctx.Items.Add(mnuReset);
            ctx.Items.Add(mnuClose);
            mainBorder.ContextMenu = ctx;

            // Timers
            waveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(30) };
            waveTimer.Tick += WaveTimer_Tick;

            recordTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(200) };
            recordTimer.Tick += RecordTimer_Tick;
        }

        private Rectangle CreateWaveBar() {
            return new Rectangle {
                Width = 2.5,
                Height = 5,
                RadiusX = 1.25,
                RadiusY = 1.25,
                Fill = Brushes.White,
                Margin = new Thickness(1.5, 0, 1.5, 0),
                VerticalAlignment = VerticalAlignment.Center
            };
        }

        private void AnimateCapsuleWidth(double targetWidth) {
            DoubleAnimation anim = new DoubleAnimation {
                To = targetWidth,
                Duration = TimeSpan.FromMilliseconds(160),
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseInOut }
            };
            mainBorder.BeginAnimation(Border.WidthProperty, anim);
        }

        private void CaptureTargetWindow() {
            IntPtr fg = GetForegroundWindow();
            WindowInteropHelper helper = new WindowInteropHelper(this);
            if (fg != IntPtr.Zero && fg != helper.Handle) {
                lastTargetWindow = fg;
            }
        }

        private void SetupHotkeys() {
            Loaded += (s, e) => {
                try {
                    WindowInteropHelper helper = new WindowInteropHelper(this);
                    HwndSource source = HwndSource.FromHwnd(helper.Handle);
                    source.AddHook(HwndHook);

                    RegisterHotKey(helper.Handle, HOTKEY_ID_CTRL_ALT_V, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 0x56);
                    RegisterHotKey(helper.Handle, HOTKEY_ID_WIN_SHIFT_V, MOD_WIN | MOD_SHIFT | MOD_NOREPEAT, 0x56);
                } catch {}
            };

            Closing += (s, e) => {
                try {
                    WindowInteropHelper helper = new WindowInteropHelper(this);
                    UnregisterHotKey(helper.Handle, HOTKEY_ID_CTRL_ALT_V);
                    UnregisterHotKey(helper.Handle, HOTKEY_ID_WIN_SHIFT_V);
                } catch {}
            };
        }

        private IntPtr HwndHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled) {
            if (msg == WM_HOTKEY) {
                int id = wParam.ToInt32();
                if (id == HOTKEY_ID_CTRL_ALT_V || id == HOTKEY_ID_WIN_SHIFT_V) {
                    CaptureTargetWindow();
                    ToggleDictation();
                    handled = true;
                }
            }
            return IntPtr.Zero;
        }

        public void ToggleDictation() {
            if (isProcessing) return;
            if (isRecording) {
                StopAndPasteDictation();
            } else {
                StartDictation();
            }
        }

        public void StartDictation() {
            if (isRecording || isProcessing) return;
            CaptureTargetWindow();

            ThreadPool.QueueUserWorkItem(_ => {
                EnsureVoiceBridgeRunning();
                try {
                    PlayBeepAsync(1);
                    HttpPost("http://127.0.0.1:9228/voice/start", "{}");
                    Dispatcher.Invoke(() => {
                        isRecording = true;
                        recordStartTime = DateTime.Now;
                        ApplyRecordingUI();
                        waveTimer.Start();
                        recordTimer.Start();
                    });
                } catch (Exception) {
                    Dispatcher.Invoke(() => {
                        ApplyFeedbackUI(Colors.Tomato);
                    });
                }
            });
        }

        public void StopAndPasteDictation() {
            if (!isRecording || isProcessing) return;
            isRecording = false;
            isProcessing = true;
            waveTimer.Stop();
            recordTimer.Stop();

            ApplyProcessingUI();
            PlayBeepAsync(2);

            ThreadPool.QueueUserWorkItem(_ => {
                try {
                    string json = HttpPost("http://127.0.0.1:9228/voice/stop", "{}");
                    string recognizedText = ExtractJsonString(json, "text");

                    Dispatcher.Invoke(() => {
                        if (!string.IsNullOrWhiteSpace(recognizedText)) {
                            ApplySuccessUI();
                            PlayBeepAsync(3);

                            ThreadPool.QueueUserWorkItem(__ => {
                                Thread.Sleep(60);
                                if (lastTargetWindow != IntPtr.Zero) {
                                    ForceForeground(lastTargetWindow);
                                    Thread.Sleep(90);
                                }

                                Dispatcher.Invoke(() => {
                                    SafeSetClipboardText(recognizedText);
                                });

                                Thread.Sleep(60);
                                SimulateCleanCtrlV();

                                Thread.Sleep(800);
                                Dispatcher.Invoke(() => {
                                    isProcessing = false;
                                    ApplyIdleUI();
                                });
                            });
                        } else {
                            ApplyFeedbackUI(Color.FromRgb(251, 146, 60)); // Orange
                            Thread.Sleep(800);
                            Dispatcher.Invoke(() => {
                                isProcessing = false;
                                ApplyIdleUI();
                            });
                        }
                    });
                } catch (Exception) {
                    Dispatcher.Invoke(() => {
                        isProcessing = false;
                        ApplyFeedbackUI(Colors.Tomato);
                        Thread.Sleep(800);
                        Dispatcher.Invoke(() => ApplyIdleUI());
                    });
                }
            });
        }

        // --- UI Transitions ---
        private void ApplyIdleUI() {
            AnimateCapsuleWidth(38);

            mainBorder.Background = new SolidColorBrush(Color.FromArgb(240, 24, 24, 28));
            mainBorder.BorderBrush = new SolidColorBrush(Color.FromArgb(50, 255, 255, 255));
            mainShadow.Color = Colors.Black;
            mainShadow.BlurRadius = 12;

            micIcon.Visibility = Visibility.Visible;
            recPanel.Visibility = Visibility.Collapsed;
            checkIcon.Visibility = Visibility.Collapsed;
        }

        private void ApplyRecordingUI() {
            AnimateCapsuleWidth(82);

            // Red pill matching Antigravity
            mainBorder.Background = new SolidColorBrush(Color.FromRgb(220, 38, 38)); // #DC2626
            mainBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(252, 165, 165));
            mainShadow.Color = Color.FromRgb(220, 38, 38);
            mainShadow.BlurRadius = 16;

            micIcon.Visibility = Visibility.Collapsed;
            recPanel.Visibility = Visibility.Visible;
            checkIcon.Visibility = Visibility.Collapsed;
        }

        private void ApplyProcessingUI() {
            AnimateCapsuleWidth(42);
            mainBorder.Background = new SolidColorBrush(Color.FromRgb(168, 85, 247)); // Purple
            mainShadow.Color = Color.FromRgb(168, 85, 247);
        }

        private void ApplySuccessUI() {
            AnimateCapsuleWidth(38);

            // Emerald green checkmark
            mainBorder.Background = new SolidColorBrush(Color.FromRgb(22, 163, 74)); // #16A34A
            mainBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(134, 239, 172));
            mainShadow.Color = Color.FromRgb(22, 163, 74);

            micIcon.Visibility = Visibility.Collapsed;
            recPanel.Visibility = Visibility.Collapsed;
            checkIcon.Visibility = Visibility.Visible;
        }

        private void ApplyFeedbackUI(Color col) {
            AnimateCapsuleWidth(38);
            mainBorder.Background = new SolidColorBrush(col);
            mainShadow.Color = col;
        }

        // --- Live Wave Animation (fluid multi-sine undulation identical to Antigravity) ---
        private void WaveTimer_Tick(object sender, EventArgs e) {
            if (!isRecording) return;
            wavePhase += 0.35;

            // 3 bars with independent harmonic frequencies
            bar1.Height = 4 + Math.Abs(Math.Sin(wavePhase * 1.1)) * 10;
            bar2.Height = 5 + Math.Abs(Math.Sin(wavePhase * 1.4 + 0.8)) * 12;
            bar3.Height = 4 + Math.Abs(Math.Sin(wavePhase * 1.2 + 1.6)) * 9;
        }

        private void RecordTimer_Tick(object sender, EventArgs e) {
            if (!isRecording) return;
            TimeSpan elapsed = DateTime.Now - recordStartTime;
            timerText.Text = string.Format("{0:D2}:{1:D2}", (int)elapsed.TotalMinutes, elapsed.Seconds);
        }

        // --- Bridge Auto-Manager (100% hidden in background) ---
        private void EnsureVoiceBridgeRunningAsync() {
            ThreadPool.QueueUserWorkItem(_ => EnsureVoiceBridgeRunning());
        }

        private void EnsureVoiceBridgeRunning() {
            try {
                HttpWebRequest check = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:9228/voice/status");
                check.Timeout = 800;
                using (HttpWebResponse resp = (HttpWebResponse)check.GetResponse()) {
                    if (resp.StatusCode == HttpStatusCode.OK) return;
                }
            } catch {}

            try {
                string nodePath = FindNodeExecutable();
                string compScript = System.IO.Path.Combine(rootDir, "bin", "antigravity_companion.js");

                ProcessStartInfo psi = new ProcessStartInfo {
                    FileName = nodePath,
                    Arguments = "\"" + compScript + "\"",
                    WorkingDirectory = rootDir,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true,
                    UseShellExecute = false
                };
                Process.Start(psi);
                Thread.Sleep(600);
            } catch {}
        }

        private string FindNodeExecutable() {
            string[] paths = new string[] {
                System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "hermes", "node", "node.exe"),
                System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "node", "node.exe"),
                System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe"),
                System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe")
            };
            foreach (string p in paths) {
                if (File.Exists(p)) return p;
            }
            return "node.exe";
        }

        // --- Position ---
        private void RestorePosition() {
            double screenW = SystemParameters.PrimaryScreenWidth;
            double screenH = SystemParameters.PrimaryScreenHeight;

            // Default: Top-right corner of screen (unobtrusive, like a floating mic)
            double defaultLeft = screenW - Width - 40;
            double defaultTop = 40;

            if (File.Exists(posFilePath)) {
                try {
                    string json = File.ReadAllText(posFilePath);
                    double x = ExtractJsonDouble(json, "X", defaultLeft);
                    double y = ExtractJsonDouble(json, "Y", defaultTop);

                    if (x < 0) x = 10;
                    if (x > screenW - Width) x = screenW - Width - 10;
                    if (y < 0) y = 10;
                    if (y > screenH - Height) y = screenH - Height - 10;

                    Left = x;
                    Top = y;
                    return;
                } catch {}
            }

            Left = defaultLeft;
            Top = defaultTop;
        }

        private void SavePosition() {
            try {
                string json = string.Format("{{\"X\":{0},\"Y\":{1}}}", (int)Left, (int)Top);
                File.WriteAllText(posFilePath, json);
            } catch {}
        }

        // --- Helpers ---
        private static void ForceForeground(IntPtr hWnd) {
            if (hWnd == IntPtr.Zero) return;
            try {
                uint curThread = GetCurrentThreadId();
                uint targetProc;
                uint targetThread = GetWindowThreadProcessId(hWnd, out targetProc);

                if (curThread != targetThread && targetThread != 0) {
                    AttachThreadInput(curThread, targetThread, true);
                    SetForegroundWindow(hWnd);
                    AttachThreadInput(curThread, targetThread, false);
                } else {
                    SetForegroundWindow(hWnd);
                }
            } catch {}
        }

        private static void SafeSetClipboardText(string text) {
            for (int i = 0; i < 10; i++) {
                try {
                    Clipboard.SetDataObject(text, true);
                    return;
                } catch {
                    Thread.Sleep(30);
                }
            }
        }

        private static void SimulateCleanCtrlV() {
            // Release modifier keys that might still be held down from hotkeys
            keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_LWIN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_RWIN, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            Thread.Sleep(25);

            // Execute clean Ctrl+V paste
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            keybd_event(VK_V, 0, 0, UIntPtr.Zero);
            Thread.Sleep(20);
            keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }

        private static void PlayBeepAsync(int type) {
            ThreadPool.QueueUserWorkItem(_ => {
                try {
                    if (type == 1) { // Start
                        Console.Beep(784, 50);
                        Console.Beep(1046, 70);
                    } else if (type == 2) { // Stop
                        Console.Beep(880, 50);
                        Console.Beep(659, 70);
                    } else if (type == 3) { // Success Paste
                        Console.Beep(1046, 90);
                    }
                } catch {}
            });
        }

        private static string HttpPost(string url, string data) {
            byte[] bytes = Encoding.UTF8.GetBytes(data);
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "POST";
            req.ContentType = "application/json";
            req.ContentLength = bytes.Length;
            req.Timeout = 8000;

            using (Stream s = req.GetRequestStream()) {
                s.Write(bytes, 0, bytes.Length);
            }

            using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
            using (StreamReader reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8)) {
                return reader.ReadToEnd();
            }
        }

        private static string ExtractJsonString(string json, string key) {
            string pattern = "\"" + key + "\":\"";
            int idx = json.IndexOf(pattern);
            if (idx == -1) return "";
            int start = idx + pattern.Length;
            int end = json.IndexOf("\"", start);
            if (end == -1) return "";
            string raw = json.Substring(start, end - start);
            return raw.Replace("\\n", "\n").Replace("\\\"", "\"").Replace("\\\\", "\\");
        }

        private static double ExtractJsonDouble(string json, string key, double fallback) {
            string pattern = "\"" + key + "\":";
            int idx = json.IndexOf(pattern);
            if (idx == -1) return fallback;
            int start = idx + pattern.Length;
            int end = json.IndexOfAny(new char[] { ',', '}', ' ' }, start);
            if (end == -1) end = json.Length;
            string raw = json.Substring(start, end - start).Trim();
            double val;
            if (double.TryParse(raw, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out val)) {
                return val;
            }
            return fallback;
        }

        [STAThread]
        public static void Main() {
            try {
                System.Threading.Thread.CurrentThread.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
                System.Threading.Thread.CurrentThread.CurrentUICulture = System.Globalization.CultureInfo.InvariantCulture;

                bool isNew;
                using (Mutex mutex = new Mutex(true, "AntigravityCompanion_VoiceIsland_Mutex", out isNew)) {
                    if (!isNew) {
                        try {
                            File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "island_error.log"), "Mutex already held by another instance.");
                        } catch {}
                        return; // Single instance
                    }
                    Application app = new Application();
                    app.ShutdownMode = ShutdownMode.OnExplicitShutdown;

                    VoiceIslandWindow win = new VoiceIslandWindow();
                    win.Closed += (s, e) => {
                        app.Shutdown();
                    };

                    win.Show();
                    app.Run();
                }
            } catch (Exception ex) {
                try {
                    File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "island_error.log"), ex.ToString());
                } catch {}
            }
        }
    }
}
