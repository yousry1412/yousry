/* أفواج — WhatsApp: Business Cloud API sending (server-side token) with wa.me fallback, message center for bulk/aggregate
 * messages (collection reminders, agent balances, trip & program travellers, all customers), per-booking message, auto receipts */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, h = App.h, esc = h.esc, opt = h.opt;
  const S = () => App.S;
  App.waCfg = { enabled: false, autoReceipt: false };
  App.loadWa = async () => { if (!App.online) return; try { App.waCfg = await App.api('GET', 'api/wa/status'); } catch (e) { /* ignore */ } };

  /** Send one message: Business API when enabled (silent, logged), otherwise open a wa.me link. */
  App.waSend = async (phone, text, ref) => {
    if (!phone) return App.toast('لا يوجد رقم هاتف', 'err');
    if (App.online && App.waCfg.enabled) {
      try { await App.api('POST', 'api/wa/send', { to: phone, text, ref }); App.toast('✅ أُرسلت عبر واتساب بيزنس'); return true; }
      catch (e) { App.toast('⚠️ ' + e.message + ' — سيُفتح واتساب يدوياً', 'warn'); }
    }
    window.open(E.waLink(phone, text), '_blank', 'noopener');
    return false;
  };

  // ------------------------------------------------------------ recipients
  function allBookings(s) {
    const out = [];
    for (const d of s.trips) for (const b of d.bookings) out.push({ b, where: `${d.trip.code} ${d.trip.name}`, date: d.trip.departDate, lead: d.pax.find((p) => p.bookingId === b.id && p.phone) || {} });
    for (const b of (s.dom || { bookings: [] }).bookings) {
      const p = b.programId ? window.Dom.program(s, b.programId) : null;
      out.push({ b, where: p ? `${p.code} ${p.name}` : 'حجز فندق', date: p ? p.startDate : b.hotel && b.hotel.checkIn, lead: { phone: (b.pax[0] || {}).phone, nameAr: (b.pax[0] || {}).name } });
    }
    return out;
  }
  const custOf = (b, lead) => { const c = b.customerId && h.customer(b.customerId); const a = b.agentId && h.agent(b.agentId); return { name: (c && c.name) || lead.nameAr || (a && a.name) || '', phone: (c && c.phone) || lead.phone || (a && a.phone) || '' }; };
  const SCOPES = {
    COLLECT: { ar: '💰 تذكير بالمتبقي (كل من عليه مبالغ)', tpl: 'السلام عليكم {الاسم}\nنذكركم بالمتبقي على حجز {الكود} ({الرحلة}): {المتبقي} ج.م\nموعد السفر {التاريخ}. يمكنكم السداد نقداً أو تحويلاً.\n{الشركة}' },
    AGENTS: { ar: '🤝 كشف رصيد الوكلاء والمناديب', tpl: 'السلام عليكم {الاسم}\nرصيد حسابكم لدى {الشركة}: {الرصيد} ج.م {الحالة}\nلأي استفسار تواصلوا معنا.' },
    TRIP: { ar: '🕋 معتمرو رحلة عمرة', tpl: 'السلام عليكم {الاسم}\nتفاصيل رحلة {الرحلة}: السفر {التاريخ}.\n{الشركة}' },
    HAJJ: { ar: '⛰️ حجاج برنامج حج', tpl: 'السلام عليكم الحاج/ة {الاسم}\nتذكير: {القسط} مستحق {التاريخ} بقيمة {المبلغ} ج.م — برنامج {الرحلة}.\nالمتبقي الإجمالي {المتبقي} ج.م\n{الشركة}' },
    PROGRAM: { ar: '🏖️ عملاء برنامج سياحة داخلية', tpl: 'السلام عليكم {الاسم}\nتذكير برحلة {الرحلة} يوم {التاريخ}.\n{الشركة}' },
    CUSTOMERS: { ar: '👥 كل العملاء (رسالة حرة/عروض)', tpl: 'السلام عليكم {الاسم}\nعروض {الشركة} الجديدة…' },
  };
  function recipients(s, w) {
    const today = E.iso(new Date()), rows = [];
    if (w.scope === 'COLLECT') {
      for (const x of allBookings(s)) {
        const due = Acc.r2((x.b.net || 0) - (x.b.paid || 0));
        if (!E.LIVE_STATES.includes(x.b.status) || due <= 0 || x.b.channel === 'B2B' || (x.date && x.date < today)) continue;
        const c = custOf(x.b, x.lead);
        rows.push({ ref: x.b.code, name: c.name, phone: c.phone, vars: { الكود: x.b.code, الرحلة: x.where, المتبقي: h.n0(due), التاريخ: x.date || '' } });
      }
    } else if (w.scope === 'AGENTS') {
      for (const a of s.agents) {
        const bal = Acc.partyBalance(s, 'agent', a.id); if (Math.abs(bal) < 1) continue;
        rows.push({ ref: a.code, name: a.name, phone: a.phone, vars: { الرصيد: h.n0(Math.abs(bal)), الحالة: bal > 0 ? 'مستحق السداد' : 'لصالحكم' } });
      }
    } else if (w.scope === 'TRIP') {
      const d = s.trips.find((x) => x.id === w.tripId) || s.trips[0];
      if (d) for (const b of d.bookings.filter((x) => E.LIVE_STATES.includes(x.status))) {
        const lead = d.pax.find((p) => p.bookingId === b.id && p.phone) || {}, c = custOf(b, lead);
        rows.push({ ref: b.code, name: c.name, phone: c.phone, vars: { الكود: b.code, الرحلة: d.trip.name, التاريخ: d.trip.departDate, المتبقي: h.n0((b.net || 0) - (b.paid || 0)) } });
      }
    } else if (w.scope === 'PROGRAM') {
      const p = (s.dom.programs.find((x) => x.id === w.progId) || s.dom.programs[0]);
      if (p) for (const b of s.dom.bookings.filter((x) => x.programId === p.id && E.LIVE_STATES.includes(x.status))) {
        const c = custOf(b, { phone: (b.pax[0] || {}).phone, nameAr: (b.pax[0] || {}).name });
        rows.push({ ref: b.code, name: c.name, phone: c.phone, vars: { الكود: b.code, الرحلة: p.name, التاريخ: p.startDate, التجمع: b.pickup || '', المتبقي: h.n0(b.net - b.paid) } });
      }
    } else if (w.scope === 'HAJJ') {
      const k = (s.hajj.packages.find((x) => x.id === w.hajjId) || s.hajj.packages[0]);
      if (k) for (const p of s.hajj.pilgrims.filter((x) => x.packageId === k.id && window.Hajj.ACTIVE(x))) {
        const i = (p.installments || []).find((x) => !x.paid) || {};
        rows.push({ ref: p.code, name: p.nameAr, phone: p.phone, vars: { الكود: p.code, الرحلة: k.name, القسط: i.label || '', التاريخ: i.due || k.departDate, المبلغ: h.n0(i.amount || 0), المتبقي: h.n0(p.net - p.paid) } });
      }
    } else for (const c of s.customers) if (c.phone) rows.push({ ref: c.code, name: c.name, phone: c.phone, vars: {} });
    const seen = new Set();
    return rows.filter((r) => { const k = r.ref + '|' + r.phone; if (!r.phone || seen.has(k)) return false; seen.add(k); return true; });
  }
  const fill = (tpl, r) => tpl.replace(/{([^}]+)}/g, (m, k) => (k === 'الاسم' ? r.name : k === 'الشركة' ? S().company.name : r.vars[k] ?? m));

  // ------------------------------------------------------------ message center
  App.pages.waCenter = () => {
    const s = S(), w = App.ui.wac || (App.ui.wac = { scope: 'COLLECT', tripId: (s.trips[0] || {}).id, progId: ((s.dom && s.dom.programs[0]) || {}).id, text: SCOPES.COLLECT.tpl, off: {}, sent: {} });
    const rows = recipients(s, w), chosen = rows.filter((r) => !w.off[r.ref + r.phone]);
    if (App.online && !App.waLoaded) { App.waLoaded = true; App.loadWa().then(() => App.render()); }
    return `<div class="page-head"><div><h2>🟢 مركز رسائل واتساب</h2><p>رسائل جماعية وتعاملات إجمالية: تذكير المتبقي، أرصدة الوكلاء، معتمري رحلة، عملاء برنامج، عروض — ${App.waCfg.enabled ? '<span class="chip ok">واتساب بيزنس مفعّل — الإرسال آلي</span>' : '<span class="chip hold">غير مفعّل — روابط يدوية (فعّله من الشركة والفروع)</span>'}</p></div></div>
    <div class="grid g-side"><div class="card"><div class="grid g2">
        <div class="field"><label>المجموعة</label><select class="input" data-act-change="wacScope">${Object.entries(SCOPES).map(([k, x]) => opt(k, w.scope, x.ar)).join('')}</select></div>
        ${w.scope === 'TRIP' ? `<div class="field"><label>الرحلة</label><select class="input" data-ui="wac.tripId">${s.trips.map((d) => opt(d.id, w.tripId, `${d.trip.code} · ${d.trip.name}`)).join('')}</select></div>` : ''}
        ${w.scope === 'HAJJ' ? `<div class="field"><label>برنامج الحج</label><select class="input" data-ui="wac.hajjId">${s.hajj.packages.map((k) => opt(k.id, w.hajjId, `${k.code} · ${k.name}`)).join('')}</select></div>` : ''}
        ${w.scope === 'PROGRAM' ? `<div class="field"><label>البرنامج</label><select class="input" data-ui="wac.progId">${s.dom.programs.map((p) => opt(p.id, w.progId, `${p.code} · ${p.name}`)).join('')}</select></div>` : ''}</div>
      <div class="field" style="margin-top:8px"><label>نص الرسالة — المتغيرات: {الاسم} {الكود} {الرحلة} {التاريخ} {المتبقي} {الرصيد} {الحالة} {التجمع} {الشركة}</label><textarea class="input" rows="6" data-ui="wac.text">${esc(w.text)}</textarea></div>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-act="wacSend">📤 إرسال للمحددين (${chosen.length})</button><button class="btn ghost" data-act="wacAll" data-v="1">تحديد الكل</button><button class="btn ghost" data-act="wacAll" data-v="0">إلغاء التحديد</button></div></div>
      <div class="card"><h3>👁️ معاينة</h3><div class="msg" style="max-width:100%;white-space:pre-wrap">${esc(rows[0] ? fill(w.text, rows[0]) : 'لا مستلمين')}</div></div></div>
    <div class="card" style="margin-top:14px"><h3>المستلمون (${rows.length})</h3><div class="tbl-wrap"><table class="t"><thead><tr><th></th><th>المرجع</th><th>الاسم</th><th>الهاتف</th><th>تفاصيل</th><th></th></tr></thead><tbody>
      ${rows.map((r) => { const k = r.ref + r.phone; return `<tr><td><input type="checkbox" data-act-change="wacTick" data-k="${esc(k)}" ${w.off[k] ? '' : 'checked'}></td><td class="num">${esc(r.ref)}</td><td>${esc(r.name)}</td><td class="num">${esc(r.phone)}</td>
        <td class="small muted">${esc(Object.entries(r.vars).filter(([, v]) => v).map(([a, v]) => `${a}: ${v}`).join(' · '))}</td>
        <td>${w.sent[k] ? `<span class="chip ${w.sent[k] === 'ok' ? 'ok' : 'danger'}">${w.sent[k] === 'ok' ? 'أُرسلت' : 'فشل'}</span>` : `<a class="btn sm" target="_blank" rel="noopener" href="${E.waLink(r.phone, fill(w.text, r))}" data-act="wacManual" data-k="${esc(k)}">🟢 فتح</a>`}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">لا يوجد مستلمون لهذه المجموعة.</td></tr>'}</tbody></table></div></div>
    ${App.online && ['OWNER', 'MANAGER', 'ACCOUNTANT'].includes(App.role()) ? `<div class="card" style="margin-top:14px"><div class="row"><h3 style="margin:0">📜 سجل الإرسال</h3><span class="spacer"></span><button class="btn sm" data-act="wacLog">تحديث</button></div>
      <div class="tbl-wrap" style="margin-top:8px"><table class="t small"><thead><tr><th>الوقت</th><th>الرقم</th><th>المرجع</th><th>الحالة</th><th>بواسطة</th><th>الخطأ</th></tr></thead><tbody>${(App.waLog || []).map((l) => `<tr><td class="num">${esc(l.created_at)}</td><td class="num">${esc(l.to_phone)}</td><td>${esc(l.ref || '')}</td><td>${l.status === 'sent' ? '<span class="chip ok">أُرسلت</span>' : '<span class="chip danger">فشل</span>'}</td><td>${esc(l.by_name || '')}</td><td class="small muted">${esc(l.error || '')}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">اضغط تحديث.</td></tr>'}</tbody></table></div></div>` : ''}`;
  };
  App.actions.wacScope = (d) => { const w = App.ui.wac; w.scope = d.value; w.text = SCOPES[d.value].tpl; w.off = {}; w.sent = {}; App.render(); };
  App.actions.wacTick = (d, el) => { const w = App.ui.wac; if (el.checked) delete w.off[d.k]; else w.off[d.k] = 1; App.render(); };
  App.actions.wacAll = (d) => { const w = App.ui.wac; w.off = {}; if (d.v === '0') for (const r of recipients(S(), w)) w.off[r.ref + r.phone] = 1; App.render(); };
  App.actions.wacManual = (d) => { App.ui.wac.sent[d.k] = 'ok'; setTimeout(() => App.render(), 300); return 'follow'; };
  App.actions.wacLog = async () => { try { App.waLog = await App.api('GET', 'api/wa/log'); App.render(); } catch (e) { App.toast(e.message, 'err'); } };
  App.actions.wacSend = async () => {
    const w = App.ui.wac, rows = recipients(S(), w).filter((r) => !w.off[r.ref + r.phone]);
    if (!rows.length) return App.toast('لا مستلمين محددين', 'err');
    if (!(App.online && App.waCfg.enabled)) return App.toast('واتساب بيزنس غير مفعّل — استخدم أزرار "فتح" لكل مستلم، أو فعّله من الشركة والفروع', 'warn');
    if (!confirm(`إرسال ${rows.length} رسالة عبر واتساب بيزنس؟`)) return;
    App.toast('⏳ جارِ الإرسال…');
    try {
      const res = await App.api('POST', 'api/wa/bulk', { items: rows.map((r) => ({ to: r.phone, text: fill(w.text, r), ref: r.ref })) });
      res.forEach((x, i) => { w.sent[rows[i].ref + rows[i].phone] = x.ok ? 'ok' : 'err'; });
      App.audit(`واتساب جماعي: ${res.filter((x) => x.ok).length} نجح / ${res.filter((x) => !x.ok).length} فشل`); App.save();
      App.toast(`✅ ${res.filter((x) => x.ok).length} أُرسلت · ${res.filter((x) => !x.ok).length} فشلت`); App.render();
    } catch (e) { App.toast(e.message, 'err'); }
  };

  // ------------------------------------------------------------ per booking / program
  App.actions.waBooking = (d) => {
    const s = S(), f = Model.findBooking(s, d.id), b = f.b;
    let phone, name, what, date;
    if (f.hajj) { const k = window.Hajj.pkg(s, b.packageId); phone = b.phone; name = b.nameAr; what = k.name; date = k.departDate; }
    else if (f.domestic) { const p = b.programId ? window.Dom.program(s, b.programId) : null; phone = (b.pax[0] || {}).phone; name = (b.pax[0] || {}).name; what = p ? p.name : 'حجز فندق'; date = p ? p.startDate : b.hotel.checkIn; }
    else { const lead = f.doc.pax.find((p) => p.bookingId === b.id && p.phone) || {}; const c = custOf(b, lead); phone = c.phone; name = c.name; what = f.doc.trip.name; date = f.doc.trip.departDate; }
    const due = Acc.r2((b.net || 0) - (b.paid || 0));
    const text = `السلام عليكم ${name}\nتأكيد حجزكم رقم ${b.code} لدى ${s.company.name}\n${what} — ${date}\nالإجمالي ${h.n0(b.net)} ج.م · المسدد ${h.n0(b.paid)} · المتبقي ${h.n0(due)}\nالحالة: ${E.BOOKING_STATUS[b.status].ar}\nنتمنى لكم رحلة سعيدة 🤍`;
    App.waSend(phone, text, b.code);
  };
  App.actions.waBulk = (d) => { App.ui.wac = { scope: 'PROGRAM', progId: d.p, text: App.ui.domWaMsg ? App.ui.domWaMsg.replace(/{المتبقي}/g, '{المتبقي}') : SCOPES.PROGRAM.tpl, off: {}, sent: {} }; App.actions.go({ page: 'waCenter' }); };
  /** Receipt message when a customer receipt is approved (if enabled in settings). */
  App.waAutoReceipt = (v) => {
    if (!(App.online && App.waCfg.enabled && App.waCfg.autoReceipt) || v.type !== 'RV' || !v.party) return;
    const s = S(), x = v.party.type === 'customer' ? h.customer(v.party.id) : v.party.type === 'agent' ? h.agent(v.party.id) : null;
    if (!x || !x.phone) return;
    const f = v.bookingId ? Model.findBooking(s, v.bookingId) : null;
    const text = `${s.company.name}\nتم استلام ${h.n0(v.amount)} ${v.currency === 'EGP' ? 'ج.م' : v.currency} بسند رقم ${v.no}${f ? ` لحجز ${f.b.code} — المتبقي ${h.n0(Math.max(0, f.b.net - f.b.paid))} ج.م` : ''}\nشكراً لكم.`;
    App.api('POST', 'api/wa/send', { to: x.phone, text, ref: v.no }).catch(() => {});
  };

  // ------------------------------------------------------------ settings card (rendered inside company settings)
  App.waSettingsCard = () => {
    if (!App.online) return '';
    if (!App.waFull) { App.waFull = { loading: true }; App.api('GET', 'api/wa/config').then((c) => { App.waFull = c; App.render(); }).catch(() => { App.waFull = { error: true }; }); }
    const c = App.waFull;
    if (c.loading || c.error) return `<div class="card"><h3>🟢 واتساب بيزنس</h3><div class="muted small">${c.error ? 'من صلاحية المالك/المدير' : 'جارِ التحميل…'}</div></div>`;
    return `<div class="card"><h3>🟢 واتساب بيزنس (WhatsApp Cloud API) ${c.enabled ? '<span class="chip ok">مفعّل</span>' : '<span class="chip">غير مفعّل</span>'}</h3>
      <div class="grid g2"><div class="field"><label>Access Token</label><input class="input" id="wa-token" type="password" value="${esc(c.token)}" placeholder="EAAG…" style="direction:ltr"></div>
        <div class="field"><label>Phone Number ID</label><input class="input" id="wa-phone" value="${esc(c.phoneId)}" style="direction:ltr"></div>
        <div class="field"><label>طريقة الإرسال</label><select class="input" id="wa-mode">${opt('TEMPLATE', c.mode, 'قالب معتمد من ميتا (للرسائل التي تبدأها الشركة)')}${opt('TEXT', c.mode, 'نص حر (خلال 24 ساعة من رسالة العميل)')}</select></div>
        <div class="field"><label>اسم القالب · اللغة</label><div class="row" style="gap:6px"><input class="input" id="wa-tpl" value="${esc(c.template)}" style="direction:ltr"><input class="input" id="wa-lang" value="${esc(c.lang)}" style="width:70px;direction:ltr"></div></div>
        <div class="field"><label>مفتاح الدولة الافتراضي</label><input class="input" id="wa-dial" value="${esc(c.dial)}" style="direction:ltr"></div>
        <label class="chk" style="align-self:end"><input type="checkbox" id="wa-auto" ${c.autoReceipt ? 'checked' : ''}> إرسال إيصال تلقائي للعميل عند اعتماد سند القبض</label></div>
      <div class="small muted" style="margin-top:6px">القالب يُنشأ في Meta Business بمتغير واحد {{1}} يحمل نص الرسالة كاملاً. التوكن يُحفظ على السيرفر فقط ولا يظهر لأي مستخدم.</div>
      <div class="row" style="margin-top:10px"><button class="btn primary" data-act="waSave">حفظ</button><input class="input" id="wa-test" placeholder="رقم للتجربة" style="width:160px;direction:ltr"><button class="btn" data-act="waTest">إرسال تجربة</button></div></div>`;
  };
  App.actions.waSave = async () => {
    try { App.waFull = await App.api('PUT', 'api/wa/config', { token: App.val('wa-token'), phoneId: App.val('wa-phone'), mode: App.val('wa-mode'), template: App.val('wa-tpl'), lang: App.val('wa-lang'), dial: App.val('wa-dial'), autoReceipt: App.val('wa-auto') });
      await App.loadWa(); App.toast('تم حفظ إعدادات واتساب'); App.render(); } catch (e) { App.toast(e.message, 'err'); }
  };
  App.actions.waTest = async () => { try { await App.api('POST', 'api/wa/send', { to: App.val('wa-test'), text: `رسالة تجربة من ${S().company.name} ✅`, ref: 'TEST' }); App.toast('✅ أُرسلت'); } catch (e) { App.toast('⛔ ' + e.message, 'err'); } };
})();
