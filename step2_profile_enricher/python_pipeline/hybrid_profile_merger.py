#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script: hybrid_profile_merger.py
Module: Step 2 - Hợp nhất dữ liệu thông minh (Hybrid Profile Merger Engine v2.3)
Chức năng:
1. Hợp nhất dữ liệu đa nguồn: Facebook About + Website đa trang con + Google AI Fallback.
2. Chuẩn hóa 100% theo đúng cấu trúc 28-30 trường dữ liệu Meta RAG (khớp hoàn toàn với CRM FB-FS-2).
3. Đảm bảo thu thập đầy đủ: STT (LEAD-US-XXXXXX), Tên chủ trại (Owner), SĐT (+1), Website, Bang, City, Zip.
4. Phân loại Loại hình Doanh nghiệp (`cat` & `cat_code`) linh hoạt (Breeder, Boarding, Shelter, Supplies, Pet Owner).
5. Phân loại Kênh Amazon chuẩn xác (không cào bằng).
6. Thuật toán Chấm điểm Động 5 Trục Chống Bão hòa (Anti-Saturation Dynamic Scoring Engine).
7. BẢO TOÀN 100% ẢNH ĐẠI DIỆN HD (ngăn chặn hoàn toàn lỗi biến thành chữ viết tắt GC, 8D, SG, TP).
"""

import re
import time

HIGH_VALUE_BREEDS = [
    'golden retriever', 'boykin spaniel', 'french bulldog', 'frenchie',
    'bernedoodle', 'goldendoodle', 'corgi', 'dachshund', 'doxie',
    'boxer', 'miniature schnauzer', 'schnauzer', 'poodle', 'labrador',
    'german shepherd', 'malinois', 'english bulldog', 'cavapoo', 'aussie'
]

COMMON_BREEDS = [
    'chihuahua', 'shih tzu', 'yorkie', 'yorkshire', 'beagle', 'pug',
    'husky', 'maltese', 'pomeranian', 'rottweiler', 'doberman', 'great dane'
]

def normalize_phone_number(raw_phone):
    """Chuẩn hóa số điện thoại theo chuẩn US (+1 XXXXXXXXXX)"""
    if not raw_phone:
        return ""
    digits = re.sub(r'[^\d]', '', str(raw_phone))
    if len(digits) == 10:
        return f"1{digits}"
    elif len(digits) == 11 and digits.startswith('1'):
        return digits
    elif len(digits) > 10:
        return f"1{digits[-10:]}"
    return digits

def determine_business_category(name, bio, raw_cat):
    """Phân loại Loại hình Doanh nghiệp động theo đặc tính"""
    text = f"{name} {bio} {raw_cat}".lower()
    
    if any(k in text for k in ['rescue', 'shelter', 'adoption', 'sanctuary', 'aspca', 'humane society']):
        return "Pet Rescue / Animal Shelter", "shelter"
    if any(k in text for k in ['boarding', 'training', 'k9', 'academy', 'camp', 'kennel club']):
        return "Pet Boarding / Training Academy (B2B)", "boarding"
    if any(k in text for k in ['grooming', 'pet spa', 'supplies', 'pet shop', 'pet store', 'boutique']):
        return "Pet Supplies & Retailer / Grooming", "supplies"
    if any(k in text for k in ['breeder', 'kennel', 'farm', 'puppies', 'puppy', 'retriever', 'spaniel', 'doodle', 'frenchie', 'corgi', 'boxer', 'doxie', 'labs', 'shepherds']):
        return "Dog Breeder / Commercial Kennel (B2B)", "breeder"
    
    return "Dog Breeder / Commercial Kennel (B2B)", "breeder"

def generate_product_fit(amz_cat, has_puppy_page=False):
    """Gợi ý sản phẩm dựa trên đặc tính hồ sơ chuẩn hóa theo Meta CRM"""
    if amz_cat == "Selling pet toys + Artificial grass/Pet toilets (TARGET)":
        return "Puppy Starter Kit V3 (Cỏ thoát nước + Khay Potty + Đồ chơi in logo độc quyền)"
    elif amz_cat == "Selling artificial grass/pet toilets (TARGET)":
        return "Puppy Starter Kit V2 (Thảm cỏ thoát nước kháng khuẩn + Khay Potty 3 lớp)"
    elif amz_cat == "Selling pet toys":
        return "Puppy Play & Teething Kit (Combo Đồ chơi gặm ngứa răng + Đồ chơi xoa dịu in logo)"
    elif amz_cat == "There's an Amazon link, but no target sales.":
        return "Puppy Starter Pack (Take-Home Kit mở rộng danh mục quà tặng cún con)"
    else:
        return "Puppy Starter Kit (Thảm cỏ huấn luyện đi vệ sinh + Đồ chơi cún con)"

def compute_anti_saturation_score(lead_info):
    """
    Thuật toán Chấm điểm Động 5 Trục Chống Bão hòa (Anti-Saturation Scoring Engine):
    Score = Recency (0-35) + ICP Fit (10-30) + Breed Value (0-15) + Infrastructure (0-10) + Amazon (0-15)
    """
    # 1. Trục 1: Recency (0 - 35)
    rel_time = lead_info.get('relativeTime', '').lower()
    if any(k in rel_time for k in ['giờ', 'hour', 'phút', 'minute', 'vừa xong', 'giây']):
        recency = 35
    elif any(k in rel_time for k in ['1 ngày', '2 ngày', '3 ngày', '1 day', '2 days', '3 days']):
        recency = 28
    elif any(k in rel_time for k in ['4 ngày', '5 ngày', '6 ngày', '7 ngày', 'tuần', 'week']):
        recency = 20
    elif any(k in rel_time for k in ['8 ngày', '9 ngày', '10 ngày', '2 tuần']):
        recency = 15
    elif any(k in rel_time for k in ['tháng', 'month', '3 tuần']):
        recency = 8
    else:
        recency = 25 # Mặc định tương tác gần đây

    # 2. Trục 2: ICP Fit (10 - 30)
    cat_code = lead_info.get('cat_code', 'breeder')
    if cat_code == 'breeder':
        icp = 30
    elif cat_code == 'boarding':
        icp = 22
    elif cat_code in ['shelter', 'supplies']:
        icp = 15
    else:
        icp = 10

    # 3. Trục 3: Breed Commercial Value (0 - 15)
    all_text = f"{lead_info.get('name', '')} {lead_info.get('bio', '')}".lower()
    high_count = sum(1 for b in HIGH_VALUE_BREEDS if b in all_text)
    if high_count >= 2:
        breed_val = 15
    elif high_count == 1:
        breed_val = 10
    elif any(b in all_text for b in COMMON_BREEDS):
        breed_val = 5
    else:
        breed_val = 5

    # 4. Trục 4: Business Infrastructure (0 - 10)
    infra = 0
    if lead_info.get('website'):
        infra += 5
    if lead_info.get('phone') or lead_info.get('email') or lead_info.get('has_application'):
        infra += 5

    # 5. Trục 5: Amazon Credibility (0 - 15)
    amz_cat = lead_info.get('amz_cat', '')
    if amz_cat == "Selling pet toys + Artificial grass/Pet toilets (TARGET)":
        amz_pts = 15
    elif amz_cat == "Selling artificial grass/pet toilets (TARGET)":
        amz_pts = 10
    elif amz_cat == "Selling pet toys":
        amz_pts = 7
    elif amz_cat == "There's an Amazon link, but no target sales.":
        amz_pts = 3
    else:
        amz_pts = 0

    total = recency + icp + breed_val + infra + amz_pts
    # Giới hạn dải 30 - 98
    total = max(30, min(total, 98))

    if total >= 85:
        tier = "Tier S"
        action = "🔥 TELESALE: Gọi chốt Take-Home Kit in logo độc quyền ngay trong ngày"
    elif total >= 70:
        tier = "Tier A"
        action = "📧 EMAIL + TELESALE: Gửi báo giá sỉ Puppy Starter Kit kèm chào mẫu thử"
    elif total >= 50:
        tier = "Tier B"
        action = "📨 CHĂM SÓC: Đưa vào chuỗi email marketing tự động nuôi dưỡng định kỳ"
    elif total >= 30:
        tier = "Tier C"
        action = "📋 LƯU TRỮ: Nuôi dưỡng nội dung mạng xã hội & chờ dịp thích hợp"
    else:
        tier = "Tier D"
        action = "❄️ ĐÓNG BĂNG: Hồ sơ thiếu thông tin liên lạc"

    return total, tier, action

def merge_lead_profile(base_lead, fb_data=None, web_data=None, ai_data=None, index=1):
    """
    Hợp nhất hồ sơ khách hàng theo thứ tự ưu tiên chính xác:
    1. Tên chủ trại (Owner): Ưu tiên Web -> Google AI -> Bio FB -> Email Prefix
    2. Website: Ưu tiên Website sạch từ Web/FB -> Google AI
    3. Phone/Email: Ưu tiên Web/FB -> Google AI
    4. Địa chỉ, Bang, City, Zip: Hợp nhất đa tầng
    5. Amazon Category & Link: Phân loại thực tế (không cào bằng Target)
    6. Avatar HD: Giữ nguyên 100% URL gốc từ Bước 1 hoặc FB og:image
    """
    fb_data = fb_data or {}
    web_data = web_data or {}
    ai_data = ai_data or {}

    fb_id = str(base_lead.get('fb_id') or fb_data.get('fb_id') or '').strip()
    name = (base_lead.get('name') or fb_data.get('name') or ai_data.get('company_name') or 'Dog Breeder').strip()
    # Làm sạch tên nếu bị lẫn chuỗi người theo dõi
    name = re.sub(r'^\d+[KM]?\s*(?:người theo dõi|followers?)\b', '', name, flags=re.IGNORECASE).strip()
    if not name:
        name = "Dog Breeder"

    # 1. Tên chủ trại (Owner / Representative)
    owner = ""
    if web_data.get('owner'):
        owner = web_data['owner']
    elif ai_data.get('owner') and ai_data['owner'] != name:
        owner = ai_data['owner']
    elif fb_data.get('owner'):
        owner = fb_data['owner']
    elif web_data.get('email'):
        from website_deep_crawler import extract_name_from_email_prefix
        cand_n = extract_name_from_email_prefix(web_data['email'])
        if cand_n:
            owner = cand_n
    elif fb_data.get('email'):
        from website_deep_crawler import extract_name_from_email_prefix
        cand_n = extract_name_from_email_prefix(fb_data['email'])
        if cand_n:
            owner = cand_n

    if not owner or owner == name or owner.lower() == 'facebook' or 'facebook' in owner.lower():
        clean_n = name if (name and name.lower() != 'facebook') else 'Chủ trại'
        parts = clean_n.split(' ')
        if len(parts) >= 2 and not any(p.lower() in ['kennel', 'kennels', 'breeder', 'puppy', 'farm'] for p in parts[:1]):
            owner = f"{parts[0]} (Chủ trại / Quản lý)"
        elif clean_n != 'Chủ trại':
            owner = f"{clean_n} (Chủ trại)"
        else:
            owner = "Chủ trại"

    # 2. Website & Kênh Amazon
    website = web_data.get('website') or fb_data.get('website') or ai_data.get('website') or base_lead.get('website') or ""
    if 'fbclid' in website:
        website = re.sub(r'[?&]fbclid=[^&]+', '', website)
    if any(amz in website.lower() for amz in ['amazon.com', 'amzn.to']):
        if not amz_link:
            amz_link = website
        website = ""
    if any(bad in website.lower() for bad in ['bing.com', 'yahoo.com', 'gmail.com', 'google.com/maps', 'facebook.com']):
        website = ""

    # 3. Phone & Email
    raw_phone = web_data.get('phone') or fb_data.get('phone') or ai_data.get('phone') or base_lead.get('phone') or ""
    phone = normalize_phone_number(raw_phone)
    email = web_data.get('email') or fb_data.get('email') or ai_data.get('email') or base_lead.get('email') or ""

    # 4. Địa chỉ (Address, City, State, Zip, Country)
    city = web_data.get('city') or fb_data.get('city') or ai_data.get('city') or base_lead.get('city') or ""
    state = web_data.get('state') or fb_data.get('state') or ai_data.get('state') or base_lead.get('state') or ""
    zip_code = web_data.get('zip') or fb_data.get('zip') or ai_data.get('zip') or base_lead.get('zip') or ""
    address = fb_data.get('address') or ai_data.get('address') or base_lead.get('address') or ""
    if address == '5.0(100+)' or '5.0(' in address:
        address = ""
    if not address:
        parts = [p for p in [city, state, "United States", zip_code] if p]
        address = ", ".join(parts) if parts else "United States"

    # 5. Phân loại Loại hình Doanh nghiệp
    cat, cat_code = determine_business_category(name, fb_data.get('bio', ''), fb_data.get('category', ''))

    # 6. Kênh Amazon & Link Amazon (Thực tế, không cào bằng)
    amz_cat = web_data.get('amz_cat') or ai_data.get('amz_cat') or base_lead.get('amz_cat') or "Amazon link not found"
    amz_link = web_data.get('amz_link') or ai_data.get('amz_link') or base_lead.get('amz_link') or ""

    # 7. Avatar URL (Bảo toàn 100% Avatar HD)
    avatar_url = ""
    for cand in [
        base_lead.get('avatar_url'),
        base_lead.get('image'),
        base_lead.get('img'),
        base_lead.get('photo'),
        fb_data.get('avatar_url'),
        base_lead.get('avatar')
    ]:
        if cand and str(cand).startswith('http') and 'unavatar.io' not in cand and 'ui-avatars.com' not in cand:
            avatar_url = cand
            break

    if not avatar_url and fb_data.get('avatar_url'):
        avatar_url = fb_data['avatar_url']

    if not avatar_url:
        clean_enc = name.replace(' ', '%20')
        avatar_url = f"https://ui-avatars.com/api/?name={clean_enc}&background=1e293b&color=38bdf8"

    # 8. Time & Recency
    pub_time = fb_data.get('publishTime') or ai_data.get('publishTime_raw') or base_lead.get('publishTime') or time.strftime('%d/%m/%Y %H:%M:%S')
    rel_time = fb_data.get('relativeTime') or base_lead.get('relativeTime') or "Gần đây"
    pub_timestamp = int(fb_data.get('publishTimestamp') or base_lead.get('publishTimestamp') or time.time())

    # Trạng thái hoạt động
    activity_status = fb_data.get('activity_status') or base_lead.get('activity_status') or ""
    if not activity_status:
        if any(k in rel_time for k in ['giờ', 'hour', 'phút', 'min', 'vừa', 'just now']):
            activity_status = "🔥 RẤT TÍCH CỰC (Đăng trong hôm nay)"
        elif any(k in rel_time for k in ['1 ngày', '2 ngày', '3 ngày', '1 day', '2 days', '3 days']):
            activity_status = "🔥 RẤT TÍCH CỰC (Đăng trong 3 ngày qua)"
        elif any(k in rel_time for k in ['tuần', 'week', 'ngày', 'days']):
            activity_status = "✓ TÍCH CỰC (Đăng trong tháng qua)"
        else:
            activity_status = "✓ TÍCH CỰC (Trại đang hoạt động)"

    # 9. Gợi ý Sản phẩm
    product_fit = generate_product_fit(amz_cat, web_data.get('has_puppy_page'))

    # 10. Chấm điểm động 5 trục
    lead_info = {
        'name': name,
        'bio': fb_data.get('bio', ''),
        'relativeTime': rel_time,
        'cat_code': cat_code,
        'website': website,
        'phone': phone,
        'email': email,
        'has_application': web_data.get('has_application', False),
        'amz_cat': amz_cat
    }
    score, rank_tier, sales_action = compute_anti_saturation_score(lead_info)

    stt = f"LEAD-US-{index:06d}"

    return {
        "stt": stt,
        "name": name,
        "owner": owner,
        "url": base_lead.get('url') or (f"https://www.facebook.com/profile.php?id={fb_id}" if fb_id else ""),
        "website": website,
        "phone": phone,
        "email": email,
        "address": address,
        "city": city,
        "state": state,
        "zip": zip_code,
        "country": "United States",
        "cat": cat,
        "cat_code": cat_code,
        "amz_cat": amz_cat,
        "amz_link": amz_link,
        "product_fit": product_fit,
        "score": score,
        "rank_tier": rank_tier,
        "is_prio": (score >= 70),
        "sales_action": sales_action,
        "fb_id": fb_id,
        "avatar": avatar_url,
        "avatar_url": avatar_url,
        "image": avatar_url,
        "img": avatar_url,
        "photo": avatar_url,
        "logo": avatar_url,
        "publishTime": pub_time,
        "publish_time": pub_time,
        "publishTimestamp": pub_timestamp,
        "relativeTime": rel_time,
        "relative_time": rel_time,
        "activity_status": activity_status
    }

if __name__ == "__main__":
    lead_sample = {"fb_id": "100068177232065", "name": "Family Loved Golden Retrievers", "url": "https://www.facebook.com/FamilyLovedGoldenRetrievers"}
    fb_sample = {"phone": "19166010930", "city": "Yuba City", "state": "CA", "website": "https://www.familyLovedGoldenRetrievers.com"}
    web_sample = {"owner": "Toni Roy", "email": "toniroy40@gmail.com", "amz_cat": "Selling pet toys", "amz_link": "https://amzn.to/3YLHiQE"}
    merged = merge_lead_profile(lead_sample, fb_data=fb_sample, web_data=web_sample, index=1)
    print("Merged output:")
    import json
    print(json.dumps(merged, indent=2, ensure_ascii=False))
