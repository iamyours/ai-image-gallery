(() => {
  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), tagsEl = $("tags"), search = $("search");
  const lightbox = $("lightbox"), stage = $("lb-stage"), canvas = $("lb-canvas");
  const fullImg = $("lb-img"), previewImg = $("lb-preview"), loadingEl = $("lb-loading");

  let works = [], shown = [], activeTag = "", current = -1;
  let isOpen = false, pushedEntry = false, lastFocus = null;
  let seq = 0, navLocked = false, loadingTimer = 0;
  let touchStart = null, suppressClick = false, lastWheel = 0;
  const preloaded = new Map();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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

  function open(index, opts = {}) {
    const w = shown[index];
    if (!w) return;

    const wasOpen = isOpen;
    current = index;

    if (!wasOpen) {
      lastFocus = document.activeElement;
      isOpen = true;
      lightbox.hidden = false;
      document.body.classList.add("lb-lock");
      requestAnimationFrame(() => { if (isOpen) lightbox.classList.add("is-open"); });
      setPromptOpen(false);

      if (opts.fromHash) {
        pushedEntry = false;
        history.replaceState({ lightbox: w.id }, "", "#" + encodeURIComponent(w.id));
      } else {
        pushedEntry = true;
        history.pushState({ lightbox: w.id }, "", "#" + encodeURIComponent(w.id));
      }

      try { $("lb-close").focus({ preventScroll: true }); } catch { $("lb-close").focus(); }
    } else {
      history.replaceState({ lightbox: w.id }, "", "#" + encodeURIComponent(w.id));
    }

    renderLightbox(w);
  }

  function renderLightbox(w) {
    $("lb-title").textContent = w.title;
    $("lb-counter").textContent = `${current + 1} / ${shown.length}`;

    const meta = [w.model, w.date].filter(Boolean).map(esc);
    let metaHTML = meta.join(" · ");
    if ((w.tags || []).length) {
      metaHTML += (metaHTML ? " · " : "") + w.tags.map((t) => `<span class="lb-tag">${esc(t)}</span>`).join(" ");
    }
    if (w.source) {
      const source = /^https?:\/\//.test(w.source)
        ? `<a href="${esc(w.source)}" target="_blank" rel="noopener">来源 ↗</a>`
        : esc(w.source);
      metaHTML += (metaHTML ? " · " : "") + source;
    }
    const metaEl = $("lb-meta");
    metaEl.innerHTML = metaHTML;
    metaEl.hidden = !metaHTML;

    $("lb-open").href = w.file;
    $("lb-prompt").textContent = w.prompt || "";
    $("lb-neg-wrap").hidden = !w.negative_prompt;
    $("lb-neg").textContent = w.negative_prompt || "";

    const copy = $("lb-copy");
    copy.textContent = "复制提示词";
    copy.classList.remove("done");

    $("lb-prev").disabled = current <= 0;
    $("lb-next").disabled = current >= shown.length - 1;

    showImage(w);
    preloadNeighbors();
  }

  function showImage(w) {
    const token = ++seq;

    fullImg.classList.remove("is-visible");
    fullImg.alt = w.title;

    previewImg.classList.remove("is-visible");
    previewImg.src = w.thumb;
    previewImg.alt = "";
    previewImg.classList.add("is-visible");

    setLoading(true);

    const reveal = () => {
      if (token !== seq || !isOpen) return;
      setLoading(false);
      fullImg.classList.add("is-visible");
    };

    fullImg.onload = reveal;
    fullImg.onerror = () => {
      if (token !== seq) return;
      setLoading(false);
      fullImg.classList.remove("is-visible");
    };
    fullImg.src = w.file;

    if (fullImg.complete && fullImg.naturalWidth > 0) reveal();
  }

  function setLoading(show) {
    clearTimeout(loadingTimer);
    if (!show) {
      loadingEl.hidden = true;
      return;
    }
    loadingEl.hidden = true;
    loadingTimer = setTimeout(() => { if (isOpen) loadingEl.hidden = false; }, 150);
  }

  function preloadImage(url) {
    if (!url || preloaded.has(url)) return;
    const img = new Image();
    img.decoding = "async";
    preloaded.set(url, img);
    img.src = url;
  }

  function preloadNeighbors() {
    [current - 1, current + 1].forEach((i) => {
      const w = shown[i];
      if (!w) return;
      preloadImage(w.thumb);
      preloadImage(w.file);
    });
  }

  function closeLightbox(fromPopstate = false) {
    if (!isOpen) return;

    isOpen = false;
    ++seq;
    navLocked = false;
    clearTimeout(loadingTimer);
    setLoading(false);
    clearCanvasAnimation();

    lightbox.classList.remove("is-open");
    document.body.classList.remove("lb-lock");
    setPromptOpen(false);

    const wasPushed = pushedEntry;
    pushedEntry = false;

    if (!fromPopstate) {
      if (wasPushed) history.back();
      else history.replaceState(null, "", location.pathname + location.search);
    }

    const focusTarget = lastFocus;
    lastFocus = null;
    if (focusTarget && document.contains(focusTarget)) {
      setTimeout(() => {
        try { focusTarget.focus({ preventScroll: true }); } catch { focusTarget.focus(); }
      }, 0);
    }

    setTimeout(() => { if (!isOpen) lightbox.hidden = true; }, reduceMotion.matches ? 0 : 240);
  }

  function navigate(dir) {
    if (!isOpen || navLocked) return;

    const target = current + dir;
    if (target < 0 || target >= shown.length) {
      bounce(dir);
      return;
    }

    navLocked = true;
    const token = ++seq;

    const advance = () => {
      if (!isOpen || token !== seq) { navLocked = false; return; }
      current = target;
      const w = shown[target];
      renderLightbox(w);
      history.replaceState({ lightbox: w.id }, "", "#" + encodeURIComponent(w.id));
      animateIn(dir);
    };

    if (reduceMotion.matches) {
      advance();
      navLocked = false;
      return;
    }

    const out = canvas.animate(
      [
        { opacity: 1, transform: "translateY(0)" },
        { opacity: 0, transform: `translateY(${dir > 0 ? -18 : 18}px)` }
      ],
      { duration: 110, easing: "ease-in", fill: "forwards" }
    );
    out.finished.then(advance).catch(() => { navLocked = false; });
  }

  function animateIn(dir) {
    if (reduceMotion.matches) {
      clearCanvasAnimation();
      navLocked = false;
      return;
    }
    const anim = canvas.animate(
      [
        { opacity: 0, transform: `translateY(${dir > 0 ? 18 : -18}px)` },
        { opacity: 1, transform: "translateY(0)" }
      ],
      { duration: 200, easing: "ease-out", fill: "forwards" }
    );
    anim.finished.then(() => {
      clearCanvasAnimation();
      navLocked = false;
    }).catch(() => { navLocked = false; });
  }

  function bounce(dir) {
    if (reduceMotion.matches) return;
    canvas.animate(
      [
        { transform: "translateY(0)" },
        { transform: `translateY(${dir > 0 ? -10 : 10}px)` },
        { transform: "translateY(0)" }
      ],
      { duration: 260, easing: "ease-out" }
    );
  }

  function clearCanvasAnimation() {
    canvas.getAnimations().forEach((a) => a.cancel());
    canvas.style.opacity = "";
    canvas.style.transform = "";
  }

  function setPromptOpen(open) {
    const panel = $("lb-prompt-panel");
    const btn = $("lb-prompt-toggle");
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("is-open", open);
  }

  function trapFocus(e) {
    const focusable = [...lightbox.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.closest("[hidden]") && el.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || !lightbox.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !lightbox.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  }

  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) open(+card.dataset.i);
  });
  tagsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".tag");
    if (!b) return;
    activeTag = b.dataset.tag;
    render();
  });
  search.addEventListener("input", render);

  $("lb-close").addEventListener("click", () => closeLightbox());
  $("lb-prev").addEventListener("click", () => navigate(-1));
  $("lb-next").addEventListener("click", () => navigate(1));
  $("lb-prompt-toggle").addEventListener("click", () => setPromptOpen($("lb-prompt-panel").hidden));

  $("lb-copy").addEventListener("click", async () => {
    const text = shown[current]?.prompt || "";
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const btn = $("lb-copy");
    btn.textContent = "已复制 ✓";
    btn.classList.add("done");
    setTimeout(() => { btn.textContent = "复制提示词"; btn.classList.remove("done"); }, 1800);
  });

  stage.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; return; }
    if (e.target === stage || e.target === canvas) closeLightbox();
  });

  stage.addEventListener("touchstart", (e) => {
    if (!isOpen || e.touches.length !== 1) { touchStart = null; return; }
    touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });

  stage.addEventListener("touchmove", (e) => {
    if (!touchStart || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - touchStart.x;
    const dy = e.touches[0].clientY - touchStart.y;
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
      if (e.cancelable) e.preventDefault();
      suppressClick = true;
    }
  }, { passive: false });

  stage.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dy) >= 50 && Math.abs(dy) > Math.abs(dx)) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 400);
      navigate(dy < 0 ? 1 : -1);
    }
  }, { passive: true });

  stage.addEventListener("touchcancel", () => { touchStart = null; });

  stage.addEventListener("wheel", (e) => {
    if (!isOpen) return;
    e.preventDefault();
    if (navLocked || Math.abs(e.deltaY) < 8) return;
    const now = Date.now();
    if (now - lastWheel < 260) return;
    lastWheel = now;
    navigate(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); closeLightbox(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); navigate(1); return; }
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); navigate(-1); return; }
    if (e.key === "Tab") trapFocus(e);
  });

  window.addEventListener("popstate", () => {
    if (isOpen) closeLightbox(true);
  });

  function openFromHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const i = shown.findIndex((w) => w.id === id);
    if (i >= 0) open(i, { fromHash: true });
  }
})();
