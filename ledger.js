/*
 * ledger.js — the arithmetic behind accounts and the family ledger.
 *
 * Every function here is pure: it takes the data it needs and returns a number or a
 * plain object. No DOM, no localStorage, no DB. That is deliberate — app.js is one
 * 2,500-line IIFE with no seam in it, and the one thing in this app that must never be
 * quietly wrong is a number about money between relatives. Pure functions can be handed
 * a fixed set of records in a thousand different orders and asserted identical.
 *
 * Money is integer paise throughout. Expenses are the exception — they predate this file
 * and carry float rupees in `amount` — so they are converted at the boundary, in one
 * place, and nowhere else.
 */
(function (root) {
  'use strict';

  var P = 100;                                    // paise per rupee

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function toPaise(rupees) { return Math.round(num(rupees) * P); }

  /**
   * The moment an account's history starts counting from.
   *
   * Just the anchor — and deliberately NOT clamped to the current time. An anchor dated in
   * the future does silence an account (everything real falls before the cutoff), but the
   * repair belongs in the gate that stores it, not here: clamping to "now" at read time
   * would set the cutoff to this very instant, which is later than every record there is,
   * and the account would go from silenced-forever to silenced-differently. See
   * normaliseAccount() in app.js, which clamps anchorTs on the way in and flags it.
   */
  function cutoff(acc) {
    return num(acc && acc.anchorTs);
  }

  /* ------------------------------------------------------------------ accounts --- */

  /**
   * What is in this account right now.
   *
   * Anchor + delta, not a running total. The account remembers a balance *as of a
   * moment* — "there is ₹5,000 in here, and I'm telling you that now" — and everything
   * dated after that moment moves it. Three things fall out of that choice:
   *
   *   - Setting up an account is one number, not a history.
   *   - Every expense that predates the anchor is irrelevant by construction, so there
   *     is no backfill, no migration, and no "unassigned" bucket to reason about.
   *   - Correcting a balance is a new anchor plus a visible `adjust` row for the gap,
   *     rather than an overwrite that hides where the drift came from.
   *
   * Money moving between two of your own accounts is a `xfer` and is NOT spending.
   * Money moving to or from a person is a ledger entry and is NOT spending either.
   * Only an expense is spending. Conflating any of these is how a balance goes wrong.
   */
  function balance(accId, data) {
    var accounts = (data && data.accounts) || [];
    var acc = null;
    for (var i = 0; i < accounts.length; i++) if (accounts[i].id === accId) { acc = accounts[i]; break; }
    if (!acc) return 0;

    var from = cutoff(acc);
    var total = num(acc.anchorPaise);

    var moves = (data && data.moves) || [];
    for (var m = 0; m < moves.length; m++) {
      var mv = moves[m];
      if (num(mv.ts) < from) continue;
      if (mv.kind === 'in'      && mv.acc === accId) total += num(mv.paise);
      else if (mv.kind === 'out'    && mv.acc === accId) total -= num(mv.paise);
      else if (mv.kind === 'adjust' && mv.acc === accId) total += num(mv.paise);   // signed
      else if (mv.kind === 'xfer') {
        if (mv.acc   === accId) total -= num(mv.paise);
        if (mv.toAcc === accId) total += num(mv.paise);
      }
    }

    var ledger = (data && data.ledger) || [];
    for (var l = 0; l < ledger.length; l++) {
      var en = ledger[l];
      if (en.voided || en.acc !== accId || num(en.ts) < from) continue;
      // Every kind counts here, gifts and vyavhar included: whether it created a debt
      // is a question about the *person*, not about whether the money left the drawer.
      total += (en.dir === 'in' ? 1 : -1) * num(en.paise);
    }

    var expenses = (data && data.expenses) || [];
    for (var e = 0; e < expenses.length; e++) {
      var ex = expenses[e];
      if (ex.acc !== accId || num(ex.ts) < from) continue;
      total -= toPaise(ex.amount);
    }

    return total;
  }

  /** Every non-archived account with its balance, in the order they were created. */
  function balances(data) {
    return ((data && data.accounts) || [])
      .filter(function (a) { return !a.archived; })
      .map(function (a) { return { id: a.id, name: a.name, kind: a.kind, paise: balance(a.id, data), anchorTs: a.anchorTs }; });
  }

  /** Everything that touched this account since its anchor, newest first. */
  function accountHistory(accId, data) {
    var acc = null, accounts = (data && data.accounts) || [];
    for (var i = 0; i < accounts.length; i++) if (accounts[i].id === accId) { acc = accounts[i]; break; }
    if (!acc) return [];
    var from = cutoff(acc), out = [];

    ((data && data.moves) || []).forEach(function (mv) {
      /* A correction is stamped one millisecond BEFORE the anchor it belongs to, so that
         balance() does not apply it twice. That would also hide it from this list forever —
         and the whole point of writing the gap down is that somebody can go and look at it.
         So corrections are listed regardless of the cutoff; everything else obeys it. */
      if (mv.kind !== 'adjust' && num(mv.ts) < from) return;
      if (mv.kind === 'xfer') {
        if (mv.acc === accId)   out.push({ type: 'move', kind: 'xfer-out', ts: mv.ts, paise: -num(mv.paise), note: mv.note, ref: mv });
        if (mv.toAcc === accId) out.push({ type: 'move', kind: 'xfer-in',  ts: mv.ts, paise:  num(mv.paise), note: mv.note, ref: mv });
      } else if (mv.acc === accId) {
        var sign = (mv.kind === 'out') ? -1 : 1;                   // adjust is already signed
        out.push({ type: 'move', kind: mv.kind, ts: mv.ts, paise: (mv.kind === 'adjust' ? num(mv.paise) : sign * num(mv.paise)), note: mv.note, ref: mv });
      }
    });

    ((data && data.ledger) || []).forEach(function (en) {
      if (en.acc !== accId || num(en.ts) < from) return;
      /* Struck-out entries are LISTED, showing the amount they used to be, with `counts`
         false so the caller can cross them through. Hiding them made a balance move with no
         row to point at; showing them as ₹0 was no better, since a row reading zero cannot
         explain the ₹5,000 the balance just gained. The old figure, struck through, is the
         explanation. Callers must not sum a row whose `counts` is false. */
      out.push({ type: 'ledger', kind: en.kind, ts: en.ts,
                 paise: (en.dir === 'in' ? 1 : -1) * num(en.paise),
                 counts: !en.voided, note: en.note, ref: en });
    });

    ((data && data.expenses) || []).forEach(function (ex) {
      if (ex.acc !== accId || num(ex.ts) < from) return;
      out.push({ type: 'expense', kind: ex.catId, ts: ex.ts, paise: -toPaise(ex.amount), note: ex.note, ref: ex });
    });

    // Sorted by stamp, then by id, so equal stamps can never reorder between renders.
    return out.sort(function (a, b) {
      return (num(b.ts) - num(a.ts)) || String((b.ref && b.ref.id) || '').localeCompare(String((a.ref && a.ref.id) || ''));
    });
  }

  /* -------------------------------------------------------------- family ledger --- */

  // Only these create an obligation. A gift creates none. `unclear` is money that is
  // genuinely undecided — forcing it into one of the other two at the moment it moves
  // manufactures a disagreement that did not exist, so it is counted on its own.
  // `vyavhar` (shagun, neg, money to parents) is a real event and a real amount, and is
  // structurally not a debt in any direction — it never enters a net.
  var OBLIGATION = { loan: true, fund: true };

  /**
   * Is this entry still owed?
   *
   * A `fund` marked `fulfilled` is not. "I'll give you the money, you pay for it" creates an
   * obligation discharged by SPENDING it on the stated thing, not by money coming back — so
   * once the funder has recorded it as their own spending, they have had the value. Leaving
   * it in the net would charge the same ₹2,000 twice: once as their expense, once as a debt
   * their sister still owes them.
   */
  function owes(entry) {
    return !!(entry && OBLIGATION[entry.kind] && !entry.fulfilled);
  }

  /** How much of this entry has been settled by other entries pointing at it. */
  function settledAgainst(entryId, data) {
    var total = 0;
    ((data && data.ledger) || []).forEach(function (en) {
      if (en.voided || !en.settles) return;
      en.settles.forEach(function (s) { if (s.id === entryId) total += num(s.paise); });
    });
    return total;
  }

  /** What is still open on this entry. Never negative. */
  function remaining(entry, data) {
    if (!entry || entry.voided || !owes(entry)) return 0;
    return Math.max(0, num(entry.paise) - settledAgainst(entry.id, data));
  }

  /**
   * Where things stand with one person.
   *
   * `net` is positive when they owe you and negative when you owe them, and it is netted
   * ONLY within this pair — never across three people. Three-way "simplify debts" is
   * standard in splitting apps and wrong in a family: it invents a payment between two
   * relatives who never transacted, and throws away the note that made each debt legible.
   */
  function withPerson(personId, data) {
    var theyOwe = 0, youOwe = 0, undecidedOut = 0, undecidedIn = 0, given = 0, got = 0;

    ((data && data.ledger) || []).forEach(function (en) {
      if (en.voided || en.person !== personId) return;
      var p = num(en.paise);
      if (en.dir === 'out') given += p; else got += p;

      if (owes(en)) {
        var open = remaining(en, data);
        if (en.dir === 'out') theyOwe += open; else youOwe += open;
      } else if (en.kind === 'unclear') {
        if (en.dir === 'out') undecidedOut += p; else undecidedIn += p;
      }
      // gift, vyavhar, repay: never enter the net. repay's effect is already counted,
      // once, as a reduction of whatever it settles.
    });

    return {
      person: personId,
      net: theyOwe - youOwe,
      theyOwe: theyOwe,
      youOwe: youOwe,
      undecidedOut: undecidedOut,
      undecidedIn: undecidedIn,
      given: given,
      got: got,
    };
  }

  /** Everyone with anything at all recorded, most recently active first. */
  function everyone(data) {
    return ((data && data.people) || [])
      .filter(function (p) { return !p.archived; })
      .map(function (p) {
        var st = withPerson(p.id, data);
        st.name = p.name;
        st.lastTs = 0;
        ((data && data.ledger) || []).forEach(function (en) {
          if (!en.voided && en.person === p.id && num(en.ts) > st.lastTs) st.lastTs = num(en.ts);
        });
        return st;
      })
      .sort(function (a, b) { return b.lastTs - a.lastTs; });
  }

  /**
   * Money of yours that is sitting with somebody else — "paisa kya rokayela che".
   * Oldest first, because age is the whole point of the question.
   */
  function parked(data) {
    var names = {};
    ((data && data.people) || []).forEach(function (p) { names[p.id] = p.name; });

    return ((data && data.ledger) || [])
      .filter(function (en) { return !en.voided && en.dir === 'out' && owes(en) && remaining(en, data) > 0; })
      .map(function (en) {
        return { id: en.id, person: en.person, name: names[en.person] || '', paise: remaining(en, data),
                 full: num(en.paise), note: en.note, kind: en.kind, ts: en.ts };
      })
      .sort(function (a, b) { return num(a.ts) - num(b.ts); });
  }

  /** Total still out there, across everyone. */
  function parkedTotal(data) {
    return parked(data).reduce(function (s, x) { return s + x.paise; }, 0);
  }

  /**
   * How a settle-up would actually work, as arithmetic rather than a verdict. The caller
   * renders the sentence; this returns the parts. "You're square" is a conclusion the two
   * people get to draw themselves — the app's job is to show the working.
   */
  function settleUp(personId, data) {
    var st = withPerson(personId, data);
    var cancels = Math.min(st.theyOwe, st.youOwe);
    return {
      theyOwe: st.theyOwe,
      youOwe: st.youOwe,
      cancels: cancels,
      // positive: they pay you. negative: you pay them.
      payment: st.theyOwe - st.youOwe,
    };
  }

  root.Ledger = {
    balance: balance,
    balances: balances,
    accountHistory: accountHistory,
    withPerson: withPerson,
    everyone: everyone,
    parked: parked,
    parkedTotal: parkedTotal,
    remaining: remaining,
    settledAgainst: settledAgainst,
    settleUp: settleUp,
    toPaise: toPaise,
    cutoff: cutoff,
    OBLIGATION: OBLIGATION,
    owes: owes,
  };

})(typeof self !== 'undefined' ? self : this);
