/* =====================================================================
 * Umrah ERP — Enterprise mock dataset
 * All dates are computed relative to "today" so TTL countdowns, cut-off
 * radar alerts and passport checks are always live when the demo opens.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.MockData = factory(root.Engine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  function buildSeed(nowMs) {
    const now = nowMs || Date.now();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const d = (n) => E.iso(E.addDays(today, n));
    const H = 3600000;

    const depart = d(21), makIn = d(21), madIn = d(26), ret = d(30); // 10 days: 5 nights Makkah + 4 nights Madinah

    // ------------------------------------------------------------ people
    const users = [
      { id: 'U1', name: 'منة الله (سيلز)', role: 'SALES' },
      { id: 'U2', name: 'أ. شريف (رئيس قسم)', role: 'HEAD' },
      { id: 'U3', name: 'أ. هشام (مدير المبيعات)', role: 'OWNER' },
    ];
    const agents = [
      { id: 'A1', code: 'AG-201', name: 'النور للسياحة – أسيوط', tier: 'B2B', currency: 'EGP', balance: 185000, creditLimit: 250000, overdueDays: 0, blocked: false, netDiscountPct: 6, pin: '4411', phone: '01001234567' },
      { id: 'A2', code: 'AG-202', name: 'الصفوة ترافل – المنصورة', tier: 'B2B', currency: 'SAR', balance: 9500, creditLimit: 15000, overdueDays: 0, blocked: false, netDiscountPct: 5, pin: '7720', phone: '01112223344' },
      { id: 'A3', code: 'AG-203', name: 'رحلات الفجر – طنطا', tier: 'B2B', currency: 'EGP', balance: -198000, creditLimit: 200000, overdueDays: 19, blocked: false, netDiscountPct: 5, pin: '1903', phone: '01223334455' },
      { id: 'A4', code: 'BR-301', name: 'الوسيط/ عادل الشاذلي', tier: 'BROKER', currency: 'EGP', balance: 0, creditLimit: 0, overdueDays: 0, blocked: false, commissionPct: 4, commission: { type: 'FIXED', basis: 'PAX', min: 500, pct: 0 }, pin: '5050', phone: '01098765432' },
    ];
    const suppliers = [
      { id: 'S1', name: 'شركة إعمار الضيافة (فندق مكة)', category: 'HOTEL', currency: 'SAR' },
      { id: 'S2', name: 'مجموعة طيبة للفنادق (فندق المدينة)', category: 'HOTEL', currency: 'SAR' },
      { id: 'S3', name: 'ناقل جوي – رحلات شارتر القاهرة/جدة', category: 'AIR', currency: 'EGP' },
      { id: 'S4', name: 'منصة نسك – التأشيرات والتأمين', category: 'VISA', currency: 'SAR' },
      { id: 'S5', name: 'شركة الرواحل للنقل البري', category: 'TRANSPORT', currency: 'SAR' },
      { id: 'S6', name: 'موردون محليون (هدايا/تسويق)', category: 'OPEX', currency: 'EGP' },
    ];

    // -------------------------------------------------------- allotments
    const mkDays = (from, n, fn) => { const o = {}; for (let i = 0; i < n; i++) o[E.iso(E.addDays(from, i))] = fn(i); return o; };
    const wave = (i, a, b) => Math.round(a + b * (0.5 + 0.5 * Math.sin(i * 0.9)));
    const allotments = [
      {
        id: 'AL-MAK-01', code: 'ALT-MAK-2026-07', city: 'MAK', supplierId: 'S1',
        hotel: 'فندق برج النخبة – المنطقة المركزية (مكة)', hotelEn: 'Nokhba Tower Hotel – Central Area',
        from: d(14), to: d(44), cutoff: d(5), totalRooms: 60,
        rooms: { DBL: 12, TPL: 16, QUAD: 22, QUINT: 10 },
        rates: { DBL: 380, TPL: 420, QUAD: 460, QUINT: 500 }, // SAR per room-night
        days: mkDays(d(14), 30, (i) => ({ company: i >= 4 && i < 12 ? 10 : wave(i, 4, 6), agents: wave(i + 2, 6, 10), held: i % 5 === 0 ? 3 : 1 })),
        priceOverrides: {}, b2bSold: {}, b2bHeld: {},
      },
      {
        id: 'AL-MAD-01', code: 'ALT-MAD-2026-03', city: 'MAD', supplierId: 'S2',
        hotel: 'فندق روضة الأنصار – المركزية الشمالية (المدينة)', hotelEn: 'Rawdat Al Ansar – North Central',
        from: d(18), to: d(48), cutoff: d(12), totalRooms: 40,
        rooms: { DBL: 10, TPL: 10, QUAD: 14, QUINT: 6 },
        rates: { DBL: 300, TPL: 340, QUAD: 380, QUINT: 420 },
        days: mkDays(d(18), 30, (i) => ({ company: wave(i, 3, 5), agents: wave(i + 4, 4, 8), held: i % 4 === 1 ? 2 : 0 })),
        priceOverrides: {}, b2bSold: {}, b2bHeld: {},
      },
    ];

    // --------------------------------------------------------------- trip
    const trip = {
      id: 'T-2026-014', code: 'TRP-2026-014', costCenter: 'CC-TRIP-2026-014',
      name: 'عمرة ربيع الأول – 10 أيام (مكة 5 + المدينة 4)',
      departDate: depart, returnDate: ret, flight: 'CAI ✈ JED  |  MED ✈ CAI (شارتر)',
      stays: {
        MAK: { allotmentId: 'AL-MAK-01', checkIn: makIn, nights: 5 },
        MAD: { allotmentId: 'AL-MAD-01', checkIn: madIn, nights: 4 },
      },
      fxRef: 13.10, plannedPax: 44, marginPct: 12, breakagePct: 2.5, childFixedFactor: 0.5,
      lockedPrices: null,
      costItems: [
        { id: 'C1', cat: 'AIR',       name: 'تذكرة طيران شارتر ذهاب وعودة',     supplierId: 'S3', currency: 'EGP', unitPrice: 16500, behavior: 'VAR', childFactor: 0.75, infantFactor: 0.10 },
        { id: 'C2', cat: 'VISA',      name: 'تأشيرة عمرة + باركود',             supplierId: 'S4', currency: 'SAR', unitPrice: 450,  behavior: 'VAR', childFactor: 1, infantFactor: 1 },
        { id: 'C3', cat: 'VISA',      name: 'التأمين الطبي الإلزامي',           supplierId: 'S4', currency: 'SAR', unitPrice: 100,  behavior: 'VAR', childFactor: 1, infantFactor: 1 },
        { id: 'C4', cat: 'TRANSPORT', name: 'النقل البري (جدة–مكة–المدينة–المطار)', supplierId: 'S5', currency: 'SAR', unitPrice: 180, behavior: 'VAR', childFactor: 1, infantFactor: 0 },
        { id: 'C5', cat: 'TRANSPORT', name: 'إيجار باصات المزارات (مكة + المدينة)', supplierId: 'S5', currency: 'SAR', unitPrice: 1600, qty: 2, behavior: 'FIXED' },
        { id: 'C6', cat: 'OPEX',      name: 'بدل سفر وإقامة المشرف',            supplierId: null, currency: 'EGP', unitPrice: 30000, qty: 1, behavior: 'FIXED' },
        { id: 'C7', cat: 'AIR',       name: 'تذكرة طيران المشرف',               supplierId: 'S3', currency: 'EGP', unitPrice: 16500, qty: 1, behavior: 'FIXED' },
        { id: 'C8', cat: 'OPEX',      name: 'إكراميات الموقع (بلبوي/عمال)',      supplierId: null, currency: 'SAR', unitPrice: 1200, qty: 1, behavior: 'FIXED' },
        { id: 'C9', cat: 'OPEX',      name: 'هدايا المعتمرين (شنط/إحرام/مصاحف)', supplierId: 'S6', currency: 'EGP', unitPrice: 14000, qty: 1, behavior: 'FIXED' },
        { id: 'C10', cat: 'OPEX',     name: 'تسويق وإعلانات الرحلة',             supplierId: 'S6', currency: 'EGP', unitPrice: 8000,  qty: 1, behavior: 'FIXED' },
      ],
      supervisor: { name: 'الشيخ/ محمد عبد الرحيم', phoneEG: '01005556677', phoneSA: '0551234567' },
      commissions: { default: 600 }, // agent commission per person for this trip (never below each agent's minimum)
      bank: 'بنك مصر – حساب رقم 1230001234567 – شركة مدار للسياحة',
      boardingPoints: ['مقر الشركة – مدينة نصر', 'ميدان الجيزة', 'مطار القاهرة – مبنى 2'],
      itinerary: [
        { day: 1, date: d(21), city: 'MAK', time: '03:00', title: 'التجمع بمطار القاهرة والإقلاع إلى جدة', notes: 'الإحرام من الميقات بالطائرة' },
        { day: 1, date: d(21), city: 'MAK', time: '14:00', title: 'الوصول للفندق بمكة وأداء مناسك العمرة', notes: 'تجمع في اللوبي بعد صلاة العصر' },
        { day: 2, date: d(22), city: 'MAK', time: '—', title: 'يوم حر للعبادة بالمسجد الحرام', notes: '' },
        { day: 3, date: d(23), city: 'MAK', time: '07:30', title: 'مزارات مكة: جبل النور، عرفات، مزدلفة، منى', notes: 'التجمع باللوبي 7:15 صباحاً' },
        { day: 4, date: d(24), city: 'MAK', time: '—', title: 'عبادة – عمرة ثانية اختيارية (التنعيم)', notes: '' },
        { day: 5, date: d(25), city: 'MAK', time: '22:00', title: 'طواف الوداع', notes: '' },
        { day: 6, date: d(26), city: 'MAD', time: '08:00', title: 'التحرك إلى المدينة المنورة', notes: 'تسليم الغرف قبل 7:30' },
        { day: 7, date: d(27), city: 'MAD', time: '06:30', title: 'زيارة الروضة الشريفة (تصريح نسك)', notes: 'الالتزام بموعد التصريح' },
        { day: 8, date: d(28), city: 'MAD', time: '08:00', title: 'مزارات المدينة: قباء، أحد، القبلتين، الخندق', notes: '' },
        { day: 9, date: d(29), city: 'MAD', time: '—', title: 'يوم حر للعبادة بالمسجد النبوي', notes: '' },
        { day: 10, date: d(30), city: 'MAD', time: '10:00', title: 'التحرك لمطار المدينة والعودة للقاهرة', notes: '' },
      ],
    };

    // ------------------------------------------------ bookings & passengers
    const bookings = [], pax = [];
    let pn = 0;
    const P = (bk, nameAr, nameEn, gender, type, dob, extra = {}) => {
      pn++;
      const id = 'P' + pn;
      pax.push({
        id, bookingId: bk, nameAr, nameEn, gender, type, dob, nationality: 'EGYPTIAN',
        passport: 'A' + String(21870000 + pn * 7919).slice(0, 8), passportExp: extra.exp || d(900 + pn * 13),
        nid: String(28000000000000 + pn * 1234567).slice(0, 14),
        borderNo: extra.border || (pn % 3 === 0 ? '' : String(3100450000 + pn * 311)),
        phone: extra.phone || ('010' + String(10000000 + pn * 104729).slice(0, 8)),
        vault: { stage: extra.stage ?? (pn % 5), log: [] },
      });
      return id;
    };
    const B = (o) => { bookings.push({ paid: 0, holdUntil: null, incentive: 0, incentiveMode: null, agentCommission: 0, services: [], createdAt: now - 3 * 86400000, ...o }); return o.id; };

    // Pricing snapshot used for the seed bookings (net computed on the fly by engine where possible).
    const prices = E.priceList({ trip, allotments });
    const pk = (t) => prices[t];

    B({ id: 'B1', code: 'BK-1001', channel: 'DIRECT', userId: 'U3', mode: 'PRIVATE_ROOM', roomType: 'QUAD', status: 'CONFIRMED', net: pk('QUAD') * 4 + prices.CHD + prices.INF, paid: pk('QUAD') * 4 + prices.CHD + prices.INF });
    P('B1', 'أحمد محمود عبد الفتاح', 'AHMED MAHMOUD ABDELFATTAH', 'M', 'ADULT', '1961-03-12', { phone: '01001112233', stage: 3 });
    P('B1', 'فاطمة حسن السيد', 'FATMA HASSAN ELSAYED', 'F', 'ADULT', '1965-07-02', { stage: 3 });
    P('B1', 'مريم أحمد محمود', 'MARIAM AHMED MAHMOUD', 'F', 'ADULT', '1997-11-20', { stage: 3 });
    P('B1', 'يوسف أحمد محمود', 'YOUSSEF AHMED MAHMOUD', 'M', 'ADULT', '2000-01-15', { stage: 3 });
    P('B1', 'آدم يوسف أحمد', 'ADAM YOUSSEF AHMED', 'M', 'CHD', '2019-05-09', { stage: 3 });
    P('B1', 'ليلى يوسف أحمد', 'LAILA YOUSSEF AHMED', 'F', 'INF', '2025-04-01', { stage: 3 });

    B({ id: 'B2', code: 'BK-1002', channel: 'DIRECT', userId: 'U1', mode: 'PRIVATE_ROOM', roomType: 'DBL', status: 'DEPOSIT', net: pk('DBL') * 2, paid: 30000 });
    P('B2', 'محمود سعيد قنديل', 'MAHMOUD SAEED KANDIL', 'M', 'ADULT', '1970-02-18', { phone: '01223344556' });
    P('B2', 'هدى إبراهيم مرسي', 'HODA IBRAHIM MORSY', 'F', 'ADULT', '1973-09-30');

    B({ id: 'B3', code: 'BK-1003', channel: 'DIRECT', userId: 'U1', mode: 'FULL_PACKAGE', roomType: 'QUAD', status: 'CONFIRMED', net: pk('QUAD'), paid: pk('QUAD') });
    P('B3', 'خالد مصطفى الشافعي', 'KHALED MOSTAFA ELSHAFEI', 'M', 'ADULT', '1985-06-11');

    B({ id: 'B4', code: 'BK-1004', channel: 'DIRECT', userId: 'U2', mode: 'FULL_PACKAGE', roomType: 'QUAD', status: 'DEPOSIT', net: pk('QUAD') * 2, paid: 40000, discountPct: 3 });
    P('B4', 'سيد عبد الرحمن حجازي', 'SAYED ABDELRAHMAN HEGAZY', 'M', 'ADULT', '1958-12-01');
    P('B4', 'محمد سيد عبد الرحمن', 'MOHAMED SAYED ABDELRAHMAN', 'M', 'ADULT', '1990-04-22');

    B({ id: 'B5', code: 'BK-1005', channel: 'DIRECT', userId: 'U1', mode: 'FULL_PACKAGE', roomType: 'QUAD', status: 'CONFIRMED', net: pk('QUAD') * 2, paid: pk('QUAD') * 2 });
    P('B5', 'نادية كمال الدين', 'NADIA KAMAL ELDIN', 'F', 'ADULT', '1975-08-14');
    P('B5', 'سناء كمال الدين', 'SANAA KAMAL ELDIN', 'F', 'ADULT', '1970-10-03');

    B({ id: 'B6', code: 'BK-1006', channel: 'DIRECT', userId: 'U1', mode: 'FULL_PACKAGE', roomType: 'QUAD', status: 'SOFT_HOLD', net: pk('QUAD'), holdUntil: now + 20 * H });
    P('B6', 'آمال فتحي سالم', 'AMAL FATHY SALEM', 'F', 'ADULT', '1980-01-27', { stage: 0 });

    B({ id: 'B7', code: 'BK-1007', channel: 'DIRECT', userId: 'U1', mode: 'FULL_PACKAGE', roomType: 'TPL', status: 'PENDING_APPROVAL', discountPct: 5, net: Math.round(pk('TPL') * 0.95), holdUntil: now + 6 * H });
    P('B7', 'طارق علي النجار', 'TAREK ALY ELNAGGAR', 'M', 'ADULT', '1987-03-19', { stage: 0 });

    const b8Gross = pk('QUINT') * 5 + prices.CHD;
    B({ id: 'B8', code: 'BK-1008', channel: 'B2B', agentId: 'A1', mode: 'PRIVATE_ROOM', roomType: 'QUINT', status: 'CONFIRMED', net: Math.round(b8Gross * 0.94), paid: Math.round(b8Gross * 0.94), incentive: 250, incentiveMode: 'AGENT_CREDIT' });
    P('B8', 'إبراهيم نصر الدين', 'IBRAHIM NASR ELDIN', 'M', 'ADULT', '1976-05-05', { stage: 2 });
    P('B8', 'سامية فؤاد عثمان', 'SAMIA FOUAD OSMAN', 'F', 'ADULT', '1979-12-12', { stage: 2 });
    P('B8', 'حسن إبراهيم نصر', 'HASSAN IBRAHIM NASR', 'M', 'ADULT', '2004-02-08', { stage: 2 });
    P('B8', 'رنا إبراهيم نصر', 'RANA IBRAHIM NASR', 'F', 'ADULT', '2007-07-17', { stage: 2 });
    P('B8', 'سلمى إبراهيم نصر', 'SALMA IBRAHIM NASR', 'F', 'ADULT', '2010-09-09', { stage: 2 });
    P('B8', 'زياد إبراهيم نصر', 'ZIAD IBRAHIM NASR', 'M', 'CHD', '2018-03-03', { stage: 2 });

    B({ id: 'B9', code: 'BK-1009', channel: 'BROKER', agentId: 'A4', mode: 'PRIVATE_ROOM', roomType: 'DBL', status: 'DEPOSIT', net: pk('DBL') * 2, paid: 50000, agentCommission: 1000, commissionBase: 1200, commissionAdj: -200, commissionLog: [{ adj: -200, note: 'خصم لتأخير مستندات الجوازات', by: 'أ. هشام (مدير المبيعات)', at: now - 3 * 86400000 }] });
    P('B9', 'عبد الله رجب منصور', 'ABDALLA RAGAB MANSOUR', 'M', 'ADULT', '1955-01-10', { stage: 1 });
    P('B9', 'زينب علي منصور', 'ZEINAB ALY MANSOUR', 'F', 'ADULT', '1959-06-21', { stage: 1 });

    B({ id: 'B10', code: 'BK-1010', channel: 'DIRECT', userId: 'U2', mode: 'FULL_PACKAGE', roomType: 'TPL', status: 'CONFIRMED', net: pk('TPL'), paid: pk('TPL') });
    P('B10', 'هبة عادل رشدي', 'HEBA ADEL ROSHDY', 'F', 'ADULT', '1992-04-04');

    B({ id: 'B11', code: 'BK-1011', channel: 'DIRECT', userId: 'U1', mode: 'FULL_PACKAGE', roomType: 'TPL', status: 'SOFT_HOLD', net: pk('TPL'), holdUntil: now + 3 * H + 40 * 60000 });
    P('B11', 'شيماء نبيل حسني', 'SHAIMAA NABIL HOSNY', 'F', 'ADULT', '1996-10-10', { stage: 0 });

    B({ id: 'B12', code: 'BK-1012', channel: 'DIRECT', userId: 'U1', mode: 'UNBUNDLED', roomType: 'QUAD', services: ['VISA', 'AIR'], status: 'PENDING_PRICING', net: null, holdUntil: now + 22 * H });
    P('B12', 'وليد حمدي البنا', 'WALEED HAMDY ELBANNA', 'M', 'ADULT', '1977-11-11', { stage: 0 });

    B({ id: 'B13', code: 'BK-1013', channel: 'B2B', agentId: 'A2', mode: 'FULL_PACKAGE', roomType: 'QUAD', status: 'CONFIRMED', net: Math.round(pk('QUAD') * 2 * 0.95), paid: Math.round(pk('QUAD') * 2 * 0.95) });
    P('B13', 'مصطفى جمال الدين', 'MOSTAFA GAMAL ELDIN', 'M', 'ADULT', '1981-02-02', { stage: 2 });
    P('B13', 'أشرف زكي فهمي', 'ASHRAF ZAKY FAHMY', 'M', 'ADULT', '1973-08-08', { stage: 2 });

    B({ id: 'B14', code: 'BK-1014', channel: 'DIRECT', userId: 'U3', mode: 'FULL_PACKAGE', roomType: 'QUINT', status: 'DEPOSIT', net: pk('QUINT') * 3, paid: 45000 });
    P('B14', 'رمضان عيد الصاوي', 'RAMADAN EID ELSAWY', 'M', 'ADULT', '1967-04-14');
    P('B14', 'صبحي فرج عطية', 'SOBHY FARAG ATTIA', 'M', 'ADULT', '1964-12-30');
    P('B14', 'جمال حسني بدوي', 'GAMAL HOSNY BADAWY', 'M', 'ADULT', '1976-07-07');

    B({ id: 'B15', code: 'BK-1015', channel: 'DIRECT', userId: 'U1', mode: 'FULL_PACKAGE', roomType: 'QUAD', status: 'DEPOSIT', net: pk('QUAD'), paid: 15000 });
    P('B15', 'هناء شريف عوض', 'HANAA SHERIF AWAD', 'F', 'ADULT', '1984-05-25', { stage: 1 });

    B({ id: 'B16', code: 'BK-1016', channel: 'DIRECT', userId: 'U1', mode: 'FULL_PACKAGE', roomType: 'TPL', status: 'SOFT_HOLD', net: pk('TPL'), holdUntil: now + 9 * H });
    P('B16', 'علي حسن الدسوقي', 'ALY HASSAN ELDESOUKY', 'M', 'ADULT', '1989-09-15', { stage: 0 });

    B({ id: 'B17', code: 'BK-1017', channel: 'DIRECT', userId: 'U2', mode: 'FULL_PACKAGE', roomType: 'QUAD', status: 'DEPOSIT', net: pk('QUAD'), paid: 20000 });
    P('B17', 'كريم عادل شوقي', 'KARIM ADEL SHAWKY', 'M', 'ADULT', '1986-01-01', { exp: d(120), stage: 1 }); // passport < 6 months after return → red alert

    B({ id: 'B18', code: 'BK-1018', channel: 'B2B', agentId: 'A1', mode: 'FULL_PACKAGE', roomType: 'QUINT', status: 'CONFIRMED', net: Math.round(pk('QUINT') * 2 * 0.94), paid: Math.round(pk('QUINT') * 2 * 0.94), incentive: 250, incentiveMode: 'CLIENT_DISCOUNT' });
    P('B18', 'فرج عبد العزيز', 'FARAG ABDELAZIZ', 'M', 'ADULT', '1960-06-06', { stage: 2 });
    P('B18', 'عماد فرج عبد العزيز', 'EMAD FARAG ABDELAZIZ', 'M', 'ADULT', '1988-02-14', { stage: 2 });

    B({ id: 'B19', code: 'BK-1019', channel: 'DIRECT', userId: 'U3', mode: 'PRIVATE_ROOM', roomType: 'TPL', status: 'CONFIRMED', net: pk('TPL') * 3, paid: pk('TPL') * 3 });
    P('B19', 'مجدي صلاح الشربيني', 'MAGDY SALAH ELSHERBINY', 'M', 'ADULT', '1968-03-21', { stage: 3 });
    P('B19', 'عزة محمد الشربيني', 'AZZA MOHAMED ELSHERBINY', 'F', 'ADULT', '1971-12-02', { stage: 3 });
    P('B19', 'ندى مجدي صلاح', 'NADA MAGDY SALAH', 'F', 'ADULT', '2001-08-30', { stage: 3 });

    B({ id: 'B20', code: 'BK-1020', channel: 'DIRECT', userId: 'U2', mode: 'FULL_PACKAGE', roomType: 'QUAD', status: 'CONFIRMED', net: pk('QUAD') * 4, paid: pk('QUAD') * 4 });
    P('B20', 'سهير أنور الجمال', 'SOHEIR ANWAR ELGAMAL', 'F', 'ADULT', '1966-04-18', { stage: 3 });
    P('B20', 'منى أنور الجمال', 'MONA ANWAR ELGAMAL', 'F', 'ADULT', '1969-01-09', { stage: 3 });
    P('B20', 'عفاف سالم القاضي', 'AFAF SALEM ELKADY', 'F', 'ADULT', '1963-10-27', { stage: 3 });
    P('B20', 'إيمان رشاد حلمي', 'EMAN RASHAD HELMY', 'F', 'ADULT', '1978-05-16', { stage: 3 });

    B({ id: 'B21', code: 'BK-1021', channel: 'BROKER', agentId: 'A4', mode: 'FULL_PACKAGE', roomType: 'QUAD', status: 'DEPOSIT', net: pk('QUAD'), paid: 20000, agentCommission: 750, commissionBase: 600, commissionAdj: 150, commissionLog: [{ adj: 150, note: 'حافز إضافي — أول حجز للمندوب في الموسم', by: 'أ. هشام (مدير المبيعات)', at: now - 3 * 86400000 }] });
    P('B21', 'ياسر فوزي الحلواني', 'YASSER FAWZY ELHALWANY', 'M', 'ADULT', '1983-11-03', { stage: 1 });

    // Installment schedules for deposit bookings.
    for (const b of bookings) {
      b.installments = b.status === 'DEPOSIT' ? [
        { due: d(-2), amount: b.paid, paid: true, label: 'عربون' },
        { due: d(6), amount: Math.round((b.net - b.paid) / 2), paid: false, label: 'القسط الثاني' },
        { due: d(12), amount: b.net - b.paid - Math.round((b.net - b.paid) / 2), paid: false, label: 'القسط الأخير' },
      ] : [];
    }

    // --------------------------------------------- rooms (absorbed from allotments)
    const rooms = [], beds = [];
    const counters = {};
    const R = (city, type, opts = {}) => {
      const k = city + type; counters[k] = (counters[k] || 0) + 1;
      const id = `R-${city}-${type}-${counters[k]}`;
      const vcode = `V-${city === 'MAK' ? 'MAK' : 'MED'}-${E.ROOM_TYPES[type].en}-${String(counters[k]).padStart(2, '0')}`;
      rooms.push({ id, city, type, vcode, physicalNo: opts.phys || null, gender: opts.gender || null, privateBookingId: opts.priv || null });
      for (let i = 1; i <= E.ROOM_TYPES[type].cap; i++) beds.push({ id: `${id}-B${i}`, roomId: id, no: i, paxId: (opts.occ || [])[i - 1] || null });
      return id;
    };
    const byName = (en) => pax.find((p) => p.nameEn.startsWith(en)).id;

    // Makkah — 14 rooms absorbed (DBL×3, TPL×3, QUAD×5, QUINT×3)
    R('MAK', 'QUAD', { phys: '1204', gender: 'P', priv: 'B1', occ: ['AHMED', 'FATMA', 'MARIAM', 'YOUSSEF'].map(byName) });
    R('MAK', 'DBL', { phys: '1207', gender: 'P', priv: 'B2', occ: ['MAHMOUD', 'HODA'].map(byName) });
    R('MAK', 'QUAD', { gender: 'M', occ: ['KHALED', 'SAYED', 'MOHAMED SAYED'].map(byName) });
    R('MAK', 'QUAD', { gender: 'F', occ: ['NADIA', 'SANAA', 'AMAL'].map(byName) });
    R('MAK', 'TPL', { gender: 'M', occ: ['TAREK'].map(byName) });
    R('MAK', 'QUINT', { phys: '1311', gender: 'P', priv: 'B8', occ: ['IBRAHIM', 'SAMIA', 'HASSAN IBRAHIM', 'RANA', 'SALMA'].map(byName) });
    R('MAK', 'DBL', { gender: 'P', priv: 'B9', occ: ['ABDALLA', 'ZEINAB'].map(byName) });
    R('MAK', 'TPL', { gender: 'F', occ: ['HEBA', 'SHAIMAA'].map(byName) });
    R('MAK', 'QUAD', { gender: 'M', occ: ['MOSTAFA', 'ASHRAF', 'KARIM', 'YASSER'].map(byName) });
    R('MAK', 'QUINT', { gender: 'M', occ: ['RAMADAN', 'SOBHY', 'GAMAL', 'FARAG', 'EMAD'].map(byName) });
    R('MAK', 'TPL', { phys: '1402', gender: 'P', priv: 'B19', occ: ['MAGDY', 'AZZA', 'NADA'].map(byName) });
    R('MAK', 'QUAD', { gender: 'F', occ: ['SOHEIR', 'MONA', 'AFAF', 'EMAN'].map(byName) });
    R('MAK', 'QUAD'); R('MAK', 'DBL'); R('MAK', 'QUINT'); R('MAK', 'QUAD');

    // Madinah — 12 rooms, different capacities for the same pilgrims
    R('MAD', 'QUAD', { gender: 'P', priv: 'B1', occ: ['AHMED', 'FATMA', 'MARIAM', 'YOUSSEF'].map(byName) });
    R('MAD', 'DBL', { gender: 'P', priv: 'B2', occ: ['MAHMOUD', 'HODA'].map(byName) });
    R('MAD', 'QUINT', { gender: 'P', priv: 'B8', occ: ['IBRAHIM', 'SAMIA', 'HASSAN IBRAHIM', 'RANA', 'SALMA'].map(byName) });
    R('MAD', 'DBL', { gender: 'P', priv: 'B9', occ: ['ABDALLA', 'ZEINAB'].map(byName) });
    R('MAD', 'QUINT', { gender: 'M', occ: ['KHALED', 'SAYED', 'MOHAMED SAYED', 'MOSTAFA', 'ASHRAF'].map(byName) });
    R('MAD', 'QUAD', { gender: 'F', occ: ['NADIA', 'SANAA', 'HEBA'].map(byName) });
    R('MAD', 'QUAD', { gender: 'M', occ: ['RAMADAN', 'SOBHY', 'GAMAL', 'YASSER'].map(byName) });
    R('MAD', 'TPL', { gender: 'P', priv: 'B19', occ: ['MAGDY', 'AZZA', 'NADA'].map(byName) });
    R('MAD', 'QUAD', { gender: 'F', occ: ['SOHEIR', 'MONA', 'AFAF', 'EMAN'].map(byName) });
    R('MAD', 'DBL', { gender: 'M', occ: ['FARAG', 'EMAD'].map(byName) });
    R('MAD', 'TPL'); R('MAD', 'QUAD'); R('MAD', 'DBL'); R('MAD', 'QUINT');

    // Passport vault history
    for (const p of pax) {
      for (let s = 0; s <= p.vault.stage; s++) p.vault.log.push({ stage: s, at: now - (6 - s) * 86400000, by: s < 2 ? 'المندوب' : 'أمين الخزينة' });
    }

    const state = {
      version: 3, seededAt: now,
      fx: { current: 13.36 },
      users, agents, suppliers, allotments, trip, bookings, pax, rooms, beds,
      bus: { seats: {}, plate: 'ن ق ع 4521', driver: 'أبو فهد – 0501112233' },
      roomingLocked: { MAK: false, MAD: false },
      settlements: [
        { id: 'ST1', supplierId: 'S1', ref: 'مستخلص فندق مكة – دفعة 1', amountSAR: 22000, fxActual: 13.25, date: d(-10) },
        { id: 'ST2', supplierId: 'S4', ref: 'شحن محفظة نسك', amountSAR: 9000, fxActual: 13.38, date: d(-4) },
      ],
      fieldExpenses: [
        { id: 'FE1', label: 'نثريات مشرف – مياه وتمر للحافلة', amount: 650, currency: 'SAR' },
        { id: 'FE2', label: 'بدل انتقالات المندوب لجمع الجوازات', amount: 3500, currency: 'EGP' },
      ],
      audit: [],
    };
    E.autoArrangeBus(state);
    return state;
  }

  return { buildSeed };
});
