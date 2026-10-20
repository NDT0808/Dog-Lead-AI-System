---
name: pet-lead-ai-orchestrator
description: Hệ thống AI Automation điều phối khép kín: Quét Follower Facebook, Thẩm định thị giác AI ONNX (dog-model.onnx) với ngưỡng nghiêm ngặt 0.70+ kết hợp từ khóa, Tải bộ sưu tập ảnh đánh số theo FB_ID số, Trực quan hóa Visual Gallery click mở trang cá nhân cho Sếp, Làm giàu dữ liệu người dùng hàng loạt không mở tab (Headless Bulk Enricher), Kiểm thử link và chấm điểm theo phản hồi Sales, Tích hợp Meta RAG và Xuất JSON CRM chuẩn lên server.
---

# Kỹ năng: Pet Lead AI Orchestrator (B2B Pet Leads AI Automation)

> [!IMPORTANT]
> **QUY TRÌNH 3 BƯỚC KHÉP KÍN & ĐÓNG GÓI ĐỘC LẬP (PHIÊN BẢN v2.1):**
> 1. **Bước 1 - Quét Follower + Thị giác AI (dog-model.onnx với Ngưỡng Nghiêm Ngặt 0.70) + Visual Gallery cho Sếp:**
>    - Thu thập Follower/Following từ trang cá nhân & fanpage Facebook qua Chrome Extension V3.
>    - **Bắt buộc 100% Facebook ID là SỐ**: Nhận diện chuẩn xác ID số kể cả với vanity URL dạng chữ như `https://www.facebook.com/Nemay24` $\rightarrow$ bóc tách thành số `100087542196018` qua tham số ảnh `set=pb.100087542196018.-2207520000`, thẻ meta `al:android:url` và `hovercard`.
>    - Chuyển giao sang Python Pipeline nạp mô hình ONNX `dog-model.onnx` (YOLOv8-cls 224x224 RGB, Softmax 3 lớp: `adult_dog`, `non_dog`, `puppy`).
>    - **Ngưỡng thẩm định nghiêm ngặt (Strict Threshold $\ge 0.70$):** Loại bỏ hoàn toàn các trường hợp lọt ảnh mặt người, xe cộ, phong cảnh. Áp dụng nguyên tắc **Avatar Ground Truth** (khi mô hình phát hiện avatar không phải là chó, từ khóa văn bản không được phép đè lên kết quả để phê duyệt).
>    - Tải ảnh tròn sắc nét, lưu theo định dạng `{FB_ID}/{FB_ID}_01.jpg`, `{FB_ID}_02.jpg`...
>    - Web Dashboard hỗ trợ kéo thả tệp JSON, xem trước phân loại thời gian thực và thanh trượt tùy chỉnh ngưỡng từ 0.50 đến 0.85.
> 2. **Bước 2 - Quét & Làm giàu Hồ sơ Hàng loạt Tự động (Headless Bulk Enricher - KHÔNG BẬT TAB):**
>    - Tiếp nhận danh sách link Facebook hàng loạt (dán trực tiếp vào ô văn bản hoặc nhấn 1 nút nạp tự động toàn bộ link từ Bước 1).
>    - Chạy ngầm đa luồng (Headless Multithreading), tuyệt đối không mở từng tab trình duyệt gây phiền toái.
>    - **Bóc tách 3 tầng:**
>      - **Tầng 1 (Facebook About & Posts):** Quét Giới thiệu (About), Bio, Địa chỉ, SĐT, Email, Website ngoài qua `l.facebook.com/l.php?u=`, bài đăng gần nhất.
>      - **Tầng 2 (Official Website Deep Scan):** Tự động quét sâu trang web chính thức (`/about`, `/contact`, `/meet-the-breeder`) để bóc tách **Tên chủ trại / Người đại diện (`owner`)**, form mua cún, giống chó, và link Amazon Storefront.
>      - **Tầng 3 (Google AI Simulator Fallback):** Nếu qua Tầng 1 và 2 mà chưa có Tên chủ trại (`owner`), tự động kích hoạt truy vấn Google AI Overview theo video `Recording 2026-10-19 020236.mp4` để bổ sung Tên chủ trại, SĐT, Bang, City.
>    - Xuất đầy đủ **28 - 30 trường chuẩn Meta CRM** ra file JSON và bảng tính Excel Master (`data/enriched_step2/step2_enriched_crm_latest.xlsx`).
> 3. **Bước 3 - Kiểm thử Link, Chấm điểm Theo Phản Hồi Sales, Meta RAG & Xuất JSON Server:**
>    - Kiểm thử link Facebook & Website sạch, phát hiện redirect sai.
>    - Chấm điểm hoạt động MXH (đăng bài 24h: +15đ, 7 ngày: +10đ, tương tác cao: +10đ).
>    - Tích hợp Meta RAG khớp sản phẩm: Cỏ nhân tạo (Pet Grass), Nhà vệ sinh thú cưng (Pet Potty), Đồ chơi (Pet Toys) & Gói quà Take-Home Kit V2/V3 in logo riêng.

