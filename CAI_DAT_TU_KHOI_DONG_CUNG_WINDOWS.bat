@echo off
cd /d "%~dp0"
title CAI DAT TU KHOI DONG PYTHON SERVER - PET LEAD AI
echo =================================================================
echo   CAI DAT TU DONG KHOI DONG MAY CHU PYTHON SERVER (PORT 8000)
echo =================================================================
echo.

set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "VBS_FILE=%STARTUP_DIR%\PetLeadAi_AutoServer.vbs"
set "SERVER_SCRIPT=%~dp0web_dashboard\run_server.py"

echo Dang tao file khoi dong ngam tai:
echo %VBS_FILE%
echo.

(
echo Set WshShell = CreateObject("WScript.Shell"^)
echo WshShell.CurrentDirectory = "%~dp0"
echo WshShell.Run "pythonw """ ^& "%SERVER_SCRIPT%" ^& """", 0, False
) > "%VBS_FILE%"

echo [OK] DA CAI DAT THANH CONG!
echo.
echo Tu nay tro di:
echo - Moi khi ban bat may tinh hoac khoi dong lai Windows,
echo   may chu Python Port 8000 se TU DONG CHAY NGAM san sang 24/7.
echo - Extension va Web Dashboard se luon ket noi on dinh, khong bi mat nua!
echo.
echo =================================================================
pause
