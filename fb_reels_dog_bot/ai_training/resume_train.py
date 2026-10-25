from ultralytics import YOLO
import os

def resume_training():
    print("\n=== TIẾP TỤC HUẤN LUYỆN YOLO TỪ TIẾN TRÌNH ĐANG DANG DỞ ===")
    
    checkpoint_path = 'runs/detect/train/weights/last.pt'
    
    if not os.path.exists(checkpoint_path):
        print(f"❌ Không tìm thấy file lưu trữ tại: {checkpoint_path}")
        print("Lưu ý: Mô hình phải hoàn thành ít nhất 1 vòng lặp (Epoch) thì hệ thống mới lưu file checkpoint để có thể chạy tiếp được.")
        return
        
    try:
        print("✅ Đã tìm thấy checkpoint! Đang khôi phục lại tiến trình...")
        # Tải lại mô hình từ lần lưu cuối cùng
        model = YOLO(checkpoint_path)
        # Tiếp tục train (hệ thống tự động nhớ đã chạy đến Epoch nào và dùng lại cấu hình cũ)
        model.train(resume=True)
        
        # Sau khi train xong thì vẫn xuất ra ONNX như bình thường
        print("\n=== XUẤT MÔ HÌNH SANG APP PLUGIN (ONNX) ===")
        model.export(format='onnx')
        print("🎉 XONG! Mô hình ONNX đã sẵn sàng.")
    except Exception as e:
        print("Đã xảy ra lỗi khi khôi phục:", e)

if __name__ == '__main__':
    resume_training()
