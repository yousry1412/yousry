var Pages = window.Pages || {};

Pages.categoriesList = async function () {
  const [categories, products] = await Promise.all([Api.get('/product-categories'), Api.get('/products')]);
  const countByCategory = {};
  products.forEach((p) => {
    if (p.category_id) countByCategory[p.category_id] = (countByCategory[p.category_id] || 0) + 1;
  });

  UI.setContent(`
    <div class="card">
      <div class="card-header">
        <h2>تصنيفات المنتجات</h2>
        <button class="btn" id="addCategoryBtn2">+ تصنيف جديد</button>
      </div>
      <p class="muted" style="font-size:13px">تصنيفات بتساعدك ترتّب المنتجات في مجموعات (زي "دواجن"، "مواد خام"، "معلبات") - تقدر تختارها عند إضافة أو تعديل أي منتج.</p>
      ${
        categories.length === 0
          ? '<div class="empty-state">لا توجد تصنيفات بعد</div>'
          : `<div class="table-wrap"><table><thead><tr><th>اسم التصنيف</th><th>عدد المنتجات</th><th></th></tr></thead><tbody>
              ${categories
                .map(
                  (c) => `<tr>
                  <td>${UI.escapeHtml(c.name)}</td>
                  <td>${countByCategory[c.id] || 0}</td>
                  <td><button class="link-btn" data-edit="${c.id}">تعديل</button></td>
                </tr>`
                )
                .join('')}
            </tbody></table></div>`
      }
    </div>
  `);

  document.getElementById('addCategoryBtn2').addEventListener('click', () => openCategoryModal(null, Pages.categoriesList));
  document.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const c = categories.find((x) => x.id === Number(btn.dataset.edit));
      openCategoryModal(c, Pages.categoriesList);
    })
  );
};

window.Pages = Pages;
