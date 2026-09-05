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

### Correcting things

Ledger entries are **struck out, never deleted** (`voided`), and the row stays visible in the
person's list. A bahi crosses a line out; it doesn't tear the page — and "why did this number
change?" has to stay answerable afterwards, by either person.

Two guards hold the arithmetic together, and both exist because breaking them loses money
silently rather than loudly:

- **You cannot strike out an entry that a repayment already points at.** A `repay` never enters
  the net on its own; its entire effect is the reduction of what it settles. Void the target and
  the money that came back simply vanishes.
- **You cannot edit a debt below what has already been repaid**, because `remaining()` clamps at
  zero and would swallow the difference.

**Settlements belong to the amount and the kind that produced them.** Any edit rebuilds them
rather than carrying them across: a repayment corrected from ₹3,000 to ₹300 that kept claiming
to have settled ₹3,000 understated the debt by ₹2,700. Striking an entry out clears its own
`settles` too, because a struck-out repayment discharges nothing — and leaving them behind meant
`sanitise()` deleted them on the next load with no banner at all. Putting one back re-validates
every claim against the current book, since its target may have been struck out or shrunk while
it was gone. Changing the *kind* of an entry that something else settles against is refused
outright.

The settlement accumulator in `sanitise()` spans the **whole pass**, not one entry. Per-entry,
two repayments each claiming the same ₹5,000 debt both validated — neither could see the other —
so `settledAgainst()` came to ₹10,000 against a ₹5,000 debt, `remaining()` clamped to zero, and
the pair read as square while the second ₹5,000 sat in the account and nowhere in what stood
between the two people. Reachable simply by merging a backup that already held one of them. The
entries are sorted before the pass so the survivor is the same on every device. And a repayment
left with nothing to discharge is reclassified `unclear` rather than kept as a `repay` that
contributes to nothing — money that came back has to land somewhere visible.

`sanitise()` **clamps** an oversized settlement instead of dropping it. Dropping the whole row
silently raises what someone is shown to owe, on the next load, with nothing on screen — the
worst possible direction for an error in an app about money between relatives.

`fulfilled` marks a `fund` whose funder recorded it as their own spending. *"I'll give you the
money, you pay for it"* is discharged by the **spending**, not by money returning — so once it
is in your categories it must leave the net, or the same rupees are charged twice: once as your
expense, once as a debt your sister is still shown to owe you.

### The pair, and why it keeps breaking

A funded purchase counted as your own spending is **two records for one event**: the ledger entry
that moved the rupees, and an ordinary expense carrying `fromLed` that classifies them. More bugs
have come from this one relationship than from everything else in the feature combined, always
the same way — a code path touched one record and not the other.

The rules, all of them load-bearing:

| Path | Must also |
|---|---|
| Strike the entry out | stop the expense counting — done by `all()` filtering on `fromLed`, **not** by deleting the row, so Undo survives a reload |
| Edit the entry | keep the expense's amount, note and date in step, and delete it if the entry stops being a fulfilled fund |
| Edit the expense | preserve `fromLed` through `normaliseExpense` (the gate rebuilds the object, so an unlisted field is dropped) and keep `acc` null |
| Delete the expense | clear `fulfilled`, because the debt was only discharged by that spending existing |
| Undo either | restore both sides together |

Guarding each of those doors separately is what kept failing — there is always another door. So
the rule that actually holds it together is enforced once, in `sanitise()`:

> **`fulfilled` is true if and only if the companion expense still exists.** `reconcileFulfilled()`
> recomputes it from `DB.expenses` on every load and after any bulk clear.

That single line covers every way a companion can vanish that has nothing to do with the ledger —
cleared along with the expenses, rejected by its own gate because the phone's clock was wrong on
the day, skipped as a duplicate id during an import. Each of those used to leave a fund discharged
by spending that was no longer there, so the same rupees disappeared from the categories *and*
from what was owed, simultaneously, and nothing ever revisited it. Repairing it where every stored
byte passes through makes the fix permanent instead of per-path. A dangling `fromLed` is cleared in
the same pass, which turns an orphaned companion back into an ordinary expense.

And the rule that catches the rest: **`all()` is a filtered read. Anything that writes, persists,
or counts what is stored uses `DB.expenses` directly.** Writing back a filtered read deletes the
hidden rows — that is exactly how `applyImport` briefly became a deleter and `exportJSON` a lossy
backup. A companion row also always has `acc: null`: for any real rupee, exactly one record
deducts it from a balance, and here that record is the ledger entry.

Two rules keep `fulfilled` from doing damage elsewhere. It can **only** be set on a `fund` —
letting it land on a loan would cancel a real debt the moment somebody tapped a category chip,
so picking a category moves the kind chip to *For something* in front of the user instead of
silently discharging what they typed. And the expense that copy writes carries `fromLed`, so
striking the entry out takes its expense with it; otherwise the money leaves the ledger while
staying in this month's categories, traceable to nothing. `Ledger.owes()` is the one place
that decides this.

### Balances are an anchor plus a delta

`Ledger.balance()` is `anchorPaise` plus everything dated at or after `anchorTs`. The anchor
is the last time a human looked at the real thing and said "it is exactly this much."

Three things fall out of that and none of them needed a migration:

- Setting up an account is **one number**, not a history.
- Every expense predating the anchor is irrelevant *by construction*, so 105 days of sample
  data and all existing history simply do not participate. There is no backfill.
