// حماية بسيطة من تكرار نفس الطلب (دبل كليك على "حفظ"، أو إعادة إرسال فورم بالغلط):
// لو نفس المستخدم بعت نفس المحتوى بالظبط لنفس المسار خلال نافذة زمنية قصيرة، بيترفض
// الطلب التاني بدل ما يتنفذ مرتين (فاتورة/سند مكرر). الطلبات القراءة (GET) مش متأثرة.
const WINDOW_MS = 4000;
const recentRequests = new Map();

function sweepOld(now) {
  for (const [key, ts] of recentRequests) {
    if (now - ts > WINDOW_MS) recentRequests.delete(key);
  }
}

function dedupeGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!req.user) return next();

  const now = Date.now();
  sweepOld(now);

  const key = `${req.user.id}:${req.method}:${req.originalUrl}:${JSON.stringify(req.body || {})}`;
  const lastSeen = recentRequests.get(key);
  if (lastSeen && now - lastSeen < WINDOW_MS) {
    return res.status(409).json({ error: 'نفس الطلب اتبعت قبل كده على طول - لو مقصود، استنى شوية وحاول تاني' });
  }
  // بنسجل الطلب كـ"متكرر محتمل" بس لو نجح فعلاً - غير كده أي خطأ تحقق (validation) هيمنع
  // المستخدم من إعادة المحاولة فورًا بعد ما يصلّح البيانات
  res.on('finish', () => {
    if (res.statusCode < 400) recentRequests.set(key, Date.now());
  });
  next();
}

module.exports = { dedupeGuard };
