var Pages = window.Pages || {};

const MAP_TABS = [
  { key: 'sales', label: 'خريطة المبيعات' },
  { key: 'live', label: 'تتبع السائقين الآن' },
];

async function renderSalesMapTab(container) {
  async function load(from, to) {
    const qs = from && to ? `?from=${from}&to=${to}` : '';
    const rows = await Api.get('/reports/invoice-locations' + qs);
    const html = `
      <div class="form-grid" style="margin-bottom:14px">
        <div class="field"><label>من تاريخ</label><input type="date" id="salesMapFrom" /></div>
        <div class="field"><label>إلى تاريخ</label><input type="date" id="salesMapTo" value="${UI.todayStr()}" /></div>
        <div class="field" style="align-self:flex-end"><button class="btn secondary small" id="salesMapFilter">تصفية</button></div>
      </div>
      <div id="salesMapCanvas"><div class="empty-state">جارِ التحميل...</div></div>
      <p class="muted" style="font-size:13px; margin-top:8px">${rows.length} فاتورة عليها موقع مسجّل من إجمالي الفترة المحددة (الفواتير اللي اتسجلت من موبايل بدون GPS متاح مش بتظهر هنا).</p>
    `;
    return { html, rows };
  }
  async function bindFilter() {
    document.getElementById('salesMapFilter').addEventListener('click', async () => {
      const from = document.getElementById('salesMapFrom').value;
      const to = document.getElementById('salesMapTo').value;
      const { html, rows } = await load(from, to);
      container.innerHTML = html;
      renderCanvas(rows);
      bindFilter();
    });
  }
  function renderCanvas(rows) {
    const canvas = document.getElementById('salesMapCanvas');
    const points = rows.map((r) => ({
      lat: r.latitude,
      lng: r.longitude,
      title: r.invoice_no,
      info: `${r.customer_name} · ${UI.money(r.total)} · ${r.invoice_date}${r.trip_no ? ' · رحلة ' + r.trip_no : ''}`,
    }));
    UI.renderMap(canvas, points, { height: '420px' });
  }
  const { html, rows } = await load();
  container.innerHTML = html;
  renderCanvas(rows);
  bindFilter();
}

async function renderLiveTrackingTab(container) {
  const trips = await Api.get('/trips/live-locations');
  if (trips.length === 0) {
    container.innerHTML = '<div class="empty-state">لا توجد رحلات مفتوحة عليها مواقع GPS مسجّلة الآن</div>';
    return;
  }
  container.innerHTML = `
    <div id="liveMapCanvas"></div>
    <div class="table-wrap" style="margin-top:14px"><table><thead><tr>
      <th>الرحلة</th><th>السيارة</th><th>آخر تحديث</th><th></th>
    </tr></thead><tbody>
      ${trips
        .map(
          (t) => `<tr>
          <td><a href="#/trips/${t.id}">${UI.escapeHtml(t.trip_no)}</a></td>
          <td>${UI.escapeHtml(t.vehicle_name)}</td>
          <td class="muted">${UI.formatDateTime(t.recorded_at)}</td>
          <td><a class="link-btn" href="${UI.googleMapsLink(t.latitude, t.longitude)}" target="_blank" rel="noopener">فتح في خرائط جوجل</a></td>
        </tr>`
        )
        .join('')}
    </tbody></table></div>
  `;
  const points = trips.map((t) => ({ lat: t.latitude, lng: t.longitude, title: t.trip_no, info: `${t.vehicle_name} · ${UI.formatDateTime(t.recorded_at)}` }));
  UI.renderMap(document.getElementById('liveMapCanvas'), points, { height: '420px' });
}

const MAP_RENDERERS = { sales: renderSalesMapTab, live: renderLiveTrackingTab };

Pages.mapsHome = async function () {
  UI.setContent(`
    <div class="card">
      <div class="card-header"><h2>🗺️ الخريطة</h2></div>
      <div class="tabs" id="mapTabs">
        ${MAP_TABS.map((t, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}
      </div>
      <div id="mapTabContent"><div class="empty-state">جارِ التحميل...</div></div>
    </div>
  `);

  async function showTab(key) {
    document.querySelectorAll('#mapTabs .tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
    const content = document.getElementById('mapTabContent');
    content.innerHTML = '<div class="empty-state">جارِ التحميل...</div>';
    try {
      await MAP_RENDERERS[key](content);
    } catch (err) {
      content.innerHTML = `<p style="color:var(--danger)">${UI.escapeHtml(err.message)}</p>`;
    }
  }

  document.querySelectorAll('#mapTabs .tab-btn').forEach((btn) => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
  showTab('sales');
};

window.Pages = Pages;
