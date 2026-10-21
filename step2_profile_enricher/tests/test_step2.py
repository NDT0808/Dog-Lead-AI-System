#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Suite: test_step2.py
Module: Step 2 - Automated Unit & Integration Tests for Profile Enricher
"""

import os
import sys
import unittest
import json

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STEP2_DIR = os.path.dirname(SCRIPT_DIR)
PIPELINE_DIR = os.path.join(STEP2_DIR, "python_pipeline")
sys.path.insert(0, PIPELINE_DIR)

from google_ai_fallback import parse_google_ai_response
from hybrid_profile_merger import merge_lead_profile, normalize_phone_number
from website_deep_crawler import extract_owner_from_text, clean_extracted_name

class TestStep2Pipeline(unittest.TestCase):

    def test_01_google_ai_parser(self):
        """Kiểm tra bóc tách cấu trúc câu trả lời của Google AI từ Video"""
        sample_ai_text = """
        • Tên chủ trại / Doanh nghiệp: Roleez Yorkies (Trại nhân giống chó Yorkshire Terrier).
        • Số điện thoại: (413) 317-3410.
        • Link website: Trại sử dụng trang chứng nhận nhà bán hàng uy tín chính thức qua Good Dog - Roleez Yorkies.
        • Có bán trên Amazon không: Không bán sản phẩm trực tiếp. Tuy nhiên, họ có một danh sách (Amazon Idea List).
        • Amazon link: https://www.amazon.com/shop/roleez_yorkies
        • Quốc gia: Mỹ (United States).
        • Mã bưu điện (Zip code): 01095.
        • Bang (State): Massachusetts (MA).
        • Thành phố (City): Wilbraham.
        • Thời gian đăng bài gần nhất: 01/10/2026.
        """
        parsed = parse_google_ai_response(sample_ai_text)
        self.assertEqual(parsed.get('owner'), "Roleez Yorkies")
        self.assertEqual(parsed.get('phone'), "14133173410")
        self.assertEqual(parsed.get('state'), "MA")
        self.assertEqual(parsed.get('city'), "Wilbraham")
        self.assertEqual(parsed.get('zip'), "01095")
        self.assertEqual(parsed.get('country'), "United States")
        self.assertIn("amazon.com", parsed.get('amz_link', ''))

    def test_02_owner_extraction_patterns(self):
        """Kiểm tra regex nhận diện tên chủ trại từ văn bản trang web"""
        sample_web_text = "Welcome to Family Loved Golden Retrievers! We are small hobby breeders. Meet the breeder: Toni Roy. We love our dogs."
        owner = extract_owner_from_text(sample_web_text)
        self.assertEqual(owner, "Toni Roy")

        sample_web_text2 = "At Redhill Boykin Spaniels, owned and operated by David Thompson, we raise quality gundogs."
        owner2 = extract_owner_from_text(sample_web_text2)
        self.assertEqual(owner2, "David Thompson")

    def test_03_phone_normalization(self):
        """Kiểm tra chuẩn hóa số điện thoại Bắc Mỹ"""
        p1 = normalize_phone_number("(916) 601-0930")
        self.assertEqual(p1, "19166010930")

        p2 = normalize_phone_number("1-843-356-9038")
        self.assertEqual(p2, "18433569038")

    def test_04_hybrid_merge_engine(self):
        """Kiểm tra bộ hợp nhất hồ sơ đảm bảo đủ 28-30 trường chuẩn Meta CRM"""
        base_lead = {
            "fb_id": "100068177232065",
            "name": "Family Loved Golden Retrievers",
            "url": "https://www.facebook.com/FamilyLovedGoldenRetrievers",
            "avatar_url": "https://unavatar.io/facebook/100068177232065"
        }
        fb_data = {
            "phone": "19166010930",
            "email": "toniroy40@gmail.com",
            "city": "Yuba City",
            "state": "CA",
            "website": "http://www.familyLovedGoldenRetrievers.com/",
            "relativeTime": "2 giờ trước"
        }
        web_data = {
            "owner": "Toni Roy",
            "has_puppy_page": True,
            "has_application": True
        }
        
        merged = merge_lead_profile(base_lead, fb_data=fb_data, web_data=web_data, index=6)

        # Kiểm tra các trường quan trọng theo Data Contract
        self.assertEqual(merged['stt'], "LEAD-US-000006")
        self.assertEqual(merged['name'], "Family Loved Golden Retrievers")
        self.assertEqual(merged['owner'], "Toni Roy")
        self.assertEqual(merged['phone'], "19166010930")
        self.assertEqual(merged['email'], "toniroy40@gmail.com")
        self.assertEqual(merged['city'], "Yuba City")
        self.assertEqual(merged['state'], "CA")
        self.assertEqual(merged['country'], "United States")
        self.assertEqual(merged['cat_code'], "breeder")
        self.assertEqual(merged['rank_tier'], "Tier S")
        self.assertTrue(merged['is_prio'])
        self.assertIn("Puppy Starter Kit", merged['product_fit'])

if __name__ == '__main__':
    unittest.main()
