/* Umrah ERP — Planning & Sales pages: Trip Builder/FX, Allotment Heatmap, Booking Engine, B2B Extranet */
(function () {
  'use strict';
  const App = window.App, E = App.E, h = App.h, esc = h.esc;
  const S = () => App.S;
  const isManager = () => h.user().role === 'MANAGER';
  const TYPES = Object.keys(E.ROOM_TYPES);
  const CAT = { AIR: 'طيران', VISA: 'تأشيرات/تأمين', TRANSPORT: 'نقل بري', OPEX: 'تشغيلي/مزارات', HOTEL: 'فنادق' };
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label ?? v)}</option>`;

  // ================================================================ 1) TRIP BUILDER & FX
  App.pages.builder = () => {
    const s = S(), t = s.trip, c = E.computeCosting(t, s.allotments), L = t.lockedPrices;
    const totalFixed = c.fixedEGP;
    const settleRows = s.settlements.map((x) => ({ ...x, egpRef: x.amountSAR * t.fxRef, egpAct: x.amountSAR * x.fxActual, v: E.fxVariance(x.amountSAR, t.fxRef, x.fxActual) }));
    const vTotal = settleRows.reduce((a, x) => a + x.v, 0);
    return `
    <div class="page-head"><div><h2>🧮 بناء وتكوين الرحلة ومحرك التكلفة</h2>
      <p>مركز تكلفة معزول لكل رحلة · دفتر ثلاثي العملات (SAR للمشتريات الخارجية · EGP للمحلية والبيع) · عزل المتغير عن الثابت · مخصص السرير العاجز</p></div>
      <div class="row">${L ? `<span class="chip ok">🔒 مقفل بواسطة ${esc(L._by)} · ${h.dt(L._at)}</span><button class="btn sm" data-act="unlockPrices">فك القفل</button>`
        : `<button class="btn gold" data-act="lockPrices">🔒 قفل السعر الرسمي للبيع</button>`}</div></div>

    <div class="grid g4">
      <div class="card kpi"><div class="lbl">مركز التكلفة الفرعي</div><div class="val gold num">${esc(t.costCenter)}</div><div class="hint">يمنع خلط سيولة الرحلات</div></div>
      <div class="card kpi"><div class="lbl">التكاليف الثابتة الموزعة</div><div class="val">${h.egp(totalFixed)}</div><div class="hint">حصة الفرد ${h.egp(c.fixedShareEGP)} على ${t.plannedPax} مقعد</div></div>
      <div class="card kpi"><div class="lbl">المتغيرة لكل فرد (بدون فندق)</div><div class="val">${h.egp(c.varAdultEGP)}</div><div class="hint">طيران + تأشيرة + تأمين + نقل</div></div>
      <div class="card kpi"><div class="lbl">نقطة التعادل</div><div class="val num">${c.breakEvenPax} <span class="small muted">معتمر</span></div><div class="hint">بمزيج الرباعي</div></div>
    </div>

    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>⚙️ معاملات الرحلة <span class="sub">تعديل أي قيمة يعيد الاحتساب فوراً</span></h3>
        <div class="grid g3">
          <div class="field"><label>سعر الصرف المرجعي FX_Ref (EGP/SAR)</label><input class="input" type="number" step="0.01" data-bind="trip.fxRef" value="${t.fxRef}"></div>
          <div class="field"><label>الطاقة المخططة (مقاعد)</label><input class="input" type="number" data-bind="trip.plannedPax" value="${t.plannedPax}"></div>
          <div class="field"><label>هامش الربح المستهدف %</label><input class="input" type="number" step="0.5" data-bind="trip.marginPct" value="${t.marginPct}"></div>
          <div class="field"><label>ليالي مكة</label><input class="input" type="number" min="1" data-bind="trip.stays.MAK.nights" data-after="restay" value="${t.stays.MAK.nights}"></div>
          <div class="field"><label>ليالي المدينة</label><input class="input" type="number" min="1" data-bind="trip.stays.MAD.nights" data-after="restay" value="${t.stays.MAD.nights}"></div>
          <div class="field"><label>مخصص السرير العاجز Breakage %</label><input class="input" type="number" step="0.1" data-bind="trip.breakagePct" value="${t.breakagePct}"></div>
          <div class="field"><label>تاريخ السفر</label><input class="input" type="date" data-bind="trip.departDate" data-after="restay" value="${t.departDate}"></div>
          <div class="field"><label>تاريخ العودة (محسوب)</label><input class="input" readonly value="${t.returnDate}"></div>
          <div class="field"><label>حصة الطفل من الثابت</label><input class="input" type="number" step="0.1" data-bind="trip.childFixedFactor" value="${t.childFixedFactor}"></div>
        </div>
      </div>
      <div class="card"><h3>🏨 مخصصات الفنادق المرتبطة <span class="sub">سعر الغرفة/ليلة بالريال</span></h3>
        ${s.allotments.map((a, ai) => `
          <div style="margin-bottom:10px"><div class="row"><b>${esc(a.hotel)}</b><span class="spacer"></span><span class="chip">${esc(h.supplier(a.supplierId).name)}</span></div>
          <div class="small muted">عقد ${esc(a.code)} · ${a.from} → ${a.to} · تحرير ${a.cutoff} · ${a.totalRooms} غرفة</div>
          <div class="grid g4" style="margin-top:6px">${TYPES.map((ty) => `<div class="field"><label>${E.ROOM_TYPES[ty].ar} (${a.rooms[ty]} غرفة)</label><input class="input" type="number" data-bind="allotments.${ai}.rates.${ty}" value="${a.rates[ty]}"></div>`).join('')}</div></div>`).join('')}
      </div>
    </div>

    <div class="card" style="margin-top:14px"><h3>📦 بنود التوريد والموردين <span class="sub">متغير = لكل فرد · ثابت = يوزع على الطاقة</span><span class="spacer"></span><button class="btn sm" data-act="addCost">+ بند</button></h3>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>البند</th><th>الفئة</th><th>المورد (دائن)</th><th>العملة</th><th>السلوك</th><th>الكمية</th><th>سعر الوحدة</th><th>معامل طفل</th><th>معامل رضيع</th><th>الإجمالي بالجنيه</th><th></th></tr></thead><tbody>
      ${c.lines.map((it, i) => `<tr>
        <td><input class="input" data-bind="trip.costItems.${i}.name" value="${esc(it.name)}" style="min-width:200px"></td>
        <td><select class="input" data-bind="trip.costItems.${i}.cat">${Object.entries(CAT).map(([k, v]) => opt(k, it.cat, v)).join('')}</select></td>
        <td><select class="input" data-bind="trip.costItems.${i}.supplierId"><option value="">— داخلي —</option>${s.suppliers.map((x) => opt(x.id, it.supplierId, x.name)).join('')}</select></td>
        <td><select class="input" data-bind="trip.costItems.${i}.currency">${opt('SAR', it.currency)}${opt('EGP', it.currency)}</select></td>
        <td><select class="input" data-bind="trip.costItems.${i}.behavior">${opt('VAR', it.behavior, 'متغير/فرد')}${opt('FIXED', it.behavior, 'ثابت موزع')}</select></td>
        <td>${it.behavior === 'FIXED' ? `<input class="input" type="number" style="width:70px" data-bind="trip.costItems.${i}.qty" value="${it.qty || 1}">` : '<span class="faint">لكل فرد</span>'}</td>
        <td><input class="input" type="number" style="width:110px" data-bind="trip.costItems.${i}.unitPrice" value="${it.unitPrice}"></td>
        <td>${it.behavior === 'VAR' ? `<input class="input" type="number" step="0.05" style="width:70px" data-bind="trip.costItems.${i}.childFactor" value="${it.childFactor ?? 1}">` : ''}</td>
        <td>${it.behavior === 'VAR' ? `<input class="input" type="number" step="0.05" style="width:70px" data-bind="trip.costItems.${i}.infantFactor" value="${it.infantFactor ?? 0}">` : ''}</td>
        <td>${h.egp(it.totalEGP)}</td><td><button class="btn sm danger" data-act="delCost" data-i="${i}">✕</button></td></tr>`).join('')}
      </tbody></table></div>
    </div>

    <div class="card" style="margin-top:14px"><h3>🧾 تكلفة الفرد الصافية وتوزيع الأسعار <span class="sub">(ليالي مكة + ليالي المدينة) ÷ سعة الغرفة + Breakage + متغير + حصة الثابت</span></h3>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>فئة التسكين</th><th>إقامة/سرير (SAR)</th><th>Breakage</th><th>إقامة بالجنيه</th><th>متغير</th><th>حصة الثابت</th><th>صافي التكلفة</th><th>السعر المحسوب</th><th>السعر الرسمي المقفل</th><th>الربح/فرد</th><th>غرف فقط</th></tr></thead><tbody>
      ${TYPES.map((ty) => { const r = c.byType[ty]; const off = L ? L[ty] : r.sellEGP; return `<tr>
        <td><b>${E.ROOM_TYPES[ty].ar}</b> <span class="faint small">(${r.cap} أسرّة)</span></td><td>${h.sar(r.accomSAR)}</td><td>${h.sar(r.breakageSAR)}</td><td>${h.egp(r.accomEGP)}</td>
        <td>${h.egp(r.variableEGP)}</td><td>${h.egp(r.fixedShareEGP)}</td><td><b>${h.egp(r.costEGP)}</b></td><td>${h.egp(r.sellEGP)}</td>
        <td><b class="gold">${h.egp(off)}</b> ${L && L[ty] !== r.sellEGP ? '<span class="chip danger" title="تغيرت التكلفة بعد القفل">انحراف</span>' : ''}</td>
        <td class="${off - r.costEGP < 0 ? 'danger' : 'ok'}">${h.egp(off - r.costEGP)}</td><td>${h.egp(L ? L['RO_' + ty] : r.roomOnlyEGP)}</td></tr>`; }).join('')}
      <tr><td><b>طفل بدون سرير</b></td><td colspan="5" class="muted small">طيران × معامل الطفل + التأشيرة + النقل + ${t.childFixedFactor * 100}% من حصة الثابت</td><td><b>${h.egp(c.child.costEGP)}</b></td><td>${h.egp(c.child.sellEGP)}</td><td><b class="gold">${h.egp(L ? L.CHD : c.child.sellEGP)}</b></td><td>${h.egp((L ? L.CHD : c.child.sellEGP) - c.child.costEGP)}</td><td></td></tr>
      <tr><td><b>رضيع</b></td><td colspan="5" class="muted small">10% طيران + تأشيرة + تأمين</td><td><b>${h.egp(c.infant.costEGP)}</b></td><td>${h.egp(c.infant.sellEGP)}</td><td><b class="gold">${h.egp(L ? L.INF : c.infant.sellEGP)}</b></td><td>${h.egp((L ? L.INF : c.infant.sellEGP) - c.infant.costEGP)}</td><td></td></tr>
      </tbody></table></div>
    </div>

    <div class="card" style="margin-top:14px"><h3>💱 مستخلصات الموردين وفروق العملة <span class="sub">FX Variance = Amount(SAR) × (FX_actual − FX_ref)</span></h3>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>التاريخ</th><th>المورد</th><th>البيان</th><th>المبلغ (SAR)</th><th>FX الفعلي</th><th>بالمرجعي</th><th>بالفعلي</th><th>فرق العملة</th></tr></thead><tbody>
      ${settleRows.map((x) => `<tr><td class="num">${x.date}</td><td>${esc(h.supplier(x.supplierId).name)}</td><td>${esc(x.ref)}</td><td>${h.sar(x.amountSAR)}</td><td class="num">${x.fxActual}</td><td>${h.egp(x.egpRef)}</td><td>${h.egp(x.egpAct)}</td>
        <td class="${x.v > 0 ? 'danger' : 'ok'}">${x.v > 0 ? 'خسارة ' : 'ربح '}${h.egp(Math.abs(x.v))}</td></tr>`).join('')}
      </tbody><tfoot><tr><td colspan="7">صافي أثر فروق العملة المحقق</td><td class="${vTotal > 0 ? 'danger' : 'ok'}">${vTotal > 0 ? 'خسارة ' : 'ربح '}${h.egp(Math.abs(vTotal))}</td></tr></tfoot></table></div>
      <div class="row" style="margin-top:10px">
        <select class="input" id="st-sup" style="width:auto">${s.suppliers.filter((x) => x.currency === 'SAR').map((x) => opt(x.id, '', x.name)).join('')}</select>
        <input class="input" id="st-ref" placeholder="البيان" style="width:200px">
        <input class="input" id="st-amt" type="number" placeholder="المبلغ بالريال" style="width:140px">
        <input class="input" id="st-fx" type="number" step="0.01" placeholder="سعر الصرف الفعلي" value="${s.fx.current}" style="width:140px">
        <button class="btn primary" data-act="addSettlement">+ تسجيل سداد مستخلص</button>
      </div>
    </div>`;
  };
  App.actions.restay = () => {
    const t = S().trip;
    t.stays.MAK.checkIn = t.departDate;
    t.stays.MAD.checkIn = E.iso(E.addDays(t.departDate, t.stays.MAK.nights));
    t.returnDate = E.iso(E.addDays(t.stays.MAD.checkIn, t.stays.MAD.nights));
  };
  App.actions.addCost = () => { S().trip.costItems.push({ id: 'C' + Date.now(), cat: 'OPEX', name: 'بند جديد', supplierId: '', currency: 'EGP', unitPrice: 0, qty: 1, behavior: 'FIXED', childFactor: 1, infantFactor: 0 }); App.save(); App.render(); };
  App.actions.delCost = (d) => { S().trip.costItems.splice(Number(d.i), 1); App.save(); App.render(); };
  App.actions.lockPrices = () => {
    if (!isManager()) return App.toast('قفل السعر الرسمي من صلاحية مدير المبيعات فقط', 'err');
    const t = S().trip; t.lockedPrices = null;
    t.lockedPrices = { ...E.priceList(S()), _at: Date.now(), _by: h.user().name };
    App.audit('قفل السعر الرسمي للرحلة'); App.save(); App.render(); App.toast('تم قفل السعر الرسمي — أصبح مرجع البيع لكل القنوات');
  };
  App.actions.unlockPrices = () => {
    if (!isManager()) return App.toast('فك القفل من صلاحية مدير المبيعات فقط', 'err');
    S().trip.lockedPrices = null; App.audit('فك قفل الأسعار'); App.save(); App.render();
  };
  App.actions.addSettlement = () => {
    const amt = App.val('st-amt'), fx = App.val('st-fx');
    if (!(amt > 0) || !(fx > 0)) return App.toast('أدخل المبلغ وسعر الصرف', 'err');
    S().settlements.push({ id: 'ST' + Date.now(), supplierId: App.val('st-sup'), ref: App.val('st-ref') || 'سداد مستخلص', amountSAR: amt, fxActual: fx, date: E.iso(new Date()) });
    App.audit(`سداد مستخلص ${amt} ر.س بسعر ${fx}`); App.save(); App.render();
  };

  // ================================================================ 2) ALLOTMENT HEATMAP
  App.pages.heatmap = () => {
    const s = S(), ui = App.ui, al = s.allotments.find((a) => a.id === ui.heatAllot);
    const days = E.heatmap(s, al);
    const radar = E.cutoffRadar(s.allotments, E.iso(new Date()));
    const inRange = (d) => ui.heatStart && (d === ui.heatStart || (ui.heatEnd && d >= ui.heatStart && d <= ui.heatEnd));
    const cell = (d, val, color, max) => {
      const a = max ? Math.max(0.12, Math.min(1, val / max)) : 0.12;
      return `<div class="heat-cell ${d.inTrip ? 'trip' : ''} ${inRange(d.date) ? 'sel' : ''}" data-act="heatPick" data-date="${d.date}" style="background:${color.replace('A', a.toFixed(2))}">
        ${d.mult !== 1 ? `<span class="peak">×${d.mult}</span>` : ''}<b class="num">${val}</b></div>`;
    };
    const row = (label, key, color) => `<div class="heat-row" style="--days:${days.length}"><div class="heat-label">${label}</div>${days.map((d) => cell(d, d[key], color, d.total * 0.6)).join('')}</div>`;
    const freeRow = `<div class="heat-row" style="--days:${days.length}"><div class="heat-label">🟢 متاح حر للبيع</div>${days.map((d) => cell(d, d.free, d.free <= 5 ? 'rgba(229,72,77,A)' : 'rgba(31,191,117,A)', d.total * 0.5)).join('')}</div>`;
    const sel = ui.heatStart ? days.filter((d) => inRange(d.date)) : [];
    const minFree = sel.length ? Math.min(...sel.map((d) => d.free)) : 0;
    const bk = E.breakage(s, al.city);
    return `
    <div class="page-head"><div><h2>🗓️ رادار الإتاحات الحية لبنك الغرف</h2><p>مخزون المخصص يومياً: المستهلك لرحلات الشركة، مبيعات الوكلاء، المعلق، والمتاح الحر · اختر يوماً ثم يوماً آخر لتحديد فترة</p></div>
      <div class="tabs">${s.allotments.map((a) => `<button class="${a.id === al.id ? 'active' : ''}" data-act="heatAllot" data-id="${a.id}">${a.city === 'MAK' ? '🕋' : '🕌'} ${esc(a.hotel.split('–')[0])}</button>`).join('')}</div></div>

    <div class="grid g2">${radar.map((r) => `<div class="alert ${r.level === 'ok' ? 'info' : r.level === 'alert' ? 'warn' : 'err'}">
      📡 <b>رادار تاريخ التحرير – ${esc(r.a.hotel.split('–')[0])}</b>: تاريخ Cut-off <span class="num">${r.a.cutoff}</span> ·
      ${r.level === 'passed' ? 'انقضى — الغرف غير المؤكدة عادت للفندق' : r.level === 'alert' ? `⚠️ متبقٍ <b>${r.daysLeft}</b> أيام — أكّد أو حرّر الغرف الفائضة قبل استردادها` : `متبقٍ ${r.daysLeft} يوماً`}</div>`).join('')}</div>

    <div class="card" style="margin-top:14px">
      <div class="row" style="margin-bottom:10px"><h3 style="margin:0">${esc(al.hotel)}</h3><span class="spacer"></span>
        <div class="legend"><span><i style="background:var(--company)"></i>رحلات الشركة</span><span><i style="background:var(--agents)"></i>مبيعات الوكلاء</span><span><i style="background:var(--hold)"></i>معلق مؤقتاً</span><span><i style="background:var(--avail)"></i>متاح حر</span><span><i style="background:var(--gold)"></i>ليالي الرحلة الحالية</span></div></div>
      <div class="heat">
        <div class="heat-row" style="--days:${days.length}"><div class="heat-label">اليوم</div>${days.map((d) => `<div class="heat-day">${h.day(d.date).replace('،', '<br>')}</div>`).join('')}</div>
        <div class="heat-row" style="--days:${days.length}"><div class="heat-label">إجمالي المخصص</div>${days.map((d) => `<div class="heat-cell" data-act="heatPick" data-date="${d.date}" style="background:#0a2019"><span class="num faint">${d.total}</span></div>`).join('')}</div>
        ${row('🔵 رحلات الشركة', 'company', 'rgba(59,142,234,A)')}
        ${row('🟣 مبيعات الوكلاء', 'agents', 'rgba(162,107,240,A)')}
        ${row('🟡 معلق مؤقتاً', 'held', 'rgba(242,194,48,A)')}
        ${freeRow}
        <div class="heat-row" style="--days:${days.length}"><div class="heat-label">التوزيع</div>${days.map((d) => `<div class="stackbar" title="${d.date}" style="flex-direction:column;height:40px">
          ${[['company', 'var(--company)'], ['agents', 'var(--agents)'], ['held', 'var(--hold)'], ['free', 'var(--avail)']].map(([k, c]) => `<span style="height:${(d[k] / d.total) * 100}%;background:${c}"></span>`).join('')}</div>`).join('')}</div>
      </div>
    </div>

    <div class="grid g-side" style="margin-top:14px">
      <div class="card"><h3>🛏️ أسرّة التفريد الشاغرة (Breakage) — منشورة تلقائياً كإتاحات حرة للوكلاء والسيلز</h3>
        ${bk.length ? `<div class="tbl-wrap"><table class="t"><thead><tr><th>الغرفة</th><th>الفئة</th><th>الجنس</th><th>أسرّة شاغرة</th><th>سعر السرير (باقة)</th><th>الحالة</th></tr></thead><tbody>
        ${bk.map((x) => `<tr><td class="num">${esc(x.room.physicalNo || x.room.vcode)}</td><td>${E.ROOM_TYPES[x.room.type].ar}</td><td>${h.genderChip(x.room.gender)}</td><td><b>${x.free}</b></td><td>${h.egp(E.priceList(s)[x.room.type])}</td><td><span class="chip ok">Free-Sale · منشور</span></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="muted">لا توجد أسرّة شاغرة في غرف التفريد.</div>'}
      </div>
      <div class="card">${sel.length ? `
        <h3>📅 الفترة المحددة</h3>
        <div class="small muted">من <span class="num">${ui.heatStart}</span> ${ui.heatEnd ? `إلى <span class="num">${ui.heatEnd}</span>` : ''} · ${sel.length} ليلة · أقل متاح <b>${minFree}</b> غرفة</div>
        <table class="t" style="margin-top:8px"><thead><tr><th>الفئة</th><th>سعر الشراء</th><th>سعر البيع/ليلة</th></tr></thead><tbody>
        ${TYPES.map((ty) => { const avg = sel.reduce((a, d) => a + al.rates[ty] * d.mult, 0) / sel.length; return `<tr><td>${E.ROOM_TYPES[ty].ar}</td><td>${h.sar(al.rates[ty])}</td><td>${h.sar(avg * (1 + s.trip.marginPct / 100))}</td></tr>`; }).join('')}
        </tbody></table>
        <div class="row" style="margin-top:8px"><span class="small muted">تسعير المواسم:</span>
          ${[1.1, 1.2, 1.35].map((m) => `<button class="btn sm" data-act="heatPrice" data-m="${m}">ذروة ×${m}</button>`).join('')}<button class="btn sm ghost" data-act="heatPrice" data-m="1">إلغاء</button></div>
        <hr style="border-color:var(--line);margin:12px 0">
        <b>⚡ حجز سريع للوكيل (غرف فقط)</b>
        <div class="grid g2" style="margin-top:6px">
          <div class="field"><label>الوكيل</label><select class="input" id="qb-agent">${s.agents.filter((a) => a.tier === 'B2B').map((a) => opt(a.id, '', a.name)).join('')}</select></div>
          <div class="field"><label>الفئة</label><select class="input" id="qb-type">${TYPES.map((ty) => opt(ty, 'QUAD', E.ROOM_TYPES[ty].ar)).join('')}</select></div>
          <div class="field"><label>عدد الغرف (≤ ${minFree})</label><input class="input" id="qb-n" type="number" min="1" max="${minFree}" value="1"></div>
          <div class="field"><label>&nbsp;</label><button class="btn primary" data-act="quickBook" ${minFree < 1 ? 'disabled' : ''}>حجز وخصم من المحفظة</button></div>
        </div>
        <hr style="border-color:var(--line);margin:12px 0">
        <div class="row"><a class="btn" target="_blank" rel="noopener" href="${esc(shareLink('wa', al, sel))}">🟢 مشاركة الإتاحات واتساب</a>
          <a class="btn" href="${esc(shareLink('mail', al, sel))}">✉️ إيميل</a></div>`
        : '<h3>📅 اختر فترة من الرادار</h3><div class="muted">اضغط على أي خلية لتحديد بداية الفترة ثم خلية أخرى لنهايتها — لتسعير المواسم، الحجز السريع للوكلاء، ومشاركة الإتاحات.</div>'}
      </div>
    </div>`;
  };
  function shareLink(kind, al, sel) {
    const lines = sel.map((d) => `${d.date}: متاح ${d.free} غرفة${d.mult !== 1 ? ` (ذروة ×${d.mult})` : ''}`);
    const rates = TYPES.map((ty) => `${E.ROOM_TYPES[ty].ar}: ${Math.round(al.rates[ty] * (1 + S().trip.marginPct / 100))} ر.س/ليلة`).join(' | ');
    const text = `🏨 إتاحات ${al.hotel}\n${lines.join('\n')}\n💰 ${rates}\nللحجز: تواصل مع إدارة المبيعات`;
    return kind === 'wa' ? `https://wa.me/?text=${encodeURIComponent(text)}` : `mailto:?subject=${encodeURIComponent('إتاحات ' + al.hotel)}&body=${encodeURIComponent(text)}`;
  }
  App.actions.heatAllot = (d) => { App.ui.heatAllot = d.id; App.ui.heatStart = App.ui.heatEnd = null; App.render(); };
  App.actions.heatPick = (d) => {
    const ui = App.ui;
    if (!ui.heatStart || ui.heatEnd) { ui.heatStart = d.date; ui.heatEnd = null; }
    else if (d.date >= ui.heatStart) ui.heatEnd = d.date;
    else ui.heatStart = d.date;
    App.render();
  };
  const selDays = () => { const al = S().allotments.find((a) => a.id === App.ui.heatAllot); return E.heatmap(S(), al).filter((d) => d.date === App.ui.heatStart || (App.ui.heatEnd && d.date >= App.ui.heatStart && d.date <= App.ui.heatEnd)); };
  App.actions.heatPrice = (d) => {
    const al = S().allotments.find((a) => a.id === App.ui.heatAllot);
    for (const day of selDays()) { if (Number(d.m) === 1) delete al.priceOverrides[day.date]; else al.priceOverrides[day.date] = Number(d.m); }
    App.audit(`تعديل تسعير ${al.code} للفترة ×${d.m}`); App.save(); App.render();
  };
  App.actions.quickBook = () => {
    const s = S(), al = s.allotments.find((a) => a.id === App.ui.heatAllot), days = selDays();
    const agent = h.agent(App.val('qb-agent')), ty = App.val('qb-type'), n = Math.floor(App.val('qb-n'));
    const minFree = Math.min(...days.map((x) => x.free));
    if (!(n >= 1) || n > minFree) return App.toast('عدد الغرف يتجاوز المتاح الحر', 'err');
    const sellSAR = days.reduce((a, x) => a + al.rates[ty] * x.mult, 0) * n * (1 + s.trip.marginPct / 100);
    const netEGP = sellSAR * (1 - agent.netDiscountPct / 100) * s.fx.current;
    const w = E.walletCheck(agent, netEGP, s.fx.current);
    if (!w.ok) return App.toast('❌ ' + w.reason, 'err');
    agent.balance = E.round2(agent.balance - w.amount);
    for (const x of days) al.b2bSold[x.date] = (al.b2bSold[x.date] || 0) + n;
    const ref = 'VCH-' + String(Date.now()).slice(-6);
    s.agentLedger.push({ agentId: agent.id, at: Date.now(), desc: `حجز غرف فقط ${n}×${E.ROOM_TYPES[ty].ar} – ${al.code} (${ref})`, debit: w.amount, credit: 0 });
    App.audit(`حجز سريع ${ref} للوكيل ${agent.name}`); App.save(); App.render();
    App.toast(`✅ تم الحجز وإصدار الفوتشر ${ref} — خصم ${h.n0(w.amount)} ${agent.currency}`);
  };

  // ================================================================ 3) BOOKING ENGINE
  const blankPax = (gender = 'M', type = 'ADULT') => ({ nameAr: '', nameEn: '', gender, type, dob: '', passport: '', passportExp: '', nid: '', borderNo: '', phone: '' });
  App.newDraft = () => ({ channel: 'DIRECT', agentId: 'A1', mode: 'FULL_PACKAGE', roomType: 'QUAD', services: { HOTEL: false, AIR: true, VISA: true, BUS: false },
    discountPct: 0, incentive: 0, incentiveMode: 'CLIENT_DISCOUNT', deposit: 0, ttl: 24, pax: [blankPax()] });
  const draftInput = (d) => ({
    ...d, userId: d.channel === 'DIRECT' ? App.ui.actingUser : null, agentId: d.channel === 'DIRECT' ? null : d.agentId,
    discountPct: d.channel === 'B2B' ? 0 : d.discountPct, incentive: d.channel === 'DIRECT' ? 0 : d.incentive,
    deposit: d.channel === 'B2B' ? 0 : d.deposit,
  });

  App.partials.bookingSummary = () => {
    const s = S(), d = App.ui.draft, v = E.priceBooking(s, draftInput(d));
    const agent = d.channel !== 'DIRECT' ? h.agent(d.agentId) : null;
    const statusBox = v.status === 'BLOCKED' ? '<span class="chip danger">⛔ محظور</span>' : h.statusChip(v.status);
    return `
      <h3>🧾 ملخص الحجز والحوكمة</h3>
      ${v.net == null ? `<div class="field"><label>السعر</label><input class="input locked" readonly value="🔒 بانتظار تسعير الإدارة"></div>` : `
      <table class="t"><tbody>${v.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${h.egp(l.total)}</td></tr>`).join('')}
        <tr><td>الإجمالي بالسعر الرسمي</td><td><b>${h.egp(v.gross)}</b></td></tr>
        ${v.channelDiscount ? `<tr><td>سعر الجملة الصافي للوكيل (−${agent.netDiscountPct}%)</td><td class="ok">−${h.egp(v.channelDiscount)}</td></tr>` : ''}
        ${v.discount ? `<tr><td>خصم مطلوب ${d.discountPct}%</td><td class="ok">−${h.egp(v.discount)}</td></tr>` : ''}
        ${v.incentiveDiscount ? `<tr><td>عمولة تشجيعية موجهة كخصم للعميل</td><td class="ok">−${h.egp(v.incentiveDiscount)}</td></tr>` : ''}
        <tr><td><b>الصافي المستحق</b></td><td><b class="gold">${h.egp(v.net)}</b></td></tr>
        ${v.agentCommission ? `<tr><td>🏷️ عمولة الوسيط (${agent.commissionPct}%)</td><td><span class="chip gold">${h.egp(v.agentCommission)}</span></td></tr>` : ''}
        ${v.incentive && d.incentiveMode === 'AGENT_CREDIT' ? `<tr><td>رصيد دائن معلق للوكيل (يصرف بعد السداد الكامل)</td><td><span class="chip gold">${h.egp(v.incentive)}</span></td></tr>` : ''}
      </tbody></table>`}
      <div class="row" style="margin-top:10px"><span class="muted">الحالة عند الحفظ:</span> ${statusBox}
        ${E.HOLD_STATES.includes(v.status) ? `<span class="chip hold">⏱️ مهلة ${E.clampTTL(d.ttl)} ساعة</span>` : ''}</div>
      ${agent && agent.tier === 'B2B' && v.net != null ? (() => { const w = E.walletCheck(agent, v.net, s.fx.current); return `<div class="alert ${w.ok ? 'info' : 'err'}" style="margin-top:8px">💳 المحفظة: الرصيد ${h.n0(agent.balance)} + سقف ${h.n0(agent.creditLimit)} ${agent.currency} ${w.ok ? `→ بعد الخصم ${h.n0(w.availableAfter)}` : ''}</div>`; })() : ''}
      ${v.reasons.map((r) => `<div class="alert ${v.status === 'BLOCKED' ? 'err' : 'warn'}" style="margin-top:8px">${esc(r)}</div>`).join('')}
      ${v.warnings.map((r) => `<div class="alert err" style="margin-top:8px">🛂 ${esc(r)}</div>`).join('')}
      <button class="btn primary" style="margin-top:12px;width:100%;justify-content:center" data-act="createBooking" ${v.status === 'BLOCKED' ? 'disabled' : ''}>💾 حفظ الحجز ${v.status === 'CONFIRMED' ? 'وإصدار الفوتشر' : ''}</button>`;
  };

  App.pages.booking = () => {
    const s = S(), ui = App.ui, d = ui.draft || (ui.draft = App.newDraft());
    const prices = E.priceList(s);
    const filt = ui.bookingFilter;
    const list = s.bookings.filter((b) => filt === 'ALL' || (filt === 'HOLD' ? E.HOLD_STATES.includes(b.status) : b.status === filt)).slice().reverse();
    const trInput = (i, k, ph, extra = '') => `<input class="input" data-live="draft.pax.${i}.${k}" value="${esc(d.pax[i][k])}" placeholder="${ph}" ${extra}>`;
    return `
    <div class="page-head"><div><h2>🧾 محرك الحجز فائق المرونة</h2><p>كامل/تفريد/غرف فقط/خدمات مجزأة · بالغ/طفل بدون سرير/رضيع · مصفوفة خصم هرمية · تعليق مؤقت بمؤقت تنازلي · محفظة الوكيل</p></div>
      <div class="row small">${TYPES.map((ty) => `<span class="chip">${E.ROOM_TYPES[ty].ar}: <b class="num">${h.n0(prices[ty])}</b></span>`).join('')}<span class="chip">طفل: <b class="num">${h.n0(prices.CHD)}</b></span><span class="chip">رضيع: <b class="num">${h.n0(prices.INF)}</b></span></div></div>

    <div class="grid g-side">
      <div class="card stack">
        <div class="grid g3">
          <div class="field"><label>قناة البيع</label><select class="input" data-ui="draft.channel">${opt('DIRECT', d.channel, 'بيع مباشر (سيلز داخلي)')}${opt('B2B', d.channel, 'وكيل خارجي معتمد B2B')}${opt('BROKER', d.channel, 'وسيط حر Broker')}</select></div>
          ${d.channel === 'DIRECT' ? `<div class="field"><label>موظف البيع (صلاحية الخصم)</label><input class="input" readonly value="${esc(h.user().name)} · ≤ ${E.discountAuthority(h.user())}%"></div>`
            : `<div class="field"><label>${d.channel === 'B2B' ? 'الوكيل' : 'الوسيط'}</label><select class="input" data-ui="draft.agentId">${s.agents.filter((a) => a.tier === d.channel).map((a) => opt(a.id, d.agentId, a.name)).join('')}</select></div>`}
          <div class="field"><label>مسار البيع</label><select class="input" data-ui="draft.mode">${Object.entries(E.SALE_MODES).map(([k, v]) => opt(k, d.mode, v)).join('')}</select></div>
          <div class="field"><label>فئة التسكين</label><select class="input" data-ui="draft.roomType" ${d.mode === 'UNBUNDLED' ? 'disabled' : ''}>${TYPES.map((ty) => opt(ty, d.roomType, `${E.ROOM_TYPES[ty].ar} (${E.ROOM_TYPES[ty].cap})`)).join('')}</select></div>
          ${d.channel !== 'B2B' ? `<div class="field"><label>خصم مطلوب %</label><input class="input" type="number" min="0" step="0.5" data-live="draft.discountPct" data-num value="${d.discountPct}" ${d.mode === 'UNBUNDLED' ? 'disabled' : ''}></div>` : '<div class="field"><label>التسعير</label><input class="input" readonly value="سعر الجملة الصافي Net Rate"></div>'}
          ${d.channel !== 'B2B' ? `<div class="field"><label>عربون مدفوع الآن (ج.م)</label><input class="input" type="number" min="0" data-live="draft.deposit" data-num value="${d.deposit}"></div>` : '<div class="field"><label>السداد</label><input class="input" readonly value="خصم فوري من المحفظة"></div>'}
          <div class="field"><label>مهلة التعليق المؤقت (2–24 ساعة)</label><input class="input" type="number" min="2" max="24" data-live="draft.ttl" data-num value="${d.ttl}"></div>
          ${d.channel !== 'DIRECT' ? `<div class="field"><label>عمولة تشجيعية/فرد</label><input class="input" type="number" min="0" data-live="draft.incentive" data-num value="${d.incentive}"></div>
          <div class="field"><label>توجيه العمولة التشجيعية</label><select class="input" data-ui="draft.incentiveMode">${opt('CLIENT_DISCOUNT', d.incentiveMode, 'خصم مباشر لحجز العميل')}${opt('AGENT_CREDIT', d.incentiveMode, 'رصيد دائن بمحفظة الوكيل')}</select></div>` : ''}
        </div>
        ${d.mode === 'UNBUNDLED' ? `<div class="alert warn">🔒 خدمات مجزأة: اختر الخدمات — تُقفل خانة السعر وتتحول الحالة آلياً إلى "بانتظار تسعير الإدارة" ولا يتأكد السرير إلا بعد الاعتماد.
          <div class="row" style="margin-top:6px">${[['HOTEL', 'فندق فقط'], ['AIR', 'طيران'], ['VISA', 'تأشيرة'], ['BUS', 'نقل']].map(([k, l]) => `<label class="chip"><input type="checkbox" data-ui="draft.services.${k}" ${d.services[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>` : ''}
        ${d.mode === 'PRIVATE_ROOM' ? `<div class="alert info">🔒 غرفة مغلقة: تُحجز الغرفة بكامل أسرّتها للعائلة/المجموعة ويتم تخطي فحص الجنس. الأسرّة الشاغرة داخلها تُحتسب في السعر.</div>` : ''}

        <div><div class="row"><b>👥 المسافرون (${d.pax.length})</b><span class="spacer"></span>
          <button class="btn sm" data-act="addDraftPax" data-type="ADULT">+ بالغ</button><button class="btn sm" data-act="addDraftPax" data-type="CHD">+ طفل بدون سرير</button><button class="btn sm" data-act="addDraftPax" data-type="INF">+ رضيع</button>
          <button class="btn sm ghost" data-act="fillDemoPax">✨ تعبئة تجريبية</button></div>
        <div class="tbl-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>#</th><th>الاسم بالعربية</th><th>الاسم بالإنجليزية (كالجواز)</th><th>الجنس</th><th>التصنيف</th><th>الميلاد</th><th>رقم الجواز</th><th>انتهاء الجواز</th><th>الرقم القومي</th><th>رقم الحدود</th><th>الهاتف</th><th></th></tr></thead><tbody>
        ${d.pax.map((p, i) => { const chk = E.passportCheck(p.passportExp, s.trip.returnDate); return `<tr>
          <td>${i + 1}</td><td>${trInput(i, 'nameAr', 'الاسم رباعي', 'style="min-width:150px"')}</td><td>${trInput(i, 'nameEn', 'AS IN PASSPORT', 'style="min-width:160px;direction:ltr"')}</td>
          <td><select class="input" data-ui="draft.pax.${i}.gender">${opt('M', p.gender, 'ذكر')}${opt('F', p.gender, 'أنثى')}</select></td>
          <td><select class="input" data-ui="draft.pax.${i}.type">${Object.entries(E.PAX_TYPES).map(([k, v]) => opt(k, p.type, v.ar)).join('')}</select></td>
          <td><input class="input" type="date" data-ui="draft.pax.${i}.dob" value="${p.dob}"></td>
          <td>${trInput(i, 'passport', 'A12345678', 'style="direction:ltr;width:110px"')}</td>
          <td><input class="input" type="date" data-ui="draft.pax.${i}.passportExp" value="${p.passportExp}" style="${p.passportExp && !chk.ok ? 'border-color:var(--danger);color:#ffb3b3' : ''}" title="${esc(chk.message)}"></td>
          <td>${trInput(i, 'nid', '14 رقم', 'style="direction:ltr;width:130px"')}</td><td>${trInput(i, 'borderNo', 'Border No', 'style="direction:ltr;width:110px"')}</td>
          <td>${trInput(i, 'phone', '01xxxxxxxxx', 'style="direction:ltr;width:120px"')}</td>
          <td>${d.pax.length > 1 ? `<button class="btn sm danger" data-act="delDraftPax" data-i="${i}">✕</button>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div></div>
      </div>
      <div class="card" data-partial="bookingSummary">${App.partials.bookingSummary()}</div>
    </div>

    <div class="card" style="margin-top:14px"><h3>📒 دفتر الحجوزات ودورة حياة السداد</h3>
      <div class="tabs">${[['ALL', 'الكل'], ['HOLD', '🟡 معلق/بانتظار'], ['DEPOSIT', '🟠 عربون'], ['CONFIRMED', '🔴 مؤكد'], ['EXPIRED', 'منتهي']].map(([k, l]) => `<button class="${filt === k ? 'active' : ''}" data-act="bkFilter" data-f="${k}">${l}</button>`).join('')}</div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>الحجز</th><th>القناة</th><th>المسار</th><th>الفئة</th><th>الأفراد</th><th>الصافي</th><th>المسدد</th><th>الحالة</th><th>المهلة</th><th>إجراءات</th></tr></thead><tbody>
      ${list.map((b) => { const px = s.pax.filter((p) => p.bookingId === b.id); return `<tr>
        <td><a href="#" data-act="bookingDetail" data-id="${b.id}"><b class="num">${b.code}</b></a></td><td class="small">${h.channelLabel(b)}</td>
        <td class="small">${esc(E.SALE_MODES[b.mode])}</td><td>${b.mode === 'UNBUNDLED' ? esc((b.services || []).join('+')) : E.ROOM_TYPES[b.roomType].ar}</td>
        <td class="num">${px.length}${px.some((p) => p.type !== 'ADULT') ? ' 👶' : ''}</td><td>${h.egp(b.net)}</td>
        <td style="min-width:110px">${b.net ? h.progress(b.paid || 0, b.net) : '—'}</td><td>${h.statusChip(b.status)}${b.discountPct ? ` <span class="chip small">خصم ${b.discountPct}%</span>` : ''}</td>
        <td>${E.HOLD_STATES.includes(b.status) && b.holdUntil ? `⏱️ ${h.countdown(b.holdUntil)}` : '—'}</td>
        <td class="row" style="gap:4px">
          ${b.status === 'PENDING_APPROVAL' ? `<button class="btn sm gold" data-act="approveDiscount" data-id="${b.id}">اعتماد الخصم</button>` : ''}
          ${b.status === 'PENDING_PRICING' ? `<button class="btn sm gold" data-act="priceUnbundled" data-id="${b.id}">تسعير إداري</button>` : ''}
          ${E.LIVE_STATES.includes(b.status) && b.net && (b.paid || 0) < b.net && !['PENDING_APPROVAL', 'PENDING_PRICING'].includes(b.status) ? `<button class="btn sm primary" data-act="payBooking" data-id="${b.id}">سند قبض</button>` : ''}
          ${E.HOLD_STATES.includes(b.status) ? `<button class="btn sm ghost" data-act="expireSoon" data-id="${b.id}" title="للتجربة: إنهاء المهلة خلال 5 ثوانٍ">⏩</button>` : ''}
          ${E.LIVE_STATES.includes(b.status) ? `<button class="btn sm danger" data-act="cancelBooking" data-id="${b.id}">إلغاء</button>` : ''}
        </td></tr>`; }).join('')}
      </tbody></table></div>
    </div>
    <div class="card" style="margin-top:14px"><h3>🕓 سجل التدقيق</h3><div class="small" style="max-height:180px;overflow:auto">${s.audit.slice(0, 40).map((a) => `<div><span class="faint num">${h.dt(a.at)}</span> · <b>${esc(a.by)}</b> · ${esc(a.msg)}</div>`).join('') || '<span class="muted">لا عمليات بعد.</span>'}</div></div>`;
  };

  App.actions.bkFilter = (d) => { App.ui.bookingFilter = d.f; App.render(); };
  App.actions.addDraftPax = (d) => { const dr = App.ui.draft; dr.pax.push(blankPax(dr.pax[0] ? dr.pax[0].gender : 'M', d.type)); App.render(); };
  App.actions.delDraftPax = (d) => { App.ui.draft.pax.splice(Number(d.i), 1); App.render(); };
  App.actions.fillDemoPax = () => {
    const dr = App.ui.draft, base = E.addDays(new Date(), 400);
    const pool = [['سعاد عبد المنعم خليل', 'SOAD ABDELMONEM KHALIL', 'F'], ['رحاب سمير يونس', 'REHAB SAMIR YOUNES', 'F'], ['حسام الدين فاروق', 'HOSSAM ELDIN FAROUK', 'M'], ['أيمن رضا عطا', 'AYMAN REDA ATTA', 'M']];
    dr.pax.forEach((p, i) => {
      const [ar, en, g] = pool[(i + (dr.pax[0].gender === 'F' ? 0 : 2)) % pool.length];
      Object.assign(p, { nameAr: p.type === 'ADULT' ? ar : 'طفل ' + ar.split(' ')[0], nameEn: p.type === 'ADULT' ? en : 'CHILD ' + en.split(' ')[0], gender: p.type === 'ADULT' ? g : p.gender,
        dob: p.type === 'INF' ? '2025-06-01' : p.type === 'CHD' ? '2019-02-02' : '1982-0' + ((i % 9) + 1) + '-15',
        passport: 'A' + (30000000 + Math.floor(Math.random() * 9999999)), passportExp: E.iso(E.addDays(base, i * 90)), nid: '2820' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0'),
        borderNo: '', phone: '010' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0') });
    });
    App.render();
  };

  App.actions.createBooking = () => {
    const s = S(), d = App.ui.draft, input = draftInput(d), v = E.priceBooking(s, input);
    if (v.status === 'BLOCKED') return App.toast('⛔ ' + v.reasons.join(' · '), 'err');
    if (d.pax.some((p) => !p.nameAr.trim() || !p.nameEn.trim())) return App.toast('أدخل الاسم بالعربية والإنجليزية لكل مسافر', 'err');
    if (!d.pax.some((p) => p.type === 'ADULT')) return App.toast('يجب وجود بالغ واحد على الأقل', 'err');
    const adults = d.pax.filter((p) => p.type === 'ADULT').length;
    if (d.mode === 'PRIVATE_ROOM' && adults > E.ROOM_TYPES[d.roomType].cap) return App.toast(`عدد البالغين (${adults}) أكبر من سعة الغرفة ال${E.ROOM_TYPES[d.roomType].ar}`, 'err');
    if (v.warnings.length && !confirm('تنبيه جوازات:\n' + v.warnings.join('\n') + '\n\nمتابعة الحفظ؟')) return;
    const services = d.mode === 'UNBUNDLED' ? Object.keys(d.services).filter((k) => d.services[k]) : [];
    if (d.mode === 'UNBUNDLED' && !services.length) return App.toast('اختر خدمة واحدة على الأقل', 'err');

    const n = s.bookings.length + 1001;
    const now = Date.now();
    const b = { id: 'B' + now, code: 'BK-' + n, channel: d.channel, userId: input.userId, agentId: input.agentId, mode: d.mode, roomType: d.roomType, services,
      status: v.status, net: v.net, paid: 0, discountPct: input.discountPct || 0, incentive: v.incentive || 0, incentiveMode: d.channel === 'DIRECT' ? null : d.incentiveMode,
      agentCommission: v.agentCommission || 0, holdUntil: null, createdAt: now, installments: [] };
    const agent = input.agentId ? h.agent(input.agentId) : null;
    if (agent && agent.tier === 'B2B') {
      const w = E.walletCheck(agent, v.net, s.fx.current);
      agent.balance = E.round2(agent.balance - w.amount);
      s.agentLedger.push({ agentId: agent.id, at: now, desc: `خصم حجز ${b.code} من المحفظة (سعر صافي)`, debit: w.amount, credit: 0, bookingId: b.id });
      b.paid = v.net; b.status = 'CONFIRMED';
    } else if (input.deposit > 0 && b.net) {
      E.applyPayment(b, input.deposit);
    }
    if (E.HOLD_STATES.includes(b.status)) b.holdUntil = now + E.clampTTL(d.ttl) * 3600000;
    if (b.status === 'DEPOSIT') {
      const rest = b.net - b.paid;
      b.installments = [{ due: E.iso(new Date()), amount: b.paid, paid: true, label: 'عربون' },
        { due: E.iso(E.addDays(s.trip.departDate, -21)), amount: Math.round(rest / 2), paid: false, label: 'القسط الثاني' },
        { due: E.iso(E.addDays(s.trip.departDate, -10)), amount: rest - Math.round(rest / 2), paid: false, label: 'القسط الأخير' }];
    }
    s.bookings.push(b);
    const ids = d.pax.map((p, i) => { const id = 'P' + now + i; s.pax.push({ ...p, id, bookingId: b.id, nationality: 'EGYPTIAN', vault: { stage: 0, log: [{ stage: 0, at: now, by: h.user().name }] }, boarding: 0 }); return id; });
    App.audit(`إنشاء حجز ${b.code} (${E.BOOKING_STATUS[b.status].ar}) صافي ${b.net ?? 'بانتظار التسعير'}`);
    let msg = `✅ تم حفظ ${b.code} — ${E.BOOKING_STATUS[b.status].ar}`;
    if (d.mode === 'PRIVATE_ROOM') {
      const r1 = E.assignPrivateRoom(s, 'MAK', b.id), r2 = E.assignPrivateRoom(s, 'MAD', b.id);
      msg += ` · غرفة مغلقة: مكة ${r1.ok ? (r1.room.physicalNo || r1.room.vcode) : '✕'} / المدينة ${r2.ok ? (r2.room.physicalNo || r2.room.vcode) : '✕'}`;
    }
    App.ui.draft = App.newDraft();
    App.save();
    App.toast(msg);
    if (d.mode !== 'PRIVATE_ROOM' && d.mode !== 'UNBUNDLED') {
      App.ui.page = 'rooms'; App.ui.roomMode = 'sales'; App.ui.city = 'MAK';
      App.ui.selPax = ids[d.pax.findIndex((p) => p.type === 'ADULT')];
      App.toast('👉 اختر السرير للتسكين المبدئي — تظهر غرف نفس الجنس فقط');
    }
    App.render();
  };

  App.actions.approveDiscount = (d) => {
    const b = h.booking(d.id), u = h.user();
    if (E.discountAuthority(u) < b.discountPct) return App.toast(`صلاحيتك ${E.discountAuthority(u)}% أقل من الخصم المطلوب ${b.discountPct}% — بدّل المستخدم لمدير المبيعات`, 'err');
    b.status = 'SOFT_HOLD'; b.approvedBy = u.name;
    E.applyPayment(b, 0);
    App.audit(`اعتماد خصم ${b.discountPct}% للحجز ${b.code}`); App.save(); App.render(); App.toast('تم اعتماد الخصم — الحجز معلق بانتظار السداد');
  };
  App.actions.priceUnbundled = (d) => {
    if (!isManager()) return App.toast('تسعير الخدمات المجزأة من صلاحية الإدارة فقط', 'err');
    const b = h.booking(d.id);
    App.modal(`<h3>تسعير إداري – ${b.code}</h3><p class="muted">الخدمات: ${esc(b.services.join(' + '))}</p>
      <div class="field"><label>السعر المعتمد للحجز (ج.م)</label><input class="input" id="up-price" type="number"></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="savePrice" data-id="${b.id}">اعتماد السعر</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.savePrice = (d) => {
    const b = h.booking(d.id), p = App.val('up-price');
    if (!(p > 0)) return App.toast('أدخل سعراً صحيحاً', 'err');
    b.net = p; b.status = 'SOFT_HOLD'; b.pricedBy = h.user().name; E.applyPayment(b, 0);
    App.audit(`تسعير إداري ${b.code} = ${p}`); App.closeModal(); App.save(); App.render();
  };
  App.actions.payBooking = (d) => {
    const b = h.booking(d.id), rest = b.net - (b.paid || 0);
    App.modal(`<h3>سند قبض – ${b.code}</h3><div class="muted">الصافي ${h.egp(b.net)} · المسدد ${h.egp(b.paid)} · المتبقي <b>${h.egp(rest)}</b></div>
      <div class="grid g2" style="margin-top:10px"><div class="field"><label>المبلغ</label><input class="input" id="pay-amt" type="number" value="${rest}"></div>
      <div class="field"><label>طريقة السداد</label><select class="input" id="pay-m"><option>نقدي – خزينة</option><option>إيداع بنكي</option><option>تحويل إنستاباي</option></select></div></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="savePay" data-id="${b.id}">تسجيل السند</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.savePay = (d) => {
    const b = h.booking(d.id), amt = App.val('pay-amt');
    if (!(amt > 0)) return App.toast('مبلغ غير صحيح', 'err');
    E.applyPayment(b, amt);
    let left = amt;
    for (const i of b.installments || []) if (!i.paid && left >= i.amount) { i.paid = true; left -= i.amount; }
    const rc = 'RCV-' + String(Date.now()).slice(-6);
    App.audit(`سند قبض ${rc} بمبلغ ${amt} للحجز ${b.code} (${App.val('pay-m')})`);
    App.closeModal(); App.save(); App.render(); App.toast(`✅ ${rc} — الحالة الآن: ${E.BOOKING_STATUS[b.status].ar}`);
  };
  App.actions.expireSoon = (d) => { h.booking(d.id).holdUntil = Date.now() + 5000; App.save(); App.render(); App.toast('⏩ سينتهي التعليق خلال 5 ثوانٍ وسيتحرر السرير تلقائياً', 'warn'); };
  App.actions.cancelBooking = (d) => {
    const b = h.booking(d.id);
    if (!confirm(`إلغاء الحجز ${b.code} وتحرير أسرّته ومقاعده؟`)) return;
    b.status = 'CANCELLED'; b.holdUntil = null; E.freeBookingInventory(S(), b.id);
    App.audit(`إلغاء الحجز ${b.code}`); App.save(); App.render();
  };
  App.actions.bookingDetail = (d, el, ev) => {
    ev && ev.preventDefault();
    const s = S(), b = h.booking(d.id), px = s.pax.filter((p) => p.bookingId === b.id);
    const bedTxt = (p, c) => { const bed = E.bedOfPax(s, p.id, c); if (!bed) return '<span class="faint">—</span>'; const r = h.room(bed.roomId); return `<span class="num">${esc(r.physicalNo || r.vcode)}</span>/${bed.no}`; };
    const seat = (p) => Object.keys(s.bus.seats).find((k) => s.bus.seats[k] === p.id) || '—';
    App.modal(`<div class="row"><h3 style="margin:0">${b.code}</h3>${h.statusChip(b.status)}<span class="spacer"></span><button class="btn sm" data-act="closeModal">✕</button></div>
      <div class="small muted" style="margin:6px 0">${h.channelLabel(b)} · ${esc(E.SALE_MODES[b.mode])} ${b.approvedBy ? '· اعتمد الخصم ' + esc(b.approvedBy) : ''}</div>
      <div class="grid g3"><div class="card kpi"><div class="lbl">الصافي</div><div class="val">${h.egp(b.net)}</div></div><div class="card kpi"><div class="lbl">المسدد</div><div class="val">${h.egp(b.paid)}</div></div><div class="card kpi"><div class="lbl">المتبقي</div><div class="val">${h.egp((b.net || 0) - (b.paid || 0))}</div></div></div>
      ${b.installments && b.installments.length ? `<h4>جدول الأقساط</h4><table class="t"><tr><th>البند</th><th>الاستحقاق</th><th>المبلغ</th><th>الحالة</th></tr>${b.installments.map((i) => `<tr><td>${i.label}</td><td class="num">${i.due}</td><td>${h.egp(i.amount)}</td><td>${i.paid ? '<span class="chip ok">مسدد</span>' : '<span class="chip hold">مستحق</span>'}</td></tr>`).join('')}</table>` : ''}
      <h4>المسافرون</h4><table class="t"><tr><th>الاسم</th><th>الجنس</th><th>التصنيف</th><th>الجواز</th><th>مكة</th><th>المدينة</th><th>الباص</th></tr>
      ${px.map((p) => { const c = E.passportCheck(p.passportExp, s.trip.returnDate); return `<tr><td>${esc(p.nameAr)}<div class="faint small">${esc(p.nameEn)}</div></td><td>${h.paxGender(p.gender)}</td><td>${E.PAX_TYPES[p.type].ar}</td>
        <td class="num">${esc(p.passport)} ${c.ok ? '' : `<span class="chip danger">${esc(c.message)}</span>`}</td><td>${p.type === 'ADULT' ? bedTxt(p, 'MAK') : 'مع ذويه'}</td><td>${p.type === 'ADULT' ? bedTxt(p, 'MAD') : 'مع ذويه'}</td><td class="num">${seat(p)}</td></tr>`; }).join('')}</table>`);
  };

  // ================================================================ 4) B2B EXTRANET & WALLETS
  App.pages.agents = () => {
    const s = S(), ui = App.ui, prices = E.priceList(s);
    const incentives = s.bookings.filter((b) => b.incentive && b.agentId && E.LIVE_STATES.includes(b.status));
    const ex = ui.extranetAgent && h.agent(ui.extranetAgent);
    const freeBeds = ['MAK', 'MAD'].map((c) => ({ c, list: E.breakage(s, c) }));
    return `
    <div class="page-head"><div><h2>🤝 بوابة الوكلاء والمحافظ وحوكمة المبيعات</h2><p>سيلز داخلي بمصفوفة خصم هرمية · وكيل B2B بسعر جملة ومحفظة وسقف ائتماني · وسيط بسعر الجمهور وشارة عمولة</p></div></div>
    <div class="grid g-side">
      <div class="card"><h3>💳 المحافظ والسقوف الائتمانية</h3>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>الكود</th><th>الاسم</th><th>المستوى</th><th>الرصيد</th><th>السقف الآجل</th><th>المتاح للحجز</th><th>الحالة</th><th></th></tr></thead><tbody>
        ${s.agents.map((a) => { const lock = a.blocked || a.overdueDays > 0; return `<tr><td class="num">${a.code}</td><td>${esc(a.name)}</td>
          <td>${a.tier === 'B2B' ? '<span class="chip ok">وكيل معتمد B2B</span>' : '<span class="chip gold">وسيط حر</span>'}</td>
          <td class="${a.balance < 0 ? 'danger' : ''}">${h.cur(a.balance, a.currency)}</td><td>${a.tier === 'B2B' ? h.cur(a.creditLimit, a.currency) : '—'}</td>
          <td>${a.tier === 'B2B' ? h.cur(a.balance + a.creditLimit, a.currency) : '—'}</td>
          <td>${lock ? `<span class="chip danger">🔒 ${a.blocked ? 'موقوف' : `متأخرات ${a.overdueDays} يوم`}</span>` : '<span class="chip ok">نشط</span>'}</td>
          <td class="row" style="gap:4px"><button class="btn sm" data-act="topup" data-id="${a.id}">${a.tier === 'B2B' ? 'شحن/سداد' : 'صرف عمولة'}</button>
            <button class="btn sm ghost" data-act="toggleBlock" data-id="${a.id}">${a.blocked ? 'تفعيل' : 'إيقاف'}</button>
            <button class="btn sm ghost" data-act="agentStmt" data-id="${a.id}">كشف حساب</button></td></tr>`; }).join('')}
        </tbody></table></div>
        <h3 style="margin-top:16px">🎁 العمولات التشجيعية (Incentive Kickback)</h3>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>الحجز</th><th>الوكيل</th><th>القيمة</th><th>التوجيه</th><th>الحالة</th></tr></thead><tbody>
        ${incentives.map((b) => `<tr><td class="num">${b.code}</td><td>${esc(h.agent(b.agentId).name)}</td><td>${h.egp(b.incentive)}</td>
          <td>${b.incentiveMode === 'CLIENT_DISCOUNT' ? 'خصم مباشر للعميل' : 'رصيد دائن بالمحفظة'}</td>
          <td>${b.incentiveMode === 'CLIENT_DISCOUNT' ? '<span class="chip ok">مطبق على الفاتورة</span>' : b.incentiveReleased ? '<span class="chip ok">صُرف للمحفظة</span>'
            : b.status === 'CONFIRMED' ? `<button class="btn sm gold" data-act="releaseIncentive" data-id="${b.id}">صرف للمحفظة</button>` : '<span class="chip hold">معلق حتى السداد الكامل</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">لا توجد عمولات.</td></tr>'}
        </tbody></table></div>
      </div>
      <div class="stack">
        <div class="card"><h3>🧭 مصفوفة صلاحيات الخصم</h3><table class="t">${Object.entries(E.ROLES).map(([k, r]) => `<tr><td>${r.ar}</td><td><b class="num">${r.maxDiscount}%</b></td><td class="small muted">${k === 'SALES' ? 'أي خصم → اعتماد' : 'ما فوقه → اعتماد أعلى'}</td></tr>`).join('')}</table>
          <div class="small muted" style="margin-top:6px">أي خصم يتجاوز الصلاحية يُعلّق الحجز (Soft-Hold) بحالة "بانتظار اعتماد الخصم" حتى يعتمده المدير.</div></div>
        <div class="card"><h3>🔐 معاينة بوابة الوكيل (Extranet)</h3>
        ${ex ? `<div class="row"><b>${esc(ex.name)}</b><span class="spacer"></span><button class="btn sm" data-act="exLogout">خروج</button></div>
          <div class="small muted">${ex.tier === 'B2B' ? `المحفظة ${h.cur(ex.balance, ex.currency)} · المتاح ${h.cur(ex.balance + ex.creditLimit, ex.currency)}` : 'وسيط: يرى سعر الجمهور وعمولته'}</div>
          ${ex.overdueDays > 0 || ex.blocked ? '<div class="alert err" style="margin-top:6px">🔒 الحجز الذاتي مقفل برمجياً (تجاوز/تأخر سداد)</div>' : ''}
          <table class="t" style="margin-top:8px"><tr><th>الفئة</th><th>${ex.tier === 'B2B' ? 'سعر الجملة الصافي' : 'سعر الجمهور'}</th>${ex.tier === 'BROKER' ? '<th>عمولتك</th>' : ''}</tr>
          ${TYPES.map((ty) => `<tr><td>${E.ROOM_TYPES[ty].ar}</td><td><b>${h.egp(ex.tier === 'B2B' ? prices[ty] * (1 - ex.netDiscountPct / 100) : prices[ty])}</b></td>${ex.tier === 'BROKER' ? `<td><span class="chip gold">${h.egp(prices[ty] * ex.commissionPct / 100)}</span></td>` : ''}</tr>`).join('')}</table>
          <div class="small" style="margin-top:8px"><b>أسرّة تفريد متاحة الآن:</b> ${freeBeds.map((x) => `${E.CITIES[x.c].ar}: ♂ ${x.list.filter((y) => y.room.gender === 'M').reduce((a, y) => a + y.free, 0)} · ♀ ${x.list.filter((y) => y.room.gender === 'F').reduce((a, y) => a + y.free, 0)}`).join(' | ')}</div>
          <button class="btn primary" style="margin-top:10px" data-act="exBook" ${ex.overdueDays > 0 || ex.blocked ? 'disabled' : ''}>حجز ذاتي الآن</button>`
        : `<div class="grid g2"><div class="field"><label>الوكيل</label><select class="input" id="ex-a">${s.agents.map((a) => opt(a.id, '', a.name)).join('')}</select></div>
          <div class="field"><label>الرقم السري</label><input class="input" id="ex-pin" type="password" placeholder="PIN"></div></div>
          <button class="btn" style="margin-top:8px" data-act="exLogin">دخول</button><div class="small faint" style="margin-top:6px">للتجربة: 4411 · 7720 · 1903 · 5050</div>`}
        </div>
      </div>
    </div>`;
  };
  App.actions.topup = (d) => {
    const a = h.agent(d.id);
    App.modal(`<h3>${a.tier === 'B2B' ? 'شحن محفظة / سداد مديونية' : 'صرف عمولة وسيط'} – ${esc(a.name)}</h3>
      <div class="field"><label>المبلغ (${a.currency})</label><input class="input" id="tp-amt" type="number"></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="saveTopup" data-id="${a.id}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.saveTopup = (d) => {
    const a = h.agent(d.id), amt = App.val('tp-amt');
    if (!(amt > 0)) return App.toast('مبلغ غير صحيح', 'err');
    if (a.tier === 'B2B') {
      a.balance = E.round2(a.balance + amt);
      if (a.balance >= 0) a.overdueDays = 0; // debt settled → credit lock released automatically
      S().agentLedger.push({ agentId: a.id, at: Date.now(), desc: 'شحن محفظة / سداد', debit: 0, credit: amt });
    } else {
      a.balance = E.round2(a.balance - amt);
      S().agentLedger.push({ agentId: a.id, at: Date.now(), desc: 'صرف عمولة للوسيط', debit: amt, credit: 0 });
    }
    App.audit(`حركة محفظة ${a.name}: ${amt} ${a.currency}`); App.closeModal(); App.save(); App.render();
  };
  App.actions.toggleBlock = (d) => { const a = h.agent(d.id); a.blocked = !a.blocked; App.audit(`${a.blocked ? 'إيقاف' : 'تفعيل'} ${a.name}`); App.save(); App.render(); };
  App.actions.agentStmt = (d) => { App.ui.page = 'ops'; App.ui.opsTab = 'stmt'; App.ui.stmtAgent = d.id; App.render(); };
  App.actions.releaseIncentive = (d) => {
    const b = h.booking(d.id), a = h.agent(b.agentId), amt = E.round2(a.currency === 'SAR' ? b.incentive / S().fx.current : b.incentive);
    a.balance = E.round2(a.balance + amt); b.incentiveReleased = true;
    S().agentLedger.push({ agentId: a.id, at: Date.now(), desc: `عمولة تشجيعية – ${b.code}`, debit: 0, credit: amt, bookingId: b.id });
    App.audit(`صرف عمولة تشجيعية ${b.code}`); App.save(); App.render();
  };
  App.actions.exLogin = () => {
    const a = h.agent(App.val('ex-a'));
    if (App.val('ex-pin') !== a.pin) return App.toast('رقم سري غير صحيح', 'err');
    App.ui.extranetAgent = a.id; App.render();
  };
  App.actions.exLogout = () => { App.ui.extranetAgent = null; App.render(); };
  App.actions.exBook = () => {
    const a = h.agent(App.ui.extranetAgent);
    App.ui.draft = App.newDraft(); App.ui.draft.channel = a.tier; App.ui.draft.agentId = a.id;
    App.ui.page = 'booking'; App.render();
  };
})();
