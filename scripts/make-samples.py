#!/usr/bin/env python3
"""生成几张抽象渐变示例图（仅用于让页面不为空），再调用 add-work.py 入库。"""
import math, random, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent

def gradient(w, h, c1, c2):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / w * 0.6 + y / h * 0.4)
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return img

def sample1(w=2048, h=2048):
    img = gradient(w // 4, h // 4, (40, 20, 90), (250, 120, 90)).resize((w, h), Image.BICUBIC)
    d = ImageDraw.Draw(img, "RGBA")
    d.ellipse((w*0.55, h*0.18, w*0.85, h*0.48), fill=(255, 230, 180, 230))
    for i, col in enumerate([(70, 40, 110, 255), (50, 25, 80, 255), (30, 15, 50, 255)]):
        base = h * (0.62 + i * 0.1)
        pts = [(0, h)] + [(x, base - 120 * math.sin(x / w * math.pi * (2 + i)) - 60 * i) for x in range(0, w + 1, 32)] + [(w, h)]
        d.polygon(pts, fill=col)
    return img

def sample2(w=1536, h=2048):
    random.seed(7)
    img = gradient(w // 4, h // 4, (8, 20, 40), (10, 80, 110)).resize((w, h), Image.BICUBIC)
    layer = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(layer)
    for _ in range(60):
        x, y, r = random.randint(0, w), random.randint(0, h), random.randint(20, 220)
        c = random.choice([(90, 209, 200), (139, 124, 255), (255, 160, 200)])
        d.ellipse((x - r, y - r, x + r, y + r), fill=c + (random.randint(40, 120),))
    layer = layer.filter(ImageFilter.GaussianBlur(18))
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")

def sample3(w=2048, h=1152):
    img = gradient(w // 4, h // 4, (240, 235, 225), (200, 210, 230)).resize((w, h), Image.BICUBIC)
    d = ImageDraw.Draw(img)
    random.seed(3)
    palette = [(230, 80, 60), (40, 60, 140), (245, 190, 50), (30, 30, 30), (90, 160, 120)]
    for _ in range(14):
        x, y = random.randint(0, w), random.randint(0, h)
        s = random.randint(80, 360)
        c = random.choice(palette)
        if random.random() < 0.5:
            d.rectangle((x, y, x + s, y + s * 0.6), fill=c)
        else:
            d.ellipse((x, y, x + s, y + s), fill=c)
    return img

SAMPLES = [
    (sample1, "示例：紫色黄昏的群山", "sunset-mountains",
     "layered mountain silhouettes at dusk, a huge pale sun, purple to coral gradient sky, flat vector illustration, minimal, calm atmosphere",
     "示例,风景,渐变,插画", "2026-10-24"),
    (sample2, "示例：深海光斑", "deep-sea-bokeh",
     "abstract underwater scene, glowing bokeh orbs in teal, violet and pink, soft blur, deep ocean blue background, dreamy, vertical composition",
     "示例,抽象,光斑", "2026-10-23"),
    (sample3, "示例：包豪斯几何", "bauhaus-shapes",
     "bauhaus style composition, scattered primary color circles and rectangles on warm paper texture, clean geometric poster, 16:9",
     "示例,抽象,几何", "2026-10-22"),
]

with tempfile.TemporaryDirectory() as tmp:
    for fn, title, slug, prompt, tags, date in SAMPLES:
        src = Path(tmp) / f"{slug}.png"
        fn().save(src)
        subprocess.run([sys.executable, str(HERE / "add-work.py"), str(src), "--title", title, "--slug", slug,
                        "--prompt", prompt, "--model", "示例（脚本生成）", "--tags", tags.replace("，", ","),
                        "--date", date, "--source", "scripts/make-samples.py", "--force"], check=True)
