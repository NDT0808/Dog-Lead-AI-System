@echo off
cd /d "%~dp0"
title PET LEAD AI - WEB DASHBOARD LAUNCHER

:: 1. Uu tien chon Python san co
set "PY_BIN="
py -3.11 -c "import sys" >nul 2>&1
if not errorlevel 1 (
    set "PY_BIN=py -3.11"
    goto :run
)

if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PY_BIN=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
    goto :run
)

python -c "import sys" >nul 2>&1
if not errorlevel 1 (
    set "PY_BIN=python"
    goto :run
)

py -c "import sys" >nul 2>&1
if not errorlevel 1 (
    set "PY_BIN=py"
    goto :run
)

:: Neu khong tim thay python, mo truc tiep bang trinh duyet mac dinh
echo [!] Khong tim thay Python, dang mo truc tiep bang trinh duyet...
start "" "%~dp0web_dashboard\index.html"
exit /b 0

:run
"%PY_BIN%" web_dashboard\run_server.py
echo.
pause
