const express = require('express');
const path = require('path');
const apiRouter = require('./routes');
const { router: authRouter, requireAuth } = require('./routes/auth');
const { dedupeGuard } = require('./lib/dedupe-guard');
const { db, DB_PATH } = require('./lib/db');
const reports = require('./lib/reports');
const whatsapp = require('./lib/whatsapp');
const backup = require('./lib/backup');

const app = express();
const PORT = process.env.PORT || 3001;

// السيرفر شغال خلف بروكسي Render (HTTPS بيتفكّ عندهم ويوصلنا HTTP) - من غير الإعداد ده
// req.secure هيفضل false على طول حتى لو الاتصال الحقيقي HTTPS، وده بيمنع كوكي الجلسة
// من أخذ خاصية Secure أبدًا. الإعداد ده بيخلي Express يقرأ X-Forwarded-Proto صح.
app.set('trust proxy', 1);
// مفيش داعي لـ CORS خالص - الواجهة والـ API شغالين من نفس الأصل (origin) دايمًا،
// وأي فتح لـ CORS هنا كان بيوسّع سطح الهجوم من غير أي فايدة حقيقية
// حد أعلى أكبر من الافتراضي (100kb) عشان يستوعب صور التوالف والمرفقات (base64) - مرفق
// الشات لوحده ممكن يوصل لـ ٦ ميجا خام يعني حوالي ٨ ميجا بعد التحويل لـ base64
app.use(express.json({ limit: '12mb' }));
app.use('/api/auth', authRouter);
// بيمنع تكرار نفس الطلب (نفس المستخدم/المسار/المحتوى) خلال فترة قصيرة، عشان دبل كليك
// أو إعادة إرسال الفورم بالغلط ميعملش نفس الفاتورة/السند مرتين
app.use('/api', requireAuth, dedupeGuard, apiRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// فحص يومي لتنبيهات الصلاحية القريبة/المنتهية على كل المنشآت - بيتشغل عند بدء السيرفر
// وبعدين كل 24 ساعة، ويبعت لو فيه أصناف محتاجة مراجعة للمستخدمين المفعّلين التنبيه ده
const DAY_MS = 24 * 60 * 60 * 1000;
async function checkExpiryAlerts() {
  try {
    const companies = db.prepare('SELECT id FROM companies').all();
    for (const { id: companyId } of companies) {
      const alerts = reports.expiryAlerts(companyId, { days: 7 });
      if (alerts.length > 0) {
        await whatsapp.notifyManagersOfExpiryAlerts({ companyId, alerts });
      }
    }
  } catch (err) {
    console.error('فشل فحص تنبيهات الصلاحية:', err.message);
  }
}
setInterval(checkExpiryAlerts, DAY_MS);
checkExpiryAlerts();

// نسخة احتياطية تلقائية يومية من قاعدة البيانات (بيتجاهلها لو نسخة النهاردة أخذت خلاص
// من قبل - مهم لأن السيرفر ممكن يعيد التشغيل أكتر من مرة في اليوم الواحد)
function runDailyBackup() {
  try {
    const result = backup.runDailyBackup();
    if (result.created) console.log('تم أخذ نسخة احتياطية يومية:', result.path);
  } catch (err) {
    console.error('فشل أخذ النسخة الاحتياطية اليومية:', err.message);
  }
}
setInterval(runDailyBackup, DAY_MS);
runDailyBackup();

app.listen(PORT, () => {
  console.log(`نظام إدارة التوزيع شغال على http://localhost:${PORT}`);
  // بيوضح في لوجز السيرفر (زي Render) مسار قاعدة البيانات الفعلي المستخدم دلوقتي - مفيد
  // للتأكد إن القرص الدائم /var/data متوصّل وبيتقرأ صحيح وقت التشغيل الفعلي على السيرفر
  console.log(`قاعدة البيانات محفوظة في: ${DB_PATH}`);
});
