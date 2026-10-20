---
name: fb-gooddog-follower-funnel-scraper
description: Kỹ năng quét toàn bộ người theo dõi / đang theo dõi từ trang cá nhân Facebook (Personal Profile Followers & Following) & Fanpage, chuyển giao dữ liệu sang Python chạy mô hình AI thị giác YOLOv8-cls (dog-model.onnx 224x224 RGB) kết hợp từ khóa nhận diện chó, bóc tách bộ sưu tập ảnh và tải ảnh đánh số theo FB_ID, xuất kết quả Excel & JSON LEAD-US chuẩn Meta RAG.
---

# Kỹ năng: Facebook Personal Profile Follower Scraper & Python AI Dog Vision Funnel

> [!IMPORTANT]
> **MỤC TIÊU CỐT LÕI & QUY TRÌNH 4 BƯỚC KHÉP KÍN:**
> 1. **Bước 1 - Quét Người theo dõi & Đang theo dõi (Personal Profile Followers & Following)**:
>    - Tiện ích mở rộng `fb_following_scraper` tự động nhận diện và quét mượt mà cả danh sách **Người theo dõi** (`/followers`, `?sk=followers`) và **Đang theo dõi** (`/following`, `?sk=following`) của bất kỳ **Trang cá nhân (Personal Profile)** hoặc Fanpage nào.
>    - Tự động phát hiện vùng cuộn: hỗ trợ cả cuộn toàn trang (`window`) và cuộn hộp thoại popup (`div[role="dialog"]`).
>    - Thu thập toàn diện: Họ tên, Profile URL, Numeric FB_ID, URL Avatar chất lượng cao, Subtitle/Bio, và danh sách link ảnh ban đầu.
> 2. **Bước 2 - Python Pipeline nạp mô hình AI thị giác & Từ khóa thẩm định**:
>    - Tệp Python chuyên trách (`fb_profile_dog_pipeline.py`) nạp trực tiếp `dog-model.onnx` qua `onnxruntime`.
>    - Tiền xử lý ảnh chuẩn `[1, 3, 224, 224]` Float32 RGB, tính toán xác suất Softmax 3 lớp: `adult_dog` (Lớp 0), `non_dog` (Lớp 1), `puppy` (Lớp 2).
>    - Phân tích từ khóa với 200+ giống chó và thuật ngữ breeder theo quy tắc ranh giới từ nguyên (Word Boundary Regex).
> 3. **Bước 3 - Bóc tách bộ sưu tập ảnh & Đánh số lưu trữ theo FB_ID**:
>    - Bóc tách bộ sưu tập ảnh (Photo Collection) của đối tượng được xác định là mục tiêu chó/thú cưng.
>    - Tự động tải và tổ chức thư mục ảnh theo định dạng chuẩn: `downloaded_collections/{FB_ID}/{FB_ID}_01.jpg`, `{FB_ID}_02.jpg`, `{FB_ID}_03.jpg`...
>    - Lưu lại metadata chi tiết của từng ảnh và đường dẫn tệp cục bộ trên máy.
> 4. **Bước 4 - Xuất báo cáo kết quả hoàn chỉnh**:
>    - Xuất file **Excel (.xlsx)** định dạng chuyên nghiệp: FB_ID, Tên, Link Profile, Phương thức nhận diện, Độ tin cậy AI, Danh sách link ảnh bộ sưu tập, Đường dẫn ảnh cục bộ, Phân hạng tiềm năng.
>    - Xuất file **JSON LEAD-US chuẩn Meta RAG** đồng bộ với hệ sinh thái CRM Pet & Grass.

---

## 1. Cơ Chế Nhận Diện & Cuộn Quét Trang Cá Nhân Facebook

### 1.1 Các Định Dạng URL Trang Cá Nhân Được Hỗ Trợ
- Người theo dõi:
  - `https://www.facebook.com/{username}/followers`
  - `https://www.facebook.com/profile.php?id={numeric_id}&sk=followers`
- Đang theo dõi:
  - `https://www.facebook.com/{username}/following`
  - `https://www.facebook.com/profile.php?id={numeric_id}&sk=following`
