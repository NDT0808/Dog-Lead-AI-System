# 🐾 PET LEAD AI AUTOMATION SYSTEM
### Hệ Thống Tự Động Hóa AI Bóc Tách Khách Hàng Tiềm Năng B2B (Cỏ Nhân Tạo, Nhà Vệ Sinh Thú Cưng, Đồ Chơi & Puppy Starter Kit V2/V3)

---

## 🌟 TỔNG QUAN HỆ THỐNG

**Pet_Lead_AI_System** là một gói giải pháp độc lập, khép kín, được thiết kế chuyên biệt phục vụ chiến dịch tiếp cận 20.000 trại chó & người nhân giống tại Hoa Kỳ. Hệ thống giải quyết trọn vẹn 3 bài toán lớn:
1. **Thu thập & Thẩm định AI:** Quét toàn bộ Followers/Following Facebook, dùng mô hình thị giác máy tính ONNX `dog-model.onnx` (YOLOv8-cls 224x224 RGB) kết hợp 200+ từ khóa để thẩm định chính xác đối tượng nuôi/bán chó.
2. **Bộ sưu tập ảnh & Trực quan hóa cho Lãnh đạo:** Tự động tải ảnh lưu trữ theo mã `{FB_ID}/{FB_ID}_XX.jpg`, sinh trang **Dog Visual Gallery** cho phép Sếp xem thư viện ảnh chú cún và chỉ cần click vào ảnh là mở ngay trang cá nhân của khách hàng.
3. **Làm giàu dữ liệu, Kiểm thử & Đẩy lên Server Web:** Khắc phục toàn diện các lỗi phản ánh từ đội Sales (sửa lỗi link Facebook redirect, lấy tên khách hàng khi không có website, kiểm tra link sống/chết, chấm điểm tương tác MXH), áp dụng mô hình Meta RAG và xuất tệp JSON chuẩn đồng bộ trực tiếp lên hệ thống Web CRM `http://43.156.237.143:3007/`.

---

## 📁 CẤU TRÚC THƯ MỤC DỰ ÁN ĐỘC LẬP

```
Pet_Lead_AI_System/
├── README.md                      # Hướng dẫn tổng thể & Vận hành
├── PLAN.md                        # Lộ trình triển khai & Kế hoạch từng bước
├── AGENTS.md                      # Đặc tả kiến trúc Multi-Agent
├── requirements.txt               # Thư viện phụ thuộc Python
├── docs/                          # Tài liệu kỹ thuật chuyên sâu
│   ├── SALES_FEEDBACK_FIXES.md    # Phân tích & Giải pháp khắc phục phản hồi Sales
│   ├── LEAD_SCORING_CRITERIA.md   # Tiêu chí chấm điểm kit-dogv3 & Pet Potty/Toys
│   └── RAG_ARCHITECTURE.md        # Kiến trúc Meta RAG & Product-Fit Matching
├── skills/
│   └── pet-lead-ai-orchestrator/  # Skill Antigravity điều phối tổng thể
│       └── SKILL.md
├── step1_follower_harvester/      # BƯỚC 1: Quét Follower + AI Vision + Gallery cho Sếp
│   ├── extension/                 # Chrome Extension V3 bóc tách Follower/Following
│   │   ├── manifest.json
│   │   ├── popup.html
│   │   ├── popup.js
│   │   ├── content.js
│   │   └── background.js
│   ├── models/                    # Mô hình AI ONNX
│   │   └── dog-model.onnx         # 224x224 RGB YOLOv8n-cls
│   ├── python_pipeline/           # Pipeline xử lý AI bằng Python
│   │   ├── ai_vision_filter.py    # Phân tích Softmax + Từ khóa + Checkpoint
│   │   ├── download_collections.py# Tải ảnh đánh số theo FB_ID
│   │   └── generate_gallery.py    # Sinh trang Gallery tương tác cho Sếp
│   └── gallery/                   # Giao diện Gallery ảnh cún click mở Facebook
│       └── dog-gallery.html
├── step2_profile_enricher/        # BƯỚC 2: Bóc tách hồ sơ chi tiết (Cào / Giả lập)
├── step3_verifier_and_rag/        # BƯỚC 3: Kiểm thử link, Chấm điểm & RAG CRM JSON
├── web_ui_server/                 # BƯỚC 4: Giao diện Web All-in-One cắm Server 1 click
└── tests/                         # Bộ kiểm thử tự động (Unit & Integration tests)
    └── test_step1.py
```

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT & CHẠY BƯỚC 1 (STEP 1)

### 1. Cài đặt môi trường Python
```bash
pip install -r requirements.txt
```

### 2. Sử dụng Chrome Extension thu thập Followers / Following
1. Mở Chrome, truy cập `chrome://extensions/`.
2. Bật **Developer mode** (Chế độ nhà phát triển) ở góc trên bên phải.
3. Chọn **Load unpacked** (Tải tiện ích đã giải nén) và trỏ tới thư mục:
   `c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System\step1_follower_harvester\extension`
4. Mở trang Facebook cá nhân hoặc fanpage mục tiêu (ví dụ tab Followers hoặc Following).
5. Nhấp biểu tượng Extension, bấm **▶ Bắt đầu quét**. Khi thu thập xong bấm **📥 Xuất dữ liệu cho Python Pipeline (JSON)**.

### 3. Chạy Python Pipeline Thẩm định AI Vision & Tải ảnh theo FB_ID
```bash
python step1_follower_harvester/python_pipeline/ai_vision_filter.py --input "path/to/exported_followers.json"
```

### 4. Mở Dog Visual Gallery cho Sếp
Mở file sau trên trình duyệt:
`step1_follower_harvester/gallery/dog-gallery.html`
- Xem thư viện ảnh chó phân loại rõ ràng theo từng Breeder / Khách hàng.
- Click trực tiếp vào ảnh hoặc nút "Mở trang Facebook" để nhảy chính xác tới trang cá nhân của người dùng.
