import pandas as pd
import requests
import os
import warnings
from PIL import Image
from io import BytesIO
from ultralytics import YOLO

warnings.filterwarnings("ignore")

# Load CUSTOM YOLOv8 ONNX model
MODEL_PATH = r"c:\Users\ASUS\Downloads\Marketing_Pet&Grass\fb_reels_dog_bot\extension\dog-model.onnx"
print(f"Đang tải mô hình Custom AI: {MODEL_PATH}...")
model = YOLO(MODEL_PATH, task='detect')

# Thư mục lưu ảnh tải về
SAVE_DIR = "Downloaded_Images"
if not os.path.exists(SAVE_DIR):
    os.makedirs(SAVE_DIR)

def download_and_check_dog(image_url, save_filename):
    try:
        if pd.isna(image_url) or not str(image_url).startswith('http'):
            return False
            
        # Download image
        response = requests.get(image_url, timeout=5)
        if response.status_code != 200:
            return False
            
        img = Image.open(BytesIO(response.content)).convert('RGB')
        
        # Save to disk
        save_path = os.path.join(SAVE_DIR, save_filename)
        img.save(save_path)
        
        # Chạy YOLO model
        results = model.predict(source=img, conf=0.25, verbose=False)
        
        # Model có các class: {0: 'adult_dog', 1: 'non-dog', 2: 'puppy-dog'}
        # => Đạt yêu cầu nếu phát hiện class 0 hoặc 2
        TARGET_CLASSES = [0, 2]
        
        for result in results:
            boxes = result.boxes
            for box in boxes:
                cls_id = int(box.cls[0])
                if cls_id in TARGET_CLASSES:
                    return True
        return False
    except Exception as e:
        return False

# ==========================================
# CẤU HÌNH ĐƯỜNG DẪN FILE CSV TỪ EXTENSION
# ==========================================
CSV_FILE = input("Nhập đường dẫn file CSV (từ Step 1): ").strip().strip('"')

if not os.path.exists(CSV_FILE):
    print("Không tìm thấy file!")
    exit()

print(f"\nĐang đọc file: {CSV_FILE}")
df = pd.read_csv(CSV_FILE)

# Cột chứa link ảnh (sửa tên cột nếu cần)
avatar_col = 'Avatar URL'
cover_col = 'Cover URL'

df['Visual_High_Relevance'] = False
passed_profiles = []
failed_profiles = []

print(f"\nBắt đầu chạy AI YOLOv8 phân tích... (Ảnh sẽ được lưu vào thư mục {SAVE_DIR}/)")
for index, row in df.iterrows():
    name = str(row.get('Name', f'Unknown_{index}')).replace('/', '_').replace('\\', '_')
    if name == 'nan' or not name.strip() or name == 'Profile_Unknown':
        name = f"Profile_{index}"
        
    print(f"Đang xử lý [{index+1}/{len(df)}]: {name}")
    
    avatar_url = row.get(avatar_col, "")
    cover_url = row.get(cover_col, "")
    intro_text = str(row.get('Intro', ''))
    url_text = str(row.get('URL', ''))
    
    is_dog_avatar = False
    is_dog_cover = False
    is_dog_text = False
    
    # --- KIỂM TRA BẰNG KEYWORD TEXT TRƯỚC ---
    # Nếu Tên, URL, hoặc Intro có chứa các từ khóa về chó thì cho qua luôn
    keywords = ['dog', 'dogs', 'puppy', 'puppies', 'canine', 'pup', 'pups', 'hound', 'kennel', 'chihuahua', 'dachshund', 'retriever']
    text_to_search = f"{name} {url_text} {intro_text}".lower()
    
    for kw in keywords:
        # Tìm từ khóa đứng độc lập hoặc nằm trong chuỗi
        if kw in text_to_search:
            is_dog_text = True
            print(f"  => [TEXT] Phát hiện từ khóa '{kw}' trong thông tin trang!")
            break
            
    # --- KIỂM TRA BẰNG AI VISION ---
    # 1. Tải và kiểm tra Avatar
    if avatar_url and str(avatar_url) != 'nan':
        filename = f"{name}_avatar.jpg"
        is_dog_avatar = download_and_check_dog(avatar_url, filename)
        if is_dog_avatar:
            print("  => [YOLO] Phát hiện CHÓ trên Avatar!")
            
    # 2. Tải và kiểm tra Cover
    if cover_url and str(cover_url) != 'nan':
        filename = f"{name}_cover.jpg"
        is_dog_cover = download_and_check_dog(cover_url, filename)
        if is_dog_cover:
            print("  => [YOLO] Phát hiện CHÓ trên Cover!")

    # Đạt yêu cầu nếu Text chứa keyword HOẶC AI nhìn thấy chó
    if is_dog_text or is_dog_avatar or is_dog_cover:
        df.at[index, 'Visual_High_Relevance'] = True
        passed_profiles.append(name)
    else:
        failed_profiles.append(name)

# Xuất kết quả
output_file = CSV_FILE.replace(".csv", "_YOLO_Scored.csv")
passed_urls_file = CSV_FILE.replace(".csv", "_Passed_URLs.txt")

df.to_csv(output_file, index=False, encoding='utf-8-sig')

# Save only passed URLs to a text file
passed_df = df[df['Visual_High_Relevance'] == True]
passed_df['URL'].to_csv(passed_urls_file, index=False, header=False)

print("\n" + "="*50)
print("📊 BÁO CÁO THỐNG KÊ KẾT QUẢ AI & KEYWORD")
print("="*50)
print(f"Tổng số Profile đã quét: {len(df)}")
print(f"✅ Số Profile ĐẠT (Có chó hoặc Keyword): {len(passed_profiles)}")
print(f"❌ Số Profile TRƯỢT (Không thấy chó & Keyword): {len(failed_profiles)}")

if len(failed_profiles) > 0:
    print("\nDanh sách các Profile TRƯỢT:")
    for p in failed_profiles:
        print(f"   - {p}")

print("="*50)
print(f"\nHoàn tất! Đã lưu file kết quả tại: {output_file}")
print(f"ĐẶC BIỆT: Đã trích xuất sẵn {len(passed_profiles)} link ĐẠT vào file: {passed_urls_file}")
print("=> Bạn hãy mở file txt trên, copy toàn bộ link và dán thẳng vào Step 3 nhé!")

