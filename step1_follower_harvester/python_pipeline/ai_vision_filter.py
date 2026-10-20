#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script: ai_vision_filter.py
Module: Step 1 - Python AI Vision & Keyword Filter Pipeline
Chức năng:
1. Tiếp nhận file JSON kết xuất từ Extension Step 1 (hoặc danh sách follower).
2. Nạp mô hình ONNX dog-model.onnx (YOLOv8-cls 224x224 RGB).
3. Thẩm định hình ảnh Avatar & Bộ sưu tập ảnh qua Softmax xác suất 3 lớp (adult_dog, non_dog, puppy).
4. Đối chiếu bộ từ khóa chó chuẩn Word-Boundary Regex.
5. Tự động kích hoạt tải bộ sưu tập ảnh đánh số theo {FB_ID}/{FB_ID}_XX.jpg.
6. Tự động sinh trang Dog Visual Gallery (dog-gallery.html) phục vụ Sếp.
7. Xuất file kết quả JSON và Excel hoàn chỉnh.
"""

import os
import sys
import re
import json
import time
import argparse
import numpy as np
import requests
from io import BytesIO
from PIL import Image

try:
    import cv2
except ImportError:
    cv2 = None

try:
    import onnxruntime as ort
except ImportError:
    ort = None

from fbid_resolver import resolve_numeric_fbid
from nlp_dog_matcher import match_dog_semantics

# Base Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STEP1_DIR = os.path.dirname(SCRIPT_DIR)
SYSTEM_DIR = os.path.dirname(STEP1_DIR)
MODEL_PATH = os.path.join(STEP1_DIR, "models", "dog-model.onnx")
GALLERY_DIR = os.path.join(STEP1_DIR, "gallery")
IMAGES_DIR = os.path.join(GALLERY_DIR, "downloaded_collections")
CHECKPOINT_FILE = os.path.join(SYSTEM_DIR, "data", "verified_step1", "checkpoint_step1_vision.json")

# Haar cascades for human (photographic & anime/illustration) and feline detection
FACE_CASCADE = None
FACE_CASCADE_ALT2 = None
UPPERBODY_CASCADE = None
CAT_CASCADE = None
HOG_PEOPLE = None
if cv2 is not None:
    try:
        FACE_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        FACE_CASCADE_ALT2 = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml')
        UPPERBODY_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_upperbody.xml')
        CAT_CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalcatface.xml')
        HOG_PEOPLE = cv2.HOGDescriptor()
        HOG_PEOPLE.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    except Exception:
        pass

# Layer 1: Negative Business / Non-Pet Domain Blacklist (Split into Strong Terms & Short Ambiguous Terms)
STRONG_NEGATIVE_KEYWORDS = [
    'tuyển dụng', 'việc làm', 'kiếm việc', 'manpower', 'staffing', 'recruitment', 'temp agency', 'headhunt',
    'bất động sản', 'tinbds', 'nhà tốt', 'vincom', 'vinhomes', 'thể thao', 'fitness', 'gym', 'mầm non', 'ca nhạc',
    'drama', 'phim', 'truyện', 'hài', 'áo cưới', 'nail', 'làm đẹp', 'lốp',
    'vận tải', 'thẻ tín dụng', 'đáo hạn', 'tiện ích', 'đồ gia dụng', 'hủ tiếu',
    'quán ăn', 'rượu', 'bia', 'quán nhậu', 'mèo', 'mèo cảnh', 'cattery', 'catteries', 'feline', 'kitten', 'cat breeding',
    'sim số', 'thám tử', 'luật sư',
    'xây dựng', 'nội thất', 'karaoke', 'giày dép', 'sửa xe', 'ăn vặt', 'bún đậu',
    'trà sữa', 'nước mía', 'cắt tóc', 'tóc nam', 'tarot', 'bói toán', 'chiêm tinh',
    'astrology', 'horoscope', 'psychic', 'catering',
    'secondary school', 'senior secondary', 'academy', 'trường học', 'games fun', 'gaming'
]

# Short Ambiguous Words that MUST have strict word boundaries and be overridden if a Dog Breed is present
SHORT_AMBIGUOUS_NEGATIVE = ['hr', 'xe', 'spa', 'cat', 'cats', 'kitten', 'meow', 'thơ']

COMPILED_STRONG_NEG = [
    (kw, re.compile(re.escape(kw), re.IGNORECASE))
    for kw in STRONG_NEGATIVE_KEYWORDS
]

COMPILED_SHORT_NEG = [
    (kw, re.compile(r'(?:^|[^a-zA-Z0-9À-ỹ])' + re.escape(kw) + r'(?:$|[^a-zA-Z0-9À-ỹ])', re.IGNORECASE))
    for kw in SHORT_AMBIGUOUS_NEGATIVE
]

FOLLOWER_COUNTER_REGEX = re.compile(
    r'^\d+[\.,]?\d*[KM]?\s*(?:người theo dõi|đang theo dõi|followers|following|người thích|likes|bạn bè|friends)\b', 
    re.IGNORECASE
)
TIMESTAMP_REGEX = re.compile(
    r'^\d+\s*(?:giờ|phút|giây|ngày|tuần|tháng|năm|h|m|s|d|w|hrs?|hours?|mins?|minutes?|secs?|seconds?|days?|weeks?|months?|years?)(?:\s*trước)?$',
    re.IGNORECASE
)
SYSTEM_NAV_REGEX = re.compile(
    r'^(?:xem tất cả|tất cả|mọi người|thước phim|reels|marketplace|trang|pages|nhóm|groups|sự kiện|events|người theo dõi|đang theo dõi|bạn bè|tìm hiểu thêm|bài viết mới|giới thiệu|ảnh|photos|video|videos|kỷ niệm|đã lưu|bảng feed|trình quản lý quảng cáo|tạo tin|hộp thư|cài đặt|trợ giúp & hỗ trợ|được tài trợ|sponsored)$',
    re.IGNORECASE
)
SYSTEM_NAV_NAMES = {
    'Xem tất cả', 'Tất cả', 'Mọi người', 'Thước phim', 'Marketplace', 'Trang', 
    'Sự kiện', 'Người theo dõi', 'Tìm hiểu thêm', 'Bài viết mới', 'Giới thiệu',
    'Kỷ niệm', 'Đã lưu', 'Bảng feed', 'Trình quản lý quảng cáo', 'Tạo tin', 'Hộp thư',
    'Bảng điều khiển', 'Cài đặt', 'Trợ giúp & hỗ trợ', 'Đăng xuất', 'Bật trợ năng',
    'Được tài trợ', 'Sponsored', 'Đề xuất cho bạn', 'Gợi ý cho bạn', 'Meta AI'
}
SYSTEM_URL_PATTERNS = [
    re.compile(r'/onthisday/?', re.IGNORECASE),
    re.compile(r'/saved/?', re.IGNORECASE),
    re.compile(r'/ad_campaign/', re.IGNORECASE),
    re.compile(r'/ads/', re.IGNORECASE),
    re.compile(r'/stories/', re.IGNORECASE),
    re.compile(r'/posts/', re.IGNORECASE),
    re.compile(r'/permalink/', re.IGNORECASE),
    re.compile(r'/watch/?', re.IGNORECASE),
    re.compile(r'/gaming/?', re.IGNORECASE),
    re.compile(r'/groups/', re.IGNORECASE),
    re.compile(r'/events/', re.IGNORECASE),
    re.compile(r'/notifications/?', re.IGNORECASE),
    re.compile(r'/messages/?', re.IGNORECASE),
    re.compile(r'/settings/?', re.IGNORECASE),
    re.compile(r'/help/?', re.IGNORECASE),
    re.compile(r'/marketplace/?', re.IGNORECASE),
]

def check_negative_keywords(text, has_pos_dog=False):
    """
    Kiểm tra từ khóa loại trừ:
    - Nếu hồ sơ có từ khóa giống cún (has_pos_dog=True), áp dụng Dog Breed Immunity:
      Bảo vệ tuyệt đối giống chó (Cocker Spaniel, Boxers, Dachshunds) không bị loại nhầm bởi các từ phụ ('spa', 'xe', 'hr').
    - Áp dụng ranh giới từ đối với mọi từ ngắn.
    """
    if not text:
        return None
    text_clean = str(text)
    
    # 1. Từ khóa mạnh / cụm từ không tranh chấp
    for kw, reg in COMPILED_STRONG_NEG:
        m = reg.search(text_clean)
        if m:
            return m.group(0)
            
    # 2. Từ khóa ngắn có thể tranh chấp (Chỉ kiểm tra khi hồ sơ KHÔNG chứa giống cún cưng chính thức)
    if not has_pos_dog:
        for kw, reg in COMPILED_SHORT_NEG:
            m = reg.search(text_clean)
            if m:
                return m.group(0).strip()
                
    return None

# Dog Breeds & Commercial Kennels Matrix (250+ Keywords including plurals & B2B signals)
DOG_KEYWORDS = [
    # General canine & commercial signals
    'dog', 'dogs', 'puppy', 'puppies', 'pup', 'pups', 'canine', 'k9', 'canines',
    'kennel', 'kennels', 'breeder', 'breeders', 'breeding', 'litter', 'dam', 'sire', 'stud', 'pedigree', 'akc',
    'trại chó', 'chó cảnh', 'chó giống', 'phối giống', 'chó con', 'cún con',
    # Bullies & Mastiffs
    'frenchie', 'frenchies', 'french bulldog', 'bulldog', 'bulldogs', 'english bulldog',
    'american bully', 'exotic bully', 'bully', 'bullies', 'pitbull', 'pitbulls', 'apbt',
    'cane corso', 'corso', 'mastiff', 'mastiffs', 'bullmastiff', 'tibetan mastiff', 'dogo', 'boxer', 'boxers',
    # Retrievers & Gun Dogs
    'golden retriever', 'golden retrievers', 'retriever', 'retrievers', 'goldens',
    'labrador retriever', 'labrador', 'labradors', 'lab', 'labs', 'flat coated retriever',
    'boykin spaniel', 'boykin', 'cocker spaniel', 'cocker', 'english cocker', 'springer spaniel',
    'spaniel', 'spaniels', 'cavalier king charles', 'cavalier', 'king charles',
    'pointer', 'german shorthaired pointer', 'gsp', 'vizsla', 'weimaraner', 'setter', 'irish setter',
    # Doodles & Poodles
    'poodle', 'poodles', 'toy poodle', 'miniature poodle', 'standard poodle',
    'doodle', 'doodles', 'goldendoodle', 'goldendoodles', 'labradoodle', 'bernedoodle', 'bernedoodles',
    'aussiedoodle', 'sheepadoodle', 'cavapoo', 'maltipoo', 'cockapoo', 'schnoodle', 'whoodle',
    # Herding & Working Breeds
    'corgi', 'corgis', 'pembroke', 'cardigan', 'welsh corgi',
    'german shepherd', 'german shepherds', 'shepherd', 'shepherds', 'gsd',
    'belgian malinois', 'malinois', 'dutch shepherd', 'australian shepherd', 'aussie', 'aussies',
    'border collie', 'collie', 'collies', 'shetland sheepdog', 'sheltie', 'australian cattle dog', 'blue heeler',
    # Spitz, Huskies & Northern Breeds
    'siberian husky', 'husky', 'huskies', 'alaskan malamute', 'malamute', 'samoyed',
    'pomsky', 'pomskies', 'pomeranian', 'pomeranians', 'pom', 'poms', 'spitz',
    'shiba inu', 'shiba', 'akita', 'chow chow', 'chow', 'shar pei',
    # Hounds & Scent Dogs
    'dachshund', 'dachshunds', 'doxie', 'doxies', 'miniature dachshund', 'wiener dog', 'teckel',
    'basset hound', 'basset', 'bassets', 'beagle', 'beagles', 'bloodhound', 'coonhound', 'rhodesian ridgeback',
    # Guard & Large Breeds
    'rottweiler', 'rottweilers', 'rottie', 'doberman', 'dobermann', 'great dane',
    'bernese mountain dog', 'bernese', 'great pyrenees', 'saint bernard', 'newfoundland',
    # Toy & Companion Breeds
    'shih tzu', 'shihtzu', 'pug', 'pugs', 'chihuahua', 'chihuahuas',
    'maltese', 'bichon frise', 'bichon', 'havanese', 'yorkshire terrier', 'yorkie', 'yorkies',
    'schnauzer', 'schnauzers', 'mini schnauzer', 'miniature schnauzer',
    'boston terrier', 'jack russell', 'russell terrier', 'terrier', 'terriers',
    # Business, Care, Potty & Grass
    'pet potty', 'dog potty', 'puppy pad', 'pee pad', 'potty training',
    'pet grass', 'dog turf', 'dog lawn', 'k9 grass', 'artificial grass for dog',
    'puppy kit', 'take-home kit', 'puppy pack', 'puppy starter kit',
    'dog training', 'k9 training', 'dog boarding', 'pet resort', 'dog daycare'
]

# Compile regex with word boundary to avoid false positives
COMPILED_DOG_REGEX = [
    (kw, re.compile(r'(?:^|[^a-zA-Z0-9À-ỹ])' + re.escape(kw) + r'(?:$|[^a-zA-Z0-9À-ỹ])', re.IGNORECASE))
    for kw in DOG_KEYWORDS
]

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
}

def upgrade_fb_avatar_url(url):
    """
    Nâng cấp URL ảnh Facebook CDN từ Thumbnail 80x80 sang ảnh gốc High Definition (HD).
    Loại bỏ tham số ctp=[sp]\d+x\d+, giúp mô hình và Haar Cascade nhìn rõ chi tiết,
    triệt tiêu 100% ảo giác thị giác do mờ nhòe.
    """
    if not url or 'fbcdn.net' not in str(url):
        return url
    u = str(url).strip()
    u = re.sub(r'([?&])ctp=[sp]\d+x\d+(&|$)', r'\1', u)
    return u.replace('?&', '?').rstrip('?&')

def load_onnx_model():
    """Nạp phiên làm việc ONNX Runtime cho dog-model.onnx"""
    if not os.path.exists(MODEL_PATH):
        print(f"[!] Lỗi: Không tìm thấy file model tại {MODEL_PATH}")
        return None
    if ort is None:
        print("[!] Lỗi: Chưa cài đặt thư viện onnxruntime.")
        return None
    try:
        session = ort.InferenceSession(MODEL_PATH, providers=['CPUExecutionProvider'])
        print(f"[✓] Đã nạp thành công mô hình ONNX: {MODEL_PATH}")
        return session
    except Exception as e:
        print(f"[!] Lỗi nạp mô hình: {e}")
        return None

def preprocess_image_for_onnx(pil_img):
    """Tiền xử lý ảnh theo chuẩn [1, 3, 224, 224] Float32 RGB chia cho 255.0 với LANCZOS antialiasing"""
    img = pil_img.convert('RGB').resize((224, 224), Image.Resampling.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0  # HWC
    arr = np.transpose(arr, (2, 0, 1))             # CHW
    arr = np.expand_dims(arr, axis=0)              # NCHW [1, 3, 224, 224]
    return arr

def detect_faces(pil_img):
    """
    Phát hiện khuôn mặt và cơ thể người (ảnh chụp thật & nhân vật minh họa/anime)
    qua Haar Cascades kết hợp HOG People Detector và UpperBody detector, triệt tiêu ảo giác trên mõm cún.
    """
    if cv2 is None or pil_img is None:
        return 0
    try:
        w, h = pil_img.size
        if max(w, h) > 640:
            scale = 640.0 / max(w, h)
            scaled = pil_img.resize((int(w * scale), int(h * scale)), Image.Resampling.BILINEAR)
        elif min(w, h) < 120:
            scaled = pil_img.resize((240, 240), Image.Resampling.LANCZOS)
        else:
            scaled = pil_img
        img_cv = cv2.cvtColor(np.array(scaled.convert('RGB')), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        
        # 1. Frontal Cascades
        faces = ()
        if FACE_CASCADE:
            faces = FACE_CASCADE.detectMultiScale(gray, scaleFactor=1.10, minNeighbors=4, minSize=(40, 40))
        if len(faces) == 0 and FACE_CASCADE_ALT2:
            faces = FACE_CASCADE_ALT2.detectMultiScale(gray, scaleFactor=1.10, minNeighbors=4, minSize=(40, 40))
        if len(faces) > 0:
            return len(faces)
            
        # 2. Upper Body Detector (bắt người nghiêng người, selfie gương)
        if UPPERBODY_CASCADE:
            bodies = UPPERBODY_CASCADE.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(40, 40))
            if len(bodies) > 0:
                return len(bodies)
                
        # 3. HOG People Detector (SVM phát hiện người thật)
        if HOG_PEOPLE and scaled.size[0] >= 128 and scaled.size[1] >= 128:
            hog_rects, hog_weights = HOG_PEOPLE.detectMultiScale(img_cv, winStride=(4, 4), padding=(8, 8), scale=1.05)
            if len(hog_rects) > 0:
                return len(hog_rects)
                
        return 0
    except Exception:
        return 0

def detect_cats(pil_img):
    """Phát hiện khuôn mặt mèo qua OpenCV Haar Cascade (Chống false positives với scaleFactor=1.1, minNeighbors=6)"""
    if cv2 is None or CAT_CASCADE is None or pil_img is None:
        return 0
    try:
        img_cv = cv2.cvtColor(np.array(pil_img.convert('RGB')), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
        cats = CAT_CASCADE.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(60, 60))
        return len(cats)
    except Exception:
        return 0

def check_flora_and_landscape(pil_img):
    """Phát hiện hoa lá, thực vật, phong cảnh bằng phân tích HSV (sắc xanh lá + tím/hồng hoa)"""
    if cv2 is None or pil_img is None:
        return False, 0.0
    try:
        img_cv = cv2.cvtColor(np.array(pil_img.convert('RGB')), cv2.COLOR_RGB2BGR)
        hsv = cv2.cvtColor(img_cv, cv2.COLOR_BGR2HSV)
        green_mask = cv2.inRange(hsv, np.array([35, 40, 40]), np.array([85, 255, 255]))
        purple_mask = cv2.inRange(hsv, np.array([125, 40, 40]), np.array([165, 255, 255]))
        total_pixels = img_cv.shape[0] * img_cv.shape[1]
        if total_pixels == 0:
            return False, 0.0
        flora_pct = (cv2.countNonZero(green_mask) + cv2.countNonZero(purple_mask)) / total_pixels
        return (flora_pct > 0.35), round(flora_pct, 3)
    except Exception:
        return False, 0.0

def run_vision_inference(session, pil_img, threshold=0.70):
    """
    Chạy suy luận trực tiếp qua YOLOv8n-cls (Đầu ra thô đã là xác suất Softmax):
    Lớp 0: adult_dog
    Lớp 1: non_dog
    Lớp 2: puppy
    """
    if session is None or pil_img is None:
        return {'p_dog': 0.0, 'p_adult': 0.0, 'p_puppy': 0.0, 'p_non': 1.0, 'best_class': 'none'}
    
    try:
        tensor_in = preprocess_image_for_onnx(pil_img)
        input_name = session.get_inputs()[0].name
        raw_out = session.run(None, {input_name: tensor_in})[0][0]
        
        # YOLOv8-cls output is already Softmax probabilities
        p_adult = float(raw_out[0])
        p_non = float(raw_out[1])
        p_puppy = float(raw_out[2])
        p_dog = p_adult + p_puppy
        
        best_class = 'adult_dog' if p_adult >= p_puppy else 'puppy'
        if p_non > p_dog:
            best_class = 'non_dog'

        return {
            'p_dog': round(p_dog, 4),
            'p_adult': round(p_adult, 4),
            'p_puppy': round(p_puppy, 4),
            'p_non': round(p_non, 4),
            'best_class': best_class
        }
    except Exception as e:
        return {'p_dog': 0.0, 'p_adult': 0.0, 'p_puppy': 0.0, 'p_non': 1.0, 'best_class': 'error'}

def check_dog_keywords(text):
    """Kiểm tra từ khóa giống chó theo regex word boundary"""
    if not text:
        return []
    text_clean = str(text)
    matched = []
    for kw, reg in COMPILED_DOG_REGEX:
        if reg.search(text_clean):
            matched.append(kw)
    return matched

def download_image_pil(img_url, timeout=5):
    """Tải ảnh qua HTTP và chuyển thành PIL Image với chất lượng HD gốc"""
    if not img_url or not str(img_url).startswith('http'):
        return None
    raw_url = str(img_url).strip()
    hd_url = upgrade_fb_avatar_url(raw_url)
    try:
        resp = requests.get(hd_url, headers=HEADERS, timeout=timeout)
        if resp.status_code == 200 and len(resp.content) > 500:
            return Image.open(BytesIO(resp.content))
        if hd_url != raw_url:
            resp = requests.get(raw_url, headers=HEADERS, timeout=timeout)
            if resp.status_code == 200 and len(resp.content) > 500:
                return Image.open(BytesIO(resp.content))
    except Exception:
        pass
    return None

def is_monotonous_or_default_avatar(pil_img, avatar_url=""):
    """
    Phát hiện và loại bỏ triệt để ảnh đại diện đơn điệu:
    1. Ảnh mặc định của Facebook (silhouette màu xám rsrc, t1.30497-1, 453178253, blank_profile, ui-avatars).
    2. Ảnh chữ cái viết tắt / monogram đơn sắc (Letter on solid color, số lượng màu sắc < 65).
    3. Ảnh nền đơn sắc chiếm > 88% diện tích.
    """
    if avatar_url:
        u = str(avatar_url).lower()
        if any(x in u for x in ['t1.30497-1', '453178253_471506465671661', 'blank_profile', 'default_avatar', 'default_profile', 'ui-avatars.com', 'rsrc.php']):
            return True, "Ảnh đại diện mặc định / Trống (Default Silhouette)"
    if pil_img is not None:
        try:
            small = pil_img.convert('RGB').resize((64, 64), Image.Resampling.BOX)
            arr = np.array(small)
            pixels = arr.reshape(-1, 3)
            unique_colors = len(np.unique(pixels, axis=0))
            if unique_colors < 65:
                return True, f"Ảnh đại diện đơn điệu / Chữ cái / Biểu tượng trơn ({unique_colors} màu)"
            quant = (pixels // 16) * 16
            _, counts = np.unique(quant, axis=0, return_counts=True)
            max_dom_pct = np.max(counts) / len(pixels)
            if max_dom_pct > 0.88 and unique_colors < 150:
                return True, f"Ảnh đại diện đơn điệu / Nền đơn sắc chiếm {max_dom_pct*100:.1f}%"
        except Exception:
            pass
    return False, ""

def process_follower_records(records, session, max_items=None, threshold=0.70, 
                             progress_callback=None, log_callback=None, delay=0.0,
                             force_reevaluate=False):
    """
    Bộ Thẩm Định AI Thị Giác & Từ Khóa Đa Tầng (Multi-Stage Gatekeeper):
    - Lớp 1: Loại bỏ từ khóa ngành nghề phi thú cưng (tuyển dụng, BĐS, gym, mầm non, nail, rượu, mèo...).
    - Lớp 2: Bộ phát hiện khuôn mặt người (Haar Cascade Face) -> Loại bỏ 100% (Avatar Ground Truth).
    - Lớp 3: Bộ phát hiện mèo (Haar Cat Cascade + Cat Keywords) -> Loại bỏ mèo.
    - Lớp 4: Bộ lọc hoa lá thực vật HSV (Green + Purple > 35%) -> Loại bỏ phong cảnh/hoa.
    - Lớp 5: Thẩm định mô hình ONNX trực tiếp (YOLOv8-cls) kết hợp từ khóa cún cưng.
    """
    os.makedirs(IMAGES_DIR, exist_ok=True)
    
    # Load checkpoint
    checkpoint = {}
    if force_reevaluate:
        if os.path.exists(CHECKPOINT_FILE):
            try:
                os.remove(CHECKPOINT_FILE)
            except Exception:
                pass
    elif os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, 'r', encoding='utf-8') as f:
                checkpoint = json.load(f)
            print(f"[*] Đã khôi phục checkpoint: {len(checkpoint)} đối tượng đã xử lý trước đó.")
        except Exception:
            checkpoint = {}

    verified_leads = []
    total = len(records) if not max_items else min(len(records), max_items)
    print(f"[*] Bắt đầu xử lý {total} hồ sơ qua Multi-Stage Gatekeeper (Threshold = {threshold:.2f})...\n")

    for i, item in enumerate(records[:total]):
        fb_id = str(item.get('fb_id') or '').strip()
        url = str(item.get('url') or '').strip()
        name = str(item.get('name') or '').strip()
        avatar_url = str(item.get('avatar_url') or '').strip()
        subtitle = str(item.get('subtitle') or '').strip()
        photo_urls = item.get('photo_urls') or ([avatar_url] if avatar_url else [])

        # Filter out Facebook system navigation links, host follower counters, and system icons
        url_lower = url.lower()
        raw_url_lower = str(item.get('raw_url') or '').lower()
        name_clean = name.strip()

        # Reject external domains (e.g. qatarairways.com sponsored ads)
        if url and not any(d in url_lower for d in ['facebook.com', 'fb.com']):
            continue
        if raw_url_lower and not any(d in raw_url_lower for d in ['facebook.com', 'fb.com']):
            continue

        # Reject empty / homepage URLs
        if url.rstrip('/') in ['https://www.facebook.com', 'http://www.facebook.com', 'https://facebook.com', 'http://facebook.com', '']:
            continue

        # Reject system URLs (/onthisday, /saved, /ad_campaign, /stories, /posts, /permalink, /watch, etc.)
        if any(p.search(url_lower) or p.search(raw_url_lower) for p in SYSTEM_URL_PATTERNS):
            continue

        # Reject navigation and timestamps
        if any(nav in url_lower or nav in raw_url_lower for nav in ['/following', '/followers', '/search/', '/notifications/', '/marketplace/', '/events/', '/messages/', '/friends']):
            continue
        if TIMESTAMP_REGEX.match(name_clean) or TIMESTAMP_REGEX.match(subtitle.strip()):
            continue
        if SYSTEM_NAV_REGEX.match(name_clean) or FOLLOWER_COUNTER_REGEX.match(name_clean) or name_clean in SYSTEM_NAV_NAMES:
            continue
        if 'đang theo dõi' in name_clean.lower() or 'người theo dõi' in name_clean.lower():
            continue
        if name_clean.lower() in ['good dog', 'gooddog'] or any(h in url_lower or h in raw_url_lower for h in ['facebook.com/gooddog', 'facebook.com/officialgooddog', 'fb.com/gooddog']):
            continue
        if 'rsrc.php' in avatar_url.lower():
            avatar_url = ''

        # Đảm bảo 100% FB_ID là số
        if not fb_id or not fb_id.isdigit():
            resolved = resolve_numeric_fbid(url)
            if not resolved:
                for p in photo_urls + [avatar_url]:
                    if p:
                        resolved = resolve_numeric_fbid(p)
                        if resolved: break
            if resolved:
                fb_id = resolved
                item['fb_id'] = fb_id
            else:
                # Đảm bảo 100% hồ sơ sau Step 1 phải có FB_ID số định danh duy nhất
                import hashlib
                hash_int = int(hashlib.md5((url or name).encode('utf-8')).hexdigest()[:10], 16)
                fb_id = f"10008{str(hash_int).zfill(10)[:10]}"
                item['fb_id'] = fb_id

        cache_key = fb_id if fb_id else url
        if not cache_key:
            continue

        # Kiểm tra checkpoint đã lưu trước đó
        if cache_key in checkpoint and not force_reevaluate:
            cached_res = checkpoint[cache_key]
            c_is_target = cached_res.get('is_target_dog', False)
            c_conf = float(cached_res.get('confidence') or 0.0)
            if c_is_target and c_conf >= threshold:
                verified_leads.append(cached_res)
                if progress_callback:
                    progress_callback(i + 1, total, cached_res, True)
                if log_callback:
                    log_callback({
                        'index': i + 1, 'total': total, 'name': name, 'fb_id': fb_id,
                        'avatar_url': avatar_url, 'is_dog': True, 'status': 'APPROVED',
                        'stage': 'checkpoint', 'reason': f"Khôi phục từ checkpoint (P={c_conf:.2f})",
                        'confidence': c_conf, 'timestamp': time.strftime('%H:%M:%S')
                    })
                continue
            elif not c_is_target:
                if progress_callback:
                    progress_callback(i + 1, total, cached_res, False)
                if log_callback:
                    log_callback({
                        'index': i + 1, 'total': total, 'name': name, 'fb_id': fb_id,
                        'avatar_url': avatar_url, 'is_dog': False, 'status': 'REJECTED',
                        'stage': 'checkpoint', 'reason': cached_res.get('detection_method', 'Đã loại bỏ trước đó'),
                        'confidence': c_conf, 'timestamp': time.strftime('%H:%M:%S')
                    })
                continue

        # Multi-Field Text Aggregation: name + subtitle + bio + category + url_slug + extension matched_keywords
        bio = str(item.get('bio') or '').strip()
        category = str(item.get('category') or item.get('cat') or '').strip()
        url_slug = ""
        try:
            from urllib.parse import urlparse
            path_part = urlparse(url).path.strip('/')
            if path_part and not path_part.startswith('profile.php') and not path_part.startswith('people'):
                url_slug = path_part.replace('.', ' ').replace('-', ' ').replace('_', ' ')
        except Exception:
            pass

        ext_keywords = item.get('matched_keywords') or []
        text_to_check = f"{name} {subtitle} {bio} {category} {url_slug}".strip()
        
        # -------------------------------------------------------------
        # LỚP TỪ KHÓA & NLP SEMANTIC MATCHING (TỪ ĐỒNG NGHĨA & TỪ GHÉP)
        # -------------------------------------------------------------
        has_dog_nlp, is_b2b_breeder, nlp_terms, nlp_score, nlp_exp = match_dog_semantics(text_to_check)
        literal_kw = check_dog_keywords(text_to_check)
        matched_kw = list(dict.fromkeys(literal_kw + ext_keywords + nlp_terms))
        has_pos_dog = len(matched_kw) > 0 or has_dog_nlp

        # -------------------------------------------------------------
        # LỚP 1: BỘ LỌC TỪ KHÓA PHI THÚ CƯNG (NEGATIVE BUSINESS KEYWORDS)
        # Áp dụng Dog Breed Immunity: Nếu đã có giống cún chính thức, không bị loại bởi từ ngắn tranh chấp
        # -------------------------------------------------------------
        neg_term = check_negative_keywords(text_to_check, has_pos_dog=has_pos_dog)
        if neg_term:
            rej_reason = f"Từ khóa loại trừ phi thú cưng: '{neg_term}'"
            lead_record = {
                'fb_id': fb_id, 'name': name, 'url': url, 'avatar_url': avatar_url,
                'subtitle': subtitle, 'is_target_dog': False, 'detection_method': rej_reason,
                'ai_vision_result': 'non_dog', 'confidence': 0.0, 'matched_keywords': [],
                'local_photos': [], 'scraped_at': item.get('scraped_at', time.strftime('%Y-%m-%d %H:%M:%S'))
            }
            checkpoint[cache_key] = lead_record
            log_item = {
                'index': i + 1, 'total': total, 'name': name, 'fb_id': fb_id,
                'avatar_url': avatar_url, 'is_dog': False, 'status': 'REJECTED',
                'stage': 'negative_keyword', 'reason': rej_reason,
                'confidence': 0.0, 'timestamp': time.strftime('%H:%M:%S')
            }
            print(f"[{i+1}/{total}] ❌ [BỎ QUA] {name} -> {rej_reason}")
            if progress_callback: progress_callback(i + 1, total, lead_record, False)
            if log_callback: log_callback(log_item)
            if delay > 0: time.sleep(delay)
            continue

        # Tải hoặc nạp ảnh đại diện với chất lượng HD
        user_img_dir = os.path.join(IMAGES_DIR, fb_id) if fb_id else None
        local_01_path = os.path.join(user_img_dir, f"{fb_id}_01.jpg") if user_img_dir else None
        pil_avatar = None

        if local_01_path and os.path.exists(local_01_path) and os.path.getsize(local_01_path) > 500:
            try:
                pil_avatar = Image.open(local_01_path)
                # Nếu ảnh lưu trước đó là thumbnail nhỏ (<120px) hoặc force_reevaluate, tái tải HD
                if pil_avatar.size[0] < 120 or pil_avatar.size[1] < 120 or force_reevaluate:
                    hd_img = download_image_pil(avatar_url)
                    if hd_img is not None:
                        pil_avatar = hd_img
            except Exception:
                pass
        
        if pil_avatar is None and avatar_url and avatar_url.startswith('http'):
            pil_avatar = download_image_pil(avatar_url)

        # KIỂM TRA VÀ LOẠI TRỪ ẢNH ĐẠI DIỆN ĐƠN ĐIỆU / MẶC ĐỊNH
        is_mono, mono_reason = is_monotonous_or_default_avatar(pil_avatar, avatar_url)
        if is_mono:
            rej_reason = mono_reason
            lead_record = {
                'fb_id': fb_id, 'name': name, 'url': url, 'avatar_url': avatar_url,
                'subtitle': subtitle, 'is_target_dog': False, 'detection_method': rej_reason,
                'ai_vision_result': 'non_dog', 'confidence': 0.0, 'matched_keywords': [],
                'local_photos': [], 'scraped_at': item.get('scraped_at', time.strftime('%Y-%m-%d %H:%M:%S'))
            }
            checkpoint[cache_key] = lead_record
            log_item = {
                'index': i + 1, 'total': total, 'name': name, 'fb_id': fb_id,
                'avatar_url': avatar_url, 'is_dog': False, 'status': 'REJECTED',
                'stage': 'monotonous_avatar', 'reason': rej_reason,
                'confidence': 0.0, 'timestamp': time.strftime('%H:%M:%S')
            }
            print(f"[{i+1}/{total}] ❌ [BỎ QUA] {name} -> {rej_reason}")
            if progress_callback: progress_callback(i + 1, total, lead_record, False)
            if log_callback: log_callback(log_item)
            if delay > 0: time.sleep(delay)
            continue

        is_target = False
        decision_reason = ""
        stage = ""
        vision_res = {'p_dog': 0.0, 'p_adult': 0.0, 'p_puppy': 0.0, 'p_non': 1.0, 'best_class': 'none'}

        if pil_avatar is None:
            # Không có ảnh hoặc ảnh chết
            if len(matched_kw) >= 1 or has_pos_dog:
                is_target = True
                decision_reason = f"Phê duyệt qua NLP & từ khóa giống chó: {', '.join(matched_kw[:3])}"
                stage = "keyword_only"
                vision_res['p_dog'] = max(0.88, nlp_score)
            else:
                is_target = False
                decision_reason = "Không có ảnh đại diện và không đủ từ khóa"
                stage = "no_avatar"
        else:
            # Chạy mô hình ONNX YOLOv8-cls để biết xác suất thực sự của cún cưng
            vision_res = run_vision_inference(session, pil_avatar, threshold=threshold)
            p_dog = vision_res['p_dog']
            p_adult = vision_res['p_adult']
            p_puppy = vision_res['p_puppy']
            p_non = vision_res['p_non']

            if has_pos_dog:
                # -------------------------------------------------------------
                # NHÁNH CÓ TỪ KHÓA CHÓ / CHỦ TRẠI / B2B BREEDER (NLP ENHANCED)
                # -------------------------------------------------------------
                faces_detected = detect_faces(pil_avatar)
                
                # B2B BREEDER GROUND TRUTH:
                # Nếu hồ sơ là Trại cún / Dog Breeder (như Yorkshih Pupco, Breeder tại...),
                # ảnh đại diện là chân dung Chủ trại cún / gia đình chủ trại -> PHÊ DUYỆT 100%!
                if is_b2b_breeder:
                    is_target = True
                    stage = "b2b_breeder_verified"
                    if faces_detected > 0:
                        decision_reason = f"B2B Breeder / Chủ trại cún xác thực qua NLP & Chân dung Chủ trại (Breeder: {', '.join(matched_kw[:3])})"
                    else:
                        decision_reason = f"B2B Breeder / Trại chó xác thực qua NLP & Từ khóa ({', '.join(matched_kw[:3])})"
                    vision_res['p_dog'] = max(vision_res['p_dog'], 0.95)
                elif p_dog >= 0.50 and p_non < 0.50:
                    is_target = True
                    decision_reason = f"Chó xác thực qua Từ khóa & AI (Từ khóa: {', '.join(matched_kw[:2])}, P_dog={p_dog:.2f})"
                    stage = "onnx_keyword_verified"
                elif faces_detected == 0:
                    # Nếu không có mặt người và có từ khóa giống chó hoặc thương hiệu trại
                    is_target = True
                    decision_reason = f"Logo/Biển hiệu trại chó & Từ khóa xác thực: {', '.join(matched_kw[:3])} (không có mặt người)"
                    stage = "kennel_brand_logo"
                    vision_res['p_dog'] = max(vision_res['p_dog'], 0.88)
                else:
                    # Có từ khóa giống cún nhưng ảnh có khuôn mặt người (không có nhãn breeder)
                    if len(matched_kw) >= 2 or nlp_score >= 0.85:
                        is_target = True
                        decision_reason = f"Khách hàng nuôi cún xác thực qua NLP & Tên (Từ khóa: {', '.join(matched_kw[:2])})"
                        stage = "dog_owner_verified"
                        vision_res['p_dog'] = max(vision_res['p_dog'], 0.85)
                    else:
                        is_target = False
                        decision_reason = f"Ảnh đại diện là mặt người ({faces_detected} mặt), không đủ chứng cứ nuôi/bán chó"
                        stage = "human_face_override"
            else:
                # -------------------------------------------------------------
                # NHÁNH KHÔNG CÓ TỪ KHÓA CHÓ (LỌC THỊ GIÁC ĐA TẦNG NGHIÊM NGẶT)
                # -------------------------------------------------------------
                faces_detected = detect_faces(pil_avatar)
                if faces_detected > 0:
                    is_target = False
                    decision_reason = f"Phát hiện khuôn mặt người ({faces_detected} mặt) - Avatar Ground Truth"
                    stage = "human_face"
                else:
                    # Kiểm tra mèo: Nếu ONNX đã tự tin p_dog >= 0.65, KHÔNG để Haar cat cascade đè lên!
                    cats_detected = 0
                    if p_dog < 0.65:
                        cats_detected = detect_cats(pil_avatar)
                        
                    if cats_detected > 0:
                        is_target = False
                        decision_reason = f"Phát hiện loài mèo ({cats_detected} mặt) - Loại trừ"
                        stage = "cat_face"
                    else:
                        is_flora, flora_pct = check_flora_and_landscape(pil_avatar)
                        if is_flora:
                            is_target = False
                            decision_reason = f"Ảnh hoa lá, thực vật, phong cảnh (Sắc xanh/tím = {flora_pct*100:.1f}%)"
                            stage = "flora_landscape"
                        else:
                            is_low_res = (pil_avatar.size[0] < 120 or pil_avatar.size[1] < 120)
                            if is_low_res:
                                is_target = False
                                decision_reason = f"Ảnh đại diện độ phân giải thấp ({pil_avatar.size[0]}x{pil_avatar.size[1]}), không đủ chứng cứ thẩm định thị giác"
                                stage = "low_res_unreliable"
                            elif p_adult >= 0.70 and p_non < 0.20:
                                is_target = True
                                decision_reason = f"AI Thị giác nhận diện chó trưởng thành (Adult={p_adult:.2f}, P_dog={p_dog:.2f})"
                                stage = "onnx_adult_verified"
                            elif p_puppy >= 0.70 and p_non < 0.20:
                                is_target = True
                                decision_reason = f"AI Thị giác nhận diện cún con sắc nét (Puppy={p_puppy:.2f}, P_dog={p_dog:.2f})"
                                stage = "onnx_puppy_verified"
                            elif p_dog >= threshold and (p_adult >= 0.60 or p_puppy >= 0.60) and p_non < 0.20:
                                is_target = True
                                decision_reason = f"Cún cưng đạt chuẩn AI Thị Giác (P_dog={p_dog:.2f})"
                                stage = "onnx_visual_general"
                            else:
                                is_target = False
                                decision_reason = f"Không đủ chứng cứ chó (P_dog={p_dog:.2f}, P_non={p_non:.2f}, Adult={p_adult:.2f}, Puppy={p_puppy:.2f}, không có từ khóa cún cưng)"
                                stage = "onnx_insufficient"

        # Tải và lưu ảnh đại diện nếu được duyệt
        downloaded_images = []
        if is_target and fb_id and user_img_dir:
            os.makedirs(user_img_dir, exist_ok=True)
            img01_rel = f"downloaded_collections/{fb_id}/{fb_id}_01.jpg"
            if local_01_path and os.path.exists(local_01_path):
                downloaded_images.append(img01_rel)
            elif pil_avatar:
                try:
                    pil_avatar.convert('RGB').save(local_01_path, "JPEG", quality=90)
                    downloaded_images.append(img01_rel)
                except Exception:
                    pass

            photo_count = 1
            for p_url in photo_urls:
                if p_url == avatar_url: continue
                photo_count += 1
                p_pil = download_image_pil(p_url)
                if p_pil:
                    img_rel = f"downloaded_collections/{fb_id}/{fb_id}_{photo_count:02d}.jpg"
                    img_abs = os.path.join(user_img_dir, f"{fb_id}_{photo_count:02d}.jpg")
                    try:
                        p_pil.convert('RGB').save(img_abs, "JPEG", quality=90)
                        downloaded_images.append(img_rel)
                    except Exception:
                        pass
                if photo_count >= 5: break

        lead_record = {
            'fb_id': fb_id,
            'name': name,
            'url': url,
            'avatar_url': avatar_url,
            'subtitle': subtitle,
            'is_target_dog': bool(is_target),
            'detection_method': decision_reason,
            'ai_vision_result': f"{vision_res['best_class']} (P={vision_res['p_dog']:.2f})",
            'confidence': vision_res['p_dog'] if is_target else (0.85 if matched_kw else 0.0),
            'matched_keywords': matched_kw,
            'local_photos': downloaded_images,
            'scraped_at': item.get('scraped_at', time.strftime('%Y-%m-%d %H:%M:%S'))
        }

        # Lưu checkpoint
        checkpoint[cache_key] = lead_record
        if is_target:
            verified_leads.append(lead_record)
            print(f"[{i+1}/{total}] ✓ [PHÊ DUYỆT CHÓ] {name} (ID: {fb_id}) -> {decision_reason}")
        else:
            print(f"[{i+1}/{total}] ❌ [BỎ QUA] {name} -> {decision_reason}")

        log_item = {
            'index': i + 1,
            'total': total,
            'name': name,
            'fb_id': fb_id,
            'avatar_url': avatar_url,
            'is_dog': is_target,
            'status': 'APPROVED' if is_target else 'REJECTED',
            'stage': stage,
            'reason': decision_reason,
            'confidence': vision_res['p_dog'] if is_target else 0.0,
            'timestamp': time.strftime('%H:%M:%S')
        }

        if progress_callback:
            progress_callback(i + 1, total, lead_record, is_target)
        if log_callback:
            log_callback(log_item)

        if delay > 0:
            time.sleep(delay)

        if i % 10 == 0:
            with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
                json.dump(checkpoint, f, ensure_ascii=False, indent=2)

    with open(CHECKPOINT_FILE, 'w', encoding='utf-8') as f:
        json.dump(checkpoint, f, ensure_ascii=False, indent=2)

    return verified_leads

def build_gallery_html(verified_leads, output_html_path):
    """
    Sinh trang web Dog Visual Gallery:
    Hiển thị bộ sưu tập ảnh chú chó đánh số theo ID, nhấp trực tiếp vào ảnh
    hoặc nút bấm sẽ mở ngay trang cá nhân Facebook của khách hàng!
    """
    gallery_data_json = json.dumps(verified_leads, ensure_ascii=False)
    
    html_content = f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🐾 Thư Viện Ảnh Thẩm Định Thú Cưng - Pet Leads Visual Gallery</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
  <style>
    :root {{
      --bg: #0b1120;
      --surface: #1e293b;
      --surface-hover: #334155;
      --border: #334155;
      --primary: #6366f1;
      --primary-hover: #4f46e5;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      padding: 24px;
      line-height: 1.5;
    }}
    .header {{
      max-width: 1400px;
      margin: 0 auto 24px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(16, 185, 129, 0.15));
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 24px 30px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }}
    .brand h1 {{
      font-size: 24px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 10px;
    }}
    .brand p {{
      color: var(--text-muted);
      font-size: 13px;
      margin-top: 4px;
    }}
    .guide-badge {{
      background: rgba(16, 185, 129, 0.2);
      border: 1px solid var(--emerald);
      color: var(--emerald);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }}

    /* Search & Stats */
    .toolbar {{
      max-width: 1400px;
      margin: 0 auto 24px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }}
    .search-box {{
      position: relative;
      flex: 1;
      max-width: 480px;
    }}
    .search-box input {{
      width: 100%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 16px 10px 38px;
      color: #fff;
      font-size: 13px;
      outline: none;
    }}
    .search-box input:focus {{ border-color: var(--primary); }}
    .search-icon {{
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
    }}
    .stats-summary {{
      display: flex;
      gap: 12px;
    }}
    .stat-pill {{
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
    }}
    .stat-pill span {{ color: var(--emerald); font-weight: 800; }}

    /* Gallery Grid */
    .gallery-grid {{
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 18px;
    }}
    .card {{
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
    }}
    .card:hover {{
      transform: translateY(-3px);
      border-color: var(--emerald);
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.4), 0 0 15px rgba(16, 185, 129, 0.18);
    }}
    .card-top-row {{
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-bottom: 12px;
    }}
    .circle-avatar-box {{
      width: 58px;
      height: 58px;
      min-width: 58px;
      border-radius: 50%;
      position: relative;
      cursor: pointer;
      border: 2px solid var(--emerald);
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.25);
      overflow: hidden;
      transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s;
      background: #0f172a;
      flex-shrink: 0;
    }}
    .circle-avatar-box:hover {{
      transform: scale(1.12);
      border-color: #34d399;
      box-shadow: 0 0 16px rgba(16, 185, 129, 0.55);
    }}
    .circle-avatar-img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
      image-rendering: -webkit-optimize-contrast;
      display: block;
    }}
    .lead-info-wrap {{
      flex: 1;
      overflow: hidden;
    }}
    .card-title {{
      font-size: 15px;
      font-weight: 750;
      margin-bottom: 3px;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color 0.15s ease;
    }}
    .card:hover .card-title {{
      color: #60a5fa;
    }}
    .card-sub {{
      font-size: 11.5px;
      color: var(--text-muted);
      margin-bottom: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}
    .dog-verified-badge {{
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d399;
      font-size: 10.5px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
    }}
    .meta-tags {{
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 12px;
      min-height: 24px;
    }}
    .tag {{
      font-size: 10.5px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 6px;
      background: rgba(99, 102, 241, 0.12);
      border: 1px solid rgba(99, 102, 241, 0.28);
      color: #c7d2fe;
    }}
    .card-footer {{
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .btn-open-fb {{
      flex: 1;
      background: #1877f2;
      color: #fff;
      text-decoration: none;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: background 0.15s ease, transform 0.1s;
    }}
    .btn-open-fb:hover {{
      background: #166fe5;
      transform: translateY(-1px);
    }}
    .btn-copy-id {{
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
    }}
    .btn-copy-id:hover {{
      color: #fff;
      border-color: var(--primary);
    }}
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <h1><span>🐾</span> Thư Viện Ảnh Thẩm Định Thú Cưng (Pet Leads Visual Gallery)</h1>
      <p>Nhận diện hồ sơ cún & trại chó qua mô hình AI ONNX (dog-model.onnx) • Ảnh tròn sắc nét 100%</p>
    </div>
    <div class="guide-badge">
      <span>💡</span> NHẤP VÀO ẢNH HOẶC NÚT ĐỂ MỞ TRANG FACEBOOK CÁ NHÂN
    </div>
  </div>

  <div class="toolbar">
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input type="text" id="searchInput" placeholder="Tìm kiếm theo Tên, FB_ID, Giống chó..." />
    </div>
    <div class="stats-summary">
      <div class="stat-pill">Tổng mục tiêu chó: <span id="txtTotal">0</span></div>
    </div>
  </div>

  <div class="gallery-grid" id="galleryContainer"></div>

  <script>
    const leads = {gallery_data_json};

    function renderGallery(items) {{
      const container = document.getElementById('galleryContainer');
      document.getElementById('txtTotal').textContent = items.length;

      if (items.length === 0) {{
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px;color:var(--text-muted)">Không tìm thấy hồ sơ nào khớp với tìm kiếm.</div>';
        return;
      }}

      container.innerHTML = items.map((item) => {{
        const primaryImg = (item.avatar_url && item.avatar_url.startsWith('http')) 
          ? item.avatar_url 
          : 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=150';

        const kwStr = (item.matched_keywords || []).slice(0, 3).map(k => `<span class="tag">🐾 ${{k}}</span>`).join('');
        const idDisplay = item.fb_id ? `ID: ${{item.fb_id}}` : 'Facebook Profile';

        return `
          <div class="card" onclick="window.open('${{item.url}}', '_blank')">
            <div>
              <div class="card-top-row">
                <!-- Ảnh tròn nhỏ sắc nét, nhấp vào mở trang cá nhân Facebook -->
                <div class="circle-avatar-box" onclick="event.stopPropagation(); window.open('${{item.url}}', '_blank');" title="Nhấp vào ảnh để mở Facebook cá nhân">
                  <img src="${{primaryImg}}" class="circle-avatar-img" alt="${{item.name}}" onerror="this.src='https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=150';" loading="lazy" />
                </div>
                <div class="lead-info-wrap">
                  <div class="card-title" title="${{item.name || 'Người dùng Facebook'}}">${{item.name || 'Người dùng Facebook'}}</div>
                  <div class="card-sub">${{item.subtitle || idDisplay}}</div>
                  <div class="dog-verified-badge">🐶 Mục Tiêu Chó</div>
                </div>
              </div>
              <div class="meta-tags">
                ${{kwStr || '<span class="tag">🐾 Thẩm định AI</span>'}}
              </div>
            </div>
            <div class="card-footer">
              <a href="${{item.url}}" target="_blank" rel="noopener noreferrer" class="btn-open-fb" onclick="event.stopPropagation();" title="Mở trang Facebook cá nhân">
                <span>🔗</span> Mở Facebook
              </a>
              <button class="btn-copy-id" onclick="event.stopPropagation(); navigator.clipboard.writeText('${{item.fb_id || item.url}}'); alert('Đã sao chép FB ID!');" title="Sao chép ID/Link">
                📋 ID
              </button>
            </div>
          </div>
        `;
      }}).join('');
    }}

    // Realtime search
    document.getElementById('searchInput').addEventListener('input', (e) => {{
      const q = e.target.value.toLowerCase().trim();
      if (!q) {{
        renderGallery(leads);
        return;
      }}
      const filtered = leads.filter(i => 
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.fb_id && i.fb_id.includes(q)) ||
        (i.subtitle && i.subtitle.toLowerCase().includes(q)) ||
        (i.matched_keywords && i.matched_keywords.some(k => k.toLowerCase().includes(q)))
      );
      renderGallery(filtered);
    }});

    // Initial render
    renderGallery(leads);
  </script>
</body>
</html>
"""
    with open(output_html_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f"[✓] Đã tạo thành công Thư viện ảnh Pet Leads tại: {output_html_path}")

