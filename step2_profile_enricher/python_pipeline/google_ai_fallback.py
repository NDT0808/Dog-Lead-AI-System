#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script: google_ai_fallback.py
Module: Step 2 - Tầng 3: Giả lập Google AI Search / Gemini Overview & Trích xuất Danh bạ
Chuẩn hóa chính xác theo video: Recording 2026-10-19 020236.mp4
Chức năng:
1. Kích hoạt khi quét Facebook & Website mà VẪN CHƯA CÓ TÊN CHỦ TRẠI (`owner`) hoặc thiếu SĐT/Vị trí.
2. Gửi câu truy vấn có cấu trúc chuẩn tới Google Search / Google AI:
   "{fb_url} 名字 全名 用户社交 工作职位 国家地址 行业 添加日期 公司名称 公司网址 公司社交 公司所属国家 州 城市 公司所在行业 电话 hãy tìm và dịch ra tiếng việt giúp tôi"
3. Bóc tách tự động các trường từ câu trả lời có cấu trúc của Google AI:
   - Tên chủ trại / Doanh nghiệp
   - Số điện thoại
   - Link website
   - Bán trên Amazon, Danh mục Amazon thực tế (không cào bằng)
   - Bang, Thành phố, Mã bưu điện, Quốc gia
   - Thời gian đăng bài gần nhất
