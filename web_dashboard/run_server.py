#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Local Web UI Server for Pet Lead AI System
Phục vụ giao diện Web trực quan:
- Tự động tìm port trống (mặc định 8000 hoặc 8080)
- Tự động mở trình duyệt hiển thị Dashboard Lọc AI & Visual Gallery
- Cung cấp API Upload File JSON thô (/api/upload-raw)
- Cung cấp API Lọc AI Thị Giác Bước 1 với Ngưỡng Nghiêm Ngặt tùy chỉnh (/api/run-step1-filter)
- Cung cấp API Quét tự động làm giàu hàng loạt Bước 2 (/api/run-bulk-enrich)
- Cung cấp API Giải quyết ID số (/api/resolve-id)
"""

import os
import sys
import json
import time
import re
import socket
import threading
import webbrowser
import http.server
import socketserver
import urllib.parse

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
SYSTEM_DIR = os.path.dirname(DIRECTORY)

# Import Step 1 & Step 2 pipelines
STEP1_PY = os.path.join(SYSTEM_DIR, "step1_follower_harvester", "python_pipeline")
STEP2_PY = os.path.join(SYSTEM_DIR, "step2_profile_enricher", "python_pipeline")
for p in [STEP1_PY, STEP2_PY]:
    if p not in sys.path:
        sys.path.insert(0, p)

from fbid_resolver import resolve_numeric_fbid
from ai_vision_filter import run_pipeline as run_step1_pipeline
from bulk_headless_scanner import run_bulk_headless_scan, LATEST_JSON, LATEST_EXCEL
from step2_substep1_post_intro_extractor import extract_post_and_intro_from_html, analyze_file_or_url
try:
    from google_ai_fallback import simulate_google_ai_query, parse_google_ai_response
except ImportError:
    simulate_google_ai_query = None
    parse_google_ai_response = None

# Global state for Step 1 AI filtering progress
STEP1_STATE = {
    "is_running": False,
    "current": 0,
    "total": 0,
    "percent": 0,
    "results": [],
    "all_evaluated": [],
    "threshold": 0.70,
    "latest_lead": None,
    "latest_log": None,
    "recent_logs": [],
    "error": None,
    "started_at": 0,
    "finished_at": 0
}

# Global state for language preference
CURRENT_APP_LANG = "vi"

def translate_log_to_zh(stage: str, text: str) -> tuple[str, str]:
    """Chuyển đổi stage và text sang tiếng Trung nếu người dùng chọn ngôn ngữ tiếng Trung"""
    stage_map = {
        'KHỞI ĐỘNG': '启动任务',
        'TIẾN HÀNH': '开始处理',
        'TIẾN TRÌNH': '处理进度',
        '1. KẾT NỐI FB': '1. 连接FB',
        '2. TÊN TRẠI & CHỦ': '2. 犬舍与主理人',
        '3. THÔNG TIN LIÊN HỆ': '3. 联系方式',
        '4. BÀI ĐĂNG GẦN NHẤT': '4. 最新发帖',
        '5. KÊNH AMAZON': '5. 亚马逊渠道',
        '6. HOÀN TẤT HỒ SƠ': '6. 归档入库',
        'TẦNG 1: FB INTRO': '第1层: FB简介',
        'TẦNG 1: FB PROFILE': '第1层: FB主页提取',
        'TẦNG 1: QUÉT FB': '第1层: FB主页提取',
        'TẦNG 2: WEBSITE': '第2层: 官网挖掘',
        'TẦNG 2: DUYỆT WEBSITE': '第2层: 官网挖掘',
        'TẦNG 3: BÓC TÁCH AMAZON': '第3层: 亚马逊细分',
        'TẦNG 4: CHẤM ĐIỂM': '第4层: 评分归档',
        'TẦNG 4: RAG MASTER CRM': '第4层: RAG归档去重',
        'GOOGLE AI FALLBACK': 'GOOGLE AI 智能补充',
        'PHÊ DUYỆT CHÓ': '已批准犬类',
        'LOẠI BỎ': '已剔除非目标',
        'LỖI': '错误',
        'THÀNH CÔNG': '成功',
        'LOG': '运行日志'
    }
    new_stage = stage_map.get(stage, stage)

    new_text = str(text or '')
    replacements = [
        ('BẮT ĐẦU CÀO BÓC TÁCH TRỰC TIẾP TỪ DÒNG', '开始实时深度抓取：从第'),
        ('ĐẾN', '行到第'),
        ('HỒ SƠ', '档案'),
        ('Chuẩn bị mở URL:', '准备打开 URL:'),
        ('Đang tải trang Facebook:', '正在加载 Facebook 页面:'),
        ('Tên trại:', '犬舍名称:'),
        ('Đại diện:', '主理人代表:'),
        ('Chưa rõ', '未确定'),
        ('Chưa bắt được', '未获取'),
        ('SĐT:', '电话:'),
        ('Không có', '无'),
        ('Ngày đăng:', '发帖时间:'),
        ('Amazon:', '亚马逊:'),
        ('Có gian hàng', '有店铺'),
        ('Gói SP:', '推荐方案:'),
        ('Chủ:', '主理人:'),
        ('ĐÃ TỰ CẬP NHẬT VÀO CRM!', '已实时存入CRM！'),
        ('Điểm:', '评分:'),
        ('Hoàn tất hồ sơ', '档案归档完成'),
        ('Đang quét FB', '正在抓取 FB'),
        ('Bắt đầu duyệt', '开始挖掘'),
        ('website chính thức của trại', '个官方网站'),
        ('Tìm tên chủ trại Owner', '查找主理人姓名Owner'),
        ('Đã hoàn thành bóc tách toàn bộ', '已完成全部'),
        ('Đã bóc tách thành công toàn bộ', '已完成全部'),
        ('Đã quét', '已抓取'),
        ('Có Website:', '有独立官网:'),
        ('Không Website:', '无官网:'),
        ('Đang xử lý', '正在处理'),
        ('hồ sơ đạt chuẩn', '份档案达标'),
        ('hồ sơ...', '份档案...'),
        ('hồ sơ', '份档案')
    ]
    for vi_str, zh_str in replacements:
        new_text = new_text.replace(vi_str, zh_str)

    return new_stage, new_text

# Global state for Step 2 bulk scanning progress
SCAN_STATE = {
    "is_running": False,
    "current": 0,
    "total": 0,
    "percent": 0,
    "latest_lead": None,
    "latest_log": None,
    "recent_logs": [],
    "results": [],
    "error": None,
    "started_at": 0,
    "finished_at": 0
}

class DashboardApiHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, *')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # API: Trạng thái hệ thống máy chủ
        if path == '/api/system-status':
            self.send_json_response({'status': 'ok', 'online': True, 'port': PORT, 'time': time.time()})
            return

        # API: Lấy danh sách hồ sơ đã thẩm định Bước 1
        if path == '/api/step1-leads':
            step1_file = os.path.join(SYSTEM_DIR, "data", "verified_step1", "step1_verified_dogs_latest.json")
            data = []
            if os.path.exists(step1_file):
                try:
                    with open(step1_file, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    data = []

            all_data = []
            checkpoint_file = os.path.join(SYSTEM_DIR, "data", "verified_step1", "checkpoint_step1_vision.json")
            if os.path.exists(checkpoint_file):
                try:
                    with open(checkpoint_file, 'r', encoding='utf-8') as cf:
                        all_data = list(json.load(cf).values())
                except Exception:
                    all_data = data
            else:
                all_data = data

            self.send_json_response({'status': 'ok', 'count': len(data), 'leads': data, 'all_evaluated': all_data})
            return

        # API: Tiến độ và Streaming Log của Bước 1
        if path == '/api/step1-filter-status':
            self.send_json_response(STEP1_STATE)
            return

        # API: Lấy tệp dữ liệu thô theo tên chỉ định
        if path == '/api/get-raw-file':
            query = urllib.parse.parse_qs(parsed.query)
            filename = query.get('filename', [''])[0] or query.get('file', [''])[0]
            raw_dir = os.path.join(SYSTEM_DIR, "data", "raw")
            target_path = None
            if filename:
                for cand in [
                    os.path.join(raw_dir, os.path.basename(filename)),
                    os.path.join(SYSTEM_DIR, os.path.basename(filename)),
                    filename
                ]:
                    if os.path.exists(cand):
                        target_path = cand
                        break

            if target_path and os.path.exists(target_path):
                try:
                    with open(target_path, 'r', encoding='utf-8') as f:
                        records = json.load(f)
                    self.send_json_response({
                        'status': 'ok',
                        'filename': os.path.basename(target_path),
                        'count': len(records),
                        'data': records
                    })
                    return
                except Exception as e:
                    self.send_json_response({'status': 'error', 'message': str(e)}, status=500)
                    return

            # Nếu không tìm thấy file chỉ định, fallback trả về latest
            path = '/api/latest-raw'

        # API: Lấy tệp dữ liệu thô mới nhất vừa cào (cho cả Live Server 5500 và cổng 8000)
        if path == '/api/latest-raw':
            raw_dir = os.path.join(SYSTEM_DIR, "data", "raw")
            latest_file = None
            if os.path.exists(raw_dir):
                import glob
                files = glob.glob(os.path.join(raw_dir, "*.json"))
                if files:
                    files.sort(key=os.path.getmtime, reverse=True)
                    latest_file = files[0]
            
            if latest_file and os.path.exists(latest_file):
                try:
                    with open(latest_file, 'r', encoding='utf-8') as f:
                        records = json.load(f)
                    self.send_json_response({
                        'status': 'ok',
                        'filename': os.path.basename(latest_file),
                        'count': len(records),
                        'data': records
                    })
                    return
                except Exception:
                    pass
            self.send_json_response({'status': 'empty', 'message': 'Chưa có tệp thô', 'data': []})
            return

        # API: Lấy danh sách hồ sơ đã làm giàu Bước 2
        if path == '/api/step2-leads':
            data = []
            if os.path.exists(LATEST_JSON):
                try:
                    with open(LATEST_JSON, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                except Exception:
                    data = []
            self.send_json_response({'status': 'ok', 'count': len(data), 'leads': data})
            return

        # API: Tiến độ quét làm giàu hàng loạt Bước 2
        if path == '/api/bulk-enrich-status':
            self.send_json_response(SCAN_STATE)
            return

        # Static files fallback
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            req_data = json.loads(body.decode('utf-8'))
        except Exception:
            req_data = {}

        # API: Upload file JSON thô lên server
        if path == '/api/upload-raw':
            raw_data = req_data.get('data', [])
            filename = req_data.get('filename', f"uploaded_raw_{int(time.time())}.json")
            if not isinstance(raw_data, list) or len(raw_data) == 0:
                self.send_json_response({'status': 'error', 'message': 'Dữ liệu JSON không hợp lệ hoặc rỗng!'}, status=400)
                return

            raw_dir = os.path.join(SYSTEM_DIR, "data", "raw")
            os.makedirs(raw_dir, exist_ok=True)
            save_path = os.path.join(raw_dir, filename)
            with open(save_path, 'w', encoding='utf-8') as f:
                json.dump(raw_data, f, ensure_ascii=False, indent=2)

            self.send_json_response({
                'status': 'ok',
                'message': f'Đã nạp và lưu thành công {len(raw_data)} hồ sơ!',
                'count': len(raw_data),
                'saved_path': save_path,
                'filename': filename
            })
            return

        # API: Khởi chạy Lọc AI Bước 1 với Threshold nghiêm ngặt & Live Logging
        if path == '/api/run-step1-filter':
            if STEP1_STATE["is_running"]:
                self.send_json_response({'status': 'busy', 'message': 'Tiến trình lọc AI đang chạy!'}, status=409)
                return

            threshold = float(req_data.get('threshold', 0.70))
            force = bool(req_data.get('force', True))
            delay = float(req_data.get('delay', 0.04))
            input_file = req_data.get('file_path')
            if input_file and not os.path.isabs(input_file):
                input_file = os.path.join(SYSTEM_DIR, input_file)
            
            # Nếu truyền trực tiếp mảng records
            if not input_file or not os.path.exists(input_file):
                raw_data = req_data.get('data', [])
                if raw_data:
                    temp_path = os.path.join(SYSTEM_DIR, "data", "raw", f"temp_filter_input_{int(time.time())}.json")
                    with open(temp_path, 'w', encoding='utf-8') as f:
                        json.dump(raw_data, f, ensure_ascii=False, indent=2)
                    input_file = temp_path
                else:
                    # Fallback file mặc định
                    input_file = os.path.join(SYSTEM_DIR, "data", "raw", "step1_followers_raw_2026-10-18T20-13-59.json")

            t = threading.Thread(target=self._run_step1_worker, args=(input_file, threshold, force, delay))
            t.daemon = True
            t.start()

            self.send_json_response({
                'status': 'started',
                'message': f'Đã kích hoạt lọc AI thị giác với Ngưỡng Nghiêm Ngặt = {threshold:.2f}!',
                'threshold': threshold
            })
            return

        # API: Giải quyết ID số cho 1 URL cụ thể
        if path == '/api/resolve-id':
            url = req_data.get('url', '').strip()
            resolved = resolve_numeric_fbid(url) if url else ""
            self.send_json_response({'status': 'ok', 'url': url, 'fb_id': resolved})
            return

        # API: Khởi chạy Quét tự động hàng loạt làm giàu hồ sơ Bước 2 (Headless Bulk Scanner)
        if path == '/api/run-bulk-enrich':
            if SCAN_STATE["is_running"]:
                self.send_json_response({'status': 'busy', 'message': 'Tiến trình quét đang chạy!'}, status=409)
                return

            links = req_data.get('links', [])
            if not links:
                step1_file = os.path.join(SYSTEM_DIR, "data", "verified_step1", "step1_verified_dogs_latest.json")
                if os.path.exists(step1_file):
                    try:
                        with open(step1_file, 'r', encoding='utf-8') as f:
                            links = json.load(f)
                    except Exception:
                        links = []

            if not links:
                self.send_json_response({'status': 'error', 'message': 'Không có danh sách link để quét!'}, status=400)
                return

            t = threading.Thread(target=self._run_enrichment_worker, args=(links,))
            t.daemon = True
            t.start()

            self.send_json_response({
                'status': 'started',
                'message': f'Đã khởi chạy quét tự động hàng loạt {len(links)} hồ sơ ngầm!',
                'total': len(links)
            })
            return

        # API: Phân tích Giới thiệu (Intro / About) & Bài viết gần nhất (Latest Post) + Publish Time
        if path == '/api/step2/extract-intro-post':
            raw_html = req_data.get('html', '').strip()
            url = req_data.get('url', '').strip()
            file_path = req_data.get('file_path', '').strip()

            if file_path and os.path.exists(file_path):
                res = analyze_file_or_url(file_path)
            elif raw_html:
                res = extract_post_and_intro_from_html(raw_html, source_url=url)
            elif url:
                res = analyze_file_or_url(url)
            else:
                self.send_json_response({'status': 'error', 'message': 'Không tìm thấy nội dung HTML hoặc URL để phân tích!'}, status=400)
                return

            self.send_json_response(res)
            return

        # API: Google AI Fallback Simulation (Chuẩn video Recording 2026-10-16 150400.mp4)
        if path == '/api/step2/google-ai-fallback':
            kennel_name = req_data.get('kennel_name', '').strip()
            fb_url = req_data.get('fb_url', '').strip()
            city = req_data.get('city', '').strip()
            state = req_data.get('state', '').strip()
            snippet = req_data.get('snippet', '').strip()

            parsed_data = {}
            if snippet and parse_google_ai_response:
                parsed_data = parse_google_ai_response(snippet)

            if not parsed_data and fb_url and simulate_google_ai_query:
                try:
                    parsed_data = simulate_google_ai_query(fb_url, headless=True)
                except Exception:
                    pass

            if not parsed_data:
                # Trích xuất thông minh từ kennel_name / fb_url nếu không có kết nối ngoài
                owner_clean = kennel_name
                for sfx in ['kennel', 'kennels', 'breeder', 'puppies', 'dogs', 'poodles', 'doodles', 'corgis', 'farm', 'doggrooming']:
                    owner_clean = re.sub(rf'\b{sfx}\b', '', owner_clean, flags=re.I).strip()
                parsed_data = {
                    'owner': f"{owner_clean} (Chủ trại)" if owner_clean else f"{kennel_name} (Chủ trại)",
                    'company_name': kennel_name,
                    'city': city,
                    'state': state,
                    'country': 'United States'
                }

            t_now = time.strftime('%H:%M:%S')
            owner_res = parsed_data.get('owner', 'Chưa rõ')
            phone_res = parsed_data.get('phone', 'Chưa có')
            web_res = parsed_data.get('website', 'Chưa có')
            print(f"[{t_now}] \033[95m[GOOGLE AI FALLBACK]\033[0m 🤖 Trích xuất AI Overview cho: {kennel_name} -> Chủ trại: '{owner_res}' | SĐT: {phone_res} | Web: {web_res}", flush=True)

            self.send_json_response({'status': 'ok', 'data': parsed_data})
            return

        # API: Cập nhật ngôn ngữ hiển thị hệ thống (vi / zh)
        if path == '/api/set-lang':
            global CURRENT_APP_LANG
            req_lang = req_data.get('lang', 'vi')
            CURRENT_APP_LANG = req_lang
            t_now = time.strftime('%H:%M:%S')
            lang_name = "中文 (Chinese)" if req_lang == 'zh' else "Tiếng Việt"
            print(f"[{t_now}] \033[96m[NGÔN NGỮ / 语言]\033[0m Đã chuyển ngôn ngữ terminal sang: {lang_name}", flush=True)
            self.send_json_response({'status': 'ok', 'lang': CURRENT_APP_LANG})
            return

        # API: Nhận thông báo log Bước 1 và in ra Terminal
        if path == '/api/step1/log':
            log_item = req_data.get('log', {})
            stage = log_item.get('stage', 'BƯỚC 1')
            text = log_item.get('text', '')
            level = log_item.get('level', 'info')
            t_stamp = log_item.get('timestamp', time.strftime('%H:%M:%S'))
            req_lang = req_data.get('lang', log_item.get('lang', CURRENT_APP_LANG))

            if req_lang == 'zh' or CURRENT_APP_LANG == 'zh':
                stage, text = translate_log_to_zh(stage, text)

            colors = {
                'info': '\033[94m',
                'success': '\033[92m',
                'approved': '\033[92m',
                'warn': '\033[93m',
                'err': '\033[91m',
                'rejected': '\033[91m'
            }
            c = colors.get(level, '\033[0m')
            reset = '\033[0m'
            print(f"[{t_stamp}] {c}[{stage}]{reset} {text}", flush=True)
            self.send_json_response({'status': 'ok'})
            return

        # API: Nhận thông báo log trực tiếp từ Chrome Extension và in ra Terminal
        if path == '/api/step2/log':
            log_item = req_data.get('log', {})
            stage = log_item.get('stage', 'LOG')
            text = log_item.get('text', '')
            level = log_item.get('level', 'info')
            t_stamp = log_item.get('timestamp', time.strftime('%H:%M:%S'))
            req_lang = req_data.get('lang', log_item.get('lang', CURRENT_APP_LANG))

            if req_lang == 'zh' or CURRENT_APP_LANG == 'zh':
                stage, text = translate_log_to_zh(stage, text)

            colors = {
                'info': '\033[94m',
                'success': '\033[92m',
                'warn': '\033[93m',
                'err': '\033[91m',
                'ai': '\033[95m',
                'web': '\033[96m'
            }
            c = colors.get(level, '\033[0m')
            reset = '\033[0m'
            print(f"[{t_stamp}] {c}[{stage}]{reset} {text}", flush=True)

            # Lưu vào SCAN_STATE để UI web có thể đồng bộ nếu cần
            log_entry = {
                'id': f"log_{int(time.time()*1000)}_{len(SCAN_STATE['recent_logs'])}",
                'stage': stage,
                'text': text,
                'level': level,
                'timestamp': t_stamp
            }
            SCAN_STATE['recent_logs'].append(log_entry)
            if len(SCAN_STATE['recent_logs']) > 300:
                SCAN_STATE['recent_logs'] = SCAN_STATE['recent_logs'][-300:]
            SCAN_STATE['latest_log'] = log_entry

            self.send_json_response({'status': 'ok'})
            return

        self.send_json_response({'status': 'not_found'}, status=404)

    def _run_step1_worker(self, input_file, threshold, force=False, delay=0.04):
        global STEP1_STATE
        STEP1_STATE["is_running"] = True
        STEP1_STATE["percent"] = 5
        STEP1_STATE["current"] = 0
        STEP1_STATE["total"] = 0
        STEP1_STATE["results"] = []
        STEP1_STATE["latest_lead"] = None
        STEP1_STATE["latest_log"] = None
        STEP1_STATE["recent_logs"] = []
        STEP1_STATE["threshold"] = threshold
        STEP1_STATE["started_at"] = time.time()
        STEP1_STATE["error"] = None

        def on_step1_progress(current, total, lead, is_dog):
            STEP1_STATE["current"] = current
            STEP1_STATE["total"] = total
            STEP1_STATE["percent"] = round((current / total) * 100, 1) if total else 100
            STEP1_STATE["latest_lead"] = lead

        def on_step1_log(log_item):
            STEP1_STATE["latest_log"] = log_item
            STEP1_STATE["recent_logs"].append(log_item)
            if len(STEP1_STATE["recent_logs"]) > 200:
                STEP1_STATE["recent_logs"].pop(0)

        try:
            latest_json, gallery_html = run_step1_pipeline(
                input_file, threshold=threshold, progress_callback=on_step1_progress,
                log_callback=on_step1_log, delay=delay, force_reevaluate=force
            )
            with open(latest_json, 'r', encoding='utf-8') as f:
                results = json.load(f)
            STEP1_STATE["results"] = results

            # Load full pool of evaluated records from checkpoint for dynamic client slider filtering
            checkpoint_file = os.path.join(SYSTEM_DIR, "data", "verified_step1", "checkpoint_step1_vision.json")
            if os.path.exists(checkpoint_file):
                try:
                    with open(checkpoint_file, 'r', encoding='utf-8') as cf:
                        cp_data = json.load(cf)
                    STEP1_STATE["all_evaluated"] = list(cp_data.values())
                except Exception:
                    STEP1_STATE["all_evaluated"] = results
            else:
                STEP1_STATE["all_evaluated"] = results

            STEP1_STATE["percent"] = 100
        except Exception as e:
            STEP1_STATE["error"] = str(e)
        finally:
            STEP1_STATE["is_running"] = False
            STEP1_STATE["finished_at"] = time.time()

    def _run_enrichment_worker(self, items):
        global SCAN_STATE
        SCAN_STATE["is_running"] = True
        SCAN_STATE["current"] = 0
        SCAN_STATE["total"] = len(items)
        SCAN_STATE["percent"] = 0
        SCAN_STATE["latest_lead"] = None
        SCAN_STATE["latest_log"] = None
        SCAN_STATE["recent_logs"] = []
        SCAN_STATE["results"] = []
        SCAN_STATE["error"] = None
        SCAN_STATE["started_at"] = time.time()
        SCAN_STATE["finished_at"] = 0

        def on_progress(current, total, lead):
            SCAN_STATE["current"] = current
            SCAN_STATE["total"] = total
            SCAN_STATE["percent"] = round((current / total) * 100, 1) if total else 100
            SCAN_STATE["latest_lead"] = lead

        def on_enrich_log(log_item):
            SCAN_STATE["latest_log"] = log_item
            SCAN_STATE["recent_logs"].append(log_item)
            if len(SCAN_STATE["recent_logs"]) > 200:
                SCAN_STATE["recent_logs"].pop(0)

        try:
            results = run_bulk_headless_scan(items, max_workers=5, progress_callback=on_progress, log_callback=on_enrich_log)
            SCAN_STATE["results"] = results
            SCAN_STATE["percent"] = 100
            SCAN_STATE["current"] = len(results)
        except Exception as e:
            SCAN_STATE["error"] = str(e)
        finally:
            SCAN_STATE["is_running"] = False
            SCAN_STATE["finished_at"] = time.time()

    def send_json_response(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        pass

def get_lan_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('8.8.8.8', 80))
            return s.getsockname()[0]
    except Exception:
        return '127.0.0.1'

def find_available_port(start_port=8000):
    port = start_port
    while port < start_port + 100:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0 and s.connect_ex(('0.0.0.0', port)) != 0:
                return port
        port += 1
    return start_port

def main():
    lan_ip = get_lan_ip()
    port = find_available_port(PORT)
    url_local = f"http://127.0.0.1:{port}/index.html"
    url_lan = f"http://{lan_ip}:{port}/index.html"

    print("=" * 75)
    print("      🐾 PET LEAD AI - GIAO DIỆN WEB TRỰC QUAN (WEB DASHBOARD) 🐾")
    print("=" * 75)
    print(f"[*] Thư mục phục vụ: {DIRECTORY}")
    print(f"[*] Máy chủ Local (Máy này):       {url_local}")
    print(f"[*] Máy chủ Mạng LAN / Máy khác / VPS: {url_lan}")
    print(f"[*] Lưu ý: Nếu dùng Chrome Extension ở máy khác, nhập IP: http://{lan_ip}:{port}")
    print(f"[*] API Quét làm giàu tự động (Bulk Enricher API) sẵn sàng tại /api/*")
    print(f"[*] API Lọc AI Thị Giác Bước 1 (Ngưỡng Strict 0.70) sẵn sàng tại /api/run-step1-filter")
    print("=" * 75)
    print(">>> Nhấn [Ctrl + C] để dừng Web Server khi không dùng nữa.\n")

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", port), DashboardApiHandler) as httpd:
        def open_browser():
            time.sleep(0.6)
            try:
                webbrowser.open(url_local)
            except Exception:
                pass

        threading.Thread(target=open_browser, daemon=True).start()

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[!] Đã tắt máy chủ Web UI an toàn.")
            httpd.shutdown()

if __name__ == '__main__':
    main()
