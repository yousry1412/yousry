/* =====================================================================
 * أفواج — Resale programs (برامج مشتراة من شركات أخرى) — browser + server
 *  A complete program (Umrah, Hajj or domestic) bought from another company
 *  and resold under our name:
 *   - BLOCK      : seats bought upfront (committed) → unsold seats are our risk,
 *                  seats may be returned to the seller before the release date
 *   - ON_REQUEST : we pay the seller only for what we sell
 *  Cost per room/seat row in EGP or SAR (locked rate) · our selling price per row.
 *  Bookings: same status cycle as the rest (hold → deposit → confirmed), owner-only
 *  discount, agent commission, revenue 4108 through Acc.syncBooking, payments by RV.
 *  Cost: seller invoices (BILL → 5109) on the program cost center.
 *  Profit: revenue ex-tax − (posted seller invoices, or the committed/sold cost
 *  estimate until they are posted) − agent commissions; plus break-even and the
 *  expected profit if the block sells out.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./accounting.js'));
  else root.Resale = factory(root.Engine, root.Acc);
})(typeof self !== 'undefined' ? self : this, function (E, Acc) {
  'use strict';
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const MODES = { BLOCK: 'شراء مقاعد مضمونة (بلوك)', ON_REQUEST: 'حسب الطلب (أدفع على المباع فقط)' };
  const DOMAIN_AR = { UMRAH: '🕋 عمرة', HAJJ: '⛰️ حج', DOMESTIC: '🏖️ سياحة داخلية', OUTBOUND: '✈️ سياحة خارجية' };
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const empty = () => ({ programs: [], bookings: [] });
  function normalize(x) { const d = { ...empty(), ...(x || {}) }; for (const k of ['programs', 'bookings']) if (!Array.isArray(d[k])) d[k] = []; return d; }
  const program = (S, id) => S.resale.programs.find((p) => p.id === id);
  const costCenter = (S, b) => { const p = program(S, b.programId) || {}; return { id: p.id || 'RESALE', code: p.code || 'RESALE', name: p.name || 'برامج مشتراة' }; };
  /** Cost of one unit in EGP (SAR costs use the program's locked rate). */
  const unitCost = (p, row) => r2(Number(row.cost || 0) * (p.currency === 'SAR' ? Number(p.fx || 0) : 1));
  const rowOf = (p, id) => (p.rows || []).find((r) => r.id === id);
  const soldOf = (S, p, rowId) => S.resale.bookings.filter((b) => b.programId === p.id && E.LIVE_STATES.includes(b.status))
    .reduce((s, b) => s + (b.lines || []).filter((l) => !rowId || l.rowId === rowId).reduce((x, l) => x + Number(l.qty || 0), 0), 0);
  /** Places still available: block → bought seats − sold; on request → the seller's limit (if any). */
  function left(S, p, rowId) {
    const row = rowId ? rowOf(p, rowId) : null;
    const cap = row ? Number(row.seats || 0) : (p.rows || []).reduce((s, r) => s + Number(r.seats || 0), 0);
    if (!cap) return null;
    return Math.max(0, cap - soldOf(S, p, rowId));
  }

  function priceBooking(S, d) {
    const p = program(S, d.programId), reasons = [], warnings = [], lines = [];
    if (!p) return { status: 'BLOCKED', reasons: ['اختر البرنامج'], lines, gross: 0, net: 0, cost: 0, units: 0, warnings };
    if (p.status === 'CLOSED') reasons.push('البرنامج مغلق للبيع');
    let gross = 0, cost = 0, units = 0;
    for (const l of d.lines || []) {
      const row = rowOf(p, l.rowId), q = Number(l.qty) || 0;
      if (!row || q <= 0) continue;
      const lf = left(S, p, row.id);
      if (lf != null && q > lf) reasons.push(`${row.label}: المتبقي ${lf} فقط`);
      lines.push({ rowId: row.id, label: row.label, qty: q, price: Number(row.price || 0), total: r2(q * Number(row.price || 0)), cost: r2(q * unitCost(p, row)) });
      gross += q * Number(row.price || 0); cost += q * unitCost(p, row); units += q;
    }
    if (!units) reasons.push('حدد العدد في فئة واحدة على الأقل');
    gross = r2(gross); cost = r2(cost);
    const discPct = Number(d.discountPct || 0), discount = r2(gross * discPct / 100);
    const agent = d.agentId ? S.agents.find((a) => a.id === d.agentId) : null;
    let agentCommission = 0, channelDiscount = 0;
    if (agent && agent.tier === 'BROKER') {
      const rule = E.commissionRule(agent), per = Number((p.commissions || {})[agent.id] ?? (p.commissions || {}).default ?? 0);
      agentCommission = Math.max(per * units, Number(rule.min || 0) * (rule.basis === 'BOOKING' ? 1 : units));
      agentCommission = Math.max(0, r2(agentCommission + Number(d.commissionAdj || 0)));
    }
    if (agent && agent.tier === 'B2B') channelDiscount = r2(gross * Number(agent.netDiscountPct || 0) / 100);
    const net = r2(gross - discount - channelDiscount);
    if (net < cost) warnings.push(`⚠️ سعر البيع (${net}) أقل من تكلفة الشراء (${cost}) — خسارة ${r2(cost - net)}`);
    const status = reasons.length ? 'BLOCKED' : discPct > 0 && d.actorRole !== 'OWNER' ? 'PENDING_APPROVAL' : 'SOFT_HOLD';
    if (status === 'PENDING_APPROVAL') warnings.push(`خصم ${discPct}% يحتاج اعتماد مالك النظام`);
    return { status, reasons, warnings, lines, gross, discount, channelDiscount, net, cost, units, agentCommission, margin: r2(net - cost - agentCommission) };
  }

  function createBooking(S, d, actor) {
    const v = priceBooking(S, { ...d, actorRole: actor.role, commissionAdj: actor.role === 'OWNER' ? d.commissionAdj : 0 });
    if (v.status === 'BLOCKED') throw new Error(v.reasons.join(' · '));
    const lead = d.lead || {};
    if (!String(lead.name || '').trim() || !String(lead.phone || '').trim()) throw new Error('اكتب اسم وهاتف صاحب الحجز');
    const now = Date.now(), p = program(S, d.programId);
    const agent = d.agentId ? S.agents.find((a) => a.id === d.agentId) : null;
    const channel = agent ? (agent.tier === 'B2B' ? 'B2B' : 'BROKER') : 'DIRECT';
    let customer = null;
    if (channel !== 'B2B') {
      const ph = String(lead.phone).replace(/\D/g, '');
      customer = S.customers.find((c) => String(c.phone || '').replace(/\D/g, '') === ph);
      if (!customer) { customer = { id: 'CU' + now.toString(36) + Math.random().toString(36).slice(2, 5), code: Acc.nextNo(S, 'C_CUS', 'CUS', 4), name: lead.name, phone: lead.phone, nid: lead.nid || '', notes: '', createdAt: now }; S.customers.push(customer); }
    }
    const b = {
      id: 'RB' + now.toString(36) + Math.random().toString(36).slice(2, 5), code: Acc.nextNo(S, 'RSB', 'RSB', 5), resale: true, programId: p.id,
      lines: v.lines, units: v.units, lead: { name: lead.name, phone: lead.phone, nid: lead.nid || '' }, paxNames: String(d.paxNames || '').slice(0, 2000),
      channel, agentId: agent ? agent.id : null, userId: channel === 'DIRECT' ? actor.staffId : null, customerId: customer ? customer.id : null, branchId: d.branchId || p.branchId || 'BR1',
      gross: v.gross, discountPct: Number(d.discountPct || 0), net: v.net, cost: v.cost, paid: 0, status: v.status, revAcc: '4108',
      agentCommission: v.agentCommission, commissionAdj: actor.role === 'OWNER' ? Number(d.commissionAdj || 0) : 0, commissionLog: [],
      holdUntil: E.HOLD_STATES.includes(v.status) ? now + E.clampTTL(d.ttl || 24) * 3600000 : null, installments: [], sellerRef: '', notes: d.notes || '', createdAt: now, createdBy: actor.name,
    };
    if (agent && agent.tier === 'B2B') {
      const w = E.walletCheck(agent, v.net, S.fx.current);
      if (!w.ok) throw new Error(w.reason);
      agent.balance = r2(agent.balance - w.amount); b.paid = v.net; b.status = 'CONFIRMED'; b.holdUntil = null;
    }
    S.resale.bookings.push(b);
    Acc.syncBooking(S, costCenter(S, b), b, actor.name);
    return { booking: b, pricing: v };
  }
  function cancelBooking(S, b, by) { b.status = 'CANCELLED'; b.holdUntil = null; b.cancelledBy = by; b.cancelledAt = Date.now(); return Acc.syncBooking(S, costCenter(S, b), b, by); }
  function releaseExpired(S, now) {
    const out = [];
    for (const b of S.resale.bookings) if (E.HOLD_STATES.includes(b.status) && b.holdUntil && b.holdUntil <= now && !b.pendingPay) { b.status = 'EXPIRED'; out.push(b.code); }
    return out;
  }

  /** Profit of a bought program. */
  function pnl(S, p, today = E.iso(new Date())) {
    const bk = S.resale.bookings.filter((b) => b.programId === p.id && E.LIVE_STATES.includes(b.status));
    const t = Acc.salesTaxRates(S), taxShare = (t.vat + t.stamp) / (100 + t.vat + t.stamp), exTax = (x) => r2(x * (1 - taxShare));
    const gross = r2(bk.reduce((s, b) => s + (b.net || 0), 0)), revenue = exTax(gross);
    const sold = bk.reduce((s, b) => s + (b.units || 0), 0);
    const soldCost = r2(bk.reduce((s, b) => s + (b.cost || 0), 0));
    const rows = (p.rows || []).map((row) => {
      const q = soldOf(S, p, row.id), seats = Number(row.seats || 0), returned = Number(row.returned || 0);
      return { ...row, sold: q, seats, returned, unsold: p.mode === 'BLOCK' ? Math.max(0, seats - returned - q) : 0, unit: unitCost(p, row), margin: r2(exTax(Number(row.price || 0)) - unitCost(p, row)) };
    });
    const committed = p.mode === 'BLOCK' ? r2(rows.reduce((s, r) => s + (r.seats - r.returned) * r.unit, 0)) : soldCost;
    const unsoldCost = p.mode === 'BLOCK' ? r2(rows.reduce((s, r) => s + r.unsold * r.unit, 0)) : 0;
    const posted = r2(S.journal.filter((j) => j.tripId === p.id).reduce((s, j) => s + j.lines.filter((l) => /^51/.test(l.acc)).reduce((x, l) => x + l.dr - l.cr, 0), 0));
    const commissions = r2(bk.reduce((s, b) => s + (b.agentCommission || 0), 0));
    const costBasis = posted || committed;
    const profit = r2(revenue - costBasis - commissions);
    const collected = r2(bk.reduce((s, b) => s + Math.min(b.paid || 0, b.net || 0), 0));
    // money owed to the seller: committed cost − what we already paid him on this program
    const paidSeller = r2(S.vouchers.filter((v) => v.status === 'POSTED' && v.type === 'PV' && v.tripId === p.id && v.party && v.party.type === 'supplier').reduce((s, v) => s + v.amount * (v.currency === 'EGP' ? 1 : v.fx), 0));
    const avgNet = sold ? revenue / sold : exTax(rows.reduce((s, r) => s + Number(r.price || 0), 0) / Math.max(1, rows.length));
    const avgCost = rows.length ? rows.reduce((s, r) => s + r.unit, 0) / rows.length : 0;
    const breakEven = p.mode === 'BLOCK' && avgNet > 0 ? Math.ceil(committed / avgNet) : null;
    const fullProfit = p.mode === 'BLOCK' ? r2(rows.reduce((s, r) => s + (r.seats - r.returned) * r.margin, 0) - commissions) : null;
    const releaseSoon = p.mode === 'BLOCK' && p.releaseDate && p.releaseDate >= today && E.daysBetween(today, p.releaseDate) <= 7 && unsoldCost > 0;
    return { rows, bookings: bk.length, sold, gross, revenue, soldCost, committed, unsoldCost, posted, costBasis, costSource: posted ? 'فواتير مرحّلة' : p.mode === 'BLOCK' ? 'تكلفة البلوك المشتراة' : 'تكلفة المباع', commissions, profit,
      margin: revenue ? r2(profit / revenue * 100) : null, collected, due: r2(gross - collected), paidSeller, owedSeller: r2(Math.max(0, (posted || committed) - paidSeller)), breakEven, fullProfit, avgCost: r2(avgCost), releaseSoon };
  }
  function alerts(S, today = E.iso(new Date())) {
    const out = [];
    for (const p of S.resale.programs.filter((x) => x.status !== 'CLOSED')) {
      const r = pnl(S, p, today);
      if (r.releaseSoon) out.push({ level: 'warn', group: 'البرامج المشتراة', text: `${p.code} ${p.name}: ${r.rows.reduce((s, x) => s + x.unsold, 0)} مقعد غير مباع — آخر موعد لإرجاعها للشركة ${p.releaseDate}`, page: 'resale' });
      if (p.startDate && p.startDate <= E.iso(E.addDays(today, 3)) && r.unsoldCost > 0) out.push({ level: 'err', group: 'البرامج المشتراة', text: `${p.code}: البرنامج يبدأ ${p.startDate} وفيه مقاعد غير مباعة بتكلفة ${Math.round(r.unsoldCost)}`, page: 'resale' });
    }
    return out;
  }
  function seedDemo(S, now = Date.now()) {
    S.resale = empty();
    const day = (n) => E.iso(E.addDays(new Date(now), n));
    const sup = { id: 'S' + uid(''), code: Acc.nextNo(S, 'C_SUP', 'SUP', 3), name: 'شركة الأمانة للسياحة (جملة)', category: 'WHOLESALER', currency: 'EGP', phone: '01000000777', taxNo: '' };
    S.suppliers.push(sup);
    const p = { id: uid('RP'), code: 'RSP-001', domain: 'UMRAH', name: 'عمرة المولد النبوي 15 يوم — برنامج الأمانة', supplierId: sup.id, supplierRef: 'AMN-MWLD-15', startDate: day(40), endDate: day(54),
      destination: 'مكة 10 ليالٍ + المدينة 4 ليالٍ — فنادق 4 نجوم', includes: 'الطيران والتأشيرة والإقامة والانتقالات والمزارات', mode: 'BLOCK', currency: 'EGP', fx: 1, releaseDate: day(20), status: 'OPEN', branchId: 'BR1',
      commissions: { default: 400 }, rows: [{ id: 'R1', label: 'غرفة رباعية', seats: 12, cost: 41000, price: 46500 }, { id: 'R2', label: 'غرفة ثلاثية', seats: 6, cost: 44500, price: 50500 }, { id: 'R3', label: 'غرفة ثنائية', seats: 4, cost: 49000, price: 56000 }], notes: '' };
    S.resale.programs.push(p); S.counters.C_RSP = 1;
    const who = { name: 'منة الله (سيلز)', role: 'OWNER', staffId: 'U1' };
    const mk = (d) => { try { return createBooking(S, { programId: p.id, ttl: 48, ...d }, who).booking; } catch (e) { return null; } };
    mk({ lines: [{ rowId: 'R1', qty: 4 }], lead: { name: 'أسرة الحاج سيد عبد الغني', phone: '01277001100' } });
    mk({ lines: [{ rowId: 'R2', qty: 3 }], lead: { name: 'محمود الشريف', phone: '01277001101' }, agentId: 'A4' });
    mk({ lines: [{ rowId: 'R3', qty: 2 }], lead: { name: 'د. سامية فؤاد', phone: '01277001102' } });
    return p;
  }
  return { MODES, DOMAIN_AR, empty, normalize, program, costCenter, unitCost, rowOf, soldOf, left, priceBooking, createBooking, cancelBooking, releaseExpired, pnl, alerts, seedDemo, uid };
});
