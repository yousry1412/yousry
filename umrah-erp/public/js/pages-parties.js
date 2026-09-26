/* Umrah ERP — Parties & master data: customers, suppliers, hotels & allotments (coded), employees, party statements */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, h = App.h, esc = h.esc, opt = h.opt;
  const S = () => App.S;
  const balCell = (bal, owesLabel = 'مدين', creditLabel = 'دائن') => `<span class="${bal > 0.009 ? 'danger' : bal < -0.009 ? 'ok' : 'faint'}">${h.egp(Math.abs(bal))} ${bal > 0.009 ? owesLabel : bal < -0.009 ? creditLabel : ''}</span>`;
  const search = (list, q, keys) => (!q ? list : list.filter((x) => keys.some((k) => String(x[k] || '').toLowerCase().includes(q.toLowerCase()))));
  function field(id, label, val, extra = '') { return `<div class="field"><label>${label}</label><input class="input" id="${id}" value="${esc(val ?? '')}" ${extra}></div>`; }

  // ============================================================ customers
  App.pages.customers = () => {
    const s = S(), q = App.ui.cq || '';
    const bookingsOf = (c) => s.trips.flatMap((d) => d.bookings.filter((b) => b.customerId === c.id).map((b) => ({ b, d })));
    const list = search(s.customers, q, ['name', 'phone', 'code', 'nid']);
    return `<div class="page-head"><div><h2>👤 العملاء</h2><p>تكويد تلقائي CUS-xxxx · يُنشأ العميل تلقائياً من أول حجز (بالهاتف) · كشف حساب من القيود</p></div>
      <div class="row"><input class="input" style="width:240px" placeholder="🔎 اسم/هاتف/كود" data-ui="cq" value="${esc(q)}"><button class="btn primary" data-act="custForm">+ عميل</button></div></div>
      <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>الكود</th><th>الاسم</th><th>الهاتف</th><th>الرقم القومي</th><th>الحجوزات</th><th>الرصيد</th><th></th></tr></thead><tbody>
      ${list.map((c) => { const bk = bookingsOf(c); return `<tr><td class="num">${esc(c.code)}</td><td><b>${esc(c.name)}</b></td><td class="num">${esc(c.phone)}</td><td class="num">${esc(c.nid || '')}</td>
        <td class="small">${bk.map(({ b, d }) => `<a href="#" data-act="go" data-page="bookingView" data-id="${b.id}">${b.code}</a> <span class="faint">${esc(d.trip.code)}</span>`).join('<br>') || '—'}</td>
        <td>${balCell(Acc.partyBalance(s, 'customer', c.id), 'عليه', 'له')}</td>
        <td class="row" style="gap:4px"><button class="btn sm" data-act="go" data-page="partyView" data-ptype="customer" data-id="${c.id}">📄 كشف حساب</button><button class="btn sm ghost" data-act="custForm" data-id="${c.id}">✏️</button></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">لا عملاء.</td></tr>'}
      </tbody></table></div></div>`;
  };
  App.actions.custForm = (d) => {
    const c = d.id ? h.customer(d.id) : {};
    App.modal(`<h3>${d.id ? 'تعديل' : 'إضافة'} عميل ${c.code ? `<span class="chip">${esc(c.code)}</span>` : ''}</h3><div class="grid g2">
      ${field('cu-name', 'الاسم', c.name)}${field('cu-phone', 'الهاتف', c.phone, 'style="direction:ltr"')}${field('cu-nid', 'الرقم القومي', c.nid, 'style="direction:ltr"')}${field('cu-notes', 'ملاحظات', c.notes)}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="custSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.custSave = (d) => {
    const s = S(), name = String(App.val('cu-name')).trim();
    if (name.length < 2) return App.toast('اكتب الاسم', 'err');
    const c = d.id ? h.customer(d.id) : Model.findOrCreateCustomer(s, { name, phone: App.val('cu-phone') });
    Object.assign(c, { name, phone: App.val('cu-phone'), nid: App.val('cu-nid'), notes: App.val('cu-notes') });
    App.audit(`${d.id ? 'تعديل' : 'إضافة'} عميل ${c.code}`); App.closeModal(); App.save(); App.render();
  };

  // ============================================================ suppliers
  const CAT = { HOTEL: 'فنادق', AIR: 'طيران', VISA: 'تأشيرات/نسك', TRANSPORT: 'نقل', OPEX: 'تشغيل/أخرى' };
  App.pages.suppliers = () => {
    const s = S(), q = App.ui.sq || '';
    const list = search(s.suppliers, q, ['name', 'code', 'phone']);
    return `<div class="page-head"><div><h2>🏢 الموردون</h2><p>تكويد SUP-xxx · فواتير الموردين (تكلفة الرحلة) · سندات صرف بالريال مع فروق العملة · كشف حساب</p></div>
      <div class="row"><input class="input" style="width:220px" placeholder="🔎 بحث" data-ui="sq" value="${esc(q)}"><button class="btn primary" data-act="supForm">+ مورد</button></div></div>
      <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>الكود</th><th>المورد</th><th>الفئة</th><th>العملة</th><th>الهاتف</th><th>رقم ضريبي</th><th>الرصيد</th><th></th></tr></thead><tbody>
      ${list.map((x) => `<tr><td class="num">${esc(x.code)}</td><td><b>${esc(x.name)}</b></td><td>${esc(CAT[x.category] || x.category)}</td><td>${esc(x.currency)}</td><td class="num">${esc(x.phone || '')}</td><td class="num">${esc(x.taxNo || '')}</td>
        <td>${balCell(-Acc.partyBalance(s, 'supplier', x.id), 'مستحق له', 'مدفوع مقدماً')}</td>
        <td class="row" style="gap:4px"><button class="btn sm" data-act="supBill" data-id="${x.id}">🧾 فاتورة</button><button class="btn sm primary" data-act="supPay" data-id="${x.id}">💸 سداد</button>
          <button class="btn sm ghost" data-act="go" data-page="partyView" data-ptype="supplier" data-id="${x.id}">📄 كشف</button><button class="btn sm ghost" data-act="supForm" data-id="${x.id}">✏️</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">لا موردين.</td></tr>'}
      </tbody></table></div></div>`;
  };
  App.actions.supForm = (d) => {
    const x = d.id ? h.supplier(d.id) : { category: 'HOTEL', currency: 'SAR' };
    App.modal(`<h3>${d.id ? 'تعديل' : 'إضافة'} مورد ${x.code ? `<span class="chip">${esc(x.code)}</span>` : ''}</h3><div class="grid g2">
      ${field('su-name', 'اسم المورد', x.name)}<div class="field"><label>الفئة</label><select class="input" id="su-cat">${Object.entries(CAT).map(([k, v]) => opt(k, x.category, v)).join('')}</select></div>
      <div class="field"><label>عملة التعامل</label><select class="input" id="su-cur">${opt('SAR', x.currency, 'ريال')}${opt('EGP', x.currency, 'جنيه')}${opt('USD', x.currency, 'دولار')}</select></div>
      ${field('su-phone', 'الهاتف', x.phone, 'style="direction:ltr"')}${field('su-tax', 'الرقم الضريبي', x.taxNo, 'style="direction:ltr"')}${field('su-contact', 'مسؤول التواصل', x.contact)}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="supSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.supSave = (d) => {
    const s = S(), name = String(App.val('su-name')).trim();
    if (name.length < 2) return App.toast('اكتب الاسم', 'err');
    const x = d.id ? h.supplier(d.id) : { id: 'S' + Date.now().toString(36), code: Model.nextCode(s, 'SUP', 'SUP') };
    Object.assign(x, { name, category: App.val('su-cat'), currency: App.val('su-cur'), phone: App.val('su-phone'), taxNo: App.val('su-tax'), contact: App.val('su-contact') });
    if (!d.id) s.suppliers.push(x);
    App.audit(`${d.id ? 'تعديل' : 'إضافة'} مورد ${x.code}`); App.closeModal(); App.save(); App.render();
  };
  const COST_ACC = { HOTEL: '5101', AIR: '5102', VISA: '5103', TRANSPORT: '5104', OPEX: '5105' };
  App.actions.supBill = (d) => { const x = h.supplier(d.id); App.openVoucher({ type: 'BILL', party: { type: 'supplier', id: x.id }, currency: x.currency, accountCode: COST_ACC[x.category] || '5105', tripId: S().activeTripId || '', fx: x.currency === 'SAR' && S().trip ? S().trip.fxRef : undefined, memo: `فاتورة ${x.name}`, lockParty: true }); };
  App.actions.supPay = (d) => { const x = h.supplier(d.id); App.openVoucher({ type: 'PV', party: { type: 'supplier', id: x.id }, currency: x.currency, tripId: S().activeTripId || '', refFx: S().trip ? S().trip.fxRef : null, memo: `سداد ${x.name}`, lockParty: true }); };

  // ============================================================ hotels & allotments
  const TYPES = Object.keys(E.ROOM_TYPES);
  App.pages.hotels = () => {
    const s = S(), today = E.iso(new Date());
    return `<div class="page-head"><div><h2>🏨 الفنادق والمخصصات</h2><p>تكويد HTL-MAK/MAD-xxx · عقود المخصصات بالأسعار والطاقات وتاريخ التحرير (Cut-off)</p></div>
      <div class="row"><button class="btn primary" data-act="hotelForm">+ فندق</button><button class="btn" data-act="allotForm">+ مخصص (عقد)</button></div></div>
      <div class="grid g2">${s.hotels.map((ho) => { const als = s.allotments.filter((a) => a.hotelId === ho.id); return `<div class="card">
        <div class="row"><b>${ho.city === 'MAK' ? '🕋' : '🕌'} ${esc(ho.name)}</b><span class="spacer"></span><span class="chip gold">${esc(ho.code)}</span></div>
        <div class="small muted">${esc(ho.nameEn || '')} · ${E.CITIES[ho.city].ar} · ${'★'.repeat(Number(ho.stars) || 0)} ${ho.distance ? '· ' + esc(ho.distance) : ''} · المورد: ${esc(h.supplier(ho.supplierId).name)}</div>
        <table class="t" style="margin-top:8px"><thead><tr><th>العقد</th><th>الفترة</th><th>Cut-off</th><th>الغرف</th><th>الأسعار (ر.س/ليلة)</th><th></th></tr></thead><tbody>
        ${als.map((a) => { const left = E.daysBetween(today, a.cutoff); return `<tr><td class="num">${esc(a.code)}</td><td class="num small">${a.from}<br>${a.to}</td>
          <td>${left < 0 ? '<span class="chip">انقضى</span>' : left <= 7 ? `<span class="chip danger">${left} يوم</span>` : `<span class="num">${a.cutoff}</span>`}</td>
          <td class="small">${TYPES.map((t) => `${E.ROOM_TYPES[t].ar} ${a.rooms[t] || 0}`).join('<br>')}</td><td class="small">${TYPES.map((t) => `${E.ROOM_TYPES[t].ar} ${a.rates[t]}`).join('<br>')}</td>
          <td><button class="btn sm ghost" data-act="allotForm" data-id="${a.id}">✏️</button></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">لا مخصصات.</td></tr>'}</tbody></table>
        <div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="hotelForm" data-id="${ho.id}">✏️ تعديل الفندق</button></div></div>`; }).join('') || '<div class="card muted">لا فنادق بعد.</div>'}</div>`;
  };
  App.actions.hotelForm = (d) => {
    const s = S(), x = d.id ? s.hotels.find((y) => y.id === d.id) : { city: 'MAK', stars: 5 };
    App.modal(`<h3>${d.id ? 'تعديل' : 'إضافة'} فندق ${x.code ? `<span class="chip">${esc(x.code)}</span>` : ''}</h3><div class="grid g2">
      ${field('ho-name', 'اسم الفندق', x.name)}${field('ho-en', 'الاسم بالإنجليزية (لكشوف التسكين)', x.nameEn, 'style="direction:ltr"')}
      <div class="field"><label>المدينة</label><select class="input" id="ho-city" ${d.id ? 'disabled' : ''}>${opt('MAK', x.city, 'مكة المكرمة')}${opt('MAD', x.city, 'المدينة المنورة')}</select></div>
      <div class="field"><label>المورد/شركة الحجز</label><select class="input" id="ho-sup">${s.suppliers.map((y) => opt(y.id, x.supplierId, `${y.code} · ${y.name}`)).join('')}</select></div>
      ${field('ho-stars', 'النجوم', x.stars, 'type="number" min="1" max="5"')}${field('ho-dist', 'المسافة من الحرم', x.distance)}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="hotelSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.hotelSave = (d) => {
    const s = S(), name = String(App.val('ho-name')).trim();
    if (name.length < 2) return App.toast('اكتب اسم الفندق', 'err');
    if (!s.suppliers.length) return App.toast('أضف المورد أولاً من صفحة الموردين', 'err');
    let x = d.id && s.hotels.find((y) => y.id === d.id);
    if (!x) { const city = App.val('ho-city'); x = { id: 'H' + Date.now().toString(36), city, code: Model.nextCode(s, 'HTL_' + city, `HTL-${city}`) }; s.hotels.push(x); }
    Object.assign(x, { name, nameEn: App.val('ho-en'), supplierId: App.val('ho-sup'), stars: Number(App.val('ho-stars')) || 0, distance: App.val('ho-dist') });
    App.audit(`${d.id ? 'تعديل' : 'إضافة'} فندق ${x.code}`); App.closeModal(); App.save(); App.render();
  };
  App.actions.allotForm = (d) => {
    const s = S();
    if (!s.hotels.length) return App.toast('أضف الفندق أولاً', 'err');
    const a = d.id ? s.allotments.find((y) => y.id === d.id) : { hotelId: s.hotels[0].id, from: E.iso(new Date()), to: E.iso(E.addDays(new Date(), 30)), cutoff: E.iso(E.addDays(new Date(), 7)), rooms: {}, rates: {} };
    App.modal(`<h3>${d.id ? 'تعديل' : 'إضافة'} مخصص فندقي</h3><div class="grid g3">
      <div class="field"><label>الفندق</label><select class="input" id="al-hotel" ${d.id ? 'disabled' : ''}>${s.hotels.map((x) => opt(x.id, a.hotelId, `${x.code} · ${x.name}`)).join('')}</select></div>
      ${field('al-from', 'من', a.from, 'type="date"')}${field('al-to', 'إلى (خروج)', a.to, 'type="date"')}${field('al-cut', 'تاريخ التحرير Cut-off', a.cutoff, 'type="date"')}</div>
      <table class="t" style="margin-top:8px"><tr><th>الفئة</th><th>عدد الغرف</th><th>سعر الغرفة/ليلة (ر.س)</th></tr>
      ${TYPES.map((t) => `<tr><td>${E.ROOM_TYPES[t].ar}</td><td><input class="input" id="al-n-${t}" type="number" min="0" value="${a.rooms[t] || 0}"></td><td><input class="input" id="al-r-${t}" type="number" min="0" value="${a.rates[t] || 0}"></td></tr>`).join('')}</table>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="allotSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.allotSave = (d) => {
    const s = S();
    let a = d.id && s.allotments.find((y) => y.id === d.id);
    if (!a) {
      const ho = s.hotels.find((x) => x.id === App.val('al-hotel'));
      a = { id: 'AL' + Date.now().toString(36), hotelId: ho.id, city: ho.city, supplierId: ho.supplierId, hotel: ho.name, hotelEn: ho.nameEn, code: Model.nextCode(s, 'ALT_' + ho.city, `ALT-${ho.city}`), days: {}, priceOverrides: {}, b2bSold: {}, b2bHeld: {} };
      s.allotments.push(a);
    }
    Object.assign(a, { from: App.val('al-from'), to: App.val('al-to'), cutoff: App.val('al-cut'), rooms: {}, rates: {} });
    for (const t of TYPES) { a.rooms[t] = Number(App.val('al-n-' + t)) || 0; a.rates[t] = Number(App.val('al-r-' + t)) || 0; }
    a.totalRooms = TYPES.reduce((x, t) => x + a.rooms[t], 0);
    if (a.to <= a.from) return App.toast('تاريخ النهاية يجب أن يكون بعد البداية', 'err');
    App.audit(`حفظ مخصص ${a.code}`); App.closeModal(); App.save(); App.render();
  };

  // ============================================================ employees
  App.pages.employees = () => {
    const s = S();
    return `<div class="page-head"><div><h2>🧑‍💼 الموظفون</h2><p>تكويد EMP-xxx · حساب لكل موظف (سلف، عهد، رواتب، تسويات) مع كشف حساب تفصيلي</p></div><button class="btn primary" data-act="empForm">+ موظف</button></div>
      <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>الكود</th><th>الاسم</th><th>الوظيفة</th><th>الفرع</th><th>الهاتف</th><th>الراتب</th><th>رصيد السلف/العهد</th><th></th></tr></thead><tbody>
      ${s.employees.map((x) => `<tr><td class="num">${esc(x.code)}</td><td><b>${esc(x.name)}</b></td><td>${esc(x.job || '')}</td><td>${esc(h.branch(x.branchId).name)}</td><td class="num">${esc(x.phone || '')}</td><td>${h.egp(x.salary || 0)}</td>
        <td>${balCell(Acc.partyBalance(s, 'employee', x.id), 'عليه', 'له')}</td>
        <td class="row" style="gap:4px"><button class="btn sm" data-act="empPay" data-id="${x.id}" data-p="ADVANCE">سلفة/عهدة</button><button class="btn sm" data-act="empPay" data-id="${x.id}" data-p="SALARY">صرف راتب</button>
          <button class="btn sm ghost" data-act="empReturn" data-id="${x.id}">رد عهدة</button><button class="btn sm ghost" data-act="go" data-page="partyView" data-ptype="employee" data-id="${x.id}">📄 كشف</button>
          <button class="btn sm ghost" data-act="empForm" data-id="${x.id}">✏️</button></td></tr>`).join('') || '<tr><td colspan="8" class="muted">لا موظفين.</td></tr>'}
      </tbody></table></div></div>`;
  };
  App.actions.empForm = (d) => {
    const x = d.id ? h.employee(d.id) : { branchId: 'BR1' };
    App.modal(`<h3>${d.id ? 'تعديل' : 'إضافة'} موظف ${x.code ? `<span class="chip">${esc(x.code)}</span>` : ''}</h3><div class="grid g2">
      ${field('em-name', 'الاسم', x.name)}${field('em-job', 'الوظيفة', x.job)}${field('em-phone', 'الهاتف', x.phone, 'style="direction:ltr"')}${field('em-sal', 'الراتب الشهري', x.salary, 'type="number"')}
      ${field('em-nid', 'الرقم القومي', x.nid, 'style="direction:ltr"')}<div class="field"><label>الفرع</label><select class="input" id="em-br">${S().branches.map((b) => opt(b.id, x.branchId, b.name)).join('')}</select></div></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="empSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.empSave = (d) => {
    const s = S(), name = String(App.val('em-name')).trim();
    if (name.length < 2) return App.toast('اكتب الاسم', 'err');
    const x = d.id ? h.employee(d.id) : { id: 'EM' + Date.now().toString(36), code: Model.nextCode(s, 'EMP', 'EMP') };
    Object.assign(x, { name, job: App.val('em-job'), phone: App.val('em-phone'), salary: Number(App.val('em-sal')) || 0, nid: App.val('em-nid'), branchId: App.val('em-br') });
    if (!d.id) s.employees.push(x);
    App.audit(`${d.id ? 'تعديل' : 'إضافة'} موظف ${x.code}`); App.closeModal(); App.save(); App.render();
  };
  App.actions.empPay = (d) => { const x = h.employee(d.id); App.openVoucher({ type: 'PV', party: { type: 'employee', id: x.id }, purpose: d.p, amount: d.p === 'SALARY' ? x.salary : '', memo: d.p === 'SALARY' ? `راتب ${x.name}` : `سلفة/عهدة ${x.name}`, lockParty: true }); };
  App.actions.empReturn = (d) => { const x = h.employee(d.id); App.openVoucher({ type: 'RV', party: { type: 'employee', id: x.id }, memo: `رد عهدة/سلفة ${x.name}`, lockParty: true }); };

  // ============================================================ party statement
  const PT = { customer: 'العميل', agent: 'الوكيل/المندوب', supplier: 'المورد', employee: 'الموظف' };
  function statementHtml(type, id, f) {
    const s = S(), p = { type, id }, st = Acc.partyStatement(s, type, id, f);
    const x = type === 'customer' ? h.customer(id) : type === 'agent' ? h.agent(id) : type === 'supplier' ? h.supplier(id) : h.employee(id);
    return `<div class="head"><div><h2>كشف حساب ${PT[type]}</h2><div>${esc(x.code || '')} · ${esc(x.name)}${x.phone ? ' · ' + esc(x.phone) : ''}</div></div>
      <div>${esc(f.from || 'من البداية')} ← ${esc(f.to || E.iso(new Date()))}</div></div>
      <table><tr><th>التاريخ</th><th>القيد</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr>
      ${st.rows.map((r) => `<tr><td>${r.date}</td><td>${r.no}</td><td>${esc(r.memo)}</td><td>${r.dr ? h.n2(r.dr) : ''}</td><td>${r.cr ? h.n2(r.cr) : ''}</td><td><b>${h.n2(r.bal)}</b></td></tr>`).join('')}
      <tr><th colspan="5">الرصيد الختامي (${st.balance > 0 ? 'مدين — مستحق على ' + PT[type] : st.balance < 0 ? 'دائن — مستحق لـ' + PT[type] : 'مسدد'})</th><th>${h.n2(Math.abs(st.balance))} ج.م</th></tr></table>
      <div class="sign"><div>المحاسب ................</div><div>اعتماد ................</div></div>`;
  }
  App.statementHtml = statementHtml;
  App.pages.partyView = () => {
    const vp = App.ui.viewParty || {};
    if (!vp.type) return '<div class="card">اختر طرفاً.</div>';
    const f = { from: App.ui.pvFrom || '', to: App.ui.pvTo || '' };
    return `<div class="page-head"><div><h2>📄 كشف حساب</h2></div><div class="row">
      <div class="field"><label>من</label><input class="input" type="date" data-ui="pvFrom" value="${f.from}"></div><div class="field"><label>إلى</label><input class="input" type="date" data-ui="pvTo" value="${f.to}"></div>
      <button class="btn gold" data-act="pvPrint">🖨️ طباعة</button><button class="btn" data-act="pvWa">🟢 واتساب</button></div></div>
      <div class="card"><div class="doc">${statementHtml(vp.type, vp.id, f)}</div></div>`;
  };
  App.actions.pvPrint = () => { const vp = App.ui.viewParty; App.printDoc('Statement', statementHtml(vp.type, vp.id, { from: App.ui.pvFrom || '', to: App.ui.pvTo || '' })); };
  App.actions.pvWa = () => {
    const vp = App.ui.viewParty, s = S(), st = Acc.partyStatement(s, vp.type, vp.id);
    const x = vp.type === 'customer' ? h.customer(vp.id) : vp.type === 'agent' ? h.agent(vp.id) : vp.type === 'supplier' ? h.supplier(vp.id) : h.employee(vp.id);
    if (!x.phone) return App.toast('لا يوجد رقم هاتف', 'err');
    window.open(E.waLink(x.phone, `السلام عليكم ${x.name}\nرصيد حسابكم لدى ${s.company.name}: ${h.n2(Math.abs(st.balance))} ج.م ${st.balance > 0 ? 'مستحق السداد' : st.balance < 0 ? 'لصالحكم' : ''}\nنشكر تعاونكم.`), '_blank', 'noopener');
  };
})();
