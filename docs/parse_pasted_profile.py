import re
import json

with open("scratch_user_pasted_profile.html", "r", encoding="utf-8") as f:
    text = f.read()

print("File size:", len(text))

# Find __eqmc
eqmc_match = re.search(r'<script id="__eqmc" type="application/json"[^>]*>(.*?)</script>', text, re.DOTALL)
if eqmc_match:
    eqmc = json.loads(eqmc_match.group(1))
    print("EQMC JSON:", eqmc)

# Find user ID in __eqmc:
m_user = re.search(r'__user=(\d+)', text)
if m_user:
    print("Viewer/Session User ID:", m_user.group(1))

# Check any vanity or script path
m_script = re.search(r'"s"\s*:\s*"([^"]+)"', text)
if m_script:
    print("Script path:", m_script.group(1))

# Search for any profile links or URLs in the HTML
urls = re.findall(r'https?://[^\s"\'<>]+', text)
print(f"Total URLs found in header/scripts: {len(urls)}")
for u in urls[:15]:
    print("  ", u)
