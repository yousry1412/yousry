const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const EMPTY_STORE = {
  sales: [],
  expenses: [],
  offers: [],
  decisions: [],
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(EMPTY_STORE, null, 2));
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(STORE_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return { ...EMPTY_STORE, ...parsed };
  } catch {
    return { ...EMPTY_STORE };
  }
}

function writeStore(store) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
}

function id() {
  return crypto.randomUUID();
}

function list(collection) {
  const store = readStore();
  return store[collection] || [];
}

function get(collection, itemId) {
  return list(collection).find((item) => item.id === itemId) || null;
}

function insert(collection, data) {
  const store = readStore();
  const record = { id: id(), createdAt: new Date().toISOString(), ...data };
  store[collection] = [...(store[collection] || []), record];
  writeStore(store);
  return record;
}

function update(collection, itemId, data) {
  const store = readStore();
  let updated = null;
  store[collection] = (store[collection] || []).map((item) => {
    if (item.id === itemId) {
      updated = { ...item, ...data, id: itemId, updatedAt: new Date().toISOString() };
      return updated;
    }
    return item;
  });
  writeStore(store);
  return updated;
}

function remove(collection, itemId) {
  const store = readStore();
  const before = (store[collection] || []).length;
  store[collection] = (store[collection] || []).filter((item) => item.id !== itemId);
  writeStore(store);
  return before !== store[collection].length;
}

function replaceAll(newStore) {
  writeStore({ ...EMPTY_STORE, ...newStore });
}

function resetAll() {
  writeStore({ ...EMPTY_STORE });
}

module.exports = { list, get, insert, update, remove, replaceAll, resetAll, readStore };
