/* =====================================================================
 * Server-side governance: validates every saved document against the
 * previous one, so no client (buggy or malicious) can rewrite history.
 *  - Posted journal entries are immutable and can never be deleted
 *  - Vouchers cannot be deleted; posted voucher amounts cannot change
 *  - Only approvers (OWNER/MANAGER/ACCOUNTANT) may post/reject/cancel
 *    vouchers or add non-booking journal entries
 *  - Only OWNER/MANAGER may change the chart of accounts, company tax
 *    settings, cash boxes or lock prices
 * Returns { errors: [], events: [] } — events feed the notification centre.
 * ===================================================================== */
const Hr = require('../public/js/hr.js');
const APPROVERS = ['OWNER', 'MANAGER', 'ACCOUNTANT'];
const HR_ADMINS = Hr.HR_ADMINS;
const ADMINS = ['OWNER', 'MANAGER'];
const BOOKING_SOURCES = ['BK', 'BKC'];

function allBookings(S) {
  const m = new Map();
  for (const d of S.trips || []) for (const b of d.bookings || []) m.set(b.id, { b, trip: d.trip });
  for (const b of (S.dom && S.dom.bookings) || []) m.set(b.id, { b, trip: { code: b.programId ? 'سياحة داخلية' : 'فنادق' } });
  for (const b of (S.hajj && S.hajj.pilgrims) || []) m.set(b.id, { b, trip: { code: 'حج' } });
  return m;
}
const stable = (o) => JSON.stringify(o);

