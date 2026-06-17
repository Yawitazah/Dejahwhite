/* ════════════════════════════════════════════════════════════════════════
   Dejah White — Visual Editor  ·  editor.js
   ────────────────────────────────────────────────────────────────────────
   A self-contained, framework-free in-browser editing suite.

   • Click any element to edit its text, typography, colour, spacing, size.
   • Replace images / add video / PDF via upload (stored locally, then
     committed to the repo on Publish).
   • Edit the global theme (colour tokens + fonts) site-wide.
   • Undo / redo, reset element, reset all.
   • Publish saves directly to GitHub (Contents API) → GitHub Pages goes
     live. Every publish is a commit, so git history is your safety net.

   Persistence:
     ee:overrides:<page>  → per-element text / style / attribute overrides
     ee:theme             → global CSS-variable + font overrides (all pages)
     IndexedDB "ee-media" → uploaded blobs, keyed by their repo path
     ee:gh                → GitHub connection (owner/repo/branch/token/path)
     ee:pass              → passcode hash
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__eeLoaded) return;
  window.__eeLoaded = true;

  /* ─────────────────────────── tiny helpers ──────────────────────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const PAGE = (location.pathname.split("/").pop() || "index.html").replace(/^$/, "index.html");
  const LS = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
    del(k) { localStorage.removeItem(k); },
  };
  const OV_KEY = "ee:overrides:" + PAGE;
  const THEME_KEY = "ee:theme";
  const GH_KEY = "ee:gh";
  const PASS_KEY = "ee:pass";

  const ICON = {
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2"/><path d="m16 7 3 3"/><path d="m18 5 3 3"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2M9 5v14M7 19h4"/></svg>',
    type: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
    color: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2a10 10 0 0 0 0 20 2.5 2.5 0 0 0 2-4 2.5 2.5 0 0 1 2-4h2a4 4 0 0 0 4-4 10 10 0 0 0-10-8Z"/></svg>',
    layout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/></svg>',
    media: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L11 18"/></svg>',
    publish: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/></svg>',
    min: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8"/><path d="M3 3v5h5"/></svg>',
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="10"/></svg>',
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
    cursor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 7.5 18 2.5-8 8-2.5L3 3Z"/></svg>',
  };

  /* ───────────────────────────── state ───────────────────────────────── */
  let overrides = LS.get(OV_KEY, {});       // { id: {text, html, styles:{}, attrs:{}} }
  let theme = LS.get(THEME_KEY, {});         // { vars:{}, fonts:[] }
  let editing = false;                       // edit mode active
  let selected = null;                       // selected element
  let activeTab = "content";
  const undoStack = [];
  const redoStack = [];

  /* ════════════════════════ IndexedDB (media) ════════════════════════ */
  let _db = null;
  function db() {
    if (_db) return Promise.resolve(_db);
    return new Promise((res, rej) => {
      const r = indexedDB.open("ee-media", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("blobs", { keyPath: "path" });
      r.onsuccess = () => { _db = r.result; res(_db); };
      r.onerror = () => rej(r.error);
    });
  }
  async function mediaPut(path, blob, type) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put({ path, blob, type, committed: false });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function mediaAll() {
    const d = await db();
    return new Promise((res, rej) => {
      const out = []; const tx = d.transaction("blobs", "readonly");
      tx.objectStore("blobs").openCursor().onsuccess = (e) => {
        const c = e.target.result; if (c) { out.push(c.value); c.continue(); } else res(out);
      };
      tx.onerror = () => rej(tx.error);
    });
  }
  async function mediaGet(path) {
    const d = await db();
    return new Promise((res) => {
      const tx = d.transaction("blobs", "readonly");
      tx.objectStore("blobs").get(path).onsuccess = (e) => res(e.target.result);
    });
  }
  async function mediaDel(path) {
    const d = await db();
    return new Promise((res) => {
      const tx = d.transaction("blobs", "readwrite");
      tx.objectStore("blobs").delete(path); tx.oncomplete = res;
    });
  }
  async function mediaMark(path) {
    const rec = await mediaGet(path); if (!rec) return;
    rec.committed = true; const d = await db();
    const tx = d.transaction("blobs", "readwrite"); tx.objectStore("blobs").put(rec);
  }
  const objURLs = {};
  async function objURLFor(path) {
    if (objURLs[path]) return objURLs[path];
    const rec = await mediaGet(path); if (!rec) return null;
    const u = URL.createObjectURL(rec.blob); objURLs[path] = u; return u;
  }

  /* ════════════════════════ element identity ═════════════════════════ */
  // Assign deterministic, structure-stable ids to original page elements
  // BEFORE the editor injects any of its own DOM.
  function assignIds() {
    const root = document.body;
    let i = 0;
    const walk = (el) => {
      if (el.id === "ee-root" || el.closest("#ee-root")) return;
      if (el.nodeType === 1) {
        if (!el.hasAttribute("data-ee-id")) el.setAttribute("data-ee-id", "e" + (i));
        i++;
        for (const c of el.children) walk(c);
      }
    };
    for (const c of root.children) walk(c);
  }
  const byId = (id) => document.querySelector('[data-ee-id="' + CSS.escape(id) + '"]');

  /* ════════════════════════ apply overrides ══════════════════════════ */
  function applyTheme() {
    const r = document.documentElement;
    if (theme.vars) for (const [k, v] of Object.entries(theme.vars)) r.style.setProperty(k, v);
    if (theme.fonts) theme.fonts.forEach(addFontLink);
  }
  function addFontLink(href) {
    if ($('link[data-ee-font="' + CSS.escape(href) + '"]')) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href; l.setAttribute("data-ee-font", href);
    document.head.appendChild(l);
  }
  async function applyOverride(id) {
    const o = overrides[id]; const el = byId(id); if (!o || !el) return;
    if (o.text != null) el.textContent = o.text;
    if (o.html != null) el.innerHTML = o.html;
    if (o.styles) for (const [k, v] of Object.entries(o.styles)) el.style.setProperty(k, v);
    if (o.attrs) for (const [k, v] of Object.entries(o.attrs)) {
      if (/^(src|poster)$/.test(k) && /^images\/uploads\//.test(v)) {
        const u = await objURLFor(v); el.setAttribute(k, u || v);
        el.setAttribute("data-ee-" + k, v); // remember real path for publish
      } else el.setAttribute(k, v);
    }
  }
  async function applyAll() {
    applyTheme();
    for (const id of Object.keys(overrides)) await applyOverride(id);
  }

  /* ════════════════════════ change recording ═════════════════════════ */
  function snapshot(id) {
    return JSON.parse(JSON.stringify(overrides[id] || {}));
  }
  function pushUndo(id, before) {
    undoStack.push({ id, before, after: snapshot(id) });
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    refreshHistoryBtns(); markDirty();
  }
  function commitOverride(id, mutator) {
    const before = snapshot(id);
    overrides[id] = overrides[id] || {};
    mutator(overrides[id]);
    if (Object.keys(overrides[id]).length === 0) delete overrides[id];
    LS.set(OV_KEY, overrides);
    pushUndo(id, before);
  }
  function restore(id, data) {
    if (!data || Object.keys(data).length === 0) {
      delete overrides[id];
      // hard reset element to its original by reloading is heavy; instead
      // clear inline styles/attrs we may have set:
      const el = byId(id);
      if (el) { el.removeAttribute("style"); }
    } else {
      overrides[id] = JSON.parse(JSON.stringify(data));
    }
    LS.set(OV_KEY, overrides);
  }
  async function undo() {
    const a = undoStack.pop(); if (!a) return;
    redoStack.push(a); restore(a.id, a.before);
    reloadElement(a.id); refreshHistoryBtns(); selectById(a.id);
  }
  async function redo() {
    const a = redoStack.pop(); if (!a) return;
    undoStack.push(a); restore(a.id, a.after);
    reloadElement(a.id); refreshHistoryBtns(); selectById(a.id);
  }
  function reloadElement(id) {
    const el = byId(id); if (!el) return;
    el.removeAttribute("style");
    applyOverride(id);
  }

  let dirtyTimer = null;
  function markDirty() {
    fab && fab.classList.add("ee-has-changes");
    clearTimeout(dirtyTimer);
  }

  /* ════════════════════════════ UI build ═════════════════════════════ */
  let root, panel, fab, footerKey, contentEl, crumbEl, undoBtn, redoBtn;

  function buildUI() {
    root = document.createElement("div");
    root.id = "ee-root";
    document.body.appendChild(root);

    // toast container
    const tw = document.createElement("div");
    tw.className = "ee-layer ee-toast-wrap"; tw.id = "ee-toasts";
    root.appendChild(tw);

    // floating key (hidden until minimized)
    fab = document.createElement("div");
    fab.className = "ee-layer ee-fab"; fab.style.display = "none";
    fab.innerHTML = ICON.key + '<span class="ee-fab-dot"></span>';
    fab.title = "Open editor";
    root.appendChild(fab);
    makeDraggable(fab);
    fab.addEventListener("click", (e) => { if (!fab._dragged) openPanel(); });

    // panel
    panel = document.createElement("div");
    panel.className = "ee-layer ee-panel ee-hidden";
    panel.innerHTML = panelHTML();
    root.appendChild(panel);

    contentEl = $(".ee-content", panel);
    crumbEl = $(".ee-sel-text", panel);
    undoBtn = $("#ee-undo", panel);
    redoBtn = $("#ee-redo", panel);

    wirePanel();
    injectFooterKey();
  }

  function panelHTML() {
    const tab = (id, label) =>
      `<button class="ee-tab" data-tab="${id}">${ICON[id] || ICON.text}<span>${label}</span></button>`;
    return `
      <div class="ee-resize"></div>
      <div class="ee-head">
        <div class="ee-brand">${ICON.key}<span>Editor</span><span class="ee-dim">· Dejah White</span></div>
        <div class="ee-sel-crumb"><span class="ee-tag">page</span><span class="ee-sel-text">Click an element on the page to edit it</span></div>
        <div class="ee-head-actions">
          <button class="ee-iconbtn" id="ee-undo" title="Undo (⌘Z)" disabled>${ICON.undo}</button>
          <button class="ee-iconbtn" id="ee-redo" title="Redo (⌘⇧Z)" disabled>${ICON.redo}</button>
          <button class="ee-iconbtn" id="ee-min" title="Minimize">${ICON.min}</button>
          <button class="ee-iconbtn" id="ee-exit" title="Close editor">${ICON.close}</button>
        </div>
      </div>
      <div class="ee-body">
        <div class="ee-rail">
          ${tab("content", "Content")}
          ${tab("type", "Text")}
          ${tab("color", "Color")}
          ${tab("layout", "Size")}
          ${tab("theme", "Theme")}
          ${tab("media", "Media")}
          ${tab("publish", "Publish")}
        </div>
        <div class="ee-content"></div>
      </div>`;
  }

  function injectFooterKey() {
    const footer = $(".footer-bottom") || $(".footer-inner") || $(".post-footer-inner")
      || $(".fline") || $(".footer-top") || $("footer") || $(".footer") || $(".post-footer");
    footerKey = document.createElement("button");
    footerKey.className = "ee-footer-key";
    footerKey.title = "Edit this site";
    footerKey.setAttribute("aria-label", "Edit this site");
    footerKey.innerHTML = ICON.key;
    footerKey.addEventListener("click", requestUnlock);
    if (footer) {
      footer.appendChild(footerKey);
    } else {
      // no recognizable footer — fall back to a fixed, unobtrusive corner key
      footerKey.classList.add("ee-layer");
      footerKey.style.cssText = "bottom:14px;right:14px;opacity:.5";
      root.appendChild(footerKey);
    }
  }

  /* ════════════════════════ panel wiring ═════════════════════════════ */
  function wirePanel() {
    $$(".ee-tab", panel).forEach((t) =>
      t.addEventListener("click", () => setTab(t.dataset.tab)));
    $("#ee-min", panel).addEventListener("click", minimizePanel);
    $("#ee-exit", panel).addEventListener("click", exitEditing);
    undoBtn.addEventListener("click", undo);
    redoBtn.addEventListener("click", redo);
    setupResize();
  }
  function $$(s, r = document) { return Array.from(r.querySelectorAll(s)); }

  function setTab(id) {
    activeTab = id;
    $$(".ee-tab", panel).forEach((t) => t.classList.toggle("ee-active", t.dataset.tab === id));
    renderContent();
  }

  /* ════════════════════════ selection ════════════════════════════════ */
  function onPageClick(e) {
    if (!editing) return;
    if (e.target.closest("#ee-root")) return;
    const el = e.target.closest("[data-ee-id]");
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    selectEl(el);
  }
  function selectEl(el) {
    if (selected) selected.classList.remove("ee-selected");
    selected = el;
    el.classList.add("ee-selected");
    const id = el.getAttribute("data-ee-id");
    crumbEl.textContent = describe(el);
    $(".ee-sel-crumb .ee-tag", panel).textContent = el.tagName.toLowerCase();
    // sensible default tab by element type
    if (!["content", "type", "color", "layout"].includes(activeTab)) activeTab = "content";
    if (isMedia(el)) setTab("content");
    else renderContent();
    if (selected) selected.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function selectById(id) { const el = byId(id); if (el) selectEl(el); }
  function describe(el) {
    const t = (el.textContent || "").trim().replace(/\s+/g, " ");
    if (isImg(el)) return "Image";
    if (isVideo(el)) return "Video";
    return t ? (t.length > 60 ? t.slice(0, 60) + "…" : t) : "<" + el.tagName.toLowerCase() + ">";
  }
  const isImg = (el) => el && el.tagName === "IMG";
  const isVideo = (el) => el && el.tagName === "VIDEO";
  const isMedia = (el) => isImg(el) || isVideo(el);
  const hasText = (el) => el && el.children.length === 0 && (el.textContent || "").trim().length >= 0 && !isMedia(el);

  /* ════════════════════════ content renderer ═════════════════════════ */
  function renderContent() {
    if (activeTab === "theme") return renderTheme();
    if (activeTab === "media") return renderMedia();
    if (activeTab === "publish") return renderPublish();
    if (!selected) {
      contentEl.innerHTML = `<div class="ee-hint">${ICON.cursor}<b>Nothing selected</b>
        Click any text, image, or block on the page to start editing it.<br>
        Use the <b>Theme</b> tab to change site-wide colours & fonts.</div>`;
      return;
    }
    if (activeTab === "content") return renderContentTab();
    if (activeTab === "type") return renderTypeTab();
    if (activeTab === "color") return renderColorTab();
    if (activeTab === "layout") return renderLayoutTab();
  }

  const cs = (el, prop) => getComputedStyle(el).getPropertyValue(prop);
  function ovStyle(el, prop) {
    const id = el.getAttribute("data-ee-id");
    return (overrides[id] && overrides[id].styles && overrides[id].styles[prop]) || "";
  }

  /* ---- CONTENT tab ---- */
  function renderContentTab() {
    const el = selected;
    if (isImg(el)) return renderImageControls(el);
    if (isVideo(el)) return renderVideoControls(el);
    // editable text / link
    const id = el.getAttribute("data-ee-id");
    const curr = (overrides[id] && overrides[id].text != null) ? overrides[id].text : el.textContent;
    let h = `<div class="ee-section-title">Text content</div>
      <div class="ee-row"><label class="ee-label">Text</label>
        <textarea class="ee-textarea" id="ee-text">${escapeHTML(curr)}</textarea>
        <div class="ee-help">Tip: you can also <b>double-click the text on the page</b> to edit it in place.</div>
      </div>`;
    if (el.tagName === "A" || el.closest("a")) {
      const a = el.tagName === "A" ? el : el.closest("a");
      h += `<div class="ee-section-title">Link</div>
        <div class="ee-row"><label class="ee-label">Link URL (href)</label>
        <input class="ee-input" id="ee-href" value="${escapeAttr(a.getAttribute("href") || "")}" placeholder="https:// or /page or #section"></div>`;
    }
    contentEl.innerHTML = h;
    const ta = $("#ee-text", contentEl);
    ta.addEventListener("input", () => {
      el.textContent = ta.value;
      commitOverride(id, (o) => { o.text = ta.value; });
      crumbEl.textContent = describe(el);
    });
    const hr = $("#ee-href", contentEl);
    if (hr) {
      const a = el.tagName === "A" ? el : el.closest("a");
      const aid = a.getAttribute("data-ee-id");
      hr.addEventListener("input", () => {
        a.setAttribute("href", hr.value);
        commitOverride(aid, (o) => { o.attrs = o.attrs || {}; o.attrs.href = hr.value; });
      });
    }
  }

  function renderImageControls(el) {
    const id = el.getAttribute("data-ee-id");
    contentEl.innerHTML = `
      <div class="ee-section-title">Image</div>
      <div class="ee-row"><div class="ee-drop" id="ee-img-drop">${ICON.upload}
        <div>Drop an image here or <b>click to upload</b></div>
        <div class="ee-help">JPG, PNG, GIF, WebP, SVG</div></div></div>
      <div class="ee-row"><label class="ee-label">Or paste an image URL</label>
        <input class="ee-input" id="ee-img-url" value="${escapeAttr(el.getAttribute("src") || "")}"></div>
      <div class="ee-row"><label class="ee-label">Alt text (accessibility)</label>
        <input class="ee-input" id="ee-img-alt" value="${escapeAttr(el.getAttribute("alt") || "")}"></div>
      <div class="ee-section-title">Fit & focus</div>
      <div class="ee-row"><label class="ee-label">How the image fills its frame</label>
        ${selectField("ee-img-fit", ["cover", "contain", "fill", "none", "scale-down"], ovStyle(el, "object-fit") || cs(el, "object-fit"))}</div>
      <div class="ee-help">Use the <b>Size</b> tab to change dimensions, rounding, borders.</div>`;
    wireImageDrop(el, id);
    $("#ee-img-url", contentEl).addEventListener("change", (e) => setImageSrc(el, id, e.target.value));
    $("#ee-img-alt", contentEl).addEventListener("input", (e) =>
      commitOverride(id, (o) => { o.attrs = o.attrs || {}; o.attrs.alt = e.target.value; el.setAttribute("alt", e.target.value); }));
    $("#ee-img-fit", contentEl).addEventListener("change", (e) => setStyle(el, id, "object-fit", e.target.value));
  }

  function renderVideoControls(el) {
    const id = el.getAttribute("data-ee-id");
    contentEl.innerHTML = `
      <div class="ee-section-title">Video</div>
      <div class="ee-row"><div class="ee-drop" id="ee-vid-drop">${ICON.film}
        <div>Drop a video here or <b>click to upload</b></div>
        <div class="ee-help">MP4, WebM</div></div></div>
      <div class="ee-row"><label class="ee-label">Or paste a video URL</label>
        <input class="ee-input" id="ee-vid-url" value="${escapeAttr(el.getAttribute("src") || "")}"></div>
      <div class="ee-row">${checkbox("ee-vid-controls", "Show controls", el.hasAttribute("controls"))}</div>
      <div class="ee-row">${checkbox("ee-vid-autoplay", "Autoplay (muted loop)", el.hasAttribute("autoplay"))}</div>`;
    wireMediaDrop($("#ee-vid-drop", contentEl), "video/*", (file) => uploadFor(el, id, file, "src"));
    $("#ee-vid-url", contentEl).addEventListener("change", (e) =>
      commitOverride(id, (o) => { o.attrs = o.attrs || {}; o.attrs.src = e.target.value; el.setAttribute("src", e.target.value); }));
    $("#ee-vid-controls", contentEl).addEventListener("change", (e) => toggleAttr(el, id, "controls", e.target.checked));
    $("#ee-vid-autoplay", contentEl).addEventListener("change", (e) => {
      toggleAttr(el, id, "autoplay", e.target.checked);
      toggleAttr(el, id, "muted", e.target.checked);
      toggleAttr(el, id, "loop", e.target.checked);
    });
  }

  /* ---- TYPE tab ---- */
  const FONTS = [
    ["Libre Baskerville", "'Libre Baskerville', Georgia, serif"],
    ["Lato", "'Lato', sans-serif"],
    ["Georgia (serif)", "Georgia, serif"],
    ["System sans", "-apple-system, system-ui, sans-serif"],
    ["Playfair Display", "'Playfair Display', serif"],
    ["Cormorant Garamond", "'Cormorant Garamond', serif"],
    ["EB Garamond", "'EB Garamond', serif"],
    ["Merriweather", "'Merriweather', serif"],
    ["Lora", "'Lora', serif"],
    ["Montserrat", "'Montserrat', sans-serif"],
    ["Poppins", "'Poppins', sans-serif"],
    ["Inter", "'Inter', sans-serif"],
    ["Work Sans", "'Work Sans', sans-serif"],
    ["Nunito", "'Nunito', sans-serif"],
    ["Raleway", "'Raleway', sans-serif"],
  ];
  const GFONT = {
    "Playfair Display": "Playfair+Display:ital,wght@0,400;0,700;1,400",
    "Cormorant Garamond": "Cormorant+Garamond:ital,wght@0,400;0,600;1,400",
    "EB Garamond": "EB+Garamond:ital,wght@0,400;0,600;1,400",
    "Merriweather": "Merriweather:ital,wght@0,400;0,700;1,400",
    "Lora": "Lora:ital,wght@0,400;0,700;1,400",
    "Montserrat": "Montserrat:wght@300;400;600;700;900",
    "Poppins": "Poppins:wght@300;400;600;700",
    "Inter": "Inter:wght@300;400;600;700;900",
    "Work Sans": "Work+Sans:wght@300;400;600;700",
    "Nunito": "Nunito:wght@300;400;600;700;900",
    "Raleway": "Raleway:wght@300;400;600;700;900",
  };
  function ensureFont(name) {
    if (!GFONT[name]) return;
    const href = "https://fonts.googleapis.com/css2?family=" + GFONT[name] + "&display=swap";
    addFontLink(href);
    theme.fonts = theme.fonts || [];
    if (!theme.fonts.includes(href)) { theme.fonts.push(href); LS.set(THEME_KEY, theme); }
  }
  function renderTypeTab() {
    const el = selected;
    const id = el.getAttribute("data-ee-id");
    const px = (p) => parseFloat(ovStyle(el, p) || cs(el, p)) || 0;
    const fw = ovStyle(el, "font-weight") || cs(el, "font-weight");
    const ta = ovStyle(el, "text-align") || cs(el, "text-align");
    const fs = ovStyle(el, "font-style") || cs(el, "font-style");
    const tt = ovStyle(el, "text-transform") || cs(el, "text-transform");
    contentEl.innerHTML = `
      <div class="ee-section-title">Typography</div>
      <div class="ee-row"><label class="ee-label">Font family</label>
        <select class="ee-select" id="ee-font">
          <option value="">— inherit —</option>
          ${FONTS.map(f => `<option value="${escapeAttr(f[1])}">${f[0]}</option>`).join("")}
        </select></div>
      <div class="ee-grid">
        <div class="ee-row"><label class="ee-label">Size</label>${rangeField("ee-fs", 8, 120, px("font-size"), "px")}</div>
        <div class="ee-row"><label class="ee-label">Weight</label>
          ${selectField("ee-fw", ["300", "400", "500", "600", "700", "900"], String(parseInt(fw) || 400))}</div>
        <div class="ee-row"><label class="ee-label">Line height</label>${rangeField("ee-lh", 0.8, 3, parseFloat(ovStyle(el, "line-height")) || (px("line-height") / (px("font-size") || 1)) || 1.4, "", 0.05)}</div>
        <div class="ee-row"><label class="ee-label">Letter spacing</label>${rangeField("ee-ls", -2, 12, parseFloat(ovStyle(el, "letter-spacing")) || parseFloat(cs(el, "letter-spacing")) || 0, "px", 0.1)}</div>
      </div>
      <div class="ee-row"><label class="ee-label">Alignment</label>
        <div class="ee-btngroup" id="ee-align">
          ${["left", "center", "right", "justify"].map(a => `<button data-v="${a}" class="${ta === a ? "ee-on" : ""}">${a[0].toUpperCase() + a.slice(1)}</button>`).join("")}
        </div></div>
      <div class="ee-row"><label class="ee-label">Style</label>
        <div class="ee-btngroup" id="ee-tstyle">
          <button data-k="font-style" data-v="italic" class="${fs === "italic" ? "ee-on" : ""}"><i>Italic</i></button>
          <button data-k="text-transform" data-v="uppercase" class="${tt === "uppercase" ? "ee-on" : ""}">UPPER</button>
          <button data-k="text-decoration-line" data-v="underline" class="${(ovStyle(el, "text-decoration-line") || cs(el, "text-decoration-line")).includes("underline") ? "ee-on" : ""}">Under</button>
        </div></div>`;
    const fsel = $("#ee-font", contentEl);
    const curFam = ovStyle(el, "font-family");
    if (curFam) { const m = FONTS.find(f => f[1] === curFam); if (m) fsel.value = m[1]; }
    fsel.addEventListener("change", () => {
      const fam = fsel.value;
      const name = (FONTS.find(f => f[1] === fam) || [])[0];
      if (name) ensureFont(name);
      setStyle(el, id, "font-family", fam);
    });
    bindRange("ee-fs", (v) => setStyle(el, id, "font-size", v + "px"));
    $("#ee-fw", contentEl).addEventListener("change", (e) => setStyle(el, id, "font-weight", e.target.value));
    bindRange("ee-lh", (v) => setStyle(el, id, "line-height", v));
    bindRange("ee-ls", (v) => setStyle(el, id, "letter-spacing", v + "px"));
    $("#ee-align", contentEl).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      toggleGroup(b, "#ee-align"); setStyle(el, id, "text-align", b.classList.contains("ee-on") ? b.dataset.v : "");
    });
    $("#ee-tstyle", contentEl).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      b.classList.toggle("ee-on");
      setStyle(el, id, b.dataset.k, b.classList.contains("ee-on") ? b.dataset.v : "");
    });
  }

  /* ---- COLOR tab ---- */
  function renderColorTab() {
    const el = selected;
    const id = el.getAttribute("data-ee-id");
    contentEl.innerHTML = `
      <div class="ee-section-title">Colours</div>
      <div class="ee-row"><label class="ee-label">Text colour</label>${colorField("ee-c-text", toHex(ovStyle(el, "color") || cs(el, "color")))}</div>
      <div class="ee-row"><label class="ee-label">Background colour</label>${colorField("ee-c-bg", toHex(ovStyle(el, "background-color") || cs(el, "background-color")))}
        <div class="ee-help"><a href="#" id="ee-bg-clear">Clear background</a></div></div>
      <div class="ee-section-title">Border</div>
      <div class="ee-grid">
        <div class="ee-row"><label class="ee-label">Border colour</label>${colorField("ee-c-bd", toHex(ovStyle(el, "border-color") || cs(el, "border-color")))}</div>
        <div class="ee-row"><label class="ee-label">Border width</label>${rangeField("ee-bdw", 0, 12, parseFloat(ovStyle(el, "border-width") || cs(el, "border-width")) || 0, "px")}</div>
      </div>
      <div class="ee-section-title">Effects</div>
      <div class="ee-row"><label class="ee-label">Opacity</label>${rangeField("ee-op", 0, 1, parseFloat(ovStyle(el, "opacity") || cs(el, "opacity")) || 1, "", 0.05)}</div>`;
    bindColor("ee-c-text", (v) => setStyle(el, id, "color", v));
    bindColor("ee-c-bg", (v) => setStyle(el, id, "background-color", v));
    bindColor("ee-c-bd", (v) => { setStyle(el, id, "border-color", v); if (!parseFloat(cs(el, "border-width"))) setStyle(el, id, "border-style", "solid"); });
    bindRange("ee-bdw", (v) => { setStyle(el, id, "border-width", v + "px"); if (+v > 0) setStyle(el, id, "border-style", "solid"); });
    bindRange("ee-op", (v) => setStyle(el, id, "opacity", v));
    $("#ee-bg-clear", contentEl).addEventListener("click", (e) => { e.preventDefault(); setStyle(el, id, "background-color", "transparent"); });
  }

  /* ---- LAYOUT / SIZE tab ---- */
  function renderLayoutTab() {
    const el = selected;
    const id = el.getAttribute("data-ee-id");
    const val = (p) => ovStyle(el, p) || "";
    contentEl.innerHTML = `
      <div class="ee-section-title">Size</div>
      <div class="ee-grid">
        <div class="ee-row"><label class="ee-label">Width</label>${textUnit("ee-w", val("width"), Math.round(el.getBoundingClientRect().width) + "px")}</div>
        <div class="ee-row"><label class="ee-label">Height</label>${textUnit("ee-h", val("height"), Math.round(el.getBoundingClientRect().height) + "px")}</div>
        <div class="ee-row"><label class="ee-label">Max width</label>${textUnit("ee-mw", val("max-width"), "none")}</div>
        <div class="ee-row"><label class="ee-label">Corner radius</label>${rangeField("ee-br", 0, 80, parseFloat(val("border-radius") || cs(el, "border-radius")) || 0, "px")}</div>
      </div>
      <div class="ee-help">Values accept px, %, vw, rem, or <b>auto</b>. Leave blank to inherit.</div>
      <div class="ee-section-title">Spacing</div>
      <div class="ee-grid">
        <div class="ee-row"><label class="ee-label">Padding</label>${textUnit("ee-pad", val("padding"), cs(el, "padding"))}</div>
        <div class="ee-row"><label class="ee-label">Margin</label>${textUnit("ee-mar", val("margin"), cs(el, "margin"))}</div>
      </div>
      <div class="ee-help">One value applies to all sides, e.g. <b>24px</b>, or four: <b>10px 20px 10px 20px</b>.</div>`;
    bindText("ee-w", (v) => setStyle(el, id, "width", v));
    bindText("ee-h", (v) => setStyle(el, id, "height", v));
    bindText("ee-mw", (v) => setStyle(el, id, "max-width", v));
    bindRange("ee-br", (v) => setStyle(el, id, "border-radius", v + "px"));
    bindText("ee-pad", (v) => setStyle(el, id, "padding", v));
    bindText("ee-mar", (v) => setStyle(el, id, "margin", v));
  }

  /* ---- THEME tab ---- */
  // Read the CSS custom properties actually declared on :root for this page,
  // so the Theme tab adapts to whatever palette a given page uses.
  function readRootVars() {
    const out = {};
    for (const sheet of Array.from(document.styleSheets)) {
      let rules; try { rules = sheet.cssRules; } catch { continue; } // skip cross-origin (fonts)
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (rule.selectorText && /(^|,)\s*:root\s*$/.test(rule.selectorText)) {
          for (const prop of Array.from(rule.style)) {
            if (prop.startsWith("--")) out[prop] = rule.style.getPropertyValue(prop).trim();
          }
        }
      }
    }
    return out;
  }
  const looksColor = (v) => /^#([0-9a-f]{3,8})$|^(rgb|hsl)a?\(/i.test(v.trim());
  const looksFont = (k, v) => /serif|sans|mono|font/i.test(k) || /,|serif|sans-serif|monospace|['"]/.test(v);
  const niceLabel = (k) => k.replace(/^--/, "").replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  function renderTheme() {
    const r = getComputedStyle(document.documentElement);
    const rootVars = readRootVars();
    const cur = (k) => (theme.vars && theme.vars[k]) || rootVars[k] || r.getPropertyValue(k).trim();
    const colorVars = [], fontVars = [];
    for (const [k, v] of Object.entries(rootVars)) {
      if (looksFont(k, v)) fontVars.push(k);
      else if (looksColor(v)) colorVars.push(k);
    }
    contentEl.innerHTML = `
      <div class="ee-section-title">Brand colours — applied across the whole site</div>
      ${colorVars.length ? colorVars.map((k) => {
        const v = cur(k) || "#000000";
        return `<div class="ee-swatch-row">
          <input type="color" data-var="${k}" value="${toHex(v)}">
          <div class="ee-swatch-name">${niceLabel(k)}<small>${k}</small></div>
        </div>`;
      }).join("") : `<div class="ee-help">No site colour tokens found on this page.</div>`}
      ${fontVars.length ? `<div class="ee-section-title">Fonts</div>
        ${fontVars.map((k) => `<div class="ee-row"><label class="ee-label">${niceLabel(k)}<small style="text-transform:none;color:var(--ee-faint)"> ${k}</small></label>
          ${selectField2("ee-tf-" + k.replace(/[^a-z0-9]/gi, ""), FONTS, cur(k))}</div>`).join("")}` : ""}
      <div class="ee-row" style="margin-top:18px"><button class="ee-btn ee-ghost ee-danger-btn" id="ee-theme-reset">${ICON.reset} Reset theme to original</button></div>`;
    $$('input[data-var]', contentEl).forEach((inp) =>
      inp.addEventListener("input", () => setThemeVar(inp.dataset.var, inp.value)));
    fontVars.forEach((k) => {
      const sel = $("#ee-tf-" + k.replace(/[^a-z0-9]/gi, ""), contentEl); if (!sel) return;
      sel.addEventListener("change", (e) => { const n = fontName(e.target.value); if (n) ensureFont(n); setThemeVar(k, e.target.value); });
    });
    $("#ee-theme-reset", contentEl).addEventListener("click", () => {
      confirmModal("Reset theme?", "This clears all site-wide colour & font changes. Per-element edits stay.", () => {
        theme.vars = {}; LS.set(THEME_KEY, theme);
        document.documentElement.removeAttribute("style"); applyTheme(); renderTheme(); toast("Theme reset", "ok");
      });
    });
  }
  function fontName(v) { return (FONTS.find(f => f[1] === v) || [])[0]; }
  function setThemeVar(k, v) {
    theme.vars = theme.vars || {};
    theme.vars[k] = v;
    LS.set(THEME_KEY, theme);
    document.documentElement.style.setProperty(k, v);
    markDirty();
  }

  /* ---- MEDIA tab ---- */
  async function renderMedia() {
    contentEl.innerHTML = `
      <div class="ee-section-title">Media library</div>
      <div class="ee-row"><div class="ee-drop" id="ee-media-drop">${ICON.upload}
        <div>Drop files here or <b>click to upload</b></div>
        <div class="ee-help">Images, video, PDF — stored locally, published on save.</div></div></div>
      <input type="file" id="ee-media-file" multiple accept="image/*,video/*,application/pdf" style="display:none">
      <div class="ee-media-grid" id="ee-media-grid"></div>
      <div class="ee-help" id="ee-media-empty" style="display:none">Nothing uploaded yet. Files you add to images, video, or here will appear in this library.</div>`;
    const drop = $("#ee-media-drop", contentEl);
    const file = $("#ee-media-file", contentEl);
    drop.addEventListener("click", () => file.click());
    wireDropEvents(drop, (files) => Array.from(files).forEach(addLibraryFile));
    file.addEventListener("change", () => Array.from(file.files).forEach(addLibraryFile));
    paintMediaGrid();
  }
  async function paintMediaGrid() {
    const grid = $("#ee-media-grid", contentEl); if (!grid) return;
    const all = await mediaAll();
    $("#ee-media-empty", contentEl).style.display = all.length ? "none" : "block";
    grid.innerHTML = "";
    for (const rec of all) {
      const cell = document.createElement("div");
      cell.className = "ee-media-item" + (rec.committed ? "" : " ee-pending");
      cell.title = rec.path.split("/").pop() + (rec.committed ? "" : " — not yet published");
      if (rec.type.startsWith("image/")) {
        cell.innerHTML = `<img src="${URL.createObjectURL(rec.blob)}">`;
      } else if (rec.type.startsWith("video/")) {
        cell.innerHTML = `<video src="${URL.createObjectURL(rec.blob)}" muted></video>`;
      } else {
        cell.innerHTML = `<div class="ee-media-type">${ICON.file}<span>PDF</span></div>`;
      }
      const del = document.createElement("button");
      del.className = "ee-media-del"; del.innerHTML = ICON.close;
      del.addEventListener("click", async (e) => { e.stopPropagation(); await mediaDel(rec.path); paintMediaGrid(); });
      cell.appendChild(del);
      cell.addEventListener("click", () => applyMediaToSelection(rec));
      grid.appendChild(cell);
    }
  }
  async function applyMediaToSelection(rec) {
    if (!selected) return toast("Select an image or video on the page first", "err");
    const id = selected.getAttribute("data-ee-id");
    if (isImg(selected) && rec.type.startsWith("image/")) {
      const u = await objURLFor(rec.path); selected.setAttribute("src", u);
      commitOverride(id, (o) => { o.attrs = o.attrs || {}; o.attrs.src = rec.path; });
      selected.setAttribute("data-ee-src", rec.path); toast("Image applied", "ok");
    } else if (isVideo(selected) && rec.type.startsWith("video/")) {
      const u = await objURLFor(rec.path); selected.setAttribute("src", u);
      commitOverride(id, (o) => { o.attrs = o.attrs || {}; o.attrs.src = rec.path; });
      selected.setAttribute("data-ee-src", rec.path); toast("Video applied", "ok");
    } else toast("That media type doesn't match the selected element", "err");
  }
  function newPath(file) {
    const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
    const stamp = (undoStack.length + redoStack.length + Object.keys(overrides).length + safe.length + file.size).toString(36);
    return "images/uploads/" + stamp + "-" + safe;
  }
  async function addLibraryFile(file) {
    const path = newPath(file);
    await mediaPut(path, file, file.type);
    objURLs[path] = URL.createObjectURL(file);
    markDirty(); paintMediaGrid();
    toast(file.name + " added", "ok");
    return path;
  }

  /* ---- PUBLISH tab ---- */
  function renderPublish() {
    const gh = LS.get(GH_KEY, {});
    const connected = gh.token && gh.owner && gh.repo;
    const dirtyCount = Object.keys(overrides).length + (theme.vars ? Object.keys(theme.vars).length : 0);
    contentEl.innerHTML = `
      <div class="ee-section-title">Publish to your live site</div>
      ${connected
        ? `<div class="ee-help" style="margin-bottom:14px">Connected to <b>${escapeHTML(gh.owner)}/${escapeHTML(gh.repo)}</b>
             (branch <b>${escapeHTML(gh.branch || "main")}</b>). Saving commits your changes — GitHub Pages
             then rebuilds and your edits go live in a minute or two.</div>
           <div class="ee-row"><button class="ee-btn ee-primary" id="ee-publish">${ICON.publish} Save & publish this page</button></div>
           <div class="ee-row"><button class="ee-btn ee-ghost" id="ee-gh-edit">Edit GitHub connection</button></div>`
        : `<div class="ee-help" style="margin-bottom:14px">Connect GitHub once so the editor can save your changes
             straight to the live site. Your token stays in this browser only.</div>
           <div class="ee-row"><button class="ee-btn ee-primary" id="ee-gh-edit">${ICON.publish} Connect GitHub</button></div>`}
      <div class="ee-section-title">This page has ${dirtyCount} pending change${dirtyCount === 1 ? "" : "s"}</div>
      <div class="ee-row"><button class="ee-btn ee-ghost" id="ee-export">Download edited HTML (backup)</button></div>
      <div class="ee-section-title">Undo</div>
      <div class="ee-help" style="margin-bottom:12px">Every publish is a git commit, so you can also roll back from
        GitHub's history at any time.</div>
      <div class="ee-row"><button class="ee-btn ee-ghost ee-danger-btn" id="ee-reset-all">${ICON.reset} Discard all unpublished changes on this page</button></div>`;
    const ge = $("#ee-gh-edit", contentEl); if (ge) ge.addEventListener("click", githubModal);
    const pb = $("#ee-publish", contentEl); if (pb) pb.addEventListener("click", publish);
    $("#ee-export", contentEl).addEventListener("click", exportHTML);
    $("#ee-reset-all", contentEl).addEventListener("click", resetAll);
  }

  /* ════════════════════════ style / attr setters ═════════════════════ */
  function setStyle(el, id, prop, value) {
    if (value === "" || value == null) el.style.removeProperty(prop);
    else el.style.setProperty(prop, value);
    commitOverride(id, (o) => {
      o.styles = o.styles || {};
      if (value === "" || value == null) { delete o.styles[prop]; if (!Object.keys(o.styles).length) delete o.styles; }
      else o.styles[prop] = value;
    });
  }
  function toggleAttr(el, id, attr, on) {
    if (on) el.setAttribute(attr, ""); else el.removeAttribute(attr);
    commitOverride(id, (o) => { o.attrs = o.attrs || {}; if (on) o.attrs[attr] = ""; else delete o.attrs[attr]; });
  }
  function setImageSrc(el, id, url) {
    el.setAttribute("src", url); el.removeAttribute("data-ee-src");
    commitOverride(id, (o) => { o.attrs = o.attrs || {}; o.attrs.src = url; });
  }
  async function uploadFor(el, id, file, attr) {
    const path = await addLibraryFile(file);
    const u = await objURLFor(path);
    el.setAttribute(attr, u);
    el.setAttribute("data-ee-" + attr, path);
    commitOverride(id, (o) => { o.attrs = o.attrs || {}; o.attrs[attr] = path; });
  }
  function wireImageDrop(el, id) {
    const drop = $("#ee-img-drop", contentEl);
    wireMediaDrop(drop, "image/*", (file) => uploadFor(el, id, file, "src"));
  }
  function wireMediaDrop(drop, accept, onFile) {
    const input = document.createElement("input");
    input.type = "file"; input.accept = accept; input.style.display = "none";
    drop.appendChild(input);
    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", () => { if (input.files[0]) onFile(input.files[0]); });
    wireDropEvents(drop, (files) => { if (files[0]) onFile(files[0]); });
  }
  function wireDropEvents(drop, onFiles) {
    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("ee-over"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("ee-over"); }));
    drop.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); });
  }

  /* ════════════════════════ inline text editing ══════════════════════ */
  function onDblClick(e) {
    if (!editing) return;
    const el = e.target.closest("[data-ee-id]");
    if (!el || el.closest("#ee-root")) return;
    if (isMedia(el) || el.children.length > 0) return;
    e.preventDefault();
    startInlineEdit(el);
  }
  function startInlineEdit(el) {
    const id = el.getAttribute("data-ee-id");
    el.classList.add("ee-text-editing");
    el.setAttribute("contenteditable", "true");
    el.focus();
    const finish = () => {
      el.removeAttribute("contenteditable");
      el.classList.remove("ee-text-editing");
      commitOverride(id, (o) => { o.text = el.textContent; });
      el.removeEventListener("blur", finish);
    };
    el.addEventListener("blur", finish);
    el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); el.blur(); } });
  }

  /* ════════════════════════ publish (GitHub) ═════════════════════════ */
  function githubModal() {
    const gh = LS.get(GH_KEY, {});
    modal(`<h3>${ICON.publish} Connect GitHub</h3>
      <p>The editor commits your changes straight to your repo. Your token is stored only in this browser
         (localStorage) and never sent anywhere except GitHub.</p>
      <div class="ee-row"><label class="ee-label">Repository owner (your GitHub username)</label>
        <input class="ee-input" id="ee-gh-owner" value="${escapeAttr(gh.owner || "")}" placeholder="dejahwashington"></div>
      <div class="ee-row"><label class="ee-label">Repository name</label>
        <input class="ee-input" id="ee-gh-repo" value="${escapeAttr(gh.repo || "dejah-white-travel")}" placeholder="dejah-white-travel"></div>
      <div class="ee-row"><label class="ee-label">Branch</label>
        <input class="ee-input" id="ee-gh-branch" value="${escapeAttr(gh.branch || "main")}" placeholder="main"></div>
      <div class="ee-row"><label class="ee-label">Personal access token</label>
        <input class="ee-input" id="ee-gh-token" type="password" value="${escapeAttr(gh.token || "")}" placeholder="github_pat_…">
        <div class="ee-help">Create one at <a href="https://github.com/settings/tokens?type=beta" target="_blank">github.com/settings/tokens</a>
          — fine-grained, with <b>Contents: Read & write</b> on this repo.</div></div>
      <div class="ee-modal-actions">
        <button class="ee-btn ee-ghost" id="ee-gh-cancel">Cancel</button>
        <button class="ee-btn ee-primary" id="ee-gh-save">Save connection</button>
      </div>`);
    $("#ee-gh-cancel").addEventListener("click", closeModal);
    $("#ee-gh-save").addEventListener("click", () => {
      const data = {
        owner: $("#ee-gh-owner").value.trim(),
        repo: $("#ee-gh-repo").value.trim(),
        branch: $("#ee-gh-branch").value.trim() || "main",
        token: $("#ee-gh-token").value.trim(),
      };
      if (!data.owner || !data.repo || !data.token) return toast("Fill in owner, repo and token", "err");
      LS.set(GH_KEY, data); closeModal(); toast("GitHub connected", "ok"); renderPublish();
    });
  }

  async function ghApi(path, opts = {}) {
    const gh = LS.get(GH_KEY, {});
    const res = await fetch("https://api.github.com" + path, {
      ...opts,
      headers: {
        Authorization: "Bearer " + gh.token,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.headers || {}),
      },
    });
    return res;
  }
  async function ghGetSha(repoPath) {
    const gh = LS.get(GH_KEY, {});
    const res = await ghApi(`/repos/${gh.owner}/${gh.repo}/contents/${repoPath}?ref=${gh.branch}`);
    if (res.status === 200) { const j = await res.json(); return j.sha; }
    return null;
  }
  async function ghPut(repoPath, base64Content, message) {
    const gh = LS.get(GH_KEY, {});
    const sha = await ghGetSha(repoPath);
    const res = await ghApi(`/repos/${gh.owner}/${gh.repo}/contents/${repoPath}`, {
      method: "PUT",
      body: JSON.stringify({ message, content: base64Content, branch: gh.branch, ...(sha ? { sha } : {}) }),
    });
    if (!res.ok) { const t = await res.text(); throw new Error("GitHub " + res.status + ": " + t.slice(0, 200)); }
    return res.json();
  }

  // Build the global theme stylesheet (colours + fonts) from overrides.
  function buildThemeCSS() {
    let css = "";
    (theme.fonts || []).forEach(h => { css += `@import url('${h}');\n`; });
    if (theme.vars && Object.keys(theme.vars).length) {
      css += ":root{\n";
      for (const [k, v] of Object.entries(theme.vars)) css += `  ${k}: ${v};\n`;
      css += "}\n";
    }
    return css;
  }

  // Serialize the current page with all edits baked in as inline HTML.
  function serializePage() {
    const clone = document.documentElement.cloneNode(true);
    // strip editor's own DOM + transient classes
    const r = clone.querySelector("#ee-root"); if (r) r.remove();
    clone.querySelectorAll(".ee-footer-key").forEach(n => n.remove());
    // fonts live in the global theme.css, not per page
    clone.querySelectorAll("link[data-ee-font]").forEach(n => n.remove());
    // theme vars live in theme.css too — don't bake them inline on <html>
    clone.removeAttribute("style");
    clone.querySelectorAll(".ee-selected,.ee-text-editing").forEach(n => n.classList.remove("ee-selected", "ee-text-editing"));
    clone.classList.remove("ee-editing", "ee-pick");
    // swap uploaded blob: URLs back to their committed repo paths
    clone.querySelectorAll("[data-ee-src]").forEach(n => { n.setAttribute("src", n.getAttribute("data-ee-src")); n.removeAttribute("data-ee-src"); });
    clone.querySelectorAll("[data-ee-poster]").forEach(n => { n.setAttribute("poster", n.getAttribute("data-ee-poster")); n.removeAttribute("data-ee-poster"); });
    clone.querySelectorAll("[contenteditable]").forEach(n => n.removeAttribute("contenteditable"));
    return "<!DOCTYPE html>\n<html" + attrs(clone) + ">\n" + clone.innerHTML + "\n</html>";
  }
  function attrs(el) { return Array.from(el.attributes).map(a => ` ${a.name}="${a.value}"`).join(""); }

  async function blobToBase64(blob) {
    const buf = await blob.arrayBuffer();
    let bin = ""; const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(bin);
  }
  function strToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  async function publish() {
    const gh = LS.get(GH_KEY, {});
    if (!gh.token) return githubModal();
    const btn = $("#ee-publish", contentEl);
    const orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = "Publishing…";
    try {
      // 1) upload any pending media used on the page
      const pending = (await mediaAll()).filter(m => !m.committed);
      for (const m of pending) {
        btn.innerHTML = "Uploading " + m.path.split("/").pop() + "…";
        const b64 = await blobToBase64(m.blob);
        await ghPut(m.path, b64, "Add media " + m.path.split("/").pop() + " (visual editor)");
        await mediaMark(m.path);
      }
      // 2) commit the global theme (colours + fonts) so every page picks it up
      const themeCSS = buildThemeCSS();
      if (themeCSS) {
        btn.innerHTML = "Saving theme…";
        await ghPut("editor/theme.css", strToBase64(themeCSS), "Update site theme via visual editor");
      }
      // 3) commit the page HTML with edits baked in
      btn.innerHTML = "Saving " + PAGE + "…";
      const html = serializePage();
      await ghPut(PAGE, strToBase64(html), "Edit " + PAGE + " via visual editor");
      btn.disabled = false; btn.innerHTML = orig;
      fab && fab.classList.remove("ee-has-changes");
      toast("Published! Live in ~1–2 min as Pages rebuilds.", "ok", 5000);
    } catch (err) {
      btn.disabled = false; btn.innerHTML = orig;
      toast("Publish failed — " + err.message, "err", 7000);
    }
  }

  function exportHTML() {
    const html = serializePage();
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = PAGE; a.click();
    toast("Downloaded " + PAGE, "ok");
  }

  function resetAll() {
    confirmModal("Discard all unpublished changes?",
      "This clears every edit on this page that you haven't published yet, and reloads the page from the live version. Published changes are unaffected.",
      () => {
        LS.del(OV_KEY);
        toast("Reverting…", "ok");
        setTimeout(() => location.reload(), 400);
      });
  }

  /* ════════════════════════ panel open / close ═══════════════════════ */
  function openPanel() {
    panel.classList.remove("ee-hidden", "ee-collapsed");
    fab.style.display = "none";
    if (!editing) enterEditing();
    if (!$(".ee-tab.ee-active", panel)) setTab(activeTab);
    else renderContent();
  }
  function minimizePanel() {
    panel.classList.add("ee-hidden");
    fab.style.display = "flex";
  }
  function enterEditing() {
    editing = true;
    document.body.classList.add("ee-editing", "ee-pick");
    setTab(activeTab);
    refreshHistoryBtns();
  }
  function exitEditing() {
    editing = false;
    document.body.classList.remove("ee-editing", "ee-pick");
    if (selected) { selected.classList.remove("ee-selected"); selected = null; }
    panel.classList.add("ee-hidden");
    fab.style.display = "none";
  }
  function refreshHistoryBtns() {
    if (undoBtn) undoBtn.disabled = !undoStack.length;
    if (redoBtn) redoBtn.disabled = !redoStack.length;
  }

  /* ════════════════════════ passcode gate ════════════════════════════ */
  async function hash(str) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function requestUnlock() {
    if (editing) { openPanel(); return; }
    if (sessionStorage.getItem("ee:unlocked") === "1") return openPanel();
    const stored = LS.get(PASS_KEY, null);
    if (!stored) return setPasscodeModal();
    promptPasscodeModal(stored);
  }
  function setPasscodeModal() {
    modal(`<h3>${ICON.key} Set an editor passcode</h3>
      <p>First time here — choose a passcode. You'll enter it to unlock editing. Keep it private; anyone with it can edit the site.</p>
      <div class="ee-row"><label class="ee-label">New passcode</label><input class="ee-input" type="password" id="ee-pass1"></div>
      <div class="ee-row"><label class="ee-label">Confirm passcode</label><input class="ee-input" type="password" id="ee-pass2"></div>
      <div class="ee-modal-actions">
        <button class="ee-btn ee-ghost" id="ee-pass-cancel">Cancel</button>
        <button class="ee-btn ee-primary" id="ee-pass-set">Set & unlock</button></div>`);
    $("#ee-pass1").focus();
    $("#ee-pass-cancel").addEventListener("click", closeModal);
    $("#ee-pass-set").addEventListener("click", async () => {
      const a = $("#ee-pass1").value, b = $("#ee-pass2").value;
      if (a.length < 4) return toast("Use at least 4 characters", "err");
      if (a !== b) return toast("Passcodes don't match", "err");
      LS.set(PASS_KEY, await hash(a));
      sessionStorage.setItem("ee:unlocked", "1");
      closeModal(); openPanel(); toast("Editor unlocked", "ok");
    });
  }
  function promptPasscodeModal(stored) {
    modal(`<h3>${ICON.key} Enter passcode</h3>
      <p>Unlock the visual editor to make changes to this site.</p>
      <div class="ee-row"><input class="ee-input" type="password" id="ee-pass" placeholder="Passcode" autofocus></div>
      <div class="ee-modal-actions">
        <button class="ee-btn ee-ghost" id="ee-pass-cancel">Cancel</button>
        <button class="ee-btn ee-primary" id="ee-pass-go">Unlock</button></div>`);
    const input = $("#ee-pass"); input.focus();
    const go = async () => {
      if (await hash(input.value) === stored) {
        sessionStorage.setItem("ee:unlocked", "1"); closeModal(); openPanel(); toast("Editor unlocked", "ok");
      } else toast("Wrong passcode", "err");
    };
    $("#ee-pass-go").addEventListener("click", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    $("#ee-pass-cancel").addEventListener("click", closeModal);
  }

  /* ════════════════════════ modal / toast ════════════════════════════ */
  let modalWrap = null;
  function modal(html) {
    closeModal();
    modalWrap = document.createElement("div");
    modalWrap.className = "ee-layer ee-modal-wrap";
    modalWrap.innerHTML = `<div class="ee-modal">${html}</div>`;
    root.appendChild(modalWrap);
    modalWrap.addEventListener("mousedown", (e) => { if (e.target === modalWrap) closeModal(); });
  }
  function closeModal() { if (modalWrap) { modalWrap.remove(); modalWrap = null; } }
  function confirmModal(title, body, onYes) {
    modal(`<h3>${ICON.alert} ${escapeHTML(title)}</h3><p>${escapeHTML(body)}</p>
      <div class="ee-modal-actions">
        <button class="ee-btn ee-ghost" id="ee-cf-no">Cancel</button>
        <button class="ee-btn ee-primary" id="ee-cf-yes">Yes, continue</button></div>`);
    $("#ee-cf-no").addEventListener("click", closeModal);
    $("#ee-cf-yes").addEventListener("click", () => { closeModal(); onYes(); });
  }
  function toast(msg, kind = "ok", ms = 3000) {
    const t = document.createElement("div");
    t.className = "ee-toast ee-" + kind;
    t.innerHTML = (kind === "ok" ? ICON.check : ICON.alert) + "<span>" + escapeHTML(msg) + "</span>";
    $("#ee-toasts").appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, ms);
  }

  /* ════════════════════════ small field builders ═════════════════════ */
  function selectField(id, opts, val) {
    return `<select class="ee-select" id="${id}">${opts.map(o => `<option ${o === val ? "selected" : ""}>${o}</option>`).join("")}</select>`;
  }
  function selectField2(id, pairs, val) {
    return `<select class="ee-select" id="${id}"><option value="">— inherit —</option>${pairs.map(p => `<option value="${escapeAttr(p[1])}" ${p[1] === val ? "selected" : ""}>${p[0]}</option>`).join("")}</select>`;
  }
  function rangeField(id, min, max, val, unit, step) {
    step = step || 1; val = Math.max(min, Math.min(max, Number(val) || 0));
    return `<div class="ee-range-wrap"><input type="range" class="ee-range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
      <span class="ee-range-val" id="${id}-v">${val}${unit}</span></div>`;
  }
  function textUnit(id, val, placeholder) {
    return `<input class="ee-input" id="${id}" value="${escapeAttr(val)}" placeholder="${escapeAttr(placeholder || "")}">`;
  }
  function colorField(id, hex) {
    return `<div class="ee-color"><input type="color" id="${id}-c" value="${hex}"><input class="ee-input" id="${id}-t" value="${hex}"></div>`;
  }
  function checkbox(id, label, on) {
    return `<label style="display:flex;align-items:center;gap:9px;cursor:pointer;font-size:13px;color:var(--ee-text)">
      <input type="checkbox" id="${id}" ${on ? "checked" : ""} style="width:16px;height:16px;accent-color:var(--ee-accent)">${label}</label>`;
  }
  function bindRange(id, fn) {
    const r = $("#" + id, contentEl), v = $("#" + id + "-v", contentEl);
    if (!r) return;
    const unit = (v.textContent.match(/[a-z%]+$/) || [""])[0];
    r.addEventListener("input", () => { v.textContent = r.value + unit; fn(r.value); });
  }
  function bindColor(id, fn) {
    const c = $("#" + id + "-c", contentEl), t = $("#" + id + "-t", contentEl);
    if (!c) return;
    c.addEventListener("input", () => { t.value = c.value; fn(c.value); });
    t.addEventListener("change", () => { if (/^#?[0-9a-f]{3,8}$/i.test(t.value)) { c.value = toHex(t.value); fn(t.value); } });
  }
  function bindText(id, fn) {
    const i = $("#" + id, contentEl); if (!i) return;
    i.addEventListener("change", () => fn(i.value.trim()));
  }
  function toggleGroup(btn, sel) {
    const on = !btn.classList.contains("ee-on");
    $$(sel + " button", contentEl).forEach(b => b.classList.remove("ee-on"));
    if (on) btn.classList.add("ee-on");
  }

  /* ── colour parsing ── */
  function toHex(c) {
    if (!c) return "#000000";
    c = c.trim();
    if (c[0] === "#") { if (c.length === 4) return "#" + c.slice(1).split("").map(x => x + x).join(""); return c.slice(0, 7); }
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(",").map(s => parseFloat(s));
      return "#" + p.slice(0, 3).map(n => Math.round(n).toString(16).padStart(2, "0")).join("");
    }
    return "#000000";
  }

  /* ── escaping ── */
  function escapeHTML(s) { return String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }
  function escapeAttr(s) { return String(s == null ? "" : s).replace(/[&"]/g, c => ({ "&": "&amp;", '"': "&quot;" }[c])); }

  /* ════════════════════════ draggable fab ════════════════════════════ */
  function makeDraggable(el) {
    let sx, sy, ox, oy, moved;
    el.addEventListener("mousedown", (e) => {
      moved = false; el._dragged = false;
      sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect(); ox = r.left; oy = r.top;
      const move = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; el._dragged = true; }
        el.style.left = Math.max(6, Math.min(window.innerWidth - 56, ox + dx)) + "px";
        el.style.top = Math.max(6, Math.min(window.innerHeight - 56, oy + dy)) + "px";
        el.style.right = "auto"; el.style.bottom = "auto";
      };
      const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up);
        setTimeout(() => { el._dragged = false; }, 50); };
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    });
  }

  /* ════════════════════════ resize panel ═════════════════════════════ */
  function setupResize() {
    const handle = $(".ee-resize", panel);
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const startY = e.clientY, startH = panel.getBoundingClientRect().height;
      const move = (ev) => {
        const h = Math.max(120, Math.min(window.innerHeight * 0.9, startH + (startY - ev.clientY)));
        panel.style.height = h + "px";
      };
      const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
      document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
    });
  }

  /* ════════════════════════ keyboard ═════════════════════════════════ */
  function onKey(e) {
    if (!editing) return;
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (meta && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); redo(); }
    else if (e.key === "Escape" && selected && !modalWrap) { selected.classList.remove("ee-selected"); selected = null; renderContent(); }
  }

  /* ════════════════════════ boot ═════════════════════════════════════ */
  function boot() {
    assignIds();
    buildUI();
    applyAll();
    document.addEventListener("click", onPageClick, true);
    document.addEventListener("dblclick", onDblClick, true);
    document.addEventListener("keydown", onKey, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
