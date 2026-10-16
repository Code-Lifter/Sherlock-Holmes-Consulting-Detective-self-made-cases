/* =========================================================================
   loader.js — getting a case into the engine.
   Accepts: a .json file, a .zip (case.json + media), or a URL to either.
   Also normalises the case and checks it for mistakes (validate).
   ========================================================================= */
window.SH = window.SH || {};

SH.loader = (() => {
  const MIME = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
    svg: "image/svg+xml", avif: "image/avif", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav",
    m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf",
    json: "application/json", txt: "text/plain", md: "text/markdown",
  };
  const ext = (name) => (String(name).split(".").pop() || "").toLowerCase();

  /* ---------- Reading sources ---------- */

  const parseJSON = (text, label) => {
    try { return JSON.parse(text.replace(/^﻿/, "")); }
    catch (e) {
      const m = String(e.message).match(/position (\d+)/);
      let where = "";
      if (m) {
        const pos = +m[1];
        const line = text.slice(0, pos).split("\n").length;
        where = ` (around line ${line})`;
      }
      throw new Error(`${label} is not valid JSON${where}: ${e.message}`);
    }
  };

  const fromZip = async (blob) => {
    if (!window.JSZip) throw new Error("Zip support didn't load (JSZip). Check your internet connection, or drop the case.json file on its own.");
    const zip = await JSZip.loadAsync(blob);
    const files = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(__MACOSX|\.DS_Store)/.test(f.name));
    const jsons = files.filter((f) => ext(f.name) === "json")
      .sort((a, b) => a.name.split("/").length - b.name.split("/").length);
    const caseFile = jsons.find((f) => /(^|\/)case\.json$/i.test(f.name)) || jsons[0];
    if (!caseFile) throw new Error("The zip has no .json case file in it. Put a case.json at the top of the zip.");

    const root = caseFile.name.includes("/") ? caseFile.name.replace(/[^/]*$/, "") : "";
    const data = parseJSON(await caseFile.async("string"), caseFile.name);

    const map = {};
    for (const f of files) {
      if (f === caseFile) continue;
      const rel = f.name.startsWith(root) ? f.name.slice(root.length) : f.name;
      const b = await f.async("blob");
      const typed = new Blob([b], { type: MIME[ext(f.name)] || "application/octet-stream" });
      map[SH.media.clean(rel)] = URL.createObjectURL(typed);
    }
    return { data, media: map };
  };

  const isZip = async (blob, name) => {
    if (/\.zip$/i.test(name || "")) return true;
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return head[0] === 0x50 && head[1] === 0x4b; // "PK"
  };

  const fromFile = async (file) => {
    if (await isZip(file, file.name)) return { ...(await fromZip(file)), name: file.name };
    return { data: parseJSON(await file.text(), file.name), media: {}, name: file.name };
  };

  const fromURL = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Couldn't download the case (${res.status} ${res.statusText}).`);
    const blob = await res.blob();
    if (await isZip(blob, url)) return { ...(await fromZip(blob)), name: url };
    return { data: parseJSON(await blob.text(), url), media: {}, base: new URL(url, location.href).href, name: url };
  };

  /* ---------- Remembering the last case (IndexedDB) ---------- */
  const DB = "shcd-engine", STORE = "lastCase";
  const db = () => new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const remember = async (record) => {
    try {
      const d = await db();
      await new Promise((res, rej) => {
        const tx = d.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(record, "last");
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    } catch (e) { console.warn("Couldn't remember case for next visit", e); }
  };
  const recall = async () => {
    try {
      const d = await db();
      return await new Promise((res) => {
        const req = d.transaction(STORE).objectStore(STORE).get("last");
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
      });
    } catch { return null; }
  };
  const forget = async () => {
    try {
      const d = await db();
      d.transaction(STORE, "readwrite").objectStore(STORE).delete("last");
    } catch {}
  };

  /* ---------- Normalising ---------- */

  const DEFAULT_SETTINGS = {
    addressEntry: "both",            // "dropdown" | "typed" | "both"
    dropdownShows: "all",            // "all" | "visited" | "none"
    districtOrder: ["WC", "SW", "NW", "N", "EC", "E", "SE", "S", "W"],
    showLocationNames: false,        // show "Somerset House" next to "17 WC"
    countUnknownAddresses: true,     // a wrong address still costs a lead
    unknownAddressText: "You find nothing of interest here.",
    lockedText: "You cannot return here.",
    lettersTitle: "Letters Found",
    letterFoundText: "Letter {letter} circled!",
    itemFoundText: "Added to evidence: {item}",
    toolsTitle: "Investigation Tools",
    leadsLabel: "Leads followed",
    confirmSolve: "Are you ready to answer the questions? Once you begin, you can't go back to investigating.",
    allowRevisit: true,
    debug: false,
  };

  const slug = (s) => String(s || "case").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "case";

  const toBlocks = (v) => {
    if (v === undefined || v === null || v === "") return [];
    if (Array.isArray(v)) return v;
    return [v];
  };

  const normalize = (raw) => {
    const c = JSON.parse(JSON.stringify(raw)); // deep copy
    c.meta = c.meta || {};
    // Friendly aliases at the top level
    if (!c.meta.title && (c.title || c["case title"])) c.meta.title = c.title || c["case title"];
    if (!c.meta.date && c.date) c.meta.date = c.date;
    c.id = slug(c.id || c.meta.title);
    c.settings = Object.assign({}, DEFAULT_SETTINGS, c.settings || {});

    c.intro = toBlocks(c.intro);
    c.credits = toBlocks(c.credits);

    // Letters: ["A","B"] or [{id:"A", label:"Alpha"}]
    c.letters = (c.letters || []).map((L) => (typeof L === "string" ? { id: L, label: L } : { label: L.id, ...L }));

    c.items = c.items || {};
    for (const [id, it] of Object.entries(c.items)) {
      c.items[id] = typeof it === "string" ? { name: it } : { name: id, ...it };
    }

    c.scenes = c.scenes || {};
    c.resources = (c.resources || []).map((r, i) => ({ id: r.id || `resource${i + 1}`, ...r }));

    // Locations: keys normalised; value may be a string, an array of blocks, or an object.
    const locs = {};
    for (const [rawKey, val] of Object.entries(c.locations || {})) {
      const key = SH.addr.normalize(rawKey);
      let loc;
      if (typeof val === "string" || Array.isArray(val)) loc = { content: toBlocks(val) };
      else loc = { ...val };
      const content = toBlocks(loc.content);
      // Legacy/simple: "text" field becomes the first block
      if (loc.text) content.unshift({ type: "text", text: loc.text });
      loc.content = content;
      loc.scenes = loc.scenes || {};
      if (locs[key]) console.warn(`Duplicate location ${key} — the later one wins.`);
      locs[key] = loc;
    }
    c.locations = locs;

    c.questions = (c.questions || []).map((q, i) => ({
      id: q.id || `q${i + 1}`,
      number: q.number ?? i + 1,
      type: q.type || (q.options ? "choice" : "open"),
      points: q.points ?? 0,
      ...q,
      text: q.text || q.question || "",
    }));

    c.scoring = c.scoring || {};
    c.scoring.rules = c.scoring.rules || [];
    c.scoring.ratings = (c.scoring.ratings || []).slice().sort((a, b) => b.min - a.min);

    c.solution = c.solution || {};
    if (!c.solution.content && c.outro) c.solution.content = c.outro;
    c.solution.content = toBlocks(c.solution.content);

    return c;
  };

  /* ---------- Validating ---------- */

  const BLOCK_TYPES = new Set([
    "text", "heading", "quote", "note", "prompt", "image", "gallery", "audio", "video", "document",
    "divider", "effects", "reveal", "link", "html", "actions", "goto", "scene", "group", "evidence", "table", "puzzle",
  ]);

  const validate = (c) => {
    const errors = [], warnings = [];
    const letterIds = new Set(c.letters.map((l) => l.id));
    const itemIds = new Set(Object.keys(c.items));
    const flagsRead = new Map(), flagsSet = new Set();

    if (!c.meta.title) warnings.push("meta.title is missing — the case has no title.");
    if (!Object.keys(c.locations).length) errors.push("The case has no locations. Add a \"locations\" object.");
    if (!c.intro.length) warnings.push("There's no intro — players will start on an empty page.");

    const sceneExists = (id, where) => !!(c.locations[where]?.scenes?.[id] || c.scenes[id]);

    const checkCond = (cond, where) => {
      if (cond === undefined || cond === null || typeof cond === "boolean") return;
      if (typeof cond === "string") return checkCond(SH.logic.parseShorthand(cond), where);
      if (Array.isArray(cond)) return cond.forEach((x) => checkCond(x, where));
      if (typeof cond !== "object") return warnings.push(`${where}: condition must be an object, got ${typeof cond}.`);
      for (const k of Object.keys(cond)) {
        if (!SH.logic.KNOWN.has(k)) warnings.push(`${where}: unknown condition "${k}" (it will always be false).`);
      }
      for (const L of SH.logic.asList(cond.letter).concat(SH.logic.asList(cond.letters), SH.logic.asList(cond.notLetter)))
        if (!letterIds.has(L)) warnings.push(`${where}: letter "${L}" isn't in the case's "letters" list.`);
      for (const i of SH.logic.asList(cond.item).concat(SH.logic.asList(cond.items), SH.logic.asList(cond.notItem)))
        if (!itemIds.has(i)) warnings.push(`${where}: item "${i}" isn't defined in "items".`);
      for (const f of SH.logic.asList(cond.flag).concat(SH.logic.asList(cond.notFlag)))
        if (!flagsRead.has(f)) flagsRead.set(f, where);
      for (const a of SH.logic.asList(cond.visited).concat(SH.logic.asList(cond.notVisited)))
        if (!c.locations[SH.addr.normalize(a)]) warnings.push(`${where}: "visited" refers to ${a}, which isn't a location.`);
      ["all", "any", "none"].forEach((k) => cond[k] && checkCond(cond[k], where));
      if (cond.not) checkCond(cond.not, where);
    };

    const checkEffects = (effs, where) => {
      for (const e of SH.logic.asList(effs)) {
        if (!e || typeof e !== "object") { warnings.push(`${where}: effects must be objects.`); continue; }
        SH.logic.asList(e.setFlag).forEach((f) => flagsSet.add(f));
        for (const L of SH.logic.asList(e.letter).concat(SH.logic.asList(e.addLetter)))
          if (!letterIds.has(L)) warnings.push(`${where}: gives letter "${L}", which isn't in "letters".`);
        for (const i of SH.logic.asList(e.addItem).concat(SH.logic.asList(e.removeItem)))
          if (!itemIds.has(i)) warnings.push(`${where}: item "${i}" isn't defined in "items".`);
        for (const a of SH.logic.asList(e.lock).concat(SH.logic.asList(e.reveal), SH.logic.asList(e.unlock)))
          if (a !== "here" && a !== true && !c.locations[SH.addr.normalize(a)])
            warnings.push(`${where}: refers to location ${a}, which doesn't exist.`);
      }
    };

    const checkBlocks = (blocks, where, locKey) => {
      SH.logic.asList(blocks).forEach((b, i) => {
        const at = `${where} › block ${i + 1}`;
        if (typeof b === "string") return;
        if (!b || typeof b !== "object") return warnings.push(`${at}: blocks must be text or objects.`);
        const type = b.type || (b.text !== undefined ? "text" : "?");
        if (!BLOCK_TYPES.has(type)) warnings.push(`${at}: unknown block type "${type}".`);
        checkCond(b.if, at);
        checkEffects(b.effects, at);
        if (b.else) checkBlocks(b.else, `${at} (else)`, locKey);
        if (b.content) checkBlocks(b.content, at, locKey);
        if (b.blocks) checkBlocks(b.blocks, at, locKey);
        if (["image", "audio", "video"].includes(type) && !b.src && !b.youtube) warnings.push(`${at}: ${type} block has no "src".`);
        if (type === "scene" && !sceneExists(b.scene, locKey)) warnings.push(`${at}: scene "${b.scene}" not found.`);
        if (type === "goto" && !c.locations[SH.addr.normalize(b.location)]) warnings.push(`${at}: goto points at ${b.location}, which doesn't exist.`);
        if (type === "puzzle") {
          if (!b.answer && !b.answers) warnings.push(`${at}: puzzle has no "answer".`);
          checkEffects(b.onSolve?.effects, `${at} (onSolve)`);
          checkBlocks(b.onSolve?.content, `${at} (onSolve)`, locKey);
          if (b.id) flagsSet.add(`puzzle:${b.id}`);
        }
        if (type === "evidence" && !itemIds.has(b.item)) warnings.push(`${at}: evidence item "${b.item}" isn't defined.`);
        if (type === "actions") {
          if (!Array.isArray(b.actions) || !b.actions.length) warnings.push(`${at}: actions block has no "actions".`);
          if (b.record) flagsSet.add(b.record);
          (b.actions || []).forEach((a, j) => {
            const aw = `${at} › action "${a.label || j + 1}"`;
            if (!a.label) warnings.push(`${aw}: action has no "label".`);
            checkCond(a.if, aw); checkCond(a.enableIf, aw); checkEffects(a.effects, aw);
            if (typeof a.then === "string" && !sceneExists(a.then, locKey)) warnings.push(`${aw}: scene "${a.then}" not found.`);
            else if (a.then) checkBlocks(a.then, aw, locKey);
            if (a.travel && !c.locations[SH.addr.normalize(a.travel)]) warnings.push(`${aw}: travel to ${a.travel}, which doesn't exist.`);
          });
        }
      });
    };

    checkBlocks(c.intro, "intro");
    for (const [key, loc] of Object.entries(c.locations)) {
      if (!SH.addr.parts(key) && !loc.group) warnings.push(`Location "${key}" isn't in "12 WC" form — it'll be listed under "Other" (add "group" to choose a heading).`);
      checkCond(loc.if, key);
      checkEffects(loc.effects, `${key} effects`);
      checkBlocks(loc.content, key, key);
      if (loc.else) checkBlocks(loc.else, `${key} (else)`, key);
      for (const [sid, sc] of Object.entries(loc.scenes || {})) checkBlocks(sc, `${key} › scene "${sid}"`, key);
    }
    for (const [sid, sc] of Object.entries(c.scenes)) checkBlocks(sc, `scene "${sid}"`);
    c.resources.forEach((r) => {
      checkCond(r.if, `resource "${r.label || r.id}"`);
      if (r.type === "page") checkBlocks(r.content, `resource "${r.label || r.id}"`);
      else if (!r.src && !r.url) warnings.push(`resource "${r.label || r.id}" has no "src".`);
    });
    c.scoring.rules.forEach((r, i) => checkCond(r.if, `scoring rule ${i + 1} (${r.label || ""})`));
    c.questions.forEach((q) => {
      if (q.type === "choice" && !(q.options || []).length) warnings.push(`Question ${q.number}: choice question has no options.`);
    });
    checkBlocks(c.solution.content, "solution");

    for (const [f, where] of flagsRead) {
      if (!flagsSet.has(f)) warnings.push(`${where}: checks flag "${f}", but nothing ever sets it (typo?).`);
    }
    return { errors, warnings: [...new Set(warnings)] };
  };

  return { fromFile, fromURL, normalize, validate, remember, recall, forget, DEFAULT_SETTINGS };
})();
