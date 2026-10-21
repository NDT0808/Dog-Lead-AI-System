import json
import os
import re
import shutil
import pandas as pd
from collections import Counter

JSON_TARGET = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System\leads_us_master_webchecked_v2_21_10.json"
JSON_BACKUP = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System\leads_us_master_webchecked_v2_21_10.json.bak"
DATASETS_DIR = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Datasets"

print("================================================================================")
print("BẮT ĐẦU QUY TRÌNH CHẤM ĐIỂM TOÀN DIỆN LEADS_US_MASTER_WEBCHECKED_V2_21_10.JSON")
print("Chuẩn mực: pet-potty-toys-lead-finder (Thuật toán 5 trục chống bão hòa)")
print("================================================================================")

# 0. Backup
if not os.path.exists(JSON_BACKUP):
    print(f"[*] Đang tạo bản sao lưu: {JSON_BACKUP}...")
    shutil.copy2(JSON_TARGET, JSON_BACKUP)
    print(f"[✓] Đã tạo bản sao lưu thành công!")
else:
    print(f"[*] Bản sao lưu đã tồn tại: {JSON_BACKUP}")

def clean_u(u):
    if not u or pd.isna(u): return ''
    s = str(u).lower().strip().rstrip('/')
    s = re.sub(r'^https?://', '', s)
    s = re.sub(r'^www\.', '', s)
    return s

def clean_p(p):
    if not p or pd.isna(p): return ''
    s = re.sub(r'[^\d]', '', str(p).strip())
    if s.startswith('1') and len(s) == 11:
        s = s[1:]
    return s

def clean_n(n):
    if not n or pd.isna(n): return ''
    return str(n).lower().strip()

# 1. Negative patterns
NEGATIVE_PATTERNS = [
    r'\b(akc|american\s*kennel\s*club|ukc|westminster|fci|canadian\s*kennel\s*club|the\s*kennel\s*club|national\s*purebred|breed\s*club|club\s*of\s*america|\w+\s*club|dog\s*club|kennel\s*club|foundation\s*of\s*america|humane\s*society\s*of\s*the\s*united\s*states|american\s*bully\s*kennel\s*club|abkc)\b',
    r'\b(petsmart|petco|chewy|pet\s*supplies\s*plus)\b',
    r'\b(weratedogs|dogster|dogs\s*naturally|magazine|news|the\s*dodo|things\s*dog\s*handlers\s*say|pure\s*dog\s*talk|dogs\s*of\s*instagram|canadian\s*dog\s*fancier|american\s*dog\s*fancier|dog\s*news)\b',
    r'\b(embark|zoetis|revival\s*animal|fear\s*free|orivet|veterinary\s*imaging|genetic|vet\s*hospital|animal\s*hospital)\b',
    r'\b(roofing|bee\s*co|beekeeping|tires|pizza|plumbing|solar|motors|automotive|tattoo|construction|bail\s*bonds|security\s*services|landscaping|pest\s*control|cleaning\s*services)\b',
    r'^(facebook\s*user|deleted\s*account|user\s*\d+)$'
]

# 2. Breed Keywords
HIGH_VALUE_BREEDS = [
    'french bulldog', 'frenchie', 'frenchies', 'bulldog', 'bulldogs', 'goldendoodle', 
    'bernedoodle', 'cavapoo', 'aussiedoodle', 'labradoodle', 'doodle', 'doodles', 
    'poodle', 'poodles', 'corgi', 'corgis', 'malinois', 'shepherd', 'shepherds', 
    'retriever', 'retrievers', 'labrador', 'labradors', 'golden', 'goldens', 
    'rottweiler', 'rottweilers', 'bully', 'bullies', 'cane corso', 'great dane', 
    'bernese', 'dachshund', 'dachshunds', 'yorkie', 'yorkies', 'maltese', 
    'shih tzu', 'pomeranian', 'chihuahua', 'cavalier', 'mastiff', 'mastiffs',
    'creams', 'basset', 'hound', 'husky', 'boxer', 'aussie'
]

