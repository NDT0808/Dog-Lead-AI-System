# -*- coding: utf-8 -*-
"""
Facebook Post Stats Extractor (Python Tool)
Trích xuất 4 trường dữ liệu từ bài viết Facebook thông qua mã nguồn HTML và thẻ <script type="application/json" data-sjs>:
  1. Thời gian đăng bài (Publish / Creation Time) - Unix timestamp & giờ thực tế
  2. Lượt Like / Bày tỏ cảm xúc (Reactions) + Chi tiết từng loại trong top_reactions
  3. Lượt Bình luận (Comments)
  4. Lượt Chia sẻ (Shares)
"""

import re
import json
import argparse
from datetime import datetime
try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None


def decode_unicode_str(s):
    if not s:
        return ""
    try:
        return re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), s).replace("\\", "").replace('"', '').strip()
    except Exception:
        return s.replace("\\", "").replace('"', '').strip()


def format_relative_time(ts):
    if not ts:
        return ""
    import time
    now_sec = int(time.time())
    diff_sec = max(0, now_sec - ts)
    diff_min = diff_sec // 60
    diff_hours = diff_min // 60
    diff_days = diff_hours // 24

    if diff_min < 1:
        return "vừa xong"
    if diff_min < 60:
        return f"{diff_min} phút trước"
    if diff_hours < 24:
        return f"{diff_hours} giờ trước"
    if diff_days < 7:
        return f"{diff_days} ngày trước"
    if diff_days < 30:
        return f"{diff_days // 7} tuần trước"
    if diff_days < 365:
        return f"{diff_days // 30} tháng trước"
    return f"{diff_days // 365} năm trước"


def parse_relative_time_to_timestamp(rel_str):
    if not rel_str:
        return None
    import time
    s = rel_str.lower().strip()
    now_sec = int(time.time())

    if "vừa xong" in s or "just now" in s:
        return now_sec
    
    min_m = re.search(r'(\d+)\s*(?:phút|min|m)(?:[\s·•\-_,]|trước|$)', s, re.IGNORECASE)
    if min_m:
        return now_sec - int(min_m.group(1)) * 60

    hr_m = re.search(r'(\d+)\s*(?:giờ|hour|h)(?:[\s·•\-_,]|trước|$)', s, re.IGNORECASE)
    if hr_m:
        return now_sec - int(hr_m.group(1)) * 3600

    day_m = re.search(r'(\d+)\s*(?:ngày|day|d)(?:[\s·•\-_,]|trước|$)', s, re.IGNORECASE)
    if day_m:
        return now_sec - int(day_m.group(1)) * 86400

    wk_m = re.search(r'(\d+)\s*(?:tuần|week|w)(?:[\s·•\-_,]|trước|$)', s, re.IGNORECASE)
    if wk_m:
        return now_sec - int(wk_m.group(1)) * 7 * 86400

    mo_m = re.search(r'(\d+)\s*(?:tháng|month)(?:[\s·•\-_,]|trước|$)', s, re.IGNORECASE)
    if mo_m:
        return now_sec - int(mo_m.group(1)) * 30 * 86400

    yr_m = re.search(r'(\d+)\s*(?:năm|year|y)(?:[\s·•\-_,]|trước|$)', s, re.IGNORECASE)
    if yr_m:
        return now_sec - int(yr_m.group(1)) * 365 * 86400

    return None


