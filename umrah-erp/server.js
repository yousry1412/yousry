/* =====================================================================
 * أفواج — online server
 *   /api/auth/*        setup (first owner) · login · logout · status
 *   /api/companies     multi-company (owner) · rename via state
 *   /api/state         one versioned document per company + governance checks
 *   /api/versions      history, labelled snapshots, restore
 *   /api/files         uploads (photos, passports, receipts, trip files)
 *   /api/chat          internal chat with attachments + direct/private messages
 *   /api/hr/*          employee self-service: server-time attendance, leave requests, tasks
 *   /api/notifications notification centre
 *   /api/portal/*      restricted views for agents, supervisors, housing reps
 *   /api/backup        full backup download (flash drive) · /api/restore
 *   /api/fx            global SAR→EGP market rate (cached)
 * ===================================================================== */
const express = require('express');
const path = require('path');
const store = require('./lib/store');
const gov = require('./lib/governance');
const wa = require('./lib/whatsapp');
const { parseCookies, setCookie, clearCookie } = require('./lib/cookies');
const Engine = require('./public/js/engine.js');
const Acc = require('./public/js/accounting.js');
const Model = require('./public/js/model.js');
const Hr = require('./public/js/hr.js');
const Dom = require('./public/js/dom.js');
const Hajj = require('./public/js/hajj.js');
const { buildSeed } = require('./public/js/data.js');

const app = express();
const PORT = process.env.PORT || 3002;
const COOKIE = 'umrah_sid';
const BUILD = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || (() => { try { return require('child_process').execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return 'dev-' + Date.now().toString(36); } })();

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
  res.set('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "connect-src 'self'",
    "frame-src 'self' blob:", "frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; '));
  next();
});
// CSRF: every state-changing API call must carry a custom header (cross-site forms cannot set it).
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'umrah') return res.status(403).json({ error: 'طلب مرفوض' });
  next();
});

try { store.resetOwnerFromEnv(); } catch (e) { console.error('[afwaj] owner reset failed:', e.message); }

// First boot: create a demo company so the owner can explore immediately.
if (!store.listCompanies().length) {
  const S = Model.load(buildSeed(Date.now()), 'شركة مدار للسياحة (بيانات تجريبية)');
  store.createCompany(S.company.name, Model.serialize(S), 'system');
}

// ------------------------------------------------------------------ auth
const attempts = new Map();
const locked = (k, max = 5) => { const e = attempts.get(k); if (!e) return false; if (Date.now() - e.first > 15 * 60000) { attempts.delete(k); return false; } return e.count >= max; };
const fail = (k) => { const e = attempts.get(k); if (!e || Date.now() - e.first > 15 * 60000) attempts.set(k, { count: 1, first: Date.now() }); else e.count++; };
const startSession = (req, res, u) => setCookie(res, COOKIE, store.createSession(u.id), { maxAgeSeconds: store.SESSION_DAYS * 86400, secure: req.secure });

