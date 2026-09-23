var Pages = window.Pages || {};

const ACCT_TABS = [
  { key: 'trial', label: 'ميزان المراجعة' },
  { key: 'income', label: 'قائمة الدخل' },
  { key: 'balance', label: 'المركز المالي' },
  { key: 'aging', label: 'أعمار الديون' },
  { key: 'inventoryCheck', label: 'مطابقة المخزون' },
  { key: 'salesAccountability', label: 'مسؤولية التحصيل' },
  { key: 'profitability', label: 'الربحية' },
  { key: 'efficiency', label: 'كفاءة الموظفين والسيارات' },
  { key: 'commissions', label: 'عمولات المندوبين' },
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

function profitabilityTableHtml(headers, rows, rowFn) {
  if (rows.length === 0) return '<div class="empty-state">لا توجد بيانات في هذه الفترة</div>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(rowFn).join('')}
  </tbody></table></div>`;
}

async function renderProfitability(container) {
  async function load(from, to) {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    const [products, customers, trips] = await Promise.all([
      Api.get('/reports/profitability/products' + qs),
      Api.get('/reports/profitability/customers' + qs),
      Api.get('/reports/profitability/trips' + qs),
    ]);

    return `
      ${dateRangeBarHtml('profit')}

      <h4>أعلى المنتجات ربحًا</h4>
      ${profitabilityTableHtml(
        ['المنتج', 'الكمية المباعة', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %'],
        products,
        (r) => `<tr>
          <td>${UI.escapeHtml(r.product_name)}</td>
          <td>${UI.num(r.qty)} ${UI.escapeHtml(r.unit)}</td>
          <td>${UI.money(r.revenue)}</td>
          <td>${UI.money(r.cost)}</td>
          <td style="color:${r.profit >= 0 ? 'var(--success)' : 'var(--danger)'}"><strong>${UI.money(r.profit)}</strong></td>
          <td>${r.margin}%</td>
        </tr>`
      )}

      <h4 style="margin-top:22px">أعلى العملاء ربحًا</h4>
      ${profitabilityTableHtml(
        ['العميل', 'عدد الفواتير', 'الإيراد', 'التكلفة', 'الربح', 'الهامش %'],
        customers,
        (r) => `<tr>
          <td><a href="#/customers/${r.customer_id}">${UI.escapeHtml(r.customer_name)}</a></td>
          <td>${r.invoice_count}</td>
          <td>${UI.money(r.revenue)}</td>
          <td>${UI.money(r.cost)}</td>
          <td style="color:${r.profit >= 0 ? 'var(--success)' : 'var(--danger)'}"><strong>${UI.money(r.profit)}</strong></td>
          <td>${r.margin}%</td>
        </tr>`
      )}

      <h4 style="margin-top:22px">أعلى رحلات التوزيع ربحًا</h4>
      ${profitabilityTableHtml(
        ['الرحلة', 'السيارة', 'التاريخ', 'المبيعات', 'تكلفة البضاعة', 'المصروفات', 'التوالف', 'صافي النتيجة'],
        trips,
        (r) => `<tr>
          <td><a href="#/trips/${r.trip_id}">${UI.escapeHtml(r.trip_no)}</a></td>
          <td>${UI.escapeHtml(r.vehicle_name)}</td>
          <td>${UI.escapeHtml(r.trip_date)}</td>
          <td>${UI.money(r.sales)}</td>
          <td>${UI.money(r.cogs)}</td>
          <td>${UI.money(r.expenses)}</td>
          <td>${UI.money(r.damages)}</td>
          <td style="color:${r.netResult >= 0 ? 'var(--success)' : 'var(--danger)'}"><strong>${UI.money(r.netResult)}</strong></td>
        </tr>`
      )}
    `;
  }

  async function bindFilter() {
    document.getElementById('profitFilter').addEventListener('click', async () => {
      const from = document.getElementById('profitFrom').value;
      const to = document.getElementById('profitTo').value;
      container.innerHTML = await load(from, to);
      bindFilter();
    });
  }
  container.innerHTML = await load();
  bindFilter();
}

async function renderEfficiency(container) {
  async function load(from, to) {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    const [employees, vehicles] = await Promise.all([
      Api.get('/reports/efficiency/employees' + qs),
      Api.get('/reports/efficiency/vehicles' + qs),
    ]);
    return `
      ${dateRangeBarHtml('eff')}

      <h4>كفاءة الموظفين (المسؤولين عن الرحلات)</h4>
      ${
        employees.length === 0
          ? '<div class="empty-state">لا توجد بيانات رحلات في هذه الفترة</div>'
          : `<div class="table-wrap"><table><thead><tr><th>الموظف</th><th>عدد الرحلات</th><th>إجمالي المبيعات</th><th>إجمالي المصروفات</th><th>الكيلومترات</th><th>صافي النتيجة</th></tr></thead><tbody>
              ${employees
                .map(
                  (e) => `<tr>
                <td>${UI.escapeHtml(e.driver_name)}</td>
                <td>${e.trip_count}</td>
                <td>${UI.money(e.sales)}</td>
                <td>${UI.money(e.expenses)}</td>
                <td>${UI.num(e.km_driven)}</td>
                <td style="color:${e.netResult >= 0 ? 'var(--success)' : 'var(--danger)'}"><strong>${UI.money(e.netResult)}</strong></td>
              </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }

      <h4 style="margin-top:22px">كفاءة السيارات</h4>
      ${
        vehicles.length === 0
          ? '<div class="empty-state">لا توجد بيانات رحلات في هذه الفترة</div>'
          : `<div class="table-wrap"><table><thead><tr><th>السيارة</th><th>عدد الرحلات</th><th>إجمالي المبيعات</th><th>إجمالي المصروفات</th><th>الكيلومترات</th><th>تكلفة/كم</th><th>صافي النتيجة</th></tr></thead><tbody>
              ${vehicles
                .map(
                  (v) => `<tr>
                <td>${UI.escapeHtml(v.vehicle_name)}</td>
                <td>${v.trip_count}</td>
                <td>${UI.money(v.sales)}</td>
                <td>${UI.money(v.expenses)}</td>
                <td>${UI.num(v.km_driven)}</td>
                <td>${v.cost_per_km != null ? UI.money(v.cost_per_km) : '-'}</td>
                <td style="color:${v.netResult >= 0 ? 'var(--success)' : 'var(--danger)'}"><strong>${UI.money(v.netResult)}</strong></td>
              </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    `;
  }
  async function bindFilter() {
    document.getElementById('effFilter').addEventListener('click', async () => {
      const from = document.getElementById('effFrom').value;
      const to = document.getElementById('effTo').value;
      container.innerHTML = await load(from, to);
      bindFilter();
    });
  }
  container.innerHTML = await load();
  bindFilter();
}

async function renderCommissions(container) {
  async function load(from, to) {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    const rows = await Api.get('/reports/commissions' + qs);
    return `
      ${dateRangeBarHtml('comm')}
      ${
        rows.length === 0
          ? '<div class="empty-state">لا يوجد مستخدمين لهم نسبة عمولة مسجّلة - أضفها من صفحة المستخدمين (الإعدادات)</div>'
          : `<div class="table-wrap"><table><thead><tr><th>المستخدم</th><th>نسبة العمولة</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th><th>العمولة المستحقة</th></tr></thead><tbody>
              ${rows
                .map(
                  (r) => `<tr>
                <td>${UI.escapeHtml(r.username)}</td>
                <td>${r.commission_pct}%</td>
                <td>${r.invoice_count}</td>
                <td>${UI.money(r.total_sales)}</td>
                <td><strong>${UI.money(r.commission_earned)}</strong></td>
              </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    `;
  }
  async function bindFilter() {
    document.getElementById('commFilter').addEventListener('click', async () => {
      const from = document.getElementById('commFrom').value;
      const to = document.getElementById('commTo').value;
      container.innerHTML = await load(from, to);
      bindFilter();
    });
  }
  container.innerHTML = await load();
  bindFilter();
}

function agingTableHtml(title, linkPrefix, report) {
  if (report.rows.length === 0) {
    return `<h4>${title}</h4><div class="empty-state">لا توجد مبالغ مفتوحة</div>`;
  }
  return `
    <h4>${title}</h4>
    <div class="table-wrap"><table><thead><tr>
      <th>الاسم</th><th>الهاتف</th><th>0-30 يوم</th><th>31-60 يوم</th><th>61-90 يوم</th><th>أكتر من 90 يوم</th><th>الإجمالي المستحق</th>
    </tr></thead><tbody>
      ${report.rows
        .map(
          (r) => `<tr>
          <td>${linkPrefix ? `<a href="${linkPrefix}${r.party_id}">${UI.escapeHtml(r.name)}</a>` : UI.escapeHtml(r.name)}</td>
          <td>${UI.escapeHtml(r.phone || '-')}</td>
          <td>${r.current ? UI.money(r.current) : '-'}</td>
          <td>${r.d31_60 ? UI.money(r.d31_60) : '-'}</td>
          <td>${r.d61_90 ? UI.money(r.d61_90) : '-'}</td>
          <td>${r.over90 ? UI.badge(UI.money(r.over90), 'red') : '-'}</td>
          <td><strong>${UI.money(r.total)}</strong></td>
        </tr>`
        )
        .join('')}
    </tbody>
    <tfoot><tr style="font-weight:700">
      <td colspan="2">الإجمالي</td>
      <td>${UI.money(report.totals.current)}</td>
      <td>${UI.money(report.totals.d31_60)}</td>
      <td>${UI.money(report.totals.d61_90)}</td>
      <td>${UI.money(report.totals.over90)}</td>
      <td>${UI.money(report.totals.total)}</td>
    </tr></tfoot>
    </table></div>
  `;
}

async function renderAging(container) {
  async function load(asOf) {
    const qs = asOf ? `?asOf=${asOf}` : '';
    const [ar, ap] = await Promise.all([Api.get('/reports/ar-aging' + qs), Api.get('/reports/ap-aging' + qs)]);
    return `
      <div class="form-grid" style="margin-bottom:14px">
        <div class="field"><label>حتى تاريخ</label><input type="date" id="agingAsOf" value="${ar.asOf}" /></div>
        <div class="field" style="align-self:flex-end"><button class="btn secondary small" id="agingFilter">تصفية</button></div>
      </div>
      ${agingTableHtml('أعمار ديون العملاء (مستحق لنا)', '#/customers/', ar)}
      <div style="margin-top:26px"></div>
      ${agingTableHtml('أعمار ديون الموردين (مستحق علينا)', null, ap)}
    `;
  }
  async function bindFilter() {
    document.getElementById('agingFilter').addEventListener('click', async () => {
      const asOf = document.getElementById('agingAsOf').value;
      container.innerHTML = await load(asOf);
      bindFilter();
    });
  }
  container.innerHTML = await load();
  bindFilter();
}

async function renderSalesAccountability(container) {
  const r = await Api.get('/reports/sales-accountability');
  container.innerHTML = `
    <p class="muted" style="font-size:13px; margin-bottom:12px">
      كل فاتورة بيع مسجّلة باسم الموظف اللي أنشأها، وهو المسؤول عن تحصيلها لحد ما تتقفل بالكامل - حتى لو السداد
      وصل بسند سجّله موظف تاني. الجدول ده بيوريك المتبقي لسه على كل بائع.
    </p>
    ${profitabilityTableHtml(
      ['البائع', 'المبلغ المطلوب تحصيله'],
      r.rows,
      (row) => `<tr><td>${UI.escapeHtml(row.username)}</td><td class="num" style="color:${row.outstanding > 0 ? 'var(--warn)' : 'var(--success)'}"><strong>${UI.money(row.outstanding)}</strong></td></tr>`
    )}
    <div class="totals-box"><div class="totals-inner">
      <div class="totals-row grand"><span>إجمالي المستحق تحصيله على كل البائعين</span><span>${UI.money(r.total)}</span></div>
    </div></div>
  `;
}

async function renderInventoryReconciliation(container) {
  const r = await Api.get('/reports/inventory-reconciliation');
  container.innerHTML = `
    <p class="muted" style="font-size:13px; margin-bottom:12px">
      رصيد المخزون المعروض في كل الشاشات رقم متراكم بيتحدّث مع كل عملية. الفحص ده بيعيد حساب الكمية من سجل كل
      حركة مخزنية على حدة (شراء/بيع/تحويل/تصنيع/تلف...) ويقارنها بالرقم المخزّن، عشان يكتشف أي فرق قبل ما يأثر
      على تقييم المخزون أو حسابات الشركاء. تم فحص ${r.checkedCount} صنف/فرع.
    </p>
    ${
      r.mismatches.length === 0
        ? '<div class="empty-state" style="color:var(--success)">✔ كل أرصدة المخزون مطابقة تمامًا لسجل الحركات - مفيش أي انحراف</div>'
        : `<div class="table-wrap"><table><thead><tr>
            <th>الصنف</th><th>الفرع</th><th>الرصيد المسجّل</th><th>الرصيد المحسوب من الحركات</th><th>الفرق</th>
          </tr></thead><tbody>
            ${r.mismatches
              .map(
                (m) => `<tr>
                <td>${UI.escapeHtml(m.product_name)}</td>
                <td>${UI.escapeHtml(m.branch_name)}</td>
                <td>${UI.num(m.stored_qty)} ${UI.escapeHtml(m.product_unit)}</td>
                <td>${UI.num(m.computed_qty)} ${UI.escapeHtml(m.product_unit)}</td>
                <td style="color:var(--danger)"><strong>${m.diff > 0 ? '+' : ''}${UI.num(m.diff)}</strong></td>
              </tr>`
              )
              .join('')}
          </tbody></table></div>
          <p class="muted" style="font-size:13px; margin-top:10px">فرق موجب = الرصيد المسجّل أكبر من الحركات الفعلية. راجع حركة الصنف ده من صفحة تفاصيله لتحديد سبب الفرق.</p>`
    }
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
  const [closings, branches] = await Promise.all([Api.get('/fiscal-closings'), Api.get('/branches')]);
  container.innerHTML = `
    <div class="card-header"><h3>إقفال فترة مالية جديدة وتوزيع الأرباح على الشركاء</h3></div>
    <p class="muted" style="font-size:13px">
      الإقفال بيحسب صافي الربح أو الخسارة للفترة المحددة، ويوزّعه على الشركاء حسب نسبهم (أو يحتفظ به كأرباح مرحلة
      لو معندكش شركاء مسجّلين)، وبيقفل حسابات الإيرادات والمصروفات لنفس الفترة بشكل نهائي.
      اختيار فرع معين بيقفل نتيجة هذا الفرع بس ويوزّعها على شركائه هو (أو شركاء الشركة العامين لو الفرع مالوش شركاء خاصين بيه)؛
      من غير اختيار فرع، بيتقفل نتيجة الشركة كلها وتتوزع على الشركاء العامين بس.
    </p>
    <form id="closingForm" class="form-grid">
      <div class="field"><label>الفرع</label><select name="branch_id"><option value="">كل الشركة (كل الفروع مع بعض)</option>${UI.optionsHtml(branches, 'id', 'name')}</select></div>
      <div class="field"><label>من تاريخ *</label><input name="period_from" type="date" required /></div>
      <div class="field"><label>إلى تاريخ *</label><input name="period_to" type="date" value="${UI.todayStr()}" required /></div>
      <div class="field span-2"><label>ملاحظات</label><input name="notes" /></div>
      <div class="field"><button class="btn danger" type="submit">تنفيذ الإقفال</button></div>
    </form>

    <div class="card-header" style="margin-top:20px"><h3>سجل الإقفالات السابقة</h3></div>
    ${
      closings.length === 0
        ? '<div class="empty-state">لم يتم عمل أي إقفال مالي بعد</div>'
        : `<div class="table-wrap"><table><thead><tr><th>النطاق</th><th>من</th><th>إلى</th><th>الإيرادات</th><th>المصروفات</th><th>صافي الربح</th></tr></thead><tbody>
            ${closings
              .map(
                (c) => `<tr>
                <td>${c.branch_id ? UI.badge(UI.escapeHtml(c.branch_name || ''), 'orange') : UI.badge('كل الشركة', 'gray')}</td>
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

const OPERATION_EXPLAIN = {
  opening: { label: 'رصيد افتتاحي', body: 'تسجيل رصيد بداية (مدين أو دائن) لعميل/مورد/موظف عند إضافته لأول مرة على النظام - مش عملية بيع أو شراء فعلية، بس نقطة بداية لحساباته.', hash: null },
  sale: { label: 'فاتورة بيع', body: 'بيع بضاعة لعميل - بتسجل الإيراد والضريبة (لو مفعّلة) وتكلفة البضاعة المباعة، وتحرّك المخزون أو عهدة الرحلة.', hash: (id) => `#/sales/${id}` },
  sales_return: { label: 'مرتجع بيع', body: 'إرجاع بضاعة من عميل بعد بيعها - بيعكس جزء من الإيراد والتكلفة ويرجّع البضاعة للمخزون.', hash: null },
  purchase: { label: 'فاتورة شراء', body: 'شراء بضاعة أو مواد خام من مورد - بيزوّد المخزون بالكمية وبيسجل المستحق للمورد أو المدفوع نقدًا/بنك.', hash: (id) => `#/purchases/${id}` },
  purchase_return: { label: 'مرتجع شراء', body: 'إرجاع بضاعة لمورد بعد شرائها - بينقص المخزون ويقلل المستحق للمورد.', hash: null },
  production: { label: 'أمر تصنيع', body: 'استهلاك مكوّنات خام لإنتاج منتج مُصنّع - بينقص مخزون المكوّنات ويزوّد مخزون المنتج النهائي بتكلفته المجمّعة.', hash: (id) => `#/production/${id}` },
  production_in: { label: 'أمر تصنيع (إضافة المنتج النهائي)', body: 'الجزء الخاص بإضافة المنتج النهائي لمخزون التصنيع.', hash: (id) => `#/production/${id}` },
  production_out: { label: 'أمر تصنيع (صرف المكوّنات)', body: 'الجزء الخاص باستهلاك المكوّنات الخام في أمر التصنيع.', hash: (id) => `#/production/${id}` },
  trip_load: { label: 'تحميل بضاعة على رحلة', body: 'بضاعة اتحركت من مخزن الفرع لعهدة رحلة توزيع، بعد موافقة السائق رسميًا على استلامها وتسجيل قراءة العداد.', hash: (id) => `#/trips/${id}` },
  trip_return: { label: 'مرتجع من رحلة توزيع', body: 'بضاعة رجعت من عهدة الرحلة للمخزن (لم تُباع أثناء الرحلة).', hash: (id) => `#/trips/${id}` },
  trip_expense: { label: 'مصروف على رحلة توزيع', body: 'مصروف تشغيل مرتبط بسيارة/رحلة معينة (وقود، صيانة، رسوم طريق...) - بيدخل في حساب تكلفة تشغيل الرحلة.', hash: (id) => `#/trips/${id}` },
  damage: { label: 'تسجيل تلف/هالك', body: 'بضاعة اتلفت أو فُقدت (بالمخزن أو أثناء رحلة) - بتتحول لمصروف توالف وبتنقص من المخزون رسميًا.', hash: null },
  damage_reversal: { label: 'عكس قيد تلف (تصحيح)', body: 'قيد تصحيحي رسمي بيعكس أثر تسجيل تلف سابق كان فيه خطأ - النظام ما بيمسحش القيود الأصلية، بيعكسها بقيد جديد للحفاظ على تتبع كل التعديلات.', hash: null },
  expense: { label: 'مصروف عام', body: 'مصروف تشغيلي عام للمنشأة (إيجار، رواتب، مرافق...) مش مرتبط برحلة أو سيارة معينة.', hash: null },
  voucher: { label: 'سند قبض/صرف', body: 'حركة نقدية أو بنكية مباشرة (تحصيل من عميل، سداد لمورد، صرف سلفة موظف...) بدون فاتورة مرتبطة.', hash: null },
  voucher_reversal: { label: 'عكس سند (تصحيح)', body: 'قيد تصحيحي رسمي بيعكس أثر سند سابق كان فيه خطأ.', hash: null },
  stock_transfer: { label: 'تحويل مخزون بين الفروع', body: 'نقل بضاعة رسمي من فرع/مخزن لفرع تاني.', hash: null },
  transfer_in: { label: 'تحويل مخزون (وارد)', body: 'الجزء الخاص باستلام البضاعة المحوّلة في الفرع المستقبِل.', hash: null },
  transfer_out: { label: 'تحويل مخزون (صادر)', body: 'الجزء الخاص بصرف البضاعة المحوّلة من الفرع المرسِل.', hash: null },
  adjustment: { label: 'تسوية/جرد مخزون', body: 'تعديل رسمي لكمية صنف في المخزون بعد جرد فعلي، بفارق (زيادة أو عجز) موثّق بسبب.', hash: null },
  closing: { label: 'قيد إقفال مالي', body: 'قيد تلقائي بيقفل حسابات الإيرادات والمصروفات في نهاية فترة محاسبية وينقل صافي النتيجة لحقوق الملكية.', hash: null },
};

function operationExplainHtml(entry) {
  const info = OPERATION_EXPLAIN[entry.ref_type] || { label: entry.ref_type || 'عملية', body: 'لا يوجد شرح تفصيلي مسجّل لهذا النوع من العمليات.', hash: null };
  const linkHash = info.hash && entry.ref_id ? info.hash(entry.ref_id) : null;
  return `
    <p><strong>النوع:</strong> ${UI.escapeHtml(info.label)}</p>
    <p>${UI.escapeHtml(info.body)}</p>
    <p class="muted">التاريخ: ${UI.escapeHtml(entry.entry_date)} ${entry.description ? '· ' + UI.escapeHtml(entry.description) : ''}</p>
    <div class="table-wrap"><table><thead><tr><th>الفرع</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
      ${entry.lines
        .map(
          (l) => `<tr>
        <td class="muted">${UI.escapeHtml(l.branch_name || '-')}</td>
        <td>${l.account_code} - ${UI.escapeHtml(l.account_name)}</td>
        <td>${l.debit ? UI.money(l.debit) : '-'}</td>
        <td>${l.credit ? UI.money(l.credit) : '-'}</td>
      </tr>`
        )
        .join('')}
    </tbody></table></div>
    <div class="modal-actions">
      ${linkHash ? `<a class="btn" href="${linkHash}" onclick="UI.closeModal()">فتح البطاقة الأصلية</a>` : ''}
      <button class="btn secondary" type="button" onclick="UI.closeModal()">إغلاق</button>
    </div>
  `;
}

async function renderJournal(container) {
  const entries = await Api.get('/journal?limit=300');
  container.innerHTML = `
    <p class="muted" style="font-size:13px">اضغط على أي عملية عشان تشوف شرح ليها وتفاصيل قيدها كاملة.</p>
    <div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>الفرع</th><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>
      ${entries
        .map((e, ei) =>
          e.lines
            .map(
              (l, i) => `<tr class="journal-row" data-entry="${ei}" style="cursor:pointer">
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
  container.querySelectorAll('.journal-row').forEach((row) => {
    row.addEventListener('click', () => {
      const entry = entries[Number(row.dataset.entry)];
      const info = OPERATION_EXPLAIN[entry.ref_type];
      UI.openModal(`شرح العملية: ${UI.escapeHtml(info ? info.label : entry.ref_type || 'عملية')}`, operationExplainHtml(entry));
    });
  });
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
  aging: renderAging,
  inventoryCheck: renderInventoryReconciliation,
  salesAccountability: renderSalesAccountability,
  profitability: renderProfitability,
  efficiency: renderEfficiency,
  commissions: renderCommissions,
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