- Bạn bè / Bạn chung (Friends / Mutual Friends):
  - `https://www.facebook.com/{username}/friends`
  - `https://www.facebook.com/{username}/friends_mutual`
- Hộp thoại popup danh sách: Khi nhấp vào số người theo dõi trên trang cá nhân, Facebook hiển thị hộp thoại `div[role="dialog"]`.

### 1.2 Chiến Lược Cuộn & Bóc Tách DOM Chống Rác Hệ Thống (Anti-Noise DOM Scoper)
1. **Khoanh vùng Container Cào Nghiêm ngặt (Strict Scope Container):**
   - **Ưu tiên 1 (Popup Modal):** Nếu xuất hiện `div[role="dialog"]`, chỉ tìm kiếm thẻ người theo dõi bên trong modal này và cuộn bên trong phần tử có `overflow-y: auto`.
   - **Ưu tiên 2 (Trang Tab Riêng):** Nếu quét trên tab `/followers` hoặc `/following`, chỉ tìm kiếm trong `div[role="main"]`.
   - **LOẠI TRỪ TRIỆT ĐỂ (Exclusion Zone):** Tuyệt đối bỏ qua mọi phần tử thuộc hoặc nằm bên trong:
     * `div[role="navigation"]` (Menu điều hướng bên trái).
     * `div[role="banner"]` hoặc `header` (Thanh công cụ trên cùng).
     * `div[data-pagelet="LeftRail"]`, `div[data-pagelet="RightRail"]`.
     * `div[aria-label*="Stories"]`, `div[aria-label*="Tin"]`.
2. **Bộ lọc Loại trừ 4 Lớp Chống Rác (Multi-Surface Exclusion):**
   - **URL Filter:** Bỏ qua URL không thuộc Facebook hoặc chứa: `/onthisday`, `/saved`, `/ad_campaign`, `/ads`, `/stories`, `/posts/`, `/permalink`, `/watch`, `/gaming`, `/marketplace`, `/events`.
   - **Label & Time Filter:** Bỏ qua tên giao diện: `Kỷ niệm`, `Đã lưu`, `Bảng feed`, `Trình quản lý quảng cáo`, `Tạo tin`, `Được tài trợ`, `Sponsored`, và chuỗi thời gian bài viết `^\d+\s*(giờ|phút|ngày|hrs|mins|days)$`.
   - **Self-Viewer Profile Filter:** Tự động phát hiện ID và Tên tài khoản cá nhân đang đăng nhập của người quét để loại trừ 100%, không bao giờ cào nhầm chính mình!
   - **Host Profile Filter:** Bỏ qua chính tài khoản/fanpage đang xem.
3. **Bóc tách Thẻ Follower Đa Trường (Rich Follower Card):**
   - `name`: Tên thực thể / người dùng hiển thị sạch.
   - `url`: Link Facebook sạch (chuẩn hóa về `profile.php?id={id}` hoặc `facebook.com/{slug}`).
   - `fb_id`: ID số Facebook (100% Numeric FB_ID).
   - `avatar_url`: URL ảnh đại diện chất lượng cao (loại bỏ `ctp=[sp]\d+x\d+`).
   - `subtitle`: Phụ đề, bạn chung, thành phố.
   - `bio`: Tiểu sử, mô tả ngắn hiển thị trên thẻ.
   - `category`: Chuyên mục hiển thị (Pet Breeder, Grooming...).
   - `keywords_found`: Danh sách từ khóa giống chó phát hiện ngay trên thẻ.

---

## 2. Đặc Tả Kỹ Thuật Mô Hình AI Thị Giác & Ma Trận Từ Khóa (Multi-Stage Gatekeeper)

### 2.1 Kiến Trúc Mô Hình ONNX (`dog-model.onnx`)
- **Kiến trúc:** YOLOv8n-cls (Image Classification).
- **Kích thước đầu vào:** Tensor `[1, 3, 224, 224]` kiểu `float32`.
- **Chuẩn hóa giá trị Pixel:** Dải `[0.0, 1.0]` (chia giá trị RGB `0 - 255` cho `255.0`).
- **Thứ tự kênh:** RGB (hoặc BGR chuyển sang RGB).
- **Đầu ra:** Tensor `output0` kích thước `[1, 3]`:
  - `Class 0`: `adult_dog` (Chó trưởng thành)
  - `Class 1`: `non_dog` (Không phải chó: người, hoa lá, xe cộ, chữ)
  - `Class 2`: `puppy` (Cún con)

