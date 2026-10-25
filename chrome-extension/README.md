# 🐾 Pet Lead AI - Master Suite (All-In-One Chrome Extension v3.5)

> **Tiện ích mở rộng hợp nhất duy nhất** phục vụ thu thập dữ liệu khách hàng tiềm năng ngành thú cưng (Pet Lead Intelligence): Quét Người theo dõi Facebook, lọc AI thị giác (`dog-model.onnx`), bóc tách Người đại diện / Chủ trại, Địa chỉ chi tiết US/CA, Email (giải mã Cloudflare), Số điện thoại và Facebook ID (UID).

---

## 🌟 TỔNG QUAN HỆ THỐNG ĐÃ ĐƯỢC CHUẨN HÓA

Toàn bộ các extension trước đây (`fb_following_scraper`, `website-owner-finder`, `website-contact-collector`, `fb_profile_funnel_scraper`) đã được **hợp nhất hoàn chỉnh thành 1 extension duy nhất** tại thư mục `chrome-extension` (hoặc `chrome-extention`).

Hệ thống cung cấp **2 Chế độ hoạt động linh hoạt**:

### Chế độ A: Quy Trình Khép Kín Đầy Đủ (Full Funnel Lead Pipeline)
1. **Bước 1 (Lọc AI Thị Giác & Follower Harvester)**: Quét danh sách người theo dõi/bạn bè từ Facebook, bóc tách 100% ID số (Numeric UID), Avatar HD, chạy mô hình AI nhận diện chó (`dog-model.onnx`) kết hợp ma trận NLP 250+ giống chó.
2. **Bước 2 (Master CRM Funnel)**: Quét sâu profile Facebook (Bio, SĐT, Vị trí, Bài đăng gần nhất), quét website tìm Chủ trại, Địa chỉ US, thẩm định kênh Amazon (Cỏ nhân tạo/Khay vệ sinh Potty/Đồ chơi) và xuất ra Bảng Master Meta CRM 30 trường.

### Chế độ B: Các Công Cụ Chạy Độc Lập (Standalone Fast Tools)
Người dùng có thể nạp file CSV, TXT, Excel hoặc dán URL để **chạy riêng lẻ từng bước** mà không cần qua các bước khác:
- 🆔 **Công cụ 1: Chỉ Lấy Facebook ID (UID Super-Fast)**:
  - Link Facebook có ID số (`profile.php?id=`, `/1000...`, `/p/...`): **Trích xuất tức thì trong 0 giây**, không mở tab.
  - Link Facebook vanity username: Mở tab 1 lần đọc metadata/script trong 1s, không duyệt subpages.
  - Link Website: Tự động tìm link Facebook trên web rồi lấy UID.
- 📍 **Công cụ 2: Bóc Tách Địa Chỉ & Liên Hệ Website (Contact & Address Collector)**:
  - Nạp file CSV (ví dụ Google Maps CSV) hoặc dán link website.
  - Tự động bóc tách Email (kể cả Cloudflare Hex mã hóa), Số điện thoại, và **Địa chỉ chi tiết** (Số nhà/Street, Thành phố/City, Bang/State chuẩn 2 chữ cái, ZipCode, Quốc gia).
- 👤 **Công cụ 3: Tìm Người Đại Diện / Chủ Trại Website (Website Owner & Founder Finder)**:
  - Duyệt trang chủ và các trang giới thiệu (`/about`, `/meet-the-breeder`, `/team`, `/contact`).
  - Sử dụng bộ luật Heuristics chuyên sâu (loại trừ từ rác, lọc họ tên tiếng Anh) + tùy chọn kết nối **Google Gemini AI NER** để trích xuất tên người thật.
- ⚡ **Nút "Đẩy Dữ Liệu Vào Master CRM"**:
  - Có sẵn ở tất cả các công cụ độc lập, cho phép người dùng chạy riêng lẻ xong vẫn có thể gộp kết quả vào Bảng CRM tổng hợp bất cứ lúc nào!

---

## 🇻🇳 HƯỚNG DẪN CÀI ĐẶT TRÊN TRÌNH DUYỆT (CHROME / EDGE / BRAVE)

1. Mở file `0_MO_TIEN_ICH_CHROME_EXTENSION.bat` để mở thư mục tiện ích trong Windows Explorer.
2. Mở trình duyệt, truy cập: `chrome://extensions/`
3. Bật công tắc **"Chế độ dành cho nhà phát triển" (Developer mode)** ở góc trên bên phải.
4. Bấm nút **"Tải tiện ích đã giải nén" (Load unpacked)** ở góc trên bên trái.
5. Chọn đúng thư mục duy nhất:
   ```
   d:\TRIHO-Platform\Plugins\Trong-plugin\Dog-Lead-AI-System\chrome-extension
   ```
6. Tiện ích `Pet Lead AI - Master Suite` sẽ xuất hiện trên thanh công cụ!

---

## 🇨🇳 安装与使用说明 (中文版)

1. 双击运行 `0_MO_TIEN_ICH_CHROME_EXTENSION.bat` 打开插件所在文件夹。
2. 在 Chrome / Edge 浏览器中打开：`chrome://extensions/`
3. 开启右上角的 **"开发者模式" (Developer mode)**。
4. 点击左上角的 **"加载已解压的扩展程序" (Load unpacked)**。
5. 选择此文件夹：`chrome-extension`。
6. 点击浏览器插件图标即可使用：一键采集粉丝、打开全功能控制台、或运行单独工具（仅提取UID、挖掘官网联系地址、查找负责人）。
