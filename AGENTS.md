# KIẾN TRÚC HỆ THỐNG MULTI-AGENT (PET_LEAD_AI_SYSTEM) - v3.0.0-ENTERPRISE-GUARD
> **Senior Automation Architect & Multi-Agent System Engineer**  
> **Campaign Goal:** Quét, thẩm định AI, làm giàu 30 trường CRM và chấm điểm 20.000 Breeder/Kennel tại Mỹ với cam kết **ZERO REGRESSION** (Triệt tiêu 100% lỗi lịch sử từ phản hồi của đội Sales).  
> **Target CRM Endpoint:** `http://43.156.237.143:3007/` | **Local API Endpoint:** `http://127.0.0.1:8000`  
> **Core Products:**  
> - Puppy Take-Home Kit (V1 Basic / V2 Standard Focus / V3 Premium)  
> - Artificial Grass / Pet Potty 3-Layer System  
> - Durable B2B Pet Toys  

---

## 🛡️ BẢNG 10 LUẬT BẤT KHẢ XÂM PHẠM (ZERO REGRESSION GUARDRAILS)

| Mã Lỗi | Lỗi Lịch Sử Cần Triệt Tiêu | Quy Tắc Kiểm Soát Nghiêm Ngặt (Strict Enforcement) |
| :--- | :--- | :--- |
| **ERR_01_FB_LINK_REDIRECT** | Click vào link Facebook bị nhảy sang trang khác, link rác, bài viết, hoặc dính redirect wrapper `l.facebook.com`. | Mọi URL Facebook xuất ra bắt buộc phải qua hàm `normalize_fb_url()`. Giải mã 100% `l.facebook.com/l.php?u=`, cắt bỏ toàn bộ tracking query (`?mibextid`, `?__cft__`, `?ref`, `&set=`). Chuẩn hóa về dạng duy nhất: `https://www.facebook.com/profile.php?id={NUMERIC_FB_ID}` hoặc `https://www.facebook.com/{VALID_VANITY_SLUG}`. Phải xác thực HTTP 200/302 hợp lệ trước khi đưa vào CRM. |
| **ERR_02_MISSING_NUMERIC_FB_ID** | Hồ sơ thiếu `FB_ID` dạng số hoặc bị trùng lặp do dùng vanity slug thay đổi. | 100% hồ sơ phải có Numeric `FB_ID` trích xuất từ thuộc tính DOM (`set=pb.<ID>`, `set=a.<ID>`, `hovercard`, `meta entity_id`). Nếu là vanity slug không lộ ID ở Bước 1, phải tạo deterministic fallback ID và phân giải bằng SSR Request ở Bước 2. |
| **ERR_03_ZERO_PROFILES_2COL_GRID_AND_SIDEBAR_JUNK** | Cào được 0 hồ sơ do Facebook đổi giao diện lưới 2 cột hoặc cào nhầm Sidebar, Quảng cáo, Stories, và chính tài khoản người đang quét. | Tuyệt đối không dùng CSS class obfuscated cố định. Phải dùng Link-Anchored Card Discovery trong Strict Scope Container (chỉ quét trong `div[role='dialog']` hoặc `div[role='main']`). Áp dụng bộ lọc 4 lớp loại trừ: (1) URL hệ thống/Ads/Stories, (2) Nhãn thời gian/Sponsored, (3) Self Viewer Profile (tài khoản đang đăng nhập), (4) Host Page đang xem. |
| **ERR_04_B2B_BREEDER_REJECTED_BY_HUMAN_FACE** | Loại bỏ nhầm các trại chó B2B lớn (như Yorkshih Pupco, Gilded Glen) vì ảnh đại diện là mặt chủ trại, logo trại chó hoặc tên viết liền. | Áp dụng NLP Subword Decomposition (tách `yorkshih` -> `yorkshire` + `shih tzu`, `pupco` -> `puppy` + `company`) và Dog Breed Immunity (`\bspa\b` không được loại bỏ Spaniel). Nếu `is_b2b_breeder = True`, ảnh có khuôn mặt người được phê duyệt ngay với nhãn `'breeder_owner_portrait'` (P_dog = 0.95), ảnh logo được duyệt với nhãn `'kennel_brand_logo'` (0.90). |
| **ERR_05_NO_NAME_WHEN_NO_WEBSITE** | Khách hàng không có trang web (chỉ có Facebook) thì bị trống tên khách hàng hoặc lấy sai tên. | Áp dụng 5-Tier Owner Name Waterfall: (1) Bóc tách từ FB Intro/Bio bằng Contextual Regex (`'Owned by'`, `'Hi I am'`, `'Meet'`, `'Family bred by'`), (2) Giải mã tiền tố Email cá nhân trên FB (ví dụ `toniroy40@gmail.com` -> `Toni Roy`), (3) Đối chiếu từ điển US Census First Names, (4) Quét Linktree/Hoo.be/GoodDog/AKC, (5) Nếu vẫn không có tên cá nhân, bắt buộc gán `'[Cleaned Page Name] (Breeder/Manager)'` chứ **TUYỆT ĐỐI KHÔNG ĐỂ TRỐNG** hay `'N/A'`. |
| **ERR_06_WRONG_WEBSITE_LINK_AND_INCOMPLETE_INFO** | Link website bị sai (lấy nhầm link facebook/social làm website), Cloudflare che email, hoặc thiếu thông tin trang con. | Khi trích xuất Website từ FB, phải lọc bỏ domain mạng xã hội (`facebook.com`, `instagram.com`, `tiktok.com`). Nếu gặp link rút gọn (`linktr.ee`, `hoo.be`, `beacons.ai`), phải tự động cào xuyên qua (deep bio scraping) để lấy Website chính thức và Link Amazon. Giải mã 100% Cloudflare Email Protection (`/cdn-cgi/l/email-protection#{hex}`) bằng thuật toán XOR. Quét tối đa 5-8 trang con (`/about`, `/contact`, `/puppies`, `/supplies`) với Timeout cứng 6 giây. |
| **ERR_07_AVATAR_OVERWRITTEN_BY_PLACEHOLDER** | Ảnh đại diện HD của cún/trại bị ghi đè bởi chữ cái placeholder hoặc unavatar lỗi ở Bước 2. | Bảo toàn 100% URL Avatar HD (`scontent.fbcdn.net`, loại bỏ `ctp=[sp]\d+x\d+`) từ Bước 1 hoặc og:image HD. Cấm tuyệt đối việc ghi đè bằng `unavatar.io` hay ảnh đại diện mặc định. |
| **ERR_08_AMAZON_CAPTCHA_AND_FAKE_DEFAULT_TARGET** | Mở 20-30 tab Amazon trực tiếp gây dính Captcha treo máy, hoặc gán bừa nhãn TARGET cho mọi hồ sơ. | **CẤM** mở tab trình duyệt trực tiếp cho từng link Amazon. Phải phân tích DOM anchor context xung quanh link (`amazon.com`, `amzn.to`, `a.co`) trên website trại chó hoặc dùng Headless/Snippet Request ngầm. Phân loại chính xác 5 nhãn thực tế (+15đ, +10đ, +7đ, +3đ, 0đ), không bao giờ gán mặc định TARGET nếu không tìm thấy từ khóa cỏ/potty/đồ chơi. |
| **ERR_09_INACTIVE_SOCIAL_RANKED_HIGHER_THAN_ACTIVE** | Khách không có MXH hoặc fanpage chết nhiều năm lại có điểm cao hơn khách đang đăng bài tích cực; thiếu thông tin nhiệt độ (Lead Temperature). | Áp dụng công thức 5 trục chống bão hòa + Phạt điểm nghiêm ngặt nếu link FB chết (-20đ) hoặc quá 30 ngày không đăng bài. Cộng điểm thưởng Engagement (Likes, Shares, Comments). Áp dụng quy tắc Tie-Breaker bắt buộc: Khi bằng điểm, khách có MXH hoạt động tích cực và có bằng chứng nhu cầu luôn xếp trên khách không có MXH. Hiển thị đầy đủ trường Lead Temperature (`🔥 HOT` / `🌤️ WARM` / `💧 COOL` / `🧊 FROZEN`). |
| **ERR_10_DASHBOARD_SAVE_REFERENCE_ERROR** | Lỗi saveReferenceError trên Web Dashboard và không tự động xuất JSON/Excel chuẩn. | Kiểm tra null-safety cho mọi biến DOM/State trước khi lưu, tự động đồng bộ qua `BroadcastChannel('PET_LEAD_CHANNEL')` và xuất song song JSON + Excel Master đầy đủ 30 trường. |

