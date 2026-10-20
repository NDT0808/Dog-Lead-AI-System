@echo off
title GO BO TU KHOI DONG - PET LEAD AI
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_FILE=%STARTUP_DIR%\PetLeadAi_AutoServer.vbs"

if exist "%VBS_FILE%" (
    del /f /q "%VBS_FILE%"
    echo [OK] Da go bo khoi dong cung Windows thanh cong.
) else (
    echo [!] Chua cai dat khoi dong cung Windows truoc do.
)
pause
