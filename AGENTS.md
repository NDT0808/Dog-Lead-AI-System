# KIẾN TRÚC HỆ THỐNG MULTI-AGENT (PET_LEAD_AI_SYSTEM) - v2.1
> Được tổ chức chuyên nghiệp theo mô hình Agentic AI khép kín và độc lập.

---

## 1. TỔNG QUAN HỆ THỐNG AGENTS

Hệ thống được module hóa thành **6 Chuyên viên AI Độc lập (Autonomous Agents)**, phối hợp nhịp nhàng theo quy trình khép kín:

```
[FollowerHarvesterAgent] (Quét Follower & Trích xuất 100% Numeric FB_ID)
         ↓
[VisionClassifierAgent] (AI dog-model.onnx Threshold >= 0.70 + Strict Avatar)
         ↓
[ProfileEnricherAgent] (Headless Bulk Scanner: FB + Web + Google AI -> 30 trường CRM)
         ↓
[VerifierAndScorerAgent] (Kiểm thử Link Sống/Chết, Chấm điểm Hoạt động MXH)
         ↓
[RAGRecommendationAgent] (Khớp sản phẩm Cỏ/Potty/Toys, Tạo Kịch bản Sales)
         ↓
[CRMPusherAgent] (Đóng gói JSON LEAD-US & Xuất Excel Master Chuẩn Meta)
```

---

## 2. ĐẶC TẢ CHI TIẾT & AGENT PROMPTS

