const DAY_MS = 24 * 60 * 60 * 1000;
const BASELINE_WINDOW_DAYS = 14;

const EXPENSE_CATEGORY_LABELS = {
  ingredients: 'المستلزمات والمواد الخام',
  salaries: 'الرواتب والأجور',
  rent: 'الإيجار',
  utilities: 'المرافق (كهرباء / مياه / غاز)',
  marketing: 'التسويق والإعلانات',
  other: 'مصروفات أخرى',
};

const DECISION_CATEGORY_LABELS = {
  pricing: 'تسعير',
  menu: 'قائمة الطعام',
  staffing: 'العمالة والتوظيف',
  marketing: 'تسويق',
  operations: 'تشغيل',
  other: 'أخرى',
};

function toDate(str) {
  return new Date(`${str}T00:00:00`);
}

function fmt(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, n) {
  return new Date(date.getTime() + n * DAY_MS);
}

function round(n, d = 1) {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
}

function sum(arr, fn) {
  return arr.reduce((acc, item) => acc + fn(item), 0);
}

function avgRevenueInRange(sales, start, end) {
  const inRange = sales.filter((s) => {
    const d = toDate(s.date);
    return d >= start && d <= end;
  });
  if (inRange.length === 0) return null;
  return sum(inRange, (s) => Number(s.revenue) || 0) / inRange.length;
}

function today() {
  return toDate(fmt(new Date()));
}

function evaluateOffers(offers, sales) {
  return offers.map((offer) => {
    const start = toDate(offer.startDate);
    const end = offer.endDate ? toDate(offer.endDate) : today();
    const baselineStart = addDays(start, -BASELINE_WINDOW_DAYS);
    const baselineEnd = addDays(start, -1);

    const baselineAvg = avgRevenueInRange(sales, baselineStart, baselineEnd);
    const duringAvg = avgRevenueInRange(sales, start, end);

    let liftPercent = null;
    let verdict = 'لا توجد بيانات كافية';
    let verdictLevel = 'unknown';

    if (baselineAvg !== null && duringAvg !== null && baselineAvg > 0) {
      liftPercent = round(((duringAvg - baselineAvg) / baselineAvg) * 100);
      if (liftPercent >= 10) {
        verdict = 'ناجح';
        verdictLevel = 'good';
      } else if (liftPercent >= -5) {
        verdict = 'تأثير محدود';
        verdictLevel = 'neutral';
      } else {
        verdict = 'أثر سلبي';
        verdictLevel = 'bad';
      }
    }

    const isActive = end >= today() && start <= today();

    return {
      ...offer,
      baselineAvgRevenue: baselineAvg !== null ? round(baselineAvg) : null,
      duringAvgRevenue: duringAvg !== null ? round(duringAvg) : null,
      liftPercent,
      verdict,
      verdictLevel,
      isActive,
    };
  });
}

function evaluateDecisions(decisions, sales) {
  return decisions.map((decision) => {
    const decisionDate = toDate(decision.date);
    const beforeStart = addDays(decisionDate, -BASELINE_WINDOW_DAYS);
    const beforeEnd = addDays(decisionDate, -1);
    const afterStart = decisionDate;
    const afterEnd = addDays(decisionDate, BASELINE_WINDOW_DAYS - 1);
    const daysSinceDecision = Math.floor((today() - decisionDate) / DAY_MS);

    const beforeAvg = avgRevenueInRange(sales, beforeStart, beforeEnd);
    const evalEnd = afterEnd < today() ? afterEnd : today();
    const afterAvg = avgRevenueInRange(sales, afterStart, evalEnd);

    let impactPercent = null;
    let verdict = 'قيد التقييم';
    let verdictLevel = 'unknown';

    if (daysSinceDecision < 3) {
      verdict = 'قيد التقييم (مبكر جدًا)';
      verdictLevel = 'unknown';
    } else if (beforeAvg !== null && afterAvg !== null && beforeAvg > 0) {
      impactPercent = round(((afterAvg - beforeAvg) / beforeAvg) * 100);
      if (impactPercent >= 8) {
        verdict = 'نتيجة إيجابية';
        verdictLevel = 'good';
      } else if (impactPercent >= -5) {
        verdict = 'نتيجة محايدة';
        verdictLevel = 'neutral';
      } else {
        verdict = 'نتيجة سلبية';
        verdictLevel = 'bad';
      }
    } else {
      verdict = 'لا توجد بيانات كافية';
    }

    return {
      ...decision,
      beforeAvgRevenue: beforeAvg !== null ? round(beforeAvg) : null,
      afterAvgRevenue: afterAvg !== null ? round(afterAvg) : null,
      impactPercent,
      verdict,
      verdictLevel,
      daysSinceDecision,
    };
  });
}

