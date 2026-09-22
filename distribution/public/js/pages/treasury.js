var Pages = window.Pages || {};

const TREASURY_REF_LABELS = {
  sale: 'فاتورة بيع',
  sales_return: 'مرتجع بيع',
  purchase: 'فاتورة شراء',
  purchase_return: 'مرتجع شراء',
  voucher: 'سند قبض/صرف',
  expense: 'مصروف عام',
  trip_expense: 'مصروف رحلة',
  closing: 'إقفال مالي',
};

function treasuryMovementRowHtml(m) {
  const isIn = m.debit > 0;
  return `<tr>
    <td>${UI.escapeHtml(m.entry_date)}</td>
    <td>${UI.escapeHtml(m.description || '')}</td>
    <td class="muted">${TREASURY_REF_LABELS[m.ref_type] || m.ref_type}</td>
    <td>${m.account_code === '1010' ? 'نقدية' : 'بنك'}</td>
    <td class="muted">${UI.escapeHtml(m.branch_name || '-')}</td>
    <td style="color:${isIn ? 'var(--success)' : 'var(--danger)'}">${isIn ? '+' : '-'} ${UI.money(isIn ? m.debit : m.credit)}</td>
  </tr>`;
}

Pages.treasuryHome = async function () {
  UI.setContent('<div class="empty-state">جارِ التحميل...</div>');
  await renderTreasury();
};

async function renderTreasury(from, to, allBranches) {
  const qs = [];
  if (from) qs.push(`from=${encodeURIComponent(from)}`);
  if (to) qs.push(`to=${encodeURIComponent(to)}`);
  if (allBranches) qs.push('allBranches=1');
  const data = await Api.get(`/treasury${qs.length ? '?' + qs.join('&') : ''}`);

  UI.setContent(`
    <div class="card">
      <div class="card-header"><h2>🏦 الخزنة الرئيسية</h2></div>
      <p class="muted" style="font-size:13px">نظرة سريعة على رصيد الكاش والبنك الحالي، وسجل يومي بكل حركة دخلت أو خرجت
        من الخزنة عبر كل العمليات (مبيعات، مشتريات، سندات، مصروفات) في مكان واحد.</p>
      <div class="grid cols-3">
        <div class="stat-card"><div class="label">رصيد النقدية</div><div class="value">${UI.money(data.cash)}</div></div>
        <div class="stat-card"><div class="label">رصيد البنك</div><div class="value">${UI.money(data.bank)}</div></div>
        <div class="stat-card"><div class="label">الإجمالي</div><div class="value">${UI.money(data.total)}</div></div>
      </div>
    </div>

    ${
      data.byBranch && data.byBranch.length > 0
        ? `<div class="card">
            <div class="card-header"><h3>الرصيد حسب الفرع</h3></div>
            <div class="table-wrap"><table><thead><tr><th>الفرع</th><th>نقدية</th><th>بنك</th><th>الإجمالي</th></tr></thead><tbody>
              ${data.byBranch
                .map(
                  (b) => `<tr>
                  <td>${UI.escapeHtml(b.branch_name)}</td>
                  <td>${UI.money(b.cash)}</td>
                  <td>${UI.money(b.bank)}</td>
                  <td><strong>${UI.money(b.cash + b.bank)}</strong></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>
          </div>`
        : ''
    }

    <div class="card">
      <div class="card-header"><h3>سجل حركة الخزنة</h3></div>
      <div class="form-grid" style="margin-bottom:12px">
        <div class="field"><label>من تاريخ</label><input type="date" id="trFrom" value="${from || ''}" /></div>
        <div class="field"><label>إلى تاريخ</label><input type="date" id="trTo" value="${to || ''}" /></div>
        <div class="field" style="flex-direction:row; align-items:center; gap:8px">
          <input type="checkbox" id="trAllBranches" style="width:auto" ${allBranches ? 'checked' : ''} />
          <label for="trAllBranches" style="margin:0">كل الفروع مع بعض</label>
        </div>
        <div class="field"><button class="btn secondary small" id="trFilterBtn" style="margin-top:20px">تصفية</button></div>
      </div>
      ${
        data.movements.length === 0
          ? '<div class="empty-state">لا توجد حركات في هذه الفترة</div>'
          : `<div class="table-wrap"><table><thead><tr>
              <th>التاريخ</th><th>البيان</th><th>النوع</th><th>الحساب</th><th>الفرع</th><th>المبلغ</th>
            </tr></thead><tbody>
              ${data.movements.map(treasuryMovementRowHtml).join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.getElementById('trFilterBtn').addEventListener('click', () => {
    renderTreasury(
      document.getElementById('trFrom').value,
      document.getElementById('trTo').value,
      document.getElementById('trAllBranches').checked
    );
  });
}

window.Pages = Pages;
