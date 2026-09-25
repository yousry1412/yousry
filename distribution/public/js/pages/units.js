var Pages = window.Pages || {};

function unitsEditorHtml(product) {
  return `
    <table class="items-table" id="unitsTable-${product.id}">
      <thead><tr><th>اسم الوحدة</th><th>معامل التحويل (كام "${UI.escapeHtml(product.unit)}")</th><th></th></tr></thead>
      <tbody>
        ${product.units
          .map(
            (u) => `<tr>
            <td><input class="unit-name" value="${UI.escapeHtml(u.unit_name)}" /></td>
            <td><input class="unit-factor" type="number" step="0.0001" value="${u.factor}" /></td>
            <td><button type="button" class="remove-row">✕</button></td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
    <div style="margin-top:10px; display:flex; gap:8px;">
      <button class="btn secondary small" data-add-unit-row="${product.id}">+ إضافة وحدة</button>
      <button class="btn small" data-save-units="${product.id}">حفظ الوحدات</button>
    </div>
  `;
}

function wireUnitsEditor(product, onSaved) {
  const table = document.getElementById(`unitsTable-${product.id}`);
  const body = table.querySelector('tbody');
  function wireRemove(tr) {
    tr.querySelector('.remove-row').addEventListener('click', () => tr.remove());
  }
  body.querySelectorAll('tr').forEach(wireRemove);
  document.querySelector(`[data-add-unit-row="${product.id}"]`).addEventListener('click', () => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input class="unit-name" placeholder="مثال: كرتونة" /></td>
      <td><input class="unit-factor" type="number" step="0.0001" value="1" /></td>
      <td><button type="button" class="remove-row">✕</button></td>`;
    body.appendChild(tr);
    wireRemove(tr);
  });
  document.querySelector(`[data-save-units="${product.id}"]`).addEventListener('click', async () => {
    const items = [...body.querySelectorAll('tr')]
      .map((tr) => ({
        unit_name: tr.querySelector('.unit-name').value.trim(),
        factor: Number(tr.querySelector('.unit-factor').value),
      }))
      .filter((it) => it.unit_name);
    try {
      await Api.put(`/products/${product.id}/units`, { items });
      UI.toast('تم حفظ الوحدات', 'success');
      onSaved();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  });
}

Pages.unitsOverview = async function () {
  const products = await Api.get('/products');

  UI.setContent(`
    <div class="card">
      <div class="card-header"><h2>وحدات القياس ومعاملات التحويل</h2></div>
      <p class="muted" style="font-size:13px">كل منتج ليه وحدة أساسية (اللي بيتسجل بيها المخزون والتكلفة)، وتقدر تضيفله وحدة أو أكتر
        أكبر منها (زي كرتونة أو شيكارة) مع معامل تحويل (كام وحدة أساسية فيها) - هتظهر كخيار عند فواتير البيع والشراء.
        دوس على أي منتج تحت عشان تشوف وتعدّل وحداته.</p>
      ${
        products.length === 0
          ? '<div class="empty-state">لا توجد منتجات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr><th>المنتج</th><th>الوحدة الأساسية</th><th>الوحدات الإضافية</th><th></th></tr></thead><tbody>
              ${products
                .map(
                  (p) => `<tr>
                  <td>${UI.escapeHtml(p.name)}</td>
                  <td>${UI.escapeHtml(p.unit)}</td>
                  <td>${p.units.length === 0 ? '<span class="muted">بدون</span>' : p.units.map((u) => `${UI.escapeHtml(u.unit_name)} (${UI.num(u.factor)})`).join('، ')}</td>
                  <td><button class="link-btn" data-toggle="${p.id}">إدارة الوحدات</button></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
    <div id="unitsEditorPane"></div>
  `);

  document.querySelectorAll('[data-toggle]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const product = products.find((p) => p.id === Number(btn.dataset.toggle));
      const pane = document.getElementById('unitsEditorPane');
      pane.innerHTML = `
        <div class="card">
          <div class="card-header"><h3>وحدات "${UI.escapeHtml(product.name)}"</h3><button class="btn secondary small" id="closeUnitsEditor">إغلاق</button></div>
          ${unitsEditorHtml(product)}
        </div>
      `;
      pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
      wireUnitsEditor(product, Pages.unitsOverview);
      document.getElementById('closeUnitsEditor').addEventListener('click', () => { pane.innerHTML = ''; });
    })
  );
};

window.Pages = Pages;
