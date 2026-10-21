@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PET LEAD AI - DONG BO CAP NHAT TU GITHUB

echo ===========================================================================
echo       🐾 DONG BO CAP NHAT CODE MOI TU GITHUB VE SERVER / VPS 🐾
echo ===========================================================================
echo Repo: https://github.com/NDT0808/Dog-Lead-AI-System
echo.
echo [*] Dang kiem tra va tai cac tep moi nhat tu GitHub...
echo.

git pull origin main

if errorlevel 1 (
    echo.
    echo [!] CO THE CO XUNG DOT (CONFLICT) HOAC LOI KET NOI MANG.
    echo Dang thu dat lai de dong bo nguyen ven tu GitHub...
    git fetch origin main
    git reset --hard origin/main
    echo [*] Da dong bo thanh cong theo ban moi nhat tren GitHub!
) else (
    echo.
    echo [*] CAP NHAT THANH CONG! CAC TEP MOI DA SAN SANG.
)

echo.
echo ===========================================================================
echo Nhan phim bat ky de dong cua so nay...
pause >nul
