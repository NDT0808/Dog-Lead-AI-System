# -*- coding: utf-8 -*-
"""
Unit Tests for HD Avatar Vision Pipeline, Word Boundaries, and Dog Breed Immunity
Tests: TEST-15, TEST-16, TEST-17 from PLAN.md v2.4
"""
import unittest
import sys
import os

# Add pipeline path
PIPELINE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                            "step1_follower_harvester", "python_pipeline")
if PIPELINE_DIR not in sys.path:
    sys.path.insert(0, PIPELINE_DIR)

from ai_vision_filter import (
    upgrade_fb_avatar_url,
    check_dog_keywords,
    check_negative_keywords,
    FOLLOWER_COUNTER_REGEX,
    SYSTEM_NAV_NAMES,
    load_onnx_model,
    process_follower_records
)


class TestHdVisionAndWordBoundaries(unittest.TestCase):

    def test_upgrade_fb_avatar_url(self):
        """TEST-15: URL Facebook CDN thumbnail 80x80 must be upgraded to HD"""
        thumb_url = "https://scontent-iad3-2.xx.fbcdn.net/v/t39.30808-1/555_n.jpg?stp=dst-jpg_s80x80_tt6&_nc_cat=103&ctp=s80x80&_nc_ohc=abc"
        hd_url = upgrade_fb_avatar_url(thumb_url)
        self.assertNotIn("ctp=s80x80", hd_url)
        
        thumb_p_url = "https://scontent-iad3-2.xx.fbcdn.net/v/t39.30808-1/555_n.jpg?ctp=p80x80&other=1"
        hd_p_url = upgrade_fb_avatar_url(thumb_p_url)
        self.assertNotIn("ctp=p80x80", hd_p_url)

    def test_dog_breed_immunity(self):
        """TEST-16: Dog breeds must have immunity against short ambiguous terms (spa, xe, hr)"""
        # Kristy's Cocker Spaniel should NOT be killed by 'spa' (inside Spaniel or otherwise)
        text = "Kristy's Cocker Spaniel"
        dog_kws = check_dog_keywords(text)
        self.assertTrue(len(dog_kws) > 0, "Cocker Spaniel must match dog keywords")
        neg = check_negative_keywords(text, has_pos_dog=True)
        self.assertIsNone(neg, f"Cocker Spaniel must NOT trigger negative keyword, got: {neg}")

        # Redhill Boykin Spaniels
        text_boykin = "Redhill Boykin Spaniels"
        dog_kws_boykin = check_dog_keywords(text_boykin)
        self.assertTrue(len(dog_kws_boykin) > 0, "Boykin Spaniels must match dog keywords")
        neg_boykin = check_negative_keywords(text_boykin, has_pos_dog=True)
        self.assertIsNone(neg_boykin, f"Boykin Spaniels must NOT trigger negative keyword, got: {neg_boykin}")

        # Beaut Boxers (should not be killed by 'xe' inside Boxers)
        text_boxers = "Beaut Boxers"
        dog_kws_boxers = check_dog_keywords(text_boxers)
        self.assertTrue(len(dog_kws_boxers) > 0, "Boxers must match dog keywords")
        neg_boxers = check_negative_keywords(text_boxers, has_pos_dog=True)
        self.assertIsNone(neg_boxers, f"Boxers must NOT trigger negative keyword, got: {neg_boxers}")

        # Kathryn,s Dachshunds (should not be killed by 'hr' inside Kathryn)
        text_dach = "Kathryn,s Dachshunds"
        dog_kws_dach = check_dog_keywords(text_dach)
        self.assertTrue(len(dog_kws_dach) > 0, "Dachshunds must match dog keywords")
        neg_dach = check_negative_keywords(text_dach, has_pos_dog=True)
        self.assertIsNone(neg_dach, f"Dachshunds must NOT trigger negative keyword, got: {neg_dach}")

    def test_strong_negatives_bypass_immunity(self):
        """Unambiguous business terms must reject even if dog word is present"""
        text = "Bất động sản Golden Retriever"
        neg = check_negative_keywords(text, has_pos_dog=True)
        self.assertIsNotNone(neg, "Real estate must reject even with dog breed")

        text_tarot = "TAROT"
        neg_tarot = check_negative_keywords(text_tarot, has_pos_dog=False)
        self.assertIsNotNone(neg_tarot, "TAROT must be rejected")

    def test_follower_counter_and_nav_exclusion(self):
        """TEST-17: Scraped host header and follower counter cards must be ignored"""
        self.assertTrue(FOLLOWER_COUNTER_REGEX.match("191K người theo dõi"))
        self.assertTrue(FOLLOWER_COUNTER_REGEX.match("191,000 followers"))
        self.assertTrue(FOLLOWER_COUNTER_REGEX.match("10M following"))
        self.assertTrue(FOLLOWER_COUNTER_REGEX.match("50K người thích"))
        self.assertFalse(FOLLOWER_COUNTER_REGEX.match("Pawsome Daschund Puppies"))
        
        self.assertIn("Good Dog", SYSTEM_NAV_NAMES.union({"Good Dog"}))
        self.assertIn("Bài viết mới", SYSTEM_NAV_NAMES)
        self.assertIn("Xem tất cả", SYSTEM_NAV_NAMES)

    def test_false_positive_profiles_rejection(self):
        """Sono' Studio, JII, Xuân Hân, and TAROT must be rejected"""
        session = load_onnx_model()
        test_records = [
            {
                "name": "191K người theo dõi",
                "fb_id": "621278013346266",
                "url": "https://www.facebook.com/GoodDog/followers",
                "avatar_url": ""
            },
            {
                "name": "Good Dog",
                "fb_id": "100063922191947",
                "url": "https://www.facebook.com/GoodDog",
                "avatar_url": ""
            },
            {
                "name": "TAROT",
                "fb_id": "100040197715176",
                "url": "https://www.facebook.com/profile.php?id=100040197715176",
                "avatar_url": "https://scontent.xx.fbcdn.net/v/t39.30808-1/555_n.jpg"
            },
            {
                "name": "Sono' Studio",
                "fb_id": "61550575629300",
                "url": "https://www.facebook.com/profile.php?id=61550575629300",
                "avatar_url": "https://scontent.xx.fbcdn.net/v/t39.30808-1/555_n.jpg"
            },
            {
                "name": "JII",
                "fb_id": "61594967507549",
                "url": "https://www.facebook.com/profile.php?id=61594967507549",
                "avatar_url": "https://scontent.xx.fbcdn.net/v/t39.30808-1/555_n.jpg"
            },
            {
                "name": "Xuân Hân",
                "fb_id": "61595273680537",
                "url": "https://www.facebook.com/profile.php?id=61595273680537",
                "avatar_url": "https://scontent.xx.fbcdn.net/v/t39.30808-1/555_n.jpg"
            }
        ]
        
        results = process_follower_records(test_records, session, threshold=0.70, force_reevaluate=True)
        # All of these false positives must be 100% rejected!
        approved_names = [r['name'] for r in results]
        self.assertNotIn("191K người theo dõi", approved_names)
        self.assertNotIn("Good Dog", approved_names)
        self.assertNotIn("TAROT", approved_names)
        self.assertNotIn("Sono' Studio", approved_names)
        self.assertNotIn("JII", approved_names)
        self.assertNotIn("Xuân Hân", approved_names)


if __name__ == '__main__':
    unittest.main()
