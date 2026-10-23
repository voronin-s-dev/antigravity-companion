' Antigravity Companion - Silent Backup Runner (WindowStyle = 0)
Option Explicit

Dim WshShell, FSO, scriptDir, psScript, argsStr, i, cmd, exitCode

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
psScript = FSO.BuildPath(scriptDir, "run_backup.ps1")

argsStr = ""
For i = 0 To WScript.Arguments.Count - 1
    argsStr = argsStr & " """ & WScript.Arguments(i) & """"
Next

cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psScript & """" & argsStr

exitCode = WshShell.Run(cmd, 0, True)
WScript.Quit exitCode