---

## 🎯 MASTER SYSTEM PROMPT & ORCHESTRATION

```text
BẠN LÀ SENIOR AUTOMATION ARCHITECT & ORCHESTRATOR CỦA HỆ THỐNG 'PET_LEAD_AI_SYSTEM' (v3.0 Enterprise).
Nhiệm vụ của bạn là điều phối 6 Autonomous AI Agents hoạt động theo mô hình Phễu Tuần Tự 4 Tầng (Multi-Stage Funnel) kết hợp Meta RAG để thu thập, thẩm định thị giác, làm giàu dữ liệu và chấm điểm 20.000 Trại chó & Breeder tại Hoa Kỳ cho chiến dịch Puppy Take-Home Kit (V1/V2/V3), Thảm cỏ nhân tạo & Khay vệ sinh Pet Potty.

NGUYÊN TẮC VẬN HÀNH TỐI THƯỢNG (ZERO-DEFECT AUTOMATION):
1. KHÔNG BAO GIỜ ĐỂ LỌT RÁC GIAO DIỆN: Chỉ quét thực thể từ vùng danh sách chính, loại bỏ 100% tài khoản người quét, trang host, quảng cáo và thanh bên.
2. KHÔNG BAO GIỜ MẤT DỮ LIỆU KHÁCH KHÔNG WEB: Nếu khách chỉ dùng Facebook, phải bóc tách bằng được Tên khách hàng từ Bio/Intro/Email prefix/Post signature và chuẩn hóa link Facebook chính xác tuyệt đối (không nhảy trang, không lỗi redirect).
3. KHÔNG BAO GIỜ TREO HỆ THỐNG: Quét ngầm Headless/HTTP SSR với Timeout 6 giây cho mỗi website; giải mã Cloudflare Email bằng XOR; phân tích Amazon không dính Captcha.
4. CHẤM ĐIỂM CÔNG BẰNG & THỰC TẾ: Tôn vinh mức độ hoạt động MXH (Recency + Engagement) và xác thực thông tin (Verifiability). Hiển thị rõ Nhiệt độ khách hàng (Lead Temperature) và xếp hạng ưu tiên cho đội Sales xử lý nhóm >= 61 điểm (đặc biệt là Tier S >= 85đ và Tier A >= 70đ).
```

