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
const APPROVERS = ['OWNER', 'MANAGER', 'ACCOUNTANT'];
const ADMINS = ['OWNER', 'MANAGER'];
const BOOKING_SOURCES = ['BK', 'BKC'];

function allBookings(S) {
  const m = new Map();
  for (const d of S.trips || []) for (const b of d.bookings || []) m.set(b.id, { b, trip: d.trip });
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
  // money & pricing integrity (the UI already enforces these; the server makes them unbypassable)
  const MAX_DISC = { OWNER: 7, MANAGER: 7, HEAD: 3, SALES: 0, ACCOUNTANT: 0, OPERATIONS: 0 };
  const oldA = new Map(oldS.agents.map((a) => [a.id, a]));
  for (const a of newS.agents) {
    const o = oldA.get(a.id);
    if (!approver && o && a.balance > o.balance + 0.01) errors.push(`زيادة رصيد محفظة ${a.name} تتم بسند قبض معتمد فقط`);
    if (!admin && o && (a.creditLimit !== o.creditLimit || a.netDiscountPct !== o.netDiscountPct || a.commissionPct !== o.commissionPct)) errors.push(`تعديل سقف/نسب ${a.name} من صلاحية المدير`);
    if (!admin && !o && a.creditLimit > 0) errors.push('منح سقف ائتماني لوكيل جديد من صلاحية المدير');
  }
  const oldBk = allBookings(oldS);
  for (const [id, { b }] of allBookings(newS)) {
    const o = oldBk.get(id);
    if (!o) { if (!approver && b.channel !== 'B2B' && b.paid > 0) errors.push(`الحجز ${b.code}: السداد يُسجل بسند قبض معتمد`); continue; }
    const ob = o.b;
    if (!approver && Math.abs((b.paid || 0) - (ob.paid || 0)) > 0.01) errors.push(`الحجز ${b.code}: تعديل المسدد يتم بسند قبض معتمد فقط`);
    if (!admin && ob.net !== b.net && !(ob.net == null && b.net == null)) errors.push(`الحجز ${b.code}: تعديل السعر من صلاحية المدير`);
    if (ob.status === 'PENDING_APPROVAL' && !['PENDING_APPROVAL', 'CANCELLED', 'EXPIRED'].includes(b.status) && (MAX_DISC[user.role] ?? 0) < (b.discountPct || 0))
      errors.push(`الحجز ${b.code}: اعتماد خصم ${b.discountPct}% يتجاوز صلاحيتك`);
    if (!admin && (b.discountPct || 0) !== (ob.discountPct || 0)) errors.push(`الحجز ${b.code}: لا يمكن تعديل الخصم بعد الحفظ`);
  }
  // booking events for the notification centre
  const oldB = allBookings(oldS);
  for (const [id, { b, trip }] of allBookings(newS)) {
    const o = oldB.get(id);
    if (!o && b.status === 'PENDING_APPROVAL') events.push({ roles: ['OWNER', 'MANAGER', 'HEAD'], text: `💸 ${trip.code} · ${b.code}: خصم ${b.discountPct}% بانتظار اعتمادك`, link: 'booking' });
    if (!o && b.status === 'PENDING_PRICING') events.push({ roles: ['OWNER', 'MANAGER'], text: `🔒 ${trip.code} · ${b.code}: خدمات مجزأة بانتظار التسعير`, link: 'booking' });
    if (o && o.b.status !== 'CANCELLED' && b.status === 'CANCELLED') events.push({ roles: ['OWNER', 'MANAGER', 'ACCOUNTANT'], text: `⚠️ ${trip.code} · ${b.code}: تم إلغاء الحجز`, link: 'booking' });
  }
  return { errors: [...new Set(errors)].slice(0, 10), events };
}

module.exports = { validate, APPROVERS, ADMINS };
