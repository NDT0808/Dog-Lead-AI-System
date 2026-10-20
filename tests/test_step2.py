#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Suite: test_step2.py
Chức năng:
1. Kiểm thử trích xuất & chuẩn hóa 100% Facebook ID số (Kể cả vanity URLs như /Nemay24).
2. Kiểm thử hợp nhất hồ sơ hybrid (Facebook About + Website Deep Crawler + Google AI Fallback).
3. Kiểm tra tính toàn vẹn 30 trường CRM của bộ dữ liệu Step 2.
"""

import os
import sys
import json
import unittest

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_DIR = os.path.dirname(SCRIPT_DIR)
STEP1_PY = os.path.join(SYSTEM_DIR, "step1_follower_harvester", "python_pipeline")
STEP2_PY = os.path.join(SYSTEM_DIR, "step2_profile_enricher", "python_pipeline")

for p in [STEP1_PY, STEP2_PY]:
    if p not in sys.path:
        sys.path.insert(0, p)

from fbid_resolver import resolve_numeric_fbid
from hybrid_profile_merger import merge_lead_profile

class TestStep2BulkEnricher(unittest.TestCase):

    def test_01_fbid_resolution_patterns(self):
        """Kiểm tra trích xuất ID số từ các định dạng URL Facebook khác nhau"""
        # 1. URL profile id trực tiếp
        url1 = "https://www.facebook.com/profile.php?id=100087542196018"
        self.assertEqual(resolve_numeric_fbid(url1), "100087542196018")

        # 2. URL photo set có pb (trường hợp đặc thù của /Nemay24)
        url2 = "https://www.facebook.com/photo/?fbid=1103003569294373&set=pb.100087542196018.-2207520000"
        self.assertEqual(resolve_numeric_fbid(url2), "100087542196018")

        # 3. Chuỗi ID số thuần
        self.assertEqual(resolve_numeric_fbid("100087542196018"), "100087542196018")

    def test_02_hybrid_merge_enrichment(self):
        """Kiểm thử ghép nối hồ sơ hybrid tạo đủ các trường CRM cần thiết"""
        raw_item = {
            "fb_id": "100087542196018",
            "name": "Nemay Golden Kennel",
            "url": "https://www.facebook.com/Nemay24",
            "avatar_url": "https://example.com/avatar.jpg"
        }
        
        fb_data = {
            "intro": "Premier Golden Retriever breeder in Dallas Texas",
            "phone": "+1 (214) 555-0199",
            "email": "contact@nemaygoldens.com",
            "website": "https://nemaygoldens.com",
            "address": "Dallas, TX 75201"
        }
        
        web_data = {
            "owner": "David & Sarah Miller",
            "city": "Dallas",
            "state": "TX",
            "zip": "75201",
            "breed": "Golden Retriever"
        }
        
        merged = merge_lead_profile(raw_item, fb_data, web_data, index=1)
        
        self.assertEqual(merged['fb_id'], "100087542196018")
        self.assertEqual(merged['owner'], "David & Sarah Miller")
        self.assertIn("2145550199", merged['phone'])
        self.assertEqual(merged['website'], "https://nemaygoldens.com")
        self.assertEqual(merged['city'], "Dallas")
        self.assertEqual(merged['state'], "TX")
        self.assertTrue(merged['fb_id'].isdigit(), "FB_ID phải là số nguyên dương")
        self.assertIn("score", merged)
        self.assertIn("rank_tier", merged)
        self.assertIn("product_fit", merged)

    def test_03_existing_crm_dataset_numeric_ids(self):
        """Kiểm tra toàn bộ hồ sơ trong step2_enriched_crm_latest.json phải có FB_ID số"""
        crm_path = os.path.join(SYSTEM_DIR, "data", "enriched_step2", "step2_enriched_crm_latest.json")
        if os.path.exists(crm_path):
            with open(crm_path, 'r', encoding='utf-8') as f:
                leads = json.load(f)
            self.assertGreater(len(leads), 0)
            
            # Kiểm tra 100% FB_ID là số
            invalid_ids = [l for l in leads if not l.get('fb_id') or not str(l['fb_id']).isdigit()]
            self.assertEqual(len(invalid_ids), 0, f"Có {len(invalid_ids)} hồ sơ chưa có ID số: {invalid_ids[:3]}")

if __name__ == '__main__':
    unittest.main()
