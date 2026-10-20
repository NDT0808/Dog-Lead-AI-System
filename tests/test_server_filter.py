import urllib.request
import json
import time

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/run-step1-filter',
    data=json.dumps({
        'threshold': 0.70,
        'force': True,
        'delay': 0.01,
        'file_path': 'data/raw/step1_followers_raw_2026-10-19T05-43-13.json'
    }).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)
resp = urllib.request.urlopen(req)
print('Filter start response:', json.loads(resp.read().decode('utf-8')))

time.sleep(1)
for _ in range(30):
    st = json.loads(urllib.request.urlopen('http://127.0.0.1:8000/api/step1-filter-status').read().decode('utf-8'))
    print(f"Progress: {st.get('current')}/{st.get('total')} ({st.get('percent')}%) Logs count: {len(st.get('recent_logs', []))}")
    if not st.get('is_running') and st.get('total', 0) > 0:
        print('Finished! Results approved dogs:', len(st.get('results', [])))
        for log in st.get('recent_logs', [])[:10]:
            print('  Log sample:', log.get('status'), '|', log.get('name'), '->', log.get('reason'))
        break
    time.sleep(1)
