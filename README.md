# Hisaab — your money, at a glance

**[Open it →](https://narendra2811.github.io/wealth-Tracker/)**

Two things a household actually needs, in one app that fits in under half a megabyte and
asks nothing of you:

**Where your money went.** You should understand what happened to it within a few seconds
of opening the app, without reading a single table.

**Where your money *is*, and what has passed between you and the family.** How much is in
cash, how much in the bank — and how much you gave your sister, what it was for, and
whether it came back.

No sign-up. No server. No network calls of any kind. No build step, no dependencies, no
framework. Everything lives in your browser's local storage, on your device, and there is
nowhere else for it to go.

> `हिसाब` · *hisaab* — the account of things; what is owed and what is settled.

---

## Run it

Just open the file:

```bash
open index.html
```

Or serve it (needed if your browser blocks local storage on `file://`):

```bash
python3 -m http.server 8777
```

Then visit `http://localhost:8777`. On a phone, use **Add to Home Screen** — it runs
full-screen like a native app.

The first launch loads three months of realistic sample expenses so the app has
something to show you. A banner on the home screen clears it whenever you're ready.

---

## Deploying it

There is nothing to build. Upload the folder; that's the deploy.

Every path in the app is **relative**, so it works from a domain root *or* a subfolder
(`narendra2811.github.io/wealth-Tracker/`) with no configuration. This is tested, not
assumed — the whole app gets staged in a subfolder and served, and the app, both scripts,
the icons, the manifest and the service worker are all checked to resolve from there.

**GitHub Pages** — push the repo, then Settings → Pages → deploy from `main` / root.
**Netlify or Vercel** — drag the folder in, or connect the repo. No build command, no output
directory. **Any static host or your own server** — copy the files in.

The only real requirement is **HTTPS**, which every host above gives you free. Service
workers won't register over plain `http://` (except on `localhost`), so without it you lose
offline support — everything else still works.

### When you ship an update

Bump `CACHE` in `sw.js` (currently `hisaab-v1.4`). The worker is network-first, so a
fresh visit already gets new files; bumping the name also clears the old cache on activate,
so a browser holding a stale worker can't serve yesterday's app.

### Tests

Serve the folder and open `tests.html` — the same server you'd use to run the app. (It
needs one: the harness reaches into an iframe and into `localStorage`, and browsers give
`file://` frames an opaque origin, so it cannot run by double-clicking.) No runner to
install, no dependencies, nothing to build. It loads the real app in an iframe, drives it
the way a user would, and prints a pass/fail list.

**95 assertions across 29 groups**, and they fall into three kinds:

**Things that actually broke.** The validation gate against hostile and malformed records,
the XSS payload that once executed, damaged-storage recovery, the empty state, add /
delete / undo, double-tap Save, search by note and by amount, recurring detection
(including that scattered spends are *not* called a bill), CSV formula-injection escaping,
horizontal overflow, and accessibility basics.

**Rules, not implementations.** That a transfer between your own accounts never reaches a
category total. That a debt is settled once and not twice. That a fund counts as your
spending *or* as a debt, never both. That mutual debts netting to zero is not the same as
settled. That striking an entry out leaves it readable. That a backup carries the ledger.

**Properties over states nobody would hand-write.** One test builds 160 deliberately
hostile ledger entries — nonsensical settlements, random struck-out and discharged flags,
half the funds missing their other half — pushes them through the repair pass, and asserts
six invariants across the lot. Another shuffles every record forty ways and asserts the
balances come out identical, because a money figure that depends on array order is a bug
that hides for months.

Not everything is covered, and the file says so where it isn't. Four of the ten defects in
the table below have no regression test — multi-tab loss, the import cap, the blank
treemap, and emoji truncation were each fixed and verified by hand. One behaviour is
deliberately untested with the reason written in place: forcing it meant overriding
`Storage.prototype`, which silently broke every test after it. A test that corrupts the
suite is worse than no test.

### Checked before release

