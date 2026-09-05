# Hisaab — your money, at a glance

A personal expense tracker built around one idea: **you should understand what happened
to your money within a few seconds of opening the app, without reading a single table.**

No build step. No dependencies. No accounts, no servers, no network calls.
Everything lives in your browser's local storage, on your device.

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
(`you.github.io/tracker/`) with no configuration. This is tested, not assumed.

**GitHub Pages** — push the repo, then Settings → Pages → deploy from `main` / root.
**Netlify or Vercel** — drag the folder in, or connect the repo. No build command, no output
directory. **Any static host or your own server** — copy the files in.

The only real requirement is **HTTPS**, which every host above gives you free. Service
workers won't register over plain `http://` (except on `localhost`), so without it you lose
offline support — everything else still works.

### When you ship an update

Bump `CACHE` in `sw.js` (`hisaab-v1.2` → `hisaab-v1.3`). The worker is network-first, so a
fresh visit already gets new files; bumping the name also clears the old cache on activate,
so a browser holding a stale worker can't serve yesterday's app.

### Tests

Open `tests.html` in a browser. That's the whole setup — no runner to install, no
dependencies, nothing to build. It loads the real app in an iframe and drives it the way a
user would, then prints a pass/fail list.

It covers the things that actually broke during development: the validation gate against
hostile and malformed records, the XSS payload that once executed, damaged-storage
recovery, the empty state, add/edit/delete/undo, double-tap Save, search by note and by
amount, recurring detection (including that scattered spends are *not* called a bill),
browser history and Back-closes-sheet, CSV formula-injection escaping, horizontal overflow
at every view, and accessibility basics.

Every bug listed in "What broke when I attacked it" below has a regression test here.

### Checked before release

- Served from a subfolder — app, icons, manifest and service worker all resolve
- Killed the server and reloaded — full app, all data, from cache
- Content Security Policy verified by *trying* to run an injected inline handler: the
  attribute lands in the DOM, never compiles, never fires
- No external requests of any kind — no CDN, no fonts, no analytics, no telemetry

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
- Optional note, Today / Yesterday / any date
- On a keyboard: `n` opens it, digits type, `Enter` saves, `Esc` closes

**Settings**
- Auto / Light / Dark theme
- Three text sizes — the whole interface scales, not just the body copy
- Monthly budget
- Export to CSV or JSON, **restore from a backup** (merge or replace, with a preview of
  what's in the file first), reload the sample, or erase everything

**Works offline.** A service worker caches the app shell, so once you've opened it
it keeps working with no signal — on a train, on a plane, in a basement.

---

## Taking care of your data

Everything living in one browser is the privacy promise *and* the risk, so Hisaab is
honest about it rather than quiet:

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

- Touch targets are at least 48px; most are 56–64px
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
| `icon.svg` | App icon |
| `manifest.webmanifest` | Makes it installable |

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

Your data never leaves the device. There is nowhere for it to go.
