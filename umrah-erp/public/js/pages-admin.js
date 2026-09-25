/* Umrah ERP — team accounts (online mode, owner only) */
(function () {
  'use strict';
  const App = window.App, h = App.h, esc = h.esc;
  const ROLES = ['OWNER', 'MANAGER', 'HEAD', 'SALES', 'OPERATIONS'];
  const HINT = { OWNER: 'كل الصلاحيات + إدارة المستخدمين', MANAGER: 'خصم حتى 7% · قفل الأسعار والتسكين · تسعير إداري', HEAD: 'خصم حتى 3%', SALES: 'بدون خصم — أي خصم يحتاج اعتماد', OPERATIONS: 'تسكين وباص وجوازات وتقارير' };
  let users = null;

  async function load() {
    const r = await fetch('api/users');
    users = r.ok ? await r.json() : [];
    if (App.ui.page === 'users') App.render();
  }
  const roleSelect = (id, cur) => `<select class="input" id="${id}">${ROLES.map((r) => `<option value="${r}" ${r === cur ? 'selected' : ''}>${esc(App.ROLE_LABEL[r])}</option>`).join('')}</select>`;

  App.pages.users = () => {
    if (!App.online || !App.me || App.me.role !== 'OWNER') return '<div class="card">هذه الصفحة للمالك فقط.</div>';
    if (!users) { load(); return '<div class="card muted">جارِ التحميل…</div>'; }
    return `
    <div class="page-head"><div><h2>👥 المستخدمون والصلاحيات</h2><p>كل موظف يدخل بحسابه — صلاحية الخصم والاعتماد مربوطة بدوره تلقائياً ولا يمكن تغييرها من الشاشة.</p></div></div>
    <div class="grid g-side">
      <div class="card"><div class="tbl-wrap"><table class="t"><thead><tr><th>المستخدم</th><th>الاسم</th><th>الدور</th><th>نشط</th><th>كلمة سر جديدة</th><th></th></tr></thead><tbody>
        ${users.map((u) => `<tr><td class="num">${esc(u.username)}</td><td><input class="input" id="un-${u.id}" value="${esc(u.display_name)}"></td>
          <td>${roleSelect('ur-' + u.id, u.role)}</td><td><input type="checkbox" id="ua-${u.id}" ${u.is_active ? 'checked' : ''}></td>
          <td><input class="input" id="up-${u.id}" type="password" placeholder="اتركها فارغة" style="direction:ltr"></td>
          <td><button class="btn sm primary" data-act="saveUser" data-id="${u.id}">حفظ</button></td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card"><h3>+ إضافة مستخدم</h3>
        <div class="field"><label>اسم المستخدم (للدخول)</label><input class="input" id="nu-user" style="direction:ltr"></div>
        <div class="field" style="margin-top:8px"><label>الاسم الظاهر</label><input class="input" id="nu-name"></div>
        <div class="field" style="margin-top:8px"><label>كلمة السر (8+)</label><input class="input" id="nu-pass" type="password" style="direction:ltr"></div>
        <div class="field" style="margin-top:8px"><label>الدور</label>${roleSelect('nu-role', 'SALES')}</div>
        <button class="btn primary" style="margin-top:12px" data-act="addUser">إضافة</button>
        <div class="small muted" style="margin-top:12px">${ROLES.map((r) => `<div><b>${esc(App.ROLE_LABEL[r])}:</b> ${esc(HINT[r])}</div>`).join('')}</div>
      </div>
    </div>`;
  };
  async function send(url, method, body) {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { App.toast(d.error || 'تعذر', 'err'); return false; }
    return true;
  }
  App.actions.addUser = async () => {
    if (await send('api/users', 'POST', { username: App.val('nu-user'), display_name: App.val('nu-name'), password: App.val('nu-pass'), role: App.val('nu-role') })) {
      App.toast('✅ تمت إضافة المستخدم'); load();
    }
  };
  App.actions.saveUser = async (d) => {
    const id = d.id, body = { display_name: App.val('un-' + id), role: App.val('ur-' + id), is_active: App.val('ua-' + id) };
    const pw = App.val('up-' + id); if (pw) body.password = pw;
    if (await send('api/users/' + id, 'PATCH', body)) { App.toast('✅ تم الحفظ'); load(); }
  };
})();
