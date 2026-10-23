(function () {
  'use strict';
  var PARENTS = ['https://devinoliverofficial.github.io', 'capacitor://localhost'];
  var MAPKIT = 'https://cdn.apple-mapkit.com/mk/6.1.182/mapkit.core.js';
  var RADIUS = 150;
  var NEAR = 250;
  var GOOD = 0.75;
  var SAME = 0.95;
  function parentsOf(w) {
    if (!w || !w.parent || w.parent === w) return [];
    var ao = w.location && w.location.ancestorOrigins;
    if (ao && ao.length) return PARENTS.indexOf(ao[0]) >= 0 ? [ao[0]] : [];
    return [];
  }
  function ask(part) {
    var q = {};
    String(part || '').replace(/^[?#]/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1);
      try { q[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {   }
    });
    var num = function (k, lim) {
      var s = String(q[k] == null ? '' : q[k]);
      if (!/^-?\d{1,3}(\.\d{1,9})?$/.test(s)) return null;
      var v = +s;
      return Math.abs(v) <= lim ? v : null;
    };
    var lat = num('lat', 90), lon = num('lon', 180);
    var pid = String(q.pid || '');
    return {
      name: String(q.name || '').trim().slice(0, 120),
      city: String(q.city || '').trim().slice(0, 80),
      lat: lat != null && lon != null ? lat : null,
      lon: lat != null && lon != null ? lon : null,
      pid: /^[A-Za-z0-9_-]{4,64}$/.test(pid) ? pid : ''
    };
  }
  function plain(s) {
    var t = String(s || '');
    try { t = t.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {   }
    return t.toLowerCase().replace(/&/g, ' and ').replace(/['‘’`]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/^the /, '');
  }
  function dice(a, b) {
    if (!a.length || !b.length) return 0;
    var rest = b.slice(), hit = 0;
    a.forEach(function (x) { var i = rest.indexOf(x); if (i >= 0) { hit += 1; rest.splice(i, 1); } });
    return 2 * hit / (a.length + b.length);
  }
  function pairs(s) {
    var t = s.replace(/ /g, ''), out = [];
    for (var i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    return out;
  }
  function alike(want, got) {
    var a = plain(want), b = plain(got);
    if (!a || !b) return 0;
    if (a === b) return 1;
    var short = a.length <= b.length ? a : b, long = short === a ? b : a;
    if (short.length >= 4 && (' ' + long + ' ').indexOf(' ' + short + ' ') >= 0) return 0.9;
    return Math.max(dice(a.split(' '), b.split(' ')), dice(pairs(a), pairs(b)));
  }
  function meters(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function pick(places, name, lat, lon, least) {
    var best = null;
    (Array.isArray(places) ? places : []).forEach(function (p) {
      if (!p || !p.name) return;
      var score = alike(name, p.name);
      if (score < (least || GOOD)) return;
      var c = p.coordinate;
      var far = lat != null && c && isFinite(c.latitude) && isFinite(c.longitude) ? meters(lat, lon, c.latitude, c.longitude) : null;
      if (far != null && far > NEAR) return;
      if (!best || score > best.score || (score === best.score && far != null && (best.far == null || far < best.far))) {
        best = { place: p, score: score, far: far };
      }
    });
    return best ? best.place : null;
  }
  function searchOf(mk, region) {
    var o = { includeAddresses: false, includePhysicalFeatures: false, includePointsOfInterest: true, includeQueries: false };
    if (region) {
      o.region = region;
      o.regionPriority = (mk.RegionPriority && mk.RegionPriority.Required) || 'required';
    }
    return new mk.Search(o);
  }
  function find(mk, a) {
    var byId = a.pid ? new mk.PlaceLookup().getPlace(a.pid).then(null, function () { return null; }) : Promise.resolve(null);
    return byId.then(function (p) {
      if (p) return p;
      if (a.lat != null) {
        var dLat = 2 * RADIUS / 111320, dLon = dLat / Math.max(0.01, Math.cos(a.lat * Math.PI / 180));
        var region = new mk.CoordinateRegion(new mk.Coordinate(a.lat, a.lon), new mk.CoordinateSpan(dLat, dLon));
        return searchOf(mk, region).search(a.name).then(function (r) { return pick(r && r.places, a.name, a.lat, a.lon); });
      }
      var town = plain(a.city.split(',')[0]);
      if (!a.name || !town) return null;
      return searchOf(mk, null).search(a.name + ', ' + a.city).then(function (r) {
        var inTown = (r && Array.isArray(r.places) ? r.places : []).filter(function (p) { return p && plain(p.locality) === town; });
        return pick(inTown, a.name, null, null, SAME);
      });
    });
  }
  function run(w, d) {
    var to = parentsOf(w);
    if (!to.length) return;
    var said = false;
    var say = function (m) {
      m.greenroom = 'place';
      to.forEach(function (o) { try { w.parent.postMessage(m, o); } catch (e) {   } });
    };
    var end = function (m) { if (!said) { said = true; say(m); } };
    var cfg = w.GREENROOM_CONFIG || {};
    var token = typeof cfg.mapkitToken === 'string' ? cfg.mapkitToken.trim() : '';
    var a = ask(w.location && w.location.hash);
    if (!token) { end({ off: true }); return; }
    if (!a.name || (!a.pid && a.lat == null)) { end({ none: true }); return; }
    var s = d.createElement('script');
    s.crossOrigin = 'anonymous';
    s.async = true;
    s.onerror = function () { end({ off: true }); };
    s.onload = function () {
      var mk = w.mapkit;
      if (!mk || typeof mk.init !== 'function' || typeof mk.load !== 'function') { end({ off: true }); return; }
      mk.addEventListener('error', function () { end({ off: true }); });
      mk.init({ authorizationCallback: function (done) { done(token); } });
      mk.load(['map', 'services']).then(function () { return find(mk, a); }).then(function (place) {
        if (said) return;
        if (!place) { end({ none: true }); return; }
        var el = d.getElementById('place');
        new mk.PlaceDetail(el, place, {
          colorScheme: (mk.ColorScheme && mk.ColorScheme.Dark) || 'dark',
          displaysMap: true
        });
        if (place.id) say({ pid: String(place.id) });
        var last = -1;
        var tell = function () {
          if (said) return;
          var hgt = Math.ceil(el.getBoundingClientRect().height || 0);
          if (hgt !== last) { last = hgt; say({ h: hgt }); }
        };
        if (typeof w.ResizeObserver === 'function') new w.ResizeObserver(tell).observe(el);
        else { var n = 0, poll = w.setInterval(function () { tell(); if (++n >= 60) w.clearInterval(poll); }, 500); }
        tell();
      }, function () { end({ off: true }); });
    };
    s.src = MAPKIT;
    d.head.appendChild(s);
  }
  run(window, document);
})();
