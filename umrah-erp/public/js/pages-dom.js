/* أفواج — Domestic tourism screens: programs, bookings (program / hotel-only), booking file, hotels & contract rates,
 * operations (manifest, rooming, bus seats, pickups, WhatsApp), program profitability */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, Dom = window.Dom, h = App.h, esc = h.esc, opt = h.opt;
  const S = () => App.S;
  const today = () => E.iso(new Date());
  const field = (id, label, val, extra = '') => `<div class="field"><label>${label}</label><input class="input" id="${id}" value="${esc(val ?? '')}" ${extra}></div>`;
  const area = (id, label, val, rows = 3) => `<div class="field" style="grid-column:1/-1"><label>${label}</label><textarea class="input" id="${id}" rows="${rows}">${esc(val || '')}</textarea></div>`;
  const hotelName = (o) => (o.hotelId ? (Dom.hotel(S(), o.hotelId) || {}).name : o.hotelName) || '—';
  const progLabel = (p) => `${Dom.KINDS[p.kind].icon} ${p.code} · ${p.name}`;
  const branchOk = (brId) => Model.hasDomain(S(), 'DOMESTIC', brId);
  const done = (msg) => { if (msg) App.audit(msg); App.closeModal(); App.save(); App.render(); };
  const bookingOf = (id) => S().dom.bookings.find((b) => b.id === id);
  const paxCount = (b) => (b.units ? b.units.adults + b.units.chd + b.units.inf : 0);
  const custName = (b) => (b.customerId ? (h.customer(b.customerId) || {}).name : b.agentId ? (h.agent(b.agentId) || {}).name : '') || (b.pax[0] || {}).name || '—';
  const whatFor = (b) => { if (b.programId) { const p = Dom.program(S(), b.programId); return p ? progLabel(p) : '—'; } const x = Dom.hotel(S(), b.hotel.hotelId); return `🏨 ${x ? x.name : ''} · ${b.hotel.checkIn} ← ${b.hotel.checkOut}`; };

  // ================================================================ PROGRAMS
  App.pages.domPrograms = () => {
    const s = S(), f = App.ui.domPf || 'OPEN';
    const list = s.dom.programs.filter((p) => (f === 'ALL' || p.status === f) && (!App.myBranch() || p.branchId === App.myBranch())).sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
    return `<div class="page-head"><div><h2>🏖️ برامج السياحة الداخلية</h2><p>مصايف ومشاتي، رحلات اليوم الواحد، الفنادق العائمة — لكل برنامج فنادقه وأسعاره حسب الإشغال وسياسة الأطفال والإضافات ونقاط التجمع</p></div>
      <div class="row"><select class="input" data-ui="domPf">${opt('OPEN', f, 'مفتوحة للحجز')}${opt('CLOSED', f, 'مغلقة')}${opt('ALL', f, 'الكل')}</select><button class="btn primary" data-act="domProgForm">+ برنامج</button></div></div>
    <div class="emp-grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">${list.map((p) => { const pl = Dom.programPnl(s, p), left = Dom.capacityLeft(s, p);
      return `<div class="card"><div class="row" style="justify-content:space-between"><b>${esc(progLabel(p))}</b>${p.status === 'CLOSED' ? '<span class="chip">مغلق</span>' : '<span class="chip ok">مفتوح</span>'}</div>
        <div class="small muted" style="margin:4px 0">${esc(p.city || '')} · ${esc(p.startDate)}${p.endDate !== p.startDate ? ' ← ' + esc(p.endDate) : ''}${p.kind !== 'DAYTRIP' ? ` · ${Dom.nights(p.startDate, p.endDate)} ليالٍ` : ''} · ${esc(Dom.TRANSPORT[(p.transport || {}).type] || '')}</div>
        <div class="small">${p.kind === 'DAYTRIP' ? `المقعد ${h.egp(p.seatPrice)}` : (p.hotelOptions || []).map((o) => `🏨 ${esc(hotelName(o))} (${esc(o.board)}) — مزدوج ${h.n0((o.prices || {}).DBL)}`).join('<br>')}</div>
        <div class="grid g3" style="margin-top:8px"><div><div class="small muted">الحجوزات/الأفراد</div><b class="num">${pl.bookings} / ${pl.pax}</b></div><div><div class="small muted">المتبقي</div><b class="num">${left == null ? '∞' : left}</b></div><div><div class="small muted">الربح (${pl.costSource})</div><b class="num ${pl.profit < 0 ? 'danger' : 'ok'}">${h.n0(pl.profit)}</b></div></div>
        ${p.capacity ? `<div style="margin-top:6px">${h.progress(p.capacity - (left || 0), p.capacity)}</div>` : ''}
        <div class="row" style="gap:4px;margin-top:10px"><button class="btn sm primary" data-act="domNewBooking" data-p="${p.id}">+ حجز</button><button class="btn sm" data-act="domOpsOpen" data-p="${p.id}">🧾 التشغيل والكشوف</button>
          <button class="btn sm ghost" data-act="domProgForm" data-id="${p.id}">✏️</button><button class="btn sm ghost" data-act="domProgPrint" data-id="${p.id}">🖨️ البرنامج</button></div></div>`; }).join('') || '<div class="card muted">لا برامج — أضف برنامجاً جديداً.</div>'}</div>`;
  };
  App.actions.domProgForm = (d) => {
    const s = S(), p = d.id ? Dom.program(s, d.id) : { kind: 'PACKAGE', status: 'OPEN', branchId: s.branches.find((b) => branchOk(b.id)) ? s.branches.find((b) => branchOk(b.id)).id : 'BR1', startDate: E.iso(E.addDays(today(), 14)), endDate: E.iso(E.addDays(today(), 18)),
      transport: { type: 'BUS', seats: 49, cost: 0 }, childPolicy: { infantMax: 2, childMax: 12, infantPrice: 0, childNoBedPrice: 0, childBedPrice: 0 }, hotelOptions: [{ hotelId: '', board: 'HB', prices: {}, cost: {} }], extras: [], pickups: [], fixedCosts: [], commissions: {}, capacity: 49 };
    const own = App.role() === 'OWNER', cp = p.childPolicy || {};
    const optRow = (o, i) => `<div class="card" style="padding:10px;margin-top:6px"><div class="grid g4">
      <div class="field"><label>الفندق ${i + 1}</label><select class="input" id="po-h-${i}">${opt('', o.hotelId, '— من خارج القائمة —')}${s.dom.hotels.map((x) => opt(x.id, o.hotelId, `${x.code} · ${x.name} (${x.city})`)).join('')}</select></div>
      ${field(`po-hn-${i}`, 'أو اسم الفندق/الفندق العائم', o.hotelName)}
      <div class="field"><label>نظام الإقامة</label><select class="input" id="po-b-${i}">${Object.entries(Dom.BOARDS).map(([k, l]) => opt(k, o.board, `${k} — ${l}`)).join('')}</select></div><div></div>
      ${['SGL', 'DBL', 'TPL', 'QUAD'].map((r) => field(`po-p-${r}-${i}`, `سعر الفرد ${Dom.ROOMS[r].ar}`, (o.prices || {})[r], 'type="number"')).join('')}
      ${['SGL', 'DBL', 'TPL', 'QUAD'].map((r) => field(`po-c-${r}-${i}`, `تكلفة الفرد ${Dom.ROOMS[r].ar}`, (o.cost || {})[r], 'type="number"')).join('')}</div></div>`;
    App.modal(`<h3>${d.id ? 'تعديل' : 'برنامج جديد'} ${p.code ? `<span class="chip">${esc(p.code)}</span>` : ''}</h3>
      <div class="grid g4">
        <div class="field"><label>النوع</label><select class="input" id="pf-kind">${Object.entries(Dom.KINDS).map(([k, v]) => opt(k, p.kind, `${v.icon} ${v.ar}`)).join('')}</select></div>
        ${field('pf-name', 'اسم البرنامج', p.name)}
        <div class="field"><label>الوجهة</label><input class="input" id="pf-city" list="dom-cities" value="${esc(p.city || '')}"><datalist id="dom-cities">${Dom.CITIES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label>الفرع</label><select class="input" id="pf-br">${s.branches.filter((b) => branchOk(b.id)).map((b) => opt(b.id, p.branchId, b.name)).join('')}</select></div>
        ${field('pf-start', 'من', p.startDate, 'type="date"')}${field('pf-end', 'إلى', p.endDate, 'type="date"')}${field('pf-cap', 'الطاقة (أفراد)', p.capacity, 'type="number"')}
        <div class="field"><label>الحالة</label><select class="input" id="pf-st">${opt('OPEN', p.status, 'مفتوح للحجز')}${opt('CLOSED', p.status, 'مغلق')}</select></div>
        <div class="field"><label>الانتقالات</label><select class="input" id="pf-tr">${Object.entries(Dom.TRANSPORT).map(([k, l]) => opt(k, (p.transport || {}).type, l)).join('')}</select></div>
        ${field('pf-seats', 'مقاعد الأتوبيس', (p.transport || {}).seats, 'type="number"')}${field('pf-sup', 'المشرف المرافق', p.supervisor)}${field('pf-sp', 'سعر المقعد (يوم واحد)', p.seatPrice, 'type="number"')}
        ${field('pf-sc', 'تكلفة المقعد (يوم واحد)', p.seatCost, 'type="number"')}${field('pf-csp', 'سعر مقعد الطفل (يوم واحد)', p.childSeatPrice, 'type="number"')}</div>
      <h4 style="margin:12px 0 4px">🏨 الفنادق وأسعار الفرد حسب الإشغال <button class="btn sm" data-act="domProgOpt">+ فندق</button></h4><div id="pf-opts">${(p.hotelOptions || []).map(optRow).join('')}</div>
      <h4 style="margin:12px 0 4px">👶 سياسة الأطفال</h4><div class="grid g4">
        ${field('pf-infmax', 'رضيع أقل من (سنة)', cp.infantMax ?? 2, 'type="number"')}${field('pf-chdmax', 'طفل أقل من (سنة)', cp.childMax ?? 12, 'type="number"')}${field('pf-infp', 'سعر الرضيع', cp.infantPrice, 'type="number"')}<div></div>
        ${field('pf-cnb', 'طفل بدون سرير — سعر', cp.childNoBedPrice, 'type="number"')}${field('pf-cnbc', 'طفل بدون سرير — تكلفة', cp.childNoBedCost, 'type="number"')}${field('pf-cb', 'طفل بسرير إضافي — سعر', cp.childBedPrice, 'type="number"')}${field('pf-cbc', 'طفل بسرير — تكلفة', cp.childBedCost, 'type="number"')}</div>
      <div class="grid g2" style="margin-top:8px">
        ${area('pf-pick', 'نقاط التجمع ومواعيدها (سطر لكل نقطة: المكان | الساعة)', (p.pickups || []).map((x) => `${x.place} | ${x.time}`).join('\n'))}
        ${area('pf-extra', 'الرحلات الاختيارية والإضافات (سطر لكل إضافة: الاسم | السعر | التكلفة)', (p.extras || []).map((x) => `${x.name} | ${x.price} | ${x.cost || 0}`).join('\n'))}
        ${area('pf-fixed', 'التكاليف الثابتة للبرنامج (الأتوبيس، المشرف…: البند | المبلغ)', (p.fixedCosts || []).map((x) => `${x.name} | ${x.amount}`).join('\n'))}
        ${area('pf-inc', 'البرنامج يشمل', p.includes)}${area('pf-exc', 'البرنامج لا يشمل', p.excludes)}${area('pf-it', 'البرنامج اليومي', p.itinerary, 5)}</div>
      <h4 style="margin:12px 0 4px">🏷️ عمولة المناديب ${own ? '' : '<span class="chip hold">يحددها مالك النظام</span>'}</h4><div class="grid g4">${field('pf-comm', 'العمولة لكل فرد (لا تقل عن حد المندوب)', (p.commissions || {}).default, `type="number" ${own ? '' : 'disabled'}`)}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="domProgSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
    App.ui.domOptRow = optRow; App.ui.domOptN = (p.hotelOptions || []).length;
  };
  App.actions.domProgOpt = () => { const el = document.getElementById('pf-opts'); el.insertAdjacentHTML('beforeend', App.ui.domOptRow({ hotelId: '', board: 'HB', prices: {}, cost: {} }, App.ui.domOptN++)); };
  const lines = (id) => String(document.getElementById(id).value || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]);
  const numv = (id) => { const el = document.getElementById(id); return el && el.value !== '' ? Number(el.value) : null; };
  App.actions.domProgSave = (d) => {
    const s = S(), name = String(App.val('pf-name')).trim();
    if (name.length < 3) return App.toast('اكتب اسم البرنامج', 'err');
    if (App.val('pf-end') < App.val('pf-start')) return App.toast('تاريخ النهاية قبل البداية', 'err');
    const p = d.id ? Dom.program(s, d.id) : { id: Dom.uid('PR'), code: Acc.nextNo(s, 'C_DPR', 'DPR', 3), commissions: {} };
    const opts = [];
    for (let i = 0; i < App.ui.domOptN; i++) {
      if (!document.getElementById(`po-b-${i}`)) continue;
      const hid = App.val(`po-h-${i}`), hn = App.val(`po-hn-${i}`);
      const prices = {}, cost = {};
      for (const r of ['SGL', 'DBL', 'TPL', 'QUAD']) { const pv = numv(`po-p-${r}-${i}`), cv = numv(`po-c-${r}-${i}`); if (pv) prices[r] = pv; if (cv) cost[r] = cv; }
      if (hid || hn) opts.push({ hotelId: hid || null, hotelName: hn || '', board: App.val(`po-b-${i}`), prices, cost });
    }
    const kind = App.val('pf-kind');
    if (kind !== 'DAYTRIP' && !opts.length) return App.toast('أضف فندقاً واحداً على الأقل بأسعاره', 'err');
    Object.assign(p, { kind, name, city: App.val('pf-city'), branchId: App.val('pf-br'), startDate: App.val('pf-start'), endDate: kind === 'DAYTRIP' ? App.val('pf-start') : App.val('pf-end'), capacity: numv('pf-cap') || 0, status: App.val('pf-st'),
      transport: { ...(p.transport || {}), type: App.val('pf-tr'), seats: numv('pf-seats') || 0 }, supervisor: App.val('pf-sup'), seatPrice: numv('pf-sp') || 0, seatCost: numv('pf-sc') || 0, childSeatPrice: numv('pf-csp'),
      hotelOptions: opts, childPolicy: { infantMax: numv('pf-infmax') ?? 2, childMax: numv('pf-chdmax') ?? 12, infantPrice: numv('pf-infp') || 0, childNoBedPrice: numv('pf-cnb') || 0, childNoBedCost: numv('pf-cnbc') || 0, childBedPrice: numv('pf-cb') || 0, childBedCost: numv('pf-cbc') || 0 },
      pickups: lines('pf-pick').map(([place, time]) => ({ place, time: time || '' })), extras: lines('pf-extra').map(([n, pr, c], i) => ({ id: (p.extras || [])[i] ? p.extras[i].id : 'X' + (i + 1) + Date.now().toString(36).slice(-3), name: n, price: Number(pr) || 0, cost: Number(c) || 0 })),
      fixedCosts: lines('pf-fixed').map(([n, a]) => ({ name: n, amount: Number(a) || 0 })), includes: App.val('pf-inc'), excludes: App.val('pf-exc'), itinerary: App.val('pf-it') });
    if (App.role() === 'OWNER') { const c = numv('pf-comm'); p.commissions = c != null ? { ...(p.commissions || {}), default: c } : {}; }
    if (!d.id) s.dom.programs.push(p);
    done(`${d.id ? 'تعديل' : 'إنشاء'} برنامج ${p.code} ${p.name}`);
  };
  App.actions.domProgPrint = (d) => {
    const s = S(), p = Dom.program(s, d.id), nl = (t) => esc(t || '').replace(/\n/g, '<br>');
    App.printDoc(p.name, `<div class="head"><div><h1>${esc(p.name)}</h1><div class="muted">${esc(Dom.KINDS[p.kind].ar)} · ${esc(p.city || '')} · ${esc(p.startDate)}${p.endDate !== p.startDate ? ' ← ' + esc(p.endDate) : ''}</div></div><div>${esc(p.code)}</div></div>
      ${p.kind === 'DAYTRIP' ? `<div class="box">سعر المقعد: <b>${h.n0(p.seatPrice)} ج.م</b>${p.childSeatPrice ? ` · الطفل ${h.n0(p.childSeatPrice)}` : ''}</div>` : `<table><tr><th>الفندق</th><th>النظام</th>${['SGL', 'DBL', 'TPL', 'QUAD'].map((r) => `<th>${Dom.ROOMS[r].ar}</th>`).join('')}</tr>
        ${(p.hotelOptions || []).map((o) => `<tr><td>${esc(hotelName(o))}</td><td>${esc(Dom.BOARDS[o.board])}</td>${['SGL', 'DBL', 'TPL', 'QUAD'].map((r) => `<td>${(o.prices || {})[r] ? h.n0(o.prices[r]) : '—'}</td>`).join('')}</tr>`).join('')}</table>
        <p class="muted">الأسعار للفرد بالجنيه · الطفل أقل من ${p.childPolicy.childMax} سنة: بدون سرير ${h.n0(p.childPolicy.childNoBedPrice)} · بسرير ${h.n0(p.childPolicy.childBedPrice)} · الرضيع أقل من ${p.childPolicy.infantMax} سنة ${p.childPolicy.infantPrice ? h.n0(p.childPolicy.infantPrice) : 'مجاناً'}</p>`}
      <div class="grid"><div class="box"><b>يشمل</b><br>${nl(p.includes)}</div><div class="box"><b>لا يشمل</b><br>${nl(p.excludes)}</div></div>
      ${p.itinerary ? `<div class="box"><b>البرنامج</b><br>${nl(p.itinerary)}</div>` : ''}
      ${(p.extras || []).length ? `<table><tr><th>الرحلات الاختيارية</th><th>السعر</th></tr>${p.extras.map((x) => `<tr><td>${esc(x.name)}</td><td>${h.n0(x.price)}</td></tr>`).join('')}</table>` : ''}
      ${(p.pickups || []).length ? `<div class="box"><b>مواعيد التجمع</b><br>${p.pickups.map((x) => `${esc(x.place)} — ${esc(x.time)}`).join('<br>')}</div>` : ''}`);
  };

  // ================================================================ BOOKING
  const blankRoom = () => ({ type: 'DBL', adults: 2, children: [] });
  App.domNewDraft = (programId) => ({ type: programId || S().dom.programs.some((p) => p.status === 'OPEN') ? 'PROGRAM' : 'HOTEL', programId: programId || (S().dom.programs.find((p) => p.status === 'OPEN') || {}).id || '', optIdx: 0,
    hotel: { hotelId: (S().dom.hotels[0] || {}).id || '', checkIn: E.iso(E.addDays(today(), 7)), checkOut: E.iso(E.addDays(today(), 10)), board: 'BB' },
    rooms: [blankRoom()], pax: [{ name: '', phone: '', nid: '' }], extras: {}, pickup: '', agentId: '', discountPct: 0, ttl: 24, deposit: 0, cashboxId: (S().cashboxes[0] || {}).id, depositFileIds: [], notes: '', commissionAdj: 0, commissionNote: '', branchId: App.myBranch() || 'BR1' });
  const draftInput = (d) => ({ ...(d.type === 'PROGRAM' ? { programId: d.programId, optIdx: d.optIdx } : { hotel: d.hotel }), rooms: d.rooms, extras: d.type === 'PROGRAM' ? d.extras : {}, agentId: d.agentId || null,
    discountPct: d.discountPct, actorRole: App.role(), commissionAdj: App.role() === 'OWNER' ? d.commissionAdj : 0 });
  App.actions.domNewBooking = (d) => { App.ui.dd = App.domNewDraft(d.p); App.actions.go({ page: 'domBooking' }); };
  App.partials.domSummary = () => {
    const s = S(), d = App.ui.dd, v = Dom.priceBooking(s, draftInput(d));
    return `<table class="t small"><tbody>${v.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${h.egp(l.total)}</td></tr>`).join('')}
      <tr><td><b>الإجمالي</b></td><td><b>${h.egp(v.gross)}</b></td></tr>${v.discount ? `<tr><td>خصم ${d.discountPct}%</td><td class="ok">−${h.egp(v.discount)}</td></tr>` : ''}
      ${v.channelDiscount ? `<tr><td>سعر الوكيل (جملة)</td><td class="ok">−${h.egp(v.channelDiscount)}</td></tr>` : ''}<tr><td><b>الصافي المستحق</b></td><td><b class="gold">${h.egp(v.net)}</b></td></tr>
      ${App.isApprover() || App.role() === 'OWNER' ? `<tr><td class="muted">التكلفة التقديرية / الهامش</td><td class="muted">${h.n0(v.cost)} / <b class="${v.margin < 0 ? 'danger' : 'ok'}">${h.n0(v.margin)}</b></td></tr>` : ''}
      ${v.commission ? `<tr><td>🏷️ عمولة المندوب (${esc(v.commission.source)})</td><td><span class="chip gold">${h.egp(v.agentCommission)}</span></td></tr>` : ''}</tbody></table>
      <div class="row" style="margin-top:8px">الحالة عند الحفظ: ${v.status === 'BLOCKED' ? '<span class="chip danger">لا يمكن الحفظ</span>' : h.statusChip(v.status)}</div>
      ${v.reasons.map((r) => `<div class="alert err" style="margin-top:6px">${esc(r)}</div>`).join('')}${v.warnings.map((r) => `<div class="alert warn" style="margin-top:6px">${esc(r)}</div>`).join('')}`;
  };
  App.pages.domBooking = () => {
    const s = S(), d = App.ui.dd || (App.ui.dd = App.domNewDraft()), p = d.type === 'PROGRAM' ? Dom.program(s, d.programId) : null;
    const q = String(App.ui.domQ || '').trim(), st = App.ui.domSt || 'LIVE';
    const list = s.dom.bookings.filter((b) => (st === 'ALL' || (st === 'LIVE' ? E.LIVE_STATES.includes(b.status) : b.status === st)) && (!q || [b.code, custName(b), (b.pax[0] || {}).phone].join(' ').includes(q)) && (!App.myBranch() || b.branchId === App.myBranch())).slice().reverse();
    const room = (r, i) => `<div class="card" style="padding:10px"><div class="grid g4">
      <div class="field"><label>الغرفة ${i + 1}</label><select class="input" data-ui="dd.rooms.${i}.type">${Object.entries(Dom.ROOMS).map(([k, x]) => opt(k, r.type, x.ar)).join('')}</select></div>
      <div class="field"><label>بالغين</label><input class="input" type="number" min="0" max="4" data-live="dd.rooms.${i}.adults" data-num value="${r.adults}"></div>
      <div class="field"><label>الأطفال</label><button class="btn sm" data-act="domChild" data-r="${i}">+ طفل</button></div>
      <div class="field"><label>&nbsp;</label>${d.rooms.length > 1 ? `<button class="btn sm ghost" data-act="domRoomDel" data-r="${i}">حذف الغرفة</button>` : ''}</div></div>
      ${(r.children || []).map((c, j) => `<div class="row" style="gap:6px;margin-top:4px"><span class="small">طفل ${j + 1}: السن</span><input class="input sm" style="width:70px" type="number" min="0" max="17" data-live="dd.rooms.${i}.children.${j}.age" data-num value="${c.age}">
        <label class="chk"><input type="checkbox" data-bind-ui="dd.rooms.${i}.children.${j}.bed" data-act-change="domBed" data-r="${i}" data-c="${j}" ${c.bed ? 'checked' : ''}> بسرير إضافي</label><button class="btn sm ghost" data-act="domChildDel" data-r="${i}" data-c="${j}">✕</button></div>`).join('')}</div>`;
    return `<div class="page-head"><div><h2>🧾 حجوزات السياحة الداخلية</h2><p>برنامج جماعي أو يوم واحد أو فندق فقط — التسعير آلياً من البرنامج أو من تعاقد الفندق حسب الليالي والموسم</p></div></div>
    <details class="card" ${App.ui.domFormOpen === false ? '' : 'open'}><summary style="cursor:pointer"><h3 style="display:inline">➕ حجز جديد</h3></summary>
    <div class="grid g-side" style="margin-top:12px"><div class="stack">
      <div class="tabs" style="margin:0"><button class="${d.type === 'PROGRAM' ? 'active' : ''}" data-act="domType" data-t="PROGRAM">🏖️ برنامج / رحلة</button><button class="${d.type === 'HOTEL' ? 'active' : ''}" data-act="domType" data-t="HOTEL">🏨 فندق فقط</button></div>
      ${d.type === 'PROGRAM' ? `<div class="grid g3">
        <div class="field" style="grid-column:span 2"><label>البرنامج</label><select class="input" data-ui="dd.programId">${s.dom.programs.filter((x) => x.status === 'OPEN').map((x) => opt(x.id, d.programId, `${progLabel(x)} — ${x.startDate}`)).join('')}</select></div>
        ${p && p.kind !== 'DAYTRIP' ? `<div class="field"><label>الفندق</label><select class="input" data-ui="dd.optIdx">${(p.hotelOptions || []).map((o, i) => opt(i, d.optIdx, `${hotelName(o)} (${o.board})`)).join('')}</select></div>` : ''}
        ${p && (p.pickups || []).length ? `<div class="field"><label>نقطة التجمع</label><select class="input" data-ui="dd.pickup">${opt('', d.pickup, '—')}${p.pickups.map((x) => opt(x.place, d.pickup, `${x.place} (${x.time})`)).join('')}</select></div>` : ''}
        ${p ? (p.extras || []).map((x) => `<div class="field"><label>${esc(x.name)} (${h.n0(x.price)})</label><input class="input" type="number" min="0" data-live="dd.extras.${x.id}" data-num value="${d.extras[x.id] || 0}"></div>`).join('') : ''}</div>`
      : `<div class="grid g4"><div class="field" style="grid-column:span 2"><label>الفندق</label><select class="input" data-ui="dd.hotel.hotelId">${s.dom.hotels.map((x) => opt(x.id, d.hotel.hotelId, `${x.code} · ${x.name} — ${x.city}`)).join('')}</select></div>
        <div class="field"><label>الوصول</label><input class="input" type="date" data-ui="dd.hotel.checkIn" value="${d.hotel.checkIn}"></div><div class="field"><label>المغادرة</label><input class="input" type="date" data-ui="dd.hotel.checkOut" value="${d.hotel.checkOut}"></div>
        <div class="field"><label>نظام الإقامة</label><select class="input" data-ui="dd.hotel.board">${Object.entries(Dom.BOARDS).map(([k, l]) => opt(k, d.hotel.board, l)).join('')}</select></div>
        <div class="field"><label>الليالي</label><input class="input" readonly value="${Dom.nights(d.hotel.checkIn, d.hotel.checkOut)}"></div></div>`}
      <h4 style="margin:6px 0 0">🛏️ الغرف <button class="btn sm" data-act="domRoomAdd">+ غرفة</button></h4>${d.rooms.map(room).join('')}
      <h4 style="margin:6px 0 0">👤 صاحب الحجز والمرافقون <button class="btn sm" data-act="domPaxAdd">+ اسم</button></h4>
      ${d.pax.map((x, i) => `<div class="grid g3"><div class="field"><label>${i ? `مرافق ${i}` : 'الاسم (صاحب الحجز)'}</label><input class="input" data-ui="dd.pax.${i}.name" value="${esc(x.name)}"></div>
        <div class="field"><label>الهاتف ${i ? '' : '(واتساب)'}</label><input class="input" style="direction:ltr" data-ui="dd.pax.${i}.phone" value="${esc(x.phone)}"></div><div class="field"><label>الرقم القومي</label><input class="input" style="direction:ltr" data-ui="dd.pax.${i}.nid" value="${esc(x.nid)}"></div></div>`).join('')}
      <div class="grid g4">
        <div class="field"><label>القناة</label><select class="input" data-ui="dd.agentId">${opt('', d.agentId, 'بيع مباشر')}${s.agents.map((a) => opt(a.id, d.agentId, `${a.tier === 'B2B' ? 'وكيل' : 'مندوب'}: ${a.name}`)).join('')}</select></div>
        <div class="field"><label>خصم % ${App.role() === 'OWNER' ? '' : '(يُرفع للمالك)'}</label><input class="input" type="number" min="0" step="0.5" data-live="dd.discountPct" data-num value="${d.discountPct}"></div>
        <div class="field"><label>مهلة التعليق (ساعة)</label><input class="input" type="number" min="2" max="24" data-live="dd.ttl" data-num value="${d.ttl}"></div>
        <div class="field"><label>الفرع</label><select class="input" data-ui="dd.branchId">${s.branches.filter((b) => branchOk(b.id)).map((b) => opt(b.id, d.branchId, b.name)).join('')}</select></div>
        <div class="field"><label>عربون الآن</label><input class="input" type="number" min="0" data-live="dd.deposit" data-num value="${d.deposit}"></div>
        <div class="field"><label>في خزينة/بنك</label><select class="input" data-ui="dd.cashboxId">${s.cashboxes.map((c) => opt(c.id, d.cashboxId, c.name)).join('')}</select></div>
        <div class="field"><label>إيصال العربون</label><button class="btn" data-act="domReceipt">📎 ${d.depositFileIds.length ? d.depositFileIds.length + ' مرفق' : 'إرفاق'}</button></div>
        ${d.agentId && (h.agent(d.agentId) || {}).tier === 'BROKER' && App.role() === 'OWNER' ? `<div class="field"><label>± عمولة المندوب</label><input class="input" type="number" step="50" data-live="dd.commissionAdj" data-num value="${d.commissionAdj}"></div>` : ''}</div>
      <div class="field"><label>ملاحظات</label><input class="input" data-ui="dd.notes" value="${esc(d.notes)}"></div>
    </div><div class="card" style="position:sticky;top:70px;align-self:start"><h3>💵 التسعير</h3><div data-partial="domSummary">${App.partials.domSummary()}</div>
      <button class="btn primary" style="width:100%;margin-top:10px" data-act="domCreate">💾 حفظ الحجز</button></div></div></details>
    <div class="card" style="margin-top:14px"><div class="row"><h3 style="margin:0">📋 الحجوزات (${list.length})</h3><span class="spacer"></span>
      <input class="input" style="width:200px" data-ui="domQ" value="${esc(q)}" placeholder="بحث بالاسم/الكود/الهاتف"><select class="input" style="width:auto" data-ui="domSt">${opt('LIVE', st, 'النشطة')}${Object.entries(E.BOOKING_STATUS).map(([k, x]) => opt(k, st, x.ar)).join('')}${opt('ALL', st, 'الكل')}</select></div>
      <div class="tbl-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>الكود</th><th>العميل</th><th>البرنامج/الفندق</th><th>الأفراد</th><th>الصافي</th><th>المسدد</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${list.map((b) => `<tr class="clickable" data-act="go" data-page="domBookingView" data-id="${b.id}"><td class="num">${esc(b.code)}</td><td>${esc(custName(b))}<div class="small muted num">${esc((b.pax[0] || {}).phone || '')}</div></td><td class="small">${esc(whatFor(b))}</td>
        <td class="num">${paxCount(b)}</td><td>${h.egp(b.net)}</td><td>${h.progress(b.paid, b.net)}</td><td>${h.statusChip(b.status)}${b.pendingPay ? '<div class="chip hold">دفعة بانتظار الاعتماد</div>' : ''}</td><td>›</td></tr>`).join('') || '<tr><td colspan="8" class="muted">لا حجوزات.</td></tr>'}</tbody></table></div></div>`;
  };
  const dd = () => App.ui.dd;
  App.actions.domType = (d) => { dd().type = d.t; App.render(); };
  App.actions.domRoomAdd = () => { dd().rooms.push(blankRoom()); App.render(); };
  App.actions.domRoomDel = (d) => { dd().rooms.splice(Number(d.r), 1); App.render(); };
  App.actions.domChild = (d) => { dd().rooms[Number(d.r)].children.push({ age: 6, bed: false }); App.render(); };
  App.actions.domChildDel = (d) => { dd().rooms[Number(d.r)].children.splice(Number(d.c), 1); App.render(); };
  App.actions.domBed = (d, el) => { dd().rooms[Number(d.r)].children[Number(d.c)].bed = el.checked; App.render(); };
  App.actions.domPaxAdd = () => { dd().pax.push({ name: '', phone: '', nid: '' }); App.render(); };
  App.actions.domReceipt = async () => { const fs = await App.uploadPicked({ accept: 'image/*,application/pdf', multiple: true }); dd().depositFileIds.push(...fs.map((x) => x.id)); App.render(); };
  App.actions.domCreate = () => {
    const s = S(), d = dd(), actor = App.actor();
    if (d.deposit > 0 && App.online && !App.isApprover() && !d.depositFileIds.length) return App.toast('ارفع صورة إيصال العربون', 'err');
    let r;
    try { r = Dom.createBooking(s, { ...draftInput(d), programId: d.type === 'PROGRAM' ? d.programId : null, hotel: d.type === 'HOTEL' ? d.hotel : null, pax: d.pax.filter((x) => x.name.trim()), pickup: d.pickup, ttl: d.ttl, branchId: d.branchId, notes: d.notes, commissionNote: d.commissionNote }, actor); }
    catch (e) { return App.toast('⛔ ' + e.message, 'err'); }
    const b = r.booking;
    if (d.deposit > 0 && b.channel !== 'B2B') {
      const v = Model.createVoucher(s, { type: 'RV', amount: Number(d.deposit), cashboxId: d.cashboxId, party: b.customerId ? { type: 'customer', id: b.customerId } : { type: 'agent', id: b.agentId }, bookingId: b.id, tripId: Dom.costCenter(s, b).id,
        branchId: b.branchId, memo: `عربون حجز ${b.code}`, fileIds: d.depositFileIds }, actor);
      if (App.isApprover()) Model.approve(s, v.id, actor);
    }
    App.audit(`حجز سياحة داخلية ${b.code} (${E.BOOKING_STATUS[b.status].ar}) صافي ${b.net}`);
    App.ui.dd = App.domNewDraft(); App.save();
    App.toast(`✅ ${b.code} — ${E.BOOKING_STATUS[b.status].ar}`); App.actions.go({ page: 'domBookingView', id: b.id });
  };

  // ---------------------------------------------------------------- booking file
  App.pages.domBookingView = () => {
    const s = S(), b = bookingOf(App.ui.viewId);
    if (!b) return '<div class="card">اختر حجزاً.</div>';
    const p = b.programId ? Dom.program(s, b.programId) : null, ht = b.hotel ? Dom.hotel(s, b.hotel.hotelId) : null, o = p && p.kind !== 'DAYTRIP' ? p.hotelOptions[b.optIdx] : null;
    const vs = s.vouchers.filter((v) => v.bookingId === b.id), live = E.LIVE_STATES.includes(b.status), due = E.round2((b.net || 0) - (b.paid || 0));
    const je = s.journal.filter((j) => j.source && j.source.id === b.id);
    return `<div class="page-head"><div><h2>🧾 ${esc(b.code)} ${h.statusChip(b.status)}</h2><p>${esc(whatFor(b))}</p></div><div class="row">
        ${b.status === 'PENDING_APPROVAL' && App.role() === 'OWNER' ? `<button class="btn gold" data-act="domApprove" data-id="${b.id}">اعتماد الخصم</button>` : ''}
        ${live && due > 0 && b.status !== 'PENDING_APPROVAL' ? `<button class="btn primary" data-act="domPay" data-id="${b.id}">💰 سند قبض</button>` : ''}
        <button class="btn gold" data-act="bookingDoc" data-id="${b.id}">📄 وثيقة الحجز</button>
        ${b.kind === 'HOTEL' || o ? `<button class="btn" data-act="domHotelVoucher" data-id="${b.id}">🏨 فوتشر الفندق</button>` : ''}
        <button class="btn" data-act="waBooking" data-id="${b.id}">🟢 واتساب</button>
        ${b.agentId && (h.agent(b.agentId) || {}).tier === 'BROKER' && App.role() === 'OWNER' && live ? `<button class="btn" data-act="commAdjForm" data-id="${b.id}">🏷️ العمولة</button>` : ''}
        ${live ? `<button class="btn danger" data-act="domCancel" data-id="${b.id}">إلغاء</button>` : ''}<button class="btn ghost" data-act="go" data-page="domBooking">↩</button></div></div>
    <div class="grid g4"><div class="card kpi"><div class="lbl">الصافي</div><div class="val">${h.egp(b.net)}</div><div class="hint">${b.discountPct ? `خصم ${b.discountPct}%` : ''}</div></div>
      <div class="card kpi"><div class="lbl">المسدد</div><div class="val ok">${h.egp(b.paid)}</div><div class="hint">${h.progress(b.paid, b.net)}</div></div>
      <div class="card kpi"><div class="lbl">المتبقي</div><div class="val ${due > 0 ? 'danger' : ''}">${h.egp(due)}</div></div>
      <div class="card kpi"><div class="lbl">العميل</div><div class="val" style="font-size:16px">${esc(custName(b))}</div><div class="hint num">${esc((b.pax[0] || {}).phone || '')}</div></div></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>📋 التفاصيل</h3><table class="t small"><tbody>
        ${p ? `<tr><td>البرنامج</td><td>${esc(progLabel(p))}</td></tr><tr><td>التاريخ</td><td>${esc(p.startDate)}${p.endDate !== p.startDate ? ' ← ' + esc(p.endDate) : ''}</td></tr>` : ''}
        ${o ? `<tr><td>الفندق</td><td>${esc(hotelName(o))} — ${esc(Dom.BOARDS[o.board])}</td></tr>` : ''}
        ${ht ? `<tr><td>الفندق</td><td>${esc(ht.name)} (${esc(ht.city)}) — ${esc(Dom.BOARDS[b.hotel.board])}</td></tr><tr><td>الإقامة</td><td>${esc(b.hotel.checkIn)} ← ${esc(b.hotel.checkOut)} (${b.hotel.nights} ليالٍ)</td></tr>
          <tr><td>رقم تأكيد الفندق</td><td><input class="input sm" data-bind="dom.bookings.${s.dom.bookings.indexOf(b)}.hotel.confirmationNo" value="${esc(b.hotel.confirmationNo || '')}" placeholder="سجله بعد تأكيد الفندق"></td></tr>` : ''}
        <tr><td>الغرف</td><td>${b.rooms.map((r) => `${Dom.ROOMS[r.type].ar}: ${r.adults} بالغ${(r.children || []).length ? ` + ${r.children.map((c) => `طفل ${c.age}${c.bed ? ' بسرير' : ''}`).join('، ')}` : ''}`).join('<br>')}</td></tr>
        ${b.pickup ? `<tr><td>التجمع</td><td>${esc(b.pickup)}</td></tr>` : ''}${p && (p.transport || {}).seats ? `<tr><td>المقاعد</td><td>${(b.seats || []).sort((x, y) => x - y).join('، ') || '—'} <button class="btn sm" data-act="domOpsOpen" data-p="${p.id}" data-tab="seats">اختيار</button></td></tr>` : ''}
        <tr><td>القناة</td><td>${b.agentId ? esc((h.agent(b.agentId) || {}).name) + (b.agentCommission ? ` · عمولة ${h.n0(b.agentCommission)}` : '') : 'مباشر — ' + esc(b.createdBy)}</td></tr>
        <tr><td>الأسماء</td><td>${b.pax.map((x) => `${esc(x.name)} <span class="num muted">${esc(x.phone || '')}</span>`).join('<br>')}</td></tr>${b.notes ? `<tr><td>ملاحظات</td><td>${esc(b.notes)}</td></tr>` : ''}</tbody></table></div>
      <div class="card"><h3>💵 التسعير</h3><table class="t small"><tbody>${b.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${h.n0(l.total)}</td></tr>`).join('')}<tr><td><b>الصافي</b></td><td><b>${h.n0(b.net)}</b></td></tr>
        ${App.isApprover() ? `<tr><td class="muted">التكلفة التقديرية</td><td class="muted">${h.n0(b.cost)}</td></tr>` : ''}</tbody></table>
        <h4 style="margin:12px 0 4px">السندات</h4>${vs.map((v) => `<div class="task-row"><span>${esc(v.no)} · ${h.egp(v.amount)} ${h.vStatus(v.status)}</span><button class="btn sm ghost" data-act="vPrint" data-id="${v.id}">🖨️</button></div>`).join('') || '<div class="muted small">لا سندات.</div>'}
        ${App.isApprover() && je.length ? `<h4 style="margin:12px 0 4px">القيود</h4>${je.map((j) => `<div class="small muted">${esc(j.no)} · ${esc(j.memo)}</div>`).join('')}` : ''}</div></div>`;
  };
  App.actions.domApprove = (d) => {
    const s = S(), b = bookingOf(d.id);
    if (App.role() !== 'OWNER') return App.toast('اعتماد الخصم لمالك النظام فقط', 'err');
    b.status = 'SOFT_HOLD'; b.approvedBy = App.actor().name; b.holdUntil = Date.now() + 24 * 3600000; E.applyPayment(b, 0);
    Acc.syncBooking(s, Dom.costCenter(s, b), b, App.actor().name); done(`اعتماد خصم ${b.code}`);
  };
  App.actions.domPay = (d) => { const s = S(), b = bookingOf(d.id); App.openVoucher({ type: 'RV', party: b.customerId ? { type: 'customer', id: b.customerId } : { type: 'agent', id: b.agentId }, amount: E.round2(b.net - b.paid), bookingId: b.id, tripId: Dom.costCenter(s, b).id, branchId: b.branchId, memo: `سداد حجز ${b.code}`, lockParty: true }); };
  App.actions.domCancel = (d) => { const b = bookingOf(d.id); if (!confirm(`إلغاء ${b.code}؟ سيُعكس الإيراد، والمبالغ المسددة تُرد بسند صرف.`)) return; Dom.cancelBooking(S(), b, App.actor().name); done(`إلغاء ${b.code}`); };
  App.actions.domHotelVoucher = (d) => {
    const s = S(), b = bookingOf(d.id), p = b.programId ? Dom.program(s, b.programId) : null, o = p ? p.hotelOptions[b.optIdx] : null, ht = b.hotel ? Dom.hotel(s, b.hotel.hotelId) : null;
    const name = ht ? ht.name : hotelName(o), cin = b.hotel ? b.hotel.checkIn : p.startDate, cout = b.hotel ? b.hotel.checkOut : p.endDate, board = b.hotel ? b.hotel.board : o.board;
    App.printDoc('Hotel voucher ' + b.code, `<div class="head"><div><h1>فوتشر إقامة — Hotel Voucher</h1><div class="muted">يُقدم لمكتب الاستقبال عند الوصول</div></div><div>رقم: <b>${esc(b.code)}</b><br>${b.hotel && b.hotel.confirmationNo ? `تأكيد الفندق: <b>${esc(b.hotel.confirmationNo)}</b>` : ''}</div></div>
      <table><tr><th>الفندق</th><td>${esc(name)}</td><th>نظام الإقامة</th><td>${esc(board)} — ${esc(Dom.BOARDS[board])}</td></tr><tr><th>الوصول</th><td>${esc(cin)}</td><th>المغادرة</th><td>${esc(cout)} (${Dom.nights(cin, cout)} ليالٍ)</td></tr>
      <tr><th>النزيل</th><td>${esc(custName(b))}</td><th>الهاتف</th><td class="ltr">${esc((b.pax[0] || {}).phone || '')}</td></tr></table>
      <table style="margin-top:8px"><tr><th>#</th><th>نوع الغرفة</th><th>البالغين</th><th>الأطفال</th></tr>${b.rooms.map((r, i) => `<tr><td>${i + 1}</td><td>${Dom.ROOMS[r.type].ar}</td><td>${r.adults}</td><td>${(r.children || []).map((c) => `${c.age} سنة${c.bed ? ' (سرير إضافي)' : ''}`).join('، ') || '—'}</td></tr>`).join('')}</table>
      <p>الأسماء: ${b.pax.map((x) => esc(x.name)).join('، ')}</p><p class="muted">الخدمات مدفوعة بالكامل لحساب الشركة — أي خدمات إضافية على حساب النزيل.</p><div class="sign"><div>ختم الشركة ................</div><div>استلام الفندق ................</div></div>`);
  };

  // ================================================================ HOTELS & CONTRACT RATES
  App.pages.domHotels = () => {
    const s = S();
    return `<div class="page-head"><div><h2>🏨 الفنادق والقرى وأسعار التعاقد</h2><p>تكويد الفنادق وربطها بالمورد · أسعار الليلة لكل موسم ونوع غرفة ونظام إقامة (تكلفة وبيع، ونهاية الأسبوع) · سياسة الأطفال</p></div><button class="btn primary" data-act="domHotelForm">+ فندق</button></div>
    ${s.dom.hotels.map((x, hi) => `<div class="card" style="margin-bottom:12px"><div class="row"><h3 style="margin:0">${esc(x.code)} · ${esc(x.name)} ${'★'.repeat(x.stars || 0)}</h3><span class="chip">${esc(x.city)}</span><span class="small muted">المورد: ${esc(h.supplier(x.supplierId).name)}</span><span class="spacer"></span>
      <button class="btn sm" data-act="domRateAdd" data-h="${x.id}">+ سعر موسم</button><button class="btn sm ghost" data-act="domHotelForm" data-id="${x.id}">✏️</button></div>
      <div class="tbl-wrap" style="margin-top:8px"><table class="t small"><thead><tr><th>من</th><th>إلى</th><th>الغرفة</th><th>النظام</th><th>تكلفة الليلة</th><th>بيع الليلة</th><th>تكلفة نهاية الأسبوع</th><th>بيع نهاية الأسبوع</th><th>الهامش</th><th></th></tr></thead><tbody>
      ${(x.rates || []).map((r, ri) => `<tr><td><input class="input sm" type="date" data-bind="dom.hotels.${hi}.rates.${ri}.from" value="${r.from}"></td><td><input class="input sm" type="date" data-bind="dom.hotels.${hi}.rates.${ri}.to" value="${r.to}"></td>
        <td><select class="input sm" data-bind="dom.hotels.${hi}.rates.${ri}.roomType">${Object.entries(Dom.ROOMS).map(([k, y]) => opt(k, r.roomType, y.ar)).join('')}</select></td>
        <td><select class="input sm" data-bind="dom.hotels.${hi}.rates.${ri}.board">${Object.keys(Dom.BOARDS).map((k) => opt(k, r.board, k)).join('')}</select></td>
        ${['cost', 'price', 'weekendCost', 'weekendPrice'].map((k) => `<td><input class="input sm num" style="width:90px" type="number" data-bind="dom.hotels.${hi}.rates.${ri}.${k}" value="${r[k] ?? ''}"></td>`).join('')}
        <td class="${r.price - r.cost < 0 ? 'danger' : 'ok'}">${h.n0(r.price - r.cost)}</td><td><button class="btn sm ghost" data-act="domRateDel" data-h="${x.id}" data-i="${ri}">🗑️</button></td></tr>`).join('') || '<tr><td colspan="10" class="muted">لا أسعار — أضف أسعار الموسم من عقد الفندق.</td></tr>'}</tbody></table></div>
      <div class="small muted" style="margin-top:4px">نهاية الأسبوع = ليالي الخميس والجمعة · الطفل أقل من ${x.childPolicy.infantMax} سنة مجاناً، وأقل من ${x.childPolicy.childMax} سنة بسرير إضافي ${x.childPolicy.childBedPct}% من سعر الفرد.</div></div>`).join('') || '<div class="card muted">لا فنادق.</div>'}`;
  };
  App.actions.domHotelForm = (d) => {
    const s = S(), x = d.id ? Dom.hotel(s, d.id) : { stars: 4, city: 'شرم الشيخ', childPolicy: { infantMax: 2, childMax: 12, childBedPct: 50 } };
    App.modal(`<h3>${d.id ? 'تعديل' : 'فندق جديد'}</h3><div class="grid g3">${field('dh-name', 'اسم الفندق/القرية', x.name)}
      <div class="field"><label>المدينة</label><input class="input" id="dh-city" list="dom-cities2" value="${esc(x.city)}"><datalist id="dom-cities2">${Dom.CITIES.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
      ${field('dh-stars', 'النجوم', x.stars, 'type="number" min="1" max="5"')}
      <div class="field"><label>المورد (للفواتير والسداد)</label><select class="input" id="dh-sup">${opt('', x.supplierId, '+ إنشاء مورد بنفس الاسم')}${s.suppliers.map((y) => opt(y.id, x.supplierId, `${y.code || ''} · ${y.name}`)).join('')}</select></div>
      ${field('dh-phone', 'هاتف الحجوزات', x.phone, 'style="direction:ltr"')}${field('dh-release', 'مهلة الإلغاء المجاني (يوم قبل الوصول)', x.releaseDays, 'type="number"')}
      ${field('dh-inf', 'رضيع أقل من (سنة)', x.childPolicy.infantMax, 'type="number"')}${field('dh-chd', 'طفل أقل من (سنة)', x.childPolicy.childMax, 'type="number"')}${field('dh-bed', 'السرير الإضافي % من سعر الفرد', x.childPolicy.childBedPct, 'type="number"')}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="domHotelSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
  };
  App.actions.domHotelSave = (d) => {
    const s = S(), name = String(App.val('dh-name')).trim(); if (name.length < 2) return App.toast('اكتب الاسم', 'err');
    const x = d.id ? Dom.hotel(s, d.id) : { id: Dom.uid('HT'), code: Acc.nextNo(s, 'C_DHT', 'DHT', 3), rates: [] };
    let sup = App.val('dh-sup');
    if (!sup) { const y = { id: 'S' + Date.now().toString(36), code: Model.nextCode(s, 'SUP', 'SUP'), name, category: 'HOTEL', currency: 'EGP', phone: App.val('dh-phone'), taxNo: '' }; s.suppliers.push(y); sup = y.id; }
    Object.assign(x, { name, city: App.val('dh-city'), stars: Number(App.val('dh-stars')) || 0, supplierId: sup, phone: App.val('dh-phone'), releaseDays: Number(App.val('dh-release')) || 0,
      childPolicy: { infantMax: Number(App.val('dh-inf')) || 2, childMax: Number(App.val('dh-chd')) || 12, childBedPct: Number(App.val('dh-bed')) || 50 } });
    if (!d.id) s.dom.hotels.push(x);
    done(`${d.id ? 'تعديل' : 'إضافة'} فندق ${x.code}`);
  };
  App.actions.domRateAdd = (d) => { const x = Dom.hotel(S(), d.h); x.rates.push({ id: Dom.uid('RT'), from: today(), to: E.iso(E.addDays(today(), 90)), roomType: 'DBL', board: 'BB', cost: 0, price: 0, weekendCost: null, weekendPrice: null }); done(); };
  App.actions.domRateDel = (d) => { const x = Dom.hotel(S(), d.h); x.rates.splice(Number(d.i), 1); done(); };

  // ================================================================ OPERATIONS
  App.actions.domOpsOpen = (d) => { App.ui.domOpsP = d.p; App.ui.domOpsTab = d.tab || App.ui.domOpsTab || 'manifest'; App.actions.go({ page: 'domOps' }); };
  App.pages.domOps = () => {
    const s = S(), progs = s.dom.programs.filter((p) => p.status === 'OPEN' || p.id === App.ui.domOpsP);
    const p = Dom.program(s, App.ui.domOpsP) || progs[0];
    if (!p) return '<div class="card muted">لا برامج.</div>';
    App.ui.domOpsP = p.id;
    const tab = App.ui.domOpsTab || 'manifest', bk = s.dom.bookings.filter((b) => b.programId === p.id && E.LIVE_STATES.includes(b.status));
    let body = '';
    if (tab === 'manifest') {
      body = `<div class="tbl-wrap" id="domMan"><table class="t"><thead><tr><th>#</th><th>الحجز</th><th>صاحب الحجز</th><th>الهاتف</th><th>الأفراد</th><th>الفندق/الغرف</th><th>التجمع</th><th>المقاعد</th><th>الإضافات</th><th>المتبقي</th></tr></thead><tbody>
        ${bk.map((b, i) => `<tr><td>${i + 1}</td><td class="num">${esc(b.code)}</td><td>${esc(custName(b))}</td><td class="num">${esc((b.pax[0] || {}).phone || '')}</td><td class="num">${b.units.adults}+${b.units.chd}+${b.units.inf}</td>
          <td class="small">${p.kind === 'DAYTRIP' ? '—' : esc(hotelName(p.hotelOptions[b.optIdx] || {})) + '<br>' + b.rooms.map((r) => Dom.ROOMS[r.type].ar).join('، ')}</td><td class="small">${esc(b.pickup || '')}</td><td class="num">${(b.seats || []).join('، ')}</td>
          <td class="small">${Object.entries(b.extras || {}).filter(([, q]) => q > 0).map(([id, q]) => `${esc(((p.extras || []).find((x) => x.id === id) || {}).name || '')} ×${q}`).join('، ')}</td><td class="${b.net - b.paid > 0 ? 'danger' : 'ok'}">${h.n0(b.net - b.paid)}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">لا حجوزات.</td></tr>'}</tbody></table></div>`;
    } else if (tab === 'rooming') {
      body = (p.hotelOptions || []).map((o, oi) => { const rs = bk.filter((b) => b.optIdx === oi); return `<h4>🏨 ${esc(hotelName(o))} — ${esc(Dom.BOARDS[o.board])} (${rs.reduce((x, b) => x + b.rooms.length, 0)} غرفة)</h4>
        <table class="t small"><thead><tr><th>#</th><th>نوع الغرفة</th><th>النزلاء</th><th>الأطفال</th><th>الحجز</th><th>الهاتف</th></tr></thead><tbody>${rs.flatMap((b) => b.rooms.map((r) => ({ b, r }))).map(({ b, r }, i) => `<tr><td>${i + 1}</td><td>${Dom.ROOMS[r.type].ar}</td><td>${esc(custName(b))} (${r.adults})</td><td>${(r.children || []).map((c) => `${c.age}${c.bed ? ' بسرير' : ''}`).join('، ') || '—'}</td><td class="num">${esc(b.code)}</td><td class="num">${esc((b.pax[0] || {}).phone || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">—</td></tr>'}</tbody></table>`; }).join('') || '<div class="muted">رحلة يوم واحد — لا تسكين.</div>';
    } else if (tab === 'seats') {
      const m = Dom.seatMap(s, p), sel = bookingOf(App.ui.domSeatB);
      body = !m.total ? '<div class="muted">حدد عدد مقاعد الأتوبيس في إعدادات البرنامج.</div>' : `<div class="row" style="margin-bottom:8px"><label>الحجز:</label><select class="input" style="width:auto" data-ui="domSeatB">${opt('', App.ui.domSeatB, '— اختر حجزاً ثم اضغط المقاعد —')}${bk.map((b) => opt(b.id, App.ui.domSeatB, `${b.code} · ${custName(b)} (${b.units.adults + b.units.chd} مقعد، محدد ${(b.seats || []).length})`)).join('')}</select></div>
        <div class="dom-bus">${Array.from({ length: m.total }, (_, i) => i + 1).map((n) => { const t = m.taken[n]; return `<button class="seat ${t ? (sel && t.id === sel.id ? 'mine' : 'taken') : 'free'}" data-act="domSeat" data-n="${n}" title="${t ? esc(t.code + ' · ' + custName(t)) : 'متاح'}">${n}${t ? `<small>${esc(custName(t).split(' ')[0])}</small>` : ''}</button>`; }).join('')}</div>
        <div class="small muted" style="margin-top:6px">${Object.keys(m.taken).length} محجوز من ${m.total} · اضغط مقعداً محجوزاً لنفس الحجز لإلغائه</div>`;
    } else if (tab === 'wa') {
      const msg = App.ui.domWaMsg ?? `السلام عليكم {الاسم}\nتذكير برحلة ${p.name} يوم ${p.startDate}${(p.pickups || [])[0] ? `\nالتجمع: {التجمع}` : ''}\nالمتبقي عليكم: {المتبقي} ج.م\n${S().company.name}`;
      body = `<div class="field"><label>نص الرسالة ({الاسم} {التجمع} {المتبقي} {الكود})</label><textarea class="input" rows="5" data-ui="domWaMsg">${esc(msg)}</textarea></div>
        <div class="row" style="margin:8px 0"><button class="btn primary" data-act="waBulk" data-scope="domProgram" data-p="${p.id}">📤 إرسال للجميع (${bk.length})</button><span class="small muted">عبر واتساب بيزنس لو مفعّل من الإعدادات، وإلا روابط يدوية</span></div>
        <div class="stack">${bk.map((b) => { const t = msg.replace(/{الاسم}/g, custName(b)).replace(/{التجمع}/g, b.pickup || '').replace(/{المتبقي}/g, h.n0(b.net - b.paid)).replace(/{الكود}/g, b.code); return `<div class="task-row"><span>${esc(custName(b))} <span class="num muted">${esc((b.pax[0] || {}).phone || '')}</span></span><a class="btn sm" target="_blank" rel="noopener" href="${E.waLink((b.pax[0] || {}).phone || '', t)}">🟢 فتح</a></div>`; }).join('')}</div>`;
    }
    const pl = Dom.programPnl(s, p);
    return `<div class="page-head"><div><h2>🧾 تشغيل البرنامج</h2><p>كشف الركاب ونقاط التجمع · كشف التسكين لكل فندق · مقاعد الأتوبيس · رسائل واتساب جماعية</p></div>
      <div class="row"><select class="input" data-ui="domOpsP">${progs.map((x) => opt(x.id, p.id, `${progLabel(x)} — ${x.startDate}`)).join('')}</select><button class="btn gold" data-act="domOpsPrint">🖨️ طباعة</button></div></div>
    <div class="grid g4"><div class="card kpi"><div class="lbl">الحجوزات</div><div class="val">${pl.bookings}</div></div><div class="card kpi"><div class="lbl">الأفراد</div><div class="val">${pl.pax}</div><div class="hint">الطاقة ${p.capacity || '—'}</div></div>
      <div class="card kpi"><div class="lbl">المحصل / المتبقي</div><div class="val ok" style="font-size:18px">${h.n0(pl.collected)}</div><div class="hint danger">${h.n0(pl.due)} متبقي</div></div><div class="card kpi"><div class="lbl">المشرف</div><div class="val" style="font-size:16px">${esc(p.supervisor || '—')}</div></div></div>
    <div class="tabs" style="margin-top:14px">${[['manifest', '👥 كشف الركاب'], ['rooming', '🛏️ كشف التسكين'], ['seats', '💺 مقاعد الأتوبيس'], ['wa', '🟢 رسائل جماعية']].map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-act="domOpsTab" data-t="${k}">${l}</button>`).join('')}</div>
    <div class="card" id="domOpsBody">${body}</div>`;
  };
  App.actions.domOpsTab = (d) => { App.ui.domOpsTab = d.t; App.render(); };
  App.actions.domSeat = (d) => {
    const b = bookingOf(App.ui.domSeatB); if (!b) return App.toast('اختر الحجز أولاً', 'err');
    try { Dom.toggleSeat(S(), b, Number(d.n)); App.save(); App.render(); } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.domOpsPrint = () => { const p = Dom.program(S(), App.ui.domOpsP), el = document.getElementById('domOpsBody'); App.printDoc(p.name, `<div class="head"><div><h2>${esc(p.name)}</h2><div class="muted">${esc(p.code)} · ${esc(p.startDate)}</div></div></div>${el ? el.innerHTML.replace(/<button[^>]*>.*?<\/button>/g, '').replace(/<select[\s\S]*?<\/select>/g, '') : ''}`, true); };

  // ================================================================ PROFITABILITY
  App.pages.domPnl = () => {
    const s = S(), rows = s.dom.programs.map((p) => ({ p, r: Dom.programPnl(s, p) }));
    const hotelsOnly = s.dom.bookings.filter((b) => b.kind === 'HOTEL' && E.LIVE_STATES.includes(b.status));
    const hn = E.round2(hotelsOnly.reduce((x, b) => x + b.net, 0)), hc = E.round2(hotelsOnly.reduce((x, b) => x + b.cost, 0));
    const sum = (k) => rows.reduce((x, y) => x + y.r[k], 0);
    return `<div class="page-head"><div><h2>📈 ربحية السياحة الداخلية</h2><p>لكل برنامج: الإيراد (بدون الضرائب) − التكلفة (المرحّلة من فواتير الموردين على مركز تكلفة البرنامج، أو التقديرية من الأسعار) − عمولات المناديب</p></div></div>
    <div class="grid g4"><div class="card kpi"><div class="lbl">إيراد البرامج</div><div class="val">${h.egp(sum('revenue'))}</div></div><div class="card kpi"><div class="lbl">عمولات</div><div class="val">${h.egp(sum('commissions'))}</div></div>
      <div class="card kpi"><div class="lbl">صافي ربح البرامج</div><div class="val ${sum('profit') < 0 ? 'danger' : 'gold'}">${h.egp(sum('profit'))}</div></div><div class="card kpi"><div class="lbl">حجوزات الفنادق: هامش</div><div class="val">${h.egp(hn - hc)}</div><div class="hint">${hotelsOnly.length} حجز · بيع ${h.n0(hn)}</div></div></div>
    <div class="card" style="margin-top:14px"><div class="tbl-wrap"><table class="t"><thead><tr><th>البرنامج</th><th>التاريخ</th><th>الأفراد</th><th>الإيراد</th><th>التكلفة</th><th>العمولات</th><th>الربح</th><th>هامش</th><th>المحصل</th><th>المتبقي</th><th></th></tr></thead><tbody>
      ${rows.map(({ p, r }) => `<tr><td><b>${esc(progLabel(p))}</b></td><td class="num">${esc(p.startDate)}</td><td class="num">${r.pax}</td><td>${h.n0(r.revenue)}</td><td>${h.n0(r.postedCost || r.estCost)} <span class="faint small">${r.costSource}</span></td><td>${h.n0(r.commissions)}</td>
        <td class="${r.profit < 0 ? 'danger' : 'ok'}"><b>${h.n0(r.profit)}</b></td><td>${r.revenue ? Math.round((r.profit / r.revenue) * 100) + '%' : '—'}</td><td>${h.n0(r.collected)}</td><td class="${r.due > 0 ? 'danger' : ''}">${h.n0(r.due)}</td>
        <td><button class="btn sm" data-act="domBill" data-p="${p.id}">🧾 فاتورة مورد</button></td></tr>`).join('')}</tbody></table></div>
      <div class="small muted" style="margin-top:6px">سجّل فواتير الفنادق والأتوبيس على البرنامج (زر فاتورة مورد) لتصبح التكلفة فعلية مرحّلة على حساب 5106 بدلاً من التقديرية.</div></div>`;
  };
  App.actions.domBill = (d) => { const p = Dom.program(S(), d.p); App.openVoucher({ type: 'BILL', tripId: p.id, accountCode: '5106', memo: `فاتورة ${p.code} ${p.name}` }); };
})();
