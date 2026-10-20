---
name: step2-dual-tab-google-ai-enricher
description: Kỹ năng quét trực quan 2 tab (Facebook Profile & Google AI Mode) giả lập người dùng lướt trang, cuộn xem phần giới thiệu & bài đăng gần nhất (publish_time), mở tab tìm kiếm Google AI gõ prompt cấu trúc và ấn Enter trích xuất thông tin chủ trại, đưa vào Hàng đợi Queue (queue_fb, queue_google_ai) và sử dụng RAG Deduplication từ UI để chống trùng lặp và làm giàu đủ 30 trường CRM chuẩn Meta.
---

# Kỹ năng: Step 2 Dual-Tab Google AI Enricher & RAG Queue Merger

## 1. Bản Chất Quy Trình Mới
Khác với phương pháp cũ (phải duyệt sâu website phức tạp dễ bị Cloudflare chặn), quy trình này:
1. **Hoàn toàn KHÔNG vào website nữa** (`không cần vô website nữa`).
2. **Quy trình 2 Tab trực quan mở bên cạnh tab Dashboard (`active: false`)**:
   - Tab duyệt web mở ngầm bên cạnh, người dùng giữ nguyên 100% trên giao diện Dashboard theo dõi.
   - Khi chuyển từ Bước 1 sang Bước 2 (`btnSwitchToStep2` / `btnLoadFromStep1`), hệ thống tự động **xóa sạch toàn bộ bảng CRM và log cũ** của ngày hôm trước, bắt đầu mẻ quét mới hoàn toàn tinh sạch.
   - **Tab 1: Facebook Profile**: Vào trang cá nhân $\to$ cuộn mượt xem **Giới thiệu** $\to$ bóc tách SĐT, Email, Tỉnh/Bang $\to$ cuộn tiếp xuống xem **Bài đăng gần nhất** $\to$ bóc tách nội dung và `publish_time` $\to$ Lưu vào `queue_fb`.
   - **Tab 2: Google AI Mode**: Bật Google (`google.com/?hl=vi`) $\to$ định vị chính xác nút lá **"✨ Chế độ AI"** (text < 35 ký tự, loại bỏ thẻ div cha) $\to$ nhấp nút kích hoạt viền phát sáng $\to$ gõ link Facebook + chuỗi prompt cấu trúc $\to$ ấn Enter mô phỏng người dùng thật. Trang kết quả được tải kèm cờ `udm=50` (Universal Display Mode của Google Gemini Search) $\to$ trích xuất đủ các trường cấu trúc $\to$ Lưu vào `queue_google_ai`.
3. **Mỗi bước đều có phản hồi log lên Terminal Console**:
   - `[1. FACEBOOK]` $\to$ `[2. GIỚI THIỆU]` $\to$ `[3. BÀI ĐĂNG GẦN NHẤT]` $\to$ `[4. PUBLISH TIME]` $\to$ `[5. GOOGLE AI]` $\to$ `[6. KẾT QUẢ AI]` $\to$ `[7. RAG DEDUPLICATION]` $\to$ `[8. CRM PACK]`.
4. **Hàng đợi Queue & RAG Deduplication từ UI**:
   - Dữ liệu bóc tách được lưu vào 2 Queue:
     * `queue_fb_intro`: `{ fb_id, name, bio, phone, email, city, state, latest_post, publish_time, activity_status }`
     * `queue_google_ai`: `{ fb_id, owner_name, company_name, phone, website, city, state, zip, amz_cat, amz_link }`
   - UI Engine đọc ngược từ Queue, đối soát tránh trùng lặp theo `Numeric FB_ID` và `profile slug`, hợp nhất 30 trường CRM chuẩn Meta, đóng tab worker, focus quay lại UI và cập nhật trực tiếp lên bảng CRM và KPI counters!

---