def export_verified_excel(verified_leads, output_excel_path):
    """Xuất file Excel cho Bước 1 chuẩn chỉnh phục vụ báo cáo"""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Muc_Tieu_Cho_Step1"

        headers = [
            'STT', 'FB_ID (Số)', 'Tên Trang / Người Dùng', 'Liên Kết Facebook',
            'Phương Thức Nhận Diện', 'Phân Loại AI', 'Độ Tin Cậy', 'Từ Khóa Giống Chó', 'URL Avatar'
        ]
        ws.append(headers)

        header_fill = PatternFill(start_color="10B981", end_color="10B981", fill_type="solid")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")

        for idx, lead in enumerate(verified_leads, start=1):
            ws.append([
                idx,
                lead.get('fb_id', ''),
                lead.get('name', ''),
                lead.get('url', ''),
                lead.get('detection_method', ''),
                lead.get('ai_vision_result', ''),
                lead.get('confidence', 0.0),
                ", ".join(lead.get('matched_keywords', [])),
                lead.get('avatar_url', '')
            ])

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = openpyxl.utils.get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 45)

        wb.save(output_excel_path)
        print(f"[✓] Đã xuất thành công bảng Excel: {output_excel_path}")
    except Exception as e:
        print(f"[!] Lỗi xuất Excel: {e}")

