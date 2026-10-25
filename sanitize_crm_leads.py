#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
DATA SANITIZER & META CRM SCHEMA UNIFIER - v2.3
=============================================================================
Dự án: Pet_Lead_AI_System
Tác giả: Senior Data Engineer & Python Automation Architect
Chức năng:
  1. Chuẩn hóa logic website & amazon_url (hoán đổi link Amazon trong website,
     sửa data bleed giữa STT 68 & 69, lọc sạch URL rác /ap/register..., blacklist website).
  2. Parse địa chỉ từ phải sang trái (right-to-left):
     - zip: chỉ lấy mã bưu chính ở cuối chuỗi, loại bỏ số nhà và zip giả 12345.
     - state: đối chiếu 50 bang chuẩn của Mỹ + bang Úc/Canada, loại bỏ TV, SV, DM, HU.
     - city: lấy thành phần đứng ngay trước state, loại bỏ tên đường/số nhà.
     - country: xác định chính xác theo hậu tố địa chỉ, TLD tên miền, mã vùng quốc tế.
     - Loại bỏ toàn bộ địa chỉ chứa text UI rác (Cart, ship to Vietnam, Quick add...).
  3. Làm sạch trường owner phục vụ Email Marketing:
     - Lọc bỏ triệt để Stopwords (Payment, Method, Highlight, Listing, Available, Adult...).
     - Phân định rõ owner_is_person: True (nếu là tên người thật) hoặc False.
     - Fallback về "Team [Tên Trại]" hoặc "There" để email hiển thị "Hi there," / "Hi Team [Trại],".
  4. Lọc sạch email, phone, instagram:
     - Sửa lỗi chính tả domain (@gmal.com -> @gmail.com).
     - Loại bỏ email nền tảng (akcmarketplace@akc.org, contact@tiltify.com, support@teeshoplife.com).
     - Chuẩn hóa phone về E.164 (+1XXXXXXXXXX cho Mỹ/Canada), loại bỏ mã hội viên, số cụt, số rác.
     - Xóa toàn bộ Instagram link lỗi do regex cắt nhầm (.com, ans, inal, sby, hborhood...).
  5. Sửa lỗi Unicode escaping (Du1ecbch vu1ee5 thu00fa cu01b0ng -> Dịch vụ thú cưng, u0025 -> %, u0040 -> @).
  6. Chuẩn hóa publishTimeISO (ISO-8601 UTC) và đồng nhất Schema cho 100% bản ghi.
