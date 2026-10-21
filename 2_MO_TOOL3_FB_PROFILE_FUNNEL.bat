@echo off
chcp 65001 >nul
echo ========================================================
echo  🐾 PET LEAD AI - TOOL 3: FB PROFILE FUNNEL & META CRM
echo  Quet tong hop: Intro, Website, Amazon & Xuat Bang CRM
echo ========================================================
echo.

set TOOL3_DIR=%~dp0fb_profile_funnel_scraper
set HTML_FILE=%TOOL3_DIR%\dashboard.html

if exist "%HTML_FILE%" (
    echo Dang khoi dong Google Chrome voi Tool 3 Dashboard...
    start "" chrome "%HTML_FILE%"
) else (
    echo [LOI] Khong tim thay tep: %HTML_FILE%
)

echo.
timeout /t 3 >nul
