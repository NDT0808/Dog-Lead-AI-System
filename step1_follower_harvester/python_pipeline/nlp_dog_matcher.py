#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Module: nlp_dog_matcher.py
Chức năng:
Mô hình NLP Semantic & Fuzzy Matching phân tích chuyên sâu tên doanh nghiệp, tiểu sử,
phụ đề và URL slug để nhận diện các giống chó, từ ghép lai giống (Designer Breeds),
từ lóng (Slang), và thuật ngữ B2B Breeder ngay cả khi không trùng khớp 100% chữ cái.
Ví dụ:
- 'Yorkshih Pupco' -> Yorkshih (Yorkshire / Shih Tzu 93%), Pupco (Pup/Puppy 100%) -> B2B Breeder (P=0.95)
- 'DoodleDenise' -> Doodle (100%)
- 'Pawsome Boutique' -> Pawsome / Dog Boutique
"""

import re
import unicodedata

try:
    from rapidfuzz import fuzz, process
except ImportError:
    fuzz = None
    process = None

# 1. CANONICAL B2B BREEDER & KENNEL TERMS (Trọng số B2B cao nhất)
B2B_BREEDER_TERMS = {
    'breeder', 'breeders', 'breeding', 'kennel', 'kennels',
    'puppy', 'puppies', 'pup', 'pups', 'pupco', 'pupper', 'puppers',
    'litter', 'litters', 'dam', 'dams', 'sire', 'sires', 'stud', 'studs',
    'pedigree', 'pedigrees', 'akc', 'ckc', 'fci', 'ukc',
    'trại chó', 'chó giống', 'phối giống', 'chó cảnh', 'cún con', 'chó con',
    'dog potty', 'pet potty', 'puppy pad', 'pee pad', 'pet grass', 'dog turf',
    'puppy kit', 'take-home kit', 'dog training', 'k9 training', 'dog boarding'
}

# 2. CANONICAL DOG BREEDS (250+ Giống chó chính thức & Designer Breeds)
CANONICAL_BREEDS = [
    # Bullies & Mastiffs
    'frenchie', 'frenchies', 'french bulldog', 'bulldog', 'bulldogs', 'english bulldog',
    'american bully', 'exotic bully', 'bully', 'bullies', 'pitbull', 'pitbulls', 'apbt',
    'cane corso', 'corso', 'mastiff', 'mastiffs', 'bullmastiff', 'tibetan mastiff', 'dogo', 'boxer', 'boxers',
    # Retrievers & Gun Dogs
    'golden retriever', 'golden retrievers', 'retriever', 'retrievers', 'goldens',
    'labrador retriever', 'labrador', 'labradors', 'lab', 'labs', 'flat coated retriever',
    'boykin spaniel', 'boykin', 'cocker spaniel', 'cocker', 'english cocker', 'springer spaniel',
    'spaniel', 'spaniels', 'cavalier king charles', 'cavalier', 'king charles',
    'pointer', 'german shorthaired pointer', 'gsp', 'vizsla', 'weimaraner', 'setter', 'irish setter',
    # Doodles & Poodles
    'poodle', 'poodles', 'toy poodle', 'miniature poodle', 'standard poodle',
    'doodle', 'doodles', 'goldendoodle', 'goldendoodles', 'labradoodle', 'bernedoodle', 'bernedoodles',
    'aussiedoodle', 'sheepadoodle', 'cavapoo', 'maltipoo', 'cockapoo', 'schnoodle', 'whoodle',
    # Herding & Working Breeds
    'corgi', 'corgis', 'pembroke', 'cardigan', 'welsh corgi',
    'german shepherd', 'german shepherds', 'shepherd', 'shepherds', 'gsd',
    'belgian malinois', 'malinois', 'dutch shepherd', 'australian shepherd', 'aussie', 'aussies',
    'border collie', 'collie', 'collies', 'shetland sheepdog', 'sheltie', 'australian cattle dog', 'blue heeler',
    # Spitz, Huskies & Northern Breeds
    'siberian husky', 'husky', 'huskies', 'alaskan malamute', 'malamute', 'samoyed',
    'pomsky', 'pomskies', 'pomeranian', 'pomeranians', 'pom', 'poms', 'spitz',
    'shiba inu', 'shiba', 'akita', 'chow chow', 'chow', 'shar pei',
    # Hounds & Scent Dogs
    'dachshund', 'dachshunds', 'doxie', 'doxies', 'miniature dachshund', 'wiener dog', 'teckel',
    'basset hound', 'basset', 'bassets', 'beagle', 'beagles', 'bloodhound', 'coonhound', 'rhodesian ridgeback',
    # Guard & Large Breeds
    'rottweiler', 'rottweilers', 'rottie', 'doberman', 'dobermann', 'great dane',
    'bernese mountain dog', 'bernese', 'great pyrenees', 'saint bernard', 'newfoundland',
    # Toy & Companion Breeds
    'shih tzu', 'shihtzu', 'pug', 'pugs', 'chihuahua', 'chihuahuas',
    'maltese', 'bichon frise', 'bichon', 'havanese', 'yorkshire terrier', 'yorkie', 'yorkies',
    'schnauzer', 'schnauzers', 'mini schnauzer', 'miniature schnauzer',
    'boston terrier', 'jack russell', 'russell terrier', 'terrier', 'terriers'
]

# 3. SEMANTIC SYNONYMS & SUBWORD MORPHEMES (Để bắt các từ ghép như Yorkshih, Pupco, Pawesome)
SUBWORD_MORPHEMES = {
    'yorkshih': ['yorkshire', 'shih tzu'],
    'pupco': ['pup', 'puppy', 'breeder'],
    'pup': ['puppy', 'dog'],
    'pups': ['puppies', 'dog'],
    'puppy': ['puppy', 'dog'],
    'doggo': ['dog'],
    'doggie': ['dog'],
    'pawesome': ['dog', 'pet'],
    'frenchies': ['frenchie', 'french bulldog'],
    'doxies': ['dachshund'],
    'goldens': ['golden retriever'],
    'sheltie': ['shetland sheepdog'],
    'aussies': ['australian shepherd'],
    'bernese': ['bernese mountain dog'],
    'bernedoodle': ['bernese', 'poodle'],
    'goldendoodle': ['golden retriever', 'poodle'],
    'cavapoo': ['cavalier', 'poodle'],
    'maltipoo': ['maltese', 'poodle'],
    'pomsky': ['pomeranian', 'husky']
}

def normalize_text(text):
    if not text:
        return ""
    text = str(text).lower()
    text = unicodedata.normalize('NFKD', text)
    # Giữ lại chữ cái, số, khoảng trắng
    text = re.sub(r'[^a-z0-9à-ỹ\s]', ' ', text)
    return ' '.join(text.split())

def match_dog_semantics(text, threshold=78):
    """
    Phân tích văn bản bằng mô hình NLP Semantic & Fuzzy Matching:
    - Trả về: (has_dog, is_b2b_breeder, matched_terms, confidence, explanation)
    """
    if not text:
        return False, False, [], 0.0, "Không có văn bản"

    norm = normalize_text(text)
    raw_lower = str(text).lower()
    tokens = norm.split()
    
    matched_terms = []
    is_b2b_breeder = False
    highest_score = 0.0
    reasons = []

    # 1. Kiểm tra khớp chính xác cụm từ B2B Breeder & Giống chó (Bắt buộc dùng ranh giới từ \b)
    for b2b in B2B_BREEDER_TERMS:
        reg = r'(?:^|[^a-zA-Z0-9À-ỹ])' + re.escape(b2b) + r'(?:$|[^a-zA-Z0-9À-ỹ])'
        if re.search(reg, raw_lower):
            matched_terms.append(b2b)
            is_b2b_breeder = True
            highest_score = max(highest_score, 0.95)
            reasons.append(f"Thuật ngữ B2B Breeder: '{b2b}'")

    for breed in CANONICAL_BREEDS:
        reg = r'(?:^|[^a-zA-Z0-9À-ỹ])' + re.escape(breed) + r'(?:$|[^a-zA-Z0-9À-ỹ])'
        if re.search(reg, raw_lower):
            matched_terms.append(breed)
            highest_score = max(highest_score, 0.90)
            reasons.append(f"Giống chó chính thức: '{breed}'")

    # 2. Kiểm tra từ ghép đặc biệt qua bảng hình thái (Subword Morphemes)
    for sub, targets in SUBWORD_MORPHEMES.items():
        if sub in norm:
            for t in targets:
                if t not in matched_terms:
                    matched_terms.append(t)
            if 'pup' in sub or 'breeder' in targets or 'puppy' in targets:
                is_b2b_breeder = True
            highest_score = max(highest_score, 0.92)
            reasons.append(f"Hình thái từ ghép '{sub}' -> ({', '.join(targets)})")

    # 3. Fuzzy Semantic Matching với RapidFuzz (Chỉ áp dụng cho tên giống chó dài >= 6 ký tự)
    # Tuyệt đối KHÔNG fuzzy các từ ngắn (như stud, dam, k9, pup) để tránh bắt nhầm sturgis, update, v.v.
    if fuzz and process:
        long_candidate_targets = [b for b in CANONICAL_BREEDS if len(b) >= 6]
        for token in tokens:
            if len(token) < 6:
                continue
            match = process.extractOne(token, long_candidate_targets, scorer=fuzz.ratio)
            if match and match[1] >= 85:
                matched_target, score, _ = match
                if matched_target not in matched_terms:
                    matched_terms.append(matched_target)
                highest_score = max(highest_score, score / 100.0)
                reasons.append(f"Fuzzy NLP '{token}' ~ '{matched_target}' ({score:.1f}%)")

    # Khử trùng lặp
    matched_terms = list(dict.fromkeys(matched_terms))
    has_dog = len(matched_terms) > 0

    explanation = "; ".join(reasons[:3]) if reasons else "Không phát hiện tín hiệu thú cưng"
    return has_dog, is_b2b_breeder, matched_terms, round(highest_score, 2), explanation

def match_dog_profile(name="", subtitle="", bio="", category="", url=""):
    """Tổng hợp 5 trường văn bản của một hồ sơ để phân tích ngữ nghĩa NLP."""
    url_slug = ""
    if url:
        slug = url.split("?")[0].rstrip("/").split("/")[-1]
        url_slug = re.sub(r'[^a-zA-Z0-9]', ' ', slug)
    
    combined_text = f"{name} {subtitle} {bio} {category} {url_slug}".strip()
    has_dog, is_b2b_breeder, matched_terms, score, explanation = match_dog_semantics(combined_text)
    return {
        "has_dog": has_dog,
        "is_b2b_breeder": is_b2b_breeder,
        "matched_breeds": matched_terms,
        "matched_terms": matched_terms,
        "score": score,
        "explanation": explanation
    }

if __name__ == "__main__":
    test_cases = [
        "Yorkshih Pupco - Breeder tại Breeders' World Online Sales",
        "Redhill Boykin Spaniels",
        "Ivory & Pine Goldens",
        "Doodle Denise Designs",
        "Kristy's Cocker Spaniel",
        "Nail Spa & Beauty Salon"
    ]
    print("=== KIỂM THỬ MODULE NLP DOG MATCHER ===")
    for tc in test_cases:
        has_dog, is_b2b, terms, score, exp = match_dog_semantics(tc)
        print(f"\n[Test] '{tc}'")
        print(f" -> Has Dog: {has_dog} | Is B2B Breeder: {is_b2b} | Score: {score}")
        print(f" -> Terms: {terms}")
        print(f" -> Details: {exp}")
