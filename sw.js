/* Hisaab — offline shell.
   Network first so an updated app is picked up straight away; the cache is
   the safety net for tunnels, planes and dead signal. */
// Bump this on release. Old caches are deleted on activate, so a stale shell can
// never outlive a deploy even if a browser hangs on to the previous worker.
const CACHE = 'hisaab-v1.2';
const SHELL = [
  './', './index.html', './app.css', './app.js',
  './icon.svg', './icon-maskable.svg', './manifest.webmanifest',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});
