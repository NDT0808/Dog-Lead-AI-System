#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script: website_deep_crawler.py
Module: Step 2 - Tầng 2: Quét sâu Đa trang con Website & Phân loại Kênh Amazon Thực tế
Chức năng:
1. Tiếp nhận website chính thức của trại cún/doanh nghiệp.
2. Quét trang chủ và tự động dò tìm đến 6-8 trang con tiềm năng:
   - /suggested-supplies, /supplies, /shop, /resources, /recommendations
   - /about, /about-us, /meet-the-breeder, /our-story, /meet-us, /contact
   - /puppies, /reserve-a-puppy, /puppy-application
3. Giải mã Cloudflare Email Protection (/cdn-cgi/l/email-protection#...).
4. Bóc tách Tên chủ trại qua Email Prefix + Contextual Regex + US Census Whitelist.
5. PHÂN LOẠI KÊNH AMAZON THỰC TẾ (TUYỆT ĐỐI KHÔNG CÀO BẰNG MẶC ĐỊNH TARGET):
   - Phân tích ngữ cảnh quanh link Amazon (amazon.com, amzn.to, a.co)
   - Nhóm 1: Thảm cỏ / Nhà vệ sinh (Grass / Potty / Pee Pad / Toilet)
   - Nhóm 2: Đồ chơi thú cưng (Toys / Chew / Kong / Teething / Snuggle Puppy)
   - Nhóm 3: Vật dụng khác (Crate, Shampoos, Food, Probiotic, Leash, Books)
   - Gán đúng 1 trong 5 nhãn chuẩn Meta RAG.
"""

import re
import html
import urllib.parse
import requests
from bs4 import BeautifulSoup

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

# Top US Census First Names for validation
US_CENSUS_FIRST_NAMES = {
    "Toni", "Tammie", "Sarah", "Javin", "Tanya", "Casey", "Amanda", "Lisa", "Jessica",
    "Denise", "David", "John", "Michael", "James", "Robert", "Jennifer", "Emily", "Ashley",
    "Brian", "Kayla", "Nicole", "Hannah", "Michelle", "Julian", "Sheryl", "Amy", "Margie",
    "Trevor", "Christy", "Elizabeth", "Wayne", "Erin", "Katherine", "Jodi", "Julia", "Paula",
    "Kelly", "Mandy", "Angela", "Peggy", "Patrick", "Kenan", "Pierre", "Jacqui", "Manny",
    "Tiffany", "Britanie", "Halle", "Rebecca", "Heather", "Autumn", "Dan", "Chelsea", "Darla",
    "Charles", "Linda", "Miranda", "Tabitha", "Cassandra", "Travis", "Andrew", "Shari", "Ryan",
    "Scott", "Joan", "Chase", "Darcy", "Rachael", "Karen", "Theresa", "Mary", "Shannon",
    "Daryl", "Helen", "Megan", "Stephanie", "Melissa", "Laura", "Barbara", "Donna", "Carol",
    "Ruth", "Sharon", "Deborah", "Cynthia", "Kathleen", "Shirley", "Brenda", "Pamela", "Emma",
    "Justin", "Brandon", "Tyler", "Austin", "Zachary", "Kyle", "Noah", "Ethan", "Jeremy"
}

STOPWORDS = {
    'good dog', 'facebook', 'instagram', 'united states', 'all rights', 'terms privacy',
    'learn more', 'contact us', 'about us', 'puppy application', 'puppies available',
    'home page', 'read more', 'click here', 'site map', 'puppy starter', 'golden retriever',
    'boykin spaniel', 'schnauzer', 'general information', 'available puppies', 'contact',
    'nutrition guidelines', 'our dogs', 'prices', 'reserve', 'guardian homes', 'pictures'
}

# Amazon Keywords Taxonomies
KW_GRASS_POTTY = [
    'grass', 'turf', 'lawn', 'patch', 'potty', 'pee pad', 'puppy pad', 'wee pad',
    'toilet', 'litter', 'indoor dog potty', 'fresh patch', 'doggie lawn', 'porch potty', 'pee mat'
]

KW_TOYS = [
    'chew toy', 'dog toy', 'puppy toy', 'plush toy', 'rope toy', 'squeaky toy',
    'interactive toy', 'teething', 'kong', 'nylabone', 'snuggle puppy', 'chew bone',
    'dental chew', 'flirt pole', 'puzzle toy'
]

PHONE_REGEX = re.compile(r'(?:\+?1[\s.\-]?)?(?:\(?([2-9]\d{2})\)?[\s.\-]?([2-9]\d{2})[\s.\-](\d{4}))')
EMAIL_REGEX = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b')
ZIP_REGEX = re.compile(r'\b(\d{5})(?:-\d{4})?\b')

def decode_cloudflare_email(cf_hex):
    """Giải mã Cloudflare Email Protection XOR hex"""
    if not cf_hex or len(cf_hex) < 4:
        return ""
    try:
        k = int(cf_hex[:2], 16)
        email_chars = [chr(int(cf_hex[i:i+2], 16) ^ k) for i in range(2, len(cf_hex), 2)]
        decoded = "".join(email_chars).strip()
        if '@' in decoded and '.' in decoded:
            return decoded
    except Exception:
        pass
    return ""

def extract_name_from_email_prefix(email_addr):
    """
    Trích xuất tên chủ trại từ tiền tố email cá nhân (vd: toniroy40@gmail.com -> Toni Roy)
    """
    if not email_addr or '@' not in email_addr:
        return ""
    prefix = email_addr.split('@')[0].lower()
    # Loại trừ role-based emails
    if any(prefix.startswith(x) for x in ['info', 'contact', 'sales', 'support', 'admin', 'office', 'puppy', 'puppies', 'breeder', 'team']):
        return ""

    # Loại bỏ số ở cuối (vd: toniroy40 -> toniroy, tammiemccutchen75 -> tammiemccutchen)
    clean_prefix = re.sub(r'\d+$', '', prefix).strip()
    if len(clean_prefix) < 4:
        return ""

    # Thử match First Name từ US Census
    for fn in US_CENSUS_FIRST_NAMES:
        fn_low = fn.lower()
        if clean_prefix.startswith(fn_low):
            last_part = clean_prefix[len(fn_low):].strip('_.-')
            if len(last_part) >= 2:
                # Capitalize
                return f"{fn} {last_part.capitalize()}"
            elif len(last_part) == 0:
                return fn
    return ""

def clean_extracted_name(cand):
    """Lọc bỏ tên giả lập và giao diện"""
    if not cand:
        return ""
    c = str(cand).strip()
    c = re.sub(r'^(?:and|or|the|our|with|by|at|hi|hello|meet)\s+', '', c, flags=re.IGNORECASE).strip()
    if any(st in c.lower() for st in STOPWORDS):
        return ""
    if len(c) < 3 or len(c) > 35:
        return ""
    words = c.split()
    if words and (words[0].capitalize() in US_CENSUS_FIRST_NAMES or len(words) >= 2):
        return c
    return ""

def extract_owner_from_text(text_content):
    """Bóc tách Tên chủ trại từ ngữ cảnh trang web (Meet the breeder, Owned by, Hi I'm...)"""
    if not text_content:
        return ""
    for pat in [
        r'(?:meet the breeder|about the breeder|our founder|meet)\s*[:\-–]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})',
        r'(?:hi[,\s]+(?:i am|i\'m|my name is)|hello[,\s]+(?:i am|i\'m))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})',
        r'(?:owned and operated by|founded by|breeder\s*[:\-–]|owner\s*[:\-–])\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})'
    ]:
        m_owner = re.search(pat, text_content, re.IGNORECASE)
        if m_owner:
            cand = clean_extracted_name(m_owner.group(1))
            if cand:
                return cand
    return ""

def crawl_website_details(website_url, timeout=8):
    """
    Quét sâu đa trang con của website chính thức để bóc tách:
    1. Tên chủ trại (Owner)
    2. SĐT, Email (bao gồm giải mã Cloudflare email)
    3. Phân loại kênh Amazon thực tế (Grass/Potty, Toys, Other, None)
    4. Trang bán cún và đơn đăng ký
    """
    result = {
        'website': website_url,
        'owner': '',
        'phone': '',
        'email': '',
        'address': '',
        'city': '',
        'state': '',
        'zip': '',
        'country': 'United States',
        'has_puppy_page': False,
        'has_application': False,
        'has_take_home_kit': False,
        'amz_link': '',
        'amz_cat': 'Amazon link not found',
        'crawled_pages': [],
        'amz_has_grass_potty': False,
        'amz_has_toys': False,
        'amz_has_other': False
    }

    if not website_url or not str(website_url).startswith('http'):
        return result

    session = requests.Session()
    session.headers.update(HEADERS)

    parsed_base = urllib.parse.urlparse(website_url)
    base_domain = parsed_base.netloc.lower().replace('www.', '')

    subpages_queue = [website_url]
    visited = set()

    try:
        # 1. Tải trang chủ để phát hiện link trang con
        resp = session.get(website_url, timeout=timeout, allow_redirects=True)
        if resp.status_code != 200 or not resp.text:
            return result

        result['crawled_pages'].append(website_url)
        visited.add(website_url)
        home_soup = BeautifulSoup(resp.text, 'html.parser')

        # Dò tìm các link nội bộ phù hợp
        priority_keywords = [
            'supplies', 'recommend', 'shop', 'resource', 'kit',
            'about', 'meet', 'story', 'breeder', 'contact',
            'puppy', 'puppies', 'application', 'reserve', 'price'
        ]

        found_subpages = []
        for a in home_soup.find_all('a', href=True):
            href = a['href']
            # Kiểm tra Cloudflare email protection ngay trên trang chủ
            if 'email-protection#' in href:
                cf_hex = href.split('email-protection#')[-1]
                dec_email = decode_cloudflare_email(cf_hex)
                if dec_email and not result['email']:
                    result['email'] = dec_email
                    cand_owner = extract_name_from_email_prefix(dec_email)
                    if cand_owner and not result['owner']:
                        result['owner'] = cand_owner

            full_link = urllib.parse.urljoin(website_url, href)
            sub_parsed = urllib.parse.urlparse(full_link)
            sub_domain = sub_parsed.netloc.lower().replace('www.', '')

            if sub_domain == base_domain and full_link not in visited:
                path = sub_parsed.path.lower()
                if any(pk in path for pk in priority_keywords):
                    if full_link not in found_subpages:
                        found_subpages.append(full_link)

        # Lấy tối đa 7 trang con tiềm năng nhất
        subpages_queue.extend(found_subpages[:7])

        # 2. Quét tuần tự từng trang con trong Queue
        amazon_links_found = []
        
        for page_url in subpages_queue:
            if page_url in visited and page_url != website_url:
                continue
            visited.add(page_url)

            try:
                if page_url == website_url:
                    page_html = resp.text
                    page_soup = home_soup
                else:
                    sub_resp = session.get(page_url, timeout=timeout, allow_redirects=True)
                    if sub_resp.status_code != 200 or not sub_resp.text:
                        continue
                    page_html = sub_resp.text
                    page_soup = BeautifulSoup(page_html, 'html.parser')
                    result['crawled_pages'].append(page_url)

                page_lower = page_html.lower()

                # A. Check Cloudflare email
                if 'email-protection#' in page_html and not result['email']:
                    for a in page_soup.find_all('a', href=True):
                        if 'email-protection#' in a['href']:
                            cf_hex = a['href'].split('email-protection#')[-1]
                            dec = decode_cloudflare_email(cf_hex)
                            if dec:
                                result['email'] = dec
                                cand_owner = extract_name_from_email_prefix(dec)
                                if cand_owner and not result['owner']:
                                    result['owner'] = cand_owner
                                break

                # B. Normal Email
                if not result['email']:
                    emails = EMAIL_REGEX.findall(page_html)
                    valid_e = [e for e in set(emails) if not any(x in e.lower() for x in ['.png', '.jpg', '.webp', 'wixpress', 'sentry', 'domain'])]
                    if valid_e:
                        result['email'] = valid_e[0]
                        cand_owner = extract_name_from_email_prefix(valid_e[0])
                        if cand_owner and not result['owner']:
                            result['owner'] = cand_owner

                # C. Phone
                if not result['phone']:
                    phones = PHONE_REGEX.findall(page_html)
                    if phones:
                        result['phone'] = f"1{phones[0][0]}{phones[0][1]}{phones[0][2]}"

                # D. Puppy Page & Application
                if any(k in page_lower for k in ['available puppies', 'puppies for sale', 'reserve a puppy', 'current litters']):
                    result['has_puppy_page'] = True
                if any(k in page_lower for k in ['application', 'apply online', 'puppy application form', 'reserve form']):
                    result['has_application'] = True
                if any(k in page_lower for k in ['take-home kit', 'puppy starter kit', 'take home gift']):
                    result['has_take_home_kit'] = True

                # E. Zip code
                if not result['zip']:
                    zips = ZIP_REGEX.findall(page_html)
                    if zips:
                        result['zip'] = zips[0]

                # F. Owner regex patterns
                if not result['owner']:
                    text_content = page_soup.get_text(separator=' ')
                    for pat in [
                        r'(?:meet the breeder|about the breeder|our founder)\s*[:\-–]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})',
                        r'(?:hi[,\s]+(?:i am|i\'m|my name is)|hello[,\s]+(?:i am|i\'m))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})',
                        r'(?:owned and operated by|founded by|breeder\s*[:\-–]|owner\s*[:\-–])\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})'
                    ]:
                        m_owner = re.search(pat, text_content, re.IGNORECASE)
                        if m_owner:
                            cand = clean_extracted_name(m_owner.group(1))
                            if cand:
                                result['owner'] = cand
                                break

                # G. Amazon Links & Keyword Classification
                for a in page_soup.find_all('a', href=True):
                    href = a['href']
                    if any(x in href.lower() for x in ['amazon.com', 'amzn.to', 'a.co']):
                        if href not in amazon_links_found:
                            amazon_links_found.append(href)

                        if not result['amz_link']:
                            result['amz_link'] = href

                        # Lấy ngữ cảnh văn bản xung quanh thẻ a
                        parent = a.find_parent(['li', 'p', 'tr', 'td', 'div'])
                        context_text = (parent.get_text(separator=' ', strip=True) if parent else a.get_text(strip=True)).lower()

                        # Kiểm tra từ khóa Cỏ & Khay Vệ Sinh
                        if any(k in context_text for k in KW_GRASS_POTTY):
                            result['amz_has_grass_potty'] = True

                        # Kiểm tra từ khóa Đồ Chơi
                        if any(k in context_text for k in KW_TOYS):
                            result['amz_has_toys'] = True

                        # Kiểm tra vật dụng khác
                        if any(k in context_text for k in ['crate', 'carrier', 'shampoo', 'brush', 'probiotic', 'vitamin', 'food', 'collar', 'leash', 'book', 'clipper']):
                            result['amz_has_other'] = True

            except Exception:
                continue

        # 3. Tổng hợp phân loại Kênh Amazon cuối cùng theo taxonomy chuẩn
        if amazon_links_found:
            if result['amz_has_grass_potty'] and result['amz_has_toys']:
                result['amz_cat'] = "Selling pet toys + Artificial grass/Pet toilets (TARGET)"
            elif result['amz_has_grass_potty']:
                result['amz_cat'] = "Selling artificial grass/pet toilets (TARGET)"
            elif result['amz_has_toys']:
                result['amz_cat'] = "Selling pet toys"
            else:
                result['amz_cat'] = "There's an Amazon link, but no target sales."
        else:
            result['amz_cat'] = "Amazon link not found"

    except Exception:
        pass

    return result

if __name__ == "__main__":
    test_sites = [
        "https://www.familyLovedGoldenRetrievers.com",
        "https://www.knockandbark.com"
    ]
    for site in test_sites:
        print("=" * 60)
        print(f"Crawling website: {site}")
        res = crawl_website_details(site)
        print(f"  Owner: {res['owner']}")
        print(f"  Phone: {res['phone']}")
        print(f"  Email: {res['email']}")
        print(f"  Amazon Category: {res['amz_cat']}")
        print(f"  Amazon Link: {res['amz_link']}")
        print(f"  Has Puppy Page: {res['has_puppy_page']}, Has Application: {res['has_application']}")
        print(f"  Crawled {len(res['crawled_pages'])} pages: {res['crawled_pages']}")