function revenueTrend(sales) {
  return [...sales]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((s) => ({ date: s.date, revenue: Number(s.revenue) || 0, ordersCount: Number(s.ordersCount) || 0 }));
}

function expenseBreakdown(expenses) {
  const byCategory = {};
  expenses.forEach((e) => {
    const key = e.category || 'other';
    byCategory[key] = (byCategory[key] || 0) + (Number(e.amount) || 0);
  });
  return Object.entries(byCategory).map(([category, total]) => ({
    category,
    label: EXPENSE_CATEGORY_LABELS[category] || category,
    total: round(total),
  }));
}

function last7vsPrevious7(sales) {
  const sorted = revenueTrend(sales);
  if (sorted.length === 0) return null;
  const end = today();
  const last7Start = addDays(end, -6);
  const prev7Start = addDays(end, -13);
  const prev7End = addDays(end, -7);

  const last7 = avgRevenueInRange(sales, last7Start, end);
  const prev7 = avgRevenueInRange(sales, prev7Start, prev7End);
  if (last7 === null || prev7 === null || prev7 === 0) return null;
  return round(((last7 - prev7) / prev7) * 100);
}

function buildRecommendations({ totalRevenue, totalExpenses, netProfit, profitMargin, expenseBreakdownData, offersEvaluated, decisionsEvaluated, weeklyTrendPercent, sales }) {
  const recommendations = [];

  if (sales.length === 0) {
    recommendations.push({
      level: 'info',
      text: 'مفيش بيانات مبيعات لسه. ابدأ بتسجيل المبيعات اليومية عشان تقدر تشوف تحليلات حقيقية عن أداء المطعم.',
    });
    return recommendations;
  }

  if (profitMargin !== null) {
    if (profitMargin < 0) {
      recommendations.push({
        level: 'bad',
        text: `المطعم بيحقق خسارة حاليًا (هامش الربح ${profitMargin}%). لازم مراجعة عاجلة للمصروفات أو الأسعار.`,
      });
    } else if (profitMargin < 10) {
      recommendations.push({
        level: 'warning',
        text: `هامش الربح منخفض (${profitMargin}%). يُنصح بمراجعة التكاليف التشغيلية أو رفع الأسعار على أصناف مختارة.`,
      });
    } else {
      recommendations.push({
        level: 'good',
        text: `هامش الربح صحي (${profitMargin}%). حافظ على مستوى المصروفات الحالي.`,
      });
    }
  }

  expenseBreakdownData.forEach((cat) => {
    if (totalRevenue > 0) {
      const pct = round((cat.total / totalRevenue) * 100);
      if (cat.category === 'salaries' && pct > 35) {
        recommendations.push({
          level: 'warning',
          text: `مصروفات الرواتب بتاخد ${pct}% من الإيرادات (المعدل الصحي عادة أقل من 30-35%). راجع جدول الشيفتات وعدد العمالة.`,
        });
      }
      if (cat.category === 'ingredients' && pct > 40) {
        recommendations.push({
          level: 'warning',
          text: `تكلفة المستلزمات والمواد الخام ${pct}% من الإيرادات. راجع أسعار الموردين أو نسب الهالك (waste) في المطبخ.`,
        });
      }
    }
  });

  if (weeklyTrendPercent !== null) {
    if (weeklyTrendPercent <= -10) {
      recommendations.push({
        level: 'bad',
        text: `المبيعات في آخر 7 أيام نازلة بنسبة ${Math.abs(weeklyTrendPercent)}% عن الأسبوع اللي قبله. محتاج تتحرك بعرض أو حملة تسويقية بسرعة.`,
      });
    } else if (weeklyTrendPercent >= 10) {
      recommendations.push({
        level: 'good',
        text: `المبيعات في آخر 7 أيام زايدة بنسبة ${weeklyTrendPercent}% عن الأسبوع اللي قبله. استمر على نفس الاستراتيجية.`,
      });
    }
  }

  const bestOffer = [...offersEvaluated]
    .filter((o) => o.liftPercent !== null)
    .sort((a, b) => b.liftPercent - a.liftPercent)[0];
  if (bestOffer && bestOffer.liftPercent >= 10) {
    recommendations.push({
      level: 'good',
      text: `عرض "${bestOffer.name}" حقق زيادة ${bestOffer.liftPercent}% في متوسط المبيعات اليومية. يُنصح بتكراره أو تمديده.`,
    });
  }

  offersEvaluated
    .filter((o) => o.isActive && o.verdictLevel === 'bad')
    .forEach((o) => {
      recommendations.push({
        level: 'bad',
        text: `عرض "${o.name}" شغال حاليًا لكن نتيجته سلبية (${o.liftPercent}%). يُنصح بمراجعته أو إيقافه بدل استنزاف الهامش.`,
      });
    });

  decisionsEvaluated
    .filter((d) => d.verdictLevel === 'bad')
    .forEach((d) => {
      recommendations.push({
        level: 'bad',
        text: `القرار "${d.title}" (${DECISION_CATEGORY_LABELS[d.category] || d.category}) نتيجته سلبية (${d.impactPercent}% في المبيعات). يستحق مراجعة أو التراجع عنه.`,
      });
    });

  decisionsEvaluated
    .filter((d) => d.verdictLevel === 'good')
    .forEach((d) => {
      recommendations.push({
        level: 'good',
        text: `القرار "${d.title}" أدى لنتيجة إيجابية (${d.impactPercent}%+). فكر في تطبيق نفس المبدأ في مجالات تانية.`,
      });
    });

  if (recommendations.length === 0) {
    recommendations.push({
      level: 'info',
      text: 'البيانات مستقرة ومفيش تنبيهات حرجة حاليًا. استمر في تسجيل البيانات بانتظام عشان التحليل يبقى أدق.',
    });
  }

  return recommendations;
}

