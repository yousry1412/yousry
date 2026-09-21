const API = '/api';

const state = {
  sales: [],
  expenses: [],
  offers: [],
  decisions: [],
  insights: null,
};

const CATEGORY_LABELS = {
  ingredients: 'المستلزمات والمواد الخام',
  salaries: 'الرواتب والأجور',
  rent: 'الإيجار',
  utilities: 'المرافق',
  marketing: 'التسويق',
  other: 'أخرى',
};

const DECISION_CATEGORY_LABELS = {
  pricing: 'تسعير',
  menu: 'قائمة الطعام',
  staffing: 'العمالة والتوظيف',
  marketing: 'تسويق',
  operations: 'تشغيل',
  other: 'أخرى',
};

function money(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 0 }).format(n) + ' ج.م';
}

function pct(n) {
  if (n === null || n === undefined) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n}%`;
}

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'حدث خطأ غير متوقع');
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadAll() {
  const [sales, expenses, offers, decisions, insights] = await Promise.all([
    api('/sales'),
    api('/expenses'),
    api('/offers'),
    api('/decisions'),
    api('/insights'),
  ]);
  state.sales = sales;
  state.expenses = expenses;
  state.offers = offers;
  state.decisions = decisions;
  state.insights = insights;
  renderAll();
}

function renderAll() {
  renderKpis();
  renderRevenueChart();
  renderExpenseChart();
  renderRecommendations();
  renderSalesTable();
  renderExpensesTable();
  renderOffers();
  renderDecisions();
}

/* ---------------- KPIs ---------------- */

function renderKpis() {
  const k = state.insights.kpis;
  const tiles = [
    { label: 'إجمالي الإيرادات', value: money(k.totalRevenue) },
    { label: 'إجمالي المصروفات', value: money(k.totalExpenses) },
    { label: 'صافي الربح', value: money(k.netProfit) },
    { label: 'هامش الربح', value: k.profitMargin !== null ? `${k.profitMargin}%` : '—' },
    { label: 'متوسط قيمة الطلب', value: money(k.avgOrderValue) },
    {
      label: 'اتجاه آخر 7 أيام',
      value: k.weeklyTrendPercent !== null ? pct(k.weeklyTrendPercent) : '—',
      delta: k.weeklyTrendPercent,
    },
  ];
  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = tiles
    .map(
      (t) => `
    <div class="kpi-tile">
      <div class="kpi-label">${t.label}</div>
      <div class="kpi-value">${t.value}</div>
      ${t.delta !== undefined && t.delta !== null ? `<div class="kpi-delta ${t.delta >= 0 ? 'good' : 'bad'}">${t.delta >= 0 ? '▲' : '▼'} مقارنة بالأسبوع السابق</div>` : ''}
    </div>`
    )
    .join('');
}

/* ---------------- Charts (custom SVG) ---------------- */

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function renderRevenueChart() {
  const host = document.getElementById('revenue-chart');
  host.innerHTML = '';
  const data = state.insights.trend;
  if (!data || data.length === 0) {
    host.innerHTML = '<div class="empty-state">مفيش بيانات مبيعات لسه. ضيف مبيعات من تبويب "المبيعات".</div>';
    return;
  }

  const width = 560;
  const height = 220;
  const padding = { top: 16, right: 16, bottom: 28, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = data.map((d) => d.revenue);
  const maxV = Math.max(...values, 1);
  const minV = Math.min(0, Math.min(...values));

  const x = (i) => padding.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v) => padding.top + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'اتجاه المبيعات اليومية' });

  // gridlines
  const gridColor = getVar('--gridline');
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = minV + ((maxV - minV) * i) / steps;
    const gy = y(v);
    svg.appendChild(svgEl('line', { x1: padding.left, x2: width - padding.right, y1: gy, y2: gy, stroke: gridColor, 'stroke-width': 1 }));
    const label = svgEl('text', { x: padding.left - 8, y: gy + 4, 'text-anchor': 'end', 'font-size': 10, fill: getVar('--text-muted') });
    label.textContent = Math.round(v).toLocaleString('en-US');
    svg.appendChild(label);
  }

  // line path
  const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.revenue)}`).join(' ');
  svg.appendChild(svgEl('path', { d: pathD, fill: 'none', stroke: getVar('--series-blue'), 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

  // x labels (first, middle, last)
  [0, Math.floor((data.length - 1) / 2), data.length - 1].forEach((i) => {
    const label = svgEl('text', { x: x(i), y: height - 6, 'text-anchor': 'middle', 'font-size': 10, fill: getVar('--text-muted') });
    label.textContent = shortDate(data[i].date);
    svg.appendChild(label);
  });

  // hover layer
  const hoverLine = svgEl('line', { y1: padding.top, y2: padding.top + innerH, stroke: getVar('--baseline'), 'stroke-width': 1, opacity: 0 });
  svg.appendChild(hoverLine);

  const hoverDot = svgEl('circle', { r: 4, fill: getVar('--series-blue'), stroke: getVar('--surface-1'), 'stroke-width': 2, opacity: 0 });
  svg.appendChild(hoverDot);

  const overlay = svgEl('rect', { x: padding.left, y: padding.top, width: innerW, height: innerH, fill: 'transparent' });
  svg.appendChild(overlay);

  host.appendChild(svg);

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  host.style.position = 'relative';
  host.appendChild(tooltip);

  overlay.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    let idx = Math.round(((mouseX - padding.left) / innerW) * (data.length - 1));
    idx = Math.max(0, Math.min(data.length - 1, idx));
    const point = data[idx];
    hoverLine.setAttribute('x1', x(idx));
    hoverLine.setAttribute('x2', x(idx));
    hoverLine.setAttribute('opacity', 1);
    hoverDot.setAttribute('cx', x(idx));
    hoverDot.setAttribute('cy', y(point.revenue));
    hoverDot.setAttribute('opacity', 1);

    const scaleXInv = rect.width / width;
    tooltip.style.left = `${x(idx) * scaleXInv}px`;
    tooltip.style.top = `${y(point.revenue) * (rect.height / height)}px`;
    tooltip.style.opacity = 1;
    tooltip.textContent = `${point.date} · ${money(point.revenue)}`;
  });
  overlay.addEventListener('mouseleave', () => {
    hoverLine.setAttribute('opacity', 0);
    hoverDot.setAttribute('opacity', 0);
    tooltip.style.opacity = 0;
  });
}

