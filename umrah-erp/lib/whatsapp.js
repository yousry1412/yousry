/* =====================================================================
 * WhatsApp Business Cloud API (Meta) — per company, like the distribution app
 *  - config stays on the server (token never reaches browsers)
 *  - TEMPLATE mode: an approved template with ONE body variable {{1}} that
 *    carries the whole message (needed for business-initiated messages)
 *  - TEXT mode: free text (works inside the 24h customer-service window)
 *  - every attempt is logged (sent / failed + reason)
 * ===================================================================== */
const store = require('./store');
const GRAPH = 'v20.0';
store.db.exec(`CREATE TABLE IF NOT EXISTS wa_log (id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, to_phone TEXT, ref TEXT, status TEXT NOT NULL,
  message_id TEXT, error TEXT, by_name TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);

const key = (companyId) => 'wa:' + companyId;
const getConfig = (companyId) => store.kvGet(key(companyId)) || null;
function publicConfig(companyId) {
  const c = getConfig(companyId);
  return c ? { enabled: !!(c.token && c.phoneId), phoneId: c.phoneId || '', mode: c.mode || 'TEMPLATE', template: c.template || '', lang: c.lang || 'ar', dial: c.dial || '20', autoReceipt: !!c.autoReceipt, token: c.token ? '••••••••' : '' }
    : { enabled: false, phoneId: '', mode: 'TEMPLATE', template: 'afwaj_notification', lang: 'ar', dial: '20', autoReceipt: false, token: '' };
}
function saveConfig(companyId, b) {
  const cur = getConfig(companyId) || {};
  if (!b.phoneId && !b.token) { store.kvSet(key(companyId), { ...cur, token: '', phoneId: '' }); return publicConfig(companyId); } // disable
  const next = { token: b.token && b.token !== '••••••••' ? String(b.token).trim() : cur.token || '', phoneId: String(b.phoneId || '').trim(), mode: b.mode === 'TEXT' ? 'TEXT' : 'TEMPLATE',
    template: String(b.template || 'afwaj_notification').trim(), lang: String(b.lang || 'ar').trim(), dial: String(b.dial || '20').replace(/\D/g, '') || '20', autoReceipt: !!b.autoReceipt };
  store.kvSet(key(companyId), next);
  return publicConfig(companyId);
}
function normalizePhone(phone, dial) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = (dial || '20') + d.slice(1);
  else if (d.length <= 10) d = (dial || '20') + d;
  return d;
}
function log(companyId, row) {
  store.db.prepare('INSERT INTO wa_log (company_id, to_phone, ref, status, message_id, error, by_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(companyId, row.to || '-', row.ref || null, row.status, row.messageId || null, row.error || null, row.by || null);
}
const listLog = (companyId) => store.db.prepare('SELECT * FROM wa_log WHERE company_id = ? ORDER BY id DESC LIMIT 200').all(companyId);

async function send(companyId, { to, text, ref }, by) {
  const c = getConfig(companyId);
  if (!c || !c.token || !c.phoneId) { const error = 'واتساب بيزنس غير مفعّل — أدخل الإعدادات من صفحة الشركة'; log(companyId, { to, ref, status: 'failed', error, by }); throw new Error(error); }
  const phone = normalizePhone(to, c.dial);
  if (phone.length < 8) { const error = 'رقم هاتف غير صحيح'; log(companyId, { to, ref, status: 'failed', error, by }); throw new Error(error); }
  const msg = String(text || '').slice(0, 1000);
  const body = c.mode === 'TEXT' ? { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: msg } }
    // template variables may not contain new lines / tabs / 4+ spaces → flatten
    : { messaging_product: 'whatsapp', to: phone, type: 'template', template: { name: c.template, language: { code: c.lang || 'ar' }, components: [{ type: 'body', parameters: [{ type: 'text', text: msg.replace(/\s*\n+\s*/g, ' • ').replace(/\s{4,}/g, ' ') }] }] } };
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH}/${c.phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((data.error && data.error.message) || `HTTP ${r.status}`);
    const messageId = data.messages && data.messages[0] && data.messages[0].id;
    log(companyId, { to: phone, ref, status: 'sent', messageId, by });
    return { ok: true, messageId };
  } catch (e) {
    log(companyId, { to: phone, ref, status: 'failed', error: e.message, by });
    throw e;
  }
}
async function bulk(companyId, items, by) {
  const out = [];
  for (const it of items.slice(0, 300)) {
    try { await send(companyId, it, by); out.push({ ref: it.ref, ok: true }); } catch (e) { out.push({ ref: it.ref, ok: false, error: e.message }); }
    await new Promise((r) => setTimeout(r, 120)); // stay well below Cloud API rate limits
  }
  return out;
}
module.exports = { publicConfig, saveConfig, send, bulk, listLog, normalizePhone };
