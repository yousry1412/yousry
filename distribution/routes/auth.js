const express = require('express');
const auth = require('../lib/auth');
const { parseCookies, setCookie, clearCookie } = require('../lib/cookies');

const router = express.Router();
const COOKIE_NAME = 'sid';

// حماية بسيطة من محاولات تخمين كلمة السر: بعد 5 محاولات فاشلة من نفس الـ IP
// خلال دقيقة، بيتقفل لمدة دقيقة. تخزين في الذاكرة كفاية هنا لأنه مش موزّع على أكتر من سيرفر.
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;
const loginAttempts = new Map();

function isLocked(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key) {
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

function clearAttempts(key) {
  loginAttempts.delete(key);
}

router.get('/status', (req, res) => {
  const cookies = parseCookies(req);
  const user = auth.userFromSession(cookies[COOKIE_NAME]);
  res.json({
    needsSetup: !auth.isSetup(),
    authenticated: !!user,
    user: user ? auth.publicUser(user) : null,
  });
});

router.post('/setup', (req, res) => {
  try {
    const user = auth.setupOwner({ username: req.body.username, password: req.body.password });
    const { token } = auth.createSession(user.id);
    setCookie(res, COOKIE_NAME, token, { maxAgeSeconds: auth.SESSION_DAYS * 86400, secure: req.secure });
    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', (req, res) => {
  if (!auth.isSetup()) return res.status(400).json({ error: 'لازم تعمل حساب المالك الأول', needsSetup: true });
  const key = req.ip;
  if (isLocked(key)) {
    return res.status(429).json({ error: 'محاولات كتير غلط. استنى دقيقة وحاول تاني' });
  }
  const user = auth.authenticate(req.body.username, req.body.password);
  if (!user) {
    recordFailure(key);
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة السر غير صحيحة' });
  }
  clearAttempts(key);
  const { token } = auth.createSession(user.id);
  setCookie(res, COOKIE_NAME, token, { maxAgeSeconds: auth.SESSION_DAYS * 86400, secure: req.secure });
  res.json({ ok: true, user: auth.publicUser(user) });
});

router.post('/logout', (req, res) => {
  const cookies = parseCookies(req);
  auth.destroySession(cookies[COOKIE_NAME]);
  clearCookie(res, COOKIE_NAME);
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const user = auth.userFromSession(cookies[COOKIE_NAME]);
  if (!user) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول', needsAuth: true });
  }
  req.user = user;
  next();
}

module.exports = { router, requireAuth };
