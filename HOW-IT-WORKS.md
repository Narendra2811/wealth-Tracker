# Hisaab — how the system works

One page, for whoever maintains this. No build step, no dependencies, no network calls.
Open `index.html` and it runs.

---

## Shape

```
index.html   shell + inline SVG icon sprite (every icon is a <symbol>)
app.css      design tokens → components. Light/dark, 3 text sizes, all rem-based
ledger.js    pure arithmetic for balances and the family ledger. No DOM, no storage,
             no DB - hand it records, get a number back. The only testable seam.
app.js       one IIFE, top to bottom: categories → utils → store → sample data
             → analytics → visual components → views → sheets → events → boot
sw.js        offline shell. Network-first, cache as fallback
```

**State** is one object, `DB`, persisted as JSON under the localStorage key `hisaab.v1`:

```js
{ expenses: [{ id, amount, catId, note, ts, acc }], budget, theme, size,
  seeded, sample, dismissed, notRecurring[], lastBackup, nudgeUntil,
  accounts[], moves[], people[], ledger[], lastAcc }
```

`S` holds throwaway view state (current tab, period, filter, open sheet, draft). Never persisted.

Every new key is **flat and top-level**, because `load()` merges with a shallow
`Object.assign(defaults(), parsed)` — a nested default comes back `undefined` from an
older backup and the first `.forEach` throws.

### Accounts, and the four money verbs

```js
accounts: [{ id, name, kind:'cash'|'bank'|'wallet', anchorPaise, anchorTs, archived }]
moves:    [{ id, kind:'in'|'out'|'xfer'|'adjust', paise, acc, toAcc, note, ts }]
people:   [{ id, name, archived }]
ledger:   [{ id, dir:'out'|'in', person, paise, kind, note, method, ref, acc, ts, settles[] }]
```

The app now distinguishes four things that all move money and are **not** the same:

| | what it is | touches a balance | touches a category |
|---|---|---|---|
| **expense** | money left the family | yes | **yes** |
| **move** | your own money changing place, or arriving | yes | no |
| **ledger** | money between you and a person | yes | no |
| **adjust** | the gap found when you check a balance | yes | no |

Only an expense is spending. A ₹5,000 loan to your sister lowers your cash and appears
nowhere in the treemap, the budget bar or insights — the family is exactly as rich as it
was one second earlier; only the location changed. This is enforced structurally: there is
no code path from `DB.ledger` or `DB.moves` into `all()`.

Amounts in the new collections are **integer paise** in a field named `paise`. Expenses keep
their float `amount`. A ledger compares numbers rather than printing them — "is it settled?"
is `outstanding === 0`, and `0.1 + 0.2 !== 0.3`. The distinct field name makes a float
impossible to assign in by accident. `ledger.js` converts at the one boundary that needs it.

### Balances are an anchor plus a delta

`Ledger.balance()` is `anchorPaise` plus everything dated at or after `anchorTs`. The anchor
is the last time a human looked at the real thing and said "it is exactly this much."

Three things fall out of that and none of them needed a migration:

- Setting up an account is **one number**, not a history.
- Every expense predating the anchor is irrelevant *by construction*, so 105 days of sample
  data and all existing history simply do not participate. There is no backfill.
- A mis-entry from March cannot still be poisoning August, because the April check swallowed
  it. The error window is bounded by how recently you last looked.

Checking a balance writes a new anchor **and**, when the figure disagrees, a visible `adjust`
row holding the gap. A correction that leaves no trace is how a ledger stops being worth
trusting, so the difference is always recorded rather than absorbed — and the account sheet
totals it back as "unexplained so far".

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

This page used to claim that and be wrong: `commitSave()` — the keypad, the busiest door in
the app — built its record inline and pushed it straight into `DB.expenses`, skipping
`clipText()`, the id check and the date bounds. It now goes through the gate like everything
else. Note that the gate returns a **fresh object with a fixed field list**, so a field you
add to an expense and forget to add there is silently dropped on the next load; `acc` is in
that list for exactly this reason.

Accounts, moves, people and ledger entries have gates of their own — `normaliseAccount`,
`normaliseMove`, `normalisePerson`, `normaliseLedger` — with the same contract: return a clean
object or `null`. Two rules differ, deliberately:

- **A bad timestamp is flagged, not dropped.** `normaliseExpense` returns `null` past
  `maxTs()`, which on a phone whose clock reset after a battery pull deletes a real ₹5,000
  entry on next boot and tells nobody. Ledger records set `tsSuspect` and surface it instead.
- **A duplicate id is quarantined, not renamed.** `sanitise()` reissues a duplicate *expense*
  id harmlessly, but these ids are pointed at by `settles` and `acc`; quietly renaming one
  orphans every reference with no error on any screen.

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
