/* Umrah ERP — Planning & Sales pages: Trip Builder/FX, Allotment Heatmap, Booking Engine, B2B Extranet */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, h = App.h, esc = h.esc;
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
      <div class="row" style="margin-top:10px"><button class="btn primary" data-act="addSettlement">+ سند صرف لمورد بالريال (يسجل فرق العملة تلقائياً)</button><span class="small muted">مخطط تسجيل التكاليف: الموردون ← فاتورة مورد، ثم سند صرف.</span></div>
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
    const s = S(), sup = s.suppliers.find((x) => x.currency === 'SAR') || s.suppliers[0];
    App.openVoucher({ type: 'PV', currency: 'SAR', fx: s.fx.current, party: sup ? { type: 'supplier', id: sup.id } : null, tripId: s.activeTripId, refFx: s.trip.fxRef, memo: 'سداد مستخلص مورد' });
  };

  // ================================================================ 2) ALLOTMENT HEATMAP
  App.pages.heatmap = () => {
    const s = S(), ui = App.ui, al = s.allotments.find((a) => a.id === ui.heatAllot) || s.allotments.find((a) => a.id === s.trip.stays.MAK.allotmentId) || s.allotments[0];
    if (!al) return '<div class="card empty-state"><h3>لا توجد مخصصات فندقية</h3><button class="btn primary" data-act="go" data-page="hotels">إضافة فندق ومخصص</button></div>';
    ui.heatAllot = al.id;
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
    Acc.post(s, { memo: `بيع غرف فقط ${n}×${E.ROOM_TYPES[ty].ar} – ${al.code} (${ref}) للوكيل ${agent.name}`, source: { type: 'BK', id: ref }, by: App.actor().name,
      lines: [{ acc: '1104', dr: E.round2(netEGP), party: { type: 'agent', id: agent.id } }, { acc: '4102', cr: E.round2(netEGP) }] });
    App.audit(`حجز سريع ${ref} للوكيل ${agent.name}`); App.save(); App.render();
    App.toast(`✅ تم الحجز وإصدار الفوتشر ${ref} — خصم ${h.n0(w.amount)} ${agent.currency}`);
  };

  // ================================================================ 3) BOOKING ENGINE
  const blankPax = (gender = 'M', type = 'ADULT') => ({ nameAr: '', nameEn: '', gender, type, dob: '', passport: '', passportExp: '', nid: '', borderNo: '', phone: '', photoFileId: null, passportFileId: null });
  App.newDraft = () => ({ channel: 'DIRECT', agentId: App.S && App.S.agents[0] ? App.S.agents[0].id : null, mode: 'FULL_PACKAGE', roomType: 'QUAD', services: { HOTEL: false, AIR: true, VISA: true, BUS: false },
    discountPct: 0, incentive: 0, incentiveMode: 'CLIENT_DISCOUNT', deposit: 0, ttl: 24, pax: [blankPax()],
    cashboxId: App.S && App.S.cashboxes[0] ? App.S.cashboxes[0].id : null, depositFileIds: [], notes: '', branchId: 'BR1' });
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
    if (!s.trip) return h.noTrip();
    if (d.channel !== 'DIRECT' && !s.agents.some((a) => a.id === d.agentId && a.tier === d.channel)) d.agentId = (s.agents.find((a) => a.tier === d.channel) || {}).id;
    const prices = E.priceList(s);
    const filt = ui.bookingFilter, q = (ui.bkSearch || '').trim();
    const list = s.bookings.filter((b) => (filt === 'ALL' || (filt === 'HOLD' ? E.HOLD_STATES.includes(b.status) : b.status === filt))
      && (!q || b.code.includes(q) || s.pax.some((p) => p.bookingId === b.id && (p.nameAr.includes(q) || String(p.phone).includes(q) || p.nameEn.includes(q.toUpperCase()))))).slice().reverse();
    const trInput = (i, k, ph, extra = '') => `<input class="input" data-live="draft.pax.${i}.${k}" value="${esc(d.pax[i][k])}" placeholder="${ph}" ${extra}>`;
    const alertsFor = (b) => Model.alerts(s, App.role()).filter((a) => a.ref === b.id && a.level !== 'info').length;
    return `
    <div class="page-head"><div><h2>🧾 الحجوزات — ${esc(s.trip.code)}</h2><p>كامل/تفريد/غرف فقط/خدمات مجزأة · بالغ/طفل/رضيع · صور شخصية وجوازات · خصم هرمي · تعليق بمؤقت · سند قبض بإيصال</p></div>
      <div class="row small">${TYPES.map((ty) => `<span class="chip">${E.ROOM_TYPES[ty].ar}: <b class="num">${h.n0(prices[ty])}</b></span>`).join('')}<span class="chip">طفل: <b class="num">${h.n0(prices.CHD)}</b></span><span class="chip">رضيع: <b class="num">${h.n0(prices.INF)}</b></span></div></div>

    <details class="card" ${ui.bookingFormOpen === false ? '' : 'open'} data-act-toggle="bookingForm"><summary class="row" style="cursor:pointer"><h3 style="margin:0">➕ حجز جديد</h3></summary>
    <div class="grid g-side" style="margin-top:12px">
      <div class="stack">
        <div class="grid g3">
          <div class="field"><label>قناة البيع</label><select class="input" data-ui="draft.channel">${opt('DIRECT', d.channel, 'بيع مباشر (سيلز داخلي)')}${opt('B2B', d.channel, 'وكيل خارجي معتمد B2B')}${opt('BROKER', d.channel, 'وسيط حر Broker')}</select></div>
          ${d.channel === 'DIRECT' ? `<div class="field"><label>موظف البيع (صلاحية الخصم)</label><input class="input" readonly value="${esc(h.user().name)} · ≤ ${E.discountAuthority(h.user())}%"></div>`
            : `<div class="field"><label>${d.channel === 'B2B' ? 'الوكيل' : 'الوسيط'}</label><select class="input" data-ui="draft.agentId">${s.agents.filter((a) => a.tier === d.channel).map((a) => opt(a.id, d.agentId, `${a.code} · ${a.name}`)).join('')}</select></div>`}
          <div class="field"><label>مسار البيع</label><select class="input" data-ui="draft.mode">${Object.entries(E.SALE_MODES).map(([k, v]) => opt(k, d.mode, v)).join('')}</select></div>
          <div class="field"><label>فئة التسكين</label><select class="input" data-ui="draft.roomType" ${d.mode === 'UNBUNDLED' ? 'disabled' : ''}>${TYPES.map((ty) => opt(ty, d.roomType, `${E.ROOM_TYPES[ty].ar} (${E.ROOM_TYPES[ty].cap})`)).join('')}</select></div>
          ${d.channel !== 'B2B' ? `<div class="field"><label>خصم مطلوب %</label><input class="input" type="number" min="0" step="0.5" data-live="draft.discountPct" data-num value="${d.discountPct}" ${d.mode === 'UNBUNDLED' ? 'disabled' : ''}></div>` : '<div class="field"><label>التسعير</label><input class="input" readonly value="سعر الجملة الصافي Net Rate"></div>'}
          <div class="field"><label>مهلة التعليق (2–24 ساعة)</label><input class="input" type="number" min="2" max="24" data-live="draft.ttl" data-num value="${d.ttl}"></div>
          ${d.channel !== 'B2B' ? `<div class="field"><label>عربون مدفوع الآن (ج.م)</label><input class="input" type="number" min="0" data-live="draft.deposit" data-num value="${d.deposit}"></div>
          <div class="field"><label>استلم في خزينة/بنك</label><select class="input" data-ui="draft.cashboxId">${s.cashboxes.map((c) => opt(c.id, d.cashboxId, c.name)).join('')}</select></div>
          <div class="field"><label>إيصال العربون ${App.isApprover() ? '' : '(إلزامي)'}</label><button class="btn" data-act="draftReceipt">📎 ${d.depositFileIds.length ? `${d.depositFileIds.length} مرفق` : 'إرفاق صورة'}</button></div>` : '<div class="field"><label>السداد</label><input class="input" readonly value="خصم فوري من المحفظة"></div>'}
          ${d.channel !== 'DIRECT' ? `<div class="field"><label>عمولة تشجيعية/فرد</label><input class="input" type="number" min="0" data-live="draft.incentive" data-num value="${d.incentive}"></div>
          <div class="field"><label>توجيه العمولة التشجيعية</label><select class="input" data-ui="draft.incentiveMode">${opt('CLIENT_DISCOUNT', d.incentiveMode, 'خصم مباشر لحجز العميل')}${opt('AGENT_CREDIT', d.incentiveMode, 'رصيد دائن بمحفظة الوكيل')}</select></div>` : ''}
          <div class="field"><label>الفرع</label><select class="input" data-ui="draft.branchId">${s.branches.map((b) => opt(b.id, d.branchId, b.name)).join('')}</select></div>
        </div>
        ${d.mode === 'UNBUNDLED' ? `<div class="alert warn">🔒 خدمات مجزأة: تُقفل خانة السعر وتتحول الحالة إلى "بانتظار تسعير الإدارة".
          <div class="row" style="margin-top:6px">${[['HOTEL', 'فندق فقط'], ['AIR', 'طيران'], ['VISA', 'تأشيرة'], ['BUS', 'نقل']].map(([k, l]) => `<label class="chip"><input type="checkbox" data-ui="draft.services.${k}" ${d.services[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>` : ''}
        ${d.mode === 'PRIVATE_ROOM' ? '<div class="alert info">🔒 غرفة مغلقة: تُحجز الغرفة بكامل أسرّتها للعائلة ويتم تخطي فحص الجنس، والأسرّة الشاغرة داخلها تُحتسب في السعر.</div>' : ''}
        <div><div class="row"><b>👥 المسافرون (${d.pax.length})</b><span class="spacer"></span>
          <button class="btn sm" data-act="addDraftPax" data-type="ADULT">+ بالغ</button><button class="btn sm" data-act="addDraftPax" data-type="CHD">+ طفل</button><button class="btn sm" data-act="addDraftPax" data-type="INF">+ رضيع</button>
          <button class="btn sm ghost" data-act="fillDemoPax">✨ تعبئة تجريبية</button></div>
        <div class="tbl-wrap" style="margin-top:8px"><table class="t"><thead><tr><th>#</th><th>صورة</th><th>جواز</th><th>الاسم بالعربية</th><th>الاسم بالإنجليزية</th><th>الجنس</th><th>التصنيف</th><th>الميلاد</th><th>رقم الجواز</th><th>انتهاء الجواز</th><th>الرقم القومي</th><th>الهاتف</th><th></th></tr></thead><tbody>
        ${d.pax.map((p, i) => { const chk = E.passportCheck(p.passportExp, s.trip.returnDate); return `<tr>
          <td>${i + 1}</td>
          <td><button class="btn sm ghost" data-act="draftPaxFile" data-i="${i}" data-k="photoFileId" title="صورة شخصية">${p.photoFileId ? '✅' : '📷'}</button></td>
          <td><button class="btn sm ghost" data-act="draftPaxFile" data-i="${i}" data-k="passportFileId" title="صورة/ملف الجواز">${p.passportFileId ? '✅' : '🛂'}</button></td>
          <td>${trInput(i, 'nameAr', 'الاسم رباعي', 'style="min-width:150px"')}</td><td>${trInput(i, 'nameEn', 'AS IN PASSPORT', 'style="min-width:160px;direction:ltr"')}</td>
          <td><select class="input" data-ui="draft.pax.${i}.gender">${opt('M', p.gender, 'ذكر')}${opt('F', p.gender, 'أنثى')}</select></td>
          <td><select class="input" data-ui="draft.pax.${i}.type">${Object.entries(E.PAX_TYPES).map(([k, v]) => opt(k, p.type, v.ar)).join('')}</select></td>
          <td><input class="input" type="date" data-ui="draft.pax.${i}.dob" value="${p.dob}"></td>
          <td>${trInput(i, 'passport', 'A12345678', 'style="direction:ltr;width:110px"')}</td>
          <td><input class="input" type="date" data-ui="draft.pax.${i}.passportExp" value="${p.passportExp}" style="${p.passportExp && !chk.ok ? 'border-color:var(--danger);color:#ffb3b3' : ''}" title="${esc(chk.message)}"></td>
          <td>${trInput(i, 'nid', '14 رقم', 'style="direction:ltr;width:130px"')}</td>
          <td>${trInput(i, 'phone', '01xxxxxxxxx', 'style="direction:ltr;width:120px"')}</td>
          <td>${d.pax.length > 1 ? `<button class="btn sm danger" data-act="delDraftPax" data-i="${i}">✕</button>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>
        <div class="field" style="margin-top:8px"><label>ملاحظات الحجز</label><input class="input" data-live="draft.notes" value="${esc(d.notes || '')}"></div></div>
      </div>
      <div class="card" data-partial="bookingSummary">${App.partials.bookingSummary()}</div>
    </div></details>

    <div class="card" style="margin-top:14px"><div class="row" style="margin-bottom:8px"><h3 style="margin:0">📒 دفتر الحجوزات</h3><span class="spacer"></span>
      <input class="input" style="max-width:260px" placeholder="🔎 بحث بالكود/الاسم/الهاتف" data-ui="bkSearch" value="${esc(q)}"></div>
      <div class="tabs">${[['ALL', 'الكل'], ['HOLD', '🟡 معلق/بانتظار'], ['DEPOSIT', '🟠 عربون'], ['CONFIRMED', '🔴 مؤكد'], ['EXPIRED', 'منتهي'], ['CANCELLED', 'ملغي']].map(([k, l]) => `<button class="${filt === k ? 'active' : ''}" data-act="bkFilter" data-f="${k}">${l}</button>`).join('')}</div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>الحجز</th><th>العميل/القناة</th><th>المسار</th><th>الأفراد</th><th>الصافي</th><th>المسدد</th><th>الحالة</th><th>المهلة</th><th>تنبيهات</th><th></th></tr></thead><tbody>
      ${list.map((b) => { const px = s.pax.filter((p) => p.bookingId === b.id); const lead = px.find((p) => p.type === 'ADULT') || px[0]; const al = alertsFor(b); return `<tr>
        <td><a href="#" data-act="go" data-page="bookingView" data-id="${b.id}"><b class="num">${b.code}</b></a></td>
        <td class="small"><b>${esc(lead ? lead.nameAr : '')}</b><div class="faint">${h.channelLabel(b)}</div></td>
        <td class="small">${esc(E.SALE_MODES[b.mode])}${b.mode !== 'UNBUNDLED' ? ' · ' + E.ROOM_TYPES[b.roomType].ar : ''}</td>
        <td class="num">${px.length}${px.some((p) => p.type !== 'ADULT') ? ' 👶' : ''}</td><td>${h.egp(b.net)}</td>
        <td style="min-width:100px">${b.net ? h.progress(b.paid || 0, b.net) : '—'}</td><td>${h.statusChip(b.status)}${b.pendingPay ? ' <span class="chip hold" title="سند قبض بانتظار اعتماد المحاسب">💰 دفعة معلقة</span>' : ''}</td>
        <td>${E.HOLD_STATES.includes(b.status) && b.holdUntil ? `⏱️ ${h.countdown(b.holdUntil)}` : '—'}</td>
        <td>${al ? `<span class="chip danger">⚠️ ${al}</span>` : '<span class="chip ok">✓</span>'}</td>
        <td><button class="btn sm" data-act="go" data-page="bookingView" data-id="${b.id}">فتح</button></td></tr>`; }).join('') || '<tr><td colspan="10" class="muted">لا توجد حجوزات.</td></tr>'}
      </tbody></table></div>
    </div>`;
  };

  App.actions.bkFilter = (d) => { App.ui.bookingFilter = d.f; App.render(); };
  App.actions.addDraftPax = (d) => { const dr = App.ui.draft; dr.pax.push(blankPax(dr.pax[0] ? dr.pax[0].gender : 'M', d.type)); App.render(); };
  App.actions.delDraftPax = (d) => { App.ui.draft.pax.splice(Number(d.i), 1); App.render(); };
  App.actions.draftPaxFile = async (d) => {
    const [f] = await App.uploadPicked({ accept: 'image/*,application/pdf' });
    if (f) { App.ui.draft.pax[Number(d.i)][d.k] = f.id; App.render(); }
  };
  App.actions.draftReceipt = async () => {
    const fs = await App.uploadPicked({ accept: 'image/*,application/pdf', multiple: true });
    App.ui.draft.depositFileIds.push(...fs.map((f) => f.id)); App.render();
  };
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
    const s = S(), d = App.ui.draft, v = E.priceBooking(s, draftInput(d));
    if (v.warnings.length && !confirm('تنبيه:\n' + v.warnings.join('\n') + '\n\nمتابعة الحفظ؟')) return;
    if (d.deposit > 0 && d.channel !== 'B2B' && App.online && !App.isApprover() && !d.depositFileIds.length) return App.toast('ارفع صورة إيصال العربون — سيصل للمحاسب للمراجعة', 'err');
    let r;
    try { r = Model.createBooking(s, d, App.actor()); } catch (e) { return App.toast('⛔ ' + e.message, 'err'); }
    const b = r.booking;
    App.audit(`إنشاء حجز ${b.code} (${E.BOOKING_STATUS[b.status].ar}) صافي ${b.net ?? 'بانتظار التسعير'}`);
    App.ui.draft = App.newDraft();
    App.save();
    App.toast(`✅ تم حفظ ${b.code} — ${E.BOOKING_STATUS[b.status].ar}${b.pendingPay ? ' · العربون بانتظار اعتماد المحاسب' : ''}`);
    if (d.mode !== 'PRIVATE_ROOM' && d.mode !== 'UNBUNDLED') {
      App.ui.page = 'rooms'; App.ui.roomMode = 'sales'; App.ui.city = 'MAK';
      App.ui.selPax = r.paxIds[d.pax.findIndex((p) => p.type === 'ADULT')];
      App.toast('👉 اختر السرير للتسكين المبدئي — تظهر غرف نفس الجنس فقط');
    } else { App.ui.page = 'bookingView'; App.ui.viewId = b.id; }
    App.render();
  };

  const sync = (b) => Acc.syncBooking(S(), S().trip, b, App.actor().name);
  App.actions.approveDiscount = (d) => {
    const b = h.booking(d.id), u = h.user();
    if (E.discountAuthority(u) < b.discountPct) return App.toast(`صلاحيتك ${E.discountAuthority(u)}% أقل من الخصم المطلوب ${b.discountPct}%`, 'err');
    b.status = 'SOFT_HOLD'; b.approvedBy = u.name;
    E.applyPayment(b, 0); sync(b);
    App.audit(`اعتماد خصم ${b.discountPct}% للحجز ${b.code}`); App.save(); App.render(); App.toast('تم اعتماد الخصم');
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
    b.net = p; b.status = 'SOFT_HOLD'; b.pricedBy = h.user().name; E.applyPayment(b, 0); sync(b);
    App.audit(`تسعير إداري ${b.code} = ${p}`); App.closeModal(); App.save(); App.render();
  };
  App.actions.payBooking = (d) => {
    const b = h.booking(d.id);
    App.openVoucher({ type: 'RV', amount: Math.max(0, (b.net || 0) - (b.paid || 0)), bookingId: b.id, tripId: S().activeTripId,
      party: b.channel === 'B2B' || !b.customerId ? { type: 'agent', id: b.agentId } : { type: 'customer', id: b.customerId }, memo: `سداد حجز ${b.code}`, lockParty: true });
  };
  App.actions.expireSoon = (d) => { h.booking(d.id).holdUntil = Date.now() + 5000; App.save(); App.render(); App.toast('⏩ سينتهي التعليق خلال 5 ثوانٍ', 'warn'); };
  App.actions.cancelBooking = (d) => {
    const b = h.booking(d.id);
    if (!confirm(`إلغاء الحجز ${b.code} وتحرير أسرّته ومقاعده؟ سيتم عكس الإيراد محاسبياً.`)) return;
    b.status = 'CANCELLED'; b.holdUntil = null; E.freeBookingInventory(S(), b.id); sync(b);
    App.audit(`إلغاء الحجز ${b.code}`); App.save(); App.render();
    if (b.paid > 0) App.toast(`تنبيه: الحجز عليه مدفوعات ${h.n0(b.paid)} ج.م — سجّل سند صرف (استرداد) إن لزم`, 'warn');
  };

  // ------------------------------------------------ full booking view
  App.pages.bookingView = () => {
    const s = S(), f = Model.findBooking(s, App.ui.viewId);
    if (!f) return '<div class="card">الحجز غير موجود.</div>';
    if (f.doc.id !== s.activeTripId) Model.mountTrip(s, f.doc.id);
    const b = f.b, px = s.pax.filter((p) => p.bookingId === b.id), t = s.trip;
    const vouchers = s.vouchers.filter((v) => v.bookingId === b.id);
    const al = Model.alerts(s, App.role()).filter((a) => a.ref === b.id);
    const bedTxt = (p, c) => { const bed = E.bedOfPax(s, p.id, c); if (!bed) return '<span class="faint">—</span>'; const r = h.room(bed.roomId); return `<span class="num">${esc(r.physicalNo || r.vcode)}</span>/${bed.no}`; };
    const seat = (p) => Object.keys(s.bus.seats).find((k) => s.bus.seats[k] === p.id) || '—';
    const cust = b.customerId && h.customer(b.customerId);
    const je = s.journal.filter((j) => j.source && (j.source.id === b.id || vouchers.some((v) => v.id === j.source.id)));
    return `
    <div class="page-head"><div><h2>🧾 ${b.code} ${h.statusChip(b.status)} ${b.pendingPay ? '<span class="chip hold">💰 دفعة بانتظار الاعتماد</span>' : ''}</h2>
      <p>${esc(t.code)} · ${esc(t.name)} · ${h.channelLabel(b)} · ${esc(E.SALE_MODES[b.mode])}${b.mode !== 'UNBUNDLED' ? ' · ' + E.ROOM_TYPES[b.roomType].ar : ''} · أنشأه ${esc(b.createdBy || '')} ${h.dt(b.createdAt)}</p></div>
      <div class="row">
        ${b.status === 'PENDING_APPROVAL' ? `<button class="btn gold" data-act="approveDiscount" data-id="${b.id}">اعتماد الخصم</button>` : ''}
        ${b.status === 'PENDING_PRICING' ? `<button class="btn gold" data-act="priceUnbundled" data-id="${b.id}">تسعير إداري</button>` : ''}
        ${E.LIVE_STATES.includes(b.status) && b.net && (b.paid || 0) < b.net && !['PENDING_APPROVAL', 'PENDING_PRICING'].includes(b.status) ? `<button class="btn primary" data-act="payBooking" data-id="${b.id}">💰 سند قبض</button>` : ''}
        <button class="btn" data-act="printInvoice" data-id="${b.id}">🖨️ فاتورة</button>
        ${E.HOLD_STATES.includes(b.status) ? `<button class="btn ghost" data-act="expireSoon" data-id="${b.id}" title="تجربة">⏩</button>` : ''}
        ${E.LIVE_STATES.includes(b.status) ? `<button class="btn danger" data-act="cancelBooking" data-id="${b.id}">إلغاء الحجز</button>` : ''}
        <button class="btn ghost" data-act="go" data-page="booking">↩ الحجوزات</button></div></div>
    ${al.length ? `<div class="alert-list" style="margin-bottom:12px">${al.map((a) => `<div class="alert ${a.level === 'err' ? 'err' : a.level === 'warn' ? 'warn' : 'info'}">⚠️ ${esc(a.text)}</div>`).join('')}</div>` : ''}
    <div class="grid g4">
      <div class="card kpi"><div class="lbl">الصافي المستحق</div><div class="val">${h.egp(b.net)}</div><div class="hint">${b.discountPct ? `خصم ${b.discountPct}% ${b.approvedBy ? '· اعتمده ' + esc(b.approvedBy) : ''}` : ''}</div></div>
      <div class="card kpi"><div class="lbl">المسدد</div><div class="val ok">${h.egp(b.paid)}</div><div class="hint">${b.net ? h.progress(b.paid, b.net) : ''}</div></div>
      <div class="card kpi"><div class="lbl">المتبقي</div><div class="val ${(b.net || 0) - (b.paid || 0) > 0 ? 'danger' : ''}">${h.egp((b.net || 0) - (b.paid || 0))}</div></div>
      <div class="card kpi"><div class="lbl">${b.channel === 'B2B' ? 'الوكيل' : 'العميل'}</div><div class="val" style="font-size:16px">${b.channel === 'B2B' ? esc(h.agent(b.agentId).name) : cust ? `<a href="#" data-act="go" data-page="partyView" data-ptype="customer" data-id="${cust.id}">${esc(cust.code)} · ${esc(cust.name)}</a>` : '—'}</div><div class="hint">${cust ? esc(cust.phone) : ''}</div></div>
    </div>
    <div class="card" style="margin-top:14px"><h3>👥 المسافرون والمستندات</h3><div class="stack">
      ${px.map((p) => { const c = E.passportCheck(p.passportExp, t.returnDate); return `<div class="pax-card">
        <div class="row" style="gap:6px;align-items:flex-start">${h.thumb(p.photoFileId, 'صورة شخصية').replace('class="thumb', 'class="thumb lg')}${h.thumb(p.passportFileId, 'الجواز').replace('class="thumb', 'class="thumb lg')}</div>
        <div><b>${esc(p.nameAr)}</b> ${h.paxGender(p.gender)} <span class="chip">${E.PAX_TYPES[p.type].ar}</span> ${c.ok ? '' : `<span class="chip danger">${esc(c.message)}</span>`}
          <div class="kv" style="margin-top:6px"><div><span>الاسم بالجواز:</span> <b class="num">${esc(p.nameEn)}</b></div><div><span>الجواز:</span> <b class="num">${esc(p.passport)}</b></div>
          <div><span>الانتهاء:</span> <b class="num">${esc(p.passportExp)}</b></div><div><span>الميلاد:</span> <b class="num">${esc(p.dob)}</b></div><div><span>الرقم القومي:</span> <b class="num">${esc(p.nid)}</b></div>
          <div><span>رقم الحدود:</span> <b class="num">${esc(p.borderNo || '—')}</b></div><div><span>الهاتف:</span> <b class="num">${esc(p.phone)}</b></div>
          <div><span>مكة:</span> ${p.type === 'ADULT' ? bedTxt(p, 'MAK') : 'مع ذويه'}</div><div><span>المدينة:</span> ${p.type === 'ADULT' ? bedTxt(p, 'MAD') : 'مع ذويه'}</div><div><span>الباص:</span> ${seat(p)}</div>
          <div><span>الجواز الآن:</span> ${E.PASSPORT_STAGES[p.vault.stage].ar}</div></div></div>
        <div class="stack" style="min-width:150px"><button class="btn sm" data-act="paxFile" data-id="${p.id}" data-k="photoFileId">📷 صورة شخصية</button><button class="btn sm" data-act="paxFile" data-id="${p.id}" data-k="passportFileId">🛂 صورة الجواز</button>
          <button class="btn sm ghost" data-act="paxCamera" data-id="${p.id}" data-k="photoFileId">📸 كاميرا</button><button class="btn sm ghost" data-act="editPax" data-id="${p.id}">✏️ تعديل البيانات</button>
          ${p.phone ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${esc(E.waLink(p.phone, `السلام عليكم ${p.nameAr}`))}">🟢 واتساب</a>` : ''}</div></div>`; }).join('')}
    </div></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>💰 المدفوعات والسندات</h3>
        <table class="t"><thead><tr><th>السند</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th><th>مرفقات</th></tr></thead><tbody>
        ${vouchers.map((v) => `<tr><td class="num">${v.no}</td><td class="num">${v.date}</td><td>${h.cur(v.amount, v.currency)}</td><td>${h.vStatus(v.status)}${v.rejectReason ? `<div class="small danger">${esc(v.rejectReason)}</div>` : ''}</td>
          <td>${(v.fileIds || []).map((id) => h.fileLink(id, 'إيصال')).join(' ') || '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">لا توجد سندات.</td></tr>'}</tbody></table>
        ${b.installments && b.installments.length ? `<h4>جدول الأقساط</h4><table class="t">${b.installments.map((i) => `<tr><td>${i.label}</td><td class="num">${i.due}</td><td>${h.egp(i.amount)}</td><td>${i.paid ? '<span class="chip ok">مسدد</span>' : i.due < E.iso(new Date()) ? '<span class="chip danger">متأخر</span>' : '<span class="chip hold">مستحق</span>'}</td></tr>`).join('')}</table>` : ''}
      </div>
      <div class="card"><h3>📚 القيود المحاسبية للحجز</h3>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>القيد</th><th>البيان</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
        ${je.flatMap((j) => j.lines.map((l, k) => `<tr><td class="num">${k ? '' : j.no}</td><td class="small">${k ? '' : esc(j.memo)}</td><td class="small">${esc(l.acc)} · ${esc((Acc.account(s, l.acc) || {}).name || '')}</td><td>${l.dr ? h.money(l.dr) : ''}</td><td>${l.cr ? h.money(l.cr) : ''}</td></tr>`)).join('') || '<tr><td colspan="5" class="muted">لا قيود بعد (الحجز معلق).</td></tr>'}
        </tbody></table></div>
        ${b.notes ? `<div class="alert info" style="margin-top:8px">📝 ${esc(b.notes)}</div>` : ''}
      </div>
    </div>`;
  };
  async function setPaxFile(d, capture) {
    const [f] = await App.uploadPicked({ accept: 'image/*,application/pdf', capture });
    if (!f) return;
    const p = h.pax(d.id); p[d.k] = f.id;
    App.audit(`رفع ${d.k === 'photoFileId' ? 'صورة شخصية' : 'صورة جواز'} لـ ${p.nameAr}`); App.save(); App.render();
  }
  App.actions.paxFile = (d) => setPaxFile(d, false);
  App.actions.paxCamera = (d) => setPaxFile(d, true);
  App.actions.editPax = (d) => {
    const p = h.pax(d.id);
    const f = (k, l, extra = '') => `<div class="field"><label>${l}</label><input class="input" id="ep-${k}" value="${esc(p[k] || '')}" ${extra}></div>`;
    App.modal(`<h3>✏️ تعديل بيانات ${esc(p.nameAr)}</h3><div class="grid g2">${f('nameAr', 'الاسم بالعربية')}${f('nameEn', 'الاسم بالإنجليزية', 'style="direction:ltr"')}
      ${f('passport', 'رقم الجواز', 'style="direction:ltr"')}${f('passportExp', 'انتهاء الجواز', 'type="date"')}${f('dob', 'تاريخ الميلاد', 'type="date"')}${f('nid', 'الرقم القومي', 'style="direction:ltr"')}
      ${f('borderNo', 'رقم الحدود', 'style="direction:ltr"')}${f('phone', 'الهاتف', 'style="direction:ltr"')}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="savePax" data-id="${p.id}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.savePax = (d) => {
    const p = h.pax(d.id);
    for (const k of ['nameAr', 'nameEn', 'passport', 'passportExp', 'dob', 'nid', 'borderNo', 'phone']) p[k] = String(App.val('ep-' + k) || '').trim();
    p.nameEn = p.nameEn.toUpperCase();
    App.audit(`تعديل بيانات المسافر ${p.nameAr}`); App.closeModal(); App.save(); App.render();
  };
  App.actions.printInvoice = (d) => {
    const s = S(), f = Model.findBooking(s, d.id), b = f.b, px = f.doc.pax.filter((p) => p.bookingId === b.id), c = s.company;
    const rate = c.vatEnabled ? Number(c.vatRate) : 0, vat = Acc.r2((b.net || 0) * rate / (100 + rate));
    const cust = b.customerId && h.customer(b.customerId);
    App.printDoc('Invoice ' + b.code, `<div class="head"><div><h1>فاتورة ${rate ? 'ضريبية' : ''}</h1><div class="muted">${esc(f.doc.trip.name)} · ${esc(f.doc.trip.code)}</div></div>
      <div>رقم: <b>${esc(b.code)}</b><br>التاريخ: ${E.iso(new Date(b.createdAt))}<br>${cust ? `العميل: ${esc(cust.code)} · ${esc(cust.name)}` : `الوكيل: ${esc((h.agent(b.agentId) || {}).name || '')}`}</div></div>
      <table><tr><th>#</th><th>المسافر</th><th>التصنيف</th><th>الجواز</th></tr>${px.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.nameAr)} — ${esc(p.nameEn)}</td><td>${E.PAX_TYPES[p.type].ar}</td><td>${esc(p.passport)}</td></tr>`).join('')}</table>
      <table style="margin-top:10px;width:50%"><tr><td>${esc(E.SALE_MODES[b.mode])}${b.mode !== 'UNBUNDLED' ? ' — ' + E.ROOM_TYPES[b.roomType].ar : ''}</td><td>${h.n2(b.net - vat)}</td></tr>
      ${rate ? `<tr><td>ضريبة القيمة المضافة ${rate}%</td><td>${h.n2(vat)}</td></tr>` : ''}<tr><th>الإجمالي</th><th>${h.n2(b.net)} ج.م</th></tr>
      <tr><td>المسدد</td><td>${h.n2(b.paid)}</td></tr><tr><td>المتبقي</td><td>${h.n2(b.net - b.paid)}</td></tr></table>
      <div class="sign"><div>توقيع العميل ................</div><div>ختم الشركة ................</div></div>`);
  };

  // ================================================================ AGENTS & REPRESENTATIVES
  App.pages.agents = () => {
    const s = S();
    const incentives = s.trips.flatMap((dd) => dd.bookings.filter((b) => b.incentive && b.agentId && E.LIVE_STATES.includes(b.status)));
    return `
    <div class="page-head"><div><h2>🤝 الوكلاء والمناديب والوسطاء</h2><p>تكويد · محافظ وسقوف ائتمانية · كشوف حسابات من القيود المحاسبية · حساب دخول لكل مندوب يسجل منه حجوزاته ودفعاته بالصور</p></div>
      <button class="btn primary" data-act="agentForm">+ وكيل/مندوب جديد</button></div>
    <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>الكود</th><th>الاسم</th><th>النوع</th><th>الهاتف</th><th>المحفظة</th><th>السقف</th><th>الرصيد المحاسبي</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${s.agents.map((a) => { const lock = a.blocked || a.overdueDays > 0; const bal = Acc.partyBalance(s, 'agent', a.id); return `<tr><td class="num">${esc(a.code)}</td><td><b>${esc(a.name)}</b></td>
        <td>${a.tier === 'B2B' ? '<span class="chip ok">وكيل B2B</span>' : '<span class="chip gold">وسيط/مندوب</span>'}</td><td class="num">${esc(a.phone || '')}</td>
        <td class="${a.balance < 0 ? 'danger' : ''}">${h.cur(a.balance, a.currency)}</td><td>${a.tier === 'B2B' ? h.cur(a.creditLimit, a.currency) : '—'}</td>
        <td class="${bal > 0 ? 'danger' : 'ok'}">${h.egp(Math.abs(bal))} ${bal > 0 ? 'مدين' : bal < 0 ? 'دائن' : ''}</td>
        <td>${lock ? `<span class="chip danger">🔒 ${a.blocked ? 'موقوف' : `متأخرات ${a.overdueDays} يوم`}</span>` : '<span class="chip ok">نشط</span>'}</td>
        <td class="row" style="gap:4px"><button class="btn sm" data-act="topup" data-id="${a.id}">${a.tier === 'B2B' ? '💰 استلام/شحن' : '💸 صرف عمولة'}</button>
          <button class="btn sm ghost" data-act="go" data-page="partyView" data-ptype="agent" data-id="${a.id}">📄 كشف حساب</button>
          <button class="btn sm ghost" data-act="agentForm" data-id="${a.id}">✏️</button>
          <button class="btn sm ghost" data-act="toggleBlock" data-id="${a.id}">${a.blocked ? 'تفعيل' : 'إيقاف'}</button></td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="alert info" style="margin-top:10px">🔐 لعمل حساب دخول للمندوب: <b>الإدارة ← المستخدمون والصلاحيات</b> ← دور "مندوب/وكيل" واربطه بسجله هنا. سيرى حسابه وحجوزاته فقط، ويسجل حجوزات ودفعات بصور الإيصالات تصل للمحاسب للاعتماد.</div></div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h3>🎁 العمولات التشجيعية</h3><div class="tbl-wrap"><table class="t"><thead><tr><th>الحجز</th><th>الوكيل</th><th>القيمة</th><th>التوجيه</th><th>الحالة</th></tr></thead><tbody>
        ${incentives.map((b) => `<tr><td class="num">${b.code}</td><td>${esc(h.agent(b.agentId).name)}</td><td>${h.egp(b.incentive)}</td>
          <td>${b.incentiveMode === 'CLIENT_DISCOUNT' ? 'خصم للعميل' : 'رصيد للوكيل'}</td>
          <td>${b.incentiveMode === 'CLIENT_DISCOUNT' ? '<span class="chip ok">مطبق</span>' : b.incentiveReleased ? '<span class="chip ok">صُرف للمحفظة</span>'
            : b.status === 'CONFIRMED' ? `<button class="btn sm gold" data-act="releaseIncentive" data-id="${b.id}">صرف للمحفظة</button>` : '<span class="chip hold">حتى السداد الكامل</span>'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">لا توجد عمولات.</td></tr>'}
      </tbody></table></div></div>
      <div class="card"><h3>🧭 مصفوفة صلاحيات الخصم</h3><table class="t">${Object.entries(E.ROLES).map(([k, r]) => `<tr><td>${r.ar}</td><td><b class="num">${r.maxDiscount}%</b></td><td class="small muted">${k === 'SALES' ? 'أي خصم → اعتماد' : 'ما فوقه → اعتماد أعلى'}</td></tr>`).join('')}</table></div>
    </div>`;
  };
  App.actions.agentForm = (d) => {
    const a = d.id ? h.agent(d.id) : { tier: 'B2B', currency: 'EGP', creditLimit: 0, netDiscountPct: 5, commissionPct: 4, balance: 0 };
    App.modal(`<h3>${d.id ? 'تعديل' : 'إضافة'} وكيل/مندوب ${a.code ? `<span class="chip">${esc(a.code)}</span>` : ''}</h3><div class="grid g2">
      <div class="field"><label>الاسم</label><input class="input" id="ag-name" value="${esc(a.name || '')}"></div>
      <div class="field"><label>النوع</label><select class="input" id="ag-tier">${opt('B2B', a.tier, 'وكيل معتمد B2B (سعر جملة + محفظة)')}${opt('BROKER', a.tier, 'وسيط/مندوب (سعر جمهور + عمولة)')}</select></div>
      <div class="field"><label>الهاتف</label><input class="input" id="ag-phone" value="${esc(a.phone || '')}" style="direction:ltr"></div>
      <div class="field"><label>عملة المحفظة</label><select class="input" id="ag-cur">${opt('EGP', a.currency, 'جنيه')}${opt('SAR', a.currency, 'ريال')}</select></div>
      <div class="field"><label>السقف الائتماني</label><input class="input" id="ag-limit" type="number" value="${a.creditLimit || 0}"></div>
      <div class="field"><label>خصم الجملة % (B2B)</label><input class="input" id="ag-net" type="number" step="0.5" value="${a.netDiscountPct || 0}"></div>
      <div class="field"><label>العمولة % (وسيط)</label><input class="input" id="ag-com" type="number" step="0.5" value="${a.commissionPct || 0}"></div>
    </div><div class="row" style="margin-top:12px"><button class="btn primary" data-act="saveAgent" data-id="${d.id || ''}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.saveAgent = (d) => {
    const s = S(), name = String(App.val('ag-name')).trim();
    if (name.length < 2) return App.toast('اكتب الاسم', 'err');
    const a = d.id ? h.agent(d.id) : { id: 'A' + Date.now().toString(36), code: Model.nextCode(s, 'AGT', 'AGT'), balance: 0, overdueDays: 0, blocked: false, pin: '' };
    Object.assign(a, { name, tier: App.val('ag-tier'), phone: App.val('ag-phone'), currency: App.val('ag-cur'), creditLimit: Number(App.val('ag-limit')) || 0,
      netDiscountPct: App.val('ag-tier') === 'B2B' ? Number(App.val('ag-net')) || 0 : 0, commissionPct: App.val('ag-tier') === 'BROKER' ? Number(App.val('ag-com')) || 0 : 0 });
    if (!d.id) s.agents.push(a);
    App.audit(`${d.id ? 'تعديل' : 'إضافة'} وكيل ${a.code} ${a.name}`); App.closeModal(); App.save(); App.render();
  };
  App.actions.topup = (d) => {
    const a = h.agent(d.id);
    App.openVoucher({ type: a.tier === 'B2B' ? 'RV' : 'PV', party: { type: 'agent', id: a.id }, currency: a.currency, memo: a.tier === 'B2B' ? `شحن محفظة/سداد – ${a.name}` : `صرف عمولة – ${a.name}`, lockParty: true });
  };
  App.actions.toggleBlock = (d) => { const a = h.agent(d.id); a.blocked = !a.blocked; App.audit(`${a.blocked ? 'إيقاف' : 'تفعيل'} ${a.name}`); App.save(); App.render(); };
  App.actions.releaseIncentive = (d) => {
    const f = Model.findBooking(S(), d.id), b = f.b, a = h.agent(b.agentId), amt = E.round2(a.currency === 'SAR' ? b.incentive / S().fx.current : b.incentive);
    a.balance = E.round2(a.balance + amt); b.incentiveReleased = true;
    App.audit(`صرف عمولة تشجيعية ${b.code} لمحفظة ${a.name}`); App.save(); App.render();
  };
})();
