#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lead Activity Ledger & Daily Attendance Matrix Engine (Bảng Chấm Công Hoạt Động Khách Hàng)
-----------------------------------------------------------------------------------------
Hệ thống theo dõi hành vi đăng bài & chấm công hàng ngày cho khách hàng tiềm năng:
1. Quản lý dữ liệu chuỗi thời gian (Time-Series Activity Ledger) theo từng ngày.
2. Khóa định danh 100% bằng Numeric FB_ID (trùng thì điểm danh ngày mới, mới thì ghi danh bắt đầu theo dõi).
3. Tự động tính toán:
   - Tần suất chuyên cần (Attendance Rate)
   - Chuỗi ngày hoạt động liên tục (Active Streak)
   - Khung giờ vàng đăng bài (Golden Hour Window)
   - Đề xuất kịch bản Telesale mở đầu cuộc gọi (RAG Sales Hook)
4. Tự động xuất tệp Excel Ma Trận Chấm Công Màu Sắc (Green = Có đăng bài, Gray = Nghỉ).
"""

import os
import sys
import json
import time
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional

try:
    import openpyxl
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    openpyxl = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data", "activity_ledger")
os.makedirs(DATA_DIR, exist_ok=True)

LEDGER_JSON_PATH = os.path.join(DATA_DIR, "lead_activity_timesheet_latest.json")
EXCEL_MATRIX_PATH = os.path.join(DATA_DIR, "Lead_Attendance_Matrix_Master.xlsx")


def parse_timestamp_to_date_and_time(ts_val: Any, date_str: str = "") -> tuple[str, str, int]:
    """Chuyển đổi timestamp hoặc chuỗi ngày giờ sang (YYYY-MM-DD, HH:MM:SS, timestamp_int)."""
    ts = 0
    if ts_val:
        try:
            ts = int(ts_val)
        except (ValueError, TypeError):
            ts = 0

    if ts > 1500000000:
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M:%S"), ts

    # Fallback parse từ chuỗi DD/MM/YYYY HH:MM:SS
    if date_str:
        clean = date_str.replace("(Pinned)", "").replace("(Reels/Feed)", "").replace("(Reels)", "").strip()
        parts = clean.split()
        if len(parts) >= 2:
            d_part, t_part = parts[0], parts[1]
            try:
                d_dt = datetime.strptime(d_part, "%d/%m/%Y")
                return d_dt.strftime("%Y-%m-%d"), t_part, int(d_dt.timestamp())
            except Exception:
                pass

    today = datetime.now(timezone.utc)
    return today.strftime("%Y-%m-%d"), today.strftime("%H:%M:%S"), int(today.timestamp())


def calculate_golden_hour_slot(post_times: List[str]) -> str:
    """Xác định khung giờ vàng hay online đăng bài nhất của chủ trại."""
    if not post_times:
        return "16:00 - 18:00 (Mặc định)"

    hours = []
    for pt in post_times:
        try:
            h = int(pt.split(":")[0])
            hours.append(h)
        except Exception:
            pass

    if not hours:
        return "16:00 - 18:00"

    avg_h = round(sum(hours) / len(hours))
    start_h = max(0, avg_h - 1)
    end_h = min(23, avg_h + 1)
    return f"{start_h:02d}:00 - {end_h:02d}:00"


def generate_rag_sales_hook(lead: Dict[str, Any], latest_post_time: str, golden_slot: str) -> str:
    """Sinh kịch bản mở đầu cuộc gọi (Telesale Icebreaker Hook) theo thời gian đăng bài."""
    owner = lead.get("owner") or "Chủ trại"
    name = lead.get("name") or "Trại cún"
    has_amazon = lead.get("has_amazon", False)
    
    post_desc = latest_post_time or "gần đây"
    if "(Reels/Feed)" in post_desc or "Reels" in post_desc:
        action_note = "vừa đăng video/Reel mới"
    elif "(Pinned)" in post_desc:
        action_note = "có bài viết ghim nổi bật"
    else:
        action_note = "vừa đăng bài cập nhật đàn cún"

    hook = (
        f"🔥 TELESALE HOOK: 'Chào {owner}, em thấy trại {name} {action_note} ({post_desc})! "
        f"Giai đoạn này trại đang có đàn cún con năng động, bên em cung cấp giải pháp Khay vệ sinh Pet Potty 3 lớp "
        f"thoát nước nhanh và Bộ quà tặng Take-Home Kit in logo riêng của trại {name}. "
        f"Khung giờ gọi tối ưu: {golden_slot}.'"
    )
    if has_amazon:
        hook += " [Lưu ý: Khách có bán Storefront trên Amazon -> Đề xuất giá Wholesale đại lý]"
    return hook


class LeadActivityLedger:
    """Bộ máy quản lý Bảng Chấm Công Hoạt Động Khách Hàng (Time-Series Activity Ledger)."""

    def __init__(self, ledger_file: str = LEDGER_JSON_PATH):
        self.ledger_file = ledger_file
        self.leads_dict: Dict[str, Dict[str, Any]] = {}
        self.all_dates: List[str] = []
        self.load()

    def load(self):
        """Nạp dữ liệu bảng chấm công đã có."""
        if os.path.exists(self.ledger_file):
            try:
                with open(self.ledger_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        self.leads_dict = data.get("leads", {})
                        self.all_dates = data.get("tracked_dates", [])
                    elif isinstance(data, list):
                        for item in data:
                            fbid = str(item.get("fb_id") or item.get("stt") or "").strip()
                            if fbid:
                                self.leads_dict[fbid] = item
            except Exception as e:
                print(f"[Ledger] Cảnh báo đọc ledger file: {e}")

    def save(self):
        """Lưu trữ bảng chấm công ra file JSON."""
        # Sắp xếp các ngày theo thứ tự tăng dần
        all_dates_set = set(self.all_dates)
        for lead in self.leads_dict.values():
            all_dates_set.update(lead.get("activity_ledger", {}).keys())
        self.all_dates = sorted(list(all_dates_set))

        payload = {
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "total_leads": len(self.leads_dict),
            "tracked_dates": self.all_dates,
            "leads": self.leads_dict
        }
        with open(self.ledger_file, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"[Ledger] ✅ Đã lưu dữ liệu bảng chấm công ({len(self.leads_dict)} leads) tại: {self.ledger_file}")

    def ingest_crm_leads(self, leads: List[Dict[str, Any]], scan_date: Optional[str] = None) -> int:
        """
        Nạp mảng khách hàng CRM vào bảng chấm công:
        - Nếu là người cũ: Điểm danh cho ngày hôm đó, bảo toàn ngày cũ.
        - Nếu là người mới: Khởi tạo hồ sơ, ghi nhận ngày hôm đó và bắt đầu chu kỳ theo dõi.
        """
        today_date = scan_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today_date not in self.all_dates:
            self.all_dates.append(today_date)
            self.all_dates.sort()

        updated_count = 0

        for item in leads:
            fb_id = str(item.get("fb_id") or "").strip()
            if not fb_id or fb_id == "0":
                fb_id = str(item.get("stt") or item.get("lead_id") or "").strip()
            if not fb_id:
                continue

            # Lấy thông tin ngày đăng từ lead
            pub_ts = item.get("publishTimestamp") or 0
            pub_time_str = item.get("publishTime") or ""
            post_date, post_time, raw_ts = parse_timestamp_to_date_and_time(pub_ts, pub_time_str)

            # Xác định loại bài đăng
            post_type = "Feed"
            if "(Reels/Feed)" in pub_time_str or "(Reels)" in pub_time_str:
                post_type = "Reels"
            elif "(Pinned)" in pub_time_str:
                post_type = "Pinned"

            # 1. Nếu là người cũ: Cập nhật thông tin profile và điểm danh
            if fb_id in self.leads_dict:
                lead_entry = self.leads_dict[fb_id]
                # Đồng bộ thông tin CRM mới nhất
                lead_entry["name"] = item.get("name") or lead_entry.get("name")
                lead_entry["owner"] = item.get("owner") or lead_entry.get("owner")
                lead_entry["phone"] = item.get("phone") or lead_entry.get("phone")
                lead_entry["email"] = item.get("email") or lead_entry.get("email")
                lead_entry["website"] = item.get("website") or lead_entry.get("website")
                lead_entry["amazon_url"] = item.get("amazon_url") or lead_entry.get("amazon_url")
                lead_entry["has_amazon"] = item.get("has_amazon", lead_entry.get("has_amazon", False))
                lead_entry["city"] = item.get("city") or lead_entry.get("city")
                lead_entry["state"] = item.get("state") or lead_entry.get("state")
                lead_entry["url"] = item.get("url") or lead_entry.get("url")
                lead_entry["avatar"] = item.get("avatar") or lead_entry.get("avatar")
                lead_entry["score"] = item.get("score") or lead_entry.get("score")
                lead_entry["rank_tier"] = item.get("rank_tier") or lead_entry.get("rank_tier")
                lead_entry["sales_action"] = item.get("sales_action") or lead_entry.get("sales_action")
            else:
                # 2. Nếu là người mới: Khởi tạo hồ sơ
                lead_entry = {
                    "fb_id": fb_id,
                    "lead_id": item.get("lead_id") or f"LEAD-US-{len(self.leads_dict) + 1:05d}",
                    "name": item.get("name") or "Facebook User",
                    "owner": item.get("owner") or "Chủ trại",
                    "phone": item.get("phone") or "",
                    "email": item.get("email") or "",
                    "website": item.get("website") or "",
                    "amazon_url": item.get("amazon_url") or "",
                    "has_amazon": bool(item.get("has_amazon")),
                    "city": item.get("city") or "",
                    "state": item.get("state") or "",
                    "url": item.get("url") or "",
                    "avatar": item.get("avatar") or "",
                    "score": item.get("score") or 75,
                    "rank_tier": item.get("rank_tier") or "Tier A",
                    "sales_action": item.get("sales_action") or "Telesale Take-Home Kit",
                    "activity_ledger": {}
                }
                self.leads_dict[fb_id] = lead_entry

            # ĐIỂM DANH: Ghi nhận hoạt động đăng bài vào ledger
            ledger_records = lead_entry.setdefault("activity_ledger", {})

            # Điểm danh cho ngày đăng thực tế của bài viết
            ledger_records[post_date] = {
                "posted": True,
                "post_time": post_time,
                "post_type": post_type,
                "timestamp": raw_ts,
                "full_str": pub_time_str
            }

            # Cập nhật mốc đăng gần nhất
            cur_latest_ts = lead_entry.get("latest_post_ts", 0)
            if raw_ts >= cur_latest_ts:
                lead_entry["latest_post_ts"] = raw_ts
                lead_entry["latest_post_time"] = pub_time_str or f"{post_date} {post_time} ({post_type})"

            # Tính toán chỉ số chuyên cần & chuỗi liên tục
            active_dates = [d for d, v in ledger_records.items() if v.get("posted")]
            lead_entry["total_active_days"] = len(active_dates)

            # Tính chuỗi streak (ngày liên tiếp gần nhất)
            sorted_active = sorted(active_dates)
            streak = 1 if sorted_active else 0
            if len(sorted_active) > 1:
                # Đếm số ngày liên tục lùi dần từ ngày gần nhất
                cur_streak = 1
                for i in range(len(sorted_active) - 1, 0, -1):
                    d1 = datetime.strptime(sorted_active[i], "%Y-%m-%d")
                    d2 = datetime.strptime(sorted_active[i - 1], "%Y-%m-%d")
                    if (d1 - d2).days == 1:
                        cur_streak += 1
                    else:
                        break
                streak = cur_streak
            lead_entry["active_streak_days"] = streak

            # Tỷ lệ chuyên cần
            total_tracked = len(self.all_dates) or 1
            pct = round((len(active_dates) / total_tracked) * 100, 1)
            lead_entry["attendance_rate"] = f"{len(active_dates)}/{total_tracked} ({pct}%)"

            # Khung giờ vàng đăng bài
            post_times_list = [v.get("post_time") for v in ledger_records.values() if v.get("post_time")]
            golden_slot = calculate_golden_hour_slot(post_times_list)
            lead_entry["golden_hour_slot"] = golden_slot

            # Kịch bản RAG Telesale
            lead_entry["sales_telesale_hook"] = generate_rag_sales_hook(
                lead_entry, lead_entry.get("latest_post_time", ""), golden_slot
            )

            updated_count += 1

        self.save()
        return updated_count

    def export_attendance_matrix_excel(self, output_excel: str = EXCEL_MATRIX_PATH, days_window: int = 14) -> str:
        """Xuất Bảng Ma Trận Điểm Danh Khách Hàng Chuẩn Excel (Màu Sắc Heatmap)."""
        if not openpyxl:
            print("[Ledger] Openpyxl chưa cài đặt, bỏ qua xuất Excel.")
            return ""

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Bảng Điểm Danh Hoạt Động"

        # Định dạng màu sắc bảng chấm công
        fill_header = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
        fill_date_header = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        fill_green_present = PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid")  # Xanh lá: Có đăng bài
        fill_gray_absent = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")    # Xám: Không đăng bài

        font_header = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
        font_green = Font(name="Segoe UI", size=9, bold=True, color="065F46")
        font_gray = Font(name="Segoe UI", size=9, color="94A3B8")
        font_data = Font(name="Segoe UI", size=9.5)
        font_bold = Font(name="Segoe UI", size=9.5, bold=True)

        border_thin = Border(
            left=Side(style='thin', color='E2E8F0'),
            right=Side(style='thin', color='E2E8F0'),
            top=Side(style='thin', color='E2E8F0'),
            bottom=Side(style='thin', color='E2E8F0')
        )

        align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)
        align_left = Alignment(horizontal="left", vertical="center")

        # Cắt lấy danh sách ngày hiển thị (mặc định lấy 14 ngày gần nhất hoặc toàn bộ)
        display_dates = self.all_dates[-days_window:] if len(self.all_dates) > days_window else self.all_dates
        if not display_dates:
            display_dates = [datetime.now(timezone.utc).strftime("%Y-%m-%d")]

        # Tiêu đề các cột cố định bên trái
        fixed_headers = [
            "STT", "FB_ID", "Chủ Sở Hữu (Owner)", "Tên Trại / Trang", 
            "SĐT (Phone)", "Email", "Website / Amazon", "Vị Trí",
            "Đăng Gần Nhất", "Khung Giờ Vàng", "Chuỗi Active", "Tỷ Lệ Chuyên Cần"
        ]

        # Tiêu đề cột ngày
        date_headers = [datetime.strptime(d, "%Y-%m-%d").strftime("%d/%m") if "-" in d else d for d in display_dates]

        # Tiêu đề cột gợi ý bên phải
        trailing_headers = ["Kịch Bản Telesale (RAG Sales Hook)"]

        full_headers = fixed_headers + date_headers + trailing_headers
        ws.append(full_headers)

        # Style header
        for col_idx, cell in enumerate(ws[1], start=1):
            if col_idx <= len(fixed_headers):
                cell.fill = fill_header
            elif col_idx <= len(fixed_headers) + len(date_headers):
                cell.fill = fill_date_header
            else:
                cell.fill = fill_header
            cell.font = font_header
            cell.alignment = align_center

        # Render từng hàng dữ liệu
        row_num = 2
        for idx, (fb_id, lead) in enumerate(self.leads_dict.items(), start=1):
            owner = lead.get("owner", "")
            name = lead.get("name", "")
            phone = lead.get("phone", "")
            email = lead.get("email", "")
            web = lead.get("website") or lead.get("amazon_url") or ""
            loc = f"{lead.get('city', '')}, {lead.get('state', '')}".strip(", ")
            latest = lead.get("latest_post_time", "")
            golden = lead.get("golden_hour_slot", "")
            streak = f"🔥 {lead.get('active_streak_days', 0)} ngày"
            rate = lead.get("attendance_rate", "")
            hook = lead.get("sales_telesale_hook", "")

            row_vals = [
                idx, fb_id, owner, name, phone, email, web, loc,
                latest, golden, streak, rate
            ]

            # Thêm các ô điểm danh theo ngày
            ledger = lead.get("activity_ledger", {})
            for d in display_dates:
                if d in ledger and ledger[d].get("posted"):
                    p_time = ledger[d].get("post_time", "")
                    p_type = ledger[d].get("post_type", "")
                    short_time = p_time[:5] if p_time else "✓"
                    row_vals.append(f"✓ {short_time}")
                else:
                    row_vals.append("-")

            row_vals.append(hook)
            ws.append(row_vals)

            # Style các ô trong hàng
            cur_row = ws[row_num]
            for col_idx, cell in enumerate(cur_row, start=1):
                cell.border = border_thin
                # Các cột điểm danh ngày
                if len(fixed_headers) < col_idx <= len(fixed_headers) + len(date_headers):
                    cell.alignment = align_center
                    if "✓" in str(cell.value):
                        cell.fill = fill_green_present
                        cell.font = font_green
                    else:
                        cell.fill = fill_gray_absent
                        cell.font = font_gray
                else:
                    cell.font = font_data
                    cell.alignment = align_left
            row_num += 1

        # Tự căn chỉnh độ rộng cột
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 9), 50)

        # Freeze cố định cột tiêu đề và cột tên chủ trại
        ws.freeze_panes = "E2"

        wb.save(output_excel)
        print(f"[Ledger] 📊 Đã xuất Bảng Ma Trận Điểm Danh Khách Hàng Excel tại: {output_excel}")
        return output_excel


# =========================================================================
# CHẠY ĐỒNG BỘ TRỰC TIẾP TỪ FILE CRM LEAD_US_Meta_CRM_2026-10-22.json
# =========================================================================
if __name__ == "__main__":
    print("=" * 70)
    print("🚀 BẮT ĐẦU KHỞI TẠO BẢNG CHẤM CÔNG HOẠT ĐỘNG KHÁCH HÀNG (ACTIVITY LEDGER)")
    print("=" * 70)

    crm_json_path = os.path.join(BASE_DIR, "LEAD_US_Meta_CRM_2026-10-22.json")
    if os.path.exists(crm_json_path):
        with open(crm_json_path, "r", encoding="utf-8") as f:
            leads_data = json.load(f)
        print(f"📖 Đã nạp {len(leads_data)} leads từ {crm_json_path}")
        ledger = LeadActivityLedger()
        n = ledger.ingest_crm_leads(leads_data, scan_date="2026-10-22")
        print(f"✅ Đã điểm danh thành công cho {n} khách hàng vào ngày 2026-10-22!")
        excel_out = ledger.export_attendance_matrix_excel()
        print(f"🎉 Hoàn tất khởi tạo Bảng Chấm Công Khách Hàng: {excel_out}")
    else:
        print(f"❌ Không tìm thấy file CRM: {crm_json_path}")
