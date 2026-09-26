/* =====================================================================
 * أفواج — Domestic tourism engine (السياحة الداخلية) — browser + server
 *  Programs  : group packages (bus/flight/train), day trips, Nile cruises
 *              · hotel options with board basis · occupancy prices (SGL/DBL/TPL)
 *              · child policy by age (free / no bed / with bed) · extras
 *              · pickup points · seats · allotment · per-program agent commission
 *  Hotels    : coded hotels with seasonal contract rates (cost & selling, weekend)
 *  Bookings  : program or hotel-only, shared status machine, owner-only discount,
 *              agent commission, revenue 4105 (+ extras 4106) through Acc.syncBooking,
 *              payments by vouchers (same document cycle as Umrah)
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./accounting.js'));
  else root.Dom = factory(root.Engine, root.Acc);
})(typeof self !== 'undefined' ? self : this, function (E, Acc) {
  'use strict';
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const KINDS = { PACKAGE: { ar: 'برنامج سياحي (إقامة + انتقالات)', icon: '🏖️' }, DAYTRIP: { ar: 'رحلة اليوم الواحد', icon: '🚌' }, CRUISE: { ar: 'فندق عائم (نيلي)', icon: '🛳️' } };
  const BOARDS = { RO: 'إقامة فقط', BB: 'إفطار', HB: 'نصف إقامة (إفطار + عشاء)', FB: 'إقامة كاملة (3 وجبات)', AI: 'شامل كلياً All Inclusive', SAI: 'شامل مميز Soft All' };
  const ROOMS = { SGL: { ar: 'فردية', cap: 1 }, DBL: { ar: 'مزدوجة', cap: 2 }, TPL: { ar: 'ثلاثية', cap: 3 }, QUAD: { ar: 'رباعية/عائلية', cap: 4 } };
  const TRANSPORT = { BUS: 'أتوبيس سياحي', FLIGHT: 'طيران داخلي', TRAIN: 'قطار (نوم/مكيف)', OWN: 'انتقال ذاتي' };
  const CITIES = ['شرم الشيخ', 'الغردقة', 'مرسى علم', 'دهب', 'العين السخنة', 'الساحل الشمالي', 'مرسى مطروح', 'الإسكندرية', 'الأقصر', 'أسوان', 'الفيوم', 'سيوة', 'طابا ونويبع', 'القاهرة والجيزة', 'رأس سدر'];
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const empty = () => ({ hotels: [], programs: [], bookings: [] });
  function normalize(dom) {
    const d = { ...empty(), ...(dom || {}) };
    for (const k of ['hotels', 'programs', 'bookings']) if (!Array.isArray(d[k])) d[k] = [];
    return d;
  }
  const nights = (a, b) => Math.max(0, Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000));
  const program = (S, id) => S.dom.programs.find((p) => p.id === id);
  const hotel = (S, id) => S.dom.hotels.find((h) => h.id === id);
  /** Pseudo "trip" handed to the shared accounting (cost-center id = program id; hotel-only bookings → HOTEL). */
  const costCenter = (S, b) => { const p = b.programId && program(S, b.programId); return p ? { id: p.id, code: p.code, name: p.name } : { id: 'DOM-HOTELS', code: 'HOTELS', name: 'حجوزات فنادق' }; };

  // ------------------------------------------------------------ hotel contract rates
  /** Nightly rate for a date: the contract row matching board & room type whose season covers the date (weekend = Thu/Fri nights). */
  function rateFor(h, date, roomType, board) {
    const dow = new Date(date + 'T12:00:00').getDay();
    const row = (h.rates || []).find((r) => r.board === board && r.roomType === roomType && date >= r.from && date <= r.to);
    if (!row) return null;
    const we = (dow === 4 || dow === 5) && row.weekendPrice;
    return { price: Number(we ? row.weekendPrice : row.price), cost: Number(we ? row.weekendCost || row.cost : row.cost), rowId: row.id };
  }
  function stayPrice(h, checkIn, checkOut, roomType, board) {
    let price = 0, cost = 0; const missing = [];
    for (let d = checkIn; d < checkOut; d = E.iso(E.addDays(d, 1))) {
      const r = rateFor(h, d, roomType, board);
      if (!r) missing.push(d); else { price += r.price; cost += r.cost; }
    }
    return { price: r2(price), cost: r2(cost), nights: nights(checkIn, checkOut), missing };
  }

  // ------------------------------------------------------------ pricing
  /** Child policy on a program: age < infantMax → infant fee · < childMax → child (no bed / with bed) · else adult. */
  function paxType(p, age) {
    const cp = p.childPolicy || { infantMax: 2, childMax: 12 };
    if (age == null || age === '') return 'ADULT';
    return age < cp.infantMax ? 'INF' : age < cp.childMax ? 'CHD' : 'ADULT';
  }
  /**
   * draft: { programId | hotel:{hotelId,checkIn,checkOut,board}, optIdx, rooms:[{type, adults, children:[{age, bed}]}], extras:{id:qty},
   *          discountPct, agentId, channel, commissionAdj }
   */
  function priceBooking(S, draft) {
    const lines = [], reasons = [], warnings = [];
    let gross = 0, cost = 0, units = { adults: 0, chd: 0, inf: 0 };
    const agent = draft.agentId ? S.agents.find((a) => a.id === draft.agentId) : null;
    const rooms = draft.rooms || [];
    if (!rooms.length) reasons.push('أضف غرفة واحدة على الأقل');
    if (draft.programId) {
      const p = program(S, draft.programId);
      if (!p) return { lines, gross: 0, net: 0, cost: 0, status: 'BLOCKED', reasons: ['البرنامج غير موجود'], warnings, units };
      const opt = (p.hotelOptions || [])[Number(draft.optIdx) || 0];
      if (p.kind !== 'DAYTRIP' && !opt) reasons.push('اختر الفندق');
      for (const [i, r] of rooms.entries()) {
        const cap = ROOMS[r.type] ? ROOMS[r.type].cap : 2, ad = Number(r.adults) || 0;
        if (p.kind === 'DAYTRIP') {
          lines.push({ label: `${ad} × مقعد بالغ`, total: ad * Number(p.seatPrice || 0) }); cost += ad * Number(p.seatCost || 0); units.adults += ad;
        } else {
          if (ad < 1) reasons.push(`الغرفة ${i + 1}: لازم بالغ واحد على الأقل`);
          if (ad > cap) reasons.push(`الغرفة ${i + 1}: ${ROOMS[r.type].ar} تسع ${cap} بالغين`);
          const unit = opt && opt.prices ? Number(opt.prices[r.type]) : NaN;
          if (!(unit > 0)) reasons.push(`لا يوجد سعر ${ROOMS[r.type] ? ROOMS[r.type].ar : r.type} في هذا الفندق`);
          else { lines.push({ label: `غرفة ${ROOMS[r.type].ar}: ${ad} × ${unit}`, total: ad * unit }); cost += ad * Number((opt.cost || {})[r.type] || 0); }
          units.adults += ad;
        }
        for (const c of r.children || []) {
          const t = paxType(p, Number(c.age));
          const cp = p.childPolicy || {};
          if (t === 'INF') { lines.push({ label: `رضيع (${c.age} سنة)`, total: Number(cp.infantPrice || 0) }); units.inf++; }
          else if (t === 'CHD') {
            const pr = p.kind === 'DAYTRIP' ? Number(p.childSeatPrice ?? p.seatPrice ?? 0) : c.bed ? Number(cp.childBedPrice || 0) : Number(cp.childNoBedPrice || 0);
            lines.push({ label: `طفل ${c.age} سنة ${p.kind === 'DAYTRIP' ? '' : c.bed ? '(بسرير إضافي)' : '(مع الوالدين بدون سرير)'}`, total: pr }); units.chd++;
            cost += p.kind === 'DAYTRIP' ? Number(p.seatCost || 0) : Number(c.bed ? cp.childBedCost || 0 : cp.childNoBedCost || 0);
          } else { lines.push({ label: `مرافق ${c.age} سنة يُحسب بالغ`, total: p.kind === 'DAYTRIP' ? Number(p.seatPrice || 0) : Number((opt && opt.prices && opt.prices.TPL) || 0) }); units.adults++; }
        }
      }
      for (const [xid, qty] of Object.entries(draft.extras || {})) {
        const x = (p.extras || []).find((e) => e.id === xid); const q = Number(qty) || 0;
        if (x && q > 0) { lines.push({ label: `${x.name} × ${q}`, total: q * Number(x.price || 0), extra: true }); cost += q * Number(x.cost || 0); }
      }
      const seatsNeeded = units.adults + units.chd;
      const left = capacityLeft(S, p);
      if (left != null && seatsNeeded > left) reasons.push(`المتبقي في البرنامج ${left} مكان فقط`);
      if (p.status === 'CLOSED') reasons.push('البرنامج مغلق للحجز');
    } else if (draft.hotel && draft.hotel.hotelId) {
      const hh = hotel(S, draft.hotel.hotelId), { checkIn, checkOut, board } = draft.hotel;
      if (!hh) reasons.push('اختر الفندق');
      else if (!checkIn || !checkOut || checkOut <= checkIn) reasons.push('تواريخ الإقامة غير صحيحة');
      else for (const [i, r] of rooms.entries()) {
        const st = stayPrice(hh, checkIn, checkOut, r.type, board);
        if (st.missing.length) reasons.push(`الغرفة ${i + 1}: لا يوجد سعر تعاقد لليالي ${st.missing.slice(0, 3).join('، ')}${st.missing.length > 3 ? '…' : ''}`);
        lines.push({ label: `غرفة ${ROOMS[r.type].ar} ${BOARDS[board]} × ${st.nights} ليلة`, total: st.price }); cost += st.cost;
        units.adults += Number(r.adults) || 0;
        const cp = hh.childPolicy || { infantMax: 2, childMax: 12, childBedPct: 50 };
        for (const c of r.children || []) {
          const age = Number(c.age);
          if (age < cp.infantMax) units.inf++;
          else if (age < cp.childMax) { units.chd++; if (c.bed) { const add = r2(st.price / Math.max(1, ROOMS[r.type].cap) * (cp.childBedPct || 50) / 100); lines.push({ label: `سرير إضافي لطفل ${c.age} سنة`, total: add }); } }
          else { units.adults++; }
        }
      }
    } else reasons.push('اختر البرنامج أو الفندق');
    gross = r2(lines.reduce((s, l) => s + l.total, 0));
    const extrasTotal = r2(lines.filter((l) => l.extra).reduce((s, l) => s + l.total, 0));
    const discPct = Number(draft.discountPct || 0);
    const discount = r2(gross * discPct / 100);
    const net = r2(gross - discount);
    let commission = null, agentCommission = 0;
    if (agent && agent.tier === 'BROKER') {
      const p = draft.programId && program(S, draft.programId);
      commission = E.commissionFor({ trip: p ? { commissions: p.commissions || {} } : { commissions: {} } }, agent, { adults: units.adults, chd: units.chd, gross });
      agentCommission = Math.max(0, r2(commission.base + Number(draft.commissionAdj || 0)));
    }
    let channelDiscount = 0;
    if (agent && agent.tier === 'B2B') channelDiscount = r2(gross * Number(agent.netDiscountPct || 0) / 100);
    const finalNet = r2(net - channelDiscount);
    const owner = draft.actorRole === 'OWNER';
    let status = reasons.length ? 'BLOCKED' : discPct > 0 && !owner ? 'PENDING_APPROVAL' : 'SOFT_HOLD';
    if (status === 'PENDING_APPROVAL') warnings.push(`خصم ${discPct}% يحتاج اعتماد مالك النظام`);
    return { lines, gross, discount, channelDiscount, net: finalNet, cost: r2(cost), margin: r2(finalNet - cost - agentCommission), extrasTotal, units, status, reasons, warnings, agentCommission, commission };
  }
  function capacityLeft(S, p) {
    if (!p.capacity) return null;
    const used = S.dom.bookings.filter((b) => b.programId === p.id && E.LIVE_STATES.includes(b.status)).reduce((s, b) => s + (b.units ? b.units.adults + b.units.chd : 0), 0);
    return Math.max(0, p.capacity - used);
  }

  // ------------------------------------------------------------ booking
  function createBooking(S, d, actor) {
    const v = priceBooking(S, { ...d, actorRole: actor.role, commissionAdj: actor.role === 'OWNER' ? d.commissionAdj : 0 });
    if (v.status === 'BLOCKED') throw new Error(v.reasons.join(' · '));
    const lead = (d.pax || [])[0] || {};
    if (!String(lead.name || '').trim() || !String(lead.phone || '').trim()) throw new Error('اكتب اسم وهاتف صاحب الحجز');
    const now = Date.now();
    const agent = d.agentId ? S.agents.find((a) => a.id === d.agentId) : null;
    const channel = agent ? (agent.tier === 'B2B' ? 'B2B' : 'BROKER') : 'DIRECT';
    let customer = null;
    if (channel !== 'B2B') {
      const p = String(lead.phone).replace(/\D/g, '');
      customer = S.customers.find((c) => String(c.phone || '').replace(/\D/g, '') === p);
      if (!customer) { customer = { id: 'CU' + now.toString(36) + Math.random().toString(36).slice(2, 5), code: Acc.nextNo(S, 'C_CUS', 'CUS', 4), name: lead.name, phone: lead.phone, nid: lead.nid || '', notes: '', createdAt: now }; S.customers.push(customer); }
    }
    const p = d.programId ? program(S, d.programId) : null;
    const b = {
      id: 'DB' + now.toString(36) + Math.random().toString(36).slice(2, 5), code: Acc.nextNo(S, 'DBK', 'DBK', 5), domestic: true,
      kind: p ? 'PROGRAM' : 'HOTEL', programId: p ? p.id : null, optIdx: Number(d.optIdx) || 0, hotel: p ? null : { ...d.hotel, nights: nights(d.hotel.checkIn, d.hotel.checkOut), confirmationNo: '' },
      rooms: d.rooms, pax: d.pax, extras: d.extras || {}, pickup: d.pickup || '', seats: [], units: v.units,
      channel, agentId: agent ? agent.id : null, userId: channel === 'DIRECT' ? actor.staffId : null, customerId: customer ? customer.id : null, branchId: d.branchId || (p && p.branchId) || 'BR1',
      lines: v.lines, gross: v.gross, discountPct: Number(d.discountPct || 0), net: v.net, cost: v.cost, paid: 0, status: v.status, revAcc: '4105',
      agentCommission: v.agentCommission, commissionBase: v.commission ? v.commission.base : 0, commissionAdj: actor.role === 'OWNER' ? Number(d.commissionAdj || 0) : 0, commissionLog: [],
      holdUntil: v.status === 'SOFT_HOLD' ? now + E.clampTTL(d.ttl || 24) * 3600000 : null, installments: [], notes: d.notes || '', createdAt: now, createdBy: actor.name,
    };
    if (b.commissionAdj) b.commissionLog.push({ adj: b.commissionAdj, note: d.commissionNote || '', by: actor.name, at: now });
    if (agent && agent.tier === 'B2B') {
      const w = E.walletCheck(agent, v.net, S.fx.current);
      if (!w.ok) throw new Error(w.reason);
      agent.balance = r2(agent.balance - w.amount); b.paid = v.net; b.status = 'CONFIRMED'; b.holdUntil = null;
    }
    S.dom.bookings.push(b);
    Acc.syncBooking(S, costCenter(S, b), b, actor.name);
    return { booking: b, pricing: v };
  }
  function cancelBooking(S, b, by) {
    b.status = 'CANCELLED'; b.seats = []; b.holdUntil = null; b.cancelledBy = by; b.cancelledAt = Date.now();
    return Acc.syncBooking(S, costCenter(S, b), b, by);
  }
  function releaseExpired(S, now) {
    const out = [];
    for (const b of S.dom.bookings) if (E.HOLD_STATES.includes(b.status) && b.holdUntil && b.holdUntil <= now && !b.pendingPay) { b.status = 'EXPIRED'; b.seats = []; out.push(b.code); }
    return out;
  }

  // ------------------------------------------------------------ seats & operations
  function seatMap(S, p) {
    const taken = {};
    for (const b of S.dom.bookings) if (b.programId === p.id && E.LIVE_STATES.includes(b.status)) for (const s of b.seats || []) taken[s] = b;
    return { total: Number((p.transport || {}).seats || 0), taken };
  }
  function toggleSeat(S, b, seat) {
    const p = program(S, b.programId); const m = seatMap(S, p);
    if (seat < 1 || seat > m.total) throw new Error('مقعد غير موجود');
    if (b.seats.includes(seat)) { b.seats = b.seats.filter((x) => x !== seat); return b; }
    if (m.taken[seat]) throw new Error(`المقعد ${seat} محجوز لـ ${m.taken[seat].code}`);
    const need = (b.units ? b.units.adults + b.units.chd : 0) || 1;
    if (b.seats.length >= need) throw new Error(`الحجز له ${need} مقعد فقط`);
    b.seats.push(seat); return b;
  }
  /** Program profitability: revenue ex-tax (booked) − supplier bills/expenses on the program cost center − agent commissions. */
  function programPnl(S, p) {
    const bk = S.dom.bookings.filter((b) => b.programId === p.id && E.LIVE_STATES.includes(b.status));
    const gross = r2(bk.reduce((s, b) => s + (b.net || 0), 0));
    const t = Acc.salesTaxRates(S), taxShare = (t.vat + t.stamp) / (100 + t.vat + t.stamp);
    const revenue = r2(gross * (1 - taxShare));
    const est = r2(bk.reduce((s, b) => s + (b.cost || 0), 0));
    const posted = r2(S.journal.filter((j) => j.tripId === p.id).reduce((s, j) => s + j.lines.filter((l) => /^51/.test(l.acc)).reduce((x, l) => x + l.dr - l.cr, 0), 0));
    const fixed = r2((p.fixedCosts || []).reduce((s, c) => s + Number(c.amount || 0), 0));
    const comm = r2(bk.reduce((s, b) => s + (b.agentCommission || 0), 0));
    const pax = bk.reduce((s, b) => s + (b.units ? b.units.adults + b.units.chd + b.units.inf : 0), 0);
    const collected = r2(bk.reduce((s, b) => s + Math.min(b.paid || 0, b.net || 0), 0));
    const costBasis = posted || r2(est + fixed);
    return { bookings: bk.length, pax, gross, revenue, estCost: r2(est + fixed), postedCost: posted, commissions: comm, profit: r2(revenue - costBasis - comm), collected, due: r2(gross - collected), costSource: posted ? 'مرحّلة' : 'تقديرية' };
  }

  // ------------------------------------------------------------ demo data
  function seedDemo(S, now = Date.now()) {
    S.dom = empty();
    const day = (n) => E.iso(E.addDays(new Date(now), n));
    const sup = (name, cat) => { const x = { id: 'S' + uid(''), code: Acc.nextNo(S, 'C_SUP', 'SUP', 3), name, category: cat, currency: 'EGP', phone: '', taxNo: '' }; S.suppliers.push(x); return x; };
    const sH1 = sup('منتجع الشعاب المرجانية – شرم الشيخ', 'HOTEL'), sH2 = sup('فندق كورنيش الغردقة', 'HOTEL'), sH3 = sup('فندق البحر المتوسط – الإسكندرية', 'HOTEL'), sBus = sup('شركة النيل للنقل السياحي', 'TRANSPORT'), sCr = sup('فنادق النيل العائمة – الأقصر', 'HOTEL');
    const season = (from, to) => ({ from, to });
    const s1 = season(day(-30), day(120));
    const rate = (roomType, board, cost, price, wc, wp) => ({ id: uid('RT'), ...s1, roomType, board, cost, price, weekendCost: wc || null, weekendPrice: wp || null });
    const H = (code, name, city, stars, supplier, rates) => { const x = { id: uid('HT'), code, name, city, stars, supplierId: supplier.id, phone: '', childPolicy: { infantMax: 2, childMax: 12, childBedPct: 50 }, rates }; S.dom.hotels.push(x); return x; };
    const h1 = H('DHT-001', 'منتجع الشعاب المرجانية', 'شرم الشيخ', 5, sH1, [rate('DBL', 'AI', 3200, 4100, 3600, 4600), rate('SGL', 'AI', 4800, 6000), rate('TPL', 'AI', 4400, 5700)]);
    const h2 = H('DHT-002', 'فندق كورنيش الغردقة', 'الغردقة', 4, sH2, [rate('DBL', 'HB', 1800, 2400, 2100, 2800), rate('SGL', 'HB', 1500, 2000), rate('TPL', 'HB', 2500, 3300)]);
    const h3 = H('DHT-003', 'فندق البحر المتوسط', 'الإسكندرية', 4, sH3, [rate('DBL', 'BB', 1600, 2100), rate('SGL', 'BB', 1300, 1700), rate('TPL', 'BB', 2200, 2900)]);
    S.counters.C_DHT = 3;
    const P = (o) => { const x = { id: uid('PR'), status: 'OPEN', branchId: 'BR1', commissions: { default: 150 }, fixedCosts: [], extras: [], pickups: [], includes: '', excludes: '', itinerary: '', supervisor: '', ...o }; S.dom.programs.push(x); return x; };
    const p1 = P({ code: 'DPR-001', kind: 'PACKAGE', name: 'شرم الشيخ 5 أيام / 4 ليالي', city: 'شرم الشيخ', startDate: day(12), endDate: day(16), capacity: 49,
      transport: { type: 'BUS', seats: 49, supplierId: sBus.id, cost: 42000 }, childPolicy: { infantMax: 2, childMax: 12, infantPrice: 0, childNoBedPrice: 2500, childBedPrice: 4200, childNoBedCost: 1200, childBedCost: 2600 },
      hotelOptions: [{ hotelId: h1.id, board: 'AI', prices: { SGL: 16500, DBL: 11900, TPL: 10900 }, cost: { SGL: 12400, DBL: 8200, TPL: 7600 } }, { hotelId: h2.id, board: 'HB', prices: { SGL: 8900, DBL: 7400, TPL: 6900 }, cost: { SGL: 5200, DBL: 4300, TPL: 4000 } }],
      pickups: [{ place: 'القاهرة – ميدان التحرير (أمام المتحف)', time: '22:00' }, { place: 'الجيزة – ميدان الرماية', time: '22:30' }, { place: 'مدينة نصر – سيتي ستارز', time: '23:00' }],
      extras: [{ id: 'X1', name: 'رحلة رأس محمد بالمركب + سنوركلينج', price: 950, cost: 600 }, { id: 'X2', name: 'سفاري جيب + عشاء بدوي', price: 800, cost: 450 }, { id: 'X3', name: 'تذكرة أكوا بارك', price: 650, cost: 420 }],
      includes: 'الانتقالات بأتوبيس سياحي حديث مكيف ذهاب وعودة\nالإقامة 4 ليالٍ حسب نظام الفندق المختار\nمشرف مرافق طوال الرحلة\nجولة بالمدينة القديمة وخليج نعمة', excludes: 'الرحلات الاختيارية\nالإكراميات والمشروبات خارج النظام\nأي خدمات غير مذكورة',
      itinerary: 'اليوم 1: التجمع والسفر ليلاً\nاليوم 2: الوصول والتسكين وحرية الاستجمام\nاليوم 3: رحلة رأس محمد (اختياري)\nاليوم 4: سفاري أو أكوا بارك (اختياري) ومساءً خليج نعمة\nاليوم 5: إخلاء الغرف 12 ظهراً والعودة', supervisor: 'أ. كريم سامي', fixedCosts: [{ name: 'الأتوبيس ذهاب وعودة', amount: 42000 }, { name: 'بدل المشرف', amount: 3500 }] });
    const p2 = P({ code: 'DPR-002', kind: 'DAYTRIP', name: 'يوم في العين السخنة', city: 'العين السخنة', startDate: day(5), endDate: day(5), capacity: 49, seatPrice: 850, seatCost: 380, childSeatPrice: 650,
      transport: { type: 'BUS', seats: 49, supplierId: sBus.id, cost: 9000 }, childPolicy: { infantMax: 3, childMax: 10, infantPrice: 0 }, hotelOptions: [],
      pickups: [{ place: 'القاهرة – ميدان التحرير', time: '06:00' }, { place: 'التجمع الخامس – الجامعة الأمريكية', time: '06:40' }],
      extras: [{ id: 'X1', name: 'غداء بوفيه مفتوح', price: 350, cost: 220 }, { id: 'X2', name: 'رحلة بانانا بوت', price: 200, cost: 100 }],
      includes: 'الأتوبيس ذهاب وعودة\nدخول الشاطئ الخاص بالقرية\nمشرف الرحلة', excludes: 'الوجبات والمشروبات', fixedCosts: [{ name: 'الأتوبيس', amount: 9000 }], commissions: { default: 50 } });
    const p3 = P({ code: 'DPR-003', kind: 'CRUISE', name: 'الأقصر وأسوان – فندق عائم 4 ليالي', city: 'الأقصر', startDate: day(25), endDate: day(29), capacity: 30,
      transport: { type: 'TRAIN', seats: 0, cost: 0 }, childPolicy: { infantMax: 2, childMax: 12, infantPrice: 0, childNoBedPrice: 3500, childBedPrice: 5200, childNoBedCost: 2000, childBedCost: 3600 },
      hotelOptions: [{ hotelId: null, hotelName: 'فندق عائم 5 نجوم', board: 'FB', prices: { SGL: 21500, DBL: 15800 }, cost: { SGL: 16000, DBL: 11500 } }],
      extras: [{ id: 'X1', name: 'رحلة البالون فوق البر الغربي', price: 3200, cost: 2400 }, { id: 'X2', name: 'عرض الصوت والضوء بالكرنك', price: 900, cost: 600 }, { id: 'X3', name: 'زيارة أبو سمبل', price: 2500, cost: 1700 }],
      includes: 'قطار النوم القاهرة/الأقصر وأسوان/القاهرة\nالإقامة 4 ليالٍ بالفندق العائم إقامة كاملة\nالزيارات مع مرشد سياحي: الكرنك، الأقصر، وادي الملوك، إدفو، كوم أمبو، معبد فيلة، السد العالي\nتذاكر الدخول للمزارات المذكورة', excludes: 'الرحلات الاختيارية\nالإكراميات', fixedCosts: [{ name: 'المرشد السياحي المرافق', amount: 8000 }], commissions: { default: 300 } }); // train tickets are per person → inside the room cost
    S.counters.C_DPR = 3;
    const sys = { name: 'منة الله (سيلز)', role: 'OWNER', staffId: 'U1' };
    const mk = (d, who = sys) => { try { return createBooking(S, { ttl: 24, discountPct: 0, ...d }, who).booking; } catch (e) { return null; } };
    let ph = 0;
    const pax = (name) => [{ name, phone: '0128' + String(3000000 + (++ph) * 104729).slice(-7), nid: '' }]; // demo numbers never collide with Umrah customers
    const bks = [
      mk({ programId: p1.id, optIdx: 0, rooms: [{ type: 'DBL', adults: 2, children: [{ age: 7, bed: false }] }], pax: pax('عمرو حسن', '01001112233'), extras: { X1: 3 }, pickup: p1.pickups[0].place }),
      mk({ programId: p1.id, optIdx: 1, rooms: [{ type: 'TPL', adults: 3, children: [] }], pax: pax('سارة عبد الله', '01112223344'), pickup: p1.pickups[2].place }),
      mk({ programId: p1.id, optIdx: 0, rooms: [{ type: 'DBL', adults: 2, children: [] }, { type: 'DBL', adults: 2, children: [{ age: 1, bed: false }] }], pax: pax('أسرة محمود فؤاد', '01223334455'), extras: { X2: 4 }, agentId: 'A4', pickup: p1.pickups[1].place }),
      mk({ programId: p1.id, optIdx: 1, rooms: [{ type: 'SGL', adults: 1, children: [] }], pax: pax('نهى إبراهيم', '01009998877') }),
      mk({ programId: p2.id, rooms: [{ type: 'DBL', adults: 4, children: [{ age: 8 }] }], pax: pax('مجموعة شباب الجامعة', '01066554433'), extras: { X1: 5 }, pickup: p2.pickups[0].place }),
      mk({ programId: p2.id, rooms: [{ type: 'DBL', adults: 2, children: [] }], pax: pax('أحمد وعلا', '01277665544'), agentId: 'A1' }),
      mk({ programId: p3.id, optIdx: 0, rooms: [{ type: 'DBL', adults: 2, children: [] }], pax: pax('د. هالة مصطفى', '01011223344'), extras: { X1: 2, X3: 2 } }),
      mk({ hotel: { hotelId: h3.id, checkIn: day(8), checkOut: day(11), board: 'BB' }, rooms: [{ type: 'DBL', adults: 2, children: [{ age: 5, bed: true }] }], pax: pax('خالد رمضان', '01155667788') }),
      mk({ hotel: { hotelId: h2.id, checkIn: day(20), checkOut: day(24), board: 'HB' }, rooms: [{ type: 'DBL', adults: 2, children: [] }], pax: pax('شركة الأمل للمقاولات – رحلة موظفين', '01288776655'), discountPct: 5 }, { ...sys, role: 'SALES' }),
    ].filter(Boolean);
    const names = ['محمد السيد', 'رانيا كمال', 'إسلام عادل', 'هبة الله يحيى', 'طارق فهمي', 'منى الشافعي', 'يوسف جمال', 'دينا رأفت', 'حسام الدين علي', 'ريم أشرف'];
    names.forEach((n, i) => { const b = mk({ programId: i % 3 === 2 ? p2.id : p1.id, optIdx: i % 2, rooms: [{ type: i % 4 === 0 ? 'TPL' : 'DBL', adults: i % 4 === 0 ? 3 : 2, children: i % 5 === 1 ? [{ age: 9, bed: true }] : [] }], pax: pax(n), extras: i % 2 ? { X1: 2 } : {}, pickup: (i % 3 === 2 ? p2 : p1).pickups[i % 2].place }); if (b) bks.push(b); });
    mk({ programId: p3.id, optIdx: 0, rooms: [{ type: 'DBL', adults: 2, children: [] }, { type: 'DBL', adults: 2, children: [] }], pax: pax('أسرة عبد الحميد', '01099887766'), extras: { X2: 4 } });
    // seats for the Sharm bus, partial payments through the normal voucher cycle
    let seat = 1;
    for (const b of bks.filter((x) => x.programId === p1.id)) for (let i = 0; i < b.units.adults + b.units.chd; i++) b.seats.push(seat++);
    return { p1, p2, p3, h1, h2, h3, bookings: bks };
  }

  return { KINDS, BOARDS, ROOMS, TRANSPORT, CITIES, empty, normalize, uid, nights, program, hotel, costCenter, rateFor, stayPrice, paxType, priceBooking, capacityLeft,
    createBooking, cancelBooking, releaseExpired, seatMap, toggleSeat, programPnl, seedDemo };
});
