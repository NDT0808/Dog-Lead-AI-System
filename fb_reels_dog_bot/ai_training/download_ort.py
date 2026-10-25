import urllib.request
import os

files = [
    ("ort.min.js", "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort.min.js"),
    ("ort-wasm.wasm", "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort-wasm.wasm"),
    ("ort-wasm-simd.wasm", "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/ort-wasm-simd.wasm")
]

for filename, url in files:
    print(f"Downloading {filename}...")
    urllib.request.urlretrieve(url, filename)
    print(f"Downloaded {filename}")