const auth = express.Router();
auth.use(express.json({ limit: '100kb' }));
auth.get('/status', (req, res) => {
  const u = store.userFromSession(parseCookies(req)[COOKIE]);
  res.json({ needsSetup: !store.isSetup(), user: store.publicUser(u) });
});
auth.post('/setup', (req, res) => {
  try {
    const u = store.setupOwner(req.body || {});
    startSession(req, res, u); store.audit(u.id, null, 'إعداد حساب المالك');
    res.json({ user: u });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
auth.post('/login', (req, res) => {
  const key = req.ip + '|' + String((req.body && req.body.username) || '').toLowerCase();
  if (locked(key) || locked(req.ip + '|*', 30)) return res.status(429).json({ error: 'محاولات كثيرة — حاول بعد 15 دقيقة' });
  const u = store.authenticate(req.body && req.body.username, req.body && req.body.password);
  if (u && u.blocked) return res.status(403).json({ error: u.blocked });
  if (!u) { fail(key); fail(req.ip + '|*'); return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر غير صحيحة' }); }
  attempts.delete(key);
  startSession(req, res, u); store.audit(u.id, u.company_id, 'تسجيل دخول');
  res.json({ user: store.publicUser(u) });
});
auth.post('/logout', (req, res) => { store.destroySession(parseCookies(req)[COOKIE]); clearCookie(res, COOKIE); res.json({ ok: true }); });
app.use('/api/auth', auth);
app.get('/api/version', (req, res) => res.json({ build: BUILD })); // public: lets open browsers detect a new deploy

// ============================================================== PUBLIC (marketing link, no login)
// Each company has an unguessable link token: /o/<token> shows everything open for sale and the "طلب العمل" (join as agent) form.
function linkToken(companyId, rotate) {
  let t = store.kvGet('pubtoken:' + companyId);
  if (!t || rotate) {
    if (t) store.kvSet('pub:' + t, null);
    t = require('crypto').randomBytes(9).toString('base64url');
    store.kvSet('pubtoken:' + companyId, t); store.kvSet('pub:' + t, companyId);
  }
  return t;
}
const companyOfToken = (t) => (/^[\w-]{8,20}$/.test(String(t)) ? store.kvGet('pub:' + t) : null);
function publicOffers(S) {
  const today = Engine.iso(new Date()), doms = S.company.domains || ['UMRAH'];
  const umrah = !doms.includes('UMRAH') ? [] : S.trips.filter((d) => d.trip.status !== 'CLOSED' && d.trip.departDate >= today).map((d) => Model.withTrip(S, d.id, () => {
    const pl = Engine.priceList(S), free = Math.min(...['MAK', 'MAD'].map((c) => Engine.breakage(S, c).reduce((x, y) => x + y.free, 0)));
    const hotels = ['MAK', 'MAD'].map((c) => { const st = d.trip.stays[c] || {}, al = S.allotments.find((x) => x.id === st.allotmentId); return { city: c === 'MAK' ? 'مكة' : 'المدينة', hotel: al ? al.hotel : '', nights: st.nights || 0 }; });
    return { code: d.trip.code, name: d.trip.name, departDate: d.trip.departDate, returnDate: d.trip.returnDate, hotels, free: Math.max(0, free),
      prices: Object.keys(Engine.ROOM_TYPES).filter((t) => pl[t] > 0).map((t) => ({ room: Engine.ROOM_TYPES[t].ar, price: pl[t] })), child: pl.CHD, infant: pl.INF };
  }));
  const hajj = !doms.includes('HAJJ') ? [] : S.hajj.packages.filter((k) => { const ss = Hajj.season(S, k.seasonId); return ss && !ss.closed; }).map((k) => {
    const ss = Hajj.season(S, k.seasonId), used = S.hajj.pilgrims.filter((p) => p.packageId === k.id && Hajj.ACTIVE(p)).length;
    return { code: k.code, name: k.name, level: Hajj.LEVELS[k.level] || k.level, season: ss.name || '', departDate: k.departDate, returnDate: k.returnDate, free: Math.max(0, (k.capacity || 0) - used),
      hotels: (k.stays || []).map((x) => ({ city: Hajj.CITIES[x.city] || x.city, hotel: x.hotel, nights: x.nights })),
      prices: Object.entries(k.prices || {}).filter(([, v]) => v > 0).map(([r, v]) => ({ room: (Hajj.ROOMS[r] || {}).ar || r, price: v })), regOpen: !!(ss.reg && ss.reg.open !== false) };
  });
  const domestic = !doms.includes('DOMESTIC') ? [] : S.dom.programs.filter((p) => p.status !== 'CLOSED' && p.startDate >= today).map((p) => {
    const left = Dom.capacityLeft(S, p);
    const prices = p.kind === 'DAYTRIP' ? [{ room: 'مقعد بالغ', price: p.seatPrice }, ...(p.childSeatPrice ? [{ room: 'مقعد طفل', price: p.childSeatPrice }] : [])]
      : (p.hotelOptions || []).flatMap((o) => Object.entries(o.prices || {}).filter(([, v]) => v > 0).map(([r, v]) => ({ room: `${(o.hotelId && (Dom.hotel(S, o.hotelId) || {}).name) || o.hotelName || ''} · ${(Dom.ROOMS[r] || {}).ar || r} (${Dom.BOARDS[o.board] || ''})`, price: v })));
    return { code: p.code, name: p.name, kind: (Dom.KINDS[p.kind] || {}).ar, icon: (Dom.KINDS[p.kind] || {}).icon, city: p.city, startDate: p.startDate, endDate: p.endDate, free: left,
      transport: Dom.TRANSPORT[(p.transport || {}).type] || '', includes: String(p.includes || '').split('\n').filter(Boolean).slice(0, 8), prices };
  });
  return { company: { name: S.company.name, phone: S.company.phone || '', address: S.company.address || '', domains: doms, logo: S.company.logoFileId ? true : false }, umrah, hajj, domestic };
}
const pub = express.Router();
const applyHits = new Map();
pub.get('/offers/:token', (req, res) => {
  const cid = companyOfToken(req.params.token);
  if (!cid || !store.getCompany(cid)) return res.status(404).json({ error: 'الرابط غير صحيح أو تم تغييره' });
  res.set('Cache-Control', 'no-store');
  res.json(publicOffers(loadDoc(cid).S));
});
pub.post('/apply/:token', express.json({ limit: '20kb' }), (req, res) => {
  const cid = companyOfToken(req.params.token);
  if (!cid || !store.getCompany(cid)) return res.status(404).json({ error: 'الرابط غير صحيح أو تم تغييره' });
  const k = req.ip, e = applyHits.get(k);
  if (e && Date.now() - e.first < 3600000 && e.n >= 5) return res.status(429).json({ error: 'طلبات كثيرة — حاول بعد ساعة' });
  if (!e || Date.now() - e.first >= 3600000) applyHits.set(k, { first: Date.now(), n: 1 }); else e.n++;
  try {
    if (String((req.body || {}).website || '')) throw new Error('طلب مرفوض'); // honeypot field (bots fill hidden inputs)
    const u = store.signup(cid, req.body || {});
    store.audit(null, cid, `طلب انضمام مندوب جديد: ${u.display_name} (${u.phone})`);
    store.notify(cid, { roles: gov.ACCOUNT_APPROVERS, text: `🆕 طلب عمل جديد من ${u.display_name} — ${u.phone}${u.profile.city ? ' · ' + u.profile.city : ''} — راجع وحدد له كلمة السر`, link: 'approvals' });
    res.json({ ok: true, name: u.display_name });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.use('/api/public', pub);
const OFFERS = require('fs').readFileSync(path.join(__dirname, 'public', 'offers.html'), 'utf8').replace('/js/offers.js', `/js/offers.js?v=${BUILD}`).replace('/css/app.css', `/css/app.css?v=${BUILD}`);
app.get('/o/:token', (req, res) => { res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); res.type('html').send(OFFERS); });

// --------------------------------------------------------- guards
function requireAuth(req, res, next) {
  const u = store.userFromSession(parseCookies(req)[COOKIE]);
  if (!u) return res.status(401).json({ error: 'سجّل الدخول أولاً' });
  req.user = u;
  const wanted = Number(req.get('X-Company') || req.query.c) || null;
  if (u.role === 'OWNER') req.companyId = wanted || (store.listCompanies()[0] || {}).id;
  else {
    if (wanted && wanted !== u.company_id) return res.status(403).json({ error: 'لا تملك صلاحية على هذه الشركة' });
    req.companyId = u.company_id;
  }
  if (!store.getCompany(req.companyId)) return res.status(404).json({ error: 'الشركة غير موجودة' });
  next();
}
const allow = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'ليست لديك صلاحية لهذه العملية' }));
const staffOnly = allow(...store.STAFF_ROLES);
const actorOf = (u) => ({ name: u.display_name, role: u.role, staffId: 'SU' + u.id, agentId: u.agent_ref || null, userId: u.id });

function loadDoc(companyId) {
  const st = store.getState(companyId);
  return { version: st.version, S: Model.load(JSON.parse(st.json), store.getCompany(companyId).name) };
}
function emitEvents(companyId, events) {
  for (const e of events) {
    if (e.roles) store.notify(companyId, { roles: e.roles, text: e.text, link: e.link });
    else if (e.userId) store.notify(companyId, { userId: e.userId, text: e.text, link: e.link });
    else if (e.userName) {
      const u = store.listUsers(companyId).find((x) => x.display_name === e.userName);
      if (u) store.notify(companyId, { userId: u.id, text: e.text, link: e.link });
    }
  }
}
/** Server-side mutation with optimistic retry (portal actions, sweeper). */
function mutate(companyId, by, fn) {
  for (let i = 0; i < 3; i++) {
    const { version, S } = loadDoc(companyId);
    const result = fn(S);
    const r = store.saveState(companyId, version, Model.serialize(S), by);
    if (r.ok) return result;
  }
  throw new Error('النظام مشغول — أعد المحاولة');
}

const api = express.Router();
api.use(requireAuth);

// ------------------------------------------------------------ companies
/** Company list with its line(s) of business and size — read from each company's document. */
function companySummary(c) {
  try {
    const d = JSON.parse(store.getState(c.id).json), co = d.company || {};
    return { ...c, domains: Array.isArray(co.domains) && co.domains.length ? co.domains : ['UMRAH'], country: co.country || 'EG', branches: (d.branches || []).length,
      trips: (d.trips || []).length, programs: ((d.dom || {}).programs || []).length, hajj: ((d.hajj || {}).packages || []).length, users: store.listUsers(c.id).filter((u) => u.company_id === c.id).length };
  } catch (e) { return { ...c, domains: ['UMRAH'] }; }
}
api.get('/companies', (req, res) => {
  const all = store.listCompanies();
  res.json((req.user.role === 'OWNER' ? all : all.filter((c) => c.id === req.user.company_id)).map(companySummary));
});
api.post('/companies', express.json(), allow('OWNER'), (req, res) => {
  try {
    const name = String((req.body && req.body.name) || '').trim();
    if (name.length < 2) throw new Error('اكتب اسم الشركة');
    const S = req.body.demo ? Model.load(buildSeed(Date.now()), name) : Model.emptyCompany(name, req.body.country || 'EG');
    S.company.name = name;
    const doms = (Array.isArray(req.body.domains) ? req.body.domains : []).filter((d) => Model.DOMAINS[d]);
    if (doms.length) { S.company.domains = doms; S.branches.forEach((b) => { b.domains = doms.slice(); }); }
    const c = store.createCompany(name, Model.serialize(S), req.user.display_name);
    store.audit(req.user.id, c.id, `إنشاء شركة ${name}`);
    res.json(c);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// --------------------------------------------------------------- users
const canManageUsers = allow('OWNER', 'MANAGER');
api.get('/users', canManageUsers, (req, res) => res.json(store.listUsers(req.user.role === 'OWNER' ? null : req.companyId)));
function guardUserEdit(req, body, existing) {
  if (req.user.role === 'OWNER') return;
  if (['OWNER', 'MANAGER'].includes(body.role) || (existing && ['OWNER', 'MANAGER'].includes(existing.role))) throw new Error('إدارة حسابات المالك والمديرين من صلاحية المالك فقط');
  if (existing && existing.company_id !== req.companyId) throw new Error('المستخدم تابع لشركة أخرى');
  body.company_id = req.companyId;
}
api.post('/users', express.json(), canManageUsers, (req, res) => {
  try { const b = { company_id: req.companyId, ...req.body }; guardUserEdit(req, b); const u = store.createUser(b); store.audit(req.user.id, req.companyId, `إضافة مستخدم ${u.username} (${u.role})`); res.json(u); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
api.patch('/users/:id', express.json(), canManageUsers, (req, res) => {
  try {
    const b = { ...req.body }; guardUserEdit(req, b, store.getUser(Number(req.params.id)));
    const u = store.updateUser(Number(req.params.id), b); store.audit(req.user.id, req.companyId, `تعديل مستخدم ${u.username}`); res.json(u);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
api.get('/users/directory', staffOnly, (req, res) => res.json(store.listUsers(req.companyId).filter((u) => u.is_active && (u.company_id === req.companyId || u.role === 'OWNER'))
  .map(({ id, display_name, role, agent_ref }) => ({ id, display_name, role, agent_ref }))));

// ------------------------------------------------ marketing link & approvals (owner / operations manager)
const canApproveAccounts = allow(...gov.ACCOUNT_APPROVERS);
api.get('/marketing-link', staffOnly, (req, res) => res.json({ token: linkToken(req.companyId), path: 'o/' + linkToken(req.companyId) }));
api.post('/marketing-link/rotate', allow('OWNER'), (req, res) => { const t = linkToken(req.companyId, true); store.audit(req.user.id, req.companyId, 'تغيير رابط التسويق'); res.json({ token: t, path: 'o/' + t }); });
api.get('/approvals', canApproveAccounts, (req, res) => res.json(store.listPending(req.companyId)));
api.post('/approvals/:id/approve', express.json(), canApproveAccounts, (req, res) => {
  try {
    const id = Number(req.params.id), u = store.getUser(id), b = req.body || {};
    if (!u || u.company_id !== req.companyId) throw new Error('الطلب غير موجود');
    if (u.approval === 'PENDING') {
      let agentRef = b.agentId || null;
      mutate(req.companyId, req.user.display_name, (S) => {
        if (agentRef) { if (!S.agents.some((a) => a.id === agentRef)) throw new Error('سجل المندوب غير موجود'); return; }
        const tier = b.tier === 'B2B' ? 'B2B' : 'BROKER', own = req.user.role === 'OWNER';
        const a = { id: 'A' + Date.now().toString(36), code: Model.nextCode(S, 'AGT', 'AGT'), name: b.agentName || u.display_name, tier, phone: u.phone, email: u.email, city: u.profile.city || '',
          currency: 'EGP', balance: 0, creditLimit: 0, overdueDays: 0, blocked: false, pin: '', netDiscountPct: tier === 'B2B' ? Number(b.netDiscountPct) || 0 : 0,
          commission: tier === 'BROKER' ? { type: 'FIXED', basis: 'PAX', min: own ? Number(b.commissionMin) || 0 : 0, pct: 0 } : null, source: 'طلب عمل من رابط التسويق', userId: id };
        S.agents.push(a); agentRef = a.id;
        S.audit.unshift({ at: Date.now(), by: req.user.display_name, msg: `إضافة مندوب ${a.code} ${a.name} من طلب العمل` });
      });
      const out = store.approveSignup(id, { password: b.password, agent_ref: agentRef, username: b.username, display_name: b.display_name });
      store.audit(req.user.id, req.companyId, `قبول طلب عمل ${out.display_name} (${out.username})`);
      return res.json(out);
    }
    if (u.approval === 'CHANGED') {
      const r = store.approveChange(id);
      if (r.user.agent_ref) mutate(req.companyId, req.user.display_name, (S) => {
        const a = S.agents.find((x) => x.id === r.user.agent_ref); if (!a) return;
        if (r.changes.display_name) a.name = r.changes.display_name;
        if (r.changes.phone) a.phone = r.changes.phone;
        if (r.changes.email) a.email = r.changes.email;
        if (r.changes.profile && r.changes.profile.city) a.city = r.changes.profile.city;
        S.audit.unshift({ at: Date.now(), by: req.user.display_name, msg: `اعتماد تعديل بيانات المندوب ${a.code}` });
      });
      store.notify(req.companyId, { userId: id, text: '✅ تم اعتماد تعديل بياناتك — تقدر تدخل الآن', link: 'portal' });
      store.audit(req.user.id, req.companyId, `اعتماد تعديل بيانات ${r.user.username}`);
      return res.json(r.user);
    }
    throw new Error('لا يوجد شيء بانتظار الموافقة');
  } catch (e) { res.status(400).json({ error: e.message }); }
});
api.post('/approvals/:id/reject', express.json(), canApproveAccounts, (req, res) => {
  try {
    const id = Number(req.params.id), u = store.getUser(id);
    if (!u || u.company_id !== req.companyId) throw new Error('الطلب غير موجود');
    const out = store.rejectUser(id, (req.body || {}).reason);
    store.audit(req.user.id, req.companyId, `${u.approval === 'CHANGED' ? 'رفض تعديل بيانات' : 'رفض طلب عمل'} ${u.display_name}`);
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// --------------------------------------------------------------- state
api.get('/state', staffOnly, (req, res) => {
  const since = Number(req.query.since || -1);
  const st = store.getState(req.companyId);
  if (since === st.version) return res.json({ changed: false });
  let json = st.json;
  const doc = JSON.parse(json);
  if (doc.version !== 4) { const S = Model.load(doc, store.getCompany(req.companyId).name); json = Model.serialize(S); }
  res.type('json').send(`{"changed":true,"version":${st.version},"updatedBy":${JSON.stringify(st.updatedBy || '')},"state":${json}}`);
});
api.put('/state', express.json({ limit: '40mb' }), staffOnly, (req, res) => {
  const { baseVersion, state } = req.body || {};
  const cur = store.getState(req.companyId);
  if (Number(baseVersion) !== cur.version) return res.status(409).json({ error: 'تم تحديث البيانات من مستخدم آخر' });
  // compare against the stored document normalised exactly like clients load it (new defaults never count as edits)
  const raw = JSON.parse(cur.json);
  const oldDoc = raw.version === 4 ? JSON.parse(Model.serialize(Model.load(raw, store.getCompany(req.companyId).name))) : null;
  const { errors, events } = gov.validate(oldDoc, state, req.user);
  if (errors.length) return res.status(403).json({ error: errors.join(' · ') });
  const r = store.saveState(req.companyId, Number(baseVersion), JSON.stringify(state), req.user.display_name);
  if (!r.ok) return res.status(409).json({ error: 'تم تحديث البيانات من مستخدم آخر' });
  if (state.company && state.company.name && state.company.name !== store.getCompany(req.companyId).name) store.renameCompany(req.companyId, state.company.name);
  emitEvents(req.companyId, events);
  res.json({ version: r.version });
});
api.post('/state/demo', allow('OWNER'), (req, res) => {
  store.snapshot(req.companyId, 'قبل تحميل البيانات التجريبية', req.user.display_name);
  const S = Model.load(buildSeed(Date.now()), store.getCompany(req.companyId).name);
  const r = store.saveState(req.companyId, store.getVersion(req.companyId), Model.serialize(S), req.user.display_name);
  store.audit(req.user.id, req.companyId, 'تحميل البيانات التجريبية');
  res.json({ version: r.version });
});
api.post('/state/wipe', express.json(), allow('OWNER'), (req, res) => {
  const { S: old } = loadDoc(req.companyId);
  if (String((req.body && req.body.confirm) || '').trim() !== old.company.name) return res.status(400).json({ error: 'اكتب اسم الشركة بالضبط لتأكيد المسح' });
  store.snapshot(req.companyId, `نسخة قبل مسح البيانات (${new Date().toLocaleDateString('en-GB')})`, req.user.display_name);
  const S = Model.emptyCompany(old.company.name, old.company.country);
  S.company = old.company; S.branches = old.branches; S.settings = old.settings; S.fx = old.fx;
  const r = store.saveState(req.companyId, store.getVersion(req.companyId), Model.serialize(S), req.user.display_name);
  store.audit(req.user.id, req.companyId, 'مسح بيانات الشركة (مع حفظ نسخة)');
  res.json({ version: r.version });
});

// ------------------------------------------------------------ versions
api.get('/versions', allow('OWNER', 'MANAGER'), (req, res) => res.json(store.listVersions(req.companyId)));
api.post('/versions/snapshot', express.json(), allow('OWNER', 'MANAGER', 'ACCOUNTANT'), (req, res) => {
  store.snapshot(req.companyId, String((req.body && req.body.label) || 'نسخة يدوية').slice(0, 80), req.user.display_name);
  res.json({ ok: true });
});
api.post('/versions/:id/restore', allow('OWNER'), (req, res) => {
  const json = store.getVersionJson(req.companyId, Number(req.params.id));
  if (!json) return res.status(404).json({ error: 'النسخة غير موجودة' });
  store.snapshot(req.companyId, 'نسخة قبل الاسترجاع', req.user.display_name);
  const S = Model.load(JSON.parse(json), store.getCompany(req.companyId).name);
  const r = store.saveState(req.companyId, store.getVersion(req.companyId), Model.serialize(S), req.user.display_name);
  store.audit(req.user.id, req.companyId, `استرجاع نسخة #${req.params.id}`);
  res.json({ version: r.version });
});

// --------------------------------------------------------------- files
api.post('/files', express.raw({ type: () => true, limit: '15mb' }), (req, res) => {
  try {
    const name = decodeURIComponent(req.get('X-File-Name') || 'file');
    const f = store.saveFile(req.companyId, name, (req.get('Content-Type') || '').split(';')[0].trim(), req.body, req.user.display_name);
    res.json(f);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
api.get('/files/:id', (req, res) => {
  const f = store.getFile(req.companyId, req.params.id);
  if (!f) return res.status(404).json({ error: 'الملف غير موجود' });
  const inline = /^image\/|^application\/pdf$/.test(f.mime) && req.query.download !== '1';
  res.set('Content-Type', f.mime);
  res.set('Cache-Control', 'private, max-age=86400');
  res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  res.sendFile(f.path);
});

// ---------------------------------------------------------------- chat
const CHANNELS = { general: store.STAFF_ROLES, field: [...store.STAFF_ROLES, 'SUPERVISOR', 'HOUSING'], agents: [...store.STAFF_ROLES, 'AGENT'], dm: store.ROLES };
const chanOk = (req) => CHANNELS[req.params.ch] && CHANNELS[req.params.ch].includes(req.user.role);
/** People a user may address: staff see everyone in the company; field/agent accounts see staff (+ field colleagues). */
function chatPeople(req) {
  const staff = store.STAFF_ROLES.includes(req.user.role);
  return store.listUsers(req.companyId).filter((u) => u.is_active && u.id !== req.user.id && (u.company_id === req.companyId || u.role === 'OWNER'))
    .filter((u) => staff || store.STAFF_ROLES.includes(u.role) || (req.user.role !== 'AGENT' && ['SUPERVISOR', 'HOUSING'].includes(u.role)))
    .map(({ id, display_name, role }) => ({ id, display_name, role }));
}
api.get('/chat/people', (req, res) => res.json(chatPeople(req)));
api.get('/chat/unread', (req, res) => res.json(store.chatUnread(req.user.id, req.companyId).filter((x) => CHANNELS[x.channel] && CHANNELS[x.channel].includes(req.user.role))));
api.get('/chat/:ch', (req, res) => {
  if (!chanOk(req)) return res.status(403).json({ error: 'لا تملك صلاحية هذه المحادثة' });
  const rows = store.listChat(req.companyId, req.params.ch, req.query.since, req.user.id, req.query.with);
  if (rows.length) store.markChatRead(req.user.id, req.companyId, req.params.ch, rows[rows.length - 1].id);
  res.json(rows);
});
api.post('/chat/:ch', express.json({ limit: '50kb' }), (req, res) => {
  if (!chanOk(req)) return res.status(403).json({ error: 'لا تملك صلاحية هذه المحادثة' });
  try {
    const b = req.body || {}, ch = req.params.ch;
    if (b.fileId && !store.getFile(req.companyId, b.fileId)) throw new Error('المرفق غير موجود');
    let to = null;
    if (b.to) {
      to = chatPeople(req).find((u) => u.id === Number(b.to));
      if (!to) throw new Error('المستلم غير متاح');
      if (!CHANNELS[ch].includes(to.role)) throw new Error(`${to.display_name} لا يرى هذه المحادثة — أرسلها كرسالة خاصة`);
    } else if (ch === 'dm') throw new Error('اختر المستلم');
    const priv = ch === 'dm' ? 1 : b.private ? 1 : 0;
    const id = store.postChat(req.companyId, ch, req.user, b.text, b.fileId, to, priv);
    if (to) store.notify(req.companyId, { userId: to.id, text: `💬 ${req.user.display_name} ${priv ? '(رسالة خاصة)' : 'وجّه لك رسالة'}: ${String(b.text || '📎 مرفق').slice(0, 90)}`, link: 'chat' });
    res.json({ id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ------------------------------------------------------ HR self-service
// Punches use the SERVER clock (company timezone) — the device clock can't be used to fake attendance.
const myEmp = (S, u) => Hr.empOfUser(S, u.id);
api.get('/hr/me', (req, res) => {
  const { S } = loadDoc(req.companyId), e = myEmp(S, req.user);
  if (!e) return res.json({ linked: false });
  res.json({ linked: true, ...Hr.selfView(S, e, req.query.period) });
});
api.post('/hr/punch', express.json(), (req, res) => {
  try {
    const g = req.body && req.body.geo, geo = g && Number.isFinite(+g.lat) && Number.isFinite(+g.lng) ? { lat: +(+g.lat).toFixed(5), lng: +(+g.lng).toFixed(5), acc: Math.round(+g.acc || 0) } : null;
    const r = mutate(req.companyId, req.user.display_name, (S) => {
      const e = myEmp(S, req.user); if (!e) throw new Error('حسابك غير مربوط بملف موظف — راجع الموارد البشرية');
      const p = Hr.punch(S, e.id, Date.now(), geo);
      S.audit.unshift({ at: Date.now(), by: req.user.display_name, msg: `${p.kind === 'IN' ? 'تسجيل حضور' : 'تسجيل انصراف'} ${p.kind === 'IN' ? p.rec.in : p.rec.out}${geo ? ' 📍' : ''}` });
      S.audit.length = Math.min(S.audit.length, 3000);
      return p;
    });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
api.post('/hr/leave', express.json(), (req, res) => {
  try {
    const l = mutate(req.companyId, req.user.display_name, (S) => {
      const e = myEmp(S, req.user); if (!e) throw new Error('حسابك غير مربوط بملف موظف');
      if (req.body.fileId && !store.getFile(req.companyId, req.body.fileId)) throw new Error('المرفق غير موجود');
      return { ...Hr.requestLeave(S, e.id, req.body || {}, req.user.display_name), empName: e.name };
    });
    store.notify(req.companyId, { roles: Hr.HR_ADMINS, text: `🌴 طلب إجازة ${Hr.LEAVE_TYPES[l.type]} من ${l.empName}: ${l.from} ← ${l.to} (${l.days} يوم)`, link: 'hrLeaves' });
    res.json(l);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
api.post('/hr/task/:id', express.json(), (req, res) => {
  try {
    const st = ['OPEN', 'DOING', 'DONE'].includes(req.body.status) ? req.body.status : null;
    if (!st) throw new Error('حالة غير صحيحة');
    const t = mutate(req.companyId, req.user.display_name, (S) => {
      const e = myEmp(S, req.user); if (!e) throw new Error('حسابك غير مربوط بملف موظف');
      return { ...Hr.setTaskStatus(S, req.params.id, e.id, st), empName: e.name };
    });
    if (st === 'DONE') store.notify(req.companyId, { roles: Hr.HR_ADMINS, text: `✅ ${t.empName} أنهى المهمة: ${t.title}`, link: 'hrTasks' });
    res.json(t);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ------------------------------------------------------- notifications
api.get('/notifications', (req, res) => res.json(store.listNotifications(req.user, req.companyId)));
api.post('/notifications/read', express.json(), (req, res) => { store.markNotificationsRead(req.user.id, req.body && req.body.lastId); res.json({ ok: true }); });

// ------------------------------------------------------------ whatsapp
api.get('/wa/status', (req, res) => { const c = wa.publicConfig(req.companyId); res.json({ enabled: c.enabled, autoReceipt: c.autoReceipt }); });
api.get('/wa/config', allow('OWNER', 'MANAGER'), (req, res) => res.json(wa.publicConfig(req.companyId)));
api.put('/wa/config', express.json(), allow('OWNER', 'MANAGER'), (req, res) => { store.audit(req.user.id, req.companyId, 'تعديل إعدادات واتساب'); res.json(wa.saveConfig(req.companyId, req.body || {})); });
api.get('/wa/log', allow('OWNER', 'MANAGER', 'ACCOUNTANT'), (req, res) => res.json(wa.listLog(req.companyId)));
api.post('/wa/send', express.json({ limit: '50kb' }), staffOnly, async (req, res) => {
  try { res.json(await wa.send(req.companyId, req.body || {}, req.user.display_name)); } catch (e) { res.status(400).json({ error: e.message }); }
});
api.post('/wa/bulk', express.json({ limit: '1mb' }), staffOnly, async (req, res) => {
  const items = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  if (!wa.publicConfig(req.companyId).enabled) return res.status(400).json({ error: 'واتساب بيزنس غير مفعّل' });
  store.audit(req.user.id, req.companyId, `إرسال واتساب جماعي (${items.length})`);
  res.json(await wa.bulk(req.companyId, items, req.user.display_name));
});

// ------------------------------------------------------------------ fx
async function refreshFx(force) {
  const cur = store.kvGet('fx:SAR:EGP');
  if (!force && cur && Date.now() - cur.at < 6 * 3600000) return cur;
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/SAR', { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    if (d && d.rates && d.rates.EGP) {
      const v = { rate: Math.round(d.rates.EGP * 10000) / 10000, at: Date.now(), source: 'open.er-api.com', usd: d.rates.USD ? Math.round((d.rates.EGP / d.rates.USD) * 100) / 100 : null };
      store.kvSet('fx:SAR:EGP', v);
      return v;
    }
  } catch (e) { /* offline → keep last known */ }
  return cur;
}
api.get('/fx', async (req, res) => res.json((await refreshFx(req.query.refresh === '1')) || { rate: null }));

// --------------------------------------------------------------- audit
api.get('/audit', allow('OWNER', 'MANAGER', 'ACCOUNTANT', 'HR'), (req, res) => res.json(store.listAudit(req.companyId, req.query.limit)));

// -------------------------------------------------------------- backup
api.get('/backup', allow('OWNER'), (req, res) => {
  store.audit(req.user.id, null, 'تنزيل نسخة احتياطية كاملة');
  res.set('Content-Disposition', `attachment; filename="umrah-erp-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.type('json').send(JSON.stringify(store.exportAll()));
});
api.post('/restore', express.json({ limit: '500mb' }), allow('OWNER'), (req, res) => {
  try { store.importAll(req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ============================================================== PORTAL
const portal = express.Router();
portal.use(allow('AGENT', 'SUPERVISOR', 'HOUSING'));
function portalView(S, u) {
  const base = { company: { name: S.company.name, phone: S.company.phone }, role: u.role, user: { name: u.display_name } };
  if (u.role === 'AGENT') {
    const a = S.agents.find((x) => x.id === u.agent_ref);
    if (!a) return { ...base, error: 'حساب المندوب غير مرتبط بسجل وكيل — راجع الإدارة' };
    const prices = {};
    const trips = S.trips.filter((d) => d.trip.status !== 'CLOSED' && d.trip.departDate >= Engine.iso(new Date())).map((d) => Model.withTrip(S, d.id, () => {
      const pl = Engine.priceList(S);
      prices[d.id] = pl;
      const free = ['MAK', 'MAD'].map((c) => Engine.breakage(S, c).reduce((x, y) => x + y.free, 0));
      const cm = a.tier === 'BROKER' ? Engine.commissionFor(S, a, { adults: 1, chd: 0, gross: pl.QUAD }) : null;
      return { id: d.id, code: d.trip.code, name: d.trip.name, departDate: d.trip.departDate, returnDate: d.trip.returnDate, prices: pl, freeBeds: free,
        commissionText: cm ? (cm.rate != null ? `${Math.round(cm.rate)} ج.م لكل ${cm.basis === 'BOOKING' ? 'حجز' : 'فرد'}` : cm.source) : null };
    }));
    const bookings = [];
    for (const d of S.trips) for (const b of d.bookings.filter((x) => x.agentId === a.id)) {
      bookings.push({ id: b.id, code: b.code, trip: d.trip.code, tripId: d.id, status: b.status, statusAr: Engine.BOOKING_STATUS[b.status].ar, net: b.net, paid: b.paid, mode: b.mode, roomType: b.roomType,
        createdAt: b.createdAt, holdUntil: b.holdUntil, installments: b.installments || [], request: b.agentRequest || null, agentCommission: b.agentCommission || 0, commissionAdj: b.commissionAdj || 0,
        commissionLog: (b.commissionLog || []).map((x) => ({ adj: x.adj, note: x.note })),
        pax: d.pax.filter((p) => p.bookingId === b.id).map((p) => ({ id: p.id, nameAr: p.nameAr, nameEn: p.nameEn, type: p.type, gender: p.gender, passport: p.passport, passportExp: p.passportExp, photoFileId: p.photoFileId, passportFileId: p.passportFileId })) });
    }
    return { ...base, agent: { id: a.id, code: a.code, name: a.name, tier: a.tier, currency: a.currency, balance: a.balance, creditLimit: a.creditLimit, netDiscountPct: a.netDiscountPct, commissionPct: a.commissionPct, commission: Engine.commissionRule(a), blocked: a.blocked, overdueDays: a.overdueDays },
      statement: Acc.partyStatement(S, 'agent', a.id), trips,
      score: (() => { const r = Model.agentRanking(S, { from: Engine.iso(new Date()).slice(0, 4) + '-01-01' }).find((x) => x.a.id === a.id);
        return { total: r.total, rating: r.rating, parts: r.parts, k: { bookings: r.k.bookings, pax: r.k.pax, net: r.k.net, collectionPct: r.k.collectionPct, cancelPct: r.k.cancelPct, docsPct: r.k.docsPct, commission: r.k.commission } }; })(), bookings: bookings.sort((x, y) => y.createdAt - x.createdAt),
      vouchers: S.vouchers.filter((v) => v.party && v.party.type === 'agent' && v.party.id === a.id).map((v) => ({ no: v.no, type: v.type, date: v.date, amount: v.amount, currency: v.currency, status: v.status, memo: v.memo, rejectReason: v.rejectReason })),
      cashboxes: S.cashboxes.map((c) => ({ id: c.id, name: c.name, type: c.type, bankName: c.bankName, iban: c.iban })),
      domains: S.company.domains || ['UMRAH'], profile: (() => { const x = store.getUser(u.id); return { display_name: x.display_name, phone: x.phone, email: x.email, ...x.profile }; })(),
      domPrograms: S.dom.programs.filter((p) => p.status !== 'CLOSED' && p.startDate >= Engine.iso(new Date())).map((p) => ({ id: p.id, code: p.code, name: p.name, kind: p.kind, city: p.city, startDate: p.startDate, endDate: p.endDate,
        left: Dom.capacityLeft(S, p), seatPrice: p.seatPrice || 0, pickups: (p.pickups || []).map((x) => x.place), childPolicy: p.childPolicy || {},
        options: (p.hotelOptions || []).map((o, i) => ({ idx: i, name: (o.hotelId && (Dom.hotel(S, o.hotelId) || {}).name) || o.hotelName || 'فندق', board: Dom.BOARDS[o.board] || '', prices: o.prices || {} })) })),
      domBookings: S.dom.bookings.filter((b) => b.agentId === a.id).map((b) => ({ code: b.code, program: (Dom.program(S, b.programId) || {}).name || 'فندق', status: b.status, statusAr: (Engine.BOOKING_STATUS[b.status] || {}).ar, net: b.net, paid: b.paid,
        lead: (b.pax[0] || {}).name, request: b.agentRequest || null, agentCommission: b.agentCommission || 0, createdAt: b.createdAt })).sort((x, y) => y.createdAt - x.createdAt),
      hajjSeasons: S.hajj.seasons.filter((x) => !x.closed).map((x) => ({ id: x.id, name: x.name, levels: [...new Set(S.hajj.packages.filter((k) => k.seasonId === x.id).map((k) => k.level))].map((l) => ({ k: l, ar: Hajj.LEVELS[l] })),
        packages: S.hajj.packages.filter((k) => k.seasonId === x.id).map((k) => ({ code: k.code, name: k.name, level: Hajj.LEVELS[k.level], prices: k.prices })) })),
      hajjApps: S.hajj.applicants.filter((x) => x.agentId === a.id).map((x) => ({ code: x.code, nameAr: x.nameAr, level: Hajj.LEVELS[x.level], status: (Hajj.APP_STATUS[x.status] || {}).ar, request: x.agentRequest || null, createdAt: x.createdAt })).sort((x, y) => y.createdAt - x.createdAt) };
  }
  const key = u.role === 'SUPERVISOR' ? (t) => t.supervisor && t.supervisor.userId === u.id : (t) => t.housingUserId === u.id;
  const trips = S.trips.filter((d) => key(d.trip)).map((d) => Model.withTrip(S, d.id, () => {
    const bedOf = (p, c) => { const b = Engine.bedOfPax(S, p.id, c); if (!b) return ''; const r = S.rooms.find((x) => x.id === b.roomId); return (r.physicalNo || r.vcode) + '/' + b.no; };
    const live = S.pax.filter((p) => Engine.LIVE_STATES.includes(S.bookings.find((b) => b.id === p.bookingId).status));
    return {
      id: d.id, code: d.trip.code, name: d.trip.name, departDate: d.trip.departDate, returnDate: d.trip.returnDate, flight: d.trip.flight,
      hotels: ['MAK', 'MAD'].map((c) => { const al = S.allotments.find((x) => x.id === d.trip.stays[c].allotmentId); return { city: c, name: al ? al.hotel : '', checkIn: d.trip.stays[c].checkIn, nights: d.trip.stays[c].nights }; }),
      itinerary: d.trip.itinerary, supervisor: d.trip.supervisor,
      pax: live.map((p) => ({ nameAr: p.nameAr, nameEn: p.nameEn, phone: p.phone, gender: p.gender, type: p.type, booking: S.bookings.find((b) => b.id === p.bookingId).code,
        mak: p.type === 'ADULT' ? bedOf(p, 'MAK') : 'مع ذويه', mad: p.type === 'ADULT' ? bedOf(p, 'MAD') : 'مع ذويه', seat: Object.keys(S.bus.seats).find((k) => S.bus.seats[k] === p.id) || '',
        passportStage: Engine.PASSPORT_STAGES[p.vault.stage].ar })),
      rooming: { MAK: Engine.roomingList(S, 'MAK'), MAD: Engine.roomingList(S, 'MAD') },
      unassigned: { MAK: Engine.unassignedPax(S, 'MAK').length, MAD: Engine.unassignedPax(S, 'MAD').length },
      expenses: S.vouchers.filter((v) => v.tripId === d.id && v.type === 'EXP' && v.status === 'POSTED').map((v) => ({ no: v.no, date: v.date, amount: v.amount, currency: v.currency, memo: v.memo })),
    };
  }));
  return { ...base, trips };
}
portal.get('/', (req, res) => { const { S } = loadDoc(req.companyId); res.json(portalView(S, req.user)); });
portal.post('/booking', express.json({ limit: '200kb' }), allow('AGENT'), (req, res) => {
  try {
    const u = req.user;
    const code = mutate(req.companyId, u.display_name, (S) => {
      const a = S.agents.find((x) => x.id === u.agent_ref);
      if (!a) throw new Error('حساب المندوب غير مرتبط بسجل وكيل');
      const doc = S.trips.find((d) => d.id === req.body.tripId && d.trip.status !== 'CLOSED');
      if (!doc) throw new Error('الرحلة غير متاحة');
      const d = req.body.draft || {};
      const draft = { channel: a.tier, agentId: a.id, mode: ['FULL_PACKAGE', 'PRIVATE_ROOM', 'ROOM_ONLY', 'UNBUNDLED'].includes(d.mode) ? d.mode : 'FULL_PACKAGE',
        roomType: Engine.ROOM_TYPES[d.roomType] ? d.roomType : 'QUAD', services: d.services || {}, discountPct: 0, incentive: 0, incentiveMode: 'CLIENT_DISCOUNT', deposit: 0, ttl: 24,
        notes: String(d.notes || '').slice(0, 500),
        pax: (Array.isArray(d.pax) ? d.pax : []).slice(0, 20).map((p) => ({ nameAr: String(p.nameAr || '').slice(0, 80), nameEn: String(p.nameEn || '').slice(0, 80), gender: p.gender === 'F' ? 'F' : 'M',
          type: Engine.PAX_TYPES[p.type] ? p.type : 'ADULT', dob: String(p.dob || '').slice(0, 10), passport: String(p.passport || '').slice(0, 20), passportExp: String(p.passportExp || '').slice(0, 10),
          nid: String(p.nid || '').slice(0, 14), phone: String(p.phone || '').slice(0, 20), photoFileId: p.photoFileId || null, passportFileId: p.passportFileId || null })) };
      for (const p of draft.pax) for (const f of [p.photoFileId, p.passportFileId]) if (f && !store.getFile(req.companyId, f)) throw new Error('مرفق غير صالح');
      draft.ttl = 48; // agent bookings wait on hold for the owner / operations manager
      return Model.withTrip(S, doc.id, () => { const r = Model.createBooking(S, draft, actorOf(u)); markAgentRequest(r.booking, u); return `${doc.trip.code} · ${r.booking.code} (${Engine.BOOKING_STATUS[r.booking.status].ar})`; });
    });
    notifyAgentBooking(req, code);
    res.json({ ok: true, code });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
portal.post('/payment', express.json({ limit: '50kb' }), allow('AGENT'), (req, res) => {
  try {
    const u = req.user, b = req.body || {};
    if (!Array.isArray(b.fileIds) || !b.fileIds.length || b.fileIds.some((f) => !store.getFile(req.companyId, f))) throw new Error('ارفع صورة إيصال الدفعة');
    const no = mutate(req.companyId, u.display_name, (S) => {
      const a = S.agents.find((x) => x.id === u.agent_ref);
      if (!a) throw new Error('حساب المندوب غير مرتبط بسجل وكيل');
      let bookingId = null, tripId = null;
      if (b.bookingId) { const f = Model.findBooking(S, b.bookingId); if (!f || f.b.agentId !== a.id) throw new Error('الحجز غير تابع لك'); bookingId = f.b.id; tripId = f.doc.id; }
      const v = Model.createVoucher(S, { type: 'RV', amount: Number(b.amount), currency: a.currency === 'SAR' && b.currency === 'SAR' ? 'SAR' : 'EGP', fx: S.fx.current,
        cashboxId: S.cashboxes.some((c) => c.id === b.cashboxId) ? b.cashboxId : S.cashboxes[0].id, party: { type: 'agent', id: a.id }, bookingId, tripId,
        memo: `دفعة من المندوب ${a.name}${b.memo ? ' — ' + String(b.memo).slice(0, 200) : ''}`, method: String(b.method || '').slice(0, 40), fileIds: b.fileIds }, actorOf(u));
      return v.no;
    });
    store.notify(req.companyId, { roles: gov.APPROVERS, text: `💰 دفعة جديدة ${no} بمبلغ ${Number(b.amount)} من المندوب ${req.user.display_name} — بانتظار مراجعتك`, link: 'vouchers' });
    res.json({ ok: true, no });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
portal.post('/pax-docs', express.json(), allow('AGENT'), (req, res) => {
  try {
    const u = req.user, b = req.body || {};
    for (const f of [b.photoFileId, b.passportFileId]) if (f && !store.getFile(req.companyId, f)) throw new Error('مرفق غير صالح');
    mutate(req.companyId, u.display_name, (S) => {
      const f = Model.findBooking(S, b.bookingId);
      if (!f || f.b.agentId !== u.agent_ref) throw new Error('الحجز غير تابع لك');
      const p = f.doc.pax.find((x) => x.id === b.paxId && x.bookingId === f.b.id);
      if (!p) throw new Error('المسافر غير موجود');
      if (b.photoFileId) p.photoFileId = b.photoFileId;
      if (b.passportFileId) p.passportFileId = b.passportFileId;
    });
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/** Bookings made from the agent portal are holds that the owner / operations manager accepts or rejects. */
function markAgentRequest(b, u) { b.agentRequest = { state: 'PENDING', at: Date.now() }; b.agentUserId = u.id; }
function notifyAgentBooking(req, code) {
  store.notify(req.companyId, { roles: gov.ACCOUNT_APPROVERS, text: `🟡 حجز معلق من المندوب ${req.user.display_name}: ${code} — بانتظار موافقتك`, link: 'approvals' });
  store.notify(req.companyId, { roles: ['SALES', 'HEAD', 'OPERATIONS'], text: `🧾 حجز جديد من المندوب ${req.user.display_name}: ${code} (بانتظار موافقة الإدارة)`, link: 'booking' });
}
const agentOf = (S, u) => { const a = S.agents.find((x) => x.id === u.agent_ref); if (!a) throw new Error('حساب المندوب غير مرتبط بسجل وكيل'); if (a.blocked) throw new Error('حسابك موقوف — تواصل مع الشركة'); return a; };
portal.post('/dom-booking', express.json({ limit: '100kb' }), allow('AGENT'), (req, res) => {
  try {
    const u = req.user, d = req.body || {};
    const code = mutate(req.companyId, u.display_name, (S) => {
      const a = agentOf(S, u), p = Dom.program(S, d.programId);
      if (!p || p.status === 'CLOSED') throw new Error('البرنامج غير متاح');
      const rooms = (Array.isArray(d.rooms) ? d.rooms : []).slice(0, 10).map((r) => ({ type: Dom.ROOMS[r.type] ? r.type : 'DBL', adults: Math.max(0, Math.min(6, Number(r.adults) || 0)),
        children: (Array.isArray(r.children) ? r.children : []).slice(0, 4).map((c) => ({ age: Math.max(0, Math.min(17, Number(c.age) || 0)), bed: !!c.bed })) }));
      const pax = [{ name: String(d.leadName || '').slice(0, 80), phone: String(d.leadPhone || '').slice(0, 20), nid: String(d.leadNid || '').slice(0, 14) }];
      const r = Dom.createBooking(S, { programId: p.id, optIdx: Number(d.optIdx) || 0, rooms, pax, extras: {}, pickup: String(d.pickup || '').slice(0, 120), agentId: a.id, discountPct: 0, ttl: 48, notes: String(d.notes || '').slice(0, 500) }, actorOf(u));
      markAgentRequest(r.booking, u);
      return `${p.code} · ${r.booking.code}`;
    });
    notifyAgentBooking(req, code);
    res.json({ ok: true, code });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
portal.post('/hajj-apply', express.json({ limit: '50kb' }), allow('AGENT'), (req, res) => {
  try {
    const u = req.user, d = req.body || {};
    const code = mutate(req.companyId, u.display_name, (S) => {
      const a = agentOf(S, u), ss = S.hajj.seasons.find((x) => !x.closed && x.id === d.seasonId) || S.hajj.seasons.find((x) => !x.closed);
      if (!ss) throw new Error('لا يوجد موسم حج مفتوح');
      const x = Hajj.apply(S, ss.id, { nameAr: String(d.nameAr || '').slice(0, 80), phone: String(d.phone || '').slice(0, 20), nid: String(d.nid || '').slice(0, 14), level: Hajj.LEVELS[d.level] ? d.level : 'ECONOMY',
        groupKey: String(d.groupKey || '').slice(0, 40), lastHajjYear: String(d.lastHajjYear || '').slice(0, 4), agentId: a.id, notes: String(d.notes || '').slice(0, 300) }, actorOf(u));
      x.agentRequest = { state: 'PENDING', at: Date.now() }; x.agentUserId = u.id;
      return `${x.code} ${x.nameAr}`;
    });
    store.notify(req.companyId, { roles: gov.ACCOUNT_APPROVERS, text: `🕋 طلب حج مبدئي من المندوب ${req.user.display_name}: ${code} — بانتظار موافقتك`, link: 'approvals' });
    res.json({ ok: true, code });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
/** The agent edits his own data → login stops until the owner / operations manager approves the change. */
portal.post('/profile', express.json({ limit: '20kb' }), allow('AGENT'), (req, res) => {
  try {
    const u = store.requestProfileChange(req.user.id, req.body || {});
    store.notify(req.companyId, { roles: gov.ACCOUNT_APPROVERS, text: `✏️ المندوب ${u.display_name} عدّل بياناته — الدخول متوقف لحين موافقتك`, link: 'approvals' });
    clearCookie(res, COOKIE);
    res.json({ ok: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
api.use('/portal', portal);
app.use('/api', api);

// ------------------------------------------------------------------ static
// Versioned assets: index.html is never cached and references ?v=<build>, so every deploy reaches every browser immediately.
const INDEX = require('fs').readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
  .replace(/(src="js\/[\w-]+\.js)"/g, `$1?v=${BUILD}"`).replace(/(href="css\/app\.css)"/, `$1?v=${BUILD}"`)
  .replace('<meta name="theme-color"', `<meta name="app-build" content="${BUILD}">\n  <meta name="theme-color"`);
const sendIndex = (req, res) => { res.set('Cache-Control', 'no-cache, no-store, must-revalidate'); res.type('html').send(INDEX); };
app.get(['/', '/index.html'], sendIndex);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '30d', index: false }));
app.get('*', sendIndex);

// ------------------------------------------------------------- background
function sweep() {
  for (const c of store.listCompanies()) {
    try {
      const { version, S } = loadDoc(c.id);
      const released = [];
      for (const d of S.trips) Model.withTrip(S, d.id, () => { for (const code of Engine.releaseExpiredHolds(S, Date.now())) released.push(`${d.trip.code} · ${code}`); });
      for (const code of Dom.releaseExpired(S, Date.now())) released.push(`سياحة داخلية · ${code}`);
      if (!released.length) continue;
      for (const r of released) S.audit.unshift({ at: Date.now(), by: 'النظام', msg: `تحرير آلي للحجز ${r} لانتهاء مهلة التعليق` });
      const s = store.saveState(c.id, version, Model.serialize(S), 'النظام');
      if (s.ok) store.notify(c.id, { roles: ['OWNER', 'MANAGER', 'SALES', 'HEAD'], text: `⏱️ تحرر تلقائياً لانتهاء المهلة: ${released.join('، ')}`, link: 'booking' });
    } catch (e) { console.error('sweep failed', c.id, e.message); }
  }
}
if (require.main === module) {
  setInterval(sweep, 30000).unref();
  setInterval(() => { try { store.autoBackup(); } catch (e) { console.error('backup failed', e.message); } }, 3600000).unref();
  setTimeout(() => { store.autoBackup(); refreshFx(); }, 5000).unref();
  app.listen(PORT, () => console.log(`أفواج (Afwaj) شغال على http://localhost:${PORT}`));
}
module.exports = { app, sweep };