BREEDER_KW = [
    'kennel', 'kennels', 'puppy', 'puppies', 'breeder', 'breeders', 'breeding', 'doodle', 'doodles', 
    'frenchie', 'frenchies', 'bulldog', 'bulldogs', 'hound', 'hounds', 'bassets', 'farm', 
    'farms', 'haus', 'retriever', 'retrievers', 'shepherd', 'shepherds', 'corgi', 'corgis', 'pom', 
    'pomeranian', 'bullies', 'bully', 'poodle', 'poodles', 'collie', 'spaniel', 'spaniels', 
    'mastiff', 'mastiffs', 'aussie', 'aussies', 'malinois', 'dachshund', 'dachshunds', 
    'rottweiler', 'rottweilers', 'golden retriever', 'french bulldog', 'dane', 'terrier', 'terriers', 
    'labrador', 'labradors', 'bernese', 'creams', 'ranch', 'ranches', 'valley', 'creek', 
    'yorkie', 'yorkies', 'maltese', 'chihuahua', 'shih tzu', 'boxer', 'husky', 'huskies', 
    'pyrenees', 'bichon', 'havanese', 'cavalier', 'setter', 'weimaraner', 'vizsla', 'corso', 
    'canine', 'canines', 'k9s', 'dog breeding'
]

TRAINING_KW = [
    'training', 'trainer', 'trainers', 'academy', 'k9', 'daycare', 'boarding', 'grooming', 
    'groomer', 'groomers', 'dog spa', 'resort', 'canine educator', 'dog school', 'k-9',
    'canine training', 'board & train', 'canine center'
]

RESCUE_KW = [
    'rescue', 'shelter', 'sanctuary', 'adoption', 'animal rescue', 'stray', 'humane', 
    'spca', 'aspca', 'foster', 'animal care & control', 'saving pets'
]

PET_LOVER_PATTERNS = [
    r'\bthe\s*dog\b', r'\bthe\s*pug\b', r'\bthe\s*frenchie\b', r'\bthe\s*bulldog\b',
    r'therapy\s*dog', r'adventures\s*of', r'life\s*with', r'daily\s*dose',
    r'dog\s*mom', r'dog\s*dad', r'puppy\s*love'
]

GENERIC_EMAILS = {'info', 'sales', 'contact', 'support', 'hello', 'admin', 'office', 'puppies', 'breeder', 'intake', 'help', 'mail', 'service', 'inquiry', 'adopt', 'rescue', 'team', 'staff', 'billing'}

def extract_owner_from_email(email):
    if not email or '@' not in email: return ''
    prefix = email.split('@')[0].strip().lower()
    prefix = re.sub(r'\d+$', '', prefix)
    if prefix in GENERIC_EMAILS or len(prefix) < 3: return ''
    if '.' in prefix or '_' in prefix:
        parts = re.split(r'[._]', prefix)
        if len(parts) == 2 and all(len(p) >= 2 for p in parts) and parts[0] not in GENERIC_EMAILS:
            return f"{parts[0].capitalize()} {parts[1].capitalize()}"
    return ''

def extract_owner_from_name(name):
    if not name: return ''
    m = re.search(r'[-–]\s*([A-Z][a-z]{2,15}\s+[A-Z][a-z]{2,18})$', name)
    if m: return m.group(1).strip()
    m2 = re.match(r'^([A-Z][a-z]{2,12})\'s\s+', name)
    if m2:
        cand = m2.group(1)
        if cand.lower() not in ['dog', 'puppy', 'pet', 'king', 'queen', 'nature', 'god', 'all']:
            return cand
    return ''

print("[*] Nạp từ điển bổ trợ từ Datasets...")

