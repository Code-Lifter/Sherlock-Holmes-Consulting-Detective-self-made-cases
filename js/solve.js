/* =========================================================================
   solve.js — questions, answering, scoring and the results page.
   ========================================================================= */
window.SH = window.SH || {};

SH.solve = (() => {
  const { el, inline, paragraphs, esc, normAnswer } = SH.util;
  const G = () => SH.game;
  const setStory = (frag, view) => {
    const s = document.getElementById("current-text");
    s.innerHTML = "";
    s.className = `current-text view-${view}`;
    s.appendChild(frag);
    window.scrollTo({ top: 0, behavior: "smooth" });
    G().closeToolbox();
  };

  const qHeader = (q) => el("div", { class: "question-text" },
    el("strong", { text: `Question ${q.number}${q.points ? ` (${q.points} pts)` : ""}: ` }),
    el("span", { html: inline(q.text) }));

  /** Read-only list of the questions, so players know what to look for. */
  const preview = () => {
    const c = G().caseData;
    const frag = document.createDocumentFragment();
    frag.appendChild(el("h1", { class: "location-title", text: "Case Questions" }));
    if (c.settings.questionsIntro) frag.appendChild(el("div", { class: "block-note", html: paragraphs(c.settings.questionsIntro) }));
    c.questions.forEach((q) => {
      const d = el("div", { class: "question" }, qHeader(q));
      if (q.image) d.appendChild(SH.render.block({ type: "image", src: q.image, size: "medium" }, { path: `q:${q.id}`, review: true }));
      frag.appendChild(d);
    });
    if (!c.questions.length) frag.appendChild(el("p", { class: "block-prompt", text: "This case has no questions." }));
    setStory(frag, "questions");
  };

  /** Start solving: confirm, then show the answer form. */
  const begin = () => {
    const c = G().caseData, st = G().state;
    if (st.solved) return results();
    if (c.settings.confirmSolve && !confirm(c.settings.confirmSolve)) return;
    if (!c.questions.length) return finish({});

    const form = el("form", { class: "answer-form" });
    form.appendChild(el("h1", { class: "location-title", text: "Answer the Questions" }));
    c.questions.forEach((q) => {
      const box = el("fieldset", { class: "question" }, el("legend", {}, qHeader(q)));
      if (q.image) box.appendChild(SH.render.block({ type: "image", src: q.image, size: "medium" }, { path: `q:${q.id}`, review: true }));
      if (q.type === "choice") {
        (q.options || []).forEach((o, i) => {
          const opt = typeof o === "string" ? { id: String(i), text: o } : { id: o.id ?? String(i), ...o };
          box.appendChild(el("label", { class: "choice" },
            el("input", { type: "radio", name: q.id, value: opt.id }), " ", el("span", { html: inline(opt.text) })));
        });
      } else {
        box.appendChild(el("textarea", { name: q.id, rows: 3, class: "answer-text", placeholder: "Your answer…" }));
      }
      form.appendChild(box);
    });
    form.appendChild(el("button", { type: "submit", class: "action-btn", text: "Submit answers & see the solution" }));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const answers = {};
      c.questions.forEach((q) => { answers[q.id] = fd.get(q.id) ?? ""; });
      const unanswered = c.questions.filter((q) => !String(answers[q.id]).trim()).length;
      if (unanswered && !confirm(`${unanswered} question${unanswered > 1 ? "s are" : " is"} unanswered. Submit anyway?`)) return;
      finish(answers);
    });
    setStory(form, "answer");
  };

  const finish = (answers) => {
    const st = G().state;
    st.answers = answers;
    st.solved = true;
    st.view = "results";
    // Auto-mark open questions whose text matches an accepted answer
    G().caseData.questions.forEach((q) => {
      if (q.type !== "choice" && q.accept) {
        const given = normAnswer(answers[q.id]);
        if (given && SH.logic.asList(q.accept).some((a) => given.includes(normAnswer(a)))) st.selfMarks[q.id] = true;
      }
    });
    G().save();
    results();
  };

  /* ---------------- Scoring ---------------- */
  const optionsOf = (q) => (q.options || []).map((o, i) => (typeof o === "string" ? { id: String(i), text: o } : { id: o.id ?? String(i), ...o }));

  const score = () => {
    const c = G().caseData, st = G().state, sc = c.scoring;
    const lines = [];
    let total = 0;

    c.questions.forEach((q) => {
      let earned = 0, ok = false;
      if (q.type === "choice") {
        const opt = optionsOf(q).find((o) => o.id === st.answers[q.id]);
        if (opt) {
          if (typeof opt.points === "number") earned = opt.points;
          else if (opt.correct || (q.answer !== undefined && String(q.answer) === opt.id)) earned = q.points;
          ok = earned > 0;
        }
      } else if (st.selfMarks[q.id]) { earned = q.points; ok = true; }
      total += earned;
      lines.push({ section: "Questions", label: `Question ${q.number}`, earned, possible: q.points, ok });
    });

    sc.rules.forEach((r) => {
      const hit = SH.logic.test(r.if, st);
      if (!hit && (r.points || 0) < 0 && !r.missedLabel) return; // avoided penalty: nothing to show
      const earned = hit ? r.points || 0 : 0;
      total += earned;
      lines.push({ section: "Investigation", label: hit ? r.label : r.missedLabel || r.label, earned, possible: r.points || 0, ok: hit, penalty: (r.points || 0) < 0 });
    });

    const leads = sc.leads || (sc.par !== undefined ? { par: sc.par, penaltyPerLead: sc.leadPenalty ?? 5 } : null);
    if (leads && leads.par !== undefined) {
      const diff = st.leads - leads.par;
      let earned = 0, label;
      if (diff > 0) {
        earned = -diff * (leads.penaltyPerLead ?? 5);
        if (leads.maxPenalty !== undefined) earned = Math.max(earned, -Math.abs(leads.maxPenalty));
        label = `${st.leads} leads — ${diff} more than ${c.solution.holmesName || "Holmes"}'s ${leads.par}`;
      } else if (diff < 0 && leads.bonusPerLead) {
        earned = -diff * leads.bonusPerLead;
        label = `${st.leads} leads — ${-diff} fewer than ${c.solution.holmesName || "Holmes"}'s ${leads.par}!`;
      } else {
        label = `${st.leads} leads (par ${leads.par}) — no penalty`;
      }
      total += earned;
      lines.push({ section: "Leads", label, earned, ok: earned >= 0, leads: true });
    }

    const rating = sc.ratings.find((r) => total >= r.min);
    return { total, lines, rating: rating?.label || "" };
  };

  /* ---------------- Results page ---------------- */
  const results = () => {
    const c = G().caseData, st = G().state;
    if (!st.solved) return begin();
    st.view = "results";
    const frag = document.createDocumentFragment();
    const wrap = el("div", { class: "results" });
    frag.appendChild(wrap);

    wrap.appendChild(el("h3", { text: c.solution.title || "The Solution" }));
    wrap.appendChild(el("div", { class: "outro-text" }, SH.render.blocks(c.solution.content, { path: "solution" })));

    const h = c.solution.holmes;
    if (h) {
      wrap.appendChild(el("h3", { text: `${c.solution.holmesName || "Holmes"}'s Solution` }));
      if (h.text) wrap.appendChild(el("div", { html: paragraphs(h.text) }));
      if (h.leads?.length) wrap.appendChild(el("ol", { class: "holmes-leads" }, h.leads.map((l) => el("li", { html: inline(typeof l === "string" ? l : l.name) }))));
      if (h.score !== undefined) wrap.appendChild(el("p", { html: `${esc(c.solution.holmesName || "Holmes")} scored <strong>${esc(h.score)}</strong> points.` }));
    }

    if (c.questions.length) {
      wrap.appendChild(el("h3", { text: "Your Answers" }));
      c.questions.forEach((q) => {
        const box = el("div", { class: "question answered" }, qHeader(q));
        const given = st.answers[q.id];
        if (q.type === "choice") {
          const opts = optionsOf(q);
          const mine = opts.find((o) => o.id === given);
          const best = opts.filter((o) => o.correct || String(q.answer) === o.id || (typeof o.points === "number" && o.points > 0));
          box.appendChild(el("p", { html: `<em>You answered:</em> ${mine ? inline(mine.text) : "—"}` }));
          if (best.length) box.appendChild(el("p", { html: `<em>Answer:</em> ${best.map((o) => inline(o.text)).join(" / ")}` }));
        } else {
          box.appendChild(el("p", { html: `<em>You answered:</em> ${given ? esc(given).replace(/\n/g, "<br>") : "—"}` }));
          if (q.answerText || q.answer) box.appendChild(el("p", { html: `<em>Answer:</em> ${inline(q.answerText || q.answer)}` }));
          if (q.points) {
            const cb = el("input", { type: "checkbox" });
            cb.checked = !!st.selfMarks[q.id];
            cb.addEventListener("change", () => { st.selfMarks[q.id] = cb.checked; G().save(); drawScore(); });
            box.appendChild(el("label", { class: "self-mark" }, cb, ` I got this right (+${q.points})`));
          }
        }
        if (q.explanation) box.appendChild(el("div", { class: "block-note", html: paragraphs(q.explanation) }));
        wrap.appendChild(box);
      });
    }

    wrap.appendChild(el("h3", { text: "Your Score" }));
    const scoreBox = el("div", { class: "score-breakdown", id: "score-breakdown" });
    wrap.appendChild(scoreBox);

    const drawScore = () => {
      const r = score();
      scoreBox.innerHTML = "";
      let section = null, ul;
      r.lines.forEach((line) => {
        if (line.section !== section) {
          section = line.section;
          scoreBox.appendChild(el("h4", { text: section }));
          ul = el("ul");
          scoreBox.appendChild(ul);
        }
        const icon = line.leads ? (line.earned < 0 ? "➖" : "✅") : line.penalty ? (line.ok ? "⚠️" : "✅") : line.ok ? "✅" : "❌";
        const pts = line.earned ? `${line.earned > 0 ? "+" : ""}${line.earned}` : line.possible && !line.ok && !line.penalty ? `0 / ${line.possible}` : "0";
        ul.appendChild(el("li", { html: `${icon} ${inline(line.label || "")} <span class="pts">${pts}</span>` }));
      });
      scoreBox.appendChild(el("div", { class: "final-score" },
        el("p", { html: `<strong>Total score: ${r.total} points</strong>` }),
        r.rating ? el("p", { html: `<strong>Rating:</strong> ${inline(r.rating)}` }) : null));
    };
    drawScore();

    wrap.appendChild(el("div", { class: "tool-grid results-actions" },
      el("button", { text: "📖 Casebook", onclick: () => G().showCasebook() }),
      el("button", { text: "↺ Play again", onclick: () => G().reset() })));

    setStory(frag, "results");
    G().changed();
  };

  return { preview, begin, results, score };
})();
