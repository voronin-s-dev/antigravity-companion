Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
psExe = WshShell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"
WshShell.Run """" & psExe & """ -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & scriptDir & "\launch_antigravity.ps1""", 0, False
