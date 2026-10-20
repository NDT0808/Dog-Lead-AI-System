import json
import re

v_path = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System\data\lead_us_funnel_2026_20.json"
crm_js_path = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System\web_dashboard\assets\crm_data.js"

with open(v_path, "r", encoding="utf-8") as f:
    v_leads = json.load(f)

with open(crm_js_path, "r", encoding="utf-8") as f:
    crm_text = f.read()

m = re.search(r"window\.CRM_ENRICHED_DATA\s*=\s*(\[[\s\S]*\]);", crm_text)
old_leads = []
if m:
    try:
        old_leads = json.loads(m.group(1))
    except Exception as e:
        print("Error parsing old leads:", e)

v_urls = {l.get("url") for l in v_leads if l.get("url")}
filtered_old = [l for l in old_leads if l.get("url") not in v_urls]

merged = []
idx = 1
for l in v_leads:
    l["stt"] = f"LEAD-US-{idx:06d}"
    merged.append(l)
    idx += 1

for l in filtered_old:
    l["stt"] = f"LEAD-US-{idx:06d}"
    merged.append(l)
    idx += 1

out_text = f"window.CRM_ENRICHED_DATA = {json.dumps(merged, ensure_ascii=False, indent=2)};\n"
with open(crm_js_path, "w", encoding="utf-8") as f:
    f.write(out_text)

# Also copy to fb_following_scraper assets
fb_following_crm = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System\fb_following_scraper\assets\crm_data.js"
try:
    with open(fb_following_crm, "w", encoding="utf-8") as f:
        f.write(out_text)
except Exception:
    pass

print(f"Successfully merged {len(merged)} leads into crm_data.js!")
