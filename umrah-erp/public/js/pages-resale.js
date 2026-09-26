/* أفواج — Purchasing: complete programs bought from other companies and resold (buy terms, bookings, seller invoices & payments, profit). */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, R = window.Resale, h = App.h, esc = h.esc, opt = h.opt;
  const S = () => App.S;
  const admin = () => ['OWNER', 'MANAGER'].includes(App.role());
  const done = (msg) => { if (msg) App.audit(msg); App.closeModal(); App.save(); App.render(); };
  const field = (id, label, val, extra = '') => `<div class="field"><label>${label}</label><input class="input" id="${id}" value="${esc(val ?? '')}" ${extra}></div>`;
  const sup = (id) => S().suppliers.find((x) => x.id === id) || { name: '—' };
  const money = (n) => `<b class="num ${n < 0 ? 'danger' : ''}">${h.n0(n)}</b>`;

  // ================================================================ list
  App.pages.resale = () => {
    const s = S(), f = App.ui.rsFilter || 'OPEN';
    const list = s.resale.programs.filter((p) => f === 'ALL' || (p.status || 'OPEN') === f);
    const all = list.map((p) => ({ p, r: R.pnl(s, p) }));
    const sum = (k) => all.reduce((x, y) => x + (y.r[k] || 0), 0);
    return `<div class="page-head"><div><h2>🤝 برامج مشتراة من شركات أخرى</h2><p>تشتري برنامج كامل (عمرة / حج / سياحة) من شركة تانية وتبيعه باسمك — والنظام يحسب المكسب: الإيراد − تكلفة الشراء − العمولات، والمقاعد غير المباعة في البلوك</p></div>
      <div class="row"><select class="input" data-ui="rsFilter">${opt('OPEN', f, 'مفتوحة للبيع')}${opt('CLOSED', f, 'مغلقة')}${opt('ALL', f, 'الكل')}</select>${admin() ? '<button class="btn primary" data-act="rsForm">+ شراء برنامج</button>' : ''}</div></div>
    <div class="grid g4"><div class="card kpi"><div class="lbl">مبيعات البرامج المشتراة</div><div class="val">${h.egp(sum('gross'))}</div></div>
      <div class="card kpi"><div class="lbl">تكلفة الشراء</div><div class="val">${h.egp(sum('costBasis'))}</div></div>
      <div class="card kpi"><div class="lbl">صافي المكسب</div><div class="val ${sum('profit') < 0 ? 'danger' : 'gold'}">${h.egp(sum('profit'))}</div></div>
      <div class="card kpi"><div class="lbl">مستحق للشركات البائعة</div><div class="val ${sum('owedSeller') > 0 ? 'danger' : ''}">${h.egp(sum('owedSeller'))}</div></div></div>
    <div class="emp-grid" style="margin-top:14px">${all.map(({ p, r }) => { const seats = r.rows.reduce((x, y) => x + (y.seats - y.returned), 0);
      return `<div class="card clickable rs-card" data-act="go" data-page="resaleView" data-id="${p.id}">
        <div class="row"><span class="chip">${esc(R.DOMAIN_AR[p.domain] || p.domain)}</span><span class="chip ${p.mode === 'BLOCK' ? 'gold' : ''}">${p.mode === 'BLOCK' ? 'بلوك' : 'حسب الطلب'}</span>${p.status === 'CLOSED' ? '<span class="chip">مغلق</span>' : ''}<span class="spacer"></span><span class="faint small num">${esc(p.code)}</span></div>
        <b style="display:block;margin-top:6px">${esc(p.name)}</b><div class="small muted">من: ${esc(sup(p.supplierId).name)} · ${esc(p.startDate || '')}</div>
        ${p.mode === 'BLOCK' ? `<div style="margin-top:8px">${h.progress(r.sold, seats || 1)}</div><div class="small muted">مباع ${r.sold} من ${seats} مقعد${r.breakEven != null ? ` · التعادل عند ${r.breakEven}` : ''}</div>` : `<div class="small muted" style="margin-top:8px">مباع ${r.sold} فرد</div>`}
        <div class="row" style="justify-content:space-between;margin-top:8px"><span class="small">المكسب</span>${money(r.profit)}</div>
        ${r.releaseSoon ? `<div class="chip hold" style="margin-top:6px">⏱️ آخر موعد لإرجاع المقاعد ${esc(p.releaseDate)}</div>` : ''}</div>`; }).join('') || '<div class="card muted">لا توجد برامج مشتراة. اضغط "شراء برنامج" لتسجيل برنامج اشتريته من شركة أخرى.</div>'}</div>`;
  };

  // ================================================================ buy / edit program
  App.actions.rsForm = (d) => {
    if (!admin()) return App.toast('شراء البرامج وتحديد التكلفة والأسعار من صلاحية المالك أو مدير التشغيل', 'err');
    const s = S(), p = d.id ? R.program(s, d.id) : { domain: App.domain ? App.domain() : 'UMRAH', mode: 'BLOCK', currency: 'EGP', fx: s.fx.current, status: 'OPEN', commissions: { default: 0 }, rows: [{ id: 'R1', label: 'غرفة رباعية', seats: 10, cost: '', price: '' }, { id: 'R2', label: 'غرفة ثلاثية', seats: 0, cost: '', price: '' }, { id: 'R3', label: 'غرفة ثنائية', seats: 0, cost: '', price: '' }] };
    App.ui.rsRows = JSON.parse(JSON.stringify(p.rows));
    App.modal(`<h3>${d.id ? '✏️ تعديل' : '🛒 شراء'} برنامج من شركة أخرى ${p.code ? `<span class="chip">${esc(p.code)}</span>` : ''}</h3><div class="grid g3">
      <div class="field"><label>النشاط</label><select class="input" id="rs-dom">${Object.entries(R.DOMAIN_AR).map(([k, v]) => opt(k, p.domain, v)).join('')}</select></div>
      ${field('rs-name', 'اسم البرنامج (كما ستبيعه)', p.name)}
      <div class="field"><label>الشركة البائعة</label><div class="row" style="gap:4px;flex-wrap:nowrap"><select class="input" id="rs-sup">${s.suppliers.map((x) => opt(x.id, p.supplierId, x.name)).join('')}</select><button class="btn sm" data-act="rsNewSup" title="شركة جديدة">+</button></div></div>
      ${field('rs-ref', 'كود البرنامج عند الشركة البائعة', p.supplierRef)}${field('rs-start', 'تاريخ البداية', p.startDate, 'type="date"')}${field('rs-end', 'تاريخ النهاية', p.endDate, 'type="date"')}
      <div class="field"><label>طريقة الشراء</label><select class="input" id="rs-mode">${Object.entries(R.MODES).map(([k, v]) => opt(k, p.mode, v)).join('')}</select></div>
      ${field('rs-rel', 'آخر موعد لإرجاع المقاعد غير المباعة (للبلوك)', p.releaseDate, 'type="date"')}
      <div class="field"><label>عملة الشراء</label><select class="input" id="rs-cur">${opt('EGP', p.currency, 'جنيه')}${opt('SAR', p.currency, 'ريال (بسعر مثبت)')}</select></div>
      ${field('rs-fx', 'سعر الريال المثبت (لو الشراء بالريال)', p.fx, 'type="number" step="0.01"')}${field('rs-comm', 'عمولة المندوب لكل فرد (ج.م)', (p.commissions || {}).default, 'type="number"')}${field('rs-dest', 'الوجهة والفنادق', p.destination)}</div>
      ${field('rs-inc', 'يشمل', p.includes)}
      <h4 style="margin:12px 0 6px">الفئات: التكلفة عليك وسعر بيعك</h4><div id="rsRows">${rowsHtml(p.currency)}</div>
      <button class="btn sm" data-act="rsAddRow">+ فئة</button>
      <div class="small muted" style="margin-top:6px">البلوك: اكتب عدد المقاعد اللي اشتريتها — المقاعد غير المباعة تُحسب خسارة لحد ما ترجعها للشركة قبل آخر موعد. حسب الطلب: سيب عدد المقاعد 0 (أو حد الشركة البائعة).</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="rsSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
  };
  const rowsHtml = (cur) => `<div class="tbl-wrap"><table class="t"><thead><tr><th>الفئة</th><th>عدد المقاعد</th><th>التكلفة للفرد (${cur === 'SAR' ? 'ريال' : 'ج.م'})</th><th>سعر بيعك للفرد (ج.م)</th><th></th></tr></thead><tbody>
    ${App.ui.rsRows.map((r, i) => `<tr><td><input class="input rs-r" data-i="${i}" data-k="label" value="${esc(r.label)}"></td><td><input class="input rs-r" data-i="${i}" data-k="seats" type="number" min="0" value="${esc(r.seats)}"></td>
      <td><input class="input rs-r" data-i="${i}" data-k="cost" type="number" value="${esc(r.cost)}"></td><td><input class="input rs-r" data-i="${i}" data-k="price" type="number" value="${esc(r.price)}"></td>
      <td>${App.ui.rsRows.length > 1 ? `<button class="btn sm ghost" data-act="rsDelRow" data-i="${i}">✕</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  const readRows = () => document.querySelectorAll('.rs-r').forEach((el) => { App.ui.rsRows[el.dataset.i][el.dataset.k] = el.dataset.k === 'label' ? el.value : el.value === '' ? '' : Number(el.value); });
  App.actions.rsAddRow = () => { readRows(); App.ui.rsRows.push({ id: 'R' + Date.now().toString(36), label: '', seats: 0, cost: '', price: '' }); document.getElementById('rsRows').innerHTML = rowsHtml(App.val('rs-cur')); };
  App.actions.rsDelRow = (d) => { readRows(); App.ui.rsRows.splice(Number(d.i), 1); document.getElementById('rsRows').innerHTML = rowsHtml(App.val('rs-cur')); };
  App.actions.rsNewSup = () => {
    const name = prompt('اسم الشركة البائعة:'); if (!name || !name.trim()) return;
    const s = S(), x = { id: 'S' + Date.now().toString(36), code: Model.nextCode(s, 'SUP', 'SUP'), name: name.trim(), category: 'WHOLESALER', currency: 'EGP', phone: '', taxNo: '' };
    s.suppliers.push(x); App.audit(`إضافة مورد ${x.code} ${x.name}`);
    const sel = document.getElementById('rs-sup'); sel.insertAdjacentHTML('beforeend', opt(x.id, x.id, x.name)); sel.value = x.id;
  };
  App.actions.rsSave = (d) => {
    readRows();
    const s = S(), name = String(App.val('rs-name')).trim();
    if (name.length < 3) return App.toast('اكتب اسم البرنامج', 'err');
    const rows = App.ui.rsRows.filter((r) => String(r.label).trim()).map((r, i) => ({ id: r.id || 'R' + (i + 1), label: String(r.label).trim(), seats: Number(r.seats) || 0, cost: Number(r.cost) || 0, price: Number(r.price) || 0, returned: Number(r.returned) || 0 }));
    if (!rows.length || rows.some((r) => !(r.price > 0) || !(r.cost > 0))) return App.toast('اكتب التكلفة وسعر البيع لكل فئة', 'err');
    const cur = App.val('rs-cur'), fx = Number(App.val('rs-fx')) || 0;
    if (cur === 'SAR' && !(fx > 0)) return App.toast('اكتب سعر الريال المثبت', 'err');
    const loss = rows.filter((r) => r.price < r.cost * (cur === 'SAR' ? fx : 1));
    if (loss.length && !confirm(`سعر البيع أقل من التكلفة في: ${loss.map((r) => r.label).join('، ')} — متابعة؟`)) return;
    const p = d.id ? R.program(s, d.id) : { id: R.uid('RP'), code: Model.nextCode(s, 'RSP', 'RSP'), status: 'OPEN', branchId: 'BR1', createdAt: Date.now() };
    Object.assign(p, { domain: App.val('rs-dom'), name, supplierId: App.val('rs-sup'), supplierRef: App.val('rs-ref'), startDate: App.val('rs-start'), endDate: App.val('rs-end'), mode: App.val('rs-mode'),
      releaseDate: App.val('rs-rel') || null, currency: cur, fx: cur === 'SAR' ? fx : 1, commissions: { ...(p.commissions || {}), default: Number(App.val('rs-comm')) || 0 }, destination: App.val('rs-dest'), includes: App.val('rs-inc'), rows });
    if (!d.id) s.resale.programs.push(p);
    done(`${d.id ? 'تعديل' : 'شراء'} برنامج ${p.code} ${p.name} من ${sup(p.supplierId).name}`);
    if (!d.id) App.actions.go({ page: 'resaleView', id: p.id });
  };

  // ================================================================ program view
  App.pages.resaleView = () => {
    const s = S(), p = R.program(s, App.ui.viewId);
    if (!p) return '<div class="card">اختر برنامجاً. <button class="btn sm" data-act="go" data-page="resale">رجوع</button></div>';
    const r = R.pnl(s, p), bks = s.resale.bookings.filter((b) => b.programId === p.id).slice().reverse();
    return `<div class="page-head"><div><h2>🤝 ${esc(p.name)} <span class="chip">${esc(p.code)}</span></h2>
        <p>${esc(R.DOMAIN_AR[p.domain] || '')} · من <b>${esc(sup(p.supplierId).name)}</b>${p.supplierRef ? ` (${esc(p.supplierRef)})` : ''} · ${esc(p.startDate || '')}${p.endDate ? ' ← ' + esc(p.endDate) : ''} · ${esc(R.MODES[p.mode])}${p.currency === 'SAR' ? ` · بالريال على ${p.fx}` : ''}</p></div>
      <div class="row"><button class="btn" data-act="go" data-page="resale">→ كل البرامج</button>${p.status !== 'CLOSED' ? '<button class="btn primary" data-act="rsBook" data-p="' + p.id + '">+ حجز</button>' : ''}
        ${admin() ? `<button class="btn" data-act="rsForm" data-id="${p.id}">✏️ الشروط والأسعار</button>${p.mode === 'BLOCK' ? `<button class="btn" data-act="rsReturn" data-p="${p.id}">↩️ إرجاع مقاعد</button>` : ''}<button class="btn ghost" data-act="rsToggle" data-p="${p.id}">${p.status === 'CLOSED' ? 'إعادة فتح' : 'إغلاق البيع'}</button>` : ''}</div></div>
    <div class="grid g4"><div class="card kpi"><div class="lbl">الإيراد (بدون ضرائب)</div><div class="val">${h.egp(r.revenue)}</div><div class="small muted">${r.sold} فرد · ${r.bookings} حجز</div></div>
      <div class="card kpi"><div class="lbl">تكلفة الشراء</div><div class="val">${h.egp(r.costBasis)}</div><div class="small muted">${esc(r.costSource)}</div></div>
      <div class="card kpi"><div class="lbl">العمولات</div><div class="val">${h.egp(r.commissions)}</div></div>
      <div class="card kpi"><div class="lbl">صافي المكسب</div><div class="val ${r.profit < 0 ? 'danger' : 'gold'}">${h.egp(r.profit)}</div><div class="small muted">${r.margin != null ? `هامش ${r.margin}%` : ''}</div></div></div>
    ${r.unsoldCost > 0 ? `<div class="alert ${r.releaseSoon ? 'warn' : 'info'}" style="margin-top:12px">🪑 مقاعد غير مباعة تكلفتها ${h.egp(r.unsoldCost)} محسوبة على المكسب${p.releaseDate ? ` — ترجعها للشركة البائعة قبل ${esc(p.releaseDate)} لو مش هتتباع` : ''}${r.breakEven != null ? ` · نقطة التعادل: بيع ${r.breakEven} مقعد` : ''}${r.fullProfit != null ? ` · المكسب المتوقع لو اتباع البلوك كله: <b>${h.n0(r.fullProfit)}</b>` : ''}</div>` : ''}
    <div class="grid g-side" style="margin-top:14px">
      <div class="card"><h3>📦 الفئات: اشتريت بكام وبتبيع بكام</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>الفئة</th>${p.mode === 'BLOCK' ? '<th>مشترى</th><th>مرتجع</th>' : ''}<th>مباع</th>${p.mode === 'BLOCK' ? '<th>متبقي</th>' : ''}<th>تكلفة الفرد</th><th>سعر البيع</th><th>مكسب الفرد*</th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr><td>${esc(x.label)}</td>${p.mode === 'BLOCK' ? `<td class="num">${x.seats}</td><td class="num">${x.returned || 0}</td>` : ''}<td class="num">${x.sold}</td>${p.mode === 'BLOCK' ? `<td class="num ${x.unsold ? 'hold' : ''}">${x.unsold}</td>` : ''}
          <td>${h.n0(x.unit)}${p.currency === 'SAR' ? ` <span class="faint small">(${x.cost} ر.س)</span>` : ''}</td><td>${h.n0(x.price)}</td><td>${money(x.margin)}</td></tr>`).join('')}</tbody></table></div>
        <div class="small muted">* بعد خصم ضرائب المبيعات من سعر البيع وقبل عمولة المندوب.</div></div>
      <div class="card"><h3>🏢 الحساب مع الشركة البائعة</h3><table class="t small"><tbody>
        <tr><td>تكلفة الشراء المستحقة</td><td>${h.egp(r.posted || r.committed)}</td></tr><tr><td>فواتيرها المسجلة</td><td>${h.egp(r.posted)}</td></tr>
        <tr><td>المدفوع لها على البرنامج</td><td>${h.egp(r.paidSeller)}</td></tr><tr><td><b>الباقي لها</b></td><td><b class="${r.owedSeller > 0 ? 'danger' : 'ok'}">${h.egp(r.owedSeller)}</b></td></tr>
        <tr><td>المحصل من العملاء</td><td>${h.egp(r.collected)} <span class="faint small">من ${h.n0(r.gross)}</span></td></tr></tbody></table>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="rsBill" data-p="${p.id}">🧾 فاتورة الشركة البائعة</button><button class="btn sm" data-act="rsPaySeller" data-p="${p.id}">💸 دفعة للشركة البائعة</button>
          <button class="btn sm ghost" data-act="go" data-page="partyView" data-ptype="supplier" data-id="${p.supplierId}">📄 كشف حسابها</button></div></div></div>
    <div class="card" style="margin-top:14px"><h3>🧾 الحجوزات على البرنامج</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>الحجز</th><th>العميل</th><th>المندوب</th><th>الفئات</th><th>الصافي</th><th>المسدد</th><th>المكسب</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${bks.map((b) => `<tr><td class="num">${esc(b.code)}</td><td>${esc(b.lead.name)}<div class="small muted num">${esc(b.lead.phone)}</div></td><td class="small">${b.agentId ? esc((s.agents.find((a) => a.id === b.agentId) || {}).name || '') : '—'}</td>
        <td class="small">${b.lines.map((l) => `${l.qty} × ${esc(l.label)}`).join('<br>')}</td><td>${h.n0(b.net)}</td><td>${h.progress(b.paid, b.net)}</td><td>${money(Acc.r2(b.net - b.cost - (b.agentCommission || 0)))}</td>
        <td>${h.statusChip(b.status)}${b.agentRequest && b.agentRequest.state === 'PENDING' ? '<div class="chip hold">بانتظار الموافقة</div>' : ''}${b.pendingPay ? '<div class="chip hold">دفعة بانتظار الاعتماد</div>' : ''}</td>
        <td class="row" style="gap:4px">${E.LIVE_STATES.includes(b.status) && b.paid < b.net ? `<button class="btn sm primary" data-act="rsPay" data-id="${b.id}">💰 دفعة</button>` : ''}${E.LIVE_STATES.includes(b.status) ? `<button class="btn sm ghost" data-act="rsCancel" data-id="${b.id}">إلغاء</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">لا حجوزات بعد.</td></tr>'}</tbody></table></div></div>`;
  };
  const bookingOf = (id) => S().resale.bookings.find((b) => b.id === id);
  App.actions.rsToggle = (d) => { const p = R.program(S(), d.p); p.status = p.status === 'CLOSED' ? 'OPEN' : 'CLOSED'; done(`${p.status === 'CLOSED' ? 'إغلاق' : 'فتح'} بيع البرنامج ${p.code}`); };
  App.actions.rsReturn = (d) => {
    const s = S(), p = R.program(s, d.p), r = R.pnl(s, p);
    App.modal(`<h3>↩️ إرجاع مقاعد غير مباعة للشركة البائعة</h3><p class="small muted">المقاعد المرتجعة بتنزل من تكلفة البلوك. لو الشركة البائعة بعتت إشعار دائن سجله كفاتورة بالسالب/تسوية من الحسابات.</p>
      ${r.rows.map((x) => `<div class="row" style="margin-top:6px"><span style="flex:1">${esc(x.label)} — متبقي ${x.unsold} (مرتجع سابقاً ${x.returned || 0})</span><input class="input" type="number" min="0" max="${x.unsold + (x.returned || 0)}" id="rt-${x.id}" value="${x.returned || 0}" style="max-width:110px"></div>`).join('')}
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="rsReturnSave" data-p="${p.id}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.rsReturnSave = (d) => {
    const s = S(), p = R.program(s, d.p);
    for (const row of p.rows) { const v = Math.max(0, Number(App.val('rt-' + row.id)) || 0), maxRet = Math.max(0, row.seats - R.soldOf(s, p, row.id)); row.returned = Math.min(v, maxRet); }
    done(`إرجاع مقاعد برنامج ${p.code} للشركة البائعة`);
  };
  App.actions.rsBill = (d) => { const s = S(), p = R.program(s, d.p), r = R.pnl(s, p);
    App.openVoucher({ type: 'BILL', party: { type: 'supplier', id: p.supplierId }, tripId: p.id, accountCode: '5109', currency: p.currency, fx: p.currency === 'SAR' ? p.fx : 1,
      amount: Acc.r2(Math.max(0, r.committed - r.posted) / (p.currency === 'SAR' ? p.fx : 1)), memo: `فاتورة شراء البرنامج ${p.code} ${p.name}${p.supplierRef ? ' — ' + p.supplierRef : ''}` }); };
  App.actions.rsPaySeller = (d) => { const s = S(), p = R.program(s, d.p), r = R.pnl(s, p);
    App.openVoucher({ type: 'PV', party: { type: 'supplier', id: p.supplierId }, tripId: p.id, currency: p.currency, fx: p.currency === 'SAR' ? p.fx : 1, amount: Acc.r2(r.owedSeller / (p.currency === 'SAR' ? p.fx : 1)), memo: `دفعة للشركة البائعة — ${p.code} ${p.name}`, lockParty: true }); };
  App.actions.rsPay = (d) => { const b = bookingOf(d.id); App.openVoucher({ type: 'RV', party: b.customerId ? { type: 'customer', id: b.customerId } : { type: 'agent', id: b.agentId }, amount: Acc.r2(b.net - b.paid), bookingId: b.id, tripId: b.programId, branchId: b.branchId, memo: `سداد حجز ${b.code}`, lockParty: true }); };
  App.actions.rsCancel = (d) => { const b = bookingOf(d.id); if (!confirm(`إلغاء ${b.code}؟ سيُعكس الإيراد، والمبالغ المسددة تُرد بسند صرف.`)) return; R.cancelBooking(S(), b, App.actor().name); done(`إلغاء ${b.code}`); };

  // ================================================================ booking
  App.actions.rsBook = (d) => {
    const s = S(), p = R.program(s, d.p), own = App.role() === 'OWNER';
    App.ui.rsb = { programId: p.id };
    App.modal(`<h3>+ حجز على ${esc(p.name)}</h3>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>الفئة</th><th>السعر</th><th>المتاح</th><th>العدد</th></tr></thead><tbody>${p.rows.map((x) => { const lf = R.left(s, p, x.id);
        return `<tr><td>${esc(x.label)}</td><td>${h.n0(x.price)}</td><td class="num">${lf == null ? '—' : lf}</td><td><input class="input rsb-q" data-row="${x.id}" type="number" min="0" ${lf != null ? `max="${lf}"` : ''} value="0" style="max-width:90px"></td></tr>`; }).join('')}</tbody></table></div>
      <div class="grid g3" style="margin-top:8px">${field('rsb-name', 'اسم صاحب الحجز', '')}${field('rsb-phone', 'الموبايل', '', 'style="direction:ltr"')}
        <div class="field"><label>عن طريق مندوب/وكيل</label><select class="input" id="rsb-agent"><option value="">— مباشر —</option>${s.agents.filter((a) => !a.blocked).map((a) => opt(a.id, '', `${a.code} · ${a.name}`)).join('')}</select></div>
        ${own ? field('rsb-disc', 'خصم % (المالك فقط)', 0, 'type="number" min="0" max="100"') : ''}${field('rsb-notes', 'ملاحظات', '')}</div>
      <div class="field" style="margin-top:8px"><label>أسماء المسافرين (اختياري — اسم في كل سطر)</label><textarea class="input" id="rsb-names" rows="3"></textarea></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="rsBookSave">حفظ الحجز (معلق 24 ساعة)</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
  };
  App.actions.rsBookSave = () => {
    const s = S(), lines = [...document.querySelectorAll('.rsb-q')].map((el) => ({ rowId: el.dataset.row, qty: Number(el.value) || 0 })).filter((l) => l.qty > 0);
    try {
      const r = R.createBooking(s, { programId: App.ui.rsb.programId, lines, lead: { name: App.val('rsb-name'), phone: App.val('rsb-phone') }, agentId: App.val('rsb-agent') || null,
        discountPct: Number(App.val('rsb-disc') || 0), notes: App.val('rsb-notes'), paxNames: App.val('rsb-names'), ttl: 24 }, App.actor());
      if (r.pricing.warnings.length) App.toast(r.pricing.warnings.join(' · '), 'warn');
      done(`حجز ${r.booking.code} على برنامج مشترى — ${r.booking.units} فرد بصافي ${r.booking.net}`);
      App.toast(`✅ ${r.booking.code} — مكسب الحجز ${h.n0(r.pricing.margin)} ج.م`);
    } catch (e) { App.toast(e.message, 'err'); }
  };
})();
