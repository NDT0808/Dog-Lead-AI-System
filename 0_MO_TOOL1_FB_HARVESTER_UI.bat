@echo off
chcp 65001 >nul
title 🐾 PET LEAD AI - TOOL 1: FB FOLLOWER HARVESTER (STANDALONE UI)
color 0b

echo =================================================================
echo  🐾 PET LEAD AI - TOOL 1: FB FOLLOWER HARVESTER (STANDALONE)
echo  Giao Diện Thu Thập Follower Facebook Độc Lập (0%% Extension Local)
echo =================================================================
echo.
echo [*] Dang mo Giao Dien Cao Follower doc lap tren trinh duyet...
echo [*] Link Web: http://localhost:8000/harvester.html (hoac tren Server)
echo.

set STANDALONE_HTML=%~dp0FB-FS-2\harvester.html
if exist "%STANDALONE_HTML%" (
    start "" "%STANDALONE_HTML%"
) else (
    start "" "http://localhost:8000/harvester.html"
)

echo [✓] Da mo giao dien thanh cong!
echo Ban co the dan link Facebook truc tiep va chon Cao tren Server (Apify style)
echo ma KHONG CAN cai dat bat ky tien ich extension nao tren may local!
echo.
timeout /t 3 >nul
