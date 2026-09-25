// شجرة الحسابات الافتراضية + أكواد الحسابات المستخدمة في الترحيل الآلي

const ACC = {
  CASH: '1010',
  BANK: '1020',
  PETTY_CUSTODY: '1030', // عهدة نقدية (موظفين/مناديب)
  EMP_ADVANCES: '1040', // سلف الموظفين (تُخصم من الراتب لاحقًا)
  VAT_INPUT: '1045', // ضريبة القيمة المضافة على المشتريات (قابلة للخصم)
  AR: '1100', // عملاء
  INV_RAW: '1210', // مخزون مواد خام
  INV_FG: '1220', // مخزون إنتاج تام (منتجات مصنعة)
  INV_TRADE: '1230', // مخزون بضاعة جاهزة (تُباع كما اشتُريت)
  CUSTODY: '1400', // بضاعة تحت التوزيع (عهدة السيارات)
  FIXED_ASSETS: '1500', // سيارات ومعدات
  AP: '2100', // موردون
  ACCRUED: '2200', // مصروفات مستحقة
  TAXES_PAYABLE: '2300', // ضرائب ومستحقات حكومية
  VAT_OUTPUT: '2310', // ضريبة القيمة المضافة على المبيعات (مستحقة لمصلحة الضرائب)
  CAPITAL: '3100', // رأس مال الشركاء
  OPENING_EQUITY: '3200', // أرصدة افتتاحية / أرباح مرحلة
  DRAWINGS: '3300', // مسحوبات الشركاء الشخصية
  RETAINED_EARNINGS: '3400', // أرباح مرحلة موزعة على الشركاء
  SALES: '4100', // إيرادات المبيعات
  SALES_RETURNS: '4200', // مردودات ومسموحات مبيعات
  OTHER_INCOME: '4300', // إيرادات أخرى
  COGS: '5100', // تكلفة البضاعة المباعة
  DAMAGE_EXP: '5200', // مصروف التوالف والهالك
  TRANSPORT_EXP: '5300', // مصروفات النقل والتوزيع
  SALARIES_EXP: '5400', // رواتب وأجور
  RENT_EXP: '5500', // إيجارات
  MFG_EXP: '5600', // مصروفات تصنيع (عمالة/تشغيل)
  UTILITIES_EXP: '5700', // مرافق
  MISC_EXP: '5900', // مصروفات أخرى متنوعة
};

