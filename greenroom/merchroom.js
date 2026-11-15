(function (root) {
  'use strict';
  var LIMITS = {
    name: 120, sizes: 16, size: 12, price: 100000, barcode: 14, note: 500,
    products: 1000, moves: 20000, nights: 2000, sales: 200000,
    qty: 100000, comps: 500, compQty: 1000, who: 80, why: 200,
    saleItems: 50, saleQty: 1000, label: 200, nightNote: 2000, moveNote: 300,
    headCount: 1000000, pct: 100, taxRate: 30, cardPct: 15, cardSales: 10000000
  };
  var KINDS = ['apparel', 'other', 'music'];
  var KIND_WORDS = { apparel: 'Apparel', other: 'Other', music: 'Music' };
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function str(v) { return v == null ? '' : String(v); }
  function clampInt(v, lo, hi) {
    var n = typeof v === 'number' ? v : parseFloat(str(v));
    if (!isFinite(n)) return null;
    n = Math.round(n);
    return n < lo ? lo : n > hi ? hi : n;
  }
  function numOr(v, d) { var n = typeof v === 'number' ? v : parseFloat(str(v).replace(/[$,%\s]/g, '')); return isFinite(n) ? n : d; }
  function cents(v) { return Math.round(numOr(v, 0) * 100); }
  function dollars(c) { return Math.round(c) / 100; }
  var NF0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var NF2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function money(c, o) {
    var r = Math.round(c || 0), a = Math.abs(r);
    var s = (o && o.exact) || a % 100 ? NF2.format(a / 100) : NF0.format(a / 100);
    return (r < 0 ? '-' : '') + '$' + s;
  }
  function exact(c) { return money(c, { exact: true }); }
  function pct(p) { var n = Math.round(numOr(p, 0) * 1000) / 1000; return String(n) + '%'; }
  function share(c, p) { return Math.round(c * numOr(p, 0) / 100); }
  var SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', 'One size'];
  var SIZE_ALIASES = { XXL: '2XL', XXXL: '3XL', XXXXL: '4XL', XXXXXL: '5XL', '2X': '2XL', '3X': '3XL', '4X': '4XL',
    SM: 'S', SMALL: 'S', MED: 'M', MD: 'M', MEDIUM: 'M', LG: 'L', LRG: 'L', LARGE: 'L', XLARGE: 'XL', 'X-LARGE': 'XL',
    'X LARGE': 'XL', XSMALL: 'XS', 'X-SMALL': 'XS', 'X SMALL': 'XS', OS: 'One size', 'O/S': 'One size', 'ONE SIZE': 'One size',
    ONESIZE: 'One size', 'ONE-SIZE': 'One size', OSFA: 'One size' };
  var SIZE_SETS = [
    { key: 's3xl', words: 'S to 3XL', sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'] },
    { key: 'xs2xl', words: 'XS to 2XL', sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'] },
    { key: 'sxl', words: 'S to XL', sizes: ['S', 'M', 'L', 'XL'] },
    { key: 'one', words: 'One size', sizes: ['One size'] }];
  function sizeLabel(s) {
    var t = str(s).replace(/\s+/g, ' ').trim();
    if (!t) return '';
    var up = t.toUpperCase();
    if (SIZE_ALIASES[up]) return SIZE_ALIASES[up];
    if (/^(XXS|XS|S|M|L|XL|[2-5]XL)$/.test(up)) return up;
    return t.slice(0, LIMITS.size);
  }
  function sizeRank(s) { var i = SIZE_ORDER.indexOf(s); return i < 0 ? 1000 : i; }
  function cleanSizes(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (s) {
      var l = sizeLabel(s);
      if (l && out.indexOf(l) < 0 && out.length < LIMITS.sizes) out.push(l);
    });
    return out.length ? out : ['One size'];
  }
  function unionSizes(a, b) {
    var out = cleanSizes(a).slice();
    cleanSizes(b).forEach(function (s) { if (out.indexOf(s) < 0 && out.length < LIMITS.sizes) out.push(s); });
    if (out.length > 1 && out.indexOf('One size') >= 0) out = out.filter(function (s) { return s !== 'One size'; });
    if (out.every(function (s) { return sizeRank(s) < 1000; })) out.sort(function (x, y) { return sizeRank(x) - sizeRank(y); });
    return out;
  }
  function addSize(list, s) {
    var l = sizeLabel(s), out = cleanSizes(list).filter(function (x) { return x !== 'One size' || l === 'One size'; });
    if (!l || out.indexOf(l) >= 0 || out.length >= LIMITS.sizes) return out.length ? out : ['One size'];
    if (sizeRank(l) < 1000) {
      var at = out.length;
      for (var i = 0; i < out.length; i++) { if (sizeRank(out[i]) < 1000 && sizeRank(out[i]) > sizeRank(l)) { at = i; break; } }
      out.splice(at, 0, l);
    } else out.push(l);
    return out;
  }
  function sizeWords(list) {
    var s = cleanSizes(list);
    if (s.length === 1) return s[0];
    var ranks = s.map(sizeRank);
    var run = s.length >= 3 && ranks.every(function (r, i) { return r < 1000 && (i === 0 || r === ranks[i - 1] + 1); });
    return run ? s[0] + ' to ' + s[s.length - 1] : s.join(', ');
  }
  function kindOf(k) { return KINDS.indexOf(k) >= 0 ? k : 'apparel'; }
  function cutGroup(kind) { return kind === 'music' ? 'music' : 'soft'; }
  function cleanProduct(p) {
    if (!isObj(p)) return null;
    var name = str(p.name).replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
    if (!name) return null;
    var price = numOr(p.price, NaN);
    if (!isFinite(price) || price < 0 || price > LIMITS.price) return null;
    var cost = p.cost === null || p.cost === undefined || str(p.cost).trim() === '' ? null : numOr(p.cost, NaN);
    if (cost !== null && (!isFinite(cost) || cost < 0 || cost > LIMITS.price)) return null;
    var kind = kindOf(p.kind);
    return {
      id: str(p.id), name: name, kind: kind, sizes: cleanSizes(p.sizes), price: dollars(cents(price)),
      cost: cost === null ? null : dollars(cents(cost)),
      barcode: str(p.barcode).replace(/[^0-9]/g, '').slice(0, LIMITS.barcode),
      archived: p.archived === true, merged_into: p.merged_into ? str(p.merged_into) : null,
      sort_order: clampInt(p.sort_order, 0, 100000) || 0, note: str(p.note).slice(0, LIMITS.note)
    };
  }
  function byIdOf(products) {
    var out = {};
    (Array.isArray(products) ? products : []).forEach(function (p) { if (isObj(p) && p.id) out[p.id] = p; });
    return out;
  }
  function canonOf(byId, id) {
    var cur = id, seen = {};
    while (byId[cur] && byId[cur].merged_into && byId[byId[cur].merged_into] && !seen[cur]) { seen[cur] = true; cur = byId[cur].merged_into; }
    return cur;
  }
  function liveProducts(products) {
    return (Array.isArray(products) ? products : []).filter(function (p) { return isObj(p) && !p.archived; })
      .sort(function (a, b) {
        return KINDS.indexOf(kindOf(a.kind)) - KINDS.indexOf(kindOf(b.kind)) || (a.sort_order || 0) - (b.sort_order || 0) ||
          str(a.name).toLowerCase().localeCompare(str(b.name).toLowerCase());
      });
  }
  function nameKey(s) {
    var t = str(s).toLowerCase();
    try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {   }
    return t.replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean)
      .map(function (w) { return w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; })
      .sort().join(' ');
  }
  function oneApart(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a.charAt(i) === b.charAt(j)) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return edits + (la - i) + (lb - j) <= 1;
  }
  function lookAlikes(products, notSame) {
    var live = (Array.isArray(products) ? products : []).filter(function (p) { return isObj(p) && !p.archived && p.id; });
    var parent = {};
    var find = function (x) { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
    live.forEach(function (p) { parent[p.id] = p.id; });
    var keys = live.map(function (p) { return nameKey(p.name); });
    var skip = isObj(notSame) ? notSame : {};
    for (var i = 0; i < live.length; i++) {
      for (var j = i + 1; j < live.length; j++) {
        var a = live[i], b = live[j];
        if (kindOf(a.kind) !== kindOf(b.kind)) continue;
        var pair = a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id;
        if (skip[pair]) continue;
        var ka = keys[i], kb = keys[j];
        if (!ka || !kb) continue;
        if (ka === kb || (ka.length >= 5 && kb.length >= 5 && oneApart(ka, kb))) parent[find(a.id)] = find(b.id);
      }
    }
    var groups = {};
    live.forEach(function (p) { var r = find(p.id); (groups[r] = groups[r] || []).push(p); });
    return Object.keys(groups).map(function (k) { return groups[k]; }).filter(function (g) { return g.length > 1; })
      .map(function (g) {
        return g.slice().sort(function (a, b) { return str(a.created_at).localeCompare(str(b.created_at)) || str(a.id).localeCompare(str(b.id)); });
      })
      .sort(function (a, b) { return str(a[0].name).toLowerCase().localeCompare(str(b[0].name).toLowerCase()); });
  }
  function mergePlan(byId, keepId, goneId) {
    var keep = byId[keepId], gone = byId[goneId];
    if (!keep || !gone || keepId === goneId || keep.archived || keep.merged_into) return null;
    if (canonOf(byId, keepId) === goneId) return null;
    return { keep: Object.assign({}, keep, { sizes: unionSizes(keep.sizes, gone.sizes) }),
      gone: Object.assign({}, gone, { archived: true, merged_into: keepId }) };
  }
  function keyOf(pid, size) { return pid + '\u001f' + size; }
  function index(data, today) {
    var d = isObj(data) ? data : {};
    var products = Array.isArray(d.products) ? d.products.filter(isObj) : [];
    var regs = isObj(d.registers) ? d.registers : {};
    var byId = byIdOf(products);
    var canon = function (pid) { return canonOf(byId, pid); };
    var moves = {};
    (Array.isArray(d.moves) ? d.moves : []).filter(isObj).forEach(function (m) {
      var k = keyOf(canon(m.product_id), sizeLabel(m.size));
      (moves[k] = moves[k] || []).push(m);
    });
    var salesBy = {};
    (Array.isArray(d.sales) ? d.sales : []).filter(isObj).forEach(function (s) { (salesBy[s.night_id] = salesBy[s.night_id] || []).push(s); });
    Object.keys(salesBy).forEach(function (k) { salesBy[k].sort(function (a, b) { return str(a.at).localeCompare(str(b.at)); }); });
    var nights = (Array.isArray(d.nights) ? d.nights : []).filter(isObj).slice().sort(function (a, b) {
      return str(a.show_day).localeCompare(str(b.show_day)) || str(a.created_at).localeCompare(str(b.created_at)) || str(a.id).localeCompare(str(b.id));
    });
    var ix = { products: products, byId: byId, canon: canon, moves: moves, salesBy: salesBy, nights: nights, today: today || '', tables: {}, regs: regs };
    return ix;
  }
  function nightOf(ix, tourId, showId) {
    return ix.nights.filter(function (n) { return n.tour_id === tourId && n.show_id === showId; })[0] || null;
  }
  function closed(night, today) { return !!(night && (night.out_at || (night.show_day && today && night.show_day < today))); }
  function cleanCount(v) { return v === null || v === undefined || v === '' ? null : clampInt(v, 0, LIMITS.qty); }
  function registerOf(ix, nightId) {
    var out = { qty: {}, gross: {}, cash: 0, card: 0, sales: 0, items: 0, subtotal: 0, tax: 0, kept: 0 };
    var add = function (k, q, c) { out.qty[k] = (out.qty[k] || 0) + q; out.gross[k] = (out.gross[k] || 0) + c; out.items += q; };
    var sum = ix.regs && nightId ? ix.regs[nightId] : null;
    if (isObj(sum)) {
      var n = clampInt(sum.sales, 0, LIMITS.sales) || 0;
      out.sales += n; out.kept = n;
      out.cash += Math.max(0, cents(sum.cash)); out.card += Math.max(0, cents(sum.card));
      out.subtotal += Math.max(0, cents(sum.subtotal)); out.tax += Math.max(0, cents(sum.tax));
      (Array.isArray(sum.items) ? sum.items : []).forEach(function (x) {
        if (!Array.isArray(x)) return;
        var q = clampInt(x[2], 0, LIMITS.sales * LIMITS.saleQty) || 0;
        if (q) add(keyOf(ix.canon(str(x[0])), sizeLabel(x[1])), q, Math.max(0, cents(x[3])));
      });
    }
    (ix.salesBy[nightId] || []).forEach(function (s) {
      out.sales += 1;
      var total = cents(s.total), sub = cents(s.subtotal);
      if (s.pay === 'card') out.card += total; else out.cash += total;
      out.subtotal += sub; out.tax += cents(s.tax);
      (Array.isArray(s.items) ? s.items : []).forEach(function (it) {
        if (!isObj(it)) return;
        var q = clampInt(it.qty, 0, LIMITS.saleQty) || 0;
        var pid = ix.canon(it.product_id), p = ix.byId[pid];
        var each = it.price != null && str(it.price) !== '' ? cents(it.price) : p ? cents(p.price) : 0;
        add(keyOf(pid, sizeLabel(it.size)), q, q * each);
      });
    });
    return out;
  }
  function nightTable(ix, night) {
    if (!night) return { rows: [], reg: registerOf(ix, '') };
    var memo = ix.tables[night.id];
    if (memo && memo.night === night) return memo.table;
    var rows = {}, order = [];
    var row = function (pid, size) {
      var k = keyOf(pid, size);
      if (!rows[k]) { rows[k] = { key: k, pid: pid, size: size, in: null, adds: null, comps: 0, out: null, reg: 0 }; order.push(k); }
      return rows[k];
    };
    liveProducts(ix.products).forEach(function (p) { cleanSizes(p.sizes).forEach(function (s) { row(p.id, s); }); });
    var counts = isObj(night.counts) ? night.counts : {};
    Object.keys(counts).forEach(function (pid) {
      var per = isObj(counts[pid]) ? counts[pid] : {};
      Object.keys(per).forEach(function (s) {
        var c = isObj(per[s]) ? per[s] : {};
        var r = row(ix.canon(pid), sizeLabel(s));
        ['in', 'adds', 'out'].forEach(function (f) {
          var v = cleanCount(c[f]);
          if (v !== null) r[f] = (r[f] || 0) + v;
        });
      });
    });
    (Array.isArray(night.comps) ? night.comps : []).forEach(function (c) {
      if (!isObj(c)) return;
      row(ix.canon(c.product_id), sizeLabel(c.size)).comps += clampInt(c.qty, 0, LIMITS.compQty) || 0;
    });
    var reg = registerOf(ix, night.id);
    Object.keys(reg.qty).forEach(function (k) { var p = k.split('\u001f'); row(p[0], p[1]).reg += reg.qty[k]; });
    var shut = closed(night, ix.today);
    var list = order.map(function (k) {
      var r = rows[k];
      r.total = (r.in || 0) + (r.adds || 0) - r.comps;
      r.left = r.total - r.reg;
      r.uncounted = r.out !== null && r.in === null && r.adds === null;
      if (r.out !== null && !r.uncounted) { r.sold = r.total - r.out; r.by = 'count'; r.diff = r.sold - r.reg; }
      else if (shut || r.uncounted) { r.sold = r.reg; r.by = 'register'; r.diff = null; }
      else { r.sold = null; r.by = null; r.diff = null; }
      return r;
    });
    var table = { rows: list, reg: reg, closed: shut };
    ix.tables[night.id] = { night: night, table: table };
    return table;
  }
  function rowsOf(table, pid) { return table.rows.filter(function (r) { return r.pid === pid; }); }
  function nightPrice(ix, night, pid) {
    var pr = night && isObj(night.prices) ? night.prices : null;
    if (pr && pr[pid] != null && str(pr[pid]) !== '' && isFinite(numOr(pr[pid], NaN))) return Math.max(0, cents(pr[pid]));
    var p = ix.byId[pid];
    return p ? cents(p.price) : 0;
  }
  function worthOf(units, reg, regGross, price) {
    if (!(units > 0)) return 0;
    if (!(reg > 0)) return units * price;
    if (units <= reg) return Math.round(regGross * units / reg);
    return regGross + (units - reg) * price;
  }
  function nightSales(ix, night, o) {
    var t = nightTable(ix, night), live = !!(o && o.live);
    var out = { soft: 0, music: 0, units: 0, compUnits: 0, compValue: 0, by: 'none', problems: [], per: {}, sizes: {} };
    var kinds = {};
    t.rows.forEach(function (r) {
      var p = ix.byId[r.pid];
      var price = nightPrice(ix, night, r.pid);
      out.compUnits += r.comps; out.compValue += r.comps * price;
      var units = r.sold, by = r.by;
      if (units === null && live && r.reg) { units = r.reg; by = 'register'; }
      if (units === null) return;
      if (units < 0) {
        out.problems.push(itemName(p, r.size) + ': the count out (' + r.out + ') is more than came in (' + r.total + '). Check the count.');
        units = 0;
      }
      if (!units) { if (by) kinds[by] = true; return; }
      kinds[by] = true;
      var g = worthOf(units, r.reg, t.reg.gross[r.key] || 0, price);
      out[cutGroup(p ? p.kind : 'apparel')] += g;
      out.units += units;
      var e = out.per[r.pid] || (out.per[r.pid] = { units: 0, gross: 0 });
      e.units += units; e.gross += g;
      if (p && kindOf(p.kind) === 'apparel') out.sizes[r.size] = (out.sizes[r.size] || 0) + units;
    });
    var ks = Object.keys(kinds);
    out.by = !ks.length ? 'none' : ks.length > 1 ? 'mixed' : ks[0];
    out.gross = out.soft + out.music;
    return out;
  }
  function notCounted(ix, night) {
    var t = nightTable(ix, night);
    if (!t.rows.some(function (r) { return r.out !== null; })) return [];
    return t.rows.filter(function (r) { return r.by === 'register' && (r.reg || r.uncounted && r.out); }).map(function (r) {
      var why = r.uncounted ? 'never counted in' : r.in !== null || r.adds !== null ? 'not counted out yet' : 'never counted';
      return { pid: r.pid, size: r.size, words: itemName(ix.byId[r.pid], r.size) + ': ' + why + ', so what sold is the register’s (' + r.reg + ' rung up).' };
    });
  }
  function diffs(ix, night) {
    return nightTable(ix, night).rows.filter(function (r) { return r.diff !== null && r.diff !== 0; })
      .sort(function (a, b) { return Math.abs(b.diff) - Math.abs(a.diff); })
      .map(function (r) {
        var p = ix.byId[r.pid], name = itemName(p, r.size);
        var words = r.diff > 0
          ? name + ': ' + r.sold + ' sold by the count, ' + r.reg + ' rung up. ' + plural(r.diff, 'more') + ' left the table than the register shows (not rung up, or a miscount).'
          : name + ': ' + r.sold + ' sold by the count, ' + r.reg + ' rung up. The register shows ' + plural(-r.diff, 'more') + ' than the count (a miscount, or a sale rung twice).';
        return { pid: r.pid, size: r.size, diff: r.diff, words: words };
      });
  }
  function itemName(p, size) { return (p ? p.name : 'An item') + (size && size !== 'One size' ? ' ' + size : ''); }
  function plural(n, w) {
    if (w === 'more') return n + ' more';
    return n + ' ' + w + (n === 1 ? '' : 's');
  }
  function countInStart(ix, night) {
    var day = night ? str(night.show_day) : '';
    var before = ix.nights.filter(function (n) {
      if (!n || (night && n.id === night.id)) return false;
      if (day && n.show_day && n.show_day >= day) return false;
      return nightTable(ix, n).rows.some(function (r) { return r.out !== null; });
    });
    var from = before.length ? before[before.length - 1] : null;
    var values = {};
    if (from) {
      nightTable(ix, from).rows.forEach(function (r) {
        if (r.out === null) return;
        (values[r.pid] = values[r.pid] || {})[r.size] = r.out;
      });
    }
    return { values: values, from: from };
  }
  function msOf(iso) { var t = Date.parse(str(iso)); return isFinite(t) ? t : 0; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayOfMs(ms) { if (!ms) return ''; var d = new Date(ms); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function nightMs(n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(n.show_day)), out = msOf(n.out_at);
    if (m) {
      var end = new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).getTime();
      return out && out < end ? out : end;
    }
    return out || msOf(n.in_at) || msOf(n.created_at);
  }
  function stockOf(ix, pid, size, nightName, o) {
    var until = o && typeof o.until === 'number' ? o.until : null;
    var pidC = ix.canon(pid), s = sizeLabel(size), k = keyOf(pidC, s);
    var events = (ix.moves[k] || []).map(function (m) {
      return { at: msOf(m.at) || msOf(m.created_at), kind: m.kind, qty: clampInt(m.qty, 0, LIMITS.qty) || 0, note: str(m.note), move: m };
    });
    ix.nights.forEach(function (n) {
      var t = nightTable(ix, n);
      var r = t.rows.filter(function (x) { return x.key === k; })[0];
      if (!r) return;
      var sold = t.closed && r.sold !== null ? Math.max(0, r.sold) : 0;
      if (!sold && !r.comps) return;
      events.push({ at: nightMs(n), kind: 'night', sold: sold, comps: r.comps, night: n });
    });
    events.sort(function (a, b) { return a.at - b.at || (a.kind === 'night') - (b.kind === 'night'); });
    if (until !== null) events = events.filter(function (e) { return e.at <= until; });
    var value = 0, over = 0, counted = false, lines = [];
    var name = typeof nightName === 'function' ? nightName : function (n) { return str(n.label) || 'a show'; };
    var takeOff = function (q) { var next = value - q, short = next < 0 ? -next : 0; over += short; value = next < 0 ? 0 : next; return short; };
    var shortWords = function (n) { return n ? ', ' + n + ' more than we thought you had' : ''; };
    events.forEach(function (e) {
      var day = dayOfMs(e.at);
      if (e.kind === 'count') {
        value = e.qty; over = 0; counted = true;
        lines = [{ words: 'Counted ' + e.qty + (day ? ' on ' + dayWords(day) : '') + (e.note ? ': ' + e.note : ''), n: e.qty, total: value, move: e.move }];
      } else if (e.kind === 'add') {
        value += e.qty;
        lines.push({ words: 'Got ' + e.qty + ' more' + (day ? ' on ' + dayWords(day) : '') + (e.note ? ': ' + e.note : ''), n: e.qty, total: value, move: e.move });
      } else if (e.kind === 'remove') {
        var gone = takeOff(e.qty);
        lines.push({ words: 'Took out ' + e.qty + (day ? ' on ' + dayWords(day) : '') + (e.note ? ': ' + e.note : '') + shortWords(gone), n: -e.qty, total: value, move: e.move, short: gone });
      } else {
        var off = e.sold + e.comps, short = takeOff(off);
        var what = e.sold && e.comps ? 'Sold ' + e.sold + ' and gave away ' + e.comps : e.sold ? 'Sold ' + e.sold : 'Gave away ' + e.comps;
        lines.push({ words: what + ' at ' + name(e.night) + shortWords(short), n: -off, total: value, night: e.night, short: short });
      }
    });
    return { have: value, raw: value - over, over: over, counted: counted, tracked: events.length > 0,
      entered: (ix.moves[k] || []).some(function (m) { return m.kind === 'count' || m.kind === 'add'; }), lines: lines };
  }
  function mergeMoves(ix, keepId, goneIds, at) {
    var keep = ix.byId[keepId], ms = msOf(at);
    if (!keep || !ms) return [];
    var parts = [keepId].concat((goneIds || []).filter(function (g) { return g && g !== keepId && ix.byId[g]; }));
    var sizes = cleanSizes(keep.sizes);
    parts.slice(1).forEach(function (g) { sizes = unionSizes(sizes, ix.byId[g].sizes); });
    var out = [];
    sizes.forEach(function (s) {
      var each = parts.map(function (pid) { return { p: ix.byId[pid], st: stockOf(ix, pid, s, null, { until: ms }) }; });
      if (!each.some(function (x) { return x.st.tracked; })) return;
      var have = 0, over = 0;
      each.forEach(function (x) { have += x.st.have; over += x.st.over; });
      var named = each.map(function (x) { return x.p.name + ' (' + x.st.have + ')'; });
      out.push({ product_id: keepId, size: s, kind: 'count', qty: Math.min(LIMITS.qty, have), at: new Date(ms).toISOString(),
        note: ('merged ' + named.slice(0, -1).join(', ') + ' and ' + named[named.length - 1]).slice(0, LIMITS.moveNote) });
      if (over) out.push({ product_id: keepId, size: s, kind: 'remove', qty: Math.min(LIMITS.qty, over), at: new Date(ms + 1).toISOString(),
        note: 'sold before the merge, more than we thought there were' });
    });
    return out;
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dayWords(day, o) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(day));
    if (!m) return str(day);
    var sp = o && o.plain ? ' ' : ' ';
    var w = o && o.weekday ? WEEKDAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] + sp : '';
    return w + MONTHS[+m[2] - 1] + sp + (+m[3]);
  }
  function cartTotals(byId, lines, deal) {
    var d = cleanDeal(deal), sub = 0, items = 0;
    (Array.isArray(lines) ? lines : []).forEach(function (l) {
      var p = byId[l.product_id];
      var q = clampInt(l.qty, 0, LIMITS.saleQty) || 0;
      if (!p || !q) return;
      sub += cents(p.price) * q; items += q;
    });
    var tax = d.tax_method === 'top' ? share(sub, d.tax_rate) : 0;
    return { subtotal: sub, tax: tax, total: sub + tax, items: items };
  }
  function saleFrom(byId, lines, deal, pay, o) {
    var t = cartTotals(byId, lines, deal);
    if (!t.items) return null;
    var items = [];
    (lines || []).forEach(function (l) {
      var p = byId[l.product_id], q = clampInt(l.qty, 0, LIMITS.saleQty) || 0;
      if (!p || !q || items.length >= LIMITS.saleItems) return;
      items.push({ product_id: p.id, size: sizeLabel(l.size), qty: q, price: dollars(cents(p.price)) });
    });
    return { id: o && o.id || '', night_id: o && o.night_id || '', items: items, pay: pay === 'card' ? 'card' : 'cash',
      subtotal: dollars(t.subtotal), tax: dollars(t.tax), total: dollars(t.total), at: o && o.at || '' };
  }
  var DEAL = { seller: 'artist', soft_pct: 0, music_pct: 0, cut_from: 'net', tax_method: 'inclusive', tax_rate: 0, tax_by: 'venue',
    card_pct: 0, card_who: 'shared' };
  function pick(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }
  function pctIn(v, hi) { var n = numOr(v, 0); n = Math.round(n * 1000) / 1000; return n < 0 ? 0 : n > hi ? hi : n; }
  function cleanDeal(d) {
    var x = isObj(d) ? d : {};
    return {
      seller: pick(x.seller, ['artist', 'venue'], DEAL.seller),
      soft_pct: pctIn(x.soft_pct, LIMITS.pct), music_pct: pctIn(x.music_pct, LIMITS.pct),
      cut_from: pick(x.cut_from, ['net', 'gross'], DEAL.cut_from),
      tax_method: pick(x.tax_method, ['inclusive', 'top', 'none'], DEAL.tax_method),
      tax_rate: pctIn(x.tax_rate, LIMITS.taxRate),
      tax_by: pick(x.tax_by, ['venue', 'artist'], DEAL.tax_by),
      card_pct: pctIn(x.card_pct, LIMITS.cardPct),
      card_who: pick(x.card_who, ['shared', 'artist', 'venue'], DEAL.card_who)
    };
  }
  function dealFor(ix, night) {
    if (night && isObj(night.deal) && Object.keys(night.deal).length) return { deal: cleanDeal(night.deal), from: null, own: true };
    var day = night ? str(night.show_day) : '';
    var before = ix.nights.filter(function (n) {
      return n && (!night || n.id !== night.id) && isObj(n.deal) && Object.keys(n.deal).length && (!day || !n.show_day || n.show_day <= day);
    });
    var from = before.length ? before[before.length - 1] : null;
    return { deal: cleanDeal(from ? from.deal : null), from: from, own: false };
  }
  function settle(o) {
    var d = cleanDeal(o && o.deal);
    var S = { soft: Math.max(0, Math.round(numOr(o && o.soft, 0))), music: Math.max(0, Math.round(numOr(o && o.music, 0))) };
    var r = d.tax_rate / 100, lines = [], warnings = [];
    var G = {}, T = {};
    ['soft', 'music'].forEach(function (c) {
      if (d.tax_method === 'top') { T[c] = Math.round(S[c] * r); G[c] = S[c] + T[c]; }
      else if (d.tax_method === 'inclusive') { G[c] = S[c]; T[c] = Math.round(S[c] * r / (1 + r)); }
      else { G[c] = S[c]; T[c] = 0; }
    });
    var gross = G.soft + G.music, tax = T.soft + T.music, atTable = S.soft + S.music;
    var card = o && o.card != null ? Math.max(0, Math.round(numOr(o.card, 0))) : 0;
    if (card > gross) warnings.push('Card sales (' + exact(card) + ') are more than everything sold (' + exact(gross) + '). Check the count or the card total.');
    var fees = share(card, d.card_pct);
    var F = { soft: gross ? Math.round(fees * G.soft / gross) : 0 };
    F.music = fees - F.soft;
    var cut = {}, base = {}, vFee = 0, aFee = 0;
    ['soft', 'music'].forEach(function (c) {
      var p = c === 'soft' ? d.soft_pct : d.music_pct;
      if (d.cut_from === 'gross') {
        base[c] = G[c];
        cut[c] = share(base[c], p);
        if (d.card_who === 'shared') { var v = share(F[c], p); vFee += v; aFee += F[c] - v; }
      } else {
        base[c] = G[c] - T[c] - (d.card_who === 'shared' ? F[c] : 0);
        cut[c] = share(base[c], p);
      }
    });
    if (d.card_who === 'artist') aFee = fees;
    if (d.card_who === 'venue') vFee = fees;
    var cuts = cut.soft + cut.music;
    var venueEarn = cuts - vFee;
    var artistEarn = gross - tax - fees - venueEarn;
    var venueGets = venueEarn + (d.tax_by === 'venue' ? tax : 0);
    var youGet = artistEarn + (d.tax_by === 'artist' ? tax : 0);
    var cash = Math.max(0, gross - card);
    lines.push({ words: 'Sold at table prices', amount: atTable, kind: 'start' });
    if (d.tax_method === 'top') {
      lines.push({ words: 'Sales tax added at the table (' + pct(d.tax_rate) + ')', amount: tax, kind: 'add' });
      lines.push({ words: 'What fans paid', amount: gross, kind: 'sum' });
    } else if (d.tax_method === 'inclusive') {
      lines.push({ words: 'Sales tax already inside those prices (' + pct(d.tax_rate) + ')', amount: tax, kind: 'note' });
    }
    if (card) lines.push({ words: 'Paid by card', amount: card, kind: 'note' });
    if (fees) {
      var fee = 'Card fee: ' + pct(d.card_pct) + ' of card sales';
      lines.push({ words: fee + (d.card_who === 'shared' ? ', split like the cut' : d.card_who === 'artist' ? ', you pay it' : ', the venue pays it'),
        band: d.card_who === 'artist' ? fee + ', the band pays it' : undefined, amount: -fees, kind: 'sub' });
    }
    [['soft', 'Apparel and other', d.soft_pct], ['music', 'Music', d.music_pct]].forEach(function (c) {
      if (!G[c[0]] && !cut[c[0]]) return;
      var from = d.cut_from === 'gross' ? 'of ' + exact(base[c[0]]) + ' (what fans paid)' : 'of ' + exact(base[c[0]]) + ' (after tax' + (d.card_who === 'shared' && fees ? ' and card fees' : '') + ')';
      lines.push({ words: 'Venue cut on ' + c[1].toLowerCase() + ': ' + pct(c[2]) + ' ' + from, amount: cut[c[0]], kind: 'cut' });
    });
    if (vFee && d.card_who !== 'artist') lines.push({ words: d.card_who === 'venue' ? 'Less the card fee the venue pays' : 'Less the venue’s part of the card fee', amount: -vFee, kind: 'sub' });
    lines.push({ words: 'The venue’s part', amount: venueEarn, kind: 'sum' });
    if (tax) lines.push({ words: d.tax_by === 'venue' ? 'Sales tax, to the venue to file' : 'Sales tax, kept by you to file',
      band: d.tax_by === 'venue' ? undefined : 'Sales tax, kept by the band to file', amount: tax, kind: 'note' });
    lines.push({ words: 'Your part (what fans paid, less tax, card fees and the venue’s part)', band: 'The band’s part (what fans paid, less tax, card fees and the venue’s part)',
      amount: artistEarn, kind: 'sum' });
    if (o && o.compUnits) lines.push({ words: 'Given away: ' + plural(o.compUnits, 'item') + ' (worth ' + exact(o.compValue || 0) + ' at table prices). Not money, so no cut.', amount: 0, kind: 'note' });
    var owe;
    if (d.seller === 'artist') owe = venueGets >= 0 ? { from: 'you', to: 'venue', amount: venueGets } : { from: 'venue', to: 'you', amount: -venueGets };
    else owe = youGet >= 0 ? { from: 'venue', to: 'you', amount: youGet } : { from: 'you', to: 'venue', amount: -youGet };
    var heads = clampInt(o && o.heads, 0, LIMITS.headCount);
    if (d.cut_from === 'gross' && (d.soft_pct || d.music_pct)) {
      var fair = settle(Object.assign({}, o, { deal: Object.assign({}, d, { cut_from: 'net' }) }));
      var more = venueGets - fair.venueGets;
      if (more > 0) warnings.push('Taking the cut from the gross costs you ' + exact(more) + ' more than taking it after tax' + (d.card_who === 'shared' ? ' and card fees' : '') + '. Check the contract says gross.');
    }
    return { lines: lines, atTable: atTable, gross: gross, tax: tax, fees: fees, card: card, cash: cash, venueEarn: venueEarn, artistEarn: artistEarn,
      venueGets: venueGets, youGet: youGet, taxBy: d.tax_by, deal: d, owe: owe,
      perHead: heads ? Math.round(atTable / heads) : null, heads: heads || null, warnings: warnings };
  }
  function settleNight(ix, night, o) {
    var s = nightSales(ix, night, { live: true }), t = nightTable(ix, night), df = dealFor(ix, night);
    var card = night && night.card_sales != null && str(night.card_sales) !== '' ? cents(night.card_sales) : t.reg.card;
    var heads = night && night.head_count != null ? night.head_count : (o && o.heads != null ? o.heads : null);
    var st = settle({ soft: s.soft, music: s.music, card: card, deal: df.deal, heads: heads, compUnits: s.compUnits, compValue: s.compValue });
    st.sales = s; st.dealFrom = df; st.cardFrom = night && night.card_sales != null && str(night.card_sales) !== '' ? 'typed' : 'register';
    st.problems = s.problems;
    return st;
  }
  function settleWords(st, o) {
    return 'The venue gets ' + exact(st.venueGets) + '. ' + (o && o.band ? 'The band gets ' : 'You get ') + exact(st.youGet) + '.';
  }
  function oweWords(st, o) {
    if (!st.owe.amount) return 'Nobody owes anybody.';
    var band = !!(o && o.band);
    return st.owe.from === 'you' ? (band ? 'The band pays the venue ' : 'You pay the venue ') + exact(st.owe.amount) + '.'
      : (band ? 'The venue pays the band ' : 'The venue pays you ') + exact(st.owe.amount) + '.';
  }
  function shareText(st, place, day, o) {
    var out = ['MERCHROOM settlement'];
    if (o && str(o.artist).trim()) out.push(str(o.artist).trim());
    out.push([place, day ? dayWords(day, { weekday: true, plain: true }) : ''].filter(Boolean).join(' · '), '');
    out.push(settleWords(st, { band: true }));
    out.push(oweWords(st, { band: true }));
    out.push('');
    out.push('How it adds up:');
    st.lines.forEach(function (l) {
      out.push('- ' + (l.band || l.words) + (l.kind === 'note' && !l.amount ? '' : ': ' + exact(l.amount)));
    });
    if (st.perHead !== null && st.perHead !== undefined) out.push('- Per head: ' + exact(st.perHead) + ' (' + st.heads + ' people)');
    var d = st.deal;
    out.push('');
    out.push('The deal: ' + (d.seller === 'artist' ? 'the band sells' : 'the venue sells') + '; venue cut ' + pct(d.soft_pct) + ' apparel and other, ' + pct(d.music_pct) + ' music, from the ' + (d.cut_from === 'gross' ? 'gross' : 'net') +
      '; sales tax ' + (d.tax_method === 'none' ? 'none' : pct(d.tax_rate) + (d.tax_method === 'top' ? ' on top' : ' in the price') + ', filed by ' + (d.tax_by === 'venue' ? 'the venue' : 'the band')) +
      '; card fee ' + pct(d.card_pct) + (d.card_who === 'shared' ? ' split like the cut' : d.card_who === 'artist' ? ' paid by the band' : ' paid by the venue') + '.');
    if (o && o.settledAt) out.push('Settled ' + o.settledAt + '.');
    return out.join('\n');
  }
  function results(ix, nights, heads, o) {
    var out = { gross: 0, units: 0, compUnits: 0, nights: [], per: {}, sizes: {}, headGross: 0, heads: 0 };
    (nights || []).forEach(function (n) {
      var s = nightSales(ix, n, o);
      var hc = typeof heads === 'function' ? heads(n) : (n.head_count != null ? n.head_count : null);
      var row = { night: n, gross: s.gross, units: s.units, compUnits: s.compUnits, heads: hc, perHead: hc ? Math.round(s.gross / hc) : null, by: s.by, per: s.per };
      out.nights.push(row);
      out.gross += s.gross; out.units += s.units; out.compUnits += s.compUnits;
      if (hc) { out.headGross += s.gross; out.heads += hc; }
      Object.keys(s.per).forEach(function (pid) {
        var e = out.per[pid] || (out.per[pid] = { units: 0, gross: 0 });
        e.units += s.per[pid].units; e.gross += s.per[pid].gross;
      });
      Object.keys(s.sizes).forEach(function (z) { out.sizes[z] = (out.sizes[z] || 0) + s.sizes[z]; });
    });
    out.perHead = out.heads ? Math.round(out.headGross / out.heads) : null;
    out.top = Object.keys(out.per).map(function (pid) {
      var p = ix.byId[pid];
      return { pid: pid, name: p ? p.name : 'An item', units: out.per[pid].units, gross: out.per[pid].gross };
    }).sort(function (a, b) { return b.gross - a.gross || b.units - a.units || a.name.localeCompare(b.name); });
    var sizeTotal = 0;
    Object.keys(out.sizes).forEach(function (z) { sizeTotal += out.sizes[z]; });
    out.curve = Object.keys(out.sizes).sort(function (a, b) { return sizeRank(a) - sizeRank(b) || a.localeCompare(b); })
      .map(function (z) { return { size: z, units: out.sizes[z], pct: sizeTotal ? Math.round(out.sizes[z] * 1000 / sizeTotal) / 10 : 0 }; });
    return out;
  }
  function reorderHints(ix, showsLeft, nightName) {
    var out = [], limit = typeof showsLeft === 'number' && showsLeft >= 0 ? showsLeft : 5;
    var closedNights = ix.nights.filter(function (n) { return closed(n, ix.today); });
    liveProducts(ix.products).forEach(function (p) {
      cleanSizes(p.sizes).forEach(function (s) {
        var st = stockOf(ix, p.id, s, nightName);
        if (!st.entered) return;
        var sold = [];
        closedNights.forEach(function (n) {
          var r = nightTable(ix, n).rows.filter(function (x) { return x.pid === p.id && x.size === s; })[0];
          if (!r || r.sold === null) return;
          if (!((r.in || 0) + (r.adds || 0) > 0 || r.sold > 0)) return;
          sold.push(Math.max(0, r.sold));
        });
        sold = sold.slice(-5);
        if (!sold.length) return;
        var pace = sold.reduce(function (a, b) { return a + b; }, 0) / sold.length;
        if (!(pace > 0)) return;
        var shows = Math.floor(st.have / pace);
        if (shows >= limit && st.have > 0) return;
        var name = itemName(p, s);
        var words = st.have <= 0 ? name + ' is out' + (st.over ? ' (count needed: sold more than we thought you had)' : '') + '.'
          : shows === 0 ? 'At this pace ' + name + ' runs out at the next show.'
          : 'At this pace ' + name + ' runs out in about ' + plural(shows, 'show') + '.';
        out.push({ pid: p.id, size: s, have: st.have, pace: Math.round(pace * 10) / 10, shows: st.have <= 0 ? 0 : shows, words: words,
          why: 'Sold about ' + (Math.round(pace * 10) / 10) + ' a show over the last ' + plural(sold.length, 'show') + '; ' + st.have + ' left.' });
      });
    });
    return out.sort(function (a, b) { return a.shows - b.shows || a.have - b.have || a.words.localeCompare(b.words); });
  }
  function cleanCounts(c) {
    var out = {};
    if (!isObj(c)) return out;
    Object.keys(c).forEach(function (pid) {
      if (!isObj(c[pid])) return;
      Object.keys(c[pid]).forEach(function (s) {
        var v = c[pid][s];
        if (!isObj(v)) return;
        var size = sizeLabel(s);
        if (!size) return;
        var row = {};
        ['in', 'adds', 'out'].forEach(function (f) { var n = cleanCount(v[f]); if (n !== null) row[f] = n; });
        if (Object.keys(row).length) (out[pid] = out[pid] || {})[size] = row;
      });
    });
    return out;
  }
  function cleanComp(c) {
    if (!isObj(c) || !c.product_id) return null;
    var q = clampInt(c.qty, 0, LIMITS.compQty);
    if (!q) return null;
    return { id: str(c.id).slice(0, 40) || ('c' + Math.random().toString(36).slice(2, 10)), product_id: str(c.product_id), size: sizeLabel(c.size) || 'One size', qty: q,
      who: str(c.who).replace(/\s+/g, ' ').trim().slice(0, LIMITS.who), why: str(c.why).replace(/\s+/g, ' ').trim().slice(0, LIMITS.why) };
  }
  function cleanMove(m) {
    if (!isObj(m) || !m.product_id) return null;
    var kind = pick(m.kind, ['count', 'add', 'remove'], '');
    var q = clampInt(m.qty, 0, LIMITS.qty);
    if (!kind || q === null || (kind !== 'count' && q < 1)) return null;
    return { id: str(m.id), product_id: str(m.product_id), size: sizeLabel(m.size) || 'One size', kind: kind, qty: q,
      note: str(m.note).replace(/\s+/g, ' ').trim().slice(0, LIMITS.moveNote), at: str(m.at) };
  }
  function cleanPrices(p) {
    var out = {}, n = 0;
    if (!isObj(p)) return out;
    Object.keys(p).forEach(function (pid) {
      var v = numOr(p[pid], NaN);
      if (!pid || pid.length > 40 || !isFinite(v) || v < 0 || v > LIMITS.price || n >= LIMITS.products) return;
      out[pid] = dollars(cents(v)); n += 1;
    });
    return out;
  }
  function pricesNow(products) {
    var out = {};
    liveProducts(products).slice(0, LIMITS.products).forEach(function (p) { if (p.id) out[p.id] = dollars(cents(p.price)); });
    return out;
  }
  function stripSample(data) {
    var d = isObj(data) ? data : {}, gone = {}, n = { products: 0, nights: 0, sales: 0 };
    var P = isObj(d.products) ? d.products : {}, MV = isObj(d.moves) ? d.moves : {}, NT = isObj(d.nights) ? d.nights : {}, SL = isObj(d.sales) ? d.sales : {};
    Object.keys(P).forEach(function (id) { if (isObj(P[id]) && P[id].sample) { gone[id] = true; delete P[id]; n.products += 1; } });
    Object.keys(MV).forEach(function (id) { var m = MV[id]; if (!isObj(m) || m.sample || gone[m.product_id]) delete MV[id]; });
    if (!n.products) return n;
    var touched = {}, salesLeft = {};
    Object.keys(SL).forEach(function (id) {
      var s = SL[id];
      if (!isObj(s)) { delete SL[id]; return; }
      var items = Array.isArray(s.items) ? s.items : [], keep = items.filter(function (it) { return isObj(it) && !gone[it.product_id]; });
      if (keep.length === items.length) { salesLeft[s.night_id] = true; return; }
      touched[s.night_id] = true;
      if (!keep.length) { delete SL[id]; n.sales += 1; return; }
      var was = cents(s.subtotal), sub = keep.reduce(function (a, it) { return a + cents(it.price) * (clampInt(it.qty, 0, LIMITS.saleQty) || 0); }, 0);
      var tax = was > 0 ? Math.round(cents(s.tax) * sub / was) : 0;
      SL[id] = Object.assign({}, s, { items: keep, subtotal: dollars(sub), tax: dollars(tax), total: dollars(sub + tax) });
      salesLeft[s.night_id] = true;
    });
    Object.keys(NT).forEach(function (id) {
      var x = NT[id];
      if (!isObj(x)) return;
      var counts = isObj(x.counts) ? x.counts : {}, comps = Array.isArray(x.comps) ? x.comps : [], prices = isObj(x.prices) ? x.prices : {};
      var had = touched[id] || Object.keys(counts).some(function (pid) { return gone[pid]; }) || comps.some(function (c) { return isObj(c) && gone[c.product_id]; });
      Object.keys(counts).forEach(function (pid) { if (gone[pid]) delete counts[pid]; });
      Object.keys(prices).forEach(function (pid) { if (gone[pid]) delete prices[pid]; });
      x.comps = comps.filter(function (c) { return isObj(c) && !gone[c.product_id]; });
      if (!had) return;
      if (!Object.keys(counts).length && !x.comps.length && !salesLeft[id] && !x._s) { delete NT[id]; n.nights += 1; return; }
      if (x.settled_at) { x.settled_at = null; x.settlement = null; }
    });
    return n;
  }
  function sampleMerch(id, at) {
    var stamp = at || new Date().toISOString();
    var P = [
      ['Logo Tee', 'apparel', ['S', 'M', 'L', 'XL', '2XL', '3XL'], 30, 8, [12, 24, 30, 24, 12, 6]],
      ['Tour Tee', 'apparel', ['S', 'M', 'L', 'XL', '2XL', '3XL'], 35, 9, [10, 20, 24, 20, 10, 4]],
      ['Pullover Hoodie', 'apparel', ['S', 'M', 'L', 'XL', '2XL'], 60, 22, [6, 12, 14, 12, 6]],
      ['Dad Hat', 'other', ['One size'], 25, 7, [40]],
      ['Tour Poster', 'other', ['One size'], 20, 3, [50]],
      ['tour poster', 'other', ['One size'], 20, 3, [10]],
      ['Sticker Pack', 'other', ['One size'], 5, 1, [100]],
      ['Vinyl LP', 'music', ['One size'], 30, 12, [25]],
      ['CD', 'music', ['One size'], 15, 3, [40]]];
    var products = [], moves = [];
    P.forEach(function (x, i) {
      var pid = id();
      products.push({ id: pid, name: x[0], kind: x[1], sizes: x[2], price: x[3], cost: x[4], barcode: '', archived: false, merged_into: null,
        sort_order: i, note: '', sample: true, created_at: stamp, updated_at: stamp });
      x[2].forEach(function (s, j) {
        moves.push({ id: id(), product_id: pid, size: s, kind: 'count', qty: x[5][j], note: '', at: stamp, sample: true, created_at: stamp, updated_at: stamp });
      });
    });
    return { products: products, moves: moves };
  }
  root.GMERCH = {
    LIMITS: LIMITS, KINDS: KINDS, KIND_WORDS: KIND_WORDS, SIZE_ORDER: SIZE_ORDER, SIZE_SETS: SIZE_SETS, DEAL: DEAL,
    cents: cents, dollars: dollars, money: money, exact: exact, pct: pct, share: share,
    sizeLabel: sizeLabel, cleanSizes: cleanSizes, unionSizes: unionSizes, addSize: addSize, sizeWords: sizeWords,
    kindOf: kindOf, cutGroup: cutGroup, cleanProduct: cleanProduct, byIdOf: byIdOf, canonOf: canonOf, liveProducts: liveProducts,
    nameKey: nameKey, oneApart: oneApart, lookAlikes: lookAlikes, mergePlan: mergePlan,
    keyOf: keyOf, index: index, nightOf: nightOf, closed: closed, registerOf: registerOf, nightTable: nightTable, rowsOf: rowsOf,
    nightPrice: nightPrice, nightSales: nightSales, diffs: diffs, notCounted: notCounted, countInStart: countInStart,
    stockOf: stockOf, mergeMoves: mergeMoves, dayWords: dayWords,
    cartTotals: cartTotals, saleFrom: saleFrom,
    cleanDeal: cleanDeal, dealFor: dealFor, settle: settle, settleNight: settleNight, settleWords: settleWords, oweWords: oweWords, shareText: shareText,
    results: results, reorderHints: reorderHints,
    cleanCounts: cleanCounts, cleanComp: cleanComp, cleanMove: cleanMove, cleanPrices: cleanPrices, pricesNow: pricesNow,
    sampleMerch: sampleMerch, stripSample: stripSample, itemName: itemName
  };
})(typeof window !== 'undefined' ? window : globalThis);
