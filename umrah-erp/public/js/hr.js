/* =====================================================================
 * أفواج — HR engine (pure logic; browser + server)
 *  employees · attendance (server-time punches) · leaves & balances ·
 *  rewards/penalties/warnings · tasks · targets · evaluations ·
 *  KPIs measured from real system activity · composite score & rating ·
 *  payroll (lateness/absence/unpaid-leave deductions, overtime,
 *  commission, advances recovery) with journal posting · monitoring flags
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./accounting.js'));
  else root.Hr = factory(root.Engine, root.Acc);
})(typeof self !== 'undefined' ? self : this, function (E, Acc) {
  'use strict';
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const LEAVE_TYPES = { ANNUAL: 'اعتيادية', SICK: 'مرضية', CASUAL: 'عارضة', UNPAID: 'بدون أجر' };
  const ADJ_KINDS = { REWARD: 'مكافأة', PENALTY: 'جزاء مالي', WARNING: 'إنذار' };
  const EVAL_CRITERIA = { commitment: 'الالتزام والانضباط', service: 'خدمة العملاء', teamwork: 'العمل الجماعي', quality: 'جودة العمل والدقة', initiative: 'المبادرة والتطوير' };
  /** What a monthly target measures. Money targets are measured on sales value or on the profit the employee generated. */
  const TARGET_METRICS = {
    BOOKINGS: { ar: 'عدد الحجوزات', unit: 'حجز', money: false }, PAX: { ar: 'عدد الأفراد / المعتمرين', unit: 'فرد', money: false },
    SALES: { ar: 'قيمة المبيعات', unit: 'ج.م', money: true }, PROFIT: { ar: 'الربحية (هامش الربح المحقق)', unit: 'ج.م', money: true },
    COLLECTIONS: { ar: 'التحصيل', unit: 'ج.م', money: true },
  };
  const MIN_SALARY_MULTIPLE = 4; // the system refuses any target worth less than 4× the employee's monthly pay
  const EMP_STATUS = { ACTIVE: 'على رأس العمل', LEAVE: 'في إجازة', SUSPENDED: 'موقوف', TERMINATED: 'منتهي الخدمة' };
  const TZ = { EG: 'Africa/Cairo', SA: 'Asia/Riyadh', AE: 'Asia/Dubai', KW: 'Asia/Kuwait', JO: 'Asia/Amman', OTHER: 'Africa/Cairo' };
  const HR_ADMINS = ['OWNER', 'MANAGER', 'HR'];

  const empty = () => ({
    settings: { workStart: '09:00', workEnd: '17:00', graceMin: 15, offDays: [5], monthDays: 26, lateBlockMin: 30, lateBlockDay: 0.25, absenceDays: 1,
      overtimeRate: 1.5, annual: 21, sick: 15, casual: 6, weights: { target: 40, attendance: 25, evaluation: 25, tasks: 10 } },
    departments: [{ id: 'D1', name: 'الإدارة' }, { id: 'D2', name: 'المبيعات' }, { id: 'D3', name: 'العمليات والتسكين' }, { id: 'D4', name: 'الحسابات' }],
    attendance: [], leaves: [], adjustments: [], targets: [], evaluations: [], tasks: [], payroll: [],
  });
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const mins = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const monthOf = (iso) => String(iso).slice(0, 7);
  const monthOfMs = (ms) => E.iso(new Date(ms)).slice(0, 7);
  function daysOfMonth(period) { const [y, m] = period.split('-').map(Number); const n = new Date(y, m, 0).getDate(); return Array.from({ length: n }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`); }
  const dow = (iso) => new Date(iso + 'T12:00:00').getDay();
  /** Local date/time in the company's timezone — punches always use SERVER time, never the device clock. */
  function localNow(country, now = Date.now()) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ[country] || TZ.EG, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const p = Object.fromEntries(f.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
  }
  const empOfUser = (S, userId) => S.employees.find((e) => e.userId && Number(e.userId) === Number(userId));
  const activeEmps = (S) => S.employees.filter((e) => (e.status || 'ACTIVE') !== 'TERMINATED');

  // ------------------------------------------------------------ self-service
  function punch(S, empId, now, geo) {
    const emp = S.employees.find((e) => e.id === empId);
    if (!emp) throw new Error('ملف الموظف غير موجود');
    const t = localNow(S.company.country, now);
    const rec = S.hr.attendance.find((a) => a.empId === empId && a.date === t.date);
    if (!rec) { const a = { id: uid('AT'), empId, date: t.date, in: t.time, out: null, source: 'SELF', geoIn: geo || null, at: now }; S.hr.attendance.push(a); return { kind: 'IN', rec: a }; }
    if (!rec.out) { rec.out = t.time; rec.geoOut = geo || null; return { kind: 'OUT', rec }; }
    throw new Error('تم تسجيل الحضور والانصراف لهذا اليوم بالفعل');
  }
  function requestLeave(S, empId, { type, from, to, reason, fileId }, by) {
    if (!LEAVE_TYPES[type]) throw new Error('نوع إجازة غير معروف');
    if (!from || !to || to < from) throw new Error('تواريخ الإجازة غير صحيحة');
    const days = workdaysBetween(S, from, to);
    if (!days) throw new Error('الفترة لا تحتوي أيام عمل');
    if (type !== 'UNPAID') { const bal = leaveBalance(S, empId, from.slice(0, 4))[type]; if (days > bal.remaining) throw new Error(`الرصيد المتاح ${bal.remaining} يوم فقط`); }
    const overlap = S.hr.leaves.some((l) => l.empId === empId && l.status !== 'REJECTED' && !(l.to < from || l.from > to));
    if (overlap) throw new Error('يوجد طلب إجازة متداخل مع نفس الفترة');
    const l = { id: uid('LV'), empId, type, from, to, days, reason: String(reason || '').slice(0, 300), fileId: fileId || null, status: 'PENDING', by, at: Date.now() };
    S.hr.leaves.push(l);
    return l;
  }
  function setTaskStatus(S, taskId, empId, status) {
    const t = S.hr.tasks.find((x) => x.id === taskId && (!empId || x.empId === empId));
    if (!t) throw new Error('المهمة غير موجودة');
    t.status = status; t.doneAt = status === 'DONE' ? Date.now() : null;
    return t;
  }

  // ------------------------------------------------------------ attendance
  function workdaysBetween(S, from, to) {
    let n = 0; for (let d = from; d <= to; d = E.iso(E.addDays(d, 1))) if (!S.hr.settings.offDays.includes(dow(d))) n++;
    return n;
  }
  function onLeave(S, empId, date) { return S.hr.leaves.find((l) => l.empId === empId && l.status === 'APPROVED' && date >= l.from && date <= l.to); }
  /** Monthly attendance: each workday until today is present / late / leave / absent. */
  function attendanceMonth(S, empId, period, today = E.iso(new Date())) {
    const st = S.hr.settings, emp = S.employees.find((e) => e.id === empId);
    const start = mins(st.workStart), end = mins(st.workEnd);
    const out = { days: [], workdays: 0, present: 0, absent: 0, leaveDays: 0, unpaidDays: 0, lateCount: 0, lateMinutes: 0, earlyLeaveMinutes: 0, overtimeMinutes: 0, missingOut: 0 };
    for (const d of daysOfMonth(period)) {
      const off = st.offDays.includes(dow(d));
      const beforeHire = emp && emp.hireDate && d < emp.hireDate;
      const rec = S.hr.attendance.find((a) => a.empId === empId && a.date === d);
      const lv = onLeave(S, empId, d);
      let code = 'FUTURE', late = 0, ot = 0;
      if (beforeHire) code = 'NA';
      else if (off) code = rec ? 'OFF_WORK' : 'OFF';
      else if (d > today) code = lv ? 'LEAVE' : 'FUTURE';
      else if (lv) { code = 'LEAVE'; out.leaveDays++; if (lv.type === 'UNPAID') out.unpaidDays++; }
      else if (rec) {
        out.present++;
        late = Math.max(0, mins(rec.in) - start);
        if (late > st.graceMin) { out.lateCount++; out.lateMinutes += late; code = 'LATE'; } else { late = 0; code = 'PRESENT'; }
        if (rec.out) { ot = Math.max(0, mins(rec.out) - end); out.overtimeMinutes += ot; out.earlyLeaveMinutes += Math.max(0, end - mins(rec.out)); }
        else if (d < today) out.missingOut++;
      } else if (d < today || (d === today && mins(localNow(S.company.country).time) > end)) { out.absent++; code = 'ABSENT'; }
      if (!off && !beforeHire && d <= today) out.workdays++;
      if (code === 'OFF_WORK' && rec && rec.out) { ot = mins(rec.out) - mins(rec.in); out.overtimeMinutes += Math.max(0, ot); }
      out.days.push({ date: d, code, rec, late, ot, leave: lv || null });
    }
    out.attendancePct = out.workdays ? r2(((out.present + out.leaveDays - out.unpaidDays) / out.workdays) * 100) : 100;
    return out;
  }
  function leaveBalance(S, empId, year) {
    const st = S.hr.settings, res = {};
    for (const t of Object.keys(LEAVE_TYPES)) {
      const used = S.hr.leaves.filter((l) => l.empId === empId && l.type === t && l.status === 'APPROVED' && l.from.startsWith(year)).reduce((s, l) => s + l.days, 0);
      const pending = S.hr.leaves.filter((l) => l.empId === empId && l.type === t && l.status === 'PENDING' && l.from.startsWith(year)).reduce((s, l) => s + l.days, 0);
      const entitled = t === 'ANNUAL' ? st.annual : t === 'SICK' ? st.sick : t === 'CASUAL' ? st.casual : 0;
      res[t] = { entitled, used, pending, remaining: t === 'UNPAID' ? Infinity : Math.max(0, entitled - used - pending) };
    }
    return res;
  }

  // ------------------------------------------------------------ KPIs
  /** Everything an employee did in the system during a month, attributed by linked staff ids / display names. */
  /** Profit a booking brings (ex-tax, after cost and agent commission). Domestic: real cost; Umrah: from the trip margin. */
  function bookingProfit(S, b, trip) {
    const c = S.company || {}, k = 100 + (c.vatEnabled ? Number(c.vatRate || 0) : 0) + (c.stampEnabled ? Number(c.stampRate || 0) : 0);
    const exTax = (b.net || 0) * 100 / k;
    let cost;
    if (b.domestic) cost = Number(b.cost || 0);
    else {
      const m = Number((trip && trip.marginPct) || 10), list = (b.net || 0) / Math.max(0.01, 1 - (Number(b.discountPct) || 0) / 100);
      cost = (list * 100 / k) / (1 + m / 100);
    }
    return r2(exTax - cost - (b.agentCommission || 0));
  }
  /** Company averages used to translate count targets into money (last 180 days of live bookings). */
  function averages(S) {
    const since = Date.now() - 180 * 86400000, rows = [];
    for (const d of S.trips || []) for (const b of d.bookings) if (b.createdAt >= since && ['DEPOSIT', 'CONFIRMED'].includes(b.status)) rows.push({ net: b.net || 0, pax: d.pax.filter((p) => p.bookingId === b.id).length });
    for (const b of (S.dom && S.dom.bookings) || []) if (b.createdAt >= since && ['DEPOSIT', 'CONFIRMED'].includes(b.status)) rows.push({ net: b.net || 0, pax: b.units ? b.units.adults + b.units.chd : 1 });
    const n = rows.length, sum = rows.reduce((s, x) => s + x.net, 0), pax = rows.reduce((s, x) => s + x.pax, 0);
    return { perBooking: n ? sum / n : 0, perPax: pax ? sum / pax : 0 };
  }
  const monthlyPay = (emp) => (Number(emp.salary) || 0) + (Number(emp.allowances) || 0);
  /** Smallest acceptable target for a metric: worth at least 4× the monthly pay (counts converted with company averages). */
  function targetMinimum(S, emp, metric) {
    const floor = MIN_SALARY_MULTIPLE * monthlyPay(emp);
    if (!floor) return 0;
    if (TARGET_METRICS[metric].money) return Math.ceil(floor);
    const av = averages(S), unit = metric === 'PAX' ? av.perPax : av.perBooking;
    return unit > 0 ? Math.ceil(floor / unit) : 1;
  }
  function validateTarget(S, emp, t) {
    if (!TARGET_METRICS[t.metric]) throw new Error('اختر نوع التارجت');
    if (!(Number(t.value) > 0)) throw new Error('اكتب قيمة التارجت');
    const min = targetMinimum(S, emp, t.metric);
    if (Number(t.value) < min) throw new Error(`التارجت لا يقل عن ${MIN_SALARY_MULTIPLE} أضعاف راتب ${emp.name} (${Math.round(monthlyPay(emp))}) — الحد الأدنى ${min} ${TARGET_METRICS[t.metric].unit}`);
    const inc = t.incentive || {};
    if (inc.type === 'FIXED' && !(Number(inc.amount) > 0)) throw new Error('اكتب مبلغ الحافز');
    if (inc.type === 'PCT' && !(Number(inc.pct) > 0 && Number(inc.pct) <= 50)) throw new Error('نسبة الحافز بين 0 و 50%');
    return true;
  }
  /** Incentive earned when the target is reached: fixed amount or % of the sales/profit achieved. */
  function targetBonus(S, emp, period, k) {
    const t = k.target;
    if (!t || !t.metric || !t.incentive || t.incentive.type === 'NONE' || !(k.actuals[t.metric] >= t.value)) return 0;
    if (t.incentive.type === 'FIXED') return r2(Number(t.incentive.amount) || 0);
    return r2((t.incentive.base === 'PROFIT' ? Math.max(0, k.profit) : k.sales) * (Number(t.incentive.pct) || 0) / 100);
  }
  function kpis(S, emp, period) {
    const ids = new Set([...(emp.staffIds || []), emp.userId ? 'SU' + emp.userId : null].filter(Boolean));
    const names = new Set([emp.name, ...(emp.aliases || [])]);
    const mine = (x) => ids.has(x.userId) || names.has(x.createdBy);
    const bookings = [];
    for (const d of S.trips || []) for (const b of d.bookings) if (mine(b) && monthOfMs(b.createdAt) === period) bookings.push({ b, trip: d.trip, pax: d.pax.filter((p) => p.bookingId === b.id).length });
    for (const b of (S.dom && S.dom.bookings) || []) if (mine(b) && monthOfMs(b.createdAt) === period) bookings.push({ b, pax: b.units ? b.units.adults + b.units.chd + b.units.inf : 0 });
    const live = bookings.filter(({ b }) => ['DEPOSIT', 'CONFIRMED'].includes(b.status));
    const sales = r2(live.reduce((s, { b }) => s + (b.net || 0), 0));
    const profit = r2(live.reduce((s, x) => s + bookingProfit(S, x.b, x.trip), 0));
    const vouchers = S.vouchers.filter((v) => names.has(v.createdBy) && monthOfMs(v.createdAt) === period);
    const collections = r2(vouchers.filter((v) => v.type === 'RV' && v.status === 'POSTED').reduce((s, v) => s + v.amount * (v.currency === 'EGP' ? 1 : v.fx), 0));
    const approved = S.vouchers.filter((v) => names.has(v.approvedBy) && v.approvedAt && monthOfMs(v.approvedAt) === period && v.status !== 'REJECTED');
    const approveHours = approved.length ? r2(approved.reduce((s, v) => s + (v.approvedAt - v.createdAt) / 3600000, 0) / approved.length) : null;
    const discounts = bookings.filter(({ b }) => b.discountPct > 0);
    const todayIso = E.iso(new Date());
    const tasks = S.hr.tasks.filter((t) => t.empId === emp.id && monthOf(t.due) === period && (t.status === 'DONE' || t.due < todayIso));
    const openTasks = S.hr.tasks.filter((t) => t.empId === emp.id && t.status !== 'DONE').length;
    const tasksDone = tasks.filter((t) => t.status === 'DONE').length;
    const tasksLate = tasks.filter((t) => t.status !== 'DONE').length + tasks.filter((t) => t.status === 'DONE' && t.doneAt && E.iso(new Date(t.doneAt)) > t.due).length;
    const actions = (S.audit || []).filter((a) => names.has(a.by) && monthOfMs(a.at) === period).length;
    const target = S.hr.targets.find((t) => t.empId === emp.id && t.period === period);
    const actuals = { BOOKINGS: live.length, PAX: live.reduce((s, x) => s + x.pax, 0), SALES: sales, PROFIT: profit, COLLECTIONS: collections };
    const ach = [];
    if (target && target.metric && target.value) ach.push(Math.min(150, (actuals[target.metric] / target.value) * 100));
    if (target && target.sales) ach.push(Math.min(150, (sales / target.sales) * 100));
    if (target && target.bookings) ach.push(Math.min(150, (live.length / target.bookings) * 100));
    if (target && target.collections) ach.push(Math.min(150, (collections / target.collections) * 100));
    return {
      bookings: bookings.length, liveBookings: live.length, pax: live.reduce((s, x) => s + x.pax, 0), sales, profit, collections, actuals,
      conversion: bookings.length ? r2((live.length / bookings.length) * 100) : null,
      cancelled: bookings.filter(({ b }) => b.status === 'CANCELLED').length, expired: bookings.filter(({ b }) => b.status === 'EXPIRED').length,
      discountCount: discounts.length, avgDiscount: discounts.length ? r2(discounts.reduce((s, { b }) => s + b.discountPct, 0) / discounts.length) : 0,
      vouchersCreated: vouchers.length, vouchersRejected: vouchers.filter((v) => v.status === 'REJECTED').length, vouchersApproved: approved.length, approveHours,
      tasks: tasks.length, tasksDone, tasksLate, openTasks, actions, target: target || null, achievement: ach.length ? r2(ach.reduce((a, b) => a + b, 0) / ach.length) : null,
    };
  }
  function evaluationScore(S, empId, period) {
    // latest evaluation up to (and including) the period
    const ev = S.hr.evaluations.filter((e) => e.empId === empId && e.period <= period).sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : a.at - b.at)).slice(-1)[0];
    if (!ev) return null;
    const vals = Object.keys(EVAL_CRITERIA).map((k) => Number(ev.scores[k]) || 0);
    return r2((vals.reduce((a, b) => a + b, 0) / (vals.length * 5)) * 100);
  }
  /** Composite 0–100 from targets, attendance, manager evaluation and tasks (weights in settings; missing parts are re-weighted). */
  function score(S, emp, period, today) {
    const w = S.hr.settings.weights, k = kpis(S, emp, period), att = attendanceMonth(S, emp.id, period, today), ev = evaluationScore(S, emp.id, period);
    const latePenalty = Math.min(30, att.lateCount * 3);
    const parts = [
      ['target', k.achievement == null ? null : Math.min(100, k.achievement)],
      ['attendance', Math.max(0, att.attendancePct - latePenalty)],
      ['evaluation', ev],
      ['tasks', k.tasks ? r2((Math.max(0, k.tasksDone - k.tasksLate * 0.5) / k.tasks) * 100) : null],
    ].filter(([, v]) => v != null);
    const wsum = parts.reduce((s, [key]) => s + w[key], 0) || 1;
    let total = r2(parts.reduce((s, [key, v]) => s + v * w[key], 0) / wsum);
    const warnings = S.hr.adjustments.filter((a) => a.empId === emp.id && a.status === 'APPROVED' && a.kind !== 'REWARD' && monthOf(a.date) === period).length;
    total = Math.max(0, r2(total - warnings * 5));
    const rating = total >= 85 ? { k: 'A', ar: 'ممتاز' } : total >= 70 ? { k: 'B', ar: 'جيد جداً' } : total >= 55 ? { k: 'C', ar: 'جيد' } : { k: 'D', ar: 'يحتاج تحسين' };
    return { total, rating, parts: Object.fromEntries(parts), kpis: k, attendance: att, evaluation: ev, warnings };
  }
  /** Monitoring red flags for one employee in a period. */
  function flags(S, emp, period, today) {
    const s = score(S, emp, period, today), k = s.kpis, a = s.attendance, out = [];
    if (a.absent >= 2) out.push({ level: 'err', text: `${a.absent} أيام غياب بدون إذن` });
    if (a.lateCount >= 3) out.push({ level: 'warn', text: `تأخير ${a.lateCount} مرات (${a.lateMinutes} دقيقة)` });
    if (a.missingOut >= 2) out.push({ level: 'warn', text: `${a.missingOut} أيام بدون تسجيل انصراف` });
    if (k.cancelled >= 2) out.push({ level: 'warn', text: `${k.cancelled} حجوزات ملغاة` });
    if (k.bookings >= 3 && k.expired / k.bookings > 0.3) out.push({ level: 'warn', text: `نسبة حجوزات منتهية المهلة ${Math.round((k.expired / k.bookings) * 100)}%` });
    if (k.discountCount >= 3 || k.avgDiscount > 5) out.push({ level: 'warn', text: `طلبات خصم متكررة (${k.discountCount}، متوسط ${k.avgDiscount}%)` });
    if (k.vouchersRejected >= 2) out.push({ level: 'err', text: `${k.vouchersRejected} سندات مرفوضة` });
    if (k.tasksLate) out.push({ level: 'warn', text: `${k.tasksLate} مهام متأخرة` });
    if (k.approveHours != null && k.approveHours > 24) out.push({ level: 'warn', text: `متوسط زمن اعتماد السندات ${k.approveHours} ساعة` });
    for (const d of emp.docs || []) if (d.expiry && d.expiry <= E.iso(E.addDays(new Date(), 30))) out.push({ level: d.expiry < E.iso(new Date()) ? 'err' : 'warn', text: `${d.name || 'مستند'} ينتهي ${d.expiry}` });
    if (emp.contractEnd && emp.contractEnd <= E.iso(E.addDays(new Date(), 30))) out.push({ level: 'warn', text: `العقد ينتهي ${emp.contractEnd}` });
    if (emp.probationEnd && emp.probationEnd >= E.iso(new Date()) && emp.probationEnd <= E.iso(E.addDays(new Date(), 14))) out.push({ level: 'info', text: `فترة الاختبار تنتهي ${emp.probationEnd} — قرر التثبيت` });
    return out;
  }

  // ------------------------------------------------------------ payroll
  function payrollLine(S, emp, period, today) {
    const st = S.hr.settings, att = attendanceMonth(S, emp.id, period, today), k = kpis(S, emp, period);
    const basic = Number(emp.salary) || 0, allowances = Number(emp.allowances) || 0, daily = basic / (st.monthDays || 26), hourly = daily / ((mins(st.workEnd) - mins(st.workStart)) / 60 || 8);
    const lateDed = r2(Math.floor(att.lateMinutes / (st.lateBlockMin || 30)) * (st.lateBlockDay || 0) * daily);
    const absenceDed = r2(att.absent * (st.absenceDays || 1) * daily);
    const unpaidDed = r2(att.unpaidDays * daily);
    const overtime = r2((att.overtimeMinutes / 60) * hourly * (st.overtimeRate || 1.5));
    const commission = r2(k.sales * (Number(emp.commissionPct) || 0) / 100);
    const bonus = targetBonus(S, emp, period, k);
    const adj = S.hr.adjustments.filter((a) => a.empId === emp.id && a.status === 'APPROVED' && monthOf(a.date) === period && !a.payrollId);
    const rewards = r2(adj.filter((a) => a.kind === 'REWARD').reduce((s, a) => s + (Number(a.amount) || 0), 0));
    const penalties = r2(adj.filter((a) => a.kind === 'PENALTY').reduce((s, a) => s + (Number(a.amount) || 0), 0));
    const gross = r2(basic + allowances + overtime + commission + bonus + rewards - lateDed - absenceDed - unpaidDed - penalties);
    const advanceBal = Math.max(0, Acc.partyStatement(S, 'employee', emp.id).rows.filter((r) => r.acc === '1105').reduce((s, r) => s + r.dr - r.cr, 0));
    const advances = r2(Math.min(advanceBal, Math.max(0, gross)));
    return { empId: emp.id, name: emp.name, basic, allowances, overtime, commission, targetBonus: bonus, rewards, lateDed, absenceDed, unpaidDed, penalties, gross: Math.max(0, gross), advances,
      net: r2(Math.max(0, gross) - advances), adjIds: adj.map((a) => a.id), att: { present: att.present, absent: att.absent, lateMinutes: att.lateMinutes, overtimeMinutes: att.overtimeMinutes, workdays: att.workdays } };
  }
  function preparePayroll(S, period, by, today) {
    if (S.hr.payroll.some((p) => p.period === period && p.status !== 'DRAFT')) throw new Error('مسير هذا الشهر مُرحّل بالفعل');
    S.hr.payroll = S.hr.payroll.filter((p) => !(p.period === period && p.status === 'DRAFT'));
    const run = { id: uid('PR'), period, status: 'DRAFT', lines: activeEmps(S).map((e) => payrollLine(S, e, period, today)), preparedBy: by, at: Date.now() };
    run.total = r2(run.lines.reduce((s, l) => s + l.net, 0));
    S.hr.payroll.push(run);
    return run;
  }
  /** Posting: Dr 5201 salaries (gross) · Cr 2103 employee dues (net, per employee) · Cr 1105 advances recovered. */
  function postPayroll(S, runId, actor) {
    const run = S.hr.payroll.find((p) => p.id === runId);
    if (!run || run.status !== 'DRAFT') throw new Error('المسير ليس مسودة');
    if (!Acc.canApprove(actor.role)) throw new Error('ترحيل الرواتب من صلاحية المحاسب أو المدير');
    const lines = [{ acc: '5201', dr: r2(run.lines.reduce((s, l) => s + l.gross, 0)), note: `رواتب ${run.period}` }];
    for (const l of run.lines) {
      if (l.net) lines.push({ acc: '2103', cr: l.net, party: { type: 'employee', id: l.empId } });
      if (l.advances) lines.push({ acc: '1105', cr: l.advances, party: { type: 'employee', id: l.empId }, note: 'استقطاع سلفة' });
    }
    const je = Acc.post(S, { memo: `مسير رواتب ${run.period}`, source: { type: 'JV', id: run.id }, lines, by: actor.name });
    run.status = 'POSTED'; run.jeId = je.id; run.postedBy = actor.name; run.postedAt = Date.now();
    for (const l of run.lines) for (const id of l.adjIds) { const a = S.hr.adjustments.find((x) => x.id === id); if (a) a.payrollId = run.id; }
    return run;
  }

  /** Fill defaults so old documents (and newly added settings) always have the same shape on client and server. */
  function normalize(hr) {
    const e = empty();
    if (!hr) return e;
    const out = { ...e, ...hr, settings: { ...e.settings, ...(hr.settings || {}), weights: { ...e.settings.weights, ...((hr.settings || {}).weights || {}) } } };
    for (const k of ['departments', 'attendance', 'leaves', 'adjustments', 'targets', 'evaluations', 'tasks', 'payroll']) if (!Array.isArray(out[k])) out[k] = e[k];
    return out;
  }
  /** HR admin correcting a punch keeps an audit trail on the record (governance requires it). */
  function editAttendance(S, { empId, date, inT, outT, reason }, by) {
    if (!reason || String(reason).trim().length < 3) throw new Error('اكتب سبب التعديل');
    let rec = S.hr.attendance.find((a) => a.empId === empId && a.date === date);
    if (!rec) { rec = { id: uid('AT'), empId, date, in: null, out: null, source: 'HR', at: Date.now(), edits: [] }; S.hr.attendance.push(rec); }
    rec.edits = rec.edits || [];
    rec.edits.push({ from: `${rec.in || '—'}→${rec.out || '—'}`, to: `${inT || '—'}→${outT || '—'}`, by, at: Date.now(), reason: String(reason).slice(0, 200) });
    rec.in = inT || null; rec.out = outT || null;
    if (!rec.in) S.hr.attendance = S.hr.attendance.filter((a) => a !== rec);
    return rec;
  }

  // ------------------------------------------------------------ demo data
  function seedDemo(S, now = Date.now()) {
    S.hr = empty();
    let x = 7; const rnd = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    const today = E.iso(new Date(now)), ago = (n) => E.iso(E.addDays(today, -n)), month = today.slice(0, 7), prev = E.iso(E.addDays(today.slice(0, 7) + '-01', -1)).slice(0, 7);
    const extra = { EM1: { dept: 'D2', aliases: ['منة الله (سيلز)'], staffIds: ['U1'], commissionPct: 1, allowances: 800, hireDate: '2024-02-01', manager: 'EM2', punctual: 0.55 },
      EM2: { dept: 'D2', aliases: ['أ. شريف (رئيس قسم)'], staffIds: ['U2'], commissionPct: 0.5, allowances: 1500, hireDate: '2021-09-15', punctual: 0.85 },
      EM3: { dept: 'D3', aliases: ['الشيخ/ محمد عبد الرحيم'], allowances: 1000, hireDate: '2022-05-01', punctual: 0.9 } };
    for (const e of S.employees) Object.assign(e, { status: 'ACTIVE', contractType: 'FULL', contractEnd: E.iso(E.addDays(today, 330)), probationEnd: null, docs: [], ...(extra[e.id] || {}) });
    S.employees.push({ id: 'EM4', code: 'EMP-004', name: 'هشام فوزي', job: 'مدير المبيعات', phone: '01066667777', salary: 22000, allowances: 2500, branchId: 'BR1', dept: 'D1', aliases: ['أ. هشام (مدير المبيعات)'], staffIds: ['U3'],
      status: 'ACTIVE', contractType: 'FULL', hireDate: '2019-01-10', contractEnd: E.iso(E.addDays(today, 20)), punctual: 0.95, docs: [] });
    S.employees.push({ id: 'EM5', code: 'EMP-005', name: 'ياسمين علي', job: 'محاسبة', phone: '01077778888', salary: 12000, allowances: 700, branchId: 'BR1', dept: 'D4', status: 'ACTIVE', contractType: 'FULL',
      hireDate: E.iso(E.addDays(today, -80)), probationEnd: E.iso(E.addDays(today, 10)), manager: 'EM4', punctual: 0.8, docs: [{ name: 'شهادة الصحة', expiry: E.iso(E.addDays(today, 12)) }] });
    S.counters.C_EMP = 5;
    const st = S.hr.settings;
    for (const e of S.employees) {
      for (let n = 45; n >= 0; n--) {
        const d = ago(n); if (st.offDays.includes(dow(d)) || (e.hireDate && d < e.hireDate)) continue;
        if (n === 0 && rnd() < 0.3) continue;
        const r = rnd(); if (r > 0.97) continue; // absent
        const late = rnd() < e.punctual ? Math.floor(rnd() * 12) : 16 + Math.floor(rnd() * 70);
        const inM = mins(st.workStart) - 10 + late, outM = mins(st.workEnd) + (rnd() < 0.25 ? 30 + Math.floor(rnd() * 120) : Math.floor(rnd() * 15)) - (rnd() < 0.05 ? 60 : 0);
        S.hr.attendance.push({ id: uid('AT'), empId: e.id, date: d, in: hhmm(inM), out: n === 0 ? null : hhmm(outM), source: 'SELF', at: now });
      }
      delete e.punctual;
    }
    const lv = (empId, type, from, to, status, reason) => { const l = { id: uid('LV'), empId, type, from, to, days: workdaysBetween(S, from, to), reason, status, by: 'demo', at: now, decidedBy: status === 'PENDING' ? null : 'أ. هشام (مدير المبيعات)' };
      S.hr.attendance = S.hr.attendance.filter((a) => !(a.empId === empId && a.date >= from && a.date <= to)); S.hr.leaves.push(l); };
    lv('EM3', 'ANNUAL', ago(20), ago(17), 'APPROVED', 'إجازة عائلية');
    lv('EM1', 'SICK', ago(9), ago(9), 'APPROVED', 'دور برد');
    lv('EM5', 'CASUAL', E.iso(E.addDays(today, 3)), E.iso(E.addDays(today, 3)), 'PENDING', 'ظرف طارئ');
    const adj = (empId, kind, amount, reason, date) => S.hr.adjustments.push({ id: uid('AD'), empId, kind, amount, reason, date, status: 'APPROVED', by: 'أ. هشام (مدير المبيعات)', at: now });
    adj('EM2', 'REWARD', 1500, 'تحقيق هدف مبيعات الموسم', ago(5));
    adj('EM1', 'WARNING', 0, 'تأخير متكرر بدون إذن', ago(3));
    adj('EM1', 'PENALTY', 300, 'خصم يوم لتكرار التأخير', ago(3));
    S.hr.targets.push({ id: uid('TG'), empId: 'EM1', period: month, metric: 'SALES', value: 400000, incentive: { type: 'PCT', pct: 1, base: 'SALES' }, by: 'demo', at: now });
    S.hr.targets.push({ id: uid('TG'), empId: 'EM2', period: month, metric: 'BOOKINGS', value: 5, incentive: { type: 'FIXED', amount: 2000 }, by: 'demo', at: now });
    S.hr.targets.push({ id: uid('TG'), empId: 'EM4', period: month, metric: 'PROFIT', value: 100000, incentive: { type: 'PCT', pct: 3, base: 'PROFIT' }, by: 'demo', at: now });
    const task = (empId, title, due, status) => S.hr.tasks.push({ id: uid('TK'), empId, title, due, status, priority: 'NORMAL', by: 'أ. هشام (مدير المبيعات)', at: now, doneAt: status === 'DONE' ? new Date(due + 'T12:00:00').getTime() : null });
    task('EM1', 'متابعة تحصيل أقساط العملاء المتأخرة', ago(2), 'OPEN');
    task('EM1', 'استكمال صور جوازات حجوزات الرحلة', E.iso(E.addDays(today, 2)), 'OPEN');
    task('EM3', 'تجهيز كشف التسكين النهائي', ago(1), 'DONE');
    task('EM5', 'مطابقة كشف حساب البنك', E.iso(E.addDays(today, 1)), 'OPEN');
    task('EM2', 'تدريب موظفي المبيعات الجدد', ago(4), 'DONE');
    const ev = (empId, scores, note) => S.hr.evaluations.push({ id: uid('EV'), empId, period: prev, scores, note, by: 'أ. هشام (مدير المبيعات)', at: now });
    ev('EM1', { commitment: 2, service: 4, teamwork: 4, quality: 3, initiative: 3 }, 'ممتازة مع العملاء لكن لازم تلتزم بالمواعيد');
    ev('EM2', { commitment: 5, service: 4, teamwork: 5, quality: 4, initiative: 4 }, 'قائد فريق ممتاز');
    ev('EM3', { commitment: 5, service: 5, teamwork: 4, quality: 5, initiative: 4 }, '');
    return S.hr;
  }

  /** Everything an employee may see about himself (staff "My account" page + portal users via the server). */
  function selfView(S, emp, period, now = Date.now()) {
    const t = localNow(S.company.country, now), p = period || t.date.slice(0, 7);
    const sc = score(S, emp, p, t.date), dept = S.hr.departments.find((d) => d.id === emp.dept);
    return {
      now: t, period: p, settings: { workStart: S.hr.settings.workStart, workEnd: S.hr.settings.workEnd, graceMin: S.hr.settings.graceMin },
      emp: { id: emp.id, code: emp.code, name: emp.name, job: emp.job, dept: dept ? dept.name : '', hireDate: emp.hireDate, contractEnd: emp.contractEnd, salary: emp.salary, allowances: emp.allowances || 0, commissionPct: emp.commissionPct || 0, docs: emp.docs || [], photoFileId: emp.photoFileId || null },
      today: S.hr.attendance.find((a) => a.empId === emp.id && a.date === t.date) || null,
      month: sc.attendance, balance: leaveBalance(S, emp.id, t.date.slice(0, 4)),
      leaves: S.hr.leaves.filter((l) => l.empId === emp.id).sort((a, b) => b.at - a.at).slice(0, 20),
      tasks: S.hr.tasks.filter((x) => x.empId === emp.id).sort((a, b) => (a.status === 'DONE') - (b.status === 'DONE') || (a.due < b.due ? -1 : 1)).slice(0, 40),
      adjustments: S.hr.adjustments.filter((a) => a.empId === emp.id && a.status === 'APPROVED').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20),
      evaluations: S.hr.evaluations.filter((e) => e.empId === emp.id).sort((a, b) => (a.period < b.period ? 1 : -1)).slice(0, 6),
      score: { total: sc.total, rating: sc.rating, parts: sc.parts, kpis: sc.kpis, warnings: sc.warnings },
      payslips: S.hr.payroll.filter((r) => r.status === 'POSTED').map((r) => ({ period: r.period, line: r.lines.find((l) => l.empId === emp.id) })).filter((x) => x.line).sort((a, b) => (a.period < b.period ? 1 : -1)),
    };
  }

  return { TARGET_METRICS, MIN_SALARY_MULTIPLE, bookingProfit, averages, monthlyPay, targetMinimum, validateTarget, targetBonus, selfView, normalize, editAttendance, seedDemo, LEAVE_TYPES, ADJ_KINDS, EVAL_CRITERIA, EMP_STATUS, HR_ADMINS, empty, uid, mins, hhmm, daysOfMonth, dow, localNow, empOfUser, activeEmps,
    punch, requestLeave, setTaskStatus, workdaysBetween, attendanceMonth, leaveBalance, kpis, evaluationScore, score, flags, payrollLine, preparePayroll, postPayroll };
});