# 1. Amazon Lookup
amz_lookup = {}
prio_p = os.path.join(DATASETS_DIR, "priority_list_2026-10-06_v2.xlsx")
if os.path.exists(prio_p):
    df_p = pd.read_excel(prio_p)
    for _, r in df_p.iterrows():
        acat = str(r.get('Phân loại Amazon', '')).strip()
        alink = str(r.get('Amazon Link', '')).strip()
        if acat and acat != 'Amazon link not found' and acat != 'nan':
            item = {'amz_cat': acat, 'amz_link': alink}
            if pd.notna(r.get('Website')): amz_lookup[clean_u(r['Website'])] = item
            if pd.notna(r.get('Breeder Name')): amz_lookup[clean_n(r['Breeder Name'])] = item
            if pd.notna(r.get('Phone')): amz_lookup[clean_p(r['Phone'])] = item

fbfs2_p = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System\FB-FS-2\data\leads.json"
if os.path.exists(fbfs2_p):
    fbfs2 = json.load(open(fbfs2_p, encoding='utf-8'))
    for l in fbfs2:
        acat = str(l.get('amz_cat', '')).strip()
        alink = str(l.get('amz_link', '')).strip()
        if acat and acat != 'Amazon link not found':
            item = {'amz_cat': acat, 'amz_link': alink}
            if l.get('website'): amz_lookup[clean_u(l['website'])] = item
            if l.get('name'): amz_lookup[clean_n(l['name'])] = item
            if l.get('phone'): amz_lookup[clean_p(l['phone'])] = item

# 2. Owner Lookup
owner_lookup = {}
if os.path.exists(fbfs2_p):
    for l in fbfs2:
        ow = str(l.get('owner', '')).strip()
        if ow and 'Breeder Owner' not in ow and 'Chủ trại' not in ow and 'Huấn luyện' not in ow and 'Giám đốc' not in ow:
            if l.get('website'): owner_lookup[clean_u(l['website'])] = ow
            if l.get('name'): owner_lookup[clean_n(l['name'])] = ow
            if l.get('phone'): owner_lookup[clean_p(l['phone'])] = ow

cust_p = os.path.join(DATASETS_DIR, "Customers_Sales_2026.xlsx")
if os.path.exists(cust_p):
    df_c = pd.read_excel(cust_p)
    for _, r in df_c.iterrows():
        ow = str(r.get('Tên Chủ Sở Hữu / Owner', '')).strip()
        if ow and ow != 'nan' and 'Breeder Owner' not in ow:
            if pd.notna(r.get('Website')): owner_lookup[clean_u(r['Website'])] = ow
            if pd.notna(r.get('Tên Đối Tác / Breeder Name')): owner_lookup[clean_n(r['Tên Đối Tác / Breeder Name'])] = ow
            if pd.notna(r.get('Điện Thoại / Phone')): owner_lookup[clean_p(r['Điện Thoại / Phone'])] = ow

# 3. Recency Lookup
recency_lookup = {}
fbpub_p = os.path.join(DATASETS_DIR, "FB_PublishTime_1791866762111.csv")
if not os.path.exists(fbpub_p):
    fbpub_p = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\FB_PublishTime_1791866762111.csv"
if os.path.exists(fbpub_p):
    import csv
    with open(fbpub_p, 'r', encoding='utf-8', errors='ignore') as f:
        reader = csv.reader(f)
        next(reader, None)
        for r in reader:
            if len(r) >= 6:
                u, n, rel = clean_u(r[1]), clean_n(r[2]), r[5].strip()
                rel_l = rel.lower()
                if any(x in rel_l for x in ['phút', 'vừa xong', '1 giờ', '2 giờ', '3 giờ']):
                    score = 35
                elif any(f'{h} giờ' in rel_l for h in range(4, 25)):
                    score = 32
                elif any(x in rel_l for x in ['1 ngày', '2 ngày', '3 ngày']):
                    score = 28
                elif any(f'{d} ngày' in rel_l for d in range(4, 8)) or ('1 tuần' in rel_l):
                    score = 20
                elif any(f'{d} ngày' in rel_l for d in range(8, 15)) or ('2 tuần' in rel_l):
                    score = 15
                elif any(f'{d} ngày' in rel_l for d in range(15, 31)) or ('1 tháng' in rel_l):
                    score = 8
                else:
                    score = 0
                if u: recency_lookup[u] = score
                if n: recency_lookup[n] = score

