// Run: node --test umrah-erp/tests/*.test.js  (or: npm run test:umrah)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const { buildSeed } = require('../public/js/data.js');

const NOW = new Date('2026-09-25T10:00:00').getTime();
const seed = () => buildSeed(NOW);
const paxBy = (s, en) => s.pax.find((p) => p.nameEn.startsWith(en));
const roomOf = (s, pax, city) => s.rooms.find((r) => r.id === E.bedOfPax(s, pax.id, city).roomId);
const freeBedIn = (s, room) => E.bedsOfRoom(s, room.id).find((b) => !b.paxId);

test('FX variance follows Amount(SAR) × (actual − ref)', () => {
  assert.equal(E.fxVariance(10000, 13.1, 13.4), 3000);
  assert.equal(E.fxVariance(10000, 13.1, 12.9), -2000);
});

test('costing: bigger rooms are cheaper per pax, sell ≥ cost × (1+margin)', () => {
  const s = seed();
  const c = E.computeCosting(s.trip, s.allotments);
  const t = c.byType;
  assert.ok(t.DBL.costEGP > t.TPL.costEGP && t.TPL.costEGP > t.QUAD.costEGP && t.QUAD.costEGP > t.QUINT.costEGP);
  for (const r of Object.values(t)) {
    assert.ok(r.sellEGP >= r.costEGP * (1 + s.trip.marginPct / 100) - 0.01);
    assert.equal(r.sellEGP % 250, 0);
  }
  // Breakage reserve is exactly breakagePct of accommodation.
  assert.ok(Math.abs(t.QUAD.breakageSAR - t.QUAD.accomSAR * 0.025) < 0.01);
  assert.ok(c.infant.costEGP < c.child.costEGP && c.child.costEGP < t.QUINT.costEGP);
});

test('locked price list wins over live recalculation', () => {
  const s = seed();
  s.trip.lockedPrices = { ...E.priceList(s) };
  const before = E.priceList(s).QUAD;
  s.trip.fxRef = 20;
  assert.equal(E.priceList(s).QUAD, before);
});

test('discount beyond authority → PENDING_APPROVAL; within authority → SOFT_HOLD', () => {
  const s = seed();
  const pax = [{ type: 'ADULT', gender: 'M', passportExp: '2030-01-01' }];
  const base = { mode: 'FULL_PACKAGE', roomType: 'QUAD', pax, discountPct: 3 };
  assert.equal(E.priceBooking(s, { ...base, userId: 'U1' }).status, 'PENDING_APPROVAL'); // sales 0%
  assert.equal(E.priceBooking(s, { ...base, userId: 'U2' }).status, 'SOFT_HOLD');        // head 3%
  assert.equal(E.priceBooking(s, { ...base, userId: 'U2', discountPct: 5 }).status, 'PENDING_APPROVAL');
  assert.equal(E.priceBooking(s, { ...base, userId: 'U3', discountPct: 7 }).status, 'SOFT_HOLD');
});

test('unbundled services lock price and await management pricing', () => {
  const v = E.priceBooking(seed(), { mode: 'UNBUNDLED', roomType: 'QUAD', pax: [{ type: 'ADULT', passportExp: '2030-01-01' }], userId: 'U3' });
  assert.equal(v.status, 'PENDING_PRICING');
  assert.equal(v.net, null);
});

test('B2B wallet: net rate applied; overdue agent and over-limit are blocked', () => {
  const s = seed();
  const pax = [{ type: 'ADULT', passportExp: '2030-01-01' }];
  const ok = E.priceBooking(s, { mode: 'FULL_PACKAGE', roomType: 'QUAD', pax, agentId: 'A1' });
  assert.equal(ok.channelDiscount, E.round2(ok.gross * 0.06));
  assert.notEqual(ok.status, 'BLOCKED');
  assert.equal(E.priceBooking(s, { mode: 'FULL_PACKAGE', roomType: 'QUAD', pax, agentId: 'A3' }).status, 'BLOCKED'); // overdue 19 days
  const big = Array.from({ length: 12 }, () => ({ type: 'ADULT', passportExp: '2030-01-01' }));
  assert.equal(E.priceBooking(s, { mode: 'FULL_PACKAGE', roomType: 'DBL', pax: big, agentId: 'A1' }).status, 'BLOCKED');
});

