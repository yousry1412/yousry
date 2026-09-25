#!/bin/bash
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "لازم تركّب Node.js الأول قبل ما تشغّل البرنامج."
  echo "روح على الموقع ده وحمّل نسخة LTS ونصّبها زي أي برنامج عادي:"
  echo "https://nodejs.org"
  echo "بعد التثبيت، افتح الملف ده تاني."
  echo ""
  read -p "دوس Enter عشان تقفل الشاشة دي..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "جارِ تجهيز البرنامج لأول مرة، برجاء الانتظار شوية..."
  npm install
fi

echo ""
echo "جارِ تشغيل النظام... المتصفح هيفتح تلقائيًا خلال ثوانٍ."
echo "لو المتصفح ماتفتحش لوحده، افتح العنوان ده يدويًا: http://localhost:3001"
echo "(سيب الشاشة دي مفتوحة طول ما البرنامج شغال. قفلها يوقف السيرفر.)"
echo ""

( sleep 3 && open "http://localhost:3001" ) &
npm start
