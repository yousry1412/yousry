/* =====================================================================
 * Umrah ERP — Company data model (v4)
 *  - One document per company: master data + accounting + many trips
 *  - "Mounting" a trip exposes its operational arrays (bookings, rooms, beds…)
 *    on the company object so the booking/allocation engine works unchanged
 *  - Migration v3 → v4, empty company template, coding, shared booking
 *    creation (browser + agent portal on the server), alerts centre
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./accounting.js'), require('./hr.js'), require('./dom.js'));
  else root.Model = factory(root.Engine, root.Acc, root.Hr, root.Dom);
})(typeof self !== 'undefined' ? self : this, function (E, Acc, Hr, Dom) {
  'use strict';
  const TRIP_KEYS = ['trip', 'bookings', 'pax', 'rooms', 'beds', 'bus', 'roomingLocked', 'settlements', 'fieldExpenses', 'docs'];
  /**
   * Country presets (applied when the country is chosen — every value stays editable, the accountant has the last word):
   * currency · dial code · VAT · withholding on supplier payments · stamp duty · income tax / zakat (estimate) · tourism regulator.
   */
  const COUNTRIES = {
    EG: { ar: 'مصر', currency: 'EGP', sym: 'ج.م', dial: '20', vat: 14, wht: 1, whtThreshold: 300, stamp: 0, income: 22.5, incomeLabel: 'ضريبة الدخل', regulator: 'وزارة السياحة والآثار — ترخيص شركة سياحة (فئة أ/ب/ج)', umrahAuth: 'قرعة/تنظيم العمرة — غرفة شركات السياحة' },
    SA: { ar: 'السعودية', currency: 'SAR', sym: 'ر.س', dial: '966', vat: 15, wht: 0, stamp: 0, income: 2.5, incomeLabel: 'الزكاة', regulator: 'وزارة السياحة — ترخيص وكالة سفر وسياحة', umrahAuth: 'وزارة الحج والعمرة — منصة نسك' },
    AE: { ar: 'الإمارات', currency: 'AED', sym: 'د.إ', dial: '971', vat: 5, wht: 0, stamp: 0, income: 9, incomeLabel: 'ضريبة الشركات', regulator: 'دائرة السياحة بالإمارة' },
    KW: { ar: 'الكويت', currency: 'KWD', sym: 'د.ك', dial: '965', vat: 0, wht: 0, stamp: 0, income: 0, incomeLabel: 'الزكاة', regulator: 'وزارة التجارة — ترخيص مكتب سياحة وسفر' },
    QA: { ar: 'قطر', currency: 'QAR', sym: 'ر.ق', dial: '974', vat: 0, wht: 0, stamp: 0, income: 10, incomeLabel: 'ضريبة الدخل', regulator: 'قطر للسياحة' },
    BH: { ar: 'البحرين', currency: 'BHD', sym: 'د.ب', dial: '973', vat: 10, wht: 0, stamp: 0, income: 0, incomeLabel: 'ضريبة الدخل', regulator: 'هيئة البحرين للسياحة والمعارض' },
    OM: { ar: 'عُمان', currency: 'OMR', sym: 'ر.ع', dial: '968', vat: 5, wht: 0, stamp: 0, income: 15, incomeLabel: 'ضريبة الدخل', regulator: 'وزارة التراث والسياحة' },
    JO: { ar: 'الأردن', currency: 'JOD', sym: 'د.أ', dial: '962', vat: 16, wht: 0, stamp: 0, income: 20, incomeLabel: 'ضريبة الدخل', regulator: 'وزارة السياحة والآثار' },
    IQ: { ar: 'العراق', currency: 'IQD', sym: 'د.ع', dial: '964', vat: 0, wht: 0, stamp: 0, income: 15, incomeLabel: 'ضريبة الدخل', regulator: 'هيئة السياحة' },
    LB: { ar: 'لبنان', currency: 'LBP', sym: 'ل.ل', dial: '961', vat: 11, wht: 0, stamp: 0, income: 17, incomeLabel: 'ضريبة الدخل', regulator: 'وزارة السياحة' },
    PS: { ar: 'فلسطين', currency: 'ILS', sym: '₪', dial: '970', vat: 16, wht: 0, stamp: 0, income: 15, incomeLabel: 'ضريبة الدخل', regulator: 'وزارة السياحة والآثار' },
    SD: { ar: 'السودان', currency: 'SDG', sym: 'ج.س', dial: '249', vat: 17, wht: 0, stamp: 0, income: 30, incomeLabel: 'ضريبة أرباح الأعمال', regulator: 'وزارة السياحة' },
    LY: { ar: 'ليبيا', currency: 'LYD', sym: 'د.ل', dial: '218', vat: 0, wht: 0, stamp: 0, income: 20, incomeLabel: 'ضريبة الدخل', regulator: 'وزارة السياحة' },
    TN: { ar: 'تونس', currency: 'TND', sym: 'د.ت', dial: '216', vat: 19, wht: 1.5, whtThreshold: 1000, stamp: 0, income: 15, incomeLabel: 'الضريبة على الشركات', regulator: 'الديوان الوطني التونسي للسياحة' },
    DZ: { ar: 'الجزائر', currency: 'DZD', sym: 'د.ج', dial: '213', vat: 19, wht: 0, stamp: 0, income: 26, incomeLabel: 'الضريبة على أرباح الشركات', regulator: 'وزارة السياحة' },
    MA: { ar: 'المغرب', currency: 'MAD', sym: 'د.م', dial: '212', vat: 20, wht: 0, stamp: 0, income: 20, incomeLabel: 'الضريبة على الشركات', regulator: 'وزارة السياحة' },
    TR: { ar: 'تركيا', currency: 'TRY', sym: '₺', dial: '90', vat: 20, wht: 0, stamp: 0.948, income: 25, incomeLabel: 'ضريبة الشركات', regulator: 'وزارة الثقافة والسياحة (TÜRSAB)' },
    PK: { ar: 'باكستان', currency: 'PKR', sym: 'Rs', dial: '92', vat: 16, wht: 0, stamp: 0, income: 29, incomeLabel: 'ضريبة الدخل', regulator: 'وزارة الشؤون الدينية (العمرة)' },
    ID: { ar: 'إندونيسيا', currency: 'IDR', sym: 'Rp', dial: '62', vat: 11, wht: 0, stamp: 0, income: 22, incomeLabel: 'ضريبة الدخل', regulator: 'وزارة الشؤون الدينية (PPIU)' },
    MY: { ar: 'ماليزيا', currency: 'MYR', sym: 'RM', dial: '60', vat: 8, wht: 0, stamp: 0, income: 24, incomeLabel: 'ضريبة الدخل', regulator: 'وزارة السياحة (MOTAC)' },
    OTHER: { ar: 'أخرى', currency: 'EGP', sym: '', dial: '', vat: 0, wht: 0, stamp: 0, income: 0, incomeLabel: 'ضريبة الدخل', regulator: '' },
  };
  const DOMAINS = { UMRAH: { ar: 'العمرة والحج', icon: '🕋' }, DOMESTIC: { ar: 'السياحة الداخلية', icon: '🏖️' } };
  /** Apply a country's presets to the company (does not touch the company name or legal data). */
  function applyCountry(c, country) {
    const p = COUNTRIES[country] || COUNTRIES.OTHER;
    Object.assign(c, { country, currency: p.currency, dial: p.dial, vatEnabled: p.vat > 0, vatRate: p.vat, whtEnabled: p.wht > 0, whtRate: p.wht, whtThreshold: p.whtThreshold || 0,
      stampEnabled: p.stamp > 0, stampRate: p.stamp, incomeTaxEnabled: p.income > 0, incomeTaxRate: p.income, incomeTaxLabel: p.incomeLabel });
    return c;
  }
  /** Fill company/branch fields introduced after the document was created. */
  function normalizeCompany(S) {
    const c = S.company, p = COUNTRIES[c.country] || COUNTRIES.OTHER;
    const def = { legalName: '', licenseCategory: '', currency: p.currency, dial: p.dial, domains: ['UMRAH'], whtEnabled: false, whtRate: p.wht, whtThreshold: p.whtThreshold || 0,
      stampEnabled: false, stampRate: p.stamp, incomeTaxEnabled: false, incomeTaxRate: p.income, incomeTaxLabel: p.incomeLabel, website: '', terms: '' };
    for (const [k, v] of Object.entries(def)) if (c[k] === undefined) c[k] = v;
    if (!Array.isArray(c.domains) || !c.domains.length) c.domains = ['UMRAH'];
    for (const b of S.branches) { if (!Array.isArray(b.domains)) b.domains = c.domains.slice(); if (b.phone === undefined) Object.assign(b, { phone: '', address: '', managerEmpId: null, active: true }); }
  }
  const hasDomain = (S, d, branchId) => (S.company.domains || ['UMRAH']).includes(d) && (!branchId || ((S.branches.find((b) => b.id === branchId) || {}).domains || [d]).includes(d));
  const TRIP_DOC_KINDS = { TICKETS: 'تذاكر الطيران', VISAS: 'التأشيرات', BARCODE: 'الباركود', ROOMING: 'كشوف الفنادق', OTHER: 'مستندات أخرى' };

  const emptyTripDoc = (trip) => ({ id: trip.id, trip, bookings: [], pax: [], rooms: [], beds: [], bus: { seats: {}, plate: '', driver: '' },
    roomingLocked: { MAK: false, MAD: false }, settlements: [], fieldExpenses: [], docs: [] });

  /** Expose trip-scoped arrays on the company object (non-enumerable → never serialised twice). */
  function mountTrip(S, tripId) {
    const doc = (S.trips || []).find((t) => t.id === tripId) || (S.trips || [])[0] || null;
    S.activeTripId = doc ? doc.id : null;
    for (const k of TRIP_KEYS) {
      Object.defineProperty(S, k, {
        configurable: true, enumerable: false,
        get: () => (doc ? doc[k] : k === 'trip' ? null : k === 'bus' ? { seats: {} } : k === 'roomingLocked' ? {} : []),
        set: (v) => { if (doc) doc[k] = v; },
      });
    }
    return doc;
  }
  const tripDocOf = (S, tripId) => S.trips.find((t) => t.id === tripId);
  const findBooking = (S, bookingId) => {
    for (const d of S.trips) { const b = d.bookings.find((x) => x.id === bookingId); if (b) return { doc: d, b }; }
    const db = S.dom && S.dom.bookings.find((x) => x.id === bookingId);
    if (db) return { doc: { trip: Dom.costCenter(S, db) }, b: db, domestic: true };
    return null;
  };
  /** Run fn with a given trip mounted, then restore the previous one. */
  function withTrip(S, tripId, fn) {
    const prev = S.activeTripId;
    mountTrip(S, tripId);
    try { return fn(tripDocOf(S, tripId)); } finally { mountTrip(S, prev); }
  }

  function nextCode(S, key, prefix, pad = 3) { return Acc.nextNo(S, 'C_' + key, prefix, pad); }

  function baseCompany(name, country = 'EG') {
    const c = COUNTRIES[country] || COUNTRIES.EG;
    return {
      version: 4,
      // presets come from the country, but every tax starts OFF until the owner/accountant confirms it in settings
      company: { ...applyCountry({ name: name || 'شركتي للسياحة', taxNo: '', commercialNo: '', address: '', phone: '', email: '', licenseNo: '' }, country), vatEnabled: false, whtEnabled: false, stampEnabled: false, domains: ['UMRAH'] },
      settings: { reminderDays: 3, holdAlertHours: 3, docsAlertDays: 14 },
      branches: [{ id: 'BR1', code: 'BR-01', name: 'الفرع الرئيسي', city: '' }],
      fx: { current: 13.0, global: null, history: [], alertSpreadPct: 3 },
      users: [], agents: [], suppliers: [], hotels: [], allotments: [], customers: [], employees: [],
      accounts: Acc.DEFAULT_ACCOUNTS.map((a) => ({ ...a })),
      expenseCategories: Acc.DEFAULT_EXPENSE_CATEGORIES.map((a) => ({ ...a })),
      cashboxes: [], vouchers: [], journal: [], counters: {}, trips: [], activeTripId: null, audit: [], hr: Hr.empty(), dom: Dom.empty(),
    };
  }
  function addCashbox(S, { name, type, currency, branchId, bankName, iban }) {
    const acc = Acc.addAccount(S, type === 'bank' ? '1102' : '1101', name);
    const cb = { id: 'CB' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), code: nextCode(S, type === 'bank' ? 'BNK' : 'CSH', type === 'bank' ? 'BNK' : 'CSH'),
      name, type: type === 'bank' ? 'bank' : 'cash', currency: currency || 'EGP', branchId: branchId || 'BR1', bankName: bankName || '', iban: iban || '', accountCode: acc.code };
    S.cashboxes.push(cb);
    return cb;
  }
  /** A clean company: chart of accounts, main cash box, no trips/bookings. */
  function emptyCompany(name, country) {
    const S = baseCompany(name, country);
    addCashbox(S, { name: 'الخزينة الرئيسية', type: 'cash' });
    mountTrip(S, null);
    return S;
  }

  function newTrip(S, p) {
    const id = 'T' + Date.now().toString(36);
    const yr = String(p.departDate || '').slice(0, 4) || String(new Date().getFullYear());
    const seq = Acc.nextNo(S, 'TRIP' + yr, 'x', 3).slice(2);
    const code = `TRP-${yr}-${seq}`;
    const makN = Number(p.makNights) || 5, madN = Number(p.madNights) || 4;
    const makIn = p.departDate, madIn = E.iso(E.addDays(p.departDate, makN));
    const trip = {
      id, code, costCenter: `CC-TRIP-${yr}-${seq}`, name: p.name || code, departDate: p.departDate, returnDate: E.iso(E.addDays(madIn, madN)),
      flight: p.flight || '', branchId: p.branchId || 'BR1', status: 'OPEN',
      stays: { MAK: { allotmentId: p.makAllotmentId, checkIn: makIn, nights: makN }, MAD: { allotmentId: p.madAllotmentId, checkIn: madIn, nights: madN } },
      fxRef: Number(p.fxRef) || S.fx.current, plannedPax: Number(p.plannedPax) || 40, marginPct: Number(p.marginPct) || 12, breakagePct: 2.5, childFixedFactor: 0.5,
      lockedPrices: null, costItems: [], supervisor: { name: '', phoneEG: '', phoneSA: '', userId: null }, housingUserId: null,
      bank: '', boardingPoints: ['مقر الشركة'], itinerary: [],
    };
    const doc = emptyTripDoc(trip);
    S.trips.push(doc);
    return doc;
  }
  /** Absorb N rooms of a type from the trip's allotment into a city (creates virtual rooms + beds). */
  function addTripRooms(doc, city, type, count) {
    const existing = doc.rooms.filter((r) => r.city === city && r.type === type).length;
    for (let i = 1; i <= count; i++) {
      const n = existing + i;
      const id = `R-${doc.id}-${city}-${type}-${n}`;
      doc.rooms.push({ id, city, type, vcode: `V-${city === 'MAK' ? 'MAK' : 'MED'}-${E.ROOM_TYPES[type].en}-${String(n).padStart(2, '0')}`, physicalNo: null, gender: null, privateBookingId: null });
      for (let b = 1; b <= E.ROOM_TYPES[type].cap; b++) doc.beds.push({ id: `${id}-B${b}`, roomId: id, no: b, paxId: null });
    }
  }

  // ------------------------------------------------------------ customers
  function findOrCreateCustomer(S, { name, phone, nid }) {
    const p = String(phone || '').replace(/\D/g, '');
    let c = p && S.customers.find((x) => String(x.phone || '').replace(/\D/g, '') === p);
    if (!c) {
      c = { id: 'CU' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), code: nextCode(S, 'CUS', 'CUS', 4), name, phone: phone || '', nid: nid || '', notes: '', createdAt: Date.now() };
      S.customers.push(c);
    }
    return c;
  }

  // --------------------------------------------- voucher side-effects
  function onVoucherPosted(S, v) {
    if (v.type === 'RV' && v.bookingId) {
      const f = findBooking(S, v.bookingId);
      if (f) {
        const egp = Acc.r2(v.amount * (v.currency === 'EGP' ? 1 : v.fx));
        E.applyPayment(f.b, egp);
        let left = egp;
        for (const i of f.b.installments || []) if (!i.paid && left + 0.01 >= i.amount) { i.paid = true; left -= i.amount; }
        f.b.pendingPay = S.vouchers.some((x) => x.status === 'PENDING' && x.bookingId === f.b.id);
        Acc.syncBooking(S, f.doc.trip, f.b, v.approvedBy);
      }
    }
    if (v.party && v.party.type === 'agent') {
      const a = S.agents.find((x) => x.id === v.party.id);
      if (a) {
        const amt = v.currency === a.currency ? v.amount : a.currency === 'SAR' ? v.amount * (v.currency === 'EGP' ? 1 / S.fx.current : 1) : v.amount * v.fx;
        if (v.type === 'RV' && !v.bookingId) { a.balance = Acc.r2(a.balance + amt); if (a.balance >= 0) a.overdueDays = 0; }
        if (v.type === 'PV') a.balance = Acc.r2(a.balance - amt);
      }
    }
    if (v.type === 'PV' && v.party && v.party.type === 'supplier' && v.currency === 'SAR' && v.tripId) {
      const d = tripDocOf(S, v.tripId);
      if (d) d.settlements.push({ id: v.id, supplierId: v.party.id, ref: v.no, amountSAR: v.amount, fxActual: v.fx, date: v.date });
    }
    if (v.type === 'EXP' && v.tripId) {
      const d = tripDocOf(S, v.tripId), cat = S.expenseCategories.find((c) => c.id === v.categoryId);
      if (d) d.fieldExpenses.push({ id: v.id, label: `${cat ? cat.name : 'مصروف'} — ${v.memo || v.no}`, amount: v.amount, currency: v.currency });
    }
  }
  function onVoucherClosed(S, v) {
    if (v.bookingId) { const f = findBooking(S, v.bookingId); if (f) f.b.pendingPay = S.vouchers.some((x) => x.status === 'PENDING' && x.bookingId === f.b.id); }
  }
  const approve = (S, id, actor) => Acc.approveVoucher(S, id, actor, { onPosted: (v) => onVoucherPosted(S, v) });
  const reject = (S, id, actor, reason) => { const v = Acc.rejectVoucher(S, id, actor, reason); onVoucherClosed(S, v); return v; };
  function createVoucher(S, data, actor) {
    const v = Acc.createVoucher(S, { ...data, autoPost: false }, actor);
    if (v.bookingId) { const f = findBooking(S, v.bookingId); if (f) f.b.pendingPay = true; }
    if (data.autoPost && Acc.canApprove(actor.role)) approve(S, v.id, actor);
    return v;
  }

  // ------------------------------------------------ shared booking creation
  /**
   * Creates a booking on the MOUNTED trip. Used by the staff screen and by the
   * agent portal (server side), so both follow exactly the same rules.
   * actor: { name, role, staffId?, agentId? }
   */
  function createBooking(S, d, actor) {
    const input = {
      ...d, userId: d.channel === 'DIRECT' ? actor.staffId : null, agentId: d.channel === 'DIRECT' ? null : d.agentId,
      discountPct: d.channel === 'B2B' ? 0 : Number(d.discountPct || 0), incentive: d.channel === 'DIRECT' ? 0 : Number(d.incentive || 0),
      commissionAdj: actor.role === 'OWNER' && d.channel === 'BROKER' ? Number(d.commissionAdj || 0) : 0, // +/− on the agent commission: owner only
    };
    const v = E.priceBooking(S, input);
    if (v.status === 'BLOCKED') throw new Error(v.reasons.join(' · '));
    if (!d.pax.length || d.pax.some((p) => !String(p.nameAr || '').trim() || !String(p.nameEn || '').trim())) throw new Error('أدخل الاسم بالعربية والإنجليزية لكل مسافر');
    if (!d.pax.some((p) => p.type === 'ADULT')) throw new Error('يجب وجود بالغ واحد على الأقل');
    const adults = d.pax.filter((p) => p.type === 'ADULT').length;
    if (d.mode === 'PRIVATE_ROOM' && adults > E.ROOM_TYPES[d.roomType].cap) throw new Error(`عدد البالغين (${adults}) أكبر من سعة الغرفة`);
    const services = d.mode === 'UNBUNDLED' ? Object.keys(d.services || {}).filter((k) => d.services[k]) : [];
    if (d.mode === 'UNBUNDLED' && !services.length) throw new Error('اختر خدمة واحدة على الأقل');
    const now = Date.now();
    const lead = d.pax.find((p) => p.type === 'ADULT');
    const customer = d.channel === 'B2B' ? null : findOrCreateCustomer(S, { name: lead.nameAr, phone: lead.phone, nid: lead.nid });
    const b = {
      id: 'B' + now.toString(36) + Math.random().toString(36).slice(2, 5), code: Acc.nextNo(S, 'BK', 'BK', 5), channel: d.channel, userId: input.userId, agentId: input.agentId,
      customerId: customer ? customer.id : null, branchId: d.branchId || (S.trip && S.trip.branchId) || 'BR1', mode: d.mode, roomType: d.roomType, services,
      status: v.status, net: v.net, paid: 0, discountPct: input.discountPct || 0, incentive: v.incentive || 0, incentiveMode: d.channel === 'DIRECT' ? null : d.incentiveMode,
      agentCommission: v.agentCommission || 0, commissionBase: v.commission ? v.commission.base : 0, commissionAdj: input.commissionAdj || 0,
      commissionLog: input.commissionAdj ? [{ adj: input.commissionAdj, note: d.commissionNote || '', by: actor.name, at: now }] : [],
      holdUntil: null, createdAt: now, createdBy: actor.name, installments: [], notes: d.notes || '',
    };
    const agent = input.agentId ? S.agents.find((a) => a.id === input.agentId) : null;
    if (agent && agent.tier === 'B2B') {
      const w = E.walletCheck(agent, v.net, S.fx.current);
      if (!w.ok) throw new Error(w.reason);
      agent.balance = Acc.r2(agent.balance - w.amount);
      b.paid = v.net; b.status = 'CONFIRMED';
    }
    if (E.HOLD_STATES.includes(b.status)) b.holdUntil = now + E.clampTTL(d.ttl || 24) * 3600000;
    S.bookings.push(b);
    const paxIds = d.pax.map((p, i) => {
      const id = 'P' + now.toString(36) + i;
      S.pax.push({ nameAr: p.nameAr, nameEn: String(p.nameEn || '').toUpperCase(), gender: p.gender, type: p.type, dob: p.dob || '', passport: p.passport || '', passportExp: p.passportExp || '',
        nid: p.nid || '', borderNo: p.borderNo || '', phone: p.phone || '', photoFileId: p.photoFileId || null, passportFileId: p.passportFileId || null,
        id, bookingId: b.id, nationality: 'EGYPTIAN', vault: { stage: 0, log: [{ stage: 0, at: now, by: actor.name }] }, boarding: 0 });
      return id;
    });
    Acc.syncBooking(S, S.trip, b, actor.name);
    // Deposit paid now → receipt voucher (auto-posted for approvers, pending with proof for everyone else)
    const dep = Number(d.deposit || 0);
    if (dep > 0 && b.net && d.channel !== 'B2B') {
      createVoucher(S, { type: 'RV', amount: dep, cashboxId: d.cashboxId || (S.cashboxes[0] && S.cashboxes[0].id), party: customer ? { type: 'customer', id: customer.id } : { type: 'agent', id: b.agentId },
        bookingId: b.id, tripId: S.trip.id, branchId: b.branchId, memo: `عربون حجز ${b.code}`, fileIds: d.depositFileIds || [], autoPost: true }, actor);
    }
    if (b.status === 'DEPOSIT' || (b.net && b.paid < b.net && b.channel !== 'B2B')) {
      const rest = Acc.r2(b.net - b.paid);
      if (rest > 0) b.installments = [
        { due: E.iso(E.addDays(S.trip.departDate, -21)), amount: Math.round(rest / 2), paid: false, label: 'القسط الأول' },
        { due: E.iso(E.addDays(S.trip.departDate, -10)), amount: rest - Math.round(rest / 2), paid: false, label: 'القسط الأخير' }];
    }
    if (d.mode === 'PRIVATE_ROOM') { E.assignPrivateRoom(S, 'MAK', b.id); E.assignPrivateRoom(S, 'MAD', b.id); }
    return { booking: b, paxIds, pricing: v };
  }

  // ------------------------------------------------------------ alerts
  function alerts(S, role, opts = {}) {
    const out = [], now = Date.now(), today = E.iso(new Date());
    const soon = E.iso(E.addDays(new Date(), S.settings.reminderDays || 3));
    const approver = Acc.canApprove(role);
    if (approver) {
      const pend = S.vouchers.filter((v) => v.status === 'PENDING');
      for (const v of pend) out.push({ level: 'warn', group: 'مالية', text: `${Acc.VOUCHER_TYPES[v.type]} ${v.no} بمبلغ ${Math.round(v.amount)} ${v.currency} بانتظار الاعتماد (${v.createdBy})`, page: 'vouchers', ref: v.id });
      for (const cb of S.cashboxes) { const bal = Acc.cashboxBalance(S, cb); if (bal < 0) out.push({ level: 'err', group: 'مالية', text: `رصيد ${cb.name} بالسالب (${Math.round(bal)})`, page: 'treasury' }); }
      const fx = fxInfo(S);
      if (fx.alert) out.push({ level: 'warn', group: 'مالية', text: `سعر الصرف التنفيذي ${fx.exec} يختلف عن العالمي ${fx.global} بنسبة ${fx.spreadPct > 0 ? '+' : ''}${fx.spreadPct}% (الحد ${fx.threshold}%) — راجع السعر`, page: 'fx' });
      for (const a of S.agents) if (a.tier === 'B2B' && a.balance < -a.creditLimit * 0.9) out.push({ level: 'warn', group: 'مالية', text: `الوكيل ${a.name} قارب/تجاوز السقف الائتماني`, page: 'agents' });
    }
    if (Hr.HR_ADMINS.includes(role) && S.hr) {
      const g = 'الموارد البشرية', month = today.slice(0, 7);
      for (const l of S.hr.leaves.filter((x) => x.status === 'PENDING')) { const e = S.employees.find((x) => x.id === l.empId); out.push({ level: 'warn', group: g, text: `طلب إجازة ${Hr.LEAVE_TYPES[l.type]} من ${e ? e.name : ''} (${l.from} ← ${l.to}) بانتظار قرارك`, page: 'hrLeaves', ref: l.id }); }
      for (const e of Hr.activeEmps(S)) for (const f of Hr.flags(S, e, month, today)) out.push({ level: f.level, group: g, text: `${e.name}: ${f.text}`, page: 'hrEmployee', ref: e.id });
    }
    if (S.dom) {
      const g = 'السياحة الداخلية';
      for (const b of S.dom.bookings) {
        if (!E.LIVE_STATES.includes(b.status)) continue;
        const p = b.programId ? S.dom.programs.find((x) => x.id === b.programId) : null;
        const start = p ? p.startDate : b.hotel && b.hotel.checkIn;
        const due = Acc.r2((b.net || 0) - (b.paid || 0));
        if (due > 0 && start && start <= soon) out.push({ level: start <= today ? 'err' : 'warn', group: g, text: `${b.code}: متبقي ${Math.round(due)} والسفر ${start}`, page: 'domBookingView', ref: b.id });
        if (E.HOLD_STATES.includes(b.status) && b.holdUntil && b.holdUntil - now < (S.settings.holdAlertHours || 3) * 3600000) out.push({ level: 'warn', group: g, text: `${b.code}: ينتهي التعليق خلال ${Math.max(0, Math.round((b.holdUntil - now) / 60000))} دقيقة`, page: 'domBookingView', ref: b.id });
        if (b.status === 'PENDING_APPROVAL' && role === 'OWNER') out.push({ level: 'warn', group: g, text: `${b.code}: خصم ${b.discountPct}% بانتظار اعتمادك`, page: 'domBookingView', ref: b.id });
        if (b.kind === 'HOTEL' && b.status === 'CONFIRMED' && !(b.hotel && b.hotel.confirmationNo)) out.push({ level: 'info', group: g, text: `${b.code}: سجّل رقم تأكيد الفندق`, page: 'domBookingView', ref: b.id });
        if (p && p.kind !== 'DAYTRIP' && (p.transport || {}).seats && (b.seats || []).length < b.units.adults + b.units.chd && start <= soon) out.push({ level: 'info', group: g, text: `${b.code}: لم تُحدد كل مقاعد الأتوبيس`, page: 'domBookingView', ref: b.id });
      }
    }
    for (const doc of S.trips) {
      const t = doc.trip;
      if (t.status === 'CLOSED') continue;
      const tl = t.code;
      for (const b of doc.bookings) {
        if (!E.LIVE_STATES.includes(b.status)) continue;
        const ref = { page: 'bookingView', ref: b.id, tripId: doc.id };
        if (E.HOLD_STATES.includes(b.status) && b.holdUntil && b.holdUntil - now < (S.settings.holdAlertHours || 3) * 3600000 && !b.pendingPay)
          out.push({ level: 'warn', group: 'حجوزات', text: `${tl} · ${b.code}: التعليق ينتهي قريباً ويتحرر السرير`, ...ref });
        if (b.status === 'PENDING_APPROVAL' && ['OWNER', 'MANAGER', 'HEAD'].includes(role)) out.push({ level: 'warn', group: 'حجوزات', text: `${tl} · ${b.code}: خصم ${b.discountPct}% بانتظار اعتمادك`, ...ref });
        if (b.status === 'PENDING_PRICING' && ['OWNER', 'MANAGER'].includes(role)) out.push({ level: 'warn', group: 'حجوزات', text: `${tl} · ${b.code}: خدمات مجزأة بانتظار التسعير`, ...ref });
        for (const i of b.installments || []) {
          if (i.paid) continue;
          if (i.due < today) out.push({ level: 'err', group: 'تحصيل', text: `${tl} · ${b.code}: ${i.label} متأخر منذ ${i.due} (${Math.round(i.amount)} ج.م)`, ...ref });
          else if (i.due <= soon) out.push({ level: 'warn', group: 'تحصيل', text: `${tl} · ${b.code}: ${i.label} يستحق ${i.due} (${Math.round(i.amount)} ج.م)`, ...ref });
        }
        const px = doc.pax.filter((p) => p.bookingId === b.id);
        const missing = px.filter((p) => !p.photoFileId || !p.passportFileId).length;
        if (missing) out.push({ level: 'info', group: 'مستندات', text: `${tl} · ${b.code}: ${missing} مسافر بدون صورة شخصية/صورة جواز`, ...ref });
        for (const p of px) { const c = E.passportCheck(p.passportExp, t.returnDate); if (!c.ok) out.push({ level: 'err', group: 'مستندات', text: `${tl} · ${b.code}: ${p.nameAr} — ${c.message}`, ...ref }); }
      }
      const daysToGo = E.daysBetween(today, t.departDate);
      if (daysToGo >= 0 && daysToGo <= (S.settings.docsAlertDays || 14)) {
        for (const k of ['TICKETS', 'VISAS', 'BARCODE']) if (!(doc.docs || []).some((x) => x.kind === k))
          out.push({ level: 'warn', group: 'ملفات الرحلة', text: `${tl}: لم يُرفع ملف ${TRIP_DOC_KINDS[k]} — السفر بعد ${daysToGo} يوم`, page: 'tripfiles', tripId: doc.id });
      }
    }
    const rank = { err: 0, warn: 1, info: 2 };
    out.sort((a, b) => rank[a.level] - rank[b.level]);
    if (opts.agentId) return out.filter((a) => a.group !== 'مالية');
    return out;
  }

  // -------------------------------------------------------- migration
  /** v3 (single-trip demo document) → v4 company document with full accounting history. */
  function migrateV3(s3, companyName) {
    const S = baseCompany(companyName || 'شركة مدار للسياحة (بيانات تجريبية)', 'EG');
    Object.assign(S, { fx: { current: s3.fx.current, global: null, history: [], alertSpreadPct: 3 }, users: s3.users, agents: s3.agents, allotments: s3.allotments, audit: s3.audit || [] });
    S.suppliers = s3.suppliers.map((x) => ({ ...x, code: nextCode(S, 'SUP', 'SUP'), phone: '', taxNo: '' }));
    for (const a of S.allotments) {
      const h = { id: 'H' + a.id, code: nextCode(S, 'HTL_' + a.city, `HTL-${a.city}`), city: a.city, name: a.hotel, nameEn: a.hotelEn, supplierId: a.supplierId, stars: 5, distance: '' };
      S.hotels.push(h); a.hotelId = h.id;
    }
    S.agents.forEach((a) => { a.code = a.code || nextCode(S, 'AGT', 'AGT'); });
    S.employees = [
      { id: 'EM1', code: 'EMP-001', name: 'منة الله محمد', job: 'موظفة مبيعات', phone: '01011112222', salary: 9000, branchId: 'BR1' },
      { id: 'EM2', code: 'EMP-002', name: 'شريف عادل', job: 'رئيس قسم المبيعات', phone: '01033334444', salary: 14000, branchId: 'BR1' },
      { id: 'EM3', code: 'EMP-003', name: 'محمد عبد الرحيم', job: 'مشرف رحلات', phone: '01005556677', salary: 11000, branchId: 'BR1' },
    ];
    S.counters.C_EMP = 3;
    S.branches.push({ id: 'BR2', code: 'BR-02', name: 'فرع الإسكندرية', city: 'الإسكندرية' });
    const cash = addCashbox(S, { name: 'الخزينة الرئيسية', type: 'cash' });
    const bank = addCashbox(S, { name: 'بنك مصر - جاري', type: 'bank', bankName: 'بنك مصر', iban: 'EG000000000000001230001234567' });
    addCashbox(S, { name: 'خزينة فرع الإسكندرية', type: 'cash', branchId: 'BR2' });
    const trip = { ...s3.trip, branchId: 'BR1', status: 'OPEN', housingUserId: null, supervisor: { ...s3.trip.supervisor, userId: null } };
    const doc = { id: trip.id, trip, bookings: s3.bookings, pax: s3.pax, rooms: s3.rooms, beds: s3.beds, bus: s3.bus, roomingLocked: s3.roomingLocked,
      settlements: [], fieldExpenses: [], docs: [] };
    S.trips.push(doc);
    mountTrip(S, doc.id);
    const sys = { name: 'ترحيل افتتاحي', role: 'OWNER' };
    const d0 = E.iso(E.addDays(new Date(s3.seededAt || Date.now()), -30));
    Acc.post(S, { date: d0, memo: 'رأس المال الافتتاحي', source: { type: 'OPEN' }, lines: [{ acc: bank.accountCode, dr: 1500000 }, { acc: cash.accountCode, dr: 250000 }, { acc: '3101', cr: 1750000 }], by: sys.name });
    // Agent wallets opening balances (prepaid = credit, debt = debit)
    for (const a of S.agents.filter((x) => x.tier === 'B2B')) {
      const egpDebits = doc.bookings.filter((b) => b.agentId === a.id).reduce((s, b) => s + b.net, 0);
      const bal = a.currency === 'SAR' ? a.balance * S.fx.current : a.balance;
      const opening = Acc.r2(bal + egpDebits);
      if (opening > 0) Acc.post(S, { date: d0, memo: `شحن محفظة افتتاحي – ${a.name}`, source: { type: 'OPEN' }, lines: [{ acc: bank.accountCode, dr: opening }, { acc: '1104', cr: opening, party: { type: 'agent', id: a.id } }], by: sys.name });
      if (opening < 0) Acc.post(S, { date: d0, memo: `رصيد مدين افتتاحي – ${a.name}`, source: { type: 'OPEN' }, lines: [{ acc: '1104', dr: -opening, party: { type: 'agent', id: a.id } }, { acc: '3101', cr: -opening }], by: sys.name });
    }
    for (const b of doc.bookings) {
      b.branchId = 'BR1';
      const lead = doc.pax.find((p) => p.bookingId === b.id && p.type === 'ADULT');
      if (b.channel !== 'B2B' && lead) b.customerId = findOrCreateCustomer(S, { name: lead.nameAr, phone: lead.phone, nid: lead.nid }).id;
      b.code = b.code.replace('BK-', 'BK-0');
      const paid = b.channel === 'B2B' ? 0 : b.paid;
      b.paid = b.channel === 'B2B' ? b.paid : 0;
      const status = b.status;
      Acc.syncBooking(S, trip, b, sys.name);
      if (paid > 0) {
        const v = Acc.createVoucher(S, { type: 'RV', amount: paid, cashboxId: bank.id, party: b.customerId ? { type: 'customer', id: b.customerId } : { type: 'agent', id: b.agentId },
          bookingId: b.id, tripId: trip.id, branchId: 'BR1', memo: `سداد حجز ${b.code}`, method: 'إيداع بنكي', date: E.iso(new Date(b.createdAt)) }, sys);
        Acc.approveVoucher(S, v.id, sys);
        b.paid = paid; b.status = status;
      }
    }
    counterFromCodes(S, 'BK', doc.bookings.map((b) => b.code));
    for (const st of s3.settlements || []) {
      const v = Acc.createVoucher(S, { type: 'PV', amount: st.amountSAR, currency: 'SAR', fx: st.fxActual, cashboxId: bank.id, party: { type: 'supplier', id: st.supplierId },
        tripId: trip.id, memo: st.ref, date: st.date }, sys);
      v.refFx = trip.fxRef; approve(S, v.id, sys);
    }
    for (const fe of s3.fieldExpenses || []) {
      const v = Acc.createVoucher(S, { type: 'EXP', amount: fe.amount, currency: fe.currency, fx: fe.currency === 'SAR' ? S.fx.current : 1, cashboxId: cash.id, categoryId: 'EC8', tripId: trip.id, memo: fe.label }, sys);
      approve(S, v.id, sys);
    }
    // Supplier bills for the trip's committed hotel cost
    for (const city of ['MAK', 'MAD']) {
      const st = trip.stays[city], al = S.allotments.find((a) => a.id === st.allotmentId);
      const sar = doc.rooms.filter((r) => r.city === city && (r.gender || r.privateBookingId)).reduce((s, r) => s + al.rates[r.type] * st.nights, 0);
      const v = Acc.createVoucher(S, { type: 'BILL', amount: sar, currency: 'SAR', fx: trip.fxRef, party: { type: 'supplier', id: al.supplierId }, accountCode: '5101', tripId: trip.id, memo: `فاتورة ${al.hotel}` }, sys);
      Acc.approveVoucher(S, v.id, sys);
    }
    // Remaining trip cost items: supplier bills (or cash expenses when there is no supplier)
    const livePax = doc.pax.filter((p) => ['DEPOSIT', 'CONFIRMED'].includes(doc.bookings.find((b) => b.id === p.bookingId).status));
    const cnt = (t) => livePax.filter((p) => p.type === t).length;
    const COST_ACC = { AIR: '5102', VISA: '5103', TRANSPORT: '5104', OPEX: '5105', HOTEL: '5101' };
    for (const it of trip.costItems) {
      const units = it.behavior === 'FIXED' ? it.qty || 1 : cnt('ADULT') + cnt('CHD') * (it.childFactor ?? 1) + cnt('INF') * (it.infantFactor ?? 0);
      const amount = Acc.r2(it.unitPrice * units);
      if (!amount) continue;
      const fx = it.currency === 'SAR' ? trip.fxRef : 1;
      if (it.supplierId) {
        const v = Acc.createVoucher(S, { type: 'BILL', amount, currency: it.currency, fx, party: { type: 'supplier', id: it.supplierId }, accountCode: COST_ACC[it.cat] || '5105', tripId: trip.id, memo: it.name }, sys);
        Acc.approveVoucher(S, v.id, sys);
      } else {
        const v = Acc.createVoucher(S, { type: 'EXP', amount, currency: it.currency, fx, cashboxId: cash.id, categoryId: 'EC8', tripId: trip.id, memo: it.name }, sys);
        Acc.approveVoucher(S, v.id, sys);
      }
    }
    // A pending receipt uploaded by a sales rep, to showcase the approval cycle
    const pendingB = doc.bookings.find((b) => b.code === 'BK-01015');
    if (pendingB) createVoucher(S, { type: 'RV', amount: 15000, cashboxId: bank.id, party: { type: 'customer', id: pendingB.customerId }, bookingId: pendingB.id, tripId: trip.id, memo: 'القسط الأول — إيصال إيداع مرفوع من السيلز', method: 'إيداع بنكي' }, { name: 'منة الله (سيلز)', role: 'SALES' });
    Hr.seedDemo(S, s3.seededAt || Date.now());
    // domestic tourism demo: both lines of business, programs, hotels, bookings with approved payments
    S.company.domains = ['UMRAH', 'DOMESTIC']; for (const b of S.branches) b.domains = ['UMRAH', 'DOMESTIC'];
    const dm = Dom.seedDemo(S, s3.seededAt || Date.now());
    dm.bookings.forEach((b, i) => {
      if (b.status === 'CONFIRMED' || b.status === 'PENDING_APPROVAL' || i % 3 === 2) return;
      const amt = i % 2 ? b.net : Math.round(b.net * 0.4);
      const v = createVoucher(S, { type: 'RV', amount: amt, cashboxId: cash.id, party: { type: 'customer', id: b.customerId }, bookingId: b.id, tripId: Dom.costCenter(S, b).id, memo: `${i % 2 ? 'سداد كامل' : 'عربون'} ${b.code}`, method: 'نقدي' }, { name: 'منة الله (سيلز)', role: 'SALES' });
      approve(S, v.id, sys);
    });
    return S;
  }
  function counterFromCodes(S, key, codes) {
    const max = Math.max(0, ...codes.map((c) => Number(String(c).replace(/\D/g, '')) || 0));
    S.counters[key] = Math.max(S.counters[key] || 0, max);
  }

  /** Normalise any stored document to v4 and mount its active trip. */
  function load(doc, name) {
    let S = doc;
    if (!S) return null;
    if (S.version === 3) S = migrateV3(S, name);
    for (const d of S.trips) { d.docs = d.docs || []; d.fieldExpenses = d.fieldExpenses || []; d.settlements = d.settlements || []; }
    S.settings = S.settings || { reminderDays: 3, holdAlertHours: 3, docsAlertDays: 14 };
    S.fx.history = S.fx.history || []; if (S.fx.alertSpreadPct == null) S.fx.alertSpreadPct = 3;
    S.hr = Hr.normalize(S.hr);
    S.dom = Dom.normalize(S.dom);
    normalizeCompany(S);
    Acc.ensureAccounts(S);
    mountTrip(S, S.activeTripId);
    return S;
  }
  const serialize = (S) => JSON.stringify(S);

  // ------------------------------------------------------------ agent scorecard
  /**
   * Agent (وكيل/مندوب) performance for a period (from/to ISO, optional):
   * volume · collection (financial) · quality (cancellations/expiries) · documents · discipline (overdue/credit) · management review.
   */
  function agentScore(S, agent, f = {}) {
    const inP = (ms) => { const d = E.iso(new Date(ms)); return (!f.from || d >= f.from) && (!f.to || d <= f.to); };
    const all = [];
    for (const d of S.trips) for (const b of d.bookings) if (b.agentId === agent.id && inP(b.createdAt)) all.push({ b, pax: d.pax.filter((p) => p.bookingId === b.id), trip: d.trip });
    const live = all.filter(({ b }) => E.LIVE_STATES.includes(b.status));
    const net = Acc.r2(live.reduce((x, { b }) => x + (b.net || 0), 0)), paid = Acc.r2(live.reduce((x, { b }) => x + Math.min(b.paid || 0, b.net || 0), 0));
    const pax = live.reduce((x, { pax: p }) => x + p.length, 0), docsOk = live.reduce((x, { pax: p }) => x + p.filter((q) => q.photoFileId && q.passportFileId).length, 0);
    const cancelled = all.filter(({ b }) => b.status === 'CANCELLED').length, expired = all.filter(({ b }) => b.status === 'EXPIRED').length;
    const today = E.iso(new Date());
    const overdueInst = live.reduce((x, { b }) => x + (b.installments || []).filter((i) => !i.paid && i.due < today).length, 0);
    const commission = Acc.r2(live.reduce((x, { b }) => x + (b.agentCommission || 0), 0));
    const bal = Acc.partyBalance(S, 'agent', agent.id);
    const reviews = (agent.reviews || []).filter((r) => (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to));
    const review = reviews.length ? Acc.r2((reviews.reduce((x, r) => x + r.stars, 0) / reviews.length) * 20) : null;
    return { bookings: all.length, live: live.length, pax, net, paid, collectionPct: net ? Acc.r2((paid / net) * 100) : null, cancelled, expired,
      cancelPct: all.length ? Acc.r2(((cancelled + expired) / all.length) * 100) : 0, docsPct: pax ? Acc.r2((docsOk / pax) * 100) : null, overdueInst,
      commission, avgCommission: pax ? Acc.r2(commission / pax) : 0, balance: bal, review, reviews,
      lastBooking: all.length ? Math.max(...all.map(({ b }) => b.createdAt)) : null };
  }
  /** Scores every agent together (volume is relative to the best agent of the period). */
  function agentRanking(S, f = {}) {
    const rows = S.agents.map((a) => ({ a, k: agentScore(S, a, f) }));
    const top = Math.max(1, ...rows.map((r) => r.k.net));
    for (const r of rows) {
      const k = r.k, a = r.a;
      const credit = a.tier === 'B2B' && a.creditLimit > 0 && a.balance < 0 ? Math.min(100, (-a.balance / a.creditLimit) * 100) : 0;
      const parts = {
        volume: k.bookings ? Acc.r2((k.net / top) * 100) : 0,
        finance: k.collectionPct == null ? null : Math.max(0, Acc.r2((a.tier === 'B2B' ? 100 - credit * 0.5 : k.collectionPct) - k.overdueInst * 10)),
        quality: k.bookings ? Math.max(0, Acc.r2(100 - k.cancelPct * 1.5)) : null,
        docs: k.docsPct,
        discipline: Math.max(0, 100 - (a.overdueDays || 0) * 3 - (a.blocked ? 50 : 0)),
        review: k.review,
      };
      const W = { volume: 30, finance: 30, quality: 15, docs: 10, discipline: 5, review: 10 };
      const used = Object.entries(parts).filter(([, v]) => v != null);
      const wsum = used.reduce((x, [key]) => x + W[key], 0) || 1;
      const total = k.bookings || k.review != null ? Acc.r2(used.reduce((x, [key, v]) => x + v * W[key], 0) / wsum) : null; // no activity → not rated
      r.parts = parts; r.total = total;
      r.rating = total == null ? { k: '—', ar: 'لا نشاط' } : total >= 85 ? { k: 'A', ar: 'ممتاز' } : total >= 70 ? { k: 'B', ar: 'جيد جداً' } : total >= 55 ? { k: 'C', ar: 'جيد' } : { k: 'D', ar: 'يحتاج متابعة' };
    }
    return rows.sort((x, y) => (y.total ?? -1) - (x.total ?? -1));
  }

  // ------------------------------------------------------------ FX
  /** Executive rate (manual, what the company actually pays for SAR) vs global market rate (auto, benchmark only). */
  function fxInfo(S) {
    const exec = Number(S.fx.current) || 0, g = S.fx.global && Number(S.fx.global.rate);
    const spreadPct = g ? Acc.r2(((exec - g) / g) * 100) : null;
    return { exec, global: g || null, globalAt: S.fx.global && S.fx.global.at, spreadPct, threshold: Number(S.fx.alertSpreadPct ?? 3),
      alert: spreadPct != null && Math.abs(spreadPct) > Number(S.fx.alertSpreadPct ?? 3) };
  }
  function setExecRate(S, rate, by, note) {
    rate = Acc.r2(Number(rate) * 100) / 100;
    if (!(rate > 0)) throw new Error('سعر صرف غير صحيح');
    const g = S.fx.global && S.fx.global.rate;
    S.fx.history = S.fx.history || [];
    S.fx.history.unshift({ rate, prev: S.fx.current, global: g || null, at: Date.now(), by, note: note || '' });
    S.fx.history.length = Math.min(S.fx.history.length, 200);
    S.fx.current = rate;
  }

  return { agentScore, agentRanking, DOMAINS, applyCountry, normalizeCompany, hasDomain, TRIP_KEYS, COUNTRIES, TRIP_DOC_KINDS, mountTrip, tripDocOf, findBooking, withTrip, nextCode, baseCompany, emptyCompany, addCashbox, newTrip, addTripRooms,
    findOrCreateCustomer, createVoucher, approve, reject, onVoucherPosted, createBooking, alerts, migrateV3, load, serialize, fxInfo, setExecRate };
});