## 2. Cấu Trúc Prompt Google AI Chuẩn (Từ Recording 2026-10-16 150400.mp4)
Khi tab Google Search mở ra, câu truy vấn được nhập vào:
```text
{fb_url} 名字 全名 用户社交 工作职位 国家地址 行业 添加日期 公司名称 公司网址 公司社交 公司所处国家 州 城市 公司所在行业 电话 hãy tìm và dịch ra tiếng việt giúp tôi
```

### Bộ bóc tách thông minh 12 trường:
1. **Tên chủ trại (`owner_name`)**: Ưu tiên 全名 (Họ và tên) $\to$ 名字 (Tên) $\to$ Tên người đại diện.
2. **Tên công ty / Trại (`company_name`)**: 公司名称.
3. **Số điện thoại (`phone`)**: 电话 / Số điện thoại di động chuẩn E.164 (+1...).
4. **Website chính thức (`website`)**: 公司网址.
5. **Kênh Amazon (`amazon_channel`)**: Phân loại theo ngành Cỏ/Potty, Đồ chơi, Khác.
6. **Mạng xã hội (`social_profiles`)**: 公司社交 (Instagram, TikTok...).
7. **Bang (`state`)**: 州 (Mã 2 chữ cái chuẩn bưu điện Mỹ).
8. **Thành phố (`city`)**: 城市.
9. **Địa chỉ (`address`)**: 国家地址.
10. **Mã bưu điện (`zip`)**: Zip code 5 số Mỹ.
11. **Ngành nghề (`category`)**: Pet Breeding / Commercial Kennel (B2B).
12. **Gói sản phẩm mục tiêu (`product_fit`)**: Phù hợp cho cún con (Take-Home Kit V3).

---

## 3. Kiến Trúc Hàng Đợi (Queue Manager) & RAG Merger
```javascript
class LeadEnrichmentQueueManager {
  constructor() {
    this.fbQueue = new Map();     // key: fbid or url
    this.aiQueue = new Map();     // key: fbid or url
    this.crmRegistry = new Set(); // existing processed lead IDs
  }

  pushFbIntro(key, data) {
    this.fbQueue.set(key, { ...data, timestamp: Date.now() });
  }

  pushGoogleAi(key, data) {
    this.aiQueue.set(key, { ...data, timestamp: Date.now() });
  }

  ragDeduplicateAndMerge(key) {
    const fb = this.fbQueue.get(key) || {};
    const ai = this.aiQueue.get(key) || {};
    const fbid = fb.fb_id || ai.fb_id || key;
    
    // Chống trùng lặp tuyệt đối
    if (this.crmRegistry.has(fbid)) return null;
    this.crmRegistry.add(fbid);

    // Hợp nhất dữ liệu ưu tiên trường đầy đủ nhất
    return {
      fb_id: fbid,
      owner_name: ai.owner_name || fb.owner_name || 'Dog Breeder (Chủ trại)',
      name: fb.name || ai.company_name || 'Dog Breeder',
      phone: ai.phone || fb.phone || '',
      email: ai.email || fb.email || '',
      website: ai.website || fb.website || '',
      city: ai.city || fb.city || '',
      state: ai.state || fb.state || '',
      publish_time: fb.publish_time || 'Gần đây',
      activity_status: fb.activity_status || '✓ TÍCH CỰC (Trại đang hoạt động)',
      amazon_channel: ai.amz_link || 'Amazon link not found'
    };
  }
}
```

---

## 4. Quy Tắc Loại Trừ Ảnh Đại Diện Đơn Điệu
- Bắt buộc kiểm tra avatar trước khi mở tab:
  * Loại bỏ URL chứa `t1.30497-1`, `453178253`, `825352834`, `blank_profile`, `ui-avatars`, `rsrc.php`.
  * Loại bỏ avatar chữ cái đơn sắc / monogram (dưới 65 màu).
  * Chỉ đưa vào xử lý các hồ sơ có ảnh thật rõ nét của cún cưng hoặc chân dung chủ trại.
