var Pages = window.Pages || {};

const WH_TABS = [
  { key: 'branches', label: 'المخازن الثابتة' },
  { key: 'vehicles', label: 'عهدة السيارات' },
  { key: 'expiry', label: 'تنبيهات الصلاحية' },
];

function operationExplainModal(kind, data) {
  const EXPLAIN = {
    low_stock: {
      title: 'تنبيه نقص مخزون',
      body: `الكمية المتاحة من "${UI.escapeHtml(data.name)}" (${UI.num(data.qty_on_hand)} ${UI.escapeHtml(data.unit)}) وصلت لحد إعادة الطلب المحدد (${UI.num(data.reorder_level)}) أو أقل منه. يفضّل تجهيز أمر شراء أو تصنيع جديد قبل نفاد الكمية تمامًا ووقف البيع منها.`,
    },
    mismatch: {
      title: 'انحراف رقابي في المخزون',
      body: `الكمية المسجّلة في رصيد "${UI.escapeHtml(data.product_name)}" بفرع "${UI.escapeHtml(data.branch_name)}" (${UI.num(data.stored_qty)}) لا تطابق مجموع حركات المخزون الفعلية المسجّلة لنفس الصنف (${UI.num(data.computed_qty)}). الفرق ${UI.num(data.diff)} ${UI.escapeHtml(data.product_unit)} - يستحق المراجعة فورًا (خطأ إدخال، حركة لم تُسجَّل، أو تلاعب) قبل ما يأثر على تقييم المخزون.`,
    },
    custody_item: {
      title: 'صنف في عهدة سيارة',
      body: `متبقي ${UI.num(data.remaining)} ${UI.escapeHtml(data.unit)} من "${UI.escapeHtml(data.product_name)}" في عهدة الرحلة المفتوحة حاليًا. قيمتها بالتكلفة ${UI.money(data.cost_value)}، وبسعر البيع ${UI.money(data.sale_value)} - المسؤول عن الرحلة ملتزم ببيعها أو إرجاعها للمخزن رسميًا.`,
    },
  };
  const info = EXPLAIN[kind];
  if (!info) return;
  UI.openModal(info.title, `<p>${info.body}</p><div class="modal-actions"><button class="btn secondary" type="button" onclick="UI.closeModal()">إغلاق</button></div>`);
}

