'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const Acc = require('../public/js/accounting.js');
const Hajj = require('../public/js/hajj.js');
const Model = require('../public/js/model.js');
const gov = require('../lib/governance.js');
const { buildSeed } = require('../public/js/data.js');

const demo = () => Model.load(buildSeed(Date.now()), 'x');
const owner = { name: 'o', role: 'OWNER', staffId: 'U3' };
const bal = (S, acc) => Acc.balances(S).get(acc).bal;

test('cost sheet: SAR stays & items at the season lock rate + group share + partner visa fee', () => {
  const S = demo(), k = S.hajj.packages.find((x) => x.code === 'HJ-1448-EC'), ss = Hajj.season(S, k.seasonId);
  const cs = Hajj.costSheet(S, k);
  const expect = (2600 + 900) * ss.fxLock + (7800 + 1100 + 800) * ss.fxLock + 34000 + 240000 / k.capacity + 4500;
  assert.ok(Math.abs(cs.rows.QUAD.cost - expect) < 1);
  assert.equal(cs.rows.QUAD.price, 330000);
  assert.ok(cs.breakEven > 0);
});

test('eligibility: last Hajj within N years, passport validity, age, mahram, documents', () => {
  const S = demo(), k = S.hajj.packages[0];
  const base = { packageId: k.id, gender: 'M', dob: '1970-01-01', passport: 'A1', passportExp: '2030-01-01', lastHajjYear: '' };
  assert.ok(!Hajj.eligibility(S, base).some((x) => x.level === 'err'));
  assert.ok(Hajj.eligibility(S, { ...base, lastHajjYear: 2024 }).some((x) => /سنوات/.test(x.text)));
  assert.ok(Hajj.eligibility(S, { ...base, passportExp: '2027-06-01' }).some((x) => /الجواز ينتهي/.test(x.text)));
  assert.ok(Hajj.eligibility(S, { ...base, dob: '2015-01-01' }).some((x) => /الحد الأدنى/.test(x.text)));
  assert.ok(Hajj.eligibility(S, { ...base, gender: 'F', dob: '1995-01-01' }).some((x) => /محرم/.test(x.text)));
});

test('registration: hady for tamattu, installments from the plan, deferred revenue on deposit, waitlist when quota is full', () => {
  const S = demo(), k = S.hajj.packages[0], ss = Hajj.season(S, k.seasonId);
  const p = Hajj.register(S, { packageId: k.id, nameAr: 'تجربة', phone: '01011110000', roomType: 'QUAD', nusuk: 'TAMATTU' }, owner);
  assert.equal(p.net, k.prices.QUAD + k.hadySar * ss.fxLock);
  assert.equal(p.installments.reduce((s, i) => s + i.amount, 0), p.net);
  const before = bal(S, '2108'), rev = bal(S, '4107');
  const v = Model.createVoucher(S, { type: 'RV', amount: p.installments[0].amount, cashboxId: S.cashboxes[0].id, party: { type: 'customer', id: p.customerId }, bookingId: p.id, tripId: k.id }, owner);
  Model.approve(S, v.id, owner);
  assert.equal(p.status, 'DEPOSIT');
  assert.ok(Math.abs(bal(S, '2108') - (before + p.net)) < 0.01, 'full price sits in deferred revenue');
  assert.equal(bal(S, '4107'), rev, 'no Hajj revenue before the season is closed');
  ss.quota = [{ id: 'Q', source: 'MINISTRY', name: 'x', visas: Hajj.quotaUsed(S, ss) }];
  const w = Hajj.register(S, { packageId: k.id, nameAr: 'انتظار', phone: '01011110001', roomType: 'QUAD', nusuk: 'IFRAD' }, owner);
  assert.equal(w.stage, 'WAITLIST');
});

