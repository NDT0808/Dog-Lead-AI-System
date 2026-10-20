#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Interactive Launcher for Step 2
Được thiết kế cho người dùng không rành kỹ thuật:
- Tự động phát hiện file kết quả từ Bước 1
- Kéo thả file trực quan
- Chạy làm giàu dữ liệu đa tầng (FB About -> Website -> Google AI Fallback)
"""

import os
import sys
import glob
import json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STEP2_DIR = os.path.dirname(SCRIPT_DIR)
SYSTEM_DIR = os.path.dirname(STEP2_DIR)
STEP1_DIR = os.path.join(SYSTEM_DIR, "step1_follower_harvester")
sys.path.insert(0, SCRIPT_DIR)

from bulk_headless_scanner import run_bulk_headless_scan, LATEST_JSON, LATEST_EXCEL

def find_latest_step1_file():
    candidates = []
    
    # 1. Thư mục data/verified_step1 (Chuẩn tổ chức mới)
    candidates.extend(glob.glob(os.path.join(SYSTEM_DIR, "data", "verified_step1", "step1_verified_dogs_*.json")))
    candidates.extend(glob.glob(os.path.join(SYSTEM_DIR, "data", "verified_step1", "*.json")))
    
    # 2. Thư mục step1_follower_harvester
    candidates.extend(glob.glob(os.path.join(STEP1_DIR, "step1_verified_dogs_*.json")))
    
    # 3. Thư mục gốc Pet_Lead_AI_System
    candidates.extend(glob.glob(os.path.join(SYSTEM_DIR, "step1_verified_dogs_*.json")))

    filtered = []
    for c in candidates:
        bn = os.path.basename(c)
        if bn.startswith("checkpoint") or bn.startswith("step2") or bn in ["package.json", "vocab.json", "meta.json", "i18n.json"]:
            continue
        filtered.append(c)

    if not filtered:
        return None

    filtered.sort(key=os.path.getmtime, reverse=True)
    return filtered[0]

def main():
    print("=" * 75)
    print("   🐾 PET LEAD AI - BƯỚC 2: QUÉT & LÀM GIÀU HỒ SƠ TỰ ĐỘNG HÀNG LOẠT 🐾")
    print("   (Headless Bulk Scanner - Tự động cào không bật tab từng trang)")
    print("=" * 75)
    print()

    input_file = None

    if len(sys.argv) > 1 and sys.argv[1].strip():
        input_file = sys.argv[1].strip().strip('"').strip("'")

    if not input_file or not os.path.exists(input_file):
        auto_found = find_latest_step1_file()
        if auto_found:
            try:
                with open(auto_found, 'r', encoding='utf-8') as f:
                    cnt = len(json.load(f))
                count_str = f"({cnt} hồ sơ)"
            except Exception:
                count_str = ""

            print(f"[*] ĐÃ TỰ ĐỘNG PHÁT HIỆN TỆP TỪ BƯỚC 1:")
            print(f"    -> {auto_found} {count_str}")
            print(f"[*] Bắt đầu làm giàu dữ liệu hồ sơ ngay lập tức...")
            input_file = auto_found

    while not input_file or not os.path.exists(input_file):
        print("\n[!] Chưa tìm thấy tệp JSON dữ liệu từ Bước 1.")
        try:
            input_file = input(">>> Kéo thả tệp JSON / TXT chứa link vào đây rồi nhấn Enter: ").strip().strip('"').strip("'")
        except (EOFError, KeyboardInterrupt):
            print("\n[!] Đã dừng chương trình.")
            return

    print()
    print("=" * 75)
    print(f"[*] BẮT ĐẦU LÀM GIÀU DỮ LIỆU: {input_file}")
    print("=" * 75)

    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            if input_file.endswith('.json'):
                raw_leads = json.load(f)
            else:
                raw_leads = [line.strip() for line in f if line.strip().startswith('http')]

        results = run_bulk_headless_scan(raw_leads, max_workers=6)
        print()
        print("=" * 75)
        print(" [✓] HOÀN TẤT LÀM GIÀU BƯỚC 2 THÀNH CÔNG!")
        print(f" [*] Tệp JSON:  {LATEST_JSON}")
        print(f" [*] Tệp Excel: {LATEST_EXCEL}")
        print("=" * 75)
    except Exception as e:
        print(f"\n[!] Lỗi trong quá trình xử lý: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
