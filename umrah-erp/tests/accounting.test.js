// Run: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const Acc = require('../public/js/accounting.js');
const Model = require('../public/js/model.js');
const gov = require('../lib/governance.js');
const { buildSeed } = require('../public/js/data.js');

const NOW = new Date('2026-09-25T10:00:00').getTime();
const fresh = () => Model.load(buildSeed(NOW));
const OWNER = { name: 'owner', role: 'OWNER' }, SALES = { name: 'sales', role: 'SALES', staffId: 'U1' }, ACC = { name: 'acc', role: 'ACCOUNTANT' };

test('migrated demo company: trial balance and balance sheet balance', () => {
  const S = fresh();
  const tb = Acc.trialBalance(S);
  assert.equal(tb.tot.dr, tb.tot.cr);
  assert.equal(tb.tot.balDr, tb.tot.balCr);
  const bs = Acc.balanceSheet(S);
  assert.ok(Math.abs(bs.totalAssets - bs.totalLiabilities - bs.totalEquity) < 0.01);
});

test('posting rules: unbalanced / parent-account / unknown-account entries are rejected', () => {
  const S = fresh();
  assert.throws(() => Acc.post(S, { lines: [{ acc: '1103', dr: 100 }, { acc: '4101', cr: 90 }] }), /غير متوازن/);
  assert.throws(() => Acc.post(S, { lines: [{ acc: '11', dr: 100 }, { acc: '4101', cr: 100 }] }), /رئيسي/);
  assert.throws(() => Acc.post(S, { lines: [{ acc: '9999', dr: 100 }, { acc: '4101', cr: 100 }] }), /غير موجود/);
});

test('document cycle: sales creates a pending receipt → accountant posts → booking paid + status updated', () => {
  const S = fresh();
  const f = Model.findBooking(S, S.trips[0].bookings.find((b) => b.status === 'SOFT_HOLD' && !b.pendingPay).id);
  const b = f.b;
  const v = Model.createVoucher(S, { type: 'RV', amount: 10000, cashboxId: S.cashboxes[0].id, party: { type: 'customer', id: b.customerId }, bookingId: b.id, tripId: f.doc.id }, SALES);
  assert.equal(v.status, 'PENDING');
  assert.equal(b.pendingPay, true);
  b.holdUntil = NOW - 1; // an expired TTL must NOT release a booking whose payment is awaiting approval
  Model.mountTrip(S, f.doc.id);
  assert.deepEqual(E.releaseExpiredHolds(S, NOW), []);
  assert.throws(() => Model.approve(S, v.id, SALES), /صلاحية/);
  Model.approve(S, v.id, ACC);
  assert.equal(v.status, 'POSTED');
  assert.equal(b.paid, 10000);
  assert.equal(b.status, 'DEPOSIT');
  assert.equal(b.pendingPay, false);
  // revenue recognised once the booking went live
  const rev = S.journal.filter((j) => j.source.type === 'BK' && j.source.id === b.id);
  assert.ok(rev.length >= 1);
});

test('revenue sync is idempotent and reverses on cancellation', () => {
  const S = fresh();
  const d = S.trips[0], b = d.bookings.find((x) => x.status === 'CONFIRMED' && x.channel === 'DIRECT');
  const n = S.journal.length;
  Acc.syncBooking(S, d.trip, b, 'x');
  assert.equal(S.journal.length, n, 'no duplicate posting');
  b.status = 'CANCELLED';
  Acc.syncBooking(S, d.trip, b, 'x');
  const net = S.journal.filter((j) => j.source.id === b.id && j.source.type === 'BK').reduce((s, j) => s + j.lines.filter((l) => l.acc === '1103').reduce((x, l) => x + l.dr - l.cr, 0), 0);
  assert.ok(Math.abs(net) < 0.01, 'receivable back to zero after cancellation');
});

test('VAT: revenue split into output tax when enabled', () => {
  const S = fresh();
  S.company.vatEnabled = true; S.company.vatRate = 14;
  const d = S.trips[0], b = d.bookings.find((x) => x.status === 'SOFT_HOLD' && !x.pendingPay);
  b.status = 'CONFIRMED';
  const [je] = Acc.syncBooking(S, d.trip, b, 'x');
  const vat = je.lines.find((l) => l.acc === '2102').cr;
  assert.equal(vat, Acc.r2(b.net * 14 / 114));
});

test('supplier SAR payment books the FX difference against the trip reference rate', () => {
  const S = fresh();
  const cb = S.cashboxes[0];
  const v = Model.createVoucher(S, { type: 'PV', amount: 1000, currency: 'SAR', fx: 13.5, cashboxId: cb.id, party: { type: 'supplier', id: S.suppliers[0].id }, tripId: S.trips[0].id }, OWNER);
  v.refFx = 13.1;
  Model.approve(S, v.id, OWNER);
  const je = S.journal.find((j) => j.id === v.jeId);
  assert.equal(je.lines.find((l) => l.acc === '5207').dr, 400);
  assert.ok(S.trips[0].settlements.some((x) => x.id === v.id), 'trip P&L sees the settlement');
});

