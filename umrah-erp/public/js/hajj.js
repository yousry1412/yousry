/* =====================================================================
 * أفواج — Hajj engine (browser + server). See HAJJ.md for the study.
 *  Season  : hijri year, Tarwiyah date, SAR lock rate, quota & sources
 *            (ministry / partner visas with a fee), bank guarantees,
 *            deadlines, eligibility rules
 *  Programs: level, long/short, route, stays (Makkah/Madinah/Aziziya with
 *            per-occupancy cost), mashair category, cost items (SAR/EGP/USD,
 *            per pilgrim or per group), sale price per room type, hady,
 *            installment plan, cancellation schedule, agent commission
 *  Pilgrims: registration = booking (shared vouchers & governance),
 *            eligibility checks, stage pipeline, family/mahram links,
 *            groups (أفواج), rooms per stay, Mina/Arafat tents
 *  Money   : deferred revenue 2108 until the season is closed → 4107;
 *            prepaid costs 1109 → 5108; cancellation fee schedule
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./accounting.js'));
  else root.Hajj = factory(root.Engine, root.Acc);
})(typeof self !== 'undefined' ? self : this, function (E, Acc) {
  'use strict';
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const LEVELS = { ECONOMY: 'اقتصادي', STANDARD: 'متوسط', FIVE: 'خمس نجوم', VIP: 'VIP' };
  const DURATION = { LONG: 'طويل (قبل التروية بفترة)', SHORT: 'قصير' };
  const ROUTE = { MAD_FIRST: 'المدينة أولاً', MAD_AFTER: 'المدينة بعد الحج', NO_MAD: 'بدون المدينة' };
  const TRANSPORT = { AIR: 'جوي', LAND: 'بري' };
  const MASHAIR = { VIP: 'مخيمات VIP', A: 'الفئة A', B: 'الفئة B', C: 'الفئة C', D: 'الفئة D (اقتصادي)' };
  const CITIES = { MAK: 'مكة المكرمة', MAD: 'المدينة المنورة', AZZ: 'العزيزية' };
  const ROOMS = { QUAD: { ar: 'رباعية', cap: 4 }, TRIPLE: { ar: 'ثلاثية', cap: 3 }, DOUBLE: { ar: 'ثنائية', cap: 2 }, SINGLE: { ar: 'فردية', cap: 1 } };
  const NUSUK = { TAMATTU: 'تمتع', QIRAN: 'قِران', IFRAD: 'إفراد' };
  const NEEDS_HADY = ['TAMATTU', 'QIRAN'];
  const COST_CATS = { MASHAIR: 'باقة المشاعر / نسك', HOTEL: 'فنادق (خارج جدول الغرف)', AIR: 'الطيران', VISA: 'التأشيرة والتأمين والرسوم', TRANSPORT: 'النقل', FOOD: 'الإعاشة', HADY: 'الهدي', STAFF: 'المشرفون والإداريون', GIFTS: 'الهدايا والشنط', OTHER: 'أخرى' };
  const STAGES = {
    REGISTERED: { ar: 'مسجل', i: 1 }, DOCS: { ar: 'المستندات مكتملة', i: 2 }, SUBMITTED: { ar: 'رُفع للجهات', i: 3 }, VISA: { ar: 'صدرت التأشيرة', i: 4 },
    TRAVELLED: { ar: 'سافر', i: 5 }, RETURNED: { ar: 'عاد', i: 6 }, WAITLIST: { ar: 'قائمة انتظار', i: 0 }, REJECTED: { ar: 'مرفوض', i: -1 }, CANCELLED: { ar: 'ملغي', i: -2 },
  };
  const ACTIVE = (p) => !['CANCELLED', 'REJECTED', 'WAITLIST'].includes(p.stage);
  const DOCS = { passportFileId: 'صورة الجواز', photoFileId: 'صورة شخصية', vaccineFileId: 'شهادة التطعيمات', medicalFileId: 'التقرير الطبي' };

  const empty = () => ({ seasons: [], packages: [], pilgrims: [], groups: [], applicants: [], lotteries: [] });
  function normalize(h) { const d = { ...empty(), ...(h || {}) }; for (const k of Object.keys(empty())) if (!Array.isArray(d[k])) d[k] = []; return d; }
  const season = (S, id) => S.hajj.seasons.find((x) => x.id === id);
  const pkg = (S, id) => S.hajj.packages.find((x) => x.id === id);
  const costCenter = (S, p) => { const k = pkg(S, p.packageId); return k ? { id: k.id, code: k.code, name: k.name } : { id: 'HAJJ', code: 'HAJJ', name: 'الحج' }; };
  const fxOf = (S, ss, cur) => (cur === 'EGP' ? 1 : cur === 'SAR' ? Number(ss.fxLock || S.fx.current) : cur === 'USD' ? Number(ss.usdRate || Number(ss.fxLock || S.fx.current) * 3.75) : 1);

  /** The six days of Hajj with Gregorian dates (from the season's Tarwiyah date). */
  function hajjDays(ss) {
    if (!ss.tarwiyah) return [];
    const L = [['8 ذو الحجة', 'يوم التروية — التوجه إلى منى'], ['9 ذو الحجة', 'يوم عرفة — الوقوف بعرفات ثم المبيت بمزدلفة'], ['10 ذو الحجة', 'يوم النحر — رمي جمرة العقبة والهدي والحلق وطواف الإفاضة'],
      ['11 ذو الحجة', 'أول أيام التشريق — رمي الجمرات الثلاث'], ['12 ذو الحجة', 'ثاني أيام التشريق — نفرة المتعجل'], ['13 ذو الحجة', 'ثالث أيام التشريق — نفرة المتأخر']];
    return L.map(([h, t], i) => ({ hijri: h, date: E.iso(E.addDays(ss.tarwiyah, i)), text: t }));
  }

  // ------------------------------------------------------------ cost sheet
  /** Cost per pilgrim for each room type (EGP, at the season's SAR lock rate) + margin + break-even. */
  function costSheet(S, k) {
    const ss = season(S, k.seasonId) || {}, expected = Math.max(1, Number(k.capacity) || 1), rows = {};
    const perPax = [], perGroup = [];
    for (const it of k.costItems || []) {
      const egp = r2(Number(it.amount || 0) * fxOf(S, ss, it.currency));
      (it.per === 'GROUP' ? perGroup : perPax).push({ ...it, egp });
    }
    const groupTotal = r2(perGroup.reduce((s, x) => s + x.egp, 0));
    const groupShare = r2(groupTotal / expected);
    const paxItems = r2(perPax.reduce((s, x) => s + x.egp, 0));
    const quotaFee = Number(k.partnerVisaFee || 0);
    for (const rt of Object.keys(ROOMS)) {
      const stays = (k.stays || []).map((st) => ({ city: st.city, hotel: st.hotel, nights: st.nights, egp: r2(Number((st.cost || {})[rt] || 0) * fxOf(S, ss, st.currency || 'SAR')) }));
      const price = Number((k.prices || {})[rt] || 0);
      if (!price && stays.every((x) => !x.egp)) continue;
      const cost = r2(stays.reduce((s, x) => s + x.egp, 0) + paxItems + groupShare + quotaFee);
      rows[rt] = { stays, cost, price, margin: r2(price - cost), marginPct: price ? r2(((price - cost) / price) * 100) : null };
    }
    const dbl = rows.DOUBLE || rows.QUAD || Object.values(rows)[0];
    const unitMargin = dbl ? dbl.price - (dbl.cost - groupShare) : 0;
    return { perPax, perGroup, groupTotal, groupShare, paxItems, quotaFee, rows, breakEven: unitMargin > 0 ? Math.ceil(groupTotal / unitMargin) : null, fx: fxOf(S, ss, 'SAR') };
  }

  // ------------------------------------------------------------ eligibility
  function eligibility(S, p) {
    const k = pkg(S, p.packageId), ss = k && season(S, k.seasonId), rules = (ss && ss.rules) || {}, out = [];
    const yr = Number((ss && ss.gregorianYear) || new Date().getFullYear());
    if (p.lastHajjYear && yr - Number(p.lastHajjYear) < Number(rules.yearsSinceLastHajj ?? 5)) out.push({ level: 'err', text: `آخر حجة ${p.lastHajjYear} — لم تمر ${rules.yearsSinceLastHajj ?? 5} سنوات` });
    if (k && p.passportExp) { const need = E.iso(E.addDays(k.returnDate || k.departDate, 30 * Number(rules.passportMonths ?? 6))); if (p.passportExp < need) out.push({ level: 'err', text: `الجواز ينتهي ${p.passportExp} — لازم يكون ساري حتى ${need}` }); }
    if (!p.passport) out.push({ level: 'warn', text: 'رقم الجواز غير مسجل' });
    const age = p.dob ? Math.floor((new Date((ss && ss.tarwiyah) || Date.now()) - new Date(p.dob)) / (365.25 * 86400000)) : null;
    if (age != null && rules.minAge && age < Number(rules.minAge)) out.push({ level: 'err', text: `السن ${age} أقل من الحد الأدنى ${rules.minAge}` });
    if (age != null && rules.maxAge && age > Number(rules.maxAge)) out.push({ level: 'warn', text: `السن ${age} — يحتاج موافقة طبية خاصة` });
    if (p.gender === 'F' && rules.mahramUnder && age != null && age < Number(rules.mahramUnder) && !p.mahramId) out.push({ level: 'warn', text: `سيدة ${age} سنة بدون محرم مسجل (حسب لوائح الموسم)` });
    const miss = Object.entries(DOCS).filter(([f]) => !p[f]).map(([, l]) => l);
    if (miss.length) out.push({ level: 'warn', text: `مستندات ناقصة: ${miss.join('، ')}` });
    if (p.medicalFit === false) out.push({ level: 'err', text: 'غير لائق طبياً' });
    return out;
  }

  // ------------------------------------------------------------ pricing & registration
  function priceFor(S, k, d) {
    const ss = season(S, k.seasonId) || {}, lines = [];
    const base = Number((k.prices || {})[d.roomType] || 0);
    if (!base) return { lines, gross: 0, net: 0, error: `لا يوجد سعر لغرفة ${ROOMS[d.roomType] ? ROOMS[d.roomType].ar : d.roomType} في هذا البرنامج` };
    lines.push({ label: `${k.name} — غرفة ${ROOMS[d.roomType].ar}`, total: base });
    if (NEEDS_HADY.includes(d.nusuk) && !k.hadyIncluded && Number(k.hadySar)) lines.push({ label: `الهدي (${NUSUK[d.nusuk]})`, total: r2(Number(k.hadySar) * fxOf(S, ss, 'SAR')) });
    for (const up of k.upgrades || []) if ((d.upgrades || []).includes(up.id)) lines.push({ label: up.name, total: Number(up.price || 0) });
    const gross = r2(lines.reduce((s, l) => s + l.total, 0)), discount = r2(gross * Number(d.discountPct || 0) / 100);
    return { lines, gross, discount, net: r2(gross - discount) };
  }
  const quotaUsed = (S, ss) => S.hajj.pilgrims.filter((p) => ACTIVE(p) && (pkg(S, p.packageId) || {}).seasonId === ss.id).length;
  const quotaTotal = (ss) => (ss.quota || []).reduce((s, q) => s + Number(q.visas || 0), 0);

  function register(S, d, actor) {
    const k = pkg(S, d.packageId); if (!k) throw new Error('اختر البرنامج');
    const ss = season(S, k.seasonId);
    if (ss.closed) throw new Error('الموسم مقفل');
    if (!String(d.nameAr || '').trim() || !String(d.phone || '').trim()) throw new Error('اكتب اسم الحاج ورقم الهاتف');
    const v = priceFor(S, k, d); if (v.error) throw new Error(v.error);
    const full = quotaTotal(ss) && quotaUsed(S, ss) >= quotaTotal(ss);
    const kUsed = S.hajj.pilgrims.filter((p) => p.packageId === k.id && ACTIVE(p)).length;
    const waitlist = full || (k.capacity && kUsed >= k.capacity);
    const now = Date.now(), agent = d.agentId ? S.agents.find((a) => a.id === d.agentId) : null;
    const owner = actor.role === 'OWNER', discountPct = Number(d.discountPct || 0);
    const p = {
      id: 'HJ' + now.toString(36) + Math.random().toString(36).slice(2, 5), code: Acc.nextNo(S, 'HJ', 'HJ', 5), hajj: true, packageId: k.id, groupId: null,
      nameAr: d.nameAr.trim(), nameEn: String(d.nameEn || '').trim(), gender: d.gender || 'M', dob: d.dob || '', nid: d.nid || '', passport: d.passport || '', passportExp: d.passportExp || '',
      phone: d.phone, lastHajjYear: d.lastHajjYear || '', nusuk: d.nusuk || 'TAMATTU', roomType: d.roomType, familyId: d.familyId || null, mahramId: d.mahramId || null,
      upgrades: d.upgrades || [], medicalFit: d.medicalFit ?? null, notes: d.notes || '', photoFileId: null, passportFileId: null, vaccineFileId: null, medicalFileId: null,
      stage: waitlist ? 'WAITLIST' : 'REGISTERED', stageLog: [{ stage: waitlist ? 'WAITLIST' : 'REGISTERED', at: now, by: actor.name }], visaNo: '', nusukNo: '', rooms: {}, tent: '', bus: '',
      // booking fields → shared vouchers, statements, governance
      channel: agent ? (agent.tier === 'B2B' ? 'B2B' : 'BROKER') : 'DIRECT', agentId: agent ? agent.id : null, userId: agent ? null : actor.staffId, branchId: d.branchId || 'BR1',
      lines: v.lines, gross: v.gross, discountPct, net: v.net, paid: 0, revAcc: '2108', status: discountPct > 0 && !owner ? 'PENDING_APPROVAL' : 'SOFT_HOLD', holdUntil: null,
      agentCommission: 0, commissionBase: 0, commissionAdj: 0, commissionLog: [], installments: [], createdAt: now, createdBy: actor.name,
    };
    if (agent && agent.tier === 'BROKER') { const c = E.commissionFor({ trip: { commissions: k.commissions || {} } }, agent, { adults: 1, chd: 0, gross: v.gross }); p.commissionBase = c.base; p.agentCommission = c.base; }
    const c = S.customers.find((x) => String(x.phone || '').replace(/\D/g, '') === String(d.phone).replace(/\D/g, ''));
    if (c) p.customerId = c.id;
    else { const nc = { id: 'CU' + now.toString(36) + Math.random().toString(36).slice(2, 5), code: Acc.nextNo(S, 'C_CUS', 'CUS', 4), name: p.nameAr, phone: d.phone, nid: d.nid || '', notes: 'حاج', createdAt: now }; S.customers.push(nc); p.customerId = nc.id; }
    // installments from the program plan (percentages of the net, due N days before departure)
    let left = p.net;
    (k.plan || []).forEach((st, i, arr) => { const amt = i === arr.length - 1 ? r2(left) : r2(p.net * Number(st.pct) / 100); left = r2(left - amt); p.installments.push({ label: st.label, due: st.date || E.iso(E.addDays(k.departDate, -Number(st.daysBefore || 0))), amount: amt, paid: false }); });
    S.hajj.pilgrims.push(p);
    if (!waitlist) Acc.syncBooking(S, costCenter(S, p), p, actor.name);
    return p;
  }
  /** A waitlisted pilgrim takes a freed place: now his price becomes a (deferred) receivable. */
  function promote(S, p, by) {
    const k = pkg(S, p.packageId), ss = season(S, k.seasonId);
    if (quotaTotal(ss) && quotaUsed(S, ss) >= quotaTotal(ss)) throw new Error('الحصة مكتملة');
    setStage(p, 'REGISTERED', by); return Acc.syncBooking(S, costCenter(S, p), p, by);
  }
  function setStage(p, stage, by, note) {
    if (!STAGES[stage]) throw new Error('مرحلة غير معروفة');
    p.stage = stage; p.stageLog = p.stageLog || []; p.stageLog.push({ stage, at: Date.now(), by, note: note || '' });
    return p;
  }
  /** Cancellation fee from the program schedule (days before departure) + what is non-refundable once submitted. */
  function cancelFee(S, p, today = E.iso(new Date())) {
    const k = pkg(S, p.packageId), days = Math.round((new Date(k.departDate) - new Date(today)) / 86400000);
    const tier = (k.cancelPolicy || []).slice().sort((a, b) => b.daysBefore - a.daysBefore).find((t) => days <= Number(t.daysBefore));
    let fee = tier ? r2(p.net * Number(tier.feePct) / 100) : 0;
    if (STAGES[p.stage].i >= STAGES.SUBMITTED.i) fee = Math.max(fee, Number(k.nonRefundableAfterSubmit || 0));
    return { fee: Math.min(fee, p.net), days, pct: tier ? tier.feePct : 0 };
  }
  function cancel(S, p, by, reason) {
    const { fee } = cancelFee(S, p);
    setStage(p, 'CANCELLED', by, reason);
    p.cancelFee = fee; p.groupId = null; p.rooms = {}; p.tent = ''; p.bus = '';
    p.lines = [...p.lines, { label: `إلغاء — يُحتسب غرامة ${fee}`, total: -(p.net - fee) }];
    p.net = fee; p.installments = p.installments.map((i) => ({ ...i, paid: true, waived: !i.paid }));
    if (fee <= 0) { p.status = 'CANCELLED'; p.paid = p.paid || 0; }
    else E.applyPayment(p, 0);
    const out = Acc.syncBooking(S, costCenter(S, p), p, by);
    return { fee, refundDue: r2(Math.max(0, (p.paid || 0) - fee)), entries: out };
  }

  // ------------------------------------------------------------ groups, rooms, tents
  /** Families (familyId / mahram) stay together; groups are filled in order of family then gender. */
  function units(list) {
    const fam = new Map();
    for (const p of list) { const key = p.familyId || (p.mahramId ? [p.id, p.mahramId].sort().join('|') : p.id); if (!fam.has(key)) fam.set(key, []); fam.get(key).push(p); }
    return [...fam.values()].sort((a, b) => b.length - a.length);
  }
  function autoGroups(S, packageId, size, leaders = []) {
    const k = pkg(S, packageId), list = S.hajj.pilgrims.filter((p) => p.packageId === packageId && ACTIVE(p));
    S.hajj.groups = S.hajj.groups.filter((g) => g.packageId !== packageId);
    const groups = []; let cur = null;
    for (const u of units(list)) {
      if (!cur || cur.count + u.length > size) { cur = { id: uid('GR'), code: `${k.code}-G${groups.length + 1}`, packageId, name: `الفوج ${groups.length + 1}`, leader: leaders[groups.length] || '', phone: '', bus: String(groups.length + 1), count: 0 }; groups.push(cur); }
      for (const p of u) { p.groupId = cur.id; p.bus = cur.bus; } cur.count += u.length;
    }
    S.hajj.groups.push(...groups.map(({ count, ...g }) => g));
    return groups.length;
  }
  /** Rooms per stay: a family shares its rooms; everyone else is housed by room type and gender. */
  function autoRooms(S, packageId, stayKey) {
    const list = S.hajj.pilgrims.filter((p) => p.packageId === packageId && ACTIVE(p)); let n = 0;
    const label = () => `${stayKey}-${String(++n).padStart(3, '0')}`;
    const pools = {};
    for (const u of units(list)) {
      if (u.length > 1) { // family room(s) by the type the family booked
        const cap = ROOMS[u[0].roomType].cap;
        for (let i = 0; i < u.length; i += cap) { const r = label(); u.slice(i, i + cap).forEach((p) => { p.rooms[stayKey] = r; }); }
      } else { const p = u[0], key = p.roomType + '|' + p.gender; (pools[key] = pools[key] || []).push(p); }
    }
    for (const [key, ps] of Object.entries(pools)) { const cap = ROOMS[key.split('|')[0]].cap; for (let i = 0; i < ps.length; i += cap) { const r = label(); ps.slice(i, i + cap).forEach((p) => { p.rooms[stayKey] = r; }); } }
    return n;
  }
  /** Mina/Arafat tents are separated by gender. */
  function autoTents(S, packageId, capacity) {
    const list = S.hajj.pilgrims.filter((p) => p.packageId === packageId && ACTIVE(p)); let m = 0, f = 0;
    const byG = { M: list.filter((p) => p.gender !== 'F'), F: list.filter((p) => p.gender === 'F') };
    byG.M.forEach((p, i) => { if (i % capacity === 0) m++; p.tent = `رجال ${m}`; });
    byG.F.forEach((p, i) => { if (i % capacity === 0) f++; p.tent = `سيدات ${f}`; });
    return m + f;
  }

  // ------------------------------------------------------------ season numbers & close
  const accBal = (S, acc, tripId) => r2(S.journal.filter((j) => j.tripId === tripId).reduce((s, j) => s + j.lines.filter((l) => l.acc === acc).reduce((x, l) => x + l.dr - l.cr, 0), 0));
  function packageNumbers(S, k) {
    const ps = S.hajj.pilgrims.filter((p) => p.packageId === k.id), act = ps.filter(ACTIVE);
    const cs = costSheet(S, k), estCost = r2(act.reduce((s, p) => s + ((cs.rows[p.roomType] || {}).cost || 0), 0) + (act.length ? 0 : 0));
    const revenue = r2(ps.filter((p) => p.stage !== 'WAITLIST').reduce((s, p) => s + (p.status === 'CANCELLED' ? 0 : p.net || 0), 0));
    const collected = r2(ps.reduce((s, p) => s + (p.paid || 0), 0)), refunds = r2(ps.filter((p) => p.stage === 'CANCELLED').reduce((s, p) => s + Math.max(0, (p.paid || 0) - (p.cancelFee || 0)), 0));
    const t = Acc.salesTaxRates(S), exTax = r2(revenue * 100 / (100 + t.vat + t.stamp));
    const commissions = r2(act.reduce((s, p) => s + (p.agentCommission || 0), 0));
    return { pilgrims: act.length, waitlist: ps.filter((p) => p.stage === 'WAITLIST').length, cancelled: ps.filter((p) => p.stage === 'CANCELLED').length, revenue, exTax, collected, due: r2(revenue - collected + refunds), refunds,
      estCost, prepaid: accBal(S, '1109', k.id), deferred: -accBal(S, '2108', k.id), recognized: -accBal(S, '4107', k.id), costPosted: accBal(S, '5108', k.id), commissions,
      // before closing, bills are partial → never trust them below the cost sheet; after closing the posted cost is final
      costBasis: (season(S, k.seasonId) || {}).closed ? accBal(S, '5108', k.id) : Math.max(estCost, accBal(S, '1109', k.id)),
      profit: r2(exTax - ((season(S, k.seasonId) || {}).closed ? accBal(S, '5108', k.id) : Math.max(estCost, accBal(S, '1109', k.id))) - commissions),
      sarNeed: r2(act.length * (k.costItems || []).filter((c) => c.currency === 'SAR' && c.per !== 'GROUP').reduce((s, c) => s + Number(c.amount || 0), 0) + (k.costItems || []).filter((c) => c.currency === 'SAR' && c.per === 'GROUP').reduce((s, c) => s + Number(c.amount || 0), 0)
        + act.reduce((s, p) => s + (k.stays || []).reduce((x, st) => x + Number((st.cost || {})[p.roomType] || 0), 0), 0)) };
  }
  /** Close the season: deferred revenue → 4107, prepaid Hajj costs → 5108, per program (approver only). */
  function closeSeason(S, ssId, actor) {
    if (!Acc.canApprove(actor.role)) throw new Error('إقفال الموسم من صلاحية المحاسب أو المدير');
    const ss = season(S, ssId); if (ss.closed) throw new Error('الموسم مقفل بالفعل');
    const out = [];
    for (const k of S.hajj.packages.filter((x) => x.seasonId === ssId)) {
      const def = -accBal(S, '2108', k.id), pre = accBal(S, '1109', k.id), lines = [];
      if (Math.abs(def) >= 0.01) lines.push({ acc: '2108', dr: def }, { acc: '4107', cr: def });
      if (Math.abs(pre) >= 0.01) lines.push({ acc: '5108', dr: pre }, { acc: '1109', cr: pre });
      if (lines.length) out.push(Acc.post(S, { memo: `إقفال موسم ${ss.name} — ${k.code}`, source: { type: 'JV', id: 'HAJJCLOSE-' + k.id }, tripId: k.id, lines, by: actor.name }));
    }
    ss.closed = true; ss.closedBy = actor.name; ss.closedAt = Date.now();
    return out;
  }

  // ------------------------------------------------------------ alerts
  function alerts(S, today = E.iso(new Date())) {
    const out = [], g = 'الحج', soon = E.iso(E.addDays(today, 14));
    for (const ss of S.hajj.seasons.filter((x) => !x.closed)) {
      for (const d of ss.deadlines || []) if (!d.done && d.date <= soon) out.push({ level: d.date < today ? 'err' : 'warn', group: g, text: `${ss.name}: ${d.label} — ${d.date}`, page: 'hajjSeason' });
      for (const gu of ss.guarantees || []) if (gu.expiry && gu.expiry <= E.iso(E.addDays(today, 30))) out.push({ level: gu.expiry < today ? 'err' : 'warn', group: g, text: `خطاب ضمان ${gu.bank} ينتهي ${gu.expiry}`, page: 'hajjSeason' });
      const tot = quotaTotal(ss), used = quotaUsed(S, ss);
      if (tot && used >= tot * 0.9) out.push({ level: used >= tot ? 'err' : 'warn', group: g, text: `الحصة: ${used} من ${tot} تأشيرة`, page: 'hajjDash' });
    }
    out.push(...regAlerts(S, today));
    for (const p of S.hajj.pilgrims.filter(ACTIVE)) {
      const k = pkg(S, p.packageId); if (!k || (season(S, k.seasonId) || {}).closed) continue;
      const bad = eligibility(S, p).filter((x) => x.level === 'err');
      if (bad.length) out.push({ level: 'err', group: g, text: `${p.code} ${p.nameAr}: ${bad[0].text}`, page: 'hajjPilgrim', ref: p.id });
      for (const i of p.installments || []) if (!i.paid && i.due < today) { out.push({ level: 'warn', group: g, text: `${p.code} ${p.nameAr}: قسط ${i.label} متأخر (${Math.round(i.amount)})`, page: 'hajjPilgrim', ref: p.id }); break; }
    }
    return out;
  }


  // ================================================================ applicants → lottery → executive registration
  const APP_STATUS = {
    APPLIED: { ar: 'طلب مبدئي', cls: '' }, INELIGIBLE: { ar: 'غير مستوفي', cls: 'danger' }, WON: { ar: 'فائز — بانتظار التنفيذي', cls: 'ok' }, RESERVE: { ar: 'احتياطي', cls: 'hold' },
    LOST: { ar: 'لم يحالفه الحظ', cls: '' }, EXEC_DONE: { ar: 'تم التسجيل التنفيذي', cls: 'ok' }, EXPIRED: { ar: 'لم يستكمل في المهلة', cls: 'danger' }, WITHDRAWN: { ar: 'اعتذر', cls: '' },
  };
  const regOf = (ss) => ({ execDays: 7, trustAmount: 0, reservePct: 20, seniorAge: 65, wSenior: 1, wFirst: 0.5, wTry: 0.25, ...(ss.reg || {}) });
  const ageAt = (dob, ref) => (dob ? Math.floor((new Date(ref || Date.now()) - new Date(dob)) / (365.25 * 86400000)) : null);
  /** Birth date & gender from an Egyptian national ID (14 digits: C YYMMDD GG SSSS G). Returns null when not decodable. */
  function fromNid(nid) {
    const d = String(nid || '').replace(/\D/g, '');
    if (d.length !== 14 || !['2', '3'].includes(d[0])) return null;
    const y = (d[0] === '2' ? 1900 : 2000) + Number(d.slice(1, 3)), m = d.slice(3, 5), day = d.slice(5, 7);
    if (Number(m) < 1 || Number(m) > 12 || Number(day) < 1 || Number(day) > 31) return null;
    return { dob: `${y}-${m}-${day}`, gender: Number(d[12]) % 2 ? 'M' : 'F' };
  }
  function applicantIssues(S, ss, a) {
    const r = ss.rules || {}, out = [], age = ageAt(a.dob, ss.tarwiyah);
    if (!a.nid) out.push({ level: 'err', text: 'الرقم القومي مطلوب' });
    if (a.lastHajjYear && Number(ss.gregorianYear || new Date().getFullYear()) - Number(a.lastHajjYear) < Number(r.yearsSinceLastHajj ?? 5)) out.push({ level: 'err', text: `آخر حجة ${a.lastHajjYear} — لم تمر ${r.yearsSinceLastHajj ?? 5} سنوات` });
    if (age != null && r.minAge && age < Number(r.minAge)) out.push({ level: 'err', text: `السن ${age} أقل من ${r.minAge}` });
    if (age != null && r.maxAge && age > Number(r.maxAge)) out.push({ level: 'warn', text: `السن ${age} — يحتاج موافقة طبية` });
    if (a.gender === 'F' && r.mahramUnder && age != null && age < Number(r.mahramUnder) && !a.groupKey) out.push({ level: 'warn', text: 'سيدة بدون محرم في نفس المجموعة' });
    return out;
  }
  function apply(S, ssId, d, actor) {
    const ss = season(S, ssId); if (!ss || ss.closed) throw new Error('الموسم غير متاح');
    const nid = String(d.nid || '').replace(/\D/g, '');
    if (!String(d.nameAr || '').trim() || !String(d.phone || '').trim()) throw new Error('اكتب الاسم ورقم الهاتف');
    if (nid && S.hajj.applicants.some((x) => x.seasonId === ssId && x.nid === nid && x.status !== 'WITHDRAWN')) throw new Error('الرقم القومي مسجل بالفعل في هذا الموسم');
    const dec = fromNid(nid), now = Date.now();
    const a = { id: 'HA' + now.toString(36) + Math.random().toString(36).slice(2, 5), code: Acc.nextNo(S, 'HA', 'HA', 5), seasonId: ssId, nameAr: d.nameAr.trim(), nid, phone: d.phone,
      dob: d.dob || (dec ? dec.dob : ''), gender: d.gender || (dec ? dec.gender : 'M'), governorate: d.governorate || '', lastHajjYear: d.lastHajjYear || '', priorTries: Number(d.priorTries) || 0,
      level: d.level || 'ECONOMY', packageId: d.packageId || '', groupKey: String(d.groupKey || '').trim(), portalNo: d.portalNo || '', agentId: d.agentId || null, branchId: d.branchId || 'BR1',
      status: 'APPLIED', rank: null, lotteryId: null, execDeadline: null, pilgrimId: null, notes: d.notes || '', createdAt: now, createdBy: actor.name, log: [{ status: 'APPLIED', at: now, by: actor.name }] };
    if (applicantIssues(S, ss, a).some((x) => x.level === 'err')) { a.status = 'INELIGIBLE'; a.log.push({ status: 'INELIGIBLE', at: now, by: 'النظام' }); }
    const c = S.customers.find((x) => (nid && x.nid === nid) || String(x.phone || '').replace(/\D/g, '') === String(d.phone).replace(/\D/g, ''));
    if (c) a.customerId = c.id;
    else { const nc = { id: 'CU' + now.toString(36) + Math.random().toString(36).slice(2, 5), code: Acc.nextNo(S, 'C_CUS', 'CUS', 4), name: a.nameAr, phone: d.phone, nid, notes: 'طالب حج', createdAt: now }; S.customers.push(nc); a.customerId = nc.id; }
    S.hajj.applicants.push(a);
    return a;
  }
  function setApp(a, status, by, note) { a.status = status; (a.log = a.log || []).push({ status, at: Date.now(), by, note: note || '' }); return a; }
  /** Refundable good-faith deposit still held for the applicant (2109 on his customer account). */
  const trustBalance = (S, a) => -r2(S.journal.reduce((s, j) => s + j.lines.filter((l) => l.acc === '2109' && l.party && l.party.type === 'customer' && l.party.id === a.customerId).reduce((x, l) => x + l.dr - l.cr, 0), 0));

  // ---- verifiable pseudo-random draw: same seed → same result (xmur3 + mulberry32)
  function rng(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = (h ^ (h >>> 16)) >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
  function lotteryUnits(S, ss, level) {
    const list = S.hajj.applicants.filter((a) => a.seasonId === ss.id && a.status === 'APPLIED' && a.level === level && !(a.agentRequest && a.agentRequest.state === 'PENDING')).sort((a, b) => (a.code < b.code ? -1 : 1));
    const m = new Map(); for (const a of list) { const k = a.groupKey || a.id; if (!m.has(k)) m.set(k, []); m.get(k).push(a); }
    return [...m.entries()].map(([key, members]) => ({ key, members }));
  }
  function unitWeight(ss, u) {
    const g = regOf(ss), ref = ss.tarwiyah;
    let w = 1;
    if (u.members.some((a) => (ageAt(a.dob, ref) || 0) >= g.seniorAge)) w += Number(g.wSenior) || 0;
    if (u.members.every((a) => !a.lastHajjYear)) w += Number(g.wFirst) || 0;
    w += (Number(g.wTry) || 0) * Math.max(...u.members.map((a) => a.priorTries || 0));
    return w;
  }
  /**
   * Internal lottery per level: weighted draw without replacement (Efraimidis–Spirakis keys u^(1/w)),
   * families as one unit (skipped to the reserve rather than split), ranked reserve list, auditable hash.
   */
  function runLottery(S, ssId, { seed, seats, witnesses }, actor, today = E.iso(new Date())) {
    const ss = season(S, ssId), g = regOf(ss);
    if (!String(seed || '').trim()) throw new Error('اكتب بذرة القرعة (تُعلن أمام الحضور)');
    const rand = rng(String(seed).trim()), results = [], deadline = E.iso(E.addDays(today, g.execDays));
    for (const level of Object.keys(LEVELS)) {
      const n = Number((seats || {})[level] || 0), units = lotteryUnits(S, ss, level);
      if (!units.length) continue;
      const keyed = units.map((u) => ({ u, w: unitWeight(ss, u), k: Math.pow(rand(), 1 / unitWeight(ss, u)) })).sort((a, b) => b.k - a.k);
      let left = n, rank = 0; const reserveMax = Math.ceil(n * Number(g.reservePct || 0) / 100);
      for (const x of keyed) {
        let res;
        if (x.u.members.length <= left) { res = 'WON'; left -= x.u.members.length; }
        else if (rank < reserveMax) { res = 'RESERVE'; rank++; }
        else res = 'LOST';
        for (const a of x.u.members) { results.push({ applicantId: a.id, code: a.code, level, result: res, rank: res === 'RESERVE' ? rank : null, weight: r2(x.w) }); }
      }
    }
    if (!results.length) throw new Error('لا توجد طلبات مستوفية في انتظار القرعة');
    const lot = { id: uid('LT'), seasonId: ssId, mode: 'INTERNAL', date: today, seed: String(seed).trim(), seats: { ...seats }, params: { ...g }, witnesses: witnesses || '', by: actor.name, at: Date.now(), results,
      hash: fnv(results.map((r) => `${r.code}:${r.result}:${r.rank || ''}`).join('|')) };
    for (const r of results) { const a = S.hajj.applicants.find((x) => x.id === r.applicantId); a.lotteryId = lot.id; a.rank = r.rank; a.execDeadline = r.result === 'WON' ? deadline : null; setApp(a, r.result, actor.name, `قرعة ${lot.date}`); }
    S.hajj.lotteries.push(lot);
    return lot;
  }
  /** Replay a lottery from its stored inputs → must give the same hash (audit). */
  function verifyLottery(S, lot) {
    const saved = S.hajj.applicants;
    const clone = saved.map((a) => ({ ...a, status: lot.results.some((r) => r.applicantId === a.id) ? 'APPLIED' : a.status === 'APPLIED' ? 'X' : a.status }));
    const S2 = { ...S, hajj: { ...S.hajj, applicants: clone, lotteries: [] }, counters: { ...S.counters } };
    const ss = { ...season(S, lot.seasonId), reg: lot.params };
    S2.hajj.seasons = S.hajj.seasons.map((x) => (x.id === ss.id ? ss : x));
    try { return runLottery(S2, lot.seasonId, { seed: lot.seed, seats: lot.seats }, { name: 'تحقق' }, lot.date).hash === lot.hash; } catch (e) { return false; }
  }
  /** Official (external) results: one line per applicant "رقم قومي أو رقم طلب | فائز/احتياطي/خاسر | ترتيب". */
  function recordOfficial(S, ssId, text, actor, today = E.iso(new Date())) {
    const ss = season(S, ssId), g = regOf(ss), map = { 'فائز': 'WON', WON: 'WON', 'احتياطي': 'RESERVE', RESERVE: 'RESERVE', 'خاسر': 'LOST', 'لم يحالفه الحظ': 'LOST', LOST: 'LOST' };
    const results = [], missing = [];
    for (const line of String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)) {
      const [id, res, rank] = line.split(/[|,\t]/).map((x) => x.trim());
      const a = S.hajj.applicants.find((x) => x.seasonId === ssId && (x.nid === id.replace(/\D/g, '') || (x.portalNo && x.portalNo === id)) && !['EXEC_DONE', 'WITHDRAWN'].includes(x.status));
      if (!a || !map[res]) { missing.push(line); continue; }
      results.push({ applicantId: a.id, code: a.code, level: a.level, result: map[res], rank: map[res] === 'RESERVE' ? Number(rank) || null : null });
    }
    if (!results.length) throw new Error('لم يتم التعرف على أي سطر');
    const lot = { id: uid('LT'), seasonId: ssId, mode: 'OFFICIAL', date: today, by: actor.name, at: Date.now(), results, hash: fnv(results.map((r) => `${r.code}:${r.result}:${r.rank || ''}`).join('|')) };
    for (const r of results) { const a = S.hajj.applicants.find((x) => x.id === r.applicantId); a.lotteryId = lot.id; a.rank = r.rank; a.execDeadline = r.result === 'WON' ? E.iso(E.addDays(today, g.execDays)) : null; setApp(a, r.result, actor.name, 'نتيجة القرعة الرسمية'); }
    S.hajj.lotteries.push(lot);
    return { lottery: lot, missing };
  }
  /** Next reserve (lowest rank, same level) becomes a winner with a fresh deadline. */
  function promoteReserve(S, ssId, level, by, today = E.iso(new Date())) {
    const ss = season(S, ssId), next = S.hajj.applicants.filter((a) => a.seasonId === ssId && a.status === 'RESERVE' && a.level === level).sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9))[0];
    if (!next) return null;
    next.execDeadline = E.iso(E.addDays(today, regOf(ss).execDays)); setApp(next, 'WON', by, 'تصعيد من الاحتياطي');
    return next;
  }
  function expireOverdue(S, ssId, by, today = E.iso(new Date())) {
    const out = { expired: [], promoted: [] };
    for (const a of S.hajj.applicants.filter((x) => x.seasonId === ssId && x.status === 'WON' && x.execDeadline && x.execDeadline < today)) {
      setApp(a, 'EXPIRED', by, `انتهت المهلة ${a.execDeadline}`); out.expired.push(a);
      const p = promoteReserve(S, ssId, a.level, by, today); if (p) out.promoted.push(p);
    }
    return out;
  }
  function withdraw(S, a, by, reason) {
    const was = a.status; setApp(a, 'WITHDRAWN', by, reason);
    return was === 'WON' ? promoteReserve(S, a.seasonId, a.level, by) : null;
  }
  /** Winner → pilgrim (contract, installments, file). The good-faith deposit is moved by a DT voucher (UI). */
  function executiveRegister(S, a, d, actor) {
    if (a.status !== 'WON') throw new Error('التسجيل التنفيذي للفائزين فقط');
    const k = pkg(S, d.packageId); if (!k || k.seasonId !== a.seasonId) throw new Error('اختر برنامجاً من نفس الموسم');
    if (a.level && k.level !== a.level) throw new Error(`الفائز في مستوى ${LEVELS[a.level]} — اختر برنامجاً من نفس المستوى`);
    const p = register(S, { packageId: k.id, nameAr: a.nameAr, nameEn: d.nameEn || '', gender: a.gender, dob: a.dob, nid: a.nid, phone: a.phone, passport: d.passport || '', passportExp: d.passportExp || '',
      lastHajjYear: a.lastHajjYear, nusuk: d.nusuk || 'TAMATTU', roomType: d.roomType, familyId: a.groupKey || null, agentId: a.agentId, discountPct: d.discountPct || 0, upgrades: d.upgrades || [], branchId: a.branchId }, actor);
    if (p.stage === 'WAITLIST') throw new Error('الحصة مكتملة — راجع الحصة قبل التسجيل التنفيذي');
    p.customerId = a.customerId; p.applicantId = a.id; a.pilgrimId = p.id; setApp(a, 'EXEC_DONE', actor.name, p.code);
    return { pilgrim: p, trust: trustBalance(S, a) };
  }
  function regAlerts(S, today = E.iso(new Date())) {
    const out = [], soon = E.iso(E.addDays(today, 2));
    for (const a of S.hajj.applicants.filter((x) => x.status === 'WON' && x.execDeadline)) {
      if (a.execDeadline < today) out.push({ level: 'err', group: 'الحج', text: `${a.code} ${a.nameAr}: انتهت مهلة التسجيل التنفيذي ${a.execDeadline} — صعّد الاحتياطي`, page: 'hajjApplicants' });
      else if (a.execDeadline <= soon) out.push({ level: 'warn', group: 'الحج', text: `${a.code} ${a.nameAr}: مهلة التسجيل التنفيذي تنتهي ${a.execDeadline}`, page: 'hajjApplicants' });
    }
    return out;
  }

  // ------------------------------------------------------------ demo
  function seedDemo(S, now = Date.now()) {
    S.hajj = empty();
    const day = (n) => E.iso(E.addDays(new Date(now), n));
    const ss = { id: uid('SS'), code: 'HJ-1448', name: 'موسم حج 1448 هـ', hijriYear: 1448, gregorianYear: 2027, tarwiyah: '2027-05-14', fxLock: 13.2, usdRate: 49.5, closed: false,
      quota: [{ id: 'Q1', source: 'MINISTRY', name: 'حصة الشركة من الوزارة', visas: 60, fee: 0 }, { id: 'Q2', source: 'PARTNER', name: 'تضامن مع شركة الهدى', visas: 25, fee: 4500 }],
      guarantees: [{ id: 'G1', bank: 'بنك مصر', amount: 1500000, ref: 'LG-2027-118', expiry: '2027-08-30' }],
      deadlines: [{ id: 'D1', label: 'آخر موعد تسجيل الحجاج', date: day(45), done: false }, { id: 'D2', label: 'سداد باقات المشاعر على نسك', date: day(90), done: false },
        { id: 'D3', label: 'رفع بيانات الحجاج والتأشيرات', date: day(150), done: false }],
      rules: { yearsSinceLastHajj: 5, passportMonths: 6, minAge: 18, maxAge: 80, mahramUnder: 45 } };
    S.hajj.seasons.push(ss);
    const plan = [{ label: 'مقدم الحجز', pct: 30, daysBefore: 200 }, { label: 'القسط الثاني', pct: 40, daysBefore: 120 }, { label: 'القسط الأخير', pct: 30, daysBefore: 45 }];
    const cancelPolicy = [{ daysBefore: 180, feePct: 5 }, { daysBefore: 90, feePct: 25 }, { daysBefore: 45, feePct: 60 }, { daysBefore: 15, feePct: 100 }];
    const K = (o) => { const x = { id: uid('HP'), seasonId: ss.id, plan, cancelPolicy, upgrades: [], commissions: { default: 2500 }, hadyIncluded: false, hadySar: 750, nonRefundableAfterSubmit: 25000, ...o }; S.hajj.packages.push(x); return x; };
    const five = K({ code: 'HJ-1448-5S', name: 'حج خمس نجوم — 20 يوم', level: 'FIVE', duration: 'LONG', route: 'MAD_FIRST', transport: 'AIR', mashair: 'A', capacity: 45, departDate: '2027-05-01', returnDate: '2027-05-20',
      stays: [{ city: 'MAD', hotel: 'فندق المركزية الشمالية 5*', nights: 5, currency: 'SAR', cost: { QUAD: 1400, TRIPLE: 1750, DOUBLE: 2400 } }, { city: 'MAK', hotel: 'برج على الحرم 5* (قبل الحج)', nights: 7, currency: 'SAR', cost: { QUAD: 5600, TRIPLE: 7200, DOUBLE: 9800 } },
        { city: 'MAK', hotel: 'برج على الحرم 5* (بعد الحج)', nights: 4, currency: 'SAR', cost: { QUAD: 4200, TRIPLE: 5400, DOUBLE: 7300 } }],
      costItems: [{ id: 'C1', cat: 'MASHAIR', name: 'باقة المشاعر الفئة A (منى وعرفات)', currency: 'SAR', amount: 12500, per: 'PAX' }, { id: 'C2', cat: 'AIR', name: 'طيران القاهرة/المدينة — جدة/القاهرة', currency: 'EGP', amount: 38000, per: 'PAX' },
        { id: 'C3', cat: 'VISA', name: 'رسوم التأشيرة والتأمين والخدمات', currency: 'SAR', amount: 1100, per: 'PAX' }, { id: 'C4', cat: 'TRANSPORT', name: 'النقل الداخلي (حافلات)', currency: 'SAR', amount: 950, per: 'PAX' },
        { id: 'C5', cat: 'FOOD', name: 'الإعاشة (بوفيه 3 وجبات)', currency: 'SAR', amount: 2200, per: 'PAX' }, { id: 'C6', cat: 'STAFF', name: 'المشرفون والطبيب والإداريون', currency: 'EGP', amount: 380000, per: 'GROUP' },
        { id: 'C7', cat: 'GIFTS', name: 'شنط وإحرامات وهدايا', currency: 'EGP', amount: 2500, per: 'PAX' }],
      prices: { QUAD: 480000, TRIPLE: 520000, DOUBLE: 575000 }, upgrades: [{ id: 'U1', name: 'ترقية مخيم منى VIP', price: 45000 }] });
    const eco = K({ code: 'HJ-1448-EC', name: 'حج اقتصادي — العزيزية 25 يوم', level: 'ECONOMY', duration: 'LONG', route: 'MAD_AFTER', transport: 'AIR', mashair: 'D', capacity: 40, departDate: '2027-04-28', returnDate: '2027-05-23',
      stays: [{ city: 'AZZ', hotel: 'عمارات العزيزية', nights: 14, currency: 'SAR', cost: { QUAD: 2600, TRIPLE: 3100 } }, { city: 'MAD', hotel: 'فندق المدينة 3*', nights: 5, currency: 'SAR', cost: { QUAD: 900, TRIPLE: 1150 } }],
      costItems: [{ id: 'C1', cat: 'MASHAIR', name: 'باقة المشاعر الفئة D', currency: 'SAR', amount: 7800, per: 'PAX' }, { id: 'C2', cat: 'AIR', name: 'طيران ذهاب وعودة', currency: 'EGP', amount: 34000, per: 'PAX' },
        { id: 'C3', cat: 'VISA', name: 'رسوم التأشيرة والتأمين والخدمات', currency: 'SAR', amount: 1100, per: 'PAX' }, { id: 'C4', cat: 'TRANSPORT', name: 'النقل', currency: 'SAR', amount: 800, per: 'PAX' },
        { id: 'C6', cat: 'STAFF', name: 'المشرفون', currency: 'EGP', amount: 240000, per: 'GROUP' }],
      prices: { QUAD: 330000, TRIPLE: 355000 }, partnerVisaFee: 4500 });
    S.counters.C_HP = 2;
    const actor = { name: 'منة الله (سيلز)', role: 'OWNER', staffId: 'U1' };
    const R = (k, o) => register(S, { packageId: k.id, gender: 'M', roomType: 'QUAD', nusuk: 'TAMATTU', passportExp: '2029-06-01', ...o }, actor);
    const reg = [];
    const names = [['عبد الرحمن سالم', 'M', 1968, ''], ['فاطمة عبد الرحمن', 'F', 1972, ''], ['محمود الشربيني', 'M', 1960, '2015'], ['سعاد إبراهيم', 'F', 1965, ''], ['خالد عبد العظيم', 'M', 1975, '2024'],
      ['نادية كمال', 'F', 1958, ''], ['حسن مصطفى', 'M', 1955, ''], ['زينب حسن', 'F', 1957, ''], ['أحمد فتحي', 'M', 1980, ''], ['منى جلال', 'F', 1983, ''], ['يوسف رضا', 'M', 1970, ''], ['كريمة عادل', 'F', 1990, '']];
    names.forEach(([n, g, y, last], i) => {
      const k = i < 8 ? five : eco, fam = i === 0 || i === 1 ? 'F1' : i === 6 || i === 7 ? 'F2' : null;
      const p = R(k, { nameAr: n, gender: g, dob: `${y}-0${(i % 9) + 1}-15`, phone: '0120' + String(5550000 + i * 1311), passport: 'A' + (31000000 + i * 977), lastHajjYear: last, familyId: fam, roomType: fam ? 'DOUBLE' : k === five ? (i % 2 ? 'TRIPLE' : 'QUAD') : 'QUAD',
        passportExp: i === 9 ? '2027-06-10' : '2029-06-01', upgrades: i === 0 ? ['U1'] : [] });
      if (i === 1) p.mahramId = reg[0].id;
      if (i === 7) p.mahramId = reg[6].id;
      reg.push(p);
    });
    reg[2].stage = 'DOCS'; reg[3].stage = 'SUBMITTED';
    // initial registrations waiting for the lottery (some as family groups)
    ss.reg = { initialFrom: day(-20), initialTo: day(40), lotteryDate: day(45), execDays: 7, trustAmount: 10000, reservePct: 30, seniorAge: 65, wSenior: 1, wFirst: 0.5, wTry: 0.25 };
    // demo national IDs built like real ones: century, YYMMDD, governorate, serial, gender digit (odd = male), check digit
    const nidOf = (y, m, d, male, i) => `${y >= 2000 ? 3 : 2}${String(y).slice(2)}${m}${d}01${String(1000 + i).slice(1)}${male ? 1 + (i % 5) * 2 : (i % 5) * 2}${i % 10}`;
    const apps = [['سيد عبد الله', 1956, '03', '15', 1, 'ECONOMY', 'أسرة سيد', 2], ['رشا سيد', 1965, '11', '20', 0, 'ECONOMY', 'أسرة سيد', 0], ['محمد سيد عبد الله', 1988, '07', '01', 1, 'ECONOMY', 'أسرة سيد', 0],
      ['عادل منصور', 1955, '08', '12', 1, 'ECONOMY', '', 1], ['هدى عادل', 1962, '04', '25', 0, 'ECONOMY', '', 0], ['مصطفى جمعة', 1970, '01', '18', 1, 'ECONOMY', '', 0], ['ليلى فؤاد', 1959, '12', '09', 0, 'ECONOMY', '', 3],
      ['إبراهيم الدسوقي', 1951, '11', '11', 1, 'FIVE', 'أسرة الدسوقي', 0], ['ثناء إبراهيم', 1956, '10', '10', 0, 'FIVE', 'أسرة الدسوقي', 0], ['طارق سعيد', 1975, '05', '05', 1, 'FIVE', '', 1],
      ['نهال طارق', 1978, '06', '06', 0, 'FIVE', '', 0], ['وليد حمدي', 1968, '03', '03', 1, 'FIVE', '', 0], ['سامية مختار', 1954, '07', '07', 0, 'FIVE', '', 2]];
    apps.forEach(([n, y, m, d, male, level, grp, tries], i) => {
      try { apply(S, ss.id, { nameAr: n, nid: nidOf(y, m, d, male, i), phone: '0111' + String(4440000 + i * 2711), level, groupKey: grp, priorTries: tries }, actor); } catch (e) { /* demo */ } });
    return { season: ss, five, eco, pilgrims: reg };
  }

  return { APP_STATUS, regOf, ageAt, fromNid, applicantIssues, apply, setApp, trustBalance, rng, fnv, lotteryUnits, unitWeight, runLottery, verifyLottery, recordOfficial, promoteReserve, expireOverdue, withdraw, executiveRegister, regAlerts, LEVELS, DURATION, ROUTE, TRANSPORT, MASHAIR, CITIES, ROOMS, NUSUK, NEEDS_HADY, COST_CATS, STAGES, DOCS, ACTIVE, empty, normalize, uid, season, pkg, costCenter, fxOf, hajjDays,
    costSheet, eligibility, priceFor, quotaUsed, quotaTotal, register, promote, setStage, cancelFee, cancel, units, autoGroups, autoRooms, autoTents, packageNumbers, closeSeason, alerts, seedDemo };
});
