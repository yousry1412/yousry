/* أفواج — Hajj screens: season dashboard, programs & cost sheet, pilgrims (registration, eligibility, stages, payments,
 * cancellation), operations (groups/أفواج, housing, Mina/Arafat tents, cards, manifest), season settings & close, profitability */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, Hj = window.Hajj, h = App.h, esc = h.esc, opt = h.opt;
  const S = () => App.S;
  const field = (id, label, val, extra = '') => `<div class="field"><label>${label}</label><input class="input" id="${id}" value="${esc(val ?? '')}" ${extra}></div>`;
  const area = (id, label, val, rows = 3) => `<div class="field" style="grid-column:1/-1"><label>${label}</label><textarea class="input" id="${id}" rows="${rows}">${esc(val || '')}</textarea></div>`;
  const done = (msg) => { if (msg) App.audit(msg); App.closeModal(); App.save(); App.render(); };
  const seasons = () => S().hajj.seasons;
  const curSeason = () => { const ss = seasons(); return ss.find((x) => x.id === App.ui.hjSs) || ss.filter((x) => !x.closed).slice(-1)[0] || ss.slice(-1)[0]; };
  const pkgsOf = (ss) => (ss ? S().hajj.packages.filter((k) => k.seasonId === ss.id) : []);
  const pil = (id) => S().hajj.pilgrims.find((p) => p.id === id);
  const stageChip = (st) => `<span class="chip ${st === 'CANCELLED' || st === 'REJECTED' ? 'danger' : st === 'WAITLIST' ? 'hold' : Hj.STAGES[st].i >= 4 ? 'ok' : ''}">${esc(Hj.STAGES[st].ar)}</span>`;
  const ssPicker = () => `<select class="input" data-ui="hjSs">${seasons().map((x) => opt(x.id, (curSeason() || {}).id, `${x.name}${x.closed ? ' (مقفل)' : ''}`)).join('')}</select>`;
  const lvl = (k) => `${esc(Hj.LEVELS[k.level])} · ${esc(Hj.DURATION[k.duration].split(' ')[0])}`;
  const noSeason = () => `<div class="card empty-state"><h3>⛰️ لا يوجد موسم حج</h3><p class="muted">ابدأ بإنشاء الموسم: السنة، يوم التروية، سعر تثبيت الريال، الحصة.</p><button class="btn primary" data-act="hjSeasonForm">+ موسم جديد</button></div>`;

  // ================================================================ DASHBOARD
  App.pages.hajjDash = () => {
    const s = S(), ss = curSeason(); if (!ss) return noSeason();
    const ks = pkgsOf(ss), ps = s.hajj.pilgrims.filter((p) => ks.some((k) => k.id === p.packageId));
    const tot = Hj.quotaTotal(ss), used = Hj.quotaUsed(s, ss), nums = ks.map((k) => ({ k, n: Hj.packageNumbers(s, k) }));
    const sum = (f) => nums.reduce((x, y) => x + y.n[f], 0);
    const issues = ps.filter(Hj.ACTIVE).filter((p) => Hj.eligibility(s, p).some((x) => x.level === 'err')).length;
    const today = E.iso(new Date()), days = Hj.hajjDays(ss);
    const stageCount = Object.keys(Hj.STAGES).map((st) => [st, ps.filter((p) => p.stage === st).length]).filter(([, n]) => n);
    return `<div class="page-head"><div><h2>⛰️ ${esc(ss.name)}</h2><p>يوم التروية ${esc(ss.tarwiyah || '—')} · سعر تثبيت الريال <b class="num">${ss.fxLock}</b>${ss.closed ? ' · <span class="chip">مقفل</span>' : ''}</p></div>
      <div class="row">${ssPicker()}<button class="btn primary" data-act="go" data-page="hajjPilgrims">+ تسجيل حاج</button><button class="btn" data-act="go" data-page="hajjSeason">⚙️ الموسم</button></div></div>
    <div class="grid g4">
      <div class="card kpi"><div class="lbl">الحصة (تأشيرات)</div><div class="val ${tot && used >= tot ? 'danger' : ''}">${used} <small class="muted" style="font-size:14px">من ${tot || 'غير محدد'}</small></div><div class="hint">${(ss.quota || []).map((q) => `${esc(q.name)}: ${q.visas}`).join(' · ')}</div>${tot ? h.progress(used, tot) : ''}</div>
      <div class="card kpi"><div class="lbl">الحجاج النشطون</div><div class="val">${sum('pilgrims')}</div><div class="hint">${sum('waitlist')} انتظار · ${sum('cancelled')} ملغي · ${issues ? `<span class="danger">${issues} عليهم مشكلة أهلية</span>` : 'لا مشاكل أهلية'}</div></div>
      <div class="card kpi"><div class="lbl">المحصّل / المتبقي</div><div class="val ok" style="font-size:18px">${h.egp(sum('collected'))}</div><div class="hint danger">${h.n0(sum('due'))} متبقي على الحجاج</div></div>
      <div class="card kpi"><div class="lbl">إيرادات مؤجلة (2108)</div><div class="val gold" style="font-size:18px">${h.egp(sum('deferred'))}</div><div class="hint">تتحول لإيراد عند إقفال الموسم</div></div></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>📦 البرامج</h3>${nums.map(({ k, n }) => `<div class="task-row"><div><b>${esc(k.code)} · ${esc(k.name)}</b><div class="small muted">${lvl(k)} · ${esc(Hj.MASHAIR[k.mashair])} · ${esc(k.departDate)} ← ${esc(k.returnDate)}</div>
        ${k.capacity ? h.progress(n.pilgrims, k.capacity) : ''}</div><div style="text-align:end"><b class="num">${n.pilgrims}</b>${k.capacity ? `<span class="small muted"> من ${k.capacity}</span>` : ''}<div class="small ${n.profit < 0 ? 'danger' : 'ok'}">ربح متوقع ${h.n0(n.profit)}</div></div></div>`).join('') || '<div class="muted small">لا برامج — أضف برنامجاً.</div>'}
        <div class="row" style="margin-top:8px"><button class="btn sm" data-act="go" data-page="hajjPackages">إدارة البرامج وكشف التكلفة ←</button></div></div>
      <div class="card"><h3>🔄 مراحل ملفات الحجاج</h3><div class="funnel">${stageCount.map(([st, n]) => `<div class="fn"><span>${esc(Hj.STAGES[st].ar)}</span><b class="num">${n}</b></div>`).join('') || '<div class="muted small">لا حجاج بعد.</div>'}</div>
        <h3 style="margin-top:12px">💱 الالتزام بالريال</h3><div class="small">المطلوب للموسم ≈ <b class="num">${h.n0(sum('sarNeed'))}</b> ر.س (بسعر التثبيت ${ss.fxLock} = ${h.egp(sum('sarNeed') * ss.fxLock)}) · التنفيذي الآن ${s.fx.current}${ss.fxLock ? ` → فرق ${h.egp(sum('sarNeed') * (s.fx.current - ss.fxLock))}` : ''}</div></div></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>📅 أيام الحج</h3>${days.map((d) => `<div class="task-row ${d.date === today ? 'late' : ''}"><div><b>${esc(d.hijri)}</b> <span class="num muted">${esc(d.date)}</span><div class="small muted">${esc(d.text)}</div></div></div>`).join('') || '<div class="muted small">حدد يوم التروية من إعدادات الموسم.</div>'}</div>
      <div class="card"><h3>⏰ المواعيد النهائية والضمانات</h3>${(ss.deadlines || []).map((d) => `<div class="task-row ${!d.done && d.date < today ? 'late' : ''}"><span>${d.done ? '✅' : '⏳'} ${esc(d.label)}</span><span class="num ${!d.done && d.date < today ? 'danger' : ''}">${esc(d.date)}</span></div>`).join('')}
        ${(ss.guarantees || []).map((g) => `<div class="task-row"><span>🏦 خطاب ضمان ${esc(g.bank)} ${esc(g.ref || '')}</span><span>${h.egp(g.amount)} · حتى <span class="num">${esc(g.expiry || '—')}</span></span></div>`).join('')}</div></div>`;
  };

  // ================================================================ SEASON
  App.pages.hajjSeason = () => {
    const s = S(), ss = curSeason(); if (!ss) return noSeason();
    const i = s.hajj.seasons.indexOf(ss), b = (k) => `hajj.seasons.${i}.${k}`, ro = ss.closed ? 'disabled' : '';
    const inp = (k, label, type = 'text', extra = '') => `<div class="field"><label>${label}</label><input class="input" type="${type}" data-bind="${b(k)}" value="${esc(App.getPath(s, b(k)) ?? '')}" ${ro} ${extra}></div>`;
    return `<div class="page-head"><div><h2>⚙️ إعدادات الموسم</h2><p>كل القواعد هنا قابلة للتعديل لأن لوائح الحج بتتغير كل سنة — راجع تعليمات الجهة المنظمة</p></div><div class="row">${ssPicker()}<button class="btn" data-act="hjSeasonForm">+ موسم جديد</button></div></div>
    <div class="grid g2"><div class="card"><h3>📅 الموسم</h3><div class="grid g2">${inp('name', 'اسم الموسم')}${inp('hijriYear', 'السنة الهجرية', 'number')}${inp('gregorianYear', 'السنة الميلادية', 'number')}${inp('tarwiyah', 'يوم التروية (8 ذو الحجة)', 'date')}
        ${inp('fxLock', 'سعر تثبيت الريال للتسعير', 'number', 'step="0.01"')}${inp('usdRate', 'سعر الدولار', 'number', 'step="0.01"')}</div></div>
      <div class="card"><h3>✅ شروط الأهلية</h3><div class="grid g2">${inp('rules.yearsSinceLastHajj', 'سنوات من آخر حجة', 'number')}${inp('rules.passportMonths', 'صلاحية الجواز بعد العودة (شهور)', 'number')}
        ${inp('rules.minAge', 'أقل سن', 'number')}${inp('rules.maxAge', 'السن اللي يحتاج موافقة طبية', 'number')}${inp('rules.mahramUnder', 'سيدة أقل من (سنة) تحتاج محرم — 0 = غير مطلوب', 'number')}</div></div></div>
    <div class="card" style="margin-top:14px"><div class="row"><h3 style="margin:0">🎫 الحصة (التأشيرات) ومصادرها</h3><span class="spacer"></span>${ss.closed ? '' : '<button class="btn sm" data-act="hjAddRow" data-k="quota">+ مصدر</button>'}</div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>المصدر</th><th>الاسم</th><th>عدد التأشيرات</th><th>تكلفة التأشيرة (للشريك)</th><th></th></tr></thead><tbody>${(ss.quota || []).map((q, qi) => `<tr>
        <td><select class="input sm" data-bind="${b(`quota.${qi}.source`)}" ${ro}>${opt('MINISTRY', q.source, 'حصة الشركة')}${opt('PARTNER', q.source, 'شريك / تضامن')}</select></td>
        <td><input class="input sm" data-bind="${b(`quota.${qi}.name`)}" value="${esc(q.name)}" ${ro}></td><td><input class="input sm num" type="number" data-bind="${b(`quota.${qi}.visas`)}" value="${q.visas}" ${ro}></td>
        <td><input class="input sm num" type="number" data-bind="${b(`quota.${qi}.fee`)}" value="${q.fee || 0}" ${ro}></td><td>${ss.closed ? '' : `<button class="btn sm ghost" data-act="hjDelRow" data-k="quota" data-i="${qi}">🗑️</button>`}</td></tr>`).join('')}</tbody></table></div>
      <div class="small muted">المستخدم: ${Hj.quotaUsed(s, ss)} من ${Hj.quotaTotal(ss)} — عند اكتمال الحصة يدخل الحاج الجديد قائمة الانتظار تلقائياً. تكلفة تأشيرة الشريك تُضاف لكشف تكلفة البرنامج اللي بيستخدمها.</div></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><div class="row"><h3 style="margin:0">🏦 خطابات الضمان</h3><span class="spacer"></span>${ss.closed ? '' : '<button class="btn sm" data-act="hjAddRow" data-k="guarantees">+ خطاب</button>'}</div>
        ${(ss.guarantees || []).map((g, gi) => `<div class="grid g4" style="margin-top:6px"><input class="input sm" placeholder="البنك" data-bind="${b(`guarantees.${gi}.bank`)}" value="${esc(g.bank)}" ${ro}><input class="input sm" placeholder="المرجع" data-bind="${b(`guarantees.${gi}.ref`)}" value="${esc(g.ref || '')}" ${ro}>
          <input class="input sm num" type="number" data-bind="${b(`guarantees.${gi}.amount`)}" value="${g.amount}" ${ro}><input class="input sm" type="date" data-bind="${b(`guarantees.${gi}.expiry`)}" value="${esc(g.expiry || '')}" ${ro}></div>`).join('')}
        <div class="small muted" style="margin-top:6px">الهامش النقدي المحجوز للضمان يُسجل بقيد يومية على حساب 1110.</div></div>
      <div class="card"><div class="row"><h3 style="margin:0">⏰ المواعيد النهائية</h3><span class="spacer"></span>${ss.closed ? '' : '<button class="btn sm" data-act="hjAddRow" data-k="deadlines">+ موعد</button>'}</div>
        ${(ss.deadlines || []).map((d, di) => `<div class="row" style="margin-top:6px;flex-wrap:nowrap"><input type="checkbox" data-bind="${b(`deadlines.${di}.done`)}" ${d.done ? 'checked' : ''} ${ro}><input class="input sm" style="flex:2" data-bind="${b(`deadlines.${di}.label`)}" value="${esc(d.label)}" ${ro}><input class="input sm" style="flex:1" type="date" data-bind="${b(`deadlines.${di}.date`)}" value="${esc(d.date)}" ${ro}></div>`).join('')}</div></div>
    <div class="card" style="margin-top:14px"><h3>🔒 إقفال الموسم</h3>
      ${ss.closed ? `<div class="alert info">تم الإقفال بواسطة ${esc(ss.closedBy)} — ${h.dt(ss.closedAt)}</div>` : `<p class="small">بعد عودة الحجاج: يتحول الإيراد المؤجل (2108) إلى إيرادات الحج (4107)، والمصروفات المدفوعة مقدماً (1109) إلى تكلفة الحج (5108) لكل برنامج، ويُقفل الموسم ضد أي تسجيل جديد.</p>
        <button class="btn danger" data-act="hjClose">🔒 إقفال الموسم وترحيل القيود</button>`}</div>`;
  };
  App.actions.hjSeasonForm = () => {
    const y = new Date().getFullYear() + 1;
    App.modal(`<h3>⛰️ موسم حج جديد</h3><div class="grid g2">${field('hs-name', 'اسم الموسم', `موسم حج ${y}`)}${field('hs-hy', 'السنة الهجرية', '', 'type="number"')}${field('hs-tar', 'يوم التروية (تقريبي — يُعدل بعد الإعلان)', '', 'type="date"')}${field('hs-fx', 'سعر تثبيت الريال', S().fx.current, 'type="number" step="0.01"')}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="hjSeasonSave">إنشاء</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.hjSeasonSave = () => {
    const s = S(), tar = App.val('hs-tar');
    const ss = { id: Hj.uid('SS'), code: 'HJ-' + (App.val('hs-hy') || ''), name: App.val('hs-name'), hijriYear: Number(App.val('hs-hy')) || null, gregorianYear: tar ? Number(tar.slice(0, 4)) : new Date().getFullYear() + 1, tarwiyah: tar,
      fxLock: Number(App.val('hs-fx')) || s.fx.current, usdRate: 0, closed: false, quota: [{ id: 'Q1', source: 'MINISTRY', name: 'حصة الشركة', visas: 0, fee: 0 }], guarantees: [], deadlines: [],
      rules: { yearsSinceLastHajj: 5, passportMonths: 6, minAge: 18, maxAge: 80, mahramUnder: 0 } };
    s.hajj.seasons.push(ss); App.ui.hjSs = ss.id; done(`إنشاء ${ss.name}`); App.actions.go({ page: 'hajjSeason' });
  };
  App.actions.hjAddRow = (d) => {
    const ss = curSeason(), row = { quota: { id: Hj.uid('Q'), source: 'PARTNER', name: 'تضامن', visas: 0, fee: 0 }, guarantees: { id: Hj.uid('G'), bank: '', ref: '', amount: 0, expiry: '' }, deadlines: { id: Hj.uid('D'), label: '', date: E.iso(new Date()), done: false } }[d.k];
    (ss[d.k] = ss[d.k] || []).push(row); App.save(); App.render();
  };
  App.actions.hjDelRow = (d) => { curSeason()[d.k].splice(Number(d.i), 1); App.save(); App.render(); };
  App.actions.hjClose = () => {
    const ss = curSeason();
    if (!App.isApprover()) return App.toast('إقفال الموسم من صلاحية المحاسب أو المدير', 'err');
    const active = S().hajj.pilgrims.filter((p) => pkgsOf(ss).some((k) => k.id === p.packageId) && Hj.ACTIVE(p) && p.stage !== 'RETURNED').length;
    if (!confirm(`إقفال ${ss.name}؟${active ? `\n⚠️ ${active} حاج لم تُسجل عودتهم بعد.` : ''}\nسيتم ترحيل القيود ولا يمكن التراجع إلا بقيد عكسي.`)) return;
    try { const r = Hj.closeSeason(S(), ss.id, App.actor()); done(`إقفال ${ss.name} (${r.length} قيد)`); App.toast(`✅ تم الإقفال وترحيل ${r.length} قيد`); } catch (e) { App.toast(e.message, 'err'); }
  };

  // ================================================================ PROGRAMS & COST SHEET
  App.pages.hajjPackages = () => {
    const s = S(), ss = curSeason(); if (!ss) return noSeason();
    return `<div class="page-head"><div><h2>📦 برامج الحج وكشف التكلفة</h2><p>تكلفة الحاج لكل نوع غرفة = الإقامات (ريال × سعر التثبيت) + البنود لكل حاج + نصيبه من التكاليف الجماعية + تأشيرة الشريك</p></div><div class="row">${ssPicker()}${ss.closed ? '' : '<button class="btn primary" data-act="hjPkgForm">+ برنامج</button>'}</div></div>
    ${pkgsOf(ss).map((k) => { const cs = Hj.costSheet(s, k), n = Hj.packageNumbers(s, k); return `<div class="card" style="margin-bottom:14px">
      <div class="row"><h3 style="margin:0">${esc(k.code)} · ${esc(k.name)}</h3><span class="chip gold">${lvl(k)}</span><span class="chip">${esc(Hj.MASHAIR[k.mashair])}</span><span class="chip">${esc(Hj.ROUTE[k.route])} · ${esc(Hj.TRANSPORT[k.transport])}</span><span class="spacer"></span>
        <button class="btn sm" data-act="hjCostPrint" data-id="${k.id}">🖨️ كشف التكلفة</button>${ss.closed ? '' : `<button class="btn sm ghost" data-act="hjPkgForm" data-id="${k.id}">✏️</button>`}</div>
      <div class="small muted" style="margin:4px 0">${esc(k.departDate)} ← ${esc(k.returnDate)} · ${(k.stays || []).map((st) => `${esc(Hj.CITIES[st.city])}: ${esc(st.hotel)} (${st.nights} ليالٍ)`).join(' · ')}</div>
      <div class="tbl-wrap"><table class="t small"><thead><tr><th>الغرفة</th>${(k.stays || []).map((st) => `<th>${esc(Hj.CITIES[st.city])}<div class="small muted" style="font-weight:400">${esc(st.hotel)} · ${st.nights} ليالٍ</div></th>`).join('')}<th>بنود لكل حاج</th><th>نصيب الجماعي</th>${cs.quotaFee ? '<th>تأشيرة الشريك</th>' : ''}<th>التكلفة</th><th>سعر البيع</th><th>الهامش</th></tr></thead><tbody>
        ${Object.entries(cs.rows).map(([rt, r]) => `<tr><td>${Hj.ROOMS[rt].ar}</td>${r.stays.map((x) => `<td>${h.n0(x.egp)}</td>`).join('')}<td>${h.n0(cs.paxItems)}</td><td>${h.n0(cs.groupShare)}</td>${cs.quotaFee ? `<td>${h.n0(cs.quotaFee)}</td>` : ''}
          <td><b>${h.n0(r.cost)}</b></td><td>${h.n0(r.price)}</td><td class="${r.margin < 0 ? 'danger' : 'ok'}">${h.n0(r.margin)} <span class="faint">(${r.marginPct ?? '—'}%)</span></td></tr>`).join('')}</tbody></table></div>
      <div class="small muted">التكاليف الجماعية ${h.n0(cs.groupTotal)} ج.م موزعة على الطاقة ${k.capacity} · نقطة التعادل ≈ ${cs.breakEven ?? '—'} حاج · المسجلين ${n.pilgrims} · الهدي ${k.hadyIncluded ? 'ضمن السعر' : `${k.hadySar} ر.س يُضاف للتمتع والقران`}</div></div>`; }).join('') || '<div class="card muted">لا برامج لهذا الموسم.</div>'}`;
  };
  App.actions.hjPkgForm = (d) => {
    const s = S(), ss = curSeason(), k = d.id ? Hj.pkg(s, d.id) : { level: 'STANDARD', duration: 'LONG', route: 'MAD_FIRST', transport: 'AIR', mashair: 'B', capacity: 45, stays: [], costItems: [], prices: {}, plan: [{ label: 'مقدم الحجز', pct: 30, daysBefore: 200 }, { label: 'القسط الثاني', pct: 40, daysBefore: 120 }, { label: 'القسط الأخير', pct: 30, daysBefore: 45 }],
      cancelPolicy: [{ daysBefore: 180, feePct: 5 }, { daysBefore: 90, feePct: 25 }, { daysBefore: 45, feePct: 60 }, { daysBefore: 15, feePct: 100 }], hadyIncluded: false, hadySar: 750, nonRefundableAfterSubmit: 0, upgrades: [], commissions: {} };
    const sel = (id, obj, cur) => `<select class="input" id="${id}">${Object.entries(obj).map(([a, b]) => opt(a, cur, b)).join('')}</select>`;
    const lines = (arr, f) => arr.map(f).join('\n');
    App.modal(`<h3>${d.id ? 'تعديل' : 'برنامج حج جديد'} ${k.code ? `<span class="chip">${esc(k.code)}</span>` : ''}</h3><div class="grid g4">
      ${field('hk-name', 'اسم البرنامج', k.name)}<div class="field"><label>المستوى</label>${sel('hk-lvl', Hj.LEVELS, k.level)}</div><div class="field"><label>المدة</label>${sel('hk-dur', Hj.DURATION, k.duration)}</div><div class="field"><label>المسار</label>${sel('hk-route', Hj.ROUTE, k.route)}</div>
      <div class="field"><label>السفر</label>${sel('hk-tr', Hj.TRANSPORT, k.transport)}</div><div class="field"><label>مخيمات المشاعر</label>${sel('hk-mash', Hj.MASHAIR, k.mashair)}</div>${field('hk-dep', 'السفر', k.departDate, 'type="date"')}${field('hk-ret', 'العودة', k.returnDate, 'type="date"')}
      ${field('hk-cap', 'الطاقة (حجاج)', k.capacity, 'type="number"')}${field('hk-hady', 'سعر الهدي (ر.س)', k.hadySar, 'type="number"')}<label class="chk"><input type="checkbox" id="hk-hadyin" ${k.hadyIncluded ? 'checked' : ''}> الهدي ضمن السعر</label>${field('hk-nr', 'غير مسترد بعد الرفع للجهات (ج.م)', k.nonRefundableAfterSubmit, 'type="number"')}
      ${field('hk-pvf', 'تكلفة تأشيرة الشريك لكل حاج (ج.م)', k.partnerVisaFee, 'type="number"')}${['QUAD', 'TRIPLE', 'DOUBLE', 'SINGLE'].map((r) => field('hk-p-' + r, `سعر البيع ${Hj.ROOMS[r].ar}`, (k.prices || {})[r], 'type="number"')).join('')}</div>
      <div class="grid g2" style="margin-top:8px">
        ${area('hk-stays', 'الإقامات (سطر لكل إقامة: المدينة MAK/MAD/AZZ | الفندق | الليالي | تكلفة الفرد رباعي | ثلاثي | ثنائي | فردي — بالريال)', lines(k.stays || [], (x) => [x.city, x.hotel, x.nights, (x.cost || {}).QUAD || '', (x.cost || {}).TRIPLE || '', (x.cost || {}).DOUBLE || '', (x.cost || {}).SINGLE || ''].join(' | ')), 4)}
        ${area('hk-items', `بنود التكلفة (سطر لكل بند: النوع ${Object.keys(Hj.COST_CATS).join('/')} | البيان | العملة SAR/EGP/USD | المبلغ | PAX لكل حاج أو GROUP للمجموعة)`, lines(k.costItems || [], (x) => [x.cat, x.name, x.currency, x.amount, x.per].join(' | ')), 5)}
        ${area('hk-plan', 'خطة الأقساط (سطر لكل قسط: الاسم | النسبة % | قبل السفر بـ يوم)', lines(k.plan || [], (x) => [x.label, x.pct, x.daysBefore].join(' | ')))}
        ${area('hk-cancel', 'جدول الإلغاء (سطر: قبل السفر بـ أقل من يوم | الغرامة %)', lines(k.cancelPolicy || [], (x) => [x.daysBefore, x.feePct].join(' | ')))}
        ${area('hk-up', 'الترقيات الاختيارية (سطر: الاسم | السعر ج.م)', lines(k.upgrades || [], (x) => [x.name, x.price].join(' | ')))}
        ${App.role() === 'OWNER' ? field('hk-comm', 'عمولة المندوب لكل حاج (ج.م)', (k.commissions || {}).default, 'type="number"') : ''}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="hjPkgSave" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
  };
  const rows = (id) => String(document.getElementById(id).value || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]);
  const nv = (id) => { const el = document.getElementById(id); return el && el.value !== '' ? Number(el.value) : null; };
  App.actions.hjPkgSave = (d) => {
    const s = S(), ss = curSeason(), name = String(App.val('hk-name') || '').trim();
    if (name.length < 3) return App.toast('اكتب اسم البرنامج', 'err');
    const k = d.id ? Hj.pkg(s, d.id) : { id: Hj.uid('HP'), seasonId: ss.id, code: `${ss.code}-${Acc.nextNo(s, 'C_HP', 'P', 2)}`, commissions: {} };
    const prices = {}; for (const r of ['QUAD', 'TRIPLE', 'DOUBLE', 'SINGLE']) { const v = nv('hk-p-' + r); if (v) prices[r] = v; }
    if (!Object.keys(prices).length) return App.toast('حدد سعر بيع لنوع غرفة واحد على الأقل', 'err');
    const stays = rows('hk-stays').map(([city, hotel, nights, q, t, dd, sg]) => ({ city: Hj.CITIES[city] ? city : 'MAK', hotel, nights: Number(nights) || 0, currency: 'SAR', cost: Object.fromEntries([['QUAD', q], ['TRIPLE', t], ['DOUBLE', dd], ['SINGLE', sg]].filter(([, v]) => v).map(([r, v]) => [r, Number(v)])) }));
    const plan = rows('hk-plan').map(([label, pct, days]) => ({ label, pct: Number(pct) || 0, daysBefore: Number(days) || 0 }));
    if (plan.length && Math.round(plan.reduce((x, p) => x + p.pct, 0)) !== 100) return App.toast('مجموع نسب الأقساط لازم = 100%', 'err');
    Object.assign(k, { name, level: App.val('hk-lvl'), duration: App.val('hk-dur'), route: App.val('hk-route'), transport: App.val('hk-tr'), mashair: App.val('hk-mash'), departDate: App.val('hk-dep'), returnDate: App.val('hk-ret'),
      capacity: nv('hk-cap') || 0, hadySar: nv('hk-hady') || 0, hadyIncluded: App.val('hk-hadyin'), nonRefundableAfterSubmit: nv('hk-nr') || 0, partnerVisaFee: nv('hk-pvf') || 0, prices, stays,
      costItems: rows('hk-items').map(([cat, n, cur, amt, per], i) => ({ id: 'C' + (i + 1), cat: Hj.COST_CATS[cat] ? cat : 'OTHER', name: n, currency: ['SAR', 'EGP', 'USD'].includes(cur) ? cur : 'SAR', amount: Number(amt) || 0, per: per === 'GROUP' ? 'GROUP' : 'PAX' })),
      plan, cancelPolicy: rows('hk-cancel').map(([days, pct]) => ({ daysBefore: Number(days) || 0, feePct: Number(pct) || 0 })), upgrades: rows('hk-up').map(([n, p], i) => ({ id: (k.upgrades || [])[i] ? k.upgrades[i].id : Hj.uid('U'), name: n, price: Number(p) || 0 })) });
    if (App.role() === 'OWNER') { const c = nv('hk-comm'); k.commissions = c != null ? { default: c } : {}; }
    if (!d.id) s.hajj.packages.push(k);
    done(`${d.id ? 'تعديل' : 'إنشاء'} برنامج حج ${k.code}`);
  };
  App.actions.hjCostPrint = (d) => {
    const s = S(), k = Hj.pkg(s, d.id), cs = Hj.costSheet(s, k), ss = Hj.season(s, k.seasonId);
    App.printDoc('Cost ' + k.code, `<div class="head"><div><h2>كشف تكلفة ${esc(k.name)}</h2><div class="muted">${esc(ss.name)} · سعر تثبيت الريال ${ss.fxLock}</div></div><div>${esc(k.code)}</div></div>
      <h3>البنود لكل حاج</h3><table><tr><th>البند</th><th>العملة</th><th>المبلغ</th><th>بالجنيه</th></tr>${cs.perPax.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.currency}</td><td>${h.n2(x.amount)}</td><td>${h.n2(x.egp)}</td></tr>`).join('')}<tr><th colspan="3">الإجمالي</th><th>${h.n2(cs.paxItems)}</th></tr></table>
      <h3>التكاليف الجماعية</h3><table><tr><th>البند</th><th>العملة</th><th>المبلغ</th><th>بالجنيه</th></tr>${cs.perGroup.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.currency}</td><td>${h.n2(x.amount)}</td><td>${h.n2(x.egp)}</td></tr>`).join('')}<tr><th colspan="3">الإجمالي ÷ ${k.capacity} حاج</th><th>${h.n2(cs.groupTotal)} → ${h.n2(cs.groupShare)}</th></tr></table>
      <h3>التكلفة والسعر لكل نوع غرفة</h3><table><tr><th>الغرفة</th><th>الإقامات</th><th>التكلفة</th><th>البيع</th><th>الهامش</th></tr>${Object.entries(cs.rows).map(([rt, r]) => `<tr><td>${Hj.ROOMS[rt].ar}</td><td>${r.stays.map((x) => `${Hj.CITIES[x.city]} ${h.n0(x.egp)}`).join('<br>')}</td><td>${h.n2(r.cost)}</td><td>${h.n2(r.price)}</td><td>${h.n2(r.margin)} (${r.marginPct}%)</td></tr>`).join('')}</table>
      <p>نقطة التعادل ≈ ${cs.breakEven ?? '—'} حاج${cs.quotaFee ? ` · يشمل تكلفة تأشيرة شريك ${h.n0(cs.quotaFee)} لكل حاج` : ''}</p>`);
  };

  // ================================================================ PILGRIMS
  const blank = () => ({ packageId: (pkgsOf(curSeason()).find(() => true) || {}).id || '', nameAr: '', nameEn: '', gender: 'M', dob: '', nid: '', passport: '', passportExp: '', phone: '', lastHajjYear: '', nusuk: 'TAMATTU', roomType: 'QUAD', familyId: '', mahramId: '', agentId: '', discountPct: 0, upgrades: [], branchId: App.myBranch() || 'BR1' });
  App.pages.hajjPilgrims = () => {
    const s = S(), ss = curSeason(); if (!ss) return noSeason();
    const d = App.ui.hjd || (App.ui.hjd = blank()), k = Hj.pkg(s, d.packageId);
    const ks = pkgsOf(ss), q = String(App.ui.hjQ || '').trim(), st = App.ui.hjSt || 'ACTIVE', kf = App.ui.hjK || '';
    const list = s.hajj.pilgrims.filter((p) => ks.some((x) => x.id === p.packageId) && (!kf || p.packageId === kf) && (st === 'ALL' || (st === 'ACTIVE' ? Hj.ACTIVE(p) : st === 'ISSUES' ? Hj.eligibility(s, p).some((x) => x.level === 'err') : p.stage === st))
      && (!q || [p.code, p.nameAr, p.nameEn, p.phone, p.passport, p.nid].join(' ').includes(q)));
    const pv = k ? Hj.priceFor(s, k, d) : null;
    const others = s.hajj.pilgrims.filter((p) => p.packageId === d.packageId && Hj.ACTIVE(p));
    return `<div class="page-head"><div><h2>🧕🧔 الحجاج</h2><p>تسجيل بفحص أهلية آلي · المراحل · الأسر والمحارم · الأقساط من خطة البرنامج</p></div><div class="row">${ssPicker()}</div></div>
    ${ss.closed ? '' : `<details class="card" ${App.ui.hjFormOpen === false ? '' : 'open'}><summary style="cursor:pointer"><h3 style="display:inline">➕ تسجيل حاج</h3></summary>
      <div class="grid g-side" style="margin-top:10px"><div class="grid g3">
        <div class="field" style="grid-column:span 2"><label>البرنامج</label><select class="input" data-ui="hjd.packageId">${ks.map((x) => opt(x.id, d.packageId, `${x.code} · ${x.name}`)).join('')}</select></div>
        <div class="field"><label>نوع الغرفة</label><select class="input" data-ui="hjd.roomType">${Object.entries(Hj.ROOMS).filter(([r]) => k && (k.prices || {})[r]).map(([r, x]) => opt(r, d.roomType, `${x.ar} — ${h.n0(k.prices[r])}`)).join('')}</select></div>
        <div class="field"><label>الاسم بالعربية</label><input class="input" data-ui="hjd.nameAr" value="${esc(d.nameAr)}"></div><div class="field"><label>الاسم بالجواز</label><input class="input" style="direction:ltr" data-ui="hjd.nameEn" value="${esc(d.nameEn)}"></div>
        <div class="field"><label>النوع</label><select class="input" data-ui="hjd.gender">${opt('M', d.gender, 'ذكر')}${opt('F', d.gender, 'أنثى')}</select></div>
        <div class="field"><label>تاريخ الميلاد</label><input class="input" type="date" data-ui="hjd.dob" value="${esc(d.dob)}"></div><div class="field"><label>الرقم القومي</label><input class="input" style="direction:ltr" data-ui="hjd.nid" value="${esc(d.nid)}"></div>
        <div class="field"><label>الهاتف</label><input class="input" style="direction:ltr" data-ui="hjd.phone" value="${esc(d.phone)}"></div>
        <div class="field"><label>رقم الجواز</label><input class="input" style="direction:ltr" data-ui="hjd.passport" value="${esc(d.passport)}"></div><div class="field"><label>انتهاء الجواز</label><input class="input" type="date" data-ui="hjd.passportExp" value="${esc(d.passportExp)}"></div>
        <div class="field"><label>سنة آخر حجة (فارغ = أول مرة)</label><input class="input" type="number" data-ui="hjd.lastHajjYear" value="${esc(d.lastHajjYear)}"></div>
        <div class="field"><label>النسك</label><select class="input" data-ui="hjd.nusuk">${Object.entries(Hj.NUSUK).map(([a, b]) => opt(a, d.nusuk, b)).join('')}</select></div>
        <div class="field"><label>الأسرة (نفس الرقم = غرفة واحدة وفوج واحد)</label><input class="input" data-ui="hjd.familyId" value="${esc(d.familyId)}" placeholder="مثال: أسرة 1"></div>
        <div class="field"><label>المحرم</label><select class="input" data-ui="hjd.mahramId">${opt('', d.mahramId, '—')}${others.filter((p) => p.gender === 'M').map((p) => opt(p.id, d.mahramId, `${p.code} · ${p.nameAr}`)).join('')}</select></div>
        <div class="field"><label>القناة</label><select class="input" data-ui="hjd.agentId">${opt('', d.agentId, 'مباشر')}${s.agents.map((a) => opt(a.id, d.agentId, a.name)).join('')}</select></div>
        <div class="field"><label>خصم % ${App.role() === 'OWNER' ? '' : '(يُرفع للمالك)'}</label><input class="input" type="number" min="0" step="0.5" data-ui="hjd.discountPct" value="${d.discountPct}"></div>
        ${k ? (k.upgrades || []).map((u) => `<label class="chk"><input type="checkbox" data-act-change="hjUp" data-u="${u.id}" ${d.upgrades.includes(u.id) ? 'checked' : ''}> ${esc(u.name)} (+${h.n0(u.price)})</label>`).join('') : ''}</div>
      <div class="card" style="align-self:start"><h3>💵 السعر</h3>${pv && !pv.error ? `<table class="t small"><tbody>${pv.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${h.n0(l.total)}</td></tr>`).join('')}${pv.discount ? `<tr><td>خصم</td><td>−${h.n0(pv.discount)}</td></tr>` : ''}<tr><td><b>الإجمالي</b></td><td><b class="gold">${h.egp(pv.net)}</b></td></tr></tbody></table>
        ${k && (k.plan || []).length ? `<div class="small muted" style="margin-top:6px">${k.plan.map((x) => `${esc(x.label)} ${x.pct}%`).join(' · ')}</div>` : ''}` : `<div class="muted small">${esc((pv && pv.error) || 'اختر البرنامج')}</div>`}
        ${(() => { const iss = k ? Hj.eligibility(s, { ...d, packageId: d.packageId }).filter((x) => !/مستندات/.test(x.text)) : []; return iss.map((x) => `<div class="alert ${x.level === 'err' ? 'err' : 'warn'}" style="margin-top:6px">${esc(x.text)}</div>`).join(''); })()}
        <div class="small muted" style="margin-top:6px">المتاح في الحصة: ${Math.max(0, Hj.quotaTotal(ss) - Hj.quotaUsed(s, ss))}</div>
        <button class="btn primary" style="width:100%;margin-top:10px" data-act="hjRegister">💾 تسجيل الحاج</button></div></div></details>`}
    <div class="card" style="margin-top:14px"><div class="row"><h3 style="margin:0">📋 الحجاج (${list.length})</h3><span class="spacer"></span>
      <select class="input" style="width:auto" data-ui="hjK">${opt('', kf, 'كل البرامج')}${ks.map((x) => opt(x.id, kf, x.code)).join('')}</select>
      <select class="input" style="width:auto" data-ui="hjSt">${opt('ACTIVE', st, 'النشطين')}${opt('ISSUES', st, '⛔ مشاكل أهلية')}${Object.entries(Hj.STAGES).map(([a, b]) => opt(a, st, b.ar)).join('')}${opt('ALL', st, 'الكل')}</select>
      <input class="input" style="width:180px" data-ui="hjQ" value="${esc(q)}" placeholder="بحث"></div>
      <div class="tbl-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>الكود</th><th>الحاج</th><th>البرنامج / الغرفة</th><th>المرحلة</th><th>الأهلية</th><th>السعر</th><th>المسدد</th><th>الفوج</th></tr></thead><tbody>
      ${list.map((p) => { const iss = Hj.eligibility(s, p), k2 = Hj.pkg(s, p.packageId); return `<tr class="clickable" data-act="go" data-page="hajjPilgrim" data-id="${p.id}"><td class="num">${esc(p.code)}</td>
        <td><b>${esc(p.nameAr)}</b> ${p.gender === 'F' ? '♀' : '♂'}<div class="small muted num">${esc(p.phone)} · ${esc(p.passport || '')}</div></td><td class="small">${esc(k2 ? k2.code : '')}<br>${Hj.ROOMS[p.roomType].ar}${p.familyId ? ` · 👪 ${esc(p.familyId)}` : ''}</td>
        <td>${stageChip(p.stage)}</td><td>${iss.some((x) => x.level === 'err') ? '<span class="chip danger">⛔ مشكلة</span>' : iss.length ? `<span class="chip hold">${iss.length} ملاحظة</span>` : '<span class="chip ok">✓</span>'}</td>
        <td>${h.egp(p.net)}${p.status === 'PENDING_APPROVAL' ? '<div class="chip hold">خصم بانتظار المالك</div>' : ''}</td><td>${h.progress(p.paid, p.net)}</td><td class="small">${esc(((s.hajj.groups.find((g) => g.id === p.groupId)) || {}).name || '—')}</td></tr>`; }).join('') || '<tr><td colspan="8" class="muted">لا حجاج.</td></tr>'}</tbody></table></div></div>`;
  };
  App.actions.hjUp = (d, el) => { const x = App.ui.hjd; x.upgrades = el.checked ? [...new Set([...x.upgrades, d.u])] : x.upgrades.filter((u) => u !== d.u); App.render(); };
  App.actions.hjRegister = () => {
    const s = S(), d = App.ui.hjd;
    let p;
    try { p = Hj.register(s, { ...d, discountPct: Number(d.discountPct) || 0, lastHajjYear: d.lastHajjYear ? Number(d.lastHajjYear) : '' }, App.actor()); } catch (e) { return App.toast('⛔ ' + e.message, 'err'); }
    App.ui.hjd = { ...blank(), packageId: d.packageId };
    done(`تسجيل حاج ${p.code} ${p.nameAr}`);
    App.toast(p.stage === 'WAITLIST' ? `⏳ ${p.code} في قائمة الانتظار — الحصة مكتملة` : `✅ ${p.code} — سجّل مقدم الحجز بسند قبض`);
    App.actions.go({ page: 'hajjPilgrim', id: p.id });
  };

  // ---------------------------------------------------------------- pilgrim file
  App.pages.hajjPilgrim = () => {
    const s = S(), p = pil(App.ui.viewId); if (!p) return '<div class="card">اختر حاجاً.</div>';
    const k = Hj.pkg(s, p.packageId), ss = Hj.season(s, k.seasonId), iss = Hj.eligibility(s, p), grp = s.hajj.groups.find((g) => g.id === p.groupId);
    const fam = s.hajj.pilgrims.filter((x) => x.id !== p.id && ((p.familyId && x.familyId === p.familyId) || x.id === p.mahramId || x.mahramId === p.id));
    const vs = s.vouchers.filter((v) => v.bookingId === p.id), cf = Hj.ACTIVE(p) ? Hj.cancelFee(s, p) : null, next = Object.entries(Hj.STAGES).filter(([, x]) => x.i > Hj.STAGES[p.stage].i && x.i > 0).slice(0, 1)[0];
    const locked = ss.closed || !Hj.ACTIVE(p);
    return `<div class="page-head"><div><h2>${p.gender === 'F' ? '🧕' : '🧔'} ${esc(p.nameAr)} <span class="chip">${esc(p.code)}</span> ${stageChip(p.stage)}</h2><p>${esc(k.code)} · ${esc(k.name)} · ${Hj.ROOMS[p.roomType].ar} · ${esc(Hj.NUSUK[p.nusuk])}</p></div><div class="row">
      ${p.status === 'PENDING_APPROVAL' && App.role() === 'OWNER' ? `<button class="btn gold" data-act="hjApprove" data-id="${p.id}">اعتماد الخصم</button>` : ''}
      ${!locked && next ? `<button class="btn primary" data-act="hjStage" data-id="${p.id}" data-st="${next[0]}">➡️ ${esc(next[1].ar)}</button>` : ''}
      ${p.stage === 'WAITLIST' ? `<button class="btn primary" data-act="hjPromote" data-id="${p.id}">⬆️ نقل من الانتظار</button>` : ''}
      ${Hj.ACTIVE(p) && p.net - p.paid > 0 && p.status !== 'PENDING_APPROVAL' ? `<button class="btn" data-act="hjPay" data-id="${p.id}">💰 سند قبض</button>` : ''}
      ${p.stage === 'CANCELLED' && (p.paid || 0) > (p.cancelFee || 0) ? `<button class="btn" data-act="hjRefund" data-id="${p.id}">↩️ رد ${h.n0(p.paid - p.cancelFee)}</button>` : ''}
      <button class="btn gold" data-act="bookingDoc" data-id="${p.id}">📄 عقد الحج</button><button class="btn" data-act="hjCard" data-id="${p.id}">🪪 كارت الحاج</button><button class="btn" data-act="waBooking" data-id="${p.id}">🟢 واتساب</button>
      ${Hj.ACTIVE(p) && !ss.closed ? `<button class="btn danger" data-act="hjCancel" data-id="${p.id}">إلغاء</button>` : ''}<button class="btn ghost" data-act="go" data-page="hajjPilgrims">↩</button></div></div>
    ${iss.length ? `<div class="alert-list" style="margin-bottom:12px">${iss.map((x) => `<div class="alert ${x.level === 'err' ? 'err' : 'warn'}">${x.level === 'err' ? '⛔' : '⚠️'} ${esc(x.text)}</div>`).join('')}</div>` : '<div class="alert info" style="margin-bottom:12px">✅ مستوفي شروط الأهلية والمستندات</div>'}
    <div class="grid g4"><div class="card kpi"><div class="lbl">قيمة الحج</div><div class="val">${h.egp(p.net)}</div><div class="hint">${p.discountPct ? `خصم ${p.discountPct}%` : ''}${p.cancelFee != null && p.stage === 'CANCELLED' ? ' · غرامة الإلغاء' : ''}</div></div>
      <div class="card kpi"><div class="lbl">المسدد</div><div class="val ok">${h.egp(p.paid)}</div><div class="hint">${h.progress(p.paid, p.net)}</div></div>
      <div class="card kpi"><div class="lbl">المتبقي</div><div class="val ${p.net - p.paid > 0 ? 'danger' : ''}">${h.egp(Math.max(0, p.net - p.paid))}</div></div>
      <div class="card kpi"><div class="lbl">الفوج / الخيمة</div><div class="val" style="font-size:16px">${esc(grp ? grp.name : '—')}</div><div class="hint">${esc(p.tent || '—')} · أتوبيس ${esc(p.bus || '—')}</div></div></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>🪪 البيانات</h3><div class="grid g2">${[['nameAr', 'الاسم'], ['nameEn', 'الاسم بالجواز'], ['phone', 'الهاتف'], ['nid', 'الرقم القومي'], ['passport', 'الجواز'], ['passportExp', 'انتهاء الجواز', 'date'], ['dob', 'الميلاد', 'date'], ['lastHajjYear', 'آخر حجة', 'number'], ['visaNo', 'رقم التأشيرة'], ['nusukNo', 'رقم نسك / البطاقة']]
          .map(([f, l, t]) => `<div class="field"><label>${l}</label><input class="input" ${t ? `type="${t}"` : ''} data-bind="hajj.pilgrims.${s.hajj.pilgrims.indexOf(p)}.${f}" value="${esc(p[f] || '')}" ${locked ? 'disabled' : ''}></div>`).join('')}
          <div class="field"><label>اللياقة الطبية</label><select class="input" data-act-change="hjFit" data-id="${p.id}" ${locked ? 'disabled' : ''}>${opt('', p.medicalFit == null ? '' : String(p.medicalFit), 'لم تُحدد')}${opt('true', String(p.medicalFit), 'لائق')}${opt('false', String(p.medicalFit), 'غير لائق')}</select></div></div>
        <h4 style="margin:12px 0 6px">📎 المستندات</h4><div class="row" style="gap:8px">${Object.entries(Hj.DOCS).map(([f, l]) => `<div style="text-align:center">${h.thumb(p[f], l)}<br><button class="btn sm" data-act="hjDoc" data-id="${p.id}" data-f="${f}">${p[f] ? '🔄' : '📤'} ${l}</button></div>`).join('')}</div></div>
      <div class="stack">
        <div class="card"><h3>💵 الأقساط</h3><table class="t small"><tbody>${(p.installments || []).map((i) => `<tr class="${!i.paid && i.due < E.iso(new Date()) ? 'row-late' : ''}"><td>${esc(i.label)}</td><td class="num">${esc(i.due)}</td><td>${h.n0(i.amount)}</td><td>${i.paid ? (i.waived ? 'أُلغي' : '<span class="chip ok">مسدد</span>') : '<span class="chip hold">مستحق</span>'}</td></tr>`).join('')}</tbody></table>
          ${vs.map((v) => `<div class="task-row"><span>${esc(v.no)} · ${h.egp(v.amount)} ${h.vStatus(v.status)}</span><button class="btn sm ghost" data-act="vPrint" data-id="${v.id}">🖨️</button></div>`).join('')}
          ${cf ? `<div class="small muted" style="margin-top:6px">لو اتلغى النهارده: الغرامة ${h.n0(cf.fee)} (${cf.pct}% — قبل السفر بـ ${cf.days} يوم)${Hj.STAGES[p.stage].i >= 3 ? ' + غير المسترد بعد الرفع للجهات' : ''}</div>` : ''}</div>
        <div class="card"><h3>👪 الأسرة والمحرم</h3>${fam.map((x) => `<div class="task-row"><a href="#" data-act="go" data-page="hajjPilgrim" data-id="${x.id}">${esc(x.code)} · ${esc(x.nameAr)}</a><span class="small muted">${x.id === p.mahramId ? 'المحرم' : x.mahramId === p.id ? 'محرم لها' : 'نفس الأسرة'}</span></div>`).join('') || '<div class="muted small">لا يوجد.</div>'}</div>
        <div class="card"><h3>🏨 التسكين</h3>${(k.stays || []).map((st, si) => `<div class="task-row"><span>${esc(Hj.CITIES[st.city])} — ${esc(st.hotel)}</span><b class="num">${esc((p.rooms || {})[`${st.city}${si}`] || '—')}</b></div>`).join('')}
          <div class="task-row"><span>منى وعرفات (${esc(Hj.MASHAIR[k.mashair])})</span><b>${esc(p.tent || '—')}</b></div></div>
        <div class="card"><h3>🔄 سجل المراحل</h3>${(p.stageLog || []).slice().reverse().map((x) => `<div class="small">${esc(Hj.STAGES[x.stage].ar)} — ${esc(x.by)} · ${h.dt(x.at)}${x.note ? ` · ${esc(x.note)}` : ''}</div>`).join('')}</div></div></div>`;
  };
  App.actions.hjStage = (d) => {
    const s = S(), p = pil(d.id), bad = Hj.eligibility(s, p).filter((x) => x.level === 'err');
    if (['SUBMITTED', 'VISA'].includes(d.st) && bad.length) return App.toast(`⛔ لا يمكن الرفع للجهات: ${bad[0].text}`, 'err');
    if (d.st === 'DOCS' && Hj.eligibility(s, p).some((x) => /مستندات/.test(x.text))) return App.toast('ارفع كل المستندات أولاً', 'err');
    Hj.setStage(p, d.st, App.actor().name); done(`${p.code}: ${Hj.STAGES[d.st].ar}`);
  };
  App.actions.hjPromote = (d) => { try { Hj.promote(S(), pil(d.id), App.actor().name); done('نقل حاج من قائمة الانتظار'); } catch (e) { App.toast(e.message, 'err'); } };
  App.actions.hjFit = (d) => { const p = pil(d.id); p.medicalFit = d.value === '' ? null : d.value === 'true'; App.save(); App.render(); };
  App.actions.hjDoc = async (d) => { const [f] = await App.uploadPicked({ accept: 'image/*,application/pdf', capture: false }); if (f) { pil(d.id)[d.f] = f.id; done(`رفع ${Hj.DOCS[d.f]} للحاج ${pil(d.id).code}`); } };
  App.actions.hjApprove = (d) => {
    if (App.role() !== 'OWNER') return App.toast('اعتماد الخصم لمالك النظام فقط', 'err');
    const s = S(), p = pil(d.id); p.status = 'SOFT_HOLD'; p.approvedBy = App.actor().name; E.applyPayment(p, 0); Acc.syncBooking(s, Hj.costCenter(s, p), p, App.actor().name); done(`اعتماد خصم ${p.code}`);
  };
  App.actions.hjPay = (d) => { const s = S(), p = pil(d.id), nextI = (p.installments || []).find((i) => !i.paid);
    App.openVoucher({ type: 'RV', party: { type: 'customer', id: p.customerId }, amount: nextI ? nextI.amount : E.round2(p.net - p.paid), bookingId: p.id, tripId: p.packageId, branchId: p.branchId, memo: `${nextI ? nextI.label : 'سداد'} — حج ${p.code}`, lockParty: true }); };
  App.actions.hjRefund = (d) => { const p = pil(d.id); App.openVoucher({ type: 'PV', party: { type: 'customer', id: p.customerId }, amount: E.round2(p.paid - p.cancelFee), tripId: p.packageId, memo: `رد مبالغ حاج ملغي ${p.code} بعد خصم الغرامة`, lockParty: true }); };
  App.actions.hjCancel = (d) => {
    const s = S(), p = pil(d.id), cf = Hj.cancelFee(s, p);
    const reason = prompt(`إلغاء ${p.code}؟\nالغرامة ${h.n0(cf.fee)} ج.م — يُرد للحاج ${h.n0(Math.max(0, p.paid - cf.fee))}\nاكتب سبب الإلغاء:`); if (!reason) return;
    const r = Hj.cancel(s, p, App.actor().name, reason);
    done(`إلغاء حاج ${p.code} — غرامة ${r.fee}`); App.toast(r.refundDue ? `تم الإلغاء — اصرف للحاج ${h.n0(r.refundDue)} من زر الرد` : 'تم الإلغاء');
  };
  const cardHtml = (s, p) => { const k = Hj.pkg(s, p.packageId), g = s.hajj.groups.find((x) => x.id === p.groupId);
    return `<div class="hj-card"><div class="hj-top"><b>${esc(s.company.name)}</b><span>${esc(Hj.season(s, k.seasonId).name)}</span></div>
      <div class="hj-body">${p.photoFileId ? `<img src="${App.fileUrl(p.photoFileId)}" alt="">` : '<div class="ph">صورة</div>'}<div><div class="nm">${esc(p.nameAr)}</div><div class="en">${esc(p.nameEn || '')}</div>
      <div>${esc(p.code)} · جواز ${esc(p.passport || '—')}</div><div>الفوج: <b>${esc(g ? g.name : '—')}</b>${g && g.leader ? ` · المشرف ${esc(g.leader)} ${esc(g.phone || '')}` : ''}</div>
      <div>منى/عرفات: <b>${esc(p.tent || '—')}</b> · أتوبيس ${esc(p.bus || '—')}</div><div>${(k.stays || []).map((st, si) => `${esc(Hj.CITIES[st.city])}: ${esc((p.rooms || {})[`${st.city}${si}`] || '—')}`).join(' · ')}</div></div></div>
      <div class="hj-foot">طوارئ: ${esc(s.company.phone || '')}</div></div>`; };
  const CARD_CSS = `<style>.hj-card{width:88mm;border:2px solid #0d3b2c;border-radius:10px;overflow:hidden;display:inline-block;margin:3mm;vertical-align:top;font-size:10px;page-break-inside:avoid}.hj-top{background:#0d3b2c;color:#f3dc9c;display:flex;justify-content:space-between;padding:4px 8px}
    .hj-body{display:flex;gap:6px;padding:6px 8px}.hj-body img,.hj-body .ph{width:22mm;height:28mm;object-fit:cover;border:1px solid #999;display:flex;align-items:center;justify-content:center;color:#999}.nm{font-size:13px;font-weight:700;color:#0d3b2c}.en{direction:ltr;text-align:left;color:#555}
    .hj-foot{background:#f3ead0;padding:3px 8px;color:#5c410c}</style>`;
  App.actions.hjCard = (d) => { const s = S(); App.printDoc('Hajj card', CARD_CSS + cardHtml(s, pil(d.id))); };

  // ================================================================ OPERATIONS
  App.pages.hajjOps = () => {
    const s = S(), ss = curSeason(); if (!ss) return noSeason();
    const ks = pkgsOf(ss), k = Hj.pkg(s, App.ui.hjOpsK) || ks[0]; if (!k) return '<div class="card muted">لا برامج.</div>';
    App.ui.hjOpsK = k.id;
    const tab = App.ui.hjOpsTab || 'groups', ps = s.hajj.pilgrims.filter((p) => p.packageId === k.id && Hj.ACTIVE(p)), groups = s.hajj.groups.filter((g) => g.packageId === k.id);
    let body = '';
    if (tab === 'groups') body = `<div class="row" style="margin-bottom:8px"><label>حجم الفوج</label><input class="input sm" id="hj-gsize" type="number" value="${App.ui.hjGsize || 45}" style="width:80px"><button class="btn primary" data-act="hjAutoGroups">⚙️ تفويج تلقائي (الأسر والمحارم مع بعض)</button></div>
      ${groups.map((g, gi) => { const gs = ps.filter((p) => p.groupId === g.id), idx = s.hajj.groups.indexOf(g); return `<div class="card" style="margin-bottom:8px;padding:10px"><div class="grid g4">
        <div class="field"><label>الفوج</label><input class="input sm" data-bind="hajj.groups.${idx}.name" value="${esc(g.name)}"></div><div class="field"><label>المشرف</label><input class="input sm" data-bind="hajj.groups.${idx}.leader" value="${esc(g.leader || '')}"></div>
        <div class="field"><label>هاتف المشرف</label><input class="input sm" style="direction:ltr" data-bind="hajj.groups.${idx}.phone" value="${esc(g.phone || '')}"></div><div class="field"><label>الأتوبيس</label><input class="input sm" data-bind="hajj.groups.${idx}.bus" value="${esc(g.bus || '')}"></div></div>
        <div class="small muted" style="margin-top:6px">${gs.length} حاج (${gs.filter((p) => p.gender === 'M').length} رجال · ${gs.filter((p) => p.gender === 'F').length} سيدات): ${gs.map((p) => esc(p.nameAr)).join('، ')}</div></div>`; }).join('') || '<div class="muted">لم يتم التفويج بعد.</div>'}`;
    else if (tab === 'housing') body = `${(k.stays || []).map((st, si) => { const key = `${st.city}${si}`, rooms = {}; for (const p of ps) { const r = (p.rooms || {})[key]; if (r) (rooms[r] = rooms[r] || []).push(p); }
      return `<div class="card" style="margin-bottom:8px;padding:10px"><div class="row"><b>🏨 ${esc(Hj.CITIES[st.city])} — ${esc(st.hotel)} (${st.nights} ليالٍ)</b><span class="spacer"></span><button class="btn sm primary" data-act="hjAutoRooms" data-key="${key}">⚙️ تسكين تلقائي</button></div>
        <div class="tbl-wrap"><table class="t small"><thead><tr><th>الغرفة</th><th>النوع</th><th>النزلاء</th></tr></thead><tbody>${Object.entries(rooms).map(([r, list]) => `<tr><td class="num">${esc(r)}</td><td>${Hj.ROOMS[list[0].roomType].ar}</td><td>${list.map((p) => `${esc(p.nameAr)} ${p.gender === 'F' ? '♀' : '♂'}`).join('، ')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">لم يتم التسكين.</td></tr>'}</tbody></table></div></div>`; }).join('')}
      <div class="small muted">الأسرة (نفس رقم الأسرة أو المحرم) في غرفة واحدة، والباقي حسب نوع الغرفة والجنس.</div>`;
    else if (tab === 'tents') { const tents = {}; for (const p of ps) if (p.tent) (tents[p.tent] = tents[p.tent] || []).push(p);
      body = `<div class="row" style="margin-bottom:8px"><label>سعة الخيمة</label><input class="input sm" id="hj-tcap" type="number" value="${App.ui.hjTcap || 20}" style="width:80px"><button class="btn primary" data-act="hjAutoTents">⚙️ توزيع خيام منى وعرفات (رجال / سيدات)</button></div>
        <div class="emp-grid">${Object.entries(tents).map(([t, list]) => `<div class="card" style="padding:10px"><b>⛺ ${esc(t)}</b> <span class="chip">${list.length}</span><div class="small muted" style="margin-top:4px">${list.map((p) => esc(p.nameAr)).join('، ')}</div></div>`).join('') || '<div class="muted">لم يتم التوزيع.</div>'}</div>`; }
    else if (tab === 'manifest') body = `<div class="tbl-wrap" id="hjMan"><table class="t"><thead><tr><th>#</th><th>الاسم</th><th>الاسم بالجواز</th><th>النوع</th><th>الجواز</th><th>التأشيرة</th><th>الفوج</th><th>الخيمة</th><th>الهاتف</th></tr></thead><tbody>
      ${ps.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.nameAr)}</td><td class="ltr">${esc(p.nameEn || '')}</td><td>${p.gender === 'F' ? 'أنثى' : 'ذكر'}</td><td class="num">${esc(p.passport || '')}</td><td class="num">${esc(p.visaNo || '')}</td><td>${esc((groups.find((g) => g.id === p.groupId) || {}).name || '')}</td><td>${esc(p.tent || '')}</td><td class="num">${esc(p.phone)}</td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="page-head"><div><h2>🧭 التفويج والتشغيل</h2><p>أفواج بمشرفيها · التسكين في مكة والمدينة والعزيزية · خيام منى وعرفات · كشف الحجاج · كروت الحجاج</p></div>
      <div class="row">${ssPicker()}<select class="input" data-ui="hjOpsK">${ks.map((x) => opt(x.id, k.id, `${x.code} · ${x.name}`)).join('')}</select><button class="btn gold" data-act="hjCards">🪪 طباعة كل الكروت</button><button class="btn" data-act="hjOpsPrint">🖨️ طباعة</button></div></div>
    <div class="tabs">${[['groups', '🚌 الأفواج'], ['housing', '🏨 التسكين'], ['tents', '⛺ منى وعرفات'], ['manifest', '📋 كشف الحجاج']].map(([a, l]) => `<button class="${tab === a ? 'active' : ''}" data-act="hjOpsTab" data-t="${a}">${l}</button>`).join('')}</div>
    <div class="card" id="hjOpsBody">${body}</div>`;
  };
  App.actions.hjOpsTab = (d) => { App.ui.hjOpsTab = d.t; App.render(); };
  App.actions.hjAutoGroups = () => { const n = Number(document.getElementById('hj-gsize').value) || 45; App.ui.hjGsize = n; const c = Hj.autoGroups(S(), App.ui.hjOpsK, n); done(`تفويج تلقائي: ${c} فوج`); App.toast(`✅ ${c} فوج`); };
  App.actions.hjAutoRooms = (d) => { const c = Hj.autoRooms(S(), App.ui.hjOpsK, d.key); done(`تسكين ${d.key}: ${c} غرفة`); App.toast(`✅ ${c} غرفة`); };
  App.actions.hjAutoTents = () => { const n = Number(document.getElementById('hj-tcap').value) || 20; App.ui.hjTcap = n; const c = Hj.autoTents(S(), App.ui.hjOpsK, n); done(`توزيع الخيام: ${c} خيمة`); App.toast(`✅ ${c} خيمة`); };
  App.actions.hjCards = () => { const s = S(); App.printDoc('Hajj cards', CARD_CSS + s.hajj.pilgrims.filter((p) => p.packageId === App.ui.hjOpsK && Hj.ACTIVE(p)).map((p) => cardHtml(s, p)).join('')); };
  App.actions.hjOpsPrint = () => { const k = Hj.pkg(S(), App.ui.hjOpsK), el = document.getElementById('hjOpsBody'); App.printDoc(k.name, `<h2>${esc(k.name)}</h2>${el ? el.innerHTML.replace(/<button[^>]*>.*?<\/button>/g, '').replace(/<input[^>]*value="([^"]*)"[^>]*>/g, '$1') : ''}`, true); };

  // ================================================================ PROFITABILITY
  App.pages.hajjPnl = () => {
    const s = S(), ss = curSeason(); if (!ss) return noSeason();
    const rows = pkgsOf(ss).map((k) => ({ k, n: Hj.packageNumbers(s, k) })), sum = (f) => rows.reduce((x, y) => x + y.n[f], 0);
    return `<div class="page-head"><div><h2>📈 ربحية موسم الحج</h2><p>${ss.closed ? 'الموسم مقفل — الأرقام من القيود النهائية' : 'قبل الإقفال: الإيراد مؤجل (2108) والتكلفة الأعلى من كشف التكلفة أو الفواتير المسجلة (1109)'}</p></div><div class="row">${ssPicker()}</div></div>
    <div class="grid g4"><div class="card kpi"><div class="lbl">الإيراد (بدون ضرائب)</div><div class="val">${h.egp(sum('exTax'))}</div></div><div class="card kpi"><div class="lbl">التكلفة</div><div class="val">${h.egp(sum('costBasis'))}</div></div>
      <div class="card kpi"><div class="lbl">العمولات</div><div class="val">${h.egp(sum('commissions'))}</div></div><div class="card kpi"><div class="lbl">صافي الربح المتوقع</div><div class="val ${sum('profit') < 0 ? 'danger' : 'gold'}">${h.egp(sum('profit'))}</div></div></div>
    <div class="card" style="margin-top:14px"><div class="tbl-wrap"><table class="t"><thead><tr><th>البرنامج</th><th>الحجاج</th><th>الإيراد</th><th>مؤجل 2108</th><th>معترف به 4107</th><th>مدفوع مقدماً 1109</th><th>التكلفة</th><th>العمولات</th><th>الربح</th><th>المحصل</th><th>المتبقي</th><th></th></tr></thead><tbody>
      ${rows.map(({ k, n }) => `<tr><td><b>${esc(k.code)}</b><div class="small muted">${esc(k.name)}</div></td><td class="num">${n.pilgrims}</td><td>${h.n0(n.exTax)}</td><td>${h.n0(n.deferred)}</td><td>${h.n0(n.recognized)}</td><td>${h.n0(n.prepaid)}</td><td>${h.n0(n.costBasis)}</td><td>${h.n0(n.commissions)}</td>
        <td class="${n.profit < 0 ? 'danger' : 'ok'}"><b>${h.n0(n.profit)}</b></td><td>${h.n0(n.collected)}</td><td class="${n.due > 0 ? 'danger' : ''}">${h.n0(n.due)}</td><td>${ss.closed ? '' : `<button class="btn sm" data-act="hjBill" data-id="${k.id}">🧾 فاتورة مورد</button>`}</td></tr>`).join('')}</tbody></table></div>
      <div class="small muted" style="margin-top:6px">فواتير الفنادق وباقات المشاعر والطيران تُسجل على البرنامج في "مصروفات حج مدفوعة مقدماً 1109" وتتحول لتكلفة عند إقفال الموسم.</div></div>`;
  };
  App.actions.hjBill = (d) => { const k = Hj.pkg(S(), d.id); App.openVoucher({ type: 'BILL', tripId: k.id, accountCode: '1109', memo: `فاتورة موسم الحج — ${k.code}` }); };
})();
