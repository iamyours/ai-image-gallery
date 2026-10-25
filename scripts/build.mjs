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
  works.push({
    ...m,
    file: rel + m.file,
    thumb: rel + m.thumb,
    file_url: base + rel + m.file,
    thumb_url: base + rel + m.thumb,
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
