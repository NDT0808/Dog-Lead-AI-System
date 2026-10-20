import os
import sys
import unittest
import json

SYSTEM_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEP1_PY = os.path.join(SYSTEM_DIR, "step1_follower_harvester", "python_pipeline")
if STEP1_PY not in sys.path:
    sys.path.insert(0, STEP1_PY)

import ai_vision_filter

class TestGatekeeper101Accuracy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw_file = os.path.join(SYSTEM_DIR, "data", "raw", "step1_followers_raw_2026-10-19T11-12-21.json")
        with open(cls.raw_file, "r", encoding="utf-8") as f:
            cls.raw_data = json.load(f)

    def test_counter_and_navigation_regex(self):
        # 14 đang theo dõi, 191K người theo dõi, etc.
        self.assertTrue(bool(ai_vision_filter.FOLLOWER_COUNTER_REGEX.match("14 đang theo dõi")))
        self.assertTrue(bool(ai_vision_filter.FOLLOWER_COUNTER_REGEX.match("191K người theo dõi")))
        self.assertTrue(bool(ai_vision_filter.FOLLOWER_COUNTER_REGEX.match("2,5K người thích")))
        self.assertTrue(bool(ai_vision_filter.SYSTEM_NAV_REGEX.match("Người theo dõi")))
        self.assertTrue(bool(ai_vision_filter.SYSTEM_NAV_REGEX.match("Mọi người")))
        self.assertTrue(bool(ai_vision_filter.SYSTEM_NAV_REGEX.match("Marketplace")))

    def test_good_dog_and_counters_not_approved(self):
        # Run pipeline over 101 raw dataset (uses checkpoint if cached)
        latest_json, _ = ai_vision_filter.run_pipeline(self.raw_file, threshold=0.70, force_reevaluate=False)
        with open(latest_json, "r", encoding="utf-8") as f:
            leads = json.load(f)

        approved_names = [l.get("name") for l in leads]
        approved_ids = [l.get("fb_id") for l in leads]

        # 14 đang theo dõi must NOT be approved
        self.assertNotIn("14 đang theo dõi", approved_names)
        self.assertNotIn("100063922191947", approved_ids)
        self.assertNotIn("621278013346266", approved_ids)

        # Genuine dog breeders MUST be approved
        expected_dog_leads = [
            "Eliana’s Shih Tzu Home",
            "Family Loved Golden Retrievers",
            "I Love Dogs Forge 'N Fetch",
            "Frenchie forever",
            "Karma's Dachshunds",
            "Magic Eagle Miniature Dachshunds",
            "Gilded Glen Golden Retrievers",
            "My Cavalier Puppies"
        ]
        for dog_name in expected_dog_leads:
            self.assertIn(dog_name, approved_names, f"Expected {dog_name} to be approved as dog lead!")

        # High yield of genuine dog leads (22 approved)
        self.assertGreaterEqual(len(leads), 20)

if __name__ == "__main__":
    unittest.main()
