import urllib.request

print("Downloading tf.min.js...")
urllib.request.urlretrieve("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.20.0/dist/tf.min.js", "tf.min.js")

print("Downloading coco-ssd.js...")
urllib.request.urlretrieve("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.2/dist/coco-ssd.min.js", "coco-ssd.js")

print("Done!")
