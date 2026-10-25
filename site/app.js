(() => {
  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), tagsEl = $("tags"), search = $("search"), viewer = $("viewer");
  let works = [], shown = [], activeTag = "", current = -1;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  fetch("works.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((data) => { works = data.works || []; buildTags(); render(); openFromHash(); })
    .catch(() => { grid.innerHTML = '<p class="empty">作品数据加载失败，请稍后刷新。</p>'; });

  function buildTags() {
    const counts = {};
    works.forEach((w) => (w.tags || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    const list = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, "zh"));
    tagsEl.innerHTML = [`<button class="tag" data-tag="">全部</button>`]
      .concat(list.map((t) => `<button class="tag" data-tag="${esc(t)}">${esc(t)} <small>${counts[t]}</small></button>`)).join("");
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    shown = works.filter((w) => {
      if (activeTag && !(w.tags || []).includes(activeTag)) return false;
      if (!q) return true;
      return [w.title, w.prompt, w.model, (w.tags || []).join(" ")].join(" ").toLowerCase().includes(q);
    });
    tagsEl.querySelectorAll(".tag").forEach((b) => b.classList.toggle("on", b.dataset.tag === activeTag));
    $("count").textContent = `共 ${shown.length} 件`;
    $("empty").hidden = shown.length > 0;
    grid.innerHTML = shown.map((w, i) => {
      const ratio = w.width && w.height ? ` width="${w.width}" height="${w.height}"` : "";
      return `<button class="card" data-i="${i}" aria-label="${esc(w.title)}">
        <img src="${esc(w.thumb)}" alt="${esc(w.title)}" loading="lazy" decoding="async"${ratio}>
        <div class="cap"><div class="t">${esc(w.title)}</div><div class="m">${esc(w.model)} · ${esc(w.date)}</div></div>
      </button>`;
    }).join("");
  }

  function open(i) {
    const w = shown[i]; if (!w) return;
    current = i;
    const img = $("v-img");
    img.src = w.thumb; img.alt = w.title;
    const full = new Image(); full.onload = () => { if (shown[current] === w) img.src = w.file; }; full.src = w.file;
    $("v-title").textContent = w.title;
    $("v-model").textContent = w.model;
    $("v-date").textContent = w.date;
    const hasSrc = !!w.source;
    $("v-source-dt").hidden = $("v-source").hidden = !hasSrc;
    $("v-source").innerHTML = hasSrc ? (/^https?:\/\//.test(w.source) ? `<a href="${esc(w.source)}" target="_blank" rel="noopener">${esc(w.source)}</a>` : esc(w.source)) : "";
    $("v-tags").innerHTML = (w.tags || []).map((t) => `<span>${esc(t)}</span>`).join("");
    $("v-prompt").textContent = w.prompt;
    $("v-neg-wrap").hidden = !w.negative_prompt;
    $("v-neg").textContent = w.negative_prompt || "";
    $("v-open").href = w.file;
    const c = $("copy"); c.textContent = "复制提示词"; c.classList.remove("done");
    history.replaceState(null, "", "#" + encodeURIComponent(w.id));
    if (!viewer.open) viewer.showModal();
  }

  function close() { viewer.close(); }
  viewer.addEventListener("close", () => history.replaceState(null, "", location.pathname + location.search));
  viewer.addEventListener("click", (e) => { if (e.target === viewer) close(); });
  $("close").onclick = close;
  $("prev").onclick = () => open((current - 1 + shown.length) % shown.length);
  $("next").onclick = () => open((current + 1) % shown.length);
  document.addEventListener("keydown", (e) => {
    if (!viewer.open) return;
    if (e.key === "ArrowLeft") $("prev").click();
    if (e.key === "ArrowRight") $("next").click();
  });

  $("copy").onclick = async () => {
    const text = shown[current]?.prompt || "";
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); ta.remove();
    }
    const c = $("copy"); c.textContent = "已复制 ✓"; c.classList.add("done");
    setTimeout(() => { c.textContent = "复制提示词"; c.classList.remove("done"); }, 1800);
  };

  grid.addEventListener("click", (e) => { const card = e.target.closest(".card"); if (card) open(+card.dataset.i); });
  tagsEl.addEventListener("click", (e) => { const b = e.target.closest(".tag"); if (!b) return; activeTag = b.dataset.tag; render(); });
  search.addEventListener("input", render);

  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const i = shown.findIndex((w) => w.id === id);
    if (i >= 0) open(i);
  }
})();
