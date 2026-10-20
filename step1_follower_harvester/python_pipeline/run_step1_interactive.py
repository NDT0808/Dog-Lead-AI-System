#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script: run_step1_interactive.py
Module: Interactive Terminal Controller cho Bước 1 - Pet Lead AI System
Chức năng:
- Cho phép người dùng kiểm soát toàn bộ tiến trình lọc AI trong terminal log
- Hiển thị trực quan từng hồ sơ qua 5 tầng Gatekeeper (Mặt người, Mèo, Hoa lá, Từ khóa phi thú cưng, ONNX)
- Tùy chọn tốc độ: Quan sát trực tiếp (0.15s), Duyệt từng hồ sơ (Enter), hoặc Chạy nhanh
- Tự động mở Visual Gallery và xuất Excel/JSON chuẩn CRM Meta RAG
"""

import os
import sys
import glob
import json
import time
import webbrowser

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STEP1_DIR = os.path.dirname(SCRIPT_DIR)
SYSTEM_DIR = os.path.dirname(STEP1_DIR)
sys.path.insert(0, SCRIPT_DIR)

from ai_vision_filter import run_pipeline

# ANSI Color Codes
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"
BOLD = "\033[1m"
RESET = "\033[0m"

# Enable ANSI colors on Windows PowerShell/CMD
if os.name == 'nt':
    os.system('color')

def find_latest_input_file():
    raw_candidates = []
    raw_candidates.extend(glob.glob(os.path.join(SYSTEM_DIR, "data", "raw", "step1_followers_raw_*.json")))
    raw_candidates.extend(glob.glob(os.path.join(SYSTEM_DIR, "step1_followers_raw_*.json")))
    raw_candidates.extend(glob.glob(os.path.join(STEP1_DIR, "step1_followers_raw_*.json")))
    user_download = os.path.join(os.path.expanduser("~"), "Downloads")
    raw_candidates.extend(glob.glob(os.path.join(user_download, "step1_followers_raw_*.json")))

    if raw_candidates:
        unique_raw = list(set(raw_candidates))
        unique_raw.sort(key=os.path.getmtime, reverse=True)
        return unique_raw[0]

    candidates = []
    candidates.extend(glob.glob(os.path.join(SYSTEM_DIR, "*.json")))
    candidates.extend(glob.glob(os.path.join(STEP1_DIR, "*.json")))

    filtered = []
    for c in set(candidates):
        bn = os.path.basename(c)
        if bn.startswith("checkpoint") or bn.startswith("step1_verified") or bn in ["package.json", "vocab.json", "meta.json", "i18n.json", "manifest.json"]:
            continue
        filtered.append(c)

    if not filtered:
        return None

    filtered.sort(key=os.path.getmtime, reverse=True)
    return filtered[0]

def terminal_log_callback(entry, step_mode=False):
    idx = entry.get('index', 0)
    total = entry.get('total', 0)
    name = entry.get('name', 'N/A')
    fb_id = entry.get('fb_id', 'N/A')
    status = entry.get('status', 'REJECTED')
    reason = entry.get('reason', '')
    conf = entry.get('confidence', 0.0)

    prefix = f"[{idx:02d}/{total:02d}]"

    if status == 'APPROVED':
        print(f"{GREEN}{BOLD}{prefix} ✓ [PHÊ DUYỆT CHÓ]{RESET} {BOLD}{name}{RESET} (ID: {CYAN}{fb_id}{RESET})")
        print(f"      └─ {GREEN}Lý do: {reason} (Độ tin cậy: {conf:.2f}){RESET}")
    else:
        print(f"{RED}{prefix} ❌ [LOẠI BỎ]{RESET} {name} (ID: {CYAN}{fb_id}{RESET})")
        print(f"      └─ {YELLOW}Lý do: {reason}{RESET}")

    if step_mode:
        try:
            input(f"      {MAGENTA}>>> Nhấn [Enter] để chuyển sang hồ sơ tiếp theo...{RESET}")
        except (EOFError, KeyboardInterrupt):
            pass

def main():
    print(f"{CYAN}{BOLD}" + "=" * 80 + f"{RESET}")
    print(f"{GREEN}{BOLD}      🐾 PET LEAD AI - BỘ ĐIỀU KHIỂN & LỌC AI THỊ GIÁC ĐA TẦNG (STEP 1) 🐾{RESET}")
    print(f"{CYAN}       (Kiểm soát log chi tiết: Mặt người / Mèo / Hoa lá / Từ khóa phi thú cưng){RESET}")
    print(f"{CYAN}{BOLD}" + "=" * 80 + f"{RESET}\n")

    input_file = None

    if len(sys.argv) > 1 and sys.argv[1].strip():
        input_file = sys.argv[1].strip().strip('"').strip("'")

    if not input_file or not os.path.exists(input_file):
        auto_found = find_latest_input_file()
        if auto_found:
            bn = os.path.basename(auto_found)
            try:
                with open(auto_found, 'r', encoding='utf-8') as f:
                    cnt = len(json.load(f))
                count_str = f"({cnt} hồ sơ)"
            except Exception:
                count_str = ""

            print(f"{YELLOW}[*] ĐÃ TỰ ĐỘNG PHÁT HIỆN TỆP BẠN VỪA CÀO GẦN NHẤT:{RESET}")
            print(f"    -> {BOLD}{auto_found}{RESET} {GREEN}{count_str}{RESET}")
            input_file = auto_found

    while not input_file or not os.path.exists(input_file):
        print(f"\n{RED}[!] Chưa tìm thấy tệp JSON dữ liệu.{RESET}")
        print("    Vui lòng mở Chrome Extension Bước 1, bấm 'Xuất dữ liệu cho Python Pipeline (JSON)'")
        try:
            input_file = input(">>> Kéo thả tệp JSON vào đây rồi nhấn Enter: ").strip().strip('"').strip("'")
        except (EOFError, KeyboardInterrupt):
            print("\n[!] Đã dừng chương trình.")
            return

    # Count items in file
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            total_in_file = len(json.load(f))
    except Exception:
        total_in_file = 0

    print(f"\n{CYAN}[*] TỆP ĐẦU VÀO:{RESET} {BOLD}{input_file}{RESET} ({total_in_file} hồ sơ)")
    print(f"{CYAN}[*] HÃY CHỌN CHẾ ĐỘ KIỂM SOÁT TIẾN TRÌNH:{RESET}")
    print(f"    {BOLD}[1]{RESET} {GREEN}Quan sát mượt mà (Tự động chạy có độ trễ 0.15s để dễ theo dõi log) [MẶC ĐỊNH]{RESET}")
    print(f"    {BOLD}[2]{RESET} {YELLOW}Tương tác từng bước (Nhấn Enter để duyệt qua từng hồ sơ một){RESET}")
    print(f"    {BOLD}[3]{RESET} {CYAN}Chạy siêu tốc (Xử lý hàng loạt không độ trễ){RESET}")

    choice = input(">>> Chọn chế độ [1/2/3] (Nhấn Enter = 1): ").strip()
    delay = 0.15
    step_mode = False
    if choice == '2':
        step_mode = True
        delay = 0.0
    elif choice == '3':
        delay = 0.0
        step_mode = False

    # Force re-evaluate option
    print(f"\n{CYAN}[*] TÙY CHỌN BỘ NHỚ CHECKPOINT:{RESET}")
    print("    [Enter] Dùng checkpoint để tăng tốc (hoặc nạp các hồ sơ mới)")
    print("    [Y]     Thẩm định lại từ đầu 100% (Bỏ qua checkpoint cũ, tránh dữ liệu cũ sót)")
    re_opt = input(">>> Thẩm định lại 100% từ đầu? [y/N]: ").strip().lower()
    force_reevaluate = (re_opt == 'y' or re_opt == 'yes')

    # Threshold
    threshold = 0.70
    th_in = input(f">>> Nhập ngưỡng phân loại chó AI (Mặc định 0.70 / Nhấn Enter = 0.70): ").strip()
    if th_in:
        try:
            threshold = float(th_in)
        except Exception:
            threshold = 0.70

    print(f"\n{BOLD}{CYAN}" + "=" * 80 + f"{RESET}")
    print(f"{GREEN}[*] BẮT ĐẦU TIẾN TRÌNH THẨM ĐỊNH AI THỊ GIÁC & TỪ KHÓA ĐA TẦNG...{RESET}")
    print(f"[*] Ngưỡng Threshold = {threshold:.2f} | Bỏ qua checkpoint: {force_reevaluate} | Chế độ từng bước: {step_mode}")
    print(f"{BOLD}{CYAN}" + "=" * 80 + f"{RESET}\n")

    approved_count = [0]
    rejected_count = [0]

    def on_terminal_log(entry):
        if entry.get('status') == 'APPROVED':
            approved_count[0] += 1
        else:
            rejected_count[0] += 1
        terminal_log_callback(entry, step_mode=step_mode)

    try:
        start_time = time.time()
        out_json, gallery_html = run_pipeline(
            input_file,
            threshold=threshold,
            delay=delay,
            force_reevaluate=force_reevaluate,
            log_callback=on_terminal_log
        )
        elapsed = time.time() - start_time

        print(f"\n{BOLD}{GREEN}" + "=" * 80 + f"{RESET}")
        print(f"{BOLD}{GREEN} [✓] HOÀN TẤT THẨM ĐỊNH THÀNH CÔNG TRONG {elapsed:.1f} GIÂY!{RESET}")
        print(f"{BOLD}{GREEN}" + "=" * 80 + f"{RESET}")
        print(f"  • {BOLD}Tổng số hồ sơ đã quét:{RESET}    {total_in_file}")
        print(f"  • {BOLD}Hồ sơ phê duyệt CHÓ:{RESET}       {GREEN}{BOLD}{approved_count[0]}{RESET}")
        print(f"  • {BOLD}Hồ sơ đã loại bỏ:{RESET}          {RED}{rejected_count[0]}{RESET}")
        print(f"  • {BOLD}Tỷ lệ chuyển đổi mục tiêu:{RESET} {round((approved_count[0]/total_in_file)*100, 1) if total_in_file else 0}%")
        print(f"  • {BOLD}Tệp kết quả JSON:{RESET}          {out_json}")
        print(f"  • {BOLD}Tệp báo cáo Excel:{RESET}         {out_json.replace('.json', '.xlsx')}")
        print(f"{BOLD}{GREEN}" + "=" * 80 + f"{RESET}\n")

        # Open web gallery
        if gallery_html and os.path.exists(gallery_html):
            print(f"[*] Đang tự động mở Thư viện ảnh (Visual Gallery) trên trình duyệt...")
            # Ưu tiên mở qua máy chủ nếu cổng 8000 đang mở
            webbrowser.open(f"http://127.0.0.1:8000/index.html")

    except Exception as e:
        print(f"\n{RED}[!] Lỗi trong quá trình xử lý: {e}{RESET}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
