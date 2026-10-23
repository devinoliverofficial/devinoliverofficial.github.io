var CACHE = 'greenroom-20261023-164402';
var SHELL = ['./', 'index.html', 'core.js', 'statements.js', 'app.js',
  'manifest.webmanifest', 'icon-180.png', 'icon-512.png', 'logo-full.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: 'reload' }); }));
    })
      .then(function () { return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});
function isShell(url) {
  var p = url.pathname.replace(/^.*\//, '') || 'index.html';
  return SHELL.indexOf(p) >= 0 || p === 'index.html' || /\.(js|png|webmanifest|css)$/.test(p);
}
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/(^|\/)sw\.js$/.test(url.pathname)) return;
  if (/(^|\/)place\.(html|js)$/.test(url.pathname)) return;
  var fresh = fetch(e.request, { cache: 'no-store' }).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); }
    return res;
  });
  if (isShell(url)) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) { fresh.catch(function () {   }); return hit; }
      return fresh.catch(function () { return caches.match('index.html'); });
    }));
    return;
  }
  e.respondWith(fresh.catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('index.html'); });
  }));
});
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {   }
  e.waitUntil(self.registration.showNotification(d.title || 'Greenroom', {
    body: d.body || '',
    icon: 'icon-180.png',
    badge: 'icon-180.png',
    data: { tourId: d.tourId || null }
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
    return clients.openWindow('./');
  }));
});
