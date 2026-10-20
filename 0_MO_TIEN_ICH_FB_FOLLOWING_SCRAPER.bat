@echo off
chcp 65001 >nul
title [PET LEAD AI] CÀI ĐẶT TIỆN ÍCH FB FOLLOWING SCRAPER
color 0b

echo ===============================================================================
echo   🐾 PET LEAD AI - HƯỚNG DẪN MỞ TIỆN ÍCH FB FOLLOWING SCRAPER V3.0
echo ===============================================================================
echo.
echo [1] Thư mục tiện ích Chrome nằm tại:
echo     %~dp0fb_following_scraper
echo.
echo [2] Hướng dẫn cài đặt trên trình duyệt (Chrome / Edge / Brave):
echo     - Bước 1: Mở trình duyệt, truy cập: chrome://extensions/
echo     - Bước 2: Bật công tắc "Chế độ dành cho nhà phát triển" (Developer mode)
echo     - Bước 3: Bấm nút "Tải tiện ích đã giải nén" (Load unpacked)
echo     - Bước 4: Chọn thư mục "fb_following_scraper"
echo.
echo ===============================================================================
echo   Đang mở thư mục tiện ích trong Windows Explorer...
explorer "%~dp0fb_following_scraper"
echo.
echo Bấm phím bất kỳ để đóng cửa sổ này...
pause >nul
