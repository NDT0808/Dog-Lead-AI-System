#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module: step2_substep1_post_intro_extractor.py
Chức năng: Bước 2.1 trong Quy trình làm giàu hồ sơ Meta CRM:
1. Đọc và phân tích phần Giới thiệu (Intro / About) từ mã nguồn / URL Facebook:
   - Tên cá nhân / Tên trại chó
   - Bio (Tiểu sử giới thiệu)
   - Loại hình doanh nghiệp (Category)
   - Số điện thoại liên hệ (Phone chuẩn US)
   - Email kinh doanh
   - Website chính thức (giải mã redirect l.facebook.com)
   - Địa chỉ (City, State, Country)
   - Numeric Facebook ID (FB_ID dạng số)

2. Đọc và phân tích Bài viết gần nhất (Latest Post) & Publish Time:
   - Publish Time (Thời gian đăng bài: Unix Timestamp + Định dạng ngày giờ UTC + Thời gian tương đối)
   - Khoảng thời gian từ bài đăng gần nhất (days_ago)
   - Trạng thái hoạt động (Activity Status):
     + 🔥 ACTIVE (< 30 ngày): Chủ trại đang hoạt động mạnh, ưu tiên chốt đơn số 1.
     + ⚠️ WARM (30 - 90 ngày): Vẫn có hoạt động định kỳ.
     + ❄️ DORMANT / COLD (> 90 ngày): Ít cập nhật Facebook.
   - Nội dung bài đăng gần nhất (Post message text)
   - Link bài đăng (Post permalink)
   - Phân tích ý định bán cún / dịch vụ cún cưng (Puppy Selling Intent) & Gợi ý gói sản phẩm (Product Fit).
