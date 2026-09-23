const { db } = require('./db');

function getConfig(companyId) {
  return db.prepare('SELECT * FROM map_config WHERE company_id = ?').get(companyId);
}

function saveConfig(companyId, { google_maps_api_key }) {
  const existing = getConfig(companyId);
  if (existing) {
    db.prepare('UPDATE map_config SET google_maps_api_key = ?, updated_at = datetime(\'now\') WHERE company_id = ?').run(
      google_maps_api_key || null,
      companyId
    );
  } else {
    db.prepare('INSERT INTO map_config (company_id, google_maps_api_key, updated_at) VALUES (?, ?, datetime(\'now\'))').run(
      companyId,
      google_maps_api_key || null
    );
  }
  return getConfig(companyId);
}

/** رابط جوجل مابس قابل للفتح مباشرة لموقع معين - بيشتغل حتى من غير مفتاح API */
function mapsLink(latitude, longitude) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

module.exports = { getConfig, saveConfig, mapsLink };