def extract_metrics_from_text(chunk):
    """
    Trích xuất các chỉ số cảm xúc, bình luận, chia sẻ từ một đoạn text/JSON.
    """
    # 1. Reactions Count: "reaction_count":{"count":3} hoặc "reaction_count":3 hoặc unified_reactors/likers
    rx_match = re.search(r'["\\]*reaction_count["\\]*[\s\S]{0,120}?["\\]*count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?(\d+)', chunk, re.IGNORECASE)
    if not rx_match:
        rx_match = re.search(r'["\\]*reaction_count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?(\d+)', chunk, re.IGNORECASE)
    if not rx_match:
        rx_match = re.search(r'(?:unified_reactors|likers)[\s\S]{0,120}?["\\]*count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?(\d+)', chunk, re.IGNORECASE)
    if not rx_match:
        rx_match = re.search(r'["\\]*i18n_reaction_count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?["\\]*(\d+)["\\]*', chunk, re.IGNORECASE)
    if not rx_match:
        rx_match = re.search(r'["\\]*reaction_count_reduced["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?["\\]*(\d+)["\\]*', chunk, re.IGNORECASE)
    reaction_count = int(rx_match.group(1)) if rx_match else 0

    # 2. Top Reactions Detail: mảng "top_reactions"
    reaction_details = {}
    top_rx_block = re.search(r'["\\]*top_reactions["\\]*[\s\S]{0,20}?\[([\s\S]*?)\]', chunk, re.IGNORECASE)
    if top_rx_block:
        block_content = top_rx_block.group(1)
        items = re.findall(r'\{([^{}]+(?:\{[^{}]*\}[^{}]*)*)\}', block_content)
        for item in items:
            name_m = re.search(r'["\\]*localized_name["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?["\\]*([^",}\]]+)', item, re.IGNORECASE)
            count_m = re.search(r'["\\]*reaction_count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?(\d+)', item, re.IGNORECASE)
            if name_m and count_m:
                decoded_name = decode_unicode_str(name_m.group(1))
                if decoded_name:
                    reaction_details[decoded_name] = int(count_m.group(1))

    details_str = ", ".join([f"{k}: {v}" for k, v in reaction_details.items()])
    if reaction_count == 0 and reaction_details:
        reaction_count = sum(reaction_details.values())

    # 3. Comments Count: "comments":{"total_count":0} hoặc "total_comment_count":0
    cmt_match = re.search(r'["\\]*comments["\\]*[\s\S]{0,150}?["\\]*total_count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?(\d+)', chunk, re.IGNORECASE)
    if not cmt_match:
        cmt_match = re.search(r'["\\]*total_comment_count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?(\d+)', chunk, re.IGNORECASE)
    if not cmt_match:
        cmt_match = re.search(r'["\\]*comment_count["\\]*[\s\S]{0,120}?["\\]*(?:total_count|count)?["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?(\d+)', chunk, re.IGNORECASE)
    if not cmt_match:
        cmt_match = re.search(r'["\\]*total_comments["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?(\d+)', chunk, re.IGNORECASE)
    if not cmt_match:
        cmt_match = re.search(r'["\\]*i18n_comment_count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?["\\]*(\d+)["\\]*', chunk, re.IGNORECASE)
    comments_count = int(cmt_match.group(1)) if cmt_match else 0

    # 4. Shares Count: "share_count":{"count":1} hoặc "i18n_share_count":"1" hoặc "share_count_reduced":1
    share_match = re.search(r'["\\]*share_count["\\]*[\s\S]{0,150}?["\\]*count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?(\d+)', chunk, re.IGNORECASE)
    if not share_match:
        share_match = re.search(r'["\\]*i18n_share_count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?["\\]*(\d+)["\\]*', chunk, re.IGNORECASE)
    if not share_match:
        share_match = re.search(r'["\\]*share_count_reduced["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?["\\]*(\d+)["\\]*', chunk, re.IGNORECASE)
    if not share_match:
        share_match = re.search(r'["\\]*total_share_count["\\]*[\s\S]{0,10}?:[\s\S]{0,10}?(\d+)', chunk, re.IGNORECASE)
    shares_count = int(share_match.group(1)) if share_match else 0

    return reaction_count, details_str, comments_count, shares_count


