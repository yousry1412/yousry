/* =====================================================================
 * Umrah ERP — App core
 * state store (company document, mounted trip) · persistence (online:
 * versioned server document / offline: localStorage demo) · auth ·
 * sidebar navigation with role-based groups · notifications & chat
 * badges · uploads · modal/toast/print/export helpers · TTL ticker.
 * Pages register in App.pages / App.actions / App.partials.
 * ===================================================================== */
(function () {
  'use strict';
  const E = window.Engine, Acc = window.Acc, Model = window.Model;
  const LS_KEY = 'umrah-erp-state-v4';
  const App = (window.App = { E, Acc, Model, pages: {}, actions: {}, partials: {} });

  App.S = null; App.online = false; App.me = null; App.version = 0; App.companies = []; App.companyId = null;
  App.notifications = { items: [], unread: 0 }; App.chatUnread = 0; App.fxGlobal = null;

  App.ui = {
    page: 'home', city: 'MAK', roomMode: 'sales', selPax: null, pickedBed: null, pickedSeat: null, pickedBusPax: null,
    heatAllot: null, heatStart: null, heatEnd: null, opsTab: 'vault', reportCity: 'MAK', actingUser: 'U3',
    bookingFilter: 'ALL', paxSearch: '', waTpl: 'confirm', waFilter: 'ALL', voucherPax: null, stmtAgent: null,
    extranetAgent: null, showAllTypes: false, vaultFilter: 'ALL', draft: null, navOpen: {},
  };

  // ------------------------------------------------------------ helpers
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function fmtLeft(ms) {
    if (ms <= 0) return 'انتهت المهلة';
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  App.h = {
    esc,
    egp: (n) => (n == null ? '—' : `<span class="num">${nf0.format(Math.round(n))}</span> ج.م`),
    sar: (n) => (n == null ? '—' : `<span class="num">${nf0.format(Math.round(n))}</span> ر.س`),
    cur: (n, c) => (c === 'SAR' ? App.h.sar(n) : c && c !== 'EGP' ? `<span class="num">${nf0.format(Math.round(n))}</span> ${esc(c)}` : App.h.egp(n)),
    money: (n) => `<span class="num">${nf2.format(n || 0)}</span>`,
    n0: (n) => nf0.format(Math.round(n || 0)),
    n2: (n) => nf2.format(n || 0),
    dt: (ms) => new Date(ms).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' }),
    day: (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' }),
    user: () => App.S.users.find((u) => u.id === App.ui.actingUser) || { name: '—', role: 'SALES' },
    booking: (id) => App.S.bookings.find((b) => b.id === id),
    pax: (id) => App.S.pax.find((p) => p.id === id),
    agent: (id) => App.S.agents.find((a) => a.id === id),
    supplier: (id) => App.S.suppliers.find((s) => s.id === id) || { name: '—' },
    customer: (id) => App.S.customers.find((c) => c.id === id),
    employee: (id) => App.S.employees.find((c) => c.id === id),
    room: (id) => App.S.rooms.find((r) => r.id === id),
    cashbox: (id) => App.S.cashboxes.find((c) => c.id === id),
    branch: (id) => App.S.branches.find((b) => b.id === id) || { name: '—' },
    partyName(p) {
      if (!p) return '—';
      const x = p.type === 'customer' ? App.h.customer(p.id) : p.type === 'agent' ? App.h.agent(p.id) : p.type === 'supplier' ? App.S.suppliers.find((s) => s.id === p.id) : App.h.employee(p.id);
      return x ? `${x.code ? x.code + ' · ' : ''}${x.name}` : '—';
    },
    statusChip(st) {
      const m = E.BOOKING_STATUS[st] || { ar: st };
      const cls = { SOFT_HOLD: 'hold', PENDING_APPROVAL: 'hold', PENDING_PRICING: 'hold', DEPOSIT: 'deposit', CONFIRMED: 'confirmed', EXPIRED: 'expired', CANCELLED: 'cancelled' }[st] || '';
      return `<span class="chip ${cls}">${esc(m.ar)}</span>`;
    },
    vStatus: (s) => ({ PENDING: '<span class="chip hold">بانتظار الاعتماد</span>', POSTED: '<span class="chip ok">معتمد ومرحّل</span>', REJECTED: '<span class="chip danger">مرفوض</span>', CANCELLED: '<span class="chip">ملغي بقيد عكسي</span>' }[s] || s),
    genderChip: (g) => (g === 'M' ? '<span class="chip male">♂ رجال</span>' : g === 'F' ? '<span class="chip female">♀ سيدات</span>' : g === 'P' ? '<span class="chip private">🔒 مغلقة</span>' : '<span class="chip">غير مفتوحة</span>'),
    paxGender: (g) => (g === 'M' ? '<span class="chip male">♂ ذكر</span>' : '<span class="chip female">♀ أنثى</span>'),
    countdown: (until) => `<span class="num" data-countdown="${until}">${fmtLeft(until - Date.now())}</span>`,
    progress(paid, net) {
      const pct = net ? Math.min(100, Math.round((paid / net) * 100)) : 0;
      return `<div class="progress ${pct >= 100 ? 'full' : ''}" title="${pct}%"><span style="width:${pct}%"></span></div><div class="small muted num">${pct}%</div>`;
    },
    channelLabel(b) {
      if (b.channel === 'DIRECT') { const u = App.S.users.find((x) => x.id === b.userId); return `مباشر – ${esc(u ? u.name : b.createdBy || '')}`; }
      const a = App.h.agent(b.agentId); return `${b.channel === 'B2B' ? 'وكيل' : 'وسيط'} – ${esc(a ? a.name : '')}`;
    },
    opt: (v, cur, label) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label ?? v)}</option>`,
    thumb(fileId, label) {
      if (!fileId) return `<span class="thumb empty" title="${esc(label)}">—</span>`;
      return `<a class="thumb" href="${App.fileUrl(fileId)}" target="_blank" rel="noopener" title="${esc(label)}"><img src="${App.fileUrl(fileId)}" alt="${esc(label)}" loading="lazy"></a>`;
    },
    fileLink: (id, name) => `<a href="${App.fileUrl(id)}" target="_blank" rel="noopener">📎 ${esc(name || 'مرفق')}</a>`,
    noTrip: () => `<div class="card empty-state"><h3>✈️ لا توجد رحلة مختارة</h3><p class="muted">أنشئ رحلة جديدة أو اختر رحلة من أعلى الشاشة.</p><button class="btn primary" data-act="go" data-page="trips">الذهاب للرحلات</button></div>`,
  };
  App.audit = (msg) => { App.S.audit.unshift({ at: Date.now(), by: App.actor().name, msg }); App.S.audit.length = Math.min(App.S.audit.length, 3000); };
  const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((x, k) => x[k], o); t[last] = v; };
  App.getPath = getPath; App.setPath = setPath;
  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number' || el.dataset.num !== undefined) { const n = parseFloat(el.value); return Number.isFinite(n) ? n : 0; }
    return el.value;
  }
  App.val = (id) => { const el = document.getElementById(id); return el ? readValue(el) : undefined; };

  // --------------------------------------------------------- roles
  const ROLE_MAP = { OWNER: 'OWNER', MANAGER: 'SALES', HEAD: 'HEAD', SALES: 'SALES', OPERATIONS: 'SALES', ACCOUNTANT: 'SALES', HR: 'SALES' };
  App.ROLE_LABEL = { OWNER: 'المالك', MANAGER: 'مدير التشغيل', ACCOUNTANT: 'محاسب', HR: 'موارد بشرية', HEAD: 'رئيس قسم مبيعات', SALES: 'موظف مبيعات', OPERATIONS: 'عمليات وتسكين', AGENT: 'مندوب/وكيل', SUPERVISOR: 'مشرف رحلة', HOUSING: 'مندوب تسكين' };
  App.role = () => (App.online ? App.me.role : { OWNER: 'OWNER', MANAGER: 'OWNER', HEAD: 'HEAD', SALES: 'SALES' }[App.h.user().role] || 'SALES');
  App.actor = () => ({ name: App.online ? App.me.display_name : App.h.user().name, role: App.role(), staffId: App.ui.actingUser, userId: App.me && App.me.id });
  App.can = (...roles) => roles.includes(App.role());
  App.isApprover = () => Acc.canApprove(App.role());
  function bindMe() {
    if (!App.online || !App.me || !App.S) return;
    const id = 'SU' + App.me.id, role = ROLE_MAP[App.me.role] || 'SALES';
    const u = App.S.users.find((x) => x.id === id);
    if (!u) App.S.users.push({ id, name: App.me.display_name, role });
    else if (u.name !== App.me.display_name || u.role !== role) { u.name = App.me.display_name; u.role = role; }
    App.ui.actingUser = id;
  }

  // --------------------------------------------------------- API
  App.api = async (method, url, body, raw) => {
    const headers = { 'X-Requested-With': 'umrah' };
    if (App.companyId) headers['X-Company'] = String(App.companyId);
    if (body !== undefined && !raw) headers['Content-Type'] = 'application/json';
    const r = await fetch(url, { method, headers: raw ? { ...headers, ...raw } : headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    const sd = Date.parse(r.headers.get('Date') || ''); if (sd) App.serverSkew = sd - Date.now(); // clock follows the server, not the device
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && App.me) { renderAuth(false); throw new Error('انتهت الجلسة — سجّل الدخول'); }
    if (!r.ok) { const e = new Error(d.error || 'تعذر تنفيذ الطلب'); e.status = r.status; e.data = d; throw e; }
    return d;
  };
  App.fileUrl = (id) => `api/files/${encodeURIComponent(id)}?c=${App.companyId || ''}`;
  /** Upload a File/Blob; images are resized to ≤1600px JPEG in the browser first. */
  App.upload = async (file) => {
    if (!App.online) throw new Error('رفع الملفات متاح في النسخة الأونلاين فقط');
    let blob = file, name = file.name || 'photo.jpg', type = file.type || 'application/octet-stream';
    if (/^image\/(jpeg|png|webp)$/.test(type) && file.size > 350000) {
      try {
        const img = await createImageBitmap(file);
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82)); type = 'image/jpeg'; name = name.replace(/\.\w+$/, '') + '.jpg';
      } catch (e) { /* keep original */ }
    }
    if (blob.size > 15 * 1024 * 1024) throw new Error('حجم الملف أكبر من 15MB');
    return App.api('POST', 'api/files', blob, { 'Content-Type': type, 'X-File-Name': encodeURIComponent(name) });
  };
  /** Pick file(s) through a hidden input. capture=true opens the camera on phones. */
  App.pickFiles = ({ accept = 'image/*,application/pdf', capture = false, multiple = false } = {}) => new Promise((resolve) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; if (capture) i.setAttribute('capture', 'environment'); i.multiple = multiple;
    i.onchange = () => resolve([...i.files]);
    i.click();
  });
  App.uploadPicked = async (opts) => {
    const files = await App.pickFiles(opts);
    const out = [];
    for (const f of files) { try { out.push(await App.upload(f)); } catch (e) { App.toast(e.message, 'err'); } }
    if (out.length) App.toast(`📎 تم رفع ${out.length} ملف`);
    return out;
  };

  // ------------------------------------------------------ persistence
  let saveTimer = null, inFlight = false, dirty = false, syncState = 'saved';
  App.save = () => {
    if (!App.online) { try { localStorage.setItem(LS_KEY, Model.serialize(App.S)); } catch (e) { /* private mode */ } return; }
    dirty = true; setSync('saving');
    clearTimeout(saveTimer); saveTimer = setTimeout(flush, 250);
  };
  async function flush() {
    if (inFlight || !dirty) return;
    inFlight = true; dirty = false;
    try {
      const d = await App.api('PUT', 'api/state', { baseVersion: App.version, state: JSON.parse(Model.serialize(App.S)) });
      App.version = d.version; setSync('saved');
    } catch (e) {
      if (e.status === 409 || e.status === 403) {
        App.toast(e.status === 409 ? '⚠️ مستخدم آخر عدّل البيانات في نفس اللحظة — تم تحميل آخر نسخة، أعد تنفيذ آخر عملية' : '⛔ ' + e.message, e.status === 409 ? 'warn' : 'err');
        await reloadState();
      } else if (e.status) { dirty = true; App.toast('تعذر الحفظ على السيرفر — سيعاد المحاولة', 'err'); }
      else { dirty = true; setSync('offline'); }
    }
    inFlight = false;
    if (dirty) saveTimer = setTimeout(flush, 2000);
  }
  function mountFromDoc(doc) {
    const pref = localStorage.getItem('umrah-trip-' + App.companyId);
    App.S = Model.load(doc);
    if (pref && App.S.trips.some((t) => t.id === pref)) Model.mountTrip(App.S, pref);
    bindMe();
    if (!App.ui.heatAllot && App.S.allotments[0]) App.ui.heatAllot = App.S.allotments[0].id;
  }
  async function reloadState() {
    const d = await App.api('GET', 'api/state');
    mountFromDoc(d.state); App.version = d.version; setSync('saved'); App.render();
  }
  App.reloadState = reloadState;
  function setSync(st) { syncState = st; const el = document.getElementById('sync'); if (el) el.outerHTML = syncChip(); }
  const syncChip = () => `<span id="sync" class="chip ${syncState === 'offline' ? 'danger' : syncState === 'saving' ? 'hold' : 'ok'}" title="حالة الحفظ">${syncState === 'offline' ? '⚠️ غير متصل' : syncState === 'saving' ? '⏳ حفظ' : '☁️ محفوظ'}</span>`;

  App.switchTrip = (id) => {
    Model.mountTrip(App.S, id);
    try { localStorage.setItem('umrah-trip-' + App.companyId, id); } catch (e) { /* ignore */ }
    App.ui.selPax = null; App.ui.pickedBed = null; App.ui.heatStart = App.ui.heatEnd = null;
    App.render();
  };

  // ------------------------------------------------------- feedback
  App.toast = (msg, kind = '') => {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast ' + kind; t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), kind === 'err' ? 7000 : 4000);
  };
  App.modal = (html, wide) => { document.getElementById('modal-root').innerHTML = `<div class="modal-bg" data-act="modalBg"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`; };
  App.closeModal = () => { document.getElementById('modal-root').innerHTML = ''; };
  App.actions.modalBg = (d, el, ev) => { if (ev.target === el) App.closeModal(); };
  App.actions.closeModal = () => App.closeModal();
  App.confirm = (msg) => window.confirm(msg);

  App.printDoc = (title, bodyHtml, landscape) => {
    const S = App.S, c = S.company;
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px';
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open();
    d.write(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>@page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:12mm}body{font-family:'IBM Plex Sans Arabic',Tahoma,sans-serif;color:#111;font-size:11px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #888;padding:4px 6px;text-align:start}th{background:#0d3b2c;color:#fff}
      h1,h2{color:#0d3b2c;margin:0 0 4px}.ltr{direction:ltr;text-align:left}.muted{color:#555}.box{border:1px solid #0d3b2c;border-radius:8px;padding:10px;margin:8px 0}
      .head{display:flex;justify-content:space-between;border-bottom:3px solid #b8912f;padding-bottom:8px;margin-bottom:10px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .co{font-size:10px;color:#444;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:8px}.sign{display:flex;justify-content:space-between;margin-top:30px}</style>
      </head><body><div class="co"><img src="${location.origin + location.pathname.replace(/[^/]*$/, '')}img/logo.svg" alt="" style="width:22px;height:22px;vertical-align:middle;margin-inline-end:6px"><b>${esc(c.name)}</b>${c.commercialNo ? ' · س.ت ' + esc(c.commercialNo) : ''}${c.taxNo ? ' · رقم ضريبي ' + esc(c.taxNo) : ''}${c.licenseNo ? ' · ترخيص ' + esc(c.licenseNo) : ''}${c.phone ? ' · ' + esc(c.phone) : ''}${c.address ? ' · ' + esc(c.address) : ''}</div>${bodyHtml}</body></html>`);
    d.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 1500); }, 250);
  };
  App.download = (filename, content, mime) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
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

  // ------------------------------------------------------- clock (server time, company timezone)
  App.serverSkew = 0;
  const TZ = { EG: 'Africa/Cairo', SA: 'Asia/Riyadh', AE: 'Asia/Dubai', KW: 'Asia/Kuwait', QA: 'Asia/Qatar', BH: 'Asia/Bahrain', OM: 'Asia/Muscat', JO: 'Asia/Amman', IQ: 'Asia/Baghdad', LB: 'Asia/Beirut',
    PS: 'Asia/Gaza', SD: 'Africa/Khartoum', LY: 'Africa/Tripoli', TN: 'Africa/Tunis', DZ: 'Africa/Algiers', MA: 'Africa/Casablanca', TR: 'Europe/Istanbul', PK: 'Asia/Karachi', ID: 'Asia/Jakarta', MY: 'Asia/Kuala_Lumpur' };
  App.clockHtml = () => {
    const now = new Date(Date.now() + (App.serverSkew || 0)), tz = TZ[(App.S && App.S.company.country) || 'EG'] || 'Africa/Cairo';
    const time = now.toLocaleTimeString('ar-EG', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    const day = now.toLocaleDateString('ar-EG', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
    return `<b>${time}</b><small>${day}</small>`;
  };
  setInterval(() => document.querySelectorAll('[data-clock]').forEach((el) => { el.innerHTML = App.clockHtml(); }), 15000);

  // ------------------------------------------------------- navigation
  const ALL = ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HEAD', 'SALES', 'OPERATIONS'];
  const FIN = ['OWNER', 'MANAGER', 'ACCOUNTANT'];
  const SAL = ['OWNER', 'MANAGER', 'ACCOUNTANT', 'HEAD', 'SALES'];
  const OPS = ['OWNER', 'MANAGER', 'HEAD', 'SALES', 'OPERATIONS'];
  const ADM = ['OWNER', 'MANAGER'];
  const HRV = ['OWNER', 'MANAGER', 'HR'];
  const EVERY = [...ALL, 'HR'];
  App.NAV = [
    ['home', '🏠', 'الرئيسية', [['home', 'لوحة التحكم والتنبيهات', EVERY], ['me', 'حسابي كموظف', EVERY]]],
    ['trips', '🕋', 'العمرة', [['booking', 'حجوزات العمرة', [...SAL, 'OPERATIONS']], ['trips', 'الرحلات', ALL], ['builder', 'التكلفة والتسعير', [...FIN, 'HEAD']], ['heatmap', 'رادار الإتاحات', ALL],
      ['rooms', 'التسكين المزدوج', OPS], ['bus', 'مقاعد الباص', OPS], ['ops', 'العمليات والكشوف', OPS], ['tripfiles', 'ملفات الرحلة', ALL]]],
    ['hajj', '⛰️', 'الحج', [['hajjDash', 'لوحة الموسم', ALL], ['hajjApplicants', 'التسجيل المبدئي والتنفيذي', [...SAL, 'OPERATIONS']], ['hajjLottery', 'القرعة', [...SAL, 'OPERATIONS']], ['hajjPilgrims', 'الحجاج', [...SAL, 'OPERATIONS']], ['hajjPackages', 'البرامج وكشف التكلفة', [...FIN, 'HEAD']],
      ['hajjOps', 'التفويج والتسكين والخيام', OPS], ['hajjSeason', 'إعدادات الموسم والحصة', ADM], ['hajjPnl', 'ربحية الموسم', FIN]]],
    ['dom', '🏖️', 'السياحة الداخلية', [['domBooking', 'حجوزات السياحة الداخلية', [...SAL, 'OPERATIONS']], ['domPrograms', 'البرامج والرحلات', ALL], ['domOps', 'التشغيل والكشوف', OPS],
      ['domHotels', 'الفنادق وأسعار التعاقد', [...FIN, 'OPERATIONS', 'HEAD']], ['domPnl', 'ربحية البرامج', FIN]]],
    ['sales', '🧾', 'العملاء والمناديب', [['approvals', 'طلبات بانتظار الموافقة', ADM], ['customers', 'العملاء', SAL], ['agents', 'الوكلاء والمناديب', SAL], ['scores', 'تقييم المناديب والمبيعات', ['OWNER', 'MANAGER', 'HEAD', 'ACCOUNTANT']]]],
    ['purch', '🏨', 'الموردون والفنادق', [['suppliers', 'الموردون', [...FIN, 'OPERATIONS']], ['hotels', 'الفنادق والمخصصات', [...FIN, 'OPERATIONS', 'HEAD']]]],
    ['fin', '💰', 'المالية والحسابات', [['treasury', 'الخزائن والبنوك', FIN], ['vouchers', 'السندات والاعتمادات', ALL], ['expenses', 'المصروفات', FIN],
      ['employees', 'الموظفون', FIN], ['fx', 'أسعار الصرف', EVERY], ['coa', 'شجرة الحسابات', FIN], ['journal', 'القيود اليومية', FIN], ['reports', 'التقارير المالية', FIN], ['pnl', 'أرباح الرحلة', FIN]]],
    ['hr', '👥', 'الموارد البشرية', [['hrDash', 'لوحة الأداء والمراقبة', HRV], ['hrEmployees', 'ملفات الموظفين', HRV], ['hrAttendance', 'الحضور والانصراف', HRV], ['hrLeaves', 'الإجازات', HRV],
      ['hrTasks', 'المهام والتكليفات', HRV], ['hrReviews', 'الأهداف والتقييم', HRV], ['hrAdjust', 'المكافآت والجزاءات', HRV], ['hrPayroll', 'مسير الرواتب', [...HRV, 'ACCOUNTANT']],
      ['hrMonitor', 'سجل النشاط والمراقبة', HRV], ['hrSettings', 'إعدادات الدوام والتقييم', HRV]]],
    ['comm', '💬', 'التواصل', [['chat', 'الشات الداخلي', EVERY], ['waCenter', 'رسائل واتساب الجماعية', [...SAL, 'OPERATIONS']]]],
    ['admin', '⚙️', 'الإدارة', [['companies', 'الشركات وأنشطتها', ['OWNER']], ['settings', 'الشركة والفروع والضرائب', ADM], ['users', 'المستخدمون والصلاحيات', ADM], ['userView', 'ملف المستخدم', ADM, true], ['backup', 'النسخ الاحتياطي والإصدارات', ADM]]],
  ];
  const TRIP_PAGES = ['builder', 'heatmap', 'rooms', 'bus', 'ops', 'pnl', 'tripfiles'];
  /** Sidebar groups that belong to one line of business — hidden when the company (or the user's branch) doesn't work in it. */
  App.GROUP_DOMAIN = { trips: 'UMRAH', dom: 'DOMESTIC', hajj: 'HAJJ' };
  App.myBranch = () => (App.online && App.me && App.me.role !== 'OWNER' ? App.me.branch_id || null : null);
  /** Lines of business available to this user (company ∩ branch) and the one currently shown. */
  App.domains = () => (App.S ? Object.keys(Model.DOMAINS).filter((d) => Model.hasDomain(App.S, d, App.myBranch())) : ['UMRAH']);
  App.domain = () => { const ds = App.domains(); return ds.includes(App.ui.domain) ? App.ui.domain : ds[0]; };
  const groupOn = (gid) => !App.GROUP_DOMAIN[gid] || !App.S || App.GROUP_DOMAIN[gid] === App.domain();
  App.ITEM_DOMAIN = { hotels: 'UMRAH', pnl: 'UMRAH' }; // Makkah/Madinah allotments & Umrah trip P&L live in shared groups
  const itemOn = (k) => !App.ITEM_DOMAIN[k] || !App.S || App.ITEM_DOMAIN[k] === App.domain();
  App.actions.setDomain = (d) => {
    App.ui.domain = d.d; try { localStorage.setItem('afwaj-domain', d.d); } catch (e) { /* ignore */ }
    if (!pageAllowed(App.ui.page)) App.ui.page = 'home';
    App.render();
  };
  try { App.ui.domain = localStorage.getItem('afwaj-domain') || null; } catch (e) { /* ignore */ }
  const pageAllowed = (p) => { for (const g of App.NAV) for (const [k, , roles] of g[3]) if (k === p) return roles.includes(App.role()) && groupOn(g[0]) && itemOn(k); return true; };
  const pageTitle = (p) => { for (const g of App.NAV) for (const [k, l] of g[3]) if (k === p) return l; return { bookingView: 'تفاصيل الحجز', customerView: 'حساب العميل', partyView: 'كشف حساب', hrEmployee: 'ملف الموظف', domBookingView: 'حجز سياحة داخلية', hajjPilgrim: 'ملف الحاج' }[p] || ''; };

  function renderShell() {
    const S = App.S, role = App.role();
    const alerts = Model.alerts(S, role);
    document.getElementById('brandCompany').textContent = S.company.name;
    const ds = App.domains(), sw = ds.length > 1 ? `<div class="domain-switch" role="tablist">${ds.map((d) => `<button role="tab" class="${App.domain() === d ? 'on' : ''}" data-act="setDomain" data-d="${d}">${Model.DOMAINS[d].icon} <span>${Model.DOMAINS[d].ar}</span></button>`).join('')}</div>` : '';
    const ctx = document.getElementById('sideCtx');
    if (ctx) ctx.innerHTML = `<span class="clock-chip" data-clock>${App.clockHtml()}</span>
      ${App.online && App.companies.length > 1 ? `<label>الشركة</label><select class="input" data-act-change="switchCompany">${App.companies.map((c) => App.h.opt(c.id, App.companyId, `${(c.domains || []).map((d) => Model.DOMAINS[d] ? Model.DOMAINS[d].icon : '').join('')} ${c.name}`)).join('')}</select>` : ''}
      ${sw ? `<label>النشاط</label>${sw}` : `<span class="domain-one">${Model.DOMAINS[App.domain()].icon} ${Model.DOMAINS[App.domain()].ar}</span>`}
      ${App.online && App.role() === 'OWNER' ? '<button class="btn sm" data-act="go" data-page="companies">🏢 الشركات وأنشطتها</button>' : ''}`;
    document.getElementById('nav').innerHTML = App.NAV.map(([gid, ico, label, items]) => {
      const vis = groupOn(gid) ? items.filter(([k, , roles, hidden]) => !hidden && roles.includes(role) && itemOn(k)) : [];
      if (!vis.length) return '';
      if (gid === 'home') return vis.map((it, i) => navItem(it, i ? '🪪' : ico)).join('');
      const open = App.ui.navOpen[gid] ?? vis.some(([k]) => k === App.ui.page);
      return `<details class="nav-group" data-gid="${gid}" ${open ? 'open' : ''}><summary><span class="nav-icon">${ico}</span>${label}<span class="nav-caret">▾</span></summary>${vis.map((it) => navItem(it)).join('')}</details>`;
    }).join('');
    const t = S.trip;
    const unread = App.notifications.unread + alerts.filter((a) => a.level !== 'info').length;
    document.getElementById('top').innerHTML = `
      <button class="menu-toggle" data-act="toggleMenu" aria-label="القائمة">☰</button>
      <div class="topbar-title">${esc(pageTitle(App.ui.page))}</div>
      ${App.domains().length > 1 ? `<div class="domain-switch" role="tablist">${App.domains().map((d) => `<button role="tab" class="${App.domain() === d ? 'on' : ''}" data-act="setDomain" data-d="${d}">${Model.DOMAINS[d].icon} <span>${Model.DOMAINS[d].ar}</span></button>`).join('')}</div>` : `<span class="domain-one hide-sm">${Model.DOMAINS[App.domain()].icon} ${Model.DOMAINS[App.domain()].ar}</span>`}
      <div class="context-switcher">
        ${App.online && App.companies.length > 1 ? `<select data-act-change="switchCompany" title="الشركة">${App.companies.map((c) => App.h.opt(c.id, App.companyId, `${(c.domains || []).map((d) => Model.DOMAINS[d] ? Model.DOMAINS[d].icon : '').join('')} ${c.name}`)).join('')}</select>` : ''}
        ${S.trips.length && App.domain() === 'UMRAH' ? `<select data-act-change="switchTrip" title="الرحلة">${S.trips.map((d) => App.h.opt(d.id, S.activeTripId, `${d.trip.code} · ${d.trip.name}`)).join('')}</select>` : ''}
      </div>
      <div class="top-spacer"></div>
      <span class="clock-chip" data-clock title="الوقت بتوقيت السيرفر">${App.clockHtml()}</span>
      ${(() => { const fx = Model.fxInfo(S); return `<button class="fx-pill hide-sm ${fx.alert ? 'alert' : ''}" data-act="go" data-page="fx" title="سعر الريال: التنفيذي مقابل العالمي">
        <span>💱 تنفيذي <b class="num">${fx.exec}</b></span><span class="sep"></span><span>عالمي <b class="num">${fx.global ?? '—'}</b></span>${fx.spreadPct != null ? `<span class="spread num">${fx.spreadPct > 0 ? '+' : ''}${fx.spreadPct}%</span>` : ''}</button>`; })()}
      <button class="icon-btn" data-act="go" data-page="home" title="التنبيهات">🔔${unread ? `<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}</button>
      ${App.online && ['OWNER', 'MANAGER'].includes(App.me.role) && App.pendingCount && (App.pendingCount() + App.heldCount()) ? `<button class="icon-btn" data-act="go" data-page="approvals" title="طلبات بانتظار موافقتك">📥<span class="badge">${App.pendingCount() + App.heldCount()}</span></button>` : ''}
      ${App.online ? `<button class="icon-btn" data-act="go" data-page="chat" title="الشات">💬${App.chatUnread ? `<span class="badge">${App.chatUnread}</span>` : ''}</button>${syncChip()}` : ''}
      ${App.online ? `<span class="topbar-user hide-sm">👤 ${esc(App.me.display_name)} · ${esc(App.ROLE_LABEL[App.me.role])}</span><button class="btn sm ghost" data-act="logout">خروج</button>`
        : `<select class="hide-sm" data-ui="actingUser" title="المستخدم (نسخة العرض)">${S.users.map((u) => App.h.opt(u.id, App.ui.actingUser, `${u.name} · خصم ≤ ${E.ROLES[u.role].maxDiscount}%`)).join('')}</select>`}`;
  }
  const navItem = ([k, label], ico) => `<a class="nav-item ${App.ui.page === k ? 'active' : ''}" data-act="go" data-page="${k}">${ico ? `<span class="nav-icon">${ico}</span>` : ''}${label}</a>`;

  let focusKey = null;
  App.render = () => {
    if (!App.S) return;
    if (!pageAllowed(App.ui.page)) App.ui.page = 'home';
    renderShell();
    const page = App.pages[App.ui.page] || App.pages.home;
    let html;
    try { html = TRIP_PAGES.includes(App.ui.page) && !App.S.trip ? App.h.noTrip() : page(); }
    catch (e) { console.error(e); html = `<div class="card"><h3>حدث خطأ في عرض الصفحة</h3><p class="muted">${esc(e.message)}</p></div>`; }
    document.getElementById('content').innerHTML = html;
    if (focusKey) {
      const el = document.querySelector(focusKey);
      if (el) { el.focus(); if (el.setSelectionRange && el.type === 'text') { const l = el.value.length; el.setSelectionRange(l, l); } }
      focusKey = null;
    }
    if (App.after) { const f = App.after; App.after = null; f(); }
  };
  App.refreshPartials = () => document.querySelectorAll('[data-partial]').forEach((el) => { const fn = App.partials[el.dataset.partial]; if (fn) el.innerHTML = fn(); });
  function keyOf(el) {
    for (const a of ['data-bind', 'data-ui', 'data-live']) if (el && el.hasAttribute && el.hasAttribute(a)) return `[${a}="${el.getAttribute(a)}"]`;
    return el && el.id ? '#' + el.id : null;
  }
  const deferRender = () => setTimeout(() => { focusKey = keyOf(document.activeElement); App.render(); }, 0);

  // ------------------------------------------------- event delegation
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.tagName === 'SELECT') return;
    const fn = App.actions[el.dataset.act];
    if (fn) { if (el.tagName === 'A' && !el.getAttribute('target')) ev.preventDefault(); fn(el.dataset, el, ev); }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.actChange && App.actions[el.dataset.actChange]) return App.actions[el.dataset.actChange]({ ...el.dataset, value: el.value }, el, ev);
    if (el.hasAttribute('data-bind')) { setPath(App.S, el.dataset.bind, readValue(el)); if (el.dataset.after && App.actions[el.dataset.after]) App.actions[el.dataset.after](el.dataset, el); App.save(); deferRender(); }
    else if (el.hasAttribute('data-ui')) { setPath(App.ui, el.dataset.ui, readValue(el)); deferRender(); }
  });
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.hasAttribute('data-live')) { setPath(App.ui, el.dataset.live, readValue(el)); App.refreshPartials(); }
  });
  // Remember which sidebar groups the user opened/closed (only on real clicks, not on re-render).
  document.addEventListener('click', (ev) => { const sm = ev.target.closest && ev.target.closest('.nav-group > summary'); if (sm) { const d = sm.parentElement; App.ui.navOpen[d.dataset.gid] = !d.open; } }, true);
  document.addEventListener('dragstart', (ev) => { const el = ev.target.closest && ev.target.closest('[data-drag-pax]'); if (el) ev.dataTransfer.setData('text/plain', el.dataset.dragPax); });
  document.addEventListener('dragover', (ev) => { const el = ev.target.closest && ev.target.closest('[data-drop-seat]'); if (el) { ev.preventDefault(); el.classList.add('drop'); } });
  document.addEventListener('dragleave', (ev) => { const el = ev.target.closest && ev.target.closest('[data-drop-seat]'); if (el) el.classList.remove('drop'); });
  document.addEventListener('drop', (ev) => {
    const el = ev.target.closest && ev.target.closest('[data-drop-seat]');
    if (!el) return;
    ev.preventDefault();
    const paxId = ev.dataTransfer.getData('text/plain');
    if (paxId && App.actions.busDrop) App.actions.busDrop({ seat: el.dataset.dropSeat, pax: paxId });
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && /^au-/.test(ev.target.id || '')) App.actions[document.querySelector('[data-act="doSetup"]') ? 'doSetup' : 'doLogin']();
    if (ev.key === 'Escape') { App.closeModal(); document.body.classList.remove('menu-open'); }
  });

  App.actions.go = (d) => {
    App.ui.page = d.page; App.ui.pickedBed = null; App.ui.pickedSeat = null;
    if (d.trip && d.trip !== App.S.activeTripId) Model.mountTrip(App.S, d.trip);
    if (d.id) App.ui.viewId = d.id;
    if (d.ptype) App.ui.viewParty = { type: d.ptype, id: d.id };
    document.body.classList.remove('menu-open');
    App.closeModal();
    App.render(); window.scrollTo(0, 0);
  };
  App.actions.toggleMenu = () => document.body.classList.toggle('menu-open');
  App.actions.closeMenu = () => document.body.classList.remove('menu-open');
  App.actions.switchTrip = (d) => App.switchTrip(d.value);
  App.actions.switchCompany = async (d) => {
    App.companyId = Number(d.value);
    try { localStorage.setItem('umrah-company', String(App.companyId)); } catch (e) { /* ignore */ }
    App.ui.page = 'home'; App.ui.heatAllot = null;
    App.loader(true, 'جارِ فتح الشركة…');
    try { await reloadState(); } finally { App.loader(false); }
    pollBadges();
  };

  // ------------------------------------------------------------ auth
  function renderAuth(needsSetup) {
    App.me = null; App.S = null;
    document.getElementById('app').style.display = 'none';
    const box = document.getElementById('authScreen');
    box.style.display = 'grid';
    box.innerHTML = `
      <div class="card auth-card">
        <div class="auth-brand"><img src="img/logo.svg" alt="" width="84" height="84"><div><b>أفواج</b><span>منظومة شركات العمرة والسياحة</span></div></div>
        <h3>${needsSetup ? '🔐 إعداد حساب المالك لأول مرة' : '🔐 تسجيل الدخول'}</h3>
        ${needsSetup ? '<p class="muted small">أول حساب هو المالك بكل الصلاحيات، وبعدها يضيف حسابات الفريق والمناديب من "المستخدمون والصلاحيات".</p>' : ''}
        <div class="field"><label>اسم المستخدم</label><input class="input" id="au-user" autocomplete="username" autocapitalize="none" style="direction:ltr"></div>
        ${needsSetup ? '<div class="field"><label>الاسم الظاهر</label><input class="input" id="au-name" placeholder="مثال: أ. يسري"></div>' : ''}
        <div class="field"><label>كلمة السر ${needsSetup ? '(8+ حروف وأرقام)' : ''}</label><input class="input" id="au-pass" type="password" autocomplete="${needsSetup ? 'new-password' : 'current-password'}" style="direction:ltr"></div>
        <button class="btn primary block" data-act="${needsSetup ? 'doSetup' : 'doLogin'}">${needsSetup ? 'إنشاء الحساب والدخول' : 'دخول'}</button>
      </div>`;
    const u = document.getElementById('au-user'); if (u) u.focus();
  }
  App.renderAuth = renderAuth;
  async function authCall(url, body) {
    try { const d = await App.api('POST', url, body); App.loader(true, 'أهلاً ' + (d.user.display_name || '') + ' — جارِ تجهيز بياناتك…'); await startSession(d.user); }
    catch (e) { App.toast(e.message, 'err'); }
    finally { App.loader(false); }
  }
  App.actions.doLogin = () => authCall('api/auth/login', { username: App.val('au-user'), password: App.val('au-pass') });
  App.actions.doSetup = () => authCall('api/auth/setup', { username: App.val('au-user'), display_name: App.val('au-name'), password: App.val('au-pass') });
  App.actions.logout = async () => { try { await App.api('POST', 'api/auth/logout', {}); } catch (e) { /* ignore */ } location.reload(); };

  async function startSession(user) {
    App.me = user;
    document.getElementById('authScreen').style.display = 'none';
    if (['AGENT', 'SUPERVISOR', 'HOUSING'].includes(user.role)) { App.companyId = user.company_id; return window.Portal.start(); }
    App.companies = await App.api('GET', 'api/companies');
    const saved = Number(localStorage.getItem('umrah-company'));
    App.companyId = user.role === 'OWNER' ? (App.companies.find((c) => c.id === saved) || App.companies[0]).id : user.company_id;
    document.getElementById('app').style.display = '';
    App.ui.page = 'home';
    await reloadState();
    pollBadges(); refreshFx(); if (App.loadWa) App.loadWa();
  }
  const portalOn = () => window.Portal && window.Portal.active;
  async function pollBadges() {
    if (!App.online || !App.me || !App.S || portalOn()) return;
    try {
      App.notifications = await App.api('GET', 'api/notifications');
      const u = await App.api('GET', 'api/chat/unread');
      App.chatUnread = u.reduce((s, x) => s + x.c, 0); App.chatUnreadBy = Object.fromEntries(u.map((x) => [x.channel, x.c]));
      const top = document.getElementById('top'); if (top && !document.querySelector('.modal-bg')) renderShell();
    } catch (e) { /* ignore */ }
  }
  async function refreshFx(force) {
    if (!App.online) return;
    try { App.fxGlobal = await App.api('GET', 'api/fx' + (force ? '?refresh=1' : '')); } catch (e) { /* ignore */ }
    // keep the latest global benchmark inside the company document (feeds the spread alert for everyone)
    const g = App.fxGlobal;
    if (g && g.rate && App.S && (!App.S.fx.global || App.S.fx.global.rate !== g.rate || App.S.fx.global.at !== g.at)) {
      App.S.fx.global = { rate: g.rate, at: g.at, source: g.source, usd: g.usd || null }; App.save(); App.render();
    }
    return App.fxGlobal;
  }
  App.refreshFx = refreshFx;

  // Pull other users' changes (skipped while typing / dialog open / unsaved local changes).
  setInterval(async () => {
    if (!App.online || !App.me || !App.S || inFlight || dirty || portalOn()) return;
    const a = document.activeElement;
    if (document.querySelector('.modal-bg') || (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) return;
    try {
      const d = await App.api('GET', 'api/state?since=' + App.version);
      if (d.changed && !dirty && !inFlight) { mountFromDoc(d.state); App.version = d.version; App.render(); }
      if (syncState === 'offline') setSync('saved');
    } catch (e) { if (!e.status) setSync('offline'); }
  }, 5000);
  setInterval(pollBadges, 12000);
  setInterval(() => refreshFx(), 30 * 60000);

  // ------------------------------------------------ TTL ticker
  setInterval(() => {
    if (!App.S || !App.S.trip) return;
    const now = Date.now();
    document.querySelectorAll('[data-countdown]').forEach((el) => { el.textContent = fmtLeft(Number(el.dataset.countdown) - now); });
    const released = E.releaseExpiredHolds(App.S, now);
    if (released.length) {
      released.forEach((c) => App.audit(`تحرير آلي للحجز ${c} لانتهاء مهلة التعليق`));
      for (const b of App.S.bookings.filter((x) => released.includes(x.code))) Acc.syncBooking(App.S, App.S.trip, b, 'النظام');
      App.save();
      App.toast(`⏱️ انتهت مهلة التعليق وتحرر المخزون تلقائياً: ${released.join('، ')}`, 'warn');
      App.render();
    }
  }, 1000);

  // --------------------------------------------- deploy / version check
  const BUILD = (document.querySelector('meta[name="app-build"]') || {}).content || 'local';
  let updateShown = false;
  async function checkVersion() {
    if (!App.online || updateShown) return;
    try {
      const r = await fetch('api/version', { cache: 'no-store' }); const d = await r.json();
      if (d.build && d.build !== BUILD) {
        updateShown = true;
        const t = document.createElement('div'); t.className = 'toast warn'; t.style.cursor = 'pointer';
        t.textContent = '🔄 تم نشر تحديث جديد للبرنامج — اضغط هنا لإعادة التحميل'; t.onclick = () => location.reload();
        document.getElementById('toasts').appendChild(t);
      }
    } catch (e) { /* offline */ }
  }
  setInterval(checkVersion, 60000);

  // ------------------------------------------------------------ loader (figures running after each other)
  App.loader = (on, msg) => {
    const el = document.getElementById('afwajLoader'); if (!el) return;
    if (msg) document.getElementById('afwajLoaderMsg').textContent = msg;
    el.classList.toggle('hide', !on);
  };
  // ------------------------------------------------------------ boot
  window.addEventListener('DOMContentLoaded', async () => {
    setTimeout(() => App.loader(false), 15000); // never trap the user behind the loader
    const tag = document.getElementById('buildTag'); if (tag) tag.textContent = 'v ' + BUILD;
    App.ui.draft = App.newDraft ? App.newDraft() : null;
    let st = null;
    if (location.protocol !== 'file:') {
      try { const r = await fetch('api/auth/status'); if (r.ok && (r.headers.get('content-type') || '').includes('json')) st = await r.json(); } catch (e) { /* no API */ }
    }
    if (!st) { // offline single-user demo
      let doc = null;
      try { doc = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { doc = null; }
      App.S = Model.load(doc || window.MockData.buildSeed());
      if (App.S.allotments[0]) App.ui.heatAllot = App.S.allotments[0].id;
      document.getElementById('app').style.display = '';
      App.render(); App.loader(false); return;
    }
    App.online = true;
    if (!st.user) { App.loader(false); return renderAuth(st.needsSetup); }
    try { await startSession(st.user); } finally { App.loader(false); }
  });
})();
