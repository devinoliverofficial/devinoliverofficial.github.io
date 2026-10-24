(function () {
  'use strict';
  var cfg = window.GREENROOM_CONFIG || {};
  var ready = { db: null, user: null, sample: null };
  var resolvers = {};
  ['db', 'user', 'sample'].forEach(function (k) {
    ready[k] = new Promise(function (res) { resolvers[k] = res; });
  });
  window.claude = {
    use: function (name) { return ready[name] || Promise.resolve(null); }
  };
  if (!cfg.url || !cfg.anonKey) {
    resolvers.db(null); resolvers.user(null); resolvers.sample(null);
    return;
  }
  var sb = null;
  var sbMod = null;
  var resetting = false;
  var session = null;
  var cache = { tours: new Map(), labels: new Map(), guests: [], notes: [], polls: [], votes: [], requests: [],
    asks: [], checkins: [], reimb: [] };
  var flowerCache = {}, flowerAsk = {}, flowerGen = {}, myFlowerCache = null, myFlowerAsk = null, myFlowerGen = 0, flowerTimer = 0;
  var faceCache = {}, faceAsk = {};
  var undo0188 = null, undoProbe = null, undoProbeFailed = 0, depositsLoggedCache = null;
  var busCache = {}, busAsk = {}, busGen = {}, busKnown = null, busProbing = false;
  var buyoutCache = {}, buyoutAsk = {}, buyoutGen = {}, buyoutKnown = null, buyoutProbing = false;
  var boAskCache = {}, boAskAsk = {}, boAskGen = {}, boAskKnown = null, boAskProbing = false;
  var boSelfKnown = null, boSelfProbing = false;
  var todoCache = {}, todoAsk = {}, todoGen = {}, todoKnown = null, todoProbing = false;
  var myTodoCache = null, myTodoAsk = null, myTodoGen = 0;
  var TODO_COLS = 'id, artist_id, cat, body, assigned_to, due, done_at, created_by, created_at';
  var mySpotCache = null, mySpotAsk = null, mySpotGen = 0;
  var tourSpotCache = {}, tourSpotAsk = {}, tourSpotGen = {}, spotKnown = null, spotProbing = false;
  var SPOT_COLS = 'id, tour_id, city, city_key, name, kind, note, created_at';
  var SPOT_KINDS = ['food', 'coffee', 'bar', 'club', 'to do', 'other'];
  var spotGeo = null, SPOT_GEO_COLS = ', lat, lon, address, osm_ref';
  var sdKnown = null, sdProbing = false, sdCache = Object.create(null);
  var SD_FRESH = 600e3;
  var showRateCache = {}, showRateAsk = {}, showRateGen = {}, rateKnown = null, rateProbing = false;
  var reviewKnown = null, reviewProbing = false;
  var sizeKnown = null, sizeProbing = false, sizeAt = 0;
  var flyerCache = {}, flyerAsk = {}, flyerGen = {}, flyerKnown = null, flyerProbing = false;
  var FLYER_FRESH = 300e3;
  var ownFlyers = { ids: null, at: 0, asking: false };
  var supplyCache = {}, supplyAsk = {}, supplyGen = {}, supplyKnown = null, supplyProbing = false;
  var favCache = {}, favAsk = {}, favGen = {}, favKnown = null, favProbing = false;
  var modKnown = null, modProbing = false, modBlocks = [], modEnded = false, modUser = '';
  var topFanCache = {}, topFanAsk = {}, topFanGen = {};
  var cityEvKnown = null, cityEvProbing = false;
  var vhCache = {}, vhAsk = {}, vhKnown = null, vhProbing = false;
  var srKnown = null, srProbing = false;
  var ssKnown = null;
  var ctKnown = null;
  var VH_FRESH = 600e3, VH_RETRY = 60e3;
  var fsCache = Object.create(null), fsAsk = Object.create(null), fsKnown = null, fsProbing = false;
  var FS_FRESH = 600e3, FS_RETRY = 60e3;
  var pcCache = {}, pcAsk = {}, pcKnown = null, pcProbing = null, pcFailAt = 0;
  var PC_FRESH = 600e3, PC_RETRY = 60e3, PC_MAX = 200;
  var placeKnown = null, placeProbing = false, placeCache = Object.create(null), placeGen = 0, placeTimer = 0;
  var FLOWERS_FRESH = 60e3;
  var listeners = { tours: [], labels: [] };
  var refetchTimer = 0;
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function localDay() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function busDay() {
    var G = window.GR;
    if (G && typeof G.tourToday === 'function') return G.tourToday();
    var d = new Date(Date.now() - 5 * 3600e3);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function deepMerge(target, patch) {
    Object.keys(patch).forEach(function (k) {
      var v = patch[k];
      if (isObj(v) && isObj(target[k])) target[k] = deepMerge(target[k], v);
      else target[k] = isObj(v) ? clone(v) : v;
    });
    return target;
  }
  function err(code) { var e = new Error(code); e.code = code; return e; }
  function snapshotOf(map) {
    var docs = [];
    map.forEach(function (doc, id) {
      docs.push({ id: id, exists: true, data: function () { return clone(doc); } });
    });
    return { docs: docs };
  }
  function emit(table) {
    listeners[table].forEach(function (fn) {
      try { fn(snapshotOf(cache[table])); } catch (e) {   }
    });
  }
  var wroteAt = {}, tick = 0;
  async function refetch() {
    var asked = ++tick;
    var tours = await sb.from('tours').select('id, owner_id, doc');
    if (tours.error) throw tours.error;
    var ga = await sb.from('tour_public').select('id, owner_id, doc');
    var full = {};
    tours.data.forEach(function (r) { full[r.id] = true; });
    var rows = tours.data.concat(ga.error ? [] : ga.data.filter(function (r) { return !full[r.id]; }));
    var before = cache.tours, stale = false;
    if (ga.error && before) before.forEach(function (doc, id) { if (!full[id]) rows.push({ id: id, owner_id: doc._ownerId, doc: doc, kept: true }); });
    cache.tours = new Map(rows.map(function (r) {
      if (r.kept) return [r.id, r.doc];
      if (wroteAt[r.id] && wroteAt[r.id] >= asked && before && before.has(r.id)) { stale = true; return [r.id, before.get(r.id)]; }
      var doc = isObj(r.doc) ? r.doc : {};
      doc._ownerId = r.owner_id;
      return [r.id, doc];
    }));
    if (stale) scheduleRefetch();
    var labels = await sb.from('labels').select('id, doc');
    if (labels.error) throw labels.error;
    cache.labels = new Map(labels.data.map(function (r) { return [r.id, r.doc]; }));
    var guests = await sb.from('guests').select('*');
    cache.guests = guests.error ? cache.guests : guests.data;
    var notes = await sb.from('notes').select('*').order('created_at');
    cache.notes = notes.error ? cache.notes : notes.data;
    var cal = await Promise.all([
      sb.from('day_polls').select('*'),
      sb.from('day_votes').select('*'),
      sb.from('day_requests').select('*').order('created_at')
    ]);
    if (!cal[0].error) cache.polls = cal[0].data;
    if (!cal[1].error) cache.votes = cal[1].data;
    if (!cal[2].error) cache.requests = cal[2].data;
    if (session) {
      var ci = await sb.from('crew_stats').select('tour_id, day').eq('stat', 'checkin').eq('added_by', session.user.id);
      if (!ci.error) cache.checkins = ci.data;
    }
    var asks = await sb.from('ari_asks').select('*').order('created_at');
    if (!asks.error) cache.asks = asks.data;
    await loadReimbursements();
    emit('tours'); emit('labels');
    legalFlush();
  }
  var reimbReadOnce = false;
  async function loadReimbursements() {
    try {
      var rb = await sb.from('reimbursements')
        .select('id, tour_id, user_id, requester_name, amount, what, spent_on, status, paid_at, paid_by, paid_by_name, paid_how, feed_id, closed_by_name, closed_at, created_at')
        .order('created_at', { ascending: false }).limit(1000);
      if (!rb.error && Array.isArray(rb.data)) { cache.reimb = rb.data; reimbReadOnce = true; return true; }
    } catch (e) {   }
    return false;
  }
  var refetchOwed = false, refetchTries = 0, liveOnce = false;
  function scheduleRefetch(wait) {
    clearTimeout(refetchTimer);
    refetchOwed = true;
    refetchTimer = setTimeout(function () {
      refetch().then(function () { refetchOwed = false; refetchTries = 0; }, function () {
        if (!session || document.visibilityState === 'hidden' || refetchTries >= 5) return;
        refetchTries += 1;
        scheduleRefetch(Math.min(30000, 3000 * Math.pow(2, refetchTries - 1)));
      });
    }, typeof wait === 'number' ? wait : 250);
  }
  var db = {
    collection: function (name) {
      return {
        onSnapshot: function (cb, onError) {
          listeners[name].push(cb);
          Promise.resolve().then(function () { cb(snapshotOf(cache[name])); });
          return function () {
            var i = listeners[name].indexOf(cb);
            if (i >= 0) listeners[name].splice(i, 1);
          };
        }
      };
    },
    doc: function (path) {
      var parts = path.split('/');
      var table = parts[0], id = parts[1];
      function stripped(doc) {
        var d = clone(doc);
        delete d._ownerId;
        return d;
      }
      return {
        set: async function (doc) {
          var row = { id: id, doc: stripped(doc), updated_at: new Date().toISOString() };
          var q = table === 'tours'
            ? await sb.from('tours').insert({ id: id, doc: row.doc })
            : await sb.from('labels').upsert(Object.assign({ owner_id: session.user.id }, row), { onConflict: 'owner_id,id' });
          if (q.error) throw mapError(q.error);
          var local = clone(doc);
          if (table === 'tours') local._ownerId = session.user.id;
          cache[table].set(id, local);
          emit(table);
        },
        update: async function (patch) {
          var cur = cache[table].get(id);
          if (!cur) throw err('invalid_argument');
          var next = deepMerge(clone(cur), clone(patch));
          if (table === 'tours') {
            var pq = await sb.rpc('patch_tour', { t_id: id, patch: stripped(patch) });
            if (pq.error && !patchMissing(pq.error)) throw mapError(pq.error);
            if (!pq.error) {
              if (isObj(pq.data)) { next = pq.data; next._ownerId = cur._ownerId; }
              wroteAt[id] = ++tick;
              cache.tours.set(id, next);
              emit('tours');
              return;
            }
          }
          var uq = sb.from(table)
            .update({ doc: stripped(next), updated_at: new Date().toISOString() })
            .eq('id', id);
          if (table === 'labels') uq = uq.eq('owner_id', session.user.id);
          var q = await uq.select('id');
          if (q.error) throw mapError(q.error);
          if (!q.data || !q.data.length) throw err('permission');
          if (table === 'tours') wroteAt[id] = ++tick;
          cache[table].set(id, next);
          emit(table);
        },
        delete: async function () {
          var dq = sb.from(table).delete().eq('id', id);
          if (table === 'labels') dq = dq.eq('owner_id', session.user.id);
          var q = await dq.select('id');
          if (q.error) throw mapError(q.error);
          if (!q.data || !q.data.length) throw err('permission');
          cache[table].delete(id);
          emit(table);
        }
      };
    }
  };
  function newBuildCheck() {
    var mine = window.GREENROOM_BUILD;
    if (!mine || typeof fetch !== 'function') return;
    fetch('sw.js', { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (txt) {
      var m = /greenroom-(\d{8}-\d{6})/.exec(txt || '');
      if (!m || m[1] === mine || m[1] < mine) return;
      var a = document.activeElement;
      var typing = !!(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable));
      if (typing || document.querySelector('#sheet-root .sheet') || document.visibilityState === 'hidden') return;
      if (document.getElementById('gr-splash')) return;
      window.location.reload();
    }).catch(function () {   });
  }
  function patchMissing(e) {
    return !!e && (e.code === 'PGRST202' || e.code === '42883' ||
      /could not find the function|function .*patch_tour.* does not exist/i.test(String(e.message || '')));
  }
  function mapError(e) {
    var msg = String(e && e.message || '');
    if (/access_ended/.test(msg)) return err('ended');
    if (/cant_send/.test(msg)) return err('cant-send');
    if (/^filtered$/.test(msg)) return err('filtered');
    if (e && e.code === '23505' && /show_ratings/.test(msg)) return err('already-rated');
    if (/my_pay_books_doc_small/.test(msg)) return err('full');
    if (/permission|policy|denied|42501/i.test(msg)) return err('permission');
    if (/network|fetch|load failed|connection/i.test(msg)) return err('offline');
    return err('unavailable');
  }
  function fnMissing(e) {
    return !!e && (e.code === 'PGRST202' || e.code === '42883' ||
      /could not find the function|function .* does not exist/i.test(String(e.message || '')));
  }
  function tableMissing(e) {
    return !!e && (e.code === 'PGRST205' || e.code === '42P01' ||
      /could not find the table|relation .* does not exist/i.test(String(e.message || '')));
  }
  function columnMissing(e) {
    return !!e && (e.code === 'PGRST204' || e.code === '42703' ||
      /could not find the .* column|column .* does not exist/i.test(String(e.message || '')));
  }
  async function reimburseCall(fn, args) {
    if (!sb || !session || !session.user) return { ok: false, why: 'unavailable' };
    var q = null;
    try { q = await sb.rpc(fn, args); } catch (e) { q = null; }
    if (!q || q.error || !isObj(q.data)) {
      loadReimbursements().then(function (read) { if (read) emit('tours'); else scheduleRefetch(); });
      return { ok: false, why: 'unavailable' };
    }
    if (await loadReimbursements()) emit('tours'); else scheduleRefetch();
    if (q.data.ok === true) return { ok: true };
    return { ok: false, why: String(q.data.why || 'unavailable') };
  }
  function knownError(e) {
    if (/too many/i.test(String(e && e.message || ''))) return err('too-many');
    return mapError(e);
  }
  function httpsLink(kind, v) {
    var t = String(v || '').trim();
    if (/^https:\/\//i.test(t)) return t;
    if (/^http:\/\//i.test(t)) return 'https://' + t.slice(7);
    if (kind === 'instagram' && /^@?[A-Za-z0-9._]{1,30}$/.test(t)) return 'https://www.instagram.com/' + t.replace(/^@/, '');
    if (/^[^\s\/@]+\.[^\s]+$/.test(t)) return 'https://' + t;
    return t;
  }
  var KINDS = ['member', 'crew', 'fan', 'promoter'];
  function cleanKinds(list) {
    var got = Array.isArray(list) ? list.map(function (k) { return String(k || '').toLowerCase(); }) : [];
    return KINDS.filter(function (k) { return got.indexOf(k) >= 0; });
  }
  function realDay(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
    if (!m) return false;
    var t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return t.getFullYear() === Number(m[1]) && t.getMonth() === Number(m[2]) - 1 && t.getDate() === Number(m[3]);
  }
  function yearsOld(y, m, d) {
    var now = new Date();
    var n = now.getUTCFullYear() - y;
    if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) n -= 1;
    return n;
  }
  function localHost() {
    var h = String(location.hostname || '').toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || /\.localhost$/.test(h) || /\.test$/.test(h);
  }
  var SUGGEST_KEY = 'gr-signup-kinds';
  function suggestSave(email, kinds) {
    var k = cleanKinds(kinds);
    try {
      if (k.length) localStorage.setItem(SUGGEST_KEY, JSON.stringify({ email: String(email || '').toLowerCase(), kinds: k }));
      else localStorage.removeItem(SUGGEST_KEY);
    } catch (e) {   }
  }
  function suggestClear() {
    try { localStorage.removeItem(SUGGEST_KEY); } catch (e) {   }
  }
  function suggestRead() {
    try {
      var s = JSON.parse(localStorage.getItem(SUGGEST_KEY) || 'null');
      var me = session && session.user ? String(session.user.email || '').toLowerCase() : '';
      if (isObj(s) && me && String(s.email || '').toLowerCase() === me) return cleanKinds(s.kinds);
    } catch (e) {   }
    return [];
  }
  var lastNetFail = 0;
  function sturdyFetch(input, init) {
    var tries = 0;
    function go() {
      return fetch(input, init).catch(function (e) {
        if (init && init.signal && init.signal.aborted) throw e;
        tries += 1;
        if (init) init.__retried = true;
        if (tries > 2) { lastNetFail = Date.now(); throw e; }
        return new Promise(function (res) { setTimeout(res, tries === 1 ? 500 : 1500); }).then(go);
      });
    }
    return go();
  }
  var ERR_KEY = 'gr-save-errors';
  function noteError(place, e) {
    var row = { place: String(place || '').slice(0, 60),
      code: String((e && (e.code || e.status || e.error)) || '').slice(0, 60),
      detail: String((e && e.message) || (typeof e === 'string' ? e : '') || '').slice(0, 200),
      offline: navigator.onLine === false || Date.now() - lastNetFail < 8000,
      ua: String(navigator.userAgent || '').slice(0, 160), at: new Date().toISOString() };
    var q = [];
    try { q = JSON.parse(localStorage.getItem(ERR_KEY) || '[]'); } catch (x) { q = []; }
    q.push(row);
    try { localStorage.setItem(ERR_KEY, JSON.stringify(q.slice(-30))); } catch (x) {   }
    flushErrors();
  }
  var flushing = false;
  async function flushErrors() {
    if (flushing || !sb || !session) return;
    var q = [];
    try { q = JSON.parse(localStorage.getItem(ERR_KEY) || '[]'); } catch (x) { q = []; }
    if (!q.length) return;
    flushing = true;
    try {
      var r = await sb.from('app_errors').insert(q);
      if (!r.error) { try { localStorage.removeItem(ERR_KEY); } catch (x) {   } }
    } catch (x) {   }
    flushing = false;
  }
  function newRowId() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {   }
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  function newUuid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {   }
    var b = new Uint8Array(16), i;
    try { crypto.getRandomValues(b); } catch (e) { for (i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256); }
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var x = Array.prototype.map.call(b, function (v) { return (v + 256).toString(16).slice(1); }).join('');
    return x.slice(0, 8) + '-' + x.slice(8, 12) + '-' + x.slice(12, 16) + '-' + x.slice(16, 20) + '-' + x.slice(20);
  }
  function fileToB64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(err('image_rejected')); };
      r.readAsDataURL(blob);
    });
  }
  async function freshToken(force) {
    try {
      var got = force ? await sb.auth.refreshSession() : await sb.auth.getSession();
      if (got && got.data && got.data.session) session = got.data.session;
    } catch (e) {   }
    return session ? session.access_token : cfg.anonKey;
  }
  async function callFn(name, init) {
    var res = null;
    for (var attempt = 0; attempt < 2; attempt++) {
      var headers = { 'Content-Type': 'application/json', apikey: cfg.anonKey,
        Authorization: 'Bearer ' + await freshToken(attempt > 0) };
      var go = Object.assign({}, init, { headers: headers });
      res = await sturdyFetch(cfg.url + '/functions/v1/' + name, go);
      if (go.__retried) res.__retried = true;
      if (res.status !== 401) break;
    }
    return res;
  }
  async function callRead(prompt, opts) {
    var o = opts || {};
    if (window.GR_AI_CONSENT && !(await window.GR_AI_CONSENT())) throw err('cancelled');
    var images = [];
    var list = o.images ? (Array.isArray(o.images) ? o.images : [o.images]) : [];
    for (var i = 0; i < list.length; i++) {
      images.push({
        media_type: list[i].type || 'image/jpeg',
        data: await fileToB64(list[i])
      });
    }
    var res;
    try {
      res = await callFn('read', {
        method: 'POST',
        signal: o.signal,
        body: JSON.stringify({
          prompt: prompt,
          images: images,
          tier: o.modelTier === 'quick' ? 'quick' : undefined,
          search: o.search ? true : undefined,
          ari: o.ariTour ? { tourId: o.ariTour } : undefined
        })
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw err('cancelled');
      throw err('unavailable');
    }
    if (res.status === 401 || res.status === 403) throw err('session_expired');
    if (res.status === 429) throw err('rate_limited');
    if (!res.ok) throw err('unavailable');
    var out = await res.json();
    if (out.error) throw err(out.error);
    return { text: String(out.text || ''), truncated: false };
  }
  var sample = function (prompt, opts) { return callRead(prompt, opts); };
  sample.json = async function (prompt, opts) {
    var r = await callRead(prompt, opts);
    var t = r.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    var a = t.indexOf('['), b = t.lastIndexOf(']');
    var o1 = t.indexOf('{'), o2 = t.lastIndexOf('}');
    try {
      if (a >= 0 && b > a && (o1 < 0 || a < o1)) return JSON.parse(t.slice(a, b + 1));
      if (o1 >= 0 && o2 > o1) return JSON.parse(t.slice(o1, o2 + 1));
      return JSON.parse(t);
    } catch (e) { throw err('invalid_json'); }
  };
  sample.limits = async function () {
    return { images: { mediaTypes: ['image/jpeg', 'image/png', 'image/webp'], maxInputBytes: 15000000 } };
  };
  var user = {
    isOwner: function () { return true; },
    canEdit: function () { return true; },
    can: function () { return Promise.resolve(true); }
  };
  window.GR_BACKEND = {
    noteError: noteError,
    netTrouble: function () { return navigator.onLine === false || Date.now() - lastNetFail < 8000; },
    email: function () { return session && session.user ? session.user.email : null; },
    username: function () {
      var m = session && session.user ? session.user.user_metadata : null;
      var n = m ? String(m.username || '').trim() : '';
      return n || null;
    },
    tourRoles: TOUR_ROLES,
    openRolePicker: openRolePicker,
    birthParts: function (a, changed) { return sgDateParts(a, changed); },
    legal: async function () {
      if (!sb || !session) return null;
      try {
        var d = await legalApi.status();
        var note = d.notice === true && d.needs !== true;
        return { ready: d.ready === true, needs: d.needs === true, notice: note,
          lockOn: note && d.lock_on ? String(d.lock_on) : null, acceptedAt: d.accepted_at || null,
          versions: isObj(d.versions) ? d.versions : null, current: isObj(d.current) ? d.current : null,
          changed: Array.isArray(d.changed) ? d.changed.map(String) : [] };
      } catch (e) { return null; }
    },
    legalReview: async function () {
      if (!sb || !session) return '';
      try {
        var how = await legalInside(false, 'inside', {});
        if (how === 'agreed') { refetchTries = 0; scheduleRefetch(); }
        return how || '';
      } catch (e) { return ''; }
    },
    legalDocs: async function () {
      if (!sb || !session) return null;
      try {
        var d = legalClean(await legalApi.docs());
        if (!d) return null;
        return d.docs.map(function (x) {
          return { doc: x.doc, name: LEGAL_NAMES[x.doc], title: x.title, version: x.version, body: x.body, publishedAt: x.published_at };
        });
      } catch (e) { return null; }
    },
    legalBody: function (text, title) { sgStyle(); return mdNodes(text, title); },
    legalList: async function () {
      if (!sb || !session) return null;
      try {
        var q = await sgLimit(sb.rpc('legal_list'), 20000);
        return q.error || !isObj(q.data) ? null : q.data;
      } catch (e) { return null; }
    },
    myProfile: function () {
      var m = (session && session.user && session.user.user_metadata) || {};
      var full = String(m.full_name || '').trim();
      var first = String(m.first_name || '').trim() || full.split(/\s+/)[0] || '';
      var last = String(m.last_name || '').trim() || full.split(/\s+/).slice(1).join(' ');
      return {
        firstName: first, lastName: last, fullName: full,
        username: String(m.username || '').trim(),
        phone: String(m.phone || '').trim(),
        phoneAsked: m.phone_asked === true,
        tourRole: roleName(m.tour_role),
        email: session && session.user ? session.user.email : ''
      };
    },
    saveProfile: async function (p) {
      var first = String(p.firstName || '').trim().slice(0, 30);
      var last = String(p.lastName || '').trim().slice(0, 30);
      var full = (first + ' ' + last).trim();
      var card = {
        first_name: first, last_name: last,
        full_name: full.slice(0, 60),
        username: full.slice(0, 40),
        phone: String(p.phone || '').trim().slice(0, 30),
        tour_role: String(p.tourRole || '').trim().slice(0, 40)
      };
      var q = await sb.auth.updateUser({ data: card });
      if (q.error) throw mapError(q.error);
      if (q.data && q.data.user && session) session.user = q.data.user;
      await pushProfile();
    },
    pushSocial: async function (p) {
      if (!session || !session.user) return;
      var q = await sb.from('profiles').upsert({
        user_id: session.user.id,
        bio: String(p.bio || '').slice(0, 300),
        roles: (Array.isArray(p.roles) ? p.roles : []).map(function (r) { return String(r).slice(0, 40); }).slice(0, 20),
        avatar: String(p.photo || '').slice(0, 120000),
        artists: (Array.isArray(p.artists) ? p.artists : []).map(function (a) { return String(a).trim().slice(0, 60); })
          .filter(Boolean).slice(0, 40),
        updated_at: new Date().toISOString()
      });
      if (q.error) throw mapError(q.error);
    },
    handleFree: async function (h) {
      var q = await sb.rpc('handle_free', { h: String(h || '') });
      if (q.error) throw mapError(q.error);
      return q.data === true;
    },
    setHandle: async function (h) {
      if (!session || !session.user) return;
      var clean = String(h || '').trim().toLowerCase();
      var q = await sb.from('profiles').upsert({ user_id: session.user.id, handle: clean || null,
        updated_at: new Date().toISOString() });
      if (q.error) {
        if (q.error.code === '23505') { var taken = new Error('taken'); taken.code = 'taken'; throw taken; }
        if (q.error.code === '23514') { var bad = new Error('shape'); bad.code = 'shape'; throw bad; }
        throw mapError(q.error);
      }
      if (firstFacts) firstFacts.handle = clean;
    },
    firstRun: function () {
      var f = firstFacts || { onboarded: true, kinds: [], handle: '', hasBirth: true, unknown: true };
      var p = window.GR_BACKEND.myProfile();
      var asking = !!(session && session.user && session.user.user_metadata &&
        session.user.user_metadata.invited === true);
      return { due: !f.onboarded && !asking, needsHandle: !f.unknown && !f.handle, needsBirth: !f.unknown && !f.hasBirth,
        kinds: f.kinds.slice(), firstName: p.firstName, lastName: p.lastName, handle: f.handle, email: p.email,
        suggest: suggestRead() };
    },
    signupSettings: function () { return signupSettings(); },
    saveBirthDate: async function (d) {
      var day = String(d || '');
      if (!realDay(day)) throw err('shape');
      if (yearsOld(Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))) < 18) throw err('young');
      var q = await sb.rpc('save_birth_date', { d: day });
      if (q.error) {
        var m = String(q.error.message || '');
        if (/\byoung\b/i.test(m)) throw err('young');
        if (/\bshape\b/i.test(m) || q.error.code === '22007' || q.error.code === '22008') throw err('shape');
        throw mapError(q.error);
      }
      var out = isObj(q.data) ? q.data : { ok: true };
      if (out.ok === false) throw err(out.why === 'young' || out.why === 'shape' ? out.why : 'unavailable');
      if (firstFacts) firstFacts.hasBirth = true;
      return out;
    },
    finishFirstRun: async function (kinds) {
      var k = cleanKinds(kinds);
      var q = await sb.rpc('finish_first_run', { k: k });
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: true };
      if (out.ok !== false && firstFacts) { firstFacts.onboarded = true; firstFacts.kinds = k; }
      if (out.ok !== false) suggestClear();
      return out;
    },
    saveKinds: async function (kinds) {
      var k = cleanKinds(kinds);
      var q = await sb.rpc('save_kinds', { k: k });
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: true };
      if (out.ok !== false && firstFacts) firstFacts.kinds = k;
      return out;
    },
    profileCard: async function (userId) {
      var q = await sb.rpc('profile_card', { u: userId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    followList: async function (userId, which) {
      var q = await sb.rpc('follow_list', { u: userId, which: which === 'following' ? 'following' : 'followers' });
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    follow: async function (userId) {
      var q = await sb.from('follows').upsert({ follower_id: session.user.id, followee_id: userId },
        { onConflict: 'follower_id,followee_id', ignoreDuplicates: true });
      if (q.error) throw mapError(q.error);
    },
    unfollow: async function (userId) {
      var q = await sb.from('follows').delete().eq('follower_id', session.user.id).eq('followee_id', userId);
      if (q.error) throw mapError(q.error);
    },
    tourCard: async function (tourId, userId) {
      var q = await sb.rpc('tour_card', { t_id: tourId, u: userId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    flyer: async function (tourId) {
      var q = await sb.from('tour_flyers').select('image').eq('tour_id', tourId).maybeSingle();
      if (q.error) throw mapError(q.error);
      return q.data ? String(q.data.image || '') : '';
    },
    saveFlyer: async function (tourId, dataUrl) {
      var q = dataUrl
        ? await sb.from('tour_flyers').upsert({ tour_id: tourId, image: dataUrl, updated_by: session.user.id,
            updated_at: new Date().toISOString() })
        : await sb.from('tour_flyers').delete().eq('tour_id', tourId);
      if (q.error) throw mapError(q.error);
      if (ownFlyers.ids) { if (dataUrl) ownFlyers.ids[tourId] = true; else delete ownFlyers.ids[tourId]; emit('tours'); }
    },
    tourFlyerHas: function (tourId) {
      if (!session) return null;
      if (Date.now() - ownFlyers.at > (ownFlyers.ids ? FLYER_FRESH : 30e3)) loadOwnFlyers();
      return ownFlyers.ids ? !!ownFlyers.ids[tourId] : null;
    },
    searchSuggestions: async function () {
      var q = await sb.rpc('search_suggestions');
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    myArtists: async function () {
      var q = await sb.rpc('my_artists');
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    endorse: async function (artistId, userId) {
      var q = await sb.from('artist_endorsements').insert({ artist_id: artistId, user_id: userId, endorsed_by: session.user.id });
      if (q.error && q.error.code !== '23505') throw mapError(q.error);
      flowersStale(); emit('tours');
    },
    removeEndorsement: async function (id) {
      var q = await sb.rpc('remove_endorsement', { e_id: id });
      if (q.error) throw mapError(q.error);
      flowersStale(); emit('tours');
    },
    setMemberRole: async function (artistId, userId, role) {
      var q = await sb.from('artist_members').update({ role: String(role || '').trim().slice(0, 160) })
        .eq('artist_id', artistId).eq('user_id', userId).select('user_id');
      if (q.error) throw mapError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
    },
    creditAsks: async function () {
      var q = await sb.rpc('my_credit_asks');
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    creditQueue: async function () {
      var q = await sb.rpc('credit_queue');
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    creditTours: async function (artistId) {
      var q = await sb.rpc('credit_tours', { a_id: artistId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    creditShows: async function (artistId, key) {
      var q = await sb.rpc('credit_shows', { a_id: artistId, t_key: String(key) });
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    submitCredits: async function (artistId, claim) {
      var q = await sb.rpc('submit_tour_credits', { a_id: artistId, claim: claim });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    decideCredits: async function (artistId, userId, verdict, seen) {
      var q = await sb.rpc('decide_tour_credits', { a_id: artistId, u_id: userId, verdict: verdict, seen: seen || null });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    withdrawCredits: async function (artistId) {
      var q = await sb.rpc('withdraw_tour_credits', { a_id: artistId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    creditDetail: async function (artistId, userId) {
      var q = await sb.rpc('credit_detail', { a_id: artistId, u_id: userId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    tourClaims: async function (artistId) {
      var q = await sb.rpc('my_tour_claims', { a_id: artistId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    addTourCredit: async function (artistId, tourName, role) {
      var q = await sb.rpc('add_tour_credit', { a_id: artistId, tour_name: String(tourName || ''),
        r: String(role || '').trim().slice(0, 160) });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    squareState: async function () {
      var q = await sb.from('square_connect')
        .select('env, merchant, location_id, location_name, status, detail, last_sync, connected_at')
        .maybeSingle();
      if (q.error) throw mapError(q.error);
      return q.data || null;
    },
    squareNights: async function () {
      var since = new Date(Date.now() - 60 * 864e5).toISOString();
      var q = await sb.from('square_payments').select('id, created_at, amount, tip, refunded, status')
        .gte('created_at', since).order('created_at', { ascending: true }).limit(1000);
      if (q.error) throw mapError(q.error);
      return q.data || [];
    },
    squareConnect: async function (token) {
      var tok = String(token || '').trim();
      var up = await sb.from('square_connect').update({ env: 'sandbox', token: tok, status: 'new' })
        .eq('owner_id', session.user.id).select('owner_id');
      if (up.error) throw mapError(up.error);
      if (up.data && up.data.length) return;
      var ins = await sb.from('square_connect').insert(
        { owner_id: session.user.id, env: 'sandbox', token: tok, status: 'new' });
      if (ins.error && ins.error.code === '23505') {
        var again = await sb.from('square_connect').update({ env: 'sandbox', token: tok, status: 'new' })
          .eq('owner_id', session.user.id).select('owner_id');
        if (again.error) throw mapError(again.error);
        return;
      }
      if (ins.error) throw mapError(ins.error);
    },
    squareDisconnect: async function () {
      var q = await sb.from('square_connect').delete().eq('owner_id', session.user.id);
      if (q.error) throw mapError(q.error);
    },
    tourFindStart: async function (artistId, force) {
      var q = await sb.rpc('tour_find_start', { a_id: artistId, force: !!force });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    tourFindState: async function (artistId) {
      var q = await sb.rpc('tour_find_state', { a_id: artistId });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    tourFindPages: async function (artistId) {
      var q = await sb.rpc('tour_find_pages_get', { a_id: artistId });
      if (q.error) throw mapError(q.error);
      return q.data === null ? null : (Array.isArray(q.data) ? q.data : []);
    },
    tourFindPropose: async function (artistId, cands, readUrls, trusted) {
      var q = await sb.rpc('tour_find_propose', { a_id: artistId, cands: cands || [], read_urls: Array.isArray(readUrls) ? readUrls : null, trusted: !!trusted });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    tourCandidateDecide: async function (candId, add, name) {
      var q = await sb.rpc('tour_candidate_decide', { c_id: candId, add: !!add, new_name: name || null });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    tourNights: async function (artistId, name) {
      var q = await sb.rpc('artist_tour_nights', { a_id: artistId, tour_name: name });
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    tourNightAnswer: async function (artistId, nightId, played) {
      var q = await sb.rpc('artist_night_answer', { a_id: artistId, night_id: nightId, played: !!played });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    tourRouting: async function (artistId, name) {
      var q = await sb.rpc('artist_tour_routing', { a_id: artistId, tour_name: name });
      if (q.error) return null;
      return q.data && typeof q.data === 'object' && !Array.isArray(q.data) ? q.data : null;
    },
    tourRoutingAnswer: async function (artistId, routingId, yes) {
      var q = await sb.rpc('tour_routing_answer', { a_id: artistId, r_id: routingId, yes: !!yes });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    tourWebAnswer: async function (artistId, nightId, played) {
      var q = await sb.rpc('tour_web_answer', { a_id: artistId, night_id: nightId, played: !!played });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    tourAliasAnswer: async function (artistId, key, aliasKey, same) {
      var q = await sb.rpc('tour_alias_answer', { a_id: artistId, a_key: key, b_key: aliasKey, same: !!same });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    tourFindNote: async function (artistId, note) {
      var q = await sb.rpc('tour_find_note', { a_id: artistId, note: note || '' });
      if (q.error) throw mapError(q.error);
    },
    artistTourEdit: async function (artistId, name, newName) {
      var q = await sb.rpc('artist_tour_edit', { a_id: artistId, tour_name: name, new_name: newName });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    artistTourRemove: async function (artistId, name) {
      var q = await sb.rpc('artist_tour_remove', { a_id: artistId, tour_name: name });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    artistTourConflicts: async function (artistId, name) {
      var q = await sb.rpc('artist_tour_conflicts', { a_id: artistId, tour_name: name });
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    artistTourPick: async function (artistId, date, name) {
      var q = await sb.rpc('artist_tour_pick', { a_id: artistId, night: date, tour_name: name || '' });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    tourCandidateUndo: async function (candId) {
      var q = await sb.rpc('tour_candidate_undo', { c_id: candId });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    myPayAccounts: async function () {
      var q = await sb.from('my_pay_accounts').select('*').eq('user_id', session.user.id);
      if (q.error) throw mapError(q.error);
      return q.data || [];
    },
    myPayCardSetup: async function (accountId, card, mode, since) {
      var q = await sb.rpc('my_pay_card_setup', { acct: String(accountId), card_kind: card, how: mode, start_day: since });
      if (q.error) { if (fnMissing(q.error)) return { ok: false, why: 'missing' }; throw mapError(q.error); }
      return isObj(q.data) ? q.data : { ok: true };
    },
    myPayBanks: async function () {
      var q = await sb.rpc('my_pay_banks');
      if (q.error) { if (fnMissing(q.error)) return null; throw mapError(q.error); }
      return Array.isArray(q.data) ? q.data : [];
    },
    myPayClaimAccounts: async function (list) {
      var q = await sb.rpc('my_pay_claim_accounts', { ids: list || [] });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    myPayClaimItems: async function (items) {
      var q = await sb.rpc('my_pay_claim_items', { ids: items || [] });
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    myPayTwins: async function () {
      var q = await sb.rpc('my_pay_twins');
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    myPayItemIds: async function () {
      var q = await sb.rpc('my_pay_item_ids');
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    myPayReleaseAccount: async function (accountId) {
      var q = await sb.rpc('my_pay_release_account', { acct: accountId });
      if (q.error) throw mapError(q.error);
    },
    myPayInbox: async function () {
      var ask = function (cols) {
        return sb.from('my_pay_feed').select(cols).eq('user_id', session.user.id)
          .eq('status', 'new').order('date', { ascending: false }).limit(200);
      };
      var q = await ask('id, kind, date, merchant, amount, account, card, account_id, hint');
      if (q.error && columnMissing(q.error)) q = await ask('id, kind, date, merchant, amount, account, card');
      if (q.error) throw mapError(q.error);
      return q.data || [];
    },
    myPayFile: async function (tourId, itemId, category, how) {
      var q = await sb.rpc('my_pay_file', { t_id: tourId, item_id: itemId, category: category, how: how || null });
      if (q.error) throw mapError(q.error);
    },
    myPaySkip: async function (itemId) {
      var q = await sb.rpc('my_pay_skip', { item_id: itemId });
      if (q.error) throw mapError(q.error);
    },
    myPaySkipped: async function () {
      var q = await sb.from('my_pay_feed').select('id, kind, date, merchant, amount, account, account_id, card, decided_at')
        .eq('user_id', session.user.id).eq('status', 'skipped').order('date', { ascending: false }).limit(200);
      if (q.error) { if (columnMissing(q.error) || tableMissing(q.error)) return null; throw mapError(q.error); }
      return q.data || [];
    },
    myPayUnskip: async function (ids) {
      var q = await sb.rpc('my_pay_unskip', { ids: ids || [] });
      if (q.error) { if (fnMissing(q.error)) return { ok: false, why: 'missing' }; throw mapError(q.error); }
      return isObj(q.data) ? q.data : { ok: true, n: 0 };
    },
    myPayUnfile: async function (itemId) {
      var q = await sb.rpc('my_pay_unfile', { item_id: itemId == null ? '' : String(itemId) });
      if (q.error) { if (fnMissing(q.error)) return { ok: false, why: 'missing' }; throw mapError(q.error); }
      return isObj(q.data) ? q.data : { ok: false };
    },
    myPayLinesFor: async function (accountId) {
      var q = await sb.from('my_pay_feed').select('id, kind, date, merchant, amount, status, tour_id')
        .eq('user_id', session.user.id).eq('account_id', String(accountId)).order('date', { ascending: false }).limit(200);
      if (q.error) { if (columnMissing(q.error) || tableMissing(q.error)) return null; throw mapError(q.error); }
      return q.data || [];
    },
    myPayLinesById: async function (ids) {
      var list = [], out = [];
      (Array.isArray(ids) ? ids : []).forEach(function (x) { var s = x == null ? '' : String(x); if (s && list.indexOf(s) < 0) list.push(s); });
      for (var i = 0; i < list.length && i < 500; i += 50) {
        var q = await sb.from('my_pay_feed').select('id, kind, date, status, account_id')
          .eq('user_id', session.user.id).in('id', list.slice(i, i + 50));
        if (q.error) { if (columnMissing(q.error) || tableMissing(q.error)) return null; throw mapError(q.error); }
        out = out.concat(q.data || []);
      }
      return out;
    },
    myPay: async function (tourId) {
      var q = await sb.rpc('my_pay', { t_id: tourId });
      if (q.error) throw mapError(q.error);
      return q.data || null;
    },
    myPayBook: async function (tourId) {
      var q = await sb.from('my_pay_books').select('doc').eq('tour_id', tourId).eq('user_id', session.user.id).maybeSingle();
      if (q.error) throw mapError(q.error);
      return q.data && q.data.doc ? q.data.doc : {};
    },
    myPayBooks: async function () {
      var q = await sb.from('my_pay_books').select('tour_id, doc').eq('user_id', session.user.id).limit(200);
      if (q.error) throw mapError(q.error);
      return q.data || [];
    },
    saveMyPayBook: async function (tourId, doc) {
      var q = await sb.from('my_pay_books').upsert({ tour_id: tourId, user_id: session.user.id, doc: doc || {}, updated_at: new Date().toISOString() },
        { onConflict: 'tour_id,user_id' });
      if (q.error) throw mapError(q.error);
    },
    patchMyPayBook: async function (tourId, patch, whole) {
      var q = await sb.rpc('my_pay_book_patch', { t_id: tourId, sets: (patch && patch.set) || [], unsets: (patch && patch.unset) || [] });
      if (!q.error) return isObj(q.data) ? q.data : whole;
      if (!fnMissing(q.error)) throw mapError(q.error);
      var up = await sb.from('my_pay_books').upsert({ tour_id: tourId, user_id: session.user.id, doc: whole || {}, updated_at: new Date().toISOString() },
        { onConflict: 'tour_id,user_id' });
      if (up.error) throw mapError(up.error);
      return whole;
    },
    setlistState: async function () {
      var q = await sb.from('setlist_connect')
        .select('status, detail, last_sync, connected_at').maybeSingle();
      if (q.error) throw mapError(q.error);
      return q.data || null;
    },
    setlistConnect: async function (token) {
      var tok = String(token || '').trim();
      var up = await sb.from('setlist_connect').update({ token: tok, status: 'new' })
        .eq('owner_id', session.user.id).select('owner_id');
      if (up.error) throw mapError(up.error);
      if (up.data && up.data.length) return;
      var ins = await sb.from('setlist_connect').insert(
        { owner_id: session.user.id, token: tok, status: 'new' });
      if (ins.error && ins.error.code === '23505') {
        var again = await sb.from('setlist_connect').update({ token: tok, status: 'new' })
          .eq('owner_id', session.user.id).select('owner_id');
        if (again.error) throw mapError(again.error);
        return;
      }
      if (ins.error) throw mapError(ins.error);
    },
    setlistDisconnect: async function () {
      var q = await sb.from('setlist_connect').delete().eq('owner_id', session.user.id);
      if (q.error) throw mapError(q.error);
    },
    artistHistory: async function (artistId) {
      var q = await sb.from('artist_history')
        .select('artist_id, status, detail, total, pages, next_page, summary, synced_at, mb_url, auto, credits')
        .eq('artist_id', artistId).maybeSingle();
      if (q.error) throw mapError(q.error);
      return q.data || null;
    },
    historyStart: async function (artistId) {
      var q = await sb.rpc('artist_history_start', { a_id: artistId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    historyStop: async function (artistId) {
      var q = await sb.rpc('artist_history_stop', { a_id: artistId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    mbSearch: async function (text, signal) {
      var words = String(text || '').replace(/["\\+\-!(){}\[\]^~*?:\/&|]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 6);
      if (!words.length || words.join('').length < 2) return [];
      var query = 'artist:"' + words.join(' ') + '" OR artist:(' + words.map(function (w, i) {
        return i === words.length - 1 ? w + '*' : w;
      }).join(' AND ') + ')';
      var res = await fetch('https://musicbrainz.org/ws/2/artist?fmt=json&limit=12&query=' + encodeURIComponent(query),
        { headers: { Accept: 'application/json' }, signal: signal || undefined });
      if (!res.ok) throw err(res.status === 503 || res.status === 429 ? 'busy' : 'unavailable');
      var body = await res.json();
      var list = Array.isArray(body && body.artists) ? body.artists : [];
      return list.filter(function (a) {
        var type = String(a.type || '');
        return a && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(a.id || '')) &&
          (type === 'Group' || type === 'Person' || type === 'Orchestra' || type === 'Choir') &&
          String(a.name || '').trim() && String(a.name).length <= 60 && Number(a.score) >= 55;
      }).slice(0, 8).map(function (a) {
        return { mbid: String(a.id), name: String(a.name).trim(), about: String(a.disambiguation || '').slice(0, 80),
          country: String(a.country || ''), type: String(a.type || ''), score: Number(a.score) || 0 };
      });
    },
    openMbArtist: async function (mbid, nameHint) {
      var q = await sb.rpc('artist_open_mb', { mb_id: String(mbid || ''), name_hint: String(nameHint || '').slice(0, 60) });
      if (q.error) {
        if (/too many today/i.test(String(q.error.message || ''))) { var many = new Error('too-many'); many.code = 'too-many'; throw many; }
        throw mapError(q.error);
      }
      return isObj(q.data) ? q.data : null;
    },
    historyNudge: async function (artistId, fresh) {
      var q = await sb.rpc('artist_history_nudge', { a_id: artistId, fresh: !!fresh });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    claimArtist: async function (artistId, o, oldLink) {
      var c = isObj(o) ? o : { note: o, link: oldLink };
      var note = String(c.note || '').trim().slice(0, 500);
      var role = String(c.role || '').trim().slice(0, 40);
      var links = {}, loose = '';
      ['spotify', 'instagram', 'website'].forEach(function (k) {
        var raw = isObj(c.links) ? String(c.links[k] || '').trim() : '';
        if (!raw) return;
        var url = httpsLink(k, raw).slice(0, 200);
        if (/^https:\/\/\S{4,}$/i.test(url)) links[k] = url;
        else if (!loose) loose = raw.slice(0, 200);
      });
      var link = String(c.link || '').trim().slice(0, 200) || loose;
      if (!link && !Object.keys(links).length && note.length < 3) throw err('short');
      var q = await sb.rpc('claim_artist', { a_id: artistId, note: note, link: link, role: role, links: links });
      if (q.error && fnMissing(q.error)) {
        var all = [role, note].concat(Object.keys(links).map(function (k) { return k + ': ' + links[k]; }))
          .filter(Boolean).join(' · ').slice(0, 500);
        q = await sb.rpc('claim_artist', { a_id: artistId, note: all,
          link: link || links.website || links.spotify || links.instagram || '' });
      }
      if (q.error) {
        var m = String(q.error.message || '');
        if (/say who you are/i.test(m)) throw err('short');
        if (/too many/i.test(m)) throw err('too-many');
        throw mapError(q.error);
      }
      return isObj(q.data) ? q.data : { ok: false };
    },
    withdrawClaim: async function (artistId) {
      var q = await sb.rpc('withdraw_claim', { a_id: artistId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    myClaims: async function () {
      var q = await sb.rpc('my_claims');
      if (q.error) throw mapError(q.error);
      var rows = Array.isArray(q.data) ? q.data : [];
      var ids = rows.filter(function (r) { return isObj(r) && r.artistId && r.avatar == null; })
        .map(function (r) { return r.artistId; });
      if (!ids.length) return rows;
      try {
        var aq = await sb.from('artists').select('id, avatar').in('id', ids);
        if (aq.error) return rows;
        var by = {};
        (aq.data || []).forEach(function (x) { if (x && x.id) by[x.id] = String(x.avatar || ''); });
        rows.forEach(function (r) { if (isObj(r) && r.avatar == null && by[r.artistId] != null) r.avatar = by[r.artistId]; });
      } catch (e) {   }
      return rows;
    },
    claimQueue: async function () {
      var q = await sb.rpc('claim_queue');
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : null;
    },
    decideClaim: async function (claimId, approve) {
      var q = await sb.rpc('decide_claim', { c_id: claimId, approve: !!approve });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    requestArtist: async function (artistId, kind, role) {
      var q = await sb.rpc('request_artist', { a_id: artistId, k: kind === 'crew' ? 'crew' : 'band',
        r: String(role || '').trim().slice(0, 160) });
      if (q.error && /former_member/.test(String(q.error.message || ''))) return { ok: false, why: 'former_member' };
      if (q.error) throw knownError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    myArtistRequests: async function () {
      var q = await sb.rpc('my_artist_requests');
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    withdrawArtistRequest: async function (artistId) {
      var q = await sb.rpc('withdraw_artist_request', { a_id: artistId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    artistRequestQueue: async function (artistId) {
      var q = await sb.rpc('artist_request_queue', { a_id: artistId || null });
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    decideArtistRequest: async function (artistId, userId, accept) {
      var q = await sb.rpc('decide_artist_request', { a_id: artistId, u_id: userId, accept: !!accept });
      if (q.error && /former_member/.test(String(q.error.message || ''))) return { ok: false, why: 'former_member' };
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    artistYesSeats: async function (artistId, userId, why) {
      var q = await sb.rpc('artist_yes_seats', { a_id: artistId, u_id: userId, why: String(why || 'request') });
      if (q.error && fnMissing(q.error)) return null;
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    artistSeatsOff: async function (artistId, userId) {
      var q = await sb.rpc('artist_seats_off', { a_id: artistId, u_id: userId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    unclaimedJoins: async function (artistId) {
      var q = await sb.rpc('unclaimed_join_queue', { a_id: artistId || null });
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    answerUnclaimedJoin: async function (artistId, userId, keep) {
      var q = await sb.rpc('answer_unclaimed_join', { a_id: artistId, u_id: userId, keep: !!keep });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    myInvites: async function () {
      if (!sb || !session) return [];
      var q = await sb.rpc('my_invites');
      if (q.error) { if (fnMissing(q.error)) return []; throw mapError(q.error); }
      return Array.isArray(q.data) ? q.data : [];
    },
    acceptInvite: async function (tourId) {
      var q = await sb.rpc('accept_invite', { t_id: String(tourId || '') });
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: false };
      if (out.ok) { refetchTries = 0; scheduleRefetch(); }
      return out;
    },
    leaveTourOn: function () {
      return ctKnown === true;
    },
    leaveTour: async function (tourId) {
      var q = await sb.rpc('leave_tour', { t_id: String(tourId || '') });
      if (q.error) throw mapError(q.error);
      refetchTries = 0; scheduleRefetch();
      return isObj(q.data) ? q.data : { ok: false };
    },
    fanNights: async function (artistId, tourName) {
      var q = await sb.rpc('artist_fan_nights', { a_id: artistId, tour_name: tourName });
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    markAttended: async function (artistId, date, going) {
      var q = await sb.rpc('mark_attended', { a_id: artistId, night: date, going: going !== false });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    myAttended: async function () {
      var q = await sb.rpc('my_attended');
      if (q.error) throw mapError(q.error);
      var d = isObj(q.data) ? q.data : {};
      return { count: Number(d.count) || 0, artists: Array.isArray(d.artists) ? d.artists : [] };
    },
    findPlaces: async function (text) {
      var q = await sb.rpc('find_places', { q: String(text || '') });
      if (q.error) throw mapError(q.error);
      var d = isObj(q.data) ? q.data : {};
      return { venues: Array.isArray(d.venues) ? d.venues : [], festivals: Array.isArray(d.festivals) ? d.festivals : [] };
    },
    openVenue: async function (name, city, cc) {
      var q = await sb.rpc('venue_open', { v_name: String(name || ''), v_city: String(city || ''), v_cc: String(cc || '') });
      if (q.error) throw knownError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    openFestival: async function (name) {
      var q = await sb.rpc('festival_open', { f_name: String(name || '') });
      if (q.error) throw knownError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    venueCard: async function (id) {
      var q = await sb.rpc('venue_card', { v_id: id });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    festivalCard: async function (id) {
      var q = await sb.rpc('festival_card', { f_id: id });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    placeWorkAsk: async function (o) {
      var p = o || {};
      var q = await sb.rpc('place_work_ask', { v_id: p.venueId || null, f_id: p.festivalId || null,
        r: String(p.role || '').trim().slice(0, 40) });
      if (q.error) throw knownError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    placeWorkWithdraw: async function (o) {
      var p = o || {};
      var q = await sb.rpc('place_work_withdraw', { v_id: p.venueId || null, f_id: p.festivalId || null });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    myPlaces: async function () {
      var q = await sb.rpc('my_places');
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    ratingsOn: function () {
      if (rateKnown === null) rateProbe();
      return rateKnown === true;
    },
    venueRate: async function (venueId, stars) {
      if (!session) throw err('unavailable');
      var n = Math.max(1, Math.min(10, Math.round(Number(stars) || 0)));
      var q = await sb.from('venue_ratings').upsert({ venue_id: venueId, user_id: session.user.id, stars: n },
        { onConflict: 'venue_id,user_id' });
      if (q.error) {
        if (tableMissing(q.error)) { rateKnown = false; emit('tours'); throw err('unavailable'); }
        throw mapError(q.error);
      }
    },
    myVenueRating: async function (venueId) {
      if (!session || rateKnown === false) return null;
      var q = await sb.from('venue_ratings').select('stars').eq('venue_id', venueId).eq('user_id', session.user.id).maybeSingle();
      if (q.error) {
        if (tableMissing(q.error)) { rateKnown = false; emit('tours'); }
        return null;
      }
      return q.data && Number(q.data.stars) >= 1 ? Number(q.data.stars) : null;
    },
    showRate: async function (tourId, showId, o) {
      if (!session) throw err('unavailable');
      var p = isObj(o) ? o : {};
      var one = function (v) { var n = Math.round(Number(v)); return n >= 1 && n <= 10 ? n : null; };
      var row = { tour_id: tourId, show_id: showId, user_id: session.user.id,
        crowd: one(p.crowd), venue: one(p.venue), city: one(p.city) };
      if (isObj(p.review)) row.review = p.review;
      var q = await sb.from('show_ratings').insert(row);
      if (q.error && row.review && row.review.size && (q.error.code === '23514' || /show_ratings_review_ok/.test(String(q.error.message || '')))) {
        sizeKnown = false; sizeAt = Date.now();
        var rest = Object.assign({}, row.review);
        delete rest.size;
        row.review = rest;
        if (Object.keys(rest).length || row.crowd || row.venue || row.city) q = await sb.from('show_ratings').insert(row);
      }
      var c = showRateCache[tourId];
      var held = function (r) {
        if (!(c && c.data)) return;
        c.data = c.data.filter(function (x) { return !(x.showId === showId && x.userId === session.user.id); }).concat([r]);
      };
      if (q.error) {
        if (row.review && columnMissing(q.error)) { reviewKnown = false; emit('tours'); throw err('review-missing'); }
        if (tableMissing(q.error)) { rateKnown = false; emit('tours'); throw err('unavailable'); }
        var e = mapError(q.error);
        if (e.code === 'already-rated') {
          held({ showId: showId, userId: session.user.id, crowd: null, venue: null, city: null, at: new Date().toISOString() });
          showRateGen[tourId] = (showRateGen[tourId] || 0) + 1;
          if (c) c.stale = true;
          emit('tours');
        }
        throw e;
      }
      held({ showId: showId, userId: session.user.id, crowd: row.crowd, venue: row.venue, city: row.city, at: new Date().toISOString() });
      emit('tours');
    },
    showRatings: function (tourId, fresh) {
      if (rateKnown !== true) return null;
      var c = showRateCache[tourId];
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadShowRatings(tourId);
      return c ? c.data : null;
    },
    showReviewOn: function () {
      if (reviewKnown === null) reviewProbe();
      return reviewKnown === true;
    },
    crowdSizeOn: function () {
      if (reviewKnown === false) return false;
      if (sizeKnown === true) return true;
      if (reviewKnown === null) reviewProbe();
      else if (sizeKnown === null || Date.now() - sizeAt > 600e3) sizeProbe();
      return sizeKnown === false ? false : null;
    },
    inviteCodes: async function () {
      var q = await sb.rpc('invite_codes');
      if (q.error) throw mapError(q.error);
      return q.data == null ? null : (Array.isArray(q.data) ? q.data : []);
    },
    makeInviteCode: async function (o) {
      var p = o || {};
      var q = await sb.rpc('invite_code_make', { k: cleanKinds(p.kinds),
        uses: Math.max(1, Math.round(Number(p.uses)) || 1), days: Math.max(1, Math.round(Number(p.days)) || 30),
        note: String(p.note || '').trim().slice(0, 80) });
      if (q.error) throw knownError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    revokeInviteCode: async function (code) {
      var q = await sb.rpc('invite_code_revoke', { c: String(code || '') });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    incomeNew: async function () {
      var ask = function (cols) {
        return sb.from('merch_deposits').select(cols).eq('matched', false).order('date', { ascending: false }).limit(200);
      };
      var q = await ask('id, date, amount, atvenu, watch, how, payer');
      if (q.error) q = await ask('id, date, amount, atvenu, watch, how');
      if (q.error) q = await ask('id, date, amount, atvenu, watch');
      if (q.error) throw mapError(q.error);
      return q.data || [];
    },
    depositsMatched: async function () {
      var q = await sb.from('merch_deposits').select('id, date, amount, tour_id, show_ids').eq('matched', true)
        .order('date', { ascending: false }).limit(1000);
      if (q.error) throw mapError(q.error);
      return q.data || [];
    },
    catalogIncome: async function (depId, opts) {
      var o = opts || {};
      var args = { dep_id: String(depId), t_id: o.tourId || null, s_id: o.showId || null, kind: String(o.kind || '') };
      var note = o.kind === 'other' && o.note != null
        ? Array.from(String(o.note).replace(/\s+/g, ' ').trim())
            .filter(function (ch) { return !/^[\uD800-\uDFFF]$/.test(ch); }).slice(0, 60).join('').trim() : '';
      if (note) args.note = note;
      var q = await sb.rpc('catalog_income', args);
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: false };
      if (out.ok && o.tourId) { try { await refetch(); } catch (e) {   } }
      return out;
    },
    catalogIncomeNote: true,
    catalogIncomeSplit: async function (depId, opts) {
      var o = opts || {};
      var q = await sb.rpc('catalog_income_split', {
        dep_id: String(depId), t_id: o.tourId || null, parts: Array.isArray(o.parts) ? o.parts : [] });
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: false };
      if (out.ok && o.tourId) { try { await refetch(); } catch (e) {   } }
      return out;
    },
    setChargeCrew: async function (tourId, tags, keep) {
      var q = await sb.rpc('set_charge_crew', { t_id: String(tourId), tags: isObj(tags) ? tags : {}, keep: !!keep });
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: false };
      if (out.ok) { try { await refetch(); } catch (e) {   } }
      return out;
    },
    sortGuarantee: async function (depId, opts) {
      var o = opts || {};
      var q = await sb.rpc('sort_guarantee', {
        dep_id: String(depId), t_id: o.tourId || null, parts: Array.isArray(o.parts) ? o.parts : [], whole: !!o.whole,
        expect: typeof o.expect === 'number' ? o.expect : null });
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: false };
      if ((out.ok || out.why === 'changed') && o.tourId) { try { await refetch(); } catch (e) {   } }
      return out;
    },
    catalogMerchSplit: async function (depId, opts) {
      var o = opts || {};
      var q = await sb.rpc('catalog_merch_split', {
        dep_id: String(depId), t_id: o.tourId || null, parts: Array.isArray(o.parts) ? o.parts : [] });
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: false };
      if (out.ok && o.tourId) { try { await refetch(); } catch (e) {   } }
      return out;
    },
    sortMerch: async function (depId, opts) {
      var o = opts || {};
      var q = await sb.rpc('sort_merch', {
        dep_id: String(depId), t_id: o.tourId || null, parts: Array.isArray(o.parts) ? o.parts : [],
        expect: typeof o.expect === 'number' ? o.expect : null });
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: false };
      if ((out.ok || out.why === 'changed') && o.tourId) { try { await refetch(); } catch (e) {   } }
      return out;
    },
    unparkMerch: async function (depId, opts) {
      var o = opts || {};
      var q = await sb.rpc('unpark_merch', { dep_id: String(depId), t_id: o.tourId || null });
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: false };
      if (out.ok && o.tourId) { try { await refetch(); } catch (e) {   } }
      return out;
    },
    depositUndoReady: function () { return undo0188 === true; },
    depositUndoProbe: function () {
      if (undo0188 !== null) return Promise.resolve(undo0188);
      if (!undoProbe && Date.now() - undoProbeFailed < 60e3) return Promise.resolve(null);
      if (!undoProbe) {
        undoProbe = sb.rpc('deposits_logged').then(function (q) {
          undo0188 = !q.error ? true : fnMissing(q.error) ? false : null;
          if (!q.error) depositsLoggedCache = Array.isArray(q.data) ? q.data : [];
          if (undo0188 === null) undoProbeFailed = Date.now();
          undoProbe = null;
          return undo0188;
        }, function () { undoProbe = null; undoProbeFailed = Date.now(); return null; });
      }
      return undoProbe;
    },
    depositsLogged: async function () {
      var q = await sb.rpc('deposits_logged');
      if (q.error) { if (fnMissing(q.error)) { undo0188 = false; return null; } throw mapError(q.error); }
      undo0188 = true;
      depositsLoggedCache = Array.isArray(q.data) ? q.data : [];
      return depositsLoggedCache;
    },
    depositsLoggedNow: function () { return depositsLoggedCache; },
    undoDeposit: async function (depId, opts) {
      var o = opts || {};
      var q = await sb.rpc('undo_deposit', { dep_id: String(depId), t_id: o.tourId || null });
      if (q.error) { if (fnMissing(q.error)) { undo0188 = false; return { ok: false, why: 'missing' }; } throw mapError(q.error); }
      var out = isObj(q.data) ? q.data : { ok: false };
      if (out.ok) { depositsLoggedCache = null; try { await refetch(); } catch (e) {   } }
      return out;
    },
    merchDepositState: async function (tourId, showId) {
      var q = await sb.rpc('merch_deposit_state', { t_id: String(tourId), s_id: String(showId) });
      if (q.error) { if (fnMissing(q.error)) { undo0188 = false; return null; } throw mapError(q.error); }
      return isObj(q.data) ? q.data : null;
    },
    editMerchDeposit: async function (tourId, showId, amount, landed) {
      var q = await sb.rpc('edit_merch_deposit', { t_id: String(tourId), s_id: String(showId),
        amount: typeof amount === 'number' && amount > 0 ? Math.round(amount * 100) / 100 : null, landed: landed || null });
      if (q.error) { if (fnMissing(q.error)) { undo0188 = false; return { ok: false, why: 'missing' }; } throw mapError(q.error); }
      var out = isObj(q.data) ? q.data : { ok: false };
      if (out.ok) { depositsLoggedCache = null; try { await refetch(); } catch (e) {   } }
      return out;
    },
    unparkGuarantee: async function (depId, opts) {
      var o = opts || {};
      var q = await sb.rpc('unpark_guarantee', { dep_id: String(depId), t_id: o.tourId || null });
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: false };
      if (out.ok && o.tourId) { try { await refetch(); } catch (e) {   } }
      return out;
    },
    followArtist: async function (artistId) {
      var q = await sb.from('artist_follows').upsert({ user_id: session.user.id, artist_id: artistId },
        { onConflict: 'user_id,artist_id', ignoreDuplicates: true });
      if (q.error) throw mapError(q.error);
    },
    unfollowArtist: async function (artistId) {
      var q = await sb.from('artist_follows').delete().eq('user_id', session.user.id).eq('artist_id', artistId);
      if (q.error) throw mapError(q.error);
    },
    artistCard: async function (id) {
      var q = await sb.rpc('artist_card', { a_id: id });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    artistHandleFree: async function (h, forArtist) {
      var q = await sb.rpc('artist_handle_free', { h: String(h || ''), for_artist: forArtist || null });
      if (q.error) throw mapError(q.error);
      return q.data === true;
    },
    createArtist: async function (a) {
      var id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : null;
      var row = { owner_id: session.user.id, handle: String(a.handle || '').trim().toLowerCase(),
        name: String(a.name || '').trim().slice(0, 60), avatar: String(a.avatar || '').slice(0, 120000) };
      if (id) row.id = id;
      var q = await sb.from('artists').insert(row).select('id').single();
      if (q.error) {
        if (q.error.code === '23505') { var taken = new Error('taken'); taken.code = 'taken'; throw taken; }
        if (q.error.code === '23514') { var bad = new Error('shape'); bad.code = 'shape'; throw bad; }
        throw mapError(q.error);
      }
      return q.data.id;
    },
    saveArtist: async function (id, patch) {
      var row = {};
      if (patch.name != null) row.name = String(patch.name).trim().slice(0, 60);
      if (patch.handle != null) row.handle = String(patch.handle).trim().toLowerCase();
      if (patch.bio != null) row.bio = String(patch.bio).slice(0, 300);
      if (patch.avatar != null) row.avatar = String(patch.avatar).slice(0, 120000);
      var q = await sb.from('artists').update(row).eq('id', id);
      if (q.error) {
        if (q.error.code === '23505') { var taken = new Error('taken'); taken.code = 'taken'; throw taken; }
        if (q.error.code === '23514') { var bad = new Error('shape'); bad.code = 'shape'; throw bad; }
        throw mapError(q.error);
      }
    },
    deleteArtist: async function (id) {
      var q = await sb.from('artists').delete().eq('id', id);
      if (q.error) throw mapError(q.error);
    },
    addArtistMember: async function (id, userId, kind) {
      var q = await sb.from('artist_members').upsert({ artist_id: id, user_id: userId, kind: kind === 'crew' ? 'crew' : 'band' },
        { onConflict: 'artist_id,user_id' });
      if (q.error && /former_member/.test(String(q.error.message || ''))) throw err('former_member');
      if (q.error) throw mapError(q.error);
    },
    askToList: async function (artistId, userId, kind) {
      var k = kind === 'crew' ? 'crew' : 'band';
      var q = await sb.rpc('ask_to_list', { a_id: artistId, u_id: userId, k: k });
      if (q.error && fnMissing(q.error)) {
        var u = await sb.from('artist_members').upsert({ artist_id: artistId, user_id: userId, kind: k }, { onConflict: 'artist_id,user_id' });
        if (u.error && /former_member/.test(String(u.error.message || ''))) return { ok: false, why: 'former_member' };
        if (u.error) throw mapError(u.error);
        return { ok: true, listed: true, kind: k };
      }
      if (q.error && /former_member/.test(String(q.error.message || ''))) return { ok: false, why: 'former_member' };
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    listAsksSent: async function (artistId) {
      var q = await sb.rpc('list_asks_sent', { a_id: artistId });
      if (q.error && fnMissing(q.error)) return [];
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    withdrawListAsk: async function (artistId, userId) {
      var q = await sb.rpc('withdraw_list_ask', { a_id: artistId, u_id: userId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    myListAsks: async function () {
      var q = await sb.rpc('my_list_asks');
      if (q.error && fnMissing(q.error)) return [];
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    answerListAsk: async function (artistId, yes) {
      var q = await sb.rpc('answer_list_ask', { a_id: artistId, accept: !!yes });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    removeArtistMember: async function (id, userId) {
      var q = await sb.rpc('end_artist_member', { a_id: id, u_id: userId, on_day: localDay() });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: true };
    },
    seatRulesOn: function () {
      if (srKnown === null) srProbe();
      return srKnown === true;
    },
    seatRules: async function (id) {
      var q = await sb.rpc('artist_seat_rules_get', { a_id: id });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? { membersManage: q.data.membersManage !== false, leaversKeep: q.data.leaversKeep !== false } : null;
    },
    setSeatRules: async function (id, rules) {
      var r = isObj(rules) ? rules : {};
      var q = await sb.rpc('artist_seat_rules_set', { a_id: id, manage_tours: r.membersManage !== false, keep_seats: r.leaversKeep !== false });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? { membersManage: q.data.membersManage !== false, leaversKeep: q.data.leaversKeep !== false } : null;
    },
    memberRemovalAsks: async function () {
      var q = await sb.rpc('member_removal_asks');
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    answerMemberRemoval: async function (id, userId, agree) {
      var q = await sb.rpc('answer_member_removal', { a_id: id, u_id: userId, agree: !!agree, on_day: localDay() });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    cancelMemberRemoval: async function (id, userId) {
      var q = await sb.rpc('cancel_member_removal', { a_id: id, u_id: userId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    findPeople: async function (text) {
      var q = await sb.rpc('find_people', { q: String(text || '') });
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    findArtists: async function (text) {
      var t = String(text || '');
      var low = t.trim().replace(/^@+/, '').toLowerCase();
      var solid = low.replace(/[^a-z0-9]+/g, '');
      var asks = [sb.rpc('find_artists', { q: t })];
      if (solid.length >= 2 && solid !== low) {
        asks.push(sb.rpc('find_artists', { q: solid }).then(function (q2) { return q2; }, function () { return null; }));
      }
      var out = await Promise.all(asks);
      if (out[0].error) throw mapError(out[0].error);
      var rows = Array.isArray(out[0].data) ? out[0].data : [];
      var seen = {};
      rows.forEach(function (a) { if (a && a.id) seen[a.id] = true; });
      (out[1] && !out[1].error && Array.isArray(out[1].data) ? out[1].data : []).forEach(function (a) {
        if (a && a.id && !seen[a.id]) { seen[a.id] = true; rows.push(a); }
      });
      return rows;
    },
    findTours: async function (text) {
      var q = await sb.rpc('find_tours', { q: String(text || '') });
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    artistTourCard: async function (artistId, tourId) {
      var q = await sb.rpc('artist_tour_card', { a_id: artistId, t_id: tourId });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : null;
    },
    dmThreads: async function () {
      var q = await sb.rpc('dm_threads');
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    dmThread: async function (otherId) {
      var me = session.user.id;
      var q = await sb.from('dms').select('id, sender, recipient, body, created_at, read_at')
        .or('and(sender.eq.' + me + ',recipient.eq.' + otherId + '),and(sender.eq.' + otherId + ',recipient.eq.' + me + ')')
        .order('created_at', { ascending: false }).limit(200);
      if (q.error) throw mapError(q.error);
      return (q.data || []).reverse().map(function (m) {
        return { id: m.id, mine: m.sender === me, body: m.body, at: m.created_at, read: !!m.read_at };
      });
    },
    dmSend: async function (otherId, body) {
      var q = await sb.from('dms').insert({ sender: session.user.id, recipient: otherId, body: String(body || '').trim().slice(0, 2000) })
        .select('id');
      if (q.error) throw mapError(q.error);
      return (Array.isArray(q.data) && q.data[0] && q.data[0].id) || null;
    },
    dmRead: async function (otherId) {
      var q = await sb.rpc('dm_read', { other: otherId });
      if (q.error) throw mapError(q.error);
    },
    dmWatch: function (fn) { dmListeners.push(fn); },
    modOn: function () {
      if (modKnown !== null && session && modUser && modUser !== session.user.id) { modKnown = null; modBlocks = []; modEnded = false; }
      if (modKnown === null) modProbe();
      return modKnown === true;
    },
    myBlocks: function () { return modKnown === true ? modBlocks.slice() : []; },
    isBlocked: function (uid) {
      return modKnown === true && !!uid && modBlocks.some(function (b) { return b.userId === uid; });
    },
    accessEnded: function () { return modKnown === true && modEnded; },
    refreshBlocks: function () { return modProbe(true).then(function () { return modBlocks.slice(); }); },
    blockUser: async function (uid) {
      if (!sb || !session || !uid) throw err('unavailable');
      var q = await sb.rpc('block_user', { u: uid });
      if (q.error) throw fnMissing(q.error) ? err('unavailable') : mapError(q.error);
      if (isObj(q.data) && q.data.ok === false) throw err(q.data.why === 'many' ? 'too-many' : 'unavailable');
      await modProbe(true);
      scheduleRefetch();
      dmChanged();
      return true;
    },
    unblockUser: async function (uid) {
      if (!sb || !session || !uid) throw err('unavailable');
      var q = await sb.rpc('unblock_user', { u: uid });
      if (q.error) throw fnMissing(q.error) ? err('unavailable') : mapError(q.error);
      await modProbe(true);
      scheduleRefetch();
      dmChanged();
      return true;
    },
    reportContent: async function (kind, ref, reason, words) {
      if (!sb || !session) throw err('unavailable');
      var q = await sb.rpc('report_content', { k: String(kind || ''), r: String(ref == null ? '' : ref),
        why: String(reason || ''), said: String(words || '').trim().slice(0, 500) });
      if (q.error) throw fnMissing(q.error) ? err('unavailable') : mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false, why: 'unavailable' };
    },
    reportsList: async function () {
      if (!sb || !session) return null;
      try {
        var q = await sgLimit(sb.rpc('reports_list'), 20000);
        return q.error || !isObj(q.data) ? null : q.data;
      } catch (e) { return null; }
    },
    reportSet: async function (id, act) {
      if (!sb || !session) throw err('unavailable');
      var q = await sb.rpc('report_set', { r_id: id, act: String(act || '') });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    reportPhoto: async function (id) {
      if (!sb || !session || !id) return '';
      try {
        var q = await sgLimit(sb.rpc('report_photo', { r_id: id }), 20000);
        return !q.error && typeof q.data === 'string' && /^(data:image\/|https:\/\/)/.test(q.data) ? q.data : '';
      } catch (e) { return ''; }
    },
    accessSet: async function (uid, ended, why) {
      if (!sb || !session) throw err('unavailable');
      var q = await sb.rpc('access_set', { u: uid, ended: !!ended, why: String(why || '').slice(0, 300) });
      if (q.error) throw mapError(q.error);
      return isObj(q.data) ? q.data : { ok: false };
    },
    contactOf: async function (userId) {
      if (ctKnown !== false) {
        var c = await sb.rpc('contact_of', { u: userId });
        if (!c.error) {
          ctKnown = true;
          var d = isObj(c.data) ? c.data : {};
          return { phone: String(d.phone || ''), email: String(d.email || '') };
        }
        if (!fnMissing(c.error)) throw mapError(c.error);
        ctKnown = false;
      }
      var q = await sb.from('profiles').select('phone, email').eq('user_id', userId).maybeSingle();
      if (q.error) throw mapError(q.error);
      return { phone: q.data ? String(q.data.phone || '') : '', email: q.data ? String(q.data.email || '') : '' };
    },
    crew: async function (tourId) {
      if (!session) throw err('unavailable');
      var sinceP = ssKnown === false ? Promise.resolve(null)
        : Promise.resolve(sb.rpc('seats_since', { t_id: tourId })).catch(function () { return null; });
      var contactsP = ctKnown === false ? Promise.resolve(null)
        : Promise.resolve(sb.rpc('crew_contacts', { t_id: tourId })).catch(function () { return null; });
      var mq = await sb.from('members')
        .select('invited_email, role, user_id, display_name, phone, tour_role, overrides, manager, created_at')
        .eq('tour_id', tourId).order('created_at');
      if (mq.error) throw mapError(mq.error);
      var rows = mq.data || [];
      var doc = cache.tours.get(tourId);
      var ownerId = doc ? doc._ownerId : null;
      var ids = rows.map(function (r) { return r.user_id; }).filter(Boolean);
      if (ownerId) ids.push(ownerId);
      var byId = {};
      if (ids.length) {
        var pq = await sb.from('profiles')
          .select('user_id, full_name, username, email, phone, tour_role').in('user_id', ids);
        (pq.data || []).forEach(function (x) { byId[x.user_id] = x; });
      }
      var since = {}, sq = await sinceP;
      if (sq && sq.error) { if (fnMissing(sq.error)) ssKnown = false; }
      else if (sq && isObj(sq.data)) { ssKnown = true; since = sq.data; }
      var contacts = {}, cq = await contactsP;
      if (cq && cq.error) { if (fnMissing(cq.error)) ctKnown = false; }
      else if (cq && isObj(cq.data)) { ctKnown = true; contacts = cq.data; }
      var reach = function (id) { return id && isObj(contacts[id]) ? contacts[id] : {}; };
      var out = [];
      if (ownerId) {
        var op = byId[ownerId] || {}, oc = reach(ownerId);
        out.push({
          owner: true, role: 'owner', userId: ownerId,
          name: op.full_name || '', username: op.username || '',
          email: oc.email || op.email || (ownerId === (session && session.user && session.user.id) ? session.user.email : ''),
          phone: oc.phone || op.phone || '', tourRole: roleName(op.tour_role), joined: true
        });
      }
      rows.forEach(function (r) {
        var pr = byId[r.user_id] || {}, pc = reach(r.user_id);
        var base = {
          email: pc.email || pr.email || r.invited_email,
          phone: pc.phone || pr.phone || r.phone || '',
          tourRole: roleName(pr.tour_role || r.tour_role)
        };
        var ov = isObj(r.overrides) ? r.overrides : {};
        out.push({
          owner: false, role: r.role, manager: !!r.manager && r.role === 'editor', userId: r.user_id || null,
          name: pr.full_name || r.display_name || '',
          username: pr.username || '',
          email: ov.email || base.email,
          invitedEmail: r.invited_email,
          phone: ov.phone || base.phone,
          tourRole: ov.tourRole || base.tourRole,
          base: base,
          titles: [ov.tourRole, pr.tour_role, r.tour_role].filter(Boolean).map(roleName),
          joined: !!r.user_id,
          addedAt: (r.user_id && typeof since[r.user_id] === 'string' && since[r.user_id]) || r.created_at || null,
          addedSure: !!(r.user_id && typeof since[r.user_id] === 'string' && since[r.user_id])
        });
      });
      return out;
    },
    ovProbeAnswered: function (which) {
      if (which === 'bus') return busKnown !== null;
      if (which === 'supplies') return supplyKnown !== null;
      return true;
    },
    setUsername: async function (name) {
      var clean = String(name || '').trim().slice(0, 24);
      var q = await sb.auth.updateUser({ data: { username: clean } });
      if (q.error) throw mapError(q.error);
      if (q.data && q.data.user && session) session.user = q.data.user;
    },
    myRole: async function (tourId) {
      var doc = cache.tours.get(tourId);
      if (doc && session && doc._ownerId === session.user.id) return 'owner';
      if (doc && doc.kind === 'offtour') return 'editor';
      var q = await sb.from('members').select('role')
        .eq('tour_id', tourId).eq('user_id', session ? session.user.id : '').maybeSingle();
      if (q.error) throw mapError(q.error);
      return (q.data && q.data.role) || 'viewer';
    },
    ownsTour: function (tourId) {
      var doc = cache.tours.get(tourId);
      return !!(doc && session && doc._ownerId === session.user.id);
    },
    members: async function (tourId) {
      var q = await sb.from('members').select('invited_email, role, user_id, display_name, manager')
        .eq('tour_id', tourId).order('created_at');
      if (q.error) throw mapError(q.error);
      return q.data;
    },
    ariSay: async function (tourId, prompt, images) {
      var out = await callRead(prompt, { images: images || undefined, ariTour: tourId });
      scheduleRefetch();
      return out.text;
    },
    ariKick: async function (tourId) {
      try {
        var tz = '';
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {   }
        await callFn('ari', { method: 'POST', body: JSON.stringify({ tourId: tourId, tz: tz }) });
      } catch (e) {   }
    },
    atvenuRefresh: async function (tourId, showId) {
      var r = await callFn('atvenu', { method: 'POST',
        body: JSON.stringify({ action: 'refresh', tourId: tourId, showId: showId || undefined }) });
      var out = {};
      try { out = await r.json(); } catch (e) { out = {}; }
      if (out && out.ok) { try { await refetch(); } catch (e) {   } }
      return out;
    },
    tourMailbox: async function (tourId) {
      var q = await sb.rpc('tour_mailbox', { t_id: tourId });
      if (q.error) throw mapError(q.error);
      return String(q.data || '');
    },
    pastCrew: async function () {
      var q = await sb.from('past_crew').select('email, name, phone, role, tour_role').order('name');
      if (q.error) throw mapError(q.error);
      return (q.data || []).map(function (r) { return Object.assign({}, r, { tourRole: roleName(r.tour_role) }); });
    },
    forgetPastCrew: async function (email) {
      var q = await sb.from('past_crew').delete().eq('email', String(email).toLowerCase());
      if (q.error) throw mapError(q.error);
    },
    invite: async function (tourId, email, role, name, phone, extra) {
      var addr = String(email).trim().toLowerCase();
      var x = extra || {};
      var full = String(name || '').trim();
      var first = String(x.first || full.split(/\s+/)[0] || '').trim();
      var last = String(x.last || full.split(/\s+/).slice(1).join(' ') || '').trim();
      var tourRole = String(x.tourRole || '').trim().slice(0, 40);
      var mgr = role === 'manager';
      if (mgr) role = 'editor';
      var row = {
        tour_id: tourId,
        invited_email: addr,
        role: role === 'editor' ? 'editor' : 'viewer',
        display_name: String(name || '').trim().slice(0, 60),
        phone: String(phone || '').trim().slice(0, 30),
        tour_role: tourRole
      };
      if (mgr) row.manager = true;
      if (x.ridesBus === false) row.rides_bus = false;
      var al = await sb.rpc('allow_signup', { addr: addr, note: tourRole });
      if (al.error) throw /page first/i.test(String(al.error.message || '')) ? err('page-first') : knownError(al.error);
      var q = await sb.from('members').upsert(row);
      if (q.error && row.rides_bus === false && columnMissing(q.error)) {
        delete row.rides_bus;
        q = await sb.from('members').upsert(row);
      }
      if (q.error) throw knownError(q.error);
      try {
        await sb.from('past_crew').upsert({
          owner_id: session.user.id, email: addr,
          name: String(name || '').trim().slice(0, 60),
          phone: String(phone || '').trim().slice(0, 30),
          role: role === 'editor' ? 'editor' : 'viewer',
          tour_role: tourRole,
          updated_at: new Date().toISOString()
        });
      } catch (e) {   }
      try {
        var r = await callFn('invite', {
          method: 'POST',
          body: JSON.stringify({ tourId: tourId, email: addr, name: full, first: first, last: last,
            tourRole: tourRole, phone: String(phone || '').trim(), access: role === 'editor' ? 'editor' : 'viewer' })
        });
        var out = await r.json();
        return out && out.status ? out.status : 'nomail';
      } catch (e) { return 'nomail'; }
    },
    editMember: async function (tourId, email, access, overrides) {
      var q = await sb.rpc('edit_member', { t_id: tourId, addr: email, new_access: access, ov: overrides || {} });
      if (q.error) throw mapError(q.error);
    },
    kickMember: async function (tourId, email) {
      var q = await sb.rpc('kick_member', { t_id: tourId, addr: email });
      if (q.error) throw mapError(q.error);
    },
    uninvite: async function (tourId, email) {
      var q = await sb.from('members').delete()
        .eq('tour_id', tourId).eq('invited_email', email).select('invited_email');
      if (q.error) throw mapError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
    },
    allowSignup: async function (addr, note) {
      var q = await sb.rpc('allow_signup', { addr: String(addr || ''), note: String(note || '') });
      if (q.error) throw (/page first/i.test(String(q.error.message || '')) ? err('page-first') : knownError(q.error));
      return isObj(q.data) ? q.data : { ok: false };
    },
    deleteAccount: async function () {
      var q = await sb.rpc('delete_my_account');
      if (q.error) throw mapError(q.error);
      var out = isObj(q.data) ? q.data : { ok: false };
      if (out.ok) {
        try { Object.keys(localStorage).forEach(function (k) { if (/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k); }); } catch (e) {   }
        setTimeout(function () { location.reload(); }, 900);
      }
      return out;
    },
    roadTiers: async function (tourId) {
      var q = await sb.rpc('road_tiers', { t_id: tourId });
      if (q.error) throw mapError(q.error);
      return Array.isArray(q.data) ? q.data : [];
    },
    uid: function () { return session && session.user ? session.user.id : null; },
    pollFor: function (tourId, date) {
      var p = cache.polls.filter(function (x) { return x.tour_id === tourId && x.date === date; })[0];
      return p ? { date: p.date, options: Array.isArray(p.options) ? p.options : [], closesAt: p.closes_at, createdAt: p.created_at } : null;
    },
    votesFor: function (tourId, date) {
      return cache.votes.filter(function (v) { return v.tour_id === tourId && v.date === date; })
        .map(function (v) { return { userId: v.user_id, choice: v.choice, name: v.name }; });
    },
    requestsFor: function (tourId, date) {
      return cache.requests.filter(function (r) { return r.tour_id === tourId && r.date === date; })
        .map(function (r) { return { id: r.id, body: r.body, author: r.author, mine: !!session && r.added_by === session.user.id,
          status: r.status || 'pending', at: r.created_at }; });
    },
    savePoll: async function (tourId, date, options, closesAt) {
      var q = await sb.from('day_polls').upsert({ tour_id: tourId, date: date, options: options, closes_at: closesAt },
        { onConflict: 'tour_id,date' });
      if (q.error) throw mapError(q.error);
      await refetch();
    },
    deletePoll: async function (tourId, date) {
      var q = await sb.from('day_polls').delete().eq('tour_id', tourId).eq('date', date);
      if (q.error) throw mapError(q.error);
      await refetch();
    },
    vote: async function (tourId, date, choice) {
      var q = await sb.from('day_votes').upsert({ tour_id: tourId, date: date, user_id: session.user.id, choice: choice },
        { onConflict: 'tour_id,date,user_id' });
      if (q.error) throw mapError(q.error);
      await refetch();
    },
    addRequest: async function (tourId, date, body) {
      var q = await sb.from('day_requests').insert({ id: newRowId(), tour_id: tourId, date: date, body: String(body || '').trim().slice(0, 300) });
      if (q.error && q.error.code !== '23505') throw mapError(q.error);
      await refetch();
    },
    answerRequest: async function (id, status) {
      var q = await sb.from('day_requests').update({ status: status }).eq('id', id).select('id');
      if (q.error) throw mapError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
      await refetch();
    },
    deleteRequest: async function (id) {
      var q = await sb.from('day_requests').delete().eq('id', id).select('id');
      if (q.error) throw mapError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
      await refetch();
    },
    facesFor: function (tourId) {
      var c = faceCache[tourId];
      if ((!c || Date.now() - c.at > 300e3) && !faceAsk[tourId]) {
        faceAsk[tourId] = sb.rpc('tour_faces', { t_id: tourId }).then(function (q) {
          var ok = !q.error && isObj(q.data);
          faceCache[tourId] = { data: ok ? q.data : (c ? c.data : {}), at: ok ? Date.now() : Date.now() - 270e3 };
        }, function () {
          faceCache[tourId] = { data: c ? c.data : {}, at: Date.now() - 270e3 };
        }).then(function () { delete faceAsk[tourId]; emit('tours'); });
      }
      return c ? c.data : {};
    },
    checkedIn: function (tourId, date) {
      return cache.checkins.some(function (x) { return x.tour_id === tourId && x.day === date; });
    },
    checkIn: async function (tourId, date) {
      var q = await sb.rpc('check_in', { t_id: tourId, d: date });
      if (q.error) throw mapError(q.error);
      if (!cache.checkins.some(function (x) { return x.tour_id === tourId && x.day === date; })) cache.checkins.push({ tour_id: tourId, day: date });
      emit('tours');
    },
    busOn: function () {
      if (busKnown === null) busProbe();
      return busKnown === true;
    },
    busList: function (tourId, fresh) {
      if (busKnown !== true) return null;
      var c = busCache[tourId], day = busDay();
      if (!c || c.stale || fresh || c.day !== day || Date.now() - c.at > FLOWERS_FRESH) loadBus(tourId);
      return c && c.day === day ? c.data : null;
    },
    busSet: async function (tourId, state) {
      if (!session) throw err('unavailable');
      var st = state === 'on' ? 'on' : 'off', day = busDay(), uid = session.user.id;
      var up = await sb.from('bus_checkins').update({ state: st })
        .eq('tour_id', tourId).eq('user_id', uid).eq('day', day).select('user_id');
      if (up.error) {
        if (tableMissing(up.error)) { busKnown = false; emit('tours'); throw err('unavailable'); }
        throw mapError(up.error);
      }
      if (!up.data || !up.data.length) {
        var ins = await sb.from('bus_checkins').insert({ tour_id: tourId, user_id: uid, day: day, state: st });
        if (ins.error && ins.error.code === '23505') {
          var again = await sb.from('bus_checkins').update({ state: st })
            .eq('tour_id', tourId).eq('user_id', uid).eq('day', day).select('user_id');
          if (again.error) throw mapError(again.error);
        } else if (ins.error) {
          if (tableMissing(ins.error)) { busKnown = false; emit('tours'); throw err('unavailable'); }
          throw mapError(ins.error);
        }
      }
      var c = busCache[tourId];
      if (c && c.day === day && c.data) (c.data.people || []).forEach(function (p) {
        if (p.userId === uid) { p.state = st; p.at = new Date().toISOString(); }
      });
      emit('tours');
    },
    buyoutsOn: function () {
      if (buyoutKnown === null) buyoutProbe();
      return buyoutKnown === true;
    },
    buyoutTracks: function (tourId, fresh) {
      if (buyoutKnown !== true) return null;
      var c = buyoutCache[tourId];
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadBuyouts(tourId);
      return c ? c.data : null;
    },
    buyoutTrack: async function (tourId, showId, userId) {
      if (!session) throw err('unavailable');
      var q = await sb.from('buyout_tracks').insert({ tour_id: tourId, show_id: showId, user_id: userId });
      if (q.error && q.error.code !== '23505') {
        if (tableMissing(q.error)) { buyoutKnown = false; emit('tours'); throw err('unavailable'); }
        throw mapError(q.error);
      }
      var c = buyoutCache[tourId];
      if (c && c.data && !c.data.some(function (r) { return r.showId === showId && r.userId === userId; })) {
        c.data.push({ showId: showId, userId: userId, at: new Date().toISOString() });
      }
      emit('tours');
    },
    buyoutUntrack: async function (tourId, showId, userId) {
      if (!session) throw err('unavailable');
      var q = await sb.from('buyout_tracks').delete()
        .eq('tour_id', tourId).eq('show_id', showId).eq('user_id', userId).select('user_id');
      if (q.error) {
        if (tableMissing(q.error)) { buyoutKnown = false; emit('tours'); throw err('unavailable'); }
        throw mapError(q.error);
      }
      var off = Array.isArray(q.data) && q.data.length > 0, c = buyoutCache[tourId];
      if (c && c.data) {
        if (off) c.data = c.data.filter(function (r) { return !(r.showId === showId && r.userId === userId); });
        else { c.stale = true; buyoutGen[tourId] = (buyoutGen[tourId] || 0) + 1; }
      }
      emit('tours');
      return off;
    },
    buyoutAsksOn: function () {
      if (boAskKnown === null) boAskProbe();
      return boAskKnown === true;
    },
    buyoutAsks: function (tourId, fresh) {
      if (boAskKnown !== true) return null;
      var c = boAskCache[tourId];
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadBoAsks(tourId);
      return c ? c.data : null;
    },
    buyoutAskSend: async function (tourId, showId) {
      if (!session) throw err('unavailable');
      var q = await sb.from('buyout_asks').insert({ tour_id: tourId, show_id: showId });
      if (q.error) {
        if (tableMissing(q.error)) { boAskKnown = false; emit('tours'); throw err('unavailable'); }
        throw mapError(q.error);
      }
      var c = boAskCache[tourId], me = session.user.id;
      if (c && c.data) c.data.push({ showId: showId, userId: me, at: new Date().toISOString() });
      emit('tours');
    },
    buyoutMarkMineOn: function () {
      if (boSelfKnown === null) boSelfProbe();
      return boSelfKnown === true;
    },
    buyoutMarkMine: async function (tourId, showId) {
      if (!session) return { ok: false, why: 'signed_out' };
      var q = await sb.rpc('buyout_mark_mine', { t_id: String(tourId), s_id: String(showId) });
      if (q.error) {
        if (fnMissing(q.error)) { boSelfKnown = false; emit('tours'); return { ok: false, why: 'missing' }; }
        throw mapError(q.error);
      }
      boSelfKnown = true;
      var out = isObj(q.data) ? q.data : { ok: false, why: 'not_owed' };
      if (out.ok) {
        var me = session.user.id, c = buyoutCache[tourId], a = boAskCache[tourId];
        if (c && c.data && !c.data.some(function (r) { return r.showId === showId && r.userId === me; })) {
          c.data.push({ showId: showId, userId: me, at: new Date().toISOString(), self: !out.already });
          if (out.already) { c.stale = true; buyoutGen[tourId] = (buyoutGen[tourId] || 0) + 1; }
        }
        if (a && a.data) a.data = a.data.filter(function (r) { return !(r.showId === showId && r.userId === me); });
        emit('tours');
      }
      return out;
    },
    cityEventsOn: function () {
      if (cityEvKnown === null) cityEvProbe();
      return cityEvKnown === true;
    },
    cityEventsAsk: async function (tourId, showId) {
      if (!session) throw err('unavailable');
      var q = await sb.rpc('city_events_ask', { t_id: tourId, s_id: showId });
      if (q.error) {
        if (fnMissing(q.error)) { cityEvKnown = false; emit('tours'); throw err('unavailable'); }
        throw mapError(q.error);
      }
      return isObj(q.data) ? q.data : null;
    },
    cityEventsTake: async function (reqId, tourId, showId) {
      if (!session) throw err('unavailable');
      var q = await sb.rpc('city_events_take', { req_id: reqId, t_id: tourId, s_id: showId });
      if (q.error) {
        if (fnMissing(q.error)) { cityEvKnown = false; emit('tours'); throw err('unavailable'); }
        throw mapError(q.error);
      }
      return isObj(q.data) ? q.data : null;
    },
    venueHistoryOn: function () {
      if (vhKnown === null) vhProbe();
      return vhKnown === true;
    },
    venueHistory: function (tourId, showId, sig, fresh) {
      if (vhKnown !== true || !session || !tourId || !showId) return null;
      sig = String(sig || '');
      var c = vhCache[tourId + '|' + showId], same = !!c && c.sig === sig;
      if (!same || fresh || Date.now() - c.at > VH_FRESH) loadVenueHistory(tourId, showId, sig);
      return same ? c.data : null;
    },
    followSpotsOn: function () {
      if (fsKnown === null) fsProbe();
      return fsKnown === true;
    },
    followSpots: function (near, fresh) {
      if (fsKnown !== true || !session) return null;
      var k = String(near || '').split(',')[0].toLowerCase().replace(/\s+/g, ' ').trim();
      if (!k) return null;
      var c = fsCache[k];
      if (!c || fresh || Date.now() - c.at > FS_FRESH) loadFollowSpots(k, near);
      return c ? c.data : null;
    },
    personChecksOn: function () {
      if (pcKnown === null) pcProbe();
      return pcKnown === true;
    },
    personChecked: function (uid) {
      var c = uid ? pcCache[String(uid).toLowerCase()] : null;
      return c && Date.now() - c.at <= PC_FRESH ? c.on : undefined;
    },
    personChecks: function (uids) {
      return pcFor(uids);
    },
    flyersOn: function () {
      if (flyerKnown === null) flyerProbe();
      return flyerKnown === true;
    },
    tourFlyers: function (artistId, fresh) {
      if (flyerKnown !== true) return null;
      var c = flyerCache[artistId];
      if (!c || c.stale || fresh || Date.now() - c.at > FLYER_FRESH) loadFlyers(artistId);
      return c ? c.data : null;
    },
    flyerPut: async function (artistId, gk, file) {
      if (!session) throw err('unavailable');
      var ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[file && file.type] || 'jpg';
      var path = artistId + '/' + flyerKey(gk) + '.' + ext;
      var up = await sb.storage.from('flyers').upload(path, file,
        { upsert: true, contentType: (file && file.type) || 'image/jpeg', cacheControl: '3600' });
      if (up.error) throw mapError(up.error);
      var pub = sb.storage.from('flyers').getPublicUrl(path);
      var url = ((pub && pub.data && pub.data.publicUrl) || '') + '?v=' + Date.now();
      var row = { url: url, source_url: null, added_by: session.user.id };
      var up2 = await sb.from('artist_tour_flyers').update(row)
        .eq('artist_id', artistId).eq('gk', gk).select('gk');
      if (up2.error) {
        if (tableMissing(up2.error)) { flyerKnown = false; emit('tours'); throw err('unavailable'); }
        throw mapError(up2.error);
      }
      if (!up2.data || !up2.data.length) {
        var ins = await sb.from('artist_tour_flyers').insert({ artist_id: artistId, gk: gk, url: url, added_by: session.user.id });
        if (ins.error && ins.error.code === '23505') {
          var again = await sb.from('artist_tour_flyers').update(row)
            .eq('artist_id', artistId).eq('gk', gk).select('gk');
          if (again.error) throw mapError(again.error);
        } else if (ins.error) {
          if (tableMissing(ins.error)) { flyerKnown = false; emit('tours'); throw err('unavailable'); }
          throw mapError(ins.error);
        }
      }
      var c = flyerCache[artistId];
      if (c && c.data) c.data[gk] = { url: url, sourceUrl: '' };
      emit('tours');
      return url;
    },
    flyerDrop: async function (artistId, gk) {
      if (!session) throw err('unavailable');
      var q = await sb.from('artist_tour_flyers').delete().eq('artist_id', artistId).eq('gk', gk);
      if (q.error) {
        if (tableMissing(q.error)) { flyerKnown = false; emit('tours'); throw err('unavailable'); }
        throw mapError(q.error);
      }
      var fk = flyerKey(gk);
      try {
        await sb.storage.from('flyers').remove(['jpg', 'png', 'webp', 'gif'].map(function (x) { return artistId + '/' + fk + '.' + x; }));
      } catch (e) {   }
      var c = flyerCache[artistId];
      if (c && c.data) delete c.data[gk];
      emit('tours');
    },
    suppliesOn: function () {
      if (supplyKnown === null) supplyProbe();
      return supplyKnown === true;
    },
    supplies: function (tourId, fresh) {
      if (supplyKnown !== true) return null;
      var c = supplyCache[tourId];
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadSupplies(tourId);
      return c ? c.data : null;
    },
    suppliesHeld: function (tourId) {
      if (supplyKnown !== true) return null;
      var c = supplyCache[tourId];
      if (!c || c.stale) loadSupplies(tourId);
      return c ? c.data : null;
    },
    supplyAdd: async function (tourId, body) {
      if (!session) throw err('unavailable');
      var words = String(body == null ? '' : body).replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!words) throw err('unavailable');
      var q = await sb.from('tour_supplies')
        .insert({ tour_id: tourId, body: words, added_by: session.user.id })
        .select('id, created_at').single();
      if (q.error) {
        if (tableMissing(q.error)) { supplyKnown = false; emit('tours'); throw err('unavailable'); }
        throw supplySaid(q.error);
      }
      var c = supplyCache[tourId];
      if (c && c.data) c.data.push({ id: q.data.id, body: words, addedBy: session.user.id,
        doneAt: null, doneBy: null, at: q.data.created_at });
      emit('tours');
      return q.data.id;
    },
    supplyTick: async function (id, on) {
      if (!session) throw err('unavailable');
      var at = on ? new Date().toISOString() : null;
      var q = await sb.from('tour_supplies').update({ done_at: at }).eq('id', id).select('id');
      if (q.error) {
        if (tableMissing(q.error)) { supplyKnown = false; emit('tours'); throw err('unavailable'); }
        throw supplySaid(q.error);
      }
      if (!q.data || !q.data.length) throw err('permission');
      supplyRowPatch(id, function (r) { r.doneAt = at; r.doneBy = at ? session.user.id : null; });
      emit('tours');
    },
    supplySave: async function (id, body) {
      if (!session) throw err('unavailable');
      var words = String(body == null ? '' : body).replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!words) throw err('unavailable');
      var q = await sb.from('tour_supplies').update({ body: words }).eq('id', id).select('id');
      if (q.error) {
        if (tableMissing(q.error)) { supplyKnown = false; emit('tours'); throw err('unavailable'); }
        throw supplySaid(q.error);
      }
      if (!q.data || !q.data.length) throw err('permission');
      supplyRowPatch(id, function (r) { r.body = words; });
      emit('tours');
    },
    supplyDrop: async function (id) {
      if (!session) throw err('unavailable');
      var q = await sb.from('tour_supplies').delete().eq('id', id).select('id');
      if (q.error) {
        if (tableMissing(q.error)) { supplyKnown = false; emit('tours'); throw err('unavailable'); }
        throw supplySaid(q.error);
      }
      if (!q.data || !q.data.length) throw err('permission');
      Object.keys(supplyCache).forEach(function (k) {
        var c = supplyCache[k];
        if (c && c.data) c.data = c.data.filter(function (r) { return r.id !== id; });
      });
      emit('tours');
    },
    favoritesOn: function () {
      if (favKnown === null) favProbe();
      return favKnown === true;
    },
    favoritesOf: function (uid, fresh) {
      if (favKnown !== true || !uid) return null;
      var c = favCache[uid];
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadFavs(uid);
      return c ? c.data : null;
    },
    favAdd: async function (artistId, rank, info) {
      if (!session) throw err('unavailable');
      var uid = session.user.id, spot = Math.max(1, Math.min(10, Math.round(Number(rank) || 0)));
      var q = await sb.from('fan_favorites').insert({ user_id: uid, artist_id: artistId, rank: spot });
      if (q.error) {
        if (tableMissing(q.error)) { favKnown = false; emit('tours'); throw err('unavailable'); }
        if (q.error.code === '23505') { loadFavs(uid); throw err('unavailable'); }
        throw mapError(q.error);
      }
      var c = favCache[uid];
      if (c && c.data && !c.data.some(function (r) { return r.artistId === artistId; })) {
        c.data.push({ artistId: artistId, rank: spot, name: (info && info.name) || '',
          handle: (info && info.handle) || '', avatar: (info && info.avatar) || '' });
        c.data.sort(function (a, b) { return a.rank - b.rank; });
      }
      emit('tours');
    },
    favRemove: async function (artistId) {
      if (!session) throw err('unavailable');
      var uid = session.user.id;
      var q = await sb.from('fan_favorites').delete().eq('user_id', uid).eq('artist_id', artistId);
      if (q.error) {
        if (tableMissing(q.error)) { favKnown = false; emit('tours'); throw err('unavailable'); }
        throw mapError(q.error);
      }
      var c = favCache[uid];
      if (c && c.data) c.data = c.data.filter(function (r) { return r.artistId !== artistId; });
      emit('tours');
    },
    favSwap: async function (aId, bId) {
      if (!session) throw err('unavailable');
      var uid = session.user.id, c = favCache[uid];
      var a = c && c.data ? c.data.filter(function (r) { return r.artistId === aId; })[0] : null;
      var b = c && c.data ? c.data.filter(function (r) { return r.artistId === bId; })[0] : null;
      if (!a || !b) { loadFavs(uid); throw err('unavailable'); }
      var q = await sb.from('fan_favorites').upsert([
        { user_id: uid, artist_id: aId, rank: b.rank },
        { user_id: uid, artist_id: bId, rank: a.rank }
      ], { onConflict: 'user_id,artist_id' });
      if (q.error) {
        if (tableMissing(q.error)) { favKnown = false; emit('tours'); throw err('unavailable'); }
        if (q.error.code === '23505') { loadFavs(uid); throw err('unavailable'); }
        throw mapError(q.error);
      }
      var r = a.rank; a.rank = b.rank; b.rank = r;
      c.data.sort(function (x, y) { return x.rank - y.rank; });
      emit('tours');
    },
    topFans: function (artistId, fresh) {
      if (favKnown !== true || !artistId) return null;
      var c = topFanCache[artistId];
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadTopFans(artistId);
      return c ? c.data : null;
    },
    todosOn: function () {
      if (todoKnown === null) todoProbe();
      return todoKnown === true;
    },
    todoList: function (artistId, fresh) {
      if (todoKnown !== true) return null;
      var c = todoCache[artistId];
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadTodos(artistId);
      return c && c.data && c.data.can ? c.data.items : null;
    },
    todoInvites: function (artistId) {
      if (todoKnown !== true) return null;
      var c = todoCache[artistId];
      return c && c.data && c.data.can ? c.data.invites : null;
    },
    todoAdd: async function (artistId, cat, body, more) {
      if (!session) throw err('unavailable');
      var m = isObj(more) ? more : {};
      var row = { artist_id: artistId, cat: String(cat || 'other'),
        body: Array.from(String(body || '').trim()).slice(0, 300).join(''),
        assigned_to: m.assignedTo || null, due: m.due || null, created_by: session.user.id };
      var q = await sb.from('todo_items').insert(row).select(TODO_COLS).single();
      if (q.error) throw todoError(q.error);
      var c = todoCache[artistId];
      if (c && c.data && c.data.can) c.data.items.push(todoShape(q.data, c.data.names));
      todoStale(); emit('tours');
      return q.data.id;
    },
    todoSave: async function (id, patch) {
      if (!session) throw err('unavailable');
      var p = isObj(patch) ? patch : {}, row = {};
      if ('done' in p) row.done_at = p.done ? new Date().toISOString() : null;
      if ('body' in p) row.body = Array.from(String(p.body || '').trim()).slice(0, 300).join('');
      if ('cat' in p) row.cat = String(p.cat || 'other');
      if ('assignedTo' in p) row.assigned_to = p.assignedTo || null;
      if ('due' in p) row.due = p.due || null;
      var q = await sb.from('todo_items').update(row).eq('id', id).select(TODO_COLS);
      if (q.error) throw todoError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
      todoPutBack(q.data[0]);
      todoStale(); emit('tours');
    },
    todoDrop: async function (id) {
      if (!session) throw err('unavailable');
      var q = await sb.from('todo_items').delete().eq('id', id).select('id');
      if (q.error) throw todoError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
      Object.keys(todoCache).forEach(function (k) {
        var c = todoCache[k];
        if (c && c.data && c.data.items) c.data.items = c.data.items.filter(function (x) { return x.id !== id; });
      });
      if (myTodoCache && myTodoCache.data) myTodoCache.data = myTodoCache.data.filter(function (x) { return x.id !== id; });
      todoStale(); emit('tours');
    },
    todoInvite: async function (artistId, userId, name) {
      if (!session) throw err('unavailable');
      var q = await sb.from('todo_invites').insert({ artist_id: artistId, user_id: userId, invited_by: session.user.id });
      if (q.error && q.error.code !== '23505') throw todoError(q.error);
      var c = todoCache[artistId];
      if (c && c.data && c.data.can && !c.data.invites.some(function (v) { return v.userId === userId; })) {
        c.data.invites.push({ userId: userId, name: String(name || ''), invitedBy: session.user.id, at: new Date().toISOString() });
      }
      todoStale(); emit('tours');
    },
    todoUninvite: async function (artistId, userId) {
      if (!session) throw err('unavailable');
      var q = await sb.from('todo_invites').delete().eq('artist_id', artistId).eq('user_id', userId);
      if (q.error) throw todoError(q.error);
      var c = todoCache[artistId];
      if (c && c.data && c.data.invites) c.data.invites = c.data.invites.filter(function (v) { return v.userId !== userId; });
      todoStale(); emit('tours');
    },
    myTodos: function (fresh) {
      if (todoKnown !== true) return null;
      var c = myTodoCache;
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadMyTodos();
      return c ? c.data : null;
    },
    spotsOn: function () {
      if (spotKnown === null) spotProbe();
      return spotKnown === true;
    },
    mySpots: function (fresh) {
      if (spotKnown !== true) return null;
      var c = mySpotCache;
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadMySpots();
      return c ? c.data : null;
    },
    spotAdd: async function (p) {
      if (!session) throw err('unavailable');
      var row = spotRow(isObj(p) ? p : {});
      row.user_id = session.user.id;
      var q = await sb.from('local_spots').insert(row).select(spotCols()).single();
      if (q.error && spotGeoGone(q.error)) {
        row = spotRow(isObj(p) ? p : {});
        row.user_id = session.user.id;
        q = await sb.from('local_spots').insert(row).select(spotCols()).single();
      }
      if (q.error) throw spotError(q.error);
      if (mySpotCache && mySpotCache.data) mySpotCache.data.push(spotShape(q.data));
      spotsStale(); emit('tours');
      return q.data.id;
    },
    spotSave: async function (id, patch) {
      if (!session) throw err('unavailable');
      var row = spotRow(isObj(patch) ? patch : {});
      var write = function () {
        return Object.keys(row).length ? sb.from('local_spots').update(row).eq('id', id).select(spotCols())
          : sb.from('local_spots').select(spotCols()).eq('id', id);
      };
      var q = await write();
      if (q.error && spotGeoGone(q.error)) {
        row = spotRow(isObj(patch) ? patch : {});
        q = await write();
      }
      if (q.error) throw spotError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
      if (mySpotCache && mySpotCache.data) {
        mySpotCache.data = mySpotCache.data.map(function (x) { return x.id === id ? spotShape(q.data[0]) : x; });
      }
      spotsStale(); emit('tours');
    },
    spotDrop: async function (id) {
      if (!session) throw err('unavailable');
      var q = await sb.from('local_spots').delete().eq('id', id).select('id');
      if (q.error) throw spotError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
      if (mySpotCache && mySpotCache.data) mySpotCache.data = mySpotCache.data.filter(function (x) { return x.id !== id; });
      Object.keys(tourSpotCache).forEach(function (k) {
        var c = tourSpotCache[k];
        if (c && c.data) c.data = c.data.filter(function (x) { return x.id !== id; });
      });
      spotsStale(); emit('tours');
    },
    tourSpots: function (tourId, cityKey, fresh) {
      if (spotKnown !== true) return null;
      var k = tourId + '|' + String(cityKey || '');
      var c = tourSpotCache[k];
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadTourSpots(tourId, cityKey);
      return c ? c.data : null;
    },
    spotDetailsOn: function () {
      if (sdKnown === null) sdProbe();
      return sdKnown === true;
    },
    spotDetails: function (id, cb, face) {
      id = Number(id);
      if (!session || !(id > 0) || sdKnown === false) { cb(null); return; }
      var c = sdCache[id];
      if (c && c.done && Date.now() - c.at < SD_FRESH && (!c.data || !face || 'avatar' in c.data)) { cb(c.data); return; }
      if (c && c.busy) { c.cbs.push(cb); if (c.data) cb(c.data); return; }
      c = sdCache[id] = { data: c && c.data ? c.data : null, busy: true, done: false, at: 0, cbs: [cb] };
      var tell = function () { c.cbs.forEach(function (f) { try { f(c.data); } catch (e) {   } }); };
      var end = function (done) {
        c.busy = false; c.done = done; c.at = Date.now();
        if (c.data) c.data.waiting = false;
        tell(); c.cbs = [];
      };
      var looks = 0, busyTries = 0;
      var took = function (a) {
        if (!isObj(a) || a.none) { end(true); return; }
        var d = c.data || {};
        if (isObj(a.spot)) {
          var sp = a.spot;
          d.spot = { id: id, lat: typeof sp.lat === 'number' ? sp.lat : null, lon: typeof sp.lon === 'number' ? sp.lon : null,
            address: String(sp.address || ''), osmRef: String(sp.osmRef || '') };
          spotGeoKeep(id, d.spot);
        }
        if ('userId' in a) d.userId = a.userId;
        if ('who' in a) d.who = String(a.who || '').trim() || 'Someone';
        if ('avatar' in a) d.avatar = String(a.avatar || '');
        if (isObj(a.details)) d.details = spotDetailShape(a.details);
        d.waiting = a.wait != null || !!a.busy;
        c.data = d;
        if (a.wait != null && looks < 16) {
          tell();
          setTimeout(function () {
            looks += 1;
            sb.rpc('spot_details_take', { req_id: a.wait, spot_id: id, step: String(a.step || '') }).then(function (r) {
              if (r.error) { if (fnMissing(r.error)) sdKnown = false; end(false); return; }
              took(r.data);
            }, function () { end(false); });
          }, looks < 2 ? 400 : 800);
          return;
        }
        if (a.busy && busyTries < 4) {
          tell();
          busyTries += 1;
          setTimeout(ask, 1200);
          return;
        }
        end(a.wait == null && !a.busy);
      };
      var ask = function () {
        sb.rpc('spot_details_ask', { spot_id: id, face: !!face }).then(function (r) {
          if (r.error) { if (fnMissing(r.error)) sdKnown = false; end(false); return; }
          took(r.data);
        }, function () { end(false); });
      };
      ask();
    },
    placeSearchOn: function () {
      if (placeKnown === null) placeProbe();
      return placeKnown === true;
    },
    placeSearch: function (q, near, cb) {
      if (typeof near === 'function') { cb = near; near = ''; }
      var qk = String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
      var nv = String(near || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      var ck = qk + '|' + nv.toLowerCase();
      var gen = ++placeGen;
      clearTimeout(placeTimer);
      var land = function (rows) { if (gen === placeGen) cb(rows); };
      if (!session || qk.length < 2 || qk.length > 80 || placeKnown === false) { land([]); return; }
      if (placeKnown === null) {
        placeProbe();
        var opened = Date.now();
        var again = function () {
          if (gen !== placeGen) return;
          if (placeKnown === true) { window.GR_BACKEND.placeSearch(qk, nv, cb); return; }
          if (placeKnown === false || Date.now() - opened > 4000) { land([]); return; }
          placeTimer = setTimeout(again, 250);
        };
        placeTimer = setTimeout(again, 250);
        return;
      }
      if (placeCache[ck]) { land(placeCache[ck]); return; }
      var keep = function (rows) {
        rows = (Array.isArray(rows) ? rows : []).filter(isObj).slice(0, 8);
        placeCache[ck] = rows;
        land(rows);
      };
      var took = function (a, tries) {
        if (gen !== placeGen) return;
        if (!isObj(a)) { land([]); return; }
        if (Array.isArray(a.places)) { keep(a.places); return; }
        if (a.wait != null && tries < 8) {
          placeTimer = setTimeout(function () {
            if (gen !== placeGen) return;
            sb.rpc('place_search_take', { req_id: a.wait, q: qk, near: nv }).then(function (r) {
              if (gen !== placeGen) return;
              if (r.error) { if (fnMissing(r.error)) placeKnown = false; land([]); return; }
              took(r.data, tries + 1);
            }, function () { land([]); });
          }, tries < 2 ? 350 : 700);
          return;
        }
        land([]);
      };
      var ask = function (again) {
        sb.rpc('place_search_ask', { q: qk, near: nv }).then(function (r) {
          if (gen !== placeGen) return;
          if (r.error) {
            if (fnMissing(r.error)) placeKnown = false;
            land([]);
            return;
          }
          var a = isObj(r.data) ? r.data : null;
          if (a && a.busy && !again) {
            placeTimer = setTimeout(function () { if (gen === placeGen) ask(true); }, 900);
            return;
          }
          took(a && a.busy ? null : a, 0);
        }, function () { land([]); });
      };
      ask(false);
    },
    placeFind: function (q, near) {
      var qk = String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
      var nv = String(near || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      var ck = qk + '|' + nv.toLowerCase();
      if (!session || qk.length < 2 || qk.length > 80 || placeKnown !== true) return Promise.resolve([]);
      if (placeCache[ck]) return Promise.resolve(placeCache[ck]);
      return new Promise(function (done) {
        var keep = function (rows) {
          rows = (Array.isArray(rows) ? rows : []).filter(isObj).slice(0, 8);
          placeCache[ck] = rows;
          done(rows);
        };
        var took = function (a, tries) {
          if (!isObj(a)) { done([]); return; }
          if (Array.isArray(a.places)) { keep(a.places); return; }
          if (a.wait != null && tries < 8) {
            setTimeout(function () {
              sb.rpc('place_search_take', { req_id: a.wait, q: qk, near: nv }).then(function (r) {
                if (r.error) { if (fnMissing(r.error)) placeKnown = false; done([]); return; }
                took(r.data, tries + 1);
              }, function () { done([]); });
            }, tries < 2 ? 350 : 700);
            return;
          }
          done([]);
        };
        var ask = function (again) {
          sb.rpc('place_search_ask', { q: qk, near: nv }).then(function (r) {
            if (r.error) { if (fnMissing(r.error)) placeKnown = false; done([]); return; }
            var a = isObj(r.data) ? r.data : null;
            if (a && a.busy && !again) { setTimeout(function () { ask(true); }, 900); return; }
            took(a && a.busy ? null : a, 0);
          }, function () { done([]); });
        };
        ask(false);
      });
    },
    flowersFor: function (tourId, fresh) {
      var c = flowerCache[tourId];
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadFlowers(tourId);
      return c ? c.data : null;
    },
    myFlowers: function (fresh) {
      var c = myFlowerCache;
      if (!c || c.stale || fresh || Date.now() - c.at > FLOWERS_FRESH) loadMyFlowers();
      return c ? c.data : null;
    },
    newGiftId: newUuid,
    giveFlowers: async function (tourId, userId, n, note, rid, cat) {
      var q = await sb.rpc('give_flowers', { t_id: tourId, to_user: userId, how_many: n, why: Array.from(String(note || '').trim()).slice(0, 100).join(''),
        rid: rid || newUuid(), cat: cat || null });
      if (q.error) {
        if (/no flowers left/.test(q.error.message || '')) {
          flowersStale();
          await Promise.all([loadFlowers(tourId), loadMyFlowers()]);
          throw err('none-left');
        }
        throw mapError(q.error);
      }
      flowersStale();
      await Promise.all([loadFlowers(tourId), loadMyFlowers()]);
      return q.data;
    },
    takeBackFlowers: async function (tourId, id) {
      var q = await sb.from('flowers').delete().eq('id', id).select('id');
      if (q.error) throw mapError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
      flowersStale();
      await Promise.all([loadFlowers(tourId), loadMyFlowers()]);
    },
    guestsFor: function (tourId, showId) {
      return cache.guests.filter(function (g) {
        return g.tour_id === tourId && g.show_id === showId;
      }).map(function (g) {
        return { id: g.id, firstName: g.first_name, lastName: g.last_name,
          affiliation: g.affiliation, email: g.email, phone: g.phone,
          qty: g.qty, passType: g.pass_type, addedBy: g.added_by, at: g.created_at };
      });
    },
    saveGuest: async function (tourId, showId, guest) {
      var row = {
        id: guest.id, tour_id: tourId, show_id: showId,
        first_name: guest.firstName, last_name: guest.lastName,
        affiliation: guest.affiliation, email: guest.email, phone: guest.phone,
        qty: guest.qty, pass_type: guest.passType
      };
      var q = await sb.from('guests').upsert(row);
      if (q.error) throw mapError(q.error);
      scheduleRefetch();
    },
    removeGuest: async function (guestId) {
      var q = await sb.from('guests').delete().eq('id', guestId).select('id');
      if (q.error) throw mapError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
      scheduleRefetch();
    },
    reimbursementsFor: function (tourId) {
      var me = session && session.user ? session.user.id : null;
      return (Array.isArray(cache.reimb) ? cache.reimb : []).filter(function (r) { return r && r.tour_id === tourId; })
        .map(function (r) {
          return { id: r.id, tourId: r.tour_id, mine: !!me && r.user_id === me, name: r.requester_name || '',
            amount: Number(r.amount) || 0, what: r.what || '', date: r.spent_on || '', status: r.status || 'open',
            paidAt: r.paid_at || null, paidBy: r.paid_by_name || '', how: r.paid_how || '', feedId: r.feed_id || '',
            closedBy: r.closed_by_name || '', closedAt: r.closed_at || null, createdAt: r.created_at || null };
        }).sort(function (a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });
    },
    reimbursementsRead: function () { return reimbReadOnce; },
    reimburseAsk: async function (tourId, ask) {
      var a = isObj(ask) ? ask : {};
      var given = a.id != null && a.id !== '';
      if (given && !/^[A-Za-z0-9_-]{6,40}$/.test(String(a.id))) return { ok: false, why: 'id' };
      var id = given ? String(a.id) : newRowId();
      var out = await reimburseCall('reimburse_ask', { r_id: id, t_id: tourId, amt: Number(a.amount),
        r_what: String(a.what == null ? '' : a.what).slice(0, 140), r_day: a.date || null });
      return out.ok ? { ok: true, id: id } : out;
    },
    reimburseWithdraw: function (id) {
      return reimburseCall('reimburse_withdraw', { r_id: id });
    },
    reimburseMark: function (id, paid, how, feedId) {
      return reimburseCall('reimburse_mark', { r_id: id, is_paid: !!paid, how: paid ? String(how || '') : '',
        feed: paid && feedId != null ? String(feedId) : '' });
    },
    reimburseRestore: function (id) {
      return reimburseCall('reimburse_restore', { r_id: id });
    },
    asksFor: function (tourId) {
      return cache.asks.filter(function (a) { return a.tour_id === tourId; }).map(function (a) {
        return { id: a.id, noteId: a.note_id, showId: a.show_id, place: a.place, was: Number(a.was), fix: Number(a.fix),
          status: a.status, at: a.created_at };
      });
    },
    ariAnswer: async function (id, yes) {
      var q = await sb.rpc('ari_answer', { a_id: id, yes: !!yes });
      if (q.error) throw q.error.code === '42501' ? err('permission') : mapError(q.error);
      await refetch();
      return q.data;
    },
    notesFor: function (tourId, day) {
      return cache.notes.filter(function (n) {
        return n.tour_id === tourId && (!day || n.day === day);
      }).map(function (n) {
        return { id: n.id, day: n.day, body: n.body, author: n.author,
          addedBy: n.added_by, at: n.created_at };
      });
    },
    saveNote: async function (tourId, day, note) {
      var q = await sb.from('notes').upsert({
        id: note.id, tour_id: tourId, day: day,
        body: note.body, author: note.author || ''
      });
      if (q.error) throw mapError(q.error);
      scheduleRefetch();
    },
    removeNote: async function (noteId) {
      var q = await sb.from('notes').delete().eq('id', noteId).select('id');
      if (q.error) throw mapError(q.error);
      if (!q.data || !q.data.length) throw err('permission');
      scheduleRefetch();
    },
    notify: function (tourId, type, data) {
      var say = tourId ? { tourId: tourId, type: type, data: data || {} } : { type: type, data: data || {} };
      return callFn('notify', {
        method: 'POST',
        body: JSON.stringify(say)
      }).then(function (r) { return r.ok ? r.json() : r.status === 429 ? { tooMany: true } : null; })
        .then(function (out) { return out && out.tooMany ? 'too_many' : out && typeof out.sent === 'number' ? out.sent : null; })
        .catch(function () { return null; });
    },
    dayBarDevice: async function (device, secret, on) {
      if (!session || !session.user) return false;
      try {
        var q = await sb.rpc('daybar_device', { p_device: String(device || ''), p_secret: String(secret || ''), p_on: on === true });
        return !q.error && q.data === true;
      } catch (e) { return false; }
    },
    dayBarReportTo: function () {
      if (!cfg.url || !cfg.anonKey) return null;
      return { url: String(cfg.url).replace(/\/+$/, '') + '/rest/v1/rpc/daybar_report', key: cfg.anonKey };
    },
    dayBarBusOk: async function (device, secret, on) {
      if (!session || !session.user) return false;
      try {
        var q = await sb.rpc('daybar_bus_ok', { p_device: String(device || ''), p_secret: String(secret || ''), p_on: on === true });
        return !q.error && q.data === true;
      } catch (e) { return false; }
    },
    busAnswerTo: function () {
      if (!cfg.url || !cfg.anonKey) return null;
      return { url: String(cfg.url).replace(/\/+$/, '') + '/rest/v1/rpc/daybar_bus', key: cfg.anonKey };
    },
    pushSupported: function () {
      return !!(navigator.serviceWorker && 'PushManager' in window && 'Notification' in window);
    },
    pushState: async function () {
      if (!this.pushSupported()) return { on: false, prefs: {} };
      try {
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription();
        if (!sub) return { on: false, prefs: {} };
        var q = await sb.from('push_subs').select('prefs').eq('endpoint', sub.endpoint).single();
        return { on: !q.error, prefs: (q.data && q.data.prefs) || {} };
      } catch (e) { return { on: false, prefs: {} }; }
    },
    pushEnable: async function (prefs) {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') throw err('denied');
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        var key = Uint8Array.from(atob((cfg.vapidPublic || '').replace(/-/g, '+').replace(/_/g, '/')
          .padEnd(Math.ceil(cfg.vapidPublic.length / 4) * 4, '=')), function (c) { return c.charCodeAt(0); });
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      }
      var j = sub.toJSON();
      var q = await sb.from('push_subs').upsert({
        endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, prefs: prefs || {}
      });
      if (q.error) throw mapError(q.error);
    },
    pushSetPrefs: async function (prefs) {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await sb.from('push_subs').update({ prefs: prefs }).eq('endpoint', sub.endpoint);
    },
    pushDisable: async function () {
      try {
        var reg = await navigator.serviceWorker.ready;
        var sub = await reg.pushManager.getSubscription();
        if (sub) {
          await sb.from('push_subs').delete().eq('endpoint', sub.endpoint);
          await sub.unsubscribe();
        }
      } catch (e) {   }
    },
    appPushSave: async function (token, prefs, was) {
      if (!session || !session.user) return false;
      try {
        var q = await sb.rpc('app_push_save', { p_token: String(token || ''), p_prefs: prefs || {}, p_was: was ? String(was) : null });
        return !q.error && q.data === true;
      } catch (e) { return false; }
    },
    appPushMine: async function (token) {
      if (!session || !session.user) return { ok: false };
      try {
        var q = await sb.rpc('app_push_mine', { p_token: String(token || '') });
        if (q.error) return { ok: false };
        var d = q.data;
        return { ok: true, prefs: d && typeof d === 'object' && d.prefs && typeof d.prefs === 'object' ? d.prefs : null };
      } catch (e) { return { ok: false }; }
    },
    appPushForget: async function (token) {
      if (!session || !session.user) return false;
      try {
        var q = await sb.rpc('app_push_forget', { p_token: String(token || '') });
        return !q.error || fnMissing(q.error);
      } catch (e) { return false; }
    },
    feedWatch: function (fn) {
      feedListeners.push(fn);
      loadFeed(true);
    },
    socialWatch: function (fn) {
      if (typeof fn === 'function') socialFns.push(fn);
    },
    feedCall: async function (action, body) {
      var r;
      try {
        r = await callFn('plaid', {
          method: 'POST',
          body: JSON.stringify(Object.assign({ action: action }, body || {}))
        });
      } catch (e) {
        noteError('cards:' + action, e);
        return { error: 'offline' };
      }
      var out = {};
      try { out = await r.json(); } catch (e) { out = {}; }
      if (!r.ok && !out.error) out.error = 'unavailable';
      if (r.__retried) out.retried = true;
      if (out.error || out.ok === false) noteError('cards:' + action, { code: out.error || out.status, message: 'http ' + r.status });
      if (action !== 'status') await loadFeed(false);
      return out;
    },
    feedRead: function () { return loadFeed(false); },
    feedAccount: async function () {
      try {
        var q = await sb.rpc('feed_account');
        if (q.error) { noteError('cards:account', q.error); return null; }
        return isObj(q.data) ? q.data : null;
      } catch (e) { return null; }
    },
    feedPutBack: async function (ids) {
      var list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean).slice(0, 500);
      if (!list.length) return 0;
      var n = null;
      try {
        var q = await sb.rpc('feed_put_back', { ids: list });
        if (q.error) noteError('cards:putback', q.error);
        else n = Number(q.data) || 0;
      } catch (e) { n = null; }
      await loadFeed(false);
      return n;
    },
    feedLeftOut: async function (status, reason, page, after) {
      var st = status === 'skipped' ? 'skipped' : 'left_out', from = Math.max(0, Math.round(Number(page)) || 0) * FEED_LIST;
      var ask = function () {
        var q = sb.from('feed_items').select(FEED_LIST_COLS).eq('status', st);
        return reason ? q.eq('reason', String(reason)) : q;
      };
      try {
        var day = after && /^\d{4}-\d{2}-\d{2}$/.test(String(after.date || '')) ? String(after.date) : '';
        if (day && after.id != null && String(after.id) !== '') {
          var same = await ask().eq('date', day).gt('id', String(after.id)).order('id').limit(FEED_LIST);
          if (same.error) { noteError('cards:leftout', same.error); return null; }
          var rows = same.data || [];
          if (rows.length < FEED_LIST) {
            var older = await ask().lt('date', day).order('date', { ascending: false }).order('id').limit(FEED_LIST - rows.length);
            if (older.error) { noteError('cards:leftout', older.error); return null; }
            rows = rows.concat(older.data || []);
          }
          return rows;
        }
        var q = await ask().order('date', { ascending: false }).order('id').range(from, from + FEED_LIST - 1);
        if (q.error) { noteError('cards:leftout', q.error); return null; }
        return q.data || [];
      } catch (e) { return null; }
    },
    feedLook: async function (wantFiled) {
      try {
        var gone = await sb.from('feed_items').select(FEED_LIST_COLS).not('gone_on', 'is', null)
          .in('status', ['filed', 'skipped', 'mypay']).order('date', { ascending: false }).order('id').limit(200);
        var changed = await sb.from('feed_items').select(FEED_LIST_COLS).not('bank_amount', 'is', null)
          .order('date', { ascending: false }).order('id').limit(200);
        if (gone.error || changed.error) { noteError('cards:look', gone.error || changed.error); return null; }
        var out = { gone: gone.data || [],
          changed: (changed.data || []).filter(function (r) { return Math.round(Number(r.bank_amount) * 100) !== Math.round(Number(r.amount) * 100); }),
          filed: null };
        if (wantFiled) {
          var filed = await pageRows(function () {
            return sb.from('feed_items').select('id, tour_id, date, merchant, amount, account, decided_at, gone_on', { count: 'exact' })
              .eq('status', 'filed').order('date', { ascending: false }).order('id');
          });
          if (!filed) return null;
          out.filed = filed.rows;
        }
        return out;
      } catch (e) { return null; }
    },
    signOut: async function () {
      if (typeof window.GR_BEFORE_SIGNOUT === 'function') {
        try {
          await Promise.race([
            Promise.resolve().then(window.GR_BEFORE_SIGNOUT),
            new Promise(function (r) { setTimeout(r, 1500); })
          ]);
        } catch (e) {   }
      }
      try {
        await Promise.race([
          sb.auth.signOut({ scope: 'local' }),
          new Promise(function (r) { setTimeout(r, 2000); })
        ]);
      } catch (e) {   }
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k);
        });
      } catch (e) {   }
      suggestClear();
      legalDrop();
      location.replace(appUrl());
    }
  };
  var dmListeners = [];
  function dmChanged() { dmListeners.forEach(function (fn) { try { fn(); } catch (e) {   } }); }
  var feedListeners = [];
  var feedTimer = 0;
  var FEED_PAGE = 1000;
  var FEED_LIST = 100;
  var FEED_LIST_COLS = 'id, tour_id, date, posted, merchant, amount, account, why, status, reason, decided_at, bank_amount, gone_on';
  async function pageRows(make) {
    var rows = [], seen = {}, from = 0, total = null;
    for (var turn = 0; turn < 60; turn++) {
      var q = await make().range(from, from + FEED_PAGE - 1);
      if (q.error) return null;
      var got = q.data || [];
      if (typeof q.count === 'number') total = q.count;
      got.forEach(function (r) { if (!seen[r.id]) { seen[r.id] = true; rows.push(r); } });
      from += got.length;
      if (!got.length || (total != null ? from >= total : got.length < FEED_PAGE)) break;
    }
    return { rows: rows, total: total == null ? rows.length : Math.max(total, rows.length) };
  }
  var feedGood;
  function feedTell(state) {
    feedListeners.forEach(function (fn) {
      try { fn(state ? Object.assign({}, state, { row: state.row ? Object.assign({}, state.row) : null, items: (state.items || []).slice() }) : null); }
      catch (e) {   }
    });
  }
  function feedFailed() {
    if (feedGood === null) { feedTell(null); return; }
    feedTell(feedGood ? Object.assign({}, feedGood, { failed: true }) : { row: null, items: [], failed: true });
  }
  async function loadFeed(opening) {
    try {
      var f = await sb.from('feed').select('switched_on, plan_name, since, last_run, last_status, source').maybeSingle();
      if (f.error) { feedFailed(); return; }
      if (!f.data) {
        var ok = await sb.from('ynab_allowed').select('owner_id').maybeSingle();
        feedGood = (ok.error || !ok.data) ? null : { row: null, items: [], connectOnly: true };
        feedTell(feedGood);
        return;
      }
      var items = await pageRows(function () {
        return sb.from('feed_items').select('id, tour_id, date, posted, seq, merchant, amount, category, account, why, created_at', { count: 'exact' })
          .eq('status', 'waiting').order('date').order('id');
      });
      if (!items) {
        feedTell({ row: f.data, items: feedGood && feedGood.items ? feedGood.items : [], failed: true });
        return;
      }
      feedGood = { row: f.data, items: items.rows, total: items.total };
      feedTell(feedGood);
      var last = f.data.last_run ? Date.parse(f.data.last_run) : 0;
      if (opening && f.data.switched_on && Date.now() - last > 15 * 60e3) {
        window.GR_BACKEND.feedCall('sync').catch(function () {   });
      }
    } catch (e) {
      feedFailed();
    }
  }
  function settle(old, q, gen, now) {
    if (q && !q.error && isObj(q.data)) return { data: q.data, at: Date.now(), stale: gen !== now };
    if (old && old.data && !old.data.error) return { data: old.data, at: Date.now(), stale: false };
    return { data: { error: true }, at: Date.now(), stale: false };
  }
  function loadFlowers(tourId) {
    var gen = flowerGen[tourId] || 0, ask = flowerAsk[tourId];
    if (ask && ask.gen === gen) return ask;
    var p = sb.rpc('tour_flowers', { t_id: tourId }).then(function (q) { return q; }, function () { return null; })
      .then(function (q) {
        flowerCache[tourId] = settle(flowerCache[tourId], q, gen, flowerGen[tourId] || 0);
        if (flowerAsk[tourId] === p) delete flowerAsk[tourId];
        emit('tours');
      });
    p.gen = gen;
    flowerAsk[tourId] = p;
    return p;
  }
  function loadMyFlowers() {
    var gen = myFlowerGen, ask = myFlowerAsk;
    if (ask && ask.gen === gen) return ask;
    var p = sb.rpc('my_flowers').then(function (q) { return q; }, function () { return null; })
      .then(function (q) {
        myFlowerCache = settle(myFlowerCache, q, gen, myFlowerGen);
        if (myFlowerAsk === p) myFlowerAsk = null;
        emit('tours');
      });
    p.gen = gen;
    myFlowerAsk = p;
    return p;
  }
  function busProbe() {
    if (busProbing || !session) return;
    busProbing = true;
    sb.from('bus_checkins').select('tour_id').limit(1).then(function (q) {
      busProbing = false;
      if (!q.error) { busKnown = true; emit('tours'); }
      else if (tableMissing(q.error)) busKnown = false;
    }, function () { busProbing = false; });
  }
  function busStale() {
    Object.keys(busCache).forEach(function (k) { busGen[k] = (busGen[k] || 0) + 1; if (busCache[k]) busCache[k].stale = true; });
  }
  function loadBus(tourId) {
    var gen = busGen[tourId] || 0, ask = busAsk[tourId];
    if (ask && ask.gen === gen) return ask;
    var day = busDay();
    var p = Promise.all([
      sb.from('bus_checkins').select('user_id, state, at').eq('tour_id', tourId).eq('day', day),
      sb.from('members').select('user_id, display_name, rides_bus').eq('tour_id', tourId).order('created_at')
    ]).then(function (qs) {
      if (qs[0].error || qs[1].error) {
        if (tableMissing(qs[0].error) || tableMissing(qs[1].error) || columnMissing(qs[1].error)) {
          busKnown = false; delete busCache[tourId]; emit('tours');
        }
        return null;
      }
      var doc = cache.tours.get(tourId);
      var riders = (qs[1].data || []).filter(function (m) { return m.user_id && m.rides_bus !== false; });
      if (doc && doc._ownerId && !riders.some(function (m) { return m.user_id === doc._ownerId; })) {
        riders.unshift({ user_id: doc._ownerId, display_name: '' });
      }
      var ids = riders.map(function (m) { return m.user_id; });
      return (ids.length ? sb.from('profiles').select('user_id, full_name, username').in('user_id', ids)
        : Promise.resolve({ data: [] })).then(function (pq) {
        var names = {};
        (pq.data || []).forEach(function (x) { names[x.user_id] = x.full_name || x.username || ''; });
        var word = {};
        (qs[0].data || []).forEach(function (r) { word[r.user_id] = r; });
        return { day: day, people: riders.map(function (m) {
          var w = word[m.user_id];
          return { userId: m.user_id, name: names[m.user_id] || m.display_name || 'Someone',
            state: w ? w.state : '', at: w ? w.at : null };
        }) };
      });
    }).then(function (data) {
      if (data) busCache[tourId] = { data: data, day: data.day, at: Date.now(), stale: gen !== (busGen[tourId] || 0) };
      if (busAsk[tourId] === p) delete busAsk[tourId];
      if (data) emit('tours');
    }, function () { if (busAsk[tourId] === p) delete busAsk[tourId]; });
    p.gen = gen;
    busAsk[tourId] = p;
    return p;
  }
  function cityEvProbe() {
    if (cityEvProbing || !session) return;
    cityEvProbing = true;
    sb.rpc('city_events_ask', { t_id: '', s_id: '' }).then(function (q) {
      cityEvProbing = false;
      if (q.error && fnMissing(q.error)) cityEvKnown = false;
      else { cityEvKnown = true; emit('tours'); }
    }, function () { cityEvProbing = false; });
  }
  function placeProbe() {
    if (placeProbing || !session) return;
    placeProbing = true;
    sb.rpc('place_search_ask', { q: '' }).then(function (q) {
      placeProbing = false;
      if (q.error && fnMissing(q.error)) placeKnown = false;
      else if (!q.error) { placeKnown = true; emit('tours'); }
    }, function () { placeProbing = false; });
  }
  function srProbe() {
    if (srProbing || !session) return;
    srProbing = true;
    sb.rpc('artist_seat_rules_get', { a_id: null }).then(function (q) {
      srProbing = false;
      if (q.error && fnMissing(q.error)) srKnown = false;
      else if (!q.error) { srKnown = true; emit('tours'); }
    }, function () { srProbing = false; });
  }
  function vhProbe() {
    if (vhProbing || !session) return;
    vhProbing = true;
    sb.rpc('venue_history', { t_id: '', s_id: '' }).then(function (q) {
      vhProbing = false;
      if (q.error && fnMissing(q.error)) vhKnown = false;
      else { vhKnown = true; emit('tours'); }
    }, function () { vhProbing = false; });
  }
  function pcProbe() {
    if (pcProbing) return pcProbing;
    if (!session) return Promise.resolve();
    pcProbing = sb.rpc('person_checks', { uids: [] }).then(function (q) {
      pcProbing = null;
      if (q.error && fnMissing(q.error)) pcKnown = false;
      else if (!q.error) { pcKnown = true; emit('tours'); }
    }, function () { pcProbing = null; });
    return pcProbing;
  }
  var PC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function pcFor(uids) {
    if (pcKnown === false || !session) return Promise.resolve(false);
    if (pcKnown === null) return pcProbe().then(function () { return pcKnown === true ? pcFor(uids) : false; });
    var now = Date.now(), seen = {}, need = [], waits = [];
    (Array.isArray(uids) ? uids : []).forEach(function (u) {
      u = String(u || '').toLowerCase();
      if (!PC_ID.test(u) || seen[u]) return;
      seen[u] = true;
      var c = pcCache[u];
      if (c && now - c.at <= PC_FRESH) return;
      if (pcAsk[u]) { if (waits.indexOf(pcAsk[u]) < 0) waits.push(pcAsk[u]); return; }
      need.push(u);
    });
    if (need.length && now - pcFailAt < PC_RETRY) need = [];
    for (var i = 0; i < need.length; i += PC_MAX) waits.push(pcCall(need.slice(i, i + PC_MAX)));
    return waits.length ? Promise.all(waits).then(function () { return true; }) : Promise.resolve(false);
  }
  function pcCall(ids) {
    var p = sb.rpc('person_checks', { uids: ids }).then(function (q) {
      if (q.error) {
        if (fnMissing(q.error)) pcKnown = false;
        else pcFailAt = Date.now();
        return;
      }
      var a = isObj(q.data) ? q.data : {}, at = Date.now();
      ids.forEach(function (u) {
        if (typeof a[u] === 'boolean') pcCache[u] = { on: a[u], at: at };
      });
    }, function () { pcFailAt = Date.now(); }).then(function () {
      ids.forEach(function (u) { if (pcAsk[u] === p) delete pcAsk[u]; });
    });
    ids.forEach(function (u) { pcAsk[u] = p; });
    return p;
  }
  function loadVenueHistory(tourId, showId, sig) {
    var k = tourId + '|' + showId, ask = vhAsk[k];
    if (ask && ask.sig === sig) return ask;
    var p = sb.rpc('venue_history', { t_id: tourId, s_id: showId }).then(function (q) {
      if (q.error) {
        if (fnMissing(q.error)) { vhKnown = false; delete vhCache[k]; emit('tours'); return null; }
        var held = vhCache[k];
        vhCache[k] = { data: held && held.sig === sig ? held.data : null, sig: sig, at: Date.now() - VH_FRESH + VH_RETRY };
        return null;
      }
      var a = q.data;
      if (!isObj(a) || a.none || !a.artistId) return { data: null };
      var nights = (Array.isArray(a.nights) ? a.nights : []).filter(function (n) {
        return isObj(n) && /^\d{4}-\d{2}-\d{2}$/.test(String(n.date || ''));
      }).slice(0, 100).map(function (n) {
        return { date: String(n.date), name: String(n.name || '').trim(),
          kind: n.kind === 'festival' || n.kind === 'shows' ? n.kind : 'tour' };
      });
      var out = { artistId: String(a.artistId), artist: String(a.artist || '').trim(),
        count: Math.max(nights.length, Math.round(Number(a.count)) || 0), nights: nights };
      var rs = Number(a.stars), rn = Math.round(Number(a.ratings));
      if (rn > 0 && isFinite(rs) && rs > 0) { out.stars = Math.round(rs * 10) / 10; out.ratings = rn; }
      var cn = Math.round(Number(a.cityCount));
      if (a.cityCount != null && isFinite(cn) && cn >= 0) out.cityCount = cn;
      var cl = a.cityLast;
      if (out.cityCount > 0 && isObj(cl) && /^\d{4}-\d{2}-\d{2}$/.test(String(cl.date || ''))) {
        out.cityLast = { date: String(cl.date), name: String(cl.name || '').trim(),
          kind: cl.kind === 'festival' || cl.kind === 'shows' ? cl.kind : 'tour' };
      }
      var ma = Number(a.merchAvg), mn = Math.round(Number(a.merchN));
      if (mn > 0 && isFinite(ma) && ma > 0) { out.merchAvg = Math.round(ma * 100) / 100; out.merchN = mn; }
      var ga = Number(a.guaranteeAvg), gn = Math.round(Number(a.guaranteeN));
      if (gn > 0 && isFinite(ga) && ga > 0) { out.guaranteeAvg = Math.round(ga * 100) / 100; out.guaranteeN = gn; }
      return { data: out };
    }).then(function (got) {
      if (vhAsk[k] === p) delete vhAsk[k];
      if (!got) return;
      var was = vhCache[k];
      vhCache[k] = { data: got.data, sig: sig, at: Date.now() };
      if (!was || was.sig !== sig || JSON.stringify(was.data) !== JSON.stringify(got.data)) emit('tours');
    }, function () {
      if (vhAsk[k] === p) delete vhAsk[k];
      var held = vhCache[k];
      vhCache[k] = { data: held && held.sig === sig ? held.data : null, sig: sig, at: Date.now() - VH_FRESH + VH_RETRY };
    });
    p.sig = sig;
    vhAsk[k] = p;
    return p;
  }
  function fsProbe() {
    if (fsProbing || !session) return;
    fsProbing = true;
    sb.rpc('follow_spots', { near: '' }).then(function (q) {
      fsProbing = false;
      if (q.error && fnMissing(q.error)) fsKnown = false;
      else { fsKnown = true; emit('tours'); }
    }, function () { fsProbing = false; });
  }
  function loadFollowSpots(k, near) {
    if (fsAsk[k]) return fsAsk[k];
    var p = sb.rpc('follow_spots', { near: String(near || '') }).then(function (q) {
      if (q.error) {
        if (fnMissing(q.error)) { fsKnown = false; delete fsCache[k]; emit('tours'); return null; }
        var held = fsCache[k];
        fsCache[k] = { data: held ? held.data : null, at: Date.now() - FS_FRESH + FS_RETRY };
        return null;
      }
      var rows = (Array.isArray(q.data) ? q.data : []).filter(isObj).slice(0, 40).map(function (r) {
        var it = { userId: r.userId, who: String(r.who || '').trim() || 'Someone',
          city: String(r.city || '').trim(), name: String(r.name || '').trim(),
          kind: String(r.kind || 'other'), note: String(r.note || '').trim() };
        if (r.id != null) it.id = r.id;
        if (typeof r.lat === 'number' && typeof r.lon === 'number') { it.lat = r.lat; it.lon = r.lon; }
        if (r.address) it.address = String(r.address);
        if (r.osmRef) it.osmRef = String(r.osmRef);
        return it;
      });
      return { data: rows };
    }).then(function (got) {
      if (fsAsk[k] === p) delete fsAsk[k];
      if (!got) return;
      var was = fsCache[k];
      fsCache[k] = { data: got.data, at: Date.now() };
      if (!was || JSON.stringify(was.data) !== JSON.stringify(got.data)) emit('tours');
    }, function () {
      if (fsAsk[k] === p) delete fsAsk[k];
      var held = fsCache[k];
      fsCache[k] = { data: held ? held.data : null, at: Date.now() - FS_FRESH + FS_RETRY };
    });
    fsAsk[k] = p;
    return p;
  }
  function buyoutProbe() {
    if (buyoutProbing || !session) return;
    buyoutProbing = true;
    sb.from('buyout_tracks').select('tour_id').limit(1).then(function (q) {
      buyoutProbing = false;
      if (!q.error) { buyoutKnown = true; emit('tours'); }
      else if (tableMissing(q.error)) buyoutKnown = false;
    }, function () { buyoutProbing = false; });
  }
  function buyoutStale() {
    Object.keys(buyoutCache).forEach(function (k) { buyoutGen[k] = (buyoutGen[k] || 0) + 1; if (buyoutCache[k]) buyoutCache[k].stale = true; });
    Object.keys(boAskCache).forEach(function (k) { boAskGen[k] = (boAskGen[k] || 0) + 1; if (boAskCache[k]) boAskCache[k].stale = true; });
  }
  function boAskProbe() {
    if (boAskProbing || !session) return;
    boAskProbing = true;
    sb.from('buyout_asks').select('tour_id').limit(1).then(function (q) {
      boAskProbing = false;
      if (!q.error) { boAskKnown = true; emit('tours'); }
      else if (tableMissing(q.error)) boAskKnown = false;
    }, function () { boAskProbing = false; });
  }
  function boSelfProbe() {
    if (boSelfProbing || !session) return;
    boSelfProbing = true;
    sb.rpc('buyout_mark_mine', { t_id: '', s_id: '' }).then(function (q) {
      boSelfProbing = false;
      if (!q.error) { boSelfKnown = true; emit('tours'); }
      else if (fnMissing(q.error)) boSelfKnown = false;
    }, function () { boSelfProbing = false; });
  }
  function loadBoAsks(tourId) {
    var gen = boAskGen[tourId] || 0, ask = boAskAsk[tourId];
    if (ask && ask.gen === gen) return ask;
    var p = sb.from('buyout_asks').select('show_id, user_id, asked_at').eq('tour_id', tourId)
      .order('asked_at', { ascending: false }).limit(500)
      .then(function (q) {
        if (q.error) {
          if (tableMissing(q.error)) { boAskKnown = false; delete boAskCache[tourId]; emit('tours'); }
          return null;
        }
        return (q.data || []).map(function (r) { return { showId: r.show_id, userId: r.user_id, at: r.asked_at }; });
      }).then(function (data) {
        if (data) boAskCache[tourId] = { data: data, at: Date.now(), stale: gen !== (boAskGen[tourId] || 0) };
        if (boAskAsk[tourId] === p) delete boAskAsk[tourId];
        if (data) emit('tours');
      }, function () { if (boAskAsk[tourId] === p) delete boAskAsk[tourId]; });
    p.gen = gen;
    boAskAsk[tourId] = p;
    return p;
  }
  function loadBuyouts(tourId) {
    var gen = buyoutGen[tourId] || 0, ask = buyoutAsk[tourId];
    if (ask && ask.gen === gen) return ask;
    var p = sb.from('buyout_tracks').select('*').eq('tour_id', tourId)
      .then(function (q) {
        if (q.error) {
          if (tableMissing(q.error)) { buyoutKnown = false; delete buyoutCache[tourId]; emit('tours'); }
          return null;
        }
        return (q.data || []).map(function (r) {
          return { showId: r.show_id, userId: r.user_id, at: r.tracked_at, self: r.self_marked === true };
        });
      }).then(function (data) {
        if (data) buyoutCache[tourId] = { data: data, at: Date.now(), stale: gen !== (buyoutGen[tourId] || 0) };
        if (buyoutAsk[tourId] === p) delete buyoutAsk[tourId];
        if (data) emit('tours');
      }, function () { if (buyoutAsk[tourId] === p) delete buyoutAsk[tourId]; });
    p.gen = gen;
    buyoutAsk[tourId] = p;
    return p;
  }
  function flyerProbe() {
    if (flyerProbing || !session) return;
    flyerProbing = true;
    sb.from('artist_tour_flyers').select('artist_id').limit(1).then(function (q) {
      flyerProbing = false;
      if (!q.error) { flyerKnown = true; emit('tours'); }
      else if (tableMissing(q.error)) flyerKnown = false;
    }, function () { flyerProbing = false; });
  }
  function fnv32(s, seed) {
    var h = seed >>> 0;
    for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  function flyerKey(gk) {
    var s = String(gk);
    return fnv32(s, 0x811c9dc5) + fnv32(s.split('').reverse().join(''), 0x811c9dc5) + s.length.toString(36);
  }
  function loadOwnFlyers() {
    if (ownFlyers.asking || !session) return;
    ownFlyers.asking = true;
    sb.from('tour_flyers').select('tour_id').then(function (q) {
      ownFlyers.asking = false; ownFlyers.at = Date.now();
      if (q.error) return;
      var ids = {};
      (q.data || []).forEach(function (r) { if (r && r.tour_id) ids[r.tour_id] = true; });
      var was = Object.keys(ownFlyers.ids || {}).sort().join(',');
      ownFlyers.ids = ids;
      if (Object.keys(ids).sort().join(',') !== was) emit('tours');
    }, function () { ownFlyers.asking = false; ownFlyers.at = Date.now(); });
  }
  function loadFlyers(artistId) {
    var gen = flyerGen[artistId] || 0, ask = flyerAsk[artistId];
    if (ask && ask.gen === gen) return ask;
    var p = sb.from('artist_tour_flyers').select('gk, url, source_url').eq('artist_id', artistId)
      .then(function (q) {
        if (q.error) {
          if (tableMissing(q.error)) { flyerKnown = false; delete flyerCache[artistId]; emit('tours'); }
          return null;
        }
        var map = {};
        (q.data || []).forEach(function (r) { map[r.gk] = { url: r.url, sourceUrl: r.source_url || '' }; });
        return map;
      }).then(function (data) {
        if (data) flyerCache[artistId] = { data: data, at: Date.now(), stale: gen !== (flyerGen[artistId] || 0) };
        if (flyerAsk[artistId] === p) delete flyerAsk[artistId];
        if (data) emit('tours');
      }, function () { if (flyerAsk[artistId] === p) delete flyerAsk[artistId]; });
    p.gen = gen;
    flyerAsk[artistId] = p;
    return p;
  }
  function supplyProbe() {
    if (supplyProbing || !session) return;
    supplyProbing = true;
    sb.from('tour_supplies').select('id').limit(1).then(function (q) {
      supplyProbing = false;
      if (!q.error) { supplyKnown = true; emit('tours'); }
      else if (tableMissing(q.error)) supplyKnown = false;
    }, function () { supplyProbing = false; });
  }
  function supplyStale() {
    Object.keys(supplyCache).forEach(function (k) { supplyGen[k] = (supplyGen[k] || 0) + 1; if (supplyCache[k]) supplyCache[k].stale = true; });
  }
  function supplyRowPatch(id, change) {
    Object.keys(supplyCache).forEach(function (k) {
      var c = supplyCache[k];
      if (c && c.data) c.data.forEach(function (r) { if (r.id === id) change(r); });
    });
  }
  function supplySaid(e) {
    var m = String(e && e.message || '');
    if (/supply line|supplies list|change its words/i.test(m)) {
      var x = new Error(m);
      x.code = 'said';
      return x;
    }
    return mapError(e);
  }
  function loadSupplies(tourId) {
    var gen = supplyGen[tourId] || 0, ask = supplyAsk[tourId];
    if (ask && ask.gen === gen) return ask;
    var p = sb.from('tour_supplies').select('id, body, added_by, done_at, done_by, created_at')
      .eq('tour_id', tourId).order('created_at')
      .then(function (q) {
        if (q.error) {
          if (tableMissing(q.error)) { supplyKnown = false; delete supplyCache[tourId]; emit('tours'); }
          return null;
        }
        return (q.data || []).map(function (r) {
          return { id: r.id, body: r.body, addedBy: r.added_by, doneAt: r.done_at, doneBy: r.done_by, at: r.created_at };
        });
      }).then(function (data) {
        if (data) supplyCache[tourId] = { data: data, at: Date.now(), stale: gen !== (supplyGen[tourId] || 0) };
        if (supplyAsk[tourId] === p) delete supplyAsk[tourId];
        if (data) emit('tours');
      }, function () { if (supplyAsk[tourId] === p) delete supplyAsk[tourId]; });
    p.gen = gen;
    supplyAsk[tourId] = p;
    return p;
  }
  function modProbe(again) {
    if (!session || !sb) return Promise.resolve();
    if (modProbing) return Promise.resolve();
    if (modKnown === false && !again) return Promise.resolve();
    modProbing = true;
    return Promise.resolve(sb.rpc('my_blocks')).then(function (q) {
      modProbing = false;
      if (q && !q.error && isObj(q.data)) {
        modUser = session && session.user ? session.user.id : modUser;
        modBlocks = (Array.isArray(q.data.blocks) ? q.data.blocks : []).filter(function (b) { return b && b.userId; })
          .map(function (b) { return { userId: String(b.userId), name: String(b.name || ''), handle: String(b.handle || ''), at: b.at || '' }; });
        modEnded = q.data.ended === true;
        modKnown = true;
        emit('tours');
      } else if (q && q.error && (fnMissing(q.error) || tableMissing(q.error))) {
        modKnown = false;
      }
    }, function () { modProbing = false; });
  }
  function favProbe() {
    if (favProbing || !session) return;
    favProbing = true;
    sb.from('fan_favorites').select('user_id').eq('user_id', session.user.id).limit(1).then(function (q) {
      favProbing = false;
      if (!q.error) { favKnown = true; emit('tours'); }
      else if (tableMissing(q.error)) favKnown = false;
    }, function () { favProbing = false; });
  }
  function loadFavs(uid) {
    var gen = favGen[uid] || 0, ask = favAsk[uid];
    if (ask && ask.gen === gen) return ask;
    var p = sb.from('fan_favorites').select('artist_id, rank').eq('user_id', uid).order('rank')
      .then(function (q) {
        if (q.error) {
          if (tableMissing(q.error)) { favKnown = false; delete favCache[uid]; emit('tours'); }
          return null;
        }
        var rows = q.data || [];
        var ids = rows.map(function (r) { return r.artist_id; });
        return (ids.length ? sb.from('artists').select('id, name, handle, avatar').in('id', ids)
          : Promise.resolve({ data: [] })).then(function (aq) {
          var by = {};
          (aq.data || []).forEach(function (x) { by[x.id] = x; });
          return rows.map(function (r) {
            var a = by[r.artist_id] || {};
            return { artistId: r.artist_id, rank: r.rank, name: a.name || '', handle: a.handle || '', avatar: a.avatar || '' };
          });
        });
      }).then(function (data) {
        if (data) favCache[uid] = { data: data, at: Date.now(), stale: gen !== (favGen[uid] || 0) };
        if (favAsk[uid] === p) delete favAsk[uid];
        if (data) emit('tours');
      }, function () { if (favAsk[uid] === p) delete favAsk[uid]; });
    p.gen = gen;
    favAsk[uid] = p;
    return p;
  }
  function loadTopFans(artistId) {
    var gen = topFanGen[artistId] || 0, ask = topFanAsk[artistId];
    if (ask && ask.gen === gen) return ask;
    var p = sb.rpc('artist_top_fans', { a_id: artistId }).then(function (q) {
      if (q.error) {
        if (fnMissing(q.error)) { favKnown = false; delete topFanCache[artistId]; emit('tours'); }
        return null;
      }
      return (Array.isArray(q.data) ? q.data : []).map(function (r) {
        return { userId: r.userId, name: r.name || '', avatar: r.avatar || '', shows: Number(r.shows) || 0 };
      });
    }).then(function (data) {
      if (data) topFanCache[artistId] = { data: data, at: Date.now(), stale: gen !== (topFanGen[artistId] || 0) };
      if (topFanAsk[artistId] === p) delete topFanAsk[artistId];
      if (data) emit('tours');
    }, function () { if (topFanAsk[artistId] === p) delete topFanAsk[artistId]; });
    p.gen = gen;
    topFanAsk[artistId] = p;
    return p;
  }
  function todoProbe() {
    if (todoProbing || !session) return;
    todoProbing = true;
    sb.from('todo_items').select('id').limit(1).then(function (q) {
      todoProbing = false;
      if (!q.error) { todoKnown = true; emit('tours'); }
      else if (tableMissing(q.error)) todoKnown = false;
    }, function () { todoProbing = false; });
  }
  function todoStale() {
    Object.keys(todoCache).forEach(function (k) { todoGen[k] = (todoGen[k] || 0) + 1; if (todoCache[k]) todoCache[k].stale = true; });
    myTodoGen += 1;
    if (myTodoCache) myTodoCache.stale = true;
  }
  function todoError(e) {
    if (tableMissing(e)) { todoKnown = false; emit('tours'); return err('unavailable'); }
    if (/500 tasks/.test(String(e && e.message || ''))) {
      var full = new Error(String(e.message)); full.code = 'full';
      return full;
    }
    return mapError(e);
  }
  function todoShape(r, names) {
    return { id: r.id, artistId: r.artist_id, cat: r.cat || 'other', body: r.body || '',
      assignedTo: r.assigned_to || null, assignedName: r.assigned_to ? ((names || {})[r.assigned_to] || '') : '',
      due: r.due || null, doneAt: r.done_at || null, createdBy: r.created_by, createdAt: r.created_at };
  }
  function todoPutBack(r) {
    var c = todoCache[r.artist_id];
    if (c && c.data && c.data.can) {
      var it = todoShape(r, c.data.names), had = false;
      c.data.items = c.data.items.map(function (x) { if (x.id !== it.id) return x; had = true; return it; });
      if (!had) c.data.items.push(it);
    }
    if (myTodoCache && myTodoCache.data) myTodoCache.data.forEach(function (x) {
      if (x.id !== r.id) return;
      x.cat = r.cat || 'other'; x.body = r.body || ''; x.due = r.due || null; x.doneAt = r.done_at || null;
      if (x.assignedTo !== (r.assigned_to || null)) { x.assignedTo = r.assigned_to || null; x.assignedName = ''; }
    });
  }
  function loadTodos(artistId) {
    var gen = todoGen[artistId] || 0, ask = todoAsk[artistId];
    if (ask && ask.gen === gen) return ask;
    if (!session) return;
    var p = sb.rpc('todo_can_see', { a_id: artistId, u: session.user.id }).then(function (q) {
      if (q.error) {
        if (tableMissing(q.error) || fnMissing(q.error)) { todoKnown = false; delete todoCache[artistId]; emit('tours'); }
        return null;
      }
      if (q.data !== true) return { can: false };
      return Promise.all([
        sb.from('todo_items').select(TODO_COLS).eq('artist_id', artistId).order('created_at'),
        sb.from('todo_invites').select('user_id, invited_by, at').eq('artist_id', artistId).order('at')
      ]).then(function (qs) {
        if (qs[0].error || qs[1].error) {
          if (tableMissing(qs[0].error) || tableMissing(qs[1].error)) { todoKnown = false; delete todoCache[artistId]; emit('tours'); }
          return null;
        }
        var ids = [];
        (qs[0].data || []).forEach(function (r) { if (r.assigned_to && ids.indexOf(r.assigned_to) < 0) ids.push(r.assigned_to); });
        (qs[1].data || []).forEach(function (r) { if (r.user_id && ids.indexOf(r.user_id) < 0) ids.push(r.user_id); });
        return (ids.length ? sb.from('profiles').select('user_id, full_name, username').in('user_id', ids)
          : Promise.resolve({ data: [] })).then(function (pq) {
          var names = {};
          (pq.data || []).forEach(function (x) { names[x.user_id] = x.full_name || x.username || ''; });
          return { can: true, names: names,
            items: (qs[0].data || []).map(function (r) { return todoShape(r, names); }),
            invites: (qs[1].data || []).map(function (r) { return { userId: r.user_id, name: names[r.user_id] || '', invitedBy: r.invited_by, at: r.at }; }) };
        });
      });
    }).then(function (data) {
      if (data) todoCache[artistId] = { data: data, at: Date.now(), stale: gen !== (todoGen[artistId] || 0) };
      if (todoAsk[artistId] === p) delete todoAsk[artistId];
      if (data) emit('tours');
    }, function () { if (todoAsk[artistId] === p) delete todoAsk[artistId]; });
    p.gen = gen;
    todoAsk[artistId] = p;
    return p;
  }
  function loadMyTodos() {
    var gen = myTodoGen, ask = myTodoAsk;
    if (ask && ask.gen === gen) return ask;
    var p = sb.from('todo_items').select(TODO_COLS).order('created_at').then(function (q) {
      if (q.error) {
        if (tableMissing(q.error)) { todoKnown = false; myTodoCache = null; emit('tours'); }
        return null;
      }
      var rows = q.data || [], aIds = [], uIds = [];
      rows.forEach(function (r) {
        if (r.artist_id && aIds.indexOf(r.artist_id) < 0) aIds.push(r.artist_id);
        if (r.assigned_to && uIds.indexOf(r.assigned_to) < 0) uIds.push(r.assigned_to);
      });
      return Promise.all([
        aIds.length ? sb.from('artists').select('id, name').in('id', aIds) : Promise.resolve({ data: [] }),
        uIds.length ? sb.from('profiles').select('user_id, full_name, username').in('user_id', uIds) : Promise.resolve({ data: [] })
      ]).then(function (qs) {
        var an = {}, names = {};
        (qs[0].data || []).forEach(function (x) { an[x.id] = x.name || ''; });
        (qs[1].data || []).forEach(function (x) { names[x.user_id] = x.full_name || x.username || ''; });
        return rows.map(function (r) {
          var it = todoShape(r, names);
          it.artistName = an[r.artist_id] || 'Artist';
          return it;
        });
      });
    }).then(function (data) {
      if (data) myTodoCache = { data: data, at: Date.now(), stale: gen !== myTodoGen };
      if (myTodoAsk === p) myTodoAsk = null;
      if (data) emit('tours');
    }, function () { if (myTodoAsk === p) myTodoAsk = null; });
    p.gen = gen;
    myTodoAsk = p;
    return p;
  }
  function spotProbe() {
    if (spotProbing || !session) return;
    spotProbing = true;
    sb.from('local_spots').select('id' + SPOT_GEO_COLS).limit(1).then(function (q) {
      spotProbing = false;
      if (!q.error) { spotGeo = true; spotKnown = true; emit('tours'); }
      else if (tableMissing(q.error)) spotKnown = false;
      else if (columnMissing(q.error)) { spotGeo = false; spotKnown = true; emit('tours'); }
    }, function () { spotProbing = false; });
  }
  function spotCols() { return SPOT_COLS + (spotGeo === true ? SPOT_GEO_COLS : ''); }
  function sdProbe() {
    if (sdProbing || !session) return;
    sdProbing = true;
    sb.rpc('spot_details_ask', { spot_id: 0 }).then(function (q) {
      sdProbing = false;
      if (q.error && fnMissing(q.error)) sdKnown = false;
      else if (!q.error) { sdKnown = true; emit('tours'); }
    }, function () { sdProbing = false; });
  }
  function spotDetailShape(d) {
    var s = function (v, n) { return String(v == null ? '' : v).trim().slice(0, n); };
    var web = s(d.website, 300);
    return { website: /^https?:\/\/[^\s<>"]+$/i.test(web) ? web : '', phone: s(d.phone, 40), hours: s(d.hours, 255),
      cuisine: s(d.cuisine, 80), area: s(d.area, 80), street: s(d.street, 120), postcode: s(d.postcode, 20) };
  }
  function spotGeoKeep(id, g) {
    if (!g || g.lat == null || g.lon == null) return;
    var fix = function (x) {
      if (!x || x.id !== id || x.lat != null) return;
      x.lat = g.lat; x.lon = g.lon;
      if (g.address && !x.address) x.address = g.address;
      if (g.osmRef && !x.osmRef) x.osmRef = g.osmRef;
    };
    if (mySpotCache && mySpotCache.data) mySpotCache.data.forEach(fix);
    Object.keys(tourSpotCache).forEach(function (k) { var t = tourSpotCache[k]; if (t && t.data) t.data.forEach(fix); });
    Object.keys(fsCache).forEach(function (k) { var t = fsCache[k]; if (t && t.data) t.data.forEach(fix); });
  }
  function spotGeoGone(e) {
    if (spotGeo === true && columnMissing(e) && !tableMissing(e)) { spotGeo = false; return true; }
    return false;
  }
  function spotsStale() {
    Object.keys(tourSpotCache).forEach(function (k) { tourSpotGen[k] = (tourSpotGen[k] || 0) + 1; if (tourSpotCache[k]) tourSpotCache[k].stale = true; });
    mySpotGen += 1;
    if (mySpotCache) mySpotCache.stale = true;
  }
  function spotError(e) {
    if (tableMissing(e)) { spotKnown = false; emit('tours'); return err('unavailable'); }
    return mapError(e);
  }
  function spotRow(p) {
    var row = {};
    if ('city' in p) {
      row.city = String(p.city || '').trim().slice(0, 60);
      var G = window.GR;
      if (G && G.roadCityKey) row.city_key = String(G.roadCityKey(row.city)).slice(0, 80);
    }
    if ('name' in p) row.name = String(p.name || '').trim().slice(0, 80);
    if ('kind' in p) row.kind = SPOT_KINDS.indexOf(String(p.kind || '')) >= 0 ? String(p.kind) : 'other';
    if ('note' in p) row.note = String(p.note || '').trim().slice(0, 240) || null;
    if ('tourId' in p) row.tour_id = p.tourId || null;
    if (spotGeo === true) {
      if ('lat' in p || 'lon' in p) {
        var la = p.lat, lo = p.lon;
        var ok = typeof la === 'number' && typeof lo === 'number' && isFinite(la) && isFinite(lo) &&
          Math.abs(la) <= 90 && Math.abs(lo) <= 180;
        row.lat = ok ? la : null; row.lon = ok ? lo : null;
      }
      if ('address' in p) row.address = String(p.address || '').trim().slice(0, 160) || null;
      if ('osmRef' in p) row.osm_ref = /^[NWR]\d{1,20}$/.test(String(p.osmRef || '')) ? String(p.osmRef) : null;
    }
    return row;
  }
  function spotShape(r) {
    var it = { id: r.id, tourId: r.tour_id || null, city: r.city || '', cityKey: r.city_key || '',
      name: r.name || '', kind: r.kind || 'other', note: r.note || '', createdAt: r.created_at };
    if (r.lat != null && r.lon != null) { it.lat = Number(r.lat); it.lon = Number(r.lon); }
    if (r.address) it.address = String(r.address);
    if (r.osm_ref) it.osmRef = String(r.osm_ref);
    return it;
  }
  function loadMySpots() {
    if (!session) return;
    var gen = mySpotGen, ask = mySpotAsk;
    if (ask && ask.gen === gen) return ask;
    var p = sb.from('local_spots').select(spotCols()).eq('user_id', session.user.id).order('created_at')
      .then(function (q) {
        if (q.error) {
          if (tableMissing(q.error)) { spotKnown = false; mySpotCache = null; emit('tours'); }
          else if (spotGeoGone(q.error)) emit('tours');
          return null;
        }
        return (q.data || []).map(spotShape);
      }).then(function (data) {
        if (data) mySpotCache = { data: data, at: Date.now(), stale: gen !== mySpotGen };
        if (mySpotAsk === p) mySpotAsk = null;
        if (data) emit('tours');
      }, function () { if (mySpotAsk === p) mySpotAsk = null; });
    p.gen = gen;
    mySpotAsk = p;
    return p;
  }
  function loadTourSpots(tourId, cityKey) {
    var k = tourId + '|' + String(cityKey || '');
    var gen = tourSpotGen[k] || 0, ask = tourSpotAsk[k];
    if (ask && ask.gen === gen) return ask;
    var p = sb.from('local_spots').select(spotCols() + ', user_id')
      .eq('tour_id', tourId).eq('city_key', String(cityKey || '')).order('created_at')
      .then(function (q) {
        if (q.error) {
          if (tableMissing(q.error)) { spotKnown = false; delete tourSpotCache[k]; emit('tours'); }
          else if (spotGeoGone(q.error)) emit('tours');
          return null;
        }
        var rows = q.data || [], ids = [];
        rows.forEach(function (r) { if (r.user_id && ids.indexOf(r.user_id) < 0) ids.push(r.user_id); });
        return (ids.length ? sb.from('profiles').select('user_id, full_name, username').in('user_id', ids)
          : Promise.resolve({ data: [] })).then(function (pq) {
          var names = {};
          (pq.data || []).forEach(function (x) { names[x.user_id] = x.full_name || x.username || ''; });
          return rows.map(function (r) {
            var it = spotShape(r);
            it.userId = r.user_id;
            it.who = String(names[r.user_id] || '').trim().split(/\s+/)[0] || 'Someone';
            return it;
          });
        });
      }).then(function (data) {
        if (data) tourSpotCache[k] = { data: data, at: Date.now(), stale: gen !== (tourSpotGen[k] || 0) };
        if (tourSpotAsk[k] === p) delete tourSpotAsk[k];
        if (data) emit('tours');
      }, function () { if (tourSpotAsk[k] === p) delete tourSpotAsk[k]; });
    p.gen = gen;
    tourSpotAsk[k] = p;
    return p;
  }
  function rateProbe() {
    if (rateProbing || !session) return;
    rateProbing = true;
    sb.from('venue_ratings').select('venue_id').limit(1).then(function (q) {
      rateProbing = false;
      if (!q.error) { rateKnown = true; emit('tours'); }
      else if (tableMissing(q.error)) rateKnown = false;
    }, function () { rateProbing = false; });
  }
  function reviewProbe() {
    if (reviewProbing || !session) return;
    reviewProbing = true;
    sb.from('show_ratings').select('review').limit(1).then(function (q) {
      reviewProbing = false;
      if (!q.error) { reviewKnown = true; sizeProbe(); emit('tours'); }
      else if (columnMissing(q.error) || tableMissing(q.error)) reviewKnown = false;
    }, function () { reviewProbing = false; });
  }
  function sizeProbe() {
    if (sizeProbing || !session) return;
    sizeProbing = true;
    sb.rpc('show_review_ok', { review: { size: { level: 0 } } }).then(function (q) {
      sizeProbing = false;
      if (!q.error) { sizeKnown = q.data === true; sizeAt = Date.now(); emit('tours'); }
      else if (q.error.code || fnMissing(q.error)) { sizeKnown = false; sizeAt = Date.now(); }
    }, function () { sizeProbing = false; });
  }
  function showRateStale() {
    Object.keys(showRateCache).forEach(function (k) { showRateGen[k] = (showRateGen[k] || 0) + 1; if (showRateCache[k]) showRateCache[k].stale = true; });
  }
  function loadShowRatings(tourId) {
    var gen = showRateGen[tourId] || 0, ask = showRateAsk[tourId];
    if (ask && ask.gen === gen) return ask;
    var p = sb.from('show_ratings').select('show_id, user_id, crowd, venue, city, at').eq('tour_id', tourId)
      .then(function (q) {
        if (q.error) {
          if (tableMissing(q.error)) { rateKnown = false; delete showRateCache[tourId]; emit('tours'); }
          return null;
        }
        return (q.data || []).map(function (r) {
          return { showId: r.show_id, userId: r.user_id, crowd: r.crowd, venue: r.venue, city: r.city, at: r.at };
        });
      }).then(function (data) {
        if (data) showRateCache[tourId] = { data: data, at: Date.now(), stale: gen !== (showRateGen[tourId] || 0) };
        if (showRateAsk[tourId] === p) delete showRateAsk[tourId];
        if (data) emit('tours');
      }, function () { if (showRateAsk[tourId] === p) delete showRateAsk[tourId]; });
    p.gen = gen;
    showRateAsk[tourId] = p;
    return p;
  }
  function flowersStale() {
    Object.keys(flowerCache).forEach(function (k) { flowerGen[k] = (flowerGen[k] || 0) + 1; flowerCache[k].stale = true; });
    myFlowerGen += 1;
    if (myFlowerCache) myFlowerCache.stale = true;
  }
  function flowersChanged() {
    clearTimeout(flowerTimer);
    flowerTimer = setTimeout(function () { flowersStale(); emit('tours'); }, 300);
  }
  var socialFns = [], pokeTimer = 0, pokeWhat = [], pokeBusy = false, pokeOwed = false, missedAt = 0;
  function socialTell(what) {
    socialFns.forEach(function (fn) { try { fn(what || ''); } catch (e) {   } });
  }
  function poked(what) {
    var w = String(what || '').slice(0, 40);
    if (w && pokeWhat.indexOf(w) < 0) pokeWhat.push(w);
    clearTimeout(pokeTimer);
    pokeTimer = setTimeout(pokeRun, 400);
  }
  async function pokeRun() {
    if (pokeBusy) { pokeOwed = true; return; }
    if (!session || !legalStarted) { pokeWhat = []; return; }
    pokeBusy = true;
    var what = pokeWhat.join(','); pokeWhat = [];
    try { await sgLimit(sb.rpc('claim_invites'), 10000); } catch (e) {   }
    pokeBusy = false;
    if (session && legalStarted) {
      refetchTries = 0; scheduleRefetch();
      flowersChanged();
      if (!what || /(^|,)bus(,|$)/.test(what)) busStale();
      if (!what || /(^|,)buyout(,|$)/.test(what)) buyoutStale();
      if (!what || /(^|,)todo(,|$)/.test(what)) todoStale();
      if (!what || /(^|,)supply(,|$)/.test(what)) supplyStale();
      socialTell(what);
    }
    if (pokeOwed) { pokeOwed = false; poked(''); }
  }
  function socialMissed() {
    if (!session || !legalStarted || Date.now() - missedAt < 2000) return;
    missedAt = Date.now();
    busStale();
    buyoutStale();
    todoStale();
    supplyStale();
    showRateStale();
    socialTell('');
    if (!pokeBusy) sgLimit(sb.rpc('claim_invites'), 10000).then(function () {}, function () {   });
  }
  function feedChanged() {
    if (!feedListeners.length) return;
    clearTimeout(feedTimer);
    feedTimer = setTimeout(function () { loadFeed(false); }, 300);
  }
  var TOUR_ROLES = ['Tour manager', 'FOH engineer', 'Merch manager', 'Driver', 'Backline tech',
    'Monitor engineer', 'Drum tech', 'Lighting director', 'Photographer / videographer', 'Playback tech',
    'Production manager', 'Stage manager',
    'Assistant TM / production coordinator', 'Truck driver', 'Head of security / personal security',
    'VIP coordinator', 'Wardrobe / stylist', 'Hair & makeup artist', 'Head rigger', 'Tour accountant',
    'Band', 'Touring Musician'];
  function tourRoles() {
    var G = window.GR;
    return (G && Array.isArray(G.CREW_ROLES) && G.CREW_ROLES.length ? G.CREW_ROLES : TOUR_ROLES).slice();
  }
  function roleName(r) {
    var t = String(r || '').trim();
    return t === 'Artist/Owner' ? 'Artist' : t;
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function rolePickerHtml(id, current) {
    return '<input type="hidden" id="' + id + '" value="' + esc(current || '') + '">' +
      '<button type="button" class="input role-pick' + (current ? '' : ' empty') + '" id="' + id +
      '-btn" aria-haspopup="listbox">' + esc(current || 'Your role on the tour') + '</button>';
  }
  function openRolePicker(current, onPick, o) {
    o = o || {};
    sgStyle();
    var cur = String(current || '').trim();
    var title = String(o.title || 'Your role on the tour');
    var groups = Array.isArray(o.groups) && o.groups.length ? o.groups
      : [{ key: '', head: '', roles: Array.isArray(o.roles) && o.roles.length ? o.roles : tourRoles() }];
    var ov = sgEl('div', 'role-picker');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-label', title);
    var card = sgEl('div', 'rp-card');
    card.appendChild(sgEl('div', 'rp-head', title));
    var list = sgEl('div', 'rp-list');
    list.setAttribute('role', 'listbox');
    var onEl = null;
    function done(role, how) { ov.remove(); onPick(role, how); }
    groups.forEach(function (g) {
      if (!g || !Array.isArray(g.roles)) return;
      if (g.head) list.appendChild(sgEl('div', 'rp-head rp-sub', String(g.head)));
      g.roles.forEach(function (r) {
        var name = String(r);
        var on = !onEl && !!cur && name.toLowerCase() === cur.toLowerCase();
        var b = sgEl('button', 'rp-opt' + (on ? ' on' : ''), name);
        b.type = 'button';
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', String(on));
        b.addEventListener('click', function () { done(name, { group: String(g.key || ''), typed: false }); });
        if (on) onEl = b;
        list.appendChild(b);
      });
    });
    if (o.other !== false) {
      var mine = !!cur && !onEl;
      var otherB = sgEl('button', 'rp-opt' + (mine ? ' on' : ''), 'Other');
      otherB.type = 'button';
      otherB.setAttribute('role', 'option');
      otherB.setAttribute('aria-selected', String(mine));
      var box = sgEl('form', 'rp-other');
      box.setAttribute('novalidate', '');
      box.hidden = !mine;
      var inp = sgEl('input', 'input');
      inp.type = 'text';
      inp.setAttribute('maxlength', '40');
      inp.setAttribute('placeholder', 'Type the role');
      inp.setAttribute('aria-label', 'The role, typed');
      inp.setAttribute('autocapitalize', 'words');
      inp.setAttribute('autocomplete', 'off');
      inp.value = mine ? cur : '';
      var use = sgEl('button', 'btn primary block', 'Use this role');
      use.type = 'submit';
      box.appendChild(inp); box.appendChild(use);
      otherB.addEventListener('click', function () {
        box.hidden = false;
        try { inp.focus(); } catch (e) {   }
        if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest' });
      });
      box.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = String(inp.value || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!v) { try { inp.focus(); } catch (e2) {   } return; }
        done(v, { group: '', typed: true });
      });
      list.appendChild(otherB); list.appendChild(box);
      if (mine) onEl = otherB;
    }
    card.appendChild(list);
    ov.appendChild(card);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    if (onEl && onEl.scrollIntoView) onEl.scrollIntoView({ block: 'center' });
  }
  function wireRolePicker(root, id) {
    var hidden = root.querySelector('#' + id), btn = root.querySelector('#' + id + '-btn');
    if (!hidden || !btn) return;
    btn.addEventListener('click', function () {
      openRolePicker(hidden.value, function (role) {
        hidden.value = role;
        btn.textContent = role;
        btn.classList.remove('empty');
      });
    });
  }
  function appUrl() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
  async function sendPasswordLink(email) {
    var c = sbMod.createClient(cfg.url, cfg.anonKey, { auth: {
      flowType: 'implicit', persistSession: false, autoRefreshToken: false,
      detectSessionInUrl: false, storageKey: 'gr-password-link' } });
    var inShell = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    var q = await c.auth.resetPasswordForEmail(email, { redirectTo: inShell ? 'https://devinoliverofficial.github.io/greenroom/' : appUrl() });
    if (q.error) throw q.error;
  }
  var SG_CSS = [
    '#gr-gate.sg-host, #gr-pass-gate.sg-host { display: block; padding: calc(8px + env(safe-area-inset-top, 0px)) 20px calc(40px + env(safe-area-inset-bottom, 0px)); }',
    '.sg { width: 100%; max-width: 440px; margin: 0 auto; text-align: left; color: var(--ink, #F1F4E3); }',
    '.sg-top { display: flex; align-items: center; height: 44px; margin: 0 0 12px -10px; }',
    '.sg-back { -webkit-appearance: none; appearance: none; border: 0; background: none; color: var(--ink, #F1F4E3); width: 44px; height: 44px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; cursor: pointer; }',
    '.sg-back svg { display: block; width: 26px; height: 26px; }',
    '.sg-title { margin: 0 0 8px; font-size: 26px; line-height: 1.15; font-weight: 800; letter-spacing: -.02em; color: var(--ink, #F1F4E3); }',
    '.sg-sub { margin: 0 0 22px; font-size: 15px; line-height: 1.45; font-weight: 400; color: var(--ink-2, #8F947B); overflow-wrap: break-word; }',
    '.sg-sub + .sg-sub { margin-top: -14px; }',
    '.sg-form { display: block; margin: 0; }',
    '.sg-field { position: relative; display: block; margin: 0 0 10px; padding: 10px 50px 10px 16px; min-height: 64px; border: 1px solid var(--ink-3, #626750); border-radius: 16px; background: var(--surface, #0C0F02); text-align: left; cursor: text; }',
    '.sg-field:focus-within { border-color: var(--brand, #CCF80A); box-shadow: 0 0 0 3px var(--ring, rgba(204, 248, 10, .3)); }',
    '.sg-label { display: block; font-size: 12.5px; line-height: 1.3; font-weight: 500; color: var(--ink-2, #8F947B); }',
    '.sg-input { display: block; width: 100%; height: 26px; margin: 1px 0 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; color: var(--ink, #F1F4E3); font: inherit; font-size: 17px; font-weight: 600; line-height: 26px; -webkit-appearance: none; appearance: none; }',
    '.sg-input:focus, .sg-input:focus-visible { outline: none; border-radius: 0; box-shadow: none; }',
    '.sg-input:-webkit-autofill { -webkit-text-fill-color: var(--ink, #F1F4E3); caret-color: var(--ink, #F1F4E3); transition: background-color 99999s ease-out 0s; }',
    '.sg-ghost { position: absolute; left: 0; top: 0; width: 1px; height: 1px; padding: 0; border: 0; opacity: 0; pointer-events: none; }',
    '.sg-tick { position: absolute; right: 14px; top: 50%; width: 24px; height: 24px; margin-top: -12px; color: var(--pos, #CCF80A); display: none; pointer-events: none; }',
    '.sg-tick svg { display: block; width: 24px; height: 24px; }',
    '.sg-field.ok .sg-tick { display: block; }',
    '.sg-err { min-height: 20px; margin: 0 2px; font-size: 14px; line-height: 1.4; color: var(--neg, #FF5F57); text-align: left; }',
    '.sg-err.quiet { color: var(--ink-2, #8F947B); }',
    '.sg-err .linkbtn { display: inline; min-height: 0; margin: 0; padding: 0; font-size: inherit; }',
    '.sg .btn.primary.sg-next { display: flex; width: 100%; min-height: 52px; margin: 14px 0 0; border-radius: 999px; }',
    '.sg-more { display: grid; justify-items: start; gap: 2px; margin: 18px 2px 0; }',
    '.sg-more .linkbtn { min-height: 40px; margin: 0; font-size: 15px; text-align: left; font-variant-numeric: tabular-nums; }',
    '.sg-more .linkbtn:disabled { color: var(--ink-3, #626750); text-decoration: none; cursor: default; }',
    '.sg-field.sg-picks { cursor: pointer; }',
    '.sg-date { display: flex; flex-wrap: wrap; margin: 1px 0 0; }',
    '.sg-pickb { -webkit-appearance: none; appearance: none; border: 0; background: none; height: 40px; margin: -7px 0; padding: 0 12px 0 0; color: var(--ink, #F1F4E3); font: inherit; font-size: 17px; font-weight: 600; line-height: 40px; text-align: left; cursor: pointer; }',
    '.sg-pickb.empty { color: var(--ink-3, #626750); font-weight: 500; }',
    '.sg-pickb:focus, .sg-pickb:focus-visible { outline: none; }',
    '.sg-pick { position: fixed; inset: 0; z-index: 200; background: rgba(0, 0, 0, .62); display: flex; align-items: flex-end; justify-content: center; }',
    '.sg-pick-card { width: 100%; max-width: 520px; max-height: 72vh; display: flex; flex-direction: column; background: var(--surface-2, #161A07); border: 1px solid var(--ink-3, #626750); border-bottom: 0; border-radius: 20px 20px 0 0; padding-bottom: env(safe-area-inset-bottom, 0px); }',
    '.sg-pick-head { display: flex; align-items: center; justify-content: space-between; padding: 6px 8px 2px 20px; font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2, #8F947B); text-align: left; }',
    '.sg-pick-x { -webkit-appearance: none; appearance: none; flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 12px; background: none; color: var(--ink-2, #8F947B); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }',
    '.sg-pick-x svg { display: block; width: 22px; height: 22px; }',
    '.sg-pick-list { overflow-y: auto; -webkit-overflow-scrolling: touch; display: grid; gap: 2px; padding: 0 10px 12px; }',
    '.sg-pick-opt { -webkit-appearance: none; appearance: none; display: block; width: 100%; min-height: 48px; padding: 0 2px; border: 0; border-radius: 12px; background: none; color: var(--ink, #F1F4E3); font: inherit; font-size: 16px; font-weight: 600; text-align: center; cursor: pointer; }',
    '.sg-pick-opt.on { color: var(--on-brand, #121500); background: var(--brand, #CCF80A); }',
    '.sg-doc { margin: 0 0 20px; font-size: 15.5px; line-height: 1.55; font-weight: 400; color: var(--ink, #F1F4E3); text-align: left; overflow-wrap: break-word; }',
    '.sg-doc h2, .sg-doc h3, .sg-doc h4 { margin: 24px 0 8px; line-height: 1.25; font-weight: 800; letter-spacing: -.01em; color: var(--ink, #F1F4E3); }',
    '.sg-doc h2 { font-size: 20px; }',
    '.sg-doc h3 { font-size: 17px; }',
    '.sg-doc h4 { font-size: 15.5px; }',
    '.sg-doc p { margin: 0 0 12px; }',
    '.sg-doc ul { margin: 0 0 12px; padding: 0 0 0 22px; list-style: disc; }',
    '.sg-doc li { margin: 0 0 6px; }',
    '.sg-doc li.in { margin-left: 18px; list-style: circle; }',
    '.sg-doc hr { height: 0; margin: 20px 0; border: 0; border-top: 1px solid var(--ink-3, #626750); }',
    '.sg-doc strong { font-weight: 800; }',
    '.sg-doc > :first-child { margin-top: 0; }',
    '.sg-flag { margin: 0 0 6px; font-size: 13px; line-height: 1.3; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--pos, #CCF80A); }',
    '.sg-again { margin: 0 0 10px; font-size: 14px; line-height: 1.4; font-weight: 600; color: var(--neg, #FF5F57); }',
    '.sg-more .linkbtn.sg-out { color: var(--ink-2, #8F947B); font-weight: 600; }',
    '.sg-agree { display: flex; align-items: flex-start; gap: 12px; margin: 0 0 10px; padding: 14px 16px; border: 1px solid var(--ink-3, #626750); border-radius: 16px; background: var(--surface, #0C0F02); font-size: 15px; line-height: 1.45; font-weight: 600; color: var(--ink, #F1F4E3); text-align: left; cursor: pointer; }',
    '.sg-agree input { flex: none; width: 24px; height: 24px; margin: 0; accent-color: var(--brand, #CCF80A); }',
    '.rp-head.rp-sub { padding: 14px 20px 8px; border-top: 1px solid var(--line-2, #2A3305); }',
    '.rp-other { display: grid; gap: 10px; padding: 4px 20px 16px; }',
    '.rp-other[hidden] { display: none; }'
  ].join('\n');
  function sgStyle() {
    if (document.getElementById('gr-sg-style')) return;
    var st = document.createElement('style');
    st.id = 'gr-sg-style';
    st.textContent = SG_CSS;
    document.head.appendChild(st);
  }
  var SG_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var SG_ICON = {
    back: SG_SVG + '<path d="M15 5l-7 7 7 7"/></svg>',
    close: SG_SVG + '<path d="M6 6l12 12M18 6L6 18"/></svg>',
    tick: SG_SVG + '<circle cx="12" cy="12" r="9.5"/><path d="M7.8 12.4l2.9 2.9 5.5-6.1"/></svg>'
  };
  var SG_OFFLINE = 'Couldn’t reach the server. Check your connection and try again.';
  var SG_BADCODE = 'That code didn’t work. Check it and try again.';
  var SG_SLOW = 'Too many tries. Wait a few minutes and try again.';
  var SG_SOON = 'Greenroom isn’t taking new sign-ups just yet. Try again soon.';
  var SG_OFF = 'Greenroom isn’t taking new sign-ups yet. Ask the person who gave you the code.';
  var SG_MAIL = 'We couldn’t send the email just now. Wait a few minutes and try again.';
  var SG_AGAIN = 'That didn’t work. Try again in a minute.';
  var SG_LETTERS = 'A Greenroom code has letters in it, like GR-7KQ2-M4XD.';
  var SG_NOCODE = 'That code wasn’t recognised. Check it and try again. ' + SG_LETTERS;
  var SG_SHAPE = '3 to 24 letters, numbers, dots or underscores.';
  var SG_HANDLE = /^[a-z0-9._]{3,24}$/;
  var SG_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var SG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'];
  function sgLimit(work, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(err('offline')); }, ms || 15000);
      Promise.resolve(work).then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function sgNoAnswer(e) {
    if (!e) return false;
    if (e.code === 'offline' || e.name === 'AuthRetryableFetchError' || e.status === 0) return true;
    return /failed to fetch|load failed|network|timed? ?out/i.test(String(e.message || ''));
  }
  function sgNoData(q) {
    if (fnMissing(q && q.error)) return SG_SOON;
    return !q || q.status === 0 || sgNoAnswer(q.error) ? SG_OFFLINE : SG_AGAIN;
  }
  async function signupSettings() {
    try {
      var s = await sgLimit(fetch(cfg.url + '/auth/v1/settings', { headers: { apikey: cfg.anonKey }, cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; }), 5000);
      if (!isObj(s)) return null;
      return { open: s.disable_signup !== true && !(isObj(s.external) && s.external.email === false),
        confirm: s.mailer_autoconfirm !== true };
    } catch (e) { return null; }
  }
  var PASS_MIN = 8;
  function sgPassSay(msg) {
    var n = /at least (\d+)/i.exec(msg);
    if (/weak|easy to guess|pwned|compromised/i.test(msg)) return 'That password is too easy to guess. Pick a different one.';
    return n ? 'Pick a longer password (' + n[1] + ' characters or more).' : 'Pick a longer password.';
  }
  function sgEl(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function sgTick() {
    var t = sgEl('span', 'sg-tick');
    t.setAttribute('aria-hidden', 'true');
    t.innerHTML = SG_ICON.tick;
    return t;
  }
  function sgScreen(host, o) {
    sgStyle();
    host.classList.add('sg-host');
    host.textContent = '';
    host.scrollTop = 0;
    var box = sgEl('div', 'sg');
    var top = sgEl('div', 'sg-top');
    if (o.onBack) {
      var back = sgEl('button', 'sg-back');
      back.type = 'button';
      back.setAttribute('aria-label', o.first ? 'Close' : 'Back');
      back.innerHTML = o.first ? SG_ICON.close : SG_ICON.back;
      back.addEventListener('click', function () { o.onBack(); });
      top.appendChild(back);
    }
    box.appendChild(top);
    box.appendChild(sgEl('h1', 'sg-title', o.title));
    box.appendChild(sgEl('p', 'sg-sub', o.sub));
    var form = sgEl('form', 'sg-form');
    form.setAttribute('novalidate', '');
    var ui = { host: host, form: form, inputs: [], fields: [], labels: [] };
    (o.fields || []).forEach(function (f) {
      var field = sgEl('label', 'sg-field');
      var lab = sgEl('span', 'sg-label', f.label);
      var inp = sgEl('input', 'sg-input' + (f.cls ? ' ' + f.cls : ''));
      inp.type = f.type || 'text';
      inp.setAttribute('enterkeyhint', 'next');
      Object.keys(f.attrs || {}).forEach(function (k) { inp.setAttribute(k, f.attrs[k]); });
      inp.value = f.value || '';
      inp.addEventListener('input', function () { if (o.onInput) o.onInput(ui, inp); });
      field.appendChild(lab); field.appendChild(inp); field.appendChild(sgTick());
      form.appendChild(field);
      ui.inputs.push(inp); ui.fields.push(field); ui.labels.push(lab);
    });
    if (o.body) form.appendChild(o.body);
    var errEl = sgEl('div', 'sg-err');
    errEl.setAttribute('role', 'alert');
    form.appendChild(errEl);
    var btn = sgEl('button', 'btn primary sg-next', o.next || 'Next');
    btn.type = 'submit';
    form.appendChild(btn);
    box.appendChild(form);
    host.appendChild(box);
    var busy = false, stopped = false;
    function sync() { btn.disabled = busy || stopped; }
    ui.say = function (text, quiet) {
      errEl.textContent = text || '';
      errEl.classList.toggle('quiet', !!quiet);
    };
    ui.act = function (label, fn) {
      var b = sgEl('button', 'linkbtn inline', label);
      b.type = 'button';
      b.addEventListener('click', fn);
      errEl.appendChild(document.createTextNode(' '));
      errEl.appendChild(b);
    };
    ui.ok = function (i, yes) { if (ui.fields[i]) ui.fields[i].classList.toggle('ok', !!yes); };
    ui.stop = function (yes) { stopped = !!yes; sync(); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy || stopped) return;
      ui.say('');
      var p;
      try { p = o.onNext(ui); } catch (x) { p = Promise.reject(x); }
      if (!p || typeof p.then !== 'function') return;
      busy = true; sync();
      p.then(function (how) { busy = how === 'wait'; sync(); },
        function () { busy = false; sync(); ui.say(SG_OFFLINE); });
    });
    var aim = ui.inputs[0] || o.focus;
    if (aim) {
      try { aim.focus(); } catch (e) {   }
      try { if (aim.value) aim.setSelectionRange(aim.value.length, aim.value.length); } catch (e) {   }
    }
    return ui;
  }
  var sgPickShut = null;
  function sgPick(title, opts, current, cols, near, onPick, opener) {
    sgStyle();
    if (sgPickShut) sgPickShut(false);
    var ov = sgEl('div', 'sg-pick');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', title);
    var card = sgEl('div', 'sg-pick-card');
    var head = sgEl('div', 'sg-pick-head');
    head.appendChild(sgEl('span', '', title));
    var x = sgEl('button', 'sg-pick-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.innerHTML = SG_ICON.close;
    head.appendChild(x);
    card.appendChild(head);
    var list = sgEl('div', 'sg-pick-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', title);
    list.style.gridTemplateColumns = 'repeat(' + (cols || 1) + ', 1fr)';
    function onKey(e) {
      if (e.key !== 'Escape' && e.key !== 'Esc') return;
      e.preventDefault(); e.stopPropagation();
      shut(true);
    }
    function shut(back) {
      if (sgPickShut !== shut) return;
      sgPickShut = null;
      document.removeEventListener('keydown', onKey, true);
      ov.remove();
      if (back && opener) { try { opener.focus(); } catch (e) {   } }
    }
    var onEl = null, nearEl = null;
    opts.forEach(function (opt) {
      var b = sgEl('button', 'sg-pick-opt' + (opt.value === current ? ' on' : ''), opt.label);
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(opt.value === current));
      b.addEventListener('click', function () { shut(true); onPick(opt.value); });
      if (opt.value === current) onEl = b;
      if (opt.value === near) nearEl = b;
      list.appendChild(b);
    });
    card.appendChild(list);
    ov.appendChild(card);
    x.addEventListener('click', function () { shut(true); });
    ov.addEventListener('click', function (e) { if (e.target === ov) shut(true); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(ov);
    sgPickShut = shut;
    var show = onEl || nearEl;
    if (show && show.scrollIntoView) show.scrollIntoView({ block: 'center' });
    var aim = show || list.firstChild;
    if (aim) { try { aim.focus({ preventScroll: true }); } catch (e) {   } }
  }
  function sgName(host, a, nav) {
    function read() {
      a.first = String(ui.inputs[0].value || '').trim().slice(0, 30);
      a.last = String(ui.inputs[1].value || '').trim().slice(0, 30);
      ui.ok(0, !!a.first); ui.ok(1, !!a.last);
    }
    var words = { maxlength: '30', autocapitalize: 'words', autocorrect: 'off', spellcheck: 'false' };
    var ui = sgScreen(host, {
      first: nav.first, onBack: nav.back,
      title: 'What’s your name?',
      sub: 'Your first and last name, the way people on the road know you.',
      fields: [
        { label: 'First name', value: a.first, attrs: Object.assign({ autocomplete: 'given-name' }, words) },
        { label: 'Last name', value: a.last, attrs: Object.assign({ autocomplete: 'family-name' }, words) }
      ],
      onInput: function () { read(); },
      onNext: function () {
        read();
        if (!a.first) { ui.say('Type your first name.'); ui.inputs[0].focus(); return; }
        if (!a.last) { ui.say('Type your last name.'); ui.inputs[1].focus(); return; }
        nav.next();
      }
    });
    read();
  }
  function sgSuggest(first, last) {
    function part(s) {
      var t = String(s || '').toLowerCase();
      try { t = t.normalize('NFD'); } catch (e) {   }
      return t.replace(/[^a-z0-9]+/g, '');
    }
    var f = part(first), l = part(last);
    var h = (f && l ? f + '.' + l : f || l).slice(0, 24).replace(/\.+$/, '');
    return SG_HANDLE.test(h) ? h : '';
  }
  function sgHandle(host, a, nav) {
    if (!a.handleMine) a.handle = sgSuggest(a.first, a.last);
    var timer = 0, seq = 0, known = '';
    function clean(v) { return String(v || '').toLowerCase().replace(/\s+/g, '').replace(/^@+/, '').slice(0, 24); }
    function look(v, pressed) {
      var mine = ++seq;
      if (!SG_HANDLE.test(v)) { ui.ok(0, false); ui.say(SG_SHAPE); return Promise.resolve(false); }
      return nav.check(v).then(function (r) {
        if (mine !== seq) return false;
        if (r && r.free === true) { known = v; ui.ok(0, true); ui.say(''); return true; }
        ui.ok(0, false);
        if (r && r.free === false) ui.say('That one is taken.');
        else if (r && r.why === 'slow') ui.say(SG_SLOW);
        else if (r && r.why === 'bad') ui.say(SG_BADCODE);
        else if (r && r.why === 'shape') ui.say(SG_SHAPE);
        else ui.say('Couldn’t check that name. Try again.');
        return false;
      }, function () {
        if (mine !== seq) return false;
        ui.ok(0, false);
        ui.say('Couldn’t check that name. Check your connection and try again.');
        if (pressed && nav.skip) ui.act('Skip for now', function () { a.handle = ''; a.handleMine = false; nav.next(); });
        return false;
      });
    }
    var ui = sgScreen(host, {
      first: nav.first,
      onBack: nav.back ? function () { clearTimeout(timer); seq += 1; nav.back(); } : null,
      title: 'Create a username',
      sub: 'This is your @name on Greenroom. Letters, numbers, dots and underscores. You can change it later.',
      fields: [{ label: 'Username', value: a.handle, attrs: { maxlength: '24', autocomplete: 'off',
        autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' } }],
      onInput: function (u, inp) {
        var v = clean(inp.value);
        if (v !== inp.value) inp.value = v;
        a.handle = v; a.handleMine = true;
        ui.ok(0, false); ui.say('');
        clearTimeout(timer); seq += 1;
        if (v) timer = setTimeout(function () { look(v, false); }, 350);
      },
      onNext: function () {
        var v = clean(ui.inputs[0].value);
        clearTimeout(timer);
        if (!v) { ui.say('Pick a username.'); ui.inputs[0].focus(); return; }
        if (known === v) { a.handle = v; nav.next(); return; }
        return look(v, true).then(function (free) { if (free) { a.handle = v; nav.next(); } });
      }
    });
    if (a.handle) look(a.handle, false);
  }
  function sgDays(y, m) { return m ? new Date(y || 2000, m, 0).getDate() : 31; }
  function sgDateParts(a, changed) {
    sgStyle();
    var line = sgEl('div', 'sg-date');
    function part(word, open) {
      var b = sgEl('button', 'sg-pickb empty', word);
      b.type = 'button';
      b.setAttribute('aria-haspopup', 'listbox');
      b.addEventListener('click', open);
      line.appendChild(b);
      return b;
    }
    var bM = part('Month', openM), bD = part('Day', openD), bY = part('Year', openY);
    function set(b, text, word) { b.textContent = text || word; b.classList.toggle('empty', !text); }
    function paint() {
      var whole = !!(a.month && a.day && a.year);
      set(bM, a.month ? SG_MONTHS[a.month - 1] : '', 'Month');
      set(bD, a.day ? String(a.day) + (whole ? ',' : '') : '', 'Day');
      set(bY, a.year ? String(a.year) : '', 'Year');
    }
    function draw() { paint(); if (changed) changed(); }
    function fit() {
      var want = a.dayPicked || a.day;
      if (want) a.day = Math.min(want, sgDays(a.year, a.month));
    }
    function openM() {
      sgPick('Month', SG_MONTHS.map(function (n, i) { return { value: i + 1, label: n }; }), a.month, 3, 0, function (v) {
        a.month = v; fit(); draw();
        if (!a.day) openD(); else if (!a.year) openY();
      }, bM);
    }
    function openD() {
      var opts = [];
      for (var d = 1; d <= sgDays(a.year, a.month); d++) opts.push({ value: d, label: String(d) });
      sgPick('Day', opts, a.day, 7, 0, function (v) {
        a.day = v; a.dayPicked = v; draw();
        if (!a.month) openM(); else if (!a.year) openY();
      }, bD);
    }
    function openY() {
      var now = new Date().getFullYear(), opts = [];
      for (var y = now; y >= now - 110; y--) opts.push({ value: y, label: String(y) });
      sgPick('Year', opts, a.year, 4, now - 25, function (v) {
        a.year = v; fit(); draw();
        if (!a.month) openM(); else if (!a.day) openD();
      }, bY);
    }
    function openNext() { if (!a.month) openM(); else if (!a.day) openD(); else if (!a.year) openY(); else openM(); }
    paint();
    return { line: line, first: bM, paint: paint, openNext: openNext };
  }
  function sgBirth(host, a, nav) {
    var row = sgEl('div', 'sg-field sg-picks');
    var lab = sgEl('span', 'sg-label', 'Birthday');
    var parts = sgDateParts(a, function () { draw(); });
    row.appendChild(lab); row.appendChild(parts.line); row.appendChild(sgTick());
    row.addEventListener('click', function (e) {
      if (e.target && e.target.closest && e.target.closest('.sg-pickb')) return;
      parts.openNext();
    });
    function draw() {
      parts.paint();
      var whole = !!(a.month && a.day && a.year);
      var age = whole ? yearsOld(a.year, a.month, a.day) : 0;
      var young = whole && age < 18;
      lab.textContent = whole && age >= 0 ? 'Birthday (' + age + (age === 1 ? ' year old)' : ' years old)') : 'Birthday';
      a.birth = whole && !young ? a.year + '-' + ('0' + a.month).slice(-2) + '-' + ('0' + a.day).slice(-2) : '';
      row.classList.toggle('ok', !!a.birth);
      ui.stop(young);
      ui.say(young ? 'Greenroom is for people 18 and older.' : '');
    }
    var ui = sgScreen(host, {
      first: nav.first, onBack: nav.back,
      title: 'What’s your birthday?',
      sub: 'Use your own birthday. Only you can see it.',
      body: row, focus: parts.first,
      onNext: function () {
        if (!a.birth) { ui.say('Pick your birthday: the month, the day and the year.'); return; }
        nav.next();
      }
    });
    draw();
  }
  function sgPass(host, a, nav) {
    var ui = sgScreen(host, {
      first: nav.first, onBack: nav.back,
      title: 'Create a password',
      sub: 'At least 8 letters or numbers. Something others can’t guess.',
      fields: [{ label: 'Password', type: 'password', value: a.pass, attrs: { autocomplete: 'new-password',
        autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done' } }],
      next: nav.label,
      onInput: function (u, inp) { a.pass = String(inp.value || ''); ui.ok(0, a.pass.length >= PASS_MIN); },
      onNext: function () {
        a.pass = String(ui.inputs[0].value || '');
        if (a.pass.length < PASS_MIN) { ui.say('Password needs at least ' + PASS_MIN + ' characters.'); ui.inputs[0].focus(); return; }
        return nav.next(ui);
      }
    });
    if (nav.email) {
      ui.form.parentNode.insertBefore(sgEl('p', 'sg-sub', 'You’ll sign in with ' + nav.email + '.'), ui.form);
      var who = sgEl('input', 'sg-ghost');
      who.type = 'email';
      who.setAttribute('autocomplete', 'username');
      who.setAttribute('tabindex', '-1');
      who.setAttribute('aria-hidden', 'true');
      who.readOnly = true;
      who.value = nav.email;
      ui.form.insertBefore(who, ui.form.firstChild);
    }
    ui.ok(0, a.pass.length >= PASS_MIN);
  }
  var LEGAL_SAID = 'I am 18 or older, I agree to the Greenroom Beta Tester Non-Disclosure Agreement and Terms of Use, and I have read the Privacy Policy.';
  var LEGAL_ORDER = ['nda', 'terms', 'privacy'];
  var LEGAL_NAMES = { nda: 'Non-Disclosure Agreement', terms: 'Terms of Use', privacy: 'Privacy Policy' };
  var LEGAL_NOLOAD = 'Couldn’t load the documents. Try again.';
  var LEGAL_NOSAVE = 'Couldn’t save that. Try again.';
  var LEGAL_AGAIN = 'We couldn’t save your agreement. Please read and agree again.';
  var LEGAL_EMAIL = 'Confirm your email first: use the code we emailed you.';
  var LEGAL_STALE = 'The documents were updated while you were reading. Please read them again.';
  function sgOut(ui, fn) {
    var more = sgEl('div', 'sg-more');
    var b = sgEl('button', 'linkbtn sg-out', 'Sign out');
    b.type = 'button';
    b.addEventListener('click', function () { b.disabled = true; fn(); });
    more.appendChild(b);
    ui.form.appendChild(more);
  }
  function mdBold(into, text) {
    var re = /(\*{2,3})([^\s*]|[^\s*][\s\S]*?[^\s*])\1(?!\*)/g, at = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > at) into.appendChild(document.createTextNode(text.slice(at, m.index)));
      into.appendChild(sgEl('strong', '', m[2]));
      at = m.index + m[0].length;
    }
    if (at < text.length) into.appendChild(document.createTextNode(text.slice(at)));
  }
  function mdLines(into, lines) {
    var run = '';
    lines.forEach(function (l, i) {
      run += (run ? ' ' : '') + l.t;
      if (l.br && i < lines.length - 1) {
        mdBold(into, run);
        into.appendChild(document.createElement('br'));
        run = '';
      }
    });
    if (run) mdBold(into, run);
  }
  function mdNodes(src, title) {
    var frag = document.createDocumentFragment();
    var rows = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    var lines = [], into = null, ul = null, gap = true, seen = false;
    function plain(s) { return String(s || '').replace(/[^a-z0-9]+/gi, '').toLowerCase(); }
    function flush() {
      if (into && lines.length) mdLines(into, lines);
      lines = []; into = null;
    }
    rows.forEach(function (raw) {
      var br = / {2,}$/.test(raw);
      var line = raw.replace(/\s+$/, '');
      var text = line.trim(), m;
      if (!text) { flush(); gap = true; return; }
      var first = !seen;
      seen = true;
      if ((m = /^(#{1,6})\s+(.*)$/.exec(text))) {
        flush(); ul = null; gap = true;
        var words = m[2].replace(/\s+#+$/, '').trim();
        if (first && m[1].length === 1 && title && plain(words) === plain(title)) return;
        var hd = document.createElement('h' + (Math.min(m[1].length, 3) + 1));
        mdBold(hd, words);
        frag.appendChild(hd);
        return;
      }
      if (/^([-*_])(\s*\1){2,}$/.test(text)) {
        flush(); ul = null; gap = true;
        frag.appendChild(document.createElement('hr'));
        return;
      }
      if ((m = /^[-*]\s+(.+)$/.exec(text))) {
        flush();
        if (!ul) { ul = document.createElement('ul'); frag.appendChild(ul); }
        into = document.createElement('li');
        if (/^(\t| {2,})/.test(line)) into.className = 'in';
        ul.appendChild(into);
        lines = [{ t: m[1], br: br }]; gap = false;
        return;
      }
      var own = /^\d{1,3}[.)]\s+\S/.test(text) || text.charAt(0) === '|';
      if (into && !gap && !own) { lines.push({ t: text, br: br }); return; }
      flush(); ul = null;
      into = document.createElement('p');
      frag.appendChild(into);
      lines = [{ t: text, br: br }]; gap = false;
    });
    flush();
    return frag;
  }
  function legalClean(d) {
    if (!isObj(d) || d.ok !== true) return null;
    if (d.ready !== true) return { ready: false, docs: [] };
    var by = {}, docs = [];
    (Array.isArray(d.docs) ? d.docs : []).forEach(function (x) {
      if (isObj(x) && LEGAL_ORDER.indexOf(x.doc) >= 0) by[x.doc] = x;
    });
    for (var i = 0; i < LEGAL_ORDER.length; i++) {
      var k = LEGAL_ORDER[i], x = by[k];
      if (!x || !String(x.version == null ? '' : x.version).trim() || !String(x.body == null ? '' : x.body).trim()) return null;
      docs.push({ doc: k, title: String(x.title || '').trim() || LEGAL_NAMES[k], version: String(x.version).trim(),
        body: String(x.body), sha: String(x.sha || ''), published_at: x.published_at || null });
    }
    return { ready: true, docs: docs };
  }
  function legalVersions(docs) {
    var v = {};
    docs.forEach(function (d) { v[d.doc] = d.version; });
    return v;
  }
  function legalList(keys) {
    var names = LEGAL_ORDER.filter(function (k) { return (keys || []).indexOf(k) >= 0; }).map(function (k) { return LEGAL_NAMES[k]; });
    return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join('');
  }
  function legalPages(host, o) {
    var docs = o.docs;
    function show(n, note) {
      var d = docs[n], last = n === docs.length - 1;
      var body = sgEl('div');
      var text = sgEl('div', 'sg-doc');
      text.appendChild(mdNodes(d.body, d.title));
      body.appendChild(text);
      var tick = null;
      if (last) {
        var row = sgEl('label', 'sg-agree');
        tick = sgEl('input');
        tick.type = 'checkbox';
        tick.checked = false;
        row.appendChild(tick);
        row.appendChild(sgEl('span', '', LEGAL_SAID));
        body.appendChild(row);
      }
      var ui = sgScreen(host, {
        onBack: n > 0 ? function () { show(n - 1, ''); } : (o.onBack || null),
        title: d.title,
        sub: 'Document ' + (n + 1) + ' of ' + docs.length + '. Version ' + d.version + '.',
        body: body,
        next: last ? 'I Agree' : 'Next: ' + LEGAL_NAMES[docs[n + 1].doc],
        onNext: function () {
          if (!last) { show(n + 1, ''); return; }
          if (!tick.checked) return;
          return o.onAgree(ui);
        }
      });
      var box = ui.form.parentNode;
      if (n === 0) {
        var changed = legalList(o.changed);
        var titleEl = box.firstChild.nextSibling;
        if (o.again) {
          var again = sgEl('p', 'sg-again', String(o.again));
          again.setAttribute('role', 'alert');
          box.insertBefore(again, titleEl);
        }
        if (changed) box.insertBefore(sgEl('p', 'sg-flag', 'Updated: ' + changed), titleEl);
        if (note) box.insertBefore(sgEl('p', 'sg-sub', note), ui.form);
      }
      if (o.signOut) sgOut(ui, o.signOut);
      if (last) {
        ui.stop(true);
        tick.addEventListener('change', function () { ui.stop(!tick.checked); ui.say(''); });
      }
    }
    show(0, o.note || '');
  }
  function legalSettled(st) {
    return isObj(st) && st.ready === true && st.needs === false && st.notice !== true;
  }
  function legalRun(host, o) {
    return new Promise(function (done) {
      var over = false;
      function end(how) { if (!over) { over = true; done(how); } }
      var LOADING = o.blind ? 'Checking your account…' : 'Loading the documents…';
      function grey(text) {
        var el = host.querySelector('.sg-sub');
        if (el) el.textContent = text;
      }
      async function load(ui, note, fresh) {
        var raw = null, st = null, lost = false, again = !fresh && !!o.again;
        if (o.before) {
          try {
            var tried = await o.before();
            if (tried === 'owed') again = true;
            else if (tried === 'owed-stale' && !note) note = LEGAL_STALE;
          } catch (e0) {   }
        }
        var asked = [
          Promise.resolve().then(function () { return o.api.docs(); }).then(null, function (e) { lost = sgNoAnswer(e); return null; }),
          Promise.resolve().then(function () { return o.api.status(); }).then(null, function () { return null; })
        ];
        raw = await asked[0]; st = await asked[1];
        if (legalSettled(st)) { end('agreed'); return; }
        var d = legalClean(raw);
        if (d && !d.ready) { end('none'); return; }
        if (!d) {
          if (!o.must) { end('unread'); return; }
          ui.stop(false);
          grey('');
          ui.say(lost ? SG_OFFLINE : LEGAL_NOLOAD);
          return;
        }
        pages(d.docs, isObj(st) && Array.isArray(st.changed) ? st.changed : [], note, again);
      }
      function wait(note, fresh) {
        var ui = sgScreen(host, {
          title: 'One moment', sub: LOADING, next: 'Try again',
          onNext: function () { ui.stop(true); ui.say(''); grey(LOADING); return load(ui, note, fresh); }
        });
        if (o.signOut) sgOut(ui, o.signOut);
        ui.stop(true);
        load(ui, note, fresh);
      }
      function pages(docs, changed, note, again) {
        legalPages(host, { docs: docs, changed: changed, note: note, again: again ? LEGAL_AGAIN : '', onBack: null,
          signOut: o.signOut || null,
          onAgree: async function (ui) {
            ui.say('Saving…', true);
            var r = null;
            try { r = await o.api.accept(legalVersions(docs), LEGAL_SAID, o.via); } catch (e) { r = null; }
            if (isObj(r) && r.ok === true) { end('agreed'); return 'wait'; }
            var why = isObj(r) ? String(r.why || '') : '';
            if (why === 'stale') { wait(LEGAL_STALE, true); return 'wait'; }
            if (why === 'not ready') { end('none'); return 'wait'; }
            if (!isObj(r)) {
              if (typeof o.hold === 'function') {
                var kept = false;
                try { kept = o.hold(legalVersions(docs), LEGAL_SAID) !== false; } catch (e2) { kept = false; }
                if (kept) { end('held'); return 'wait'; }
              }
              ui.say(SG_OFFLINE);
              return;
            }
            ui.say(why === 'email' ? LEGAL_EMAIL : LEGAL_NOSAVE);
          } });
      }
      wait(o.note || '');
    });
  }
  var legalApi = {
    docs: async function (code) {
      var q = await sgLimit(sb.rpc('legal_docs_for', code ? { c: code } : {}), 12000);
      if (q.error) {
        if (fnMissing(q.error)) return { ok: true, ready: false, docs: [] };
        throw q.error;
      }
      return q.data;
    },
    status: async function () {
      var q = await sgLimit(sb.rpc('legal_status'), 8000);
      if (q.error || !isObj(q.data)) throw (q.error || new Error('no answer'));
      return q.data;
    },
    accept: async function (v, said, via) {
      var q = await sgLimit(sb.rpc('legal_accept', { nda_v: v.nda, terms_v: v.terms, privacy_v: v.privacy, said: said, via: via }));
      if (q.error) {
        if (fnMissing(q.error)) return { ok: false, why: 'not ready' };
        if (q.status === 0 || sgNoAnswer(q.error)) throw q.error;
        return { ok: false, why: 'failed' };
      }
      return isObj(q.data) ? q.data : { ok: false, why: 'failed' };
    }
  };
  var LEGAL_KEY = 'gr-legal-held';
  var legalHeld = null;
  var legalHere = false;
  function legalTag(code) {
    var s = String(code || '').toUpperCase().replace(/[\s-]/g, ''), n = 5381;
    for (var i = 0; i < s.length; i++) n = ((n << 5) + n + s.charCodeAt(i)) >>> 0;
    return s ? n.toString(36) + '.' + s.length : '';
  }
  function legalHeldRead() {
    if (!legalHeld) {
      try {
        var h = JSON.parse(localStorage.getItem(LEGAL_KEY) || 'null');
        if (isObj(h) && isObj(h.v) && h.said === LEGAL_SAID && (h.via === 'inside' ? !!h.uid && !!h.email : !!h.tag)) legalHeld = h;
      } catch (e) {   }
    }
    if (legalHeld && !(Date.now() - Date.parse(legalHeld.at) < (legalHeld.email ? 864e5 : 18e5))) legalDrop();
    return legalHeld;
  }
  function legalKeep() {
    try { localStorage.setItem(LEGAL_KEY, JSON.stringify(legalHeld)); } catch (e) {   }
  }
  function legalDrop() {
    legalHeld = null;
    legalHere = false;
    try { localStorage.removeItem(LEGAL_KEY); } catch (e) {   }
  }
  function legalHold(code, docs) {
    legalHeld = { via: 'code', tag: legalTag(code), email: '', at: new Date().toISOString(), said: LEGAL_SAID, v: legalVersions(docs) };
    legalHere = true;
    legalKeep();
  }
  function legalHeldHere(code, docs) {
    var h = legalHeldRead();
    if (!h || !legalHere || h.via === 'inside' || !h.tag || h.tag !== legalTag(code)) return false;
    if (!(Date.now() - Date.parse(h.at) < 18e5)) return false;
    if (!docs) return true;
    var v = legalVersions(docs);
    return LEGAL_ORDER.every(function (k) { return !!v[k] && String(h.v[k] || '') === v[k]; });
  }
  function legalMine(code, email) {
    if (!legalHeldHere(code)) return;
    legalHeld.email = String(email || '').trim().toLowerCase();
    legalKeep();
  }
  function legalHoldInside(v, said) {
    if (!session || !session.user || !session.user.id || said !== LEGAL_SAID) return false;
    legalHeld = { via: 'inside', tag: '', uid: String(session.user.id), email: String(session.user.email || '').toLowerCase() || '-',
      at: new Date().toISOString(), said: said, v: v };
    legalHere = true;
    legalKeep();
    return true;
  }
  function legalHeldInside() {
    var h = legalHeldRead();
    return !!h && h.via === 'inside' && !!session && !!session.user && h.uid === session.user.id;
  }
  async function legalSendHeld() {
    var h = legalHeldRead();
    if (!h || !session || !session.user) return '';
    var r = null;
    if (h.via === 'inside') {
      if (h.uid !== session.user.id) return '';
      try { r = await legalApi.accept(h.v, h.said, 'inside'); } catch (e0) { r = null; }
      if (!isObj(r)) return 'held';
      if (legalHeld === h) legalDrop();
      if (r.ok === true) return 'saved';
      if (r.why === 'not ready') return '';
      return r.why === 'stale' ? 'stale' : 'again';
    }
    if (!h.email) return '';
    if (String(session.user.email || '').toLowerCase() !== h.email) return '';
    var born = Date.parse(session.user.created_at || '');
    if (born && Date.now() - born > 864e5) { legalDrop(); return ''; }
    try { r = await legalApi.accept(h.v, h.said, 'code'); } catch (e) { r = null; }
    if (isObj(r) && r.ok === true) { legalDrop(); return 'saved'; }
    if (isObj(r) && r.why === 'not ready') { legalDrop(); return ''; }
    if (isObj(r) && r.why === 'stale') { legalDrop(); return 'owed-stale'; }
    return 'owed';
  }
  var legalPassed = false;
  async function legalDone() {
    legalDrop();
    legalPassed = true;
    if (firstFacts) firstFacts.needsLegal = false;
    try { await sgLimit(sb.rpc('claim_invites'), 10000); } catch (e) {   }
  }
  function legalSignOut() { window.GR_BACKEND.signOut(); }
  async function legalInside(must, via, o) {
    if (document.getElementById('gr-pass-gate')) return '';
    o = o || {};
    var wrap = document.createElement('div');
    wrap.id = 'gr-pass-gate';
    wrap.className = 'gr-gate-like';
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e0) {   }
    document.body.appendChild(wrap);
    var how = '';
    try {
      how = await legalRun(wrap, { api: legalApi, via: via === 'invite' ? 'invite' : 'inside', must: !!must,
        again: !!o.again, note: o.note || '', blind: !!o.blind, signOut: legalSignOut,
        before: must ? legalSendHeld : null,
        hold: !must && via !== 'invite' ? legalHoldInside : null });
    } catch (e) { how = must ? 'broken' : ''; }
    if (how === 'broken') {
      try {
        wrap.textContent = '';
        var p = document.createElement('p');
        p.className = 'gate-hi quiet';
        p.textContent = 'Couldn\u2019t show the documents. Close Greenroom and open it again.';
        wrap.appendChild(p);
      } catch (e2) {   }
      return new Promise(function () {});
    }
    if (how === 'agreed') await legalDone();
    else if (how === 'none') legalPassed = true;
    wrap.remove();
    return how;
  }
  var legalFlushing = false;
  async function legalFlush() {
    if (legalFlushing || !legalHeldInside()) return '';
    legalFlushing = true;
    var how = '';
    try { how = await legalSendHeld(); } catch (e) { how = 'held'; }
    legalFlushing = false;
    try {
      if (how === 'saved') { await legalDone(); refetchTries = 0; scheduleRefetch(); }
      else if (how === 'stale' || how === 'again') {
        if (firstFacts) firstFacts.needsLegal = true;
        var then = await legalInside(false, 'inside', how === 'stale' ? { note: LEGAL_STALE } : { again: true });
        if (then === 'agreed') { refetchTries = 0; scheduleRefetch(); }
      }
    } catch (e2) {   }
    return how;
  }
  var legalStarted = false, legalWaking = false;
  async function legalWake() {
    if (!legalStarted || legalWaking || !session || !session.user) return;
    if (document.getElementById('gr-pass-gate') || document.getElementById('gr-gate')) return;
    legalWaking = true;
    try {
      if (legalHeldInside()) { await legalFlush(); return; }
      var st = null;
      try { st = await legalApi.status(); } catch (e) { st = null; }
      if (!isObj(st) || st.ready !== true || st.needs !== true) return;
      if (firstFacts) firstFacts.needsLegal = true;
      var how = await legalInside(false, 'inside');
      if (how === 'agreed') { refetchTries = 0; scheduleRefetch(); }
    } catch (e2) {   } finally { legalWaking = false; }
  }
  function gate(note, code) {
    var mode = code ? 'code' : 'signin';
    var wrap = document.createElement('div');
    wrap.id = 'gr-gate';
    document.body.appendChild(wrap);
    var a = { code: code || '', codeOk: '', legalOk: '', legalFree: false, kinds: [], codeEmail: '', first: '', last: '', handle: '', handleMine: false,
      month: 0, day: 0, dayPicked: 0, year: 0, birth: '', email: '', pass: '', made: '', madePass: '', sentAt: 0,
      tried: '', triedPass: '' };
    var signinEmail = '';
    function toSignin(email) {
      pendingAnswers = null;
      signinEmail = email || '';
      mode = 'signin';
      wrap.classList.remove('sg-host');
      render();
    }
    function hold(email) {
      if (a.legalOk && !a.legalFree) legalMine(a.legalOk, email);
      var sent = a.made === email ? a.madePass : a.tried === email ? a.triedPass : a.pass;
      pendingAnswers = { email: email, first: a.first, last: a.last, handle: a.handle, birth: a.birth,
        pass: sent !== a.pass ? a.pass : '' };
    }
    function sayWhy(ui, why, email) {
      if (why === 'exists') {
        ui.say('That email already has an account.');
        ui.act('Back to sign in', function () { toSignin(email); });
      } else if (why === 'invited') {
        ui.say('That address already has a tour invite. Use the code from the invite email, or tap Forgot password on the sign-in screen.');
        ui.act('Back to sign in', function () { toSignin(email); });
      } else if (why === 'slow') {
        ui.say(SG_SLOW);
      } else if (why === 'bad') {
        a.codeOk = '';
        ui.say(SG_BADCODE);
        ui.act('Change the code', askCode);
      } else if (why === 'email') {
        ui.say('That email address doesn\u2019t look right. Go back and check it.');
      } else {
        ui.say(SG_AGAIN);
      }
    }
    function renderCode() { askCode(); }
    function askCode() {
      var ui = sgScreen(wrap, {
        first: true, onBack: function () { toSignin(''); },
        title: 'Enter your code',
        sub: 'Greenroom is invite-only. Type the code you were given.',
        fields: [{ label: 'Code', value: a.code, attrs: { maxlength: '40', autocomplete: 'one-time-code',
          autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false' } }],
        onInput: function (u, inp) {
          var v = String(inp.value || '').toUpperCase();
          if (v !== inp.value) inp.value = v;
          a.code = v.trim();
          ui.ok(0, !!a.code && a.codeOk === a.code);
          ui.say('');
        },
        onNext: async function () {
          var c = String(ui.inputs[0].value || '').toUpperCase().trim();
          a.code = c;
          if (!c) { ui.say('Type your code.'); ui.inputs[0].focus(); return; }
          if (!/[A-Z]/.test(c)) {
            var digits = c.replace(/\D/g, '');
            if (digits.length < 6) { ui.say('That code is too short. Check it and try again. ' + SG_LETTERS); return; }
            a.code = digits;
            askCodeEmail();
            return;
          }
          if (a.codeOk === c && a.legalOk === c && (a.legalFree || legalHeldHere(c))) { askName(); return; }
          ui.say('Checking\u2026', true);
          var kinds = a.kinds;
          if (a.codeOk !== c) {
            var q = await sgLimit(sb.rpc('signup_code_check', { c: c }));
            if (q.error || !isObj(q.data)) { ui.say(sgNoData(q)); return; }
            if (q.data.ok !== true) { ui.say(q.data.why === 'slow' ? SG_SLOW : SG_NOCODE); return; }
            var set = await signupSettings();
            if (set && (!set.open || !set.confirm)) {
              ui.say('Your code is good, but sign-up isn\u2019t switched on yet. Ask the person who gave you the code.');
              return;
            }
            kinds = cleanKinds(q.data.kinds);
          }
          a.codeOk = c;
          a.kinds = kinds;
          var raw = null, answered = true, lost = false;
          try { raw = await legalApi.docs(c); } catch (e) { answered = false; lost = sgNoAnswer(e); }
          var d = legalClean(raw);
          if (!d) {
            if (answered) a.codeOk = '';
            ui.say(lost ? SG_OFFLINE : LEGAL_NOLOAD);
            return;
          }
          if (!d.ready) { a.legalOk = c; a.legalFree = true; askName(); return; }
          a.legalFree = false;
          if (a.legalOk === c && legalHeldHere(c, d.docs)) { askName(); return; }
          a.legalOk = '';
          askLegal(d.docs);
        }
      });
      ui.ok(0, !!a.code && a.codeOk === a.code);
    }
    function askLegal(docs) {
      legalPages(wrap, { docs: docs, onBack: askCode,
        onAgree: function () {
          legalHold(a.codeOk, docs);
          a.legalOk = a.codeOk;
          askName();
        } });
    }
    function askCodeEmail() {
      var ui = sgScreen(wrap, {
        onBack: askCode,
        title: 'Which email did it come to?',
        sub: 'Type the email address the code was sent to.',
        fields: [{ label: 'Email', type: 'email', value: a.codeEmail, attrs: { autocomplete: 'email', inputmode: 'email',
          autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done' } }],
        onInput: function (u, inp) {
          a.codeEmail = String(inp.value || '').trim();
          ui.ok(0, SG_EMAIL.test(a.codeEmail));
        },
        onNext: async function () {
          var email = String(ui.inputs[0].value || '').trim();
          a.codeEmail = email;
          if (!SG_EMAIL.test(email)) { ui.say('Type your email address.'); ui.inputs[0].focus(); return; }
          var mine = email.toLowerCase();
          var startedHere = mine === a.made || mine === a.tried;
          if (startedHere) hold(mine); else pendingAnswers = null;
          ui.say('Checking\u2026', true);
          var kinds = ['invite', 'recovery', 'email', 'signup'];
          var ok = false;
          for (var i = 0; i < kinds.length && !ok; i++) {
            resetting = kinds[i] === 'recovery';
            var r;
            try { r = await sgLimit(sb.auth.verifyOtp({ email: email, token: a.code, type: kinds[i] })); }
            catch (e2) { r = { error: e2 }; }
            if (r && r.error && sgNoAnswer(r.error)) { resetting = false; throw r.error; }
            ok = !!r && !r.error && !!(r.data && r.data.session);
            if (ok && !startedHere && (kinds[i] === 'email' || kinds[i] === 'signup')) {
              var who = r.data.user || r.data.session.user || {};
              var conf = Date.parse(who.email_confirmed_at || who.confirmed_at || '');
              if ((who.user_metadata || {}).invited !== true && conf && Math.abs(Date.now() - conf) < 36e5) mustPassSet(who.id);
            }
          }
          if (ok) return 'wait';
          resetting = false;
          ui.say('That code didn\u2019t work with that email. Emailed codes last an hour and work once. ' + SG_LETTERS);
          ui.act('Back to sign in', function () { toSignin(email); });
        }
      });
      ui.ok(0, SG_EMAIL.test(a.codeEmail));
    }
    function askName() { sgName(wrap, a, { back: askCode, next: askHandle }); }
    function askHandle() {
      sgHandle(wrap, a, { back: askName, next: askBirth,
        check: async function (h) {
          var q = await sgLimit(sb.rpc('signup_handle_free', { c: a.code, h: h }));
          if (q.error || !isObj(q.data)) throw (q.error || new Error('no answer'));
          if (q.data.ok !== true && q.data.why === 'bad') a.codeOk = '';
          return q.data.ok === true ? { free: q.data.free === true } : { why: String(q.data.why || '') };
        } });
    }
    function askBirth() { sgBirth(wrap, a, { back: askHandle, next: askEmail }); }
    function askEmail() {
      var ui = sgScreen(wrap, {
        onBack: askBirth,
        title: 'What\u2019s your email?',
        sub: 'This is how you sign in. The people you tour with can see it.',
        fields: [{ label: 'Email', type: 'email', value: a.email, attrs: { autocomplete: 'email', inputmode: 'email',
          autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' } }],
        onInput: function (u, inp) {
          a.email = String(inp.value || '').trim().toLowerCase();
          ui.ok(0, SG_EMAIL.test(a.email));
        },
        onNext: function () {
          a.email = String(ui.inputs[0].value || '').trim().toLowerCase();
          if (!SG_EMAIL.test(a.email)) { ui.say('That doesn\u2019t look like an email address. Check it and try again.'); ui.inputs[0].focus(); return; }
          askPass();
        }
      });
      ui.ok(0, SG_EMAIL.test(a.email));
    }
    function askPass() {
      sgPass(wrap, a, { back: askEmail, label: 'Create account', email: a.email, next: makeAccount });
    }
    async function makeAccount(ui) {
      var email = a.email;
      var full = (a.first + ' ' + a.last).trim();
      if (a.made === email) { askConfirm(); return; }
      ui.say('Creating your account\u2026', true);
      var was = a.made || a.tried;
      if (was === email) was = '';
      var q = await sgLimit(sb.rpc('signup_code_redeem', { c: a.code, addr: email, instead_of: was || null }));
      if (q.error || !isObj(q.data)) { ui.say(sgNoData(q)); return; }
      var why = q.data.ok === true ? '' : String(q.data.why || 'no');
      if (was && (!why || why === 'exists' || why === 'invited')) {
        if (a.made === was) { a.made = ''; a.madePass = ''; }
        if (a.tried === was) { a.tried = ''; a.triedPass = ''; }
      }
      if ((why === 'exists' || why === 'bad') && a.tried === email) {
        a.made = email; a.madePass = a.triedPass; a.tried = ''; a.triedPass = '';
        suggestSave(email, a.kinds);
        askConfirm();
        return;
      }
      if (why) { sayWhy(ui, why, email); return; }
      hold(email);
      suggestSave(email, a.kinds);
      var res;
      try {
        res = await sgLimit(sb.auth.signUp({ email: email, password: a.pass, options: { data: {
          first_name: a.first.slice(0, 30), last_name: a.last.slice(0, 30),
          full_name: full.slice(0, 60), username: full.slice(0, 40) } } }), 30000);
      } catch (e2) { res = { error: e2 }; }
      if (res.error) {
        pendingAnswers = null;
        var msg = String(res.error.message || ''), kind = String(res.error.code || '');
        if (/already registered|already exists/i.test(msg) || kind === 'user_already_exists' || kind === 'email_exists') {
          sayWhy(ui, 'exists', email);
        } else if (/email address .*invalid|validate email|invalid format/i.test(msg) || kind === 'email_address_invalid') {
          ui.say('That email address doesn\u2019t look right.');
        } else if (/password/i.test(msg) && /at least|short|weak|characters|guess/i.test(msg)) {
          ui.say(sgPassSay(msg));
        } else if (/signups? (are )?(not allowed|disabled)|confirm email first|database error/i.test(msg) ||
            kind === 'signup_disabled' || kind === 'email_provider_disabled') {
          ui.say(SG_OFF);
        } else if (/sending .*mail|email rate limit|only request this after/i.test(msg) || kind === 'over_email_send_rate_limit') {
          if (a.tried === email && /only request this after/i.test(msg)) {
            a.made = email; a.madePass = a.triedPass; a.tried = ''; a.triedPass = '';
            askConfirm();
            return;
          }
          ui.say(SG_MAIL);
        } else if (/rate limit|too many/i.test(msg)) {
          ui.say(SG_SLOW);
        } else if (sgNoAnswer(res.error)) {
          a.tried = email; a.triedPass = a.pass; a.sentAt = Date.now();
          ui.say(SG_OFFLINE);
          return;
        } else {
          ui.say(SG_AGAIN);
        }
        suggestClear();
        return;
      }
      if (res.data && res.data.session) return 'wait';
      var made = res.data && res.data.user;
      if (made && Array.isArray(made.identities) && !made.identities.length) {
        pendingAnswers = null;
        suggestClear();
        sayWhy(ui, 'exists', email);
        return;
      }
      a.made = email; a.madePass = a.pass; a.sentAt = Date.now();
      a.tried = ''; a.triedPass = '';
      askConfirm();
    }
    function askConfirm() {
      var email = a.made;
      var more = sgEl('div', 'sg-more');
      var againB = sgEl('button', 'linkbtn', 'Send a new code');
      againB.type = 'button';
      var wrongB = sgEl('button', 'linkbtn', 'Wrong address? Go back');
      wrongB.type = 'button';
      more.appendChild(againB); more.appendChild(wrongB);
      var timer = 0, sending = false;
      function count() {
        if (!document.body.contains(more)) { clearInterval(timer); return; }
        var left = Math.min(60, 60 - Math.floor((Date.now() - a.sentAt) / 1000));
        againB.disabled = sending || left > 0;
        againB.textContent = left > 0 ? 'Send a new code in ' + left + (left === 1 ? ' second' : ' seconds') : 'Send a new code';
        if (left <= 0) clearInterval(timer);
      }
      function countdown() { clearInterval(timer); timer = setInterval(count, 1000); count(); }
      async function again() {
        sending = true; againB.disabled = true;
        ui.say('Sending\u2026', true);
        try {
          var r = await sgLimit(sb.auth.resend({ type: 'signup', email: email }));
          if (r && r.error) throw r.error;
          a.sentAt = Date.now();
          ui.say('Sent. Check your email for the new code.', true);
        } catch (e3) {
          ui.say(sgNoAnswer(e3) ? SG_OFFLINE : SG_MAIL);
        }
        sending = false;
        countdown();
      }
      againB.addEventListener('click', again);
      wrongB.addEventListener('click', askEmail);
      var ui = sgScreen(wrap, {
        onBack: askPass,
        title: 'Check your email',
        sub: 'We sent a code to ' + email + '. Type it here.',
        fields: [{ label: 'Code', value: '', attrs: { maxlength: '12', autocomplete: 'one-time-code', inputmode: 'numeric',
          enterkeyhint: 'done' } }],
        onInput: function (u, inp) {
          ui.ok(0, String(inp.value || '').replace(/\D/g, '').length >= 6);
          ui.say('');
        },
        onNext: async function () {
          var token = String(ui.inputs[0].value || '').replace(/\D/g, '');
          if (token.length < 6) { ui.say('Type the code from the email.'); ui.inputs[0].focus(); return; }
          hold(email);
          ui.say('Checking\u2026', true);
          var kinds = ['signup', 'email'];
          var ok = false;
          for (var i = 0; i < kinds.length && !ok; i++) {
            var r;
            try { r = await sgLimit(sb.auth.verifyOtp({ email: email, token: token, type: kinds[i] })); }
            catch (e2) { r = { error: e2 }; }
            if (r && r.error && sgNoAnswer(r.error)) throw r.error;
            ok = !!r && !r.error && !!(r.data && r.data.session);
          }
          if (ok) return 'wait';
          ui.say('That code didn\u2019t work. Check it, or send a new one.');
        }
      });
      ui.form.appendChild(more);
      countdown();
    }
    function render() {
      if (mode === 'code') { renderCode(); return; }
      var signin = mode === 'signin';
      wrap.innerHTML =
        '<div class="gate-card">' +
        '<span class="logo-mark gate-mark" role="img" aria-label="Greenroom"></span>' +
        '<form id="gr-gate-form" novalidate>' +
        (signin ? '' :
          '<div class="gate-pair">' +
          '<input class="input" type="text" id="gr-gate-first" placeholder="First name" ' +
            'maxlength="30" autocomplete="given-name" aria-label="First name">' +
          '<input class="input" type="text" id="gr-gate-last" placeholder="Last name" ' +
            'maxlength="30" autocomplete="family-name" aria-label="Last name">' +
          '</div>') +
        '<input class="input" type="email" id="gr-gate-email" placeholder="' + (signin ? 'you@email.com' : 'Email') +
          '" autocomplete="email" inputmode="email" aria-label="Email">' +
        (signin ? '' :
          '<input class="input" type="tel" id="gr-gate-phone" placeholder="Phone number" ' +
            'maxlength="30" autocomplete="tel" inputmode="tel" aria-label="Phone number">' +
          rolePickerHtml('gr-gate-role', '')) +
        '<input class="input" type="password" id="gr-gate-pass" placeholder="Password" ' +
          'autocomplete="' + (signin ? 'current-password' : 'new-password') + '" aria-label="Password">' +
        '<div class="gate-err" id="gr-gate-err" role="alert"></div>' +
        '<button class="btn primary block" type="submit">' +
          (signin ? 'Sign in' : 'Create account') + '</button>' +
        '</form>' +
        '<button class="linkbtn quiet" id="gr-gate-forgot" type="button">Forgot password?</button>' +
        '<button class="linkbtn quiet" id="gr-gate-code-link" type="button">I have a code</button>' +
        '<p class="gate-note">Greenroom is invite-only. You need a code to make an account.</p>' +
        '</div>';
      var form = wrap.querySelector('#gr-gate-form');
      wireRolePicker(wrap, 'gr-gate-role');
      var emailI = wrap.querySelector('#gr-gate-email');
      var passI = wrap.querySelector('#gr-gate-pass');
      var errEl = wrap.querySelector('#gr-gate-err');
      var btn = form.querySelector('button');
      if (note) { errEl.textContent = note; note = ''; }
      if (signinEmail) { emailI.value = signinEmail; signinEmail = ''; }
      async function emailLink() {
        var email = String(emailI.value || '').trim();
        if (email.indexOf('@') < 1) { errEl.textContent = 'Type your email above, then tap it again.'; emailI.focus(); return; }
        errEl.textContent = 'Sending\u2026';
        try {
          await sgLimit(sendPasswordLink(email));
          errEl.textContent = 'Check your email. Tap the button in it, or come back here, tap \u201cI have a code\u201d and type the code from it.';
        } catch (e3) {
          var m3 = String(e3 && e3.message || '');
          errEl.textContent = /rate limit|too many|seconds/i.test(m3)
            ? 'Too many emails went out in the last hour. Try again in a little while.'
            : 'Couldn\u2019t send the email. Check your connection and try again.';
        }
      }
      var forgot = wrap.querySelector('#gr-gate-forgot');
      if (forgot) forgot.addEventListener('click', emailLink);
      var codeLink = wrap.querySelector('#gr-gate-code-link');
      if (codeLink) codeLink.addEventListener('click', function () { mode = 'code'; render(); });
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        errEl.textContent = '';
        var email = String(emailI.value || '').trim();
        var pass = String(passI.value || '');
        var firstI = wrap.querySelector('#gr-gate-first');
        var lastI = wrap.querySelector('#gr-gate-last');
        var phoneI = wrap.querySelector('#gr-gate-phone');
        var roleI = wrap.querySelector('#gr-gate-role');
        var first = firstI ? String(firstI.value || '').trim() : '';
        var last = lastI ? String(lastI.value || '').trim() : '';
        var phone = phoneI ? String(phoneI.value || '').trim() : '';
        var tourRole = roleI ? String(roleI.value || '') : '';
        if (firstI && !first) { errEl.textContent = 'Type your first name.'; firstI.focus(); return; }
        if (lastI && !last) { errEl.textContent = 'Type your last name.'; lastI.focus(); return; }
        if (phoneI && phone.replace(/\D/g, '').length < 7) { errEl.textContent = 'Type a phone number the tour can reach you on.'; phoneI.focus(); return; }
        if (roleI && !tourRole) { errEl.textContent = 'Pick your role on the tour.'; wrap.querySelector('#gr-gate-role-btn').focus(); return; }
        if (email.indexOf('@') < 1) { errEl.textContent = 'Type your email address.'; emailI.focus(); return; }
        if (pass.length < (signin ? 1 : PASS_MIN)) { errEl.textContent = signin ? 'Type your password.' : 'Password needs at least ' + PASS_MIN + ' characters.'; passI.focus(); return; }
        btn.disabled = true;
        try {
          var res = signin
            ? await sgLimit(sb.auth.signInWithPassword({ email: email, password: pass }))
            : await sgLimit(sb.auth.signUp({ email: email, password: pass, options: { data: {
                first_name: first.slice(0, 30), last_name: last.slice(0, 30),
                full_name: (first + ' ' + last).slice(0, 60),
                username: (first + ' ' + last).slice(0, 40),
                phone: phone.slice(0, 30), tour_role: tourRole } } }), 30000);
          if (res.error) throw res.error;
          if (!res.data || !res.data.session) throw new Error('no session');
        } catch (e2) {
          btn.disabled = false;
          var msg = String(e2 && e2.message || '');
          if (/already registered|already exists/i.test(msg)) {
            errEl.textContent = 'That email already has an account. If you were invited or don\u2019t know the password, ';
            var fix = document.createElement('button');
            fix.type = 'button'; fix.className = 'linkbtn inline';
            fix.textContent = 'email me a link to set it.';
            fix.addEventListener('click', emailLink);
            errEl.appendChild(fix);
          } else if (/invalid login credentials/i.test(msg)) {
            errEl.textContent = signin
              ? 'Wrong email or password. Tap \u201cForgot password?\u201d below to set a new one.'
              : 'Couldn\u2019t create the account. Try again.';
          } else if (/not confirmed/i.test(msg)) {
            errEl.textContent = 'That account isn\u2019t set up yet. Tap \u201cForgot password?\u201d below and we\u2019ll email you a link to finish.';
          } else if (/at least|password/i.test(msg)) {
            errEl.textContent = sgPassSay(msg);
          } else {
            errEl.textContent = 'Couldn’t reach the server. Check your connection and try again.';
          }
        }
      });
    }
    render();
    return wrap;
  }
  function readEmailLink() {
    var q = new URLSearchParams(location.search);
    var code = String(q.get('code') || '').replace(/\D/g, '');
    if (code) {
      q.delete('code');
      var rest = q.toString();
      try { history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch (e) {   }
      return { code: code };
    }
    var raw = String(location.hash || '').replace(/^#/, '');
    if (!/access_token=|error_description=|error_code=/.test(raw)) return {};
    var p = new URLSearchParams(raw);
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {   }
    return {
      access: p.get('access_token') || '', refresh: p.get('refresh_token') || '',
      type: p.get('type') || '',
      error: p.get('error_description') || p.get('error_code') || ''
    };
  }
  async function boot() {
    var mod = (localHost() && window.GR_SUPABASE) || await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm');
    sbMod = mod;
    var link = readEmailLink();
    sb = mod.createClient(cfg.url, cfg.anonKey, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true,
        lock: mod.processLock || undefined },
      global: { fetch: sturdyFetch }
    });
    var hiddenAt = 0;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 30e3) {
        freshToken(false).then(function () { flushErrors(); }).catch(function () {   });
        flowersChanged();
        if (session && legalStarted) { refetchTries = 0; scheduleRefetch(); feedChanged(); socialMissed(); }
        newBuildCheck();
        if (session) legalWake();
      } else if (refetchOwed && session) { refetchTries = 0; scheduleRefetch(); }
      hiddenAt = 0;
    });
    window.addEventListener('online', function () {
      flushErrors();
      if (session && legalStarted) { refetchTries = 0; scheduleRefetch(); feedChanged(); legalFlush(); socialMissed(); }
    });
    var got = await sb.auth.getSession();
    session = got.data ? got.data.session : null;
    if (session) setTimeout(placeProbe, 1200);
    var note = '';
    if (link.access && link.refresh) {
      var set = await sb.auth.setSession({ access_token: link.access, refresh_token: link.refresh });
      if (set.data && set.data.session) session = set.data.session;
      else note = 'That link has expired or was already used. Tap \u201cForgot password?\u201d for a fresh one.';
    } else if (link.error) {
      note = /expired|invalid/i.test(link.error)
        ? 'That link has expired or was already used. Tap \u201cForgot password?\u201d for a fresh one.'
        : 'That link didn\u2019t work. Tap \u201cForgot password?\u201d for a fresh one.';
    }
    resetting = link.type === 'recovery' && !!session;
    if (!session) {
      var g = gate(note, link.code);
      sb.auth.onAuthStateChange(function (_ev, s) {
        if (s && !session) { session = s; g.remove(); online(); }
      });
    }
    sb.auth.onAuthStateChange(function (_ev, s) { if (s) session = s; });
    if (session) online();
  }
  async function importLocalTours() {
    if (cache.tours.size) return;
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem('greenroom:v1') || 'null'); } catch (e) { return; }
    if (!raw || !isObj(raw.tours)) return;
    var ids = Object.keys(raw.tours).filter(function (k) { return isObj(raw.tours[k]); });
    if (!ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      try { await sb.from('tours').insert({ id: ids[i], doc: raw.tours[ids[i]] }); }
      catch (e) {   }
    }
    try {
      localStorage.setItem('greenroom:v1:backup', JSON.stringify(raw));
      localStorage.removeItem('greenroom:v1');
    } catch (e) {   }
    try { await refetch(); } catch (e) {   }
  }
  function passwordGate(owed) {
    if (document.getElementById('gr-pass-gate')) return;
    var wrap = document.createElement('div');
    wrap.id = 'gr-pass-gate';
    wrap.className = 'gr-gate-like';
    document.body.appendChild(wrap);
    var m0 = session.user.user_metadata || {};
    var typed = String(m0.full_name || m0.username || '').trim();
    var a = { first: String(m0.first_name || typed.split(/\s+/)[0] || '').trim(),
      last: String(m0.last_name || typed.split(/\s+/).slice(1).join(' ') || '').trim(),
      role: roleName(m0.tour_role), phone: String(m0.phone || '').trim(), phoneSkipped: false,
      handle: '', handleMine: false, month: 0, day: 0, year: 0, birth: '', pass: '' };
    var steps = [];
    if (!a.first || !a.last) steps.push(askName);
    if (!m0.tour_role) steps.push(askRole);
    if (!a.phone && m0.phone_asked !== true) steps.push(askPhone);
    steps.push(askHandle, askBirth, askPass);
    function go(i) { steps[i](i); }
    function nav(i) {
      return { back: i > 0 ? function () { go(i - 1); } : null, next: function () { go(i + 1); } };
    }
    function askName(i) { sgName(wrap, a, nav(i)); }
    function askRole(i) {
      var n = nav(i);
      var row = sgEl('div', 'sg-field sg-picks' + (a.role ? ' ok' : ''));
      var pick = sgEl('button', 'sg-pickb' + (a.role ? '' : ' empty'), a.role || 'Your role on the tour');
      pick.type = 'button';
      pick.setAttribute('aria-haspopup', 'listbox');
      var line = sgEl('div', 'sg-date');
      line.appendChild(pick);
      row.appendChild(sgEl('span', 'sg-label', 'Role')); row.appendChild(line); row.appendChild(sgTick());
      row.addEventListener('click', function () {
        openRolePicker(a.role, function (role) {
          a.role = role;
          pick.textContent = role;
          pick.classList.remove('empty');
          row.classList.add('ok');
          ui.say('');
        });
      });
      var ui = sgScreen(wrap, {
        onBack: n.back,
        title: 'What\u2019s your role on the tour?',
        sub: 'Your job on this run. It shows next to your name on the crew list.',
        body: row, focus: pick,
        onNext: function () {
          if (!a.role) { ui.say('Pick your role on the tour.'); return; }
          n.next();
        }
      });
    }
    function askPhone(i) {
      var n = nav(i);
      var digits = function (v) { return String(v || '').replace(/\D/g, '').length; };
      var ui = sgScreen(wrap, {
        onBack: n.back,
        title: 'Your phone number',
        sub: 'People on a tour with you can see it.',
        fields: [{ label: 'Phone', type: 'tel', value: a.phone,
          attrs: { maxlength: '30', inputmode: 'tel', autocomplete: 'tel' } }],
        onInput: function (u, inp) {
          a.phone = String(inp.value || '').trim().slice(0, 30);
          u.ok(0, digits(a.phone) >= 7);
          u.say('');
        },
        onNext: function () {
          a.phone = String(ui.inputs[0].value || '').trim().slice(0, 30);
          if (digits(a.phone) >= 7) { a.phoneSkipped = false; n.next(); return; }
          ui.say(a.phone ? 'That number looks too short. Type it with the area code.' : 'Type your phone number.');
          ui.act('Skip for now', function () { a.phone = ''; a.phoneSkipped = true; n.next(); });
          ui.inputs[0].focus();
        }
      });
      ui.ok(0, digits(a.phone) >= 7);
    }
    function askHandle(i) {
      var n = nav(i);
      n.check = function (h) { return sgLimit(window.GR_BACKEND.handleFree(h)).then(function (free) { return { free: free }; }); };
      n.skip = true;
      sgHandle(wrap, a, n);
    }
    function askBirth(i) { sgBirth(wrap, a, nav(i)); }
    function askPass(i) {
      var n = nav(i);
      n.label = 'Join the tour';
      n.email = session.user.email || '';
      n.next = finish;
      sgPass(wrap, a, n);
    }
    async function finish(ui) {
      var full = (a.first + ' ' + a.last).trim();
      var meta = Object.assign({}, m0, {
        invited: false, first_name: a.first.slice(0, 30), last_name: a.last.slice(0, 30),
        full_name: full.slice(0, 60), username: full.slice(0, 40),
        phone: String(a.phone || m0.phone || '').slice(0, 30), tour_role: a.role });
      if (a.phoneSkipped && !meta.phone) meta.phone_asked = true;
      var btn = ui.form.querySelector('.sg-next'), word = btn ? btn.textContent : '';
      if (btn) btn.textContent = 'Saving\u2026';
      var q;
      try { q = await sgLimit(sb.auth.updateUser({ password: a.pass, data: meta })); } catch (e2) { q = { error: e2 }; }
      if (q.error && /different from the old/i.test(String(q.error.message || ''))) {
        try { q = await sgLimit(sb.auth.updateUser({ data: meta })); } catch (e5) { q = { error: e5 }; }
      }
      if (q.error) {
        if (btn) btn.textContent = word;
        var msg = String(q.error.message || '');
        ui.say(/password/i.test(msg) && /at least|short|weak|characters|guess/i.test(msg) ? sgPassSay(msg)
          : sgNoAnswer(q.error) ? SG_OFFLINE : 'Couldn\u2019t save it. Try again.');
        return;
      }
      session.user = q.data && q.data.user ? q.data.user : Object.assign({}, session.user, { user_metadata: meta });
      var landed = false;
      var saves = (async function () {
        await pushProfile();
        if (a.handle) { try { await window.GR_BACKEND.setHandle(a.handle); } catch (e3) {   } }
        if (a.birth) { try { await window.GR_BACKEND.saveBirthDate(a.birth); } catch (e4) {   } }
        landed = true;
      })();
      await soon(saves, 10000);
      await rereadFirstRun();
      wrap.remove();
      emit('tours');
      if (!landed) saves.then(function () { emit('tours'); });
      return 'wait';
    }
    var f = firstFacts || { unknown: true };
    if (legalPassed || (!owed && !f.needsLegal && !f.unknown)) { go(0); return; }
    legalRun(wrap, { api: legalApi, via: 'invite', must: true, blind: !owed && !f.needsLegal, signOut: legalSignOut,
      before: owed ? legalSendHeld : null }).then(function (how) {
      if (how !== 'agreed') return;
      return legalDone().then(function () { refetchTries = 0; scheduleRefetch(); });
    }).then(function () { go(0); }, function () { go(0); });
  }
  var MUST_PASS = 'gr-must-pass';
  var mustPassNow = '';
  function mustPassSet(id) {
    try { localStorage.setItem(MUST_PASS, String(id || '')); } catch (e) {   }
    mustPassNow = String(id || '');
  }
  function mustPassDue() {
    var id = mustPassNow;
    if (!id) { try { id = localStorage.getItem(MUST_PASS) || ''; } catch (e) { id = ''; } }
    return !!id && !!session && !!session.user && session.user.id === id;
  }
  function mustPassDone() {
    mustPassNow = '';
    try { localStorage.removeItem(MUST_PASS); } catch (e) {   }
  }
  function newPasswordGate(must) {
    resetting = false;
    if (document.getElementById('gr-pass-gate')) return;
    var wrap = document.createElement('div');
    wrap.id = 'gr-pass-gate';
    wrap.className = 'gr-gate-like';
    wrap.innerHTML =
      '<div class="gate-card">' +
      '<span class="logo-mark gate-mark" role="img" aria-label="Greenroom"></span>' +
      '<p class="gate-hi">' + (must ? 'Choose your password.' : 'Pick a new password.') + '</p>' +
      (must ? '<p class="gate-hi quiet">This account was started for your email. Set a password only you know.</p>' : '') +
      '<form id="gr-pass-form" novalidate>' +
      '<input class="input" type="password" id="gr-pass-new" placeholder="New password" ' +
        'autocomplete="new-password" aria-label="New password">' +
      '<div class="gate-err" id="gr-pass-err" role="alert"></div>' +
      '<button class="btn primary block" type="submit">Save</button>' +
      '</form>' +
      (must ? '' : '<button class="linkbtn quiet" id="gr-pass-keep" type="button">Keep my current password</button>') +
      '</div>';
    document.body.appendChild(wrap);
    if (!must) wrap.querySelector('#gr-pass-keep').addEventListener('click', function () { wrap.remove(); });
    var form = wrap.querySelector('#gr-pass-form');
    var passI = wrap.querySelector('#gr-pass-new');
    var errEl = wrap.querySelector('#gr-pass-err');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var pass = String(passI.value || '');
      if (pass.length < PASS_MIN) { errEl.textContent = 'Password needs at least ' + PASS_MIN + ' characters.'; passI.focus(); return; }
      form.querySelector('button').disabled = true;
      try {
        var q = await sb.auth.updateUser({ password: pass });
        if (q.error) throw q.error;
        if (q.data && q.data.user) session.user = q.data.user;
        mustPassDone();
        wrap.querySelector('.gate-card').innerHTML =
          '<span class="logo-mark gate-mark" role="img" aria-label="Greenroom"></span>' +
          '<p class="gate-hi">Password saved.</p>' +
          '<button class="btn primary block" id="gr-pass-done" type="button">Keep going</button>';
        wrap.querySelector('#gr-pass-done').addEventListener('click', function () { wrap.remove(); });
      } catch (e2) {
        form.querySelector('button').disabled = false;
        errEl.textContent = /different from the old/i.test(String(e2 && e2.message || ''))
          ? (must ? 'Pick a different password from the one this account started with.'
                  : 'That\u2019s the password you already had. Pick a new one, or just keep going.')
          : /password/i.test(String(e2 && e2.message || '')) && /at least|short|weak|characters|guess/i.test(String(e2 && e2.message || ''))
          ? sgPassSay(String(e2.message))
          : 'Couldn\u2019t save it. Try again.';
      }
    });
  }
  async function pushProfile() {
    if (!session || !session.user) return;
    var m = session.user.user_metadata || {};
    try {
      await sb.from('profiles').upsert({
        user_id: session.user.id,
        full_name: String(m.full_name || '').slice(0, 60),
        first_name: String(m.first_name || '').slice(0, 30),
        last_name: String(m.last_name || '').slice(0, 30),
        username: String(m.username || '').slice(0, 40),
        email: session.user.email || '',
        phone: String(m.phone || '').slice(0, 30),
        tour_role: roleName(m.tour_role).slice(0, 40),
        updated_at: new Date().toISOString()
      });
    } catch (e) {   }
  }
  var pendingAnswers = null;
  async function savePending() {
    var p = pendingAnswers;
    pendingAnswers = null;
    if (!p || !session || !session.user) return;
    if (String(session.user.email || '').toLowerCase() !== p.email) return;
    var born = Date.parse(session.user.created_at || '');
    if (born && Date.now() - born > 864e5) return;
    var first = p.first.slice(0, 30), last = p.last.slice(0, 30), full = (p.first + ' ' + p.last).trim();
    try {
      var m = session.user.user_metadata || {};
      var change = {};
      if (String(m.first_name || '') !== first || String(m.last_name || '') !== last) {
        change.data = { first_name: first, last_name: last, full_name: full.slice(0, 60), username: full.slice(0, 40) };
      }
      if (p.pass) change.password = p.pass;
      if (change.data || change.password) {
        var q = await sb.auth.updateUser(change);
        if (!q.error && q.data && q.data.user) session.user = q.data.user;
      }
    } catch (e) {   }
    await pushProfile();
    if (p.handle) {
      try { await window.GR_BACKEND.setHandle(p.handle); } catch (e) {   }
    }
    if (p.birth) {
      try { await window.GR_BACKEND.saveBirthDate(p.birth); } catch (e) {   }
    }
  }
  function soon(work, ms) {
    return Promise.race([Promise.resolve(work).catch(function () {   }),
      new Promise(function (res) { setTimeout(res, ms); })]);
  }
  var firstFacts = null;
  async function loadFirstRun(ms) {
    var got = null;
    try {
      var q = await Promise.race([sb.rpc('my_first_run'),
        new Promise(function (res) { setTimeout(function () { res(null); }, ms || 8000); })]);
      if (q && !q.error && isObj(q.data)) got = q.data;
    } catch (e) { got = null; }
    firstFacts = got
      ? { onboarded: got.onboarded !== false, kinds: cleanKinds(got.kinds), handle: String(got.handle || ''),
          hasBirth: got.hasBirth === true, needsLegal: got.needs_legal === true }
      : { onboarded: true, kinds: [], handle: '', hasBirth: true, unknown: true };
  }
  async function rereadFirstRun() {
    var before = firstFacts;
    await loadFirstRun(5000);
    if (firstFacts.unknown && before && !before.unknown) firstFacts = before;
  }
  async function online() {
    var sent = await legalSendHeld();
    var owed = sent === 'owed' || sent === 'owed-stale';
    var facts = pendingAnswers ? null : loadFirstRun();
    try { await sb.rpc('claim_invites'); } catch (e) {   }
    if (facts) await facts;
    else {
      await soon(savePending(), 10000);
      await loadFirstRun();
    }
    pushProfile();
    var invited = !!(session && session.user && session.user.user_metadata &&
      session.user.user_metadata.invited === true);
    var who = (session && session.user) || {};
    var born = Date.parse(who.created_at || ''), proved = Date.parse(who.email_confirmed_at || who.confirmed_at || '');
    var fresh = (!!born && Date.now() - born < 864e5) || (!!proved && Date.now() - proved < 864e5);
    var blind = !!firstFacts.unknown && sent !== 'saved';
    var needs = owed || firstFacts.needsLegal === true;
    var said = sent === 'again' ? { again: true } : (sent === 'stale' || sent === 'owed-stale') ? { note: LEGAL_STALE } : {};
    if (invited) {
      if (needs || blind) await legalInside(true, 'invite', { again: !!said.again, note: said.note || '', blind: !needs });
    } else if (needs || (blind && fresh)) {
      var must = owed || firstFacts.onboarded === false || (blind && fresh);
      if (must || !legalHeldInside()) await legalInside(must, 'inside', { again: !!said.again, note: said.note || '', blind: !needs });
    }
    legalStarted = true;
    if (invited) passwordGate(owed);
    else if (mustPassDue()) newPasswordGate(true);
    else if (resetting) newPasswordGate();
    try { await refetch(); } catch (e) {   }
    try { await importLocalTours(); } catch (e) {   }
    sb.channel('greenroom')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tours' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tour_public' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'day_requests' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'flowers' }, flowersChanged)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ari_asks' }, scheduleRefetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dms' }, dmChanged)
      .subscribe(function (status) {
        if (status !== 'SUBSCRIBED') return;
        if (liveOnce && session) { refetchTries = 0; scheduleRefetch(); feedChanged(); socialMissed(); }
        liveOnce = true;
      });
    try {
      sb.channel('greenroom-reimbursements')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reimbursements' }, scheduleRefetch)
        .subscribe();
    } catch (e) {   }
    try {
      var pokeId = session && session.user ? String(session.user.id || '') : '';
      if (/^[0-9a-f-]{36}$/i.test(pokeId)) {
        var onPoke = function (ev) {
          var row = ev && ev.new;
          if (row && row.user_id && String(row.user_id) !== pokeId) return;
          poked(row && row.what);
        };
        sb.channel('greenroom-pokes')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pokes', filter: 'user_id=eq.' + pokeId }, onPoke)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pokes', filter: 'user_id=eq.' + pokeId }, onPoke)
          .subscribe();
      }
    } catch (e) {   }
    resolvers.db(db);
    resolvers.user(user);
    resolvers.sample(sample);
  }
  boot().catch(function () {
    resolvers.db(null); resolvers.user(null); resolvers.sample(null);
  });
})();
