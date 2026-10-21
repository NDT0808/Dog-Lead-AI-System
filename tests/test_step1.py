#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test Suite: test_step1.py
Chức năng: Kiểm thử tự động toàn diện Step 1 (Mô hình ONNX, Từ khóa, Tải ảnh theo ID, Sinh Gallery cho Sếp).
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
    preprocess_image_for_onnx,
    run_vision_inference,
    check_dog_keywords,
    process_follower_records,
    build_gallery_html,
    MODEL_PATH
)

class TestStep1Pipeline(unittest.TestCase):

    def test_01_onnx_model_exists_and_loads(self):
        """Kiểm tra mô hình dog-model.onnx tồn tại và nạp thành công"""
        self.assertTrue(os.path.exists(MODEL_PATH), f"Không tìm thấy file model: {MODEL_PATH}")
        session = load_onnx_model()
        self.assertIsNotNone(session, "Không thể khởi tạo InferenceSession ONNX.")
        
        # Kiểm tra shape đầu vào [1, 3, 224, 224]
        inp = session.get_inputs()[0]
        self.assertEqual(inp.shape, [1, 3, 224, 224], f"Shape đầu vào không đúng: {inp.shape}")
        
        # Kiểm tra shape đầu ra [1, 3]
        out = session.get_outputs()[0]
        self.assertEqual(out.shape, [1, 3], f"Shape đầu ra không đúng: {out.shape}")

    def test_02_dog_keywords_regex(self):
        """Kiểm tra nhận diện từ khóa giống chó theo word-boundary"""
        # Test positive
        text_pos1 = "Breeder of beautiful French Bulldog puppies and Frenchies in California"
        kw1 = check_dog_keywords(text_pos1)
        self.assertTrue(any(k in ['frenchie', 'french bulldog', 'puppy', 'breeder'] for k in kw1))

        text_pos2 = "Redhill Boykin Spaniels - Working retriever dogs and stud service"
        kw2 = check_dog_keywords(text_pos2)
        self.assertTrue(any(k in ['spaniel', 'boykin spaniel', 'retriever', 'dog', 'stud'] for k in kw2))

        # Test negative (non-dog words)
        text_neg = "Kitchen furniture designer and modern architectural home renovator"
        kw_neg = check_dog_keywords(text_neg)
        self.assertEqual(len(kw_neg), 0, f"Bắt nhầm từ khóa không liên quan: {kw_neg}")

    def test_03_inference_on_synthetic_images(self):
        """Kiểm tra hàm suy luận ONNX với ảnh mẫu"""
        session = load_onnx_model()
        self.assertIsNotNone(session)

        # Tạo ảnh trắng
        img_white = Image.new('RGB', (224, 224), color=(255, 255, 255))
        res_white = run_vision_inference(session, img_white)
        self.assertIn('p_dog', res_white)
        self.assertIn('best_class', res_white)

    def test_04_end_to_end_step1_run(self):
        """Kiểm thử chạy trọn gói Step 1 với tệp dữ liệu mẫu thực tế"""
        sample_img_path = os.path.join(SCRIPT_DIR, "redhill.jpg")
        sample_input = [
            {
                "fb_id": "100081804938692",
                "name": "Redhill Boykin Spaniels",
                "url": "https://www.facebook.com/RedhillBoykinSpaniels",
                "avatar_url": sample_img_path if os.path.exists(sample_img_path) else "https://scontent.fbcdn.net/sample_dog.jpg",
                "subtitle": "Boykin Spaniel hunting retriever kennel",
                "photo_urls": []
            },
            {
                "fb_id": "999999999999999",
                "name": "General Kitchen & Bath Renovations",
                "url": "https://www.facebook.com/kitchen.renovations.sample",
                "avatar_url": "",
                "subtitle": "Ceramic tiles, granite countertops and cabinet installation",
                "photo_urls": []
            }
        ]

        session = load_onnx_model()
        results = process_follower_records(sample_input, session)

        approved_ids = [r['fb_id'] for r in results]
        self.assertNotIn("999999999999999", approved_ids)

        # Kiểm tra sinh file HTML Gallery vào thư mục test để không ghi đè file production
        gallery_file = os.path.join(SCRIPT_DIR, "test_gallery_output.html")
        mock_leads = [{
            "fb_id": "100081804938692",
            "name": "Redhill Boykin Spaniels",
            "url": "https://www.facebook.com/RedhillBoykinSpaniels",
            "avatar_url": "https://scontent.fbcdn.net/sample_dog.jpg",
            "subtitle": "Boykin Spaniel hunting retriever kennel",
            "matched_keywords": ["Boykin Spaniel", "Retriever"]
        }]
        build_gallery_html(mock_leads, gallery_file)
        self.assertTrue(os.path.exists(gallery_file))
        
        with open(gallery_file, 'r', encoding='utf-8') as f:
            html = f.read()
        self.assertIn("Pet Leads Visual Gallery", html)
        self.assertIn("Redhill Boykin Spaniels", html)

if __name__ == '__main__':
    unittest.main()