test('incentive kickback: client discount reduces net, agent credit does not', () => {
  const s = seed();
  const pax = [{ type: 'ADULT', passportExp: '2030-01-01' }, { type: 'ADULT', passportExp: '2030-01-01' }];
  const a = E.priceBooking(s, { mode: 'FULL_PACKAGE', roomType: 'QUAD', pax, agentId: 'A4', incentive: 300, incentiveMode: 'CLIENT_DISCOUNT' });
  const b = E.priceBooking(s, { mode: 'FULL_PACKAGE', roomType: 'QUAD', pax, agentId: 'A4', incentive: 300, incentiveMode: 'AGENT_CREDIT' });
  assert.equal(b.net - a.net, 600);
  assert.equal(a.agentCommission, E.round2(a.gross * 0.04));
});

test('payment lifecycle: SOFT_HOLD → DEPOSIT → CONFIRMED; approval gate not bypassed by money', () => {
  const b = { status: 'SOFT_HOLD', net: 1000, paid: 0, holdUntil: 123 };
  E.applyPayment(b, 300); assert.equal(b.status, 'DEPOSIT'); assert.equal(b.holdUntil, null);
  E.applyPayment(b, 700); assert.equal(b.status, 'CONFIRMED');
  const p = { status: 'PENDING_APPROVAL', net: 1000, paid: 0 };
  E.applyPayment(p, 1000); assert.equal(p.status, 'PENDING_APPROVAL');
});

test('TTL is clamped to 2..24 hours', () => {
  assert.equal(E.clampTTL(1), 2); assert.equal(E.clampTTL(48), 24); assert.equal(E.clampTTL(6), 6);
});

test('expired soft-hold releases beds and bus seats automatically', () => {
  const s = seed();
  const amal = paxBy(s, 'AMAL');
  assert.ok(E.bedOfPax(s, amal.id, 'MAK'));
  const bk = s.bookings.find((b) => b.id === amal.bookingId);
  bk.holdUntil = NOW - 1;
  const released = E.releaseExpiredHolds(s, NOW);
  assert.deepEqual(released, [bk.code]);
  assert.equal(bk.status, 'EXPIRED');
  assert.equal(E.bedOfPax(s, amal.id, 'MAK'), undefined);
  assert.ok(!Object.values(s.bus.seats).includes(amal.id));
});

test('gender lock: a man can never be placed in a women room (assign & swap)', () => {
  const s = seed();
  const ali = paxBy(s, 'ALY HASSAN'); // male, unassigned in Makkah
  const women = roomOf(s, paxBy(s, 'NADIA'), 'MAK');
  const r = E.assignBed(s, freeBedIn(s, women).id, ali.id);
  assert.equal(r.ok, false);
  assert.match(r.reason, /منع الاختلاط/);
  // Swap a man with a woman across shared rooms → rejected, nothing moved.
  const khaledBed = E.bedOfPax(s, paxBy(s, 'KHALED').id, 'MAK');
  const nadiaBed = E.bedOfPax(s, paxBy(s, 'NADIA').id, 'MAK');
  assert.equal(E.swapBeds(s, khaledBed.id, nadiaBed.id).ok, false);
  assert.equal(khaledBed.paxId, paxBy(s, 'KHALED').id);
});

test('visible rooms hide the other gender and unopened pool rooms', () => {
  const s = seed();
  const hanaa = paxBy(s, 'HANAA');
  const vis = E.visibleRoomsFor(s, 'MAK', hanaa);
  assert.ok(vis.length > 0);
  assert.ok(vis.every((r) => r.gender === 'F'));
  assert.ok(E.visibleRoomsFor(s, 'MAK', hanaa, { strictType: true }).every((r) => r.type === 'QUAD'));
});