# 4. Master Flags & Breeds
master_flags = {}
m_p = os.path.join(DATASETS_DIR, "2026_10_02_v1_master.csv")
if os.path.exists(m_p):
    df_m = pd.read_csv(m_p, low_memory=False)
    for _, r in df_m.iterrows():
        bname = clean_n(r.get('name'))
        web = clean_u(r.get('websites'))
        ph = clean_p(r.get('phones'))
        has_page = str(r.get('has_puppy_sales_page', '')).lower() in ['yes', 'true', '1']
        has_app = str(r.get('has_puppy_application', '')).lower() in ['yes', 'true', '1']
        has_kit = str(r.get('provides_puppy_take_home_kit', '')).lower() in ['yes', 'true', '1']
        breeds = str(r.get('dog_breeds', '')) if pd.notna(r.get('dog_breeds')) else ''
        item = {'has_page': has_page, 'has_app': has_app, 'has_kit': has_kit, 'breeds': breeds}
        if web: master_flags[web] = item
        if bname: master_flags[bname] = item
        if ph: master_flags[ph] = item

print(f"[✓] Đã nạp thành công các từ điển bổ trợ!")

# Load Target JSON
with open(JSON_TARGET, 'r', encoding='utf-8') as f:
    leads = json.load(f)

print(f"[*] Bắt đầu chấm điểm và tối ưu hóa 100% {len(leads)} bản ghi...")

