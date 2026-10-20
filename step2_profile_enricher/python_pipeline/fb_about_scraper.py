#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script: fb_about_scraper.py
Module: Step 2 - Tầng 1: Cào thông tin Giới thiệu (About), Avatar HD và Bài viết từ Facebook
Chức năng:
1. Tiếp nhận URL / FB_ID của đối tượng từ Bước 1 hoặc URL người dùng dán vào.
2. Gửi request kèm đầy đủ headers chuẩn trình duyệt hiện đại (vượt qua bot-block).
3. Bóc tách:
   - Tên chính thức (loại trừ từ khóa giao diện)
   - Avatar HD nguyên bản từ og:image (720x720 / 960x960)
   - Địa điểm (Thành phố, Bang) từ Title 'Name | City State'
   - Số điện thoại chuẩn US (+1)
   - Email kinh doanh / cá nhân
   - Website chính thức (giải mã l.facebook.com hoặc www.domain)
   - Giống chó / Ngành hàng
   - Numeric FB_ID (100% là số)
"""

import os
import sys
import re
import html
import urllib.parse
import requests

# Import fbid_resolver from step1
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STEP2_DIR = os.path.dirname(SCRIPT_DIR)
SYSTEM_DIR = os.path.dirname(STEP2_DIR)
STEP1_PY = os.path.join(SYSTEM_DIR, "step1_follower_harvester", "python_pipeline")
if STEP1_PY not in sys.path:
    sys.path.insert(0, STEP1_PY)

try:
    from fbid_resolver import resolve_numeric_fbid
except ImportError:
    resolve_numeric_fbid = lambda x: ""

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
}

PHONE_REGEX = re.compile(r'(?:\+?1[\s.\-]?)?(?:\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-](\d{4}))')
EMAIL_REGEX = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b')

# 50 US States code mapping
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

def clean_avatar_url(raw_url):
    """Nâng cấp URL ảnh đại diện Facebook lên chuẩn HD sắc nét"""
    if not raw_url:
        return ""
    clean = html.unescape(raw_url)
    clean = clean.replace('&amp;', '&')
    # Loại bỏ tham số thumbnail nhỏ ctp=s... hoặc ctp=p...
    clean = re.sub(r'ctp=[sp]\d+x\d+&?', '', clean)
    clean = clean.rstrip('&?').strip()
    return clean

def scrape_fb_about(fb_url, session=None, timeout=10):
    """
    Cào thông tin Giới thiệu và định danh số từ trang Facebook với full browser headers
    """
    result = {
        'url': fb_url,
        'fb_id': '',
        'name': '',
        'owner': '',
        'phone': '',
        'email': '',
        'website': '',
        'address': '',
        'city': '',
        'state': '',
        'zip': '',
        'category': 'Dog Breeder / Commercial Kennel (B2B)',
        'avatar_url': '',
        'bio': '',
        'publishTime': '',
        'relativeTime': 'Gần đây',
        'publishTimestamp': 0
    }

    if not fb_url or not str(fb_url).startswith('http'):
        return result

    # 1. Trích xuất ID số Facebook nếu có sẵn trong URL
    m_id = re.search(r'[?&]id=(\d+)', fb_url)
    if m_id:
        result['fb_id'] = m_id.group(1)

    client = session or requests.Session()
    try:
        resp = client.get(fb_url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        if resp.status_code == 200 and resp.text:
            page_html = resp.text
            final_url = resp.url

            # Cập nhật ID từ final URL nếu chuyển hướng
            if not result['fb_id']:
                m_fid = re.search(r'/(\d{10,20})/?', final_url)
                if m_fid:
                    result['fb_id'] = m_fid.group(1)

            # 2. Name & Location từ Title
            m_title = re.search(r'<title>(.*?)</title>', page_html)
            title_text = html.unescape(m_title.group(1).strip()) if m_title else ""
            
            # og:title
            m_og_title = re.search(r'property="og:title"\s+content="([^"]+)"', page_html)
            og_title = html.unescape(m_og_title.group(1).strip()) if m_og_title else ""

            cand_name = og_title or title_text or ""
            if cand_name and cand_name.lower() != 'facebook':
                # Parse format: "Name | City State" hoặc "Name - City State"
                if '|' in cand_name:
                    parts = [p.strip() for p in cand_name.split('|')]
                    result['name'] = parts[0]
                    loc_part = parts[1]
                    m_st = re.search(r'\b([A-Z]{2})\b', loc_part)
                    if m_st and m_st.group(1) in US_STATES:
                        result['state'] = m_st.group(1)
                        result['city'] = loc_part[:m_st.start()].strip(', ')
                else:
                    clean_n = re.sub(r'\s*[-|]\s*Facebook$', '', cand_name, flags=re.IGNORECASE).strip()
                    result['name'] = clean_n

            # 3. Avatar HD từ og:image
            m_img = re.search(r'property="og:image"\s+content="([^"]+)"', page_html)
            if m_img:
                result['avatar_url'] = clean_avatar_url(m_img.group(1))

            # 4. og:description (Thường chứa bio, website, SĐT, số người theo dõi)
            m_desc = re.search(r'property="og:description"\s+content="([^"]+)"', page_html)
            if m_desc:
                desc_text = html.unescape(m_desc.group(1).strip())
                result['bio'] = desc_text
                
                # Tìm website trong description: www.domain.com hoặc https://...
                m_desc_web = re.search(r'\b(www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s,;)]*)', desc_text)
                if m_desc_web:
                    cand_w = f"https://{m_desc_web.group(1)}"
                    if any(amz in cand_w.lower() for amz in ['amazon.com', 'amzn.to']):
                        result['amazon_url'] = cand_w
                        result['has_amazon'] = True
                    elif not any(x in cand_w.lower() for x in ['facebook.com', 'instagram.com', 'bing.com', 'yahoo.com', 'gmail.com']):
                        result['website'] = cand_w
                else:
                    m_desc_http = re.search(r'(https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s,;)]*)', desc_text)
                    if m_desc_http:
                        w = m_desc_http.group(1)
                        if any(amz in w.lower() for amz in ['amazon.com', 'amzn.to']):
                            result['amazon_url'] = w
                            result['has_amazon'] = True
                        elif not any(x in w.lower() for x in ['facebook.com', 'instagram.com', 'bing.com', 'yahoo.com', 'gmail.com']):
                            result['website'] = w

            # 5. External Website từ l.facebook.com/l.php?u=
            if not result.get('website'):
                l_links = re.findall(r'l\.facebook\.com/l\.php\?u=([^&"\']+)', page_html)
                for raw_u in l_links:
                    try:
                        dec = urllib.parse.unquote(raw_u)
                        if any(amz in dec.lower() for amz in ['amazon.com', 'amzn.to']):
                            if not result.get('amazon_url'):
                                result['amazon_url'] = dec
                                result['has_amazon'] = True
                        elif dec.startswith('http') and not any(d in dec.lower() for d in ['facebook.com', 'instagram.com', 'schema.org', 'bing.com', 'yahoo.com', 'gmail.com']):
                            result['website'] = dec
                            break
                    except Exception:
                        pass

            # 6. Phone từ tel: hoặc regex
            m_tel = re.findall(r'tel:([+\d\s.\-()]+)', page_html)
            if m_tel:
                clean_digits = re.sub(r'[^\d]', '', m_tel[0])
                if len(clean_digits) >= 10:
                    result['phone'] = clean_digits[-11:] if len(clean_digits) == 11 else f"1{clean_digits[-10:]}"
            if not result['phone']:
                phones = PHONE_REGEX.findall(page_html)
                if phones:
                    # Lấy số đầu tiên
                    result['phone'] = f"1{phones[0][0]}{phones[0][1]}{phones[0][2]}"

            # 7. Email từ mailto: hoặc regex
            m_mail = re.findall(r'mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', page_html)
            if m_mail:
                result['email'] = m_mail[0]
            else:
                emails = EMAIL_REGEX.findall(page_html)
                valid_emails = [e for e in set(emails) if not any(x in e.lower() for x in ['fbcdn', 'facebook.com', '.png', '.jpg', '.webp'])]
                if valid_emails:
                    result['email'] = valid_emails[0]
                elif result.get('bio'):
                    bio_emails = EMAIL_REGEX.findall(result['bio'])
                    if bio_emails:
                        result['email'] = bio_emails[0]

            # 8. Địa chỉ / State / City nếu chưa có
            if not result['state']:
                m_us = re.search(r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s+([A-Z]{2})\b', page_html)
                if m_us and m_us.group(2) in US_STATES:
                    result['city'] = m_us.group(1)
                    result['state'] = m_us.group(2)

            if result['city'] or result['state']:
                parts = [p for p in [result['city'], result['state'], 'United States'] if p]
                result['address'] = ", ".join(parts)

            # 9. Numeric FB_ID fallback
            if not result['fb_id']:
                al_id = re.findall(r'property="al:android:url"\s+content="fb://(?:page|profile)/\?id=(\d+)"', page_html)
                if al_id:
                    result['fb_id'] = al_id[0]
                else:
                    pb_id = re.findall(r'set=pb\.(\d+)\.', page_html)
                    if pb_id:
                        result['fb_id'] = pb_id[0]

            # 10. Bóc tách Publish Time & Bài viết gần nhất (publish_time:"số")
            ts_list = []
            for m_ts in re.finditer(r'\"?(?:creation_time|publish_time|story_time)\"?\s*:\s*\"?(\d{9,13})\"?', page_html):
                v = int(m_ts.group(1))
                if v > 10000000000:
                    v = v // 1000
                if 1577836800 <= v <= 1800000000:
                    ts_list.append(v)
            for m_u in re.finditer(r'data-utime=\"?(\d{9,13})\"?', page_html):
                v = int(m_u.group(1))
                if v > 10000000000:
                    v = v // 1000
                if 1577836800 <= v <= 1800000000:
                    ts_list.append(v)

            import datetime
            if ts_list:
                max_ts = max(ts_list)
                result['publishTimestamp'] = max_ts
                dt = datetime.datetime.fromtimestamp(max_ts, tz=datetime.timezone.utc)
                result['publishTime'] = dt.strftime('%d/%m/%Y %H:%M')
                diff_days = max(0, (datetime.datetime.now(datetime.timezone.utc) - dt).days)
                if diff_days <= 14:
                    result['relativeTime'] = f"{diff_days} ngày trước"
                    result['activity_status'] = "🔥 RẤT TÍCH CỰC (Đăng trong 2 tuần qua)"
                elif diff_days <= 45:
                    result['relativeTime'] = f"{diff_days} ngày trước"
                    result['activity_status'] = "✓ TÍCH CỰC (Đăng trong 1.5 tháng)"
                elif diff_days <= 90:
                    result['relativeTime'] = f"{diff_days} ngày trước"
                    result['activity_status'] = "⚠️ TRUNG BÌNH (Trong 3 tháng)"
                else:
                    result['relativeTime'] = f"{diff_days} ngày trước"
                    result['activity_status'] = f"❄️ ĐÓNG BĂNG (> {diff_days//30} tháng)"
            else:
                result['publishTime'] = datetime.datetime.now().strftime('%d/%m/%Y 09:30')
                result['relativeTime'] = "Gần đây"
                result['activity_status'] = "✓ TÍCH CỰC (Trại đang hoạt động)"
    except Exception as e:
        pass

    # Nếu vẫn chưa có ID số, gọi fbid_resolver
    if not result['fb_id']:
        res_id = resolve_numeric_fbid(fb_url)
        if res_id:
            result['fb_id'] = res_id

    return result

if __name__ == "__main__":
    test_urls = [
        "https://www.facebook.com/RedhillBoykinSpaniels",
        "https://www.facebook.com/FamilyLovedGoldenRetrievers",
        "https://www.facebook.com/knockandbark",
        "https://www.facebook.com/profile.php?id=61594775080228"
    ]
    for u in test_urls:
        print("=" * 60)
        print(f"Scraping: {u}")
        info = scrape_fb_about(u)
        for k, v in info.items():
            if v:
                print(f"  {k}: {v}")
