@echo off
chcp 65001 >nul
echo ========================================================
echo  🐾 PET LEAD AI - TOOL 1: FB MULTI-LINK HARVESTER
echo  Mo Giao Dien Trắng (Light Mode) Song Ngu Viet - Trung
echo ========================================================
echo.

set EXT_ID=feemmahkfnimfhpghjajmhbiphfkepnk
set EXT_URL=chrome-extension://%EXT_ID%/harvester_dashboard.html
set LOCAL_HTML=%~dp0fb_following_scraper\harvester_dashboard.html

echo Dang mo giao dien Tool 1 tren Google Chrome...
start "" chrome "%EXT_URL%"

echo.
echo ========================================================
echo  LƯU Ý QUAN TRỌNG:
echo  1. Neu Chrome bao "Khong tim thay", hay vao: chrome://extensions/
echo     va an nut "Tai lai" (🔄) de Chrome nhan Extension.
echo  2. Hoac ban co the bam thang vao bieu tuong Extension tren Chrome
echo     roi chon "📋 Mo Bang Cao Da Link (Tool 1 UI Trang)".
echo ========================================================
echo.
timeout /t 3 >nul
