using System;
using System.Diagnostics;
using System.IO;
using System.Linq;

namespace AntigravityShim
{
    class Program
    {
        static int Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string targetExe = Path.Combine(baseDir, "Antigravity_orig.exe");

            if (!File.Exists(targetExe))
            {
                // Fallback: If orig does not exist, search for Antigravity.exe in subdirs or fail gracefully
                return 1;
            }

            // Detect sub-processes: Chromium renderers, GPU processes, or Node sidecars
            bool isSubProcess = false;
            bool hasPort = false;

            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];
                if (arg.StartsWith("--type=", StringComparison.OrdinalIgnoreCase) ||
                    arg.StartsWith("--import=", StringComparison.OrdinalIgnoreCase))
                {
                    isSubProcess = true;
                }
                if (arg.StartsWith("--remote-debugging-port", StringComparison.OrdinalIgnoreCase))
                {
                    hasPort = true;
                }
            }

            string formattedArgs = FormatArguments(args);
            string finalArgs;

            // Only add --remote-debugging-port=0 to the main browser process
            if (!isSubProcess && !hasPort)
            {
                finalArgs = string.IsNullOrEmpty(formattedArgs)
                    ? "--remote-debugging-port=0"
                    : "--remote-debugging-port=0 " + formattedArgs;
            }
            else
            {
                finalArgs = formattedArgs;
            }

            ProcessStartInfo psi = new ProcessStartInfo(targetExe, finalArgs)
            {
                UseShellExecute = false,
                WorkingDirectory = Environment.CurrentDirectory
            };

            try
            {
                using (Process process = Process.Start(psi))
                {
                    if (process == null) return 1;
                    process.WaitForExit();
                    return process.ExitCode;
                }
            }
            catch
            {
                return 1;
            }
        }

        static string FormatArguments(string[] args)
        {
            if (args == null || args.Length == 0) return string.Empty;

            string[] formatted = new string[args.Length];
            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                if (string.IsNullOrEmpty(a))
                {
                    formatted[i] = "\"\"";
                }
                else if (a.Contains(" ") || a.Contains("\"") || a.Contains("\t"))
                {
                    formatted[i] = "\"" + a.Replace("\"", "\\\"") + "\"";
                }
                else
                {
                    formatted[i] = a;
                }
            }
            return string.Join(" ", formatted);
        }
    }
}