### 2.2 Quy Trình Thẩm Định Đa Tầng (Multi-Stage Gatekeeper v2.5)
0. **Lớp 0 - Tổng Hợp Văn Bản Đa Nguồn & URL Slug Parser:**
   - Gom toàn bộ văn bản thẩm định: `name + subtitle + bio + category + url_slug`.
   - Tra cứu Ma trận 250+ giống chó và thuật ngữ B2B Breeding (Spaniel, Retriever, Dachshund, Doodle, Bully, Frenchie, Corgi, Kennel, Breeder, Puppies, AKC, Pet Potty, Grass...).
1. **Lớp 1 - Blacklist Ranh Giới Từ & Miễn Nhiễm Giống Chó (Dog Breed Immunity):**
   - Áp dụng ranh giới từ `\b` cho mọi từ khóa ngắn (`\bspa\b`, `\bxe\b`, `\bhr\b`, `\bcat\b`).
   - **Quy tắc Miễn Nhiễm:** Nếu hồ sơ chứa giống chó chính thức hoặc trại cún, các từ khóa phụ (`spa`, `xe`, `hr`) tuyệt đối không được phép loại bỏ!
2. **Lớp 2 - Phát hiện khuôn mặt người trên ảnh HD (Haar Dual Face Cascade - Avatar Ground Truth):**
   - Quét song song 2 bộ Haar Cascade trên ảnh HD. Nếu phát hiện khuôn mặt người $\rightarrow$ **LOẠI BỎ 100%**.
3. **Lớp 3 - Loại trừ họ mèo (Feline Suppression):**
   - Quét `haarcascade_frontalcatface.xml` và từ khóa mèo $\rightarrow$ Loại bỏ. Nếu ONNX $P_{\text{dog}} \ge 0.65$, Haar cat cascade không được đè lên.
4. **Lớp 4 - Lọc sắc thái hoa lá & phong cảnh (Flora HSV Guard):**
   - Phân tích màu HSV (tím/xanh lá thực vật > 35%) $\rightarrow$ Loại bỏ ảnh cỏ cây, phong cảnh.
5. **Lớp 5 - Phối Hợp Kép Giữa ONNX & Biển Hiệu Trại Chó (Dual Inference Engine):**
   - Nếu có từ khóa cún cưng:
     * Ảnh cún thật: $P_{\text{dog}} \ge 0.50 \rightarrow$ Phê duyệt với $P_{\text{dog}} = 0.95 - 1.00$.
     * Ảnh Logo / Biển hiệu trại cún (không có mặt người): Phê duyệt `kennel_brand_logo` (Confidence = 0.88).
     * Ảnh không tải được: Phê duyệt `keyword_verified` (Confidence = 0.85).
   - Nếu không có từ khóa cún cưng: Đòi hỏi nhận diện thị giác rõ rệt ($P_{\text{adult}} \ge 0.65$ hoặc $P_{\text{puppy}} \ge 0.85$).

### 2.3 Công Cụ Kiểm Soát Terminal & Live Web Console
- **Terminal Runner:** `run_step1_interactive.py` và `1_CHAY_LOC_ANH_STEP1.bat` cung cấp giao diện dòng lệnh với mã màu ANSI trực quan (`[✓ PHÊ DUYỆT CHÓ]`, `[❌ BỎ QUA]`), cho phép người dùng tùy chọn tốc độ chạy (0.15s/hồ sơ để quan sát hoặc Enter từng người).
- **Live Terminal Console Web UI:** Bảng điều khiển màu đen công nghệ trên Web Dashboard hiển thị luồng log thời gian thực, cho phép quản trị viên theo dõi lý do duyệt/bỏ từng hồ sơ song song khi quét ngầm.

## 3. Quy Trình Thu Thập Bộ Sưu Tập Ảnh & Đánh Tên Theo ID

