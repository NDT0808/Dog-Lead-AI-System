#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
🐾 SNOV.IO B2B LEAD EXPORTER & ANTI-DUPLICATION ENGINE (v1.0)
=============================================================================
Tự động lọc 500 khách hàng TIỀM NĂNG CAO CÓ EMAIL (Gmail / Work Email) mỗi ngày:
1. Khử trùng lặp 100% hai tầng (Email chuẩn hóa + Numeric FB_ID).
2. Tự động loại trừ toàn bộ khách hàng đã từng xuất trong các đợt trước.
3. Xuất đúng 20 cột chuẩn mẫu Excel Top_Leads_Part_XX_of_YY.xlsx cho Snov.io.
4. Tự động cắt thành từng file nhỏ 20 leads/file (Batch 20) để nuôi hòm thư.
5. Cập nhật sổ cái lịch sử data/snov_export_history.json để vĩnh viễn không trùng.
=============================================================================
"""

import os
import re
import sys
import glob
import json
import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
FB_FS2_DIR = os.path.join(BASE_DIR, "FB-FS-2")
HISTORY_FILE = os.path.join(DATA_DIR, "snov_export_history.json")

HEADERS = [
    '邮箱地址', '名字', '全名', '用户社交', '工作职位',
    '国家', '地址', '行业', '添加日期', '公司名称',
    '公司网址', '公司社交', '公司所处国家', '公司位置',
    '州', '城市', '公司所在行业', '电话', 'remark', 'fb_id'
]

def load_export_history():
    """Tải lịch sử các lead đã từng xuất để chống trùng 100%"""
    history = {
        "exported_emails": {},
        "exported_fbids": {},
        "batches": []
    }
    
    # 1. Đọc từ file history json nếu đã có
    if os.path.exists(HISTORY_FILE):
        try:
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                history = json.load(f)
        except Exception as e:
            print(f"[!] Lỗi đọc {HISTORY_FILE}: {e}")

    # 2. Quét quét bù tất cả file .xlsx trong DATA_DIR và các thư mục snov_batches_*
    existing_files = glob.glob(os.path.join(DATA_DIR, "Top_Leads_Part_*.xlsx"))
    existing_files.extend(glob.glob(os.path.join(DATA_DIR, "snov_batches_*", "*.xlsx")))
    scanned_emails = 0
    scanned_fbids = 0
    for fpath in existing_files:
        try:
            wb = openpyxl.load_workbook(fpath, data_only=True)
            ws = wb.active
            for r in range(2, ws.max_row + 1):
                em = ws.cell(r, 1).value
                fb = ws.cell(r, 20).value
                if em:
                    for sub_em in str(em).split("|"):
                        clean_em = sub_em.strip().lower()
                        if clean_em and "@" in clean_em and clean_em not in history["exported_emails"]:
                            history["exported_emails"][clean_em] = os.path.basename(fpath)
                            scanned_emails += 1
                if fb:
                    clean_fb = str(fb).strip()
                    if clean_fb and clean_fb.isdigit() and clean_fb not in history["exported_fbids"]:
                        history["exported_fbids"][clean_fb] = os.path.basename(fpath)
                        scanned_fbids += 1
        except Exception:
            pass

    return history

def save_export_history(history):
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

def clean_first_name(owner, name):
    """Trích xuất First Name sạch để chèn biến {{firstName}} trên Snov.io"""
    if not owner or owner in ['Chủ trại', 'Facebook User', 'Manager']:
        if name and not any(w in name.lower() for w in ['kennel', 'pup', 'frenchie', 'farm', 'breeder']):
            parts = name.split()
            if len(parts) >= 1:
                return parts[0].strip().title()
        return "Manager"
    
    # Xử lý chuỗi "Name | Name" hoặc "Name (Owner)"
    clean = re.sub(r'\(.*?\)', '', owner)
    if '|' in clean:
        clean = clean.split('|')[0]
    parts = clean.strip().split()
    if len(parts) > 0:
        return parts[0].strip().title()
    return "Manager"

def extract_candidate_leads(target_count=500):
    """Lọc 500 khách hàng tiềm năng cao nhất, có email và chưa từng gửi"""
    history = load_export_history()
    seen_emails = set(history["exported_emails"].keys())
    seen_fbids = set(history["exported_fbids"].keys())

    # Nạp dữ liệu master từ data/leads.json hoặc FB-FS-2/data/leads.json
    leads_path = os.path.join(FB_FS2_DIR, "data", "leads.json")
    if not os.path.exists(leads_path):
        leads_path = os.path.join(DATA_DIR, "leads.json")

    with open(leads_path, 'r', encoding='utf-8') as f:
        raw_leads = json.load(f)

    print(f"[*] Tổng số khách hàng trong Master CRM: {len(raw_leads)}")
    print(f"[*] Số Email đã gửi trong lịch sử (được loại trừ): {len(seen_emails)}")
    print(f"[*] Số FB_ID đã gửi trong lịch sử (được loại trừ): {len(seen_fbids)}")

    candidates = []
    current_batch_emails = set()
    current_batch_fbids = set()

    # Sắp xếp ưu tiên: Score cao nhất -> Tier S -> Có SĐT -> Có Website
    def sort_key(l):
        score = float(l.get('score') or 0)
        has_phone = 1 if l.get('phone') else 0
        has_web = 1 if l.get('website') else 0
        is_tier_s = 2 if l.get('rank_tier') == 'Tier S' else (1 if l.get('rank_tier') == 'Tier A' else 0)
        return (is_tier_s, score, has_phone, has_web)

    sorted_leads = sorted(raw_leads, key=sort_key, reverse=True)

    for l in sorted_leads:
        em = str(l.get('email') or '').strip().lower()
        fb = str(l.get('fb_id') or '').strip()

        # 1. BẮT BUỘC PHẢI CÓ EMAIL HỢP LỆ
        if not em or '@' not in em or '.' not in em:
            continue
        if any(ign in em for ign in ['example.com', 'none', 'null', 'test@']):
            continue

        # Tách danh sách email nếu có dấu |
        email_list = [e.strip().lower() for e in em.split('|') if '@' in e and '.' in e]
        if not email_list:
            continue

        # 2. KIỂM TRA TRÙNG LẶP LỊCH SỬ (ANTI-DUPLICATION)
        # Nếu bất kỳ email nào đã xuất thì bỏ qua
        if any(e in seen_emails or e in current_batch_emails for e in email_list):
            continue
        if fb and (fb in seen_fbids or fb in current_batch_fbids):
            continue

        for e in email_list:
            current_batch_emails.add(e)
        if fb:
            current_batch_fbids.add(fb)

        candidates.append(l)
        if len(candidates) >= target_count:
            break

    print(f"[✓] Đã tuyển chọn thành công {len(candidates)} khách hàng MỚI TINH (100% CÓ EMAIL, 0% TRÙNG LẶP)!")
    return candidates, history

def export_to_excel_parts(leads, history, batch_size=20):
    """Xuất danh sách ra các tệp Part 20 dòng chuẩn Snov.io"""
    today_str = datetime.date.today().strftime("%Y-%m-%d")
    output_dir = os.path.join(DATA_DIR, f"snov_batches_{today_str}")
    os.makedirs(output_dir, exist_ok=True)

    total_leads = len(leads)
    num_parts = (total_leads + batch_size - 1) // batch_size
    print(f"[*] Đang xuất {total_leads} khách hàng thành {num_parts} tệp Excel (mỗi tệp {batch_size} khách)...")

    # Style Excel
    header_fill = PatternFill(start_color="3B82F6", end_color="3B82F6", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Calibri", size=10)
    border_thin = Border(
        left=Side(style='thin', color='E5E7EB'),
        right=Side(style='thin', color='E5E7EB'),
        top=Side(style='thin', color='E5E7EB'),
        bottom=Side(style='thin', color='E5E7EB')
    )

    created_files = []
    now_batch_records = []

    for part_idx in range(num_parts):
        part_num = part_idx + 1
        part_leads = leads[part_idx * batch_size : (part_idx + 1) * batch_size]
        filename = f"Top_Leads_{today_str}_Part_{part_num:02d}_of_{num_parts:02d}.xlsx"
        filepath = os.path.join(output_dir, filename)

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Sheet1"

        # Ghi header
        for col_idx, h in enumerate(HEADERS, 1):
            cell = ws.cell(1, col_idx, h)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        # Ghi dữ liệu
        for r_idx, lead in enumerate(part_leads, 2):
            raw_owner = lead.get('owner') or 'Chủ trại'
            biz_name = lead.get('name') or 'Trại cún'
            first_name = clean_first_name(raw_owner, biz_name)
            # Tách email chính và email phụ nếu có
            raw_email_str = str(lead.get('email') or '').strip().lower()
            emails_split = [e.strip() for e in raw_email_str.split('|') if '@' in e and '.' in e]
            primary_email = emails_split[0] if emails_split else raw_email_str
            alt_emails = ", ".join(emails_split[1:]) if len(emails_split) > 1 else ""

            fb_id_val = str(lead.get('fb_id') or '').strip()
            phone_val = lead.get('phone') or ''
            web_val = lead.get('website') or ''
            url_val = lead.get('url') or (f"https://www.facebook.com/profile.php?id={fb_id_val}" if fb_id_val else '')
            city_val = lead.get('city') or ''
            state_val = lead.get('state') or ''
            loc_val = f"{city_val}, {state_val}".strip(', ')
            remark_val = lead.get('sales_action') or f"Score {lead.get('score')} | {lead.get('rank_tier')}"
            if lead.get('has_amazon') or lead.get('amazon_url'):
                remark_val += " | Có Amazon Storefront"
            if alt_emails:
                remark_val += f" | Email phụ: {alt_emails}"

            row_data = [
                primary_email,                                       # 1. 邮箱地址 (Email chính chuẩn)
                first_name,                                          # 2. 名字
                raw_owner if raw_owner != 'Chủ trại' else biz_name,  # 3. 全名
                url_val,                                             # 4. 用户社交
                '创始人兼繁育人 (Breeder & Owner)',                   # 5. 工作职位
                lead.get('country') or 'United States',              # 6. 国家
                state_val,                                           # 7. 地址
                '宠物繁育 / 狗舍 (Dog Breeder)',                      # 8. 行业
                today_str,                                           # 9. 添加日期
                biz_name,                                            # 10. 公司名称
                web_val,                                             # 11. 公司网址
                url_val,                                             # 12. 公司社交
                'United States',                                     # 13. 公司所处国家
                loc_val,                                             # 14. 公司位置
                state_val,                                           # 15. 州
                city_val,                                            # 16. 城市
                '宠物繁育 / 狗舍 (Dog Breeder)',                      # 17. 公司所在行业
                phone_val,                                           # 18. 电话
                remark_val,                                          # 19. remark
                fb_id_val                                            # 20. fb_id
            ]

            for c_idx, val in enumerate(row_data, 1):
                cell = ws.cell(r_idx, c_idx, val)
                cell.font = data_font
                cell.border = border_thin

            # Ghi nhận toàn bộ email vào sổ cái lịch sử
            for em_item in emails_split:
                history["exported_emails"][em_item] = filename
            if not emails_split and primary_email:
                history["exported_emails"][primary_email] = filename
            if fb_id_val:
                history["exported_fbids"][fb_id_val] = filename
            now_batch_records.append({"email": primary_email, "alt_emails": alt_emails, "fb_id": fb_id_val, "file": filename})

        # Điều chỉnh độ rộng cột tự động
        for col in ws.columns:
            max_len = max(len(str(c.value or '')) for c in col)
            col_letter = col[0].column_letter
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 40)

        wb.save(filepath)
        created_files.append(filepath)

    # Lưu log đợt xuất vào history
    history["batches"].append({
        "date": today_str,
        "count": total_leads,
        "parts": num_parts,
        "folder": output_dir
    })
    save_export_history(history)

    print(f"\n[🎉 THÀNH CÔNG] Đã tạo trọn vẹn {num_parts} tệp tại thư mục:\n    -> {output_dir}")
    print(f"[✓] Đã cập nhật sổ cái lịch sử chống trùng: {HISTORY_FILE}")
    return output_dir, created_files

def main():
    target = 500
    if len(sys.argv) > 1:
        try:
            target = int(sys.argv[1])
        except ValueError:
            pass

    print(f"=== BẮT ĐẦU QUY TRÌNH XUẤT {target} LEADS CHUẨN SNOV.IO ===")
    candidates, history = extract_candidate_leads(target)
    if not candidates:
        print("[!] Không còn khách hàng mới chưa từng xuất có Email trong Database!")
        return

    out_dir, files = export_to_excel_parts(candidates, history, batch_size=20)
    print("\n[HƯỚNG DẪN NẠP LÊN SNOV.IO]")
    print(f"1. Vào Snov.io -> Email Drip Campaigns / Prospects.")
    print(f"2. Mỗi hòm thư phụ, tải lên 1 file Part (20 khách) từ thư mục: {out_dir}")
    print(f"3. Dùng biến {{firstName}} để gọi tên thân mật khách hàng.")

if __name__ == '__main__':
    main()