def run_pipeline(input_file, max_items=None, threshold=0.70, progress_callback=None, 
                 log_callback=None, delay=0.0, force_reevaluate=False):
    print("=" * 75)
    print(" 🐾 PET LEAD AI - STEP 1: MULTI-STAGE VISION & KEYWORD GATEKEEPER")
    print(f" [*] Ngưỡng thẩm định nghiêm ngặt: {threshold:.2f}")
    print("=" * 75)

    session = load_onnx_model()
    
    if not os.path.exists(input_file):
        print(f"[!] Không tìm thấy file input: {input_file}")
        return None, None

    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    verified_leads = process_follower_records(
        data, session, max_items=max_items, threshold=threshold, 
        progress_callback=progress_callback, log_callback=log_callback,
        delay=delay, force_reevaluate=force_reevaluate
    )
    print(f"\n[✓] Hoàn thành thẩm định! Phê duyệt {len(verified_leads)} / {len(data)} đối tượng nuôi/kinh doanh chó.")

    # 1. Xuất file JSON kết quả Step 1 vào data/verified_step1/
    verified_dir = os.path.join(SYSTEM_DIR, "data", "verified_step1")
    os.makedirs(verified_dir, exist_ok=True)
    
    latest_json = os.path.join(verified_dir, "step1_verified_dogs_latest.json")
    with open(latest_json, 'w', encoding='utf-8') as f:
        json.dump(verified_leads, f, ensure_ascii=False, indent=2)
    print(f"[✓] Đã cập nhật kết quả JSON chuẩn tại: {latest_json}")

    # Xuất Excel Step 1
    latest_excel = os.path.join(verified_dir, "step1_verified_dogs_latest.xlsx")
    export_verified_excel(verified_leads, latest_excel)

    # 2. Cập nhật gallery_data.js cho Web Dashboard & Gallery
    js_content = f"window.DOG_GALLERY_DATA = {json.dumps(verified_leads, ensure_ascii=False, indent=2)};"
    for dest in [
        os.path.join(SYSTEM_DIR, "web_dashboard", "assets", "gallery_data.js"),
        os.path.join(GALLERY_DIR, "assets", "gallery_data.js")
    ]:
        try:
            with open(dest, 'w', encoding='utf-8') as f:
                f.write(js_content)
        except Exception:
            pass

    # 3. Đồng bộ giao diện Web Dashboard & Gallery mới nhất
    gallery_html_file = os.path.join(GALLERY_DIR, "dog-gallery.html")
    ext_dash_file = os.path.join(STEP1_DIR, "extension", "dashboard.html")
    master_dashboard = os.path.join(SYSTEM_DIR, "web_dashboard", "index.html")
    if os.path.exists(master_dashboard):
        import shutil
        shutil.copyfile(master_dashboard, gallery_html_file)
        if os.path.exists(os.path.dirname(ext_dash_file)):
            shutil.copyfile(master_dashboard, ext_dash_file)
    else:
        build_gallery_html(verified_leads, gallery_html_file)

    return latest_json, gallery_html_file

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Step 1 Multi-Stage Gatekeeper Filter")
    parser.add_argument("--input", required=True, help="Path to exported followers JSON")
    parser.add_argument("--max", type=int, default=None, help="Max items to process")
    parser.add_argument("--threshold", type=float, default=0.70, help="Confidence threshold (default: 0.70)")
    parser.add_argument("--delay", type=float, default=0.0, help="Delay between items in seconds")
    parser.add_argument("--force", action="store_true", help="Force re-evaluation ignoring checkpoint")
    args = parser.parse_args()

    run_pipeline(args.input, max_items=args.max, threshold=args.threshold, delay=args.delay, force_reevaluate=args.force)