async function renderBranchesTab(container) {
  const overview = await Api.get('/reports/warehouses');
  if (overview.length === 0) {
    container.innerHTML = '<div class="empty-state">لا توجد فروع/مخازن مسجّلة بعد</div>';
    return;
  }
  container.innerHTML = overview
    .map(
      (w) => `
    <div class="card">
      <div class="card-header">
        <h3>🏬 ${UI.escapeHtml(w.branch_name)}</h3>
        <div>${UI.badge(`${w.itemCount} صنف`, 'gray')} ${UI.badge(UI.money(w.totalValue), 'green')}
          ${w.lowStockItems.length > 0 ? UI.badge(`${w.lowStockItems.length} صنف ناقص`, 'orange') : ''}
          ${w.mismatches.length > 0 ? UI.badge(`${w.mismatches.length} انحراف رقابي`, 'red') : ''}
        </div>
      </div>
      ${
        w.items.length === 0
          ? '<div class="empty-state">لا يوجد رصيد حاليًا في هذا المخزن</div>'
          : `<div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الكمية</th><th>تكلفة الوحدة</th><th>القيمة</th><th></th></tr></thead><tbody>
              ${w.items
                .map(
                  (it) => `<tr class="${it.low_stock ? 'low-stock-row' : ''}">
                <td>${UI.escapeHtml(it.name)}</td>
                <td>${UI.num(it.qty_on_hand)} ${UI.escapeHtml(it.unit)}</td>
                <td>${UI.money(it.cost_price)}</td>
                <td>${UI.money(it.value)}</td>
                <td>${it.low_stock ? `<button type="button" class="link-btn" data-explain="low_stock" data-idx="${it.id}">📉 نقص</button>` : ''}</td>
              </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
      ${
        w.mismatches.length > 0
          ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th colspan="4" style="color:var(--danger)">⚠️ انحرافات رقابية تحتاج مراجعة</th></tr><tr><th>الصنف</th><th>المسجّل</th><th>المحسوب من الحركات</th><th></th></tr></thead><tbody>
              ${w.mismatches
                .map(
                  (m, i) => `<tr>
                <td>${UI.escapeHtml(m.product_name)}</td>
                <td>${UI.num(m.stored_qty)}</td>
                <td>${UI.num(m.computed_qty)}</td>
                <td><button type="button" class="link-btn" data-mismatch="${w.branch_id}-${i}">شرح</button></td>
              </tr>`
                )
                .join('')}
            </tbody></table></div>`
          : ''
      }
    </div>
  `
    )
    .join('');

  const mismatchMap = {};
  overview.forEach((w) => w.mismatches.forEach((m, i) => (mismatchMap[`${w.branch_id}-${i}`] = m)));
  const lowStockMap = {};
  overview.forEach((w) => w.lowStockItems.forEach((it) => (lowStockMap[it.id] = it)));

  container.querySelectorAll('[data-mismatch]').forEach((btn) =>
    btn.addEventListener('click', () => operationExplainModal('mismatch', mismatchMap[btn.dataset.mismatch]))
  );
  container.querySelectorAll('[data-explain="low_stock"]').forEach((btn) =>
    btn.addEventListener('click', () => operationExplainModal('low_stock', lowStockMap[Number(btn.dataset.idx)]))
  );
}

async function renderVehiclesCustodyTab(container) {
  const overview = await Api.get('/reports/vehicles-custody');
  if (overview.length === 0) {
    container.innerHTML = '<div class="empty-state">لا توجد سيارات مسجّلة بعد</div>';
    return;
  }
  container.innerHTML = overview
    .map(
      (v, vi) => `
    <div class="card">
      <div class="card-header">
        <h3>🚚 ${UI.escapeHtml(v.vehicle_name)} ${v.driver_name ? `<span class="muted" style="font-size:13px">(${UI.escapeHtml(v.driver_name)})</span>` : ''}</h3>
        ${
          v.open_trip
            ? `<a class="btn secondary small" href="#/trips/${v.open_trip.id}">${UI.badge(UI.escapeHtml(v.open_trip.trip_no), 'green')}</a>`
            : UI.badge('مفيش رحلة مفتوحة', 'gray')
        }
      </div>
      ${
        v.items.length === 0
          ? '<div class="empty-state">لا توجد عهدة بضاعة حاليًا على هذه السيارة</div>'
          : `<div class="table-wrap"><table><thead><tr><th>الصنف</th><th>المتبقي</th><th>قيمة بالتكلفة</th><th>قيمة بسعر البيع</th><th></th></tr></thead><tbody>
              ${v.items
                .map(
                  (it, ii) => `<tr>
                <td>${UI.escapeHtml(it.product_name)}</td>
                <td>${UI.num(it.remaining)} ${UI.escapeHtml(it.unit)}</td>
                <td>${UI.money(it.cost_value)}</td>
                <td>${UI.money(it.sale_value)}</td>
                <td><button type="button" class="link-btn" data-custody="${vi}-${ii}">شرح</button></td>
              </tr>`
                )
                .join('')}
            </tbody></table></div>
            <p class="muted" style="margin-top:8px">إجمالي العهدة: بالتكلفة ${UI.money(v.totalCostValue)} · بسعر البيع ${UI.money(v.totalSaleValue)}</p>`
      }
    </div>
  `
    )
    .join('');

  const itemMap = {};
  overview.forEach((v, vi) => v.items.forEach((it, ii) => (itemMap[`${vi}-${ii}`] = it)));
  container.querySelectorAll('[data-custody]').forEach((btn) =>
    btn.addEventListener('click', () => operationExplainModal('custody_item', itemMap[btn.dataset.custody]))
  );
}

async function renderExpiryTab(container) {
  const alerts = await Api.get('/reports/expiry-alerts?days=14');
  if (alerts.length === 0) {
    container.innerHTML = '<div class="empty-state">مفيش دفعات قربت أو انتهت صلاحيتها خلال الـ14 يوم الجايين 👍</div>';
    return;
  }
  container.innerHTML = `
    <div class="card">
      <div class="card-header"><h3>دفعات قربت أو انتهت صلاحيتها (خلال 14 يوم)</h3></div>
      <div class="table-wrap"><table><thead><tr><th>الصنف</th><th>المخزن</th><th>رقم الدفعة</th><th>تاريخ الصلاحية</th><th>الكمية المتبقية</th><th>الحالة</th></tr></thead><tbody>
        ${alerts
          .map(
            (a) => `<tr class="${a.is_expired ? 'low-stock-row' : ''}">
          <td>${UI.escapeHtml(a.product_name)}</td>
          <td>${UI.escapeHtml(a.branch_name)}</td>
          <td>${UI.escapeHtml(a.batch_no || '-')}</td>
          <td>${UI.escapeHtml(a.expiry_date)}</td>
          <td>${UI.num(a.qty_remaining)} ${UI.escapeHtml(a.product_unit)}</td>
          <td>${a.is_expired ? UI.badge('منتهية الصلاحية', 'red') : UI.badge('قربت تنتهي', 'orange')}</td>
        </tr>`
          )
          .join('')}
      </tbody></table></div>
    </div>
  `;
}

const WH_RENDERERS = { branches: renderBranchesTab, vehicles: renderVehiclesCustodyTab, expiry: renderExpiryTab };

Pages.warehousesHome = async function () {
  const activeTab = Pages._whActiveTab || 'branches';
  UI.setContent(`
    <div class="tabs">
      ${WH_TABS.map((t) => `<button class="tab-btn ${t.key === activeTab ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
    </div>
    <div id="whTabContent"><div class="empty-state">جارِ التحميل...</div></div>
  `);
  async function showTab(key) {
    Pages._whActiveTab = key;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
    const container = document.getElementById('whTabContent');
    container.innerHTML = '<div class="empty-state">جارِ التحميل...</div>';
    await WH_RENDERERS[key](container);
  }
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  await showTab(activeTab);
};

window.Pages = Pages;
