var Pages = window.Pages || {};

function dashCan(group) {
  const user = Auth.getUser();
  return !!(user && ROLE_GROUPS[group] && ROLE_GROUPS[group].includes(user.role));
}

// شارة حالة: لون + أيقونة + نص دايمًا مع بعض - اللون لوحده مش كفاية يوصّل المعنى
function dashStatus(kind, icon, text) {
  return `<span class="kpi-status ${kind}"><span aria-hidden="true">${icon}</span>${text}</span>`;
}

function dashChip(label, amountHtml) {
  return `<span class="kpi-chip"><span class="kpi-chip-label">${label}</span>${amountHtml}</span>`;
}

// كارت مؤشر: بيبقى رابط لصفحته لو المستخدم عنده صلاحيتها، غير كده كارت عرض بس
function dashKpi({ icon, label, value, foot = '', status = '', href, group }) {
  const tag = href && dashCan(group) ? 'a' : 'div';
  const hrefAttr = tag === 'a' ? ` href="${href}"` : '';
  return `<${tag} class="kpi${tag === 'a' ? ' kpi-link' : ''}"${hrefAttr}>
    <div class="kpi-head">
      <span class="kpi-icon" aria-hidden="true">${icon}</span>
      <span class="kpi-label">${label}</span>
      ${status}
    </div>
    <div class="kpi-value">${value}</div>
    ${foot ? `<div class="kpi-foot">${foot}</div>` : ''}
  </${tag}>`;
}

function dashEmpty(icon, title, sub, action = '') {
  return `<div class="dash-empty">
    <div class="dash-empty-icon" aria-hidden="true">${icon}</div>
    <div class="dash-empty-title">${title}</div>
    <div class="dash-empty-sub">${sub}</div>
    ${action}
  </div>`;
}

function dashQuickActions() {
  const actions = [
    { href: '#/sales/new', label: 'فاتورة بيع', icon: '🧾', group: 'SALES_G' },
    { href: '#/trips/new', label: 'بدء رحلة توزيع', icon: '🚚', group: 'ALL' },
    { href: '#/vouchers/new', label: 'سند قبض / صرف', icon: '🧮', group: 'FIN' },
    { href: '#/production/new', label: 'أمر تصنيع جديد', icon: '🏭', group: 'WH_G' },
  ].filter((a) => dashCan(a.group));
  if (!actions.length) return '';
  return `<nav class="quick-actions" aria-label="إجراءات سريعة">
    <span class="quick-actions-title">إجراءات سريعة</span>
    ${actions
      .map((a) => `<a class="quick-action" href="${a.href}"><span class="qa-plus" aria-hidden="true">+</span><span aria-hidden="true">${a.icon}</span>${a.label}</a>`)
      .join('')}
  </nav>`;
}

function dashTripsPanel(trips) {
  const header = `<div class="card-header"><h3>رحلات جارية (قيد التنفيذ)</h3><a class="btn small secondary" href="#/trips">كل الرحلات</a></div>`;
  if (!trips.length) {
    return `<div class="card dash-panel">${header}${dashEmpty(
      '🚚',
      'لا توجد رحلات توزيع قيد التنفيذ حاليًا',
      'تظهر هنا الرحلات فور بدئها لمتابعة البضاعة المحمّلة والمتبقي للتسليم.',
      dashCan('ALL') ? '<a class="btn small" href="#/trips/new">+ بدء رحلة توزيع</a>' : ''
    )}</div>`;
  }
  return `<div class="card dash-panel">${header}
    <div class="table-wrap"><table class="dash-table"><thead><tr>
      <th>رقم الرحلة</th><th>المندوب</th><th>السيارة</th><th>إجمالي المحمّل</th><th>المتبقي للتسليم</th><th></th>
    </tr></thead><tbody>
      ${trips
        .map((t) => {
          const delivered = t.loaded_value > 0 ? Math.min(100, Math.max(0, ((t.loaded_value - t.remaining_value) / t.loaded_value) * 100)) : 0;
          return `<tr>
          <td class="nowrap"><a href="#/trips/${t.id}">${UI.escapeHtml(t.trip_no)}</a><div class="muted small-note">${UI.escapeHtml(t.trip_date)}</div></td>
          <td>${UI.escapeHtml(t.responsible_employee_name || '-')}</td>
          <td>${UI.escapeHtml(t.vehicle_name)}</td>
          <td class="nowrap">${UI.moneyHtml(t.loaded_value)}</td>
          <td class="nowrap">
            ${UI.moneyHtml(t.remaining_value)}
            <div class="trip-meter" title="تم تسليم ${UI.num(delivered, 0)}٪"><span style="width:${delivered.toFixed(1)}%"></span></div>
          </td>
          <td class="nowrap"><a class="btn small" href="#/trips/${t.id}">إنهاء وتسوية</a></td>
        </tr>`;
        })
        .join('')}
    </tbody></table></div>
  </div>`;
}