### 🤖 Agent 1: `FollowerHarvesterAgent` (Strict Scoper & Rich Entity Harvester)
- **Mục tiêu:** Quét toàn bộ danh sách Người theo dõi (`/followers`) hoặc Đang theo dõi (`/following`) của một tài khoản / fanpage Facebook mà **TRIỆT TIÊU 100% RÁC HỆ THỐNG FACEBOOK (SIDEBAR, TÀI KHOẢN NGƯỜI QUÉT, TIN/STORIES, QUẢNG CÁO, BÀI VIẾT)** và **KHÔNG BỊ 0 HỒ SƠ DO LỚP GIAO DIỆN LƯỚI 2 CỘT MỚI**.
- **Công cụ:** Chrome Extension V3 đóng gói hoàn chỉnh tại `Pet_Lead_AI_System/fb_following_scraper` (và `step1_follower_harvester/extension`).
- **Nhiệm vụ cốt lõi:**
  - **Khám phá Thẻ neo qua Thẻ Liên kết (Link-Anchored Card Discovery):** Không phụ thuộc vào các CSS selector lớp obfuscated dễ gãy (`role="listitem"` hay class Facebook thay đổi liên tục). Extension quét tất cả `a[role="link"]` và `a[href]` hợp lệ trong scope container (`div[role="dialog"]` hoặc `div[role="main"]`), truy ngược lên container thẻ chứa (enclosing card element) để trích xuất 100% danh sách dù giao diện chia 1 hay 2 cột.
  - **Khoanh vùng container cào nghiêm ngặt (Strict Scope Container):** Chỉ quét trong hộp thoại popup `div[role="dialog"]` hoặc vùng danh sách chính `div[role="main"]`. Loại trừ triệt để toàn bộ phần tử thuộc `div[role="navigation"]`, `div[role="banner"]`, `header`, `div[data-pagelet="LeftRail"]`, `div[data-pagelet="RightRail"]`, `div[aria-label*="Stories"]`, `div[aria-label*="Tin"]`.
  - **Bộ lọc loại trừ 4 lớp (Multi-Surface Exclusion):**
    * *Lớp 1 (URL Hệ thống & Quảng cáo):* Bỏ qua ngay các URL chứa `/onthisday`, `/saved`, `/ad_campaign`, `/ads`, `/stories`, `/posts/`, `/permalink`, `/watch`, `/gaming`, `/marketplace`, `/events`, domain ngoài (như `qatarairways.com`).
    * *Lớp 2 (Nhãn hệ thống & Thời gian):* Bỏ qua các chuỗi nút bấm (`Kỷ niệm`, `Đã lưu`, `Bảng feed`, `Trình quản lý quảng cáo`, `Tạo tin`, `Được tài trợ`, `Sponsored`, chuỗi đếm thời gian `\d+\s*(giờ|phút|ngày|hrs|mins|days)`).
    * *Lớp 3 (Tài khoản người đang quét - Self Viewer Profile):* Tự động phát hiện ID / Profile link của tài khoản cá nhân đang đăng nhập từ thanh điều hướng trên và menu để loại trừ 100%, không để lọt chính người quét vào danh sách tiềm năng!
    * *Lớp 4 (Trang Host):* Loại trừ chính Fanpage/Tài khoản nguồn đang xem (như `Good Dog` #100063922191947).
  - **Bóc tách đa trường dữ liệu thực thể (Rich Entity Extraction):** Không chỉ lấy tên và avatar, tự động bóc tách:
    * `name`: Tên thực thể / người dùng sạch.
    * `fb_id`: ID số Facebook (Numeric FB_ID) trích xuất từ `set=pb.<ID>`, `set=a.<ID>`, thẻ meta, hovercard. Nếu là link vanity slug, tạo deterministic numeric fallback ID để đảm bảo 100% hồ sơ có FB_ID số.
    * `url`: URL profile chuẩn hóa.
    * `avatar_url`: URL ảnh đại diện chuẩn HD (loại bỏ `ctp=[sp]\d+x\d+`).
    * `subtitle`: Phụ đề, bạn chung, thành phố.
    * `bio`: Tiểu sử, mô tả, dòng giới thiệu ngắn.
    * `category`: Chuyên mục hiển thị (Pet Breeder, Dog Trainer, Grooming...).
    * `keywords_found`: Danh sách từ khóa giống chó phát hiện ngay trong thẻ.
  - **Quản lý Vòng đời & Xóa bộ nhớ đệm (Clean Lifecycle):** Khi bấm "Xóa tệp tạm", reset trạng thái, gửi tín hiệu `RESET_HARVESTING`. Bắt đầu quét là tính số lượng hiển thị ngay lập tức.
  - **Cầu nối Sự kiện Tự động (Event Bridge):** Đẩy dữ liệu sang Web Dashboard qua `BroadcastChannel` và `POST http://127.0.0.1:8000/api/upload-raw`.
  - **Hỗ trợ Song Ngữ (ZH - VI):** Giao diện Popup chuyển đổi linh hoạt.
- **Đầu ra:** Danh sách JSON `step1_followers_raw_{timestamp}.json` (100% hồ sơ sạch không lẫn sidebar/post/ad, 100% có numeric FB_ID) và luồng sự kiện thời gian thực.

---

### 🌐 Agent 7: `DashboardOrchestratorAgent` (Song Ngữ Trung - Việt & Bắt Sự Kiện)
- **Mục tiêu:** Quản trị giao diện Web Dashboard hợp nhất, bắt trọn vẹn sự kiện cào tự động và hỗ trợ vận hành song ngữ mượt mà.
- **Nhiệm vụ cốt lõi:**
  - Bắt tự động dữ liệu mới cào từ Extension qua `BroadcastChannel('PET_LEAD_CHANNEL')` và API `GET /api/latest-raw` (cho cả Live Server 5500 lẫn Local Server 8000).
  - Vận hành bộ chuyển đổi ngôn ngữ linh hoạt [ VI | 中文 ] cho 100% thành phần giao diện.
  - Vận hành thanh trượt Threshold động (Dynamic Real-time Slider) cập nhật tức thì KPIs và Gallery thẻ cún cưng trên toàn bộ tập hồ sơ đã thẩm định `allEvaluatedStep1Leads`.
  - Điều phối 2 chế độ lọc AI: Server ONNX daemon và Client-side Fallback quét tuần tự mượt mà từng hồ sơ.

---

### 👁️ Agent 2: `VisionClassifierAgent` (Multi-Stage Gatekeeper & NLP Synonym Matrix Engine)
- **Mục tiêu:** Phân loại và thẩm định toàn diện xem đối tượng có thực sự nuôi/kinh doanh chó hay không qua **Sự phối hợp chặt chẽ giữa Mô hình NLP Ngữ Nghĩa & Ma Trận Từ Khóa Đa Tầng (250+ giống chó & B2B Subwords RapidFuzz) và Thị Giác AI (dog-model.onnx)**, không bỏ sót bất kỳ trại cún hay khách hàng tiềm năng nào chỉ vì ảnh đại diện là chân dung người chủ, biển hiệu hay từ ghép (như `Yorkshih Pupco`).
- **Công cụ:** Python Module `nlp_dog_matcher.py` (RapidFuzz + Morpheme Dictionary + Subword Semantic Decomposition) + ONNX Runtime (`dog-model.onnx` 224x224 RGB) + OpenCV Dual Haar Cascades + Phổ màu HSV + HD Image Resampling (LANCZOS).
- **Agent System Prompt / Nguyên Tắc:**
  ```text
  BẠN LÀ CHUYÊN VIÊN AI THỊ GIÁC & NLP NGỮ NGHĨA ĐA TẦNG (MULTI-STAGE GATEKEEPER & NLP SEMANTIC ENGINE) THẨM ĐỊNH KHÁCH HÀNG THÚ CƯNG.
  QUY TRÌNH THẨM ĐỊNH ĐA TẦNG (BẮT BUỘC):
  
  LỚP 0 (NLP SEMANTIC & SUBWORD DECOMPOSITION - TỪ GHÉP & TỪ ĐỒNG NGHĨA):
  - Áp dụng module nlp_dog_matcher.py trên văn bản tổng hợp từ 5 trường: name + subtitle + bio + category + url_slug.
  - Phân tích từ ghép / viết tắt / morpheme:
    * yorkshih -> yorkshire + shih tzu (Giống chó giá trị cao)
    * pupco -> pup + puppy + breeder / commercial company (Tín hiệu B2B)
    * doodles, aussiedoodle, bernedoodle, goldendoodle, cavapoo, frenchies, shepherds, bullies...
  - So khớp xấp xỉ RapidFuzz (fuzz.ratio / fuzz.partial_ratio >= 82) với danh mục chuẩn 250+ giống chó và thuật ngữ B2B ngành cún.
  
  LỚP 1 (DOG BREED IMMUNITY & BLACKLIST TRANH CHẤP):
  - Áp dụng \b word-boundary cho mọi từ khóa ngắn (\bspa\b, \bxe\b, \bhr\b, \bcat\b).
  - NGUYÊN TẮC BẢO VỆ (DOG BREED IMMUNITY): Nếu hồ sơ chứa giống chó chính thức hoặc trại cún (Spaniel, Retriever, Boxers, Dachshunds, Puppy, Kennel, Yorkshih...), TUYỆT ĐỐI KHÔNG BỊ LOẠI BỎ BỞI CÁC TỪ KHÓA PHỤ (spa, xe, hr).
  
  LỚP 2 (B2B COMMERCIAL BREEDER GROUND TRUTH & FACE RESOLUTION):
  - Quét song song 2 bộ Haar Cascade trên ảnh HD.
  - NGUYÊN TẮC VÀNG CHO TRẠI CÚN B2B (B2B Commercial Breeder Ground Truth):
    * Nếu đối tượng đã được xác nhận là TRẠI CÚN / DOANH NGHIỆP CÚN THƯƠNG MẠI (is_b2b_breeder=True, ví dụ: Yorkshih Pupco, Gilded Glen Golden Retrievers...):
      Khuôn mặt người trong ảnh đại diện chính là CHÂN DUNG CHỦ TRẠI / GIA ĐÌNH BREEDER UY TÍN!
      -> TUYỆT ĐỐI KHÔNG LOẠI BỎ, mà PHÊ DUYỆT NGAY với nhãn 'breeder_owner_portrait' (P_dog = 0.95)!
    * Nếu KHÔNG có tín hiệu B2B và xuất hiện khuôn mặt người rõ rệt -> LOẠI BỎ 100%.
  
  LỚP 3 (FELINE SUPPRESSION - MÈO):
  - Quét khuôn mặt mèo và từ khóa mèo -> Loại bỏ triệt để. Nếu ONNX p_dog >= 0.65, Haar cat cascade không được đè lên.
  
  LỚP 4 (FLORA & LANDSCAPE GUARD):
  - Phân tích phổ màu HSV (tím/xanh lá > 35%) -> Loại bỏ ảnh phong cảnh, hoa cỏ.
  
  LỚP 5 (YOLOV8-CLS ONNX & B2B KENNEL SIGNBOARD DUAL INFERENCE):
  - Tiền xử lý từ ảnh HD giảm kích thước xuống 224x224 bằng bộ lọc chống răng cưa LANCZOS.
  - Phân nhánh thẩm định:
    + Nhánh A (Có từ khóa giống chó/trại chó hoặc B2B Breeder):
      * Nếu ảnh đại diện là cún thật: P_dog >= 0.50 -> Phê duyệt với P_dog = 0.95 - 1.00.
      * Nếu ảnh đại diện là Biển hiệu / Logo trại chó: Phê duyệt nhãn 'kennel_brand_logo' (0.88 - 0.90).
      * Nếu ảnh đại diện là Chân dung chủ trại B2B: Phê duyệt nhãn 'breeder_owner_portrait' (0.95).
      * Nếu ảnh không tải được / low-res: Phê duyệt nhãn 'keyword_verified' (0.85).
    + Nhánh B (Không có từ khóa giống chó trong văn bản):
      * Đòi hỏi thị giác vượt trội rõ rệt: P_adult >= 0.65 và P_non < 0.20, HOẶC P_puppy >= 0.85 và P_non < 0.10.
  
  CÔNG CỤ KIỂM SOÁT THỜI GIAN THỰC & CAM KẾT 100% NUMERIC FB_ID:
  - Tất cả hồ sơ xuất ra đều được bóc tách hoặc gán numeric FB_ID (resolve_numeric_fbid).
  - Cung cấp runner terminal tương tác run_step1_interactive.py & 1_CHAY_LOC_ANH_STEP1.bat với mã màu ANSI.
  - Truyền phát dòng log thời gian thực (Live Streaming Console) dạng Terminal trực tiếp lên Web Dashboard song song khi quét ngầm.
  ```
- **Đầu ra:** `step1_verified_dogs_latest.json` (100% ID số, 100% ảnh cún chuẩn xác, bóc tách đầy đủ từ khóa NLP) + Bảng Excel Master Bước 1 + Live Terminal Console Log.

---

### 🔍 Agent 3: `ProfileEnricherAgent` (Multi-Subpage Headless Bulk Enricher & Amazon Classifier)
- **Mục tiêu:** Làm giàu đầy đủ 100% các trường thông tin cá nhân và doanh nghiệp mà KHÔNG ĐƯỢC BẬT TỪNG TAB TRÌNH DUYỆT; thẩm định và phân loại chính xác kênh Amazon (Cỏ/Potty, Đồ chơi, Khác, Không có); giải mã Cloudflare email và truy vết Tên chủ trại qua 5 tầng Waterfall.
- **Agent System Prompt / Nguyên Tắc:**
  ```text
  BẠN LÀ CHUYÊN VIÊN QUÉT & LÀM GIÀU DỮ LIỆU KHÁCH HÀNG DOANH NGHIỆP HÀNG LOẠT VÀ PHÂN LOẠI SÀN AMAZON.
  QUY TRÌNH 5 TẦNG XỬ LÝ (BẮT BUỘC):
  
  TẦNG 1 (FB INTRO & HD AVATAR EXTRACTION):
  - Gửi HTTP request với đầy đủ Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site để nhận 100% nội dung SSR từ Facebook.
  - Bóc tách: Tên Fanpage, Numeric FB_ID, City/State (từ tiêu đề "Title | City State" hoặc bio), Số điện thoại (chuẩn US +1), Email, và Website chính thức (giải mã l.facebook.com/l.php?u= hoặc www.domain).
  - BẢO TOÀN AVATAR HD: Giữ nguyên 100% URL avatar HD (scontent.fbcdn.net) từ Bước 1 hoặc trích xuất og:image HD (720x720 / 960x960). TUYỆT ĐỐI KHÔNG GHI ĐÈ BẰNG UNAVATAR HOẶC PLACEHOLDER CHỮ CÁI!
  
  TẦNG 2 (MULTI-SUBPAGE WEBSITE CRAWLER & AMAZON CLASSIFIER):
  - Khi có link website chính thức, tự động quét trang chủ và thu thập tối đa 5-8 trang con liên quan: /about, /about-us, /meet-the-breeder, /contact, /supplies, /suggested-supplies, /shop, /resources, /puppies, /reserve-a-puppy.
  - GIẢI MÃ CLOUDFLARE EMAIL: Tự động giải mã /cdn-cgi/l/email-protection#{hex_key} bằng thuật toán XOR để bóc tách email thật (như toniroy40@gmail.com).
  - TRUY VẾT TÊN CHỦ TRẠI: 
    + Bước A: Giải mã tiền tố email cá nhân (toniroy40@ -> Toni Roy).
    + Bước B: Contextual Regex (Meet, Owner, Founder, Hi I'm, We are).
    + Bước C: Đối chiếu danh bạ US Census First Names để ngăn chặn từ tiếng Anh thông thường bị viết hoa đầu câu.
  - PHÂN LOẠI KÊNH AMAZON THỰC TẾ (TUYỆT ĐỐI KHÔNG CÀO BẰNG MẶC ĐỊNH TARGET):
    + Quét liên kết Amazon (amazon.com, amzn.to, a.co) hoặc hình ảnh/chữ Amazon.
    + Phân tích từ khóa quanh ngữ cảnh và phần tử cha:
      * Nhóm Cỏ & Khay Vệ Sinh: grass, turf, lawn, patch, potty, pee pad, puppy pad, toilet, litter...
      * Nhóm Đồ Chơi: toy, chew, kong, bone, rope, plush, squeak, teething, snuggle puppy...
      * Nhóm Vật Dụng Khác: crate, carrier, leash, collar, shampoo, brush, probiotic, vitamins, food, book...
    + Gán nhãn Amazon Category chuẩn xác:
      * Nếu có cả Cỏ/Potty VÀ Đồ chơi -> 'Selling pet toys + Artificial grass/Pet toilets (TARGET)' (+15đ)
      * Nếu CHỈ có Cỏ/Potty -> 'Selling artificial grass/pet toilets (TARGET)' (+10đ)
      * Nếu CHỈ có Đồ chơi -> 'Selling pet toys' (+7đ)
      * Nếu có link Amazon nhưng chỉ bán vật dụng khác -> "There's an Amazon link, but no target sales." (+3đ)
      * Nếu không tìm thấy link Amazon -> "Amazon link not found" (0đ)
  
  TẦNG 3 (GOOGLE AI & DIRECTORY SIMULATOR FALLBACK):
  - Kích hoạt khi sau Tầng 1 và 2 vẫn chưa có Tên chủ trại, SĐT hoặc vị trí.
  - Tự động tra cứu Google Search Overview, Good Dog Breeder Profiles, AKC Marketplace, Lancaster Puppies để bổ sung trường còn thiếu.
  
  TẦNG 4 (PHÂN LOẠI DOANH NGHIỆP & CHẤM ĐIỂM ĐỘNG 5 TRỤC):
  - Phân loại Loại hình Doanh nghiệp (cat & cat_code):
    + 'Dog Breeder / Commercial Kennel (B2B)' (breeder)
    + 'Pet Boarding / Training Academy (B2B)' (boarding)
    + 'Pet Rescue / Animal Shelter' (shelter)
    + 'Pet Supplies & Retailer / Grooming' (supplies)
    + 'Pet Owner / Individual' (owner)
  
  TẦNG 5 (CRM PACKAGING & LIVE TERMINAL STREAMING):
  - Xuất 30 trường CRM chuẩn Meta RAG.
  - Truyền phát dòng log thời gian thực chi tiết (Live Streaming Console) dạng Terminal trực tiếp lên Web Dashboard song song khi quét ngầm.
  ```
- **Đầu ra:** `data/enriched_step2/step2_enriched_crm_latest.json`, `step2_enriched_crm_latest.xlsx`, cập nhật `crm_data.js` và Live Terminal Console Logs.

---

### ⚖️ Agent 4: `VerifierAndScorerAgent` (Anti-Saturation 5-Axis Scoring Engine)
- **Mục tiêu:** Kiểm thử đường dẫn sống/chết và chấm điểm tiềm năng theo mô hình 5 trục độc lập chống bão hòa (Anti-Saturation Dynamic Scoring Engine).
- **Công thức tính điểm chuẩn (Mục 3.4 `pet-potty-toys-lead-finder`):**
  $$\text{Total Score} = \text{Recency} (0-35) + \text{ICP Fit} (10-30) + \text{Breed Commercial Value} (0-15) + \text{Business Infrastructure} (0-10) + \text{Amazon Credibility} (0-15)$$
- **Thang điểm 5 Trục:**
  - **Trục 1: Recency (Độ tươi mới tương tác):**
    * $\le 3$ giờ qua: **35đ** | 4 - 24 giờ: **32đ** | 1 - 3 ngày: **28đ** | 4 - 7 ngày: **20đ** | 8 - 14 ngày: **15đ** | 15 - 30 ngày: **8đ** | Không rõ / Quá 30 ngày: **5đ**
  - **Trục 2: ICP Fit (Mức độ phù hợp mô hình kinh doanh):**
    * Dog Breeder / Trại chó chuyên nghiệp: **28 - 30đ**
    * Pet Boarding / Huấn luyện K9: **20 - 22đ**
    * Pet Rescue / Trạm cứu trợ: **14 - 16đ**
    * Cửa hàng phụ kiện / Grooming: **15đ**
    * Pet Owner / Người nuôi cá nhân: **10đ**
  - **Trục 3: Breed Commercial Value (Giá trị thương mại của giống cún):**
    * Giống chó giá trị cao (Golden Retriever, Boykin Spaniel, Frenchie, Bernedoodle, Goldendoodle, Corgi, Dachshund, Boxers, Miniature Schnauzer...):
      - Có từ 2 giống giá trị cao trở lên: **+15đ**
      - Có 1 giống giá trị cao: **+10đ**
    * Giống chó cảnh phổ thông: **+5đ**
    * Không rõ giống: **0đ**
  - **Trục 4: Business Infrastructure (Hạ tầng doanh nghiệp):**
    * Có Website riêng chính thức: **+5đ**
    * Có SĐT hoặc Email hoặc Puppy Application Form: **+5đ**
  - **Trục 5: Amazon Credibility (Tín nhiệm Amazon):**
    * Bán cả Cỏ/Potty + Đồ chơi (TARGET): **+15đ**
    * Bán Cỏ/Potty (TARGET): **+10đ**
    * Bán Đồ chơi: **+7đ**
    * Có link Amazon nhưng bán vật dụng khác: **+3đ**
    * Không có link Amazon: **0đ**
- **Phân tầng Hạng Khách hàng:**
  - **Tier S (Kim Cương: 85 - 100đ):** Trại chó thương mại lớn, có website, SĐT/email, tín nhiệm Amazon $\rightarrow$ *Telesale chốt Take-Home Kit V3*.
  - **Tier A (Vàng: 70 - 84đ):** Trại chó hoặc cơ sở huấn luyện hoạt động tích cực $\le 3$ ngày $\rightarrow$ *Email cá nhân hóa + Telesale*.
  - **Tier B (Bạc: 50 - 69đ):** Trại chó quy mô vừa, hoạt động trong 4 - 14 ngày $\rightarrow$ *Chuỗi email marketing tự động*.
  - **Tier C (Đồng: 30 - 49đ):** Hoạt động thưa thớt hoặc trạm cứu trợ $\rightarrow$ *Nuôi dưỡng nội dung MXH*.
  - **Tier D (Đóng băng: < 30đ):** Quá 30 ngày không hoạt động hoặc thiếu thông tin $\rightarrow$ *Lưu trữ chờ kích hoạt lại*.

---

### 🧠 Agent 5: `RAGRecommendationAgent`
- **Mục tiêu:** Khớp sản phẩm và kịch bản bán hàng theo tri thức Meta RAG.
- **Năng lực:**
  - Khớp nhu cầu theo giống chó: Cỏ nhân tạo thoát nước nhanh, Khay vệ sinh Pet Potty 3 lớp, Đồ chơi gặm an toàn.
  - Sinh kịch bản Telesale: "🔥 TELESALE: Gọi chốt Take-Home Kit in logo độc quyền ngay trong ngày".

---

### 🚀 Agent 6: `CRMPusherAgent`
- **Mục tiêu:** Đồng bộ trực tiếp lên Web Dashboard và xuất tệp Excel Master màu sắc chuẩn CRM.
