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
        public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        public const uint MOD_ALT = 0x0001;
        public const uint MOD_CONTROL = 0x0002;
        public const uint MOD_SHIFT = 0x0004;
        public const uint MOD_WIN = 0x0008;
        public const uint MOD_NOREPEAT = 0x4000;

        public const int WM_HOTKEY = 0x0312;
        public const int HOTKEY_ID_WIN_SHIFT_V = 9228;
        public const int HOTKEY_ID_CTRL_ALT_V  = 9230;

        public const byte VK_CONTROL = 0x11;
        public const byte VK_V = 0x56;
        public const uint KEYEVENTF_KEYUP = 0x0002;

        // UI Controls
        private Border mainBorder;
        private Border orbBorder;
        private System.Windows.Shapes.Path orbIconPath;
        private DropShadowEffect orbGlow;
        
        // Idle Content
        private StackPanel idlePanel;
        private TextBlock idleTitle;
        private Border hotkeyBadge;
        private TextBlock hotkeyText;

        // Recording Content
        private StackPanel recPanel;
        private TextBlock timerText;
        private StackPanel wavePanel;
        private Rectangle[] waveBars;
        private Button doneButton;
        private Button cancelButton;

        // State Content
        private TextBlock feedbackText;

        // Timers & State
        private DispatcherTimer waveTimer;
        private DispatcherTimer recordTimer;
        private DateTime recordStartTime;
        private bool isRecording = false;
        private bool isProcessing = false;
        private IntPtr lastTargetWindow = IntPtr.Zero;
        private double wavePhase = 0.0;
        private bool isHotkeyPressed = false;

        private readonly string posFilePath;
        private readonly string rootDir;

        public VoiceIslandWindow() {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            string compDir = System.IO.Path.Combine(appData, "AntigravityCompanion");
            if (!Directory.Exists(compDir)) Directory.CreateDirectory(compDir);
            posFilePath = System.IO.Path.Combine(compDir, "voice_island_pos.json");

            // Locate companion root dir dynamically
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            rootDir = Directory.GetParent(baseDir.TrimEnd('\\', '/')).FullName;

            InitializeComponent();
            RestorePosition();
            SetupHotkeys();

            // Track target window on mouse hover
            MouseEnter += (s, e) => CaptureTargetWindow();
            MouseDown += (s, e) => CaptureTargetWindow();

            // Silently verify or start Voice Bridge in background
            EnsureVoiceBridgeRunningAsync();
        }

        private void InitializeComponent() {
            Title = "Antigravity Voice Island";
            Width = 280;
            Height = 52;
            WindowStyle = WindowStyle.None;
            AllowsTransparency = true;
            Background = Brushes.Transparent;
            Topmost = true;
            ShowInTaskbar = false;
            ResizeMode = ResizeMode.NoResize;

            // Crisp rendering settings
            UseLayoutRounding = true;
            SnapsToDevicePixels = true;
            TextOptions.SetTextFormattingMode(this, TextFormattingMode.Display);
            TextOptions.SetTextRenderingMode(this, TextRenderingMode.ClearType);

            // Outer container (centers capsule, leaves room for soft shadow)
            Grid rootGrid = new Grid();
            rootGrid.HorizontalAlignment = HorizontalAlignment.Center;
            rootGrid.VerticalAlignment = VerticalAlignment.Center;

            // Ultra-compact Glass Capsule
            mainBorder = new Border {
                Width = 156,
                Height = 34,
                CornerRadius = new CornerRadius(17),
                Background = new SolidColorBrush(Color.FromArgb(240, 18, 18, 22)), // Sleek obsidian dark
                BorderBrush = new SolidColorBrush(Color.FromArgb(34, 255, 255, 255)),
                BorderThickness = new Thickness(1.0),
                Cursor = Cursors.Hand,
                Effect = new DropShadowEffect {
                    Color = Colors.Black,
                    Direction = 270,
                    ShadowDepth = 3,
                    BlurRadius = 14,
                    Opacity = 0.65
                }
            };

            // Drag to reposition
            mainBorder.MouseLeftButtonDown += (s, e) => {
                CaptureTargetWindow();
                if (e.ClickCount == 1 && e.OriginalSource == mainBorder) {
                    DragMove();
                    SavePosition();
                }
            };

            Grid innerGrid = new Grid();
            innerGrid.Margin = new Thickness(5, 0, 5, 0);
            innerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Orb
            innerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) }); // Content
            innerGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto }); // Actions

            // --- 1. Left Voice Orb (22x22) ---
            orbGlow = new DropShadowEffect {
                Color = Colors.Transparent,
                BlurRadius = 8,
                ShadowDepth = 0,
                Opacity = 0.8
            };

            orbBorder = new Border {
                Width = 22,
                Height = 22,
                CornerRadius = new CornerRadius(11),
                Background = new SolidColorBrush(Color.FromArgb(255, 42, 42, 48)),
                BorderBrush = new SolidColorBrush(Color.FromArgb(50, 255, 255, 255)),
                BorderThickness = new Thickness(0.8),
                Effect = orbGlow,
                VerticalAlignment = VerticalAlignment.Center
            };

            orbIconPath = new System.Windows.Shapes.Path {
                Fill = new SolidColorBrush(Color.FromRgb(225, 225, 230)),
                Width = 10,
                Height = 10,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Data = Geometry.Parse("M12,2 A4,4 0 0,0 8,6 L8,12 A4,4 0 0,0 12,16 A4,4 0 0,0 16,12 L16,6 A4,4 0 0,0 12,2 Z M19,10 L19,12 A7,7 0 0,1 12,19 A7,7 0 0,1 5,12 L5,10 L3,10 L3,12 A9,9 0 0,0 11,20.92 L11,23 L13,23 L13,20.92 A9,9 0 0,0 21,12 L21,10 L19,10 Z")
            };
            orbBorder.Child = orbIconPath;

            orbBorder.MouseLeftButtonDown += (s, e) => {
                e.Handled = true;
                ToggleDictation();
            };

            Grid.SetColumn(orbBorder, 0);
            innerGrid.Children.Add(orbBorder);

            // --- 2. Center Content Area ---
            Grid centerGrid = new Grid {
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(7, 0, 4, 0)
            };

            // A) Idle Panel: "Диктовка" + Hotkey badge
            idlePanel = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            idleTitle = new TextBlock {
                Text = "Диктовка",
                FontFamily = new FontFamily("Segoe UI, Segoe UI Variable Text"),
                FontSize = 11.5,
                FontWeight = FontWeights.Medium,
                Foreground = new SolidColorBrush(Color.FromRgb(228, 228, 232)),
                VerticalAlignment = VerticalAlignment.Center
            };
            idlePanel.Children.Add(idleTitle);

            hotkeyBadge = new Border {
                CornerRadius = new CornerRadius(3),
                Background = new SolidColorBrush(Color.FromArgb(24, 255, 255, 255)),
                Padding = new Thickness(4, 1, 4, 1),
                Margin = new Thickness(6, 0, 0, 0),
                VerticalAlignment = VerticalAlignment.Center
            };

            hotkeyText = new TextBlock {
                Text = "Ctrl+Alt+V",
                FontFamily = new FontFamily("Segoe UI, Segoe UI Variable Text"),
                FontSize = 9.5,
                Foreground = new SolidColorBrush(Color.FromArgb(160, 255, 255, 255))
            };
            hotkeyBadge.Child = hotkeyText;
            idlePanel.Children.Add(hotkeyBadge);

            // B) Recording Panel: Timer + 4 Mini Equalizer Bars
            recPanel = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed
            };

            timerText = new TextBlock {
                Text = "00:00",
                FontFamily = new FontFamily("Segoe UI, Segoe UI Variable Text"),
                FontSize = 11.5,
                FontWeight = FontWeights.SemiBold,
                Foreground = Brushes.White,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };
            recPanel.Children.Add(timerText);

            wavePanel = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            waveBars = new Rectangle[4];
            Color[] barColors = new Color[] {
                Color.FromRgb(56, 189, 248),  // Light blue
                Color.FromRgb(168, 85, 247),  // Purple
                Color.FromRgb(236, 72, 153),  // Pink
                Color.FromRgb(52, 211, 153)   // Emerald
            };

            for (int i = 0; i < 4; i++) {
                waveBars[i] = new Rectangle {
                    Width = 2,
                    Height = 6,
                    RadiusX = 1,
                    RadiusY = 1,
                    Fill = new SolidColorBrush(barColors[i]),
                    Margin = new Thickness(1.5, 0, 1.5, 0),
                    VerticalAlignment = VerticalAlignment.Center
                };
                wavePanel.Children.Add(waveBars[i]);
            }
            recPanel.Children.Add(wavePanel);

            // C) Feedback / Processing text
            feedbackText = new TextBlock {
                FontFamily = new FontFamily("Segoe UI, Segoe UI Variable Text"),
                FontSize = 11,
                VerticalAlignment = VerticalAlignment.Center,
                Visibility = Visibility.Collapsed
            };

            centerGrid.Children.Add(idlePanel);
            centerGrid.Children.Add(recPanel);
            centerGrid.Children.Add(feedbackText);

            Grid.SetColumn(centerGrid, 1);
            innerGrid.Children.Add(centerGrid);

            // --- 3. Right Action Buttons (Recording state: Done & Cancel) ---
            StackPanel recActions = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            doneButton = CreateCompactButton("M9,16.2 L4.8,12 L3.4,13.4 L9,19 L21,7 L19.6,5.6 Z", Color.FromRgb(34, 197, 94), Color.FromArgb(40, 34, 197, 94), "Вставить (Enter)");
            doneButton.Click += (s, e) => {
                e.Handled = true;
                StopAndPasteDictation();
            };

            cancelButton = CreateCompactButton("M19,6.41 L17.59,5 L12,10.59 L6.41,5 L5,6.41 L10.59,12 L5,17.59 L6.41,19 L12,13.41 L17.59,19 L19,17.59 L13.41,12 Z", Color.FromRgb(220, 220, 225), Color.FromArgb(25, 255, 255, 255), "Отмена (Esc)");
            cancelButton.Click += (s, e) => {
                e.Handled = true;
                CancelDictation();
            };

            recActions.Children.Add(doneButton);
            recActions.Children.Add(cancelButton);

            doneButton.Visibility = Visibility.Collapsed;
            cancelButton.Visibility = Visibility.Collapsed;

            Grid.SetColumn(recActions, 2);
            innerGrid.Children.Add(recActions);

            mainBorder.Child = innerGrid;
            rootGrid.Children.Add(mainBorder);
            Content = rootGrid;

            // Click on island body toggles recording
            mainBorder.MouseLeftButtonUp += (s, e) => {
                if (!isRecording && !isProcessing) {
                    ToggleDictation();
                }
            };

            // Keyboard navigation
            KeyDown += (s, e) => {
                if (e.Key == Key.Enter && isRecording) {
                    StopAndPasteDictation();
                } else if (e.Key == Key.Escape) {
                    if (isRecording) CancelDictation();
                }
            };

            // Timers
            waveTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(45) };
            waveTimer.Tick += WaveTimer_Tick;

            recordTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(200) };
            recordTimer.Tick += RecordTimer_Tick;
        }

        private Button CreateCompactButton(string svgPathData, Color iconColor, Color bgColor, string tooltipText) {
            Button btn = new Button {
                Width = 22,
                Height = 22,
                Margin = new Thickness(2, 0, 1, 0),
                Cursor = Cursors.Hand,
                ToolTip = tooltipText,
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0)
            };

            Border btnBorder = new Border {
                Width = 22,
                Height = 22,
                CornerRadius = new CornerRadius(11),
                Background = new SolidColorBrush(bgColor)
            };

            System.Windows.Shapes.Path path = new System.Windows.Shapes.Path {
                Fill = new SolidColorBrush(iconColor),
                Width = 9,
                Height = 9,
                Stretch = Stretch.Uniform,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
                Data = Geometry.Parse(svgPathData)
            };
            btnBorder.Child = path;
            btn.Content = btnBorder;

            btn.MouseEnter += (s, e) => {
                btnBorder.Background = new SolidColorBrush(Color.FromArgb(80, iconColor.R, iconColor.G, iconColor.B));
            };
            btn.MouseLeave += (s, e) => {
                btnBorder.Background = new SolidColorBrush(bgColor);
            };

            return btn;
        }

        private void AnimateCapsuleWidth(double targetWidth) {
            DoubleAnimation anim = new DoubleAnimation {
                To = targetWidth,
                Duration = TimeSpan.FromMilliseconds(200),
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

                    bool regWinShiftV = RegisterHotKey(helper.Handle, HOTKEY_ID_WIN_SHIFT_V, MOD_WIN | MOD_SHIFT | MOD_NOREPEAT, 0x56);
                    bool regCtrlAltV  = RegisterHotKey(helper.Handle, HOTKEY_ID_CTRL_ALT_V, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, 0x56);

                    if (regWinShiftV) {
                        hotkeyText.Text = "Win+Shift+V";
                    } else if (regCtrlAltV) {
                        hotkeyText.Text = "Ctrl+Alt+V";
                    }
                } catch {}
            };

            Closing += (s, e) => {
                try {
                    WindowInteropHelper helper = new WindowInteropHelper(this);
                    UnregisterHotKey(helper.Handle, HOTKEY_ID_WIN_SHIFT_V);
                    UnregisterHotKey(helper.Handle, HOTKEY_ID_CTRL_ALT_V);
                } catch {}
            };

            // Context Menu (Right Click)
            ContextMenu ctx = new ContextMenu();
            MenuItem mnuToggle = new MenuItem { Header = "Запись (Старт / Стоп)" };
            mnuToggle.Click += (s, e) => ToggleDictation();

            MenuItem mnuSettings = new MenuItem { Header = "⚙ Настройки..." };
            mnuSettings.Click += (s, e) => OpenSettings();

            MenuItem mnuResetPos = new MenuItem { Header = "Вернуть в центр экрана" };
            mnuResetPos.Click += (s, e) => {
                double screenW = SystemParameters.PrimaryScreenWidth;
                Left = (screenW - Width) / 2;
                Top = 40;
                SavePosition();
            };

            MenuItem mnuClose = new MenuItem { Header = "✕ Закрыть" };
            mnuClose.Click += (s, e) => this.Close();

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
                        ApplyFeedbackUI("Ошибка связи с мостом", Brushes.Tomato);
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

                            // Restore target window & paste
                            ThreadPool.QueueUserWorkItem(__ => {
                                Thread.Sleep(80);
                                if (lastTargetWindow != IntPtr.Zero) {
                                    SetForegroundWindow(lastTargetWindow);
                                    Thread.Sleep(80);
                                }

                                Dispatcher.Invoke(() => {
                                    Clipboard.SetDataObject(recognizedText, true);
                                });

                                Thread.Sleep(60);
                                SimulateCtrlV();

                                Thread.Sleep(900);
                                Dispatcher.Invoke(() => {
                                    isProcessing = false;
                                    ApplyIdleUI();
                                });
                            });
                        } else {
                            ApplyFeedbackUI("Речь не распознана", new SolidColorBrush(Color.FromRgb(251, 146, 60)));
                            Thread.Sleep(1100);
                            Dispatcher.Invoke(() => {
                                isProcessing = false;
                                ApplyIdleUI();
                            });
                        }
                    });
                } catch (Exception) {
                    Dispatcher.Invoke(() => {
                        isProcessing = false;
                        ApplyFeedbackUI("Ошибка распознавания", Brushes.Tomato);
                        Thread.Sleep(1100);
                        Dispatcher.Invoke(() => ApplyIdleUI());
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
            AnimateCapsuleWidth(156);

            idlePanel.Visibility = Visibility.Visible;
            recPanel.Visibility = Visibility.Collapsed;
            feedbackText.Visibility = Visibility.Collapsed;
            doneButton.Visibility = Visibility.Collapsed;
            cancelButton.Visibility = Visibility.Collapsed;

            // Orb: clean dark circle with white mic
            orbBorder.Background = new SolidColorBrush(Color.FromArgb(255, 42, 42, 48));
            orbBorder.BorderBrush = new SolidColorBrush(Color.FromArgb(50, 255, 255, 255));
            orbGlow.Color = Colors.Transparent;
            orbIconPath.Fill = new SolidColorBrush(Color.FromRgb(225, 225, 230));
            orbIconPath.Data = Geometry.Parse("M12,2 A4,4 0 0,0 8,6 L8,12 A4,4 0 0,0 12,16 A4,4 0 0,0 16,12 L16,6 A4,4 0 0,0 12,2 Z M19,10 L19,12 A7,7 0 0,1 12,19 A7,7 0 0,1 5,12 L5,10 L3,10 L3,12 A9,9 0 0,0 11,20.92 L11,23 L13,23 L13,20.92 A9,9 0 0,0 21,12 L21,10 L19,10 Z");
        }

        private void ApplyRecordingUI() {
            AnimateCapsuleWidth(246);

            idlePanel.Visibility = Visibility.Collapsed;
            recPanel.Visibility = Visibility.Visible;
            feedbackText.Visibility = Visibility.Collapsed;
            doneButton.Visibility = Visibility.Visible;
            cancelButton.Visibility = Visibility.Visible;

            // Orb: Vibrant animated glowing gradient (ChatGPT coral / purple)
            RadialGradientBrush grad = new RadialGradientBrush();
            grad.GradientStops.Add(new GradientStop(Color.FromRgb(239, 68, 68), 0.0));
            grad.GradientStops.Add(new GradientStop(Color.FromRgb(220, 38, 38), 1.0));
            orbBorder.Background = grad;
            orbBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(252, 165, 165));

            orbGlow.Color = Color.FromRgb(239, 68, 68);
            orbGlow.BlurRadius = 10;
        }

        private void ApplyProcessingUI() {
            AnimateCapsuleWidth(200);

            idlePanel.Visibility = Visibility.Collapsed;
            recPanel.Visibility = Visibility.Collapsed;
            doneButton.Visibility = Visibility.Collapsed;
            cancelButton.Visibility = Visibility.Collapsed;

            feedbackText.Text = "Распознавание...";
            feedbackText.Foreground = new SolidColorBrush(Color.FromRgb(192, 132, 252)); // Purple
            feedbackText.Visibility = Visibility.Visible;

            orbGlow.Color = Color.FromRgb(168, 85, 247);
        }

        private void ApplySuccessUI() {
            AnimateCapsuleWidth(180);

            idlePanel.Visibility = Visibility.Collapsed;
            recPanel.Visibility = Visibility.Collapsed;
            doneButton.Visibility = Visibility.Collapsed;
            cancelButton.Visibility = Visibility.Collapsed;

            feedbackText.Text = "✓ Вставлено!";
            feedbackText.Foreground = new SolidColorBrush(Color.FromRgb(74, 222, 128)); // Emerald
            feedbackText.Visibility = Visibility.Visible;

            RadialGradientBrush grad = new RadialGradientBrush();
            grad.GradientStops.Add(new GradientStop(Color.FromRgb(34, 197, 94), 0.0));
            grad.GradientStops.Add(new GradientStop(Color.FromRgb(21, 128, 61), 1.0));
            orbBorder.Background = grad;
            orbBorder.BorderBrush = new SolidColorBrush(Color.FromRgb(134, 239, 172));
            orbGlow.Color = Color.FromRgb(34, 197, 94);
        }

        private void ApplyFeedbackUI(string msg, Brush color) {
            AnimateCapsuleWidth(210);

            idlePanel.Visibility = Visibility.Collapsed;
            recPanel.Visibility = Visibility.Collapsed;
            doneButton.Visibility = Visibility.Collapsed;
            cancelButton.Visibility = Visibility.Collapsed;

            feedbackText.Text = msg;
            feedbackText.Foreground = color;
            feedbackText.Visibility = Visibility.Visible;
        }

        // --- Animations ---
        private void RecordTimer_Tick(object sender, EventArgs e) {
            if (!isRecording) return;
            TimeSpan elapsed = DateTime.Now - recordStartTime;
            timerText.Text = string.Format("{0:D2}:{1:D2}", (int)elapsed.TotalMinutes, elapsed.Seconds);
        }

        private void WaveTimer_Tick(object sender, EventArgs e) {
            if (!isRecording) return;
            wavePhase += 0.3;

            for (int i = 0; i < 4; i++) {
                double val = Math.Sin(wavePhase + i * 1.3);
                double height = 4 + Math.Abs(val) * 11;
                waveBars[i].Height = height;
            }
        }

        // --- Background Service Auto-Manager ---
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

            // Bridge not responding: launch node silently with NO console window
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

        // --- Position Restore & Save ---
        private void RestorePosition() {
            double screenW = SystemParameters.PrimaryScreenWidth;
            double screenH = SystemParameters.PrimaryScreenHeight;

            // Default: Top-center of screen (like Spotlight / Dynamic Island)
            double defaultLeft = (screenW - Width) / 2;
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
                        return; // Single instance
                    }
                    Application app = new Application();
                    app.ShutdownMode = ShutdownMode.OnExplicitShutdown;
                    app.DispatcherUnhandledException += (s, e) => {
                        try {
                            File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "voice_island_crash.log"), e.Exception.ToString());
                        } catch {}
                    };

                    VoiceIslandWindow win = new VoiceIslandWindow();
                    win.Closed += (s, e) => {
                        app.Shutdown();
                    };

                    win.Show();
                    app.Run();
                }
            } catch (Exception ex) {
                try {
                    File.WriteAllText(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "voice_island_crash.log"), ex.ToString());
                } catch {}
            }
        }
    }
}