Mỗi đối tượng tiềm năng sau khi được phát hiện sẽ được bóc tách bộ ảnh:
1. **Ảnh đại diện chính thức (Avatar HQ):** Ảnh kích thước lớn nhất được giải mã từ CDN Facebook.
2. **Ảnh từ bộ sưu tập / bài viết:** Các ảnh chụp chó, đàn con, cơ sở vật chất từ trang cá nhân.
3. **Cấu trúc lưu trữ tệp trên đĩa cứng:**
   ```
   downloaded_collections/
   └── {FB_ID}/
       ├── {FB_ID}_01.jpg   <-- Ảnh đại diện chính (Avatar)
       ├── {FB_ID}_02.jpg   <-- Ảnh bộ sưu tập 1
       ├── {FB_ID}_03.jpg   <-- Ảnh bộ sưu tập 2
       └── ...
   ```
4. **Metadata lưu kèm:** File JSON và Excel ghi nhận:
   - `FB_ID`: UID của đối tượng.
   - `Photo_Count`: Số lượng ảnh trong bộ sưu tập đã tải.
   - `Image_Urls`: Danh sách link ảnh gốc.
   - `Local_Image_Paths`: Danh sách đường dẫn file đã lưu trên máy.

---

## 4. Cấu Trúc Báo Cáo Xuất Kết Quả

### 4.1 Bảng Excel Chuẩn Doanh Nghiệp (`result_dog_leads_{timestamp}.xlsx`)
| STT | FB_ID | Họ và Tên | Link Facebook | Phương Thức Nhận Diện | Kết Quả AI Thị Giác | Từ Khóa Khớp | Số Ảnh Đã Tải | Đường Dẫn Bộ Sưu Tập Ảnh | Gợi Ý Sản Phẩm (Pet Grass/Potty/Toys) |
| :-: | :---: | :--- | :--- | :--- | :--- | :--- | :-: | :--- | :--- |

### 4.2 Tệp JSON LEAD-US Chuẩn Meta RAG (`result_dog_leads_{timestamp}.json`)
Đồng bộ 100% với cấu trúc 28 trường dữ liệu của hệ sinh thái `Marketing_Pet&Grass`, bao gồm các trường:
`stt`, `name`, `fb_id`, `url`, `avatar_url`, `photo_collection`, `detection_method`, `ai_vision_result`, `matched_keywords`, `score`, `rank_tier`, `product_fit`.

---

## 5. Hướng Dẫn Vận Hành Từng Bước Cho Người Dùng

### Bước 1: Quét Follower / Following bằng Extension
1. Mở trang cá nhân Facebook cần quét, chuyển sang tab **Người theo dõi (Followers)** hoặc **Đang theo dõi (Following)**:
   - Ví dụ: `https://www.facebook.com/username/followers` hoặc mở popup danh sách người theo dõi.
2. Nhấp biểu tượng tiện ích **FB Following Scraper**:
   - Chọn chế độ: **"Cào tất cả người theo dõi / đang theo dõi"** (để thu thập trọn bộ tệp và đẩy sang Python phân tích sâu) hoặc **"Lọc thông minh trực tiếp trên trình duyệt"**.
   - Bấm **"▶ Bắt đầu cào"**. Tiện ích tự động cuộn trang và thu thập thông tin.
3. Khi cuộn xong hoặc bấm dừng, nhấp nút **"📥 Xuất dữ liệu cho Python Pipeline (JSON/CSV)"**. Tệp sẽ được lưu vào thư mục tải về.

### Bước 2: Chạy Python Pipeline Thẩm Định AI & Tải Bộ Sưu Tập Ảnh Theo ID
1. Mở dòng lệnh (Terminal/PowerShell) tại thư mục dự án:
   ```bash
   python fb_following_scraper/fb_profile_dog_pipeline.py --input "path/to/exported_file.json"
   ```
2. Python pipeline tự động:
   - Khởi động `dog-model.onnx` trên ONNX Runtime.
   - Tải và thẩm định từng ảnh đại diện/bộ sưu tập ảnh kết hợp kiểm tra từ khóa.
   - Tự động tải toàn bộ ảnh của các đối tượng khớp vào thư mục `downloaded_collections/{FB_ID}/` đánh số `{FB_ID}_01.jpg`, `{FB_ID}_02.jpg`...
   - Xuất file báo cáo Excel và JSON hoàn chỉnh.
