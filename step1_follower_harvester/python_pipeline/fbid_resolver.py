import re
import requests

HEADERS_EXT = {
    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Accept-Language': 'en-US,en;q=0.9',
}

HEADERS_BROWSER = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
}

FBID_CACHE = {}

def extract_fbid_from_url_or_photo(url):
    """
    Trích xuất FB_ID số từ URL liên kết hoặc tham số ảnh (không bóc tách từ tên tệp CDN ngẫu nhiên).
    """
    if not url:
        return ""
        
    url_str = str(url).strip()
    
    # Check set=pb.<ID> or set=a.<ID> or set=ecnf.<ID> (as in photo links: set=pb.61595259362718.-2207520000)
    m_set = re.search(r'set=(?:pb|a|ecnf|pcb)\.(\d{8,})', url_str)
    if m_set:
        return m_set.group(1)
    
    # Check direct id parameter (e.g. ?id=100087542196018)
    m_id = re.search(r'[?&]id=(\d{8,})', url_str)
    if m_id:
        return m_id.group(1)
        
    m_prof = re.search(r'profile\.php\?id=(\d{8,})', url_str)
    if m_prof:
        return m_prof.group(1)
        
    m_people = re.search(r'facebook\.com/people/[^/]+/(\d{8,})', url_str)
    if m_people:
        return m_people.group(1)
        
    m_num = re.search(r'facebook\.com/(\d{10,})/?(?:\?|$)', url_str)
    if m_num:
        return m_num.group(1)
        
    # Check fb:// deep links
    m_fb = re.search(r'fb://(?:profile|page)/(\d{8,})', url_str)
    if m_fb:
        return m_fb.group(1)
        
    return ""

def resolve_fbid_from_network(fb_url, timeout=6):
    """
    Truy vấn trực tiếp trang Facebook (SSR HTML) để bóc tách 100% ID số thực tế.
    Facebook nhúng ID số thực tế trong:
    1. <meta property="al:android:url" content="fb://page/<ID>" />
    2. fb://page/<ID> hoặc fb://profile/<ID>
    3. "page_id":"<ID>", "entity_id":"<ID>", "userID":"<ID>"
    4. Link ảnh trong bài/album: set=pb.<ID>.-2207520000
    """
    if not fb_url or not str(fb_url).startswith('http'):
        return ""
    
    # Normalize URL: remove subpaths like /followers, /following, /about, /photos
    clean_url = re.sub(r'/(?:followers|following|about|photos|reviews)/?$', '', str(fb_url).split('?')[0]).rstrip('/')
    if not clean_url or clean_url in ['https://www.facebook.com', 'http://www.facebook.com', 'https://facebook.com']:
        return ""
        
    if clean_url in FBID_CACHE:
        return FBID_CACHE[clean_url]
    
    # Try browser agent with Sec-Fetch headers to get full SSR HTML
    try:
        r = requests.get(clean_url, headers=HEADERS_BROWSER, timeout=timeout, allow_redirects=True)
        if r.status_code == 200 and r.text:
            fbid = _find_fbid_in_html(r.text)
            if fbid:
                FBID_CACHE[clean_url] = fbid
                return fbid
    except Exception:
        pass

    # Try external hit agent as fallback
    try:
        r = requests.get(clean_url, headers=HEADERS_EXT, timeout=timeout, allow_redirects=True)
        if r.status_code == 200 and r.text:
            fbid = _find_fbid_in_html(r.text)
            if fbid:
                FBID_CACHE[clean_url] = fbid
                return fbid
    except Exception:
        pass

    return ""

def _find_fbid_in_html(html_text):
    if not html_text:
        return ""
        
    # 1. Android / iOS deep link meta tags: fb://page/<ID> or fb://profile/<ID>
    m_meta = re.search(r'<meta[^>]+content=["\']fb://(?:page|profile)/(\d{8,})["\']', html_text, re.I)
    if m_meta:
        return m_meta.group(1)
        
    m_uri = re.search(r'fb://(?:profile|page)/(\d{8,})', html_text)
    if m_uri:
        return m_uri.group(1)

    # 2. JSON structured data: page_id, entity_id, userID, delegate_page_id, target_id
    for m in re.finditer(r'"(?:page_id|entity_id|userID|delegate_page_id|target_id)"\s*:\s*"?(\d{8,})"?', html_text):
        val = m.group(1)
        if val and val != "0" and len(val) >= 8:
            return val

    # 3. Photo album set parameters: set=pb.<ID>.-2207520000 or set=a.<ID>
    m_set = re.search(r'set=(?:pb|a|ecnf|pcb)\.(\d{8,})', html_text)
    if m_set:
        return m_set.group(1)
        
    # 4. Profile ID parameter inside internal scripts
    m_prof_script = re.search(r'[?&]id=(\d{8,})', html_text)
    if m_prof_script:
        return m_prof_script.group(1)
        
    return ""

def resolve_numeric_fbid(url_or_photo):
    """
    Hàm giải quyết 100% FB_ID số:
    - Nếu đã là số nguyên >= 8 chữ số: trả về luôn.
    - Nếu chứa ID trong URL (set=pb., ?id=, profile.php?id=, ...): bóc tách ngay.
    - Nếu là vanity URL (như house.of.dixon): tự động truy vấn mạng để lấy ID số chính thức.
    """
    if not url_or_photo:
        return ""
    val = str(url_or_photo).strip()
    if val.isdigit() and len(val) >= 8:
        return val
        
    fbid = extract_fbid_from_url_or_photo(val)
    if fbid:
        return fbid
        
    return resolve_fbid_from_network(val)

if __name__ == '__main__':
    test_urls = [
        'https://www.facebook.com/Nemay24',
        'https://www.facebook.com/photo/?fbid=1103003569294373&set=pb.100087542196018.-2207520000',
        'https://www.facebook.com/photo/?fbid=122105180361508645&set=pb.61595259362718.-2207520000',
        'https://www.facebook.com/house.of.dixon',
        'https://www.facebook.com/knockandbark',
        'https://www.facebook.com/silvanoadestrador',
        'https://www.facebook.com/goodbreedercenter'
    ]
    for u in test_urls:
        print(f"{u} => {resolve_numeric_fbid(u)}")
