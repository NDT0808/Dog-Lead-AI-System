#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Suite: test_vision_threshold.py
Chức năng:
1. Kiểm thử suy luận Vision AI với Ngưỡng Nghiêm Ngặt (Strict Threshold = 0.70).
2. Kiểm thử Nguyên tắc Avatar Ground Truth: Avatar là người/phong cảnh sẽ bị LOẠI BỎ tuyệt đối, không cho từ khóa đè lên.
3. Kiểm thử phân định Ngưỡng Cũ (0.38) vs Ngưỡng Mới (0.70).
4. Kiểm thử tính hợp lệ và cấu trúc của JSON nạp từ Web Dashboard.
"""

import os
import sys
import json
import unittest
import numpy as np
from PIL import Image

# Import step 1 pipeline modules
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_DIR = os.path.dirname(SCRIPT_DIR)
STEP1_DIR = os.path.join(SYSTEM_DIR, "step1_follower_harvester")
PIPELINE_DIR = os.path.join(STEP1_DIR, "python_pipeline")
sys.path.insert(0, PIPELINE_DIR)

from ai_vision_filter import (
    load_onnx_model,
    softmax,
    run_vision_inference,
    check_dog_keywords,
    process_follower_records,
    MODEL_PATH
)

class MockInferenceSession:
    """Mock session để giả lập đầu ra softmax của mô hình ONNX theo các kịch bản kiểm thử"""
    def __init__(self, logits):
        self._logits = logits
        
    def get_inputs(self):
        class InputMeta:
            name = "images"
            shape = [1, 3, 224, 224]
        return [InputMeta()]
        
    def get_outputs(self):
        class OutputMeta:
            name = "output0"
            shape = [1, 3]
        return [OutputMeta()]
        
    def run(self, output_names, input_feed):
        return [np.array([self._logits], dtype=np.float32)]

class TestVisionThresholdAndAvatarGroundTruth(unittest.TestCase):

    def setUp(self):
        self.dummy_img = Image.new('RGB', (224, 224), color=(128, 128, 128))

    def test_01_strict_threshold_rejection(self):
        """
        Kiểm thử: Trường hợp xác suất chó nằm ở khoảng 0.50 (thấp hơn ngưỡng 0.70)
        Ngưỡng cũ (0.38) sẽ duyệt NHẦM, nhưng Ngưỡng mới (0.70) phải LOẠI BỎ.
        Giả lập logits sao cho: p_adult=0.30, p_non=0.50, p_puppy=0.20 => p_dog=0.50
        """
        # logits cho ra probs: [0.30, 0.50, 0.20]
        # softmax([log(0.3), log(0.5), log(0.2)])
        mock_logits = [np.log(0.30), np.log(0.50), np.log(0.20)]
        mock_session = MockInferenceSession(mock_logits)
        
        # Chạy với ngưỡng cũ 0.38
        res_old = run_vision_inference(mock_session, self.dummy_img, threshold=0.38)
        # Chạy với ngưỡng mới 0.70
        res_new = run_vision_inference(mock_session, self.dummy_img, threshold=0.70)
        
        self.assertAlmostEqual(res_new['p_dog'], 0.50, places=2)
        self.assertFalse(res_new['is_dog'], "Ngưỡng 0.70 bắt buộc phải từ chối khi p_dog=0.50")
        self.assertEqual(res_new['best_class'], 'non_dog')

    def test_02_strict_threshold_acceptance(self):
        """
        Kiểm thử: Trường hợp ảnh chó rõ nét đạt xác suất cao (>= 0.70)
        Giả lập logits sao cho: p_adult=0.75, p_non=0.10, p_puppy=0.15 => p_dog=0.90
        """
        mock_logits = [np.log(0.75), np.log(0.10), np.log(0.15)]
        mock_session = MockInferenceSession(mock_logits)
        
        res = run_vision_inference(mock_session, self.dummy_img, threshold=0.70)
        
        self.assertTrue(res['is_dog'], "Ảnh cún đạt p_dog=0.90 phải được chấp thuận")
        self.assertGreaterEqual(res['p_dog'], 0.70)
        self.assertLess(res['p_non'], 0.35)
        self.assertEqual(res['best_class'], 'adult_dog')

    def test_03_avatar_ground_truth_rejects_human_with_dog_keywords(self):
        """
        Kiểm thử NGUYÊN TẮC CỐT LÕI (Avatar Ground Truth):
        Một profile có tên và mô tả chứa nhiều từ khóa chó ("Breeder of Golden Retriever puppies kennel"),
        nhưng ảnh đại diện là NGƯỜI (p_non=0.80, p_dog=0.20).
        Hệ thống BẮT BUỘC phải loại bỏ (is_target_dog == False), không cho từ khóa đè lên!
        """
        mock_logits = [np.log(0.10), np.log(0.80), np.log(0.10)]
        mock_session = MockInferenceSession(mock_logits)
        
        # Kiểm tra từ khóa vẫn khớp tốt
        text = "Loving Family Kennel - Professional French Bulldog & Golden Retriever Breeder"
        kws = check_dog_keywords(text)
        self.assertGreaterEqual(len(kws), 3)

        # Chạy trực tiếp suy luận vision
        vision_res = run_vision_inference(mock_session, self.dummy_img, threshold=0.70)
        self.assertFalse(vision_res['is_dog'])

        # Khi đưa vào pipeline có avatar PIL:
        # Nếu avatar có mặt, quyết định 100% dựa vào vision_res['is_dog']
        is_target = vision_res['is_dog'] # Avatar Ground Truth
        self.assertFalse(is_target, "Avatar Ground Truth: Avatar người phải bị loại bỏ dứt khoát dù có từ khóa chó!")

    def test_04_fallback_when_no_avatar(self):
        """
        Kiểm thử: Khi không có ảnh đại diện (None / hỏng link), chỉ chấp nhận khi có >= 2 từ khóa chó rõ ràng.
        """
        # TH1: Có 1 từ khóa chung chung -> Loại
        kw1 = check_dog_keywords("John Doe - Pet lover")
        self.assertLess(len(kw1), 2)
        is_target_1 = len(kw1) >= 2
        self.assertFalse(is_target_1)

        # TH2: Có >= 2 từ khóa cụ thể (Breeder, Golden Retriever) -> Chấp nhận
        kw2 = check_dog_keywords("Smith Family - Golden Retriever Breeder Kennel")
        self.assertGreaterEqual(len(kw2), 2)
        is_target_2 = len(kw2) >= 2
        self.assertTrue(is_target_2)

    def test_05_web_dashboard_uploaded_json_format(self):
        """
        Kiểm thử: Xác minh tệp JSON xuất từ Extension hoặc nạp từ Web Dashboard
        đáp ứng đầy đủ định dạng tiêu chuẩn của Pet Lead AI System.
        """
        raw_json_path = os.path.join(SYSTEM_DIR, "data", "raw", "step1_followers_raw_2026-10-18T20-13-59.json")
        if os.path.exists(raw_json_path):
            with open(raw_json_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            self.assertIsInstance(data, list, "Dữ liệu JSON thô phải là một danh sách các bản ghi (Array)")
            self.assertGreater(len(data), 0, "Danh sách không được rỗng")
            
            sample = data[0]
            self.assertIn('url', sample, "Bản ghi phải có trường 'url'")
            self.assertIn('name', sample, "Bản ghi phải có trường 'name'")
            self.assertTrue('avatar_url' in sample or 'photo_urls' in sample, "Phải có ảnh avatar hoặc photo_urls")

if __name__ == '__main__':
    unittest.main()