def extract_facebook_posts(html_content):
    """
    Trích xuất danh sách các bài viết Facebook từ HTML string hoặc nội dung thẻ script data-sjs.
    Trả về danh sách dict chứa đầy đủ 4 trường thông tin.
    """
    if not html_content:
        return []

    posts = []
    seen_ts = set()
    ts_pattern = re.compile(r'["\\]*(?:publish_time|created_time|creation_time)["\\]*\s*:\s*(\d{9,12})')

    # A. Quét các thẻ <script> độc lập trước nếu có BeautifulSoup
    if BeautifulSoup and "<script" in html_content:
        try:
            soup = BeautifulSoup(html_content, "html.parser")
            scripts = soup.find_all("script")
            for s in scripts:
                text = s.string or ""
                if not text or len(text) < 50:
                    continue
                if "publish_time" not in text and "created_time" not in text and "creation_time" not in text:
                    continue

                for m in ts_pattern.finditer(text):
                    ts = int(m.group(1))
                    if ts < 1420070400 or ts > 2051222400:
                        continue
                    if ts in seen_ts:
                        continue
                    seen_ts.add(ts)

                    target_idx = m.start()
                    start = max(0, target_idx - 60000)
                    end = min(len(text), target_idx + 60000)
                    chunk = text[start:end]

                    rx_count, details_str, cmt_count, share_count = extract_metrics_from_text(chunk)

                    dt = datetime.fromtimestamp(ts)
                    formatted_date = dt.strftime("%d/%m/%Y %H:%M:%S")

                    rel_m = re.search(r'(\d+\s*(?:ngày|giờ|phút|giây|tuần|tháng|năm)\s*trước(?:,\s*xem bài viết)?|vừa xong)', chunk, re.IGNORECASE)
                    relative_text = rel_m.group(1).strip() if rel_m else ""
                    if not relative_text:
                        relative_text = format_relative_time(ts)

                    rel_suffix = f" ({relative_text})" if relative_text else ""
                    details_suffix = f" [{details_str}]" if details_str else ""

                    posts.append({
                        "publish_timestamp": ts,
                        "publish_time": formatted_date,
                        "relative_time": relative_text,
                        "reactions_count": rx_count,
                        "reactions_detail": details_str,
                        "comments_count": cmt_count,
                        "shares_count": share_count,
                        "post_summary": f"[{formatted_date}{rel_suffix}] ({rx_count} Reactions{details_suffix}, {cmt_count} Comments, {share_count} Shares)"
                    })
        except Exception as e:
            import traceback
            traceback.print_exc()

    # B. Quét bổ sung trong toàn bộ chuỗi HTML
    for m in ts_pattern.finditer(html_content):
        ts = int(m.group(1))
        if ts < 1420070400 or ts > 2051222400:
            continue
        if ts in seen_ts:
            continue
        seen_ts.add(ts)

        target_idx = m.start()
        start = max(0, target_idx - 60000)
        end = min(len(html_content), target_idx + 60000)
        chunk = html_content[start:end]

        rx_count, details_str, cmt_count, share_count = extract_metrics_from_text(chunk)

        dt = datetime.fromtimestamp(ts)
        formatted_date = dt.strftime("%d/%m/%Y %H:%M:%S")

        rel_m = re.search(r'(\d+\s*(?:ngày|giờ|phút|giây|tuần|tháng|năm)\s*trước(?:,\s*xem bài viết)?|vừa xong)', chunk, re.IGNORECASE)
        relative_text = rel_m.group(1).strip() if rel_m else ""
        if not relative_text:
            relative_text = format_relative_time(ts)

        rel_suffix = f" ({relative_text})" if relative_text else ""
        details_suffix = f" [{details_str}]" if details_str else ""

        posts.append({
            "publish_timestamp": ts,
            "publish_time": formatted_date,
            "relative_time": relative_text,
            "reactions_count": rx_count,
            "reactions_detail": details_str,
            "comments_count": cmt_count,
            "shares_count": share_count,
            "post_summary": f"[{formatted_date}{rel_suffix}] ({rx_count} Reactions{details_suffix}, {cmt_count} Comments, {share_count} Shares)"
        })

    # Sắp xếp bài mới nhất lên đầu
    posts.sort(key=lambda x: x["publish_timestamp"], reverse=True)

    # C. Fallback quét dòng text engagement nếu bài viết đầu tiên trả về 0 reactions
    if posts and posts[0]["reactions_count"] == 0:
        matches = list(re.finditer(r'Đã chia sẻ bài viết[\s|·•\-_]*([0-9,KkMm]+)(?:[\s|·•\-_]+([0-9,KkMm]+))?(?:[\s|·•\-_]+([0-9,KkMm]+))?', html_content, re.IGNORECASE))
        for match in matches:
            r_str = match.group(1)
            c_str = match.group(2)
            s_str = match.group(3)
            def parse_num(v):
                if not v:
                    return 0
                v = v.strip().replace('.', '').replace(',', '.')
                if v.lower().endswith('k'):
                    return int(float(v[:-1]) * 1000)
                if v.lower().endswith('m'):
                    return int(float(v[:-1]) * 1000000)
                try:
                    return int(v)
                except ValueError:
                    return 0
            fb_r = parse_num(r_str)
            fb_c = parse_num(c_str)
            fb_s = parse_num(s_str)
            if fb_r > 0 or fb_c > 0 or fb_s > 0:
                posts[0]["reactions_count"] = fb_r
                posts[0]["comments_count"] = fb_c
                posts[0]["shares_count"] = fb_s
                dt_str = posts[0]["publish_time"]
                rel_s = f" ({posts[0]['relative_time']})" if posts[0]['relative_time'] else ""
                posts[0]["post_summary"] = f"[{dt_str}{rel_s}] ({fb_r} Reactions, {fb_c} Comments, {fb_s} Shares)"
                break

    return posts


# ==========================================
# TEST PAYLOAD MẪU THEO ĐÚNG YÊU CẦU CỦA USER
# ==========================================
DEMO_PAYLOAD = '''
<script type="application/json" data-sjs>
{"require":[["RelayPrefetchedStreamCache","next",[],[{"__bbox":{"result":{"data":{"node":{
    "id":"post_demo_10102026",
    "publish_time":1791644534,
    "created_time":1791644534,
    "feedback":{
        "reaction_count":{"count":3},
        "top_reactions":[
            {"reaction_count":2,"node":{"id":"1635855486666999","localized_name":"Thích"}},
            {"reaction_count":1,"node":{"id":"1635855486667000","localized_name":"Yêu thích"}}
        ],
        "comments":{"total_count":0},
        "share_count":{"count":1},
        "i18n_share_count":"1"
    }
}}}}}}]]}
</script>
<div class="ui_text">1 ngày trước, xem bài viết</div>
'''


def main():
    parser = argparse.ArgumentParser(description="Facebook Post Stats Extractor")
    parser.add_argument("--file", "-f", help="Đường dẫn file HTML cần phân tích")
    parser.add_argument("--test", "-t", action="store_true", help="Chạy kiểm tra với dữ liệu mẫu")
    args = parser.parse_args()

    if args.file:
        with open(args.file, "r", encoding="utf-8", errors="ignore") as fp:
            content = fp.read()
        posts = extract_facebook_posts(content)
        print(f"Tìm thấy {len(posts)} bài viết trong file: {args.file}")
        print(json.dumps(posts, indent=2, ensure_ascii=False))
    else:
        print("--- DEMO CHẠY THỬ VỚI DỮ LIỆU CỦA BẠN ---")
        posts = extract_facebook_posts(DEMO_PAYLOAD)
        print(json.dumps(posts, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
