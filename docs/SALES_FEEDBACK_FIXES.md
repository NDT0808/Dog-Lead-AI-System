# KẾ HOẠCH & GIẢI PHÁP KHẮC PHỤC TRIỆT ĐỂ PHẢN HỒI SALES (17/10/2026)
> Tài liệu kỹ thuật chuẩn hóa dựa trên `Feedback 20261017.docx` cho hệ thống **Pet_Lead_AI_System**.

---

## 1. TỔNG HỢP CÁC VẤN ĐỀ TRỌNG YẾU TỪ SALES TEAM

Từ văn bản phản hồi ngày 17/10/2026 của bộ phận Sales (khách hàng mục tiêu: Trại chó & Người nhân giống tại Mỹ), hệ thống cũ gặp 4 nhóm lỗi nghiêm trọng:

1. **Lỗi đường link Facebook chuyển hướng sai (Critical):**
   - *Hiện tượng:* Nhấp vào link Facebook của khách hàng nhưng bị nhảy sang trang khác hoặc trang lỗi 404 thay vì vào đúng trang profile / fanpage của khách.
   - *Nguyên nhân:* URL bị dính chuỗi tracking redirect (`l.facebook.com/l.php?u=...`), tham số `fbclid=...`, hoặc link dạng slug tạm thời bị Facebook đổi ID.
   - *Hậu quả:* Sales mất thời gian, không xác minh được bài đăng và hình ảnh của trại chó.

2. **Khách hàng không có website mà chỉ có Facebook -> Bị mất tên khách hàng:**
   - *Hiện tượng:* Với những khách chỉ dùng Facebook, cột `name` bị trống hoặc bị gán nhầm sang tên chung chung (`Facebook User`, `Breeder Owner`).
   - *Nguyên nhân:* Bộ cào cũ chỉ lấy tên từ thẻ title website hoặc domain name. Khi website trống, không có cơ chế fallback bóc tách tên từ DOM Facebook (`h1`, `aria-label`, schema JSON-LD).

3. **Thông tin tên khách hàng và link website bị sai / lẫn lộn giữa các bản ghi:**
   - *Hiện tượng:* Tên khách hàng một đằng, link website hoặc link Facebook lại trỏ sang trại chó khác.
   - *Nguyên nhân:* Quá trình bóc tách bất đồng bộ (async scraping) bị race-condition, không có khóa định danh duy nhất (`fb_id`) xuyên suốt các bảng.

4. **Thiếu tiêu chí đánh giá mức độ hoạt động MXH (Social Media Activity & Interaction):**
   - *Hiện tượng:* Khách hàng không có Facebook hoặc link chết lại có điểm cao hơn khách hàng có Facebook đang hoạt động sôi nổi và đăng bán cún thường xuyên.
   - *Yêu cầu:* Phải kiểm tra link sống/chết, tần suất đăng bài, thời gian cập nhật gần nhất, và mức độ tương tác (likes, comments, shares).

5. **Yêu cầu đặc biệt từ Sếp (Boss Feature):**
   - Phải có một **Trang thư viện ảnh (Visual Photo Gallery)** hiển thị trực quan các hình ảnh chú chó đã được AI lọc, đánh số thư mục theo `FB_ID` (`{FB_ID}/{FB_ID}_01.jpg`...). Khi nhấp trực tiếp vào ảnh hoặc thẻ, hệ thống phải mở ngay trang Facebook của người dùng tương ứng.

---

## 2. MA TRẬN GIẢI PHÁP KỸ THUẬT TRIỆT ĐỂ (ROOT-CAUSE FIXES)

