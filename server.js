const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./lib/db');
const { buildInsights } = require('./lib/insights');
const { buildSeedData } = require('./lib/seed');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
// أفواج — Umrah & tourism ERP (standalone static module)
app.use('/umrah', express.static(path.join(__dirname, 'umrah-erp', 'public')));

const COLLECTIONS = ['sales', 'expenses', 'offers', 'decisions'];

const REQUIRED_FIELDS = {
  sales: ['date', 'revenue'],
  expenses: ['date', 'category', 'amount'],
  offers: ['name', 'startDate'],
  decisions: ['date', 'title'],
};

function validate(collection, body) {
  const required = REQUIRED_FIELDS[collection] || [];
  const missing = required.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  return missing;
}

COLLECTIONS.forEach((collection) => {
  app.get(`/api/${collection}`, (req, res) => {
    res.json(db.list(collection));
  });

  app.post(`/api/${collection}`, (req, res) => {
    const missing = validate(collection, req.body || {});
    if (missing.length > 0) {
      return res.status(400).json({ error: `الحقول التالية مطلوبة: ${missing.join(', ')}` });
    }
    const record = db.insert(collection, req.body);
    res.status(201).json(record);
  });

  app.put(`/api/${collection}/:id`, (req, res) => {
    const updated = db.update(collection, req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'العنصر غير موجود' });
    res.json(updated);
  });

  app.delete(`/api/${collection}/:id`, (req, res) => {
    const ok = db.remove(collection, req.params.id);
    if (!ok) return res.status(404).json({ error: 'العنصر غير موجود' });
    res.status(204).end();
  });
});

app.get('/api/insights', (req, res) => {
  const store = db.readStore();
  res.json(buildInsights(store));
});

app.post('/api/seed', (req, res) => {
  db.replaceAll(buildSeedData());
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  db.resetAll();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`لوحة تحكم المطعم شغالة على http://localhost:${PORT}`);
});
