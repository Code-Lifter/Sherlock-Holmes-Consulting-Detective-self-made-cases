/* =========================================================================
   util.js — shared helpers: escaping, mini-markdown, media paths,
   notifications, lightbox and modal.
   Everything hangs off the global SH namespace.
   ========================================================================= */
window.SH = window.SH || {};

SH.util = (() => {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };

  /** Inline markdown: **bold**, *italic*, ~~strike~~, [link](url), {{variables}} */
  const inline = (raw) => {
    let s = esc(raw);
    s = s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, v) => esc(SH.util.variable(v)));
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      const safe = SH.media.safeURL(url.replace(/&amp;/g, "&"), true);
      return safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener">${label}</a>` : label;
    });
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
    return s;
  };

  /** Block-level: blank line = new paragraph, single newline = line break */
  const paragraphs = (raw, tag = "p") =>
    String(raw ?? "")
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<${tag}>${inline(p).replace(/\n/g, "<br>")}</${tag}>`)
      .join("");

  /** {{leads}}, {{flag:name}}, {{counter:name}}, {{letters}}, {{title}} */
  const variable = (name) => {
    const st = SH.game?.state;
    const c = SH.game?.caseData;
    if (!st) return "";
    const [kind, arg] = name.split(":").map((x) => x.trim());
    switch (kind) {
      case "leads": return st.leads;
      case "letters": return Object.keys(st.letters).join(", ") || "none";
      case "title": return c?.meta?.title || "";
      case "flag": return st.flags[arg] === undefined ? "" : String(st.flags[arg]);
      case "counter": return st.counters[arg] ?? 0;
      default: return `{{${name}}}`;
    }
  };

  const normAnswer = (s) =>
    String(s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

  const download = (filename, text, type = "application/json") => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, val) { try { localStorage.setItem(key, val); } catch { /* storage full or blocked */ } },
    remove(key) { try { localStorage.removeItem(key); } catch {} },
  };

  return { esc, el, inline, paragraphs, variable, normAnswer, download, store };
})();

/* ------------------------------------------------------------------------
   Media: resolves paths written in the case file to something the browser
   can load — a file inside a dropped .zip, a path relative to a case URL,
   an absolute URL, or a data: URI.
   ------------------------------------------------------------------------ */
SH.media = (() => {
  let zipMap = {};      // "media/map.png" -> blob: URL
  let zipMapLower = {};
  let baseURL = "";     // folder of a case loaded by URL

  const clean = (p) => String(p || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");

  const reset = () => {
    Object.values(zipMap).forEach((u) => URL.revokeObjectURL(u));
    zipMap = {};
    zipMapLower = {};
    baseURL = "";
  };

  const setZipMap = (map) => {
    zipMap = map;
    zipMapLower = {};
    for (const [k, v] of Object.entries(map)) zipMapLower[k.toLowerCase()] = v;
  };

  const setBase = (url) => { baseURL = url ? url.replace(/[^/]*$/, "") : ""; };

  /** Only allow safe schemes. allowMail for links. */
  const safeURL = (u, allowMail = false) => {
    const s = String(u || "").trim();
    if (!s) return "";
    if (/^(https?:|blob:)/i.test(s)) return s;
    if (/^data:(image|audio|video|application\/pdf)\//i.test(s)) return s;
    if (allowMail && /^mailto:/i.test(s)) return s;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return ""; // javascript:, etc.
    return s; // relative path
  };

  const resolve = (src) => {
    if (!src) return "";
    const s = String(src).trim();
    if (/^(https?:|data:|blob:)/i.test(s)) return safeURL(s);
    const p = clean(s);
    if (zipMap[p]) return zipMap[p];
    if (zipMapLower[p.toLowerCase()]) return zipMapLower[p.toLowerCase()];
    if (baseURL) return safeURL(new URL(p, baseURL).href);
    return safeURL(p);
  };

  const youtubeId = (v) => {
    const m = String(v || "").match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/);
    return m ? m[1] : /^[\w-]{11}$/.test(v) ? v : null;
  };

  return { reset, setZipMap, setBase, resolve, safeURL, youtubeId, clean };
})();

/* ------------------------------------------------------------------------
   UI primitives: notifications, lightbox, modal
   ------------------------------------------------------------------------ */
SH.ui = (() => {
  const { el } = SH.util;

  const notify = (message, kind = "info") => {
    let area = document.getElementById("notifications");
    if (!area) { area = el("div", { id: "notifications" }); document.body.appendChild(area); }
    const n = el("div", { class: `notification ${kind}`, role: "status", text: message });
    area.appendChild(n);
    while (area.children.length > 4) area.firstElementChild.remove();
    requestAnimationFrame(() => n.classList.add("show"));
    setTimeout(() => {
      n.classList.remove("show");
      setTimeout(() => n.remove(), 500);
    }, 3500);
  };

  let overlay;
  const ensureOverlay = () => {
    if (overlay) return overlay;
    overlay = el("div", { class: "overlay", hidden: true, onclick: (e) => { if (e.target === overlay) close(); } });
    document.body.appendChild(overlay);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !overlay.hidden) close(); });
    return overlay;
  };

  const close = () => {
    if (!overlay) return;
    overlay.querySelectorAll("audio,video").forEach((m) => m.pause());
    overlay.hidden = true;
    overlay.innerHTML = "";
    document.body.classList.remove("no-scroll");
  };

  const show = (inner) => {
    const o = ensureOverlay();
    o.innerHTML = "";
    o.appendChild(inner);
    o.hidden = false;
    document.body.classList.add("no-scroll");
  };

  const closeBtn = () => el("button", { class: "overlay-close", "aria-label": "Close", onclick: close, text: "✕" });

  /** Full-screen image viewer. Click the picture to toggle actual size. */
  const lightbox = (src, caption) => {
    const img = el("img", { src: SH.media.resolve(src), alt: caption || "" });
    const frame = el("div", { class: "lightbox" },
      closeBtn(),
      el("div", { class: "lightbox-scroll" }, img),
      caption ? el("div", { class: "lightbox-caption", html: SH.util.inline(caption) }) : null,
      el("div", { class: "lightbox-tip", text: "Click the image to zoom · Esc to close" })
    );
    img.addEventListener("click", () => frame.classList.toggle("zoomed"));
    show(frame);
  };

  /** Modal with a title and arbitrary content (node or fragment). */
  const modal = (title, content, extraClass = "") => {
    const box = el("div", { class: `modal ${extraClass}` },
      closeBtn(),
      title ? el("h3", { class: "modal-title", text: title }) : null,
      el("div", { class: "modal-body current-text" }, content)
    );
    show(box);
    return box;
  };

  return { notify, lightbox, modal, close };
})();
