const { db } = require('./db');

const GRAPH_VERSION = 'v20.0';

function getConfig(companyId) {
  return db.prepare('SELECT * FROM whatsapp_config WHERE company_id = ?').get(companyId);
}

function saveConfig(companyId, { access_token, phone_number_id, template_name, template_lang, default_country_code }) {
  const existing = getConfig(companyId);
  if (access_token === '••••••••') access_token = undefined; // القيمة المُقنّعة اللي بترجع من الواجهة، متغيرتش فعليًا
  if (existing) {
    db.prepare(
      `UPDATE whatsapp_config SET access_token = ?, phone_number_id = ?, template_name = ?, template_lang = ?,
       default_country_code = ?, updated_at = datetime('now') WHERE company_id = ?`
    ).run(
      access_token ?? existing.access_token,
      phone_number_id ?? existing.phone_number_id,
      template_name || existing.template_name,
      template_lang || existing.template_lang,
      default_country_code || existing.default_country_code,
      companyId
    );
  } else {
    db.prepare(
      `INSERT INTO whatsapp_config (company_id, access_token, phone_number_id, template_name, template_lang, default_country_code, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      companyId,
      access_token || null,
      phone_number_id || null,
      template_name || 'invoice_notification',
      template_lang || 'ar',
      default_country_code || '20'
    );
  }
  return getConfig(companyId);
}

/** يحوّل رقم محلي (زي 01012345678) لصيغة دولية بدون + عشان واتساب كلاود API */
function normalizePhone(phone, defaultCountryCode) {
  let digits = String(phone || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = (defaultCountryCode || '20') + digits.slice(1);
  if (!digits.startsWith(defaultCountryCode || '20') && digits.length <= 11) {
    digits = (defaultCountryCode || '20') + digits;
  }
  return digits;
}

async function callGraphApi({ accessToken, phoneNumberId, body }) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || `فشل الاتصال بواتساب (HTTP ${res.status})`;
    const err = new Error(message);
    err.details = data;
    throw err;
  }
  return data;
}

/** إرسال رسالة قالب معتمدة من ميتا (اللازمة للرسائل اللي الشركة بتبدأها) */
async function sendTemplateMessage({ accessToken, phoneNumberId, to, templateName, lang, params }) {
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang || 'ar' },
      components: [
        {
          type: 'body',
          parameters: (params || []).map((p) => ({ type: 'text', text: String(p) })),
        },
      ],
    },
  };
  return callGraphApi({ accessToken, phoneNumberId, body });
}

/** رسالة نصية حرة (تشتغل بس خلال 24 ساعة من آخر رسالة من العميل - مفيدة للاختبار) */
async function sendTextMessage({ accessToken, phoneNumberId, to, text }) {
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: text },
  };
  return callGraphApi({ accessToken, phoneNumberId, body });
}

function logAttempt({ company_id, sales_invoice_id, to_phone, status, message_id, error }) {
  db.prepare(
    `INSERT INTO whatsapp_log (company_id, sales_invoice_id, to_phone, status, message_id, error)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(company_id, sales_invoice_id || null, to_phone, status, message_id || null, error || null);
}

/** إرسال إشعار فاتورة للعميل عن طريق القالب المعتمد */
async function sendInvoiceNotification({ companyId, invoice, customerPhone }) {
  const config = getConfig(companyId);
  // بنسجّل أي محاولة إرسال حتى لو فشلت قبل ما توصل لواتساب فعليًا (إعدادات ناقصة، مفيش رقم)
  // عشان صاحب المنشأة يشوف في سجل واتساب إن الفاتورة "متبعتش" وليه، مش يفضل مستني في الفاضي.
  if (!config || !config.access_token || !config.phone_number_id) {
    const message = 'إعدادات واتساب غير مكتملة لهذه المنشأة. أدخل التوكن ورقم الهاتف من صفحة إعدادات واتساب';
    logAttempt({ company_id: companyId, sales_invoice_id: invoice.id, to_phone: customerPhone || '-', status: 'failed', error: message });
    throw new Error(message);
  }
  if (!customerPhone) {
    const message = 'لا يوجد رقم هاتف مسجّل لهذا العميل';
    logAttempt({ company_id: companyId, sales_invoice_id: invoice.id, to_phone: '-', status: 'failed', error: message });
    throw new Error(message);
  }

  const to = normalizePhone(customerPhone, config.default_country_code);
  const link = invoice.company_public_url
    ? `${invoice.company_public_url.replace(/\/$/, '')}/#/print/sale/${invoice.id}`
    : `#/print/sale/${invoice.id}`;
  const params = [invoice.customer_name, invoice.invoice_no, invoice.total.toFixed(2), link];

  try {
    const result = await sendTemplateMessage({
      accessToken: config.access_token,
      phoneNumberId: config.phone_number_id,
      to,
      templateName: config.template_name,
      lang: config.template_lang,
      params,
    });
    const messageId = result?.messages?.[0]?.id;
    logAttempt({ company_id: companyId, sales_invoice_id: invoice.id, to_phone: to, status: 'sent', message_id: messageId });
    return { ok: true, messageId };
  } catch (err) {
    logAttempt({ company_id: companyId, sales_invoice_id: invoice.id, to_phone: to, status: 'failed', error: err.message });
    throw err;
  }
}

async function sendTestMessage({ companyId, phone, text }) {
  const config = getConfig(companyId);
  if (!config || !config.access_token || !config.phone_number_id) {
    throw new Error('إعدادات واتساب غير مكتملة لهذه المنشأة');
  }
  const to = normalizePhone(phone, config.default_country_code);
  try {
    const result = await sendTextMessage({
      accessToken: config.access_token,
      phoneNumberId: config.phone_number_id,
      to,
      text: text || 'رسالة اختبار من نظام إدارة التوزيع ✅',
    });
    const messageId = result?.messages?.[0]?.id;
    logAttempt({ company_id: companyId, to_phone: to, status: 'sent', message_id: messageId });
    return { ok: true, messageId };
  } catch (err) {
    logAttempt({ company_id: companyId, to_phone: to, status: 'failed', error: err.message });
    throw err;
  }
}

module.exports = { getConfig, saveConfig, sendInvoiceNotification, sendTestMessage, normalizePhone };
