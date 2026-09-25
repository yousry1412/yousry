// نسخ احتياطية لقاعدة البيانات - نسخة يومية تلقائية على القرص (بتحتفظ بآخر أسبوع فقط
// عشان مايتراكمش مساحة)، ونسخة فورية لحظة الطلب لزرار "تحميل نسخة احتياطية" في الإعدادات.
//
// الطريقة المستخدمة (VACUUM INTO) هي الطريقة الرسمية والآمنة لعمل نسخة متسقة من قاعدة
// بيانات SQLite شغالة (بما فيها لو شغالة بنظام WAL) من غير قفلها لفترة طويلة أو إيقاف
// السيرفر - النسخة الناتجة ملف SQLite كامل وسليم يقدر يتفتح لوحده بأي أداة SQLite عادية.
//
// مهم: النسخ اليومية دي بتُحفظ على نفس القرص اللي قاعدة البيانات الأساسية شغالة عليه،
// فهي بتحمي من غلطة برمجية أو حذف بالغلط، لكنها مش بتحمي من عطل كامل في القرص نفسه.
// الحماية من ده هي زرار "تحميل نسخة احتياطية" - أي نسخة تتحمّل على فلاشة أو جهاز تاني
// بره السيرفر بالكامل هي الوحيدة اللي تضمن استرجاع البيانات لو السيرفر أو القرص ضاع بالكامل.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { db, DB_PATH } = require('./db');

const BACKUP_DIR = path.join(path.dirname(DB_PATH), 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const KEEP_DAYS = 7; // أسبوع من النسخ اليومية - نقطة استرجاع لو المشكلة اتكشفت بعد يوم أو يومين

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function dailyBackupFileName(dateStr) {
  return `distribution-backup-${dateStr}.sqlite`;
}

function createBackupFile(destPath) {
  if (fs.existsSync(destPath)) fs.unlinkSync(destPath); // VACUUM INTO بيرفض الكتابة فوق ملف موجود
  db.exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`);
  return destPath;
}

function rotateOldBackups() {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    if (!name.startsWith('distribution-backup-')) continue;
    const full = path.join(BACKUP_DIR, name);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    } catch (_) {
      /* لو الملف اتمسح بالفعل من قبل، مفيش داعي نوقف باقي عملية التنظيف */
    }
  }
}

/** نسخة يومية تلقائية - بتتجاهل النسخ لو النسخة بتاعة النهاردة أخذت خلاص (السيرفر بيعيد
 * التشغيل أكتر من مرة في اليوم أحيانًا)، لكن التنظيف (حذف الأقدم من أسبوع) بيحصل دايمًا
 * بصرف النظر عن ده - غير كده لو السيرفر ما اتقفلش خلال أسبوع كامل، النسخ القديمة تفضل
 * متراكمة للأبد لأن كل نداء بعد أول يوم كان بيرجع بدري قبل ما يوصل لسطر التنظيف. */
function runDailyBackup() {
  const dest = path.join(BACKUP_DIR, dailyBackupFileName(todayStr()));
  const created = !fs.existsSync(dest);
  if (created) createBackupFile(dest);
  rotateOldBackups();
  return { created, path: dest };
}

/** نسخة فورية في مجلد مؤقت - لزرار التحميل اليدوي، بتُمسح بعد اكتمال التحميل مباشرة */
function createDownloadCopy() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(os.tmpdir(), `distribution-backup-download-${stamp}.sqlite`);
  return createBackupFile(dest);
}

function listBackups() {
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith('distribution-backup-'))
    .map((name) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, sizeBytes: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

module.exports = { runDailyBackup, createDownloadCopy, listBackups, BACKUP_DIR };
