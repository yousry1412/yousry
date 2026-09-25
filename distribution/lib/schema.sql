-- ============================================================
-- نظام إدارة التوزيع - هيكل قاعدة البيانات (متعدد المنشآت والفروع)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- المنشآت والفروع ----------

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_number TEXT,
  phone TEXT,
  address TEXT,
  public_url TEXT,
  country TEXT NOT NULL DEFAULT 'مصر',
  currency TEXT NOT NULL DEFAULT 'ج.م', -- مشتقة من الدولة تلقائيًا، وقت اختيار الدولة - قابلة للتعديل يدويًا
  vat_enabled INTEGER NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 0,
  wht_enabled INTEGER NOT NULL DEFAULT 0, -- ضريبة الخصم والإضافة تحت الحساب - بتتخصم من مستحقات المورد وتتوّرد للمصلحة
  wht_rate REAL NOT NULL DEFAULT 0,
  stamp_duty_enabled INTEGER NOT NULL DEFAULT 0, -- ضريبة الدمغة - بتتضاف على فاتورة البيع
  stamp_duty_rate REAL NOT NULL DEFAULT 0,
  income_tax_enabled INTEGER NOT NULL DEFAULT 0, -- ضريبة الدخل السنوية على الأرباح - نسبة تقديرية للتقارير فقط، مفيش قيود آلية بيها
  income_tax_rate REAL NOT NULL DEFAULT 0,
  latitude REAL,
  longitude REAL,
  geofence_radius_m REAL NOT NULL DEFAULT 300,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  latitude REAL,
  longitude REAL,
  is_main INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الشركاء ----------

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id), -- NULL = شريك على مستوى الشركة كلها، وإلا شريك في فرع معين بس
  name TEXT NOT NULL,
  phone TEXT,
  share_percentage REAL NOT NULL,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الدورة المحاسبية: شجرة الحسابات والقيود ----------

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','revenue','expense')),
  parent_code TEXT,
  is_postable INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  entry_date TEXT NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id INTEGER,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  branch_id INTEGER REFERENCES branches(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  party_type TEXT, -- customer/supplier/partner/employee (يتم التحقق من القيمة في كود الخدمة مش في القاعدة، لتفادي ترحيل القيد كل ما نضيف نوع طرف جديد)
  party_id INTEGER,
  memo TEXT
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_party ON journal_lines(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_branch ON journal_lines(branch_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_company ON journal_entries(company_id);

-- ---------- الأطراف: موردين وعملاء (على مستوى المنشأة) ----------

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  latitude REAL,
  longitude REAL,
  geofence_radius_m REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  notes TEXT,
  credit_limit REAL NOT NULL DEFAULT 0,
  opening_balance REAL NOT NULL DEFAULT 0,
  latitude REAL,
  longitude REAL,
  geofence_radius_m REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- المنتجات (كتالوج على مستوى المنشأة) والمخزون (لكل فرع) ----------

CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  category_id INTEGER REFERENCES product_categories(id),
  name TEXT NOT NULL,
  sku TEXT,
  unit TEXT NOT NULL DEFAULT 'وحدة', -- الوحدة الأساسية (الصغرى) - كل الكميات والتكاليف بتتخزن بيها
  kind TEXT NOT NULL CHECK(kind IN ('trade','raw_material','manufactured')),
  sale_price REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  track_expiry INTEGER NOT NULL DEFAULT 0, -- منتج بيتلف (زي الدجاج الطازج) ولازم تتبع تاريخ صلاحيته
  photo TEXT,
  storage_method TEXT, -- طريقة التخزين السليمة (مبرّد، مجمّد، جاف بعيد عن الشمس...)
  default_branch_id INTEGER REFERENCES branches(id), -- المخزن الأساسي اللي المفروض الصنف ده يتوجّه له
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- وحدات قياس إضافية أكبر من الوحدة الأساسية (زي الكرتونة) بمعامل تحويل - قابلة للتوسع
-- لأكتر من وحدتين مستقبلًا بدون تعديل الهيكل (مش مجرد عمودين "كبرى/صغرى")
CREATE TABLE IF NOT EXISTS product_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_name TEXT NOT NULL,
  factor REAL NOT NULL, -- كام وحدة أساسية في الوحدة دي (مثلًا كرتونة = 24 قطعة)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_stock (
  product_id INTEGER NOT NULL REFERENCES products(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  qty_on_hand REAL NOT NULL DEFAULT 0,
  cost_price REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, branch_id)
);

CREATE TABLE IF NOT EXISTS bom_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  component_id INTEGER NOT NULL REFERENCES products(id),
  qty_per_unit REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  movement_date TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL,
  ref_type TEXT NOT NULL,
  ref_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id, branch_id);

-- ---------- المشتريات ----------

CREATE TABLE IF NOT EXISTS purchase_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  invoice_no TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  invoice_date TEXT NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  paid_from TEXT NOT NULL DEFAULT 'cash' CHECK(paid_from IN ('cash','bank')),
  subtotal REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  wht_amount REAL NOT NULL DEFAULT 0, -- ضريبة خصم وإضافة محجوزة من مستحقات المورد لصالح المصلحة
  total REAL NOT NULL DEFAULT 0,
  latitude REAL,
  longitude REAL,
  created_by_user_id INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL, -- بالوحدة الأساسية دايمًا (بعد التحويل لو اتسجل ببند بوحدة أكبر)
  unit_cost REAL NOT NULL, -- تكلفة الوحدة الأساسية دايمًا
  line_total REAL NOT NULL,
  unit_id INTEGER REFERENCES product_units(id), -- الوحدة اللي المستخدم اختارها فعليًا (لو أكبر من الأساسية) - للعرض بس
  unit_qty REAL -- الكمية بنفس الوحدة دي - للعرض بس
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  return_no TEXT UNIQUE NOT NULL,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  purchase_invoice_id INTEGER REFERENCES purchase_invoices(id),
  return_date TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  refund_to TEXT NOT NULL DEFAULT 'cash' CHECK(refund_to IN ('cash','bank')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL,
  line_total REAL NOT NULL
);

-- ---------- تتبع دفعات (batches) الأصناف اللي بتتلف - رقابة صلاحية بجانب المخزون العادي ----------
-- طبقة معلوماتية موازية للمخزون (مش بديلة له) - بتتبع الكمية المتبقية من كل دفعة وتاريخ صلاحيتها
-- عشان تنبّه بالصلاحيات القريبة أو المنتهية، من غير ما تلمس محرك تكلفة المخزون (متوسط مرجّح) الأساسي.

CREATE TABLE IF NOT EXISTS product_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  batch_no TEXT,
  production_date TEXT,
  expiry_date TEXT NOT NULL,
  qty_received REAL NOT NULL,
  qty_remaining REAL NOT NULL,
  purchase_invoice_id INTEGER REFERENCES purchase_invoices(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_product_batches_lookup ON product_batches(product_id, branch_id, expiry_date);

-- ---------- عقود التوريد/الشراء مع الموردين ----------
-- عقد سعر ثابت (أو شروط) مع مورد معين لصنف أو أكتر، لفترة محددة أو مفتوحة - رقابة على
-- الأسعار المتفق عليها بدل ما تعتمد على ذاكرة أو ثقة وقت كل فاتورة شراء.

CREATE TABLE IF NOT EXISTS supplier_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  contract_no TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT, -- فاضي = عقد مفتوح بدون تاريخ نهاية محدد
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS supplier_contract_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES supplier_contracts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  agreed_price REAL NOT NULL,
  notes TEXT
);

-- ---------- قوائم أسعار خاصة بالعملاء (تسعير تفضيلي/بالجملة متفق عليه) ----------

CREATE TABLE IF NOT EXISTS customer_price_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  list_no TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customer_price_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES customer_price_lists(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  price REAL NOT NULL,
  notes TEXT
);

-- ---------- سجل نشاط إداري (رقابة "مين عمل إيه" على العمليات الإدارية الحساسة) ----------

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_log_company ON activity_log(company_id, created_at);

-- ---------- التصنيع ----------

CREATE TABLE IF NOT EXISTS production_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  order_no TEXT UNIQUE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty_produced REAL NOT NULL,
  order_date TEXT NOT NULL,
  extra_cost REAL NOT NULL DEFAULT 0,
  paid_from TEXT NOT NULL DEFAULT 'cash' CHECK(paid_from IN ('cash','bank')),
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS production_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES production_orders(id) ON DELETE CASCADE,
  component_id INTEGER NOT NULL REFERENCES products(id),
  qty_used REAL NOT NULL,
  unit_cost REAL NOT NULL
);

-- ---------- السيارات والرحلات (على مستوى الفرع) ----------

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  name TEXT NOT NULL,
  ownership TEXT NOT NULL CHECK(ownership IN ('owned','rented')),
  driver_name TEXT, -- نسخة معروضة من اسم السائق الافتراضي، بتتحدّث تلقائيًا من default_driver_id
  default_driver_id INTEGER REFERENCES employees(id), -- السائق الافتراضي كحساب موظف حقيقي، مش اسم نصي
  plate_number TEXT,
  capacity TEXT, -- وصف حجم/حمولة السيارة (مثلًا "3 طن" أو "دبل كابينة")
  photo TEXT,
  monthly_rent REAL NOT NULL DEFAULT 0,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  trip_no TEXT UNIQUE NOT NULL,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  responsible_employee_id INTEGER REFERENCES employees(id),
  trip_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','settled')),
  odometer_start REAL,
  odometer_end REAL,
  odometer_start_photo TEXT,
  odometer_end_photo TEXT,
  notes TEXT,
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_loads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty_loaded REAL NOT NULL,
  unit_cost REAL NOT NULL,
  sale_value REAL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  approved_by_user_id INTEGER REFERENCES users(id),
  approved_at TEXT,
  rejected_reason TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty_returned REAL NOT NULL,
  unit_cost REAL NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('fuel','rent','maintenance','toll','other')),
  amount REAL NOT NULL,
  -- 'cash'/'bank' = من خزنة المنشأة، 'driver_custody' = من الكاش اللي في عهدة المسؤول عن الرحلة (تحصيلات ميدانية)
  paid_from TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  latitude REAL,
  longitude REAL,
  photo TEXT, -- صورة فاتورة/إيصال المصروف - إجبارية لما السائق يسجّله من وضع الميدان
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- المبيعات / التوزيع عند العميل ----------

