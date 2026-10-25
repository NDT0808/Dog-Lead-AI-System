@echo off
chcp 65001 >nul
title 🐾 PET LEAD AI - FB-FS-2 STANDALONE SERVER (NODE.JS WASM)
color 0b

echo =================================================================
echo   🐾 PET LEAD AI — FB-FS-2 STANDALONE SERVER (0%% PYTHON)
echo =================================================================
echo.
echo [*] Đang khởi động Web Server Node.js độc lập...
echo [*] Tự động tải WebAssembly ONNX + Model dog-model.onnx...
echo.

if exist "%~dp0FB-FS-2\server.mjs" (
    cd /d "%~dp0FB-FS-2"
) else (
    cd /d "%~dp0"
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] LỖI: Không tìm thấy Node.js trên máy tính!
    echo Vui lòng cài đặt Node.js từ https://nodejs.org/ để tiếp tục.
    pause
    exit /b
)

node server.mjs
pause