for lead in leads:
    name = str(lead.get('name', '')).strip()
    name_l = name.lower()
    web = str(lead.get('website', '')).strip()
    web_c = clean_u(web)
    phone = str(lead.get('phone', '')).strip()
    phone_c = clean_p(phone)
    email = str(lead.get('email', '')).strip()
    email_l = email.lower()
    url = str(lead.get('url', '')).strip()
    url_c = clean_u(url)
    owner = str(lead.get('owner', '')).strip()
    fbid = str(lead.get('fb_id', '')).strip()

    # Backfill fb_id from URL if missing
    if not fbid:
        m_fbid = re.search(r'[?&]id=(\d{6,})', url) or re.search(r'/people/[^/]+/(\d{6,})', url) or re.search(r'facebook\.com/(\d{8,})', url)
        if m_fbid:
            lead['fb_id'] = m_fbid.group(1)

    # 1. Negative Filter
    is_excluded = False
    for pat in NEGATIVE_PATTERNS:
        if re.search(pat, name_l) or re.search(pat, web_c) or re.search(pat, url_c):
            is_excluded = True
            break
            
    if is_excluded:
        lead['score'] = 15
        lead['rank_tier'] = 'Tier D'
        lead['is_prio'] = False
        lead['cat'] = 'Excluded / Non-Target Organization'
        lead['cat_code'] = 'excluded'
        lead['sales_action'] = '❄️ ĐÓNG BĂNG: Tổ chức phi khách hàng / Không phân bổ ngân sách bán hàng'
        lead['product_fit'] = 'Không áp dụng'
        continue

    # Cross-reference Amazon
    amz_info = amz_lookup.get(web_c) or amz_lookup.get(clean_n(name)) or amz_lookup.get(phone_c)
    if amz_info:
        lead['amz_cat'] = amz_info['amz_cat']
        lead['amz_link'] = amz_info['amz_link']
    elif not lead.get('amz_cat'):
        lead['amz_cat'] = 'Amazon link not found'

    # Master flags
    m_info = master_flags.get(web_c) or master_flags.get(clean_n(name)) or master_flags.get(phone_c) or {}

    # Owner enrichment
    if not owner or 'Breeder Owner' in owner or 'Chủ trại' in owner or 'Huấn luyện' in owner or 'Giám đốc' in owner:
        known_owner = owner_lookup.get(web_c) or owner_lookup.get(clean_n(name)) or owner_lookup.get(phone_c)
        if known_owner:
            owner = known_owner
        else:
            email_owner = extract_owner_from_email(email)
            if email_owner:
                owner = email_owner
            else:
                name_owner = extract_owner_from_name(name)
                if name_owner:
                    owner = name_owner

    full_text = f"{name_l} {web_c} {email_l} {m_info.get('breeds', '').lower()} {str(lead.get('address', '')).lower()}"

    # 2. ICP Categorization (Trục 2: 10 - 30đ)
    is_rescue = any(k in full_text for k in RESCUE_KW)
    is_training = any(k in full_text for k in TRAINING_KW)
    is_breeder = any(k in full_text for k in BREEDER_KW) or m_info.get('has_page') or m_info.get('has_kit')
    is_pet_lover = any(re.search(p, full_text) for p in PET_LOVER_PATTERNS)

    if is_rescue:
        cat = 'Pet Rescue / Shelter (B2B)'
        cat_code = 'rescue'
        icp_score = 15
        prod_fit = 'Tã lót Pee Pad thấm hút số lượng lớn + Khay vệ sinh tái sử dụng'
        if not owner: owner = 'Giám đốc Tiếp nhận / Điều phối Cứu trợ (Shelter Intake Director)'
    elif is_training:
        cat = 'Pet Training / K9 Academy / Grooming (B2B)'
        cat_code = 'service'
        icp_score = 22
        prod_fit = 'Cỏ nhân tạo lót sân chơi chịu lực + Đồ chơi cắn K9 chuyên dụng'
        if not owner: owner = 'Huấn luyện viên trưởng / Quản lý cơ sở (Head Trainer / Facility Director)'
    elif is_breeder and not is_pet_lover:
        cat = 'Dog Breeder / Commercial Kennel (B2B)'
        cat_code = 'breeder'
        icp_score = 30
        prod_fit = 'Puppy Starter Kit V2/V3 (Cỏ thoát nước + Khay Potty + Đồ chơi in logo)'
        if not owner: owner = 'Chủ trại / Quản lý chuồng trại (Breeder Owner / Kennel Manager)'
    else:
        cat = 'Individual Pet Owner / Social Media Fan (B2C)'
        cat_code = 'b2c'
        icp_score = 10
        prod_fit = 'Khay vệ sinh căn hộ / Thảm cỏ ban công / Đồ chơi xoa dịu'
        if not owner: owner = 'Chủ trại / Quản lý chuồng trại (Breeder Owner / Kennel Manager)'

    lead['cat'] = cat
    lead['cat_code'] = cat_code
    lead['product_fit'] = prod_fit
    lead['owner'] = owner

    # 3. Breed Commercial Value (Trục 3: 0 - 15đ)
    breed_matches = [b for b in HIGH_VALUE_BREEDS if b in full_text]
    if len(breed_matches) >= 2:
        breed_score = 15
    elif len(breed_matches) == 1:
        breed_score = 10
    elif cat_code == 'breeder':
        breed_score = 5
    else:
        breed_score = 0

    # 4. Business Infrastructure (Trục 4: 0 - 10đ)
    has_web = bool(web and not any(x in web_c for x in ['facebook.com', 'instagram.com']))
    has_infra = m_info.get('has_app') or any(k in full_text for k in ['llc', 'inc', 'kennel', 'farm', 'ranch', 'academy', 'ltd']) or (phone and email)
    infra_score = (5 if has_web else 0) + (5 if has_infra else 0)

    # 5. Amazon Credibility (Trục 5: 0 - 15đ)
    amz_cat_val = lead.get('amz_cat', '')
    if 'Selling pet toys + Artificial grass' in amz_cat_val:
        amz_score = 15
    elif 'Selling artificial grass' in amz_cat_val:
        amz_score = 10
    elif 'Selling pet toys' in amz_cat_val:
        amz_score = 7
    elif 'target sales' in amz_cat_val:
        amz_score = 3
    else:
        amz_score = 0

    # 6. Recency (Trục 1: 0 - 35đ)
    rec_val = recency_lookup.get(url_c) or recency_lookup.get(web_c) or recency_lookup.get(clean_n(name))
    if rec_val is not None:
        recency_score = rec_val
    else:
        if has_web and phone and email:
            recency_score = 28
        elif has_web and (phone or email):
            recency_score = 25
        elif has_web:
            recency_score = 20
        elif phone or email:
            recency_score = 15
        else:
            recency_score = 5

    total_score = min(100, recency_score + icp_score + breed_score + infra_score + amz_score)
    lead['score'] = total_score

    # 7. Tier & Sales Action
    if cat_code == 'b2c':
        lead['rank_tier'] = 'B2C'
        lead['is_prio'] = False
        lead['sales_action'] = '🛑 CẤM TELESALE: Đưa vào tệp remarketing quảng cáo Facebook/TikTok bán lẻ'
    else:
        if total_score >= 85:
            lead['rank_tier'] = 'Tier S'
            lead['is_prio'] = True
            lead['sales_action'] = '🔥 TELESALE: Gọi chốt Take-Home Kit in logo độc quyền ngay trong ngày'
        elif total_score >= 70:
            lead['rank_tier'] = 'Tier A'
            lead['is_prio'] = False
            lead['sales_action'] = '📞 TELESALE + EMAIL: Ưu tiên gọi trong ngày + Email cá nhân hóa chào Puppy Kit V2/V3'
        elif total_score >= 61:
            lead['rank_tier'] = 'Tier B'
            lead['is_prio'] = False
            lead['sales_action'] = '📞 TELESALE + EMAIL: Báo giá sỉ Starter Kit & Chiết khấu BOM cho trại'
        elif total_score >= 50:
            lead['rank_tier'] = 'Tier B'
            lead['is_prio'] = False
            lead['sales_action'] = '✉️ EMAIL TỰ ĐỘNG: Đưa vào chuỗi email nuôi dưỡng, gửi catalog sản phẩm'
        elif total_score >= 30:
            lead['rank_tier'] = 'Tier C'
            lead['is_prio'] = False
            lead['sales_action'] = '💬 SOCIAL DM: Nhắn tin trực tiếp Fanpage/Instagram chi phí thấp'
        else:
            lead['rank_tier'] = 'Tier D'
            lead['is_prio'] = False
            lead['sales_action'] = '❄️ ĐÓNG BĂNG: Tạm thời lưu trữ, không phân bổ ngân sách bán hàng'

