@echo off
chcp 65001 > nul
title 🐾 XUẤT 500 KHÁCH HÀNG TIỀM NĂNG CHUẨN SNOV.IO (KHỬ TRÙNG 100%%)
cls
echo ==============================================================================
echo    🐾 PET LEAD AI — CÔNG CỤ TỰ ĐỘNG XUẤT 500 LEADS CHUẨN SNOV.IO
echo    - Tự động kiểm tra loại trừ 100%% email và ID Facebook đã từng gửi
echo    - Chỉ lấy khách hàng tiềm năng có Gmail / Business Email thực
echo    - Tự động điền đủ 20 cột chuẩn và chia nhỏ 25 file (20 khách/file)
echo ==============================================================================
echo.

python tools\export_snov_batches.py 500

echo.
echo ==============================================================================
echo [✓] ĐÃ HOÀN TẤT! Bạn có thể vào thư mục data\snov_batches_* để lấy các file Excel.
echo ==============================================================================
pause
