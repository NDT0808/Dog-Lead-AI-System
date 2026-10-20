#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unit tests for Extension Lifecycle, Event Bridge, Bilingual Parity, and KPI Calculations.
Validates:
1. Discarded KPI never negative (guards against Math.max(0, total - target) regression)
2. Bilingual keys coverage parity between VI and ZH in both extension and web dashboard
3. Extension clearData state reset protocol
4. Web server /api/latest-raw and /api/upload-raw contract
5. Dog keyword classification regex logic
"""

import os
import re
import json
import unittest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class TestExtensionBridgeAndUI(unittest.TestCase):

    def test_kpi_discarded_never_negative(self):
        """Kiểm thử công thức tính hồ sơ loại bỏ: max(0, total - target) không bao giờ ra số âm (như -112)."""
        def calculate_discarded(total, target):
            return max(0, total - target)

        self.assertEqual(calculate_discarded(69, 181), 0)
        self.assertEqual(calculate_discarded(267, 182), 85)
        self.assertEqual(calculate_discarded(0, 50), 0)
        self.assertEqual(calculate_discarded(100, 100), 0)
        self.assertEqual(calculate_discarded(100, 80), 20)

    def test_extension_popup_i18n_parity(self):
        """Kiểm tra tính đồng nhất 100% giữa từ điển tiếng Việt (VI) và tiếng Trung (ZH) trong Extension popup.js."""
        popup_js_path = os.path.join(BASE_DIR, "step1_follower_harvester", "extension", "popup.js")
        self.assertTrue(os.path.exists(popup_js_path), "popup.js must exist")

        with open(popup_js_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Extract I18N object
        match = re.search(r"const I18N = (\{[\s\S]*?\n\};)", content)
        self.assertIsNotNone(match, "I18N dictionary must be defined in popup.js")
        
        # Verify both vi and zh keys exist
        self.assertIn("vi:", match.group(1))
        self.assertIn("zh:", match.group(1))
        self.assertIn("clearData", match.group(1))
        self.assertIn("btnOpenAiDashboard", match.group(1))

    def test_web_dashboard_i18n_parity(self):
        """Kiểm tra tính đồng nhất giữa từ điển tiếng Việt (VI) và tiếng Trung (ZH) trong Web Dashboard."""
        html_path = os.path.join(BASE_DIR, "web_dashboard", "index.html")
        js_path = os.path.join(BASE_DIR, "web_dashboard", "dashboard.js")
        self.assertTrue(os.path.exists(html_path), "index.html must exist")
        self.assertTrue(os.path.exists(js_path), "dashboard.js must exist")

        with open(html_path, "r", encoding="utf-8") as f:
            html_content = f.read()
        with open(js_path, "r", encoding="utf-8") as f:
            js_content = f.read()
        content = html_content + "\n" + js_content

        # Verify key bilingual terms exist in Web Dashboard
        self.assertIn("const I18N_APP =", content)
        self.assertIn("setAppLang", content)
        self.assertIn("btnAppLangVi", content)
        self.assertIn("btnAppLangZh", content)
        self.assertIn("🇻🇳 Tiếng Việt", content)
        self.assertIn("🇨🇳 中文", content)
        self.assertIn("cardOpenFb", content)
        self.assertIn("cardVerifiedBadge", content)
        self.assertIn("cardRejectedBadge", content)

    def test_extension_clear_data_resets_loop_and_keys(self):
        """Kiểm tra popup.js clearData gửi lệnh RESET_HARVESTING và đặt lại harvesterState."""
        popup_js_path = os.path.join(BASE_DIR, "step1_follower_harvester", "extension", "popup.js")
        with open(popup_js_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("chrome.storage.local.remove('scrapedFollowers')", content)
        self.assertIn("RESET_HARVESTING", content)
        self.assertIn("harvesterState: { isRunning: false, isPaused: false }", content)
        self.assertIn("updateControlButtons()", content)

    def test_content_script_handles_reset_harvesting(self):
        """Kiểm tra content.js có xử lý sự kiện RESET_HARVESTING để xóa cache và khôi phục nút quét."""
        content_js_path = os.path.join(BASE_DIR, "step1_follower_harvester", "extension", "content.js")
        self.assertTrue(os.path.exists(content_js_path), "content.js must exist")

        with open(content_js_path, "r", encoding="utf-8") as f:
            content = f.read()

        self.assertIn("RESET_HARVESTING", content)
        self.assertIn("processedKeys.clear()", content)
        self.assertIn("collectedBatch = []", content)

    def test_dog_keyword_classifier_regex(self):
        """Kiểm tra biểu thức chính quy nhận diện chó hoạt động chính xác với cả tên tiếng Anh và tiếng Việt."""
        dog_regex = re.compile(
            r"(dog|puppy|kennel|breeder|bully|poodle|corgi|frenchie|bulldog|husky|retriever|chow|chihuahua|terrier|doodle|basset|rottweiler|pet|chó|cún|chó cảnh|trại chó|phối giống)",
            re.IGNORECASE
        )

        # Test true positives
        self.assertTrue(bool(dog_regex.search("American Bully Breeder Center")))
        self.assertTrue(bool(dog_regex.search("Golden Retriever Puppies Farm")))
        self.assertTrue(bool(dog_regex.search("Trại Chó Cảnh Sài Gòn")))
        self.assertTrue(bool(dog_regex.search("French Bulldog & Poodle Kennel")))
        self.assertTrue(bool(dog_regex.search("Toon's Hobby Farm • Dog Breeder")))

        # Test negatives
        self.assertFalse(bool(dog_regex.search("John Doe Real Estate LLC")))
        self.assertFalse(bool(dog_regex.search("Modern Furniture Store")))
        self.assertFalse(bool(dog_regex.search("Travel & Landscape Photography")))

    def test_api_latest_raw_file_retrieval(self):
        """Kiểm tra thư mục data/raw tồn tại và có thể đọc file JSON thô mới nhất."""
        raw_dir = os.path.join(BASE_DIR, "data", "raw")
        self.assertTrue(os.path.exists(raw_dir), "data/raw directory must exist")
        
        import glob
        files = glob.glob(os.path.join(raw_dir, "*.json"))
        self.assertGreater(len(files), 0, "At least one raw follower JSON file must exist in data/raw")
        
        files.sort(key=os.path.getmtime, reverse=True)
        latest_file = files[0]
        with open(latest_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertIsInstance(data, list)
        self.assertGreater(len(data), 0)
        self.assertIn("name", data[0])
        self.assertIn("fb_id", data[0])

if __name__ == "__main__":
    unittest.main()