function buildInsights(store) {
  const { sales, expenses, offers, decisions } = store;

  const totalRevenue = round(sum(sales, (s) => Number(s.revenue) || 0));
  const totalExpenses = round(sum(expenses, (e) => Number(e.amount) || 0));
  const netProfit = round(totalRevenue - totalExpenses);
  const profitMargin = totalRevenue > 0 ? round((netProfit / totalRevenue) * 100) : null;
  const totalOrders = sum(sales, (s) => Number(s.ordersCount) || 0);
  const avgOrderValue = totalOrders > 0 ? round(totalRevenue / totalOrders) : null;

  const offersEvaluated = evaluateOffers(offers, sales);
  const decisionsEvaluated = evaluateDecisions(decisions, sales);
  const trend = revenueTrend(sales);
  const breakdown = expenseBreakdown(expenses);
  const weeklyTrendPercent = last7vsPrevious7(sales);

  const recommendations = buildRecommendations({
    totalRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    expenseBreakdownData: breakdown,
    offersEvaluated,
    decisionsEvaluated,
    weeklyTrendPercent,
    sales,
  });

  return {
    kpis: {
      totalRevenue,
      totalExpenses,
      netProfit,
      profitMargin,
      avgOrderValue,
      totalOrders,
      weeklyTrendPercent,
    },
    trend,
    expenseBreakdown: breakdown,
    offers: offersEvaluated,
    decisions: decisionsEvaluated,
    recommendations,
  };
}

module.exports = {
  buildInsights,
  EXPENSE_CATEGORY_LABELS,
  DECISION_CATEGORY_LABELS,
};
