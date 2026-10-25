#!/usr/bin/env python3
"""添加一件作品：把原图转成 WebP 展示图 + 缩略图，并生成 manifest.json。

用法示例：
  python3 scripts/add-work.py ~/Pictures/cat.png \
      --title "月光下的猫" --prompt "a cat under moonlight, ..." \
      --model "image2" --tags 猫,夜景,插画

原图不会被复制进仓库，只会写入压缩后的 WebP。依赖：pip install Pillow
"""
import argparse, datetime, json, re, sys, unicodedata
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("缺少 Pillow，请先运行：pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
WORKS = ROOT / "works"


def slugify(text):
    text = unicodedata.normalize("NFKC", text).strip().lower()
    text = re.sub(r"[^\w\u4e00-\u9fff-]+", "-", text)
    return re.sub(r"-+", "-", text).strip("-")[:60] or "work"


def save_webp(img, path, max_long=None, width=None, quality=82):
    im = img.copy()
    if max_long and max(im.size) > max_long:
        im.thumbnail((max_long, max_long), Image.LANCZOS)
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(path, "WEBP", quality=quality, method=6)
    return im.size


def main():
    p = argparse.ArgumentParser(description="添加一件 AI 图片作品")
    p.add_argument("image", help="原图路径（png/jpg/webp 等）")
    p.add_argument("--title", required=True)
    p.add_argument("--prompt", help="提示词文本")
    p.add_argument("--prompt-file", help="从文件读取提示词（长提示词推荐）")
    p.add_argument("--negative-prompt", default="")
    p.add_argument("--model", required=True)
    p.add_argument("--tags", default="", help="逗号分隔，如：猫,夜景")
    p.add_argument("--date", default=datetime.date.today().isoformat(), help="YYYY-MM-DD，默认今天")
    p.add_argument("--source", default="", help="来源（可选），如平台名或链接")
    p.add_argument("--slug", help="文件夹名后缀，默认根据标题生成")
    p.add_argument("--max-long", type=int, default=2048, help="展示图长边像素，默认 2048")
    p.add_argument("--thumb-width", type=int, default=480, help="缩略图宽度，默认 480")
    p.add_argument("--quality", type=int, default=82)
    p.add_argument("--force", action="store_true", help="覆盖已存在的同名作品")
    a = p.parse_args()

    prompt = a.prompt
    if a.prompt_file:
        prompt = Path(a.prompt_file).read_text(encoding="utf-8").strip()
    if not prompt:
        sys.exit("需要 --prompt 或 --prompt-file")
    datetime.date.fromisoformat(a.date)

    wid = f"{a.date}-{a.slug or slugify(a.title)}"
    folder = WORKS / wid
    if folder.exists() and not a.force:
        sys.exit(f"{folder} 已存在，加 --force 覆盖或换 --slug")
    folder.mkdir(parents=True, exist_ok=True)

    img = ImageOps.exif_transpose(Image.open(a.image))
    img = img.convert("RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB")
    w, h = save_webp(img, folder / "image.webp", max_long=a.max_long, quality=a.quality)
    save_webp(img, folder / "thumb.webp", width=a.thumb_width, quality=75)

    manifest = {
        "id": wid,
        "title": a.title,
        "type": "image",
        "file": "image.webp",
        "thumb": "thumb.webp",
        "width": w,
        "height": h,
        "prompt": prompt,
        "model": a.model,
        "tags": [t.strip() for t in re.split(r"[,，]", a.tags) if t.strip()],
        "date": a.date,
    }
    if a.negative_prompt:
        manifest["negative_prompt"] = a.negative_prompt
    if a.source:
        manifest["source"] = a.source
    (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    size = sum(f.stat().st_size for f in folder.iterdir()) / 1024
    print(f"已生成 works/{wid}/  ({w}x{h}, 共 {size:.0f} KB)")


if __name__ == "__main__":
    main()
