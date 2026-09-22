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
  res.json({
    needsSetup: !auth.isSetup(),
    authenticated: auth.validateSession(cookies[COOKIE_NAME]),
  });
});

router.post('/setup', (req, res) => {
  try {
    if (auth.isSetup()) {
      return res.status(400).json({ error: 'كلمة السر متضبطة بالفعل - استخدم تسجيل الدخول' });
    }
    auth.setPassword(req.body.password);
    const { token } = auth.createSession();
    setCookie(res, COOKIE_NAME, token, { maxAgeSeconds: auth.SESSION_DAYS * 86400, secure: req.secure });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', (req, res) => {
  if (!auth.isSetup()) return res.status(400).json({ error: 'لازم تضبط كلمة السر الأول', needsSetup: true });
  const key = req.ip;
  if (isLocked(key)) {
    return res.status(429).json({ error: 'محاولات كتير غلط. استنى دقيقة وحاول تاني' });
  }
  if (!auth.checkPassword(req.body.password)) {
    recordFailure(key);
    return res.status(401).json({ error: 'كلمة السر غير صحيحة' });
  }
  clearAttempts(key);
  const { token } = auth.createSession();
  setCookie(res, COOKIE_NAME, token, { maxAgeSeconds: auth.SESSION_DAYS * 86400, secure: req.secure });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  const cookies = parseCookies(req);
  auth.destroySession(cookies[COOKIE_NAME]);
  clearCookie(res, COOKIE_NAME);
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  if (!auth.validateSession(cookies[COOKIE_NAME])) {
    return res.status(401).json({ error: 'يجب تسجيل الدخول', needsAuth: true });
  }
  next();
}

module.exports = { router, requireAuth };
