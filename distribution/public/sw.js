/* مدار — service worker: بيحفظ ملفات البرنامج نفسه على الجهاز عشان يفتح من غير نت.
 * الأولوية للنسخة الجديدة من السيرفر دايماً، والنسخة المحفوظة بتُستخدم بس لو النت قاطع. البيانات مش بتعدي من هنا. */
const CACHE = 'madar-shell-v1';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/style.css', '/logo.svg']).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req.mode === 'navigate' ? '/' : req, c)); } return r; })
    .catch(() => caches.match(req.mode === 'navigate' ? '/' : req).then((hit) => hit || caches.match('/'))));
});
