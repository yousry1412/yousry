'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Off = require('../public/js/offline.js');
const Model = require('../public/js/model.js');
const Acc = require('../public/js/accounting.js');
const { buildSeed } = require('../public/js/data.js');

test('merge3: edits on different records both survive; same-field conflict → server wins', () => {
  const base = { a: [{ id: 1, name: 'x', n: 1 }, { id: 2, name: 'y', n: 1 }], title: 't' };
  const local = { a: [{ id: 1, name: 'x-local', n: 1 }, { id: 2, name: 'y', n: 1 }, { id: 3, name: 'new-local', n: 0 }], title: 'L' };
  const remote = { a: [{ id: 1, name: 'x', n: 1 }, { id: 2, name: 'y-remote', n: 1 }, { id: 4, name: 'new-remote', n: 0 }], title: 'R' };
  const { doc, conflicts } = Off.merge3(base, local, remote);
  assert.deepEqual(doc.a.map((x) => x.name), ['x-local', 'y-remote', 'new-remote', 'new-local']);
  assert.equal(doc.title, 'R'); assert.deepEqual(conflicts, ['title']);
});
test('merge3: balances & counters add both sides; logs keep both; deletions respected', () => {
  const base = { counters: { C_BK: 10 }, agents: [{ id: 'A', balance: 1000 }], audit: [{ msg: 'old' }], x: [{ id: 1 }, { id: 2 }] };
  const local = { counters: { C_BK: 12 }, agents: [{ id: 'A', balance: 700 }], audit: [{ msg: 'L2' }, { msg: 'L1' }, { msg: 'old' }], x: [{ id: 1 }] };
  const remote = { counters: { C_BK: 11 }, agents: [{ id: 'A', balance: 900 }], audit: [{ msg: 'R1' }, { msg: 'old' }], x: [{ id: 1 }, { id: 2 }] };
  const { doc } = Off.merge3(base, local, remote);
  assert.equal(doc.counters.C_BK, 13); assert.equal(doc.agents[0].balance, 600);
  assert.deepEqual(doc.audit.map((a) => a.msg), ['L2', 'L1', 'R1', 'old']);
  assert.deepEqual(doc.x.map((a) => a.id), [1]);
});
test('offline bookings on a real company merge with server-side bookings and stay balanced', () => {
  const S0 = Model.load(buildSeed(Date.now()), 'x'), base = JSON.parse(Model.serialize(S0));
  const actor = { name: 'o', role: 'OWNER', staffId: 'U3' };
  const mk = (S, name) => Model.withTrip(S, S.trips[0].id, () => Model.createBooking(S, { channel: 'DIRECT', mode: 'FULL_PACKAGE', roomType: 'QUAD', services: {}, discountPct: 0, ttl: 24,
    pax: [{ nameAr: name, nameEn: 'N', gender: 'M', type: 'ADULT', phone: '010' + Math.random().toString().slice(2, 10) }] }, actor).booking.code);
  const L = Model.load(JSON.parse(JSON.stringify(base)), 'x'); const lc = mk(L, 'محلي');
  const R = Model.load(JSON.parse(JSON.stringify(base)), 'x'); const rc = mk(R, 'سيرفر');
  assert.equal(lc, rc, 'same code created on both sides');
  const { doc } = Off.merge3(base, JSON.parse(Model.serialize(L)), JSON.parse(Model.serialize(R)));
  const fixed = Off.fixDuplicateCodes(doc, base);
  assert.equal(fixed.length >= 1, true);
  const M = Model.load(doc, 'x'), codes = M.trips[0].bookings.map((b) => b.code);
  assert.equal(new Set(codes).size, codes.length, 'no duplicate booking codes');
  assert.ok(M.trips[0].bookings.some((b) => b.createdBy === 'o' && b.code !== rc));
  const tb = Acc.trialBalance(M); assert.ok(Math.abs(tb.tot.dr - tb.tot.cr) < 0.01);
});
