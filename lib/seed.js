function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function buildSeedData() {
  const sales = [];
  for (let i = 45; i >= 0; i--) {
    const isWeekend = new Date(isoDaysAgo(i)).getDay() % 6 === 0;
    let base = isWeekend ? 9500 : 7000;
    // simulate a promo bump for days 20..14 ago and a slow decline in the last week
    if (i <= 20 && i >= 14) base *= 1.28;
    if (i <= 6) base *= 0.88;
    const noise = 1 + (Math.sin(i) * 0.06);
    const revenue = Math.round(base * noise);
    sales.push({
      date: isoDaysAgo(i),
      revenue,
      ordersCount: Math.round(revenue / (isWeekend ? 95 : 85)),
      notes: '',
    });
  }

  const expenses = [
    { date: isoDaysAgo(40), category: 'rent', amount: 18000, notes: 'إيجار الشهر' },
    { date: isoDaysAgo(40), category: 'salaries', amount: 42000, notes: 'رواتب الفريق' },
    { date: isoDaysAgo(35), category: 'ingredients', amount: 26000, notes: 'توريد لحوم وخضار' },
    { date: isoDaysAgo(28), category: 'utilities', amount: 4200, notes: 'كهرباء وغاز' },
    { date: isoDaysAgo(20), category: 'marketing', amount: 3000, notes: 'إعلانات سوشيال ميديا للعرض' },
    { date: isoDaysAgo(15), category: 'ingredients', amount: 24500, notes: 'توريد أسبوعي' },
    { date: isoDaysAgo(10), category: 'salaries', amount: 5000, notes: 'إضافي وشيفتات إضافية' },
    { date: isoDaysAgo(5), category: 'other', amount: 1800, notes: 'صيانة معدات' },
  ];

  const offers = [
    {
      name: 'عرض الغدا 2 ب1',
      description: 'اشتري وجبة غدا واحصل على التانية مجانًا من 12 لـ4 عصرًا',
      startDate: isoDaysAgo(20),
      endDate: isoDaysAgo(14),
      discountPercent: 50,
      target: 'رواد الغدا في أيام الأسبوع',
      notes: '',
    },
    {
      name: 'خصم 15% للطلبات أونلاين',
      description: 'خصم على تطبيقات التوصيل لزيادة الطلبات أونلاين',
      startDate: isoDaysAgo(6),
      endDate: isoDaysAgo(0),
      discountPercent: 15,
      target: 'عملاء التوصيل',
      notes: 'شغال حاليًا',
    },
  ];

  const decisions = [
    {
      date: isoDaysAgo(20),
      title: 'إطلاق عرض الغدا 2 ب1',
      category: 'marketing',
      reason: 'ضعف المبيعات في فترة الغدا وسط الأسبوع',
      expectedOutcome: 'زيادة عدد الطلبات في فترة الغدا بنسبة 20%',
      notes: '',
    },
    {
      date: isoDaysAgo(10),
      title: 'زيادة عدد الشيفتات في عطلة الأسبوع',
      category: 'staffing',
      reason: 'شكاوى من بطء الخدمة أيام الجمعة والسبت',
      expectedOutcome: 'تحسين سرعة الخدمة بدون التأثير سلبًا على المبيعات',
      notes: '',
    },
    {
      date: isoDaysAgo(6),
      title: 'رفع سعر المشروبات الغازية 10%',
      category: 'pricing',
      reason: 'ارتفاع تكلفة التوريد',
      expectedOutcome: 'تحسين هامش الربح دون فقد عملاء',
      notes: '',
    },
  ];

  return { sales, expenses, offers, decisions };
}

module.exports = { buildSeedData };