---

## 🤖 ĐẶC TẢ CHI TIẾT 6 AUTONOMOUS AI AGENTS

### 🤖 Agent 1: `FollowerHarvesterAgent`
- **Role:** Strict Scoper & Rich Entity Harvester (Chrome Extension V3)
- **Objective:** Quét toàn bộ danh sách Followers/Following Facebook với 100% Numeric FB_ID, 0% rác hệ thống, tương thích hoàn toàn giao diện lưới 1 hoặc 2 cột.
- **Strict Rules:**
  - **Link-Anchored Card Discovery:** Quét tất cả thẻ `a[role='link']` và `a[href]` hợp lệ bên trong `div[role='dialog']` hoặc `div[role='main']`, truy ngược lên container thẻ chứa.
  - **Strict Scope Exclusion:** Loại trừ hoàn toàn `div[role='navigation']`, `div[role='banner']`, `header`, `LeftRail`, `RightRail`, `Stories/Tin`.
  - **4-Layer Exclusion Filter:**
    1. Chặn URL hệ thống (`/onthisday`, `/saved`, `/ads`, `/stories`, `/posts/`, `/watch`, `/marketplace`, `/events`, domain ngoài).
    2. Chặn chuỗi nút hệ thống & timestamp (`Sponsored`, `Được tài trợ`, `\d+\s*(giờ|phút|ngày|hrs|mins|days)`).
    3. Tự động phát hiện và loại trừ 100% Self Viewer Profile (tài khoản đang đăng nhập).
    4. Loại trừ Host Page đang quét.
  - **Rich Entity Extraction:** Trích xuất đủ `{name, fb_id (bắt buộc dạng số), url (đã chuẩn hóa), avatar_url (HD gốc không cắt ctp), subtitle, bio, category, keywords_found}`.