---

## 1. Cơ Chế Thẩm Định AI Thị Giác ONNX Nghiêm Ngặt (Strict Threshold Mode)

### 1.1 Cấu Hình Input/Output Tensor
- File mô hình: `step1_follower_harvester/models/dog-model.onnx`
- Input name: `images` kiểu `float32`, shape `[1, 3, 224, 224]`.
- Chuẩn hóa: Chia giá trị pixel RGB cho `255.0`.
- Output name: `output0` shape `[1, 3]`:
  - Lớp 0: `adult_dog` (Chó trưởng thành)
  - Lớp 1: `non_dog` (Không phải chó: người, phong cảnh, xe, chữ)
  - Lớp 2: `puppy` (Cún con)

### 1.2 Công Thức Phê Duyệt Mới (Ngưỡng Mặc Định $\ge 0.70$)
- Model YOLOv8-cls output trực tiếp xác suất:
  $$P_{\text{dog}} = P_{\text{adult}} + P_{\text{puppy}}$$
- **Điều kiện chấp thuận chó (Strict Dog Criteria):**
  1. $P_{\text{dog}} \ge \text{threshold}$ (mặc định: **0.70**, tùy biến từ 0.50 đến 0.85).
  2. $P_{\text{non\_dog}} < 0.30$ (xác suất không phải chó phải thấp).
  3. $P_{\text{dog}} > 1.4 \times P_{\text{non\_dog}}$ (xác suất chó phải vượt trội rõ rệt).

### 1.3 Cơ Chế Multi-Stage Gatekeeper (Bộ Lọc Đa Tầng Chống Nhận Diện Nhầm)
1. **Lớp 1: Danh sách đen từ khóa phi thú cưng (Negative Business):** Tự động loại bỏ các ngành tuyển dụng, BĐS, gym, mầm non, nails, spa, ăn uống, rượu bia, sim số, mèo...
2. **Lớp 2: Bộ phát hiện khuôn mặt người (Human Face Detection):** Sử dụng OpenCV Haar Cascade. Nếu phát hiện có mặt người $\rightarrow$ **100% LOẠI BỎ KHỎI MỤC TIÊU CHÓ** (bảo vệ tuyệt đối Avatar Ground Truth).
3. **Lớp 3: Bộ phát hiện và loại bỏ mèo (Feline Filter):** Nhận diện khuôn mặt mèo và từ khóa mèo (cat, meow, kitten, mèo) để loại bỏ, không lẫn lộn với cún.
4. **Lớp 4: Bộ lọc sắc thái thực vật (Flora Guard):** Phân tích HSV, loại bỏ ảnh hoa lá thiên nhiên có tỷ lệ màu xanh/tím thực vật cao.
5. **Lớp 5: Thẩm định Tích Hợp ONNX & Từ khóa Cún (Positive Dog Keywords):**
   - Chỉ phê duyệt khi có từ khóa giống chó/chủ trại (`kennel`, `breeder`, `bully`, `corgi`, `poodle`, `puppy`...) kết hợp ảnh đạt chuẩn, hoặc ảnh chó đạt độ tin cậy vượt trội ($P_{\text{adult}} \ge 0.65$, $P_{\text{non}} < 0.20$).

