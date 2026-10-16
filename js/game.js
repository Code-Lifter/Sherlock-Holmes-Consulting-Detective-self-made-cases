/* =========================================================================
   game.js — running a loaded case: visiting locations, the toolbox,
   evidence, casebook, resources, saving.
   ========================================================================= */
window.SH = window.SH || {};

SH.game = (() => {
  const { el, inline, paragraphs } = SH.util;
  const self = {
    caseData: null,
    state: null,
    warnings: [],
    debug: false,
  };

  const $ = (id) => document.getElementById(id);
  const story = () => $("current-text");

  /* ---------------- Lifecycle ---------------- */

  self.start = (caseData, warnings = []) => {
    self.caseData = caseData;
    self.warnings = warnings;
    self.debug = !!caseData.settings.debug || /[?&]debug\b/.test(location.search);
    self.state = SH.state.load(caseData.id) || SH.state.fresh();
    applyTheme(caseData.theme || {});
    document.title = caseData.meta.title ? `${caseData.meta.title} — Consulting Detective` : "Consulting Detective";
    $("case-title").textContent = caseData.meta.title || "Untitled Case";
    const sub = [caseData.meta.subtitle, caseData.meta.author ? `by ${caseData.meta.author}` : ""].filter(Boolean).join(" · ");
    $("case-subtitle").innerHTML = sub ? inline(sub) : "";
    buildToolbox();
    self.refresh();

    const st = self.state;
    if (st.view === "results" && st.solved) SH.solve.results();
    else if (st.view === "location" && st.current && self.caseData.locations[st.current]) self.visit(st.current, { resume: true, review: !!st.locked[st.current] });
    else self.showIntro();
  };

  let pending = false;
  /** Called after anything changes state: refresh toolbox + autosave (batched). */
  self.changed = () => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      self.refresh();
      self.save();
    });
  };

  self.save = () => SH.state.save(self.caseData.id, self.state);

  self.reset = (ask = true) => {
    if (ask && !confirm("Reset all progress for this case? This cannot be undone.")) return;
    SH.state.clear(self.caseData.id);
    self.state = SH.state.fresh();
    self.refresh();
    self.showIntro();
    SH.ui.notify("Case progress wiped clean.", "success");
  };

  /* ---------------- Theme ---------------- */
  const THEME_VARS = {
    primary: "--primary", secondary: "--secondary", accent: "--accent", accentHover: "--accent-hover",
    paper: "--paper", paperDark: "--paper-dark", visited: "--visited", background: "--background",
    titleFont: "--font-title", bodyFont: "--font-body", handFont: "--font-hand",
  };
  const applyTheme = (t) => {
    const root = document.documentElement;
    Object.values(THEME_VARS).forEach((v) => root.style.removeProperty(v));
    root.style.removeProperty("--background-image");
    for (const [k, v] of Object.entries(THEME_VARS)) if (t[k]) root.style.setProperty(v, t[k]);
    if (t.backgroundImage) root.style.setProperty("--background-image", `url("${SH.media.resolve(t.backgroundImage)}")`);
    document.querySelectorAll("link[data-case-font]").forEach((n) => n.remove());
    (t.googleFonts || []).forEach((f) => {
      const link = el("link", { rel: "stylesheet", "data-case-font": "1",
        href: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}&display=swap` });
      document.head.appendChild(link);
    });
  };

  /* ---------------- Views ---------------- */

  const setView = (view, html) => {
    const s = story();
    s.innerHTML = "";
    s.className = `current-text view-${view}`;
    if (html) s.appendChild(html);
    window.scrollTo({ top: 0, behavior: "smooth" });
    closeToolbox();
  };

  self.showIntro = () => {
    const c = self.caseData;
    self.state.view = "intro";
    self.state.current = null;
    const frag = document.createDocumentFragment();
    if (c.meta.cover) frag.appendChild(SH.render.block({ type: "image", src: c.meta.cover, size: "full" }, { path: "cover" }));
    if (c.meta.date) frag.appendChild(el("div", { class: "date", html: inline(c.meta.date) }));
    frag.appendChild(SH.render.blocks(c.intro, { path: "intro" }));
    if (!self.state.leads) frag.appendChild(el("div", { class: "block-prompt start-hint",
      html: paragraphs(c.settings.startHint || "When you're ready, choose a location from the **Investigation Tools** to begin.") }));
    setView("intro", frag);
    self.changed();
  };

  self.showCredits = () => {
    const c = self.caseData;
    const frag = document.createDocumentFragment();
    frag.appendChild(el("h1", { class: "location-title", text: "Credits" }));
    if (c.credits.length) frag.appendChild(SH.render.blocks(c.credits, { path: "credits", review: true }));
    else if (c.meta.author) frag.appendChild(el("p", { html: `Case written by <strong>${SH.util.esc(c.meta.author)}</strong>` }));
    frag.appendChild(el("hr"));
    frag.appendChild(el("div", { class: "block-note", html: paragraphs(
      "Case engine for *Sherlock Holmes Consulting Detective*-style play, created by **Edward Pritchard** (Discord: CodeLifter). " +
      "*Sherlock Holmes Consulting Detective* is © SPACE Cowboys; this is an unofficial fan tool.") }));
    setView("credits", frag);
  };

  /* ---------------- Visiting ---------------- */

  self.visit = (input, opts = {}) => {
    const c = self.caseData, st = self.state, s = c.settings;
    if (!input || !String(input).trim()) return;
    const key = SH.addr.find(input, c.locations);
    const shown = key || SH.addr.normalize(input);

    if (st.solved && !opts.review) {
      SH.ui.notify("The case is solved — you can review your casebook, or reset to play again.", "info");
      return;
    }

    // Unknown address
    if (!key) {
      const firstTime = !st.visited[shown];
      if (firstTime && s.countUnknownAddresses && !self.debugFree()) st.leads += 1;
      if (firstTime) { st.visited[shown] = true; st.visitOrder.push(shown); }
      st.current = null;
      st.view = "intro";
      setView("location", el("div", {},
        el("h1", { class: "location-title", text: shown }),
        el("div", { class: "block-prompt", html: paragraphs(s.unknownAddressText) })));
      self.changed();
      return;
    }

    const loc = c.locations[key];
    const review = !!opts.review;

    if (st.locked[key] && !review) {
      setView("location", el("div", {},
        el("h1", { class: "location-title", text: key }),
        el("div", { class: "block-prompt", html: paragraphs(loc.lockedText || s.lockedText) }),
        st.visited[key] ? el("button", { class: "action-btn", text: "📖 Re-read your notes from here",
          onclick: () => self.visit(key, { review: true }) }) : null));
      return;
    }
    if (!review && st.visited[key] && s.allowRevisit === false && !opts.resume) {
      SH.ui.notify(`You've already been to ${key}. Opening your notes instead.`, "info");
      return self.visit(key, { review: true });
    }

    // Count the lead
    if (!review && !st.visited[key]) {
      if (loc.countsAsLead !== false && !self.debugFree()) st.leads += 1;
      st.visited[key] = true;
      st.visitOrder.push(key);
    }
    if (!review) { st.current = key; st.view = "location"; }

    const ctx = { path: `loc:${key}`, locKey: key, review };
    const frag = document.createDocumentFragment();
    const title = el("h1", { class: "location-title" }, key);
    if (loc.name && (c.settings.showLocationNames || st.visited[key])) title.appendChild(el("span", { class: "location-name", html: inline(loc.name) }));
    frag.appendChild(title);
    if (review) frag.appendChild(el("div", { class: "review-banner", text: "📖 Reviewing your notes — nothing here costs a lead or changes the case." }));

    if (!review && loc.effects && !st.fired[`fx:${ctx.path}`]) {
      st.fired[`fx:${ctx.path}`] = true;
      SH.logic.apply(loc.effects, st, ctx);
    }
    if (SH.logic.test(loc.if, st, ctx)) frag.appendChild(SH.render.blocks(loc.content, ctx));
    else frag.appendChild(SH.render.blocks(loc.else || [{ type: "prompt", text: "There's nothing more to learn here yet." }], { ...ctx, path: `${ctx.path}/else` }));

    setView("location", frag);
    self.changed();
  };

  self.debugFree = () => self.debug && $("debug-free")?.checked;

  /* ---------------- Toolbox ---------------- */

  const closeToolbox = () => {
    const tb = $("tool-box"), hb = $("hamburger-button");
    if (tb && tb.classList.contains("is-open")) { tb.classList.remove("is-open"); hb?.setAttribute("aria-expanded", "false"); }
  };
  self.closeToolbox = closeToolbox;

  const buildToolbox = () => {
    const c = self.caseData, s = c.settings;
    const tb = $("tool-box");
    tb.innerHTML = "";
    const btn = (label, onclick, attrs = {}) => el("button", { onclick, html: label, ...attrs });

    tb.append(
      el("h3", { class: "tool-title", text: s.toolsTitle }),
      btn("Introduction", () => self.showIntro()),
      el("div", { class: "tool-grid", id: "tb-resources" }),
    );

    // Address entry
    if (s.addressEntry !== "dropdown") {
      const input = el("input", { id: "address-input", type: "text", placeholder: "e.g. 12 EC", autocomplete: "off",
        "aria-label": "Type an address", enterkeyhint: "go" });
      const go = () => { const v = input.value; input.value = ""; self.visit(v); };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      tb.appendChild(el("div", { class: "address-entry" }, input, el("button", { class: "go-btn", text: "Go", onclick: go })));
    }
    if (s.addressEntry !== "typed" && s.dropdownShows !== "none") {
      const sel = el("select", { id: "locations-dropdown", "aria-label": "Choose a location" });
      sel.addEventListener("change", () => { const v = sel.value; sel.value = ""; if (v) self.visit(v); });
      tb.appendChild(el("div", { class: "dropdown" }, sel));
    }

    if (c.letters.length) {
      tb.appendChild(el("div", { class: "letters-box" },
        el("h4", { text: s.lettersTitle }),
        el("div", { class: "letters-area", id: "tb-letters" })));
    }

    tb.appendChild(el("div", { class: "progress-box" },
      el("p", {}, `${s.leadsLabel}: `, el("span", { id: "leads-count", text: "0" })),
      el("div", { class: "tool-grid" },
        btn("📖 Casebook", () => self.showCasebook()),
        Object.keys(c.items).length ? btn('🔍 Evidence <span id="evidence-count" class="badge"></span>', () => self.showEvidence()) : null),
      c.questions.length ? btn("Questions", () => SH.solve.preview()) : null,
      el("button", { id: "solve-btn", onclick: () => SH.solve.begin(), text: "Solve the Case" }),
      btn("Credits", () => self.showCredits())));

    const fileInput = el("input", { type: "file", accept: ".json", hidden: true, onchange: (e) => importSave(e) });
    tb.appendChild(el("div", { class: "system-box" },
      btn("⚠️ Reset Case", () => self.reset(), { class: "danger" }),
      el("div", { class: "tool-grid" },
        btn("💾 Save", () => exportSave()),
        btn("📂 Load", () => fileInput.click())),
      fileInput,
      btn("⏏ Close case", () => SH.main.closeCase(), { class: "subtle" }),
      self.warnings.length ? btn(`⚠ ${self.warnings.length} case-file warning${self.warnings.length > 1 ? "s" : ""}`, () => SH.main.showWarnings(self.warnings), { class: "subtle" }) : null,
    ));

    if (self.debug) {
      tb.appendChild(el("div", { class: "debug-box" },
        el("h4", { text: "🔧 Author tools" }),
        el("label", {}, el("input", { type: "checkbox", id: "debug-free" }), " Free travel (don't count leads)"),
        btn("Show state", () => SH.ui.modal("Current state", el("pre", { class: "debug-pre", text: JSON.stringify(self.state, null, 2) }))),
        btn("Re-check case file", () => SH.main.showWarnings(SH.loader.validate(self.caseData).warnings)),
      ));
    }
  };

  self.refresh = () => {
    if (!self.caseData) return;
    const c = self.caseData, st = self.state, s = c.settings;

    const lc = $("leads-count");
    if (lc) lc.textContent = st.leads;

    const la = $("tb-letters");
    if (la) {
      la.innerHTML = "";
      c.letters.forEach((L) => la.appendChild(el("div", {
        class: `letter${st.letters[L.id] ? " found" : ""}`, title: L.label !== L.id ? L.label : null, text: L.id })));
    }

    const ec = $("evidence-count");
    if (ec) { const n = Object.keys(st.items).length; ec.textContent = n ? n : ""; }

    const sb = $("solve-btn");
    if (sb) {
      sb.textContent = st.solved ? "View Results" : "Solve the Case";
      sb.onclick = st.solved ? () => SH.solve.results() : () => SH.solve.begin();
    }

    const res = $("tb-resources");
    if (res) {
      res.innerHTML = "";
      c.resources.filter((r) => SH.logic.test(r.if, st)).forEach((r) =>
        res.appendChild(el("button", { onclick: () => openResource(r),
          html: `${r.icon ? `${SH.util.esc(r.icon)} ` : ""}${inline(r.label || r.id)}` })));
      res.hidden = !res.children.length;
    }

    const sel = $("locations-dropdown");
    if (sel) fillDropdown(sel);
  };

  const fillDropdown = (sel) => {
    const c = self.caseData, st = self.state, s = c.settings;
    const debugAll = self.debug;
    sel.innerHTML = "";
    sel.appendChild(el("option", { value: "", text: "Select a location to visit…" }));
    const groups = {};
    for (const [key, loc] of Object.entries(c.locations)) {
      const listed = debugAll || ((!loc.hidden || st.revealed[key] || st.visited[key]) &&
        (s.dropdownShows !== "visited" || st.visited[key]));
      if (!listed) continue;
      const p = SH.addr.parts(key);
      const g = loc.group || p?.district || "Other";
      (groups[g] = groups[g] || []).push({ key, loc, n: p?.number ?? 0 });
    }
    const order = [...s.districtOrder, ...Object.keys(groups).filter((g) => !s.districtOrder.includes(g)).sort()];
    for (const g of order) {
      if (!groups[g]) continue;
      const og = el("optgroup", { label: g });
      groups[g].sort((a, b) => a.n - b.n || a.key.localeCompare(b.key)).forEach(({ key, loc }) => {
        const label = (s.showLocationNames || st.visited[key]) && loc.name ? `${key} — ${loc.name}` : key;
        const o = el("option", { value: key, text: `${st.visited[key] ? "✓ " : ""}${label}${loc.hidden && debugAll ? " (hidden)" : ""}` });
        if (st.visited[key]) o.className = "visited-location";
        if (st.locked[key]) { o.className = "locked-location"; o.text = `🔒 ${label}`; }
        og.appendChild(o);
      });
      sel.appendChild(og);
    }
  };

  /* ---------------- Resources (map, newspaper, directory…) ---------------- */
  const openResource = (r) => {
    closeToolbox();
    const type = r.type || (r.content ? "page" : /\.pdf($|\?)/i.test(r.src || "") ? "pdf" : "image");
    if (type === "image") return SH.ui.lightbox(r.src, r.caption || r.label);
    if (type === "page") return SH.ui.modal(r.title || r.label, SH.render.blocks(r.content, { path: `res:${r.id}` }), r.wide ? "wide" : "");
    if (type === "audio") return SH.ui.modal(r.label, SH.render.block({ type: "audio", src: r.src, label: r.caption }, { path: `res:${r.id}` }));
    const url = r.url ? SH.media.safeURL(r.url) : SH.media.resolve(r.src);
    if (url) window.open(url, "_blank", "noopener");
  };

  /* ---------------- Evidence ---------------- */
  self.itemCard = (id, it) => el("div", { class: "evidence-card" },
    it.image ? el("img", { src: SH.media.resolve(it.image), alt: it.name, class: "zoomable",
      onclick: () => SH.ui.lightbox(it.image, it.name) }) : el("div", { class: "evidence-icon", text: it.icon || "🔍" }),
    el("div", { class: "evidence-body" },
      el("div", { class: "evidence-name", html: inline(it.name) }),
      it.description ? el("div", { class: "evidence-desc", html: paragraphs(it.description) }) : null));

  self.showEvidence = () => {
    closeToolbox();
    const c = self.caseData, st = self.state;
    const owned = Object.keys(c.items).filter((id) => st.items[id]);
    const body = el("div", { class: "evidence-list" });
    if (!owned.length) body.appendChild(el("p", { class: "block-prompt", text: "You haven't collected any evidence yet." }));
    owned.forEach((id) => {
      const it = c.items[id];
      const card = self.itemCard(id, it);
      if (it.content) {
        card.appendChild(el("button", { class: "action-btn small", text: it.examineLabel || "Examine",
          onclick: () => SH.ui.modal(it.name, SH.render.blocks(it.content, { path: `item:${id}` })) }));
      }
      body.appendChild(card);
    });
    SH.ui.modal(c.settings.evidenceTitle || "Evidence", body);
  };

  /* ---------------- Casebook ---------------- */
  self.showCasebook = () => {
    const c = self.caseData, st = self.state;
    const frag = document.createDocumentFragment();
    frag.appendChild(el("h1", { class: "location-title", text: "Casebook" }));
    frag.appendChild(el("p", { class: "block-note", text: "Every lead you've followed, in order. Re-reading a lead is free." }));
    const list = el("ol", { class: "casebook-list" });
    st.visitOrder.forEach((key) => {
      const loc = c.locations[key];
      list.appendChild(el("li", {},
        loc ? el("button", { class: "link-btn", onclick: () => self.visit(key, { review: true }),
          html: `<strong>${SH.util.esc(key)}</strong>${loc.name ? ` — ${inline(loc.name)}` : ""}${st.locked[key] ? " 🔒" : ""}` })
            : el("span", { class: "muted", html: `<strong>${SH.util.esc(key)}</strong> — nothing of interest` })));
    });
    if (!st.visitOrder.length) list.appendChild(el("li", { class: "muted", text: "No leads followed yet." }));
    frag.appendChild(list);

    frag.appendChild(el("h3", { class: "block-heading", text: "Your notes" }));
    const ta = el("textarea", { class: "notepad", rows: 10, placeholder: "Jot down names, addresses, theories…" });
    ta.value = st.notes || "";
    ta.addEventListener("input", () => { st.notes = ta.value; self.save(); });
    frag.appendChild(ta);
    setView("casebook", frag);
  };

  /* ---------------- Save files ---------------- */
  const exportSave = () => {
    self.save();
    const payload = { engine: "shcd-engine", caseId: self.caseData.id, caseTitle: self.caseData.meta.title, savedAt: new Date().toISOString(), state: self.state };
    SH.util.download(`${self.caseData.id}_save_${new Date().toISOString().split("T")[0]}.json`, JSON.stringify(payload, null, 2));
    SH.ui.notify("Save file downloaded.", "info");
  };

  const importSave = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.engine !== "shcd-engine" || !data.state) throw new Error("That isn't a save file from this site. (Looking to load a case? Use ⏏ Close case.)");
      if (data.caseId !== self.caseData.id && !confirm(`This save is for "${data.caseTitle || data.caseId}", not this case. Load it anyway?`)) return;
      self.state = Object.assign(SH.state.fresh(), data.state);
      self.save();
      self.start(self.caseData, self.warnings);
      SH.ui.notify("Save loaded.", "success");
    } catch (err) {
      SH.ui.notify(err.message || "Couldn't read that save file.", "error");
    }
  };

  return self;
})();
