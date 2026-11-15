"""スマホ用バナー：背景＋前景（見出し・演出）を合成して、ループするアニメーション WebP にする。

    python compose.py <出力 .webp> [fps] [quality] [背景: card | fluid]

背景
  card  … Stats などのカードと同じ、動かない紺の背景（既定）。
           変わるのは文字や線の部分だけなので、各コマの差分が小さく、スマホでも軽い。
  fluid … 水中の絵の具（render.mjs の各コマ）。毎コマ全体が変わるため重い。

SVG のバナーは動くたびに画像全体を描き直すため、スマホでは処理が追いつかず止まることがある。
こちらは 1 コマずつ表示するだけの普通のアニメーション画像なので、スマホでも軽く再生できる。
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

here = Path(__file__).resolve().parent
out = Path(sys.argv[1])
fps = float(sys.argv[2]) if len(sys.argv) > 2 else 12
quality = int(sys.argv[3]) if len(sys.argv) > 3 else 80
bg_mode = sys.argv[4] if len(sys.argv) > 4 else "card"

# 前景：overlay-anim.mjs で書き出した「コマごとの前景」があればそれを使う（演出つき）。
#       なければ overlay.mjs の静止した前景 1 枚を使う。
anim_paths = sorted((here / ".cache" / "overlay-frames").glob("o*.png"))
static_overlay = None if anim_paths else Image.open(here / ".cache" / "overlay.png").convert("RGBA")
first = Image.open(anim_paths[0]) if anim_paths else static_overlay
W, H = first.size
scale = W / 804

# カードの角丸（SVG の clipPath と同じ rx=20 を倍率に合わせる）
mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), radius=round(20 * scale), fill=255)


def card_background():
    """Stats などのカードと同じ背景：紺の地＋左上からのうっすらしたエメラルドの光＋上辺の細い光のライン。"""
    bg = Image.new("RGBA", (W, H), (11, 18, 32, 255))  # #0B1220
    # 左上のエメラルドの光（カードの k-glow と同じ考え方：中心から外へ透明になる円形の光）
    r = round(max(W * 0.55, 240 * scale))
    falloff = Image.radial_gradient("L").resize((r * 2, r * 2), Image.BICUBIC)  # 中心 0 → 外側 255
    alpha = falloff.point(lambda v: round(max(0, 255 - v) * 0.13))
    glow = Image.new("RGBA", (r * 2, r * 2), (16, 185, 129, 0))
    glow.putalpha(alpha)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer.paste(glow, (round(W * 0.12) - r, -r), glow)
    bg = Image.alpha_composite(bg, layer)
    # 上辺の細い光のライン（エメラルド → シアン、両端は透明）
    line = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x0, x1 = round(W * 0.18), round(W * 0.82)
    for x in range(x0, x1):
        t = (x - x0) / (x1 - x0)
        c = (16, 185, 129) if t < 0.5 else (56, 189, 248)
        a = min(t / 0.35, (1 - t) / 0.35, 1.0)
        line.putpixel((x, 0), (*c, round(255 * a * 0.9)))
        line.putpixel((x, 1), (*c, round(255 * a * 0.35)))
    return Image.alpha_composite(bg, line)


if bg_mode == "card":
    count = len(anim_paths) or 1
    background = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    background.paste(card_background(), (0, 0), mask)
    backgrounds = lambda i: background
else:
    fluid_paths = sorted((here / ".cache" / "frames").glob("f*.png"))
    if anim_paths and len(anim_paths) != len(fluid_paths):
        sys.exit(f"overlay frames ({len(anim_paths)}) and fluid frames ({len(fluid_paths)}) differ: fps / seconds を揃えてください")
    count = len(fluid_paths)

    def backgrounds(i):
        fluid = Image.open(fluid_paths[i]).convert("RGB").resize((W, H), Image.BICUBIC)  # 柔らかい表現なので拡大で十分
        card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        card.paste(fluid, (0, 0), mask)
        return card

frames = []
for i in range(count):
    overlay = Image.open(anim_paths[i]).convert("RGBA") if anim_paths else static_overlay
    frames.append(Image.alpha_composite(backgrounds(i), overlay))

frames[0].save(
    out,
    save_all=True,
    append_images=frames[1:],
    duration=round(1000 / fps),
    loop=0,
    quality=quality,
    method=6,             # 圧縮に時間をかけて小さく
    # minimize_size は差分の重ね合わせでブロック状の粗さが溜まるため使わない
    # 画面全体を保存し直すコマ（キーフレーム）の間隔をループ全体まで広げる。
    # 既定では十数コマごとに全体を保存し直すため、背景が動かなくてもサイズが大きくなる
    kmax=len(frames),
    kmin=len(frames) // 2 + 1,
)
print(f"{len(frames)} frames {W}x{H} ({bg_mode}) -> {out} ({out.stat().st_size / 1024:.0f} KB)")
