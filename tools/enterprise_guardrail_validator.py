#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Enterprise Guardrail Validator (v3.0.0-ENTERPRISE-GUARD)
PET_LEAD_AI_SYSTEM — Zero Regression Quality Assurance Tool

Validates CRM lead datasets against the 10 Hard Invariants and the 30-field strict CRM schema:
- ERR_01: Facebook URL normalization & redirect wrapper prevention
- ERR_02: 100% Numeric FB_ID enforcement
- ERR_05: 5-Tier Owner Name Waterfall enforcement (no null, empty, or 'N/A')
- ERR_06: Social URL filtering on website field
- ERR_07: Avatar HD preservation (no unavatar/placeholder letters)
- ERR_08: Valid Amazon Category classification
- ERR_09: 5-Axis Score range and Lead Temperature validity
- Strict Schema: All 31 non-null fields present and valid
"""

import sys
import os
import json
import re

SCHEMA_FIELDS = [
    "lead_id", "numeric_fb_id", "breeder_or_kennel_name", "owner_contact_name",
    "fb_profile_url_verified", "fb_link_status", "avatar_hd_url",
    "has_website", "official_website_url", "website_status",
    "business_email", "phone_us_format", "city", "state",
    "business_category", "detected_dog_breeds", "has_puppy_sales_page", "has_online_application",
    "last_post_publish_time", "days_since_last_post", "social_engagement_rate", "social_activity_status",
    "amazon_link_url", "amazon_category_label", "current_take_home_kit_status",
    "total_lead_score", "score_breakdown_5_axes", "customer_tier", "lead_temperature",
    "rag_recommended_product", "sales_next_action_script"
]

VALID_FB_REGEX = re.compile(r"^https://(www\.)?facebook\.com/(profile\.php\?id=\d+|[a-zA-Z0-9.\-_]+)/?$", re.IGNORECASE)

VALID_AMAZON_LABELS = {
    "Selling pet toys + Artificial grass/Pet toilets (TARGET)",
    "Selling artificial grass/pet toilets (TARGET)",
    "Selling pet toys",
    "There's an Amazon link, but no target sales.",
    "Amazon link not found"
}

VALID_TEMPERATURE_PATTERNS = [
    r"HOT", r"WARM", r"COOL", r"FROZEN"
]

def normalize_fb_url(url, numeric_id=""):
    """ERR_01: Normalize Facebook URL to canonical form, stripping tracking queries and redirect wrappers."""
    if not url:
        if numeric_id and re.match(r"^\d{8,}$", str(numeric_id)):
            return f"https://www.facebook.com/profile.php?id={numeric_id}"
        return ""
    
    s = str(url).strip()
    
    # Unwrap l.facebook.com redirect wrapper
    wrapper_match = re.search(r"[?&]u=([^&]+)", s)
    if "l.facebook.com" in s and wrapper_match:
        import urllib.parse
        s = urllib.parse.unquote(wrapper_match.group(1))
    
    # Strip query parameters (?mibextid, ?__cft__, ?ref, &set=)
    s = re.sub(r"\?[^#]*", "", s)
    s = s.rstrip("/")
    
    if numeric_id and re.match(r"^\d{8,}$", str(numeric_id)) and ("profile.php" in s or "/p/" in s):
        return f"https://www.facebook.com/profile.php?id={numeric_id}"
    
    return s + "/"

def validate_lead(lead, index=0):
    """Validate a single lead record against v3.0.0-ENTERPRISE-GUARD invariants."""
    errors = []
    warnings = []
    
    # 1. Field presence
    for f in SCHEMA_FIELDS:
        if f not in lead or lead[f] is None:
            # Map backward compatible aliases if present
            alt_f = None
            if f == "breeder_or_kennel_name" and ("name" in lead or "breeder_name" in lead):
                alt_f = lead.get("name") or lead.get("breeder_name")
            elif f == "numeric_fb_id" and "fb_id" in lead:
                alt_f = lead.get("fb_id")
            elif f == "fb_profile_url_verified" and "fb_profile" in lead:
                alt_f = lead.get("fb_profile")
            elif f == "avatar_hd_url" and "avatar_url" in lead:
                alt_f = lead.get("avatar_url")
            elif f == "official_website_url" and "website" in lead:
                alt_f = lead.get("website")
            elif f == "total_lead_score" and "score" in lead:
                alt_f = lead.get("score")
            
            if alt_f is not None:
                lead[f] = alt_f
            else:
                errors.append(f"Missing required field: '{f}'")
    
    # 2. ERR_01: Facebook URL redirect and format
    fb_url = lead.get("fb_profile_url_verified") or lead.get("fb_profile") or lead.get("url") or ""
    if "l.facebook.com" in fb_url:
        errors.append(f"ERR_01: Facebook URL contains redirect wrapper: '{fb_url}'")
    elif fb_url and not VALID_FB_REGEX.match(fb_url.split("?")[0]):
        errors.append(f"ERR_01: Invalid Facebook canonical URL format: '{fb_url}'")
    
    # 3. ERR_02: Numeric FB_ID
    fb_id = str(lead.get("numeric_fb_id") or lead.get("fb_id") or "").strip()
    if not fb_id or not re.match(r"^\d{8,}$", fb_id):
        errors.append(f"ERR_02: Missing or non-numeric FB_ID: '{fb_id}'")
        
    # 4. ERR_05: Owner contact name
    owner = str(lead.get("owner_contact_name") or lead.get("owner") or "").strip()
    if not owner or owner.lower() in {"unknown", "n/a", "none", "null"}:
        errors.append(f"ERR_05: Invalid owner_contact_name: '{owner}'. Must use fallback '[Page Name] (Breeder/Manager)'")
        
    # 5. ERR_06: Social URL filtering on website
    web = str(lead.get("official_website_url") or lead.get("website") or "").strip()
    if web and any(s in web.lower() for s in ["facebook.com", "instagram.com", "tiktok.com"]):
        errors.append(f"ERR_06: Social media URL used as official website: '{web}'")
        
    # 6. ERR_07: Avatar HD preservation
    avatar = str(lead.get("avatar_hd_url") or lead.get("avatar_url") or "").strip()
    if avatar and ("unavatar.io" in avatar or "placeholder" in avatar.lower()):
        errors.append(f"ERR_07: Avatar overwritten by placeholder: '{avatar}'")
        
    # 7. ERR_08: Amazon category label
    amz_cat = str(lead.get("amazon_category_label") or lead.get("amazon_category") or "").strip()
    if amz_cat and not any(valid.lower() in amz_cat.lower() for valid in VALID_AMAZON_LABELS):
        warnings.append(f"ERR_08: Amazon label '{amz_cat}' is not in standard 5 categories")
        
    # 8. ERR_09: Score and Lead Temperature
    score = lead.get("total_lead_score")
    if score is not None:
        try:
            score_num = float(score)
            if score_num < 0 or score_num > 100:
                errors.append(f"ERR_09: Score {score_num} out of range [0-100]")
        except (ValueError, TypeError):
            errors.append(f"ERR_09: Score '{score}' is not numeric")
            
    temp = str(lead.get("lead_temperature") or "").upper()
    if temp and not any(re.search(pat, temp) for pat in VALID_TEMPERATURE_PATTERNS):
        errors.append(f"ERR_09: Invalid lead_temperature label: '{temp}'")
        
    return errors, warnings

def validate_dataset(filepath):
    """Validate an entire JSON dataset file against v3.0.0-ENTERPRISE-GUARD."""
    print(f"\n{'='*75}")
    print(f"ENTERPRISE GUARDRAIL VALIDATION: {os.path.basename(filepath)}")
    print(f"Standard: PET_LEAD_AI_SYSTEM v3.0.0-ENTERPRISE-GUARD")
    print(f"{'='*75}")
    
    if not os.path.exists(filepath):
        print(f"[!] File not found: {filepath}")
        return False
        
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    leads = data if isinstance(data, list) else data.get("leads", [])
    total = len(leads)
    print(f"[*] Total leads to validate: {total}")
    
    all_errors = []
    all_warnings = []
    
    for idx, lead in enumerate(leads):
        errs, warns = validate_lead(lead, idx)
        if errs:
            all_errors.append((idx + 1, lead.get("numeric_fb_id") or lead.get("name") or idx, errs))
        if warns:
            all_warnings.append((idx + 1, lead.get("numeric_fb_id") or lead.get("name") or idx, warns))
            
    print(f"\n[+] Validation Summary:")
    print(f"    - Clean Leads: {total - len(all_errors)} / {total} ({(total - len(all_errors))/total*100:.1f}%)")
    print(f"    - Defective Leads: {len(all_errors)} / {total}")
    print(f"    - Warning Leads: {len(all_warnings)} / {total}")
    
    if all_errors:
        print(f"\n[-] Top Defects Found (Zero Regression Violations):")
        for stt, identifier, errs in all_errors[:10]:
            print(f"    Lead #{stt} [{identifier}]:")
            for e in errs:
                print(f"      ✖ {e}")
        return False
    else:
        print(f"\n[✓] ZERO REGRESSION VERIFIED: 100% of leads comply with v3.0.0-ENTERPRISE-GUARD!")
        return True

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\Pet_Lead_AI_System\FB-FS-2\data\leads.json"
    validate_dataset(target)
