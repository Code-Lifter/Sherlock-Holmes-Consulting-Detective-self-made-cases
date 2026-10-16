# Consulting Detective — Case Player

A blank-slate web player for *Sherlock Holmes Consulting Detective*-style cases. Drop in a case file and play — the site has no case of its own built in.

- **Players:** open the site, drop a `.json` or `.zip` case, investigate.
- **Authors:** read **[CASE_GUIDE.md](CASE_GUIDE.md)** (also on the home page as *Case Author's Guide*), start from `cases/template.json`, and look at `cases/demo/case.json` for a full working example.

## Files

```
index.html            the page
styles.css            all styling (cases can re-theme it)
CASE_GUIDE.md         the author's reference, shown on the site
js/util.js            text formatting, media paths, pop-ups
js/logic.js           addresses, save state, conditions & effects
js/loader.js          loading .json / .zip / URL, case checker
js/render.js          content blocks → page
js/game.js            visiting, toolbox, evidence, casebook
js/solve.js           questions, scoring, results
js/main.js            home page, guide viewer, start-up
cases/template.json   blank case to copy
cases/demo/           demo case + its media
```

## Running it

It's plain HTML/CSS/JS — no build step.

- **GitHub Pages:** push the folder to a repo and enable Pages. Done.
- **Locally:** run a tiny server in the folder, e.g. `python -m http.server`, then open `http://localhost:8000`.
  (Opening `index.html` by double-clicking works for dropping cases in, but the guide and demo need a server because browsers block reading local files.)

## Linking straight to a case

`index.html?case=cases/demo/case.json` opens a case immediately. Works with any URL the browser can fetch (same site, or a server that allows cross-origin requests). Add `&debug` for author tools.

## Libraries

Loaded from cdnjs, all optional: **JSZip** (zip cases), **DOMPurify** (cleans `html` blocks and the guide), **marked** (renders the guide). Without them the site still plays `.json` cases.

## Analytics

The old site's Clarity / Google tag snippets aren't included. Paste them into `<head>` in `index.html` where the comment says.
