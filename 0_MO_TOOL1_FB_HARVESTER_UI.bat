@echo off
chcp 65001 >nul
echo ========================================================
echo  🐾 PET LEAD AI - TOOL 1: FB MULTI-LINK HARVESTER
echo  Mo Giao Dien Trắng (Light Mode) Song Ngu Viet - Trung
echo ========================================================
echo.

set EXT_DIR=%~dp0fb_following_scraper
set HTML_FILE=%EXT_DIR%\harvester_dashboard.html

if exist "%HTML_FILE%" (
    echo Dang khoi dong Google Chrome voi Tool 1 Dashboard...
    start "" chrome "%HTML_FILE%"
) else (
    echo [LOI] Khong tim thay tep: %HTML_FILE%
)

echo.
echo Ban co the dan nhieu link Facebook vao giao dien va bat dau cao!
timeout /t 3 >nul
