---
name: step2-headless-profile-enricher
description: Kỹ năng quét trực quan 2 tab (Facebook Profile & Google AI Mode) giả lập người dùng lướt trang, cuộn xem phần giới thiệu & bài đăng gần nhất (publish_time), mở tab tìm kiếm Google AI gõ prompt cấu trúc và ấn Enter trích xuất thông tin chủ trại, đưa vào Hàng đợi Queue (queue_fb, queue_google_ai) và sử dụng RAG Deduplication từ UI để chống trùng lặp và làm giàu đủ 30 trường CRM chuẩn Meta.
---

# Kỹ năng: Step 2 Dual-Tab Google AI Enricher & RAG Queue Merger

## 1. Bản Chất Quy Trình Mới
Khác với phương pháp cũ (phải duyệt sâu website phức tạp dễ bị Cloudflare chặn), quy trình này:
1. **Hoàn toàn KHÔNG vào website nữa** (`không cần vô website nữa`).
2. **Quy trình 2 Tab trực quan mở bên cạnh tab Dashboard (`active: true`)**:
   - **Tab 1: Facebook Profile**: Vào trang cá nhân $\to$ cuộn mượt xem **Giới thiệu** $\to$ bóc tách SĐT, Email, Tỉnh/Bang $\to$ cuộn tiếp xuống xem **Bài đăng gần nhất** $\to$ bóc tách nội dung và `publish_time` $\to$ Lưu vào `queue_fb`.
   - **Tab 2: Google AI Mode**: Bật tab Google Search $\to$ giả lập người dùng gõ link Facebook + chuỗi từ khóa prompt chuẩn $\to$ ấn Enter như người dùng thật $\to$ cuộn xem kết quả $\to$ dùng mô hình NLP/Regex/Transformer trích xuất đủ 12 trường cấu trúc $\to$ Lưu vào `queue_google_ai`.
3. **Mỗi bước đều có phản hồi log lên Terminal Console**:
   - `[1. FACEBOOK]` $\to$ `[2. GIỚI THIỆU]` $\to$ `[3. BÀI ĐĂNG GẦN NHẤT]` $\to$ `[4. PUBLISH TIME]` $\to$ `[5. GOOGLE AI]` $\to$ `[6. KẾT QUẢ AI]` $\to$ `[7. RAG DEDUPLICATION]` $\to$ `[8. CRM PACK]`.
4. **Hàng đợi Queue & RAG Deduplication từ UI**:
   - Dữ liệu bóc tách được lưu vào 2 Queue:
     * `queue_fb_intro`: `{ fb_id, name, bio, phone, email, city, state, latest_post, publish_time, activity_status }`
     * `queue_google_ai`: `{ fb_id, owner_name, company_name, phone, website, city, state, zip, amz_cat, amz_link }`
   - UI Engine đọc ngược từ Queue, đối soát tránh trùng lặp theo `Numeric FB_ID` và `profile slug`, hợp nhất 30 trường CRM chuẩn Meta, đóng tab worker, focus quay lại UI và cập nhật trực tiếp lên bảng CRM và KPI counters!
