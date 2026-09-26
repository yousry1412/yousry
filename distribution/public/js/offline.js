/* مدار — العمل بدون إنترنت
 * بيلفّ fetch لكل طلبات /api:
 *  - القراءة (GET): لو النت شغال بتتحفظ آخر نسخة على الجهاز، ولو النت قاطع بترجع آخر نسخة محفوظة
 *  - الحفظ (POST/PUT/PATCH/DELETE): لو النت قاطع بيتسجل في طابور على الجهاز بالترتيب، وأول ما النت
 *    يرجع بيترفع تلقائياً واحد ورا التاني. أي عملية السيرفر رفضها بتظهر في قائمة "عمليات لم تُرفع" بسببها.
 */
(function () {
  'use strict';
  const realFetch = window.fetch.bind(window);
  const DBN = 'madar-offline';
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DBN, 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('cache'); d.createObjectStore('queue', { keyPath: 'seq', autoIncrement: true }); d.createObjectStore('failed', { keyPath: 'seq', autoIncrement: true }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const out = fn(t.objectStore(store)); t.oncomplete = () => res(out && 'result' in out ? out.result : out); t.onerror = () => rej(t.error); }); };
  const all = (store) => tx(store, 'readonly', (s) => s.getAll());

  const isApi = (url) => { try { const u = new URL(url, location.href); return u.origin === location.origin && u.pathname.startsWith('/api/'); } catch (e) { return false; } };
  const hdrs = (init) => { const h = {}; const src = (init && init.headers) || {}; if (src instanceof Headers) src.forEach((v, k) => { h[k] = v; }); else Object.assign(h, src); return h; };
  const cacheKey = (url, h) => `${url}|c=${h['X-Company-Id'] || h['x-company-id'] || ''}|b=${h['X-Branch-Id'] || h['x-branch-id'] || ''}`;
  const json = (body, status, extra) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Offline': '1', ...(extra || {}) } });

  let offline = !navigator.onLine, queued = 0, failed = 0, syncing = false;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!isApi(url)) return realFetch(input, init);
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase(), h = hdrs(init);
    if (method === 'GET') {
      try {
        const r = await realFetch(input, init);
        setOffline(false);
        if (r.ok) { const txt = await r.clone().text(); tx('cache', 'readwrite', (s) => s.put({ body: txt, at: Date.now() }, cacheKey(url, h))).catch(() => {}); }
        return r;
      } catch (e) {
        setOffline(true);
        const hit = await tx('cache', 'readonly', (s) => s.get(cacheKey(url, h))).catch(() => null);
        if (hit) return new Response(hit.body, { status: 200, headers: { 'Content-Type': 'application/json', 'X-Offline': '1' } });
        return json({ error: 'مفيش إنترنت — الصفحة دي ما اتفتحتش قبل كده على الجهاز ده' }, 503);
      }
    }
    if (url.includes('/api/auth/')) { // login/logout need the server; remember who is signed in so the app can open offline
      const r = await realFetch(input, init);
      const statusKey = cacheKey(new URL('/api/auth/status', location.href).pathname, {});
      if (/\/api\/auth\/(login|setup)/.test(url) && r.ok) { const d = await r.clone().json().catch(() => null); if (d && d.user) tx('cache', 'readwrite', (s) => s.put({ body: JSON.stringify({ needsSetup: false, authenticated: true, user: d.user }), at: Date.now() }, statusKey)).catch(() => {}); }
      if (/\/api\/auth\/logout/.test(url)) tx('cache', 'readwrite', (s) => s.delete(statusKey)).catch(() => {});
      return r;
    }
    if (!offline) {
      try { const r = await realFetch(input, init); setOffline(false); return r; } catch (e) { setOffline(true); }
    }
    await tx('queue', 'readwrite', (s) => s.add({ method, url, headers: h, body: init && init.body != null ? String(init.body) : null, at: Date.now(), label: labelOf(method, url) }));
    await refreshCounts();
    return json({ ok: true, queued: true, offline: true, id: null, message: 'اتحفظت على الجهاز — هتترفع أول ما النت يرجع' }, 202);
  };
  const labelOf = (m, url) => { const p = new URL(url, location.href).pathname.replace('/api/', ''); return `${{ POST: 'إضافة', PUT: 'تعديل', PATCH: 'تعديل', DELETE: 'حذف' }[m] || m} — ${p}`; };

  async function refreshCounts() { try { queued = (await all('queue')).length; failed = (await all('failed')).length; } catch (e) { /* ignore */ } paint(); }
  function setOffline(v) { if (offline === v) return; offline = v; paint(); if (!v) sync(); else toast('📴 النت قطع — كمّل شغلك، أي حفظ هيتسجل على الجهاز ويترفع تلقائياً', 'info'); }
  function toast(msg, type) { if (window.UI && UI.toast) UI.toast(msg, type); }

  async function sync() {
    if (syncing || offline) return;
    syncing = true;
    let sent = 0;
    try {
      for (const item of await all('queue')) {
        let r;
        try { r = await realFetch(item.url, { method: item.method, headers: { ...item.headers, 'X-Offline-Replay': '1' }, body: item.body }); }
        catch (e) { setOffline(true); break; }
        if (r.status === 401) break; // login first, then it continues
        if (!r.ok) { const d = await r.json().catch(() => ({})); await tx('failed', 'readwrite', (s) => s.add({ ...item, seq: undefined, error: d.error || `خطأ ${r.status}`, failedAt: Date.now() })); }
        else sent++;
        await tx('queue', 'readwrite', (s) => s.delete(item.seq));
        await refreshCounts();
      }
    } finally { syncing = false; await refreshCounts(); }
    if (sent) { toast(`✅ رجع النت — اترفعت ${sent} عملية كانت محفوظة على الجهاز`, 'success'); if (typeof window.router === 'function') window.router(); }
    if (failed) toast(`⚠️ ${failed} عملية السيرفر رفضها — اضغط على مؤشر المزامنة لمراجعتها`, 'error');
  }

  // ---- status chip (bottom corner)
  function paint() {
    let el = document.getElementById('offlineChip');
    if (!el) { if (!document.body) return; el = document.createElement('button'); el.id = 'offlineChip'; el.type = 'button'; el.className = 'offline-chip'; el.addEventListener('click', showFailed); document.body.appendChild(el); }
    const show = offline || queued || failed;
    el.style.display = show ? '' : 'none';
    el.className = `offline-chip ${offline ? 'off' : failed ? 'bad' : 'busy'}`;
    el.textContent = offline ? `📴 بدون إنترنت${queued ? ` · ${queued} عملية على الجهاز` : ''}` : queued ? `⏳ جارِ رفع ${queued} عملية…` : `⚠️ ${failed} عملية لم تُرفع`;
  }
  async function showFailed() {
    const list = await all('failed').catch(() => []);
    if (!list.length) { if (!offline) sync(); return; }
    const rows = list.map((x) => `• ${new Date(x.at).toLocaleString('ar-EG')} — ${x.label}\n   السبب: ${x.error}`).join('\n');
    if (confirm(`عمليات اتعملت بدون نت والسيرفر رفضها (راجعها وأدخلها يدوياً):\n\n${rows}\n\nمسح القائمة؟`)) { await tx('failed', 'readwrite', (s) => s.clear()); refreshCounts(); }
  }
  window.addEventListener('online', () => setOffline(false));
  window.addEventListener('offline', () => setOffline(true));
  setInterval(() => { if (queued && !syncing) { if (offline) realFetch('/api/auth/status', { cache: 'no-store' }).then(() => setOffline(false)).catch(() => {}); else sync(); } }, 15000);
  document.addEventListener('DOMContentLoaded', () => { refreshCounts().then(() => { if (!offline && queued) sync(); }); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.Offline = { sync, status: () => ({ offline, queued, failed }) };
})();
