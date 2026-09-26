/* Umrah ERP — Operations pages: Dual Bed Maps, 49-seat Bus, Ops Center (vault/itinerary/WhatsApp/reports), Trip P&L */
(function () {
  'use strict';
  const App = window.App, E = App.E, Acc = App.Acc, Model = App.Model, h = App.h, esc = h.esc;
  const S = () => App.S;
  const isManager = () => h.user().role === 'MANAGER';
  const opt = (v, cur, label) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(label ?? v)}</option>`;
  const short = (name) => String(name || '').split(' ').slice(0, 2).join(' ');
  const allotOf = (city) => S().allotments.find((a) => a.id === S().trip.stays[city].allotmentId);
  const roomLabel = (r) => r.physicalNo || r.vcode;
  const livePax = () => S().pax.filter((p) => E.LIVE_STATES.includes(h.booking(p.bookingId).status));

  // ================================================================ 5) DUAL BED MAPS
  function bedHtml(s, r, bed, sel) {
    const ui = App.ui, picked = ui.pickedBed === bed.id ? 'picked' : '';
    if (bed.paxId) {
      const p = h.pax(bed.paxId), b = h.booking(p.bookingId), cls = E.BOOKING_STATUS[b.status].bed;
      return `<div class="bed ${cls} ${picked}" data-act="bedClick" data-id="${bed.id}" title="${esc(p.nameAr)} · ${esc(b.code)} · ${esc(E.BOOKING_STATUS[b.status].ar)}">
        <span class="gdot ${p.gender}">${p.gender === 'M' ? '♂' : '♀'}</span><span class="bno num">${bed.no}</span>
        <span class="nm">${esc(short(p.nameAr))}</span><span class="ph num">${esc(p.phone)}</span><span class="ph num" style="opacity:.75">${esc(b.code)}</span></div>`;
    }
    if (r.privateBookingId) return `<div class="bed blocked" title="سرير ضمن غرفة مغلقة"><span class="bno num">${bed.no}</span><span class="nm">🔒 ضمن الغرفة المغلقة</span><span class="ph">مباع للحجز</span></div>`;
    const target = sel && E.canPlace(s, r, sel).ok ? 'target' : '';
    return `<div class="bed avail ${target} ${picked}" data-act="bedClick" data-id="${bed.id}"><span class="bno num">${bed.no}</span><span class="nm">شاغر</span><span class="ph">${target ? 'اضغط للتسكين' : 'Available'}</span></div>`;
  }
  function roomCard(s, r, sel) {
    const beds = E.bedsOfRoom(s, r.id), cap = E.ROOM_TYPES[r.type].cap, occ = E.roomOccupancy(s, r.id);
    const kids = E.attachedNoBedPax(s, r.id);
    const pb = r.privateBookingId && h.booking(r.privateBookingId);
    return `<div class="room g-${r.gender || 'N'}">
      <div class="room-head"><div class="room-no num">${r.physicalNo ? `🚪 ${esc(r.physicalNo)}<span class="v">${esc(r.vcode)}</span>` : `${esc(r.vcode)}<span class="v">كود افتراضي — بانتظار رقم الفندق</span>`}</div>
        <div style="text-align:left">${h.genderChip(r.gender)}<div class="small muted">${E.ROOM_TYPES[r.type].ar} · <span class="num">${occ}/${cap}</span></div></div></div>
      ${pb ? `<div class="small gold" style="margin:-4px 0 8px">عائلة/مجموعة ${esc(pb.code)}</div>` : ''}
      <div class="beds ${cap === 2 || cap === 4 ? '' : 'c3'}">${beds.map((b) => bedHtml(s, r, b, sel)).join('')}</div>
      ${kids.length ? `<div class="nobed">${kids.map((k) => `<span class="chip ${k.type === 'INF' ? 'female' : 'gold'}" title="${esc(k.nameEn)}">${k.type === 'INF' ? '🍼 رضيع' : '🧒 طفل'}: ${esc(short(k.nameAr))}</span>`).join('')}</div>` : ''}
    </div>`;
  }

  App.pages.rooms = () => {
    const s = S(), ui = App.ui, city = ui.city, stay = s.trip.stays[city], al = allotOf(city);
    const locked = s.roomingLocked[city];
    let sel = ui.selPax && h.pax(ui.selPax);
    if (sel && (sel.type !== 'ADULT' || !E.LIVE_STATES.includes(h.booking(sel.bookingId).status))) { sel = null; ui.selPax = null; }
    const selBk = sel && h.booking(sel.bookingId);
    const q = (ui.paxSearch || '').trim();
    const unassigned = E.unassignedPax(s, city).filter((p) => !q || p.nameAr.includes(q) || p.nameEn.toLowerCase().includes(q.toLowerCase()) || h.booking(p.bookingId).code.includes(q));
    const cityRooms = s.rooms.filter((r) => r.city === city);
    const pool = cityRooms.filter((r) => !r.gender && !r.privateBookingId && E.roomOccupancy(s, r.id) === 0);
    const rooms = sel ? E.visibleRoomsFor(s, city, sel, { strictType: ui.roomMode === 'sales' && !ui.showAllTypes })
      : cityRooms.filter((r) => r.gender || E.roomOccupancy(s, r.id) > 0);
    const beds = s.beds.filter((b) => cityRooms.some((r) => r.id === b.roomId && (r.gender || r.privateBookingId)));
    const occ = beds.filter((b) => b.paxId).length;
    const brk = E.breakage(s, city).reduce((a, x) => a + x.free, 0);
    const hiddenOther = sel && !selBk.mode.includes('PRIVATE') ? cityRooms.filter((r) => r.gender && r.gender !== 'P' && r.gender !== sel.gender).length : 0;
    const needPrivate = sel && selBk.mode === 'PRIVATE_ROOM' && !cityRooms.some((r) => r.privateBookingId === selBk.id);
    return `
    <div class="page-head"><div><h2>🛏️ المسرح البصري للتسكين المزدوج</h2><p>كل غرفة = صف مقاعد، كل سرير = مقعد قابل للنقر · فرز صارم للجنسين · غرف مغلقة للعائلات · تبديل Swap قبل القفل النهائي</p></div>
      <div class="tabs">${['MAK', 'MAD'].map((c) => `<button class="${city === c ? 'active' : ''}" data-act="roomCity" data-c="${c}">${c === 'MAK' ? '🕋 تسكين فندق مكة' : '🕌 تسكين فندق المدينة'} ${s.roomingLocked[c] ? '🔒' : ''}</button>`).join('')}</div></div>

    <div class="card" style="margin-bottom:14px"><div class="row">
      <div><b>${esc(al.hotel)}</b><div class="small muted">دخول <span class="num">${stay.checkIn}</span> · ${stay.nights} ليالٍ · مخصص ${esc(al.code)}</div></div><span class="spacer"></span>
      <div class="tabs" style="margin:0"><button class="${ui.roomMode === 'sales' ? 'active' : ''}" data-act="roomMode" data-m="sales">🧑‍💼 وضع المبيعات (تسكين مبدئي)</button><button class="${ui.roomMode === 'swap' ? 'active' : ''}" data-act="roomMode" data-m="swap">🔁 وضع العمليات (Swap)</button></div>
    </div>
    <div class="row" style="margin-top:10px">
      <span class="chip">غرف مفتوحة <b class="num">${cityRooms.length - pool.length}</b></span><span class="chip">بالمخصص غير مفتوحة <b class="num">${pool.length}</b></span>
      <span class="chip">أسرّة مشغولة <b class="num">${occ}/${beds.length}</b></span><span class="chip ${brk ? 'hold' : 'ok'}">أسرّة شاغرة (Breakage) <b class="num">${brk}</b></span>
      <span class="spacer"></span>
      <button class="btn" data-act="openRoomModal" ${locked ? 'disabled' : ''}>+ فتح غرفة تفريد جديدة وتحديد جنسها</button>
      <button class="btn" data-act="physModal">🔢 تحويل الأكواد لأرقام فعلية</button>
      ${locked ? `<button class="btn danger" data-act="unlockRooming">🔓 فك القفل</button><button class="btn gold" data-act="goRooming">📄 كشف Rooming List</button>`
        : `<button class="btn gold" data-act="lockRooming">🔒 قفل التسكين النهائي واستخراج Rooming List</button>`}
    </div>
    <div class="legend" style="margin-top:10px"><span><i style="background:var(--avail)"></i>شاغر</span><span><i style="background:var(--hold);outline:1px dashed #fff"></i>تسكين مبدئي/معلق</span><span><i style="background:var(--deposit)"></i>عربون</span><span><i style="background:var(--confirmed)"></i>مسكّن ومؤكد</span><span><i style="background:var(--male)"></i>ذكر</span><span><i style="background:var(--female)"></i>أنثى</span><span><i style="background:var(--private)"></i>غرفة مغلقة</span></div>
    </div>

    ${locked ? '<div class="alert info" style="margin-bottom:14px">🔒 كشف التسكين مقفل نهائياً لهذه المدينة — التعديل يتطلب فك القفل من مدير.</div>' : ''}
    ${ui.roomMode === 'swap' ? `<div class="alert warn" style="margin-bottom:14px">🔁 وضع التبديل: اضغط السرير (أ) ثم السرير (ب) لتبديل النزيلين أو النقل لسرير شاغر — يُعاد فحص قفل الجنس للطرفين تلقائياً. ${ui.pickedBed ? '<b>السرير (أ) محدد — اختر (ب).</b>' : ''}</div>` : ''}

    <div class="grid g-rooms">
      <div class="card"><h3>👥 بانتظار التسكين <span class="chip num">${E.unassignedPax(s, city).length}</span></h3>
        <input class="input" placeholder="بحث بالاسم أو رقم الحجز" data-ui="paxSearch" value="${esc(ui.paxSearch)}" style="margin-bottom:8px">
        <div class="pax-list">${unassigned.map((p) => { const b = h.booking(p.bookingId); return `<div class="pax-item ${ui.selPax === p.id ? 'sel' : ''}" data-act="selPax" data-id="${p.id}">
          <span class="gdot ${p.gender}" style="position:static;width:22px;height:22px;border-radius:50%;display:grid;place-items:center">${p.gender === 'M' ? '♂' : '♀'}</span>
          <div class="who"><b>${esc(p.nameAr)}</b><span class="small muted num">${b.code} · ${b.mode === 'PRIVATE_ROOM' ? '🔒 مغلقة' : 'تفريد'} ${E.ROOM_TYPES[b.roomType].ar}</span></div>${h.statusChip(b.status)}</div>`; }).join('') || '<div class="muted small">✅ جميع البالغين مسكّنون في هذه المدينة.</div>'}</div>
      </div>
      <div>
        ${sel ? `<div class="alert ${sel.gender === 'M' ? 'info' : 'warn'}" style="margin-bottom:12px"><div class="row">
          <div>🎯 تسكين: <b>${esc(sel.nameAr)}</b> ${h.paxGender(sel.gender)} · ${esc(selBk.code)} · ${esc(E.SALE_MODES[selBk.mode])}<div class="small">
          ${selBk.mode === 'PRIVATE_ROOM' ? 'غرفة مغلقة: تظهر غرفة العائلة فقط ويتخطى فحص الجنس.' : `تظهر حصرياً غرف ${sel.gender === 'M' ? 'الرجال' : 'السيدات'} ذات الأسرّة الشاغرة — تم حجب ${hiddenOther} غرفة للجنس الآخر.`}</div></div>
          <span class="spacer"></span>${city === 'MAK' && ui.roomMode === 'sales' && selBk.mode !== 'PRIVATE_ROOM' ? `<label class="small"><input type="checkbox" data-ui="showAllTypes" ${ui.showAllTypes ? 'checked' : ''}> كل الفئات</label>` : ''}
          <button class="btn sm" data-act="selPax" data-id="">إلغاء التحديد</button></div></div>` : ''}
        ${needPrivate ? `<div class="card" style="text-align:center;margin-bottom:12px"><div class="muted">لا توجد غرفة مغلقة للحجز ${esc(selBk.code)} في ${E.CITIES[city].ar}.</div><button class="btn gold" style="margin-top:8px" data-act="closePrivate" data-b="${selBk.id}">🔒 إغلاق غرفة كاملة للعائلة من المخصص</button></div>` : ''}
        ${sel && !rooms.length && !needPrivate ? `<div class="card" style="text-align:center"><div class="muted">لا توجد أسرّة شاغرة لنفس الجنس${ui.roomMode === 'sales' && city === 'MAK' && !ui.showAllTypes ? ' ونفس الفئة' : ''}.</div>
          <button class="btn primary" style="margin-top:8px" data-act="openRoomModal">+ فتح غرفة تفريد جديدة (${sel.gender === 'M' ? 'رجال' : 'سيدات'}) من المخصص</button></div>` : ''}
        <div class="rooms">${rooms.map((r) => roomCard(s, r, sel)).join('')}</div>
        ${!sel && pool.length ? `<div class="card" style="margin-top:14px"><div class="row"><b>🏷️ غرف بالمخصص غير مفتوحة (${pool.length})</b><span class="small muted">— مخفية حتى يتم فتحها وتحديد جنسها أو إغلاقها لعائلة</span><span class="spacer"></span>
          ${pool.map((r) => `<span class="chip">${esc(r.vcode)} · ${E.ROOM_TYPES[r.type].ar}</span>`).join('')}</div></div>` : ''}
      </div>
    </div>`;
  };
  App.actions.roomCity = (d) => { App.ui.city = d.c; App.ui.pickedBed = null; App.render(); };
  App.actions.roomMode = (d) => { App.ui.roomMode = d.m; App.ui.pickedBed = null; App.render(); };
  App.actions.selPax = (d) => { App.ui.selPax = d.id || null; App.ui.pickedBed = null; App.render(); };
  App.actions.goRooming = () => { App.ui.page = 'ops'; App.ui.opsTab = 'rooming'; App.ui.reportCity = App.ui.city; App.render(); };

  App.actions.bedClick = (d) => {
    const s = S(), ui = App.ui, bed = s.beds.find((b) => b.id === d.id), room = h.room(bed.roomId);
    if (ui.roomMode === 'swap') {
      if (!ui.pickedBed) { if (!bed.paxId) return App.toast('اختر سريراً مشغولاً أولاً (السرير أ)', 'warn'); ui.pickedBed = bed.id; return App.render(); }
      if (ui.pickedBed === bed.id) { ui.pickedBed = null; return App.render(); }
      const r = E.swapBeds(s, ui.pickedBed, bed.id);
      ui.pickedBed = null;
      if (!r.ok) { App.toast('⛔ ' + r.reason, 'err'); return App.render(); }
      App.audit(`تبديل أسرّة في ${E.CITIES[room.city].ar}`); App.save(); App.toast('🔁 تم التبديل'); return App.render();
    }
    if (bed.paxId) return paxBedModal(bed);
    const sel = ui.selPax && h.pax(ui.selPax);
    if (!sel) return App.toast(room.privateBookingId ? 'سرير ضمن غرفة مغلقة' : 'اختر معتمراً من قائمة "بانتظار التسكين" أولاً', 'warn');
    const r = E.assignBed(s, bed.id, sel.id);
    if (!r.ok) return App.toast('⛔ ' + r.reason, 'err');
    App.audit(`تسكين مبدئي ${sel.nameAr} → ${roomLabel(room)}/${bed.no}`);
    const next = E.unassignedPax(s, room.city).find((p) => p.bookingId === sel.bookingId);
    ui.selPax = next ? next.id : null;
    App.save(); App.render();
    App.toast(`✅ ${sel.nameAr} على السرير ${bed.no} · ${roomLabel(room)}${next ? ` — التالي: ${next.nameAr}` : ''}`);
  };
  function paxBedModal(bed) {
    const s = S(), p = h.pax(bed.paxId), b = h.booking(p.bookingId), r = h.room(bed.roomId);
    App.modal(`<div class="row"><h3 style="margin:0">${esc(p.nameAr)}</h3>${h.paxGender(p.gender)}${h.statusChip(b.status)}<span class="spacer"></span><button class="btn sm" data-act="closeModal">✕</button></div>
      <div class="small muted num" style="margin:6px 0">${esc(p.nameEn)} · ${esc(p.passport)} · ${esc(p.phone)}</div>
      <div>الغرفة <b class="num">${esc(roomLabel(r))}</b> · السرير ${bed.no} · ${E.ROOM_TYPES[r.type].ar} · حجز ${esc(b.code)}</div>
      ${b.holdUntil && E.HOLD_STATES.includes(b.status) ? `<div class="alert warn" style="margin-top:8px">⏱️ يتحرر تلقائياً خلال ${h.countdown(b.holdUntil)}</div>` : ''}
      <div class="row" style="margin-top:12px"><a class="btn" target="_blank" rel="noopener" href="${esc(E.waLink(p.phone, `السلام عليكم ${p.nameAr}، تم تسكينكم في ${E.CITIES[r.city].ar} غرفة ${roomLabel(r)}.`))}">🟢 واتساب</a>
      <button class="btn" data-act="bookingDetail" data-id="${b.id}">تفاصيل الحجز</button>
      <button class="btn danger" data-act="unassign" data-id="${bed.id}" ${s.roomingLocked[r.city] ? 'disabled' : ''}>إلغاء التسكين</button></div>`);
  }
  App.actions.unassign = (d) => { const r = E.unassignBed(S(), d.id); if (!r.ok) return App.toast(r.reason, 'err'); App.closeModal(); App.save(); App.render(); };
  App.actions.openRoomModal = () => {
    const s = S(), city = App.ui.city, sel = App.ui.selPax && h.pax(App.ui.selPax);
    const pool = s.rooms.filter((r) => r.city === city && !r.gender && !r.privateBookingId && E.roomOccupancy(s, r.id) === 0);
    const counts = Object.keys(E.ROOM_TYPES).map((t) => [t, pool.filter((r) => r.type === t).length]);
    const defType = sel ? h.booking(sel.bookingId).roomType : 'QUAD';
    App.modal(`<h3>+ فتح غرفة تفريد جديدة – ${E.CITIES[city].ar}</h3><p class="muted small">تُسحب الغرفة من مخصص الفندق المحمّل في تبويب التكوين ويُقفل جنسها فلا تقبل إلا نفس الجنس.</p>
      <div class="grid g2"><div class="field"><label>الفئة (المتبقي بالمخصص)</label><select class="input" id="or-type">${counts.map(([t, n]) => `<option value="${t}" ${t === defType ? 'selected' : ''} ${n ? '' : 'disabled'}>${E.ROOM_TYPES[t].ar} (${n})</option>`).join('')}</select></div>
      <div class="field"><label>قفل الجنس</label><select class="input" id="or-g"><option value="M" ${sel && sel.gender === 'M' ? 'selected' : ''}>♂ رجال فقط</option><option value="F" ${sel && sel.gender === 'F' ? 'selected' : ''}>♀ سيدات فقط</option></select></div></div>
      ${sel ? `<div class="alert info" style="margin-top:8px">سيتم تسكين <b>${esc(sel.nameAr)}</b> على السرير الأول مباشرة.</div>` : ''}
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="openRoom">فتح الغرفة</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.openRoom = () => {
    const s = S(), city = App.ui.city, g = App.val('or-g'), sel = App.ui.selPax && h.pax(App.ui.selPax);
    if (sel && sel.gender !== g) return App.toast('⛔ لا يمكن فتح غرفة بجنس مخالف للمعتمر المحدد', 'err');
    const r = E.openSharedRoom(s, city, App.val('or-type'), g);
    if (!r.ok) return App.toast(r.reason, 'err');
    App.audit(`فتح غرفة تفريد ${r.room.vcode} (${g === 'M' ? 'رجال' : 'سيدات'})`);
    if (sel) { const bed = E.bedsOfRoom(s, r.room.id)[0]; const a = E.assignBed(s, bed.id, sel.id); if (a.ok) { const next = E.unassignedPax(s, city).find((p) => p.bookingId === sel.bookingId); App.ui.selPax = next ? next.id : null; } }
    App.closeModal(); App.save(); App.render(); App.toast(`✅ تم فتح ${r.room.vcode}`);
  };
  App.actions.closePrivate = (d) => {
    const r = E.assignPrivateRoom(S(), App.ui.city, d.b);
    if (!r.ok) return App.toast(r.reason, 'err');
    App.ui.selPax = null; App.audit(`إغلاق غرفة ${r.room.vcode} للحجز ${h.booking(d.b).code}`); App.save(); App.render(); App.toast('🔒 تم إغلاق الغرفة وتسكين العائلة');
  };
  App.actions.physModal = () => {
    const s = S(), city = App.ui.city, rooms = s.rooms.filter((r) => r.city === city && (r.gender || E.roomOccupancy(s, r.id) > 0));
    App.modal(`<h3>🔢 التحويل الفعلي للغرف – ${E.CITIES[city].ar}</h3><p class="muted small">عند استلام الكروت من رسبشن الفندق: أدخل الرقم الحقيقي مقابل كل كود افتراضي — ينعكس فوراً في كل الكشوفات والفوتشرات والواتساب.</p>
      <div class="row"><input class="input" id="ph-start" type="number" placeholder="ترقيم تلقائي يبدأ من (مثال 501)" style="width:240px"><button class="btn sm" data-act="physAuto">ترقيم تسلسلي</button></div>
      <div class="tbl-wrap" style="margin-top:10px;max-height:50vh"><table class="t"><tr><th>الكود الافتراضي</th><th>الفئة</th><th>الجنس</th><th>رقم الغرفة الفعلي</th></tr>
      ${rooms.map((r) => `<tr><td class="num">${esc(r.vcode)}</td><td>${E.ROOM_TYPES[r.type].ar}</td><td>${h.genderChip(r.gender)}</td><td><input class="input phys-in" data-room="${r.id}" value="${esc(r.physicalNo || '')}" style="width:120px;direction:ltr"></td></tr>`).join('')}</table></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="physSave">حفظ وتطبيق على كل الكشوفات</button><button class="btn" data-act="closeModal">إلغاء</button></div>`);
  };
  App.actions.physAuto = () => {
    let n = Number(App.val('ph-start'));
    if (!n) return App.toast('أدخل رقم البداية', 'err');
    document.querySelectorAll('.phys-in').forEach((el) => { if (!el.value) el.value = String(n++); });
  };
  App.actions.physSave = () => {
    const s = S(), city = App.ui.city, vals = [...document.querySelectorAll('.phys-in')].map((el) => [el.dataset.room, el.value.trim()]);
    const others = s.rooms.filter((r) => r.city === city && !vals.some(([id]) => id === r.id) && r.physicalNo).map((r) => r.physicalNo);
    const all = vals.map(([, v]) => v).filter(Boolean).concat(others);
    const dup = all.find((v, i) => all.indexOf(v) !== i);
    if (dup) return App.toast(`⛔ رقم الغرفة ${dup} مكرر`, 'err');
    vals.forEach(([id, v]) => { h.room(id).physicalNo = v || null; });
    App.audit(`تحويل أرقام الغرف الفعلية – ${E.CITIES[city].ar}`); App.closeModal(); App.save(); App.render(); App.toast('✅ تم تحديث أرقام الغرف في كل الكشوفات');
  };
  App.actions.lockRooming = (d) => {
    const city = App.ui.city, issues = E.lockValidation(S(), city);
    if (issues.length && !d.force) {
      return App.modal(`<h3>⚠️ فحص ما قبل القفل – ${E.CITIES[city].ar}</h3>${issues.map((i) => `<div class="alert warn" style="margin-bottom:6px">${esc(i)}</div>`).join('')}
        <div class="row" style="margin-top:12px"><button class="btn gold" data-act="lockRooming" data-force="1">قفل رغم ذلك (مدير)</button><button class="btn" data-act="closeModal">رجوع للتسوية</button></div>`);
    }
    if (d.force && !isManager()) return App.toast('القفل مع وجود ملاحظات يتطلب مدير المبيعات', 'err');
    S().roomingLocked[city] = true; App.audit(`قفل التسكين النهائي – ${E.CITIES[city].ar}`);
    App.closeModal(); App.save(); App.actions.goRooming(); App.toast('🔒 تم القفل — كشف Rooming List الرسمي جاهز للتصدير');
  };
  App.actions.unlockRooming = () => {
    if (!isManager()) return App.toast('فك القفل من صلاحية المدير فقط', 'err');
    S().roomingLocked[App.ui.city] = false; App.audit(`فك قفل التسكين – ${E.CITIES[App.ui.city].ar}`); App.save(); App.render();
  };

  // ================================================================ 6) BUS 49 SEATS
  App.pages.bus = () => {
    const s = S(), ui = App.ui, seats = s.bus.seats, on = s.trip.departDate;
    const seated = new Set(Object.values(seats));
    const unseated = livePax().filter((p) => E.PAX_TYPES[p.type].takesSeat && !seated.has(p.id) && (h.booking(p.bookingId).mode !== 'UNBUNDLED' || (h.booking(p.bookingId).services || []).includes('BUS')));
    const infants = livePax().filter((p) => p.type === 'INF');
    const seatHtml = (n) => {
      const p = seats[n] && h.pax(seats[n]);
      if (!p) return `<div class="seat ${ui.pickedSeat == n ? 'picked' : ''}" data-act="seatClick" data-seat="${n}" data-drop-seat="${n}"><span class="sn num">${n}</span><span class="snm">شاغر</span></div>`;
      const elder = E.ageOn(p.dob, on) >= 60;
      return `<div class="seat taken ${p.gender} ${elder ? 'elder' : ''} ${ui.pickedSeat == n ? 'picked' : ''}" draggable="true" data-drag-pax="${p.id}" data-act="seatClick" data-seat="${n}" data-drop-seat="${n}" title="${esc(p.nameAr)} · ${esc(h.booking(p.bookingId).code)}${elder ? ' · كبار السن' : ''}">
        <span class="sn num">${n}</span><span class="snm">${esc(short(p.nameAr))}</span><span class="snm faint num" style="font-size:9px">${esc(h.booking(p.bookingId).code)}</span></div>`;
    };
    return `
    <div class="page-head"><div><h2>🚌 مخطط مقاعد باص النقل (49 راكباً)</h2><p>اسحب وأفلت أو اضغط للاختيار · التجميع التلقائي للعائلات · المقاعد الأمامية لكبار السن · لا تجاور بين غرباء من جنسين</p></div>
      <div class="row"><button class="btn gold" data-act="busAuto">✨ ترتيب تلقائي ذكي</button><button class="btn" data-act="busClear">تفريغ</button><button class="btn" data-act="printManifest">🖨️ مانيفست الركوب</button></div></div>
    <div class="bus-wrap">
      <div class="card"><div class="bus">
        <div class="bus-front"><div class="seat crew" style="width:70px"><span class="sn">🚍</span>السائق</div><div class="small muted" style="align-self:center">🚪 الباب · ${esc(s.bus.plate)}</div><div class="seat crew" style="width:70px"><span class="sn">🧑‍✈️</span>المشرف</div></div>
        ${E.BUS_LAYOUT.rows.map((row, i) => `<div class="bus-row">${row.map((n) => (n == null ? `<div class="aisle">${i + 1}</div>` : seatHtml(n))).join('')}</div>`).join('')}
        <div class="small muted" style="text-align:center;margin-top:6px">الكنبة الخلفية (5 مقاعد)</div>
      </div>
      <div class="legend" style="justify-content:center;margin-top:10px"><span><i style="background:var(--avail)"></i>شاغر</span><span><i style="background:#2b5f9c"></i>ذكر</span><span><i style="background:#a2477a"></i>أنثى</span><span><i style="border:2px solid var(--gold)"></i>كبار السن ≥ 60</span><span><i style="background:#3a3f47"></i>طاقم</span></div></div>
      <div class="card"><h3>🧍 بدون مقعد <span class="chip num">${unseated.length}</span><span class="spacer"></span><span class="chip num">${seated.size}/${E.BUS_LAYOUT.total}</span></h3>
        <div class="small muted" style="margin-bottom:8px">اسحب الاسم إلى مقعد، أو اضغطه ثم اضغط المقعد.</div>
        <div class="pax-list">${unseated.map((p) => `<div class="pax-item ${ui.pickedBusPax === p.id ? 'sel' : ''}" draggable="true" data-drag-pax="${p.id}" data-act="busPick" data-id="${p.id}">
          <span class="gdot ${p.gender}" style="position:static;width:22px;height:22px;border-radius:50%;display:grid;place-items:center">${p.gender === 'M' ? '♂' : '♀'}</span>
          <div class="who"><b>${esc(p.nameAr)}</b><span class="small muted num">${h.booking(p.bookingId).code} · ${E.ageOn(p.dob, on)} سنة</span></div></div>`).join('') || '<div class="muted small">✅ الجميع لهم مقاعد.</div>'}</div>
        ${infants.length ? `<div class="small muted" style="margin-top:10px">🍼 رضع على حجر ذويهم (بدون مقعد): ${infants.map((p) => esc(short(p.nameAr))).join('، ')}</div>` : ''}
      </div>
    </div>`;
  };
  const seatOfPax = (id) => Object.keys(S().bus.seats).find((k) => S().bus.seats[k] === id);
  function placeOnSeat(paxId, seat) {
    const seats = S().bus.seats, from = seatOfPax(paxId), occupant = seats[seat];
    if (from) delete seats[from];
    if (occupant && occupant !== paxId) { if (from) seats[from] = occupant; else delete seats[seat]; }
    seats[seat] = paxId;
  }
  App.actions.busDrop = (d) => { placeOnSeat(d.pax, d.seat); App.ui.pickedSeat = null; App.ui.pickedBusPax = null; App.save(); App.render(); };
  App.actions.busPick = (d) => { App.ui.pickedBusPax = App.ui.pickedBusPax === d.id ? null : d.id; App.ui.pickedSeat = null; App.render(); };
  App.actions.seatClick = (d) => {
    const ui = App.ui, seats = S().bus.seats;
    if (ui.pickedBusPax) { placeOnSeat(ui.pickedBusPax, d.seat); ui.pickedBusPax = null; App.save(); return App.render(); }
    if (!ui.pickedSeat) { if (!seats[d.seat]) return App.toast('اختر راكباً أو مقعداً مشغولاً أولاً', 'warn'); ui.pickedSeat = d.seat; return App.render(); }
    if (ui.pickedSeat === d.seat) { ui.pickedSeat = null; return App.render(); }
    placeOnSeat(seats[ui.pickedSeat], d.seat); ui.pickedSeat = null; App.save(); App.render();
  };
  App.actions.busAuto = () => { E.autoArrangeBus(S()); App.audit('ترتيب تلقائي لمقاعد الباص'); App.save(); App.render(); App.toast('✨ تم الترتيب: العائلات معاً وكبار السن بالمقدمة'); };
  App.actions.busClear = () => { if (confirm('تفريغ كل المقاعد؟')) { S().bus.seats = {}; App.save(); App.render(); } };

  // ================================================================ 7) OPS CENTER
  const OPS_TABS = [['vault', '🛂 خزنة الجوازات'], ['itinerary', '🗺️ البرنامج اليومي'], ['whatsapp', '🟢 أتمتة الواتساب'], ['rooming', '📄 كشف التسكين السعودي'], ['manifest', '🚌 مانيفست الباص'], ['voucher', '🎫 فوتشر المعتمر'], ['supervisor', '🧑‍✈️ كشف المشرف'], ['housing', '🛏️ كشف مندوب التسكين']];
  App.pages.ops = () => `
    <div class="page-head"><div><h2>🛂 مركز العمليات والتقارير الرسمية</h2><p>تتبع الجواز الفعلي · البرنامج الميداني · رسائل واتساب بنقرة · تصدير Excel/PDF متوافق مع وزارة الحج والعمرة</p></div></div>
    <div class="tabs">${OPS_TABS.map(([k, l]) => `<button class="${App.ui.opsTab === k ? 'active' : ''}" data-act="opsTab" data-t="${k}">${l}</button>`).join('')}</div>
    ${(OPS[App.ui.opsTab] || OPS.vault)()}`;
  App.actions.opsTab = (d) => { App.ui.opsTab = d.t; App.render(); };
  const OPS = {};

  OPS.vault = () => {
    const s = S(), f = App.ui.vaultFilter, list = livePax().filter((p) => f === 'ALL' || p.vault.stage === Number(f));
    const counts = E.PASSPORT_STAGES.map((st, i) => livePax().filter((p) => p.vault.stage === i).length);
    return `<div class="card"><div class="row" style="margin-bottom:10px"><button class="btn sm ${f === 'ALL' ? 'on' : ''}" data-act="vaultFilter" data-f="ALL">الكل (${livePax().length})</button>
      ${E.PASSPORT_STAGES.map((st, i) => `<button class="btn sm ${String(f) === String(i) ? 'on' : ''}" data-act="vaultFilter" data-f="${i}">${st.ar} (${counts[i]})</button>`).join('')}</div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>المعتمر</th><th>الحجز</th><th>رقم الجواز</th><th>الصلاحية</th><th>مسار الجواز</th><th>الموقع الحالي</th><th>آخر حركة</th><th></th></tr></thead><tbody>
      ${list.map((p) => { const c = E.passportCheck(p.passportExp, s.trip.returnDate), last = p.vault.log[p.vault.log.length - 1]; return `<tr>
        <td>${esc(p.nameAr)}<div class="faint small">${esc(p.nameEn)}</div></td><td class="num">${h.booking(p.bookingId).code}</td><td class="num">${esc(p.passport)}</td>
        <td>${c.ok ? `<span class="chip ok num">${p.passportExp}</span>` : `<span class="chip danger">🔴 ${esc(c.message)}</span>`}</td>
        <td style="min-width:140px"><div class="stepper">${E.PASSPORT_STAGES.map((x, i) => `<span class="${i <= p.vault.stage ? 'on' : ''}" title="${x.ar}"></span>`).join('')}</div></td>
        <td><b>${E.PASSPORT_STAGES[p.vault.stage].ar}</b></td><td class="small faint">${last ? `${h.dt(last.at)} · ${esc(last.by)}` : ''}</td>
        <td class="row" style="gap:4px"><button class="btn sm" data-act="vaultMove" data-id="${p.id}" data-dir="-1" ${p.vault.stage === 0 ? 'disabled' : ''}>▶</button>
          <button class="btn sm primary" data-act="vaultMove" data-id="${p.id}" data-dir="1" ${p.vault.stage === 4 ? 'disabled' : ''}>◀ تسليم للمرحلة التالية</button></td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  };
  App.actions.vaultFilter = (d) => { App.ui.vaultFilter = d.f; App.render(); };
  App.actions.vaultMove = (d) => {
    const p = h.pax(d.id), n = p.vault.stage + Number(d.dir);
    if (n < 0 || n > 4) return;
    p.vault.stage = n; p.vault.log.push({ stage: n, at: Date.now(), by: h.user().name });
    App.audit(`جواز ${p.nameAr} → ${E.PASSPORT_STAGES[n].ar}`); App.save(); App.render();
  };

  OPS.itinerary = () => {
    const t = S().trip;
    return `<div class="grid g-side"><div class="card"><h3>🗺️ مخطط البرنامج الميداني يوماً بيوم<span class="spacer"></span><button class="btn sm" data-act="itAdd">+ نشاط</button><button class="btn sm" data-act="printProgram">🖨️ طباعة</button></h3>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>اليوم</th><th>التاريخ</th><th>المدينة</th><th>الموعد</th><th>النشاط</th><th>ملاحظات التجمع</th><th></th></tr></thead><tbody>
      ${t.itinerary.map((r, i) => `<tr><td><input class="input" type="number" style="width:60px" data-bind="trip.itinerary.${i}.day" value="${r.day}"></td>
        <td><input class="input" type="date" data-bind="trip.itinerary.${i}.date" value="${r.date}"></td>
        <td><select class="input" data-bind="trip.itinerary.${i}.city">${opt('MAK', r.city, 'مكة')}${opt('MAD', r.city, 'المدينة')}</select></td>
        <td><input class="input" style="width:80px" data-bind="trip.itinerary.${i}.time" value="${esc(r.time)}"></td>
        <td><input class="input" style="min-width:260px" data-bind="trip.itinerary.${i}.title" value="${esc(r.title)}"></td>
        <td><input class="input" data-bind="trip.itinerary.${i}.notes" value="${esc(r.notes)}"></td>
        <td><button class="btn sm danger" data-act="itDel" data-i="${i}">✕</button></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card"><h3>🧑‍✈️ مشرف الرحلة المعتمد</h3>
        <div class="field"><label>الاسم</label><input class="input" data-bind="trip.supervisor.name" value="${esc(t.supervisor.name)}"></div>
        <div class="field" style="margin-top:8px"><label>الهاتف المصري</label><input class="input" style="direction:ltr" data-bind="trip.supervisor.phoneEG" value="${esc(t.supervisor.phoneEG)}"></div>
        <div class="field" style="margin-top:8px"><label>الهاتف السعودي</label><input class="input" style="direction:ltr" data-bind="trip.supervisor.phoneSA" value="${esc(t.supervisor.phoneSA)}"></div>
        <div class="small muted" style="margin-top:8px">يُربط تلقائياً بكل الكشوفات والفوتشرات ورسائل البريفينج.</div>
        <div class="field" style="margin-top:8px"><label>الحساب البنكي في رسائل السداد</label><input class="input" data-bind="trip.bank" value="${esc(t.bank)}"></div>
      </div></div>`;
  };
  App.actions.itAdd = () => { const t = S().trip, last = t.itinerary[t.itinerary.length - 1]; t.itinerary.push({ day: last ? last.day : 1, date: last ? last.date : t.departDate, city: last ? last.city : 'MAK', time: '', title: 'نشاط جديد', notes: '' }); App.save(); App.render(); };
  App.actions.itDel = (d) => { S().trip.itinerary.splice(Number(d.i), 1); App.save(); App.render(); };

  // ---------- WhatsApp templates
  function paxContext(p) {
    const s = S(), b = h.booking(p.bookingId), t = s.trip;
    const bed = (c) => { const x = E.bedOfPax(s, p.type === 'ADULT' ? p.id : (s.pax.find((y) => y.bookingId === p.bookingId && y.type === 'ADULT') || {}).id, c); return x ? roomLabel(h.room(x.roomId)) : 'سيتم الإبلاغ'; };
    const next = (b.installments || []).find((i) => !i.paid);
    return { s, b, t, bed, next, seat: seatOfPax(p.id) || '—', boarding: t.boardingPoints[p.boarding || 0] };
  }
  const WA = {
    confirm: { ar: '1) تأكيد الحجز والعربون', build: (p) => { const { b, t } = paxContext(p); return `السلام عليكم أ/ ${p.nameAr} 🌙\nتم تسجيل حجزكم رقم ${b.code} في رحلة: ${t.name}\n📅 السفر: ${t.departDate}\n💰 الإجمالي: ${h.n0(b.net)} ج.م — المسدد: ${h.n0(b.paid)} ج.م — المتبقي: ${h.n0((b.net || 0) - (b.paid || 0))} ج.م\n🏦 للسداد: ${t.bank}\nتقبل الله منا ومنكم.`; } },
    installment: { ar: '2) تذكير استحقاق القسط (قبل 48 ساعة)', build: (p) => { const { b, next } = paxContext(p); return next ? `تذكير كريم أ/ ${p.nameAr} 🔔\nيستحق ${next.label} بقيمة ${h.n0(next.amount)} ج.م بتاريخ ${next.due} عن الحجز ${b.code}.\nيرجى السداد لضمان تثبيت السرير والمقعد.` : `أ/ ${p.nameAr}: لا توجد أقساط مستحقة على الحجز ${b.code} ✅`; } },
    visa: { ar: '3) صدور التأشيرة والباركود', build: (p) => `مبارك أ/ ${p.nameAr} 🎉\nصدرت تأشيرة العمرة بنجاح.\n🛂 رقم الجواز: ${p.passport}\n🔢 رقم الحدود: ${p.borderNo || 'يصدر عند الوصول'}\n📲 باركود بوابة العمرة المصرية مرفق — يرجى الاحتفاظ به على الهاتف.` },
    briefing: { ar: '4) بريفينج ما قبل السفر', build: (p) => { const { t, bed, seat, boarding } = paxContext(p); return `بريفينج رحلة العمرة ✈️ أ/ ${p.nameAr}\n🕋 فندق مكة: ${allotOf('MAK').hotel} — غرفة ${bed('MAK')}\n🕌 فندق المدينة: ${allotOf('MAD').hotel} — غرفة ${bed('MAD')}\n🚌 مقعد الباص: ${seat} — نقطة التجمع: ${boarding}\n🧑‍✈️ المشرف: ${t.supervisor.name} — مصر ${t.supervisor.phoneEG} / السعودية ${t.supervisor.phoneSA}\n📅 السفر: ${t.departDate} — ${t.flight}`; } },
    daily: { ar: '5) تنبيه التحرك الميداني اليومي', build: (p) => { const t = S().trip, it = t.itinerary[App.ui.waItem || 0] || t.itinerary[0]; return `تنبيه تحرك 🚌 أ/ ${p.nameAr}\n📍 ${it.title}\n📅 ${it.date} — ⏰ ${it.time}\nالتجمع في لوبي الفندق. ${it.notes || ''}\nالمشرف: ${t.supervisor.phoneSA}`; } },
  };
  OPS.whatsapp = () => {
    const ui = App.ui, tpl = WA[ui.waTpl], perBooking = ['confirm', 'installment'].includes(ui.waTpl);
    let list = livePax().filter((p) => p.type === 'ADULT');
    if (perBooking) list = list.filter((p, i, arr) => arr.findIndex((x) => x.bookingId === p.bookingId) === i);
    if (ui.waFilter === 'DUE') list = list.filter((p) => { const b = h.booking(p.bookingId); return b.net && (b.paid || 0) < b.net; });
    if (ui.waFilter === 'HOLD') list = list.filter((p) => E.HOLD_STATES.includes(h.booking(p.bookingId).status));
    const preview = list[0] ? tpl.build(list[0]) : '';
    return `<div class="grid g-side"><div class="card"><h3>🟢 المستلمون (${list.length})</h3>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>المعتمر</th><th>الهاتف</th><th>الحجز</th><th>الرسالة</th><th></th></tr></thead><tbody>
      ${list.map((p) => { const txt = tpl.build(p); return `<tr><td>${esc(p.nameAr)}</td><td class="num">${esc(p.phone)}</td><td class="num">${h.booking(p.bookingId).code}</td><td class="small muted">${esc(txt.slice(0, 70))}…</td>
        <td><a class="btn sm primary" target="_blank" rel="noopener" href="${esc(E.waLink(p.phone, txt))}">إرسال ↗</a></td></tr>`; }).join('')}
      </tbody></table></div></div>
      <div class="card"><h3>✉️ القالب</h3>
        <div class="field"><label>نوع الرسالة</label><select class="input" data-ui="waTpl">${Object.entries(WA).map(([k, v]) => opt(k, ui.waTpl, v.ar)).join('')}</select></div>
        ${ui.waTpl === 'daily' ? `<div class="field" style="margin-top:8px"><label>النشاط</label><select class="input" data-ui="waItem" data-num>${S().trip.itinerary.map((it, i) => opt(i, ui.waItem || 0, `يوم ${it.day}: ${it.title}`)).join('')}</select></div>` : ''}
        <div class="field" style="margin-top:8px"><label>الفلتر</label><select class="input" data-ui="waFilter">${opt('ALL', ui.waFilter, 'كل المعتمرين النشطين')}${opt('DUE', ui.waFilter, 'عليهم مستحقات')}${opt('HOLD', ui.waFilter, 'حجوزات معلقة')}</select></div>
        <div class="field" style="margin-top:8px"><label>معاينة</label><textarea class="input" rows="11" readonly>${esc(preview)}</textarea></div>
        <div class="small muted" style="margin-top:6px">الإرسال الفوري عبر روابط <span class="num">wa.me</span>؛ وفي الإنتاج يُستبدل بـ WhatsApp Cloud API + Webhooks لحالات التسليم (انظر ARCHITECTURE.md).</div>
      </div></div>`;
  };

  // ---------- Saudi rooming list
  const RL_HEAD = ['Room No', 'Room Type', 'Full English Name (as in Passport)', 'Passport No', 'Nationality', 'Gender', 'Border No', 'Birth Date'];
  const rlRows = (city) => E.roomingList(S(), city).map((r) => [r.roomNo, r.roomType, r.nameEn, r.passport, r.nationality, r.gender, r.borderNo, r.dob]);
  OPS.rooming = () => {
    const s = S(), city = App.ui.reportCity, al = allotOf(city), stay = s.trip.stays[city], rows = rlRows(city), locked = s.roomingLocked[city];
    return `<div class="card"><div class="row" style="margin-bottom:10px">
      <div class="tabs" style="margin:0">${['MAK', 'MAD'].map((c) => `<button class="${city === c ? 'active' : ''}" data-act="rlCity" data-c="${c}">${E.CITIES[c].ar} ${s.roomingLocked[c] ? '🔒' : ''}</button>`).join('')}</div>
      ${locked ? '<span class="chip ok">🔒 كشف نهائي معتمد</span>' : '<span class="chip hold">مسودة — لم يُقفل التسكين بعد</span>'}<span class="spacer"></span>
      <button class="btn" data-act="rlExport" data-f="xls">⬇️ Excel</button><button class="btn" data-act="rlExport" data-f="csv">⬇️ CSV</button><button class="btn gold" data-act="rlPrint">🖨️ PDF</button></div>
      <div class="small muted" style="margin-bottom:8px">${esc(al.hotelEn)} · Check-in <span class="num">${stay.checkIn}</span> · Check-out <span class="num">${E.iso(E.addDays(stay.checkIn, stay.nights))}</span> · Group ${esc(s.trip.code)} · ${rows.length} Pax</div>
      <div class="tbl-wrap" style="direction:ltr"><table class="t"><thead><tr><th>#</th>${RL_HEAD.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td>${i + 1}</td>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
  };
  App.actions.rlCity = (d) => { App.ui.reportCity = d.c; App.render(); };
  App.actions.rlExport = (d) => { const c = App.ui.reportCity; App.exportTable(`RoomingList_${S().trip.code}_${E.CITIES[c].en}`, RL_HEAD, rlRows(c), d.f); };
  App.actions.rlPrint = () => {
    const s = S(), c = App.ui.reportCity, al = allotOf(c), stay = s.trip.stays[c];
    App.printDoc('Rooming List', `<div dir="ltr"><div class="head"><div><h2>OFFICIAL ROOMING LIST</h2><div class="muted">${esc(al.hotelEn)} — ${E.CITIES[c].en}</div></div>
      <div>Group: <b>${esc(s.trip.code)}</b><br>Check-in: ${stay.checkIn} · Nights: ${stay.nights}<br>Supervisor: ${esc(s.trip.supervisor.phoneSA)}</div></div>
      <table><tr><th>#</th>${RL_HEAD.map((x) => `<th>${x}</th>`).join('')}</tr>${rlRows(c).map((r, i) => `<tr><td>${i + 1}</td>${r.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</table>
      <p class="muted">Status: ${s.roomingLocked[c] ? 'FINAL — LOCKED' : 'DRAFT'} · Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</p></div>`, true);
  };

  // ---------- Bus manifest
  const MF_HEAD = ['Seat', 'الاسم', 'Name', 'الهاتف', 'الحجز', 'نقطة الركوب'];
  const mfRows = () => { const s = S(); return Object.keys(s.bus.seats).map(Number).sort((a, b) => a - b).map((n) => { const p = h.pax(s.bus.seats[n]); return [n, p.nameAr, p.nameEn, p.phone, h.booking(p.bookingId).code, s.trip.boardingPoints[p.boarding || 0]]; }); };
  OPS.manifest = () => {
    const s = S();
    return `<div class="card"><div class="row" style="margin-bottom:10px"><b>🚌 مانيفست ركوب الباص — ${esc(s.bus.plate)} · السائق ${esc(s.bus.driver)}</b><span class="spacer"></span>
      <button class="btn" data-act="mfExport" data-f="xls">⬇️ Excel</button><button class="btn gold" data-act="printManifest">🖨️ PDF</button></div>
      <div class="tbl-wrap"><table class="t"><thead><tr><th>المقعد</th><th>الاسم</th><th>Name</th><th>الهاتف</th><th>الحجز</th><th>نقطة الركوب</th></tr></thead><tbody>
      ${Object.keys(s.bus.seats).map(Number).sort((a, b) => a - b).map((n) => { const p = h.pax(s.bus.seats[n]), idx = s.pax.indexOf(p); return `<tr><td class="num"><b>${n}</b></td><td>${esc(p.nameAr)}</td><td class="num">${esc(p.nameEn)}</td><td class="num">${esc(p.phone)}</td><td class="num">${h.booking(p.bookingId).code}</td>
        <td><select class="input" data-bind="pax.${idx}.boarding" data-num>${s.trip.boardingPoints.map((bp, i) => opt(i, p.boarding || 0, bp)).join('')}</select></td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  };
  App.actions.mfExport = (d) => App.exportTable(`BusManifest_${S().trip.code}`, MF_HEAD, mfRows(), d.f);
  App.actions.printManifest = () => {
    const s = S();
    App.printDoc('Bus Manifest', `<div class="head"><div><h2>مانيفست ركوب الباص</h2><div class="muted">${esc(s.trip.name)}</div></div><div>اللوحة: ${esc(s.bus.plate)}<br>السائق: ${esc(s.bus.driver)}<br>المشرف: ${esc(s.trip.supervisor.name)}</div></div>
      <table><tr>${MF_HEAD.map((x) => `<th>${x}</th>`).join('')}<th>توقيع</th></tr>${mfRows().map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join('')}<td></td></tr>`).join('')}</table>`);
  };

  // ---------- Pilgrim voucher
  function voucherHtml(p) {
    const { b, t, bed, seat, boarding } = paxContext(p);
    return `<div class="head"><div><h1>🕋 فوتشر المعتمر</h1><div class="muted">${esc(t.name)}</div></div><div>رقم الحجز: <b>${esc(b.code)}</b><br>الحالة: ${esc(E.BOOKING_STATUS[b.status].ar)}</div></div>
      <div class="grid"><div class="box"><b>${esc(p.nameAr)}</b><br><span class="ltr">${esc(p.nameEn)}</span><br>جواز: ${esc(p.passport)} · ${E.PAX_TYPES[p.type].ar}</div>
      <div class="box">السفر: ${t.departDate} · العودة: ${t.returnDate}<br>${esc(t.flight)}<br>نقطة التجمع: ${esc(boarding)} · مقعد الباص: <b>${seat}</b></div>
      <div class="box">🕋 ${esc(allotOf('MAK').hotel)}<br>دخول ${t.stays.MAK.checkIn} · ${t.stays.MAK.nights} ليالٍ · غرفة <b>${esc(bed('MAK'))}</b></div>
      <div class="box">🕌 ${esc(allotOf('MAD').hotel)}<br>دخول ${t.stays.MAD.checkIn} · ${t.stays.MAD.nights} ليالٍ · غرفة <b>${esc(bed('MAD'))}</b></div></div>
      <div class="box">🧑‍✈️ المشرف: ${esc(t.supervisor.name)} — مصر ${esc(t.supervisor.phoneEG)} · السعودية ${esc(t.supervisor.phoneSA)}</div>
      <h2 style="margin-top:10px">البرنامج اليومي</h2><table><tr><th>اليوم</th><th>التاريخ</th><th>الموعد</th><th>النشاط</th><th>ملاحظات</th></tr>
      ${t.itinerary.map((r) => `<tr><td>${r.day}</td><td>${r.date}</td><td>${esc(r.time)}</td><td>${esc(r.title)}</td><td>${esc(r.notes)}</td></tr>`).join('')}</table>`;
  }
  OPS.voucher = () => {
    const list = livePax(), p = h.pax(App.ui.voucherPax) || list[0];
    return `<div class="card"><div class="row" style="margin-bottom:10px"><select class="input" style="width:auto" data-ui="voucherPax">${list.map((x) => opt(x.id, p.id, `${x.nameAr} – ${h.booking(x.bookingId).code}`)).join('')}</select>
      <span class="spacer"></span><a class="btn" target="_blank" rel="noopener" href="${esc(E.waLink(p.phone, WA.briefing.build(p)))}">🟢 إرسال واتساب</a><button class="btn gold" data-act="printVoucher" data-id="${p.id}">🖨️ PDF</button></div>
      <div class="doc">${voucherHtml(p)}</div></div>`;
  };
  App.actions.printVoucher = (d) => App.printDoc('Pilgrim Voucher', voucherHtml(h.pax(d.id)));
  App.actions.printProgram = () => App.printDoc('Daily Program', `<h2>البرنامج اليومي – ${esc(S().trip.name)}</h2><table><tr><th>اليوم</th><th>التاريخ</th><th>المدينة</th><th>الموعد</th><th>النشاط</th><th>ملاحظات</th></tr>${S().trip.itinerary.map((r) => `<tr><td>${r.day}</td><td>${r.date}</td><td>${E.CITIES[r.city].ar}</td><td>${esc(r.time)}</td><td>${esc(r.title)}</td><td>${esc(r.notes)}</td></tr>`).join('')}</table>`);

  // ---------- Supervisor & housing-rep sheets (same data shape as the server portal)
  function tripSheetData() {
    const s = S(), t = s.trip;
    const bedOf = (p, c) => { const b = E.bedOfPax(s, p.id, c); if (!b) return ''; const r = h.room(b.roomId); return (r.physicalNo || r.vcode) + '/' + b.no; };
    return {
      code: t.code, name: t.name, departDate: t.departDate, returnDate: t.returnDate, flight: t.flight, itinerary: t.itinerary, supervisor: t.supervisor,
      hotels: ['MAK', 'MAD'].map((c) => ({ city: c, name: allotOf(c) ? allotOf(c).hotel : '', checkIn: t.stays[c].checkIn, nights: t.stays[c].nights })),
      pax: livePax().map((p) => ({ nameAr: p.nameAr, nameEn: p.nameEn, phone: p.phone, gender: p.gender, type: p.type, booking: h.booking(p.bookingId).code,
        mak: p.type === 'ADULT' ? bedOf(p, 'MAK') : 'مع ذويه', mad: p.type === 'ADULT' ? bedOf(p, 'MAD') : 'مع ذويه', seat: seatOfPax(p.id) || '', passportStage: E.PASSPORT_STAGES[p.vault.stage].ar })),
      rooming: { MAK: E.roomingList(s, 'MAK'), MAD: E.roomingList(s, 'MAD') },
      unassigned: { MAK: E.unassignedPax(s, 'MAK').length, MAD: E.unassignedPax(s, 'MAD').length },
      expenses: s.vouchers.filter((v) => v.tripId === s.activeTripId && v.type === 'EXP' && v.status === 'POSTED').map((v) => ({ no: v.no, date: v.date, amount: v.amount, currency: v.currency, memo: v.memo })),
    };
  }
  window.Sheets = {
    supervisor(t) {
      return `<div class="head"><div><h2>كشف مشرف الرحلة</h2><div>${esc(t.code)} · ${esc(t.name)}</div></div><div>السفر ${esc(t.departDate)} · العودة ${esc(t.returnDate)}<br>${esc(t.flight || '')}<br>المشرف: ${esc((t.supervisor && t.supervisor.name) || '')}</div></div>
        <div class="grid">${t.hotels.map((x) => `<div class="box">${x.city === 'MAK' ? '🕋' : '🕌'} ${esc(x.name)}<br>دخول ${esc(x.checkIn)} · ${x.nights} ليالٍ</div>`).join('')}</div>
        <table><tr><th>#</th><th>الاسم</th><th>الهاتف</th><th>الحجز</th><th>غرفة مكة</th><th>غرفة المدينة</th><th>الباص</th><th>الجواز</th></tr>
        ${t.pax.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.nameAr)}${p.type !== 'ADULT' ? ' (' + (p.type === 'CHD' ? 'طفل' : 'رضيع') + ')' : ''}</td><td class="ltr">${esc(p.phone)}</td><td>${esc(p.booking)}</td><td>${esc(p.mak)}</td><td>${esc(p.mad)}</td><td>${esc(p.seat)}</td><td>${esc(p.passportStage)}</td></tr>`).join('')}</table>
        <h2 style="margin-top:10px">البرنامج اليومي</h2><table><tr><th>اليوم</th><th>التاريخ</th><th>الموعد</th><th>النشاط</th><th>ملاحظات</th></tr>
        ${(t.itinerary || []).map((r) => `<tr><td>${r.day}</td><td>${esc(r.date)}</td><td>${esc(r.time)}</td><td>${esc(r.title)}</td><td>${esc(r.notes)}</td></tr>`).join('')}</table>
        ${t.expenses && t.expenses.length ? `<h2 style="margin-top:10px">مصروفات الرحلة المعتمدة</h2><table><tr><th>السند</th><th>التاريخ</th><th>البيان</th><th>المبلغ</th></tr>${t.expenses.map((e) => `<tr><td>${esc(e.no)}</td><td>${esc(e.date)}</td><td>${esc(e.memo)}</td><td>${e.amount} ${esc(e.currency)}</td></tr>`).join('')}</table>` : ''}
        <div class="sign"><div>توقيع المشرف ................</div><div>مدير العمليات ................</div></div>`;
    },
    housing(t) {
      const city = (c) => `<h2 style="margin-top:10px">${c === 'MAK' ? '🕋 مكة المكرمة' : '🕌 المدينة المنورة'} — ${esc((t.hotels.find((x) => x.city === c) || {}).name || '')}</h2>
        ${t.unassigned[c] ? `<p style="color:#b00">⚠️ ${t.unassigned[c]} معتمر بدون سرير</p>` : ''}
        <table><tr><th>الغرفة</th><th>النوع</th><th>الاسم كالجواز</th><th>الجواز</th><th>الجنس</th><th>رقم الحدود</th></tr>
        ${t.rooming[c].map((r) => `<tr><td><b>${esc(r.roomNo)}</b></td><td>${esc(r.roomType)}</td><td class="ltr">${esc(r.nameEn)}</td><td class="ltr">${esc(r.passport)}</td><td>${esc(r.gender)}</td><td class="ltr">${esc(r.borderNo)}</td></tr>`).join('')}</table>`;
      return `<div class="head"><div><h2>كشف مندوب التسكين</h2><div>${esc(t.code)} · ${esc(t.name)}</div></div><div>السفر ${esc(t.departDate)}</div></div>${city('MAK')}${city('MAD')}
        <div class="sign"><div>توقيع مندوب التسكين ................</div><div>استلام الفندق ................</div></div>`;
    },
  };
  OPS.supervisor = () => `<div class="card"><div class="row" style="margin-bottom:10px"><span class="muted">يظهر نفس الكشف للمشرف في حسابه (${esc((S().trip.supervisor && S().trip.supervisor.name) || 'لم يُحدد')})</span><span class="spacer"></span><button class="btn gold" data-act="printSheet" data-k="supervisor">🖨️ طباعة</button></div><div class="doc">${window.Sheets.supervisor(tripSheetData())}</div></div>`;
  OPS.housing = () => `<div class="card"><div class="row" style="margin-bottom:10px"><span class="muted">يظهر نفس الكشف لمندوب التسكين في حسابه</span><span class="spacer"></span><button class="btn gold" data-act="printSheet" data-k="housing">🖨️ طباعة</button></div><div class="doc">${window.Sheets.housing(tripSheetData())}</div></div>`;
  App.actions.printSheet = (d) => App.printDoc(d.k === 'supervisor' ? 'Supervisor Sheet' : 'Housing Sheet', window.Sheets[d.k](tripSheetData()));

  // ================================================================ 8) P&L
  App.pages.pnl = () => {
    const s = S(), p = E.tripPnL(s), t = s.trip;
    const steps = [
      ['إجمالي الإيرادات (مؤكد + عربون)', p.revenue, 'var(--emerald)', true],
      ['− الفنادق (SAR بالمرجعي)', -p.hotelSAR * t.fxRef, 'var(--confirmed)'],
      ['− التأشيرات والتأمين والنقل (SAR)', -(p.varSAR + p.fixedSAR) * t.fxRef, 'var(--confirmed)'],
      ['− الطيران والمحلي المتغير (EGP)', -p.varEGP, 'var(--deposit)'],
      ['− الثابت المحلي (مشرف/هدايا/تسويق)', -p.fixedEGP, 'var(--deposit)'],
      ['− عمولات المناديب والوسطاء', -p.commissions, 'var(--agents)'],
      ['− نثريات المشرفين الميدانية', -p.fieldExp, 'var(--agents)'],
      ['= صافي الربح التشغيلي', p.operating, 'var(--gold)', true],
      [p.fxLoss > 0 ? '− خسارة فروق العملة' : '+ ربح فروق العملة', -p.fxLoss, p.fxLoss > 0 ? 'var(--danger)' : 'var(--ok)'],
      ['= صافي الربح الفعلي للرحلة', p.net, 'var(--gold-2)', true],
    ];
    const max = Math.max(p.revenue, 1);
    let run = 0;
    const bars = steps.map(([lbl, v, c, total]) => {
      let a, b;
      if (total) { a = 0; b = v; run = v; } else { a = run; b = run + v; run = b; }
      const lo = Math.min(a, b), w = Math.abs(b - a);
      return `<div class="wf-row"><div>${lbl}</div><div class="wf-bar" style="direction:ltr"><span style="left:${Math.max(0, (lo / max) * 100)}%;width:${Math.max(0.4, (w / max) * 100)}%;background:${c}"></span></div><div class="${v < 0 ? 'danger' : ''}" style="text-align:left">${h.egp(v)}</div></div>`;
    }).join('');
    return `
    <div class="page-head"><div><h2>📊 الإغلاق المحاسبي وأرباح الرحلة</h2><p>مركز التكلفة ${esc(t.costCenter)} · التشغيلي معزول عن أثر تقلبات الصرف</p></div></div>
    <div class="grid g4">
      <div class="card kpi"><div class="lbl">الإيرادات المتعاقد عليها</div><div class="val">${h.egp(p.revenue)}</div><div class="hint">${p.adults} بالغ · ${p.chd} طفل · ${p.inf} رضيع</div></div>
      <div class="card kpi"><div class="lbl">المحصل فعلياً</div><div class="val ok">${h.egp(p.collected)}</div><div class="hint">مستحقات على العملاء ${h.egp(p.receivable)}</div></div>
      <div class="card kpi"><div class="lbl">الربح التشغيلي</div><div class="val ${p.operating < 0 ? 'danger' : 'gold'}">${h.egp(p.operating)}</div><div class="hint">هامش ${p.operatingMarginPct}% (أداء المبيعات والتشغيل)</div></div>
      <div class="card kpi"><div class="lbl">صافي الربح الفعلي</div><div class="val ${p.net < 0 ? 'danger' : 'gold'}">${h.egp(p.net)}</div><div class="hint">هامش محقق ${p.marginPct}% بعد فروق العملة</div></div>
    </div>
    <div class="grid g-side" style="margin-top:14px">
      <div class="card"><h3>🌊 شلال الأرباح والخسائر</h3><div class="wf">${bars}</div></div>
      <div class="stack">
        <div class="card"><h3>💱 أثر فروق العملة (FX Ledger)</h3>
          <table class="t"><tr><td>إجمالي الالتزامات بالريال</td><td>${h.sar(p.totalSAR)}</td></tr>
          <tr><td>بالسعر المرجعي (${t.fxRef})</td><td>${h.egp(p.sarBudgetEGP)}</td></tr>
          <tr><td>الفعلي (مسدد + المتبقي بسعر السوق)</td><td>${h.egp(p.sarActualEGP)}</td></tr>
          <tr><td><b>${p.fxLoss > 0 ? 'خسارة' : 'ربح'} فروق العملة</b></td><td class="${p.fxLoss > 0 ? 'danger' : 'ok'}"><b>${h.egp(Math.abs(p.fxLoss))}</b></td></tr></table>
          <div class="small muted" style="margin-top:10px">المتبقي غير المسدد بالريال يُقيَّم بسعر الصرف التنفيذي <b class="num">${s.fx.current}</b> — <a href="#" data-act="go" data-page="fx">تعديله من صفحة أسعار الصرف</a></div>
        </div>
        <div class="card"><h3>🧾 نثريات المشرفين</h3>
          <table class="t">${s.fieldExpenses.map((e) => `<tr><td>${esc(e.label)}</td><td>${h.cur(e.amount, e.currency)}</td></tr>`).join('')}</table>
          <button class="btn sm" style="margin-top:8px" data-act="addFE">+ سند مصروف على الرحلة</button>
        </div>
      </div>
    </div>`;
  };
  App.actions.addFE = () => {
    App.openVoucher({ type: 'EXP', categoryId: 'EC8', tripId: S().activeTripId, currency: 'SAR', fx: S().fx.current, memo: 'نثريات مشرف' });
  };
})();
