# 🔍 STEP 2: PROFILE DATA ENRICHER (LÀM GIÀU HỒ SƠ ĐA TẦNG)

Module Step 2 chịu trách nhiệm bóc tách toàn bộ thông tin chi tiết của người dùng / trại chó, giải quyết dứt điểm các lỗi trong `Feedback 20261017.docx` (Tên khách hàng, Tên chủ trại `owner`, Website, SĐT, Địa chỉ, Danh mục Amazon).

---

## 🏗️ QUY TRÌNH 3 TẦNG KẾT HỢP (HYBRID 3-TIER PIPELINE)

1. **Tầng 1 (Cào Facebook About & Contact):**
   - Truy cập trang cá nhân / Fanpage Facebook từ link đã được duyệt ở Bước 1.
   - Bóc tách phần Giới thiệu: Bio, Tên trang, SĐT, Email, Website ngoài, Địa chỉ.
2. **Tầng 2 (Quét sâu Website chính thức để tìm Tên chủ trại):**
   - Nếu tìm thấy link Website, tự động truy cập các trang con: `/about`, `/contact`, `/meet-the-breeder`, `/puppy-application`.
   - Tìm chính xác **Tên chủ trại / Người đại diện (`owner`)**, form mua cún, và giống chó.
3. **Tầng 3 (Giả lập Google AI Search / Gemini Overview - Fallback theo Video):**
   - NẾU qua Tầng 1 và 2 mà trường `owner` (Tên chủ trại) vẫn bị thiếu hoặc thông tin còn trống:
   - Tự động kích hoạt cơ chế giả lập truy vấn Google AI theo video `Recording 2026-10-19 020236.mp4`.
   - Câu lệnh: `"{fb_url} 名字 全名 用户社交 工作职位 国家地址 行业 添加日期 公司名称 公司网址 公司社交 公司所属国家 州 城市 公司所在行业 电话 hãy tìm và dịch ra tiếng việt giúp tôi"`.
   - Bóc tách: Tên chủ trại / Doanh nghiệp, SĐT, Website, Bang, City, Zip, Amazon.
4. **Bộ hợp nhất thông minh (`hybrid_profile_merger.py`):**
   - Chuẩn hóa 100% về cấu trúc 28-30 trường dữ liệu theo đúng Data Contract của Server Web CRM.

---

## 🚀 HƯỚNG DẪN VẬN HÀNH (DÀNH CHO NGƯỜI DÙNG KHÔNG RÀNH KỸ THUẬT)

### Cách 1: Chạy 1-Click tự động trên Windows (Khuyên dùng)
- Chỉ cần **Click đúp chuột** vào tệp:
  [`2_CHAY_LAM_GIAU_HO_SO_STEP2.bat`](file:///c:/Users/ASUS/Downloads/Marketing_Pet&Grass/Pet_Lead_AI_System/2_CHAY_LAM_GIAU_HO_SO_STEP2.bat)
- Tool sẽ tự động tìm tệp kết quả từ Bước 1 (`step1_verified_dogs_*.json`), chạy quy trình 3 tầng và xuất tệp hồ sơ hoàn chỉnh. Không cần gõ bất kỳ câu lệnh nào!

### Cách 2: Sử dụng Extension trên Chrome
- Cài Extension tại: `step2_profile_enricher/extension` vào Chrome.
- Mở trang Facebook cần bóc tách, nhấp icon tiện ích và bấm **"▶ Bóc tách thông tin trang này"**.
