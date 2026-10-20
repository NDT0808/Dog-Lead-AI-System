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

def extract_fbid_from_url_or_photo(url):
    if not url:
        return ""
    # Check set=pb.<ID> or set=a.<ID> or set=ecnf.<ID> (as in photo links: set=pb.100081804938692.-2207520000)
    m_set = re.search(r'set=(?:pb|a|ecnf|pcb)\.(\d{8,})', url)
    if m_set:
        return m_set.group(1)
    
    # Check direct id parameter
    m_id = re.search(r'[?&]id=(\d{8,})', url)
    if m_id:
        return m_id.group(1)
        
    m_prof = re.search(r'profile\.php\?id=(\d{8,})', url)
    if m_prof:
        return m_prof.group(1)
        
    m_people = re.search(r'facebook\.com/people/[^/]+/(\d{8,})', url)
    if m_people:
        return m_people.group(1)
        
    m_num = re.search(r'facebook\.com/(\d{10,})/?(?:\?|$)', url)
    if m_num:
        return m_num.group(1)
        
    # Check Facebook CDN avatar filenames: <photo_id>_<id>_<hash>_n.jpg
    m_cdn = re.search(r'fbcdn\.net/.*?/\d+_(\d{10,20})_\d+_n\.jpg', url)
    if m_cdn:
        return m_cdn.group(1)
        
    return ""

def resolve_fbid_from_network(fb_url, timeout=6):
    if not fb_url or not str(fb_url).startswith('http'):
        return ""
    
    # Clean trailing slashes or subpaths like /followers
    clean_url = re.sub(r'/(?:followers|following|about|photos)/?$', '', fb_url.split('?')[0])
    
    # Try full browser agent with Sec-Fetch headers to get SSR HTML
    try:
        r = requests.get(clean_url, headers=HEADERS_BROWSER, timeout=timeout, allow_redirects=True)
        if r.status_code == 200 and r.text:
            m = re.search(r'fb://(?:profile|page)/(\d{8,})', r.text)
            if m:
                return m.group(1)
            m = re.search(r'"(?:entity_id|page_id|userID|delegate_page_id|target_id)"\s*:\s*"?(\d{8,})"?', r.text)
            if m:
                return m.group(1)
            m = re.search(r'set=(?:pb|a|ecnf|pcb)\.(\d{8,})', r.text)
            if m:
                return m.group(1)
    except Exception:
        pass

    # Try external hit agent as fallback
    try:
        r = requests.get(clean_url, headers=HEADERS_EXT, timeout=timeout, allow_redirects=True)
        if r.status_code == 200 and r.text:
            m = re.search(r'fb://(?:profile|page)/(\d{8,})', r.text)
            if m:
                return m.group(1)
            m = re.search(r'"(?:entity_id|page_id|userID|delegate_page_id|target_id)"\s*:\s*"?(\d{8,})"?', r.text)
            if m:
                return m.group(1)
            m = re.search(r'set=(?:pb|a|ecnf|pcb)\.(\d{8,})', r.text)
            if m:
                return m.group(1)
    except Exception:
        pass

    return ""

def resolve_numeric_fbid(url_or_photo):
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
        'https://www.facebook.com/house.of.dixon',
        'https://www.facebook.com/knockandbark',
        'https://www.facebook.com/silvanoadestrador',
        'https://www.facebook.com/goodbreedercenter'
    ]
    for u in test_urls:
        print(f"{u} => {resolve_numeric_fbid(u)}")
