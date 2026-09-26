/* أفواج — service worker: keeps the program itself (page, scripts, styles, logo, fonts) on the device so it opens
 * without internet. Data never goes through here: the app keeps its own copy in IndexedDB and syncs it (offline.js). */
const CACHE = 'afwaj-shell-v1';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/img/logo.svg', '/img/favicon.svg']).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const same = url.origin === self.location.origin;
  if (same && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/o/'))) return; // live data: never cached here
  if (req.mode === 'navigate') { // page: network first (always the newest deploy), device copy when offline
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put('/', c)); } return r; }).catch(() => caches.match('/')));
    return;
  }
  if (same) { // versioned assets (?v=<build>): cache first — a new deploy changes the URL
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); } return r; })));
  }
});
