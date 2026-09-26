/* =====================================================================
 * Umrah ERP — Accounting core (double entry, document cycle, reports)
 * Pure functions over the company state; used by the browser AND server.
 *
 *  - Chart of accounts tree (4 levels), leaf-only postings, base currency EGP
 *  - Journal entries are append-only: a posted entry is never edited, only reversed
 *  - Vouchers (document cycle): RV receipt · PV payment · EXP expense · TR transfer
 *    · BILL supplier invoice · JV manual journal — PENDING → POSTED / REJECTED
 *  - Party sub-ledgers: customer · agent · supplier · employee
 *  - Booking revenue auto-sync (idempotent delta postings, VAT aware)
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.Acc = factory(root.Engine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';
  const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  // ------------------------------------------------------------ chart
  const DEFAULT_ACCOUNTS = [
    ['1', 'الأصول'], ['11', 'الأصول المتداولة', '1'],
    ['1101', 'النقدية بالخزائن', '11'], ['1102', 'النقدية بالبنوك', '11'],
    ['1103', 'العملاء', '11'], ['1104', 'الوكلاء والمناديب', '11'], ['1105', 'سلف وعهد الموظفين', '11'],
    ['1106', 'دفعات مقدمة للموردين', '11'], ['1107', 'ضريبة القيمة المضافة - مدخلات', '11'], ['1108', 'ضرائب خصم تحت الحساب (خصمها العملاء)', '11'],
    ['12', 'الأصول الثابتة', '1'], ['1201', 'أثاث وأجهزة ومعدات', '12'],
    ['2', 'الخصوم'], ['21', 'الخصوم المتداولة', '2'],
    ['2101', 'الموردون', '21'], ['2102', 'ضريبة القيمة المضافة - مخرجات', '21'], ['2103', 'مستحقات الموظفين', '21'], ['2104', 'مصروفات مستحقة', '21'],
    ['2105', 'ضريبة الخصم والإضافة المستحقة', '21'], ['2106', 'ضريبة الدمغة المستحقة', '21'], ['2107', 'ضريبة الدخل / الزكاة المستحقة', '21'],
    ['3', 'حقوق الملكية'], ['3101', 'رأس المال', '3'], ['3102', 'الأرباح المحتجزة', '3'], ['3103', 'جاري الشركاء', '3'],
    ['4', 'الإيرادات'], ['4101', 'إيرادات رحلات العمرة', '4'], ['4102', 'إيرادات خدمات منفصلة', '4'],
    ['4103', 'أرباح فروق العملة', '4'], ['4104', 'إيرادات أخرى', '4'], ['4105', 'إيرادات السياحة الداخلية', '4'], ['4106', 'إيرادات رحلات اختيارية وإضافات', '4'],
    ['5', 'التكاليف والمصروفات'], ['51', 'تكاليف الرحلات', '5'],
    ['5101', 'تكلفة الفنادق', '51'], ['5102', 'تكلفة الطيران', '51'], ['5103', 'تكلفة التأشيرات والتأمين', '51'],
    ['5104', 'تكلفة النقل البري', '51'], ['5105', 'تكاليف تشغيل ومزارات', '51'], ['5106', 'تكاليف السياحة الداخلية (فنادق وقرى)', '51'], ['5107', 'تكاليف رحلات اختيارية وإضافات', '51'],
    ['52', 'المصروفات العمومية والإدارية', '5'],
    ['5201', 'الرواتب والأجور', '52'], ['5202', 'الإيجارات', '52'], ['5203', 'كهرباء ومياه وإنترنت', '52'],
    ['5204', 'تسويق وإعلان', '52'], ['5205', 'عمولات الوكلاء والوسطاء', '52'], ['5206', 'نثريات ومصروفات متنوعة', '52'],
    ['5207', 'خسائر فروق العملة', '52'], ['5208', 'مصروفات بنكية', '52'], ['5209', 'انتقالات ومواصلات', '52'], ['5210', 'ضرائب ورسوم حكومية', '52'],
  ].map(([code, name, parent]) => ({ code, name, parent: parent || null, system: true }));

  const DEFAULT_EXPENSE_CATEGORIES = [
    ['EC1', 'رواتب وأجور', '5201'], ['EC2', 'إيجار المقر', '5202'], ['EC3', 'كهرباء ومياه وإنترنت', '5203'],
    ['EC4', 'تسويق وإعلانات', '5204'], ['EC5', 'نثريات مكتب', '5206'], ['EC6', 'انتقالات', '5209'],
    ['EC7', 'مصروفات بنكية', '5208'], ['EC8', 'نثريات مشرفين (ميدانية)', '5105'],
  ].map(([id, name, accountCode]) => ({ id, name, accountCode }));

  const TYPE = { 1: 'asset', 2: 'liability', 3: 'equity', 4: 'revenue', 5: 'expense' };
  const TYPE_AR = { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' };
  const accType = (code) => TYPE[String(code)[0]];
  const debitNormal = (code) => ['asset', 'expense'].includes(accType(code));
  const PARTY_ACCOUNT = { customer: '1103', agent: '1104', employee: '1105', supplier: '2101' };
  const PARTY_AR = { customer: 'عميل', agent: 'وكيل/مندوب', employee: 'موظف', supplier: 'مورد' };
  const APPROVER_ROLES = ['OWNER', 'MANAGER', 'ACCOUNTANT'];
  const VOUCHER_TYPES = {
    RV: 'سند قبض', PV: 'سند صرف', EXP: 'سند مصروف', TR: 'تحويل بين الخزائن/البنوك', BILL: 'فاتورة مورد', JV: 'قيد يومية',
  };

  /** Adds system accounts introduced by newer versions to an existing company chart (never removes anything). */
  function ensureAccounts(S) {
    const have = new Set(S.accounts.map((a) => a.code));
    for (const a of DEFAULT_ACCOUNTS) if (!have.has(a.code)) S.accounts.push({ ...a });
  }
  /** Sales-side taxes are INCLUDED in the booking price: net = revenue + VAT + stamp duty. */
  function salesTaxRates(S) {
    const c = S.company || {};
    return { vat: c.vatEnabled ? Number(c.vatRate || 0) : 0, stamp: c.stampEnabled ? Number(c.stampRate || 0) : 0 };
  }
  function splitGross(S, gross) {
    const t = salesTaxRates(S), k = 100 + t.vat + t.stamp;
    const vat = r2(gross * t.vat / k), stamp = r2(gross * t.stamp / k);
    return { vat, stamp, net: r2(gross - vat - stamp) };
  }
  /** Withholding tax the company must deduct from a supplier payment (Egypt: الخصم والإضافة). */
  function whtFor(S, amount) {
    const c = S.company || {};
    if (!c.whtEnabled || !(amount >= Number(c.whtThreshold || 0))) return 0;
    return r2(amount * Number(c.whtRate || 0) / 100);
  }
  const account = (S, code) => S.accounts.find((a) => a.code === code);
  const isLeaf = (S, code) => !S.accounts.some((a) => a.parent === code);
  const children = (S, code) => S.accounts.filter((a) => a.parent === code);

  function addAccount(S, parent, name, extra = {}) {
    const sibs = children(S, parent).map((a) => a.code).filter((c) => /^\d+$/.test(c));
    const base = parent.length >= 4 ? parent + '01' : parent + '01';
    let code = sibs.length ? String(Math.max(...sibs.map(Number)) + 1) : base;
    while (account(S, code)) code = String(Number(code) + 1);
    const a = { code, name, parent, system: false, ...extra };
    S.accounts.push(a);
    return a;
  }

  function nextNo(S, key, prefix, pad = 6) {
    S.counters = S.counters || {};
    S.counters[key] = (S.counters[key] || 0) + 1;
    return `${prefix}-${String(S.counters[key]).padStart(pad, '0')}`;
  }

  // ------------------------------------------------------------ posting
  function post(S, { date, memo, source, tripId, branchId, lines, by }) {
    const clean = lines.map((l) => ({ acc: l.acc, dr: r2(l.dr || 0), cr: r2(l.cr || 0), party: l.party || null, note: l.note || '' }))
      .filter((l) => l.dr || l.cr);
    if (clean.length < 2) throw new Error('القيد يحتاج طرفين على الأقل');
    for (const l of clean) {
      if (!account(S, l.acc)) throw new Error(`الحساب ${l.acc} غير موجود في الشجرة`);
      if (!isLeaf(S, l.acc)) throw new Error(`الحساب ${l.acc} حساب رئيسي — القيد على الحسابات الفرعية فقط`);
      if (l.dr < 0 || l.cr < 0) throw new Error('لا يسمح بمبالغ سالبة');
    }
    const dr = r2(clean.reduce((s, l) => s + l.dr, 0)), cr = r2(clean.reduce((s, l) => s + l.cr, 0));
    if (Math.abs(dr - cr) > 0.01) throw new Error(`القيد غير متوازن: مدين ${dr} ≠ دائن ${cr}`);
    const je = { id: 'JE' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), no: nextNo(S, 'JE', 'JE'), date: date || E.iso(new Date()),
      memo: memo || '', source: source || { type: 'MANUAL' }, tripId: tripId || null, branchId: branchId || null, lines: clean, total: dr, at: Date.now(), by: by || '' };
    S.journal.push(je);
    return je;
  }
  function reverse(S, jeId, by, memo) {
    const je = S.journal.find((j) => j.id === jeId);
    if (!je) throw new Error('القيد غير موجود');
    if (je.reversedBy) throw new Error('القيد معكوس بالفعل');
    const rev = post(S, { memo: memo || `عكس القيد ${je.no}`, source: { type: 'REV', id: je.id }, tripId: je.tripId, branchId: je.branchId,
      lines: je.lines.map((l) => ({ ...l, dr: l.cr, cr: l.dr })), by });
    je.reversedBy = rev.id;
    return rev;
  }

  // ---------------------------------------------- booking revenue sync
  /** Idempotent: posts only the delta between what the booking should have recognised and what is already posted. */
  function syncBooking(S, trip, b, by) {
    const live = ['DEPOSIT', 'CONFIRMED'].includes(b.status) && b.net != null;
    const party = b.channel === 'B2B' ? { type: 'agent', id: b.agentId } : b.customerId ? { type: 'customer', id: b.customerId } : null;
    const recv = b.channel === 'B2B' ? '1104' : '1103';
    const out = [];
    const postedFor = (type, acc) => r2(S.journal.filter((j) => j.source.type === type && j.source.id === b.id)
      .reduce((s, j) => s + j.lines.filter((l) => l.acc === acc).reduce((x, l) => x + l.dr - l.cr, 0), 0));
    // revenue
    const want = live ? r2(b.net) : 0, have = postedFor('BK', recv);
    const diff = r2(want - have);
    if (Math.abs(diff) >= 0.01) {
      const tx = splitGross(S, Math.abs(diff)), sg = diff > 0 ? 1 : -1;
      const revAcc = b.revAcc || (b.mode === 'UNBUNDLED' ? '4102' : '4101');
      const side = (acc, amt, party2) => (amt ? [sg > 0 ? { acc, cr: amt, party: party2 } : { acc, dr: amt, party: party2 }] : []);
      const lines = [sg > 0 ? { acc: recv, dr: diff, party } : { acc: recv, cr: -diff, party }, ...side(revAcc, tx.net), ...side('2102', tx.vat), ...side('2106', tx.stamp)];
      out.push(post(S, { memo: `${diff > 0 ? 'إيراد' : 'تسوية إيراد'} حجز ${b.code}`, source: { type: 'BK', id: b.id }, tripId: trip && trip.id, branchId: b.branchId, lines, by }));
    }
    // broker commission + agent-credit incentive (payable to the agent)
    const comm = live ? r2((b.agentCommission || 0) + (b.incentiveMode === 'AGENT_CREDIT' ? b.incentive || 0 : 0)) : 0;
    const haveC = -postedFor('BKC', '1104');
    const dc = r2(comm - haveC);
    if (b.agentId && Math.abs(dc) >= 0.01) {
      const ap = { type: 'agent', id: b.agentId };
      out.push(post(S, { memo: `عمولة حجز ${b.code}`, source: { type: 'BKC', id: b.id }, tripId: trip && trip.id, branchId: b.branchId, by,
        lines: dc > 0 ? [{ acc: '5205', dr: dc }, { acc: '1104', cr: dc, party: ap }] : [{ acc: '5205', cr: -dc }, { acc: '1104', dr: -dc, party: ap }] }));
    }
    return out;
  }

  // ---------------------------------------------------------- vouchers
  const cashbox = (S, id) => S.cashboxes.find((c) => c.id === id);
  const partyAcc = (p) => (p && PARTY_ACCOUNT[p.type]) || null;
  const canApprove = (role) => APPROVER_ROLES.includes(role);

  function createVoucher(S, data, actor) {
    const t = data.type;
    if (!VOUCHER_TYPES[t]) throw new Error('نوع سند غير معروف');
    const amount = r2(data.amount);
    if (t !== 'JV' && !(amount > 0)) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
    if (['RV', 'PV', 'EXP'].includes(t) && !cashbox(S, data.cashboxId)) throw new Error('اختر الخزينة/البنك');
    if (t === 'TR' && (!cashbox(S, data.cashboxId) || !cashbox(S, data.toCashboxId) || data.cashboxId === data.toCashboxId)) throw new Error('اختر خزينتين مختلفتين للتحويل');
    if (t === 'EXP' && !S.expenseCategories.find((c) => c.id === data.categoryId)) throw new Error('اختر بند المصروف');
    if (t === 'BILL' && !(data.party && data.party.type === 'supplier')) throw new Error('فاتورة المورد تحتاج مورد');
    if (['RV', 'PV'].includes(t) && !data.party && !data.accountCode) throw new Error('حدد الطرف (عميل/وكيل/مورد/موظف) أو الحساب المقابل');
    const v = {
      id: 'V' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), no: nextNo(S, t, t), type: t,
      date: data.date || E.iso(new Date()), amount, currency: data.currency || 'EGP', fx: Number(data.fx) || 1,
      cashboxId: data.cashboxId || null, toCashboxId: data.toCashboxId || null, party: data.party || null,
      accountCode: data.accountCode || null, categoryId: data.categoryId || null, purpose: data.purpose || null,
      tripId: data.tripId || null, bookingId: data.bookingId || null, branchId: data.branchId || null,
      memo: data.memo || '', fileIds: data.fileIds || [], lines: data.lines || null, method: data.method || '',
      status: 'PENDING', createdBy: actor.name, createdByRole: actor.role, createdAt: Date.now(),
      // withholding: deducted by us from a supplier payment · or deducted from us by a corporate customer
      wht: t === 'PV' && data.party && data.party.type === 'supplier' ? (data.wht != null ? r2(data.wht) : whtFor(S, amount)) : 0,
      whtIn: t === 'RV' ? r2(Number(data.whtIn) || 0) : 0,
    };
    if (v.wht >= amount || v.whtIn >= amount) throw new Error('ضريبة الخصم أكبر من المبلغ');
    S.vouchers.push(v);
    if (data.autoPost && canApprove(actor.role)) approveVoucher(S, v.id, actor);
    return v;
  }

  function voucherLines(S, v) {
    const lines = baseVoucherLines(S, v);
    const rate = v.currency === 'EGP' ? 1 : v.fx, cbAcc = v.cashboxId && cashbox(S, v.cashboxId) ? cashbox(S, v.cashboxId).accountCode : null;
    const adjust = (amt, sideKey, acc, note) => {
      if (!amt) return;
      const x = r2(amt * rate), cash = lines.find((l) => l.acc === cbAcc && l[sideKey]);
      cash[sideKey] = r2(cash[sideKey] - x);
      lines.push({ acc, [sideKey]: x, note });
    };
    if (v.type === 'PV') adjust(v.wht, 'cr', '2105', 'ضريبة خصم وإضافة محجوزة');
    if (v.type === 'RV') adjust(v.whtIn, 'dr', '1108', 'ضريبة خصمها العميل تحت الحساب');
    return lines;
  }
  function baseVoucherLines(S, v) {
    const egp = r2(v.amount * (v.currency === 'EGP' ? 1 : v.fx));
    const cb = cashbox(S, v.cashboxId);
    switch (v.type) {
      case 'RV': return [{ acc: cb.accountCode, dr: egp }, { acc: partyAcc(v.party) || v.accountCode, cr: egp, party: v.party }];
      case 'PV': {
        // employee: SALARY = direct expense · DUES = paying a posted payroll (clears 2103) · ADVANCE = on the employee's account
        if (v.party && v.party.type === 'employee' && v.purpose === 'DUES') return [{ acc: '2103', dr: egp, party: v.party, note: 'صرف مستحقات/راتب' }, { acc: cb.accountCode, cr: egp }];
        const pa = v.party && v.party.type === 'employee' && v.purpose === 'SALARY' ? '5201' : partyAcc(v.party) || v.accountCode;
        // Supplier paid in SAR: carry at the trip reference rate, book the FX difference separately.
        if (v.party && v.party.type === 'supplier' && v.currency === 'SAR' && v.refFx) {
          const carry = r2(v.amount * v.refFx), d = r2(egp - carry);
          const lines = [{ acc: '2101', dr: carry, party: v.party }, { acc: cb.accountCode, cr: egp }];
          if (d > 0) lines.push({ acc: '5207', dr: d }); else if (d < 0) lines.push({ acc: '4103', cr: -d });
          return lines;
        }
        return [{ acc: pa, dr: egp, party: pa === '5201' ? null : v.party, note: pa === '5201' ? 'راتب' : '' }, { acc: cb.accountCode, cr: egp }];
      }
      case 'EXP': return [{ acc: S.expenseCategories.find((c) => c.id === v.categoryId).accountCode, dr: egp }, { acc: cb.accountCode, cr: egp }];
      case 'TR': return [{ acc: cashbox(S, v.toCashboxId).accountCode, dr: egp }, { acc: cb.accountCode, cr: egp }];
      case 'BILL': return [{ acc: v.accountCode || '5101', dr: egp }, { acc: '2101', cr: egp, party: v.party }];
      case 'JV': return v.lines;
      default: throw new Error('نوع سند غير معروف');
    }
  }

  /** Approval = posting. Side effects keep the operational modules (bookings, wallets, trip P&L) in sync. */
  function approveVoucher(S, id, actor, hooks = {}) {
    const v = S.vouchers.find((x) => x.id === id);
    if (!v) throw new Error('السند غير موجود');
    if (v.status !== 'PENDING') throw new Error('السند ليس بانتظار الاعتماد');
    if (!canApprove(actor.role)) throw new Error('الاعتماد من صلاحية المحاسب أو المدير فقط');
    const je = post(S, { date: v.date, memo: `${VOUCHER_TYPES[v.type]} ${v.no}${v.memo ? ' — ' + v.memo : ''}`, source: { type: v.type, id: v.id },
      tripId: v.tripId, branchId: v.branchId, lines: voucherLines(S, v), by: actor.name });
    v.status = 'POSTED'; v.jeId = je.id; v.approvedBy = actor.name; v.approvedAt = Date.now();
    if (hooks.onPosted) hooks.onPosted(v);
    return v;
  }
  function rejectVoucher(S, id, actor, reason) {
    const v = S.vouchers.find((x) => x.id === id);
    if (!v || v.status !== 'PENDING') throw new Error('السند ليس بانتظار الاعتماد');
    if (!canApprove(actor.role)) throw new Error('الرفض من صلاحية المحاسب أو المدير فقط');
    v.status = 'REJECTED'; v.rejectReason = reason || ''; v.approvedBy = actor.name; v.approvedAt = Date.now();
    return v;
  }
  function cancelPostedVoucher(S, id, actor) {
    const v = S.vouchers.find((x) => x.id === id);
    if (!v || v.status !== 'POSTED') throw new Error('السند غير مرحّل');
    if (!canApprove(actor.role)) throw new Error('الإلغاء من صلاحية المحاسب أو المدير فقط');
    reverse(S, v.jeId, actor.name, `إلغاء ${VOUCHER_TYPES[v.type]} ${v.no}`);
    v.status = 'CANCELLED'; v.cancelledBy = actor.name;
    return v;
  }

  // ----------------------------------------------------------- reports
  const inRange = (j, f) => (!f.from || j.date >= f.from) && (!f.to || j.date <= f.to) && (!f.tripId || j.tripId === f.tripId) && (!f.branchId || j.branchId === f.branchId);

  /** Leaf movements rolled up the tree. Returns Map code → {dr, cr, bal} with bal in the account's normal direction. */
  function balances(S, f = {}) {
    const m = new Map(S.accounts.map((a) => [a.code, { dr: 0, cr: 0 }]));
    for (const j of S.journal) if (inRange(j, f)) for (const l of j.lines) {
      let code = l.acc;
      while (code) { const x = m.get(code); if (x) { x.dr += l.dr; x.cr += l.cr; } const a = account(S, code); code = a && a.parent; }
    }
    for (const [code, x] of m) { x.dr = r2(x.dr); x.cr = r2(x.cr); x.bal = r2(debitNormal(code) ? x.dr - x.cr : x.cr - x.dr); }
    return m;
  }
  function trialBalance(S, f = {}) {
    const b = balances(S, f);
    const rows = S.accounts.filter((a) => isLeaf(S, a.code)).map((a) => {
      const x = b.get(a.code), net = r2(x.dr - x.cr);
      return { code: a.code, name: a.name, dr: x.dr, cr: x.cr, balDr: net > 0 ? net : 0, balCr: net < 0 ? -net : 0 };
    }).filter((r) => r.dr || r.cr).sort((a, b) => a.code.localeCompare(b.code));
    const tot = rows.reduce((t, r) => ({ dr: t.dr + r.dr, cr: t.cr + r.cr, balDr: t.balDr + r.balDr, balCr: t.balCr + r.balCr }), { dr: 0, cr: 0, balDr: 0, balCr: 0 });
    return { rows, tot: { dr: r2(tot.dr), cr: r2(tot.cr), balDr: r2(tot.balDr), balCr: r2(tot.balCr) } };
  }
  function ledger(S, code, f = {}) {
    const codes = new Set([code]);
    let grew = true;
    while (grew) { grew = false; for (const a of S.accounts) if (a.parent && codes.has(a.parent) && !codes.has(a.code)) { codes.add(a.code); grew = true; } }
    const rows = [];
    let bal = 0;
    for (const j of S.journal.slice().sort((a, b) => (a.date + a.at).localeCompare(b.date + b.at))) {
      if (!inRange(j, f)) continue;
      for (const l of j.lines) {
        if (!codes.has(l.acc)) continue;
        if (f.party && !(l.party && l.party.type === f.party.type && l.party.id === f.party.id)) continue;
        bal = r2(bal + (debitNormal(code) ? l.dr - l.cr : l.cr - l.dr));
        rows.push({ date: j.date, no: j.no, memo: j.memo + (l.note ? ` (${l.note})` : ''), acc: l.acc, dr: l.dr, cr: l.cr, bal, jeId: j.id, source: j.source });
      }
    }
    return rows;
  }
  /** Party statement across ALL accounts (e.g. an employee with advances + salaries). Balance: + means the party owes us. */
  function partyStatement(S, type, id, f = {}) {
    const rows = [];
    let bal = 0;
    for (const j of S.journal.slice().sort((a, b) => (a.date + a.at).localeCompare(b.date + b.at))) {
      if (!inRange(j, f)) continue;
      for (const l of j.lines) {
        if (!(l.party && l.party.type === type && l.party.id === id)) continue;
        bal = r2(bal + l.dr - l.cr);
        rows.push({ date: j.date, no: j.no, memo: j.memo, acc: l.acc, dr: l.dr, cr: l.cr, bal, source: j.source });
      }
    }
    return { rows, balance: bal };
  }
  const partyBalance = (S, type, id) => partyStatement(S, type, id).balance;

  function incomeStatement(S, f = {}) {
    const b = balances(S, f);
    const leaf = (p) => S.accounts.filter((a) => a.code.startsWith(p) && isLeaf(S, a.code)).map((a) => ({ code: a.code, name: a.name, amount: b.get(a.code).bal })).filter((x) => x.amount);
    const revenue = leaf('4'), tripCosts = leaf('51'), opex = leaf('52');
    const sum = (a) => r2(a.reduce((s, x) => s + x.amount, 0));
    const R = sum(revenue), C = sum(tripCosts), O = sum(opex);
    const net = r2(R - C - O), c = S.company || {};
    // income tax / zakat: an ESTIMATE for management (the accountant posts the real liability to 2107)
    const taxRate = c.incomeTaxEnabled ? Number(c.incomeTaxRate || 0) : 0, estTax = net > 0 ? r2(net * taxRate / 100) : 0;
    return { revenue, tripCosts, opex, totalRevenue: R, totalTripCosts: C, grossProfit: r2(R - C), totalOpex: O, netProfit: net,
      taxRate, taxLabel: c.incomeTaxLabel || 'ضريبة الدخل', estTax, netAfterTax: r2(net - estTax) };
  }
  function balanceSheet(S, f = {}) {
    const b = balances(S, f);
    const inc = incomeStatement(S, f);
    const lines = (p) => S.accounts.filter((a) => a.parent === p).map((a) => ({ code: a.code, name: a.name, amount: b.get(a.code).bal })).filter((x) => x.amount);
    const assets = [...lines('11'), ...lines('12')], liabilities = lines('21'), equity = lines('3');
    const sum = (a) => r2(a.reduce((s, x) => s + x.amount, 0));
    return { assets, liabilities, equity, currentProfit: inc.netProfit, totalAssets: sum(assets), totalLiabilities: sum(liabilities),
      totalEquity: r2(sum(equity) + inc.netProfit) };
  }
  const cashboxBalance = (S, cb) => { const b = balances(S); const x = b.get(cb.accountCode); return x ? x.bal : 0; };

  return {
    DEFAULT_ACCOUNTS, DEFAULT_EXPENSE_CATEGORIES, TYPE_AR, PARTY_ACCOUNT, PARTY_AR, APPROVER_ROLES, VOUCHER_TYPES,
    r2, account, isLeaf, children, addAccount, accType, debitNormal, nextNo, post, reverse, syncBooking,
    canApprove, createVoucher, approveVoucher, rejectVoucher, cancelPostedVoucher, voucherLines,
    balances, trialBalance, ledger, partyStatement, partyBalance, incomeStatement, balanceSheet, cashboxBalance,
    ensureAccounts, salesTaxRates, splitGross, whtFor,
  };
});
