from ultralytics import YOLO
import time
import os

def train_and_export():
    print("\n=== HUẤN LUYỆN YOLO-NANO (OBJECT DETECTION) VỚI DATA TỪ ROBOFLOW ===")
    
    # 1. Đọc đường dẫn dataset từ file download_new_dataset.py sinh ra
    data_yaml = 'dog_dataset/data.yaml'
    if os.path.exists("dataset_path.txt"):
        with open("dataset_path.txt", "r") as f:
            data_yaml = os.path.join(f.read().strip(), "data.yaml")
    
    print(f"Đang sử dụng dữ liệu tại: {data_yaml}")
    
    # 2. Tải mô hình YOLOv8-nano Object Detection (bỏ chữ -cls)
    print("Đang tải YOLOv8-nano (Pre-trained)...")
    model = YOLO('yolov8n.pt') 
    
    # 3. Huấn luyện với các tham số chống nhiễu (Augmentation) và chống Overfitting
    print("🚀 Bắt đầu quá trình Training...")
    results = model.train(
        data=data_yaml,
        epochs=100,             # Giảm số epochs kết hợp early stopping
        patience=30,            # Dừng sớm nếu quá 30 epoch không cải thiện (chống overfitting)
        imgsz=640,              # Object detection thường dùng ảnh 640 để tránh mất vật thể nhỏ
        optimizer='AdamW',      
        lr0=0.0001, 
        batch=16,
        workers=0,
        dropout=0.2,            # Dropout 20%
        hsv_h=0.015,            # Đổi màu nhẹ (chống nhiễu ánh sáng)
        hsv_s=0.7,              
        hsv_v=0.4,              
        degrees=10.0,           # Xoay ảnh +- 10 độ
        flipud=0.2,             
        fliplr=0.5              
    )
    
    # 4. Đánh giá mô hình: Đo độ chính xác (mAP) thay vì Accuracy Top-1 (do là Object Detection)
    print("\n=== ĐÁNH GIÁ MÔ HÌNH ===")
    metrics = model.val(data=data_yaml, imgsz=640)
    map50 = metrics.box.map50
    print(f"✅ Độ chính xác (mAP@0.5): {map50 * 100:.2f}%")
    
    if map50 < 0.6:
        print("⚠️ Cảnh báo: Độ chính xác dưới 60%. Bạn cần xem lại ảnh gán nhãn đã chuẩn chưa.")
    else:
        print("🎯 Mô hình học rất tốt, nhận diện chuẩn!")

    # 5. Đo tốc độ xử lý (FPS)
    print("\n=== ĐO TỐC ĐỘ XỬ LÝ (FPS) ===")
    test_dir = os.path.join(os.path.dirname(data_yaml), 'test', 'images')
    if os.path.exists(test_dir) and len(os.listdir(test_dir)) > 0:
        test_img = os.path.join(test_dir, os.listdir(test_dir)[0])
        start_time = time.time()
        for _ in range(50):
            model.predict(test_img, imgsz=640, verbose=False)
        total_time = time.time() - start_time
        fps = 50 / total_time
        print(f"⚡ Tốc độ khung hình (FPS): ~{fps:.1f} FPS (Rất mượt để chạy realtime)")
    else:
        print("Không tìm thấy ảnh test để đo FPS.")

    # 6. Xuất ONNX
    print("\n=== XUẤT MÔ HÌNH SANG APP PLUGIN (ONNX) ===")
    model.export(format='onnx')
    print("🎉 XONG! Mô hình ONNX đã sẵn sàng.")

if __name__ == '__main__':
    train_and_export()