CREATE TABLE IF NOT EXISTS sales_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  invoice_no TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  trip_id INTEGER REFERENCES trips(id),
  invoice_date TEXT NOT NULL,
  paid_amount REAL NOT NULL DEFAULT 0,
  paid_to TEXT NOT NULL DEFAULT 'cash' CHECK(paid_to IN ('cash','bank')),
  subtotal REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  stamp_duty_amount REAL NOT NULL DEFAULT 0, -- ضريبة الدمغة المضافة على الفاتورة
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  latitude REAL,
  longitude REAL,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL, -- بالوحدة الأساسية دايمًا (بعد التحويل لو اتسجل ببند بوحدة أكبر)
  unit_price REAL NOT NULL, -- سعر الوحدة الأساسية دايمًا
  unit_cost REAL NOT NULL,
  line_total REAL NOT NULL,
  unit_id INTEGER REFERENCES product_units(id), -- الوحدة اللي المستخدم اختارها فعليًا (لو أكبر من الأساسية) - للعرض بس
  unit_qty REAL -- الكمية بنفس الوحدة دي - للعرض بس
);

CREATE TABLE IF NOT EXISTS sales_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  return_no TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  sales_invoice_id INTEGER REFERENCES sales_invoices(id),
  return_date TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  refund_amount REAL NOT NULL DEFAULT 0,
  refund_from TEXT NOT NULL DEFAULT 'cash' CHECK(refund_from IN ('cash','bank')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost REAL NOT NULL,
  line_total REAL NOT NULL
);

