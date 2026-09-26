/* أفواج — public marketing page: everything open for sale (live prices & remaining places) + "طلب العمل" form. No login. */
(function () {
  'use strict';
  const token = (location.pathname.match(/\/o\/([\w-]+)/) || [])[1];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const n0 = (n) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0));
  const date = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const DOM = { UMRAH: ['🕋', 'العمرة'], HAJJ: ['⛰️', 'الحج'], DOMESTIC: ['🏖️', 'السياحة الداخلية'] };
  let data = null, tab = null;

  const wa = (text) => { const p = String((data && data.company.phone) || '').replace(/\D/g, '').replace(/^0/, '20'); return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null; };
  const places = (n) => (n == null ? '' : n <= 0 ? '<span class="chip danger">مكتمل</span>' : n <= 5 ? `<span class="chip hold">🔥 متبقي ${n} فقط</span>` : `<span class="chip ok">متاح ${n} مكان</span>`);
  const prices = (list) => `<div class="pub-prices">${list.map((p) => `<div><small>${esc(p.room)}</small><b class="num">${n0(p.price)}</b><small>ج.م / فرد</small></div>`).join('')}</div>`;
  const ask = (code, name) => { const u = wa(`السلام عليكم، أريد الاستفسار/الحجز في ${name} (${code})`); return u ? `<a class="btn primary" href="${u}" target="_blank" rel="noopener">🟢 احجز / استفسر واتساب</a>` : ''; };

  const cards = {
    UMRAH: () => data.umrah.map((t) => `<article class="card pub-card"><div class="row"><h3>${esc(t.name)}</h3><span class="spacer"></span>${places(t.free)}</div>
      <div class="small muted">🛫 ${date(t.departDate)} ← 🛬 ${date(t.returnDate)} · ${esc(t.code)}</div>
      <div class="small">${t.hotels.filter((x) => x.hotel).map((x) => `🏨 ${esc(x.city)}: ${esc(x.hotel)}${x.nights ? ` (${x.nights} ليالٍ)` : ''}`).join('<br>')}</div>
      ${prices(t.prices)}${t.child ? `<div class="small muted">طفل بدون سرير ${n0(t.child)} · رضيع ${n0(t.infant)}</div>` : ''}${ask(t.code, t.name)}</article>`).join(''),
    HAJJ: () => data.hajj.map((k) => `<article class="card pub-card"><div class="row"><h3>${esc(k.name)}</h3><span class="chip gold">${esc(k.level)}</span><span class="spacer"></span>${places(k.free)}</div>
      <div class="small muted">${esc(k.season)} · 🛫 ${date(k.departDate)} ← 🛬 ${date(k.returnDate)}</div>
      <div class="small">${k.hotels.map((x) => `🏨 ${esc(x.city)}: ${esc(x.hotel)}${x.nights ? ` (${x.nights} ليالٍ)` : ''}`).join('<br>')}</div>${prices(k.prices)}${ask(k.code, k.name)}</article>`).join(''),
    DOMESTIC: () => data.domestic.map((p) => `<article class="card pub-card"><div class="row"><h3>${esc(p.icon || '')} ${esc(p.name)}</h3><span class="spacer"></span>${places(p.free)}</div>
      <div class="small muted">${esc(p.kind || '')} · 📍 ${esc(p.city)} · ${date(p.startDate)}${p.endDate !== p.startDate ? ' ← ' + date(p.endDate) : ''}${p.transport ? ' · ' + esc(p.transport) : ''}</div>
      ${p.includes.length ? `<ul class="small pub-inc">${p.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${prices(p.prices)}${ask(p.code, p.name)}</article>`).join(''),
  };
  const listOf = (d) => ({ UMRAH: data.umrah, HAJJ: data.hajj, DOMESTIC: data.domestic }[d] || []);
  function render() {
    const doms = data.company.domains.filter((d) => DOM[d]);
    if (!tab || !doms.includes(tab)) tab = doms.find((d) => listOf(d).length) || doms[0];
    $('pubTabs').innerHTML = doms.length > 1 ? doms.map((d) => `<button class="${tab === d ? 'active' : ''}" data-t="${d}">${DOM[d][0]} ${DOM[d][1]} (${listOf(d).length})</button>`).join('') : '';
    const html = cards[tab] ? cards[tab]() : '';
    $('pubList').innerHTML = html ? `<div class="pub-grid">${html}</div>` : '<div class="card muted">لا توجد عروض مفتوحة حالياً في هذا القسم — تابعنا قريباً.</div>';
  }
  $('pubTabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-t]'); if (b) { tab = b.dataset.t; render(); } });

  async function load() {
    if (!token) { $('pubList').innerHTML = '<div class="card">الرابط غير مكتمل.</div>'; return; }
    try {
      const r = await fetch('/api/public/offers/' + encodeURIComponent(token), { cache: 'no-store' });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'تعذر التحميل');
      data = d;
      document.title = `${d.company.name} — عروض العمرة والحج والسياحة`;
      $('pubName').textContent = d.company.name;
      $('pubSub').textContent = d.company.domains.filter((x) => DOM[x]).map((x) => DOM[x][1]).join(' · ') + ' — الأسعار والأماكن المتاحة لحظياً';
      const w = wa('السلام عليكم، أريد الاستفسار عن عروضكم'); if (w) { $('pubWa').href = w; $('pubWa').style.display = ''; }
      $('pubFoot').innerHTML = `${esc(d.company.name)}${d.company.phone ? ' · ☎️ ' + esc(d.company.phone) : ''}${d.company.address ? ' · ' + esc(d.company.address) : ''} · بواسطة أفواج`;
      $('joinDomains').innerHTML = '<span class="small muted">مهتم بـ:</span> ' + d.company.domains.filter((x) => DOM[x]).map((x) => `<label class="chk"><input type="checkbox" name="domains" value="${x}" checked> ${DOM[x][0]} ${DOM[x][1]}</label>`).join(' ');
      render();
    } catch (e) { $('pubList').innerHTML = `<div class="card alert err">${esc(e.message)}</div>`; $('join').style.display = 'none'; }
  }
  $('joinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, body = Object.fromEntries(new FormData(f).entries());
    body.domains = [...f.querySelectorAll('input[name=domains]:checked')].map((x) => x.value);
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    try {
      const r = await fetch('/api/public/apply/' + encodeURIComponent(token), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'umrah' }, body: JSON.stringify(body) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'تعذر الإرسال');
      f.innerHTML = `<div class="alert ok">✅ شكراً ${esc(d.name)} — وصل طلبك للإدارة. بعد الموافقة هيوصلك اسم المستخدم وكلمة السر على الموبايل/الواتساب.</div>`;
    } catch (err) { $('joinMsg').innerHTML = `<div class="alert err">${esc(err.message)}</div>`; btn.disabled = false; }
  });
  load();
})();
