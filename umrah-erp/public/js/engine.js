/* =====================================================================
 * Umrah ERP — Domain Engine (pure logic, no DOM)
 * ---------------------------------------------------------------------
 * Every business rule the UI relies on lives here so it can be unit
 * tested in Node (see tests/engine.test.js) and mirrored 1:1 by the
 * PL/pgSQL guards in db/schema.sql:
 *   - Tri-currency costing + FX variance
 *   - Per-room-type cost / break-even / locked sell price
 *   - Discount authority matrix & soft-hold TTL lifecycle
 *   - B2B wallet + credit-limit gate, incentive kickback routing
 *   - Strict gender-lock bed allocation, private rooms, swap
 *   - Passport validity (6-month rule), bus auto-arrangement
 *   - Rooming list + trip P&L
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ enums
  const ROOM_TYPES = {
    DBL:   { cap: 2, ar: 'ثنائية',  en: 'Double' },
    TPL:   { cap: 3, ar: 'ثلاثية',  en: 'Triple' },
    QUAD:  { cap: 4, ar: 'رباعية',  en: 'Quad' },
    QUINT: { cap: 5, ar: 'خماسية', en: 'Quint' },
  };
  const CITIES = { MAK: { ar: 'مكة المكرمة', en: 'Makkah' }, MAD: { ar: 'المدينة المنورة', en: 'Madinah' } };
  const PAX_TYPES = {
    ADULT: { ar: 'بالغ بسرير', takesBed: true, takesSeat: true },
    CHD:   { ar: 'طفل بدون سرير', takesBed: false, takesSeat: true },
    INF:   { ar: 'رضيع', takesBed: false, takesSeat: false },
  };
  const SALE_MODES = {
    FULL_PACKAGE: 'باقة كاملة (تفريد أسرّة)',
    PRIVATE_ROOM: 'غرفة كاملة مغلقة (عائلة/مجموعة)',
    ROOM_ONLY:    'غرف فندقية فقط',
    UNBUNDLED:    'خدمات مجزأة (تسعير إداري)',
  };
  // Booking lifecycle. HOLD_STATES own beds tentatively and carry a TTL.
  const BOOKING_STATUS = {
    SOFT_HOLD:        { ar: 'معلق مؤقتاً',          bed: 'hold' },
    PENDING_APPROVAL: { ar: 'بانتظار اعتماد الخصم', bed: 'hold' },
    PENDING_PRICING:  { ar: 'بانتظار تسعير الإدارة', bed: 'hold' },
    DEPOSIT:          { ar: 'مؤكد جزئياً (عربون)',  bed: 'deposit' },
    CONFIRMED:        { ar: 'مؤكد بالكامل',          bed: 'confirmed' },
    EXPIRED:          { ar: 'منتهي (تحرر آلياً)',   bed: null },
    CANCELLED:        { ar: 'ملغي',                  bed: null },
  };
  const HOLD_STATES = ['SOFT_HOLD', 'PENDING_APPROVAL', 'PENDING_PRICING'];
  const LIVE_STATES = ['SOFT_HOLD', 'PENDING_APPROVAL', 'PENDING_PRICING', 'DEPOSIT', 'CONFIRMED'];
  const ROLES = {
    SALES:   { ar: 'موظف مبيعات', maxDiscount: 0 },
    HEAD:    { ar: 'رئيس قسم',    maxDiscount: 3 },
    MANAGER: { ar: 'مدير مبيعات', maxDiscount: 7 },
  };
  const HOLD_TTL_MIN_H = 2, HOLD_TTL_MAX_H = 24;
  const PASSPORT_STAGES = [
    { key: 'REP',        ar: 'مع المندوب' },
    { key: 'SAFE',       ar: 'بخزينة الشركة' },
    { key: 'CONSULATE',  ar: 'بالقنصلية/الغرفة' },
    { key: 'SUPERVISOR', ar: 'مع مشرف الرحلة' },
    { key: 'HANDED',     ar: 'تسليم المعتمر بالمطار' },
  ];

  // --------------------------------------------------------------- helpers
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const ceilTo = (n, step) => Math.ceil(n / step) * step;
  const DAY = 86400000;
  const toDate = (d) => (d instanceof Date ? d : new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')));
  const iso = (d) => { const x = toDate(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const addDays = (d, n) => { const x = new Date(toDate(d).getTime()); x.setDate(x.getDate() + n); return x; };
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
  const ageOn = (dob, on) => {
    const b = toDate(dob), o = toDate(on);
    let a = o.getFullYear() - b.getFullYear();
    if (o.getMonth() < b.getMonth() || (o.getMonth() === b.getMonth() && o.getDate() < b.getDate())) a--;
    return a;
  };

  // --------------------------------------------------------- FX & currency
  /** Convert any supported currency into EGP (the trip's reporting currency). */
  function toEGP(amount, currency, fxRate) {
    if (currency === 'EGP') return amount;
    if (currency === 'SAR') return amount * fxRate;
    throw new Error('Unsupported currency ' + currency);
  }
  /** FX Variance = Amount(SAR) × (FX_actual − FX_ref). Positive = loss (paid more EGP). */
  function fxVariance(amountSAR, fxRef, fxActual) {
    return round2(amountSAR * (fxActual - fxRef));
  }

  // ------------------------------------------------------- costing engine
  /**
   * Cost per pax by room type.
   * Accommodation (SAR, variable): room-night rate × nights ÷ capacity, per city.
   * Breakage reserve: % on accommodation (protects against unsold single beds).
   * Variable per-pax items: flights, visa, insurance, ground transport.
   * Fixed items: spread over the planned pax (break-even denominator).
   */
  function computeCosting(trip, allotments) {
    const fx = trip.fxRef;
    const mak = allotments.find((a) => a.id === trip.stays.MAK.allotmentId);
    const mad = allotments.find((a) => a.id === trip.stays.MAD.allotmentId);
    const nMak = trip.stays.MAK.nights, nMad = trip.stays.MAD.nights;

    let varAdultEGP = 0, varChildEGP = 0, varInfantEGP = 0, fixedEGP = 0;
    const lines = trip.costItems.map((it) => {
      const unitEGP = toEGP(it.unitPrice, it.currency, fx);
      if (it.behavior === 'FIXED') {
        const total = unitEGP * (it.qty || 1);
        fixedEGP += total;
        return { ...it, unitEGP, totalEGP: total };
      }
      varAdultEGP += unitEGP;
      varChildEGP += unitEGP * (it.childFactor ?? 1);
      varInfantEGP += unitEGP * (it.infantFactor ?? 0);
      return { ...it, unitEGP, totalEGP: unitEGP * trip.plannedPax };
    });
    const fixedShare = fixedEGP / Math.max(1, trip.plannedPax);

    const byType = {};
    for (const [type, meta] of Object.entries(ROOM_TYPES)) {
      const accomSAR = (mak.rates[type] * nMak + mad.rates[type] * nMad) / meta.cap;
      const breakageSAR = accomSAR * (trip.breakagePct / 100);
      const accomEGP = (accomSAR + breakageSAR) * fx;
      const cost = accomEGP + varAdultEGP + fixedShare;
      const sell = ceilTo(cost * (1 + trip.marginPct / 100), 250);
      byType[type] = {
        type, cap: meta.cap,
        accomSAR: round2(accomSAR), breakageSAR: round2(breakageSAR),
        accomEGP: round2(accomEGP), variableEGP: round2(varAdultEGP), fixedShareEGP: round2(fixedShare),
        costEGP: round2(cost), sellEGP: sell, marginEGP: round2(sell - cost),
        roomOnlyEGP: ceilTo(accomEGP * (1 + trip.marginPct / 100), 50),
      };
    }
    const chdCost = varChildEGP + fixedShare * (trip.childFixedFactor ?? 0.5);
    const infCost = varInfantEGP;
    return {
      lines, fixedEGP: round2(fixedEGP), fixedShareEGP: round2(fixedShare),
      varAdultEGP: round2(varAdultEGP), byType,
      child: { costEGP: round2(chdCost), sellEGP: ceilTo(chdCost * (1 + trip.marginPct / 100), 250) },
      infant: { costEGP: round2(infCost), sellEGP: ceilTo(infCost * (1 + trip.marginPct / 100), 250) },
      // Break-even: pax needed so contribution (sell − variable) covers fixed costs (QUAD mix proxy).
      breakEvenPax: Math.ceil(fixedEGP / Math.max(1, byType.QUAD.sellEGP - (byType.QUAD.accomEGP + varAdultEGP))),
    };
  }

  /** Official price list: the locked snapshot wins over live recalculation. */
  function priceList(state) {
    if (state.trip.lockedPrices) return state.trip.lockedPrices;
    const c = computeCosting(state.trip, state.allotments);
    const out = { CHD: c.child.sellEGP, INF: c.infant.sellEGP };
    for (const t of Object.keys(ROOM_TYPES)) { out[t] = c.byType[t].sellEGP; out['RO_' + t] = c.byType[t].roomOnlyEGP; }
    return out;
  }

  // --------------------------------------------------- sales governance
  function discountAuthority(user) {
    return ROLES[user.role] ? ROLES[user.role].maxDiscount : 0;
  }

  /**
   * Price a booking draft. Returns lines, totals and the governance verdict
   * (initial status + blocking reasons). Never mutates.
   */
  function priceBooking(state, draft) {
    const prices = priceList(state);
    const pax = draft.pax || [];
    const adults = pax.filter((p) => p.type === 'ADULT').length;
    const chd = pax.filter((p) => p.type === 'CHD').length;
    const inf = pax.filter((p) => p.type === 'INF').length;
    const reasons = [], warnings = [];
    const agent = draft.agentId ? state.agents.find((a) => a.id === draft.agentId) : null;
    const user = draft.userId ? state.users.find((u) => u.id === draft.userId) : null;

    if (draft.mode === 'UNBUNDLED') {
      return { lines: [], gross: null, discount: 0, incentiveDiscount: 0, net: null, adults, chd, inf,
        status: 'PENDING_PRICING', reasons: ['خدمات مجزأة: خانة السعر مقفلة بانتظار تسعير الإدارة'], warnings, agentCommission: 0 };
    }
    const unit = draft.mode === 'ROOM_ONLY' ? prices['RO_' + draft.roomType] : prices[draft.roomType];
    const lines = [{ label: `${adults} × ${draft.mode === 'ROOM_ONLY' ? 'سرير فقط' : 'باقة'} ${ROOM_TYPES[draft.roomType].ar}`, qty: adults, unit, total: unit * adults }];
    if (draft.mode === 'PRIVATE_ROOM' && adults < ROOM_TYPES[draft.roomType].cap) {
      // Private room: the empty beds are sold too (no breakage absorbed by company).
      const empty = ROOM_TYPES[draft.roomType].cap - adults;
      lines.push({ label: `${empty} × سرير شاغر بالغرفة المغلقة`, qty: empty, unit, total: unit * empty });
    }
    if (chd) lines.push({ label: `${chd} × طفل بدون سرير`, qty: chd, unit: prices.CHD, total: prices.CHD * chd });
    if (inf) lines.push({ label: `${inf} × رضيع`, qty: inf, unit: prices.INF, total: prices.INF * inf });
    let gross = lines.reduce((s, l) => s + l.total, 0);

    // Channel pricing: B2B agent sees NET rate; broker sees public price + commission badge.
    let channelDiscount = 0, agentCommission = 0;
    if (agent && agent.tier === 'B2B') channelDiscount = round2(gross * agent.netDiscountPct / 100);
    if (agent && agent.tier === 'BROKER') agentCommission = round2(gross * agent.commissionPct / 100);

    const discPct = Number(draft.discountPct || 0);
    const discount = round2((gross - channelDiscount) * discPct / 100);
    let status = 'SOFT_HOLD';
    if (discPct > 0) {
      const limit = user ? discountAuthority(user) : 0;
      if (discPct > limit) { status = 'PENDING_APPROVAL'; reasons.push(`خصم ${discPct}% يتجاوز صلاحية ${user ? user.name : 'القناة'} (${limit}%) — طلب اعتماد لمدير المبيعات`); }
    }
    const incentive = Number(draft.incentive || 0) * (adults + chd);
    const incentiveDiscount = draft.incentiveMode === 'CLIENT_DISCOUNT' ? incentive : 0;
    const net = round2(gross - channelDiscount - discount - incentiveDiscount);

    // B2B wallet / credit gate (self-booking settles from wallet instantly).
    if (agent && agent.tier === 'B2B') {
      const w = walletCheck(agent, net, state.fx.current);
      if (!w.ok) { reasons.push(w.reason); status = 'BLOCKED'; }
    }
    const paid = Number(draft.deposit || 0);
    if (status === 'SOFT_HOLD' && paid > 0) status = paid >= net ? 'CONFIRMED' : 'DEPOSIT';
    for (const p of pax) {
      const chk = passportCheck(p.passportExp, state.trip.returnDate);
      if (!chk.ok) warnings.push(`${p.nameAr || p.nameEn || 'مسافر'}: ${chk.message}`);
    }
    return { lines, gross, channelDiscount, discount, incentive, incentiveDiscount, net, adults, chd, inf, status, reasons, warnings, agentCommission };
  }

  function walletCheck(agent, amountEGP, fxRate) {
    if (agent.blocked) return { ok: false, reason: 'حساب الوكيل موقوف إدارياً' };
    if (agent.overdueDays > 0) return { ok: false, reason: `قفل ائتماني: متأخرات سداد منذ ${agent.overdueDays} يوم` };
    const amt = agent.currency === 'SAR' ? amountEGP / fxRate : amountEGP;
    const available = agent.balance + agent.creditLimit;
    if (amt > available) return { ok: false, reason: `تجاوز السقف الائتماني: المتاح ${round2(available)} ${agent.currency} والمطلوب ${round2(amt)} ${agent.currency}` };
    return { ok: true, amount: round2(amt), availableAfter: round2(available - amt) };
  }

  /** Apply a payment and re-derive status. Unbundled/approval gates are never bypassed by money. */
  function applyPayment(booking, amount) {
    booking.paid = round2((booking.paid || 0) + amount);
    if (booking.status === 'PENDING_APPROVAL' || booking.status === 'PENDING_PRICING') return booking;
    booking.status = booking.paid >= booking.net ? 'CONFIRMED' : booking.paid > 0 ? 'DEPOSIT' : 'SOFT_HOLD';
    if (booking.status !== 'SOFT_HOLD') booking.holdUntil = null;
    return booking;
  }

  function clampTTL(hours) { return Math.min(HOLD_TTL_MAX_H, Math.max(HOLD_TTL_MIN_H, Number(hours) || HOLD_TTL_MIN_H)); }

  /** Release expired soft-holds: status → EXPIRED, beds & bus seats freed. Returns released booking codes. */
  function releaseExpiredHolds(state, now) {
    const released = [];
    for (const b of state.bookings) {
      if (HOLD_STATES.includes(b.status) && b.holdUntil && b.holdUntil <= now && !b.pendingPay) { // a receipt awaiting approval pauses the TTL
        b.status = 'EXPIRED';
        freeBookingInventory(state, b.id);
        released.push(b.code);
      }
    }
    return released;
  }
  function freeBookingInventory(state, bookingId) {
    const paxIds = new Set(state.pax.filter((p) => p.bookingId === bookingId).map((p) => p.id));
    for (const bed of state.beds) if (bed.paxId && paxIds.has(bed.paxId)) bed.paxId = null;
    for (const r of state.rooms) if (r.privateBookingId === bookingId) { r.privateBookingId = null; if (!roomOccupancy(state, r.id)) r.gender = null; }
    for (const s of Object.keys(state.bus.seats)) if (paxIds.has(state.bus.seats[s])) delete state.bus.seats[s];
  }

  // -------------------------------------------------- bed allocation core
  const bookingOf = (state, pax) => state.bookings.find((b) => b.id === pax.bookingId);
  const bedsOfRoom = (state, roomId) => state.beds.filter((b) => b.roomId === roomId).sort((a, b) => a.no - b.no);
  function roomOccupancy(state, roomId) { return bedsOfRoom(state, roomId).filter((b) => b.paxId).length; }
  function bedOfPax(state, paxId, city) {
    return state.beds.find((b) => b.paxId === paxId && state.rooms.find((r) => r.id === b.roomId).city === city);
  }

  /**
   * THE gender-lock rule (mirrors fn_guard_bed_assignment in SQL).
   *  - Private room  → only pax of the owning booking, gender check skipped.
   *  - Shared room   → room must be opened (gender locked) and equal pax gender.
   *  - Only ADULT pax consume a physical bed.
   */
  function canPlace(state, room, pax) {
    if (!PAX_TYPES[pax.type].takesBed) return { ok: false, reason: 'الأطفال بدون سرير والرضع لا يشغلون سريراً فعلياً' };
    const bk = bookingOf(state, pax);
    if (!bk || !LIVE_STATES.includes(bk.status)) return { ok: false, reason: 'الحجز غير نشط' };
    if (state.roomingLocked[room.city]) return { ok: false, reason: 'كشف التسكين مقفل نهائياً لهذه المدينة' };
    if (room.privateBookingId) {
      return room.privateBookingId === pax.bookingId ? { ok: true } : { ok: false, reason: 'غرفة مغلقة لحجز آخر' };
    }
    if (bk.mode === 'PRIVATE_ROOM') return { ok: false, reason: 'حجز غرفة مغلقة لا يُسكن في غرف التفريد' };
    if (!room.gender) return { ok: false, reason: 'الغرفة غير مفتوحة — افتح غرفة تفريد وحدد جنسها أولاً' };
    if (room.gender !== pax.gender) return { ok: false, reason: `منع الاختلاط: الغرفة مقفلة ${room.gender === 'M' ? 'رجال' : 'سيدات'} فقط` };
    return { ok: true };
  }

  /** Rooms the operator is allowed to SEE for this pax (other gender rooms are hidden, not just disabled). */
  function visibleRoomsFor(state, city, pax, opts = {}) {
    const bk = bookingOf(state, pax);
    return state.rooms.filter((r) => {
      if (r.city !== city) return false;
      if (r.privateBookingId) return r.privateBookingId === pax.bookingId;
      if (!r.gender) return false; // pool rooms stay hidden until explicitly opened
      if (r.gender !== pax.gender || bk.mode === 'PRIVATE_ROOM') return false;
      if (opts.strictType && city === 'MAK' && r.type !== bk.roomType) return false;
      return roomOccupancy(state, r.id) < ROOM_TYPES[r.type].cap;
    });
  }

  function assignBed(state, bedId, paxId) {
    const bed = state.beds.find((b) => b.id === bedId);
    const room = state.rooms.find((r) => r.id === bed.roomId);
    const pax = state.pax.find((p) => p.id === paxId);
    if (bed.paxId) return { ok: false, reason: 'السرير مشغول' };
    const v = canPlace(state, room, pax);
    if (!v.ok) return v;
    const prev = bedOfPax(state, paxId, room.city);
    if (prev) prev.paxId = null; // a pax holds exactly one bed per city
    bed.paxId = paxId;
    return { ok: true };
  }

  function unassignBed(state, bedId) {
    const bed = state.beds.find((b) => b.id === bedId);
    const room = state.rooms.find((r) => r.id === bed.roomId);
    if (state.roomingLocked[room.city]) return { ok: false, reason: 'كشف التسكين مقفل' };
    bed.paxId = null;
    return { ok: true };
  }

  /** Pull a pool room from the trip's absorbed allotment and lock its gender. */
  function openSharedRoom(state, city, type, gender) {
    const room = state.rooms.find((r) => r.city === city && r.type === type && !r.gender && !r.privateBookingId && roomOccupancy(state, r.id) === 0);
    if (!room) return { ok: false, reason: `لا توجد غرف ${ROOM_TYPES[type].ar} متبقية في مخصص ${CITIES[city].ar}` };
    room.gender = gender;
    return { ok: true, room };
  }

  /** Close a whole room for one booking (family/group) and seat all its adults. Gender check is bypassed by design. */
  function assignPrivateRoom(state, city, bookingId, roomId) {
    const bk = state.bookings.find((b) => b.id === bookingId);
    const adults = state.pax.filter((p) => p.bookingId === bookingId && p.type === 'ADULT');
    const room = roomId ? state.rooms.find((r) => r.id === roomId)
      : state.rooms.filter((r) => r.city === city && !r.gender && !r.privateBookingId && roomOccupancy(state, r.id) === 0 && ROOM_TYPES[r.type].cap >= adults.length)
          .sort((a, b) => (a.type === bk.roomType ? -1 : 0) - (b.type === bk.roomType ? -1 : 0) || ROOM_TYPES[a.type].cap - ROOM_TYPES[b.type].cap)[0];
    if (!room) return { ok: false, reason: 'لا توجد غرفة فارغة بسعة كافية في المخصص' };
    if (roomOccupancy(state, room.id) > 0) return { ok: false, reason: 'الغرفة ليست فارغة' };
    if (ROOM_TYPES[room.type].cap < adults.length) return { ok: false, reason: 'سعة الغرفة أقل من عدد البالغين' };
    room.privateBookingId = bookingId; room.gender = 'P';
    const beds = bedsOfRoom(state, room.id);
    adults.forEach((p, i) => { const prev = bedOfPax(state, p.id, city); if (prev) prev.paxId = null; beds[i].paxId = p.id; });
    return { ok: true, room };
  }

  /** Operations swap: exchanges occupants of two beds, re-validating BOTH destinations. */
  function swapBeds(state, bedAId, bedBId) {
    const A = state.beds.find((b) => b.id === bedAId), B = state.beds.find((b) => b.id === bedBId);
    if (A.id === B.id) return { ok: false, reason: 'نفس السرير' };
    const rA = state.rooms.find((r) => r.id === A.roomId), rB = state.rooms.find((r) => r.id === B.roomId);
    if (rA.city !== rB.city) return { ok: false, reason: 'لا يمكن التبديل بين مدينتين' };
    if (state.roomingLocked[rA.city]) return { ok: false, reason: 'كشف التسكين مقفل' };
    const pA = A.paxId && state.pax.find((p) => p.id === A.paxId);
    const pB = B.paxId && state.pax.find((p) => p.id === B.paxId);
    if (!pA && !pB) return { ok: false, reason: 'السريران فارغان' };
    if (pA && rA.id !== rB.id) { const v = canPlace(state, rB, pA); if (!v.ok) return { ok: false, reason: `${pA.nameAr}: ${v.reason}` }; }
    if (pB && rA.id !== rB.id) { const v = canPlace(state, rA, pB); if (!v.ok) return { ok: false, reason: `${pB.nameAr}: ${v.reason}` }; }
    [A.paxId, B.paxId] = [B.paxId || null, A.paxId || null];
    return { ok: true };
  }

  /** No-bed pax (CHD/INF) follow the first adult of their booking in that city. */
  function attachedNoBedPax(state, roomId) {
    const room = state.rooms.find((r) => r.id === roomId);
    const bookingIds = new Set();
    for (const bed of bedsOfRoom(state, roomId)) {
      if (!bed.paxId) continue;
      const p = state.pax.find((x) => x.id === bed.paxId);
      const firstBed = state.pax.filter((x) => x.bookingId === p.bookingId && x.type === 'ADULT')
        .map((x) => bedOfPax(state, x.id, room.city)).find(Boolean);
      if (firstBed && firstBed.id === bed.id) bookingIds.add(p.bookingId);
    }
    return state.pax.filter((p) => bookingIds.has(p.bookingId) && !PAX_TYPES[p.type].takesBed && LIVE_STATES.includes(bookingOf(state, p).status));
  }

  function unassignedPax(state, city) {
    return state.pax.filter((p) => p.type === 'ADULT' && LIVE_STATES.includes(bookingOf(state, p).status)
      && bookingOf(state, p).mode !== 'UNBUNDLED' && !bedOfPax(state, p.id, city));
  }

  /** Breakage: empty beds inside opened shared rooms → published as free-sale beds for agents. */
  function breakage(state, city) {
    const out = [];
    for (const r of state.rooms) {
      if (r.city !== city || !r.gender || r.privateBookingId) continue;
      const free = ROOM_TYPES[r.type].cap - roomOccupancy(state, r.id);
      if (free > 0) out.push({ room: r, free });
    }
    return out;
  }

  function lockValidation(state, city) {
    const issues = [];
    const un = unassignedPax(state, city);
    if (un.length) issues.push(`${un.length} معتمر بدون سرير في ${CITIES[city].ar}`);
    const tentative = state.pax.filter((p) => bedOfPax(state, p.id, city) && HOLD_STATES.includes(bookingOf(state, p).status));
    if (tentative.length) issues.push(`${tentative.length} سرير بتسكين مبدئي غير مؤكد`);
    const virtual = state.rooms.filter((r) => r.city === city && roomOccupancy(state, r.id) > 0 && !r.physicalNo);
    if (virtual.length) issues.push(`${virtual.length} غرفة بكود افتراضي بدون رقم فعلي`);
    return issues;
  }

  // ---------------------------------------------------------- passports
  /** Passport must be valid ≥ 6 months after the RETURN date. */
  function passportCheck(expiry, returnDate) {
    if (!expiry) return { ok: false, level: 'missing', message: 'تاريخ انتهاء الجواز غير مسجل' };
    const limit = addDays(returnDate, 0); limit.setMonth(limit.getMonth() + 6);
    const exp = toDate(expiry);
    if (exp < toDate(returnDate)) return { ok: false, level: 'expired', message: 'الجواز منتهي قبل العودة' };
    if (exp < limit) return { ok: false, level: 'short', message: `صلاحية الجواز أقل من 6 أشهر (${iso(exp)})` };
    return { ok: true, level: 'ok', message: 'صالح' };
  }

  // ---------------------------------------------------------------- bus
  const BUS_LAYOUT = (() => {
    // 11 rows × (2 + aisle + 2) = 44 seats + rear bench of 5 = 49 passenger seats.
    const rows = [];
    let n = 1;
    for (let r = 0; r < 11; r++) { rows.push([n, n + 1, null, n + 2, n + 3]); n += 4; }
    rows.push([n, n + 1, n + 2, n + 3, n + 4]);
    return { rows, total: n + 4 };
  })();

  /** Families together, elderly (≥60) up front, singles grouped by gender so strangers of opposite gender never share a pair. */
  function autoArrangeBus(state) {
    const live = state.bookings.filter((b) => LIVE_STATES.includes(b.status) && b.mode !== 'UNBUNDLED' || (b.mode === 'UNBUNDLED' && (b.services || []).includes('BUS') && LIVE_STATES.includes(b.status)));
    const on = state.trip.departDate;
    const groups = live.map((b) => {
      const members = state.pax.filter((p) => p.bookingId === b.id && PAX_TYPES[p.type].takesSeat);
      const maxAge = Math.max(...members.map((p) => ageOn(p.dob, on)));
      return { b, members, maxAge, single: members.length === 1 };
    }).filter((g) => g.members.length);
    const families = groups.filter((g) => !g.single).sort((a, b) => (b.maxAge >= 60) - (a.maxAge >= 60) || b.maxAge - a.maxAge);
    const singles = groups.filter((g) => g.single).sort((a, b) => b.maxAge - a.maxAge);
    const elderlySingles = singles.filter((g) => g.maxAge >= 60);
    const otherSingles = singles.filter((g) => g.maxAge < 60);
    const byGender = (arr, gnd) => arr.filter((g) => g.members[0].gender === gnd);
    const ordered = [
      ...families.filter((g) => g.maxAge >= 60),
      ...byGender(elderlySingles, 'M'), ...byGender(elderlySingles, 'F'),
      ...families.filter((g) => g.maxAge < 60),
      ...byGender(otherSingles, 'M'), ...byGender(otherSingles, 'F'),
    ];
    const seats = {};
    let s = 1;
    const place = (p) => { if (s <= BUS_LAYOUT.total) seats[s++] = p.id; };
    let lastGender = null;
    for (const g of ordered) {
      // Start each new group (or gender switch among singles) on a fresh pair.
      const gnd = g.single ? g.members[0].gender : 'FAM';
      if (s % 2 === 0 && s <= 44 && (!g.single || gnd !== lastGender)) s++;
      g.members.forEach(place);
      lastGender = gnd;
    }
    state.bus.seats = seats;
    return seats;
  }

  // ------------------------------------------------------ rooming list
  function roomingList(state, city) {
    const rows = [];
    const rooms = state.rooms.filter((r) => r.city === city && roomOccupancy(state, r.id) > 0)
      .sort((a, b) => String(a.physicalNo || a.vcode).localeCompare(String(b.physicalNo || b.vcode), 'en', { numeric: true }));
    for (const r of rooms) {
      const occupants = bedsOfRoom(state, r.id).filter((b) => b.paxId).map((b) => state.pax.find((p) => p.id === b.paxId));
      for (const p of [...occupants, ...attachedNoBedPax(state, r.id)]) {
        rows.push({
          roomNo: r.physicalNo || r.vcode, roomType: ROOM_TYPES[r.type].en + (p.type === 'CHD' ? ' (+Child No-Bed)' : p.type === 'INF' ? ' (+Infant)' : ''),
          nameEn: p.nameEn, passport: p.passport, nationality: p.nationality, gender: p.gender === 'M' ? 'Male' : 'Female',
          borderNo: p.borderNo || '', dob: p.dob, paxId: p.id,
        });
      }
    }
    return rows;
  }

  // ---------------------------------------------------------- heatmap
  /** Per-day allotment picture: total / company / agents / held / free. */
  function heatmap(state, allotment) {
    const days = [];
    const tripStay = Object.values(state.trip.stays).find((s) => s.allotmentId === allotment.id);
    const city = allotment.city;
    const tripRooms = state.rooms.filter((r) => r.city === city);
    for (let d = toDate(allotment.from); d < toDate(allotment.to); d = addDays(d, 1)) {
      const key = iso(d);
      const base = allotment.days[key] || { company: 0, agents: 0, held: 0 };
      let company = base.company;
      const held = base.held + (allotment.b2bHeld[key] || 0);
      const inTrip = !!tripStay && key >= tripStay.checkIn && key < iso(addDays(tripStay.checkIn, tripStay.nights));
      let tripFreeBeds = 0, heldTrip = 0;
      if (inTrip) {
        company += tripRooms.length; // absorbed rooms are consumed from the allotment
        heldTrip = tripRooms.filter((r) => bedsOfRoom(state, r.id).some((b) => b.paxId &&
          HOLD_STATES.includes(bookingOf(state, state.pax.find((p) => p.id === b.paxId)).status))).length;
        tripFreeBeds = breakage(state, city).reduce((s, x) => s + x.free, 0);
      }
      const agents = base.agents + (allotment.b2bSold[key] || 0);
      const total = allotment.totalRooms;
      const free = Math.max(0, total - company - agents - held);
      const mult = allotment.priceOverrides[key] || 1;
      days.push({ date: key, total, company, agents, held, free, inTrip, tripFreeBeds, heldTrip, mult });
    }
    return days;
  }

  function cutoffRadar(allotments, today) {
    return allotments.map((a) => ({ a, daysLeft: daysBetween(today, a.cutoff) }))
      .map((x) => ({ ...x, level: x.daysLeft < 0 ? 'passed' : x.daysLeft <= 7 ? 'alert' : 'ok' }));
  }

  // --------------------------------------------------------------- P&L
  function tripPnL(state) {
    const t = state.trip;
    const live = state.bookings.filter((b) => ['DEPOSIT', 'CONFIRMED'].includes(b.status));
    const revenue = live.reduce((s, b) => s + (b.net || 0), 0);
    const collected = state.bookings.reduce((s, b) => s + (b.paid || 0), 0);
    const paxCount = state.pax.filter((p) => live.some((b) => b.id === p.bookingId));
    const adults = paxCount.filter((p) => p.type === 'ADULT').length;
    const chd = paxCount.filter((p) => p.type === 'CHD').length;
    const inf = paxCount.filter((p) => p.type === 'INF').length;

    // Committed hotel cost = every absorbed room × nights × SAR rate (occupied or not).
    let hotelSAR = 0;
    for (const city of ['MAK', 'MAD']) {
      const stay = t.stays[city]; const al = state.allotments.find((a) => a.id === stay.allotmentId);
      for (const r of state.rooms.filter((x) => x.city === city && (roomOccupancy(state, x.id) > 0 || x.gender))) hotelSAR += al.rates[r.type] * stay.nights;
    }
    let varSAR = 0, varEGP = 0, fixedSAR = 0, fixedEGP = 0;
    for (const it of t.costItems) {
      if (it.behavior === 'FIXED') { if (it.currency === 'SAR') fixedSAR += it.unitPrice * (it.qty || 1); else fixedEGP += it.unitPrice * (it.qty || 1); continue; }
      const units = adults + chd * (it.childFactor ?? 1) + inf * (it.infantFactor ?? 0);
      if (it.currency === 'SAR') varSAR += it.unitPrice * units; else varEGP += it.unitPrice * units;
    }
    const totalSAR = hotelSAR + varSAR + fixedSAR;
    const sarBudgetEGP = totalSAR * t.fxRef;
    // Actual EGP paid for SAR = settled portions at their own rates + unsettled at current market.
    const settledSAR = state.settlements.reduce((s, x) => s + x.amountSAR, 0);
    const settledEGP = state.settlements.reduce((s, x) => s + x.amountSAR * x.fxActual, 0);
    const openSAR = Math.max(0, totalSAR - settledSAR);
    const sarActualEGP = settledEGP + openSAR * state.fx.current;
    const fxLoss = round2(sarActualEGP - sarBudgetEGP);
    const commissions = state.bookings.filter((b) => ['DEPOSIT', 'CONFIRMED'].includes(b.status)).reduce((s, b) => s + (b.agentCommission || 0) + (b.incentiveMode === 'AGENT_CREDIT' ? b.incentive || 0 : 0), 0);
    const fieldExp = state.fieldExpenses.reduce((s, e) => s + toEGP(e.amount, e.currency, state.fx.current), 0);
    const directEGP = sarBudgetEGP + varEGP + fixedEGP;
    const operating = revenue - directEGP - commissions - fieldExp;
    const net = operating - fxLoss;
    return {
      revenue: round2(revenue), collected: round2(collected), receivable: round2(revenue - collected),
      hotelSAR: round2(hotelSAR), varSAR: round2(varSAR), fixedSAR: round2(fixedSAR), totalSAR: round2(totalSAR),
      sarBudgetEGP: round2(sarBudgetEGP), sarActualEGP: round2(sarActualEGP), varEGP: round2(varEGP), fixedEGP: round2(fixedEGP),
      commissions: round2(commissions), fieldExp: round2(fieldExp),
      operating: round2(operating), fxLoss, net: round2(net),
      marginPct: revenue ? round2((net / revenue) * 100) : 0, operatingMarginPct: revenue ? round2((operating / revenue) * 100) : 0,
      adults, chd, inf,
    };
  }

  // --------------------------------------------------------- whatsapp
  function waPhone(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) return d.slice(2);
    if (d.startsWith('01') && d.length === 11) return '2' + d;      // Egypt mobile
    if (d.startsWith('05') && d.length === 10) return '966' + d.slice(1); // KSA mobile
    return d;
  }
  function waLink(phone, text) { return `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`; }

  return {
    ROOM_TYPES, CITIES, PAX_TYPES, SALE_MODES, BOOKING_STATUS, HOLD_STATES, LIVE_STATES, ROLES, PASSPORT_STAGES,
    HOLD_TTL_MIN_H, HOLD_TTL_MAX_H, BUS_LAYOUT,
    round2, iso, addDays, daysBetween, ageOn, toEGP, fxVariance,
    computeCosting, priceList, discountAuthority, priceBooking, walletCheck, applyPayment, clampTTL,
    releaseExpiredHolds, freeBookingInventory,
    bedsOfRoom, roomOccupancy, bedOfPax, canPlace, visibleRoomsFor, assignBed, unassignBed, openSharedRoom,
    assignPrivateRoom, swapBeds, attachedNoBedPax, unassignedPax, breakage, lockValidation,
    passportCheck, autoArrangeBus, roomingList, heatmap, cutoffRadar, tripPnL, waPhone, waLink,
  };
});
