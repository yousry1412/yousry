const ROLE_GROUPS = {
  FIN: ['owner', 'accountant'],
  SALES_G: ['owner', 'accountant', 'sales'],
  WH_G: ['owner', 'accountant', 'warehouse'],
  ALL: ['owner', 'accountant', 'sales', 'warehouse'],
  OWNER: ['owner'],
};

const NAV = [
  { hash: '#/dashboard', label: 'لوحة التحكم', icon: '📊', roles: ROLE_GROUPS.FIN },
  { hash: '#/sales', label: 'فواتير المبيعات', icon: '🧾', roles: ROLE_GROUPS.SALES_G },
  { hash: '#/trips', label: 'رحلات التوزيع', icon: '🚚', roles: ROLE_GROUPS.ALL },
  { hash: '#/purchases', label: 'فواتير الشراء', icon: '🛒', roles: ROLE_GROUPS.WH_G },
  { hash: '#/production', label: 'أوامر التصنيع', icon: '🏭', roles: ROLE_GROUPS.WH_G },
  { hash: '#/products', label: 'المنتجات والمخزون', icon: '📦', roles: ROLE_GROUPS.ALL },
  { hash: '#/customers', label: 'العملاء', icon: '👥', roles: ROLE_GROUPS.SALES_G },
  { hash: '#/suppliers', label: 'الموردين', icon: '🏢', roles: ROLE_GROUPS.WH_G },
  { hash: '#/vehicles', label: 'السيارات', icon: '🚙', roles: ROLE_GROUPS.ALL },
  { hash: '#/warehouses', label: 'المخازن وعهدة السيارات', icon: '🏬', roles: ROLE_GROUPS.WH_G },
  { hash: '#/contracts', label: 'عقود التوريد والشراء', icon: '📄', roles: ROLE_GROUPS.WH_G },
  { hash: '#/damages', label: 'التوالف والهالك', icon: '⚠️', roles: ROLE_GROUPS.ALL },
  { hash: '#/expenses', label: 'المصروفات العامة', icon: '💸', roles: ROLE_GROUPS.FIN },
  { hash: '#/vouchers', label: 'سندات القبض والصرف', icon: '🧮', roles: ROLE_GROUPS.FIN },
  { hash: '#/treasury', label: 'الخزنة الرئيسية', icon: '🏦', roles: ROLE_GROUPS.FIN },
  { hash: '#/employees', label: 'الموظفون (سلف وعهدات)', icon: '🧑‍💼', roles: ROLE_GROUPS.FIN },
  { hash: '#/stock-ops', label: 'تحويل وجرد المخزون', icon: '🔄', roles: ROLE_GROUPS.WH_G },
  { hash: '#/accounting', label: 'الحسابات والتقارير', icon: '📚', roles: ROLE_GROUPS.FIN },
  { hash: '#/maps', label: 'الخريطة', icon: '🗺️', roles: ROLE_GROUPS.FIN },
  { hash: '#/settings', label: 'المنشآت والفروع والشركاء', icon: '⚙️', roles: ROLE_GROUPS.OWNER },
];

function currentRole() {
  const user = Auth.getUser();
  return user ? user.role : null;
}

function firstAllowedHash() {
  const role = currentRole();
  const item = NAV.find((n) => n.roles.includes(role));
  return item ? item.hash : '#/dashboard';
}

