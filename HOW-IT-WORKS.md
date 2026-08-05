# Hisaab — how the system works

One page, for whoever maintains this. No build step, no dependencies, no network calls.
Open `index.html` and it runs.

---

## Shape

```
index.html   shell + inline SVG icon sprite (every icon is a <symbol>)
app.css      design tokens → components. Light/dark, 3 text sizes, all rem-based
app.js       one IIFE, top to bottom: categories → utils → store → sample data
             → analytics → visual components → views → sheets → events → boot
sw.js        offline shell. Network-first, cache as fallback
```

**State** is one object, `DB`, persisted as JSON under the localStorage key `hisaab.v1`:

```js
{ expenses: [{ id, amount, catId, note, ts }], budget, theme, size,
  seeded, sample, dismissed, notRecurring[], lastBackup, nudgeUntil }
```

`S` holds throwaway view state (current tab, period, filter, open sheet, draft). Never persisted.

---

## The three rules that hold it together

**1 — One validation gate.** Every expense passes `normaliseExpense()`, whatever door it came
in by: the keypad, a restored backup, or bytes already on disk. It enforces amount finite,
positive after rounding, ≤ ₹100 crore; `ts` a real date between 2000 and now+2 days; category
a known id or `other`; note trimmed, control characters stripped, cut on grapheme boundaries;
and **id matched against `/^[A-Za-z0-9_-]{1,40}$/` or regenerated.**

That last clause is load-bearing — ids are interpolated into `data-id="…"`, and an
attacker-supplied id was a confirmed XSS. Validation used to live in two places that drifted
apart. If you add a fourth entry point, route it through this function, don't copy it.

**2 — Rendering is synchronous.** `render()` writes `innerHTML`, then `enhance()` forces a
layout flush and immediately sets bar widths, count-ups and treemap tiles. It deliberately
avoids `requestAnimationFrame` and `ResizeObserver`: both are delivered by the frame loop, and
a window not producing frames never delivers them. That left bars at zero and treemaps blank
for anyone opening the app in a background tab. Testing found an environment where a freshly
created `ResizeObserver` fired **zero** times.

CSS transitions still animate, because the zero-width starting state is committed before the
target is set. The treemap is the one pixel-measured component, so if its box is 0px wide it
sets `treemapPending` and retries on real DOM events (`resize`, `visibilitychange`,
`pointerdown`, `scroll`) — those always arrive.

**3 — Derived values are memoised per revision.** `save()` bumps `rev`; `cached(key, fn)` keys
on it. Recurring detection, insights and the typical-day baseline are pure functions of the
expense list but get asked for several times per render. This took Insights from 171ms to
43ms on a 5,000-expense store.

---

## Analytics worth knowing about

**`detectRecurring()`** finds monthly bills from history alone. A candidate needs ≥3 sightings,
**every** gap 26–35 days (not just the average), a landing date within ±2 days of its median,
amounts within 3× of each other, and a sighting in the last 50 days. The date-consistency rule
does the real work — without it, three coffees a month apart were announced as a subscription.
No rule is perfect here, so every guess is tappable and rejectable; rejections persist in
`DB.notRecurring` keyed `catId|note`.

**`squarify()`** is a real squarified treemap (Bruls–Huizing–van Wijk). Tiles pick their own
detail level from the area they got; small ones show just an icon and let the ranked list
below carry the numbers.

**The 7-day chart caps its scale.** One rent-sized day would flatten the week into slivers, so
the scale sits just above ordinary days and true outliers get an "off the chart" caret while
still showing their real amount.

**Partial months are excluded.** `yearSection()` marks a month partial if records start after
the 3rd or it's still running, hatches it, and leaves it out of the average — otherwise a
half-recorded first month masquerades as a cheap one.

---

## Storage, and the ways it goes wrong

**Unreadable data ≠ unavailable storage.** These used to share a path, and it was the worst
bug in the codebase: one corrupt write flipped the app to memory-only *permanently*, so every
expense added afterwards was silently lost. Now missing storage is fatal and announced;
damaged data is quarantined under `hisaab.v1.damaged`, repaired where possible, and saving
continues. `sanitise()` returns whether it changed anything and writes the clean copy back so
the repair happens once, not every load.

**Multi-tab.** Two tabs are two writers to one store, and last-write-wins silently destroyed
the other's expenses. A `storage` event listener reloads `DB`, clears the memo, re-renders,
and closes the edit sheet if the row being edited disappeared.

**Exports** prefix any cell starting `= + - @` with `'` — otherwise a note like
`=cmd|' /C calc'!A0` executes when the CSV opens in Excel. **Imports** are capped at 8MB and
50,000 rows; a 16MB file previously froze the app for 25 seconds and then silently did nothing.

---

## Conventions

- Money always through `money()` / `compact()` / `moneyHTML()` — they coerce non-finite input
  to 0, so nothing can render `₹∞` or `₹NaN`. Same for `fmtTime` / `relDay` / `fullDate`.
- All interpolated user text goes through `esc()`. Attributes too.
- Category colour comes from `cc(id)` (theme-aware) and `cvars(id)` (sets `--c` / `--c-soft`).
- Click handling is one delegated listener on `document`, switching on `data-act`.
  Adding a control means adding a `data-act` and a `case` — no new listeners.
- Charts that are purely decorative carry `aria-hidden="true"`, because the numbers beside them
  are already text. Treemap tiles carry explicit `aria-label`s.
- Sheets trap Tab, return focus on close, and are dismissible by swipe, Esc or scrim.

## Things deliberately not built

Custom categories (ten fixed ones in a 5×2 grid *is* the simplicity), income tracking (it's an
expense tracker; the budget answers "what's left"), and multi-currency (₹ by design).
