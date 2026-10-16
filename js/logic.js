/* =========================================================================
   logic.js — addresses, game state, conditions ("if") and effects.
   ========================================================================= */
window.SH = window.SH || {};

/* ---------------- Addresses ---------------- */
SH.addr = (() => {
  const PATTERN = /^\s*(\d+)\s*([A-Za-z]{1,4})\s*$/;

  /** "17wc", "17 wc", " 17  WC " -> "17 WC". Named places are trimmed. */
  const normalize = (s) => {
    const m = String(s || "").match(PATTERN);
    return m ? `${parseInt(m[1], 10)} ${m[2].toUpperCase()}` : String(s || "").trim().replace(/\s+/g, " ");
  };

  const parts = (key) => {
    const m = String(key).match(PATTERN);
    return m ? { number: parseInt(m[1], 10), district: m[2].toUpperCase() } : null;
  };

  /** Find the case's location key for whatever the player typed. */
  const find = (input, locations) => {
    const n = normalize(input);
    if (locations[n]) return n;
    const lower = n.toLowerCase();
    for (const [key, loc] of Object.entries(locations)) {
      if (key.toLowerCase() === lower) return key;
      if (Array.isArray(loc.aliases) && loc.aliases.some((a) => normalize(a).toLowerCase() === lower)) return key;
    }
    return null;
  };

  return { normalize, parts, find };
})();

/* ---------------- State ---------------- */
SH.state = (() => {
  const fresh = () => ({
    version: 1,
    leads: 0,
    visited: {},        // { "12 EC": true }
    visitOrder: [],     // ["12 EC", "47 EC", ...]
    letters: {},        // { A: true }
    items: {},          // { watch: true }
    flags: {},          // { decodedNote: true, reedApproach: "bluff" }
    counters: {},       // { shillings: 3 }
    locked: {},         // locations that can no longer be visited
    revealed: {},       // hidden locations now listed in the dropdown
    fired: {},          // one-time blocks/actions already triggered
    puzzles: {},        // { path: { solved, attempts } }
    notes: "",          // player's notepad
    current: null,      // current location key
    view: "intro",      // intro | location | results
    solved: false,
    answers: {},
    selfMarks: {},
  });

  const key = (caseId) => `shcd-engine:save:${caseId}`;

  const save = (caseId, st) => SH.util.store.set(key(caseId), JSON.stringify(st));

  const load = (caseId) => {
    const raw = SH.util.store.get(key(caseId));
    if (!raw) return null;
    try { return Object.assign(fresh(), JSON.parse(raw)); }
    catch (e) { console.error("Corrupted save", e); return null; }
  };

  const clear = (caseId) => SH.util.store.remove(key(caseId));

  return { fresh, save, load, clear, key };
})();

