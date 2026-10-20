# Kế Hoạch Bản Thiết Kế: Hệ Thống Phễu Bóc Tách 4 Tầng Tuần Tự (Multi-Stage Funnel) & Google AI Hybrid

## 1. So Sánh & Đánh Giá 2 Phương Pháp

| Tiêu Chí So Sánh | Phương Pháp 1: Phễu Tuần Tự (Tuần Tự Từng Bước $\to$ Chia Nhánh Bảng) | Phương Pháp 2: Google AI Mode (Gemini One-Shot Search) |
| :--- | :--- | :--- |
| **Độ chính xác dữ liệu** | ⭐⭐⭐⭐⭐ **Cực cao** (Lấy từ nguồn gốc FB, Website chính thức và Link Amazon thật của trại). | ⭐⭐⭐⭐ **Khá cao** (Tổng hợp qua Gemini Overview, thỉnh thoảng phụ thuộc vào dữ liệu index của Google). |
| **Phân loại khách hàng (Segmentation)** | ⭐⭐⭐⭐⭐ **Rõ ràng tuyệt đối**: Chia rạch ròi 3 nhóm: Không Web, Có Web, Có Amazon (Đồ chơi / Cỏ / Khác). | ⭐⭐⭐ Gom chung vào 1 bảng CRM, cần bộ lọc phụ trợ để phân nhóm. |
| **Tốc độ thực thi** | ⭐⭐⭐ Chậm hơn vì phải duyệt qua nhiều vòng (FB $\to$ Web $\to$ Amazon). | ⭐⭐⭐⭐⭐ Rất nhanh vì chỉ cần 1 truy vấn AI Search. |
| **Rủi ro kỹ thuật** | ⚠️ **Cần xử lý**: Amazon chặn Captcha nếu mở nhiều link liên tục; Website trại chó tải chậm hoặc chặn Cloudflare. | 🟢 **Không bị chặn**: Google đã index sẵn toàn bộ, không lo Captcha của Amazon hay Cloudflare. |
| **Quyền kiểm soát của User** | ⭐⭐⭐⭐⭐ Người dùng kiểm soát từng giai đoạn, xem được tỷ lệ rơi rụng ở từng tầng phễu. | ⭐⭐⭐ Bấm 1 nút là chạy từ đầu đến cuối, ít tương tác can thiệp giữa chừng. |

---

## 2. Nhận Xét Quy Trình Của Bạn (Điểm Rất Tốt & Điểm Cần Tối Ưu)

### Điểm Rất Tốt (Xuất Sắc Về Mặt Marketing & CRM)
1. **Chia phễu theo tài nguyên số**: Việc chia [Có Website] và [Không Website] là chìa khóa vàng cho đội Sale. Người có Website là doanh nghiệp/trại cún chuyên nghiệp (B2B Kennel lớn); người không có Website thường là người nuôi gia đình nhỏ lẻ (Backyard breeder).
2. **Bóc tách sâu kênh Amazon**: Việc phân loại rõ 3 ngách:
   - **Bán Thảm cỏ / Nhà vệ sinh (Pet Grass / Potty)**: Đây là đối tượng cạnh tranh trực tiếp hoặc là đại lý tiềm năng cần mua sỉ thảm thay thế / khay chống tràn.
   - **Bán Đồ chơi (Pet Toys)**: Đối tượng cực kỳ tiềm năng để Cross-sell bán kèm gói Puppy Starter Kit.
   - **Bán đồ khác**: Đánh giá quy mô kinh doanh đa kênh.
3. **Cơ chế Queue & RAG Tổng hợp**: Sau mỗi bước chia tách, dữ liệu được đẩy vào hàng đợi Queue để RAG đối soát và hợp nhất thành một bản ghi CRM duy nhất mà không bị trùng lặp.

### Điểm "Chưa OK" Cần Tối Ưu Lại (Để Tránh Lỗi Hệ Thống)
1. ⚠️ **Rủi ro Amazon Robot Check / Captcha**:
   - Nếu Chrome mở trực tiếp 20 - 30 trang Amazon store liên tục, Amazon sẽ khóa IP hoặc bắt giải Captcha chữ, làm đứng toàn bộ tiến trình quét.
   - **Giải pháp tối ưu**: Ở tầng kiểm tra Amazon, hệ thống sẽ:
     - Phân tích cú pháp URL sản phẩm (ASIN, Storefront URL, keywords trên URL).
     - Kết hợp kiểm tra nội dung trang bằng Request ngầm / Google Search Snippet thay vì mở tab trực tiếp trên trình duyệt, đảm bảo an toàn 100% không bị dính Captcha.