function validate(oldS, newS, user) {
  const errors = [], events = [];
  if (!newS || newS.version !== 4 || !Array.isArray(newS.trips) || !Array.isArray(newS.journal) || !Array.isArray(newS.vouchers) || !Array.isArray(newS.accounts)) {
    return { errors: ['بيانات غير صالحة'], events };
  }
  const approver = APPROVERS.includes(user.role), admin = ADMINS.includes(user.role);
  if (!oldS) return { errors, events };

  // journal: append-only
  const newJ = new Map(newS.journal.map((j) => [j.id, j]));
  for (const j of oldS.journal) {
    const n = newJ.get(j.id);
    if (!n) { errors.push(`لا يمكن حذف القيد ${j.no}`); continue; }
    const a = { ...j }, b = { ...n }; delete a.reversedBy; delete b.reversedBy;
    if (stable(a) !== stable(b)) errors.push(`القيد المرحّل ${j.no} لا يمكن تعديله — استخدم قيد عكسي`);
  }
  const oldIds = new Set(oldS.journal.map((j) => j.id));
  for (const j of newS.journal) {
    if (oldIds.has(j.id)) continue;
    const dr = j.lines.reduce((s, l) => s + (l.dr || 0), 0), cr = j.lines.reduce((s, l) => s + (l.cr || 0), 0);
    if (Math.abs(dr - cr) > 0.01) errors.push(`القيد ${j.no} غير متوازن`);
    if (!BOOKING_SOURCES.includes(j.source && j.source.type) && !approver) errors.push(`ترحيل القيد ${j.no} من صلاحية المحاسب أو المدير`);
  }
  // vouchers
  const newV = new Map(newS.vouchers.map((v) => [v.id, v]));
  for (const v of oldS.vouchers) {
    const n = newV.get(v.id);
    if (!n) { errors.push(`لا يمكن حذف السند ${v.no}`); continue; }
    if (n.status !== v.status && !approver) errors.push(`تغيير حالة السند ${v.no} من صلاحية المحاسب أو المدير`);
    if (v.status !== 'PENDING' && (n.amount !== v.amount || n.type !== v.type || stable(n.party) !== stable(v.party))) errors.push(`السند ${v.no} معتمد ولا يمكن تعديله`);
    if (v.status === 'PENDING' && n.status === 'POSTED') events.push({ roles: null, userName: v.createdBy, text: `✅ تم اعتماد ${v.no} بمبلغ ${Math.round(v.amount)} ${v.currency}` });
    if (v.status === 'PENDING' && n.status === 'REJECTED') events.push({ roles: null, userName: v.createdBy, text: `❌ تم رفض ${v.no}: ${n.rejectReason || ''}` });
  }
  const oldVIds = new Set(oldS.vouchers.map((v) => v.id));
  for (const v of newS.vouchers) {
    if (oldVIds.has(v.id)) continue;
    if (v.status !== 'PENDING' && !approver) errors.push(`السند ${v.no} لازم يدخل "بانتظار الاعتماد"`);
    if (v.status === 'PENDING') events.push({ roles: APPROVERS, text: `🧾 ${v.no} بمبلغ ${Math.round(v.amount)} ${v.currency} من ${v.createdBy} بانتظار الاعتماد`, link: 'vouchers' });
  }
  // exchange rates: the executive rate drives every SAR posting → approvers only (global benchmark updates are free)
  if (!approver && oldS.fx && newS.fx && (Number(oldS.fx.current) !== Number(newS.fx.current) || Number(oldS.fx.alertSpreadPct) !== Number(newS.fx.alertSpreadPct)))
    errors.push('تعديل سعر الصرف التنفيذي من صلاحية المحاسب أو المدير');
  if (oldS.fx && newS.fx && Number(oldS.fx.current) !== Number(newS.fx.current) && !(newS.fx.history && newS.fx.history[0] && Number(newS.fx.history[0].rate) === Number(newS.fx.current)))
    errors.push('تغيير سعر الصرف التنفيذي لازم يتسجل في سجل الأسعار');
  const oldBkIds = new Set(allBookings(oldS).keys());
  // master-data governance
  if (!admin) {
    if (stable(oldS.accounts) !== stable(newS.accounts) && !approver) errors.push('تعديل شجرة الحسابات من صلاحية المحاسب أو المدير');
    if (stable(oldS.company) !== stable(newS.company)) errors.push('تعديل بيانات الشركة والضرائب من صلاحية المدير');
    if (stable(oldS.cashboxes) !== stable(newS.cashboxes) && !approver) errors.push('تعديل الخزائن والبنوك من صلاحية المحاسب أو المدير');
    if (stable(oldS.branches) !== stable(newS.branches)) errors.push('تعديل الفروع من صلاحية المدير');
    for (const d of newS.trips) {
      const o = oldS.trips.find((x) => x.id === d.id);
      if (o && stable(o.trip.lockedPrices) !== stable(d.trip.lockedPrices)) errors.push('قفل/فك السعر الرسمي من صلاحية المدير');
    }
  }
  // new bookings: any discount must stay pending until the owner approves it
  if (user.role !== 'OWNER') for (const [id, { b }] of allBookings(newS)) if (!oldBkIds.has(id) && (b.discountPct || 0) > 0 && b.status !== 'PENDING_APPROVAL') errors.push(`الحجز ${b.code}: الخصم يحتاج اعتماد مالك النظام`);
  if (user.role !== 'OWNER') for (const [id, { b }] of allBookings(newS)) if (!oldBkIds.has(id) && (b.commissionAdj || 0) !== 0) errors.push(`الحجز ${b.code}: زيادة/خصم العمولة من صلاحية مالك النظام`);
  if (user.role !== 'OWNER') for (const d of newS.trips) { const o = oldS.trips.find((x) => x.id === d.id); if (stable((o && o.trip.commissions) || {}) !== stable(d.trip.commissions || {}) && (o || Object.keys(d.trip.commissions || {}).length)) errors.push(`عمولات المناديب لرحلة ${d.trip.code} من صلاحية مالك النظام`); }
  // money & pricing integrity (the UI already enforces these; the server makes them unbypassable)
  const MAX_DISC = { OWNER: 100 }; // discounts on any price: the system owner only
  const oldA = new Map(oldS.agents.map((a) => [a.id, a]));
  for (const a of newS.agents) {
    const o = oldA.get(a.id);
    if (!approver && o && a.balance > o.balance + 0.01) errors.push(`زيادة رصيد محفظة ${a.name} تتم بسند قبض معتمد فقط`);
    if (!admin && o && a.creditLimit !== o.creditLimit) errors.push(`تعديل سقف ${a.name} من صلاحية المدير`);
    if (user.role !== 'OWNER' && o && (a.netDiscountPct !== o.netDiscountPct || a.commissionPct !== o.commissionPct || stable(a.commission || null) !== stable(o.commission || null))) errors.push(`تعديل خصم/عمولة ${a.name} من صلاحية مالك النظام`);
    if (user.role !== 'OWNER' && !o && (a.netDiscountPct > 0)) errors.push('خصم الجملة للوكيل من صلاحية مالك النظام');
    if (user.role !== 'OWNER' && !o && a.commission && (Number(a.commission.min) > 0 || Number(a.commission.pct) > 0)) errors.push('تحديد عمولة المندوب من صلاحية مالك النظام');
    if (!admin && !o && a.creditLimit > 0) errors.push('منح سقف ائتماني لوكيل جديد من صلاحية المدير');
  }
  const oldBk = allBookings(oldS);
  for (const [id, { b }] of allBookings(newS)) {
    const o = oldBk.get(id);
    if (!o) { if (!approver && b.channel !== 'B2B' && b.paid > 0) errors.push(`الحجز ${b.code}: السداد يُسجل بسند قبض معتمد`); continue; }
    const ob = o.b;
    if (!approver && Math.abs((b.paid || 0) - (ob.paid || 0)) > 0.01) errors.push(`الحجز ${b.code}: تعديل المسدد يتم بسند قبض معتمد فقط`);
    if (user.role !== 'OWNER' && ob.net !== b.net && !(ob.net == null && b.net == null) && !(ob.status === 'PENDING_PRICING' && admin && !(b.discountPct > 0))) errors.push(`الحجز ${b.code}: تعديل السعر من صلاحية مالك النظام`);
    if (ob.status === 'PENDING_APPROVAL' && !['PENDING_APPROVAL', 'CANCELLED', 'EXPIRED'].includes(b.status) && (MAX_DISC[user.role] ?? 0) < (b.discountPct || 0))
      errors.push(`الحجز ${b.code}: اعتماد خصم ${b.discountPct}% يتجاوز صلاحيتك`);
    if (user.role !== 'OWNER' && (b.discountPct || 0) !== (ob.discountPct || 0)) errors.push(`الحجز ${b.code}: الخصم من صلاحية مالك النظام فقط`);
    if (user.role !== 'OWNER' && (Math.abs((b.agentCommission || 0) - (ob.agentCommission || 0)) > 0.01 || (b.commissionAdj || 0) !== (ob.commissionAdj || 0))) errors.push(`الحجز ${b.code}: تعديل عمولة المندوب من صلاحية مالك النظام`);
  }
  // booking events for the notification centre
  const oldB = allBookings(oldS);
  for (const [id, { b, trip }] of allBookings(newS)) {
    const o = oldB.get(id);
    if (!o && b.status === 'PENDING_APPROVAL') events.push({ roles: ['OWNER'], text: `💸 ${trip.code} · ${b.code}: خصم ${b.discountPct}% بانتظار اعتمادك`, link: 'booking' });
    if (!o && b.status === 'PENDING_PRICING') events.push({ roles: ['OWNER', 'MANAGER'], text: `🔒 ${trip.code} · ${b.code}: خدمات مجزأة بانتظار التسعير`, link: 'booking' });
    if (o && o.b.status !== 'CANCELLED' && b.status === 'CANCELLED') events.push({ roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'], text: `⚠️ ${trip.code} · ${b.code}: تم إلغاء الحجز`, link: 'booking' });
  }
  // Hajj: season (quota, lock rate, rules, guarantees) and program prices/costs are management data; closing is an accounting act
  if (oldS.hajj && newS.hajj) {
    const strip = (x) => ({ ...x, closed: 0, closedBy: 0, closedAt: 0, deadlines: (x.deadlines || []).map((d) => ({ ...d, done: 0 })) });
    const oSs = new Map((oldS.hajj.seasons || []).map((x) => [x.id, x]));
    for (const x of newS.hajj.seasons || []) {
      const o = oSs.get(x.id);
      if (!admin && (!o || stable(strip(o)) !== stable(strip(x)))) errors.push('إعدادات موسم الحج والحصة من صلاحية المدير');
      if (o && o.closed && stable(o) !== stable(x)) errors.push(`${x.name} مقفل ولا يمكن تعديله`);
      if (o && !o.closed && x.closed && !approver) errors.push('إقفال موسم الحج من صلاحية المحاسب أو المدير');
    }
    for (const o of oldS.hajj.seasons || []) if (!(newS.hajj.seasons || []).some((x) => x.id === o.id)) errors.push('لا يمكن حذف موسم حج');
    const money = (k) => stable([k.prices, k.costItems, k.stays, k.plan, k.cancelPolicy, k.upgrades, k.hadySar, k.hadyIncluded, k.partnerVisaFee, k.nonRefundableAfterSubmit]);
    const oK = new Map((oldS.hajj.packages || []).map((k) => [k.id, k]));
    for (const k of newS.hajj.packages || []) {
      const o = oK.get(k.id);
      if (!admin && (!o || money(o) !== money(k))) errors.push(`أسعار وتكاليف برنامج الحج ${k.code} من صلاحية المدير`);
      if (user.role !== 'OWNER' && stable((o && o.commissions) || {}) !== stable(k.commissions || {}) && (o || Object.keys(k.commissions || {}).length)) errors.push(`عمولة المناديب في ${k.code} من صلاحية مالك النظام`);
    }
  }
  // HR: attendance, leaves, sanctions, evaluations & salaries are HR-admin data; payroll posting is an accounting act
  validateHr(oldS, newS, user, errors, events);
  return { errors: [...new Set(errors)].slice(0, 10), events };
}

function validateHr(oldS, newS, user, errors, events) {
  const hrAdmin = HR_ADMINS.includes(user.role), approver = APPROVERS.includes(user.role);
  if (!oldS.hr) return;
  if (!newS.hr) { errors.push('بيانات الموارد البشرية لا يمكن حذفها'); return; }
  const oh = Hr.normalize(oldS.hr), nh = Hr.normalize(newS.hr);
  const core = (h) => ({ ...h, payroll: null, adjustments: h.adjustments.map((a) => ({ ...a, payrollId: null })) });
  if (!hrAdmin && stable(core(oh)) !== stable(core(nh))) errors.push('تعديل الحضور والإجازات والجزاءات والتقييمات من صلاحية الموارد البشرية أو المدير');
  // payroll: HR prepares drafts, approvers post, posted runs are frozen
  const oldP = new Map(oh.payroll.map((r) => [r.id, r]));
  for (const r of oh.payroll) if (r.status === 'POSTED') { const n = nh.payroll.find((x) => x.id === r.id); if (!n || stable(n) !== stable(r)) errors.push(`مسير رواتب ${r.period} مُرحّل ولا يمكن تعديله أو حذفه`); }
  for (const n of nh.payroll) {
    const o = oldP.get(n.id);
    if (n.status === 'POSTED' && (!o || o.status !== 'POSTED') && !approver) errors.push('ترحيل مسير الرواتب من صلاحية المحاسب أو المدير');
    if (n.status === 'POSTED' && o && o.status === 'DRAFT' && stable({ ...o, status: 0, jeId: 0, postedBy: 0, postedAt: 0 }) !== stable({ ...n, status: 0, jeId: 0, postedBy: 0, postedAt: 0 })) errors.push(`لا يمكن تعديل مبالغ مسير ${n.period} أثناء الترحيل`);
    if (n.status === 'DRAFT' && (!o || stable(o) !== stable(n)) && !hrAdmin) errors.push('إعداد مسير الرواتب من صلاحية الموارد البشرية');
    if (n.status === 'POSTED' && o && o.status === 'DRAFT') events.push({ roles: HR_ADMINS, text: `💵 تم ترحيل مسير رواتب ${n.period} بإجمالي ${Math.round(n.total)}`, link: 'hrPayroll' });
  }
  // punches corrected by HR must carry an audit trail; nobody approves their own leave or rates themselves
  const empUser = new Map(newS.employees.map((e) => [e.id, e.userId ? Number(e.userId) : null]));
  const oldAt = new Map(oh.attendance.map((a) => [a.id, a]));
  for (const a of nh.attendance) {
    const o = oldAt.get(a.id);
    if (o && (o.in !== a.in || o.out !== a.out) && (a.edits || []).length <= (o.edits || []).length && !(o.out == null && a.out && o.in === a.in && a.source === 'SELF')) errors.push(`تعديل بصمة ${a.date} لازم يتسجل بسبب`);
  }
  const oldL = new Map(oh.leaves.map((l) => [l.id, l]));
  for (const l of nh.leaves) {
    const o = oldL.get(l.id), uid = empUser.get(l.empId);
    if (o && o.status === 'PENDING' && l.status !== 'PENDING') {
      if (uid === user.id && user.role !== 'OWNER') errors.push('لا يمكنك اعتماد إجازتك بنفسك');
      if (uid) events.push({ userId: uid, text: `${l.status === 'APPROVED' ? '✅ تمت الموافقة على' : '❌ تم رفض'} طلب إجازتك ${l.from}${l.to !== l.from ? ' ← ' + l.to : ''}${l.decisionNote ? ': ' + l.decisionNote : ''}`, link: 'me' });
    }
  }
  const oldE = new Set(oh.evaluations.map((e) => e.id));
  for (const e of nh.evaluations) if (!oldE.has(e.id)) {
    const uid = empUser.get(e.empId);
    if (uid === user.id && user.role !== 'OWNER') errors.push('لا يمكنك تقييم نفسك');
    if (uid) events.push({ userId: uid, text: `📊 تم تسجيل تقييم أدائك عن ${e.period}`, link: 'me' });
  }
  const oldAdj = new Set(oh.adjustments.map((a) => a.id));
  for (const a of nh.adjustments) if (!oldAdj.has(a.id)) {
    const uid = empUser.get(a.empId);
    if (uid === user.id && user.role !== 'OWNER') errors.push('لا يمكنك تسجيل مكافأة أو جزاء لنفسك');
    if (uid) events.push({ userId: uid, text: `${a.kind === 'REWARD' ? '🎁 مكافأة' : a.kind === 'WARNING' ? '⚠️ إنذار' : '⛔ جزاء'}: ${a.reason}${a.amount ? ' (' + a.amount + ')' : ''}`, link: 'me' });
  }
  const oldT = new Set(oh.tasks.map((t) => t.id));
  for (const t of nh.tasks) if (!oldT.has(t.id)) { const uid = empUser.get(t.empId); if (uid) events.push({ userId: uid, text: `📌 مهمة جديدة: ${t.title} (تسليم ${t.due})`, link: 'me' }); }
  // targets: never below 4× the employee's monthly pay (checked here so no client can bypass it)
  const oldTg = new Map(oh.targets.map((t) => [t.id, stable(t)]));
  for (const t of nh.targets) {
    if (!t.metric || oldTg.get(t.id) === stable(t)) continue;
    const emp = newS.employees.find((e) => e.id === t.empId);
    if (!emp) { errors.push('التارجت لموظف غير موجود'); continue; }
    try { Hr.validateTarget({ ...newS, hr: nh }, emp, t); } catch (e) { errors.push(e.message); }
    const uid = empUser.get(t.empId);
    if (uid && !oldTg.has(t.id)) events.push({ userId: uid, text: `🎯 تارجت ${t.period}: ${Hr.TARGET_METRICS[t.metric].ar} ${Math.round(t.value)} ${Hr.TARGET_METRICS[t.metric].unit}`, link: 'me' });
  }
  // salaries & employee financial terms
  const oldEmp = new Map((oldS.employees || []).map((e) => [e.id, e]));
  for (const e of newS.employees) {
    const o = oldEmp.get(e.id);
    const money = (x) => stable([Number(x.salary) || 0, Number(x.allowances) || 0, Number(x.commissionPct) || 0, x.userId || null, x.status || 'ACTIVE']);
    if (o && money(o) !== money(e) && !hrAdmin) errors.push(`تعديل راتب/بدلات/عمولة/حالة ${e.name} أو ربطه بحساب من صلاحية الموارد البشرية`);
    if (!o && !hrAdmin && !approver) errors.push('إضافة موظف من صلاحية الموارد البشرية أو الحسابات');
  }
}

module.exports = { validate, APPROVERS, ADMINS, HR_ADMINS };
