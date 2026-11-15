"""スマホ用バナー：流体の各コマ＋前景（overlay.png）を合成して、ループするアニメーション WebP にする。

    python compose.py <出力 .webp> [fps] [quality]

SVG のバナーは動くたびに画像全体を描き直すため、スマホでは処理が追いつかず止まることがある。
こちらは 1 コマずつ表示するだけの普通のアニメーション画像なので、スマホでも軽く再生できる。
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

here = Path(__file__).resolve().parent
out = Path(sys.argv[1])
fps = float(sys.argv[2]) if len(sys.argv) > 2 else 20
quality = int(sys.argv[3]) if len(sys.argv) > 3 else 80

fluid_paths = sorted((here / ".cache" / "frames").glob("f*.png"))
# 前景：overlay-anim.mjs で書き出した「コマごとの前景」があればそれを使う（演出つき）。
#       なければ overlay.mjs の静止した前景 1 枚を全コマに使う。
anim_paths = sorted((here / ".cache" / "overlay-frames").glob("o*.png"))
if anim_paths and len(anim_paths) != len(fluid_paths):
    sys.exit(f"overlay frames ({len(anim_paths)}) and fluid frames ({len(fluid_paths)}) differ: fps / seconds を揃えてください")
static_overlay = None if anim_paths else Image.open(here / ".cache" / "overlay.png").convert("RGBA")
first = Image.open(anim_paths[0]) if anim_paths else static_overlay
W, H = first.size
scale = W / 804

# カードの角丸（SVG の clipPath と同じ rx=20 を倍率に合わせる）
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), radius=round(20 * scale), fill=255)

frames = []
for i, p in enumerate(fluid_paths):
    fluid = Image.open(p).convert("RGB").resize((W, H), Image.BICUBIC)  # 柔らかい表現なので拡大で十分
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    card.paste(fluid, (0, 0), mask)
    overlay = Image.open(anim_paths[i]).convert("RGBA") if anim_paths else static_overlay
    frames.append(Image.alpha_composite(card, overlay))

frames[0].save(
    out,
    save_all=True,
    append_images=frames[1:],
    duration=round(1000 / fps),
    loop=0,
    quality=quality,
    method=4,
)
print(f"{len(frames)} frames {W}x{H} -> {out} ({out.stat().st_size / 1024:.0f} KB)")
