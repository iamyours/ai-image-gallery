# AI 图片作品集 · ai-image-gallery

AI 生成图片的展示站，每件作品附带提示词，可一键复制。

- 在线地址：<https://iamyours.github.io/ai-image-gallery/>
- 数据接口：<https://iamyours.github.io/ai-image-gallery/works.json>

本仓库是 `ai-showcase` 总站的图片子仓库（同系列还有 `ai-video-gallery`、3D 子仓库）。总站只需拉取上面的 `works.json`，图片直接引用本站地址，不用拷贝文件。

## 目录结构

```
works/
  2026-10-24-sunset-mountains/   每件作品一个文件夹：日期-短名
    image.webp                   展示图（WebP，长边约 2048px）
    thumb.webp                   缩略图（WebP，宽约 480px）
    manifest.json                作品信息
site/                            页面（纯 HTML/CSS/JS，无框架）
scripts/
  add-work.py                    添加作品：原图 -> WebP + 缩略图 + manifest
  build.mjs                      构建：合并所有 manifest -> dist/works.json
  make-samples.py                生成示例作品（仅演示用）
.github/workflows/deploy.yml     推送到 main 后自动构建并部署到 GitHub Pages
```

## manifest.json 格式

```json
{
  "id": "2026-10-24-sunset-mountains",
  "title": "紫色黄昏的群山",
  "type": "image",
  "file": "image.webp",
  "thumb": "thumb.webp",
  "width": 2048,
  "height": 2048,
  "prompt": "layered mountain silhouettes at dusk, ...",
  "negative_prompt": "blurry, low quality",
  "model": "image2",
  "tags": ["风景", "插画"],
  "date": "2026-10-24",
  "source": "bytecatcode"
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 是 | 与文件夹同名 |
| `title` | 是 | 标题 |
| `type` | 是 | 固定为 `image` |
| `file` / `thumb` | 是 | 展示图、缩略图文件名（相对作品文件夹） |
| `prompt` | 是 | 提示词 |
| `negative_prompt` | 否 | 反向提示词 |
| `model` | 是 | 使用的模型 |
| `tags` | 是 | 标签数组，用于页面筛选 |
| `date` | 是 | `YYYY-MM-DD` |
| `source` | 否 | 来源平台或链接 |
| `width` / `height` | 否 | 展示图尺寸，`add-work.py` 自动写入，用于避免页面跳动 |

## 添加一件作品

需要 Python 3 和 Pillow（`pip install Pillow`）。

```bash
python3 scripts/add-work.py ~/Downloads/原图.png \
  --title "月光下的猫" \
  --prompt "a cat sitting on a roof under moonlight, ..." \
  --model "image2" \
  --tags "猫,夜景,插画" \
  --source "bytecatcode"
# 长提示词可以写进文件：--prompt-file prompt.txt
# 可选：--negative-prompt "..."  --date 2026-10-24  --slug moon-cat

git add works && git commit -m "新增作品：月光下的猫" && git push
```

脚本会在 `works/日期-短名/` 下生成 `image.webp`、`thumb.webp` 和 `manifest.json`。**原图不会进仓库**（`.gitignore` 也忽略了 png/jpg），原图请自己存档到本地或网盘。一张 AI 图压缩后通常只有 200–400KB，单个 Pages 站点 1GB 能放几千张；快满时按年份拆一个新的图片仓库即可。

## 本地预览

```bash
node scripts/build.mjs                       # 生成 dist/
python3 -m http.server 8080 -d dist          # 打开 http://localhost:8080
```

## works.json（给总站用）

构建时把所有 `manifest.json` 合并成站点根目录的 `works.json`，按日期倒序：

```json
{
  "name": "AI 图片作品集",
  "type": "image",
  "base_url": "https://iamyours.github.io/ai-image-gallery/",
  "generated_at": "2026-10-24T12:00:00.000Z",
  "count": 3,
  "works": [
    {
      "id": "...", "title": "...", "type": "image",
      "file": "works/<id>/image.webp",
      "thumb": "works/<id>/thumb.webp",
      "file_url": "https://iamyours.github.io/ai-image-gallery/works/<id>/image.webp",
      "thumb_url": "https://iamyours.github.io/ai-image-gallery/works/<id>/thumb.webp",
      "prompt": "...", "model": "...", "tags": [], "date": "..."
    }
  ]
}
```

`file` / `thumb` 是相对本站的路径，`file_url` / `thumb_url` 是完整地址，总站直接用后者。

## 部署

推送到 `main` 会触发 GitHub Actions 构建并发布到 GitHub Pages（Pages 来源设置为 GitHub Actions）。也可以在 Actions 页面手动运行，或者由其他仓库发送 `repository_dispatch`（类型 `rebuild`）触发重新部署。

页面上的「示例」作品是脚本生成的占位图，有了真实作品后删掉 `works/*-sunset-mountains`、`*-deep-sea-bokeh`、`*-bauhaus-shapes` 三个文件夹即可。