test('posted voucher cancellation uses a reversing entry', () => {
  const S = fresh();
  const v = Model.createVoucher(S, { type: 'EXP', amount: 500, cashboxId: S.cashboxes[0].id, categoryId: 'EC5' }, OWNER);
  Model.approve(S, v.id, OWNER);
  const before = Acc.cashboxBalance(S, S.cashboxes[0]);
  Acc.cancelPostedVoucher(S, v.id, OWNER);
  assert.equal(Acc.cashboxBalance(S, S.cashboxes[0]), before + 500);
  assert.equal(v.status, 'CANCELLED');
});

test('empty company: chart of accounts + main cash box, no trips', () => {
  const S = Model.emptyCompany('شركة جديدة', 'SA');
  assert.equal(S.trips.length, 0);
  assert.equal(S.company.vatRate, 15);
  assert.equal(S.cashboxes.length, 1);
  assert.equal(S.trip, null);
  assert.deepEqual(S.bookings, []);
});

test('multi-trip: new trip with rooms; mounting switches the operational arrays', () => {
  const S = fresh();
  const doc = Model.newTrip(S, { name: 'رحلة 2', departDate: '2026-12-01', makAllotmentId: S.allotments[0].id, madAllotmentId: S.allotments[1].id });
  Model.addTripRooms(doc, 'MAK', 'QUAD', 2);
  assert.match(doc.trip.code, /^TRP-2026-\d{3}$/);
  Model.mountTrip(S, doc.id);
  assert.equal(S.rooms.length, 2); assert.equal(S.beds.length, 8); assert.equal(S.bookings.length, 0);
  Model.mountTrip(S, S.trips[0].id);
  assert.ok(S.bookings.length > 10);
  assert.ok(!JSON.parse(Model.serialize(S)).bookings, 'mounted arrays are not serialised twice');
});

test('shared createBooking: customer auto-created with code, B2B wallet debited', () => {
  const S = fresh();
  const d = { channel: 'DIRECT', mode: 'FULL_PACKAGE', roomType: 'QUAD', pax: [{ nameAr: 'عميل جديد', nameEn: 'NEW CLIENT', gender: 'M', type: 'ADULT', passportExp: '2030-01-01', phone: '01099999999' }], ttl: 24 };
  const r = Model.createBooking(S, d, SALES);
  const c = S.customers.find((x) => x.id === r.booking.customerId);
  assert.match(c.code, /^CUS-\d{4}$/);
  const a = S.agents.find((x) => x.id === 'A1'), before = a.balance;
  const r2 = Model.createBooking(S, { ...d, channel: 'B2B', agentId: 'A1' }, SALES);
  assert.equal(r2.booking.status, 'CONFIRMED');
  assert.ok(a.balance < before);
});

test('alerts: overdue installments, missing documents and pending vouchers', () => {
  const S = fresh();
  const al = Model.alerts(S, 'ACCOUNTANT');
  assert.ok(al.some((a) => a.group === 'مالية'));
  assert.ok(al.some((a) => a.group === 'مستندات'));
  assert.ok(!Model.alerts(S, 'SALES').some((a) => a.group === 'مالية'), 'finance alerts only for approvers');
});

test('server governance rejects tampering by non-approvers', () => {
  const old = JSON.parse(Model.serialize(fresh()));
  const mut = (fn) => { const n = JSON.parse(JSON.stringify(old)); fn(n); return gov.validate(old, n, { role: 'SALES' }).errors; };
  assert.ok(mut((n) => { n.journal.pop(); }).length);
  assert.ok(mut((n) => { n.journal[0].lines[0].dr += 1; }).length);
  assert.ok(mut((n) => { n.vouchers.find((v) => v.status === 'PENDING').status = 'POSTED'; }).length);
  assert.ok(mut((n) => { n.agents[0].balance += 1000; }).length);
  assert.ok(mut((n) => { n.trips[0].bookings[1].paid += 1000; }).length);
  assert.ok(mut((n) => { n.company.vatRate = 0; }).length);
  assert.equal(mut((n) => { n.trips[0].bookings[0].notes = 'ok'; }).length, 0, 'normal operational edits pass');
});

test('FX: executive vs global spread alert; executive changes are logged and approver-only', () => {
  const S = fresh();
  S.fx.global = { rate: 13.0, at: NOW };
  S.fx.current = 13.36; S.fx.alertSpreadPct = 2;
  const i = Model.fxInfo(S);
  assert.equal(i.spreadPct, 2.77);
  assert.equal(i.alert, true);
  assert.ok(Model.alerts(S, 'ACCOUNTANT').some((a) => a.page === 'fx'));
  const old = JSON.parse(Model.serialize(S));
  const n = JSON.parse(Model.serialize(S));
  n.fx.current = 14; // silent change without history
  assert.ok(gov.validate(old, n, { role: 'OWNER' }).errors.some((e) => /سجل/.test(e)));
  const S2 = Model.load(JSON.parse(Model.serialize(S)));
  Model.setExecRate(S2, 13.5, 'acc', 'صرافة');
  const n2 = JSON.parse(Model.serialize(S2));
  assert.equal(gov.validate(old, n2, { role: 'ACCOUNTANT' }).errors.length, 0);
  assert.ok(gov.validate(old, n2, { role: 'SALES' }).errors.some((e) => /التنفيذي/.test(e)));
  const n3 = JSON.parse(Model.serialize(S)); n3.fx.global = { rate: 13.1, at: NOW + 1 };
  assert.equal(gov.validate(old, n3, { role: 'SALES' }).errors.length, 0, 'global benchmark updates are free');
});
