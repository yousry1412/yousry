// End-to-end API test against a FRESH running server:  npm run test:e2e  (BASE defaults to http://localhost:3060)
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://localhost:3060';

function client() {
  let cookie = '';
  let company = null;
  const req = async (method, path, body, extra = {}) => {
    const headers = { 'X-Requested-With': 'umrah', ...(cookie ? { Cookie: cookie } : {}), ...(company ? { 'X-Company': String(company) } : {}), ...extra };
    let payload = body;
    if (body !== undefined && !(body instanceof Buffer)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(BASE + path, { method, headers, body: payload });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await r.text(); let data; try { data = JSON.parse(text); } catch (e) { data = text; }
    return { status: r.status, data };
  };
  return { req, setCompany: (c) => { company = c; } };
}
const owner = client(), sales = client(), acct = client(), agent = client(), sup = client(), anon = client();
let S, version, companyId;

test('owner setup + login + first-boot demo company', async () => {
  const st = await anon.req('GET', '/api/auth/status');
  assert.equal(st.data.needsSetup, true);
  const weak = await owner.req('POST', '/api/auth/setup', { username: 'yousry', display_name: 'أ. يسري', password: 'password' });
  assert.equal(weak.status, 400); // letters + digits required
  const r = await owner.req('POST', '/api/auth/setup', { username: 'yousry', display_name: 'أ. يسري', password: 'Strong123' });
  assert.equal(r.status, 200);
  const cs = await owner.req('GET', '/api/companies');
  companyId = cs.data[0].id; owner.setCompany(companyId);
  const s = await owner.req('GET', '/api/state');
  S = s.data.state; version = s.data.version;
  assert.equal(S.version, 4);
  assert.ok(S.trips.length >= 1 && S.journal.length > 10);
});

test('CSRF: state-changing call without the custom header is rejected', async () => {
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(r.status, 403);
});

test('security headers present', async () => {
  const r = await fetch(BASE + '/');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
  const db = await fetch(BASE + '/data/umrah.db'); const t = await db.text();
  assert.ok(!t.startsWith('SQLite'), 'database file must never be served');
});

test('owner creates staff, agent and supervisor accounts', async () => {
  const mk = (u, role, extra = {}) => owner.req('POST', '/api/users', { username: u, display_name: u, password: 'Pass1234', role, company_id: companyId, ...extra });
  assert.equal((await mk('mona', 'SALES')).status, 200);
  assert.equal((await mk('acc', 'ACCOUNTANT')).status, 200);
  assert.equal((await mk('noor', 'AGENT')).status, 400); // agent must be linked
  assert.equal((await mk('noor', 'AGENT', { agent_ref: 'A1' })).status, 200);
  assert.equal((await mk('sheikh', 'SUPERVISOR')).status, 200);
  for (const [c, u] of [[sales, 'mona'], [acct, 'acc'], [agent, 'noor'], [sup, 'sheikh']]) {
    const r = await c.req('POST', '/api/auth/login', { username: u, password: 'Pass1234' });
    assert.equal(r.status, 200, u);
  }
});

test('login brute-force lockout', async () => {
  const c = client();
  for (let i = 0; i < 5; i++) await c.req('POST', '/api/auth/login', { username: 'mona', password: 'nope' });
  const r = await c.req('POST', '/api/auth/login', { username: 'mona', password: 'Pass1234' });
  assert.equal(r.status, 429);
});

test('role isolation: portal users never get the company document or users list', async () => {
  assert.equal((await agent.req('GET', '/api/state')).status, 403);
  assert.equal((await agent.req('GET', '/api/users')).status, 403);
  assert.equal((await sales.req('GET', '/api/users')).status, 403);
  assert.equal((await sales.req('GET', '/api/backup')).status, 403);
  assert.equal((await sales.req('POST', '/api/state/wipe', { confirm: 'x' })).status, 403);
});

test('governance: sales cannot post vouchers or delete journal entries', async () => {
  const s = (await sales.req('GET', '/api/state')).data;
  const doc = s.state;
  const pending = doc.vouchers.find((v) => v.status === 'PENDING');
  pending.status = 'POSTED';
  let r = await sales.req('PUT', '/api/state', { baseVersion: s.version, state: doc });
  assert.equal(r.status, 403);
  const doc2 = (await sales.req('GET', '/api/state')).data;
  doc2.state.journal.pop();
  r = await sales.req('PUT', '/api/state', { baseVersion: doc2.version, state: doc2.state });
  assert.equal(r.status, 403);
  assert.match(r.data.error, /لا يمكن حذف القيد/);
});

test('optimistic concurrency: stale version → 409', async () => {
  const s = (await owner.req('GET', '/api/state')).data;
  const ok = await owner.req('PUT', '/api/state', { baseVersion: s.version, state: s.state });
  assert.equal(ok.status, 200);
  const stale = await owner.req('PUT', '/api/state', { baseVersion: s.version, state: s.state });
  assert.equal(stale.status, 409);
});

let fileId;
test('uploads: allowed types only, company-scoped access', async () => {
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const bad = await agent.req('POST', '/api/files', Buffer.from('<script>alert(1)</script>'), { 'Content-Type': 'text/html', 'X-File-Name': 'x.html' });
  assert.equal(bad.status, 400);
  const r = await agent.req('POST', '/api/files', png, { 'Content-Type': 'image/png', 'X-File-Name': encodeURIComponent('إيصال.png') });
  assert.equal(r.status, 200);
  fileId = r.data.id;
  const got = await fetch(BASE + '/api/files/' + fileId, { headers: {} });
  assert.equal(got.status, 401);
});

test('agent portal: view, book with passenger docs, upload payment receipt', async () => {
  const v = (await agent.req('GET', '/api/portal')).data;
  assert.equal(v.role, 'AGENT');
  assert.ok(v.agent && v.trips.length && Array.isArray(v.statement.rows));
  const trip = v.trips[0];
  const b = await agent.req('POST', '/api/portal/booking', { tripId: trip.id, draft: { mode: 'FULL_PACKAGE', roomType: 'QUAD',
    pax: [{ nameAr: 'مسافر تجريبي', nameEn: 'TEST PAX', gender: 'M', type: 'ADULT', passport: 'A1234567', passportExp: '2030-01-01', phone: '01000000000', photoFileId: fileId, passportFileId: fileId }] } });
  assert.equal(b.status, 200, JSON.stringify(b.data));
  const noFile = await agent.req('POST', '/api/portal/payment', { amount: 5000, fileIds: [] });
  assert.equal(noFile.status, 400);
  const p = await agent.req('POST', '/api/portal/payment', { amount: 5000, fileIds: [fileId], memo: 'تحويل' });
  assert.equal(p.status, 200);
  const n = (await acct.req('GET', '/api/notifications')).data;
  assert.ok(n.items.some((x) => x.text.includes(p.data.no)), 'accountant is notified');
});

test('accountant approves the receipt → posted, agent wallet credited', async () => {
  const s = (await acct.req('GET', '/api/state')).data;
  const Model = require('../public/js/model.js');
  const S2 = Model.load(s.state);
  const before = S2.agents.find((a) => a.id === 'A1').balance;
  const v = S2.vouchers.find((x) => x.status === 'PENDING' && x.party && x.party.id === 'A1');
  Model.approve(S2, v.id, { name: 'acc', role: 'ACCOUNTANT' });
  const r = await acct.req('PUT', '/api/state', { baseVersion: s.version, state: JSON.parse(Model.serialize(S2)) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const after = (await agent.req('GET', '/api/portal')).data;
  assert.equal(after.agent.balance, before + 5000);
  assert.ok(after.vouchers.some((x) => x.no === v.no && x.status === 'POSTED'));
});

test('supervisor portal sees only assigned trips', async () => {
  const v = (await sup.req('GET', '/api/portal')).data;
  assert.equal(v.role, 'SUPERVISOR');
  assert.equal(v.trips.length, 0);
});

test('chat with attachment, per-channel permissions', async () => {
  assert.equal((await agent.req('POST', '/api/chat/general', { text: 'x' })).status, 403);
  assert.equal((await agent.req('POST', '/api/chat/agents', { text: 'سلام', fileId })).status, 200);
  const m = (await sales.req('GET', '/api/chat/agents')).data;
  assert.ok(m.some((x) => x.text === 'سلام' && x.file_id === fileId));
});

test('chat: addressed vs private messages — private ones never reach a third person', async () => {
  const users = (await owner.req('GET', '/api/users')).data;
  const acc = users.find((u) => u.username === 'acc'), mona = users.find((u) => u.username === 'mona');
  const people = (await sales.req('GET', '/api/chat/people')).data;
  assert.ok(people.some((u) => u.id === acc.id) && !people.some((u) => u.id === mona.id));
  assert.equal((await sales.req('POST', '/api/chat/general', { text: 'سر بيننا', to: acc.id, private: true })).status, 200);
  assert.equal((await sales.req('POST', '/api/chat/general', { text: 'راجع الإيصال يا أستاذ', to: acc.id, private: false })).status, 200);
  const ownerView = (await owner.req('GET', '/api/chat/general')).data;
  assert.ok(!ownerView.some((m) => m.text === 'سر بيننا'), 'private message hidden from others');
  assert.ok(ownerView.some((m) => m.text === 'راجع الإيصال يا أستاذ' && m.to_name === 'acc'), 'addressed public message visible to all');
  assert.ok((await acct.req('GET', '/api/chat/general')).data.some((m) => m.text === 'سر بيننا'));
  assert.ok((await acct.req('GET', '/api/chat/dm')).data.some((m) => m.text === 'سر بيننا'), 'DM inbox collects private messages');
  assert.equal((await sales.req('POST', '/api/chat/general', { text: 'x', to: 99999 })).status, 400);
  assert.equal((await sales.req('POST', '/api/chat/dm', { text: 'no target' })).status, 400);
  // an agent cannot be addressed inside the staff-only channel
  const noor = users.find((u) => u.username === 'noor');
  assert.equal((await sales.req('POST', '/api/chat/general', { text: 'x', to: noor.id })).status, 400);
  assert.ok((await acct.req('GET', '/api/notifications')).data.items.some((n) => /رسالة خاصة/.test(n.text)));
});

test('HR: link employee, server-time punches, leave request, governance on HR data', async () => {
  const users = (await owner.req('GET', '/api/users')).data;
  const mona = users.find((u) => u.username === 'mona');
  assert.equal((await sales.req('GET', '/api/hr/me')).data.linked, false);
  let st = (await owner.req('GET', '/api/state')).data;
  st.state.employees.find((e) => e.id === 'EM1').userId = mona.id;
  assert.equal((await owner.req('PUT', '/api/state', { baseVersion: st.version, state: st.state })).status, 200);
  const me = (await sales.req('GET', '/api/hr/me')).data;
  assert.equal(me.linked, true); assert.equal(me.emp.id, 'EM1'); assert.ok(me.score.total >= 0);
  // today may already hold a seeded punch → normalize by punching until complete
  let r = await sales.req('POST', '/api/hr/punch', { geo: { lat: 30.0444, lng: 31.2357, acc: 20 } });
  if (r.status === 200 && r.data.kind === 'IN') r = await sales.req('POST', '/api/hr/punch', {});
  assert.equal((await sales.req('POST', '/api/hr/punch', {})).status, 400, 'third punch of the day refused');
  const lv = await sales.req('POST', '/api/hr/leave', { type: 'CASUAL', from: '2099-01-05', to: '2099-01-05', reason: 'ظرف' });
  assert.equal(lv.status, 200); assert.equal(lv.data.status, 'PENDING');
  assert.ok((await owner.req('GET', '/api/notifications')).data.items.some((n) => /طلب إجازة/.test(n.text)));
  // a sales employee cannot edit attendance or approve leaves through the document
  st = (await sales.req('GET', '/api/state')).data;
  st.state.hr.leaves.find((l) => l.id === lv.data.id).status = 'APPROVED';
  assert.equal((await sales.req('PUT', '/api/state', { baseVersion: st.version, state: st.state })).status, 403);
  st = (await sales.req('GET', '/api/state')).data;
  st.state.employees.find((e) => e.id === 'EM1').salary = 99999;
  assert.equal((await sales.req('PUT', '/api/state', { baseVersion: st.version, state: st.state })).status, 403);
  // HR admin (owner) edits a punch without a reason → refused; with the audit trail → accepted
  st = (await owner.req('GET', '/api/state')).data;
  const rec = st.state.hr.attendance.find((a) => a.empId === 'EM2');
  rec.in = '08:00';
  assert.equal((await owner.req('PUT', '/api/state', { baseVersion: st.version, state: st.state })).status, 403);
  rec.edits = [{ from: 'x', to: '08:00', by: 'owner', at: Date.now(), reason: 'عطل جهاز البصمة' }];
  assert.equal((await owner.req('PUT', '/api/state', { baseVersion: st.version, state: st.state })).status, 200);
  // payroll: HR prepares, a non-approver cannot post, posted runs are frozen
  st = (await owner.req('GET', '/api/state')).data;
  const period = new Date().toISOString().slice(0, 7);
  st.state.hr.payroll.push({ id: 'PRX', period, status: 'POSTED', lines: [], total: 0 });
  assert.equal((await sales.req('PUT', '/api/state', { baseVersion: st.version, state: st.state })).status, 403);
});

test('WhatsApp Business: config is admin-only, token never leaves the server, sending without config is logged as failed', async () => {
  assert.equal((await sales.req('GET', '/api/wa/status')).data.enabled, false);
  assert.equal((await sales.req('PUT', '/api/wa/config', { token: 'x', phoneId: '1' })).status, 403);
  const r = await sales.req('POST', '/api/wa/send', { to: '01000000000', text: 'hi', ref: 'T' });
  assert.equal(r.status, 400);
  const c = await owner.req('PUT', '/api/wa/config', { token: 'EAAG-secret-token', phoneId: '123', mode: 'TEXT', dial: '20' });
  assert.equal(c.data.token, '••••••••'); assert.equal(c.data.enabled, true);
  assert.ok(!JSON.stringify((await owner.req('GET', '/api/wa/config')).data).includes('secret'));
  const st = (await owner.req('GET', '/api/state')).data.state;
  assert.ok(!JSON.stringify(st).includes('EAAG-secret-token'), 'token is not in the company document');
  assert.ok((await owner.req('GET', '/api/wa/log')).data.some((l) => l.status === 'failed'));
  assert.equal((await owner.req('PUT', '/api/wa/config', { token: '', phoneId: '' })).data.enabled, false);
});

test('versions, snapshot, wipe (with backup) and full backup', async () => {
  assert.equal((await owner.req('POST', '/api/versions/snapshot', { label: 'قبل الاختبار' })).status, 200);
  const vs = (await owner.req('GET', '/api/versions')).data;
  assert.ok(vs.some((x) => x.label === 'قبل الاختبار'));
  const wrong = await owner.req('POST', '/api/state/wipe', { confirm: 'خطأ' });
  assert.equal(wrong.status, 400);
  const name = (await owner.req('GET', '/api/state')).data.state.company.name;
  assert.equal((await owner.req('POST', '/api/state/wipe', { confirm: name })).status, 200);
  const empty = (await owner.req('GET', '/api/state')).data.state;
  assert.equal(empty.trips.length, 0);
  assert.equal(empty.journal.length, 0);
  const vs2 = (await owner.req('GET', '/api/versions')).data;
  const pre = vs2.find((x) => /قبل مسح البيانات/.test(x.label || ''));
  assert.ok(pre, 'a labelled snapshot is kept before wiping');
  assert.equal((await owner.req('POST', `/api/versions/${pre.id}/restore`, {})).status, 200);
  assert.ok((await owner.req('GET', '/api/state')).data.state.trips.length >= 1);
  const bk = await owner.req('GET', '/api/backup');
  assert.equal(bk.data.app, 'umrah-erp');
  assert.ok(bk.data.tables.users.length >= 5 && Object.keys(bk.data.blobs).length >= 1);
});

test('multi-company: owner creates an empty company; staff are locked to theirs', async () => {
  const c = await owner.req('POST', '/api/companies', { name: 'فرع جدة للسياحة', country: 'SA' });
  assert.equal(c.status, 200);
  owner.setCompany(c.data.id);
  const s = (await owner.req('GET', '/api/state')).data.state;
  assert.equal(s.company.country, 'SA'); assert.equal(s.company.vatRate, 15); assert.equal(s.trips.length, 0);
  sales.setCompany(c.data.id);
  assert.equal((await sales.req('GET', '/api/state')).status, 403);
  sales.setCompany(null);
});

test('marketing link: public offers + "طلب العمل" → approval with password → held agent bookings → profile edit locks login', async () => {
  owner.setCompany(companyId);
  const link = (await owner.req('GET', '/api/marketing-link')).data;
  const pub = client();
  const off = await pub.req('GET', '/api/public/offers/' + link.token);
  assert.equal(off.status, 200); assert.ok(off.data.umrah.length >= 1);
  assert.equal(off.data.umrah[0].prices.some((p) => p.price > 0), true);
  assert.equal(JSON.stringify(off.data).includes('cost'), false, 'no cost data leaks to the public page');
  assert.equal((await pub.req('GET', '/api/public/offers/not-a-real-token')).status, 404);
  const ap = await pub.req('POST', '/api/public/apply/' + link.token, { name: 'مندوب الرابط', phone: '01055512345', email: 'link.agent@x.com', city: 'قنا' });
  assert.equal(ap.status, 200);
  const newAgent = client();
  const blocked = await newAgent.req('POST', '/api/auth/login', { username: 'link.agent@x.com', password: 'Anything12' });
  assert.equal(blocked.status, 401, 'no usable password before approval');
  const pend = (await owner.req('GET', '/api/approvals')).data.find((u) => u.email === 'link.agent@x.com');
  assert.equal(pend.approval, 'PENDING');
  assert.equal((await sales.req('GET', '/api/approvals')).status, 403);
  const ok = await owner.req('POST', `/api/approvals/${pend.id}/approve`, { password: 'LinkAgent1', tier: 'BROKER' });
  assert.equal(ok.status, 200); assert.ok(ok.data.agent_ref);
  assert.equal((await newAgent.req('POST', '/api/auth/login', { username: 'link.agent@x.com', password: 'LinkAgent1' })).status, 200);
  const pv = (await newAgent.req('GET', '/api/portal')).data;
  const bk = await newAgent.req('POST', '/api/portal/booking', { tripId: pv.trips[0].id, draft: { mode: 'FULL_PACKAGE', roomType: 'QUAD', pax: [{ nameAr: 'عميل', nameEn: 'CLIENT', gender: 'M', type: 'ADULT' }] } });
  assert.equal(bk.status, 200);
  const st = (await owner.req('GET', '/api/state')).data;
  let held = null; for (const d of st.state.trips) for (const b of d.bookings) if (b.agentRequest && b.agentRequest.state === 'PENDING') held = b;
  assert.ok(held && ['SOFT_HOLD', 'PENDING_APPROVAL', 'PENDING_PRICING'].includes(held.status));
  const pe = await newAgent.req('POST', '/api/portal/profile', { phone: '01055599999' });
  assert.equal(pe.status, 200);
  const again = await newAgent.req('POST', '/api/auth/login', { username: 'link.agent@x.com', password: 'LinkAgent1' });
  assert.equal(again.status, 403);
  assert.equal((await owner.req('POST', `/api/approvals/${pend.id}/approve`, {})).status, 200);
  assert.equal((await newAgent.req('POST', '/api/auth/login', { username: 'link.agent@x.com', password: 'LinkAgent1' })).status, 200);
});
