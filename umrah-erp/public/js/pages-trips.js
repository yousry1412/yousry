/* Umrah ERP — Trips: list, create (multi-trip), rooms absorption, assignment (supervisor / housing rep), close; trip files (tickets, visas, barcode) */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, h = App.h, esc = h.esc, opt = h.opt;
  const S = () => App.S;
  const TYPES = Object.keys(E.ROOM_TYPES);
  let directory = null;
  async function loadDirectory() { if (!App.online) return []; if (!directory) { try { directory = await App.api('GET', 'api/users/directory'); } catch (e) { directory = []; } } return directory; }

  App.pages.trips = () => {
    const s = S(), today = E.iso(new Date());
    const card = (d) => {
      const t = d.trip, live = d.bookings.filter((b) => E.LIVE_STATES.includes(b.status));
      const beds = d.beds.filter((b) => d.rooms.some((r) => r.id === b.roomId && r.city === 'MAK' && (r.gender || r.privateBookingId)));
      const occ = beds.filter((b) => b.paxId).length;
      const rev = live.filter((b) => ['DEPOSIT', 'CONFIRMED'].includes(b.status)).reduce((x, b) => x + (b.net || 0), 0);
      const active = d.id === s.activeTripId;
      return `<div class="card" style="${active ? 'border-color:var(--gold)' : ''}">
        <div class="row"><b>${esc(t.name)}</b><span class="spacer"></span><span class="chip gold">${esc(t.code)}</span>${t.status === 'CLOSED' ? '<span class="chip">مغلقة</span>' : t.departDate < today ? '<span class="chip hold">مسافرة/منتهية</span>' : '<span class="chip ok">مفتوحة للبيع</span>'}</div>
        <div class="small muted">✈️ ${t.departDate} ← ${t.returnDate} · مكة ${t.stays.MAK.nights} + المدينة ${t.stays.MAD.nights} · ${esc(h.branch(t.branchId).name)} · ${esc(t.costCenter)}</div>
        <div class="grid g3" style="margin-top:8px"><div><span class="muted small">الحجوزات</span><div><b>${live.length}</b></div></div><div><span class="muted small">إشغال مكة</span><div><b class="num">${occ}/${beds.length}</b></div></div><div><span class="muted small">الإيراد</span><div><b>${h.egp(rev)}</b></div></div></div>
        <div class="small" style="margin-top:6px">🧑‍✈️ المشرف: ${esc((t.supervisor && t.supervisor.name) || '—')} · 🛏️ مندوب التسكين: ${esc(t.housingName || '—')} · 📁 ملفات ${d.docs.length}</div>
        <div class="row" style="margin-top:10px">${active ? '<span class="chip ok">✓ الرحلة الحالية</span>' : `<button class="btn sm primary" data-act="tripOpen" data-id="${d.id}">فتح</button>`}
          <button class="btn sm" data-act="tripRooms" data-id="${d.id}">🛏️ الغرف</button><button class="btn sm" data-act="tripSettings" data-id="${d.id}">⚙️ الإعدادات والتكليف</button>
          <button class="btn sm ghost" data-act="go" data-page="tripfiles" data-trip="${d.id}">📁 الملفات</button></div></div>`;
    };
    return `<div class="page-head"><div><h2>✈️ الرحلات</h2><p>كل رحلة مركز تكلفة مستقل CC-TRIP · غرف مسحوبة من مخصصات الفنادق · مشرف ومندوب تسكين لكل رحلة</p></div>
      ${App.can('OWNER', 'MANAGER') ? '<button class="btn primary" data-act="tripNew">+ رحلة جديدة</button>' : ''}</div>
      ${s.trips.length ? `<div class="grid g2">${s.trips.slice().reverse().map(card).join('')}</div>` : `<div class="card empty-state"><h3>لا توجد رحلات بعد</h3><p class="muted">ابدأ بإضافة الموردين ← الفنادق والمخصصات ← ثم أنشئ رحلة.</p>${App.can('OWNER', 'MANAGER') ? '<button class="btn primary" data-act="tripNew">+ رحلة جديدة</button>' : ''}</div>`}`;
  };
  App.actions.tripOpen = (d) => { App.switchTrip(d.id); App.actions.go({ page: 'builder' }); };

  App.actions.tripNew = () => {
    const s = S();
    const mak = s.allotments.filter((a) => a.city === 'MAK'), mad = s.allotments.filter((a) => a.city === 'MAD');
    if (!mak.length || !mad.length) return App.toast('أضف مخصص فندق في مكة وآخر في المدينة أولاً (الفنادق والمخصصات)', 'err');
    App.modal(`<h3>+ رحلة جديدة</h3><div class="grid g3">
      <div class="field"><label>اسم الرحلة</label><input class="input" id="tn-name" placeholder="عمرة شهر ... – 10 أيام"></div>
      <div class="field"><label>تاريخ السفر</label><input class="input" id="tn-dep" type="date" value="${E.iso(E.addDays(new Date(), 30))}"></div>
      <div class="field"><label>خط الطيران</label><input class="input" id="tn-flight" placeholder="CAI ✈ JED | MED ✈ CAI"></div>
      <div class="field"><label>ليالي مكة</label><input class="input" id="tn-mn" type="number" value="5"></div>
      <div class="field"><label>مخصص مكة</label><select class="input" id="tn-mak">${mak.map((a) => opt(a.id, '', `${a.code} · ${a.hotel}`)).join('')}</select></div>
      <div class="field"><label>ليالي المدينة</label><input class="input" id="tn-dn" type="number" value="4"></div>
      <div class="field"><label>مخصص المدينة</label><select class="input" id="tn-mad">${mad.map((a) => opt(a.id, '', `${a.code} · ${a.hotel}`)).join('')}</select></div>
      <div class="field"><label>سعر تسعير الرحلة (يبدأ بالتنفيذي)</label><input class="input" id="tn-fx" type="number" step="0.01" value="${s.fx.current}"></div>
      <div class="field"><label>هامش الربح %</label><input class="input" id="tn-margin" type="number" value="12"></div>
      <div class="field"><label>الطاقة المخططة</label><input class="input" id="tn-pax" type="number" value="44"></div>
      <div class="field"><label>الفرع</label><select class="input" id="tn-br">${s.branches.map((b) => opt(b.id, '', b.name)).join('')}</select></div>
      <div class="field"><label>نسخ بنود التكلفة من</label><select class="input" id="tn-copy"><option value="">قالب افتراضي</option>${s.trips.map((d) => opt(d.id, s.activeTripId, d.trip.code)).join('')}</select></div></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="tripCreate">إنشاء الرحلة</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
  };
  App.actions.tripCreate = () => {
    const s = S(), name = String(App.val('tn-name')).trim(), dep = App.val('tn-dep');
    if (name.length < 3 || !dep) return App.toast('اكتب اسم الرحلة وتاريخ السفر', 'err');
    const doc = Model.newTrip(s, { name, departDate: dep, flight: App.val('tn-flight'), makNights: App.val('tn-mn'), madNights: App.val('tn-dn'), makAllotmentId: App.val('tn-mak'), madAllotmentId: App.val('tn-mad'),
      fxRef: App.val('tn-fx'), marginPct: App.val('tn-margin'), plannedPax: App.val('tn-pax'), branchId: App.val('tn-br') });
    const from = App.val('tn-copy') && Model.tripDocOf(s, App.val('tn-copy'));
    const sup = (cat) => (s.suppliers.find((x) => x.category === cat) || {}).id || null;
    doc.trip.costItems = from ? from.trip.costItems.map((c) => ({ ...c, id: 'C' + Math.random().toString(36).slice(2, 8) })) : [
      { id: 'C1', cat: 'AIR', name: 'تذكرة طيران ذهاب وعودة', supplierId: sup('AIR'), currency: 'EGP', unitPrice: 16500, behavior: 'VAR', childFactor: 0.75, infantFactor: 0.1 },
      { id: 'C2', cat: 'VISA', name: 'تأشيرة عمرة + باركود', supplierId: sup('VISA'), currency: 'SAR', unitPrice: 450, behavior: 'VAR', childFactor: 1, infantFactor: 1 },
      { id: 'C3', cat: 'VISA', name: 'تأمين طبي', supplierId: sup('VISA'), currency: 'SAR', unitPrice: 100, behavior: 'VAR', childFactor: 1, infantFactor: 1 },
      { id: 'C4', cat: 'TRANSPORT', name: 'النقل البري', supplierId: sup('TRANSPORT'), currency: 'SAR', unitPrice: 180, behavior: 'VAR', childFactor: 1, infantFactor: 0 },
      { id: 'C5', cat: 'OPEX', name: 'بدل المشرف', supplierId: null, currency: 'EGP', unitPrice: 30000, qty: 1, behavior: 'FIXED' },
    ];
    doc.trip.boardingPoints = from ? [...from.trip.boardingPoints] : ['مقر الشركة'];
    doc.trip.bank = from ? from.trip.bank : '';
    App.audit(`إنشاء رحلة ${doc.trip.code}`); App.closeModal(); App.save();
    App.switchTrip(doc.id); App.actions.tripRooms({ id: doc.id });
    App.toast(`✅ ${doc.trip.code} — أضف غرف الرحلة من المخصص`);
  };

  App.actions.tripRooms = (d) => {
    const s = S(), doc = Model.tripDocOf(s, d.id), t = doc.trip;
    const row = (city) => {
      const al = s.allotments.find((a) => a.id === t.stays[city].allotmentId);
      return `<h4>${city === 'MAK' ? '🕋 مكة' : '🕌 المدينة'} — ${esc(al ? al.hotel : '—')}</h4><table class="t"><tr><th>الفئة</th><th>بالرحلة</th><th>مستخدمة</th><th>متاحة بالعقد</th><th>إضافة غرف</th></tr>
        ${TYPES.map((ty) => { const rs = doc.rooms.filter((r) => r.city === city && r.type === ty); const used = rs.filter((r) => r.gender || r.privateBookingId || doc.beds.some((b) => b.roomId === r.id && b.paxId)).length;
          return `<tr><td>${E.ROOM_TYPES[ty].ar}</td><td>${rs.length}</td><td>${used}</td><td>${al ? al.rooms[ty] || 0 : 0}</td><td><div class="row" style="gap:4px"><input class="input" style="width:70px" type="number" min="0" id="tr-${city}-${ty}" value="0">
          ${rs.length > used ? `<button class="btn sm ghost" data-act="tripRoomDel" data-id="${d.id}" data-city="${city}" data-ty="${ty}" title="إرجاع غرفة غير مستخدمة للمخصص">−1</button>` : ''}</div></td></tr>`; }).join('')}</table>`;
    };
    App.modal(`<h3>🛏️ غرف الرحلة ${esc(t.code)}</h3><p class="muted small">تُسحب الغرف من مخصص الفندق كغرف افتراضية (أكواد) وتتحول لأرقام فعلية لاحقاً من شاشة التسكين.</p>${row('MAK')}${row('MAD')}
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="tripRoomsSave" data-id="${d.id}">إضافة الغرف</button><button class="btn" data-act="closeModal">إغلاق</button></div>`, true);
  };
  App.actions.tripRoomsSave = (d) => {
    const doc = Model.tripDocOf(S(), d.id); let n = 0;
    for (const city of ['MAK', 'MAD']) for (const ty of TYPES) { const k = Math.max(0, Math.floor(Number(App.val(`tr-${city}-${ty}`)) || 0)); if (k) { Model.addTripRooms(doc, city, ty, k); n += k; } }
    App.audit(`إضافة ${n} غرفة للرحلة ${doc.trip.code}`); App.save(); App.actions.tripRooms(d); App.render(); App.toast(`✅ أضيفت ${n} غرفة`);
  };
  App.actions.tripRoomDel = (d) => {
    const doc = Model.tripDocOf(S(), d.id);
    const r = doc.rooms.slice().reverse().find((x) => x.city === d.city && x.type === d.ty && !x.gender && !x.privateBookingId && !doc.beds.some((b) => b.roomId === x.id && b.paxId));
    if (!r) return;
    doc.rooms = doc.rooms.filter((x) => x.id !== r.id); doc.beds = doc.beds.filter((b) => b.roomId !== r.id);
    if (d.id === S().activeTripId) Model.mountTrip(S(), d.id);
    App.save(); App.actions.tripRooms(d); App.render();
  };

  App.actions.tripSettings = async (d) => {
    const s = S(), doc = Model.tripDocOf(s, d.id), t = doc.trip;
    const users = await loadDirectory();
    const sel = (id, cur, role) => `<select class="input" id="${id}"><option value="">— بدون حساب —</option>${users.filter((u) => u.role === role).map((u) => opt(u.id, cur, u.display_name)).join('')}</select>`;
    App.modal(`<h3>⚙️ إعدادات ${esc(t.code)}</h3><div class="grid g2">
      <div class="field"><label>اسم الرحلة</label><input class="input" id="ts-name" value="${esc(t.name)}"></div>
      <div class="field"><label>خط الطيران</label><input class="input" id="ts-flight" value="${esc(t.flight)}"></div>
      <div class="field"><label>الحالة</label><select class="input" id="ts-status">${opt('OPEN', t.status, 'مفتوحة للبيع')}${opt('CLOSED', t.status, 'مغلقة (لا بيع — تبقى للتقارير)')}</select></div>
      <div class="field"><label>نقاط التجمع (مفصولة بفاصلة)</label><input class="input" id="ts-bp" value="${esc(t.boardingPoints.join('، '))}"></div>
      <div class="field"><label>اسم المشرف</label><input class="input" id="ts-sup" value="${esc(t.supervisor.name || '')}"></div>
      <div class="field"><label>حساب المشرف (لرؤية كشفه)</label>${App.online ? sel('ts-supu', t.supervisor.userId, 'SUPERVISOR') : '<input class="input" readonly value="متاح أونلاين">'}</div>
      <div class="field"><label>هاتف المشرف مصر</label><input class="input" id="ts-eg" value="${esc(t.supervisor.phoneEG || '')}" style="direction:ltr"></div>
      <div class="field"><label>هاتف المشرف السعودية</label><input class="input" id="ts-sa" value="${esc(t.supervisor.phoneSA || '')}" style="direction:ltr"></div>
      <div class="field"><label>حساب مندوب التسكين</label>${App.online ? sel('ts-hou', t.housingUserId, 'HOUSING') : '<input class="input" readonly value="متاح أونلاين">'}</div>
      <div class="field"><label>الحساب البنكي في رسائل السداد</label><input class="input" id="ts-bank" value="${esc(t.bank || '')}"></div></div>
      <div class="small muted" style="margin-top:6px">لإنشاء حسابات المشرف/مندوب التسكين: الإدارة ← المستخدمون والصلاحيات.</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="tripSettingsSave" data-id="${d.id}">حفظ</button><button class="btn" data-act="closeModal">إلغاء</button></div>`, true);
  };
  App.actions.tripSettingsSave = (d) => {
    const doc = Model.tripDocOf(S(), d.id), t = doc.trip;
    t.name = App.val('ts-name') || t.name; t.flight = App.val('ts-flight'); t.status = App.val('ts-status'); t.bank = App.val('ts-bank');
    t.boardingPoints = String(App.val('ts-bp') || '').split(/[،,]/).map((x) => x.trim()).filter(Boolean);
    if (!t.boardingPoints.length) t.boardingPoints = ['مقر الشركة'];
    t.supervisor = { ...t.supervisor, name: App.val('ts-sup'), phoneEG: App.val('ts-eg'), phoneSA: App.val('ts-sa') };
    if (App.online) {
      const su = Number(App.val('ts-supu')) || null, hu = Number(App.val('ts-hou')) || null;
      t.supervisor.userId = su; t.housingUserId = hu;
      t.housingName = hu ? ((directory || []).find((u) => u.id === hu) || {}).display_name : '';
    }
    App.audit(`تعديل إعدادات ${t.code}`); App.closeModal(); App.save(); App.render();
  };

  // ============================================================ trip files
  App.pages.tripfiles = () => {
    const s = S(), doc = Model.tripDocOf(s, s.activeTripId), t = s.trip;
    return `<div class="page-head"><div><h2>📁 ملفات الرحلة — ${esc(t.code)}</h2><p>مكان واحد لملفات التذاكر والتأشيرات والباركود وكشوف الفنادق — يظهر تنبيه إذا اقترب السفر ولم تُرفع</p></div></div>
      <div class="grid g2">${Object.entries(Model.TRIP_DOC_KINDS).map(([k, label]) => { const files = doc.docs.filter((x) => x.kind === k); return `<div class="card">
        <div class="row"><h3 style="margin:0">${label}</h3><span class="chip ${files.length ? 'ok' : k === 'OTHER' || k === 'ROOMING' ? '' : 'danger'}">${files.length}</span><span class="spacer"></span>
          <button class="btn sm primary" data-act="tripDocUp" data-k="${k}">📤 رفع</button></div>
        <div class="stack" style="margin-top:8px">${files.map((f) => `<div class="row">${/image/.test(f.mime || '') ? h.thumb(f.fileId, f.name) : '📄'} <a href="${App.fileUrl(f.fileId)}" target="_blank" rel="noopener">${esc(f.name)}</a>
          <span class="faint small">${esc(f.by)} · ${h.dt(f.at)}</span><span class="spacer"></span>${App.can('OWNER', 'MANAGER') ? `<button class="btn sm ghost" data-act="tripDocDel" data-id="${f.fileId}">✕</button>` : ''}</div>`).join('') || '<span class="muted small">لا ملفات.</span>'}</div></div>`; }).join('')}</div>`;
  };
  App.actions.tripDocUp = async (d) => {
    const files = await App.uploadPicked({ accept: 'image/*,application/pdf,.xlsx,.xls,.docx,.doc,.zip,.csv', multiple: true });
    const doc = Model.tripDocOf(S(), S().activeTripId);
    for (const f of files) doc.docs.push({ kind: d.k, fileId: f.id, name: f.name, mime: f.mime, at: Date.now(), by: App.actor().name });
    if (files.length) { App.audit(`رفع ${files.length} ملف (${Model.TRIP_DOC_KINDS[d.k]}) للرحلة ${S().trip.code}`); App.save(); App.render(); }
  };
  App.actions.tripDocDel = (d) => {
    if (!confirm('حذف الملف من قائمة ملفات الرحلة؟')) return;
    const doc = Model.tripDocOf(S(), S().activeTripId);
    doc.docs = doc.docs.filter((x) => x.fileId !== d.id); Model.mountTrip(S(), doc.id);
    App.save(); App.render();
  };
})();