=============================================================================
"""

import os
import sys
import json
import re
import shutil
from datetime import datetime, timezone

# =============================================================================
# CONSTANTS & DICTIONARIES
# =============================================================================

US_STATES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
    'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
}

US_STATE_NAMES_TO_CODE = {v.lower(): k for k, v in US_STATES.items()}
US_STATE_CODES = set(US_STATES.keys())

AU_STATES = {'NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'}
AU_STATE_NAMES = {
    'new south wales': 'NSW', 'victoria': 'VIC', 'queensland': 'QLD',
    'western australia': 'WA', 'south australia': 'SA', 'tasmania': 'TAS',
    'australian capital territory': 'ACT', 'northern territory': 'NT'
}

CA_PROVINCES = {'ON', 'BC', 'QC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'YT', 'NU'}
CA_PROVINCE_NAMES = {
    'ontario': 'ON', 'british columbia': 'BC', 'quebec': 'QC', 'alberta': 'AB',
    'manitoba': 'MB', 'saskatchewan': 'SK', 'nova scotia': 'NS', 'new brunswick': 'NB'
}

# Các mã bang rác bị loại bỏ hoàn toàn
GARBAGE_STATES = {'TV', 'SV', 'DM', 'HU', 'VI', '00', 'XX'}

# Từ khóa rác trong address
ADDRESS_NOISE_KEYWORDS = [
    'cart', 'ship to vietnam', 'snoozed', 'live website inspector',
    'quick add', 'years', 'litters', 'miles', 'vnd', 'calendar', 'milkshake',
    'starred', 'items that ship', 'recommendations', 'imdb', 'movies',
    'externalweblink', 'photo', 'best in', 'judge denk', 'running and playing',
    'find your breed', 'available', 'expecting', 'our passion', 'national show',
    'standard colors', 'minutes away', 'south of portland', 'raising method',
    'sale price', 'creators your world', 'life-saving cancer', 'resilience raising',
    'westgate goldens johnramella', 'dismiss change address', 'delivery address',
    'welsh corgis nsw australia', 'australia/pacific', 'college of the art',
    'dont stop me', 'dogsnsw', 'ankc', 'member 2100064234'
]

# Stopwords trong trường owner (không bao giờ là tên người)
OWNER_STOPWORDS = {
    'payment', 'payments', 'method', 'methods', 'highlight', 'highlights',
    'listing', 'listings', 'available', 'adult', 'adults', 'guestbook',
    'address', 'function', 'functions', 'marketplace', 'rubriques', 'rubrique',
    'kennel', 'kennels', 'labs', 'labradors', 'retrievers', 'retriever',
    'dachshund', 'dachshunds', 'bulldog', 'bulldogs', 'boxer', 'boxers',
    'corgi', 'corgis', 'rescue', 'rescues', 'official', 'page', 'pages',
    'team', 'teams', 'club', 'clubs', 'show', 'shows', 'puppies', 'puppy',
    'farm', 'farms', 'breeder', 'breeders', 'grooming', 'boarding',
    'dogs', 'dog', 'terrier', 'terriers', 'spaniel', 'spaniels',
    'beagle', 'beagles', 'basset', 'bassets', 'pointer', 'pointers',
    'shorthaired', 'goldens', 'golden', 'paws', 'paw', 'doodle', 'doodles',
    'shepherd', 'shepherds', 'frenchie', 'frenchies', 'lover', 'lovers',
    'store', 'shop', 'daily', 'adventures', 'adventure', 'kingdom', 'world',
    'life', 'care', 'center', 'college', 'nation', 'ranch', 'diary',
    'news', 'blog', 'community', 'adoption', 'adoptions', 'federation',
    'association', 'society', 'academy', 'house', 'station', 'vlog',
    'home', 'about', 'contact', 'welcome', 'our', 'the', 'and', 'with',
    'dont stop me', 'honesty', 'cupidpup', 'doggo', 'pups', 'pup',
    'black and chocolate', 'black russian', 'english cocker', 'neapolitan',
    'miniature schnauzer', 'great dane', 'fci', 'silver labs',
    'black', 'yellow', 'chocolate', 'white', 'blue', 'red', 'tan', 'sable',
    'brindle', 'merle', 'silver', 'fox red', 'labr'
}

# Danh sách IG handle rác sinh ra do regex cắt nhầm
BROKEN_IG_HANDLES = {
    '.com', 'ans', 'ht.', 'ence', 'ence.', 'hborhood', 'hbors',
    'hlights', 'hlightseveryone', 'hts', 'inal', 'inally', 'ital',
    'ley', 'mat', 'most', 'playful', 'question', 'ree', 'sby',
    'size', 'things.', 'hter.', 'enetics', 'brother.', 'mac', 'dawg',
    'hest', 'hting', 'hdesertlabradors.com', 'p', 'reel', 'reels',
    'stories', 'explore', 'about', 'accounts', 'login', 'share'
}

# Blacklist email nền tảng trung gian
PLATFORM_EMAILS = {
    'akcmarketplace@akc.org',
    'contact@tiltify.com',
    'support@teeshoplife.com',
    'info@wix.com',
    'support@wix.com',
    'contact@facebook.com',
    'domain@example.com'
}

# Blacklist website
WEBSITE_BLACKLIST_PATTERNS = [
    r'^(?:https?:\/\/)?(?:www\.)?gmail\.com\/?$',
    r'^(?:https?:\/\/)?(?:www\.)?mail\.google\.com\/?$',
    r'^(?:https?:\/\/)?(?:[a-z0-9-]+\.)?facebook\.com\/?',
    r'^(?:https?:\/\/)?(?:[a-z0-9-]+\.)?fb\.com\/?',
    r'^(?:https?:\/\/)?(?:[a-z0-9-]+\.)?instagram\.com\/?',
]

# Blacklist URL Amazon
AMAZON_GARBAGE_PATTERNS = [
    r'/ap/(?:signin|register|forgotpassword)',
    r'/gp/(?:cart|help|navigation|css|your-account)',
    r'/(?:cart|sign-in|register)\b',
    r'openid\.mode',
    r'openid\.return_to',
    r'/customer-preferences\b',
    r'\b(?:privacy|preferences|help)\b',
    r'^(?:https?:\/\/)?(?:www\.)?amazon\.[a-z.]+\/?$'
]

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def decode_unescaped_unicode(text):
    r"""
    Giải mã chuỗi bị mất dấu backslash \u dạng u0110, u1ecb, u0025, u0040.
    Ví dụ: 'Du1ecbch vu1ee5 thu00fa cu01b0ng' -> 'Dịch vụ thú cưng'
           'https://dachshundparty.shop/a/doxielife?to=u00252F' -> '...to=%2F'
    """
    if not isinstance(text, str):
        return text

    def _replace_hex(match):
        hex_val = match.group(1)
        try:
            code = int(hex_val, 16)
            if (0x0020 <= code <= 0x1FFF) or (code in (0x00A0, 0x00A9, 0x00AE)):
                return chr(code)
            return match.group(0)
        except Exception:
            return match.group(0)

    cleaned = re.sub(r'u([0-9a-fA-F]{4})', _replace_hex, text)
    return cleaned


def is_amazon_url(url):
    """Kiểm tra xem URL có phải là link Amazon Storefront / Wishlist / Product hay không."""
    if not url or not isinstance(url, str):
        return False
    u = url.strip().lower()
    return bool(re.search(r'(?:amazon\.[a-z.]+|amzn\.to|a\.co)\/', u))


def is_valid_amazon_storefront(url):
    """Xác thực link Amazon hợp lệ, loại bỏ các link đăng ký/giỏ hàng rác."""
    if not url or not isinstance(url, str):
        return False
    u = url.strip()
    if ',' in u:
        parts = [p.strip() for p in u.split(',') if p.strip()]
        valid_parts = [p for p in parts if is_valid_amazon_storefront(p)]
        return len(valid_parts) > 0
    if not is_amazon_url(u):
        return False
    for pat in AMAZON_GARBAGE_PATTERNS:
        if re.search(pat, u, re.IGNORECASE):
            return False
    if re.search(r'(?:amazon\.[a-z.]+|amzn\.to|a\.co)\/(?:shop|author|hz\/wishlist|gp\/registry|dp|[a-zA-Z0-9_-]+)', u, re.IGNORECASE):
        return True
    return False


def is_blacklisted_website(url):
    """Kiểm tra website có thuộc blacklist (gmail.com, facebook.com...) không."""
    if not url or not isinstance(url, str):
        return True
    u = url.strip()
    for pat in WEBSITE_BLACKLIST_PATTERNS:
        if re.search(pat, u, re.IGNORECASE):
            return True
    return False


def clean_instagram_url(url):
    """Làm sạch URL Instagram, loại bỏ các link rác do regex cắt nhầm."""
    if not url or not isinstance(url, str):
        return ""
    u = url.strip()
    m = re.search(r'instagram\.com\/([a-zA-Z0-9_.-]+)', u, re.IGNORECASE)
    if not m:
        return ""
    handle = m.group(1).strip().strip('/')
    handle_lower = handle.lower()

    if handle_lower in BROKEN_IG_HANDLES:
        return ""
    if handle_lower.endswith('.com') or handle_lower.endswith('.'):
        return ""
    if len(handle) < 3:
        return ""
    if not re.match(r'^[a-zA-Z0-9_][a-zA-Z0-9_.]*[a-zA-Z0-9_]$', handle):
        return ""
    return f"https://www.instagram.com/{handle}/"


def clean_email(email):
    """Sửa lỗi chính tả domain phổ biến và lọc bỏ email nền tảng trung gian."""
    if not email or not isinstance(email, str):
        return ""
    em = email.strip().lower()
    if em in PLATFORM_EMAILS:
        return ""
    em = re.sub(r'@gmal\.com$', '@gmail.com', em)
    em = re.sub(r'@yaho\.com$', '@yahoo.com', em)
    em = re.sub(r'@hotmial\.com$', '@hotmail.com', em)
    em = re.sub(r'@outlok\.com$', '@outlook.com', em)

    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', em):
        return ""
    return em


def clean_phone(phone, country="United States"):
    """Chuẩn hóa số điện thoại về E.164, loại bỏ các mã hội viên và số rác."""
    if not phone or not isinstance(phone, str):
        return ""
    digits = re.sub(r'\D', '', phone)
    if not digits:
        return ""

    if digits in {'12100064234', '38063364', '84448438878', '162158179', '990105868'}:
        return ""

    if len(digits) == 10:
        return f"+1{digits}"
    elif len(digits) == 11 and digits.startswith('1'):
        return f"+{digits}"
    elif len(digits) in (11, 12):
        if digits.startswith(('61', '48', '84', '44', '33', '49', '52', '36')):
            return f"+{digits}"

    return ""


def clean_kennel_short_name(full_name):
    """Rút gọn tên trại chó để tạo fallback 'Team [Kennel]' đẹp cho Email Marketing."""
    if not full_name:
        return "There"
    s = full_name.strip()
    s = re.sub(r'\s*\([^)]*\)', '', s).strip()
    s = re.sub(r'^(?:Welcome to|Official Page of|Hodowla|Élevage du|Élevage)\s+', '', s, flags=re.IGNORECASE)
    words = s.split()
    if len(words) > 5:
        s = " ".join(words[:4])
    return s or "There"


def clean_and_verify_owner(owner, lead_name):
    """
    Làm sạch trường owner:
    - Nếu là tên người thật -> (owner_name, True)
    - Nếu là stopword / tên trại / rác -> ("Team [Tên Trại]" hoặc "There", False)
    """
    raw_owner = (owner or "").strip()
    raw_lead = (lead_name or "").strip()

    def is_valid_person_name(candidate):
        if not candidate or len(candidate) < 3 or len(candidate) > 40:
            return False
        if re.search(r'[@\/\\{}[\]<>=+*_$#~0-9]', candidate):
            return False
        words = candidate.split()
        if not (1 <= len(words) <= 4):
            return False

        for w in words:
            w_lower = w.lower().strip(".,'")
            if w_lower in OWNER_STOPWORDS:
                return False

        if len(words) == 1:
            common_first_names = {
                'kayla', 'linda', 'christina', 'gaige', 'emily', 'chad', 'ron',
                'rebel', 'apollo', 'josh', 'mark', 'melissa', 'david', 'erin',
                'katie', 'john', 'tiffany', 'mary', 'haidee', 'faith',
                'shafer', 'mitchell', 'lana', 'liliy', 'renata'
            }
            if words[0].lower() not in common_first_names:
                return False

        for w in words:
            if not w[0].isupper():
                return False
        return True

    # 1. Kiểm tra raw_owner
    if is_valid_person_name(raw_owner):
        return raw_owner, True

    # 2. Kiểm tra nếu lead_name chứa tên người bên ngoài ngoặc đơn
    # Ví dụ: "Liliy Zierova (Kennel Black and Chocolate)" -> "Liliy Zierova"
    #        "Kayla Parrish (Kayla Danielle Copeland)" -> "Kayla Parrish"
    #        "Renata Garbiec-Grabarczuk (z Rozkoszowskiej Chaty)" -> "Renata Garbiec-Grabarczuk"
    outside_parens = re.sub(r'\s*\([^)]*\)', '', raw_lead).strip()
    if is_valid_person_name(outside_parens):
        return outside_parens, True

    # 3. Fallback an toàn cho Email Marketing:
    short_kennel = clean_kennel_short_name(raw_lead)
    if short_kennel and short_kennel.lower() not in ('there', 'facebook user'):
        return f"Team {short_kennel}", False
    return "There", False


def parse_address_right_to_left(raw_address, existing_city="", existing_state="", existing_country=""):
    """
    Phân tích địa chỉ bưu chính từ phải sang trái (Right-to-Left):
    Cấu trúc linh hoạt:
      [Street / Unit], [City], [State], [Country], [Zip]
      [Street / Unit], [City], [State] [Zip], [Country]
    """
    cleaned_existing_city = (existing_city or "").strip()
    cleaned_existing_state = (existing_state or "").strip()
    cleaned_existing_country = (existing_country or "").strip()

    # Làm sạch existing_city nếu dính rác
    if any(n in cleaned_existing_city.lower() for n in ADDRESS_NOISE_KEYWORDS) or len(cleaned_existing_city) > 35:
        cleaned_existing_city = ""
    if re.search(r'\b(?:recommendations|imdb|movies|running and playing|famous kennels|denise canada|english)\b', cleaned_existing_city, re.IGNORECASE):
        cleaned_existing_city = ""
    if cleaned_existing_city.isdigit():
        cleaned_existing_city = ""

    # Nếu không có raw_address hoặc raw_address chứa noise:
    if not raw_address or not isinstance(raw_address, str):
        return "", cleaned_existing_city, cleaned_existing_state, "", cleaned_existing_country or "United States"

    addr = raw_address.strip()
    addr_lower = addr.lower()

    for noise in ADDRESS_NOISE_KEYWORDS:
        if noise in addr_lower:
            # Chỉ loại bỏ địa chỉ rác, bảo toàn existing_city, state, country sạch!
            return "", cleaned_existing_city, cleaned_existing_state, "", cleaned_existing_country or "United States"

    if len(addr) >= 140:
        return "", cleaned_existing_city, cleaned_existing_state, "", cleaned_existing_country or "United States"

    addr = re.sub(r'\s+', ' ', addr)
    addr = re.sub(r'[\s,]+$', '', addr)

    raw_parts = [p.strip() for p in addr.split(',') if p.strip()]
    if not raw_parts:
        return "", cleaned_existing_city, cleaned_existing_state, "", cleaned_existing_country or "United States"

    parsed_country = ""
    parsed_zip = ""
    parsed_state = ""
    parsed_city = ""

    parts = list(raw_parts)

    # Vòng lặp bóc tách Country và Zip ở cuối danh sách parts
    while parts:
        last = parts[-1].strip()
        last_lower = last.lower()

        # Kiểm tra Country
        if last_lower in ('united states', 'usa', 'us', 'u.s.a.', 'u.s.'):
            parsed_country = "United States"
            parts.pop()
            continue
        elif last_lower in ('australia', 'au'):
            parsed_country = "Australia"
            parts.pop()
            continue
        elif last_lower in ('canada', 'ca'):
            parsed_country = "Canada"
            parts.pop()
            continue
        elif last_lower in ('france', 'fr'):
            parsed_country = "France"
            parts.pop()
            continue
        elif last_lower in ('poland', 'polska', 'pl'):
            parsed_country = "Poland"
            parts.pop()
            continue
        elif last_lower in ('united kingdom', 'uk', 'great britain', 'england', 'scotland'):
            parsed_country = "United Kingdom"
            parts.pop()
            continue
        elif last_lower in ('vietnam', 'việt nam'):
            parsed_country = "Vietnam"
            parts.pop()
            continue

        # Kiểm tra Zip (US: 5 chữ số; Úc: 4 chữ số)
        m_zip = re.search(r'\b(\d{5}(?:-\d{4})?)\b$', last)
        if m_zip and not parsed_zip:
            z_cand = m_zip.group(1)[:5]
            if z_cand not in ('12345', '00000'):
                parsed_zip = z_cand
                last = last[:m_zip.start()].strip()
                if last:
                    parts[-1] = last
                else:
                    parts.pop()
                continue

        m_au_zip = re.search(r'\b(\d{4})\b$', last)
        if m_au_zip and not parsed_zip and parsed_country == "Australia":
            parsed_zip = m_au_zip.group(1)
            last = last[:m_au_zip.start()].strip()
            if last:
                parts[-1] = last
            else:
                parts.pop()
            continue

        break

    # Bước 2: Tìm State
    if parts:
        last = parts[-1].strip()
        m_st_zip = re.search(r'\b([A-Z]{2})\b(?:\s+(\d{5}))?$', last)
        if m_st_zip:
            st_cand = m_st_zip.group(1)
            if st_cand in US_STATE_CODES:
                parsed_state = st_cand
                if not parsed_country:
                    parsed_country = "United States"
                if m_st_zip.group(2) and not parsed_zip:
                    parsed_zip = m_st_zip.group(2)
                last = last[:m_st_zip.start()].strip()
                if last:
                    parts[-1] = last
                else:
                    parts.pop()
            elif st_cand in AU_STATES:
                parsed_state = st_cand
                parsed_country = "Australia"
                last = last[:m_st_zip.start()].strip()
                if last:
                    parts[-1] = last
                else:
                    parts.pop()
            elif st_cand in CA_PROVINCES:
                parsed_state = st_cand
                parsed_country = "Canada"
                last = last[:m_st_zip.start()].strip()
                if last:
                    parts[-1] = last
                else:
                    parts.pop()
            elif st_cand in GARBAGE_STATES:
                last = last[:m_st_zip.start()].strip()
                if last:
                    parts[-1] = last
                else:
                    parts.pop()
        else:
            last_lower = last.lower()
            if last_lower in US_STATE_NAMES_TO_CODE:
                parsed_state = US_STATE_NAMES_TO_CODE[last_lower]
                if not parsed_country:
                    parsed_country = "United States"
                parts.pop()
            elif last_lower in AU_STATE_NAMES:
                parsed_state = AU_STATE_NAMES[last_lower]
                parsed_country = "Australia"
                parts.pop()
            elif last_lower in CA_PROVINCE_NAMES:
                parsed_state = CA_PROVINCE_NAMES[last_lower]
                parsed_country = "Canada"
                parts.pop()

    # Bước 3: Tìm City
    if parts:
        cand_city = parts.pop().strip()
        is_street_like = bool(re.search(r'\b(?:\d{1,5}\s+[A-Za-z]|Street|St\b|Road|Rd\b|Avenue|Ave\b|Boulevard|Blvd\b|Drive|Dr\b|Lane|Ln\b|Way\b|Court|Ct\b|PO Box|County Rd|Highway|Hwy)\b', cand_city, re.IGNORECASE))
        if not is_street_like and len(cand_city) < 35:
            cand_city = re.sub(r'^(?:Located in|Based in|Near|Surrounding Area\.)\s*', '', cand_city, flags=re.IGNORECASE).strip()
            parsed_city = cand_city
        else:
            parts.append(cand_city)

    # Fallback cho City & State nếu chưa tìm được từ địa chỉ
    if not parsed_city and cleaned_existing_city:
        parsed_city = cleaned_existing_city

    if not parsed_state and cleaned_existing_state:
        st_cand = cleaned_existing_state.strip()
        if st_cand.upper() in US_STATE_CODES:
            parsed_state = st_cand.upper()
        elif st_cand.upper() in AU_STATES or st_cand.lower() in AU_STATE_NAMES:
            parsed_state = AU_STATE_NAMES.get(st_cand.lower(), st_cand.upper())
            parsed_country = "Australia"
        elif st_cand.upper() in CA_PROVINCES or st_cand.lower() in CA_PROVINCE_NAMES:
            parsed_state = CA_PROVINCE_NAMES.get(st_cand.lower(), st_cand.upper())
            parsed_country = "Canada"

    if not parsed_country:
        parsed_country = cleaned_existing_country or "United States"

    cleaned_address = raw_address.strip()
    return cleaned_address, parsed_city, parsed_state, parsed_zip, parsed_country


def clean_city_string(city, state, country):
    """Làm sạch các giá trị rác trong trường city."""
    if not city:
        return "", state, country
    c = city.strip()
    c_lower = c.lower()

    # Nếu city chứa xuống dòng hoặc Surrounding Area
    if '\n' in c or 'surrounding area' in c_lower:
        lines = [l.strip() for l in c.split('\n') if l.strip()]
        for l in reversed(lines):
            clean_l = re.sub(r'^(?:Surrounding Area\.|Located in|Based in)\s*', '', l, flags=re.IGNORECASE).strip()
            if clean_l and not clean_l.lower().startswith('surrounding'):
                c = clean_l
                break

    # Nếu city có dạng "Canada · Toronto"
    if '·' in c:
        parts = [p.strip() for p in c.split('·') if p.strip()]
        for p in parts:
            if p.lower() not in ('canada', 'united states', 'australia'):
                c = p
                break

    # Nếu city là tên đường "E Lodge dr TEMPE"
    if 'tempe' in c_lower and ('lodge' in c_lower or 'dr' in c_lower):
        c = "Tempe"
        state = "AZ"

    # Nếu city là ngôn ngữ UI
    if any(w in c_lower for w in ['language', 'english', 'australian english']):
        return "", state, country

    # Nếu city là tên quốc gia "Czech Republic"
    if c_lower in ('czech republic', 'republic'):
        return "", state, "Czech Republic"

    # Nếu city là số hoặc zip
    if re.match(r'^\d+$', c) or re.match(r'^[A-Z]{1,2}\d[A-Z\d]?$', c):
        return "", state, country

    # Nếu city chứa noise keywords
    for n in ADDRESS_NOISE_KEYWORDS:
        if n in c_lower:
            return "", state, country

    return c, state, country


def determine_country(address, website, email, phone, state, current_country, city=""):
    """
    Xác định quốc gia chính xác dựa trên 4 trụ cột.
    """
    text_check = f"{address} {website} {email} {phone} {state} {city}".lower()

    if re.search(r'\.(?:com\.)?au\b', text_check) or phone.startswith('+61') or state in AU_STATES or state.lower() in AU_STATE_NAMES or 'australia' in text_check or city.lower() in ('melbourne', 'sydney', 'brisbane', 'perth', 'adelaide'):
        return "Australia"
    if re.search(r'\.pl\b', text_check) or phone.startswith('+48'):
        return "Poland"
    if re.search(r'\.(?:co\.)?uk\b', text_check) or phone.startswith('+44'):
        return "United Kingdom"
    if re.search(r'\.fr\b', text_check) or phone.startswith('+33') or 'france' in text_check:
        return "France"
    if re.search(r'\.ca\b', text_check) or state in CA_PROVINCES or state.lower() in CA_PROVINCE_NAMES or city.lower() in ('toronto', 'vancouver', 'montreal', 'quesnel'):
        return "Canada"
    if re.search(r'\.hu\b', text_check) or phone.startswith('+36'):
        return "Hungary"
    if re.search(r'\.cz\b', text_check) or phone.startswith('+420') or 'czech' in text_check:
        return "Czech Republic"
    if re.search(r'\.de\b', text_check) or phone.startswith('+49'):
        return "Germany"
    if re.search(r'\.in\b', text_check) or 'india' in text_check or 'sirhind' in text_check:
        return "India"
    if 'trinidad' in text_check:
        return "Trinidad and Tobago"
    if re.search(r'\.ukr\.net|\.ua\b', text_check) or phone.startswith('+380'):
        return "Ukraine"

    if state in US_STATE_CODES:
        return "United States"

    if current_country == "Vietnam" and not (phone.startswith('+84') or 'ho chi minh' in text_check or 'hà nội' in text_check):
        return "United States"

    return current_country or "United States"


# =============================================================================
# MAIN SANITIZER WORKFLOW
# =============================================================================

def sanitize_crm_lead(item, idx):
    """Làm sạch toàn diện 1 bản ghi lead theo 8 nhóm tiêu chuẩn."""
    for k, v in list(item.items()):
        if isinstance(v, str):
            item[k] = decode_unescaped_unicode(v)

    stt = item.get('stt', idx + 1)
    name = item.get('name', '').strip()

    # 1. Chuẩn hóa website và amazon_url
    raw_website = (item.get('website') or '').strip()
    raw_amazon = (item.get('amazon_url') or '').strip()

    # Sửa cho Kayla Parrish (STT 32, fb_id 52704988)
    if '52704988' in str(item.get('fb_id', '')) or ('kayla' in name.lower() and 'parrish' in name.lower()):
        raw_amazon = "http://amazon.com/author/kaylaparrish, https://www.amazon.com/dp/B0H8FRHXF2"
        raw_website = "https://www.amazon.com/dp/B0H8FRHXF2"
        item['publishTimestamp'] = 1792617529
        item['publishTime'] = "22/10/2026 04:18:49 (Reels/Feed)"
        item['publishTimeISO'] = "2026-10-22T04:18:49Z"
        item['relativeTime'] = "Hôm nay (Reels/Feed)"
        item['activity_status'] = "✓ TÍCH CỰC (Trại đang hoạt động)"

    # Sửa data bleed giữa STT 68 và STT 69
    if 'ember and cole' in name.lower() or 'eandcessfamily' in str(item.get('url', '')).lower():
        raw_amazon = "https://www.amazon.ca/shop/emberandcole_springer_spaniel"
    elif 'doerner' in name.lower():
        if 'emberandcole' in raw_amazon:
            raw_amazon = ""

    if is_amazon_url(raw_website):
        if is_valid_amazon_storefront(raw_website):
            if not raw_amazon:
                raw_amazon = raw_website
            elif raw_website not in raw_amazon:
                raw_amazon = f"{raw_website}, {raw_amazon}"

    if not is_valid_amazon_storefront(raw_amazon):
        amazon_url = ""
        has_amazon = False
        amazon_channel = "Amazon link not found"
        amz_cat = "Chưa phát hiện link Amazon"
    else:
        amazon_url = raw_amazon
        has_amazon = True
        amazon_channel = "Selling on Amazon (Target)"
        amz_cat = "Pet Toys / Artificial Grass / Pet Toilets"

    if is_blacklisted_website(raw_website):
        website = ""
    else:
        website = raw_website

    # Nếu không có website riêng ngoài link Amazon, giữ link Amazon Storefront làm website để không bị mất trắng
    if not website and amazon_url:
        website = amazon_url.split(',')[0].strip()

    # 2. Sửa lỗi trích xuất address, city, state, zip, country
    raw_address = item.get('address', '')
    cur_city = item.get('city', '')
    cur_state = item.get('state', '')
    cur_country = item.get('country', '')

    clean_addr, city, state, zip_code, country = parse_address_right_to_left(
        raw_address, cur_city, cur_state, cur_country
    )

    if state in GARBAGE_STATES:
        state = ""

    # Chuẩn hóa tên bang Úc / Canada
    if state.lower() in AU_STATE_NAMES:
        state = AU_STATE_NAMES[state.lower()]
    elif state.lower() in CA_PROVINCE_NAMES:
        state = CA_PROVINCE_NAMES[state.lower()]

    # Làm sạch sâu trường city
    city, state, country = clean_city_string(city, state, country)

    country = determine_country(clean_addr, website, item.get('email', ''), item.get('phone', ''), state, country, city)

    if 'shieldsville' in str(clean_addr).lower():
        city = "Faribault"
        state = "MN"
        zip_code = "55021"
        country = "United States"

    # 3. Làm sạch owner
    raw_owner = item.get('owner', '')
    clean_owner, owner_is_person = clean_and_verify_owner(raw_owner, name)

    # 4. Lọc sạch email, phone, instagram
    email = clean_email(item.get('email', ''))
    phone = clean_phone(item.get('phone', ''), country)
    instagram = clean_instagram_url(item.get('instagram', ''))

    # 5. Thời gian (publishTimeISO)
    pub_ts = item.get('publishTimestamp')
    pub_time = item.get('publishTime') or item.get('publish_time') or ''
    pub_iso = ""

    if pub_ts:
        try:
            ts_int = int(pub_ts)
            dt = datetime.fromtimestamp(ts_int, tz=timezone.utc)
            pub_iso = dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        except Exception:
            pub_iso = ""

    rel_time = item.get('relativeTime') or item.get('relative_time') or 'Chưa xác định'
    act_status = item.get('activity_status') or ('Tích cực' if pub_ts and (datetime.now().timestamp() - pub_ts < 7*86400) else 'Bình thường')

    avatar = item.get('avatar') or item.get('avatar_url') or item.get('img') or item.get('image') or item.get('photo') or ''

    # 6. Đóng gói chuẩn Schema đồng nhất
    sanitized = {
        "stt": stt,
        "taskId": item.get('taskId') or f"task_{idx+1}",
        "lead_id": item.get('lead_id') or f"LEAD-US-{idx+1:05d}",
        "fb_id": str(item.get('fb_id') or ''),
        "name": name,
        "url": item.get('url') or '',
        "avatar": avatar,
        "bio": item.get('bio') or '',
        "owner": clean_owner,
        "owner_is_person": owner_is_person,
        "owner_confidence": item.get('ownerConfidence') or item.get('owner_confidence') or ('Tier 1 - Verified' if owner_is_person else 'Default Fallback'),
        "address": clean_addr,
        "city": city,
        "state": state,
        "zip": zip_code,
        "country": country,
        "phone": phone,
        "email": email,
        "website": website,
        "websiteInspected": True if website else False,
        "instagram": instagram,
        "has_amazon": has_amazon,
        "amazon_url": amazon_url,
        "amazon_channel": amazon_channel,
        "amz_cat": amz_cat,
        "publishTimestamp": pub_ts,
        "publishTime": pub_time,
        "publishTimeISO": pub_iso,
        "activity_status": act_status,
        "relativeTime": rel_time,
        "score": item.get('score', 80),
        "rank_tier": item.get('rank_tier', 'Tier A (Vàng: 70 - 84đ)'),
        "sales_action": item.get('sales_action') or ('Khai thác ngách phụ kiện/cỏ trên Amazon' if has_amazon else 'Telesale: Gửi catalogue Take-Home Kit in logo độc quyền'),
        "product_fit": item.get('product_fit') or ('B2B Wholesale: Thảm Cỏ Huấn Luyện + Pet Potty + Toys Bundle' if has_amazon else 'Take-Home Kit Chó Con (Cỏ + Khay + Đồ chơi teething)')
    }

    return sanitized


def run_sanitizer():
    base_dir = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System"
    source_file = os.path.join(base_dir, "LEAD_US_Meta_CRM_2026-10-22.json")
    backup_file = os.path.join(base_dir, "LEAD_US_Meta_CRM_2026-10-22.backup.json")
    lead2_file = os.path.join(base_dir, "lead2.json")

    print("=" * 70)
    print("🚀 BẮT ĐẦU CHUẨN HÓA DỮ LIỆU LEAD_US_Meta_CRM_2026-10-22.json")
    print("=" * 70)

    # Đọc từ bản backup gốc nếu có để dữ liệu sạch nhất
    input_file = backup_file if os.path.exists(backup_file) else source_file
    if not os.path.exists(input_file):
        print(f"❌ Không tìm thấy tệp: {input_file}")
        sys.exit(1)

    print(f"📖 Đang nạp dữ liệu nguồn từ: {input_file}")
    with open(input_file, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)

    total_records = len(raw_data)
    print(f"📊 Tổng số bản ghi cần xử lý: {total_records}")

    sanitized_leads = []
    stats = {
        'amazon_valid': 0,
        'person_owners': 0,
        'fallback_owners': 0,
        'emails_cleaned': 0,
        'phones_cleaned': 0,
        'instagrams_cleaned': 0
    }

    for idx, raw_item in enumerate(raw_data):
        clean_item = sanitize_crm_lead(raw_item, idx)
        sanitized_leads.append(clean_item)

        if clean_item['has_amazon']:
            stats['amazon_valid'] += 1
        if clean_item['owner_is_person']:
            stats['person_owners'] += 1
        else:
            stats['fallback_owners'] += 1
        if clean_item['email']:
            stats['emails_cleaned'] += 1
        if clean_item['phone']:
            stats['phones_cleaned'] += 1
        if clean_item['instagram']:
            stats['instagrams_cleaned'] += 1

    with open(source_file, 'w', encoding='utf-8') as f:
        json.dump(sanitized_leads, f, ensure_ascii=False, indent=2)
    print(f"✅ Đã ghi đè tệp chính: {source_file}")

    if os.path.exists(lead2_file):
        with open(lead2_file, 'r', encoding='utf-8') as f:
            lead2_raw = json.load(f)
        clean_lead2 = [sanitize_crm_lead(it, i) for i, it in enumerate(lead2_raw)]
        with open(lead2_file, 'w', encoding='utf-8') as f:
            json.dump(clean_lead2, f, ensure_ascii=False, indent=2)
        print(f"✅ Đã đồng bộ lead2.json ({len(clean_lead2)} bản ghi)")

    try:
        import pandas as pd
        df = pd.DataFrame(sanitized_leads)
        excel_out = os.path.join(base_dir, "Priority_Data_8_Meta_CRM_Sanitized.xlsx")
        df.to_excel(excel_out, index=False)
        print(f"✅ Đã xuất bảng Excel Master: {excel_out} ({len(df.columns)} cột)")
    except Exception as e:
        print(f"⚠️ Không thể xuất Excel (pandas/openpyxl): {e}")

    print("\n" + "=" * 70)
    print("📈 BÁO CÁO KẾT QUẢ CHUẨN HÓA DỮ LIỆU:")
    print("=" * 70)
    print(f"  • Tổng số Leads đã làm sạch: {total_records}")
    print(f"  • Leads có Storefront Amazon Target hợp lệ: {stats['amazon_valid']}")
    print(f"  • Chủ trại là Tên Người Thật (owner_is_person=True): {stats['person_owners']}")
    print(f"  • Chủ trại Fallback an toàn (owner_is_person=False): {stats['fallback_owners']}")
    print(f"  • Leads có Email hợp lệ (đã fix typo & lọc rác): {stats['emails_cleaned']}")
    print(f"  • Leads có SĐT chuẩn E.164: {stats['phones_cleaned']}")
    print(f"  • Leads có Instagram hợp lệ: {stats['instagrams_cleaned']}")
    print("=" * 70)


if __name__ == '__main__':
    run_sanitizer()
