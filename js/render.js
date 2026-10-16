/* =========================================================================
   render.js — turns content blocks into page elements.
   Every piece of story content (intro, locations, scenes, resource pages,
   the solution) is an array of blocks. See CASE_GUIDE.md for the list.
   ========================================================================= */
window.SH = window.SH || {};

SH.render = (() => {
  const { el, inline, paragraphs, esc } = SH.util;
  const L = () => SH.logic;
  const G = () => SH.game;

  const asBlock = (b) => {
    if (typeof b === "string") return { type: "text", text: b };
    if (b && !b.type) {
      if (b.text !== undefined) return { ...b, type: "text" };
      if (b.blocks || b.content) return { ...b, type: "group" };
    }
    return b || { type: "text", text: "" };
  };

  const findScene = (id, locKey) => {
    const c = G().caseData;
    return c.locations[locKey]?.scenes?.[id] || c.scenes[id] || null;
  };

  /** Render an array of blocks. ctx = { path, locKey, review } */
  const blocks = (list, ctx) => {
    const frag = document.createDocumentFragment();
    L().asList(list).forEach((raw, i) => {
      const node = block(asBlock(raw), { ...ctx, path: `${ctx.path}/${i}` });
      if (node) frag.appendChild(node);
    });
    return frag;
  };

  /** Fire a block's effects once (unless repeat: true). Skipped in review mode. */
  const fire = (effects, key, ctx, repeat = false) => {
    if (!effects || ctx.review) return;
    const st = G().state;
    if (!repeat && st.fired[key]) return;
    st.fired[key] = true;
    L().apply(effects, st, ctx);
    G().changed();
  };

  const block = (b, ctx) => {
    const st = G().state;
    if (!L().test(b.if, st, ctx)) {
      return b.else ? wrap(blocks(b.else, { ...ctx, path: `${ctx.path}/else` })) : null;
    }
    const node = build(b, ctx);
    fire(b.effects, `fx:${ctx.path}`, ctx, b.repeat);
    if (node && b.class) node.classList.add(...String(b.class).split(/\s+/));
    if (node && b.align) node.classList.add(`align-${b.align}`);
    return node;
  };

  const wrap = (frag) => { const d = el("div", { class: "block-group" }); d.appendChild(frag); return d; };

  const media = (src) => SH.media.resolve(src);

  const build = (b, ctx) => {
    switch (b.type) {
      case "text":
        return el("div", { class: "block-text", html: paragraphs(b.text) });

      case "heading":
        return el(b.level === 3 ? "h4" : "h3", { class: "block-heading", html: inline(b.text) });

      case "quote":
        return el("blockquote", { class: "block-quote" },
          el("div", { html: paragraphs(b.text) }),
          b.speaker ? el("cite", { html: `— ${inline(b.speaker)}` }) : null);

      case "note":
        return el("div", { class: "block-note", html: paragraphs(b.text) });

      case "prompt":
        return el("div", { class: "block-prompt", html: paragraphs(b.text) });

      case "effects":
        return null; // invisible: exists only to fire its effects

      case "divider":
        return el("hr", { class: "block-divider" });

      case "image": {
        const fig = el("figure", { class: `block-image size-${b.size || "full"}${b.float ? ` float-${b.float}` : ""}` });
        const img = el("img", { src: media(b.src), alt: b.alt || b.caption || "", loading: "lazy" });
        if (b.zoom !== false) {
          img.classList.add("zoomable");
          img.addEventListener("click", () => SH.ui.lightbox(b.src, b.caption));
        }
        fig.appendChild(img);
        if (b.caption) fig.appendChild(el("figcaption", { html: inline(b.caption) }));
        return fig;
      }

      case "gallery": {
        const g = el("div", { class: "block-gallery" });
        (b.images || []).forEach((im) => {
          const it = typeof im === "string" ? { src: im } : im;
          const fig = el("figure", {},
            el("img", { src: media(it.src), alt: it.caption || "", loading: "lazy", class: "zoomable",
              onclick: () => SH.ui.lightbox(it.src, it.caption) }),
            it.caption ? el("figcaption", { html: inline(it.caption) }) : null);
          g.appendChild(fig);
        });
        return g;
      }

      case "audio":
        return el("div", { class: "block-audio" },
          b.label ? el("div", { class: "media-label", html: inline(b.label) }) : null,
          el("audio", { src: media(b.src), controls: true, preload: "metadata", loop: b.loop || null }));

      case "video": {
        const yt = b.youtube ? SH.media.youtubeId(b.youtube) : null;
        const player = yt
          ? el("iframe", { src: `https://www.youtube-nocookie.com/embed/${yt}`, allowfullscreen: true,
              allow: "encrypted-media; picture-in-picture", title: b.caption || "Video" })
          : el("video", { src: media(b.src), controls: true, preload: "metadata", poster: b.poster ? media(b.poster) : null });
        return el("figure", { class: `block-video${yt ? " is-embed" : ""}` },
          el("div", { class: "video-frame" }, player),
          b.caption ? el("figcaption", { html: inline(b.caption) }) : null);
      }

      case "document": {
        const d = el("div", { class: `block-document doc-${b.style || "letter"}` });
        if (b.image) d.appendChild(el("img", { class: "doc-image zoomable", src: media(b.image), alt: "",
          onclick: () => SH.ui.lightbox(b.image, b.title) }));
        if (b.masthead) d.appendChild(el("div", { class: "doc-masthead", html: inline(b.masthead) }));
        if (b.date) d.appendChild(el("div", { class: "doc-date", html: inline(b.date) }));
        if (b.title) d.appendChild(el("div", { class: "doc-title", html: inline(b.title) }));
        if (b.to) d.appendChild(el("div", { class: "doc-to", html: inline(b.to) }));
        if (b.text) d.appendChild(el("div", { class: "doc-text", html: paragraphs(b.text) }));
        if (b.content) d.appendChild(blocks(b.content, ctx));
        if (b.signature) d.appendChild(el("div", { class: "doc-signature", html: inline(b.signature) }));
        return d;
      }

      case "table": {
        const t = el("table", { class: "block-table" });
        if (b.headers) t.appendChild(el("thead", {}, el("tr", {}, b.headers.map((h) => el("th", { html: inline(h) })))));
        const tb = el("tbody");
        (b.rows || []).forEach((r) => tb.appendChild(el("tr", {}, r.map((cell) => el("td", { html: inline(cell) })))));
        t.appendChild(tb);
        return el("div", { class: "block-table-wrap" }, b.caption ? el("div", { class: "media-label", html: inline(b.caption) }) : null, t);
      }

      case "link": {
        const href = SH.media.safeURL(b.url, true) || media(b.src);
        return el("p", { class: "block-link" }, el("a", { href, target: "_blank", rel: "noopener", html: inline(b.label || b.url) }));
      }

      case "html": {
        const clean = window.DOMPurify ? DOMPurify.sanitize(b.html || "") : esc(b.html || "");
        return el("div", { class: "block-html", html: clean });
      }

      case "group":
        return wrap(blocks(b.blocks || b.content, ctx));

      case "scene": {
        const sc = findScene(b.scene, ctx.locKey);
        if (!sc) return el("div", { class: "block-prompt", text: `[Missing scene: ${b.scene}]` });
        return wrap(blocks(sc, { ...ctx, path: `scene:${b.scene}` }));
      }

      case "reveal": {
        const det = el("details", { class: "block-reveal" }, el("summary", { html: inline(b.label || "Reveal") }));
        const body = el("div", { class: "reveal-body" });
        det.appendChild(body);
        let done = false;
        const fill = () => { if (!done) { done = true; body.appendChild(blocks(b.content || b.text, ctx)); } };
        det.addEventListener("toggle", () => det.open && fill());
        if (b.open) { det.open = true; fill(); }
        return det;
      }

      case "evidence": {
        const it = G().caseData.items[b.item];
        return it ? SH.game.itemCard(b.item, it) : null;
      }

      case "goto": {
        const target = SH.addr.normalize(b.location);
        const btn = el("button", { class: "action-btn", disabled: ctx.review || null,
          html: inline(b.label || `Go to ${target}`), onclick: () => SH.game.visit(target) });
        return el("div", { class: "actions-block" }, el("div", { class: "actions-buttons" }, btn));
      }

      case "actions":
        return actions(b, ctx);

      case "puzzle":
        return puzzle(b, ctx);

      default:
        return el("div", { class: "block-prompt", text: `[Unknown block type: ${b.type}]` });
    }
  };

  /* ---------------- Actions (buttons & choices) ---------------- */
  const actions = (b, ctx) => {
    const st = G().state;
    const node = el("div", { class: `actions-block${b.pickOne ? " pick-one" : ""}` });
    if (b.prompt) node.appendChild(el("div", { class: "actions-prompt", html: paragraphs(b.prompt) }));
    const row = el("div", { class: "actions-buttons" });
    const outcome = el("div", { class: "actions-outcome" });
    node.append(row, outcome);

    const groupKey = `pick:${ctx.path}`;
    const picked = st.fired[groupKey]; // id of the chosen action, if any

    (b.actions || []).forEach((a, j) => {
      if (!L().test(a.if, st, ctx)) return;
      const aid = a.id || String(j);
      const aPath = `${ctx.path}/a:${aid}`;
      const fkey = `act:${aPath}`;
      const once = a.once !== false;
      const done = !!st.fired[fkey];
      const chosen = picked === aid;
      const enabled = !ctx.review && L().test(a.enableIf, st, ctx) && !(once && done) && !(b.pickOne && picked);

      const btn = el("button", {
        class: `action-btn${a.style ? ` style-${a.style}` : ""}${chosen ? " chosen" : ""}${done ? " done" : ""}`,
        disabled: enabled ? null : true,
        html: `${done && once ? "✓ " : ""}${inline(a.label || "Continue")}`,
      });
      btn.addEventListener("click", () => run(b, a, aid, aPath, ctx, node));
      row.appendChild(btn);

      // Re-show the outcome of anything already done here
      if (done && once && a.then && b.showOutcomes !== false) {
        outcome.appendChild(outcomeFor(a, aPath, ctx));
      }
    });
    if (!row.children.length) return outcome.children.length ? node : null;
    return node;
  };

  const outcomeFor = (a, aPath, ctx) => {
    const d = el("div", { class: "action-result" });
    if (typeof a.then === "string") {
      const sc = findScene(a.then, ctx.locKey);
      d.appendChild(sc ? blocks(sc, { ...ctx, path: `scene:${a.then}` }) : el("p", { text: `[Missing scene: ${a.then}]` }));
    } else {
      d.appendChild(blocks(a.then, { ...ctx, path: `${aPath}/then` }));
    }
    return d;
  };

  const run = (b, a, aid, aPath, ctx, node) => {
    const st = G().state;
    if (a.confirm && !window.confirm(a.confirm)) return;
    const fkey = `act:${aPath}`;
    st.fired[fkey] = true;
    if (b.pickOne) {
      st.fired[`pick:${ctx.path}`] = aid;
      if (b.record) st.flags[b.record] = a.value ?? a.id ?? a.label;
    }
    L().apply(a.effects, st, ctx);

    if (a.travel) { G().changed(); return SH.game.visit(a.travel); }

    if (a.once === false) {
      // Repeatable: show the result fresh each time, below the buttons
      const out = node.querySelector(".actions-outcome");
      out.innerHTML = "";
      if (a.then) out.appendChild(outcomeFor(a, `${aPath}/r${Date.now()}`, { ...ctx }));
      G().changed();
      return;
    }
    // Re-render this block so buttons disable and the outcome appears
    const fresh = actions(b, ctx);
    if (fresh) node.replaceWith(fresh); else node.remove();
    G().changed();
    const res = fresh?.querySelector(".action-result:last-child");
    res?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  /* ---------------- Puzzles (type an answer) ---------------- */
  const puzzle = (b, ctx) => {
    const st = G().state;
    const key = b.id ? `puzzle:${b.id}` : `puzzle:${ctx.path}`;
    const p = st.puzzles[key] || (st.puzzles[key] = { solved: false, attempts: 0, failed: false });
    const node = el("div", { class: "block-puzzle" });
    if (b.prompt) node.appendChild(el("div", { class: "puzzle-prompt", html: paragraphs(b.prompt) }));

    const answers = L().asList(b.answers || b.answer).map((a) => (b.caseSensitive ? String(a).trim() : SH.util.normAnswer(a)));
    const solvedCtx = { ...ctx, path: `${ctx.path}/solved` };

    const showSolved = () => {
      node.appendChild(el("div", { class: "puzzle-status solved", text: b.solvedText || "✓ Solved" }));
      if (b.onSolve?.content) node.appendChild(blocks(b.onSolve.content, solvedCtx));
    };
    const showFailed = () => {
      node.appendChild(el("div", { class: "puzzle-status failed", text: b.failedText || "✗ You've run out of attempts." }));
      if (b.onFail?.content) node.appendChild(blocks(b.onFail.content, { ...ctx, path: `${ctx.path}/failed` }));
    };

    if (p.solved) { showSolved(); return node; }
    if (p.failed) { showFailed(); return node; }

    const input = el("input", { type: "text", class: "puzzle-input", placeholder: b.placeholder || "Your answer…",
      autocomplete: "off", disabled: ctx.review || null, "aria-label": "Puzzle answer" });
    const msg = el("div", { class: "puzzle-msg", "aria-live": "polite" });
    const remaining = () => (b.maxAttempts ? ` (${b.maxAttempts - p.attempts} left)` : "");
    if (b.maxAttempts && p.attempts) msg.textContent = `Attempts used: ${p.attempts}${remaining()}`;

    const submit = () => {
      const raw = input.value;
      if (!raw.trim()) return;
      const guess = b.caseSensitive ? raw.trim() : SH.util.normAnswer(raw);
      if (answers.includes(guess)) {
        p.solved = true;
        st.flags[key] = true;
        L().apply(b.onSolve?.effects, st, ctx);
        SH.ui.notify(b.solvedNotify || "Solved!", "success");
        const fresh = puzzle(b, ctx);
        node.replaceWith(fresh);
        G().changed();
        return;
      }
      p.attempts += 1;
      L().apply(b.onWrong?.effects, st, ctx);
      if (b.maxAttempts && p.attempts >= b.maxAttempts) {
        p.failed = true;
        L().apply(b.onFail?.effects, st, ctx);
        node.replaceWith(puzzle(b, ctx));
      } else {
        msg.textContent = (b.wrongText || "That doesn't seem right.") + remaining();
        input.select();
      }
      G().changed();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    node.append(
      el("div", { class: "puzzle-row" }, input,
        el("button", { class: "puzzle-submit", disabled: ctx.review || null, text: b.buttonText || "Try", onclick: submit })),
      msg);
    if (b.hint) {
      const hint = el("details", { class: "block-reveal puzzle-hint" }, el("summary", { text: b.hintLabel || "Need a hint?" }),
        el("div", { class: "reveal-body", html: paragraphs(b.hint) }));
      node.appendChild(hint);
    }
    return node;
  };

  return { blocks, block, asBlock, findScene };
})();
