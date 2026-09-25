/* =====================================================================
 * Umrah ERP — App core: state store, persistence, event delegation,
 * rendering loop, modal/toast/print/export helpers, TTL ticker.
 * Pages register themselves in App.pages / App.actions / App.partials.
 * ===================================================================== */
(function () {
  'use strict';
  const E = window.Engine;
  const LS_KEY = 'umrah-erp-state-v3';
  const App = (window.App = { E, pages: {}, actions: {}, partials: {} });

  // ------------------------------------------------------------ state
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.version === 3 ? s : null;
    } catch (e) { return null; }
  }
  function hydrate(s) {
    // Derived collections the seed does not carry.
    if (!s.agentLedger) {
      // Rebuild a reconciling ledger: opening balance + booking debits (B2B) / commission credits (broker) = current balance.
      s.agentLedger = [];
      for (const a of s.agents) {
        const conv = (egp) => E.round2(a.currency === 'SAR' ? egp / s.fx.current : egp);
        const bks = s.bookings.filter((b) => b.agentId === a.id);
        if (a.tier === 'B2B') {
          const debits = bks.map((b) => ({ b, amt: conv(b.net) }));
          const opening = E.round2(a.balance + debits.reduce((x, y) => x + y.amt, 0));
          s.agentLedger.push({ agentId: a.id, at: s.seededAt - 30 * 86400000, desc: 'رصيد افتتاحي / شحن محفظة', debit: opening < 0 ? -opening : 0, credit: opening > 0 ? opening : 0 });
          for (const { b, amt } of debits) s.agentLedger.push({ agentId: a.id, at: b.createdAt, desc: `خصم حجز ${b.code} من المحفظة (سعر صافي)`, debit: amt, credit: 0, bookingId: b.id });
        } else {
          for (const b of bks) s.agentLedger.push({ agentId: a.id, at: b.createdAt, desc: `عمولة وسيط – حجز ${b.code}`, debit: 0, credit: b.agentCommission, bookingId: b.id });
          a.balance = bks.reduce((x, b) => x + b.agentCommission, 0);
        }
      }
    }
    for (const p of s.pax) if (p.boarding == null) p.boarding = Number(p.id.slice(1)) % 3;
    return s;
  }
  App.S = hydrate(load() || window.MockData.buildSeed());
  App.save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(App.S)); } catch (e) { /* private mode */ } };
  App.reset = () => { App.S = hydrate(window.MockData.buildSeed()); App.ui.selPax = null; App.ui.pickedBed = null; App.save(); App.render(); App.toast('تمت إعادة تحميل البيانات التجريبية'); };

  App.ui = {
    page: 'builder', city: 'MAK', roomMode: 'sales', selPax: null, pickedBed: null, pickedSeat: null, pickedBusPax: null,
    heatAllot: 'AL-MAK-01', heatStart: null, heatEnd: null, opsTab: 'vault', reportCity: 'MAK', actingUser: 'U3',
    bookingFilter: 'ALL', paxSearch: '', waTpl: 'confirm', waFilter: 'ALL', voucherPax: null, stmtAgent: 'A1',
    extranetAgent: null, showPool: false, showAllTypes: false, vaultFilter: 'ALL',
    draft: null,
  };

  // ---------------------------------------------------------- helpers
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  App.h = {
    esc,
    egp: (n) => (n == null ? '—' : `<span class="num">${nf0.format(Math.round(n))}</span> ج.م`),
    sar: (n) => (n == null ? '—' : `<span class="num">${nf0.format(Math.round(n))}</span> ر.س`),
    cur: (n, c) => (c === 'SAR' ? App.h.sar(n) : App.h.egp(n)),
    n0: (n) => nf0.format(Math.round(n || 0)),
    n2: (n) => nf2.format(n || 0),
    dt: (ms) => new Date(ms).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }),
    day: (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }),
    user: () => App.S.users.find((u) => u.id === App.ui.actingUser),
    booking: (id) => App.S.bookings.find((b) => b.id === id),
    pax: (id) => App.S.pax.find((p) => p.id === id),
    agent: (id) => App.S.agents.find((a) => a.id === id),
    supplier: (id) => App.S.suppliers.find((s) => s.id === id),
    room: (id) => App.S.rooms.find((r) => r.id === id),
    statusChip(st) {
      const m = E.BOOKING_STATUS[st] || { ar: st };
      const cls = { SOFT_HOLD: 'hold', PENDING_APPROVAL: 'hold', PENDING_PRICING: 'hold', DEPOSIT: 'deposit', CONFIRMED: 'confirmed', EXPIRED: 'expired', CANCELLED: 'cancelled' }[st] || '';
      return `<span class="chip ${cls}">${esc(m.ar)}</span>`;
    },
    genderChip: (g) => (g === 'M' ? '<span class="chip male">♂ رجال</span>' : g === 'F' ? '<span class="chip female">♀ سيدات</span>' : g === 'P' ? '<span class="chip private">🔒 مغلقة</span>' : '<span class="chip">غير مفتوحة</span>'),
    paxGender: (g) => (g === 'M' ? '<span class="chip male">♂ ذكر</span>' : '<span class="chip female">♀ أنثى</span>'),
    countdown: (until) => `<span class="num" data-countdown="${until}">${fmtLeft(until - Date.now())}</span>`,
    progress(paid, net) {
      const pct = net ? Math.min(100, Math.round((paid / net) * 100)) : 0;
      return `<div class="progress ${pct >= 100 ? 'full' : ''}" title="${pct}%"><span style="width:${pct}%"></span></div><div class="small muted num">${pct}%</div>`;
    },
    channelLabel(b) {
      if (b.channel === 'DIRECT') { const u = App.S.users.find((x) => x.id === b.userId); return `مباشر – ${esc(u ? u.name : '')}`; }
      const a = App.h.agent(b.agentId); return `${b.channel === 'B2B' ? 'وكيل' : 'وسيط'} – ${esc(a ? a.name : '')}`;
    },
  };
  function fmtLeft(ms) {
    if (ms <= 0) return 'انتهت المهلة';
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  App.audit = (msg) => { App.S.audit.unshift({ at: Date.now(), by: App.h.user().name, msg }); App.S.audit.length = Math.min(App.S.audit.length, 200); };

  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((x, k) => x[k], o); t[last] = v; };
  App.getPath = getPath; App.setPath = setPath;
  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.dataset.num !== undefined) { const n = parseFloat(el.value); return Number.isFinite(n) ? n : 0; }
    return el.value;
  }

  // --------------------------------------------------------- feedback
  App.toast = (msg, kind = '') => {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 6000 : 3800);
  };
  App.modal = (html) => { document.getElementById('modal-root').innerHTML = `<div class="modal-bg" data-act="modalBg"><div class="modal">${html}</div></div>`; };
  App.closeModal = () => { document.getElementById('modal-root').innerHTML = ''; };
  App.actions.modalBg = (d, el, ev) => { if (ev.target === el) App.closeModal(); };
  App.actions.closeModal = () => App.closeModal();
  App.val = (id) => { const el = document.getElementById(id); return el ? readValue(el) : undefined; };

  /** Print an isolated document (rooming list, manifest, voucher) via a hidden iframe → Save as PDF. */
  App.printDoc = (title, bodyHtml, landscape) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px';
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open();
    d.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:12mm}body{font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;color:#111;font-size:11px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #888;padding:4px 6px;text-align:start}th{background:#0d3b2c;color:#fff}
      h1,h2{color:#0d3b2c;margin:0 0 4px}.ltr{direction:ltr;text-align:left}.muted{color:#555}.box{border:1px solid #0d3b2c;border-radius:8px;padding:10px;margin:8px 0}
      .head{display:flex;justify-content:space-between;border-bottom:3px solid #b8912f;padding-bottom:8px;margin-bottom:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}</style>
      </head><body>${bodyHtml}</body></html>`);
    d.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 1500); }, 250);
  };
  App.download = (filename, content, mime) => {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  /** Excel-compatible exports: UTF-8 CSV with BOM + SpreadsheetML-flavoured HTML (.xls). */
  App.exportTable = (basename, headers, rows, fmt) => {
    if (fmt === 'csv') {
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      App.download(basename + '.csv', '\ufeff' + [headers, ...rows].map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
    } else {
      const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">
        <tr>${headers.map((x) => `<th style="background:#0d3b2c;color:#fff">${esc(x)}</th>`).join('')}</tr>
        ${rows.map((r) => `<tr>${r.map((x) => `<td style="mso-number-format:'\\@'">${esc(x)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
      App.download(basename + '.xls', '\ufeff' + html, 'application/vnd.ms-excel');
    }
  };

  // ----------------------------------------------------------- render
  const NAV = [
    ['التخطيط والتسعير', [['builder', '🧮', 'البناء والتكلفة وFX'], ['heatmap', '🗓️', 'رادار الإتاحات']]],
    ['المبيعات', [['booking', '🧾', 'محرك الحجز'], ['agents', '🤝', 'بوابة الوكلاء والمحافظ']]],
    ['التشغيل', [['rooms', '🛏️', 'التسكين المزدوج'], ['bus', '🚌', 'مقاعد الباص'], ['ops', '🛂', 'العمليات والتقارير']]],
    ['المالية', [['pnl', '📊', 'الإغلاق والأرباح']]],
  ];
  function renderShell() {
    const S = App.S, h = App.h, t = S.trip;
    document.getElementById('nav').innerHTML = NAV.map(([sec, items]) => `<div class="nav-sec">${sec}</div>` +
      items.map(([k, ico, lbl]) => `<button class="${App.ui.page === k ? 'active' : ''}" data-act="go" data-page="${k}"><span class="ico">${ico}</span>${lbl}</button>`).join('')).join('');
    document.getElementById('top').innerHTML = `
      <div>
        <div class="trip-title">${esc(t.name)} <span class="chip gold">${esc(t.costCenter)}</span> ${t.lockedPrices ? '<span class="chip ok">🔒 الأسعار مقفلة</span>' : '<span class="chip hold">الأسعار غير مقفلة</span>'}</div>
        <div class="meta">سفر <span class="num">${t.departDate}</span> ← عودة <span class="num">${t.returnDate}</span> · ${esc(t.flight)}</div>
      </div>
      <div class="top-tools">
        <span class="chip">صرف مرجعي <b class="num">${t.fxRef}</b></span>
        <span class="chip ${S.fx.current > t.fxRef ? 'danger' : 'ok'}">صرف السوق <b class="num">${S.fx.current}</b></span>
        <label class="small muted">المستخدم الحالي</label>
        <select class="input" style="width:auto" data-ui="actingUser">${S.users.map((u) => `<option value="${u.id}" ${u.id === App.ui.actingUser ? 'selected' : ''}>${esc(u.name)} · خصم ≤ ${E.ROLES[u.role].maxDiscount}%</option>`).join('')}</select>
        <button class="btn sm ghost" data-act="resetDemo" title="إعادة البيانات التجريبية">↺ بيانات تجريبية</button>
      </div>`;
  }
  let focusKey = null;
  App.render = () => {
    renderShell();
    const page = App.pages[App.ui.page] || App.pages.builder;
    document.getElementById('content').innerHTML = page();
    if (focusKey) {
      const el = document.querySelector(focusKey);
      if (el) { el.focus(); if (el.setSelectionRange && el.type === 'text') { const l = el.value.length; el.setSelectionRange(l, l); } }
      focusKey = null;
    }
  };
  App.refreshPartials = () => {
    document.querySelectorAll('[data-partial]').forEach((el) => { const fn = App.partials[el.dataset.partial]; if (fn) el.innerHTML = fn(); });
  };
  function keyOf(el) {
    for (const a of ['data-bind', 'data-ui', 'data-live']) if (el && el.hasAttribute && el.hasAttribute(a)) return `[${a}="${el.getAttribute(a)}"]`;
    return el && el.id ? '#' + el.id : null;
  }
  // Re-render after the browser has moved focus, then restore it (keeps Tab navigation smooth).
  const deferRender = () => setTimeout(() => { focusKey = keyOf(document.activeElement); App.render(); }, 0);

  // --------------------------------------------------- event delegation
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    const fn = App.actions[el.dataset.act];
    if (fn) fn(el.dataset, el, ev);
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.hasAttribute('data-bind')) { setPath(App.S, el.dataset.bind, readValue(el)); App.save(); if (el.dataset.after && App.actions[el.dataset.after]) App.actions[el.dataset.after](el.dataset, el); deferRender(); }
    else if (el.hasAttribute('data-ui')) { setPath(App.ui, el.dataset.ui, readValue(el)); deferRender(); }
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.hasAttribute('data-live')) { setPath(App.ui, el.dataset.live, readValue(el)); App.refreshPartials(); }
  });
  // Drag & drop (bus seats).
  document.addEventListener('dragstart', (ev) => { const el = ev.target.closest('[data-drag-pax]'); if (el) ev.dataTransfer.setData('text/plain', el.dataset.dragPax); });
  document.addEventListener('dragover', (ev) => { const el = ev.target.closest('[data-drop-seat]'); if (el) { ev.preventDefault(); el.classList.add('drop'); } });
  document.addEventListener('dragleave', (ev) => { const el = ev.target.closest('[data-drop-seat]'); if (el) el.classList.remove('drop'); });
  document.addEventListener('drop', (ev) => {
    const el = ev.target.closest('[data-drop-seat]');
    if (!el) return;
    ev.preventDefault();
    const paxId = ev.dataTransfer.getData('text/plain');
    if (paxId && App.actions.busDrop) App.actions.busDrop({ seat: el.dataset.dropSeat, pax: paxId });
  });

  App.actions.go = (d) => { App.ui.page = d.page; App.ui.pickedBed = null; App.ui.pickedSeat = null; App.render(); window.scrollTo(0, 0); };
  App.actions.resetDemo = () => { if (confirm('إعادة تحميل البيانات التجريبية ومسح كل التعديلات؟')) App.reset(); };

  // ------------------------------------------ TTL ticker (soft-hold engine)
  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('[data-countdown]').forEach((el) => { el.textContent = fmtLeft(Number(el.dataset.countdown) - now); });
    const released = E.releaseExpiredHolds(App.S, now);
    if (released.length) {
      released.forEach((c) => App.audit(`تحرير آلي للحجز ${c} لانتهاء مهلة التعليق`));
      App.save();
      App.toast(`⏱️ انتهت مهلة التعليق وتحرر المخزون تلقائياً: ${released.join('، ')}`, 'warn');
      App.render();
    }
  }, 1000);

  window.addEventListener('DOMContentLoaded', () => {
    App.ui.draft = App.newDraft ? App.newDraft() : null;
    App.render();
  });
})();
