/* Umrah ERP — Finance: vouchers & approval cycle, treasury & banks, expenses, chart of accounts, journal, financial reports */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, h = App.h, esc = h.esc, opt = h.opt;
  const S = () => App.S;
  const leafAccounts = (prefix) => S().accounts.filter((a) => Acc.isLeaf(S(), a.code) && (!prefix || prefix.some((p) => a.code.startsWith(p)))).sort((a, b) => a.code.localeCompare(b.code));
  const accLabel = (code) => { const a = Acc.account(S(), code); return a ? `${a.code} · ${a.name}` : code; };
  const PARTY_TYPES = { customer: 'عميل', agent: 'وكيل/مندوب', supplier: 'مورد', employee: 'موظف' };
  const partyList = (type) => (type === 'customer' ? S().customers : type === 'agent' ? S().agents : type === 'supplier' ? S().suppliers : type === 'employee' ? S().employees : []);

  // ============================================================ voucher form
  App.openVoucher = (preset = {}) => {
    const s = S();
    App.ui.vf = {
      type: 'RV', date: E.iso(new Date()), amount: '', currency: 'EGP', fx: 1, cashboxId: (s.cashboxes[0] || {}).id, toCashboxId: (s.cashboxes[1] || {}).id,
      partyType: preset.party ? preset.party.type : preset.type === 'BILL' || preset.type === 'PV' ? 'supplier' : 'customer', partyId: preset.party ? preset.party.id : '',
      accountCode: '', categoryId: (s.expenseCategories[0] || {}).id, purpose: 'ADVANCE', tripId: preset.tripId || '', bookingId: null, memo: '', method: '', fileIds: [],
      refFx: null, ...preset,
    };
    if (App.ui.vf.currency === 'SAR' && (!preset.fx || preset.fx === 1)) App.ui.vf.fx = s.fx.current;
    renderVoucherModal();
  };
  function renderVoucherModal() {
    const s = S(), f = App.ui.vf, t = f.type;
    const needCash = ['RV', 'PV', 'EXP', 'TR'].includes(t), needParty = ['RV', 'PV', 'BILL'].includes(t);
    const plist = partyList(f.partyType);
    const approver = App.isApprover();
    App.modal(`<div class="row"><h3 style="margin:0">🧾 ${f.lockParty ? Acc.VOUCHER_TYPES[t] : 'سند جديد'}</h3><span class="spacer"></span><button class="btn sm" data-act="closeModal">✕</button></div>
      <div class="grid g3" style="margin-top:10px">
        ${f.lockParty ? '' : `<div class="field"><label>نوع السند</label><select class="input" data-vf="type">${['RV', 'PV', 'EXP', 'TR', 'BILL'].map((k) => opt(k, t, Acc.VOUCHER_TYPES[k])).join('')}</select></div>`}
        <div class="field"><label>التاريخ</label><input class="input" type="date" data-vf="date" value="${esc(f.date)}"></div>
        <div class="field"><label>المبلغ</label><input class="input" type="number" step="0.01" min="0" data-vf="amount" value="${esc(f.amount)}"></div>
        <div class="field"><label>العملة</label><select class="input" data-vf="currency">${['EGP', 'SAR', 'USD'].map((c) => opt(c, f.currency, { EGP: 'جنيه مصري', SAR: 'ريال سعودي', USD: 'دولار' }[c])).join('')}</select></div>
        ${f.currency !== 'EGP' ? `<div class="field"><label>سعر الصرف (جنيه لكل 1) <span class="faint small">التنفيذي ${s.fx.current}${s.fx.global ? ` · العالمي ${s.fx.global.rate}` : ''}</span></label><input class="input" type="number" step="0.0001" data-vf="fx" value="${esc(f.fx)}"></div>` : ''}
        ${needCash ? `<div class="field"><label>${t === 'TR' ? 'من خزينة/بنك' : t === 'RV' ? 'استلام في' : 'الصرف من'}</label><select class="input" data-vf="cashboxId">${s.cashboxes.map((c) => opt(c.id, f.cashboxId, `${c.name} (${Acc.r2(Acc.cashboxBalance(s, c))})`)).join('')}</select></div>` : ''}
        ${t === 'TR' ? `<div class="field"><label>إلى خزينة/بنك</label><select class="input" data-vf="toCashboxId">${s.cashboxes.map((c) => opt(c.id, f.toCashboxId, c.name)).join('')}</select></div>` : ''}
        ${needParty ? `${f.lockParty ? `<div class="field"><label>الطرف</label><input class="input" readonly value="${esc(PARTY_TYPES[f.partyType])}: ${esc(h.partyName({ type: f.partyType, id: f.partyId }))}"></div>` : `
          <div class="field"><label>نوع الطرف</label><select class="input" data-vf="partyType">${(t === 'BILL' ? ['supplier'] : ['customer', 'agent', 'supplier', 'employee', 'none']).map((k) => opt(k, f.partyType, PARTY_TYPES[k] || 'حساب مباشر (بدون طرف)')).join('')}</select></div>
          ${f.partyType !== 'none' ? `<div class="field"><label>${PARTY_TYPES[f.partyType]}</label><select class="input" data-vf="partyId"><option value="">— اختر —</option>${plist.map((x) => opt(x.id, f.partyId, `${x.code || ''} · ${x.name}`)).join('')}</select></div>`
            : `<div class="field"><label>الحساب المقابل</label><select class="input" data-vf="accountCode"><option value="">— اختر —</option>${leafAccounts(t === 'RV' ? ['3', '4', '21'] : ['5', '12', '3', '21']).map((a) => opt(a.code, f.accountCode, `${a.code} · ${a.name}`)).join('')}</select></div>`}`}` : ''}
        ${t === 'PV' && f.partyType === 'employee' ? `<div class="field"><label>الغرض</label><select class="input" data-vf="purpose">${opt('ADVANCE', f.purpose, 'سلفة/عهدة (على حساب الموظف)')}${opt('SALARY', f.purpose, 'راتب/مكافأة (مصروف رواتب)')}</select></div>` : ''}
        ${t === 'EXP' ? `<div class="field"><label>بند المصروف</label><select class="input" data-vf="categoryId">${s.expenseCategories.map((c) => opt(c.id, f.categoryId, `${c.name} (${c.accountCode})`)).join('')}</select></div>` : ''}
        ${t === 'BILL' ? `<div class="field"><label>حساب التكلفة</label><select class="input" data-vf="accountCode">${leafAccounts(['51', '52', '12']).map((a) => opt(a.code, f.accountCode || '5101', `${a.code} · ${a.name}`)).join('')}</select></div>` : ''}
        ${t === 'PV' && f.partyType === 'supplier' && f.currency === 'SAR' ? `<div class="field"><label>سعر التحميل (المرجعي للرحلة)</label><input class="input" type="number" step="0.0001" data-vf="refFx" value="${esc(f.refFx || (s.trip ? s.trip.fxRef : ''))}"></div>` : ''}
        <div class="field"><label>الرحلة (مركز التكلفة)</label><select class="input" data-vf="tripId"><option value="">— عام —</option>${s.trips.map((d) => opt(d.id, f.tripId, `${d.trip.code} · ${d.trip.name}`)).join('')}</select></div>
        <div class="field"><label>الفرع</label><select class="input" data-vf="branchId">${s.branches.map((b) => opt(b.id, f.branchId || 'BR1', b.name)).join('')}</select></div>
        ${['RV', 'PV'].includes(t) ? `<div class="field"><label>طريقة الدفع</label><select class="input" data-vf="method">${['نقدي', 'إيداع بنكي', 'تحويل بنكي', 'إنستاباي', 'شيك', 'فودافون كاش'].map((m) => opt(m, f.method, m)).join('')}</select></div>` : ''}
      </div>
      <div class="field" style="margin-top:8px"><label>البيان</label><input class="input" data-vf="memo" value="${esc(f.memo)}"></div>
      <div class="row" style="margin-top:10px"><b>📎 المرفقات (صور الإيصالات/الفواتير)</b>${!approver ? '<span class="chip hold">إلزامي للإرسال للمحاسب</span>' : ''}<span class="spacer"></span>
        <button class="btn sm" data-act="vfAttach">📎 ملف/صورة</button><button class="btn sm" data-act="vfCamera">📸 كاميرا</button></div>
      <div class="row" style="margin-top:6px">${f.fileIds.map((id) => h.thumb(id, 'مرفق')).join('') || '<span class="muted small">لا مرفقات</span>'}</div>
      ${f.bookingId ? `<div class="alert info" style="margin-top:8px">مرتبط بالحجز ${esc((Model.findBooking(s, f.bookingId) || { b: {} }).b.code)} — عند الاعتماد يُسجَّل السداد على الحجز تلقائياً.</div>` : ''}
      <div class="row" style="margin-top:14px">
        ${approver ? '<button class="btn primary" data-act="vfSave" data-post="1">💾 حفظ واعتماد وترحيل</button><button class="btn" data-act="vfSave">حفظ كمعلق</button>'
          : '<button class="btn primary" data-act="vfSave">📤 إرسال للمحاسب للاعتماد</button>'}
        <button class="btn ghost" data-act="closeModal">إلغاء</button></div>`, true);
  }
  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!el.hasAttribute || !el.hasAttribute('data-vf')) return;
    const k = el.dataset.vf, f = App.ui.vf;
    f[k] = ['amount', 'fx', 'refFx'].includes(k) ? parseFloat(el.value) || '' : el.value;
    if (k === 'currency') f.fx = f.currency === 'SAR' ? S().fx.current : f.currency === 'USD' ? Acc.r2(S().fx.current * 3.75) : 1;
    if (k === 'partyType') { f.partyId = ''; f.accountCode = ''; }
    if (['type', 'partyType', 'currency'].includes(k)) renderVoucherModal();
  });
  document.addEventListener('input', (ev) => { const el = ev.target; if (el.hasAttribute && el.hasAttribute('data-vf') && ['memo', 'amount', 'fx', 'refFx'].includes(el.dataset.vf)) App.ui.vf[el.dataset.vf] = el.dataset.vf === 'memo' ? el.value : parseFloat(el.value) || ''; });
  App.actions.vfAttach = async () => { const fs = await App.uploadPicked({ accept: 'image/*,application/pdf', multiple: true }); App.ui.vf.fileIds.push(...fs.map((x) => x.id)); renderVoucherModal(); };
  App.actions.vfCamera = async () => { const fs = await App.uploadPicked({ accept: 'image/*', capture: true }); App.ui.vf.fileIds.push(...fs.map((x) => x.id)); renderVoucherModal(); };
  App.actions.vfSave = (d) => {
    const s = S(), f = App.ui.vf, actor = App.actor();
    if (App.online && !App.isApprover() && ['RV', 'PV', 'EXP'].includes(f.type) && !f.fileIds.length) return App.toast('ارفع صورة الإيصال/الفاتورة أولاً', 'err');
    const party = ['RV', 'PV', 'BILL'].includes(f.type) && f.partyType !== 'none' ? (f.partyId ? { type: f.partyType, id: f.partyId } : null) : null;
    if (['RV', 'PV', 'BILL'].includes(f.type) && f.partyType !== 'none' && !party) return App.toast('اختر الطرف', 'err');
    try {
      const v = Model.createVoucher(s, { ...f, amount: Number(f.amount), fx: f.currency === 'EGP' ? 1 : Number(f.fx), party, accountCode: f.type === 'BILL' ? f.accountCode || '5101' : f.accountCode || null,
        tripId: f.tripId || null, autoPost: !!d.post }, actor);
      if (f.refFx) v.refFx = Number(f.refFx);
      if (v.status === 'PENDING' && v.type === 'PV' && v.refFx == null && party && party.type === 'supplier' && v.currency === 'SAR') v.refFx = s.trip ? s.trip.fxRef : v.fx;
      App.audit(`${Acc.VOUCHER_TYPES[v.type]} ${v.no} بمبلغ ${v.amount} ${v.currency} — ${v.status === 'POSTED' ? 'مرحّل' : 'بانتظار الاعتماد'}`);
      App.closeModal(); App.save(); App.render();
      App.toast(v.status === 'POSTED' ? `✅ ${v.no} اعتُمد ورُحّل للحسابات` : `📤 ${v.no} أُرسل للمحاسب — سيصله إشعار للمراجعة`);
    } catch (e) { App.toast('⛔ ' + e.message, 'err'); }
  };

  // ============================================================ vouchers page
  const vParty = (v) => (v.party ? `${PARTY_TYPES[v.party.type]}: ${esc(h.partyName(v.party))}` : v.type === 'EXP' ? esc((S().expenseCategories.find((c) => c.id === v.categoryId) || {}).name || '') : v.type === 'TR' ? `→ ${esc((h.cashbox(v.toCashboxId) || {}).name || '')}` : v.accountCode ? esc(accLabel(v.accountCode)) : '—');
  App.pages.vouchers = () => {
    const s = S(), ui = App.ui, st = ui.vTab || (App.isApprover() ? 'PENDING' : 'ALL'), ty = ui.vType || 'ALL';
    const mine = !App.isApprover();
    const list = s.vouchers.filter((v) => (st === 'ALL' || v.status === st) && (ty === 'ALL' || v.type === ty) && (!mine || v.createdBy === App.actor().name)).slice().reverse();
    const pendingCount = s.vouchers.filter((v) => v.status === 'PENDING').length;
    return `
    <div class="page-head"><div><h2>🧾 السندات والدورة المستندية</h2><p>إنشاء ← مرفقات ← اعتماد المحاسب ← ترحيل قيد تلقائي · السند المعتمد لا يُعدل ولا يُحذف (يُلغى بقيد عكسي)</p></div>
      <div class="row">${['RV', 'PV', 'EXP', 'TR', 'BILL'].map((k) => `<button class="btn ${k === 'RV' ? 'primary' : ''}" data-act="newVoucher" data-type="${k}">+ ${Acc.VOUCHER_TYPES[k]}</button>`).join('')}</div></div>
    <div class="card">
      <div class="tabs">${[['PENDING', `⏳ بانتظار الاعتماد (${pendingCount})`], ['POSTED', '✅ معتمد'], ['REJECTED', '❌ مرفوض'], ['CANCELLED', 'ملغي'], ['ALL', 'الكل']].map(([k, l]) => `<button class="${st === k ? 'active' : ''}" data-act="vTab" data-t="${k}">${l}</button>`).join('')}
        <select class="input" style="width:auto" data-ui="vType">${opt('ALL', ty, 'كل الأنواع')}${Object.entries(Acc.VOUCHER_TYPES).map(([k, v]) => opt(k, ty, v)).join('')}</select></div>
      ${mine ? '<div class="alert info" style="margin-bottom:8px">تظهر هنا السندات التي أنشأتها أنت فقط.</div>' : ''}
      <div class="tbl-wrap"><table class="t"><thead><tr><th>الرقم</th><th>النوع</th><th>التاريخ</th><th>الطرف/البند</th><th>المبلغ</th><th>الخزينة</th><th>الرحلة/الحجز</th><th>أنشأه</th><th>المرفقات</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${list.map((v) => { const bk = v.bookingId && Model.findBooking(s, v.bookingId); const tr = v.tripId && Model.tripDocOf(s, v.tripId); return `<tr>
        <td class="num"><b>${v.no}</b></td><td>${Acc.VOUCHER_TYPES[v.type]}</td><td class="num">${v.date}</td><td class="small">${vParty(v)}<div class="faint">${esc(v.memo)}</div></td>
        <td><b>${h.cur(v.amount, v.currency)}</b>${v.currency !== 'EGP' ? `<div class="faint small">× ${v.fx} = ${h.egp(v.amount * v.fx)}</div>` : ''}</td>
        <td class="small">${esc((h.cashbox(v.cashboxId) || {}).name || '—')}</td>
        <td class="small">${tr ? esc(tr.trip.code) : ''}${bk ? ` · <a href="#" data-act="go" data-page="bookingView" data-id="${bk.b.id}">${bk.b.code}</a>` : ''}</td>
        <td class="small">${esc(v.createdBy)}<div class="faint">${h.dt(v.createdAt)}</div></td>
        <td>${(v.fileIds || []).map((id) => h.thumb(id, 'مرفق')).join('') || '<span class="chip danger">بدون</span>'}</td>
        <td>${h.vStatus(v.status)}${v.approvedBy ? `<div class="faint small">${esc(v.approvedBy)}</div>` : ''}${v.rejectReason ? `<div class="small danger">${esc(v.rejectReason)}</div>` : ''}</td>
        <td class="row" style="gap:4px">
          ${v.status === 'PENDING' && App.isApprover() ? `<button class="btn sm primary" data-act="vApprove" data-id="${v.id}">✅ اعتماد</button><button class="btn sm danger" data-act="vReject" data-id="${v.id}">رفض</button>` : ''}
          ${v.status === 'POSTED' && App.isApprover() ? `<button class="btn sm ghost" data-act="vCancel" data-id="${v.id}">إلغاء بقيد عكسي</button>` : ''}
          <button class="btn sm ghost" data-act="vPrint" data-id="${v.id}">🖨️</button></td></tr>`; }).join('') || '<tr><td colspan="11" class="muted">لا توجد سندات.</td></tr>'}
      </tbody></table></div></div>`;
  };
  App.actions.vTab = (d) => { App.ui.vTab = d.t; App.render(); };
  App.actions.newVoucher = (d) => App.openVoucher({ type: d.type, tripId: S().activeTripId || '' });
  App.actions.vApprove = (d) => {
    const v = S().vouchers.find((x) => x.id === d.id);
    if (!(v.fileIds || []).length && !confirm('السند بدون مرفقات — اعتماد رغم ذلك؟')) return;
    try { Model.approve(S(), d.id, App.actor()); App.audit(`اعتماد ${v.no}`); App.save(); App.render(); App.toast(`✅ ${v.no} اعتُمد ورُحّل`); }
    catch (e) { App.toast('⛔ ' + e.message, 'err'); }
  };
  App.actions.vReject = (d) => {
    const reason = prompt('سبب الرفض (يصل لمنشئ السند):');
    if (reason == null) return;
    try { const v = Model.reject(S(), d.id, App.actor(), reason); App.audit(`رفض ${v.no}: ${reason}`); App.save(); App.render(); }
    catch (e) { App.toast('⛔ ' + e.message, 'err'); }
  };
  App.actions.vCancel = (d) => {
    const v = S().vouchers.find((x) => x.id === d.id);
    if (!confirm(`إلغاء ${v.no} بقيد عكسي؟${v.bookingId ? '\nتنبيه: لن يُخصم المبلغ تلقائياً من سداد الحجز — راجع الحجز.' : ''}`)) return;
    try { Acc.cancelPostedVoucher(S(), d.id, App.actor()); App.audit(`إلغاء ${v.no} بقيد عكسي`); App.save(); App.render(); }
    catch (e) { App.toast('⛔ ' + e.message, 'err'); }
  };
  App.actions.vPrint = (d) => {
    const s = S(), v = s.vouchers.find((x) => x.id === d.id), je = v.jeId && s.journal.find((j) => j.id === v.jeId);
    App.printDoc(v.no, `<div class="head"><div><h1>${Acc.VOUCHER_TYPES[v.type]}</h1><div class="muted">رقم ${v.no} · ${v.date}</div></div><div>الحالة: ${v.status === 'POSTED' ? 'معتمد ومرحّل' : v.status === 'PENDING' ? 'بانتظار الاعتماد' : v.status}</div></div>
      <div class="box">المبلغ: <b>${h.n2(v.amount)} ${v.currency}</b>${v.currency !== 'EGP' ? ` × ${v.fx} = ${h.n2(v.amount * v.fx)} ج.م` : ''}<br>الطرف/البند: ${vParty(v).replace(/<[^>]+>/g, '')}<br>
      الخزينة: ${esc((h.cashbox(v.cashboxId) || {}).name || '—')} · طريقة الدفع: ${esc(v.method || '—')}<br>البيان: ${esc(v.memo)}</div>
      ${je ? `<table><tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr>${je.lines.map((l) => `<tr><td>${esc(accLabel(l.acc))}${l.party ? ' — ' + esc(h.partyName(l.party)) : ''}</td><td>${l.dr ? h.n2(l.dr) : ''}</td><td>${l.cr ? h.n2(l.cr) : ''}</td></tr>`).join('')}</table>` : ''}
      <div class="sign"><div>أنشأه: ${esc(v.createdBy)}</div><div>اعتمده: ${esc(v.approvedBy || '................')}</div><div>المستلم ................</div></div>`);
  };

  // ============================================================ exchange rates
  App.pages.fx = () => {
    const s = S(), fx = Model.fxInfo(s), g = App.fxGlobal, can = App.isApprover(), t = s.trip;
    const spreadChip = fx.spreadPct == null ? '<span class="chip">لا يوجد سعر عالمي بعد</span>'
      : `<span class="chip ${fx.alert ? 'danger' : 'ok'}">الفرق ${fx.spreadPct > 0 ? '+' : ''}${fx.spreadPct}% ${fx.alert ? '⚠️ يتجاوز الحد' : '✓ ضمن الحد'}</span>`;
    return `<div class="page-head"><div><h2>💱 أسعار الصرف (ريال ← جنيه)</h2><p>السعر التنفيذي تكتبه أنت ويُستخدم في كل العمليات · السعر العالمي يُجلب تلقائياً للمقارنة فقط</p></div></div>
    <div class="grid g3">
      <div class="card fx-card exec"><div class="lbl">🏦 سعر الصرف التنفيذي</div><div class="fx-val num">${fx.exec}</div>
        <div class="hint">السعر الفعلي الذي تشتري به الشركة الريال — يُستخدم افتراضياً في السندات بالريال وسداد الموردين وتقييم الأرصدة المفتوحة ومحافظ الوكلاء</div>
        ${can ? `<div class="row" style="margin-top:10px"><input class="input" id="fx-new" type="number" step="0.01" placeholder="السعر الجديد" style="max-width:140px"><input class="input" id="fx-note" placeholder="ملاحظة (مثال: سعر شركة الصرافة اليوم)" style="flex:1"><button class="btn primary" data-act="fxSave">اعتماد</button></div>` : '<div class="small muted" style="margin-top:8px">🔒 تعديله من صلاحية المحاسب أو المدير</div>'}</div>
      <div class="card fx-card global"><div class="lbl">🌍 سعر الصرف العالمي</div><div class="fx-val num">${fx.global ?? '—'}</div>
        <div class="hint">${fx.globalAt ? 'آخر تحديث ' + h.dt(fx.globalAt) : 'لم يُجلب بعد'} · يُحدَّث تلقائياً كل 6 ساعات${g && g.usd ? ` · الدولار ${g.usd} ج.م` : ''}</div>
        <div class="row" style="margin-top:10px">${spreadChip}${App.online ? '<button class="btn sm" data-act="fxRefresh">↻ تحديث الآن</button>' : ''}${can && fx.global ? '<button class="btn sm ghost" data-act="fxApply">نسخه للتنفيذي</button>' : ''}</div></div>
      <div class="card fx-card trip"><div class="lbl">✈️ سعر تسعير الرحلة ${t ? esc(t.code) : ''}</div><div class="fx-val num">${t ? t.fxRef : '—'}</div>
        <div class="hint">سعر ثابت لكل رحلة يُحسب به التكلفة والسعر الرسمي — لا يتغير مع السوق. الفرق بينه وبين سعر السداد الفعلي يُسجَّل تلقائياً كأرباح/خسائر فروق عملة.</div>
        ${t ? `<button class="btn sm" style="margin-top:10px" data-act="go" data-page="builder">تعديله من التكلفة والتسعير</button>` : ''}</div>
    </div>
    <div class="grid g-side" style="margin-top:14px">
      <div class="card"><h3>🕓 سجل تغييرات السعر التنفيذي</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>التاريخ</th><th>السعر</th><th>السابق</th><th>العالمي وقتها</th><th>بواسطة</th><th>ملاحظة</th></tr></thead><tbody>
        ${(s.fx.history || []).map((x) => `<tr><td class="small">${h.dt(x.at)}</td><td><b class="num">${x.rate}</b></td><td class="num faint">${x.prev ?? ''}</td><td class="num">${x.global ?? '—'}</td><td>${esc(x.by)}</td><td class="small">${esc(x.note)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا تغييرات مسجلة بعد.</td></tr>'}
      </tbody></table></div></div>
      <div class="card"><h3>⚙️ تنبيه الفرق</h3>
        <div class="field"><label>نبّهني إذا اختلف التنفيذي عن العالمي بأكثر من (%)</label><input class="input" type="number" step="0.5" min="0" data-bind="fx.alertSpreadPct" value="${fx.threshold}" ${can ? '' : 'disabled'}></div>
        <div class="small muted" style="margin-top:8px">يظهر التنبيه في مركز التنبيهات وفي الشريط العلوي للمحاسبين والمديرين.</div>
        <h3 style="margin-top:14px">🧭 أين يُستخدم كل سعر؟</h3>
        <table class="t small"><tr><td>السندات والمدفوعات بالريال</td><td>التنفيذي (قابل للتعديل في السند)</td></tr><tr><td>سداد الموردين بالريال</td><td>التنفيذي، والفرق عن سعر الرحلة = فروق عملة</td></tr>
        <tr><td>تكلفة وتسعير الرحلة</td><td>سعر الرحلة الثابت</td></tr><tr><td>تقييم الالتزامات المفتوحة في أرباح الرحلة</td><td>التنفيذي</td></tr><tr><td>رحلة جديدة</td><td>تبدأ بالتنفيذي كسعر افتراضي</td></tr><tr><td>العالمي</td><td>مقارنة وتنبيه فقط</td></tr></table></div>
    </div>`;
  };
  App.actions.fxSave = () => {
    if (!App.isApprover()) return App.toast('من صلاحية المحاسب أو المدير', 'err');
    const r = Number(App.val('fx-new'));
    if (!(r > 0)) return App.toast('أدخل سعراً صحيحاً', 'err');
    const g = S().fx.global && S().fx.global.rate;
    if (g && Math.abs((r - g) / g) > 0.15 && !confirm(`السعر ${r} يختلف عن العالمي ${g} بأكثر من 15% — تأكيد؟`)) return;
    Model.setExecRate(S(), r, App.actor().name, App.val('fx-note'));
    App.audit(`تعديل سعر الصرف التنفيذي إلى ${r}`); App.save(); App.render(); App.toast(`✅ السعر التنفيذي الآن ${r}`);
  };

  // ============================================================ treasury & banks
  App.pages.treasury = () => {
    const s = S();
    const total = s.cashboxes.reduce((x, c) => x + Acc.cashboxBalance(s, c), 0);
    return `
    <div class="page-head"><div><h2>🏦 الخزائن والبنوك</h2><p>كل خزينة/حساب بنكي له حساب مستقل في الشجرة · الرصيد من القيود المرحّلة فقط</p></div>
      <div class="row"><button class="btn primary" data-act="cbForm">+ خزينة / حساب بنكي</button><button class="btn" data-act="newVoucher" data-type="TR">⇄ تحويل بين الخزائن</button></div></div>
    <div class="grid g4" style="margin-bottom:14px"><div class="card kpi"><div class="lbl">إجمالي النقدية</div><div class="val gold">${h.egp(total)}</div></div>
      <div class="card kpi"><div class="lbl">الخزائن</div><div class="val">${h.egp(s.cashboxes.filter((c) => c.type === 'cash').reduce((x, c) => x + Acc.cashboxBalance(s, c), 0))}</div></div>
      <div class="card kpi"><div class="lbl">البنوك</div><div class="val">${h.egp(s.cashboxes.filter((c) => c.type === 'bank').reduce((x, c) => x + Acc.cashboxBalance(s, c), 0))}</div></div>
      <div class="card kpi"><div class="lbl">سندات بانتظار الاعتماد</div><div class="val">${s.vouchers.filter((v) => v.status === 'PENDING').length}</div></div></div>
    <div class="grid g3">${s.cashboxes.map((c) => { const bal = Acc.cashboxBalance(s, c); return `<div class="card">
      <div class="row"><b>${c.type === 'bank' ? '🏦' : '💵'} ${esc(c.name)}</b><span class="spacer"></span><span class="chip">${esc(c.code)}</span></div>
      <div class="small muted">${esc(h.branch(c.branchId).name)} · حساب ${esc(c.accountCode)} · ${esc(c.currency)}${c.bankName ? ' · ' + esc(c.bankName) : ''}${c.iban ? `<div class="num">${esc(c.iban)}</div>` : ''}</div>
      <div class="kpi" style="padding:8px 0"><div class="val ${bal < 0 ? 'danger' : ''}">${h.egp(bal)}</div></div>
      <div class="row"><button class="btn sm" data-act="cbLedger" data-code="${c.accountCode}">📒 حركة الحساب</button><button class="btn sm ghost" data-act="cbForm" data-id="${c.id}">✏️</button></div></div>`; }).join('')}</div>`;
  };
  App.actions.cbForm = (d) => {
    const c = d.id ? h.cashbox(d.id) : { type: 'cash', currency: 'EGP', branchId: 'BR1' };
    App.modal(`<h3>${d.id ? 'تعديل' : 'إضافة'} خزينة / حساب بنكي</h3><div class="grid g2">
      <div class="field"><label>الاسم</label><input class="input" id="cb-name" value="${esc(c.name || '')}"></div>
      <div class="field"><label>النوع</label><select class="input" id="cb-type" ${d.id ? 'disabled' : ''}>${opt('cash', c.type, 'خزينة نقدية')}${opt('bank', c.type, 'حساب بنكي')}</select></div>
      <div class="field"><label>العملة</label><select class="input" id="cb-cur">${opt('EGP', c.currency, 'جنيه')}${opt('SAR', c.currency, 'ريال')}${opt('USD', c.currency, 'دولار')}</select></div>
      <div class="field"><label>الفرع</label><select class="input" id="cb-br">${S().branches.map((b) => opt(b.id, c.branchId, b.name)).join('')}</select></div>
      <div class="field"><label>اسم البنك</label><input class="input" id="cb-bank" value="${esc(c.bankName || '')}"></div>
      <div class="field"><label>IBAN / رقم الحساب</label><input class="input" id="cb-iban" value="${esc(c.iban || '')}" style="direction:ltr"></div></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="cbSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.cbSave = (d) => {
    if (!App.isApprover()) return App.toast('إدارة الخزائن من صلاحية المحاسب أو المدير', 'err');
    const name = String(App.val('cb-name')).trim();
    if (name.length < 2) return App.toast('اكتب الاسم', 'err');
    if (d.id) { const c = h.cashbox(d.id); Object.assign(c, { name, currency: App.val('cb-cur'), branchId: App.val('cb-br'), bankName: App.val('cb-bank'), iban: App.val('cb-iban') }); const a = Acc.account(S(), c.accountCode); if (a) a.name = name; }
    else Model.addCashbox(S(), { name, type: App.val('cb-type'), currency: App.val('cb-cur'), branchId: App.val('cb-br'), bankName: App.val('cb-bank'), iban: App.val('cb-iban') });
    App.audit(`${d.id ? 'تعديل' : 'إضافة'} خزينة ${name}`); App.closeModal(); App.save(); App.render();
  };
  App.actions.cbLedger = (d) => { App.ui.rTab = 'ledger'; App.ui.rAcc = d.code; App.ui.page = 'reports'; App.render(); };

  // ============================================================ expenses
  App.pages.expenses = () => {
    const s = S(), list = s.vouchers.filter((v) => v.type === 'EXP').slice().reverse();
    const byCat = s.expenseCategories.map((c) => ({ c, total: list.filter((v) => v.status === 'POSTED' && v.categoryId === c.id).reduce((x, v) => x + v.amount * (v.currency === 'EGP' ? 1 : v.fx), 0) }));
    return `
    <div class="page-head"><div><h2>💸 المصروفات</h2><p>تبويب المصروفات ببنود مربوطة بحسابات الشجرة · كل مصروف بسند ومرفق واعتماد</p></div>
      <div class="row"><button class="btn primary" data-act="newVoucher" data-type="EXP">+ سند مصروف</button><button class="btn" data-act="catForm">+ بند مصروف</button></div></div>
    <div class="grid g4" style="margin-bottom:14px">${byCat.map((x) => `<div class="card kpi"><div class="lbl">${esc(x.c.name)}</div><div class="val">${h.egp(x.total)}</div><div class="hint">${esc(accLabel(x.c.accountCode))}</div></div>`).join('')}</div>
    <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>الرقم</th><th>التاريخ</th><th>البند</th><th>البيان</th><th>المبلغ</th><th>الخزينة</th><th>الرحلة</th><th>مرفق</th><th>الحالة</th></tr></thead><tbody>
      ${list.map((v) => `<tr><td class="num">${v.no}</td><td class="num">${v.date}</td><td>${esc((s.expenseCategories.find((c) => c.id === v.categoryId) || {}).name || '')}</td><td class="small">${esc(v.memo)}</td>
        <td>${h.cur(v.amount, v.currency)}</td><td class="small">${esc((h.cashbox(v.cashboxId) || {}).name || '')}</td><td class="small">${v.tripId ? esc((Model.tripDocOf(s, v.tripId) || { trip: {} }).trip.code || '') : 'عام'}</td>
        <td>${(v.fileIds || []).map((id) => h.thumb(id, 'مرفق')).join('') || '—'}</td><td>${h.vStatus(v.status)}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">لا مصروفات.</td></tr>'}
    </tbody></table></div></div>`;
  };
  App.actions.catForm = () => {
    App.modal(`<h3>+ بند مصروف</h3><div class="grid g2"><div class="field"><label>اسم البند</label><input class="input" id="ec-name"></div>
      <div class="field"><label>الحساب</label><select class="input" id="ec-acc"><option value="NEW">➕ حساب جديد تحت المصروفات العمومية</option>${leafAccounts(['5']).map((a) => opt(a.code, '', `${a.code} · ${a.name}`)).join('')}</select></div></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="catSave">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.catSave = () => {
    if (!App.isApprover()) return App.toast('من صلاحية المحاسب أو المدير', 'err');
    const name = String(App.val('ec-name')).trim(); if (!name) return App.toast('اكتب الاسم', 'err');
    let acc = App.val('ec-acc');
    if (acc === 'NEW') acc = Acc.addAccount(S(), '52', name).code;
    S().expenseCategories.push({ id: 'EC' + Date.now().toString(36), name, accountCode: acc });
    App.closeModal(); App.save(); App.render();
  };

  // ============================================================ chart of accounts
  App.pages.coa = () => {
    const s = S(), b = Acc.balances(s);
    const row = (a, depth) => {
      const x = b.get(a.code), kids = Acc.children(s, a.code);
      return `<div class="tree-row" style="padding-inline-start:${8 + depth * 22}px">
        <span class="num ${kids.length ? 'gold' : ''}" style="min-width:70px">${esc(a.code)}</span><span style="flex:1">${kids.length ? '<b>' : ''}${esc(a.name)}${kids.length ? '</b>' : ''}</span>
        <span class="chip small">${Acc.TYPE_AR[Acc.accType(a.code)]}</span><span class="num" style="min-width:130px;text-align:left">${h.n2(x.bal)}</span>
        ${App.isApprover() ? `<button class="btn sm ghost" data-act="accAdd" data-parent="${a.code}" title="حساب فرعي">＋</button>` : ''}
        ${!kids.length ? `<button class="btn sm ghost" data-act="cbLedger" data-code="${a.code}" title="كشف الحساب">📒</button>` : ''}</div>` + kids.map((k) => row(k, depth + 1)).join('');
    };
    return `<div class="page-head"><div><h2>🌳 شجرة الحسابات</h2><p>4 مستويات · القيد على الحسابات الفرعية فقط · الأرصدة من القيود المرحّلة</p></div></div>
      <div class="card"><div class="tbl-wrap" style="max-height:none;border:0"><div style="min-width:560px">${s.accounts.filter((a) => !a.parent).map((a) => row(a, 0)).join('')}</div></div></div>`;
  };
  App.actions.accAdd = (d) => {
    const s = S(), used = s.journal.some((j) => j.lines.some((l) => l.acc === d.parent));
    if (used && Acc.isLeaf(s, d.parent)) return App.toast('الحساب عليه قيود — لا يمكن تحويله لحساب رئيسي. أضف الفرع تحت الحساب الأب.', 'err');
    const name = prompt(`اسم الحساب الفرعي تحت ${accLabel(d.parent)}:`);
    if (!name) return;
    const a = Acc.addAccount(s, d.parent, name.trim());
    App.audit(`إضافة حساب ${a.code} ${a.name}`); App.save(); App.render();
  };

  // ============================================================ journal
  App.pages.journal = () => {
    const s = S(), q = (App.ui.jq || '').trim();
    const list = s.journal.filter((j) => !q || j.no.includes(q) || j.memo.includes(q)).slice().reverse().slice(0, 200);
    return `<div class="page-head"><div><h2>📚 القيود اليومية</h2><p>دفتر اليومية العام — القيد المرحّل لا يُعدل ولا يُحذف · آخر 200 قيد</p></div>
      <div class="row"><input class="input" style="width:220px" placeholder="🔎 رقم/بيان" data-ui="jq" value="${esc(q)}">${App.isApprover() ? '<button class="btn primary" data-act="jvForm">+ قيد يومية يدوي</button>' : ''}</div></div>
      <div class="card"><div class="tbl-wrap" style="max-height:none"><table class="t"><thead><tr><th>القيد</th><th>التاريخ</th><th>البيان</th><th>الحساب</th><th>الطرف</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
      ${list.map((j) => j.lines.map((l, k) => `<tr ${k ? '' : 'style="border-top:2px solid var(--line-2)"'}><td class="num">${k ? '' : `<b>${j.no}</b>${j.reversedBy ? ' <span class="chip">معكوس</span>' : ''}`}</td><td class="num">${k ? '' : j.date}</td>
        <td class="small">${k ? '' : esc(j.memo) + `<div class="faint">${esc(j.by)}</div>`}</td><td class="small">${esc(accLabel(l.acc))}</td><td class="small">${l.party ? esc(h.partyName(l.party)) : ''}</td>
        <td>${l.dr ? h.money(l.dr) : ''}</td><td>${l.cr ? h.money(l.cr) : ''}</td></tr>`).join('')).join('')}
      </tbody></table></div></div>`;
  };
  App.actions.jvForm = () => {
    App.ui.jv = { memo: '', date: E.iso(new Date()), lines: [{ acc: '', dr: '', cr: '' }, { acc: '', dr: '', cr: '' }] };
    renderJv();
  };
  function renderJv() {
    const jv = App.ui.jv, accs = leafAccounts();
    const dr = jv.lines.reduce((x, l) => x + (Number(l.dr) || 0), 0), cr = jv.lines.reduce((x, l) => x + (Number(l.cr) || 0), 0);
    App.modal(`<h3>+ قيد يومية يدوي</h3><div class="grid g2"><div class="field"><label>التاريخ</label><input class="input" type="date" id="jv-date" value="${jv.date}"></div><div class="field"><label>البيان</label><input class="input" id="jv-memo" value="${esc(jv.memo)}"></div></div>
      <table class="t" style="margin-top:8px"><tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr>${jv.lines.map((l, i) => `<tr><td><select class="input jv-acc" data-i="${i}"><option value="">—</option>${accs.map((a) => opt(a.code, l.acc, `${a.code} · ${a.name}`)).join('')}</select></td>
        <td><input class="input jv-dr" data-i="${i}" type="number" value="${l.dr}"></td><td><input class="input jv-cr" data-i="${i}" type="number" value="${l.cr}"></td></tr>`).join('')}
        <tr><td><button class="btn sm" data-act="jvLine">+ سطر</button></td><td class="num ${Math.abs(dr - cr) > 0.01 ? 'danger' : 'ok'}">${h.n2(dr)}</td><td class="num">${h.n2(cr)}</td></tr></table>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="jvSave">ترحيل القيد</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
  }
  function readJv() {
    const jv = App.ui.jv;
    jv.date = App.val('jv-date'); jv.memo = App.val('jv-memo');
    document.querySelectorAll('.jv-acc').forEach((el) => { jv.lines[el.dataset.i].acc = el.value; });
    document.querySelectorAll('.jv-dr').forEach((el) => { jv.lines[el.dataset.i].dr = el.value; });
    document.querySelectorAll('.jv-cr').forEach((el) => { jv.lines[el.dataset.i].cr = el.value; });
  }
  App.actions.jvLine = () => { readJv(); App.ui.jv.lines.push({ acc: '', dr: '', cr: '' }); renderJv(); };
  App.actions.jvSave = () => {
    readJv();
    const jv = App.ui.jv;
    try {
      const v = Model.createVoucher(S(), { type: 'JV', amount: jv.lines.reduce((x, l) => x + (Number(l.dr) || 0), 0), memo: jv.memo, date: jv.date,
        lines: jv.lines.filter((l) => l.acc).map((l) => ({ acc: l.acc, dr: Number(l.dr) || 0, cr: Number(l.cr) || 0 })), autoPost: true }, App.actor());
      App.audit(`قيد يومية ${v.no}`); App.closeModal(); App.save(); App.render(); App.toast(`✅ ${v.no} رُحّل`);
    } catch (e) { App.toast('⛔ ' + e.message, 'err'); }
  };

  // ============================================================ reports
  App.pages.reports = () => {
    const s = S(), ui = App.ui, tab = ui.rTab || 'tb';
    const f = { from: ui.rFrom || '', to: ui.rTo || '', tripId: ui.rTrip || '', branchId: ui.rBranch || '' };
    const filters = `<div class="row" style="margin-bottom:10px">
      <div class="field"><label>من</label><input class="input" type="date" data-ui="rFrom" value="${f.from}"></div><div class="field"><label>إلى</label><input class="input" type="date" data-ui="rTo" value="${f.to}"></div>
      <div class="field"><label>الرحلة (مركز تكلفة)</label><select class="input" data-ui="rTrip"><option value="">كل الرحلات</option>${s.trips.map((d) => opt(d.id, f.tripId, d.trip.code)).join('')}</select></div>
      <div class="field"><label>الفرع</label><select class="input" data-ui="rBranch"><option value="">كل الفروع</option>${s.branches.map((b) => opt(b.id, f.branchId, b.name)).join('')}</select></div>
      <span class="spacer"></span><button class="btn gold" data-act="rPrint">🖨️ طباعة</button></div>`;
    let body = '';
    if (tab === 'tb') {
      const tb = Acc.trialBalance(s, f);
      body = `<table class="t" id="rpt"><thead><tr><th>الكود</th><th>الحساب</th><th>حركة مدين</th><th>حركة دائن</th><th>رصيد مدين</th><th>رصيد دائن</th></tr></thead><tbody>
        ${tb.rows.map((r) => `<tr><td class="num">${r.code}</td><td><a href="#" data-act="cbLedger" data-code="${r.code}">${esc(r.name)}</a></td><td>${h.money(r.dr)}</td><td>${h.money(r.cr)}</td><td>${r.balDr ? h.money(r.balDr) : ''}</td><td>${r.balCr ? h.money(r.balCr) : ''}</td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="2">الإجمالي ${Math.abs(tb.tot.balDr - tb.tot.balCr) < 0.01 ? '<span class="chip ok">متوازن ✓</span>' : '<span class="chip danger">غير متوازن</span>'}</td><td>${h.money(tb.tot.dr)}</td><td>${h.money(tb.tot.cr)}</td><td>${h.money(tb.tot.balDr)}</td><td>${h.money(tb.tot.balCr)}</td></tr></tfoot></table>`;
    } else if (tab === 'ledger') {
      const code = ui.rAcc || (s.cashboxes[0] || {}).accountCode || '1103';
      const pt = ui.rPType || '', pid = ui.rPId || '';
      const rows = Acc.ledger(s, code, { ...f, party: pt && pid ? { type: pt, id: pid } : null });
      body = `<div class="row" style="margin-bottom:8px"><div class="field" style="min-width:260px"><label>الحساب</label><select class="input" data-ui="rAcc">${s.accounts.slice().sort((a, b) => a.code.localeCompare(b.code)).map((a) => opt(a.code, code, `${a.code} · ${a.name}`)).join('')}</select></div>
        <div class="field"><label>نوع الطرف</label><select class="input" data-ui="rPType"><option value="">الكل</option>${Object.entries(PARTY_TYPES).map(([k, v]) => opt(k, pt, v)).join('')}</select></div>
        ${pt ? `<div class="field"><label>الطرف</label><select class="input" data-ui="rPId"><option value="">الكل</option>${partyList(pt).map((x) => opt(x.id, pid, `${x.code || ''} · ${x.name}`)).join('')}</select></div>` : ''}</div>
        <table class="t" id="rpt"><thead><tr><th>التاريخ</th><th>القيد</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td class="num">${r.date}</td><td class="num">${r.no}</td><td class="small">${esc(r.memo)}</td><td>${r.dr ? h.money(r.dr) : ''}</td><td>${r.cr ? h.money(r.cr) : ''}</td><td><b>${h.money(r.bal)}</b></td></tr>`).join('') || '<tr><td colspan="6" class="muted">لا حركات.</td></tr>'}</tbody></table>`;
    } else if (tab === 'is') {
      const r = Acc.incomeStatement(s, f);
      const sec = (t, arr, tot) => `<tr><th colspan="2">${t}</th></tr>${arr.map((x) => `<tr><td>${esc(x.code)} · ${esc(x.name)}</td><td>${h.money(x.amount)}</td></tr>`).join('')}<tr><td><b>إجمالي ${t}</b></td><td><b>${h.money(tot)}</b></td></tr>`;
      body = `<table class="t" id="rpt" style="max-width:720px">${sec('الإيرادات', r.revenue, r.totalRevenue)}${sec('تكاليف الرحلات', r.tripCosts, r.totalTripCosts)}
        <tr><td><b>مجمل الربح</b></td><td><b class="gold">${h.money(r.grossProfit)}</b></td></tr>${sec('المصروفات العمومية والإدارية', r.opex, r.totalOpex)}
        <tr><td><b>صافي الربح / (الخسارة)</b></td><td><b class="${r.netProfit < 0 ? 'danger' : 'ok'}">${h.money(r.netProfit)}</b></td></tr></table>`;
    } else if (tab === 'bs') {
      const r = Acc.balanceSheet(s, f);
      const sec = (t, arr) => `<tr><th colspan="2">${t}</th></tr>${arr.map((x) => `<tr><td>${esc(x.code)} · ${esc(x.name)}</td><td>${h.money(x.amount)}</td></tr>`).join('')}`;
      body = `<table class="t" id="rpt" style="max-width:720px">${sec('الأصول', r.assets)}<tr><td><b>إجمالي الأصول</b></td><td><b>${h.money(r.totalAssets)}</b></td></tr>
        ${sec('الخصوم', r.liabilities)}<tr><td><b>إجمالي الخصوم</b></td><td><b>${h.money(r.totalLiabilities)}</b></td></tr>
        ${sec('حقوق الملكية', r.equity)}<tr><td>صافي ربح الفترة</td><td>${h.money(r.currentProfit)}</td></tr><tr><td><b>إجمالي حقوق الملكية</b></td><td><b>${h.money(r.totalEquity)}</b></td></tr>
        <tr><td><b>الخصوم + حقوق الملكية</b> ${Math.abs(r.totalAssets - r.totalLiabilities - r.totalEquity) < 0.01 ? '<span class="chip ok">متوازن ✓</span>' : '<span class="chip danger">فرق</span>'}</td><td><b>${h.money(r.totalLiabilities + r.totalEquity)}</b></td></tr></table>`;
    } else if (tab === 'parties') {
      const pt = ui.rPType2 || 'customer';
      const rows = partyList(pt).map((x) => ({ x, bal: Acc.partyBalance(s, pt, x.id) })).filter((r) => Math.abs(r.bal) > 0.009);
      body = `<div class="tabs">${Object.entries(PARTY_TYPES).map(([k, v]) => `<button class="${pt === k ? 'active' : ''}" data-act="rParty" data-t="${k}">${v}</button>`).join('')}</div>
        <table class="t" id="rpt"><thead><tr><th>الكود</th><th>الاسم</th><th>مدين (له علينا/عليه لنا)</th><th>دائن</th><th></th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td class="num">${esc(r.x.code || '')}</td><td>${esc(r.x.name)}</td><td>${r.bal > 0 ? h.money(r.bal) : ''}</td><td>${r.bal < 0 ? h.money(-r.bal) : ''}</td>
          <td><button class="btn sm ghost" data-act="go" data-page="partyView" data-ptype="${pt}" data-id="${r.x.id}">كشف حساب</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">لا أرصدة.</td></tr>'}
        </tbody><tfoot><tr><td colspan="2">الإجمالي</td><td>${h.money(rows.filter((r) => r.bal > 0).reduce((a, r) => a + r.bal, 0))}</td><td>${h.money(-rows.filter((r) => r.bal < 0).reduce((a, r) => a + r.bal, 0))}</td><td></td></tr></tfoot></table>`;
    }
    return `<div class="page-head"><div><h2>📊 التقارير المالية</h2><p>ميزان المراجعة · دفتر الأستاذ · قائمة الدخل · المركز المالي · أرصدة الأطراف — مع فلترة بالتاريخ والرحلة والفرع</p></div></div>
      <div class="card"><div class="tabs">${[['tb', 'ميزان المراجعة'], ['ledger', 'دفتر الأستاذ'], ['is', 'قائمة الدخل'], ['bs', 'المركز المالي'], ['parties', 'أرصدة العملاء والموردين والوكلاء والموظفين']].map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-act="rTab" data-t="${k}">${l}</button>`).join('')}</div>
      ${filters}<div class="tbl-wrap" style="max-height:none">${body}</div></div>`;
  };
  App.actions.rTab = (d) => { App.ui.rTab = d.t; App.render(); };
  App.actions.rParty = (d) => { App.ui.rPType2 = d.t; App.render(); };
  App.actions.rPrint = () => {
    const el = document.getElementById('rpt'); if (!el) return;
    const t = document.querySelector('.tabs button.active');
    App.printDoc(t ? t.textContent : 'تقرير', `<h2>${esc(t ? t.textContent : '')}</h2><div class="muted">${esc(App.ui.rFrom || 'من البداية')} ← ${esc(App.ui.rTo || 'حتى الآن')}</div>${el.outerHTML.replace(/<button[^>]*>.*?<\/button>/g, '').replace(/<a [^>]*>(.*?)<\/a>/g, '$1')}`);
  };
})();
