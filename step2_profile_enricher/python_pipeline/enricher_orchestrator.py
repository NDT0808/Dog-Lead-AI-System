#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script: enricher_orchestrator.py
Module: Step 2 - Điều phối làm giàu hồ sơ đa tầng (3-Tier Profile Enricher Orchestrator)
Quy trình phối hợp:
1. Tiếp nhận kết quả đã phê duyệt từ Bước 1 (step1_verified_dogs_*.json).
2. Tầng 1: Cào Facebook About để lấy SĐT, Email, Website, Bio.
3. Tầng 2: Quét sâu Website chính thức để tìm Tên chủ trại (`owner`), Puppy application, Breeds.
4. Tầng 3 (Fallback Google AI): Nếu qua Tầng 1 và 2 mà CHƯA CÓ TÊN CHỦ TRẠI (`owner`),
   kích hoạt giả lập Google AI Search / Gemini Overview để bóc tách Tên chủ trại, SĐT, Amazon.
5. Hợp nhất vào định dạng 28-30 trường chuẩn Meta CRM bằng hybrid_profile_merger.
"""

import os
import sys
import json
import time
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STEP2_DIR = os.path.dirname(SCRIPT_DIR)
SYSTEM_DIR = os.path.dirname(STEP2_DIR)
CHECKPOINT_FILE = os.path.join(STEP2_DIR, "checkpoint_step2_enrichment.json")

from fb_about_scraper import scrape_fb_about
from website_deep_crawler import crawl_website_details
from google_ai_fallback import simulate_google_ai_query
from hybrid_profile_merger import merge_lead_profile

def enrich_profiles(input_leads, enable_google_ai=True, max_items=None):
    """
    Vận hành quy trình làm giàu hồ sơ 3 tầng
    """
    print("=" * 80)
    print(" 🐾 PET LEAD AI - STEP 2: PROFILE ENRICHER ORCHESTRATOR")
    print(" Quy trình: Facebook About -> Website Crawler (Owner) -> Google AI Fallback")
    print("=" * 80)

    # 1. Khôi phục Checkpoint nếu có
    checkpoint = {}
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                checkpoint = json.load(f)
            print(f"[*] Đã khôi phục checkpoint: {len(checkpoint)} hồ sơ đã được làm giàu trước đó.")
        except Exception:
            checkpoint = {}

    total = len(input_leads) if not max_items else min(len(input_leads), max_items)
    enriched_results = []

    for i, base_lead in enumerate(input_leads[:total], 1):
        fb_id = str(base_lead.get('fb_id') or '').strip()
        url = str(base_lead.get('url') or '').strip()
        name = str(base_lead.get('name') or 'Dog Breeder').strip()
        cache_key = fb_id if fb_id else url

        print(f"\n[{i}/{total}] Đang xử lý: {name} (FB_ID: {fb_id or 'N/A'})...")

        if cache_key in checkpoint:
            print(f"  [✓] Đã có trong Checkpoint (Owner: {checkpoint[cache_key].get('owner') or 'N/A'}). Bỏ qua.")
            enriched_results.append(checkpoint[cache_key])
            continue

        # ----------------------------------------------------------------------
        # TẦNG 1: Cào Facebook About
        # ----------------------------------------------------------------------
        print(f"  [Tầng 1] Cào thông tin Giới thiệu Facebook...")
        fb_data = scrape_fb_about(url)
        website_cand = fb_data.get('website') or base_lead.get('website') or ''
        owner_cand = fb_data.get('owner') or ''

        # ----------------------------------------------------------------------
        # TẦNG 2: Quét sâu Website chính thức để tìm Tên chủ trại (Owner)
        # ----------------------------------------------------------------------
        web_data = {}
        if website_cand and website_cand.startswith('http'):
            print(f"  [Tầng 2] Quét sâu website chính thức: {website_cand}...")
            web_data = crawl_website_details(website_cand)
            if web_data.get('owner'):
                owner_cand = web_data['owner']
                print(f"  [✓ Tìm thấy Tên chủ trại qua Website]: '{owner_cand}'")
            if web_data.get('phone') and not fb_data.get('phone'):
                print(f"  [✓ Tìm thấy SĐT qua Website]: {web_data['phone']}")
        else:
            print(f"  [Tầng 2] Không có link website riêng.")

        # ----------------------------------------------------------------------
        # TẦNG 3: Google AI Simulator Fallback (Kích hoạt khi chưa có Owner)
        # ----------------------------------------------------------------------
        ai_data = {}
        if (not owner_cand or len(owner_cand) < 3) and enable_google_ai:
            print(f"  [Tầng 3] Chưa có Tên chủ trại -> Kích hoạt Google AI Simulator (theo Video)...")
            ai_data = simulate_google_ai_query(url)
            if ai_data.get('owner'):
                owner_cand = ai_data['owner']
                print(f"  [✓ Tìm thấy Tên chủ trại qua Google AI]: '{owner_cand}'")
            if ai_data.get('phone') and not fb_data.get('phone') and not web_data.get('phone'):
                print(f"  [✓ Tìm thấy SĐT qua Google AI]: {ai_data['phone']}")
            if ai_data.get('state'):
                print(f"  [✓ Vị trí qua Google AI]: {ai_data.get('city', '')}, {ai_data.get('state')}")

        # ----------------------------------------------------------------------
        # HỢP NHẤT DỮ LIỆU ĐA TẦNG (Hybrid Profile Merger)
        # ----------------------------------------------------------------------
        final_profile = merge_lead_profile(
            base_lead=base_lead,
            fb_data=fb_data,
            web_data=web_data,
            ai_data=ai_data,
            index=i
        )

        checkpoint[cache_key] = final_profile
        enriched_results.append(final_profile)
        print(f"  [✓ Hoàn tất hồ sơ]: Owner='{final_profile['owner']}', Phone='{final_profile['phone']}', Web='{final_profile['website']}'")

        # Autosave checkpoint
        if i % 5 == 0:
            with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
                json.dump(checkpoint, f, ensure_ascii=False, indent=2)

    # Final checkpoint save
    with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)

    return enriched_results

def run_enricher_pipeline(input_file, enable_google_ai=True, max_items=None):
    if not os.path.exists(input_file):
        print(f"[!] Không tìm thấy file input: {input_file}")
        return None

    with open(input_file, 'r', encoding='utf-8') as f:
        input_data = json.load(f)

    results = enrich_profiles(input_data, enable_google_ai=enable_google_ai, max_items=max_items)
    
    timestamp = time.strftime('%Y%m%d_%H%M%S')
    out_file = os.path.join(STEP2_DIR, f"step2_enriched_profiles_{timestamp}.json")
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n[✓] BƯỚC 2 HOÀN TẤT! Đã xuất {len(results)} hồ sơ làm giàu đầy đủ tại:")
    print(f"    {out_file}")
    return out_file

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Step 2 Hybrid Profile Enricher")
    parser.add_argument("--input", required=True, help="Path to Step 1 verified JSON")
    parser.add_argument("--no-google-ai", action="store_true", help="Disable Google AI simulation")
    parser.add_argument("--max", type=int, default=None, help="Max items to process")
    args = parser.parse_args()

    run_enricher_pipeline(args.input, enable_google_ai=not args.no_google_ai, max_items=args.max)