test('cancellation fee by schedule, refund due, deferred revenue reduced to the fee', () => {
  const S = demo(), k = S.hajj.packages[0];
  const p = Hajj.register(S, { packageId: k.id, nameAr: 'إلغاء', phone: '01011112222', roomType: 'QUAD', nusuk: 'IFRAD' }, owner);
  const v = Model.createVoucher(S, { type: 'RV', amount: 100000, cashboxId: S.cashboxes[0].id, party: { type: 'customer', id: p.customerId }, bookingId: p.id, tripId: k.id }, owner);
  Model.approve(S, v.id, owner);
  const d2108 = bal(S, '2108'), net = p.net, cf = Hajj.cancelFee(S, p);
  const r = Hajj.cancel(S, p, 'o', 'ظروف');
  assert.equal(r.fee, cf.fee); assert.equal(r.refundDue, Math.max(0, 100000 - cf.fee));
  assert.ok(Math.abs(bal(S, '2108') - (d2108 - (net - cf.fee))) < 0.01);
  assert.equal(p.stage, 'CANCELLED');
});

test('season close: 2108 → 4107 and 1109 → 5108 per program; approver only', () => {
  const S = demo(), ss = S.hajj.seasons[0];
  const def = bal(S, '2108'), pre = bal(S, '1109');
  assert.ok(def > 0 && pre > 0);
  assert.throws(() => Hajj.closeSeason(S, ss.id, { name: 's', role: 'SALES' }), /صلاحية/);
  Hajj.closeSeason(S, ss.id, owner);
  assert.ok(Math.abs(bal(S, '2108')) < 0.01); assert.ok(Math.abs(bal(S, '4107') - def) < 0.01);
  assert.ok(Math.abs(bal(S, '1109')) < 0.01); assert.ok(Math.abs(bal(S, '5108') - pre) < 0.01);
  assert.throws(() => Hajj.register(S, { packageId: S.hajj.packages[0].id, nameAr: 'x', phone: '1', roomType: 'QUAD' }, owner), /مقفل/);
  const tb = Acc.trialBalance(S); assert.ok(Math.abs(tb.tot.dr - tb.tot.cr) < 0.01);
});

test('groups keep families together; rooms house families together and others by gender; tents split by gender', () => {
  const S = demo(), k = S.hajj.packages.find((x) => x.code === 'HJ-1448-5S');
  Hajj.autoGroups(S, k.id, 3);
  const ps = S.hajj.pilgrims.filter((p) => p.packageId === k.id && Hajj.ACTIVE(p));
  for (const fam of ['F1', 'F2']) { const g = new Set(ps.filter((p) => p.familyId === fam).map((p) => p.groupId)); assert.equal(g.size, 1); }
  Hajj.autoRooms(S, k.id, 'MAK1');
  const f1 = ps.filter((p) => p.familyId === 'F1');
  assert.equal(f1[0].rooms.MAK1, f1[1].rooms.MAK1);
  const byRoom = {}; for (const p of ps.filter((x) => !x.familyId)) (byRoom[p.rooms.MAK1] = byRoom[p.rooms.MAK1] || []).push(p);
  for (const list of Object.values(byRoom)) assert.equal(new Set(list.map((p) => p.gender)).size, 1, 'non-family rooms are single gender');
  Hajj.autoTents(S, k.id, 10);
  for (const p of ps) assert.ok(p.gender === 'F' ? /سيدات/.test(p.tent) : /رجال/.test(p.tent));
});

test('governance: season & program prices are management data; closed season frozen', () => {
  const S = demo(), old = JSON.parse(Model.serialize(S));
  let n = JSON.parse(Model.serialize(S)); n.hajj.seasons[0].fxLock = 1;
  assert.ok(gov.validate(old, n, { role: 'SALES', id: 1 }).errors.some((e) => /موسم الحج/.test(e)));
  n = JSON.parse(Model.serialize(S)); n.hajj.packages[0].prices.QUAD = 1;
  assert.ok(gov.validate(old, n, { role: 'HEAD', id: 1 }).errors.some((e) => /برنامج الحج/.test(e)));
  n = JSON.parse(Model.serialize(S)); n.hajj.pilgrims[0].paid += 5000;
  assert.ok(gov.validate(old, n, { role: 'SALES', id: 1 }).errors.some((e) => /المسدد/.test(e)));
});
