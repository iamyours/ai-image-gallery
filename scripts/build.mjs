// 构建：合并 works/*/manifest.json -> dist/works.json，并把站点文件和作品拷进 dist/
import { readdir, readFile, writeFile, mkdir, cp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const base = (process.env.SITE_URL || "https://iamyours.github.io/ai-image-gallery/").replace(/\/?$/, "/");
const required = ["id", "title", "type", "file", "thumb", "prompt", "model", "tags", "date"];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, "site"), dist, { recursive: true });

const works = [];
const dirs = (await readdir(path.join(root, "works"), { withFileTypes: true })).filter((d) => d.isDirectory());
for (const d of dirs) {
  const dir = path.join(root, "works", d.name);
  let m;
  try {
    m = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  } catch (e) {
    throw new Error(`works/${d.name}/manifest.json 读取失败: ${e.message}`);
  }
  const missing = required.filter((k) => m[k] === undefined || m[k] === "");
  if (missing.length) throw new Error(`works/${d.name}/manifest.json 缺少字段: ${missing.join(", ")}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) throw new Error(`works/${d.name}: date 必须是 YYYY-MM-DD`);
  if (!Array.isArray(m.tags)) throw new Error(`works/${d.name}: tags 必须是数组`);
  for (const k of ["file", "thumb"]) {
    await stat(path.join(dir, m[k])).catch(() => { throw new Error(`works/${d.name}: 找不到 ${m[k]}`); });
  }
  const rel = `works/${d.name}/`;
  const extra = {};
  if (m.originals !== undefined) {
    if (!Array.isArray(m.originals) || m.originals.some((f) => typeof f !== "string" || !f)) {
      throw new Error(`works/${d.name}: originals 必须是文件名字符串数组`);
    }
    for (const f of m.originals) {
      const target = path.resolve(dir, f);
      if (path.relative(dir, target).startsWith("..") || path.isAbsolute(f)) {
        throw new Error(`works/${d.name}: originals 路径不合法 ${f}`);
      }
      await stat(target).catch(() => { throw new Error(`works/${d.name}: 找不到原图 ${f}`); });
    }
    if (m.originals.length) {
      extra.originals = m.originals.map((f) => rel + f);
      extra.originals_urls = m.originals.map((f) => base + rel + f);
    } else {
      delete m.originals;
    }
  }
  if (m.originals_credit !== undefined && (m.originals_credit === null || typeof m.originals_credit !== "object" || Array.isArray(m.originals_credit))) {
    throw new Error(`works/${d.name}: originals_credit 必须是对象 {author, url}`);
  }
  works.push({
    ...m,
    file: rel + m.file,
    thumb: rel + m.thumb,
    file_url: base + rel + m.file,
    thumb_url: base + rel + m.thumb,
    ...extra,
  });
  await cp(dir, path.join(dist, rel), { recursive: true });
}
works.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));

const out = {
  name: "AI 图片作品集",
  type: "image",
  base_url: base,
  generated_at: new Date().toISOString(),
  count: works.length,
  works,
};
await writeFile(path.join(dist, "works.json"), JSON.stringify(out, null, 2) + "\n");
await writeFile(path.join(dist, ".nojekyll"), "");
console.log(`构建完成：${works.length} 件作品 -> dist/`);
