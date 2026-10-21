import os
import sys
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_DIR = os.path.dirname(os.path.dirname(SCRIPT_DIR))
sys.path.insert(0, SCRIPT_DIR)

from fbid_resolver import resolve_numeric_fbid

def process_item(item, idx, total):
    import re
    current_id = str(item.get('fb_id') or '').strip()
    url = item.get('url') or item.get('raw_url') or ''
    name = item.get('name') or ''
    
    is_vanity = bool(url and not re.search(r'[?&]id=\d{8,}', url) and not re.search(r'facebook\.com/(?:people/[^/]+/)?\d{10,}', url))
    need_resolve = (not current_id) or (not current_id.isdigit()) or (current_id.startswith('10008') and len(current_id) == 15) or (len(current_id) > 16) or is_vanity
    
    if not need_resolve and current_id.isdigit():
        return idx, current_id, 'ALREADY'
        
    # 1. Check url via network / SSR HTML
    resolved_id = resolve_numeric_fbid(url)
    # 2. Check photos / avatar with photo set params
    if not resolved_id:
        for p in item.get('photo_urls', []) + [item.get('avatar_url', '')]:
            if p and ('set=pb.' in p or 'set=a.' in p or 'fbid=' in p):
                resolved_id = resolve_numeric_fbid(p)
                if resolved_id:
                    break
                    
    if resolved_id:
        print(f"[{idx+1}/{total}] [✓ RESOLVED] {name} ({url}) -> {resolved_id}", flush=True)
        return idx, resolved_id, 'RESOLVED'
    else:
        print(f"[{idx+1}/{total}] [x NOT RESOLVED] {name} | {url}", flush=True)
        return idx, current_id, 'FAILED'

def resolve_file(filepath):
    if not os.path.exists(filepath):
        print(f"[!] File not found: {filepath}", flush=True)
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    total = len(data)
    print(f"[*] Processing: {filepath} ({total} items)...", flush=True)
    
    tasks = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        for i, item in enumerate(data):
            tasks.append(executor.submit(process_item, item, i, total))
            
        already = 0
        resolved = 0
        failed = 0
        for future in as_completed(tasks):
            idx, res_id, status = future.result()
            if status == 'ALREADY':
                already += 1
            elif status == 'RESOLVED':
                resolved += 1
                data[idx]['fb_id'] = res_id
            else:
                failed += 1
                
    # Save back
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        
    print(f"[✓] Completed {filepath}: Already Numeric: {already}, Newly Resolved: {resolved}, Failed: {failed}", flush=True)

if __name__ == '__main__':
    v_path = os.path.join(SYSTEM_DIR, "data", "verified_step1", "step1_verified_dogs_latest.json")
    resolve_file(v_path)
    
    # Update gallery data js
    with open(v_path, 'r', encoding='utf-8') as f:
        v_data = json.load(f)
        
    js_content = f"window.DOG_GALLERY_DATA = {json.dumps(v_data, ensure_ascii=False, indent=2)};"
    with open(os.path.join(SYSTEM_DIR, "web_dashboard", "assets", "gallery_data.js"), 'w', encoding='utf-8') as f:
        f.write(js_content)
    with open(os.path.join(SYSTEM_DIR, "step1_follower_harvester", "gallery", "assets", "gallery_data.js"), 'w', encoding='utf-8') as f:
        f.write(js_content)
    print("[✓] Updated web_dashboard/assets/gallery_data.js and step1_follower_harvester/gallery/assets/gallery_data.js", flush=True)
