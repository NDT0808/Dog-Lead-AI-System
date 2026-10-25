@echo off
chcp 65001 >nul
title 🐾 PET LEAD AI - FB-FS-2 STANDALONE SERVER (NODE.JS + PUPPETEER)
color 0b

echo =================================================================
echo   🐾 PET LEAD AI — FB-FS-2 STANDALONE SERVER (0%% PYTHON)
echo   Headless Scraper + Cookie Facebook + WebAssembly ONNX Model
echo =================================================================
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] LỖI: Không tìm thấy Node.js trên máy tính!
    echo Vui lòng cài đặt Node.js từ https://nodejs.org/ để tiếp tục.
    pause
    exit /b
)

set PORT_ARG=%1
if "%PORT_ARG%"=="" set PORT_ARG=8001

echo [*] Đang khởi động Server trên cổng %PORT_ARG%...
node server.mjs %PORT_ARG%
pause