2. ⚠️ **Website trại chó bị chết (Dead links) hoặc quá chậm**:
   - Cần cơ chế **Timeout 6 giây**: Nếu sau 6 giây website không tải xong hoặc chặn Cloudflare, hệ thống tự động gắn nhãn `Website không phản hồi` và chuyển dữ liệu sang Queue để Google AI bổ sung thay thế, không làm treo giao diện.
3. ⚠️ **Giao diện nếu sinh ra quá nhiều bảng riêng lẻ sẽ bị rối mắt**:
   - **Giải pháp UI**: Thiết kế dạng **Bảng Điều Khiển Phễu Đa Tầng (Multi-Tab Funnel Hub)** với các Tab Pills chuyển đổi mượt mà, kèm thanh thống kê tỷ lệ chuyển đổi (Funnel Conversion Bar) cực kỳ hiện đại.

---

## 3. Kiến Trúc Giải Pháp: Phễu Tuần Tự 4 Tầng Kết Hợp Hàng Đợi RAG

```
                 [BƯỚC 1: HỒ SƠ ĐÃ LỌC CÚN CƯNG]
                                │
                                ▼
         ╔══════════════════════════════════════════════╗
         ║ TẦNG 1: QUÉT FACEBOOK (BIO + PUBLISH TIME)  ║
         ╚══════════════════════════════════════════════╝
                                │
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       [BẢNG A1: CÓ WEBSITE]       [BẢNG A2: KHÔNG CÓ WEBSITE]
       (Chờ duyệt tiếp Tầng 2)     (Lưu Queue: Bán qua tin nhắn FB)
                 │
                 ▼ [Nút: Quét Website Tìm Chủ & Amazon]
         ╔══════════════════════════════════════════════╗
         ║ TẦNG 2: DUYỆT WEBSITE TRẠI (ABOUT/CONTACT)   ║
         ╚══════════════════════════════════════════════╝
                 │
                 ├─────────────────────────────┐
                 ▼                             ▼
       [BẢNG B1: CÓ LINK AMAZON]    [BẢNG B2: KHÔNG CÓ AMAZON]
       (Chờ phân loại ngách hàng)   (Lưu Queue: Chào sỉ/Dropship)
                 │
                 ▼ [Nút: Phân Loại Ngách Hàng Amazon]
         ╔══════════════════════════════════════════════╗
         ║ TẦNG 3: PHÂN TÍCH SẢN PHẨM AMAZON           ║
         ╚══════════════════════════════════════════════╝
                 │
       ┌─────────┼─────────────────────────────┐
       ▼         ▼                             ▼
[BẢNG C1: CỎ & POTTY]     [BẢNG C2: ĐỒ CHƠI]     [BẢNG C3: PHỤ KIỆN KHÁC]
(Đối thủ / Đại lý sỉ)     (Khách Cross-sell)     (Khách hàng tiềm năng)
       │         │                             │
       └─────────┼─────────────────────────────┘
                 │
                 ▼ [NÚT: ⚡ TỔNG HỢP VÀO RAG MASTER CRM]
         ╔══════════════════════════════════════════════╗
         ║ TẦNG 4: RAG DEDUPLICATION & MASTER CRM TABLE ║
         ╚══════════════════════════════════════════════╝
```

---

## 4. Thiết Kế Giao Diện UI Siêu Đẹp (Rich Aesthetics & Wow Factor)

1. **Thanh Stepper Phễu Trực Quan (Funnel Stage Progress)**:
   - Hiển thị 4 nấc chuyển đổi với hiệu ứng phát sáng Neon:
     * `① Quét FB Profile` $\to$ `② Lọc Website` $\to$ `③ Bóc Tách Amazon` $\to$ `④ Master CRM`.
2. **Hệ Thống Tab Phân Nhánh Thông Minh (Tabbed Funnel Views)**:
   - Hàng tab chính:
     * `📋 Tất cả hồ sơ (${total})`
     * `🌐 Có Website (${webCount})`
     * `📵 Không Website (${noWebCount})`
     * `🛒 Có Amazon (${amzCount})`
   - Nhóm pill lọc chuyên biệt khi ở Tab Amazon:
     * `🔥 Thảm Cỏ / Potty (${grassCount})` (Viền xanh Emerald)
     * `🧸 Đồ Chơi Thú Cưng (${toysCount})` (Viền tím Indigo)
     * `📦 Ngành Hàng Khác (${otherCount})` (Viền cam Amber)
3. **Thanh Công Cụ Hành Động Riêng Cho Từng Bảng**:
   - Mỗi bảng đều có nút tác vụ riêng:
     * Nút `🔍 Quét Tiếp Website Nhóm Này`
     * Nút `🏷️ Phân Loại Kênh Amazon`
     * Nút `⚡ Đẩy Vào Hàng Đợi & Hợp Nhất RAG`
     * Nút `📊 Xuất Excel Riêng Cho Nhóm Này`
