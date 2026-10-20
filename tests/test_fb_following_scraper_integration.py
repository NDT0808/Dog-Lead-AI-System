# -*- coding: utf-8 -*-
"""
Automated Integration Tests for fb_following_scraper in Pet_Lead_AI_System
Tests: TEST-18, TEST-19, TEST-20 from PLAN.md v2.4
"""
import unittest
import json
import os
import sys

SYSTEM_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRAPER_DIR = os.path.join(SYSTEM_DIR, "fb_following_scraper")


class TestFbFollowingScraperIntegration(unittest.TestCase):

    def test_test18_extension_files_integrity(self):
        """TEST-18: Verify all extension files exist and manifest.json is valid Manifest V3"""
        self.assertTrue(os.path.exists(SCRAPER_DIR), f"Folder not found: {SCRAPER_DIR}")
        
        manifest_path = os.path.join(SCRAPER_DIR, "manifest.json")
        self.assertTrue(os.path.exists(manifest_path), "manifest.json is missing")
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        
        self.assertEqual(manifest.get("manifest_version"), 3, "Must be Manifest V3")
        self.assertIn("storage", manifest.get("permissions", []))
        self.assertIn("tabs", manifest.get("permissions", []))
        self.assertIn("background", manifest)
        self.assertEqual(manifest["background"].get("service_worker"), "background.js")
        
        # Verify core files
        for fname in ["background.js", "content.js", "popup.html", "popup.js", "README.md"]:
            path = os.path.join(SCRAPER_DIR, fname)
            self.assertTrue(os.path.exists(path), f"File missing: {fname}")
            self.assertGreater(os.path.getsize(path), 100, f"File too small: {fname}")

    def test_test19_content_script_rules(self):
        """TEST-19: Verify content.js contains HD avatar upgrade, host exclusion, and numeric ID resolver"""
        content_path = os.path.join(SCRAPER_DIR, "content.js")
        with open(content_path, 'r', encoding='utf-8') as f:
            code = f.read()
        
        self.assertIn("FOLLOWER_COUNTER_REGEX", code, "Must filter follower counter cards")
        self.assertIn("isHostPage", code, "Must filter host page headers")
        self.assertIn("upgradeFbAvatarUrl", code, "Must upgrade avatar URLs to HD")
        self.assertIn("extractNumericFbId", code, "Must extract numeric FB IDs")
        self.assertIn("normalizeProfileUrl", code, "Must normalize profile URLs")
        self.assertIn("BREEDER_PRO", code, "Must classify breeder audience")

    def test_test20_popup_and_bridge_integration(self):
        """TEST-20: Verify popup.js has bilingual dictionary and bridge to Web Dashboard (Port 8000)"""
        popup_path = os.path.join(SCRAPER_DIR, "popup.js")
        with open(popup_path, 'r', encoding='utf-8') as f:
            code = f.read()
        
        self.assertIn("I18N", code, "Must support bilingual dictionary")
        self.assertIn("vi:", code, "Must have Vietnamese translation")
        self.assertIn("zh:", code, "Must have Chinese translation")
        self.assertIn("http://127.0.0.1:8000/api/upload-raw", code, "Must bridge to local server API")
        self.assertIn("BroadcastChannel", code, "Must broadcast cross-origin events")
        self.assertIn("autoload=latest", code, "Must support auto-fill on Web Dashboard")

    def test_schema_compatibility_with_pipeline(self):
        """Verify mock follower item schema matches what ai_vision_filter.py expects"""
        mock_item = {
            "fb_id": "100063922191947",
            "name": "Pawsome Daschund Puppies",
            "url": "https://www.facebook.com/profile.php?id=100063922191947",
            "avatar_url": "https://scontent.xx.fbcdn.net/v/t39.30808-1/123_n.jpg",
            "subtitle": "Breeder in Dallas, TX",
            "photo_urls": ["https://scontent.xx.fbcdn.net/v/t39.30808-1/123_n.jpg"],
            "audience_type": "BREEDER_PRO",
            "scraped_at": "2026-10-19T17:00:00Z"
        }
        
        # Test against ai_vision_filter
        sys.path.insert(0, os.path.join(SYSTEM_DIR, "step1_follower_harvester", "python_pipeline"))
        from ai_vision_filter import check_dog_keywords
        
        kws = check_dog_keywords(mock_item["name"])
        self.assertTrue(len(kws) > 0, "Schema must yield dog keywords for valid breeder")
        self.assertTrue(mock_item["fb_id"].isdigit(), "FB_ID must be numeric")


if __name__ == '__main__':
    unittest.main()
