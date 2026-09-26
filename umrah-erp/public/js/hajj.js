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

  const empty = () => ({ seasons: [], packages: [], pilgrims: [], groups: [] });
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
    for (const p of S.hajj.pilgrims.filter(ACTIVE)) {
      const k = pkg(S, p.packageId); if (!k || (season(S, k.seasonId) || {}).closed) continue;
      const bad = eligibility(S, p).filter((x) => x.level === 'err');
      if (bad.length) out.push({ level: 'err', group: g, text: `${p.code} ${p.nameAr}: ${bad[0].text}`, page: 'hajjPilgrim', ref: p.id });
      for (const i of p.installments || []) if (!i.paid && i.due < today) { out.push({ level: 'warn', group: g, text: `${p.code} ${p.nameAr}: قسط ${i.label} متأخر (${Math.round(i.amount)})`, page: 'hajjPilgrim', ref: p.id }); break; }
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
    return { season: ss, five, eco, pilgrims: reg };
  }

  return { LEVELS, DURATION, ROUTE, TRANSPORT, MASHAIR, CITIES, ROOMS, NUSUK, NEEDS_HADY, COST_CATS, STAGES, DOCS, ACTIVE, empty, normalize, uid, season, pkg, costCenter, fxOf, hajjDays,
    costSheet, eligibility, priceFor, quotaUsed, quotaTotal, register, promote, setStage, cancelFee, cancel, units, autoGroups, autoRooms, autoTents, packageNumbers, closeSeason, alerts, seedDemo };
});
