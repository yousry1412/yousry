const express = require('express');
const path = require('path');
const apiRouter = require('./routes');
const { router: authRouter, requireAuth } = require('./routes/auth');
const { dedupeGuard } = require('./lib/dedupe-guard');

const app = express();
const PORT = process.env.PORT || 3001;

// السيرفر شغال خلف بروكسي Render (HTTPS بيتفكّ عندهم ويوصلنا HTTP) - من غير الإعداد ده
// req.secure هيفضل false على طول حتى لو الاتصال الحقيقي HTTPS، وده بيمنع كوكي الجلسة
// من أخذ خاصية Secure أبدًا. الإعداد ده بيخلي Express يقرأ X-Forwarded-Proto صح.
app.set('trust proxy', 1);
// مفيش داعي لـ CORS خالص - الواجهة والـ API شغالين من نفس الأصل (origin) دايمًا،
// وأي فتح لـ CORS هنا كان بيوسّع سطح الهجوم من غير أي فايدة حقيقية
// حد أعلى أكبر من الافتراضي (100kb) عشان يستوعب صور التوالف (base64) بعد ضغطها في المتصفح
app.use(express.json({ limit: '8mb' }));
app.use('/api/auth', authRouter);
// بيمنع تكرار نفس الطلب (نفس المستخدم/المسار/المحتوى) خلال فترة قصيرة، عشان دبل كليك
// أو إعادة إرسال الفورم بالغلط ميعملش نفس الفاتورة/السند مرتين
app.use('/api', requireAuth, dedupeGuard, apiRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`نظام إدارة التوزيع شغال على http://localhost:${PORT}`);
});