---

## 2. Giao Diện Web Dashboard Hai Chế Độ & Đồng Bộ Sự Kiện (v2.3)

### 2.1 Tab 1: Thẩm Định AI Thị Giác & Khung Live Terminal Console
- Hỗ trợ kéo thả hoặc bấm vào hộp thả tệp để nạp file JSON từ thư mục `data/raw/` hoặc máy tính.
- **Tự động bắt sự kiện (Auto-Catch):** Tự động phát hiện và nạp lô hồ sơ vừa cào mới nhất từ Extension qua URL query param `?autoload=latest&raw_file=...` và `BroadcastChannel`.
- Thanh trượt tùy chỉnh **Độ nhạy phân loại AI (Threshold Slider)** từ 50% đến 85% (mặc định 70%).
- **Khung Live Terminal Console Trực Tiếp:** Tích hợp bảng điều khiển terminal thời gian thực hiển thị chi tiết lý do duyệt/loại bỏ từng hồ sơ đang quét, giúp người dùng kiểm soát và quan sát minh bạch toàn bộ quá trình.
- **Bộ Công Cụ Terminal Python Độc Lập:** `run_step1_interactive.py` và `1_CHAY_LOC_ANH_STEP1.bat` cho phép người dùng chạy lọc trực tiếp trong Terminal PowerShell/CMD với log đầy đủ màu sắc.
- Hiển thị avatar tròn nhỏ sắc nét 56px (`.circle-avatar-box`), nhấp trực tiếp là mở ngay trang cá nhân Facebook.
- Nút bấm **"Chuyển Link Sang Bước 2"** tự động chuyển danh sách sang Tab 2 chỉ với 1 click.
- **Sửa triệt để lỗi "Xóa tệp tạm":** Hàm `clearData()` reset hoàn toàn `isRunning = false`, `isPaused = false`, cập nhật `harvesterState`, gửi `RESET_HARVESTING` xuống `content.js` để nút "Bắt đầu quét" luôn sẵn sàng kích hoạt lại.
- **Khắc phục lỗi KPI âm & Chạy đơn lẻ:** Công thức loại bỏ chuẩn `Math.max(0, total - target)`. Hỗ trợ cả chế độ Server ONNX đa luồng kèm callback tiến độ cho từng avatar lẫn chế độ Client-side fallback chạy vòng quét tuần tự hoạt ảnh cho toàn bộ hồ sơ.
- **Giao diện Song Ngữ (ZH - VI):** Toàn bộ hệ thống (Web Dashboard & Chrome Extension) hiển thị hoặc chuyển đổi tức thì giữa Tiếng Việt và Tiếng Trung, phục vụ xuất sắc đội ngũ tiếp thị đa quốc gia.

### 2.2 Tab 2: Quét Hàng Loạt Làm Giàu Hồ Sơ (Headless Bulk Scanner)
- Ô văn bản dán danh sách link hàng loạt, nút **"📥 Nạp Tự Động Link Từ Bước 1"**, nút **"🧹 Xóa Trắng"**.
- Nút bấm **"🚀 BẮT ĐẦU QUÉT TỰ ĐỘNG LÀM GIÀU HÀNG LOẠT (KHÔNG BẬT TAB)"** kích hoạt tiến trình ngầm đa luồng.
- Bảng Master CRM hiển thị đầy đủ 30 trường: STT, Avatar tròn, Tên chủ trại, Tên doanh nghiệp, FB_ID (số), SĐT, Website, Vị trí, Gói sản phẩm, Điểm tiềm năng & Phân hạng Tier S.
- Xuất file Excel (.xlsx) chuẩn màu Meta CRM và xuất file JSON.
