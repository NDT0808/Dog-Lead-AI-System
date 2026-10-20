# Quy Tắc Bắt Buộc: Tổ Chức Thư Mục & Tệp Tin (Folder Organization Rule)

## 1. Nguyên Tắc Cốt Lõi
- **Không xả rác vào thư mục gốc**: Tuyệt đối không để lại các file nháp `scratch_*`, `test_*.jpg`, `test_*.png`, `extracted_*.html`, `dump_*.json`, `temp_*` trong thư mục gốc `Marketing_Pet&Grass` hoặc `Pet_Lead_AI_System`.
- **Dọn dẹp tự động sau mỗi tác vụ**: Khi tạo bất kỳ file thử nghiệm nào để kiểm tra, phải lưu vào thư mục `scratch/` của artifact hoặc tự động xóa bỏ hoàn toàn trước khi trả lời người dùng.
- **Tuân thủ đúng cây thư mục chuẩn của Pet_Lead_AI_System**:
  - Chrome Extension chính thức: `Pet_Lead_AI_System/fb_following_scraper/`
  - Giao diện Web SPA: `Pet_Lead_AI_System/web_dashboard/`
  - Bước 1 (AI Filter): `Pet_Lead_AI_System/step1_follower_harvester/`
  - Bước 2 (Google AI + Enrich): `Pet_Lead_AI_System/step2_profile_enricher/`
  - Dữ liệu kết quả: `Pet_Lead_AI_System/data/` (raw, verified_step1, enriched_step2)

## 2. Đồng Bộ Hóa Mã Nguồn
- Mọi cập nhật logic tại `fb_following_scraper/background.js` phải được đồng bộ sang `step1_follower_harvester/extension/background.js`.
- Mọi cập nhật giao diện tại `web_dashboard/dashboard.js` phải được đồng bộ sang `fb_following_scraper/dashboard.js` và `step1_follower_harvester/extension/dashboard.js`.