# Save back to JSON
print(f"[*] Đang ghi dữ liệu đã chấm điểm hoàn tất vào: {JSON_TARGET}...")
with open(JSON_TARGET, 'w', encoding='utf-8') as f:
    json.dump(leads, f, ensure_ascii=False, indent=2)

print("================================================================================")
print("[✓] CHẤM ĐIỂM & LÀM GIÀU THÀNH CÔNG 100% TỆP LEADS!")
print("================================================================================")
tier_counts = Counter(l['rank_tier'] for l in leads)
cat_counts = Counter(l['cat'] for l in leads)
prio_count = sum(1 for l in leads if l['is_prio'])
reachable = sum(1 for l in leads if l.get('phone') or l.get('email'))
print(f"- Tổng số bản ghi đã chấm: {len(leads)}")
print(f"- Phân tầng Rank Tier: {dict(tier_counts)}")
print(f"- Phân loại Category: {dict(cat_counts)}")
print(f"- Khách hàng ưu tiên cao nhất (Tier S Hot Leads): {prio_count} ({prio_count/len(leads)*100:.2f}%)")
print(f"- Khách hàng có thể tiếp cận trực tiếp (Phone/Email): {reachable} ({reachable/len(leads)*100:.1f}%)")
print(f"- Điểm số trung bình: {sum(l['score'] for l in leads)/len(leads):.1f} (Min: {min(l['score'] for l in leads)}, Max: {max(l['score'] for l in leads)})")
