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
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_main INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الشركاء ----------

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
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
  party_type TEXT CHECK(party_type IN ('customer','supplier','partner') OR party_type IS NULL),
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
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- المنتجات (كتالوج على مستوى المنشأة) والمخزون (لكل فرع) ----------

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  sku TEXT,
  unit TEXT NOT NULL DEFAULT 'وحدة',
  kind TEXT NOT NULL CHECK(kind IN ('trade','raw_material','manufactured')),
  sale_price REAL NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
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
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL,
  unit_cost REAL NOT NULL,
  line_total REAL NOT NULL
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
  driver_name TEXT,
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
  trip_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','settled')),
  notes TEXT,
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS trip_loads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty_loaded REAL NOT NULL,
  unit_cost REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty_returned REAL NOT NULL,
  unit_cost REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('fuel','rent','maintenance','toll','other')),
  amount REAL NOT NULL,
  paid_from TEXT NOT NULL DEFAULT 'cash' CHECK(paid_from IN ('cash','bank')),
  notes TEXT,
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
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES sales_invoices(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost REAL NOT NULL,
  line_total REAL NOT NULL
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
  trip_id INTEGER REFERENCES trips(id),
  notes TEXT,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- سندات القبض والصرف ----------

CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  branch_id INTEGER REFERENCES branches(id),
  voucher_no TEXT UNIQUE NOT NULL,
  voucher_type TEXT NOT NULL CHECK(voucher_type IN ('receipt','payment')),
  party_type TEXT NOT NULL CHECK(party_type IN ('customer','supplier','partner','other')),
  party_id INTEGER,
  party_name TEXT,
  other_account_code TEXT,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash' CHECK(method IN ('cash','bank')),
  voucher_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الإقفال المالي وتوزيع الأرباح على الشركاء ----------

CREATE TABLE IF NOT EXISTS fiscal_closings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
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
