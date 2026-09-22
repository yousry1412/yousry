@echo off
chcp 65001 >nul
title نظام إدارة التوزيع
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo لازم تركّب Node.js الأول قبل ما تشغّل البرنامج.
  echo روح على الموقع ده وحمّل نسخة LTS ونصّبها زي أي برنامج عادي:
  echo https://nodejs.org
  echo بعد التثبيت، افتح الملف ده تاني.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo جارِ تجهيز البرنامج لأول مرة، برجاء الانتظار شوية...
  call npm install
)

echo.
echo جارِ تشغيل النظام... المتصفح هيفتح تلقائيًا خلال ثوانٍ.
echo لو المتصفح ماتفتحش لوحده، افتح العنوان ده يدويًا: http://localhost:3001
echo (سيب الشاشة دي مفتوحة طول ما البرنامج شغال. قفلها يوقف السيرفر.)
echo.

start "" cmd /c "timeout /t 3 >nul & start http://localhost:3001"
call npm start
pause