- Served from a subfolder — app, both scripts, icons, manifest and service worker all resolve
- Killed the server and reloaded — full app, all data, from cache
- Content Security Policy verified by *trying* to run an injected inline handler: the
  attribute lands in the DOM, never compiles, never fires
- No external requests of any kind — no CDN, no fonts, no analytics, no telemetry
- `ledger.js` deleted from the running app — Home still renders and stays reachable, because
  a second script file is a second thing that can fail to arrive
- Every write path with storage refusing writes — the record is kept for the session and
  the app says plainly that nothing is being stored
- 5,000 expenses — Home renders in single-digit milliseconds, Insights in ~23 ms
- Both themes at all three text sizes on a 360 px screen — no horizontal overflow anywhere

---

## What it does

**Accounts — where the money actually is**

Tell Hisaab what you have right now: cash in hand, money in the bank, a UPI wallet. Every
expense you record after that names which one it came out of, with the last-used account
already selected — so the fast path is still amount, category, save.

A balance is an **anchor plus what moved since**: the figure you last confirmed, plus
everything dated after it. That one choice means setting up an account is a single number
rather than a history, and nothing you recorded before today has to be reclassified.

Money coming in, and money moving between your own accounts, are recorded as their own
thing. **Withdrawing ₹3,000 from the bank is not spending** — your cash goes up, your bank
goes down, and not one rupee reaches your categories.

When the app's figure and your pocket disagree, you *check* the balance rather than fix it.
The gap is written down as its own visible row and totalled back to you as "unexplained so
far", because a correction that leaves no trace is how a ledger stops being worth trusting.

**Family — who gave what to whom**

The thing nobody in a family can ever remember: how much you gave your sister, what it was
for, whether it came back. Record it once and the answer stops being a matter of opinion.

> **₹5,000 with Priya since 12 Aug** — electrician

The rule that makes it work: **giving money to a person is not an expense.** It lowers your
cash and appears nowhere in your spending — the family is exactly as rich as it was a second
earlier; only the location changed. Confuse those two and every number in the app is wrong.

Money doesn't always come with a label, so it doesn't have to have one here. *Not decided
yet* is a real answer and the default — it's counted separately and never quietly becomes a
debt. There's also **vyavhar** for shagun, neg and money to parents: recorded in full, and
structurally never owed by anyone.

Typed the wrong number? Tap the entry and change it, or **strike it out** — it stops counting
but stays in the book, crossed through, so the reason a figure changed is still readable later.
The one thing you can't do is strike out something that's already been paid back against; the
app says so and tells you what to undo first.

For *"I'll give you the money, you pay for it"*, tick **also count it as my spending** and pick
a category. The purchase lands in your categories, the rupees leave your account exactly once,
and nothing is left owing — because the money was spent on your thing, which was the whole point.

Everything is netted **only between the two of you**, never across three people, and a
settle-up shows the arithmetic rather than a verdict:

> You gave ₹5,000 (12 Aug, electrician). She gave ₹3,000 (2 Sep, petrol). ₹3,000 cancels.
> She pays you ₹2,000.

None of this is shared with anyone. There is no sync, no account, no server, and no way to
see another person's spending — deliberately, and it is not a feature that is coming.

**Still to come — the bit most trackers miss**

Hisaab reads your history and works out which expenses repeat monthly — rent, broadband,
the gym — without you setting anything up. It then tells you what's still coming before
the month ends:

> Still to come · **₹22,511** — Electricity 8 Aug, Broadband 12 Aug, Rent 25 Aug, House
> help 26 Aug. *These would put you about ₹125 over budget.*

A budget can look perfectly healthy at ₹7,614 of ₹30,000 and still be doomed. This is the
number that tells you.

Nothing is scheduled and nothing is charged — it's an observation about your own past.
Tap any bill to see the reasoning ("spotted this 4 times, always around the 25th"), log it
in one tap, or tell Hisaab it guessed wrong.

