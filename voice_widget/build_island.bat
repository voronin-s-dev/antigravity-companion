@echo off
setlocal
echo [Voice Island] Building WPF binary...

set CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" (
    echo [ERROR] csc.exe not found at: %CSC%
    exit /b 1
)

set WPF_DIR=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF
set NET_DIR=C:\Windows\Microsoft.NET\Framework64\v4.0.30319

"%CSC%" /target:winexe /optimize /nowarn:0168,0219 /out:"%~dp0voice_island.exe" /r:"%WPF_DIR%\PresentationFramework.dll" /r:"%WPF_DIR%\PresentationCore.dll" /r:"%WPF_DIR%\WindowsBase.dll" /r:"%NET_DIR%\System.Xaml.dll" "%~dp0voice_island.cs"

if %ERRORLEVEL% equ 0 (
    echo [OK] voice_island.exe built successfully!
    exit /b 0
) else (
    echo [ERROR] Compilation failed!
    exit /b %ERRORLEVEL%
)
