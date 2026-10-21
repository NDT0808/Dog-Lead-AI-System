---
name: fb-profile-funnel-live-enricher
description: Kỹ năng chuẩn hóa luồng bóc tách trực quan hai tầng từ công cụ fb_profile_funnel_scraper và video fb_funnel_scrapper_video.mp4. Hướng dẫn mở tab trình duyệt trực quan, hiển thị banner Facebook Intro & Funnel Inspector, cuộn nạp DOM sống 900px + 600px, chuyển hướng tab sang Website chính thức tìm tên chủ trại (Tami Hernandez), kiểm tra kênh bán hàng Amazon, định dạng log Terminal UI và cập nhật thời gian thực vào bảng CRM.
---

# Kỹ năng: FB Profile Funnel Live Enricher & Visual Website Inspector

## 1. Tổng Quan Quy Trình Bóc Tách Trực Quan (Từ Video Thực Tế `fb_funnel_scrapper_video.mp4`)

Hệ thống hoạt động theo mô hình duyệt trực tiếp trên trình duyệt Chrome thông qua tiện ích mở rộng `fb_profile_funnel_scraper`:
1. **Khởi động**: Người dùng nhập/dán danh sách link Facebook, chọn khoảng dòng (ví dụ: dòng 1 đến 5), bấm **"▶ Bắt đầu cào"**.
2. **Tầng 1 - Facebook Profile & Posts (Duyệt Trực Quan)**:
   - Trình duyệt điều hướng tab tới trang Facebook cá nhân/fanpage (`active: true` để Facebook Comet React tải đầy đủ DOM).
   - Injected Floating Banner xuất hiện trên đầu trang:
     `Facebook Intro & Funnel Inspector: Đang quét thông tin Giới thiệu & Bài viết [Dòng #X]`
     Kèm huy hiệu trạng thái: `Đang cuộn nạp DOM sống...`
   - Thực hiện cuộn sâu: `window.scrollTo({ top: 900, behavior: 'smooth' })`, đợi 1.5s, tiếp tục `window.scrollBy({ top: 600, behavior: 'smooth' })`.
   - Trích xuất: Tên trang/profile, FB_ID số, SĐT, Email, Địa chỉ, City, State, Zip, Bio, Bài viết mới nhất (`publish_time`, `relative_time`).
3. **Tầng 2 - Visual Website & Amazon Inspector**:
   - Nếu phát hiện hồ sơ có Website ngoài (ví dụ: `gooddog.com/breeders/...`, website độc lập của trại):
   - In log chuẩn:
     ```text
     [Dòng 3] Phát hiện Website https://www.gooddog.com/... -> Đang mở trình duyệt vào xem trực tiếp tìm chủ trại...
     ```
   - Tab trình duyệt chuyển hướng trực tiếp sang Website đó.
   - Injected Banner hiển thị:
     `🐾 PET & GRASS — LIVE WEBSITE INSPECTOR (MÔ PHỎNG CUỘN THỰC TẾ)`
     `Đang tải và chuẩn bị cuộn trang...` $\to$ `Đang cuộn xem Trang chủ từ từ (55%)...` $\to$ `Đã xem xong Trang chủ. Đang xử lý tiếp...`
   - Bóc tách tên chủ trại (Breeder Owner) từ các đoạn văn bản (ví dụ: *"About Louie ... Tami has passed Good Dog's screening process..."* $\to$ **Tami Hernandez**).
   - Quét tìm link cửa hàng Amazon (`amazon.com/stores/...`, `amzn.to/...`).
   - Gán độ tin cậy:
     * `Tier 1 - Website Verified`: Tìm thấy tên chủ trại trên website chính thức.
     * `Tier 2 - Email Prefix Fallback`: Suy luận từ tiền tố email cá nhân (ví dụ: `weswilks@...` $\to$ `Wes Wilks`).
     * `Tier 3 - Facebook Page Fallback`: Lấy tên Fanpage/Profile dự phòng.
4. **Cập nhật thời gian thực lên Web Dashboard**:
   - Gửi sự kiện bóc tách từng dòng lên UI Web Dashboard.
   - Cập nhật dòng tương ứng trên bảng CRM ngay lập tức với dữ liệu thật.
   - **Tuyệt đối không điền placeholder `Dog Breeder`, `# ---`, `United States` rác.**

---

## 2. Tiêu Chuẩn Log Terminal Console

Terminal Console trên giao diện Web Dashboard và Popup Extension phải hiển thị đồng nhất các dòng log:
```text
[04:01:10] Đang mở dòng 1/5: https://www.facebook.com/profile.php?id=61595523032602
[04:01:15] [Dòng 1] North Bama Kennels | SĐT: 12565508890 | Email: northbamakennels@gmail.com | Vị trí: Arab, AL 35016
[04:01:18] Đang mở dòng 2/5: https://www.facebook.com/profile.php?id=61594111838167
[04:01:23] [Dòng 2] St Bernard Puppy's For Adoption | Bài đăng: 20/10/2026 21:50:27 (6 giờ trước)
[04:01:25] Đang mở dòng 3/5: https://www.facebook.com/profile.php?id=61588668758830
[04:01:28] [Dòng 3] Phát hiện Website https://www.gooddog.com/breeders/shih-tzus-of-gilbert-arizona... -> Đang mở trình duyệt vào xem trực tiếp tìm chủ trại...
[04:01:32] [Dòng 3] Đang cuộn xem website: https://www.gooddog.com/breeders/...
[04:01:36] [Dòng 3] 🎯 Đã tìm thấy chủ trại: Tami Hernandez (Tier 1 - Website Verified) | SĐT: 14809169136 | Email: shihtzusofgilbert@gmail.com
[04:01:37] [Dòng 3] 🛒 Kiểm tra kênh Amazon: Amazon link not found
[04:01:38] 🎉 [LEAD-US-00003] Shih Tzus of Gilbert | Chủ: Tami Hernandez | Ngày đăng: 17/10/2026 07:54:00 (3 ngày trước) | Điểm: 88đ ➔ ĐÃ CẬP NHẬT CRM
```

---

## 3. Kiến Trúc Cầu Nối Web Dashboard $\leftrightarrow$ Extension (Bridge)

Web Dashboard (`http://127.0.0.1:8000/index.html`) giao tiếp với `fb_profile_funnel_scraper`:
1. **Phát lệnh từ UI**:
   ```javascript
   window.postMessage({
     type: 'START_STEP2_SCAN_VIA_EXTENSION',
     links: urls,
     options: { startIndex: fromVal - 1, endIndex: toVal - 1 }
   }, '*');
   ```
2. **Content Script đón nhận & chuyển tiếp Service Worker**:
   Content script tiêm trên `http://127.0.0.1:8000/*` nhận sự kiện và gọi:
   ```javascript
   chrome.runtime.sendMessage({
     action: 'START_AUTO',
     urls: event.data.links,
     startIndex: event.data.options.startIndex,
     endIndex: event.data.options.endIndex
   });
   ```
3. **Phản hồi ngược từ Extension về UI**:
   Mỗi khi bóc tách xong 1 hồ sơ hoặc phát hiện website, service worker broadcast trạng thái, content script gửi lại UI Dashboard qua `window.postMessage({ type: 'PET_LEAD_STEP2_EVENT', payload: msg })`.
   UI Dashboard nhận và cập nhật trực tiếp dòng tương ứng trong bảng CRM và Terminal Console!
