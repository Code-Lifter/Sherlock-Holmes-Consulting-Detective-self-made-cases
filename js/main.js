/* =========================================================================
   main.js — the landing page (drop a case), the author's guide viewer,
   mobile menu, and boot.
   ========================================================================= */
window.SH = window.SH || {};

SH.main = (() => {
  const { el, inline, esc } = SH.util;
  const $ = (id) => document.getElementById(id);
  const DEMO_URL = "cases/demo/case.json";
  const GUIDE_URL = "CASE_GUIDE.md";

  const show = (which) => {
    ["landing", "guide-view", "game"].forEach((id) => { $(id).hidden = id !== which; });
    window.scrollTo(0, 0);
  };

  const setStatus = (html, kind = "") => {
    const s = $("load-status");
    s.className = `load-status ${kind}`;
    s.innerHTML = html;
    s.hidden = !html;
  };

  /* ---------------- Loading a case ---------------- */

  const load = async (getter, remember) => {
    setStatus("Opening the case file…");
    try {
      SH.media.reset();
      const res = await getter();
      if (res.media) SH.media.setZipMap(res.media);
      if (res.base) SH.media.setBase(res.base);
      const data = SH.loader.normalize(res.data);
      const { errors, warnings } = SH.loader.validate(data);
      if (errors.length) {
        setStatus(`<strong>This case file can't be played yet:</strong><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` +
          (warnings.length ? `<details><summary>${warnings.length} other warning(s)</summary><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></details>` : ""), "error");
        return;
      }
      if (remember) await SH.loader.remember({ ...remember, title: data.meta.title || "Untitled case" });
      setStatus("");
      show("game");
      SH.game.start(data, warnings);
      if (warnings.length && (data.settings.debug || /[?&]debug\b/.test(location.search))) showWarnings(warnings);
    } catch (e) {
      console.error(e);
      setStatus(`<strong>Couldn't open that case.</strong><br>${esc(e.message || e)}`, "error");
    }
  };

  const loadFile = (file) => load(() => SH.loader.fromFile(file), { kind: "file", blob: file, name: file.name });
  const loadURL = (url) => load(() => SH.loader.fromURL(url), { kind: "url", url });

  const closeCase = () => {
    if (SH.game.caseData) SH.game.save();
    SH.ui.close();
    show("landing");
    renderResume();
    if (location.search.includes("case=")) history.replaceState(null, "", location.pathname);
  };

  const showWarnings = (warnings) => {
    const body = warnings.length
      ? el("div", {},
          el("p", { class: "block-note", text: "These won't stop the case running, but they're usually mistakes in the case file. Players can ignore them." }),
          el("ul", { class: "warning-list" }, warnings.map((w) => el("li", { text: w }))))
      : el("p", { text: "No problems found. 🎉" });
    SH.ui.modal("Case file check", body, "wide");
  };

  /* ---------------- Resume last case ---------------- */
  const renderResume = async () => {
    const box = $("resume-box");
    const rec = await SH.loader.recall();
    box.innerHTML = "";
    box.hidden = !rec;
    if (!rec) return;
    box.append(
      el("div", { class: "resume-text", html: `Continue <strong>${esc(rec.title || rec.name || "your last case")}</strong>` }),
      el("div", { class: "resume-actions" },
        el("button", { text: "▶ Continue", onclick: () => rec.kind === "url" ? loadURL(rec.url) : load(() => SH.loader.fromFile(rec.blob), null) }),
        el("button", { class: "subtle", text: "Forget", onclick: async () => { await SH.loader.forget(); renderResume(); } })));
  };

  /* ---------------- Author's guide ---------------- */
  const openGuide = async () => {
    show("guide-view");
    const body = $("guide-body");
    body.innerHTML = "<p>Loading the guide…</p>";
    try {
      const res = await fetch(GUIDE_URL);
      if (!res.ok) throw new Error(res.status);
      const md = await res.text();
      if (window.marked) {
        const html = marked.parse(md, { gfm: true });
        body.innerHTML = window.DOMPurify ? DOMPurify.sanitize(html) : html;
        // Build a table of contents from h2s
        const toc = $("guide-toc");
        toc.innerHTML = "";
        body.querySelectorAll("h2, h3").forEach((h, i) => {
          // GitHub-style ids so links like (#4-conditions-if) work here and on GitHub
          h.id = h.textContent.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || `g-${i}`;
          if (h.tagName === "H2") toc.appendChild(el("a", { href: `#${h.id}`, text: h.textContent }));
        });
        body.querySelectorAll("pre code").forEach((code) => {
          const btn = el("button", { class: "copy-btn", text: "Copy", onclick: () => {
            navigator.clipboard?.writeText(code.textContent).then(() => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1200); });
          } });
          code.parentElement.style.position = "relative";
          code.parentElement.appendChild(btn);
        });
      } else {
        body.innerHTML = "";
        body.appendChild(el("pre", { class: "guide-plain", text: md }));
      }
    } catch (e) {
      body.innerHTML = `<p>Couldn't load <code>${GUIDE_URL}</code>. If you opened this page straight from your computer (file://), run it through a small web server or GitHub Pages — browsers block reading local files. You can still open CASE_GUIDE.md directly in any text editor.</p>`;
    }
  };

  /* ---------------- Mobile tools menu ---------------- */
  const wireMobileNav = () => {
    const hb = $("hamburger-button"), tb = $("tool-box");
    hb.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = tb.classList.toggle("is-open");
      hb.setAttribute("aria-expanded", open);
    });
    document.addEventListener("click", (e) => {
      if (tb.classList.contains("is-open") && !tb.contains(e.target) && !hb.contains(e.target)) SH.game.closeToolbox();
    });
  };

  /* ---------------- Landing page wiring ---------------- */
  const wireLanding = () => {
    const drop = $("drop-zone"), input = $("case-file");
    drop.addEventListener("click", () => input.click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", () => { if (input.files[0]) loadFile(input.files[0]); input.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("dragging"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("dragging"); }));
    drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
    // Allow dropping anywhere on the landing page
    $("landing").addEventListener("dragover", (e) => e.preventDefault());
    $("landing").addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f) loadFile(f); });

    $("url-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const u = $("case-url").value.trim();
      if (u) loadURL(u);
    });
    $("demo-btn").addEventListener("click", () => loadURL(DEMO_URL));
    $("guide-btn").addEventListener("click", openGuide);
    $("guide-back").addEventListener("click", () => { show("landing"); renderResume(); });
  };

  const boot = () => {
    wireLanding();
    wireMobileNav();
    const params = new URLSearchParams(location.search);
    if (params.get("case")) loadURL(params.get("case"));
    else if (params.has("guide")) openGuide();
    else { show("landing"); renderResume(); }
  };

  document.addEventListener("DOMContentLoaded", boot);
  return { closeCase, showWarnings, loadURL, loadFile, openGuide };
})();
