import re

US_STATES_MAP = {
    'nebraska': 'NE', 'texas': 'TX', 'california': 'CA', 'florida': 'FL', 'massachusetts': 'MA'
}

text = '''
• 名字 (Tên): Không có tên cá nhân cụ thể. (Do một gia đình cùng vận hành).
• 全名 (Họ và tên): Gia đình Janky (Janky family).
• 用户社交 (Mạng xã hội cá nhân): Không công khai tài khoản cá nhân.
• 工作职位 (Chức vụ/Vị trí công việc): Chủ trại nuôi / Nhà nhân giống chó (Breeder / Kennel Owner).
• 国家地址 (Quốc gia & Địa chỉ): 1515 Đường số 5, Chapman, Tiểu bang Nebraska, mã bưu chính 68827, Hoa Kỳ (1515 5th Rd. Chapman, NE 68827, USA).
• 行业 (Ngành nghề cá nhân): Nhân giống và cung cấp thú cưng.
• 添加日期 (Ngày thêm thông tin): 16/10/2026 (Ngày cập nhật dữ liệu hiện tại).
• 公司名称 (Tên công ty): Husker Doodles (Tên cũ trước đây là: Bernedoodle Kennels).
• 公司网址 (Website công ty): huskerdoodles.com
• 公司社交 (Mạng xã hội của công ty): Facebook: Husker Doodles Facebook, Instagram: @bernedoodlekennels
• 公司所属国家 (Quốc gia của công ty): Mỹ (United States).
• 州 (Bang): Nebraska (Viết tắt là NE).
• 城市 (Thành phố): Chapman.
• 公司所在行业 (Ngành nghề của công ty): Dịch vụ thú cưng, chuyên nhân giống dòng chó lai Bernedoodle (Dòng lai giữa chó núi Bernese và chó Poodle).
• 电话 (Điện thoại): Không công khai số điện thoại trực tiếp.
'''

data = {}

# Company Name
m_c = re.search(r'[•\-*]?\s*(?:公司名称|Tên công ty|Tên trại|Company Name)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
if m_c:
    raw_comp = m_c.group(1).strip()
    data['company_name'] = re.sub(r'\(.*?\)', '', raw_comp).strip('. \t\r\n')

# Owner: Check Full Name or Personal Name
m_fn = re.search(r'[•\-*]?\s*(?:全名|Họ và tên|Full Name)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
m_n = re.search(r'[•\-*]?\s*(?:名字|Tên|First Name)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)

fn_val = m_fn.group(1).strip() if m_fn else ''
n_val = m_n.group(1).strip() if m_n else ''

def is_valid_name(val):
    if not val: return False
    low = val.lower()
    return not any(x in low for x in ['không có', 'chưa rõ', 'none', 'n/a', 'không công khai', 'unknown'])

if is_valid_name(fn_val):
    data['owner'] = re.sub(r'\(.*?\)', '', fn_val).strip('. \t\r\n')
elif is_valid_name(n_val):
    data['owner'] = re.sub(r'\(.*?\)', '', n_val).strip('. \t\r\n')
elif data.get('company_name'):
    data['owner'] = data['company_name'] + ' (Chủ trại)'

# Website
m_w = re.search(r'[•\-*]?\s*(?:公司网址|Website công ty|Website|Link website)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
if m_w:
    w_cand = m_w.group(1).strip()
    m_url = re.search(r'https?://[^\s)\]]+', w_cand)
    if m_url:
        data['website'] = m_url.group(0).rstrip('.,;')
    else:
        m_dom = re.search(r'\b([a-zA-Z0-9-]+\.(?:com|org|net|us|co|biz|io|kennel|pet))\b', w_cand, re.IGNORECASE)
        if m_dom:
            data['website'] = 'https://' + m_dom.group(1)

# City & State
m_st = re.search(r'[•\-*]?\s*(?:州|Bang|State)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
if m_st:
    raw_st = m_st.group(1).strip()
    m_code = re.search(r'\b([A-Z]{2})\b', raw_st)
    if m_code:
        data['state'] = m_code.group(1)
    else:
        st_clean = re.sub(r'\(.*?\)', '', raw_st).strip('. \t\r\n')
        data['state'] = US_STATES_MAP.get(st_clean.lower(), st_clean)

m_ci = re.search(r'[•\-*]?\s*(?:城市|Thành phố|City)\s*\(?[^):]*\)?\s*[:：]\s*([^\n\r]+)', text, re.IGNORECASE)
if m_ci:
    data['city'] = re.sub(r'\(.*?\)', '', m_ci.group(1)).strip('. \t\r\n')

# Address & Zip
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

print('Extracted successfully:')
for k, v in data.items():
    print(f'  {k}: {v}')
