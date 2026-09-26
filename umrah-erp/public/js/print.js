/* أفواج — Printing: branded letterhead, amounts in Arabic words (تفقيط), receipt / payment vouchers (company + customer copies),
 * customer booking document (Umrah & domestic) — all A4, print-ready and consistent */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, h = App.h, esc = h.esc;
  const S = () => App.S;

  // ------------------------------------------------------------ تفقيط
  const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const HUNDREDS = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];
  const SCALES = [null, ['ألف', 'ألفان', 'آلاف'], ['مليون', 'مليونان', 'ملايين'], ['مليار', 'ملياران', 'مليارات']];
  function below1000(n) {
    const hd = Math.floor(n / 100), r = n % 100, parts = [];
    if (hd) parts.push(HUNDREDS[hd]);
    if (r) parts.push(r < 20 ? ONES[r] : (r % 10 ? ONES[r % 10] + ' و' : '') + TENS[Math.floor(r / 10)]);
    return parts.join(' و');
  }
  function intWords(n) {
    if (!n) return 'صفر';
    const groups = []; let x = Math.floor(n);
    while (x > 0) { groups.push(x % 1000); x = Math.floor(x / 1000); }
    const out = [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i]; if (!g) continue;
      if (!i) { out.push(below1000(g)); continue; }
      const [one, two, many] = SCALES[i];
      out.push(g === 1 ? one : g === 2 ? two : g <= 10 ? `${below1000(g)} ${many}` : `${below1000(g)} ${one}`);
    }
    return out.join(' و');
  }
  const CUR = { EGP: ['جنيهاً مصرياً', 'قرشاً'], SAR: ['ريالاً سعودياً', 'هللة'], USD: ['دولاراً أمريكياً', 'سنتاً'], AED: ['درهماً إماراتياً', 'فلساً'], KWD: ['ديناراً كويتياً', 'فلساً', 1000], JOD: ['ديناراً أردنياً', 'فلساً', 1000], QAR: ['ريالاً قطرياً', 'درهماً'], BHD: ['ديناراً بحرينياً', 'فلساً', 1000], OMR: ['ريالاً عمانياً', 'بيسة', 1000] };
  /** 1250.5 → "فقط ألف ومائتان وخمسون جنيهاً مصرياً وخمسون قرشاً لا غير" */
  App.tafqeet = (amount, cur = 'EGP') => {
    const [main, sub, subUnits] = CUR[cur] || [cur, ''], units = subUnits || 100;
    const a = Math.abs(Number(amount) || 0), whole = Math.floor(a + 1e-9), frac = Math.round((a - whole) * units);
    return `فقط ${intWords(whole)} ${main}${frac && sub ? ` و${intWords(frac)} ${sub}` : ''} لا غير`;
  };

  // ------------------------------------------------------------ letterhead
  const logoUrl = () => location.origin + location.pathname.replace(/[^/]*$/, '') + 'img/logo.svg';
  const CSS = `@page{size:A4 %O;margin:10mm 11mm}*{box-sizing:border-box}body{font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;color:#1b1b1b;font-size:11.5px;margin:0}
    table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border:1px solid #c9d3cf;padding:5px 7px;text-align:start;vertical-align:top}th{background:#eef4f1;color:#0d3b2c;font-weight:700}
    h1,h2,h3{color:#0d3b2c;margin:0 0 4px}h1{font-size:20px}h2{font-size:16px}h3{font-size:13px;margin-top:10px}.ltr{direction:ltr;text-align:left}.muted{color:#666}.num{font-variant-numeric:tabular-nums}
    .box{border:1px solid #c9d3cf;border-radius:8px;padding:9px 11px;margin:8px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin:6px 0 10px}.sign{display:flex;justify-content:space-between;gap:20px;margin-top:26px}.sign>div{flex:1;text-align:center;border-top:1px dashed #999;padding-top:5px;color:#444}
    .lh{display:flex;align-items:center;gap:12px;border-bottom:3px solid #b8912f;padding-bottom:8px;margin-bottom:10px}.lh img{width:58px;height:58px}.lh .nm{font-size:18px;font-weight:800;color:#0d3b2c}.lh .lg{font-size:11px;color:#444}
    .lh .ids{margin-inline-start:auto;text-align:end;font-size:10.5px;color:#333;line-height:1.6}.foot{position:fixed;bottom:0;left:0;right:0;font-size:9px;color:#777;border-top:1px solid #ddd;padding-top:3px;display:flex;justify-content:space-between}
    .title{display:inline-block;background:#0d3b2c;color:#fff;border-radius:6px;padding:4px 14px;font-size:16px;font-weight:700}.stamp{display:inline-block;border:2px solid;border-radius:6px;padding:2px 10px;font-weight:700;transform:rotate(-4deg)}
    .stamp.ok{color:#1b6b47;border-color:#1b6b47}.stamp.wait{color:#9a6b00;border-color:#9a6b00}.stamp.bad{color:#a12222;border-color:#a12222}
    .amount{display:flex;align-items:center;gap:12px;border:2px solid #0d3b2c;border-radius:10px;padding:8px 12px;margin:8px 0}.amount b{font-size:20px;color:#0d3b2c;white-space:nowrap}.amount span{font-size:12px}
    .kv td:first-child{width:28%;background:#f7faf8;color:#333}.copy{height:138mm;overflow:hidden;position:relative}.cut{border-top:1px dashed #999;margin:6mm 0;text-align:center;font-size:9px;color:#999}
    .totals td{border:none;padding:3px 7px}.totals tr.g td{border-top:2px solid #0d3b2c;font-weight:800;font-size:13px}.terms{font-size:10px;color:#333;line-height:1.7}.terms li{margin-bottom:2px}.pill{display:inline-block;border:1px solid #b8912f;color:#7a5c14;border-radius:99px;padding:1px 9px;font-size:10px}`;
  function letterhead() {
    const c = S().company, P = Model.COUNTRIES[c.country] || {};
    return `<div class="lh"><img src="${logoUrl()}" alt=""><div><div class="nm">${esc(c.name)}</div>${c.legalName && c.legalName !== c.name ? `<div class="lg">${esc(c.legalName)}</div>` : ''}<div class="lg">${esc([c.address, c.phone, c.email, c.website].filter(Boolean).join(' · '))}</div></div>
      <div class="ids">${c.licenseNo ? `ترخيص سياحة ${esc(c.licenseNo)}${c.licenseCategory ? ` (فئة ${esc(c.licenseCategory)})` : ''}<br>` : ''}${c.commercialNo ? `سجل تجاري ${esc(c.commercialNo)}<br>` : ''}${c.taxNo ? `الرقم الضريبي ${esc(c.taxNo)}<br>` : ''}${P.ar ? esc(P.ar) : ''}</div></div>`;
  }
  /** Replaces the basic printer from core with a branded, A4-ready one (same signature). */
  App.printHtml = (title, bodyHtml, landscape) => {
    const who = App.actor ? App.actor().name : '';
    return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS.replace('%O', landscape ? 'landscape' : 'portrait')}</style></head>
      <body>${bodyHtml.includes('class="copy"') ? bodyHtml : letterhead() + bodyHtml}<div class="foot"><span>${esc(S().company.name)} — أفواج</span><span>طُبع ${new Date().toLocaleString('ar-EG')}${who ? ' · ' + esc(who) : ''}</span></div></body></html>`;
  };
  App.printDoc = (title, bodyHtml, landscape) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px';
    document.body.appendChild(f);
    const d = f.contentWindow.document;
    d.open(); d.write(App.printHtml(title, bodyHtml, landscape)); d.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 350);
  };

  // ------------------------------------------------------------ vouchers (سندات)
  const V_TITLE = { RV: 'سند قبض', PV: 'سند صرف', EXP: 'سند مصروف', TR: 'سند تحويل', BILL: 'فاتورة مورد', JV: 'قيد يومية', DT: 'سند تحويل مقدم جدية' };
  const CUR_AR = { EGP: 'ج.م', SAR: 'ر.س', USD: '$' };
  function voucherCopy(v, copyLabel) {
    const s = S(), cb = h.cashbox(v.cashboxId), f = v.bookingId ? Model.findBooking(s, v.bookingId) : null;
    const partyTxt = v.party ? h.partyName(v.party) : v.type === 'EXP' ? ((s.expenseCategories.find((c) => c.id === v.categoryId) || {}).name || '') : v.type === 'TR' ? `إلى ${((h.cashbox(v.toCashboxId) || {}).name || '')}` : (s.accounts.find((a) => a.code === v.accountCode) || {}).name || '';
    const lead = v.type === 'RV' ? 'استلمنا من السيد/ة' : v.type === 'PV' ? 'صرفنا إلى السيد/ة' : v.type === 'EXP' ? 'صرفنا عن بند' : v.type === 'TR' ? 'حولنا من ' + esc((cb || {}).name || '') : 'المورد';
    const stamp = v.status === 'POSTED' ? '<span class="stamp ok">معتمد ✓</span>' : v.status === 'PENDING' ? '<span class="stamp wait">بانتظار الاعتماد</span>' : `<span class="stamp bad">${v.status === 'REJECTED' ? 'مرفوض' : 'ملغي'}</span>`;
    const egp = v.currency !== 'EGP' ? `<div class="muted small">يعادل ${h.n2(v.amount * v.fx)} ج.م بسعر ${v.fx}</div>` : '';
    const trip = v.tripId ? (s.trips.find((d) => d.id === v.tripId) || {}).trip || (s.dom && s.dom.programs.find((p) => p.id === v.tripId)) : null;
    return `<div class="copy">${letterhead()}
      <div class="head"><div><span class="title">${V_TITLE[v.type]}</span> <span class="pill">${esc(copyLabel)}</span></div><div style="text-align:end">رقم <b class="num">${esc(v.no)}</b><br>التاريخ <b class="num">${esc(v.date)}</b><br>${stamp}</div></div>
      <div class="amount"><b class="num">${h.n2(v.amount)} ${CUR_AR[v.currency] || esc(v.currency)}</b><span>${App.tafqeet(v.amount, v.currency)}${egp}</span></div>
      <table class="kv"><tr><td>${lead}</td><td><b>${esc(partyTxt)}</b></td></tr>
        <tr><td>وذلك عن</td><td>${esc(v.memo || '—')}${f && !String(v.memo || '').includes(f.b.code) ? ` — حجز <b>${esc(f.b.code)}</b>` : ''}${trip ? ` · ${esc(trip.code || '')} ${esc(trip.name || '')}` : ''}</td></tr>
        ${v.type !== 'BILL' && v.type !== 'JV' ? `<tr><td>طريقة الدفع</td><td>${esc(v.method || 'نقدي')} · ${v.type === 'RV' ? 'في' : 'من'} ${esc((cb || {}).name || '—')}${cb && cb.bankName ? ` (${esc(cb.bankName)})` : ''}</td></tr>` : ''}
        ${v.wht ? `<tr><td>ضريبة خصم وإضافة محجوزة</td><td>${h.n2(v.wht)} — الصافي المدفوع ${h.n2(v.amount - v.wht)}</td></tr>` : ''}${v.whtIn ? `<tr><td>ضريبة خصمها العميل</td><td>${h.n2(v.whtIn)} — المستلم نقداً ${h.n2(v.amount - v.whtIn)}</td></tr>` : ''}
        ${f && f.b.net ? `<tr><td>موقف الحجز</td><td>الإجمالي ${h.n2(f.b.net)} · المسدد ${h.n2(f.b.paid)} · المتبقي <b>${h.n2(Math.max(0, f.b.net - f.b.paid))}</b></td></tr>` : ''}</table>
      <div class="sign"><div>${v.type === 'RV' ? 'المستلم (الخزينة)' : 'المستلم'}<br><small>${esc(v.createdBy)}</small></div><div>المحاسب<br><small>${esc(v.approvedBy || '')}</small></div><div>${v.type === 'RV' ? 'توقيع العميل' : 'اعتماد المدير'}</div></div></div>`;
  }
  App.actions.vPrint = (d) => {
    const v = S().vouchers.find((x) => x.id === d.id);
    const two = ['RV', 'PV'].includes(v.type);
    App.printDoc(v.no, two ? `${voucherCopy(v, 'أصل — نسخة العميل')}<div class="cut">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>${voucherCopy(v, 'صورة — نسخة الشركة')}` : voucherCopy(v, 'نسخة الشركة'));
  };

  // ------------------------------------------------------------ booking document
  const DEFAULT_TERMS = {
    UMRAH: ['يُعتبر الحجز مؤكداً بعد سداد العربون وتسليم جوازات السفر سارية لمدة 6 أشهر على الأقل من تاريخ العودة.', 'يُستكمل باقي المبلغ حسب جدول الأقساط الموضح، وفي كل الأحوال قبل موعد السفر بعشرة أيام.',
      'في حال الإلغاء يُخصم ما تم سداده للجهات (التأشيرة، الطيران، الفنادق) وفق سياساتها، ويُرد الباقي خلال 14 يوماً.', 'مواعيد الطيران والفنادق قد تتغير من الجهات المختصة دون مسؤولية على الشركة، مع إخطار العميل فور العلم.',
      'التسكين في مكة والمدينة حسب فئة الغرفة المختارة، والفصل بين الرجال والسيدات إلا في الغرف العائلية المغلقة.', 'العميل مسؤول عن صحة البيانات والمستندات المقدمة منه.'],
    DOMESTIC: ['يُعتبر الحجز مؤكداً بعد سداد العربون، ويُسدد الباقي قبل موعد الرحلة بثلاثة أيام على الأقل.', 'الإلغاء قبل الرحلة بأكثر من 7 أيام: يُسترد المبلغ عدا رسوم إدارية 10%. أقل من 7 أيام: حسب سياسة الفندق. عدم الحضور: لا يُسترد.',
      'الالتزام بمواعيد التجمع المحددة، والأتوبيس لا ينتظر أكثر من 15 دقيقة.', 'دخول الغرف حسب مواعيد الفندق (عادة 2 ظهراً) والمغادرة 12 ظهراً.', 'الطفل حسب السن الموضح بالوثيقة، ويُطلب ما يثبت السن عند الوصول.'],
  };
  function terms(domain) {
    const c = S().company.terms;
    const list = c && c.trim() ? c.split('\n').map((x) => x.trim()).filter(Boolean) : DEFAULT_TERMS[domain];
    return `<h3>الشروط والأحكام</h3><ol class="terms">${list.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
  }
  function moneyBlock(s, b) {
    const t = Acc.splitGross(s, b.net || 0), vs = s.vouchers.filter((v) => v.bookingId === b.id && v.status === 'POSTED');
    return `<table class="totals" style="width:55%;margin-inline-start:auto">
      ${b.gross && b.gross !== b.net ? `<tr><td>الإجمالي قبل الخصم</td><td>${h.n2(b.gross)}</td></tr>` : ''}${b.discountPct ? `<tr><td>خصم ${b.discountPct}%</td><td>−${h.n2((b.gross || 0) - b.net)}</td></tr>` : ''}
      ${t.vat || t.stamp ? `<tr><td>القيمة قبل الضرائب</td><td>${h.n2(t.net)}</td></tr>${t.vat ? `<tr><td>ضريبة القيمة المضافة ${s.company.vatRate}%</td><td>${h.n2(t.vat)}</td></tr>` : ''}${t.stamp ? `<tr><td>ضريبة الدمغة</td><td>${h.n2(t.stamp)}</td></tr>` : ''}` : ''}
      <tr class="g"><td>إجمالي قيمة الحجز</td><td>${h.n2(b.net)} ج.م</td></tr><tr><td>المسدد</td><td>${h.n2(b.paid)}</td></tr><tr class="g"><td>المتبقي</td><td>${h.n2(Math.max(0, (b.net || 0) - (b.paid || 0)))} ج.م</td></tr></table>
      <div class="muted" style="text-align:end">${App.tafqeet(b.net || 0)}</div>
      ${(b.installments || []).length ? `<h3>جدول السداد</h3><table><tr><th>القسط</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>الحالة</th></tr>${b.installments.map((i) => `<tr><td>${esc(i.label || '')}</td><td class="num">${esc(i.due)}</td><td>${h.n2(i.amount)}</td><td>${i.paid ? 'مسدد' : 'مستحق'}</td></tr>`).join('')}</table>` : ''}
      ${vs.length ? `<h3>المدفوعات</h3><table><tr><th>السند</th><th>التاريخ</th><th>المبلغ</th><th>الطريقة</th></tr>${vs.map((v) => `<tr><td class="num">${esc(v.no)}</td><td class="num">${esc(v.date)}</td><td>${h.n2(v.amount)} ${esc(v.currency)}</td><td>${esc(v.method || '')}</td></tr>`).join('')}</table>` : ''}`;
  }
  const statusAr = (b) => (E.BOOKING_STATUS[b.status] || { ar: b.status }).ar;
  function umrahDoc(s, f) {
    const b = f.b, t = f.doc.trip, px = f.doc.pax.filter((p) => p.bookingId === b.id), cust = b.customerId && h.customer(b.customerId), ag = b.agentId && h.agent(b.agentId);
    const bed = (p, c) => { const x = E.bedOfPax(s, p.id, c); if (!x) return '—'; const r = s.rooms.find((y) => y.id === x.roomId); return `${esc(r.physicalNo || r.vcode)}/${x.no}`; };
    const stays = Object.entries(t.stays || {}).map(([c, st]) => { const al = s.allotments.find((a) => a.id === st.allotmentId); return { city: (E.CITIES[c] || { ar: c }).ar, hotel: al ? al.hotel : '—', st }; });
    return `<div class="head"><div><span class="title">وثيقة حجز عمرة</span><div class="muted" style="margin-top:6px">${esc(t.name)} · ${esc(t.code)}</div></div>
      <div style="text-align:end">رقم الحجز <b class="num">${esc(b.code)}</b><br>تاريخ الحجز <b class="num">${E.iso(new Date(b.createdAt))}</b><br>الحالة: <b>${esc(statusAr(b))}</b></div></div>
      <div class="grid"><table class="kv"><tr><td>العميل</td><td><b>${esc(cust ? cust.name : ag ? ag.name : '')}</b>${cust && cust.code ? ` <span class="muted">(${esc(cust.code)})</span>` : ''}</td></tr><tr><td>الهاتف</td><td class="num">${esc((cust && cust.phone) || (ag && ag.phone) || '')}</td></tr>
        ${ag ? `<tr><td>عن طريق</td><td>${esc(ag.name)}</td></tr>` : ''}<tr><td>عدد المعتمرين</td><td>${px.length}</td></tr></table>
      <table class="kv"><tr><td>السفر</td><td class="num">${esc(t.departDate)}</td></tr><tr><td>العودة</td><td class="num">${esc(t.returnDate)}</td></tr><tr><td>الطيران</td><td>${esc(t.flight || '—')}</td></tr>
        <tr><td>الباقة</td><td>${esc(E.SALE_MODES[b.mode])}${b.mode !== 'UNBUNDLED' ? ` — غرفة ${esc(E.ROOM_TYPES[b.roomType].ar)}` : ''}</td></tr></table></div>
      <h3>بيانات المعتمرين</h3><table><tr><th>#</th><th>الاسم</th><th>الاسم بالجواز</th><th>النوع</th><th>رقم الجواز</th><th>انتهاء الجواز</th><th>مكة</th><th>المدينة</th></tr>
        ${px.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.nameAr)}</td><td class="ltr">${esc(p.nameEn)}</td><td>${E.PAX_TYPES[p.type].ar} ${p.gender === 'F' ? '♀' : '♂'}</td><td class="num">${esc(p.passport)}</td><td class="num">${esc(p.passportExp)}</td><td class="num">${p.type === 'ADULT' ? bed(p, 'MAK') : 'مع ذويه'}</td><td class="num">${p.type === 'ADULT' ? bed(p, 'MAD') : 'مع ذويه'}</td></tr>`).join('')}</table>
      <div class="grid"><div class="box"><b>الإقامة</b><br>${stays.map((x) => `${esc(x.city)}: ${esc(x.hotel)}${x.st.checkIn ? ` <span class="num">(${esc(x.st.checkIn)}${x.st.nights ? ` · ${x.st.nights} ليالٍ` : ''})</span>` : ''}`).join('<br>')}${t.boardingPoints && t.boardingPoints.length ? `<br><b>التجمع:</b> ${esc(t.boardingPoints.join('، '))}` : ''}</div>
        <div class="box"><b>المشرف</b><br>${esc((t.supervisor && t.supervisor.name) || '—')}${t.supervisor && t.supervisor.phoneEG ? ` · <span class="num">${esc(t.supervisor.phoneEG)}</span>` : ''}</div></div>
      <h3>القيمة المالية</h3>${moneyBlock(s, b)}${terms('UMRAH')}
      <div class="sign"><div>العميل: ${esc(cust ? cust.name : '')}<br><small>أقر بصحة البيانات وقبول الشروط</small></div><div>موظف الحجز<br><small>${esc(b.createdBy)}</small></div><div>ختم الشركة</div></div>`;
  }
  function domesticDoc(s, b) {
    const Dom = window.Dom, p = b.programId ? Dom.program(s, b.programId) : null, o = p && p.kind !== 'DAYTRIP' ? p.hotelOptions[b.optIdx] : null, ht = b.hotel ? Dom.hotel(s, b.hotel.hotelId) : null;
    const cust = b.customerId && h.customer(b.customerId), nl = (x) => esc(x || '').replace(/\n/g, '<br>');
    const hname = o ? (o.hotelId ? (Dom.hotel(s, o.hotelId) || {}).name : o.hotelName) : ht ? ht.name : '';
    return `<div class="head"><div><span class="title">وثيقة حجز ${p ? esc(Dom.KINDS[p.kind].ar) : 'فندق'}</span><div class="muted" style="margin-top:6px">${p ? esc(p.name) + ' · ' + esc(p.code) : esc(hname)}</div></div>
      <div style="text-align:end">رقم الحجز <b class="num">${esc(b.code)}</b><br>تاريخ الحجز <b class="num">${E.iso(new Date(b.createdAt))}</b><br>الحالة: <b>${esc(statusAr(b))}</b></div></div>
      <div class="grid"><table class="kv"><tr><td>العميل</td><td><b>${esc(cust ? cust.name : (b.pax[0] || {}).name)}</b></td></tr><tr><td>الهاتف</td><td class="num">${esc((b.pax[0] || {}).phone || '')}</td></tr>
        <tr><td>الأفراد</td><td>${b.units.adults} بالغ${b.units.chd ? ` · ${b.units.chd} طفل` : ''}${b.units.inf ? ` · ${b.units.inf} رضيع` : ''}</td></tr>${b.pax.length > 1 ? `<tr><td>المرافقون</td><td>${b.pax.slice(1).map((x) => esc(x.name)).join('، ')}</td></tr>` : ''}</table>
      <table class="kv">${p ? `<tr><td>الوجهة</td><td>${esc(p.city || '')}</td></tr><tr><td>التاريخ</td><td class="num">${esc(p.startDate)}${p.endDate !== p.startDate ? ' ← ' + esc(p.endDate) + ` (${Dom.nights(p.startDate, p.endDate)} ليالٍ)` : ''}</td></tr>
        <tr><td>الانتقالات</td><td>${esc(Dom.TRANSPORT[(p.transport || {}).type] || '')}${(b.seats || []).length ? ` · المقاعد <b>${b.seats.sort((x, y) => x - y).join('، ')}</b>` : ''}</td></tr>${b.pickup ? `<tr><td>التجمع</td><td>${esc(b.pickup)} ${esc(((p.pickups || []).find((x) => x.place === b.pickup) || {}).time || '')}</td></tr>` : ''}`
        : `<tr><td>الوصول</td><td class="num">${esc(b.hotel.checkIn)}</td></tr><tr><td>المغادرة</td><td class="num">${esc(b.hotel.checkOut)} (${b.hotel.nights} ليالٍ)</td></tr>${b.hotel.confirmationNo ? `<tr><td>تأكيد الفندق</td><td class="num">${esc(b.hotel.confirmationNo)}</td></tr>` : ''}`}</table></div>
      ${hname ? `<table><tr><th>الفندق</th><th>نظام الإقامة</th><th>الغرف</th></tr><tr><td>${esc(hname)}</td><td>${esc(Dom.BOARDS[o ? o.board : b.hotel.board])}</td><td>${b.rooms.map((r) => `${Dom.ROOMS[r.type].ar} (${r.adults} بالغ${(r.children || []).length ? ` + ${r.children.map((c) => `طفل ${c.age}${c.bed ? ' بسرير' : ''}`).join('، ')}` : ''})`).join('<br>')}</td></tr></table>` : ''}
      <h3>تفاصيل السعر</h3><table><tr><th>البند</th><th>القيمة</th></tr>${b.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${h.n2(l.total)}</td></tr>`).join('')}</table>${moneyBlock(s, b)}
      ${p && (p.includes || p.excludes) ? `<div class="grid"><div class="box"><b>البرنامج يشمل</b><br>${nl(p.includes)}</div><div class="box"><b>لا يشمل</b><br>${nl(p.excludes)}</div></div>` : ''}
      ${p && p.itinerary ? `<div class="box"><b>البرنامج</b><br>${nl(p.itinerary)}</div>` : ''}${terms('DOMESTIC')}
      <div class="sign"><div>العميل<br><small>أقر بقبول الشروط</small></div><div>موظف الحجز<br><small>${esc(b.createdBy)}</small></div><div>ختم الشركة</div></div>`;
  }
  function hajjDoc(s, p) {
    const Hj = window.Hajj, k = Hj.pkg(s, p.packageId), ss = Hj.season(s, k.seasonId), nl = (x) => esc(x || '').replace(/\n/g, '<br>');
    const terms = ['يلتزم الحاج بتقديم المستندات المطلوبة (جواز ساري، صور، شهادات التطعيم، التقرير الطبي) في المواعيد التي تحددها الشركة والجهات المختصة.',
      'قبول الحاج نهائياً مرهون بموافقة الجهات المختصة وصدور التأشيرة؛ وفي حالة الرفض يُرد المسدد بعد خصم ما دُفع فعلياً للجهات ولا يُسترد.',
      `يُسدد المبلغ حسب جدول الأقساط الموضح، والتأخر عن السداد قبل مواعيد سداد باقات المشاعر يعطي الشركة الحق في إلغاء الحجز.`,
      `الإلغاء من الحاج يخضع لجدول الغرامات: ${(k.cancelPolicy || []).map((c) => `قبل السفر بأقل من ${c.daysBefore} يوم ${c.feePct}%`).join('، ')}${k.nonRefundableAfterSubmit ? `، وبعد الرفع للجهات لا يُسترد ${h.n0(k.nonRefundableAfterSubmit)} ج.م` : ''}.`,
      'مواعيد الطيران والتفويج والتسكين في المشاعر تحددها الجهات المختصة، وتلتزم الشركة بإخطار الحاج بأي تغيير فور علمها.',
      'يلتزم الحاج بتعليمات مشرف الفوج والجهات الرسمية طوال الرحلة.'];
    const custom = s.company.terms && s.company.terms.trim() ? s.company.terms.split('\n').filter(Boolean) : [];
    return `<div class="head"><div><span class="title">عقد حج — ${esc(ss.name)}</span><div class="muted" style="margin-top:6px">${esc(k.name)} · ${esc(k.code)}</div></div>
      <div style="text-align:end">رقم الحاج <b class="num">${esc(p.code)}</b><br>تاريخ التسجيل <b class="num">${E.iso(new Date(p.createdAt))}</b><br>المرحلة: <b>${esc(Hj.STAGES[p.stage].ar)}</b></div></div>
      <div class="grid"><table class="kv"><tr><td>الحاج</td><td><b>${esc(p.nameAr)}</b><br><span class="ltr">${esc(p.nameEn || '')}</span></td></tr><tr><td>الرقم القومي</td><td class="num">${esc(p.nid || '')}</td></tr>
        <tr><td>الجواز</td><td class="num">${esc(p.passport || '')} — ينتهي ${esc(p.passportExp || '')}</td></tr><tr><td>الهاتف</td><td class="num">${esc(p.phone)}</td></tr><tr><td>النسك</td><td>${esc(Hj.NUSUK[p.nusuk])}</td></tr></table>
      <table class="kv"><tr><td>المستوى</td><td>${esc(Hj.LEVELS[k.level])} — ${esc(Hj.DURATION[k.duration])}</td></tr><tr><td>السفر / العودة</td><td class="num">${esc(k.departDate)} ← ${esc(k.returnDate)}</td></tr>
        <tr><td>المسار</td><td>${esc(Hj.ROUTE[k.route])} · ${esc(Hj.TRANSPORT[k.transport])}</td></tr><tr><td>المشاعر</td><td>${esc(Hj.MASHAIR[k.mashair])}</td></tr><tr><td>الغرفة</td><td>${esc(Hj.ROOMS[p.roomType].ar)}</td></tr></table></div>
      <table><tr><th>الإقامة</th><th>الفندق</th><th>الليالي</th></tr>${(k.stays || []).map((st) => `<tr><td>${esc(Hj.CITIES[st.city])}</td><td>${esc(st.hotel)}</td><td>${st.nights}</td></tr>`).join('')}</table>
      <h3>تفاصيل السعر</h3><table><tr><th>البند</th><th>القيمة</th></tr>${p.lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${h.n2(l.total)}</td></tr>`).join('')}</table>${moneyBlock(s, p)}
      <h3>الشروط والأحكام</h3><ol class="terms">${[...terms, ...custom].map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
      <div class="sign"><div>الحاج: ${esc(p.nameAr)}<br><small>أقر بصحة البيانات وقبول الشروط</small></div><div>موظف التسجيل<br><small>${esc(p.createdBy)}</small></div><div>ختم الشركة</div></div>`;
  }
  App.bookingDocHtml = (bookingId) => {
    const s = S(), f = Model.findBooking(s, bookingId);
    if (!f) return '';
    return f.hajj ? hajjDoc(s, f.b) : f.domestic ? domesticDoc(s, f.b) : Model.withTrip(s, f.doc.id, () => umrahDoc(s, f));
  };
  App.actions.bookingDoc = (d) => { const f = Model.findBooking(S(), d.id); App.printDoc('Booking ' + f.b.code, App.bookingDocHtml(d.id)); };
})();
