using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
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
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        public const uint MOD_ALT = 0x0001;
        public const uint MOD_CONTROL = 0x0002;
        public const uint MOD_SHIFT = 0x0004;
        public const uint MOD_WIN = 0x0008;
        public const uint MOD_NOREPEAT = 0x4000;

        public const int WM_HOTKEY = 0x0312;
        public const int HOTKEY_ID_WIN_SHIFT_V = 9228;
        public const int HOTKEY_ID_ALT_SPACE = 9229;

        public const byte VK_CONTROL = 0x11;
        public const byte VK_V = 0x56;
        public const uint KEYEVENTF_KEYUP = 0x0002;

        // UI Controls
        private Border mainBorder;
        private Border orbBorder;
        private System.Windows.Shapes.Path micIconPath;
        private TextBlock titleText;
        private TextBlock statusText;
        private StackPanel wavePanel;
        private Rectangle[] waveBars;
        private Button doneButton;
        private Button cancelButton;
        private Button settingsButton;
        private Button closeButton;
        private StackPanel recActions;
        private StackPanel idleActions;

        // Timers & State
        private DispatcherTimer waveTimer;
        private DispatcherTimer recordTimer;
        private DateTime recordStartTime;
        private bool isRecording = false;
        private bool isProcessing = false;
        private IntPtr lastTargetWindow = IntPtr.Zero;
        private double wavePhase = 0.0;

        private readonly string posFilePath;

        public VoiceIslandWindow() {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string compDir = System.IO.Path.Combine(appData, "AntigravityCompanion");
            if (!Directory.Exists(compDir)) Directory.CreateDirectory(compDir);
            posFilePath = System.IO.Path.Combine(compDir, "voice_island_pos.json");

            InitializeComponent();
            RestorePosition();
            SetupHotkeys();

            // Track target window on mouse hover
            MouseEnter += (s, e) => CaptureTargetWindow();
            MouseDown += (s, e) => CaptureTargetWindow();
        }

        private void InitializeComponent() {
            Title = "Antigravity Voice Island";
            Width = 420;
            Height = 94;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ResizeMode = ResizeMode.NoResize;

            // Outer layout grid with padding for shadow
            Grid rootGrid = new Grid();
            rootGrid.Margin = new Thickness(14);

            // Main Glass Capsule Border
            mainBorder = new Border {
                Height = 64,
                CornerRadius = new CornerRadius(32),
                Background = new SolidColorBrush(Color.FromArgb(235, 24, 24, 28)), // #18181C with smooth alpha
                BorderBrush = new SolidColorBrush(Color.FromArgb(50, 255, 255, 255)),
                BorderThickness = new Thickness(1.2),
                Effect = new DropShadowEffect {
                    Color = Colors.Black,
                    Direction = 270,
                    ShadowDepth = 4,
                    BlurRadius = 22,
                    Opacity = 0.75
                }
            };

            // Enable dragging anywhere on the island
            mainBorder.MouseLeftButtonDown += (s, e) => {
                CaptureTargetWindow();
                DragMove();
                SavePosition();
            };

            Grid contentGrid = new Grid();
            contentGrid.Margin = new Thickness(8, 6, 12, 6);
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // 0: Orb
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // 1: Info & Wave
            contentGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // 2: Actions

            // --- 0. Orb Button (Left) ---
            orbBorder = new Border {
                Width = 48,
                Height = 48,
                CornerRadius = new CornerRadius(24),
                Background = new SolidColorBrush(Color.FromArgb(255, 38, 38, 44)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(60, 255, 255, 255)),
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand
            };

            micIconPath = new System.Windows.Shapes.Path {
                Fill = Brushes.White,
                Width = 20,
                Height = 20,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Data = Geometry.Parse("M12,2 A4,4 0 0,0 8,6 L8,12 A4,4 0 0,0 12,16 A4,4 0 0,0 16,12 L16,6 A4,4 0 0,0 12,2 Z M19,10 L19,12 A7,7 0 0,1 12,19 A7,7 0 0,1 5,12 L5,10 L3,10 L3,12 A9,9 0 0,0 11,20.92 L11,23 L13,23 L13,20.92 A9,9 0 0,0 21,12 L21,10 L19,10 Z")
            };
            orbBorder.Child = micIconPath;

            orbBorder.MouseLeftButtonDown += (s, e) => {
                e.Handled = true;
                ToggleDictation();
            };

            Grid.SetColumn(orbBorder, 0);
            contentGrid.Children.Add(orbBorder);

            // --- 1. Center Info: Titles, Live Timer, Wave Equalizer ---
            StackPanel centerPanel = new StackPanel {
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(12, 0, 8, 0)
            };

            // Top line: Title or Timer + Equalizer
            Grid topLineGrid = new Grid();
            topLineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
            topLineGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            titleText = new TextBlock {
                Text = "Голосовой ввод",
                FontFamily = new FontFamily("Segoe UI, Segoe UI Variable Display"),
                FontSize = 14,
                FontWeight = FontWeights.SemiBold,
                Foreground = Brushes.White,
                VerticalAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(titleText, 0);
            topLineGrid.Children.Add(titleText);

            // 5 Animated Waveform Bars
            wavePanel = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(10, 0, 0, 0),
                Visibility = Visibility.Collapsed
            };

            waveBars = new Rectangle[5];
            Color[] barColors = new Color[] {
                Color.FromRgb(56, 189, 248),  // Light blue
                Color.FromRgb(129, 140, 248), // Indigo
                Color.FromRgb(192, 132, 252), // Purple
                Color.FromRgb(244, 114, 182), // Pink
                Color.FromRgb(52, 211, 153)   // Emerald
            };

            for (int i = 0; i < 5; i++) {
                waveBars[i] = new Rectangle {
                    Width = 3.5,
                    Height = 8,
                    RadiusX = 1.75,
                    RadiusY = 1.75,
                    Fill = new SolidColorBrush(barColors[i]),
                    Margin = new Thickness(2, 0, 2, 0),
                    VerticalAlignment = VerticalAlignment.Center
                };
                wavePanel.Children.Add(waveBars[i]);
            }
            Grid.SetColumn(wavePanel, 1);
            topLineGrid.Children.Add(wavePanel);

            centerPanel.Children.Add(topLineGrid);

            // Subtitle status
            statusText = new TextBlock {
                Text = "Нажмите или Win + Shift + V",
                FontFamily = new FontFamily("Segoe UI, Segoe UI Variable Text"),
                FontSize = 11.5,
                Foreground = new SolidColorBrush(Color.FromArgb(180, 255, 255, 255)),
                Margin = new Thickness(0, 2, 0, 0)
            };
            centerPanel.Children.Add(statusText);

            Grid.SetColumn(centerPanel, 1);
            contentGrid.Children.Add(centerPanel);

            // --- 2. Action Buttons (Right) ---
            // A) Recording Actions: Done (✓) & Cancel (✕)
            recActions = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed
            };

            doneButton = CreateIconButton("M9,16.2 L4.8,12 L3.4,13.4 L9,19 L21,7 L19.6,5.6 Z", Color.FromRgb(34, 197, 94), "Завершить и вставить (Enter)");
            doneButton.Click += (s, e) => StopAndPasteDictation();

            cancelButton = CreateIconButton("M19,6.41 L17.59,5 L12,10.59 L6.41,5 L5,6.41 L10.59,12 L5,17.59 L6.41,19 L12,13.41 L17.59,19 L19,17.59 L13.41,12 Z", Color.FromRgb(239, 68, 68), "Отмена (Esc)");
            cancelButton.Click += (s, e) => CancelDictation();

            recActions.Children.Add(doneButton);
            recActions.Children.Add(cancelButton);

            // B) Idle Actions: Settings (⚙) & Close (✕)
            idleActions = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Visible
            };

            settingsButton = CreateIconButton("M19.14,12.94 C19.18,12.63 19.2,12.32 19.2,12 C19.2,11.68 19.18,11.37 19.14,11.06 L21.16,9.48 C21.34,9.34 21.39,9.08 21.28,8.88 L19.36,5.55 C19.24,5.35 19,5.27 18.79,5.36 L16.41,6.32 C15.92,5.94 15.38,5.63 14.8,5.4 L14.44,2.87 C14.41,2.64 14.21,2.47 13.98,2.47 L10.14,2.47 C9.91,2.47 9.71,2.64 9.68,2.87 L9.32,5.4 C8.74,5.63 8.2,5.94 7.71,6.32 L5.33,5.36 C5.12,5.27 4.88,5.35 4.76,5.55 L2.84,8.88 C2.72,9.08 2.78,9.34 2.96,9.48 L4.98,11.06 C4.94,11.37 4.92,11.68 4.92,12 C4.92,12.32 4.94,12.63 4.98,12.94 L2.96,14.52 C2.78,14.66 2.72,14.92 2.84,15.12 L4.76,18.45 C4.88,18.65 5.12,18.73 5.33,18.64 L7.71,17.68 C8.2,18.06 8.74,18.37 9.32,18.6 L9.68,21.13 C9.71,21.36 9.91,21.53 10.14,21.53 L13.98,21.53 C14.21,21.53 14.41,21.36 14.44,21.13 L14.8,18.6 C15.38,18.37 15.92,18.06 16.41,17.68 L18.79,18.64 C19,18.73 19.24,18.65 19.36,18.45 L21.28,15.12 C21.39,14.92 21.34,14.66 21.16,14.52 L19.14,12.94 Z M12,15.5 C10.07,15.5 8.5,13.93 8.5,12 C8.5,10.07 10.07,8.5 12,8.5 C13.93,8.5 15.5,10.07 15.5,12 C15.5,13.93 13.93,15.5 12,15.5 Z", Color.FromArgb(200, 200, 200, 200), "Настройки");
            settingsButton.Click += (s, e) => OpenSettings();

            closeButton = CreateIconButton("M19,6.41 L17.59,5 L12,10.59 L6.41,5 L5,6.41 L10.59,12 L5,17.59 L6.41,19 L12,13.41 L17.59,19 L19,17.59 L13.41,12 Z", Color.FromArgb(160, 200, 200, 200), "Скрыть в трей");
            closeButton.Click += (s, e) => {
                this.WindowState = WindowState.Minimized;
            };

            idleActions.Children.Add(settingsButton);
            idleActions.Children.Add(closeButton);

            Grid.SetColumn(recActions, 2);
            Grid.SetColumn(idleActions, 2);
            contentGrid.Children.Add(recActions);
            contentGrid.Children.Add(idleActions);

            mainBorder.Child = contentGrid;
            rootGrid.Children.Add(mainBorder);
            Content = rootGrid;

            // Keyboard navigation
            KeyDown += (s, e) => {
                if (e.Key == Key.Enter && isRecording) {
                    StopAndPasteDictation();
                } else if (e.Key == Key.Escape) {
                    if (isRecording) CancelDictation();
                    else this.WindowState = WindowState.Minimized;
                }
            };

            // Timers
            waveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };
            waveTimer.Tick += WaveTimer_Tick;

            recordTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(200) };
            recordTimer.Tick += RecordTimer_Tick;
        }

        private Button CreateIconButton(string svgPathData, Color iconColor, string tooltipText) {
            Button btn = new Button {
                Width = 34,
                Height = 34,
                Margin = new Thickness(3, 0, 3, 0),
                Cursor = Cursors.Hand,
                ToolTip = tooltipText,
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0)
            };

            Border btnBorder = new Border {
                Width = 32,
                Height = 32,
                CornerRadius = new CornerRadius(16),
                Background = new SolidColorBrush(Color.FromArgb(40, 255, 255, 255))
            };

            System.Windows.Shapes.Path path = new System.Windows.Shapes.Path {
                Fill = new SolidColorBrush(iconColor),
                Width = 14,
                Height = 14,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Data = Geometry.Parse(svgPathData)
            };
            btnBorder.Child = path;
            btn.Content = btnBorder;

            btn.MouseEnter += (s, e) => {
                btnBorder.Background = new SolidColorBrush(Color.FromArgb(80, 255, 255, 255));
            };
            btn.MouseLeave += (s, e) => {
                btnBorder.Background = new SolidColorBrush(Color.FromArgb(40, 255, 255, 255));
            };

            return btn;
        }

        private void CaptureTargetWindow() {
            IntPtr fg = GetForegroundWindow();
            WindowInteropHelper helper = new WindowInteropHelper(this);
            if (fg != IntPtr.Zero && fg != helper.Handle) {
                lastTargetWindow = fg;
            }
        }

        public const int HOTKEY_ID_CTRL_ALT_V = 9230;

        private void SetupHotkeys() {
            Loaded += (s, e) => {
                try {
                    WindowInteropHelper helper = new WindowInteropHelper(this);
                    HwndSource source = HwndSource.FromHwnd(helper.Handle);
                    source.AddHook(HwndHook);

                    // 1. Win + Shift + V
                    bool regWinShiftV = RegisterHotKey(helper.Handle, HOTKEY_ID_WIN_SHIFT_V, MOD_WIN | MOD_SHIFT | MOD_NOREPEAT, 0x56);
                    DebugLog(string.Format("HotKey Win+Shift+V registration: {0}", regWinShiftV));

                    // 2. Ctrl + Alt + V (fallback / alternative)
                    bool regCtrlAltV = RegisterHotKey(helper.Handle, HOTKEY_ID_CTRL_ALT_V, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 0x56);
                    DebugLog(string.Format("HotKey Ctrl+Alt+V registration: {0}", regCtrlAltV));
                } catch (Exception ex) {
                    DebugLog("SetupHotkeys error: " + ex.Message);
                }
            };

            Closing += (s, e) => {
                try {
                    WindowInteropHelper helper = new WindowInteropHelper(this);
                    UnregisterHotKey(helper.Handle, HOTKEY_ID_WIN_SHIFT_V);
                    UnregisterHotKey(helper.Handle, HOTKEY_ID_CTRL_ALT_V);
                } catch {}
            };

            // Context Menu (Right-Click)
            ContextMenu ctx = new ContextMenu();
            MenuItem mnuToggle = new MenuItem { Header = "Запись (Старт / Стоп)" };
            mnuToggle.Click += (s, e) => ToggleDictation();

            MenuItem mnuSettings = new MenuItem { Header = "⚙ Настройки..." };
            mnuSettings.Click += (s, e) => OpenSettings();

            MenuItem mnuResetPos = new MenuItem { Header = "Вернуть в центр экрана" };
            mnuResetPos.Click += (s, e) => {
                double screenW = SystemParameters.PrimaryScreenWidth;
                Left = (screenW - Width) / 2;
                Top = 60;
                SavePosition();
            };

            MenuItem mnuClose = new MenuItem { Header = "✕ Закрыть" };
            mnuClose.Click += (s, e) => {
                this.Close();
            };

            ctx.Items.Add(mnuToggle);
            ctx.Items.Add(mnuSettings);
            ctx.Items.Add(new Separator());
            ctx.Items.Add(mnuResetPos);
            ctx.Items.Add(mnuClose);

            mainBorder.ContextMenu = ctx;
        }

        private IntPtr HwndHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled) {
            if (msg == WM_HOTKEY) {
                int id = wParam.ToInt32();
                if (id == HOTKEY_ID_WIN_SHIFT_V || id == HOTKEY_ID_CTRL_ALT_V) {
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
                try {
                    PlayBeepAsync(1);
                    string resp = HttpPost("http://127.0.0.1:9228/voice/start", "{}");
                    Dispatcher.Invoke(() => {
                        isRecording = true;
                        recordStartTime = DateTime.Now;
                        ApplyRecordingUI();
                        waveTimer.Start();
                        recordTimer.Start();
                    });
                } catch (Exception ex) {
                    Dispatcher.Invoke(() => {
                        statusText.Text = "Ошибка запуска моста (9228)";
                        statusText.Foreground = Brushes.Tomato;
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
                            ApplyPastingUI(recognizedText);
                            PlayBeepAsync(3);

                            // Restore focus and paste
                            ThreadPool.QueueUserWorkItem(__ => {
                                Thread.Sleep(100);
                                if (lastTargetWindow != IntPtr.Zero) {
                                    SetForegroundWindow(lastTargetWindow);
                                    Thread.Sleep(80);
                                }

                                // Clipboard paste
                                Dispatcher.Invoke(() => {
                                    Clipboard.SetDataObject(recognizedText, true);
                                });

                                Thread.Sleep(60);
                                SimulateCtrlV();

                                Thread.Sleep(800);
                                Dispatcher.Invoke(() => {
                                    isProcessing = false;
                                    ApplyIdleUI();
                                });
                            });
                        } else {
                            statusText.Text = "Речь не распознана";
                            Thread.Sleep(1200);
                            Dispatcher.Invoke(() => {
                                isProcessing = false;
                                ApplyIdleUI();
                            });
                        }
                    });
                } catch (Exception ex) {
                    Dispatcher.Invoke(() => {
                        isProcessing = false;
                        statusText.Text = "Ошибка связи с мостом";
                        ApplyIdleUI();
                    });
                }
            });
        }

        public void CancelDictation() {
            if (!isRecording) return;
            isRecording = false;
            isProcessing = false;
            waveTimer.Stop();
            recordTimer.Stop();

            ThreadPool.QueueUserWorkItem(_ => {
                try {
                    HttpPost("http://127.0.0.1:9228/voice/stop", "{}");
                } catch {}
            });

            ApplyIdleUI();
        }

        private void OpenSettings() {
            ThreadPool.QueueUserWorkItem(_ => {
                try {
                    HttpPost("http://127.0.0.1:9228/settings/open", "{}");
                } catch {}
            });
        }

        // --- UI State Transitions ---
        private void ApplyIdleUI() {
            titleText.Text = "Голосовой ввод";
            statusText.Text = "Нажмите или Win + Shift + V";
            statusText.Foreground = new SolidColorBrush(Color.FromArgb(180, 255, 255, 255));
            wavePanel.Visibility = Visibility.Collapsed;
            recActions.Visibility = Visibility.Collapsed;
            idleActions.Visibility = Visibility.Visible;

            // Orb: dark circle with white mic
            orbBorder.Background = new SolidColorBrush(Color.FromArgb(255, 38, 38, 44));
            orbBorder.BorderBrush = new SolidColorBrush(Color.FromArgb(60, 255, 255, 255));
            micIconPath.Fill = Brushes.White;
        }

        private void ApplyRecordingUI() {
            titleText.Text = "00:00";
            statusText.Text = "Слушаю... Говорите";
            statusText.Foreground = new SolidColorBrush(Color.FromRgb(56, 189, 248)); // Light cyan
            wavePanel.Visibility = Visibility.Visible;
            recActions.Visibility = Visibility.Visible;
            idleActions.Visibility = Visibility.Collapsed;

            // Orb: Pulsing glowing gradient
            RadialGradientBrush grad = new RadialGradientBrush();
            grad.GradientStops.Add(new GradientStop(Color.FromRgb(239, 68, 68), 0.0)); // Red / Rose
            grad.GradientStops.Add(new GradientStop(Color.FromRgb(185, 28, 28), 1.0));
            orbBorder.Background = grad;
            orbBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(252, 165, 165));
        }

        private void ApplyProcessingUI() {
            titleText.Text = "Обработка...";
            statusText.Text = "Распознавание речи...";
            statusText.Foreground = new SolidColorBrush(Color.FromRgb(192, 132, 252)); // Purple
            wavePanel.Visibility = Visibility.Collapsed;
            recActions.Visibility = Visibility.Collapsed;
            idleActions.Visibility = Visibility.Collapsed;
        }

        private void ApplyPastingUI(string text) {
            titleText.Text = "✓ Готово!";
            statusText.Text = "Вставка в активное окно...";
            statusText.Foreground = new SolidColorBrush(Color.FromRgb(74, 222, 128)); // Emerald green

            RadialGradientBrush grad = new RadialGradientBrush();
            grad.GradientStops.Add(new GradientStop(Color.FromRgb(34, 197, 94), 0.0));
            grad.GradientStops.Add(new GradientStop(Color.FromRgb(21, 128, 61), 1.0));
            orbBorder.Background = grad;
            orbBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(134, 239, 172));
        }

        // --- Wave & Timer Animations ---
        private void RecordTimer_Tick(object sender, EventArgs e) {
            if (!isRecording) return;
            TimeSpan elapsed = DateTime.Now - recordStartTime;
            titleText.Text = string.Format("{0:D2}:{1:D2}", (int)elapsed.TotalMinutes, elapsed.Seconds);
        }

        private void WaveTimer_Tick(object sender, EventArgs e) {
            if (!isRecording) return;
            wavePhase += 0.25;

            for (int i = 0; i < 5; i++) {
                double val = Math.Sin(wavePhase + i * 1.2);
                double height = 6 + Math.Abs(val) * 18;
                waveBars[i].Height = height;
            }
        }

        // --- Window Position Persistence ---
        private void RestorePosition() {
            double screenW = SystemParameters.PrimaryScreenWidth;
            double screenH = SystemParameters.PrimaryScreenHeight;

            // Default: Top-center of screen (like Spotlight / ChatGPT / Dynamic Island)
            double defaultLeft = (screenW - Width) / 2;
            double defaultTop = 60;

            if (File.Exists(posFilePath)) {
                try {
                    string json = File.ReadAllText(posFilePath);
                    double x = ExtractJsonDouble(json, "X", defaultLeft);
                    double y = ExtractJsonDouble(json, "Y", defaultTop);

                    // Clamp to screen bounds
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

        // --- Native Helpers ---
        private static void SimulateCtrlV() {
            keybd_event(VK_CONTROL, 0, 0, UIntPtr.Zero);
            keybd_event(VK_V, 0, 0, UIntPtr.Zero);
            keybd_event(VK_V, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }

        private static void PlayBeepAsync(int type) {
            ThreadPool.QueueUserWorkItem(_ => {
                try {
                    if (type == 1) { // Start
                        Console.Beep(659, 60);
                        Console.Beep(880, 80);
                    } else if (type == 2) { // Stop
                        Console.Beep(784, 70);
                        Console.Beep(523, 90);
                    } else if (type == 3) { // Success Paste
                        Console.Beep(1046, 110);
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

        private static void DebugLog(string msg) {
            try {
                string p = System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "voice_island_debug.log");
                File.AppendAllText(p, string.Format("[{0:HH:mm:ss.fff}] {1}\r\n", DateTime.Now, msg));
            } catch {}
        }

        [STAThread]
        public static void Main() {
            DebugLog("1. Main started");
            try {
                System.Threading.Thread.CurrentThread.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
                System.Threading.Thread.CurrentThread.CurrentUICulture = System.Globalization.CultureInfo.InvariantCulture;

                bool isNew;
                using (Mutex mutex = new Mutex(true, "AntigravityCompanion_VoiceIsland_Mutex", out isNew)) {
                    DebugLog("2. Mutex checked, isNew=" + isNew);
                    if (!isNew) {
                        DebugLog("2a. Exiting because mutex already held by another instance!");
                        return;
                    }
                    Application app = new Application();
                    app.ShutdownMode = ShutdownMode.OnExplicitShutdown;
                    app.DispatcherUnhandledException += (s, e) => {
                        DebugLog("DispatcherUnhandledException: " + e.Exception);
                    };
                    AppDomain.CurrentDomain.UnhandledException += (s, e) => {
                        DebugLog("AppDomain UnhandledException: " + e.ExceptionObject);
                    };

                    DebugLog("3. Creating window");
                    VoiceIslandWindow win = new VoiceIslandWindow();
                    win.Closed += (s, e) => {
                        DebugLog("Window Closed!");
                        app.Shutdown();
                    };

                    WindowInteropHelper helper = new WindowInteropHelper(win);
                    IntPtr hwnd = helper.EnsureHandle();
                    DebugLog(string.Format("Window HWND={0}, Left={1}, Top={2}, W={3}, H={4}", hwnd, win.Left, win.Top, win.Width, win.Height));

                    DebugLog("4. Showing window");
                    win.Show();
                    win.Activate();

                    DebugLog("5. Running app loop");
                    int exitCode = app.Run();
                    DebugLog("6. app.Run exited with code " + exitCode);
                }
            } catch (Exception ex) {
                DebugLog("FATAL in Main: " + ex);
            }
        }
    }
}
