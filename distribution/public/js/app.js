const NAV = [
  { hash: '#/dashboard', label: 'لوحة التحكم', icon: '📊' },
  { hash: '#/sales', label: 'فواتير المبيعات', icon: '🧾' },
  { hash: '#/trips', label: 'رحلات التوزيع', icon: '🚚' },
  { hash: '#/purchases', label: 'فواتير الشراء', icon: '🛒' },
  { hash: '#/production', label: 'أوامر التصنيع', icon: '🏭' },
  { hash: '#/products', label: 'المنتجات والمخزون', icon: '📦' },
  { hash: '#/customers', label: 'العملاء', icon: '👥' },
  { hash: '#/suppliers', label: 'الموردين', icon: '🏢' },
  { hash: '#/vehicles', label: 'السيارات', icon: '🚙' },
  { hash: '#/damages', label: 'التوالف والهالك', icon: '⚠️' },
  { hash: '#/expenses', label: 'المصروفات العامة', icon: '💸' },
  { hash: '#/vouchers', label: 'سندات القبض والصرف', icon: '🧮' },
  { hash: '#/accounting', label: 'الحسابات والتقارير', icon: '📚' },
];

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

  { re: /^#\/trips$/, title: 'رحلات التوزيع', render: () => Pages.tripsList() },
  { re: /^#\/trips\/new$/, title: 'رحلة جديدة', render: () => Pages.tripNew() },
  { re: /^#\/trips\/(\d+)$/, title: 'تفاصيل الرحلة', render: (m) => Pages.tripDetail(m[1]) },

  { re: /^#\/sales$/, title: 'فواتير المبيعات', render: () => Pages.salesList() },
  { re: /^#\/sales\/new(?:\?.*)?$/, title: 'فاتورة مبيعات جديدة', render: () => Pages.salesNew() },
  { re: /^#\/sales\/(\d+)$/, title: 'فاتورة مبيعات', render: (m) => Pages.salesDetail(m[1]) },

  { re: /^#\/damages$/, title: 'التوالف والهالك', render: () => Pages.damagesList() },
  { re: /^#\/expenses$/, title: 'المصروفات العامة', render: () => Pages.expensesList() },
  { re: /^#\/vouchers$/, title: 'سندات القبض والصرف', render: () => Pages.vouchersList() },

  { re: /^#\/accounting$/, title: 'الحسابات والتقارير', render: () => Pages.accountingHome() },

  { re: /^#\/print\/sale\/(\d+)$/, title: 'طباعة فاتورة', render: (m) => Pages.printSale(m[1]) },
  { re: /^#\/print\/purchase\/(\d+)$/, title: 'طباعة فاتورة شراء', render: (m) => Pages.printPurchase(m[1]) },
];

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV.map(
    (item) => `<a class="nav-item" data-hash="${item.hash}" href="${item.hash}">
      <span class="nav-icon">${item.icon}</span><span>${item.label}</span>
    </a>`
  ).join('');
}

function updateActiveNav(hash) {
  document.querySelectorAll('.nav-item').forEach((el) => {
    const base = '#/' + (hash.split('/')[1] || '');
    el.classList.toggle('active', el.dataset.hash === base || el.dataset.hash === hash);
  });
}

async function router() {
  let hash = location.hash || '#/dashboard';
  const content = document.getElementById('content');
  const match = ROUTES.find((r) => r.re.test(hash));

  document.getElementById('sidebar').classList.remove('open');

  if (!match) {
    location.hash = '#/dashboard';
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

function initClock() {
  const el = document.getElementById('topDate');
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  el.textContent = new Date().toLocaleDateString('ar-EG', opts);
}

document.addEventListener('DOMContentLoaded', () => {
  renderNav();
  initClock();
  window.addEventListener('hashchange', router);
  router();

  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
});
