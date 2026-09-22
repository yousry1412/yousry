var Pages = window.Pages || {};

Pages.dashboard = async function () {
  const [d, lowStock, openTrips] = await Promise.all([
    Api.get('/dashboard'),
    Api.get('/reports/inventory-valuation'),
    Api.get('/trips'),
  ]);

  const lowStockRows = lowStock.rows.filter((r) => r.low_stock);
  const openTripsRows = openTrips.filter((t) => t.status === 'open');

  UI.setContent(`
    <div class="grid cols-4">
      <div class="stat-card ${d.totalCashAndBank >= 0 ? 'pos' : 'neg'}">
        <div class="label">الخزينة (نقدية + بنك)</div>
        <div class="value">${UI.money(d.totalCashAndBank)}</div>
        <div class="sub">نقدية ${UI.money(d.cash)} · بنك ${UI.money(d.bank)}</div>
      </div>
      <div class="stat-card">
        <div class="label">مستحق على العملاء</div>
        <div class="value">${UI.money(d.receivables)}</div>
      </div>
      <div class="stat-card">
        <div class="label">مستحق للموردين</div>
        <div class="value">${UI.money(d.payables)}</div>
      </div>
      <div class="stat-card">
        <div class="label">قيمة المخزون</div>
        <div class="value">${UI.money(d.inventoryValue)}</div>
      </div>
      <div class="stat-card">
        <div class="label">مبيعات اليوم</div>
        <div class="value">${UI.money(d.todaySales)}</div>
      </div>
      <div class="stat-card">
        <div class="label">مبيعات الشهر</div>
        <div class="value">${UI.money(d.monthSales)}</div>
      </div>
      <div class="stat-card ${d.monthNetProfit >= 0 ? 'pos' : 'neg'}">
        <div class="label">صافي ربح الشهر</div>
        <div class="value">${UI.money(d.monthNetProfit)}</div>
      </div>
      <div class="stat-card ${d.lowStockCount > 0 ? 'neg' : ''}">
        <div class="label">أصناف تحت حد الطلب</div>
        <div class="value">${d.lowStockCount}</div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-header"><h3>رحلات مفتوحة (لسه مقفلتش)</h3><a class="btn small secondary" href="#/trips">كل الرحلات</a></div>
        ${
          openTripsRows.length === 0
            ? '<div class="empty-state">لا يوجد رحلات مفتوحة حاليًا</div>'
            : `<div class="table-wrap"><table><thead><tr><th>الرحلة</th><th>السيارة</th><th>التاريخ</th><th></th></tr></thead><tbody>
                ${openTripsRows
                  .map(
                    (t) => `<tr>
                    <td>${UI.escapeHtml(t.trip_no)}</td>
                    <td>${UI.escapeHtml(t.vehicle_name)}</td>
                    <td>${UI.escapeHtml(t.trip_date)}</td>
                    <td><a class="link-btn" href="#/trips/${t.id}">فتح</a></td>
                  </tr>`
                  )
                  .join('')}
              </tbody></table></div>`
        }
      </div>

      <div class="card">
        <div class="card-header"><h3>أصناف قاربت على النفاد</h3><a class="btn small secondary" href="#/products">كل المنتجات</a></div>
        ${
          lowStockRows.length === 0
            ? '<div class="empty-state">كل الأصناف فوق حد إعادة الطلب</div>'
            : `<div class="table-wrap"><table><thead><tr><th>المنتج</th><th>المتاح</th><th>حد الطلب</th></tr></thead><tbody>
                ${lowStockRows
                  .map(
                    (p) => `<tr>
                    <td><a href="#/products/${p.id}">${UI.escapeHtml(p.name)}</a></td>
                    <td>${UI.num(p.qty_on_hand)} ${UI.escapeHtml(p.unit)}</td>
                    <td>${UI.num(p.reorder_level)}</td>
                  </tr>`
                  )
                  .join('')}
              </tbody></table></div>`
        }
      </div>
    </div>
  `);
};

window.Pages = Pages;