- A mis-entry from March cannot still be poisoning August, because the April check swallowed
  it. The error window is bounded by how recently you last looked.

The `adjust` row a correction writes is dated **one millisecond before** the new anchor, and
that is load-bearing rather than fussy: `balance()` counts everything at or after `anchorTs`
(`ts < from` is the skip), so a row sharing the anchor's millisecond gets applied on top of the
figure the anchor already contains, and the balance is wrong by exactly the correction. Reading
the clock twice made it happen only sometimes, which is worse than always.

**An anchor is the one timestamp that gets repaired rather than flagged.** Every other stamp in
the app records something that happened, so a wrong one is marked `tsSuspect` and kept. An anchor
is a *cutoff*: one dated in the future puts every real record before it, and the account freezes
at its starting figure forever with nothing on screen to explain it. `normaliseAccount()` clamps
it to now on the way in. It cannot be fixed at read time instead — clamping the cutoff to "now"
would place it later than every record in existence, trading silenced-forever for silenced-
differently. The flag is **sticky** (`|| !!a.tsSuspect`), because the repair happens on the load
that spots it and a freshly computed flag would already be false by the next one; checking the
balance is what clears it.

**Putting someone away is guarded on GROSS exposure, never on the net.** Owing each other ₹5,000
nets to zero while two real debts are open, and the earlier net-only guard let that through —
after which `everyone()` filtered them out of every screen, and the money owed *to* them vanished
entirely, since `parked()` only walks `dir === 'out'`. Undecided money counts in the same total,
because it sits outside the net deliberately.

**Anything that clears data has to know the ledger exists.** "Start fresh" sits on a banner about
*sample expenses*, so it now clears only those and keeps accounts, people and entries; "Load
sample data" asks twice, naming exactly what it would erase. The ledger is the one thing in here
nobody can reconstruct from memory, and it was one unconfirmed tap from gone.

**`sample` clears the moment you record anything of your own.** It used to survive until an
erase, and `backupBanner()` returns early on it — so anyone who dismissed the sample banner and
started using the app for real never saw the backup prompt again, which is exactly backwards.

An account cannot be put away while it still holds money, and a person cannot be put away while
something is still owed either way — both would drop out of `liveAccounts()` / `everyone()` and
quietly remove real money from every total. The invariant: **the sum of all balances only ever
changes because of a row you can point at.**

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

## What the accounts work owes the original app

Four rules, all of them learned by breaking them. The plain expense tracker is what the user
opens every day; the ledger is the addition, and it must never cost the tracker anything.

**Memory-only is a supported mode, not a failure** — and what a writer does when `save()` returns
false depends on what it was doing:

> A writer that only **appends** a new record keeps it and says plainly that nothing is being
> stored. A writer that **mutates** a record already on screen, or must keep two records in step,
> rolls back and refuses.

The banner promises that expenses added now last until the tab closes, so discarding them refused
the app's core action for a whole session in a private window while theme and budget changes still
went through — half-writable, with nothing explaining the difference. But a correction that lands
on one of two linked records and not the other reads as applied when it isn't, and a wrong number
is worse here than a missing one. That is why `save-recon` (anchor + its adjust row) and
`save-led-edit` (entry + its expense) roll back where `save-lend` and `commitSave` keep.

**`ledger.js` is a second script, so it can be absent.** A dropped connection or a half-finished
deploy is enough. Anything on the Home path guards with `typeof Ledger === 'undefined'` before
touching it — without that, one exception left the entire first screen blank, for every user,
including those who never open Family. `sw.js` also serves its `index.html` fallback for
**navigations only**: handing the shell back for a missing script parsed it as garbage and made
the global silently not exist, which is far harder to diagnose than a script that plainly failed.

**Merge means merge.** `applyImport` used to overwrite `notRecurring` wholesale on both paths,
and `[]` is truthy — so restoring an older backup additively rolled back every "not a regular
bill" decision, on a sheet whose own words are "Keeps everything you have now."

**The exported file shape only changes for people the change is about.** The CSV gains its
Account column only when accounts exist; otherwise it stays the five columns someone's
spreadsheet has been reading for months.

### The one thing to fix next

The oldest-debt-first repayment allocator is written **twice** — once in `save-lend`, once in
`save-led-edit` — and neither copy is under test. Everything easy to test here is tested; the two
functions carrying the most delicate arithmetic in the feature are the two nothing reaches. The
copies have already started to drift in their wording, which is how this always begins.

It was deliberately **not** fixed in the same pass as the feature: extracting it is forty lines of
movement through the money paths, with no test that would catch a slip, bundled into a release
that had just had fifty bugs taken out of it. It should be its own commit, and the tests should be
written **before** the extraction, against:

```js
allocateRepayment(personId, dir, paise, excludeId) -> { settles, left }
```

Two things the extraction must not lose. The edit door excludes the entry being edited from
**both** the candidate list *and* the book it measures remaining room against — miss the second
and an entry's own stale claim counts against its target, silently understating what is open. And
the leftover policy legitimately differs between the doors: `save-lend` splits the remainder into
a visible `unclear` entry, `save-led-edit` refuses the edit. That divergence is a product decision,
not drift.

Worth knowing for whoever later breaks up the click handler: **nothing follows the switch**, so
the `return toast(...)` early exits inside each case become plain `return`s in an extracted
function with identical semantics. That is the one thing that would have made that refactor
dangerous, and it does not apply.

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
