"""書き出したコマを、ループするアニメーション WebP にまとめる。

    python encode.py [fps] [quality]
"""
import sys
from pathlib import Path

from PIL import Image

here = Path(__file__).resolve().parent
fps = float(sys.argv[1]) if len(sys.argv) > 1 else 12
quality = int(sys.argv[2]) if len(sys.argv) > 2 else 62

frames = [Image.open(p).convert("RGB") for p in sorted((here / ".cache" / "frames").glob("f*.png"))]
out = here / ".cache" / "fluid.webp"
frames[0].save(
    out,
    save_all=True,
    append_images=frames[1:],
    duration=round(1000 / fps),
    loop=0,          # 無限ループ
    quality=quality,
    method=6,        # 圧縮に時間をかけてサイズを小さく
)
print(f"{len(frames)} frames -> {out} ({out.stat().st_size / 1024:.0f} KB)")
