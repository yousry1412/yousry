var Pages = window.Pages || {};

const ACCT_TABS = [
  { key: 'trial', label: 'ميزان المراجعة' },
  { key: 'income', label: 'قائمة الدخل' },
  { key: 'balance', label: 'المركز المالي' },
  { key: 'partners', label: 'حقوق الشركاء' },
  { key: 'cashflow', label: 'التدفقات النقدية' },
  { key: 'closing', label: 'الإقفال المالي' },
  { key: 'journal', label: 'دفتر اليومية' },
  { key: 'accounts', label: 'شجرة الحسابات' },
];

function dateRangeBarHtml(idPrefix, { withFrom = true } = {}) {
  return `
    <div class="form-grid" style="margin-bottom:14px">
      ${withFrom ? `<div class="field"><label>من تاريخ</label><input type="date" id="${idPrefix}From" /></div>` : ''}
      <div class="field"><label>إلى تاريخ</label><input type="date" id="${idPrefix}To" value="${UI.todayStr()}" /></div>
      <div class="field" style="align-self:flex-end"><button class="btn secondary small" id="${idPrefix}Filter">تصفية</button></div>
    </div>
  `;
}

async function renderTrialBalance(container) {
  const tb = await Api.get('/reports/trial-balance');
  container.innerHTML = `
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

async function renderIncomeStatement(container) {
  async function load(from, to) {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    const inc = await Api.get('/reports/income-statement' + qs);
    return `
      ${dateRangeBarHtml('income')}
      <div class="table-wrap"><table><thead><tr><th>الحساب</th><th>النوع</th><th>المبلغ</th></tr></thead><tbody>
        ${inc.lines
          .map((l) => `<tr><td>${UI.escapeHtml(l.name)}</td><td>${l.type === 'revenue' ? 'إيراد' : 'مصروف'}</td><td>${UI.money(l.amount)}</td></tr>`)
          .join('')}
      </tbody></table></div>
      <div class="totals-box"><div class="totals-inner">
        <div class="totals-row"><span>إجمالي الإيرادات</span><span>${UI.money(inc.revenue)}</span></div>
        <div class="totals-row"><span>إجمالي المصروفات</span><span>${UI.money(inc.expense)}</span></div>
        <div class="totals-row grand"><span>صافي الربح</span><span>${UI.money(inc.netProfit)}</span></div>
      </div></div>
    `;
  }
  async function bindFilter() {
    document.getElementById('incomeFilter').addEventListener('click', async () => {
      const from = document.getElementById('incomeFrom').value;
      const to = document.getElementById('incomeTo').value;
      container.innerHTML = await load(from, to);
      bindFilter();
    });
  }
  container.innerHTML = await load();
  bindFilter();
}

async function renderBalanceSheet(container) {
  const bs = await Api.get('/reports/balance-sheet');
  const side = (rows) => rows.map((r) => `<tr><td>${UI.escapeHtml(r.name)}</td><td>${UI.money(r.balance)}</td></tr>`).join('');
  container.innerHTML = `
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
          <tr><td>الأرباح المتراكمة حتى الآن (غير موزعة)</td><td>${UI.money(bs.netIncomeToDate)}</td></tr>
        </tbody><tfoot><tr style="font-weight:700"><td>الإجمالي</td><td>${UI.money(bs.totalLiabilities + bs.totalEquity)}</td></tr></tfoot></table>
      </div>
    </div>
    <p style="margin-top:14px">${bs.balanced ? UI.badge('الميزانية متوازنة ✓', 'green') : UI.badge('الميزانية غير متوازنة!', 'red')}</p>
  `;
}

async function renderPartnersEquity(container) {
  const rows = await Api.get('/reports/partners-equity');
  if (rows.length === 0) {
    container.innerHTML = '<div class="empty-state">لا يوجد شركاء مسجّلين لهذه المنشأة. أضفهم من صفحة "المنشآت والفروع والشركاء"</div>';
    return;
  }
  container.innerHTML = `
    <div class="table-wrap"><table><thead><tr>
      <th>الشريك</th><th>النسبة</th><th>رأس المال المُقدَّم</th><th>حصته من الأرباح الموزعة</th><th>مسحوبات شخصية</th><th>صافي حقوقه الحالية</th>
    </tr></thead><tbody>
      ${rows
        .map(
          (r) => `<tr>
          <td>${UI.escapeHtml(r.name)}</td>
          <td>${r.share_percentage}%</td>
          <td>${UI.money(r.contributions)}</td>
          <td>${UI.money(r.profitShare)}</td>
          <td>${UI.money(r.drawings)}</td>
          <td><strong>${UI.money(r.netEquity)}</strong></td>
        </tr>`
        )
        .join('')}
    </tbody></table></div>
    <p class="muted" style="font-size:13px; margin-top:10px">
      رأس المال والمسحوبات بتتسجل عن طريق "سندات القبض والصرف" باختيار الطرف = شريك. حصة الأرباح بتتحدث تلقائيًا بعد كل إقفال مالي.
    </p>
  `;
}

async function renderCashFlow(container) {
  async function load(from, to) {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    const cf = await Api.get('/reports/cash-flow' + qs);
    return `
      ${dateRangeBarHtml('cashflow')}
      <div class="totals-box"><div class="totals-inner" style="min-width:320px">
        <div class="totals-row"><span>رصيد النقدية قبل الفترة</span><span>${UI.money(cf.openingCash)}</span></div>
        <div class="totals-row"><span>صافي تدفقات التشغيل (مبيعات، مشتريات، مصروفات)</span><span>${UI.money(cf.operating)}</span></div>
        <div class="totals-row"><span>صافي تدفقات التمويل (رأس مال ومسحوبات الشركاء)</span><span>${UI.money(cf.financing)}</span></div>
        <div class="totals-row"><span>صافي التغير في النقدية</span><span>${UI.money(cf.netChange)}</span></div>
        <div class="totals-row grand"><span>رصيد النقدية آخر الفترة</span><span>${UI.money(cf.closingCash)}</span></div>
      </div></div>
    `;
  }
  async function bindFilter() {
    document.getElementById('cashflowFilter').addEventListener('click', async () => {
      const from = document.getElementById('cashflowFrom').value;
      const to = document.getElementById('cashflowTo').value;
      container.innerHTML = await load(from, to);
      bindFilter();
    });
  }
  container.innerHTML = await load();
  bindFilter();
}

async function renderClosing(container) {
  const closings = await Api.get('/fiscal-closings');
  container.innerHTML = `
    <div class="card-header"><h3>إقفال فترة مالية جديدة وتوزيع الأرباح على الشركاء</h3></div>
    <p class="muted" style="font-size:13px">
      الإقفال بيحسب صافي الربح أو الخسارة للفترة المحددة، ويوزّعه على الشركاء حسب نسبهم (أو يحتفظ به كأرباح مرحلة
      لو معندكش شركاء مسجّلين)، وبيقفل حسابات الإيرادات والمصروفات لنفس الفترة بشكل نهائي.
    </p>
    <form id="closingForm" class="form-grid">
      <div class="field"><label>من تاريخ *</label><input name="period_from" type="date" required /></div>
      <div class="field"><label>إلى تاريخ *</label><input name="period_to" type="date" value="${UI.todayStr()}" required /></div>
      <div class="field span-2"><label>ملاحظات</label><input name="notes" /></div>
      <div class="field"><button class="btn danger" type="submit">تنفيذ الإقفال</button></div>
    </form>

    <div class="card-header" style="margin-top:20px"><h3>سجل الإقفالات السابقة</h3></div>
    ${
      closings.length === 0
        ? '<div class="empty-state">لم يتم عمل أي إقفال مالي بعد</div>'
        : `<div class="table-wrap"><table><thead><tr><th>من</th><th>إلى</th><th>الإيرادات</th><th>المصروفات</th><th>صافي الربح</th></tr></thead><tbody>
            ${closings
              .map(
                (c) => `<tr>
                <td>${UI.escapeHtml(c.period_from)}</td>
                <td>${UI.escapeHtml(c.period_to)}</td>
                <td>${UI.money(c.revenue_total)}</td>
                <td>${UI.money(c.expense_total)}</td>
                <td><strong>${UI.money(c.net_profit)}</strong></td>
              </tr>`
              )
              .join('')}
          </tbody></table></div>`
    }
  `;
  document.getElementById('closingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await UI.confirmAction('الإقفال المالي إجراء نهائي وهيقفل الفترة دي بالكامل. متأكد؟'))) return;
    const fd = new FormData(e.target);
    try {
      await Api.post('/fiscal-closings', Object.fromEntries(fd.entries()));
      UI.toast('تم الإقفال المالي بنجاح', 'success');
      renderClosing(container);
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

async function renderJournal(container) {
  const entries = await Api.get('/journal?limit=300');
  container.innerHTML = `
    <div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>الفرع</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
      ${entries
        .map((e) =>
          e.lines
            .map(
              (l, i) => `<tr>
              <td>${i === 0 ? UI.escapeHtml(e.entry_date) : ''}</td>
              <td>${i === 0 ? UI.escapeHtml(e.description || '') : ''}</td>
              <td class="muted">${UI.escapeHtml(l.branch_name || '-')}</td>
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

async function renderAccountsTree(container) {
  const accounts = await Api.get('/accounts');
  container.innerHTML = `
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
    <p class="muted" style="font-size:13px; margin-top:10px">تقدر تضيف حسابات مخصصة جديدة من صفحة "المنشآت والفروع والشركاء" ← تبويب "شجرة الحسابات".</p>
  `;
}

function accountTypeLabel(t) {
  return { asset: 'أصول', liability: 'خصوم', equity: 'حقوق ملكية', revenue: 'إيرادات', expense: 'مصروفات' }[t] || t;
}

const TAB_RENDERERS = {
  trial: renderTrialBalance,
  income: renderIncomeStatement,
  balance: renderBalanceSheet,
  partners: renderPartnersEquity,
  cashflow: renderCashFlow,
  closing: renderClosing,
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
      await TAB_RENDERERS[key](content);
    } catch (err) {
      content.innerHTML = `<p style="color:var(--danger)">${UI.escapeHtml(err.message)}</p>`;
    }
  }

  document.querySelectorAll('#acctTabs .tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  showTab('trial');
};

window.Pages = Pages;
