'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const Acc = require('../public/js/accounting.js');
const Dom = require('../public/js/dom.js');
const Model = require('../public/js/model.js');
const gov = require('../lib/governance.js');
const { buildSeed } = require('../public/js/data.js');

const demo = () => Model.load(buildSeed(Date.now()), 'x');
const clone = (S) => JSON.parse(Model.serialize(S));
const owner = { name: 'o', role: 'OWNER', staffId: 'U3' }, sales = { name: 's', role: 'SALES', staffId: 'U1' };

test('program pricing: occupancy × persons, child policy, extras, cost & margin', () => {
  const S = demo(), p = S.dom.programs.find((x) => x.code === 'DPR-001');
  const v = Dom.priceBooking(S, { programId: p.id, optIdx: 0, rooms: [{ type: 'DBL', adults: 2, children: [{ age: 7, bed: false }, { age: 1 }] }], extras: { X1: 2 }, actorRole: 'OWNER' });
  assert.equal(v.gross, 11900 * 2 + 2500 + 0 + 950 * 2);
  assert.equal(v.cost, 8200 * 2 + 1200 + 600 * 2);
  assert.deepEqual(v.units, { adults: 2, chd: 1, inf: 1 });
  assert.equal(v.status, 'SOFT_HOLD');
  const bad = Dom.priceBooking(S, { programId: p.id, optIdx: 0, rooms: [{ type: 'DBL', adults: 3, children: [] }] });
  assert.equal(bad.status, 'BLOCKED');
});

test('discount on a domestic booking: owner only; others go to the owner for approval', () => {
  const S = demo(), p = S.dom.programs[0];
  const d = { programId: p.id, optIdx: 1, rooms: [{ type: 'DBL', adults: 2, children: [] }], discountPct: 5, pax: [{ name: 'x', phone: '01099990000' }] };
  assert.equal(Dom.createBooking(S, d, sales).booking.status, 'PENDING_APPROVAL');
  assert.equal(Dom.createBooking(S, { ...d, pax: [{ name: 'y', phone: '01099990001' }] }, owner).booking.status, 'SOFT_HOLD');
});

test('hotel-only: nightly contract rates by season, weekend price, missing season blocks', () => {
  const S = demo(), ht = S.dom.hotels.find((x) => x.code === 'DHT-002');
  const thu = (() => { let d = E.iso(E.addDays(new Date(), 10)); while (new Date(d + 'T12:00:00').getDay() !== 4) d = E.iso(E.addDays(d, 1)); return d; })();
  const st = Dom.stayPrice(ht, thu, E.iso(E.addDays(thu, 3)), 'DBL', 'HB'); // Thu, Fri (weekend) + Sat
  assert.equal(st.price, 2800 + 2800 + 2400);
  const far = Dom.priceBooking(S, { hotel: { hotelId: ht.id, checkIn: E.iso(E.addDays(new Date(), 400)), checkOut: E.iso(E.addDays(new Date(), 402)), board: 'HB' }, rooms: [{ type: 'DBL', adults: 2 }] });
  assert.equal(far.status, 'BLOCKED');
});

test('domestic revenue posts to 4105, payment voucher updates the booking, cancel reverses', () => {
  const S = demo(), p = S.dom.programs[0];
  const { booking: b } = Dom.createBooking(S, { programId: p.id, optIdx: 1, rooms: [{ type: 'DBL', adults: 2, children: [] }], pax: [{ name: 'ت', phone: '01055550000' }] }, owner);
  const rev = () => Acc.balances(S).get('4105').bal;
  const before = rev();
  const v = Model.createVoucher(S, { type: 'RV', amount: 5000, cashboxId: S.cashboxes[0].id, party: { type: 'customer', id: b.customerId }, bookingId: b.id, tripId: p.id }, owner);
  Model.approve(S, v.id, owner);
  assert.equal(b.paid, 5000); assert.equal(b.status, 'DEPOSIT');
  assert.ok(Math.abs(rev() - (before + b.net)) < 0.01, 'revenue recognised on deposit');
  Dom.cancelBooking(S, b, 'o');
  assert.ok(Math.abs(rev() - before) < 0.01, 'revenue reversed on cancel');
  const tb = Acc.trialBalance(S); assert.ok(Math.abs(tb.tot.dr - tb.tot.cr) < 0.01);
});

