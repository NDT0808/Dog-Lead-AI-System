import sys
from ultralytics import YOLO

def test_model(image_path):
    print(f"Đang tải mô hình ONNX đã huấn luyện (dog-model.onnx)...")
    
    # Load model
    try:
        model = YOLO('dog-model.onnx', task='classify')
    except Exception as e:
        print(f"Không thể tải mô hình: {e}")
        return

    print(f"Đang phân tích hình ảnh: {image_path}")
    
    # Chạy dự đoán
    results = model(image_path, imgsz=224)
    
    # In kết quả
    for result in results:
        names = result.names
        probs = result.probs.data.tolist()
        
        print("\n=== KẾT QUẢ DỰ ĐOÁN ===")
        # Lấy class dự đoán cao nhất
        top1_idx = result.probs.top1
        top1_conf = result.probs.top1conf.item()
        
        print(f"Dự đoán chính: {names[top1_idx].upper()} (Độ tự tin: {top1_conf*100:.2f}%)")
        print("\nChi tiết các nhãn:")
        for i, prob in enumerate(probs):
            print(f" - {names[i]}: {prob*100:.2f}%")
        
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Sử dụng: python test_yolo.py <đường_dẫn_đến_ảnh>")
        print("Ví dụ: python test_yolo.py dog_dataset/val/puppy/img_0.jpg")
    else:
        test_model(sys.argv[1])
