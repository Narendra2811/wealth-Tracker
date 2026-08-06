/* =========================================================
   Hisaab — your money, at a glance
   Zero dependencies. Zero build. Data stays on this device.
   ========================================================= */
(function () {
  'use strict';

  /* ===================== categories ===================== */
  const CATS = [
    // `short` must always be a shortening of `name`, never a different word — the same
    // expense appearing as "Travel" in one place and "Transport" in another reads as
    // two separate things to anyone not already fluent in the app.
    { id:'food',      name:'Food & Drink', short:'Food',      icon:'i-food',      light:'#C4441F', dark:'#F0714C' },
    { id:'grocery',   name:'Groceries',    short:'Groceries', icon:'i-grocery',   light:'#347C39', dark:'#55B15A' },
    { id:'transport', name:'Transport',    short:'Transport', icon:'i-transport', light:'#2570BE', dark:'#4E9BEE' },
    { id:'shopping',  name:'Shopping',     short:'Shopping',  icon:'i-shopping',  light:'#7B57D9', dark:'#9B7BEE' },
    { id:'bills',     name:'Bills',        short:'Bills',   icon:'i-bills',     light:'#0C7C7C', dark:'#26AAAA' },
    { id:'health',    name:'Health',       short:'Health',  icon:'i-health',    light:'#C43D61', dark:'#EC6088' },
    { id:'fun',       name:'Fun',          short:'Fun',     icon:'i-fun',       light:'#956600', dark:'#EFAA33' },
    { id:'home',      name:'Home',         short:'Home',    icon:'i-home',      light:'#9A6238', dark:'#C08554' },
    { id:'gifts',     name:'Gifts',        short:'Gifts',   icon:'i-gift',      light:'#B94A8B', dark:'#EB79BC' },
    { id:'other',     name:'Other',        short:'Other',   icon:'i-other',     light:'#646B78', dark:'#98A0AD' },
  ];
  const CAT = {}; CATS.forEach(c => CAT[c.id] = c);
  const catOf = id => CAT[id] || CAT.other;

  let IS_DARK = false;
  function computeDark() {
    const t = document.documentElement.dataset.theme;
    IS_DARK = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  const cc = id => (IS_DARK ? catOf(id).dark : catOf(id).light);
  function rgba(hex, a) {
    const h = hex.replace('#',''); const n = parseInt(h, 16);
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
  }
  const cvars = id => `--c:${cc(id)};--c-soft:${rgba(cc(id), IS_DARK ? .17 : .12)}`;

  /* ===================== utils ===================== */
  const $  = (s, r) => (r||document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r||document).querySelectorAll(s));
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const sum = a => a.reduce((s,x) => s+x, 0);
  const esc = s => String(s==null?'':s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const uid = () => 'e' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);

  /* ---- hard limits. Anything outside these is corruption or an attack, not a spend ---- */
  const MAX_AMOUNT = 1e9;                        // ₹100 crore
  const MIN_TS = Date.UTC(2000, 0, 1);
  const maxTs = () => Date.now() + 2 * 86400000; // a little slack for a wrong device clock
  const ID_OK = /^[A-Za-z0-9_-]{1,40}$/;         // ids land in HTML attributes — keep them boring

  /** Trim, strip control characters, and cut on character boundaries, not bytes. */
  function clipText(v, max) {
    let s = String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
    if (!s) return '';
    let units;
    try {
      units = (typeof Intl !== 'undefined' && Intl.Segmenter)
        ? Array.from(new Intl.Segmenter().segment(s), x => x.segment)
        : Array.from(s);
    } catch (e) { units = Array.from(s); }
    const out = units.length <= max ? s : units.slice(0, max).join('').trim();
    // a single "character" can be an arbitrarily long ZWJ chain, so cap the raw
    // length too — otherwise 60 of them is megabytes
    return out.length > max * 12 ? Array.from(out).slice(0, max).join('') : out;
  }

  /**
   * The single gate every expense passes, whatever door it came in by — the keypad,
   * a restored backup, or whatever was already on disk. One gate, so the rules
   * can't drift apart between them.
   */
  function normaliseExpense(e) {
    if (!e || typeof e !== 'object') return null;
    const raw = Number(e.amount);
    if (!isFinite(raw) || raw <= 0 || raw > MAX_AMOUNT) return null;
    const amount = Math.round(raw * 100) / 100;
    if (amount <= 0) return null;              // rounds away to nothing — not a real spend
    const ts = Number(e.ts);
    if (!isFinite(ts) || ts < MIN_TS || ts > maxTs()) return null;
    if (isNaN(new Date(ts).getTime())) return null;
    return {
      id: (e.id != null && ID_OK.test(String(e.id))) ? String(e.id) : uid(),
      amount: amount,
      catId: CAT[e.catId] ? e.catId : 'other',
      note: clipText(e.note, 60),
      ts: ts,
    };
  }

  const nfInt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  const nfDec = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /** Nothing downstream should ever be able to render "₹∞" or "₹NaN". */
  const safeNum = n => { n = Number(n); return isFinite(n) ? n : 0; };

  function money(n, dec) {
    n = safeNum(n);
    const v = Math.abs(n) < 0.005 ? 0 : n;
    return '₹' + (dec ? nfDec : nfInt).format(dec ? v : Math.round(v));
  }
  function moneyHTML(n, dec) {
    n = safeNum(n);
    const v = Math.abs(n) < 0.005 ? 0 : n;
    return '<span class="cur">₹</span>' + (dec ? nfDec : nfInt).format(dec ? v : Math.round(v));
  }
  /**
   * Short form for tight spaces. Deliberately NOT "₹61k" — nobody writing hisaab in
   * India writes money that way, and hiding the real figure from someone who is good
   * with money but not with app jargon costs you their trust. Full grouped numbers up
   * to a lakh, then the units people actually use: L and Cr.
   */
  function compact(n) {
    n = Math.round(Math.abs(safeNum(n)));
    if (n >= 1e7) return '₹' + trim(n/1e7) + 'Cr';
    if (n >= 1e5) return '₹' + trim(n/1e5) + 'L';
    return '₹' + nfInt.format(n);
  }
  const trim = v => (v >= 10 ? Math.round(v) : Math.round(v*10)/10).toString();

  const DAYS  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const DAYS_S= ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const DAYS_1= ['S','M','T','W','T','F','S'];
  const MONS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONS_S= ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
  const p2 = n => String(n).padStart(2,'0');
  const dayKey = d => { const x = new Date(d); return x.getFullYear()+'-'+p2(x.getMonth()+1)+'-'+p2(x.getDate()); };
  const monKey = d => { const x = new Date(d); return x.getFullYear()+'-'+p2(x.getMonth()+1); };
  const daysInMonth = (y,m) => new Date(y, m+1, 0).getDate();
  const sameDay = (a,b) => dayKey(a) === dayKey(b);

  const validDate = d => { const x = new Date(d); return isNaN(x.getTime()) ? null : x; };

  function fmtTime(ts) {
    const d = validDate(ts); if (!d) return '—';
    let h = d.getHours(); const m = p2(d.getMinutes());
    const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
    return h + ':' + m + ' ' + ap;
  }
  function relDay(d) {
    if (!validDate(d)) return 'Unknown date';
    const t = startOfDay(new Date()), x = startOfDay(d);
    const diff = Math.round((t - x) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff === -1) return 'Tomorrow';
    return DAYS_S[x.getDay()] + ', ' + x.getDate() + ' ' + MONS_S[x.getMonth()];
  }
  function fullDate(d) {
    const x = validDate(d); if (!x) return 'Unknown date';
    return x.getDate() + ' ' + MONS[x.getMonth()] + ' ' + x.getFullYear();
  }
  const icon = (id, cls) => `<svg class="ic ${cls||''}" aria-hidden="true"><use href="#${id}"/></svg>`;

  /* ===================== store ===================== */
  const KEY = 'hisaab.v1';
  let memoryOnly = false;
  let storageIssue = null;          // 'blocked' | 'full' | 'recovered'
  const defaults = () => ({
    expenses: [], budget: 0, theme: 'auto', size: 'md',
    seeded: false, sample: false, dismissed: false,
    notRecurring: [],          // guesses the user has told us were wrong
    lastBackup: 0, nudgeUntil: 0,
  });
  let DB = defaults();

  /**
   * Two very different failures used to look the same here, and treating them
   * alike was a real hazard: unreadable *data* would permanently switch off
   * saving, so one bad write meant every expense after it was silently lost.
   * Unavailable storage is fatal; unreadable data is not — set it aside and move on.
   */
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); }
    catch (e) { memoryOnly = true; storageIssue = 'blocked'; return; }
    if (!raw) return;

    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      try {
        localStorage.setItem(KEY + '.damaged', raw);   // keep it, in case it's salvageable
        localStorage.removeItem(KEY);
        storageIssue = 'recovered';
      } catch (e) { memoryOnly = true; storageIssue = 'blocked'; }
      return;
    }

    DB = Object.assign(defaults(), parsed);
    if (sanitise()) save();     // write the clean copy back so this happens once, not every load
  }

  /**
   * Whatever was on disk, make it something the rest of the app can trust.
   * Returns true if anything had to be repaired.
   */
  function sanitise() {
    const snapshot = JSON.stringify([DB.expenses, DB.budget, DB.theme, DB.size, DB.notRecurring]);
    if (!Array.isArray(DB.expenses)) DB.expenses = [];
    const before = DB.expenses.length;
    DB.expenses = DB.expenses.map(normaliseExpense).filter(Boolean);
    // ids must be unique — a duplicate would make edit and delete hit the wrong row
    const seen = new Set();
    DB.expenses.forEach(e => { if (seen.has(e.id)) e.id = uid(); seen.add(e.id); });
    if (DB.expenses.length !== before) storageIssue = storageIssue || 'recovered';

    if (!Array.isArray(DB.notRecurring)) DB.notRecurring = [];
    DB.budget = isFinite(Number(DB.budget)) && Number(DB.budget) > 0 ? Math.round(Number(DB.budget)) : 0;
    if (['auto','light','dark'].indexOf(DB.theme) < 0) DB.theme = 'auto';
    if (['md','lg','xl'].indexOf(DB.size) < 0) DB.size = 'md';

    return JSON.stringify([DB.expenses, DB.budget, DB.theme, DB.size, DB.notRecurring]) !== snapshot;
  }
  let rev = 0;                       // bumped on every write; invalidates derived values
  function save() {
    rev++;
    if (memoryOnly) return;
    try { localStorage.setItem(KEY, JSON.stringify(DB)); }
    catch (e) {
      memoryOnly = true;
      storageIssue = (e && (e.name === 'QuotaExceededError' || e.code === 22)) ? 'full' : 'blocked';
    }
  }

  /**
   * Derived figures — recurring bills, insights, the typical day — are pure functions
   * of the expense list, but a single render asks for them several times over.
   * Cache per revision so a long history doesn't get re-crunched on every paint.
   */
  const memo = new Map();
  function cached(key, fn) {
    const k = rev + '|' + key;
    if (memo.has(k)) return memo.get(k);
    if (memo.size > 80) memo.clear();
    const v = fn();
    memo.set(k, v);
    return v;
  }

  /* ===================== sample data ===================== */
  // [label, typical low, typical high] — a chai should cost what a chai costs.
  const NOTES = {
    food: [['Chai & samosa',25,70],['Lunch at office',90,220],['Swiggy dinner',250,650],['Street pav bhaji',60,140],
           ['Filter coffee',30,90],['Dinner with friends',400,1400],['Ice cream',50,180],['Poha breakfast',30,80],
           ['Vada pav',20,50],['Thali at Anand',120,260]],
    grocery: [['Vegetables',120,400],['Milk & eggs',60,180],['BigBasket order',700,2200],['Rice & dal',400,900],
              ['Seasonal fruits',150,450],['Kirana store',200,700],['Atta & oil',300,750],['Dry fruits',400,1200]],
    transport: [['Auto to office',40,120],['Petrol',400,1500],['Metro recharge',200,500],['Uber ride',120,450],
                ['Bus pass',30,90],['Parking',20,80],['Rapido',50,150],['Train ticket',150,900]],
    shopping: [['Cotton shirt',500,1600],['Running shoes',1800,4500],['Phone cover',200,600],['Amazon order',300,2500],
               ['Kurta',600,1800],['Headphones',900,3500],['Bedsheet',500,1500],['Sunglasses',400,1800]],
    bills: [['Mobile recharge',239,799],['Gas cylinder',850,1150],['Water bill',150,400],
            ['DTH recharge',300,700],['Society maintenance',1200,2500]],
    health: [['Medicines',80,600],['Doctor visit',300,800],['Gym fee',800,2000],['Blood test',400,1500],
             ['Vitamins',250,700],['Dentist',500,2500],['Physio session',400,900]],
    fun: [['Movie tickets',200,700],['Netflix',199,649],['Cricket match',500,2500],['Board game night',200,600],
          ['Spotify',119,199],['Concert',1000,4000],['Bowling',300,800],['Amusement park',600,2000]],
    home: [['Plumber',200,900],['Cleaning supplies',150,500],['Cushion covers',400,1200],
           ['Curtains',800,2500],['Pest control',800,1800]],
    gifts: [['Birthday gift',500,2000],['Wedding gift',1000,3000],['Diwali sweets',400,1200],
            ['Toy for niece',300,900],['Flowers',150,500],['Rakhi gift',300,900]],
    other: [['Donation',100,1000],['Bank charges',20,300],['Stationery',50,300],['Photocopy',10,60],
            ['Courier',60,250],['Misc',50,400]],
  };
  const HOURS = {
    food:[8,13,16,20], grocery:[10,18,19], transport:[9,14,19], shopping:[13,17,20], bills:[11,16,21],
    health:[10,12,18], fun:[15,19,21], home:[10,12,17], gifts:[13,18,19], other:[11,15,17],
  };
  const WEIGHTS = [
    ['food',30],['transport',17],['grocery',11],['other',8],['fun',7],
    ['shopping',7],['health',5],['bills',5],['gifts',3],['home',2],
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function sampleData() {
    const rnd = mulberry32(20260804);
    const pick = arr => arr[Math.floor(rnd() * arr.length)];
    const wpick = () => {
      const total = sum(WEIGHTS.map(w => w[1]));
      let r = rnd() * total;
      for (const [id, w] of WEIGHTS) { if ((r -= w) <= 0) return id; }
      return 'other';
    };
    const out = [];
    const today = startOfDay(new Date());
    const START = 104;

    for (let i = START; i >= 0; i--) {
      const day = addDays(today, -i);
      const dow = day.getDay();
      const weekend = dow === 0 || dow === 6;

      // fixed monthly outgoings, paid on the salary cycle
      if (day.getDate() === 25) push(day, 'home', 'Rent', 16500 + Math.round(rnd()*6)*250, 11);
      if (day.getDate() === 26) push(day, 'home', 'House help', 3000, 9);
      if (day.getDate() === 8)  push(day, 'bills', 'Electricity bill', 720 + Math.round(rnd()*1400), 19);
      if (day.getDate() === 12) push(day, 'bills', 'Broadband', 799, 20);

      let n = weekend ? 2 + Math.floor(rnd()*4) : 1 + Math.floor(rnd()*4);
      if (rnd() < 0.07) n = 0;                       // an occasional quiet day
      if (i < 1 && new Date().getHours() < 14) n = Math.min(n, 2);

      for (let k = 0; k < n; k++) {
        const id = wpick();
        const [label, lo, hi] = pick(NOTES[id]);
        const skew = Math.pow(rnd(), 1.6);            // most spends sit at the cheap end
        let amt = lo + skew * (hi - lo);
        if (weekend && (id === 'food' || id === 'fun')) amt *= 1.35;
        amt = amt < 100 ? Math.round(amt) : Math.round(amt / 5) * 5;
        push(day, id, label, amt, pick(HOURS[id]));
      }
    }
    function push(day, catId, note, amount, hour) {
      const d = new Date(day);
      d.setHours(hour, Math.floor(rnd()*60), 0, 0);
      if (d.getTime() > Date.now()) d.setTime(Date.now() - Math.floor(rnd()*3600000));
      out.push({ id: uid(), amount, catId, note, ts: d.getTime() });
    }
    return out.sort((a,b) => a.ts - b.ts);
  }

  /* ===================== analytics ===================== */
  const all = () => DB.expenses;
  const sorted = () => cached('sorted', () => all().slice().sort((a,b) => b.ts - a.ts));

  function inRange(from, to) { return all().filter(e => e.ts >= from && e.ts < to); }
  function ofDay(d) { const s = startOfDay(d).getTime(); return inRange(s, s + 86400000); }
  function totalOfDay(d) { return sum(ofDay(d).map(e => e.amount)); }

  function monthRange(y, m) { return [new Date(y,m,1).getTime(), new Date(y,m+1,1).getTime()]; }
  function thisMonth() { const n = new Date(); return monthRange(n.getFullYear(), n.getMonth()); }

  function periodRange(p) {
    const n = new Date();
    if (p === 'week') { const s = startOfDay(addDays(n, -6)).getTime(); return [s, n.getTime()+1]; }
    if (p === 'month') return thisMonth();
    return [0, n.getTime()+1];
  }

  function byCategory(list) {
    const m = new Map();
    list.forEach(e => m.set(e.catId, (m.get(e.catId)||0) + e.amount));
    return Array.from(m, ([catId, amount]) => ({ catId, amount })).sort((a,b) => b.amount - a.amount);
  }
  function countByCategory(list) {
    const m = new Map(); list.forEach(e => m.set(e.catId, (m.get(e.catId)||0)+1)); return m;
  }
  function dailyTotals(from, to) {
    const m = new Map();
    inRange(from, to).forEach(e => { const k = dayKey(e.ts); m.set(k, (m.get(k)||0) + e.amount); });
    return m;
  }
  function median(nums) {
    if (!nums.length) return 0;
    const s = nums.slice().sort((a,b) => a-b), h = Math.floor(s.length/2);
    return s.length % 2 ? s[h] : (s[h-1]+s[h])/2;
  }
  /** Typical daily spend across the last N days, ignoring no-spend days. */
  function typicalDay(days) {
    days = days || 30;
    return cached('typicalDay' + days, () => {
      const to = Date.now(), from = startOfDay(addDays(new Date(), -(days-1))).getTime();
      const vals = Array.from(dailyTotals(from, to).values()).filter(v => v > 0);
      return vals.length ? median(vals) : 0;
    });
  }
  function last7() {
    const out = [];
    for (let i = 6; i >= 0; i--) { const d = addDays(new Date(), -i); out.push({ date: d, amount: totalOfDay(d) }); }
    return out;
  }
  function monthToDate(y, m, throughDay) {
    const from = new Date(y, m, 1).getTime();
    const to = new Date(y, m, throughDay + 1).getTime();
    return sum(inRange(from, Math.min(to, new Date(y, m+1, 1).getTime())).map(e => e.amount));
  }

  const noteKey = e => e.catId + '|' + String(e.note || '').trim().toLowerCase();

  /**
   * Bills that come back every month — rent, broadband, the gym.
   * Nothing is declared upfront; this reads them out of your own history:
   * seen at least three times, spaced roughly a month apart, at an amount
   * that doesn't wander wildly. Anything less certain is left alone.
   */
  function detectRecurring() { return cached('recurring', detectRecurringRaw); }

  function detectRecurringRaw() {
    const from = startOfDay(addDays(new Date(), -200)).getTime();
    const groups = new Map();
    inRange(from, Date.now() + 1).forEach(e => {
      if (!String(e.note || '').trim()) return;      // an unlabelled spend can't be recognised again
      const k = noteKey(e);
      const g = groups.get(k) || { key: k, catId: e.catId, note: e.note, items: [] };
      g.items.push(e);
      groups.set(k, g);
    });

    const out = [];
    groups.forEach(g => {
      if (g.items.length < 3) return;
      const items = g.items.slice().sort((a,b) => a.ts - b.ts);

      if ((DB.notRecurring || []).indexOf(g.key) >= 0) return;   // user said this isn't one

      // every gap must look monthly — not just the average of them
      for (let i = 1; i < items.length; i++) {
        const gap = (items[i].ts - items[i-1].ts) / 86400000;
        if (gap < 26 || gap > 35) return;
      }

      // and it must land on roughly the same date each month. This is what separates
      // a real bill from three coffees that happened to fall a month apart.
      const days = items.map(i => new Date(i.ts).getDate());
      const dom = Math.round(median(days));
      if (days.some(d => Math.abs(d - dom) > 2)) return;

      const amounts = items.map(i => i.amount);
      const lo = Math.min.apply(null, amounts), hi = Math.max.apply(null, amounts);
      if (lo <= 0 || hi / lo > 3) return;            // too erratic to put a number on

      const last = items[items.length - 1];
      if (Date.now() - last.ts > 50 * 86400000) return;   // a subscription you've since dropped
      out.push({
        key: g.key, catId: g.catId, note: last.note,
        amount: median(amounts), varies: hi / lo > 1.25,
        dom: dom, lastTs: last.ts, n: items.length,
      });
    });
    return out.sort((a,b) => a.dom - b.dom);
  }

  /** Of those, the ones you haven't paid yet this month. */
  function upcoming() {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
    const dim = daysInMonth(y, m);
    const [mFrom, mTo] = thisMonth();
    const paid = new Set(inRange(mFrom, mTo).map(noteKey));
    return detectRecurring()
      .filter(r => !paid.has(r.key) && r.dom >= today)
      .map(r => {
        const date = new Date(y, m, Math.min(r.dom, dim));
        return Object.assign({}, r, { date: date, inDays: Math.round((startOfDay(date) - startOfDay(now)) / 86400000) });
      })
      .sort((a,b) => a.date - b.date);
  }

  /* ===================== visual components ===================== */

  /** Squarified treemap. Returns tiles with x/y/w/h in px. */
  function squarify(items, W, H) {
    const list = items.filter(i => i.value > 0);
    if (!list.length || W <= 0 || H <= 0) return [];
    const total = sum(list.map(i => i.value));
    const scale = (W * H) / total;
    let rest = list.map(i => Object.assign({}, i, { area: i.value * scale }));
    let r = { x: 0, y: 0, w: W, h: H };
    const out = [];
    let guard = 0;

    const worst = (row, len) => {
      const s = sum(row.map(x => x.area));
      if (s <= 0 || len <= 0) return Infinity;
      const mx = Math.max.apply(null, row.map(x => x.area));
      const mn = Math.min.apply(null, row.map(x => x.area));
      return Math.max((len*len*mx)/(s*s), (s*s)/(len*len*mn));
    };

    while (rest.length && guard++ < 500) {
      const len = Math.min(r.w, r.h);
      if (len <= 0) break;
      let row = [rest[0]], i = 1;
      while (i < rest.length) {
        const next = row.concat([rest[i]]);
        if (worst(next, len) <= worst(row, len)) { row = next; i++; } else break;
      }
      const rowArea = sum(row.map(x => x.area));
      if (r.w >= r.h) {
        const rw = Math.min(rowArea / r.h, r.w);
        let y = r.y;
        row.forEach(it => {
          const h = it.area / rw;
          out.push(Object.assign({}, it, { x: r.x, y, w: rw, h }));
          y += h;
        });
        r = { x: r.x + rw, y: r.y, w: r.w - rw, h: r.h };
      } else {
        const rh = Math.min(rowArea / r.w, r.h);
        let x = r.x;
        row.forEach(it => {
          const w = it.area / rh;
          out.push(Object.assign({}, it, { x, y: r.y, w, h: rh }));
          x += w;
        });
        r = { x: r.x, y: r.y + rh, w: r.w, h: r.h - rh };
      }
      rest = rest.slice(row.length);
    }
    return out;
  }

  function paintTreemap(el) {
    const data = JSON.parse(el.dataset.tm || '[]');
    const rect = el.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    if (!W || !H) { treemapPending = true; return; }   // retry when the box gets a size
    const total = sum(data.map(d => d.amount)) || 1;
    const tiles = squarify(data.map(d => ({ catId: d.catId, value: d.amount })), W, H);
    const G = 3;
    el.innerHTML = tiles.map((t, i) => {
      const c = catOf(t.catId);
      const w = Math.max(t.w - G, 8), h = Math.max(t.h - G, 8);
      const area = w * h;
      const size = (w < 74 || h < 54 || area < 4200) ? 's' : (area < 11000 ? 'm' : 'l');
      const pct = Math.round(t.value / total * 100);
      const body = size === 's'
        ? icon(c.icon, 'tile__ic')
        : `${icon(c.icon, 'tile__ic')}
           <span class="tile__b">
             <span class="tile__n">${esc(c.name)}</span>
             <span class="tile__v money">${compact(t.value)}</span>
             ${size === 'l' ? `<span class="tile__p">${pct}% of spend</span>` : ''}
           </span>`;
      return `<button class="tile" data-sz="${size}" data-act="open-cat" data-cat="${c.id}"
        title="${esc(c.name)} · ${money(t.value)} · ${pct}%"
        aria-label="${esc(c.name)}: ${money(t.value)}, ${pct} percent of spending"
        style="left:${t.x + G/2}px;top:${t.y + G/2}px;width:${w}px;height:${h}px;--c:${cc(c.id)};transition-delay:${Math.min(i*45, 400)}ms">${body}</button>`;
    }).join('');
    void el.offsetHeight;
    $$('.tile', el).forEach(t => t.classList.add('in'));
  }

  function heroCard() {
    const today = new Date();
    const tToday = totalOfDay(today);
    const tYest  = totalOfDay(addDays(today, -1));
    const typ    = typicalDay(30);
    const week   = last7();
    const weekTotal = sum(week.map(d => d.amount));
    const avg7   = weekTotal / 7;

    let mood = 'steady', moodLabel = 'Steady day', moodIcon = 'i-clock';
    if (typ > 0) {
      if (tToday < typ * 0.62) { mood = 'calm';  moodLabel = 'Calm day';  moodIcon = 'i-leaf'; }
      else if (tToday > typ * 1.45) { mood = 'heavy'; moodLabel = 'Heavy day'; moodIcon = 'i-flame'; }
    }
    if (tToday === 0) { mood = 'calm'; moodLabel = 'Nothing spent'; moodIcon = 'i-leaf'; }

    // comparison vs yesterday
    let cmp = '';
    const d = tToday - tYest;
    if (tYest === 0 && tToday === 0) {
      cmp = `<span class="delta delta--flat">Same as yesterday</span>`;
    } else if (Math.abs(d) < 1) {
      cmp = `<span class="delta delta--flat">Same as yesterday</span>`;
    } else {
      const up = d > 0;
      // Alarm colours are for amounts that deserve alarm. Yesterday having no entries
      // at all, or a difference smaller than a cup of chai, is not news — showing
      // "+₹31" in warning red just teaches people to ignore the colour.
      const trivial = tYest === 0 || Math.abs(d) < Math.max(50, typ * 0.15);
      const tone = trivial ? 'flat' : (up ? 'up' : 'down');
      cmp = `<span class="delta delta--${tone}">${trivial ? '' : icon(up?'i-up':'i-down')}${money(Math.abs(d))}</span>
             <span class="cmp-note">${up ? 'more' : 'less'} than yesterday</span>`;
    }

    // 7-day rhythm.
    // A single rent-sized day would flatten the whole week into slivers, so the
    // scale caps just above the ordinary days and outliers get an "off the chart" caret.
    const vals = week.map(w => w.amount);
    const desc = vals.slice().sort((a,b) => b-a);
    const med7 = median(vals.filter(v => v > 0));
    let cap = desc[0];
    if (desc[0] > Math.max(desc[1] || 0, med7) * 2.4) {
      cap = Math.max(desc[1] || 0, med7 * 1.7, desc[0] * 0.3);
    }
    cap = Math.max(cap, 1);

    const bars = week.map(w => {
      const isToday = sameDay(w.date, today);
      const over = w.amount > cap * 1.02;
      const pct = clamp(w.amount / cap * 100, w.amount > 0 ? 9 : 0, 100);
      return `<button class="rbar ${over?'is-over':''}" data-today="${isToday?1:0}" data-empty="${w.amount?0:1}"
                data-act="open-day" data-day="${dayKey(w.date)}"
                aria-label="${relDay(w.date)}: ${w.amount ? money(w.amount) : 'nothing spent'}">
                <span class="rbar__val money" style="bottom:calc(${pct}% + 5px)">${w.amount ? compact(w.amount) : '—'}</span>
                <span class="rbar__fill" data-h="${pct}%"></span>
              </button>`;
    }).join('');
    const avgPct = clamp(avg7 / cap * 100, 0, 100);
    // three letters, not one — "T F S S M T W" is unreadable when two days share a letter
    const labels = week.map(w => `<span class="${sameDay(w.date, today)?'is-today':''}">${DAYS_S[w.date.getDay()]}</span>`).join('');

    // today's flow
    const todayCats = byCategory(ofDay(today));
    let flow;
    if (!todayCats.length) {
      flow = `<div class="hero__empty">${icon('i-leaf')}<p>No spending yet today. Your money is exactly where you left it.</p></div>`;
    } else {
      const tot = sum(todayCats.map(c => c.amount)) || 1;
      // With one category the bar is a full-width block of colour: it looks like a stuck
      // progress bar and says nothing the legend line below doesn't already say.
      flow = `<div class="flow">
        <div class="flow__label">Where today's money went</div>
        ${todayCats.length < 2 ? '' : `<div class="flow__bar" aria-hidden="true">${todayCats.map(c =>
          `<span class="flow__seg" style="--c:${cc(c.catId)}" data-w="${Math.max(c.amount/tot*100, 2)}%" title="${esc(catOf(c.catId).name)} ${money(c.amount)}"></span>`).join('')}</div>`}
        <div class="flow__keys">${todayCats.slice(0,5).map(c =>
          `<span class="fkey" style="--c:${cc(c.catId)}"><i></i>${esc(catOf(c.catId).short)} <b class="money">${money(c.amount)}</b></span>`).join('')}</div>
      </div>`;
    }

    return `<section class="hero rise" data-mood="${mood}" aria-label="Today's spending">
      <span class="hero__wash"></span>
      <div class="hero__top">
        <span class="eyebrow">Spent today</span>
        <span class="mood" data-mood="${mood}">${icon(moodIcon)}${moodLabel}</span>
      </div>
      <div class="hero__amount money"><span class="cur">₹</span><span data-count="${tToday}">0</span></div>
      ${all().length ? `<div class="hero__cmp">${cmp}</div>` : ''}
      ${weekTotal > 0 ? `<div class="rhythm">
        <div class="rhythm__plot">
          ${avgPct > 5 && avgPct < 97 ? `<span class="rhythm__avg" style="bottom:${avgPct}%"></span>` : ''}
          ${bars}
        </div>
        <div class="rhythm__labels">${labels}</div>
        <div class="rhythm__foot"><i></i>Last 7 days · daily average <b>${money(avg7)}</b></div>
      </div>` : ''}
      ${flow}
    </section>`;
  }

  function monthCard() {
    const now = new Date();
    const [mFrom, mTo] = thisMonth();
    const spent = sum(inRange(mFrom, mTo).map(e => e.amount));
    const dim = daysInMonth(now.getFullYear(), now.getMonth());
    const dayNo = now.getDate();
    const left = dim - dayNo;

    const lm = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lmSame = monthToDate(lm.getFullYear(), lm.getMonth(), Math.min(dayNo, daysInMonth(lm.getFullYear(), lm.getMonth())));
    const maxCmp = Math.max(spent, lmSame, 1);

    let budgetBlock;
    if (DB.budget > 0) {
      const pct = spent / DB.budget;
      const pacePct = dayNo / dim;
      const state = pct > 1 ? 'over' : (pct > pacePct * 1.08 ? 'watch' : 'ok');
      const remaining = DB.budget - spent;
      // "ahead of pace" sounds like praise; it means spending too fast.
      const verdict = state === 'over'
        ? `Over budget by ${money(Math.abs(remaining))}`
        : (state === 'watch' ? 'Spending faster than the month'
           : (pct > pacePct * 0.92 ? 'On track for the month' : 'Comfortably under budget'));
      const perDay = left > 0 && remaining > 0 ? `${money(remaining / left)} a day left for ${left} more ${left===1?'day':'days'}` : (left > 0 ? `${left} ${left===1?'day':'days'} left this month` : 'Last day of the month');
      budgetBlock = `<div class="budget" data-state="${state}">
        <div class="budget__meta">
          <span>Monthly budget</span>
          <b class="money">${money(spent)} of ${money(DB.budget)}</b>
        </div>
        <div class="budget__track" aria-hidden="true">
          <span class="budget__fill" data-w="${clamp(pct*100, 0, 100)}%"></span>
          <span class="budget__pace" data-label="today" style="left:${clamp(pacePct*100, 2, 98)}%"></span>
        </div>
        <div class="budget__foot">
          <span class="budget__verdict ${state}">${verdict}</span>
          <span class="cmp-note money">${perDay}</span>
        </div>
      </div>`;
    } else {
      budgetBlock = `<div class="set-budget">
        <p>Set a monthly budget to see if you're on pace.</p>
        <button class="btn btn--sm" data-act="go-settings">Set budget</button>
      </div>`;
    }

    return `<section class="card rise" style="animation-delay:.06s" aria-label="This month">
      <div class="month-row">
        <div>
          <span class="eyebrow">${MONS[now.getMonth()]} so far</span>
          <div class="month-amt money" style="margin-top:5px">${moneyHTML(spent)}</div>
        </div>
        <button class="link" data-act="go-insights">Insights ${icon('i-chev-right')}</button>
      </div>
      ${budgetBlock}
      <div class="cmp">
        <div class="cmp__row">
          <span class="cmp__k">Last month</span>
          <span class="cmp__t" aria-hidden="true"><span class="cmp__f" data-w="${lmSame/maxCmp*100}%"></span></span>
          <span class="cmp__v money">${compact(lmSame)}</span>
        </div>
        <div class="cmp__row is-now">
          <span class="cmp__k">This month</span>
          <span class="cmp__t" aria-hidden="true"><span class="cmp__f" data-w="${spent/maxCmp*100}%"></span></span>
          <span class="cmp__v money">${compact(spent)}</span>
        </div>
        <p class="cmp-note" style="margin-top:2px">${cmpSentence(spent, lmSame, dayNo)}</p>
      </div>
    </section>`;
  }

  function cmpSentence(now, before, dayNo) {
    const label = `by day ${dayNo}`;
    if (before === 0 && now === 0) return `Nothing recorded yet.`;
    if (before === 0) return `Nothing spent by this point last month.`;
    const d = now - before;
    const pct = Math.round(Math.abs(d) / before * 100);
    if (pct < 3) return `Almost identical to last month ${label}.`;
    return d > 0
      ? `${pct}% more than last month ${label}.`
      : `${pct}% less than last month ${label} — ${money(Math.abs(d))} saved.`;
  }

  function whereSection(period) {
    const [from, to] = periodRange(period);
    const list = inRange(from, to);
    const cats = byCategory(list);
    const total = sum(cats.map(c => c.amount));
    const counts = countByCategory(list);
    const pLabel = period === 'week' ? 'Last 7 days' : (period === 'month' ? 'This month' : 'All time');

    const segs = `<div class="seg" role="group" aria-label="Period">
      ${[['week','Week'],['month','Month'],['all','All']].map(([k,l]) =>
        `<button data-act="period" data-p="${k}" aria-pressed="${period===k}">${l}</button>`).join('')}
    </div>`;

    if (!cats.length) {
      return `<section class="sec rise" style="animation-delay:.12s">
        <div class="sec__head"><div><h2 class="sec__title">Where your money went</h2><div class="sec__sub">${pLabel}</div></div>${segs}</div>
        <div class="card"><div class="empty" style="padding:30px 20px">
          <span class="empty__ic">${icon('i-wallet')}</span>
          <span class="empty__t">Nothing here yet</span>
          <span class="empty__s">Add an expense and this fills with colour.</span>
        </div></div>
      </section>`;
    }

    const max = cats[0].amount;
    const rows = cats.map(c => {
      const cat = catOf(c.catId), n = counts.get(c.catId) || 0;
      return `<button class="rrow" data-act="open-cat" data-cat="${c.catId}">
        <span class="cat-ic" style="${cvars(c.catId)}">${icon(cat.icon)}</span>
        <span class="rrow__b">
          <span class="rrow__n">
            <span class="rrow__name">${esc(cat.name)}</span>
            <span class="rrow__meta">${Math.round(c.amount/total*100)}% · ${n} ${n===1?'time':'times'}</span>
          </span>
          <span class="rrow__t" aria-hidden="true"><span class="rrow__f" style="--c:${cc(c.catId)}" data-w="${c.amount/max*100}%"></span></span>
        </span>
        <span class="rrow__v money">${money(c.amount)}</span>
      </button>`;
    }).join('');

    return `<section class="sec rise" style="animation-delay:.12s">
      <div class="sec__head">
        <div><h2 class="sec__title">Where your money went</h2><div class="sec__sub">${pLabel} · ${money(total)}</div></div>
        ${segs}
      </div>
      <div class="tmap" data-tm='${JSON.stringify(cats)}' aria-label="Spending by category, sized by amount"></div>
      <div class="rank" style="margin-top:12px">${rows}</div>
      ${cats.length > 6 ? `<div style="text-align:center;margin-top:6px"><button class="link" data-act="go-history">See everything ${icon('i-chev-right')}</button></div>` : ''}
    </section>`;
  }

  function upcomingSection() {
    const list = upcoming();
    if (!list.length) return '';
    const total = sum(list.map(r => r.amount));
    const [mFrom, mTo] = thisMonth();
    const spent = sum(inRange(mFrom, mTo).map(e => e.amount));
    const free = DB.budget > 0 ? DB.budget - spent - total : null;

    return `<section class="sec rise" style="animation-delay:.15s">
      <div class="sec__head">
        <div><h2 class="sec__title">Still to come</h2>
          <div class="sec__sub">Bills that usually land later this month</div></div>
        <div style="text-align:right">
          <div class="eyebrow">Expected</div>
          <div class="money" style="font-size:1.05rem;font-weight:680;letter-spacing:-.03em">${money(total)}</div>
        </div>
      </div>
      <div class="card card--pad-0">
        ${list.slice(0, 4).map(r => {
          const cat = catOf(r.catId);
          const when = r.inDays === 0 ? 'today' : (r.inDays === 1 ? 'tomorrow' : `in ${r.inDays} days`);
          return `<button class="up" data-act="open-recurring" data-key="${esc(r.key)}">
            <span class="up__day"><b>${r.date.getDate()}</b><span>${MONS_S[r.date.getMonth()]}</span></span>
            <span class="cat-ic cat-ic--sm" style="${cvars(r.catId)}">${icon(cat.icon)}</span>
            <span class="up__b">
              <span class="up__n">${esc(r.note)}</span>
              <span class="up__s">${esc(cat.name)} · ${when}</span>
            </span>
            <span class="up__v money">${r.varies ? '≈' : ''}${money(r.amount)}</span>
          </button>`;
        }).join('')}
      </div>
      ${free !== null ? `<p class="cmp-note" style="margin:11px 4px 0">${
        free >= 0
          ? `That leaves about <b class="money">${money(free)}</b> of your budget free for everything else.`
          : `These would put you about <b class="money">${money(Math.abs(free))}</b> over budget.`
      }</p>` : ''}
    </section>`;
  }

  function biggestSection() {
    const [from, to] = thisMonth();
    const list = inRange(from, to);
    if (!list.length) return '';
    const top = list.slice().sort((a,b) => b.amount - a.amount)[0];
    // baseline off the last 60 days, not just this month — early in a month
    // there aren't enough expenses for a stable "typical".
    const base = inRange(startOfDay(addDays(new Date(), -59)).getTime(), Date.now()+1)
      .filter(e => e.id !== top.id).map(e => e.amount);
    const typ = median(base.length ? base : [top.amount]);
    const x = typ > 0 ? top.amount / typ : 1;
    const cat = catOf(top.catId);
    const xLine = x >= 25
      ? `In a league of its own — nothing else this month comes close.`
      : `That's <b>${trim(x)}×</b> your typical expense.`;

    return `<section class="sec rise" style="animation-delay:.18s">
      <div class="sec__head"><div><h2 class="sec__title">Biggest spend</h2><div class="sec__sub">${MONS[new Date().getMonth()]} so far</div></div></div>
      <button class="card" style="width:100%;text-align:left" data-act="open-exp" data-id="${esc(top.id)}">
        <div class="big">
          <span class="cat-ic cat-ic--lg" style="${cvars(top.catId)}">${icon(cat.icon)}</span>
          <span class="big__b">
            <span class="big__t">${esc(titleOf(top))}</span>
            <span class="big__s">${(noteOf(top) ? [esc(cat.name)] : []).concat([relDay(top.ts)]).join(' · ')}</span>
          </span>
          <span class="big__v money">${money(top.amount)}</span>
        </div>
        ${x >= 1.6 ? `<div class="big__x">${icon('i-trophy')}<p>${xLine}</p></div>` : ''}
      </button>
    </section>`;
  }

  /* ---------- insights engine ---------- */
  function buildInsights() { return cached('insights', buildInsightsRaw); }

  function buildInsightsRaw() {
    const now = new Date();
    const [mFrom, mTo] = thisMonth();
    const list = inRange(mFrom, mTo);
    const out = [];
    if (!list.length) return out;

    const total = sum(list.map(e => e.amount));
    const dayNo = now.getDate();
    const dim = daysInMonth(now.getFullYear(), now.getMonth());
    const cats = byCategory(list);
    const counts = countByCategory(list);

    // 1 — top category
    if (cats.length) {
      const c = cats[0], cat = catOf(c.catId);
      out.push({
        cat: c.catId, icon: cat.icon,
        h: `<b>${esc(cat.name)}</b> took the biggest share — ${money(c.amount)}.`,
        s: `That's ${Math.round(c.amount/total*100)}% of everything you spent this month.`,
      });
    }

    const dayMap = dailyTotals(mFrom, mTo);

    // 2 — weekend vs weekday, measured over 8 weeks so one odd Saturday can't swing it
    const we = [], wd = [];
    for (let i = 0; i < 56; i++) {
      const dt = addDays(new Date(), -i);
      const v = totalOfDay(dt);
      (dt.getDay() === 0 || dt.getDay() === 6 ? we : wd).push(v);
    }
    const weAvg = we.length ? sum(we)/we.length : 0;
    const wdAvg = wd.length ? sum(wd)/wd.length : 0;
    if (weAvg > 0 && wdAvg > 0 && all().length >= 20) {
      const r = weAvg / wdAvg;
      if (r >= 1.25) out.push({ cat:'fun', icon:'i-fun',
        h: `Weekends cost you <b>${trim(r)}×</b> a weekday.`,
        s: `About ${money(weAvg)} on a weekend day vs ${money(wdAvg)} on a weekday, over the last 8 weeks.` });
      else if (r <= 0.8) out.push({ cat:'grocery', icon:'i-leaf',
        h: `Your weekends are the <b>cheap</b> part of the week.`,
        s: `About ${money(weAvg)} on a weekend day vs ${money(wdAvg)} on a weekday, over the last 8 weeks.` });
    }

    // 3 — quiet days
    let quiet = 0;
    for (let d = 1; d <= dayNo; d++) {
      const dt = new Date(now.getFullYear(), now.getMonth(), d);
      if (!(dayMap.get(dayKey(dt)) > 0)) quiet++;
    }
    if (quiet >= 2) out.push({ cat:'grocery', icon:'i-leaf',
      h: `<b>${quiet} no-spend ${quiet===1?'day':'days'}</b> this month.`,
      s: `Days where nothing left your pocket at all.` });

    // 4 — small leaks
    const small = list.filter(e => e.amount <= 150);
    if (small.length >= 6) {
      const s = sum(small.map(e => e.amount));
      out.push({ cat:'food', icon:'i-repeat',
        h: `<b>${small.length} small spends</b> under ₹150 added up to ${money(s)}.`,
        s: `That's ${Math.round(s/total*100)}% of the month, ${money(s/small.length)} at a time.` });
    }

    // 5 — projection (needs at least a week before it means anything)
    if (dayNo >= 7 && dayNo < dim) {
      const perDay = total / dayNo;
      const proj = perDay * dim;
      out.push({ cat:'bills', icon:'i-bulb',
        h: `At ${money(perDay)} a day, ${MONS[now.getMonth()]} lands near <b>${money(proj)}</b>.`,
        s: `If the rest of the month looks like the first ${dayNo} days.` });
    }

    // 6 — most frequent category
    let topCount = null;
    counts.forEach((v, k) => { if (!topCount || v > topCount[1]) topCount = [k, v]; });
    if (topCount && topCount[1] >= 4) {
      const cat = catOf(topCount[0]);
      out.push({ cat: topCount[0], icon: cat.icon,
        h: `You reached for <b>${esc(cat.name)}</b> ${topCount[1]} times.`,
        s: `More often than any other category this month.` });
    }

    // 7 — busiest day
    let busy = null;
    dayMap.forEach((v, k) => { if (!busy || v > busy[1]) busy = [k, v]; });
    if (busy && busy[1] > 0) {
      const parts = busy[0].split('-');
      const dt = new Date(+parts[0], +parts[1]-1, +parts[2]);
      out.push({ cat:'shopping', icon:'i-flame',
        h: `<b>${DAYS[dt.getDay()]}, ${dt.getDate()} ${MONS_S[dt.getMonth()]}</b> was your heaviest day.`,
        s: `${money(busy[1])} across ${ofDay(dt).length} ${ofDay(dt).length===1?'expense':'expenses'}.` });
    }

    // 8 — vs last month
    const lm = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lmSame = monthToDate(lm.getFullYear(), lm.getMonth(), Math.min(dayNo, daysInMonth(lm.getFullYear(), lm.getMonth())));
    if (lmSame > 0) {
      const d = total - lmSame, pct = Math.round(Math.abs(d)/lmSame*100);
      if (pct >= 8) out.push({ cat: d > 0 ? 'health' : 'grocery', icon: d > 0 ? 'i-up' : 'i-down',
        h: `You're spending <b>${pct}% ${d>0?'more':'less'}</b> than last month.`,
        s: `${money(total)} so far vs ${money(lmSame)} by the same day in ${MONS[lm.getMonth()]}.` });
    }

    return out;
  }

  function insightCard(i) {
    return `<div class="ins" style="${cvars(i.cat)};--c2:${cc(i.cat)}">
      <span class="ins__ic">${icon(i.icon)}</span>
      <span class="ins__b"><span class="ins__h">${i.h}</span><span class="ins__s">${i.s}</span></span>
    </div>`;
  }

  /* ---------- calendar heat ---------- */
  function calendar(y, m) {
    const first = new Date(y, m, 1);
    const dim = daysInMonth(y, m);
    const lead = first.getDay();
    const [from, to] = monthRange(y, m);
    const map = dailyTotals(from, to);
    const vals = [];
    for (let d = 1; d <= dim; d++) { const v = map.get(dayKey(new Date(y,m,d))) || 0; if (v > 0) vals.push(v); }
    const s = vals.slice().sort((a,b) => a-b);
    const q = p => s.length ? s[clamp(Math.floor(s.length * p), 0, s.length-1)] : 0;
    const q1 = q(.25), q2 = q(.5), q3 = q(.78);
    const lvl = v => v <= 0 ? 0 : (v <= q1 ? 1 : (v <= q2 ? 2 : (v <= q3 ? 3 : 4)));
    const total = sum(vals);
    const today = new Date();

    let cells = '';
    for (let i = 0; i < lead; i++) cells += `<span class="cell cell--void in"></span>`;
    for (let d = 1; d <= dim; d++) {
      const dt = new Date(y, m, d);
      const v = map.get(dayKey(dt)) || 0;
      const future = dt > today && !sameDay(dt, today);
      cells += `<button class="cell ${future?'cell--future':''} ${sameDay(dt, today)?'is-today':''}" data-lvl="${future?0:lvl(v)}"
        data-act="open-day" data-day="${dayKey(dt)}" style="transition-delay:${Math.min(d*9,300)}ms"
        ${future?'tabindex="-1"':''}
        aria-label="${d} ${MONS_S[m]}: ${future ? 'still to come' : (v ? money(v) : 'nothing spent')}">
        <span class="cell__d">${d}</span>${v ? `<span class="cell__v money">${compact(v)}</span>` : ''}</button>`;
    }

    const canNext = (y < today.getFullYear()) || (y === today.getFullYear() && m < today.getMonth());
    return `<section class="sec rise">
      <div class="sec__head">
        <div><h2 class="sec__title">${MONS[m]} ${y}</h2><div class="sec__sub">${total ? money(total) + ' spent this month' : 'Nothing recorded'}</div></div>
        <div style="display:flex;gap:6px">
          <button class="iconbtn" data-act="cal" data-d="-1" aria-label="Previous month" style="transform:rotate(180deg)">${icon('i-chev-right')}</button>
          <button class="iconbtn" data-act="cal" data-d="1" aria-label="Next month" ${canNext?'':'disabled style="opacity:.35"'}>${icon('i-chev-right')}</button>
        </div>
      </div>
      <div class="card cal">
        <div class="cal__head">${DAYS_S.map(d => `<span>${d[0]}</span>`).join('')}</div>
        <div class="cal__grid">${cells}</div>
        <div class="cal__legend">
          <span>Less</span>
          <i style="background:var(--track)"></i><i style="background:var(--h1)"></i><i style="background:var(--h2)"></i><i style="background:var(--h3)"></i><i style="background:var(--h4)"></i>
          <span>More</span>
        </div>
      </div>
    </section>`;
  }

  /* ---------- weekday rhythm ---------- */
  function weekdaySection() {
    const from = startOfDay(addDays(new Date(), -55)).getTime();
    const list = inRange(from, Date.now()+1);
    if (list.length < 5) return '';
    const tot = [0,0,0,0,0,0,0], cnt = [0,0,0,0,0,0,0];
    const seen = new Set();
    for (let i = 0; i <= 55; i++) {
      const d = addDays(new Date(), -i);
      if (d.getTime() < from) break;
      const k = dayKey(d);
      if (!seen.has(k)) { seen.add(k); cnt[d.getDay()]++; }
    }
    list.forEach(e => { tot[new Date(e.ts).getDay()] += e.amount; });
    const avg = tot.map((t, i) => cnt[i] ? t / cnt[i] : 0);
    const order = [1,2,3,4,5,6,0];
    const max = Math.max.apply(null, avg.concat([1]));
    const topIdx = avg.indexOf(Math.max.apply(null, avg));

    return `<section class="sec rise" style="animation-delay:.06s">
      <div class="sec__head"><div><h2 class="sec__title">Your weekly rhythm</h2>
        <div class="sec__sub">Average spend per weekday, last 8 weeks</div></div></div>
      <div class="card"><div class="wk">
        ${order.map(i => `<div class="wk__row ${i===topIdx?'is-top':''}">
          <span class="wk__d">${DAYS_S[i]}</span>
          <span class="wk__t" aria-hidden="true"><span class="wk__f" data-w="${avg[i]/max*100}%"></span></span>
          <span class="wk__v money">${money(avg[i])}</span>
        </div>`).join('')}
      </div>
      <p class="cmp-note" style="margin-top:14px">${DAYS[topIdx]} is your heaviest day — about ${money(avg[topIdx])} on average.</p>
      </div>
    </section>`;
  }

  /**
   * The long view. Every other screen answers "this month" or "this week";
   * this is the only one that shows whether the whole thing is drifting up or down.
   * Partial months are marked rather than quietly drawn as low bars.
   */
  function yearSection() {
    const first = all().length ? Math.min.apply(null, all().map(e => e.ts)) : 0;
    if (!first) return '';
    const firstDate = new Date(first);
    const now = new Date();

    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      if (d < new Date(firstDate.getFullYear(), firstDate.getMonth(), 1)) continue;
      const [f, t] = monthRange(d.getFullYear(), d.getMonth());
      // a month is partial if our records start mid-way through it, or it's still running
      const startsLate = d.getFullYear() === firstDate.getFullYear()
        && d.getMonth() === firstDate.getMonth() && firstDate.getDate() > 3;
      const isNow = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      months.push({
        label: MONS_S[d.getMonth()], year: d.getFullYear(),
        amount: sum(inRange(f, t).map(e => e.amount)),
        partial: startsLate || isNow, isNow: isNow,
      });
    }
    if (months.length < 3) return '';

    const complete = months.filter(m => !m.partial && m.amount > 0);
    if (!complete.length) return '';
    const avg = sum(complete.map(m => m.amount)) / complete.length;
    const max = Math.max.apply(null, months.map(m => m.amount).concat([1]));
    const avgPct = clamp(avg / max * 100, 0, 100);

    // read the direction from complete months only
    let verdict = '';
    if (complete.length >= 4) {
      const half = Math.floor(complete.length / 2);
      const older = complete.slice(0, half), newer = complete.slice(complete.length - half);
      const a = sum(older.map(m => m.amount)) / older.length;
      const b = sum(newer.map(m => m.amount)) / newer.length;
      const pct = a > 0 ? Math.round((b - a) / a * 100) : 0;
      verdict = Math.abs(pct) < 6
        ? `Your months are holding steady at around ${money(avg)}.`
        : (pct > 0
            ? `Recent months run about <b>${pct}% higher</b> than your earlier ones.`
            : `Recent months run about <b>${Math.abs(pct)}% lower</b> than your earlier ones.`);
    } else {
      const top = complete.slice().sort((x,y) => y.amount - x.amount)[0];
      verdict = `${top.label} was your biggest full month at <b class="money">${money(top.amount)}</b>.`;
    }

    return `<section class="sec rise">
      <div class="sec__head"><div><h2 class="sec__title">Month by month</h2>
        <div class="sec__sub">${complete.length} full ${complete.length===1?'month':'months'} · average ${money(avg)}</div></div></div>
      <div class="card">
        <div class="year" aria-hidden="true">
          ${avgPct > 6 && avgPct < 96 ? `<span class="year__avg" style="bottom:${avgPct}%"><i></i></span>` : ''}
          ${months.map(m => `<div class="year__col">
            <span class="year__v money">${m.amount ? compact(m.amount) : '—'}</span>
            <span class="year__track"><span class="year__bar ${m.isNow?'is-now':''} ${m.partial?'is-partial':''}" data-h="${m.amount/max*100}%"></span></span>
            <span class="year__l">${m.label}</span>
          </div>`).join('')}
        </div>
        <p class="sr-only">${months.map(m => `${m.label}: ${money(m.amount)}${m.partial ? ' (partial)' : ''}`).join('. ')}</p>
        <div class="year__foot">
          <span class="year__legend"><i class="is-partial"></i>part of a month</span>
          <span class="year__legend"><i class="is-avg"></i>average ${money(avg)}</span>
        </div>
        <p class="cmp-note" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">${verdict}</p>
      </div>
    </section>`;
  }

  /**
   * The split most people never see: how much of a month is already committed
   * before they decide anything, and how much is actually theirs to steer.
   */
  function lockedInSection() {
    const bills = detectRecurring();
    if (!bills.length) return '';
    const fixed = sum(bills.map(b => b.amount));

    const now = new Date(), months = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const [f, t] = monthRange(d.getFullYear(), d.getMonth());
      const v = sum(inRange(f, t).map(e => e.amount));
      if (v > 0) months.push(v);
    }
    if (!months.length) return '';

    const typical = sum(months) / months.length;
    const flexible = Math.max(typical - fixed, 0);
    const total = fixed + flexible || 1;
    const pct = Math.round(fixed / total * 100);
    const ord = n => { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };

    return `<section class="sec rise" style="animation-delay:.09s">
      <div class="sec__head"><div><h2 class="sec__title">What's locked in</h2>
        <div class="sec__sub">Of a typical ${money(typical)} month, over the last ${months.length} ${months.length===1?'month':'months'}</div></div></div>
      <div class="card">
        <div class="split" aria-hidden="true">
          <span class="split__seg split__seg--fixed" data-w="${fixed/total*100}%"></span>
          <span class="split__seg split__seg--flex" data-w="${flexible/total*100}%"></span>
        </div>
        <div class="split__keys">
          <div class="split__key"><i class="is-fixed"></i>
            <b class="money">${money(fixed)}</b><span>locked in · ${pct}%</span></div>
          <div class="split__key"><i class="is-flex"></i>
            <b class="money">${money(flexible)}</b><span>yours to steer · ${100-pct}%</span></div>
        </div>
        <p class="cmp-note" style="margin-top:16px;padding-top:15px;border-top:1px solid var(--line)">
          ${bills.length} ${bills.length===1?'bill repeats':'bills repeat'} every month, whatever else you do.
        </p>
        <div style="margin-top:12px">
          ${bills.map(b => {
            const cat = catOf(b.catId);
            return `<button class="up" style="padding:11px 0;grid-template-columns:34px 1fr auto"
              data-act="open-recurring" data-key="${esc(b.key)}">
              <span class="cat-ic cat-ic--sm" style="${cvars(b.catId)}">${icon(cat.icon)}</span>
              <span class="up__b">
                <span class="up__n">${esc(b.note)}</span>
                <span class="up__s">around the ${ord(b.dom)} · ${esc(cat.name)}</span>
              </span>
              <span class="up__v money">${b.varies ? '≈' : ''}${money(b.amount)}</span>
            </button>`;
          }).join('')}
        </div>
      </div>
    </section>`;
  }

  /* ---------- month over month by category ---------- */
  function shiftSection() {
    const now = new Date();
    const dayNo = now.getDate();
    const [tFrom] = thisMonth();
    const tTo = new Date(now.getFullYear(), now.getMonth(), dayNo + 1).getTime();
    const lm = new Date(now.getFullYear(), now.getMonth()-1, 1);
    const lDim = daysInMonth(lm.getFullYear(), lm.getMonth());
    const lFrom = new Date(lm.getFullYear(), lm.getMonth(), 1).getTime();
    const lTo = new Date(lm.getFullYear(), lm.getMonth(), Math.min(dayNo, lDim) + 1).getTime();

    const A = new Map(byCategory(inRange(lFrom, lTo)).map(c => [c.catId, c.amount]));
    const B = new Map(byCategory(inRange(tFrom, tTo)).map(c => [c.catId, c.amount]));
    const ids = Array.from(new Set(Array.from(A.keys()).concat(Array.from(B.keys()))));
    if (!ids.length) return '';
    const rows = ids.map(id => ({ id, a: A.get(id)||0, b: B.get(id)||0 }))
      .sort((x,y) => Math.abs(y.b-y.a) - Math.abs(x.b-x.a)).slice(0, 6);
    const max = Math.max.apply(null, rows.map(r => Math.max(r.a, r.b)).concat([1]));

    return `<section class="sec rise" style="animation-delay:.12s">
      <div class="sec__head"><div><h2 class="sec__title">What changed</h2>
        <div class="sec__sub">${MONS_S[lm.getMonth()]} vs ${MONS_S[now.getMonth()]}, both to day ${dayNo}</div></div></div>
      <div class="card"><div class="shift">
        ${rows.map(r => {
          const cat = catOf(r.id), d = r.b - r.a;
          const pct = r.a > 0 ? Math.round(Math.abs(d)/r.a*100) : null;
          const cls = Math.abs(d) < 1 ? 'flat' : (d > 0 ? 'up' : 'down');
          const badge = cls === 'flat'
            ? `<span class="delta delta--flat">same</span>`
            : `<span class="delta delta--${cls}">${icon(d>0?'i-up':'i-down')}${compact(Math.abs(d))}${pct!==null&&pct<400?` · ${pct}%`:''}</span>`;
          return `<div class="shift__row" style="${cvars(r.id)}">
            <span class="cat-ic cat-ic--sm" >${icon(cat.icon)}</span>
            <span class="shift__b">
              <span class="shift__n">${esc(cat.name)}</span>
              <span class="shift__bars" aria-hidden="true">
                <span class="shift__bar" data-w="${r.a/max*100}%" title="Last month ${money(r.a)}"></span>
                <span class="shift__bar now" data-w="${r.b/max*100}%" title="This month ${money(r.b)}"></span>
              </span>
            </span>
            ${badge}
          </div>`;
        }).join('')}
      </div>
      <p class="cmp-note" style="margin-top:12px">Faded bar = last month · solid bar = this month</p>
      </div>
    </section>`;
  }

  /* ===================== views ===================== */
  const S = {
    view: 'home', period: 'month', filterCat: null, query: '',
    cal: { y: new Date().getFullYear(), m: new Date().getMonth() },
    limit: 120, editing: null, draft: null, newId: null, lastDeleted: null, confirmErase: false,
  };

  function greeting() {
    const h = new Date().getHours();
    if (h < 5)  return 'Still up';
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    if (h < 21) return 'Good evening';
    return 'Good night';
  }

  /**
   * Everything lives in one browser and nowhere else. That's the privacy promise,
   * but it's also the risk — so say so plainly when storage is broken, and nudge
   * (quietly, occasionally) once there's enough history to be worth losing.
   */
  function safetyBanner() {
    if (memoryOnly) {
      const full = storageIssue === 'full';
      return `<div class="banner banner--warn rise">
        ${icon('i-warn')}
        <div class="banner__b">
          <div class="banner__t">${full ? 'This browser is out of space' : "This browser isn't saving anything"}</div>
          <div class="banner__s">${full
            ? 'There\'s no room left to store new expenses, so anything you add now will be lost when you close this tab. Export a backup, then clear some site data.'
            : 'Storage is blocked here, so expenses you add will disappear when you close this tab. Private or incognito browsing usually causes this — try a normal window.'}</div>
          <div class="banner__a">
            <button class="btn btn--sm btn--primary" data-act="export-json">${icon('i-download')}Export what's here</button>
          </div>
        </div>
      </div>`;
    }

    if (storageIssue === 'recovered' && !DB.recoveryAck) {
      return `<div class="banner rise">
        ${icon('i-shield')}
        <div class="banner__b">
          <div class="banner__t">Recovered from damaged data</div>
          <div class="banner__s">Some saved data couldn't be read, so Hisaab set it aside and carried on. Saving is working normally again — but do check your history looks right.</div>
          <div class="banner__a">
            <button class="btn btn--sm btn--primary" data-act="ack-recovery">${icon('i-check')}Got it</button>
          </div>
        </div>
      </div>`;
    }

    const n = all().length;
    const never = !DB.lastBackup;
    const stale = DB.lastBackup && (Date.now() - DB.lastBackup) > 90 * 86400000;
    const snoozed = DB.nudgeUntil && Date.now() < DB.nudgeUntil;
    // no point nagging anyone to back up the demo data
    if (DB.sample || n < 30 || snoozed || (!never && !stale)) return '';

    const span = fmtRange(all());
    return `<div class="banner rise">
      ${icon('i-shield')}
      <div class="banner__b">
        <div class="banner__t">${never ? 'No backup yet' : 'Your backup is getting old'}</div>
        <div class="banner__s">${n} expenses${span ? ' — ' + esc(span) : ''} live only in this browser. Clearing your browsing data would take them with it.</div>
        <div class="banner__a">
          <button class="btn btn--sm btn--primary" data-act="export-json">${icon('i-download')}Save a backup</button>
          <button class="btn btn--sm btn--ghost" data-act="snooze-nudge">Not now</button>
        </div>
      </div>
    </div>`;
  }

  function sampleBanner() {
    if (!DB.sample || DB.dismissed) return '';
    // One line. A disclaimer should not be the largest thing on a money app's first
    // screen — ignoring it already *is* "keep exploring", so that button earned nothing.
    return `<div class="banner banner--slim rise">
      ${icon('i-sparkle')}
      <div class="banner__b"><div class="banner__t">These are sample expenses, not yours</div></div>
      <button class="btn btn--sm btn--primary" data-act="fresh">Start fresh</button>
      <button class="iconbtn iconbtn--sm" data-act="dismiss" aria-label="Hide this message">${icon('i-close')}</button>
    </div>`;
  }

  function viewHome() {
    const recent = sorted().slice(0, 4);
    const ins = buildInsights();
    const pick = ins.length ? ins[new Date().getDate() % ins.length] : null;

    // Nothing tracked at all: one clear invitation beats five empty cards.
    if (!all().length) {
      return `
        <div class="greet rise">
          <h1 class="greet__hi">${greeting()}</h1>
          <div class="greet__date">${DAYS[new Date().getDay()]}, ${fullDate(new Date())}</div>
        </div>
        <div class="stack rise" style="margin-top:14px">${heroCard()}</div>
        <section class="sec rise" style="animation-delay:.1s">
          <div class="card" style="padding:30px 22px">
            <div class="empty" style="padding:0">
              <span class="empty__ic">${icon('i-wallet')}</span>
              <span class="empty__t">Nothing tracked yet</span>
              <span class="empty__s">Add your first expense and Hisaab starts showing you where your money actually goes.</span>
              <button class="btn btn--primary btn--lg" style="margin-top:20px;width:100%" data-act="add">
                ${icon('i-plus')}Add an expense
              </button>
              <button class="link" style="margin-top:10px" data-act="load-sample">Or explore with sample data</button>
            </div>
          </div>
        </section>
        <p class="foot">Everything stays on this device.<br><b>Hisaab</b> — your money, at a glance.</p>
      `;
    }

    return safetyBanner() + sampleBanner() + `
      <div class="greet rise">
        <h1 class="greet__hi">${greeting()}</h1>
        <div class="greet__date">${DAYS[new Date().getDay()]}, ${fullDate(new Date())}</div>
      </div>
      <div class="stack" style="margin-top:14px">
        ${heroCard()}
        ${monthCard()}
      </div>
      ${upcomingSection()}
      ${whereSection(S.period)}
      ${biggestSection()}
      ${pick ? `<section class="sec rise" style="animation-delay:.22s">
        <div class="sec__head"><div><h2 class="sec__title">Worth noticing</h2></div>
          <button class="link" data-act="go-insights">More ${icon('i-chev-right')}</button></div>
        ${insightCard(pick)}
      </section>` : ''}
      ${recent.length ? `<section class="sec rise" style="animation-delay:.26s">
        <div class="sec__head"><div><h2 class="sec__title">Latest</h2></div>
          <button class="link" data-act="go-history">All expenses ${icon('i-chev-right')}</button></div>
        <div>${recent.map(itemRow).join('')}</div>
      </section>` : ''}
      <p class="foot">Everything stays on this device.<br><b>Hisaab</b> — your money, at a glance.</p>
    `;
  }

  function viewInsights() {
    if (!all().length) return emptyState('No insights yet', 'Add a few expenses and Hisaab will start noticing patterns for you.');
    const ins = buildInsights();
    const now = new Date();
    return `
      <div class="greet rise">
        <h1 class="greet__hi">Insights</h1>
        <div class="greet__date">Your spending patterns over time</div>
      </div>
      ${yearSection()}
      ${calendar(S.cal.y, S.cal.m)}
      ${lockedInSection()}
      ${weekdaySection()}
      ${shiftSection()}
      ${ins.length ? `<section class="sec rise" style="animation-delay:.18s">
        <div class="sec__head"><div><h2 class="sec__title">Patterns</h2>
          <div class="sec__sub">${MONS[now.getMonth()]} ${now.getFullYear()}</div></div></div>
        <div class="ins-grid">${ins.map(insightCard).join('')}</div>
      </section>` : ''}
      <p class="foot">Patterns update as you add expenses.</p>
    `;
  }

  /** An untitled expense is named by its category — don't then repeat it underneath. */
  const noteOf = e => String(e.note == null ? '' : e.note).trim();   // "   " is not a title
  const titleOf = e => noteOf(e) || catOf(e.catId).name;
  const subOf = (e, tail) => {
    const bits = noteOf(e) ? [esc(catOf(e.catId).name)] : [];
    return bits.concat(tail).join('<i></i>');
  };

  function itemRow(e) {
    const cat = catOf(e.catId);
    return `<button class="item ${S.newId===e.id?'is-new':''}" data-act="open-exp" data-id="${esc(e.id)}">
      <span class="cat-ic" style="${cvars(e.catId)}">${icon(cat.icon)}</span>
      <span class="item__b">
        <span class="item__t">${esc(titleOf(e))}</span>
        <span class="item__s">${subOf(e, [fmtTime(e.ts)])}</span>
      </span>
      <span class="item__v money">${money(e.amount)}</span>
    </button>`;
  }

  function viewHistory() {
    const q = S.query.trim().toLowerCase();
    let list = sorted();
    if (S.filterCat) list = list.filter(e => e.catId === S.filterCat);
    if (q) {
      const digits = q.replace(/[^0-9]/g, '');        // so "₹500" and "500" both work
      list = list.filter(e =>
        (e.note || '').toLowerCase().indexOf(q) >= 0 ||
        catOf(e.catId).name.toLowerCase().indexOf(q) >= 0 ||
        (digits.length > 0 && String(Math.round(e.amount)).indexOf(digits) >= 0));
    }

    const chips = `<div class="chips">
      <button class="chip" data-act="filter-cat" data-cat="" aria-pressed="${!S.filterCat}">All</button>
      ${CATS.map(c => `<button class="chip" data-act="filter-cat" data-cat="${c.id}" aria-pressed="${S.filterCat===c.id}" style="--c:${cc(c.id)}">${icon(c.icon)}${esc(c.short)}</button>`).join('')}
    </div>`;

    const head = `
      <div class="greet rise">
        <h1 class="greet__hi">History</h1>
        <div class="greet__date">${list.length} ${list.length===1?'expense':'expenses'} · ${money(sum(list.map(e=>e.amount)))} spent in total</div>
      </div>
      <div class="stack rise" style="margin-top:14px">
        <label class="searchbar">${icon('i-search')}
          <input id="q" type="search" placeholder="Search notes, categories or amounts" value="${esc(S.query)}" autocomplete="off">
        </label>
        ${chips}
      </div>`;

    if (!list.length) {
      return head + emptyState(all().length ? 'No matches' : 'Nothing tracked yet',
        all().length ? 'Try a different search, or pick another category.' : 'Tap the + button below to add your first expense.');
    }

    const shown = list.slice(0, S.limit);

    // group in one pass — days in order, months keyed for their running totals
    const days = [];
    const dayIndex = new Map();
    const monthTotals = new Map();
    shown.forEach(e => {
      const dk = dayKey(e.ts), mk = monKey(e.ts);
      monthTotals.set(mk, (monthTotals.get(mk) || 0) + e.amount);
      let g = dayIndex.get(dk);
      if (!g) { g = { dk: dk, mk: mk, ts: e.ts, items: [], total: 0 }; dayIndex.set(dk, g); days.push(g); }
      g.items.push(e); g.total += e.amount;
    });

    let html = '', lastMon = '';
    days.forEach(g => {
      if (g.mk !== lastMon) {
        lastMon = g.mk;
        const d = new Date(g.ts);
        html += `<div class="month-sep"><span class="month-sep__t">${MONS[d.getMonth()]} ${d.getFullYear()}</span>
          <span class="month-sep__l"></span><span class="month-sep__v money">${money(monthTotals.get(g.mk))}</span></div>`;
      }
      const cats = byCategory(g.items);
      // One card per day with hairline dividers, not one card per expense. A list of
      // 283 rows should read as a ledger, not as 283 floating tiles.
      html += `<section class="day">
        <div class="day__head">
          <span class="day__l"><span class="day__t">${relDay(g.ts)}</span><span class="day__w">${g.items.length} ${g.items.length===1?'expense':'expenses'}</span></span>
          <span class="day__v money">${money(g.total)}</span>
        </div>
        <div class="daycard">
          <div class="day__mini" aria-hidden="true">${cats.map(c => `<i style="--c:${cc(c.catId)};flex:${Math.max(c.amount,1)}"></i>`).join('')}</div>
          ${g.items.map(itemRow).join('')}
        </div>
      </section>`;
    });

    const more = list.length > S.limit
      ? `<div style="text-align:center;margin-top:22px"><button class="btn btn--ghost" data-act="more">Show ${Math.min(120, list.length - S.limit)} more</button></div>` : '';

    return head + `<div style="margin-top:20px">${html}</div>` + more +
      `<p class="foot">${list.length} of ${all().length} expenses shown.</p>`;
  }

  function viewSettings() {
    const themes = [['auto','Auto'],['light','Light'],['dark','Dark']];
    return `
      <div class="greet rise">
        <h1 class="greet__hi">Settings</h1>
        <div class="greet__date">Make Hisaab yours</div>
      </div>

      <section class="sec rise">
        <div class="sec__head"><h2 class="sec__title">Appearance</h2></div>
        <div class="list">
          <div class="li">
            <span class="li__b"><span class="li__t">Theme</span><span class="li__s">Follows your device</span></span>
            <span class="seg" role="group" aria-label="Theme">${themes.map(([k,l]) => `<button data-act="theme" data-v="${k}" aria-pressed="${DB.theme===k}">${l}</button>`).join('')}</span>
          </div>
          <div class="li">
            <span class="li__b"><span class="li__t">Text size</span><span class="li__s">Bigger text, everywhere</span></span>
            <span class="sizepick" role="group" aria-label="Text size">${[['md','A'],['lg','A'],['xl','A']].map(([k,l]) => `<button data-act="size" data-v="${k}" aria-pressed="${DB.size===k}" aria-label="${({md:'Normal',lg:'Large',xl:'Extra large'})[k]} text">${l}</button>`).join('')}</span>
          </div>
        </div>
      </section>

      <section class="sec rise" style="animation-delay:.06s">
        <div class="sec__head"><div><h2 class="sec__title">Monthly budget</h2>
          <div class="sec__sub">Optional. Set one and Hisaab shows whether you are spending too fast for the date.</div></div></div>
        <div class="list"><div class="li">
          <span class="li__b"><span class="li__t">Monthly budget</span><span class="li__s">${DB.budget>0?'Leave empty to turn it off':'Not set yet'}</span></span>
          <label class="budgetinput"><span>₹</span><input id="budget" type="number" aria-label="Monthly budget in rupees" inputmode="numeric" min="0" step="500" value="${DB.budget||''}" placeholder="0"></label>
        </div></div>
      </section>

      <section class="sec rise" style="animation-delay:.12s">
        <div class="sec__head"><div><h2 class="sec__title">Your data</h2>
          <div class="sec__sub">${all().length} ${all().length===1?'expense':'expenses'} stored on this device${memoryOnly?' (this session only — storage is blocked)':''}</div></div></div>
        <div class="list">
          <button class="li li--btn" data-act="export-csv"><span class="li__b"><span class="li__t">Save as a spreadsheet</span><span class="li__s">Opens in Excel, Numbers or Sheets (a CSV file)</span></span>${icon('i-download')}</button>
          <button class="li li--btn" data-act="export-json"><span class="li__b"><span class="li__t">Save a full backup</span><span class="li__s">A complete copy of everything, to keep somewhere safe</span></span>${icon('i-download')}</button>
          <button class="li li--btn" data-act="import"><span class="li__b"><span class="li__t">Restore from a backup</span><span class="li__s">Bring back a copy you saved earlier</span></span>${icon('i-repeat')}</button>
          <button class="li li--btn" data-act="load-sample"><span class="li__b"><span class="li__t">Load sample data</span><span class="li__s">Replaces everything with three months of examples</span></span>${icon('i-sparkle')}</button>
          <button class="li li--btn li--danger" data-act="erase"><span class="li__b"><span class="li__t">${S.confirmErase ? 'Tap again to erase everything' : 'Erase everything'}</span><span class="li__s">${S.confirmErase ? 'This cannot be undone' : 'Deletes every expense on this device'}</span></span>${icon('i-trash')}</button>
        </div>
      </section>

      <section class="sec rise" style="animation-delay:.18s">
        <div class="sec__head"><div><h2 class="sec__title">Keyboard</h2>
          <div class="sec__sub">If you're on a laptop</div></div></div>
        <div class="list"><div class="li" style="display:block">
          <div class="keys">
            ${[['N','New expense'],['1 – 4','Switch tabs'],['0 – 9','Type an amount'],
               ['Enter','Save'],['Esc','Close']].map(([k,l]) =>
              `<div class="keys__row"><kbd>${k}</kbd><span>${l}</span></div>`).join('')}
          </div>
        </div></div>
      </section>

      <p class="foot"><b>Hisaab</b> · v1.1<br>No accounts, no servers, no tracking.<br>Your money is nobody else's business.</p>
    `;
  }

  function emptyState(t, s) {
    return `<div class="empty rise"><span class="empty__ic">${icon('i-wallet')}</span>
      <span class="empty__t">${esc(t)}</span><span class="empty__s">${esc(s)}</span></div>`;
  }

  /* ===================== render ===================== */
  const viewEl = $('#view'), topRight = $('#topbarRight');

  /** Tells a screen reader which screen it just landed on. */
  const liveRegion = document.createElement('p');
  liveRegion.className = 'sr-only';
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('role', 'status');
  document.body.appendChild(liveRegion);
  let lastAnnounced = '';
  function announce(msg) {
    if (!msg || msg === lastAnnounced) return;
    lastAnnounced = msg;
    liveRegion.textContent = msg;
  }

  /**
   * Remember which control the keyboard was on. Re-rendering replaces the whole view,
   * which destroyed the focused element and dropped focus to <body> — so changing the
   * theme or text size with the keyboard threw you back to the top of the page, and
   * those are exactly the controls someone with low vision reaches for first.
   */
  function focusKey(el) {
    if (!el || !viewEl.contains(el) || !el.dataset || !el.dataset.act) return null;
    const d = el.dataset;
    return '[data-act="' + d.act + '"]'
      + (d.v != null ? '[data-v="' + d.v + '"]' : '')
      + (d.p != null ? '[data-p="' + d.p + '"]' : '')
      + (d.cat != null ? '[data-cat="' + d.cat + '"]' : '');
  }

  function render(keepScroll) {
    computeDark();
    const y = keepScroll ? window.scrollY : null;
    const refocus = focusKey(document.activeElement);
    const map = { home: viewHome, insights: viewInsights, history: viewHistory, settings: viewSettings };
    viewEl.innerHTML = (map[S.view] || viewHome)();
    if (refocus) {
      const again = viewEl.querySelector(refocus);
      if (again) again.focus({ preventScroll: true });
    }

    // topbar mini-total
    // the month total is stated in full on Home and Insights already; repeating it in
    // the header made the same figure appear three times on one screen
    topRight.innerHTML = '';

    $$('.tab').forEach(b => {
      if (b.dataset.nav === S.view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
    });
    announce({ home:'Home', insights:'Insights', history:'History', settings:'Settings' }[S.view] || '');

    enhance();
    if (y != null) window.scrollTo(0, y);
    S.newId = null;
  }

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Runs after every render: grows the bars, counts up the numbers, lays out treemaps.
   * Everything here is synchronous on purpose — requestAnimationFrame never fires while
   * the tab is hidden, which used to leave bars at zero and treemaps blank.
   */
  function enhance(root) {
    root = root || viewEl;
    void root.offsetHeight;                         // commit the 0-width starting state
    $$('[data-w]', root).forEach(el => { el.style.width = el.dataset.w; });
    $$('[data-h]', root).forEach(el => { el.style.height = el.dataset.h; });
    $$('.cell', root).forEach(el => el.classList.add('in'));
    $$('[data-count]', root).forEach(el => countUp(el, +el.dataset.count));
    mountTreemaps(root);
  }

  /**
   * The treemap is the one thing laid out in pixels, so it needs real dimensions to
   * exist. Measured while the container is 0px wide — a background tab, a collapsed
   * pane, a parent mid-transition — it draws nothing and would stay blank forever.
   *
   * Recovery deliberately hangs off plain DOM events rather than ResizeObserver or
   * requestAnimationFrame: both are delivered by the frame loop, and a window that
   * isn't producing frames never delivers them. Testing found an environment where
   * a freshly created ResizeObserver never fired once. Events always arrive.
   */
  let treemapPending = false;

  function mountTreemaps(root) {
    $$('.tmap', root).forEach(paintTreemap);
    if (tmObserver) {
      tmObserver.disconnect();                      // drop detached nodes from the last render
      $$('.tmap', document).forEach(el => tmObserver.observe(el));
    }
  }

  /** Cheap no-op unless a treemap actually failed to measure. */
  function repaintPendingTreemaps() {
    if (!treemapPending) return;
    treemapPending = false;
    $$('.tmap', document).forEach(paintTreemap);
  }

  const tmObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(entries => entries.forEach(en => {
        const r = en.target.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) paintTreemap(en.target);
      }))
    : null;

  window.addEventListener('resize', repaintPendingTreemaps);
  window.addEventListener('orientationchange', repaintPendingTreemaps);
  window.addEventListener('pageshow', repaintPendingTreemaps);
  document.addEventListener('visibilitychange', repaintPendingTreemaps);
  document.addEventListener('pointerdown', repaintPendingTreemaps, true);
  document.addEventListener('scroll', repaintPendingTreemaps, { passive: true, capture: true });

  function countUp(el, to) {
    const settle = () => { el.textContent = nfInt.format(Math.round(to)); };
    if (reducedMotion() || document.hidden) return settle();
    const dur = 780, t0 = performance.now();
    (function step(now) {
      const p = clamp((now - t0) / dur, 0, 1);
      if (p >= 1) return settle();
      el.textContent = nfInt.format(Math.round(to * (1 - Math.pow(1 - p, 4))));
      requestAnimationFrame(step);
    })(t0);
  }

  // repaint on resize regardless — the layout is pixel-based, so a new width means new tiles
  let tmT;
  window.addEventListener('resize', () => {
    clearTimeout(tmT);
    tmT = setTimeout(() => $$('.tmap', document).forEach(paintTreemap), 140);
  });

  /* ===================== sheets ===================== */
  const scrim = $('#scrim'), sheet = $('#sheet'), fab = $('#fab');
  let sheetOpen = null, returnFocus = null;
  const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function openSheet(kind, html, onMount) {
    const wasOpen = !!sheetOpen;                  // swapping content, not opening afresh
    if (!sheetOpen) returnFocus = document.activeElement;
    sheet.innerHTML = `<span class="sheet__grip"></span>` + html;
    sheet.hidden = false; scrim.hidden = false;
    document.body.classList.add('no-scroll');
    sheetOpen = kind;
    const title = sheet.querySelector('.sheet__title');
    sheet.setAttribute('aria-label', title ? title.textContent : 'Panel');
    if (kind === 'add') fab.classList.add('is-open');
    requestAnimationFrame(() => { scrim.classList.add('in'); sheet.classList.add('in'); });
    if (onMount) onMount();
    enhance(sheet);
    // focus the dialog itself rather than a control, so Enter doesn't fire something
    sheet.focus({ preventScroll: true });
    // one history entry per sheet, so Back (or the Android gesture) closes it
    if (!navLock && ownsHistory && !wasOpen) {
      history.pushState({ view: S.view, sheet: kind }, '', location.hash || '#' + S.view);
    }
  }

  function closeSheet(fromPop) {
    if (!sheetOpen) return;
    const hadHistoryEntry = ownsHistory && !fromPop && !navLock && history.state && history.state.sheet;
    sheetOpen = null; S.editing = null; S.draft = null; S.pendingImport = null;
    fab.classList.remove('is-open');
    scrim.classList.remove('in'); sheet.classList.remove('in');
    sheet.style.transform = '';
    document.body.classList.remove('no-scroll');
    if (returnFocus && document.contains(returnFocus) && returnFocus.focus) {
      returnFocus.focus({ preventScroll: true });
    }
    returnFocus = null;
    setTimeout(() => { if (!sheetOpen) { sheet.hidden = true; scrim.hidden = true; sheet.innerHTML = ''; } }, 380);
    if (hadHistoryEntry) history.back();               // consume the entry the sheet pushed
  }

  /* Drag the sheet down by its grip or header to dismiss it. Bottom-sheet layouts
     only — on wide screens the sheet is a centred dialog and this would fight it. */
  (function dragToDismiss() {
    let y0 = 0, dy = 0, active = false;
    const isSheetLayout = () => window.matchMedia('(max-width:699px)').matches;

    sheet.addEventListener('touchstart', ev => {
      if (!isSheetLayout() || !ev.target.closest('.sheet__grip, .sheet__head')) return;
      if (ev.target.closest('button')) return;                 // let the close button be a button
      y0 = ev.touches[0].clientY; dy = 0; active = true;
      sheet.style.transition = 'none';
    }, { passive: true });

    sheet.addEventListener('touchmove', ev => {
      if (!active) return;
      dy = Math.max(0, ev.touches[0].clientY - y0);
      sheet.style.transform = 'translate(-50%,' + dy + 'px)';
    }, { passive: true });

    const end = () => {
      if (!active) return;
      active = false;
      sheet.style.transition = '';
      sheet.style.transform = '';
      if (dy > 110) closeSheet();
    };
    sheet.addEventListener('touchend', end);
    sheet.addEventListener('touchcancel', end);
  })();

  /** Keeps Tab inside the open dialog. */
  function trapTab(ev) {
    const items = $$(FOCUSABLE, sheet).filter(el => el.tabIndex >= 0 && el.offsetParent !== null);
    if (!items.length) { ev.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey && (active === first || active === sheet)) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && active === last) { ev.preventDefault(); first.focus(); }
  }

  /* ---------- add / edit ---------- */
  /**
   * Things you buy again and again. Grouped by what it was rather than the exact
   * paise, and capped at ₹5,000 — quick-add is for the chai and the auto ride,
   * not for rent, which nobody needs a shortcut to remember.
   */
  function quickPicks() {
    const from = startOfDay(addDays(new Date(), -60)).getTime();
    const m = new Map();
    inRange(from, Date.now()+1).forEach(e => {
      if (e.amount > 5000) return;
      const k = e.catId + '|' + (e.note||'').trim().toLowerCase();
      const cur = m.get(k) || { catId: e.catId, note: e.note, amounts: [], n: 0, last: 0 };
      cur.amounts.push(e.amount);
      cur.n++;
      if (e.ts > cur.last) { cur.last = e.ts; cur.note = e.note; }
      m.set(k, cur);
    });
    return Array.from(m.values())
      .filter(x => x.n >= 2)
      .map(x => ({ catId: x.catId, note: x.note, n: x.n, last: x.last, amount: Math.round(median(x.amounts)) }))
      .filter(x => x.amount > 0)
      .sort((a,b) => (b.n - a.n) || (b.last - a.last))
      .slice(0, 6);
  }

  function openAdd(existing, prefill) {
    S.editing = existing || null;
    const d = existing
      ? { amount: String(existing.amount), catId: existing.catId, note: existing.note || '', date: dayKey(existing.ts), ts: existing.ts }
      : { amount: prefill ? String(prefill.amount) : '', catId: prefill ? prefill.catId : null,
          note: prefill ? (prefill.note || '') : '', date: dayKey(new Date()), ts: null };
    S.draft = d;
    const picks = existing ? [] : quickPicks();

    openSheet('add', `
      <div class="sheet__head">
        <h2 class="sheet__title">${existing ? 'Edit expense' : 'New expense'}</h2>
        <button class="iconbtn" data-act="close" aria-label="Close">${icon('i-close')}</button>
      </div>
      <div class="sheet__body">
        <div class="amt is-zero" id="amtDisp" role="status" aria-live="polite" aria-atomic="true" aria-label="Amount entered"><span class="cur">₹</span><span id="amtVal">0</span><span class="amt__caret"></span></div>

        ${picks.length ? `<div class="quick" id="quick">${picks.map((p,i) => {
          const c = catOf(p.catId);
          return `<button class="qchip" data-act="quick" data-i="${i}">
            <span class="cat-ic cat-ic--sm" style="${cvars(p.catId)}">${icon(c.icon)}</span>
            <span class="qchip__t"><b class="qchip__a money">${money(p.amount)}</b><span class="qchip__n">${esc(p.note || c.name)}</span></span>
          </button>`; }).join('')}</div>` : ''}

        <span class="lbl">Category</span>
        <div class="catgrid" id="catgrid">
          ${CATS.map(c => `<button class="catbtn" data-act="cat" data-cat="${c.id}" aria-pressed="${d.catId===c.id}" style="${cvars(c.id)}">
            ${icon(c.icon)}<span>${esc(c.short)}</span></button>`).join('')}
        </div>

        <span class="lbl">Details</span>
        <div class="metarow">
          <input class="noteinput" id="note" type="text" aria-label="What the expense was for" placeholder="What was it for? (optional)" value="${esc(d.note)}" maxlength="60" autocomplete="off">
        </div>
        <div class="metarow" style="margin-top:8px">
          <div class="seg">
            <button data-act="date" data-v="today" aria-pressed="${d.date===dayKey(new Date())}">Today</button>
            <button data-act="date" data-v="yest" aria-pressed="${d.date===dayKey(addDays(new Date(),-1))}">Yesterday</button>
          </div>
          <input class="noteinput" id="date" type="date" aria-label="Date of this expense" value="${d.date}" max="${dayKey(new Date())}" style="max-width:170px">
        </div>
        <div style="height:8px"></div>
      </div>
      <div class="sheet__foot">
        <div class="pad">
          ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="key" data-act="k" data-k="${n}">${n}</button>`).join('')}
          <button class="key key--fn" data-act="k" data-k=".">.</button>
          <button class="key" data-act="k" data-k="0">0</button>
          <button class="key key--fn" data-act="k" data-k="del" aria-label="Delete">${icon('i-back')}</button>
        </div>
        <button class="btn btn--primary btn--lg btn--block" id="saveBtn" style="margin-top:11px" data-act="save" disabled>
          ${icon('i-check')}${existing ? 'Save changes' : 'Add expense'}
        </button>
      </div>
    `, () => { paintAmount(); syncSave(); });
  }

  function paintAmount() {
    const disp = $('#amtDisp'), val = $('#amtVal');
    if (!disp) return;
    const s = S.draft.amount;
    disp.classList.toggle('is-zero', !s || +s === 0);
    if (!s) { val.textContent = '0'; return; }
    const parts = s.split('.');
    const int = parts[0] === '' ? '0' : nfInt.format(+parts[0]);
    val.textContent = int + (parts.length > 1 ? '.' + parts[1] : '');
  }
  function syncSave() {
    const b = $('#saveBtn'); if (!b) return;
    b.disabled = !(parseFloat(S.draft.amount) > 0 && S.draft.catId);
  }
  function pressKey(k) {
    const d = S.draft; if (!d) return;
    if (k === 'del') d.amount = d.amount.slice(0, -1);
    else if (k === '.') { if (d.amount.indexOf('.') < 0) d.amount = (d.amount || '0') + '.'; }
    else {
      const parts = d.amount.split('.');
      if (parts[1] && parts[1].length >= 2) return;
      if (parts[0].replace(/^0+/, '').length >= 7 && parts.length === 1) return;
      d.amount = (d.amount === '0' ? '' : d.amount) + k;
    }
    paintAmount(); syncSave();
  }
  function commitSave() {
    const d = S.draft;
    if (!d) return;                       // a second tap landing after the sheet already closed
    const amount = Math.round(parseFloat(d.amount) * 100) / 100;
    if (!(amount > 0) || !d.catId || amount > MAX_AMOUNT) return;
    const btn = $('#saveBtn'); if (btn) btn.disabled = true;
    const note = ($('#note') && $('#note').value || '').trim();
    const dateStr = ($('#date') && $('#date').value) || d.date;
    const parts = dateStr.split('-').map(Number);
    let ts;
    const isToday = dateStr === dayKey(new Date());
    if (S.editing && dayKey(S.editing.ts) === dateStr) ts = S.editing.ts;
    else if (isToday) ts = Date.now();
    else { const dt = new Date(parts[0], parts[1]-1, parts[2]); dt.setHours(12, 0, 0, 0); ts = dt.getTime(); }

    if (S.editing) {
      const e = DB.expenses.find(x => x.id === S.editing.id);
      if (e) { e.amount = amount; e.catId = d.catId; e.note = note; e.ts = ts; }
      S.newId = S.editing.id;
      toast(`Updated <b>${money(amount)}</b> · ${catOf(d.catId).name}`);
    } else {
      const e = { id: uid(), amount, catId: d.catId, note, ts };
      DB.expenses.push(e);
      S.newId = e.id;
      toast(`Added <b>${money(amount)}</b> · ${catOf(d.catId).name}`);
    }
    save(); closeSheet(); render();
  }

  /* ---------- expense detail ---------- */
  function openDetail(id) {
    const e = DB.expenses.find(x => x.id === id); if (!e) return;
    const c = catOf(e.catId);
    openSheet('detail', `
      <div class="sheet__head">
        <h2 class="sheet__title">Expense</h2>
        <button class="iconbtn" data-act="close" aria-label="Close">${icon('i-close')}</button>
      </div>
      <div class="sheet__body">
        <div class="detail">
          <span class="cat-ic cat-ic--lg" style="${cvars(e.catId)}">${icon(c.icon)}</span>
          <div class="detail__v money">${moneyHTML(e.amount, e.amount % 1 !== 0)}</div>
          <div class="detail__t">${esc(titleOf(e))}</div>
          <div class="detail__s">${(noteOf(e) ? [esc(c.name)] : []).concat([relDay(e.ts), fmtTime(e.ts)]).join(' · ')}</div>
          <div class="detail__acts">
            <button class="btn" data-act="edit" data-id="${esc(e.id)}">${icon('i-pencil')}Edit</button>
            <button class="btn btn--danger" data-act="del" data-id="${esc(e.id)}">${icon('i-trash')}Delete</button>
          </div>
        </div>
        <div style="height:10px"></div>
      </div>
    `);
  }

  /* ---------- recurring bill detail ---------- */
  function openRecurring(key) {
    const r = upcoming().filter(x => x.key === key)[0] || detectRecurring().filter(x => x.key === key)[0];
    if (!r) return;
    const cat = catOf(r.catId);
    const ord = n => { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); };
    const when = r.inDays === 0 ? 'today' : (r.inDays === 1 ? 'tomorrow' : `in about ${r.inDays} days`);

    openSheet('recurring', `
      <div class="sheet__head">
        <h2 class="sheet__title">Regular bill</h2>
        <button class="iconbtn" data-act="close" aria-label="Close">${icon('i-close')}</button>
      </div>
      <div class="sheet__body">
        <div class="detail" style="padding-bottom:6px">
          <span class="cat-ic cat-ic--lg" style="${cvars(r.catId)}">${icon(cat.icon)}</span>
          <div class="detail__v money">${r.varies ? '≈' : ''}${moneyHTML(r.amount)}</div>
          <div class="detail__t">${esc(r.note)}</div>
          <div class="detail__s">${esc(cat.name)}${r.inDays !== undefined ? ' · due ' + when : ''}</div>
        </div>

        <div class="ins" style="${cvars(r.catId)};--c2:${cc(r.catId)};margin-top:6px">
          <span class="ins__ic">${icon('i-repeat')}</span>
          <span class="ins__b">
            <span class="ins__h">Spotted this ${r.n} times, always around the <b>${ord(r.dom)}</b>.</span>
            <span class="ins__s">${r.varies
              ? 'The amount moves around, so this is a typical figure rather than an exact one.'
              : 'It has been the same amount every time.'} Last paid ${relDay(r.lastTs)}.</span>
          </span>
        </div>

        <button class="btn btn--primary btn--block btn--lg" style="margin-top:18px"
          data-act="log-recurring" data-key="${esc(r.key)}">${icon('i-check')}Log it now</button>
        <button class="btn btn--ghost btn--block" style="margin-top:9px"
          data-act="not-recurring" data-key="${esc(r.key)}">Not a regular bill</button>
        <p class="cmp-note" style="margin:12px 2px 18px;text-align:center">
          Hisaab works this out from your own history — nothing is scheduled or charged.
        </p>
      </div>
    `);
  }

  /* ---------- category detail ---------- */
  function catMonthly(catId, months) {
    const now = new Date(), out = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const [f, t] = monthRange(d.getFullYear(), d.getMonth());
      out.push({
        d: d, label: MONS_S[d.getMonth()],
        amount: sum(inRange(f, t).filter(e => e.catId === catId).map(e => e.amount)),
      });
    }
    return out;
  }

  function openCategory(catId) {
    const cat = catOf(catId);
    const list = all().filter(e => e.catId === catId).sort((a,b) => b.ts - a.ts);
    if (!list.length) return;
    const total = sum(list.map(e => e.amount));
    const trend = catMonthly(catId, 6);
    const max = Math.max.apply(null, trend.map(t => t.amount).concat([1]));
    const thisM = trend[trend.length - 1].amount;
    const lastM = trend[trend.length - 2] ? trend[trend.length - 2].amount : 0;
    const biggest = list.slice().sort((a,b) => b.amount - a.amount)[0];
    const nowM = new Date().getMonth();

    // what you actually buy inside this category
    const byNote = new Map();
    list.forEach(e => {
      const k = String(e.note || '').trim() || cat.name;
      const g = byNote.get(k) || { note: k, total: 0, n: 0 };
      g.total += e.amount; g.n++; byNote.set(k, g);
    });
    const notes = Array.from(byNote.values()).sort((a,b) => b.total - a.total).slice(0, 5);
    const noteMax = notes.length ? notes[0].total : 1;

    const d = thisM - lastM;
    const deltaChip = lastM > 0 && Math.abs(d) / lastM >= 0.03
      ? `<span class="delta delta--${d>0?'up':'down'}">${icon(d>0?'i-up':'i-down')}${Math.round(Math.abs(d)/lastM*100)}%</span>`
      : `<span class="delta delta--flat">about the same</span>`;

    openSheet('cat', `
      <div class="sheet__head">
        <h2 class="sheet__title">${esc(cat.name)}</h2>
        <button class="iconbtn" data-act="close" aria-label="Close">${icon('i-close')}</button>
      </div>
      <div class="sheet__body">
        <div class="detail" style="padding-bottom:18px">
          <span class="cat-ic cat-ic--lg" style="${cvars(catId)}">${icon(cat.icon)}</span>
          <div class="detail__v money">${moneyHTML(thisM)}</div>
          <div class="detail__s">in ${MONS[nowM]} · ${deltaChip} vs ${MONS_S[(nowM+11)%12]}</div>
        </div>

        <span class="lbl">Last 6 months</span>
        <div class="trend" style="${cvars(catId)}">
          ${trend.map((t, i) => `<div class="trend__col">
            <span class="trend__v money">${t.amount ? compact(t.amount) : '—'}</span>
            <span class="trend__track"><span class="trend__bar ${i===trend.length-1?'is-now':''}" data-h="${t.amount/max*100}%"></span></span>
            <span class="trend__l">${t.label}</span>
          </div>`).join('')}
        </div>

        <span class="lbl">All time</span>
        <div class="stats">
          <div class="stat"><b class="money">${money(total)}</b><span>total spent</span></div>
          <div class="stat"><b>${list.length}</b><span>${list.length===1?'time':'times'}</span></div>
          <div class="stat"><b class="money">${money(total/list.length)}</b><span>typical</span></div>
          <div class="stat"><b class="money">${money(biggest.amount)}</b><span>biggest</span></div>
        </div>

        <span class="lbl">What you buy</span>
        <div class="rank">
          ${notes.map(n => `<div class="rrow rrow--bare">
            <span class="rrow__b">
              <span class="rrow__n">
                <span class="rrow__name">${esc(n.note)}</span>
                <span class="rrow__meta">${n.n} ${n.n===1?'time':'times'}</span>
              </span>
              <span class="rrow__t" aria-hidden="true"><span class="rrow__f" style="--c:${cc(catId)}" data-w="${n.total/noteMax*100}%"></span></span>
            </span>
            <span class="rrow__v money">${money(n.total)}</span>
          </div>`).join('')}
        </div>

        <button class="btn btn--block" style="margin:20px 0 18px" data-act="filter-cat" data-cat="${esc(catId)}">
          See every ${esc(cat.name)} expense ${icon('i-chev-right')}
        </button>
      </div>
    `);
  }

  /* ---------- day detail ---------- */
  function openDay(dk) {
    const parts = dk.split('-').map(Number);
    const d = new Date(parts[0], parts[1]-1, parts[2]);
    const list = ofDay(d).sort((a,b) => b.ts - a.ts);
    const tot = sum(list.map(e => e.amount));
    const cats = byCategory(list);
    openSheet('day', `
      <div class="sheet__head">
        <h2 class="sheet__title">${relDay(d)}</h2>
        <button class="iconbtn" data-act="close" aria-label="Close">${icon('i-close')}</button>
      </div>
      <div class="sheet__body">
        <div style="text-align:center;padding:4px 0 16px">
          <div class="eyebrow">${fullDate(d)}</div>
          <div class="hero__amount money" style="justify-content:center;font-size:2.4rem;margin-top:6px">${moneyHTML(tot)}</div>
        </div>
        ${cats.length ? `<div class="flow__bar" style="margin-bottom:18px">${cats.map(c =>
          `<span class="flow__seg" style="--c:${cc(c.catId)};width:${Math.max(c.amount/tot*100,2)}%"></span>`).join('')}</div>` : ''}
        ${list.length ? list.map(itemRow).join('') : `<div class="empty" style="padding:26px 10px">
          <span class="empty__ic">${icon('i-leaf')}</span><span class="empty__t">A quiet day</span>
          <span class="empty__s">Nothing was spent on this day.</span></div>`}
        <div style="height:16px"></div>
      </div>
    `);
  }

  /* ===================== toast ===================== */
  const toastEl = $('#toast'); let toastT;
  function toast(html, action) {
    clearTimeout(toastT);
    toastEl.innerHTML = `<span class="toast__t">${html}</span>` + (action ? `<button data-act="${action.act}">${esc(action.label)}</button>` : '');
    toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add('in'));
    toastT = setTimeout(hideToast, action ? 6000 : 3200);
  }
  function hideToast() {
    toastEl.classList.remove('in');
    setTimeout(() => { if (!toastEl.classList.contains('in')) toastEl.hidden = true; }, 320);
  }

  /* ===================== export ===================== */
  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
  }
  function exportCSV() {
    const rows = [['Date','Time','Category','Note','Amount (INR)']];
    sorted().forEach(e => {
      const d = new Date(e.ts);
      rows.push([dayKey(d), fmtTime(e.ts), catOf(e.catId).name, (e.note||''), e.amount]);
    });
    // A note that starts with = + - or @ is run as a formula by Excel and Sheets.
    // Prefix it so an exported file can never attack whoever opens it.
    const cell = v => {
      let s = String(v == null ? '' : v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = rows.map(r => r.map(cell).join(',')).join('\n');
    // BOM so Excel opens the ₹ amounts and notes as UTF-8
    download('hisaab-' + dayKey(new Date()) + '.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
    markBackedUp();
    toast('CSV downloaded');
  }

  function markBackedUp() {
    DB.lastBackup = Date.now();
    DB.nudgeUntil = 0;
    save();
    if (S.view === 'home' || S.view === 'settings') render(true);
  }
  /** Reads a backup, shows what's in it, and lets you choose how it lands. */
  const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
  const MAX_IMPORT_ROWS = 50000;

  function importJSON(file) {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      return toast(`That file is ${Math.round(file.size / 1048576)}MB — too big to be a Hisaab backup`);
    }
    const reader = new FileReader();
    reader.onerror = () => toast("Couldn't read that file");
    toast('Reading backup…');
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); }
      catch (e) { return toast("That doesn't look like a Hisaab backup"); }

      const raw = Array.isArray(data) ? data : (data && data.expenses);
      if (!Array.isArray(raw)) return toast("That doesn't look like a Hisaab backup");

      if (raw.length > MAX_IMPORT_ROWS) {
        return toast(`That backup has more than ${nfInt.format(MAX_IMPORT_ROWS)} rows`);
      }
      const clean = raw.map(normaliseExpense).filter(Boolean);

      if (!clean.length) return toast('No usable expenses in that file');
      const skipped = raw.length - clean.length;
      const budget = data && isFinite(Number(data.budget)) ? Number(data.budget) : null;
      const have = new Set(all().map(e => e.id));
      const fresh = clean.filter(e => !have.has(e.id)).length;

      openSheet('import', `
        <div class="sheet__head">
          <h2 class="sheet__title">Restore backup</h2>
          <button class="iconbtn" data-act="close" aria-label="Close">${icon('i-close')}</button>
        </div>
        <div class="sheet__body">
          <div class="detail" style="padding-bottom:10px">
            <span class="cat-ic cat-ic--lg" style="${cvars('bills')}">${icon('i-download')}</span>
            <div class="detail__v money">${moneyHTML(sum(clean.map(e => e.amount)))}</div>
            <div class="detail__t">${clean.length} ${clean.length===1?'expense':'expenses'} in this file</div>
            <div class="detail__s">${esc(fmtRange(clean))}${skipped ? ` · ${skipped} unreadable ${skipped===1?'row':'rows'} skipped` : ''}</div>
          </div>
          <button class="btn btn--primary btn--block btn--lg" style="margin-top:8px" data-act="import-merge">
            ${icon('i-plus')}Add the ${fresh} new ${fresh===1?'one':'ones'}
          </button>
          <p class="cmp-note" style="margin:8px 2px 0;text-align:center">Keeps everything you have now.</p>
          <button class="btn btn--danger btn--block" style="margin-top:16px" data-act="import-replace">
            Replace all ${all().length} with this backup
          </button>
          <p class="cmp-note" style="margin:8px 2px 20px;text-align:center">Your current expenses would be gone.</p>
        </div>
      `);
      S.pendingImport = { list: clean, budget: budget };
    };
    reader.readAsText(file);
  }

  function fmtRange(list) {
    if (!list.length) return '';
    const ts = list.map(e => e.ts);
    const a = new Date(Math.min.apply(null, ts)), b = new Date(Math.max.apply(null, ts));
    return sameDay(a, b) ? fullDate(a) : `${MONS_S[a.getMonth()]} ${a.getFullYear()} – ${MONS_S[b.getMonth()]} ${b.getFullYear()}`;
  }

  function applyImport(mode) {
    const p = S.pendingImport;
    if (!p) return;
    if (mode === 'replace') {
      DB.expenses = p.list.slice();
      DB.sample = false; DB.dismissed = true;
    } else {
      const have = new Set(all().map(e => e.id));
      DB.expenses = all().concat(p.list.filter(e => !have.has(e.id)));
    }
    if (p.budget !== null && p.budget >= 0) DB.budget = Math.round(p.budget);
    S.pendingImport = null;
    save(); closeSheet();
    S.view = 'home'; S.filterCat = null; S.query = '';
    render(); window.scrollTo(0, 0);
    toast(`Restored — ${all().length} ${all().length===1?'expense':'expenses'} now`);
  }

  function exportJSON() {
    download('hisaab-backup-' + dayKey(new Date()) + '.json', JSON.stringify({ version: 1, exported: new Date().toISOString(), budget: DB.budget, expenses: sorted() }, null, 2), 'application/json');
    markBackedUp();
    toast('Backup downloaded — keep it somewhere safe');
  }

  /* ===================== theme ===================== */
  function applyTheme() {
    document.documentElement.dataset.theme = DB.theme;
    document.documentElement.dataset.size = DB.size;
    computeDark();
  }

  /* ===================== events ===================== */
  document.addEventListener('click', ev => {
    const navBtn = ev.target.closest('[data-nav]');
    if (navBtn) { go(navBtn.dataset.nav); return; }

    const t = ev.target.closest('[data-act]');
    if (!t) return;
    const a = t.dataset.act;

    switch (a) {
      case 'close': closeSheet(); break;
      case 'add': openAdd(null); break;
      case 'go-insights': go('insights'); break;
      case 'go-history': go('history'); break;
      case 'go-settings': go('settings'); break;
      case 'more': S.limit += 120; render(true); break;

      case 'period': S.period = t.dataset.p; render(true); break;

      case 'open-cat': openCategory(t.dataset.cat); break;
      case 'open-recurring': openRecurring(t.dataset.key); break;

      case 'log-recurring': {
        const r = upcoming().filter(x => x.key === t.dataset.key)[0];
        if (!r) break;
        closeSheet();
        setTimeout(() => openAdd(null, { amount: r.amount, catId: r.catId, note: r.note }), 260);
        break;
      }
      case 'not-recurring': {
        const k = t.dataset.key;
        if ((DB.notRecurring || []).indexOf(k) < 0) DB.notRecurring = (DB.notRecurring || []).concat([k]);
        save(); closeSheet(); render(true);
        toast('Removed from regular bills', { act: 'undo-recurring', label: 'Undo' });
        S.lastNotRecurring = k;
        break;
      }
      case 'undo-recurring':
        if (S.lastNotRecurring) {
          DB.notRecurring = (DB.notRecurring || []).filter(x => x !== S.lastNotRecurring);
          S.lastNotRecurring = null; save(); render(true);
        }
        hideToast();
        break;

      case 'filter-cat':
        S.filterCat = t.dataset.cat || null;
        if (sheetOpen) closeSheet();
        if (S.view !== 'history') { S.query = ''; S.limit = 120; go('history'); }
        else render(true);
        break;

      case 'open-exp': openDetail(t.dataset.id); break;
      case 'open-day': openDay(t.dataset.day); break;

      case 'edit': {
        const e = DB.expenses.find(x => x.id === t.dataset.id);
        closeSheet(); setTimeout(() => openAdd(e), 260);
        break;
      }
      case 'del': {
        const id = t.dataset.id;
        const idx = DB.expenses.findIndex(x => x.id === id);
        if (idx < 0) break;
        S.lastDeleted = DB.expenses[idx];
        DB.expenses.splice(idx, 1); save(); closeSheet(); render(true);
        toast(`Deleted <b>${money(S.lastDeleted.amount)}</b>`, { act: 'undo', label: 'Undo' });
        break;
      }
      case 'undo':
        if (S.lastDeleted) { DB.expenses.push(S.lastDeleted); S.newId = S.lastDeleted.id; S.lastDeleted = null; save(); render(true); }
        hideToast();
        break;

      case 'cal': {
        const d = +t.dataset.d;
        let y = S.cal.y, m = S.cal.m + d;
        if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
        const now = new Date();
        if (new Date(y, m, 1) > new Date(now.getFullYear(), now.getMonth(), 1)) break;
        S.cal = { y, m }; render(true);
        break;
      }

      case 'cat': S.draft.catId = t.dataset.cat;
        $$('.catbtn').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === S.draft.catId));
        syncSave(); break;

      case 'k': pressKey(t.dataset.k); break;

      case 'quick': {
        const p = quickPicks()[+t.dataset.i]; if (!p) break;
        S.draft.amount = String(p.amount); S.draft.catId = p.catId;
        const n = $('#note'); if (n) n.value = p.note || '';
        $$('.catbtn').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === p.catId));
        paintAmount(); syncSave();
        break;
      }
      case 'date': {
        const v = t.dataset.v;
        const dk = v === 'today' ? dayKey(new Date()) : dayKey(addDays(new Date(), -1));
        S.draft.date = dk;
        const di = $('#date'); if (di) di.value = dk;
        $$('[data-act="date"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v));
        break;
      }
      case 'save': commitSave(); break;

      case 'theme': DB.theme = t.dataset.v; save(); applyTheme(); render(true); break;
      case 'size':  DB.size  = t.dataset.v; save(); applyTheme(); render(true); break;

      case 'export-csv': exportCSV(); break;
      case 'export-json': exportJSON(); break;
      case 'import': filePicker.click(); break;
      case 'import-merge': applyImport('merge'); break;
      case 'import-replace': applyImport('replace'); break;
      case 'load-sample':
        DB.expenses = sampleData(); DB.sample = true; DB.dismissed = false; save();
        // go('home') would no-op when we're already on home, so render directly
        S.confirmErase = false; S.view = 'home'; S.filterCat = null; S.query = '';
        render(); window.scrollTo(0, 0); toast('Sample data loaded');
        break;
      case 'erase':
        if (!S.confirmErase) { S.confirmErase = true; render(true); setTimeout(() => { S.confirmErase = false; if (S.view==='settings') render(true); }, 4000); }
        else { DB.expenses = []; DB.sample = false; DB.dismissed = true; S.confirmErase = false; save(); render(true); toast('Everything erased'); }
        break;
      case 'fresh':
        DB.expenses = []; DB.sample = false; DB.dismissed = true; save(); render(); toast('Ready for your first expense');
        break;
      case 'dismiss': DB.dismissed = true; save(); render(true); break;
      case 'ack-recovery': DB.recoveryAck = true; save(); render(true); break;
      case 'snooze-nudge':
        DB.nudgeUntil = Date.now() + 30 * 86400000; save(); render(true);
        toast("We'll remind you in a month");
        break;
    }
  });

  $('#fab').addEventListener('click', () => { if (sheetOpen === 'add') closeSheet(); else openAdd(null); });
  scrim.addEventListener('click', closeSheet);

  // hidden input that drives "Restore from a backup"
  const filePicker = document.createElement('input');
  filePicker.type = 'file';
  filePicker.accept = 'application/json,.json';
  filePicker.style.display = 'none';
  filePicker.addEventListener('change', () => {
    if (filePicker.files && filePicker.files[0]) importJSON(filePicker.files[0]);
    filePicker.value = '';                            // so the same file can be picked twice
  });
  document.body.appendChild(filePicker);

  document.addEventListener('input', ev => {
    if (ev.target.id === 'q') { S.query = ev.target.value; S.limit = 120; renderHistoryKeepFocus(); }
    if (ev.target.id === 'budget') { DB.budget = Math.max(0, Math.round(+ev.target.value || 0)); save(); }
    if (ev.target.id === 'date' && S.draft) {
      S.draft.date = ev.target.value;
      $$('[data-act="date"]').forEach(b => {
        const dk = b.dataset.v === 'today' ? dayKey(new Date()) : dayKey(addDays(new Date(), -1));
        b.setAttribute('aria-pressed', dk === ev.target.value);
      });
    }
  });

  let hT;
  function renderHistoryKeepFocus() {
    clearTimeout(hT);
    hT = setTimeout(() => {
      const y = window.scrollY; render();
      const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
      window.scrollTo(0, y);
    }, 130);
  }

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && sheetOpen) { closeSheet(); return; }
    if (ev.key === 'Tab' && sheetOpen) { trapTab(ev); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
    if (sheetOpen === 'add') {
      if (typing) { if (ev.key === 'Enter') { ev.preventDefault(); commitSave(); } return; }
      if (/^[0-9]$/.test(ev.key)) { pressKey(ev.key); ev.preventDefault(); }
      else if (ev.key === '.') { pressKey('.'); ev.preventDefault(); }
      else if (ev.key === 'Backspace') { pressKey('del'); ev.preventDefault(); }
      else if (ev.key === 'Enter') { commitSave(); ev.preventDefault(); }
      return;
    }
    if (typing || sheetOpen) return;
    if (ev.key === 'n' || ev.key === '+' || ev.key === 'a') { openAdd(null); ev.preventDefault(); }
    else if (ev.key === '1') go('home');
    else if (ev.key === '2') go('insights');
    else if (ev.key === '3') go('history');
    else if (ev.key === '4') go('settings');
  });

  /* ---------- navigation & browser history ----------
     Without this the app was a single history entry: on Android the Back gesture
     left the app instead of closing an open sheet, and Back from Insights exited
     rather than returning Home. Tabs and sheets now both push an entry, so Back
     does the obvious thing and screens are linkable. */
  const VIEWS = ['home', 'insights', 'history', 'settings'];
  let navLock = false;
  // Only drive history when we own the window. Embedded in a frame, pushing and
  // popping entries would hijack the host page's Back button.
  let ownsHistory = true;
  try { ownsHistory = window.top === window.self; } catch (e) { ownsHistory = false; }                 // set while reacting to popstate, to avoid pushing back

  function go(view, opts) {
    opts = opts || {};
    if (VIEWS.indexOf(view) < 0) view = 'home';
    if (S.view === view && !opts.force) { window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' }); return; }
    S.view = view;
    if (view === 'history') S.limit = 120;
    else { S.filterCat = null; S.query = ''; }
    S.confirmErase = false;
    if (!navLock && ownsHistory) {
      const url = '#' + view;
      if (opts.replace) history.replaceState({ view: view }, '', url);
      else history.pushState({ view: view }, '', url);
    }
    render();
    window.scrollTo(0, 0);
    viewEl.focus({ preventScroll: true });
  }

  window.addEventListener('popstate', ev => {
    navLock = true;
    const st = ev.state || {};
    if (sheetOpen && !st.sheet) closeSheet(true);          // Back closes the sheet first
    const target = st.view || String(location.hash || '').replace('#', '') || 'home';
    if (VIEWS.indexOf(target) >= 0 && target !== S.view) go(target, { force: true });
    navLock = false;
  });

  /**
   * Another tab of the same app is a second writer to the same store. Without this,
   * whichever tab saved last silently overwrote the other's expenses — you could add
   * something in one tab and watch it vanish when you added something in the other.
   */
  window.addEventListener('storage', ev => {
    if (ev.key !== KEY || memoryOnly) return;
    const wasEditing = sheetOpen === 'add' && S.editing;
    DB = defaults();
    load();
    applyTheme();
    memo.clear(); rev++;
    render(true);
    if (!sheetOpen) toast('Updated from another tab');
    else if (wasEditing && !DB.expenses.some(e => e.id === S.editing.id)) {
      closeSheet();
      toast('That expense was removed in another tab');
    }
  });

  // sticky topbar shadow
  const topbar = $('#topbar');
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { topbar.classList.toggle('is-stuck', window.scrollY > 8); ticking = false; });
  }, { passive: true });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener
    ? window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (DB.theme === 'auto') render(true); })
    : null;

  /* ===================== boot ===================== */
  load();
  if (!DB.seeded) {
    DB.expenses = sampleData();
    DB.seeded = true; DB.sample = true; DB.budget = 30000;
    save();
  }
  applyTheme();

  // honour a deep link (#insights) and seed history with a state object, so the
  // first Back press has somewhere sensible to land
  const bootView = String(location.hash || '').replace('#', '');
  if (VIEWS.indexOf(bootView) >= 0) S.view = bootView;
  if (ownsHistory) history.replaceState({ view: S.view }, '', '#' + S.view);
  render();

  // Offline shell. Skipped on file:// where service workers aren't allowed anyway.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
