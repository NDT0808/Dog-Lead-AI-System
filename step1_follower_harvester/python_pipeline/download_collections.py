#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script: download_collections.py
Chức năng: Tải và tổ chức ảnh theo đúng chuẩn thư mục {FB_ID}/{FB_ID}_01.jpg, {FB_ID}_02.jpg...
"""

import os
import sys
import json
import requests
from io import BytesIO
from PIL import Image

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
}

def download_and_index_photos(fb_id, photo_urls, output_base_dir):
    """
    Tải danh sách URL ảnh và lưu vào thư mục output_base_dir/{fb_id}/{fb_id}_XX.jpg
    Trả về danh sách đường dẫn tương đối đã lưu thành công.
    """
    if not fb_id or not photo_urls:
        return []

    user_dir = os.path.join(output_base_dir, str(fb_id))
    os.makedirs(user_dir, exist_ok=True)
    saved_paths = []

    for idx, url in enumerate(photo_urls, 1):
        if not url or not str(url).startswith('http'):
            continue
        filename = f"{fb_id}_{idx:02d}.jpg"
        abs_path = os.path.join(user_dir, filename)
        rel_path = f"downloaded_collections/{fb_id}/{filename}"

        if os.path.exists(abs_path) and os.path.getsize(abs_path) > 1000:
            saved_paths.append(rel_path)
            continue

        try:
            resp = requests.get(str(url).strip(), headers=HEADERS, timeout=6)
            if resp.status_code == 200 and len(resp.content) > 500:
                img = Image.open(BytesIO(resp.content)).convert('RGB')
                img.save(abs_path, "JPEG", quality=90)
                saved_paths.append(rel_path)
        except Exception as e:
            print(f"[!] Lỗi tải ảnh {idx} cho ID {fb_id}: {e}")

    return saved_paths

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python download_collections.py <FB_ID> <photo_url1> [photo_url2 ...]")
        sys.exit(1)
    fb_id = sys.argv[1]
    urls = sys.argv[2:]
    res = download_and_index_photos(fb_id, urls, os.path.join(os.path.dirname(__file__), "..", "gallery", "downloaded_collections"))
    print("Saved:", res)
