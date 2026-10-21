@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PET LEAD AI - DONG GOI CAP NHAT (PATCH ZIP)

echo ===========================================================================
echo       🐾 DONG GOI CAC TEP CODE MOI DE CHUYEN QUA VPS / SERVER 🐾
echo ===========================================================================
echo [*] Dang loc cac tep code, web dashboard, extension...
echo [*] Tu dong loai bo cac tep nang (anh goc, video, du lieu data/raw, .git)
echo.

set "ZIP_NAME=PET_LEAD_CAP_NHAT.zip"
if exist "%ZIP_NAME%" del /f /q "%ZIP_NAME%"

:: Su dung PowerShell Compress-Archive de dong goi nhanh
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$dest = '%~dp0%ZIP_NAME%';" ^
    "$files = Get-ChildItem -Recurse -File | Where-Object { " ^
    "    $_.FullName -notmatch '\\\.git(\\|$)' -and " ^
    "    $_.FullName -notmatch '\\__pycache__(\\|$)' -and " ^
    "    $_.FullName -notmatch '\\\.tempmediaStorage(\\|$)' -and " ^
    "    $_.FullName -notmatch '\\data\\raw\\temp_' -and " ^
    "    $_.FullName -notmatch '\\data\\raw\\extension_storage_' -and " ^
    "    $_.Extension -notmatch '\.(mp4|webm|avi|mov)$' -and " ^
    "    $_.Name -ne '%ZIP_NAME%' " ^
    "};" ^
    "Write-Host 'Dang nen' $files.Count 'tep code vao:' $dest '...';" ^
    "Compress-Archive -Path $files.FullName -DestinationPath $dest -Force;"

if exist "%ZIP_NAME%" (
    echo.
    echo ===========================================================================
    echo [OK] DA DONG GOI THANH CONG FILE: %ZIP_NAME%
    echo [*] Dung luong file zip rat nhe!
    echo.
    echo HUONG DAN DUA SANG VPS (CHUA DAY 5 GIAY):
    echo  1. Copy file "%ZIP_NAME%" (ngay tai thu muc nay)
    echo  2. Sang man hinh Remote Desktop (VPS), Paste vao: C:\TRIHO\003\Pet_Lead_AI_System
    echo  3. Chuot phai vao file zip -> Chon "Extract All..." (Giai nen de len)
    echo ===========================================================================
) else (
    echo [!] Co loi xay ra khi tao file zip.
)

echo.
pause
