---
name: workspace-file-structure-organizer
description: Kỹ năng chuẩn hóa và duy trì cấu trúc thư mục, tệp tin dự án Pet_Lead_AI_System. Hướng dẫn phân vùng các thành phần Step 1, Step 2, Web Dashboard, Chrome Extension, Datasets, Models, và tự động dọn dẹp các tệp tin tạm (scratch, test, dump) để giữ cây thư mục luôn sạch đẹp, ngăn nắp.
---

# Kỹ năng: Workspace & Project File Structure Organizer

## 1. Nguyên Tắc Cốt Lõi Về Tổ Chức Thư Mục

Mọi file được tạo ra hoặc chỉnh sửa trong dự án `Marketing_Pet&Grass` và `Pet_Lead_AI_System` bắt buộc phải tuân theo các quy tắc cấu trúc sau:

1. **Tuyệt đối KHÔNG xả rác vào thư mục gốc (`root`)**:
   - Không lưu ảnh test (`test_*.jpg`, `scratch_*.png`), file HTML cào thử (`extracted_*.html`, `scratch_*.html`), file text nháp (`scratch_*.txt`), file python thử nghiệm vào thư mục gốc.
   - Nếu cần kiểm tra thử nghiệm, lưu vào thư mục `tests/` hoặc thư mục `scratch/` bên trong artifact và tự động xóa sau khi kiểm thử xong.

2. **Cấu trúc phân vùng chuẩn của `Pet_Lead_AI_System`**:
   ```
   Pet_Lead_AI_System/
   ├── 0_MO_TIEN_ICH_FB_FOLLOWING_SCRAPER.bat   # Phím tắt mở extension Chrome
   ├── 1_CHAY_LOC_ANH_STEP1.bat                 # Phím tắt chạy Lọc AI Bước 1
   ├── 2_CHAY_LAM_GIAU_HO_SO_STEP2.bat          # Phím tắt chạy Làm giàu hồ sơ Bước 2
   ├── CHAY_GIAO_DIEN_WEB.bat                   # Phím tắt mở Web Dashboard + Server Port 8000
   ├── CAI_DAT_TU_KHOI_DONG_CUNG_WINDOWS.bat    # Cài đặt tự khởi động Python cùng Windows
   ├── GO_BO_TU_KHOI_DONG.bat                   # Gỡ bỏ tự khởi động
   ├── PLAN.md                                  # Bản kế hoạch kiến trúc hệ thống
   ├── README.md                                # Hướng dẫn sử dụng tổng quan
   ├── requirements.txt                         # Thư viện Python phụ thuộc
   │
   ├── fb_following_scraper/                    # CHROME EXTENSION (BẢN SẢN XUẤT CHÍNH THỨC)
   │   ├── manifest.json                        # Manifest V3
   │   ├── background.js                        # Service Worker (Dual-Tab Google AI + Queue)
   │   ├── content.js                           # Content script cào FB & Bridge Dashboard
   │   ├── dashboard.html / dashboard.js        # Giao diện CRM Extension
   │   └── popup.html / popup.js                # Menu popup tiện ích
   │
   ├── step1_follower_harvester/                # BƯỚC 1: THẨM ĐỊNH AI THỊ GIÁC & TỪ KHÓA
   │   ├── models/dog-model.onnx                # Mô hình YOLOv8-cls phân loại chó
   │   ├── python_pipeline/                     # Multi-Stage Gatekeeper, Face Filter, NLP
   │   └── gallery/                             # Thư viện ảnh cún cưng
   │
   ├── step2_profile_enricher/                  # BƯỚC 2: LÀM GIÀU HỒ SƠ GOOGLE AI
   │   ├── python_pipeline/google_ai_fallback.py# Bóc tách cấu trúc 12 trường Google AI
   │   └── python_pipeline/hybrid_profile_merger.py # RAG Merger 30 trường Meta CRM
   │
   ├── web_dashboard/                           # GIAO DIỆN WEB TRỰC QUAN (127.0.0.1:8000)
   │   ├── index.html                           # Single-Page Application Dashboard
   │   ├── dashboard.js                         # Core Logic, RAG Deduplication, Event Bridge
   │   ├── styles.css                           # CSS hệ thống thiết kế Dark/Glassmorphism
   │   └── run_server.py                        # Web server Python Port 8000 & API Endpoints
   │
   ├── data/                                    # DỮ LIỆU ĐẦU VÀO & XUẤT BẢN
   │   ├── raw/                                 # Dữ liệu JSON cào thô từ Facebook
   │   ├── verified_step1/                      # Hồ sơ đã lọc đạt chuẩn Bước 1 (JSON + Excel)
   │   └── enriched_step2/                      # Hồ sơ đã làm giàu hoàn chỉnh (JSON + Excel)
   │
   └── .agents/skills/                          # TẬP KỸ NĂNG TỰ ĐỘNG CỦA AGENT
       ├── step2-dual-tab-google-ai-enricher/   # Kỹ năng quét 2-Tab Google AI + RAG Queue
       └── workspace-file-structure-organizer/  # Kỹ năng tổ chức thư mục & dọn dẹp
   ```

3. **Nguyên tắc Đồng Bộ Hóa Mã Nguồn (Code Synchronization)**:
   - Hai file quan trọng `background.js` và `dashboard.js` có các bản sao phục vụ chạy độc lập từ Web `127.0.0.1:8000` và Extension `chrome-extension://...`.
   - Mỗi khi chỉnh sửa `fb_following_scraper/background.js`, bắt buộc phải đồng bộ sang:
     `step1_follower_harvester/extension/background.js`.
   - Mỗi khi chỉnh sửa `web_dashboard/dashboard.js`, bắt buộc phải đồng bộ sang:
     `fb_following_scraper/dashboard.js` và `step1_follower_harvester/extension/dashboard.js`.

---

## 2. Quy Trình Dọn Dẹp Định Kỳ (Auto Cleanup Routine)

Mỗi khi thực hiện nhiệm vụ hoặc trước khi hoàn tất phản hồi người dùng, chạy quy trình kiểm tra và xóa bỏ:
- Xóa các file có tiền tố `scratch_*`
- Xóa các file `test_*.jpg`, `test_*.png`
- Xóa các file HTML cào thử `extracted_*.html`
- Xóa các thư mục frame tạm `scratch_frames*`, `video_frames`
- Giữ lại đúng các tệp tin cấu trúc lõi trong cây thư mục chuẩn.
