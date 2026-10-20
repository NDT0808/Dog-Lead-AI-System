@echo off
cd /d "%~dp0"
title PET LEAD AI - WEB DASHBOARD LAUNCHER

:: 1. Uu tien chay bang Python 3.11 san co
py -3.11 -c "import sys" >nul 2>&1
if not errorlevel 1 (
    py -3.11 web_dashboard\run_server.py
    goto :end
)

if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" web_dashboard\run_server.py
    goto :end
)

python -c "import sys" >nul 2>&1
if not errorlevel 1 (
    python web_dashboard\run_server.py
    goto :end
)

py -c "import sys" >nul 2>&1
if not errorlevel 1 (
    py web_dashboard\run_server.py
    goto :end
)

echo.
echo ========================================================
echo [!] Khong tim thay Python tren he thong!
echo Vui long cai dat Python 3.10 hoac 3.11 de su dung AI.
echo Dang mo truc tiep giao dien bang trinh duyet mac dinh...
echo ========================================================
echo.
start "" "%~dp0web_dashboard\index.html"

:end
echo.
pause