-- ---------- التوالف / الهالك ----------

CREATE TABLE IF NOT EXISTS damages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  damage_no TEXT UNIQUE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL,
  damage_date TEXT NOT NULL,
  reason TEXT,
  responsible_employee_id INTEGER REFERENCES employees(id), -- المسبب (لو موظف مسجّل)
  responsible_name TEXT, -- اسم المسبب لو مش موظف مسجّل في النظام
  photo_data TEXT, -- صورة التلف (data URL base64) - دليل موثّق وقت التسجيل
  trip_id INTEGER REFERENCES trips(id),
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  is_reversed INTEGER NOT NULL DEFAULT 0,
  reversed_at TEXT,
  reversed_by_user_id INTEGER REFERENCES users(id),
  reversal_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- تحويلات وتسويات المخزون بين الفروع ----------

CREATE TABLE IF NOT EXISTS stock_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  transfer_no TEXT UNIQUE NOT NULL,
  from_branch_id INTEGER NOT NULL REFERENCES branches(id),
  to_branch_id INTEGER NOT NULL REFERENCES branches(id),
  transfer_date TEXT NOT NULL,
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  adjustment_no TEXT UNIQUE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty_before REAL NOT NULL,
  qty_counted REAL NOT NULL,
  qty_diff REAL NOT NULL,
  unit_cost REAL NOT NULL,
  adjustment_date TEXT NOT NULL,
  reason TEXT,
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- المصروفات العامة ----------

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  expense_no TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('rent','salaries','utilities','maintenance','fuel','other')),
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  paid_from TEXT NOT NULL DEFAULT 'cash' CHECK(paid_from IN ('cash','bank')),
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- سندات القبض والصرف ----------

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  voucher_no TEXT UNIQUE NOT NULL,
  voucher_type TEXT NOT NULL, -- receipt/payment/advance/advance_settlement/custody_out/custody_return
  party_type TEXT NOT NULL, -- customer/supplier/partner/employee/other
  party_id INTEGER,
  party_name TEXT,
  other_account_code TEXT,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash' CHECK(method IN ('cash','bank')),
  voucher_date TEXT NOT NULL,
  trip_id INTEGER REFERENCES trips(id), -- لو السند ده تحصيل ميداني أثناء رحلة توزيع مفتوحة
  notes TEXT,
  created_by_user_id INTEGER REFERENCES users(id),
  is_reversed INTEGER NOT NULL DEFAULT 0,
  reversed_at TEXT,
  reversed_by_user_id INTEGER REFERENCES users(id),
  reversal_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الموظفون (HR) ----------

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  name TEXT NOT NULL,
  phone TEXT,
  job_title TEXT,
  salary REAL NOT NULL DEFAULT 0,
  hire_date TEXT,
  passport_number TEXT,
  residency_number TEXT,
  passport_photo TEXT,
  residency_photo TEXT,
  photo TEXT, -- صورة شخصية (بروفايل) للموظف - مختلفة عن صور المستندات
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الإقفال المالي وتوزيع الأرباح على الشركاء ----------

