(function (root) {
  'use strict';
  var CATEGORIES = [
    { key: 'bus', label: 'Bus' },
    { key: 'crew', label: 'Crew' },
    { key: 'food', label: 'Food' },
    { key: 'gas', label: 'Gas' },
    { key: 'hotels', label: 'Hotels' },
    { key: 'flights', label: 'Flights' },
    { key: 'rideshare', label: 'Uber/Lyft' },
    { key: 'transport', label: 'Transportation' },
    { key: 'production', label: 'Production' },
    { key: 'studio', label: 'Studio' },
    { key: 'supplies', label: 'Supplies' },
    { key: 'card', label: 'Credit card' },
    { key: 'offdebt', label: 'Off Tour Debt' },
    { key: 'loan', label: 'Loan' },
    { key: 'interest', label: 'Interest charges' },
    { key: 'merch', label: 'Merch bill', note: 'Printing, plus any merch advance you have to pay back.' },
    { key: 'commission', label: 'Commission' },
    { key: 'merchTips', label: 'Merch tips', note: 'Tips from the merch table still to pay out: deposited with the merch, or cash not handed over yet.' },
    { key: 'misc', label: 'Misc' },
    { key: 'utilities', label: 'Monthly utilities' }
  ];
  var DERIVED = ['commission', 'merchTips', 'reimbursements'];
  function isDerived(key) { return DERIVED.indexOf(key) >= 0; }
  var TYPED_CATEGORIES = CATEGORIES.filter(function (c) { return !isDerived(c.key); });
  var COMMISSION_LINES = [
    { key: 'management', label: 'Management', basis: 'income' },
    { key: 'agent', label: 'Booking agent', basis: 'guarantee' },
    { key: 'lawyer', label: 'Lawyer', basis: 'income' }
  ];
  var INCOME_FIELDS = [
    { key: 'guarantee', label: 'Guarantee' },
    { key: 'backend', label: 'Back end' },
    { key: 'merch', label: 'Merch' },
    { key: 'vip', label: 'VIPs' },
    { key: 'buyouts', label: 'Buyouts' },
    { key: 'catering', label: 'Catering budget' },
    { key: 'misc', label: 'Misc' }
  ];
  var OTHER_INCOME_KINDS = [
    { key: 'merch', label: 'Merch' },
    { key: 'guarantee', label: 'Guarantee' },
    { key: 'royalties', label: 'Royalties' },
    { key: 'advance', label: 'Advance' },
    { key: 'other', label: 'Other' }
  ];
  var OTHER_NOTE_MAX = 60;
  function otherKindLabel(kind) {
    var hit = OTHER_INCOME_KINDS.filter(function (k) { return k.key === kind; })[0];
    return hit ? hit.label : 'Income';
  }
  function otherNote(v) {
    var t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return Array.from(t).filter(function (ch) { return !/^[\uD800-\uDFFF]$/.test(ch); })
      .slice(0, OTHER_NOTE_MAX).join('').trim();
  }
  function otherEntryLabel(x) {
    var e = isObj(x) ? x : {};
    return (e.kind === 'other' ? otherNote(e.label) : '') || otherKindLabel(e.kind);
  }
  var BAND_ROLES = ['Vocals', 'Guitar', 'Bass', 'Drums', 'Keys', 'DJ', 'Programming'];
  var CREW_ROLES = ['Tour manager', 'FOH engineer', 'Merch manager', 'Driver', 'Backline tech',
    'Monitor engineer', 'Drum tech', 'Lighting director', 'Photographer / videographer', 'Playback tech',
    'Production manager', 'Stage manager',
    'Assistant TM / production coordinator', 'Truck driver', 'Head of security / personal security',
    'VIP coordinator', 'Wardrobe / stylist', 'Hair & makeup artist', 'Head rigger', 'Tour accountant',
    'Band', 'Touring Musician'];
  var ARTIST_CREW_ROLES = CREW_ROLES;
  function creditGroupName(g) {
    if (!g) return '';
    if (g.year) {
      var y = String(g.key || '').slice(5);
      return y && y !== '0' ? y + ' · other shows' : 'Undated shows';
    }
    return g.name || 'Untitled tour';
  }
  function pickedIds(p) {
    var shows = p && isObj(p.shows) ? p.shows : {};
    return Object.keys(shows).filter(function (id) { return shows[id]; });
  }
  function creditTally(groups, sel) {
    var out = { tours: 0, shows: 0 };
    (groups || []).forEach(function (g) {
      var n = 0;
      if (sel && sel.all) n = num(g.n);
      else {
        var p = sel && isObj(sel.picks) ? sel.picks[g.key] : null;
        if (!isObj(p)) return;
        n = p.mode === 'shows' ? pickedIds(p).length : num(g.n);
      }
      if (!(n > 0)) return;
      out.shows += n;
      if (!g.year) out.tours += 1;
    });
    return out;
  }
  function creditClaim(sel) {
    if (sel && sel.all) return { all: true };
    var picks = [];
    Object.keys(sel && isObj(sel.picks) ? sel.picks : {}).forEach(function (k) {
      var p = sel.picks[k];
      if (!isObj(p)) return;
      if (p.mode === 'shows') {
        var ids = pickedIds(p);
        if (ids.length) picks.push({ key: k, mode: 'shows', shows: ids });
      } else picks.push({ key: k, mode: 'all' });
    });
    return { picks: picks };
  }
  function creditSelection(claim) {
    var sel = { all: false, picks: {} };
    if (!isObj(claim)) return sel;
    if (claim.all === true) { sel.all = true; return sel; }
    (Array.isArray(claim.picks) ? claim.picks : []).forEach(function (p) {
      if (!isObj(p) || !p.key) return;
      var shows = {};
      if (p.mode === 'shows') (Array.isArray(p.shows) ? p.shows : []).forEach(function (id) { shows[String(id)] = true; });
      sel.picks[p.key] = { mode: p.mode === 'shows' ? 'shows' : 'all', shows: shows };
    });
    return sel;
  }
  function tourTimeline(own, past, today) {
    var mine = (own || []).filter(isObj), out = [];
    var low = function (v) { return String(v || '').trim().toLowerCase(); };
    mine.forEach(function (t) {
      var a = String(t.first || ''), b = String(t.last || t.first || '');
      out.push({ own: true, tour: t, name: t.name || 'Untitled tour', artist: t.artist || '', first: a, last: b,
        n: num(t.shows), now: !!(a && today && today >= a && today <= b) });
    });
    (past || []).filter(isObj).forEach(function (p) {
      var a = String(p.first || ''), b = String(p.last || p.first || '');
      var dup = p.kind !== 'festival' && p.kind !== 'shows' && !!a && mine.some(function (t) {
        var ta = String(t.first || ''), tb = String(t.last || t.first || '');
        if (!ta) return false;
        if (p.artist && low(p.artist) !== low(t.artist)) return false;
        return a <= tb && b >= ta;
      });
      if (dup) return;
      out.push({ own: false, tour: p, name: p.name || 'Untitled tour', artist: p.artist || '', first: a, last: b,
        n: num(p.n), now: false });
    });
    return out.sort(function (x, y) {
      if (x.now !== y.now) return x.now ? -1 : 1;
      return String(y.last).localeCompare(String(x.last)) || String(x.name).localeCompare(String(y.name));
    });
  }
  var HISTORY_TIERS = [
    { key: 'diamond', label: 'Diamond', n: 1000 },
    { key: 'gold', label: 'Gold', n: 500 },
    { key: 'silver', label: 'Silver', n: 250 },
    { key: 'bronze', label: 'Bronze', n: 50 },
    { key: 'green', label: 'Green', n: 0 }
  ];
  var LEGACY_BAR = { key: 'legacy', label: 'Legacy', shows: 1500, tours: 50, countries: 30, cities: 250 };
  function historyTier(sum) {
    var s = isObj(sum) ? sum : {};
    if (num(s.shows) >= LEGACY_BAR.shows && num(s.tours) >= LEGACY_BAR.tours &&
        num(s.countries) >= LEGACY_BAR.countries && num(s.cities) >= LEGACY_BAR.cities) {
      return LEGACY_BAR;
    }
    for (var i = 0; i < HISTORY_TIERS.length; i++) {
      if (num(s.shows) >= HISTORY_TIERS[i].n) return HISTORY_TIERS[i];
    }
    return null;
  }
  var CREW_TITLES = CREW_ROLES;
  var DEBT_CHIPS = ['Credit card', 'Loan', 'Gear payment'];
  var DAILY_CHIPS = ['Food', 'Parking', 'Tolls', 'Repairs', 'Laundry', 'Gear'];
  var DAY_BY_DAY = 'dayByDay';
  var CHARGE_CATEGORIES = CATEGORIES.concat([{ key: DAY_BY_DAY, label: 'Day by day' }]);
  function extraCatNames(tour) {
    var src = tour && isObj(tour.extraCats) ? tour.extraCats : {}, out = {};
    Object.keys(src).forEach(function (k) {
      var label = k.indexOf('x-') === 0 ? String(src[k] || '').trim().slice(0, 30) : '';
      if (label) out[k] = label;
    });
    return out;
  }
  function unnamedExtraCats(tour) {
    if (!isObj(tour)) return [];
    var names = extraCatNames(tour), seen = {}, out = [];
    var note = function (k) {
      if (typeof k !== 'string' || k.indexOf('x-') !== 0 || seen[k]) return;
      seen[k] = true;
      if (!names[k]) out.push(k);
    };
    [tour.charges, tour.cashLog].forEach(function (map) {
      if (!isObj(map)) return;
      Object.keys(map).forEach(function (id) { if (isObj(map[id])) note(map[id].category); });
    });
    var exp = isObj(tour.expenses) ? tour.expenses : {};
    Object.keys(exp).forEach(function (k) {
      if (isObj(exp[k]) && (num(exp[k].projected) > 0 || num(exp[k].paid) > 0)) note(k);
    });
    return out;
  }
  function extraCatLabel(key) {
    var s = String(key == null ? '' : key).replace(/^x-/, '').replace(/[^a-z0-9]+/gi, ' ').trim().slice(0, 30);
    if (!s) return 'Added category';
    var plain = function (v) { return String(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
    var builtIn = CHARGE_CATEGORIES.map(function (c) { return c.label; }).concat(['Members', 'Members & Crew', 'Reimbursements'])
      .some(function (l) { return plain(l) === s.toLowerCase(); });
    return s.charAt(0).toUpperCase() + s.slice(1) + (builtIn ? ' (added)' : '');
  }
  function extraCategories(tour) {
    var names = extraCatNames(tour);
    unnamedExtraCats(tour).forEach(function (k) { names[k] = extraCatLabel(k); });
    return Object.keys(names)
      .sort(function (a, b) { return names[a].localeCompare(names[b]); })
      .map(function (k) { return { key: k, label: names[k] }; });
  }
  function withMemberLabel(tour, list) {
    if (!rows(tour && tour.crew).some(isMember)) return list;
    return list.map(function (c) { return c.key === 'crew' ? { key: 'crew', label: 'Members & Crew' } : c; });
  }
  function typedCategoriesFor(tour) { return withMemberLabel(tour, TYPED_CATEGORIES).concat(extraCategories(tour)); }
  function chargeCategoriesFor(tour) { return withMemberLabel(tour, CHARGE_CATEGORIES).concat(extraCategories(tour)); }
  function slugCategory(label) {
    var s = String(label == null ? '' : label).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
    return s ? 'x-' + s : '';
  }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v == null) return 0;
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : 0;
  }
  function optNum(v) {
    if (v == null || v === '') return null;
    var n = num(v);
    return isFinite(n) ? n : null;
  }
  var round = function (n) { return Math.round(n); };
  var NF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function money(n, sign) {
    var r = round(num(n));
    var s = '$' + NF.format(Math.abs(r));
    if (r < 0) return '-' + s;
    return sign && r > 0 ? '+' + s : s;
  }
  var NF2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function moneyCents(n) {
    var v = num(n);
    return (v < 0 ? '-' : '') + '$' + NF2.format(Math.abs(v));
  }
  var ROLLOVER_HOURS = 5;
  function pad(n) { return String(n).length < 2 ? '0' + n : String(n); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return ymd(d) === s ? d : null;
  }
  function tourToday(now, tz) {
    var t = (now == null ? Date.now() : now) - ROLLOVER_HOURS * 3600e3;
    if (tz) {
      try {
        var p = {};
        new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
          .formatToParts(new Date(t)).forEach(function (x) { p[x.type] = x.value; });
        return p.year + '-' + p.month + '-' + p.day;
      } catch (e) {   }
    }
    return ymd(new Date(t));
  }
  function addDays(s, n) {
    var d = parseDay(s) || new Date();
    d.setDate(d.getDate() + n);
    return ymd(d);
  }
  function daysBetween(a, b) {
    var da = parseDay(a), db = parseDay(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400e3);
  }
  var STATE_TZ = {
    AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
    CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
    DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
    ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago',
    KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
    MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
    MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago',
    NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
    NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
    OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
    SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
    UT: 'America/Denver', VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
    WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver', PR: 'America/Puerto_Rico',
    ON: 'America/Toronto', QC: 'America/Toronto', BC: 'America/Vancouver', AB: 'America/Edmonton',
    MB: 'America/Winnipeg', SK: 'America/Regina', NS: 'America/Halifax', NB: 'America/Moncton',
    NL: 'America/St_Johns', PE: 'America/Halifax', YT: 'America/Whitehorse'
  };
  var CITY_TZ = {
    'el paso': 'America/Denver', 'pensacola': 'America/Chicago', 'panama city': 'America/Chicago',
    'knoxville': 'America/New_York', 'chattanooga': 'America/New_York', 'johnson city': 'America/New_York',
    'bowling green': 'America/Chicago', 'paducah': 'America/Chicago', 'owensboro': 'America/Chicago',
    'evansville': 'America/Chicago', 'gary': 'America/Chicago', 'rapid city': 'America/Denver',
    'scottsbluff': 'America/Denver', "coeur d'alene": 'America/Los_Angeles', 'spokane': 'America/Los_Angeles',
    'ontario': 'America/Boise', 'fargo': 'America/Chicago', 'bismarck': 'America/Chicago',
    'sioux falls': 'America/Chicago', 'ironwood': 'America/Chicago'
  };
  var COUNTRY_TZ = {
    'UK': 'Europe/London', 'ENGLAND': 'Europe/London', 'SCOTLAND': 'Europe/London', 'WALES': 'Europe/London',
    'IRELAND': 'Europe/Dublin', 'GERMANY': 'Europe/Berlin', 'FRANCE': 'Europe/Paris', 'SPAIN': 'Europe/Madrid',
    'ITALY': 'Europe/Rome', 'NETHERLANDS': 'Europe/Amsterdam', 'BELGIUM': 'Europe/Brussels',
    'SWEDEN': 'Europe/Stockholm', 'NORWAY': 'Europe/Oslo', 'DENMARK': 'Europe/Copenhagen',
    'FINLAND': 'Europe/Helsinki', 'POLAND': 'Europe/Warsaw', 'AUSTRIA': 'Europe/Vienna',
    'SWITZERLAND': 'Europe/Zurich', 'PORTUGAL': 'Europe/Lisbon', 'CZECHIA': 'Europe/Prague',
    'CZECH REPUBLIC': 'Europe/Prague', 'JAPAN': 'Asia/Tokyo', 'AUSTRALIA': 'Australia/Sydney',
    'NEW ZEALAND': 'Pacific/Auckland', 'MEXICO': 'America/Mexico_City', 'BRAZIL': 'America/Sao_Paulo',
    'GB': 'Europe/London', 'IE': 'Europe/Dublin', 'DE': 'Europe/Berlin', 'FR': 'Europe/Paris', 'ES': 'Europe/Madrid',
    'IT': 'Europe/Rome', 'NL': 'Europe/Amsterdam', 'BE': 'Europe/Brussels', 'SE': 'Europe/Stockholm', 'NO': 'Europe/Oslo',
    'DK': 'Europe/Copenhagen', 'FI': 'Europe/Helsinki', 'PL': 'Europe/Warsaw', 'AT': 'Europe/Vienna', 'CH': 'Europe/Zurich',
    'PT': 'Europe/Lisbon', 'CZ': 'Europe/Prague', 'AU': 'Australia/Sydney', 'NZ': 'Pacific/Auckland'
  };
  var AU_CITY_TZ = {
    'sydney': ['Australia/Sydney', 'NSW'], 'newcastle': ['Australia/Sydney', 'NSW'], 'wollongong': ['Australia/Sydney', 'NSW'],
    'canberra': ['Australia/Sydney', 'ACT'], 'melbourne': ['Australia/Melbourne', 'VIC'], 'geelong': ['Australia/Melbourne', 'VIC'],
    'hobart': ['Australia/Hobart', 'TAS'], 'brisbane': ['Australia/Brisbane', 'QLD'], 'gold coast': ['Australia/Brisbane', 'QLD'],
    'sunshine coast': ['Australia/Brisbane', 'QLD'], 'cairns': ['Australia/Brisbane', 'QLD'], 'townsville': ['Australia/Brisbane', 'QLD'],
    'adelaide': ['Australia/Adelaide', 'SA'], 'perth': ['Australia/Perth', 'WA'], 'fremantle': ['Australia/Perth', 'WA'],
    'darwin': ['Australia/Darwin', 'NT']
  };
  function tzForCity(city, posted) {
    var parts = String(city == null ? '' : city).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    var town = (parts[0] || '').toLowerCase();
    var tail = (parts[parts.length - 1] || '').toUpperCase().replace(/\./g, '');
    var abroad = !!(STATE_TZ[tail] && COUNTRY_TZ[tail]) &&
      String(posted == null ? '' : posted).split('/')[0] === COUNTRY_TZ[tail].split('/')[0];
    var aussie = tail === 'AU' || tail === 'AUSTRALIA';
    var au = AU_CITY_TZ[town];
    if (au && (aussie || tail === au[1])) return au[0];
    if (parts.length > 1 && CITY_TZ[town]) return CITY_TZ[town];
    if (parts.length > 1 && STATE_TZ[tail] && !abroad) return STATE_TZ[tail];
    if (aussie && /^Australia\//.test(String(posted == null ? '' : posted))) return String(posted);
    if (COUNTRY_TZ[tail] && (!STATE_TZ[tail] || abroad)) return COUNTRY_TZ[tail];
    return '';
  }
  function zonedTime(day, hour, minute, tz) {
    var d = parseDay(day);
    if (!d || !tz) return null;
    try {
      var fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      var offset = function (ms) {
        var p = {};
        fmt.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
        return Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute) - ms;
      };
      var wall = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), hour || 0, minute || 0);
      var first = wall - offset(wall);
      return wall - offset(first);
    } catch (e) { return null; }
  }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function rows(map) {
    if (!isObj(map)) return [];
    return Object.keys(map).reduce(function (out, id) {
      if (isObj(map[id])) out.push(Object.assign({ id: id }, map[id]));
      return out;
    }, []);
  }
  function byDate(a, b) {
    return String(a.date || '').localeCompare(String(b.date || '')) ||
      (a.createdAt || 0) - (b.createdAt || 0);
  }
  function showsNear(tour, date, days) {
    if (!parseDay(date)) return [];
    var n = Math.max(0, Math.floor(num(days)));
    return rows(tour && tour.shows).filter(function (s) {
      return parseDay(s.date) && Math.abs(daysBetween(s.date, date)) <= n;
    }).sort(byDate);
  }
  function yearSlice(tour, year) {
    var y = String(year), t = isObj(tour) ? tour : {};
    var dated = function (o) {
      var out = {};
      Object.keys(isObj(o) ? o : {}).forEach(function (k) {
        if (isObj(o[k]) && String(o[k].date || '').slice(0, 4) === y) out[k] = o[k];
      });
      return out;
    };
    var began = bookYears(t)[0] || '';
    var out = {};
    Object.keys(t).forEach(function (k) { out[k] = t[k]; });
    var exp = normExpenses(t.expenses), expenses = {};
    Object.keys(exp).forEach(function (k) { expenses[k] = { projected: null, paid: began === y ? num(exp[k].paid) : 0 }; });
    out.expenses = expenses;
    out.charges = dated(t.charges);
    out.otherIncome = dated(t.otherIncome);
    out.extras = dated(t.extras);
    out.cashLog = dated(t.cashLog);
    out.debts = {};
    out.shows = {};
    out.crew = {};
    delete out.cardAway; delete out.feedCards; delete out.merchToSort;
    return out;
  }
  function bookYears(tour) {
    var t = isObj(tour) ? tour : {}, seen = {};
    var began = String(t.offFrom || '').slice(0, 4);
    if (!/^\d{4}$/.test(began)) began = t.createdAt ? String(new Date(t.createdAt).getFullYear()) : '';
    if (/^\d{4}$/.test(began)) seen[began] = true;
    [t.charges, t.otherIncome, t.extras, t.cashLog].forEach(function (o) {
      rows(o).forEach(function (x) { var d = String(x && x.date || '').slice(0, 4); if (/^\d{4}$/.test(d)) seen[d] = true; });
    });
    var list = Object.keys(seen).sort();
    if (/^\d{4}$/.test(began)) list = [began].concat(list.filter(function (x) { return x !== began; }));
    return list;
  }
  function emptyExpenses() {
    var o = {};
    TYPED_CATEGORIES.forEach(function (c) { o[c.key] = { projected: null, paid: 0 }; });
    return o;
  }
  function emptyCommission() {
    var o = {};
    COMMISSION_LINES.forEach(function (c) {
      o[c.key] = { mode: 'flat', value: 0, base: defaultCommissionBase(c) };
    });
    return o;
  }
  function defaultCommissionBase(line) {
    var b = {};
    INCOME_FIELDS.forEach(function (f) {
      b[f.key] = line.basis === 'guarantee' ? f.key === 'guarantee' : true;
    });
    return b;
  }
  function emptyIncome() {
    var o = {};
    INCOME_FIELDS.forEach(function (f) { o[f.key] = 0; });
    return o;
  }
  function normExpenses(e) {
    var out = emptyExpenses();
    var src = isObj(e) ? e : {};
    Object.keys(out).forEach(function (k) {
      var r = isObj(src[k]) ? src[k] : {};
      out[k] = { projected: optNum(r.projected), paid: num(r.paid) };
    });
    Object.keys(src).forEach(function (k) {
      if (out[k] || k.indexOf('x-') !== 0) return;
      var r = isObj(src[k]) ? src[k] : {};
      out[k] = { projected: optNum(r.projected), paid: num(r.paid) };
    });
    return out;
  }
  function normCommission(c) {
    var out = emptyCommission();
    var src = isObj(c) ? c : {};
    var rule = function (line, r) {
      var base = defaultCommissionBase(line);
      if (isObj(r.base)) INCOME_FIELDS.forEach(function (f) { base[f.key] = !!r.base[f.key]; });
      return { mode: r.mode === 'pct' ? 'pct' : 'flat', value: num(r.value), base: base };
    };
    COMMISSION_LINES.forEach(function (line) {
      out[line.key] = rule(line, isObj(src[line.key]) ? src[line.key] : {});
    });
    Object.keys(src).forEach(function (k) {
      if (k.indexOf('x-') !== 0 || !isObj(src[k])) return;
      var r = src[k];
      var label = String(r.label == null ? '' : r.label).trim().slice(0, 40);
      if (!label) return;
      var x = rule({ basis: 'income' }, r);
      x.label = label;
      x.at = num(r.at);
      out[k] = x;
    });
    return out;
  }
  function commissionLines(c) {
    var n = normCommission(c);
    var extra = Object.keys(n).filter(function (k) { return k.indexOf('x-') === 0; })
      .sort(function (a, b) { return n[a].at - n[b].at || (a < b ? -1 : 1); })
      .map(function (k) { return { key: k, label: n[k].label, basis: 'income', custom: true }; });
    return COMMISSION_LINES.concat(extra);
  }
  function buyoutIncome(show) {
    var total = num(show && isObj(show.income) ? show.income.buyouts : 0);
    if (!(total > 0)) return 0;
    var sp = buyoutSplitOf(show);
    if (sp) return sp.income;
    var tr = show && isObj(show.buyoutTrack) ? show.buyoutTrack : null;
    if (!tr) return 0;
    var paid = isObj(tr.paid) ? tr.paid : {};
    var artists = Object.keys(paid).filter(function (k) { return isObj(paid[k]) && paid[k].artist; }).length;
    return Math.min(total, round(num(tr.perHead) * artists * 100) / 100);
  }
  var BUYOUT_FROM = '2026-10-16';
  function buyoutShows(t) {
    return rows(t && t.shows).filter(function (sh) {
      return !!parseDay(sh.date) && sh.date >= BUYOUT_FROM && num(isObj(sh.income) ? sh.income.buyouts : 0) > 0;
    }).sort(byDate);
  }
  function buyoutDays(t, today) {
    var to = parseDay(today) ? today : tourToday();
    return rows(t && t.shows).filter(function (sh) {
      return !!parseDay(sh.date) && sh.date >= BUYOUT_FROM && sh.date <= to && !noBuyoutsNight(sh);
    }).sort(byDate);
  }
  function noBuyoutsNight(show) {
    return !!show && show.buyoutsNone === true && !(num(isObj(show.income) ? show.income.buyouts : 0) > 0);
  }
  function buyoutDocGot(show, crew, people) {
    var paid = show && isObj(show.buyoutTrack) && isObj(show.buyoutTrack.paid) ? show.buyoutTrack.paid : {};
    var low = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
    var list = (Array.isArray(people) ? people : []).filter(function (p) { return p && p.userId; });
    var one = function (test) {
      var ids = {};
      list.forEach(function (p) { if (test(p)) ids[p.userId] = true; });
      var k = Object.keys(ids);
      return k.length === 1 ? k[0] : k.length ? false : null;
    };
    var byEmail = function (e) {
      e = low(e);
      return e ? one(function (p) { return low(p.email) === e || low(p.invitedEmail) === e; }) : null;
    };
    var byName = function (n) {
      n = low(n);
      return n ? one(function (p) { return low(p.name) === n; }) : null;
    };
    var map = isObj(crew) ? crew : {};
    var out = {};
    Object.keys(paid).forEach(function (k) {
      if (!isObj(paid[k])) return;
      var u = null;
      if (k.indexOf('e:') === 0) u = byEmail(k.slice(2));
      else if (k.indexOf('n:') === 0) u = byName(k.slice(2));
      else if (isObj(map[k])) {
        u = byEmail(map[k].email);
        if (u === null) u = byName(map[k].name);
      }
      if (u) out[u] = true;
    });
    return out;
  }
  function buyoutBumpLine(names) {
    var full = [];
    (Array.isArray(names) ? names : []).forEach(function (n) {
      n = String(n == null ? '' : n).trim().replace(/\s+/g, ' ');
      if (n && full.indexOf(n) < 0) full.push(n);
    });
    if (!full.length) return '';
    var first = function (n) { return n.split(' ')[0]; };
    var said = full.map(function (n) {
      var f = first(n).toLowerCase();
      var shared = full.some(function (m) { return m !== n && first(m).toLowerCase() === f; });
      return shared ? n : first(n);
    });
    var who = said.length === 1 ? said[0]
      : said.slice(0, -1).join(', ') + ' & ' + said[said.length - 1];
    return 'Give ' + who + ' their buyout';
  }
  var SUPPLY_SEEN_MAX = 1000;
  function supplyFresh(rows, seen, me) {
    var known = {};
    (Array.isArray(seen) ? seen : []).forEach(function (k) { known[String(k)] = true; });
    return (Array.isArray(rows) ? rows : []).filter(function (r) {
      return isObj(r) && r.id != null && !known[String(r.id)] && r.addedBy !== me && !r.doneAt &&
        String(r.body == null ? '' : r.body).trim() !== '';
    }).sort(function (a, b) {
      return String(a.at || '').localeCompare(String(b.at || '')) || (Number(a.id) - Number(b.id) || 0);
    });
  }
  function supplySeen(rows, seen) {
    var out = (Array.isArray(seen) ? seen : []).map(String), has = {}, live = {};
    out.forEach(function (k) { has[k] = true; });
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      if (!isObj(r) || r.id == null) return;
      var k = String(r.id);
      live[k] = true;
      if (!has[k]) { has[k] = true; out.push(k); }
    });
    var extra = out.length - SUPPLY_SEEN_MAX;
    return extra > 0 ? out.filter(function (k) {
      if (live[k] || extra <= 0) return true;
      extra -= 1;
      return false;
    }) : out;
  }
  function supplySplash(lines, nameOf) {
    var list = (Array.isArray(lines) ? lines : []).filter(function (r) {
      return isObj(r) && String(r.body == null ? '' : r.body).trim() !== '';
    });
    if (!list.length) return null;
    var item = function (r) {
      var w = String(r.body).replace(/\s+/g, ' ').trim();
      return (w.length > 60 ? w.slice(0, 59).replace(/\s+$/, '') + '\u2026' : w).toUpperCase();
    };
    var join = function (names, show, noun) {
      if (names.length <= 3) {
        return names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1];
      }
      var more = names.length - show;
      return names.slice(0, show).join(', ') + ' & ' + more + ' ' + (noun === 'others' && more === 1 ? 'other' : noun);
    };
    var items = list.map(item);
    var said = join(items, 3, 'MORE');
    var who = [];
    list.forEach(function (r) {
      var n = String(typeof nameOf === 'function' ? nameOf(r.addedBy) || '' : '').trim().replace(/\s+/g, ' ') || 'Someone';
      if (who.indexOf(n) < 0) who.push(n);
    });
    return { big: [said, list.length === 1 ? 'WAS ADDED TO SUPPLIES' : 'WERE ADDED TO SUPPLIES'],
      who: 'by ' + join(who, 2, 'others') };
  }
  function tourManagerTitle(title) {
    return String(title || '').split(',').some(function (r) { return r.trim().toLowerCase() === 'tour manager'; });
  }
  function buyoutTrackers(list) {
    var leads = (Array.isArray(list) ? list : []).filter(function (m) {
      return !!(m && m.userId && (m.owner || (m.role === 'editor' && m.manager)));
    });
    var titled = leads.filter(function (m) {
      return [m.tourRole, isObj(m.base) ? m.base.tourRole : null].concat(Array.isArray(m.titles) ? m.titles : [])
        .some(tourManagerTitle);
    });
    var seen = {};
    var ids = (titled.length ? titled : leads).map(function (m) { return m.userId; })
      .filter(function (u) { if (seen[u]) return false; seen[u] = true; return true; });
    return { titled: titled.length > 0, ids: ids };
  }
  function buyoutOwedTo(shows, got, userId) {
    var g = isObj(got) ? got : {};
    return (shows || []).filter(function (sh) { return !g[sh.id + '|' + userId]; });
  }
  function muteLow(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  function muteEntriesFor(t, uid, mails) {
    var m = t && isObj(t.muted) ? t.muted : {};
    var ms = (Array.isArray(mails) ? mails : [mails]).map(muteLow).filter(Boolean);
    return Object.keys(m).filter(function (k) {
      var e = m[k];
      if (!isObj(e)) return false;
      return (!!uid && e.uid === uid) || (!!muteLow(e.email) && ms.indexOf(muteLow(e.email)) >= 0);
    }).map(function (k) { return { key: k, e: m[k] }; });
  }
  function muteSpansIn(e) {
    var out = [];
    (isObj(e) && Array.isArray(e.spans) ? e.spans : []).forEach(function (s) {
      if (!isObj(s) || !parseDay(s.from)) return;
      var to = parseDay(s.to) ? s.to : '';
      if (to && to <= s.from) return;
      out.push({ from: s.from, to: to });
    });
    return out;
  }
  function mutedSpansOf(t, uid, mails) {
    var out = [];
    muteEntriesFor(t, uid, mails).forEach(function (h) { out = out.concat(muteSpansIn(h.e)); });
    return out.sort(function (a, b) { return a.from < b.from ? -1 : a.from > b.from ? 1 : 0; });
  }
  function mutedOn(spans, day) {
    return !!parseDay(day) && (spans || []).some(function (s) { return s.from <= day && (!s.to || day < s.to); });
  }
  function muteHeld(spans) {
    return (spans || []).some(function (s) { return !s.to; });
  }
  function muteTap(t, who, on, day, at) {
    if (!parseDay(day)) return null;
    var uid = who && who.uid ? who.uid : null;
    var mails = (who && Array.isArray(who.mails) ? who.mails : []).map(muteLow).filter(Boolean);
    var hits = muteEntriesFor(t, uid, mails);
    var copy = function (h) {
      return (Array.isArray(h.e.spans) ? h.e.spans : []).filter(isObj).map(function (s) { return Object.assign({}, s); });
    };
    var open = function (s) { return !!parseDay(s.from) && !parseDay(s.to); };
    var out = {};
    if (on) {
      if (hits.some(function (h) { return copy(h).some(open); })) return null;
      var h0 = hits[0] || null;
      var key = h0 ? h0.key : uid ? 'u:' + uid : mails[0] ? 'e:' + mails[0] : '';
      if (!key) return null;
      var spans = h0 ? copy(h0) : [];
      var back = spans.filter(function (s) { return parseDay(s.from) && parseDay(s.to) && s.from <= day && s.to >= day; })[0];
      if (back) { delete back.to; delete back.off; }
      else spans.push({ from: day, at: num(at) || null });
      var was = h0 ? h0.e : {};
      out[key] = { uid: uid || was.uid || null, email: mails[0] || muteLow(was.email) || null,
        name: String((who && who.name) || was.name || '').trim() || null, spans: spans };
      return out;
    }
    hits.forEach(function (h) {
      var changed = false;
      var spans = copy(h).filter(function (s) {
        if (!open(s)) return true;
        changed = true;
        if (s.from >= day) return false;
        s.to = day; s.off = num(at) || null;
        return true;
      });
      if (changed) out[h.key] = Object.assign({}, h.e, { spans: spans });
    });
    return Object.keys(out).length ? out : null;
  }
  function buyoutR2(n) { return Math.round(num(n) * 100) / 100; }
  function buyoutLow(v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' '); }
  function buyoutSince(v) {
    var ms = typeof v === 'number' ? v : typeof v === 'string' && /\D/.test(v) ? Date.parse(v) : num(v);
    return isFinite(ms) && ms > 1e11 ? tourToday(ms) : '';
  }
  function buyoutSettingsOf(t) {
    var s = t && isObj(t.buyoutSettings) ? t.buyoutSettings : {};
    var amt = buyoutR2(s.crewAmount);
    return { at: num(s.at) || null, crewAmount: amt > 0 ? amt : null, people: isObj(s.people) ? s.people : {} };
  }
  function buyoutRoster(t, seats) {
    var sett = buyoutSettingsOf(t);
    var out = [];
    rows(t && t.crew).forEach(function (e) {
      if (isHelper(e)) return;
      var name = String(e.name || '').trim().replace(/\s+/g, ' ');
      if (!name) return;
      out.push({ key: e.id, name: name, title: String(e.title || '').trim(), email: buyoutLow(e.email), uid: null,
        member: isMember(e), entry: true, owner: false, since: buyoutSince(e.createdAt), mails: [buyoutLow(e.email)] });
    });
    (Array.isArray(seats) ? seats : []).forEach(function (s) {
      if (!s) return;
      var twice = s.userId ? out.filter(function (p) { return p.uid === s.userId; })[0] : null;
      if (twice) { if (s.owner) { twice.owner = true; twice.since = ''; } return; }
      var mails = [buyoutLow(s.email), buyoutLow(s.invitedEmail)].filter(Boolean);
      var nm = buyoutLow(s.name);
      var free = out.filter(function (p) { return !p.seated; });
      var hit = free.filter(function (p) { return p.email && mails.indexOf(p.email) >= 0; })[0];
      if (!hit && nm) {
        var by = free.filter(function (p) { return buyoutLow(p.name) === nm; });
        if (by.length === 1) hit = by[0];
      }
      var since = buyoutSince(s.addedAt);
      if (!hit) {
        var key = mails[0] ? 'e:' + mails[0] : nm ? 'n:' + nm : s.userId ? 'u:' + s.userId : '';
        if (!key) return;
        hit = { key: key, name: String(s.name || '').trim() || mails[0] || 'Someone', title: String(s.tourRole || '').trim(),
          email: mails[0] || '', uid: null, member: isMember({ title: s.tourRole }), entry: false, owner: false, since: since, mails: [] };
        out.push(hit);
      } else if (s.addedSure && since) hit.since = since;
      else if (since && (!hit.since || since < hit.since)) hit.since = since;
      hit.seated = true;
      hit.mails = hit.mails.concat(mails);
      if (s.userId) hit.uid = s.userId;
      if (!hit.email && mails[0]) hit.email = mails[0];
      if (s.owner) { hit.owner = true; hit.since = ''; }
    });
    var ppl = sett.people, used = {};
    var keys = Object.keys(ppl).filter(function (k) { return isObj(ppl[k]); });
    out.forEach(function (p) { if (isObj(ppl[p.key])) { p.set = ppl[p.key]; used[p.key] = true; } });
    out.forEach(function (p) {
      if (p.set) return;
      var left = keys.filter(function (k) { return !used[k]; });
      var k = (p.uid && left.filter(function (x) { return ppl[x].uid === p.uid; })[0]) ||
        (p.email && left.filter(function (x) { return buyoutLow(ppl[x].email) === p.email; })[0]) || null;
      if (!k) {
        var named = left.filter(function (x) { return buyoutLow(ppl[x].name) === buyoutLow(p.name); });
        if (named.length === 1) k = named[0];
      }
      if (k) { p.set = ppl[k]; used[k] = true; }
    });
    out.forEach(function (p) { p.setKey = p.set ? Object.keys(ppl).filter(function (k) { return ppl[k] === p.set; })[0] || null : null; });
    out.forEach(function (p) {
      var x = p.set || {};
      if (!p.entry && (x.member === true || x.member === false)) p.member = x.member;
      p.on = x.off !== true;
      var own = buyoutR2(x.amount);
      p.amount = own > 0 ? own : null;
      p.fixed = !p.member && p.on ? (p.amount != null ? p.amount : sett.crewAmount) : null;
      p.muted = mutedSpansOf(t, p.uid, p.mails);
      delete p.set; delete p.seated; delete p.entry; delete p.mails;
    });
    return out.sort(function (a, b) {
      return (b.member ? 1 : 0) - (a.member ? 1 : 0) || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }
  function buyoutSplitNew(t, show, seats, at) {
    var day = show && parseDay(show.date) ? show.date : '';
    var people = {};
    buyoutRoster(t, seats).forEach(function (p) {
      if (!p.on || (day && p.since && p.since > day) || (day && mutedOn(p.muted, day))) return;
      var x = { name: p.name, member: !!p.member };
      if (p.fixed != null) x.amount = p.fixed;
      if (p.uid) x.uid = p.uid;
      if (p.email) x.email = p.email;
      people[p.key] = x;
    });
    return { at: num(at) || null, people: people };
  }
  function buyoutSplitOf(show) {
    var sp = show && isObj(show.buyoutSplit) && isObj(show.buyoutSplit.people) ? show.buyoutSplit.people : null;
    if (!sp) return null;
    var total = Math.max(0, buyoutR2(isObj(show.income) ? show.income.buyouts : 0));
    var list = Object.keys(sp).filter(function (k) { return isObj(sp[k]); }).map(function (k) {
      var x = sp[k], amt = buyoutR2(x.amount);
      return { key: k, name: String(x.name || '').trim(), member: x.member === true, uid: x.uid || null,
        email: buyoutLow(x.email), fixed: x.member !== true && amt > 0 ? amt : null };
    });
    var fixed = buyoutR2(list.reduce(function (n, p) { return n + (p.fixed || 0); }, 0));
    var left = Math.max(0, buyoutR2(total - fixed));
    var sharers = list.filter(function (p) { return p.fixed == null; });
    var m = sharers.filter(function (p) { return p.member; }).length;
    var each = sharers.length ? buyoutR2(left / sharers.length) : 0;
    var members = !sharers.length ? 0 : m === sharers.length ? left : buyoutR2(left * m / sharers.length);
    list.forEach(function (p) { p.share = p.fixed != null ? p.fixed : each; });
    list.sort(function (a, b) {
      return (b.member ? 1 : 0) - (a.member ? 1 : 0) || a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
    return { total: total, fixed: fixed, left: left, each: each, short: fixed > total,
      members: list.filter(function (p) { return p.member; }).length,
      crew: list.filter(function (p) { return !p.member; }).length,
      income: Math.min(total, members), people: list };
  }
  function buyoutOwed(t, shows, seats) {
    var list = (Array.isArray(seats) ? seats : []).filter(function (s) { return s && s.userId; });
    var roster = buyoutRoster(t, seats);
    var byUid = {};
    roster.forEach(function (p) { if (p.uid) byUid[p.uid] = p; });
    var out = {};
    (shows || []).forEach(function (sh) {
      if (!sh || noBuyoutsNight(sh)) return;
      var sp = isObj(sh.buyoutSplit) && isObj(sh.buyoutSplit.people) ? sh.buyoutSplit.people : null;
      var ents = sp ? Object.keys(sp).filter(function (k) { return isObj(sp[k]); }).map(function (k) {
        return { key: k, uid: sp[k].uid || null, email: buyoutLow(sp[k].email), name: buyoutLow(sp[k].name) };
      }) : null;
      list.forEach(function (s) {
        var p = byUid[s.userId] || null, owed;
        if (ents) {
          var mails = [buyoutLow(s.email), buyoutLow(s.invitedEmail)].filter(Boolean);
          var nm = buyoutLow(s.name);
          owed = ents.some(function (e) {
            return (p && e.key === p.key) || (e.uid && e.uid === s.userId) || (e.email && mails.indexOf(e.email) >= 0);
          }) || (!!nm && ents.filter(function (e) { return e.name === nm; }).length === 1 &&
            !ents.some(function (e) { return e.name === nm && e.uid && e.uid !== s.userId; }));
        } else {
          var hush = p ? p.muted : mutedSpansOf(t, s.userId, [s.email, s.invitedEmail]);
          owed = !mutedOn(hush, sh.date) && (!p || (p.on && (!p.since || !parseDay(sh.date) || p.since <= sh.date)));
        }
        if (owed) out[sh.id + '|' + s.userId] = true;
      });
    });
    return out;
  }
  function taxWithheldOf(show) {
    return Math.max(0, round(num(show && show.taxWithheld) * 100) / 100);
  }
  function guaranteeNet(show) {
    var inc = show && isObj(show.income) ? show.income : {};
    var logged = num(inc.guarantee);
    if (!(logged > 0)) return 0;
    if (guaranteeRoom(show) > 0 || !show || show.guaranteePaidBy === 'agency' || show.guaranteeReceived !== false) {
      return Math.max(0, round((logged - guaranteeLost(show) - guaranteeKept(show)) * 100) / 100);
    }
    var why = guaranteeWhy(show);
    var off = (why.agent || 0) + (why.mgmt || 0) + (why.venue || 0) + (why.fee || 0) + (why.other || 0);
    if (show.guaranteeDeposit != null && num(show.guaranteeDeposit) > 0) {
      off = Math.min(off, Math.max(0, logged - num(show.guaranteeDeposit) - (why.owed || 0) - (why.advance || 0) - (why.cash || 0)));
    }
    return Math.max(0, round((logged - off) * 100) / 100);
  }
  function incomeOf(show, key) {
    if (key === 'buyouts') return buyoutIncome(show);
    var inc = show && isObj(show.income) ? show.income : {};
    if (key === 'guarantee') return guaranteeNet(show);
    if (key === 'merch') return Math.max(0, round((num(inc.merch) - merchTipsPaidCash(show)) * 100) / 100);
    return num(inc[key]);
  }
  function showIncomeTotal(show) {
    return INCOME_FIELDS.reduce(function (t, f) { return t + incomeOf(show, f.key); }, 0);
  }
  function merchTips(show) {
    var t = show && isObj(show.merchTips) ? show.merchTips : null;
    var amount = t ? Math.max(0, round(num(t.amount) * 100) / 100) : 0;
    return { amount: amount, how: t && t.how === 'deposited' ? 'deposited' : 'cash', paid: !!(t && t.paid) };
  }
  function merchTipsPaidCash(show) {
    var t = merchTips(show);
    return t.how === 'cash' && t.paid ? t.amount : 0;
  }
  function merchTipsOwed(show) {
    var t = merchTips(show);
    if (!(t.amount > 0)) return 0;
    return t.how === 'deposited' || !t.paid ? t.amount : 0;
  }
  function guaranteeIn(show) { return !show || show.guaranteePaidBy === 'agency' || show.guaranteeReceived !== false; }
  var DEPOSIT_HOW = { check: 'Check deposit', wire: 'Wire', ach: 'Direct deposit (ACH)', transfer: 'Transfer' };
  function depositHowWord(how) { return Object.prototype.hasOwnProperty.call(DEPOSIT_HOW, how) ? DEPOSIT_HOW[how] : ''; }
  var PAID_BY_WORDS = { check: 'check', direct: 'direct deposit', agency: 'agency deposit' };
  function paidByWords(paidBy) { return Object.prototype.hasOwnProperty.call(PAID_BY_WORDS, paidBy) ? PAID_BY_WORDS[paidBy] : ''; }
  function depositFit(how, paidBy) {
    if (!depositHowWord(how)) return 0;
    if (paidBy === 'agency') return -1;
    if (paidBy === 'check') return how === 'check' ? 1 : -1;
    if (paidBy === 'direct') return how === 'wire' || how === 'ach' ? 1 : how === 'check' ? -1 : 0;
    return 0;
  }
  var DEPOSIT_PAYER = { atvenu: 'atVenu', livenation: 'Live Nation' };
  function depositPayerWord(payer) { return Object.prototype.hasOwnProperty.call(DEPOSIT_PAYER, payer) ? DEPOSIT_PAYER[payer] : ''; }
  var DEPOSIT_PAYER_HINT = {
    atvenu: 'From atVenu, so it is likely merch: atVenu pays a show\u2019s merch card sales, less its card fee, about 2 business days after the show, one deposit per show.',
    livenation: 'From Live Nation. It is usually a show\u2019s guarantee or settlement from a Live Nation show. You decide what it was.'
  };
  function depositPayerHint(payer) { return Object.prototype.hasOwnProperty.call(DEPOSIT_PAYER_HINT, payer) ? DEPOSIT_PAYER_HINT[payer] : ''; }
  function depositPayerFit(payer, kind) {
    if (payer !== 'atvenu') return 0;
    return kind === 'merch' ? 1 : kind === 'guarantee' ? -1 : 0;
  }
  function depositHead(payer, how, account) {
    var p = depositPayerWord(payer), w = depositHowWord(how), a = String(account || '');
    var first = p ? (w ? p + ' \u00b7 ' + w : p + ' deposit') : (w || (a ? 'Deposit' : 'Bank deposit'));
    return a ? first + ' \u00b7 ' + a : first;
  }
  function depositHitOrder(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    var wa = num(a.who), wb = num(b.who);
    if (wa !== wb) return wb - wa;
    var fa = num(a.fit), fb = num(b.fit);
    if (fa !== fb) return fb - fa;
    if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
    return a.rank === 2 ? a.off - b.off : a.gap - b.gap;
  }
  function depositTies(hits) {
    var list = (hits || []).slice().sort(depositHitOrder);
    if (!list.length) return [];
    return list.filter(function (x) {
      return x.rank === list[0].rank && num(x.who) === num(list[0].who) && num(x.fit) === num(list[0].fit);
    }).slice(0, 5);
  }
  function depositFitSay(how, paidBy, where) {
    var word = depositHowWord(how), fit = depositFit(how, paidBy), w = String(where || 'the show');
    if (!word || !fit) return '';
    if (fit > 0) return word + ' · matches ' + w + ' (paid by ' + paidByWords(paidBy) + ').';
    if (paidBy === 'agency') return word + ', but ' + w + ' is paid by agency deposit: the booking agent holds that money, so it does not reach your account.';
    return word + ', but ' + w + ' is marked paid by ' + paidByWords(paidBy) + '.';
  }
  var GUARANTEE_REASONS = [
    { key: 'agent', label: 'Booking agent\u2019s commission' },
    { key: 'mgmt', label: 'Management commission' },
    { key: 'tax', label: 'Taxes withheld' },
    { key: 'advance', label: 'Deposit paid earlier' },
    { key: 'cash', label: 'Paid in cash at the show' },
    { key: 'owed', label: 'Still owed by the promoter' },
    { key: 'venue', label: 'Venue deduction' },
    { key: 'fee', label: 'Bank or wire fee' },
    { key: 'other', label: 'Other' }
  ];
  function guaranteeWhy(show) {
    var src = show && isObj(show.guaranteeWhy) ? show.guaranteeWhy : {};
    var out = {};
    GUARANTEE_REASONS.forEach(function (r) {
      var v = round(num(src[r.key]) * 100) / 100;
      if (v > 0) out[r.key] = v;
    });
    var tax = round(num(show && show.taxWithheld) * 100) / 100;
    if (tax > 0) out.tax = tax; else delete out.tax;
    return out;
  }
  function guaranteeTotal(show) {
    var inc = show && isObj(show.income) ? show.income : {};
    return round((num(inc.guarantee) + Math.max(0, num(show && show.taxWithheld))) * 100) / 100;
  }
  function guaranteeGap(show) {
    var total = guaranteeTotal(show);
    var has = !!show && show.guaranteeDeposit != null && num(show.guaranteeDeposit) > 0;
    var deposit = has ? round(num(show.guaranteeDeposit) * 100) / 100 : null;
    var why = guaranteeWhy(show);
    var explained = Object.keys(why).reduce(function (t, k) { return t + why[k]; }, 0);
    var short = deposit == null ? 0 : round((total - deposit) * 100) / 100;
    return { total: total, deposit: deposit, short: short, explained: round(explained * 100) / 100,
      unexplained: round((short - explained) * 100) / 100, why: why };
  }
  function guaranteeRoom(show) {
    if (!show || show.guaranteePaidBy === 'agency' || show.guaranteeReceived === false) return 0;
    if (show.guaranteeDeposit == null || !(num(show.guaranteeDeposit) > 0)) return 0;
    var inc = isObj(show.income) ? show.income : {};
    return Math.max(0, round((num(inc.guarantee) - num(show.guaranteeDeposit)) * 100) / 100);
  }
  function guaranteeOwed(show) {
    var room = guaranteeRoom(show);
    return room > 0 ? Math.min(room, guaranteeWhy(show).owed || 0) : 0;
  }
  function guaranteeLost(show) {
    var room = guaranteeRoom(show);
    if (!(room > 0)) return 0;
    var why = guaranteeWhy(show);
    return Math.max(0, Math.min(room - Math.min(room, why.owed || 0), (why.venue || 0) + (why.fee || 0) + (why.other || 0)));
  }
  function guaranteeKept(show, who) {
    var room = guaranteeRoom(show);
    if (!(room > 0)) return 0;
    var why = guaranteeWhy(show);
    room = Math.max(0, round((room - guaranteeOwed(show) - guaranteeLost(show) - (why.advance || 0) - (why.cash || 0)) * 100) / 100);
    var a = Math.min(room, why.agent || 0), m = Math.min(room - a, why.mgmt || 0);
    return who === 'agent' ? a : who === 'mgmt' ? m : a + m;
  }
  function merchDue(show) {
    if (show && show.merchCardDeposit != null && num(show.merchCardDeposit) >= 0) {
      return round(num(show.merchCardDeposit) * 100) / 100;
    }
    var inc = show && isObj(show.income) ? show.income : {};
    return Math.max(0, round((num(inc.merch) - num(show && show.merchCash)) * 100) / 100);
  }
  function merchTen(night, avg) {
    night = optNum(night); avg = num(avg);
    if (!(avg > 0) || night == null || !(night >= 0)) return null;
    return Math.max(1, Math.min(10, Math.round(5 * night / avg)));
  }
  function merchNightlyAvg(t) {
    var nights = rows(t && t.shows).filter(function (s) { return s.loggedAt && num(s.income && s.income.merch) > 0; });
    if (!nights.length) return 0;
    return nights.reduce(function (n, s) { return n + num(s.income.merch); }, 0) / nights.length;
  }
  function showReviewScores(review) {
    var r = isObj(review) ? review : {};
    var stars = function (k) {
      var n = isObj(r[k]) ? num(r[k].stars) : 0;
      return n >= 0.5 ? n : null;
    };
    var one = function (v) { return v == null ? null : Math.round(v * 10) / 10; };
    var parts = ['venue', 'greenroom', 'staff', 'catering', 'sound', 'stage']
      .map(stars).filter(function (v) { return v != null; });
    return {
      venue: parts.length ? one(parts.reduce(function (a, b) { return a + b; }, 0) / parts.length) : null,
      city: one(stars('area')),
      crowd: one(stars('crowd'))
    };
  }
  function showReceived(show) {
    var inc = show && isObj(show.income) ? show.income : {};
    return {
      guarantee: num(inc.guarantee) > 0 ? !!show && show.guaranteeReceived === true && !(guaranteeOwed(show) > 0) : !!show && show.guaranteeNone === true,
      merch: num(inc.merch) > 0 ? !!show && show.merchReceived === true : !!show && show.merchNone === true
    };
  }
  function showMoneyState(show) {
    if (!show || !show.loggedAt) return null;
    var r = showReceived(show);
    return r.guarantee && r.merch ? 'settled' : 'owed';
  }
  var CASH_MOVES = { deposit: 'Deposited in the bank', handoff: 'Handed off (not a tour cost)' };
  function cashByShow(tour) {
    var nights = rows(tour && tour.shows).filter(function (s) {
      return s.loggedAt && num(s.merchCash) > 0;
    }).sort(byDate).map(function (s) {
      return { show: s, took: round(num(s.merchCash) * 100) / 100, used: 0, entries: [] };
    });
    var byId = {};
    nights.forEach(function (n) { byId[n.show.id] = n; });
    var loose = [];
    rows(tour && tour.cashLog).sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || '')) || (a.createdAt || 0) - (b.createdAt || 0);
    }).forEach(function (x) {
      if (x.showId && byId[x.showId]) { byId[x.showId].used += num(x.amount); byId[x.showId].entries.push(x); }
      else loose.push(x);
    });
    var spare = loose.reduce(function (t, x) { return t + num(x.amount); }, 0);
    nights.forEach(function (n) {
      var room = Math.max(0, n.took - n.used);
      var take = Math.min(room, spare);
      n.used += take; spare -= take;
      n.left = round((n.took - n.used) * 100) / 100;
      n.used = round(n.used * 100) / 100;
    });
    return { nights: nights, loose: loose };
  }
  function cashSummary(tour) {
    var took = rows(tour && tour.shows).reduce(function (t, s) {
      return s.loggedAt ? t + num(s.merchCash) : t;
    }, 0);
    var used = rows(tour && tour.cashLog).reduce(function (t, x) { return t + num(x.amount); }, 0);
    return { took: round(took * 100) / 100, used: round(used * 100) / 100,
      left: round((took - used) * 100) / 100 };
  }
  function newestFirst(a, b) {
    var da = parseDay(a && a.date) ? a.date : '0000', db = parseDay(b && b.date) ? b.date : '0000';
    if (da !== db) return db < da ? -1 : 1;
    if (a.seq != null && b.seq != null && isFinite(a.seq) && isFinite(b.seq) && Number(a.seq) !== Number(b.seq)) {
      return Number(a.seq) - Number(b.seq);
    }
    var pa = String(a.posted || a.date || ''), pb = String(b.posted || b.date || '');
    if (pa !== pb) return pb < pa ? -1 : 1;
    return String(a.merchant || '').localeCompare(String(b.merchant || ''));
  }
  var VENDOR_ALIASES = [
    { label: 'Amazon', re: /\b(amazon|amzn|amz|prime video)\b/ },
    { label: 'Verizon', re: /\b(verizon|vzw|vzwrlss|vz wireless)\b/ },
    { label: 'AT&T', re: /\b(at t|att)\b/ },
    { label: 'T-Mobile', re: /\b(t mobile|tmobile)\b/ },
    { label: 'LA Fitness', re: /\bla ?fitness\b/ },
    { label: 'Planet Fitness', re: /\bplanet fit(ness)?\b/ },
    { label: 'Apple', re: /\b(apple|itunes|icloud)\b/ },
    { label: 'Google', re: /\b(google|youtube|gsuite)\b/ },
    { label: 'Spotify', re: /\b(sp)?otify\b/ },
    { label: 'Netflix', re: /\bnetflix\b/ },
    { label: 'Adobe', re: /\badobe\b/ },
    { label: 'Dropbox', re: /\bdropbox\b/ },
    { label: 'Squarespace', re: /\b(sq)?uarespace\b/ },
    { label: 'QuickBooks', re: /\b(quickbooks|intuit|tuit)\b/ },
    { label: 'Xfinity', re: /\b(xfinity|comcast)\b/ },
    { label: 'Spectrum', re: /\b(spectrum|ectrum|trum|charter comm\w*)\b/ },
    { label: 'Storage', re: /\b(storage|extra space|cubesmart|storquest|u haul|uhaul)\b/ }
  ];
  var VENDOR_TAIL = /^(com|net|org|co|inc|llc|ltd|corp|usa|us|bill|billing|payment|payments|pmt|pymt|autopay|recurring|online|web|www)$/;
  function vendorNorm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function vendorOf(name) {
    var n = vendorNorm(name);
    if (!n) return { key: '', label: 'Other' };
    for (var i = 0; i < VENDOR_ALIASES.length; i++) {
      if (VENDOR_ALIASES[i].re.test(n)) return { key: vendorNorm(VENDOR_ALIASES[i].label), label: VENDOR_ALIASES[i].label };
    }
    var words = n.split(' ').filter(function (w, i) { return i === 0 || !/\d/.test(w); });
    while (words.length > 1 && VENDOR_TAIL.test(words[words.length - 1])) words.pop();
    var key = words.join(' ') || n;
    var raw = String(name).trim();
    var whole = vendorNorm(raw) === key;
    var label = whole && raw !== raw.toUpperCase() && raw !== raw.toLowerCase() ? raw
      : whole && raw === raw.toUpperCase() && /&/.test(raw) && raw.length <= 6 ? raw
      : key.replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); });
    return { key: key, label: label };
  }
  function vendorGroups(entries, over) {
    var o = isObj(over) ? over : {};
    var one = isObj(o.one) ? o.one : {}, by = isObj(o.by) ? o.by : {}, names = isObj(o.names) ? o.names : {};
    var said = function (v) { return typeof v === 'string' && vendorNorm(v) ? v.trim() : ''; };
    var map = {}, order = [];
    (entries || []).forEach(function (e) {
      var forced = (e.id != null && said(one[e.id])) || (!e.loose && said(by[vendorNorm(e.name)]));
      var src = forced ? { key: '', label: forced }
        : e.loose ? { key: '', label: 'Other' } : vendorOf(e.name);
      var label = forced || (src.key ? (said(names[src.key]) || src.label) : 'Other');
      var id = vendorNorm(label);
      if (!id || id === 'other') { id = ''; label = 'Other'; }
      var g = map['k:' + id];
      if (!g) {
        g = map['k:' + id] = { key: id, label: label, keys: [], total: 0, credit: 0, debit: 0, cash: 0, count: 0, entries: [] };
        order.push(g);
      }
      if (id && src.key && g.keys.indexOf(src.key) < 0) g.keys.push(src.key);
      g.entries.push(e); g.count += 1;
      if (e.counts === false) return;
      var a = num(e.amount);
      g.total += a;
      g[e.how === 'cash' ? 'cash' : e.how === 'debit' ? 'debit' : 'credit'] += a;
    });
    order.forEach(function (g) {
      ['total', 'credit', 'debit', 'cash'].forEach(function (k) { g[k] = round(g[k] * 100) / 100; });
    });
    return order.sort(function (a, b) {
      return (a.key === '' ? 1 : 0) - (b.key === '' ? 1 : 0) || b.total - a.total || a.label.localeCompare(b.label);
    });
  }
  function tourRun(tour) {
    var a = tourStart(tour), b = tourEnd(tour);
    if (!a || !b) return null;
    if (parseDay(tour.rehearsalStart) && tour.rehearsalStart < a) a = tour.rehearsalStart;
    return { from: a, to: b };
  }
  function tourDays(tour) {
    var r = tourRun(tour);
    return r ? Math.max(0, daysBetween(r.from, r.to)) + 1 : 0;
  }
  function personRun(tour, p) {
    var r = tourRun(tour);
    if (!r) return null;
    var from = p && parseDay(p.from) && p.from > r.from ? p.from : r.from;
    var to = p && parseDay(p.to) && p.to < r.to ? p.to : r.to;
    return to < from ? { from: from, to: to, days: 0 } : { from: from, to: to, days: daysBetween(from, to) + 1 };
  }
  function personDays(tour, p) { var r = personRun(tour, p); return r ? r.days : 0; }
  function payPeriods(tour, per, p) {
    var d = p ? personDays(tour, p) : tourDays(tour);
    if (!d) return 0;
    if (per === 'day') return d;
    if (per === 'week') return d / 7;
    if (per === 'month') return d / 30;
    return 0;
  }
  function crewPay(tour, p) {
    var rate = num(p && p.rate), n = payPeriods(tour, p && p.per, p);
    if (p && !p.payTyped && rate > 0 && n > 0) return round(rate * n * 100) / 100;
    return num(p && p.pay);
  }
  function isMember(p) {
    if (!p) return false;
    if (p.member === true) return true;
    if (p.member === false) return false;
    if (p.band === true) return true;
    if (p.band === false) return false;
    return /^\s*(artist|member|band member)\s*$/i.test(String(p.title || ''));
  }
  function crewProjection(tour) {
    return rows(tour && tour.crew).reduce(function (t, p) { return t + crewPay(tour, p); }, 0);
  }
  function crewSplit(tour) {
    var out = { members: 0, crew: 0, hasMembers: false };
    rows(tour && tour.crew).forEach(function (p) {
      if (isMember(p)) { out.hasMembers = true; out.members += crewPay(tour, p); } else out.crew += crewPay(tour, p);
    });
    return out;
  }
  function chargeLine(tour, x) {
    var k = x && x.category ? x.category : null;
    if (k !== 'crew') return k;
    if (crewSplitOf(x)) { var parts = chargeLineParts(tour, x); return parts.length === 1 ? parts[0].line : 'crew'; }
    var p = crewOf(tour, x);
    return p && isMember(p) ? 'members' : 'crew';
  }
  function crewOf(tour, x) {
    var p = x && x.crewId && tour && isObj(tour.crew) ? tour.crew[x.crewId] : null;
    return isObj(p) ? p : null;
  }
  function crewSplitOf(x) {
    var sp = x && isObj(x.crewSplit) ? x.crewSplit : null;
    if (!sp) return null;
    var out = {}, n = 0, sum = 0;
    Object.keys(sp).forEach(function (k) {
      var a = round(num(sp[k]) * 100) / 100;
      if (a > 0) { out[k] = a; n += 1; sum += a; }
    });
    if (!n || sum > num(x.amount) + 0.01) return null;
    return out;
  }
  function crewShares(tour, x) {
    var amt = round(num(x && x.amount) * 100) / 100;
    var sp = crewSplitOf(x);
    if (sp) {
      var shares = [], named = 0;
      Object.keys(sp).forEach(function (k) {
        var p = tour && isObj(tour.crew) && isObj(tour.crew[k]) ? tour.crew[k] : null;
        if (!p) return;
        shares.push({ crewId: k, person: p, amount: sp[k] });
        named += sp[k];
      });
      return { shares: shares, loose: Math.max(0, round((amt - named) * 100) / 100), split: true };
    }
    var one = crewOf(tour, x);
    return one ? { shares: [{ crewId: x.crewId, person: one, amount: amt }], loose: 0, split: false }
      : { shares: [], loose: amt, split: false };
  }
  function crewShareOf(tour, x, crewId) {
    if (!crewId) return 0;
    return crewShares(tour, x).shares.reduce(function (t, s) { return s.crewId === crewId ? t + s.amount : t; }, 0);
  }
  function chargeLineParts(tour, x) {
    var k = x && x.category ? x.category : null;
    if (!k) return [];
    if (k !== 'crew') return [{ line: k, amount: num(x.amount) }];
    var sh = crewShares(tour, x), by = {};
    sh.shares.forEach(function (s) { var l = isMember(s.person) ? 'members' : 'crew'; by[l] = (by[l] || 0) + s.amount; });
    if (sh.loose > 0) by.crew = (by.crew || 0) + sh.loose;
    return Object.keys(by).map(function (l) { return { line: l, amount: round(by[l] * 100) / 100 }; });
  }
  function isHelper(p) { return !!(p && p.helper === true); }
  var WHO_STOP = {};
  ('zelle venmo paypal cashapp cash app square sqc payment payments pmt paid pay transfer transfers xfer trnsfr trf ' +
   'online banking bank mobile web internet ach wire direct instant sent send to from for the and chk chkg checking ' +
   'sav savings acct account card crd debit credit purchase pos ref conf confirmation des indn ppd ccd inc llc ltd corp ' +
   'company america bofa boa amex chase wells fargo visa mastercard express american business gold deposit withdrawal ' +
   'fee fees request money apple google recurring memo week weeks tour per diem diems rent merch refund return ' +
   'reversal via with your you our new misc other jr sr ii iii').split(' ').forEach(function (w) { WHO_STOP[w] = true; });
  var WHO_TITLE = { mr: true, mrs: true, ms: true, miss: true, mister: true, dr: true };
  var WHO_SUFFIX = /^(jr|sr|ii|iii|iv)$/;
  var WHO_NICK = [['robert', 'rob', 'bob', 'bobby', 'robbie'], ['william', 'will', 'bill', 'billy', 'liam'], ['james', 'jim', 'jimmy', 'jamie'],
    ['michael', 'mike', 'mikey', 'mick'], ['david', 'dave', 'davey'], ['andrew', 'andy', 'drew'], ['anthony', 'tony'], ['elizabeth', 'liz', 'beth', 'lizzy'],
    ['steven', 'stephen', 'steve'], ['jacob', 'jake'], ['connor', 'conor', 'conner'], ['spencer', 'spence'], ['richard', 'rick', 'rich', 'dick', 'ricky'],
    ['katherine', 'catherine', 'kathryn', 'kate', 'katie', 'kathy', 'cathy', 'kat'], ['edward', 'ed', 'eddie', 'ted', 'teddy'],
    ['margaret', 'maggie', 'meg'], ['rebecca', 'becky', 'becca'], ['susan', 'sue', 'suzy'], ['jennifer', 'jen', 'jenny']];
  function whoKey(name) { return String(name == null ? '' : name).trim().toLowerCase().replace(/\s+/g, ' '); }
  function whoText(text) {
    return String(text == null ? '' : text)
      .replace(/["“”][^"“”]*(["“”]|$)/g, ' ')
      .replace(/\b(conf(irmation)?|ref)\b\s*(#|no\.?)?\s*:?\s*\S*/gi, ' ');
  }
  function whoParts(text) {
    var s = whoText(text), digits = [], handles = [], toks = [], whole = [], m, seg = 0;
    var dre = /(?:^|[^a-z0-9])[x*•·#]*(\d{4})(?![a-z0-9])/gi;
    while ((m = dre.exec(s))) { if (s.charAt(m.index) !== '/' && digits.indexOf(m[1]) < 0) digits.push(m[1]); }
    var hre = /(?:^|\s)([@$])([a-z][a-z0-9._-]{1,29})/gi;
    while ((m = hre.exec(s))) {
      var hd = m[2].toLowerCase().replace(/[._-]+$/, '');
      if (hd.length >= 3 && handles.indexOf(m[1] + hd) < 0) handles.push(m[1] + hd);
    }
    s.split(/[;,|:*()]+/).forEach(function (part) {
      seg += 1;
      part.split(/[\s\/&+]+/).forEach(function (tok) {
        if (!tok || /[0-9]/.test(tok)) return;
        var w = tok.toLowerCase().replace(/['’.]/g, '').replace(/[^a-z-]/g, '').replace(/^-+|-+$/g, '');
        if (!w) return;
        var flat = w.replace(/-/g, '');
        toks.push({ w: flat, seg: seg });
        whole.push(flat);
        if (w.indexOf('-') >= 0) w.split('-').forEach(function (p) { if (p.length >= 2) toks.push({ w: p, seg: seg, part: true }); });
      });
    });
    var payee = whole.filter(function (w) { return w.length >= 2 && !WHO_STOP[w] && !WHO_TITLE[w]; }).slice(0, 8);
    return { digits: digits, handles: handles, toks: toks, payee: payee.join(' '), payeeWords: payee.length };
  }
  function whoCard(account) {
    var m = /(\d{4})\D*$/.exec(String(account == null ? '' : account));
    return m ? m[1] : '';
  }
  function looksLikePay(text) {
    return /\b(zelle|venmo|paypal|cash ?app|transfer|xfer|trnsfr|wire|payment to|pmt to|sent to|chk)\b/i.test(whoText(text));
  }
  function whoNameParts(name) {
    var parts = String(name == null ? '' : name).toLowerCase().replace(/['’.]/g, '').split(/[^a-z-]+/).filter(Boolean);
    while (parts.length > 1 && WHO_SUFFIX.test(parts[parts.length - 1])) parts.pop();
    return parts.map(function (x) { return x.replace(/-/g, ''); }).filter(Boolean);
  }
  function whoFirstLike(a, b) {
    if (a === b) return true;
    var lo = a.length < b.length ? a : b, hi = lo === a ? b : a;
    if (lo.length >= 3 && hi.length - lo.length >= 2 && hi.indexOf(lo) === 0) return true;
    return WHO_NICK.some(function (g) { return g.indexOf(a) >= 0 && g.indexOf(b) >= 0; });
  }
  function whoBefore(toks, i) {
    for (var j = i - 1; j >= 0 && toks[j].seg === toks[i].seg; j--) {
      var w = toks[j].w;
      if (w.length < 2) continue;
      return WHO_STOP[w] || WHO_TITLE[w] ? '' : w;
    }
    return '';
  }
  function whoFit(person, toks) {
    var np = whoNameParts(person && person.name);
    if (!np.length) return '';
    var words = toks.map(function (t) { return t.w; });
    var where = function (w) { var out = []; words.forEach(function (x, i) { if (x === w) out.push(i); }); return out; };
    if (np.length === 1) {
      if (np[0].length < 4) return '';
      var at = where(np[0]);
      if (!at.length) return '';
      var beside = at.every(function (i) {
        var t = toks[i + 1];
        if (t && t.seg === toks[i].seg && t.w.length >= 2 && !WHO_STOP[t.w] && !WHO_TITLE[t.w] && !t.part && t.w !== np[0]) return true;
        var b = whoBefore(toks, i);
        return !!b && b !== np[0];
      });
      return beside ? 'first' : 'single';
    }
    var first = np[0], last = np[np.length - 1];
    if (where(first + last).length || where(last + first).length) return 'exact';
    var lastAt = where(last), firstAt = where(first);
    var likeAt = [];
    words.forEach(function (x, i) { if (x !== first && x.length >= 2 && whoFirstLike(first, x)) likeAt.push(i); });
    if (lastAt.length) {
      if (firstAt.length) return 'exact';
      if (likeAt.length) return 'near';
      var other = lastAt.every(function (i) { var b = whoBefore(toks, i); return !!b && !whoFirstLike(first, b); });
      return other ? 'clash' : 'last';
    }
    if (firstAt.length) {
      var initial = firstAt.some(function (i) { var t = toks[i + 1]; return !!t && t.seg === toks[i].seg && t.w === last.charAt(0); });
      if (initial) return 'near';
      var another = firstAt.every(function (i) {
        var t = toks[i + 1];
        return !!t && t.seg === toks[i].seg && t.w.length >= 2 && !WHO_STOP[t.w] && !WHO_TITLE[t.w] && !t.part && t.w !== last;
      });
      return another ? 'clash' : 'first';
    }
    return '';
  }
  function whoIndex() { return { digit: {}, handle: {}, payee: {}, combo: {}, card: {}, who: {} }; }
  function whoBump(map, key, person) {
    var by = map[key] || (map[key] = {}), k = whoKey(person.name);
    var rec = by[k] || (by[k] = { n: 0, name: String(person.name).trim(), id: '', email: '' });
    rec.n += 1;
    if (person.id) rec.id = String(person.id);
    if (person.email) rec.email = String(person.email).trim().toLowerCase();
  }
  function whoComboKey(parts, card) { return parts.payee + '|' + parts.digits.join(',') + '|' + card; }
  function whoLearn(idx, line, person) {
    if (!isObj(idx) || !isObj(person) || !whoKey(person.name)) return idx;
    var l = isObj(line) ? line : {}, parts = whoParts(l.merchant), card = whoCard(l.account);
    parts.digits.forEach(function (d) { whoBump(idx.digit, d, person); });
    parts.handles.forEach(function (h) { whoBump(idx.handle, h, person); });
    var named = parts.payeeWords >= 2 && whoFit(person, parts.toks) !== '';
    if (named) whoBump(idx.payee, parts.payee, person);
    if (named || parts.digits.length) whoBump(idx.combo, whoComboKey(parts, card), person);
    if (card) whoBump(idx.card, card, person);
    var k = whoKey(person.name);
    idx.who[k] = (idx.who[k] || 0) + 1;
    return idx;
  }
  function whoHistory(books) {
    var idx = whoIndex();
    (books || []).forEach(function (t) {
      rows(t && t.charges).forEach(function (ch) {
        if (ch.accounted || ch.category !== 'crew' || !(num(ch.amount) > 0)) return;
        var p = crewOf(t, ch);
        if (p && whoKey(p.name)) whoLearn(idx, ch, { id: ch.crewId, name: p.name, email: p.email });
      });
    });
    return idx;
  }
  function whoLeader(by) {
    if (!isObj(by)) return null;
    var keys = Object.keys(by), top = null, rest = 0;
    keys.forEach(function (k) { if (!top || by[k].n > by[top].n) top = k; });
    keys.forEach(function (k) { if (k !== top) rest += by[k].n; });
    return top && by[top].n >= 3 * rest ? by[top] : null;
  }
  function whoFind(pool, rec) {
    var low = whoKey(rec.name), i;
    for (i = 0; i < pool.length; i++) if (rec.id && pool[i].id === rec.id) return pool[i];
    for (i = 0; i < pool.length; i++) {
      var em = String(pool[i].email || '').trim().toLowerCase();
      if (rec.email && em && em === rec.email) return pool[i];
    }
    for (i = 0; i < pool.length; i++) if (low && whoKey(pool[i].name) === low) return pool[i];
    return null;
  }
  function whoSuggest(line, people, idx) {
    var out = { pick: null, choices: [], basis: '' };
    var l = isObj(line) ? line : {}, text = String(l.merchant == null ? '' : l.merchant);
    var pay = looksLikePay(text);
    var pool = [], seen = {};
    (people || []).forEach(function (p) {
      var k = p && whoKey(p.name);
      if (!k || seen[k]) return;
      seen[k] = true; pool.push(p);
    });
    if (!pool.length) return out;
    var parts = whoParts(text), card = whoCard(l.account), ix = isObj(idx) ? idx : whoIndex();
    var learned = [], learnedKeys = {}, soft = [], softKeys = {};
    var learn = function (rec, only) {
      var p = rec && whoFind(pool, rec);
      if (!p) return;
      var into = only ? soft : learned, keys = only ? softKeys : learnedKeys;
      if (!keys[whoKey(p.name)]) { keys[whoKey(p.name)] = true; into.push(p); }
    };
    if (pay) {
      var combo = parts.payeeWords >= 2 || parts.digits.length ? whoLeader(ix.combo[whoComboKey(parts, card)]) : null;
      if (combo) learn(combo);
      else {
        parts.digits.forEach(function (d) { learn(whoLeader(ix.digit[d])); });
        var newAccount = parts.digits.length > 0 && !learned.length;
        parts.handles.forEach(function (h) { learn(whoLeader(ix.handle[h]), newAccount); });
        if (parts.payeeWords >= 2) learn(whoLeader(ix.payee[parts.payee]), newAccount);
      }
    }
    var fits = pool.map(function (p) {
      var f = pay ? whoFit(p, parts.toks) : '';
      if (f === 'single') {
        var w = whoNameParts(p.name)[0];
        f = pool.filter(function (q) { return whoNameParts(q.name).indexOf(w) >= 0; }).length === 1 ? 'exact' : 'first';
      }
      return { p: p, f: f };
    });
    var of = function (kind) { return fits.filter(function (x) { return x.f === kind; }).map(function (x) { return x.p; }); };
    var fitOf = function (p) { var x = fits.filter(function (y) { return y.p === p; })[0]; return x ? x.f : ''; };
    var byCard = ix.card[card] || {};
    var order = function (list) {
      return list.slice().sort(function (a, b) {
        var ka = whoKey(a.name), kb = whoKey(b.name);
        return ((byCard[kb] ? byCard[kb].n : 0) - (byCard[ka] ? byCard[ka].n : 0)) || ((ix.who[kb] || 0) - (ix.who[ka] || 0));
      });
    };
    var done = function (pick, choices, basis) {
      if (pick) { out.pick = pick; out.basis = basis; }
      else { out.choices = order(choices).slice(0, 5); out.basis = basis; }
      return out;
    };
    var union = function (a, b) {
      var all = a.slice();
      b.forEach(function (p) { if (all.indexOf(p) < 0) all.push(p); });
      return all;
    };
    var exact = of('exact'), near = of('near');
    learned = learned.filter(function (p) { return fitOf(p) !== 'clash'; });
    soft = soft.filter(function (p) { return fitOf(p) !== 'clash'; });
    if (exact.length === 1) {
      var others = union(learned, soft).filter(function (p) { return p !== exact[0]; });
      return others.length ? done(null, [exact[0]].concat(others), 'name') : done(exact[0], [], 'name');
    }
    if (exact.length > 1) return done(null, union(union(exact, learned), soft), 'name');
    var partial = union(of('last'), of('first'));
    if (learned.length === 1) {
      var rival = union(near, partial).filter(function (p) { return p !== learned[0]; });
      return rival.length && !fitOf(learned[0]) ? done(null, [learned[0]].concat(rival), 'learned') : done(learned[0], [], 'learned');
    }
    if (learned.length > 1) return done(null, learned, 'learned');
    if (soft.length) {
      if (near.length === 1 && soft.every(function (p) { return p === near[0]; })) return done(near[0], [], 'name');
      return done(null, union(soft, union(near, partial)), 'learned');
    }
    if (near.length === 1) return done(near[0], [], 'name');
    if (near.length > 1) return done(null, near, 'name');
    return partial.length ? done(null, partial, 'name') : out;
  }
  var MY_PAY_CATS = [
    { key: 'food', label: 'Food & drink' },
    { key: 'lodging', label: 'Lodging' },
    { key: 'travel', label: 'Travel' },
    { key: 'gear', label: 'Gear & supplies' },
    { key: 'other', label: 'Other' }
  ];
  function payBook(book) {
    var b = isObj(book) ? book : {};
    var entries = rows(b.entries), proj = isObj(b.projected) ? b.projected : {};
    var by = {};
    MY_PAY_CATS.forEach(function (c) {
      by[c.key] = { key: c.key, label: c.label, projected: optNum(proj[c.key]), credit: 0, debit: 0, cash: 0, total: 0, n: 0 };
    });
    entries.forEach(function (e) {
      var g = by[e && e.category] || by.other, a = num(e && e.amount);
      if (!(a > 0)) return;
      g[e.how === 'cash' ? 'cash' : e.how === 'debit' ? 'debit' : 'credit'] += a;
      g.total += a; g.n += 1;
    });
    var lines = MY_PAY_CATS.map(function (c) {
      var g = by[c.key];
      ['credit', 'debit', 'cash', 'total'].forEach(function (k) { g[k] = round(g[k] * 100) / 100; });
      return g;
    });
    var spent = round(lines.reduce(function (t, l) { return t + l.total; }, 0) * 100) / 100;
    var projected = round(lines.reduce(function (t, l) { return t + (l.projected == null ? 0 : l.projected); }, 0) * 100) / 100;
    return { lines: lines, spent: spent, projected: projected };
  }
  var MY_PAY_INCOME = [
    { key: 'weekly', label: 'Weekly pay' },
    { key: 'perdiem', label: 'Per diems' },
    { key: 'buyout', label: 'Buyouts' },
    { key: 'bonus', label: 'Bonus' },
    { key: 'other', label: 'Other' }
  ];
  function payIncome(book, payments) {
    var b = isObj(book) ? book : {};
    var by = {};
    MY_PAY_INCOME.forEach(function (c) { by[c.key] = { key: c.key, label: c.label, total: 0, n: 0 }; });
    var tour = { key: 'tour', label: 'Pay from the tour', total: 0, n: 0 };
    (Array.isArray(payments) ? payments : rows(payments)).forEach(function (p) {
      var a = num(p && p.amount);
      if (a > 0) { tour.total += a; tour.n += 1; }
    });
    rows(b.income).forEach(function (e) {
      var g = by[e && e.category] || by.other, a = num(e && e.amount);
      if (!(a > 0)) return;
      g.total += a; g.n += 1;
    });
    var lines = [tour].concat(MY_PAY_INCOME.map(function (c) { return by[c.key]; }));
    lines.forEach(function (l) { l.total = round(l.total * 100) / 100; });
    return { lines: lines, gross: round(lines.reduce(function (t, l) { return t + l.total; }, 0) * 100) / 100 };
  }
  function payBalanceSeries(book, payments, until) {
    var b = isObj(book) ? book : {};
    var inc = {}, out = {};
    var add = function (map, d, a) { if (parseDay(d) && a > 0) map[d] = (map[d] || 0) + a; };
    (Array.isArray(payments) ? payments : rows(payments)).forEach(function (p) { add(inc, p && p.date, num(p && p.amount)); });
    rows(b.income).forEach(function (e) { add(inc, e.date, num(e.amount)); });
    rows(b.entries).forEach(function (e) { add(out, e.date, num(e.amount)); });
    var days = Object.keys(inc).concat(Object.keys(out)).filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
    if (!days.length) return [];
    var end = parseDay(until) && until > days[days.length - 1] ? until : days[days.length - 1];
    if (days.indexOf(end) < 0) days.push(end);
    days.unshift(addDays(days[0], -1));
    var ci = 0, co = 0;
    return days.map(function (d) {
      ci += inc[d] || 0; co += out[d] || 0;
      return { date: d, income: round(ci * 100) / 100, spent: round(co * 100) / 100 };
    });
  }
  function payStanding(info) {
    var i = isObj(info) ? info : {};
    var tour = isObj(i.tour) ? i.tour : {};
    var like = { shows: {}, spanStart: tour.spanStart, spanEnd: tour.spanEnd, rehearsalStart: tour.rehearsalStart };
    if (parseDay(tour.first)) like.shows.a = { date: tour.first };
    if (parseDay(tour.last)) like.shows.b = { date: tour.last };
    var total = isObj(i.crew) ? crewPay(like, i.crew) : 0;
    var list = Array.isArray(i.payments) ? i.payments : rows(i.payments);
    var paid = round(list.reduce(function (t, p) { return t + num(p && p.amount); }, 0) * 100) / 100;
    return { total: round(total * 100) / 100, paid: paid, owed: Math.max(0, round((total - paid) * 100) / 100), onCrew: isObj(i.crew) };
  }
  var TOUR_FILLER = /\b(the|tour|tours|a|an|of|and|with|presents|leg|part|pt|run)\b/g;
  function tourKeyLoose(name) {
    return String(name || '').toLowerCase().replace(/[\u2019'".,:;!?()\[\]\-\u2013\u2014\/&+]/g, ' ')
      .replace(TOUR_FILLER, ' ').replace(/\s+/g, ' ').trim();
  }
  var TOUR_ROLES = ['headline', 'co-headline', 'support', 'festival'];
  function tourRole(r) { r = String(r || '').toLowerCase().trim(); return TOUR_ROLES.indexOf(r) >= 0 ? r : ''; }
  function dayOrMonth(s, asEnd) {
    s = String(s || '').trim();
    if (parseDay(s)) return { d: s, exact: true };
    if (/^\d{4}-\d{2}$/.test(s)) {
      if (!asEnd) return { d: s + '-01', exact: false };
      var d = new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0));
      return { d: s + '-' + String(d.getUTCDate()).padStart(2, '0'), exact: false };
    }
    return null;
  }
  function daysApart(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }
  function tourDate(d) {
    var out, marks;
    if (isObj(d)) {
      if (!parseDay(d.date)) return null;
      out = { date: d.date, city: String(d.city || '').trim(), venue: String(d.venue || '').trim() };
      marks = d.marks;
    } else {
      var parts = String(d || '').split('|').map(function (x) { return x.trim(); });
      if (!parseDay(parts[0])) return null;
      out = { date: parts[0], city: parts[1] || '', venue: parts[2] || '' };
      marks = parts[3];
    }
    marks = String(marks || '').replace(/[^#*†‡§¶^~+%♦✝✞]/g, '').slice(0, 12);
    if (marks) out.marks = marks;
    return out;
  }
  function unionLines(a, b, cap) {
    var out = [], seen = {};
    [].concat(Array.isArray(a) ? a : a ? [a] : [], Array.isArray(b) ? b : b ? [b] : []).forEach(function (x) {
      var s = String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, 300);
      if (!s || seen[s.toLowerCase()] || out.length >= cap) return;
      seen[s.toLowerCase()] = true; out.push(s);
    });
    return out;
  }
  function actsOf(lineup) {
    return String(lineup || '').toLowerCase().split(/,|\band\b|&|\//).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 1; });
  }
  function sharesAct(a, b) {
    var x = actsOf(a), y = actsOf(b);
    return x.some(function (n) { return y.indexOf(n) >= 0; });
  }
  function madeUpName(n) { return /^(spring|summer|fall|autumn|winter|early|late|\d{4}|[a-z]+ \d{4})\b/i.test(String(n || '')); }
  function mergeTourCandidates(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (c) {
      if (!isObj(c)) return;
      var name = String(c.name || '').replace(/\s+/g, ' ').trim();
      var s0 = dayOrMonth(c.start, false), e0 = dayOrMonth(c.end, true);
      if (name.length < 2 || !s0 || !e0 || e0.d < s0.d) return;
      var start = s0.d, end = e0.d;
      var key = tourKeyLoose(name);
      if (!key) return;
      var role = tourRole(c.role);
      var dates = (Array.isArray(c.dates) ? c.dates : []).map(tourDate).filter(Boolean);
      var sources = (Array.isArray(c.sources) ? c.sources : c.source ? [c.source] : [])
        .map(String).filter(function (u) { return /^https:\/\//.test(u); });
      var lineup = String(c.lineup || '').replace(/\s+/g, ' ').trim();
      var legend = unionLines(c.legend, null, 40), skipped = unionLines(c.skipped, null, 200), printed = c.printed === true;
      var hit = null;
      out.forEach(function (o) {
        if (hit) return;
        var near = o.start <= end && start <= o.end || Math.abs(daysApart(o.end, start)) <= 120 || Math.abs(daysApart(end, o.start)) <= 120;
        if (o.key === key && near) hit = o;
        else if (o.start <= end && start <= o.end && o.role === role && sharesAct(o.lineup, lineup)) hit = o;
      });
      if (!hit) {
        var fresh = { key: key, name: name, role: role, start: start, end: end, startExact: s0.exact, endExact: e0.exact,
          region: String(c.region || '').trim(), lineup: lineup, dates: dates, sources: sources };
        if (legend.length) fresh.legend = legend;
        if (skipped.length) fresh.skipped = skipped;
        if (printed) fresh.printed = true;
        out.push(fresh);
        return;
      }
      if (s0.exact && !hit.startExact) { hit.start = start; hit.startExact = true; }
      else if (s0.exact === hit.startExact && start < hit.start) hit.start = start;
      if (e0.exact && !hit.endExact) { hit.end = end; hit.endExact = true; }
      else if (e0.exact === hit.endExact && end > hit.end) hit.end = end;
      if (madeUpName(hit.name) && !madeUpName(name)) { hit.name = name; hit.key = key; delete hit.printed; }
      if (printed && hit.key === key) hit.printed = true;
      if (legend.length) hit.legend = unionLines(hit.legend, legend, 40);
      if (skipped.length) hit.skipped = unionLines(hit.skipped, skipped, 200);
      if (lineup.length > hit.lineup.length) hit.lineup = lineup;
      if (!hit.region && c.region) hit.region = String(c.region).trim();
      var have = {};
      hit.dates.forEach(function (d) { have[d.date] = d; });
      dates.forEach(function (d) {
        if (!have[d.date]) { have[d.date] = d; hit.dates.push(d); }
        else if (d.marks && !have[d.date].marks) have[d.date].marks = d.marks;
      });
      sources.forEach(function (u) { if (hit.sources.indexOf(u) < 0 && hit.sources.length < 6) hit.sources.push(u); });
    });
    var byKey = {};
    out.forEach(function (o) { byKey[o.key] = (byKey[o.key] || 0) + 1; });
    out.forEach(function (o) {
      if (byKey[o.key] > 1 && !/\b(19|20)\d{2}\b/.test(o.name)) { o.name = o.name + ' ' + o.start.slice(0, 4); o.key = tourKeyLoose(o.name); delete o.printed; }
      o.dates.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      delete o.startExact; delete o.endExact;
    });
    return out;
  }
  function hasLegendFor(text, name) {
    var nm = String(name || '').trim().replace(/^the\s+/i, '');
    if (nm.length < 2) return false;
    var act = nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return new RegExp('[#*\u2020\u2021\u00a7\u00b6^~+%\u2666\u271d\u271e][^\\n]*' + act + '|\\(\\s*(?:(?:no|without)\\s+)?(?:the\\s+)?' + act, 'i')
      .test(String(text || ''));
  }
  var LABEL_WORDS = new RegExp('\\b(?:the|a|an|and|of|in|on|with|tour|tours|world|mini|club|clubs|arena|arenas|theatre|theater|headline|headlining' +
    '|co-headline|co-headlining|co|support|supporting|spring|summer|fall|autumn|winter|early|late|mid|north|south|east|west' +
    '|northeast|northwest|southeast|southwest|midwest|central|eastern|western|northern|southern|coast|american|america|americas' +
    '|us|usa|uk|britain|british|england|english|scotland|scottish|ireland|irish|wales|welsh|europe|european|eu' +
    '|scandinavia|scandinavian|nordic|asia|asian|japan|japanese|australia|australian|aus|new|zealand|nz|canada|canadian|mexico' +
    '|mexican|latin|brazil|germany|german|france|french|spain|spanish|italy|italian|russia|china|korea|philippines|india|africa' +
    '|african|middle|international|national|regional|global|holiday|christmas|acoustic|intimate|part|pt|ii|iii|iv' +
    '|[0-9]+(?:st|nd|rd|th)?|first|second|third)\\b', 'g');
  function labelName(name, lineup) {
    var s = String(name || '').toLowerCase();
    if (!s.trim()) return false;
    if (madeUpName(name)) return true;
    if (/\b(?:run|runs|shows|dates|gigs|leg|legs|stint|swing|trek|one-offs?|sideshows?|appearances?)\b/.test(s)) return true;
    if (/^(?:\S+\s+){0,4}?(?:tour|touring|tours|support|supporting|opening|dates?)\s+(?:with|for|alongside|behind)\b/.test(s)) return true;
    String(lineup || '').toLowerCase().split(/\s*(?:,|;|&|\/|\+|\band\b)\s*/).forEach(function (a) {
      a = a.replace(/\(.*?\)/g, '').trim();
      if (a.length >= 2) s = s.split(a).join(' ');
    });
    return s.replace(LABEL_WORDS, ' ').replace(/[^a-z]+/g, '') === '';
  }
  function billActs(lineup) {
    return actsOf(lineup).map(function (x) { return x.replace(/[(\[][^)\]]*[)\]]?/g, '').replace(/[^a-z0-9]+/g, ''); }).filter(Boolean);
  }
  function tourKnown(name, toursList, start, end, lineup) {
    var k = tourKeyLoose(name);
    var a = parseDay(start) ? start : '', b = parseDay(end) ? end : a;
    var mine = billActs(lineup);
    return !!k && (Array.isArray(toursList) ? toursList : []).some(function (t) {
      if (tourKeyLoose(t && t.name) !== k) return false;
      var ta = parseDay(t.first) ? t.first : '', tb = parseDay(t.last) ? t.last : ta;
      if (!a || !ta) return true;
      if (ta <= b && a <= tb) return true;
      var gap = Math.min(Math.abs(daysApart(tb, a)), Math.abs(daysApart(b, ta)));
      if (gap <= 120) return true;
      if (gap > 400) return false;
      if (!labelName(name, lineup)) return true;
      var theirs = billActs(t.lineup);
      return mine.length > 0 && mine.some(function (x) { return theirs.indexOf(x) >= 0; });
    });
  }
  function paragraphsAbout(text, name) {
    var nm = String(name || '').toLowerCase().trim();
    if (!nm) return '';
    var paras = String(text || '').split(/\n+/), keep = {}, idx = [];
    paras.forEach(function (p, i) {
      if (p.toLowerCase().indexOf(nm) < 0) return;
      [i - 1, i, i + 1].forEach(function (j) { if (j >= 0 && j < paras.length && !keep[j]) { keep[j] = true; idx.push(j); } });
    });
    return idx.sort(function (a, b) { return a - b; }).map(function (i) { return paras[i].trim(); }).filter(Boolean).join('\n').slice(0, 6000);
  }
  function parseCsv(text) {
    var s = String(text || '').replace(/^﻿/, '');
    var sep = (s.split('\n')[0] || '').indexOf('\t') >= 0 ? '\t' : ',';
    var rows = [], row = [], cell = '', q = false, i, ch;
    var keep = function () { row.push(cell); cell = ''; if (row.some(function (c) { return c.trim() !== ''; })) rows.push(row); row = []; };
    for (i = 0; i < s.length; i++) {
      ch = s[i];
      if (q) {
        if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; keep(); }
      else cell += ch;
    }
    keep();
    return rows;
  }
  var MONTH_NO = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function readDay(s) {
    s = String(s || '').trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, '');
    var m, y, mo, d;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(s))) { mo = MONTH_NO[m[1].slice(0, 3).toLowerCase()]; d = +m[2]; y = +m[3]; }
    else if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/.exec(s))) { d = +m[1]; mo = MONTH_NO[m[2].slice(0, 3).toLowerCase()]; y = +m[3]; }
    else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s))) { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
    else return '';
    if (!mo || !d || !y) return '';
    var out = y + '-' + pad(mo) + '-' + pad(d);
    return parseDay(out) ? out : '';
  }
  var CONCERT_COLS = {
    date: /^(date|day|event ?date|show ?date|concert ?date|datetime|start ?date|start)$/i,
    title: /^(concert|title|tour|tour ?title|tour ?name|concert ?title|concert ?title ?(or|\/) ?tour ?title|event|event ?name|event ?title|name)$/i,
    bands: /^(bands?|artists?|line-?up|acts|performers?|with|support(ing)?|bill|other ?bands|bands? on the bill)$/i,
    venue: /^(venue|venue ?name|place|location ?name)$/i,
    city: /^(city|town)$/i, state: /^(state|region|province|state ?(\/|or) ?province|county)$/i, country: /^(country|nation)$/i,
    location: /^(location|where|city, ?state, ?country|city ?\/ ?state ?\/ ?country|address)$/i
  };
  function concertColumns(header) {
    var cols = {}, h = (Array.isArray(header) ? header : []).map(function (c) { return String(c || '').replace(/[_\s]+/g, ' ').trim(); });
    Object.keys(CONCERT_COLS).forEach(function (k) {
      h.forEach(function (c, i) { if (cols[k] == null && CONCERT_COLS[k].test(c)) cols[k] = i; });
    });
    return cols.date != null && (cols.venue != null || cols.location != null || cols.city != null) ? cols : null;
  }
  function concertRows(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return null;
    var cols = concertColumns(rows[0]);
    if (!cols) return null;
    var get = function (r, k) { return cols[k] == null ? '' : String(r[cols[k]] || '').replace(/\s+/g, ' ').trim(); };
    var out = [];
    rows.slice(1).forEach(function (r) {
      var date = readDay(get(r, 'date'));
      if (!date) return;
      var where = get(r, 'location') || [get(r, 'city'), get(r, 'state'), get(r, 'country')].filter(Boolean).join(', ');
      out.push({ date: date, title: get(r, 'title'), bands: get(r, 'bands'), venue: get(r, 'venue'), where: where });
    });
    return out;
  }
  function concertItems(list, actName) {
    var me = String(actName || '').toLowerCase().trim();
    var items = {}, order = [];
    (Array.isArray(list) ? list : []).forEach(function (r) {
      if (!parseDay(r.date)) return;
      var parts = String(r.title || '').split(/\s+\/\s+/).map(function (p) { return p.trim(); }).filter(Boolean);
      var tour = parts.length ? parts[parts.length - 1] : '';
      if (tour && String(r.bands || '').toLowerCase().indexOf(tour.toLowerCase()) >= 0 && parts.length === 1) tour = '';
      var key = (tour ? tourKeyLoose(tour) : '') + '|' + r.date.slice(0, 4);
      var it = items[key];
      if (!it) { it = items[key] = { name: tour, role: '', start: r.date, end: r.date, region: '', acts: {}, dates: [], seen: {} }; order.push(key); }
      if (r.date < it.start) it.start = r.date;
      if (r.date > it.end) it.end = r.date;
      if (!it.seen[r.date]) { it.seen[r.date] = true; it.dates.push(r.date + ' | ' + String(r.where || '').trim() + ' | ' + String(r.venue || '').trim()); }
      String(r.bands || '').split(/\s*\/\s*|\s*,\s*|\s*;\s*/).forEach(function (b) {
        b = b.trim(); if (!b || b.toLowerCase() === me) return;
        it.acts[b] = (it.acts[b] || 0) + 1;
      });
    });
    return order.map(function (k) {
      var it = items[k];
      var lineup = it.name ? Object.keys(it.acts).sort(function (a, b) { return it.acts[b] - it.acts[a] || a.localeCompare(b); }).slice(0, 6).join(', ') : '';
      it.dates.sort();
      return { name: it.name, role: '', start: it.start, end: it.end, region: '', lineup: lineup, dates: it.dates, sources: [] };
    });
  }
  function wikiText(t) {
    return String(t || '')
      .replace(/\{\{dts\|([^}|]*)[^}]*\}\}/g, '$1')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/(?:row|col)span="?\d+"?\s*\|/g, '')
      .replace(/style="[^"]*"\s*\|?/g, '')
      .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/'{2,3}/g, '');
  }
  function wikiCut(wt, name) {
    var t = wikiText(wt), lo = String(name || '').toLowerCase().trim(), out = '', start = 0;
    if (!lo) return '';
    while (start < t.length && out.length < 9000) {
      var i = t.toLowerCase().indexOf(lo, start);
      if (i < 0) break;
      out += (out ? '\n…\n' : '') + t.slice(Math.max(0, i - 300), i + 4000);
      start = i + 4000;
    }
    return out.slice(0, 9000);
  }
  function etaText(sec) {
    sec = num(sec);
    if (sec <= 0) return '';
    if (sec < 90) return 'Almost done.';
    var min = Math.ceil(sec / 60);
    if (min <= 10) return 'Come back in ~' + min + ' min.';
    if (min < 60) return 'Come back in ~' + Math.ceil(min / 5) * 5 + ' min.';
    var hrs = Math.max(1, Math.round(min / 60));
    return 'Come back in ~' + (hrs === 1 ? 'an hour.' : hrs + ' hours.');
  }
  function commissionBase(rule, incomeBy) {
    var b = isObj(rule) && isObj(rule.base) ? rule.base : null;
    if (!b || !isObj(incomeBy)) return null;
    return INCOME_FIELDS.reduce(function (t, f) {
      return t + (b[f.key] ? num(incomeBy[f.key]) : 0);
    }, 0);
  }
  function commissionBaseLabel(rule) {
    var b = isObj(rule) && isObj(rule.base) ? rule.base : {};
    var on = INCOME_FIELDS.filter(function (f) { return b[f.key]; });
    if (!on.length) return 'nothing yet';
    if (on.length === INCOME_FIELDS.length) return 'all income';
    return on.map(function (f) {
      return f.key === 'guarantee' ? 'guarantees' : f.label.toLowerCase();
    }).join(' + ');
  }
  function commissionLine(line, rule, income, guarantees, incomeBy) {
    if (rule.mode !== 'pct') return num(rule.value);
    var basis = commissionBase(rule, incomeBy);
    if (basis == null) basis = line.basis === 'guarantee' ? guarantees : income;
    return (num(rule.value) / 100) * basis;
  }
  function agencyAdvance(shows) {
    return (shows || []).filter(function (s) { return s && s.guaranteePaidBy === 'agency'; }).map(function (s) {
      return { showId: s.id, city: s.city || 'Show', date: s.date || '',
        amount: round(num(isObj(s.income) ? s.income.guarantee : 0) * 100) / 100 };
    }).filter(function (x) { return x.amount > 0; });
  }
  function showCancelled(show) { return !!show && show.cancelled === true; }
  function cancelledCounts(show) {
    return !showCancelled(show) || show.guaranteePaidBy === 'agency' || show.guaranteeReceived === true;
  }
  function agentWholeTour(tour, c) {
    var all = rows(tour && tour.shows).filter(function (s) { return parseDay(s.date) && cancelledCounts(s); });
    var shows = c && Array.isArray(c.shows) ? c.shows : rows(tour && tour.shows);
    var held = agencyAdvance(shows).reduce(function (t, x) { return t + x.amount; }, 0);
    var kept = shows.reduce(function (t, s) { return t + guaranteeKept(s, 'agent'); }, 0);
    var by = {};
    INCOME_FIELDS.forEach(function (f) { by[f.key] = 0; });
    var complete = all.length > 0;
    all.forEach(function (s) {
      var inc = isObj(s.income) ? s.income : {};
      if (!(num(inc.guarantee) > 0) && s.guaranteeNone !== true) complete = false;
      INCOME_FIELDS.forEach(function (f) {
        by[f.key] += f.key === 'guarantee' ? guaranteeTotal(s) : f.key === 'buyouts' ? buyoutIncome(s)
          : f.key === 'merch' ? incomeOf(s, 'merch') : num(inc[f.key]);
      });
    });
    var income = INCOME_FIELDS.reduce(function (t, f) { return t + by[f.key]; }, 0);
    var rule = normCommission(tour && tour.commission).agent;
    var line = COMMISSION_LINES.filter(function (l) { return l.key === 'agent'; })[0];
    var whole = round(commissionLine(line, rule, income, by.guarantee, by) * 100) / 100;
    var has = round((held + kept) * 100) / 100;
    return {
      held: round(held * 100) / 100, kept: round(kept * 100) / 100, has: has, whole: whole, complete: complete,
      pct: rule.mode === 'pct' ? num(rule.value) : null,
      owesBack: complete && num(rule.value) > 0 && has > whole + 0.005 ? round((has - whole) * 100) / 100 : 0
    };
  }
  function commissionTotal(commission, income, guarantees, incomeBy) {
    var c = normCommission(commission);
    return commissionLines(c).reduce(function (t, line) {
      return t + commissionLine(line, c[line.key], income, guarantees, incomeBy);
    }, 0);
  }
  function cardDebts(tour) {
    return rows(tour && tour.debts).filter(function (d) { return d.kind === 'card'; });
  }
  function otherDebts(tour) {
    return rows(tour && tour.debts).filter(function (d) { return d.kind !== 'card'; });
  }
  function cardMoved(card, tour, upTo) {
    if (!card || !isObj(card.feed) || !parseDay(card.cutoff)) return 0;
    var inside = function (d) { return d && d <= card.cutoff && (!upTo || d <= upTo); };
    var moved = rows(tour && tour.charges).reduce(function (t, ch) {
      if (ch.accounted || !ch.category || ch.account !== card.feed.name) return t;
      return inside(ch.posted || ch.date) ? t + num(ch.amount) : t;
    }, 0);
    var away = isObj(tour && tour.cardAway) ? tour.cardAway : {};
    Object.keys(away).forEach(function (k) {
      var a = away[k];
      if (isObj(a) && a.account === card.feed.name && inside(a.posted || a.date)) moved += num(a.amount);
    });
    return moved;
  }
  function cardPaidOff(card) {
    var p = isObj(card && card.payments) ? card.payments : {};
    return round(Object.keys(p).reduce(function (t, k) { return t + num(p[k] && p[k].amount); }, 0) * 100) / 100;
  }
  function cardSummary(card, tour, upTo) {
    var bd = isObj(card.breakdown) ? card.breakdown : {};
    var accounted = cardMoved(card, tour, upTo);
    TYPED_CATEGORIES.forEach(function (c) { accounted += num(bd[c.key]); });
    var balance = num(card.amount);
    var paidOff = cardPaidOff(card);
    return {
      id: card.id, label: card.label || 'Card', balance: balance, feed: isObj(card.feed),
      accounted: Math.min(accounted, balance),
      remainder: Math.max(0, balance - accounted),
      over: Math.max(0, accounted - balance),
      paidOff: paidOff,
      owed: isObj(card.owedNow) && card.owedNow.amount != null ? Math.max(0, round(num(card.owedNow.amount) * 100) / 100)
        : Math.max(0, round((balance - paidOff) * 100) / 100)
    };
  }
  function cardPaidDetail(tour, upTo) {
    var out = {};
    cardDebts(tour).forEach(function (card) {
      var s = cardSummary(card, tour, upTo);
      var bd = isObj(card.breakdown) ? card.breakdown : {};
      TYPED_CATEGORIES.forEach(function (c) {
        var v = num(bd[c.key]);
        if (v > 0) (out[c.key] = out[c.key] || []).push({ label: s.label, amount: v });
      });
      if (s.remainder > 0 || s.feed) {
        var k = s.feed ? 'card' : 'misc';
        (out[k] = out[k] || []).push({ label: s.label, amount: s.remainder, leftover: true,
          feed: s.feed, balance: s.balance, paidOff: s.paidOff, owed: s.owed });
      }
    });
    return out;
  }
  function tourStart(tour) {
    var d = rows(tour && tour.shows).map(function (s) { return s.date; }).filter(parseDay).sort();
    if (!d.length) return null;
    return parseDay(tour.spanStart) && tour.spanStart < d[0] ? tour.spanStart : d[0];
  }
  function tourEnd(tour) {
    var d = rows(tour && tour.shows).map(function (s) { return s.date; }).filter(parseDay).sort();
    if (!d.length) return null;
    var last = d[d.length - 1];
    return parseDay(tour.spanEnd) && tour.spanEnd > last ? tour.spanEnd : last;
  }
  function daysLeftOnTour(tour, today) {
    var d = rows(tour && tour.shows).map(function (s) { return s.date; }).filter(parseDay).sort();
    var start = tourStart(tour);
    if (!start || !d.length) return null;
    var day = parseDay(today) ? today : tourToday();
    if (day < start) return null;
    var n = daysBetween(day, addDays(d[d.length - 1], 1));
    return n >= 1 ? n : null;
  }
  function cardWindow(tour) {
    var w = tour && tour.cardLog;
    if (!w || !w.from || !w.to) return null;
    var start = tourStart(tour), end = tourEnd(tour);
    var from = w.from === 'tour' ? start
      : w.from === 'rehearsals' ? (parseDay(tour.rehearsalStart) ? tour.rehearsalStart : start)
      : (parseDay(w.from) ? w.from : null);
    var to = w.to === 'tour' ? end : (parseDay(w.to) ? w.to : null);
    if (!from || !to || to < from) return null;
    return { from: from, to: to };
  }
  function preTourCutoff(tour) {
    var cards = cardDebts(tour).filter(function (c) { return !isObj(c.feed); });
    if (!cards.length) return null;
    var shows = rows(tour && tour.shows).filter(function (s) { return parseDay(s.date); })
      .map(function (s) { return s.date; }).sort();
    var start = shows.length ? shows[0] : null;
    var best = null;
    cards.forEach(function (c) {
      var cut = parseDay(c.cutoff) ? c.cutoff : start;
      if (cut && (!best || cut > best)) best = cut;
    });
    return best;
  }
  function reimbursementRows(tour, o) {
    var list = o && Array.isArray(o.reimbursements) ? o.reimbursements : null;
    if (!list) {
      var hook = root.GR && root.GR.reimbursementsOf;
      if (typeof hook === 'function') { try { list = hook(tour); } catch (e) { list = null; } }
    }
    return (Array.isArray(list) ? list : []).filter(function (r) {
      return isObj(r) && r.status !== 'withdrawn' && num(r.amount) > 0;
    });
  }
  function calc(tour, opts) {
    var o = opts || {};
    var upTo = o.upTo || null;
    var override = o.override || null;
    var allShows = rows(tour && tour.shows).map(function (s) {
      if (override && override.showId === s.id) {
        return Object.assign({}, s, { income: override.income }, override.flags || {});
      }
      return s;
    }).sort(byDate);
    var shows = upTo ? allShows.filter(function (s) { return s.date && s.date <= upTo; }) : allShows;
    var income = 0, guarantees = 0;
    var incomeBy = {}, commissionBy = {};
    INCOME_FIELDS.forEach(function (f) { incomeBy[f.key] = 0; commissionBy[f.key] = 0; });
    shows.forEach(function (s) {
      var inc = isObj(s.income) ? s.income : {};
      INCOME_FIELDS.forEach(function (f) {
        if (f.key === 'guarantee' && !guaranteeIn(s)) return;
        var v = f.key === 'buyouts' ? buyoutIncome(s)
          : f.key === 'guarantee' ? Math.max(0, num(inc.guarantee) - guaranteeOwed(s) - guaranteeLost(s) - guaranteeKept(s))
          : f.key === 'merch' ? incomeOf(s, 'merch') : num(inc[f.key]);
        incomeBy[f.key] += v;
        commissionBy[f.key] += f.key === 'guarantee' ? Math.max(0, num(inc.guarantee) + taxWithheldOf(s) - guaranteeOwed(s)) : v;
      });
    });
    var showIncome = INCOME_FIELDS.reduce(function (t, f) { return t + incomeBy[f.key]; }, 0);
    var commissionShowIncome = INCOME_FIELDS.reduce(function (t, f) { return t + commissionBy[f.key]; }, 0);
    guarantees = commissionBy.guarantee;
    var otherRows = rows(tour && tour.otherIncome).filter(function (x) {
      return !upTo || (x.date && x.date <= upTo);
    }).sort(byDate);
    var other = otherRows.reduce(function (t, x) { return t + num(x.amount); }, 0);
    income = showIncome + other;
    var charges = rows(tour && tour.charges).filter(function (ch) {
      if (ch.accounted) return false;
      return !upTo || (ch.date && ch.date <= upTo);
    });
    var chargedTo = {};
    var crewLoose = 0;
    var payTo = function (x) {
      var sh = crewShares(tour, x);
      sh.shares.forEach(function (p) { var l = isMember(p.person) ? 'members' : 'crew'; chargedTo[l] = (chargedTo[l] || 0) + p.amount; });
      crewLoose += sh.loose;
    };
    charges.forEach(function (ch) {
      var k = chargeLine(tour, ch);
      if (!k) return;
      if (ch.category === 'crew') { payTo(ch); return; }
      chargedTo[k] = (chargedTo[k] || 0) + num(ch.amount);
    });
    rows(tour && tour.cashLog).forEach(function (x) {
      var k = chargeLine(tour, x);
      if (!k || CASH_MOVES[k]) return;
      if (upTo && !(x.date && x.date <= upTo)) return;
      if (x.category === 'crew') { payTo(x); return; }
      chargedTo[k] = (chargedTo[k] || 0) + num(x.amount);
    });
    var cardDetail = cardPaidDetail(tour, upTo);
    var cardTo = {};
    Object.keys(cardDetail).forEach(function (k) {
      cardTo[k] = cardDetail[k].reduce(function (t, r) { return t + r.amount; }, 0);
    });
    var expenses = normExpenses(tour && tour.expenses);
    var lines = [];
    var fixed = 0;
    var doneMap = isObj(tour && tour.doneLines) ? tour.doneLines : {};
    var lineDone = function (k) { return isObj(doneMap[k]); };
    var split = crewSplit(tour);
    typedCategoriesFor(tour).forEach(function (c) {
      var rec = expenses[c.key] || { projected: null, paid: 0 };
      if (c.key === 'crew') {
        var hasMembers = split.hasMembers || (chargedTo.members || 0) > 0;
        var loose = num(rec.paid) + crewLoose + (cardTo.crew || 0);
        var cProj = split.crew || null, cNamed = chargedTo.crew || 0, cPaid = cNamed + loose;
        var cDone = lineDone('crew') && cProj != null, bDone = lineDone('members') && !!split.members;
        if (!hasMembers) {
          var cEff0 = cProj == null || cDone ? cPaid : Math.max(cProj, cPaid);
          fixed += cEff0;
          lines.push({
            key: 'crew', label: 'Crew', projected: cProj, paid: cPaid, effective: cEff0, cards: cardDetail.crew || [],
            left: cProj == null ? null : cDone ? 0 : Math.max(0, cProj - cPaid),
            over: cProj == null ? 0 : Math.max(0, cPaid - cProj), done: cDone
          });
          return;
        }
        var bProj = split.members || null, bPaid = chargedTo.members || 0;
        var bEff = bDone ? bPaid : Math.max(num(bProj), bPaid), cBase = cDone ? cNamed : Math.max(num(cProj), cNamed);
        var room = (bEff - bPaid) + (cBase - cNamed);
        var cEff = cBase + Math.max(0, loose - room);
        fixed += bEff + cEff;
        lines.push({
          key: 'members', label: 'Members', projected: bProj, paid: bPaid, effective: bEff, cards: [],
          left: bProj == null ? null : bDone ? 0 : Math.max(0, bProj - bPaid),
          over: bProj == null ? 0 : Math.max(0, bPaid - bProj), done: bDone
        });
        lines.push({
          key: 'crew', label: 'Crew', projected: cProj, paid: cPaid, effective: cEff, cards: cardDetail.crew || [], done: cDone,
          left: cProj == null ? null : cDone ? 0 : Math.max(0, cProj - cPaid),
          over: cProj == null ? 0 : Math.max(0, cEff - cProj),
          loose: round(loose * 100) / 100
        });
        return;
      }
      var projected = rec.projected;
      var paid = num(rec.paid) + (chargedTo[c.key] || 0) + (cardTo[c.key] || 0);
      var done = projected != null && lineDone(c.key);
      var effective = projected == null || done ? paid : Math.max(projected, paid);
      fixed += effective;
      lines.push({
        key: c.key, label: c.label, projected: projected, paid: paid, effective: effective,
        cards: cardDetail[c.key] || [],
        left: projected == null ? null : done ? 0 : Math.max(0, projected - paid),
        over: projected == null ? 0 : Math.max(0, paid - projected), done: done
      });
    });
    var commissionProjected = commissionTotal(tour && tour.commission, commissionShowIncome, guarantees, commissionBy);
    var agentOwed = commissionLine(COMMISSION_LINES.filter(function (l) { return l.key === 'agent'; })[0],
      normCommission(tour && tour.commission).agent, commissionShowIncome, guarantees, commissionBy);
    var agencyShows = agencyAdvance(shows);
    var advance = agencyShows.reduce(function (t, x) { return t + x.amount; }, 0);
    var kept = shows.reduce(function (t, s) { return t + guaranteeKept(s); }, 0);
    var keptAgent = shows.reduce(function (t, s) { return t + guaranteeKept(s, 'agent'); }, 0);
    var commissionCommitted = (commissionProjected - agentOwed) + Math.max(agentOwed, advance + keptAgent);
    var commissionPaid = (chargedTo.commission || 0) + advance + kept;
    var commissionEffective = Math.max(commissionCommitted, commissionPaid);
    var commissionCost = Math.max(0, round((commissionEffective - kept) * 100) / 100);
    var agentWhole = upTo ? null : agentWholeTour(tour, { shows: shows });
    lines.push({
      key: 'commission', label: 'Commission',
      projected: Math.max(0, commissionCommitted - kept), paid: Math.max(0, commissionPaid - kept), effective: commissionCost,
      left: Math.max(0, commissionCommitted - commissionPaid),
      over: Math.max(0, commissionPaid - commissionCommitted),
      offTop: kept,
      owesBack: agentWhole ? agentWhole.owesBack : 0
    });
    var merchTipsDue = round(shows.reduce(function (t, s) { return t + merchTipsOwed(s); }, 0) * 100) / 100;
    if (merchTipsDue > 0) {
      lines.push({ key: 'merchTips', label: 'Merch tips', projected: merchTipsDue, paid: merchTipsDue, effective: merchTipsDue, left: 0, over: 0 });
    }
    var debt = otherDebts(tour).reduce(function (t, d) { return t + num(d.amount); }, 0);
    var extras = rows(tour && tour.extras).filter(function (x) {
      return !upTo || (x.date && x.date <= upTo);
    });
    var dayByDay = extras.reduce(function (t, x) { return t + num(x.amount); }, 0) +
      (chargedTo[DAY_BY_DAY] || 0);
    var asks = reimbursementRows(tour, o).filter(function (r) { return !upTo || (r.date && r.date <= upTo); });
    var askAll = 0, askPaid = 0, askCash = 0;
    asks.forEach(function (r) {
      var a = num(r.amount);
      askAll += a;
      if (r.status === 'paid') { askPaid += a; if (r.how === 'cash') askCash += a; }
    });
    askAll = round(askAll * 100) / 100; askPaid = round(askPaid * 100) / 100; askCash = round(askCash * 100) / 100;
    var askOwed = Math.max(0, round((askAll - askPaid) * 100) / 100);
    if (asks.length) {
      lines.push({ key: 'reimbursements', label: 'Reimbursements', projected: askAll, paid: askPaid, effective: askAll, left: askOwed, over: 0 });
    }
    var out = fixed + commissionCost + merchTipsDue + debt + dayByDay + askAll;
    return {
      shows: shows, allShows: allShows, income: income, guarantees: guarantees, incomeBy: incomeBy,
      showIncome: showIncome, otherIncome: other, otherRows: otherRows,
      lines: lines, fixed: fixed,
      commission: commissionCost, commissionAll: commissionEffective, commissionProjected: commissionProjected, merchTips: merchTipsDue,
      commissionBy: commissionBy, commissionShowIncome: commissionShowIncome,
      agencyShows: agencyShows, agencyAdvance: advance, agentOwed: agentOwed, commissionKept: kept, agentWhole: agentWhole,
      reimbursements: askAll, reimbursementsOwed: askOwed, reimbursementsPaid: askPaid, reimbursementsCash: askCash,
      debt: debt, dayByDay: dayByDay, out: out, net: income - out,
      coverage: out > 0 ? income / out : (income > 0 ? 1 : 0)
    };
  }
  function stateOf(c) {
    if (c.out === 0 && c.income === 0) return 'idle';
    return round(c.net) < 0 ? 'red' : 'green';
  }
  function caption(c) {
    var st = stateOf(c);
    if (st === 'idle') return 'Add what the tour costs to start';
    if (st === 'red') return 'to break even';
    return round(c.net) > 0 ? 'in the green' : 'right at break even';
  }
  function spentOf(c) {
    var paid = c.lines.reduce(function (t, l) { return isDerived(l.key) ? t : t + num(l.paid); }, 0);
    return round((paid + num(c.commission) + num(c.merchTips) + num(c.reimbursements) + num(c.debt) + num(c.dayByDay)) * 100) / 100;
  }
  function balanceSeries(tour, opts) {
    var o = opts || {};
    var asks = reimbursementRows(tour, o);
    var c = calc(tour, { reimbursements: asks });
    var dated = c.allShows.filter(function (s) { return parseDay(s.date); });
    var extras = rows(tour && tour.extras).filter(function (x) { return parseDay(x.date); });
    var charges = rows(tour && tour.charges).filter(function (x) { return parseDay(x.date); });
    var cash = rows(tour && tour.cashLog).filter(function (x) { return parseDay(x.date); });
    var otherInc = rows(tour && tour.otherIncome).filter(function (x) { return parseDay(x.date); });
    var days = dated.map(function (s) { return s.date; })
      .concat(extras.map(function (x) { return x.date; }))
      .concat(charges.map(function (x) { return x.date; }))
      .concat(cash.map(function (x) { return x.date; }))
      .concat(otherInc.map(function (x) { return x.date; }))
      .concat(asks.filter(function (x) { return parseDay(x.date); }).map(function (x) { return x.date; }));
    if (!days.length) return [];
    days.sort();
    var start = days[0], end = days[days.length - 1];
    var ts = tourStart(tour);
    if (ts && ts > start) start = ts;
    if (o.from && parseDay(o.from) && o.from > start) start = o.from;
    if (end < start) end = start;
    if (o.until && parseDay(o.until) && o.until >= start && o.until < end) end = o.until;
    if (o.from && o.to && parseDay(o.from) && parseDay(o.to) && o.from < o.to) { start = o.from; end = o.to; }
    var span = daysBetween(start, end);
    if (span < 0) return [];
    if (span === 0) { start = addDays(start, -1); span = 1; }
    var series = [];
    for (var i = 0; i <= span; i++) {
      var day = addDays(start, i);
      var snap = calc(tour, { upTo: day, reimbursements: asks });
      series.push({ date: day, net: snap.net, income: snap.income, out: snap.out, spent: spentOf(snap) });
    }
    return series;
  }
  function yearByMonth(tour, year, today, opts) {
    var day = parseDay(today) ? today : tourToday();
    var y = /^\d{4}$/.test(String(year)) && +year >= 1 ? String(year) : day.slice(0, 4);
    var asks = reimbursementRows(tour, opts);
    var at = function (upTo) {
      var c = calc(tour, upTo ? { upTo: upTo, reimbursements: asks } : { reimbursements: asks });
      return { spent: Math.round(spentOf(c) * 100), income: Math.round(num(c.income) * 100) };
    };
    var less = function (a, b) { return { spent: (a.spent - b.spent) / 100, income: (a.income - b.income) / 100 }; };
    var all = at(null);
    var never = at('0000-00-00'), ever = at('9999-12-31');
    var eve = at(('000' + (+y - 1)).slice(-4) + '-12-31');
    var months = [], prev = eve;
    for (var m = 1; m <= 12; m++) {
      var key = y + '-' + pad(m);
      var end = at(key + '-31'), d = less(end, prev);
      months.push({ month: m, key: key, spent: d.spent, income: d.income, future: key > day.slice(0, 7) });
      prev = end;
    }
    var whole = less(prev, eve);
    return {
      year: y, months: months, spent: whole.spent, income: whole.income,
      undated: { spent: (never.spent + all.spent - ever.spent) / 100, income: (never.income + all.income - ever.income) / 100 },
      before: less(eve, never), after: less(ever, prev)
    };
  }
  function monthSeries(tour, year, today, opts) { return yearByMonth(tour, year, today, opts).months; }
  function latestChange(tour) {
    var events = [];
    rows(tour && tour.shows).forEach(function (s) {
      if (s.loggedAt && showIncomeTotal(s) !== 0) {
        events.push({ at: s.loggedAt, kind: 'show', showId: s.id, label: s.city || 'Show' });
      }
    });
    rows(tour && tour.extras).forEach(function (x) {
      if (x.createdAt) events.push({ at: x.createdAt, kind: 'extra', id: x.id, label: x.label || 'Cost' });
    });
    rows(tour && tour.imports).forEach(function (im) {
      if (im.createdAt) events.push({ at: im.createdAt, kind: 'import', id: im.id, label: 'card charges' });
    });
    if (!events.length) return null;
    events.sort(function (a, b) { return a.at - b.at; });
    var last = events[events.length - 1];
    var same = { reimbursements: reimbursementRows(tour, null) };
    var after = calc(tour, same).net;
    var without = calc(stripEvent(tour, last), same).net;
    var delta = after - without;
    if (round(delta) === 0) return null;
    return { delta: delta, label: last.label, kind: last.kind };
  }
  function stripEvent(tour, ev) {
    var t = JSON.parse(JSON.stringify(tour || {}));
    if (ev.kind === 'show' && t.shows && t.shows[ev.showId]) {
      t.shows[ev.showId] = Object.assign({}, t.shows[ev.showId], { income: emptyIncome(), loggedAt: null });
    } else if (ev.kind === 'extra' && t.extras) {
      delete t.extras[ev.id];
    } else if (ev.kind === 'import' && t.charges) {
      Object.keys(t.charges).forEach(function (cid) {
        if (t.charges[cid] && t.charges[cid].importId === ev.id) delete t.charges[cid];
      });
    }
    return t;
  }
  var DS_AMENITIES = [
    ['greenrooms', 'Greenrooms'], ['showers', 'Showers'],
    ['productionOffice', 'Production office'], ['laundry', 'Laundry']
  ];
  function dsList(v) {
    if (!Array.isArray(v)) return [];
    return v.filter(function (r) { return isObj(r) && (String(r.band || '').trim() || String(r.time || '').trim()); });
  }
  function splitTime(v) {
    var t = String(v == null ? '' : v).trim();
    if (!t) return { main: '', ampm: '' };
    var m = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(?:([ap])\.?\s*m?\.?)?$/i.exec(t);
    if (!m) return { main: t, ampm: '' };
    var hr = +m[1], mins = m[2] || '00', ap = m[3] ? m[3].toUpperCase() + 'M' : '';
    if (+mins > 59 || hr > 23) return { main: t, ampm: '' };
    if (!ap && hr > 12) { ap = 'PM'; hr -= 12; }
    else if (!ap && hr === 0) { ap = 'AM'; hr = 12; }
    if (hr === 0) hr = 12;
    return { main: hr + ':' + mins, ampm: ap };
  }
  function joinTime(main, ampm) {
    var p = splitTime(main);
    if (!p.main) return '';
    if (!/^\d{1,2}:\d{2}$/.test(p.main)) return p.main;
    return p.main + (p.ampm || String(ampm || '').toUpperCase());
  }
  function cleanTime(v) { var p = splitTime(v); return joinTime(p.main, p.ampm); }
  function nightMins(v) {
    var p = splitTime(v);
    if (!p.ampm || !/^\d{1,2}:\d{2}$/.test(p.main)) return null;
    var hm = p.main.split(':');
    var mins = ((+hm[0]) % 12 + (p.ampm === 'PM' ? 12 : 0)) * 60 + (+hm[1]);
    return mins < 12 * 60 ? mins + 24 * 60 : mins;
  }
  function nightNow(now) {
    var d = now == null ? new Date() : new Date(+now);
    var at = d.getHours() * 60 + d.getMinutes();
    return d.getHours() < ROLLOVER_HOURS ? at + 24 * 60 : at;
  }
  function busCallLeft(v, now) {
    var m = nightMins(v);
    return m == null ? null : m - nightNow(now);
  }
  function timeSpan(start, end) {
    var a = cleanTime(start), b = cleanTime(end);
    return a && b ? a + ' - ' + b : (a || b);
  }
  function vipRowsOf(v) {
    if (!Array.isArray(v)) return [];
    var s = function (x) { return String(x == null ? '' : x).trim(); };
    return v.filter(function (r) { return isObj(r) && !!(s(r.band) || s(r.time) || s(r.end)); });
  }
  function vipAt(r) {
    var c = dayClock(r && r.time, 'mid');
    if (!c) return null;
    return c.start < ROLLOVER_HOURS * 60 ? c.start + 1440 : c.start;
  }
  function vipSort(rows) {
    return vipRowsOf(rows).map(function (r, i) { return { r: r, i: i, at: vipAt(r) }; })
      .sort(function (a, b) {
        if (a.at == null || b.at == null) return ((a.at == null ? 1 : 0) - (b.at == null ? 1 : 0)) || a.i - b.i;
        return a.at - b.at || a.i - b.i;
      }).map(function (x) { return x.r; });
  }
  function vipMirror(rows) {
    return vipSort(rows).map(function (r) {
      return [timeSpan(r.time, r.end), String(r.band == null ? '' : r.band).trim()].filter(Boolean).join(' ');
    }).filter(Boolean).join('; ');
  }
  function vipOld(sheet) {
    var d = isObj(sheet) ? sheet : {};
    var words = String(d.vip == null ? '' : d.vip).trim();
    if (!words) return false;
    return !Array.isArray(d.vipTimes) || words !== vipMirror(d.vipTimes);
  }
  function vipClockTime(m) {
    m = ((Math.round(m) % 1440) + 1440) % 1440;
    var hr = Math.floor(m / 60), mins = m % 60;
    return ((hr % 12) || 12) + ':' + (mins < 10 ? '0' : '') + mins + (hr < 12 ? 'AM' : 'PM');
  }
  function vipHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  var VIP_SHORT = { avenue: 'ave', street: 'st', saint: 'st', mount: 'mt', mountain: 'mt', brothers: 'bros', boulevard: 'blvd' };
  var VIP_CAPS = {};
  ('AM PM VIP VIPS TBA TBD GA MG ID OK NA IN ON AT TO OF OR AN AS BY IF IS IT NO SO UP US WE ME MY GO DO BE HE THE AND ' +
    'FOR ALL EST PST CST MST EDT PDT CDT MDT AL AK AZ AR CA CO CT DE FL HI IL IA KS KY LA MD MA MI MN MS MO MT NE NV NH ' +
    'NJ NM NY NC ND OH PA RI SC SD TN TX UT VT VA WA WV WI WY DC').split(' ').forEach(function (w) { VIP_CAPS[w] = 1; });
  var VIP_WORDS = {};
  ('early entry entrance meet greet sound check soundcheck line doors door show band bands stage photo photos merch ' +
    'signing after before with from then first last main package packages ticket tickets holders access only room ' +
    'lounge lobby hall house open opens time times upgrade experience pass passes until till start starts').split(' ')
    .forEach(function (w) { VIP_WORDS[w] = 1; });
  var VIP_RUN_NOT = { vip: 1, vips: 1, early: 1, entry: 1, meet: 1, greet: 1, sound: 1, check: 1, soundcheck: 1, doors: 1,
    am: 1, pm: 1, tba: 1, tbd: 1 };
  function vipKeyWord(w) {
    var k = String(w).toLowerCase();
    if (k === '&') return 'and';
    return vipHas(VIP_SHORT, k) ? VIP_SHORT[k] : k;
  }
  function vipWordsOf(text) {
    var t = String(text == null ? '' : text), re = /[A-Za-z0-9]+|&/g, out = [], m;
    while ((m = re.exec(t))) out.push({ w: m[0], k: vipKeyWord(m[0]), at: m.index, end: m.index + m[0].length });
    return out;
  }
  function vipBands(sheet) {
    var d = isObj(sheet) ? sheet : {}, seen = {}, out = [];
    [d.setTimes, d.soundchecks].forEach(function (list) {
      dsList(list).forEach(function (r) {
        var name = String(r.band == null ? '' : r.band).replace(/\s+/g, ' ').trim();
        var k = vipWordsOf(name).map(function (w) { return w.k; }).join(' ');
        if (!k || vipHas(seen, k)) return;
        var same = vipFind(name, out);
        if (same && same.from === 0 && same.to === name.length) return;
        seen[k] = 1;
        out.push(name);
      });
    });
    return out;
  }
  function vipFind(piece, bands) {
    var ws = vipWordsOf(piece);
    var list = (Array.isArray(bands) ? bands : []).map(function (name) {
      var bw = vipWordsOf(name);
      var keys = bw.map(function (w) { return w.k; });
      if (keys.length > 1 && keys[0] === 'the') keys = keys.slice(1);
      return { name: name, bw: bw, keys: keys };
    }).filter(function (b) { return b.keys.length > 0; });
    var firsts = {};
    list.forEach(function (b) { firsts[b.keys[0]] = (vipHas(firsts, b.keys[0]) ? firsts[b.keys[0]] : 0) + 1; });
    var hits = [];
    list.forEach(function (b, bi) {
      var n = b.keys.length, i, j;
      for (i = 0; i + n <= ws.length; i++) {
        for (j = 0; j < n && ws[i + j].k === b.keys[j]; j++) {   }
        if (j === n) hits.push({ b: bi, at: i, kind: 0, len: n });
      }
      var lw = b.bw.filter(function (w) { return w.w !== '&'; });
      if (lw.length >= 2 && lw.every(function (w) { return /^[A-Za-z]/.test(w.w); })) {
        var all = lw.map(function (w) { return w.w.charAt(0).toUpperCase(); }).join('');
        var caps = [all];
        if (lw[0].k === 'the' && lw.length >= 3) caps.push(all.slice(1));
        for (i = 0; i < ws.length; i++) {
          if (caps.indexOf(ws[i].w) >= 0 && !vipHas(VIP_CAPS, ws[i].w)) hits.push({ b: bi, at: i, kind: 1, len: 1 });
        }
      }
      if (b.bw.length === 1 && /^[A-Z]{3,5}$/.test(b.bw[0].w)) {
        var cap = b.bw[0].w, m = cap.length;
        for (i = 0; i + m <= ws.length; i++) {
          for (j = 0; j < m && /^[A-Z][A-Za-z]*$/.test(ws[i + j].w) && !vipHas(VIP_RUN_NOT, ws[i + j].k) &&
            ws[i + j].w.charAt(0) === cap.charAt(j); j++) {   }
          if (j === m) hits.push({ b: bi, at: i, kind: 1, len: m });
        }
      }
      var f0 = b.keys[0];
      if (n >= 2 && f0.length >= 4 && /^[a-z]+$/.test(f0) && !vipHas(VIP_WORDS, f0) && firsts[f0] === 1) {
        for (i = 0; i < ws.length; i++) if (ws[i].k === f0) hits.push({ b: bi, at: i, kind: 2, len: 1 });
      }
    });
    if (!hits.length) return null;
    hits.sort(function (x, y) { return x.at - y.at || x.kind - y.kind || y.len - x.len || x.b - y.b; });
    var h0 = hits[0];
    return { band: list[h0.b].name, from: ws[h0.at].at, to: ws[h0.at + h0.len - 1].end };
  }
  function vipTimeCount(v) {
    var t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(), n = 0, m;
    var re = /(\d{1,2})(?:[:.](\d{2}))?(?!\d)(?:\s?([ap])\.?\s?m?\.?(?![a-z]))?/gi;
    while ((m = re.exec(t))) {
      var prev = m.index > 0 ? t.charAt(m.index - 1) : '';
      if (/[\d:.$]/.test(prev)) continue;
      var hr = +m[1], mins = m[2] != null ? +m[2] : 0, ap = m[3] ? m[3].toLowerCase() : '';
      if (hr > 23 || mins > 59) continue;
      if (ap && (hr === 0 || hr > 12)) continue;
      if (m[2] != null || ap) n += 1;
    }
    return n;
  }
  function vipRead(words, sheet) {
    var out = { rows: [], early: '', earlyWords: '', rest: [] };
    var bands = vipBands(sheet);
    String(words == null ? '' : words).split(/[;\n]+/).forEach(function (raw) {
      var p = raw.replace(/\s+/g, ' ').trim();
      if (!vipWordsOf(p).filter(function (w) { return w.k !== 'vip' && w.k !== 'vips'; }).length) return;
      var hit = vipFind(p, bands);
      var band = hit ? hit.band : '';
      if (/\bearly\b/i.test(p) && /\b(?:entry|entrance|access|admission|doors?)\b/i.test(p)) {
        var ce = dayClock(p, 'mid');
        if (ce && !out.early) {
          out.early = vipClockTime(ce.start);
          out.earlyWords = p;
          if (vipTimeCount(p) > 1) out.rest.push({ words: p, band: band });
        } else out.rest.push({ words: p, band: band });
        return;
      }
      var left = hit ? p.slice(0, hit.from) + ' ' + p.slice(hit.to) : p;
      var c = dayClock(left, 'mid');
      if (!c) { out.rest.push({ words: p, band: band }); return; }
      out.rows.push({ band: band, time: vipClockTime(c.start), end: c.end != null ? vipClockTime(c.end) : '' });
      if (vipTimeCount(left) > (c.end != null ? 2 : 1)) out.rest.push({ words: p, band: band });
    });
    return out;
  }
  function vipList(sheet) {
    var d = isObj(sheet) ? sheet : {};
    return vipOld(d) ? vipSort(vipRead(d.vip, d).rows) : vipSort(d.vipTimes);
  }
  function vipLines(rest, extras) {
    var have = dsExtras(extras).map(function (r) {
      var lab = dsTokens(r.label), val = dsTokens(r.value);
      return { lab: lab, val: val, all: lab.concat(val) };
    });
    var out = [];
    (Array.isArray(rest) ? rest : []).forEach(function (x) {
      var p = String(x && x.words != null ? x.words : '').replace(/\s+/g, ' ').trim();
      var band = String(x && x.band != null ? x.band : '');
      var toks = dsTokens(p);
      if (!toks.length) return;
      var e = { lab: [], val: toks, all: toks };
      if (have.some(function (s) { return dsRepeatOf(e, s); })) return;
      while (p.length > 80) {
        var cut = p.lastIndexOf(' ', 80);
        if (cut < 20) cut = 80;
        out.push({ label: 'VIP', value: p.slice(0, cut).trim(), band: band });
        p = p.slice(cut).trim();
      }
      if (p) out.push({ label: 'VIP', value: p, band: band });
    });
    return out;
  }
  function vipView(sheet) {
    var d = isObj(sheet) ? sheet : {};
    var box = String(d.vipEarly == null ? '' : d.vipEarly).trim();
    if (!vipOld(d)) return { old: false, rows: vipSort(d.vipTimes), early: box, lines: [] };
    var r = vipRead(d.vip, d);
    var rest = r.rest.slice();
    if (box && r.early) {
      var a = dayClock(box, 'mid'), b = dayClock(r.early, 'mid');
      if (!a || a.start !== b.start) rest.push({ words: r.earlyWords, band: '' });
    }
    return { old: true, rows: vipSort(r.rows), early: box || r.early, lines: vipLines(rest, d.extras) };
  }
  function vipPack(lines, room) {
    var list = Array.isArray(lines) ? lines.slice() : [];
    if (room == null || list.length <= Math.max(0, room)) return list;
    var packed = [];
    list.forEach(function (l, i) {
      var last = packed.length ? packed[packed.length - 1] : null;
      if (last && packed.length + (list.length - i) > room && last.value.length + 2 + l.value.length <= 80) {
        packed[packed.length - 1] = { label: 'VIP', value: last.value + '; ' + l.value, band: last.band === l.band ? last.band : '' };
      } else packed.push(l);
    });
    return packed;
  }
  function vipAlertRow(sheet, band) {
    var b = vipBandKey(band);
    if (!b) return null;
    var timed = vipList(sheet).filter(function (r) { return vipAt(r) != null; });
    return timed.filter(function (r) { return vipBandKey(r.band) === b; })[0] || (vipNoBand(sheet) ? timed[0] || null : null);
  }
  function vipBandKey(v) {
    var k = String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toLowerCase();
    return /^tb[ad]\.?$/.test(k) ? '' : k;
  }
  var VIP_PLAIN = { vip: 1, vips: 1, tba: 1, tbd: 1, am: 1, pm: 1, a: 1, p: 1, m: 1, g: 1, q: 1, n: 1, and: 1, at: 1, to: 1,
    til: 1, till: 1, until: 1, 'in': 1, on: 1, the: 1, of: 1, 'for': 1, all: 1, set: 1, acoustic: 1, sharp: 1, approx: 1,
    approximately: 1, ish: 1, around: 1, local: 1, hr: 1, hrs: 1, hour: 1, hours: 1, min: 1, mins: 1, minutes: 1,
    est: 1, cst: 1, mst: 1, pst: 1, edt: 1, cdt: 1, mdt: 1, pdt: 1, et: 1, ct: 1, mt: 1, pt: 1 };
  function vipNoBand(sheet) {
    var d = isObj(sheet) ? sheet : {};
    if (!vipList(d).every(function (r) { return !vipBandKey(r.band); })) return false;
    if (!vipOld(d)) return true;
    return String(d.vip).split(/[;\n]+/).every(function (p) {
      return vipWordsOf(p).every(function (w) { return /^\d+(?:[ap]m?)?$/i.test(w.w) || vipHas(VIP_PLAIN, w.k) || vipHas(VIP_WORDS, w.k); });
    });
  }
  function vipAlertName(band, artist) {
    var b = String(band == null ? '' : band).trim(), a = String(artist == null ? '' : artist).trim();
    return a && a.toLowerCase() === b.toLowerCase() ? a : b;
  }
  function vipAlert(sheet, band, artist) {
    var row = vipAlertRow(sheet, band);
    return row ? { at: vipAt(row), name: vipAlertName(band, artist) } : null;
  }
  function dsExtras(v) {
    return (Array.isArray(v) ? v : []).map(function (r) {
      return isObj(r) ? {
        label: String(r.label == null ? '' : r.label).trim().slice(0, 40),
        value: String(r.value == null ? '' : r.value).trim().slice(0, 80)
      } : null;
    }).filter(function (r) { return r && (r.label || r.value); }).slice(0, 12);
  }
  var DS_FILLER = {};
  ['the', 'a', 'an', 'of', 'at', 'to', 'and', 'or', 'for', 'on', 'is', 'are', 'be', 'will', 'with', 'from', 'by',
    'time', 'times', 'open', 'opens', 'info', 'information', 'number']
    .forEach(function (w) { DS_FILLER[w] = true; });
  var DS_SHORT = { street: 'st', avenue: 'ave', boulevard: 'blvd', road: 'rd', highway: 'hwy', lane: 'ln', court: 'ct', parkway: 'pkwy' };
  var DS_NO = {};
  ['no', 'not', 'never', 'cannot', 'cant', 'dont', 'wont', 'isnt', 'arent', 'doesnt', 'didnt', 'wasnt', 'without', 'none', 'nothing']
    .forEach(function (w) { DS_NO[w] = true; });
  function dsTokens(text) {
    var s = String(text == null ? '' : text).toLowerCase();
    if (s.normalize) { try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {   } }
    s = s.replace(/&/g, ' and ').replace(/['\u2019]/g, '');
    var re = /\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s*m\b\.?|\b(\d{1,2}):(\d{2})\b|\b(1[0-2]|[1-9])(?=\s*(?:[-\u2013\u2014~]|to)\s*\d{1,2}(?:[:.]\d{2})?\s*[ap]\.?\s*m\b)/g;
    var pieces = [], last = 0, prev = null, m;
    var clock = function (t) { return (t.h % 12) * 60 + (t.ap === 'p' ? 720 : 0) + (+t.m); };
    while ((m = re.exec(s))) {
      var hr = +(m[1] || m[4] || m[6]), mins = m[2] || m[5] || '00', ap = m[3] || '';
      if (hr > 23 || +mins > 59) continue;
      if (!ap && hr > 12) { ap = 'p'; hr -= 12; } else if (!ap && hr === 0) { ap = 'a'; hr = 12; }
      if (ap && hr === 0) hr = 12;
      var gap = s.slice(last, m.index);
      var t = { h: hr, m: mins, ap: ap };
      if (prev && !prev.ap && ap && /^\s*(?:[-\u2013\u2014~]|to|until|thru|through)\s*$/.test(gap)) {
        prev.ap = ap;
        if (clock(prev) > clock(t)) prev.ap = ap === 'p' ? 'a' : 'p';
      }
      pieces.push({ words: gap }, { time: t });
      prev = t;
      last = m.index + m[0].length;
    }
    pieces.push({ words: s.slice(last) });
    var out = [];
    pieces.forEach(function (p) {
      if (p.time) { out.push('T' + p.time.h + ':' + p.time.m + p.time.ap); return; }
      var ws = p.words.replace(/[^a-z0-9]+/g, ' ').trim();
      if (!ws) return;
      ws = ws.split(' ');
      for (var i = 0; i < ws.length; i++) {
        var w = ws[i];
        if ((w === 'sound' || w === 'line') && /^checks?$/.test(ws[i + 1] || '')) { w = 'soundcheck'; i += 1; }
        if (DS_SHORT[w]) w = DS_SHORT[w];
        if (!DS_FILLER[w]) out.push(w);
      }
    });
    return out;
  }
  function dsOneLetter(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0;
    while (i < a.length && i < b.length && a.charAt(i) === b.charAt(i)) i += 1;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
    var s = a.length < b.length ? a : b, l = a.length < b.length ? b : a;
    return s.slice(i) === l.slice(i + 1);
  }
  function dsSame(a, b) {
    if (a === b) return true;
    var ta = /^T\d/.test(a), tb = /^T\d/.test(b);
    if (ta || tb) {
      if (!(ta && tb)) return false;
      var pa = /^T(\d{1,2}:\d{2})([ap]?)$/.exec(a), pb = /^T(\d{1,2}:\d{2})([ap]?)$/.exec(b);
      return !!(pa && pb && pa[1] === pb[1] && (!pa[2] || !pb[2] || pa[2] === pb[2]));
    }
    if (/\d/.test(a) || /\d/.test(b)) return false;
    var sa = a.length > 3 && /[^s]s$/.test(a) ? a.slice(0, -1) : a;
    var sb = b.length > 3 && /[^s]s$/.test(b) ? b.slice(0, -1) : b;
    if (sa === sb) return true;
    return sa.length >= 7 && sb.length >= 7 && sa.charAt(0) === sb.charAt(0) && dsOneLetter(sa, sb);
  }
  function dsSaid(src, toks) {
    return toks.every(function (t) { return src.some(function (u) { return dsSame(t, u); }); });
  }
  function dsSources(d, show) {
    var out = [], sh = isObj(show) ? show : {};
    var str = function (v) { return String(v == null ? '' : v).trim(); };
    var add = function (label, value) {
      var lab = dsTokens(label), val = dsTokens(value);
      if (val.length) out.push({ lab: lab, val: val, all: lab.concat(val) });
    };
    add('venue address', [sh.venue, sh.city, d.venueAddress].map(str).join(' '));
    add('venue phone', d.venuePhone);
    add(str(d.wifiPass) ? 'wifi password' : 'wifi', str(d.wifi) + ' ' + str(d.wifiPass));
    add('parking', d.parking);
    add('lobby call', d.lobbyCall);
    add('load in', str(d.loadIn) + ' ' + str(d.loadInEnd));
    dsList(d.soundchecks).forEach(function (r) { add('soundcheck', [r.band, r.time, r.end].map(str).join(' ')); });
    var vr = vipOld(d) ? vipRead(d.vip, d) : null;
    if (vr) add('vip', d.vip);
    vipSort(vr ? vr.rows : d.vipTimes).forEach(function (r) { add('vip', [r.band, r.time, r.end].map(str).join(' ')); });
    add('early vip entry', str(d.vipEarly) || (vr ? vr.early : ''));
    add('last call for guest list', d.lastCall);
    add('doors', d.doors);
    dsList(d.setTimes).forEach(function (r) { add('set time', [r.band, r.time, r.end].map(str).join(' ')); });
    add('load out', d.loadOut);
    add('bus call', d.busCall);
    add('drive next venue', d.driveNext);
    DS_AMENITIES.forEach(function (a) {
      if (d[a[0]] === 'yes' || d[a[0]] === 'no') add(a[1], d[a[0]]);
    });
    return out;
  }
  function dsRepeatOf(e, s) {
    if (e.all.length < 2 || !e.all.some(function (t) { return !/^T\d/.test(t); }) || !dsSaid(s.all, e.all)) return false;
    return !s.all.some(function (t) { return DS_NO[t] && e.all.indexOf(t) < 0; });
  }
  function dsExtrasDistinct(sheet, show, list) {
    var d = isObj(sheet) ? sheet : {};
    var rows = dsExtras(list === undefined ? d.extras : list);
    if (!rows.length) return rows;
    var src = dsSources(d, show);
    var ex = rows.map(function (r) {
      var lab = dsTokens(r.label).filter(function (t) { return t !== 'after'; });
      var val = dsTokens(r.value);
      return { lab: lab, val: val, all: lab.concat(val) };
    });
    return rows.filter(function (r, i) {
      var e = ex[i];
      if (!e.all.length) return true;
      if (src.some(function (s) { return dsRepeatOf(e, s); })) return false;
      return !ex.some(function (o, j) {
        return j !== i && o.all.length && dsRepeatOf(e, o) && (j < i || !dsRepeatOf(o, e));
      });
    });
  }
  function dsMoreLines(sheet, show) {
    return dsExtrasDistinct(sheet, show).concat(vipView(sheet).lines.map(function (r) {
      return { label: r.label, value: r.value };
    }));
  }
  function daySheetSections(show) {
    var d = show && isObj(show.daySheet) ? show.daySheet : {};
    var out = [];
    var sec = function (key, title) { var x = { key: key, title: title, lines: [] }; out.push(x); return x; };
    var put = function (x, label, v) {
      v = String(v == null ? '' : v).trim();
      if (v) x.lines.push(label + ': ' + v);
    };
    var venue = sec('venue', 'Venue');
    put(venue, 'Address', d.venueAddress);
    put(venue, 'Venue phone', d.venuePhone);
    put(venue, 'Wifi', d.wifi);
    put(venue, 'Wifi password', d.wifiPass);
    put(venue, 'Parking', d.parking);
    var day = sec('schedule', 'Schedule');
    put(day, 'Lobby call', cleanTime(d.lobbyCall));
    put(day, 'Load in', timeSpan(d.loadIn, d.loadInEnd));
    dsList(d.soundchecks).forEach(function (r) {
      day.lines.push('Soundcheck — ' + (String(r.band || '').trim() || 'TBA') + ': ' + (timeSpan(r.time, r.end) || 'TBA'));
    });
    var vip = vipView(d);
    vip.rows.forEach(function (r) {
      day.lines.push('VIP — ' + (String(r.band || '').trim() || 'TBA') + ': ' + (timeSpan(r.time, r.end) || 'TBA'));
    });
    put(day, 'Early VIP entry', cleanTime(vip.early));
    put(day, 'Last call for guest list', cleanTime(d.lastCall));
    put(day, 'Doors', cleanTime(d.doors));
    dsList(d.setTimes).forEach(function (r) {
      day.lines.push((String(r.band || '').trim() || 'TBA') + ': ' + (timeSpan(r.time, r.end) || 'TBA'));
    });
    put(day, 'Load out', cleanTime(d.loadOut));
    put(day, 'Bus call', cleanTime(d.busCall));
    put(day, 'Drive to next venue', d.driveNext);
    var amen = [];
    DS_AMENITIES.forEach(function (a) {
      var v = d[a[0]];
      if (v === 'yes') amen.push(a[1] + ' yes');
      else if (v === 'no') amen.push('no ' + a[1].toLowerCase());
    });
    var am = sec('amenities', 'Amenities');
    if (amen.length) am.lines.push(amen.join(' · '));
    var more = sec('extras', 'More from the sheet');
    dsMoreLines(d, show).forEach(function (r) {
      more.lines.push(r.label && r.value ? r.label + ': ' + r.value : (r.label || r.value));
    });
    put(sec('notes', 'Notes'), 'Notes', d.notes);
    return out.filter(function (x) { return x.lines.length; });
  }
  function daySheetLines(show) {
    return daySheetSections(show).reduce(function (all, x) { return all.concat(x.lines); }, []);
  }
  function daySheetText(show) {
    var head = [];
    if (show) {
      var city = String(show.city || '').trim();
      var venue = String(show.venue || '').trim();
      head.push([city, venue].filter(Boolean).join(' — ') || 'Day sheet');
      if (parseDay(show.date)) {
        head[0] = head[0] + ' · ' + new Intl.DateTimeFormat('en-US',
          { weekday: 'short', month: 'short', day: 'numeric' }).format(parseDay(show.date));
      }
    }
    var parts = daySheetSections(show).map(function (x) {
      return [x.title.toUpperCase()].concat(x.lines).join('\n');
    });
    return head.concat(parts).join('\n\n');
  }
  var DAY_BAR_GRACE = 15 * 60e3;
  function dbMins(hr, mins, ap) {
    return ((hr % 12) + (ap === 'p' ? 12 : 0)) * 60 + mins;
  }
  function dbBareAp(hr, kind) {
    if (kind === 'early') return hr >= 7 && hr <= 11 ? 'a' : 'p';
    if (kind === 'late') return hr === 12 || hr <= 5 ? 'a' : 'p';
    if (kind === 'set') return hr === 12 ? 'a' : 'p';
    return 'p';
  }
  function dayClock(v, kind) {
    var t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!t) return null;
    var re = /(\d{1,2})(?:[:.](\d{2}))?(?!\d)(?:\s?([ap])\.?\s?m?\.?(?![a-z]))?/gi;
    var all = [], m;
    while ((m = re.exec(t))) {
      var prev = m.index > 0 ? t.charAt(m.index - 1) : '';
      if (/[\d:.$]/.test(prev)) continue;
      var hr = +m[1], mins = m[2] != null ? +m[2] : 0, ap = m[3] ? m[3].toLowerCase() : '';
      if (hr > 23 || mins > 59) continue;
      if (ap && (hr === 0 || hr > 12)) continue;
      all.push({ hr: hr, mins: mins, ap: ap, full: m[2] != null || !!ap, at: m.index, end: m.index + m[0].length });
    }
    var joined = function (x, y) {
      return !!(x && y) && /^\s*(?:-|–|—|to|until|till)\s*$/i.test(t.slice(x.end, y.at));
    };
    var i = -1;
    for (var k = 0; k < all.length && i < 0; k++) {
      if (all[k].full || t.replace(/\.$/, '') === String(all[k].hr) ||
          (joined(all[k], all[k + 1]) && all[k + 1].full)) i = k;
    }
    if (i < 0) return null;
    var a = all[i], b = joined(a, all[i + 1]) ? all[i + 1] : null;
    var is24 = function (x) { return !x.ap && (x.hr === 0 || x.hr >= 13); };
    var start, end = null;
    if (a.ap) start = dbMins(a.hr, a.mins, a.ap);
    else if (is24(a)) start = a.hr * 60 + a.mins;
    else if (b && (b.ap || is24(b))) {
      var bap = b.ap || (b.hr >= 13 ? 'p' : 'a');
      var h1 = a.hr % 12, h2 = b.hr % 12;
      var same = h1 < h2 || (h1 === h2 && a.mins <= b.mins);
      start = dbMins(a.hr, a.mins, same ? bap : (bap === 'a' ? 'p' : 'a'));
    } else start = dbMins(a.hr, a.mins, dbBareAp(a.hr, kind));
    if (b) {
      if (b.ap) end = dbMins(b.hr, b.mins, b.ap);
      else if (is24(b)) end = b.hr * 60 + b.mins;
      else {
        end = dbMins(b.hr, b.mins, start >= 720 ? 'p' : 'a');
        if (end < start) end = (end + 720) % 1440;
      }
    }
    return { start: start, end: end };
  }
  function dayChangeOver(v) {
    var t = String(v == null ? '' : v);
    return /^[^a-z0-9]*change[\s-]*overs?(?![a-z])/i.test(t) || /^[^a-z0-9]*c\s*\/\s*o\s*(?:$|[:\-–—(]|\d)/i.test(t);
  }
  function dayTimeline(show, opts) {
    var o = isObj(opts) ? opts : {};
    var d = show && isObj(show.daySheet) ? show.daySheet : {};
    var ours = String(o.ourBand || '').trim().toLowerCase();
    var str = function (v) { return String(v == null ? '' : v).trim(); };
    var raw = [];
    var add = function (key, label, v, kind, band) {
      var c = dayClock(v, kind);
      if (c) raw.push({ key: key, label: label, band: band || '', c: c });
    };
    var co = function (v, quiet) {
      var c = dayClock(v, 'set');
      if (c) raw.push({ key: 'changeover', label: 'Change Over', band: '', c: c, quiet: quiet });
      return !!c;
    };
    add('lobby', 'Lobby Call', d.lobbyCall, 'early');
    add('loadin', 'Load In', d.loadIn, 'early');
    dsList(d.soundchecks).forEach(function (r) {
      if (dayChangeOver(r.band)) co(r.time, true);
      else add('soundcheck', 'Sound Check', r.time, 'early', str(r.band));
    });
    vipList(d).forEach(function (r) { add('vip', 'VIP', r.time, 'mid', str(r.band)); });
    add('lastcall', 'Last Call For Guest List', d.lastCall, 'mid');
    add('doors', 'Doors', d.doors, 'mid');
    var setIdx = [];
    dsList(d.setTimes).forEach(function (r) {
      if (dayChangeOver(r.band)) { co(r.time, false); return; }
      var c = dayClock(r.time, 'set');
      if (!c) return;
      var e = dayClock(r.end, 'late');
      setIdx.push(raw.length);
      raw.push({ key: 'set', label: str(r.band) || 'Set', band: str(r.band), c: { start: c.start, end: e ? e.start : c.end } });
    });
    dsExtras(d.extras).forEach(function (x) {
      var named = dayChangeOver(x.label), found = false;
      x.value.split(/[;,\n]+/).forEach(function (p) {
        if ((named || dayChangeOver(p)) && co(p, true)) found = true;
      });
      if (named && !found) co(x.label, true);
    });
    add('loadout', 'Load Out', d.loadOut, 'late');
    add('buscall', 'Bus Call', d.busCall, 'late');
    var latest = -1;
    var place = function (m, bus, quiet) {
      var at = m < ROLLOVER_HOURS * 60 || (bus && m < 720) ? m + 1440 : (m < 720 && latest >= 18 * 60 ? m + 1440 : m);
      if (!quiet && at > latest) latest = at;
      return at;
    };
    var steps = [];
    raw.forEach(function (r, i) {
      r.at = place(r.c.start, r.key === 'buscall', r.quiet);
      r.order = i;
      if (r.key === 'set') {
        if (r.c.end != null) {
          var e = r.c.end < ROLLOVER_HOURS * 60 ? r.c.end + 1440 : r.c.end;
          if (e < r.at) e += 1440;
          r.endAt = e - r.at <= 12 * 60 ? e : null;
        }
      }
    });
    var last = null;
    setIdx.forEach(function (i) { if (!last || raw[i].at >= last.at) last = raw[i]; });
    if (last && last.endAt != null) raw.push({ key: 'showend', label: 'Show Is Over', band: '', at: last.endAt, order: last.order + 0.5 });
    var sets = setIdx.map(function (i) { return raw[i]; }).sort(function (a, b) { return a.at - b.at || a.order - b.order; });
    var listed = raw.filter(function (r) { return r.key === 'changeover'; });
    var free = null;
    for (var k = 1; k < sets.length; k++) {
      var a = sets[k - 1], b = sets[k];
      if (a.endAt != null && (free == null || a.endAt > free)) free = a.endAt;
      var mid = listed.filter(function (r) { return r.at > a.at && r.at < b.at; });
      mid.forEach(function (r) { r.keep = true; });
      if (!mid.length && a.endAt != null && free < b.at) {
        raw.push({ key: 'changeover', label: 'Change Over', band: '', at: free, order: a.order + 0.5, keep: true });
      }
    }
    raw.forEach(function (r) {
      if (r.key === 'changeover' && !r.keep) return;
      var mine = r.key === 'set' && !!ours && r.band.toLowerCase() === ours;
      var named = r.key === 'soundcheck' || r.key === 'vip';
      var sub = named ? r.band : (mine ? 'Your set' : '');
      steps.push({ key: r.key, label: r.label, sub: sub,
        name: named && r.band ? r.label + ' · ' + r.band : r.label,
        band: r.band, mine: mine, at: r.at, order: r.order });
    });
    steps.sort(function (a, b) { return a.at - b.at || a.order - b.order; });
    steps = steps.filter(function (s, i, all) { return !(s.key === 'changeover' && i > 0 && all[i - 1].key === 'changeover'); });
    var bus = null;
    steps.forEach(function (s) { if (s.key === 'buscall') bus = s; });
    if (bus) steps = steps.filter(function (s) { return s.at <= bus.at && (s.key !== 'buscall' || s === bus); });
    var day = parseDay(show && show.date);
    var tz = typeof o.tz === 'string' ? o.tz : '';
    steps.forEach(function (s) {
      delete s.order;
      var z = day && tz ? zoneMoment(show.date, s.at, tz) : null;
      s.ts = z != null ? z : day ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, s.at).getTime() : null;
    });
    return {
      date: day ? show.date : null,
      steps: steps,
      start: steps.length ? steps[0].ts : null,
      end: steps.length ? steps[steps.length - 1].ts : null
    };
  }
  function dayAt(tl, now) {
    var steps = tl && Array.isArray(tl.steps) ? tl.steps : [];
    var t = now == null ? Date.now() : +now;
    var i = -1;
    for (var k = 0; k < steps.length; k++) if (steps[k].ts != null && steps[k].ts <= t) i = k;
    var lastStep = steps[steps.length - 1];
    return {
      index: i, before: i < 0 && steps.length > 0,
      current: i >= 0 ? steps[i] : null,
      next: steps[i + 1] || null,
      then: steps[i + 2] || null,
      over: !!lastStep && i === steps.length - 1 && t >= lastStep.ts + DAY_BAR_GRACE
    };
  }
  function dayBarState(tl, now) {
    var t = now == null ? Date.now() : +now;
    var at = dayAt(tl, t);
    if (!at.current) return null;
    if (at.over) return null;
    var sec = function (ms) { return ms == null ? 0 : Math.floor(ms / 1000); };
    var cur = at.current;
    return {
      now: cur.label,
      nowSub: cur.sub,
      mine: !!cur.mine,
      since: sec(cur.ts),
      next: at.next ? at.next.name : '',
      nextAt: at.next ? sec(at.next.ts) : 0,
      nextLabel: at.next ? at.next.label : '',
      nextSub: at.next ? at.next.sub : '',
      then: at.then ? at.then.name : '',
      thenAt: at.then ? sec(at.then.ts) : 0,
      nowKey: cur.key,
      nextKey: at.next ? at.next.key : ''
    };
  }
  var ALARM_STAGE_LEAD = 30;
  var ALARM_LASTCALL_LEAD = 15;
  function zoneMoment(day, minutes, tz) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day == null ? '' : day));
    if (!m || !tz) return null;
    try {
      var fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      var wall = function (ms) {
        var p = {};
        fmt.formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = Number(x.value); });
        return Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
      };
      var want = Date.UTC(+m[1], +m[2] - 1, +m[3], 0, minutes);
      var t = want;
      for (var i = 0; i < 3; i++) {
        var seen = wall(t);
        if (seen === want) break;
        t += want - seen;
      }
      return t;
    } catch (e) { return null; }
  }
  function showAlarms(show, opts) {
    var o = isObj(opts) ? opts : {};
    var tl = dayTimeline(show, { ourBand: o.ourBand });
    var out = { stage: null, bus: null, lastcall: null };
    var day = parseDay(tl.date);
    if (!day) return out;
    var tz = typeof o.tz === 'string' ? o.tz : '';
    var when = function (mins) {
      var z = tz ? zoneMoment(tl.date, mins, tz) : null;
      return z != null ? z : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, mins).getTime();
    };
    tl.steps.forEach(function (s) {
      if (s.key === 'set' && s.mine && !out.stage) out.stage = { at: when(s.at - ALARM_STAGE_LEAD), band: s.band };
      if (s.key === 'buscall') out.bus = { at: when(s.at) };
      if (s.key === 'lastcall' && !out.lastcall) out.lastcall = { at: when(s.at - ALARM_LASTCALL_LEAD) };
    });
    return out;
  }
  var STEP_KIND = { lobby: 'early', loadin: 'early', soundcheck: 'early', vip: 'mid', vipearly: 'mid', lastcall: 'mid',
    doors: 'mid', set: 'set', changeover: 'set', loadout: 'late', buscall: 'late' };
  function dayStepDone(tl, row, now, opts) {
    var steps = tl && Array.isArray(tl.steps) ? tl.steps : [];
    var r = isObj(row) ? row : {};
    var kind = STEP_KIND[r.key];
    var c = kind ? dayClock(r.time, kind) : null;
    var day = parseDay(tl && tl.date);
    if (!c || !day || !steps.length) return false;
    var tz = isObj(opts) && typeof opts.tz === 'string' ? opts.tz : '';
    var when = function (mins) {
      var z = tz ? zoneMoment(tl.date, mins, tz) : null;
      return z != null ? z : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, mins).getTime();
    };
    var t = now == null ? Date.now() : +now;
    var lastAt = steps[steps.length - 1].at;
    if (t < when(ROLLOVER_HOURS * 60) || t >= Math.max(when(1440 + ROLLOVER_HOURS * 60), when(lastAt) + DAY_BAR_GRACE)) return false;
    var named = r.key === 'soundcheck' || r.key === 'vip' || r.key === 'set';
    var band = named ? String(r.band == null ? '' : r.band).trim().toLowerCase() : '';
    var own = steps.filter(function (s) {
      return s.key === r.key && s.at % 1440 === c.start && (!named || String(s.band || '').trim().toLowerCase() === band);
    })[0];
    var at = own ? own.at : (c.start < ROLLOVER_HOURS * 60 || (r.key === 'buscall' && c.start < 720) ? c.start + 1440 : c.start);
    var hasEnd = String(r.end == null ? '' : r.end).trim();
    var e = hasEnd ? dayClock(r.end, r.key === 'set' || r.key === 'changeover' ? 'late' : kind) : null;
    var end = e ? e.start : c.end;
    if (end != null) {
      if (end < ROLLOVER_HOURS * 60) end += 1440;
      if (end < at) end += 1440;
      if (end - at <= 12 * 60) return t >= when(end);
    }
    if (r.key === 'buscall') return t >= when(at);
    var next = steps.filter(function (s) { return s.at > at; })[0];
    return !!next && t >= when(next.at);
  }
  var LAST_CALL_BEFORE = [30, 60, 90];
  var LAST_CALL_MAX = 720;
  function lastCallRule(tour) {
    var r = tour && isObj(tour.lastCallRule) ? tour.lastCallRule : null;
    if (!r) return null;
    if (r.mode === 'time') {
      var t = cleanTime(r.time);
      return /^\d{1,2}:\d{2}[AP]M$/.test(t) ? { mode: 'time', time: t, before: 0 } : null;
    }
    if (r.mode === 'doors') {
      var n = Number(r.before);
      return isFinite(n) && Math.floor(n) === n && n >= 1 && n <= LAST_CALL_MAX ? { mode: 'doors', time: '', before: n } : null;
    }
    return null;
  }
  function dayFirstSet(show) {
    var first = dayTimeline(show).steps.filter(function (s) { return s.key === 'set'; })[0];
    return first ? first.at : null;
  }
  function showLastCall(show, tour) {
    var d = show && isObj(show.daySheet) ? show.daySheet : {};
    var own = dayClock(d.lastCall, 'mid');
    if (own) return { time: String(d.lastCall).trim(), at: own.start, tour: false };
    var r = lastCallRule(tour);
    if (!r) return null;
    var at;
    if (r.mode === 'time') at = dayClock(r.time, 'mid').start;
    else {
      var doors = dayClock(d.doors, 'mid');
      var from = doors ? doors.start : dayFirstSet(show);
      if (from == null) return null;
      at = ((from - r.before) % 1440 + 1440) % 1440;
    }
    return { time: vipClockTime(at), at: at, tour: true };
  }
  function withLastCall(show, tour) {
    var lc = isObj(show) ? showLastCall(show, tour) : null;
    if (!lc || !lc.tour) return show;
    return Object.assign({}, show, { daySheet: Object.assign({}, isObj(show.daySheet) ? show.daySheet : {}, { lastCall: lc.time }) });
  }
  function lastCallWords(tour) {
    var r = lastCallRule(tour);
    if (!r) return '';
    return r.mode === 'time' ? r.time + ' every show day' : r.before + ' min before doors';
  }
  function budgetFrom(tour) {
    var exp = normExpenses(tour && tour.expenses);
    var out = {};
    var total = 0;
    TYPED_CATEGORIES.forEach(function (c) {
      var projected = c.key === 'crew' ? null : exp[c.key].projected;
      out[c.key] = { projected: projected, paid: 0 };
      if (projected != null) total += projected;
    });
    var comm = normCommission(tour && tour.commission);
    var commBits = [];
    commissionLines(comm).forEach(function (line) {
      var r = comm[line.key];
      if (r.mode === 'pct' && r.value > 0) commBits.push(line.label + ' ' + r.value + '%');
      else if (r.mode === 'flat' && r.value > 0) commBits.push(line.label + ' ' + money(r.value));
    });
    return { expenses: out, commission: comm, total: total, commissionSummary: commBits.join(' · ') };
  }
  function hasBudget(tour) {
    var b = budgetFrom(tour);
    return b.total > 0 || !!b.commissionSummary;
  }
  function crewKey(name) {
    return 'crew:' + String(name == null ? '' : name).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  var CITY_ACCENTS = 'áàâäãåāçćčďéèêëēęěíìîïīłñńňóòôöõōøřśšťúùûüūůýÿźżž';
  var CITY_PLAIN = 'aaaaaaacccdeeeeeeeiiiiilnnnooooooorsstuuuuuuyyzzz';
  function roadCityKey(city) {
    var s = String(city == null ? '' : city)
      .replace(/\s*\(.*\)\s*/g, ' ').replace(/\s*\(.*$/, '')
      .toLowerCase()
      .replace(/[^\x00-\x7f]/g, function (ch) {
        var i = CITY_ACCENTS.indexOf(ch);
        return i >= 0 ? CITY_PLAIN[i] : ch;
      })
      .replace(/[.'’]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    return s.replace(/^saint /, 'st ').replace(/^mount /, 'mt ').replace(/^fort /, 'ft ')
      .replace(/^n /, 'north ').replace(/^s /, 'south ').replace(/^e /, 'east ').replace(/^w /, 'west ')
      .replace(/^new york city$/, 'new york').replace(/^nyc$/, 'new york').replace(/^washington dc$/, 'washington');
  }
  function geoMeters(aLat, aLon, bLat, bLon) {
    var r = Math.PI / 180;
    var dLat = (bLat - aLat) * r, dLon = (bLon - aLon) * r;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371008.8 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }
  function usesMiles(lang) {
    var parts = String(lang || '').trim().split(/[-_]/);
    var region = parts.slice(1).filter(function (x) { return /^[a-z]{2}$/i.test(x); })[0];
    if (!region) return !parts[0] || /^en$/i.test(parts[0]);
    return ['US', 'GB', 'LR', 'MM'].indexOf(region.toUpperCase()) >= 0;
  }
  function distanceText(m, miles) {
    m = Number(m);
    if (!isFinite(m) || m < 0) return '';
    if (miles) {
      var mi = m / 1609.344;
      return (mi < 9.95 ? Math.max(0.1, Math.round(mi * 10) / 10).toFixed(1) : String(Math.round(mi))) + ' mi';
    }
    if (m < 950) return Math.max(50, Math.round(m / 50) * 50) + ' m';
    var km = m / 1000;
    return (km < 9.95 ? (Math.round(km * 10) / 10).toFixed(1) : String(Math.round(km))) + ' km';
  }
  function walkMinutes(m) {
    m = Number(m);
    if (!isFinite(m) || m < 0) return 0;
    return Math.max(1, Math.round(m * 1.25 / (5000 / 60)));
  }
  function walkText(m) {
    var n = walkMinutes(m);
    return n && n <= 90 ? 'about ' + n + ' min walk' : '';
  }
  var OH_DAYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  var OH_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var OH_D = '(?:mo|tu|we|th|fr|sa|su)';
  var OH_DR = OH_D + '(?:\\s*-\\s*' + OH_D + ')?';
  var OH_RULE = new RegExp('^(' + OH_DR + '(?:\\s*,\\s*' + OH_DR + ')*)(?:\\s+(.+))?$', 'i');
  function ohDays(spec) {
    var out = [];
    spec.split(',').forEach(function (part) {
      var m = /^\s*(mo|tu|we|th|fr|sa|su)\s*(?:-\s*(mo|tu|we|th|fr|sa|su))?\s*$/i.exec(part);
      if (!m) return;
      var a = OH_DAYS.indexOf(m[1].toLowerCase()), b = m[2] ? OH_DAYS.indexOf(m[2].toLowerCase()) : a;
      for (var i = a, n = 0; n < 7; i = (i + 1) % 7, n++) {
        if (out.indexOf(i) < 0) out.push(i);
        if (i === b) break;
      }
    });
    return out;
  }
  function ohTimes(spec) {
    var s = String(spec).trim().toLowerCase();
    if (s === 'off' || s === 'closed') return [];
    if (s === '24/7') return [[0, 1440]];
    var out = [];
    var ok = s.split(',').every(function (part) {
      var m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(part);
      if (!m || +m[2] > 59 || +m[4] > 59) return false;
      var a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4];
      if (a >= 1440 || b > 2880) return false;
      out.push([a, b > 1440 ? b - 1440 : b]);
      return true;
    });
    return ok ? out : null;
  }
  function openingHours(text) {
    var s = String(text == null ? '' : text).trim();
    if (!s || s.length > 255) return null;
    s = s.replace(/(\d)\s*,\s*(?=(?:mo|tu|we|th|fr|sa|su|ph|sh)\b)/gi, '$1;');
    var week = [[], [], [], [], [], [], []];
    var rules = s.split(';');
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i].trim();
      if (!r || /^(ph|sh)\b/i.test(r)) continue;
      var m = OH_RULE.exec(r);
      var days = m ? ohDays(m[1]) : [0, 1, 2, 3, 4, 5, 6];
      var times = m ? (m[2] == null ? [[0, 1440]] : ohTimes(m[2])) : ohTimes(r);
      if (!times || !days.length) return null;
      days.forEach(function (d) { week[d] = times.slice(); });
    }
    return week;
  }
  function hoursOpenAt(week, day, min) {
    return week[day].some(function (iv) { return iv[1] > iv[0] ? min >= iv[0] && min < iv[1] : min >= iv[0]; }) ||
      week[(day + 6) % 7].some(function (iv) { return iv[1] <= iv[0] && min < iv[1]; });
  }
  function clockWords(min) {
    min = ((min % 1440) + 1440) % 1440;
    if (min === 0) return 'midnight';
    if (min === 720) return 'noon';
    var hr = Math.floor(min / 60), mn = min % 60;
    return (hr % 12 || 12) + (mn ? ':' + pad(mn) : '') + (hr < 12 ? ' AM' : ' PM');
  }
  function hoursSpan(list) {
    if (!list.length) return 'Closed';
    if (list.length === 1 && list[0][0] === 0 && (list[0][1] === 1440 || list[0][1] === 0)) return 'Open all day';
    return list.map(function (iv) { return clockWords(iv[0]) + ' to ' + clockWords(iv[1]); }).join(', ');
  }
  function hoursNow(text, now) {
    var week = openingHours(text);
    if (!week) return null;
    var d = now instanceof Date ? now : new Date();
    var day = (d.getDay() + 6) % 7, min = d.getHours() * 60 + d.getMinutes();
    return { open: hoursOpenAt(week, day, min), today: hoursSpan(week[day]) };
  }
  function hoursWeek(text) {
    var week = openingHours(text);
    if (!week) return [];
    var out = [], same = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };
    for (var i = 0; i < 7;) {
      var j = i;
      while (j + 1 < 7 && same(week[j + 1], week[i])) j++;
      out.push({ days: i === 0 && j === 6 ? 'Every day' : j === i ? OH_NAMES[i]
        : j === i + 1 ? OH_NAMES[i] + ' and ' + OH_NAMES[j] : OH_NAMES[i] + ' to ' + OH_NAMES[j],
        hours: hoursSpan(week[i]) });
      i = j + 1;
    }
    return out;
  }
  var GUEST_PASSES = ['GA', 'VIP', 'All Access', 'Photo Pass'];
  function parseGuestList(text) {
    var out = [];
    String(text == null ? '' : text).split(/\r?\n|;/).forEach(function (raw) {
      var line = String(raw).replace(/^[\s\u2022*\u2013\u2014-]+/, '')
        .replace(/^\d{1,3}[.)]\s+/, '').trim();
      if (!line) return;
      var email = (line.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/) || [''])[0];
      if (email) line = line.replace(email, ' ');
      var phone = (line.match(/\+?\d[\d\s().-]{6,}\d/) || [''])[0];
      if (phone) line = line.replace(phone, ' ');
      var qty = 1;
      var plus = line.match(/\+\s*(\d{1,2})\b/);
      var times = line.match(/\bx\s*(\d{1,2})\b/i);
      if (plus) { qty = Math.min(20, 1 + num(plus[1])); line = line.replace(plus[0], ' '); }
      else if (times) { qty = Math.max(1, Math.min(20, num(times[1]))); line = line.replace(times[0], ' '); }
      var affiliation = '';
      var par = line.match(/\(([^)]*)\)/);
      if (par) { affiliation = par[1].trim(); line = line.replace(par[0], ' '); }
      var parts = line.split(/,| \u2013 | \u2014 | - /);
      var name = String(parts[0] || '').replace(/\s+/g, ' ').trim()
        .replace(/[\u2013\u2014-]+$/, '').trim();
      if (!affiliation) affiliation = parts.slice(1).join(', ').replace(/\s+/g, ' ').trim();
      var words = name ? name.split(' ') : [];
      var row = {
        firstName: words[0] || '', lastName: words.slice(1).join(' '),
        affiliation: affiliation.slice(0, 80), email: email, phone: phone.trim(), qty: qty
      };
      if (row.firstName || row.email) out.push(row);
    });
    return out.slice(0, 100);
  }
  function guestSummary(list) {
    var names = 0, tickets = 0;
    (list || []).forEach(function (g) {
      if (!isObj(g)) return;
      names += 1;
      tickets += Math.max(1, Math.min(20, num(g.qty) || 1));
    });
    return { names: names, tickets: tickets };
  }
  function guestListText(show, list) {
    var head = [];
    if (show) {
      var city = String(show.city || '').trim();
      var venue = String(show.venue || '').trim();
      var top = 'Guest list \u2014 ' + ([city, venue].filter(Boolean).join(', ') || 'show');
      if (parseDay(show.date)) {
        top += ' \u00b7 ' + new Intl.DateTimeFormat('en-US',
          { weekday: 'short', month: 'short', day: 'numeric' }).format(parseDay(show.date));
      }
      head.push(top);
    }
    var rows = (list || []).filter(isObj).slice().sort(function (a, b) {
      return String(a.lastName || '').localeCompare(String(b.lastName || '')) ||
        String(a.firstName || '').localeCompare(String(b.firstName || ''));
    }).map(function (g) {
      var name = [String(g.firstName || '').trim(), String(g.lastName || '').trim()]
        .filter(Boolean).join(' ') || 'Guest';
      var qty = Math.max(1, Math.min(20, num(g.qty) || 1));
      var line = name + (qty > 1 ? ' +' + (qty - 1) : '');
      if (g.passType) line += ' - ' + g.passType;
      if (String(g.affiliation || '').trim()) line += ' (' + String(g.affiliation).trim() + ')';
      return line;
    });
    var sum = guestSummary(list);
    if (rows.length) rows.push(sum.names + (sum.names === 1 ? ' name' : ' names') + ' \u00b7 ' + sum.tickets + (sum.tickets === 1 ? ' ticket' : ' tickets'));
    return head.concat(rows).join('\n');
  }
  function cleanStr(v, cap) { return String(v == null ? '' : v).trim().slice(0, cap || 90); }
  function cleanPairList(v) {
    if (!Array.isArray(v)) return [];
    return v.slice(0, 12).map(function (r) {
      return isObj(r) ? { band: cleanStr(r.band, 60), time: cleanStr(r.time, 20) } : null;
    }).filter(function (r) { return r && (r.band || r.time); });
  }
  function cleanRowList(v) {
    if (!Array.isArray(v)) return [];
    return v.slice(0, 12).map(function (r) {
      return isObj(r) ? { band: cleanStr(r.band, 60), time: cleanStr(r.time, 20), end: cleanStr(r.end, 20) } : null;
    }).filter(function (r) { return r && (r.band || r.time || r.end); });
  }
  function cleanYesNo(v) {
    var t = String(v == null ? '' : v).toLowerCase();
    return t === 'yes' ? 'yes' : t === 'no' ? 'no' : '';
  }
  function normalizeTourImport(out) {
    var src = isObj(out) ? out : {};
    var raw = Array.isArray(src.days) ? src.days : (Array.isArray(out) ? out : []);
    var days = [];
    raw.slice(0, 90).forEach(function (r) {
      if (!isObj(r)) return;
      var date = cleanStr(r.date, 10);
      if (!parseDay(date)) return;
      var vipRows = cleanRowList(r.vipTimes);
      var sheet = {
        loadIn: cleanStr(r.loadIn, 40), vip: vipRows.length ? '' : cleanStr(r.vip, 90), vipTimes: vipRows,
        vipEarly: cleanStr(r.vipEarly, 40), doors: cleanStr(r.doors, 40),
        loadOut: cleanStr(r.loadOut, 40), lobbyCall: cleanStr(r.lobbyCall, 40), busCall: cleanStr(r.busCall, 40),
        wifi: cleanStr(r.wifi, 90), wifiPass: cleanStr(r.wifiPass, 90), parking: cleanStr(r.parking, 160),
        driveNext: cleanStr(r.driveNext, 60), notes: cleanStr(r.notes, 200),
        soundchecks: cleanPairList(r.soundchecks), setTimes: cleanPairList(r.setTimes)
      };
      DS_AMENITIES.forEach(function (a) { sheet[a[0]] = cleanYesNo(r[a[0]]); });
      var any = daySheetLines({ daySheet: sheet }).length > 0;
      if (!any) return;
      days.push({ date: date, city: cleanStr(r.city, 80), venue: cleanStr(r.venue, 80), sheet: sheet });
    });
    return { days: days, found: days.length };
  }
  function mergeDaySheet(existing, incoming) {
    var out = {};
    var ex = isObj(existing) ? existing : {};
    ['loadIn', 'vipEarly', 'doors', 'loadOut', 'lobbyCall', 'busCall', 'wifi', 'wifiPass', 'parking', 'driveNext', 'notes']
      .forEach(function (k) { out[k] = incoming[k] || cleanStr(ex[k], 200); });
    var vipIn = cleanRowList(incoming.vipTimes);
    if (vipIn.length) { out.vipTimes = vipIn; out.vip = vipMirror(vipIn); }
    else if (cleanStr(incoming.vip, 200)) out.vip = cleanStr(incoming.vip, 200);
    out.soundchecks = incoming.soundchecks.length ? incoming.soundchecks : cleanPairList(ex.soundchecks);
    out.setTimes = incoming.setTimes.length ? incoming.setTimes : cleanPairList(ex.setTimes);
    DS_AMENITIES.forEach(function (a) { out[a[0]] = incoming[a[0]] || cleanYesNo(ex[a[0]]); });
    return out;
  }
  function offDayLines(off) {
    var d = isObj(off) ? off : {};
    var lines = [];
    var put = function (label, v) {
      v = String(v == null ? '' : v).trim();
      if (v) lines.push(label + ': ' + v);
    };
    put('Hotel', d.hotel);
    put('Wifi', d.wifi);
    put('Wifi password', d.wifiPass);
    put('Rooms', d.rooms);
    put('Bus call', cleanTime(d.busCall));
    (Array.isArray(d.plans) ? d.plans : []).forEach(function (r) {
      if (!isObj(r)) return;
      var label = String(r.label || '').trim(), time = String(r.time || '').trim();
      if (label || time) lines.push((time || 'TBA') + ': ' + (label || 'TBA'));
    });
    put('Notes', d.notes);
    return lines;
  }
  function offDayText(date, off) {
    var head = 'OFF DAY';
    var city = String(off && off.city || '').trim();
    if (city) head += ' \u2014 ' + city;
    if (parseDay(date)) {
      head += ' \u00b7 ' + new Intl.DateTimeFormat('en-US',
        { weekday: 'short', month: 'short', day: 'numeric' }).format(parseDay(date));
    }
    return [head].concat(offDayLines(off)).join('\n');
  }
  function pickBandNumber(out) {
    var o = isObj(out) ? JSON.parse(JSON.stringify(out)) : {};
    var n = function (v) { var m = String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''); return m && m !== '-' ? Number(m) : NaN; };
    var tt = isObj(o.totals) ? o.totals : {};
    var due = n(tt.dueArtist), adj = n(tt.adjusted), venue = n(tt.dueVenue);
    o.income = isObj(o.income) ? o.income : {};
    var had = n(o.income.merch);
    if (due > 0) o.income.merch = round(due * 100) / 100;
    else if (adj > 0 && (venue === 0 || !(had > 0))) o.income.merch = round(adj * 100) / 100;
    var cash = n(o.cash);
    if (cash < 0) {
      o.cash = 0;
      o.notes = (Array.isArray(o.notes) ? o.notes : []).concat([{ label: 'Cash from show',
        value: '\u2212$' + (round(-cash * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' (cash paid out)' }]);
    }
    return o;
  }
  function normalizeSettlement(out) {
    var src = isObj(out) ? out : {};
    var incSrc = isObj(src.income) ? src.income : src;
    var income = {};
    var found = 0;
    INCOME_FIELDS.forEach(function (f) {
      var v = incSrc[f.key];
      if (v == null || v === '') return;
      var n = num(v);
      if (n > 0) { income[f.key] = round(n * 100) / 100; found += 1; }
    });
    var miscLabel = String(incSrc.miscLabel == null ? '' : incSrc.miscLabel).trim().slice(0, 60);
    var notes = [];
    var rawNotes = Array.isArray(src.notes) ? src.notes : [];
    rawNotes.slice(0, 12).forEach(function (n) {
      if (!isObj(n)) return;
      var label = String(n.label == null ? '' : n.label).trim().slice(0, 40);
      var value = String(n.value == null ? '' : n.value).trim().slice(0, 120);
      if (label && value) notes.push({ label: label, value: value });
    });
    var cashRaw = src.cash != null ? src.cash : incSrc.cash;
    var cash = cashRaw == null || cashRaw === '' ? null : round(num(cashRaw) * 100) / 100;
    if (cash != null && !(cash >= 0)) cash = null;
    var cards = isObj(src.cards) ? src.cards : {};
    var receipts = cards.receipts == null || cards.receipts === '' ? null : round(num(cards.receipts) * 100) / 100;
    var fee = cards.fee == null || cards.fee === '' ? null : round(Math.abs(num(cards.fee)) * 100) / 100;
    var cardsBy = /venue/i.test(String(src.cardsBy || '')) ? 'venue' : (/artist/i.test(String(src.cardsBy || '')) ? 'artist' : null);
    var cardDeposit = receipts != null && receipts >= 0 && cardsBy !== 'venue'
      ? round((receipts - (fee || 0)) * 100) / 100 : null;
    var type = String(src.reportType || '').toLowerCase();
    var reportType = /progress|tour/.test(type) ? 'tour_progress' : (/settle/.test(type) ? 'settlement' : (type ? 'other' : null));
    return { income: income, miscLabel: miscLabel, notes: notes, found: found, cash: cash,
      cardReceipts: receipts, cardFee: fee, cardDeposit: cardDeposit, cardsBy: cardsBy, reportType: reportType };
  }
  function csvCell(v) {
    var t = String(v == null ? '' : v);
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }
  function toCSV(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n') + '\n';
  }
  function settlementNoteText(show) {
    return (Array.isArray(show.settlementNotes) ? show.settlementNotes : [])
      .map(function (n) { return n.label + ': ' + n.value; }).join('; ');
  }
  function showCounted(s) {
    var inc = isObj(s && s.income) ? s.income : {};
    var by = {};
    INCOME_FIELDS.forEach(function (f) {
      var v = f.key === 'guarantee'
        ? (guaranteeIn(s) ? Math.max(0, num(inc.guarantee) - guaranteeOwed(s) - guaranteeLost(s) - guaranteeKept(s)) : 0)
        : f.key === 'buyouts' ? buyoutIncome(s) : f.key === 'merch' ? incomeOf(s, 'merch') : num(inc[f.key]);
      by[f.key] = round(v * 100) / 100;
    });
    var total = round(INCOME_FIELDS.reduce(function (t, f) { return t + by[f.key]; }, 0) * 100) / 100;
    var has = num(inc.guarantee) > 0, gTotal = guaranteeTotal(s), gNet = guaranteeNet(s), owed = guaranteeOwed(s);
    var tips = merchTips(s);
    return {
      by: by, total: total,
      guarantee: {
        total: gTotal, offTop: has ? Math.max(0, round((gTotal - gNet) * 100) / 100) : 0, net: gNet, counted: by.guarantee,
        waiting: has && !guaranteeIn(s) ? gNet : 0, owed: owed,
        received: !has ? '' : s.guaranteePaidBy === 'agency' ? 'agency deposit' : !guaranteeIn(s) ? 'not yet' : owed > 0 ? 'part' : 'yes'
      },
      buyoutsAll: round(num(inc.buyouts) * 100) / 100,
      tips: tips.amount > 0 ? tips : null
    };
  }
  function crewPaidBy(tour) {
    var by = {}, loose = 0;
    var add = function (x) {
      var sh = crewShares(tour, x);
      sh.shares.forEach(function (p) { by[p.crewId] = round(((by[p.crewId] || 0) + p.amount) * 100) / 100; });
      loose += sh.loose;
    };
    rows(tour && tour.charges).forEach(function (ch) { if (!ch.accounted && ch.category === 'crew') add(ch); });
    rows(tour && tour.cashLog).forEach(function (x) { if (x.category === 'crew') add(x); });
    return { by: by, loose: round(loose * 100) / 100 };
  }
  function payPlanWords(tour, p) {
    var per = { week: 'a week', day: 'a day', month: 'a month' }[p && p.per];
    if (!per || p.payTyped || !(num(p.rate) > 0)) return 'Typed total';
    var r = personRun(tour, p), own = parseDay(p.from) || parseDay(p.to);
    return money(num(p.rate)) + ' ' + per + (r && own ? ', ' + r.from + ' to ' + r.to : '') + ' (part weeks by the day)';
  }
  function closeoutCSVs(tour) {
    var out = {};
    closeoutSheets(tour).forEach(function (s) { out[s.file] = toCSV(s.rows); });
    return out;
  }
  function closeoutSheets(tour) {
    var c = calc(tour);
    var shows = c.allShows;
    var r2 = function (n) { return round(num(n) * 100) / 100; };
    var blank = function (v) { return v ? r2(v) : ''; };
    var head = ['Date', 'City', 'Venue', 'Sold out'];
    INCOME_FIELDS.forEach(function (f) {
      if (f.key === 'guarantee') head.push('Guarantee total', 'Taken off the top', 'Guarantee', 'Guarantee received');
      else if (f.key === 'merch') head.push('Merch', 'Merch tips');
      else if (f.key === 'buyouts') head.push('Buyouts (Members’ part)', 'Buyouts collected');
      else head.push(f.label);
    });
    head.push('Show total', 'Notes');
    var showRows = [head];
    shows.forEach(function (s) {
      var k = showCounted(s), g = k.guarantee, row = [s.date || '', s.city || '', s.venue || '', s.soldOut ? 'yes' : ''];
      INCOME_FIELDS.forEach(function (f) {
        if (f.key === 'guarantee') row.push(blank(g.total), blank(g.offTop), blank(g.counted), g.received);
        else if (f.key === 'merch') row.push(blank(k.by.merch), k.tips ? r2(k.tips.amount) : '');
        else if (f.key === 'buyouts') row.push(blank(k.by.buyouts), blank(k.buyoutsAll));
        else row.push(blank(k.by[f.key]));
      });
      var notes = [];
      if (g.waiting > 0) notes.push('guarantee not received yet: ' + money(g.waiting) + ' counts when it lands');
      if (g.owed > 0) notes.push('still owed by the promoter: ' + money(g.owed));
      if (k.tips) notes.push('tips ' + (k.tips.how === 'deposited' ? 'deposited with the merch' : k.tips.paid ? 'in cash, handed over' : 'in cash, still to hand over'));
      var sett = settlementNoteText(s);
      if (sett) notes.push(sett);
      row.push(blank(k.total), notes.join('; '));
      showRows.push(row);
    });
    c.otherRows.forEach(function (x) {
      var row = [x.date || '', 'Other income', otherEntryLabel(x), ''];
      while (row.length < head.length - 2) row.push('');
      row.push(num(x.amount), x.unsorted ? 'a guarantee not placed on a show yet' : '');
      showRows.push(row);
    });
    var expRows = [['Category', 'Projected', 'Actual paid', 'Variance', 'Counted', 'Note']];
    c.lines.forEach(function (l) {
      var note = [];
      if (l.done) note.push('Done paying: counts what was paid');
      if (num(l.loose) > 0.004) note.push(money(l.loose) + ' with no name on it');
      if (l.key === 'commission' && num(l.offTop) > 0) note.push(money(l.offTop) + ' taken out of guarantees before deposit');
      if (l.key === 'commission' && num(l.owesBack) > 0) note.push('the booking agent owes ' + money(l.owesBack) + ' back');
      if (l.key === 'reimbursements' && num(l.left) > 0.004) note.push(money(l.left) + ' still to pay back');
      if (l.key === 'merchTips') note.push('owed to the merch person');
      expRows.push([l.label,
        l.projected == null ? '' : r2(l.projected),
        r2(l.paid),
        l.projected == null || l.key === 'reimbursements' ? '' : r2(l.paid - l.projected),
        r2(l.effective), note.join('; ')]);
    });
    otherDebts(tour).forEach(function (d) {
      expRows.push(['Owed: ' + (d.label || 'Debt'), '', num(d.amount), '', num(d.amount), '']);
    });
    expRows.push(['Day by day', '', r2(c.dayByDay), '', r2(c.dayByDay), '']);
    expRows.push(['TOTAL OUT', '', '', '', r2(c.out), '']);
    expRows.push(['TOTAL INCOME', '', '', '', r2(c.income), '']);
    expRows.push(['NET', '', '', '', round(c.net), '']);
    var catLabel = {};
    CHARGE_CATEGORIES.forEach(function (x) { catLabel[x.key] = x.label; });
    extraCategories(tour).forEach(function (x) { catLabel[x.key] = x.label; });
    var nameOf = function (id) { var p = tour && isObj(tour.crew) && isObj(tour.crew[id]) ? tour.crew[id] : null; return p ? String(p.name || 'No name') : 'someone no longer listed'; };
    var chargeRows = [['Date', 'Merchant', 'Amount', 'Category', 'For', 'Counted']];
    rows(tour && tour.charges).sort(byDate).forEach(function (ch) {
      var lines = chargeLineParts(tour, ch).map(function (q) { return q.line; });
      var label = ch.category === 'crew' && lines.length > 1 ? 'Members & Crew'
        : chargeLine(tour, ch) === 'members' ? 'Members' : catLabel[ch.category] || ch.category || '';
      var sp = ch.category === 'crew' ? crewSplitOf(ch) : null;
      var who = sp ? Object.keys(sp).map(function (k) { return nameOf(k) + ' ' + r2(sp[k]); }).join('; ')
        : ch.category === 'crew' && ch.crewId ? nameOf(ch.crewId) : '';
      chargeRows.push([ch.date || '', ch.merchant || '', num(ch.amount), label, who, ch.accounted ? 'no (already accounted for)' : 'yes']);
    });
    var dayRows = [['Date', 'Label', 'Amount', 'Source', 'Meals flag']];
    rows(tour && tour.extras).sort(byDate).forEach(function (x) {
      dayRows.push([x.date || '', x.label || '', num(x.amount), 'Logged',
        /food|meal|catering/i.test(String(x.label)) ? 'MEAL (50% rule)' : '']);
    });
    rows(tour && tour.charges).sort(byDate).forEach(function (ch) {
      if (ch.category !== DAY_BY_DAY) return;
      dayRows.push([ch.date || '', ch.merchant || '', num(ch.amount), 'Card', '']);
    });
    var comm = normCommission(tour && tour.commission);
    var commRows = [['Line', 'Deal', 'Base', 'Amount']];
    commissionLines(comm).forEach(function (line) {
      var r = comm[line.key];
      commRows.push([line.label,
        r.mode === 'pct' ? r.value + '%' : 'Flat ' + money(r.value),
        r.mode === 'pct' ? (function () {
          var lbl = commissionBaseLabel(r);
          return lbl.charAt(0).toUpperCase() + lbl.slice(1) + ' ' +
            money(commissionBase(r, c.commissionBy) || 0);
        })() : '',
        round(commissionLine(line, r, c.commissionShowIncome, c.guarantees, c.commissionBy))]);
    });
    commRows.push(['Earned so far, all lines', '', 'Guarantees in full, ' + money(c.guarantees), r2(c.commissionProjected)]);
    if (num(c.commissionKept) > 0) commRows.push(['Taken out of guarantees before deposit (already paid)', '', '', r2(c.commissionKept)]);
    if (num(c.agencyAdvance) > 0) {
      commRows.push(['Held by the booking agent (advance)', '',
        c.agencyShows.map(function (x) { return String(x.city).split(',')[0] + ' ' + x.date; }).join('; '), r2(c.agencyAdvance)]);
    }
    var aw = c.agentWhole;
    if (aw && num(comm.agent && comm.agent.value) > 0) {
      commRows.push(['Booking agent’s share of the whole tour', comm.agent.mode === 'pct' ? comm.agent.value + '%' : 'Flat',
        (aw.complete ? 'Every night' : 'The nights with a guarantee typed') + ', guarantees in full', r2(aw.whole)]);
      commRows.push(['Booking agent holds', '', 'Advance and what they took off the top', r2(aw.has)]);
      if (aw.owesBack > 0) commRows.push(['The booking agent owes back', '', '', r2(aw.owesBack)]);
    }
    commRows.push(['TOTAL', '', 'Counted on the books (the Commission line)', round(c.commission)]);
    var pp = payPeople(tour);
    var payRows = [['Name', 'Group', 'Title', 'Pay plan', 'Projected', 'Paid', 'Left to pay']];
    pp.people.forEach(function (p) {
      payRows.push([p.name, p.group, p.title, p.plan, p.projected || '', p.paid, p.left == null ? '' : p.left]);
    });
    if (pp.loose != null) payRows.push(['Pay with no name on it', 'Crew', '', '', '', pp.loose, '']);
    c.lines.filter(function (l) { return l.key === 'members' || l.key === 'crew'; }).forEach(function (l) {
      payRows.push(['TOTAL ' + l.label.toUpperCase(), '', '', l.done ? 'Done paying: counts what was paid' : 'Counts ' + money(l.effective),
        l.projected == null ? '' : r2(l.projected), r2(l.paid), l.projected == null ? '' : Math.max(0, r2(l.left))]);
    });
    var askRows = [['Date', 'Who', 'What', 'Amount', 'Paid back', 'How', 'Paid back on']];
    reimbursementRows(tour).slice().sort(byDate).forEach(function (r) {
      askRows.push([r.date || '', r.name || '', r.what || '', r2(r.amount), r.status === 'paid' ? 'yes' : 'not yet',
        r.status === 'paid' ? (r.how || '') : '', r.status === 'paid' && r.paidAt ? String(r.paidAt).slice(0, 10) : '']);
    });
    return [
      { name: 'Shows', file: 'shows.csv', rows: showRows },
      { name: 'Budget vs actual', file: 'expenses-budget-vs-actual.csv', rows: expRows },
      { name: 'Members and Crew pay', file: 'pay-members-and-crew.csv', rows: payRows },
      { name: 'Reimbursements', file: 'reimbursements.csv', rows: askRows },
      { name: 'Card charges', file: 'card-charges.csv', rows: chargeRows },
      { name: 'Day by day', file: 'day-by-day.csv', rows: dayRows },
      { name: 'Commissions', file: 'commissions.csv', rows: commRows }
    ];
  }
  var SUM_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function cents(n) { return Math.round(num(n) * 100) / 100; }
  function sumDay(d, noYear) {
    if (!parseDay(d)) return '';
    var s = SUM_MON[Number(d.slice(5, 7)) - 1] + ' ' + Number(d.slice(8, 10));
    return noYear ? s : s + ', ' + d.slice(0, 4);
  }
  function sumSpan(a, b) {
    if (!parseDay(a)) return '';
    if (!parseDay(b) || b === a) return sumDay(a);
    return sumDay(a, a.slice(0, 4) === b.slice(0, 4)) + ' – ' + sumDay(b);
  }
  function sumPlural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
  function sumLine(label, amount, hint) { return { label: String(label || ''), amount: cents(amount), hint: hint || '' }; }
  function sumGroup(list, nameOf) {
    var out = [], at = {};
    (list || []).forEach(function (x) {
      var k = nameOf(x), a = num(x && x.amount);
      if (!(k in at)) { at[k] = out.length; out.push({ label: k, amount: 0, n: 0 }); }
      out[at[k]].amount += a; out[at[k]].n += 1;
    });
    out.forEach(function (g) { g.amount = cents(g.amount); });
    return out;
  }
  function sumTotal(lines) { return cents((lines || []).reduce(function (n, l) { return n + num(l.amount); }, 0)); }
  function sumStats(inn, out, outLabel) {
    return [{ k: 'Came in', v: cents(inn) }, { k: outLabel || 'Went out', v: cents(out) }, { k: 'Net', v: cents(cents(inn) - cents(out)), net: true }];
  }
  function paidSoFar(c) {
    var paid = (c.lines || []).reduce(function (n, l) { return l.key === 'merchTips' ? n : n + num(l.paid); }, 0);
    return cents(paid + num(c.dayByDay));
  }
  function otherIncomeLabel(x) {
    var nm = otherEntryLabel(x);
    return 'Other income' + (x && x.kind === 'other' && nm === otherKindLabel('other') ? '' : ' · ' + nm);
  }
  function payPeople(tour) {
    var paid = crewPaidBy(tour);
    var people = rows(tour && tour.crew).filter(function (p) { return String(p.name || '').trim(); });
    var group = function (p) { return isHelper(p) ? 'Not on the tour' : isMember(p) ? 'Member' : 'Crew'; };
    var order = { Member: 0, Crew: 1, 'Not on the tour': 2 };
    people.sort(function (a, b) { return order[group(a)] - order[group(b)] || String(a.name).localeCompare(String(b.name)); });
    var list = people.map(function (p) {
      var proj = isHelper(p) ? 0 : cents(crewPay(tour, p)), got = cents(paid.by[p.id] || 0);
      return { name: String(p.name).trim(), group: group(p), title: p.title || '', plan: isHelper(p) ? '' : payPlanWords(tour, p),
        projected: proj, paid: got, left: proj ? Math.max(0, cents(proj - got)) : null };
    });
    var typedPaid = cents(normExpenses(tour && tour.expenses).crew.paid);
    return { people: list, loose: paid.loose > 0 || typedPaid > 0 ? cents(paid.loose + typedPaid) : null };
  }
  var TAX_NOTE = 'Categories are the tour’s own, not Schedule C lines — mapping is yours. ' +
    'Day-by-day food entries are flagged as meals in the spreadsheet (50% limit generally applies). ' +
    'Receipts are kept outside this app. Card charges carry dates and merchant names for your audit trail.';
  function tourSummary(tour) {
    var t = isObj(tour) ? tour : {};
    var c = calc(t), shows = c.allShows;
    var dated = shows.map(function (s) { return s.date; }).filter(parseDay).sort();
    var artist = String(t.artist || '').trim();
    var counted = shows.map(showCounted);
    var by = function (key) { return counted.reduce(function (n, k) { return n + k.by[key]; }, 0); };
    var NAMES = { guarantee: 'Guarantees', buyouts: 'Buyouts (Members’ part)' };
    var cameIn = [];
    INCOME_FIELDS.forEach(function (f) { var v = by(f.key); if (v > 0.004) cameIn.push(sumLine(NAMES[f.key] || f.label, v)); });
    sumGroup(c.otherRows, otherIncomeLabel).forEach(function (g) { cameIn.push(sumLine(g.label, g.amount)); });
    var cityOf = function (s) { return String(s.city || 'Show').split(',')[0] + ' ' + sumDay(s.date, true); };
    var waiting = [], owedBy = [], tipNights = [], offTop = 0, crewBuyouts = 0;
    shows.forEach(function (s, i) {
      var k = counted[i];
      if (k.guarantee.waiting > 0) waiting.push(cityOf(s) + ' ' + money(k.guarantee.waiting));
      if (k.guarantee.owed > 0) owedBy.push(cityOf(s) + ' ' + money(k.guarantee.owed));
      offTop += k.guarantee.offTop;
      crewBuyouts += Math.max(0, k.buyoutsAll - k.by.buyouts);
      if (k.tips) tipNights.push(cityOf(s) + ' ' + money(k.tips.amount) + (k.tips.how === 'deposited' ? ' deposited' : k.tips.paid ? ' cash, handed over' : ' cash, still to hand over'));
    });
    var inNotes = [
      offTop > 0.004 ? 'Guarantees are counted net of what came off the top before the deposit (taxes, commission, venue deductions, bank fees): ' + money(offTop) + ' across the tour. Commission is figured on the full contracted guarantees.' : '',
      waiting.length ? 'Not received yet (not counted): ' + waiting.join(', ') + '.' : '',
      owedBy.length ? 'Still owed by the promoter (not counted): ' + owedBy.join(', ') + '.' : '',
      crewBuyouts > 0.004 ? 'Buyouts: the Members’ part counts as income; the crew’s ' + money(crewBuyouts) + ' passed through to them.' : '',
      tipNights.length ? 'Merch tips (the merch person’s): ' + tipNights.join(', ') + '.' : ''].filter(Boolean);
    var wentOut = [];
    c.lines.forEach(function (l) {
      if (!(num(l.effective) > 0.004)) return;
      var hint = l.done ? 'Done paying'
        : l.key === 'reimbursements' ? (num(l.left) > 0.004 ? money(l.left) + ' still to pay back' : 'All paid back')
        : isDerived(l.key) || num(l.paid) + 0.004 >= num(l.effective) ? ''
        : num(l.paid) > 0.004 ? money(l.paid) + ' paid so far' : 'Nothing paid yet';
      wentOut.push(sumLine(l.label, l.effective, hint));
    });
    otherDebts(t).forEach(function (d) { if (num(d.amount) > 0.004) wentOut.push(sumLine('Owed: ' + (d.label || 'Debt'), d.amount)); });
    if (c.dayByDay > 0.004) wentOut.push(sumLine('Day by day', c.dayByDay));
    var pp = payPeople(t);
    var payLines = pp.people.filter(function (p) { return p.group !== 'Not on the tour' || p.paid > 0; }).map(function (p) {
      var bits = [p.group + (p.title ? ' · ' + p.title : '')];
      if (p.left != null && p.left > 0.004) bits.push(money(p.left) + ' left to pay');
      return sumLine(p.name, p.paid, bits.join(' · '));
    });
    if (pp.loose != null) payLines.push(sumLine('Pay with no name on it', pp.loose));
    var comm = normCommission(t.commission), commLines = [];
    commissionLines(comm).forEach(function (line) {
      var r = comm[line.key], amt = commissionLine(line, r, c.commissionShowIncome, c.guarantees, c.commissionBy);
      if (num(r.value) > 0 || amt > 0.004) commLines.push(sumLine(line.label, amt, r.mode === 'pct' ? r.value + '%' : 'Flat'));
    });
    var aw = c.agentWhole;
    var commNotes = [
      num(c.commissionKept) > 0 ? money(c.commissionKept) + ' was taken out of guarantees before deposit (already paid).' : '',
      num(c.agencyAdvance) > 0 ? 'Held by the booking agent as an advance: ' + money(c.agencyAdvance) + '.' : '',
      aw && aw.owesBack > 0 ? 'The booking agent owes ' + money(aw.owesBack) + ' back.' : '',
      Math.abs(cents(c.commission) - cents(c.commissionProjected)) > 0.004 ? 'Counted under What went out: ' + money(c.commission) + '.' : ''].filter(Boolean);
    var paid = paidSoFar(c);
    var outNotes = [
      paid + 0.004 < cents(c.out) ? 'Counted as the Budget counts it: a line not paid yet counts its projection. Paid so far: ' + money(paid) + '.' : '',
      num(c.out) > 0 ? 'Costs covered: ' + Math.floor(c.coverage * 100) + '%.' : ''].filter(Boolean);
    var sections = [
      { key: 'in', title: 'What came in', lines: cameIn, total: { label: 'Total in', amount: cents(c.income) }, notes: inNotes },
      { key: 'out', title: 'What went out', lines: wentOut, total: { label: 'Total out', amount: cents(c.out) }, notes: outNotes }];
    if (payLines.length) sections.push({ key: 'pay', title: 'Members & Crew pay', lines: payLines, total: { label: 'Paid', amount: sumTotal(payLines) }, notes: [] });
    if (commLines.length) sections.push({ key: 'comm', title: 'Commissions', lines: commLines, total: { label: 'Earned so far', amount: cents(c.commissionProjected) }, notes: commNotes });
    var sheets = closeoutSheets(t);
    var sheet = function (name) { return sheets.filter(function (s) { return s.name === name; })[0].rows; };
    var used = INCOME_FIELDS.filter(function (f) { return by(f.key) > 0.004; });
    var gigRows = shows.map(function (s, i) {
      var k = counted[i];
      return [s.date || '', (s.city || '') + (s.venue ? ' · ' + s.venue : '') + (s.soldOut ? ' (sold out)' : '')]
        .concat(used.map(function (f) { return k.by[f.key] || ''; }), [k.total]);
    });
    c.otherRows.forEach(function (x) {
      gigRows.push([x.date || '', otherIncomeLabel(x)].concat(used.map(function () { return ''; }), [num(x.amount)]));
    });
    gigRows.push(['', 'Total'].concat(used.map(function (f) { return cents(by(f.key)); }), [cents(c.income)]));
    var details = [
      { title: 'Income by show', cols: [{ t: 'Date', w: 62 }, { t: 'City · venue', w: 150 }].concat(used.map(function (f) {
        return { t: f.key === 'buyouts' ? 'Buyouts (Members)' : f.label, w: 70, a: 'r', money: true };
      }), [{ t: 'Total', w: 74, a: 'r', money: true }]), rows: gigRows, bold: [gigRows.length - 1] },
      tableOf('Budget vs actual', sheet('Budget vs actual').filter(function (r, i) { return i === 0 || /^(TOTAL|NET)\b/.test(String(r[0])) || [1, 2, 3, 4].some(function (k) { return typeof r[k] === 'number' && Math.abs(r[k]) > 0.004; }); }), [110, 66, 66, 66, 66, 130], [1, 2, 3, 4]),
      tableOf('Members & Crew pay', sheet('Members and Crew pay').map(function (r) { return [r[0], r[1], r[4], r[5], r[6]]; }), [150, 80, 80, 80, 80], [2, 3, 4]),
      tableOf('Commissions', sheet('Commissions'), [170, 60, 170, 70], [3])];
    var asks = sheet('Reimbursements');
    if (asks.length > 1) details.push(tableOf('Reimbursements', asks.map(function (r) { return [r[0], r[1], r[2], r[3], r[4]]; }), [66, 100, 160, 70, 70], [3]));
    var cardNotes = cardDebts(t).map(function (card) {
      var sm = cardSummary(card, t);
      var bd = isObj(card.breakdown) ? card.breakdown : {};
      var bits = TYPED_CATEGORIES.filter(function (x) { return num(bd[x.key]) > 0; }).map(function (x) { return x.label + ' ' + moneyCents(num(bd[x.key])); });
      if (sm.accounted > 0 && sm.feed) bits.push('filed into categories ' + moneyCents(sm.accounted));
      if (sm.remainder > 0) bits.push((sm.feed ? 'Credit card ' : 'Misc ') + moneyCents(sm.remainder));
      if (sm.feed && sm.paidOff > 0) bits.push('paid off ' + moneyCents(sm.paidOff));
      return sm.label + ': ' + moneyCents(sm.balance) + ' carried in. ' + (bits.length ? 'Broken down: ' + bits.join(', ') + '.' : 'Not broken down.');
    });
    if (cardNotes.length) details.push({ title: 'Carried in on cards', notes: cardNotes });
    var settle = shows.filter(function (s) { return Array.isArray(s.settlementNotes) && s.settlementNotes.length; }).map(function (s) {
      return cityOf(s) + ': ' + settlementNoteText(s);
    });
    if (settle.length) details.push({ title: 'Settlement notes', notes: settle });
    return {
      kind: 'tour', kicker: 'Tour summary', title: String(t.name || 'Untitled tour'),
      sub: [artist, dated.length ? sumSpan(dated[0], dated[dated.length - 1]) : '', sumPlural(shows.length, 'show')].filter(Boolean).join(' · '),
      stats: sumStats(c.income, c.out, 'Total out'), sections: sections, notes: [TAX_NOTE], details: details,
      sheets: sheets.map(function (s) { return { name: s.name, rows: s.rows }; })
    };
  }
  function tableOf(title, list, widths, moneyCols) {
    var head = list[0] || [];
    var cols = head.map(function (h, i) { return { t: String(h), w: widths[i] || 70, a: moneyCols.indexOf(i) >= 0 ? 'r' : 'l', money: moneyCols.indexOf(i) >= 0 }; });
    var body = list.slice(1);
    var bold = [];
    body.forEach(function (r, i) { if (/^(TOTAL|NET)\b/.test(String(r[0])) || String(r[1]) === 'Total') bold.push(i); });
    return { title: title, cols: cols, rows: body, bold: bold };
  }
  var OFF_LEFT_OUT = ['offdebt', 'merchTips', 'reimbursements'];
  function offSummary(book, year, artist, tours) {
    var y = String(year), t = isObj(book) ? book : {};
    var slice = yearSlice(t, y);
    slice.crew = t.crew;
    var split = offDuring(slice, tours), kept = split.kept, during = split.during, home = split.home;
    var c = calc(kept);
    var name = String(artist || t.artist || '').trim();
    var income = c.otherRows || [];
    var lines = c.lines.filter(function (l) { return OFF_LEFT_OUT.indexOf(l.key) < 0; });
    var cameIn = sumGroup(income, otherEntryLabel).map(function (g) { return sumLine(g.label, g.amount, g.n > 1 ? sumPlural(g.n, 'deposit') : ''); });
    var wentOut = lines.filter(function (l) { return num(l.paid) > 0.004; }).map(function (l) { return sumLine(l.label, l.paid); });
    if (num(c.dayByDay) > 0.004) wentOut.push(sumLine('Day by day', c.dayByDay));
    var inTotal = sumTotal(income), outTotal = sumTotal(wentOut);
    var catLabel = offCatLabels(t);
    var duringOf = { charges: Object.create(null), income: Object.create(null), cash: Object.create(null) };
    during.forEach(function (g) { ['charges', 'income', 'cash'].forEach(function (k) { g[k].forEach(function (x) { duringOf[k][x.id] = g.tour.name; }); }); });
    var duringWord = function (k, x) { return duringOf[k][x.id] != null ? 'no (during ' + duringOf[k][x.id] + ')' : ''; };
    var counted = {};
    lines.forEach(function (l) { counted[l.key] = true; });
    counted[DAY_BY_DAY] = true;
    var countedWord = function (ch) {
      if (ch.accounted) return 'no (already accounted for)';
      var k = chargeLine(slice, ch);
      if (!k) return 'no (no category yet)';
      return duringWord('charges', ch) || (counted[k] ? 'yes' : 'no (filed under ' + (catLabel[ch.category] || ch.category) + ', not counted off tour)');
    };
    var incAll = rows(slice.otherIncome).sort(byDate), cashAll = rows(slice.cashLog).sort(byDate);
    var incSay = incAll.some(function (x) { return !!duringWord('income', x); });
    var cashSay = cashAll.some(function (x) { return !!duringWord('cash', x); });
    var incRows = [['Date', 'What', 'Amount'].concat(incSay ? ['Counted'] : [])].concat(incAll.map(function (x) {
      return [x.date || '', otherEntryLabel(x), cents(x.amount)].concat(incSay ? [duringWord('income', x) || 'yes'] : []);
    }));
    var chRows = [['Date', 'Merchant', 'Category', 'Amount', 'Counted']].concat(rows(slice.charges).sort(byDate).map(function (ch) {
      return [ch.date || '', ch.merchant || '', catLabel[ch.category] || ch.category || '', cents(ch.amount), countedWord(ch)];
    }));
    var cashWord = function (x) {
      var k = chargeLine(slice, x);
      return duringWord('cash', x) || (!k || CASH_MOVES[k] || !counted[k] ? 'no' : 'yes');
    };
    var cashRows = [['Date', 'Category', 'Note', 'Amount'].concat(cashSay ? ['Counted'] : [])].concat(cashAll.map(function (x) {
      return [x.date || '', catLabel[x.category] || x.category || '', x.note || x.label || '', cents(x.amount)].concat(cashSay ? [cashWord(x)] : []);
    }));
    var sheets = [{ name: 'Income', rows: incRows }, { name: 'Card charges', rows: chRows }];
    if (cashRows.length > 1) sheets.push({ name: 'Cash', rows: cashRows });
    var details = [tableOf('Income', incRows, incSay ? [72, 250, 90, 92] : [80, 330, 94], [2]),
      tableOf('Card charges', chRows, [66, 196, 110, 70, 62], [3])];
    if (cashRows.length > 1) details.push(tableOf('Cash', cashRows, cashSay ? [66, 100, 190, 80, 70] : [70, 120, 220, 94], [3]));
    var who = name || 'the artist';
    return {
      kind: 'off', kicker: 'Off Tour summary', title: 'Off Tour · ' + y, sub: name,
      stats: sumStats(inTotal, outTotal),
      sections: [
        { key: 'in', title: 'What came in', lines: cameIn, total: { label: 'Total in', amount: inTotal }, notes: [] },
        { key: 'out', title: 'What went out', lines: wentOut, total: { label: 'Total out', amount: outTotal }, notes: [] }]
        .concat(duringSections(t, during)),
      notes: ['What ' + who + ' took in and spent off the road in ' + y + ', by the date on each entry. ' +
        (during.length ? 'Anything dated during a tour of ' + who + ' (from its first show to its last, days at home between shows included) ' +
          'belongs to that tour: it is listed under During a tour and not counted here. ' : '') +
        (home.some(function (x) { return x.kind !== 'otherIncome'; }) ? 'Monthly utilities and CPA bills are home bills: they count here even when dated during a tour. ' : '') +
        (home.some(function (x) { return x.kind === 'otherIncome'; }) ? 'Royalties are not tour money: they count here even when dated during a tour. ' : '') +
        'The plan, and card balances or loans carried in, belong to no one year and are left out.',
        TAX_NOTE.replace('the tour’s own', 'the book’s own').replace(' Day-by-day food entries are flagged as meals in the spreadsheet (50% limit generally applies).', '')],
      details: details, sheets: sheets
    };
  }
  function offCatLabels(book) {
    var out = {};
    CHARGE_CATEGORIES.forEach(function (x) { out[x.key] = x.label; });
    extraCategories(book).forEach(function (x) { out[x.key] = x.label; });
    return out;
  }
  function offTourSpans(own, past) {
    var mine = (own || []).filter(isObj).map(function (t) {
      var d = (Array.isArray(t.days) ? t.days : []).map(String).filter(function (x) { return !!parseDay(x); }).sort();
      return d.length ? { name: String(t.name || '').trim() || 'Untitled tour', first: d[0], last: d[d.length - 1], shows: d.length, days: d } : null;
    }).filter(Boolean);
    var out = [];
    tourTimeline(mine, (past || []).filter(isObj), '').forEach(function (r) {
      var kind = r.tour && r.tour.kind;
      if (!r.own && (kind === 'festival' || kind === 'shows')) return;
      var a = String(r.first || ''), b = String(r.last || r.first || '');
      if (!parseDay(a) || !parseDay(b) || b < a) return;
      out.push({ name: String(r.name || '').trim() || 'Untitled tour', first: a, last: b, own: !!r.own, src: r.own ? null : r.tour });
    });
    return out.sort(function (x, y) { return x.first.localeCompare(y.first) || x.last.localeCompare(y.last) || x.name.localeCompare(y.name); });
  }
  var HOME_BILL_WORDS = /\b(?:cpas?|accountants?|accounting|bookkeep(?:er|ers|ing)|tax prep(?:arer|arers|aration)?)\b/i;
  function homeBillWords(key, label) {
    return HOME_BILL_WORDS.test(String(label || '') + ' ' + String(key || '').replace(/^x-/, '').replace(/[^a-z0-9]+/gi, ' '));
  }
  function homeBillCats(book) {
    var out = { utilities: true };
    extraCategories(book).forEach(function (c) { if (homeBillWords(c.key, c.label)) out[c.key] = true; });
    return out;
  }
  function homeBill(book, x) {
    var cat = isObj(x) && typeof x.category === 'string' ? x.category : '';
    if (cat === 'utilities') return true;
    return cat.indexOf('x-') === 0 && homeBillWords(cat, extraCatNames(book)[cat]);
  }
  function royaltyIncome(x) {
    return isObj(x) && x.kind === 'royalties';
  }
  var DURING_KINDS = [['charges', 'charges'], ['otherIncome', 'income'], ['cashLog', 'cash'], ['extras', 'extras']];
  function offDuring(book, tours) {
    var t = isObj(book) ? book : {};
    var list = (tours || []).filter(function (x) { return isObj(x) && !!parseDay(String(x.first || '')); });
    var kept = {}, groups = [], home = [];
    Object.keys(t).forEach(function (k) { kept[k] = t[k]; });
    if (!list.length) return { kept: kept, during: groups, home: home };
    var homeCats = homeBillCats(t);
    var counts = function (k, x) {
      if (k !== 'charges' && k !== 'cashLog') return true;
      if (k === 'charges' && x.accounted) return false;
      var line = chargeLine(t, x);
      return !!line && line !== 'offdebt' && !CASH_MOVES[line];
    };
    var groupOf = function (tour) {
      var g = groups.filter(function (x) { return x.tour === tour; })[0];
      if (!g) groups.push(g = { tour: tour, charges: [], income: [], cash: [], extras: [] });
      return g;
    };
    DURING_KINDS.forEach(function (p) {
      if (!isObj(t[p[0]])) return;
      var src = t[p[0]], keep = {};
      Object.keys(src).forEach(function (id) {
        var x = src[id], d = isObj(x) ? String(x.date || '').slice(0, 10) : '';
        var hit = isObj(x) && parseDay(d) && counts(p[0], x) ? list.filter(function (tr) { return d >= tr.first && d <= String(tr.last || tr.first); })[0] : null;
        var isHome = !!hit && ((p[0] === 'charges' || p[0] === 'cashLog') && typeof x.category === 'string' && homeCats[x.category] === true ||
          p[0] === 'otherIncome' && royaltyIncome(x));
        if (isHome) home.push({ kind: p[0], id: id, date: d, tour: hit });
        if (hit && !isHome) groupOf(hit)[p[1]].push(Object.assign({ id: id }, x));
        else keep[id] = x;
      });
      kept[p[0]] = keep;
    });
    groups.sort(function (a, b) { return list.indexOf(a.tour) - list.indexOf(b.tour); });
    groups.forEach(function (g) { ['charges', 'income', 'cash', 'extras'].forEach(function (k) { g[k].sort(byDate); }); });
    home.sort(byDate);
    return { kept: kept, during: groups, home: home };
  }
  function duringSections(book, during) {
    var catLabel = offCatLabels(book);
    return (during || []).map(function (g) {
      var tour = g.tour, name = tour.name;
      var day = function (x) { return sumDay(String(x.date || '').slice(0, 10), true); };
      var hint = function (x, what) { return [day(x), what].filter(Boolean).join(' · '); };
      var out = [];
      g.charges.forEach(function (ch) { out.push({ date: ch.date, line: sumLine(String(ch.merchant || '').trim() || catLabel[ch.category] || 'Charge', ch.amount, hint(ch, catLabel[ch.category] || ch.category)) }); });
      g.cash.forEach(function (x) { out.push({ date: x.date, line: sumLine(String(x.note || x.label || '').trim() || 'Cash', x.amount, hint(x, (catLabel[x.category] || x.category || '') + ' (cash)')) }); });
      g.extras.forEach(function (x) { out.push({ date: x.date, line: sumLine(String(x.label || '').trim() || 'Day by day', x.amount, hint(x, 'Day by day')) }); });
      out.sort(byDate);
      var spent = out.map(function (x) { return x.line; });
      var came = g.income.map(function (x) { return sumLine(otherEntryLabel(x), x.amount, hint(x, 'came in')); });
      var totals = [];
      if (spent.length) totals.push({ label: 'Went out during it', amount: sumTotal(spent) });
      if (came.length) totals.push({ label: 'Came in during it', amount: sumTotal(came) });
      var n = spent.length + came.length;
      return { key: 'during', title: 'During a tour', sub: name + ' · ' + sumSpan(tour.first, tour.last),
        lines: spent.concat(came), total: totals[0], more: totals.slice(1),
        notes: [tour.own === false
          ? (n === 1 ? 'This happened during ' : 'These happened during ') + name + '. That tour comes from the tour history and has no book on Greenroom, so ' +
            (n === 1 ? 'this line is' : 'these lines are') + ' counted with that tour and left out of Off Tour.'
          : (n === 1 ? 'This happened during ' + name + '; it belongs to that tour. Move it' : 'These happened during ' + name + '; they belong to that tour. Move them') +
            ' from the Off Tour book’s Cards/Links.'] };
    });
  }
  function paySummary(o) {
    o = isObj(o) ? o : {};
    var info = isObj(o.info) ? o.info : {}, book = isObj(o.book) ? o.book : {}, meta = isObj(o.tour) ? o.tour : {};
    var pays = Array.isArray(info.payments) ? info.payments : rows(info.payments);
    var inc = payIncome(book, pays), bk = payBook(book), st = payStanding(info);
    var cameIn = inc.lines.filter(function (l) { return l.total > 0.004; }).map(function (l) {
      return sumLine(l.label, l.total, l.key === 'tour' ? sumPlural(l.n, 'payment') + ' logged by the tour manager' : sumPlural(l.n, 'entry'));
    });
    var wentOut = bk.lines.filter(function (l) { return l.total > 0.004; }).map(function (l) {
      var bits = [['credit', 'Credit'], ['debit', 'Debit'], ['cash', 'Cash']].filter(function (p) { return l[p[0]] > 0.004; })
        .map(function (p) { return p[1] + ' ' + money(l[p[0]]); });
      return sumLine(l.label, l.total, bits.join(' · '));
    });
    var incName = {}, catName = {};
    MY_PAY_INCOME.forEach(function (x) { incName[x.key] = x.label; });
    MY_PAY_CATS.forEach(function (x) { catName[x.key] = x.label; });
    var payRows = [['Date', 'What', 'How', 'Amount']].concat(pays.slice().sort(byDate).map(function (p) { return [p.date || '', p.label || 'Pay', p.how || '', cents(p.amount)]; }));
    var incRows = [['Date', 'Kind', 'Note', 'Amount']].concat(rows(book.income).sort(byDate).map(function (e) {
      return [e.date || '', incName[e.category] || 'Other', e.note || '', cents(e.amount)];
    }));
    var expRows = [['Date', 'Category', 'How', 'Note', 'Amount']].concat(rows(book.entries).sort(byDate).filter(function (e) { return num(e.amount) > 0; }).map(function (e) {
      return [e.date || '', catName[e.category] || 'Other', e.how === 'cash' ? 'Cash' : e.how === 'debit' ? 'Debit' : 'Credit', e.note || '', cents(e.amount)];
    }));
    return {
      kind: 'pay', kicker: 'Your pay', title: String(meta.name || 'Untitled tour'),
      sub: [String(meta.artist || '').trim(), parseDay(meta.first) ? sumSpan(meta.first, meta.last) : ''].filter(Boolean).join(' · '),
      stats: sumStats(inc.gross, bk.spent),
      sections: [
        { key: 'in', title: 'What came in', lines: cameIn, total: { label: 'Total in', amount: inc.gross },
          notes: [st.onCrew ? 'Pay plan: ' + money(st.total) + ' for the tour · ' + money(st.paid) + ' logged as paid · ' + money(st.owed) + ' still owed' : ''].filter(Boolean) },
        { key: 'out', title: 'What went out', lines: wentOut, total: { label: 'Total out', amount: bk.spent }, notes: [] }],
      notes: ['Your own MY PAY for this tour: the pay the tour manager logged to you, what you logged yourself, and what you spent. Only you see it.'],
      details: [tableOf('Pay from the tour', payRows, [70, 230, 110, 94], [3]), tableOf('Income you logged', incRows, [70, 110, 230, 94], [3]),
        tableOf('What you spent', expRows, [66, 100, 60, 190, 88], [4])],
      sheets: [{ name: 'Pay from the tour', rows: payRows }, { name: 'Income you logged', rows: incRows }, { name: 'What you spent', rows: expRows }]
    };
  }
  function summaryRows(m) {
    var out = [[m.title], [m.sub || ''], []];
    (m.stats || []).forEach(function (s) { out.push([s.k, s.v]); });
    (m.sections || []).forEach(function (sec) {
      out.push([], [sec.title, 'Amount', 'Note']);
      if (sec.sub) out.push([sec.sub]);
      sec.lines.forEach(function (l) { out.push([l.label, l.amount, l.hint || '']); });
      if (sec.total) out.push([sec.total.label, sec.total.amount, '']);
      (sec.more || []).forEach(function (x) { out.push([x.label, x.amount, '']); });
      (sec.notes || []).forEach(function (n) { out.push(['', '', n]); });
    });
    (m.notes || []).forEach(function (n) { out.push([], [n]); });
    return out;
  }
  var PDF_W = {
    r: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
      278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
      611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833,
      556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584],
    b: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
      333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667,
      611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889,
      611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]
  };
  var PDF_EXTRA = { 0x85: [1000, 1000], 0x91: [222, 278], 0x92: [222, 278], 0x93: [333, 500], 0x94: [333, 500], 0x95: [350, 350],
    0x96: [556, 556], 0x97: [1000, 1000], 0xB7: [278, 278] };
  var PDF_MAP = { '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96,
    '—': 0x97, ' ': 0x20, '−': 0x2D, '×': 0xD7 };
  function pdfEnc(s) {
    var out = '';
    Array.from(String(s == null ? '' : s)).forEach(function (ch) {
      var c = ch.charCodeAt(0);
      if (ch.length === 1 && c >= 0x20 && c <= 0x7E) out += ch;
      else if (PDF_MAP[ch] != null) out += String.fromCharCode(PDF_MAP[ch]);
      else if (ch.length === 1 && c >= 0xA0 && c <= 0xFF) out += ch;
      else if (ch === '\n' || ch === '\t') out += ' ';
      else out += '?';
    });
    return out;
  }
  function pdfWidth(enc, bold, size) {
    var w = 0;
    for (var i = 0; i < enc.length; i++) {
      var c = enc.charCodeAt(i);
      w += c >= 32 && c <= 126 ? PDF_W[bold ? 'b' : 'r'][c - 32] : PDF_EXTRA[c] ? PDF_EXTRA[c][bold ? 1 : 0] : (bold ? 611 : 556);
    }
    return w * size / 1000;
  }
  function pdfWrap(enc, bold, size, width) {
    var words = enc.split(' '), lines = [], cur = '';
    words.forEach(function (wd) {
      var next = cur ? cur + ' ' + wd : wd;
      if (pdfWidth(next, bold, size) <= width || !cur) {
        cur = next;
        while (pdfWidth(cur, bold, size) > width && cur.length > 1) {
          var k = cur.length - 1;
          while (k > 1 && pdfWidth(cur.slice(0, k), bold, size) > width) k -= 1;
          lines.push(cur.slice(0, k)); cur = cur.slice(k);
        }
      } else { lines.push(cur); cur = wd; }
    });
    lines.push(cur);
    return lines;
  }
  function pdfStr(enc) { return '(' + enc.replace(/[\\()]/g, function (m) { return '\\' + m; }) + ')'; }
  function pdfNum(n) { return String(Math.round(n * 100) / 100); }
  function summaryPdf(m, made) {
    var PW = 612, PH = 792, L = 48, R = 48, TOP = 54, BOTTOM = 58, CW = PW - L - R;
    var pages = [], ops = null, y = 0;
    var INK = '0.09 0.1 0.12', GREY = '0.42 0.45 0.5', RED = '0.76 0.12 0.08', GREEN = '0.1 0.45 0.2';
    function page() { ops = []; pages.push(ops); y = PH - TOP; }
    function text(x, yy, enc, bold, size, color) {
      ops.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + pdfNum(size) + ' Tf ' + (color || INK) + ' rg ' + pdfNum(x) + ' ' + pdfNum(yy) + ' Td ' + pdfStr(enc) + ' Tj ET');
    }
    function rule(yy, gray, w) { ops.push(pdfNum(gray) + ' G ' + pdfNum(w || 0.5) + ' w ' + L + ' ' + pdfNum(yy) + ' m ' + (PW - R) + ' ' + pdfNum(yy) + ' l S'); }
    function room(h) { if (y - h < BOTTOM) page(); }
    function para(s, size, color, bold) {
      var lh = size * 1.32;
      pdfWrap(pdfEnc(s), !!bold, size, CW).forEach(function (ln) { room(lh); y -= lh; text(L, y + 2, ln, !!bold, size, color); });
    }
    function heading(s, need) {
      room(need || 96);
      y -= 22; text(L, y, pdfEnc(s), true, 12);
      y -= 6; rule(y, 0.2, 0.8);
    }
    function cell(v, col) {
      if (typeof v === 'number') return col && col.money ? moneyCents(v) : String(v);
      return String(v == null ? '' : v);
    }
    function table(tb) {
      var sum = tb.cols.reduce(function (n, c) { return n + (c.w || 60); }, 0);
      var ws = tb.cols.map(function (c) { return (c.w || 60) * CW / sum; });
      var size = 8.5, lh = size * 1.3, pad = 4;
      var head = function () {
        var hl = tb.cols.map(function (c, i) { return pdfWrap(pdfEnc(c.t), true, size, ws[i] - pad * 2); });
        var hh = Math.max.apply(null, hl.map(function (l) { return l.length; })) * lh + 6;
        room(hh + lh + 6);
        var x = L;
        hl.forEach(function (lines, i) {
          lines.forEach(function (ln, j) {
            var tx = tb.cols[i].a === 'r' ? x + ws[i] - pad - pdfWidth(ln, true, size) : x + pad;
            text(tx, y - (j + 1) * lh, ln, true, size, GREY);
          });
          x += ws[i];
        });
        y -= hh; rule(y, 0.55, 0.6);
      };
      head();
      (tb.rows || []).forEach(function (r, ri) {
        var bold = (tb.bold || []).indexOf(ri) >= 0;
        var cl = tb.cols.map(function (c, i) { return pdfWrap(pdfEnc(cell(r[i], c)), bold, size, ws[i] - pad * 2); });
        var rh = Math.max.apply(null, cl.map(function (l) { return l.length; })) * lh + 6;
        if (y - rh < BOTTOM) { page(); head(); }
        var x = L;
        cl.forEach(function (lines, i) {
          lines.forEach(function (ln, j) {
            var neg = bold && typeof r[i] === 'number' && r[i] < 0 && tb.cols[i].money;
            var tx = tb.cols[i].a === 'r' ? x + ws[i] - pad - pdfWidth(ln, bold, size) : x + pad;
            text(tx, y - 3 - (j + 1) * lh + 2, ln, bold, size, neg ? RED : INK);
          });
          x += ws[i];
        });
        y -= rh; rule(y, bold ? 0.55 : 0.88, bold ? 0.6 : 0.4);
      });
      (tb.notes || []).forEach(function (n) { y -= 4; para(n, 8.5, GREY); });
    }
    page();
    if (m.kicker) { text(L, y - 9, pdfEnc(String(m.kicker).toUpperCase()), true, 8.5, GREY); y -= 14; }
    pdfWrap(pdfEnc(m.title), true, 22, CW).forEach(function (ln) { y -= 26; text(L, y, ln, true, 22); });
    if (m.sub) { y -= 4; para(m.sub, 10, GREY); }
    var st = m.stats || [];
    if (st.length) {
      y -= 14;
      var gap = 10, bw = (CW - gap * (st.length - 1)) / st.length, bh = 50;
      st.forEach(function (s, i) {
        var x = L + i * (bw + gap);
        ops.push('0.95 g ' + pdfNum(x) + ' ' + pdfNum(y - bh) + ' ' + pdfNum(bw) + ' ' + pdfNum(bh) + ' re f');
        text(x + 10, y - 16, pdfEnc(s.k), false, 9, GREY);
        var v = s.net ? (s.v < 0 ? '-' : s.v > 0 ? '+' : '') + moneyCents(Math.abs(s.v)) : moneyCents(s.v);
        text(x + 10, y - 38, pdfEnc(v), true, 16, s.net ? (s.v < 0 ? RED : GREEN) : INK);
      });
      y -= bh + 4;
    }
    (m.sections || []).forEach(function (sec) {
      heading(sec.title);
      if (sec.sub) { y -= 2; para(sec.sub, 9.5, GREY, true); }
      var body = sec.lines.length ? sec.lines.map(function (l) { return [l.label, l.hint || '', l.amount]; }) : [['Nothing yet', '', '']];
      var bold = [];
      if (sec.total) { body.push([sec.total.label, '', sec.total.amount]); bold.push(body.length - 1); }
      (sec.more || []).forEach(function (x) { body.push([x.label, '', x.amount]); bold.push(body.length - 1); });
      table({ cols: [{ t: 'Item', w: 190 }, { t: 'Note', w: 210 }, { t: 'Amount', w: 104, a: 'r', money: true }], rows: body, bold: bold, notes: sec.notes });
    });
    (m.details || []).forEach(function (tb) {
      heading(tb.title);
      if (tb.cols) table(tb);
      else (tb.notes || []).forEach(function (n) { y -= 4; para(n, 9, INK); });
    });
    (m.notes || []).forEach(function (n, i) { if (i === 0) heading('Notes', 60); y -= 4; para(n, 9, INK); });
    var day = made || '';
    pages.forEach(function (p, i) {
      ops = p;
      var left = pdfEnc('Prepared with Greenroom' + (day ? ' · ' + day : '')), right = pdfEnc('Page ' + (i + 1) + ' of ' + pages.length);
      text(L, 30, left, false, 7.5, GREY);
      text(PW - R - pdfWidth(right, false, 7.5), 30, right, false, 7.5, GREY);
    });
    var objs = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = '<< /Type /Pages /Kids [' + pages.map(function (p, i) { return (6 + i * 2) + ' 0 R'; }).join(' ') + '] /Count ' + pages.length + ' >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    pages.forEach(function (p, i) {
      var stream = p.join('\n');
      objs[5 + i * 2] = '<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream';
      objs[6 + i * 2] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + (5 + i * 2) + ' 0 R >>';
    });
    var info = objs.length;
    objs[info] = '<< /Title ' + pdfStr(pdfEnc(m.title)) + ' /Producer (Greenroom) >>';
    var out = '%PDF-1.4\n%âãÏÓ\n', at = [];
    for (var n = 1; n < objs.length; n++) { at[n] = out.length; out += n + ' 0 obj\n' + objs[n] + '\nendobj\n'; }
    var xref = out.length;
    out += 'xref\n0 ' + objs.length + '\n0000000000 65535 f \n';
    for (n = 1; n < objs.length; n++) out += String(1e10 + at[n]).slice(1) + ' 00000 n \n';
    out += 'trailer\n<< /Size ' + objs.length + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
    var bytes = new Uint8Array(out.length);
    for (n = 0; n < out.length; n++) bytes[n] = out.charCodeAt(n) & 0xFF;
    return bytes;
  }
  function utf8(s) {
    var out = [];
    s = String(s == null ? '' : s);
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var d = s.charCodeAt(i + 1);
        if (d >= 0xDC00 && d <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00); i += 1; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  var CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = [];
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function bytesBase64(bytes) {
    var b = bytes || [], out = [], i = 0, n = b.length;
    for (; i + 2 < n; i += 3) {
      var v = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
      out.push(B64[v >> 18 & 63] + B64[v >> 12 & 63] + B64[v >> 6 & 63] + B64[v & 63]);
    }
    if (n - i === 1) { var one = b[i] << 16; out.push(B64[one >> 18 & 63] + B64[one >> 12 & 63] + '=='); }
    else if (n - i === 2) { var two = (b[i] << 16) | (b[i + 1] << 8); out.push(B64[two >> 18 & 63] + B64[two >> 12 & 63] + B64[two >> 6 & 63] + '='); }
    return out.join('');
  }
  function zipBytes(files) {
    var parts = [], central = [], offset = 0;
    var u16 = function (v) { return [v & 0xFF, (v >>> 8) & 0xFF]; };
    var u32 = function (v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; };
    files.forEach(function (f) {
      var name = utf8(f.name), data = utf8(f.text), crc = crc32(data);
      var head = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(33), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name);
      central.push([].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(33), u32(crc), u32(data.length), u32(data.length),
        u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name));
      parts.push(head, data);
      offset += head.length + data.length;
    });
    var cdSize = central.reduce(function (n, c) { return n + c.length; }, 0);
    var end = [].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cdSize), u32(offset), u16(0));
    var all = parts.concat(central, [end]);
    var total = all.reduce(function (n, p) { return n + p.length; }, 0);
    var bytes = new Uint8Array(total), at = 0;
    all.forEach(function (p) { for (var i = 0; i < p.length; i++) bytes[at++] = p[i]; });
    return bytes;
  }
  function xmlEsc(s) {
    return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function colName(i) { var s = ''; i += 1; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function sheetName(s, used) {
    var base = String(s || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet', name = base, n = 2;
    while (used.some(function (u) { return u.toLowerCase() === name.toLowerCase(); })) { name = base.slice(0, 27) + ' (' + n + ')'; n += 1; }
    used.push(name);
    return name;
  }
  function xlsxBytes(sheets) {
    var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    var PNS = 'http://schemas.openxmlformats.org/package/2006/relationships', XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    var used = [], files = [];
    var names = sheets.map(function (s) { return sheetName(s.name, used); });
    files.push({ name: '[Content_Types].xml', text: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') +
      '</Types>' });
    files.push({ name: '_rels/.rels', text: XML + '<Relationships xmlns="' + PNS + '"><Relationship Id="rId1" Type="' + RNS + '/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    files.push({ name: 'xl/workbook.xml', text: XML + '<workbook xmlns="' + NS + '" xmlns:r="' + RNS + '"><sheets>' +
      names.map(function (nm, i) { return '<sheet name="' + xmlEsc(nm) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' });
    files.push({ name: 'xl/_rels/workbook.xml.rels', text: XML + '<Relationships xmlns="' + PNS + '">' +
      sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + RNS + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + RNS + '/styles" Target="styles.xml"/></Relationships>' });
    files.push({ name: 'xl/styles.xml', text: XML + '<styleSheet xmlns="' + NS + '"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
      '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' });
    sheets.forEach(function (s, si) {
      var list = Array.isArray(s.rows) ? s.rows : [];
      var widths = [];
      list.forEach(function (r) { (r || []).forEach(function (v, i) {
        var len = typeof v === 'number' ? 12 : Math.min(60, String(v == null ? '' : v).length + 2);
        widths[i] = Math.max(widths[i] || 10, len);
      }); });
      var bold = Array.isArray(s.bold) ? s.bold : [0];
      var body = list.map(function (r, ri) {
        var b = bold.indexOf(ri) >= 0 || /^(TOTAL|NET)\b/.test(String((r || [])[0] || ''));
        var cells = (r || []).map(function (v, ci) {
          var ref = colName(ci) + (ri + 1);
          if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '" s="' + (b ? 3 : 2) + '"><v>' + v + '</v></c>';
          var t = String(v == null ? '' : v);
          if (!t) return '';
          return '<c r="' + ref + '" t="inlineStr"' + (b ? ' s="1"' : '') + '><is><t xml:space="preserve">' + xmlEsc(t) + '</t></is></c>';
        }).join('');
        return '<row r="' + (ri + 1) + '">' + cells + '</row>';
      }).join('');
      var cols = widths.length ? '<cols>' + widths.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '';
      files.push({ name: 'xl/worksheets/sheet' + (si + 1) + '.xml', text: XML + '<worksheet xmlns="' + NS + '">' + cols + '<sheetData>' + body + '</sheetData></worksheet>' });
    });
    return zipBytes(files);
  }
  function summaryXlsx(m) {
    var sum = summaryRows(m), bold = [0];
    sum.forEach(function (r, i) { if (r.length === 3 && r[1] === 'Amount') bold.push(i); });
    return xlsxBytes([{ name: 'Summary', rows: sum, bold: bold }].concat((m.sheets || []).map(function (s) { return { name: s.name, rows: s.rows }; })));
  }
  function dailyUpdate(tour, now) {
    var today = tourToday(now);
    var c = calc(tour);
    var shows = c.allShows;
    var tonight = shows.filter(function (s) { return s.date === today; })[0] || null;
    var next = shows.filter(function (s) { return s.date > today; })[0] || null;
    var fmt = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    var dayName = function (d) { var p = parseDay(d); return p ? fmt.format(p) : d; };
    var lines = [(tour.name || 'Tour') + ' — ' + dayName(today)];
    if (tonight) {
      lines.push(tonight.loggedAt
        ? 'Tonight: ' + (tonight.city || 'Show') + ', ' + money(showIncomeTotal(tonight)) + ' in'
        : 'Tonight: ' + (tonight.city || 'Show') + ' (income not logged yet)');
    }
    var todayCosts = rows(tour && tour.extras).filter(function (x) { return x.date === today; })
      .reduce(function (t, x) { return t + num(x.amount); }, 0);
    if (todayCosts > 0) lines.push("Today's costs: " + money(todayCosts));
    var r = round(c.net);
    lines.push(r < 0 ? 'Balance: ' + money(-r) + ' in the red'
      : r > 0 ? 'Balance: ' + money(r) + ' in the green' : 'Balance: right at break even');
    if (c.out > 0) {
      lines.push(money(c.income) + ' in, ' + money(c.out) + ' out — ' +
        Math.floor(c.coverage * 100) + '% of costs covered');
    }
    if (shows.length) {
      var logged = shows.filter(function (s) { return s.loggedAt; }).length;
      lines.push(logged + ' of ' + shows.length + ' show' + (shows.length === 1 ? '' : 's') + ' logged');
    }
    if (next) lines.push('Next: ' + dayName(next.date) + ', ' + (next.city || 'TBA'));
    return lines.join('\n');
  }
  var CONTACT_EMAIL = 'greenroom.tourbook@gmail.com';
  var REPORT_REASONS = [['spam', 'Spam'], ['harassment', 'Harassment or bullying'],
    ['inappropriate', 'Inappropriate or offensive'], ['other', 'Something else']];
  var REPORT_THANKS = 'Thanks. Devin will look at this within 24 hours.';
  var REPORT_KINDS = { dm: 'Message', conversation: 'Conversation', chat: 'Chat line', flower: 'Flower note', guest: 'Guest name', profile: 'Profile',
    artist: 'Artist page' };
  function reportReasonWord(code) {
    var hit = REPORT_REASONS.filter(function (r) { return r[0] === code; })[0];
    return hit ? hit[1] : 'Something else';
  }
  function firstNameOf(name) { return String(name == null ? '' : name).trim().split(/\s+/)[0] || 'them'; }
  function refusalWords(code) {
    if (code === 'cant-send') return 'You can\u2019t send to this person.';
    if (code === 'ended') return 'Your account can\u2019t send right now. Write to ' + CONTACT_EMAIL + '.';
    if (code === 'filtered') return 'That can\u2019t be sent.';
    return '';
  }
  function reportRemoveWord(kind) {
    return kind === 'profile' || kind === 'artist' ? 'Clear bio and photo' : kind === 'guest' ? 'Remove name' : kind === 'flower' ? 'Remove words' : 'Remove message';
  }
  function reportHasPhoto(r) {
    return !!(r && (r.kind === 'profile' || r.kind === 'artist') && r.snapshot && typeof r.snapshot === 'object' && r.snapshot.hasPhoto === true);
  }
  function reportCanRename(r) { return !!(r && r.kind === 'profile'); }
  function hideBlocked(rows, blocked, field) {
    var set = {};
    (Array.isArray(blocked) ? blocked : []).forEach(function (b) {
      var id = b && typeof b === 'object' ? b.userId : b;
      if (id) set[id] = true;
    });
    return (Array.isArray(rows) ? rows : []).filter(function (r) { return !(r && r[field] && set[r[field]]); });
  }
  function maskBlocked(rows, blocked, field, say) {
    var set = {};
    (Array.isArray(blocked) ? blocked : []).forEach(function (b) {
      var id = b && typeof b === 'object' ? b.userId : b;
      if (id) set[id] = true;
    });
    return (Array.isArray(rows) ? rows : []).map(function (r) {
      if (!(r && r[field] && set[r[field]])) return r;
      var out = {};
      Object.keys(r).forEach(function (k) { out[k] = r[k]; });
      out.body = String(say(r));
      out.hidden = true;
      return out;
    });
  }
  function reportLines(r) {
    var s = r && r.snapshot && typeof r.snapshot === 'object' ? r.snapshot : {};
    var q = function (t) { return '\u201c' + String(t == null ? '' : t) + '\u201d'; };
    var thread = function (list) {
      return (Array.isArray(list) ? list : []).map(function (x) { return (x.from === 'reporter' ? r.reporterName : r.reportedName) + ': ' + x.text; });
    };
    if (r.kind === 'dm') return { said: q(s.text), context: thread(s.thread).slice(0, -1), about: '' };
    if (r.kind === 'conversation') return { said: '', context: thread(s.thread), about: '' };
    if (r.kind === 'chat') {
      return { said: q(s.text), about: s.tour ? 'In the chat of ' + s.tour : '',
        context: (Array.isArray(s.context) ? s.context : []).map(function (x) { return x.author + ': ' + x.text; }) };
    }
    if (r.kind === 'flower') {
      return { said: s.text ? q(s.text) : '(no words)', context: [],
        about: 'A flower for ' + (s.to || 'someone') + (s.tour ? ' on ' + s.tour : '') };
    }
    if (r.kind === 'guest') {
      return { said: [s.first, s.last].filter(Boolean).join(' ') + (s.affiliation ? ' \u00b7 ' + s.affiliation : ''), context: [],
        about: s.tour ? 'On the guest list of ' + s.tour : '' };
    }
    if (r.kind === 'artist') {
      return { said: [s.name, s.handle ? '@' + s.handle : ''].filter(Boolean).join(' '),
        about: s.unclaimed ? 'A page nobody runs' : 'A page someone runs',
        context: [s.bio ? q(s.bio) : '', s.about ? 'About: ' + s.about : '', s.hasPhoto ? '(has a photo)' : ''].filter(Boolean) };
    }
    return { said: [s.name, s.handle ? '@' + s.handle : ''].filter(Boolean).join(' '), about: '',
      context: [s.tourRole, (s.roles || []).join(', '), s.bio ? q(s.bio) : '', s.hasPhoto ? '(has a photo)' : ''].filter(Boolean) };
  }
  root.GR = {
    CATEGORIES: CATEGORIES,
    TYPED_CATEGORIES: TYPED_CATEGORIES,
    COMMISSION_LINES: COMMISSION_LINES, commissionLines: commissionLines,
    INCOME_FIELDS: INCOME_FIELDS, buyoutIncome: buyoutIncome, incomeOf: incomeOf,
    BUYOUT_FROM: BUYOUT_FROM, buyoutShows: buyoutShows, tourManagerTitle: tourManagerTitle,
    buyoutTrackers: buyoutTrackers, buyoutOwedTo: buyoutOwedTo,
    buyoutDays: buyoutDays, buyoutDocGot: buyoutDocGot, buyoutBumpLine: buyoutBumpLine,
    supplyFresh: supplyFresh, supplySeen: supplySeen, supplySplash: supplySplash,
    noBuyoutsNight: noBuyoutsNight, buyoutSettingsOf: buyoutSettingsOf, buyoutRoster: buyoutRoster, buyoutSince: buyoutSince,
    buyoutSplitNew: buyoutSplitNew, buyoutSplitOf: buyoutSplitOf, buyoutOwed: buyoutOwed,
    mutedSpansOf: mutedSpansOf, mutedOn: mutedOn, muteHeld: muteHeld, muteTap: muteTap,
    yearSlice: yearSlice, bookYears: bookYears,
    OTHER_INCOME_KINDS: OTHER_INCOME_KINDS, otherKindLabel: otherKindLabel,
    OTHER_NOTE_MAX: OTHER_NOTE_MAX, otherNote: otherNote, otherEntryLabel: otherEntryLabel,
    HISTORY_TIERS: HISTORY_TIERS, LEGACY_BAR: LEGACY_BAR, historyTier: historyTier,
    BAND_ROLES: BAND_ROLES, ARTIST_CREW_ROLES: ARTIST_CREW_ROLES, CREW_ROLES: CREW_ROLES,
    creditGroupName: creditGroupName, creditTally: creditTally, creditClaim: creditClaim,
    creditSelection: creditSelection, tourTimeline: tourTimeline,
    CHARGE_CATEGORIES: CHARGE_CATEGORIES,
    extraCategories: extraCategories, typedCategoriesFor: typedCategoriesFor,
    chargeCategoriesFor: chargeCategoriesFor, slugCategory: slugCategory,
    extraCatNames: extraCatNames, unnamedExtraCats: unnamedExtraCats, extraCatLabel: extraCatLabel,
    CREW_TITLES: CREW_TITLES,
    DEBT_CHIPS: DEBT_CHIPS,
    DAILY_CHIPS: DAILY_CHIPS,
    DAY_BY_DAY: DAY_BY_DAY,
    ROLLOVER_HOURS: ROLLOVER_HOURS,
    num: num, optNum: optNum, money: money, moneyCents: moneyCents, round: round,
    pad: pad, ymd: ymd, parseDay: parseDay, tourToday: tourToday,
    addDays: addDays, daysBetween: daysBetween, tzForCity: tzForCity, zonedTime: zonedTime,
    isObj: isObj, rows: rows, byDate: byDate, showsNear: showsNear,
    emptyExpenses: emptyExpenses, emptyCommission: emptyCommission, emptyIncome: emptyIncome,
    normExpenses: normExpenses, normCommission: normCommission,
    vendorNorm: vendorNorm, vendorOf: vendorOf, vendorGroups: vendorGroups,
    showCounted: showCounted, crewPaidBy: crewPaidBy, payPlanWords: payPlanWords,
    crewSplitOf: crewSplitOf, crewShares: crewShares, crewShareOf: crewShareOf, chargeLineParts: chargeLineParts,
    showIncomeTotal: showIncomeTotal, taxWithheldOf: taxWithheldOf, guaranteeNet: guaranteeNet, merchTips: merchTips, merchTipsOwed: merchTipsOwed, merchTipsPaidCash: merchTipsPaidCash, isDerived: isDerived, DERIVED: DERIVED, crewProjection: crewProjection, isMember: isMember, crewSplit: crewSplit, chargeLine: chargeLine, crewOf: crewOf, isHelper: isHelper, whoKey: whoKey, whoParts: whoParts, whoCard: whoCard, whoFit: whoFit, whoHistory: whoHistory, whoLearn: whoLearn, whoIndex: whoIndex, whoSuggest: whoSuggest, looksLikePay: looksLikePay, newestFirst: newestFirst, spentOf: spentOf, crewPay: crewPay, payPeriods: payPeriods, payBook: payBook, payStanding: payStanding, MY_PAY_CATS: MY_PAY_CATS, payIncome: payIncome, MY_PAY_INCOME: MY_PAY_INCOME, payBalanceSeries: payBalanceSeries, tourKeyLoose: tourKeyLoose, mergeTourCandidates: mergeTourCandidates, tourKnown: tourKnown, tourDate: tourDate, hasLegendFor: hasLegendFor, paragraphsAbout: paragraphsAbout, etaText: etaText, wikiCut: wikiCut, parseCsv: parseCsv, readDay: readDay, concertRows: concertRows, concertItems: concertItems, tourDays: tourDays, tourRun: tourRun, personRun: personRun, personDays: personDays, agencyAdvance: agencyAdvance, agentWholeTour: agentWholeTour, showCancelled: showCancelled, cancelledCounts: cancelledCounts,
    commissionLine: commissionLine, commissionTotal: commissionTotal,
    commissionBase: commissionBase, commissionBaseLabel: commissionBaseLabel,
    cardDebts: cardDebts, otherDebts: otherDebts, cardSummary: cardSummary,
    guaranteeIn: guaranteeIn, merchDue: merchDue, merchTen: merchTen, merchNightlyAvg: merchNightlyAvg,
    DEPOSIT_HOW: DEPOSIT_HOW, depositHowWord: depositHowWord, paidByWords: paidByWords, depositFit: depositFit,
    depositHitOrder: depositHitOrder, depositTies: depositTies, depositFitSay: depositFitSay,
    DEPOSIT_PAYER: DEPOSIT_PAYER, depositPayerWord: depositPayerWord, depositPayerHint: depositPayerHint,
    depositPayerFit: depositPayerFit, depositHead: depositHead,
    showReviewScores: showReviewScores,
    showMoneyState: showMoneyState, showReceived: showReceived,
    GUARANTEE_REASONS: GUARANTEE_REASONS, guaranteeWhy: guaranteeWhy, guaranteeTotal: guaranteeTotal,
    guaranteeGap: guaranteeGap, guaranteeOwed: guaranteeOwed, guaranteeKept: guaranteeKept, guaranteeLost: guaranteeLost,
    CASH_MOVES: CASH_MOVES, cashSummary: cashSummary, cashByShow: cashByShow,
    cardPaidDetail: cardPaidDetail, preTourCutoff: preTourCutoff,
    tourStart: tourStart, tourEnd: tourEnd, daysLeftOnTour: daysLeftOnTour, cardWindow: cardWindow, cardMoved: cardMoved, cardPaidOff: cardPaidOff,
    calc: calc, stateOf: stateOf, caption: caption,
    reimbursementsOf: null,
    balanceSeries: balanceSeries, latestChange: latestChange,
    yearByMonth: yearByMonth, monthSeries: monthSeries,
    normalizeSettlement: normalizeSettlement, pickBandNumber: pickBandNumber,
    DS_AMENITIES: DS_AMENITIES, daySheetSections: daySheetSections, daySheetLines: daySheetLines, daySheetText: daySheetText,
    splitTime: splitTime, joinTime: joinTime, cleanTime: cleanTime, timeSpan: timeSpan, dsExtras: dsExtras, dsExtrasDistinct: dsExtrasDistinct, dsMoreLines: dsMoreLines,
    nightMins: nightMins, nightNow: nightNow, busCallLeft: busCallLeft,
    DAY_BAR_GRACE: DAY_BAR_GRACE, dayClock: dayClock, dayChangeOver: dayChangeOver, dayTimeline: dayTimeline, dayAt: dayAt, dayBarState: dayBarState,
    ALARM_STAGE_LEAD: ALARM_STAGE_LEAD, ALARM_LASTCALL_LEAD: ALARM_LASTCALL_LEAD, showAlarms: showAlarms, dayStepDone: dayStepDone,
    LAST_CALL_BEFORE: LAST_CALL_BEFORE, LAST_CALL_MAX: LAST_CALL_MAX, lastCallRule: lastCallRule, dayFirstSet: dayFirstSet,
    showLastCall: showLastCall,
    withLastCall: withLastCall, lastCallWords: lastCallWords,
    toCSV: toCSV, closeoutCSVs: closeoutCSVs, closeoutSheets: closeoutSheets,
    tourSummary: tourSummary, offSummary: offSummary, paySummary: paySummary, summaryRows: summaryRows,
    offTourSpans: offTourSpans, offDuring: offDuring, duringSections: duringSections,
    homeBillCats: homeBillCats, homeBill: homeBill, royaltyIncome: royaltyIncome,
    summaryPdf: summaryPdf, summaryXlsx: summaryXlsx, xlsxBytes: xlsxBytes, zipBytes: zipBytes, crc32: crc32, bytesBase64: bytesBase64,
    pdfEnc: pdfEnc, pdfWidth: pdfWidth, pdfWrap: pdfWrap, sumSpan: sumSpan, paidSoFar: paidSoFar, otherIncomeLabel: otherIncomeLabel,
    offDayLines: offDayLines, offDayText: offDayText,
    GUEST_PASSES: GUEST_PASSES, guestSummary: guestSummary, guestListText: guestListText,
    parseGuestList: parseGuestList,
    normalizeTourImport: normalizeTourImport, mergeDaySheet: mergeDaySheet,
    vipOld: vipOld, vipList: vipList, vipSort: vipSort, vipMirror: vipMirror, vipAt: vipAt, vipClockTime: vipClockTime,
    vipBands: vipBands, vipFind: vipFind, vipRead: vipRead, vipLines: vipLines, vipView: vipView, vipPack: vipPack,
    vipAlertRow: vipAlertRow, vipAlertName: vipAlertName, vipAlert: vipAlert, vipBandKey: vipBandKey, vipNoBand: vipNoBand,
    budgetFrom: budgetFrom, hasBudget: hasBudget, crewKey: crewKey, roadCityKey: roadCityKey,
    geoMeters: geoMeters, usesMiles: usesMiles, distanceText: distanceText, walkMinutes: walkMinutes, walkText: walkText,
    openingHours: openingHours, hoursNow: hoursNow, hoursWeek: hoursWeek,
    dailyUpdate: dailyUpdate,
    CONTACT_EMAIL: CONTACT_EMAIL, REPORT_REASONS: REPORT_REASONS, REPORT_THANKS: REPORT_THANKS, REPORT_KINDS: REPORT_KINDS,
    reportReasonWord: reportReasonWord, firstNameOf: firstNameOf, refusalWords: refusalWords,
    reportRemoveWord: reportRemoveWord, hideBlocked: hideBlocked, maskBlocked: maskBlocked, reportLines: reportLines,
    reportHasPhoto: reportHasPhoto, reportCanRename: reportCanRename
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
