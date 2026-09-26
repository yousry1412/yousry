/* =====================================================================
 * Umrah ERP — Portal for external / field accounts (server-filtered data)
 *  AGENT      : my account & statement · my bookings (+ passenger photos &
 *               passport scans) · new booking · upload a payment receipt
 *  SUPERVISOR : supervisor sheet for assigned trips (print)
 *  HOUSING    : housing-rep rooming sheet for assigned trips (print)
 *  All: internal chat. These accounts never receive the company document.
 * ===================================================================== */
(function () {
  'use strict';
  const App = window.App, E = App.E, h = App.h, esc = h.esc, opt = h.opt;
  const P = (window.Portal = { active: false, data: null, page: null, draft: null, pay: null });
  const TYPES = Object.keys(E.ROOM_TYPES);

  P.start = async () => {
    P.active = true;
    document.getElementById('app').style.display = '';
    await P.load();
    P.page = P.data.role === 'AGENT' ? 'account' : 'sheets';
    P.render();
  };
  P.load = async () => {
    P.data = await App.api('GET', 'api/portal');
    App.S = { company: P.data.company, trips: [] };
    if (P.data.role === 'AGENT' && !P.draft) newDraft();
  };
  function newDraft() {
    const t = (P.data.trips || [])[0];
    P.draft = { tripId: t ? t.id : '', mode: 'FULL_PACKAGE', roomType: 'QUAD', notes: '', pax: [blank()] };
  }
  const blank = () => ({ nameAr: '', nameEn: '', gender: 'M', type: 'ADULT', dob: '', passport: '', passportExp: '', nid: '', phone: '', photoFileId: null, passportFileId: null });

  const NAV = {
    AGENT: [['account', '💼', 'حسابي'], ['bookings', '🧾', 'حجوزاتي'], ['newBooking', '➕', 'حجز جديد'], ['payment', '💰', 'رفع دفعة'], ['chat', '💬', 'الشات']],
    SUPERVISOR: [['sheets', '🧑‍✈️', 'كشف المشرف'], ['me', '🪪', 'حسابي كموظف'], ['chat', '💬', 'الشات']],
    HOUSING: [['sheets', '🛏️', 'كشف التسكين'], ['me', '🪪', 'حسابي كموظف'], ['chat', '💬', 'الشات']],
  };
  P.render = () => {
    const d = P.data;
    document.getElementById('brandCompany').textContent = d.company.name;
    document.getElementById('nav').innerHTML = NAV[d.role].map(([k, ico, l]) => `<a class="nav-item ${P.page === k ? 'active' : ''}" data-act="pGo" data-p="${k}"><span class="nav-icon">${ico}</span>${l}</a>`).join('');
    document.getElementById('top').innerHTML = `<button class="menu-toggle" data-act="toggleMenu">☰</button><div class="topbar-title">${esc((NAV[d.role].find((x) => x[0] === P.page) || [, , ''])[2])}</div><div class="top-spacer"></div>
      <span class="topbar-user">👤 ${esc(d.user.name)} · ${esc(App.ROLE_LABEL[d.role])}</span><button class="btn sm ghost" data-act="pRefresh">↻</button><button class="btn sm ghost" data-act="logout">خروج</button>`;
    let html;
    try { html = d.error ? `<div class="card alert err">${esc(d.error)}</div>` : PAGES[P.page](); } catch (e) { console.error(e); html = `<div class="card">${esc(e.message)}</div>`; }
    document.getElementById('content').innerHTML = html;
  };
  App.actions.pGo = (d) => { P.page = d.p; document.body.classList.remove('menu-open'); P.render(); window.scrollTo(0, 0); };
  App.actions.pRefresh = async () => { await P.load(); P.render(); };

  const PAGES = {};
  // ------------------------------------------------------------- agent
  PAGES.account = () => {
    const d = P.data, a = d.agent, st = d.statement;
    return `<div class="page-head"><div><h2>💼 ${esc(a.name)} <span class="chip gold">${esc(a.code)}</span></h2><p>${a.tier === 'B2B' ? `وكيل معتمد — خصم جملة ${a.netDiscountPct}%` : `وسيط/مندوب — ${a.commission.type === 'PCT' ? `عمولة ${a.commission.pct}%` : `عمولة ثابتة`}${a.commission.min ? ` · حد أدنى ${h.n0(a.commission.min)} لكل ${a.commission.basis === 'BOOKING' ? 'حجز' : 'فرد'}` : ''}`}</p></div>
      <div class="row"><button class="btn primary" data-act="pGo" data-p="newBooking">➕ حجز جديد</button><button class="btn" data-act="pGo" data-p="payment">💰 رفع دفعة</button></div></div>
      ${a.blocked || a.overdueDays > 0 ? '<div class="alert err" style="margin-bottom:12px">🔒 الحجز الذاتي موقوف (تجاوز السقف أو تأخر سداد) — تواصل مع الإدارة.</div>' : ''}
      <div class="grid g3"><div class="card kpi"><div class="lbl">رصيد المحفظة</div><div class="val ${a.balance < 0 ? 'danger' : 'ok'}">${h.cur(a.balance, a.currency)}</div></div>
        <div class="card kpi"><div class="lbl">السقف الائتماني</div><div class="val">${h.cur(a.creditLimit, a.currency)}</div></div>
        <div class="card kpi"><div class="lbl">الرصيد المحاسبي</div><div class="val ${st.balance > 0 ? 'danger' : 'ok'}">${h.egp(Math.abs(st.balance))} ${st.balance > 0 ? 'عليك' : st.balance < 0 ? 'لك' : ''}</div></div></div>
      ${d.score ? `<div class="card" style="margin-top:14px"><h3>⭐ تقييم أدائك هذا العام ${d.score.total != null ? `<span class="chip ${d.score.total >= 70 ? 'ok' : d.score.total >= 55 ? 'hold' : 'danger'}">${Math.round(d.score.total)}/100 · ${esc(d.score.rating.ar)}</span>` : '<span class="chip">لا نشاط بعد</span>'}</h3>
        <div class="grid g4"><div><div class="small muted">الحجوزات / المعتمرين</div><b class="num">${d.score.k.bookings} / ${d.score.k.pax}</b></div><div><div class="small muted">نسبة التحصيل</div><b class="num">${d.score.k.collectionPct == null ? '—' : Math.round(d.score.k.collectionPct) + '%'}</b></div>
          <div><div class="small muted">اكتمال المستندات</div><b class="num">${d.score.k.docsPct == null ? '—' : Math.round(d.score.k.docsPct) + '%'}</b></div><div><div class="small muted">عمولاتك</div><b>${h.egp(d.score.k.commission)}</b></div></div>
        <div class="small muted" style="margin-top:6px">ارفع مستندات المسافرين كاملة وسدد في المواعيد لرفع تقييمك.</div></div>` : ''}
      <div class="card" style="margin-top:14px"><div class="row"><h3 style="margin:0">📄 كشف الحساب</h3><span class="spacer"></span><button class="btn sm gold" data-act="pPrintStmt">🖨️ طباعة</button></div>
        <div class="tbl-wrap" style="margin-top:8px" id="pStmt"><table class="t"><thead><tr><th>التاريخ</th><th>القيد</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>
        ${st.rows.map((r) => `<tr><td class="num">${r.date}</td><td class="num">${r.no}</td><td class="small">${esc(r.memo)}</td><td>${r.dr ? h.money(r.dr) : ''}</td><td>${r.cr ? h.money(r.cr) : ''}</td><td><b>${h.money(r.bal)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا حركات.</td></tr>'}</tbody></table></div></div>
      <div class="card" style="margin-top:14px"><h3>💰 دفعاتي</h3><table class="t"><thead><tr><th>السند</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>
        ${d.vouchers.slice().reverse().map((v) => `<tr><td class="num">${v.no}</td><td class="num">${v.date}</td><td>${h.cur(v.amount, v.currency)}</td><td>${h.vStatus(v.status)}${v.rejectReason ? `<div class="small danger">${esc(v.rejectReason)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">لا دفعات.</td></tr>'}</tbody></table></div>`;
  };
  App.actions.pPrintStmt = () => App.printDoc('كشف حساب', `<h2>كشف حساب ${esc(P.data.agent.name)} (${esc(P.data.agent.code)})</h2>${document.getElementById('pStmt').innerHTML}`);

  PAGES.bookings = () => {
    const d = P.data;
    return `<div class="page-head"><div><h2>🧾 حجوزاتي (${d.bookings.length})</h2><p>ارفع الصورة الشخصية وصورة الجواز لكل مسافر — الحجز الناقص يظهر عليه تحذير</p></div></div>
      <div class="stack">${d.bookings.map((b) => { const missing = b.pax.filter((p) => !p.photoFileId || !p.passportFileId).length; return `<div class="card">
        <div class="row"><b class="num">${b.code}</b><span class="chip">${esc(b.trip)}</span>${h.statusChip(b.status)}${missing ? `<span class="chip danger">⚠️ ${missing} مسافر بدون مستندات</span>` : '<span class="chip ok">المستندات مكتملة</span>'}
          ${b.agentCommission ? `<span class="chip gold">🏷️ عمولتك ${h.egp(b.agentCommission)}${b.commissionAdj ? ` (${b.commissionAdj > 0 ? '+' : ''}${h.n0(b.commissionAdj)})` : ''}</span>` : ''}
          <span class="spacer"></span><span>${h.egp(b.net)} · مسدد ${h.egp(b.paid)}</span>${b.net && b.paid < b.net ? `<button class="btn sm primary" data-act="pPayFor" data-id="${b.id}">💰 دفعة</button>` : ''}</div>
        ${E.HOLD_STATES.includes(b.status) && b.holdUntil ? `<div class="small hold">⏱️ ينتهي التعليق: ${h.countdown(b.holdUntil)}</div>` : ''}
        <div class="stack" style="margin-top:8px">${b.pax.map((p) => { const tr = d.trips.find((t) => t.id === b.tripId); const c = tr && p.passportExp ? E.passportCheck(p.passportExp, tr.returnDate) : null; return `<div class="pax-card">
          <div class="row" style="gap:6px">${h.thumb(p.photoFileId, 'صورة')}${h.thumb(p.passportFileId, 'جواز')}</div>
          <div><b>${esc(p.nameAr)}</b> ${h.paxGender(p.gender)} <span class="chip">${E.PAX_TYPES[p.type].ar}</span><div class="small muted num">${esc(p.nameEn)} · ${esc(p.passport)} · ${esc(p.passportExp)}</div>${c && !c.ok ? `<span class="chip danger">${esc(c.message)}</span>` : ''}</div>
          <div class="stack"><button class="btn sm" data-act="pPaxDoc" data-b="${b.id}" data-p="${p.id}" data-k="photoFileId">📷 صورة</button><button class="btn sm" data-act="pPaxDoc" data-b="${b.id}" data-p="${p.id}" data-k="passportFileId">🛂 جواز</button></div></div>`; }).join('')}</div></div>`; }).join('') || '<div class="card muted">لا حجوزات بعد.</div>'}</div>`;
  };
  App.actions.pPaxDoc = async (d) => {
    const [f] = await App.uploadPicked({ accept: 'image/*,application/pdf' });
    if (!f) return;
    try { await App.api('POST', 'api/portal/pax-docs', { bookingId: d.b, paxId: d.p, [d.k]: f.id }); await P.load(); P.render(); App.toast('✅ تم الرفع'); }
    catch (e) { App.toast(e.message, 'err'); }
  };

  PAGES.newBooking = () => {
    const d = P.data, dr = P.draft, trip = d.trips.find((t) => t.id === dr.tripId);
    if (!d.trips.length) return '<div class="card empty-state"><h3>لا توجد رحلات مفتوحة للحجز حالياً</h3></div>';
    const price = (ty) => { const p = trip.prices[ty]; return d.agent.tier === 'B2B' ? p * (1 - d.agent.netDiscountPct / 100) : p; };
    const inp = (i, k, ph, extra = '') => `<input class="input pax-in" data-i="${i}" data-k="${k}" value="${esc(dr.pax[i][k])}" placeholder="${ph}" ${extra}>`;
    return `<div class="page-head"><div><h2>➕ حجز جديد</h2><p>يُحفظ الحجز معلقاً 24 ساعة (أو يُخصم من محفظتك إن كنت وكيلاً معتمداً) ويصل للإدارة فوراً</p></div></div>
      <div class="card stack"><div class="grid g3">
        <div class="field"><label>الرحلة</label><select class="input" id="pb-trip" data-act-change="pDraftTrip">${d.trips.map((t) => opt(t.id, dr.tripId, `${t.code} · ${t.name} (${t.departDate})`)).join('')}</select></div>
        <div class="field"><label>مسار البيع</label><select class="input pb-f" data-k="mode">${Object.entries(E.SALE_MODES).filter(([k]) => k !== 'UNBUNDLED').map(([k, v]) => opt(k, dr.mode, v)).join('')}</select></div>
        <div class="field"><label>فئة التسكين</label><select class="input pb-f" data-k="roomType">${TYPES.map((t) => opt(t, dr.roomType, `${E.ROOM_TYPES[t].ar} — ${h.n0(price(t))} ج.م/فرد`)).join('')}</select></div></div>
        <div class="small muted">أسرّة تفريد متاحة: مكة ${trip.freeBeds[0]} · المدينة ${trip.freeBeds[1]} · طفل بدون سرير ${h.n0(trip.prices.CHD)} · رضيع ${h.n0(trip.prices.INF)}${d.agent.tier === 'BROKER' && trip.commissionText ? ` · عمولتك في هذه الرحلة ${esc(trip.commissionText)}` : ''}</div>
        <div class="row"><b>👥 المسافرون</b><span class="spacer"></span><button class="btn sm" data-act="pAddPax" data-t="ADULT">+ بالغ</button><button class="btn sm" data-act="pAddPax" data-t="CHD">+ طفل</button><button class="btn sm" data-act="pAddPax" data-t="INF">+ رضيع</button></div>
        ${dr.pax.map((p, i) => `<div class="pax-card"><div class="row" style="gap:6px"><button class="btn sm" data-act="pDraftFile" data-i="${i}" data-k="photoFileId">${p.photoFileId ? '✅' : '📷'} صورة</button><button class="btn sm" data-act="pDraftFile" data-i="${i}" data-k="passportFileId">${p.passportFileId ? '✅' : '🛂'} جواز</button></div>
          <div class="grid g3">${inp(i, 'nameAr', 'الاسم بالعربية')}${inp(i, 'nameEn', 'NAME AS IN PASSPORT', 'style="direction:ltr"')}
            <select class="input pax-in" data-i="${i}" data-k="gender">${opt('M', p.gender, 'ذكر')}${opt('F', p.gender, 'أنثى')}</select>
            <select class="input pax-in" data-i="${i}" data-k="type">${Object.entries(E.PAX_TYPES).map(([k, v]) => opt(k, p.type, v.ar)).join('')}</select>
            ${inp(i, 'passport', 'رقم الجواز', 'style="direction:ltr"')}<div class="field"><label class="small">انتهاء الجواز</label>${inp(i, 'passportExp', '', 'type="date"')}</div>
            <div class="field"><label class="small">الميلاد</label>${inp(i, 'dob', '', 'type="date"')}</div>${inp(i, 'nid', 'الرقم القومي', 'style="direction:ltr"')}${inp(i, 'phone', 'الهاتف', 'style="direction:ltr"')}</div>
          ${dr.pax.length > 1 ? `<button class="btn sm danger" data-act="pDelPax" data-i="${i}">✕</button>` : ''}</div>`).join('')}
        <div class="field"><label>ملاحظات</label><input class="input pb-f" data-k="notes" value="${esc(dr.notes)}"></div>
        <button class="btn primary" data-act="pSubmitBooking">📤 إرسال الحجز</button></div>`;
  };
  function readDraft() {
    document.querySelectorAll('.pax-in').forEach((el) => { P.draft.pax[el.dataset.i][el.dataset.k] = el.value; });
    document.querySelectorAll('.pb-f').forEach((el) => { P.draft[el.dataset.k] = el.value; });
  }
  App.actions.pDraftTrip = (d) => { readDraft(); P.draft.tripId = d.value; P.render(); };
  App.actions.pAddPax = (d) => { readDraft(); P.draft.pax.push({ ...blank(), type: d.t }); P.render(); };
  App.actions.pDelPax = (d) => { readDraft(); P.draft.pax.splice(Number(d.i), 1); P.render(); };
  App.actions.pDraftFile = async (d) => { readDraft(); const [f] = await App.uploadPicked({ accept: 'image/*,application/pdf' }); if (f) { P.draft.pax[Number(d.i)][d.k] = f.id; P.render(); } };
  App.actions.pSubmitBooking = async () => {
    readDraft();
    const miss = P.draft.pax.filter((p) => !p.photoFileId || !p.passportFileId).length;
    if (miss && !confirm(`${miss} مسافر بدون صورة شخصية/صورة جواز — سيظهر تحذير على الحجز حتى تُرفع. متابعة؟`)) return;
    try {
      const r = await App.api('POST', 'api/portal/booking', { tripId: P.draft.tripId, draft: P.draft });
      App.toast(`✅ تم تسجيل الحجز ${r.code}`); newDraft(); await P.load(); P.page = 'bookings'; P.render();
    } catch (e) { App.toast('⛔ ' + e.message, 'err'); }
  };

  PAGES.payment = () => {
    const d = P.data, pay = P.pay || (P.pay = { amount: '', cashboxId: (d.cashboxes[0] || {}).id, method: 'إيداع بنكي', bookingId: '', memo: '', fileIds: [] });
    return `<div class="page-head"><div><h2>💰 رفع دفعة</h2><p>ارفع صورة الإيصال — تصل للمحاسب كإشعار، وبعد اعتماده تنزل في حسابك تلقائياً</p></div></div>
      <div class="card stack" style="max-width:720px"><div class="grid g2">
        <div class="field"><label>المبلغ (${esc(d.agent.currency)})</label><input class="input" id="pp-amt" type="number" value="${esc(pay.amount)}"></div>
        <div class="field"><label>تم الإيداع في</label><select class="input" id="pp-cb">${d.cashboxes.map((c) => opt(c.id, pay.cashboxId, `${c.name}${c.iban ? ' · ' + c.iban : ''}`)).join('')}</select></div>
        <div class="field"><label>طريقة الدفع</label><select class="input" id="pp-m">${['إيداع بنكي', 'تحويل بنكي', 'إنستاباي', 'فودافون كاش', 'نقدي بالمقر'].map((m) => opt(m, pay.method, m)).join('')}</select></div>
        <div class="field"><label>عن حجز (اختياري)</label><select class="input" id="pp-bk"><option value="">شحن رصيد عام</option>${d.bookings.filter((b) => b.net && b.paid < b.net && E.LIVE_STATES.includes(b.status)).map((b) => opt(b.id, pay.bookingId, `${b.code} · متبقي ${h.n0(b.net - b.paid)}`)).join('')}</select></div></div>
        <div class="field"><label>ملاحظات</label><input class="input" id="pp-memo" value="${esc(pay.memo)}"></div>
        <div class="row"><button class="btn" data-act="pPayFile">📎 صورة الإيصال</button><button class="btn" data-act="pPayCam">📸 كاميرا</button>${pay.fileIds.map((id) => h.thumb(id, 'إيصال')).join('')}</div>
        <button class="btn primary" data-act="pSubmitPay">📤 إرسال للمحاسب</button></div>`;
  };
  function readPay() { const p = P.pay; p.amount = App.val('pp-amt'); p.cashboxId = App.val('pp-cb'); p.method = App.val('pp-m'); p.bookingId = App.val('pp-bk'); p.memo = App.val('pp-memo'); }
  App.actions.pPayFor = (d) => { P.pay = null; PAGES.payment(); P.pay.bookingId = d.id; P.page = 'payment'; P.render(); };
  App.actions.pPayFile = async () => { readPay(); const fs = await App.uploadPicked({ accept: 'image/*,application/pdf', multiple: true }); P.pay.fileIds.push(...fs.map((f) => f.id)); P.render(); };
  App.actions.pPayCam = async () => { readPay(); const fs = await App.uploadPicked({ accept: 'image/*', capture: true }); P.pay.fileIds.push(...fs.map((f) => f.id)); P.render(); };
  App.actions.pSubmitPay = async () => {
    readPay();
    const p = P.pay;
    if (!(Number(p.amount) > 0)) return App.toast('أدخل المبلغ', 'err');
    if (!p.fileIds.length) return App.toast('ارفع صورة الإيصال', 'err');
    try { const r = await App.api('POST', 'api/portal/payment', { ...p, amount: Number(p.amount), currency: P.data.agent.currency }); App.toast(`📤 ${r.no} أُرسل للمحاسب للمراجعة`); P.pay = null; await P.load(); P.page = 'account'; P.render(); }
    catch (e) { App.toast('⛔ ' + e.message, 'err'); }
  };

  // ------------------------------------------------- supervisor / housing
  PAGES.sheets = () => {
    const d = P.data;
    if (!d.trips.length) return '<div class="card empty-state"><h3>لا توجد رحلات مكلّف بها حالياً</h3><p class="muted">تُسند الرحلة لحسابك من الإدارة (الرحلات ← الإعدادات والتكليف).</p></div>';
    const t = d.trips.find((x) => x.id === P.tripId) || d.trips[0]; P.tripId = t.id;
    const kind = d.role === 'SUPERVISOR' ? 'supervisor' : 'housing';
    return `<div class="page-head"><div><h2>${kind === 'supervisor' ? '🧑‍✈️ كشف المشرف' : '🛏️ كشف مندوب التسكين'}</h2></div>
      <div class="row"><select class="input" data-act-change="pTrip">${d.trips.map((x) => opt(x.id, t.id, `${x.code} · ${x.name}`)).join('')}</select><button class="btn gold" data-act="pPrintSheet">🖨️ طباعة</button></div></div>
      <div class="card"><div class="doc">${window.Sheets[kind](t)}</div></div>`;
  };
  App.actions.pTrip = (d) => { P.tripId = d.value; P.render(); };
  App.actions.pPrintSheet = () => { const t = P.data.trips.find((x) => x.id === P.tripId); App.printDoc('Sheet', window.Sheets[P.data.role === 'SUPERVISOR' ? 'supervisor' : 'housing'](t)); };
  PAGES.chat = () => App.chatView();
  // employee self-service (attendance, leaves, tasks, payslips) for field staff who are also employees
  P.refreshMe = async () => { try { App.meData = await App.api('GET', 'api/hr/me'); } catch (e) { App.meData = { linked: false }; } };
  PAGES.me = () => {
    if (!App.meData) { P.refreshMe().then(() => P.render()); return '<div class="card muted">جارِ التحميل…</div>'; }
    if (!App.meData.linked) return '<div class="card empty-state"><h3>🪪 حسابي كموظف</h3><p class="muted">حسابك غير مربوط بملف موظف — راجع الموارد البشرية.</p></div>';
    return App.meView(App.meData);
  };
})();