/* ---------------- Conditions ---------------- */
SH.logic = (() => {
  const asList = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

  /** "letter:A", "!flag:x", "item:watch", "visited:4 SW" */
  const parseShorthand = (s) => {
    let str = String(s).trim();
    let negate = false;
    if (str.startsWith("!")) { negate = true; str = str.slice(1).trim(); }
    const i = str.indexOf(":");
    const kind = i < 0 ? "flag" : str.slice(0, i).trim();
    const val = i < 0 ? str : str.slice(i + 1).trim();
    const obj = { [kind]: val };
    return negate ? { not: obj } : obj;
  };

  const KNOWN = new Set([
    "letter", "letters", "notLetter", "flag", "equals", "notFlag", "item", "items", "notItem",
    "visited", "notVisited", "locked", "leadsAtMost", "leadsAtLeast", "counter", "atLeast",
    "atMost", "puzzleSolved", "all", "any", "none", "not", "here", "solved",
  ]);

  const test = (cond, st, ctx = {}) => {
    if (cond === undefined || cond === null || cond === true) return true;
    if (cond === false) return false;
    if (typeof cond === "string") return test(parseShorthand(cond), st, ctx);
    if (Array.isArray(cond)) return cond.every((c) => test(c, st, ctx));
    if (typeof cond !== "object") return false;

    for (const k of Object.keys(cond)) {
      if (!KNOWN.has(k)) { console.warn(`Unknown condition key "${k}"`, cond); return false; }
    }
    const has = (map, v) => asList(v).every((x) => !!map[x]);

    if ("letter" in cond && !has(st.letters, cond.letter)) return false;
    if ("letters" in cond && !has(st.letters, cond.letters)) return false;
    if ("notLetter" in cond && asList(cond.notLetter).some((x) => st.letters[x])) return false;

    if ("flag" in cond) {
      const val = st.flags[cond.flag];
      if ("equals" in cond) { if (val !== cond.equals) return false; }
      else if (!val) return false;
    }
    if ("notFlag" in cond && asList(cond.notFlag).some((x) => st.flags[x])) return false;

    if ("item" in cond && !has(st.items, cond.item)) return false;
    if ("items" in cond && !has(st.items, cond.items)) return false;
    if ("notItem" in cond && asList(cond.notItem).some((x) => st.items[x])) return false;

    const visitKey = (a) => SH.addr.normalize(a);
    if ("visited" in cond && !asList(cond.visited).every((a) => st.visited[visitKey(a)])) return false;
    if ("notVisited" in cond && asList(cond.notVisited).some((a) => st.visited[visitKey(a)])) return false;
    if ("locked" in cond && !asList(cond.locked).every((a) => st.locked[visitKey(a)])) return false;
    if ("here" in cond && visitKey(cond.here) !== st.current) return false;

    if ("leadsAtMost" in cond && !(st.leads <= cond.leadsAtMost)) return false;
    if ("leadsAtLeast" in cond && !(st.leads >= cond.leadsAtLeast)) return false;

    if ("counter" in cond) {
      const n = st.counters[cond.counter] ?? 0;
      if ("atLeast" in cond && !(n >= cond.atLeast)) return false;
      if ("atMost" in cond && !(n <= cond.atMost)) return false;
      if ("equals" in cond && !("flag" in cond) && n !== cond.equals) return false;
      if (!("atLeast" in cond) && !("atMost" in cond) && !("equals" in cond) && !(n > 0)) return false;
    }

    if ("puzzleSolved" in cond && !asList(cond.puzzleSolved).every((id) => st.flags[`puzzle:${id}`])) return false;
    if ("solved" in cond && !!st.solved !== !!cond.solved) return false;

    if ("all" in cond && !asList(cond.all).every((c) => test(c, st, ctx))) return false;
    if ("any" in cond && !asList(cond.any).some((c) => test(c, st, ctx))) return false;
    if ("none" in cond && asList(cond.none).some((c) => test(c, st, ctx))) return false;
    if ("not" in cond && test(cond.not, st, ctx)) return false;

    return true;
  };

  /* ---------------- Effects ---------------- */
  /**
   * Apply one effect or an array of effects. Returns true if anything changed.
   * Effects only notify when they actually change something, so repeating
   * them is harmless.
   */
  const apply = (effects, st, ctx = {}) => {
    const game = SH.game;
    const c = game.caseData;
    const s = c.settings;
    let changed = false;
    const say = (eff, msg, kind = "success") => { if (!eff.silent && !ctx.silent) SH.ui.notify(msg, kind); };
    const where = (a) => (a === "here" || a === true ? st.current : SH.addr.normalize(a));
    const itemName = (id) => c.items?.[id]?.name || id;

    for (const eff of asList(effects)) {
      if (!eff || typeof eff !== "object") continue;

      if ("setFlag" in eff) {
        for (const f of asList(eff.setFlag)) {
          const v = "value" in eff ? eff.value : true;
          if (st.flags[f] !== v) { st.flags[f] = v; changed = true; }
        }
      }
      if ("clearFlag" in eff) {
        for (const f of asList(eff.clearFlag)) if (f in st.flags) { delete st.flags[f]; changed = true; }
      }
      const letters = asList(eff.letter).concat(asList(eff.addLetter));
      for (const L of letters) {
        if (!st.letters[L]) {
          st.letters[L] = true; changed = true;
          say(eff, s.letterFoundText.replace("{letter}", L));
        }
      }
      for (const L of asList(eff.removeLetter)) if (st.letters[L]) { delete st.letters[L]; changed = true; }

      for (const id of asList(eff.addItem)) {
        if (!st.items[id]) {
          st.items[id] = true; changed = true;
          say(eff, `${s.itemFoundText.replace("{item}", itemName(id))}`);
        }
      }
      for (const id of asList(eff.removeItem)) {
        if (st.items[id]) { delete st.items[id]; changed = true; say(eff, `${itemName(id)} removed from your evidence.`, "info"); }
      }

      for (const a of asList(eff.lock)) {
        const k = where(a);
        if (k && !st.locked[k]) { st.locked[k] = true; changed = true; say(eff, `${k} can no longer be visited.`, "info"); }
      }
      for (const a of asList(eff.unlock)) {
        const k = where(a);
        if (k && st.locked[k]) { delete st.locked[k]; changed = true; say(eff, `${k} can be visited again.`, "info"); }
      }
      for (const a of asList(eff.reveal)) {
        const k = where(a);
        if (k && !st.revealed[k]) { st.revealed[k] = true; changed = true; say(eff, `New location: ${k}`, "info"); }
      }

      if ("counter" in eff) {
        const name = eff.counter;
        const before = st.counters[name] ?? 0;
        let after = before;
        if ("set" in eff) after = eff.set;
        if ("add" in eff) after = before + eff.add;
        if (after !== before) { st.counters[name] = after; changed = true; }
      }

      if ("addLeads" in eff && eff.addLeads) { st.leads += eff.addLeads; changed = true; }

      if ("notify" in eff) { say({ silent: false }, eff.notify, eff.kind || "info"); }
    }
    return changed;
  };

  return { test, apply, asList, parseShorthand, KNOWN };
})();
