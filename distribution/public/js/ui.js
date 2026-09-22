const UI = (() => {
  function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  function money(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
  }

  function num(n, digits = 2) {
    const v = Number(n) || 0;
    return v.toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: digits });
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDateTime(s) {
    if (!s) return '';
    return s.replace('T', ' ').slice(0, 16);
  }

  function optionsHtml(list, valueKey, labelKey, selected) {
    return list
      .map((item) => {
        const v = item[valueKey];
        const sel = String(v) === String(selected) ? 'selected' : '';
        return `<option value="${escapeHtml(v)}" ${sel}>${escapeHtml(item[labelKey])}</option>`;
      })
      .join('');
  }

  function openModal(titleHtml, bodyHtml, opts = {}) {
    const overlay = document.getElementById('modalOverlay');
    const box = document.getElementById('modalBox');
    box.style.maxWidth = opts.wide ? '820px' : '640px';
    box.innerHTML = `<h3>${titleHtml}</h3>${bodyHtml}`;
    overlay.classList.add('open');
    return box;
  }

  function closeModal() {
    document.getElementById('modalOverlay').classList.remove('open');
    document.getElementById('modalBox').innerHTML = '';
  }

  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target.id === 'modalOverlay') closeModal();
  });

  async function confirmAction(message) {
    return window.confirm(message);
  }

  function badge(text, color) {
    return `<span class="badge ${color}">${escapeHtml(text)}</span>`;
  }

  function setContent(html) {
    document.getElementById('content').innerHTML = html;
  }

  return {
    toast,
    money,
    num,
    escapeHtml,
    todayStr,
    formatDateTime,
    optionsHtml,
    openModal,
    closeModal,
    confirmAction,
    badge,
    setContent,
  };
})();