- **Output Contract:** `step1_followers_raw_{timestamp}.json` đẩy trực tiếp qua `BroadcastChannel('PET_LEAD_CHANNEL')` và `POST /api/upload-raw`.

---

### 👁️ Agent 2: `VisionClassifierAgent`
- **Role:** Multi-Stage Gatekeeper & NLP Synonym Matrix Engine
- **Objective:** Thẩm định đối tượng nuôi/kinh doanh chó bằng sự kết hợp giữa NLP Subword (250+ giống chó) và ONNX Vision (`dog-model.onnx` 224x224 RGB).
- **Strict Rules:**
  - **Lớp 0 (NLP Subword & Morpheme):** Quét trên 5 trường (`name` + `subtitle` + `bio` + `category` + `url_slug`). Tách từ ghép thông minh (`yorkshih` -> `yorkshire` + `shih tzu`; `pupco` -> `puppy` + `company`). Khớp RapidFuzz >= 82.
  - **Lớp 1 (Dog Breed Immunity):** Dùng `\b` word-boundary cho từ khóa ngắn (`\bspa\b`, `\bxe\b`, `\bhr\b`, `\bcat\b`). Nếu có tên giống chó hoặc từ khóa kennel/breeder, TUYỆT ĐỐI KHÔNG loại bỏ bởi từ khóa phụ.
  - **Lớp 2 (B2B Commercial Breeder Ground Truth):** Nếu xác nhận là B2B Breeder (`is_b2b_breeder = True`), khuôn mặt người trong Avatar được phê duyệt ngay với nhãn `'breeder_owner_portrait'` (P_dog = 0.95). Nếu không có tín hiệu B2B mà có mặt người rõ rệt -> Loại bỏ 100%.
  - **Lớp 3 & 4 (Feline & Landscape Guard):** Loại bỏ mèo và ảnh phong cảnh/hoa cỏ (HSV xanh lá/tím > 35%), nhưng không được đè nếu ONNX p_dog >= 0.65.
  - **Lớp 5 (ONNX Dual Inference):** Dùng bộ lọc LANCZOS đưa ảnh HD về 224x224.
    - *Nhánh A (Có từ khóa B2B/Giống chó):* duyệt cún thật (P_dog >= 0.50 -> 0.95), duyệt logo (`'kennel_brand_logo'` = 0.90), duyệt chủ trại (`'breeder_owner_portrait'` = 0.95).
    - *Nhánh B (Không có từ khóa):* đòi hỏi P_adult >= 0.65 & P_non < 0.20, hoặc P_puppy >= 0.85 & P_non < 0.10.
- **Output Contract:** `step1_verified_dogs_latest.json` + Dog Visual Gallery (lưu ảnh theo `{FB_ID}/{FB_ID}_XX.jpg`, click vào ảnh mở đúng Facebook khách hàng).

---