CREATE TABLE IF NOT EXISTS fiscal_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id), -- NULL = إقفال على مستوى الشركة كلها (كل الفروع مع بعض)
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  revenue_total REAL NOT NULL,
  expense_total REAL NOT NULL,
  net_profit REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fiscal_closing_distributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  closing_id INTEGER NOT NULL REFERENCES fiscal_closings(id) ON DELETE CASCADE,
  partner_id INTEGER NOT NULL REFERENCES partners(id),
  share_percentage REAL NOT NULL,
  amount REAL NOT NULL
);

-- ---------- واتساب ----------

CREATE TABLE IF NOT EXISTS whatsapp_config (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id),
  access_token TEXT,
  phone_number_id TEXT,
  template_name TEXT NOT NULL DEFAULT 'invoice_notification',
  template_lang TEXT NOT NULL DEFAULT 'ar',
  default_country_code TEXT NOT NULL DEFAULT '20',
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS whatsapp_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  sales_invoice_id INTEGER REFERENCES sales_invoices(id),
  to_phone TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent','failed')),
  message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- إعدادات عامة ----------

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- ---------- المستخدمون وتسجيل الدخول ----------

-- company_id/branch_id = NULL يعني المستخدم مش مقفول على منشأة/فرع معين
-- (بيقدر يبدّل بينهم من أعلى الصفحة زي المالك). لو محدد، المستخدم بيتقفل
-- عليه إجباريًا بغض النظر عن أي اختيار في الواجهة.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','accountant','sales','warehouse','partner')),
  phone TEXT,
  notify_new_invoices INTEGER NOT NULL DEFAULT 0,
  notify_trip_start INTEGER NOT NULL DEFAULT 0,
  notify_new_expenses INTEGER NOT NULL DEFAULT 0,
  notify_expiry_alerts INTEGER NOT NULL DEFAULT 0,
  commission_pct REAL, -- نسبة عمولة المندوب/السائق من مبيعاته (فاضي = بدون عمولة)
  partner_id INTEGER REFERENCES partners(id), -- لو الصلاحية "شريك" - بيربط الحساب بسجل الشريك بتاعه
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

-- ---------- تتبع مواقع الرحلات (خرائط جوجل) ----------

-- نقاط GPS متتابعة (بصمة مسار) بتتسجل من موبايل السائق أثناء الرحلة المفتوحة
CREATE TABLE IF NOT EXISTS driver_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  trip_id INTEGER NOT NULL REFERENCES trips(id),
  user_id INTEGER REFERENCES users(id),
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_driver_locations_trip ON driver_locations(trip_id, recorded_at);

CREATE TABLE IF NOT EXISTS map_config (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id),
  google_maps_api_key TEXT,
  updated_at TEXT
);
