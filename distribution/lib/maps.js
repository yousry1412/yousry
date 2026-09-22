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

module.exports = { getConfig, saveConfig };