test('seats: capacity per booking and no double booking', () => {
  const S = demo(), p = S.dom.programs[0];
  const { booking: b } = Dom.createBooking(S, { programId: p.id, optIdx: 1, rooms: [{ type: 'DBL', adults: 2 }], pax: [{ name: 'م', phone: '01044440000' }] }, owner);
  const taken = Number(Object.keys(Dom.seatMap(S, p).taken)[0]);
  assert.throws(() => Dom.toggleSeat(S, b, taken), /محجوز/);
  Dom.toggleSeat(S, b, 40); Dom.toggleSeat(S, b, 41);
  assert.throws(() => Dom.toggleSeat(S, b, 42), /مقعد فقط/);
});

test('taxes: VAT + stamp split inside the price; WHT withheld from supplier payment', () => {
  const S = demo();
  Object.assign(S.company, { vatEnabled: true, vatRate: 14, stampEnabled: true, stampRate: 1, whtEnabled: true, whtRate: 1, whtThreshold: 300 });
  const t = Acc.splitGross(S, 11500);
  assert.equal(t.vat, 1400); assert.equal(t.stamp, 100); assert.equal(t.net, 10000);
  const sup = S.suppliers[0];
  const v = Model.createVoucher(S, { type: 'PV', amount: 10000, cashboxId: S.cashboxes[0].id, party: { type: 'supplier', id: sup.id } }, owner);
  assert.equal(v.wht, 100);
  Model.approve(S, v.id, owner);
  const je = S.journal.find((j) => j.id === v.jeId);
  assert.equal(je.lines.find((l) => l.acc === '2105').cr, 100);
  assert.equal(je.lines.find((l) => l.acc === S.cashboxes[0].accountCode).cr, 9900);
  S.company.incomeTaxEnabled = true; S.company.incomeTaxRate = 22.5;
  const is = Acc.incomeStatement(S);
  assert.equal(is.estTax, is.netProfit > 0 ? Acc.r2(is.netProfit * 0.225) : 0);
});

test('country presets and domains', () => {
  const c = Model.applyCountry({}, 'SA');
  assert.equal(c.vatRate, 15); assert.equal(c.currency, 'SAR'); assert.equal(c.incomeTaxLabel, 'الزكاة');
  const S = demo();
  assert.ok(Model.hasDomain(S, 'DOMESTIC'));
  S.branches[1].domains = ['UMRAH'];
  assert.equal(Model.hasDomain(S, 'DOMESTIC', S.branches[1].id), false);
});

test('governance: discount/commission/domestic paid are protected for non-owners', () => {
  const base = demo(), old = clone(base);
  // sales edits a domestic booking's paid amount directly → refused
  let n = clone(base); n.dom.bookings[0].paid += 1000;
  assert.ok(gov.validate(old, n, { role: 'SALES', id: 2 }).errors.some((e) => /المسدد/.test(e)));
  // manager raises a commission adjustment → refused; owner → allowed
  n = clone(base); const b = n.trips[0].bookings.find((x) => x.agentId === 'A4'); b.commissionAdj = 300; b.agentCommission += 300;
  assert.ok(gov.validate(old, n, { role: 'MANAGER', id: 2 }).errors.some((e) => /عمولة/.test(e)));
  assert.equal(gov.validate(old, n, { role: 'OWNER', id: 1 }).errors.length, 0);
  // new booking created by a manager with an unapproved discount → refused
  n = clone(base); n.dom.bookings.push({ ...n.dom.bookings[0], id: 'DBX', code: 'DBK-X', discountPct: 5, status: 'SOFT_HOLD', paid: 0 });
  assert.ok(gov.validate(old, n, { role: 'MANAGER', id: 2 }).errors.some((e) => /مالك النظام/.test(e)));
  // trip commission rates: owner only
  n = clone(base); n.trips[0].trip.commissions = { default: 999 };
  assert.ok(gov.validate(old, n, { role: 'MANAGER', id: 2 }).errors.length);
});
