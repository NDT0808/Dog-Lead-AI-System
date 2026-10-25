import cv2
from ultralytics import YOLO
import os

# Đường dẫn tới model ONNX (hoặc file .pt gốc)
# Vì script này nằm trong thư mục Test_model, ta trỏ ngược ra ngoài thư mục extension để lấy model
model_path = os.path.join("..", "extension", "dog-model.onnx")

print("=========================================")
print(f"⏳ Đang nạp model AI từ: {model_path}")
print("=========================================")

try:
    model = YOLO(model_path, task='detect')
    print("✅ Nạp model thành công!\n")
except Exception as e:
    print(f"❌ Lỗi nạp model: {e}")
    # Fallback sử dụng file .pt gốc nếu ONNX bị lỗi
    pt_path = r"C:\Users\ASUS\runs\detect\train5\weights\best.pt"
    print(f"⏳ Thử nạp model gốc: {pt_path}")
    model = YOLO(pt_path)
    print("✅ Nạp model gốc thành công!\n")

# Yêu cầu người dùng nhập đường dẫn video
video_path = input("👉 Kéo thả file video (.mp4) vào đây và nhấn Enter: ").strip()
# Xóa bỏ dấu nháy kép thừa nếu copy paste đường dẫn trên Windows
video_path = video_path.strip('"').strip("'")

cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("❌ Không thể mở được video. Vui lòng kiểm tra lại đường dẫn!")
    exit()

print("\n▶️ Đang phát video... (Nhấn phím 'q' trên cửa sổ video để THOÁT)")

while True:
    ret, frame = cap.read()
    if not ret:
        print("🎬 Đã phát hết video.")
        break
        
    # Resize frame nếu video quá to (vượt quá màn hình)
    height, width = frame.shape[:2]
    max_height = 800
    if height > max_height:
        scale = max_height / height
        frame = cv2.resize(frame, (int(width * scale), int(height * scale)))

    # Quét bằng AI (chỉnh tham số conf=0.5 để thay đổi độ nhạy Threshold)
    results = model.predict(source=frame, conf=0.5, verbose=False)
    
    # Hàm plot() cực kỳ bá đạo của YOLO sẽ tự động vẽ Bounding Box màu đẹp mắt kèm nhãn và tỷ lệ %
    annotated_frame = results[0].plot()
    
    # Hiển thị lên cửa sổ
    cv2.imshow("YOLOv8 AI Testing - Nhan 'q' de thoat", annotated_frame)
    
    # Đợi 1ms và lắng nghe phím 'q' để thoát. 
    # (Để làm chậm video, bạn có thể thay số 1 bằng 30 hoặc 50)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