**Home — "what happened to my money?"**
- Today's spend as one large, glanceable number, with a mood read on the day
  (*Calm · Steady · Heavy*) based on your own 30-day normal — not an arbitrary threshold
- **Right now you have** — your total on hand and each account's balance, with a quiet note
  when one hasn't been checked in a while. Appears once you make an account, not before
- **Family** — each person and where you stand, said in words with a direction arrow, never
  in colour alone. No rupee figure for the family total sits on the first screen: a balance
  that gets glanced at is a balance that gets read aloud at a gathering
- How today compares to yesterday, in rupees and direction
- A 7-day rhythm chart with your daily-average line drawn across it
- A proportion bar of exactly where today's money went, by category
- Month total with a **budget pace marker** — a tick showing where you *should* be by
  today, so "₹13,000 of ₹30,000" becomes "ahead of pace" or "comfortably under"
- This month vs last month, compared at the same point in the month
- A **treemap** of your categories: the bigger the rectangle, the bigger the spend
- Ranked categories with share bars and how many times you spent on each
- Your biggest spend, and how many times your typical expense it was
- One rotating insight worth noticing

**Insights — "how does my money behave?"**
- **Month by month** — the only view that shows the *arc*. Twelve months of bars with your
  average drawn across them, and a plain read of the direction ("recent months run about
  14% lower than your earlier ones"). Months where the records are incomplete are drawn
  hatched and excluded from the average, so a half-month never masquerades as a cheap one.
- A month heat calendar — every day shaded by how much it cost you. Rent day, weekends
  and quiet days are visible instantly. Tap any day to see it.
- **What's locked in** — of a typical month, how much is committed before you decide
  anything (₹22,511, 34%) versus how much is actually yours to steer (₹44,656, 66%)
- Your weekly rhythm: average spend per weekday over 8 weeks
- What changed: per-category movement vs last month, faded bar = then, solid = now
- Plain-language patterns generated from your data — top category, weekend multiplier,
  no-spend days, small-spend leaks, month-end projection, heaviest day

**Tap any category** — from the treemap or the ranked list — for a six-month trend of that
category alone, all-time totals, your typical and biggest spend in it, and a breakdown of
what you actually buy inside it.

**History**
- Day-grouped timeline with per-day totals and a category proportion bar per day
- Month separators with running totals
- Search notes, categories **and amounts** — "₹799" finds every ₹799 you've paid
- Tap anything to edit or delete — deletes are undoable

**Add an expense — about three seconds**
- Big number pad, ten large category tiles, one tap each
- Quick-repeat chips for the things you buy over and over, at the price you usually pay
- **Paid from** — your accounts as chips, with the last one you used already selected, so
  the fast path stays amount, category, save. The row only appears once you have accounts,
  and "Not sure" is always one tap away
- Optional note, Today / Yesterday / any date
- On a keyboard: `n` opens it, digits type, `Enter` saves, `Esc` closes

**Settings**
- **Your money** — Accounts and Family, with live counts and your total on hand
- Auto / Light / Dark theme
- Three text sizes — the whole interface scales, not just the body copy
- Monthly budget
- **Save a backup (JSON)** — carries everything: expenses, accounts, people, the family
  ledger. **Restore** merges or replaces, and the preview counts all of it before you
  commit to anything
- **Save as a spreadsheet (CSV)** — expenses only, and the app says so rather than letting
  you believe otherwise. It gains an Account column only if you have accounts, so a file
  someone's spreadsheet has been reading for months doesn't change shape underneath them.
  It also no longer marks your data "backed up", because a CSV cannot restore the ledger
- Reload the sample, or erase everything — both now say what they would take with them

**Works offline.** A service worker caches the app shell, so once you've opened it
it keeps working with no signal — on a train, on a plane, in a basement.

---

## Taking care of your data

Everything living in one browser is the privacy promise *and* the risk, so Hisaab is
honest about it rather than quiet.

**Nothing is shared with anyone, including the family.** The ledger records what passed
between you and them; it does not send anything anywhere, and there is no screen on which
one person can see another person's spending. That was asked for and deliberately not
built — it is the only part of this idea that would have required a server and an account,
and the goal behind it ("who has room to help right now?") is better served by asking than
by a permanent feed. Each phone keeps its own book.

- Once you have 30+ expenses of your own, a calm banner points out they exist in exactly
  one place and offers to save a backup. "Not now" snoozes it for a month; taking a
  backup silences it for three. It never nags about the sample data.
- If the browser can't save at all — private mode, or storage full — that is stated
  plainly and immediately, with the reason and an escape hatch, instead of failing
  silently while you keep typing.
- If saved data is ever unreadable, the damaged copy is set aside under a separate key
  and Hisaab carries on with saving still working. Individual malformed records are
  repaired or dropped on load rather than being allowed to crash a screen.

---

## Designed to be used by anyone

Built to be comfortable for a 20-year-old and a 70-year-old without ever looking like
a "senior" app:

- Primary controls are 56–64px; the keypad, the FAB and every list row are comfortably
  past 48px. A few secondary controls sit lower — the segmented period switch is 42px and
  the sample banner's dismiss is 34px — which clears WCAG AA and not AAA. Measured, not
  assumed, and stated here rather than rounded up
- Every icon is paired with a text label — colour is never the only signal
- Text-size control scales the entire interface (`rem`-based throughout)
- Full keyboard support, visible focus rings, ARIA labels on every control
- Honours `prefers-reduced-motion` and `prefers-color-scheme`
- Indian number formatting throughout (₹1,24,500 — not ₹124,500)

---

## Files

| File | What's in it |
|---|---|
| `index.html` | Shell and the inline SVG icon set |
| `app.css` | Design tokens, light/dark themes, every component |
| `ledger.js` | Balances and the family ledger, as pure functions. No DOM, no storage |
| `app.js` | State, storage, analytics, visual components, views, interactions |
| `sw.js` | Service worker — the offline shell |
| `tests.html` | The whole test suite. Open it in a browser; there is no runner |
| `HOW-IT-WORKS.md` | One page for whoever maintains this — the rules and why they exist |
| `icon.svg` | App icon |
| `manifest.webmanifest` | Makes it installable |

Two script files, and that is deliberate: `ledger.js` holds every calculation about money
as **pure functions** — hand it records, get a number back, no DOM and no storage
anywhere near it. `app.js` is one IIFE with no seam in it, and the one thing in this app
that must never be quietly wrong is a figure about money between relatives. Pure functions
can be handed the same records in a thousand different orders and asserted identical.
That is not a style preference; it is the only reason the property tests above can exist.

---

## What broke when I attacked it

Hisaab was deliberately attacked before being called finished. Everything below is a
real defect that was found by trying to break the app, not a hypothetical:

| Found | Severity | What happened |
|---|---|---|
| **XSS via expense id** | Critical | Ids were interpolated raw into `data-id="…"`. A crafted backup file with the id `x" onfocus="…" autofocus` injected a live event handler — confirmed executing arbitrary JS on import. Any "backup" someone sent you could read and exfiltrate everything. |
| **Multi-tab data loss** | High | Two tabs open, each with its own in-memory copy. Whichever saved last silently erased the other's expenses. Reproduced: added an expense in tab B, added one in tab A, tab B's was simply gone. |
| **CSV formula injection** | High | A note like `=cmd\|' /C calc'!A0` exported verbatim. Opening that CSV in Excel or Sheets executes it — the export could attack whoever opened it. |
| **`Infinity` amounts** | High | An amount of `1e308` rendered `₹∞` across the app and serialised to `null` on save, destroying the record. |
| **Invalid timestamps** | Medium | Dates outside the representable range produced `undefined, NaN undefined` day headers and `12:NaN am` times. |
| **Double-tap Save** | Medium | An impatient second tap threw `TypeError: Cannot read properties of null`. |
| **Import DoS** | Medium | A 16MB / 200,000-row file froze the app for 25 seconds and then silently did nothing. No size cap, no feedback. |
| **Blank treemap** | Medium | Measured while its container was 0px wide — a background tab, a collapsed pane — the treemap drew nothing and stayed blank permanently. |
| **Whitespace note** | Low | A note of `"   "` is truthy, so it became the title and rendered as an empty row. |
| **Emoji truncation** | Low | `.slice(0, 60)` cut through surrogate pairs, leaving broken characters. |

Prototype pollution was attempted (`__proto__` and `constructor.prototype` payloads in
stored JSON) and was **not** exploitable.

### How they were fixed

Rather than patching each symptom, every expense — from the keypad, a restored backup, or
whatever is already on disk — now passes through **one** validation gate, so the rules
can't drift apart between entry points. It enforces: amount finite, positive after
rounding, and under ₹100 crore; timestamp a real date between 2000 and two days from now;
category a known id or `other`; note trimmed, stripped of control characters and cut on
character boundaries; and **id matched against `/^[A-Za-z0-9_-]{1,40}$/` or regenerated** —
which is what closes the XSS at the source, with attribute escaping as a second layer.
Duplicate ids are reissued, because two rows sharing an id makes edit and delete hit the
wrong one.

Beyond that: a `storage` event listener means a second tab's writes are pulled in instead
of overwritten; CSV cells beginning `= + - @` are prefixed so spreadsheets treat them as
text; imports are capped at 8MB and 50,000 rows and report progress; `commitSave` tolerates
a duplicate tap; and money and date formatters can no longer emit `NaN` or `∞` whatever
they are handed.

### One fix that didn't work

The blank-treemap repair was first written with a `ResizeObserver` — the textbook answer.
Verifying it showed the treemap still never recovered. A freshly created `ResizeObserver`,
on the same element, with a real width change, **fired zero times**: like
`requestAnimationFrame`, its callbacks are delivered by the frame loop, and a window that
isn't producing frames never delivers them.

So recovery hangs off ordinary DOM events instead — `resize`, `visibilitychange`,
`pointerdown`, `scroll` — which arrive regardless, and cost nothing because they no-op
unless a treemap actually failed to measure. Worth stating plainly: the first fix was
wrong, and only testing the fix rather than trusting it caught that.

---

## What broke when I added money between people

The accounts-and-family work went through ten rounds of adversarial review before it was
called finished, and fixed around fifty real defects. The interesting thing is not the
count. It is that **most of them were introduced while fixing the round before.**

A few worth naming, because they are all the same species — a number that was confidently,
quietly wrong:

| Found | What happened |
|---|---|
| **Reconcile counted its own correction twice** | Two `Date.now()` reads, one for the correction row and one for the new anchor. When they landed in the same millisecond the balance moved by the gap *twice*. It only happened sometimes, which is worse than always. |
| **Overpayment vanished** | Pay back ₹5,000 against a ₹3,000 debt and ₹3,000 settled while ₹2,000 evaporated. The app said "all settled" while you were owed money the other way. |
| **Archiving erased money** | Putting an account away removed its balance from every total, while the toast said nothing was deleted. Archiving a *person* did the same whenever two debts netted to zero — and money owed **to** them then appeared on no screen at all, because "still out there" only walks one direction. |
| **The same rupees charged twice** | A purchase you funded and counted as your own spending was both an expense *and* a debt still owed. |
| **One debt settled twice** | The settlement accumulator was declared inside the per-entry loop, so two repayments could each fully discharge the same ₹5,000 and the second one's money disappeared. |

And then the ones that were not in the new feature at all, but in the tracker that was
already working — these were the worst, because they hit people who never open Accounts:

- **A blank Home screen.** `ledger.js` is a second script, so it can fail to arrive; one
  unguarded call left the first screen empty and its tab unreachable. The service worker
  was making it worse by serving `index.html` for the missing script, which parsed as
  garbage so the global silently never existed — far harder to diagnose than a script that
  plainly failed.
- **No expense could be entered in a private window.** A rollback added for the ledger
  discarded the record, contradicting the app's own banner promising expenses last the
  session. Theme and budget changes still worked, so the app was half-writable with nothing
  explaining the difference.
- **Merge-import wiped every "not a regular bill" decision** — on a sheet whose own words
  are "Keeps everything you have now."

### What actually made it stop

Guarding each door failed repeatedly, because there is always another door. What held was
moving the rule to the one place every stored byte passes through:

> A fund is discharged **if and only if** the spending record that discharged it exists.
> Recomputed on every load, not maintained at each call site.

That single change fixed three separate bugs at once and closed off the whole family of
them — a companion record can vanish down paths that have nothing to do with the ledger
(cleared with the expenses, rejected for a bad clock, skipped as a duplicate on import),
and every one of those used to leave money missing from the categories *and* from what was
owed, simultaneously, with nothing ever revisiting it.

The other rule earned the same way: **reading is filtered, writing never is.** Making one
accessor hide records had, one edit later, turned the importer into a deleter and the
backup into a lossy one, because both wrote back through the filtered reader.

Both are pinned by tests now, and written down in
[`HOW-IT-WORKS.md`](HOW-IT-WORKS.md) — along with the one thing left to fix, why it was
deliberately *not* bundled into that pass, and the two traps waiting for whoever does it.

---

## A few implementation notes

**The treemap** is a real squarified treemap (Bruls–Huizing–van Wijk), laid out in
`squarify()`. Tiles pick their own detail level from the area they got — big ones show
name, amount and share; small ones show just the icon and let the ranked list below
carry the numbers.

**The 7-day rhythm chart caps its scale.** One rent-sized day would otherwise flatten the
whole week into slivers, so the scale sits just above your ordinary days and a genuine
outlier gets an "off the chart" caret while still showing its true amount.

**Rendering is synchronous, not `requestAnimationFrame`-driven.** rAF never fires in a
hidden tab, which left bars at zero and treemaps blank for anyone who opened the app in a
background tab. `enhance()` commits the starting state with a forced layout flush and then
sets the targets, so CSS transitions still animate but correctness never depends on a
frame arriving.

**Insights read from windows that are actually meaningful** — weekday-vs-weekend over
8 weeks rather than the 4 days you might be into a new month, and the month-end
projection stays hidden until there's a week of data behind it.

**Recurring detection refuses to guess.** A candidate needs three or more sightings, gaps
that *all* look monthly (not just on average), a landing date that stays within a couple of
days each month, amounts within 3× of each other, and a sighting in the last 50 days. The
date-consistency rule is what does the real work: without it, three coffees that happened
to fall a month apart got announced as a subscription. And because no rule is perfect at
this, every guess is tappable and rejectable — the app explains its reasoning and takes
correction rather than insisting.

**Unreadable data and unavailable storage are different failures.** They used to share a
code path, and treating them alike was a genuine hazard: one corrupt write flipped the app
into memory-only mode *permanently*, so every expense added afterwards was silently lost
with no way back. Missing storage is now fatal and announced; damaged data is quarantined
under a `.damaged` key, repaired where possible, and saving continues.

**Derived figures are memoised per revision.** Recurring detection, insights and the
typical-day baseline are pure functions of the expense list, but a single render asks for
them repeatedly. Caching them against a revision counter took Insights from 171ms to 43ms
on a 5,000-expense store — roughly five years of daily use, which still renders in under
50ms warm.

**Import validates every row.** Bad amounts, missing timestamps, nulls and unknown
categories are individually handled rather than trusted or thrown away wholesale; the
preview tells you how many rows it couldn't read before you commit to anything.

**Sample data is deterministic** (seeded PRNG) and priced per item — chai costs chai
money, rent lands on the 25th with the salary cycle.

---

Hisaab remembers what you wrote down. It cannot prove anything — it is a notebook, not a
bank. Your data never leaves the device. There is nowhere for it to go.
