/* =====================================================================
 * Umrah ERP — online server
 * Serves the web app from ./public and exposes a small JSON API:
 *   /api/auth/*   setup (first owner) · login · logout · status
 *   /api/users    team accounts (owner only)
 *   /api/state    the shared, versioned ERP state (optimistic concurrency)
 * A server-side sweeper releases expired soft-holds even when nobody is online.
 * ===================================================================== */
const express = require('express');
const path = require('path');
const store = require('./lib/store');
const { parseCookies, setCookie, clearCookie } = require('./lib/cookies');
const Engine = require('./public/js/engine.js');
const { buildSeed } = require('./public/js/data.js');

const app = express();
const PORT = process.env.PORT || 3002;
const COOKIE = 'umrah_sid';

app.set('trust proxy', 1); // behind Render's HTTPS proxy → req.secure works → Secure cookie
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'same-origin');
  next();
});
app.use(express.json({ limit: '10mb' }));

// First boot: seed the demo trip so the team can start exploring immediately.
if (!store.getState()) store.forceState(buildSeed(Date.now()), 'system');

// ------------------------------------------------------------------ auth
const attempts = new Map();
const locked = (ip) => { const e = attempts.get(ip); if (!e) return false; if (Date.now() - e.first > 60000) { attempts.delete(ip); return false; } return e.count >= 5; };
const fail = (ip) => { const e = attempts.get(ip); if (!e || Date.now() - e.first > 60000) attempts.set(ip, { count: 1, first: Date.now() }); else e.count++; };
const startSession = (req, res, user) => setCookie(res, COOKIE, store.createSession(user.id), { maxAgeSeconds: store.SESSION_DAYS * 86400, secure: req.secure });

const auth = express.Router();
auth.get('/status', (req, res) => {
  const u = store.userFromSession(parseCookies(req)[COOKIE]);
  res.json({ needsSetup: !store.isSetup(), user: store.publicUser(u) });
});
auth.post('/setup', (req, res) => {
  try {
    const u = store.setupOwner(req.body || {});
    startSession(req, res, u); store.audit(u.id, 'إعداد حساب المالك');
    res.json({ user: u });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
auth.post('/login', (req, res) => {
  if (locked(req.ip)) return res.status(429).json({ error: 'محاولات كثيرة — حاول بعد دقيقة' });
  const u = store.authenticate(req.body && req.body.username, req.body && req.body.password);
  if (!u) { fail(req.ip); return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر غير صحيحة' }); }
  attempts.delete(req.ip);
  startSession(req, res, u); store.audit(u.id, 'تسجيل دخول');
  res.json({ user: store.publicUser(u) });
});
auth.post('/logout', (req, res) => { store.destroySession(parseCookies(req)[COOKIE]); clearCookie(res, COOKIE); res.json({ ok: true }); });
app.use('/api/auth', auth);

function requireAuth(req, res, next) {
  const u = store.userFromSession(parseCookies(req)[COOKIE]);
  if (!u) return res.status(401).json({ error: 'سجّل الدخول أولاً' });
  req.user = u;
  next();
}
const requireOwner = (req, res, next) => (req.user.role === 'OWNER' ? next() : res.status(403).json({ error: 'هذه العملية للمالك فقط' }));

// ------------------------------------------------------------------ users
const api = express.Router();
api.use(requireAuth);
api.get('/users', requireOwner, (req, res) => res.json(store.listUsers()));
api.post('/users', requireOwner, (req, res) => {
  try { const u = store.createUser(req.body || {}); store.audit(req.user.id, `إضافة مستخدم ${u.username}`); res.json(u); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
api.patch('/users/:id', requireOwner, (req, res) => {
  try { const u = store.updateUser(Number(req.params.id), req.body || {}); store.audit(req.user.id, `تعديل مستخدم ${u.username}`); res.json(u); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
api.get('/users/directory', (req, res) => res.json(store.listUsers().filter((u) => u.is_active).map(({ id, display_name, role }) => ({ id, display_name, role }))));

// ------------------------------------------------------------------ state
api.get('/state', (req, res) => {
  const since = Number(req.query.since || -1);
  if (since === store.getVersion()) return res.json({ changed: false });
  res.json({ changed: true, ...store.getState() });
});
api.put('/state', (req, res) => {
  const { baseVersion, state } = req.body || {};
  if (!state || state.version !== 3 || !Array.isArray(state.bookings) || !Array.isArray(state.rooms) || !state.trip) {
    return res.status(400).json({ error: 'بيانات غير صالحة' });
  }
  const r = store.saveState(Number(baseVersion), state, req.user.display_name);
  if (!r.ok) return res.status(409).json({ error: 'تم تحديث البيانات من مستخدم آخر', ...r.conflict });
  res.json({ version: r.version });
});
api.post('/state/reset', requireOwner, (req, res) => {
  const r = store.forceState(buildSeed(Date.now()), req.user.display_name);
  store.audit(req.user.id, 'إعادة تحميل البيانات التجريبية');
  res.json({ version: r.version });
});
app.use('/api', api);

// ------------------------------------------------------------------ static app
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Soft-hold TTL sweeper — runs server-side every 30s so holds expire on time even with no browser open.
function sweep() {
  try {
    const cur = store.getState();
    if (!cur) return;
    const released = Engine.releaseExpiredHolds(cur.state, Date.now());
    if (!released.length) return;
    cur.state.audit = cur.state.audit || [];
    for (const c of released) cur.state.audit.unshift({ at: Date.now(), by: 'النظام', msg: `تحرير آلي للحجز ${c} لانتهاء مهلة التعليق` });
    store.saveState(cur.version, cur.state, 'النظام'); // on conflict a client just saved; next sweep retries
  } catch (e) { console.error('sweep failed', e); }
}
setInterval(sweep, 30000).unref();

if (require.main === module) {
  app.listen(PORT, () => console.log(`Smart Umrah ERP شغال على http://localhost:${PORT}`));
}
module.exports = app;
