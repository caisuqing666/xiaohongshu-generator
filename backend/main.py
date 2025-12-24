from fastapi import FastAPI, UploadFile, File
from fastapi.responses import Response
from PIL import Image
import io
import numpy as np

app = FastAPI()


def simple_background_cutout(img: Image.Image, threshold: float = 30.0) -> Image.Image:
  """
  简易抠图：
  - 假设背景颜色与四个角区域相近
  - 计算四个角的小块平均颜色，作为“背景参考色”
  - 与该颜色距离较近的像素 → alpha 设为 0（透明）
  - 其它像素保留原始颜色与不透明度
  这不是严格的语义分割，但在“纯色/近纯色背景 + 人物/物体”场景下效果会比较直观。
  """
  img = img.convert("RGBA")
  np_img = np.array(img).astype(np.float32)

  h, w, _ = np_img.shape
  patch = 10  # 取角落 10x10 小块

  # 四个角的 patch
  patches = [
    np_img[0:patch, 0:patch, :3],
    np_img[0:patch, w - patch : w, :3],
    np_img[h - patch : h, 0:patch, :3],
    np_img[h - patch : h, w - patch : w, :3],
  ]
  bg_color = np.mean(np.concatenate([p.reshape(-1, 3) for p in patches], axis=0), axis=0)

  # 计算每个像素与背景色的欧氏距离
  diff = np_img[:, :, :3] - bg_color[None, None, :]
  dist = np.sqrt(np.sum(diff * diff, axis=2))

  # 距离小于阈值 → 认为是背景，设置 alpha=0
  alpha = np_img[:, :, 3]
  alpha[dist < threshold] = 0

  np_img[:, :, 3] = alpha

  out = Image.fromarray(np.clip(np_img, 0, 255).astype(np.uint8), mode="RGBA")
  return out


@app.post("/api/segment")
async def segment_image(file: UploadFile = File(...)):
  """
  简易“智能抠图”接口：
  - 输入：任意图片（jpg/png 等）
  - 输出：背景被简易抠掉、带透明通道的 PNG
  以后可以在这里替换为 U²-Net / SAM 等真正的分割模型。
  """
  content = await file.read()
  img = Image.open(io.BytesIO(content)).convert("RGBA")

  cutout = simple_background_cutout(img)

  buf = io.BytesIO()
  cutout.save(buf, format="PNG")
  buf.seek(0)

  return Response(buf.getvalue(), media_type="image/png")


@app.get("/health")
async def health_check():
  return {"status": "ok"}