| STT | Vấn đề Sales phản ánh | Giải pháp kiến trúc mới trong `Pet_Lead_AI_System` | Module đảm nhiệm |
| :---: | :--- | :--- | :--- |
| **01** | Link FB click vào bị nhảy sang trang khác | **Chuẩn hóa URL 4 tầng:** Tự động giải mã unwrap URL redirect, loại bỏ `fbclid`, trích xuất `numeric FB_ID` và tạo URL chuẩn cố định `https://www.facebook.com/profile.php?id={fb_id}` song song với Clean Vanity URL. | `step1_follower_harvester` & `step3_verifier` |
| **02** | Khách chỉ có FB không lấy được tên | **Multi-Selector Fallback & Deep Parsing:** Quét `h1[dir="auto"]`, meta `og:title`, script `entity_id` / `name` trên DOM Facebook. Nếu dùng chế độ Google AI giả lập, tự động trích xuất mục "Tên chủ trại / Doanh nghiệp". | `step1_follower_harvester` & `step2_profile_enricher` |
| **03** | Tên và link bị sai lệch, nhầm lẫn | **Khóa chính FB_ID duy nhất (Mandatory Primary Key):** Mọi bản ghi dữ liệu từ Extension -> Python -> Database -> JSON CRM đều dùng `fb_id` làm Unique Key. Loại bỏ triệt để race-condition. | Toàn hệ thống (Data Contract) |
| **04** | Điểm số chưa phản ánh độ hoạt động MXH | **Bộ chấm điểm Social Activity Boost & Dead Link Penalty:**<br>- Link chết (Dead Link / 404): **Trừ 20 điểm**.<br>- FB đăng bài trong 24h: **+15 điểm**.<br>- FB đăng bài trong 7 ngày: **+10 điểm**.<br>- Tương tác cao (>20 likes/comments): **+10 điểm**.<br>- Ưu tiên sắp xếp từ điểm cao xuống thấp. | `step3_verifier_and_rag/scorer` |
| **05** | Sếp muốn xem ảnh chó và click vào mở trang cá nhân | **Trang Web Dog Visual Gallery:** Tự động tải ảnh chất lượng cao vào `{FB_ID}/{FB_ID}_XX.jpg`, sinh trang `dog-gallery.html` với lưới ảnh tương tác, nhãn giống chó, điểm tiềm năng, và nút mở trực tiếp link Facebook chuẩn. | `step1_follower_harvester/gallery` |

---

## 3. THIẾT KẾ DATA CONTRACT CHUẨN XUẤT CHO SALES & CRM

Mỗi bản ghi được xuất ra chuẩn hóa 100% theo định dạng Meta RAG (khớp với `http://43.156.237.143:3007/` và `FB-FS-2`):

```json
{
  "stt": "LEAD-US-000001",
  "name": "Tên Trại Chó / Chủ Trại Chuẩn Xác",
  "owner": "Tên Người Đại Diện (Decision Maker)",
  "url": "https://www.facebook.com/profile.php?id=100063922191947",
  "website": "https://www.trangwebchinhthuc.com",
  "phone": "19085988212",
  "email": "contact@breeder.com",
  "address": "Địa chỉ đầy đủ tại Mỹ",
  "city": "Thành phố",
  "state": "Bang (2 ký tự viết tắt)",
  "zip": "Mã zip 5 số",
  "country": "United States",
  "cat": "Dog Breeder / Commercial Kennel (B2B)",
  "cat_code": "breeder",
  "amz_cat": "Selling pet toys + Artificial grass/Pet toilets (TARGET)",
  "amz_link": "",
  "product_fit": "Puppy Starter Kit V2/V3 (Cỏ thoát nước + Khay Potty + Đồ chơi in logo)",
  "score": 85,
  "rank_tier": "Tier S",
  "is_prio": true,
  "sales_action": "🔥 TELESALE: Gọi chốt Take-Home Kit in logo độc quyền ngay trong ngày",
  "fb_id": "100063922191947",
  "avatar_url": "URL avatar chất lượng cao",
  "local_photo_collection": [
    "downloaded_collections/100063922191947/100063922191947_01.jpg",
    "downloaded_collections/100063922191947/100063922191947_02.jpg"
  ],
  "publishTime": "18/10/2026 10:30:00",
  "relativeTime": "2 giờ trước",
  "social_status": "Active (High Engagement)",
  "link_verified": true
}
```

Tài liệu này được áp dụng làm quy chuẩn kiểm thử nghiệm ngặt cho từng bước phát triển của dự án.