### 🔍 Agent 3: `ProfileEnricherAgent`
- **Role:** Multi-Subpage Headless Bulk Enricher, Deep Bio & Amazon Classifier
- **Objective:** Làm giàu 30 trường CRM ngầm (không bật tab làm treo máy), lấy bằng được tên khách hàng kể cả khi không có web, kiểm tra chính xác link FB/Web và phân loại Amazon.
- **Strict Rules:**
  - **Tầng 1 (FB SSR & Link Verification):** Gửi HTTP request với Sec-Fetch headers chuẩn để lấy SSR DOM của Facebook. Kiểm tra link sống/chết và chống chuyển hướng sai. Bóc tách: Page Name, Numeric FB_ID, Publish Time của bài viết mới nhất (click/parse latest post media), Likes/Shares/Comments trung bình, SĐT (+1 US), Email, và Website. Bảo toàn 100% Avatar HD từ Bước 1.
  - **Tầng 2 (Deep Bio & Multi-Subpage Website Crawler):** Nếu link web là `linktr.ee`, `hoo.be`, `beacons.ai` -> cào sâu vào trong để lấy Website thật và Storefront Amazon. Khi có Website thật -> quét trang chủ và tối đa 5-8 trang con (`/about`, `/meet-the-breeder`, `/contact`, `/supplies`, `/shop`, `/puppies`, `/application`) với Timeout cứng 6 giây. Giải mã 100% Cloudflare Email (`/cdn-cgi/l/email-protection`) bằng XOR.
  - **Tầng 3 (5-Tier Owner Name Resolution - Khắc phục triệt để lỗi thiếu tên khi không có Web):**
    1. Tìm trong Website `/about` & `/meet-the-breeder`.
    2. Tìm trong FB Bio/Intro bằng Contextual Regex (Owner, Founder, Meet, Hi I'm, Family).
    3. Tách tên từ tiền tố Email cá nhân (`toniroy40@` -> `Toni Roy`).
    4. Đối chiếu US Census First Names.
    5. Tra cứu Google AI / Good Dog / AKC Marketplace.
    *Nếu chỉ có FB và không lộ tên cá nhân, gán `'[Cleaned Page Name] - Admin/Breeder'`, tuyệt đối không để trống.*
  - **Tầng 4 (Safe Amazon Classifier - Không dính Captcha):** Phân tích liên kết `amazon.com`, `amzn.to`, `a.co` và văn bản quanh thẻ cha mà không mở hàng loạt tab trực tiếp. Phân loại chuẩn 5 nhãn:
    - `'Selling pet toys + Artificial grass/Pet toilets (TARGET)'` (+15đ)
    - `'Selling artificial grass/pet toilets (TARGET)'` (+10đ)
    - `'Selling pet toys'` (+7đ)
    - `'There\'s an Amazon link, but no target sales.'` (+3đ)
    - `'Amazon link not found'` (0đ)
- **Output Contract:** `step2_enriched_crm_latest.json` với đầy đủ thông tin đã xác minh (`verified_status = true/false`).

---

### ⚖️ Agent 4: `VerifierAndScorerAgent`
- **Role:** Anti-Saturation 5-Axis Scoring & Social Activity Ranking Engine
- **Objective:** Chấm điểm công bằng trên thang 100, đánh giá sát sao độ hoạt động MXH, tương tác, khả năng xác minh và hiển thị rõ Nhiệt độ khách hàng (Lead Temperature).
- **Công Thức Chấm Điểm 5 Trục Chống Bão Hòa:**
  $$\text{Total Score (0-100)} = \text{Axis 1 (0-35)} + \text{Axis 2 (10-30)} + \text{Axis 3 (0-15)} + \text{Axis 4 (0-10)} + \text{Axis 5 (0-15)} - \text{Penalties}$$
- **Chi Tiết 5 Trục Điểm:**
  - **Axis 1: Social Recency & Engagement (Max 35đ)**
    - *Post Recency:* $\le 3$ giờ: 30đ | 4-24 giờ: 27đ | 1-3 ngày: 24đ | 4-7 ngày: 18đ | 8-14 ngày: 12đ | 15-30 ngày: 6đ | > 30 ngày hoặc không rõ: 0đ
    - *Engagement Bonus:* Tương tác cao (nhiều Likes, Comments hỏi mua cún, Shares trên 3 bài gần nhất): +5đ | Tương tác trung bình: +3đ | Không tương tác: 0đ
    - *Dead/Inactive Penalty:* Link FB chết / chuyển hướng lỗi: -20đ (Đẩy xuống Tier D ngay lập tức) | Không đăng bài > 180 ngày: -10đ
  - **Axis 2: ICP Business Fit (Max 30đ)**
    - Dog Breeder / Commercial Kennel (B2B): 28 - 30đ
    - Pet Boarding / Training Academy (B2B): 20 - 22đ
    - Pet Supplies & Retailer / Grooming: 15đ
    - Pet Rescue / Animal Shelter: 14 - 16đ
    - Pet Owner / Individual: 10đ
  - **Axis 3: Breed Commercial Value (Max 15đ)**
    - 2+ High-Value Breeds (Golden Retriever, Frenchie, Bernedoodle, Goldendoodle, Boykin Spaniel, Corgi, Dachshund, Boxer, Mini Schnauzer, Yorkshih...): +15đ
    - 1 High-Value Breed: +10đ
    - Standard Breed: +5đ
    - Unknown: 0đ
  - **Axis 4: Verified Infrastructure (Max 10đ)**
    - Verified Live Official Website + Puppy Sales Page: +5đ (Nếu link web sai hoặc chết: 0đ)
    - Verified Phone / Business Email / Online Puppy Application Form: +5đ
  - **Axis 5: Amazon & Kit Signal (Max 15đ)**
    - Selling Pet Toys + Artificial Grass/Potty (TARGET): +15đ
    - Selling Artificial Grass/Potty (TARGET): +10đ
    - Selling Pet Toys: +7đ
    - Has Amazon Link (Other Supplies) or Currently Offers Take-Home Kit: +3đ đến +5đ
    - No Amazon Link: 0đ
- **Lead Temperature Mapping:**
  - `🔥 HOT (85 - 100đ | Tier S - Kim Cương)`: Hoạt động MXH $\le 3$ ngày, tương tác cao, Website/FB chuẩn xác, có tín hiệu Amazon/Puppy Page -> **Ưu tiên số 1: Telesale gọi chốt mẫu Take-Home Kit V2/V3 ngay trong ngày.**
  - `🌤️ WARM (61 - 84đ | Tier A & B Cao)`: Hoạt động MXH $\le 14$ ngày, thông tin liên hệ rõ ràng, điểm $\ge 61$ -> **Ưu tiên số 2: Đội Sales gửi Email cá nhân hóa + Gọi điện theo kịch bản.**
  - `💧 COOL (40 - 60đ | Tier B Thấp & C)`: Chỉ có FB hoạt động vừa phải hoặc quy mô nhỏ -> **Đưa vào chuỗi Email Marketing tự động (Test V2 Kit).**
  - `🧊 FROZEN (< 40đ | Tier D)`: Link lỗi, website chết, hoặc MXH bỏ hoang nhiều năm -> **Tạm qua / Lưu trữ, tuyệt đối không gửi cho Sales gọi.**
- **Strict Tie-Breaker Rule:** Khi 2 khách hàng có cùng Tổng điểm (Total Score), hệ thống **BẮT BUỘC** xếp hạng ưu tiên theo thứ tự:
  1. Khách có trang MXH đang hoạt động tích cực + có bằng chứng nhu cầu sản phẩm rõ ràng.
  2. Mức độ tương tác (Engagement Rate) cao hơn.
  3. Thời gian đăng bài gần nhất (Recency).
  4. Đã xác minh chính xác Tên + Link FB + Website.
  *Khách không có MXH hoặc MXH chết KHÔNG BAO GIỜ được xếp trên khách có MXH hoạt động.*

---

### 🧠 Agent 5: `RAGRecommendationAgent`
- **Role:** B2B Product-Fit & Sales Script Generator
- **Objective:** Định vị bán "Trải nghiệm nhận cún chuyên nghiệp (Puppy Take-Home Experience)" thay vì bán đồ giá rẻ, khớp đúng sản phẩm V2/V3, Cỏ nhân tạo, Khay vệ sinh.
- **Strict Rules:**
  - Khớp sản phẩm tự động theo ngách: Trại chó giống lớn/nhiều giống -> Đề xuất Puppy Take-Home Kit V2 (10-12 tuần, chủ lực) hoặc V3 (12-16 tuần, in logo riêng) + Thảm cỏ nhân tạo thoát nước nhanh.
  - Sinh kịch bản Email đầu tiên (Day 0): Không báo giá vội, chỉ hỏi kích thích phản hồi: *"Do you currently give your puppy buyers a take-home package?"*
  - Sinh kịch bản Telesale trực diện: Hỏi trực tiếp về gói quà tặng hiện tại của trại; nếu có -> hỏi thành phần & chi phí; nếu chưa -> chào mẫu Kit V2 tiêu chuẩn.

---

### 🚀 Agent 6: `CRMPusherAndDashboardAgent`
- **Role:** 4-Stage Funnel UI & Meta CRM Master Exporter
- **Objective:** Hiển thị Phễu 4 Tầng trực quan, đồng bộ sang Server `http://43.156.237.143:3007/` và xuất file JSON/Excel 30 trường không lỗi.
- **Strict Rules:**
  - Vận hành Multi-Tab Funnel Hub:
    - Tab 1: Tất cả leads (All Verified Leads).
    - Tab 2: Có Website (Verified Live Website).
    - Tab 3: Không Website - Chỉ FB (No Website - FB Only).
    - Tab 4: Có Amazon (tách rõ Pill Cỏ/Potty, Đồ chơi, Khác).
  - Hiển thị đầy đủ cột Nhiệt độ (`lead_temperature`), Điểm hoạt động MXH (`social_activity_score`), Tương tác (`engagement_metrics`), và Trạng thái xác minh Link (`link_verified_badge`).
  - Chống lỗi `saveReferenceError` bằng cơ chế kiểm tra biến an toàn trước khi xuất JSON LEAD-US và Excel Master.

---

## 📋 CRM 30 FIELDS STRICT SCHEMA & VALIDATION ASSERTIONS

### Danh Sách 31 Trường Chuẩn (Required Non-Null Fields)
1. `lead_id`
2. `numeric_fb_id`
3. `breeder_or_kennel_name`
4. `owner_contact_name`
5. `fb_profile_url_verified`
6. `fb_link_status`
7. `avatar_hd_url`
8. `has_website`
9. `official_website_url`
10. `website_status`
11. `business_email`
12. `phone_us_format`
13. `city`
14. `state`
15. `business_category`
16. `detected_dog_breeds`
17. `has_puppy_sales_page`
18. `has_online_application`
19. `last_post_publish_time`
20. `days_since_last_post`
21. `social_engagement_rate`
22. `social_activity_status`
23. `amazon_link_url`
24. `amazon_category_label`
25. `current_take_home_kit_status`
26. `total_lead_score`
27. `score_breakdown_5_axes`
28. `customer_tier`
29. `lead_temperature`
30. `rag_recommended_product`
31. `sales_next_action_script`

### Validation Assertions (Ràng Buộc Xác Thực Nghiêm Ngặt)
- **`fb_profile_url_verified`:** Phải khớp regex `^https://(www\.)?facebook\.com/(profile\.php\?id=\d+|[a-zA-Z0-9.\-_]+)/?$` và tuyệt đối **không chứa `l.facebook.com`**.
- **`owner_contact_name`:** Không bao giờ được là `null`, `""`, `'Unknown'`, hoặc `'N/A'`. Nếu khách chỉ có FB, phải lấy từ FB Bio/Intro hoặc `'[Page Name] (FB Owner)'`.
- **`official_website_url`:** Nếu không có web thật, ghi rõ `'No Website (FB Only)'`, tuyệt đối không điền link `facebook.com` hay `instagram.com` vào trường website.
- **`lead_temperature`:** Bắt buộc hiển thị rõ 1 trong 4 nhãn:
  - `'🔥 HOT (85-100)'`
  - `'🌤️ WARM (61-84)'`
  - `'💧 COOL (40-60)'`
  - `'🧊 FROZEN (<40)'`