const CHART_OF_ACCOUNTS = [
  { code: '1000', name: 'الأصول', type: 'asset', parent_code: null, is_postable: 0 },
  { code: ACC.CASH, name: 'الصندوق (نقدية)', type: 'asset', parent_code: '1000', is_postable: 1 },
  { code: ACC.BANK, name: 'البنك', type: 'asset', parent_code: '1000', is_postable: 1 },
  { code: ACC.PETTY_CUSTODY, name: 'عهدة نقدية (موظفين/مناديب)', type: 'asset', parent_code: '1000', is_postable: 1 },
  { code: ACC.EMP_ADVANCES, name: 'سلف الموظفين', type: 'asset', parent_code: '1000', is_postable: 1 },
  { code: ACC.VAT_INPUT, name: 'ضريبة القيمة المضافة على المشتريات (قابلة للخصم)', type: 'asset', parent_code: '1000', is_postable: 1 },
  { code: ACC.AR, name: 'عملاء - حسابات مدينة', type: 'asset', parent_code: '1000', is_postable: 1 },
  { code: ACC.INV_RAW, name: 'مخزون المواد الخام', type: 'asset', parent_code: '1000', is_postable: 1 },
  { code: ACC.INV_FG, name: 'مخزون الإنتاج التام', type: 'asset', parent_code: '1000', is_postable: 1 },
  { code: ACC.INV_TRADE, name: 'مخزون البضاعة الجاهزة', type: 'asset', parent_code: '1000', is_postable: 1 },
  { code: ACC.CUSTODY, name: 'بضاعة تحت التوزيع (عهدة السيارات)', type: 'asset', parent_code: '1000', is_postable: 1 },
  { code: ACC.FIXED_ASSETS, name: 'أصول ثابتة - سيارات ومعدات', type: 'asset', parent_code: '1000', is_postable: 1 },

  { code: '2000', name: 'الخصوم', type: 'liability', parent_code: null, is_postable: 0 },
  { code: ACC.AP, name: 'موردون - حسابات دائنة', type: 'liability', parent_code: '2000', is_postable: 1 },
  { code: ACC.ACCRUED, name: 'مصروفات مستحقة', type: 'liability', parent_code: '2000', is_postable: 1 },
  { code: ACC.TAXES_PAYABLE, name: 'ضرائب ومستحقات حكومية', type: 'liability', parent_code: '2000', is_postable: 1 },
  { code: ACC.VAT_OUTPUT, name: 'ضريبة القيمة المضافة على المبيعات (مستحقة للمصلحة)', type: 'liability', parent_code: '2000', is_postable: 1 },

  { code: '3000', name: 'حقوق الملكية', type: 'equity', parent_code: null, is_postable: 0 },
  { code: ACC.CAPITAL, name: 'رأس مال الشركاء', type: 'equity', parent_code: '3000', is_postable: 1 },
  { code: ACC.OPENING_EQUITY, name: 'أرصدة افتتاحية وأرباح مرحلة', type: 'equity', parent_code: '3000', is_postable: 1 },
  { code: ACC.DRAWINGS, name: 'مسحوبات الشركاء الشخصية', type: 'equity', parent_code: '3000', is_postable: 1 },
  { code: ACC.RETAINED_EARNINGS, name: 'أرباح موزعة على الشركاء', type: 'equity', parent_code: '3000', is_postable: 1 },

  { code: '4000', name: 'الإيرادات', type: 'revenue', parent_code: null, is_postable: 0 },
  { code: ACC.SALES, name: 'إيرادات المبيعات', type: 'revenue', parent_code: '4000', is_postable: 1 },
  { code: ACC.SALES_RETURNS, name: 'مردودات ومسموحات مبيعات', type: 'revenue', parent_code: '4000', is_postable: 1 },
  { code: ACC.OTHER_INCOME, name: 'إيرادات أخرى', type: 'revenue', parent_code: '4000', is_postable: 1 },

  { code: '5000', name: 'التكاليف والمصروفات', type: 'expense', parent_code: null, is_postable: 0 },
  { code: ACC.COGS, name: 'تكلفة البضاعة المباعة', type: 'expense', parent_code: '5000', is_postable: 1 },
  { code: ACC.DAMAGE_EXP, name: 'مصروف التوالف والهالك', type: 'expense', parent_code: '5000', is_postable: 1 },
  { code: ACC.TRANSPORT_EXP, name: 'مصروفات النقل والتوزيع', type: 'expense', parent_code: '5000', is_postable: 1 },
  { code: ACC.SALARIES_EXP, name: 'رواتب وأجور', type: 'expense', parent_code: '5000', is_postable: 1 },
  { code: ACC.RENT_EXP, name: 'إيجارات', type: 'expense', parent_code: '5000', is_postable: 1 },
  { code: ACC.MFG_EXP, name: 'مصروفات تصنيع (عمالة/تشغيل)', type: 'expense', parent_code: '5000', is_postable: 1 },
  { code: ACC.UTILITIES_EXP, name: 'مرافق (كهرباء / مياه / اتصالات)', type: 'expense', parent_code: '5000', is_postable: 1 },
  { code: ACC.MISC_EXP, name: 'مصروفات أخرى متنوعة', type: 'expense', parent_code: '5000', is_postable: 1 },
];

const PRODUCT_KIND_TO_INVENTORY_ACC = {
  raw_material: ACC.INV_RAW,
  manufactured: ACC.INV_FG,
  trade: ACC.INV_TRADE,
};

const EXPENSE_CATEGORY_TO_ACC = {
  rent: ACC.RENT_EXP,
  salaries: ACC.SALARIES_EXP,
  utilities: ACC.UTILITIES_EXP,
  maintenance: ACC.TRANSPORT_EXP,
  fuel: ACC.TRANSPORT_EXP,
  other: ACC.MISC_EXP,
};

const TRIP_EXPENSE_CATEGORY_TO_ACC = {
  fuel: ACC.TRANSPORT_EXP,
  rent: ACC.TRANSPORT_EXP,
  maintenance: ACC.TRANSPORT_EXP,
  toll: ACC.TRANSPORT_EXP,
  other: ACC.MISC_EXP,
};

module.exports = {
  ACC,
  CHART_OF_ACCOUNTS,
  PRODUCT_KIND_TO_INVENTORY_ACC,
  EXPENSE_CATEGORY_TO_ACC,
  TRIP_EXPENSE_CATEGORY_TO_ACC,
};
