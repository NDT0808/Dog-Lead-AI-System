@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PET LEAD AI - GIAO DIEN WEB TRUC QUAN

echo ===========================================================================
echo       PET LEAD AI - GIAO DIEN WEB TRUC QUAN (WEB DASHBOARD)
echo ===========================================================================
echo [*] Thu muc: "%~dp0"
echo [*] Dang khoi chay may chu Python backend tren cong 8000...
echo [*] Trinh duyet se tu dong mo tai: http://127.0.0.1:8000/index.html
echo [*] Vui long GIU NGUYEN cua so nay (khong tat) trong khi su dung!
echo ===========================================================================
echo.

:: 1. Uu tien chay bang py -3.11
py -3.11 -c "import sys" >nul 2>&1
if not errorlevel 1 (
    py -3.11 "%~dp0web_dashboard\run_server.py"
    goto :end
)

:: 2. Uu tien Python 3.11 trong LocalAppData
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" "%~dp0web_dashboard\run_server.py"
    goto :end
)

:: 3. Chay bang python mac dinh
python -c "import sys" >nul 2>&1
if not errorlevel 1 (
    python "%~dp0web_dashboard\run_server.py"
    goto :end
)

:: 4. Chay bang py mac dinh
py -c "import sys" >nul 2>&1
if not errorlevel 1 (
    py "%~dp0web_dashboard\run_server.py"
    goto :end
)

echo.
echo ===========================================================================
echo [!] KHONG TIM THAY PYTHON TREN HE THONG!
echo Vui long cai dat Python 3.10 hoac 3.11 de chay may chu backend.
echo Dang mo giao dien HTML truc tiep...
echo ===========================================================================
echo.
start "" "%~dp0web_dashboard\index.html"

:end
echo.
echo [!] May chu da dung lai. Nhan phim bat ky de dong cua so.
pause
