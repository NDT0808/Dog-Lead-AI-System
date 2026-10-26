import os
import json
import glob
import re
import urllib.request

DATA_DIR = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System\data"
FB_FS2_DATA_DIR = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System\FB-FS-2\data"
SERVER_URL = "http://43.156.237.143:3007/api.php?route=save-crm"

def clean_fb_url(url):
    if not url:
        return ""
    u = str(url).strip()
    u = re.sub(r"[?&].*$", "", u)
    u = re.sub(r"/+$", "", u)
    return u.lower()

def compute_score(lead):
    # 5-Axis scoring
    score = 50 # baseline
    
    # 1. Recency
    pub = str(lead.get("publishTime") or lead.get("publish_time") or "").lower()
    if any(k in pub for k in ["hôm nay", "today", "vừa", "giờ", "hours", "mins", "phút"]):
        score += 35
    elif any(k in pub for k in ["1 ngày", "2 ngày", "3 ngày", "1 day", "2 days", "3 days"]):
        score += 28
    elif any(k in pub for k in ["4 ngày", "5 ngày", "6 ngày", "7 ngày", "week", "tuần"]):
        score += 20
    else:
        score += 15
        
    # 2. Infrastructure
    if lead.get("website"):
        score += 5
    if lead.get("phone") or lead.get("email"):
        score += 5
        
    # 3. Amazon
    amz = str(lead.get("amz_cat") or lead.get("amazon_channel") or "").lower()
    if "selling pet toys + artificial grass" in amz:
        score += 15
    elif "artificial grass" in amz or "pet toilets" in amz:
        score += 10
    elif "pet toys" in amz or "selling pet toys" in amz:
        score += 7
    elif lead.get("has_amazon") or lead.get("amazon_url"):
        score += 5
        
    score = min(100, max(25, score))
    return score

def get_tier(score):
    if score >= 85:
        return "Tier S"
    if score >= 70:
        return "Tier A"
    if score >= 50:
        return "Tier B"
    if score >= 30:
        return "Tier C"
    return "Tier D"

def main():
    print("=== BẮT ĐẦU GỘP DỮ LIỆU CÀO TOÀN DIỆN ===")
    
    # 1. Tải leads.json gốc
    master_file = os.path.join(DATA_DIR, "leads.json")
    leads_list = []
    if os.path.exists(master_file):
        with open(master_file, "r", encoding="utf-8", errors="ignore") as f:
            leads_list = json.load(f)
    print(f"[*] Dữ liệu gốc leads.json: {len(leads_list)} bản ghi")
    
    lead_map = {}
    
    # Nạp dữ liệu cũ vào map
    for l in leads_list:
        fbid = str(l.get("fb_id") or "").strip()
        url = clean_fb_url(l.get("url"))
        key = fbid if (fbid and fbid != "unresolved" and len(fbid) >= 8) else (url or l.get("stt"))
        if key:
            lead_map[key] = l

    # 2. Quét toàn bộ tệp mới cào LEAD_US_Meta_CRM_*.json
    crm_files = sorted(glob.glob(os.path.join(DATA_DIR, "LEAD_US_Meta_CRM_*.json")))
    print(f"[*] Tìm thấy {len(crm_files)} tệp CRM mới cào:")
    
    added_new = 0
    updated = 0
    
    for cfile in crm_files:
        fname = os.path.basename(cfile)
        try:
            with open(cfile, "r", encoding="utf-8", errors="ignore") as f:
                c_leads = json.load(f)
            print(f"   + Đọc {fname}: {len(c_leads)} hồ sơ")
            
            for cl in c_leads:
                fbid = str(cl.get("fb_id") or "").strip()
                url = clean_fb_url(cl.get("url"))
                key = fbid if (fbid and fbid != "unresolved" and len(fbid) >= 8) else url
                
                if not key:
                    continue
                    
                if key in lead_map:
                    # Cập nhật thông tin mới nhất
                    old = lead_map[key]
                    for k, v in cl.items():
                        if v and not old.get(k):
                            old[k] = v
                    updated += 1
                else:
                    # Thêm mới
                    sc = compute_score(cl)
                    cl["score"] = sc
                    cl["rank_tier"] = get_tier(sc)
                    cl["cat"] = cl.get("cat") or "Dog Breeder / Commercial Kennel (B2B)"
                    cl["cat_code"] = cl.get("cat_code") or "breeder"
                    cl["product_fit"] = cl.get("product_fit") or "Puppy Starter Kit V2/V3 (Cỏ thoát nước + Khay Potty + Đồ chơi in logo)"
                    cl["sales_action"] = cl.get("sales_action") or "🔥 TELESALE: Gọi chốt Take-Home Kit in logo độc quyền ngay trong ngày"
                    cl["country"] = "United States"
                    if not cl.get("avatar") and cl.get("avatar_url"):
                        cl["avatar"] = cl["avatar_url"]
                    if not cl.get("avatar_type"):
                        cl["avatar_type"] = "dog" if "dog" in str(cl.get("name","")).lower() else "person"
                    lead_map[key] = cl
                    added_new += 1
        except Exception as e:
            print(f"   [!] Lỗi đọc {fname}: {e}")

    # Chuẩn hóa danh sách cuối cùng
    merged = list(lead_map.values())
    
    # Sắp xếp theo điểm giảm dần
    merged.sort(key=lambda x: x.get("score") or 0, reverse=True)
    
    # Đánh số STT chuẩn LEAD-US-000001
    for idx, l in enumerate(merged, start=1):
        l["stt"] = f"LEAD-US-{idx:06d}"
        if not l.get("fb_id") or l.get("fb_id") == "unresolved":
            m = re.search(r"(\d{8,})", str(l.get("url") or ""))
            if m:
                l["fb_id"] = m.group(1)

    print(f"\n[✓] Tổng hợp hoàn tất:")
    print(f"   - Thêm mới hoàn toàn: {added_new} hồ sơ")
    print(f"   - Cập nhật thông tin: {updated} hồ sơ")
    print(f"   - Tổng danh mục Master CRM: {len(merged)} hồ sơ!")

    # 3. Ghi đè vào data/leads.json của cả 2 thư mục local
    print("\n[*] Ghi dữ liệu vào local data/leads.json...")
    with open(master_file, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
        
    fb_fs2_leads = os.path.join(FB_FS2_DATA_DIR, "leads.json")
    with open(fb_fs2_leads, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    print("   [✓] Đã lưu local thành công!")

    # 4. Đẩy trực tiếp lên Server 43.156.237.143:3007
    print(f"\n[*] Đang đẩy toàn bộ {len(merged)} hồ sơ lên Server ({SERVER_URL})...")
    payload = json.dumps({"leads": merged}, ensure_ascii=False).encode("utf-8")
    payload_mb = len(payload) / 1024 / 1024
    print(f"   - Kích thước payload: {payload_mb:.2f} MB")
    
    req = urllib.request.Request(
        SERVER_URL,
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            resp_body = resp.read().decode("utf-8")
            print(f"   [✓] Server phản hồi: {resp_body}")
    except Exception as e:
        print(f"   [X] Lỗi đẩy lên server: {e}")

if __name__ == "__main__":
    main()