"""

import os
import re
import time
import urllib.parse
from bs4 import BeautifulSoup

PROMPT_TEMPLATE = "{fb_url} 名字 全名 用户社交 工作职位 国家地址 行业 添加日期 公司名称 公司网址 公司社交 公司所属国家 州 城市 公司所在行业 电话 hãy tìm và dịch ra tiếng việt giúp tôi"

# US State abbreviations
US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
}

# US State full names mapping to codes
US_STATE_NAMES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA",
    "colorado": "CO", "connecticut": "CT", "delaware": "DE", "florida": "FL", "georgia": "GA",
    "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO",
    "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
    "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT",
    "virginia": "VA", "washington": "WA", "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY"
}

def parse_google_ai_response(raw_text):
    """
    Bóc tách các trường từ văn bản trả lời của Google AI / Gemini Overview
    hỗ trợ chuẩn xác định dạng từ video mẫu:
    Prompt: {url} 名字 全名 用户社交 工作职位 国家地址 行业 添加日期 公司名称 公司网址 公司社交 公司所属国家 州 城市 公司所在行业 电话 hãy tìm và dịch ra tiếng việt giúp tôi
    """
    data = {}
    if not raw_text:
        return data

    text = str(raw_text)

    # 1. Tên công ty / Trại cún (Company Name)
    m_c = re.search(r'[•\-*]?\s*(?:公司名称|Tên công ty|Tên trại|Company Name)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
    if m_c:
        raw_comp = m_c.group(1).strip()
        data['company_name'] = re.sub(r'\(.*?\)', '', raw_comp).strip('. \t\r\n')

    # 2. Tên chủ trại (Owner) - Ưu tiên 全名 (Họ và tên) rồi đến 名字 (Tên)
    m_fn = re.search(r'[•\-*]?\s*(?:全名|Họ và tên|Full Name)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
    m_n = re.search(r'[•\-*]?\s*(?:名字|Tên|First Name)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)

    fn_val = m_fn.group(1).strip() if m_fn else ''
    n_val = m_n.group(1).strip() if m_n else ''

    def is_valid_name(val):
        if not val:
            return False
        low = val.lower()
        return not any(x in low for x in ['không có', 'chưa rõ', 'none', 'n/a', 'không công khai', 'unknown', 'tùy'])

    if is_valid_name(fn_val):
        data['owner'] = re.sub(r'\(.*?\)', '', fn_val).strip('. \t\r\n')
    elif is_valid_name(n_val):
        data['owner'] = re.sub(r'\(.*?\)', '', n_val).strip('. \t\r\n')
    elif data.get('company_name'):
        data['owner'] = f"{data['company_name']} (Chủ trại)"
    else:
        # Fallback Tên chủ trại từ text chung
        m_gen = re.search(r'[•\-*]?\s*(?:Tên chủ trại\s*/\s*Doanh nghiệp|Tên chủ trại|Chủ trại|Chủ sở hữu)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
        if m_gen and is_valid_name(m_gen.group(1).strip()):
            data['owner'] = re.sub(r'\(.*?\)', '', m_gen.group(1).strip()).strip('. \t\r\n')

    # 3. Số điện thoại (Phone)
    m_p = re.search(r'[•\-*]?\s*(?:电话|Điện thoại|Số điện thoại|Phone)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
    if m_p:
        raw_phone = m_p.group(1).strip()
        clean_phone = re.sub(r'[^\d+]', '', raw_phone)
        if len(clean_phone) >= 10:
            data['phone'] = clean_phone[-11:] if len(clean_phone) == 11 else f"1{clean_phone[-10:]}"

    # 4. Link website (Website)
    m_w = re.search(r'[•\-*]?\s*(?:公司网址|Website công ty|Website|Link website)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
    if m_w:
        w_cand = m_w.group(1).strip()
        m_url = re.search(r'https?://[^\s)\]]+', w_cand)
        if m_url:
            data['website'] = m_url.group(0).rstrip('.,;')
        else:
            m_dom = re.search(r'\b([a-zA-Z0-9-]+\.(?:com|org|net|us|co|biz|io|kennel|pet)(?:/[^\s)\]]*)?)\b', w_cand, re.IGNORECASE)
            if m_dom:
                data['website'] = f"https://{m_dom.group(1)}"

    # 5. Amazon channel & links
    m_amz = re.search(r'[•\-*]?\s*(?:Có bán trên Amazon không|Amazon|Kênh Amazon)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
    if m_amz:
        amz_text = m_amz.group(1).strip()
        data['amz_status'] = amz_text
        lower_amz = amz_text.lower()
        has_grass = any(k in lower_amz for k in ['cỏ', 'thảm cỏ', 'vệ sinh', 'potty', 'grass', 'pad'])
        has_toy = any(k in lower_amz for k in ['đồ chơi', 'toy', 'chew', 'kong'])
        
        if has_grass and has_toy:
            data['amz_cat'] = "Selling pet toys + Artificial grass/Pet toilets (TARGET)"
        elif has_grass:
            data['amz_cat'] = "Selling artificial grass/pet toilets (TARGET)"
        elif has_toy:
            data['amz_cat'] = "Selling pet toys"
        elif 'không' in lower_amz and ('danh sách' in lower_amz or 'idea list' in lower_amz):
            data['amz_cat'] = "Selling pet toys"
        elif 'không' in lower_amz or 'chưa' in lower_amz:
            data['amz_cat'] = "Amazon link not found"
        else:
            data['amz_cat'] = "There's an Amazon link, but no target sales."

    m_amz_link = re.search(r'[•\-*]?\s*(?:Amazon link|Link Amazon)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
    if m_amz_link:
        m_link = re.search(r'https?://[^\s)\]]+', m_amz_link.group(1))
        if m_link:
            data['amz_link'] = m_link.group(0).rstrip('.,;')

    # 6. Bang (State)
    m_st = re.search(r'[•\-*]?\s*(?:州|Bang|State)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
    if m_st:
        raw_st = m_st.group(1).strip()
        m_code = re.search(r'\b([A-Z]{2})\b', raw_st)
        if m_code and m_code.group(1) in US_STATES:
            data['state'] = m_code.group(1)
        else:
            st_clean = re.sub(r'\(.*?\)', '', raw_st).strip('. \t\r\n')
            data['state'] = US_STATE_NAMES.get(st_clean.lower(), st_clean)

    # 7. Thành phố (City)
    m_ci = re.search(r'[•\-*]?\s*(?:城市|Thành phố|City)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
    if m_ci:
        data['city'] = re.sub(r'\(.*?\)', '', m_ci.group(1)).strip('. \t\r\n')

    # 8. Quốc gia & Địa chỉ (Address) & Mã bưu điện (Zip)
    m_addr = re.search(r'[•\-*]?\s*(?:国家地址|Quốc gia & Địa chỉ|Địa chỉ|Address)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
    if m_addr:
        raw_addr = m_addr.group(1).strip()
        m_us_in_paren = re.search(r'\(([^)]+USA[^)]*)\)', raw_addr, re.IGNORECASE)
        if m_us_in_paren:
            data['address'] = m_us_in_paren.group(1).strip()
        else:
            data['address'] = raw_addr
        m_zip = re.search(r'\b(\d{5}(?:-\d{4})?)\b', raw_addr)
        if m_zip:
            data['zip'] = m_zip.group(1)

    if not data.get('zip'):
        m_zip_row = re.search(r'[•\-*]?\s*(?:Mã bưu điện|Zip code|Zip)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
        if m_zip_row:
            m_zip_val = re.search(r'\b(\d{5}(?:-\d{4})?)\b', m_zip_row.group(1))
            if m_zip_val:
                data['zip'] = m_zip_val.group(1)

    data['country'] = "United States"

    # 9. Thời gian đăng bài gần nhất (Recent post time)
    m_pt = re.search(r'[•\-*]?\s*(?:Thời gian đăng bài gần nhất|Đăng bài gần nhất|添加日期|Ngày thêm thông tin)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
    if m_pt:
        data['publishTime_raw'] = m_pt.group(1).strip()

    return data

def simulate_google_ai_query(fb_url, company_name=None, headless=True):
    """
    Giả lập mở tab Google, gõ URL Facebook + prompt và chờ kết quả từ Google AI / Gemini Overview
    """
    full_query = PROMPT_TEMPLATE.format(fb_url=fb_url)
    
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless)
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                locale="vi-VN"
            )
            page = context.new_page()

            # Encode URL search
            encoded = urllib.parse.quote_plus(full_query)
            search_url = f"https://www.google.com/search?q={encoded}"
            
            page.goto(search_url, wait_until="domcontentloaded", timeout=12000)
            time.sleep(2.5) # Chờ AI Overview xuất hiện

            content = ""
            ai_elements = page.query_selector_all('div[data-attrid="wa:/description"], div[class*="g"], div[class*="MjjYud"]')
            for el in ai_elements[:6]:
                try:
                    content += "\n" + el.inner_text()
                except Exception:
                    pass

            browser.close()
            parsed = parse_google_ai_response(content)
            return parsed
    except Exception as e:
        return {}

if __name__ == "__main__":
    sample_text = """
    • Tên chủ trại / Doanh nghiệp: Roleez Yorkies
    • Số điện thoại: (413) 317-3410
    • Link website: https://www.gooddog.com/breeders/roleez-yorkies
    • Có bán trên Amazon không: Có đồ chơi và tã lót cho cún con (Amazon Idea List)
    • Amazon link: https://www.amazon.com/shop/roleez_yorkies
    • Bang: Massachusetts (MA)
    • Thành phố: Wilbraham
    • Zip code: 01095
    """
    res = parse_google_ai_response(sample_text)
    print("Test parse:")
    for k, v in res.items():
        print(f"  {k}: {v}")