function dashLowStockPanel(rows) {
  const header = `<div class="card-header"><h3>أصناف قاربت على النفاد</h3><a class="btn small secondary" href="#/products">كل المنتجات</a></div>`;
  if (!rows.length) {
    return `<div class="card dash-panel">${header}${dashEmpty(
      '✅',
      'جميع الأصناف أعلى من حد إعادة الطلب',
      'لا يوجد إجراء شراء مطلوب حاليًا.'
    )}</div>`;
  }
  const canBuy = dashCan('WH_G');
  return `<div class="card dash-panel">${header}
    <div class="table-wrap"><table class="dash-table"><thead><tr>
      <th>اسم الصنف</th><th>الرصيد الحالي</th><th>حد الطلب</th>${canBuy ? '<th></th>' : ''}
    </tr></thead><tbody>
      ${rows
        .map((p) => {
          const shortfall = Math.round((p.reorder_level - p.qty_on_hand) * 100) / 100;
          const buyHref = `#/purchases/new?product=${p.id}${shortfall > 0 ? `&qty=${shortfall}` : ''}`;
          return `<tr>
          <td><a href="#/products/${p.id}">${UI.escapeHtml(p.name)}</a>${p.sku ? `<div class="muted small-note" dir="ltr">${UI.escapeHtml(p.sku)}</div>` : ''}</td>
          <td class="nowrap"><span class="stock-low">${UI.num(p.qty_on_hand)} ${UI.escapeHtml(p.unit)}</span></td>
          <td class="nowrap">${UI.num(p.reorder_level)} ${UI.escapeHtml(p.unit)}</td>
          ${canBuy ? `<td class="nowrap"><a class="btn small secondary" href="${buyHref}">+ طلب شراء</a></td>` : ''}
        </tr>`;
        })
        .join('')}
    </tbody></table></div>
  </div>`;
}

Pages.dashboard = async function () {
  // الشريك عنده صلاحية عرض التقارير المالية الملخّصة بس - مش تفاصيل تشغيلية زي
  // المخزون التفصيلي أو الرحلات، فبنجيب له أرقام لوحة التحكم بس من غير الأقسام التشغيلية
  const isPartner = Auth.getUser() && Auth.getUser().role === 'partner';
  const [d, lowStock, openTrips] = isPartner
    ? [await Api.get('/dashboard'), { rows: [] }, []]
    : await Promise.all([Api.get('/dashboard'), Api.get('/reports/inventory-valuation'), Api.get('/dashboard/open-trips')]);

  const lowStockRows = lowStock.rows.filter((r) => r.low_stock);
  const custodyTotal = (d.custodyGoods || 0) + (d.custodyCash || 0);

  const kpis = [
    // المركز المالي
    dashKpi({
      icon: '🏦', label: 'الخزينة (نقدية + بنك)', value: UI.moneyHtml(d.totalCashAndBank), href: '#/treasury', group: 'PARTNER_G',
      status: d.totalCashAndBank < 0 ? dashStatus('bad', '▼', 'عجز') : '',
      foot: `<div class="kpi-chips">${dashChip('نقدية', UI.moneyHtml(d.cash))}${dashChip('بنك', UI.moneyHtml(d.bank))}</div>`,
    }),
    dashKpi({ icon: '👥', label: 'مستحق على العملاء', value: UI.moneyHtml(d.receivables), href: '#/customers', group: 'SALES_G' }),
    dashKpi({ icon: '🏢', label: 'مستحق للموردين', value: UI.moneyHtml(d.payables), href: '#/suppliers', group: 'WH_G' }),
    dashKpi({ icon: '📦', label: 'قيمة المخزون', value: UI.moneyHtml(d.inventoryValue), href: '#/warehouses', group: 'WH_G', foot: 'شامل البضاعة في عهدة السيارات' }),
    // الأداء
    dashKpi({ icon: '🧾', label: 'مبيعات اليوم', value: UI.moneyHtml(d.todaySales), href: '#/sales', group: 'SALES_G' }),
    dashKpi({ icon: '📈', label: 'مبيعات الشهر', value: UI.moneyHtml(d.monthSales), href: '#/sales', group: 'SALES_G' }),
    dashKpi({
      icon: '💰', label: 'صافي ربح الشهر', value: UI.moneyHtml(d.monthNetProfit), href: '#/accounting', group: 'PARTNER_G',
      status: d.monthNetProfit >= 0 ? dashStatus('good', '▲', 'ربح') : dashStatus('bad', '▼', 'خسارة'),
    }),
    dashKpi({
      icon: '💸', label: 'المصروفات التشغيلية (الشهر)', value: UI.moneyHtml(d.monthExpenses), href: '#/expenses', group: 'FIN',
      foot: `<div class="kpi-chips">${dashChip('اليوم', UI.moneyHtml(d.todayExpenses))}</div>`,
    }),
    // التشغيل
    dashKpi({
      icon: '🚚', label: 'رحلات جارية', value: `<span class="kpi-count">${UI.num(d.openTrips, 0)}</span>`, href: '#/trips', group: 'ALL',
      status: d.openTrips > 0 ? dashStatus('info', '●', 'قيد التنفيذ') : '',
      foot: d.openTrips > 0 ? 'رحلات توزيع لم تُسوَّ بعد' : 'لا توجد رحلات مفتوحة',
    }),
    dashKpi({
      icon: '🧳', label: 'عهدة المناديب المعلقة', value: UI.moneyHtml(custodyTotal), href: '#/warehouses', group: 'WH_G',
      foot: `<div class="kpi-chips">${dashChip('بضاعة', UI.moneyHtml(d.custodyGoods))}${dashChip('نقدية', UI.moneyHtml(d.custodyCash))}</div>`,
    }),
    dashKpi({
      icon: '🏭', label: 'أوامر التصنيع (الشهر)', value: `<span class="kpi-count">${UI.num(d.monthProductionOrders, 0)}</span>`, href: '#/production', group: 'WH_G',
      foot: `أوامر منفّذة · اليوم: ${UI.num(d.todayProductionOrders, 0)}`,
    }),
    dashKpi({
      icon: '⚠️', label: 'أصناف تحت حد الطلب', value: `<span class="kpi-count">${UI.num(d.lowStockCount, 0)}</span>`, href: '#/products', group: 'ALL',
      status: d.lowStockCount > 0 ? dashStatus('warn', '⚠', 'إعادة طلب') : dashStatus('good', '✓', 'مستقر'),
    }),
  ];

  UI.setContent(`
    <div class="dash">
      ${isPartner ? '' : dashQuickActions()}
      <section class="kpi-grid" aria-label="مؤشرات الأداء">${kpis.join('')}</section>
      ${isPartner ? '' : `<div class="dash-panels">${dashTripsPanel(openTrips)}${dashLowStockPanel(lowStockRows)}</div>`}
    </div>
  `);
};

window.Pages = Pages;