const ROUTES = [
  { re: /^#\/dashboard$/, title: 'لوحة التحكم', render: () => Pages.dashboard() },

  { re: /^#\/customers$/, title: 'العملاء', render: () => Pages.customersList() },
  { re: /^#\/customers\/(\d+)$/, title: 'كشف حساب عميل', render: (m) => Pages.customerStatement(m[1]) },

  { re: /^#\/suppliers$/, title: 'الموردين', render: () => Pages.suppliersList() },
  { re: /^#\/suppliers\/(\d+)$/, title: 'كشف حساب مورد', render: (m) => Pages.supplierStatement(m[1]) },

  { re: /^#\/products$/, title: 'المنتجات والمخزون', render: () => Pages.productsList() },
  { re: /^#\/products\/(\d+)$/, title: 'تفاصيل المنتج', render: (m) => Pages.productDetail(m[1]) },

  { re: /^#\/purchases$/, title: 'فواتير الشراء', render: () => Pages.purchasesList() },
  { re: /^#\/purchases\/new$/, title: 'فاتورة شراء جديدة', render: () => Pages.purchaseNew() },
  { re: /^#\/purchases\/(\d+)$/, title: 'فاتورة شراء', render: (m) => Pages.purchaseDetail(m[1]) },

  { re: /^#\/production$/, title: 'أوامر التصنيع', render: () => Pages.productionList() },
  { re: /^#\/production\/new$/, title: 'أمر تصنيع جديد', render: () => Pages.productionNew() },
  { re: /^#\/production\/(\d+)$/, title: 'أمر تصنيع', render: (m) => Pages.productionDetail(m[1]) },

  { re: /^#\/vehicles$/, title: 'السيارات', render: () => Pages.vehiclesList() },
  { re: /^#\/warehouses$/, title: 'المخازن وعهدة السيارات', render: () => Pages.warehousesHome() },
  { re: /^#\/contracts$/, title: 'عقود التوريد والشراء', render: () => Pages.contractsList() },

  { re: /^#\/trips$/, title: 'رحلات التوزيع', render: () => Pages.tripsList() },
  { re: /^#\/trips\/new$/, title: 'رحلة جديدة', render: () => Pages.tripNew() },
  { re: /^#\/trips\/(\d+)$/, title: 'تفاصيل الرحلة', render: (m) => Pages.tripDetail(m[1]) },
  { re: /^#\/trips\/(\d+)\/field$/, title: 'وضع السائق', render: (m) => Pages.tripField(m[1]) },

  { re: /^#\/sales$/, title: 'فواتير المبيعات', render: () => Pages.salesList() },
  { re: /^#\/sales\/new(?:\?.*)?$/, title: 'فاتورة مبيعات جديدة', render: () => Pages.salesNew() },
  { re: /^#\/sales\/(\d+)$/, title: 'فاتورة مبيعات', render: (m) => Pages.salesDetail(m[1]) },

  { re: /^#\/damages$/, title: 'التوالف والهالك', render: () => Pages.damagesList() },
  { re: /^#\/expenses$/, title: 'المصروفات العامة', render: () => Pages.expensesList() },
  { re: /^#\/vouchers$/, title: 'سندات القبض والصرف', render: () => Pages.vouchersList() },
  { re: /^#\/treasury$/, title: 'الخزنة الرئيسية', render: () => Pages.treasuryHome() },
  { re: /^#\/employees$/, title: 'الموظفون', render: () => Pages.employeesList() },
  { re: /^#\/employees\/(\d+)$/, title: 'كشف حساب موظف', render: (m) => Pages.employeeStatement(m[1]) },

  { re: /^#\/accounting$/, title: 'الحسابات والتقارير', render: () => Pages.accountingHome() },
  { re: /^#\/maps$/, title: 'الخريطة', render: () => Pages.mapsHome() },

  { re: /^#\/stock-ops$/, title: 'تحويل وجرد المخزون', render: () => Pages.stockOpsHome() },
  { re: /^#\/settings$/, title: 'المنشآت والفروع والشركاء', render: () => Pages.settingsHome() },

  { re: /^#\/print\/sale\/(\d+)$/, title: 'طباعة فاتورة', render: (m) => Pages.printSale(m[1]) },
  { re: /^#\/print\/purchase\/(\d+)$/, title: 'طباعة فاتورة شراء', render: (m) => Pages.printPurchase(m[1]) },
];

function renderNav() {
  const role = currentRole();
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV.filter((item) => item.roles.includes(role))
    .map(
      (item) => `<a class="nav-item" data-hash="${item.hash}" href="${item.hash}">
      <span class="nav-icon">${item.icon}</span><span>${item.label}</span>
    </a>`
    )
    .join('');
}

function updateActiveNav(hash) {
  document.querySelectorAll('.nav-item').forEach((el) => {
    const base = '#/' + (hash.split('/')[1] || '');
    el.classList.toggle('active', el.dataset.hash === base || el.dataset.hash === hash);
  });
}

async function router() {
  if (!location.hash) {
    location.hash = firstAllowedHash();
    return router();
  }
  let hash = location.hash;
  const content = document.getElementById('content');
  const match = ROUTES.find((r) => r.re.test(hash));

  document.getElementById('sidebar').classList.remove('open');

  if (!match) {
    location.hash = firstAllowedHash();
    return;
  }

  document.getElementById('pageTitle').textContent = match.title;
  updateActiveNav(hash);

  try {
    content.innerHTML = '<div class="empty-state">جارِ التحميل...</div>';
    const m = hash.match(match.re);
    const html = await match.render(m);
    if (typeof html === 'string') content.innerHTML = html;
  } catch (err) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">تعذّر تحميل الصفحة: ${UI.escapeHtml(err.message)}</p></div>`;
  }
}

const ROLE_LABELS = { owner: 'مالك', accountant: 'محاسب', sales: 'مندوب مبيعات', warehouse: 'أمين مخزن' };

function renderTopUser() {
  const user = Auth.getUser();
  if (!user) return;
  document.getElementById('topUser').textContent = `${user.username} (${ROLE_LABELS[user.role] || user.role})`;
}

function initClock() {
  const el = document.getElementById('topDate');
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  el.textContent = new Date().toLocaleDateString('ar-EG', opts);
}

function renderContextSwitcher() {
  const user = Auth.getUser();
  const companySelect = document.getElementById('companySelect');
  const branchSelect = document.getElementById('branchSelect');
  companySelect.innerHTML = UI.optionsHtml(Context.getCompanies(), 'id', 'name', Context.getCompanyId());
  branchSelect.innerHTML = UI.optionsHtml(Context.getBranches(), 'id', 'name', Context.getBranchId());
  companySelect.disabled = !!(user && user.company_id);
  branchSelect.disabled = !!(user && user.branch_id);
}

function wireContextSwitcher() {
  document.getElementById('companySelect').addEventListener('change', async (e) => {
    await Context.setCompany(e.target.value);
    renderContextSwitcher();
    router();
  });
  document.getElementById('branchSelect').addEventListener('change', (e) => {
    Context.setBranch(e.target.value);
    router();
  });
}

let appInitialized = false;

async function startApp() {
  await Context.init();
  renderNav();
  renderContextSwitcher();
  renderTopUser();
  initClock();
  router();

  if (appInitialized) return;
  appInitialized = true;
  wireContextSwitcher();
  window.addEventListener('hashchange', router);
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  document.getElementById('logoutBtn').addEventListener('click', () => Auth.logout());
}

document.addEventListener('DOMContentLoaded', () => {
  Auth.init(startApp);
});
