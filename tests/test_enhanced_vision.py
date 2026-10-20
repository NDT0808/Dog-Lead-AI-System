import unittest
import os
import sys
import json

SYSTEM_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STEP1_PY = os.path.join(SYSTEM_DIR, "step1_follower_harvester", "python_pipeline")
if STEP1_PY not in sys.path:
    sys.path.insert(0, STEP1_PY)

from ai_vision_filter import (
    process_follower_records,
    load_onnx_model,
    detect_faces,
    detect_cats,
    check_flora_and_landscape,
    NEGATIVE_KEYWORDS_REGEX
)
from PIL import Image

class TestEnhancedVisionFilter(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.session = load_onnx_model()
        cls.raw_file = os.path.join(SYSTEM_DIR, "data", "raw", "step1_followers_raw_2026-10-19T05-43-13.json")
        with open(cls.raw_file, 'r', encoding='utf-8') as f:
            cls.raw_data = json.load(f)

    def test_negative_keywords_detection(self):
        """Kiểm tra Lớp 1: Từ khóa phi thú cưng (BĐS, Gym, Tuyển dụng, Mầm non...)"""
        test_cases = [
            ("Kevin Nhà Tốt", True, "Nhà Tốt"),
            ("Nay Biên - Next Best Fitness", True, "Fitness"),
            ("mầm non tư thục Đồ rê mí", True, "mầm non"),
            ("Bùi Liên Tuyển Dụng Quảng Ninh", True, "Tuyển Dụng"),
            ("Kiếm việc không kiếm chuyện", True, "Kiếm việc"),
            ("MIKIO TÓC NAM", True, "TÓC NAM"),
            ("Golden Retriever Kennel", False, None)
        ]
        for text, expected, kw in test_cases:
            match = NEGATIVE_KEYWORDS_REGEX.search(text)
            self.assertEqual(bool(match), expected, f"Failed on {text}")
            if expected and kw:
                self.assertIn(kw.lower(), match.group(0).lower())

    def test_anime_and_photo_face_detection(self):
        """Kiểm tra Lớp 2: Phát hiện khuôn mặt (ảnh thật và anime/minh họa)"""
        hoai_anh_path = os.path.join(SYSTEM_DIR, "tests", "hoai_anh.jpg")
        if os.path.exists(hoai_anh_path):
            img = Image.open(hoai_anh_path)
            faces = detect_faces(img)
            self.assertGreater(faces, 0, "Anime/drawn face in hoai_anh.jpg must be detected")

    def test_toon_followers_zero_approved(self):
        """Kiểm tra toàn bộ 69 profile từ toon.thanh.vn phải bị LOẠI BỎ 100% (0 approved)"""
        approved = process_follower_records(
            self.raw_data,
            self.session,
            threshold=0.70,
            force_reevaluate=True
        )
        self.assertEqual(len(approved), 0, f"Expected 0 approved dogs, got {len(approved)}")

if __name__ == '__main__':
    unittest.main()
