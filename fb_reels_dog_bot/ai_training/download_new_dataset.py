from roboflow import Roboflow
import os

print("Đang kết nối tới Roboflow để tải dataset...")
rf = Roboflow(api_key="85uNlO01ymcOS0rvA6r6")
project = rf.workspace("ndt-clryb").project("dog-age-detection-dge5h-hvcwo-7chtz-ginjf-jad2b-r1o0d-nyk1g-etmsy")
version = project.version(1)
dataset = version.download("yolov8")

print(f"\nDữ liệu đã được tải về thành công tại: {dataset.location}")

with open("dataset_path.txt", "w") as f:
    f.write(dataset.location)
