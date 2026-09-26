/* =====================================================================
 * أفواج — offline mode (works in the browser and in Node for tests)
 *  - IndexedDB copy of each company document: `base` = last version the
 *    server confirmed, `local` = the device's copy with unsent changes
 *  - merge3(base, local, remote): replays what changed on this device on top
 *    of what others saved meanwhile. Records with an `id` are merged one by
 *    one, append-only lists (audit, logs) keep both sides, money counters
 *    (balance/paid/number counters) add both deltas, other conflicts keep
 *    the server's value. New codes that collide get the next free number.
 * ===================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Offline = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  function eq(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false; return true; }
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !eq(a[k], b[k])) return false;
    return true;
  }
  const DELTA_KEYS = new Set(['balance', 'paid']); // amounts both sides may move at the same time
  const idList = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every((x) => isObj(x) && (typeof x.id === 'string' || typeof x.id === 'number'));
  const key = (x) => JSON.stringify(x);

  function merge3(base, local, remote) {
    const conflicts = [];
    function m(b, l, r, path) {
      if (eq(l, b)) return r;
      if (eq(r, b) || eq(l, r)) return l;
      const k = path[path.length - 1];
      if (typeof l === 'number' && typeof r === 'number' && typeof b === 'number' && (DELTA_KEYS.has(k) || path[0] === 'counters')) return Math.round((r + (l - b)) * 100) / 100;
      if (isObj(l) && isObj(r)) {
        const bo = isObj(b) ? b : {}, out = {};
        for (const kk of new Set([...Object.keys(r), ...Object.keys(l)])) {
          const inL = Object.prototype.hasOwnProperty.call(l, kk), inR = Object.prototype.hasOwnProperty.call(r, kk), inB = Object.prototype.hasOwnProperty.call(bo, kk);
          if (inL && inR) out[kk] = m(bo[kk], l[kk], r[kk], [...path, kk]);
          else if (inR) { if (!(inB && eq(r[kk], bo[kk]))) out[kk] = r[kk]; } // deleted here: keep only if the server changed it
          else if (!(inB && eq(l[kk], bo[kk]))) out[kk] = l[kk]; // deleted on the server: keep only if changed here
        }
        return out;
      }
      if (Array.isArray(l) && Array.isArray(r)) {
        const ba = Array.isArray(b) ? b : [];
        if ((idList(l) || !l.length) && (idList(r) || !r.length) && (idList(ba) || !ba.length) && (l.length || r.length)) {
          const bm = new Map(ba.map((x) => [x.id, x])), lm = new Map(l.map((x) => [x.id, x])), rm = new Map(r.map((x) => [x.id, x])), out = [];
          for (const x of r) {
            if (lm.has(x.id)) out.push(m(bm.get(x.id), lm.get(x.id), x, [...path, '#']));
            else if (!bm.has(x.id) || !eq(x, bm.get(x.id))) out.push(x); // new on the server, or deleted here but changed there
          }
          const fresh = l.filter((x) => !rm.has(x.id) && (!bm.has(x.id) || !eq(x, bm.get(x.id))));
          // local newcomers go where the device put them: the front for newest-first lists, else the end
          const front = fresh.length && l[0] && fresh[0].id === l[0].id && (!ba.length || l[0].id !== ba[0].id) && r.length && l.length > 1;
          return front ? [...fresh, ...out] : [...out, ...fresh];
        }
        // lists without ids (audit, logs, seat numbers…): keep the server list, drop what this device removed, add what it added
        const bs = new Set(ba.map(key)), ls = new Set(l.map(key)), rs = new Set(r.map(key));
        const kept = r.filter((x) => !(bs.has(key(x)) && !ls.has(key(x))));
        const added = l.filter((x) => !bs.has(key(x)) && !rs.has(key(x)));
        const front = added.length && l.length && !bs.has(key(l[0]));
        return front ? [...added, ...kept] : [...kept, ...added];
      }
      conflicts.push(path.join('.'));
      return r; // true conflict on a single value → the version already on the server wins
    }
    const doc = m(base, local, remote, []);
    return { doc, conflicts };
  }

  /** Codes/numbers created on this device that the server already used meanwhile → renumber the local ones. */
  function fixDuplicateCodes(doc, base) {
    const baseIds = new Set(), fixed = [], max = new Map();
    const parse = (c) => { const mm = /^(.*?)(\d+)$/.exec(c); return mm ? { p: mm[1], n: Number(mm[2]), w: mm[2].length } : null; };
    (function scan(x) { if (Array.isArray(x)) x.forEach(scan); else if (isObj(x)) { for (const f of ['code', 'no']) if (typeof x[f] === 'string') { const q = parse(x[f]); if (q) max.set(q.p, Math.max(max.get(q.p) || 0, q.n)); } Object.values(x).forEach(scan); } })(doc);
    const nextNo = (old) => { const q = parse(old); if (!q) return null; const n = (max.get(q.p) || 0) + 1; max.set(q.p, n); return q.p + String(n).padStart(q.w, '0'); };
    (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (isObj(x)) { if (x.id != null) baseIds.add(x.id); Object.values(x).forEach(walk); } })(base);
    (function walk(x) {
      if (Array.isArray(x)) {
        for (const f of ['code', 'no']) {
          const seen = new Map();
          for (const it of x) if (isObj(it) && typeof it[f] === 'string') { if (!seen.has(it[f])) seen.set(it[f], []); seen.get(it[f]).push(it); }
          for (const [, list] of seen) if (list.length > 1) for (const it of list.filter((y) => !baseIds.has(y.id)).slice(list.every((y) => !baseIds.has(y.id)) ? 1 : 0)) {
            const old = it[f], n = nextNo(old); if (n && n !== old) { it[f] = n; fixed.push(`${old} → ${n}`); }
          }
        }
        x.forEach(walk);
      } else if (isObj(x)) Object.values(x).forEach(walk);
    })(doc);
    return fixed;
  }

  // ------------------------------------------------------------ IndexedDB (browser only)
  const DB = 'afwaj-offline', STORE = 'docs';
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function get(k) { try { const d = await db(); return await new Promise((res, rej) => { const q = d.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); } catch (e) { return null; } }
  async function put(k, v) { try { const d = await db(); await new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; } catch (e) { return false; } }
  const docKey = (companyId, userId) => `doc:${companyId}:${userId}`;
  /** Confirmed server copy (after every load/save). Clears the local copy when `clearLocal`. */
  async function saveBase(companyId, userId, json, version, clearLocal) {
    const cur = (await get(docKey(companyId, userId))) || {};
    return put(docKey(companyId, userId), { ...cur, base: json, baseVersion: version, local: clearLocal ? null : cur.local || null, at: Date.now() });
  }
  async function saveLocal(companyId, userId, json) {
    const cur = (await get(docKey(companyId, userId))) || {};
    return put(docKey(companyId, userId), { ...cur, local: json, localAt: Date.now() });
  }
  const load = (companyId, userId) => get(docKey(companyId, userId));

  return { eq, merge3, fixDuplicateCodes, saveBase, saveLocal, load, get, put };
});