test('open shared room locks gender, then accepts same gender only', () => {
  const s = seed();
  const res = E.openSharedRoom(s, 'MAK', 'QUAD', 'M');
  assert.ok(res.ok);
  const [b1, b2] = E.bedsOfRoom(s, res.room.id);
  assert.ok(E.assignBed(s, b1.id, paxBy(s, 'ALY HASSAN').id).ok);
  assert.equal(E.assignBed(s, b2.id, paxBy(s, 'HANAA').id).ok, false);
});

test('private room: whole room for one booking, gender check skipped, strangers rejected', () => {
  const s = seed();
  // Family BK-1019 (mixed gender) is already private in Makkah; the Madinah run re-closes a fresh room.
  const fam = s.bookings.find((b) => b.code === 'BK-1019');
  for (const bed of s.beds) if (s.pax.find((p) => p.id === bed.paxId && p.bookingId === fam.id) && s.rooms.find((r) => r.id === bed.roomId).city === 'MAD') bed.paxId = null;
  s.rooms.filter((r) => r.privateBookingId === fam.id && r.city === 'MAD').forEach((r) => { r.privateBookingId = null; r.gender = null; });
  const res = E.assignPrivateRoom(s, 'MAD', fam.id);
  assert.ok(res.ok);
  assert.equal(E.roomOccupancy(s, res.room.id), 3);
  const extra = E.bedsOfRoom(s, res.room.id).find((b) => !b.paxId);
  if (extra) assert.equal(E.assignBed(s, extra.id, paxBy(s, 'ALY HASSAN').id).ok, false);
});

test('children/infants never consume a bed but ride with their family', () => {
  const s = seed();
  const adam = paxBy(s, 'ADAM');
  const fam = roomOf(s, paxBy(s, 'AHMED MAHMOUD'), 'MAK');
  assert.equal(E.canPlace(s, fam, adam).ok, false);
  const kids = E.attachedNoBedPax(s, fam.id).map((p) => p.nameEn);
  assert.ok(kids.includes('ADAM YOUSSEF AHMED') && kids.includes('LAILA YOUSSEF AHMED'));
});

test('passport must be valid ≥ 6 months after return', () => {
  assert.equal(E.passportCheck('2026-12-01', '2026-10-25').ok, false);
  assert.equal(E.passportCheck('2027-06-01', '2026-10-25').ok, true);
  assert.equal(E.passportCheck('2026-10-01', '2026-10-25').level, 'expired');
});

test('rooming list includes no-bed pax and uses physical room numbers when set', () => {
  const s = seed();
  const rows = E.roomingList(s, 'MAK');
  assert.ok(rows.some((r) => r.roomNo === '1204' && /Infant/.test(r.roomType)));
  const beds = s.pax.filter((p) => p.type === 'ADULT' && E.bedOfPax(s, p.id, 'MAK')).length;
  assert.equal(rows.filter((r) => !/\(\+/.test(r.roomType)).length, beds);
});

test('bus auto-arrange: families contiguous, elderly first, no infant seats', () => {
  const s = seed();
  const seats = E.autoArrangeBus(s);
  const byPax = Object.fromEntries(Object.entries(seats).map(([k, v]) => [v, Number(k)]));
  assert.ok(!s.pax.filter((p) => p.type === 'INF').some((p) => byPax[p.id]));
  const fam = s.pax.filter((p) => p.bookingId === 'B8').map((p) => byPax[p.id]).sort((a, b) => a - b);
  assert.equal(fam[fam.length - 1] - fam[0], fam.length - 1);
  assert.ok(byPax[paxBy(s, 'ABDALLA').id] <= 4); // oldest family (70+) sits in row 1
});

test('trip P&L separates FX impact from operating profit', () => {
  const s = seed();
  const p = E.tripPnL(s);
  assert.ok(p.revenue > 0);
  assert.equal(E.round2(p.operating - p.fxLoss), p.net);
  s.fx.current = s.trip.fxRef; s.settlements.forEach((x) => { x.fxActual = s.trip.fxRef; });
  assert.equal(E.tripPnL(s).fxLoss, 0);
});

test('WhatsApp phone normalisation (EG / KSA)', () => {
  assert.equal(E.waPhone('01001112233'), '201001112233');
  assert.equal(E.waPhone('0551234567'), '966551234567');
});