function renderExpenseChart() {
  const host = document.getElementById('expense-chart');
  host.innerHTML = '';
  const data = [...state.insights.expenseBreakdown].sort((a, b) => b.total - a.total);
  if (!data || data.length === 0) {
    host.innerHTML = '<div class="empty-state">مفيش بيانات مصروفات لسه. ضيف مصروفات من تبويب "المصروفات".</div>';
    return;
  }

  const colorMap = {
    ingredients: '--series-blue',
    salaries: '--series-orange',
    rent: '--series-aqua',
    utilities: '--series-yellow',
    marketing: '--series-magenta',
    other: '--series-violet',
  };
  const maxV = Math.max(...data.map((d) => d.total), 1);

  const rows = data
    .map((d) => {
      const pctW = Math.max((d.total / maxV) * 100, 2);
      const color = `var(${colorMap[d.category] || '--series-violet'})`;
      return `
      <div class="hbar-row">
        <div class="hbar-label" title="${escapeHtml(d.label)}">${escapeHtml(d.label)}</div>
        <div class="hbar-track">
          <div class="hbar-fill" style="width:${pctW}%; background:${color}"></div>
        </div>
        <div class="hbar-value">${money(d.total)}</div>
      </div>`;
    })
    .join('');

  host.innerHTML = `<div class="hbar-chart" role="img" aria-label="توزيع المصروفات حسب البند">${rows}</div>`;
}

function getVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function shortDate(iso) {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/* ---------------- Recommendations ---------------- */

const REC_ICON = { good: '✅', warning: '⚠️', bad: '⛔', info: 'ℹ️' };

function renderRecommendations() {
  const list = document.getElementById('recommendations');
  const recs = state.insights.recommendations;
  list.innerHTML = recs
    .map(
      (r) => `<li class="rec-item ${r.level}"><span class="rec-icon">${REC_ICON[r.level] || 'ℹ️'}</span><span>${escapeHtml(r.text)}</span></li>`
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------------- Sales & Expenses tables ---------------- */

function renderSalesTable() {
  const tbody = document.querySelector('#table-sales tbody');
  const rows = [...state.sales].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا توجد بيانات بعد</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
      <td>${r.date}</td>
      <td>${money(r.revenue)}</td>
      <td>${r.ordersCount ?? '—'}</td>
      <td class="notes-cell">${escapeHtml(r.notes || '')}</td>
      <td><button class="btn btn-small" data-delete="sales" data-id="${r.id}">حذف</button></td>
    </tr>`
    )
    .join('');
}

function renderExpensesTable() {
  const tbody = document.querySelector('#table-expenses tbody');
  const rows = [...state.expenses].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">لا توجد بيانات بعد</td></tr>';
    return;
  }
  tbody.innerHTML = rows
    .map(
      (r) => `<tr>
      <td>${r.date}</td>
      <td>${CATEGORY_LABELS[r.category] || r.category}</td>
      <td>${money(r.amount)}</td>
      <td class="notes-cell">${escapeHtml(r.notes || '')}</td>
      <td><button class="btn btn-small" data-delete="expenses" data-id="${r.id}">حذف</button></td>
    </tr>`
    )
    .join('');
}

/* ---------------- Offers & Decisions ---------------- */

function badge(verdictLevel, verdictText) {
  const level = verdictLevel === 'unknown' ? 'neutral' : verdictLevel;
  return `<span class="badge ${level}">${escapeHtml(verdictText)}</span>`;
}

function renderOffers() {
  const host = document.getElementById('offers-list');
  const evaluated = state.insights.offers;
  if (evaluated.length === 0) {
    host.innerHTML = '<div class="empty-state">لا توجد عروض مسجلة بعد</div>';
    return;
  }
  host.innerHTML = [...evaluated]
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
    .map(
      (o) => `
    <div class="entity-card">
      <div class="entity-head">
        <div>
          <div class="entity-title">${escapeHtml(o.name)} ${o.isActive ? '<span class="badge neutral">شغال حاليًا</span>' : ''}</div>
          <div class="entity-meta">${o.startDate} → ${o.endDate || 'مستمر'} ${o.target ? '· ' + escapeHtml(o.target) : ''}</div>
        </div>
        <div class="entity-actions">
          ${badge(o.verdictLevel, o.verdict)}
          <button class="btn btn-small" data-delete="offers" data-id="${o.id}">حذف</button>
        </div>
      </div>
      <div class="entity-stats">
        <div class="entity-stat">متوسط المبيعات قبل العرض<b>${money(o.baselineAvgRevenue)}</b></div>
        <div class="entity-stat">متوسط المبيعات أثناء العرض<b>${money(o.duringAvgRevenue)}</b></div>
        <div class="entity-stat">نسبة التغيير<b>${pct(o.liftPercent)}</b></div>
      </div>
      ${o.description ? `<div class="entity-meta" style="margin-top:8px">${escapeHtml(o.description)}</div>` : ''}
    </div>`
    )
    .join('');
}

function renderDecisions() {
  const host = document.getElementById('decisions-list');
  const evaluated = state.insights.decisions;
  if (evaluated.length === 0) {
    host.innerHTML = '<div class="empty-state">لا توجد قرارات مسجلة بعد</div>';
    return;
  }
  host.innerHTML = [...evaluated]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(
      (d) => `
    <div class="entity-card">
      <div class="entity-head">
        <div>
          <div class="entity-title">${escapeHtml(d.title)}</div>
          <div class="entity-meta">${d.date} · ${DECISION_CATEGORY_LABELS[d.category] || d.category}</div>
        </div>
        <div class="entity-actions">
          ${badge(d.verdictLevel, d.verdict)}
          <button class="btn btn-small" data-delete="decisions" data-id="${d.id}">حذف</button>
        </div>
      </div>
      <div class="entity-stats">
        <div class="entity-stat">متوسط المبيعات قبل القرار<b>${money(d.beforeAvgRevenue)}</b></div>
        <div class="entity-stat">متوسط المبيعات بعد القرار<b>${money(d.afterAvgRevenue)}</b></div>
        <div class="entity-stat">نسبة التأثير<b>${pct(d.impactPercent)}</b></div>
      </div>
      ${d.reason ? `<div class="entity-meta" style="margin-top:8px"><b>السبب:</b> ${escapeHtml(d.reason)}</div>` : ''}
      ${d.expectedOutcome ? `<div class="entity-meta"><b>المتوقع:</b> ${escapeHtml(d.expectedOutcome)}</div>` : ''}
    </div>`
    )
    .join('');
}

/* ---------------- Forms & events ---------------- */

function formToObject(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  ['revenue', 'ordersCount', 'amount', 'discountPercent'].forEach((k) => {
    if (data[k] !== undefined && data[k] !== '') data[k] = Number(data[k]);
    else if (data[k] === '') delete data[k];
  });
  Object.keys(data).forEach((k) => {
    if (data[k] === '') delete data[k];
  });
  return data;
}

function wireForm(formId, collection) {
  const form = document.getElementById(formId);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api(`/${collection}`, { method: 'POST', body: JSON.stringify(formToObject(form)) });
      form.reset();
      await loadAll();
    } catch (err) {
      alert(err.message);
    }
  });
}

function wireDeleteButtons() {
  document.body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    if (!confirm('متأكد إنك عايز تحذف العنصر ده؟')) return;
    await api(`/${btn.dataset.delete}/${btn.dataset.id}`, { method: 'DELETE' });
    await loadAll();
  });
}

function wireTabs() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

function wireTopActions() {
  document.getElementById('btn-seed').addEventListener('click', async () => {
    if (!confirm('هيتم استبدال كل البيانات الحالية ببيانات تجريبية. تكمل؟')) return;
    await api('/seed', { method: 'POST' });
    await loadAll();
  });
  document.getElementById('btn-reset').addEventListener('click', async () => {
    if (!confirm('هيتم حذف كل البيانات نهائيًا. متأكد؟')) return;
    await api('/reset', { method: 'POST' });
    await loadAll();
  });
}

function init() {
  wireTabs();
  wireTopActions();
  wireDeleteButtons();
  wireForm('form-sales', 'sales');
  wireForm('form-expenses', 'expenses');
  wireForm('form-offers', 'offers');
  wireForm('form-decisions', 'decisions');
  loadAll().catch((err) => alert(err.message));
}

document.addEventListener('DOMContentLoaded', init);
