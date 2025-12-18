from io import BytesIO

import numpy as np
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import Response
from PIL import Image

# 这里预留 ONNX 模型加载位置：
# import onnxruntime as ort
# session = ort.InferenceSession("models/u2net.onnx", providers=["CPUExecutionProvider"])

app = FastAPI(title="Photo Segmenter Backend", version="0.1.0")


def pil_image_to_rgba(img: Image.Image) -> Image.Image:
  """
  确保图片为 RGBA，方便后续处理。
  目前作为占位实现：直接返回原图的 RGBA 版本，相当于“未真正抠图”。
  后续接入 U²-Net / SAM 时，只需要在这里用 mask 调整 alpha 通道即可。
  """
  if img.mode != "RGBA":
    img = img.convert("RGBA")
  return img


@app.post("/api/segment")
async def segment_image(file: UploadFile = File(...)):
  """
  智能抠图接口（占位版本）

  - 输入：任意图片
  - 当前行为：把图片转换为 RGBA 后原样返回（不改变内容）
  - 后续可在此处接入 ONNX 模型，对前景生成 mask，再写入 alpha 通道
  """
  content = await file.read()
  image = Image.open(BytesIO(content))

  # 占位：将图片转换为 RGBA。未来接入模型时在此处修改 alpha 通道。
  rgba_image = pil_image_to_rgba(image)

  buf = BytesIO()
  rgba_image.save(buf, format="PNG")
  buf.seek(0)

  return Response(
    content=buf.read(),
    media_type="image/png",
    headers={"Content-Disposition": 'inline; filename="segmented.png"'},
  )


@app.get("/health")
async def health_check():
  return {"status": "ok"}


if __name__ == "__main__":
  import uvicorn

  uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


