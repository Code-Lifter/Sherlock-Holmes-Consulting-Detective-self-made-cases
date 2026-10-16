# Case Author's Guide

Everything you need to write your own *Consulting Detective* case for this site. A case is a single **JSON file**. Drop it on the home page and it plays — no coding needed.

> **Quickest start:** download the **Blank case template** from the home page, change the text, and drop it back on the page. Then open the **Demo case file** to see every feature used in a real case.

---

## 1. How a case file is shaped

```json
{
  "id": "vance-matter",
  "meta":      { "title": "The Vance Matter", "author": "Your Name", "date": "London, 3rd May 1891" },
  "settings":  { },
  "theme":     { },
  "letters":   ["A", "B", "C", "D"],
  "items":     { },
  "resources": [ ],
  "intro":     [ ],
  "locations": { },
  "scenes":    { },
  "questions": [ ],
  "scoring":   { },
  "solution":  { },
  "credits":   [ ]
}
```

Only `meta.title`, `intro` and `locations` are really needed. Everything else is optional.

| Section | What it's for |
|---|---|
| `id` | A short name for the case (used for save games). Change it and old saves won't load. |
| `meta` | Title, subtitle, author, date line and an optional `cover` picture. |
| `settings` | How the site behaves — address entry, wording, rules. [§10](#10-settings) |
| `theme` | Colours, fonts and background. [§11](#11-theme) |
| `letters` | The circled letters players unlock (any number, any names). |
| `items` | Evidence players can collect and examine. |
| `resources` | Buttons in the toolbox: map, newspaper, directory, informants… |
| `intro` | The opening story. |
| `locations` | Every address the players can visit. |
| `scenes` | Reusable chunks of story you can show from anywhere. |
| `questions` | What players must answer at the end. |
| `scoring` | Points for actions, lead penalties, ratings. |
| `solution` | What really happened, and Holmes's route. |
| `credits` | Your credits page. |

### JSON in 30 seconds

- Text goes in **double quotes**: `"like this"`.
- Lists use square brackets `[ ]`, objects use curly brackets `{ }`.
- Put a **comma between** items, but **not after the last one**.
- To use a double quote inside text, write `\"`. Or use curly quotes “ ” — they need no escaping.
- A new line inside text is `\n`. A blank line (`\n\n`) starts a new paragraph.

If the file has a mistake, the site tells you roughly which line it's on.

---

## 2. Content blocks — the building bricks

The intro, every location, scenes, resource pages, evidence and the solution are all made from a **list of blocks**. The simplest block is just a string of text:

```json
"intro": [
  "The fog has not lifted from Baker Street all morning.",
  "Holmes tosses the telegram across the table."
]
```

Any block can be an object with a `"type"`:

```json
{ "type": "quote", "text": "You will go in my place.", "speaker": "Sherlock Holmes" }
```

### Text formatting (works in almost every text field)

| You write | You get |
|---|---|
| `**bold**` | **bold** |
| `*italic*` | *italic* |
| `~~struck out~~` | ~~struck out~~ |
| `[a link](https://example.com)` | a link |
| `\n` | a line break |
| `\n\n` | a new paragraph |
| `{{leads}}` | number of leads so far |
| `{{letters}}` | letters found, e.g. "A, C" |
| `{{flag:reedApproach}}` | the value of a flag |
| `{{counter:coins}}` | the value of a counter |

### Every block type

| Type | What it shows | Main fields |
|---|---|---|
| `text` | Paragraphs (a plain string is the same thing) | `text` |
| `heading` | A small heading | `text`, `level` (2 or 3) |
| `quote` | Someone speaking | `text`, `speaker` |
| `note` | An italic aside from the narrator | `text` |
| `prompt` | A grey "game" message (e.g. "You need letter A…") | `text` |
| `image` | A picture — click to zoom | `src`, `caption`, `size`, `float`, `zoom` |
| `gallery` | Several pictures in a grid | `images` |
| `audio` | A sound or narration player | `src`, `label`, `loop` |
| `video` | A video file or YouTube video | `src` or `youtube`, `caption`, `poster` |
| `document` | A styled letter, telegram, newspaper, note… | `style`, `title`, `text`, … |
| `table` | A table (timetables, registers, lists) | `headers`, `rows`, `caption` |
| `reveal` | A click-to-open section (spoilers, hints, "read the letter") | `label`, `content` |
| `actions` | Buttons and choices | `actions`, `prompt`, `pickOne`, `record` |
| `puzzle` | The player types an answer (ciphers, codes, riddles) | `prompt`, `answer(s)`, `onSolve` |
| `goto` | A button that travels to another address | `location`, `label` |
| `evidence` | Shows an item card inline | `item` |
| `scene` | Inserts a scene by name | `scene` |
| `group` | A bundle of blocks (handy with `if`/`else`) | `blocks` |
| `effects` | Invisible — just does things (give a letter, set a flag…) | `effects` |
| `link` | A link to a web page or a file in your case | `url` or `src`, `label` |
| `divider` | A short line between sections | — |
| `html` | Raw HTML for anything else (cleaned for safety) | `html` |

**Fields every block can have:**

| Field | Does |
|---|---|
| `if` | Only show the block when a condition is true. [§4](#4-conditions-if) |
| `else` | Blocks to show instead when `if` is false. |
| `effects` | Things that happen the first time the block is shown. [§5](#5-effects) |
| `repeat` | `true` = run `effects` every time it's shown, not just once. |
| `align` | `"center"` to centre it. |
| `class` | Extra CSS class names, if you add your own styles. |

---

## 3. Locations

`locations` is an object. Each key is an address; its value is the location.

```json
"locations": {
  "17 WC": "The simplest location: one string.",

  "33 WC": [
    "A list of blocks also works.",
    { "type": "quote", "text": "I'm ashamed to be her sister.", "speaker": "Lydia Niles" }
  ],

  "68 WC": {
    "name": "Gilly's lodging",
    "content": [ "…blocks…" ],
    "scenes": { "break-in": [ "…blocks…" ] }
  }
}
```

**Addresses** like `17 WC`, `4 SW`, `58 E` are grouped by district in the dropdown and sorted by number. Players can type them however they like — `17wc`, `17 wc` and `17 WC` all work. You can also use named places (`"Baker Street"`, `"Scotland Yard"`); they're listed under "Other" unless you give them a `group`.

| Location field | Does |
|---|---|
| `content` | The blocks shown when the players arrive. |
| `name` | Place name shown under the address *after* the first visit (so the dropdown doesn't spoil anything). Set `settings.showLocationNames` to `true` to always show it. |
| `hidden` | `true` = not listed in the dropdown until revealed (by `reveal`, or by being visited). Typing the address still works — like finding it in the directory. |
| `aliases` | Other things players might type: `["221B", "Baker Street"]`. |
| `group` | Dropdown heading for this location (e.g. `"Landmarks"`). |
| `countsAsLead` | `false` = visiting doesn't add a lead (for "turn this page over" style entries). |
| `effects` | Effects that run on the first visit. |
| `if` / `else` | Gate the whole location: show `else` blocks until the condition is met. |
| `lockedText` | Message if the location has been locked. |
| `scenes` | Named chunks of blocks used only by this location. |

**Leads:** the first visit to an address costs one lead. Returning is free. Addresses that aren't in the case show `settings.unknownAddressText` — and still cost a lead (switch that off with `countUnknownAddresses: false`).

**Casebook:** every visited location is listed in the player's Casebook, where it can be re-read for free in *review mode* (nothing fires, no buttons work), even if it has been locked.

---

## 4. Conditions (`if`)

Conditions decide what players see. Put one on any block, action, resource, scoring rule or location.

### Short form (a string)

```json
"if": "letter:A"
"if": "item:watch"
"if": "visited:4 SW"
"if": "decodedNote"          ← a plain word means "this flag is set"
"if": "!letter:B"            ← ! means NOT
```

### Full form (an object)

| Condition | True when… |
|---|---|
| `{ "letter": "A" }` | letter A is circled (`"letters": ["A","B"]` = both) |
| `{ "notLetter": "B" }` | letter B is *not* circled |
| `{ "flag": "foundTom" }` | the flag is set |
| `{ "flag": "approach", "equals": "bluff" }` | the flag has that exact value |
| `{ "notFlag": "warned" }` | the flag is not set |
| `{ "item": "ledger" }` / `{ "notItem": … }` | the player has / hasn't got the item |
| `{ "visited": "4 SW" }` / `{ "notVisited": … }` | the address has / hasn't been visited |
| `{ "locked": "68 WC" }` | the location has been locked |
| `{ "here": "68 WC" }` | the player is currently at that address |
| `{ "leadsAtMost": 5 }` / `{ "leadsAtLeast": 10 }` | lead count comparisons — great for time pressure |
| `{ "counter": "coins", "atLeast": 2 }` | counter comparisons (`atLeast`, `atMost`, `equals`) |
| `{ "puzzleSolved": "caesar" }` | the puzzle with that `id` was solved |

**Combining:** several keys in one object must *all* be true. A list means *all*. For more control:

```json
"if": { "any":  [ "letter:B", "item:watch" ] }
"if": { "all":  [ "letter:A", { "visited": "4 SW" } ] }
"if": { "none": [ "letter:C", "warnedBank" ] }
"if": { "not":  { "item": "ledger" } }
```

Nest them as deep as you like — perfect for knowledge gates ("needs letter A **and** either the watch **or** a visit to 47 EC").

### Showing something else when the condition fails

```json
{
  "type": "group",
  "if": "letter:A",
  "blocks": [ "What players see once they've circled A…" ],
  "else":   [ { "type": "prompt", "text": "You must have circled A to learn more here." } ]
}
```

---

## 5. Effects

Effects change the game. Use them in a block's `effects`, an action's `effects`, a puzzle's `onSolve`, or a location's `effects`.

```json
"effects": [
  { "letter": "B" },
  { "addItem": "knife" },
  { "setFlag": "foundFruit" }
]
```

| Effect | Does |
|---|---|
| `{ "letter": "A" }` | circle a letter (also `addLetter`; lists allowed) |
| `{ "removeLetter": "A" }` | un-circle it |
| `{ "setFlag": "name" }` | set a flag to true |
| `{ "setFlag": "name", "value": "footman" }` | set a flag to a value |
| `{ "clearFlag": "name" }` | remove a flag |
| `{ "addItem": "knife" }` / `{ "removeItem": "knife" }` | give / take evidence |
| `{ "lock": "here" }` | the current location can't be visited again (or name an address) |
| `{ "unlock": "68 WC" }` | allow it again |
| `{ "reveal": "33 EC" }` | list a hidden location in the dropdown |
| `{ "counter": "coins", "add": 1 }` | change a counter (`add` can be negative; or `set`) |
| `{ "addLeads": 2 }` | add leads as a time penalty (negative to give some back) |
| `{ "notify": "You hear footsteps…", "kind": "info" }` | pop-up message (`info`, `success`, `error`) |

Add `"silent": true` to any effect to skip its pop-up.

**Effects on a block run once** — the first time it's shown — so revisiting a location never gives a letter twice or adds a counter again. Add `"repeat": true` to the block if you really want it to run on every visit.

The invisible `effects` block is handy for "this happens here" moments:

```json
{ "type": "effects", "effects": [ { "letter": "C" }, { "setFlag": "foundTom" } ] }
```

---

## 6. Actions, choices and scenes

### Buttons

```json
{
  "type": "actions",
  "prompt": "“We'll have one chance,” says Wiggins.",
  "actions": [
    {
      "label": "Attempt to break in",
      "confirm": "Once you break in, you cannot return to this lodging. Continue?",
      "effects": [ { "lock": "here" } ],
      "then": "break-in"
    },
    { "label": "Leave for now", "once": false, "then": [ "You slip away." ] }
  ]
}
```

| Action field | Does |
|---|---|
| `label` | Button text (formatting works). |
| `then` | What happens next: a **list of blocks**, or the **name of a scene**. |
| `effects` | Effects when clicked. |
| `confirm` | Ask "are you sure?" first. |
| `once` | Default `true`: can only be clicked once. The result stays on the page and reappears on revisits. `false` = can be clicked again. |
| `if` | Hide the button unless true. |
| `enableIf` | Show the button, but greyed out until true ("Pick the lock" before you have a pick). |
| `travel` | Go straight to another address (costs a lead if new). |
| `style` | `"danger"` for a red button. |
| `id` | Optional name; needed if you want to `record` it (below). |

Actions can be nested: blocks inside `then` can contain more actions, puzzles, reveals — whole branching sequences.

### Pick one (the "burn one disguise" kind of choice)

```json
{
  "type": "actions",
  "prompt": "You have time to burn one more thing. Choose:",
  "pickOne": true,
  "record": "itemBurned",
  "actions": [
    { "id": "warden",  "label": "Warden's uniform",  "then": "after-burning" },
    { "id": "footman", "label": "Footman's uniform", "then": "after-burning" },
    { "id": "cook",    "label": "Cook's uniform",    "then": "after-burning" }
  ]
}
```

With `pickOne`, choosing one disables all of them. `record` saves the choice's `id` (or its `value`) into a flag, so later you can check `{ "flag": "itemBurned", "equals": "footman" }` — in a block, or in scoring.

### Scenes

A scene is a named list of blocks. Put shared ones in the top-level `scenes`, or location-only ones in that location's `scenes`. Use them with an action's `"then": "scene-name"` or with a block `{ "type": "scene", "scene": "scene-name" }`.

```json
"scenes": {
  "after-burning": [ "With the evidence destroyed, you leave before anyone notices." ]
}
```

---

## 7. Pictures, sound, video and documents

### Where media files live

You have three options. Mix them freely.

1. **A .zip** — put `case.json` at the top of the zip, with your files beside it (e.g. in a `media/` folder). Use paths like `"media/map.jpg"`. Players drop the zip; everything travels together. **(Easiest for sharing.)**
2. **Web links** — `"src": "https://example.com/map.jpg"`. Works anywhere, including in a plain .json.
3. **Hosted folder** — put the case folder on a website (e.g. GitHub Pages) and open it with a link: `index.html?case=cases/my-case/case.json`. Paths are relative to the case file.

Small images can also be embedded directly as `data:image/png;base64,…` text.

### Images

```json
{ "type": "image", "src": "media/whale.jpg", "caption": "The plaster whale", "size": "medium" }
```

`size`: `small`, `medium` or `full` (default). `float`: `left`/`right` to wrap text around it. `zoom: false` turns off click-to-zoom. In the zoom view, clicking the picture shows it at full size — good for maps and handwriting.

```json
{ "type": "gallery", "images": [
  { "src": "media/suspect1.jpg", "caption": "Lydia Niles" },
  { "src": "media/suspect2.jpg", "caption": "Aloysius" }
]}
```

### Audio & video

```json
{ "type": "audio", "src": "media/intro-narration.mp3", "label": "Listen to the introduction" }
{ "type": "video", "youtube": "https://youtu.be/XXXXXXXXXXX", "caption": "A reconstruction" }
{ "type": "video", "src": "media/clue.mp4", "poster": "media/clue-poster.jpg" }
```

### Documents — letters, telegrams, newspapers…

```json
{
  "type": "document",
  "style": "letter",
  "date": "Tuesday night",
  "to": "Dear Mrs Thorne,",
  "text": "Please tell Mr Thorne I am safe…",
  "signature": "T. Hale"
}
```

| `style` | Looks like |
|---|---|
| `letter` | Handwritten letter on cream paper |
| `note` | A scribbled yellow scrap |
| `telegram` | Post Office telegram strip (use `masthead`) |
| `newspaper` | Two-column newspaper (use `masthead`, `date`, `title`) |
| `official` | Typed police / legal document (use `masthead`) |
| `card` | A calling card |
| `ledger` | A ruled account book |

Fields: `masthead`, `date`, `title`, `to`, `text`, `signature`, `image` (a photo of the document), and `content` (more blocks inside it).

### Tables

```json
{ "type": "table", "caption": "Departures, Charing Cross",
  "headers": ["Time", "Destination"],
  "rows": [ ["6:15", "Dover"], ["7:40", "Folkestone"] ] }
```

### Reveals

```json
{ "type": "reveal", "label": "Read the circled entry", "content": [ "…blocks…" ] }
```

Content inside a reveal isn't shown — and its effects don't fire — until the player opens it.

---

## 8. Puzzles (typed answers)

For ciphers, safe combinations, riddles, "what's the name on the ticket?"…

```json
{
  "type": "puzzle",
  "id": "caesar",
  "prompt": "What does the note say?",
  "answers": ["meet me at the raven", "the raven"],
  "hint": "Shift every letter three places back.",
  "wrongText": "That doesn't read as English yet.",
  "maxAttempts": 3,
  "onSolve": {
    "effects": [ { "reveal": "33 EC" } ],
    "content": [ "**MEET ME AT THE RAVEN.**" ]
  },
  "onFail": { "content": [ "The paper crumbles in your hands." ] }
}
```

- Answers ignore capitals, spaces and punctuation (`"Meet me at the Raven!"` matches). Set `"caseSensitive": true` to be strict.
- `maxAttempts` is optional — leave it out for unlimited tries. `onWrong.effects` runs on each wrong guess (e.g. `{ "addLeads": 1 }` as a penalty).
- Give it an `id` so you can check `{ "puzzleSolved": "caesar" }` elsewhere.
- Other fields: `placeholder`, `buttonText`, `hintLabel`, `solvedText`, `failedText`.

---

## 9. Letters, evidence and resources

### Letters

```json
"letters": ["A", "B", "C", "D"]
```

Any number, any names — `"letters": ["I", "II", "III"]` works. Add a tooltip with `{ "id": "A", "label": "Lydia's clue" }`.

### Evidence (items)

```json
"items": {
  "knife": {
    "name": "Sailor's knife",
    "image": "media/knife.png",
    "description": "The kind used for gutting fish and cutting rope.",
    "content": [ { "type": "image", "src": "media/knife-closeup.jpg" } ],
    "examineLabel": "Look closer"
  }
}
```

Give items with `{ "addItem": "knife" }`. Players see them under **🔍 Evidence**. `icon` (an emoji) is used if there's no image; `content` adds an "Examine" button with more blocks.

### Resources (toolbox buttons)

```json
"resources": [
  { "label": "Map", "icon": "🗺️", "type": "image", "src": "media/map.jpg" },
  { "label": "Newspaper", "icon": "📰", "type": "page", "content": [ "…blocks…" ] },
  { "label": "Directory", "icon": "📖", "type": "pdf", "src": "media/directory.pdf" },
  { "label": "Narration", "icon": "🎧", "type": "audio", "src": "media/intro.mp3" },
  { "label": "Case website", "type": "link", "url": "https://example.com" },
  { "label": "Telegram", "icon": "✉️", "type": "page", "if": "foundTelegram", "content": [ "…" ] }
]
```

| `type` | Opens |
|---|---|
| `image` | Zoomable picture |
| `page` | A pop-up made of blocks (add `"wide": true` for tables) |
| `pdf` | The file in a new tab |
| `audio` | A player in a pop-up |
| `link` | A web page in a new tab |

Use `if` to make a resource appear part-way through the case.

---

## 10. Settings

All optional. Defaults shown.

```json
"settings": {
  "addressEntry": "both",
  "dropdownShows": "all",
  "districtOrder": ["WC", "SW", "NW", "N", "EC", "E", "SE", "S", "W"],
  "showLocationNames": false,
  "countUnknownAddresses": true,
  "unknownAddressText": "You find nothing of interest here.",
  "lockedText": "You cannot return here.",
  "allowRevisit": true,
  "lettersTitle": "Letters Found",
  "letterFoundText": "Letter {letter} circled!",
  "itemFoundText": "Added to evidence: {item}",
  "evidenceTitle": "Evidence",
  "toolsTitle": "Investigation Tools",
  "leadsLabel": "Leads followed",
  "startHint": "When you're ready, choose a location from the **Investigation Tools** to begin.",
  "questionsIntro": "",
  "confirmSolve": "Are you ready to answer the questions? …",
  "debug": false
}
```

| Setting | Options |
|---|---|
| `addressEntry` | `"dropdown"` (pick from a list), `"typed"` (type addresses — most like the board game, no spoilers), `"both"` |
| `dropdownShows` | `"all"` locations, only `"visited"` ones (dropdown becomes a history), or `"none"` |
| `allowRevisit` | `false` = going back opens the read-only notes instead |
| `confirmSolve` | Set to `""` to skip the "are you sure?" before answering |

---

## 11. Theme

Change the look per case. Colours are any CSS colour.

```json
"theme": {
  "primary": "#2a160cb3",
  "secondary": "#4a3828",
  "accent": "#5e734f",
  "accentHover": "#405f2b",
  "paper": "#f5e6d3",
  "paperDark": "#e6d5be",
  "visited": "#a67c52",
  "background": "#3d4a5c",
  "backgroundImage": "media/fog.jpg",
  "googleFonts": ["Cinzel:wght@400;700"],
  "titleFont": "'Cinzel', serif",
  "bodyFont": "'Crimson Text', serif",
  "handFont": "'Homemade Apple', cursive"
}
```

`googleFonts` loads fonts from Google Fonts by name, so you can then use them in `titleFont`, `bodyFont` (story text) and `handFont` (letters and notes).

---

## 12. Questions, scoring and the solution

### Questions

```json
"questions": [
  {
    "text": "Which two buildings does Gilly intend to enter?",
    "points": 20,
    "answerText": "The Colonial Institute and the Haymarket Theatre.",
    "accept": ["colonial"],
    "explanation": "The arch runs from the Institute to the theatre."
  },
  {
    "text": "When will she strike?",
    "points": 20,
    "options": [
      { "text": "Saturday, 6pm", "correct": true },
      { "text": "Sunday morning" },
      { "text": "Saturday, 9pm", "points": 5 }
    ]
  }
]
```

- **Open questions** (no `options`): players type an answer. On the results page they see the real `answerText` and tick "I got this right" to claim the points — just like marking yourself in the board game. If their answer contains any `accept` word, it's ticked for them.
- **Choice questions** (`options`): marked automatically. Mark the right one `correct`, or give each option its own `points` for partial credit.
- Optional: `image`, `explanation`, `number`, `id`.

### Scoring

```json
"scoring": {
  "rules": [
    { "label": "Burned the wig and moustache", "points": 20, "if": "destroyedWig" },
    { "label": "Burned the footman's uniform", "points": 20,
      "if": { "flag": "itemBurned", "equals": "footman" },
      "missedLabel": "Didn't burn the footman's uniform" },
    { "label": "Alerted Gilly", "points": -10, "if": "spooked" }
  ],
  "leads": { "par": 5, "penaltyPerLead": 5, "bonusPerLead": 0, "maxPenalty": 50 },
  "ratings": [
    { "min": 105, "label": "You surpassed the master!" },
    { "min": 75,  "label": "Excellent!" },
    { "min": 35,  "label": "Good!" },
    { "min": 5,   "label": "Okay." },
    { "min": -999, "label": "At least you tried." }
  ]
}
```

- **rules** score things the players *did* — any condition works. Negative points are penalties (only listed if they happened).
- **leads**: `par` is Holmes's lead count. Each lead over par costs `penaltyPerLead`; optional `bonusPerLead` rewards beating him; `maxPenalty` caps the loss.
- **ratings**: the highest `min` the score reaches wins.

Total = question points + rule points ± leads.

### Solution

```json
"solution": {
  "title": "The Solution",
  "content": [ "…blocks: Holmes explains everything…" ],
  "holmesName": "Holmes",
  "holmes": {
    "text": "Holmes would have solved this case in 5 leads:",
    "leads": ["Lydia Niles (33 WC)", "Gilly (68 WC)", "Covent Garden (28 WC)"],
    "score": 100
  }
}
```

Shown after the players submit their answers, with their answers, the real ones, and a full score breakdown. After solving, players can still re-read their Casebook, or reset to play again.

---

## 13. Testing your case

1. **Add `?debug` to the page address** (e.g. `…/index.html?debug`) before loading your case. You get:
   - a list of likely mistakes in the file (a flag you check but never set, a letter not in `letters`, a scene that doesn't exist, a typo in a block type…);
   - **Free travel** — visit places without counting leads;
   - **Show state** — see every flag, letter, item and counter right now;
   - hidden locations listed in the dropdown, marked *(hidden)*.
2. Even without debug, a **⚠ warnings** button appears in the toolbox if the checker finds anything.
3. Saves are kept per case `id` in the browser. Use **⚠️ Reset Case** to start over while testing.

### Common mistakes

| Symptom | Likely cause |
|---|---|
| "is not valid JSON (around line 40)" | A missing or extra comma near that line, or an unescaped `"` in text. |
| A block never shows | Its `if` is never true — check the flag name's spelling (the checker warns about this). |
| A letter is given every visit | It won't be — effects run once. If you see repeats, check for `"repeat": true`. |
| Pictures don't appear | Path doesn't match the file name in the zip (capitals matter on websites), or the case was loaded as a plain .json without the media. |
| "Couldn't load CASE_GUIDE.md" | The page was opened straight from your computer. Use GitHub Pages or any small web server. |

---

## 14. A full location, start to finish

A classic SHCD "letter gate" location with a one-time break-in and a single choice:

```json
"68 WC": {
  "name": "Gilly's lodging",
  "content": [
    "A row of lodgings. In the yard, rotten fruit lies by a barrel marked with a chalk cross.",
    {
      "type": "group",
      "if": "letter:A",
      "else": [ { "type": "prompt", "text": "You must have circled A to learn more here. You can come back later." } ],
      "blocks": [
        "A woman leaves the end house counting money. “That's her,” mutters Simpson.",
        { "type": "effects", "effects": [ { "letter": "B" } ] },
        {
          "type": "group",
          "if": "letter:C",
          "else": [ { "type": "prompt", "text": "You need something to break the window (letter C)." } ],
          "blocks": [
            {
              "type": "actions",
              "prompt": "“We'll have one chance,” says Wiggins.",
              "actions": [
                { "label": "Attempt to break in",
                  "confirm": "Once you break in, you cannot return here. Continue?",
                  "effects": [ { "lock": "here" }, { "setFlag": "destroyedWig" } ],
                  "then": "inside" },
                { "label": "Leave for now", "once": false, "then": [ "You'll come back." ] }
              ]
            }
          ]
        }
      ]
    }
  ],
  "scenes": {
    "inside": [
      "Inside: a *Moby Dick* pamphlet, ‘Saturday 6pm’ circled. Simpson burns the wig and moustache.",
      { "type": "image", "src": "media/pamphlet.jpg", "caption": "The pamphlet", "size": "medium" },
      {
        "type": "actions",
        "prompt": "You have time to burn one more thing:",
        "pickOne": true,
        "record": "itemBurned",
        "actions": [
          { "id": "warden",  "label": "Warden's uniform",  "then": "leave" },
          { "id": "footman", "label": "Footman's uniform", "then": "leave" },
          { "id": "cook",    "label": "Cook's uniform",    "then": "leave" }
        ]
      }
    ],
    "leave": [ "You slip out before anyone notices." ]
  }
}
```

---

## 15. Publishing your case

- **Share a file:** send players your `.json` (or `.zip` with media). They drop it on the home page.
- **Share a link:** host the case folder online and share `https://your-site/index.html?case=cases/my-case/case.json`. The case opens straight away.
- The site remembers the last case each player opened, and their progress, on that device. Players can also **💾 Save** their progress to a file and **📂 Load** it on another device.

Please only publish cases you have the right to share. Writing your own original case is always fine — that's what this is for. Good hunting!