"""

import os
import sys
import re
import json
import html
import time
import datetime
import urllib.parse
from bs4 import BeautifulSoup

# US States mapping
US_STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
    "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
    "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
    "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
    "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming"
}

PHONE_REGEX = re.compile(r'(?:\+?1[\s.\-]?)?(?:\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-](\d{4}))')
EMAIL_REGEX = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b')

# Intent Keywords
PUPPY_INTENT_KEYWORDS = [
    'puppy', 'puppies', 'litter', 'litters', 'for sale', 'available', 'ready for homes',
    'taking deposits', 'accepting deposits', 'born on', 'weeks old', 'chó con', 'xuất chuồng',
    'tìm nhà mới', 'rước cún', 'đón cún', 'bán cún'
]

STUD_BREEDING_KEYWORDS = [
    'stud', 'stud service', 'sire', 'dam', 'pedigree', 'champion bloodline',
    'phối giống', 'chó đực giống', 'gen giống'
]

CARE_POTTY_KEYWORDS = [
    'potty', 'potty training', 'pad', 'turf', 'grass', 'lawn', 'kennel run',
    'khay vệ sinh', 'cỏ cún', 'thảm cỏ', 'đi vệ sinh'
]

TOY_ENRICHMENT_KEYWORDS = [
    'toy', 'toys', 'chew', 'ball', 'fetch', 'enrichment', 'playtime', 'đồ chơi', 'gặm'
]


def parse_publish_time(timestamp_val):
    """Chuyển đổi timestamp sang định dạng ngày giờ và thời gian tương đối"""
    try:
        ts = int(timestamp_val)
        if ts > 10000000000: # Milliseconds
            ts = ts // 1000
        
        post_dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
        now_dt = datetime.datetime.now(datetime.timezone.utc)
        
        iso_str = post_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        human_str = post_dt.strftime('%d/%m/%Y %H:%M UTC')
        
        diff = now_dt - post_dt
        days_ago = max(0, diff.days)
        seconds_ago = max(0, int(diff.total_seconds()))
        
        if seconds_ago < 3600:
            rel_str = f"{max(1, seconds_ago // 60)} phút trước"
        elif seconds_ago < 86400:
            rel_str = f"{seconds_ago // 3600} giờ trước"
        elif days_ago < 30:
            rel_str = f"{days_ago} ngày trước"
        elif days_ago < 365:
            rel_str = f"{days_ago // 30} tháng trước"
        else:
            rel_str = f"{days_ago // 365} năm trước"
            
        # Đánh giá Activity Status
        if days_ago <= 14:
            activity = "🔥 RẤT TÍCH CỰC (Đăng bài trong 2 tuần qua)"
            tier_act = "HOT_ACTIVE"
        elif days_ago <= 45:
            activity = "✓ TÍCH CỰC (Đăng bài trong 1.5 tháng qua)"
            tier_act = "ACTIVE"
        elif days_ago <= 90:
            activity = "⚠️ TRUNG BÌNH (Đăng bài trong 3 tháng qua)"
            tier_act = "WARM"
        else:
            activity = f"❄️ ĐÓNG BĂNG (> {days_ago // 30} tháng chưa có bài mới)"
            tier_act = "DORMANT"
            
        return {
            'timestamp': ts,
            'iso': iso_str,
            'human': human_str,
            'relative': rel_str,
            'days_ago': days_ago,
            'activity_status': activity,
            'activity_tier': tier_act
        }
    except Exception:
        return {
            'timestamp': 0,
            'iso': '',
            'human': 'Chưa xác định',
            'relative': 'Không rõ',
            'days_ago': 999,
            'activity_status': 'Chưa rõ thời gian đăng',
            'activity_tier': 'UNKNOWN'
        }


def extract_post_and_intro_from_html(html_content, source_url=""):
    """
    Bóc tách phần Giới thiệu (Intro / About) và Bài viết gần nhất (Latest Post) + Publish Time
    từ chuỗi mã nguồn HTML Facebook.
    """
    result = {
        'status': 'ok',
        'source_url': source_url,
        'profile_id': '',
        'name': '',
        'avatar_url': '',
        'category': 'Dog Breeder / Kennel (B2B)',
        'intro': {
            'bio': '',
            'phone': '',
            'email': '',
            'website': '',
            'city': '',
            'state': '',
            'country': 'United States',
            'full_address': ''
        },
        'latest_post': {
            'publish_time': '',
            'publish_timestamp': 0,
            'publish_human': '',
            'relative_time': '',
            'days_ago': 999,
            'activity_status': 'Chưa tìm thấy bài viết',
            'activity_tier': 'UNKNOWN',
            'post_text': '',
            'post_url': '',
            'has_photos': False,
            'photo_urls': []
        },
        'sales_intelligence': {
            'puppy_available': False,
            'stud_service': False,
            'recommended_product': 'Puppy Starter Kit V2/V3 (Khay vệ sinh + Cỏ cún)',
            'sales_pitch': '',
            'lead_score_boost': 0
        }
    }

    if not html_content:
        result['status'] = 'empty'
        return result

    # 1. Bóc tách Tên, ID số, Avatar từ thẻ OpenGraph & Title
    m_title = re.search(r'<title>(.*?)</title>', html_content, re.IGNORECASE)
    raw_title = html.unescape(m_title.group(1).strip()) if m_title else ""
    
    m_og_title = re.search(r'property="og:title"\s+content="([^"]+)"', html_content)
    og_title = html.unescape(m_og_title.group(1).strip()) if m_og_title else ""
    
    cand_name = og_title or raw_title
    if cand_name and cand_name.lower() != 'facebook':
        if '|' in cand_name:
            parts = [p.strip() for p in cand_name.split('|')]
            result['name'] = parts[0]
            loc = parts[1]
            m_st = re.search(r'\b([A-Z]{2})\b', loc)
            if m_st and m_st.group(1) in US_STATES:
                result['intro']['state'] = m_st.group(1)
                result['intro']['city'] = loc[:m_st.start()].strip(', ')
        else:
            result['name'] = re.sub(r'\s*[-|]\s*Facebook$', '', cand_name, flags=re.IGNORECASE).strip()

    # Avatar HD
    m_img = re.search(r'property="og:image"\s+content="([^"]+)"', html_content)
    if m_img:
        av = html.unescape(m_img.group(1).strip())
        av = re.sub(r'ctp=[sp]\d+x\d+&?', '', av).rstrip('&?').strip()
        result['avatar_url'] = av

    # Numeric ID (Tuyệt đối không lấy "userID" của người đăng nhập xem trang)
    m_fbid = re.search(r'fb://(?:page|profile)/\?id=(\d+)', html_content) or re.search(r'set=pb\.(\d+)\.', html_content) or re.search(r'"entity_id"\s*:\s*"(\d+)"', html_content) or re.search(r'[?&]id=(\d{8,})', source_url)
    if m_fbid:
        result['profile_id'] = m_fbid.group(1)

    # 2. Bóc tách Phần Giới thiệu (Bio, Phone, Email, Website, Địa chỉ)
    m_desc = re.search(r'property="og:description"\s+content="([^"]+)"', html_content)
    if m_desc:
        result['intro']['bio'] = html.unescape(m_desc.group(1).strip())

    # Email
    emails = EMAIL_REGEX.findall(html_content)
    valid_emails = [e for e in set(emails) if not any(x in e.lower() for x in ['fbcdn', 'facebook.com', '.png', '.jpg', '.webp'])]
    if valid_emails:
        result['intro']['email'] = valid_emails[0]
    elif result['intro']['bio']:
        bio_emails = EMAIL_REGEX.findall(result['intro']['bio'])
        if bio_emails:
            result['intro']['email'] = bio_emails[0]

    # Phone
    phones = PHONE_REGEX.findall(html_content)
    if phones:
        result['intro']['phone'] = f"+1 ({phones[0][0]}) {phones[0][1]}-{phones[0][2]}"

    # Website & Amazon channel
    result['has_amazon'] = False
    result['amazon_url'] = ''
    m_l_web = re.findall(r'l\.facebook\.com/l\.php\?u=([^&"\']+)', html_content)
    for raw_u in m_l_web:
        try:
            dec = urllib.parse.unquote(raw_u)
            if any(amz in dec.lower() for amz in ['amazon.com', 'amzn.to']):
                if not result.get('amazon_url'):
                    result['amazon_url'] = dec
                    result['has_amazon'] = True
            elif dec.startswith('http') and not any(d in dec.lower() for d in ['facebook.com', 'instagram.com', 'schema.org', 'bing.com', 'yahoo.com', 'gmail.com']):
                result['intro']['website'] = dec
                break
        except Exception:
            pass

    if not result['intro']['website'] and result['intro']['bio']:
        m_web_bio = re.search(r'(https?://[^\s,;)]+|www\.[^\s,;)]+)', result['intro']['bio'])
        if m_web_bio:
            w = m_web_bio.group(1)
            cand_w = w if w.startswith('http') else f"https://{w}"
            if any(amz in cand_w.lower() for amz in ['amazon.com', 'amzn.to']):
                if not result.get('amazon_url'):
                    result['amazon_url'] = cand_w
                    result['has_amazon'] = True
            elif not any(d in cand_w.lower() for d in ['facebook.com', 'instagram.com', 'schema.org', 'bing.com', 'yahoo.com', 'gmail.com']):
                result['intro']['website'] = cand_w

    # Address / City / State
    if not result['intro']['state']:
        m_st_body = re.search(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s+([A-Z]{2})\b', html_content)
        if m_st_body and m_st_body.group(2) in US_STATES:
            result['intro']['city'] = m_st_body.group(1)
            result['intro']['state'] = m_st_body.group(2)

    loc_parts = [result['intro']['city'], result['intro']['state'], result['intro']['country']]
    result['intro']['full_address'] = ", ".join([p for p in loc_parts if p])

    # 3. Bóc tách BÀI VIẾT GẦN NHẤT & PUBLISH TIME
    latest_timestamp = 0
    latest_post_text = ""
    latest_post_url = ""

    # Pattern A: Tìm timestamp từ các thuộc tính Relay / Comet JSON
    # e.g. "creation_time": 1729350000 hoặc "publish_time": 1729350000
    timestamps_found = []
    for m_ts in re.finditer(r'"(?:creation_time|publish_time|story_time)"\s*:\s*(\d{10})', html_content):
        val = int(m_ts.group(1))
        # Lọc timestamp hợp lý trong khoảng 2020 - 2027
        if 1577836800 <= val <= 1800000000:
            timestamps_found.append(val)

    # Pattern B: Tìm timestamp từ thẻ DOM data-utime="..."
    for m_utime in re.finditer(r'data-utime="(\d{10})"', html_content):
        val = int(m_utime.group(1))
        if 1577836800 <= val <= 1800000000:
            timestamps_found.append(val)

    if timestamps_found:
        # Bài đăng gần nhất là timestamp lớn nhất
        latest_timestamp = max(timestamps_found)

    # Pattern C: Tìm nội dung bài viết từ JSON message text hoặc comet_sections
    # "message":{"text":"..."}
    messages_found = []
    for m_msg in re.finditer(r'"message"\s*:\s*\{\s*"text"\s*:\s*"([^"]{15,1000})"', html_content):
        raw_msg = m_msg.group(1)
        # Unescape unicode
        try:
            clean_msg = raw_msg.encode().decode('unicode-escape')
        except Exception:
            clean_msg = raw_msg
        clean_msg = clean_msg.replace('\\n', ' ').strip()
        # Loại trừ message hệ thống của FB
        if not any(k in clean_msg.lower() for k in ['xem thêm', 'thay đổi ảnh đại diện', 'updated profile picture']):
            messages_found.append(clean_msg)

    if messages_found:
        latest_post_text = messages_found[0]

    # Pattern D: Tìm permalink bài viết /posts/ hoặc story_fbid=
    m_post_link = re.search(r'href="([^"]*(?:/posts/|permalink\.php\?story_fbid=)[^"]*)"', html_content)
    if m_post_link:
        raw_pl = m_post_link.group(1)
        if raw_pl.startswith('/'):
            latest_post_url = f"https://www.facebook.com{raw_pl}"
        else:
            latest_post_url = raw_pl

    # Nếu tìm được timestamp, phân tích thời gian
    if latest_timestamp > 0:
        time_info = parse_publish_time(latest_timestamp)
        result['latest_post']['publish_timestamp'] = time_info['timestamp']
        result['latest_post']['publish_time'] = time_info['iso']
        result['latest_post']['publish_human'] = time_info['human']
        result['latest_post']['relative_time'] = time_info['relative']
        result['latest_post']['days_ago'] = time_info['days_ago']
        result['latest_post']['activity_status'] = time_info['activity_status']
        result['latest_post']['activity_tier'] = time_info['activity_tier']

    result['latest_post']['post_text'] = latest_post_text
    result['latest_post']['post_url'] = latest_post_url

    # 4. Phân tích ý định kinh doanh cún cưng (Sales Intelligence & Product Matching)
    full_text_to_analyze = f"{result['name']} {result['intro']['bio']} {latest_post_text}".lower()

    has_puppy = any(kw in full_text_to_analyze for kw in PUPPY_INTENT_KEYWORDS)
    has_stud = any(kw in full_text_to_analyze for kw in STUD_BREEDING_KEYWORDS)
    has_potty = any(kw in full_text_to_analyze for kw in CARE_POTTY_KEYWORDS)
    has_toys = any(kw in full_text_to_analyze for kw in TOY_ENRICHMENT_KEYWORDS)

    result['sales_intelligence']['puppy_available'] = has_puppy
    result['sales_intelligence']['stud_service'] = has_stud

    # Xác định sản phẩm phù hợp & Kịch bản chào hàng (Sales Pitch)
    if has_puppy:
        result['sales_intelligence']['recommended_product'] = 'Gói Puppy Starter Kit V3 (Thảm Cỏ Cún Kháng Khuẩn + Khay Vệ Sinh Potty Tray Chống Tràn)'
        result['sales_intelligence']['sales_pitch'] = 'Trại đang có đàn cún con mới chào đời / chuẩn bị xuất chuồng. Chào gói Puppy Take-Home Pack làm quà tặng kèm khi khách đón cún về nhà mới giúp cún làm quen đi vệ sinh trên thảm cỏ ngay từ nhỏ.'
        result['sales_intelligence']['lead_score_boost'] = 25
    elif has_potty or has_stud:
        result['sales_intelligence']['recommended_product'] = 'Hệ thống Cỏ Nhân Tạo K9 Pet Grass Chuyên Dụng Ngoài Trời & Khay Potty Cỡ Đại'
        result['sales_intelligence']['sales_pitch'] = 'Trại chuyên nuôi và phối giống cún đàn lớn. Chào giải pháp thảm cỏ thoát nước nhanh, không đọng mùi amoniac nước tiểu cho khu chuồng chạy Kennel Run.'
        result['sales_intelligence']['lead_score_boost'] = 20
    elif has_toys:
        result['sales_intelligence']['recommended_product'] = 'Combo Đồ Chơi Gặm Huấn Luyện Cún Kháng Khuẩn (Durable Chew & Enrichment Toys)'
        result['sales_intelligence']['sales_pitch'] = 'Chủ trại chú trọng phát triển hành vi và năng động cho cún. Chào sỉ đồ chơi cún nhập khẩu an toàn không độc hại.'
        result['sales_intelligence']['lead_score_boost'] = 15
    else:
        result['sales_intelligence']['recommended_product'] = 'Puppy Starter Kit V2 (Standard Pet Grass + Training Pad)'
        result['sales_intelligence']['sales_pitch'] = 'Chăm sóc và tiếp cận khách hàng tiềm năng nuôi cún cảnh với giải pháp vệ sinh tiện lợi.'
        result['sales_intelligence']['lead_score_boost'] = 10

    return result


def analyze_file_or_url(input_path_or_url):
    """Hàm wrapper tiện lợi phân tích cả đường dẫn tệp HTML hoặc URL"""
    if os.path.exists(input_path_or_url):
        with open(input_path_or_url, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        return extract_post_and_intro_from_html(content, source_url=input_path_or_url)
    elif input_path_or_url.startswith('http'):
        import requests
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        resp = requests.get(input_path_or_url, headers=headers, timeout=12)
        return extract_post_and_intro_from_html(resp.text, source_url=input_path_or_url)
    else:
        # Giả định là chuỗi HTML truyền trực tiếp
        return extract_post_and_intro_from_html(input_path_or_url)


if __name__ == "__main__":
    # Test mẫu
    test_file = os.path.join(os.path.dirname(__file__), "..", "..", "scratch_user_pasted_profile.html")
    if os.path.exists(test_file):
        print(f"[*] Đang phân tích tệp mẫu: {test_file}")
        res = analyze_file_or_url(test_file)
        print(json.dumps(res, ensure_ascii=False, indent=2))
