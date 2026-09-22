var Pages = window.Pages || {};

const ACCT_TABS = [
  { key: 'trial', label: 'ميزان المراجعة' },
  { key: 'income', label: 'قائمة الدخل' },
  { key: 'balance', label: 'المركز المالي' },
  { key: 'journal', label: 'دفتر اليومية' },
  { key: 'accounts', label: 'شجرة الحسابات' },
];

async function renderTrialBalance() {
  const tb = await Api.get('/reports/trial-balance');
  return `
    <div class="table-wrap"><table><thead><tr><th>الكود</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
      ${tb.rows
        .map(
          (r) => `<tr><td>${r.code}</td><td>${UI.escapeHtml(r.name)}</td>
          <td>${r.debit ? UI.money(r.debit) : '-'}</td><td>${r.credit ? UI.money(r.credit) : '-'}</td></tr>`
        )
        .join('')}
    </tbody>
    <tfoot><tr style="font-weight:700"><td colspan="2">الإجمالي</td><td>${UI.money(tb.totalDebit)}</td><td>${UI.money(tb.totalCredit)}</td></tr></tfoot>
    </table></div>
  `;
}

async function renderIncomeStatement() {
  const inc = await Api.get('/reports/income-statement');
  return `
    <div class="table-wrap"><table><thead><tr><th>الحساب</th><th>النوع</th><th>المبلغ</th></tr></thead><tbody>
      ${inc.lines
        .map(
          (l) => `<tr><td>${UI.escapeHtml(l.name)}</td><td>${l.type === 'revenue' ? 'إيراد' : 'مصروف'}</td><td>${UI.money(l.amount)}</td></tr>`
        )
        .join('')}
    </tbody></table></div>
    <div class="totals-box"><div class="totals-inner">
      <div class="totals-row"><span>إجمالي الإيرادات</span><span>${UI.money(inc.revenue)}</span></div>
      <div class="totals-row"><span>إجمالي المصروفات</span><span>${UI.money(inc.expense)}</span></div>
      <div class="totals-row grand"><span>صافي الربح</span><span>${UI.money(inc.netProfit)}</span></div>
    </div></div>
  `;
}

async function renderBalanceSheet() {
  const bs = await Api.get('/reports/balance-sheet');
  const side = (rows) =>
    rows.map((r) => `<tr><td>${UI.escapeHtml(r.name)}</td><td>${UI.money(r.balance)}</td></tr>`).join('');
  return `
    <div class="grid cols-2">
      <div>
        <h4>الأصول</h4>
        <table><tbody>${side(bs.assets)}</tbody><tfoot><tr style="font-weight:700"><td>الإجمالي</td><td>${UI.money(bs.totalAssets)}</td></tr></tfoot></table>
      </div>
      <div>
        <h4>الخصوم وحقوق الملكية</h4>
        <table><tbody>
          ${side(bs.liabilities)}
          ${side(bs.equity)}
          <tr><td>الأرباح المتراكمة حتى الآن</td><td>${UI.money(bs.netIncomeToDate)}</td></tr>
        </tbody><tfoot><tr style="font-weight:700"><td>الإجمالي</td><td>${UI.money(bs.totalLiabilities + bs.totalEquity)}</td></tr></tfoot></table>
      </div>
    </div>
    <p style="margin-top:14px">${bs.balanced ? UI.badge('الميزانية متوازنة ✓', 'green') : UI.badge('الميزانية غير متوازنة!', 'red')}</p>
  `;
}

async function renderJournal() {
  const entries = await Api.get('/journal?limit=300');
  return `
    <div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
      ${entries
        .map((e) =>
          e.lines
            .map(
              (l, i) => `<tr>
              <td>${i === 0 ? UI.escapeHtml(e.entry_date) : ''}</td>
              <td>${i === 0 ? UI.escapeHtml(e.description || '') : ''}</td>
              <td>${l.account_code} - ${UI.escapeHtml(l.account_name)}</td>
              <td>${l.debit ? UI.money(l.debit) : '-'}</td>
              <td>${l.credit ? UI.money(l.credit) : '-'}</td>
            </tr>`
            )
            .join('')
        )
        .join('')}
    </tbody></table></div>
  `;
}

async function renderAccountsTree() {
  const accounts = await Api.get('/accounts');
  return `
    <div class="table-wrap"><table><thead><tr><th>الكود</th><th>الاسم</th><th>النوع</th><th>قابل للترحيل؟</th></tr></thead><tbody>
      ${accounts
        .map(
          (a) => `<tr>
          <td>${a.code}</td>
          <td style="padding-right:${a.parent_code ? '20px' : '0'}">${UI.escapeHtml(a.name)}</td>
          <td>${accountTypeLabel(a.type)}</td>
          <td>${a.is_postable ? 'نعم' : '-'}</td>
        </tr>`
        )
        .join('')}
    </tbody></table></div>
  `;
}

function accountTypeLabel(t) {
  return { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' }[t] || t;
}

const TAB_RENDERERS = {
  trial: renderTrialBalance,
  income: renderIncomeStatement,
  balance: renderBalanceSheet,
  journal: renderJournal,
  accounts: renderAccountsTree,
};

Pages.accountingHome = async function () {
  UI.setContent(`
    <div class="card">
      <div class="card-header"><h2>الحسابات والتقارير المالية</h2></div>
      <div class="tabs" id="acctTabs">
        ${ACCT_TABS.map((t, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>
      <div id="acctTabContent"><div class="empty-state">جارِ التحميل...</div></div>
    </div>
  `);

  async function showTab(key) {
    document.querySelectorAll('#acctTabs .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
    const content = document.getElementById('acctTabContent');
    content.innerHTML = '<div class="empty-state">جارِ التحميل...</div>';
    try {
      content.innerHTML = await TAB_RENDERERS[key]();
    } catch (err) {
      content.innerHTML = `<p style="color:var(--danger)">${UI.escapeHtml(err.message)}</p>`;
    }
  }

  document.querySelectorAll('#acctTabs .tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  showTab('trial');
};

window.Pages = Pages;
