# -*- coding: utf-8 -*-
"""
Batch test script for Step 2 Headless Profile Enricher on 55 User Facebook URLs.
"""
import sys
import os
import json
import time

# Ensure sys.path includes the repo root and step2 pipeline
CUR_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CUR_DIR, "..", ".."))
if CUR_DIR not in sys.path:
    sys.path.insert(0, CUR_DIR)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from bulk_headless_scanner import run_bulk_headless_scan

USER_55_URLS = [
    "https://www.facebook.com/RedhillBoykinSpaniels",
    "https://www.facebook.com/FamilyLovedGoldenRetrievers",
    "https://www.facebook.com/profile.php?id=61594775080228",
    "https://www.facebook.com/profile.php?id=61551532070511",
    "https://www.facebook.com/profile.php?id=61588242310496",
    "https://www.facebook.com/profile.php?id=61592584514030",
    "https://www.facebook.com/profile.php?id=61594781858150",
    "https://www.facebook.com/Tambalicorgis",
    "https://www.facebook.com/profile.php?id=61591427093472",
    "https://www.facebook.com/profile.php?id=61593315111061",
    "https://www.facebook.com/knockandbark",
    "https://www.facebook.com/profile.php?id=61593913773814",
    "https://www.facebook.com/profile.php?id=61594727570399",
    "https://www.facebook.com/profile.php?id=61594354922562",
    "https://www.facebook.com/profile.php?id=61594523153572",
    "https://www.facebook.com/profile.php?id=61593860979577",
    "https://www.facebook.com/profile.php?id=100083675791629",
    "https://www.facebook.com/HeavenlyDachshunds",
    "https://www.facebook.com/avaaustralianshepherd",
    "https://www.facebook.com/KarmasDoxies",
    "https://www.facebook.com/profile.php?id=61552188929671",
    "https://www.facebook.com/BeautBoxers",
    "https://www.facebook.com/magiceagledoxies",
    "https://www.facebook.com/profile.php?id=61590471037312",
    "https://www.facebook.com/profile.php?id=61574790396010",
    "https://www.facebook.com/profile.php?id=61591574075039",
    "https://www.facebook.com/profile.php?id=61593002885039",
    "https://www.facebook.com/501shepherds",
    "https://www.facebook.com/doodledenisedesigns",
    "https://www.facebook.com/SterlingRunRetrievers",
    "https://www.facebook.com/profile.php?id=100082062487155",
    "https://www.facebook.com/CKCSpuppies",
    "https://www.facebook.com/Lizziesdoxies",
    "https://www.facebook.com/bntboxersoforegon",
    "https://www.facebook.com/profile.php?id=61591761171127",
    "https://www.facebook.com/profile.php?id=61590636366488",
    "https://www.facebook.com/profile.php?id=61591670637525",
    "https://www.facebook.com/profile.php?id=61591350605052",
    "https://www.facebook.com/profile.php?id=61591301922016",
    "https://www.facebook.com/profile.php?id=61589208962934",
    "https://www.facebook.com/profile.php?id=61591248871197",
    "https://www.facebook.com/profile.php?id=100076877305692",
    "https://www.facebook.com/profile.php?id=61590514303609",
    "https://www.facebook.com/profile.php?id=61574143413639",
    "https://www.facebook.com/RitzyRedPoodles",
    "https://www.facebook.com/profile.php?id=61590084885419",
    "https://www.facebook.com/archerlodgelabs",
    "https://www.facebook.com/profile.php?id=61565659477058",
    "https://www.facebook.com/goldenlabretrievers",
    "https://www.facebook.com/amgoldendoodles",
    "https://www.facebook.com/profile.php?id=61588920733163",
    "https://www.facebook.com/profile.php?id=61579857746222",
    "https://www.facebook.com/rosecottagedoodles",
    "https://www.facebook.com/PickleCreekKennels",
    "https://www.facebook.com/breedersedge"
]

def terminal_logger(log_entry):
    stage = log_entry.get("stage", "STAGE")
    text = log_entry.get("text", "")
    level = log_entry.get("level", "info")
    print(f"[{stage}] {text}")

if __name__ == "__main__":
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(USER_55_URLS)
    test_urls = USER_55_URLS[:limit]
    print(f"=== BẮT ĐẦU CHẠY BATCH SCAN STEP 2 CHO {len(test_urls)} HỒ SƠ ===")
    start_t = time.time()
    
    results = run_bulk_headless_scan(test_urls, max_workers=6, log_callback=terminal_logger)
    
    elapsed = time.time() - start_t
    print(f"\n=== HOÀN TẤT TRONG {elapsed:.1f} GIÂY ===")
    print(f"Tổng kết quả: {len(results)}")
    
    # Print sample of extracted results
    print("\n--- TỔNG KẾT MẪU HỒ SƠ LÀM GIÀU ---")
    for r in results[:8]:
        print(f"ID: {r.get('fb_id')} | Tên: {r.get('name')}")
        print(f"   Owner: {r.get('owner')} | SĐT: {r.get('phone')} | Web: {r.get('website')}")
        print(f"   Loại hình: {r.get('cat')}")
        print(f"   Amazon: {r.get('amz_cat')}")
        print(f"   Điểm: {r.get('score')} ({r.get('rank_tier')}) | Fit: {r.get('product_fit')}")
        print(f"   Avatar: {r.get('avatar_url')[:60]}...")
        print("-" * 60)
