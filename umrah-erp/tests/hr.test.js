'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../public/js/engine.js');
const Acc = require('../public/js/accounting.js');
const Hr = require('../public/js/hr.js');
const Model = require('../public/js/model.js');
const { buildSeed } = require('../public/js/data.js');

const fresh = () => {
  const S = Model.emptyCompany('HR Co', 'EG');
  S.employees.push({ id: 'E1', code: 'EMP-001', name: 'سارة', salary: 13000, allowances: 0, hireDate: '2020-01-01', status: 'ACTIVE', staffIds: [] });
  S.hr.settings.offDays = [5];
  return S;
};
const at = (S, date, inT, outT) => S.hr.attendance.push({ id: Hr.uid('AT'), empId: 'E1', date, in: inT, out: outT, source: 'SELF' });

test('localNow uses the company timezone, not the device clock', () => {
  const t = Hr.localNow('SA', Date.parse('2026-03-01T21:30:00Z'));
  assert.deepEqual(t, { date: '2026-03-02', time: '00:30' });
});

test('punch: in, out, then refused', () => {
  const S = fresh();
  assert.equal(Hr.punch(S, 'E1', Date.now()).kind, 'IN');
  assert.equal(Hr.punch(S, 'E1', Date.now()).kind, 'OUT');
  assert.throws(() => Hr.punch(S, 'E1', Date.now()), /بالفعل/);
});

test('attendance month: late beyond grace, absence, leave, overtime', () => {
  const S = fresh(), p = '2026-02';
  at(S, '2026-02-01', '09:10', '17:00');   // Sunday, within grace
  at(S, '2026-02-02', '09:45', '19:00');   // late 45, overtime 120
  // 2026-02-03 absent
  S.hr.leaves.push({ id: 'L', empId: 'E1', type: 'UNPAID', from: '2026-02-04', to: '2026-02-04', days: 1, status: 'APPROVED' });
  const a = Hr.attendanceMonth(S, 'E1', p, '2026-02-05');
  assert.equal(a.present, 2); assert.equal(a.lateCount, 1); assert.equal(a.lateMinutes, 45);
  assert.equal(a.absent, 1); assert.equal(a.leaveDays, 1); assert.equal(a.unpaidDays, 1); assert.equal(a.overtimeMinutes, 120);
  const line = Hr.payrollLine(S, S.employees[0], p, '2026-02-05');
  const daily = 13000 / 26;
  assert.equal(line.absenceDed, Math.round(daily * 100) / 100);
  assert.equal(line.unpaidDed, Math.round(daily * 100) / 100);
  assert.equal(line.lateDed, Math.round(daily * 0.25 * 100) / 100); // 45 min → one 30-min block
});

test('leave balance and overlap protection', () => {
  const S = fresh();
  S.hr.settings.casual = 2;
  Hr.requestLeave(S, 'E1', { type: 'CASUAL', from: '2026-04-05', to: '2026-04-06' }, 'x');
  assert.throws(() => Hr.requestLeave(S, 'E1', { type: 'CASUAL', from: '2026-04-12', to: '2026-04-12' }, 'x'), /الرصيد/);
  assert.throws(() => Hr.requestLeave(S, 'E1', { type: 'ANNUAL', from: '2026-04-06', to: '2026-04-07' }, 'x'), /متداخل/);
});

test('payroll posts balanced journal: salaries / employee dues / advances recovered', () => {
  const S = fresh(), p = E.iso(new Date()).slice(0, 7);
  const cb = S.cashboxes[0];
  const v = Acc.createVoucher(S, { type: 'PV', amount: 2000, cashboxId: cb.id, party: { type: 'employee', id: 'E1' }, purpose: 'ADVANCE', memo: 'سلفة' }, { name: 'm', role: 'MANAGER' });
  Acc.approveVoucher(S, v.id, { name: 'm', role: 'MANAGER' });
  S.hr.adjustments.push({ id: 'A1', empId: 'E1', kind: 'REWARD', amount: 500, reason: 'r', date: p + '-01', status: 'APPROVED' });
  const run = Hr.preparePayroll(S, p, 'hr');
  const l = run.lines[0];
  assert.equal(l.advances, 2000); assert.equal(l.rewards, 500);
  assert.throws(() => Hr.postPayroll(S, run.id, { name: 'h', role: 'HR' }), /المحاسب/);
  Hr.postPayroll(S, run.id, { name: 'acc', role: 'ACCOUNTANT' });
  const je = S.journal.find((j) => j.id === run.jeId);
  const sum = (k) => je.lines.reduce((s, x) => s + (x[k] || 0), 0);
  assert.ok(Math.abs(sum('dr') - sum('cr')) < 0.01);
  assert.equal(Acc.partyStatement(S, 'employee', 'E1').rows.filter((r) => r.acc === '1105').reduce((s, r) => s + r.dr - r.cr, 0), 0);
  assert.throws(() => Hr.preparePayroll(S, p, 'hr'), /مُرحّل/);
  assert.equal(S.hr.adjustments[0].payrollId, run.id);
  // paying the posted dues clears 2103 for the employee
  const pay = Acc.createVoucher(S, { type: 'PV', amount: l.net, cashboxId: cb.id, party: { type: 'employee', id: 'E1' }, purpose: 'DUES', memo: 'صرف' }, { name: 'm', role: 'MANAGER' });
  Acc.approveVoucher(S, pay.id, { name: 'm', role: 'MANAGER' });
  assert.equal(Math.round(Acc.partyBalance(S, 'employee', 'E1')), 0);
});

test('demo company: KPIs come from real bookings and scores are rated', () => {
  const S = Model.load(buildSeed(Date.now()), 'x'), p = E.iso(new Date()).slice(0, 7);
  const mona = S.employees.find((e) => e.id === 'EM1');
  const sc = Hr.score(S, mona, p);
  assert.ok(sc.kpis.bookings > 0 && sc.kpis.sales > 0);
  assert.ok(sc.total >= 0 && sc.total <= 100 && ['A', 'B', 'C', 'D'].includes(sc.rating.k));
  assert.ok(Hr.flags(S, mona, p).length > 0, 'late-comer is flagged');
  assert.ok(Model.alerts(S, 'HR').some((a) => a.group === 'الموارد البشرية'));
});

test('governance: HR data is HR-admin only; self-approval refused; posted payroll frozen', () => {
  const gov = require('../lib/governance.js');
  const base = Model.load(buildSeed(Date.now()), 'x');
  const clone = () => JSON.parse(Model.serialize(base));
  const old = clone();
  let n = clone(); n.hr.tasks.push({ id: 'T', empId: 'EM1', title: 'x', due: '2026-01-01', status: 'OPEN' });
  assert.ok(gov.validate(old, n, { role: 'SALES', id: 1 }).errors.length);
  assert.equal(gov.validate(old, n, { role: 'HR', id: 1 }).errors.length, 0);
  n = clone(); n.employees.find((e) => e.id === 'EM5').userId = 7; const old2 = JSON.parse(JSON.stringify(n));
  const l = n.hr.leaves.find((x) => x.empId === 'EM5' && x.status === 'PENDING'); l.status = 'APPROVED';
  assert.ok(gov.validate(old2, n, { role: 'HR', id: 7 }).errors.some((e) => /بنفسك/.test(e)));
  const ev = gov.validate(old2, n, { role: 'HR', id: 8 });
  assert.equal(ev.errors.length, 0); assert.ok(ev.events.some((e) => e.userId === 7));
});
