(() => {
  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), tagsEl = $("tags"), search = $("search");
  const lightbox = $("lightbox"), stage = $("lb-stage"), canvas = $("lb-canvas");
  const fullImg = $("lb-img"), previewImg = $("lb-preview"), loadingEl = $("lb-loading");

  let works = [], shown = [], activeTag = "", current = -1;
  let isOpen = false, pushedEntry = false, lastFocus = null;
  let seq = 0, navLocked = false, loadingTimer = 0;
  let touchStart = null, suppressClick = false, lastWheel = 0, lockedScrollY = 0;
  const preloaded = new Map();
  const sheetMode = window.matchMedia("(max-width: 599px), (max-width: 899px) and (min-height: 501px)");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
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
    $("total").innerHTML = `<b>${works.length}</b> 件作品`;
    const filtered = activeTag || q;
    $("count").textContent = filtered ? `筛选出 ${shown.length} / ${works.length} 件` : `共 ${works.length} 件`;
    $("empty").hidden = shown.length > 0;
    grid.innerHTML = shown.map((w, i) => {
      const wh = w.width && w.height ? ` width="${w.width}" height="${w.height}"` : ` width="2" height="3"`;
      const ar = w.width && w.height ? ` style="aspect-ratio:${w.width} / ${w.height}"` : "";
      const meta = [w.date, (w.tags || []).slice(0, 2).join(" · ")].filter(Boolean).join(" · ");
      return `<button type="button" class="card" data-i="${i}" aria-label="${esc(w.title)}">
        <span class="ph"${ar}><img src="${esc(w.thumb)}" alt="${esc(w.title)}" loading="lazy" decoding="async"${wh}></span>
        <span class="cap"><span class="t">${esc(w.title)}</span><span class="m">${esc(meta)}</span></span>
      </button>`;
    }).join("");
    grid.querySelectorAll("img").forEach((img) => {
      if (img.complete && img.naturalWidth > 0) img.classList.add("is-loaded");
    });
  }

  // fade thumbnails in as they load (load/error don't bubble, so capture)
  grid.addEventListener("load", (e) => { if (e.target.tagName === "IMG") e.target.classList.add("is-loaded"); }, true);
  grid.addEventListener("error", (e) => { if (e.target.tagName === "IMG") e.target.classList.add("is-loaded"); }, true);

  function lockScroll() {
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = `-${lockedScrollY}px`;
    document.body.classList.add("lb-lock");
  }

  function unlockScroll() {
    document.body.classList.remove("lb-lock");
    document.body.style.top = "";
    window.scrollTo(0, lockedScrollY);
  }

  function open(index, opts = {}) {
    const w = shown[index];
    if (!w) return;

    const wasOpen = isOpen;
    current = index;

    if (!wasOpen) {
      lastFocus = document.activeElement;
      isOpen = true;
      if (opts.fromHash) {
        pushedEntry = false;
        history.replaceState({ lightbox: w.id }, "", "#" + encodeURIComponent(w.id));
      } else {
        pushedEntry = true;
        history.pushState({ lightbox: w.id }, "", "#" + encodeURIComponent(w.id));
      }

      lightbox.hidden = false;
      lockScroll();
      requestAnimationFrame(() => { if (isOpen) lightbox.classList.add("is-open"); });
      setPromptOpen(false);

      try { $("lb-close").focus({ preventScroll: true }); } catch { $("lb-close").focus(); }
    } else {
      history.replaceState({ lightbox: w.id }, "", "#" + encodeURIComponent(w.id));
    }

    renderLightbox(w);
  }

  function renderLightbox(w) {
    $("lb-title").textContent = w.title;
    $("lb-counter").textContent = `${current + 1} / ${shown.length}`;

    const isUrl = /^https?:\/\//.test(w.source || "");
    const meta = [w.model, w.date].filter(Boolean).map(esc);
    if (w.source && !isUrl) meta.push("来源：" + esc(w.source));
    const metaEl = $("lb-meta");
    metaEl.innerHTML = meta.join(" · ");
    metaEl.hidden = !meta.length;
    $("lb-tags").innerHTML = (w.tags || []).map((t) => `<span class="lb-tag">${esc(t)}</span>`).join("");

    const src = $("lb-source");
    src.hidden = !isUrl;
    if (isUrl) src.href = w.source; else src.removeAttribute("href");

    $("lb-open").href = w.file;
    $("lb-prompt").textContent = w.prompt || "";
    $("lb-neg-wrap").hidden = !w.negative_prompt;
    $("lb-neg").textContent = w.negative_prompt || "";

    resetCopy();
    $("lb-bottom").scrollTop = 0;

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
    unlockScroll();
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

  function navigate(dir, axis = "x") {
    if (!isOpen || navLocked) return;

    const target = current + dir;
    if (target < 0 || target >= shown.length) {
      bounce(dir, axis);
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
      animateIn(dir, axis);
    };

    if (reduceMotion.matches) {
      advance();
      navLocked = false;
      return;
    }

    const out = canvas.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: shift(axis, dir > 0 ? -24 : 24) }
      ],
      { duration: 110, easing: "ease-in", fill: "forwards" }
    );
    out.finished.then(advance).catch(() => { navLocked = false; });
  }

  function shift(axis, px) {
    return axis === "y" ? `translateY(${px}px)` : `translateX(${px}px)`;
  }

  function animateIn(dir, axis = "x") {
    if (reduceMotion.matches) {
      clearCanvasAnimation();
      navLocked = false;
      return;
    }
    const anim = canvas.animate(
      [
        { opacity: 0, transform: shift(axis, dir > 0 ? 24 : -24) },
        { opacity: 1, transform: "none" }
      ],
      { duration: 200, easing: "ease-out", fill: "forwards" }
    );
    anim.finished.then(() => {
      clearCanvasAnimation();
      navLocked = false;
    }).catch(() => { navLocked = false; });
  }

  function bounce(dir, axis = "x") {
    if (reduceMotion.matches) return;
    canvas.animate(
      [
        { transform: "none" },
        { transform: shift(axis, dir > 0 ? -12 : 12) },
        { transform: "none" }
      ],
      { duration: 260, easing: "ease-out" }
    );
  }

  function clearCanvasAnimation() {
    canvas.getAnimations().forEach((a) => a.cancel());
    canvas.style.opacity = "";
    canvas.style.transform = "";
  }

  function isPromptOpen() {
    return lightbox.classList.contains("prompt-open");
  }

  function setPromptOpen(open) {
    const btn = $("lb-prompt-toggle");
    lightbox.classList.toggle("prompt-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.querySelector(".lg").textContent = open ? "收起提示词" : "展开提示词";
    btn.querySelector(".sm").textContent = open ? "收起" : "提示词";
    if (!open) {
      $("lb-bottom").scrollTop = 0;
      requestAnimationFrame(() => { if (!isPromptOpen()) lightbox.style.setProperty("--sheet-h", $("lb-bottom").offsetHeight + "px"); });
    }
  }

  const COPY_LABEL = '<span class="lg">复制提示词</span><span class="sm">复制</span>';
  let copyTimer = 0;
  function resetCopy() {
    clearTimeout(copyTimer);
    const btn = $("lb-copy");
    btn.innerHTML = COPY_LABEL;
    btn.classList.remove("done");
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
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") search.blur(); });

  const toolbar = $("toolbar");
  const onScroll = () => toolbar.classList.toggle("is-stuck", toolbar.getBoundingClientRect().top <= 0 && window.scrollY > 0);
  window.addEventListener("scroll", onScroll, { passive: true });

  $("lb-close").addEventListener("click", () => closeLightbox());
  $("lb-prev").addEventListener("click", () => navigate(-1));
  $("lb-next").addEventListener("click", () => navigate(1));
  $("lb-prompt-toggle").addEventListener("click", () => setPromptOpen(!isPromptOpen()));
  $("lb-grabber").addEventListener("click", () => setPromptOpen(!isPromptOpen()));
  // desktop: clicking the faded preview expands it
  $("lb-prompt-panel").addEventListener("click", () => { if (!isPromptOpen()) setPromptOpen(true); });

  $("lb-copy").addEventListener("click", async () => {
    const text = shown[current]?.prompt || "";
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
      lightbox.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    const btn = $("lb-copy");
    clearTimeout(copyTimer);
    btn.textContent = "已复制 ✓";
    btn.classList.add("done");
    copyTimer = setTimeout(resetCopy, 1800);
  });

  // phones: the bottom sheet overlays the stage; reserve its collapsed height for the image
  const sheet = $("lb-bottom");
  const syncSheetHeight = () => {
    if (!isPromptOpen()) lightbox.style.setProperty("--sheet-h", sheet.offsetHeight + "px");
  };
  if ("ResizeObserver" in window) new ResizeObserver(syncSheetHeight).observe(sheet);
  window.addEventListener("resize", syncSheetHeight);

  // desktop: map vertical mouse wheel to horizontal scrolling on the tag row
  tagsEl.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && tagsEl.scrollWidth > tagsEl.clientWidth) {
      e.preventDefault();
      tagsEl.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  stage.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; return; }
    // tapping the image area while the sheet is expanded just collapses the sheet
    if (sheetMode.matches && isPromptOpen() && !e.target.closest("button")) { setPromptOpen(false); return; }
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
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
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
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax >= 45 && ax > ay) {
      // swipe left -> next, swipe right -> previous
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 400);
      navigate(dx < 0 ? 1 : -1, "x");
    } else if (ay >= 50 && ay > ax) {
      // vertical swipe kept from the original viewer: up -> next, down -> previous
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 400);
      navigate(dy < 0 ? 1 : -1, "y");
    } else if (ax > 12 || ay > 12) {
      setTimeout(() => { suppressClick = false; }, 400);
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
    navigate(e.deltaY > 0 ? 1 : -1, "y");
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); closeLightbox(); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); navigate(1, "x"); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); navigate(-1, "x"); return; }
    // let arrow up/down scroll the prompt text when focus is inside the info panel
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && $("lb-bottom").contains(document.activeElement)) return;
    if (e.key === "ArrowDown") { e.preventDefault(); navigate(1, "y"); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); navigate(-1, "y"); return; }
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
